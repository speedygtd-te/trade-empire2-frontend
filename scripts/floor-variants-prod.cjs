/**
 * PRODUCTION: per type generate 3 i2i variants (floor_1..3) from the approved
 * edit-square, using the SAME post-processing as the hero pipeline.
 *
 * Source per type:
 *   standard     -> assets/raw/floor_hero_standard_square.png
 *   <other>      -> assets/raw/floor_hero_<typ>_edit_square.png
 * Model: fal-ai/flux/dev/image-to-image  strength 0.45 (calibrated)
 * Prompt per type: derived from style-test-floor-heroes-edit.cjs edit + keep;
 *   standard uses the v3 base hero prompt (style-test-floor-i2i.cjs).
 *
 * Post per variant == hero pipeline:
 *   resize 512x256 (fill) -> vertical gradient correction -> diamond mask (alpha)
 *   -> write PNG variant to assets/style-test/variants-prod/<typ>_floor_<n>.png
 *
 * Re-roll: pass `<typ> <n> <seed>` to regenerate a single variant with a new seed.
 *
 * NO writes to src/assets. NO cap sync. NO git.
 *
 * Usage:
 *   node scripts/floor-variants-prod.cjs            # all types, variants 1..3
 *   node scripts/floor-variants-prod.cjs starter    # one type
 *   node scripts/floor-variants-prod.cjs starter 2 777123   # reroll one variant
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

const TILE_W = 512, TILE_H = 256, GEN_SIZE = 512, STRENGTH = 0.45;
const RAW = path.join(__dirname, '..', 'assets', 'raw');
const OUT = path.join(__dirname, '..', 'assets', 'style-test', 'variants-prod');

const KEEP_BASE = 'Keep the exact same overall octagonal panel layout, the same camera angle (straight top-down) and the same panel structure. Do not change the composition or panel structure, only restyle the surface. No yellow hazard stripes.';
const KEEP_NOGLOW = ' No bright glowing lines.';
const KEEP = KEEP_BASE + KEEP_NOGLOW;

// standard v3 base prompt (from style-test-floor-i2i.cjs)
const BASE = 'top-down aerial photograph, interior floor texture filling entire image edge to edge, no sky, no walls, no borders, no vignette, sci-fi industrial aesthetic, realistic, seamless tileable floor section';
const EVEN = 'perfectly even uniform lighting across entire surface, flat ambient light, no vertical gradient, no bright top edge, no vignette, consistent brightness corner to corner';
const STANDARD_PROMPT = `${BASE}, ${EVEN}, very dark charcoal near-black graphite deck plating from directly above, dim moody industrial lighting, sparse faint dimmed copper accent seam lines, low-glow muted copper, dark sci-fi atmosphere, deep shadows, mid-dark to near-black neutral surface, calm low-contrast detail, NO yellow hazard stripes, NO bright glowing lines`;

// type edit prompts (from heroes-edit) + keep guard; standard uses base prompt.
const E = {
  starter: 'Make this floor heavily rusted and corroded: large reddish-brown rust patches covering most of the panels, flaking and peeling paint, deep oxidation stains and pitting everywhere, badly worn, aged and grungy. The rust is the dominant surface look across the whole floor.',
  reinforced: 'Add bright glowing cool cyan-white light strips running along all the panel border seams of this armored floor, so the plate edges are clearly illuminated and emit light. Also make the plates thicker titanium armor with deep beveled edges and chunky oversized bolts along every seam. The glowing cyan edge lighting must be clearly visible and prominent.',
  airtight: 'Add bold, unmistakable airtight gasket seams: wide bright grey rubber sealing strips outlining every single panel like a thick double border, deep recessed sealed channels between all panels, glossy pressure-sealed rubber joints clearly standing out from the dark metal at every junction.',
  pressurized: 'add several prominent structural steel support I-beams laid across the floor in a regular repeating grid pattern, all clearly painted in NAVY-BLUE metallic steel — a desaturated slate steel-blue color, distinctly bluer than the dark grey floor around them — with rows of bolts and rivets along each beam for an industrial look. Add a few small round pressure valves on the panels. The beams form an even grid, not one single big cross meeting at the center.',
  platform_outdoor: 'turn it into weathered outdoor perforated decking: a coarse punched round-hole pattern in a regular grid spread broadly across the panels, with many clearly visible round holes (not just one or two spots), like a heavy outdoor walkway grate. Do NOT leave it as a plain smooth metal floor. Combine the holes with weathering kept entirely in dark grey tones: dirt, grime, faded worn patches and only very subtle small rust streaks. KEEP the cool dark graphite base color, no warm brown or orange rust tint anywhere.',
  platform_space: 'Make the floor surface deep void-black, and scatter many clearly visible bright white star points and sparkling glints all across the panels like a reflected starfield, distinct sharp white pinpoints of light standing out against the black surface, a deep-space platform under an open sky full of stars.',
  platform_underwater: 'Recolor every panel seam and groove with bright glowing teal-cyan light so the whole grid of panel lines glows teal, and make the metal surface look wet and glossy with a reflective sheen and scattered water condensation droplets, as if submerged underwater. Strong teal-cyan tint over the whole floor, absolutely no warm orange, amber or copper colors anywhere.',
};
// reinforced + underwater allow glow -> KEEP_BASE only
const KEEP_PER = { reinforced: KEEP_BASE, platform_underwater: KEEP_BASE };

const TYPES = {
  standard:            { square: 'floor_hero_standard_square.png',            prompt: STANDARD_PROMPT, seeds: [620101, 620102, 620103] },
  starter:             { square: 'floor_hero_starter_edit_square.png',        seeds: [620201, 620202, 620203] },
  reinforced:          { square: 'floor_hero_reinforced_edit_square.png',     seeds: [620301, 620302, 620303] },
  airtight:            { square: 'floor_hero_airtight_edit_square.png',       seeds: [620401, 620402, 620403] },
  pressurized:         { square: 'floor_hero_pressurized_edit_square.png',    seeds: [620501, 620502, 620503] },
  platform_outdoor:    { square: 'floor_hero_platform_outdoor_edit_square.png', seeds: [620601, 620602, 620603] },
  platform_space:      { square: 'floor_hero_platform_space_edit_square.png', seeds: [620701, 620702, 620703] },
  platform_underwater: { square: 'floor_hero_platform_underwater_edit_square.png', seeds: [620801, 620802, 620803] },
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

async function i2i(squareDataUri, prompt, seed) {
  const r = await fetchJson('https://fal.run/fal-ai/flux/dev/image-to-image', {
    image_url: squareDataUri,
    prompt,
    strength: STRENGTH,
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

async function genVariant(typ, cfg, n, seedOverride) {
  const sqPath = path.join(RAW, cfg.square);
  const sqBuf = fs.readFileSync(sqPath);
  const dataUri = `data:image/png;base64,${sqBuf.toString('base64')}`;
  const prompt = cfg.prompt || `${E[typ]} ${KEEP_PER[typ] || KEEP}`;
  const seed = seedOverride != null ? seedOverride : cfg.seeds[n - 1];
  console.log(`[i2i] ${typ} v${n} strength ${STRENGTH} seed ${seed}`);
  const raw = await i2i(dataUri, prompt, seed);
  await postProcess(raw, path.join(OUT, `${typ}_floor_${n}.png`));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const only = args[0];
  const oneN = args[1] ? parseInt(args[1], 10) : null;
  const oneSeed = args[2] ? parseInt(args[2], 10) : null;

  for (const [typ, cfg] of Object.entries(TYPES)) {
    if (only && only !== typ) continue;
    if (oneN) {
      try { await genVariant(typ, cfg, oneN, oneSeed); } catch (e) { console.error(`ERR ${typ} v${oneN}: ${e.message}`); }
      continue;
    }
    for (let n = 1; n <= 3; n++) {
      try { await genVariant(typ, cfg, n); } catch (e) { console.error(`ERR ${typ} v${n}: ${e.message}`); }
    }
  }
  console.log('done');
})();
