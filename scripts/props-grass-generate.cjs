/**
 * Asset-Pipeline: surface PROP sprites — DRY STRAW GRASS TUSSOCKS.
 *
 *   grass_0..5   -> biome plains
 *
 * WHY A DEDICATED GRASS SET (and why a separate script)
 * -----------------------------------------------------
 * `plains` has no grass prop yet. The obvious candidate — the swamp grass clumps
 * (swamp_1 / swamp_3 / swamp_4) — is motivically right but tonally wrong:
 * measured lum 62.6 / 65.1 / 75.9 against a plains ground of 66.3. Two of the
 * three are literally the same value as the ground they would stand on, so they
 * read as a darker smudge, not as an object. Same failure mode as rock_arid on
 * desert_patch, which Rudi rejected.
 *
 * GROUND MEASUREMENT (the 4 plains tile variants, opaque pixels only)
 *   plains_0  lum 66.6  rgb 74/67/46  R/B 1.59
 *   plains_1  lum 65.4  rgb 73/65/46  R/B 1.58
 *   plains_2  lum 66.3  rgb 74/66/46  R/B 1.61
 *   plains_3  lum 67.6  rgb 75/67/48  R/B 1.58
 *   mean      lum 66.3  rgb 74/66/46  R/B 1.59
 *
 * TARGET TONE
 *   mean luminance 88..112   clearly lighter than the ground (~1.5x), so the
 *                            tussock reads as an object ON the plain. Exactly the
 *                            logic that made rock_sand work on desert_patch.
 *   R/B 1.60..2.20           warm straw — same colour family as the ground but
 *                            drier and warmer, never colder than the ground.
 *   aspect 0.90..1.60        squat horst, rather wide than tall.
 *
 * THE CRITICAL CONSTRAINT: THE TILE ALREADY HAS GRASS PAINTED INTO IT
 * -------------------------------------------------------------------
 * `plains` is not bare soil. Its texture already carries dozens of small GREEN
 * grass tussocks plus dark earth patches. A green grass prop would read as a
 * second copy of the tile texture and disappear. The whole set is therefore
 * DRY STRAW — dead, sun-bleached, wheat/oat/ochre blades with seed panicles,
 * taller and more upright than the painted-in grass. Green is treated as a
 * generation FAILURE here, not as something the tone step may rescue:
 * PRE_GR_MAX rejects any render whose green channel rivals its red one.
 *
 * WHY NOT ASK THE MODEL FOR "PALE" GRASS
 * --------------------------------------
 * Documented in props-rock-sand-generate.cjs: asking flux for "pale" / "bleached"
 * produced white marble instead of light sandstone. Same trap here — "bleached
 * grass" goes to white paper straw. The MOTIF comes from the prompt ("dry straw
 * tussock, dead winter grass, seed panicles"), the VALUE comes from the tone
 * step. The prompt never asks for brightness.
 *
 * HEAD-NOUN CHOICE (drives silhouette and therefore aspect)
 * ---------------------------------------------------------
 * Measured evidence from the swamp set: reed/cattail wording lands at aspect
 * 0.37..0.83 — far below the 0.90 floor, because "reed" and "stalk" are vertical
 * nouns. "tussock" is the widest of the grass nouns (a fountain of blades
 * arching OUT), "clump" is rounder, "tuft" is smallest and tallest-looking.
 * Every shape here therefore leads with TUSSOCK, and the width lever is the
 * positive phrase "arching outward and drooping down at the tips" rather than a
 * negated "not tall" (negations reliably summon the thing they name).
 *
 * PIPELINE (per variant, per CLAUDE.md Phase 2b)
 *   1. fal-ai/flux-pro/v1.1, fixed seed, per-shape canvas, mid-grey backdrop
 *                                                      -> assets/raw/<name>_raw.png
 *   2. fal-ai/birefnet/v2 background removal            -> assets/nobg/<name>_nobg.png
 *      + gentle alpha levels curve + speck removal (gentler than the rock
 *        scripts: hard alpha levels eat the fine blade tips)
 *   3. tight crop on alpha (first/last visible pixel, all 4 sides)
 *   4. tone normalise: hue pin to a common R/B + bidirectional luminance pin
 *   5. scale so max(w, h) = 400 px, aspect preserved, NO padding -> assets/final/
 *   6. validate: dimensions, tight crop, aspect band, luminance band, warmth,
 *      greenness ceiling, surface contrast
 *   integrate: PNG -> webp q90 + @half/@quarter/@eighth -> src/assets/props/grass/
 *
 * MODEL: fal-ai/flux-pro/v1.1 (no `negative_prompt` input — negatives folded into
 * the prompt as plain text). flux/dev returns cel-shaded low-poly plants with a
 * painted-on floor.
 *
 * PROP SIZE CONVENTION
 *   - tight-cropped, aspect preserved, NO fixed canvas, NO transparent padding
 *   - RGBA webp, max side 400 px
 *   - LOD @half/@quarter/@eighth = Math.round(dim * 0.5 / 0.25 / 0.125),
 *     webp { quality: 90, effort: 4, smartSubsample: true }
 *   - file names MUST be grass_<i>.webp inside a folder named grass/ — spriteCache
 *     matches /\/props\/([^/]+)\/\1_(\d+)\.webp$/
 *
 * HEIGHT FACTOR (NOT set by this script — see the report)
 *   PlanetSurface draws every prop at drawH = PROP_BASE_HEIGHT (28) * scale and
 *   derives the width from the sprite aspect. Without a PROP_HEIGHT_FACTORS entry
 *   a grass tussock would be drawn exactly as tall as a tree. `sheet` renders a
 *   height-factor sweep so the value can be chosen from evidence.
 *
 * fal key from scripts/.env (FAL_AI_API_KEY) — never hardcode, never log, never commit.
 *
 * Usage:
 *   node scripts/props-grass-generate.cjs gen
 *   node scripts/props-grass-generate.cjs gen 2 5
 *   node scripts/props-grass-generate.cjs gen 2 --seed 999123
 *   node scripts/props-grass-generate.cjs gen 2 --tries 4
 *   node scripts/props-grass-generate.cjs gen 2 --reuse-raw   re-run steps 2..6 only
 *   node scripts/props-grass-generate.cjs validate
 *   node scripts/props-grass-generate.cjs sheet
 *   node scripts/props-grass-generate.cjs integrate [indices]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');

// ── fal key from scripts/.env ──
try {
  const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const FAL_API_KEY = process.env.FAL_AI_API_KEY || process.env.FAL_API_KEY;

const ROOT = path.join(__dirname, '..');
const DIR_RAW = path.join(ROOT, 'assets', 'raw');
const DIR_NOBG = path.join(ROOT, 'assets', 'nobg');
const DIR_CROP = path.join(ROOT, 'assets', 'cropped');
const DIR_FINAL = path.join(ROOT, 'assets', 'final');
const DIR_REVIEW = path.join(ROOT, 'assets', 'style-test', 'props');
const SRC_PROPS = path.join(ROOT, 'src', 'assets', 'props');
const DIR_TILES = path.join(ROOT, 'src', 'assets', 'tiles', 'plains');

const FAMILY = 'grass';
const PREFIX = 'grass';
const TARGET_MAX = 400;
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const MIPS = [
  { suffix: '@half', scale: 0.5 },
  { suffix: '@quarter', scale: 0.25 },
  { suffix: '@eighth', scale: 0.125 },
];

// ══════════════════════════════════════
// PROMPTS
// ══════════════════════════════════════

// Shared style anchor.
//
// Structure copied from the accepted rock_sand ANCHOR: subject noun -> isolation
// clause -> "nothing underneath" clause -> camera -> COLOUR block -> MATERIAL
// block -> LIGHT block -> framing. Only the colour/material/light content is
// swapped for the plant.
//
// Two deliberate departures from the rock anchor:
//   * "NOTHING underneath" is stated POSITIVELY first ("the blades simply end in
//     mid-air"), because a bare negation of "soil" put a soil clod under three of
//     the swamp props. The negated list follows as a backstop only.
//   * the WIDTH driver lives in the anchor, not in the per-shape form: every
//     variant needs the arching/drooping fountain or it renders vertical.
const ANCHOR =
  'photorealistic studio photograph of one single dry dead straw-coloured grass tussock, ' +
  'the plant is isolated and cut out, floating in empty space against a plain flat uniform ' +
  'mid neutral grey seamless studio backdrop ' +
  '(the BACKDROP is grey, the GRASS itself is warm dry straw), ' +
  'the tussock floats freely and the blades simply end in mid-air at the bottom, ' +
  'nothing underneath it: no soil, no earth clod, no root ball, no turf, no sod, no dirt, ' +
  'no ground, no floor, no pot, no base plate, no pedestal, no cast shadow, ' +
  'seen from a three-quarter angle slightly above, isometric 2.5D game asset view, ' +
  'a dense wiry rosette of hundreds of fine narrow blades springing from one tight centre and ' +
  'arching outward in a low spreading fountain, the blades curve over and droop down at their tips ' +
  'so the whole clump is broad and squat, ' +
  'slender seed stalks with airy feathery panicles and drooping oat-like seed heads rise just above the blades, ' +
  'the colour is warm dry straw: wheat, oat beige, warm ochre tan, honey, light amber and hay yellow, ' +
  'deepening to rust brown and tobacco brown down in the shaded heart of the clump, ' +
  'sun-dried hay, dead winter grass at the end of a long drought, ' +
  'clearly DRY and STRAWY and BROWN-GOLDEN, definitely NOT green, NOT fresh, NOT lush, NOT living, ' +
  'brittle papery crisp blades, split frayed blade tips, a few blades snapped and kinked, ' +
  'fine crisp detail, the individual blades separated and readable against the backdrop, ' +
  'soft directional daylight from the upper LEFT, the upper-left blades catch the light, ' +
  'the right side and the inside of the clump fall away into deep shade, ' +
  'matte, natural earthy dry-field colours, high detail, sharp focus, crisp clean silhouette, ' +
  'centered in the frame with a generous empty margin on all sides';

// Folded into the prompt (flux-pro/v1.1 has no negative_prompt input).
// GREEN is the primary failure mode for this set and is listed first and at
// length: the plains tile already carries green tussocks, so a green prop is a
// dead asset even if every measured number passes.
const NEGATIVE =
  'Not green, not fresh green, not lush, not living, not growing, not spring grass, not lawn, ' +
  'not a meadow, not turf, not a lawn clump, no green blades, no green tips, no chlorophyll, ' +
  'not emerald, not olive green, not blue-green, not grey-green, not teal. ' +
  'No ground, no floor, no soil, no earth, no dirt clod, no mud, no root ball, no roots showing, ' +
  'no turf, no sod, no grass mat, no plinth, no pedestal, no plant pot, no planter, no vase, ' +
  'no basket, no bundle, no tied sheaf, no rope, no string, no cast shadow. ' +
  'No terrain, no landscape, no field, no scenery, no horizon, no sky, no other plants, no flowers, ' +
  'no rocks, no stones, no snow, no ice, no water. ' +
  'Not white, not bleached white, not paper white, not cream, not ivory, not grey, not colourless, ' +
  'not desaturated, not washed out, not black, not charcoal, not dark, not sooty, not burnt, not ash. ' +
  'Not a cartoon, not cel shaded, no outlines, no flat colour blocks, not low-poly, not 3D render, ' +
  'not a painting, not an illustration, not a sketch. ' +
  'No grid, no collage, no border, no frame, no text, no watermark, no label, no people, no hands.';

// The tussock must not render as a vertical bundle of reeds. Measured evidence:
// the swamp props built from reed/cattail wording landed at aspect 0.37..0.83,
// i.e. every single one of them below this set's 0.90 floor. The vertical nouns
// are therefore banned by name (a ban on a NOUN is safe — it is the negated
// ADJECTIVES that backfire), and the positive width driver lives in ANCHOR.
const UPRIGHT_NEGATIVE =
  'No reeds, no reed bed, no cattails, no bulrushes, no pampas grass plume, no bamboo, no cane, ' +
  'no corn, no wheat field, no single tall stalk, no vertical bundle, no broom, no besom, no whisk, ' +
  'no feather duster, no fountain of tall vertical stems, no portrait composition. ' +
  'The clump is low and spreading, it is at least as wide as it is tall.';

// Six silhouettes.
//
// All six lead with TUSSOCK and carry the anchor's arching/drooping fountain, so
// the material and the width driver are identical across the set; the variants
// differ in DENSITY, SPLAY and SEED-HEAD amount, which is what actually reads at
// 28 px. Generation canvases start wide (1152x832, ratio 1.385) because grass
// nouns bias vertical; the two variants that are meant to sit at the tall end of
// the aspect band get the squarer 1024x960.
//
// Seeds are the 87xxxx range (rock_sand used 85xxxx, driftwood 86xxxx) so the
// sets stay traceable apart.
const SHAPES = [
  {
    // Baseline: the plain dense tussock. Everything else is a deviation from this.
    seed: 870101,
    gen: { w: 1152, h: 832 },
    form:
      'ONE dense compact grass tussock, a tight round cushion of blades arching evenly outward on all sides, ' +
      'only a handful of short seed stalks poking out of the top. Broad and rounded, wider than it is tall.',
  },
  {
    // Widest of the six: the splay is doubled by describing the fountain as
    // reaching out sideways to left and right rather than upward.
    seed: 870208, // accepted on try 2 (870201 failed the aspect band)
    gen: { w: 1152, h: 832 },
    form:
      'ONE broad low grass tussock spread out flat and wide, the long blades reaching far out sideways to the ' +
      'left and to the right and bowing down almost to the level of their own base, a shallow open fan. ' +
      'Very wide and low.',
  },
  {
    // The seed-head variant.
    // r1 seed 870301 (canvas 1024x960, "tall slender seed stalks RISING out of it")
    // -> aspect 0.94. Numerically in band, visually the exact thing this set bans:
    // a pampas-grass plume, i.e. a vertical bundle of stems with a small cushion
    // under it. Two causes, both fixed here: "rising out of it" is an UPWARD verb
    // and it beat the anchor's arching fountain, and the portrait canvas gave the
    // plume the room to grow. r2 turns the same seed stalks OUTWARD ("lean out
    // sideways past the edges of the cushion") and moves to the wide canvas.
    seed: 870301,
    gen: { w: 1152, h: 832 },
    form:
      'ONE grass tussock with a broad low cushion of blades spreading out wide to both sides, and a loose ' +
      'scattering of short seed stalks leaning OUT sideways over the left and the right edge of that cushion, ' +
      'their nodding feathery seed heads hanging down just past the blade tips. The seed stalks lean outwards ' +
      'and downwards, they do not stand up.',
  },
  {
    // Silhouette variety through a second body: two clumps read as one wide
    // object at 28 px and give the set an asymmetric member.
    seed: 870408, // accepted on try 2 (870401: aspect 0.90 + contrast 0.22)
    gen: { w: 1152, h: 832 },
    form:
      'TWO grass tussocks growing right next to each other, a larger one on the right and a smaller one ' +
      'leaning against it on the left, their blades overlapping into one wide low double clump, ' +
      'a few loose fallen blades lying across the gap between them. Clearly wider than tall.',
  },
  {
    // Wind-combed: all blades laid over in one direction. Strong horizontal
    // silhouette and the most distinct profile of the six.
    seed: 870508, // accepted on try 2 (870501: aspect 1.87, over the cap)
    gen: { w: 1152, h: 832 },
    form:
      'ONE ragged wind-flattened grass tussock, every blade combed over to the same side by a steady wind so ' +
      'the clump leans and streams out to the right in a long low sweep, the base still tight and tufted. ' +
      'Low, swept and elongated sideways.',
  },
  {
    // Sparse and airy: fewer, thinner blades with gaps. The variant that reads
    // most as "thin dry grass" rather than a solid blob at small size.
    // r1 seed 870601 (canvas 1024x960) -> aspect 0.98 and, worse, it rendered as
    // a dense upright wheat sheaf: "sparse" and "airy" describe DENSITY, they say
    // nothing about direction, so the portrait canvas decided the silhouette.
    // r2 states the direction explicitly (sprawling out sideways, blades lying
    // almost flat) and moves to the wide canvas.
    seed: 870608, // accepted on try 2 of the r2 prompt (870601: aspect 1.68)
    gen: { w: 1152, h: 832 },
    form:
      'ONE sparse thin grass tussock sprawling low and wide, only a few dozen wiry blades left with big open ' +
      'gaps of empty space between them, the blades bent and kinked outwards at different angles and reaching ' +
      'far out to the left and right, several of them broken off short and lying almost flat, two or three bare ' +
      'seed stalks arching out sideways. Ragged, airy and see-through, sprawled wide and low.',
  },
];

const buildPrompt = (shape) =>
  `${shape.form} ${ANCHOR}. ${NEGATIVE} ${UPRIGHT_NEGATIVE}${shape.negExtra ? ` ${shape.negExtra}` : ''}`;

// ══════════════════════════════════════
// HTTP helpers
// ══════════════════════════════════════

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        if (res.statusCode >= 400) {
          reject(new Error(`fal ${res.statusCode}: ${raw.slice(0, 400)}`));
          return;
        }
        resolve(raw);
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
function get(url, headers) {
  const u = new URL(url);
  return request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers });
}
function post(host, p, body) {
  return request(
    {
      hostname: host,
      path: p,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
    },
    JSON.stringify(body),
  );
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function download(url) {
  return new Promise((resolve, reject) => {
    const go = (u) => {
      const mod = u.startsWith('https') ? https : http;
      mod
        .get(u, (res) => {
          if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
            go(res.headers.location);
            return;
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        })
        .on('error', reject);
    };
    go(url);
  });
}

// ══════════════════════════════════════
// Step 1 — generate
// ══════════════════════════════════════

async function generate(shape, seed) {
  const submit = JSON.parse(
    await post('queue.fal.run', '/fal-ai/flux-pro/v1.1', {
      // Form FIRST — appended after the long anchor it gets ignored.
      prompt: buildPrompt(shape),
      image_size: { width: shape.gen.w, height: shape.gen.h },
      num_images: 1,
      enable_safety_checker: false,
      safety_tolerance: '5',
      output_format: 'png',
      seed,
    }),
  );
  if (!submit.status_url) throw new Error('submit failed');
  process.stdout.write('    gen');
  for (let i = 0; i < 150; i++) {
    await sleep(2000);
    const st = JSON.parse(await get(submit.status_url, { Authorization: `Key ${FAL_API_KEY}` }));
    if (st.status === 'COMPLETED') {
      const r = JSON.parse(await get(submit.response_url, { Authorization: `Key ${FAL_API_KEY}` }));
      process.stdout.write(' ok\n');
      return download(r.images[0].url);
    }
    if (st.status === 'FAILED') throw new Error(`generation failed: ${JSON.stringify(st).slice(0, 200)}`);
    process.stdout.write('.');
  }
  throw new Error('generation timeout');
}

// ══════════════════════════════════════
// Step 2 — background removal + alpha cleanup
// ══════════════════════════════════════

async function removeBackground(png) {
  process.stdout.write('    birefnet');
  const r = JSON.parse(
    await post('fal.run', '/fal-ai/birefnet/v2', {
      image_url: `data:image/png;base64,${png.toString('base64')}`,
    }),
  );
  if (!r?.image?.url) throw new Error('birefnet returned no image');
  process.stdout.write(' ok\n');
  return download(r.image.url);
}

// GENTLER than the rock scripts (40/205). A rock has a hard silhouette and every
// semi-transparent pixel is halo; a grass blade one pixel wide is ENTIRELY
// semi-transparent, so a hard curve deletes the blade tips and the seed panicles
// — exactly the detail that makes the prop readable at 28 px.
const ALPHA_LO = 22;
const ALPHA_HI = 225;
function alphaLevels(data) {
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a <= ALPHA_LO) data[i] = 0;
    else if (a >= ALPHA_HI) data[i] = 255;
    else data[i] = Math.round(((a - ALPHA_LO) / (ALPHA_HI - ALPHA_LO)) * 255);
  }
}

// minFrac 0.01, not the rocks' 0.02: a detached seed head or an outlying blade is
// a legitimate component here and can be a percent or two of the main mass.
// Anything under 1% is birefnet noise — and it matters, because a single stray
// speck blows up the alpha bbox and fakes a transparent border into the crop.
function removeSpecks(data, w, h, minFrac = 0.01) {
  const n = w * h;
  const label = new Int32Array(n).fill(-1);
  const sizes = [];
  const stack = new Int32Array(n);
  let next = 0;
  for (let s = 0; s < n; s++) {
    if (data[s * 4 + 3] === 0 || label[s] !== -1) continue;
    let sp = 0;
    stack[sp++] = s;
    label[s] = next;
    let size = 0;
    while (sp > 0) {
      const p = stack[--sp];
      size++;
      const px = p % w;
      const py = (p - px) / w;
      for (const [ox, oy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = px + ox;
        const ny = py + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (label[q] !== -1 || data[q * 4 + 3] === 0) continue;
        label[q] = next;
        stack[sp++] = q;
      }
    }
    sizes.push(size);
    next++;
  }
  if (sizes.length <= 1) return 0;
  const biggest = Math.max(...sizes);
  let dropped = 0;
  for (let p = 0; p < n; p++) {
    const l = label[p];
    if (l >= 0 && sizes[l] < biggest * minFrac) {
      data[p * 4 + 3] = 0;
      dropped++;
    }
  }
  return dropped;
}

async function cleanAlpha(nobgPng) {
  const { data, info } = await sharp(nobgPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  alphaLevels(data);
  const dropped = removeSpecks(data, info.width, info.height);
  if (dropped > 0) console.log(`    specks removed: ${dropped}px`);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

// ══════════════════════════════════════
// Step 3 — tight crop
// ══════════════════════════════════════

async function alphaBBox(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('image is fully transparent');
  return { minX, minY, maxX, maxY, w, h };
}

async function tightCrop(png) {
  const b = await alphaBBox(png);
  return sharp(png)
    .extract({ left: b.minX, top: b.minY, width: b.maxX - b.minX + 1, height: b.maxY - b.minY + 1 })
    .png()
    .toBuffer();
}

// ══════════════════════════════════════
// Step 4 — tone normalisation
// ══════════════════════════════════════
//
// Same two-stage construction as props-rock-sand-generate.cjs: a symmetric hue
// pin on the R:B axis (kR * kB = 1, G untouched, so hue rotates without moving
// brightness), then a bidirectional luminance pin computed on the hue-pinned
// pixels so the stated target is what actually lands in the file.
//
// One guard is NEW and specific to this set: PRE_GR_MAX. A green render can pass
// an R/B test outright (fresh grass at rgb 110/130/60 measures R/B 1.83, dead
// centre of the band) while being exactly the asset we must not ship, because
// the plains tile already has green grass painted into it. Greenness is measured
// as G/R and a render that fails it is REGENERATED, never tinted: a uniform
// multiply cannot turn a green blade into a straw blade, it only yields a
// muddy-olive blade.

// 100 = centre of the 88..112 brief. The ground is 66.3, so the set lands ~1.5x
// its background — the same value ratio that made rock_sand read on desert_patch
// (128 on a 98..111 ground was 1.2x and was already enough there; the plains
// ground is darker, so the same absolute headroom means a bigger ratio).
const TONE_TARGET_LUM = 100;
const TONE_MIN_FACTOR = 0.55; // render came out far too bright -> reroll
const TONE_MAX_FACTOR = 1.6; // render came out far too dark   -> reroll
const PRE_RB_MIN = 1.3; // cold/grey render -> reroll, do not tint
const PRE_GR_MAX = 1.0; // G >= R means the render is GREEN -> reroll, do not tint
// Hue pin target. 1.85 sits in the middle of the 1.60..2.20 brief and clearly
// above the ground's 1.59, so the prop is always the warmer of the two.
const RB_TARGET = 1.85;
const HUE_MAX_K = 1.2; // per-channel cap; beyond this -> reroll, not tint

async function toneNormalise(png, name) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  // pass 1 — measure the raw render (opaque pixels only)
  let n = 0,
    sumR = 0,
    sumG = 0,
    sumB = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    sumR += data[i];
    sumG += data[i + 1];
    sumB += data[i + 2];
    n++;
  }
  const preRB = sumR / sumB;
  const preGR = sumG / sumR;
  if (preGR > PRE_GR_MAX)
    throw new Error(
      `${name}: generation is GREEN (G/R ${preGR.toFixed(2)} > ${PRE_GR_MAX}) — the plains tile already ` +
        `has green grass painted in, a green render cannot be tinted into straw, regenerate with a new seed`,
    );
  if (preRB < PRE_RB_MIN)
    throw new Error(
      `${name}: generation is not warm enough (R/B ${preRB.toFixed(2)} < ${PRE_RB_MIN}) — ` +
        `a grey render cannot be tinted into straw, regenerate with a new seed`,
    );

  // hue pin: symmetric R/B rotation, G untouched
  const kR = Math.sqrt(RB_TARGET / preRB);
  const kB = 1 / kR;
  if (kR > HUE_MAX_K || kR < 1 / HUE_MAX_K)
    throw new Error(
      `${name}: hue too far off the set (R/B ${preRB.toFixed(2)}, would need x${kR.toFixed(2)} on red, ` +
        `cap ${HUE_MAX_K}) — regenerate with a new seed`,
    );

  // luminance pin, computed on the HUE-PINNED pixels
  const hueMeanLum = (0.2126 * sumR * kR + 0.7152 * sumG + 0.0722 * sumB * kB) / n;
  const factor = TONE_TARGET_LUM / hueMeanLum;
  if (factor < TONE_MIN_FACTOR || factor > TONE_MAX_FACTOR)
    throw new Error(
      `${name}: generation off-target (meanLum ${hueMeanLum.toFixed(1)}, would need ` +
        `x${factor.toFixed(2)} outside ${TONE_MIN_FACTOR}..${TONE_MAX_FACTOR}) — regenerate with a new seed`,
    );

  console.log(
    `    tone: G/R ${preGR.toFixed(2)}, R/B ${preRB.toFixed(2)} -> ${RB_TARGET} (red x${kR.toFixed(3)}), ` +
      `meanLum ${hueMeanLum.toFixed(1)} -> x${factor.toFixed(3)}`,
  );

  // pass 2 — apply
  const mul = [kR * factor, factor, kB * factor];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) {
      data[i + c] = Math.min(255, Math.round(data[i + c] * mul[c]));
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

async function scaleToConvention(croppedPng) {
  const m = await sharp(croppedPng).metadata();
  const f = TARGET_MAX / Math.max(m.width, m.height);
  const w = Math.max(1, Math.round(m.width * f));
  const h = Math.max(1, Math.round(m.height * f));
  return sharp(croppedPng).resize(w, h, { fit: 'fill' }).png().toBuffer();
}

// ══════════════════════════════════════
// Step 5 — validation
// ══════════════════════════════════════

// Luminance band straight from the brief. TONE pins the mean at 100, so this is
// really a guard against a clipped render whose highlights saturate away.
const LUM_MIN = 88;
const LUM_MAX = 112;
// Warmth on the FINAL file. Floor 1.60 = the ground's own R/B: the prop is never
// allowed to be colder than what it stands on. Ceiling 2.20 keeps it out of
// orange-rust territory.
const RB_MIN = 1.6;
const RB_MAX = 2.2;
// Greenness ceiling on the FINAL file. Straw sits near G/R 0.80..0.88; anything
// at or above 0.95 is olive and starts to echo the tile's painted-in green.
const GR_MAX = 0.95;
// Contrast (std-dev of luminance / mean) over the opaque pixels. A tussock is
// mostly self-shadow between blades, so the histogram is broad; a flat blob of
// straw colour is not. Floor is deliberately low — it is a sanity check, not a
// style knob.
const CONTRAST_MIN = 0.25;
// Aspect band. The brief allows 0.90..1.60; the floor is pulled up to 1.10 after
// the first full run, for two reasons:
//   * ONE heightFactor has to serve all six variants, and the drawn width is
//     drawH * aspect — the narrower the spread, the more consistent the set looks
//     on the map. The first run measured 0.94..1.49 (1.58x width spread); the two
//     variants under 1.10 were the only ones responsible.
//   * every render that measured under 1.10 was also visually a vertical plume
//     (pampas / wheat sheaf), i.e. the reed silhouette UPRIGHT_NEGATIVE exists to
//     prevent. 1.10 is where the numeric guard and the visual verdict agree, so
//     the retry loop can enforce it instead of a human re-checking every render.
const ASPECT_MIN = 1.1;
const ASPECT_MAX = 1.6;

async function measure(pngPath) {
  const { data, info } = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let n = 0,
    lum = 0,
    lum2 = 0,
    sr = 0,
    sg = 0,
    sb = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lum += L;
    lum2 += L * L;
    sr += r;
    sg += g;
    sb += b;
    n++;
  }
  const meanLum = lum / n;
  const sd = Math.sqrt(Math.max(0, lum2 / n - meanLum * meanLum));
  const bbox = await alphaBBox(pngPath);
  return {
    w,
    h,
    aspect: w / h,
    meanLum,
    sd,
    contrast: sd / meanLum,
    r: sr / n,
    g: sg / n,
    b: sb / n,
    rb: sr / sb,
    gr: sg / sr,
    tight: bbox.minX === 0 && bbox.minY === 0 && bbox.maxX === w - 1 && bbox.maxY === h - 1,
  };
}

async function validate(name) {
  const p = path.join(DIR_FINAL, `${name}.png`);
  if (!fs.existsSync(p)) return { name, ok: false, problems: ['missing'], m: null };
  const m = await measure(p);
  const problems = [];
  if (Math.max(m.w, m.h) !== TARGET_MAX) problems.push(`max side ${Math.max(m.w, m.h)} != ${TARGET_MAX}`);
  if (m.aspect < ASPECT_MIN || m.aspect > ASPECT_MAX)
    problems.push(`aspect ${m.aspect.toFixed(2)} outside ${ASPECT_MIN}..${ASPECT_MAX}`);
  if (!m.tight) problems.push('not tight-cropped (transparent border)');
  if (m.meanLum < LUM_MIN) problems.push(`too dark (meanLum ${m.meanLum.toFixed(1)} < ${LUM_MIN})`);
  if (m.meanLum > LUM_MAX) problems.push(`too light (meanLum ${m.meanLum.toFixed(1)} > ${LUM_MAX})`);
  if (m.rb < RB_MIN) problems.push(`not warm enough (R/B ${m.rb.toFixed(2)} < ${RB_MIN})`);
  if (m.rb > RB_MAX) problems.push(`too orange (R/B ${m.rb.toFixed(2)} > ${RB_MAX})`);
  if (m.gr > GR_MAX) problems.push(`too green/olive (G/R ${m.gr.toFixed(2)} > ${GR_MAX})`);
  if (m.contrast < CONTRAST_MIN)
    problems.push(`surface too flat (contrast ${m.contrast.toFixed(2)} < ${CONTRAST_MIN})`);
  return { name, ok: problems.length === 0, problems, m };
}

// ══════════════════════════════════════
// Per-variant run
// ══════════════════════════════════════

async function runVariant(idx, seedOverride, reuseRaw) {
  const name = `${PREFIX}_${idx}`;
  const shape = SHAPES[idx];
  const seed = seedOverride ?? shape.seed;
  console.log(`\n[${name}] seed ${seed}`);

  const rawPath = path.join(DIR_RAW, `${name}_raw.png`);
  let raw;
  if (reuseRaw && fs.existsSync(rawPath)) {
    raw = fs.readFileSync(rawPath);
    console.log('    raw: reused');
  } else {
    raw = await generate(shape, seed);
    fs.writeFileSync(rawPath, raw);
  }

  const nobg = await cleanAlpha(await removeBackground(raw));
  fs.writeFileSync(path.join(DIR_NOBG, `${name}_nobg.png`), nobg);

  const cropped = await toneNormalise(await tightCrop(nobg), name);
  fs.writeFileSync(path.join(DIR_CROP, `${name}_cropped.png`), cropped);

  const final = await scaleToConvention(cropped);
  fs.writeFileSync(path.join(DIR_FINAL, `${name}.png`), final);

  const v = await validate(name);
  console.log(
    `    -> ${v.m.w}x${v.m.h} aspect ${v.m.aspect.toFixed(2)} lum ${v.m.meanLum.toFixed(1)} ` +
      `rgb ${v.m.r.toFixed(0)}/${v.m.g.toFixed(0)}/${v.m.b.toFixed(0)} R/B ${v.m.rb.toFixed(2)} ` +
      `G/R ${v.m.gr.toFixed(2)} contrast ${v.m.contrast.toFixed(2)} ` +
      `${v.ok ? 'PASS' : 'FAIL: ' + v.problems.join('; ')}`,
  );
  return v;
}

// ══════════════════════════════════════
// Review sheets
// ══════════════════════════════════════

/** Iso lattice of REAL plains tiles — the actual ground this set has to sit on. */
async function groundSlab(width, height, tileW) {
  const tileH = Math.round(tileW / 2);
  const tiles = [];
  for (let i = 0; i < 4; i++) {
    const p = path.join(DIR_TILES, `plains_${i}.webp`);
    if (fs.existsSync(p)) tiles.push(await sharp(p).resize(tileW, tileH, { fit: 'fill' }).png().toBuffer());
  }
  const comp = [];
  let k = 0;
  for (let row = -1; row * (tileH / 2) < height + tileH; row++) {
    for (let col = -1; col * tileW < width + tileW; col++) {
      comp.push({
        input: tiles[k++ % tiles.length],
        left: Math.round(col * tileW + (row & 1 ? tileW / 2 : 0)),
        top: Math.round((row * tileH) / 2),
      });
    }
  }
  return sharp({
    create: { width, height, channels: 4, background: { r: 60, g: 54, b: 38, alpha: 1 } },
  })
    .composite(comp)
    .png()
    .toBuffer();
}

async function finalsFor(prefix, dir) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const p = path.join(dir, `${prefix}_${i}.png`);
    if (fs.existsSync(p)) out.push(p);
  }
  return out;
}

function label(text, w, h, size = 13) {
  const svg = `<svg width="${w}" height="${h}"><text x="4" y="${size}" font-family="monospace" font-size="${size}" fill="#ffffff" stroke="#000000" stroke-width="3" paint-order="stroke">${text}</text></svg>`;
  return Buffer.from(svg);
}

/** 1) plain contact sheet */
async function sheetPlain() {
  const files = await finalsFor(PREFIX, DIR_FINAL);
  if (!files.length) return;
  const CELL = 260,
    COLS = 3;
  const rows = Math.ceil(files.length / COLS);
  const comp = [];
  for (let i = 0; i < files.length; i++) {
    const m = await sharp(files[i]).metadata();
    comp.push({
      input: await sharp(files[i])
        .resize(CELL - 16, CELL - 34, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer(),
      left: (i % COLS) * CELL + 8,
      top: Math.floor(i / COLS) * CELL + 8,
    });
    comp.push({
      input: label(`${i}  ${m.width}x${m.height}  a=${(m.width / m.height).toFixed(2)}`, CELL, 20),
      left: (i % COLS) * CELL,
      top: Math.floor(i / COLS) * CELL + CELL - 22,
    });
  }
  const out = path.join(DIR_REVIEW, `${PREFIX}_sheet.png`);
  await sharp({
    create: { width: COLS * CELL, height: rows * CELL, channels: 4, background: { r: 96, g: 92, b: 84, alpha: 1 } },
  })
    .composite(comp)
    .png()
    .toFile(out);
  console.log(`[sheet] ${out}`);
}

/** 2) the 6 tussocks large, standing on real plains ground */
async function sheetOnPlains() {
  const files = await finalsFor(PREFIX, DIR_FINAL);
  if (!files.length) return;
  const CELL_W = 300,
    CELL_H = 240,
    COLS = 3,
    PROP_H = 170;
  const rows = Math.ceil(files.length / COLS);
  const W = COLS * CELL_W,
    H = rows * CELL_H;
  const bg = await groundSlab(W, H, 300);
  const comp = [];
  for (let i = 0; i < files.length; i++) {
    const m = await sharp(files[i]).metadata();
    const w = Math.round(PROP_H * (m.width / m.height));
    comp.push({
      input: await sharp(files[i]).resize(w, PROP_H, { fit: 'fill' }).png().toBuffer(),
      left: (i % COLS) * CELL_W + Math.round((CELL_W - w) / 2),
      top: Math.floor(i / COLS) * CELL_H + Math.round((CELL_H - PROP_H) / 2),
    });
  }
  const out = path.join(DIR_REVIEW, `${PREFIX}_on_plains.png`);
  await sharp(bg).composite(comp).png().toFile(out);
  console.log(`[sheet] ${out}`);
}

/**
 * 3) THE verdict sheet: real in-game geometry (TW = 48, PROP_BASE_HEIGHT = 28) on
 * real plains ground, swept over candidate PROP_HEIGHT_FACTORS values, upscaled
 * nearest-neighbour so the 1:1 pixels stay visible.
 *
 * Row 1.00 is what ships if NO factor is registered — a grass tussock drawn as
 * tall as a tree. The remaining rows bracket the recommendation.
 */
async function sheetGameSize() {
  const TW = 48,
    PROP_BASE_H = 28,
    ZOOM = 7;
  const files = await finalsFor(PREFIX, DIR_FINAL);
  if (!files.length) return;

  const FACTORS = [1.0, 0.55, 0.45, 0.4, 0.35, 0.3];
  const stripH = 40;
  const W = 6 * TW + 40;
  const H = stripH * FACTORS.length;
  const bg = await groundSlab(W, H, TW);

  const comp = [];
  for (let f = 0; f < FACTORS.length; f++) {
    const drawH = Math.max(1, Math.round(PROP_BASE_H * FACTORS[f]));
    const baseline = f * stripH + stripH - 6;
    for (let i = 0; i < files.length; i++) {
      const m = await sharp(files[i]).metadata();
      const w = Math.max(1, Math.round(drawH * (m.width / m.height)));
      comp.push({
        input: await sharp(files[i]).resize(w, drawH, { fit: 'fill' }).png().toBuffer(),
        left: 36 + i * TW + Math.round((TW - w) / 2),
        top: baseline - drawH,
      });
    }
  }
  const flat = await sharp(bg).composite(comp).png().toBuffer();
  const zoomed = await sharp(flat)
    .resize(W * ZOOM, H * ZOOM, { kernel: 'nearest' })
    .png()
    .toBuffer();
  // labels go on AFTER the nearest-neighbour upscale so the text stays crisp
  const labels = FACTORS.map((f, i) => ({
    input: label(`heightFactor ${f.toFixed(2)}  ->  drawH ${Math.round(PROP_BASE_H * f)}px`, W * ZOOM, 24, 18),
    left: 6,
    top: i * stripH * ZOOM + 6,
  }));
  const out = path.join(DIR_REVIEW, `${PREFIX}_gamesize.png`);
  await sharp(zoomed).composite(labels).png().toFile(out);
  console.log(`[sheet] ${out}   (heightFactor sweep on real plains tiles, ${ZOOM}x nearest)`);
}

/**
 * 4) scatter check at the recommended factor: many tussocks over a larger patch
 * of plains, which is the only way to see whether the prop separates from the
 * grass ALREADY PAINTED INTO the tile or just adds more of the same noise.
 */
async function sheetScatter(factor = 0.4) {
  const TW = 48,
    PROP_BASE_H = 28,
    ZOOM = 5;
  const files = await finalsFor(PREFIX, DIR_FINAL);
  if (!files.length) return;
  // The iso lattice advances only tileH/2 = TW/4 per row, so the row count must
  // be 4x the tile count to fill the slab — sizing H off ROWS*TW/2 leaves the
  // bottom half of the sheet bare ground.
  const COLS = 9,
    ROWS = 16;
  const W = COLS * TW,
    H = Math.round((ROWS * TW) / 4) + 24;
  const bg = await groundSlab(W, H, TW);
  const drawH = Math.max(1, Math.round(PROP_BASE_H * factor));
  const comp = [];
  let k = 0;
  // one prop per second tile centre of the iso lattice
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if ((row + col) % 2 === 1) continue;
      const f = files[k++ % files.length];
      const m = await sharp(f).metadata();
      const w = Math.max(1, Math.round(drawH * (m.width / m.height)));
      const cx = Math.round(col * TW + (row & 1 ? TW / 2 : 0) + TW / 2);
      const cy = Math.round((row * TW) / 4 + TW / 4) + 10;
      comp.push({
        input: await sharp(f).resize(w, drawH, { fit: 'fill' }).png().toBuffer(),
        left: cx - Math.round(w / 2),
        top: cy - drawH,
      });
    }
  }
  const flat = await sharp(bg).composite(comp).png().toBuffer();
  const out = path.join(DIR_REVIEW, `${PREFIX}_scatter_${String(Math.round(factor * 100)).padStart(3, '0')}.png`);
  await sharp(flat)
    .resize(W * ZOOM, H * ZOOM, { kernel: 'nearest' })
    .composite([{ input: label(`scatter @ heightFactor ${factor.toFixed(2)} on real plains tiles`, W * ZOOM, 26, 18), left: 6, top: 6 }])
    .png()
    .toFile(out);
  console.log(`[sheet] ${out}`);
}

async function sheet() {
  fs.mkdirSync(DIR_REVIEW, { recursive: true });
  await sheetPlain();
  await sheetOnPlains();
  await sheetGameSize();
  // Bracket the recommendation so the heightFactor decision is made on evidence.
  for (const f of [0.35, 0.4, 0.5]) await sheetScatter(f);
}

// ══════════════════════════════════════
// Integrate
// ══════════════════════════════════════

async function integrate(indices = SHAPES.map((_, i) => i)) {
  const dir = path.join(SRC_PROPS, FAMILY);
  fs.mkdirSync(dir, { recursive: true });
  for (const i of indices) {
    const name = `${PREFIX}_${i}`;
    const src = path.join(DIR_FINAL, `${name}.png`);
    if (!fs.existsSync(src)) {
      console.log(`  SKIP ${name} (no final png)`);
      continue;
    }
    const v = await validate(name);
    if (!v.ok) throw new Error(`refusing to integrate ${name}: ${v.problems.join('; ')}`);
    await sharp(src).webp(WEBP).toFile(path.join(dir, `${name}.webp`));
    const m = await sharp(src).metadata();
    for (const mip of MIPS) {
      await sharp(src)
        .resize(Math.max(1, Math.round(m.width * mip.scale)), Math.max(1, Math.round(m.height * mip.scale)), {
          fit: 'fill',
        })
        .webp(WEBP)
        .toFile(path.join(dir, `${name}${mip.suffix}.webp`));
    }
    console.log(`  ${FAMILY}/${name}.webp  ${m.width}x${m.height} (+3 mips)`);
  }
}

// ══════════════════════════════════════
// main
// ══════════════════════════════════════

(async () => {
  const argv = process.argv.slice(2);
  const cmd = argv[0] || 'gen';
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const seedIdx = argv.indexOf('--seed');
  const seedOverride = seedIdx >= 0 ? parseInt(argv[seedIdx + 1], 10) : null;
  // Skip the VALUE of every value-taking flag by position, otherwise `--tries 4`
  // makes 4 look like a variant index.
  const valuePositions = new Set();
  for (const f of ['--seed', '--tries']) {
    const at = argv.indexOf(f);
    if (at >= 0) valuePositions.add(at + 1);
  }
  const idxArgs = argv
    .map((a, i) => ({ a, i }))
    .filter(({ a, i }) => i > 0 && /^\d+$/.test(a) && !valuePositions.has(i))
    .map(({ a }) => Number(a));
  const indices = idxArgs.length ? idxArgs : SHAPES.map((_, i) => i);

  for (const d of [DIR_RAW, DIR_NOBG, DIR_CROP, DIR_FINAL, DIR_REVIEW]) fs.mkdirSync(d, { recursive: true });

  if (cmd === 'sheet') return sheet();
  if (cmd === 'integrate') return integrate(indices);
  if (cmd === 'prompt') {
    console.log(buildPrompt(SHAPES[indices[0]]));
    return;
  }
  if (cmd === 'validate') {
    for (const i of indices) {
      const v = await validate(`${PREFIX}_${i}`);
      console.log(
        v.m
          ? `${v.name.padEnd(10)} ${v.m.w}x${v.m.h} aspect ${v.m.aspect.toFixed(2)} lum ${v.m.meanLum.toFixed(1)} ` +
              `rgb ${v.m.r.toFixed(0)}/${v.m.g.toFixed(0)}/${v.m.b.toFixed(0)} R/B ${v.m.rb.toFixed(2)} ` +
              `G/R ${v.m.gr.toFixed(2)} contrast ${v.m.contrast.toFixed(2)} tight=${v.m.tight} ` +
              `${v.ok ? 'PASS' : 'FAIL: ' + v.problems.join('; ')}`
          : `${v.name.padEnd(10)} MISSING`,
      );
    }
    return;
  }

  if (!FAL_API_KEY) {
    console.error('No fal key (FAL_AI_API_KEY) in scripts/.env');
    process.exit(1);
  }

  const reuseRaw = flags.has('--reuse-raw');
  // `--tries N` re-rolls a failing variant with SEED-ONLY changes, up to N times,
  // stopping at the first PASS. Aspect has a measured seed-to-seed spread of
  // roughly +/-0.25 on an unchanged prompt, so a prompt aimed at the middle of the
  // band still misses on individual seeds. Every try is logged with its seed and
  // the accepted seed must be written back into SHAPES.
  const triesIdx = argv.indexOf('--tries');
  const tries = triesIdx >= 0 ? parseInt(argv[triesIdx + 1], 10) : 1;
  const SEED_STEP = 7;

  const results = [];
  for (const i of indices) {
    let last = null;
    for (let t = 0; t < tries; t++) {
      const seed = (seedOverride ?? SHAPES[i].seed) + t * SEED_STEP;
      try {
        last = await runVariant(i, seed, reuseRaw && t === 0);
      } catch (e) {
        console.log(`    !! ${e.message}`);
        last = { name: `${PREFIX}_${i}`, ok: false, problems: [e.message], m: null, seed };
      }
      last.seed = seed;
      if (last.ok) {
        if (t > 0) console.log(`    ACCEPTED on try ${t + 1} — write seed ${seed} into SHAPES[${i}]`);
        break;
      }
    }
    results.push(last);
  }

  console.log('\n── summary ──');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  seed ${r.seed}  ${r.problems.join('; ')}`);
  await sheet();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
