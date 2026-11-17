/**
 * One-shot regeneration of the `rtg` module sprite — MONUMENTAL version.
 *
 * Rudi feedback: the current rtg_0.webp reads as a small box / "trash can with a
 * fan". This regen must produce a MASSIVE, monumental, high-tech reactor
 * installation — towering industrial scale, with prominent radial cooling fins
 * and built-in size references (maintenance platform with railings, access
 * ladder, service walkway) so it reads as huge.
 *
 * Flow mirrors scripts/regenerate-14-modules.ts:
 *   flux/dev 512x512 PNG -> birefnet/v2 bg removal -> tight crop ->
 *   pad to centered 1:1 square -> assets/final/rtg_0.png
 *
 * Then (outside, via finalize-module-webp.ts after visual sign-off):
 *   src/assets/modules/rtg/rtg_0.webp (+ @half/@quarter/@eighth)
 *
 * Usage:
 *   npx tsx scripts/regenerate-rtg.ts --variant 0   (0..2)
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
const BASE_STYLE =
  'isometric game asset, isometric 2.5D perspective, 30 degree camera angle from horizontal, ' +
  '2:1 isometric perspective, The Expanse hard sci-fi aesthetic, ' +
  'navy-blue painted steel with yellow safety stripes, weathered metal surfaces, ' +
  'photorealistic textures, scratched paint, grime and oil residue, ' +
  'lit from upper left, soft top-left key light, no background, isolated object, ' +
  'game sprite, centered, single object, no ground plane, no shadow';

// Negatives to kill the "small appliance / trash can" read.
const NO_SMALL =
  ', no small appliance, no compact box, no trash can proportions, no household object, ' +
  'not tiny, not a small unit';

// MONUMENTAL rtg prompt bodies — size references baked in so it reads HUGE.
const VARIANTS: string[] = [
  'massive monumental radioisotope thermoelectric generator, large high-tech reactor installation, towering industrial scale, ' +
    'prominent radial cooling fins, large finned heat sink columns rising tall, a sealed glowing radioactive core deep in the structure, ' +
    'yellow-and-black radiation trefoil markings, surrounded by a maintenance platform with railings, an access ladder, a small service walkway, ' +
    'the platform and ladder make the reactor look enormous, heavy bolted megastructure, imposing free-standing power plant',
  'huge monumental RTG reactor tower, large high-tech nuclear power installation, towering industrial scale, ' +
    'tall stacked banks of prominent radial cooling fins and large finned heat sink columns, central sealed core with a faint warm glow, ' +
    'radiation hazard trefoil and warning labels, wrapped by maintenance platforms with safety railings, a tall access ladder up the side, a service walkway, ' +
    'the railings and ladder give a sense of vast scale, weathered navy-steel megastructure' +
    NO_SMALL,
  'colossal radioisotope thermoelectric generator complex, large high-tech reactor installation, towering industrial scale, ' +
    'a cluster of large finned heat-sink columns with prominent radial cooling fins radiating outward, a glowing sealed core chamber, ' +
    'yellow safety striping and trefoil markings, encircled by a multi-level maintenance platform with railings, an access ladder, a narrow service catwalk, ' +
    'tiny railings and ladder rungs prove the monumental size, monumental free-standing reactor structure' +
    NO_SMALL,
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

  const RAW = path.join(ASSETS, 'raw', `module_rtg_raw.png`);
  const NOBG = path.join(ASSETS, 'nobg', `module_rtg_nobg.png`);
  const CROPPED = path.join(ASSETS, 'cropped', `module_rtg_cropped.png`);
  const FINAL = path.join(ASSETS, 'final', `rtg_0.png`);
  for (const p of [RAW, NOBG, CROPPED, FINAL]) fs.mkdirSync(path.dirname(p), { recursive: true });

  console.log(`rtg (EXTERIOR, monumental) — variant ${variant}`);
  process.stdout.write('  generating');
  const rawBuf = await generateImage(prompt);
  fs.writeFileSync(RAW, rawBuf);
  console.log(` done`);

  process.stdout.write('  bg removal');
  const falUrl = await uploadToFal(rawBuf, `module_rtg.png`);
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
