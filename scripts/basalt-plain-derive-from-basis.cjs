/**
 * PRODUCTION: derive 3 i2i variants from the SECURED basalt_plain basis.
 *
 * Basis = assets/style-test/tiles/basalt_plain_basis.png (512x256 diamond-masked),
 * which is the approved basalt_plain_mild (Rudi's pick): desaturated dark slate-grey
 * columnar basalt with a clear hexagonal column pattern, no blue tint, looks the most
 * like real basalt. i2i runs DIRECTLY on the 512x256 basis and the diamond mask is
 * re-applied afterward.
 *
 * Final 4-slot layout (built by basalt-plain-integrate-basis.cjs):
 *   basalt_plain_0 = basis (unchanged)
 *   basalt_plain_1 = v1 (i2i, original)
 *   basalt_plain_2 = v2 (i2i, .flop L<->R)
 *   basalt_plain_3 = v3 (i2i, .flop L<->R)
 *
 * Look (KEEP, family of basis): desaturated dark grey columnar basalt, hexagonal
 *   volcanic rock columns, light volcanic ash dust, grimy, dim, NO blue tint.
 * GOAL: Rudi wants only a SLIGHT variation — keep the column pattern AND the basis
 *   brightness; only the arrangement of the columns should differ slightly. Hence a
 *   LOW strength of 0.40 (lower than the usual 0.45) so the init dominates.
 *
 * i2i: fal-ai/flux/dev/image-to-image, strength 0.40 (per-variant override possible).
 * Prompt = the basalt_plain_mild look (verbatim from style-test-tile-basalt-plain.cjs).
 *
 * Outputs (style-test workspace only — NO writes to src/):
 *   assets/style-test/tiles/basalt_plain_var_v{1,2,3}.png  (+ _mosaic.png 3x3)
 *
 * Usage: node scripts/basalt-plain-derive-from-basis.cjs [v1 v2 v3]  (optional re-roll)
 *        re-roll bumps seed +1000; pass v1=84045 for explicit seed,
 *        or v1@0.45 to override strength for a single variant.
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
const BASIS = path.join(OUT, 'basalt_plain_basis.png');

// Prompt — verbatim basalt_plain_mild look from style-test-tile-basalt-plain.cjs,
// hardened for tileability + uniform hexagonal column pattern.
const PREFIX = 'top-down aerial photograph, terrain texture filling entire image edge to edge, no sky, no horizon, no borders, no vignette, The Expanse sci-fi aesthetic, realistic';
const COMMON = 'seamless tileable, edge-to-edge, evenly distributed, uniform hexagonal basalt column pattern across entire surface, no large patches, no central feature, no diagonal bands, no visible seams or hotspots, no grass, no plants, no water, no blue tint, lit from upper left, heavily desaturated, dark, dim lighting, muted grey-black basalt palette';
const PROMPT = `${PREFIX}, desaturated dark grey columnar basalt rock from directly above, hexagonal volcanic rock columns, light volcanic ash dust, grimy, dim, ${COMMON}`;

const DEFAULT_STRENGTH = 0.40;
const VARIANTS = [
  { tag: 'v1', seed: 51045 },
  { tag: 'v2', seed: 52045 },
  { tag: 'v3', seed: 53045 },
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
  const full = path.join(OUT, `basalt_plain_var_${tag}.png`);
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
  await mosaic(await sharp(basis).png().toBuffer(), path.join(OUT, 'basalt_plain_var_basis_mosaic.png'));
  // arg parse: "v1", "v1=84045" (seed), "v1@0.45" (strength), combinable "v1=84045@0.45"
  const args = process.argv.slice(2);
  const reroll = args.map(a => a.split(/[=@]/)[0]);
  const seedOverride = {};
  const strengthOverride = {};
  for (const a of args) {
    const tag = a.split(/[=@]/)[0];
    const sMatch = a.match(/=(\d+)/);
    const stMatch = a.match(/@([\d.]+)/);
    if (sMatch) seedOverride[tag] = parseInt(sMatch[1], 10);
    if (stMatch) strengthOverride[tag] = parseFloat(stMatch[1]);
  }
  for (const cfg of VARIANTS) {
    if (reroll.length && !reroll.includes(cfg.tag)) continue;
    const seed = seedOverride[cfg.tag] || (reroll.includes(cfg.tag) ? cfg.seed + 1000 : cfg.seed);
    const strength = strengthOverride[cfg.tag] || DEFAULT_STRENGTH;
    try {
      const masked = await i2i(basis, { ...cfg, seed, strength });
      await mosaic(masked, path.join(OUT, `basalt_plain_var_${cfg.tag}_mosaic.png`));
    } catch (e) { console.error(`ERR ${cfg.tag}: ${e.message}`); }
  }
  console.log('done');
})();
