/**
 * Style-test ONLY: 3 strength levels of a desaturated / dusty / dark CANYON
 * surface tile (DESERT family = dry canyon SEDIMENTARY ROCK, NOT grass).
 * HERO test, NO integration, NO writes to src/.
 *
 * Bestand src/assets/tiles/canyon/canyon_0@half.png is a SATURATED red-orange
 * Grand-Canyon look with strong 3D relief and a dominant central crevice/ravine
 * (deep shadows). As a mixed-tiled ground tile that central canyon relief reads
 * badly and repeats. Goal: KEEP the canyon character (layered sediment bands,
 * cracked dry stone, eroded) but render it as an EVEN, fairly FLAT top-down
 * ground texture — NO deep central ravine, NO dominant central feature.
 * DESERT palette: muted red-brown / terracotta / dust (NOT the bright orange-red
 * of the Bestand). Evenly lit (no light side / dark side gradient — check on the
 * mosaic), no single bright rock block (anti-hotspot), seamless tileable.
 *
 * Pipeline (verbatim from scripts/generate-biome-assets.ts):
 *   flux-pro v1.1 @512x512 top-down  (FAL_AI_API_KEY in scripts/.env)
 *   -> resize 512x256 (fill, isometric squish)
 *   -> diamond mask (alpha)
 *   Output: assets/style-test/tiles/canyon_<level>.png (+ _half.png + _mosaic.png)
 *
 * Diamond vertices (512x256): top(256,0) right(512,128) bottom(256,256) left(0,128)
 *
 * Usage: node scripts/style-test-tile-canyon.cjs [onlyLevel]
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
// Tileability + anti-hotspot + anti-gradient + FLATNESS constraints. CRITICAL:
// canyon sediment/rock character persists EVENLY across the whole surface, but
// rendered as a fairly FLAT top-down ground texture, NOT a deep 3D canyon relief
// and with NO dominant central ravine. DESERT dry rock, NO grass, muted red-brown.
const COMMON = 'seamless tileable, edge-to-edge, evenly distributed sediment and rock texture across the ENTIRE surface INCLUDING the center, the middle of the image is just as textured as the edges, no large central canyon, no central pit, no central ravine, no central crevice, no dominant central feature, no diagonal bands, no visible seams or hotspots, fairly flat top-down ground, not deep 3D relief, no deep shadows, shallow surface detail only, uniform overall brightness, perfectly even uniform lighting, no light side, no dark side, no gradient, no vertical gradient, no horizontal gradient, no single bright rock block, no bright highlight blob, rock in muted uniform tone, no grass, no plants, no water, heavily desaturated, dusty, dim, muted earthy red-brown terracotta palette, no bright orange, no vivid orange-red, no yellow';

const LEVELS = {
  mild: {
    seed: 19024,
    prompt: `${PREFIX}, desaturated dusty red-brown layered canyon sedimentary rock from directly above, muted terracotta cracked dry stone with shallow eroded layering spread evenly corner to corner and through the center, fairly flat, dim, dirty, ${COMMON}`,
  },
  medium: {
    seed: 18280,
    prompt: `${PREFIX}, desaturated dark red-brown weathered canyon rock from directly above, dusty muted sediment layers and grimy cracked stone evenly covering the whole surface including the middle, somber low saturation, fairly flat ground, ${COMMON}`,
  },
  dark: {
    seed: 19311,
    prompt: `${PREFIX}, very dark desaturated brown canyon rock from directly above, dusty shadowed sediment and grimy cracked stone densely and evenly filling the entire frame including the center, ominous dim, heavily muted red-brown, fairly flat ground, ${COMMON}`,
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
  const full = path.join(OUT, `canyon_${level}.png`);
  fs.writeFileSync(full, masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `canyon_${level}_half.png`), half);
  await buildMosaic(half, path.join(OUT, `canyon_${level}_mosaic.png`));
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
