/**
 * Hull Floor Tile Generator
 *
 * Generates interior floor tiles for each hull type (view inside a structure).
 * Same pipeline as biome tiles: flux-pro texture → resize 512x256 → diamond mask.
 *
 * Usage: npx tsx scripts/generate-hull-floor-assets.ts
 * Requires: FAL_AI_API_KEY env var
 */

const FAL_API_KEY = process.env['FAL_AI_API_KEY'];
if (!FAL_API_KEY) {
  console.error('FAL_AI_API_KEY environment variable is required');
  process.exit(1);
}

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TILE_W = 512;
const TILE_H = 256;
const GEN_SIZE = 512;

const DIAMOND_MASK_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}">
    <polygon points="${TILE_W / 2},0 ${TILE_W},${TILE_H / 2} ${TILE_W / 2},${TILE_H} 0,${TILE_H / 2}" fill="white"/>
  </svg>`
);

const PROMPT_BASE = 'top-down aerial photograph, interior floor texture filling entire image edge to edge, no sky, no walls, no borders, no vignette, sci-fi industrial aesthetic, realistic';

function p(floor: string, details: string): string {
  return `${PROMPT_BASE}, ${floor}, ${details}`;
}

const FLOOR_PROMPTS: Record<string, string> = {
  STARTER: p('basic industrial metal floor grating from directly above', 'worn riveted iron floor plates with diamond tread pattern, copper-tinted bolt heads, scratched and dented walkway, rustic industrial flooring'),
  STANDARD: p('clean steel floor panels from directly above', 'precise grey metal floor tiles with subtle seam lines, recessed blue LED strips between panels, ventilation grate sections, modern industrial floor'),
  AIRTIGHT: p('white composite sealed floor from directly above', 'smooth white hermetic floor panels with green-glowing status indicator lines in seams, clean aerospace interior flooring, space station corridor floor'),
  PRESSURIZED: p('heavy titanium pressure floor from directly above', 'thick dark teal titanium floor plates with circular reinforcement patterns embossed in surface, amber warning line markings, heavy duty submarine-grade interior floor'),
  REINFORCED: p('heavy armored floor plating from directly above', 'thick dark gunmetal grey blast-resistant composite floor plates, angular non-slip texture, orange hazard stripe line markings, military bunker interior floor'),
  PLATFORM_OUTDOOR: p('open-air metal grating platform floor from directly above', 'industrial steel diamond plate deck grating, visible gaps between grate bars showing ground below, yellow caution stripe markings painted on edges, weathered outdoor metal surface, bolted connection points'),
  PLATFORM_UNDERWATER: p('underwater sealed glass and metal platform floor from directly above', 'transparent reinforced glass floor panels with titanium frame grid, dark teal metal seams between glass sections, bioluminescent blue guide lights embedded in frame, visible dark water depth below glass, submarine base aesthetic'),
  PLATFORM_SPACE: p('carbon-fiber composite deck platform floor from directly above', 'dark carbon black composite deck panels with metallic grid overlay, cyan LED running lights embedded in panel seams, magnetic clamp mounting points as circular recesses, lightweight open-weave carbon fiber texture, vacuum-rated space construction platform surface'),
};

const VARIANTS_PER_FLOOR = 4;
const MAX_CONCURRENT = 3;
const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'hull_floors');

// ---------------------------------------------------------------------------
// fal.ai helpers
// ---------------------------------------------------------------------------

interface FalImage { url: string; content_type: string; width: number; height: number; }
interface FluxResponse { images: FalImage[]; }

function fetchJson<T>(url: string, body: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = JSON.stringify(body);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: parsed.hostname, port: parsed.port,
      path: parsed.pathname + parsed.search, method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        if (res.statusCode && res.statusCode >= 400) { reject(new Error(`fal.ai ${res.statusCode}: ${raw}`)); return; }
        try { resolve(JSON.parse(raw) as T); } catch { reject(new Error(`Invalid JSON: ${raw.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function downloadBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doGet = (targetUrl: string): void => {
      const mod = targetUrl.startsWith('https') ? https : http;
      mod.get(targetUrl, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers['location']) { doGet(res.headers['location']); return; }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };
    doGet(url);
  });
}

// ---------------------------------------------------------------------------
// Diamond mask (same as biome tiles)
// ---------------------------------------------------------------------------

async function applyDiamondMask(imageBuffer: Buffer): Promise<Buffer> {
  const resized = await sharp(imageBuffer)
    .resize(TILE_W, TILE_H, { fit: 'fill' })
    .png()
    .toBuffer();

  const mask = await sharp(DIAMOND_MASK_SVG)
    .resize(TILE_W, TILE_H)
    .greyscale()
    .png()
    .toBuffer();

  return sharp(resized)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Generation pipeline
// ---------------------------------------------------------------------------

async function generateAsset(hullType: string, variant: number): Promise<string> {
  const prompt = FLOOR_PROMPTS[hullType];
  if (!prompt) throw new Error(`No prompt for hull floor: ${hullType}`);

  const variantPrompt = variant > 0
    ? `${prompt}, variation ${variant + 1}, slightly different pattern`
    : prompt;

  console.log(`  [flux-pro] Generating ${hullType}_floor_${variant}...`);

  const fluxResult = await fetchJson<FluxResponse>(
    'https://fal.run/fal-ai/flux-pro/v1.1',
    {
      prompt: variantPrompt,
      image_size: { width: GEN_SIZE, height: GEN_SIZE },
      num_images: 1,
      enable_safety_checker: false,
      seed: hullType.length * 5000 + variant * 197,
    },
  );

  const generatedUrl = fluxResult.images[0]?.url;
  if (!generatedUrl) throw new Error(`No image for ${hullType}_floor_${variant}`);

  console.log(`  [download] Fetching texture...`);
  const rawBuffer = await downloadBuffer(generatedUrl);

  console.log(`  [mask] Diamond mask (${TILE_W}x${TILE_H})...`);
  const masked = await applyDiamondMask(rawBuffer);

  const floorDir = path.join(OUTPUT_DIR, hullType.toLowerCase());
  fs.mkdirSync(floorDir, { recursive: true });

  const filePath = path.join(floorDir, `${hullType.toLowerCase()}_floor_${variant}.png`);
  fs.writeFileSync(filePath, masked);
  console.log(`  [save] ${filePath} (${Math.round(masked.length / 1024)}KB)`);

  // Generate mipmaps for the new asset
  const { generateMipmapsForFile } = await import('./generate-mipmaps.js');
  const mipCount = await generateMipmapsForFile(filePath);
  if (mipCount > 0) console.log(`  [mipmaps] ${mipCount} generated`);

  return filePath;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const hullTypes = Object.keys(FLOOR_PROMPTS);
  const total = hullTypes.length * VARIANTS_PER_FLOOR;

  console.log('=== Hull Floor Tile Generator ===');
  console.log(`Output:   ${OUTPUT_DIR}`);
  console.log(`Tile:     ${TILE_W}x${TILE_H} (diamond masked)`);
  console.log(`Types:    ${hullTypes.length}`);
  console.log(`Variants: ${VARIANTS_PER_FLOOR}`);
  console.log(`Total:    ${total} images\n`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const tasks: Array<{ hullType: string; variant: number }> = [];
  for (const hullType of hullTypes) {
    for (let v = 0; v < VARIANTS_PER_FLOOR; v++) {
      const filePath = path.join(OUTPUT_DIR, hullType.toLowerCase(), `${hullType.toLowerCase()}_floor_${v}.png`);
      if (fs.existsSync(filePath)) {
        console.log(`  SKIP ${hullType}_floor_${v}`);
      } else {
        tasks.push({ hullType, variant: v });
      }
    }
  }

  if (tasks.length === 0) { console.log('\nAll done!'); return; }

  let completed = 0;
  let idx = 0;
  const errors: Array<{ hullType: string; variant: number; error: string }> = [];

  async function worker(): Promise<void> {
    while (idx < tasks.length) {
      const current = idx++;
      const task = tasks[current];
      if (!task) break;
      try {
        await generateAsset(task.hullType, task.variant);
        completed++;
        console.log(`\n=== Progress: ${completed}/${tasks.length} ===\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`ERROR ${task.hullType}_floor_${task.variant}: ${msg}`);
        errors.push({ hullType: task.hullType, variant: task.variant, error: msg });
        completed++;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, tasks.length) }, () => worker()));

  if (errors.length > 0) {
    console.log('\n=== ERRORS ===');
    for (const e of errors) console.log(`  ${e.hullType}_floor_${e.variant}: ${e.error}`);
    const retryPath = path.join(OUTPUT_DIR, 'retry.json');
    fs.writeFileSync(retryPath, JSON.stringify(errors, null, 2));
  }

  console.log('\n=== Done! ===');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
