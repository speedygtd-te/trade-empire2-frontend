/**
 * Generate the FOOD resource icon (single asset).
 *
 * Pipeline (resource-icon variant — NO mipmaps, frontal icon style):
 *   1. Flux Dev 512x512 generation with negative prompt
 *   2. fal.ai birefnet/v2 background removal
 *   3. sharp trim + pad to 1:1 square
 *   4. Save as .webp (Q92, effort 6) in src/assets/resources/food/food_0.webp
 *
 * Differences vs. module/workforce pipelines:
 *   - NO isometric perspective — resources are frontal icon-style sprites
 *   - NO mipmap generation — resources only ship a single _0.webp
 *
 * Output: src/assets/resources/food/food_0.webp
 *
 * Usage: npx tsx scripts/generate-food-resource.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FAL_API_KEY = process.env['FAL_API_KEY']
  ?? fs.readFileSync(path.join(__dirname, '.env'), 'utf-8')
    .split('\n').find((l) => l.startsWith('FAL_API_KEY='))?.replace('FAL_API_KEY=', '').trim() ?? '';

if (!FAL_API_KEY) {
  console.error('FAL_API_KEY not found');
  process.exit(1);
}

// ── Output ──
const RESOURCES_DIR = path.resolve(__dirname, '../src/assets/resources');

// ── Style anchors (resource-icon-specific: frontal centered icon, not isometric) ──
const BASE_STYLE =
  'product icon, frontal centered composition, hi-tech sci-fi aesthetic, ' +
  'The Expanse-style realism, photorealistic materials, glossy packaging surfaces, ' +
  'single object group composition, transparent background, no scene, no ground, ' +
  'no shadow, lit from upper-left, soft studio lighting';

const NEGATIVE_PROMPT =
  'cartoon, anime, fantasy, magical glow, neon colors, steampunk, runes, glyphs, ' +
  'text, logos, watermark, background, scene, landscape, ground, floor, ' +
  'isometric building, architecture, structure, robot, character, person, ' +
  'multiple separate items spread apart, blurry, low quality';

// ── Asset definition ──
interface ResourceAsset {
  id: string;
  prompt: string;
}

const MODULES: ResourceAsset[] = [
  {
    id: 'food',
    prompt:
      'sci-fi sustenance and nutrition pack, mixed assortment of food items, ' +
      'synthetic protein blocks, hydroponic vegetables in clear containers, ' +
      'sealed ration containers, centered group composition, ' +
      'glossy hi-tech packaging, The Expanse-style hard sci-fi aesthetic, ' +
      'photorealistic, transparent background, lit from upper-left',
  },
];

// ── fal.ai helpers (mirrored from generate-batch-robots.ts) ──

function httpsRequest(options: https.RequestOptions, body?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c: string) => { data += c; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function httpsGet(url: string, headers: Record<string, string>): Promise<string> {
  const u = new URL(url);
  return httpsRequest({
    hostname: u.hostname,
    path: u.pathname + u.search,
    method: 'GET',
    headers,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function downloadBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const dl = (u: string): void => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          dl(res.headers.location as string);
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    };
    dl(url);
  });
}

async function generateImage(prompt: string): Promise<Buffer> {
  const fullPrompt = `${prompt}, ${BASE_STYLE}`;
  const submitBody = JSON.stringify({
    prompt: fullPrompt,
    negative_prompt: NEGATIVE_PROMPT,
    image_size: { width: 512, height: 512 },
    num_inference_steps: 28,
    guidance_scale: 7.5,
    num_images: 1,
    enable_safety_checker: false,
    output_format: 'png',
  });

  const submitRaw = await httpsRequest(
    {
      hostname: 'queue.fal.run',
      path: '/fal-ai/flux/dev',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
    },
    submitBody,
  );

  const submit = JSON.parse(submitRaw);
  if (!submit.status_url) {
    throw new Error(`Submit failed: ${submitRaw}`);
  }

  process.stdout.write('    waiting');
  for (let i = 0; i < 120; i++) {
    await sleep(2000);
    const status = JSON.parse(
      await httpsGet(submit.status_url, { Authorization: `Key ${FAL_API_KEY}` }),
    );
    if (status.status === 'COMPLETED') {
      const result = JSON.parse(
        await httpsGet(submit.response_url, { Authorization: `Key ${FAL_API_KEY}` }),
      );
      console.log(' done');
      return downloadBuffer(result.images[0].url as string);
    }
    if (status.status === 'FAILED') {
      throw new Error(`Generation failed: ${JSON.stringify(status)}`);
    }
    process.stdout.write('.');
  }
  throw new Error('Timeout waiting for generation');
}

async function uploadToFal(buffer: Buffer, fileName: string): Promise<string> {
  const initRaw = await httpsRequest(
    {
      hostname: 'rest.alpha.fal.ai',
      path: '/storage/upload/initiate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
    },
    JSON.stringify({ content_type: 'image/png', file_name: fileName }),
  );
  const init = JSON.parse(initRaw);

  const uploadUrl = new URL(init.upload_url);
  await new Promise<void>((resolve, reject) => {
    const req = https.request(
      {
        hostname: uploadUrl.hostname,
        path: uploadUrl.pathname + uploadUrl.search,
        method: 'PUT',
        headers: { 'Content-Type': 'image/png', 'Content-Length': buffer.length.toString() },
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve());
      },
    );
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });

  return init.file_url as string;
}

async function removeBackground(imageUrl: string): Promise<Buffer> {
  const raw = await httpsRequest(
    {
      hostname: 'fal.run',
      path: '/fal-ai/birefnet/v2',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
    },
    JSON.stringify({ image_url: imageUrl }),
  );
  const result = JSON.parse(raw);
  if (!result?.image?.url) {
    throw new Error(`Background removal failed: ${raw}`);
  }
  return downloadBuffer(result.image.url as string);
}

/**
 * Trim transparent pixels, then pad to 1:1 square (centering content).
 * No final resize — output is the natural size of the trimmed content.
 */
async function trimAndPadSquareWebp(inputBuffer: Buffer): Promise<Buffer> {
  const trimmedPng = await sharp(inputBuffer).trim().png().toBuffer();

  const meta = await sharp(trimmedPng).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;
  const size = Math.max(width, height);

  const padLeft = Math.floor((size - width) / 2);
  const padTop = Math.floor((size - height) / 2);

  return sharp(trimmedPng)
    .extend({
      top: padTop,
      bottom: size - height - padTop,
      left: padLeft,
      right: size - width - padLeft,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 92, effort: 6, smartSubsample: true })
    .toBuffer();
}

function outPathFor(asset: ResourceAsset): string {
  return path.join(RESOURCES_DIR, asset.id, `${asset.id}_0.webp`);
}

async function processAssetOnce(asset: ResourceAsset): Promise<void> {
  const outFile = outPathFor(asset);
  const outDir = path.dirname(outFile);
  fs.mkdirSync(outDir, { recursive: true });

  console.log('    generating...');
  const rawBuffer = await generateImage(asset.prompt);
  console.log(`    generated (${rawBuffer.length} bytes)`);

  console.log('    uploading for BG removal...');
  const falUrl = await uploadToFal(rawBuffer, `${asset.id}_raw.png`);

  console.log('    removing background...');
  const noBgBuffer = await removeBackground(falUrl);
  console.log(`    BG removed (${noBgBuffer.length} bytes)`);

  console.log('    trimming + padding to square webp...');
  const finalBuffer = await trimAndPadSquareWebp(noBgBuffer);

  fs.writeFileSync(outFile, finalBuffer);
  const finalMeta = await sharp(outFile).metadata();
  console.log(`    saved: ${outFile} (${finalMeta.width}x${finalMeta.height}, alpha=${finalMeta.hasAlpha})`);
}

async function processAssetWithRetry(
  asset: ResourceAsset,
  maxAttempts = 3,
): Promise<'generated' | 'skipped' | 'failed'> {
  const outFile = outPathFor(asset);

  if (fs.existsSync(outFile)) {
    console.log(`  SKIP ${asset.id} — already exists`);
    return 'skipped';
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`  ${asset.id} — attempt ${attempt}/${maxAttempts}`);
      await processAssetOnce(asset);
      return 'generated';
    } catch (err) {
      console.error(`    attempt ${attempt} FAILED: ${err}`);
      if (attempt < maxAttempts) {
        console.log('    retrying after 3s...');
        await sleep(3000);
      }
    }
  }

  return 'failed';
}

async function validateAsset(asset: ResourceAsset): Promise<string | null> {
  const outFile = outPathFor(asset);
  if (!fs.existsSync(outFile)) return 'file missing';

  const stat = fs.statSync(outFile);
  if (stat.size < 5 * 1024) return `file too small (${stat.size} bytes, expected > 5KB)`;

  const meta = await sharp(outFile).metadata();
  if (meta.format !== 'webp') return `wrong format ${meta.format} (expected webp)`;
  if (!meta.hasAlpha) return 'no alpha channel';
  if ((meta.width ?? 0) < 200 || (meta.height ?? 0) < 200) {
    return `too small ${meta.width}x${meta.height} (expected >= 200px)`;
  }
  if (meta.width !== meta.height) {
    return `not square ${meta.width}x${meta.height}`;
  }

  return null;
}

async function main(): Promise<void> {
  console.log('=== FOOD Resource Icon Generation ===');
  console.log(`Resources dir: ${RESOURCES_DIR}`);
  console.log(`Assets to process: ${MODULES.length}`);
  console.log('');

  const results: { asset: ResourceAsset; status: 'generated' | 'skipped' | 'failed' }[] = [];

  for (let i = 0; i < MODULES.length; i++) {
    const asset = MODULES[i];
    console.log(`[${i + 1}/${MODULES.length}] ${asset.id}`);
    const status = await processAssetWithRetry(asset);
    results.push({ asset, status });
    console.log('');
  }

  // Validation
  console.log('=== Validation ===');
  const validationIssues: { id: string; issue: string }[] = [];
  for (const { asset, status } of results) {
    if (status === 'failed') continue;
    const issue = await validateAsset(asset);
    if (issue) {
      validationIssues.push({ id: asset.id, issue });
      console.log(`  ${asset.id}: ${issue}`);
    } else {
      console.log(`  ${asset.id}: OK`);
    }
  }
  console.log('');

  // NOTE: Resources do NOT generate mipmaps — only a single _0.webp ships.

  // Summary
  const generated = results.filter((r) => r.status === 'generated').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  console.log('=== SUMMARY ===');
  console.log(`Generated: ${generated}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Failed:    ${failed}`);
  console.log(`Validation issues: ${validationIssues.length}`);

  if (failed > 0) {
    console.log('Failed assets:');
    for (const r of results) {
      if (r.status === 'failed') console.log(`  - ${r.asset.id}`);
    }
  }
  if (validationIssues.length > 0) {
    console.log('Validation issues:');
    for (const v of validationIssues) console.log(`  - ${v.id}: ${v.issue}`);
  }

  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
