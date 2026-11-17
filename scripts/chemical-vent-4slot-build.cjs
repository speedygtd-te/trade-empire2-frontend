/**
 * PRODUCTION-PREP: chemical_vent 4-SLOT BUILD (working dir only — NO src/ integration).
 *
 * APPROVED hero (Rudi):
 *   Slot 0 = assets/style-test/tiles/chemical_vent_mild.png
 *     = the ORIGINAL "mild" hero: base corroded_plain_0, uniform x0.92 darken
 *       already baked in, 512x256, diamond-masked. Used AS-IS (no re-darken).
 *
 * The look MUST be preserved: muted heavily-desaturated dull sickly yellow-green /
 * olive corroded dark dirty ground with a few faint chemical pools + thin noxious
 * haze. Matte, dim upper-left light. NOT bright / neon.
 *
 * Slots 1-3 are DERIVED from the hero with FLUX PRO KONTEXT using the proven
 * simple-edit approach (POSITIVE only — no negatives; they reproduce the unwanted
 * thing), reinforced with a positive look-hold clause, a distinct fixed seed each.
 * Each kontext result gets a 2D brightness equalization (divide by a heavily-blurred
 * copy, re-multiply by the per-channel mean — flattens any global gradient / bright
 * blob while preserving local relief; verbatim approach from the obsidian_ridge /
 * salt_flat builds), then a re-diamond-mask.
 *
 * Slot map (NOT integrated — files written to the style-test workspace only):
 *   chemical_vent_0 = hero mild AS-IS            (no flop)
 *   chemical_vent_1 = kontext(hero) equalized    (no flop)
 *   chemical_vent_2 = kontext(hero) equalized    (.flop L<->R)
 *   chemical_vent_3 = kontext(hero) equalized    (.flop L<->R)
 * Slots 2 & 3 are mirrored on the VERTICAL axis (sharp .flop = left<->right) to
 * fight visible repetition — never .flip (top<->bottom); that breaks the
 * upper-left lighting convention.
 *
 * Outputs (assets/style-test/tiles/ ONLY):
 *   chemical_vent_0.png .. chemical_vent_3.png            512x256 diamond-masked
 *   chemical_vent_d1.png .. chemical_vent_d3.png          raw derived (pre-flop) — intermediate
 *   chemical_vent-4slot-mosaic.png                        review: 4 per-slot 3x3 + one mixed 4x5
 *
 * fal key in scripts/.env (FAL_AI_API_KEY / FAL_API_KEY) — never hardcode / commit.
 *
 * Usage:
 *   node scripts/chemical-vent-4slot-build.cjs                   full run
 *   node scripts/chemical-vent-4slot-build.cjs d1 d2            re-roll listed derivatives (seed +1000)
 *   node scripts/chemical-vent-4slot-build.cjs --mosaic-only    rebuild slots+mosaic from existing files
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
const HERO = path.join(SRC, 'chemical_vent_mild.png'); // slot 0, final, as-is
const BG = { r: 0x14, g: 0x17, b: 0x1c };

// POSITIVE only: the proven bare simple-edit + a positive look-hold clause so the
// muted sickly yellow-green corroded dark dirty look + darkness carry over.
const PROMPT =
  'create a slightly different pattern of cracks and chemical pools across the ground, ' +
  'keep the exact same muted heavily desaturated dull sickly yellow-green and olive ' +
  'corroded dirty ground, the same matte dim upper-left lighting, and the same darkness';

// Three derivatives from the single hero. Fixed seeds (no Math.random).
const DERIVE = [
  { tag: 'd1', seed: 421107 },
  { tag: 'd2', seed: 538213 },
  { tag: 'd3', seed: 662941 },
];

// Final slot map. hero -> 0, d1 -> 1, d2 -> 2 (flop), d3 -> 3 (flop).
const MAP = [
  { n: 0, src: () => HERO, flop: false, label: 'hero mild (as-is)' },
  { n: 1, src: () => path.join(SRC, 'chemical_vent_d1.png'), flop: false, label: 'kontext(hero) eq' },
  { n: 2, src: () => path.join(SRC, 'chemical_vent_d2.png'), flop: true, label: 'kontext(hero) eq' },
  { n: 3, src: () => path.join(SRC, 'chemical_vent_d3.png'), flop: true, label: 'kontext(hero) eq' },
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

// Target interior luma for the derivatives — set to the hero's mean luma at run
// start so all four slots read at the SAME brightness. Uniform multiply only.
let HERO_LUMA = null;

// 2D brightness equalization (verbatim approach from obsidian-ridge / salt-flat):
// divide by a heavily-blurred copy of itself (low-frequency illumination) and
// re-multiply by the per-channel mean — flattens any global gradient / bright blob
// while preserving local relief. Operates on the RGB rect of the 512x256 result.
async function equalize2D(rectBuf) {
  const img = sharp(rectBuf).removeAlpha();
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

// Interior mean color/luma AND top vs bottom luma delta (alpha>8 only). topBot is
// the vertical-gradient guard — should be small (< ~6) after equalization.
async function stats(maskedBuf) {
  const { data, info } = await sharp(maskedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let r = 0, g = 0, b = 0, n = 0, top = 0, tn = 0, bot = 0, bn = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    if (data[i + 3] < 8) continue;
    const L = luma(data[i], data[i + 1], data[i + 2]);
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    if (y < height / 2) { top += L; tn++; } else { bot += L; bn++; }
  }
  return { r: r / n, g: g / n, b: b / n, luma: luma(r / n, g / n, b / n), topBot: (top / tn) - (bot / bn) };
}
const fmtC = (c) => `R${c.r.toFixed(0)} G${c.g.toFixed(0)} B${c.b.toFixed(0)} luma${c.luma.toFixed(1)}`;

// kontext rect -> 512x256 fill -> 2D equalize (kill gradients) -> UNIFORM luma
// normalization to the hero mean (pure multiply, no gradient, so all slots read at
// the same brightness) -> diamond mask. Writes chemical_vent_<tag>.png (pre-flop).
async function postProcessDerive(rawBuf, tag) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha().png().toBuffer();
  let eq = await equalize2D(resized);
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  if (HERO_LUMA) {
    const pre = await stats(await sharp(eq).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer());
    let factor = HERO_LUMA / pre.luma;
    factor = factor < 0.6 ? 0.6 : factor > 1.4 ? 1.4 : factor; // clamp
    console.log(`  [norm] ${tag} luma ${pre.luma.toFixed(1)} -> x${factor.toFixed(3)} (target ${HERO_LUMA.toFixed(1)})`);
    eq = await sharp(eq).modulate({ brightness: factor }).png().toBuffer();
  }
  const masked = await sharp(eq).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const full = path.join(SRC, `chemical_vent_${tag}.png`);
  fs.writeFileSync(full, masked);
  console.log(`[save] ${full}`);
  return masked;
}

async function kontext(basisPng, cfg) {
  // Flatten diamond onto opaque bg so transparent corners don't bleed into the edit.
  const flat = await sharp(basisPng).flatten({ background: BG }).png().toBuffer();
  const dataUri = `data:image/png;base64,${flat.toString('base64')}`;
  console.log(`[kontext] ${cfg.tag} seed ${cfg.seed}`);
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

// --- Build final slot files (apply flop where mapped) ---------------------------
async function buildSlots() {
  const finals = [];
  for (const { n, src, flop, label } of MAP) {
    const srcPath = src();
    if (!fs.existsSync(srcPath)) throw new Error(`missing source for slot ${n}: ${srcPath}`);
    let buf = fs.readFileSync(srcPath);
    const meta = await sharp(buf).metadata();
    if (meta.width !== TILE_W || meta.height !== TILE_H) throw new Error(`${srcPath} not 512x256 (${meta.width}x${meta.height})`);
    if (flop) buf = await sharp(buf).flop().png().toBuffer();
    const outPath = path.join(SRC, `chemical_vent_${n}.png`);
    fs.writeFileSync(outPath, buf);
    const s = await stats(buf);
    console.log(`[slot] chemical_vent_${n} <- ${label}${flop ? ' (flop L<->R)' : ''}  ${fmtC(s)}  top-bot ${s.topBot.toFixed(1)}${Math.abs(s.topBot) > 6 ? ' <-- GRADIENT WARN' : ''}`);
    finals.push(buf);
  }
  console.log('slots built');
  return finals;
}

// --- Review mosaic (interlocking-iso; half-size unit tiles) ---------------------
const M_W = 256, M_H = 128;
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build one interlocking mosaic buffer. `pick(r,c)` returns a half-size tile buf.
async function mosaicBuf(rows, cols, pick) {
  const placements = [];
  let maxRight = 0, maxBottom = 0;
  for (let r = 0; r < rows; r++) {
    const odd = r % 2 === 1;
    for (let c = 0; c < cols; c++) {
      const x = c * M_W + (odd ? M_W / 2 : 0);
      const y = r * (M_H / 2);
      placements.push({ x, y, r, c });
      if (x + M_W > maxRight) maxRight = x + M_W;
      if (y + M_H > maxBottom) maxBottom = y + M_H;
    }
  }
  const comp = placements.map(p => ({ input: pick(p.r, p.c), left: p.x, top: p.y }));
  return sharp({ create: { width: maxRight, height: maxBottom, channels: 4, background: BGA } })
    .composite(comp).png().toBuffer();
}

async function buildReviewMosaic(finals) {
  const halves = await Promise.all(finals.map(b => sharp(b).resize(M_W, M_H, { fit: 'fill' }).png().toBuffer()));
  const panels = [];
  // one 3x3 per slot (pure repetition of that slot)
  for (let s = 0; s < 4; s++) panels.push({ label: `slot ${s}`, buf: await mosaicBuf(3, 3, () => halves[s]) });
  // one larger MIXED mosaic across all 4 slots (deterministic) — judge cross-slot tiling
  const rand = mulberry32(0xC4E7);
  panels.push({ label: 'mixed 0-3 (5x5)', buf: await mosaicBuf(5, 5, () => halves[Math.floor(rand() * 4)]) });

  const LBL = 22, PAD = 20, GAP = 24;
  const dims = await Promise.all(panels.map(p => sharp(p.buf).metadata()));
  // layout: 4 per-slot panels in a row on top, the big mixed panel below
  const topPanels = panels.slice(0, 4);
  const bigPanel = panels[4];
  const topW = Math.max(...dims.slice(0, 4).map(d => d.width));
  const topH = Math.max(...dims.slice(0, 4).map(d => d.height));
  const bigW = dims[4].width, bigH = dims[4].height;
  const rowW = 4 * topW + 3 * GAP;
  const canvasW = PAD * 2 + Math.max(rowW, bigW);
  const canvasH = PAD * 3 + (topH + LBL) + (bigH + LBL);
  const comp = [];
  for (let i = 0; i < 4; i++) {
    const cx = PAD + i * (topW + GAP);
    const label = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${topW}" height="${LBL}"><text x="4" y="16" font-family="monospace" font-size="15" fill="#c9d1d9">${topPanels[i].label}</text></svg>`
    );
    comp.push({ input: label, left: cx, top: PAD });
    comp.push({ input: topPanels[i].buf, left: cx, top: PAD + LBL });
  }
  const by = PAD + LBL + topH + PAD;
  const bLabel = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${bigW}" height="${LBL}"><text x="4" y="16" font-family="monospace" font-size="15" fill="#c9d1d9">${bigPanel.label}</text></svg>`
  );
  comp.push({ input: bLabel, left: PAD, top: by });
  comp.push({ input: bigPanel.buf, left: PAD, top: by + LBL });

  const out = await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: BGA } })
    .composite(comp).png().toBuffer();
  const p = path.join(SRC, 'chemical_vent-4slot-mosaic.png');
  fs.writeFileSync(p, out);
  console.log(`[mosaic] ${p}`);
}

async function deriveAll(reroll) {
  if (!FAL_API_KEY) { console.error('No fal key (FAL_AI_API_KEY in scripts/.env)'); process.exit(1); }
  const basisPng = await sharp(fs.readFileSync(HERO)).png().toBuffer();
  const basisC = await stats(basisPng);
  HERO_LUMA = basisC.luma;
  console.log(`[hero] chemical_vent_mild ${fmtC(basisC)}  top-bot ${basisC.topBot.toFixed(1)}`);
  for (const cfg of DERIVE) {
    if (reroll.length && !reroll.includes(cfg.tag)) continue;
    const seed = reroll.includes(cfg.tag) ? cfg.seed + 1000 : cfg.seed;
    const masked = await kontext(basisPng, { ...cfg, seed });
    const c = await stats(masked);
    console.log(`  ${cfg.tag}: derived(eq) [${fmtC(c)}] top-bot ${c.topBot.toFixed(1)}${Math.abs(c.topBot) > 6 ? ' <-- GRADIENT WARN' : ''}`);
  }
}

(async () => {
  fs.mkdirSync(SRC, { recursive: true });
  const args = process.argv.slice(2);
  const mosaicOnly = args.includes('--mosaic-only');
  const reroll = args.filter(a => !a.startsWith('--'));
  if (!mosaicOnly) await deriveAll(reroll);
  const finals = await buildSlots();
  await buildReviewMosaic(finals);
  console.log('all done');
})();
