/**
 * Generate 256x256 research category icons via fal.ai image generation API.
 * Includes background removal (birefnet/v2) and trim+pad to 256x256.
 *
 * Produces 10 category icons for the research UI (TechCategory enum):
 *   HABITATION, FOOD, ENERGY, EXTRACTION, PRODUCTION,
 *   MANUFACTURING, TRANSPORTATION, COMMUNICATION, SECURITY, SATISFACTION
 *
 * Stil: flat 2D UI icon, NOT isometric (unlike artifact/module scripts).
 *
 * Usage: npx tsx scripts/generate-research-category-icons.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FAL_API_KEY =
  process.env['FAL_API_KEY'] ??
  fs
    .readFileSync(path.join(__dirname, '.env'), 'utf-8')
    .split('\n')
    .find((l) => l.startsWith('FAL_API_KEY='))
    ?.replace('FAL_API_KEY=', '')
    .trim() ??
  '';

if (!FAL_API_KEY) {
  console.error('FAL_API_KEY not found');
  process.exit(1);
}

// ── Output path ──
const OUT_DIR = path.resolve(__dirname, '../src/assets/research/categories');

// ── Style anchors ──
const BASE_STYLE =
  'flat 2D vector icon style, game UI category icon, clean silhouette, centered, isolated object, ' +
  'transparent background, no background, monochromatic with subtle gradient accent, minimalist design, ' +
  'easy to recognize at small sizes, suitable for UI button or badge, sci-fi aesthetic but simplified for icon use';

const NEGATIVE_PROMPT =
  'photorealistic, 3D render, isometric, complex textures, cartoon, anime, fantasy, text, logos, watermark, ' +
  'background, scene, ground, floor, dramatic lighting, excessive detail, multiple objects';

// ── Asset definitions ──

interface AssetDef {
  id: string; // filename stem, e.g. "cat_habitation"
  prompt: string; // specific prompt (BASE_STYLE appended automatically)
}

const ASSETS: AssetDef[] = [
  {
    id: 'cat_habitation',
    prompt:
      'habitation module icon, stylized habitat dome with small windows, residential space dwelling symbol, cozy but geometric',
  },
  {
    id: 'cat_food',
    prompt:
      'food production icon, stylized plant or crop with droplet, hydroponics symbol, growth and nutrition motif',
  },
  {
    id: 'cat_energy',
    prompt:
      'energy icon, stylized energy bolt or reactor core, power generation symbol, radiating energy waves',
  },
  {
    id: 'cat_extraction',
    prompt:
      'extraction icon, stylized pickaxe with mineral crystal, mining and resource gathering symbol, geometric ore shape',
  },
  {
    id: 'cat_production',
    prompt:
      'production icon, stylized industrial gear with smoke stack, manufacturing and processing symbol, mechanical and industrial',
  },
  {
    id: 'cat_manufacturing',
    prompt:
      'manufacturing icon, stylized wrench crossed with circuit board, module assembly symbol, tool and electronics fusion',
  },
  {
    id: 'cat_transportation',
    prompt:
      'transportation icon, stylized rocket with plasma trail, propulsion and movement symbol, directional motion',
  },
  {
    id: 'cat_communication',
    prompt:
      'communication icon, stylized antenna with concentric signal waves, data transmission symbol, broadcasting motif',
  },
  {
    id: 'cat_security',
    prompt:
      'security icon, stylized shield with star or bolt in center, protection and defense symbol, guardian motif',
  },
  {
    id: 'cat_satisfaction',
    prompt:
      'satisfaction icon, stylized heart or smiling face, happiness and recreation symbol, leisure motif',
  },
];

// ── fal.ai helpers ──

function httpsRequest(options: https.RequestOptions, body?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c: string) => {
        data += c;
      });
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
      mod
        .get(u, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            dl(res.headers.location as string);
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        })
        .on('error', reject);
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
    if (status.status === 'FAILED') throw new Error(`Generation failed: ${JSON.stringify(status)}`);
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

async function trimAndPad256(inputBuffer: Buffer): Promise<Buffer> {
  const trimmedPng = await sharp(inputBuffer).trim().png().toBuffer();

  const meta = await sharp(trimmedPng).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;

  const scale = Math.min(256 / width, 256 / height);
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);

  const resized = await sharp(trimmedPng)
    .resize(newWidth, newHeight, { fit: 'inside' })
    .png()
    .toBuffer();

  const resizedMeta = await sharp(resized).metadata();
  const rw = resizedMeta.width ?? newWidth;
  const rh = resizedMeta.height ?? newHeight;

  const padLeft = Math.floor((256 - rw) / 2);
  const padTop = Math.floor((256 - rh) / 2);

  return sharp(resized)
    .extend({
      top: padTop,
      bottom: 256 - rh - padTop,
      left: padLeft,
      right: 256 - rw - padLeft,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

function outPathFor(asset: AssetDef): string {
  return path.join(OUT_DIR, `${asset.id}.png`);
}

async function processAssetOnce(asset: AssetDef): Promise<void> {
  const outFile = outPathFor(asset);

  console.log(`    generating...`);
  const rawBuffer = await generateImage(asset.prompt);
  console.log(`    generated (${rawBuffer.length} bytes)`);

  console.log('    uploading for BG removal...');
  const falUrl = await uploadToFal(rawBuffer, `${asset.id}_raw.png`);

  console.log('    removing background...');
  const noBgBuffer = await removeBackground(falUrl);
  console.log(`    BG removed (${noBgBuffer.length} bytes)`);

  console.log('    trimming + padding to 256x256...');
  const finalBuffer = await trimAndPad256(noBgBuffer);

  fs.writeFileSync(outFile, finalBuffer);
  console.log(`    saved: ${outFile}`);
}

async function processAssetWithRetry(
  asset: AssetDef,
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

async function validateAsset(asset: AssetDef): Promise<string | null> {
  const outFile = outPathFor(asset);
  if (!fs.existsSync(outFile)) return 'file missing';

  const stat = fs.statSync(outFile);
  if (stat.size < 5 * 1024) return `file too small (${stat.size} bytes, expected > 5KB)`;

  const meta = await sharp(outFile).metadata();
  if (meta.width !== 256 || meta.height !== 256) {
    return `wrong size ${meta.width}x${meta.height} (expected 256x256)`;
  }
  if (!meta.hasAlpha) return 'no alpha channel';

  return null;
}

async function main(): Promise<void> {
  console.log('=== Research Category Icon Generation ===');
  console.log(`Output dir: ${OUT_DIR}`);
  console.log(`Assets: ${ASSETS.length}`);
  console.log('');

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const results: { asset: AssetDef; status: 'generated' | 'skipped' | 'failed' }[] = [];
  let consecutiveApiFailures = 0;

  for (let i = 0; i < ASSETS.length; i++) {
    const asset = ASSETS[i];
    console.log(`[${i + 1}/${ASSETS.length}] ${asset.id}`);

    const status = await processAssetWithRetry(asset);
    results.push({ asset, status });

    if (status === 'failed') {
      consecutiveApiFailures++;
      if (consecutiveApiFailures >= 5) {
        console.error(
          `\nAborting: ${consecutiveApiFailures} consecutive failures — possible API outage.`,
        );
        break;
      }
    } else {
      consecutiveApiFailures = 0;
    }

    console.log('');
  }

  // Validation pass
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

  // Summary
  const generated = results.filter((r) => r.status === 'generated').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  console.log('=== SUMMARY ===');
  console.log(`Generated: ${generated}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Failed:    ${failed}`);
  console.log(`Validation issues: ${validationIssues.length}`);
  console.log('');

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
