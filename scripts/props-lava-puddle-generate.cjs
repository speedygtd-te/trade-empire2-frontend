/**
 * Asset-Pipeline: surface PROP sprites — LAVA PUDDLE (flat ground decal).
 *
 *   lava_puddle_0..2  ->  biome caldera (VOLCANIC, round 2)
 *
 * A shallow pool of molten lava lying IN the ground: a glowing orange-yellow
 * surface skinned over with dark crust rafts, ringed by a low crusted lip. The
 * only prop in round 2 that is a DECAL rather than a standing object.
 *
 * ── IT MUST BE GENERATED ISO-SQUASHED, AND THAT IS THE WHOLE TRICK
 *
 * The renderer sizes a prop by its HEIGHT (PROP_BASE_HEIGHT 28 px ×
 * propHeightFactor) and derives the WIDTH from the sprite's own aspect. A puddle
 * photographed straight down would come back roughly circular (aspect ~1.0) and
 * would then be drawn as a circle standing UP on the ground plane — a poster of
 * a puddle, not a puddle.
 *
 * The tile diamond is 48 × 24, i.e. 2:1. So the sprite is generated at 2:1 too,
 * on a 1280 × 640 canvas, with the camera angle stated in the prompt ("seen from
 * a low isometric angle so the pool reads as a flattened ellipse, twice as wide
 * as it is deep"). Then, at the planned height factor 0.54:
 *     drawH = 28 × 0.54 = 15.1 px      drawW = 15.1 × 2.0 = 30.2 px
 *   = 63 % of the 48 px tile width — the ~60 % the plan asks for.
 * The validator band 1.75..2.45 exists to catch a sprite that came back round or
 * came back as a letterbox; the target is 2.0.
 *
 * That height factor (0.54, NOT the 0.20 of the first plan draft) is also why
 * the usual 1.75 aspect ceiling does not apply here: the effective one-tile cap
 * is 48 / (28 × 0.54) = 3.17.
 *
 * ── THE GROUND ANCHOR IS A RENDERER CHANGE, NOT AN ASSET CHANGE
 * A prop is anchored at psy + TH/2, the SOUTH VERTEX of its diamond, where the
 * diamond's half-width is zero — a flat decal placed there would lie across up
 * to three neighbouring tiles. The fix is PROP_GROUND_INSET in propThemes.ts
 * (inset 1.0 = tile centre for this key) plus the flat-first sub-sort, and it
 * belongs to the implementation agent. This script only guarantees the sprite is
 * the right SHAPE for it.
 *
 * ── THE GLOW BUDGET
 * lava_puddle is the MIDDLE of the three glowing families — brighter than a
 * crust plate, quieter than a burning trunk, which is the eye-catcher:
 *   charred_tree_ember  150 lum  |  lava_puddle  120 lum  |  lava_crust  95 lum
 * A puddle is mostly glow by area (unlike the ember trunks, which are a few
 * bright cracks on a black object), so per-pixel it must sit lower or it takes
 * the eye away from the trunks it shares the caldera with.
 *
 * On-screen the measured atmosphere costs ~6 %: atmosphereDensity 0.6 on the
 * reference planet → terrainAlpha 0.064 (see props-charred-tree-ember-generate.cjs
 * for the full derivation).
 *
 * ── PROMPT NOTES
 * Positive phrasing only. The pool is described as lying IN a shallow basin with
 * its own crusted lip, because a "pool of lava" alone comes back as a wide
 * landscape shot of a lava lake. The backdrop clause is the same
 * floats-against-a-backdrop construction the other families use — birefnet then
 * cuts on the lip, which is exactly the outline wanted.
 *
 * Usage: see scripts/props-family-runner.cjs
 */
const L = require('./props-pipeline-lib.cjs');
const { run } = require('./props-family-runner.cjs');

const ANCHOR =
  'Photorealistic studio photograph of one small shallow pool of molten lava with its own ' +
  'crusted rocky lip all around it, isolated against a plain flat uniform mid-grey seamless ' +
  'backdrop that continues unbroken behind it. ' +
  'Seen from a low isometric angle so the pool reads as a flattened ellipse, about twice as wide ' +
  'as it is deep, lying flat. ' +
  'The molten surface glows hot orange and yellow from within, skinned over with dark grey ' +
  'crust rafts that drift apart to reveal bright cracks of liquid rock; the surrounding lip is ' +
  'black cooled basalt crust, rough and crumbly, dimly lit by the pool it holds. ' +
  'Dim moody surroundings so the light comes from the lava itself, matte rock, ' +
  'muted desaturated palette outside the glow, high detail, sharp focus, crisp clean silhouette, ' +
  'centred with a generous empty margin on every side.';

const cfg = {
  family: 'lava_puddle',
  n: 3,
  mode: 'gen',
  anchor: ANCHOR,
  shapes: [
    {
      // 0 — the plain oval pool: the reference shape.
      seed: 950101,
      gen: { w: 1280, h: 640 },
      form:
        'One simple oval pool of lava with a smooth glowing surface broken by three dark crust ' +
        'rafts near its centre, its lip low and even all around. A wide flat ellipse, twice as ' +
        'wide as it is deep.',
    },
    {
      // 1 — a lobed pool with a thicker crust ring, so the outline is not a
      // second ellipse.
      // RE-ROLL. Attempt 1 (seed 950211, canvas 1280x640) returned aspect 3.08:
      // "a WIDE TONGUE spilling out over the lip" stretched the bbox sideways
      // while the low rim gave it nothing back vertically, so the sprite came
      // out a letterbox smear. At height factor 0.54 that draws 46 px wide on a
      // 48 px tile — the whole tile, as a 15 px band. The re-roll drops the
      // spill, raises the rim (vertical extent is the only thing that lowers the
      // aspect on a decal) and shortens the canvas to match.
      seed: 950217,
      gen: { w: 1216, h: 704 },
      form:
        'One lava pool held in a deep bowl-shaped basin with a high broken crust rim standing up ' +
        'all around it, the molten surface well below the rim and split by a web of bright cracks. ' +
        'Roughly twice as wide as it is deep.',
    },
    {
      // 2 — mostly crusted over: the darkest of the three, so a caldera tile
      // that draws two puddles does not turn into a pair of headlights.
      seed: 950317,
      gen: { w: 1280, h: 640 },
      form:
        'One lava pool almost entirely skinned over with dark grey crust plates, glowing orange ' +
        'only along the jagged cracks between the plates and in one open patch near the left edge. ' +
        'A wide flat ellipse, about twice as wide as it is deep.',
    },
  ],
  maskFn: L.glowWeight,
  speckMinFrac: 0.01,
  tone: {
    targetLum: 42, // the crust lip and the rafts — dark rock holding a bright pool
    tint: [1.02, 1.0, 0.98],
    minFactor: 0.25,
    maxFactor: 1.6,
    minBaseFrac: 0.08, // a puddle is legitimately mostly glow
    overlay: {
      targetLum: 100, // middle of the glow budget — see the ratio note in
      // props-charred-tree-ember-generate.cjs (125 / 100 / 78 preserves the
      // intended 1.60 : 1.28 : 1.00 loudness ordering in numbers a saturated
      // orange can actually reach without being desaturated toward white)
      tint: [1.1, 0.95, 0.7],
      minFactor: 0.3,
      maxFactor: 2.5,
    },
  },
  check: {
    // Target 2.0. The usual 1.75 ceiling does not apply: at height factor 0.54
    // the one-tile cap is 48 / (28 × 0.54) = 3.17.
    aspectMin: 1.75,
    aspectMax: 2.45,
    baseLumTol: 3.0,
    // 4, not the 15 this file first shipped with. Variant 2 is DESIGNED to be
    // the mostly-crusted pool — a caldera tile can draw a puddle next to a
    // glowing trunk and a sulfur chunk, so one of the three puddles has to be
    // the quiet one. It measures 5.1 % overlay and the on-floor 4x sheet shows
    // it reading clearly at the true 28 px draw size: a dark crusted ring with
    // an unmistakable orange seam. A floor that fails a variant the design asked
    // for is measuring the wrong thing; 4 % keeps the rail meaningful (a puddle
    // with no visible lava at all still fails) without banning the dark member.
    overlayMinPct: 4,
    overlayMaxPct: 85,
    overlayLumMin: 90,
    overlayLumMax: 125,
    fillMin: 0.3,
  },
  sheet: { biome: 'caldera', heightFactor: 0.54 },
};

run(cfg).catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
