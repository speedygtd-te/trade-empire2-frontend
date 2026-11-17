/**
 * Style-test ONLY: DARK-MATTE ROUND (Runde 3) — 4 versions of an even DARKER /
 * fully MATTE CAVE_FLOOR surface tile with MORE 3D RELIEF / DEPTH.
 * HERO test, NO integration, NO writes to src/.
 *
 * Correction goal (Rudi-Feedback on Runde 2 d1–d4): d1–d4 still read too
 * METALLIC / GLOSSY, too BRIGHT, and with too little depth. This round must:
 *   - be DARKER (clearly darker than d1–d4, but still readable — a cave floor
 *     in the dark)
 *   - be FULLY MATTE — no specular highlight, no wet reflections, rough dry /
 *     damp-matte non-reflective stone. IMPORTANT (playbook): NO negative prompts
 *     for the unwanted look (negatives reproduce the unwanted thing). Instead
 *     POSITIVE replacement instructions: "rough matte dry stone surface, fully
 *     diffuse non-reflective rock, chalky weathered stone".
 *   - have MORE DEPTH — raised rock slabs / rubble with readable height, deep
 *     dark contact shadows + ambient occlusion in joints / crevices, recessed
 *     sunken cracks.
 * Keep (from existing HTML description): dark alien/barren cave floor, dark-grey
 * to brownish-grey rock plates with cracks and rubble, flat top-down, evenly
 * distributed across the WHOLE surface (no central feature, no central crack, no
 * rings/bands), no global brightness gradient, seamless tileable. NO stalagmites
 * / stalactites / lava / colourful crystals / vegetation. Consistent with the
 * finished set (salt_flat / canyon / mesa / carbon_crust).
 *
 * Pipeline (verbatim from scripts/style-test-tile-cave-floor-depth.cjs):
 *   flux-pro v1.1 @512x512 top-down  (FAL_AI_API_KEY in scripts/.env)
 *   -> 2D brightness equalization (kill any global gradient before squish)
 *   -> resize 512x256 (fill, isometric squish)
 *   -> diamond mask (alpha)
 *   Output: assets/style-test/tiles/cave_floor_<level>.png (+ _half.png + _mosaic.png)
 *   level here = e1..e4 (does NOT overwrite v1..v4 or d1..d4)
 *
 * Diamond vertices (512x256): top(256,0) right(512,128) bottom(256,256) left(0,128)
 *
 * Usage: node scripts/style-test-tile-cave-floor-darkmatte.cjs [onlyLevel]
 *   onlyLevel optional (e1|e2|e3|e4) -> re-roll just that level (seed += 137)
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
// DARK-MATTE round: matte is enforced with POSITIVE replacement instructions
// (rough dry diffuse non-reflective stone) rather than negatives, because
// "no gloss / no shine" negatives tend to reproduce the glossy look. Depth and
// darkness are pushed harder than the depth round. Tileability + anti-hotspot +
// anti-gradient + EVEN-FLOOR constraints retained (these are spatial-layout
// constraints, not material descriptors, so they stay).
const MATTE = 'rough matte dry stone surface, fully diffuse non-reflective rock, chalky weathered crumbly stone, dusty powdery dry rock skin, flat lighting with soft diffuse shadows, the surface absorbs light, deep matte black shadows in the recesses';
const DEPTH = 'strong three-dimensional rocky relief, raised rock slabs and rubble casting deep matte contact shadows, deep crevices and recessed sunken cracks, pronounced depth and ambient occlusion between stones, chunky uneven stone floor with real height variation';
const LAYOUT = 'seamless tileable, edge-to-edge, evenly distributed across the ENTIRE surface including the center, the middle is just as detailed as the edges, no single central feature, no dominant central crack, no ring at edges, no diagonal bands, no diagonal crack lines, no visible seams or hotspots, uniform overall brightness, no light side, no dark side, no gradient, no vertical gradient, no horizontal gradient, no single bright patch';
const KEEP_OUT = 'no stalagmites, no stalactites, no lava, no glow, no colourful crystals, no vegetation, no sand, no grass';
const TONE = 'very dark, deep shadow, heavily desaturated, dirty grimy dim, dark cave floor in low light, dark grey to brownish-grey rock palette, almost black in the crevices';
const COMMON = `${DEPTH}, ${MATTE}, ${LAYOUT}, ${KEEP_OUT}, ${TONE}`;

// 4 NEW fixed seeds (no Math.random), slightly varying stone size / relief
// strength / rubble density.
const LEVELS = {
  e1: {
    seed: 411903,
    // medium slabs, balanced relief, moderate rubble
    prompt: `${PREFIX}, very dark damp-matte desaturated cave floor seen from slightly above, chunky dark-grey rough dry rock slabs of medium size raised at different heights with deep black shadow-filled joints between them and scattered dusty gravel settling into the recesses, grimy dim non-reflective, ${COMMON}`,
  },
  e2: {
    seed: 558231,
    // larger blocky plates, strongest relief, sparser rubble. Re-rolled twice:
    // first too bright/glossy, then too flat. Push HEAVY raised blocky relief +
    // bone-dry powdery surface, dark.
    prompt: `${PREFIX}, dim grimy very dark grey cave ground from slightly above, many large thick blocky broken bone-dry stone plates stacked and tilted at strongly varied heights standing proud above deep recessed crevices with heavy matte black contact shadows pooling in every gap between the raised blocks, a powdery dust coating on the dry rock, some loose chunky rubble, chalk-like crumbly weathered somber, strong chunky three-dimensional relief, the dry rock soaks up the light, ${COMMON}`,
  },
  e3: {
    seed: 901477,
    // many smaller fragments, dense rubble, busy relief. Re-rolled: glossy wet
    // sheen + too flat. Bone-dry powdery, heavier raised rubble for depth.
    prompt: `${PREFIX}, very dark cave floor from slightly above, dense field of smaller fractured bone-dry rock fragments and piled dusty rubble with a powdery chalk dust coating heaped at many different heights casting deep little matte black contact shadows everywhere, deep narrow recessed sunken cracks, grimy ominous dim heavily desaturated weathered crumbly, dry rock that soaks up the light, ${COMMON}`,
  },
  e4: {
    seed: 949072,
    // mixed slab + rubble, deepest crevices, very dark
    prompt: `${PREFIX}, extremely dark damp-matte barren cave floor from slightly above, uneven mix of raised cracked dark rough stone plates and chunky dusty rubble with deep sunken crevices and pronounced matte ambient occlusion shadows pooling in every gap, dirty chalky dry dark grey rock, dim somber fully diffuse non-reflective, ${COMMON}`,
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

// 2D brightness equalization: divide the image by a heavily-blurred copy of
// itself (the low-frequency illumination) and re-multiply by the mean, so any
// global gradient / large bright blob is flattened while local relief detail is
// preserved. Operates on the 512x512 square before the iso squish.
async function equalize(squareBuf) {
  const img = sharp(squareBuf).removeAlpha();
  const { width, height } = await img.metadata();
  const w = width || GEN_SIZE, h = height || GEN_SIZE;
  const base = await img.raw().toBuffer(); // RGB
  // Low-frequency illumination estimate: strong blur (~1/4 of image).
  const blurRadius = Math.round(Math.min(w, h) / 4);
  const lowFreq = await sharp(base, { raw: { width: w, height: h, channels: 3 } })
    .blur(blurRadius).raw().toBuffer();
  // Per-channel global mean.
  const mean = [0, 0, 0];
  const px = w * h;
  for (let i = 0; i < base.length; i += 3) {
    mean[0] += base[i]; mean[1] += base[i + 1]; mean[2] += base[i + 2];
  }
  mean[0] /= px; mean[1] /= px; mean[2] /= px;
  const out = Buffer.alloc(base.length);
  for (let i = 0; i < base.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const lf = lowFreq[i + c] || 1;
      let v = (base[i + c] / lf) * mean[c];
      out[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
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
  const equalized = await equalize(rawBuf);
  const resized = await sharp(equalized).resize(TILE_W, TILE_H, { fit: 'fill' }).png().toBuffer();
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
