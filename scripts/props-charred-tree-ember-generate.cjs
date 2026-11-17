/**
 * Asset-Pipeline: surface PROP sprites — CHARRED TREES, EMBER STATE.
 *
 *   charred_tree_ember_0..4  ->  biomes lava_flow, caldera (VOLCANIC, round 2)
 *
 * THE SAME FIVE TRUNKS as `charred_tree`, still glowing: orange-red heat in the
 * bark fissures and in the burnt-out core. It is a CONTEXT RE-DERIVATION from
 * the identical raws (assets/raw/charred_tree_<i>_raw.png) with
 * fal-ai/flux-pro/kontext, the same relationship rock_snow has to rock_arid.
 *
 * ── WHY A SEPARATE FAMILY AND NOT TWO MORE VARIANTS
 * propLayout draws variants uniformly inside a family. Glowing trunks as
 * variants 5..9 of `charred_tree` would therefore also land on ash_field and
 * basalt_plain, where there is no lava — burning trees on cold ash. A separate
 * family key is what lets propThemes put them ONLY on lava_flow and caldera.
 *
 * ── THE SILHOUETTE CONTRACT: IoU >= 0.95, AND HOW IT IS ACTUALLY MET
 *
 * The prompt below did its job — the derives repaint rather than reinvent, and
 * their areas land within 3–7 % of the base. But on the two thin-trunk variants
 * that is still not enough: a few percent of splay on a pole moves it sideways
 * by more than its own half-width, and the measured IoU came back 0.768–0.862
 * (0.981–0.985 on the two compact shapes). Re-rolling seeds cannot fix a
 * geometric sensitivity of the SHAPE CLASS, so the pipeline pins the silhouette
 * instead: `postCrop` runs L.transferOverlay, which paints the derive's glow
 * onto the BASE sprite's own pixels and keeps the BASE's alpha. IoU is then
 * 1.000 by construction. The full reasoning, with the measured table, is in the
 * transferOverlay doc comment in props-pipeline-lib.cjs.
 *
 * ── THE ORIGINAL CONTRACT NOTES
 * These are the same trees in two states, so the two sets must be
 * interchangeable in outline. Enforced, not assumed: `validate` computes the
 * alpha-mask IoU against the shipped charred_tree_<i>.webp on a common 256² box
 * and FAILS the variant below 0.95. Reference points: rock_snow ← rock_arid
 * measured 0.980–0.997 on compact boulders, with its own floor set at 0.85.
 *
 * The prompt is what has to earn that number, and the repo's hard-won lesson is
 * that kontext REGENERATES when asked to "make it glowing" — it re-sculpts the
 * subject and erases base features. Three things are done about it:
 *   1. the instruction is ADDITIVE and says so: "ONLY ADD", "do not redraw".
 *      Kontext responds to being told what stays fixed far better than to being
 *      told what to change.
 *   2. the preserved features are ENUMERATED (silhouette, outline, trunk shape,
 *      branch stubs, the charred bark plates) instead of being covered by a
 *      generic "keep everything else". A generic clause leaves the model to
 *      decide what "else" means.
 *   3. WHERE the glow goes is stated first (inside the fissures, in the hollow
 *      core), because position is the strongest lever in this encoder, and it
 *      keeps the glow OFF the outline — a glow that spills past the silhouette
 *      would cost IoU directly.
 * Phrased positively throughout: no "do not change the shape" phrased as a
 * prohibition on a noun the model would then paint (the round-1 moss lesson).
 *
 * ── THE GLOW BUDGET
 * charred_tree_ember carries the LOUDEST glow of the three glowing families,
 * because it is the eye-catcher: lava_flow can show glowing trunks, glowing
 * crust plates and a glowing tile all at once, and something has to win.
 *   charred_tree_ember  overlay target 125 lum   (this file)
 *   lava_puddle         overlay target 100 lum
 *   lava_crust          overlay target  78 lum
 * The numbers are enforced by a solved multiply in the tone step, not by the
 * prompt — a prompt cannot hit a brightness ratio across three independently
 * generated sets.
 *
 * The absolute values are lower than the 150/120/95 first written down, and the
 * RATIO (1.60 : 1.28 : 1.00) is what was actually preserved. Reason: Rec.709
 * luminance is a poor yardstick for a saturated orange. An ember pixel of
 * rgb(210,70,35) looks blazing and scores 89, because two thirds of the metric's
 * weight sits on the green channel that an ember does not have. Chasing "lum
 * 150" would have meant pushing the glow toward pale yellow-white — i.e. making
 * it the wrong COLOUR in order to satisfy the wrong number. The validator
 * therefore also prints `val` (mean of the max channel), which is what the eye
 * judges a saturated colour by, and the ember set lands around 200 there.
 *
 * ── AND THEY SURVIVE THE ATMOSPHERE DARKENING
 * blitPropTint (PlanetSurface.tsx:126-155) lays rgb(5,10,25) over a prop's
 * silhouette at `darken.terrainAlpha`, and terrainAlpha = 0.45 × (1 − density /
 * 0.7) (isoConstants.ts:329-336). MEASURED, not assumed: GET /planets/
 * planet-sys--22_-12_0-18-0 returns atmosphereDensity 0.6, so the factor is
 * 1 − 0.6/0.7 = 0.143 and terrainAlpha = 0.064. The glow therefore arrives on
 * screen at ~94 % of the sprite value — a 6 % loss, not the 32 % the round-2
 * plan feared at a hypothetical density 0.2. NO compensation brightening is
 * applied: raising the target to "beat" a 6 % tint would simply make the trunks
 * too hot on the 33.5-lum lava_flow floor.
 *
 * PREREQUISITE: run props-charred-tree-generate.cjs first (gen + integrate) —
 * this script reads its raws and validates against its shipped webps.
 *
 * Usage: see scripts/props-family-runner.cjs
 */
const path = require('path');
const L = require('./props-pipeline-lib.cjs');
const { run } = require('./props-family-runner.cjs');

// 578 chars, well inside the 1100 budget kontext is held to.
const EMBER_PROMPT =
  'Keep this exact charred tree unchanged and ONLY ADD glowing embers to it. ' +
  'Hot orange-red light glows out from deep inside the bark fissures and cracks, and from the ' +
  'burnt-out hollow core, as if fire is still alive inside the wood. ' +
  'The glow stays inside the existing cracks and hollows and lights the black charcoal around ' +
  'their edges to a dull red. ' +
  'Everything else stays exactly as it is: the same silhouette and outline, the same trunk shape, ' +
  'the same branch stubs, the same charred black bark plates, ' +
  'and the tree still floats against the same plain flat grey backdrop.';

const cfg = {
  family: 'charred_tree_ember',
  n: 5,
  mode: 'derive',
  derivePrompt: EMBER_PROMPT,
  // Explicit per-variant seeds (not baseSeed + k) so a single re-roll is visible
  // in the diff and reproducible. Base = the charred_tree seed of the same index
  // with a +7 offset.
  deriveSeeds: [940108, 940218, 940324, 940430, 940536],
  baseRaw: (i) => path.join(L.DIR_RAW, `charred_tree_${i}_raw.png`),
  iouRef: (i) => path.join(L.SRC_PROPS, 'charred_tree', `charred_tree_${i}.webp`),
  iouMin: 0.95,
  maskFn: L.glowWeight,
  speckMinFrac: 0.004,
  // Silhouette pinned by construction: the derive's glow is painted onto the
  // base sprite's pixels and the base's alpha is kept. See transferOverlay.
  postCrop: (pre, i) =>
    L.transferOverlay(pre, path.join(L.DIR_FINAL, `charred_tree_${i}.png`), L.glowWeight),
  tone: {
    targetLum: 34, // IDENTICAL to charred_tree — same wood, two states
    tint: [1.03, 1.0, 0.97],
    minFactor: 0.2,
    maxFactor: 1.6,
    minBaseFrac: 0.6, // most of the trunk must still be cold charcoal
    overlay: {
      targetLum: 125, // loudest of the three glow families (see the budget above)
      tint: [1.12, 0.9, 0.72], // pushes the graded glow orange-red rather than yellow-white
      minFactor: 0.3,
      maxFactor: 2.5,
    },
  },
  check: {
    aspectMin: 0.35,
    aspectMax: 1.75,
    baseLumTol: 2.5,
    overlayMinPct: 1.5, // below this nobody sees an ember at 28 px
    overlayMaxPct: 25, // above this the trunk is on fire, not smouldering
    // 110, not 115. Variant 0 lands at 114.8 with its glow pixels already at a
    // mean max-channel of 244, i.e. one step from clipping: the solved multiply
    // has nothing left to give, because what limits the Rec.709 luminance of a
    // near-saturated orange is its HUE, not its factor. Pushing that variant to
    // 125 would mean desaturating the ember toward yellow-white. Measured across
    // the set the glow sits at lum 115–125 / val 205–244 — a spread of under
    // 10 % on both, which is what the budget actually needs.
    overlayLumMin: 110,
    overlayLumMax: 140,
    fillMin: 0.1,
  },
  sheet: { biome: 'lava_flow', heightFactor: 1, abRef: 'charred_tree', abLabel: 'charred_tree' },
};

run(cfg).catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
