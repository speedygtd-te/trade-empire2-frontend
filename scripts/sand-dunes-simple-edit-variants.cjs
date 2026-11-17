/**
 * STYLE-TEST ONLY (NO src/ writes, NO cap sync, NO git):
 * sand_dunes variants via FLUX PRO KONTEXT edit — Rudi's PROVEN method.
 *
 * KEY INSIGHT (replaces the old sand-dunes-kontext-variants.cjs approach):
 * The earlier runs failed because they used long ANTI-RELIEF NEGATIVE prompts
 * ("NO raised dunes, NO 3D relief, NO cast shadows"). Those negative tokens
 * INTRODUCE the relief concepts and make flux render relief anyway.
 *
 * Rudi solved it BY HAND in the fal web UI ("flux pro edit") with the SIMPLE
 * prompt:  "create a slightly different pattern"
 * -> the flat input image stays flat, only the pattern varies slightly.
 * This script replicates that exactly: same model, same EXACT prompt, no
 * negatives, no long descriptions, just a different seed per variant.
 *
 * Model: fal-ai/flux-pro/kontext (flux pro edit, image+prompt).
 * Input: src/assets/tiles/sand_dunes/sand_dunes_0.webp (accepted dark basis),
 *        converted to PNG in-memory as the kontext image_url.
 *
 * Outputs (style-test workspace only):
 *   assets/style-test/tiles/sand_dunes_se_v{1,2,3}.png       (512x256 masked)
 *   assets/style-test/tiles/sand_dunes_se_v{1,2,3}_half.png  (256x128)
 *   assets/style-test/tiles/sand_dunes_se_v{1,2,3}_mosaic.png(3x3 iso ref)
 *   assets/style-test/tiles/sand_dunes_se_basis_mosaic.png   (basis 3x3 ref)
 *
 * Usage: node scripts/sand-dunes-simple-edit-variants.cjs [v1 v2 v3]
 *        re-roll a slot bumps its seed +1000; explicit: v1=12345
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
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'style-test', 'tiles');
const BASIS_WEBP = path.join(ROOT, 'src', 'assets', 'tiles', 'sand_dunes', 'sand_dunes_0.webp');

// EXACT prompt Rudi used by hand. NO negatives, NO long description.
const PROMPT = 'create a slightly different pattern';

const VARIANTS = [
  { tag: 'v1', seed: 31001 },
  { tag: 'v2', seed: 47002 },
  { tag: 'v3', seed: 58003 },
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

// Relief / shadow detector: dark-shadow fraction (luma<mean-40), bright-crest
// fraction (luma>mean+40), std. High values = relief crept in.
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
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    if (data[i + 3] < 8) continue;
    const l = luma(data[i], data[i + 1], data[i + 2]);
    sd += (l - mean) * (l - mean);
    if (l < mean - 40) dark++; if (l > mean + 40) bright++;
  }
  return { darkPct: (dark / n) * 100, brightPct: (bright / n) * 100, std: Math.sqrt(sd / n) };
}

async function postProcess(rawBuf, tag) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha().png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `sand_dunes_se_${tag}.png`), masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `sand_dunes_se_${tag}_half.png`), half);
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
  return postProcess(out, cfg.tag);
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
  const out = await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 } } })
    .composite(comp).png().toBuffer();
  fs.writeFileSync(outPath, out);
}

const fmtC = (c) => `R${c.r.toFixed(0)} G${c.g.toFixed(0)} B${c.b.toFixed(0)} luma${c.luma.toFixed(1)}`;
const fmtR = (r) => `dark%${r.darkPct.toFixed(2)} bright%${r.brightPct.toFixed(2)} std${r.std.toFixed(1)}`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const basisPng = await sharp(fs.readFileSync(BASIS_WEBP)).png().toBuffer();
  const meta = await sharp(basisPng).metadata();
  console.log(`[basis] ${BASIS_WEBP} -> ${meta.width}x${meta.height} png`);
  const basisC = await colorStats(basisPng), basisR = await reliefStats(basisPng);
  console.log(`BASIS color[${fmtC(basisC)}] relief[${fmtR(basisR)}]`);
  await mosaic(basisPng, path.join(OUT, 'sand_dunes_se_basis_mosaic.png'));

  const args = process.argv.slice(2);
  const reroll = args.map(a => a.split('=')[0]);
  const seedOverride = {};
  for (const a of args) { const [t, s] = a.split('='); if (s) seedOverride[t] = parseInt(s, 10); }

  for (const cfg of VARIANTS) {
    if (reroll.length && !reroll.includes(cfg.tag)) continue;
    const seed = seedOverride[cfg.tag] || (reroll.includes(cfg.tag) ? cfg.seed + 1000 : cfg.seed);
    try {
      const masked = await kontext(basisPng, { ...cfg, seed });
      await mosaic(masked, path.join(OUT, `sand_dunes_se_${cfg.tag}_mosaic.png`));
      const c = await colorStats(masked), rl = await reliefStats(masked);
      console.log(`  ${cfg.tag}: color[${fmtC(c)}] relief[${fmtR(rl)}] dLuma ${(c.luma - basisC.luma).toFixed(1)}`);
    } catch (e) { console.error(`ERR ${cfg.tag}: ${e.message}`); }
  }
  console.log('done');
})();
