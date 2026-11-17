/**
 * Style-test ONLY: 3 strength levels of a desaturated / dirty / dark ASH_FIELD
 * surface tile (VOLCANIC ash, NOT grass). HERO test, NO integration, NO writes to src/.
 *
 * Bestand src/assets/tiles/ash_field/ash_field_0@half.png is blue-tinted with
 * bright light patches/hotspots and large blotches. Goal: desaturated, dirty,
 * DARK sooty volcanic ash (all biomes from now on darker than plains), evenly
 * distributed (no central feature, no hotspots, seamless tileable).
 *
 * Pipeline (verbatim from scripts/generate-biome-assets.ts):
 *   flux-pro v1.1 @512x512 top-down  (FAL_AI_API_KEY in scripts/.env)
 *   -> resize 512x256 (fill, isometric squish)
 *   -> diamond mask (alpha)
 *   Output: assets/style-test/tiles/ash_field_<level>.png (+ _half.png + _mosaic.png)
 *
 * Diamond vertices (512x256): top(256,0) right(512,128) bottom(256,256) left(0,128)
 *
 * Usage: node scripts/style-test-tile-ash-field.cjs [onlyLevel]
 *   onlyLevel optional (mild|medium|dark) -> re-roll just that level (seed += 137)
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
// Common tileability + anti-hotspot constraints. VOLCANIC ash: powdery soot/cinders, no grass.
const COMMON = 'seamless tileable, edge-to-edge, evenly distributed, uniform texture, no large patches, no central feature, no diagonal bands, no visible seams or hotspots, no grass, no plants, no water, no blue tint, lit from upper left, heavily desaturated, dark, dim lighting, muted grey-black ash palette, no bright spots, no glowing embers';

const LEVELS = {
  mild: {
    seed: 13210,
    prompt: `${PREFIX}, desaturated dark grey volcanic ash field from directly above, sooty powdery surface, scattered cinders, grimy, dim, ${COMMON}`,
  },
  medium: {
    seed: 13360,
    prompt: `${PREFIX}, dark sooty volcanic ash from directly above, charcoal grey, scattered black scoria and cinders, very desaturated, somber dim lighting, ${COMMON}`,
  },
  dark: {
    seed: 13510,
    prompt: `${PREFIX}, very dark near-black volcanic ash and soot from directly above, charred ground, faint dark embers, ominous dim, heavily desaturated, ${COMMON}`,
  },
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

async function postProcess(rawBuf, level) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const full = path.join(OUT, `ash_field_${level}.png`);
  fs.writeFileSync(full, masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `ash_field_${level}_half.png`), half);
  await buildMosaic(half, path.join(OUT, `ash_field_${level}_mosaic.png`));
  console.log(`[save] ${full} (+ _half, _mosaic)`);
}

async function genLevel(level, cfg) {
  console.log(`[gen] ${level} (seed ${cfg.seed})`);
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/v1.1', {
    prompt: cfg.prompt, image_size: { width: GEN_SIZE, height: GEN_SIZE },
    num_images: 1, enable_safety_checker: false, seed: cfg.seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no image url for ' + level);
  const square = await download(url);
  await postProcess(square, level);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv[2];
  for (const [level, cfg] of Object.entries(LEVELS)) {
    if (only && only !== level) continue;
    if (only === level) cfg.seed += 137;
    try { await genLevel(level, cfg); } catch (e) { console.error(`ERR ${level}: ${e.message}`); }
  }
  console.log('done');
})();
