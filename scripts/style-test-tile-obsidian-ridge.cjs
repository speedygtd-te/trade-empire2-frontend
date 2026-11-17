/**
 * Style-test ONLY: 4 intensity levels (o1=mild .. o4=darkest) of an OBSIDIAN_RIDGE
 * VOLCANIC surface tile. HERO test, NO integration, NO writes to src/.
 *
 * Recycling base: obsidian_ridge is a sibling of the finished basalt_plain
 * (src/assets/tiles/basalt_plain/ = dark blue-grey/charcoal matte cracked basalt
 * plates). We anchor on that palette/style but take ONE small step further on its
 * own: glassy near-black obsidian (volcanic glass) with conchoidal fracture faces
 * and sharp edges scattered into matte dark volcanic rock. Obsidian is naturally
 * a bit shiny — but in the set style only SUBTLE sheen on the fracture edges, NO
 * strong metallic/mirror specular. The overall read stays dark & matte-dominated.
 *
 * Goal per CLAUDE.md playbook:
 *   - dark, dirty, matte-dominated, desaturated, consistent with the VOLCANIC set
 *     (basalt_plain / caldera / ash_field)
 *   - obsidian = dark almost-black glassy fracture faces + sharp shard edges set
 *     into matte dark basaltic rock; flat top-down, evenly distributed across the
 *     WHOLE surface (no central feature, no central crack, no rings/bands), no
 *     global brightness gradient, seamless tileable
 *   - NO lava / glow, NO colourful crystals, NO vegetation
 *   - matte enforced via POSITIVE replacement instructions (no negative prompts
 *     for the unwanted glossy look — negatives reproduce the unwanted thing)
 *
 * Pipeline (verbatim from scripts/style-test-tile-cave-floor-darkmatte.cjs):
 *   flux-pro v1.1 @512x512 top-down  (FAL_AI_API_KEY in scripts/.env)
 *   -> 2D brightness equalization (kill any global gradient before squish)
 *   -> resize 512x256 (fill, isometric squish)
 *   -> diamond mask (alpha)
 *   Output: assets/style-test/tiles/obsidian_ridge_<level>.png (+ _half + _mosaic)
 *   level = o1..o4
 *
 * Diamond vertices (512x256): top(256,0) right(512,128) bottom(256,256) left(0,128)
 *
 * Usage: node scripts/style-test-tile-obsidian-ridge.cjs [onlyLevel]
 *   onlyLevel optional (o1|o2|o3|o4) -> re-roll just that level (seed += 137)
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

// MATTE-DOMINATED enforced with POSITIVE replacement instructions. Obsidian is
// glass, so a small amount of sheen is wanted ONLY on the broken fracture faces;
// everything else stays rough matte dry volcanic rock. We describe the wanted
// subtle look directly rather than negating the unwanted mirror look.
const MATTE = 'matte-dominated dark surface, the dark basaltic rock between the shards is rough dry fully diffuse non-reflective stone, only a faint subtle soft sheen catching the upper-left light on the smooth conchoidal obsidian fracture faces, no strong mirror reflection, no bright hotspot glare, flat soft diffuse lighting, deep matte black shadows in the recesses';
const OBSIDIAN = 'scattered dark almost-black volcanic glass obsidian fragments with smooth glassy conchoidal curved fracture faces and sharp angular shard edges, embedded evenly into matte dark grey-black basaltic volcanic rock, the obsidian shards sit flush across the whole ground';
const LAYOUT = 'seamless tileable, edge-to-edge, evenly distributed across the ENTIRE surface including the center, the middle is just as detailed as the edges, no single central feature, no dominant central crack, no central ridge, no ring at edges, no diagonal bands, no diagonal crack lines, no visible seams or hotspots, uniform overall brightness, no light side, no dark side, no gradient, no vertical gradient, no horizontal gradient, no single bright patch';
const KEEP_OUT = 'no lava, no glow, no embers, no fire, no colourful crystals, no purple gemstones, no vegetation, no sand, no water, no ice';
const TONE = 'very dark, deep shadow, heavily desaturated, dirty grimy dim, dark grey-black to charcoal volcanic palette consistent with dark basalt, almost black in the crevices, ominous somber';
const COMMON = `${OBSIDIAN}, ${MATTE}, ${LAYOUT}, ${KEEP_OUT}, ${TONE}`;

// 4 fixed seeds (no Math.random), o1->o4 increasing darkness, slightly varying
// shard size / shard density / sheen amount so Rudi can pick the style corridor.
const LEVELS = {
  // o1 MILD: closest to basalt_plain, only a modest scatter of obsidian shards,
  // a touch more sheen so the obsidian reads, lighter charcoal end of the range.
  o1: {
    seed: 240611,
    prompt: `${PREFIX}, dark desaturated charcoal volcanic ground seen from directly above, a modest even scatter of small smooth glassy near-black obsidian fragments with curved conchoidal fracture faces catching a faint subtle upper-left sheen, set into matte rough dark grey basalt rock, grimy dim non-reflective overall, only a step glassier than plain basalt, ${COMMON}`,
  },
  // o2 MEDIUM: balanced — clearly an obsidian field, medium shards, matte rock
  // still dominates, darker than o1.
  o2: {
    seed: 380417,
    prompt: `${PREFIX}, very dark desaturated volcanic obsidian field from directly above, an even spread of medium dark almost-black obsidian shards with smooth glassy curved conchoidal fracture faces and sharp angular broken edges showing a faint soft sheen, bedded in matte dry dark grey-black basaltic rock, somber dim heavily desaturated, the matte rock still dominates, ${COMMON}`,
  },
  // o3 DARK: dark, denser glassy shards, deeper black recesses, sheen kept subtle.
  o3: {
    seed: 521903,
    prompt: `${PREFIX}, near-black volcanic obsidian ground from directly above, a dense even field of dark glassy obsidian shards with smooth conchoidal fracture faces and sharp edges, deep matte-black gaps between the shards, only a restrained faint sheen on the curved glass faces under soft upper-left light, embedded in matte dark basaltic rock, ominous very dark heavily desaturated grimy, ${COMMON}`,
  },
  // o4 DARKEST: deepest end of the corridor, dark glassy obsidian, very subtle
  // sheen, almost-black overall — the darkest option for Rudi.
  o4: {
    seed: 668231,
    prompt: `${PREFIX}, extremely dark almost-black volcanic obsidian glass ground from directly above, an even tightly-packed field of dark obsidian shards with smooth glassy conchoidal fracture faces and razor sharp angular edges, deep matte black recesses pooling between every shard, a barely-there subtle soft sheen only on the curved obsidian faces, bedded into matte pitch-dark basaltic rock, the surface drinks the light, dim somber fully matte-dominated heavily desaturated, ${COMMON}`,
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
  const full = path.join(OUT, `obsidian_ridge_${level}.png`);
  fs.writeFileSync(full, masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `obsidian_ridge_${level}_half.png`), half);
  await buildMosaic(half, path.join(OUT, `obsidian_ridge_${level}_mosaic.png`));
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
