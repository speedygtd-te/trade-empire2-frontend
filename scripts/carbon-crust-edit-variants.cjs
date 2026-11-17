/**
 * STYLE-TEST ONLY (NO src/ writes, NO cap sync, NO git):
 * carbon_crust variants via FLUX PRO KONTEXT edit — Rudi's PROVEN simple method.
 *
 * Mirrors scripts/salt-flat-simple-edit-variants.cjs exactly:
 *   model fal-ai/flux-pro/kontext, EXACT prompt "create a slightly different
 *   pattern", NO negatives, one seed per variant. The proven insight: long
 *   negative prompts ("no central crack", "no gradient") INTRODUCE those
 *   concepts. The simple prompt keeps the flat dark carbon crust flat, only
 *   the crack pattern varies.
 *
 * Input: assets/style-test/tiles/carbon_crust_v4.png  (Rudi's favorite basis,
 *        512x256 diamond-masked RGBA — full resolution, not the _half variant,
 *        full res gives better edits).
 *
 * Per-variant POST-PROCESS (on the 512x256 result, diamond interior only via
 * mask-aware row means):
 *   (1) VERTICAL brightness equalization — kontext can re-introduce a vertical
 *       light/dark gradient; pull each row's interior mean to the global
 *       interior mean (smoothed additive deficit), 1D vertical only (mask-aware
 *       so the transparent diamond corners do not poison the row means).
 *   (2) re-apply the diamond mask (alpha) so corners stay clean.
 *
 * Outputs (style-test workspace only):
 *   carbon_crust_se_v{1,2,3}.png        (512x256 masked, equalized)
 *   carbon_crust_se_v{1,2,3}_half.png   (256x128)
 *   carbon_crust_se_v{1,2,3}_mosaic.png (3x3 iso ref)
 *   carbon_crust_se_basis_mosaic.png    (basis 3x3 ref)
 *
 * Usage: node scripts/carbon-crust-edit-variants.cjs [v1 v2 v3]
 *        re-roll a slot bumps its seed +1000; explicit: v1=12345
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

const TILE_W = 512, TILE_H = 256;
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'style-test', 'tiles');
const BASIS_PNG = path.join(OUT, 'carbon_crust_v4.png');

// EXACT prompt Rudi used by hand. NO negatives, NO long description.
const PROMPT = 'create a slightly different pattern';

const VARIANTS = [
  { tag: 'v1', seed: 71101 },
  { tag: 'v2', seed: 82202 },
  { tag: 'v3', seed: 93303 },
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

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// Mask-aware per-row mean luma over an RGBA buffer (only pixels with alpha>8
// count, so the transparent diamond corners do not poison row means) + global.
function rowMeansMasked(data, width, height, channels) {
  const means = new Float64Array(height);
  const counts = new Int32Array(height);
  let gsum = 0, gn = 0;
  for (let y = 0; y < height; y++) {
    let s = 0, n = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (channels === 4 && data[i + 3] < 8) continue;
      s += luma(data[i], data[i + 1], data[i + 2]); n++;
    }
    means[y] = n ? s / n : 0; counts[y] = n;
    gsum += s; gn += n;
  }
  return { means, counts, global: gn ? gsum / gn : 0 };
}

// Mask-aware vertical (row-wise) equalization on a 512x256 RGBA diamond buffer.
// Per-row interior deficit -> moving-average smoothed -> add to every interior
// pixel of that row (RGB; alpha untouched). 1D vertical gradient kill.
async function equalizeVerticalMasked(rgbaBuf, smoothRadius = 12) {
  const { data, info } = await sharp(rgbaBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const { means, counts, global } = rowMeansMasked(data, width, height, channels);
  const rawDeficit = new Float64Array(height);
  for (let y = 0; y < height; y++) rawDeficit[y] = counts[y] ? global - means[y] : 0;
  const deficit = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    let s = 0, n = 0;
    for (let k = -smoothRadius; k <= smoothRadius; k++) {
      const yy = y + k;
      if (yy < 0 || yy >= height || !counts[yy]) continue;
      s += rawDeficit[yy]; n++;
    }
    deficit[y] = n ? s / n : 0;
  }
  const out = Buffer.from(data);
  for (let y = 0; y < height; y++) {
    const d = deficit[y];
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (channels === 4 && data[i + 3] < 8) continue;
      for (let c = 0; c < 3; c++) {
        const v = data[i + c] + d;
        out[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
  return sharp(out, { raw: { width, height, channels } }).png().toBuffer();
}

async function colorStats(maskedBuf) {
  const { data, info } = await sharp(maskedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    if (data[i + 3] < 8) continue;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  return { r: r / n, g: g / n, b: b / n, luma: luma(r / n, g / n, b / n) };
}

// top-half vs bottom-half interior luma diff (vertical gradient metric) + center
// hotspot check: center disc mean vs ring mean (dominant central crack/hotspot).
async function gradAndCenter(maskedBuf) {
  const { data, info } = await sharp(maskedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let T = 0, B = 0, nT = 0, nB = 0;
  let cen = 0, nCen = 0, ring = 0, nRing = 0;
  const cx = width / 2, cy = height / 2;
  const rCen = height * 0.18; // center disc radius (in iso-y units, scaled)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    if (data[i + 3] < 8) continue;
    const l = luma(data[i], data[i + 1], data[i + 2]);
    if (y < height / 2) { T += l; nT++; } else { B += l; nB++; }
    // iso-aware distance (x stretched 2x because diamond is 2:1)
    const dx = (x - cx) / 2, dy = (y - cy);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < rCen) { cen += l; nCen++; } else { ring += l; nRing++; }
  }
  return {
    topBottom: Math.abs(T / nT - B / nB),
    centerVsRing: (cen / nCen) - (ring / nRing),
  };
}

async function postProcess(rawBuf, tag) {
  // resize result to tile, ensure alpha via diamond mask, THEN equalize interior,
  // THEN re-mask (equalize could touch edge pixels slightly).
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha().png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked0 = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const eq = await equalizeVerticalMasked(masked0, 12);
  const masked = await sharp(eq).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `carbon_crust_se_${tag}.png`), masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `carbon_crust_se_${tag}_half.png`), half);
  return masked;
}

async function kontext(basisPng, cfg) {
  const dataUri = `data:image/png;base64,${basisPng.toString('base64')}`;
  console.log(`[kontext] ${cfg.tag} seed ${cfg.seed} prompt="${PROMPT}"`);
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/kontext', {
    image_url: dataUri,
    prompt: PROMPT,
    num_images: 1,
    safety_tolerance: '5',
    seed: cfg.seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no kontext url for ' + cfg.tag + ': ' + JSON.stringify(r).slice(0, 200));
  const out = await download(url);
  return postProcess(out, cfg.tag);
}

async function mosaic(maskedBuf, outPath) {
  const HW = TILE_W / 2, HH = TILE_H / 2;
  const place = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) place.push({ cx: (c - r) * HW, cy: (c + r) * HH });
  const minX = Math.min(...place.map(p => p.cx));
  const maxX = Math.max(...place.map(p => p.cx));
  const maxY = Math.max(...place.map(p => p.cy));
  const canvasW = (maxX - minX) + TILE_W;
  const canvasH = maxY + TILE_H;
  const comp = place.map(p => ({ input: maskedBuf, left: p.cx - minX, top: p.cy }));
  const out = await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 } } })
    .composite(comp).png().toBuffer();
  fs.writeFileSync(outPath, out);
}

const fmtC = (c) => `R${c.r.toFixed(0)} G${c.g.toFixed(0)} B${c.b.toFixed(0)} luma${c.luma.toFixed(1)}`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const basisPng = await sharp(fs.readFileSync(BASIS_PNG)).png().toBuffer();
  const meta = await sharp(basisPng).metadata();
  console.log(`[basis] ${BASIS_PNG} -> ${meta.width}x${meta.height} png`);
  const basisC = await colorStats(basisPng), basisG = await gradAndCenter(basisPng);
  console.log(`BASIS color[${fmtC(basisC)}] topBottom ${basisG.topBottom.toFixed(2)} centerVsRing ${basisG.centerVsRing.toFixed(2)}`);
  await mosaic(basisPng, path.join(OUT, 'carbon_crust_se_basis_mosaic.png'));

  const args = process.argv.slice(2);
  const reroll = args.map(a => a.split('=')[0]);
  const seedOverride = {};
  for (const a of args) { const [t, s] = a.split('='); if (s) seedOverride[t] = parseInt(s, 10); }

  for (const cfg of VARIANTS) {
    if (reroll.length && !reroll.includes(cfg.tag)) continue;
    const seed = seedOverride[cfg.tag] || (reroll.includes(cfg.tag) ? cfg.seed + 1000 : cfg.seed);
    try {
      const masked = await kontext(basisPng, { ...cfg, seed });
      await mosaic(masked, path.join(OUT, `carbon_crust_se_${cfg.tag}_mosaic.png`));
      const c = await colorStats(masked), g = await gradAndCenter(masked);
      console.log(`  ${cfg.tag} (seed ${seed}): color[${fmtC(c)}] dLuma ${(c.luma - basisC.luma).toFixed(1)} topBottom ${g.topBottom.toFixed(2)} centerVsRing ${g.centerVsRing.toFixed(2)}`);
    } catch (e) { console.error(`ERR ${cfg.tag}: ${e.message}`); }
  }
  console.log('done');
})();
