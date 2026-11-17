/**
 * Asset-Pipeline: surface PROP sprites — CHARRED TREES (cold, burnt out).
 *
 *   charred_tree_0..4  ->  biomes ash_field, basalt_plain (VOLCANIC, round 2)
 *
 * Dead trunks left standing after the flow went through: coal-black, bark
 * cracked into a crocodile-skin pattern, branches burnt down to stubs. COLD —
 * no embers, no glow. The glowing state is a SEPARATE family
 * (charred_tree_ember) derived from these exact raws, because propLayout draws
 * variants uniformly within a family and glowing trunks must not be able to land
 * on ash_field where there is no lava.
 *
 * ── THIS SET IS THE IoU CONTRACT
 *
 * charred_tree_ember is a kontext derive from `assets/raw/charred_tree_<i>_raw.png`
 * and must keep the silhouette at IoU >= 0.95. That constraint is designed into
 * THIS script, not fixed afterwards:
 *
 *   - the trunks are asked for THICK and the branches as STUBS. A silhouette
 *     made of thin twigs is dominated by its thinnest features, and a repaint
 *     that shifts a two-pixel twig by two pixels costs far more IoU than the
 *     same shift on a thick trunk. rock_snow reached 0.980–0.997 on compact
 *     boulders; a spidery dead tree would not.
 *   - the same reasoning independently favours legibility: at PROP_BASE_HEIGHT
 *     (28 px) a twig is sub-pixel and disappears into the tile anyway.
 *
 * So "chunky" here is not an aesthetic preference, it is what makes both the
 * derive and the draw size work.
 *
 * FIVE variants: charred_tree is 1/5 of the basalt_plain mix (50.8 % of the
 * surface) and 1/3 of ash_field (16.0 %), so it is the most-seen non-rock prop
 * on the planet. It is also the tallest — a repeated tree silhouette is far more
 * noticeable than a repeated pebble.
 *
 * ── TONE
 * Base target 34 lum: darker than every other round-2 family and far darker than
 * the `tree` family (48.1). Charcoal is genuinely near-black, and the ash_field
 * (39.2) and basalt_plain (55.6) floors are bright enough that a trunk at 34
 * still reads as a dark object against them. Near-neutral tint with a whisper of
 * warmth (R/B band 0.90..1.30) — soot is warm-black, not blue-black.
 *
 * ── PROMPT NOTES
 * Positive phrasing only. The burnt state is described by what the surface DOES
 * (cracked into shiny black plates, powdery grey ash in the fissures) rather
 * than as "burnt tree", which reliably returns an orange-lit forest fire scene.
 * "The fire went out long ago, the wood is cold" is the clause that keeps embers
 * out — a positive statement of the state, not a "no glow" negation.
 *
 * Usage: see scripts/props-family-runner.cjs
 */
const { run } = require('./props-family-runner.cjs');

const ANCHOR =
  'Photorealistic studio photograph of one dead charred tree trunk, ' +
  'floating in mid-air against a plain flat uniform mid-grey seamless backdrop that continues ' +
  'unbroken behind it and below it, seen from a three-quarter angle slightly above. ' +
  'The wood is completely carbonised: deep coal black, the bark burnt into a crocodile-skin ' +
  'pattern of hard shiny black plates separated by deep charcoal fissures, powdery grey ash ' +
  'settled in the cracks, the broken ends showing open black charcoal grain. ' +
  'The fire went out long ago and the wood is cold, dark and dusty throughout. ' +
  'Soft directional light from the upper left, deep shadows on the lower-right side, ' +
  'dim moody lighting, matte, muted desaturated palette, high detail, sharp focus, ' +
  'crisp clean silhouette, centred with a generous empty margin on every side.';

const cfg = {
  family: 'charred_tree',
  n: 5,
  mode: 'gen',
  anchor: ANCHOR,
  shapes: [
    {
      // 0 — the reference trunk: upright, thick, a few heavy stubs.
      seed: 940101,
      gen: { w: 768, h: 1216 },
      form:
        'One thick upright charred tree trunk standing on its own root flare, snapped off at the ' +
        'top, with four short heavy burnt branch stubs left on the shaft. The trunk is stout and ' +
        'solid, taller than it is wide.',
    },
    {
      // 1 — leaning trunk with a splintered crown: same class, clearly different
      // outline.
      // RE-ROLL. Attempt 1 (seed 940211, canvas 832x1152) came back at aspect
      // 0.34 — a bare pole, below the 0.35 rail, and with nothing at its foot it
      // read as a log hanging in the air rather than a trunk standing on ground.
      // Two fixes, both about WIDTH: a squarer canvas, and two heavy stubs
      // reaching to OPPOSITE sides, which is the cheapest way to buy silhouette
      // width on a vertical object. A rubble/ash foot is asked for as well so
      // the bottom of the silhouette is anchored.
      seed: 940217,
      gen: { w: 896, h: 1088 },
      form:
        'One stout charred trunk leaning to the left out of a low heap of ash and burnt debris, ' +
        'its top splintered into three short jagged spikes, one heavy stub branch reaching far out ' +
        'to the right and another to the left. Taller than it is wide.',
    },
    {
      // 2 — a pair, so one silhouette in the set has a gap of sky in it.
      // RE-ROLL. Attempt 1 (seed 940317) technically passed at aspect 0.36 but
      // returned two near-parallel poles standing almost edge to edge — the same
      // thin-pole failure as variant 1, and at 28 px the pair merges into one
      // 10 px smudge, so the gap that justified the shape is invisible. "Close
      // together" was the culprit; the re-roll spreads them and leans them
      // apart, and adds a third broken stub low down to widen the base.
      seed: 940323,
      gen: { w: 1088, h: 1024 },
      form:
        'Two charred trunks standing well apart and leaning away from each other in a wide V, the ' +
        'left one tall and straight, the right one broken off half way and blunt, a third short ' +
        'stump between them at ground level. About as wide as it is tall.',
    },
    {
      // 3 — the burnt-out stump: the short, wide member. Needed so the set does
      // not read as one tree at three heights.
      seed: 940423,
      gen: { w: 1088, h: 896 },
      form:
        'One wide burnt-out stump with a hollow charred core, its rim broken into blunt black ' +
        'points and two thick root buttresses spreading forward. A squat heavy shape, about as ' +
        'wide as it is tall.',
    },
    {
      // 4 — a fallen trunk: the wide low member, and the only one whose long axis
      // is horizontal.
      // RE-ROLL. Attempt 1 (seed 940529, canvas 1216x768, "a LONG LOW shape,
      // MUCH WIDER than it is tall") returned aspect 2.07, past the 1.75
      // one-tile cap — the round-1 finding all over again: "lying / long / low"
      // is an intrinsically elongated archetype and no ratio phrase reins it in.
      // The re-roll keeps the fallen trunk but stands its torn ROOT PLATE up at
      // one end, which adds height to the silhouette instead of subtracting
      // width, and drops every "long/low/much wider" word from the form.
      // Attempt 2 (seed 940535, canvas 1088x896, root plate stood up at one end)
      // barely moved the number: 1.98 against attempt 1's 2.07. That settles it
      // — for this subject the CANVAS is not the lever the round-1 notes hoped,
      // the ARCHETYPE is, and "a trunk lying on the ground" is horizontal
      // whatever frame it is drawn in. Attempt 3 therefore stops asking for a
      // horizontal object: the snag is snapped mid-shaft and FOLDED OVER onto
      // its own stump, so the silhouette is a diagonal with a triangular hole
      // under it. Still unmistakably a dead fallen tree, but with real height —
      // and the hole makes it the most distinctive outline in the set at 28 px.
      seed: 940541,
      gen: { w: 1024, h: 960 },
      form:
        'One thick charred trunk snapped half way up and folded over, its broken top leaning ' +
        'steeply down to the ground on the right while the splintered stump still stands on the ' +
        'left, a triangular gap under the leaning shaft, burnt debris at both ends. ' +
        'Somewhat wider than it is tall.',
    },
  ],
  maskFn: null,
  speckMinFrac: 0.004,
  tone: {
    targetLum: 34, // charcoal — deliberately the darkest family of round 2
    tint: [1.03, 1.0, 0.97], // soot is warm-black, not blue-black
    minFactor: 0.2,
    maxFactor: 1.4,
  },
  check: {
    aspectMin: 0.35,
    aspectMax: 1.75,
    baseLumTol: 2.5,
    baseRBMin: 0.9,
    baseRBMax: 1.3,
    fillMin: 0.12, // trunks are thin objects in their own bbox; the bar is low on purpose
  },
  sheet: { biome: 'ash_field', heightFactor: 1 },
};

run(cfg).catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
