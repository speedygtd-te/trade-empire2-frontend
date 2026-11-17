/**
 * Style-test ONLY: candidate module sprites for ORBITAL_COLLECTOR,
 * SPACE_TELESCOPE_MODULE, WORMHOLE_MODULE. CANDIDATES ONLY — NO integration
 * into src/assets/modules/, NO cap sync, NO commit.
 *
 * Pipeline mirrors the proven scripts/generate-module-gap-fill.ts:
 *   flux/dev @512x512  ->  birefnet/v2 background removal  ->  sharp trim + pad
 *   to 1:1 square  ->  PNG (transparent bg, tight crop). Also writes a _half PNG.
 *
 * Style anchors taken verbatim from generate-module-gap-fill.ts BASE_STYLE so the
 * candidates read as siblings of the existing module family (collector / telescope).
 *
 * Output: assets/style-test/modules/<module_id>_c<N>.png (+ _half.png)
 *
 * Usage: node scripts/style-test-module-candidates.cjs [moduleId]
 *   moduleId optional (orbital_collector | space_telescope_module | wormhole_module)
 *   -> generate only that module's candidates.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');

// ── load fal key from scripts/.env ──
try {
  const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const FAL_API_KEY = process.env.FAL_API_KEY || process.env.FAL_AI_API_KEY;
if (!FAL_API_KEY) { console.error('No fal key'); process.exit(1); }

const OUT = path.join(__dirname, '..', 'assets', 'style-test', 'modules');

// verbatim from generate-module-gap-fill.ts
const BASE_STYLE =
  'isometric game asset, single 3D building module, 30 degree camera angle from horizontal, ' +
  '2:1 isometric perspective, The Expanse sci-fi aesthetic, photorealistic textures, ' +
  'realistic worn industrial metal surfaces, transparent background, game sprite, centered, ' +
  'single object, no ground plane, no shadow, no walls, no enclosure, lit from upper-left';

const NEGATIVE_PROMPT =
  'cartoon, anime, fantasy, magical glow, bright neon colors, steampunk, dragons, runes, glyphs, ' +
  'text, logos, watermark, background, scene, landscape, ground, floor, human figures';

// 3 modules, 3 candidates each, fixed seeds (no Math.random), varied emphasis.
const MODULES = {
  orbital_collector: [
    {
      seed: 410101,
      prompt:
        'orbital resource collector module, space-based extraction unit, large gaping intake scoop / funnel mouth ' +
        'at front for skimming gas and dust, internal spinning turbine fan visible through the intake, ' +
        'condensation coils and pressurized canister tanks connected by tubes along the body, ' +
        'compact solar collector vanes folded along the sides, light grey and blue accent hull, glowing cyan vents, ' +
        'orbital satellite collector aesthetic',
    },
    {
      seed: 410238,
      prompt:
        'orbital collector satellite module, space mining drone, wide ram-scoop intake funnel on top feeding a ' +
        'central separation drum, gas storage spheres clustered at the rear, thruster vernier nozzles, ' +
        'extended sensor mast, worn grey-blue metal hull with cyan glowing intake glow, ' +
        'a heavier orbital sibling of the atmospheric gas collector',
    },
    {
      seed: 410377,
      prompt:
        'space-based collector module, orbital harvester, large front intake cone with a visible spinning fan, ' +
        'twin pressurized gas canisters flanking the body, condenser coils, antenna and docking ring, ' +
        'dirty grey hull with blue trim and cyan accent lights, compact rugged spacecraft form factor',
    },
  ],
  space_telescope_module: [
    {
      seed: 520101,
      prompt:
        'large space telescope module, big segmented hexagonal primary mirror dish open to the sky on an ' +
        'elevation mount, long instrument barrel behind the mirror, sensor array housing and gold thermal ' +
        'foil sunshield panels, communication uplink dish, grey metal hull with subtle warning markings, ' +
        'a bigger orbital sibling of the telescope module',
    },
    {
      seed: 520242,
      prompt:
        'large space observatory telescope module, long cylindrical reflector telescope tube on a heavy ' +
        'rotating gimbal mount, open aperture cover at the front, side-mounted sensor pods and radiator fins, ' +
        'star-tracker antennas, weathered grey hull with subtle yellow markings, imposing deep-space telescope',
    },
    {
      seed: 520383,
      prompt:
        'space telescope sensor module, large parabolic dish reflector on an articulated elevation mount over ' +
        'a wide instrument base, spectrometer housing, communication uplink antenna, layered thermal shield, ' +
        'grey metal hull with subtle warning markings, scaled-up deep-space sensor array',
    },
  ],
  wormhole_module: [
    {
      seed: 630101,
      prompt:
        'wormhole generator module, exotic-energy gateway device, large vertical ring portal frame mounted on a ' +
        'heavy industrial base, dense cabling and superconducting magnet coils wrapped around the ring, ' +
        'a faint pale blue exotic-energy shimmer suspended in the center of the ring, capacitor banks and ' +
        'cooling radiators on the base, worn dark grey hull with hazard markings, advanced physics device',
    },
    {
      seed: 630244,
      prompt:
        'wormhole gateway module, twin curved field emitter arms arcing toward each other to form an opening, ' +
        'thick power conduits and containment coils, a subtle distortion lens of pale cyan light forming ' +
        'between the emitter tips, reinforced base with capacitor stacks and heat sinks, dirty dark metal hull ' +
        'with caution stripes, exotic spacetime device',
    },
    {
      seed: 630386,
      prompt:
        'wormhole generator module, compact toroidal accelerator ring lying tilted on a braced industrial cradle, ' +
        'segmented magnet housings around the torus, exotic-matter injector ports, a faint blue energy haze ' +
        'inside the ring aperture, control cabinets and radiator panels on the base, weathered grey-blue hull ' +
        'with warning markings, advanced sci-fi exotic-energy machine',
    },
  ],
};

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
function httpsGet(url, headers) {
  const u = new URL(url);
  return httpsRequest({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers });
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const dl = (u) => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) { dl(res.headers.location); return; }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    };
    dl(url);
  });
}

async function generateImage(prompt, seed) {
  const fullPrompt = `${prompt}, ${BASE_STYLE}`;
  const submitBody = JSON.stringify({
    prompt: fullPrompt, negative_prompt: NEGATIVE_PROMPT,
    image_size: { width: 512, height: 512 }, num_inference_steps: 28,
    guidance_scale: 7.5, num_images: 1, enable_safety_checker: false,
    output_format: 'png', seed,
  });
  const submitRaw = await httpsRequest({
    hostname: 'queue.fal.run', path: '/fal-ai/flux/dev', method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
  }, submitBody);
  const submit = JSON.parse(submitRaw);
  if (!submit.status_url) throw new Error(`Submit failed: ${submitRaw.slice(0, 300)}`);
  process.stdout.write('    waiting');
  for (let i = 0; i < 120; i++) {
    await sleep(2000);
    const status = JSON.parse(await httpsGet(submit.status_url, { Authorization: `Key ${FAL_API_KEY}` }));
    if (status.status === 'COMPLETED') {
      const result = JSON.parse(await httpsGet(submit.response_url, { Authorization: `Key ${FAL_API_KEY}` }));
      process.stdout.write(' done\n');
      return downloadBuffer(result.images[0].url);
    }
    if (status.status === 'FAILED') throw new Error(`Generation failed: ${JSON.stringify(status)}`);
    process.stdout.write('.');
  }
  throw new Error('Timeout waiting for generation');
}

async function uploadToFal(buffer, fileName) {
  const initRaw = await httpsRequest({
    hostname: 'rest.alpha.fal.ai', path: '/storage/upload/initiate', method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
  }, JSON.stringify({ content_type: 'image/png', file_name: fileName }));
  const init = JSON.parse(initRaw);
  const uploadUrl = new URL(init.upload_url);
  await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: uploadUrl.hostname, path: uploadUrl.pathname + uploadUrl.search, method: 'PUT',
      headers: { 'Content-Type': 'image/png', 'Content-Length': buffer.length.toString() },
    }, (res) => { res.on('data', () => {}); res.on('end', () => resolve()); });
    req.on('error', reject); req.write(buffer); req.end();
  });
  return init.file_url;
}

async function removeBackground(imageUrl) {
  const raw = await httpsRequest({
    hostname: 'fal.run', path: '/fal-ai/birefnet/v2', method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
  }, JSON.stringify({ image_url: imageUrl }));
  const result = JSON.parse(raw);
  if (!result?.image?.url) throw new Error(`Background removal failed: ${raw.slice(0, 300)}`);
  return downloadBuffer(result.image.url);
}

async function trimAndPadSquarePng(inputBuffer) {
  const trimmedPng = await sharp(inputBuffer).trim().png().toBuffer();
  const meta = await sharp(trimmedPng).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;
  const size = Math.max(width, height);
  const padLeft = Math.floor((size - width) / 2);
  const padTop = Math.floor((size - height) / 2);
  return sharp(trimmedPng).extend({
    top: padTop, bottom: size - height - padTop, left: padLeft, right: size - width - padLeft,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).png().toBuffer();
}

async function genCandidate(moduleId, idx, cfg) {
  const label = `${moduleId}_c${idx + 1}`;
  console.log(`[gen] ${label} (seed ${cfg.seed})`);
  const raw = await generateImage(cfg.prompt, cfg.seed);
  const falUrl = await uploadToFal(raw, `${label}_raw.png`);
  const noBg = await removeBackground(falUrl);
  const final = await trimAndPadSquarePng(noBg);
  const full = path.join(OUT, `${label}.png`);
  fs.writeFileSync(full, final);
  const meta = await sharp(full).metadata();
  const half = await sharp(final).resize(Math.round((meta.width || 256) / 2)).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `${label}_half.png`), half);
  console.log(`  [save] ${full} (${meta.width}x${meta.height}, alpha=${meta.hasAlpha}) + _half`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv[2];
  for (const [moduleId, cands] of Object.entries(MODULES)) {
    if (only && only !== moduleId) continue;
    for (let i = 0; i < cands.length; i++) {
      try { await genCandidate(moduleId, i, cands[i]); }
      catch (e) { console.error(`ERR ${moduleId}_c${i + 1}: ${e.message}`); }
    }
  }
  console.log('done');
})();
