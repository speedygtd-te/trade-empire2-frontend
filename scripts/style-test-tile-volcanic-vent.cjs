/**
 * Style-test ONLY: 4 candidates (v1..v4) for a HERO style-test of the VOLCANIC
 * surface tile VOLCANIC_VENT. NO integration into src/, NO cap sync, NO commit.
 *
 * METHOD (Rudi's explicit direction): RECYCLE the just-finished lava_flow hero
 * tile as the kontext base and, via flux-pro/kontext POSITIVE TRANSFORM, make the
 * lava much MORE ACTIVE / HOTTER / BRIGHTER. volcanic_vent = the ACTIVE / HOTTER
 * cousin of lava_flow (subdued deep-ember cracks) and magma_pocket (cooled crust +
 * scattered bright openings).
 *   - Base (keep): the dark basalt rock that FRAMES the lava.
 *   - Transform: lava_flow's subdued deep-ember cracks -> BRIGHT, HOT, ACTIVELY
 *     GLOWING molten lava — vivid orange with bright yellow (even yellow-white) hot
 *     cores, intense glow/bloom, molten + active/flowing (not cooled). This is the
 *     ONE volcanic biome where bright/hot glow is WANTED (active lava).
 *   - CRUCIAL for tiling: keep an EVEN NETWORK of hot molten fissures distributed
 *     across the WHOLE tile — NO single central vent, no central feature, no
 *     diagonal band/river. Dark rock still frames the lava.
 *
 * Base image (kontext input): assets/style-test/tiles/lava_flow_l2.png
 *   (512x256 diamond-masked RGBA — the cooled-crust + deep-ember-network look).
 *
 * Pipeline (kontext call + half/mosaic verbatim from
 * scripts/style-test-tile-magma-pocket.cjs):
 *   flux-pro/kontext (image_url = base data URI, num_images 1,
 *     safety_tolerance '5', fixed seed — NO Math.random)
 *   -> resize 512x256 (fill)
 *   -> GENTLE 2D brightness equalization (see equalize2DSoft below)
 *   -> diamond mask (alpha)
 *   -> _half (256x128) + _mosaic preview
 * Output: assets/style-test/tiles/volcanic_vent_v<1..4>.png (+ _half + _mosaic)
 *
 * EQUALIZE NOTE (per task): the standard equalize2D (magma_pocket / obsidian) flattens
 * global gradients by dividing the image by a blurred copy of itself and re-multiplying
 * by the global mean — this also drags BRIGHT HOT CORES back toward the mean, killing the
 * glow that IS the point for volcanic_vent. So this script uses equalize2DSoft(): it
 * computes the same gradient-flattened image but BLENDS it with the original at a low
 * strength (EQ_STRENGTH=0.35), so a global gradient is still toned down while the bright
 * yellow/yellow-white molten cores and their bloom survive. Documented in the report.
 *
 * Positive-only prompts (no negatives — negatives reproduce the unwanted thing). Each
 * candidate varies HEAT / BRIGHTNESS / molten coverage; all stay an even network, none a
 * single central vent.
 *
 * fal key in scripts/.env (FAL_AI_API_KEY) — never hardcode / commit.
 *
 * Usage: node scripts/style-test-tile-volcanic-vent.cjs [onlyLevel]
 *   onlyLevel optional (v1|v2|v3|v4) -> re-roll just that candidate (seed += 137)
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
if (!FAL_API_KEY) { console.error('No fal key (FAL_AI_API_KEY in scripts/.env)'); process.exit(1); }
const https = require('https');
const http = require('http');
const sharp = require('sharp');

const TILE_W = 512, TILE_H = 256;
const EQ_STRENGTH = 0.35; // gentle: blend gradient-flattened with original to preserve hot cores
const OUT = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');
const BASE = path.join(OUT, 'lava_flow_l2.png');

// 4 candidates. Distinct fixed 6-digit seeds (NO Math.random). Positive-only,
// transform kontext prompts — vary HEAT / BRIGHTNESS / molten coverage; all stay
// an EVEN NETWORK, never a single central vent.
const KEEP = 'keep the dark basalt rock that frames the lava exactly as in the base, the same crack network shapes and the same even distribution of fissures across the whole tile';
const NETWORK = 'an even network of hot molten fissures spread across the entire tile, evenly distributed, several separate channels, no single central vent, no central feature, no central pool, no diagonal band, no diagonal river of lava';
const CANDIDATES = {
  // v1 ACTIVE: clearly more active than lava_flow — brighter vivid orange, modest yellow cores.
  v1: {
    seed: 417063,
    prompt: `${KEEP}, turn the subdued deep ember cracks into clearly brighter vivid hot glowing orange molten lava with modest bright yellow hot cores in the centre of the channels, the lava reads hot and active and molten not cooled, a soft warm glow, ${NETWORK}`,
    cap: 'v1 — brighter vivid orange fissures, modest yellow cores (clearly more active than lava_flow)',
  },
  // v2 HOT (likely sweet spot): bright orange-yellow molten, distinct yellow cores, more glow.
  v2: {
    seed: 528147,
    prompt: `${KEEP}, turn the cracks into bright hot glowing orange-yellow molten lava with distinct bright yellow hot cores running down the centre of every channel, intense warm glow and soft bloom around the molten lava, the lava looks actively molten and flowing, ${NETWORK}`,
    cap: 'v2 — bright orange-yellow molten, distinct bright yellow cores, more glow (likely sweet spot)',
  },
  // v3 VERY HOT: yellow-white cores in places, wider/more molten coverage, strong glow/bloom.
  v3: {
    seed: 639258,
    prompt: `${KEEP}, turn the cracks into very hot brightly glowing molten lava, vivid orange channels with bright yellow and yellow-white scorching hot cores in places, wider and more molten with more lava coverage, strong intense glow and bright bloom radiating from the molten lava, actively molten and flowing, ${NETWORK}`,
    cap: 'v3 — yellow-white hot cores in places, wider molten coverage, strong glow/bloom (very hot)',
  },
  // v4 MOST INTENSE: widest bright molten flows, brightest yellow-white cores, most aggressive.
  v4: {
    seed: 740369,
    prompt: `${KEEP}, turn the cracks into the widest brightest most intensely active molten lava flows, blazing vivid orange channels with brilliant yellow-white hot molten cores, the widest molten coverage with bright lava filling the channels, the most aggressive intense glow and bright bloom everywhere the lava runs, fiercely hot actively flowing molten lava, ${NETWORK}`,
    cap: 'v4 — widest brightest molten flows, brightest yellow-white cores, most aggressive (most intense)',
  },
};

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

// GENTLE 2D brightness equalization. Same gradient-flattening math as the standard
// equalize2D (divide by heavily-blurred copy, re-multiply by per-channel mean) BUT the
// flattened result is BLENDED with the original at EQ_STRENGTH so global gradients are
// only partially toned down — keeping the bright yellow/yellow-white hot cores and their
// bloom intact (full equalization drags them back toward the global mean and kills the
// glow that is the whole point of volcanic_vent). Operates on the RGB 512x256 result.
async function equalize2DSoft(squareBuf) {
  const img = sharp(squareBuf).removeAlpha();
  const { width, height } = await img.metadata();
  const w = width || TILE_W, h = height || TILE_H;
  const base = await img.raw().toBuffer(); // RGB
  const blurRadius = Math.round(Math.min(w, h) / 4);
  const lowFreq = await sharp(base, { raw: { width: w, height: h, channels: 3 } })
    .blur(blurRadius).raw().toBuffer();
  const mean = [0, 0, 0];
  const px = w * h;
  for (let i = 0; i < base.length; i += 3) {
    mean[0] += base[i]; mean[1] += base[i + 1]; mean[2] += base[i + 2];
  }
  mean[0] /= px; mean[1] /= px; mean[2] /= px;
  const out = Buffer.alloc(base.length);
  for (let i = 0; i < base.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const lf = lowFreq[i + c] || 1;
      const eq = (base[i + c] / lf) * mean[c];
      // blend flattened (eq) toward the original (base) so hot cores survive
      const v = base[i + c] * (1 - EQ_STRENGTH) + eq * EQ_STRENGTH;
      out[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

// Interior color / luma stats (alpha>8 only) — look-guard so a candidate's heat vs the
// base can be reported (positive dLuma is EXPECTED here — hotter = brighter).
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
const fmtC = (c) => `R${c.r.toFixed(0)} G${c.g.toFixed(0)} B${c.b.toFixed(0)} luma${c.luma.toFixed(1)}`;

// Build an interlocking diamond mosaic from a half-tile (256x128) buffer
// (verbatim from style-test-tile-magma-pocket.cjs).
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

async function postProcess(rawBuf, level) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha().png().toBuffer();
  const equalized = await equalize2DSoft(resized);
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(equalized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const full = path.join(OUT, `volcanic_vent_${level}.png`);
  fs.writeFileSync(full, masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `volcanic_vent_${level}_half.png`), half);
  await buildMosaic(half, path.join(OUT, `volcanic_vent_${level}_mosaic.png`));
  console.log(`[save] ${full} (+ _half, _mosaic)`);
  return masked;
}

async function genLevel(level, cfg, baseC) {
  const basisPng = await sharp(fs.readFileSync(BASE)).png().toBuffer();
  const dataUri = `data:image/png;base64,${basisPng.toString('base64')}`;
  console.log(`[kontext] ${level} seed ${cfg.seed} prompt="${cfg.prompt}"`);
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/kontext', {
    image_url: dataUri,
    prompt: cfg.prompt,
    num_images: 1,
    safety_tolerance: '5',
    seed: cfg.seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no kontext url for ' + level + ': ' + JSON.stringify(r).slice(0, 200));
  const out = await download(url);
  const masked = await postProcess(out, level);
  const c = await colorStats(masked);
  const dLuma = c.luma - baseC.luma;
  console.log(`  ${level}: base[${fmtC(baseC)}] cand[${fmtC(c)}] dLuma ${dLuma.toFixed(1)} (positive = hotter/brighter, expected)`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if (!fs.existsSync(BASE)) { console.error('Missing base: ' + BASE); process.exit(1); }
  const baseC = await colorStats(await sharp(fs.readFileSync(BASE)).png().toBuffer());
  console.log(`[base] lava_flow_l2 ${fmtC(baseC)} (EQ_STRENGTH ${EQ_STRENGTH} — gentle, hot cores preserved)`);
  const only = process.argv[2];
  for (const [level, cfg] of Object.entries(CANDIDATES)) {
    if (only && only !== level) continue;
    if (only === level) cfg.seed += 137;
    try { await genLevel(level, cfg, baseC); } catch (e) { console.error(`ERR ${level}: ${e.message}`); }
  }
  console.log('done');
})();
