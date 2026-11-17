/**
 * STYLE-TEST ONLY: NEW APPROACH for sand_dunes (boulder_field-crop-method).
 * NO integration, NO src/ writes.
 *
 * Problem (Rudi): die bisherigen 4 sand_dunes-Varianten waren als 4 frische
 * txt2img-Generierungen ZU UNTERSCHIEDLICH — sahen wie 4 verschiedene Materialien,
 * nicht wie EIN Sand-Biom.
 *
 * NEUE METHODE (wie boulder-field-even-texture.cjs):
 *   - EINE grosse flache nahtlose Sand-Textur generieren (flux-pro v1.1 @1024x1024)
 *   - daraus 4 verschiedene, moeglichst nicht-ueberlappende 512x512-Crops nehmen
 *   - jeder Crop -> resize 512x256 (iso squish) -> diamond mask
 *   - Slot 2 & 3 zusaetzlich .flop (L<->R), niemals .flip
 *   So teilen alle 4 dieselbe Sand-Identitaet (kohaerent), variieren nur durch
 *   Bildausschnitt + Spiegelung, und sind garantiert flach (eine flache Textur,
 *   kein i2i-Relief).
 *
 * Crop-Layout (1024x1024 -> 4 x 512x512 Quadranten, nicht-ueberlappend):
 *   A = top-left      (0,0)     -> sand_dunes_0  (original)
 *   B = top-right     (512,0)   -> sand_dunes_1  (original)
 *   C = bottom-left   (0,512)   -> sand_dunes_2  (.flop)
 *   D = bottom-right  (512,512) -> sand_dunes_3  (.flop)
 *
 * Outputs (style-test workspace only):
 *   assets/style-test/tiles/sand_dunes_texraw_<seed>.png        (rohe 1024er Textur, Flach-Check)
 *   assets/style-test/tiles/sand_dunes_tex_{0,1,2,3}.png        (512x256 diamond-masked, final-kandidaten)
 *   assets/style-test/tiles/sand_dunes_tex_mixed_mosaic.png     (3x3 GEMISCHT - Kohaerenz-Check)
 *
 * Usage:
 *   node scripts/sand-dunes-texture-crop.cjs            (default seed)
 *   node scripts/sand-dunes-texture-crop.cjs 70123      (expliziter seed = re-roll fuer flache Textur)
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

const GEN_SIZE = 1024;
const CROP_SIZE = 512;
const TILE_W = 512, TILE_H = 256;
const OUT = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');

// EINE grosse flache nahtlose Sand-Textur. Betont FLACH (kein Duenen-Relief,
// keine Schatten), dunkel/entsaettigt zur Basis (~90 luma), kein zentrales Feature.
const PROMPT =
  'seamless tileable top-down FLAT desert sand texture, fine even sand ripples, ' +
  'desaturated dark muted brown sand, NO raised dunes, NO 3D relief, NO cast shadows, ' +
  'NO embossing, flat overhead orthographic satellite view, uniform even lighting, ' +
  'no large dunes, no central feature, no dominant central pattern, full edge-to-edge ' +
  'coverage, dark brown low saturation, dusty dim, no bright gold, no vivid yellow, ' +
  'no glowing highlight, no hotspot, uniform overall brightness';

const DEFAULT_SEED = 70123;

// 4 nicht-ueberlappende 512x512 Quadranten der 1024er Textur.
const CROPS = [
  { n: 0, left: 0,         top: 0,         flop: false, label: 'top-left' },
  { n: 1, left: CROP_SIZE, top: 0,         flop: false, label: 'top-right' },
  { n: 2, left: 0,         top: CROP_SIZE, flop: true,  label: 'bottom-left' },
  { n: 3, left: CROP_SIZE, top: CROP_SIZE, flop: true,  label: 'bottom-right' },
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

// In-diamond mean luma (opaque pixels only) — Helligkeitsvergleich zur Basis (~90).
async function inDiamondLuma(maskedBuf) {
  const { data, info } = await sharp(maskedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let s = 0, c = 0;
  for (let i = 0; i < data.length; i += ch) {
    if (data[i + 3] < 200) continue;
    s += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    c++;
  }
  return c ? s / c : 0;
}

async function cropToTile(rawBuf, crop) {
  const sub = await sharp(rawBuf)
    .extract({ left: crop.left, top: crop.top, width: CROP_SIZE, height: CROP_SIZE })
    .png().toBuffer();
  const resized = await sharp(sub).resize(TILE_W, TILE_H, { fit: 'fill' }).png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  let masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  if (crop.flop) masked = await sharp(masked).flop().png().toBuffer();
  const out = path.join(OUT, `sand_dunes_tex_${crop.n}.png`);
  fs.writeFileSync(out, masked);
  const lum = await inDiamondLuma(masked);
  console.log(`[crop] slot ${crop.n} <- ${crop.label}${crop.flop ? ' (.flop)' : ''}  meanLum=${lum.toFixed(1)} (Basis ~90)`);
  return masked;
}

// 3x3 GEMISCHT: jede Zelle deterministisch eine der 4 Varianten — Kohaerenz-Check.
async function mixedMosaic(masks, outPath) {
  const HW = TILE_W / 2, HH = TILE_H / 2;
  let seed = 1337;
  const rand = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const place = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) place.push({ cx: (c - r) * HW, cy: (c + r) * HH });
  const minX = Math.min(...place.map(p => p.cx));
  const maxX = Math.max(...place.map(p => p.cx));
  const maxY = Math.max(...place.map(p => p.cy));
  const canvasW = (maxX - minX) + TILE_W;
  const canvasH = maxY + TILE_H;
  const comp = place.map(p => ({ input: masks[Math.floor(rand() * masks.length)], left: p.cx - minX, top: p.cy }));
  const out = await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 } } })
    .composite(comp).png().toBuffer();
  fs.writeFileSync(outPath, out);
  console.log(`[mosaic] ${outPath} (3x3 gemischt)`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const seed = process.argv[2] ? parseInt(process.argv[2], 10) : DEFAULT_SEED;
  console.log(`[gen] grosse flache Sand-Textur @${GEN_SIZE} (seed ${seed})`);
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/v1.1', {
    prompt: PROMPT, image_size: { width: GEN_SIZE, height: GEN_SIZE },
    num_images: 1, enable_safety_checker: false, seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no image url');
  const big = await download(url);
  const rawOut = path.join(OUT, `sand_dunes_texraw_${seed}.png`);
  fs.writeFileSync(rawOut, big);
  console.log(`[save] ${rawOut} (rohe Textur — am Rohbild auf FLACH pruefen)`);

  const masks = [];
  for (const crop of CROPS) masks[crop.n] = await cropToTile(big, crop);
  await mixedMosaic(masks, path.join(OUT, 'sand_dunes_tex_mixed_mosaic.png'));
  console.log('done');
})();
