/**
 * Asset-Pipeline: surface PROP sprites — ICE FLOE (drifting sea ice / tabular ice).
 *
 *   ice_floe_0..4  ->  biome ice_shelf (planet type ICE)
 *
 * ── WHY THIS FAMILY EXISTS AT ALL: THE DESIGN CHANGE
 *
 * ice_shelf was attempted three times as a TILE with the floes painted INTO the
 * diamond by fal/kontext. Each attempt failed on a different tiling artefact:
 *
 *   a2/a3  ice sat flush on the rhombus edge   -> every seam cut a floe in half
 *   a6     hero element re-composed per slot   -> still edge-adjacent in places
 *   a7     edge-clearance rule (N = 23.7 px)   -> ice only in the tile MIDDLE,
 *                                                 i.e. a point raster of floes
 *                                                 with ice-free water "streets"
 *                                                 running along every seam
 *
 * Those two failure modes are the two ends of ONE constraint: content baked into
 * a diamond either touches the boundary (and gets cut) or is kept away from it
 * (and reveals the grid). There is no third option inside a tile.
 *
 * The PROP layer has no such constraint, which is why Rudi's call to make the
 * floes props is the actual fix rather than a fourth attempt:
 *   - propLayout scatters sprites per tile with deterministic sub-tile jitter,
 *     and a prop is ALLOWED to overhang the diamond — that is what the layer is
 *     for, so nothing has to continue across a seam;
 *   - every neighbouring tile draws its OWN floes, so there is no shape whose
 *     halves would have to line up;
 *   - the count comes from the backend cosmetic index g, so density varies tile
 *     to tile instead of repeating with the 4-slot floor cycle;
 *   - props may have VOLUME. A floe with a thick broken rim and a lit top face
 *     reads as a floating slab; a floe painted flat into the floor reads as a
 *     stain. "Plastisch" was Rudi's word and it is only achievable here.
 *
 * The ground tile is now plain polar water (see tiles-ice-shelf-polar-grade.cjs:
 * ocean graded to canvas luma 22.0, inner 41.4, B/R 2.84). All ice lives in this
 * family.
 *
 * ── THE ASPECT / SIZE TRAP THIS FAMILY IS MOST EXPOSED TO
 *
 * PlanetSurface sizes a prop by HEIGHT (drawH = PROP_BASE_HEIGHT 28 x scale) and
 * derives the WIDTH from the sprite's own aspect, on a TW = 48 / TH = 24 tile. A
 * wide family without a PROP_HEIGHT_FACTORS entry therefore fills the whole tile
 * — the mistake that cost two acceptance rounds (rock_ash shipped at 28 x 48 px,
 * i.e. exactly one tile). A floe is genuinely a wide low object, so the aspect
 * band is held at 1.6..3.0 by controlling the PLAN shape ("an elongated raft,
 * much longer from left to right than from front to back") rather than by a ratio
 * sentence — the lava_crust lesson is that a ratio phrase does not rein an
 * archetype in, the archetype itself has to change. The height factor is then
 * DERIVED from the measured mean aspect, not guessed.
 *
 * At the mean aspect a floe should span ~62 % of the tile width:
 *   factor = targetWidthFraction x TW / (PROP_BASE_HEIGHT x aspectMean)
 *          = 0.625 x 48 / (28 x 2.196) = 0.488  ->  0.48
 * SHIPPED BAND: aspect 1.69..2.58, mean 2.196. At factor 0.48 that draws
 * 13.4 px tall and 22.7..34.7 px wide, i.e. 47..72 % of the 48 px tile with the
 * mean at 61.5 %. Comparable shipped families: lava_crust aspect 1.65-2.58 at
 * factor 0.35, lava_puddle 2.02-2.42 at 0.46 + PROP_GROUND_INSET 1.0.
 *
 * ── TONE
 * targetLum 105 against the ice_shelf water's inner luma of 41.4 — a ~2.5x step,
 * unmistakably ice, while staying inside the dirty redesign palette. For scale in
 * the shipped bestand: rock_arid 57, sulfur_chunk 78, rock_snow 76-137 (the snow
 * caps), rock_sand 128. Brilliant white would be ~200+ and is deliberately not
 * asked for. The tint ended up NEUTRAL (see the note on `tone.tint`) and the
 * validator enforces baseRB in 0.80..0.96, so both a cornflower-blue set and a
 * neutral-grey "pale rock" set fail instead of shipping as ice. Shipped:
 * 0.85..0.89.
 *
 * ── PROMPT RULES OBSERVED (documented failure sources from the tile attempts)
 *   - NO "isometric grid" anywhere: it produced fine raster lines across the
 *     image. The perspective is asked for as "a high three-quarter isometric
 *     angle looking down", which is the same view without the word "grid".
 *   - NO negative prompts / no "without X": naming the unwanted thing reproduces
 *     it. Every constraint here is a POSITIVE replacement instruction — the
 *     background is "a plain flat uniform mid-grey seamless backdrop that
 *     continues unbroken behind it and below it" rather than "no background",
 *     which is the phrasing the whole shipped prop bestand was generated with
 *     and the phrasing birefnet cuts most cleanly.
 *   - "irregular many-sided polygon with jagged broken edges" is carried over
 *     verbatim: it is the vocabulary that produced usable floe outlines in the
 *     tile attempts, and it is the one thing from that work worth keeping.
 *
 * Usage: see scripts/props-family-runner.cjs
 *   node scripts/props-ice-floe-generate.cjs gen
 *   node scripts/props-ice-floe-generate.cjs gen 4 --seed 970533
 *   node scripts/props-ice-floe-generate.cjs validate | sheet | integrate
 */
const { run } = require('./props-family-runner.cjs');

// ── ATTEMPT 1 (seeds 9701xx, "thick slab / tall broken side wall") ──
//
//   0  aspect 1.54  R/B 0.61   big square block, boxy outline
//   1  aspect 1.72  R/B 0.75   PASS on the numbers, still square in plan
//   2  aspect 1.67  R/B 0.65   cracked block, good lead, boxy
//   3  aspect 1.40  R/B 0.65   deepest block of the five
//   4  aspect 1.63  R/B 0.69   rounded box + two chips
//
// The plasticity brief was MET on the first try — every variant had a real side
// wall, a lit top face and a cast shadow. Two things were wrong, both systematic
// and both traceable to a phrase:
//
// ASPECT UNDERSHOT (1.40-1.72 against a 1.6-2.7 band). This is the lava_crust
// lesson landing on the other side: there, "plate / slab / lying / low" made an
// archetype too flat and had to be replaced by "thick block with a visible
// broken side wall". Borrowing that replacement wholesale over-corrected — "a
// thick slab with a tall broken side wall" is a CUBE archetype, and a cube's
// bbox is square whatever the ratio sentence says. The fix is not to weaken the
// thickness (that is the part Rudi asked for) but to change the PLAN shape: an
// ELONGATED raft, "much longer from left to right than from front to back", is
// wide in bbox terms while keeping every bit of its depth. The canvases widen
// with it (1344x640 instead of 1152x704).
//
// TOO BLUE (R/B 0.61-0.75 against a 0.72-1.00 band). "Pale blue-white" plus a
// COOL tint of [0.95, 1.0, 1.07] compounded: the prompt returned a cornflower
// blue and the grade then pushed it a further 13 % in the same direction. The
// brief is "blass ... gedeckt und leicht schmutzig", i.e. a greyish white with
// only a hint of blue. So the prompt now asks for "pale greyish-white" with
// "only a faint cold blue cast", and the tint is REVERSED to [1.06, 1.0, 0.95]
// — a warm-corrective nudge, not a warm look, which is what keeps the band's
// 1.00 ceiling meaningful.
//
// OUTLINE TOO REGULAR. "Irregular many-sided polygon with jagged broken edges"
// on its own produced quadrilaterals. It is kept (it is the vocabulary that
// worked in the tile attempts) but sharpened with what makes a polygon read as
// irregular: unequal edge lengths and corners snapped off at random angles.
const ANCHOR =
  'Photorealistic photograph of drifting sea ice, one isolated object floating in mid-air against a ' +
  'plain flat uniform mid-grey seamless backdrop that continues unbroken behind it and below it, ' +
  'seen from a high three-quarter isometric angle looking down. Its top face is pale greyish-white ' +
  'ice, dusted with patches of dry granular snow and threaded with hairline cracks stained faint ' +
  'grey-brown; its rim is a broken edge of glassy grey ice showing its depth, with a narrow dark ' +
  'shadow line along its underside at the waterline. Soft directional light from the upper left, ' +
  'deep shadow on the lower-right side, dim moody lighting, matte, muted desaturated palette, only ' +
  'a faint cold blue cast, slightly dirty weathered ice, fine crystalline texture, sharp focus, ' +
  'crisp clean silhouette, centred with a generous empty margin on every side.';

// Size streuung across the variants: 2 large tabular plates, 2 medium, 1 small
// fragment. NOTE for the follow-up agent — the renderer normalises every variant
// to the SAME drawn height, so this streuung is a SHAPE difference (how busy and
// how chunky the outline is), not a drawn-size difference. Drawn size per variant
// comes from PROP_VARIANT_HEIGHT_FACTORS; the recommendation is in the report.
const cfg = {
  family: 'ice_floe',
  n: 5,
  mode: 'gen',
  anchor: ANCHOR,
  shapes: [
    {
      // 0 — the reference raft: one big elongated pan, calm outline.
      seed: 970147,
      gen: { w: 1408, h: 576 },
      form:
        'One large raft of sea ice, a long narrow pan three times as long from left to right as it is ' +
        'deep from front to back, flat and snow-covered on top with a broken side wall a hand deep, ' +
        'outline a ragged many-sided polygon of unequal jagged edges.',
    },
    {
      // 1 — big raft with a pressure ridge: a more articulated top face.
      // ATTEMPT 3 (seed 970257, "three times as long ... narrow raft") came back
      // as a rounded RECTANGLE — a stadium, the most regular outline of the five —
      // and the pressure ridge never appeared. "Long narrow" at a 3:1 plan ratio
      // is itself a regular archetype: it leaves the model nothing to be ragged
      // with. Dropped to 2:1 and the corner-snapping clause restored, which is
      // what gave variant 0 its ragged read.
      seed: 970263,
      gen: { w: 1344, h: 576 },
      form:
        'One long raft of sea ice, twice as long from left to right as it is deep from front to back, ' +
        'its snowy top buckled along one side into a low ridge of tilted broken plates, outline a ' +
        'ragged polygon of unequal jagged edges with corners snapped off at random angles.',
    },
    {
      // 2 — medium raft cracked nearly in two: the dark lead gives it its read.
      seed: 970357,
      gen: { w: 1344, h: 640 },
      form:
        'One raft of sea ice cracked almost in two, the halves slumped a little apart with a narrow ' +
        'dark gap of open water between them, an elongated pan much longer from left to right than ' +
        'from front to back, outline a ragged many-sided polygon of unequal jagged edges.',
    },
    {
      // 3 — medium raft carrying rubble: the busiest top face.
      seed: 970463,
      gen: { w: 1344, h: 640 },
      form:
        'One raft of sea ice with three small angular blocks of ice resting on its snowy top face ' +
        'near the broken rim, an elongated pan much longer from left to right than from front to ' +
        'back, outline a ragged many-sided polygon of unequal jagged edges.',
    },
    {
      // 4 — the small fragment: a narrow wedge, thicker at one end, plus chips.
      seed: 970577,
      gen: { w: 1408, h: 576 },
      form:
        'One small splinter of sea ice, a long thin sliver four times as long from left to right as ' +
        'it is deep from front to back and thicker at one end, outline a ragged many-sided polygon ' +
        'of unequal jagged edges, with two tiny loose chips of ice beside it.',
    },
  ],
  // No overlay channel: this family has no glow / snow-cap sub-material that has
  // to be graded separately. The snow IS the top face and belongs to the base
  // measurement — splitting it out would let a variant pass with a dark slab and
  // a blown-out cap.
  maskFn: null,
  speckMinFrac: 0.004, // variant 4 has legitimate loose shards
  tone: {
    targetLum: 105,
    // NEUTRAL — a measured decision, not a default. Attempt 1 shipped a COOL
    // [0.95, 1.0, 1.07] on top of a prompt that already returned cornflower blue
    // (R/B 0.61-0.75, far too saturated for "gedeckt"). Attempt 2 reversed it to
    // a warm-corrective [1.06, 1.0, 0.95] and landed R/B 0.95-1.00 — the opposite
    // miss: at the 1.00 ceiling the ice reads as pale STONE or dried mud on the
    // contact sheet, which loses the point of the family. The attempt-2
    // generations measure R/B 0.851 BEFORE any tint, i.e. the prompt on its own
    // now delivers the pale blue-white asked for. So the grade gets out of the
    // way and the band tightens around what the prompt produces: 0.80..0.96 —
    // blue enough to read as ice, not so blue that it leaves the muted palette.
    tint: [1.0, 1.0, 1.0],
    minFactor: 0.25,
    maxFactor: 2.5, // a dim generation may legitimately need lifting to 105
  },
  check: {
    // 1.6..2.7 — wide enough to read as a plate lying on water, narrow enough
    // that a sane height factor keeps it inside one tile. See the aspect trap
    // note in the header.
    aspectMin: 1.6,
    aspectMax: 3.0,
    baseLumTol: 3.0,
    // Cool-only. 1.00 is the hard ceiling: at R/B >= 1 the sprite is neutral
    // grey or warm, i.e. a rock that happens to be pale, and it will not read as
    // ice against blue water. rock_snow's snow caps measure 1.00-1.08 — this
    // family has to sit clearly BELOW that.
    baseRBMin: 0.8,
    baseRBMax: 0.96,
    fillMin: 0.3,
  },
  sheet: {
    biome: 'ice_shelf',
    // DERIVED from the shipped band (1.69..2.58, mean 2.196):
    //   0.625 x 48 / (28 x 2.196) = 0.488  -> 0.48 (measured mean aspect 2.196)
    heightFactor: 0.48,
  },
};

run(cfg).catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
