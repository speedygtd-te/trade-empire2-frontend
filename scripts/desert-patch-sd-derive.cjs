/**
 * STYLE-TEST ONLY (NO src/ writes, NO cap sync, NO git):
 * desert_patch (EARTH_LIKE) tile derived from sand_dunes (DESERT) — Rudi's idea:
 * a desert_patch is a dry sand/desert spot on an Earth-like planet. Materially it
 * IS desert sand, so recycle the accepted sand_dunes look. Because desert_patch
 * (EARTH_LIKE) and sand_dunes (DESERT) NEVER occur on the same planet, they may
 * look alike — but desert_patch gets its OWN tiles (slightly different sand
 * patterns), not the exact same files.
 *
 * PROVEN METHOD (sand_dunes lesson): flux-pro/kontext (flux pro edit) with the
 * SIMPLE prompt "create a slightly different pattern". NO negatives, NO long
 * anti-relief descriptions — those negative tokens INTRODUCE relief and make
 * flux render it anyway. The flat sand input stays flat; only the pattern varies.
 *
 * Model: fal-ai/flux-pro/kontext (image + prompt).
 * Input: src/assets/tiles/sand_dunes/sand_dunes_0.webp (accepted dark flat desert
 *        sand, 512x256 diamond-masked RGBA), flattened onto the iso bg as init.
 *
 * 4-slot layout:
 *   desert_patch_0 = edit variant (seed A)            original
 *   desert_patch_1 = edit variant (seed B)            original
 *   desert_patch_2 = edit variant (seed C)            .flop (L<->R)
 *   desert_patch_3 = edit variant (seed D)            .flop (L<->R)
 *
 * Outputs (style-test workspace only):
 *   assets/style-test/tiles/desert_patch_{0..3}.png       (512x256 masked)
 *   assets/style-test/tiles/desert_patch_{0..3}_half.png  (256x128)
 *   assets/style-test/tiles/desert_patch_{0..3}_mosaic.png(3x3 iso ref)
 *
 * Usage:
 *   node scripts/desert-patch-sd-derive.cjs            -> all 4
 *   node scripts/desert-patch-sd-derive.cjs 2 3        -> re-roll slots (seed +1000)
 *   node scripts/desert-patch-sd-derive.cjs 1=12345    -> explicit seed
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
if (!FAL_API_KEY) { console.error('No fal key'); process.exit(1); }
const https = require('https');
const http = require('http');
const sharp = require('sharp');

const TILE_W = 512, TILE_H = 256;
const ISO_BG = { r: 0x14, g: 0x17, b: 0x1c };
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'style-test', 'tiles');
const BASIS_WEBP = path.join(ROOT, 'src', 'assets', 'tiles', 'sand_dunes', 'sand_dunes_0.webp');

// POSITIVE prompt, Rudi-Korrektur (final): NICHT weich-sandig, sondern RISSIG
// und FESTER — trockener, ausgetrockneter, fester Boden mit Trockenrissen
// (cracked dry hardpan / dried clay). Entsättigt-erdbraun, DESERT-Familie.
// KEINE Negativ-Prompts. Gleichmäßige Riss-Verteilung über die ganze Fläche
// inkl. Mitte, KEIN dominanter zentraler Hauptriss (caldera-Lektion), kein
// Verlauf/Hotspot.
const PROMPT = 'dry cracked hard desert ground, dried mud cracks, firm packed earth with polygonal cracks, parched arid clay, weathered, evenly distributed cracks across the whole surface';

// 4 slots, distinct seeds. Slots 2 & 3 are flopped (L<->R) after the edit.
const SLOTS = [
  { tag: '0', seed: 71013, flop: false },
  { tag: '1', seed: 82029, flop: false },
  { tag: '2', seed: 93041, flop: true },
  { tag: '3', seed: 104053, flop: true },
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

// Relief/gradient detector. darkPct/brightPct = shadow/crest fraction (relief),
// std = contrast, leftLuma/rightLuma & topLuma/botLuma = directional gradient
// (a lit-side/dark-side hotspot shows up as a big L-R or T-B luma delta).
async function reliefStats(maskedBuf) {
  const { data, info } = await sharp(maskedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let mean = 0, n = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    if (data[i + 3] < 8) continue;
    mean += luma(data[i], data[i + 1], data[i + 2]); n++;
  }
  mean /= n;
  let dark = 0, bright = 0, sd = 0;
  let lL = 0, lN = 0, rL = 0, rN = 0, tL = 0, tN = 0, bL = 0, bN = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    if (data[i + 3] < 8) continue;
    const l = luma(data[i], data[i + 1], data[i + 2]);
    sd += (l - mean) * (l - mean);
    if (l < mean - 40) dark++; if (l > mean + 40) bright++;
    if (x < width / 2) { lL += l; lN++; } else { rL += l; rN++; }
    if (y < height / 2) { tL += l; tN++; } else { bL += l; bN++; }
  }
  return {
    darkPct: (dark / n) * 100, brightPct: (bright / n) * 100, std: Math.sqrt(sd / n),
    lrDelta: Math.abs((lL / lN) - (rL / rN)), tbDelta: Math.abs((tL / tN) - (bL / bN)),
  };
}

async function postProcess(rawBuf, slot) {
  let img = sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha();
  if (slot.flop) img = sharp(await img.png().toBuffer()).flop(); // mirror L<->R
  const resized = await img.png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `desert_patch_${slot.tag}.png`), masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `desert_patch_${slot.tag}_half.png`), half);
  return masked;
}

async function kontext(basisPng, cfg) {
  const flat = await sharp(basisPng).flatten({ background: ISO_BG }).png().toBuffer();
  const dataUri = `data:image/png;base64,${flat.toString('base64')}`;
  console.log(`[kontext] slot ${cfg.tag} seed ${cfg.seed} flop=${cfg.flop} prompt="${PROMPT}"`);
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
  return postProcess(out, cfg);
}

async function mosaic(maskedBuf, outPath) {
  const HW = TILE_W / 2, HH = TILE_H / 2;
  const place = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) place.push({ cx: (c - r) * HW, cy: (c + r) * HH });
  const minX = Math.min(...place.map(p => p.cx));
  const maxX = Math.max(...place.map(p => p.cx));
  const maxY = Math.max(...place.map(p => p.cy));
  const canvasW = (maxX - minX) + TILE_W;
  const canvasH = maxY + TILE_H;
  const comp = place.map(p => ({ input: maskedBuf, left: p.cx - minX, top: p.cy }));
  const out = await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: { ...ISO_BG, alpha: 1 } } })
    .composite(comp).png().toBuffer();
  fs.writeFileSync(outPath, out);
}

const fmtC = (c) => `R${c.r.toFixed(0)} G${c.g.toFixed(0)} B${c.b.toFixed(0)} luma${c.luma.toFixed(1)}`;
const fmtR = (r) => `dark%${r.darkPct.toFixed(2)} bright%${r.brightPct.toFixed(2)} std${r.std.toFixed(1)} lrΔ${r.lrDelta.toFixed(1)} tbΔ${r.tbDelta.toFixed(1)}`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const basisPng = await sharp(fs.readFileSync(BASIS_WEBP)).png().toBuffer();
  const meta = await sharp(basisPng).metadata();
  console.log(`[basis] ${BASIS_WEBP} -> ${meta.width}x${meta.height} png`);
  const basisC = await colorStats(basisPng), basisR = await reliefStats(basisPng);
  console.log(`SAND_DUNES_0 color[${fmtC(basisC)}] relief[${fmtR(basisR)}]`);

  const args = process.argv.slice(2);
  const reroll = args.map(a => a.split('=')[0]);
  const seedOverride = {};
  for (const a of args) { const [t, s] = a.split('='); if (s) seedOverride[t] = parseInt(s, 10); }

  for (const cfg of SLOTS) {
    if (reroll.length && !reroll.includes(cfg.tag)) continue;
    const seed = seedOverride[cfg.tag] || (reroll.includes(cfg.tag) ? cfg.seed + 1000 : cfg.seed);
    try {
      const masked = await kontext(basisPng, { ...cfg, seed });
      await mosaic(masked, path.join(OUT, `desert_patch_${cfg.tag}_mosaic.png`));
      const c = await colorStats(masked), rl = await reliefStats(masked);
      console.log(`  ${cfg.tag}: color[${fmtC(c)}] relief[${fmtR(rl)}] dLuma ${(c.luma - basisC.luma).toFixed(1)}`);
    } catch (e) { console.error(`ERR ${cfg.tag}: ${e.message}`); }
  }
  console.log('done');
})();
