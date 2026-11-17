/**
 * Hull Asset Generator v4
 *
 * Pipeline: flux-pro (3D isometric hull at 30°) → birefnet (bg removal) → resize to 512x384
 *
 * Usage: npx tsx scripts/generate-hull-assets.ts
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

const OUT_W = 512;
const OUT_H = 512;
const GEN_SIZE = 1024;

/** Hull types that are low/flat platforms — generated wider & shorter, then placed at bottom of canvas */
const PLATFORM_TYPES = new Set(['PLATFORM_OUTDOOR', 'PLATFORM_UNDERWATER', 'PLATFORM_SPACE', 'COMPOSITE_PLATFORM_SPACE']);
const PLATFORM_GEN_W = 1024;
const PLATFORM_GEN_H = 544;

// ---------------------------------------------------------------------------
// Hull prompts — 3D isometric buildings
// ---------------------------------------------------------------------------

const ISO = 'isometric game asset, single 3D building module, 30 degree camera angle from horizontal, 2:1 isometric perspective, The Expanse sci-fi aesthetic, realism, transparent background, game sprite, centered, single object, no ground plane, no shadow';

const HULL_PROMPTS: Record<string, string> = {
  STARTER: `${ISO}, basic starter habitat module, simple boxy structure made of riveted iron plates, small porthole window, worn and weathered surface, copper-colored accents on bolts, minimal industrial design, low-tech shelter`,
  STANDARD: `${ISO}, standard cubic habitat module, clean reinforced steel cube building block, equal width depth and height, LED strip lighting along edges, ventilation grille on side, grey metal panels with blue accent lights, industrial sci-fi modular square room segment`,
  AIRTIGHT: `${ISO}, airtight sealed habitat module, smooth white composite panels with hermetic joints, glowing green status lights along seams, airlock hatch visible, vacuum-rated space station segment, sleek aerospace design`,
  PRESSURIZED: `${ISO}, pressurized cubic habitat module, thick-walled square building block with titanium pressure plates, visible circular pressure seals on flat walls, reinforcement ribs along edges, amber warning lights, heavy duty rectangular construction, dark teal metal panels, modular room segment for deep underground or underwater base`,
  REINFORCED: `${ISO}, heavy reinforced armored habitat module, thick angular blast-resistant armor plating, red emergency lights, heavy bulkhead door, dark gunmetal grey with orange hazard stripes, military bunker style`,
  PLATFORM_OUTDOOR: `${ISO}, low-profile open-air industrial platform, perfectly square footprint equal width and depth, very short height, steel grating deck with low safety railings along all four edges, open sides with no walls, exposed steel diamond plate floor, yellow caution stripes, pipe connections underneath, support struts visible, weathered grey steel with yellow markings`,
  PLATFORM_UNDERWATER: `${ISO}, low-profile underwater platform base, very short height compared to width, reinforced dark teal titanium base plate with transparent glass viewport panels on top surface, pressure-sealed edges, bioluminescent blue guide lights along rim, anchor mounting points, aquamarine and dark teal, flat and wide submarine foundation`,
  PLATFORM_SPACE: `${ISO}, low-profile open space platform, perfectly square footprint, very short height, lightweight carbon-fiber composite deck with metallic grid surface, magnetic clamps along edges, docking hardpoints, vacuum-rated exposed platform for zero-gravity construction, no walls, open sides, small thruster nozzles on corners for station-keeping, dark carbon black with cyan running lights along edges, deep space construction platform`,
  // --- new hull types (backend definitions) -------------------------------
  // Cube skeleton shared with STANDARD / PRESSURIZED / REINFORCED:
  //   <name> module, <cube clause + equal width depth and height>,
  //   <structure detail>, <surface material>, <colour + accent lights>,
  //   <purpose formula "... modular room segment ...">
  COMPOSITE: `${ISO}, composite armored habitat module, faceted composite armor cube building block, equal width depth and height, layered angular armor plates with chamfered facets, slim titanium frame rails along all edges and corners, fine woven carbon hex weave texture on the panel faces, matte dark charcoal composite panels with a few small white status lights, plain unmarked uniform plating, lightweight and tough modular room segment for warships and combat vehicles`,
  GLASS_CARBON: `${ISO}, bright glass and carbon habitat module, glass-walled cube building block, equal width depth and height, large glass window panels set in a slim woven carbon-fiber frame, warm bright interior light behind the glass, lush green plants and small trees visible inside through the glass, light silver-white carbon panels with warm white accent lights, bright and inviting modular garden room segment`,
  // Platform skeleton taken verbatim from PLATFORM_SPACE — only the deck
  // material, the edge/mount detail and the purpose clause are swapped.
  COMPOSITE_PLATFORM_SPACE: `${ISO}, low-profile armored open space platform, perfectly square footprint, very short height, layered composite armor plate deck with faceted armored top surface, reinforced armor edge beams along all sides, empty unarmed weapon hardpoints and bolted turret pedestal sockets on the deck, vacuum-rated exposed platform for warship laser mounts, no walls, open sides, small thruster nozzles on corners for station-keeping, dark gunmetal armor with dim white running lights along edges, armored warship weapon platform`,
};

const VARIANTS_PER_HULL = 1;
const MAX_CONCURRENT = 3;
const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'hulls');

// ---------------------------------------------------------------------------
// fal.ai helpers
// ---------------------------------------------------------------------------

interface FalImage { url: string; content_type: string; width: number; height: number; }
interface FluxResponse { images: FalImage[]; }
interface BirefnetResponse { image: FalImage; }

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
// Generation pipeline
// ---------------------------------------------------------------------------

async function generateAsset(hullType: string, variant: number): Promise<string> {
  const prompt = HULL_PROMPTS[hullType];
  if (!prompt) throw new Error(`No prompt for hull: ${hullType}`);

  const variantPrompt = variant > 0
    ? `${prompt}, variation ${variant + 1}, slightly different details`
    : prompt;

  const isPlatform = PLATFORM_TYPES.has(hullType);
  const genW = isPlatform ? PLATFORM_GEN_W : GEN_SIZE;
  const genH = isPlatform ? PLATFORM_GEN_H : GEN_SIZE;

  console.log(`  [flux-pro] Generating ${hullType}_${variant} (${genW}x${genH})...`);

  const fluxResult = await fetchJson<FluxResponse>(
    'https://fal.run/fal-ai/flux-pro/v1.1',
    {
      prompt: variantPrompt,
      image_size: { width: genW, height: genH },
      num_images: 1,
      enable_safety_checker: false,
      seed: hullType.length * 3000 + variant * 313 + (isPlatform ? 777 : 0),
    },
  );

  const generatedUrl = fluxResult.images[0]?.url;
  if (!generatedUrl) throw new Error(`No image for ${hullType}_${variant}`);

  console.log(`  [birefnet] Removing background...`);
  const bgResult = await fetchJson<BirefnetResponse>(
    'https://fal.run/fal-ai/birefnet',
    {
      image_url: generatedUrl,
      model: 'General Use (Light)',
      operating_resolution: '1024x1024',
      output_format: 'png',
    },
  );

  const finalUrl = bgResult.image?.url;
  if (!finalUrl) throw new Error(`No birefnet result for ${hullType}_${variant}`);

  console.log(`  [process] Downloading and compositing to ${OUT_W}x${OUT_H}...`);
  const rawBuffer = await downloadBuffer(finalUrl);

  let result: Buffer;
  if (isPlatform) {
    // 1. Trim transparent pixels to get tight bounding box
    const trimmed = await sharp(rawBuffer).trim().png().toBuffer();
    const trimMeta = await sharp(trimmed).metadata();
    const tw = trimMeta.width ?? OUT_W;
    const th = trimMeta.height ?? OUT_H;

    // 2. Scale so width fills canvas exactly (512px wide)
    const scale = OUT_W / tw;
    const scaledH = Math.round(th * scale);
    const scaled = await sharp(trimmed)
      .resize(OUT_W, scaledH, { fit: 'fill' })
      .png()
      .toBuffer();

    // 3. Place at bottom of 512x512 canvas — bottom pixel touches bottom edge
    const topOffset = Math.max(0, OUT_H - scaledH);
    result = await sharp({ create: { width: OUT_W, height: OUT_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: scaled, left: 0, top: topOffset }])
      .png()
      .toBuffer();
  } else {
    result = await sharp(rawBuffer)
      .resize(OUT_W, OUT_H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }

  const hullDir = path.join(OUTPUT_DIR, hullType.toLowerCase());
  fs.mkdirSync(hullDir, { recursive: true });

  const filePath = path.join(hullDir, `${hullType.toLowerCase()}_${variant}.png`);
  fs.writeFileSync(filePath, result);
  console.log(`  [save] ${filePath} (${Math.round(result.length / 1024)}KB)`);

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
  const hullTypes = Object.keys(HULL_PROMPTS);
  const total = hullTypes.length * VARIANTS_PER_HULL;

  console.log('=== Hull Asset Generator v4 ===');
  console.log(`Output:   ${OUTPUT_DIR}`);
  console.log(`Size:     ${OUT_W}x${OUT_H}`);
  console.log(`Hulls:    ${hullTypes.length}`);
  console.log(`Variants: ${VARIANTS_PER_HULL}`);
  console.log(`Total:    ${total} images\n`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const tasks: Array<{ hullType: string; variant: number }> = [];
  for (const hullType of hullTypes) {
    for (let v = 0; v < VARIANTS_PER_HULL; v++) {
      const filePath = path.join(OUTPUT_DIR, hullType.toLowerCase(), `${hullType.toLowerCase()}_${v}.png`);
      if (fs.existsSync(filePath)) {
        console.log(`  SKIP ${hullType}_${v}`);
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
        console.error(`ERROR ${task.hullType}_${task.variant}: ${msg}`);
        errors.push({ hullType: task.hullType, variant: task.variant, error: msg });
        completed++;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, tasks.length) }, () => worker()));

  if (errors.length > 0) {
    console.log('\n=== ERRORS ===');
    for (const e of errors) console.log(`  ${e.hullType}_${e.variant}: ${e.error}`);
  }

  console.log('\n=== Done! ===');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
