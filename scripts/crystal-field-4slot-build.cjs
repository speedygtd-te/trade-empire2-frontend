/**
 * PRODUCTION-PREP: crystal_field 4-SLOT BUILD (working dir only — NO src/ integration).
 *
 * APPROVED hero (Rudi — "nearly perfect"):
 *   Slot 0 = assets/style-test/tiles/crystal_field_mild.png
 *     = MILD teal candidate: base corroded_plain_0, a few small scattered dull matte
 *       teal-green crystal shards on mostly-intact corroded ground. 512x256,
 *       diamond-masked. Used AS-IS (no re-darken, no flop).
 *
 * Slots 1-3 are DERIVED from the hero with FLUX PRO KONTEXT (POSITIVE-only edit).
 * Per Rudi, the variants must (a) SLIGHTLY REARRANGE the crystals AND (b) use a
 * DIFFERENT muted desaturated crystal COLOUR per slot, so the four read as a varied
 * family while the corroded GROUND, dim upper-left lighting and darkness stay identical:
 *   slot1 (d1) = dull teal-green  (like the hero)
 *   slot2 (d2) = sickly amber-ochre
 *   slot3 (d3) = muted desaturated violet / indigo
 * All crystals stay dull / opaque / matte / light-absorbing — NOT glowing, NOT neon.
 *
 * COLOUR HANDLING (differs from toxic_marsh — the whole point):
 *   - NO per-channel white-balance (channelMatchToHero). That would flatten every
 *     slot's crystal colour back to the hero's teal and destroy the intended variety.
 *   - NO divide-by-blur 2D equalization (equalize2D). On toxic_marsh it dragged the dark
 *     pre-mask corners into the low-freq denominator at the diamond boundary and produced
 *     a bright yellow EDGE RIM. Dropped here so edges fall off exactly like slot 0.
 *   - ONLY a UNIFORM LUMA normalization: a single brightness multiply (same factor on
 *     R,G,B) so each derivative sits at the hero's interior luma (~49). Uniform gain keeps
 *     the channel ratios — i.e. the crystal HUE — intact.
 *
 * Slot map (NOT integrated — files written to the style-test workspace only):
 *   crystal_field_0 = hero mild AS-IS                  (no flop)
 *   crystal_field_1 = kontext(hero) teal   luma-pinned (no flop)
 *   crystal_field_2 = kontext(hero) amber  luma-pinned (.flop L<->R)
 *   crystal_field_3 = kontext(hero) violet luma-pinned (.flop L<->R)
 * Slots 2 & 3 mirrored on the VERTICAL axis (.flop = left<->right) to fight visible
 * repetition — never .flip (top<->bottom); that would break the upper-left lighting.
 *
 * Outputs (assets/style-test/tiles/ ONLY):
 *   crystal_field_0.png .. crystal_field_3.png        512x256 diamond-masked
 *   crystal_field_d1.png .. crystal_field_d3.png      raw derived (pre-flop) — intermediate
 *   crystal_field_<tag>_kraw.png                      cached raw kontext download
 *   crystal_field-4slot-mosaic.png                    review: 4 per-slot iso panels + 1 mixed
 *   _crystal_field_slots_2x2.png                      review: 2x2 of the four full slots
 *
 * fal key in scripts/.env (FAL_AI_API_KEY / FAL_API_KEY) — never hardcode / commit.
 *
 * Usage:
 *   node scripts/crystal-field-4slot-build.cjs                full run
 *   node scripts/crystal-field-4slot-build.cjs d1 d2         re-roll listed derivatives (seed +1000)
 *   node scripts/crystal-field-4slot-build.cjs --reprocess   re-run post-process from cached raw kontext (no FAL)
 *   node scripts/crystal-field-4slot-build.cjs --mosaic-only rebuild slots+mosaics from existing files
 *   node scripts/crystal-field-4slot-build.cjs --edge        just print the edge-band luma table
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
const HERO = path.join(SRC, 'crystal_field_mild.png'); // slot 0, final, as-is
const BG = { r: 0x14, g: 0x17, b: 0x1c };

// Per-slot POSITIVE prompt: hold the ground + lighting + darkness, slightly rearrange
// the shards, and force a DIFFERENT muted desaturated crystal colour per slot.
function promptFor(colour) {
  return (
    'keep the exact same corroded dirty ground and the same matte dim upper-left ' +
    'lighting and darkness; slightly rearrange the dull matte crystal shards to ' +
    'different spots; make the crystals a different muted desaturated colour — ' +
    colour + '; crystals stay dull opaque matte and light-absorbing, not glowing, not neon'
  );
}

// Three derivatives from the single hero. Fixed seeds (no Math.random). Distinct colour each.
const DERIVE = [
  { tag: 'd1', seed: 218041, colour: 'dull teal-green', slot: 1 },
  { tag: 'd2', seed: 386719, colour: 'sickly amber-ochre', slot: 2 },
  { tag: 'd3', seed: 552297, colour: 'muted desaturated violet indigo', slot: 3 },
];

// Final slot map. hero -> 0, d1 -> 1, d2 -> 2 (flop), d3 -> 3 (flop).
const MAP = [
  { n: 0, src: () => HERO, flop: false, label: 'hero mild (as-is)' },
  { n: 1, src: () => path.join(SRC, 'crystal_field_d1.png'), flop: false, label: 'kontext teal (luma)' },
  { n: 2, src: () => path.join(SRC, 'crystal_field_d2.png'), flop: true, label: 'kontext amber (luma)' },
  { n: 3, src: () => path.join(SRC, 'crystal_field_d3.png'), flop: true, label: 'kontext violet (luma)' },
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

// Target interior luma for the derivatives — set to the hero's mean luma at run start so
// all four slots read at the SAME brightness. UNIFORM multiply only (hue-preserving).
let HERO_LUMA = null;

// Interior mean color/luma AND top vs bottom luma delta (alpha>8 only).
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

// --- Edge-band luma verifier (rim guard) ----------------------------------------
// Outer diamond minus an inset diamond => the outermost ~band of opaque pixels. We
// average luma there per slot; a bright RIM (the toxic_marsh defect) shows up as a
// slot-1..3 edge luma well above slot 0's. INSET is a center-scale of the diamond.
async function edgeBandLuma(maskedBuf, insetScale = 0.86) {
  const { data, info } = await sharp(maskedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  // inner (inset) diamond mask, scaled about center
  const s = insetScale;
  const iw = Math.round(TILE_W * s), ih = Math.round(TILE_H * s);
  const innerSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <polygon points="${w / 2},${(h - ih) / 2} ${(w + iw) / 2},${h / 2} ${w / 2},${(h + ih) / 2} ${(w - iw) / 2},${h / 2}" fill="white"/>
    </svg>`
  );
  const inner = await sharp(innerSvg).greyscale().raw().toBuffer();
  let sum = 0, n = 0;
  for (let p = 0; p < w * h; p++) {
    const a = data[p * channels + 3];
    if (a < 8) continue;            // outside diamond
    if (inner[p] > 8) continue;     // inside inset -> not edge band
    sum += luma(data[p * channels], data[p * channels + 1], data[p * channels + 2]); n++;
  }
  return { luma: n ? sum / n : 0, n };
}

// UNIFORM LUMA normalization of a diamond-masked derivative to the hero's interior luma.
// Single brightness multiply on all three channels (hue-preserving) — NO per-channel
// white-balance, NO divide-by-blur. This is the ONLY tonal correction applied.
async function lumaMatchToHero(maskedBuf, tag) {
  if (!HERO_LUMA) return maskedBuf;
  const pre = await stats(maskedBuf);
  let f = HERO_LUMA / pre.luma;
  f = f < 0.7 ? 0.7 : f > 1.4 ? 1.4 : f;
  const { data, info } = await sharp(maskedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] === 0) continue;
    data[i] = Math.min(255, Math.round(data[i] * f));
    data[i + 1] = Math.min(255, Math.round(data[i + 1] * f));
    data[i + 2] = Math.min(255, Math.round(data[i + 2] * f));
  }
  const out = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
  const post = await stats(out);
  console.log(`  [luma] ${tag} x${f.toFixed(3)}  ${fmtC(pre)} -> ${fmtC(post)} (hero luma ${HERO_LUMA.toFixed(1)})`);
  return out;
}

// kontext rect -> 512x256 fill -> diamond mask -> UNIFORM luma pin to hero.
// NO equalize2D, NO channel white-balance. Writes crystal_field_<tag>.png (pre-flop).
async function postProcessDerive(rawBuf, tag) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha().png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const corrected = await lumaMatchToHero(masked, tag);
  const full = path.join(SRC, `crystal_field_${tag}.png`);
  fs.writeFileSync(full, corrected);
  console.log(`[save] ${full} (eq=none, luma-only)`);
  return corrected;
}

const krawPath = (tag) => path.join(SRC, `crystal_field_${tag}_kraw.png`);

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
  const flat = await sharp(basisPng).flatten({ background: BG }).png().toBuffer();
  const dataUri = `data:image/png;base64,${flat.toString('base64')}`;
  const prompt = promptFor(cfg.colour);
  console.log(`[kontext] ${cfg.tag} seed ${cfg.seed} colour="${cfg.colour}"`);
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
  fs.writeFileSync(krawPath(cfg.tag), out);
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
    const outPath = path.join(SRC, `crystal_field_${n}.png`);
    fs.writeFileSync(outPath, buf);
    const s = await stats(buf);
    console.log(`[slot] crystal_field_${n} <- ${label}${flop ? ' (flop L<->R)' : ''}  ${fmtC(s)}  top-bot ${s.topBot.toFixed(1)}${Math.abs(s.topBot) > 6 ? ' <-- GRADIENT WARN' : ''}`);
    finals.push(buf);
  }
  console.log('slots built');
  return finals;
}

// --- Edge-band table across the four final slots --------------------------------
async function edgeReport(finals) {
  console.log('\n[edge-band luma] outermost band (inset 0.86), rim guard:');
  const base = await edgeBandLuma(finals[0]);
  console.log(`  slot0  edge luma ${base.luma.toFixed(1)}  (n=${base.n})  <- reference`);
  for (let i = 1; i < 4; i++) {
    const e = await edgeBandLuma(finals[i]);
    const d = e.luma - base.luma;
    const flag = Math.abs(d) > 4 ? '  <-- RIM WARN (>±4)' : '  ok';
    console.log(`  slot${i}  edge luma ${e.luma.toFixed(1)}  (n=${e.n})  delta ${d >= 0 ? '+' : ''}${d.toFixed(1)}${flag}`);
  }
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
  for (let s = 0; s < 4; s++) panels.push({ label: `slot ${s}`, buf: await mosaicBuf(3, 3, () => halves[s]) });
  const rand = mulberry32(0xC4E7);
  panels.push({ label: 'mixed 0-3 (5x5)', buf: await mosaicBuf(5, 5, () => halves[Math.floor(rand() * 4)]) });

  const LBL = 22, PAD = 20, GAP = 24;
  const dims = await Promise.all(panels.map(p => sharp(p.buf).metadata()));
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
  const p = path.join(SRC, 'crystal_field-4slot-mosaic.png');
  fs.writeFileSync(p, out);
  console.log(`[mosaic] ${p}`);
}

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
      `<svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${LBL}"><text x="4" y="16" font-family="monospace" font-size="15" fill="#c9d1d9">crystal_field_${n}.png</text></svg>`
    );
    comp.push({ input: label, left: cx, top: cy });
    comp.push({ input: finals[n], left: cx, top: cy + LBL });
  }
  const out = await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: BGA } })
    .composite(comp).png().toBuffer();
  const p = path.join(SRC, '_crystal_field_slots_2x2.png');
  fs.writeFileSync(p, out);
  console.log(`[2x2] ${p}`);
}

async function loadHero() {
  const basisPng = await sharp(fs.readFileSync(HERO)).png().toBuffer();
  const basisC = await stats(basisPng);
  HERO_LUMA = basisC.luma;
  console.log(`[hero] crystal_field_mild ${fmtC(basisC)}  top-bot ${basisC.topBot.toFixed(1)}`);
  return basisPng;
}

async function deriveAll(reroll) {
  if (!FAL_API_KEY) { console.error('No fal key (FAL_AI_API_KEY in scripts/.env)'); process.exit(1); }
  const basisPng = await loadHero();
  for (const cfg of DERIVE) {
    if (reroll.length && !reroll.includes(cfg.tag)) continue;
    const seed = reroll.includes(cfg.tag) ? cfg.seed + 1000 : cfg.seed;
    const masked = await kontext(basisPng, { ...cfg, seed });
    const c = await stats(masked);
    console.log(`  ${cfg.tag}: derived(luma) [${fmtC(c)}] top-bot ${c.topBot.toFixed(1)}${Math.abs(c.topBot) > 6 ? ' <-- GRADIENT WARN' : ''}`);
  }
}

(async () => {
  fs.mkdirSync(SRC, { recursive: true });
  const args = process.argv.slice(2);
  const mosaicOnly = args.includes('--mosaic-only');
  const reprocess = args.includes('--reprocess');
  const edgeOnly = args.includes('--edge');
  const reroll = args.filter(a => !a.startsWith('--'));
  if (edgeOnly) {
    const finals = await Promise.all([0, 1, 2, 3].map(n => fs.readFileSync(path.join(SRC, `crystal_field_${n}.png`))));
    await edgeReport(finals);
    return;
  }
  if (reprocess) await reprocessAll();
  else if (!mosaicOnly) await deriveAll(reroll);
  const finals = await buildSlots();
  await edgeReport(finals);
  await buildReviewMosaic(finals);
  await build2x2(finals);
  console.log('all done');
})();
