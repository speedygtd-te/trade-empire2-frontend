/**
 * Regenerate ONLY the 4 TEMPERATE (earth-like) cloud sprites with SOFT, frayed,
 * semi-transparent edges — fixing the hard rectangular cutoff where the previous
 * sprites' cloud content touched the frame border (temp_1 left α=122, temp_4 all
 * four edges). Toxic/Ash are NOT touched.
 *
 * Fix strategy:
 *   - Prompt: compact cloud CENTERED with a generous empty black margin on all
 *     sides so the vapour never reaches the frame edge (fresh seeds).
 *   - Luminance key (cloud = bright vapour on pure black) → naturally soft,
 *     frayed, semi-transparent alpha. No birefnet / hard subject cut.
 *   - Strong alpha feather (blur) so edges fade over many pixels, never 1px jump.
 *   - Tight crop → scale into an INNER box (inset) centered on a transparent
 *     1024×512 canvas → guaranteed transparent margin on ALL sides.
 *   - Soft elliptical alpha vignette that reaches 0 before the border → even if
 *     any wisp nears the edge it is feathered to full transparency; kills any
 *     residual straight edge.
 *   - Final alpha blur pass for an extra-soft rim.
 *
 * Output: assets/style-test/clouds/soft/cloud_temperate_N.webp (TEMP, for
 * validation). Copy to src/ happens in a separate verified step, NOT here.
 *
 * Usage: node scripts/cloud-temperate-soften.cjs [onlyShape 1..4]
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

// TOP-DOWN aerial veil, isolated on pure black, and — critically — COMPACT and
// CENTERED with a generous empty margin so the cloud never touches the frame.
const PREFIX = 'aerial top-down view looking straight DOWN at a thin wispy cloud veil and mist drifting over the ground, flat diffuse stratus and cirrus haze seen from directly above, soft feathered semi-transparent tendrils, the cloud sits COMPACTLY in the CENTER of the frame with a generous empty black margin on every side and does NOT touch any edge, plenty of empty black space around it, gently fading feathered edges that dissolve softly into the black, no side profile, no horizon, no 3D volume, no shadowed underside, no lit top, isolated on a flat pure black background, no landscape, no sky, no ground texture, no stars, sci-fi atmospheric, soft diffuse pale vapour, high detail';
const NEG = 'the cloud must not reach or touch the frame edges, no full-frame coverage, no side view, no horizon, no cumulus silhouette, no 3D puff, no shadowed underside, no volumetric ball, no sky, no blue, no landscape, no terrain, no border, no frame, no text, no hard edges, no solid fill, flat black background only';

// Fresh seeds (differ from the previous baked set) — 4 distinct earth-like shapes.
const SHAPES = {
  // seed 90311 produced a dense clump with a sharp internal brightness edge;
  // re-rolled to 11027 (thin gossamer veil, no dense core) — see
  // cloud-temp1-candidates.cjs. This variant also uses a stronger feather (4.5/2.5).
  1: { seed: 11027, prompt: `${PREFIX}, a thin long-drawn-out veil of haze, faint gossamer streaks smeared gently across the middle of the frame, barely-there translucent mist. ${NEG}` },
  2: { seed: 90337, prompt: `${PREFIX}, a flaky shredded patch of haze, irregular torn tufts and ragged wisps of mist scattered around the centre, frayed semi-transparent fog field. ${NEG}` },
  3: { seed: 90359, prompt: `${PREFIX}, a small delicate wispy cloud veil, thin feathered cirrus filaments and faint frayed tendrils gathered compactly in the middle with lots of empty black around. ${NEG}` },
  4: { seed: 90371, prompt: `${PREFIX}, a low flat thin sheet of ground fog in soft uneven patches near the centre, almost no density, paper-thin translucent haze, no billowing, no rounded lumps, softly fading patchy edges. ${NEG}` },
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

// Luminance key: alpha = brightness of the (black-bg) cloud, LINEAR (gamma 1) so
// the natural falloff at the vapour edge is preserved (no lifting that would
// harden thin wisps). RGB lifted toward white so the cloud reads as pale vapour.
async function luminanceKey(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const px = width * height;
  const alpha = Buffer.alloc(px);
  const rgb = Buffer.alloc(px * 3);
  for (let i = 0; i < px; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    alpha[i] = Math.round(Math.min(1, lum) * 255); // linear → soft edge
    const mix = 0.6;
    rgb[i * 3] = Math.round(r + (255 - r) * mix);
    rgb[i * 3 + 1] = Math.round(g + (255 - g) * mix);
    rgb[i * 3 + 2] = Math.round(b + (255 - b) * mix);
  }
  return sharp(rgb, { raw: { width, height, channels: 3 } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png().toBuffer();
}

// Blur the ALPHA channel only (RGB stays sharp) → soft frayed rim.
async function featherAlpha(buf, sigma) {
  const { width, height } = await sharp(buf).metadata();
  const raw = await sharp(buf).ensureAlpha().raw().toBuffer(); // RGBA
  const alpha = await sharp(raw, { raw: { width, height, channels: 4 } })
    .extractChannel(3).blur(sigma).toBuffer();
  const rgb = await sharp(raw, { raw: { width, height, channels: 4 } })
    .removeAlpha().toBuffer();
  return sharp(rgb, { raw: { width, height, channels: 3 } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png().toBuffer();
}

// Tight crop on visible (alpha>threshold) pixels.
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

// Fit into an inner box (fraction of canvas), centered on a transparent
// OUT_W×OUT_H canvas → guaranteed transparent margin on ALL sides.
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

// Soft elliptical vignette multiplied into alpha: full inside innerR, smooth
// cosine falloff to 0 at outerR. Guarantees the rim dissolves to transparency
// before the frame — no straight/hard edge can survive.
let VIGNETTE = null;
function buildVignette() {
  const a = Buffer.alloc(OUT_W * OUT_H);
  const cx = OUT_W / 2, cy = OUT_H / 2;
  const innerR = 0.62, outerR = 0.98; // normalized radius
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
  const raw = await sharp(buf).ensureAlpha().raw().toBuffer(); // RGBA
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

async function genShape(n, cfg) {
  const row = { shape: n, seed: cfg.seed, gen: '❌', out: '' };
  console.log(`[gen] temperate shape ${n} (seed ${cfg.seed})`);
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/v1.1', {
    prompt: cfg.prompt, image_size: { width: GEN_W, height: GEN_H },
    num_images: 1, enable_safety_checker: false, seed: cfg.seed,
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
  const soft = await featherAlpha(vign, 2.0); // final extra-soft rim

  const webp = await sharp(soft).webp({ lossless: true, effort: 4 }).toBuffer();
  const meta = await sharp(webp).metadata();
  if (meta.width !== OUT_W || meta.height !== OUT_H) throw new Error(`bad dims ${meta.width}x${meta.height}`);
  if (!meta.hasAlpha) throw new Error('no alpha');

  const dst = path.join(OUT, `cloud_temperate_${n}.webp`);
  fs.writeFileSync(dst, webp);
  row.out = `${meta.width}x${meta.height} ${(webp.length / 1024).toFixed(0)}KB`;
  console.log(`[save] ${dst} ${row.out}`);
  report.push(row);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv[2] ? Number(process.argv[2]) : null;
  for (const [n, cfg] of Object.entries(SHAPES)) {
    if (only && only !== Number(n)) continue;
    try { await genShape(Number(n), cfg); }
    catch (e) { console.error(`ERR shape ${n}: ${e.message}`); report.push({ shape: n, seed: cfg.seed, gen: 'ERR', out: e.message }); }
  }
  console.log('\n=== REPORT ===');
  for (const r of report) console.log(`shape ${r.shape} | seed ${r.seed} | gen ${r.gen} | ${r.out}`);
  console.log('done');
})();
