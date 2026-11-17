/**
 * Style-test ONLY: generate a MIX variant between plains_dirty_medium and _mud.
 * More mud than medium, more grass remnant than mud — ~50/50 mud / desaturated grass.
 * The hard requirement is TILEABILITY + EVEN DISTRIBUTION (no large patches,
 * no central motif, no diagonal bands) and FLAT ground-level grass (no tall
 * protruding tufts, no cast shadows that break tiling).
 *
 * Pipeline (verbatim from style-test-tile-plains-dirty.cjs):
 *   flux-pro v1.1 @512x512 top-down  (FAL_API_KEY in scripts/.env)
 *   -> resize 512x256 (fill, isometric squish)
 *   -> diamond mask (alpha)
 *
 * Generates 2 seeds: plains_dirty_mix_s0 / plains_dirty_mix_s1 (+ _half).
 * NO integration, NO writes to src/.
 *
 * Usage: node scripts/style-test-tile-plains-mix.cjs
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
const http = require('http');
const sharp = require('sharp');

const TILE_W = 512, TILE_H = 256, GEN_SIZE = 512;
const OUT = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');

// Prefix verbatim from generate-biome-assets.ts so style matches inventory pipeline.
const PREFIX = 'top-down aerial photograph, terrain texture filling entire image edge to edge, no sky, no horizon, no borders, no vignette, The Expanse sci-fi aesthetic, realistic';

// MIX prompt: 50/50 mud + desaturated grass, evenly distributed, flat, tileable.
const PROMPT =
  `${PREFIX}, ` +
  // composition: balanced mix between wet mud and dull grass
  `desaturated dirty ground from directly above, roughly fifty percent wet brown mud and fifty percent dull muted grass, ` +
  `more mud than a grassy field but more leftover grass than a pure mud pit, ` +
  `wet dark brown muddy soil interspersed with sparse matte washed-out grass tufts, ` +
  `very low saturation, grimy trampled grungy terrain, dull olive-brown palette, ` +
  // EVEN DISTRIBUTION — the single most important criterion
  `evenly distributed mud and grass across the entire surface, uniform texture, homogeneous mix, ` +
  `no large patches, no central feature, no dominant central motif, no big mud zone, no big grass zone, no diagonal bands, fine even speckle of mud and grass everywhere, ` +
  // TILEABILITY
  `seamless tileable ground texture designed to be placed edge-to-edge in a grid, ` +
  `repeating tiles next to and above each other must blend without visible seams or hotspots, flat top-down ground, ` +
  // FLAT grass, no 3D objects / shadows
  `flat ground-level grass, no tall protruding tufts, no cast shadows, no raised objects, no puddle reflections, ` +
  // banned artefacts
  `no bright flowers, no white dots, no colorful blossoms, lit evenly from upper left`;

const SEEDS = [73020, 73157];

const DIAMOND_MASK_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}">
    <polygon points="${TILE_W / 2},0 ${TILE_W},${TILE_H / 2} ${TILE_W / 2},${TILE_H} 0,${TILE_H / 2}" fill="white"/>
  </svg>`
);

function fetchJson(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = JSON.stringify(body);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: parsed.hostname, port: parsed.port,
      path: parsed.pathname + parsed.search, method: 'POST',
      headers: { 'Authorization': `Key ${FAL_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        if (res.statusCode >= 400) { reject(new Error(`fal ${res.statusCode}: ${raw.slice(0, 400)}`)); return; }
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('bad json ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject); req.write(payload); req.end();
  });
}
function download(url) {
  return new Promise((resolve, reject) => {
    const go = (u) => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) { go(res.headers.location); return; }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };
    go(url);
  });
}

async function postProcess(rawBuf, name) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const full = path.join(OUT, `${name}.png`);
  fs.writeFileSync(full, masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `${name}_half.png`), half);
  console.log(`[save] ${full}`);
}

async function genSeed(idx, seed) {
  const name = `plains_dirty_mix_s${idx}`;
  console.log(`[gen] ${name} (seed ${seed})`);
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/v1.1', {
    prompt: PROMPT, image_size: { width: GEN_SIZE, height: GEN_SIZE },
    num_images: 1, enable_safety_checker: false, seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no image url for ' + name);
  const square = await download(url);
  await postProcess(square, name);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (let i = 0; i < SEEDS.length; i++) {
    try { await genSeed(i, SEEDS[i]); } catch (e) { console.error(`ERR s${i}: ${e.message}`); }
  }
  console.log('done');
})();
