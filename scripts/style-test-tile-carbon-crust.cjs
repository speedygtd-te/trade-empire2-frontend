/**
 * Style-test ONLY: 4 versions of a darker / dirtier CARBON_CRUST surface tile
 * (volcanic / alien charred carbon crust — NOT lava, NOT glowing).
 * HERO test, NO integration, NO writes to src/.
 *
 * Goal (Rudi-Entscheidung): a charred / crusted carbon surface — dark, sooty,
 * brittle carbon crust, matte, near-anthracite-black with subtle dark-grey
 * cracks / encrustations. Moderately darker / less saturated / higher contrast
 * than the last set (salt_flat, canyon, mesa) — "moderately" means ONLY a small
 * step darker than those tiles; consistency with the existing set matters MORE
 * than a strong shift. Not pitch-black, just dim and somber in the same look.
 * NO gloss, NO lava glow, NO highlights, NO colour.
 *
 * CRITICAL (caldera/salt_flat lesson): the carbon crust + cracks must be EVEN
 * edge-to-edge across the WHOLE surface incl. the center — NO single dominant
 * central crack, NO ring of cracks at the edges, NO diagonal bands. Evenly lit
 * (no light side / dark side gradient — check on the mosaic), seamless tileable.
 *
 * Pipeline (verbatim from scripts/style-test-tile-salt-flat.cjs):
 *   flux-pro v1.1 @512x512 top-down  (FAL_AI_API_KEY in scripts/.env)
 *   -> resize 512x256 (fill, isometric squish)
 *   -> diamond mask (alpha)
 *   Output: assets/style-test/tiles/carbon_crust_<level>.png (+ _half.png + _mosaic.png)
 *
 * Diamond vertices (512x256): top(256,0) right(512,128) bottom(256,256) left(0,128)
 *
 * Usage: node scripts/style-test-tile-carbon-crust.cjs [onlyLevel]
 *   onlyLevel optional (v1|v2|v3|v4) -> re-roll just that level (seed += 137)
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
// Tileability + anti-hotspot + anti-gradient + FLATNESS + EVEN-CRUST constraints.
// CRITICAL for carbon_crust: the charred carbon crust + cracks must span the
// WHOLE surface incl. the center, evenly — NO single big central crack, NO central
// feature, NO ring of cracks at the edges, NO diagonal bands. Sooty dark anthracite
// carbon, matte, NO lava glow / embers / orange / red / glossy highlights.
const COMMON = 'seamless tileable, edge-to-edge, evenly distributed charred carbon crust and dark crack pattern across the ENTIRE surface including the center, brittle encrusted carbon flakes of fairly uniform size covering the whole image, the middle is just as crusted as the edges, no large central crack, no dominant central crack, no central feature, no ring of cracks at the edges, no diagonal bands, no diagonal crack lines, no visible seams or hotspots, fairly flat top-down ground, not deep 3D relief, no deep shadows, shallow surface cracks only, uniform overall brightness, perfectly even uniform lighting, no light side, no dark side, no gradient, no vertical gradient, no horizontal gradient, no single bright patch, no bright highlight blob, NO lava glow, no embers, no orange, no red, no glossy highlights, no bright spots, no shine, matte, no water, no sand, no grass, no plants, heavily desaturated, dirty, grimy, dim, sooty near-anthracite-black dark grey carbon palette';

const LEVELS = {
  v1: {
    seed: 71203,
    prompt: `${PREFIX}, dark sooty desaturated charred carbon crust from directly above with a subtle even pattern of fine dark-grey hairline cracks, matte anthracite, grimy, fairly flat, dim, ${COMMON}`,
  },
  v2: {
    seed: 38947,
    prompt: `${PREFIX}, dim grimy near-black carbon crust from directly above, brittle encrusted carbon plates with dark-grey cracks evenly across the whole surface including the center, sooty matte, somber low saturation, fairly flat ground, ${COMMON}`,
  },
  v3: {
    seed: 56218,
    prompt: `${PREFIX}, dark anthracite carbon crust from directly above, densely crusted brittle sooty flakes and shallow dark cracks evenly filling the entire frame including the center, grimy ominous dim, heavily desaturated weathered matte, fairly flat ground, ${COMMON}`,
  },
  v4: {
    seed: 60534,
    prompt: `${PREFIX}, very dark sooty charred carbon crust from directly above, fine dense network of dark-grey crust ridges and shallow cracks evenly over the whole frame including the center, dirty matte near-black anthracite, dim somber, fairly flat ground, ${COMMON}`,
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
  const full = path.join(OUT, `carbon_crust_${level}.png`);
  fs.writeFileSync(full, masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `carbon_crust_${level}_half.png`), half);
  await buildMosaic(half, path.join(OUT, `carbon_crust_${level}_mosaic.png`));
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
