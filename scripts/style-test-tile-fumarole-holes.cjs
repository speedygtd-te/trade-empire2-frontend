/**
 * Style-test ONLY: 4 candidates (g1..g4) for a NEW-DIRECTION HERO style-test of the
 * VOLCANIC surface tile FUMAROLE. NO integration into src/, NO cap sync, NO commit.
 * Keeps the earlier f1..f4 candidates intact — this writes fumarole_g1..g4.
 *
 * METHOD (Rudi's new direction): RECYCLE the finished ash_field_1 tile (dark ashy
 * volcanic rock WITH glowing ember cracks) as the kontext base and, via a
 * flux-pro/kontext POSITIVE ADDITIVE edit, ADD ONLY scattered YELLOW SULFUR HOLES.
 *   - Base look (keep): src/assets/tiles/ash_field/ash_field_1.webp = dark ashy
 *     rock + glowing ember cracks. KEEP the base (dark ashy rock + ember cracks)
 *     intact. (512x256, diamond-masked; converted to PNG in-memory for image_url.)
 *   - fumarole identity (ADD): ONLY scattered YELLOW SULFUR HOLES — discrete small
 *     round openings / pits in the ground, filled and rimmed with BRIGHT DRY YELLOW
 *     sulfur mineral crust. "nur gelbe schwefel löcher" (Rudi).
 *   - CRITICAL constraints (Rudi):
 *       * NO haze, NO steam, NO plume this time — just the holes.
 *       * Sulfur is clearly YELLOW (brighter, distinctly yellow), but a COLD DRY
 *         POWDERY MINERAL deposit — NOT molten, NOT glowing, NOT lava. (Earlier
 *         "sulfur around cracks" made kontext render glowing orange lava — avoid.
 *         Frame positively: small round holes filled with dry bright yellow
 *         powdery sulfur crust, cold not glowing.)
 *       * Holes SCATTERED and evenly distributed across the whole tile — no central
 *         hole, no central feature, no diagonal band. Keep existing ember cracks
 *         where they are.
 *       * Dark ashy base + ember cracks stay dominant; yellow sulfur holes are a
 *         scattered minority.
 *
 * Pipeline (verbatim from scripts/style-test-tile-fumarole.cjs):
 *   flux-pro/kontext (image_url = ash_field_1 PNG data URI, num_images 1,
 *     safety_tolerance '5', fixed seed — NO Math.random)
 *   -> resize 512x256 (fill)
 *   -> 2D brightness equalization
 *   -> diamond mask (alpha)
 *   -> _half (256x128) + _mosaic preview
 * Output: assets/style-test/tiles/fumarole_g<1..4>.png (+ _half + _mosaic)
 *
 * Positive-only prompts (no negatives — they reproduce the unwanted thing). The 4
 * candidates vary HOLE COUNT / SIZE, all scattered, all the same cold-yellow look.
 *
 * fal key in scripts/.env (FAL_AI_API_KEY) — never hardcode / commit.
 *
 * Usage: node scripts/style-test-tile-fumarole-holes.cjs [onlyLevel]
 *   onlyLevel optional (g1|g2|g3|g4) -> re-roll just that candidate (seed += 137)
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

// Shared positive-only fragments.
//   KEEP  — lock the recycled dark ashy base + its glowing ember cracks.
//   HOLES — the ONLY added feature: discrete round pits filled with DRY BRIGHT
//           YELLOW powdery sulfur crust, explicitly cold / not glowing / not lava.
//   LAYOUT — anti-central / anti-band / seamless language (reused so holes stay
//            evenly distributed); no haze/steam/plume mentioned at all.
//   TONE  — keep dark ashy base dominant, sulfur holes a scattered minority.
const KEEP = 'keep the dark ashy volcanic rock of the base and ALL of its existing bright glowing orange ember cracks exactly as they are, do not remove or dim the glowing ember lava cracks, the bright orange ember crack network must stay fully visible and glowing, the dark ashy rock and its glowing ember cracks still dominate most of the surface';
const HOLES = 'small discrete round holes and pits dug into the rock, each hole filled and rimmed with dry bright yellow powdery sulfur mineral crust, vivid dry chalky sulfur yellow, a cold dry powdery sulphur deposit lining each pit, the sulfur is cold dry crusty powder, never glowing, never molten, never wet, never orange lava, just bright dry yellow sulfur mineral crust in and around each little round hole';
const LAYOUT = 'the yellow sulfur holes scattered evenly across the ENTIRE surface as many small separate round pits, the middle just as detailed as the edges, no single central hole, no central feature, no dominant central pit, no big central blob, no concentration at the edges, no ring at the edges, no diagonal band, no diagonal line, seamless tileable edge to edge, uniform overall brightness, no light side, no dark side, no gradient';
const TONE = 'bright dry chalky yellow sulfur, distinctly yellow but a dry cold mineral crust not glowing, the dark ashy rock and its ember cracks stay dominant, the yellow sulfur holes are a scattered minority of the surface, dim grimy matte volcanic palette overall';

// 4 candidates. Distinct fixed 6-digit seeds (NO Math.random). Positive-only,
// additive kontext prompts — vary HOLE COUNT / SIZE; all scattered, all the same
// cold dry bright-yellow sulfur look, never molten, never central.
const CANDIDATES = {
  // g1 FEW small holes — base dominates most.
  g1: {
    seed: 712455, // attempt-3 seed (kept); orig 712044, reroll-2 712181
    prompt: `${KEEP}, add a light scatter of small clearly visible ${HOLES}, a modest number of small distinct yellow sulfur holes spread over the tile, ${LAYOUT}, ${TONE}`,
    cap: 'g1 — a light scatter of small yellow sulfur holes (most restrained)',
  },
  // g2 MODERATE scatter — likely sweet spot.
  g2: {
    seed: 823157,
    prompt: `${KEEP}, add a moderate even scatter of small ${HOLES}, several small yellow sulfur holes spread evenly over the tile, ${LAYOUT}, ${TONE}`,
    cap: 'g2 — moderate even scatter of small yellow sulfur holes (likely sweet spot)',
  },
  // g3 MORE holes, still small.
  g3: {
    seed: 934261,
    prompt: `${KEEP}, add more scattered ${HOLES}, many small yellow sulfur holes densely but evenly spread across the surface, the dark ashy rock still dominates between them, ${LAYOUT}, ${TONE}`,
    cap: 'g3 — more small yellow sulfur holes, evenly spread',
  },
  // g4 MORE + slightly LARGER holes.
  g4: {
    seed: 145378,
    prompt: `${KEEP}, add many ${HOLES}, lots of yellow sulfur holes some a bit larger than the others, more holes and slightly larger round pits but still scattered evenly with the dark ashy rock dominant between them, ${LAYOUT}, ${TONE}`,
    cap: 'g4 — more and slightly larger yellow sulfur holes, scattered',
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

// 2D brightness equalization (verbatim from style-test-tile-fumarole.cjs).
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

// Interior color / luma stats (alpha>8 only) — look-guard.
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

// Build an interlocking diamond mosaic from a half-tile (256x128) buffer.
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

// Load the finished .webp tile and convert to a PNG data URI for the kontext base.
async function baseDataUri(webpPath) {
  const png = await sharp(fs.readFileSync(webpPath)).removeAlpha().png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function genLevel(level, cfg) {
  const dataUri = await baseDataUri(BASE);
  const baseC = await colorStats(await sharp(fs.readFileSync(BASE)).png().toBuffer());
  console.log(`[kontext] ${level} base=ash_field_1 seed ${cfg.seed}`);
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
