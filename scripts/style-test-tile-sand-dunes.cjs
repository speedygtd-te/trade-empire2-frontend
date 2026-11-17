/**
 * Style-test ONLY: 3 strength levels of a desaturated / dusty / dark SAND_DUNES
 * surface tile (DESERT family = wind-blown desert SAND, sibling of canyon/mesa).
 * HERO test, NO integration, NO writes to src/.
 *
 * This sand also becomes the BASE for the future OASIS tile (= desert sand +
 * moisture/green), so it must be a good, EVEN desert sand.
 *
 * Bestand src/assets/tiles/sand_dunes/sand_dunes_0@half.png is VERY saturated
 * glowing GOLD with a strong dominant dune-ripple WAVE pattern (way too vivid,
 * dominant waves that would repeat badly when tiled). Family reference is the
 * finished src/assets/tiles/canyon/canyon_0@half.png + mesa_0@half.png:
 * desaturated muted terracotta / sand-brown, flat dry ground. sand_dunes is the
 * SAND part of that same family: muted dusty sand-brown/beige (a touch lighter /
 * sandier than canyon, but the SAME desaturated world). Ripples may stay (sand
 * character) but must be SUBTLE / even — no dominant wave pattern that reads as a
 * repeat when tiled, no large central dune relief, no bright gold/yellow-orange.
 *
 * Pipeline (verbatim from scripts/generate-biome-assets.ts):
 *   flux-pro v1.1 @512x512 top-down  (FAL_AI_API_KEY in scripts/.env)
 *   -> resize 512x256 (fill, isometric squish)
 *   -> diamond mask (alpha)
 *   Output: assets/style-test/tiles/sand_dunes_<level>.png (+ _half.png + _mosaic.png)
 *
 * Diamond vertices (512x256): top(256,0) right(512,128) bottom(256,256) left(0,128)
 *
 * Usage: node scripts/style-test-tile-sand-dunes.cjs [onlyLevel]
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
// Tileability + anti-hotspot + anti-gradient + FLATNESS constraints, PLUS explicit
// suppression of the dominant dune-ripple WAVE pattern from the Bestand. sand_dunes
// keeps fine sand ripple CHARACTER, but it must stay SUBTLE / even and NOT form a
// repeating wave/dune pattern. DESERT dry sand, NO grass, muted desaturated
// sand-brown/beige matching the canyon/mesa family (NO bright/vivid gold, NO yellow).
const COMMON = 'seamless tileable, edge-to-edge, evenly distributed fine sand ripple texture across the ENTIRE surface INCLUDING the center, the middle of the image is just as textured as the edges, no large dunes, no dominant central feature, no central dune relief, no dominant wave pattern, no large wavy bands, no repeating ripple band pattern, no diagonal bands, no visible seams or hotspots, fairly flat top-down sand, not deep 3D relief, no deep shadows, shallow surface detail only, uniform overall brightness, perfectly even uniform lighting, no light side, no dark side, no gradient, no vertical gradient, no horizontal gradient, no bright sand patch, no bright highlight blob, sand in muted uniform tone, no grass, no plants, no water, heavily desaturated, dusty, dim, muted earthy sand-brown beige palette, no bright gold, no glowing gold, no vivid yellow-orange, no yellow';

const LEVELS = {
  mild: {
    seed: 16500,
    prompt: `${PREFIX}, desaturated muted grey-tan beige desert sand from directly above, dusty dirty fine subtle ripple texture spread perfectly evenly corner to corner and through the center, completely flat with no relief, dim, low saturation, ${COMMON}`,
  },
  medium: {
    seed: 16280,
    prompt: `${PREFIX}, desaturated dusty grey-tan desert sand from directly above, grimy weathered sand with fine even ripples evenly covering the whole surface including the middle, somber low saturation, fairly flat ground, ${COMMON}`,
  },
  dark: {
    seed: 16311,
    prompt: `${PREFIX}, dark desaturated brown-tan desert sand from directly above, dusty shadowed grimy ripples densely and evenly filling the entire frame including the center, ominous dim, heavily muted brown-tan, fairly flat ground, ${COMMON}`,
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
  const full = path.join(OUT, `sand_dunes_${level}.png`);
  fs.writeFileSync(full, masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `sand_dunes_${level}_half.png`), half);
  await buildMosaic(half, path.join(OUT, `sand_dunes_${level}_mosaic.png`));
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
