/**
 * Generate 6 new module assets (robot_t1–t5, big_pump) via fal.ai.
 * Generates image, removes background, saves final PNG, and creates mipmaps.
 *
 * Usage: npx ts-node scripts/generate-robot-pump-assets.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FAL_API_KEY = process.env['FAL_API_KEY'] ?? fs.readFileSync(path.join(__dirname, '.env'), 'utf-8')
  .split('\n').find((l) => l.startsWith('FAL_API_KEY='))?.replace('FAL_API_KEY=', '').trim() ?? '';

if (!FAL_API_KEY) {
  console.error('FAL_API_KEY not found');
  process.exit(1);
}

const OUTPUT_DIR = path.resolve(__dirname, '../src/assets/modules');

const BASE_STYLE = 'isometric game asset, single 3D object, 30 degree camera angle from horizontal, 2:1 isometric perspective, The Expanse sci-fi aesthetic, realism, transparent background, game sprite, centered, single object, no ground plane, no shadow';

interface ModulePrompt {
  name: string;
  dir: string;
  prompt: string;
}

const MODULES: ModulePrompt[] = [
  {
    name: 'ROBOT_T1',
    dir: 'robot_t1',
    prompt: `${BASE_STYLE}, basic humanoid industrial robot, simple skeletal metal frame, minimal armor plating, exposed joints and wiring, dull gray steel finish, basic sensor head with single optical lens, utility arms with simple grip tools, standing upright`,
  },
  {
    name: 'ROBOT_T2',
    dir: 'robot_t2',
    prompt: `${BASE_STYLE}, improved humanoid worker robot, sturdier reinforced frame, partial armor plating on torso and limbs, brushed steel and dark gray finish, dual optical sensors, stronger industrial arms with tool mounts, standing upright`,
  },
  {
    name: 'ROBOT_T3',
    dir: 'robot_t3',
    prompt: `${BASE_STYLE}, specialized humanoid industrial robot, medium-heavy build, full torso armor plating, integrated tool systems on forearms, blue accent lighting on joints, triple sensor array head, hydraulic limb actuators visible, standing upright`,
  },
  {
    name: 'ROBOT_T4',
    dir: 'robot_t4',
    prompt: `${BASE_STYLE}, advanced humanoid expert robot, heavy industrial frame, full body armor plating, advanced sensor dome with multiple optics, reinforced hydraulic limbs, orange accent lighting, integrated data uplink antenna, imposing stance, standing upright`,
  },
  {
    name: 'ROBOT_T5',
    dir: 'robot_t5',
    prompt: `${BASE_STYLE}, elite humanoid robot, top-tier sleek heavily armored design, polished dark chrome and titanium finish, glowing cyan accent lights across body, advanced multi-spectrum sensor head, powerful precision arms, commanding presence, standing upright`,
  },
  {
    name: 'BIG_PUMP',
    dir: 'big_pump',
    prompt: `${BASE_STYLE}, large-scale industrial pump extraction module, oversized cylindrical pump mechanism with massive reinforced piping, heavy-duty compression chambers, large fluid reservoirs, industrial blue and gunmetal steel finish, visible pressure gauges and relief valves, open machinery`,
  },
];

// --- HTTP helpers ---

function httpsRequest(options: https.RequestOptions, body?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          return;
        }
        resolve(data);
      });
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
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    };
    dl(url);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// --- fal.ai API calls ---

async function generateImage(prompt: string): Promise<string> {
  console.log('    submitting to flux/dev...');
  const submitBody = JSON.stringify({
    prompt,
    image_size: { width: 512, height: 512 },
    num_inference_steps: 28,
    guidance_scale: 7.5,
    num_images: 1,
    enable_safety_checker: false,
    output_format: 'png',
  });

  const submitRaw = await httpsRequest({
    hostname: 'queue.fal.run',
    path: '/fal-ai/flux/dev',
    method: 'POST',
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
      return result.images[0].url as string;
    }
    if (status.status === 'FAILED') throw new Error('Generation failed');
    process.stdout.write('.');
  }
  throw new Error('Timeout');
}

async function removeBackground(imageUrl: string): Promise<Buffer> {
  console.log('    removing background...');
  const raw = await httpsRequest({
    hostname: 'fal.run',
    path: '/fal-ai/birefnet/v2',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${FAL_API_KEY}` },
  }, JSON.stringify({ image_url: imageUrl }));
  const result = JSON.parse(raw);
  return downloadBuffer(result.image.url as string);
}

// --- Main ---

async function main(): Promise<void> {
  console.log('Generating 6 new module assets via fal.ai');
  console.log(`Output: ${OUTPUT_DIR}\n`);

  for (const mod of MODULES) {
    const outDir = path.join(OUTPUT_DIR, mod.dir);
    const outFile = path.join(outDir, `${mod.dir}_0.png`);

    if (fs.existsSync(outFile)) {
      console.log(`SKIP ${mod.name} — already exists at ${outFile}`);
      continue;
    }

    console.log(`${mod.name} — generating...`);

    try {
      // Create output directory
      fs.mkdirSync(outDir, { recursive: true });

      // Generate image
      const imageUrl = await generateImage(mod.prompt);

      // Remove background
      const noBgBuffer = await removeBackground(imageUrl);

      // Save final PNG
      fs.writeFileSync(outFile, noBgBuffer);
      console.log(`    saved: ${outFile}`);

      // Generate mipmaps
      const { generateMipmapsForFile } = await import('./generate-mipmaps.js');
      const mipCount = await generateMipmapsForFile(outFile);
      console.log(`    mipmaps: ${mipCount} generated\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`    ERROR generating ${mod.name}: ${msg}`);
      console.error(`    Continuing with next asset...\n`);
    }
  }

  console.log('All done!');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
