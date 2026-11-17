/**
 * PRODUCTION: 3 FRESH txt2img sand_dunes variants for slots 1/2/3.
 *
 * Erkenntnis aus dem letzten Lauf: i2i / Kontext-Edit auf der flachen Basis
 * re-interpretiert die Rippel IMMER als erhabenes Dünen-Relief (helle Kämme,
 * dunkle Schatten). txt2img mit dem dark-Prompt liefert dagegen FLACHE Sand-
 * Tiles (so entstanden sand_dunes_medium/dark). Also: 3 frische txt2img-
 * Generierungen (verschiedene Seeds) mit DEM dark-Prompt aus
 * style-test-tile-sand-dunes.cjs.
 *
 * Slot 0 (= sand_dunes_dark, abgenommene Basis) bleibt unverändert. Diese 3
 * Generierungen werden Slots 1/2/3; bei der Integration werden 2 davon geflopt.
 *
 * Pipeline (verbatim aus style-test-tile-sand-dunes.cjs):
 *   flux-pro v1.1 @512x512 top-down  (FAL_AI_API_KEY in scripts/.env)
 *   -> resize 512x256 (fill, iso squish)
 *   -> diamond mask (alpha)
 *   -> 3x3 overlap mosaic + in-diamond meanLum print (Helligkeits-Check vs Basis ~90)
 *
 * Outputs (style-test workspace only — KEIN write nach src/):
 *   assets/style-test/tiles/sand_dunes_var_v{1,2,3}.png (+ _mosaic.png)
 *
 * Usage: node scripts/sand-dunes-fresh-variants.cjs [v1 v2 v3]
 *   re-roll: bumpt seed um +1000 (oder vN=12345 fuer expliziten Seed)
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

const TILE_W = 512, TILE_H = 256, GEN_SIZE = 512;
const OUT = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');

// PREFIX + COMMON + dark-Prompt VERBATIM aus style-test-tile-sand-dunes.cjs.
const PREFIX = 'top-down aerial photograph, terrain texture filling entire image edge to edge, no sky, no horizon, no borders, no vignette, The Expanse sci-fi aesthetic, realistic';
const COMMON = 'seamless tileable, edge-to-edge, evenly distributed fine sand ripple texture across the ENTIRE surface INCLUDING the center, the middle of the image is just as textured as the edges, no large dunes, no dominant central feature, no central dune relief, no dominant wave pattern, no large wavy bands, no repeating ripple band pattern, no diagonal bands, no visible seams or hotspots, fairly flat top-down sand, not deep 3D relief, no deep shadows, shallow surface detail only, uniform overall brightness, perfectly even uniform lighting, no light side, no dark side, no gradient, no vertical gradient, no horizontal gradient, no bright sand patch, no bright highlight blob, sand in muted uniform tone, no grass, no plants, no water, heavily desaturated, dusty, dim, muted earthy sand-brown beige palette, no bright gold, no glowing gold, no vivid yellow-orange, no yellow';
const PROMPT = `${PREFIX}, dark desaturated brown-tan desert sand from directly above, dusty shadowed grimy ripples densely and evenly filling the entire frame including the center, ominous dim, heavily muted brown-tan, fairly flat ground, ${COMMON}`;

// 3 frische Slots, distinkte Seeds (weit weg vom dark-style-test-seed 16311).
const VARIANTS = [
  { tag: 'v1', seed: 52110 },
  { tag: 'v2', seed: 53470 },
  { tag: 'v3', seed: 54690 },
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

// In-diamond mean luma (opaque pixels only) — Helligkeitsvergleich zur Basis (~90).
async function inDiamondLuma(maskedBuf) {
  const { data, info } = await sharp(maskedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let s = 0, c = 0;
  for (let i = 0; i < data.length; i += ch) {
    if (data[i + 3] < 200) continue;
    s += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    c++;
  }
  return c ? s / c : 0;
}

async function postProcess(rawBuf, tag) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const full = path.join(OUT, `sand_dunes_var_${tag}.png`);
  fs.writeFileSync(full, masked);
  const lum = await inDiamondLuma(masked);
  console.log(`[save] ${full}  meanLum=${lum.toFixed(1)} (Basis ~90)`);
  return masked;
}

async function gen(cfg) {
  console.log(`[gen] ${cfg.tag} (seed ${cfg.seed})`);
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/v1.1', {
    prompt: PROMPT, image_size: { width: GEN_SIZE, height: GEN_SIZE },
    num_images: 1, enable_safety_checker: false, seed: cfg.seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no image url for ' + cfg.tag);
  const square = await download(url);
  return postProcess(square, cfg.tag);
}

// 3x3 overlap-packed diamond mosaic for tileability / uniformity inspection.
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
  console.log(`[mosaic] ${outPath}`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const args = process.argv.slice(2);
  const reroll = args.map(a => a.split('=')[0]);
  const seedOverride = {};
  for (const a of args) { const [t, s] = a.split('='); if (s) seedOverride[t] = parseInt(s, 10); }
  for (const cfg of VARIANTS) {
    if (reroll.length && !reroll.includes(cfg.tag)) continue;
    const seed = seedOverride[cfg.tag] || (reroll.includes(cfg.tag) ? cfg.seed + 1000 : cfg.seed);
    try {
      const masked = await gen({ ...cfg, seed });
      await mosaic(masked, path.join(OUT, `sand_dunes_var_${cfg.tag}_mosaic.png`));
    } catch (e) { console.error(`ERR ${cfg.tag}: ${e.message}`); }
  }
  console.log('done');
})();
