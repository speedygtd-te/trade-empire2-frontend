/**
 * Style-test ONLY: NEW APPROACH for boulder_field. NO integration, NO src/ writes.
 *
 * Problem (Rudi): previous boulder_field tiles concentrate rocks at the EDGES
 * (vignette / frame bias) and leave the CENTER empty. flux reads "a tile" as an
 * object-with-frame and arranges boulders around the rim.
 *
 * NEW APPROACH: do NOT generate "a tile". Generate a SEAMLESS, BORDERLESS
 * top-down rubble TEXTURE (no defined edge -> no edge bias -> naturally uniform).
 * Generate large (1024x1024) so we can CENTER-CROP to 512x512 (taking the middle
 * of the texture, never the rim), then resize 512x256 + diamond-mask.
 *
 * Pipeline:
 *   flux-pro v1.1 @1024x1024 (FAL_AI_API_KEY in scripts/.env)
 *   -> center-crop 512x512  (the MIDDLE of the texture)
 *   -> resize 512x256 (fill, iso squish)
 *   -> diamond mask (alpha)
 *   Output per seed: assets/style-test/tiles/boulder_field_even_<id>.png
 *                    (+ _half.png + _mosaic.png)
 *
 * Diamond vertices (512x256): top(256,0) right(512,128) bottom(256,256) left(0,128)
 *
 * Usage: node scripts/boulder-field-even-texture.cjs
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

const GEN_SIZE = 1024;     // generate large
const CROP_SIZE = 512;     // center-crop square
const TILE_W = 512, TILE_H = 256;
const OUT = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');

// Sharp on "even, varied-size, borderless seamless texture", anti-vignette.
const PROMPT =
  'seamless tileable top-down texture of a rocky boulder field, rocks and boulders of VARYING sizes — large boulders, medium rocks, small stones and fine gravel — all scattered with PERFECTLY UNIFORM even density across the entire frame, flat overhead orthographic view, full edge-to-edge coverage, NO border, NO vignette, NO frame, NO edge concentration, NO empty center, uniform distribution everywhere including the middle, dark desaturated charcoal-grey rock on dark grit, no blue tint, dim, somber, no single bright rock, no hotspot';

const SEEDS = [
  { id: 'a', seed: 30811 },
  { id: 'b', seed: 31207 },
  { id: 'c', seed: 31933 },
  { id: 'd', seed: 32418 },
  { id: 'e', seed: 33102 },
];

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

async function buildMosaic(halfBuf, outPath) {
  const W = 256, H = 128;
  const canvasW = W * 3, canvasH = H * 3;
  const placements = [];
  for (let r = 0; r < 7; r++) {
    const odd = r % 2 === 1;
    for (let col = 0; col < 4; col++) {
      const x = col * W + (odd ? W / 2 : 0) - W / 2;
      const y = r * (H / 2) - H / 2;
      if (x > canvasW || y > canvasH || x + W < 0 || y + H < 0) continue;
      placements.push({ input: halfBuf, left: Math.round(x), top: Math.round(y) });
    }
  }
  await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 } } })
    .composite(placements).png().toFile(outPath);
}

async function postProcess(rawBuf, id) {
  // 1) center-crop the MIDDLE of the large texture
  const meta = await sharp(rawBuf).metadata();
  const cropLeft = Math.max(0, Math.round((meta.width - CROP_SIZE) / 2));
  const cropTop = Math.max(0, Math.round((meta.height - CROP_SIZE) / 2));
  const cropped = await sharp(rawBuf)
    .extract({ left: cropLeft, top: cropTop, width: Math.min(CROP_SIZE, meta.width), height: Math.min(CROP_SIZE, meta.height) })
    .png().toBuffer();
  // 2) iso squish
  const resized = await sharp(cropped).resize(TILE_W, TILE_H, { fit: 'fill' }).png().toBuffer();
  // 3) diamond mask
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const full = path.join(OUT, `boulder_field_even_${id}.png`);
  fs.writeFileSync(full, masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `boulder_field_even_${id}_half.png`), half);
  await buildMosaic(half, path.join(OUT, `boulder_field_even_${id}_mosaic.png`));
  console.log(`[save] ${full} (+ _half, _mosaic)`);
}

async function genSeed(id, seed) {
  console.log(`[gen] even_${id} (seed ${seed})`);
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/v1.1', {
    prompt: PROMPT, image_size: { width: GEN_SIZE, height: GEN_SIZE },
    num_images: 1, enable_safety_checker: false, seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no image url for ' + id);
  const square = await download(url);
  await postProcess(square, id);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const { id, seed } of SEEDS) {
    try { await genSeed(id, seed); } catch (e) { console.error(`ERR ${id}: ${e.message}`); }
  }
  console.log('done');
})();
