/**
 * Generate galaxy view assets via fal.ai:
 *   - 10 star textures (256x256 PNG with alpha)
 *   - 1 skybox (1024x512 equirectangular PNG)
 *
 * Pipeline per star:
 *   1. flux/dev generates 512x512 image
 *   2. Upload to fal storage
 *   3. birefnet/v2 removes background
 *   4. sharp trims + pads to 256x256
 *
 * Pipeline for skybox:
 *   1. flux/dev generates 1024x512 image
 *   2. No background removal (it IS the background)
 *   3. Save directly
 *
 * Usage: npx ts-node scripts/generate-galaxy-assets.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FAL_API_KEY = process.env['FAL_API_KEY'] ?? fs.readFileSync(path.join(__dirname, '.env'), 'utf-8')
  .split('\n').find((l) => l.startsWith('FAL_API_KEY='))?.replace('FAL_API_KEY=', '').trim() ?? '';

if (!FAL_API_KEY) {
  console.error('FAL_API_KEY not found');
  process.exit(1);
}

const STARS_DIR = path.resolve(__dirname, '../src/assets/galaxy/stars');
const SKYBOX_DIR = path.resolve(__dirname, '../src/assets/galaxy');

// ── Star definitions ──

interface StarDef {
  type: string;
  filename: string;
  prompt: string;
}

const BASE_STAR_STYLE = 'Realistic star texture, glowing, radial light emission, centered on black background, astronomical photograph style, no text';

const STARS: StarDef[] = [
  { type: 'O-Type', filename: 'star_o_type', prompt: `${BASE_STAR_STYLE}, hot blue star, intensely luminous, brilliant blue-white core with blue corona, extreme temperature stellar object` },
  { type: 'B-Type', filename: 'star_b_type', prompt: `${BASE_STAR_STYLE}, blue-white star, bright blue-white stellar surface, hot young star with soft blue glow` },
  { type: 'A-Type', filename: 'star_a_type', prompt: `${BASE_STAR_STYLE}, white star, bright pure white stellar surface, clean white radial glow, luminous` },
  { type: 'F-Type', filename: 'star_f_type', prompt: `${BASE_STAR_STYLE}, white-yellow star, warm white with slight yellow tint, medium-hot stellar surface` },
  { type: 'G-Type', filename: 'star_g_type', prompt: `${BASE_STAR_STYLE}, yellow star like our Sun, warm golden-yellow stellar surface, solar prominences, familiar sun-like appearance` },
  { type: 'K-Type', filename: 'star_k_type', prompt: `${BASE_STAR_STYLE}, orange star, warm orange stellar surface, cooler star with deep amber glow` },
  { type: 'M-Type', filename: 'star_m_type', prompt: `${BASE_STAR_STYLE}, red dwarf star, cool dim red stellar surface, small faint red star with subtle glow` },
  { type: 'White Dwarf', filename: 'star_white_dwarf', prompt: `${BASE_STAR_STYLE}, white dwarf star, tiny extremely hot compact white star, intense white-blue pinpoint glow, dense stellar remnant` },
  { type: 'Red Giant', filename: 'star_red_giant', prompt: `${BASE_STAR_STYLE}, red giant star, large bloated red-orange star, diffuse surface with granulation, expanded dying star` },
  { type: 'Neutron', filename: 'star_neutron', prompt: `${BASE_STAR_STYLE}, neutron star, compact violet-blue star with radiation beams, intense magnetic field glow, pulsar jets, exotic stellar remnant` },
];

// ── fal.ai helpers (same pattern as generate-resource-assets.ts) ──

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
  return httpsRequest({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function downloadBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const dl = (u: string): void => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) { dl(res.headers.location as string); return; }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    };
    dl(url);
  });
}

async function generateImage(prompt: string, width: number, height: number): Promise<Buffer> {
  const submitBody = JSON.stringify({
    prompt,
    image_size: { width, height },
    num_inference_steps: 28,
    guidance_scale: 7.5,
    num_images: 1,
    enable_safety_checker: false,
    output_format: 'png',
  });

  const submitRaw = await httpsRequest({
    hostname: 'queue.fal.run', path: '/fal-ai/flux/dev', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${FAL_API_KEY}` },
  }, submitBody);

  const submit = JSON.parse(submitRaw);
  if (!submit.status_url) {
    throw new Error(`Submit failed: ${submitRaw}`);
  }

  process.stdout.write('    waiting');
  for (let i = 0; i < 120; i++) {
    await sleep(2000);
    const status = JSON.parse(await httpsGet(submit.status_url, { 'Authorization': `Key ${FAL_API_KEY}` }));
    if (status.status === 'COMPLETED') {
      const result = JSON.parse(await httpsGet(submit.response_url, { 'Authorization': `Key ${FAL_API_KEY}` }));
      console.log(' done');
      return downloadBuffer(result.images[0].url as string);
    }
    if (status.status === 'FAILED') throw new Error(`Generation failed: ${JSON.stringify(status)}`);
    process.stdout.write('.');
  }
  throw new Error('Timeout waiting for generation');
}

async function uploadToFal(buffer: Buffer, fileName: string): Promise<string> {
  const initRaw = await httpsRequest({
    hostname: 'rest.alpha.fal.ai', path: '/storage/upload/initiate', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${FAL_API_KEY}` },
  }, JSON.stringify({ content_type: 'image/png', file_name: fileName }));
  const init = JSON.parse(initRaw);

  const uploadUrl = new URL(init.upload_url);
  await new Promise<void>((resolve, reject) => {
    const req = https.request({
      hostname: uploadUrl.hostname,
      path: uploadUrl.pathname + uploadUrl.search,
      method: 'PUT',
      headers: { 'Content-Type': 'image/png', 'Content-Length': buffer.length.toString() },
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve());
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });

  return init.file_url as string;
}

async function removeBackground(imageUrl: string): Promise<Buffer> {
  const raw = await httpsRequest({
    hostname: 'fal.run', path: '/fal-ai/birefnet/v2', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${FAL_API_KEY}` },
  }, JSON.stringify({ image_url: imageUrl }));
  const result = JSON.parse(raw);
  return downloadBuffer(result.image.url as string);
}

async function blackToAlpha(inputBuffer: Buffer): Promise<Buffer> {
  // For stars on black backgrounds: use pixel luminance as alpha.
  // Bright pixels (the star) become opaque, dark/black pixels become transparent.
  const image = sharp(inputBuffer).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  const pixels = Buffer.from(data);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    // Luminance as alpha — max channel value gives best result for glowing objects
    const luminance = Math.max(r, g, b);
    pixels[i + 3] = luminance;
  }

  return sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

async function trimAndPad256(inputBuffer: Buffer): Promise<Buffer> {
  // Trim transparent pixels
  const trimmedPng = await sharp(inputBuffer)
    .trim()
    .png()
    .toBuffer();

  // Get dimensions of trimmed image
  const meta = await sharp(trimmedPng).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;

  // Scale to fit in 256x256 while maintaining aspect ratio
  const scale = Math.min(256 / width, 256 / height);
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);

  const resized = await sharp(trimmedPng)
    .resize(newWidth, newHeight, { fit: 'inside' })
    .png()
    .toBuffer();

  // Get actual dimensions after resize
  const resizedMeta = await sharp(resized).metadata();
  const rw = resizedMeta.width ?? newWidth;
  const rh = resizedMeta.height ?? newHeight;

  // Pad to exactly 256x256
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

// ── Star processing ──

async function processStar(star: StarDef): Promise<'generated' | 'skipped' | 'failed'> {
  const outFile = path.join(STARS_DIR, `${star.filename}.png`);

  if (fs.existsSync(outFile)) {
    console.log(`  SKIP ${star.type} — already exists`);
    return 'skipped';
  }

  console.log(`  ${star.type} — generating...`);

  // Step 1: Generate 512x512 via flux/dev
  const rawBuffer = await generateImage(star.prompt, 512, 512);
  console.log(`    generated (${rawBuffer.length} bytes)`);

  // Step 2: Convert black background to transparency using luminance-based alpha
  // (birefnet strips glowing stars along with the background, so we use pixel luminance instead)
  console.log('    converting black to alpha (luminance-based)...');
  const alphaBuffer = await blackToAlpha(rawBuffer);
  console.log(`    alpha applied (${alphaBuffer.length} bytes)`);

  // Step 3: Trim + pad to 256x256
  console.log('    trimming + padding to 256x256...');
  const finalBuffer = await trimAndPad256(alphaBuffer);

  fs.writeFileSync(outFile, finalBuffer);
  console.log(`    saved: ${outFile}`);
  return 'generated';
}

// ── Skybox processing ──

async function processSkybox(): Promise<'generated' | 'skipped' | 'failed'> {
  const outFile = path.join(SKYBOX_DIR, 'skybox.png');

  if (fs.existsSync(outFile)) {
    console.log('  SKIP skybox — already exists');
    return 'skipped';
  }

  console.log('  Skybox — generating...');

  const prompt = 'Deep space nebula panorama, equirectangular projection, dark cosmic background with subtle purple and blue nebula clouds, distant stars, astronomical photograph, no text, no planets, seamless';

  // Generate at 1024x512 directly
  const rawBuffer = await generateImage(prompt, 1024, 512);
  console.log(`    generated (${rawBuffer.length} bytes)`);

  // No background removal needed — this IS the background
  // Ensure exact dimensions with sharp
  console.log('    ensuring 1024x512...');
  const finalBuffer = await sharp(rawBuffer)
    .resize(1024, 512, { fit: 'fill' })
    .png()
    .toBuffer();

  fs.writeFileSync(outFile, finalBuffer);
  console.log(`    saved: ${outFile}`);
  return 'generated';
}

// ── Main ──

async function main(): Promise<void> {
  console.log('=== Galaxy Asset Generation ===');
  console.log(`Stars output:  ${STARS_DIR}`);
  console.log(`Skybox output: ${SKYBOX_DIR}`);
  console.log(`Total stars: ${STARS.length}`);
  console.log('');

  fs.mkdirSync(STARS_DIR, { recursive: true });
  fs.mkdirSync(SKYBOX_DIR, { recursive: true });

  const results: Record<string, string> = {};
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  // Process stars
  for (let i = 0; i < STARS.length; i++) {
    const star = STARS[i];
    console.log(`[${i + 1}/${STARS.length + 1}] ${star.type}`);

    try {
      const status = await processStar(star);
      results[star.type] = status;
      if (status === 'generated') generated++;
      else if (status === 'skipped') skipped++;
    } catch (err) {
      console.error(`    FAILED: ${err}`);
      results[star.type] = 'failed';
      failed++;
    }

    console.log('');
  }

  // Process skybox
  console.log(`[${STARS.length + 1}/${STARS.length + 1}] Skybox`);
  try {
    const status = await processSkybox();
    results['Skybox'] = status;
    if (status === 'generated') generated++;
    else if (status === 'skipped') skipped++;
  } catch (err) {
    console.error(`    FAILED: ${err}`);
    results['Skybox'] = 'failed';
    failed++;
  }

  console.log('');

  // Summary
  console.log('=== SUMMARY ===');
  console.log(`Generated: ${generated}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Failed:    ${failed}`);
  console.log('');

  for (const [name, status] of Object.entries(results)) {
    const icon = status === 'generated' ? '✅' : status === 'skipped' ? '⏭️' : '❌';
    console.log(`  ${icon} ${name}: ${status}`);
  }

  if (failed > 0) {
    console.log('\nFailed assets:');
    for (const [name, status] of Object.entries(results)) {
      if (status === 'failed') console.log(`  - ${name}`);
    }
  }

  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
