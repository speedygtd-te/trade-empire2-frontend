/**
 * Generate population system module assets via fal.ai.
 * Generates image, removes background, trims, and pads to 512x512.
 *
 * Usage: npx ts-node scripts/generate-population-assets.ts
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

const OUTPUT_DIR = path.resolve(__dirname, '../src/assets/modules');

const BASE_STYLE = 'isometric game asset, single 3D building module, 30 degree camera angle from horizontal, 2:1 isometric perspective, The Expanse sci-fi aesthetic, photorealistic textures, realistic worn and dirty metal surfaces, transparent background, game sprite, centered, single object, no ground plane, no shadow, no walls, no enclosure';

interface ModulePrompt {
  name: string;
  dir: string;
  prompt: string;
}

const MODULES: ModulePrompt[] = [
  // Housing (5)
  { name: 'HABITAT', dir: 'habitat', prompt: `${BASE_STYLE}, basic space habitat living quarters module, simple bunk beds visible through windows, minimal life support systems, cramped functional living space, gray metal walls with small porthole windows, basic ventilation ducts, utilitarian design` },
  { name: 'HABITAT_T2', dir: 'habitat_t2', prompt: `${BASE_STYLE}, improved worker housing module, small private rooms visible through larger windows, shared common area, better ventilation and lighting, clean white and gray walls, blue accent lighting, modest but comfortable` },
  { name: 'HABITAT_T3', dir: 'habitat_t3', prompt: `${BASE_STYLE}, comfortable skilled worker apartments module, spacious rooms with furniture visible, balcony areas, green plants near windows, warm interior lighting, modern design with wood and metal elements, quality living space` },
  { name: 'HABITAT_T4', dir: 'habitat_t4', prompt: `${BASE_STYLE}, luxury expert housing module, large panoramic windows showing elegant interiors, high ceilings, premium materials, sleek modern architecture, ambient blue-white lighting, rooftop garden area, upscale residential` },
  { name: 'HABITAT_T5', dir: 'habitat_t5', prompt: `${BASE_STYLE}, elite penthouse habitat module, glass dome top with garden visible, lavish interior, holographic displays, premium architecture with gold accents, exclusive and prestigious, panoramic observation deck, the finest living quarters` },

  // Entertainment (3)
  { name: 'RECREATION_CORNER', dir: 'recreation_corner', prompt: `${BASE_STYLE}, small recreation corner module, cozy lounge area with seating, small bar counter, holographic game table, warm ambient lighting, compact entertainment space, neon accent signs` },
  { name: 'ENTERTAINMENT_CENTER', dir: 'entertainment_center', prompt: `${BASE_STYLE}, entertainment center module, large open space with multiple activity zones, holographic cinema screen, dance floor with colored lights, bar and lounge areas, vibrant neon lighting, bustling social hub` },
  { name: 'EXPERIENCE_ARENA', dir: 'experience_arena', prompt: `${BASE_STYLE}, immersive experience arena module, large dome structure with holographic projectors inside, VR pods visible, spectacular light show effects, futuristic entertainment megastructure, purple and blue neon glow` },

  // Simple Education (2)
  { name: 'BASIC_SCHOOL', dir: 'basic_school', prompt: `${BASE_STYLE}, basic school module, small classroom with desks and digital blackboard visible through windows, simple learning environment, books and tablets, modest educational building, yellow and white color scheme` },
  { name: 'ADVANCED_SCHOOL', dir: 'advanced_school', prompt: `${BASE_STYLE}, advanced school module, multiple classrooms visible, computer lab with holographic displays, library section, science equipment, larger educational facility, blue and white professional design` },

  // Advanced Education (2)
  { name: 'ACADEMY', dir: 'academy', prompt: `${BASE_STYLE}, military-style academy module, training facilities visible, simulation pods, tactical displays, structured layout, disciplined architecture, dark blue and silver, insignia and banners` },
  { name: 'UNIVERSITY', dir: 'university', prompt: `${BASE_STYLE}, space university module, large lecture hall with holographic professor, research labs visible, extensive library with data terminals, prestigious academic institution, grand architecture, white marble and glass` },

  // Elite Education (2)
  { name: 'RESEARCH_INSTITUTE', dir: 'research_institute', prompt: `${BASE_STYLE}, advanced research institute module, cutting-edge laboratory equipment, quantum computing arrays, particle accelerator ring visible, clean room environments, ultra-modern scientific facility, white and chrome` },
  { name: 'ELITE_ACADEMY', dir: 'elite_academy', prompt: `${BASE_STYLE}, exclusive elite academy module, small seminar rooms with holographic tutors, exclusive private study pods, AI-assisted learning stations, premium materials throughout, gold and dark blue, prestigious exclusive institution` },

  // Nature (3)
  { name: 'PARK_MODULE', dir: 'park_module', prompt: `${BASE_STYLE}, indoor park module, green grass area with small trees, walking paths, benches, artificial sky dome ceiling with blue light, small fountain, peaceful green oasis inside a space station, lush vegetation` },
  { name: 'GREENHOUSE', dir: 'greenhouse', prompt: `${BASE_STYLE}, large greenhouse module, glass dome filled with tropical plants and trees, hydroponic growing systems, mist sprayers, lush green interior, botanical garden feel, warm humid atmosphere visible through condensation on glass` },
  { name: 'BIOSPHERE', dir: 'biosphere', prompt: `${BASE_STYLE}, complete biosphere module, large biodome with entire ecosystem inside, waterfall, forest area, pond, birds visible, self-contained nature environment, the most advanced life support, spectacular natural habitat` },

  // Health (3)
  { name: 'SANITATION_STATION', dir: 'sanitation_station', prompt: `${BASE_STYLE}, sanitation and hygiene station module, water purification tanks, waste processing unit, clean sterile environment, medical waste disposal, white tiles and stainless steel, basic healthcare infrastructure` },
  { name: 'HOSPITAL', dir: 'hospital', prompt: `${BASE_STYLE}, space hospital module, medical bay with beds visible through windows, surgical suite, diagnostic imaging equipment, pharmacy section, red cross emblem, white and red clinical design, professional medical facility` },
  { name: 'MEDICAL_CENTER', dir: 'medical_center', prompt: `${BASE_STYLE}, advanced medical center module, regeneration pods with blue glow, robotic surgery arms, genetic therapy lab, holographic diagnostic displays, cutting-edge medical technology, pristine white with cyan accents` },

  // Security (2)
  { name: 'GUARD_POST', dir: 'guard_post', prompt: `${BASE_STYLE}, guard post module, small security checkpoint, reinforced windows, surveillance camera array, weapon rack visible, armored door, security barriers, dark gray with red warning stripes, military-grade security` },
  { name: 'SECURITY_CENTER', dir: 'security_center', prompt: `${BASE_STYLE}, security command center module, large surveillance monitoring wall with multiple screens, tactical operations room, detention cells, armory vault, heavy fortification, dark steel with blue security lighting` },

  // Prestige (3)
  { name: 'GALLERY', dir: 'gallery', prompt: `${BASE_STYLE}, art gallery module, open exhibition space with holographic art displays, sculpture pedestals, elegant spotlighting, minimalist white interior with floating art installations, cultural sophistication` },
  { name: 'MONUMENT', dir: 'monument', prompt: `${BASE_STYLE}, monumental prestige structure module, tall spire or obelisk with glowing energy core, commemorative plaza, impressive architectural landmark, gold and polished stone, beacon light at top, symbol of achievement` },
  { name: 'LUXURY_PROMENADE', dir: 'luxury_promenade', prompt: `${BASE_STYLE}, luxury shopping promenade module, upscale storefronts with holographic displays, water features, premium materials, marble floors visible, boutique shops, golden lighting, exclusive high-end commercial space` },

  // Life Support (1)
  { name: 'LIFE_SUPPORT', dir: 'life_support', prompt: `${BASE_STYLE}, life support system module, large oxygen generation tanks, CO2 scrubber arrays, atmospheric processors, water recycling system, temperature control units, critical infrastructure with redundant systems, white with green status lights` },
];

// ── HTTP helpers ──

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── fal.ai pipeline ──

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

  if (!submit.status_url || !submit.response_url) {
    throw new Error(`Submit failed: ${submitRaw}`);
  }

  process.stdout.write('    polling');
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
  const trimmedPng = await sharp(inputBuffer)
    .trim()
    .png()
    .toBuffer();

  const meta = await sharp(trimmedPng).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;
  const size = Math.max(width, height);

  // Pad to square first
  const padLeft = Math.floor((size - width) / 2);
  const padTop = Math.floor((size - height) / 2);

  const squareBuffer = await sharp(trimmedPng)
    .extend({
      top: padTop,
      bottom: size - height - padTop,
      left: padLeft,
      right: size - width - padLeft,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  // Resize to 512x512
  return sharp(squareBuffer)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

// ── Main ──

async function main(): Promise<void> {
  console.log('=== Population Module Asset Generator ===');
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Modules: ${MODULES.length}`);
  console.log('');

  const results: { name: string; status: string }[] = [];

  for (const mod of MODULES) {
    const outDir = path.join(OUTPUT_DIR, mod.dir);
    const outFile = path.join(outDir, `${mod.dir}_0.png`);

    if (fs.existsSync(outFile)) {
      console.log(`SKIP ${mod.name} — already exists`);
      results.push({ name: mod.name, status: 'SKIPPED' });
      continue;
    }

    // Create output directory
    fs.mkdirSync(outDir, { recursive: true });

    try {
      console.log(`[${results.length + 1}/${MODULES.length}] ${mod.name}`);

      // Step 1: Generate image
      console.log('    generating...');
      const rawBuffer = await generateImage(mod.prompt);
      console.log(`    generated (${rawBuffer.length} bytes)`);

      // Step 2: Upload for background removal
      console.log('    uploading for BG removal...');
      const falUrl = await uploadToFal(rawBuffer, `${mod.dir}_raw.png`);

      // Step 3: Remove background
      console.log('    removing background...');
      const noBgBuffer = await removeBackground(falUrl);
      console.log(`    BG removed (${noBgBuffer.length} bytes)`);

      // Step 4: Trim + pad to 512x512
      console.log('    trimming + padding to 512x512...');
      const finalBuffer = await trimAndPad512(noBgBuffer);

      // Step 5: Save
      fs.writeFileSync(outFile, finalBuffer);
      console.log(`    SAVED: ${outFile}`);
      console.log('');

      results.push({ name: mod.name, status: 'OK' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`    FAILED: ${msg}`);
      console.log('');
      results.push({ name: mod.name, status: `FAILED: ${msg}` });
    }
  }

  // Summary
  console.log('');
  console.log('=== SUMMARY ===');
  const ok = results.filter((r) => r.status === 'OK' || r.status === 'SKIPPED').length;
  const failed = results.filter((r) => r.status.startsWith('FAILED')).length;
  console.log(`Total: ${results.length} | Success/Skipped: ${ok} | Failed: ${failed}`);
  console.log('');
  for (const r of results) {
    const icon = r.status === 'OK' ? '[OK]' : r.status === 'SKIPPED' ? '[SKIP]' : '[FAIL]';
    console.log(`  ${icon} ${r.name} — ${r.status}`);
  }
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
