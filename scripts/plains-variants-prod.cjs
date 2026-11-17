/**
 * PRODUCTION: derive 3 i2i variants from the approved plains hero (mix3).
 *
 * Hero = assets/style-test/tiles/plains_dirty_mix3.png (512x256 diamond-masked).
 * No source 512x512 square exists, so per task spec we run i2i DIRECTLY on the
 * 512x256 hero and re-apply the diamond mask afterward.
 *
 * Pipeline per variant:
 *   flux/dev/image-to-image @ strength 0.45, image_size 512x256, mix3 prompt
 *   -> resize 512x256 (fill)  [flux may pad/round]
 *   -> diamond mask (alpha)   [verbatim mask from style-test-tile-plains-mix3.cjs]
 *
 * Outputs (style-test workspace only — NO writes to src/):
 *   assets/style-test/tiles/plains_var_v{1,2,3}.png  (+ _mosaic.png 3x3)
 *
 * Usage: node scripts/plains-variants-prod.cjs [v1 v2 v3]   (optional re-roll list)
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

const TILE_W = 512, TILE_H = 256;
const OUT = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');
const HERO = path.join(OUT, 'plains_dirty_mix3.png');

// Prompt — verbatim from style-test-tile-plains-mix3.cjs
const PREFIX = 'top-down aerial photograph, terrain texture filling entire image edge to edge, no sky, no horizon, no borders, no vignette, The Expanse sci-fi aesthetic, realistic';
const PROMPT =
  `${PREFIX}, ` +
  `desaturated dirty ground from directly above, roughly equal mix of matted desaturated grass and wet brown mud, balanced 50/50, ` +
  `the grass tufts are muted olive-green, not brown and not dry, desaturated green-grey grass, while the soil between stays wet dark brown mud, ` +
  `plenty of dull olive-green grass tufts evenly spread between mud patches, ` +
  `wet dark brown muddy soil interspersed with abundant matte washed-out olive-green grass, ` +
  `very low overall saturation, grimy trampled grungy terrain, dull olive-green grass over dark brown mud palette, ` +
  `evenly distributed mud and grass across the entire surface, uniform texture, homogeneous mix, ` +
  `no large patches, no central feature, no dominant central motif, no big mud zone, no big grass zone, no diagonal bands, fine even speckle of mud and grass everywhere, ` +
  `seamless tileable ground texture designed to be placed edge-to-edge in a grid, ` +
  `repeating tiles next to and above each other must blend without visible seams or hotspots, flat top-down ground, ` +
  `flat ground-level grass, no tall protruding tufts, no cast shadows, no raised objects, no puddle reflections, ` +
  `no bright flowers, no white dots, no colorful blossoms, no vivid green, lit evenly from upper left`;

const STRENGTH = 0.45;
// default seeds per variant; re-rolls bump seed deterministically
const VARIANTS = [
  { tag: 'v1', seed: 81045 },
  { tag: 'v2', seed: 82045 },
  { tag: 'v3', seed: 83045 },
];

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

async function postProcess(rawBuf, tag) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const full = path.join(OUT, `plains_var_${tag}.png`);
  fs.writeFileSync(full, masked);
  console.log(`[save] ${full}`);
  return masked;
}

async function i2i(heroBuf, cfg) {
  const dataUri = `data:image/png;base64,${heroBuf.toString('base64')}`;
  console.log(`[i2i] ${cfg.tag} strength ${STRENGTH} seed ${cfg.seed}`);
  const r = await fetchJson('https://fal.run/fal-ai/flux/dev/image-to-image', {
    image_url: dataUri,
    prompt: PROMPT,
    strength: STRENGTH,
    image_size: { width: TILE_W, height: TILE_H },
    num_inference_steps: 40,
    guidance_scale: 3.5,
    num_images: 1,
    enable_safety_checker: false,
    seed: cfg.seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no i2i image url for ' + cfg.tag);
  const out = await download(url);
  return postProcess(out, cfg.tag);
}

// Build a 3x3 iso mosaic (overlap-packed diamonds) for visual tileability check.
async function mosaic(maskedBuf, outPath) {
  const HW = TILE_W / 2, HH = TILE_H / 2; // 256,128 step
  const cols = 3, rows = 3;
  const place = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      place.push({ cx: (c - r) * HW, cy: (c + r) * HH });
    }
  }
  const minX = Math.min(...place.map(p => p.cx));
  const maxX = Math.max(...place.map(p => p.cx));
  const maxY = Math.max(...place.map(p => p.cy));
  const canvasW = (maxX - minX) + TILE_W;
  const canvasH = maxY + TILE_H;
  const comp = place.map(p => ({ input: maskedBuf, left: p.cx - minX, top: p.cy }));
  const out = await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: { r: 20, g: 20, b: 20, alpha: 1 } } })
    .composite(comp).png().toBuffer();
  fs.writeFileSync(outPath, out);
  console.log(`[mosaic] ${outPath}`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const hero = fs.readFileSync(HERO);
  const heroMeta = await sharp(hero).metadata();
  console.log(`[hero] ${HERO} ${heroMeta.width}x${heroMeta.height}`);
  // hero reference mosaic (once)
  await mosaic(hero, path.join(OUT, 'plains_var_hero_mosaic.png'));
  // optional re-roll: pass tags as argv (with optional seed override "v1=84045")
  const args = process.argv.slice(2);
  const reroll = args.map(a => a.split('=')[0]);
  const seedOverride = {};
  for (const a of args) { const [t, s] = a.split('='); if (s) seedOverride[t] = parseInt(s, 10); }
  for (const cfg of VARIANTS) {
    if (reroll.length && !reroll.includes(cfg.tag)) continue;
    const seed = seedOverride[cfg.tag] || (reroll.includes(cfg.tag) ? cfg.seed + 1000 : cfg.seed);
    try {
      const masked = await i2i(hero, { ...cfg, seed });
      await mosaic(masked, path.join(OUT, `plains_var_${cfg.tag}_mosaic.png`));
    } catch (e) { console.error(`ERR ${cfg.tag}: ${e.message}`); }
  }
  console.log('done');
})();
