/**
 * PRODUCTION: 4 FRESH acid_lake variants in the approved "mild" look, but with
 * HARDENED uniform distribution (the approved mild had an uneven diagonal foam
 * band / bright streak — that would inherit through i2i, so we DO NOT derive
 * from it. We re-generate fresh with the mild prompt + tightened anti-streak /
 * anti-band constraints).
 *
 * Look (keep): murky desaturated dark green-brown acidic liquid, dirty foam,
 *   grimy, no neon, no bright green, dark / somber (all biomes darker than plains).
 * Distribution (hardened): perfectly even uniform foam/scum across the WHOLE
 *   surface, NO diagonal streaks, NO bright band, NO large patches, NO central
 *   feature, seamless tileable edge-to-edge.
 * Liquid -> no grass tufts, no upright/overhead problem (flip axis uncritical).
 *
 * Pipeline (verbatim from style-test-tile-acid-lake.cjs):
 *   flux-pro v1.1 @512x512 top-down  (FAL_AI_API_KEY in scripts/.env)
 *   -> resize 512x256 (fill, iso squish)
 *   -> diamond mask (alpha)
 *   -> 3x3 overlap mosaic for uniformity inspection
 *
 * Outputs (style-test workspace only — NO writes to src/):
 *   assets/style-test/tiles/acid_lake_var_v{0,1,2,3}.png (+ _mosaic.png)
 *
 * Usage: node scripts/acid-lake-variants-prod.cjs [v0 v1 ...]   (re-roll list)
 *        re-roll bumps seed by +1000 (or pass v0=12345 to set explicit seed)
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

// Prefix verbatim from style-test-tile-acid-lake.cjs.
const PREFIX = 'top-down aerial photograph, terrain texture filling entire image edge to edge, no sky, no horizon, no borders, no vignette, The Expanse sci-fi aesthetic, realistic';
// mild look + HARDENED uniformity. Anti-streak / anti-band is the priority.
const UNIFORM = 'perfectly even uniform distribution of foam and scum across the entire surface, homogeneous murky liquid texture, fine even speckle everywhere, NO diagonal streaks, NO bright band, NO bright streak, NO large patches, NO central feature, NO swirl, no visible seams or hotspots, seamless tileable edge to edge';
const LOOK = 'murky desaturated dark green-brown acidic liquid, dull sickly green-brown toxic liquid, dirty foam, grimy scummy surface, dark, dim somber lighting, heavily desaturated, muted dirty palette, no neon, no bright green, no glowing green, no grass, no plants, lit evenly from upper left';
const PROMPT = `${PREFIX}, murky desaturated acidic pool from directly above, ${LOOK}, ${UNIFORM}`;

// 4 fresh slots, distinct seeds (kept far apart from the style-test mild seed 11210).
const VARIANTS = [
  { tag: 'v0', seed: 40110 },
  { tag: 'v1', seed: 41230 },
  { tag: 'v2', seed: 42470 },
  { tag: 'v3', seed: 43690 },
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

async function postProcess(rawBuf, tag) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const full = path.join(OUT, `acid_lake_var_${tag}.png`);
  fs.writeFileSync(full, masked);
  console.log(`[save] ${full}`);
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
  const cols = 3, rows = 3;
  const place = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) place.push({ cx: (c - r) * HW, cy: (c + r) * HH });
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
      await mosaic(masked, path.join(OUT, `acid_lake_var_${cfg.tag}_mosaic.png`));
    } catch (e) { console.error(`ERR ${cfg.tag}: ${e.message}`); }
  }
  console.log('done');
})();
