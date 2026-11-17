/**
 * Generate 512x512 resource icons via fal.ai image generation API.
 * Includes background removal (birefnet/v2) and trim+pad to 512x512.
 *
 * Usage: npx ts-node scripts/generate-resource-assets.ts
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

const OUTPUT_DIR = path.resolve(__dirname, '../src/assets/resources');

const BASE_STYLE = 'isometric game icon, single resource item, 30 degree camera angle, 2:1 isometric perspective, The Expanse sci-fi aesthetic, photorealistic textures, transparent background, game sprite, centered, single object, no ground plane, no shadow, clean edges';

interface ResourcePrompt {
  name: string;
  dir: string;
  prompt: string;
}

const RESOURCES: ResourcePrompt[] = [
  // Natural - Ores
  { name: 'IRON', dir: 'iron', prompt: `${BASE_STYLE}, chunk of raw iron ore, dark metallic gray with reddish oxidation spots, rough crystalline surface, heavy dense mineral rock` },
  { name: 'COPPER', dir: 'copper', prompt: `${BASE_STYLE}, chunk of raw copper ore, green-teal patina and bright orange copper streaks, rough natural mineral formation` },
  { name: 'ALUMINUM', dir: 'aluminum', prompt: `${BASE_STYLE}, raw aluminum bauxite ore chunk, reddish-brown earthy mineral with silvery metallic veins, rough porous surface` },
  { name: 'TITANIUM', dir: 'titanium', prompt: `${BASE_STYLE}, raw titanium ore chunk, dark silvery-blue metallic mineral, dense and heavy looking, iridescent sheen on fracture surfaces` },
  { name: 'SILICON', dir: 'silicon', prompt: `${BASE_STYLE}, raw silicon crystal chunk, dark gray with glassy crystalline fractures, semiconductor-like appearance, sharp geometric edges` },
  { name: 'URANIUM', dir: 'uranium', prompt: `${BASE_STYLE}, uranium ore chunk, dark green-black mineral with faint radioactive green glow, hazardous looking, dense heavy rock` },
  { name: 'RARE_EARTHS', dir: 'rare_earths', prompt: `${BASE_STYLE}, rare earth mineral sample, colorful iridescent crystals in matrix rock, pink and purple and blue crystalline inclusions, exotic looking mineral` },
  { name: 'PLATINUM_GROUP', dir: 'platinum_group', prompt: `${BASE_STYLE}, platinum group metals nugget, bright silvery-white highly reflective metallic chunk, mirror-like polished surfaces, precious metal` },
  { name: 'SULFUR', dir: 'sulfur', prompt: `${BASE_STYLE}, sulfur crystal cluster, bright vivid yellow crystalline formation, translucent edges, volcanic mineral deposit` },
  { name: 'CARBON', dir: 'carbon', prompt: `${BASE_STYLE}, carbon chunk, jet black with diamond-like crystalline facets, some graphite layers visible, dark lustrous surface` },
  // Natural - Gases
  { name: 'NITROGEN', dir: 'nitrogen', prompt: `${BASE_STYLE}, nitrogen canister, pressurized cylindrical metal container with frost and condensation, cold blue-white vapor wisps, cryogenic storage tank, N2 label` },
  { name: 'OXYGEN', dir: 'oxygen', prompt: `${BASE_STYLE}, oxygen canister, pressurized cylindrical metal container, white and blue color scheme, O2 hazard label, medical-grade clean appearance` },
  { name: 'HYDROGEN', dir: 'hydrogen', prompt: `${BASE_STYLE}, hydrogen fuel cell container, sleek pressurized tank, red hazard markings, H2 label, futuristic energy storage, slight blue glow` },
  { name: 'HELIUM_3', dir: 'helium_3', prompt: `${BASE_STYLE}, helium-3 container, advanced fusion fuel canister, glowing pale purple-blue plasma visible through viewport, He-3 label, high-tech containment` },
  { name: 'METHANE', dir: 'methane', prompt: `${BASE_STYLE}, methane gas canister, industrial pressurized cylinder, orange hazard diamond, CH4 label, frost on valve, natural gas container` },
  // Natural - Liquids
  { name: 'WATER', dir: 'water', prompt: `${BASE_STYLE}, water container, transparent industrial water tank with clear blue water visible inside, condensation droplets, industrial cap and valve, clean` },
  { name: 'AMMONIA', dir: 'ammonia', prompt: `${BASE_STYLE}, ammonia container, chemical storage cylinder, yellow-green hazard coloring, NH3 label, industrial chemical tank, corrosion-resistant coating` },
  { name: 'CRYOGENIC_FLUIDS', dir: 'cryogenic_fluids', prompt: `${BASE_STYLE}, cryogenic fluid dewar, insulated double-walled container, heavy frost and ice crystals forming on surface, cold vapor, silver and white, super-cooled liquid` },
  { name: 'HYDROCARBONS', dir: 'hydrocarbons', prompt: `${BASE_STYLE}, hydrocarbon fuel barrel, dark crude oil container, industrial drum with black viscous liquid, petroleum product, dark amber and black` },
  // Natural - Exotic
  { name: 'TIDAL_CRYSTALS', dir: 'tidal_crystals', prompt: `${BASE_STYLE}, alien tidal crystal formation, luminescent deep blue and aquamarine crystals, pulsing inner glow, exotic extraterrestrial mineral, otherworldly` },
  { name: 'NULL_G_MATERIALS', dir: 'null_g_materials', prompt: `${BASE_STYLE}, zero-gravity manufactured material sample, perfectly spherical metallic orb with impossible internal lattice structure visible, floating micro-particles, space-manufactured exotic material` },
  { name: 'DEEP_CORE_ORES', dir: 'deep_core_ores', prompt: `${BASE_STYLE}, deep planetary core ore sample, extremely dense dark metallic chunk with glowing orange-red veins of heat, compressed under extreme pressure, partially molten appearance` },
  // Produced
  { name: 'IRON_PLATE', dir: 'iron_plate', prompt: `${BASE_STYLE}, stack of refined iron plates, flat polished steel sheets stacked neatly, brushed metal surface, industrial manufactured product, silver-gray` },
  { name: 'COPPER_WIRE', dir: 'copper_wire', prompt: `${BASE_STYLE}, coil of copper wire, bright shiny copper colored wire wound in neat spool, electrical conductor, orange-gold metallic sheen` },
  { name: 'SILICON_WAFER', dir: 'silicon_wafer', prompt: `${BASE_STYLE}, stack of silicon wafers, thin circular semiconductor discs, mirror-like dark reflective surface, rainbow diffraction pattern, high-tech electronics component` },
  { name: 'ALUMINUM_PLATE', dir: 'aluminum_plate', prompt: `${BASE_STYLE}, stack of aluminum plates, lightweight silvery metal sheets, slightly matte brushed finish, lighter and thinner than steel plates` },
  { name: 'TITANIUM_PLATE', dir: 'titanium_plate', prompt: `${BASE_STYLE}, stack of titanium alloy plates, dark silvery-blue aerospace-grade metal sheets, strong and lightweight, premium quality finish` },
  { name: 'ELECTRONICS', dir: 'electronics', prompt: `${BASE_STYLE}, circuit board assembly, green PCB with mounted microchips and capacitors and resistors, gold traces, modern electronics module, compact` },
  { name: 'STRUCTURAL_FRAME', dir: 'structural_frame', prompt: `${BASE_STYLE}, structural steel frame section, welded I-beam framework piece, construction component, dark gray painted steel with bolt holes, sturdy industrial` },
  { name: 'MOTOR', dir: 'motor', prompt: `${BASE_STYLE}, electric motor unit, cylindrical brushless motor with visible copper coils, shaft and mounting plate, industrial servo motor, compact powerful` },
  { name: 'PLASTIC', dir: 'plastic', prompt: `${BASE_STYLE}, industrial plastic pellets in container, translucent white polymer granules in clear bin, raw plastic manufacturing material, clean` },
  { name: 'FERTILIZER', dir: 'fertilizer', prompt: `${BASE_STYLE}, fertilizer compound bag, sealed industrial sack with green and brown granules visible, agricultural chemical product, NPK label` },
  { name: 'FUSION_FUEL', dir: 'fusion_fuel', prompt: `${BASE_STYLE}, fusion fuel rod, advanced energy rod with bright blue-white plasma core visible through containment glass, glowing intensely, high-tech power source` },
  { name: 'HULL_PIECE', dir: 'hull_piece', prompt: `${BASE_STYLE}, spaceship hull panel section, curved armored metal plate with mounting brackets, dark gray space-grade composite, reinforced structural panel` },
  { name: 'ENERGY', dir: 'energy', prompt: `${BASE_STYLE}, energy cell, glowing yellow-white power cell crystal, lightning-like energy visible inside transparent casing, bright warm glow, abstract power icon` },
  { name: 'HOUSING', dir: 'housing', prompt: `${BASE_STYLE}, habitat module miniature, small living quarters cross-section showing bed and life support, cozy interior visible, blue atmospheric lighting, life support icon` },
  { name: 'ADVANCED_ELECTRONICS', dir: 'advanced_electronics', prompt: `${BASE_STYLE}, advanced circuit board assembly, multi-layer green PCB with high-density microchips, gold-plated connectors, surface-mount components, quantum processor chip in center with holographic sheen, premium high-tech electronics module, blue LED indicators` },
  { name: 'GLASS', dir: 'glass', prompt: `${BASE_STYLE}, stack of glass panels, transparent flat sheets with slight blue-green tint, smooth polished edges, light refracting through layers, industrial glass product, clear and pristine` },
  { name: 'CARBON_FIBER', dir: 'carbon_fiber', prompt: `${BASE_STYLE}, roll of carbon fiber material, black woven textile with distinctive crosshatch pattern, partially unrolled showing the weave texture, lightweight aerospace material, dark with subtle sheen` },
  { name: 'MODULE_KIT', dir: 'module_kit', prompt: `${BASE_STYLE}, modular construction kit crate, open industrial crate showing neatly packed components inside - structural beams, wiring harnesses, circuit boards, bolts, sealed tool pouches, assembly manual, organized parts kit, dark gray crate with cyan labeling` },
  { name: 'PROTEIN', dir: 'protein', prompt: `${BASE_STYLE}, protein bio-capsule, translucent pink-red protein crystal in sealed containment capsule, organic bio-material with visible protein strand structure inside, soft bioluminescent glow, laboratory specimen container, biotech aesthetic` },
];

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

async function generateImage(prompt: string): Promise<Buffer> {
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

async function trimAndPad512(inputBuffer: Buffer): Promise<Buffer> {
  // Trim transparent pixels
  const trimmedPng = await sharp(inputBuffer)
    .trim()
    .png()
    .toBuffer();

  // Get dimensions of trimmed image
  const meta = await sharp(trimmedPng).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;

  // Scale to fit in 512x512 while maintaining aspect ratio
  const scale = Math.min(512 / width, 512 / height);
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

  // Pad to exactly 512x512
  const padLeft = Math.floor((512 - rw) / 2);
  const padTop = Math.floor((512 - rh) / 2);

  return sharp(resized)
    .extend({
      top: padTop,
      bottom: 512 - rh - padTop,
      left: padLeft,
      right: 512 - rw - padLeft,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function processResource(res: ResourcePrompt): Promise<'generated' | 'skipped' | 'failed'> {
  const outDir = path.join(OUTPUT_DIR, res.dir);
  const outFile = path.join(outDir, `${res.dir}_0.png`);

  if (fs.existsSync(outFile)) {
    console.log(`  SKIP ${res.name} — already exists`);
    return 'skipped';
  }

  fs.mkdirSync(outDir, { recursive: true });

  console.log(`  ${res.name} — generating...`);

  // Step 1: Generate via flux/dev
  const rawBuffer = await generateImage(res.prompt);
  console.log(`    generated (${rawBuffer.length} bytes)`);

  // Step 2: Upload to fal storage for BG removal
  console.log('    uploading for BG removal...');
  const falUrl = await uploadToFal(rawBuffer, `${res.dir}_raw.png`);

  // Step 3: Remove background
  console.log('    removing background...');
  const noBgBuffer = await removeBackground(falUrl);
  console.log(`    BG removed (${noBgBuffer.length} bytes)`);

  // Step 4: Trim + pad to 512x512
  console.log('    trimming + padding to 512x512...');
  const finalBuffer = await trimAndPad512(noBgBuffer);

  fs.writeFileSync(outFile, finalBuffer);
  console.log(`    saved: ${outFile}`);
  return 'generated';
}

async function main(): Promise<void> {
  console.log('=== Resource Asset Generation ===');
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Total resources: ${RESOURCES.length}`);
  console.log('');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results: Record<string, string> = {};
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < RESOURCES.length; i++) {
    const res = RESOURCES[i];
    console.log(`[${i + 1}/${RESOURCES.length}] ${res.name}`);

    try {
      const status = await processResource(res);
      results[res.name] = status;
      if (status === 'generated') generated++;
      else if (status === 'skipped') skipped++;
    } catch (err) {
      console.error(`    FAILED: ${err}`);
      results[res.name] = 'failed';
      failed++;
    }

    console.log('');
  }

  // Summary
  console.log('=== SUMMARY ===');
  console.log(`Generated: ${generated}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Failed:    ${failed}`);
  console.log('');

  if (failed > 0) {
    console.log('Failed resources:');
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
