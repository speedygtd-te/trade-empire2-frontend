/**
 * STYLE-TEST ONLY (NO src/ writes, NO cap sync, NO git):
 * corroded_plain (TOXIC biome) — re-roll of slots 0 & 1, PUDDLE-FREE.
 *
 * Problem (last run): slots 0/1 were derived from corroded_plain_3.png via an
 * ADDITIVE context edit -> the central green puddle of _3 bled through, so every
 * tile now has a puddle. Rudi wants: slots 0/1 = corroded dry ground WITHOUT a
 * puddle, instead a few sparse dead plants. Slots 2/3 stay the puddle tiles ->
 * real variance (2 plant tiles / 2 puddle tiles).
 *
 * Method: fal-ai/flux-pro/kontext (instruction-based edit).
 * Base: corroded_plain_3.png (desired ground look: rusty-brown corroded + subtle
 * poison-green accents, TOXIC, matches acid_lake).
 *
 * PROMPT = positive REPLACE instruction (puddle -> dry ground), NOT a negative
 * prompt (negatives reproduce the unwanted concept):
 *   "replace the central green puddle with dry corroded rusty ground, scatter a
 *    few sparse dead withered plants across the surface"
 *
 * Per slot: kontext edit -> resize 512x256 (fill) -> diamond mask -> half 256x128.
 * Slot 0 = seed A (original), slot 1 = seed B (original; no flop — 2/3 already flipped).
 *
 * Outputs (style-test workspace only, overwrites):
 *   assets/style-test/tiles/corroded_plain_{0,1}.png       (512x256 masked)
 *   assets/style-test/tiles/corroded_plain_{0,1}_half.png  (256x128)
 *
 * Slots 2/3 are NOT touched.
 *
 * Usage: node scripts/corroded-plain-nopuddle-edit.cjs [0 1]
 *        re-roll a slot bumps seed +1000; force stronger prompt: STRONG=1 env;
 *        explicit seed: 0=12345; plains fallback: FALLBACK=1 env.
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
// BASE = the desired-look puddle tile; we REPLACE the puddle with dry ground.
const BASIS_PNG_PATH = path.join(OUT, 'corroded_plain_3.png');
// FALLBACK base (clean plains, corrode from scratch, never had a puddle).
const FALLBACK_WEBP = path.join(ROOT, 'src', 'assets', 'tiles', 'plains', 'plains_0.webp');

const STRONG = process.env.STRONG === '1';
const FALLBACK = process.env.FALLBACK === '1';

// Positive REPLACE instruction. Puddle -> dry corroded ground + MANY clearly
// visible dead plants (Rudi feedback: previous dead plants were too subtle).
const REPLACE_PROMPT = STRONG
  ? 'completely fill the central puddle area with cracked corroded dry rusty ground so no pit, hole or liquid remains, keep small poison-green toxic moss patches spread evenly across the whole tile, and add several clearly visible dead withered dried-out plants and brown brittle shrubs scattered uniformly across the surface'
  : 'replace the central puddle with flat dry corroded rusty ground, keep small poison-green toxic moss patches spread evenly across the whole tile, and add several clearly visible dead withered dried-out plants and brown brittle shrubs scattered uniformly across the surface';

// Fallback: corrode clean plains into the matching toxic terrain (no water).
const FALLBACK_PROMPT = 'corrode this ground into rusty-brown toxic decayed terrain matching a corroded wasteland, sickly poison-green toxic moss patches scattered evenly across the ground, a few sparse dead withered plants, dry cracked soil, no water no puddle';

const VARIANTS = [
  { slot: 0, seed: 30501 },  // seed A
  { slot: 1, seed: 41702 },  // seed B
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

async function postProcess(rawBuf, cfg) {
  const resizedBuf = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha().png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(resizedBuf).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `corroded_plain_${cfg.slot}.png`), masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `corroded_plain_${cfg.slot}_half.png`), half);
  return masked;
}

async function kontext(basisPng, cfg) {
  const dataUri = `data:image/png;base64,${basisPng.toString('base64')}`;
  const prompt = FALLBACK ? FALLBACK_PROMPT : REPLACE_PROMPT;
  console.log(`[kontext] slot ${cfg.slot} seed ${cfg.seed} ${FALLBACK ? 'FALLBACK' : (STRONG ? 'STRONG' : 'replace')}`);
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/kontext', {
    image_url: dataUri,
    prompt,
    num_images: 1,
    safety_tolerance: '5',
    seed: cfg.seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no kontext url for slot ' + cfg.slot + ': ' + JSON.stringify(r).slice(0, 200));
  const out = await download(url);
  return postProcess(out, cfg);
}

const fmtC = (c) => `R${c.r.toFixed(0)} G${c.g.toFixed(0)} B${c.b.toFixed(0)} luma${c.luma.toFixed(1)}`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const basisSrc = FALLBACK ? FALLBACK_WEBP : BASIS_PNG_PATH;
  const basisPng = await sharp(fs.readFileSync(basisSrc)).removeAlpha().png().toBuffer();
  const meta = await sharp(basisPng).metadata();
  console.log(`[basis] ${basisSrc} -> ${meta.width}x${meta.height} png`);
  const basisC = await colorStats(basisPng);
  console.log(`BASIS color[${fmtC(basisC)}]`);
  // reference brightness for consistency check (slots 2/3 puddle tiles)
  try {
    const c2 = await colorStats(fs.readFileSync(path.join(OUT, 'corroded_plain_2.png')));
    const c3 = await colorStats(fs.readFileSync(path.join(OUT, 'corroded_plain_3.png')));
    console.log(`REF slot2 color[${fmtC(c2)}]  slot3 color[${fmtC(c3)}]`);
  } catch {}

  const args = process.argv.slice(2);
  const reroll = args.map(a => a.split('=')[0]);
  const seedOverride = {};
  for (const a of args) { const [t, s] = a.split('='); if (s) seedOverride[t] = parseInt(s, 10); }

  for (const cfg of VARIANTS) {
    const key = String(cfg.slot);
    if (reroll.length && !reroll.includes(key)) continue;
    const seed = seedOverride[key] || (reroll.includes(key) ? cfg.seed + 1000 : cfg.seed);
    try {
      const masked = await kontext(basisPng, { ...cfg, seed });
      const c = await colorStats(masked);
      console.log(`  slot ${cfg.slot}: color[${fmtC(c)}] dLuma(vs base) ${(c.luma - basisC.luma).toFixed(1)}`);
    } catch (e) { console.error(`ERR slot ${cfg.slot}: ${e.message}`); }
  }
  console.log('done');
})();
