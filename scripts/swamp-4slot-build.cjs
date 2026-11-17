/**
 * PRODUCTION-PREP: swamp 4-SLOT BUILD (working dir only — NO src/ integration).
 *
 * APPROVED hero (Rudi):
 *   Slot 0 = assets/style-test/tiles/swamp_0.png
 *     = combined hero: dark muddy dry-grass ground with a broad diffuse murky
 *       brown-green wet area + scattered wet patches. 512x256, diamond-masked.
 *       Used AS-IS (no re-darken, no flop).
 *
 * Slots 1-3 are DERIVED from the hero with FLUX PRO KONTEXT (POSITIVE-only edit).
 * Per Rudi, they must reposition the water/grass/mud, AND in 2 of the 3 new slots
 * add a FEW PROPER DISCRETE grass-rimmed rounded puddles/pools (the defined round
 * pool look of swamp_dark.png) — not just a diffuse sheet. The remaining 1 slot
 * stays diffuse-wet like the hero:
 *   slot1 (d1) = DISCRETE grass-rimmed pools scattered across the ground
 *   slot2 (d2) = DISCRETE grass-rimmed pools in different spots
 *   slot3 (d3) = DIFFUSE (rearranged wet sheen / mud / grass, like the hero)
 * Palette held muddy brown-green, matte, nothing neon.
 *
 * COLOUR HANDLING (consistency wanted here — unlike crystal_field):
 *   - UNIFORM LUMA normalization: single brightness multiply (same factor R,G,B)
 *     so each derivative sits at the hero's interior luma. Hue-preserving, edge-safe.
 *   - PER-CHANNEL WHITE-BALANCE to the hero: uniform per-channel gain pulling each
 *     derivative's mean R/G/B onto the hero's, in case kontext drifts the palette.
 *     Also a uniform-gain op -> edges fall off exactly like slot 0.
 *   - NO divide-by-blur 2D equalization (that caused the toxic_marsh gold edge rim).
 *
 * Slot map (NOT integrated — files written to the style-test workspace only):
 *   swamp_0 = hero AS-IS                       (no flop)
 *   swamp_1 = kontext(hero) discrete pools     (no flop)
 *   swamp_2 = kontext(hero) discrete pools     (.flop L<->R)
 *   swamp_3 = kontext(hero) diffuse rearrange  (.flop L<->R)
 * Slots 2 & 3 mirrored on the VERTICAL axis (.flop = left<->right) to fight visible
 * repetition — never .flip (top<->bottom); that would break the upper-left lighting.
 *
 * Outputs (assets/style-test/tiles/ ONLY):
 *   swamp_0.png .. swamp_3.png            512x256 diamond-masked
 *   swamp_d1.png .. swamp_d3.png          raw derived (pre-flop) — intermediate
 *   swamp_<tag>_kraw.png                  cached raw kontext download
 *   swamp-4slot-mosaic.png               review: 4 per-slot iso panels + 1 mixed
 *   _swamp_slots_2x2.png                  review: 2x2 of the four full slots
 *
 * fal key in scripts/.env (FAL_AI_API_KEY / FAL_API_KEY) — never hardcode / commit.
 *
 * Usage:
 *   node scripts/swamp-4slot-build.cjs                full run
 *   node scripts/swamp-4slot-build.cjs d1 d3          re-roll listed derivatives (seed +1000)
 *   node scripts/swamp-4slot-build.cjs --reprocess    re-run post-process from cached raw (no FAL)
 *   node scripts/swamp-4slot-build.cjs --mosaic-only  rebuild slots+mosaics from existing files
 *   node scripts/swamp-4slot-build.cjs --edge         just print the edge-band luma table
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
const HERO = path.join(SRC, 'swamp_0.png'); // slot 0, final, as-is
const BG = { r: 0x14, g: 0x17, b: 0x1c };

// Common base clause: hold the ground, lighting and darkness in every derivative.
const BASE_CLAUSE =
  'keep the same dark muddy boggy dry-grass ground, same matte dim upper-left ' +
  'lighting and darkness';
const PALETTE_GUARD =
  '; keep the muddy brown-green palette, matte, nothing neon, not glowing, not bright';

// Three derivatives from the single hero. Fixed seeds (no Math.random).
const DERIVE = [
  {
    tag: 'd1', seed: 311827, slot: 1, kind: 'discrete',
    prompt:
      BASE_CLAUSE +
      '; rearrange the wet area and grass tufts; add a few discrete rounded murky ' +
      'brown-green water pools with grassy muddy rims scattered across the ground' +
      PALETTE_GUARD,
  },
  {
    tag: 'd2', seed: 742093, slot: 2, kind: 'discrete',
    prompt:
      BASE_CLAUSE +
      '; rearrange the wet area and grass tufts; add several discrete rounded murky ' +
      'brown-green standing water pools with grassy muddy rims in different spots ' +
      'across the ground, defined round pools not a diffuse sheet' +
      PALETTE_GUARD,
  },
  {
    tag: 'd3', seed: 629153, slot: 3, kind: 'diffuse',
    prompt:
      BASE_CLAUSE +
      '; rearrange the diffuse wet sheen, mud patches and grass tufts to different ' +
      'positions' + PALETTE_GUARD,
  },
];

// Final slot map. hero -> 0, d1 -> 1, d2 -> 2 (flop), d3 -> 3 (flop).
const MAP = [
  { n: 0, src: () => HERO, flop: false, label: 'hero (as-is)' },
  { n: 1, src: () => path.join(SRC, 'swamp_d1.png'), flop: false, label: 'kontext discrete pools' },
  { n: 2, src: () => path.join(SRC, 'swamp_d2.png'), flop: true, label: 'kontext discrete pools' },
  { n: 3, src: () => path.join(SRC, 'swamp_d3.png'), flop: true, label: 'kontext diffuse rearrange' },
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

let HERO_LUMA = null;
let HERO_RGB = null; // {r,g,b} interior means for white-balance

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
async function edgeBandLuma(maskedBuf, insetScale = 0.86) {
  const { data, info } = await sharp(maskedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
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
    if (a < 8) continue;
    if (inner[p] > 8) continue;
    sum += luma(data[p * channels], data[p * channels + 1], data[p * channels + 2]); n++;
  }
  return { luma: n ? sum / n : 0, n };
}

// UNIFORM LUMA normalization to the hero's interior luma. Single brightness multiply
// on all three channels (hue-preserving). Edge-safe.
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

// PER-CHANNEL WHITE-BALANCE to the hero. Uniform per-channel gain (heroMean_c / cur_c),
// clamped, pulling a drifted palette back onto the hero's. Uniform-gain -> edge-safe.
async function channelMatchToHero(maskedBuf, tag) {
  if (!HERO_RGB) return maskedBuf;
  const pre = await stats(maskedBuf);
  const clamp = (x) => (x < 0.8 ? 0.8 : x > 1.25 ? 1.25 : x);
  const gr = clamp(HERO_RGB.r / pre.r);
  const gg = clamp(HERO_RGB.g / pre.g);
  const gb = clamp(HERO_RGB.b / pre.b);
  const { data, info } = await sharp(maskedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] === 0) continue;
    data[i] = Math.min(255, Math.round(data[i] * gr));
    data[i + 1] = Math.min(255, Math.round(data[i + 1] * gg));
    data[i + 2] = Math.min(255, Math.round(data[i + 2] * gb));
  }
  const out = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
  const post = await stats(out);
  console.log(`  [wb]   ${tag} R x${gr.toFixed(3)} G x${gg.toFixed(3)} B x${gb.toFixed(3)}  ${fmtC(pre)} -> ${fmtC(post)}`);
  return out;
}

// kontext rect -> 512x256 fill -> diamond mask -> uniform luma pin -> per-channel WB.
// NO equalize2D. Writes swamp_<tag>.png (pre-flop).
async function postProcessDerive(rawBuf, tag) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha().png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const lumaFixed = await lumaMatchToHero(masked, tag);
  const corrected = await channelMatchToHero(lumaFixed, tag);
  const full = path.join(SRC, `swamp_${tag}.png`);
  fs.writeFileSync(full, corrected);
  console.log(`[save] ${full} (eq=none, luma+wb)`);
  return corrected;
}

const krawPath = (tag) => path.join(SRC, `swamp_${tag}_kraw.png`);

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
  console.log(`[kontext] ${cfg.tag} seed ${cfg.seed} kind=${cfg.kind}`);
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/kontext', {
    image_url: dataUri,
    prompt: cfg.prompt,
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
    const outPath = path.join(SRC, `swamp_${n}.png`);
    fs.writeFileSync(outPath, buf);
    const s = await stats(buf);
    console.log(`[slot] swamp_${n} <- ${label}${flop ? ' (flop L<->R)' : ''}  ${fmtC(s)}  top-bot ${s.topBot.toFixed(1)}${Math.abs(s.topBot) > 6 ? ' <-- GRADIENT WARN' : ''}`);
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
  const rand = mulberry32(0x5A3B);
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
  const p = path.join(SRC, 'swamp-4slot-mosaic.png');
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
      `<svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${LBL}"><text x="4" y="16" font-family="monospace" font-size="15" fill="#c9d1d9">swamp_${n}.png</text></svg>`
    );
    comp.push({ input: label, left: cx, top: cy });
    comp.push({ input: finals[n], left: cx, top: cy + LBL });
  }
  const out = await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: BGA } })
    .composite(comp).png().toBuffer();
  const p = path.join(SRC, '_swamp_slots_2x2.png');
  fs.writeFileSync(p, out);
  console.log(`[2x2] ${p}`);
}

async function loadHero() {
  const basisPng = await sharp(fs.readFileSync(HERO)).png().toBuffer();
  const basisC = await stats(basisPng);
  HERO_LUMA = basisC.luma;
  HERO_RGB = { r: basisC.r, g: basisC.g, b: basisC.b };
  console.log(`[hero] swamp_0 ${fmtC(basisC)}  top-bot ${basisC.topBot.toFixed(1)}`);
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
    console.log(`  ${cfg.tag}: derived(luma+wb) [${fmtC(c)}] top-bot ${c.topBot.toFixed(1)}${Math.abs(c.topBot) > 6 ? ' <-- GRADIENT WARN' : ''}`);
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
    const finals = await Promise.all([0, 1, 2, 3].map(n => fs.readFileSync(path.join(SRC, `swamp_${n}.png`))));
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
