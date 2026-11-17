/**
 * NACHBESSERUNG (Rudi-Befund): regenerate ONLY airtight + reinforced
 * variants floor_1..3. floor_0 (hero) stays untouched.
 *
 * Problems being fixed:
 *  - airtight: variants ~identical to hero and to each other -> raise strength
 *    (~0.55-0.60) and lean prompt on the gasket seal seams so the type marker
 *    survives the stronger variation (panel/seam layout must read differently).
 *  - reinforced: lost the hero's glow -> the ACTUAL integrated hero
 *    (reinforced_floor_0 / heroes-edit/floor_hero_reinforced.png) glows ORANGE/
 *    AMBER, not cyan. Prompt now demands prominent ORANGE-AMBER glowing edge
 *    lines so each variant matches the hero's illuminated character.
 *
 * Source squares (same i2i inputs as the prod run):
 *   airtight    -> assets/raw/floor_hero_airtight_edit_square.png
 *   reinforced  -> assets/raw/floor_hero_reinforced_edit_square.png
 * Model: fal-ai/flux/dev/image-to-image (per-type default strength below).
 *
 * Post == hero pipeline: resize 512x256 (fill) -> vertical gradient correction
 *   -> diamond mask (alpha) -> assets/style-test/variants-prod/<typ>_floor_<n>.png
 *   (overwrites the rejected prod variants in place; integration reads from here)
 *
 * Re-roll a single variant (attempt loop): `<typ> <n> [seed] [strength]`
 *
 * FLUX Kontext fallback (per task note, when i2i keeps losing the reinforced
 * glow): `--kontext` forces fal-ai/flux-pro/kontext with a layout-rearrange +
 * keep-the-glow instruction off the reinforced edit-square. Per-variant seed
 * still via the `<n> [seed]` args; strength arg is ignored for kontext.
 *
 * NO writes to src/assets. NO cap sync. NO git.
 *
 * Usage:
 *   node scripts/floor-variants-nachbesserung.cjs                  # both types 1..3
 *   node scripts/floor-variants-nachbesserung.cjs airtight         # one type 1..3
 *   node scripts/floor-variants-nachbesserung.cjs reinforced 2 777 0.55  # reroll one i2i
 *   node scripts/floor-variants-nachbesserung.cjs reinforced --kontext        # all 3 via kontext
 *   node scripts/floor-variants-nachbesserung.cjs reinforced 2 777 --kontext  # one via kontext
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
const RAW = path.join(__dirname, '..', 'assets', 'raw');
const OUT = path.join(__dirname, '..', 'assets', 'style-test', 'variants-prod');

const KEEP_BASE = 'Keep the exact same overall octagonal panel layout, the same camera angle (straight top-down) and the same panel structure. Do not change the composition or panel structure, only restyle the surface. No yellow hazard stripes.';

// airtight: stronger variation but the gasket seal seams MUST stay the dominant
// type marker. Each variant told to re-route / re-lay the panels & seams so the
// three differ from each other and from the hero, seal seams still prominent.
const AIRTIGHT_KEEP =
  'Keep the straight top-down camera angle, the same dark charcoal sealed-bulkhead material and the same even flat lighting. You MAY rearrange the panel split lines and seam routing into a clearly different layout, but the airtight gasket seals must stay the dominant feature. No yellow hazard stripes. No bright glowing lines.';
const AIRTIGHT_EDIT =
  'A sealed airtight bulkhead floor: thick prominent grey rubber gasket seal seams running between all the metal plates like raised double sealing strips, deep recessed pressure-sealed channels at every panel junction, glossy gasket joints clearly standing proud of the dark metal. The thick sealed gasket seams are the dominant, unmistakable surface feature.';

// reinforced: match the ACTUAL hero -> ORANGE/AMBER glowing edge lines.
const REINFORCED_KEEP = KEEP_BASE;
const REINFORCED_EDIT =
  'Heavy titanium armored deck plates with PROMINENT GLOWING illuminated ORANGE-AMBER panel edge light lines running along the plate border seams, the glowing orange seams clearly visible and emitting warm light, thick beveled armor plates with chunky bolts along every seam. The bright orange-amber glowing edge lighting must be clearly visible and prominent on every plate border.';
// FLUX Kontext instruction: rearrange the layout for variation while explicitly
// preserving the source square's glowing orange edge lines + material identity.
const REINFORCED_KONTEXT =
  'Rearrange and re-route the panel layout of this armored floor into a clearly different plate arrangement, but keep ALL the glowing orange-amber illuminated panel edge light lines and keep the dark titanium armor material exactly the same. The bright glowing orange edge lines must stay clearly visible and prominent. Keep the straight top-down camera angle. No yellow hazard stripes.';

const TYPES = {
  airtight: {
    square: 'floor_hero_airtight_edit_square.png',
    edit: AIRTIGHT_EDIT,
    keep: AIRTIGHT_KEEP,
    strength: 0.58,
    seeds: [630401, 630402, 630403],
  },
  reinforced: {
    square: 'floor_hero_reinforced_edit_square.png',
    edit: REINFORCED_EDIT,
    kontext: REINFORCED_KONTEXT,
    keep: REINFORCED_KEEP,
    strength: 0.52,
    seeds: [630301, 630302, 630303],
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
        if (res.statusCode >= 400) { reject(new Error(`fal ${res.statusCode}: ${raw.slice(0, 500)}`)); return; }
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

async function correctVerticalGradient(buf) {
  const img = sharp(buf).removeAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const rowMean = new Float64Array(height);
  let globalMean = 0;
  for (let y = 0; y < height; y++) {
    let s = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      s += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    rowMean[y] = s / width;
    globalMean += rowMean[y];
  }
  globalMean /= height;
  const out = Buffer.from(data);
  for (let y = 0; y < height; y++) {
    const delta = globalMean - rowMean[y];
    if (delta === 0) continue;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      for (let c = 0; c < channels; c++) {
        let v = data[i + c] + delta;
        out[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
  return { buf: await sharp(out, { raw: { width, height, channels } }).png().toBuffer(), rowMean, height };
}
function gradientStats(rowMean, height) {
  const topMean = (rowMean[0] + rowMean[1] + rowMean[2] + rowMean[3]) / 4;
  const botMean = (rowMean[height - 1] + rowMean[height - 2] + rowMean[height - 3] + rowMean[height - 4]) / 4;
  return Math.abs(topMean - botMean);
}

async function postProcess(rawBuf, outPath) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).png().toBuffer();
  const pre = await correctVerticalGradient(resized);
  const preDiff = gradientStats(pre.rowMean, pre.height);
  const post = await correctVerticalGradient(pre.buf);
  const postDiff = gradientStats(post.rowMean, post.height);
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(pre.buf).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  fs.writeFileSync(outPath, masked);
  console.log(`[save] ${path.basename(outPath)} grad ${preDiff.toFixed(1)} -> ${postDiff.toFixed(1)}`);
}

async function i2i(squareDataUri, prompt, seed, strength) {
  const r = await fetchJson('https://fal.run/fal-ai/flux/dev/image-to-image', {
    image_url: squareDataUri,
    prompt,
    strength,
    image_size: { width: GEN_SIZE, height: GEN_SIZE },
    num_inference_steps: 40,
    guidance_scale: 3.5,
    num_images: 1,
    enable_safety_checker: false,
    seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no i2i image url');
  return download(url);
}

async function kontext(squareDataUri, prompt, seed) {
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/kontext', {
    prompt,
    image_url: squareDataUri,
    seed,
    guidance_scale: 3.5,
    num_images: 1,
    safety_tolerance: '5',
    output_format: 'png',
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no kontext image url');
  return download(url);
}

async function genVariant(typ, cfg, n, seedOverride, strengthOverride, useKontext) {
  const sqPath = path.join(RAW, cfg.square);
  const sqBuf = fs.readFileSync(sqPath);
  const dataUri = `data:image/png;base64,${sqBuf.toString('base64')}`;
  const seed = seedOverride != null ? seedOverride : cfg.seeds[n - 1];
  let raw;
  if (useKontext) {
    if (!cfg.kontext) throw new Error(`${typ} has no kontext prompt`);
    console.log(`[kontext] ${typ} v${n} seed ${seed}`);
    raw = await kontext(dataUri, cfg.kontext, seed);
  } else {
    const prompt = `${cfg.edit} ${cfg.keep}`;
    const strength = strengthOverride != null ? strengthOverride : cfg.strength;
    console.log(`[i2i] ${typ} v${n} strength ${strength} seed ${seed}`);
    raw = await i2i(dataUri, prompt, seed, strength);
  }
  await postProcess(raw, path.join(OUT, `${typ}_floor_${n}.png`));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const rawArgs = process.argv.slice(2);
  const useKontext = rawArgs.includes('--kontext');
  const args = rawArgs.filter((a) => !a.startsWith('--'));
  const only = args[0];
  const oneN = args[1] ? parseInt(args[1], 10) : null;
  const oneSeed = args[2] ? parseInt(args[2], 10) : null;
  const oneStrength = args[3] ? parseFloat(args[3]) : null;

  for (const [typ, cfg] of Object.entries(TYPES)) {
    if (only && only !== typ) continue;
    if (oneN) {
      try { await genVariant(typ, cfg, oneN, oneSeed, oneStrength, useKontext); } catch (e) { console.error(`ERR ${typ} v${oneN}: ${e.message}`); }
      continue;
    }
    for (let n = 1; n <= 3; n++) {
      try { await genVariant(typ, cfg, n, null, null, useKontext); } catch (e) { console.error(`ERR ${typ} v${n}: ${e.message}`); }
    }
  }
  console.log('done');
})();
