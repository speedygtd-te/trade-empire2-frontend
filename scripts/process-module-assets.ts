/**
 * 1. Regenerate MINE asset (dirty/realistic)
 * 2. Upload all 9 module PNGs to fal.ai storage
 * 3. Run background removal via fal-ai/birefnet/v2
 * 4. Download result, trim to content, pad to 1:1 square
 *
 * Usage: npx ts-node scripts/process-module-assets.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FAL_API_KEY = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8')
  .split('\n').find((l) => l.startsWith('FAL_API_KEY='))?.replace('FAL_API_KEY=', '').trim() ?? '';

const MODULES_DIR = path.resolve(__dirname, '../src/assets/modules');

const BASE_STYLE = 'isometric game asset, single 3D building module, 30 degree camera angle from horizontal, 2:1 isometric perspective, The Expanse sci-fi aesthetic, photorealistic textures, realistic worn and dirty metal surfaces, rust stains, oil residue, scratched paint, grime buildup, used industrial equipment, transparent background, game sprite, centered, single object, no ground plane, no shadow, no walls, no enclosure, open machinery';

const MINE_PROMPT = `${BASE_STYLE}, mining drill rig module, heavy rotating drill head pointing downward into the ground, ore conveyor belt, rock crusher mechanism, pile of raw ore chunks, rugged steel frame with welded joints, yellow warning lights, dark gray and yellow hazard stripes, mud and rock dust coating`;

const ALL_MODULES = ['mine', 'pump', 'collector', 'deep_drill', 'smelter', 'refinery', 'chemical_plant', 'assembler', 'factory', 'staircase_bottom', 'staircase_top', 'elevator_bottom', 'elevator_top', 'atmospheric_processor', 'water_synthesizer', 'greenhouse', 'botanical_garden', 'dock_small', 'dock_medium', 'dock_large', 'colony_module', 'hydroponic_bay', 'greenhouse_farm', 'cattle_farm'];

// ── fal.ai helpers ──

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

async function generateImage(prompt: string): Promise<Buffer> {
  console.log('    submitting to flux/dev...');
  const submitBody = JSON.stringify({
    prompt, image_size: { width: 512, height: 512 },
    num_inference_steps: 28, guidance_scale: 7.5, num_images: 1,
    enable_safety_checker: false, output_format: 'png',
  });

  const submitRaw = await httpsRequest({
    hostname: 'queue.fal.run', path: '/fal-ai/flux/dev', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${FAL_API_KEY}` },
  }, submitBody);
  const submit = JSON.parse(submitRaw);

  process.stdout.write('    waiting');
  for (let i = 0; i < 120; i++) {
    await sleep(2000);
    const status = JSON.parse(await httpsGet(submit.status_url, { 'Authorization': `Key ${FAL_API_KEY}` }));
    if (status.status === 'COMPLETED') {
      const result = JSON.parse(await httpsGet(submit.response_url, { 'Authorization': `Key ${FAL_API_KEY}` }));
      console.log(' done');
      return downloadBuffer(result.images[0].url as string);
    }
    if (status.status === 'FAILED') throw new Error(`Generation failed`);
    process.stdout.write('.');
  }
  throw new Error('Timeout');
}

async function uploadToFal(filePath: string): Promise<string> {
  // Initiate upload
  const initRaw = await httpsRequest({
    hostname: 'rest.alpha.fal.ai', path: '/storage/upload/initiate', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${FAL_API_KEY}` },
  }, JSON.stringify({ content_type: 'image/png', file_name: path.basename(filePath) }));
  const init = JSON.parse(initRaw);

  // Upload file to the presigned URL
  const fileData = fs.readFileSync(filePath);
  const uploadUrl = new URL(init.upload_url);
  await new Promise<void>((resolve, reject) => {
    const req = https.request({
      hostname: uploadUrl.hostname,
      path: uploadUrl.pathname + uploadUrl.search,
      method: 'PUT',
      headers: { 'Content-Type': 'image/png', 'Content-Length': fileData.length.toString() },
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve());
    });
    req.on('error', reject);
    req.write(fileData);
    req.end();
  });

  return init.file_url as string;
}

async function removeBackground(imageUrl: string): Promise<Buffer> {
  console.log('    removing background...');
  const raw = await httpsRequest({
    hostname: 'fal.run', path: '/fal-ai/birefnet/v2', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${FAL_API_KEY}` },
  }, JSON.stringify({ image_url: imageUrl }));
  const result = JSON.parse(raw);
  return downloadBuffer(result.image.url as string);
}

async function downloadBuffer(url: string): Promise<Buffer> {
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

async function trimAndPadSquare(inputBuffer: Buffer): Promise<Buffer> {
  // Step 1: Trim transparent pixels, output as PNG
  const trimmedPng = await sharp(inputBuffer)
    .trim()
    .png()
    .toBuffer();

  // Step 2: Get dimensions of trimmed image
  const meta = await sharp(trimmedPng).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;
  const size = Math.max(width, height);

  // Step 3: Pad to square 1:1, centering the content
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
    .png()
    .toBuffer();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  // Step 1: Regenerate MINE
  const minePath = path.join(MODULES_DIR, 'mine', 'mine_0.png');
  if (!fs.existsSync(minePath)) {
    console.log('MINE — regenerating...');
    const buf = await generateImage(MINE_PROMPT);
    fs.writeFileSync(minePath, buf);
    console.log('  saved raw mine');
  }

  // Step 2: Process all modules — bg removal + trim + pad
  for (const mod of ALL_MODULES) {
    const filePath = path.join(MODULES_DIR, mod, `${mod}_0.png`);
    if (!fs.existsSync(filePath)) {
      console.log(`${mod} — MISSING, skipping`);
      continue;
    }

    console.log(`${mod.toUpperCase()} — processing...`);

    // Upload
    console.log('    uploading...');
    const falUrl = await uploadToFal(filePath);

    // Remove background
    const noBgBuffer = await removeBackground(falUrl);

    // Trim + pad to 1:1
    console.log('    trimming + padding to 1:1...');
    const finalBuffer = await trimAndPadSquare(noBgBuffer);

    fs.writeFileSync(filePath, finalBuffer);
    console.log(`    done: ${filePath}\n`);
  }

  console.log('All modules processed!');
}

main().catch((e) => { console.error('Failed:', e); process.exit(1); });
