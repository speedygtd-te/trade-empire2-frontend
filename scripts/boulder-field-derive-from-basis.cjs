/**
 * PRODUCTION: derive 3 i2i variants from the SECURED boulder_field basis.
 *
 * Basis = assets/style-test/tiles/boulder_field_basis.png (512x256 diamond-masked),
 * a copy of the approved boulder_field_even_d: boulders of VARYING sizes scattered
 * with uniform even density across the whole diamond (no edge ring, no empty center,
 * dark desaturated charcoal, no blue tint). i2i runs DIRECTLY on the 512x256 basis;
 * the diamond mask is re-applied afterward.
 *
 * Final 4-slot layout (built by boulder-field-integrate-basis.cjs):
 *   boulder_field_0 = basis (even_d, unchanged)
 *   boulder_field_1 = v1 (i2i, original)
 *   boulder_field_2 = v2 (i2i, .flop L<->R)
 *   boulder_field_3 = v3 (i2i, .flop L<->R)
 *
 * GOAL (Rudi): STRONG variance — boulder arrangement/sizes must look clearly
 *   different from the basis and from each other. Hence a HIGH strength of 0.60.
 *   BUT the uniform edge-to-edge distribution (incl. the CENTER) MUST be kept —
 *   the high strength must NOT let the edge-ring / empty-center bias return. The
 *   prompt therefore keeps hammering the even-distribution constraints from the
 *   even-texture script.
 *
 * i2i: fal-ai/flux/dev/image-to-image, strength 0.60 (per-variant override possible;
 *   drop to 0.50 for a variant if its center goes empty — see usage).
 * Prompt = the even-texture prompt (verbatim from boulder-field-even-texture.cjs).
 *
 * Outputs (style-test workspace only — NO writes to src/):
 *   assets/style-test/tiles/boulder_field_var_v{1,2,3}.png  (+ _mosaic.png 3x3)
 *
 * Usage: node scripts/boulder-field-derive-from-basis.cjs [v1 v2 v3]  (optional re-roll)
 *        re-roll bumps seed +1000; pass v1=84045 for explicit seed,
 *        or v1@0.50 to override strength for a single variant (e.g. center went empty).
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
const BASIS = path.join(OUT, 'boulder_field_basis.png');

// Prompt — verbatim even-texture prompt from boulder-field-even-texture.cjs.
// The uniform-distribution / anti-edge-ring / anti-empty-center clauses are what
// keep strength 0.60 from drifting back to the rim-bias the basis fixed.
const PROMPT =
  'seamless tileable top-down texture of a rocky boulder field, rocks and boulders of VARYING sizes — large boulders, medium rocks, small stones and fine gravel — all scattered with PERFECTLY UNIFORM even density across the entire frame, flat overhead orthographic view, full edge-to-edge coverage, NO border, NO vignette, NO frame, NO edge concentration, NO empty center, uniform distribution everywhere including the middle, dark desaturated charcoal-grey rock on dark grit, no blue tint, dim, somber, no single bright rock, no hotspot';

const DEFAULT_STRENGTH = 0.60;
const VARIANTS = [
  { tag: 'v1', seed: 61045 },
  { tag: 'v2', seed: 62045 },
  { tag: 'v3', seed: 63045 },
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
  const full = path.join(OUT, `boulder_field_var_${tag}.png`);
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
  if (meta.width !== TILE_W || meta.height !== TILE_H) throw new Error('basis not 512x256');
  await mosaic(await sharp(basis).png().toBuffer(), path.join(OUT, 'boulder_field_var_basis_mosaic.png'));
  // arg parse: "v1", "v1=84045" (seed), "v1@0.50" (strength), combinable "v1=84045@0.50"
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
      await mosaic(masked, path.join(OUT, `boulder_field_var_${cfg.tag}_mosaic.png`));
    } catch (e) { console.error(`ERR ${cfg.tag}: ${e.message}`); }
  }
  console.log('done');
})();
