/**
 * Style-test ONLY: caldera_mild FINE-TUNE ("mild2"). Rudi likes caldera_mild
 * (dark volcanic crater-floor rock, sparse orange lava-vein net, no central
 * pit, tileable) but wants SOMEWHAT MORE lava/magma — between mild (sparse)
 * and medium (dense), closer to mild. NO integration, NO writes to src/.
 *
 * Generates 3 seeds (a/b/c) of a MODERATE-lava caldera-floor tile.
 *
 * Pipeline (verbatim from scripts/style-test-tile-caldera.cjs):
 *   flux-pro v1.1 @512x512 top-down  (FAL_AI_API_KEY in scripts/.env)
 *   -> resize 512x256 (fill, isometric squish)
 *   -> diamond mask (alpha)
 *   Output: assets/style-test/tiles/caldera_mild2_<a|b|c>.png (+ _half.png + _mosaic.png)
 *
 * Diamond vertices (512x256): top(256,0) right(512,128) bottom(256,256) left(0,128)
 *
 * Usage: node scripts/style-test-tile-caldera-mild2.cjs [onlyVariant]
 *   onlyVariant optional (a|b|c) -> re-roll just that variant (seed += 137)
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

// Prefix verbatim from generate-biome-assets.ts so style matches inventory pipeline.
const PREFIX = 'top-down aerial photograph, terrain texture filling entire image edge to edge, no sky, no horizon, no borders, no vignette, The Expanse sci-fi aesthetic, realistic';
// Same anti-crater / anti-hotspot / tileability constraints as the base script.
const COMMON = 'seamless tileable, edge-to-edge, evenly distributed across the ENTIRE surface including center, no central crater, no central pit, no large central feature, no diagonal bands, no visible seams or hotspots, uniform distribution, glowing cracks and rock evenly spread over the whole surface including the middle, no single bright glow spot, glow as a distributed network of veins, no grass, no plants, no water, no blue tint, lit from upper left, heavily desaturated rock, dark, dim lighting, muted charcoal volcanic palette, orange glowing lava cracks';

// mild2 = mild base prompt but with MODERATE (not sparse) lava amount.
const MILD2_PROMPT = `${PREFIX}, dark volcanic crater floor rock with a MODERATE amount of glowing orange-red lava cracks and magma veins, somewhat more lava than sparse, evenly distributed across the entire surface including center, more molten glow but still mostly dark rock, no central pit, no hotspot, seamless tileable, no blue, desaturated charcoal stone, dim, ${COMMON}`;

const VARIANTS = {
  a: { seed: 22130 },   // mild base seed
  b: { seed: 22130 + 211 },
  c: { seed: 22130 + 433 },
};

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

// Build an interlocking 3x3 diamond mosaic from a half-tile (256x128) buffer.
async function buildMosaic(halfBuf, outPath) {
  const W = 256, H = 128;
  const canvasW = W * 3, canvasH = H * 3;
  const placements = [];
  for (let r = 0; r < 7; r++) {
    const odd = r % 2 === 1;
    for (let col = 0; col < 4; col++) {
      const x = col * W + (odd ? W / 2 : 0) - W / 2;
      const y = r * (H / 2) - H / 2;
      if (x > canvasW || y > canvasH || x + W < 0 || y + H < 0) continue;
      placements.push({ input: halfBuf, left: Math.round(x), top: Math.round(y) });
    }
  }
  await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 } } })
    .composite(placements).png().toFile(outPath);
}

async function postProcess(rawBuf, variant) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const full = path.join(OUT, `caldera_mild2_${variant}.png`);
  fs.writeFileSync(full, masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `caldera_mild2_${variant}_half.png`), half);
  await buildMosaic(half, path.join(OUT, `caldera_mild2_${variant}_mosaic.png`));
  console.log(`[save] ${full} (+ _half, _mosaic)`);
}

async function genVariant(variant, cfg) {
  console.log(`[gen] mild2_${variant} (seed ${cfg.seed})`);
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/v1.1', {
    prompt: MILD2_PROMPT, image_size: { width: GEN_SIZE, height: GEN_SIZE },
    num_images: 1, enable_safety_checker: false, seed: cfg.seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no image url for ' + variant);
  const square = await download(url);
  await postProcess(square, variant);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv[2];
  for (const [variant, cfg] of Object.entries(VARIANTS)) {
    if (only && only !== variant) continue;
    if (only === variant) cfg.seed += 137;
    try { await genVariant(variant, cfg); } catch (e) { console.error(`ERR ${variant}: ${e.message}`); }
  }
  console.log('done');
})();
