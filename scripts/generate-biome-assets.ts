/**
 * Biome Asset Generator v3
 *
 * Pipeline per tile:
 *   1. flux-pro generates a 512x512 top-down terrain texture (fills entire image)
 *   2. sharp resizes to 512x256 (isometric squish)
 *   3. sharp applies diamond alpha mask → pixel-perfect iso tile
 *
 * Diamond vertices (512x256):
 *   top:    (256, 0)
 *   right:  (512, 128)  (=511 last pixel)
 *   bottom: (256, 256)  (=255 last pixel)
 *   left:   (0,   128)
 *
 * Usage: npx tsx scripts/generate-biome-assets.ts
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
import sharp from 'sharp';

// ---------------------------------------------------------------------------
// Tile dimensions
// ---------------------------------------------------------------------------

const TILE_W = 512;
const TILE_H = 256;
const GEN_SIZE = 512; // flux generates square, we squish to 2:1

// ---------------------------------------------------------------------------
// Diamond mask (created once, reused for all tiles)
// ---------------------------------------------------------------------------

function createDiamondMask(w: number, h: number): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <polygon points="${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}" fill="white"/>
  </svg>`;
  return Buffer.from(svg);
}

const DIAMOND_MASK_SVG = createDiamondMask(TILE_W, TILE_H);

// ---------------------------------------------------------------------------
// Prompts — top-down terrain textures that fill the entire image
// ---------------------------------------------------------------------------

const PROMPT_PREFIX = 'top-down aerial photograph, terrain texture filling entire image edge to edge, no sky, no horizon, no borders, no vignette, The Expanse sci-fi aesthetic, realistic';

function p(terrain: string, details: string): string {
  return `${PROMPT_PREFIX}, ${terrain}, ${details}`;
}

const BIOME_PROMPTS: Record<string, string> = {
  // EARTH_LIKE
  OCEAN: p('ocean water surface from directly above', 'deep blue water with gentle wave patterns and subtle foam, uniform water texture'),
  BEACH: p('sandy beach surface from directly above', 'fine golden sand with shell fragments and tiny pebbles, wave marks in sand'),
  PLAINS: p('grass field from directly above', 'green grass with small wildflowers, slightly weathered, natural meadow texture'),
  FOREST: p('dense forest canopy from directly above', 'lush green tree tops tightly packed, leaves and branches seen from above'),
  MOUNTAIN: p('rocky mountain surface from directly above', 'grey rugged stone with cracks and sparse moss, alpine rock texture'),
  SNOW_PEAK: p('snow covered ground from directly above', 'white snow on dark rock, ice crystals visible, frozen alpine texture'),
  SWAMP: p('swamp surface from directly above', 'dark murky water with green algae, moss patches, reeds and lily pads'),
  DESERT_PATCH: p('dry cracked earth from directly above', 'parched brown soil with deep cracks forming polygonal patterns, arid ground'),

  // DESERT
  SAND_DUNES: p('sand dune surface from directly above', 'golden sand with wind-swept ripple patterns, flowing dune texture'),
  ROCKY_DESERT: p('rocky desert ground from directly above', 'reddish-brown stones and gravel scattered on hard packed earth'),
  MESA: p('layered sedimentary rock from directly above', 'flat striped orange and red rock layers, mesa plateau surface'),
  SALT_FLAT: p('salt flat surface from directly above', 'bright white crystalline salt crust with hexagonal cracking pattern'),
  OASIS: p('desert oasis from directly above', 'small clear blue water pool surrounded by green palm vegetation on sand'),
  CANYON: p('canyon from directly above looking down', 'deep red-orange layered rock crevice, canyon walls visible from top'),

  // OCEAN planet
  DEEP_OCEAN: p('deep dark ocean from directly above', 'very dark blue-black water with faint bioluminescent specks'),
  SHALLOW_WATER: p('shallow tropical water from directly above', 'crystal clear turquoise water with visible light sandy bottom'),
  REEF: p('coral reef from directly above through water', 'colorful coral formations visible through clear water, sea plants'),
  ISLAND: p('small island from directly above', 'sandy atoll with green vegetation center surrounded by turquoise water'),
  KELP_FOREST: p('kelp forest from directly above through water', 'green-brown seaweed canopy visible through blue water surface'),
  VOLCANIC_VENT: p('hydrothermal vent from directly above', 'dark ocean floor rock with orange-yellow mineral deposits and hot shimmer'),

  // ICE
  GLACIER: p('glacier ice surface from directly above', 'compressed blue-white ice with ancient frozen layers and cracks'),
  FROZEN_LAKE: p('frozen lake surface from directly above', 'smooth transparent ice with radiating cracks over dark water below'),
  TUNDRA: p('tundra ground from directly above', 'brown-green sparse mossy ground with low hardy vegetation patches'),
  ICE_SHELF: p('ice shelf surface from directly above', 'thick white and blue layered ice platform with compacted snow'),
  PERMAFROST: p('permafrost ground from directly above', 'frozen dark earth with visible white ice veins and frost patterns'),
  CREVASSE: p('ice crevasse from directly above', 'white glacier ice with deep glowing blue crack splitting the surface'),

  // VOLCANIC
  LAVA_FLOW: p('lava flow from directly above', 'bright orange glowing molten rock with dark cooling black crust edges'),
  BASALT_PLAIN: p('basalt rock surface from directly above', 'dark grey hexagonal columnar basalt rock formation pattern'),
  ASH_FIELD: p('volcanic ash field from directly above', 'fine grey powdery ash covering ground with embedded dark rock fragments'),
  CALDERA: p('volcanic caldera from directly above', 'circular crater depression with yellow sulfur stains on dark rock'),
  OBSIDIAN_RIDGE: p('obsidian surface from directly above', 'glossy black volcanic glass with sharp jagged formations'),
  FUMAROLE: p('fumarole from directly above', 'yellow sulfur crystal deposits on rock with white steam wisps'),

  // BARREN
  REGOLITH: p('lunar regolith from directly above', 'fine grey moon-like dust with small scattered micro-craters'),
  CRATER: p('impact crater from directly above', 'circular bowl-shaped depression with raised rim in grey rock'),
  DUST_PLAIN: p('barren dust plain from directly above', 'flat grey-brown fine dusty surface with tiny scattered pebbles'),
  ROCKY_OUTCROP: p('rocky outcrop from directly above', 'sharp angular grey exposed rock formations jutting upward'),

  // TOXIC
  ACID_LAKE: p('toxic acid lake from directly above', 'sickly green-yellow bubbling corrosive liquid surface'),
  TOXIC_MARSH: p('toxic marsh from directly above', 'purple-green poisonous muck with dead decayed vegetation'),
  CORRODED_PLAIN: p('corroded terrain from directly above', 'chemically pitted and scarred brownish-green etched rock surface'),
  CHEMICAL_VENT: p('chemical vent from directly above', 'cracked dark rock with yellow-green toxic gas seeping from fissures'),
  CRYSTAL_FIELD: p('crystal field from directly above', 'large prismatic purple and blue crystal formations growing from ground'),

  // ASTEROID
  METALLIC_SURFACE: p('metallic asteroid surface from directly above', 'silvery iron-nickel rock with metallic sheen and grooves'),
  IMPACT_CRATER: p('asteroid crater from directly above', 'rough dark surface heavily pockmarked with micro-meteor impacts'),
  SILICATE_PLAIN: p('silicate asteroid surface from directly above', 'smooth light grey glassy mineral surface with fine texture'),
  CARBON_CRUST: p('carbonaceous asteroid surface from directly above', 'very dark matte coal-like surface with subtle texture'),
  FRACTURED_ZONE: p('fractured asteroid from directly above', 'broken dark rock with deep fissures and cracks throughout'),
  BOULDER_FIELD: p('boulder field from directly above', 'scattered large grey rocks on dark ground surface'),
  DUST_BASIN: p('cosmic dust basin from directly above', 'fine grey dust settled in shallow depression, smooth powder'),
  VOID_EDGE: p('asteroid edge from directly above', 'dark rock crumbling away into void, broken irregular rim'),

  // UNDERGROUND (sub-surface Z < 0)
  ROCK_LAYER: p('underground rock cross-section from directly above', 'solid grey-brown sedimentary rock layers with visible geological strata, compressed stone texture, natural cave ceiling viewed from below'),
  MINERAL_VEIN: p('underground mineral deposit from directly above', 'dark rock with glowing crystalline mineral veins running through it, blue and purple ore seams in grey stone, valuable deposit'),
  CAVE_FLOOR: p('natural cave floor from directly above', 'rough uneven cave floor with stalactite drip pools, wet dark stone, scattered gravel and small rock formations'),
  MAGMA_POCKET: p('underground magma chamber from directly above', 'dark rock with cracks revealing bright orange glowing magma underneath, volcanic heat, molten core visible through fissures'),
  DEEP_STONE: p('deep underground compressed rock from directly above', 'very dark dense metamorphic rock, extreme pressure texture, barely visible crystal inclusions, deep earth stone'),
  ICE_CAVERN: p('underground ice cave from directly above', 'translucent blue ice walls and ceiling, frozen underground cavern, icicles and frost crystals, dark rock visible through ice'),
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const VARIANTS_PER_BIOME = 4;
const MAX_CONCURRENT = 3;
const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'biomes');

// TEST_BIOMES: set to null to generate ALL, or list specific biomes for testing
const TEST_BIOMES: string[] | null = null;

// ---------------------------------------------------------------------------
// fal.ai API helpers
// ---------------------------------------------------------------------------

interface FalImage {
  url: string;
  content_type: string;
  width: number;
  height: number;
}

interface FluxResponse {
  images: FalImage[];
}

function fetchJson<T>(url: string, body: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = JSON.stringify(body);
    const mod = parsed.protocol === 'https:' ? https : http;

    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString();
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`fal.ai ${res.statusCode}: ${raw}`));
            return;
          }
          try {
            resolve(JSON.parse(raw) as T);
          } catch {
            reject(new Error(`Invalid JSON from fal.ai: ${raw.slice(0, 200)}`));
          }
        });
      },
    );

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
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers['location']) {
          doGet(res.headers['location']);
          return;
        }
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
// Image processing: resize + diamond mask
// ---------------------------------------------------------------------------

async function applyDiamondMask(imageBuffer: Buffer): Promise<Buffer> {
  // 1. Resize the square texture to 512x256 (isometric squish)
  const resized = await sharp(imageBuffer)
    .resize(TILE_W, TILE_H, { fit: 'fill' })
    .png()
    .toBuffer();

  // 2. Create the diamond mask as a greyscale image
  const mask = await sharp(DIAMOND_MASK_SVG)
    .resize(TILE_W, TILE_H)
    .greyscale()
    .png()
    .toBuffer();

  // 3. Apply mask: composite the mask as the alpha channel
  const result = await sharp(resized)
    .ensureAlpha()
    .composite([{
      input: mask,
      blend: 'dest-in',
    }])
    .png()
    .toBuffer();

  return result;
}

// ---------------------------------------------------------------------------
// Generation pipeline
// ---------------------------------------------------------------------------

async function generateAsset(biome: string, variant: number): Promise<string> {
  const prompt = BIOME_PROMPTS[biome];
  if (!prompt) throw new Error(`No prompt for biome: ${biome}`);

  const variantPrompt = variant > 0
    ? `${prompt}, variation ${variant + 1}, slightly different pattern`
    : prompt;

  console.log(`  [flux-pro] Generating ${biome}_${variant}...`);

  // Step 1: Generate square terrain texture
  const fluxResult = await fetchJson<FluxResponse>(
    'https://fal.run/fal-ai/flux-pro/v1.1',
    {
      prompt: variantPrompt,
      image_size: { width: GEN_SIZE, height: GEN_SIZE },
      num_images: 1,
      enable_safety_checker: false,
      seed: biome.length * 1000 + variant * 137,
    },
  );

  const generatedUrl = fluxResult.images[0]?.url;
  if (!generatedUrl) throw new Error(`No image returned for ${biome}_${variant}`);

  // Step 2: Download raw image
  console.log(`  [download] Fetching raw image...`);
  const rawBuffer = await downloadBuffer(generatedUrl);

  // Step 3: Resize to 512x256 + apply diamond mask
  console.log(`  [mask] Applying diamond mask (${TILE_W}x${TILE_H})...`);
  const maskedBuffer = await applyDiamondMask(rawBuffer);

  // Step 4: Save
  const biomeDir = path.join(OUTPUT_DIR, biome.toLowerCase());
  fs.mkdirSync(biomeDir, { recursive: true });

  const filePath = path.join(biomeDir, `${biome.toLowerCase()}_${variant}.png`);
  fs.writeFileSync(filePath, maskedBuffer);
  console.log(`  [save] ${filePath} (${Math.round(maskedBuffer.length / 1024)}KB)`);

  // Generate mipmaps for the new asset
  const { generateMipmapsForFile } = await import('./generate-mipmaps.js');
  const mipCount = await generateMipmapsForFile(filePath);
  if (mipCount > 0) console.log(`  [mipmaps] ${mipCount} generated`);

  return filePath;
}

async function processQueue(
  tasks: Array<{ biome: string; variant: number }>,
  concurrency: number,
): Promise<void> {
  let idx = 0;
  let completed = 0;
  const total = tasks.length;
  const errors: Array<{ biome: string; variant: number; error: string }> = [];

  async function worker(): Promise<void> {
    while (idx < tasks.length) {
      const current = idx++;
      const task = tasks[current];
      if (!task) break;

      try {
        await generateAsset(task.biome, task.variant);
        completed++;
        console.log(`\n=== Progress: ${completed}/${total} ===\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`ERROR generating ${task.biome}_${task.variant}: ${msg}`);
        errors.push({ biome: task.biome, variant: task.variant, error: msg });
        completed++;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  if (errors.length > 0) {
    console.log('\n=== ERRORS ===');
    for (const e of errors) {
      console.log(`  ${e.biome}_${e.variant}: ${e.error}`);
    }
    const retryPath = path.join(OUTPUT_DIR, 'retry.json');
    fs.writeFileSync(retryPath, JSON.stringify(errors, null, 2));
    console.log(`\nRetry list written to ${retryPath}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const biomesToGenerate = TEST_BIOMES
    ? Object.fromEntries(Object.entries(BIOME_PROMPTS).filter(([k]) => TEST_BIOMES.includes(k)))
    : BIOME_PROMPTS;

  const biomeCount = Object.keys(biomesToGenerate).length;
  console.log('=== Biome Asset Generator v3 ===');
  console.log(`Output:   ${OUTPUT_DIR}`);
  console.log(`Tile:     ${TILE_W}x${TILE_H} (diamond masked)`);
  console.log(`Generate: ${GEN_SIZE}x${GEN_SIZE} → resize → mask`);
  console.log(`Biomes:   ${biomeCount}${TEST_BIOMES ? ' (TEST MODE)' : ''}`);
  console.log(`Variants: ${VARIANTS_PER_BIOME}`);
  console.log(`Total:    ${biomeCount * VARIANTS_PER_BIOME} images\n`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const tasks: Array<{ biome: string; variant: number }> = [];
  for (const biome of Object.keys(biomesToGenerate)) {
    for (let v = 0; v < VARIANTS_PER_BIOME; v++) {
      const filePath = path.join(OUTPUT_DIR, biome.toLowerCase(), `${biome.toLowerCase()}_${v}.png`);
      if (fs.existsSync(filePath)) {
        console.log(`  SKIP ${biome}_${v} (already exists)`);
      } else {
        tasks.push({ biome, variant: v });
      }
    }
  }

  if (tasks.length === 0) {
    console.log('\nAll assets already generated!');
    return;
  }

  console.log(`\nGenerating ${tasks.length} assets (${MAX_CONCURRENT} concurrent)...\n`);
  await processQueue(tasks, MAX_CONCURRENT);

  console.log('\n=== Done! ===');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
