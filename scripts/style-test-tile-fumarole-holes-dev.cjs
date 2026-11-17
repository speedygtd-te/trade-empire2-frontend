/**
 * Style-test ONLY: 4 candidates (h1..h4) for the FUMAROLE rework v2, same
 * direction as the g-series (scattered yellow sulfur holes on the ash_field_1
 * base) but using a DIFFERENT fal model: FLUX.1 Kontext [dev]
 * (fal-ai/flux-kontext/dev) instead of fal-ai/flux-pro/kontext.
 * NO integration into src/, NO cap sync, NO commit.
 * Keeps f1..f4 and g1..g4 intact — this writes fumarole_h1..h4.
 *
 * METHOD (Rudi): RECYCLE the finished ash_field_1 tile (dark ashy volcanic rock
 * WITH glowing ember cracks) as the kontext base and, via the dev model, ADD ONLY
 * scattered YELLOW SULFUR HOLES.
 *   - Base look (keep): src/assets/tiles/ash_field/ash_field_1.webp = dark ashy
 *     rock + glowing ember cracks (512x256, diamond-masked; converted to PNG
 *     in-memory for image_url).
 *   - fumarole identity (ADD): ONLY scattered YELLOW SULFUR HOLES — discrete small
 *     round pits filled and rimmed with dry BRIGHT YELLOW sulfur mineral crust,
 *     COLD (not molten / not glowing / not lava).
 *   - Holes SCATTERED + evenly distributed, no central hole, no plume, dark ashy
 *     base dominant. Ember cracks surviving alongside the holes is WELCOME (Rudi
 *     liked the base for its embers) — the dev model may preserve the base better
 *     than flux-pro did, so we do NOT fight to remove the embers.
 *
 * MODEL-PARAM NOTES (fal-ai/flux-kontext/dev):
 *   - Endpoint: https://fal.run/fal-ai/flux-kontext/dev
 *   - Takes image_url (data URI ok) + prompt. Returns JPEG 512x256 + a `seed`.
 *   - Probe showed it 200s and IGNORES unknown fields (no 400 on a bogus field),
 *     and it accepts safety_tolerance. We send the dev-typical editing params:
 *     guidance_scale, num_inference_steps, seed, num_images. (Unsupported fields
 *     are silently ignored, so this is safe; safety_tolerance kept for parity.)
 *
 * Pipeline (postProcess / equalize2D / diamond mask / mosaic verbatim from
 * scripts/style-test-tile-fumarole-holes.cjs):
 *   dev kontext edit -> resize 512x256 (fill) -> equalize2D -> diamond mask
 *   -> _half (256x128) + _mosaic
 * Output: assets/style-test/tiles/fumarole_h<1..4>.png (+ _half + _mosaic)
 *
 * Positive-only prompts (no negatives). 4 candidates vary HOLE COUNT / SIZE.
 *
 * fal key in scripts/.env (FAL_AI_API_KEY) — never hardcode / commit.
 *
 * Usage: node scripts/style-test-tile-fumarole-holes-dev.cjs [onlyLevel]
 *   onlyLevel optional (h1|h2|h3|h4) -> re-roll just that candidate (seed += 137)
 *   FUMAROLE_NO_OFFSET=1 -> re-run a single level at its base seed (no +137)
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
const BASE = path.join(__dirname, '..', 'src', 'assets', 'tiles', 'ash_field', 'ash_field_1.webp');
const ENDPOINT = 'https://fal.run/fal-ai/flux-kontext/dev';

// Shared positive-only fragments (same intent as the g-series holes script).
const KEEP = 'keep the dark ashy volcanic rock of the base and its existing glowing orange ember cracks as they are, the dark ashy rock and its faint glowing ember cracks still dominate most of the surface';
const HOLES = 'small discrete round holes and pits dug into the rock, each hole filled and rimmed with dry bright yellow powdery sulfur mineral crust, vivid dry chalky sulfur yellow, a cold dry powdery sulphur deposit lining each pit, the sulfur is cold dry crusty powder, never glowing, never molten, never wet, never orange lava, just bright dry yellow sulfur mineral crust in and around each little round hole';
const LAYOUT = 'the yellow sulfur holes scattered evenly across the ENTIRE surface as many small separate round pits, the middle just as detailed as the edges, no single central hole, no central feature, no dominant central pit, no big central blob, no concentration at the edges, no ring at the edges, no diagonal band, no diagonal line, seamless tileable edge to edge, uniform overall brightness, no light side, no dark side, no gradient';
const TONE = 'bright dry chalky yellow sulfur, distinctly yellow but a dry cold mineral crust not glowing, the dark ashy rock and its ember cracks stay dominant, the yellow sulfur holes are a scattered minority of the surface, dim grimy matte volcanic palette overall';

const CANDIDATES = {
  // h1 FEW small holes.
  h1: {
    seed: 318044,
    prompt: `${KEEP}, add a light scatter of a few small clearly visible ${HOLES}, just a sparse handful of small yellow sulfur holes, ${LAYOUT}, ${TONE}`,
    cap: 'h1 — a few small scattered yellow sulfur holes (most restrained)',
  },
  // h2 MODERATE scatter. (Reroll: dev model washed the whole tile yellow at the
  // original seed/prompt — cap coverage hard so the sulfur stays only inside small
  // discrete pits and the dark rock keeps most of the surface.)
  h2: {
    seed: 429988,
    guidance: 2.3, // lower guidance: dev washed the whole tile yellow at 3.5
    prompt: `${KEEP}, add a moderate even scatter of separate small ${HOLES}, several small distinct yellow sulfur holes spread evenly over the tile, the yellow sulfur stays only inside and around each small round pit and never spreads as a yellow wash over the rock, the dark ashy rock between the holes keeps most of the surface, ${LAYOUT}, ${TONE}`,
    cap: 'h2 — moderate even scatter of small yellow sulfur holes',
  },
  // h3 MORE holes, still small.
  h3: {
    seed: 537261,
    prompt: `${KEEP}, add more scattered ${HOLES}, many small yellow sulfur holes densely but evenly spread across the surface, the dark ashy rock still dominates between them, ${LAYOUT}, ${TONE}`,
    cap: 'h3 — more small yellow sulfur holes, evenly spread',
  },
  // h4 DENSER + slightly LARGER holes. (Reroll: original washed the whole tile
  // yellow — cap coverage so the sulfur stays inside discrete pits.)
  h4: {
    seed: 649102,
    guidance: 2.5, // lower guidance: dev washed the whole tile yellow at 3.5
    prompt: `${KEEP}, add many separate ${HOLES}, lots of distinct yellow sulfur holes some a bit larger than the others, more holes and slightly larger round pits but each one a separate discrete pit, the yellow sulfur stays only inside and around each round pit and never spreads as a yellow wash over the rock, the dark ashy rock stays dominant between the holes, ${LAYOUT}, ${TONE}`,
    cap: 'h4 — more and slightly larger yellow sulfur holes, denser',
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
  const full = path.join(OUT, `fumarole_${level}.png`);
  fs.writeFileSync(full, masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `fumarole_${level}_half.png`), half);
  await buildMosaic(half, path.join(OUT, `fumarole_${level}_mosaic.png`));
  console.log(`[save] ${full} (+ _half, _mosaic)`);
  return masked;
}

async function baseDataUri(webpPath) {
  const png = await sharp(fs.readFileSync(webpPath)).removeAlpha().png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function genLevel(level, cfg) {
  const dataUri = await baseDataUri(BASE);
  const baseC = await colorStats(await sharp(fs.readFileSync(BASE)).png().toBuffer());
  console.log(`[kontext-dev] ${level} base=ash_field_1 seed ${cfg.seed}`);
  console.log(`  prompt="${cfg.prompt}"`);
  // fal-ai/flux-kontext/dev editing params: image_url + prompt + the dev-typical
  // guidance_scale / num_inference_steps / seed / num_images. safety_tolerance is
  // a flux-pro/kontext field — dropped here (dev model does not use it).
  const r = await fetchJson(ENDPOINT, {
    image_url: dataUri,
    prompt: cfg.prompt,
    num_images: 1,
    seed: cfg.seed,
    guidance_scale: cfg.guidance != null ? cfg.guidance : 3.5,
    num_inference_steps: 30,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no kontext-dev url for ' + level + ': ' + JSON.stringify(r).slice(0, 200));
  const out = await download(url);
  const masked = await postProcess(out, level);
  const c = await colorStats(masked);
  const dLuma = c.luma - baseC.luma;
  console.log(`  ${level}: base[${fmtC(baseC)}] cand[${fmtC(c)}] dLuma ${dLuma.toFixed(1)} (resp seed ${r.seed})`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if (!fs.existsSync(BASE)) { console.error('Missing base: ' + BASE); process.exit(1); }
  const only = process.argv[2];
  for (const [level, cfg] of Object.entries(CANDIDATES)) {
    if (only && only !== level) continue;
    if (only === level && !process.env.FUMAROLE_NO_OFFSET) cfg.seed += 137;
    try { await genLevel(level, cfg); } catch (e) { console.error(`ERR ${level}: ${e.message}`); }
  }
  console.log('done');
})();
