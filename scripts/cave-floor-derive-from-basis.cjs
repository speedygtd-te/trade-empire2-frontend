/**
 * PRODUCTION: cave_floor 4-slot build from the two APPROVED dark-matte heroes.
 *
 * Heroes (Rudi's pick from the e-series style-test, dark / matte / deep look):
 *   Hero 1 (main, max depth)  = assets/style-test/tiles/cave_floor_e2.png
 *   Hero 2 (clean matte)      = assets/style-test/tiles/cave_floor_e3.png
 * Both are 512x256 diamond-masked RGBA PNG (already brightness-equalized +
 * iso-squished by scripts/style-test-tile-cave-floor-darkmatte.cjs).
 *
 * From these TWO heroes we DERIVE the missing 2 slots with FLUX PRO KONTEXT
 * simple-edit "create a slightly different pattern" (Rudi's proven method —
 * NO negatives, they reproduce the unwanted look; NOT a fresh text gen). One
 * derived variant per hero, so each kept hero stays the family anchor for its
 * derivative:
 *   cave_floor_d2 = kontext-edit of e2  (keeps the e2 deep-relief family)
 *   cave_floor_d3 = kontext-edit of e3  (keeps the e3 clean-matte family)
 *
 * Each kontext result gets a 2D brightness equalization (divide by a strongly
 * blurred copy, re-multiply by the mean — kills any global gradient / bright
 * blob kontext re-introduces, preserves local relief) then a re-applied diamond
 * mask. Mirrors the equalize() from style-test-tile-cave-floor-darkmatte.cjs.
 *
 * Final 4-slot layout written to src/assets/tiles/cave_floor/ (OVERWRITES the
 * old lighter cave_floor_0..3):
 *   cave_floor_0 = e2          (main hero,      no flop)
 *   cave_floor_1 = d2          (derived from e2, no flop)
 *   cave_floor_2 = e3          (clean hero,     .flop L<->R)
 *   cave_floor_3 = d3          (derived from e3, .flop L<->R)
 * Slots 2 & 3 are mirrored on the VERTICAL axis (sharp .flop = left<->right) to
 * fight visible repetition; never .flip (top<->bottom) — that breaks the
 * upper-left lighting convention.
 *
 * Per tile writes (matching the existing cave_floor / caldera bestand exactly):
 *   cave_floor_<n>.webp                full 512x256   (webp q90 e4)
 *   cave_floor_<n>@half.{webp,png}     256x128
 *   cave_floor_<n>@quarter.{webp,png}  128x64
 *   cave_floor_<n>@eighth.{webp,png}   64x32
 *
 * fal key in scripts/.env (FAL_AI_API_KEY) — never hardcode / commit.
 *
 * Usage:
 *   node scripts/cave-floor-derive-from-basis.cjs              full run (derive + integrate)
 *   node scripts/cave-floor-derive-from-basis.cjs --derive-only [d2 d3]   re-roll a derivative (seed +1000)
 *   node scripts/cave-floor-derive-from-basis.cjs --integrate-only        rebuild src from existing derivatives
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
const https = require('https');
const http = require('http');
const sharp = require('sharp');

const TILE_W = 512, TILE_H = 256;
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'style-test', 'tiles');
const DST = path.join(ROOT, 'src', 'assets', 'tiles', 'cave_floor');

const HERO_E2 = path.join(SRC, 'cave_floor_e2.png');
const HERO_E3 = path.join(SRC, 'cave_floor_e3.png');

// EXACT prompt Rudi proved by hand. NO negatives, NO long description.
const PROMPT = 'create a slightly different pattern';

// One derivative per hero. Fixed seeds (no Math.random).
const DERIVE = [
  { tag: 'd2', basis: HERO_E2, seed: 615202 },
  { tag: 'd3', basis: HERO_E3, seed: 731303 },
];

// Final slot map. e2 -> 0, d2 -> 1, e3 -> 2 (flop), d3 -> 3 (flop).
const MAP = [
  { n: 0, src: () => HERO_E2, flop: false, label: 'e2 hero' },
  { n: 1, src: () => path.join(SRC, 'cave_floor_d2.png'), flop: false, label: 'd2 derived(e2)' },
  { n: 2, src: () => HERO_E3, flop: true, label: 'e3 hero' },
  { n: 3, src: () => path.join(SRC, 'cave_floor_d3.png'), flop: true, label: 'd3 derived(e3)' },
];

const MIPS = [
  { suffix: '@half', w: 256, h: 128 },
  { suffix: '@quarter', w: 128, h: 64 },
  { suffix: '@eighth', w: 64, h: 32 },
];
const WEBP = { quality: 90, effort: 4, smartSubsample: true };

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

// 2D brightness equalization (verbatim approach from
// style-test-tile-cave-floor-darkmatte.cjs equalize()): divide the image by a
// heavily-blurred copy of itself (low-frequency illumination) and re-multiply by
// the per-channel mean, flattening any global gradient / bright blob while
// preserving local relief. Operates on the RGB interior of the 512x256 result.
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

// Interior color / luma stats (alpha>8 only) — used as a look-guard so a
// derivative that drifts much brighter than its hero can be flagged.
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

async function postProcessDerive(rawBuf, tag) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha().png().toBuffer();
  const eq = await equalize2D(resized);
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(eq).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const full = path.join(SRC, `cave_floor_${tag}.png`);
  fs.writeFileSync(full, masked);
  console.log(`[save] ${full}`);
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
  return postProcessDerive(out, cfg.tag);
}

async function writeWebp(buf, w, h, out) {
  const img = w ? sharp(buf).resize(w, h, { fit: 'fill' }) : sharp(buf);
  await img.webp(WEBP).toFile(out);
}
async function writePng(buf, w, h, out) {
  await sharp(buf).resize(w, h, { fit: 'fill' }).png().toFile(out);
}

async function integrate() {
  fs.mkdirSync(DST, { recursive: true });
  for (const { n, src, flop, label } of MAP) {
    const srcPath = src();
    if (!fs.existsSync(srcPath)) throw new Error(`missing source for slot ${n}: ${srcPath}`);
    let buf = fs.readFileSync(srcPath);
    const meta = await sharp(buf).metadata();
    if (meta.width !== TILE_W || meta.height !== TILE_H) throw new Error(`${srcPath} not 512x256 (${meta.width}x${meta.height})`);
    if (flop) buf = await sharp(buf).flop().png().toBuffer();
    await writeWebp(buf, null, null, path.join(DST, `cave_floor_${n}.webp`));
    for (const m of MIPS) {
      await writeWebp(buf, m.w, m.h, path.join(DST, `cave_floor_${n}${m.suffix}.webp`));
      await writePng(buf, m.w, m.h, path.join(DST, `cave_floor_${n}${m.suffix}.png`));
    }
    console.log(`[done] cave_floor_${n} <- ${label}${flop ? ' (flop L<->R)' : ''}`);
  }
  console.log('integration complete');
}

async function deriveAll(reroll, seedOverride) {
  if (!FAL_API_KEY) { console.error('No fal key (FAL_AI_API_KEY in scripts/.env)'); process.exit(1); }
  for (const cfg of DERIVE) {
    if (reroll.length && !reroll.includes(cfg.tag)) continue;
    const basisPng = await sharp(fs.readFileSync(cfg.basis)).png().toBuffer();
    const basisC = await colorStats(basisPng);
    const seed = seedOverride[cfg.tag] || (reroll.includes(cfg.tag) ? cfg.seed + 1000 : cfg.seed);
    const masked = await kontext(basisPng, { ...cfg, seed });
    const c = await colorStats(masked);
    const dLuma = c.luma - basisC.luma;
    console.log(`  ${cfg.tag}: hero[${fmtC(basisC)}] derived[${fmtC(c)}] dLuma ${dLuma.toFixed(1)}`);
    if (dLuma > 12) {
      console.warn(`  WARN ${cfg.tag} derived ${dLuma.toFixed(1)} luma brighter than hero — look may have drifted; consider re-roll.`);
    }
  }
}

(async () => {
  const args = process.argv.slice(2);
  const integrateOnly = args.includes('--integrate-only');
  const deriveOnly = args.includes('--derive-only');
  const tagArgs = args.filter(a => !a.startsWith('--'));
  const reroll = tagArgs.map(a => a.split('=')[0]);
  const seedOverride = {};
  for (const a of tagArgs) { const [t, s] = a.split('='); if (s) seedOverride[t] = parseInt(s, 10); }

  if (!integrateOnly) await deriveAll(reroll, seedOverride);
  if (!deriveOnly) await integrate();
  console.log('all done');
})();
