/**
 * Generate the TRACKS module asset via fal.ai — analogous to wheel / heavy_wheel.
 *
 * Pipeline:
 *   1. Generate (flux/dev, 512x512 PNG)         -> assets/raw/module_tracks_raw.png
 *   2. Background removal (birefnet/v2)          -> assets/nobg/module_tracks_nobg.png
 *   3. Tight crop (trim transparent border)      -> assets/cropped/module_tracks_cropped.png
 *   4. Pad to 1:1 square (centered)              -> assets/final/tracks_0.png
 *
 * Mirrors the exact style + flow that produced wheel_0 / heavy_wheel_0
 * (scripts/generate-missing-assets.ts). Mip/webp integration is handled by
 * a separate step after iso-validation passes.
 *
 * Usage: npx tsx scripts/generate-tracks-asset.ts [--prompt-variant N]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FAL_API_KEY = process.env['FAL_API_KEY'] ?? fs.readFileSync(path.join(__dirname, '.env'), 'utf-8')
  .split('\n').find((l) => l.startsWith('FAL_API_KEY='))?.replace('FAL_API_KEY=', '').trim() ?? '';

if (!FAL_API_KEY) {
  console.error('FAL_API_KEY not found in scripts/.env');
  process.exit(1);
}

const REPO_ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(REPO_ROOT, 'assets');
const RAW = path.join(ASSETS, 'raw', 'module_tracks_raw.png');
const NOBG = path.join(ASSETS, 'nobg', 'module_tracks_nobg.png');
const CROPPED = path.join(ASSETS, 'cropped', 'module_tracks_cropped.png');
const FINAL = path.join(ASSETS, 'final', 'tracks_0.png');

// Exact BASE_STYLE used to produce wheel_0 / heavy_wheel_0.
const BASE_STYLE = 'isometric game asset, single 3D building module, 30 degree camera angle from horizontal, 2:1 isometric perspective, The Expanse sci-fi aesthetic, photorealistic textures, realistic worn and dirty metal surfaces, rust stains, oil residue, scratched paint, grime buildup, used industrial equipment, transparent background, game sprite, centered, single object, no ground plane, no shadow, no walls, no enclosure, open machinery';

// Prompt variants — retried on iso-validation failure (max 3).
const PROMPT_VARIANTS = [
  `${BASE_STYLE}, continuous track drive module, tank-style caterpillar tracks unit, pair of heavy treaded rubber-metal tracks wrapped around toothed drive sprockets and road wheels, suspension torsion arms, electric drive motor housing, axle mount bracket, mud-caked treads, dark steel and black rubber, ground vehicle propulsion`,
  `${BASE_STYLE}, tracked drive unit module, single heavy-duty continuous track assembly, segmented metal track plates over front drive sprocket rear idler wheel and bogie road wheels, hydraulic suspension arms, sealed drive motor, armored side skirt, worn black rubber and dark gunmetal steel, ground vehicle running gear`,
  `${BASE_STYLE}, vehicle caterpillar track module, low wide tracked chassis bogie, chunky cleated track links over multiple road wheels and a toothed sprocket, leaf-spring suspension, compact electric motor pod, axle coupling, dirt and oil staining, dark steel hull material with black rubber treads`,
];

interface SubmitResult { statusUrl: string; responseUrl: string }

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
  const submitRaw = await httpsRequest({
    hostname: 'queue.fal.run', path: '/fal-ai/flux/dev', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${FAL_API_KEY}` },
  }, JSON.stringify({
    prompt, image_size: { width: 512, height: 512 },
    num_inference_steps: 28, guidance_scale: 7.5, num_images: 1,
    enable_safety_checker: false, output_format: 'png',
  }));
  const submit = JSON.parse(submitRaw) as { status_url: string; response_url: string };

  for (let i = 0; i < 120; i++) {
    await sleep(2000);
    const status = JSON.parse(await httpsGet(submit.status_url, { Authorization: `Key ${FAL_API_KEY}` }));
    if (status.status === 'COMPLETED') {
      const result = JSON.parse(await httpsGet(submit.response_url, { Authorization: `Key ${FAL_API_KEY}` }));
      return downloadBuffer(result.images[0].url as string);
    }
    if (status.status === 'FAILED') throw new Error('Generation failed');
    process.stdout.write('.');
  }
  throw new Error('Timeout');
}

async function uploadToFal(buf: Buffer, name: string): Promise<string> {
  const initRaw = await httpsRequest({
    hostname: 'rest.alpha.fal.ai', path: '/storage/upload/initiate', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${FAL_API_KEY}` },
  }, JSON.stringify({ content_type: 'image/png', file_name: name }));
  const init = JSON.parse(initRaw) as { upload_url: string; file_url: string };
  const u = new URL(init.upload_url);
  await new Promise<void>((resolve, reject) => {
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'PUT',
      headers: { 'Content-Type': 'image/png', 'Content-Length': buf.length.toString() },
    }, (res) => { res.on('data', () => {}); res.on('end', () => resolve()); });
    req.on('error', reject); req.write(buf); req.end();
  });
  return init.file_url;
}

async function removeBackground(imageUrl: string): Promise<Buffer> {
  const raw = await httpsRequest({
    hostname: 'fal.run', path: '/fal-ai/birefnet/v2', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${FAL_API_KEY}` },
  }, JSON.stringify({ image_url: imageUrl }));
  const result = JSON.parse(raw) as { image: { url: string } };
  return downloadBuffer(result.image.url);
}

/** Tight crop: trim transparent border down to the visible object. */
async function tightCrop(inputBuffer: Buffer): Promise<Buffer> {
  return sharp(inputBuffer).trim().png().toBuffer();
}

/** Pad a tight-cropped buffer to a centered 1:1 square (matches wheel/heavy_wheel). */
async function padSquare(croppedBuffer: Buffer): Promise<Buffer> {
  const meta = await sharp(croppedBuffer).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const size = Math.max(w, h);
  const padLeft = Math.floor((size - w) / 2);
  const padTop = Math.floor((size - h) / 2);
  return sharp(croppedBuffer).extend({
    top: padTop, bottom: size - h - padTop,
    left: padLeft, right: size - w - padLeft,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).png().toBuffer();
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

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

async function main(): Promise<void> {
  const variantArgIdx = process.argv.indexOf('--prompt-variant');
  const variant = variantArgIdx >= 0 ? parseInt(process.argv[variantArgIdx + 1] ?? '0', 10) : 0;
  const prompt = PROMPT_VARIANTS[variant] ?? PROMPT_VARIANTS[0];

  for (const p of [RAW, NOBG, CROPPED, FINAL]) fs.mkdirSync(path.dirname(p), { recursive: true });

  console.log(`TRACKS — prompt variant ${variant}`);
  process.stdout.write('  generating');
  const rawBuf = await generateImage(prompt);
  fs.writeFileSync(RAW, rawBuf);
  console.log(` done -> ${path.relative(REPO_ROOT, RAW)}`);

  process.stdout.write('  bg removal');
  const falUrl = await uploadToFal(rawBuf, 'module_tracks.png');
  const noBgBuf = await removeBackground(falUrl);
  fs.writeFileSync(NOBG, noBgBuf);
  console.log(` done -> ${path.relative(REPO_ROOT, NOBG)}`);

  process.stdout.write('  tight crop');
  const croppedBuf = await tightCrop(noBgBuf);
  fs.writeFileSync(CROPPED, croppedBuf);
  const cm = await sharp(croppedBuf).metadata();
  console.log(` done (${cm.width}x${cm.height}) -> ${path.relative(REPO_ROOT, CROPPED)}`);

  process.stdout.write('  pad to square');
  const finalBuf = await padSquare(croppedBuf);
  fs.writeFileSync(FINAL, finalBuf);
  const fm = await sharp(finalBuf).metadata();
  console.log(` done (${fm.width}x${fm.height}) -> ${path.relative(REPO_ROOT, FINAL)}`);

  console.log('\nTRACKS asset staged. Next: validate-iso then webp+mips.');
}

main().catch((e) => { console.error('Failed:', e); process.exit(1); });
