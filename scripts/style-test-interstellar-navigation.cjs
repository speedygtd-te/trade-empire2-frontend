/**
 * Style-test ONLY: candidate module sprite for INTERSTELLAR_NAVIGATION.
 * CANDIDATES ONLY — NO integration into src/assets/modules/, NO cap sync, NO commit.
 *
 * Pipeline mirrors the proven scripts/regenerate-37-modules.ts flow:
 *   flux/dev @512x512  ->  birefnet/v2 background removal  ->  sharp trim + pad
 *   to 1:1 square  ->  PNG (transparent bg, tight crop).
 *
 * BASE_STYLE and INDOOR_SUFFIX are taken VERBATIM from scripts/regenerate-14-modules.ts
 * (canonical, "per Rudi, NOT to be changed") so the candidates read as siblings of the
 * existing navy-steel module family. Positioning is INDOOR-only (["INDOOR"]) -> no lit
 * variant is generated here.
 *
 * Body prompt is adapted from the electronics_lab variant in
 * scripts/regenerate-37-modules.ts (oscilloscopes, workbenches, diagnostic screens),
 * per Rudi's direction: "an die Forschungslabore anlehnen ... technischer Raum,
 * ggf. ein paar Sessel rein stellen, viele Computer, Oszilloskope usw." Seats are
 * added explicitly because the module is crew-gated (needs mass-scaled crew aboard).
 *
 * No negative prompt (per Docs/LESSONS-asset-pipeline.md §3: negative prompts
 * reproduce the unwanted thing instead of avoiding it).
 *
 * Output: assets/style-test/modules/interstellar_navigation_c<N>.png (+ _half.png)
 *
 * Usage: node scripts/style-test-interstellar-navigation.cjs
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

// Verbatim from scripts/regenerate-14-modules.ts / regenerate-37-modules.ts
// ("Canonical style (per Rudi, NOT to be changed)").
const BASE_STYLE =
  'isometric game asset, isometric 2.5D perspective, 30 degree camera angle from horizontal, ' +
  '2:1 isometric perspective, The Expanse hard sci-fi aesthetic, ' +
  'navy-blue painted steel with yellow safety stripes, weathered metal surfaces, ' +
  'photorealistic textures, scratched paint, grime and oil residue, ' +
  'lit from upper left, soft top-left key light, no background, isolated object, ' +
  'game sprite, centered, single object, no ground plane, no shadow';

const INDOOR_SUFFIX =
  ', industrial module installed inside a factory hall, integral part of a larger factory floor, ' +
  'open cutaway view, no standalone building, no exterior walls or roof, exposed machinery section on a deck plate';

// 5 seeds, minor compositional variation, all keeping seats + computers + oscilloscopes.
const CANDIDATES = [
  {
    seed: 810101,
    body:
      'interstellar navigation module, a manned navigation control room with two padded operator seats facing ' +
      'banks of navigation computers, oscilloscope and signal analyzer racks, holographic star chart display, ' +
      'glowing jump-plot readouts, cable conduits, lab floor section',
  },
  {
    seed: 810102,
    body:
      'interstellar jump navigation section, a pair of crew seats in front of tall computer server racks and ' +
      'oscilloscope stations, star-chart monitor wall, blinking status panels, control desk with switches, lab floor section',
  },
  {
    seed: 810103,
    body:
      'navigation plotting room module, operator chairs facing a bank of oscilloscopes and diagnostic computer ' +
      'terminals, a central holographic star-map projection, data cabling, instrument racks, lab floor section',
  },
  {
    seed: 810104,
    body:
      'ship interstellar navigation lab, two swivel seats at a navigation console, surrounding computer towers and ' +
      'oscilloscope screens showing waveforms, overhead status lights, star chart wall display, lab floor section',
  },
  {
    seed: 810105,
    body:
      'interstellar navigation module, crew workstation with seats facing stacked computer racks and oscilloscope ' +
      'instruments, glowing navigation star-map screen, control panel with dials, cable trays, lab floor section',
  },
];

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
  const submitBody = JSON.stringify({
    prompt, image_size: { width: 512, height: 512 }, num_inference_steps: 28,
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

async function genCandidate(idx, cfg) {
  const label = `interstellar_navigation_c${idx + 1}`;
  const prompt = `${BASE_STYLE}, ${cfg.body}${INDOOR_SUFFIX}`;
  console.log(`[gen] ${label} (seed ${cfg.seed})`);
  const raw = await generateImage(prompt, cfg.seed);
  fs.writeFileSync(path.join(OUT, `${label}_raw.png`), raw);
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
  for (let i = 0; i < CANDIDATES.length; i++) {
    try { await genCandidate(i, CANDIDATES[i]); }
    catch (e) { console.error(`ERR interstellar_navigation_c${i + 1}: ${e.message}`); }
  }
  console.log('done');
})();
