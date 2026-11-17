/**
 * Style-test ONLY: Image-to-Image variant calibration for the v3 hero floor.
 *
 * Goal: derive 3 variants from the dark_graphite_v3 hero via flux/dev img2img
 * at strengths 0.35 / 0.45 / 0.55 to find the right "same family but visibly
 * different" sweet spot for per-tile floor variation.
 *
 * Source: the v3 hero is produced by flux-pro v1.1 @512x512 with a fixed seed
 * (73500). That 512x512 square is the TRUE i2i init image (BEFORE resize+mask).
 * We regenerate it deterministically (same seed/prompt as style-test-floor-v3.cjs)
 * and cache it to assets/raw/floor_hero_v3_square.png, then run i2i off it.
 *
 * Post-processing per variant == hero pipeline:
 *   resize 512x256 (fill) -> vertical gradient correction (equalize per-row
 *   mean luminance, the "40.5 -> ~0" fix referenced in the v3 HTML) -> diamond
 *   mask (alpha). Output floor_variant_s35/_s45/_s55(.png + _half.png).
 *
 * NO writes to src/assets. NO cap sync. NO git.
 *
 * Usage: node scripts/style-test-floor-i2i.cjs
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
const OUT = path.join(__dirname, '..', 'assets', 'style-test');
const RAW = path.join(__dirname, '..', 'assets', 'raw');
const HERO_SQUARE = path.join(RAW, 'floor_hero_v3_square.png');

const HERO_SEED = 73500;
const BASE = 'top-down aerial photograph, interior floor texture filling entire image edge to edge, no sky, no walls, no borders, no vignette, sci-fi industrial aesthetic, realistic, seamless tileable floor section';
const EVEN = 'perfectly even uniform lighting across entire surface, flat ambient light, no vertical gradient, no bright top edge, no vignette, consistent brightness corner to corner';
const HERO_PROMPT = `${BASE}, ${EVEN}, very dark charcoal near-black graphite deck plating from directly above, dim moody industrial lighting, sparse faint dimmed copper accent seam lines, low-glow muted copper, dark sci-fi atmosphere, deep shadows, mid-dark to near-black neutral surface, calm low-contrast detail, NO yellow hazard stripes, NO bright glowing lines`;

const STRENGTHS = [
  { tag: 's35', strength: 0.35, seed: 91035 },
  { tag: 's45', strength: 0.45, seed: 91045 },
  { tag: 's55', strength: 0.55, seed: 91055 },
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

// --- vertical gradient correction (hero "40.5 -> ~0" fix) ---------------
// Equalize per-row mean luminance to the global mean by adding a per-row
// delta to each RGB channel. Operates on the resized 512x256 (no alpha yet).
async function correctVerticalGradient(buf) {
  const img = sharp(buf).removeAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info; // channels == 3
  const rowMean = new Float64Array(height);
  let globalMean = 0;
  for (let y = 0; y < height; y++) {
    let s = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      // perceptual luma
      s += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    rowMean[y] = s / width;
    globalMean += rowMean[y];
  }
  globalMean /= height;
  const out = Buffer.from(data); // copy
  for (let y = 0; y < height; y++) {
    const delta = globalMean - rowMean[y];
    if (delta === 0) continue;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      for (let c = 0; c < channels; c++) {
        let v = data[i + c] + delta;
        out[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
  return { buf: await sharp(out, { raw: { width, height, channels } }).png().toBuffer(), rowMean, globalMean, height };
}

function gradientStats(rowMean, height) {
  const topMean = (rowMean[0] + rowMean[1] + rowMean[2] + rowMean[3]) / 4;
  const botMean = (rowMean[height - 1] + rowMean[height - 2] + rowMean[height - 3] + rowMean[height - 4]) / 4;
  return Math.abs(topMean - botMean);
}

async function postProcess(rawBuf, tag) {
  // resize square -> 512x256 (fill), like the hero pipeline
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).png().toBuffer();
  // measure pre-correction gradient for the report
  const pre = await correctVerticalGradient(resized);
  const preDiff = gradientStats(pre.rowMean, pre.height);
  // measure post-correction gradient
  const post = await correctVerticalGradient(pre.buf);
  const postDiff = gradientStats(post.rowMean, post.height);
  // diamond mask
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(pre.buf).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const full = path.join(OUT, `floor_variant_${tag}.png`);
  fs.writeFileSync(full, masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `floor_variant_${tag}_half.png`), half);
  console.log(`[save] ${full} grad ${preDiff.toFixed(1)} -> ${postDiff.toFixed(1)}`);
}

async function ensureHeroSquare() {
  if (fs.existsSync(HERO_SQUARE)) {
    console.log(`[hero] cached ${HERO_SQUARE}`);
    return fs.readFileSync(HERO_SQUARE);
  }
  console.log(`[hero] regenerating square seed ${HERO_SEED} via flux-pro v1.1`);
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/v1.1', {
    prompt: HERO_PROMPT, image_size: { width: GEN_SIZE, height: GEN_SIZE },
    num_images: 1, enable_safety_checker: false, seed: HERO_SEED,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no hero image url');
  const buf = await download(url);
  fs.mkdirSync(RAW, { recursive: true });
  fs.writeFileSync(HERO_SQUARE, buf);
  console.log(`[hero] saved ${HERO_SQUARE} (${Math.round(buf.length / 1024)}KB)`);
  return buf;
}

async function i2i(squareBuf, cfg) {
  // png square -> data URI (avoids fal storage round-trip)
  const dataUri = `data:image/png;base64,${squareBuf.toString('base64')}`;
  console.log(`[i2i] ${cfg.tag} strength ${cfg.strength} seed ${cfg.seed}`);
  const r = await fetchJson('https://fal.run/fal-ai/flux/dev/image-to-image', {
    image_url: dataUri,
    prompt: HERO_PROMPT,
    strength: cfg.strength,
    image_size: { width: GEN_SIZE, height: GEN_SIZE },
    num_inference_steps: 40,
    guidance_scale: 3.5,
    num_images: 1,
    enable_safety_checker: false,
    seed: cfg.seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no i2i image url for ' + cfg.tag);
  const out = await download(url);
  await postProcess(out, cfg.tag);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const square = await ensureHeroSquare();
  for (const cfg of STRENGTHS) {
    try { await i2i(square, cfg); } catch (e) { console.error(`ERR ${cfg.tag}: ${e.message}`); }
  }
  console.log('done');
})();
