/**
 * Asset-Pipeline: surface PROP sprites — PALE SUN-BLEACHED DESERT ROCK.
 *
 *   rock_sand_0..5   -> biome desert_patch
 *
 * WHY A THIRD ROCK SET (and why a separate script)
 * ------------------------------------------------
 * `desert_patch` ground is strongly orange (measured over the 4 tile variants:
 * mean luminance 98.6..110.7, rgb ~150/93/46, R/B ~3.2). The set placed there so
 * far, `rock_arid`, is dark and colour-neutral (lum 56.5, rgb 61/56/49,
 * R/B 1.23) — 1.75x darker than its ground and completely desaturated. Rudi
 * rejected that pairing.
 *
 * `scripts/props-rock-generate.cjs` is NOT touched: its documented invariant is
 * that `rock` (mossy) and `rock_arid` are the SAME stone and differ only by the
 * moss derive. Retuning its tone constants would break that. This is a separate
 * script with its own tone/validator constants and no moss stage at all.
 *
 * TARGET TONE
 *   mean luminance 110..140  (lighter than the ground, so the prop reads as an
 *                             object ON the ground instead of a dark blot)
 *   R/B 1.35..2.10           (warm sandy, NOT lighter grey — see TONE below)
 * The ground itself sits at R/B ~3.2, far more saturated: the rock stays clearly
 * separable from the tile by BOTH value and saturation while living in the same
 * warm family.
 *
 * THE BATCH-1 TRAP (do not fall back into it)
 * -------------------------------------------
 * The very first rock batch (commit 18e8e37) was "light grey-brown sandstone,
 * smooth faces" and was rejected for being too light AND too clean. This set is
 * deliberately light again, so every roughness anchor from the accepted dark
 * prompt is carried over VERBATIM (deep fissures, spalled flakes, coarse pitted
 * grain) and the smoothness negatives are stated twice. The noun "sandstone" is
 * avoided entirely — it is the token that pulled the first batch towards clean
 * cut blocks; the colour is described as "sun-bleached desert rock" instead.
 * Light here means SUN-BLEACHED, not smooth.
 *
 * PIPELINE (per variant, per CLAUDE.md Phase 2b)
 *   1. fal-ai/flux-pro/v1.1, fixed seed, per-shape canvas, DARK backdrop
 *                                                      -> assets/raw/<name>_raw.png
 *   2. fal-ai/birefnet/v2 background removal            -> assets/nobg/<name>_nobg.png
 *      + alpha levels curve (kills the fringe halo) + speck removal
 *   3. tight crop on alpha (first/last visible pixel, all 4 sides)
 *   4. tone normalise: mild warm vector + luminance pin  -> assets/cropped/
 *   5. scale so max(w, h) = 400 px, aspect preserved, NO padding -> assets/final/
 *   6. validate: dimensions, tight crop, aspect band, luminance band, warmth,
 *      surface contrast (roughness proxy)
 *   integrate: PNG -> webp q90 + @half/@quarter/@eighth -> src/assets/props/rock_sand/
 *
 * MODEL: fal-ai/flux-pro/v1.1. flux/dev reliably returns cel-shaded low-poly
 * rocks with a painted-on floor (documented in props-rock-generate.cjs).
 * flux-pro/v1.1 has no `negative_prompt` input, so negatives are folded into the
 * prompt as plain "no X" text.
 *
 * PROP SIZE CONVENTION (same family rules as props-rock-generate.cjs):
 *   - tight-cropped, aspect preserved, NO fixed canvas, NO transparent padding
 *   - RGBA webp, max side 400 px
 *   - LOD @half/@quarter/@eighth = Math.round(dim * 0.5 / 0.25 / 0.125),
 *     webp { quality: 90, effort: 4, smartSubsample: true }
 *   - on-screen size is independent of pixel size: PlanetSurface draws props at
 *     PROP_BASE_HEIGHT (28 px) and derives the width from the sprite ASPECT.
 *
 * fal key from scripts/.env (FAL_AI_API_KEY) — never hardcode, never log, never commit.
 *
 * Usage:
 *   node scripts/props-rock-sand-generate.cjs gen
 *   node scripts/props-rock-sand-generate.cjs gen 2 5
 *   node scripts/props-rock-sand-generate.cjs gen 2 --seed 999123
 *   node scripts/props-rock-sand-generate.cjs gen 2 --reuse-raw   re-run steps 2..6 only
 *   node scripts/props-rock-sand-generate.cjs validate
 *   node scripts/props-rock-sand-generate.cjs sheet
 *   node scripts/props-rock-sand-generate.cjs integrate [indices]
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
const DIR_TILES = path.join(ROOT, 'src', 'assets', 'tiles', 'desert_patch');

const FAMILY = 'rock_sand';
const PREFIX = 'rock_sand';
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

// Shared style anchor. Structurally parallel to the accepted dark-rock ANCHOR;
// the COLOUR and LIGHTING clauses are swapped and the roughness clauses are
// strengthened, because "pale" is precisely the condition under which flux
// slides back into the Batch-1 failure.
//
// ATTEMPT LOG (probe on shape 0)
//   p1 seed 850101 — "pale sun-bleached desert rock", "bleached almost white on
//      the sun-facing tops", "hard directional desert sunlight", material noun
//      softened from the accepted "granite" to a generic "stone".
//      -> a smooth rounded dome with two hairline cracks: literally the rejected
//      Batch-1 look (contrast 0.27, aspect 1.34). Three separate causes:
//        a) dropping "granite" removed the only crystalline-grain anchor;
//        b) "bleached almost white" flattens the value range, so there is no
//           shadow left to describe a rough surface with;
//        c) "sun-bleached desert rock" alone reads to flux as a smooth eroded
//           sandstone boulder, the default desert-rock archetype.
//   p2 seed 850107 — "granite" restored, frontal sun replaced by LOW RAKING
//      grazing light (a pit only reads as a pit if the light skims it), round
//      archetype named in the negatives. Faceting came back, but the render went
//      near-WHITE limestone/marble (R/B 1.26, below the warmth guard, rejected
//      before tone). Cause: "pale" is the wrong instruction. The target is not a
//      pale rock, it is a MID-TONE warm tan one (post-tone rgb ~150/125/95);
//      asking for "pale ... sun-bleached" sends flux to ivory, and the tone step
//      then has to crush it, which flattens the value range into dead beige.
//   p3 (current) — "pale" dropped entirely. Colour restated as a concrete
//      mid-tone hue list (raw sienna / yellow ochre / caramel khaki) and framed
//      as DUST: a rough dark rock coated in sun-baked ochre desert dust. That
//      framing buys the contrast for free — light dusty surface against fissures
//      that stay dark red-brown — instead of asking for lightness and shadow in
//      the same breath. White/ivory/marble moved into the negatives.
//
// Backdrop: DARK here, not mid-grey. The subject is pale, so a dark backdrop
// gives birefnet the strongest matte and any residual fringe reads as edge
// shading instead of a bright halo. The parenthetical is there because "dark"
// next to a rock description leaks into the stone colour otherwise.
const ANCHOR =
  'photorealistic studio photograph of one single small angular shattered boulder of rough desert granite, ' +
  'the rock is isolated and cut out, floating against a plain flat uniform dark neutral grey seamless studio backdrop ' +
  '(the BACKDROP is dark, the ROCK itself is warm sandy tan), ' +
  'NOTHING underneath the rock: no ground, no soil, no floor, no pedestal, no base plate, no paving, no cast shadow, ' +
  'seen from a three-quarter angle slightly above, ' +
  'the rough stone is caked all over in fine sun-baked ochre desert dust so that its surface reads as a ' +
  'warm MID-TONE SANDY TAN: raw sienna, yellow ochre, burnt-orange and warm caramel khaki, ' +
  'iron-brown and rust-red staining, sandy desert-camouflage tan, ' +
  'clearly WARM and SANDY in colour, NOT white, NOT cream, NOT ivory, NOT chalky, NOT marble, ' +
  'NOT grey, NOT cool grey, NOT blue-grey, NOT neutral, NOT black, ' +
  'while the deep fissures, undercuts and freshly spalled facets stay dark rust-brown and almost black, ' +
  'heavily fractured broken geology: deep jagged open fissures and black split cracks cutting right through the rock, ' +
  'sharp broken flakes, spalled scars, fresh angular fracture facets, chipped crumbling edges, ' +
  'coarse-grained pitted grainy weathered granite texture, rough gritty granular surface like coarse sandpaper, ' +
  'visible sand grains and crystal grit catching the light, ' +
  'deeply eroded, pockmarked, honeycombed and pitted all over, sharp jagged fluted ridges, ' +
  'fine crisp surface detail, absolutely no smooth polished faces, ' +
  'LOW RAKING grazing sunlight from the upper left skimming right across the stone so that every pit, ' +
  'flake and ridge throws its own small hard shadow, pitch-black shadow deep inside every fissure, ' +
  'strong chiaroscuro, the lower-right faces fall away into deep shade, matte non-reflective, chalky dry dust, ' +
  'natural dusty earthy desert colours, high detail, sharp focus, crisp clean silhouette, ' +
  'centered in the frame with a generous empty margin on all sides';

// Folded into the prompt (flux-pro/v1.1 has no negative_prompt input).
// The brightness negatives of the dark set are INVERTED; the smoothness
// negatives are kept and strengthened, because "pale" is the exact condition
// under which flux drifts back to a clean cut block (Batch-1 failure mode).
const NEGATIVE =
  'No ground, no floor, no soil, no sand pile, no dune, no paving, no cobblestones, no pedestal, no platform, no cast shadow. ' +
  'No terrain, no landscape, no scenery, no horizon, no sky, no cactus, no plants. ' +
  'Not dark, not black, not charcoal, not slate, not basalt, not grey stone, not cool grey, not blue-grey, ' +
  'not neutral grey, not desaturated, not colourless, not green, not pink, not purple. ' +
  'Not white, not off-white, not cream, not ivory, not bone, not chalk, not chalk white, not marble, ' +
  'not alabaster, not limestone, not gypsum, not plaster white, not washed out, not faded. ' +
  // "not faceted" is inherited verbatim from the accepted dark-set negative,
  // where it targets low-poly game assets. It sits awkwardly next to the anchor's
  // "fresh angular fracture facets", but the accepted renders are plainly faceted,
  // so in practice the low-poly reading wins and the geology reading survives.
  // Do NOT "fix" this: the six signed-off seeds were drawn against this exact
  // prompt string and editing it makes them unreproducible.
  'Not a cartoon, not cel shaded, no outlines, no flat colour blocks, not low-poly, not faceted. ' +
  'Not smooth, not polished, not glossy, not shiny, not wet, not carved, not sculpted, not chiselled. ' +
  'Not rounded, not round, not a smooth dome, not egg-shaped, not a river-worn pebble, not water-worn, ' +
  'not softly eroded, no soft rounded edges, no featureless faces, no thin hairline surface cracks only. ' +
  'No clean flat faces, no straight cut edges, no brickwork, no masonry, no building block, no man-made cut stone, ' +
  'no ruins, no statue, no bread loaf, no dough, no clay model, no plaster, no soap, no sand dune. ' +
  'No moss, no lichen, no grass, no vegetation, no snow, no ice, no water. ' +
  'No grid, no collage, no border, no text, no watermark, no people.';

// Carried over verbatim from props-rock-generate.cjs. Rudi rejected portrait
// "menhir" rocks as artificial, and the aspect band here (1.40..1.71) is even
// tighter than the one that produced them, so this is applied to EVERY shape,
// not just the two that failed there.
const UPRIGHT_NEGATIVE =
  'The rock is NOT taller than it is wide, it is NOT upright, NOT standing on end, NOT vertical, NOT tall. ' +
  'No standing stone, no menhir, no dolmen, no stele, no obelisk, no monolith, no monument, no gravestone, ' +
  'no headstone, no pillar, no column, no pedestal, no plinth, no tower, no spire, no pinnacle, no needle, ' +
  'no rock spike, no hoodoo, no sea stack, no portrait composition, no vertical slab on edge.';

// Six silhouettes. The `form` strings and generation canvases are taken from the
// SIGNED-OFF dark set, because that exact combination is the only evidence we
// have of prompts that land inside the aspect band: measured on rock_arid they
// produced 1.53 / 1.73 / 1.61 / 1.72 / 1.40 / 1.59. Reusing them is the lowest-
// risk way to hit the tighter 1.40..1.71 band asked for here.
// Seeds are fresh (85xxxx) — the colour anchor changed, so the arid seeds carry
// no useful state, and a distinct seed range keeps the sets traceable apart.
const SHAPES = [
  {
    // p1 (seed 850101, canvas 1024x896) came out at aspect 1.34 — under the 1.40
    // floor. The dark set got 1.53 from the same words, so the pale/rounded drift
    // was also eating width. Canvas widened one step and the two-block layout
    // spelled out as side-by-side.
    // 850107 was the p2 (near-white) probe; 850113 is the accepted p3 render.
    seed: 850113,
    gen: { w: 1152, h: 832 },
    form:
      'One chunky sharply angular boulder with a second smaller broken-off block resting beside it on the left, ' +
      'the two stones side by side, both split by deep cracks. Wide composition, clearly wider than tall.',
  },
  {
    // r1 seed 850203, canvas 1088x896 -> aspect 1.27, under the floor. Two causes:
    // the canvas had been narrowed from the 1152x832 the dark set used for this
    // form, and the "rounded eroded dome top" fights the anti-round negatives
    // this set carries, so flux resolved it as a taller lumpy mass. Dome dropped
    // in favour of a low broken crown; canvas back to 1152x832.
    // r2 seed 850211 -> aspect 1.63 (in band, form solved) but R/B 2.58: that one
    // render came out full rust-orange, past the hue-pin cap. Seed-only re-roll,
    // wording and canvas unchanged.
    // r3 seed 850217 -> aspect 1.95, hue fine. Same prompt and canvas as the 1.63
    // render, so this form's seed-to-seed spread alone is 1.63..1.95 and it
    // straddles the cap: seed-only re-roll again, nothing else to tune.
    // r4 seed 850229 -> 2.15. Three samples of one prompt: 1.63 / 1.95 / 2.15,
    // mean ~1.9. That is not seed luck, the prompt is aimed too wide — "long and
    // low like a sleeping dog", "spread out", "much wider" all stack. r5 keeps the
    // low broken crown (which fixed the r1 1.27) but drops the elongation
    // vocabulary, aiming the mean at the middle of the band instead of its top.
    seed: 850241,
    gen: { w: 1152, h: 832 },
    form:
      'One single broad low boulder with a broken uneven crown and a wide flat base, ' +
      'a long crack running right across the top. It sits low on the ground, clearly wider than it is ' +
      'tall, NOT tall, NOT a lump, NOT a mound, NOT elongated, NOT stretched out.',
  },
  {
    // r1 seed 850307 -> aspect 2.05, over the cap. Same failure the dark set
    // logged twice for this form: "flat table-like top" drives WIDTH far harder
    // than any canvas or ratio phrase, because flux resolves the table as a
    // pancake. The table wording is dropped here (the dark set kept it and had to
    // fight it); the distinguishing silhouette is now the stepped shoulder, and
    // the canvas is squarer to give the form vertical room.
    // r2 seed 850313 (canvas 1024x960, table wording dropped, "deep and thick,
    // only a little wider") -> aspect 1.05: over-corrected, now too tall. The two
    // levers are bimodal, so r3 combines them: the "flat table-like top" phrase
    // is restored as the WIDTH driver, the r2 anti-flat negatives are kept as the
    // HEIGHT driver, and the squarer 1024x960 canvas stays. 2.05 and 1.05 bracket
    // the target, so a prompt holding both drivers should land between them.
    // r3 seed 850319 -> 1.90: both drivers held, but the table phrase still won
    // (r2 1.05 vs r3 1.90 on the same canvas = the phrase is worth ~0.85 aspect).
    // r4 keeps the r3 prompt verbatim and moves only the CANVAS to portrait,
    // 1024x960 -> 960x1024, the same canvas-only trim that fixed shapes 4 and 5.
    // r4 seed 850331 (canvas 960x1024) -> 1.19. Canvas sweep on the r3 prompt:
    // 1.214 -> 2.05, 1.067 -> 1.90, 0.938 -> 1.19. Non-monotonic and noisy, so the
    // canvas cannot trim this form either. r5 goes back to canvas 1024x960 and
    // moderates the WIDTH DRIVER itself: "flat table-like top surface" (worth
    // ~0.85 aspect on its own) softened to "broad slightly flattened top" — the
    // midpoint wording between the 2.05 and 1.05 brackets, aimed at band centre.
    // 850337 -> 1.20, 850343 accepted at 1.67 (seed-only retry, --tries).
    seed: 850343,
    gen: { w: 1024, h: 960 },
    form:
      'One single chunky boulder sitting on the ground with a broad slightly flattened top, ' +
      'its flanks blocky and steep with chipped broken-off corners and one stepped shoulder where a thick ' +
      'flake has spalled away exposing a fresh facet, a deep crack splitting the top from front to back. ' +
      'A solid chunky rock with real depth and real height, NOT flat, NOT a slab, NOT a plate, ' +
      'NOT a pancake, NOT stacked, NOT layered, NOT terraced, NOT elongated, one solid single rock.',
  },
  {
    seed: 850411,
    gen: { w: 1152, h: 832 },
    form:
      'A CLUSTER of one medium boulder with six small rubble stones and broken shards scattered around its base. ' +
      'Very wide low arrangement, much wider than tall.',
  },
  {
    // r1 seed 850513 -> aspect 1.30. "only slightly wider than it is tall" was
    // taken literally and landed under the floor; in the dark set the same phrase
    // gave 1.40, i.e. it was already sitting exactly on the edge. Upgraded to
    // "clearly wider", wedge described as leaning out sideways, canvas widened.
    // r2 seed 850521 changed BOTH wording and canvas at once and shot to 2.35.
    // r3 reverts to the exact r1 wording (the known 1.30 baseline) and moves only
    // the CANVAS, 1088x896 -> 1152x832 (ratio 1.21 -> 1.39). Canvas is the finer
    // of the two levers; the wording lever is bimodal and unusable for trimming.
    seed: 850527,
    gen: { w: 1152, h: 832 },
    form:
      'One broken wedge-shaped rock with a thick fractured shelf on top and one sheared-off side, ' +
      'split by branching cracks. A solid chunky boulder, only slightly wider than it is tall, ' +
      'NOT a thin plate, NOT a flat slab, it has real depth and height.',
  },
  {
    // r1 seed 850617 -> aspect 1.37, just under the floor (and R/B 2.12, now
    // handled by the hue pin). "compact squat chunk" reads as roughly cubic;
    // widened by spreading the broken-off flakes out to both sides, which extends
    // the silhouette horizontally without making the body itself flat.
    // r2 seed 850623 changed wording and canvas together and shot to 2.13.
    // Same correction as shape 4: exact r1 wording (known 1.37 baseline), canvas
    // only, 1088x896 -> 1152x832.
    seed: 850629,
    gen: { w: 1152, h: 832 },
    form:
      'One compact squat chunk of rock resting solidly on the ground, heavily shattered: several large ' +
      'angular flakes have broken away leaving fresh sharp facets and a deeply notched jagged profile, ' +
      'a couple of loose splinters still clinging to its lower right side. A low squat block sitting on ' +
      'the ground, wider than it is tall, NOT a thin plate, NOT a flat slab, it has real depth.',
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
// The dark set's tone step is darken-only by construction
// (`factor = Math.min(1, target / mean)`), with TONE_TARGET_LUM = 56 and a
// one-sided TONE_MIN_FACTOR guard. Neither fits here, so this step is rewritten:
//
//   * bidirectional: the factor may lift as well as lower, guarded on BOTH sides.
//   * the warm vector is applied FIRST and the luminance pin is computed on the
//     warmed pixels, so the stated target is what actually lands in the file
//     (in the dark script the warm vector shifts the result off its target by a
//     couple of points).
//   * the fixed warm vector of the dark script is replaced by a per-variant HUE
//     PIN to a common R/B. Rationale: the first full run measured R/B
//     1.69 / 1.73 / 1.72 / 2.01 / 1.92 / 2.12 across the six — all warm, but a
//     visible spread from buff to rust that stops the set reading as ONE stone.
//     This is the same class of operation as the luminance pin (which is why
//     rock_arid measures 56.5 on all six), just on the R:B axis; it is symmetric
//     (kR * kB = 1, G untouched) so it rotates hue without moving brightness.
//
//   * a uniform multiply cannot MANUFACTURE sand colour: scaling a grey pixel
//     leaves a grey pixel, and tinting a grey render just yields a uniformly
//     tinted grey with no hue variation inside the cracks. The colour has to come
//     out of the generation. PRE_RB_MIN therefore REJECTS a grey render instead
//     of tinting it, and HUE_MAX_K caps how far the pin may pull, so it can only
//     harmonise renders that are already in the right family.
//
// A generation outside these guards is REGENERATED with a new seed, never
// rescued by post-processing.

// 128, upper-middle of the 110..140 brief: the desert_patch tiles measure
// 98.6..110.7, so a target at the low end of the band would leave the brightest
// tile variant nearly as light as the rock and the prop would merge into it.
const TONE_TARGET_LUM = 128;
const TONE_MIN_FACTOR = 0.7; // came out far too bright -> reroll
const TONE_MAX_FACTOR = 1.45; // came out far too dark  -> reroll
const PRE_RB_MIN = 1.3; // grey render -> reroll, do not tint
// Hue pin target. 1.75 is the centre of the six-variant spread observed on the
// first full run, so no variant has to be pulled far. The ground it sits on is
// R/B ~3.2: the rock stays clearly the less saturated of the two.
const RB_TARGET = 1.75;
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
  if (preRB < PRE_RB_MIN)
    throw new Error(
      `${name}: generation is not warm enough (R/B ${preRB.toFixed(2)} < ${PRE_RB_MIN}) — ` +
        `a grey render cannot be tinted into sand, regenerate with a new seed`,
    );

  // hue pin: symmetric R/B rotation, G untouched
  const kR = Math.sqrt(RB_TARGET / preRB);
  const kB = 1 / kR;
  if (kR > HUE_MAX_K || kR < 1 / HUE_MAX_K)
    throw new Error(
      `${name}: hue too far off the set (R/B ${preRB.toFixed(2)}, would need x${kR.toFixed(2)} on red, ` +
        `cap ${HUE_MAX_K}) — regenerate with a new seed`,
    );

  // luminance pin, computed on the HUE-PINNED pixels so the stated target is
  // what actually lands in the file
  const hueMeanLum = (0.2126 * sumR * kR + 0.7152 * sumG + 0.0722 * sumB * kB) / n;
  const factor = TONE_TARGET_LUM / hueMeanLum;
  if (factor < TONE_MIN_FACTOR || factor > TONE_MAX_FACTOR)
    throw new Error(
      `${name}: generation off-target (meanLum ${hueMeanLum.toFixed(1)}, would need ` +
        `x${factor.toFixed(2)} outside ${TONE_MIN_FACTOR}..${TONE_MAX_FACTOR}) — regenerate with a new seed`,
    );

  console.log(
    `    tone: R/B ${preRB.toFixed(2)} -> ${RB_TARGET} (red x${kR.toFixed(3)}), ` +
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

// Luminance band from the brief: lighter than the desert_patch ground (98.6..110.7)
// but not blown out. TONE pins the mean, so this is really a guard against a
// clipped render whose highlights saturate away from the target.
const LUM_MIN = 110;
const LUM_MAX = 140;
// Warmth, measured on the FINAL file. rock_arid sits at 1.22..1.25 — anything in
// that region is grey and fails. Upper bound keeps the rock from turning into a
// second copy of the ground (tile R/B ~3.2).
const RB_MIN = 1.35;
const RB_MAX = 2.1;
// Roughness proxy: std-dev of luminance over the opaque pixels. Deep cracks and
// spalled facets create a broad histogram; the smooth Batch-1 blocks did not.
// rock_arid measures 32.5..43.4 at mean 56.5. Absolute std-dev is not comparable
// across brightness levels, so the floor is set on the RELATIVE contrast
// (std/mean); rock_arid spans 0.58..0.77, and a pale render loses some shadow
// depth, so the floor is 0.30 — a smooth pale block lands well under it.
const CONTRAST_MIN = 0.3;
// Aspect band. Upper bound = TW / PROP_BASE_HEIGHT = 48 / 28 = 1.71: above that a
// prop spans more than one tile. Lower bound 1.40 keeps the set on the LYING
// boulder silhouette — Rudi rejected upright/portrait rocks as artificial.
const ASPECT_MIN = 1.4;
const ASPECT_MAX = 1.71;

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
  if (m.contrast < CONTRAST_MIN)
    problems.push(`surface too flat/smooth (contrast ${m.contrast.toFixed(2)} < ${CONTRAST_MIN})`);
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
      `contrast ${v.m.contrast.toFixed(2)} ${v.ok ? 'PASS' : 'FAIL: ' + v.problems.join('; ')}`,
  );
  return v;
}

// ══════════════════════════════════════
// Review sheets
// ══════════════════════════════════════

/** Iso lattice of desert_patch tiles — the actual ground this set has to sit on. */
async function groundSlab(width, height, tileW) {
  const tileH = Math.round(tileW / 2);
  const tiles = [];
  for (let i = 0; i < 4; i++) {
    const p = path.join(DIR_TILES, `desert_patch_${i}.webp`);
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
    create: { width, height, channels: 4, background: { r: 120, g: 74, b: 38, alpha: 1 } },
  })
    .composite(comp)
    .png()
    .toBuffer();
}

async function finalsFor(prefix, dir) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const p = path.join(dir, prefix ? `${prefix}_${i}.png` : '');
    if (fs.existsSync(p)) out.push(p);
  }
  return out;
}

/** 1) plain contact sheet, analogous to rock_sheet.png */
async function sheetPlain() {
  const files = await finalsFor(PREFIX, DIR_FINAL);
  if (!files.length) return;
  const CELL = 260,
    COLS = 3;
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
  const out = path.join(DIR_REVIEW, `${PREFIX}_sheet.png`);
  await sharp({
    create: { width: COLS * CELL, height: rows * CELL, channels: 4, background: { r: 122, g: 116, b: 104, alpha: 1 } },
  })
    .composite(comp)
    .png()
    .toFile(out);
  console.log(`[sheet] ${out}`);
}

/** 2) the 6 rocks large, standing on real desert_patch ground */
async function sheetOnDesert() {
  const files = await finalsFor(PREFIX, DIR_FINAL);
  if (!files.length) return;
  const CELL_W = 300,
    CELL_H = 230,
    COLS = 3,
    ROCK_H = 150;
  const rows = Math.ceil(files.length / COLS);
  const W = COLS * CELL_W,
    H = rows * CELL_H;
  const bg = await groundSlab(W, H, 300);
  const comp = [];
  for (let i = 0; i < files.length; i++) {
    const m = await sharp(files[i]).metadata();
    const w = Math.round(ROCK_H * (m.width / m.height));
    comp.push({
      input: await sharp(files[i]).resize(w, ROCK_H, { fit: 'fill' }).png().toBuffer(),
      left: (i % COLS) * CELL_W + Math.round((CELL_W - w) / 2),
      top: Math.floor(i / COLS) * CELL_H + Math.round((CELL_H - ROCK_H) / 2),
    });
  }
  const out = path.join(DIR_REVIEW, `${PREFIX}_on_desert.png`);
  await sharp(bg).composite(comp).png().toFile(out);
  console.log(`[sheet] ${out}`);
}

/**
 * 3) THE tone verdict sheet: real in-game geometry (TW = 48, PROP_BASE_HEIGHT = 28)
 * on real desert_patch ground, upscaled 6x nearest-neighbour so the 1:1 pixels
 * stay visible. Top strip = the new sand set, bottom strip = rock_arid (the set
 * being replaced) on the same ground, for a direct A/B.
 */
async function sheetGameSize() {
  const TW = 48,
    PROP_H = 28,
    ZOOM = 6;
  const files = await finalsFor(PREFIX, DIR_FINAL);
  if (!files.length) return;

  const aridDir = path.join(SRC_PROPS, 'rock_arid');
  const aridFiles = [];
  for (let i = 0; i < 6; i++) {
    const p = path.join(aridDir, `rock_arid_${i}.webp`);
    if (fs.existsSync(p)) aridFiles.push(p);
  }

  const stripH = 46;
  const W = 6 * TW + 24;
  const H = stripH * 2;
  const bg = await groundSlab(W, H, TW);
  const comp = [];
  const place = async (list, rowTop) => {
    for (let i = 0; i < list.length; i++) {
      const m = await sharp(list[i]).metadata();
      const w = Math.max(1, Math.round(PROP_H * (m.width / m.height)));
      comp.push({
        input: await sharp(list[i]).resize(w, PROP_H, { fit: 'fill' }).png().toBuffer(),
        left: 12 + i * TW + Math.round((TW - w) / 2),
        top: rowTop,
      });
    }
  };
  await place(files, 10);
  await place(aridFiles, stripH + 10);

  const flat = await sharp(bg).composite(comp).png().toBuffer();
  const out = path.join(DIR_REVIEW, `${PREFIX}_gamesize.png`);
  await sharp(flat)
    .resize(W * ZOOM, H * ZOOM, { kernel: 'nearest' })
    .png()
    .toFile(out);
  console.log(`[sheet] ${out}   (top row = rock_sand, bottom row = rock_arid, ${ZOOM}x nearest)`);
}

async function sheet() {
  fs.mkdirSync(DIR_REVIEW, { recursive: true });
  await sheetPlain();
  await sheetOnDesert();
  await sheetGameSize();
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
  // Skip the VALUE of every value-taking flag by position. Filtering by "is this
  // number equal to the seed" (as the dark script does) is not enough here:
  // `--tries 4` made 4 look like a variant index and silently re-ran shape 4.
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
          ? `${v.name.padEnd(14)} ${v.m.w}x${v.m.h} aspect ${v.m.aspect.toFixed(2)} lum ${v.m.meanLum.toFixed(1)} ` +
              `rgb ${v.m.r.toFixed(0)}/${v.m.g.toFixed(0)}/${v.m.b.toFixed(0)} R/B ${v.m.rb.toFixed(2)} ` +
              `contrast ${v.m.contrast.toFixed(2)} tight=${v.m.tight} ${v.ok ? 'PASS' : 'FAIL: ' + v.problems.join('; ')}`
          : `${v.name.padEnd(14)} MISSING`,
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
  // roughly +/-0.25 on an unchanged prompt (shape 1 produced 1.63 / 1.95 / 2.15
  // from one prompt+canvas), so a prompt aimed at the middle of the 1.40..1.71
  // band still misses on individual seeds. This is a bounded retry on the one
  // variable that is pure noise — it is NOT a substitute for fixing a prompt that
  // is systematically off, which is why every try is logged with its seed and the
  // accepted seed must be written back into SHAPES.
  const triesIdx = argv.indexOf('--tries');
  const tries = triesIdx >= 0 ? parseInt(argv[triesIdx + 1], 10) : 1;
  const SEED_STEP = 6;

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
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.problems.join('; ')}`);
  await sheet();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
