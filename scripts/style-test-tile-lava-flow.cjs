/**
 * Style-test ONLY: 4 intensity levels (l1=mild .. l4=darkest/hottest-within-corridor)
 * of a LAVA_FLOW VOLCANIC surface tile. HERO test, NO integration, NO writes to src/.
 *
 * Recycling base: lava_flow is a sibling of the finished basalt_plain
 * (src/assets/tiles/basalt_plain/ = dark charcoal matte cracked basalt plates) and
 * of obsidian_ridge. We anchor on that cooled-rock palette/style but take ONE small
 * step further on its own: cooled black/charcoal basalt crust DOMINATES, with a
 * subdued DEEP EMBER glow (deep orange-red, restrained, NOT neon, NOT yellow-white)
 * inside an EVEN NETWORK of thin glowing cracks distributed across the WHOLE tile.
 * No single central river, no diagonal band. The cooled crust drinks the light; the
 * glow is a minority of the surface — like cooling lava seen from above at night.
 *
 * Goal per CLAUDE.md playbook:
 *   - dark, dirty, matte-dominated, desaturated, consistent with the VOLCANIC set
 *     (basalt_plain / obsidian_ridge / caldera / ash_field)
 *   - cooled matte basalt crust + subdued deep-ember glow in an even network of
 *     cracks across the WHOLE surface (no central feature, no central river, no
 *     diagonal band), no global brightness gradient, seamless tileable
 *   - the only light emission is the self-illuminated deep-ember glow inside the
 *     cracks; the rock itself is fully matte non-reflective
 *   - matte / dark / no-central look enforced via POSITIVE replacement instructions
 *     only (no negative prompts for the unwanted neon/river look)
 *
 * Pipeline (verbatim from scripts/style-test-tile-obsidian-ridge.cjs):
 *   flux-pro v1.1 @512x512 top-down  (FAL_AI_API_KEY in scripts/.env)
 *   -> 2D brightness equalization (kill any global gradient before squish)
 *   -> resize 512x256 (fill, isometric squish)
 *   -> diamond mask (alpha)
 *   Output: assets/style-test/tiles/lava_flow_<level>.png (+ _half + _mosaic)
 *   level = l1..l4
 *
 * Diamond vertices (512x256): top(256,0) right(512,128) bottom(256,256) left(0,128)
 *
 * Usage: node scripts/style-test-tile-lava-flow.cjs [onlyLevel]
 *   onlyLevel optional (l1|l2|l3|l4) -> re-roll just that level (seed += 137)
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

// MATTE-DOMINATED enforced with POSITIVE replacement instructions. The cooled basalt
// rock between the cracks is fully matte; the only light comes from the deep-ember
// glow inside the cracks themselves (self-illuminated lava, not a reflection). We
// describe the wanted look directly rather than negating the unwanted mirror look.
const MATTE = 'matte-dominated dark surface, the cooled basalt rock between the cracks is rough dry fully diffuse non-reflective matte stone, the only light emission is the subdued self-illuminated deep-ember glow inside the cracks themselves not a reflection, no mirror reflection, no specular highlight, no bright glare, flat soft diffuse lighting on the rock, deep matte black shadows on the cooled crust';
const LAVA = 'cooled black charcoal basaltic crust covering most of the ground, broken by an even network of thin glowing cracks holding a subdued deep ember glow deep orange-red, the cooled dark crust sits flush across the whole surface and dominates the area, the dim ember glow is contained inside the thin seams between the crust plates';
const LAYOUT = 'seamless tileable, edge-to-edge, evenly distributed across the ENTIRE surface including the center, the middle is just as detailed as the edges, no single central feature, no dominant central crack, no central river, no central ridge, no ring at edges, no diagonal bands, no diagonal crack lines, no visible seams or hotspots, uniform overall brightness, no light side, no dark side, no gradient, no vertical gradient, no horizontal gradient, no single bright patch';
const KEEP_OUT = 'no neon, no bright yellow-white hot lava, no white-hot glow, no fire flames, no smoke plume, no single central river, no diagonal lava band, no colourful crystals, no purple gemstones, no vegetation, no sand, no water, no ice';
const TONE = 'very dark, deep shadow, heavily desaturated cooled rock dark grey-black to charcoal, the glow is deep ember deep orange-red restrained and dim, explicitly not neon orange not bright yellow not white-hot, the dark cooled crust dominates the tile and the glow is a minority of the surface, ominous somber';
const COMMON = `${LAVA}, ${MATTE}, ${LAYOUT}, ${KEEP_OUT}, ${TONE}`;

// 4 fixed seeds (no Math.random), l1->l4 increasing glow/heat intensity from MILD to
// STRONGEST, but all stay within the dark/subdued corridor (even l4 is dim deep ember).
const LEVELS = {
  // l1 MILD: closest to plain cooled basalt — mostly black crust, only sparse thin
  // faint deep-ember hairline cracks, glow very dim. Lighter charcoal end.
  l1: {
    seed: 714203,
    prompt: `${PREFIX}, dark desaturated charcoal volcanic ground seen from directly above, almost all cooled matte black basalt crust with only a sparse even scatter of thin faint deep-ember hairline cracks holding a very dim restrained deep orange-red glow, only a step warmer than plain cooled basalt, grimy dim non-reflective overall, lighter charcoal end of the range, ${COMMON}`,
  },
  // l2 MEDIUM: a clear even network of thin deep orange-red ember cracks between the
  // basalt plates, cooled crust still dominates, darker than l1.
  l2: {
    seed: 829517,
    prompt: `${PREFIX}, very dark desaturated cooled volcanic crust from directly above, a clear even network of thin deep orange-red ember cracks threading between the matte black basalt plates across the whole surface, the cooled dark crust still dominates, the ember glow subdued and dim, somber heavily desaturated, ${COMMON}`,
  },
  // l3 DARK: denser even network of deeper ember glow in the cracks, wider glowing
  // seams, deep-black cooled crust, glow still deep/restrained not neon.
  l3: {
    seed: 936841,
    prompt: `${PREFIX}, near-black cooled volcanic ground from directly above, a dense even network of deep ember glowing cracks with wider glowing seams pooling a deeper restrained deep orange-red glow between the deep matte-black basalt plates, the cooled crust deep black and dominant, the glow deep and contained never neon, ominous very dark heavily desaturated grimy, ${COMMON}`,
  },
  // l4 DARKEST / HOTTEST-WITHIN-CORRIDOR: deepest most intense localized deep-ember
  // glow pooling in the recesses of a near-black cooled crust, surface drinks the
  // light, dim somber, deepest contrast — still deep ember red-orange, never neon.
  l4: {
    seed: 158279,
    prompt: `${PREFIX}, extremely dark almost-black cooled volcanic crust from directly above, the deepest most intense localized deep-ember glow deep orange-red pooling in the recesses and seams of a near-black cooled basalt crust, the surrounding matte black crust drinks the light around the glow, deepest contrast between the dim ember seams and the pitch-dark cooled rock, dim somber fully matte-dominated heavily desaturated, the glow stays deep ember red-orange never neon never yellow never white-hot, ${COMMON}`,
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
  const blurRadius = Math.round(Math.min(w, h) / 4);
  const lowFreq = await sharp(base, { raw: { width: w, height: h, channels: 3 } })
    .blur(blurRadius).raw().toBuffer();
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

// Build an interlocking diamond mosaic from a half-tile (256x128) buffer.
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
  const full = path.join(OUT, `lava_flow_${level}.png`);
  fs.writeFileSync(full, masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `lava_flow_${level}_half.png`), half);
  await buildMosaic(half, path.join(OUT, `lava_flow_${level}_mosaic.png`));
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
