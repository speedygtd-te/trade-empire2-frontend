/**
 * STYLE-TEST ONLY (Rudi-Klarstellung): Build an iso-box hull whose exterior
 * surfaces are constructed from the FLOOR panel material — using the floor
 * tile as the image INPUT for fal.ai, not a text restyle of the old hull.
 *
 * ONE type only (standard). NO batch. NO src/ writes. NO cap sync. NO git.
 *
 * Inputs:
 *   - assets/raw/floor_hero_standard_square.png   (1024x1024, floor material)
 *   - src/assets/hulls/standard/standard_0.webp   (512x512 iso box reference)
 *
 * Approaches (each saved separately, judged with Read afterwards):
 *   1) multi  -> fal-ai/flux-pro/kontext/max/multi  image_urls=[hull, floor]
 *   2) single -> fal-ai/flux-pro/kontext            image_url=floor
 *   3) i2i    -> fal-ai/flux/dev/image-to-image     image_url=floor, strength 0.88
 *
 * Output: assets/style-test/hull-test/hull_standard_<approach>.png  (raw + _nobg)
 *
 * Usage: node scripts/style-test-hull-from-floor.cjs [multi|single|i2i|all]
 */
const fs = require('fs');
const path = require('path');
try {
  const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const FAL_API_KEY = process.env.FAL_AI_API_KEY || process.env.FAL_API_KEY;
if (!FAL_API_KEY) { console.error('No fal key'); process.exit(1); }
const https = require('https');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'style-test', 'hull-test');
const FLOOR = path.join(ROOT, 'assets', 'raw', 'floor_hero_standard_square.png');
const HULL = path.join(ROOT, 'src', 'assets', 'hulls', 'standard', 'standard_0.webp');

const BUILD_PROMPT =
  'Build a single isometric sci-fi cargo-container hull module: a cubic box ' +
  'structure seen in isometric 3/4 view (top, left face and right face visible, ' +
  'standard 2:1 isometric angle). Construct its exterior walls and roof entirely ' +
  'from this dark graphite armored panel material with octagonal panel framing and ' +
  'cyan glowing edge strips. Add a recessed door on a side face. Keep proportions ' +
  'of a compact cube. Isolated single object, plain flat neutral grey background, ' +
  'soft studio lighting from upper left. No yellow, no copper, no orange.';

const MULTI_PROMPT =
  'Rebuild the box structure from the first image: keep its exact isometric 3/4 ' +
  'cube geometry, its proportions, its door placements and overall silhouette. ' +
  'But reconstruct ALL of its exterior surfaces (top, left face, right face) using ' +
  'the panel material and design language of the second image: dark graphite armored ' +
  'panels with octagonal framing and cyan glowing edge strips. Isolated single object ' +
  'on a plain flat neutral grey background. No yellow, no copper, no orange.';

function dataUri(buf, mime) { return `data:${mime};base64,${buf.toString('base64')}`; }

function fetchJson(model, body) {
  return new Promise((resolve, reject) => {
    const u = new URL('https://fal.run/' + model);
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { Authorization: `Key ${FAL_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      const c = [];
      res.on('data', (d) => c.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(c).toString();
        if (res.statusCode >= 400) return reject(new Error(`fal ${model} ${res.statusCode}: ${raw.slice(0, 400)}`));
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('bad json ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject); req.write(payload); req.end();
  });
}
function download(url) {
  return new Promise((resolve, reject) => {
    const go = (u) => https.get(u, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) return go(res.headers.location);
      const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => resolve(Buffer.concat(c))); res.on('error', reject);
    }).on('error', reject);
    go(url);
  });
}
async function removeBg(buf) {
  const up = dataUri(buf, 'image/png');
  const r = await fetchJson('fal-ai/birefnet', { image_url: up });
  const url = (r.image && r.image.url) || (r.images && r.images[0] && r.images[0].url);
  if (!url) throw new Error('no bg-removed url: ' + JSON.stringify(r).slice(0, 200));
  return download(url);
}

async function approachMulti(hullUri, floorUri) {
  const r = await fetchJson('fal-ai/flux-pro/kontext/max/multi', {
    prompt: MULTI_PROMPT, image_urls: [hullUri, floorUri],
    seed: 770001, guidance_scale: 3.5, num_images: 1, safety_tolerance: '5', output_format: 'png',
  });
  return download(r.images[0].url);
}
async function approachSingle(floorUri) {
  const r = await fetchJson('fal-ai/flux-pro/kontext', {
    prompt: BUILD_PROMPT, image_url: floorUri,
    seed: 770002, guidance_scale: 3.5, num_images: 1, safety_tolerance: '5', output_format: 'png',
  });
  return download(r.images[0].url);
}
async function approachI2i(floorUri) {
  const r = await fetchJson('fal-ai/flux/dev/image-to-image', {
    image_url: floorUri, prompt: BUILD_PROMPT, strength: 0.88,
    image_size: { width: 1024, height: 1024 }, num_inference_steps: 40,
    guidance_scale: 3.5, num_images: 1, enable_safety_checker: false, seed: 770003,
  });
  return download(r.images[0].url);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const which = (process.argv[2] || 'all').toLowerCase();
  const floorBuf = await sharp(fs.readFileSync(FLOOR)).png().toBuffer();
  const hullBuf = await sharp(fs.readFileSync(HULL)).png().toBuffer();
  const floorUri = dataUri(floorBuf, 'image/png');
  const hullUri = dataUri(hullBuf, 'image/png');
  console.log(`[input] floor ${Math.round(floorBuf.length / 1024)}KB  hull ${Math.round(hullBuf.length / 1024)}KB`);

  const jobs = [];
  if (which === 'all' || which === 'multi') jobs.push(['multi', () => approachMulti(hullUri, floorUri)]);
  if (which === 'all' || which === 'single') jobs.push(['single', () => approachSingle(floorUri)]);
  if (which === 'all' || which === 'i2i') jobs.push(['i2i', () => approachI2i(floorUri)]);

  for (const [name, fn] of jobs) {
    try {
      console.log(`[gen] ${name} ...`);
      const raw = await fn();
      const rawPath = path.join(OUT, `hull_standard_${name}.png`);
      fs.writeFileSync(rawPath, raw);
      console.log(`[save] ${rawPath} (${Math.round(raw.length / 1024)}KB)`);
      try {
        const nobg = await removeBg(raw);
        const nobgPath = path.join(OUT, `hull_standard_${name}_nobg.png`);
        fs.writeFileSync(nobgPath, nobg);
        console.log(`[save] ${nobgPath} (${Math.round(nobg.length / 1024)}KB)`);
      } catch (e) { console.error(`[bg ${name}] ${e.message}`); }
    } catch (e) { console.error(`ERR ${name}: ${e.message}`); }
  }
  console.log('done');
})();
