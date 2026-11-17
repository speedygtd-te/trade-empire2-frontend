/**
 * PRODUCTION: fumarole 4-slot build.
 *
 * APPROVED basis (Rudi):
 *   Slot 0 = assets/style-test/tiles/fumarole_h1dark_exact.png
 *     = the chosen hero (fumarole_new_h1) darkened UNIFORMLY x0.85. Already
 *       512x256, diamond-masked, final look. Integrated AS-IS (no re-darken).
 *   Context-edit basis (brighter, pre-darken) = fumarole_new_h1.png (512x256,
 *     diamond-masked).
 *
 * The series is GLOW-FREE: dark near-black basalt + a dull muted pale-ochre dry
 * sulfur surface stain, only tiny dark cold gas vents. NO ember / lava / orange /
 * incandescence. That look MUST be preserved.
 *
 * Slots 1-3 are DERIVED from fumarole_new_h1 with FLUX PRO KONTEXT using the
 * proven simple-edit prompt "create a slightly different pattern" (NO negatives —
 * they reproduce the unwanted look; NOT a fresh text gen), a distinct seed each.
 * Each kontext result is then darkened with the SAME uniform x0.85 multiply as the
 * exact base (sharp .modulate({ brightness }) — pure multiply, introduces NO
 * gradient) so all four slots sit at identical darkness, then re-diamond-masked.
 *
 * Final slot map written to src/assets/tiles/fumarole/ (OVERWRITES the old Batch-1
 * fumarole_0..3):
 *   fumarole_0 = h1dark_exact         (no flop)
 *   fumarole_1 = kontext(new_h1) x0.85 (no flop)
 *   fumarole_2 = kontext(new_h1) x0.85 (.flop L<->R)
 *   fumarole_3 = kontext(new_h1) x0.85 (.flop L<->R)
 * Slots 2 & 3 are mirrored on the VERTICAL axis (sharp .flop = left<->right) to
 * fight visible repetition; never .flip (top<->bottom) — that breaks the
 * upper-left lighting convention.
 *
 * Per tile writes (matching the existing lava_flow / obsidian_ridge bestand exactly):
 *   fumarole_<n>.webp                full 512x256   (webp q90 e4)
 *   fumarole_<n>@half.{webp,png}     256x128
 *   fumarole_<n>@quarter.{webp,png}  128x64
 *   fumarole_<n>@eighth.{webp,png}   64x32
 *
 * Also writes a review PNG assets/style-test/tiles/fumarole-final-mosaic.png:
 *   a 3x3 interlocking-iso mosaic per slot + one mixed 4-slot mosaic
 *   (biome-overview.html technique).
 *
 * fal key in scripts/.env (FAL_AI_API_KEY / FAL_API_KEY) — never hardcode / commit.
 *
 * Usage:
 *   node scripts/fumarole-derive-and-integrate.cjs                 full run (derive + integrate + mosaic)
 *   node scripts/fumarole-derive-and-integrate.cjs --derive-only [d1 d2 d3]   re-roll a derivative (seed +1000)
 *   node scripts/fumarole-derive-and-integrate.cjs --integrate-only           rebuild src + mosaic from existing derivatives
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
const DARK = 0.85; // uniform brightness multiplier — SAME as fumarole_h1dark_exact
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'style-test', 'tiles');
const DST = path.join(ROOT, 'src', 'assets', 'tiles', 'fumarole');

const HERO = path.join(SRC, 'fumarole_new_h1.png');       // bright context-edit basis
const EXACT = path.join(SRC, 'fumarole_h1dark_exact.png'); // slot 0, final

// EXACT prompt Rudi proved by hand. NO negatives, NO long description.
const PROMPT = 'create a slightly different pattern';

// Three derivatives from the single hero. Fixed seeds (no Math.random),
// distinct from the h1dark generation seeds.
const DERIVE = [
  { tag: 'd1', seed: 731059 },
  { tag: 'd2', seed: 864127 },
  { tag: 'd3', seed: 592383 },
];

// Final slot map. exact -> 0, d1 -> 1, d2 -> 2 (flop), d3 -> 3 (flop).
const MAP = [
  { n: 0, src: () => EXACT, flop: false, label: 'h1dark_exact (new_h1 x0.85)' },
  { n: 1, src: () => path.join(SRC, 'fumarole_d1.png'), flop: false, label: 'kontext(new_h1) x0.85' },
  { n: 2, src: () => path.join(SRC, 'fumarole_d2.png'), flop: true, label: 'kontext(new_h1) x0.85' },
  { n: 3, src: () => path.join(SRC, 'fumarole_d3.png'), flop: true, label: 'kontext(new_h1) x0.85' },
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

// Interior mean color/luma AND top-half vs bottom-half luma (alpha>8 only). The
// top/bottom delta is the vertical-gradient guard — should be small (< ~6).
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

// kontext result -> 512x256 fill -> UNIFORM x0.85 darken (pure multiply, no
// gradient — same as fumarole_h1dark_exact) -> diamond mask.
async function postProcessDerive(rawBuf, tag) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha().png().toBuffer();
  const darkened = await sharp(resized).modulate({ brightness: DARK }).png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(darkened).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const full = path.join(SRC, `fumarole_${tag}.png`);
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
  const finals = [];
  for (const { n, src, flop, label } of MAP) {
    const srcPath = src();
    if (!fs.existsSync(srcPath)) throw new Error(`missing source for slot ${n}: ${srcPath}`);
    let buf = fs.readFileSync(srcPath);
    const meta = await sharp(buf).metadata();
    if (meta.width !== TILE_W || meta.height !== TILE_H) throw new Error(`${srcPath} not 512x256 (${meta.width}x${meta.height})`);
    if (flop) buf = await sharp(buf).flop().png().toBuffer();
    await writeWebp(buf, null, null, path.join(DST, `fumarole_${n}.webp`));
    for (const m of MIPS) {
      await writeWebp(buf, m.w, m.h, path.join(DST, `fumarole_${n}${m.suffix}.webp`));
      await writePng(buf, m.w, m.h, path.join(DST, `fumarole_${n}${m.suffix}.png`));
    }
    const s = await stats(buf);
    console.log(`[done] fumarole_${n} <- ${label}${flop ? ' (flop L<->R)' : ''}  ${fmtC(s)}  top-bot ${s.topBot.toFixed(1)}${Math.abs(s.topBot) > 6 ? ' <-- GRADIENT WARN' : ''}`);
    finals.push(buf);
  }
  console.log('integration complete');
  return finals;
}

// --- Review mosaic (biome-overview.html interlocking-iso technique) -------------
// Tiles half-size (256x128) as the mosaic unit; odd rows offset by W/2, vertical
// step H/2 so the diamonds interlock seamlessly.
const M_ROWS = 3, M_COLS = 3, M_W = 256, M_H = 128;
const BG = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build one interlocking mosaic buffer. `pick(r,c)` returns a half-size tile buf.
async function mosaicBuf(pick) {
  const placements = [];
  let maxRight = 0, maxBottom = 0;
  for (let r = 0; r < M_ROWS; r++) {
    const odd = r % 2 === 1;
    for (let c = 0; c < M_COLS; c++) {
      const x = c * M_W + (odd ? M_W / 2 : 0);
      const y = r * (M_H / 2);
      placements.push({ x, y, r, c });
      if (x + M_W > maxRight) maxRight = x + M_W;
      if (y + M_H > maxBottom) maxBottom = y + M_H;
    }
  }
  const comp = placements.map(p => ({ input: pick(p.r, p.c), left: p.x, top: p.y }));
  return sharp({ create: { width: maxRight, height: maxBottom, channels: 4, background: BG } })
    .composite(comp).png().toBuffer();
}

async function buildFinalMosaic(finals) {
  // half-size each final tile (already flopped) for the mosaic unit
  const halves = await Promise.all(finals.map(b => sharp(b).resize(M_W, M_H, { fit: 'fill' }).png().toBuffer()));
  const panels = [];
  // one 3x3 per slot
  for (let s = 0; s < 4; s++) panels.push({ label: `slot ${s}`, buf: await mosaicBuf(() => halves[s]) });
  // one mixed 3x3 across all 4 slots (deterministic)
  const rand = mulberry32(0x50F0);
  panels.push({ label: 'mixed 0-3', buf: await mosaicBuf(() => halves[Math.floor(rand() * 4)]) });

  const LBL = 22, PAD = 20, GAP = 24;
  const dims = await Promise.all(panels.map(p => sharp(p.buf).metadata()));
  const pw = Math.max(...dims.map(d => d.width));
  const ph = Math.max(...dims.map(d => d.height));
  const cols = panels.length; // single row of 5
  const cellW = pw, cellH = ph + LBL;
  const canvasW = PAD * 2 + cols * cellW + (cols - 1) * GAP;
  const canvasH = PAD * 2 + cellH;
  const comp = [];
  for (let i = 0; i < panels.length; i++) {
    const cx = PAD + i * (cellW + GAP);
    const label = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${LBL}">
        <text x="4" y="16" font-family="monospace" font-size="15" fill="#c9d1d9">${panels[i].label}</text>
      </svg>`
    );
    comp.push({ input: label, left: cx, top: PAD });
    comp.push({ input: panels[i].buf, left: cx, top: PAD + LBL });
  }
  const out = await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: BG } })
    .composite(comp).png().toBuffer();
  const p = path.join(SRC, 'fumarole-final-mosaic.png');
  fs.writeFileSync(p, out);
  console.log(`[mosaic] ${p}`);
}

async function deriveAll(reroll, seedOverride) {
  if (!FAL_API_KEY) { console.error('No fal key (FAL_AI_API_KEY in scripts/.env)'); process.exit(1); }
  const basisPng = await sharp(fs.readFileSync(HERO)).png().toBuffer();
  const basisC = await stats(basisPng);
  console.log(`[hero] fumarole_new_h1 ${fmtC(basisC)}`);
  for (const cfg of DERIVE) {
    if (reroll.length && !reroll.includes(cfg.tag)) continue;
    const seed = seedOverride[cfg.tag] || (reroll.includes(cfg.tag) ? cfg.seed + 1000 : cfg.seed);
    const masked = await kontext(basisPng, { ...cfg, seed });
    const c = await stats(masked);
    console.log(`  ${cfg.tag}: derived(dark) [${fmtC(c)}] top-bot ${c.topBot.toFixed(1)}${Math.abs(c.topBot) > 6 ? ' <-- GRADIENT WARN' : ''}`);
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
  if (!deriveOnly) {
    const finals = await integrate();
    await buildFinalMosaic(finals);
  }
  console.log('all done');
})();
