/**
 * Asset-Pipeline: surface PROP sprites — dark cracked rocks, two sets.
 *
 *   rock_0..5        mossy    -> biomes mountain / rocky_desert
 *   rock_arid_0..5   dry      -> biomes beach / desert_patch
 *
 * Both sets are the SAME rock type: the arid set is generated first and the
 * mossy set is DERIVED from the identical raw image with flux-pro/kontext
 * ("add moss"). That guarantees identical geometry, colour family and crack
 * detail — the two sets differ ONLY by the moss, which is exactly the brief.
 *
 * Replaces the Batch-1 rocks from commit 18e8e37 (light grey-brown sandstone,
 * smooth faces). New look: near-black charcoal/slate stone, deep fissures and
 * spalled flakes, rough pitted surface.
 *
 * BATCH-2 RE-ROLL (variants 2 and 5): the first Batch-2 run asked for an
 * "upright blocky slab" (2) and a "stout standing stone" (5). flux read both as
 * menhirs and returned 209x400 / 179x400 portrait steles that look artificial on
 * the ground plane. Both were re-rolled as normal LYING boulders (flat tabular
 * slab / squat shattered chunk) with the upright vocabulary moved into a
 * per-shape negative (`negExtra`). Variants 0, 1, 3, 4 are SIGNED OFF and their
 * prompt strings are byte-identical to the accepted run — do not touch them.
 * Variants 2 and 5 also use a sparser per-shape moss prompt (`mossPrompt`),
 * because the accepted 1 / 3 read a little too "forest floor" on the top face.
 *
 * PIPELINE (per variant, per CLAUDE.md Phase 2b)
 *   1. fal-ai/flux-pro/v1.1, fixed seed, per-shape canvas, flat mid-grey bg
 *                                                           -> assets/raw/<name>_raw.png
 *      (mossy set: fal-ai/flux-pro/kontext moss edit on the ARID raw of the same index)
 *   2. fal-ai/birefnet/v2 background removal                -> assets/nobg/<name>_nobg.png
 *      + alpha levels curve (kills the mid-grey fringe halo) + speck removal
 *   3. tight crop on alpha (first/last visible pixel, all 4 sides)
 *   4. tone normalise: uniform multiply to a fixed BARE-STONE luminance + warm shift
 *                                                           -> assets/cropped/<name>_cropped.png
 *   5. scale so max(w, h) = 400 px, aspect preserved, NO padding
 *                                                           -> assets/final/<name>.png
 *   6. validate: dimensions, tight crop, aspect band, darkness, moss coverage
 *   integrate: PNG -> webp q90 + @half/@quarter/@eighth     -> src/assets/props/<family>/
 *
 * MODEL NOTE: flux/dev was tried first and reliably produced a cel-shaded
 * low-poly "game asset" rock with painted-on cracks and a cobblestone floor —
 * i.e. the exact Batch-1 failure mode. flux-pro/v1.1 with a photographic prompt
 * gives the rough, deeply fractured, matte stone the brief asks for. It has no
 * negative_prompt input, so the negatives are folded into the prompt text.
 *
 * PROP SIZE CONVENTION (measured from src/assets/props/, NOT the 1024x512 tile
 * rule in CLAUDE.md — props are a different family):
 *   - tight-cropped, aspect preserved, NO fixed canvas, NO transparent padding
 *   - RGBA webp with real alpha
 *   - existing rock family: max side 338..426 px  => target 400
 *   - LOD: <name>@half / @quarter / @eighth = Math.round(dim * 0.5 / 0.25 / 0.125),
 *     webp { quality: 90, effort: 4, smartSubsample: true } (same as
 *     scripts/generate-mipmaps.ts)
 *   - on-screen size does NOT depend on the pixel size: PlanetSurface draws every
 *     prop at PROP_BASE_HEIGHT (28px) * scale and derives the width from the
 *     sprite ASPECT RATIO. Pixel dimensions only set the resolution budget.
 *
 * fal key from scripts/.env (FAL_AI_API_KEY) — never hardcode, never log, never commit.
 *
 * Usage:
 *   node scripts/props-rock-generate.cjs gen                 all 12 (arid base + mossy derive)
 *   node scripts/props-rock-generate.cjs gen 0 3 5           only those variant indices
 *   node scripts/props-rock-generate.cjs gen 2 --seed 999123 re-roll variant 2 with a new seed
 *   node scripts/props-rock-generate.cjs gen --arid-only
 *   node scripts/props-rock-generate.cjs gen --moss-only     re-derive moss from existing arid raws
 *   node scripts/props-rock-generate.cjs validate            re-validate assets/final
 *   node scripts/props-rock-generate.cjs sheet               contact sheet for visual review
 *   node scripts/props-rock-generate.cjs integrate           assets/final -> src/assets/props/
 *   node scripts/props-rock-generate.cjs integrate 2 5       only those variants
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

const TARGET_MAX = 400; // final max side, matches the existing rock family
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const MIPS = [
  { suffix: '@half', scale: 0.5 },
  { suffix: '@quarter', scale: 0.25 },
  { suffix: '@eighth', scale: 0.125 },
];

// ══════════════════════════════════════
// PROMPTS
// ══════════════════════════════════════

// Shared style anchor — identical for all 6 variants so the set reads as ONE
// rock type. Tuned against the Batch-1 failure mode (too light, too smooth):
// the darkness and the fracturing are both stated redundantly on purpose.
const ANCHOR =
  'photorealistic studio photograph of one single small weathered boulder of very dark rock, ' +
  'the rock is isolated and cut out, floating against a plain flat uniform mid-grey seamless backdrop, ' +
  'NOTHING underneath the rock: no ground, no soil, no floor, no pedestal, no base plate, no paving, no cast shadow, ' +
  'seen from a three-quarter angle slightly above, ' +
  'the stone is a very dark warm charcoal: dark umber brown-grey, earthy warm dark stone, ' +
  'warm neutral tone, NOT cool grey, NOT blue-grey, very dark value, dim moody lighting, ' +
  'heavily fractured geology: deep jagged open fissures and split cracks cutting right through the rock, ' +
  'sharp broken flakes, spalled scars, chipped crumbling edges, ' +
  'coarse pitted grainy weathered granite texture, rough and gritty, fine surface detail, no smooth polished faces, ' +
  'soft directional light from the upper left, very deep dark shadows on the lower-right faces, matte non-reflective, ' +
  'muted desaturated colours, high detail, sharp focus, crisp clean silhouette, ' +
  'centered in the frame with a generous empty margin on all sides';

// Folded into the prompt (flux-pro/v1.1 has no negative_prompt input).
const NEGATIVE =
  'No ground, no floor, no soil, no sand, no paving, no cobblestones, no pedestal, no platform, no cast shadow. ' +
  'No terrain, no landscape, no scenery, no horizon, no sky. ' +
  'Not light grey, not pale, not white, not beige sandstone, not tan, not bright, not washed out. ' +
  'Not a cartoon, not cel shaded, no outlines, no flat colour blocks, not low-poly, not faceted, ' +
  'not smooth, not polished, not glossy, not shiny, not wet. ' +
  'No moss, no lichen, no grass, no vegetation, no snow, no ice, no water. ' +
  'No grid, no collage, no border, no text, no watermark, no people.';

// Per-shape negative for the two RE-ROLLED variants (2, 5). The original
// Batch-2 prompts described them as "standing upright" / "standing stone" and
// flux locked onto the menhir archetype. Every word from that archetype is
// listed here so the re-roll cannot drift back. Applied ONLY to shapes that
// declare `negExtra`, so the prompt strings of the signed-off 0/1/3/4 stay
// byte-identical and reproducible.
const UPRIGHT_NEGATIVE =
  'The rock is NOT taller than it is wide, it is NOT upright, NOT standing on end, NOT vertical, NOT tall. ' +
  'No standing stone, no menhir, no dolmen, no stele, no obelisk, no monolith, no monument, no gravestone, ' +
  'no headstone, no pillar, no column, no pedestal, no plinth, no tower, no spire, no pinnacle, no needle, ' +
  'no rock spike, no hoodoo, no sea stack, no portrait composition, no vertical slab on edge.';

// Moss derive (flux-pro/kontext). Kept short — kontext edits degrade with long
// prompts. Explicitly pins shape/colour/background so only the moss changes.
const MOSS_PROMPT =
  'Add sparse patches of dark green moss and grey-green lichen to this rock. ' +
  'Moss only on the top surface and inside the cracks and crevices, small patchy clumps, ' +
  'most of the dark stone stays bare. ' +
  'Keep the rock shape, the dark colour, the cracks and the plain grey background exactly the same.';

// Sparser variant for the re-rolled 2 / 5: the accepted 1 / 3 carry a fairly
// closed moss blanket on the top face which reads as forest floor rather than
// mountain stone. Here the moss is pushed into the cracks and hollows only.
//
// The closing sentence is a TEXTURE GUARD, not decoration. Asking kontext for
// "very sparse" moss leaves it little to do, and on rock_2 it spent the edit
// budget on the stone instead: smoothed the broad front face and punched round
// craters into it, so the mossy 2 stopped matching the arid 2 it is supposed to
// be identical to.
//
// The guard MUST be phrased positively. A first version ended with "do not add
// holes, pits, dents or round cavities" and made it strictly worse — kontext
// attends to those nouns and paints them in, the usual diffusion negation
// failure. Same for "hollows" as a moss location. So: name where the moss goes
// (cracks, facet edges), then state what stays unchanged — never name an
// artefact you do not want.
const MOSS_PROMPT_SPARSE =
  'Add a few small isolated specks of dark green moss and grey-green lichen to this rock, ' +
  'following the cracks and the lower edges where the broken facets meet. Very sparse, tiny scattered ' +
  'patches, no continuous moss blanket on the top surface, the large majority of the dark stone stays ' +
  'completely bare. Change nothing else: same rock shape, same dark colour, same sharp cracks, ' +
  'same rough grainy stone surface, same plain grey background.';

// Six distinct silhouettes / footprints — same material, different form and
// aspect ratio (aspect is what actually varies the on-screen width, see header).
// The generation canvas aspect is set per shape: flux fills the frame, so a
// square canvas silently turns every "tall spire" / "wide slab" back into a
// round boulder. Canvas aspect + an explicit silhouette sentence FIRST in the
// prompt is what actually controls the form.
const SHAPES = [
  {
    seed: 810101,
    gen: { w: 1024, h: 896 },
    form:
      'One chunky angular boulder with a second smaller broken-off block resting beside it on the left, ' +
      'both split by deep cracks. Wide composition, clearly wider than tall.',
  },
  {
    seed: 810203,
    gen: { w: 1152, h: 832 },
    form:
      'One single broad LOW WIDE boulder with a rounded eroded dome top and a wide flat base, ' +
      'a long crack running right across the top. Wide and low, clearly wider than it is tall.',
  },
  {
    // RE-ROLL (see header): was an upright cleaved slab -> flux made a menhir.
    // Now a flat tabular findling lying flat on the ground. The distinguishing
    // silhouette vs 0/1/3/4 is the LOW PLATE profile with visible bedding layers
    // along the rim, not the aspect ratio.
    // Aspect history — the words "slab / tabular / plate / lying flat" turn out
    // to drive WIDTH far harder than the canvas does:
    //   a1 seed 820219, canvas 1120x832, "flat tabular slab, squashed pancake"
    //      -> 400x219 aspect 1.83  (over the 1.75 renderer cap, read as a disc)
    //   a2 seed 820227, canvas 1024x896, "thick tabular slab, tilted"
    //      -> 400x195 aspect 2.05  (worse — the thickness wording did not bite)
    //   a3 seed 820233, canvas 1024x960, "stacked bedded strata, stepped terraced"
    //      -> 400x345 aspect 1.16, passes the validator but the strata wording
    //      produced a stack-of-pancakes tower — artificial in the same way the
    //      menhir was, so rejected on visual review.
    //   a4 seed 820241, canvas 1088x896, whaleback erratic, "roughly twice as
    //      wide as it is high" -> 400x185 aspect 2.16. The stated ratio is taken
    //      almost literally, and "elongated / long" compounds it.
    //   a5 seed 820247, same canvas, whaleback with "one and a half times as wide"
    //      -> 400x127 aspect 3.15. Stating a ratio does NOT control the aspect;
    //      the ARCHETYPE does. "slab / plate / tabular / loaf / whaleback" are all
    //      intrinsically elongated when shot from three-quarters above and always
    //      overshoot the 1.75 cap.
    //   a6 seed 820253 (kept): "plattig" reinterpreted as a FLAT-TOPPED chunky
    //      boulder rather than a flat-shaped one — table-like top face, blocky
    //      steep flanks. Same recipe shape as the successful variant 5: chunky
    //      noun, no ratio phrase, plain "wider than it is tall".
    seed: 820253,
    // The default derive (seed+1) softened this rock's broad front face and lost
    // its cracks — it has more flat area than the other five, so kontext has more
    // room to invent. 840311 keeps the fissures and the grain.
    mossSeed: 840311,
    gen: { w: 1088, h: 896 },
    form:
      'One single low broad boulder sitting on the ground with a flat table-like top surface, ' +
      'its flanks blocky and steep with chipped broken-off corners, a deep crack splitting the flat ' +
      'top from front to back, one thick flake spalled away from a shoulder exposing a fresh facet. ' +
      'A solid chunky rock with real depth and height, only somewhat wider than it is tall, ' +
      'NOT stacked, NOT layered, NOT terraced, NOT elongated, one solid single rock.',
    negExtra: UPRIGHT_NEGATIVE,
    mossPrompt: MOSS_PROMPT_SPARSE,
  },
  {
    seed: 810411,
    gen: { w: 1152, h: 832 },
    form:
      'A CLUSTER of one medium boulder with six small rubble stones and broken shards scattered around its base. ' +
      'Very wide low arrangement, much wider than tall.',
  },
  {
    seed: 810513,
    gen: { w: 1088, h: 896 },
    form:
      'One broken wedge-shaped rock with a thick fractured shelf on top and one sheared-off side, ' +
      'split by branching cracks. A solid chunky boulder, only slightly wider than it is tall, ' +
      'NOT a thin plate, NOT a flat slab, it has real depth and height.',
  },
  {
    // RE-ROLL (see header): was a "stout standing stone" -> flux made a stele.
    // Now a squat, heavily shattered chunk. Distinguishing silhouette vs 0/1/3/4
    // is the notched, spall-scarred profile with fresh broken facets.
    seed: 820523,
    gen: { w: 1088, h: 896 },
    form:
      'One compact squat chunk of rock resting solidly on the ground, heavily shattered: several large ' +
      'angular flakes have broken away leaving fresh sharp facets and a deeply notched jagged profile, ' +
      'a couple of loose splinters still clinging to its lower right side. A low squat block sitting on ' +
      'the ground, wider than it is tall, NOT a thin plate, NOT a flat slab, it has real depth.',
    negExtra: UPRIGHT_NEGATIVE,
    mossPrompt: MOSS_PROMPT_SPARSE,
  },
];

const SETS = {
  rock: { family: 'rock', prefix: 'rock', moss: true },
  rock_arid: { family: 'rock_arid', prefix: 'rock_arid', moss: false },
};

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
// Step 1 — generate / derive
// ══════════════════════════════════════

// flux-pro/v1.1 (no negative_prompt support) renders the semi-realistic, matte,
// muted look the existing prop family (tree / swamp / shrub) has. flux/dev was
// tried first and reliably produced a cel-shaded low-poly "game asset" rock with
// painted-on cracks — the exact Batch-1 failure mode. The NEGATIVE list is
// therefore folded into the prompt as plain "no X" phrases.
async function generate(shape, seed) {
  const submit = JSON.parse(
    await post('queue.fal.run', '/fal-ai/flux-pro/v1.1', {
      // Form FIRST: appended to the end of a long anchor it gets ignored.
      // `negExtra` is opt-in per shape — shapes without it keep the exact prompt
      // string of the signed-off run.
      prompt: `${shape.form} ${ANCHOR}. ${NEGATIVE}${shape.negExtra ? ` ${shape.negExtra}` : ''}`,
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

async function deriveMoss(basePng, seed, prompt = MOSS_PROMPT) {
  process.stdout.write('    moss-kontext');
  const r = JSON.parse(
    await post('fal.run', '/fal-ai/flux-pro/kontext', {
      image_url: `data:image/png;base64,${basePng.toString('base64')}`,
      prompt,
      num_images: 1,
      safety_tolerance: '5',
      seed,
    }),
  );
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('kontext returned no image');
  process.stdout.write(' ok\n');
  return download(url);
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

/**
 * Alpha levels curve: remaps a in [LO..HI] to [0..255] and clamps outside.
 * Removes the faint semi-transparent halo birefnet leaves around the subject
 * (which would otherwise carry mid-grey background colour into the sprite)
 * while keeping real anti-aliasing on the silhouette.
 */
const ALPHA_LO = 40;
const ALPHA_HI = 205;
function alphaLevels(data) {
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a <= ALPHA_LO) data[i] = 0;
    else if (a >= ALPHA_HI) data[i] = 255;
    else data[i] = Math.round(((a - ALPHA_LO) / (ALPHA_HI - ALPHA_LO)) * 255);
  }
}

/**
 * Drop opaque connected components smaller than `minFrac` of the largest one.
 * birefnet occasionally leaves a few stray pixels which would wreck the tight
 * crop (the bbox would include a speck far from the rock).
 */
function removeSpecks(data, w, h, minFrac = 0.02) {
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
  const { data, info } = await sharp(nobgPng)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  alphaLevels(data);
  const dropped = removeSpecks(data, info.width, info.height);
  if (dropped > 0) console.log(`    specks removed: ${dropped}px`);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

// ══════════════════════════════════════
// Step 3 — tight crop (CLAUDE.md rule: first/last visible pixel on all 4 sides)
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
// Step 4 — scale to the prop size convention
// ══════════════════════════════════════

/**
 * Moss classifier. The moss flux paints is a WARM OLIVE and the warm tone step
 * lifts red further, so a naive "g > r" test reports 0%. Green-vs-BLUE
 * separation is what discriminates: measured 0.00% on the arid set vs 8-14% on
 * the mossy set — a clean gap.
 */
function isMoss(r, g, b) {
  return g - b > 18 && g >= r - 6;
}

// ── Tone normalisation (deterministic, uniform multiply) ──
//
// Same precedent as the Batch-1 rocks ("warm-neutral re-toned", commit 18e8e37)
// and the fumarole x0.85 multiply: a UNIFORM per-channel multiply, no gradient,
// no local edit. It does two things the prompt cannot do reliably:
//   a) pins the whole set to one darkness (flux lands anywhere in 60..80 mean
//      luminance run to run — a mixed-brightness rock set looks wrong on a tile)
//   b) shifts the neutral/cool grey the model produces to the WARM-neutral tone
//      the rocks need to sit on warm desert ground as well as grey mountain
//      ground (the cool-grey clash Batch-1 had to fix).
// TONE_MIN_FACTOR is the guard: a generation that would need a stronger multiply
// than this is genuinely too bright/flat and must be REGENERATED, not rescued.
const TONE_TARGET_LUM = 56;
const TONE_MIN_FACTOR = 0.62;
const WARM = [1.08, 1.0, 0.88];

async function toneNormalise(png, name) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0,
    sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    // Measure the BARE STONE only. Moss is bright olive; including it inflates
    // the mean, so the mossy set would get a weaker darkening than the arid set
    // and the two would stop reading as the same rock (observed: stone x0.911 vs
    // x0.774 on the same source rock). Excluding moss pins the STONE of both
    // sets to the identical value.
    if (isMoss(r, g, b)) continue;
    sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    n++;
  }
  const mean = sum / n;
  const factor = Math.min(1, TONE_TARGET_LUM / mean);
  if (factor < TONE_MIN_FACTOR)
    throw new Error(
      `${name}: generation too bright (meanLum ${mean.toFixed(1)}, would need x${factor.toFixed(2)} < ${TONE_MIN_FACTOR}) — regenerate with a new seed`,
    );
  console.log(`    tone: meanLum ${mean.toFixed(1)} -> x${factor.toFixed(3)} + warm`);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) {
      data[i + c] = Math.min(255, Math.round(data[i + c] * factor * WARM[c]));
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

// Batch-1 rocks measured at mean luminance 76..100 (avg 88) — the "too light"
// reference. "Deutlich dunkler" => require a clear drop below that band.
const LUM_MAX = 66;
const LUM_MIN = 22; // guard against a black blob with no readable form
// Moss coverage of the opaque area (see isMoss).
const MOSS_MIN_PCT = 3.0;
const MOSS_MAX_PCT = 22.0;
const ARID_MAX_PCT = 0.5;
// Aspect band, derived from the renderer (NOT a style preference):
//   upper — a prop must not span more than one tile: TW / PROP_BASE_HEIGHT
//           = 48 / 28 = 1.71, rounded to 1.75.
//   lower — readability of the sliver at the @eighth mip; 0.40 * 28 = 11px wide
//           still reads as a standing stone. (Batch-1 spanned 0.60..1.43.)
const ASPECT_MIN = 0.4;
const ASPECT_MAX = 1.75;

async function measure(pngPath) {
  const { data, info } = await sharp(pngPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let n = 0,
    lum = 0,
    green = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    lum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (isMoss(r, g, b)) green++;
    n++;
  }
  const bbox = await alphaBBox(pngPath);
  return {
    w,
    h,
    aspect: w / h,
    meanLum: lum / n,
    greenPct: (100 * green) / n,
    tight:
      bbox.minX === 0 && bbox.minY === 0 && bbox.maxX === w - 1 && bbox.maxY === h - 1,
    hasAlpha: true,
  };
}

async function validate(name, mossy) {
  const p = path.join(DIR_FINAL, `${name}.png`);
  if (!fs.existsSync(p)) return { name, ok: false, problems: ['missing'], m: null };
  const m = await measure(p);
  const problems = [];
  if (Math.max(m.w, m.h) !== TARGET_MAX) problems.push(`max side ${Math.max(m.w, m.h)} != ${TARGET_MAX}`);
  // Aspect drives the ON-SCREEN width (height is fixed at PROP_BASE_HEIGHT=28,
  // a tile is TW=48 wide). Batch-1 rocks ranged 0.60..1.43 — stay in that band
  // or a "rock" spans two tiles / becomes a hairline.
  if (m.aspect < ASPECT_MIN || m.aspect > ASPECT_MAX)
    problems.push(`aspect ${m.aspect.toFixed(2)} outside ${ASPECT_MIN}..${ASPECT_MAX}`);
  if (!m.tight) problems.push('not tight-cropped (transparent border)');
  if (m.meanLum > LUM_MAX) problems.push(`too light (meanLum ${m.meanLum.toFixed(1)} > ${LUM_MAX})`);
  if (m.meanLum < LUM_MIN) problems.push(`too dark (meanLum ${m.meanLum.toFixed(1)} < ${LUM_MIN})`);
  if (mossy && m.greenPct < MOSS_MIN_PCT) problems.push(`no moss (green ${m.greenPct.toFixed(2)}%)`);
  if (mossy && m.greenPct > MOSS_MAX_PCT) problems.push(`moss too dominant (green ${m.greenPct.toFixed(2)}%)`);
  if (!mossy && m.greenPct > ARID_MAX_PCT) problems.push(`arid variant has moss (green ${m.greenPct.toFixed(2)}%)`);
  return { name, ok: problems.length === 0, problems, m };
}

// ══════════════════════════════════════
// Per-variant run
// ══════════════════════════════════════

async function runVariant(setKey, idx, seedOverride, reuseRaw) {
  const set = SETS[setKey];
  const name = `${set.prefix}_${idx}`;
  const shape = SHAPES[idx];
  const seed = seedOverride ?? shape.seed;
  console.log(`\n[${name}] seed ${seed}${set.moss ? ' (moss derive)' : ''}`);

  const rawPath = path.join(DIR_RAW, `${name}_raw.png`);
  let raw;
  if (reuseRaw && fs.existsSync(rawPath)) {
    raw = fs.readFileSync(rawPath);
    console.log('    raw: reused');
  } else if (set.moss) {
    // derive from the arid raw so both sets share the identical rock
    const basePath = path.join(DIR_RAW, `${SETS.rock_arid.prefix}_${idx}_raw.png`);
    if (!fs.existsSync(basePath)) throw new Error(`arid base missing: ${basePath}`);
    // `mossSeed` pins the kontext derive independently of the arid generation
    // seed. Needed when a rock generates well but its moss derive needs its own
    // re-roll — without it the only way to change the derive is to change the
    // arid seed, which would throw away an accepted rock. Defaults to the legacy
    // seed+1 so the signed-off variants stay reproducible.
    raw = await deriveMoss(
      fs.readFileSync(basePath),
      shape.mossSeed ?? seedOverride ?? seed + 1,
      shape.mossPrompt ?? MOSS_PROMPT,
    );
    fs.writeFileSync(rawPath, raw);
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

  const v = await validate(name, set.moss);
  console.log(
    `    -> ${v.m.w}x${v.m.h} aspect ${v.m.aspect.toFixed(2)} lum ${v.m.meanLum.toFixed(1)} green ${v.m.greenPct.toFixed(2)}% ${v.ok ? 'PASS' : 'FAIL: ' + v.problems.join('; ')}`,
  );
  return v;
}

// ══════════════════════════════════════
// Review contact sheet
// ══════════════════════════════════════

async function sheet() {
  fs.mkdirSync(DIR_REVIEW, { recursive: true });
  for (const setKey of Object.keys(SETS)) {
    const set = SETS[setKey];
    const files = [];
    for (let i = 0; i < SHAPES.length; i++) {
      const p = path.join(DIR_FINAL, `${set.prefix}_${i}.png`);
      if (fs.existsSync(p)) files.push(p);
    }
    if (files.length === 0) continue;
    const CELL = 260;
    const COLS = 3;
    const rows = Math.ceil(files.length / COLS);
    const comp = [];
    for (let i = 0; i < files.length; i++) {
      comp.push({
        input: await sharp(files[i])
          .resize(CELL - 16, CELL - 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer(),
        left: (i % COLS) * CELL + 8,
        top: Math.floor(i / COLS) * CELL + 8,
      });
    }
    const out = path.join(DIR_REVIEW, `${set.prefix}_sheet.png`);
    await sharp({
      create: { width: COLS * CELL, height: rows * CELL, channels: 4, background: { r: 122, g: 116, b: 104, alpha: 1 } },
    })
      .composite(comp)
      .png()
      .toFile(out);
    console.log(`[sheet] ${out}`);
  }
}

// ══════════════════════════════════════
// Integrate: assets/final -> src/assets/props/<family>/
// ══════════════════════════════════════

// `indices` lets a re-roll write ONLY the variants it actually regenerated.
// Rewriting untouched webps would churn files another agent may be building on.
async function integrate(indices = SHAPES.map((_, i) => i)) {
  for (const setKey of Object.keys(SETS)) {
    const set = SETS[setKey];
    const dir = path.join(SRC_PROPS, set.family);
    fs.mkdirSync(dir, { recursive: true });
    for (const i of indices) {
      const name = `${set.prefix}_${i}`;
      const src = path.join(DIR_FINAL, `${name}.png`);
      if (!fs.existsSync(src)) {
        console.log(`  SKIP ${name} (no final png)`);
        continue;
      }
      const v = await validate(name, set.moss);
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
      console.log(`  ${set.family}/${name}.webp  ${m.width}x${m.height} (+3 mips)`);
    }
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
  const idxArgs = argv
    .slice(1)
    .filter((a) => /^\d+$/.test(a))
    .map(Number)
    .filter((n) => n !== seedOverride);
  const indices = idxArgs.length ? idxArgs : SHAPES.map((_, i) => i);

  for (const d of [DIR_RAW, DIR_NOBG, DIR_CROP, DIR_FINAL]) fs.mkdirSync(d, { recursive: true });

  if (cmd === 'sheet') return sheet();
  if (cmd === 'integrate') return integrate(indices);
  if (cmd === 'validate') {
    for (const setKey of Object.keys(SETS)) {
      for (const i of indices) {
        const v = await validate(`${SETS[setKey].prefix}_${i}`, SETS[setKey].moss);
        console.log(
          v.m
            ? `${v.name.padEnd(14)} ${v.m.w}x${v.m.h} aspect ${v.m.aspect.toFixed(2)} lum ${v.m.meanLum.toFixed(1)} green ${v.m.greenPct.toFixed(2)}% tight=${v.m.tight} ${v.ok ? 'PASS' : 'FAIL: ' + v.problems.join('; ')}`
            : `${v.name.padEnd(14)} MISSING`,
        );
      }
    }
    return;
  }

  if (!FAL_API_KEY) {
    console.error('No fal key (FAL_AI_API_KEY) in scripts/.env');
    process.exit(1);
  }

  const doArid = !flags.has('--moss-only');
  const doMoss = !flags.has('--arid-only');
  const reuseRaw = flags.has('--reuse-raw');
  const results = [];
  if (doArid) for (const i of indices) results.push(await runVariant('rock_arid', i, seedOverride, reuseRaw));
  if (doMoss) for (const i of indices) results.push(await runVariant('rock', i, seedOverride, reuseRaw));

  console.log('\n── summary ──');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.problems.join('; ')}`);
  await sheet();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
