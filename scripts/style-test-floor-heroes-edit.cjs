/**
 * Style-test ONLY: derive the 7 type-HERO floor tiles from the APPROVED
 * standard hero square via an instruction-based IMAGE EDIT model
 * (FLUX.1 Kontext) instead of text-to-image. Rudi-decision: keeps the
 * standard's exact panel layout/material so the type family stays coherent.
 *
 * Base square: assets/raw/floor_hero_standard_square.png (512x512, v3 standard).
 * Edit model (primary): fal-ai/flux-pro/kontext  (image + edit instruction)
 * Fallback (per type via --model i2i): fal-ai/flux/dev/image-to-image strength 0.65
 *
 * Post-processing per result == hero pipeline:
 *   resize 512x256 (fill) -> vertical gradient correction -> diamond mask (alpha)
 *
 * Outputs (NEW location, does NOT overwrite text-to-image heroes):
 *   assets/style-test/heroes-edit/floor_hero_<typ>.png (+ _half.png)
 *   assets/raw/floor_hero_<typ>_edit_square.png  (the edited 512x512 square)
 *
 * NO writes to src/assets. NO cap sync. NO git.
 *
 * Usage:
 *   node scripts/style-test-floor-heroes-edit.cjs [onlyType] [--model kontext|i2i] [--reroll]
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
const ST = path.join(__dirname, '..', 'assets', 'style-test');
const OUT = path.join(ST, 'heroes-edit');
const RAW = path.join(__dirname, '..', 'assets', 'raw');
const BASE_SQUARE = path.join(RAW, 'floor_hero_standard_square.png');

// keep-the-family guard appended to every edit instruction.
// KEEP_BASE always applies (layout/angle/material/lighting). The glowing-line
// ban is split out so the two glow types (reinforced edge-light, underwater
// teal seams) are allowed to add their intended glow.
const KEEP_BASE = 'Keep the exact same overall octagonal panel layout, the same camera angle (straight top-down) and the same panel structure. Do not change the composition or panel structure, only restyle the surface. No yellow hazard stripes.';
const KEEP_NOGLOW = ' No bright glowing lines.';
const KEEP = KEEP_BASE + KEEP_NOGLOW;

const TYPES = {
  starter: {
    seed: 510001,
    // R2: much heavier decay across nearly the whole surface
    edit: 'Make this floor heavily rusted and corroded: large reddish-brown rust patches covering most of the panels, flaking and peeling paint, deep oxidation stains and pitting everywhere, badly worn, aged and grungy. The rust is the dominant surface look across the whole floor.',
  },
  reinforced: {
    seed: 510002,
    // R2: massive armor + prominent cool glowing edge lines (glow allowed)
    edit: 'Add bright glowing cool cyan-white light strips running along all the panel border seams of this armored floor, so the plate edges are clearly illuminated and emit light. Also make the plates thicker titanium armor with deep beveled edges and chunky oversized bolts along every seam. The glowing cyan edge lighting must be clearly visible and prominent.',
    keep: KEEP_BASE,
  },
  airtight: {
    seed: 510003,
    // Attempt 3: make the gasket seams unmistakably prominent, bright-edged sealed channels
    edit: 'Add bold, unmistakable airtight gasket seams: wide bright grey rubber sealing strips outlining every single panel like a thick double border, deep recessed sealed channels between all panels, glossy pressure-sealed rubber joints clearly standing out from the dark metal at every junction.',
  },
  pressurized: {
    seed: 510004,
    // Rudi combined R2: beams must read NAVY-BLUE (slate steel-blue, like the trade module),
    // a regular grid of several beams (not one dominant central X), riveted, plus a few valves
    edit: 'add several prominent structural steel support I-beams laid across the floor in a regular repeating grid pattern, all clearly painted in NAVY-BLUE metallic steel — a desaturated slate steel-blue color, distinctly bluer than the dark grey floor around them — with rows of bolts and rivets along each beam for an industrial look. Add a few small round pressure valves on the panels. The beams form an even grid, not one single big cross meeting at the center.',
  },
  platform_outdoor: {
    seed: 510005,
    // R4 (Rudi): keep the coarse hole grid (R3 lost holes when shortened),
    // but pull the weathering back into the COOL graphite family —
    // the R3 version drifted warm rust-brown.
    edit: 'turn it into weathered outdoor perforated decking: a coarse punched round-hole pattern in a regular grid spread broadly across the panels, with many clearly visible round holes (not just one or two spots), like a heavy outdoor walkway grate. Do NOT leave it as a plain smooth metal floor. Combine the holes with weathering kept entirely in dark grey tones: dirt, grime, faded worn patches and only very subtle small rust streaks. KEEP the cool dark graphite base color, no warm brown or orange rust tint anywhere.',
  },
  platform_space: {
    seed: 510006,
    // R2: darker void + clearly visible scattered star glints
    edit: 'Make the floor surface deep void-black, and scatter many clearly visible bright white star points and sparkling glints all across the panels like a reflected starfield, distinct sharp white pinpoints of light standing out against the black surface, a deep-space platform under an open sky full of stars.',
  },
  platform_underwater: {
    seed: 510007,
    // R2: strong teal glowing seams + wet condensation (glow allowed)
    edit: 'Recolor every panel seam and groove with bright glowing teal-cyan light so the whole grid of panel lines glows teal, and make the metal surface look wet and glossy with a reflective sheen and scattered water condensation droplets, as if submerged underwater. Strong teal-cyan tint over the whole floor, absolutely no warm orange, amber or copper colors anywhere.',
    keep: KEEP_BASE,
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
  return { buf: await sharp(out, { raw: { width, height, channels } }).png().toBuffer(), rowMean, globalMean, height };
}
function gradientStats(rowMean, height) {
  const topMean = (rowMean[0] + rowMean[1] + rowMean[2] + rowMean[3]) / 4;
  const botMean = (rowMean[height - 1] + rowMean[height - 2] + rowMean[height - 3] + rowMean[height - 4]) / 4;
  return Math.abs(topMean - botMean);
}

async function postProcess(rawBuf, typ) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).png().toBuffer();
  const pre = await correctVerticalGradient(resized);
  const preDiff = gradientStats(pre.rowMean, pre.height);
  const post = await correctVerticalGradient(pre.buf);
  const postDiff = gradientStats(post.rowMean, post.height);
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(pre.buf).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const full = path.join(OUT, `floor_hero_${typ}.png`);
  fs.writeFileSync(full, masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `floor_hero_${typ}_half.png`), half);
  console.log(`[save] ${full} grad ${preDiff.toFixed(1)} -> ${postDiff.toFixed(1)}`);
}

async function editKontext(baseDataUri, cfg, reroll) {
  const seed = cfg.seed + (reroll ? 137 : 0);
  console.log(`[kontext] seed ${seed}`);
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/kontext', {
    prompt: `${cfg.edit} ${cfg.keep || KEEP}`,
    image_url: baseDataUri,
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

async function editI2i(baseDataUri, cfg, reroll) {
  const seed = cfg.seed + (reroll ? 137 : 0);
  console.log(`[i2i] strength 0.65 seed ${seed}`);
  const r = await fetchJson('https://fal.run/fal-ai/flux/dev/image-to-image', {
    image_url: baseDataUri,
    prompt: `${cfg.edit} ${cfg.keep || KEEP}`,
    strength: 0.65,
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

async function genType(typ, cfg, model, reroll, baseDataUri) {
  console.log(`[gen] ${typ} via ${model}${reroll ? ' (reroll)' : ''}`);
  const square = model === 'i2i'
    ? await editI2i(baseDataUri, cfg, reroll)
    : await editKontext(baseDataUri, cfg, reroll);
  fs.writeFileSync(path.join(RAW, `floor_hero_${typ}_edit_square.png`), square);
  await postProcess(square, typ);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(RAW, { recursive: true });
  const args = process.argv.slice(2);
  const reroll = args.includes('--reroll');
  const mIdx = args.indexOf('--model');
  const model = mIdx >= 0 ? args[mIdx + 1] : 'kontext';
  const only = args.find((a) => !a.startsWith('--') && a !== model);

  const baseBuf = fs.readFileSync(BASE_SQUARE);
  const baseDataUri = `data:image/png;base64,${baseBuf.toString('base64')}`;
  console.log(`[base] ${BASE_SQUARE} (${Math.round(baseBuf.length / 1024)}KB) model=${model}`);

  for (const [typ, cfg] of Object.entries(TYPES)) {
    if (only && only !== typ) continue;
    try { await genType(typ, cfg, model, reroll, baseDataUri); }
    catch (e) { console.error(`ERR ${typ}: ${e.message}`); }
  }
  console.log('done');
})();
