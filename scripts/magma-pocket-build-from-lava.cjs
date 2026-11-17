/**
 * PRODUCTION: magma_pocket 4-slot build derived from the finished lava_flow slots.
 *
 * Rudi's approved approach (candidate m3 picked from the style-test):
 *   magma_pocket = the finished lava_flow tile (cooled black/charcoal matte basalt
 *   crust + subdued DEEP-EMBER crack network) WITH added small, BRIGHTER, scattered
 *   molten-lava openings (magma pockets/vents). m3 = ~5-6 small/medium openings
 *   evenly scattered (best magma-pocket identity, tiles cleanly, no central pool).
 *
 * The m3 candidate is the kontext-edit of lava_flow_l2 (slot 0 of lava_flow). To
 * keep all 4 magma_pocket slots consistent (same crust + same scattered bright
 * openings) we apply the SAME m3 kontext prompt to EACH of the other 3 finished
 * lava_flow slot sources:
 *   Slot 0 = magma_pocket_m3.png         (ALREADY generated = kontext-edit of lava_flow_l2)  no flop
 *   Slot 1 = kontext-edit of lava_flow_d1 (lava slot-1 source)                                no flop
 *   Slot 2 = kontext-edit of lava_flow_d2 (lava slot-2 source)                                .flop L<->R
 *   Slot 3 = kontext-edit of lava_flow_d3 (lava slot-3 source)                                .flop L<->R
 * Slots 2 & 3 are mirrored on the VERTICAL axis (sharp .flop = left<->right) to
 * fight visible repetition; never .flip (top<->bottom) — that breaks the
 * upper-left lighting convention. (Slot 0 unflopped: m3 is already the right side.)
 *
 * The kontext PROMPT is the EXACT m3 prompt from
 * scripts/style-test-tile-magma-pocket.cjs (positive-only, additive). Three NEW
 * fixed 6-digit seeds (different from m3's 648319) for the slot-1/2/3 derivatives.
 *
 * Each kontext result gets a 2D brightness equalization (divide by a strongly
 * blurred copy, re-multiply by the mean — kills any global gradient / bright blob
 * kontext re-introduces, preserves local relief) then a re-applied diamond mask.
 * Pipeline verbatim from scripts/obsidian-ridge-derive-from-basis.cjs.
 *
 * Per tile writes (matching the existing lava_flow / obsidian_ridge bestand exactly):
 *   magma_pocket_<n>.webp                full 512x256   (webp q90 e4)
 *   magma_pocket_<n>@half.{webp,png}     256x128
 *   magma_pocket_<n>@quarter.{webp,png}  128x64
 *   magma_pocket_<n>@eighth.{webp,png}   64x32
 *
 * fal key in scripts/.env (FAL_AI_API_KEY) — never hardcode / commit.
 *
 * Usage:
 *   node scripts/magma-pocket-build-from-lava.cjs              full run (derive + integrate)
 *   node scripts/magma-pocket-build-from-lava.cjs --derive-only [m1 m2 m3]   re-roll a derivative (seed +1000)
 *   node scripts/magma-pocket-build-from-lava.cjs --integrate-only           rebuild src from existing derivatives
 *   re-roll with a fresh seed: pass tag=SEED e.g.  --derive-only m2=771122
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
const DST = path.join(ROOT, 'src', 'assets', 'tiles', 'magma_pocket');

// lava_flow slot sources (the finished lava_flow build sources).
const LAVA_D1 = path.join(SRC, 'lava_flow_d1.png'); // lava slot-1 source
const LAVA_D2 = path.join(SRC, 'lava_flow_d2.png'); // lava slot-2 source
const LAVA_D3 = path.join(SRC, 'lava_flow_d3.png'); // lava slot-3 source

// Slot 0 = the already-generated m3 candidate (kontext-edit of lava_flow_l2).
const M3 = path.join(SRC, 'magma_pocket_m3.png');
const LAVA_L2 = path.join(SRC, 'lava_flow_l2.png'); // lava slot-0 (hero) source — network-rich

// EXACT m3 prompt (verbatim from scripts/style-test-tile-magma-pocket.cjs).
const KEEP = 'keep the dark cooled black charcoal basalt rock and its subdued deep ember glowing cracks exactly as the base';
const SCATTER = 'scattered evenly across the whole surface, several separate small ones, no single big central pool, no central feature';
const PROMPT = `${KEEP}, add a few slightly larger round openings of brighter hot glowing molten orange lava, fewer but each a bit larger, still small relative to the tile, ${SCATTER}`;

// PRESERVE prompt for the slot-2/3 rework: the earlier slot-2/3 derivatives DARKENED
// the base, losing the deep-ember crack network that slots 0/1 have. This positive-only
// prompt explicitly tells kontext to KEEP the bright ember network + basalt and ADD the
// openings ON TOP, not replace/darken it. Used only for the s2b/s3b rework derivatives.
const PROMPT_PRESERVE = 'keep all the bright deep-ember glowing lava cracks and the dark basalt exactly as they are, do not darken the surface, then add five or six clearly visible separate round pools of brighter hot glowing molten orange lava sitting on the rock between the cracks, each a distinct round bright opening, scattered evenly across the whole tile, no single big central pool';

// Slot derivatives. NEW fixed 6-digit seeds (no Math.random). Tags s1/s2/s3 are the
// ORIGINAL build (s1 -> slot 1 is still in use). The slot-2/3 REWORK uses s2b/s3b on the
// network-rich BRIGHT lava bases (d1 for slot 2, l2 for slot 3) + the PRESERVE prompt, so
// they keep the ember network like slots 0/1. Fresh seeds distinct from slots 0/1.
const DERIVE = [
  { tag: 's1', basis: LAVA_D1, seed: 448291, prompt: PROMPT }, // -> magma slot 1 (kept)
  // --- slot-2/3 rework (Rudi): network-rich bright bases + preserve prompt ---
  // slot 2: lava_flow_d1 (the slot-1 base) resisted openings (no openings across seeds, or a
  // hub-and-spoke look inconsistent with 0/1). Switched to the network-rich lava_flow_l2 base
  // (which gave a clean s3b) with its own fresh seed so slots 2 & 3 don't duplicate.
  { tag: 's2b', basis: LAVA_L2, seed: 514263, prompt: PROMPT_PRESERVE }, // -> magma slot 2 (l2, flop)
  { tag: 's3b', basis: LAVA_L2, seed: 662077, prompt: PROMPT_PRESERVE }, // -> magma slot 3 (l2, flop) — winning seed
];

// Final slot map. m3 -> 0 (no flop), s1 -> 1 (no flop), s2b -> 2 (flop), s3b -> 3 (flop).
const MAP = [
  { n: 0, src: () => M3, flop: false, label: 'm3 (kontext-edit of lava_flow_l2)' },
  { n: 1, src: () => path.join(SRC, 'magma_pocket_s1.png'), flop: false, label: 's1 derived(lava_flow_d1)' },
  { n: 2, src: () => path.join(SRC, 'magma_pocket_s2b.png'), flop: true, label: 's2b derived(lava_flow_l2, preserve prompt)' },
  { n: 3, src: () => path.join(SRC, 'magma_pocket_s3b.png'), flop: true, label: 's3b derived(lava_flow_l2, preserve prompt)' },
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

// Interior color / luma stats (alpha>8 only) — look-guard so a derivative that
// drifts much brighter than its lava base can be flagged.
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
  const full = path.join(SRC, `magma_pocket_${tag}.png`);
  fs.writeFileSync(full, masked);
  console.log(`[save] ${full}`);
  return masked;
}

async function kontext(basisPng, cfg) {
  const dataUri = `data:image/png;base64,${basisPng.toString('base64')}`;
  const prompt = cfg.prompt || PROMPT;
  console.log(`[kontext] ${cfg.tag} seed ${cfg.seed} prompt="${prompt}"`);
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/kontext', {
    image_url: dataUri,
    prompt,
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
    await writeWebp(buf, null, null, path.join(DST, `magma_pocket_${n}.webp`));
    for (const m of MIPS) {
      await writeWebp(buf, m.w, m.h, path.join(DST, `magma_pocket_${n}${m.suffix}.webp`));
      await writePng(buf, m.w, m.h, path.join(DST, `magma_pocket_${n}${m.suffix}.png`));
    }
    console.log(`[done] magma_pocket_${n} <- ${label}${flop ? ' (flop L<->R)' : ''}`);
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
    console.log(`  ${cfg.tag}: lavaBase[${fmtC(basisC)}] magma[${fmtC(c)}] dLuma ${dLuma.toFixed(1)}`);
    if (dLuma > 12) {
      console.warn(`  WARN ${cfg.tag} magma ${dLuma.toFixed(1)} luma brighter than lava base — may be too bright / blown-out; consider re-roll.`);
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
