/**
 * Style-test ONLY: DEPTH ROUND (Runde 2) — 4 versions of a darker / dirtier
 * CAVE_FLOOR surface tile with MORE 3D RELIEF / DEPTH.
 * HERO test, NO integration, NO writes to src/.
 *
 * Correction goal (Rudi-Feedback): v1–v4 read too FLAT. This round must read
 * with noticeably MORE DEPTH:
 *   - strong three-dimensional rocky relief, raised rock slabs / rubble with
 *     real, readable height
 *   - deep dark contact shadows + ambient occlusion in joints, crevices and
 *     between stones
 *   - height variation, recessed cracks / depressions that read truly "deep"
 * BUT still: dark, dirty, desaturated, consistent with the set (moderately
 * darker), top-down / slightly-above (no side profile), seamless tileable,
 * evenly distributed across the WHOLE surface incl. center (NO single central
 * feature, NO dominant central crack, NO ring at edges, NO diagonal bands),
 * NO global brightness gradient (no light side / dark side).
 * So: locally lots of relief & shadow, globally uniform & tileable.
 * NO stalagmites / stalactites / lava / glow / crystals / vegetation.
 *
 * Pipeline (verbatim from scripts/style-test-tile-cave-floor.cjs):
 *   flux-pro v1.1 @512x512 top-down  (FAL_AI_API_KEY in scripts/.env)
 *   -> resize 512x256 (fill, isometric squish)
 *   -> diamond mask (alpha)
 *   Output: assets/style-test/tiles/cave_floor_<level>.png (+ _half.png + _mosaic.png)
 *   level here = d1..d4 (does NOT overwrite v1..v4)
 *
 * Diamond vertices (512x256): top(256,0) right(512,128) bottom(256,256) left(0,128)
 *
 * Usage: node scripts/style-test-tile-cave-floor-depth.cjs [onlyLevel]
 *   onlyLevel optional (d1|d2|d3|d4) -> re-roll just that level (seed += 137)
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
// DEPTH round: flatness-forcing negatives REMOVED. Depth-promoting terms ADDED.
// Tileability + anti-hotspot + anti-gradient + EVEN-FLOOR constraints retained.
// Local relief & shadow must be heavy, but global distribution stays uniform and
// tileable. NO stalagmites / stalactites, NO lava / glow / crystals / vegetation.
const COMMON = 'strong three-dimensional rocky relief, raised rock slabs and rubble casting deep contact shadows, deep crevices and recessed cracks, pronounced depth and ambient occlusion between stones, chunky uneven stone floor with height variation, dramatic but evenly distributed shadowing, seamless tileable, edge-to-edge, evenly distributed across the ENTIRE surface including the center, the middle is just as detailed as the edges, no single central feature, no dominant central crack, no ring at edges, no diagonal bands, no diagonal crack lines, no visible seams or hotspots, uniform overall brightness, no light side, no dark side, no gradient, no vertical gradient, no horizontal gradient, no single bright patch, no bright highlight blob, NO stalagmites, no stalactites, no lava, no glow, no colourful crystals, no water pools highlight, no bright spots, no shine, no gloss, no glossy highlights, matte, no sand, no grass, no plants, heavily desaturated, dirty, grimy, dim, dark cave floor, damp matte dark grey to brownish-grey rock palette';

// 4 NEW fixed seeds (no Math.random), slightly varying stone size / relief
// strength / rubble density.
const LEVELS = {
  d1: {
    seed: 318204,
    // medium stone slabs, balanced relief, moderate rubble
    prompt: `${PREFIX}, dark damp desaturated cave floor seen from slightly above, chunky dark-grey rock slabs of medium size raised at different heights with deep shadow-filled joints between them and scattered gravel settling into the recesses, grimy dim, ${COMMON}`,
  },
  d2: {
    seed: 526731,
    // larger blocky plates, strongest relief, sparser rubble
    prompt: `${PREFIX}, dim grimy dark brownish-grey cave ground from slightly above, large blocky broken stone plates standing proud at varied heights with deep recessed crevices and heavy contact shadows in the gaps, only sparse loose rubble, damp matte somber, ${COMMON}`,
  },
  d3: {
    seed: 740118,
    // many smaller fragments, dense rubble, busy relief
    prompt: `${PREFIX}, dark cave floor from slightly above, dense field of smaller fractured rock fragments and piled rubble at many different heights casting deep little contact shadows everywhere, deep narrow recessed cracks, grimy ominous dim heavily desaturated weathered damp matte, ${COMMON}`,
  },
  d4: {
    seed: 953627,
    // mixed slab + rubble, deepest crevices, very dark
    prompt: `${PREFIX}, very dark damp barren cave floor from slightly above, uneven mix of raised cracked dark stone plates and chunky rubble with deep sunken crevices and pronounced ambient occlusion shadows pooling in every gap, dirty matte dark grey rock, dim somber, ${COMMON}`,
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
  const full = path.join(OUT, `cave_floor_${level}.png`);
  fs.writeFileSync(full, masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `cave_floor_${level}_half.png`), half);
  await buildMosaic(half, path.join(OUT, `cave_floor_${level}_mosaic.png`));
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
