/**
 * Asset-Pipeline: surface PROP sprites — BASALT COLUMNS.
 *
 *   basalt_column_0..4  ->  biome basalt_plain (VOLCANIC, round 2)
 *
 * Columnar jointing: the hexagonal prisms a thick basalt flow cracks into as it
 * cools. Some still standing in a tight bundle, some snapped off, some toppled
 * and lying across their own stumps.
 *
 * FIVE variants, the highest count in round 2, because basalt_plain is 50.8 % of
 * the measured surface — the single biome the player looks at most on a VOLCANIC
 * planet. A repeat that would be invisible on obsidian_ridge (1.4 %) is glaring
 * here.
 *
 * ── THE ASPECT SPREAD IS THE POINT
 * The renderer sizes every prop to PROP_BASE_HEIGHT (28 px) and derives the
 * WIDTH from the sprite aspect, so aspect IS the silhouette variable. A set of
 * five columns that all came back at aspect ~1.0 would read as five identical
 * lumps however different their surface detail is. Variants 0/1 are therefore
 * generated on PORTRAIT canvases (upright bundles, aspect < 1: tall and narrow,
 * the classic column look), 3/4 on wide LANDSCAPE canvases (toppled prisms,
 * aspect > 1), and 2 sits in between as a broken stump field. The canvas is what
 * actually enforces it: flux fills the frame, so a square canvas quietly turns
 * every "tall column" back into a boulder (measured repeatedly in round 1).
 *
 * The validator band is therefore DELIBERATELY WIDE (0.40..1.75) and is a
 * safety rail, not a target — it only catches a sprite so extreme it would be
 * drawn 11 px or 49 px wide on a 48 px tile.
 *
 * ── TONE
 * Base target 52 lum, faintly cool tint. The basalt_plain floor measures 55.6
 * lum / R/B 0.721 (cool blue-grey), so the columns sit just BELOW their own
 * ground in value — which is what a shadowed vertical face does — and share its
 * cool cast. Warm-graded stone (the rock_arid vector) reads as sandstone here.
 *
 * ── PROMPT NOTES
 * Positive phrasing only (see props-lava-rock-generate.cjs for why). The word
 * "hexagonal" is stated together with "prism" and "flat facet" because
 * "hexagonal basalt" alone tends to come back as a photograph of the Giant's
 * Causeway — a whole landscape rather than one cut-out object. Naming the object
 * as "a broken-off piece" and the backdrop as continuing behind it keeps the
 * frame on a single prop.
 *
 * Usage: see scripts/props-family-runner.cjs
 */
const { run } = require('./props-family-runner.cjs');

const ANCHOR =
  'Photorealistic studio photograph of one broken-off piece of columnar basalt, ' +
  'floating in mid-air against a plain flat uniform mid-grey seamless backdrop that continues ' +
  'unbroken behind it and below it, seen from a three-quarter angle slightly above. ' +
  'The stone is dark volcanic basalt: very dark cool grey, almost black in the shadows, ' +
  'with the flat straight facets and sharp straight edges of a hexagonal prism, ' +
  'horizontal chisel-like fracture marks across the broken ends, and a rough vesicular ' +
  'pitted surface full of tiny gas holes, weathered and dusty. ' +
  'Soft directional light from the upper left, deep shadows on the lower-right facets, ' +
  'dim moody lighting, matte non-reflective, muted desaturated palette, high detail, ' +
  'sharp focus, crisp clean silhouette, centred with a generous empty margin on every side.';

const cfg = {
  family: 'basalt_column',
  n: 5,
  mode: 'gen',
  anchor: ANCHOR,
  shapes: [
    {
      // 0 — upright bundle, tall and narrow. Portrait canvas, aspect ~0.6-0.8.
      //
      // RE-ROLL. Attempt 1 (seed 920101, canvas 704x1216, "a TIGHT bundle …
      // PRESSED against each other … tall and narrow") returned 84x400, aspect
      // 0.21 — a single needle four blocks high. Two words did it: on a 0.58
      // canvas "tight/pressed" collapses three columns into one shaft, and "tall
      // and narrow" then stretches that shaft to fill the frame. At 28 px height
      // that sprite draws SIX pixels wide, which is why the 0.40 rail exists.
      // The fix is to describe the group as SPLAYED and to widen the canvas —
      // the archetype and the canvas drive width far harder than any ratio
      // phrase does (the round-1 lesson from props-rock-generate.cjs variant 2).
      seed: 920107,
      gen: { w: 896, h: 1088 },
      form:
        // (Trimmed once more: the first re-roll draft ran 1118 chars.)
        'Three short hexagonal basalt columns of unequal height standing side by side in a splayed ' +
        'row, leaning slightly apart with daylight between them, their tops snapped off flat at ' +
        'different levels, rubble heaped at their feet. A broad group, three quarters as wide as ' +
        'it is tall.',
    },
    {
      // 1 — a single leaning column. Same portrait family as 0 but a distinctly
      // different silhouette: one shaft, tilted, with a fractured cap.
      seed: 920211,
      gen: { w: 768, h: 1152 },
      form:
        'One single tall hexagonal basalt column leaning over to the right, its base buried in ' +
        'rubble and its snapped-off top end showing a rough fractured cross-section. ' +
        'Taller than it is wide.',
    },
    {
      // 2 — stump field: the mid-aspect member of the set, the shape a weathered
      // colonnade actually leaves behind.
      seed: 920317,
      gen: { w: 1024, h: 896 },
      form:
        'A low cluster of four short broken basalt column stumps of different heights standing ' +
        'close together on a shared base, their flat hexagonal tops facing up like a cracked ' +
        'paving pattern, small rubble chips between them. Roughly as wide as it is tall.',
    },
    {
      // 3 — one toppled prism lying flat. Landscape canvas drives the aspect.
      seed: 920423,
      gen: { w: 1216, h: 768 },
      form:
        'One thick hexagonal basalt column lying flat on its side on the ground, seen along its ' +
        'length, its long straight facets and both broken ends visible, a crack splitting it near ' +
        'the middle. A long low shape, much wider than it is tall.',
    },
    {
      // 4 — toppled prism ACROSS a stump: a wide, busy silhouette to close the
      // set.
      //
      // RE-ROLL. Attempt 1 (seed 920529) asked for the fallen prism to be
      // "propped up at an angle with a clear gap of empty air underneath its
      // raised end". flux rendered the gap literally and left two blocks
      // LEVITATING above the stump, touching nothing. Asking for negative space
      // gets negative space; the shape has to be described by what it RESTS ON
      // instead. The wanted outline-hole is now produced by the notch between
      // the fallen prism and the stump beneath it, which is contact geometry.
      // Attempt 2 (seed 920537, "lying FLAT ACROSS the LOW stump … a wide low
      // arrangement") fixed the levitation but came back at aspect 1.85, over
      // the 1.75 one-tile cap. Round 1 established that a stated ratio does not
      // steer the aspect — the ARCHETYPE does, and "lying flat across" is
      // intrinsically elongated. Attempt 3 therefore swaps the archetype: the
      // column LEANS against a TALL stump, which raises the silhouette instead
      // of stretching it, and still leaves the wanted hole in the outline.
      seed: 920543,
      gen: { w: 1088, h: 896 },
      form:
        'One broken basalt column leaning against the tall stump of another and resting on its ' +
        'shoulder, the leaning shaft rising steeply out of the ground, angular chips heaped at ' +
        'the base of both. A compact chunky group with real height, only somewhat wider than it ' +
        'is tall.',
    },
  ],
  maskFn: null,
  speckMinFrac: 0.004, // stump fields and chip scatter are legitimate small components
  tone: {
    targetLum: 52,
    tint: [0.98, 1.0, 1.04], // faintly cool — the basalt_plain floor is R/B 0.721
    minFactor: 0.3,
    maxFactor: 1.5,
  },
  check: {
    // Wide on purpose (see "THE ASPECT SPREAD IS THE POINT"). 0.40 -> 11 px wide
    // at 28 px height, 1.75 -> the renderer's one-tile cap.
    aspectMin: 0.4,
    aspectMax: 1.75,
    baseLumTol: 2.5,
    baseRBMin: 0.8,
    baseRBMax: 1.15,
    fillMin: 0.2,
  },
  sheet: { biome: 'basalt_plain', heightFactor: 1 },
};

run(cfg).catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
