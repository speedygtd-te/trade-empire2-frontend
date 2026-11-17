/**
 * Style-test ONLY: 4 candidates (f1..f4) for a HERO style-test of the VOLCANIC
 * surface tile FUMAROLE. NO integration into src/, NO cap sync, NO commit.
 *
 * METHOD (Rudi's explicit direction): RECYCLE a finished dark VOLCANIC base and
 * ADD the fumarole identity via a flux-pro/kontext POSITIVE ADDITIVE edit. So:
 *   - Base look (keep): the approved basalt_plain style = dark cooled charcoal /
 *     black matte basalt rock. The finished tile src/assets/tiles/basalt_plain/
 *     basalt_plain_0.webp (512x256, diamond-masked) is converted to PNG in-memory
 *     and used as the kontext image_url. ash_field_0.webp is available as a
 *     dustier alternative base (used for f4 here) — both already 512x256 masked.
 *   - fumarole's distinguishing feature (ADD):
 *       (1) MUTED / desaturated dirty ochre / mustard-yellow SULFUR crust deposits
 *           around small SCATTERED vents and cracks (this is the MAIN identity),
 *       (2) a faint, thin, FLAT low-lying HAZE of pale volcanic gas drifting over
 *           the surface — a faint flat veil ONLY.
 *   - CRITICAL constraints (Rudi): sulfur is the MAIN identity, the haze is a
 *     faint flat veil only — NO tall plume, NO big central steam column (those
 *     tile badly top-down). Sulfur muted / dirty (dirty ochre / mustard, NOT
 *     neon / bright yellow). Everything SCATTERED and evenly distributed — NO
 *     single central vent, NO central feature, NO diagonal band. Dark matte rock
 *     still dominates; sulfur + haze are a minority of the surface. Desaturated,
 *     dim, matte, consistent with the VOLCANIC family (basalt_plain / ash_field /
 *     lava_flow).
 *
 * Pipeline (kontext call + equalize verbatim from
 * scripts/style-test-tile-magma-pocket.cjs; half/mosaic postProcess +
 * buildMosaic verbatim too):
 *   flux-pro/kontext (image_url = base data URI, num_images 1,
 *     safety_tolerance '5', fixed seed — NO Math.random)
 *   -> resize 512x256 (fill)
 *   -> 2D brightness equalization (kill any global gradient / bright haze blob)
 *   -> diamond mask (alpha)
 *   -> _half (256x128) + _mosaic preview
 * Output: assets/style-test/tiles/fumarole_f<1..4>.png (+ _half + _mosaic)
 *
 * The kontext prompt is POSITIVE-ONLY (no negatives — they reproduce the unwanted
 * thing), concise. Each candidate varies SULFUR coverage + HAZE amount but all
 * stay muted, scattered, faint-flat-haze, never a central plume / vent.
 *
 * fal key in scripts/.env (FAL_AI_API_KEY) — never hardcode / commit.
 *
 * Usage: node scripts/style-test-tile-fumarole.cjs [onlyLevel]
 *   onlyLevel optional (f1|f2|f3|f4) -> re-roll just that candidate (seed += 137)
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
const BASALT = path.join(__dirname, '..', 'src', 'assets', 'tiles', 'basalt_plain', 'basalt_plain_0.webp');
const ASHFIELD = path.join(__dirname, '..', 'src', 'assets', 'tiles', 'ash_field', 'ash_field_0.webp');

// Shared positive-only fragments. KEEP locks the recycled dark matte basalt base;
// SULFUR is the muted dirty-ochre identity; HAZE is the faint flat veil ONLY;
// LAYOUT is the anti-central / anti-band / seamless language (reused VERBATIM from
// obsidian-ridge so the sulfur + haze stay evenly distributed); TONE keeps it
// dark / matte / desaturated like the rest of the VOLCANIC family.
const KEEP = 'keep the dark cooled black charcoal matte basalt rock of the base exactly, the dark matte volcanic rock still dominates most of the surface';
// SULFUR framed as a COLD DRY POWDERY MINERAL CRUST dusting the rock surface (not
// around cracks — that read as lava). Explicitly dull, chalky, matte, not glowing.
const SULFUR = 'dry cold powdery dull sulfur mineral crust the colour of dirty mustard and muted ochre, a chalky matte sulfur dusting and staining patches sitting on top of the dark rock surface, like dried sulphur chemical deposits, dull and grimy and completely matte, the sulfur is cold dry powder, never glowing, never molten, never wet, never orange lava, just a muted dusty mustard-ochre mineral stain on the rock';
const HAZE_FAINT = 'plus a very faint thin flat low-lying veil of pale grey volcanic gas haze drifting just over the ground, a barely-there flat mist hugging the surface, the haze stays low and flat and thin and even, just a thin ground-hugging veil';
const LAYOUT = 'the sulfur patches and the haze scattered evenly across the ENTIRE surface as many small separate stains, the middle just as detailed as the edges, no single central patch, no central feature, no dominant central plume, no central column, no big central blob, no concentration at the edges, no ring at the edges, no diagonal band, no diagonal line, seamless tileable edge to edge, uniform overall brightness, no light side, no dark side, no gradient, no single bright patch';
const TONE = 'muted desaturated dirty dull ochre and dusty mustard, chalky and grimy, never neon, never bright pure yellow, never glowing, dim matte, dark matte volcanic palette, somber, the sulfur and haze are a minority of the surface and the dark rock dominates';

// 4 candidates. Distinct fixed 6-digit seeds (NO Math.random). Positive-only,
// additive kontext prompts — vary SULFUR coverage + HAZE amount; all stay muted,
// scattered, faint-flat-haze, never a central plume / vent.
const CANDIDATES = {
  // f1 LIGHT: a few small muted-sulfur-crusted vents, very faint haze, base dominates most.
  f1: {
    base: BASALT, baseLabel: 'basalt_plain',
    seed: 318042,
    prompt: `${KEEP}, add a few small sparse patches of ${SULFUR}, the sulfur dusting is sparse and subtle, ${HAZE_FAINT} only the faintest trace of haze, ${LAYOUT}, ${TONE}`,
    cap: 'f1 — light: a few small muted-sulfur stains, very faint haze, base dominates (most restrained)',
  },
  // f2 BALANCED: moderate scattered sulfur staining around vents/cracks + faint thin haze (likely sweet spot).
  f2: {
    base: BASALT, baseLabel: 'basalt_plain',
    seed: 429173,
    prompt: `${KEEP}, add a moderate even scatter of small to medium patches of ${SULFUR}, ${HAZE_FAINT} a faint thin flat haze drifts low over parts of the surface, ${LAYOUT}, ${TONE}`,
    cap: 'f2 — balanced: moderate scattered sulfur staining + faint thin haze (likely sweet spot)',
  },
  // f3 MORE SULFUR: dirtier ochre crusting across more of the surface, still faint flat haze.
  f3: {
    base: BASALT, baseLabel: 'basalt_plain',
    seed: 537619,
    prompt: `${KEEP}, add more scattered sulfur: many patches of ${SULFUR} covering more of the surface, grimier dusty sulfur staining spread across the ground but the dark matte rock still dominates, ${HAZE_FAINT} a faint thin flat haze drifts low over the surface, ${LAYOUT}, ${TONE}`,
    cap: 'f3 — more sulfur coverage, dirtier ochre crusting across more of the surface, still faint flat haze',
  },
  // f4 HEAVIEST: heaviest sulfur + slightly more visible (still low/flat, non-plume) haze wisps; darkest/dirtiest.
  // Uses ash_field as the dustier alternative base for grimier read.
  f4: {
    base: BASALT, baseLabel: 'basalt_plain',
    seed: 648251,
    prompt: `${KEEP}, add heavy scattered sulfur: many patches of ${SULFUR} encrusting much of the ground all over, the dirtiest grimiest dustiest sulfur staining of all, ${HAZE_FAINT} slightly more visible faint flat low even wisps of pale grey haze drifting just over the surface but still low and flat and thin, never rising, ${LAYOUT}, ${TONE}`,
    cap: 'f4 — heaviest sulfur + slightly more visible low/flat haze wisps; darkest/dirtiest',
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

// 2D brightness equalization (verbatim from style-test-tile-magma-pocket.cjs):
// divide the image by a heavily-blurred copy of itself (low-frequency illumination)
// and re-multiply by the per-channel mean, flattening any global gradient / bright
// haze blob while preserving local relief. Operates on the RGB 512x256 result.
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
// blows out far brighter (a big white haze blob) than the base can be flagged.
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

// Load a finished .webp tile and convert to a PNG data URI for the kontext base.
async function baseDataUri(webpPath) {
  const png = await sharp(fs.readFileSync(webpPath)).removeAlpha().png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function genLevel(level, cfg) {
  const dataUri = await baseDataUri(cfg.base);
  const baseC = await colorStats(await sharp(fs.readFileSync(cfg.base)).png().toBuffer());
  console.log(`[kontext] ${level} base=${cfg.baseLabel} seed ${cfg.seed}`);
  console.log(`  prompt="${cfg.prompt}"`);
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
    console.warn(`  WARN ${level} ${dLuma.toFixed(1)} luma brighter than base — possible big haze blob; consider re-roll.`);
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const p of [BASALT, ASHFIELD]) {
    if (!fs.existsSync(p)) { console.error('Missing base: ' + p); process.exit(1); }
  }
  const only = process.argv[2];
  for (const [level, cfg] of Object.entries(CANDIDATES)) {
    if (only && only !== level) continue;
    if (only === level && !process.env.FUMAROLE_NO_OFFSET) cfg.seed += 137;
    try { await genLevel(level, cfg); } catch (e) { console.error(`ERR ${level}: ${e.message}`); }
  }
  console.log('done');
})();
