/**
 * swamp COMBINED HERO (working dir only — NO src/ integration, NO variant slots).
 *
 * Rudi's tentative idea: take the dark muddy dry-grass base and add the WETTER puddles
 * from swamp_dark (several murky brown-green standing water pools).
 *   base   = assets/style-test/tiles/plains_dirty_mix2_s1.png  (dark mud + dry grass,
 *            a few small puddles) — 512x256 diamond-masked RGBA
 *   target = look of assets/style-test/tiles/swamp_dark.png    (several murky
 *            brown-green water pools across the ground) — reference only
 *
 * Method: single flux-pro/kontext POSITIVE edit of the base to scatter several murky
 * brown-green standing water pools across it while holding the dark muddy dry-grass base,
 * matte dim upper-left lighting and darkness. Result -> 512x256 -> diamond re-mask ->
 * UNIFORM luma pin back to the base's interior luma (keeps the darkness; hue-preserving).
 * NO divide-by-blur equalization (that caused the toxic_marsh gold edge rim) -> edges fall
 * off exactly like the base.
 *
 * Outputs (assets/style-test/tiles/ ONLY):
 *   swamp_0.png          combined hero, 512x256 diamond-masked
 *   swamp_0_kraw.png     cached raw kontext download (intermediate)
 *   swamp_0_mosaic.png   3x3 interlocking-iso review mosaic
 *
 * fal key in scripts/.env (FAL_AI_API_KEY / FAL_API_KEY).
 *
 * Usage:
 *   node scripts/swamp-hero-combine.cjs             full run
 *   node scripts/swamp-hero-combine.cjs --reroll    re-run with seed+1000
 *   node scripts/swamp-hero-combine.cjs --reprocess re-post-process cached raw (no FAL)
 *   node scripts/swamp-hero-combine.cjs --edge      print edge-band luma vs base
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
const BASE = path.join(SRC, 'plains_dirty_mix2_s1.png');
const KRAW = path.join(SRC, 'swamp_0_kraw.png');
const OUT = path.join(SRC, 'swamp_0.png');
const BG = { r: 0x14, g: 0x17, b: 0x1c };
const SEED = 274051;

const PROMPT =
  'add several murky brown-green standing water pools and puddles scattered across the ' +
  'ground, like a wet swampy marsh with scattered pools of stagnant water; keep the exact ' +
  'same dark muddy dry-grass base ground, dark mud and sparse dry grass tufts, same matte ' +
  'dim upper-left lighting and darkness; the water is murky matte brown-green reflecting the ' +
  'dim sky, not bright, not neon, not glowing';

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

let BASE_LUMA = null;
async function lumaPinToBase(maskedBuf, tag) {
  if (!BASE_LUMA) return maskedBuf;
  const pre = await stats(maskedBuf);
  let f = BASE_LUMA / pre.luma;
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
  console.log(`  [luma] ${tag} x${f.toFixed(3)}  ${fmtC(pre)} -> ${fmtC(post)} (base luma ${BASE_LUMA.toFixed(1)})`);
  return out;
}

async function postProcess(rawBuf) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha().png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const corrected = await lumaPinToBase(masked, 'swamp_0');
  fs.writeFileSync(OUT, corrected);
  console.log(`[save] ${OUT} (eq=none, luma-only)`);
  return corrected;
}

// --- 3x3 interlocking-iso review mosaic ---------------------------------------
const M_W = 256, M_H = 128;
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
async function buildMosaic(finalBuf) {
  const half = await sharp(finalBuf).resize(M_W, M_H, { fit: 'fill' }).png().toBuffer();
  const rows = 3, cols = 3;
  const placements = [];
  let maxRight = 0, maxBottom = 0;
  for (let r = 0; r < rows; r++) {
    const odd = r % 2 === 1;
    for (let c = 0; c < cols; c++) {
      const x = c * M_W + (odd ? M_W / 2 : 0);
      const y = r * (M_H / 2);
      placements.push({ x, y });
      if (x + M_W > maxRight) maxRight = x + M_W;
      if (y + M_H > maxBottom) maxBottom = y + M_H;
    }
  }
  const comp = placements.map(p => ({ input: half, left: p.x, top: p.y }));
  const out = await sharp({ create: { width: maxRight, height: maxBottom, channels: 4, background: BGA } })
    .composite(comp).png().toBuffer();
  const p = path.join(SRC, 'swamp_0_mosaic.png');
  fs.writeFileSync(p, out);
  console.log(`[mosaic] ${p}`);
}

async function loadBase() {
  const basePng = await sharp(fs.readFileSync(BASE)).png().toBuffer();
  const c = await stats(basePng);
  BASE_LUMA = c.luma;
  console.log(`[base] plains_dirty_mix2_s1 ${fmtC(c)}  top-bot ${c.topBot.toFixed(1)}`);
  return basePng;
}

async function edgeReport(finalBuf) {
  const baseBuf = fs.readFileSync(BASE);
  const b = await edgeBandLuma(baseBuf);
  const e = await edgeBandLuma(finalBuf);
  const d = e.luma - b.luma;
  console.log('\n[edge-band luma] outermost band (inset 0.86), rim guard:');
  console.log(`  base    edge luma ${b.luma.toFixed(1)}  (n=${b.n})  <- reference`);
  console.log(`  swamp_0 edge luma ${e.luma.toFixed(1)}  (n=${e.n})  delta ${d >= 0 ? '+' : ''}${d.toFixed(1)}${Math.abs(d) > 4 ? '  <-- RIM WARN (>±4)' : '  ok'}`);
}

async function run() {
  fs.mkdirSync(SRC, { recursive: true });
  const args = process.argv.slice(2);
  if (args.includes('--edge')) {
    await edgeReport(fs.readFileSync(OUT));
    return;
  }
  const basePng = await loadBase();
  let finalBuf;
  if (args.includes('--reprocess')) {
    if (!fs.existsSync(KRAW)) throw new Error('missing cached raw for --reprocess: ' + KRAW);
    finalBuf = await postProcess(fs.readFileSync(KRAW));
  } else {
    if (!FAL_API_KEY) { console.error('No fal key (FAL_AI_API_KEY in scripts/.env)'); process.exit(1); }
    const seed = args.includes('--reroll') ? SEED + 1000 : SEED;
    const flat = await sharp(basePng).flatten({ background: BG }).png().toBuffer();
    const dataUri = `data:image/png;base64,${flat.toString('base64')}`;
    console.log(`[kontext] swamp_0 seed ${seed}`);
    const r = await fetchJson('https://fal.run/fal-ai/flux-pro/kontext', {
      image_url: dataUri, prompt: PROMPT, num_images: 1, safety_tolerance: '5', seed,
    });
    const url = r.images && r.images[0] && r.images[0].url;
    if (!url) throw new Error('no kontext url: ' + JSON.stringify(r).slice(0, 200));
    fs.writeFileSync(KRAW, await download(url));
    finalBuf = await postProcess(fs.readFileSync(KRAW));
  }
  const c = await stats(finalBuf);
  console.log(`  swamp_0: ${fmtC(c)} top-bot ${c.topBot.toFixed(1)}${Math.abs(c.topBot) > 6 ? ' <-- GRADIENT WARN' : ''}`);
  await edgeReport(finalBuf);
  await buildMosaic(finalBuf);
  console.log('hero done');
}
run().catch(e => { console.error(e); process.exit(1); });
