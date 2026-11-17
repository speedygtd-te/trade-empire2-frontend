/**
 * PRODUCTION-PREP: toxic_marsh 4-SLOT BUILD (working dir only — NO src/ integration).
 *
 * APPROVED hero (Rudi):
 *   Slot 0 = assets/style-test/tiles/toxic_marsh_mild.png
 *     = the MILD swampy+bubbles hero: base corroded_plain_1, boggy muddy hummocks in
 *       sickly green-brown sludge with clusters of small round gas bubbles / froth
 *       rings. 512x256, diamond-masked. Used AS-IS (no re-darken, no flop).
 *
 * The look MUST be preserved: muted heavily-desaturated sickly green-brown boggy swamp,
 * stagnant sludge surface with muddy hummocks / scum mats and clusters of small round
 * gas bubbles + froth rings. Matte, dim upper-left light. NOT bright / neon.
 *
 * Slots 1-3 are DERIVED from the hero with FLUX PRO KONTEXT using the proven simple-edit
 * approach (POSITIVE only — no negatives; they reproduce the unwanted thing). Per Rudi:
 * REPOSITION the bubbles differently in each variant — move the clusters of small round
 * gas bubbles / froth rings to different spots on the sludge, and vary the muddy-hummock
 * / scum-mat layout, while keeping the EXACT same muted desaturated sickly green-brown
 * swampy look, same matte dim upper-left lighting, same darkness. Distinct fixed seed each.
 * Each kontext result gets a 2D brightness equalization (divide by a heavily-blurred
 * copy, re-multiply by the per-channel mean — flattens any global gradient / bright blob
 * while preserving local relief; verbatim from chemical_vent / obsidian_ridge / salt_flat),
 * a re-diamond-mask, then a PER-CHANNEL (R/G/B) colour-match to the hero's interior
 * means. The kontext edit drifted the derivatives toward YELLOW (worst lower-right);
 * matching each R/G/B mean to the hero (a white-balance channel-gain) removes that cast
 * and pins interior luma to the hero (so it replaces the old luma-only multiply).
 *
 * Slot map (NOT integrated — files written to the style-test workspace only):
 *   toxic_marsh_0 = hero mild AS-IS            (no flop)
 *   toxic_marsh_1 = kontext(hero) equalized    (no flop)
 *   toxic_marsh_2 = kontext(hero) equalized    (.flop L<->R)
 *   toxic_marsh_3 = kontext(hero) equalized    (.flop L<->R)
 * Slots 2 & 3 are mirrored on the VERTICAL axis (sharp .flop = left<->right) to fight
 * visible repetition — never .flip (top<->bottom); that breaks the upper-left lighting.
 *
 * Outputs (assets/style-test/tiles/ ONLY):
 *   toxic_marsh_0.png .. toxic_marsh_3.png            512x256 diamond-masked
 *   toxic_marsh_d1.png .. toxic_marsh_d3.png          raw derived (pre-flop) — intermediate
 *   toxic_marsh-4slot-mosaic.png                      review: 4 per-slot 3x3 + one mixed 5x5
 *   _toxic_marsh_slots_2x2.png                        review: 2x2 of the four full slots
 *
 * fal key in scripts/.env (FAL_AI_API_KEY / FAL_API_KEY) — never hardcode / commit.
 *
 * Usage:
 *   node scripts/toxic-marsh-4slot-build.cjs                   full run
 *   node scripts/toxic-marsh-4slot-build.cjs d1 d2            re-roll listed derivatives (seed +1000)
 *   node scripts/toxic-marsh-4slot-build.cjs --recolor        colour-match existing d1..d3 to hero (no kontext), rebuild slots+mosaics
 *   node scripts/toxic-marsh-4slot-build.cjs --mosaic-only    rebuild slots+mosaic from existing files
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
const HERO = path.join(SRC, 'toxic_marsh_mild.png'); // slot 0, final, as-is
const BG = { r: 0x14, g: 0x17, b: 0x1c };

// POSITIVE only: reposition the bubbles + rearrange hummocks/scum, with a positive
// look-hold clause so the muted sickly green-brown swampy look + darkness carry over.
const PROMPT =
  'reposition the clusters of small round gas bubbles and froth rings to different ' +
  'places on the stagnant sludge surface, rearrange the muddy hummocks and scum mats, ' +
  'keep the exact same muted heavily desaturated sickly green-brown boggy swamp, ' +
  'same matte dim upper-left lighting, same darkness';

// Three derivatives from the single hero. Fixed seeds (no Math.random).
const DERIVE = [
  { tag: 'd1', seed: 314207 },
  { tag: 'd2', seed: 471933 },
  { tag: 'd3', seed: 605519 },
];

// Final slot map. hero -> 0, d1 -> 1, d2 -> 2 (flop), d3 -> 3 (flop).
const MAP = [
  { n: 0, src: () => HERO, flop: false, label: 'hero mild (as-is)' },
  { n: 1, src: () => path.join(SRC, 'toxic_marsh_d1.png'), flop: false, label: 'kontext(hero) eq' },
  { n: 2, src: () => path.join(SRC, 'toxic_marsh_d2.png'), flop: true, label: 'kontext(hero) eq' },
  { n: 3, src: () => path.join(SRC, 'toxic_marsh_d3.png'), flop: true, label: 'kontext(hero) eq' },
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
// Hero interior per-channel (R/G/B) means — the colour-match target for the
// derivatives (kills the yellow cast; see channelMatchToHero).
let HERO_C = null;

// EQ_MODE selects the brightness-flattening approach applied to each derivative
// (operates on the full opaque 512x256 pre-mask rect):
//   'none'   — approach 1: NO divide-by-blur. Keep only the per-channel white-balance
//              (channelMatchToHero) + luma pin. The old equalize2D (plain Gaussian on
//              the pre-mask square) produced a bright YELLOW RIM along the diamond edge:
//              the square's corners are the dark BG (0x14..) baked in by the kontext
//              flatten, and the 64px blur drags those dark corners into the low-freq
//              denominator near the diamond boundary -> tiny denominator -> the edge
//              pixels over-brighten. Slot 0 (hero) skips equalization, so its edges are
//              clean; the rim is the whole visible defect. Dropping it makes 1-3 edges
//              fall off exactly like slot 0.
//   'masked' — approach 2a fallback: MASK-NORMALIZED low-freq. Blur (img*diamond) and
//              blur (diamond), divide -> a low-freq estimate that excludes the dark
//              corners entirely, so the denominator never collapses at the boundary.
//              Use only if 'none' leaves an unacceptable global gradient / bright blob.
const EQ_MODE = 'none';

// Mask-normalized 2D brightness equalization (approach 2a). Excludes the dark pre-mask
// corners from the low-frequency illumination estimate so it cannot over-brighten the
// diamond edge. Operates on the RGB rect of the 512x256 result.
async function equalize2DMasked(rectBuf) {
  const img = sharp(rectBuf).removeAlpha();
  const { width, height } = await img.metadata();
  const w = width || TILE_W, h = height || TILE_H;
  const base = await img.raw().toBuffer(); // RGB
  const px = w * h;
  // diamond mask 0..1 (single channel), matches the final diamond cut
  const maskRaw = await sharp(DIAMOND_MASK_SVG).resize(w, h).greyscale().raw().toBuffer();
  const blurRadius = Math.round(Math.min(w, h) / 4);
  // premultiplied image (per channel) and the mask itself, both blurred
  const premul = Buffer.alloc(base.length);
  for (let p = 0; p < px; p++) {
    const m = maskRaw[p] / 255;
    premul[p * 3] = Math.round(base[p * 3] * m);
    premul[p * 3 + 1] = Math.round(base[p * 3 + 1] * m);
    premul[p * 3 + 2] = Math.round(base[p * 3 + 2] * m);
  }
  const blurPre = await sharp(premul, { raw: { width: w, height: h, channels: 3 } }).blur(blurRadius).raw().toBuffer();
  const blurMask = await sharp(maskRaw, { raw: { width: w, height: h, channels: 1 } }).blur(blurRadius).raw().toBuffer();
  // masked per-channel mean (interior only)
  const mean = [0, 0, 0]; let mn = 0;
  for (let p = 0; p < px; p++) {
    if (maskRaw[p] < 8) continue;
    mean[0] += base[p * 3]; mean[1] += base[p * 3 + 1]; mean[2] += base[p * 3 + 2]; mn++;
  }
  mean[0] /= mn; mean[1] /= mn; mean[2] /= mn;
  const out = Buffer.alloc(base.length);
  for (let p = 0; p < px; p++) {
    const bm = blurMask[p];
    for (let c = 0; c < 3; c++) {
      const i = p * 3 + c;
      // normalized low-freq = blurred(img*mask) / blurred(mask); fall back to base where
      // the mask contribution is negligible (corners) so the denominator never collapses.
      const lf = bm > 8 ? (blurPre[i] / (bm / 255)) : base[i];
      const v = lf > 0.5 ? (base[i] / lf) * mean[c] : base[i];
      out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
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

// PER-CHANNEL (R/G/B) mean normalization of a diamond-masked derivative to the hero's
// per-channel interior means. This is a white-balance / channel-gain op: it removes the
// overall colour cast (the YELLOW shift the kontext edit introduced) while equalize2D
// above has already flattened any low-frequency per-channel spatial gradient (so the
// lower-right corner — where the yellow was worst — is flattened toward the same neutral
// mean, then pulled onto the hero's green-brown by this gain). Matching all three channel
// means to the hero also pins interior luma to the hero (luma is a fixed linear combo of
// the means), so this REPLACES the old luma-only multiply and keeps luma ~78.
async function channelMatchToHero(maskedBuf, tag) {
  if (!HERO_C) return maskedBuf;
  const pre = await stats(maskedBuf);
  const clamp = (f) => (f < 0.7 ? 0.7 : f > 1.4 ? 1.4 : f);
  const fr = clamp(HERO_C.r / pre.r), fg = clamp(HERO_C.g / pre.g), fb = clamp(HERO_C.b / pre.b);
  const { data, info } = await sharp(maskedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] === 0) continue;
    data[i] = Math.min(255, Math.round(data[i] * fr));
    data[i + 1] = Math.min(255, Math.round(data[i + 1] * fg));
    data[i + 2] = Math.min(255, Math.round(data[i + 2] * fb));
  }
  const out = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
  const post = await stats(out);
  console.log(`  [colour] ${tag} gain R${fr.toFixed(3)} G${fg.toFixed(3)} B${fb.toFixed(3)}  ` +
    `${fmtC(pre)} -> ${fmtC(post)} (hero R${HERO_C.r.toFixed(0)} G${HERO_C.g.toFixed(0)} B${HERO_C.b.toFixed(0)})`);
  return out;
}

// kontext rect -> 512x256 fill -> (EQ_MODE flatten) -> diamond mask -> PER-CHANNEL
// colour-match to the hero (kills the yellow cast + pins luma to the hero).
// Writes toxic_marsh_<tag>.png (pre-flop). rawKontext is the cached raw download so
// the whole post-process can be re-run offline (--reprocess) without a FAL call.
async function postProcessDerive(rawBuf, tag) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha().png().toBuffer();
  let flat = resized;
  if (EQ_MODE === 'masked') flat = await equalize2DMasked(resized);
  // EQ_MODE === 'none': no divide-by-blur — this is what removes the yellow edge rim.
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(flat).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const corrected = await channelMatchToHero(masked, tag);
  const full = path.join(SRC, `toxic_marsh_${tag}.png`);
  fs.writeFileSync(full, corrected);
  console.log(`[save] ${full} (eq=${EQ_MODE})`);
  return corrected;
}

const krawPath = (tag) => path.join(SRC, `toxic_marsh_${tag}_kraw.png`);

// Re-run the post-process for all derivatives from their cached raw kontext downloads —
// NO FAL call. Lets us iterate EQ_MODE / colour correction offline.
async function reprocessAll() {
  await loadHero();
  for (const cfg of DERIVE) {
    const kf = krawPath(cfg.tag);
    if (!fs.existsSync(kf)) throw new Error('missing raw kontext cache for --reprocess: ' + kf);
    const masked = await postProcessDerive(fs.readFileSync(kf), cfg.tag);
    const c = await stats(masked);
    console.log(`  ${cfg.tag}: reprocessed [${fmtC(c)}] top-bot ${c.topBot.toFixed(1)}${Math.abs(c.topBot) > 6 ? ' <-- GRADIENT WARN' : ''}`);
  }
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
  fs.writeFileSync(krawPath(cfg.tag), out); // cache raw so post-process can re-run offline
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
    const outPath = path.join(SRC, `toxic_marsh_${n}.png`);
    fs.writeFileSync(outPath, buf);
    const s = await stats(buf);
    console.log(`[slot] toxic_marsh_${n} <- ${label}${flop ? ' (flop L<->R)' : ''}  ${fmtC(s)}  top-bot ${s.topBot.toFixed(1)}${Math.abs(s.topBot) > 6 ? ' <-- GRADIENT WARN' : ''}`);
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
  const p = path.join(SRC, 'toxic_marsh-4slot-mosaic.png');
  fs.writeFileSync(p, out);
  console.log(`[mosaic] ${p}`);
}

// --- 2x2 full-slot comparison (matches _chemical_vent_slots_2x2.png layout) ------
async function build2x2(finals) {
  const LBL = 22, PAD = 16, GAP = 16;
  const cellW = TILE_W, cellH = TILE_H;
  const canvasW = PAD * 2 + cellW * 2 + GAP;
  const canvasH = PAD * 2 + (LBL + cellH) * 2 + GAP;
  const comp = [];
  for (let n = 0; n < 4; n++) {
    const col = n % 2, row = Math.floor(n / 2);
    const cx = PAD + col * (cellW + GAP);
    const cy = PAD + row * (LBL + cellH + GAP);
    const label = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${LBL}"><text x="4" y="16" font-family="monospace" font-size="15" fill="#c9d1d9">toxic_marsh_${n}.png</text></svg>`
    );
    comp.push({ input: label, left: cx, top: cy });
    comp.push({ input: finals[n], left: cx, top: cy + LBL });
  }
  const out = await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: BGA } })
    .composite(comp).png().toBuffer();
  const p = path.join(SRC, '_toxic_marsh_slots_2x2.png');
  fs.writeFileSync(p, out);
  console.log(`[2x2] ${p}`);
}

async function loadHero() {
  const basisPng = await sharp(fs.readFileSync(HERO)).png().toBuffer();
  const basisC = await stats(basisPng);
  HERO_LUMA = basisC.luma;
  HERO_C = { r: basisC.r, g: basisC.g, b: basisC.b, luma: basisC.luma };
  console.log(`[hero] toxic_marsh_mild ${fmtC(basisC)}  top-bot ${basisC.topBot.toFixed(1)}`);
  return basisPng;
}

// Re-apply ONLY the per-channel colour-match to the already-generated derivative
// intermediates (toxic_marsh_d1..d3.png) — no kontext re-call. Fixes the yellow cast
// on existing derivatives while preserving their approved composition + luma.
async function recolorExisting() {
  await loadHero();
  for (const cfg of DERIVE) {
    const f = path.join(SRC, `toxic_marsh_${cfg.tag}.png`);
    if (!fs.existsSync(f)) throw new Error('missing derivative for --recolor: ' + f);
    const corrected = await channelMatchToHero(fs.readFileSync(f), cfg.tag);
    fs.writeFileSync(f, corrected);
    const c = await stats(corrected);
    console.log(`  ${cfg.tag}: recoloured(eq) [${fmtC(c)}] top-bot ${c.topBot.toFixed(1)}${Math.abs(c.topBot) > 6 ? ' <-- GRADIENT WARN' : ''}`);
  }
}

async function deriveAll(reroll) {
  if (!FAL_API_KEY) { console.error('No fal key (FAL_AI_API_KEY in scripts/.env)'); process.exit(1); }
  const basisPng = await loadHero();
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
  const recolor = args.includes('--recolor');
  const reprocess = args.includes('--reprocess');
  const reroll = args.filter(a => !a.startsWith('--'));
  if (reprocess) await reprocessAll();
  else if (recolor) await recolorExisting();
  else if (!mosaicOnly) await deriveAll(reroll);
  const finals = await buildSlots();
  await buildReviewMosaic(finals);
  await build2x2(finals);
  console.log('all done');
})();
