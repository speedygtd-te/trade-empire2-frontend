/**
 * REWORK style-test: 4 candidates (r1..r4) of an OBSIDIAN_RIDGE VOLCANIC surface
 * tile that FIX two problems Rudi flagged on the currently-integrated tiles:
 *
 *   PROBLEM 1 — inconsistent shard DENSITY across the 4 integrated slots (some
 *   slots densely scattered, others nearly empty/flat -> patchy uneven field when
 *   tiled). FIX: EVERY candidate has an EVEN, CONSISTENT, MEDIUM shard density
 *   across the ENTIRE tile — same density in the center as at the edges, no sparse
 *   zones, no empty patches, no dense clumps. Uniform medium scatter everywhere.
 *
 *   PROBLEM 2 — too glossy / wet-looking (reads specular/wet overall instead of
 *   matte). FIX: the surface is DRY and MATTE-DOMINATED. The dark volcanic rock
 *   between the shards is completely dry, dusty, rough, fully-diffuse, non-
 *   reflective stone. The obsidian shards are dark; only a FEW of their broken
 *   fracture EDGES catch a barely-perceptible faint dull glint — NOT a wet sheen
 *   across the whole surface, no glossy pooled highlights, no specular hotspots,
 *   no mirror reflection. Matte dominates; the glassy hint is minimal and edge-only.
 *
 * Unlike the original obsidian script (which varied darkness o1..o4 and came out
 * too glossy), this rework HOLDS density even/medium in all four and varies ONLY
 * a secondary axis — the MATTE<->SHEEN balance and shard size — so Rudi can pick a
 * corridor:
 *   r1 most matte / driest — almost no sheen, shards read by form/shadow, dustiest.
 *   r2 matte with a faint edge sheen on a few shards (balanced).
 *   r3 matte, slightly larger shards, a touch more (still subtle) edge sheen.
 *   r4 matte, slightly finer/denser-but-still-even shards, minimal sheen, darkest.
 *
 * NO integration into src/, NO cap sync, NO git commit. Style test only.
 *
 * Pipeline VERBATIM from scripts/style-test-tile-obsidian-ridge.cjs:
 *   flux-pro v1.1 @512x512 top-down  (FAL_AI_API_KEY in scripts/.env)
 *   -> 2D brightness equalization (kill any global gradient before squish)
 *   -> resize 512x256 (fill, isometric squish)
 *   -> diamond mask (alpha)
 *   Output: assets/style-test/tiles/obsidian_ridge_<level>.png (+ _half + _mosaic)
 *   level = r1..r4  (does NOT clobber the old o1..o4)
 *
 * Diamond vertices (512x256): top(256,0) right(512,128) bottom(256,256) left(0,128)
 *
 * Usage: node scripts/style-test-tile-obsidian-ridge-rework.cjs [onlyLevel]
 *   onlyLevel optional (r1|r2|r3|r4) -> re-roll just that level (seed += 137)
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

// MATTE-DOMINATED enforced with POSITIVE replacement instructions, strengthened
// beyond the original (which came out too glossy). We describe the wanted DRY,
// DUSTY, fully-diffuse look directly and make the glassy hint explicitly EDGE-ONLY
// and minimal — we do NOT negate the unwanted wet/mirror look (negatives reproduce
// the unwanted thing).
const MATTE = 'the surface is dry dusty matte volcanic rock, the dark grey-black basaltic stone between the shards is completely dry rough dusty fully diffuse non-reflective matte stone with a fine powdery ashen surface, the dark obsidian shards themselves read mostly by their form and soft shadow not by shine, the only sheen anywhere is a faint dull barely-perceptible glint on a few of the broken angular fracture edges of some shards under the soft upper-left light, soft flat diffuse lighting, deep matte black diffuse shadows in the recesses, the whole surface stays matte and dry';
const OBSIDIAN = 'an even uniform medium scatter of dark almost-black volcanic glass obsidian fragments with angular broken shard edges and curved conchoidal fracture faces, the same medium density everywhere, embedded flush into dry matte dark grey-black basaltic volcanic rock, the obsidian shards sit evenly spread across the whole ground with consistent spacing';
const LAYOUT = 'seamless tileable, edge-to-edge, evenly distributed across the ENTIRE surface including the center, the middle is just as detailed and just as dense as the edges, the shard density is uniform and consistent everywhere with no sparse empty zones and no dense clumps, no single central feature, no dominant central crack, no central ridge, no ring at edges, no diagonal bands, no diagonal crack lines, no visible seams or hotspots, uniform overall brightness, no light side, no dark side, no gradient, no vertical gradient, no horizontal gradient, no single bright patch';
const KEEP_OUT = 'no lava, no glow, no embers, no fire, no colourful crystals, no purple gemstones, no vegetation, no sand, no water, no ice';
const TONE = 'very dark, deep shadow, heavily desaturated, dirty grimy dim, dark grey-black to charcoal volcanic palette consistent with dark basalt, almost black in the crevices, ominous somber';
const COMMON = `${OBSIDIAN}, ${MATTE}, ${LAYOUT}, ${KEEP_OUT}, ${TONE}`;

// 4 fixed seeds (no Math.random), DIFFERENT from the original script's seeds.
// Density held even/medium in all four; vary only MATTE<->SHEEN balance + shard
// size so Rudi can pick a corridor.
const LEVELS = {
  // r1 MOST MATTE / DRIEST: almost no sheen, shards read by form/shadow not shine,
  // medium even shards, dustiest.
  r1: {
    seed: 714029,
    prompt: `${PREFIX}, dark desaturated charcoal volcanic ground seen from directly above, an even uniform medium scatter of small dark almost-black obsidian shards read entirely by their form and soft shadow with no shine, bedded in completely dry dusty powdery matte dark grey basalt rock, the driest most matte look with almost no sheen at all, only the faintest dull edge glint on a very few shards, grimy dim fully non-reflective overall, ${COMMON}`,
  },
  // r2 BALANCED MATTE: matte rock dominates, a faint edge sheen on a few shards.
  r2: {
    seed: 829513,
    prompt: `${PREFIX}, very dark desaturated volcanic obsidian field from directly above, an even uniform medium spread of dark almost-black obsidian shards with angular broken edges, a faint subtle dull sheen catching only the broken fracture edges of a few shards under soft upper-left light, the rest bedded in dry dusty matte dark grey-black basaltic rock, the matte dry rock clearly dominates, somber dim heavily desaturated, ${COMMON}`,
  },
  // r3 SLIGHTLY LARGER SHARDS + a touch more (still subtle) edge sheen, even medium.
  r3: {
    seed: 936187,
    prompt: `${PREFIX}, near-black volcanic obsidian ground from directly above, an even uniform medium field of slightly larger dark glassy obsidian shards with broad angular broken edges, a touch more but still subtle dull sheen on the broken fracture edges of several shards under soft upper-left light, deep matte-black dry gaps between the shards, the rock between stays dry dusty matte non-reflective, ominous very dark heavily desaturated grimy, ${COMMON}`,
  },
  // r4 FINER / DENSER-BUT-STILL-EVEN SHARDS, minimal sheen, darkest of the set.
  r4: {
    seed: 148902,
    prompt: `${PREFIX}, extremely dark almost-black volcanic obsidian ground from directly above, an even uniform medium-to-fine field of small dark obsidian shards packed at a consistent even density everywhere, the darkest of the set with deep matte black dry recesses pooling between every shard, only a minimal barely-there dull glint on a very few broken edges, bedded into dry dusty matte pitch-dark basaltic rock that drinks the light, dim somber fully matte-dominated heavily desaturated, ${COMMON}`,
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
