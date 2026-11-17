/**
 * Re-generate a NEW basalt_plain BASIS (Slot 0) WITHOUT the bright-rock hotspot.
 *
 * The previously approved basalt_plain_mild (Rudi's pick) has a too-prominent
 * light stone / rock in the upper-left area that becomes a recurring hotspot
 * when tiled. Keep the EXACT same mild look — desaturated dark slate-grey
 * columnar basalt, hexagonal columnar pattern, no blue tint, light ash dust —
 * but make brightness perfectly UNIFORM across all columns: no single bright
 * stone, no highlight blob, no hotspot.
 *
 * Pipeline (verbatim from style-test-tile-basalt-plain.cjs):
 *   flux-pro v1.1 @512x512 top-down  (FAL_AI_API_KEY in scripts/.env)
 *   -> resize 512x256 (fill, isometric squish)
 *   -> diamond mask (alpha)
 *   -> 3x3 interlocking mosaic for hotspot inspection
 *
 * Generates 2-3 seeds (candidates). Each saved as a candidate + mosaic; the
 * best hotspot-free one is then copied to basalt_plain_basis.png manually
 * (see basalt-plain-promote-basis.cjs / agent step).
 *
 * Outputs (style-test workspace only — NO writes to src/):
 *   assets/style-test/tiles/basalt_plain_cand_<seed>.png  (+ _mosaic.png)
 *
 * Usage: node scripts/basalt-plain-new-basis.cjs [seedA seedB seedC ...]
 *   default seeds: 71011 72013 73017
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

// Verbatim mild look from style-test-tile-basalt-plain.cjs ...
const PREFIX = 'top-down aerial photograph, terrain texture filling entire image edge to edge, no sky, no horizon, no borders, no vignette, The Expanse sci-fi aesthetic, realistic';
const COMMON = 'seamless tileable, edge-to-edge, evenly distributed, uniform hexagonal basalt column pattern across entire surface, no large patches, no central feature, no diagonal bands, no visible seams or hotspots, no grass, no plants, no water, no blue tint, lit from upper left, heavily desaturated, dark, dim lighting, muted grey-black basalt palette';
// ... PLUS the new mandatory anti-hotspot constraints (uniform column brightness).
const ANTI_HOTSPOT = 'perfectly uniform basalt column texture, all columns equal tone, NO single bright rock, NO single light rock, NO prominent light stone, NO highlight blob, evenly distributed brightness, no hotspot, seamless tileable edge-to-edge';
const PROMPT = `${PREFIX}, desaturated dark grey columnar basalt rock from directly above, hexagonal volcanic rock columns, light volcanic ash dust, grimy, dim, ${ANTI_HOTSPOT}, ${COMMON}`;

const DEFAULT_SEEDS = [71011, 72013, 73017];

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

// Interlocking 3x3 diamond mosaic (same geometry as derive script).
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

async function genSeed(seed) {
  console.log(`[gen] cand seed ${seed}`);
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/v1.1', {
    prompt: PROMPT, image_size: { width: GEN_SIZE, height: GEN_SIZE },
    num_images: 1, enable_safety_checker: false, seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no image url for seed ' + seed);
  const square = await download(url);
  const resized = await sharp(square).resize(TILE_W, TILE_H, { fit: 'fill' }).png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const full = path.join(OUT, `basalt_plain_cand_${seed}.png`);
  fs.writeFileSync(full, masked);
  console.log(`[save] ${full}`);
  await mosaic(masked, path.join(OUT, `basalt_plain_cand_${seed}_mosaic.png`));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const seeds = process.argv.slice(2).map(Number).filter(Boolean);
  const list = seeds.length ? seeds : DEFAULT_SEEDS;
  for (const s of list) {
    try { await genSeed(s); } catch (e) { console.error(`ERR seed ${s}: ${e.message}`); }
  }
  console.log('done');
})();
