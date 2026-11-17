/**
 * Asset-Pipeline: surface PROP sprite — VENT GRILLE (underground-structure rooftop fixture).
 *
 *   vent_grille_0  ->  the "air intake/exhaust box" of the four underground-fixture props
 *
 * ── WHAT THIS IS
 * New immersion detail: where a level-0 surface tile is empty but an
 * underground hull sits beneath it, a sparse (~1 in 10) fixture stands on the
 * tile — the visible rooftop equipment of the buried structure. Four distinct
 * mechanical fixtures cover the set; this is the first, a squat riveted-steel
 * air vent box with an angled louvred grille on top.
 *
 * NOT `sulfur_vent` (src/assets/props/sulfur_vent/): that is a NATURAL volcanic
 * fumarole made of crusted rock. This is BUILT: flat steel plate, rivets, a
 * machined louvre grille, a weld seam — no rock, no crust, no organic texture.
 *
 * ── SILHOUETTE ROLE IN THE SET OF FOUR
 * vent_grille   squat BOX, roughly as wide as tall, flat-topped with a slanted lid
 * exhaust_stack tall NARROW cylinder, much taller than wide
 * hatch_riser   low WIDE dome/box on a raised collar, much wider than tall
 * pipe_elbow    an L-bend, compact and roughly square but with a bent silhouette
 * Four different width/height classes so a 28 px silhouette alone identifies
 * the type before any surface detail could possibly read.
 *
 * ── TONE
 * Dark cool-grey worked metal (targetLum 50, faintly cool tint) so the set
 * reads as "built machine" against whatever biome floor it lands on — warmer
 * than the surrounding rock props would read as rusted equipment, a uniform
 * cool grey reads as steel regardless of what colour ground it stands on.
 *
 * ── PERSPECTIVE — v2, FIXED AFTER RUDI REJECTION
 * v1 used the ordinary PROP camera phrase ("Photorealistic studio photograph
 * of ..., seen from a three-quarter angle slightly above"), copied verbatim
 * from props-sulfur-vent-generate.cjs. That phrase was tuned against organic
 * rock silhouettes, which have no flat orthogonal faces to reveal a mismatch.
 * On a BUILT, right-angled box it came back at close to eye level — almost no
 * top face visible, two side faces meeting at a corner with a photographic
 * (converging) perspective — nothing like the module sprites this fixture has
 * to sit next to (verified side by side against
 * src/assets/modules/basic_storage/basic_storage_0.webp: the module shows its
 * TOP as a clear flat diamond and both side faces receding at equal, parallel,
 * non-converging angles, the classic steep axonometric look; the v1 vent_grille
 * showed almost none of that).
 *
 * The fix is not a new motif, it is the CAMERA CLAUSE: this anchor now opens
 * with the exact isometric-camera phrase the module pipeline locks down
 * (scripts/regenerate-14-modules.ts BASE_STYLE, "per Rudi, NOT to be changed"):
 * "isometric game asset, isometric 2.5D perspective, 30 degree camera angle
 * from horizontal, 2:1 isometric perspective, The Expanse hard sci-fi
 * aesthetic" — copied word for word. Everything AFTER that clause (material,
 * the grey seamless backdrop for birefnet, lighting) stays the established
 * PROP convention, because this sprite still goes through the prop pipeline's
 * background removal, tight crop and scale-to-400 — the module pipeline's own
 * "no background" phrasing is calibrated for a different removal step this
 * family does not use.
 *
 * ── v3 — CONCRETE BASE, BAKED INTO A FRESH GENERATION
 * Rudi accepted the v2 perspective on all four fixtures but flagged
 * vent_grille as floating: it is a tight-cropped box with nothing below it,
 * no ground contact. The other three already have their own built-in
 * base/collar/flange from the original prompt; vent_grille never got one.
 *
 * First instinct was to patch the ACCEPTED v2 pixels (FLUX Fill with a tight
 * outpaint mask below the existing crop, the technique proven twice today on
 * close-iso-end.cjs) so the approved box stays byte-for-byte untouched above
 * the seam. Rudi then explicitly lowered the bar: a new box is fine as long
 * as it keeps the v2 perspective, gets a real concrete base, and is still
 * readable/distinct at 28 px — pixel fidelity to the old crop is no longer a
 * requirement. Regenerating from scratch through this SAME family script
 * (the module-style camera clause below is unchanged from v2) is the more
 * direct route once that constraint is gone: the base is composed together
 * with the box from one seed instead of stitched onto it afterwards, so there
 * is no seam to hide and no mask-area budget to manage.
 *
 * The base is CONCRETE, not steel, so it visually reads as "foundation the
 * machine sits on" rather than another part of the machine — matches Rudi's
 * "Betonsockel", and separates it from `hatch_riser`'s all-metal riveted
 * collar so the two boxes do not converge into the same silhouette.
 *
 * ── NO LIT VARIANT — props have no lit system, see CLAUDE.md task note.
 *
 * Usage: see scripts/props-family-runner.cjs
 */
const { run } = require('./props-family-runner.cjs');

const ANCHOR =
  'isometric game asset, isometric 2.5D perspective, 30 degree camera angle from horizontal, ' +
  '2:1 isometric perspective, The Expanse hard sci-fi aesthetic, one small welded steel air-vent ' +
  'housing on a concrete base, floating against a plain flat uniform mid-grey seamless backdrop ' +
  'that continues unbroken behind and below it. Dark grey-green steel plate box with rivets and ' +
  'seams, a slanted louvred metal grille set into the sloped top face, standing flush on a low ' +
  'weathered grey concrete pad clearly wider than the box, chipped edges, a hairline crack, worn ' +
  'paint on the steel, faint rust. Lit from upper left, deep shadows lower-right, dim moody ' +
  'lighting, matte non-reflective, muted desaturated palette, high detail, sharp focus, crisp ' +
  'clean silhouette.';

const cfg = {
  family: 'vent_grille',
  n: 1,
  mode: 'gen',
  anchor: ANCHOR,
  shapes: [
    {
      // Taller canvas than v1/v2 (896 -> 1024) to leave room for the concrete
      // base UNDER the box without squeezing the box itself down.
      seed: 940133,
      gen: { w: 960, h: 1024 },
      form:
        'One squat rectangular steel vent box, its sloped top covered by parallel louvre slats, ' +
        'a small pipe stub on its side, standing on a low flat concrete plinth clearly wider than ' +
        'the box and touching the ground. The plinth is distinctly shorter than the box above it. ' +
        'A compact fixture with its own foundation, not a tower, not floating.',
    },
  ],
  maskFn: null,
  speckMinFrac: 0.01,
  tone: {
    targetLum: 50,
    tint: [0.97, 1.0, 1.07], // cool worked-steel grey, differs from warm rock/rust props
    minFactor: 0.3,
    maxFactor: 1.8,
    minBaseFrac: 0.5,
  },
  check: {
    // Widened/lowered vs. v2 (0.6..1.3): the concrete plinth adds height
    // without adding width, so the whole fixture reads narrower than the box
    // alone did.
    aspectMin: 0.5,
    aspectMax: 1.2,
    baseLumTol: 4,
    fillMin: 0.15,
  },
  sheet: { biome: 'plains', heightFactor: 1 },
};

run(cfg).catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
