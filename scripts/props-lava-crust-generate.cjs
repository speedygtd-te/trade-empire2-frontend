/**
 * Asset-Pipeline: surface PROP sprites — LAVA CRUST (cooled crust plates).
 *
 *   lava_crust_0..2  ->  biome lava_flow (VOLCANIC, round 2)
 *
 * A slab of chilled flow crust that has buckled and broken off the surface of a
 * lava river: black ropy pahoehoe skin on top, a few dull red-hot cracks still
 * showing along the broken edges where the plate lifted away from the melt.
 *
 * ── A FLAT 3D BODY, NOT A DECAL
 * Unlike lava_puddle this is a real object standing on the ground, just a low
 * one. It keeps the existing bottom-centre anchor (south vertex of the diamond)
 * and needs NO PROP_GROUND_INSET entry — at height factor 0.35 it draws
 * 28 × 0.35 = 9.8 px tall and ~20 px wide, which is a stone-sized object whose
 * anchor and centre are a handful of pixels apart. That is the same regime
 * `driftwood` (factor 0.25) already ships in.
 *
 * The sprite is still generated WIDE (~2:1, 1216 × 640 canvas): a plate is
 * genuinely a wide low thing, and 20 px of width on a 48 px tile is the read
 * that makes it look like it is lying down rather than propped up.
 *
 * ── THE GLOW BUDGET: THIS FAMILY IS THE QUIET ONE
 *   charred_tree_ember  150 lum  |  lava_puddle  120 lum  |  lava_crust  95 lum
 * lava_flow can draw glowing trunks, glowing crust plates AND a glowing tile on
 * the same screen. The crust is the one that has to give way: it is the most
 * numerous of the three there (1/3 of the lava_flow key array) and the least
 * interesting. 95 lum against a 33.5-lum lava_flow floor is still clearly warm
 * and visibly alive — it just does not compete.
 *
 * The overlay coverage band is correspondingly tight (2..18 %): the glow belongs
 * on the RIM AND IN THE CRACKS, never across the top face. A plate glowing all
 * over is a puddle, and lava_puddle already exists.
 *
 * On-screen the measured atmosphere costs ~6 %: atmosphereDensity 0.6 on the
 * reference planet → terrainAlpha 0.064 (derivation in
 * props-charred-tree-ember-generate.cjs).
 *
 * ── PROMPT NOTES
 * Positive phrasing only. "Ropy pahoehoe skin" is named explicitly because
 * "cooled lava" on its own returns either a full landscape or a generic black
 * rock indistinguishable from `lava_rock`, and the ropy texture is the single
 * feature that tells the two families apart at 28 px.
 *
 * Usage: see scripts/props-family-runner.cjs
 */
const L = require('./props-pipeline-lib.cjs');
const { run } = require('./props-family-runner.cjs');

const ANCHOR =
  'Photorealistic studio photograph of one broken slab of cooled volcanic lava crust, ' +
  'floating in mid-air against a plain flat uniform mid-grey seamless backdrop that continues ' +
  'unbroken behind it and below it, seen from a three-quarter angle slightly above. ' +
  'Its top face is black ropy pahoehoe skin, wrinkled into tight parallel coils and folds like ' +
  'cooled treacle, dusted with grey ash; its broken edges are jagged and show a thin porous ' +
  'interior, and a faint dull red heat still glows deep inside a few of the fractures along the ' +
  'rim, lighting only the rock immediately around them. ' +
  'Soft directional light from the upper left, deep shadows on the lower-right side, ' +
  'dim moody lighting, matte, muted desaturated palette, high detail, sharp focus, ' +
  'crisp clean silhouette, centred with a generous empty margin on every side.';

const cfg = {
  family: 'lava_crust',
  n: 3,
  mode: 'gen',
  anchor: ANCHOR,
  // ── ATTEMPT 1 (seeds 960101 / 960211 / 960317) AND WHAT IT TAUGHT ──
  //
  //   0  aspect 4.82   glow 4.6 %      "plate lying tilted, wide low slab"
  //   1  aspect 3.01   glow 0.0 %      "two plates buckled into a low ridge"
  //   2  aspect 2.70   glow 0.7 %      "plate cracked into four pieces"
  //
  // Two independent failures, both instructive.
  //
  // ASPECT. Every variant overshot, 0 by nearly double. "Plate / slab / lying /
  // low" is the flattest archetype in the vocabulary and, exactly as round 1
  // found for the rock slabs, no ratio phrase reins an archetype in — it has to
  // be replaced. Attempt 2 asks for a THICK BLOCK with a visible broken side
  // wall: the same object geologically (a piece of chilled flow crust), but with
  // real thickness, which is the only thing that buys vertical extent. At height
  // factor 0.35 the one-tile cap is 4.9, so 4.82 would technically have drawn —
  // as a 47 x 10 px dark band spanning the whole tile, which is a smear, not a
  // prop. The 2.8 rail is about legibility, not about the renderer.
  //
  // GLOW. Attempt 1 put the heat "deep inside a few of the fractures along the
  // rim" and got what it asked for: on two of three variants the glowing pixels
  // were too few to count (0.0 % and 0.7 %). The glow BUDGET makes lava_crust
  // the quiet family, but quiet means DIM, not absent — and the two levers are
  // independent here, because brightness is set by the tone step's solved
  // multiply (target 78 lum) and has nothing to do with how much area the
  // prompt lights up. So attempt 2 asks for a whole NETWORK of glowing cracks
  // across the top face while the target luminance stays exactly where it was.
  // At the true draw size this matters more than it sounds: at height factor
  // 0.35 the sprite is ~10 px tall, so 1 % of its pixels is a single pixel.
  shapes: [
    {
      // 0 — one thick block, the reference shape.
      seed: 960107,
      gen: { w: 1088, h: 704 },
      form:
        // (Trimmed to fit the 1100-char budget; the first draft ran 1106.)
        'One thick chunky block of lava crust, its ropy top face turned toward the camera and its ' +
        'broken side wall tall enough to show the porous interior, a network of glowing orange ' +
        'cracks across the top. A solid block, about twice as wide as it is tall.',
    },
    {
      // 1 — two blocks buckled against each other: a ridged outline.
      seed: 960217,
      gen: { w: 1088, h: 704 },
      form:
        'Two thick blocks of lava crust shoved up against each other into a ridge, their broken ' +
        'edges meeting high in the middle with bright orange heat glowing out of the seam between ' +
        'them and out of cracks on both top faces. A chunky shape, about twice as wide as it is ' +
        'tall.',
    },
    {
      // 2 — a shattered block with loose fragments: the busiest outline.
      seed: 960323,
      gen: { w: 1152, h: 704 },
      form:
        'One thick block of lava crust cracked into four pieces that have slumped apart, wide ' +
        'glowing orange fissures opening up between them, with three loose angular fragments ' +
        'lying against its near edge. A chunky group, about twice as wide as it is tall.',
    },
  ],
  maskFn: L.glowWeight,
  speckMinFrac: 0.004, // variant 2 has legitimate loose fragments
  tone: {
    targetLum: 40, // black crust, a shade above the charred wood, below rock_ash
    tint: [1.01, 1.0, 0.99],
    minFactor: 0.25,
    maxFactor: 1.5,
    minBaseFrac: 0.7, // a crust plate is mostly cold rock by area
    overlay: {
      targetLum: 78, // quietest of the three glow families — see the ratio note
      // in props-charred-tree-ember-generate.cjs (125 / 100 / 78 keeps the
      // intended loudness ordering in numbers a saturated orange can reach)
      tint: [1.12, 0.88, 0.66],
      minFactor: 0.25,
      maxFactor: 2.0,
    },
  },
  check: {
    // At height factor 0.35 the one-tile cap is 48 / (28 × 0.35) = 4.9, so the
    // band is set by what looks like a plate, not by the renderer.
    aspectMin: 1.6,
    aspectMax: 2.8,
    baseLumTol: 3.0,
    // 2 %, raised from the 1 % of attempt 1: at the 0.35 height factor the
    // sprite is only ~10 px tall, so 1 % of its pixels is literally one pixel of
    // glow. 2 % is the floor at which a crack still reads as a crack.
    overlayMinPct: 2.0,
    overlayMaxPct: 18,
    overlayLumMin: 68,
    overlayLumMax: 90,
    fillMin: 0.25,
  },
  sheet: { biome: 'lava_flow', heightFactor: 0.35 },
};

run(cfg).catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
