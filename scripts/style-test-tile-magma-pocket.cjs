/**
 * Style-test ONLY: 4 candidates (m1..m4) for a HERO style-test of the VOLCANIC
 * surface tile MAGMA_POCKET. NO integration into src/, NO cap sync, NO commit.
 *
 * METHOD (Rudi's explicit direction): RECYCLE the just-finished lava_flow hero
 * tile as the kontext base and, via a flux-pro/kontext POSITIVE ADDITIVE edit,
 * ADD smaller openings of BRIGHTER molten lava into the tile. So:
 *   - Base look (keep): the approved lava_flow style = dark cooled black/charcoal
 *     matte basalt crust + a subdued DEEP-EMBER crack network.
 *   - magma_pocket's distinguishing feature (add): a scatter of SMALL round /
 *     irregular openings / vents of BRIGHTER glowing molten lava (hotter, brighter
 *     orange than the surrounding deep-ember cracks), distributed across the tile.
 *   - CRUCIAL for tiling: the bright openings must be SMALL and SCATTERED (several
 *     small ones), NOT one big central pool — so tiles don't form a visible grid of
 *     identical central pools. Even-ish distribution, no single dominant central
 *     feature, no diagonal band.
 *
 * Base image (kontext input): assets/style-test/tiles/lava_flow_l2.png
 *   (512x256 diamond-masked RGBA — the cooled-crust + deep-ember-network look).
 *
 * Pipeline (kontext call + equalize verbatim from
 * scripts/obsidian-ridge-derive-from-basis.cjs; half/mosaic postProcess +
 * buildMosaic verbatim from scripts/style-test-tile-lava-flow.cjs):
 *   flux-pro/kontext (image_url = base data URI, num_images 1,
 *     safety_tolerance '5', fixed seed — NO Math.random)
 *   -> resize 512x256 (fill)
 *   -> 2D brightness equalization (kill any global gradient / bright blob)
 *   -> diamond mask (alpha)
 *   -> _half (256x128) + _mosaic preview
 * Output: assets/style-test/tiles/magma_pocket_m<1..4>.png (+ _half + _mosaic)
 *
 * The kontext prompt is POSITIVE-ONLY (no negatives — they reproduce the unwanted
 * thing), concise (kontext works best short). Each candidate varies opening
 * SIZE / BRIGHTNESS / COUNT but all stay scattered, none a single central pool.
 *
 * fal key in scripts/.env (FAL_AI_API_KEY) — never hardcode / commit.
 *
 * Usage: node scripts/style-test-tile-magma-pocket.cjs [onlyLevel]
 *   onlyLevel optional (m1|m2|m3|m4) -> re-roll just that candidate (seed += 137)
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
const OUT = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');
const BASE = path.join(OUT, 'lava_flow_l2.png');

// 4 candidates. Distinct fixed 6-digit seeds (NO Math.random). Positive-only,
// additive kontext prompts — vary opening SIZE / BRIGHTNESS / COUNT; all stay
// SMALL + SCATTERED, never a single central pool.
const KEEP = 'keep the dark cooled black charcoal basalt rock and its subdued deep ember glowing cracks exactly as the base';
const SCATTER = 'scattered evenly across the whole surface, several separate small ones, no single big central pool, no central feature';
const CANDIDATES = {
  // m1 RESTRAINED: a FEW small subtle openings, only moderately brighter than the cracks.
  m1: {
    seed: 412067,
    prompt: `${KEEP}, add a few small subtle round openings of slightly brighter glowing molten orange lava, only moderately brighter than the cracks, ${SCATTER}`,
    cap: 'm1 — a few small subtle openings, only moderately brighter (most restrained)',
  },
  // m2 BALANCED: SEVERAL small openings, clearly brighter hot-orange, evenly scattered.
  m2: {
    seed: 537248,
    prompt: `${KEEP}, add several small round openings of clearly brighter hot glowing molten orange lava, distinctly hotter and brighter than the surrounding ember cracks, ${SCATTER}`,
    cap: 'm2 — several small clearly brighter hot-orange openings, evenly scattered (balanced)',
  },
  // m3 LARGER-FEWER: FEWER but slightly LARGER brighter openings, still scattered.
  m3: {
    seed: 648319,
    prompt: `${KEEP}, add a few slightly larger round openings of brighter hot glowing molten orange lava, fewer but each a bit larger, still small relative to the tile, ${SCATTER}`,
    cap: 'm3 — fewer but slightly larger brighter openings, still scattered',
  },
  // m4 BUSIEST: MANY small bright lava vents densely scattered across the tile.
  m4: {
    seed: 803526,
    prompt: `${KEEP}, add many small round openings of bright hot glowing molten orange lava densely covering the whole tile, lots of small hot bright lava openings everywhere between the cracks, ${SCATTER}`,
    cap: 'm4 — many small bright lava vents densely scattered (busiest / brightest)',
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

// 2D brightness equalization (verbatim from obsidian-ridge-derive-from-basis.cjs):
// divide the image by a heavily-blurred copy of itself (low-frequency illumination)
// and re-multiply by the per-channel mean, flattening any global gradient / bright
// blob while preserving local relief. Operates on the RGB 512x256 result.
async function equalize2D(squareBuf) {
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
      const v = (base[i + c] / lf) * mean[c];
      out[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

// Interior color / luma stats (alpha>8 only) — look-guard so a candidate that
// blows out far brighter than the base can be flagged.
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
// (verbatim from style-test-tile-lava-flow.cjs).
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
  const equalized = await equalize2D(resized);
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(equalized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const full = path.join(OUT, `magma_pocket_${level}.png`);
  fs.writeFileSync(full, masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `magma_pocket_${level}_half.png`), half);
  await buildMosaic(half, path.join(OUT, `magma_pocket_${level}_mosaic.png`));
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
  console.log(`  ${level}: base[${fmtC(baseC)}] cand[${fmtC(c)}] dLuma ${dLuma.toFixed(1)}`);
  if (dLuma > 25) {
    console.warn(`  WARN ${level} ${dLuma.toFixed(1)} luma brighter than base — may be too blown-out; consider re-roll.`);
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if (!fs.existsSync(BASE)) { console.error('Missing base: ' + BASE); process.exit(1); }
  const baseC = await colorStats(await sharp(fs.readFileSync(BASE)).png().toBuffer());
  console.log(`[base] lava_flow_l2 ${fmtC(baseC)}`);
  const only = process.argv[2];
  for (const [level, cfg] of Object.entries(CANDIDATES)) {
    if (only && only !== level) continue;
    if (only === level) cfg.seed += 137;
    try { await genLevel(level, cfg, baseC); } catch (e) { console.error(`ERR ${level}: ${e.message}`); }
  }
  console.log('done');
})();
