/**
 * PARTIAL REWORK: obsidian_ridge slots 1 + 3 only (matte even-density rework).
 *
 * The old obsidian_ridge slots 1 + 3 were too glossy and had inconsistent shard
 * density. Rudi inspected the rework style-test (candidates r1-r4 in
 * assets/style-test/tiles/) and picked r3 — a large-shard, even-medium-density,
 * matte/dry look — for the new slot 1. Slots 0 + 2 of the integrated tile stay
 * EXACTLY as they are (NOT touched by this script).
 *
 * Composition Rudi approved for the 4 slots:
 *   slot 0 = current integrated obsidian_ridge_0  -> KEPT, never written here
 *   slot 1 = assets/style-test/tiles/obsidian_ridge_r3.png   (no flop)
 *   slot 2 = current integrated obsidian_ridge_2  -> KEPT, never written here
 *   slot 3 = obsidian_ridge_r3d (derived from r3) (.flop L<->R)
 *
 * The slot-3 derivative r3d is produced with FLUX PRO KONTEXT simple-edit
 * "create a slightly different pattern" (Rudi's proven method — NO negatives,
 * they reproduce the unwanted look; NOT a fresh text gen). The kontext result
 * gets a 2D brightness equalization (divide by a strongly blurred copy,
 * re-multiply by the mean — kills any global gradient / bright blob kontext
 * re-introduces, preserves local relief) then a re-applied diamond mask. Mirrors
 * equalize2D() from obsidian-ridge-derive-from-basis.cjs.
 *
 * Slot 3 is mirrored on the VERTICAL axis (sharp .flop = left<->right) to fight
 * visible repetition; never .flip (top<->bottom) — that breaks the upper-left
 * lighting convention. Slot 1 (like slot 0) is unflopped by convention.
 *
 * Per tile writes (matching the existing obsidian_ridge bestand exactly), ONLY
 * for slots 1 and 3:
 *   obsidian_ridge_<n>.webp                full 512x256   (webp q90 e4)
 *   obsidian_ridge_<n>@half.{webp,png}     256x128
 *   obsidian_ridge_<n>@quarter.{webp,png}  128x64
 *   obsidian_ridge_<n>@eighth.{webp,png}   64x32
 *
 * fal key in scripts/.env (FAL_AI_API_KEY) — never hardcode / commit.
 *
 * Usage:
 *   node scripts/obsidian-ridge-rework-build.cjs              full run (derive r3d + integrate slots 1,3)
 *   node scripts/obsidian-ridge-rework-build.cjs --derive-only       (re-)derive r3d only
 *   node scripts/obsidian-ridge-rework-build.cjs --integrate-only    rebuild slots 1,3 from existing r3 / r3d
 *   node scripts/obsidian-ridge-rework-build.cjs r3d         re-roll the derivative (seed +1000)
 *   node scripts/obsidian-ridge-rework-build.cjs r3d=123456  re-roll with explicit seed
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
const DST = path.join(ROOT, 'src', 'assets', 'tiles', 'obsidian_ridge');

const BASIS_R3 = path.join(SRC, 'obsidian_ridge_r3.png');

// EXACT prompt Rudi proved by hand. NO negatives, NO long description.
const PROMPT = 'create a slightly different pattern';

// One derivative from r3. Fixed seed (no Math.random).
const DERIVE = [
  { tag: 'r3d', basis: BASIS_R3, seed: 482907 },
];

// Only slots 1 and 3 are written. Slots 0 and 2 are left untouched on disk.
//   r3  -> slot 1 (no flop), r3d -> slot 3 (.flop L<->R)
const MAP = [
  { n: 1, src: () => BASIS_R3, flop: false, label: 'r3 (matte large-shard)' },
  { n: 3, src: () => path.join(SRC, 'obsidian_ridge_r3d.png'), flop: true, label: 'r3d derived(r3)' },
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
// obsidian-ridge-derive-from-basis.cjs equalize2D()): divide the image by a
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
// derivative that drifts much brighter than its basis can be flagged.
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
  const full = path.join(SRC, `obsidian_ridge_${tag}.png`);
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
    await writeWebp(buf, null, null, path.join(DST, `obsidian_ridge_${n}.webp`));
    for (const m of MIPS) {
      await writeWebp(buf, m.w, m.h, path.join(DST, `obsidian_ridge_${n}${m.suffix}.webp`));
      await writePng(buf, m.w, m.h, path.join(DST, `obsidian_ridge_${n}${m.suffix}.png`));
    }
    console.log(`[done] obsidian_ridge_${n} <- ${label}${flop ? ' (flop L<->R)' : ''}`);
  }
  console.log('integration complete (slots 1 + 3 only; slots 0 + 2 untouched)');
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
    console.log(`  ${cfg.tag}: basis[${fmtC(basisC)}] derived[${fmtC(c)}] dLuma ${dLuma.toFixed(1)}`);
    if (dLuma > 12) {
      console.warn(`  WARN ${cfg.tag} derived ${dLuma.toFixed(1)} luma brighter than basis — look may have drifted; consider re-roll.`);
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
