/**
 * Generate workforce sprites for ROBOT_T1..ROBOT_T5.
 *
 * Pipeline (same style as generate-module-gap-fill.ts):
 *   1. Flux Dev 512x512 generation with negative prompt
 *   2. fal.ai birefnet/v2 background removal
 *   3. sharp trim + pad to 1:1 square
 *   4. Save as .webp (Q92, effort 6) in src/assets/workforce/<id>/<id>_0.webp
 *   5. Generate mipmap variants (@half, @quarter, @eighth) via generate-mipmaps.ts
 *
 * Output structure mirrors modules:
 *   src/assets/workforce/robot_t1/robot_t1_0.webp
 *   src/assets/workforce/robot_t1/robot_t1_0@half.webp
 *   src/assets/workforce/robot_t1/robot_t1_0@quarter.webp
 *   src/assets/workforce/robot_t1/robot_t1_0@eighth.webp
 *
 * Style references The Expanse sci-fi aesthetic per
 * feedback_asset_prompt_conventions.md — no traditional cartoon robots.
 *
 * Usage: npx tsx scripts/generate-batch-robots.ts
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
const WORKFORCE_DIR = path.resolve(__dirname, '../src/assets/workforce');

// ── Style anchors (workforce-specific: figure instead of building module) ──
const BASE_STYLE =
  'isometric game asset, single 3D figure, 30 degree camera angle from horizontal, ' +
  '2:1 isometric perspective, The Expanse sci-fi aesthetic, photorealistic textures, ' +
  'realistic worn industrial metal surfaces, transparent background, game sprite, centered, ' +
  'single object, no ground plane, no shadow, no walls, no enclosure, lit from upper-left';

const NEGATIVE_PROMPT =
  'cartoon, anime, fantasy, magical glow, bright neon colors, steampunk, dragons, runes, glyphs, ' +
  'text, logos, watermark, background, scene, landscape, ground, floor, multiple figures, crowd, ' +
  'toy robot, cute robot, mascot, chibi';

// ── Asset definitions ──
interface WorkforceAsset {
  id: string;
  prompt: string;
}

const ROBOTS: WorkforceAsset[] = [
  {
    id: 'robot_t1',
    prompt:
      'basic utility worker robot, simple mechanical chassis with exposed joints, single articulated arm, ' +
      'dull steel finish, industrial labor unit, no humanoid head, functional design, ' +
      'visible cables and hydraulics, low-tech early generation worker droid',
  },
  {
    id: 'robot_t2',
    prompt:
      'improved worker robot, dual-arm articulation, better-finished panels, small status LEDs, ' +
      'mid-tier industrial unit, mechanical torso on tracked or wheeled base, ' +
      'painted metal surfaces with hazard stripes, second generation worker droid',
  },
  {
    id: 'robot_t3',
    prompt:
      'advanced industrial robot, heavier reinforced frame, sensor array on head module, ' +
      'multi-joint manipulators, professional-grade build, dark grey armor plating, ' +
      'visible servo motors, third generation worker droid, semi-bipedal stance',
  },
  {
    id: 'robot_t4',
    prompt:
      'semi-humanoid worker, sleek exoskeleton elements, augmented vision module on faceplate, ' +
      'refined upright posture, high-tech composite material, two-tone grey and black armor, ' +
      'precision manipulator hands, fourth generation worker droid, integrated cooling vents',
  },
  {
    id: 'robot_t5',
    prompt:
      'high-tech humanoid worker, sophisticated synthetic build, sleek armor plating, ' +
      'AI sensor cluster as head, top-tier worker droid in The Expanse style, ' +
      'matte ceramic and polished metal surfaces, fully bipedal, advanced articulated limbs, ' +
      'fifth generation premium synthetic',
  },
];

// ── fal.ai helpers (mirrored from generate-module-gap-fill.ts) ──

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

function outPathFor(asset: WorkforceAsset): string {
  return path.join(WORKFORCE_DIR, asset.id, `${asset.id}_0.webp`);
}

async function processAssetOnce(asset: WorkforceAsset): Promise<void> {
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
  asset: WorkforceAsset,
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

async function validateAsset(asset: WorkforceAsset): Promise<string | null> {
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
  console.log('=== Workforce Robot Sprite Generation ===');
  console.log(`Workforce dir: ${WORKFORCE_DIR}`);
  console.log(`Assets to process: ${ROBOTS.length}`);
  console.log('');

  const results: { asset: WorkforceAsset; status: 'generated' | 'skipped' | 'failed' }[] = [];

  for (let i = 0; i < ROBOTS.length; i++) {
    const asset = ROBOTS[i];
    console.log(`[${i + 1}/${ROBOTS.length}] ${asset.id}`);
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

  // Mipmap generation for newly generated (not skipped/failed) assets
  console.log('=== Mipmap generation ===');
  const { generateMipmapsForFile } = await import('./generate-mipmaps.js');
  for (const { asset, status } of results) {
    if (status === 'failed') continue;
    const outFile = outPathFor(asset);
    if (!fs.existsSync(outFile)) continue;
    const count = await generateMipmapsForFile(outFile);
    console.log(`  ${asset.id}: ${count} mipmap(s) generated/updated`);
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
