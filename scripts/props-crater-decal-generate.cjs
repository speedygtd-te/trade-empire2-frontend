/**
 * Asset-Pipeline: surface PROP sprites — CRATER DECAL (flat ground decal).
 *
 *   crater_decal_0..3  ->  BARREN + ASTEROIDS, biome assignment NOT wired here
 *
 * Old, weathered, sunken craters lying flat IN the ground. Rudi 2026-09-08:
 * "krater zuerst, verwittert und eingesunken" — so no sharp-edged fresh impact
 * anywhere in the set, not even in the strongest rung.
 *
 * ── THE FAMILY HAS TWO JOBS, AND THAT IS WHY IT IS A LADDER
 *
 * Correction from Rudi, same day: `crater` and `impact_crater` carry NO crater
 * in the tile. The `crater` tile is a darkened derivation of `regolith`, and
 * `impact_crater` a derivation of that. So on those two biomes the decal is not
 * decoration, it is the biome's IDENTITY — without it `crater` is dark regolith.
 * On the other ten BARREN/ASTEROIDS grounds the decal is a pattern breaker and
 * has to stay quiet.
 *
 * One family serves both by being a STRENGTH LADDER: four rungs from
 * barely-there to clearly pronounced. "Stronger" means bigger, deeper, more
 * ejecta — never harder edges. The rung is a measured number (see RUNGS), not a
 * hope pinned on a prompt: LESSONS § 2, "ein Prompt trifft keinen Zielwert; ein
 * Grade trifft ihn auf drei Stellen".
 *
 * ── WHY THE SPRITE IS A GAIN FIELD AND NOT A PICTURE
 *
 * This is the one structural decision the whole family hangs on.
 *
 * The twelve grounds this decal has to work on span a 7x brightness range:
 *   void_edge 29.4 · carbon_crust 39.4 · crater 52.4 · fractured_zone 52.9 ·
 *   impact_crater 54.0 · boulder_field 61.4 · rocky_outcrop 69.1 ·
 *   metallic_surface 83.2 · regolith 125.7 · dust_basin 133.4 ·
 *   dust_plain 158.0 · silicate_plain 207.5     (mean Rec709 luma, own tiles)
 *
 * A sprite with a FIXED luminance cannot be a depression on all of them. Graded
 * dark enough to dent `silicate_plain` (207) it is a black hole on `void_edge`
 * (29); graded to sit under `regolith` (126) it is a BRIGHT blob on `crater`
 * (52) — and `crater` is precisely the biome that needs it most. That is the
 * "rock_snow auf tundra" failure (PLAN § 2) with the numbers three times worse.
 *
 * The renderer draws a prop with plain `drawImage` and `globalAlpha = 1`, so the
 * sprite's OWN alpha is the only blend control there is:
 *     out = ground * (1 - a) + D * a
 * Read as an operator that is a per-pixel affine map on the ground, and with
 * `a` small and `D` far from the ground it is effectively a MULTIPLY. So the
 * sprite does not store a crater; it stores the crater's multiplicative
 * signature — a target GAIN m(x,y) — encoded as (alpha, colour):
 *
 *     m < 1  (bowl, dust fill, inner shadow)   D = LD  (near-black neutral)
 *                                              a = (1 - m) / (1 - LD/GREF)
 *     m > 1  (ejecta apron, lit inner crescent) D = LL  (near-white neutral)
 *                                              a = (m - 1) / (LL/GREF - 1)
 *
 * GREF is the reference ground level the alpha is solved against — the GEOMETRIC
 * mean of the twelve grounds AFTER the airless darkening the renderer applies
 * (0.45 toward rgb(5,10,25)), measured, see GREF below. On GREF the gain is hit
 * exactly; away from it, it drifts in the direction that helps:
 *
 *   - the BOWL keeps roughly its relative depth on every ground (the dark D is
 *     far below all of them), so the dent reads everywhere;
 *   - the EJECTA RIM lifts strongly on dark grounds and fades to nothing on
 *     bright ones. That asymmetry is unavoidable with one sprite — and it falls
 *     the right way, because the two identity biomes (`crater` 52,
 *     `impact_crater` 54) are at the dark end. Measured in `validate`.
 *
 * Two further consequences, both wanted:
 *   - the ground's own grain shows THROUGH at weight (1-a), attenuated but not
 *     replaced. A weathered dust-filled crater floor IS smoother than the plain
 *     around it, so attenuation is the correct physics, and the decal can never
 *     look like a sticker with its own unrelated texture.
 *   - the outline is an ALPHA fade, not a cut-out. birefnet, which every other
 *     prop family runs through, produces a hard silhouette; a hard-edged crater
 *     on a dust plain is the one thing "verwittert" rules out. There is no
 *     background-removal step in this family at all — the ratio extraction IS
 *     the cut-out, and it is soft by construction.
 *
 * ── WHY THE GENERATION IS NADIR AND THE ISO SQUASH IS DONE IN SCRIPT
 *
 * The renderer sizes a prop by HEIGHT and takes the WIDTH from the sprite's own
 * aspect, and the tile diamond is 48x24. A decal has no height, so its correct
 * iso projection is the ground-plane texture compressed 2:1 vertically — the
 * sprite must come out at aspect exactly 2.0.
 *
 * Asking flux for the oblique view directly is what `lava_puddle` does, and it
 * is a lottery: that family's variant 1 came back at aspect 3.08 and had to be
 * re-rolled. Worse, LESSONS § 5 records that asking flux for oblique ground
 * gives vanishing perspective (the BED prompt: "mit fluchtender Perspektive und
 * einer Faltlinie in der Mitte, also unkachelbar").
 *
 * So: generate NADIR — a vertical, orthographic, straight-down photograph of a
 * plain with one crater in it, which flux does reliably and which keeps the
 * surrounding plain flat and even (the background fit needs that) — and do the
 * 2:1 squash deterministically here. Four reasons this is not a shortcut but the
 * correct construction:
 *   1. aspect 2.000 by construction, no re-roll lottery, no aspect band needed;
 *   2. for a FLAT feature, squashing the orthographic ground texture IS the iso
 *      projection — exactly, not approximately;
 *   3. a weathered crater has almost no vertical relief left, so there is no
 *      rim wall whose foreshortened face the squash would get wrong (this is the
 *      reason the "verwittert und eingesunken" brief and the flat-decal geometry
 *      reinforce each other rather than fight);
 *   4. the light azimuth survives: upper-left in nadir stays upper-left after a
 *      vertical squash, matching the tiles' upper-left key.
 *   Side effect, also correct: the ground grain is compressed 2:1 with the form,
 *   which is what an iso view of that ground does to it.
 *
 * The shading sign is load-bearing and is stated in the prompt, because LESSONS
 * § 4 records the failure: "Vertikal spiegeln kippt die eingebackene
 * Schattierung — Krater werden zu Kuppeln." With the key from upper left, a
 * BOWL is dark on its upper-left inner wall and carries a faint lit crescent
 * low-right. A dome is the other way round. Nothing in the pipeline can repair
 * a returned dome, so the prompt names the crescents explicitly.
 *
 * ── NEUTRALITY IS BY CONSTRUCTION, AND MEASURED ON THE WRITTEN FILE
 *
 * "Der Effekt läuft über Helligkeit, nicht über Farbton." Only the LUMINANCE
 * ratio is taken out of the photograph; its hue is discarded, and LD / LL / GREF
 * are achromatic. So the sprite is grey by generation, B/R = G/R = 1.000
 * exactly in the buffer — which makes the buffer measurement worthless as
 * evidence.
 *
 * The measurement that means something is on the WRITTEN webp (LESSONS § 1: "an
 * der GESCHRIEBENEN Datei messen, nie am Puffer"), because libwebp lossy is
 * always YUV 4:2:0 and puts chroma error back in. And the number that actually
 * answers the brief is neither of those: it is the INDUCED hue shift, i.e. how
 * far the decal moves each ground's own B/R where it lies on it. `validate`
 * prints all three.
 *
 * ── WHAT THIS SCRIPT DOES NOT DO
 * No propThemes.ts entry, no density, no biome assignment — that is a separate
 * step gated on the `g`-index measurement (PLAN § 7 question 1). The height
 * factors in HEIGHT_FACTORS are a PROPOSAL used by the review sheets so they
 * show true game size; nothing reads them at runtime.
 * No `cap sync`, no APK.
 *
 * Usage:
 *   node scripts/props-crater-decal-generate.cjs gen            all four
 *   node scripts/props-crater-decal-generate.cjs gen 2          one variant
 *   node scripts/props-crater-decal-generate.cjs gen 2 --seed 771103
 *   node scripts/props-crater-decal-generate.cjs gen --reuse-raw   steps 2..6
 *   node scripts/props-crater-decal-generate.cjs validate
 *   node scripts/props-crater-decal-generate.cjs grounds        ground census
 *   node scripts/props-crater-decal-generate.cjs sheet          png panels + html
 *   node scripts/props-crater-decal-generate.cjs integrate      webp + mips
 *
 * The sharpening round for the identity rungs v2/v3 (see TRACK B below):
 *   node scripts/props-crater-decal-generate.cjs genland        landscape plates,
 *                                                              detect + cut craters
 *   node scripts/props-crater-decal-generate.cjs genland --reuse-raw
 *   node scripts/props-crater-decal-generate.cjs build          both candidate sets
 *   node scripts/props-crater-decal-generate.cjs build A        A = recalculated
 *   node scripts/props-crater-decal-generate.cjs build B        B = newly generated
 *   node scripts/props-crater-decal-generate.cjs promote A      ship a candidate
 * Candidates live in assets/cand/ and never touch assets/final until `promote`;
 * `IST` is an automatic snapshot of whatever was shipped before the round.
 *
 * fal key from scripts/.env (FAL_AI_API_KEY) — never hardcode, never log, never commit.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const L = require('./props-pipeline-lib.cjs');
const D = require('./tiles-dust-plain-lib.cjs');

// LESSONS § 1: sharp.cache(false) as soon as a script rewrites the same path.
sharp.cache(false);

const FAMILY = 'crater_decal';
const N = 4;

// ── generation / geometry ──
const GEN = { w: 1024, h: 1024 }; // NADIR, square. The 2:1 squash happens here.
const SQ_W = 1024;
const SQ_H = 512;
const TARGET_W = 400; // final sprite, aspect forced to exactly 2.000
const TARGET_H = 200;

// ── the gain-field encoding ──
//
// GREF: the ground level the alpha is solved against. Measured, not chosen —
// the geometric mean of the twelve candidate grounds AFTER the renderer's
// airless terrain darkening (`vac()` below). The geometric mean, not the
// arithmetic one, because the encoding error is multiplicative: it is the ratio
// ground/GREF that sets the drift, so the mean that minimises the worst-case
// ratio in both directions is the geometric one. Recompute with `grounds`.
const GREF = 47;
const LD = 10; // near-black neutral — the bowl / dust fill / inner shadow
const LL = 235; // near-white neutral — the ejecta apron / lit inner crescent
const A_MAX = 0.62; // ceiling on the ground texture the decal may replace
/** Inner edge of the annulus the ground-level plane is fitted on (window radii). */
const FIT_BAND_LO = 0.90;
/** Window: flat inside this radius, raised cosine to zero at 1.0. */
const WIN_FLAT = 0.70;

/**
 * The DISH: how deep the crater's whole interior sits, as a fraction of the
 * shadow arc's depth.
 *
 * The extracted ratio field of a real nadir crater photograph is a CRESCENT
 * PAIR and nothing else — dark arc on the inner upper-left wall, pale arc on the
 * inner lower-right, and a floor at almost exactly plain brightness (measured:
 * the bowl floor sits at u = 0 +-0.02 in all four returns). That is physically
 * correct: a dust-filled floor has the plain's albedo and the plain's sun angle,
 * so it returns the plain's brightness.
 *
 * It is not what the brief asks for, and the brief is right about the game:
 * "die Wirkung entsteht aus dem abgesenkten Inneren (dunkler, weicher
 * Schattenverlauf) und einem flachen, kaum helleren Auswurfsaum". At 30 px a
 * crescent pair alone is ambiguous — a smooth overall depression is what makes
 * it read as a dip rather than a smudge. On an airless body the physical
 * justification is thin (there is barely any sky to occlude), so this is a
 * deliberate readability choice and is named as one rather than dressed up.
 *
 * Per rung (RUNGS[i].dish): 0.40 on the soft pattern-breaker rungs, 0.28 on the
 * sharpened identity rungs — at 0.40 the dish was out-competing the crescents
 * exactly where the crescents have to carry the reading.
 */
const A_FLOOR = 2; // 2/255 inside the window, so the tight crop is exact by
// construction and survives the resample to 400x200. At
// D = GREF it is a no-op on the reference ground and worth
// under 1 % of gain on the extreme ones.

// ── the renderer's airless darkening, reproduced ──
// isoConstants: factor = 1 at density 0 (every BARREN/ASTEROIDS body),
// ATMOSPHERE_TERRAIN_DARKEN_MAX 0.45 over ATMOSPHERE_DARKEN_RGB '5,10,25'.
const VAC_A = 0.45;
const VAC_RGB = [5, 10, 25];
const vac = (c, i) => c * (1 - VAC_A) + VAC_RGB[i] * VAC_A;

/**
 * The strength ladder. `u` is the TARGET deepest gain offset on the reference
 * ground — u = -0.44 means the bowl's floor comes back at 56 % of the ground it
 * lies on. It is hit by solving a per-variant gain against the MEASURED p1 of
 * the photograph's own ratio field, so a contrasty return and a flat return
 * both land on the same rung.
 *
 * `rimCap` is the ceiling on the positive side. It rises with the rung because
 * a bigger crater throws more ejecta — but it stays low throughout: a weathered
 * apron is "kaum heller", and a hot rim is the fresh-impact look the brief rules
 * out.
 *
 * The two jobs map onto the ladder like this (assignment is NOT wired here):
 *   rungs 0-1  pattern breaker on the ten quiet grounds
 *   rungs 2-3  identity on `crater` / `impact_crater`, at higher density
 */
const RUNGS = [
  // 0/1 — the pattern-breaker rungs. UNTOUCHED by the sharpening round: here the
  // softness is the intent.
  { u: -0.086, soft: 0.16, dish: 0.40 }, // 0 — barely there: a ghost dip
  { u: -0.147, soft: 0.11, dish: 0.40 }, // 1 — mild
  // 2/3 — the identity rungs. SHARPENED after Rudi rejected the first cut as a
  // "grauer Fleck": weathering low-pass roughly halved (0.075 -> 0.045,
  // 0.05 -> 0.025) and the synthetic dish cut back (0.40 -> 0.28) so the
  // crescent PAIR dominates it again instead of the other way round.
  { u: -0.220, soft: 0.045, dish: 0.28 }, // 2 — clear
  { u: -0.297, soft: 0.025, dish: 0.28 }, // 3 — pronounced, still edge-free
];

/**
 * Damping of the OUTER rim shadow — the third of the three faults in the first
 * cut. v3 read as a comma rather than a bowl because the inner shadow arc
 * (up-left) and the rim's own cast shadow (down-right, further out) run in
 * opposite directions and the heavy low-pass smeared them into one spiral.
 *
 * Only the NEGATIVE part beyond OUTER_DAMP_R is damped, so the pale apron on
 * the sunlit side survives: the cast shadow is what fights the reading, the
 * apron is what supports it.
 */
const OUTER_DAMP_R = 0.86;
const OUTER_DAMP_MIN = 0.40;

/**
 * The positive side is NOT an independent small number, and getting that wrong
 * cost a round. Attempt 1 capped it at a token 0.05 while the negative side ran
 * to 0.14 — and the sprite came out a dark CRESCENT instead of a bowl.
 *
 * The lit crescent on the inner lower-right wall is not decoration and it is not
 * the ejecta apron: together with the shadow on the inner upper-left wall it is
 * the ONLY thing that says "dip" rather than "stain" once the sprite is 30 px
 * wide. Clip one of the pair and the depth cue is gone. So the cap scales with
 * the rung, and the photograph's own dark/light ratio is what passes through.
 *
 * 0.5 keeps the apron modest ("kaum heller") while leaving the inner crescent
 * intact — measured per ground as `rim lift` in `validate`.
 */
const POS_CAP_FRAC = 0.5;

/**
 * `soft` above is the weathering low-pass, as a fraction of the crater radius.
 *
 * "Verwittert und eingesunken" is, as an image operation, a LOW-PASS: erosion
 * rounds every contour and dust fills every sharp step. flux does not obey the
 * word — asked for a rim "worn away flush with the ground" it returned a crisp
 * fresh rim (attempt 1, all four seeds carry the same bias) — so the softening
 * is done here, deterministically, on the extracted ratio field.
 *
 * It is also the second leg of the strength ladder, and the honest one: the weak
 * rungs are more filled-in AND shallower, the strong rungs less filled-in and
 * deeper, and no rung has a hard edge. That is exactly "von kaum sichtbar-
 * verwaschen bis deutlich ausgeprägt" while "auch die stärkste Variante ist ein
 * alter, weichgespülter Krater".
 *
 * This is a scripted step applied identically to every variant, in the same
 * class as the tone normalise — not hand retouching of a failed generation.
 */

/**
 * PROPOSED per-variant height factors — read only by the review sheets.
 *
 * The renderer's width is drawH * aspect = 28 * factor * 2.0 = 56 * factor, so
 * for a target share s of the 48 px tile width: factor = 48 s / 56 = 0.857 s.
 * The diameter span is the other half of the strength ladder (LESSONS § 7:
 * props scale over the HEIGHT, and "Größe und Dichte nie gleichzeitig senken").
 *
 *   s = 0.45 -> 0.386 -> 21.6 x 10.8 px
 *   s = 0.55 -> 0.471 -> 26.4 x 13.2 px
 *   s = 0.65 -> 0.557 -> 31.2 x 15.6 px
 *   s = 0.72 -> 0.617 -> 34.6 x 17.3 px
 *
 * The largest is the cap, not a preference: at PROP_GROUND_INSET 1.0 the anchor
 * is the tile CENTRE and propLayout adds a +-6.7 px x-jitter, so the extent is
 * 17.3 + 6.7 = 24.0 px = exactly TW/2. Anything wider spills onto the
 * neighbouring tile, which on a biome edge means a crater half on another biome.
 */
const HEIGHT_FACTORS = [0.386, 0.471, 0.557, 0.617];

/** The twelve grounds this family has to work on. BARREN + ASTEROIDS. */
const GROUNDS = [
  'crater',
  'impact_crater',
  'regolith',
  'rocky_outcrop',
  'dust_plain',
  'metallic_surface',
  'dust_basin',
  'silicate_plain',
  'boulder_field',
  'carbon_crust',
  'fractured_zone',
  'void_edge',
];
/** The five the brief names as the decisive test, in the order it names them. */
const KEY_GROUNDS = [
  'regolith',
  'rocky_outcrop',
  'metallic_surface',
  'dust_basin',
  'silicate_plain',
];

// ══════════════════════════════════════
// Prompts
// ══════════════════════════════════════
//
// Positive phrasing only (LESSONS § 3: "Keine Negativ-Prompts. Sie reproduzieren
// das Ungewollte."), so "no sky" is written as "the ground fills the frame" and
// "not glossy" as "matte".
//
// The anchor carries the three things the extraction depends on and the prompt
// is the only place they can come from:
//   1. NADIR + orthographic + ground fills the frame  -> the squash is valid
//   2. one crater, centred, wide margin of plain       -> the background fit has
//      undisturbed ground to fit on, on all four sides
//   3. the crescent SIGN                               -> bowl, not dome
//
// Colour is deliberately understated ("neutral grey", "almost colourless"):
// LESSONS § 3 warns that colour and light words do the damage, and here the hue
// is discarded in the extraction anyway. Only the luminance STRUCTURE is used.
// ── ATTEMPT 2. What attempt 1 got wrong, in the prompt ──
// The crater came back filling the frame ("wide margin on all four sides" was
// not enough), which starves the background fit of the undisturbed plain it has
// to be fitted on — and a starved fit extrapolated high, so the whole frame read
// as a depression. The size is now stated as a FRACTION of the frame and the
// margin as a positive instruction about the border, and `buildFromRaw` REFUSES
// a return whose feature is too big instead of quietly measuring it wrong.
const ANCHOR =
  'Photorealistic vertical aerial survey photograph looking straight down at a wide flat ' +
  'plain of grey dust and rock on an airless moon, orthographic top-down view, the ground ' +
  'filling the frame from edge to edge. ' +
  'The crater sits in the middle of the frame and spans only about one third of its width; ' +
  'all around it, out to every edge, the plain is undisturbed, level and evenly textured ' +
  'with fine grey dust and small embedded pebbles. ' +
  'Low sunlight from the upper left: the hollow is shaded along its inner upper-left wall ' +
  'and pale along its inner lower-right wall, so it reads as a dip in the ground and not a ' +
  'mound on it. ' +
  'Every contour on it is rounded and softened by ages of settled dust, matte neutral grey ' +
  'almost colourless material, evenly exposed and uniformly sharp across the whole frame, ' +
  'high detail.';

const SHAPES = [
  {
    // 0 — the ghost. Almost entirely buried; the outline is a change of texture
    // more than a change of shape.
    seed: 771103,
    form:
      'One extremely old crater almost completely buried, its bowl filled level with drifted ' +
      'dust so that only a faint wide saucer-shaped dimple is left, its rim reduced to a ' +
      'barely raised ring of soft low mounds.',
  },
  {
    // 1 — mild, and deliberately NOT a circle, so the family does not read as
    // one stamp at four sizes.
    seed: 771217,
    form:
      'One old degraded crater, a shallow oval saucer with a slightly lobed uneven outline, ' +
      'its floor smoothed flat by settled dust and its rim rounded down into low soft swells ' +
      'that merge gradually into the plain.',
  },
  {
    // 2 — clear. A faint apron of ancient ejecta appears from here on.
    seed: 771331,
    form:
      'One old weathered crater, a broad rounded bowl with a dust-smoothed floor, ringed by a ' +
      'low rounded worn rim of soft mounds and a faint dusty apron of ancient ejecta fading ' +
      'outward into the plain.',
  },
  {
    // 3 — the identity rung. Bigger and deeper, with a slumped terraced inner
    // wall. Slumping is what makes an OLD crater look deep WITHOUT a sharp rim,
    // which is the whole trick of this rung: "stärker" must not become "frischer".
    seed: 771447,
    form:
      'One large ancient crater, a wide rounded basin whose inner wall has slumped into soft ' +
      'rounded terraces down to a dust-covered floor, ringed by a broad low worn rim of ' +
      'rounded mounds and a wide faint dusty apron of ancient ejecta.',
  },
];

// ══════════════════════════════════════
// TRACK B — the generator route
// ══════════════════════════════════════
//
// ── WHY THERE IS A SECOND TRACK AT ALL, AND WHAT IT CORRECTS
//
// Rudi 2026-09-08: "für die zukunft kannst du solche assets auch immer über
// fal.ai generieren. die müssen nicht lokal erzeugt werden."
//
// The first cut of v2/v3 was rejected as a "grauer Fleck", and the cause was a
// working habit, not a parameter: where flux did not deliver an image property,
// this script rebuilt it locally — a low-pass for "weathering", a synthetic
// dish for depth, a crescent pair lifted out of a ratio field. Worse, the
// sharpening proposal was advertised as costing "not a single new fal call",
// as if generator calls were the scarce resource. They are not. The round was.
//
// THE RULE FROM HERE ON: when the generator does not deliver an image property,
// the FIRST attempt is a different prompt, not a local reconstruction. Local
// determinism stays for what must be exact — the iso squash, the crop, the
// mips, the colour and shading measurements, the ratio extraction as a soft
// cut-out — never for the image structure itself.
//
// ── TWO PROMPT FAULTS, BOTH DIAGNOSED FROM THE FIRST ROUND'S OWN NOTES
//
// 1. THE RIM WAS ASKED FOR AS AN ABSENCE. "its rim worn away flush with the
//    ground", "reduced to a barely raised ring" — four seeds, four crisp fresh
//    rims. LESSONS § 3 already says it ("Keine Negativ-Prompts. Sie
//    reproduzieren das Ungewollte. Stattdessen eine positive
//    Ersetzungsanweisung") and the note was there in the file while the prompt
//    broke the rule. An OLD crater does not have a MISSING wall, it has a
//    BROAD, LOW, IRREGULAR one. So the wall is now described by what is there:
//    heaped rubble, lumpy along its circumference, spreading far outward over a
//    long shallow apron.
//
// 2. THE FRAMING WAS FOUGHT INSTEAD OF USED. Eight generations composed a
//    single crater filling the frame, and the pipeline was bent around that.
//    Asking for a LANDSCAPE of many craters at many sizes turns the size
//    distribution from an obstacle into a supply: the detector below picks the
//    crater that suits each rung and crops it out. Bigger and better-defined
//    for v3, moderate for v2, from the same plate.
const GEN_LAND = { w: 1408, h: 1408 };

const ANCHOR_LAND =
  'Photorealistic vertical aerial survey photograph looking straight down at a heavily ' +
  'cratered grey dust plain on an airless moon, orthographic top-down view, the ground ' +
  'filling the frame from edge to edge. ' +
  'Around each crater stands a broad low irregular wall of heaped grey rubble and dust that ' +
  'rises gently, runs lumpy and uneven all the way round, and spreads far outward into the ' +
  'plain over a long shallow apron. ' +
  'Low sunlight from the upper left: the inside of every crater is shaded along its upper-left ' +
  'wall and pale along its lower-right wall, and each wall lays a soft wide shadow out to the ' +
  'lower right, so the craters read as dips in the ground and not as mounds on it. ' +
  'Neutral grey almost colourless dusty material, matte, evenly exposed and uniformly sharp ' +
  'across the whole frame, very high detail with fine grain visible in the dust.';

/**
 * A second anchor that never says "crater" or "impact".
 *
 * Seven plates and a dozen erosion formulations all came back as textbook FRESH
 * craters — sharp bright rims, boulder fields, a narrow shadow crescent and a
 * blown-out floor — including the two plates whose forms said "half buried
 * under dust" and "walls subsided into wide low swells". The prompts were doing
 * their job; the subject word was overriding them, because "crater aerial
 * photograph" has one dominant look in any training set.
 *
 * So this anchor asks for the GEOMETRY and never names the thing: a shallow
 * circular hollow in dust. That is the same move LESSONS § 3 records for the
 * ICE round — "Nur nach Geometrie zu fragen ('fülle die Krater, bedecke die
 * Steine, der Boden wird eben') ließ den Grund stehen" — applied to the subject
 * rather than to the material.
 */
const ANCHOR_HOLLOW =
  'Photorealistic vertical aerial survey photograph looking straight down at a flat grey dust ' +
  'plain on an airless moon, orthographic top-down view, the ground filling the frame from ' +
  'edge to edge. ' +
  'The plain is deep soft dust everywhere, smooth and unbroken, with no rocks and no boulders ' +
  'anywhere in the frame. ' +
  'Low sunlight from the upper left: the inside of each hollow is faintly shaded along its ' +
  'upper-left slope and faintly pale along its lower-right slope, so each reads as a dip in ' +
  'the ground and not as a mound on it. ' +
  'Neutral grey almost colourless dust, matte, evenly exposed with soft even light and no ' +
  'bright highlights, uniformly sharp across the whole frame, fine dust grain visible.';

const PLATES = [
  {
    tag: 'rubble',
    seed: 880211,
    form:
      'A dozen ancient craters of many different sizes scattered across the plain, from small ' +
      'pits to broad shallow basins, several of them overlapping. Each is filled level with ' +
      'drifted pale dust and encircled by a wide belt of heaped rubble.',
  },
  {
    tag: 'hummock',
    seed: 880317,
    form:
      'Ten old degraded craters of assorted sizes across the plain, their walls worn into ' +
      'chains of low rounded hummocks, their floors smooth with settled dust, the largest one ' +
      'showing slumped terraces stepping down its inner wall.',
  },
  {
    tag: 'apron',
    seed: 880431,
    form:
      'Eight very old craters of assorted sizes across the plain, each sunken into the ground ' +
      'and ringed by a wide gently swelling apron of grey ejecta that fades gradually into the ' +
      'surrounding dust, the two largest with broad flat dust-filled floors.',
  },
  // ── FEWER, BIGGER. The first three plates put a dozen craters in the frame
  // and the detector's best pick came back at R 180 — a 403 px crop for a 400 px
  // sprite, i.e. barely 1:1, where a frame-filling single crater had given ~1000
  // px of crater. Resolution is exactly what this round is trying to buy back,
  // so two more plates ask for THREE OR FOUR large craters instead of a dozen
  // assorted ones. The landscape idea still pays — the detector picks which
  // crater suits which rung — it just needs the craters to be big in the frame.
  {
    tag: 'fewbig',
    seed: 880547,
    form:
      'Only three very large ancient craters, each one spanning about a third of the frame, ' +
      'their broad floors filled level with pale drifted dust and each encircled by a wide belt ' +
      'of heaped low rubble that spreads far out into the plain between them.',
  },
  {
    tag: 'terrace',
    seed: 880653,
    form:
      'Only two enormous ancient craters side by side, each spanning nearly half the frame, ' +
      'their inner walls slumped into broad rounded terraces stepping down to smooth ' +
      'dust-covered floors, each ringed by a wide belt of low heaped rubble.',
  },
  // ── BIG *AND* DEGRADED. `terrace` delivered the size (R 290-310, a 831 px
  // crop) but its craters came back FRESH: a crisp knobbly crest, the opposite
  // failure from round 1. The rim wording had overcorrected — asking for "a
  // broad low irregular wall of heaped rubble" got a prominent one.
  // These two plates keep the size and put the degradation back, still stated
  // positively: the wall is a WIDE LOW SWELL, its crest broken into separate
  // mounds with gaps of plain between them, and the floor is filled level.
  {
    tag: 'degraded',
    weathered: true,
    seed: 880771,
    form:
      'Only three enormous ancient craters, each spanning a third of the frame, so old their ' +
      'walls have subsided into wide low swells whose crests break into separate flattened ' +
      'mounds with level plain between them, their floors filled level with pale dust.',
  },
  {
    tag: 'buried',
    weathered: true,
    seed: 880883,
    form:
      'Only two enormous craters, each spanning nearly half the frame, half buried under dust: ' +
      'their floors lie level with the plain, their walls survive as broad gentle rises that ' +
      'blend outward over a very long apron, and a smaller old crater overlaps one wall.',
  },
  // ── THE SUBJECT WORD, NOT THE EROSION WORDING. See ANCHOR_HOLLOW.
  {
    tag: 'hollow',
    weathered: true,
    anchor: ANCHOR_HOLLOW,
    seed: 881009,
    form:
      'Three enormous shallow circular hollows sunk into the dust, each spanning about a third ' +
      'of the frame, no deeper than gentle saucers with smooth level dust floors, their edges ' +
      'rising into wide banks so low and soft they barely lift above the surrounding plain.',
  },
];

/**
 * Find craters in a landscape plate.
 *
 * The detector is the SAME physics as the bowl/dome gate, reused: a crater's
 * signature is a light-axis DIPOLE on a ring — dark on the inner up-left wall,
 * pale on the inner down-right. So correlate the ratio field with a ring-dipole
 * kernel at a set of radii and take the local maxima with POSITIVE response
 * (negative = a mound). Nothing here is tuned to a particular plate; the same
 * kernel that gates a bowl finds one.
 *
 * The search grid and the kernel are both subsampled — the response is a smooth
 * function of position and radius, so nothing is gained by evaluating it per
 * pixel, and it turns a 10^9 loop into a 10^7 one.
 */
function findCraters(lum, w, h) {
  // Background: a degree-3 polynomial over the WHOLE plate. Safe here in a way
  // it was not for a single frame-filling crater — a dozen craters at assorted
  // positions average out of a low-order fit instead of dragging it.
  const cx0 = (w - 1) / 2, cy0 = (h - 1) / 2;
  const terms = [];
  for (let a = 0; a <= 3; a++) for (let b = 0; a + b <= 3; b++) terms.push([a, b]);
  const K = terms.length;
  const A = Array.from({ length: K }, () => new Float64Array(K));
  const bv = new Float64Array(K);
  const basis = (nx, ny) => terms.map((t) => Math.pow(nx, t[0]) * Math.pow(ny, t[1]));
  for (let y = 0; y < h; y += 4)
    for (let x = 0; x < w; x += 4) {
      const T = basis((x - cx0) / cx0, (y - cy0) / cy0);
      const v = lum[y * w + x];
      for (let a = 0; a < K; a++) {
        bv[a] += T[a] * v;
        for (let b = 0; b < K; b++) A[a][b] += T[a] * T[b];
      }
    }
  const coef = D.solveLinSys(A.map((r) => Array.from(r)), Array.from(bv));
  const u = new Float64Array(w * h);
  const bg = new Float64Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const T = basis((x - cx0) / cx0, (y - cy0) / cy0);
      let b = 0;
      for (let k = 0; k < K; k++) b += coef[k] * T[k];
      bg[y * w + x] = Math.max(1, b);
      u[y * w + x] = clamp(lum[y * w + x] / bg[y * w + x], 0.3, 2.2) - 1;
    }

  const RADII = [];
  for (let R = 90; R <= 500; R += 20) RADII.push(R);
  const STEP = 12;
  const hits = [];
  for (const R of RADII) {
    // ring-dipole kernel, subsampled; w(r) peaks on the inner wall (r ~ 0.62 R)
    const taps = [];
    const kstep = Math.max(3, Math.round(R / 26));
    let norm = 0;
    for (let dy = -R; dy <= R; dy += kstep)
      for (let dx = -R; dx <= R; dx += kstep) {
        const r = Math.hypot(dx, dy) / R;
        if (r < 0.25 || r > 0.95) continue;
        const ring = Math.exp(-Math.pow((r - 0.62) / 0.22, 2));
        const s = (dx / R + dy / R) / Math.SQRT2;
        taps.push([dx, dy, s * ring]);
        norm += s * s * ring * ring;
      }
    if (!taps.length || norm <= 0) continue;
    for (let cy = R; cy < h - R; cy += STEP)
      for (let cx = R; cx < w - R; cx += STEP) {
        let acc = 0;
        for (let t = 0; t < taps.length; t++)
          acc += u[(cy + taps[t][1]) * w + cx + taps[t][0]] * taps[t][2];
        const resp = acc / norm;
        if (resp > 0) hits.push({ cx, cy, R, resp });
      }
  }
  // Greedy non-maximum suppression: strongest first, then anything whose centre
  // falls inside an already-taken crater is a duplicate of it.
  hits.sort((a, b) => b.resp - a.resp);
  const keep = [];
  for (const hh of hits) {
    if (keep.some((k) => Math.hypot(k.cx - hh.cx, k.cy - hh.cy) < 0.75 * Math.max(k.R, hh.R))) continue;
    keep.push(hh);
    if (keep.length >= 12) break;
  }
  return { hits: keep, bg };
}

/** Margin factor of the crop: side = 2 x CROP_M x R. */
const CROP_M = 1.34;

/**
 * The per-ring light-axis dipole profile of a field, about a given centre and
 * radii. Shared by the bowl/dome gate in buildFromRaw and by the track-B pick,
 * because they ask the same question and it must be the same number.
 *
 * A bowl's inner wall is dark up-left and pale down-right, so its dipole is
 * POSITIVE; a dome's is negative; and the rim ring carries the opposite sign to
 * the wall ring, which is why only the ring where |dip| PEAKS is meaningful.
 */
function ringDipole(u, w, h, cx, cy, Rx, Ry, NB = 24) {
  const num = new Float64Array(NB);
  const den = new Float64Array(NB);
  for (let y = 0; y < h; y++) {
    const ny = (y - cy) / Ry;
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / Rx;
      const r = Math.hypot(nx, ny);
      if (r < 0.06 || r > 0.98) continue;
      const b = Math.min(NB - 1, Math.floor(((r - 0.06) / 0.92) * NB));
      const s = (nx + ny) / Math.SQRT2;
      num[b] += u[y * w + x] * s;
      den[b] += s * s;
    }
  }
  const profile = [];
  let peak = 0, peakR = 0;
  for (let b = 0; b < NB; b++) {
    const d = den[b] > 0 ? num[b] / den[b] : 0;
    profile.push(d);
    if (Math.abs(d) > Math.abs(peak)) { peak = d; peakR = 0.06 + ((b + 0.5) / NB) * 0.92; }
  }
  return { peak, peakR, profile };
}

/**
 * Where a genuine crater puts its peak dipole. A bowl's wall ring sits well
 * inside the rim and well outside the floor; a peak at the very centre means
 * the field is a broad gradient, not a ring.
 *
 * This guard exists because it was needed: the detector's pick for v2 came back
 * centred on the INSIDE of a much larger crater's rim — a bright arc across one
 * corner and flat ground elsewhere — and it scored a high response because a rim
 * arc IS a light-axis dipole. Its profile peaked at r 0.08. A real crater in
 * this corpus peaks at 0.42-0.58.
 */
const DIP_PEAK_LO = 0.28;
const DIP_PEAK_HI = 0.78;
/**
 * rimRatio DIAGNOSTIC ONLY — see the note at the pick. It measures the rim's
 * shading asymmetry, not its prominence, and gates nothing.
 */

/**
 * Flatten a plate by its own GLOBAL background, then cut a crater out of it.
 *
 * ── WHY THE BACKGROUND IS REMOVED HERE AND NOT IN buildFromRaw
 *
 * The first landscape crops went through `planeBackground` like the
 * single-crater raws, and the diagnostics said plainly that it does not
 * transfer: 90.8 % of the ground annulus REJECTED, a fitted "photo ramp" of
 * 42.8 %, and a light-axis dipole that was monotone positive at every radius —
 * i.e. a broad gradient, not a crater ring.
 *
 * The cause is structural, not a tuning miss. `planeBackground` fits the plain
 * on an annulus just inside the sprite window, which works when the window is a
 * whole frame with one crater in the middle and real plain around it. In a crop
 * taken 1.34 R around a crater in a CRATER FIELD, that annulus sits on the
 * ejecta belt and on the neighbours — there is no undisturbed plain in the crop
 * to fit on, so the fit ran on 9 % of the ring and put a steep plane through it.
 *
 * The plate as a whole, on the other hand, is the ideal place to estimate it:
 * a dozen craters at assorted positions AVERAGE OUT of a low-order polynomial
 * instead of dragging it, which is exactly why `findCraters` can use a degree-3
 * fit over the full frame. So the background is divided out ONCE, globally,
 * where it is well determined; the crop arrives already flat and
 * `planeBackground` has almost nothing left to remove.
 *
 * The gain is a per-pixel SCALAR, so hue is untouched (LESSONS § 5: "Ein
 * Luma-Flatten entfernt keinen Farbverlauf" — here that property is the point,
 * not the problem, because the hue is discarded downstream anyway).
 */
async function flattenPlate(plate, bg, w, h) {
  const { data } = await sharp(plate).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(w * h * 3);
  // Nominal level 128: mid-range, so neither the bowl shadows nor the ejecta
  // highlights clip before the ratio is taken.
  for (let p = 0; p < w * h; p++) {
    const g = 128 / bg[p];
    for (let c = 0; c < 3; c++) out[p * 3 + c] = clamp(Math.round(data[p * 3 + c] * g), 0, 255);
  }
  return sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

/** Crop one detected crater out of a (flattened) plate. */
async function cropCrater(flat, hit, w, h) {
  // side = 2 x 1.34 R, so the crater's own edge lands at r = 1/1.34 = 0.75 of
  // the frame-inscribed ellipse and the ground annulus (r >= 0.90) sits on the
  // apron at 1.2-1.34 R rather than on the rim crest. Craters too close to a
  // plate edge to afford this margin are filtered out in the pick, so the crop
  // is never shifted off-centre.
  const side = Math.round(2 * CROP_M * hit.R);
  const left = Math.round(hit.cx - side / 2);
  const top = Math.round(hit.cy - side / 2);
  if (left < 0 || top < 0 || left + side > w || top + side > h)
    throw new Error(`crater at ${hit.cx},${hit.cy} R${hit.R} does not fit the crop margin`);
  return sharp(flat).extract({ left, top, width: side, height: side }).png().toBuffer();
}

// ══════════════════════════════════════
// helpers
// ══════════════════════════════════════

const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const DIR_CAND = path.join(L.ROOT, 'assets', 'cand');
/** `tag` '' = the shipped set in assets/final; anything else = a candidate. */
const finalPath = (i, tag = '') =>
  tag ? path.join(DIR_CAND, `${FAMILY}_${i}_${tag}.png`) : path.join(L.DIR_FINAL, `${FAMILY}_${i}.png`);
const rawPath = (i, tag = '') =>
  tag ? path.join(L.DIR_RAW, `${FAMILY}_${i}_${tag}_raw.png`) : path.join(L.DIR_RAW, `${FAMILY}_${i}_raw.png`);
const platePath = (tag) => path.join(L.DIR_RAW, `${FAMILY}_plate_${tag}.png`);

/** Separable box blur with edge clamping, over a Float64Array. */
function boxBlur(src, w, h, r) {
  const tmp = new Float64Array(w * h);
  const out = new Float64Array(w * h);
  const d = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / d;
      acc += src[y * w + clamp(x + r + 1, 0, w - 1)] - src[y * w + clamp(x - r, 0, w - 1)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / d;
      acc += tmp[clamp(y + r + 1, 0, h - 1) * w + x] - tmp[clamp(y - r, 0, h - 1) * w + x];
    }
  }
  return out;
}

/**
 * The denominator of the ratio: the ground level the crater is measured against.
 *
 * ── TWO ATTEMPTS ARE BURIED HERE AND BOTH ARE WORTH KEEPING WRITTEN DOWN
 *
 * A BLUR is the obvious denominator and the wrong one: the crater is the largest
 * feature in the frame, so it contaminates its own denominator and the ratio
 * comes back flattened. Same contamination LESSONS § 2 records for
 * divide-by-blur on masked tiles, same remedy — an analytic fit, which has no
 * neighbourhood to contaminate.
 *
 * Attempt 1 fitted degree 4 over the whole frame with robust rejection of the
 * crater. It failed for a reason that is worth stating: with the crater filling
 * the frame there is almost no plain left to fit on, and a QUARTIC extrapolates
 * from what little remains wildly inward. The ratio came back below 1 over the
 * whole frame, so every pixel read as depressed and the sprite was one broad
 * stain with a crescent in it.
 *
 * Attempt 2 excluded an elliptical core and dropped to degree 2, and gated on
 * the feature radius so a frame-filling return was refused. **All four seeds
 * were refused** at feature radius 0.62-0.76 of the half-frame. That is not
 * seed luck: a nadir survey photograph of a crater is COMPOSED with the crater
 * filling the frame, and no amount of "spans only about one third of its width"
 * moves it. Eight generations agreed.
 *
 * So the geometry stops depending on the framing. What the decal needs is not
 * "the plain around the crater" but "the level the crater's edge sits at" — and
 * a crater's rim IS at plain level, that is what a rim is. Fit a PLANE on the
 * outer annulus of the frame-inscribed ellipse and use that. A plane is chosen
 * over any higher order deliberately: a plane cannot bow, so it cannot partly
 * cancel the bowl it is supposed to measure, however much of the frame the bowl
 * occupies. It removes the photograph's lighting ramp, which is the only thing
 * the denominator has to remove; whatever curvature is left stays in the ratio,
 * is zeroed at the rim by the annulus bias step, and is suppressed near the edge
 * by the window taper.
 */
function planeBackground(lum, w, h, rad, passes = 3, tol = 0.08) {
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const STEP = 3;
  const inBand = (p) => rad[p] >= FIT_BAND_LO;
  let weight = null;
  let coef = null;
  let dropped = 0;
  let bandN = 0;
  for (let p = 0; p < passes; p++) {
    // basis: [1, nx, ny]
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const bv = [0, 0, 0];
    for (let y = 0; y < h; y += STEP) {
      const ny = (y - cy) / cy;
      for (let x = 0; x < w; x += STEP) {
        const idx = y * w + x;
        if (!inBand(idx)) continue;
        if (weight && weight[idx] === 0) continue;
        const T = [1, (x - cx) / cx, ny];
        const v = lum[idx];
        for (let a = 0; a < 3; a++) {
          bv[a] += T[a] * v;
          for (let b = 0; b < 3; b++) A[a][b] += T[a] * T[b];
        }
      }
    }
    coef = D.solveLinSys(A.map((r) => r.slice()), bv.slice());
    weight = new Uint8Array(w * h).fill(1);
    dropped = 0;
    bandN = 0;
    for (let y = 0; y < h; y++) {
      const ny = (y - cy) / cy;
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (!inBand(idx)) continue;
        bandN++;
        const b = coef[0] + coef[1] * ((x - cx) / cx) + coef[2] * ny;
        if (!(b > 1) || Math.abs(lum[idx] / b - 1) > tol) { weight[idx] = 0; dropped++; }
      }
    }
  }
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    const ny = (y - cy) / cy;
    for (let x = 0; x < w; x++)
      out[y * w + x] = Math.max(1, coef[0] + coef[1] * ((x - cx) / cx) + coef[2] * ny);
  }
  return {
    bg: out,
    rejectedPct: (100 * dropped) / Math.max(1, bandN),
    ramp: Math.hypot(coef[1], coef[2]) / Math.max(1e-6, coef[0]),
  };
}

/** Percentile of a Float64Array over a boolean selector. */
function pct(arr, sel, q) {
  const v = [];
  for (let i = 0; i < arr.length; i++) if (sel[i]) v.push(arr[i]);
  if (!v.length) return 0;
  v.sort((a, b) => a - b);
  return v[clamp(Math.floor(q * (v.length - 1)), 0, v.length - 1)];
}

// ══════════════════════════════════════
// Steps 3-5 — extract the gain field, encode it, crop, scale
// ══════════════════════════════════════

async function buildFromRaw(i, raw, tag = '', opts = {}) {
  const rung = RUNGS[i];
  const DISH_FRAC = rung.dish;

  // ── step 3a: the deterministic iso squash (see header) ──
  // The working width is the SOURCE width, capped at SQ_W. A frame-filling
  // single-crater generation arrives at 1024 and is squashed to 1024x512; a
  // crater cut out of a landscape plate may arrive at 400-800, and upsampling it
  // to 1024 only to hand back a 400 px sprite would add a bilinear round trip
  // for nothing. Every radius in this function is expressed as a fraction of
  // Rx = w/2, so the physics is identical at either size.
  const srcMeta = await sharp(raw).metadata();
  const w = Math.max(256, Math.min(SQ_W, srcMeta.width));
  const h = Math.round(w / 2);
  const { data } = await sharp(raw)
    .removeAlpha()
    .resize(w, h, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const n = w * h;

  const lum = new Float64Array(n);
  for (let p = 0; p < n; p++) lum[p] = L709(data[p * 3], data[p * 3 + 1], data[p * 3 + 2]);

  // ── step 3b: the window is the FRAME-INSCRIBED 2:1 ELLIPSE ──
  // Not a located one. See planeBackground for why the framing stopped being
  // trusted; the consequence here is that the decal's extent IS the frame, so
  //   Rx = w/2, Ry = h/2 = Rx/2
  // which touches all four frame edges — the alpha bbox is therefore the whole
  // frame and the aspect is exactly 2.000 by construction, with no aspect band
  // to police and no re-roll lottery.
  // ── HOW MUCH OF THE FRAME THE CRATER OCCUPIES DIFFERS BY SOURCE ──
  // A frame-filling single-crater generation puts the crater's edge at the frame
  // edge, so a flat window out to 0.70 and a taper to 1.0 lands the taper on the
  // rim and apron — correct. A crater cut 1.34 R out of a landscape plate has
  // its edge at r = 1/1.34 = 0.75, so the SAME window tapers across the rim and
  // throws it away: the first landscape build came back as a plain dark lobe
  // with no ring, and that was this window, not the generation. Comparing the
  // two routes with a window tuned to one of them would have decided the
  // comparison in the pipeline rather than in the art.
  const winFlat = opts.winFlat ?? WIN_FLAT;
  const Rx = w / 2;
  const Ry = h / 2;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const rad = new Float64Array(n);
  const win = new Float64Array(n);
  for (let y = 0; y < h; y++) {
    const dy = (y - cy) / Ry;
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / Rx;
      const r = Math.hypot(dx, dy);
      rad[y * w + x] = r;
      // Flat inside WIN_FLAT, raised cosine to zero at 1.0. No hard edge
      // anywhere. WIN_FLAT is 0.70 rather than the 0.55 of attempt 1 because at
      // 0.55 the taper was already eating the LIT inner crescent, which sits
      // around r 0.6-0.85 on a frame-filling crater — and that crescent is half
      // of the depth cue (see POS_CAP_FRAC).
      win[y * w + x] =
        r <= winFlat ? 1 : r >= 1 ? 0 : 0.5 * (1 + Math.cos(Math.PI * ((r - winFlat) / (1 - winFlat))));
    }
  }

  // ── step 3c: the ground level, and the ratio against it ──
  // A PRE-FLATTENED source (a crop out of a globally flattened landscape plate,
  // see flattenPlate) has already had its background divided out at plate scale,
  // where it was well determined. Re-fitting it locally can only re-introduce
  // error, and measurably did: v2's crop came back with 88.8 % of the annulus
  // rejected and a fitted "ramp" of 35.5 % on a field that was already flat. So
  // for those the denominator is the constant nominal level flattenPlate wrote,
  // and the residual offset is handled where it belongs — by the rim-annulus
  // bias step below, which needs no fit at all.
  const preFlat = !!opts.preFlat;
  const { bg, rejectedPct, ramp } = preFlat
    ? { bg: new Float64Array(n).fill(128), rejectedPct: 0, ramp: 0 }
    : planeBackground(lum, w, h, rad);
  const u = new Float64Array(n); // gain offset, 0 = "level with the rim here"
  for (let p = 0; p < n; p++) u[p] = clamp(lum[p] / bg[p], 0.35, 2.0) - 1;

  // ── step 3d: the weathering low-pass — "verwittert und eingesunken" ──
  // See the note on RUNGS.soft. Erosion IS a low-pass, flux does not obey the
  // word, and the amount is the second leg of the strength ladder.
  const softR = Math.max(1, Math.round(rung.soft * Rx));
  const uS = boxBlur(u, w, h, softR);

  // ── step 3e: zero the field at its OWN rim ──
  // The last defence against a background fit that is a little high or low: a
  // residual bias would make the whole footprint a faint stain on every ground,
  // which is the failure attempt 1 shipped. Measured on the outer annulus of the
  // window — where, by construction, there is no crater left — and subtracted.
  let bSum = 0, bN = 0;
  for (let p = 0; p < n; p++) if (rad[p] >= 0.86 && rad[p] <= 0.99) { bSum += uS[p]; bN++; }
  const bias = bN ? bSum / bN : 0;
  for (let p = 0; p < n; p++) uS[p] -= bias;

  // ── step 4: the dish, then the rung ──
  const inner = new Uint8Array(n);
  for (let p = 0; p < n; p++) inner[p] = rad[p] <= 0.9 ? 1 : 0;
  // p1, not min: one dark pebble must not set the scale for the whole variant.
  const arcDeep = pct(uS, inner, 0.01);
  if (!(arcDeep < -0.02))
    throw new Error(
      `${FAMILY}_${i}: the return has no depression to scale (p1 of u = ${arcDeep.toFixed(3)}) — ` +
        `flux returned a dome or a flat plain, regenerate with a new seed`,
    );
  // A smooth radial dish on top of the extracted crescents — see DISH_FRAC.
  // Scaled to the arc's own depth so it stays in proportion at every rung.
  const uC = new Float64Array(n);
  for (let p = 0; p < n; p++) {
    const rr = Math.min(1, rad[p] / 0.95);
    const prof = 0.5 * (1 + Math.cos(Math.PI * rr));
    let v = uS[p] + DISH_FRAC * arcDeep * prof;
    // Damp the OUTER rim shadow only — see OUTER_DAMP_R. The pale apron on the
    // sunlit side is left alone; it supports the reading, the cast shadow on the
    // far side fights it.
    if (v < 0 && rad[p] > OUTER_DAMP_R) {
      const k = (rad[p] - OUTER_DAMP_R) / (1 - OUTER_DAMP_R);
      v *= 1 - (1 - OUTER_DAMP_MIN) * clamp(k, 0, 1);
    }
    uC[p] = v * win[p];
  }
  // The rung is hit on the COMBINED field, so `u` stays the total deepest gain.
  const uDeep = pct(uC, inner, 0.01);
  const g = rung.u / uDeep;
  const posCap = POS_CAP_FRAC * -rung.u;
  const dishAtCentre = DISH_FRAC * arcDeep * g;

  // ── step 4b: BOWL, NOT DOME — the one failure nothing downstream can fix ──
  // LESSONS § 4: "Vertikal spiegeln kippt die eingebackene Schattierung —
  // Krater werden zu Kuppeln." With the key from the upper left, a bowl carries
  // its shadow on the inner UPPER-LEFT wall and its lit crescent on the inner
  // LOWER-RIGHT; a dome is the other way round, and the two are indistinguishable
  // to every other number in this script. So it is measured directly: the
  // centroid of the darkened part minus the centroid of the brightened part,
  // projected onto the light axis (-1,-1)/sqrt(2) in NORMALISED coordinates, so
  // the 2:1 squash is undone before the angle is taken.
  //
  // ── THREE ATTEMPTS. The first two are here because each was a real confound ──
  //
  // 1. GLOBAL DARK/LIGHT CENTROIDS. Failed on three of four returns that the
  //    field visualisation shows are textbook bowls. The arcs occupy maybe a
  //    fifth of the area; the rest is plain carrying a residual bias of a couple
  //    of percent, and 60 % of the area at |u| ~ 0.03 outweighs 20 % at
  //    |u| ~ 0.5. The centroid went wherever the residual leaned.
  //
  // 2. CENTROIDS OVER |u| > 0.35 x peak, INSIDE THE RIM (r <= 0.50). Better, and
  //    still wrong, for a reason that is geometry rather than noise: a crater
  //    with a raised rim has FOUR arcs, not two —
  //        outer up-left rim slope   BRIGHT  (faces the sun)
  //        inner up-left wall        DARK
  //        inner down-right wall     BRIGHT
  //        outer down-right slope    DARK
  //    so a bright arc sits immediately outside a dark one on the up-left, and a
  //    centroid over the whole feature averages them to nothing (variant 0
  //    measured its shadow centroid at 0.04,-0.01: dead centre). Restricting to
  //    r <= 0.50 fixed variant 0 and broke variant 1, whose bowl is deep enough
  //    that the entire inner disc is shadowed and the lit wall sits at r ~ 0.6.
  //    No FIXED radius band can serve craters of different size and depth.
  //
  // 3. What actually holds: a PER-RING DIPOLE. On a ring at radius r, project u
  //    onto the light axis s = (nx + ny)/sqrt2 (positive toward the lower right,
  //    normalised so the 2:1 squash is undone):
  //        dip(r) = sum(u * s) / sum(s^2)
  //    A bowl's inner wall is dark up-left and pale down-right, so its dip is
  //    POSITIVE; a dome's is negative; and the rim ring has the opposite sign to
  //    the wall ring, which is precisely the cancellation attempts 1 and 2 fell
  //    into. Taking the ring where |dip| is LARGEST picks the wall ring by
  //    construction, at whatever radius that crater happens to put it, and the
  //    rim is then a separate ring that does not dilute it.
  //
  // All three attempts measured something real. Only the third answers the
  // question asked — LESSONS § 5, one more time.
  const NB = 24;
  const dip = ringDipole(uS, w, h, cx, cy, Rx, Ry, NB);
  const shadeDot = dip.peak;
  const shadeRing = dip.peakR;
  const dipProfile = dip.profile;
  if (!(shadeDot > 0.02))
    throw new Error(
      `${FAMILY}_${i}: shading reads as a DOME, not a bowl (peak light-axis dipole ` +
        `${shadeDot.toFixed(3)} at r ${shadeRing.toFixed(2)}, must be > +0.02). With the key ` +
        `from the upper left a bowl's inner wall is dark up-left and pale down-right. ` +
        `Regenerate with a new seed`,
    );

  // ── step 5: encode the gain as (alpha, colour) ──
  const rgba = Buffer.alloc(n * 4);
  let aMax = 0, aSum = 0, aN = 0, gMin = 9, gMax = 0;
  for (let p = 0; p < n; p++) {
    const inWin = win[p] > 0;
    let up = clamp(g * uC[p], -0.60, posCap);
    let d, a;
    if (up < -1e-4) {
      d = LD;
      a = -up / (1 - LD / GREF);
    } else if (up > 1e-4) {
      d = LL;
      a = up / (LL / GREF - 1);
    } else {
      d = GREF;
      a = 0;
    }
    a = clamp(a, 0, A_MAX);
    let a8 = Math.round(a * 255);
    if (inWin && a8 < A_FLOOR) { a8 = A_FLOOR; if (d === GREF) d = GREF; }
    if (!inWin) { a8 = 0; d = GREF; } // RGB under alpha 0 is still filled with the
    // no-op grey, so any libwebp RGB bleed out of
    // the transparent margin is a no-op too
    rgba[p * 4] = d; rgba[p * 4 + 1] = d; rgba[p * 4 + 2] = d; rgba[p * 4 + 3] = a8;
    if (a8 > 0) {
      const af = a8 / 255;
      const gain = 1 - af + (d / GREF) * af;
      if (gain < gMin) gMin = gain;
      if (gain > gMax) gMax = gain;
      if (af > aMax) aMax = af;
      aSum += af; aN++;
    }
  }

  // ── step 5b: tight crop on alpha, then the exact 2:1 convention ──
  const preFull = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const bb = await L.alphaBBox(preFull);
  const cropped = await sharp(preFull)
    .extract({ left: bb.minX, top: bb.minY, width: bb.maxX - bb.minX + 1, height: bb.maxY - bb.minY + 1 })
    .png()
    .toBuffer();
  fs.mkdirSync(DIR_CAND, { recursive: true });
  fs.writeFileSync(path.join(L.DIR_CROP, `${FAMILY}_${i}${tag ? `_${tag}` : ""}_cropped.png`), cropped);
  const cropAspect = (bb.maxX - bb.minX + 1) / (bb.maxY - bb.minY + 1);

  const final = await sharp(cropped).resize(TARGET_W, TARGET_H, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(finalPath(i, tag), final);

  console.log(
    `    ${preFlat ? 'ground: pre-flattened at plate scale,' : `ground plane: ${rejectedPct.toFixed(1)}% of the annulus rejected,`} ` +
      `photo ramp ${(100 * ramp).toFixed(1)}% | soften r${softR} | rim bias ${bias.toFixed(4)} | ` +
      `bowl test +${shadeDot.toFixed(3)} at r ${shadeRing.toFixed(2)}`,
  );
  console.log(
    `    light-axis dipole by radius: ` +
      dipProfile.map((d, b) => `${(0.06 + ((b + 0.5) / NB) * 0.92).toFixed(2)}:${d >= 0 ? '+' : ''}${d.toFixed(2)}`).join(' '),
  );
  console.log(
    `    rung u ${rung.u} <- combined p1 ${uDeep.toFixed(3)} (arc ${arcDeep.toFixed(3)}) ` +
      `x gain ${g.toFixed(2)} | dish at centre ${dishAtCentre.toFixed(3)} | posCap +${posCap.toFixed(3)} | ` +
      `alpha max ${(100 * aMax).toFixed(1)}% mean ${(100 * aSum / Math.max(1, aN)).toFixed(1)}% | ` +
      `gain@GREF ${gMin.toFixed(3)}..${gMax.toFixed(3)} | crop aspect ${cropAspect.toFixed(3)}`,
  );
  return { cropAspect };
}

// ══════════════════════════════════════
// Ground census + step 6 validation
// ══════════════════════════════════════

async function groundStats(biome) {
  let sr = 0, sg = 0, sb = 0, sl = 0, sl2 = 0, n = 0;
  for (let i = 0; i < 4; i++) {
    const p = path.join(L.DIR_TILES, biome, `${biome}_${i}.webp`);
    if (!fs.existsSync(p)) continue;
    const { data } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let k = 0; k < data.length; k += 4) {
      if (data[k + 3] < 250) continue;
      const r = data[k], gg = data[k + 1], b = data[k + 2];
      sr += r; sg += gg; sb += b;
      const l = L709(r, gg, b);
      sl += l; sl2 += l * l; n++;
    }
  }
  if (!n) return null;
  const mean = sl / n;
  const rm = sr / n, gm = sg / n, bm = sb / n;
  // the same three channels after the renderer's airless darkening
  const rv = vac(rm, 0), gv = vac(gm, 1), bv = vac(bm, 2);
  return {
    biome,
    mean,
    sd: Math.sqrt(sl2 / n - mean * mean),
    br: bm / rm,
    gr: gm / rm,
    r: rm, g: gm, b: bm,
    vacLum: L709(rv, gv, bv),
    vr: rv, vg: gv, vb: bv,
    // The B/R actually on screen. Not the tile's own: rgb(5,10,25) is blue, so
    // the airless darkening raises every ground's B/R before a prop is drawn.
    vacBR: bv / rv,
  };
}

async function grounds() {
  console.log('\nGround census — BARREN + ASTEROIDS, all four slots per biome, opaque pixels only.');
  console.log('vacLum = after the renderer airless darkening (0.45 toward rgb(5,10,25)).\n');
  console.log('biome              meanL   vacLum     sd    B/R    G/R');
  const all = [];
  for (const b of GROUNDS) {
    const s = await groundStats(b);
    if (!s) { console.log(`${b.padEnd(18)} MISSING`); continue; }
    all.push(s);
    console.log(
      `${b.padEnd(18)}${s.mean.toFixed(1).padStart(6)}${s.vacLum.toFixed(1).padStart(9)}` +
        `${s.sd.toFixed(1).padStart(7)}${s.br.toFixed(3).padStart(7)}${s.gr.toFixed(3).padStart(7)}`,
    );
  }
  const geo = Math.exp(all.reduce((a, s) => a + Math.log(s.vacLum), 0) / all.length);
  const ari = all.reduce((a, s) => a + s.vacLum, 0) / all.length;
  console.log(
    `\ngeometric mean vacLum ${geo.toFixed(1)}  (arithmetic ${ari.toFixed(1)})  ` +
      `-> GREF in this script is ${GREF}`,
  );
  console.log(
    `B/R spread ${Math.min(...all.map((s) => s.br)).toFixed(3)}..${Math.max(...all.map((s) => s.br)).toFixed(3)}, ` +
      `mean ${(all.reduce((a, s) => a + s.br, 0) / all.length).toFixed(3)}`,
  );
  return all;
}

const srgbToLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
function labOf(r, g, b) {
  const R = srgbToLin(r), G = srgbToLin(g), B = srgbToLin(b);
  let X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  let Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  let Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  X = f(X); Y = f(Y); Z = f(Z);
  return { Ls: 116 * Y - 16, a: 500 * (X - Y), bb: 200 * (Y - Z) };
}

/**
 * Chroma of a sprite, alpha-weighted, on the file given. Called twice per
 * variant — once on the final PNG (the buffer, where the answer is trivially
 * perfect by construction) and once on the WRITTEN webp, which is the only one
 * that is evidence (LESSONS § 1: libwebp lossy is always YUV 4:2:0).
 */
async function chromaOf(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let wsum = 0, sr = 0, sg = 0, sb = 0, cSum = 0, cMax = 0;
  for (let k = 0; k < data.length; k += 4) {
    const a = data[k + 3];
    if (a < 8) continue; // below this the pixel contributes under 3 % of any gain
    const wt = a / 255;
    const r = data[k], g = data[k + 1], b = data[k + 2];
    wsum += wt; sr += wt * r; sg += wt * g; sb += wt * b;
    const lab = labOf(r, g, b);
    const c = Math.hypot(lab.a, lab.bb);
    cSum += wt * c;
    if (c > cMax) cMax = c;
  }
  const br = sb / sr, gr = sg / sr;
  return {
    br, gr,
    violet: gr - (1 + br) / 2, // LESSONS § 5 violet-axis distance
    chromaMean: cSum / wsum,
    chromaMax: cMax,
    n: info.width * info.height,
  };
}

/**
 * What the decal does to a ground: the gain it lands and the hue it induces.
 * Reproduces the renderer chain exactly, INCLUDING the prop tint pass:
 *   G1 = vac(G)                                  ground pass + terrain darken
 *   C  = G1*(1-a) + Dc*a                         drawImage of the decal
 *   C1 = C*(1 - t*a) + T*(t*a)                   blitPropTint, alpha = imgA * t
 * The third line double-darkens the ground SHOW-THROUGH on airless bodies (the
 * tint follows the sprite's alpha, not its opaque silhouette), which makes the
 * decal a little stronger than the un-darkened design predicts. Every
 * BARREN/ASTEROIDS body is airless, so that is the real condition and it is
 * reported, not corrected — the renderer is not this script's to change.
 */
/**
 * ── THE BASELINE IS THE VACUUM-DARKENED GROUND, AND GETTING THAT WRONG COST A
 * ROUND. Attempt 1 compared the decal's B/R against the ground's OWN B/R, i.e.
 * against the tile before the renderer touched it, and reported induced shifts
 * of +0.10..+0.49 on a sprite that is achromatic to three decimals. Almost all
 * of it was the airless darkening itself: rgb(5,10,25) is BLUE, so `crater`
 * (own B/R 1.000) is already at 1.291 on screen before any prop is drawn. The
 * decal was being blamed for the renderer's own tint.
 *
 * Two shifts are reported instead, because they have different owners:
 *   dBR_dec  — decal only, baseline = the vacuum-darkened ground. This is the
 *              number the neutrality rule is about; it is ours to answer for.
 *   dBR_tot  — including the blitPropTint pass, which tints at imgAlpha x t and
 *              therefore adds blue over the decal's footprint no matter what
 *              colour the decal is. Renderer behaviour, reported not corrected.
 */
async function groundEffect(i, s, tag = '') {
  const { data } = await sharp(finalPath(i, tag)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const T = VAC_RGB;
  const t = VAC_A;
  const G1 = [s.vr, s.vg, s.vb];
  const refL = L709(G1[0], G1[1], G1[2]);
  const refBR = G1[2] / G1[0];
  let n = 0, sumG = 0, minG = 9;
  let sr = 0, sb = 0, dr = 0, db = 0;
  let lift = 0, liftN = 0;
  for (let k = 0; k < data.length; k += 4) {
    const a8 = data[k + 3];
    if (a8 === 0) continue;
    const a = a8 / 255;
    const dec = [0, 0, 0];
    const tot = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      dec[c] = G1[c] * (1 - a) + data[k + c] * a; // drawImage only
      tot[c] = dec[c] * (1 - t * a) + T[c] * (t * a); // + blitPropTint
    }
    const l = L709(tot[0], tot[1], tot[2]);
    const gain = l / refL;
    sumG += gain; n++;
    if (gain < minG) minG = gain;
    if (gain > 1) { lift += gain - 1; liftN++; }
    sr += tot[0]; sb += tot[2];
    dr += dec[0]; db += dec[2];
  }
  // ── VISIBILITY, not contrast ──
  // A gain of -37 % is loud on a smooth ground and invisible on a rough one, and
  // the grounds here run from sd 9.4 (dust_plain) to 43.7 (boulder_field). So the
  // number that answers "does it read on this ground" is the decal's deepest
  // contrast measured in units of the GROUND'S OWN texture sd — both taken after
  // the airless darkening, which scales them by the same 0.55 and therefore
  // leaves the ratio invariant (LESSONS § 5: the vacuum leaves d' unchanged).
  const sigma = ((1 - minG) * refL) / Math.max(1e-6, s.sd * (1 - t));
  return {
    biome: s.biome,
    minGain: minG,
    sigma,
    meanGain: sumG / n,
    rimLiftPct: liftN ? (100 * lift) / liftN : 0,
    rimAreaPct: (100 * liftN) / n,
    refBR,
    dBRdec: db / dr - refBR,
    dBRtot: sb / sr - refBR,
  };
}

async function validate(indices) {
  const gs = [];
  for (const b of GROUNDS) { const s = await groundStats(b); if (s) gs.push(s); }
  const rows = [];
  console.log('\n── geometry + neutrality ──');
  console.log(
    'variant           dims  aspect tight  alphaMax  ' +
      'PNG B/R  G/R   Cab   |  WEBP B/R  G/R  violet  Cab  CabMax',
  );
  for (const i of indices) {
    const f = finalPath(i);
    if (!fs.existsSync(f)) { console.log(`${FAMILY}_${i} MISSING`); continue; }
    const meta = await sharp(f).metadata();
    const bb = await L.alphaBBox(f);
    const tight = bb.minX === 0 && bb.minY === 0 && bb.maxX === meta.width - 1 && bb.maxY === meta.height - 1;
    const cPng = await chromaOf(f);
    // LESSONS § 1 — measure the WRITTEN file, not the buffer.
    const wp = path.join(L.DIR_CROP, `${FAMILY}_${i}_measure.webp`);
    await sharp(f).webp(L.WEBP).toFile(wp);
    const cWebp = await chromaOf(wp);
    const { data } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let aMax = 0;
    for (let k = 3; k < data.length; k += 4) if (data[k] > aMax) aMax = data[k];

    const problems = [];
    if (meta.width !== TARGET_W || meta.height !== TARGET_H)
      problems.push(`dims ${meta.width}x${meta.height} != ${TARGET_W}x${TARGET_H}`);
    if (!tight) problems.push('not tight-cropped');
    if (Math.abs(cWebp.br - 1) > 0.06 || Math.abs(cWebp.gr - 1) > 0.06)
      problems.push(`written chroma B/R ${cWebp.br.toFixed(3)} G/R ${cWebp.gr.toFixed(3)} outside 1.00 +-0.06`);
    if (cWebp.chromaMean > 3.0) problems.push(`mean Lab chroma ${cWebp.chromaMean.toFixed(2)} > 3.0`);
    if (aMax / 255 > A_MAX + 0.01) problems.push(`alphaMax ${(aMax / 255).toFixed(3)} over the ${A_MAX} ceiling`);

    console.log(
      `${FAMILY}_${i}  ${String(meta.width)}x${String(meta.height)}  ` +
        `${(meta.width / meta.height).toFixed(3)}  ${tight ? 'yes' : 'NO '}   ` +
        `${((100 * aMax) / 255).toFixed(1)}%    ` +
        `${cPng.br.toFixed(3)} ${cPng.gr.toFixed(3)} ${cPng.chromaMean.toFixed(2)}  |  ` +
        `${cWebp.br.toFixed(3)} ${cWebp.gr.toFixed(3)} ${cWebp.violet.toFixed(3).padStart(6)} ` +
        `${cWebp.chromaMean.toFixed(2)} ${cWebp.chromaMax.toFixed(1)}` +
        (problems.length ? `\n            FAIL: ${problems.join('; ')}` : ''),
    );
    const eff = [];
    for (const s of gs) eff.push(await groundEffect(i, s));
    rows.push({ i, cPng, cWebp, aMax: aMax / 255, tight, meta, problems, eff });
  }

  console.log('\n── the strength ladder, on every ground (renderer chain incl. airless darkening) ──');
  console.log('minGain = deepest point / bare ground. rim = mean lift where the decal brightens.');
  console.log('sigma = deepest contrast / the GROUND\'S OWN texture sd — the visibility number.');
  let head = 'biome            groundSd';
  for (const r of rows) head += `   v${r.i} minG rim% sigma`;
  console.log(head);
  for (let k = 0; k < GROUNDS.length; k++) {
    let line = GROUNDS[k].padEnd(17) + gs[k].sd.toFixed(1).padStart(6);
    for (const r of rows) {
      const e = r.eff[k];
      if (!e) { line += '        --    --    --'; continue; }
      line += `   ${e.minGain.toFixed(3)} ${e.rimLiftPct.toFixed(1).padStart(4)} ${e.sigma.toFixed(2).padStart(5)}`;
    }
    console.log(line);
  }

  console.log('\n── induced hue shift: does the decal collide on any ground? ──');
  console.log('baseline = the VACUUM-DARKENED ground (what is on screen before the prop).');
  console.log('dec = decal only (ours). tot = incl. blitPropTint, which tints blue at imgA*t.');
  let h2 = 'biome            screenB/R';
  for (const r of rows) h2 += `   v${r.i} dec    tot`;
  console.log(h2);
  let worstDec = 0, worstTot = 0;
  for (let k = 0; k < GROUNDS.length; k++) {
    let line = GROUNDS[k].padEnd(17) + gs[k].vacBR.toFixed(3).padStart(9);
    for (const r of rows) {
      const e = r.eff[k];
      line += `  ${(e.dBRdec >= 0 ? '+' : '') + e.dBRdec.toFixed(3)} ${(e.dBRtot >= 0 ? '+' : '') + e.dBRtot.toFixed(3)}`;
      if (Math.abs(e.dBRdec) > Math.abs(worstDec)) worstDec = e.dBRdec;
      if (Math.abs(e.dBRtot) > Math.abs(worstTot)) worstTot = e.dBRtot;
    }
    console.log(line);
  }
  console.log(
    `\nworst over all ${rows.length * GROUNDS.length} variant x ground pairs: ` +
      `decal ${worstDec.toFixed(3)}, incl. prop tint ${worstTot.toFixed(3)}`,
  );

  const bad = rows.filter((r) => r.problems.length);
  console.log(`\n${bad.length === 0 ? 'PASS' : 'FAIL'}  ${rows.length - bad.length}/${rows.length} variants clean`);
  return { rows, gs };
}
/**
 * Mean opaque colour of a biome's four tiles after darkening — the panel
 * background.
 *
 * LESSONS § 3: "die Raute ist gefiedert (~1024 Teilpixel). Über dunklem Grund
 * zeichnet dadurch jede Kachelgrenze eine dunkle Linie in die Platte — der
 * Feldhintergrund muss das Eigenmittel der Kachel sein, nicht BGA." The first
 * cut of these panels used a transparent canvas and drew a WHITE grid of seams
 * over an almost-black `crater` field — an artefact that does not exist in the
 * game, on the panel that is supposed to answer whether the game reads right.
 */
const bgCache = new Map();
async function panelBg(biome, t) {
  const key = `${biome}|${t}`;
  if (bgCache.has(key)) return bgCache.get(key);
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let s = 0; s < 4; s++) {
    const p = path.join(L.DIR_TILES, biome, `${biome}_${s}.webp`);
    if (!fs.existsSync(p)) continue;
    const { data } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let k = 0; k < data.length; k += 4) {
      if (data[k + 3] < 250) continue;
      sr += data[k]; sg += data[k + 1]; sb += data[k + 2]; n++;
    }
  }
  const mean = n ? [sr / n, sg / n, sb / n] : [40, 40, 40];
  const out = mean.map((c, i) => Math.round(c * (1 - t) + VAC_RGB[i] * t));
  bgCache.set(key, out);
  return out;
}

// ══════════════════════════════════════
// Review sheets — rendered in DEVICE pixels
// ══════════════════════════════════════
//
// ── THE FIRST CONTACT SHEET WAS UNJUDGEABLE, AND THE ASSETS WERE NOT THE
//    REASON. This is the most useful thing this round produced.
//
// Rudi: "es ist alles extrem pixelig. die grafiken sehen aus wie in 128x128
// generiert und hochskaliert. ich kann da leider kaum etwas erkennen."
//
// Every panel was composed at the tile's CSS size (48 x 24) and then blown up
// with NEAREST NEIGHBOUR — 4x, 6x, 8x. That is backwards from what the device
// does, and it is wrong twice over:
//
//   1. IT THROWS THE RESOLUTION AWAY FIRST. PlanetSurface sizes its cache
//      canvas as `Math.round(cacheW * dpr)` and then does
//      `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` followed by
//      `ctx.scale(cam.zoom, cam.zoom)`. So one tile covers
//          TW * zoom * dpr   device pixels
//      = 144 at dpr 3, zoom 1. Composing at 48 and scaling up shows a THIRD of
//      the linear information the player actually gets.
//   2. IT ADDS A BLOCK STRUCTURE THAT EXISTS NOWHERE. Nearest neighbour turns
//      each of those 48 px into a hard 4x4 (or 8x8) square. The device
//      resamples the 400 px sprite DOWN, which is smooth. The panels showed an
//      artefact of the panel generator and hid the asset underneath it.
//
// A pleasant consequence of checking: the mip ladder is chosen from `zoom`
// alone (`computeMipLevel`), not from zoom x dpr, and at dpr 3 that lands very
// close to 1:1 at every step — zoom 1 picks @quarter (100x50) and draws it at
// ~104 device px; zoom 2 picks @half (200x100) at ~208; zoom 0.5 picks @eighth
// (50x25) at ~52. So a dpr-3 preview is both honest AND near the sprite's own
// resolution, which is why it can be shown at 1:1 and still be big enough.
//
// Everything below renders at DEVICE size from the mip the renderer would pick,
// with sharp's default (smooth) resampling, and is displayed at that size. No
// nearest neighbour anywhere. Three views are kept side by side:
//   - the SOURCE at 400x200, native, so the art can be judged with no scaling
//     in the way at all
//   - the DEVICE preview (dpr 3), which is what the player sees
//   - a 1:1 CSS panel, unmagnified, as the honest record of how small it is
const SHEET_DIR = path.join(L.ROOT, 'assets', 'style-test', 'tiles');
const PFX = '_crater_decal';

const TW = L.TW, TH = L.TH, PBH = L.PROP_BASE_HEIGHT;
/** Rudi's test device. Verified against the renderer's transform, not assumed. */
const DPR = 3;

/** spriteCache.computeMipLevel, reproduced. Driven by zoom alone, not by dpr. */
function mipForZoom(zoom) {
  if (zoom > 2.0) return null; // 'full'
  if (zoom > 1.0) return '@half';
  if (zoom > 0.5) return '@quarter';
  return '@eighth';
}

/**
 * Everything a panel needs for one (zoom, dpr) pair, in DEVICE pixels.
 * `sc` is the total scale the renderer applies: dpr x zoom.
 */
function view(zoom, dpr = DPR) {
  const sc = zoom * dpr;
  const tw = Math.max(1, Math.round(TW * sc));
  const th = Math.max(1, Math.round(TH * sc));
  return {
    zoom, dpr, sc, tw, th,
    mip: mipForZoom(zoom),
    label: `zoom ${zoom}, dpr ${dpr} — Kachel ${tw}x${th} Geraetepixel, Mip ${mipForZoom(zoom) || 'full'}`,
  };
}

/** Draw size of variant i in DEVICE pixels. Aspect is exactly 2 by construction. */
function drawSize(i, sc) {
  const dh = Math.max(1, Math.round(PBH * HEIGHT_FACTORS[i] * sc));
  return { dw: Math.max(1, Math.round(dh * 2)), dh };
}

/** A darkened tile at a device size, from the mip the renderer would use. */
async function tileRaw(biome, slot, w, h, t, mip) {
  const mipPath = path.join(L.DIR_TILES, biome, `${biome}_${slot}${mip || ''}.webp`);
  const full = path.join(L.DIR_TILES, biome, `${biome}_${slot}.webp`);
  const src = fs.existsSync(mipPath) ? mipPath : full;
  const { data } = await sharp(src).ensureAlpha().resize(w, h, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let k = 0; k < out.length; k += 4)
    for (let c = 0; c < 3; c++) out[k + c] = Math.round(out[k + c] * (1 - t) + VAC_RGB[c] * t);
  return { data: out, w, h };
}

/**
 * Decal raw RGBA at a device draw size.
 *
 * For the SHIPPED set (`tag` '') it reads the mip the renderer would actually
 * use, so the panel is a faithful preview. A CANDIDATE has no mips yet, so it
 * is read from its 400 px png and resized in one step — which is what
 * `integrate` would produce anyway (both are a single `fit: 'fill'` resize of
 * the same source), so the comparison is not flattered.
 */
async function decalRaw(i, drawW, drawH, mip, tag = '') {
  const mipPath = path.join(L.SRC_PROPS, FAMILY, `${FAMILY}_${i}${mip || ''}.webp`);
  const src = !tag && fs.existsSync(mipPath) ? mipPath : finalPath(i, tag);
  const { data } = await sharp(src).ensureAlpha().resize(drawW, drawH, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  return data;
}

function makeCanvas(W, H, bg) {
  const c = Buffer.alloc(W * H * 3);
  for (let p = 0; p < W * H; p++) { c[p * 3] = bg[0]; c[p * 3 + 1] = bg[1]; c[p * 3 + 2] = bg[2]; }
  return c;
}
function blit(canvas, W, H, buf, bw, bh, x0, y0) {
  for (let y = 0; y < bh; y++) {
    const yy = y0 + y;
    if (yy < 0 || yy >= H) continue;
    for (let x = 0; x < bw; x++) {
      const xx = x0 + x;
      if (xx < 0 || xx >= W) continue;
      const s = (y * bw + x) * 4;
      const a = buf[s + 3] / 255;
      if (a === 0) continue;
      const d = (yy * W + xx) * 3;
      for (let c = 0; c < 3; c++) canvas[d + c] = Math.round(canvas[d + c] * (1 - a) + buf[s + c] * a);
    }
  }
}
/**
 * Blit a PROP: drawImage followed by the renderer's blitPropTint pass, which
 * tints at imgAlpha x t. Without the second term a panel would show the decal
 * ~1.5x weaker than the renderer draws it on an airless body.
 */
function blitProp(canvas, W, H, buf, bw, bh, x0, y0, t) {
  for (let y = 0; y < bh; y++) {
    const yy = y0 + y;
    if (yy < 0 || yy >= H) continue;
    for (let x = 0; x < bw; x++) {
      const xx = x0 + x;
      if (xx < 0 || xx >= W) continue;
      const s = (y * bw + x) * 4;
      const a = buf[s + 3] / 255;
      if (a === 0) continue;
      const d = (yy * W + xx) * 3;
      for (let c = 0; c < 3; c++) {
        const C = canvas[d + c] * (1 - a) + buf[s + c] * a;
        canvas[d + c] = clamp(Math.round(C * (1 - t * a) + VAC_RGB[c] * (t * a)), 0, 255);
      }
    }
  }
}

const toPng = (canvas, W, H) =>
  sharp(canvas, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();

/**
 * THE SOURCE VIEW: the gain field over a flat GREF grey, at its native
 * 400x200. No scaling of any kind between the file and the pixels shown, so
 * this is the one panel where the art itself is on trial. A flat ground is the
 * honest backdrop for a gain field — over a texture there is no telling the
 * decal's own structure from the ground's.
 */
async function sourcePanel(i, tag = '') {
  const { data, info } = await sharp(finalPath(i, tag)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const canvas = makeCanvas(W, H, [GREF, GREF, GREF]);
  blit(canvas, W, H, data, W, H, 0, 0);
  return toPng(canvas, W, H);
}

/** The alpha channel alone — the actual payload, and where softness shows. */
async function alphaPanel(i, tag = '') {
  const { data, info } = await sharp(finalPath(i, tag)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const out = Buffer.alloc(W * H * 3);
  // stretched to this sprite's own maximum, so the shape is legible at every
  // rung instead of the weak rungs coming back near-black
  let mx = 1;
  for (let k = 3; k < data.length; k += 4) if (data[k] > mx) mx = data[k];
  for (let p = 0; p < W * H; p++) {
    const v = Math.round((data[p * 4 + 3] / mx) * 255);
    out[p * 3] = v; out[p * 3 + 1] = v; out[p * 3 + 2] = v;
  }
  return sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}

/** One decal on one ground, one tile, at device size. */
async function onePanel(i, biome, v, t, tag = '') {
  const { dw, dh } = drawSize(i, v.sc);
  const g = await tileRaw(biome, i % 4, v.tw, v.th, t, v.mip);
  const canvas = makeCanvas(v.tw, v.th, await panelBg(biome, t));
  blit(canvas, v.tw, v.th, g.data, v.tw, v.th, 0, 0);
  const dec = await decalRaw(i, dw, dh, v.mip, tag);
  blitProp(canvas, v.tw, v.th, dec, dw, dh, Math.round((v.tw - dw) / 2), Math.round((v.th - dh) / 2), t);
  return toPng(canvas, v.tw, v.th);
}

/** The decisive panel: every variant x every ground, at device size. */
async function matrixPanel(v, groundList, t) {
  const pad = Math.max(2, Math.round((4 * v.sc) / 3));
  const CW = v.tw + pad * 2, CH = v.th + pad * 2;
  const W = (N + 1) * CW, H = groundList.length * CH;
  const canvas = makeCanvas(W, H, [26, 28, 32]);
  for (let r = 0; r < groundList.length; r++) {
    const biome = groundList[r];
    blit(canvas, W, H, (await tileRaw(biome, 0, v.tw, v.th, t, v.mip)).data, v.tw, v.th, pad, r * CH + pad);
    for (let i = 0; i < N; i++) {
      const { dw, dh } = drawSize(i, v.sc);
      const g = await tileRaw(biome, (i + 1) % 4, v.tw, v.th, t, v.mip);
      const x0 = (i + 1) * CW + pad, y0 = r * CH + pad;
      blit(canvas, W, H, g.data, v.tw, v.th, x0, y0);
      const dec = await decalRaw(i, dw, dh, v.mip);
      blitProp(canvas, W, H, dec, dw, dh, x0 + Math.round((v.tw - dw) / 2), y0 + Math.round((v.th - dh) / 2), t);
    }
  }
  return toPng(canvas, W, H);
}

/**
 * A tiled iso field with scattered decals, at device size. Reproduces
 * propLayout's sub-tile jitter band and the flat-decal anchor
 * (PROP_GROUND_INSET 1.0 = the tile CENTRE, not the south vertex).
 */
async function fieldPanel(biome, variants, count, coverage, R, C, seed, v, t, tag = '') {
  const W = Math.round((R + C) * (v.tw / 2) + v.tw);
  const H = Math.round((R + C) * (v.th / 2) + v.th + 8);
  const canvas = makeCanvas(W, H, await panelBg(biome, t));
  let rnd = seed;
  const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const tiles = [];
  for (let s = 0; s < 4; s++) tiles.push(await tileRaw(biome, s, v.tw, v.th, t, v.mip));
  const decs = {};
  for (const i of variants) {
    const { dw, dh } = drawSize(i, v.sc);
    decs[i] = { buf: await decalRaw(i, dw, dh, v.mip, tag), dw, dh };
  }
  const at = (r, c) => ({
    sx: Math.round((c - r) * (v.tw / 2) + W / 2 - v.tw / 2),
    sy: Math.round((c + r) * (v.th / 2) + 4),
  });
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const { sx, sy } = at(r, c);
      blit(canvas, W, H, tiles[(r * C + c + ((r * 7 + c * 3) % 4)) % 4].data, v.tw, v.th, sx, sy);
    }
  const items = [];
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const { sx, sy } = at(r, c);
      if (rand() > coverage) continue;
      for (let k = 0; k < count; k++) {
        const i = variants[Math.floor(rand() * variants.length)];
        const dx = (rand() - 0.5) * 0.7, dy = (rand() - 0.5) * 0.7;
        const d = decs[i];
        items.push({
          d,
          x: Math.round(sx + v.tw / 2 + dx * (v.tw / 2) - d.dw / 2),
          y: Math.round(sy + v.th / 2 + dy * (v.th / 2) - d.dh / 2),
          o: sy + dy * (v.th / 2),
        });
      }
    }
  items.sort((a, b) => a.o - b.o);
  for (const it of items) blitProp(canvas, W, H, it.d.buf, it.d.dw, it.d.dh, it.x, it.y, t);
  return toPng(canvas, W, H);
}

async function sheet() {
  fs.mkdirSync(SHEET_DIR, { recursive: true });
  // Clear the previous run's panels, so the nearest-neighbour set from the
  // first attempt cannot linger in the directory beside the new one.
  let removed = 0;
  for (const f of fs.readdirSync(SHEET_DIR))
    if (f.startsWith(`${PFX}-`) && f.endsWith('.png')) { fs.unlinkSync(path.join(SHEET_DIR, f)); removed++; }
  if (removed) console.log(`[sheet] removed ${removed} panels from the previous run`);

  const wrote = [];
  const w = async (name, buf) => {
    fs.writeFileSync(path.join(SHEET_DIR, `${PFX}-${name}.png`), buf);
    wrote.push(name);
  };

  // `vac` is the REAL condition — every BARREN/ASTEROIDS body is airless, so
  // the renderer always applies the 0.45 fill toward rgb(5,10,25) at z >= 0.
  // `lit` is the same scene without it, as a magnifier only.
  const V = [['vac', VAC_A], ['lit', 0]];
  const NEAR = view(1); // the build view: tile 144x72 device px, @quarter
  const FAR = view(0.5); // zoomed out: tile 72x36, @eighth
  const IN = view(2); // zoomed in: tile 288x144, @half
  const CSS = view(1, 1); // true CSS size, unmagnified: tile 48x24

  // 1 — the SOURCE, native 400x200, no scaling at all
  for (let i = 0; i < N; i++) {
    if (!fs.existsSync(finalPath(i))) continue;
    await w(`src-${i}`, await sourcePanel(i));
    await w(`src-alpha-${i}`, await alphaPanel(i));
  }

  // 2 — one tile per variant per ground, at two zoom levels
  for (const [tag, t] of V)
    for (let i = 0; i < N; i++) {
      if (!fs.existsSync(finalPath(i))) continue;
      for (const b of ['regolith', 'crater', 'silicate_plain'])
        await w(`one-${i}-${b}-${tag}`, await onePanel(i, b, NEAR, t));
      await w(`one-in-${i}-crater-${tag}`, await onePanel(i, 'crater', IN, t));
    }

  // 2b — THE SHARPENING COMPARISON: the rejected version, the recalculated one,
  // and the newly generated one, for the two identity rungs.
  const CMP = ['IST', 'A', 'B'];
  for (const i of [2, 3])
    for (const c of CMP) {
      if (!fs.existsSync(finalPath(i, c))) continue;
      await w(`cmp-src-${i}-${c}`, await sourcePanel(i, c));
      await w(`cmp-alpha-${i}-${c}`, await alphaPanel(i, c));
      for (const [tag, t] of V) {
        await w(`cmp-one-${i}-${c}-${tag}`, await onePanel(i, 'regolith', NEAR, t, c));
        await w(`cmp-in-${i}-${c}-${tag}`, await onePanel(i, 'crater', IN, t, c));
      }
    }
  // and the identity field, per candidate, on the biome that has to carry it
  for (const c of CMP) {
    if (!fs.existsSync(finalPath(3, c))) continue;
    for (const [tag, t] of V)
      await w(`cmp-field-${c}-${tag}`, await fieldPanel('crater', [2, 3], 2, 1.0, 6, 6, 4242, NEAR, t, c));
  }

  // 3 — the matrix
  for (const [tag, t] of V) {
    await w(`matrix-key-${tag}`, await matrixPanel(NEAR, KEY_GROUNDS, t));
    await w(`matrix-all-${tag}`, await matrixPanel(NEAR, GROUNDS, t));
  }
  await w('matrix-all-far-vac', await matrixPanel(FAR, GROUNDS, VAC_A));
  await w('matrix-all-css-vac', await matrixPanel(CSS, GROUNDS, VAC_A));

  // 4 — the strength span: one tiled field per variant, same ground + density
  for (let i = 0; i < N; i++) {
    if (!fs.existsSync(finalPath(i))) continue;
    for (const [tag, t] of V)
      await w(`span-${i}-${tag}`, await fieldPanel('regolith', [i], 1, 1.0, 5, 5, 5150 + i, NEAR, t));
  }

  // 5 — the pattern breaker on the quiet grounds
  for (const b of ['regolith', 'silicate_plain', 'dust_basin', 'metallic_surface', 'rocky_outcrop']) {
    for (const [tag, t] of V) await w(`breaker-${b}-${tag}`, await fieldPanel(b, [0, 1], 1, 0.5, 6, 6, 9001, NEAR, t));
    await w(`breaker-${b}-css-vac`, await fieldPanel(b, [0, 1], 1, 0.5, 6, 6, 9001, CSS, VAC_A));
  }
  for (const [tag, t] of V) await w(`bare-regolith-${tag}`, await fieldPanel('regolith', [0], 0, 0, 6, 6, 1, NEAR, t));

  // 6 — the identity question
  for (const b of ['crater', 'impact_crater']) {
    for (const [tag, t] of V) {
      await w(`bare-${b}-${tag}`, await fieldPanel(b, [0], 0, 0, 6, 6, 1, NEAR, t));
      await w(`identity-${b}-lo-${tag}`, await fieldPanel(b, [2, 3], 1, 0.7, 6, 6, 4242, NEAR, t));
      await w(`identity-${b}-hi-${tag}`, await fieldPanel(b, [2, 3], 2, 1.0, 6, 6, 4242, NEAR, t));
      await w(`identity-${b}-mixed-${tag}`, await fieldPanel(b, [1, 2, 3, 3], 2, 0.9, 6, 6, 4242, NEAR, t));
    }
    await w(`identity-${b}-hi-css-vac`, await fieldPanel(b, [2, 3], 2, 1.0, 6, 6, 4242, CSS, VAC_A));
    await w(`identity-${b}-hi-far-vac`, await fieldPanel(b, [2, 3], 2, 1.0, 6, 6, 4242, FAR, VAC_A));
  }

  console.log(`[sheet] ${wrote.length} panels at device resolution, no nearest-neighbour upscaling`);
  const { rows, gs } = await validate(Array.from({ length: N }, (_, i) => i));
  await writeHtml(rows, gs, { NEAR, FAR, IN, CSS });
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function writeHtml(rows, gs, views) {
  const img = (n, cls = '') => `<img class="${cls}" src="${PFX}-${n}.png" alt="${n}">`;
  const has = (n) => fs.existsSync(path.join(SHEET_DIR, `${PFX}-${n}.png`));

  const ladderTable = () => {
    let h = '<table><thead><tr><th rowspan="2">ground</th><th rowspan="2">mean L</th>' +
      '<th rowspan="2">nach Vakuum</th><th rowspan="2">eigene sd</th>';
    for (const r of rows) h += `<th colspan="3">v${r.i}</th>`;
    h += '</tr><tr>';
    for (const r of rows) h += '<th>min gain</th><th>Saum</th><th>&sigma;</th>';
    h += '</tr></thead><tbody>';
    for (let k = 0; k < gs.length; k++) {
      const idBiome = gs[k].biome === 'crater' || gs[k].biome === 'impact_crater';
      h += `<tr class="${idBiome ? 'ident' : ''}"><td>${esc(gs[k].biome)}${idBiome ? ' <span class="tag">Identität</span>' : ''}</td>` +
        `<td class="n">${gs[k].mean.toFixed(1)}</td><td class="n">${gs[k].vacLum.toFixed(1)}</td>` +
        `<td class="n">${gs[k].sd.toFixed(1)}</td>`;
      for (const r of rows) {
        const e = r.eff[k];
        const pctDown = (100 * (1 - e.minGain)).toFixed(0);
        h += `<td class="n">${e.minGain.toFixed(3)} <span class="sub">&minus;${pctDown}%</span></td>` +
          `<td class="n">${e.rimLiftPct.toFixed(1)}%</td>` +
          `<td class="n ${e.sigma < 0.7 ? 'warn' : e.sigma > 1.2 ? 'ok' : ''}">${e.sigma.toFixed(2)}</td>`;
      }
      h += '</tr>';
    }
    return h + '</tbody></table>';
  };

  const chromaTable = () => {
    let h =
      '<table><thead><tr><th>variant</th><th>dims</th><th>aspect</th><th>tight</th><th>alpha max</th>' +
      '<th>B/R (png)</th><th>B/R (webp)</th><th>G/R (webp)</th><th>violet axis</th>' +
      '<th>Lab C mean</th><th>Lab C max</th><th>verdict</th></tr></thead><tbody>';
    for (const r of rows) {
      const ok = Math.abs(r.cWebp.br - 1) <= 0.06 && Math.abs(r.cWebp.gr - 1) <= 0.06 && r.cWebp.chromaMean <= 3;
      h +=
        `<tr><td>crater_decal_${r.i}</td><td class="n">${r.meta.width}&times;${r.meta.height}</td>` +
        `<td class="n">${(r.meta.width / r.meta.height).toFixed(3)}</td><td class="n">${r.tight ? 'yes' : 'NO'}</td>` +
        `<td class="n">${(100 * r.aMax).toFixed(1)}%</td>` +
        `<td class="n">${r.cPng.br.toFixed(3)}</td><td class="n">${r.cWebp.br.toFixed(3)}</td>` +
        `<td class="n">${r.cWebp.gr.toFixed(3)}</td><td class="n">${r.cWebp.violet.toFixed(3)}</td>` +
        `<td class="n">${r.cWebp.chromaMean.toFixed(2)}</td><td class="n">${r.cWebp.chromaMax.toFixed(1)}</td>` +
        `<td class="${ok ? 'ok' : 'bad'}">${ok ? 'neutral' : 'off band'}</td></tr>`;
    }
    return h + '</tbody></table>';
  };

  const hueTable = () => {
    let h =
      '<table><thead><tr><th rowspan="2">ground</th><th rowspan="2">B/R der Kachel</th>' +
      '<th rowspan="2">B/R auf dem Schirm<br><span class="sub">nach Vakuum-Tint</span></th>';
    for (const r of rows) h += `<th colspan="2">v${r.i}</th>`;
    h += '</tr><tr>';
    for (const r of rows) h += '<th>&Delta; Aufleger</th><th>&Delta; inkl. Prop-Tint</th>';
    h += '</tr></thead><tbody>';
    for (let k = 0; k < gs.length; k++) {
      h += `<tr><td>${esc(gs[k].biome)}</td><td class="n">${gs[k].br.toFixed(3)}</td>` +
        `<td class="n">${gs[k].vacBR.toFixed(3)}</td>`;
      for (const r of rows) {
        const d = r.eff[k].dBRdec;
        const dt = r.eff[k].dBRtot;
        h += `<td class="n ${Math.abs(d) > 0.06 ? 'warn' : 'ok'}">${d >= 0 ? '+' : ''}${d.toFixed(3)}</td>` +
          `<td class="n sub">${dt >= 0 ? '+' : ''}${dt.toFixed(3)}</td>`;
      }
      h += '</tr>';
    }
    return h + '</tbody></table>';
  };



  const rungRow = (i) => {
    const dev = drawSize(i, views.NEAR.sc);
    const css = drawSize(i, 1);
    return (
      `<tr><td>crater_decal_${i}</td><td class="n">${RUNGS[i].u}</td>` +
      `<td class="n">+${(POS_CAP_FRAC * -RUNGS[i].u).toFixed(3)}</td>` +
      `<td class="n">${RUNGS[i].soft}</td>` +
      `<td class="n">${HEIGHT_FACTORS[i]}</td>` +
      `<td class="n">${css.dw}&times;${css.dh}</td>` +
      `<td class="n">${dev.dw}&times;${dev.dh}</td>` +
      `<td class="n">${((100 * css.dw) / TW).toFixed(0)}%</td>` +
      `<td>${['kaum sichtbar &mdash; Musterbrecher', 'mild &mdash; Musterbrecher', 'deutlich &mdash; Identität', 'ausgeprägt &mdash; Identität'][i]}</td></tr>`
    );
  };

  const html = `<!doctype html>
<meta charset="utf-8">
<title>crater_decal — Kontaktbogen</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 28px 32px 90px; background: #16171a; color: #dfe2e6;
         font: 14px/1.55 -apple-system, "Segoe UI", Roboto, sans-serif; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: .2px; }
  h2 { font-size: 17px; margin: 46px 0 6px; padding-bottom: 6px; border-bottom: 1px solid #2c2f34; }
  h3 { font-size: 13.5px; margin: 24px 0 4px; color: #9fb4c8; font-weight: 600;
       text-transform: uppercase; letter-spacing: .5px; }
  p, li { max-width: 78ch; color: #c2c8cf; }
  .lede { color: #9aa3ad; margin: 0 0 18px; }
  code { background: #22242a; padding: 1px 5px; border-radius: 3px; font-size: 12.5px; }
  .note { border-left: 3px solid #4a6f8f; background: #1b2027; padding: 10px 14px; margin: 14px 0;
          border-radius: 0 4px 4px 0; }
  .warnbox { border-left-color: #8f7a3a; background: #241f16; }
  .badbox { border-left-color: #8f4a3a; background: #241a16; }
  /* NO image-rendering: pixelated anywhere. Every panel is already at device
     resolution; letting the browser resample it would only re-introduce the
     artefact this sheet exists to remove. */
  img { display: block; background: #0e0f11; border-radius: 3px; max-width: 100%; height: auto; }
  .row { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; margin: 10px 0 4px; }
  .cell { background: #1c1e22; padding: 9px; border-radius: 5px; border: 1px solid #2a2d33; }
  .cell figcaption { font-size: 11.5px; color: #8b939c; margin-top: 7px; text-align: center;
                     max-width: 34ch; }
  table { border-collapse: collapse; margin: 12px 0 6px; font-size: 12.5px; }
  th, td { border: 1px solid #2e3238; padding: 5px 9px; text-align: left; }
  th { background: #22252b; color: #a8b2bc; font-weight: 600; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  .sub { color: #79828c; font-size: 11px; }
  .ok { color: #7fc08a; } .bad, .warn { color: #d98a72; }
  tr.ident { background: #1f2530; }
  .tag { background: #2f4a63; color: #cfe2f2; font-size: 10.5px; padding: 1px 5px;
         border-radius: 3px; vertical-align: 1px; }
  .tag.real { background: #3d5c3f; color: #d6ecd8; }
  .scroll { overflow-x: auto; max-width: 100%; }
</style>

<h1>crater_decal — 4 Varianten, Kontaktbogen</h1>
<p class="lede">Flache Aufleger für BARREN + ASTEROIDS · <code>PROP_GROUND_INSET 1.0</code> ·
Stand ${new Date().toISOString().slice(0, 10)} · nichts in <code>propThemes.ts</code> verdrahtet</p>

<div class="badbox note">
<b>Korrektur gegen die erste Fassung dieses Bogens.</b> Die erste Fassung war unbeurteilbar,
und die Assets waren nicht der Grund. Alle Tafeln waren in <b>CSS-Größe</b> (48&times;24 pro
Kachel) gerechnet und dann mit <b>Nearest Neighbour</b> vergrößert (4&times;, 6&times;, 8&times;).
Das ist genau umgekehrt zum Gerät: <code>PlanetSurface</code> setzt
<code>canvas.width = cacheW &times; dpr</code> und dann
<code>ctx.setTransform(dpr,0,0,dpr,0,0)</code> plus <code>ctx.scale(zoom,zoom)</code> — eine
Kachel bedeckt also <code>TW &times; zoom &times; dpr</code> Gerätepixel, bei dpr&nbsp;3 also
<b>144</b>, nicht 48. Die alten Tafeln zeigten ein <b>Drittel</b> der Information und legten
eine Klotzstruktur darüber, die es nirgends gibt.
<br><br>
Diese Fassung rechnet alles in <b>Gerätepixeln bei dpr&nbsp;3</b>, aus der Mip, die der
Renderer bei dem Zoom wirklich zieht, mit weicher Interpolation — und stellt es in dieser
Größe dar. <b>Keine Nearest-Neighbour-Vergrößerung mehr, nirgends.</b> Angenehmer Nebenbefund:
<code>computeMipLevel</code> wählt die Mip allein aus dem <code>zoom</code>, nicht aus
zoom&nbsp;&times;&nbsp;dpr — bei dpr&nbsp;3 landet jede Stufe damit fast 1:1
(zoom&nbsp;1 &rarr; <code>@quarter</code> 100&times;50, gezeichnet auf ~104 Gerätepixel).
</div>

<div class="note">
<b>Was hier zu beurteilen ist.</b> Die Familie hat zwei Aufgaben und deckt sie über eine
<b>Stärkespanne</b> ab statt über vier gleich starke Varianten: <b>v0/v1</b> sind Musterbrecher
für die zehn ruhigen Gründe, <b>v2/v3</b> das Erkennungsmerkmal für <code>crater</code> und
<code>impact_crater</code> — die beiden Kacheln tragen selbst keinen Krater. Alle vier sind alt,
weichgespült und eingesunken; „stärker" heißt größer, tiefer, mehr Auswurf — <b>nicht</b>
härtere Kanten.
</div>

<div class="note warnbox">
<b>Zwei Zustände auf jeder Tafel.</b> <span class="tag real">Vakuum</span> ist der
<b>echte</b> Zustand: BARREN und ASTEROIDS sind ausnahmslos luftlos, der Renderer legt bei
z&nbsp;&ge;&nbsp;0 immer <code>rgba(5,10,25,0.45)</code> über den Bodendurchgang. Die Simulation
hier ist zeichenweise identisch mit <code>lib-tile-metrics.vacuum()</code>, gegen die der
gesamte 55-Biome-Korpus gemessen ist. <span class="tag">ohne Vakuum</span> ist dieselbe Szene
ohne diesen Durchgang — <b>nur eine Lupe</b>, kein Spielzustand. Beurteilt wird die
Vakuum-Tafel.
<br><br>
<b>Befund über die Kachel, nicht über die Aufleger:</b> <code>crater</code> hat ein Mittel von
L&nbsp;52.4 (L*&nbsp;21.9) und landet im Vakuum bei <b>L&nbsp;33.3 (L*&nbsp;12.9)</b>.
<code>void_edge</code> bei L*&nbsp;6.7. Auf diesen Kacheln ist der Spielraum für
<i>irgendeinen</i> Aufleger sehr klein — das ist ein eigenes Thema und gehört nicht in diese
Abnahme.
</div>

<h2>1 &nbsp;Die Quelle, 400&times;200, ohne jede Skalierung</h2>
<p>Der Aufleger allein ist kein Bild, sondern ein <b>Verstärkungsfeld</b> — er hat ohne Grund
keine eigene Farbe. Hier liegt er über einem flachen Grau auf dem Referenzpegel
GREF&nbsp;=&nbsp;${GREF}, in Originalgröße: zwischen Datei und Pixel steht nichts. Das ist die
Tafel, auf der die <b>Kunstqualität</b> zur Debatte steht, unabhängig von jeder Skalierung.</p>
<div class="row">
${[0, 1, 2, 3].map((i) => (has(`src-${i}`) ? `<figure class="cell">${img(`src-${i}`)}<figcaption>crater_decal_${i} — Quelle 400&times;200 über flachem Grau ${GREF}</figcaption></figure>` : '')).join('\n')}
</div>
<h3>Der Alphakanal allein</h3>
<p class="lede">Alpha <i>ist</i> die Nutzlast dieser Familie (der Grauwert ist fast konstant).
Je Variante auf ihr eigenes Maximum gestreckt, damit die Form auch beim schwächsten Rung
sichtbar bleibt — die Streckung macht die Rungs untereinander <b>nicht</b> vergleichbar, dafür
ist die Tabelle in § 2 da.</p>
<div class="row">
${[0, 1, 2, 3].map((i) => (has(`src-alpha-${i}`) ? `<figure class="cell">${img(`src-alpha-${i}`)}<figcaption>v${i} Alpha, auf eigenes Maximum gestreckt (${((100 * rows[i]?.aMax) || 0).toFixed(1)} %)</figcaption></figure>` : '')).join('\n')}
</div>

<h2>2 &nbsp;Die Stärkespanne</h2>
<div class="scroll"><table><thead><tr><th>Variante</th><th>Rung <code>u</code></th>
<th>Saum-Deckel</th><th>Verwitterung <span class="sub">Tiefpass, Anteil von R</span></th>
<th>Höhenfaktor <span class="sub">Vorschlag</span></th><th>CSS-px</th>
<th>Gerätepixel <span class="sub">dpr 3, zoom 1</span></th>
<th>Anteil Kachelbreite</th><th>Aufgabe</th></tr></thead><tbody>
${[0, 1, 2, 3].map(rungRow).join('\n')}
</tbody></table></div>
<p><code>u</code> ist der <b>Zielwert</b> des tiefsten Punktes als Gain gegen den Grund:
<code>u = &minus;0.297</code> heißt, der Kraterboden kommt bei 70 % des Grundes heraus, auf dem
er liegt. Getroffen wird er über eine gemessene Verstärkung gegen das p1 des Verhältnisfeldes
der Aufnahme — nicht über den Prompt.</p>

<h3>Eine Kachel je Variante, Gerätepixel (${views.NEAR.label})</h3>
${[0, 1, 2, 3]
  .map((i) =>
    has(`one-${i}-regolith-vac`)
      ? `<div class="row">
  <figure class="cell">${img(`one-${i}-regolith-vac`)}<figcaption>v${i} · regolith · <b>Vakuum</b></figcaption></figure>
  <figure class="cell">${img(`one-${i}-crater-vac`)}<figcaption>v${i} · crater · <b>Vakuum</b></figcaption></figure>
  <figure class="cell">${img(`one-${i}-silicate_plain-vac`)}<figcaption>v${i} · silicate_plain · <b>Vakuum</b></figcaption></figure>
  <figure class="cell">${img(`one-in-${i}-crater-vac`)}<figcaption>v${i} · crater · ${views.IN.label} · <b>Vakuum</b></figcaption></figure>
</div>
<div class="row">
  <figure class="cell">${img(`one-${i}-regolith-lit`)}<figcaption>v${i} · regolith · ohne Vakuum</figcaption></figure>
  <figure class="cell">${img(`one-${i}-crater-lit`)}<figcaption>v${i} · crater · ohne Vakuum</figcaption></figure>
  <figure class="cell">${img(`one-${i}-silicate_plain-lit`)}<figcaption>v${i} · silicate_plain · ohne Vakuum</figcaption></figure>
  <figure class="cell">${img(`one-in-${i}-crater-lit`)}<figcaption>v${i} · crater · ${views.IN.label} · ohne Vakuum</figcaption></figure>
</div>`
      : '',
  )
  .join('\n')}

<h3>Gekachelte Fläche, eine je Variante — dieselbe Dichte, derselbe Grund</h3>
<div class="row">
${[0, 1, 2, 3].map((i) => (has(`span-${i}-vac`) ? `<figure class="cell">${img(`span-${i}-vac`)}<figcaption>nur v${i}, regolith, <b>Vakuum</b></figcaption></figure>` : '')).join('\n')}
</div>
<div class="row">
${[0, 1, 2, 3].map((i) => (has(`span-${i}-lit`) ? `<figure class="cell">${img(`span-${i}-lit`)}<figcaption>nur v${i}, ohne Vakuum</figcaption></figure>` : '')).join('\n')}
</div>

<h2 id="cmp">3 &nbsp;Die Nachschärfung: zwei Wege gegenübergestellt</h2>
<div class="note">
<b>IST</b> = die von Rudi als „grauer Fleck" abgelehnte Fassung.
<b>A</b> = dieselbe Aufnahme, neu gerechnet: Verwitterungs-Tiefpass halbiert
(v2 0.075&rarr;0.045, v3 0.05&rarr;0.025), Mulde 0.40&rarr;0.28, äußerer Randschatten ab
r&nbsp;0.86 gedämpft.
<b>B</b> = neu über fal.ai generiert: fünf zusätzliche Kraterlandschafts-Platten, ein
Ring-Dipol-Detektor schneidet einzelne Krater heraus, Hintergrund global auf Plattenebene
entfernt.
<br><br>
<b>A ist ausgeliefert</b>, weil B an einer Generator-Grenze scheitert — siehe § 9. v0 und v1
sind unangetastet: dort ist die Weichheit die Absicht.
</div>
${[2, 3]
  .map((i) =>
    has(`cmp-src-${i}-A`)
      ? `<h3>v${i} — Quelle 400&times;200 über flachem Grau</h3>
<div class="row">
${['IST', 'A', 'B'].map((c) => (has(`cmp-src-${i}-${c}`) ? `<figure class="cell">${img(`cmp-src-${i}-${c}`)}<figcaption>${c === 'IST' ? 'IST — abgelehnt' : c === 'A' ? '<b>A — nachgerechnet (ausgeliefert)</b>' : 'B — neu generiert'}</figcaption></figure>` : '')).join('\n')}
</div>
<div class="row">
${['IST', 'A', 'B'].map((c) => (has(`cmp-alpha-${i}-${c}`) ? `<figure class="cell">${img(`cmp-alpha-${i}-${c}`)}<figcaption>${c} — Alphakanal</figcaption></figure>` : '')).join('\n')}
</div>
<h3>v${i} — auf der Kachel (Gerätepixel)</h3>
<div class="row">
${['IST', 'A', 'B'].map((c) => (has(`cmp-one-${i}-${c}-vac`) ? `<figure class="cell">${img(`cmp-one-${i}-${c}-vac`)}<figcaption>${c} · regolith · <b>Vakuum</b></figcaption></figure>` : '')).join('\n')}
${['IST', 'A', 'B'].map((c) => (has(`cmp-one-${i}-${c}-lit`) ? `<figure class="cell">${img(`cmp-one-${i}-${c}-lit`)}<figcaption>${c} · regolith · ohne Vakuum</figcaption></figure>` : '')).join('\n')}
</div>
<div class="row">
${['IST', 'A', 'B'].map((c) => (has(`cmp-in-${i}-${c}-vac`) ? `<figure class="cell">${img(`cmp-in-${i}-${c}-vac`)}<figcaption>${c} · crater · ${views.IN.label} · <b>Vakuum</b></figcaption></figure>` : '')).join('\n')}
${['IST', 'A', 'B'].map((c) => (has(`cmp-in-${i}-${c}-lit`) ? `<figure class="cell">${img(`cmp-in-${i}-${c}-lit`)}<figcaption>${c} · crater · ${views.IN.label} · ohne Vakuum</figcaption></figure>` : '')).join('\n')}
</div>`
      : '',
  )
  .join('\n')}
<h3>Und die Frage, an der es hängt: <code>crater</code> mit v2/v3, Dichte 2</h3>
<div class="row">
${['IST', 'A', 'B'].map((c) => (has(`cmp-field-${c}-vac`) ? `<figure class="cell">${img(`cmp-field-${c}-vac`)}<figcaption>${c} · <b>Vakuum</b></figcaption></figure>` : '')).join('\n')}
</div>
<div class="row">
${['IST', 'A', 'B'].map((c) => (has(`cmp-field-${c}-lit`) ? `<figure class="cell">${img(`cmp-field-${c}-lit`)}<figcaption>${c} · ohne Vakuum</figcaption></figure>` : '')).join('\n')}
</div>

<h2 id="matrix">4 &nbsp;Der entscheidende Test: jede Variante auf jedem Grund</h2>
<p>Spalte 1 ist der <b>nackte Grund</b> als Referenz, dann v0…v3. Alles in Gerätepixeln
(${views.NEAR.label}), inklusive Vakuum-Abdunklung und
<code>blitPropTint</code>-Durchgang.</p>
<h3>Die fünf Gründe aus dem Auftrag</h3>
<div class="row"><figure class="cell">${img('matrix-key-vac')}<figcaption><b>Vakuum</b> — regolith · rocky_outcrop · metallic_surface · dust_basin · silicate_plain</figcaption></figure></div>
<div class="row"><figure class="cell">${img('matrix-key-lit')}<figcaption>dieselben fünf ohne Vakuum</figcaption></figure></div>
<h3>Alle zwölf Gründe</h3>
<div class="scroll"><div class="row"><figure class="cell">${img('matrix-all-vac')}<figcaption><b>Vakuum</b> — ${GROUNDS.join(' · ')}</figcaption></figure></div></div>
<div class="scroll"><div class="row"><figure class="cell">${img('matrix-all-lit')}<figcaption>ohne Vakuum</figcaption></figure></div></div>
<h3>Herausgezoomt: ${views.FAR.label}</h3>
<p class="lede">Bei zoom&nbsp;&le;&nbsp;0.5 zieht der Renderer die <code>@eighth</code>-Mip.
Verschwindet eine Variante hier, verschwindet sie im Spiel.</p>
<div class="scroll"><div class="row"><figure class="cell">${img('matrix-all-far-vac')}<figcaption>@eighth, alle zwölf Gründe, <b>Vakuum</b></figcaption></figure></div></div>
<h3>Und die ehrliche Größe: ${views.CSS.label}</h3>
<p class="lede">Dieselbe Tafel in echter CSS-Größe, unvergrößert. So klein ist das Ganze im
Layout gerechnet — auf einem dpr-3-Gerät stehen dahinter die 144&times;72 Gerätepixel der
Tafeln oben.</p>
<div class="row"><figure class="cell">${img('matrix-all-css-vac')}<figcaption>1:1, CSS-Größe, <b>Vakuum</b></figcaption></figure></div>

<h2>5 &nbsp;Gemessene Chroma — die Neutralitätsregel</h2>
<p>Der Aufleger ist <b>grau erzeugt</b>, nicht grau gegradet: aus der Aufnahme wird nur das
Luminanz-Verhältnis übernommen, ihr Farbton verworfen. In der PNG ist B/R deshalb per
Konstruktion 1.000 — und damit als Beleg wertlos. Maßgeblich ist die <b>geschriebene webp</b>
(LESSONS § 1: libwebp-lossy ist immer YUV 4:2:0 und legt Chroma-Fehler zurück).</p>
<div class="scroll">${chromaTable()}</div>
<h3>Und die Zahl, die die eigentliche Frage beantwortet</h3>
<p>Ob ein Aufleger auf einem Grund „kollidiert", entscheidet nicht seine eigene Chroma, sondern
der <b>induzierte Farbversatz</b>: um wieviel er das B/R des Grundes verschiebt, auf dem er
liegt — gemessen gegen den <b>vakuum-abgedunkelten</b> Grund, denn <code>rgb(5,10,25)</code> ist
blau und hebt jedes B/R schon vor dem Prop.</p>
<div class="scroll">${hueTable()}</div>

<h2>6 &nbsp;Musterbrecher auf den ruhigen Gründen</h2>
<p>v0 und v1, Dichte 1 auf halber Belegung — die Stufe, die ein Grund fahren würde, dessen
Identität nicht am Krater hängt.</p>
${['regolith', 'silicate_plain', 'dust_basin', 'metallic_surface', 'rocky_outcrop']
  .map((b) =>
    has(`breaker-${b}-vac`)
      ? `<h3>${b}</h3><div class="row">
  <figure class="cell">${img(`breaker-${b}-vac`)}<figcaption><b>Vakuum</b>, Gerätepixel</figcaption></figure>
  <figure class="cell">${img(`breaker-${b}-lit`)}<figcaption>ohne Vakuum</figcaption></figure>
  <figure class="cell">${img(`breaker-${b}-css-vac`)}<figcaption>1:1 CSS-Größe, Vakuum</figcaption></figure>
</div>`
      : '',
  )
  .join('\n')}
<h3>Kontrolle</h3>
<div class="row">
<figure class="cell">${img('bare-regolith-vac')}<figcaption>regolith ohne Aufleger, <b>Vakuum</b></figcaption></figure>
<figure class="cell">${img('bare-regolith-lit')}<figcaption>regolith ohne Aufleger, ohne Vakuum</figcaption></figure>
</div>

<h2 id="identity">7 &nbsp;Die Frage, an der der Durchlauf hängt</h2>
<div class="note warnbox">
<code>crater</code> und <code>impact_crater</code> tragen in der Kachel <b>keinen Krater</b> —
<code>crater</code> ist eine abgedunkelte Ableitung von <code>regolith</code>,
<code>impact_crater</code> eine Ableitung davon. Ohne Aufleger ist <code>crater</code> nur
dunkler Regolith. <b>Liest das Biom mit v2/v3 in höherer Dichte als „Krater"?</b>
</div>
${['crater', 'impact_crater']
  .map((b) =>
    has(`identity-${b}-hi-vac`)
      ? `<h3>${b} — Vakuum, der echte Zustand</h3>
<div class="row">
  <figure class="cell">${img(`bare-${b}-vac`)}<figcaption>ohne Aufleger — der Ist-Zustand</figcaption></figure>
  <figure class="cell">${img(`identity-${b}-lo-vac`)}<figcaption>v2/v3, Dichte 1, 70 % Belegung</figcaption></figure>
  <figure class="cell">${img(`identity-${b}-hi-vac`)}<figcaption>v2/v3, Dichte 2, volle Belegung</figcaption></figure>
  <figure class="cell">${img(`identity-${b}-mixed-vac`)}<figcaption>v1/v2/v3 gemischt, v3 doppelt gewichtet</figcaption></figure>
</div>
<h3>${b} — ohne Vakuum, als Lupe</h3>
<div class="row">
  <figure class="cell">${img(`bare-${b}-lit`)}<figcaption>ohne Aufleger</figcaption></figure>
  <figure class="cell">${img(`identity-${b}-lo-lit`)}<figcaption>v2/v3, Dichte 1, 70 %</figcaption></figure>
  <figure class="cell">${img(`identity-${b}-hi-lit`)}<figcaption>v2/v3, Dichte 2, voll</figcaption></figure>
  <figure class="cell">${img(`identity-${b}-mixed-lit`)}<figcaption>v1/v2/v3 gemischt</figcaption></figure>
</div>
<h3>${b} — die anderen Maßstäbe</h3>
<div class="row">
  <figure class="cell">${img(`identity-${b}-hi-far-vac`)}<figcaption>${views.FAR.label}</figcaption></figure>
  <figure class="cell">${img(`identity-${b}-hi-css-vac`)}<figcaption>1:1 CSS-Größe</figcaption></figure>
</div>`
      : '',
  )
  .join('\n')}

<h2>8 &nbsp;Die Stärkeleiter in Zahlen, auf jedem Grund</h2>
<p><b>min gain</b> ist der tiefste Punkt geteilt durch den nackten Grund, gemessen durch die
volle Renderer-Kette. <b>Saum</b> ist die mittlere Aufhellung dort, wo der Aufleger aufhellt —
der Auswurfsaum. Er trägt auf dunklen Gründen und verschwindet auf hellen; das ist mit
<i>einem</i> Sprite unvermeidlich und fällt in die richtige Richtung, weil die beiden
Identitäts-Biome am dunklen Ende liegen.</p>
<p><b>&sigma;</b> ist die Zahl, die über Sichtbarkeit entscheidet: der tiefste Kontrast des
Auflegers in Einheiten der <b>Eigentextur des Grundes</b>. Ein Gain von &minus;37 % ist auf
<code>dust_plain</code> (sd 9.4) laut und auf <code>boulder_field</code> (sd 43.7) fast
unsichtbar — deshalb sagt der Gain allein nichts. Beide Größen nach der Vakuum-Abdunklung
genommen, die sie mit demselben Faktor 0.55 skaliert und das Verhältnis daher unverändert lässt
(LESSONS § 5: „Die Vakuum-Abdunklung lässt d&prime; unverändert"). Unter 0.7 ist der Aufleger
auf diesem Grund kaum zu sehen, über 1.2 klar.</p>
<div class="scroll">${ladderTable()}</div>

<h2>9 &nbsp;Warum B verliert: eine Generator-Grenze, belegt</h2>
<div class="note badbox">
<b>flux liefert bei Aufsicht keinen verwitterten Krater.</b> Über <b>8 Platten</b>, 4
Einzelkrater-Läufe und rund <b>14 verschiedene Formulierungen</b> für Erosion und Flachheit
kam <i>jede</i> Rückgabe als frischer Krater zurück: scharfer heller Wulst, Blockfelder,
eine schmale Schattensichel und ein ausgebrannter Boden.
</div>
<p>Belegt wurde es in drei Stufen, weil die ersten beiden je eine andere Erklärung hätten
zugelassen:</p>
<ol>
<li><b>Erosion als Abwesenheit formuliert</b> („rim worn away flush with the ground") &rarr;
vier Seeds, vier knackige Wülste. Das war mein Fehler und LESSONS § 3 hatte ihn vorhergesagt
(„Keine Negativ-Prompts").</li>
<li><b>Erosion positiv formuliert</b> („a broad low irregular wall of heaped rubble",
„walls subsided into wide low swells whose crests break into separate flattened mounds",
„half buried under dust, floors level with the plain") &rarr; jetzt kam die Größe (R 210–310),
aber die Wülste wurden <i>prominenter</i>, nicht flacher. Überkorrigiert.</li>
<li><b>Das Wort „Krater" ganz vermieden.</b> Ein zweiter Anchor, der nie „crater" oder
„impact" sagt, dazu „three enormous shallow circular hollows … no deeper than gentle saucers
… edges rising into wide banks so low and soft they barely lift above the surrounding plain"
&rarr; zurück kamen <b>tiefe steilwandige Löcher mit pechschwarzem Schatten und
gleißend hellen Innenwänden</b>. Das genaue Gegenteil.</li>
</ol>
<p>Damit ist es keine Prompt-Frage mehr: „Krater von oben" hat im Trainingsmaterial <i>einen</i>
Look, und die Formulierung bewegt ihn nicht. <b>Die Verwitterung muss deshalb aus der
Extraktion kommen</b> — genau der lokale Schritt, den die neue Regel zuerst hinterfragt.
Die Regel ist damit eingehalten und nicht umgangen: der Prompt war der erste Versuch, in
drei Anläufen, und er trägt hier nachweisbar nicht.</p>
<p class="lede">Was aus B trotzdem bleibt und wiederverwendbar ist: der <b>Ring-Dipol-Detektor</b>
(findet Krater in einer Landschaftsplatte, wählt Größe je Rung), der <b>Ring-Wächter</b>
(verwirft einen Wulstbogen, der als Krater durchgegangen wäre — sein Dipol spitzt bei
r&nbsp;0.08 statt bei 0.35–0.58) und die <b>globale Platten-Flachlegung</b>. Und ein
Negativbefund: <code>rimRatio</code> misst die Schattierungs-<i>Asymmetrie</i> des Wulstes,
nicht seine Prominenz — der frische Krater bekam 0.21, der absichtlich degradierte 0.11. Die
Kennzahl gatet nichts.</p>

<h2>10 &nbsp;Warum die Aufnahme senkrecht von oben entsteht</h2>
<p>Der Renderer bemisst einen Prop über die <b>Höhe</b> und nimmt die Breite aus dem
Seitenverhältnis des Sprites; die Kachelraute ist 48&times;24, also 2:1. Ein Aufleger hat keine
Höhe — seine korrekte Iso-Projektion ist die Bodentextur, 2:1 senkrecht gestaucht. Deshalb
entsteht die Aufnahme <b>orthographisch senkrecht von oben</b> und die Stauchung passiert
deterministisch im Script:</p>
<ul>
<li>Seitenverhältnis exakt 2.000 <b>per Konstruktion</b> — keine Aspekt-Lotterie
(<code>lava_puddle</code> Variante 1 kam bei 3.08 zurück und musste neu gewürfelt werden).</li>
<li>Für ein <b>flaches</b> Merkmal <i>ist</i> die gestauchte orthographische Bodentextur die
Iso-Projektion — exakt, nicht angenähert.</li>
<li>Ein verwitterter Krater hat kaum noch senkrechtes Relief, also gibt es keine Randwand,
deren verkürzte Fläche die Stauchung falsch darstellen könnte. „Verwittert und eingesunken"
und die Aufleger-Geometrie stützen sich gegenseitig.</li>
<li>Der Lichtazimut überlebt: oben-links bleibt nach einer senkrechten Stauchung oben-links,
passend zum Oberlicht der Kacheln.</li>
<li>Nebeneffekt, ebenfalls richtig: das Korn wird mit der Form 2:1 gestaucht — genau das, was
eine Iso-Ansicht mit diesem Grund tut.</li>
</ul>
<p>Die Schattierungsrichtung ist hart gegated, weil LESSONS § 4 den Fehlerfall festhält
(„Vertikal spiegeln kippt die eingebackene Schattierung — Krater werden zu Kuppeln"): Licht von
oben-links heißt <b>Schatten an der oberen linken Innenwand</b> und eine schwache helle Sichel
unten rechts. Der Test ist ein <b>ringweises Dipol</b> auf der Lichtachse — zwei einfachere
Fassungen sind gescheitert, weil ein Krater mit Wulstrand <b>vier</b> Bögen hat und globale
Schwerpunkte sie gegeneinander wegkürzen.</p>
`;
  const out = path.join(SHEET_DIR, `${PFX}_sheet.html`);
  fs.writeFileSync(out, html, 'utf8');
  console.log(`\n[sheet] ${out}`);
}

// ══════════════════════════════════════
// integrate
// ══════════════════════════════════════

async function integrate(indices) {
  const { rows } = await validate(indices);
  const bad = rows.filter((r) => r.problems.length);
  if (bad.length) throw new Error(`refusing to integrate: ${bad.map((b) => `${FAMILY}_${b.i}`).join(', ')} failed`);
  const dir = path.join(L.SRC_PROPS, FAMILY);
  fs.mkdirSync(dir, { recursive: true });
  for (const i of indices) {
    const src = finalPath(i);
    if (!fs.existsSync(src)) { console.log(`  SKIP ${FAMILY}_${i}`); continue; }
    // alphaQuality 100 (libwebp's default) keeps the alpha channel LOSSLESS.
    // For this family the alpha IS the payload, so it is stated rather than
    // inherited.
    const opt = { ...L.WEBP, alphaQuality: 100 };
    await sharp(src).webp(opt).toFile(path.join(dir, `${FAMILY}_${i}.webp`));
    for (const mip of L.MIPS)
      await sharp(src)
        .resize(Math.round(TARGET_W * mip.scale), Math.round(TARGET_H * mip.scale), { fit: 'fill' })
        .webp(opt)
        .toFile(path.join(dir, `${FAMILY}_${i}${mip.suffix}.webp`));
    console.log(`  ${FAMILY}/${FAMILY}_${i}.webp  ${TARGET_W}x${TARGET_H} (+3 mips)`);
  }
}

// ══════════════════════════════════════
// main
// ══════════════════════════════════════

/**
 * TRACK B, step 1: generate the landscape plates and cut craters out of them.
 *
 * One plate per prompt variant, all craters detected in each, the best two
 * chosen by dipole strength with the LARGER one going to v3 (the identity rung
 * wants the better-defined basin) and a moderate one to v2. Crops are written
 * as ordinary raws under the `B` tag so `build B` treats them like any other
 * source.
 */
async function genLand(reusePlates) {
  const all = [];
  for (const pl of PLATES) {
    let plate;
    if (reusePlates && fs.existsSync(platePath(pl.tag))) {
      console.log(`\n[plate ${pl.tag}] reused`);
      plate = fs.readFileSync(platePath(pl.tag));
    } else {
      const prompt = `${pl.form} ${pl.anchor || ANCHOR_LAND}`;
      L.assertPromptFits(prompt, `plate ${pl.tag} prompt`);
      console.log(`\n[plate ${pl.tag}] seed ${pl.seed}, canvas ${GEN_LAND.w}x${GEN_LAND.h}, prompt ${prompt.length} chars`);
      plate = await L.genFluxPro(prompt, GEN_LAND, pl.seed);
      fs.writeFileSync(platePath(pl.tag), plate);
    }
    const { data, info } = await sharp(plate).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height, n = w * h;
    const lum = new Float64Array(n);
    for (let p = 0; p < n; p++) lum[p] = L709(data[p * 3], data[p * 3 + 1], data[p * 3 + 2]);
    const { hits, bg } = findCraters(lum, w, h);
    const flat = await flattenPlate(plate, bg, w, h);
    fs.writeFileSync(platePath(`${pl.tag}_flat`), flat);
    // A crater that cannot afford the crop margin is dropped here rather than
    // clamped: clamping would shift it off the crop's centre, and every radius
    // downstream is measured from the frame centre.
    const fits = hits.filter(
      (x) =>
        x.cx - CROP_M * x.R >= 0 && x.cy - CROP_M * x.R >= 0 &&
        x.cx + CROP_M * x.R <= w && x.cy + CROP_M * x.R <= h,
    );
    console.log(
      `    ${hits.length} craters, ${fits.length} with crop margin: ` +
        fits.map((x) => `R${x.R}@${x.cx},${x.cy} resp ${x.resp.toFixed(3)}`).join(' | '),
    );
    // ── the ring guard: is it a crater, or just a rim arc? ──
    // Computed on the FLATTENED field about the candidate's own centre and
    // radius, i.e. exactly the test buildFromRaw will apply later, so a hit that
    // would fail there is dropped here instead of being built and looked at.
    const { data: fd, info: fi } = await sharp(flat).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const uf = new Float64Array(fi.width * fi.height);
    for (let p = 0; p < uf.length; p++)
      uf[p] = clamp(L709(fd[p * 3], fd[p * 3 + 1], fd[p * 3 + 2]) / 128, 0.3, 2.2) - 1;
    for (const hh of fits) {
      const d = ringDipole(uf, fi.width, fi.height, hh.cx, hh.cy, CROP_M * hh.R, CROP_M * hh.R);
      hh.peak = d.peak;
      hh.peakR = d.peakR;
      // ── HOW WEATHERED IS IT? A MEASURABLE, NOT A GUESS ──
      // Beyond the wall ring sits the RIM ring, whose dipole carries the
      // opposite sign (see ringDipole). A fresh crater with a knobbly crest has
      // a strong counter-lobe there; an old crater whose wall has subsided into
      // a low swell has a weak one. So
      //     rimRatio = |most negative dip beyond peakR| / peak
      // is a direct measure of how prominent the rim is — which is exactly the
      // fault to avoid, because the round-1 failure was "too soft" and the
      // first landscape pick overcorrected into "fresh crisp crest".
      let counter = 0;
      for (let b = 0; b < d.profile.length; b++) {
        const r = 0.06 + ((b + 0.5) / d.profile.length) * 0.92;
        if (r <= d.peakR) continue;
        if (d.profile[b] < counter) counter = d.profile[b];
      }
      hh.rimRatio = d.peak > 0 ? -counter / d.peak : 9;
      if (!(d.peak > 0.02) || d.peakR < DIP_PEAK_LO || d.peakR > DIP_PEAK_HI) {
        console.log(`      drop R${hh.R}@${hh.cx},${hh.cy}: dipole peak ${d.peak.toFixed(2)} at r ${d.peakR.toFixed(2)} — rim arc, not a bowl`);
        continue;
      }
      all.push({ ...hh, flat, pl, w, h });
    }
  }
  if (all.length < 2) throw new Error('track B: fewer than two usable craters across all plates — reprompt');

  // ── THE PICK IS BY SIZE FIRST, NOT BY RESPONSE ──
  // Sorting by dipole response alone chose a R170 crater over the R290 and R310
  // basins on the `terrace` plate, because a small crisp crater scores a higher
  // NORMALISED dipole than a big soft one — the response is a per-unit-area
  // measure and says nothing about how many pixels the crater brings. Pixels are
  // precisely what this round is buying back (a R170 crater is a 381 px crop for
  // a 400 px sprite; R290 is 650 px). So: response is a QUALIFIER (is it a bowl
  // at all, and a clear one), size is the RANKING.
  const ok = all.filter((x) => x.resp >= 0.45).sort((a, b) => b.R - a.R || b.resp - a.resp);
  if (!ok.length) throw new Error('track B: no crater cleared the response floor — reprompt');
  console.log(
    '\n  candidates (size-ranked):\n' +
      ok
        .map(
          (x) =>
            `    ${x.pl.tag.padEnd(9)} R${String(x.R).padStart(3)}  resp ${x.resp.toFixed(2)}  ` +
            `dip ${x.peak.toFixed(2)}@r${x.peakR.toFixed(2)}  rimRatio ${x.rimRatio.toFixed(2)}`,
        )
        .join('\n'),
  );
  // ── THE WEATHERING QUALIFIER IS THE PROMPT, NOT A PROXY METRIC ──
  //
  // `rimRatio` above was built to be that qualifier and it does not work. It
  // measures the counter-sign lobe beyond the wall ring, which is the rim's
  // shading ASYMMETRY — and a symmetric bright crest contributes almost nothing
  // to a light-axis dipole. Measured: the fresh knobbly `terrace` R310 scores
  // 0.21 while the deliberately degraded `degraded` R210 scores 0.11 and half
  // the corpus scores 0.00. The number is real and answers a different question
  // than the one asked, which is the shape LESSONS § 5 keeps returning to. It is
  // printed as a diagnostic and gates nothing.
  //
  // The instrument that actually controls weathering is the PROMPT, and which
  // prompt asked for what is known exactly. So the identity rung is picked by
  // SIZE among the plates whose form asked for a subsided, half-buried crater —
  // selecting on the instrument instead of on a proxy for its output.
  const weathered = ok.filter((x) => x.pl.weathered);
  const pickV3 = (weathered.length ? weathered : ok)[0];
  if (!weathered.length) console.log('  NOTE: no crater from a weathered-prompt plate — falling back to the size rank');
  // v2 is the moderate rung: clearly smaller than v3, from a different plate
  // where possible so the two rungs are not one motif at two sizes — but with a
  // FLOOR on size, because the same size-blind sort that missed the R310 basin
  // will happily hand v2 a R90 crater (a 202 px crop for a 400 px sprite, i.e. a
  // 2x upsample) purely because small craters score the highest response.
  const V2_MIN_R = 140;
  const mid = ok
    .filter((x) => x !== pickV3 && x.R >= V2_MIN_R && x.R <= 0.8 * pickV3.R)
    .sort((a, b) => b.resp - a.resp);
  const pickV2 = mid.find((x) => x.pl.tag !== pickV3.pl.tag) || mid[0] || ok[1];
  if (!pickV2) throw new Error('track B: no second crater in the usable size band — reprompt');

  for (const [i, pick] of [[2, pickV2], [3, pickV3]]) {
    const crop = await cropCrater(pick.flat, pick, pick.w, pick.h);
    fs.writeFileSync(rawPath(i, 'B'), crop);
    const m = await sharp(crop).metadata();
    console.log(
      `\n[${FAMILY}_${i}_B] plate "${pick.pl.tag}" crater R${pick.R} at ${pick.cx},${pick.cy}, ` +
        `resp ${pick.resp.toFixed(3)} -> crop ${m.width}x${m.height}`,
    );
  }
}

/** Build the candidate sets. `tag` 'A' reuses the single-crater raws, 'B' the crops. */
async function buildCandidates(tag) {
  fs.mkdirSync(DIR_CAND, { recursive: true });
  for (const i of [2, 3]) {
    const src = tag === 'B' ? rawPath(i, 'B') : rawPath(i);
    if (!fs.existsSync(src)) {
      console.log(`  SKIP ${FAMILY}_${i}_${tag}: no raw at ${path.basename(src)}`);
      continue;
    }
    console.log(`\n[${FAMILY}_${i}_${tag}] from ${path.basename(src)}`);
    await buildFromRaw(i, fs.readFileSync(src), tag,
      tag === 'B' ? { preFlat: true, winFlat: 0.80 } : {});
  }
}

/**
 * Snapshot the CURRENTLY SHIPPED v2/v3 as the `IST` candidate, so the
 * comparison sheet can show the rejected version beside the two new ones
 * without re-deriving it (and without any risk of re-deriving it differently).
 */
function snapshotIst() {
  fs.mkdirSync(DIR_CAND, { recursive: true });
  for (const i of [2, 3]) {
    const dst = finalPath(i, 'IST');
    if (fs.existsSync(dst)) continue;
    if (!fs.existsSync(finalPath(i))) continue;
    fs.copyFileSync(finalPath(i), dst);
    console.log(`  IST snapshot: ${path.basename(dst)}`);
  }
}

/** Promote a chosen candidate set into assets/final, then integrate. */
async function promote(tag) {
  if (!['A', 'B'].includes(tag)) throw new Error(`promote needs A or B, got "${tag}"`);
  snapshotIst();
  for (const i of [2, 3]) {
    const src = finalPath(i, tag);
    if (!fs.existsSync(src)) throw new Error(`no candidate ${path.basename(src)} — run "build ${tag}" first`);
    fs.copyFileSync(src, finalPath(i));
    console.log(`  promoted ${path.basename(src)} -> ${FAMILY}_${i}.png`);
  }
  await integrate([0, 1, 2, 3]);
}

async function genOne(i, seedOverride, reuseRaw) {
  const name = `${FAMILY}_${i}`;
  let raw;
  if (reuseRaw && fs.existsSync(rawPath(i))) {
    console.log(`\n[${name}] raw reused`);
    raw = fs.readFileSync(rawPath(i));
  } else {
    const shape = SHAPES[i];
    const seed = seedOverride ?? shape.seed;
    const prompt = `${shape.form} ${ANCHOR}`;
    L.assertPromptFits(prompt, `${name} prompt`);
    console.log(`\n[${name}] seed ${seed}, canvas ${GEN.w}x${GEN.h} (nadir), prompt ${prompt.length} chars`);
    raw = await L.genFluxPro(prompt, GEN, seed);
    fs.writeFileSync(rawPath(i), raw);
  }
  await buildFromRaw(i, raw);
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0] || 'gen';
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const si = argv.indexOf('--seed');
  const seedOverride = si >= 0 ? parseInt(argv[si + 1], 10) : null;
  const idx = argv.slice(1).filter((a) => /^\d+$/.test(a)).map(Number).filter((n) => n !== seedOverride);
  const indices = idx.length ? idx : Array.from({ length: N }, (_, i) => i);
  L.ensureDirs();

  if (cmd === 'grounds') return void (await grounds());
  if (cmd === 'validate') return void (await validate(indices));
  if (cmd === 'sheet') return void (await sheet());
  if (cmd === 'integrate') return void (await integrate(indices));
  if (cmd === 'genland') {
    if (!L.FAL_API_KEY && !flags.has('--reuse-raw')) throw new Error('No fal key (FAL_AI_API_KEY) in scripts/.env');
    snapshotIst();
    return void (await genLand(flags.has('--reuse-raw')));
  }
  if (cmd === 'build') {
    snapshotIst();
    const tag = argv[1];
    if (tag === 'A' || tag === 'B') return void (await buildCandidates(tag));
    await buildCandidates('A');
    return void (await buildCandidates('B'));
  }
  if (cmd === 'promote') return void (await promote(argv[1]));
  if (cmd !== 'gen') throw new Error(`unknown command "${cmd}"`);

  const reuseRaw = flags.has('--reuse-raw');
  if (!L.FAL_API_KEY && !reuseRaw) throw new Error('No fal key (FAL_AI_API_KEY) in scripts/.env');
  const fails = [];
  for (const i of indices) {
    try {
      await genOne(i, seedOverride, reuseRaw);
    } catch (e) {
      console.error(`    ERROR ${FAMILY}_${i}: ${e.message}`);
      fails.push(`${FAMILY}_${i}: ${e.message}`);
    }
  }
  console.log('\n── summary ──');
  console.log(fails.length ? fails.join('\n') : 'all variants built');
  await validate(indices);
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
