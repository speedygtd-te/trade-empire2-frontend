/**
 * STYLE-TEST ONLY (NO src/ writes, NO cap sync, NO git):
 * corroded_plain (TOXIC biome) variants via FLUX PRO KONTEXT edit.
 *
 * Rudi's idea: RECYCLE plains -> corrode it. Take the accepted plains_0 tile
 * (muddy green-brown ground with grass tufts) and run a SIMPLE additive
 * corrosion edit on it. NO negative prompts (negatives reintroduce concepts).
 * The plains ground stays recognisable as a "broken plain" but poisoned:
 * rusty chemical stains, sickly toxic discoloration, dead vegetation, acidic
 * crust. Must sit in the TOXIC family (related to acid_lake = murky desaturated
 * dark green-brown acid) -> muted/desaturated toxic, NOT neon.
 *
 * Model: fal-ai/flux-pro/kontext (flux pro edit, image+prompt).
 * Input: src/assets/tiles/plains/plains_0.webp -> PNG in-memory as image_url.
 *
 * PUDDLE VARIANCE (Rudi): the corroded ground is good, but SOME slots should
 * additionally carry a small toxic PUDDLE (variance — not every tile equal, the
 * grid mixes corroded soil + occasional puddles, ~2 of 4). Puddle must be SMALL
 * and OFF-CENTER (a centered puddle would create a recurring central motif when
 * tiled). 2 of 4 slots carry a puddle:
 *
 * 4-slot build:
 *   corroded_plain_0 = corrosion edit, NO puddle (seed A)            original
 *   corroded_plain_1 = corrosion edit, NO puddle (seed B)            original
 *   corroded_plain_2 = corrosion edit + small off-center puddle (C)  .flop (L<->R)
 *   corroded_plain_3 = corrosion edit + small off-center puddle (D)  .flop (L<->R)
 *
 * Per slot: kontext edit -> resize/format 512x256 -> diamond mask -> (2,3) flop.
 *
 * Outputs (style-test workspace only):
 *   assets/style-test/tiles/corroded_plain_{0..3}.png       (512x256 masked)
 *   assets/style-test/tiles/corroded_plain_{0..3}_half.png  (256x128)
 *
 * Usage: node scripts/corroded-plain-edit-variants.cjs [0 1 2 3]
 *        re-roll a slot bumps its seed +1000; explicit: 0=12345
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
const BASIS_WEBP = path.join(ROOT, 'src', 'assets', 'tiles', 'plains', 'plains_0.webp');

// SIMPLE additive corrosion edit. NO negatives. Keep the plains ground form,
// poison it: rusty stains, sickly toxic discoloration, dead vegetation, acid crust.
const BASE_PROMPT = 'make this ground corroded and toxic: rusty chemical stains, sickly desaturated yellow-green toxic discoloration, dead withered vegetation, patches of acidic crust, muddy poisoned soil';
// Puddle add-on: SMALL + OFF-CENTER so tiling does not produce a recurring
// central water motif. Keep it murky/desaturated (TOXIC family, not neon).
const PUDDLE_SUFFIX = ' with a small off-center puddle of murky toxic green-brown liquid';

const VARIANTS = [
  { slot: 0, seed: 71001, flop: false, puddle: false },
  { slot: 1, seed: 84002, flop: false, puddle: false },
  { slot: 2, seed: 93003, flop: true, puddle: true },
  { slot: 3, seed: 60004, flop: true, puddle: true },
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
  let resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha();
  if (cfg.flop) resized = resized.flop();
  const resizedBuf = await resized.png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(resizedBuf).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `corroded_plain_${cfg.slot}.png`), masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `corroded_plain_${cfg.slot}_half.png`), half);
  return masked;
}

async function kontext(basisPng, cfg) {
  const dataUri = `data:image/png;base64,${basisPng.toString('base64')}`;
  const prompt = cfg.puddle ? BASE_PROMPT + PUDDLE_SUFFIX : BASE_PROMPT;
  console.log(`[kontext] slot ${cfg.slot} seed ${cfg.seed} flop=${cfg.flop} puddle=${cfg.puddle}`);
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
  const basisPng = await sharp(fs.readFileSync(BASIS_WEBP)).png().toBuffer();
  const meta = await sharp(basisPng).metadata();
  console.log(`[basis] ${BASIS_WEBP} -> ${meta.width}x${meta.height} png`);
  const basisC = await colorStats(basisPng);
  console.log(`BASIS(plains_0) color[${fmtC(basisC)}]`);

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
      console.log(`  slot ${cfg.slot}: color[${fmtC(c)}] dLuma ${(c.luma - basisC.luma).toFixed(1)}`);
    } catch (e) { console.error(`ERR slot ${cfg.slot}: ${e.message}`); }
  }
  console.log('done');
})();
