/**
 * STYLE-TEST ONLY (NO src/ writes, NO cap sync, NO git):
 * oasis tile derived from sand_dunes — Rudi's idea: take the flat sand_dunes
 * sand floor and ADD evenly scattered green + moisture via FLUX PRO KONTEXT
 * edit, so oasis reads like "sand_dunes that turned moist + green" (one
 * coherent DESERT family). NO central water pool, NO palms — an EVEN moist
 * oasis GROUND.
 *
 * PROVEN METHOD (sand_dunes / rocky_desert lesson): flux-pro/kontext (flux pro
 * edit) with SIMPLE, ADDITIVE prompts. NO long anti / negative prompts — those
 * negative tokens INTRODUCE the concepts. For ADDITIVE features (here
 * green/moisture) re-run the SAME additive prompt per slot with a NEW seed —
 * NOT the "slightly different pattern" prompt (that strips the added feature).
 *
 * Input for ALL slots: src/assets/tiles/sand_dunes/sand_dunes_0.webp
 *   (flat desert sand, 512x256 diamond-masked RGBA) flattened onto the iso bg
 *   as the kontext init.
 *
 * Slots:
 *   oasis_sd_0 = sand_dunes_0 + green/moisture (seed A, original)
 *   oasis_sd_1 = sand_dunes_0 + green/moisture (seed B, original)
 *   oasis_sd_2 = sand_dunes_0 + green/moisture (seed C)  -> .flop at use time
 *   oasis_sd_3 = sand_dunes_0 + green/moisture (seed D)  -> .flop at use time
 * This script produces 0..3 as original orientation PNGs; flop for slots 2 & 3
 * is applied here so the candidate files already reflect the intended layout.
 *
 * Model: fal-ai/flux-pro/kontext (image + prompt).
 * Outputs (style-test workspace only):
 *   assets/style-test/tiles/oasis_sd_{0,1,2,3}.png       (512x256 masked)
 *   assets/style-test/tiles/oasis_sd_{0,1,2,3}_half.png  (256x128)
 *   assets/style-test/tiles/oasis_sd_{0,1,2,3}_mosaic.png(3x3 iso ref)
 *   assets/style-test/tiles/oasis_sd_sandref_mosaic.png  (sand_dunes_0 ref)
 *
 * Usage:
 *   node scripts/oasis-sd-derive.cjs                 -> all 4
 *   node scripts/oasis-sd-derive.cjs 0 2             -> re-roll slots 0 & 2 (seed +1000)
 *   node scripts/oasis-sd-derive.cjs 1=54321         -> explicit seed
 *   node scripts/oasis-sd-derive.cjs 0#"add patches..." -> override prompt
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
const SAND_WEBP = path.join(ROOT, 'src', 'assets', 'tiles', 'sand_dunes', 'sand_dunes_0.webp');

// Simple ADDITIVE green + moisture prompt (no negatives). Desaturated green to
// match the dim, dirty tile world; even spread keeps it tileable.
const GREEN_PROMPT = 'small green grass and moss tufts growing scattered across damp moist sandy ground, oasis floor';

// 4 slots, all derived from the SAME sand input with the SAME additive prompt,
// different seeds. Slots 2 & 3 get horizontally flopped after masking.
const SLOTS = [
  { tag: '0', prompt: GREEN_PROMPT, seed: 41011, flop: false },
  { tag: '1', prompt: GREEN_PROMPT, seed: 52027, flop: false },
  { tag: '2', prompt: GREEN_PROMPT, seed: 63041, flop: true },
  { tag: '3', prompt: GREEN_PROMPT, seed: 74059, flop: true },
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
// "green" fraction = pixels where G is clearly above R and B (added vegetation).
// center-vs-edge green density flags empty-center / edge-cluster of the green.
async function greenStats(maskedBuf) {
  const { data, info } = await sharp(maskedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const cx = width / 2, cy = height / 2;
  let green = 0, n = 0, cGreen = 0, cN = 0, oGreen = 0, oN = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    if (data[i + 3] < 8) continue;
    const R = data[i], G = data[i + 1], B = data[i + 2];
    const isGreen = G > R + 6 && G > B + 6;
    if (isGreen) green++;
    n++;
    const dd = Math.abs(x - cx) / cx + Math.abs(y - cy) / cy;
    if (dd < 0.5) { cN++; if (isGreen) cGreen++; }
    else { oN++; if (isGreen) oGreen++; }
  }
  return {
    greenPct: (green / n) * 100,
    centerGreen: cN ? (cGreen / cN) * 100 : 0,
    edgeGreen: oN ? (oGreen / oN) * 100 : 0,
  };
}

async function postProcess(rawBuf, tag, flop) {
  let pipe = sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha();
  if (flop) pipe = pipe.flop();
  const resized = await pipe.png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `oasis_sd_${tag}.png`), masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `oasis_sd_${tag}_half.png`), half);
  return masked;
}

async function kontext(initPng, cfg) {
  const flat = await sharp(initPng).flatten({ background: ISO_BG }).png().toBuffer();
  const dataUri = `data:image/png;base64,${flat.toString('base64')}`;
  console.log(`[kontext] slot ${cfg.tag} seed ${cfg.seed} flop=${cfg.flop} prompt="${cfg.prompt}"`);
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
  return postProcess(out, cfg.tag, cfg.flop);
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
const fmtG = (g) => `green%${g.greenPct.toFixed(2)} ctrGreen%${g.centerGreen.toFixed(2)} edgeGreen%${g.edgeGreen.toFixed(2)}`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const sandPng = await sharp(fs.readFileSync(SAND_WEBP)).png().toBuffer();
  const meta = await sharp(sandPng).metadata();
  console.log(`[sand input] ${SAND_WEBP} -> ${meta.width}x${meta.height} png`);
  const sandC = await colorStats(sandPng), sandG = await greenStats(sandPng);
  console.log(`SAND_DUNES_0 color[${fmtC(sandC)}] ${fmtG(sandG)}`);
  await mosaic(sandPng, path.join(OUT, 'oasis_sd_sandref_mosaic.png'));

  const args = process.argv.slice(2);
  const reroll = args.map(a => a.split(/[=#]/)[0]);
  const seedOverride = {};
  const promptOverride = {};
  for (const a of args) {
    const tag = a.split(/[=#]/)[0];
    const sMatch = a.match(/=(\d+)/);
    const pMatch = a.match(/#(.+)$/);
    if (sMatch) seedOverride[tag] = parseInt(sMatch[1], 10);
    if (pMatch) promptOverride[tag] = pMatch[1];
  }

  for (const cfg of SLOTS) {
    if (reroll.length && !reroll.includes(cfg.tag)) continue;
    const seed = seedOverride[cfg.tag] || (reroll.includes(cfg.tag) ? cfg.seed + 1000 : cfg.seed);
    const prompt = promptOverride[cfg.tag] || cfg.prompt;
    try {
      const masked = await kontext(sandPng, { ...cfg, seed, prompt });
      await mosaic(masked, path.join(OUT, `oasis_sd_${cfg.tag}_mosaic.png`));
      const c = await colorStats(masked), g = await greenStats(masked);
      console.log(`  ${cfg.tag}: color[${fmtC(c)}] ${fmtG(g)} dLuma ${(c.luma - sandC.luma).toFixed(1)} dGreen ${(g.greenPct - sandG.greenPct).toFixed(2)}`);
    } catch (e) { console.error(`ERR ${cfg.tag}: ${e.message}`); }
  }
  console.log('done');
})();
