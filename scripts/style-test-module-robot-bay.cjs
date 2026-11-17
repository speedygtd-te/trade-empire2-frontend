/**
 * Style-test ONLY: candidate module sprites for the NEW logistics modules
 * ROBOT_BAY and ROBOT_BAY_LARGE (OpenAPI 0.x robot-pool / dock-mass additions).
 * CANDIDATES ONLY — NO integration into src/assets/modules/, NO cap sync, NO commit.
 *
 * Pipeline mirrors the proven scripts/style-test-module-candidates.cjs:
 *   flux/dev @512x512  ->  birefnet/v2 background removal  ->  sharp trim + pad
 *   to 1:1 square  ->  PNG (transparent bg, tight crop). Also writes a _half PNG.
 *
 * Style anchors are the same BASE_STYLE the module family was built with, so the
 * candidates read as siblings of the existing dock / logistics modules
 * (loading_dock, dock_large, vehicle_factory).
 *
 * A robot bay = a dock/charging facility for SMALL autonomous robot units (a
 * mass-based robot pool, NOT ship docking). It must read clearly as a robot
 * port/bay distinct from the cargo dock (loading_dock) and ship dock (dock_large):
 * charging berths / cradles for small drones, NOT a big ship hangar.
 *
 * Output: assets/style-test/modules/<module_id>_c<N>.png (+ _half.png)
 *
 * Usage: node scripts/style-test-module-robot-bay.cjs [moduleId]
 *   moduleId optional (robot_bay | robot_bay_large) -> only that module's candidates.
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

// verbatim from style-test-module-candidates.cjs / generate-module-gap-fill.ts
const BASE_STYLE =
  'isometric game asset, single 3D building module, 30 degree camera angle from horizontal, ' +
  '2:1 isometric perspective, The Expanse sci-fi aesthetic, photorealistic textures, ' +
  'realistic worn industrial metal surfaces, transparent background, game sprite, centered, ' +
  'single object, no ground plane, no shadow, no walls, no enclosure, lit from upper-left';

const NEGATIVE_PROMPT =
  'cartoon, anime, fantasy, magical glow, bright neon colors, steampunk, dragons, runes, glyphs, ' +
  'text, logos, watermark, background, scene, landscape, ground, floor, human figures, ' +
  'large spaceship, large ship, giant rocket';

// 2 modules, 3 candidates each, fixed seeds (no Math.random), varied emphasis.
const MODULES = {
  robot_bay: [
    {
      seed: 710101,
      prompt:
        'robot bay module, a compact maintenance and charging dock for small autonomous worker robots, ' +
        'open-front berth with several charging cradles holding small wheeled and legged service robots, ' +
        'articulated charging arms and power umbilical cables reaching down to each docked robot, ' +
        'status indicator strips, weathered blue and grey industrial hull with yellow-and-black hazard striping, ' +
        'a smaller logistics sibling of the loading dock built for robots not cargo',
    },
    {
      seed: 710238,
      prompt:
        'robotics docking bay module, a low rectangular facility housing a row of small autonomous robots ' +
        'parked nose-in inside individual recharge stalls, roller shutter half-raised over the bay opening, ' +
        'overhead gantry rail with a small handling arm above the stalls, coiled charging hoses, ' +
        'worn blue-grey metal hull with rust streaks and yellow hazard chevrons along the entry ramp, ' +
        'reads as a robot port not a ship hangar',
    },
    {
      seed: 710377,
      prompt:
        'autonomous robot port module, a squat service garage with two open docking slots, ' +
        'each slot cradling a small treaded utility robot on a charging plate, ' +
        'fold-out diagnostic arms and bundled power conduits, a tool rack on the side wall, ' +
        'glowing cyan charge-status lights, dirty blue industrial hull with yellow safety markings, ' +
        'compact rugged robot dock distinct from a cargo dock',
    },
  ],
  robot_bay_large: [
    {
      seed: 720101,
      prompt:
        'large robot bay module, a tall multi-tier robotics depot with stacked rows of recharge berths, ' +
        'two levels of small autonomous robots docked in individual cradles connected to charging arms, ' +
        'a vertical lift column and overhead gantry crane moving robots between tiers, ' +
        'heavy power transformer and cooling radiators on the side, bundled cabling, ' +
        'weathered blue and grey industrial hull with bold yellow-and-black hazard striping, ' +
        'a bigger heavier sibling of the small robot bay',
    },
    {
      seed: 720242,
      prompt:
        'large robotics docking depot module, a wide reinforced facility with a long bank of recharge stalls ' +
        'holding many small wheeled and legged service robots side by side, an overhead rail crane spanning ' +
        'the stalls, a stepped maintenance gantry, thick power umbilicals and capacitor banks at the rear, ' +
        'worn blue-grey metal hull with rust, riveted plating and yellow hazard chevrons, ' +
        'scaled-up industrial robot port, clearly larger than the basic robot bay',
    },
    {
      seed: 720383,
      prompt:
        'large autonomous robot hub module, a heavy two-bay charging garage with a high roof, ' +
        'multiple open slots each cradling a small treaded robot on a powered docking plate, ' +
        'a robotic overhead arm on a ceiling track servicing the slots, side-mounted transformer and ' +
        'radiator fins, bundled conduits and glowing cyan charge indicators, ' +
        'dirty blue industrial hull with yellow safety markings, large rugged robot depot',
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
