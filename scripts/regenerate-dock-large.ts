/**
 * One-shot regeneration of the `dock_large` module sprite.
 *
 * Rudi feedback on the current dock_large_0.webp:
 *   (1) cut off at the sides — geometry runs out of the image frame.
 *   (2) slightly rotated — not cleanly aligned to the iso axes.
 *
 * Content was good (a spacecraft docking bay / starship berth, The Expanse
 * hard sci-fi). This regen keeps the content but adds:
 *   - anti-crop:     "entire structure fully visible in frame, generous empty
 *                     margin around the complete object, nothing cropped at
 *                     image borders"
 *   - anti-rotation: "clean isometric alignment, both visible facades at equal
 *                     symmetric angles, no rotation"
 *   - boat negatives so it never reads as a maritime vessel.
 *
 * Flow mirrors scripts/regenerate-rtg.ts:
 *   flux/dev 512x512 PNG -> birefnet/v2 bg removal -> tight crop ->
 *   pad to centered 1:1 square -> assets/final/dock_large_0.png
 *
 * Then (outside, after visual sign-off, via finalize-module-webp.ts):
 *   src/assets/modules-flat/dock_large_0.webp (+ @half/@quarter/@eighth)
 *
 * Usage:
 *   npx tsx scripts/regenerate-dock-large.ts --variant 0   (0..3)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

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
  console.error('FAL_API_KEY not found in scripts/.env');
  process.exit(1);
}

const REPO_ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(REPO_ROOT, 'assets');

// Canonical style — navy-blue painted steel, yellow safety stripes, weathered metal.
// NEW: anti-crop + anti-rotation framing constraints baked into the base style.
const BASE_STYLE =
  'isometric game asset, isometric 2.5D perspective, 30 degree camera angle from horizontal, ' +
  '2:1 isometric perspective, The Expanse hard sci-fi aesthetic, ' +
  'navy-blue painted steel with yellow safety stripes, weathered metal surfaces, ' +
  'photorealistic textures, scratched paint, grime and oil residue, ' +
  'lit from upper left, soft top-left key light, no background, isolated object, ' +
  'game sprite, centered, single object, no ground plane, no shadow, ' +
  // anti-crop
  'entire structure fully visible in frame, generous empty margin around the complete object, ' +
  'nothing cropped at image borders, whole object inside the canvas, zoomed out, small in frame, ' +
  // anti-rotation
  'clean isometric alignment, both visible facades at equal symmetric angles, no rotation, ' +
  'axis-aligned, not tilted, straight isometric orientation';

// Negatives — kill any maritime read.
const NEG =
  ', no boats, no yachts, no sailing ships, no water, no maritime vessels, no sea, no masts, no sails';

// dock_large prompt bodies — content kept (spacecraft docking bay / starship berth).
const VARIANTS: string[] = [
  'large spacecraft docking bay, a massive cavernous open starship berth with a huge clamshell bay door, ' +
    'extending docking arms and gantry walkways, heavy clamp arms to grip a starship, bright bay floodlights, ' +
    'towering navy-blue steel walls with yellow hazard chevrons, monumental free-standing space dock' +
    NEG,
  'big starship dock module, an enormous spacecraft berth with a wide open mouth, telescoping boarding gantries, ' +
    'fuelling booms and crane arms, illuminated approach guide lights, reinforced colossal steel framing with ' +
    'yellow striping, imposing free-standing orbital docking structure' +
    NEG,
  'large vessel docking bay, a grand hangar-scale starship dock with retractable doors, multiple docking clamps ' +
    'and service gantries, floodlit interior, vast navy steel hull with hazard markings, monumental isolated ' +
    'spacecraft dock structure, clearly oversized' +
    NEG,
  'massive starship docking bay structure, a complete free-standing space hangar with a wide open berth, ' +
    'gantry cranes and docking clamps along the sides, floodlights, navy-blue steel with yellow safety chevrons, ' +
    'the full hangar shown end to end with empty space all around it' +
    NEG,
];

interface FalSubmit {
  status_url: string;
  response_url: string;
}

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
  return httpsRequest({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers });
}

async function generateImage(prompt: string): Promise<Buffer> {
  const submitRaw = await httpsRequest(
    {
      hostname: 'queue.fal.run',
      path: '/fal-ai/flux/dev',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
    },
    JSON.stringify({
      prompt,
      image_size: { width: 512, height: 512 },
      num_inference_steps: 28,
      guidance_scale: 7.5,
      num_images: 1,
      enable_safety_checker: false,
      output_format: 'png',
    }),
  );
  const submit = JSON.parse(submitRaw) as FalSubmit;

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
  const initRaw = await httpsRequest(
    {
      hostname: 'rest.alpha.fal.ai',
      path: '/storage/upload/initiate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
    },
    JSON.stringify({ content_type: 'image/png', file_name: name }),
  );
  const init = JSON.parse(initRaw) as { upload_url: string; file_url: string };
  const u = new URL(init.upload_url);
  await new Promise<void>((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'PUT',
        headers: { 'Content-Type': 'image/png', 'Content-Length': buf.length.toString() },
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve());
      },
    );
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
  return init.file_url;
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
  const result = JSON.parse(raw) as { image: { url: string } };
  return downloadBuffer(result.image.url);
}

async function tightCrop(inputBuffer: Buffer): Promise<Buffer> {
  return sharp(inputBuffer).trim().png().toBuffer();
}

async function padSquare(croppedBuffer: Buffer): Promise<Buffer> {
  const meta = await sharp(croppedBuffer).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const size = Math.max(w, h);
  const padLeft = Math.floor((size - w) / 2);
  const padTop = Math.floor((size - h) / 2);
  return sharp(croppedBuffer)
    .extend({
      top: padTop,
      bottom: size - h - padTop,
      left: padLeft,
      right: size - w - padLeft,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function downloadBuffer(url: string): Promise<Buffer> {
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const variantIdx = process.argv.indexOf('--variant');
  const variant = variantIdx >= 0 ? parseInt(process.argv[variantIdx + 1] ?? '0', 10) : 0;
  const body = VARIANTS[variant] ?? VARIANTS[0];
  const prompt = `${BASE_STYLE}, ${body}`;

  const RAW = path.join(ASSETS, 'raw', `module_dock_large_raw.png`);
  const NOBG = path.join(ASSETS, 'nobg', `module_dock_large_nobg.png`);
  const CROPPED = path.join(ASSETS, 'cropped', `module_dock_large_cropped.png`);
  const FINAL = path.join(ASSETS, 'final', `dock_large_0.png`);
  for (const p of [RAW, NOBG, CROPPED, FINAL]) fs.mkdirSync(path.dirname(p), { recursive: true });

  console.log(`dock_large (spacecraft docking bay) — variant ${variant}`);
  process.stdout.write('  generating');
  const rawBuf = await generateImage(prompt);
  fs.writeFileSync(RAW, rawBuf);
  console.log(` done`);

  process.stdout.write('  bg removal');
  const falUrl = await uploadToFal(rawBuf, `module_dock_large.png`);
  const noBgBuf = await removeBackground(falUrl);
  fs.writeFileSync(NOBG, noBgBuf);
  console.log(` done`);

  process.stdout.write('  tight crop');
  const croppedBuf = await tightCrop(noBgBuf);
  fs.writeFileSync(CROPPED, croppedBuf);
  const cm = await sharp(croppedBuf).metadata();
  console.log(` done (${cm.width}x${cm.height})`);

  process.stdout.write('  pad to square');
  const finalBuf = await padSquare(croppedBuf);
  fs.writeFileSync(FINAL, finalBuf);
  const fm = await sharp(finalBuf).metadata();
  console.log(` done (${fm.width}x${fm.height}) -> ${path.relative(REPO_ROOT, FINAL)}`);
}

main().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});
