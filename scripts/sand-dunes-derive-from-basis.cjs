/**
 * PRODUCTION: derive 3 i2i variants from the SECURED sand_dunes basis.
 *
 * Basis = assets/style-test/tiles/sand_dunes_basis.png (512x256 diamond-masked),
 * a copy of the approved sand_dunes_dark: desaturated dark brown desert SAND with
 * fine dense ripples, flat, even, tileable, harmonizing with canyon/mesa. This sand
 * also becomes the BASE for the future OASIS tile, so it must stay an even desert
 * sand. i2i runs DIRECTLY on the 512x256 basis; the diamond mask is re-applied after.
 *
 * Final 4-slot layout (built by sand-dunes-integrate-basis.cjs):
 *   sand_dunes_0 = basis (unchanged, = sand_dunes_dark)
 *   sand_dunes_1 = v1 (i2i, original)
 *   sand_dunes_2 = v2 (i2i, .flop L<->R)
 *   sand_dunes_3 = v3 (i2i, .flop L<->R)
 *
 * Look (keep, family of basis): dark desaturated brown-tan desert sand from
 *   directly above, dusty shadowed grimy ripples densely + evenly filling the
 *   whole frame incl. center, heavily muted brown-tan, fairly FLAT ground, no
 *   bright gold/yellow, no raised dune relief.
 * VARIANCE GOAL (Rudi): STRONG variance — each variant must show a CLEARLY
 *   DIFFERENT ripple pattern vs. basis and vs. each other. strength 0.55.
 * KIPP-RISK at 0.55 (sand kippt gern!): i2i may drift brighter / goldener or
 *   introduce raised dune relief / per-tile bright-center dark-corner gradient.
 *   If a variant kippt, re-roll the SAME variant at strength 0.50 via CLI:
 *     node scripts/sand-dunes-derive-from-basis.cjs v1=84045@0.50
 *
 * i2i: fal-ai/flux/dev/image-to-image, strength 0.55 (overridable per variant).
 * Prompt = the sand_dunes-dark look (verbatim family of
 *   scripts/style-test-tile-sand-dunes.cjs dark prompt).
 *
 * Outputs (style-test workspace only — NO writes to src/):
 *   assets/style-test/tiles/sand_dunes_var_v{1,2,3}.png  (+ _mosaic.png 3x3)
 *
 * Usage: node scripts/sand-dunes-derive-from-basis.cjs [v1 v2 v3]  (optional re-roll)
 *        re-roll bumps seed +1000; explicit seed: v1=84045; strength: v1=84045@0.50
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
const BASIS = path.join(OUT, 'sand_dunes_basis.png');

// Prompt — verbatim sand_dunes-dark family. Built from the same PREFIX/COMMON
// constants as style-test-tile-sand-dunes.cjs (dark level).
const PREFIX = 'top-down aerial photograph, terrain texture filling entire image edge to edge, no sky, no horizon, no borders, no vignette, The Expanse sci-fi aesthetic, realistic';
const COMMON = 'seamless tileable, edge-to-edge, evenly distributed fine sand ripple texture across the ENTIRE surface INCLUDING the center, the middle of the image is just as textured as the edges, no large dunes, no dominant central feature, no central dune relief, no dominant wave pattern, no large wavy bands, no repeating ripple band pattern, no diagonal bands, no visible seams or hotspots, fairly flat top-down sand, not deep 3D relief, no deep shadows, shallow surface detail only, uniform overall brightness, perfectly even uniform lighting, no light side, no dark side, no gradient, no vertical gradient, no horizontal gradient, no bright sand patch, no bright highlight blob, sand in muted uniform tone, no grass, no plants, no water, heavily desaturated, dusty, dim, muted earthy sand-brown beige palette, no bright gold, no glowing gold, no vivid yellow-orange, no yellow';
const PROMPT = `${PREFIX}, dark desaturated brown-tan desert sand from directly above, dusty shadowed grimy ripples densely and evenly filling the entire frame including the center, ominous dim, heavily muted brown-tan, fairly flat ground, ${COMMON}`;

const DEFAULT_STRENGTH = 0.55;
const VARIANTS = [
  { tag: 'v1', seed: 61130 },
  { tag: 'v2', seed: 62130 },
  { tag: 'v3', seed: 63130 },
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
  const full = path.join(OUT, `sand_dunes_var_${tag}.png`);
  fs.writeFileSync(full, masked);
  console.log(`[save] ${full}`);
  return masked;
}

async function i2i(basisBuf, cfg) {
  // Flatten basis onto an opaque bg so transparent diamond corners don't bleed
  // into the i2i init; flux re-fills the whole 512x256, we re-mask after.
  const flat = await sharp(basisBuf)
    .flatten({ background: { r: 0x14, g: 0x17, b: 0x1c } })
    .png().toBuffer();
  const dataUri = `data:image/png;base64,${flat.toString('base64')}`;
  console.log(`[i2i] ${cfg.tag} strength ${cfg.strength} seed ${cfg.seed}`);
  const r = await fetchJson('https://fal.run/fal-ai/flux/dev/image-to-image', {
    image_url: dataUri,
    prompt: PROMPT,
    strength: cfg.strength,
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

async function mosaic(maskedBuf, outPath) {
  const HW = TILE_W / 2, HH = TILE_H / 2;
  const cols = 3, rows = 3;
  const place = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) place.push({ cx: (c - r) * HW, cy: (c + r) * HH });
  const minX = Math.min(...place.map(p => p.cx));
  const maxX = Math.max(...place.map(p => p.cx));
  const maxY = Math.max(...place.map(p => p.cy));
  const canvasW = (maxX - minX) + TILE_W;
  const canvasH = maxY + TILE_H;
  const comp = place.map(p => ({ input: maskedBuf, left: p.cx - minX, top: p.cy }));
  const out = await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 } } })
    .composite(comp).png().toBuffer();
  fs.writeFileSync(outPath, out);
  console.log(`[mosaic] ${outPath}`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const basis = fs.readFileSync(BASIS);
  const meta = await sharp(basis).metadata();
  console.log(`[basis] ${BASIS} ${meta.width}x${meta.height}`);
  // basis reference mosaic (once)
  await mosaic(await sharp(basis).png().toBuffer(), path.join(OUT, 'sand_dunes_var_basis_mosaic.png'));
  const args = process.argv.slice(2);
  const reroll = args.map(a => a.split('=')[0]);
  const seedOverride = {};
  const strengthOverride = {};
  for (const a of args) {
    const [t, rest] = a.split('=');
    if (rest) {
      const [s, str] = rest.split('@');
      if (s) seedOverride[t] = parseInt(s, 10);
      if (str) strengthOverride[t] = parseFloat(str);
    }
  }
  for (const cfg of VARIANTS) {
    if (reroll.length && !reroll.includes(cfg.tag)) continue;
    const seed = seedOverride[cfg.tag] || (reroll.includes(cfg.tag) ? cfg.seed + 1000 : cfg.seed);
    const strength = strengthOverride[cfg.tag] || DEFAULT_STRENGTH;
    try {
      const masked = await i2i(basis, { ...cfg, seed, strength });
      await mosaic(masked, path.join(OUT, `sand_dunes_var_${cfg.tag}_mosaic.png`));
    } catch (e) { console.error(`ERR ${cfg.tag}: ${e.message}`); }
  }
  console.log('done');
})();
