/**
 * Regenerate the 8 TOXIC + ASH cloud sprites with the SAME soft, frayed,
 * semi-transparent edge that was approved for the TEMPERATE set
 * (cloud-temperate-soften.cjs). Temperate is NOT touched.
 *
 * Identical soft pipeline as temperate-soften:
 *   flux-pro v1.1 @1024x512, compact centered pale veil on pure black
 *   -> luminance key (linear, RGB lifted mix .6)   [soft frayed alpha]
 *   -> featherAlpha(3.5)
 *   -> tightCrop
 *   -> scaleInner(0.72)                            [transparent margin all sides]
 *   -> applyVignette(0.62 -> 0.98 cosine)          [rim dissolves before frame]
 *   -> featherAlpha(2.0)                           [final extra-soft rim]
 *   -> FAMILY RECOLOR (RGB only, alpha untouched)  [toxic olive / ash smoke]
 *
 * Family recolor reuses the EXACT tint math from the original bakeThemes so the
 * hue matches the previous cloud_toxic_* / cloud_ash_* files (sampled
 * alpha-weighted RGB: toxic ~[150,164,125], ash ~[78,79,85]):
 *   toxic: modulate{saturation:0.7,brightness:0.95} + tint(150,168,120)
 *   ash:   modulate{brightness:0.5,saturation:0.35} + tint(120,122,128)
 * Because recolor only multiplies RGB, the soft alpha edge is preserved exactly.
 *
 * Output (TEMP, for verification): assets/style-test/clouds/soft/cloud_<fam>_N.webp
 * Copy to src/ happens in a separate verified step, NOT here.
 *
 * Usage: node scripts/cloud-toxic-ash-soften.cjs [toxic|ash] [onlyShape 1..4]
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
if (!FAL_API_KEY) { console.error('No fal key (FAL_AI_API_KEY/FAL_API_KEY)'); process.exit(1); }
const https = require('https');
const http = require('http');
const sharp = require('sharp');

const GEN_W = 1024, GEN_H = 512;
const OUT_W = 1024, OUT_H = 512;
const OUT = path.join(__dirname, '..', 'assets', 'style-test', 'clouds', 'soft');

// Same compact-centered pale-vapour prompt as temperate-soften. We deliberately
// generate a PALE veil (not a dark/green cloud) so the luminance key produces a
// clean soft mask; the family colour is applied deterministically afterwards
// (exactly how the original base->bakeThemes flow worked).
const PREFIX = 'aerial top-down view looking straight DOWN at a thin wispy cloud veil and mist drifting over the ground, flat diffuse stratus and cirrus haze seen from directly above, soft feathered semi-transparent tendrils, the cloud sits COMPACTLY in the CENTER of the frame with a generous empty black margin on every side and does NOT touch any edge, plenty of empty black space around it, gently fading feathered edges that dissolve softly into the black, no side profile, no horizon, no 3D volume, no shadowed underside, no lit top, isolated on a flat pure black background, no landscape, no sky, no ground texture, no stars, sci-fi atmospheric, soft diffuse pale vapour, high detail';
const NEG = 'the cloud must not reach or touch the frame edges, no full-frame coverage, no side view, no horizon, no cumulus silhouette, no 3D puff, no shadowed underside, no volumetric ball, no sky, no blue, no landscape, no terrain, no border, no frame, no text, no hard edges, no solid fill, flat black background only';

// 4 shape descriptors reused from temperate-soften, with fresh per-family seeds
// so toxic/ash shapes differ from temperate and from each other.
const SHAPE_DESC = {
  1: 'a thin long-drawn-out veil of haze, faint gossamer streaks smeared gently across the middle of the frame, barely-there translucent mist.',
  2: 'a flaky shredded patch of haze, irregular torn tufts and ragged wisps of mist scattered around the centre, frayed semi-transparent fog field.',
  3: 'a small delicate wispy cloud veil, thin feathered cirrus filaments and faint frayed tendrils gathered compactly in the middle with lots of empty black around.',
  4: 'a low flat thin sheet of ground fog in soft uneven patches near the centre, almost no density, paper-thin translucent haze, no billowing, no rounded lumps, softly fading patchy edges.',
};

const FAMILIES = {
  toxic: {
    seeds: { 1: 51011, 2: 51023, 3: 51031, 4: 51047 },
    // sickly olive-green smog (matches previous cloud_toxic_* hue)
    recolor: (buf) => sharp(buf).modulate({ saturation: 0.7, brightness: 0.95 }).tint({ r: 150, g: 168, b: 120 }),
  },
  ash: {
    seeds: { 1: 60013, 2: 60029, 3: 60041, 4: 60053 },
    // dark volcanic smoke/ash grey (matches previous cloud_ash_* hue)
    recolor: (buf) => sharp(buf).modulate({ brightness: 0.5, saturation: 0.35 }).tint({ r: 120, g: 122, b: 128 }),
  },
};

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
        if (res.statusCode >= 400) { reject(new Error(`fal ${res.statusCode}: ${raw.slice(0, 500)}`)); return; }
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

// Luminance key: alpha = brightness (black-bg cloud), LINEAR (soft edge). RGB
// lifted toward white so the vapour reads pale before recolor.
async function luminanceKey(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const px = width * height;
  const alpha = Buffer.alloc(px);
  const rgb = Buffer.alloc(px * 3);
  for (let i = 0; i < px; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    alpha[i] = Math.round(Math.min(1, lum) * 255);
    const mix = 0.6;
    rgb[i * 3] = Math.round(r + (255 - r) * mix);
    rgb[i * 3 + 1] = Math.round(g + (255 - g) * mix);
    rgb[i * 3 + 2] = Math.round(b + (255 - b) * mix);
  }
  return sharp(rgb, { raw: { width, height, channels: 3 } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png().toBuffer();
}

async function featherAlpha(buf, sigma) {
  const { width, height } = await sharp(buf).metadata();
  const raw = await sharp(buf).ensureAlpha().raw().toBuffer();
  const alpha = await sharp(raw, { raw: { width, height, channels: 4 } })
    .extractChannel(3).blur(sigma).toBuffer();
  const rgb = await sharp(raw, { raw: { width, height, channels: 4 } })
    .removeAlpha().toBuffer();
  return sharp(rgb, { raw: { width, height, channels: 3 } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png().toBuffer();
}

async function tightCrop(buf, thresh = 4) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * channels + 3];
      if (a > thresh) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return buf;
  return sharp(buf).extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }).png().toBuffer();
}

async function scaleInner(buf, innerFrac) {
  const innerW = Math.round(OUT_W * innerFrac);
  const innerH = Math.round(OUT_H * innerFrac);
  const inner = await sharp(buf)
    .resize(innerW, innerH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  return sharp({ create: { width: OUT_W, height: OUT_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: inner, gravity: 'center' }])
    .png().toBuffer();
}

let VIGNETTE = null;
function buildVignette() {
  const a = Buffer.alloc(OUT_W * OUT_H);
  const cx = OUT_W / 2, cy = OUT_H / 2;
  const innerR = 0.62, outerR = 0.98;
  for (let y = 0; y < OUT_H; y++) {
    for (let x = 0; x < OUT_W; x++) {
      const nx = (x - cx) / cx, ny = (y - cy) / cy;
      const r = Math.sqrt(nx * nx + ny * ny);
      let v;
      if (r <= innerR) v = 1;
      else if (r >= outerR) v = 0;
      else { const t = (r - innerR) / (outerR - innerR); v = 0.5 * (1 + Math.cos(Math.PI * t)); }
      a[y * OUT_W + x] = Math.round(v * 255);
    }
  }
  return a;
}
async function applyVignette(buf) {
  if (!VIGNETTE) VIGNETTE = buildVignette();
  const raw = await sharp(buf).ensureAlpha().raw().toBuffer();
  const px = OUT_W * OUT_H;
  const alpha = Buffer.alloc(px);
  for (let i = 0; i < px; i++) alpha[i] = Math.round(raw[i * 4 + 3] * VIGNETTE[i] / 255);
  const rgb = Buffer.alloc(px * 3);
  for (let i = 0; i < px; i++) { rgb[i * 3] = raw[i * 4]; rgb[i * 3 + 1] = raw[i * 4 + 1]; rgb[i * 3 + 2] = raw[i * 4 + 2]; }
  return sharp(rgb, { raw: { width: OUT_W, height: OUT_H, channels: 3 } })
    .joinChannel(alpha, { raw: { width: OUT_W, height: OUT_H, channels: 1 } })
    .png().toBuffer();
}

const report = [];

async function genShape(fam, famCfg, n) {
  const seed = famCfg.seeds[n];
  const row = { fam, shape: n, seed, gen: '❌', out: '' };
  console.log(`[gen] ${fam} shape ${n} (seed ${seed})`);
  const prompt = `${PREFIX}, ${SHAPE_DESC[n]} ${NEG}`;
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/v1.1', {
    prompt, image_size: { width: GEN_W, height: GEN_H },
    num_images: 1, enable_safety_checker: false, seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no image url');
  const rawBuf = await download(url);
  row.gen = '✅';

  const keyed = await luminanceKey(rawBuf);
  const feathered = await featherAlpha(keyed, 3.5);
  const cropped = await tightCrop(feathered, 4);
  const inset = await scaleInner(cropped, 0.72);
  const vign = await applyVignette(inset);
  const soft = await featherAlpha(vign, 2.0);

  // Family recolor: RGB only, alpha (soft edge) preserved.
  const colored = await famCfg.recolor(soft).png().toBuffer();

  const webp = await sharp(colored).webp({ lossless: true, effort: 4 }).toBuffer();
  const meta = await sharp(webp).metadata();
  if (meta.width !== OUT_W || meta.height !== OUT_H) throw new Error(`bad dims ${meta.width}x${meta.height}`);
  if (!meta.hasAlpha) throw new Error('no alpha');

  const dst = path.join(OUT, `cloud_${fam}_${n}.webp`);
  fs.writeFileSync(dst, webp);
  row.out = `${meta.width}x${meta.height} ${(webp.length / 1024).toFixed(0)}KB`;
  console.log(`[save] ${dst} ${row.out}`);
  report.push(row);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const onlyFam = process.argv[2] && FAMILIES[process.argv[2]] ? process.argv[2] : null;
  const onlyShape = process.argv[3] ? Number(process.argv[3]) : null;
  for (const [fam, cfg] of Object.entries(FAMILIES)) {
    if (onlyFam && fam !== onlyFam) continue;
    for (const n of [1, 2, 3, 4]) {
      if (onlyShape && onlyShape !== n) continue;
      try { await genShape(fam, cfg, n); }
      catch (e) { console.error(`ERR ${fam} shape ${n}: ${e.message}`); report.push({ fam, shape: n, seed: cfg.seeds[n], gen: 'ERR', out: e.message }); }
    }
  }
  console.log('\n=== REPORT ===');
  for (const r of report) console.log(`${r.fam} shape ${r.shape} | seed ${r.seed} | gen ${r.gen} | ${r.out}`);
  console.log('done');
})();
