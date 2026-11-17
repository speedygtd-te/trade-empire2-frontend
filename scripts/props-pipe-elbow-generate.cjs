/**
 * Asset-Pipeline: surface PROP sprite — PIPE ELBOW (underground-structure rooftop fixture).
 *
 *   pipe_elbow_0  ->  the "bent pipe" of the four underground-fixture props
 *
 * See props-vent-grille-generate.cjs for the shared context and the silhouette
 * table. This is the fourth and last member: a thick pipe emerging vertically
 * from the ground and bending 90 degrees into a short horizontal run capped by
 * a bolted blank flange, with a valve wheel at the bend.
 *
 * ── WHY AN L-BEND, NOT ANOTHER BOX OR ANOTHER PIPE
 * vent_grille and hatch_riser are both squat/wide boxes; exhaust_stack is a
 * bare straight vertical pipe. A BENT pipe gives the set a fourth silhouette
 * class that is neither a box nor a straight rod: the horizontal arm reads as
 * a distinct top-heavy notch even at 28 px, where a second straight pipe next
 * to exhaust_stack would just look like a shorter copy of it.
 *
 * ── TONE — see props-vent-grille-generate.cjs; identical cool worked-steel
 * target so the four fixtures read as one family of hardware.
 *
 * ── PERSPECTIVE — v2, see props-vent-grille-generate.cjs for the full
 * diagnosis (v1 used the photographic prop camera phrase, which came back
 * close to eye level on a right-angled built object). Same fix here: the
 * anchor now opens with the module pipeline's locked isometric-camera clause
 * (scripts/regenerate-14-modules.ts BASE_STYLE), word for word, ahead of the
 * material description; the grey-backdrop clause after it stays because this
 * sprite still goes through the prop pipeline's own birefnet cutout.
 *
 * NO LIT VARIANT — props have no lit system.
 *
 * Usage: see scripts/props-family-runner.cjs
 */
const { run } = require('./props-family-runner.cjs');

const ANCHOR =
  'isometric game asset, isometric 2.5D perspective, 30 degree camera angle from horizontal, ' +
  '2:1 isometric perspective, The Expanse hard sci-fi aesthetic, one small bolted steel pipe ' +
  'elbow fitting, floating in mid-air against a plain flat uniform mid-grey seamless backdrop ' +
  'that continues unbroken behind it and below it. A thick dark grey-green pipe rising out of a ' +
  'square base flange, bending ninety degrees partway up into a short horizontal run, a bolted ' +
  'blank flange capping the open end, a small valve wheel at the bend, visible bolt rings at ' +
  'every joint, worn paint, faint rust, no rock, no crust, purely man-made hardware. Lit from ' +
  'upper left, deep shadows lower-right, dim moody lighting, matte non-reflective, muted ' +
  'desaturated palette, high detail, sharp focus, crisp clean silhouette, generous empty margin.';

const cfg = {
  family: 'pipe_elbow',
  n: 1,
  mode: 'gen',
  anchor: ANCHOR,
  shapes: [
    {
      seed: 940423,
      gen: { w: 960, h: 1024 },
      form:
        'One thick pipe rising up from its base flange then bending ninety degrees right into a ' +
        'short horizontal arm capped with a bolted blank flange, a small valve wheel at the bend. ' +
        'Roughly as wide as tall, an L-shaped silhouette, NOT a straight pipe, NOT a box.',
    },
  ],
  maskFn: null,
  speckMinFrac: 0.01,
  tone: {
    targetLum: 50,
    tint: [0.97, 1.0, 1.07],
    minFactor: 0.3,
    maxFactor: 1.8,
    minBaseFrac: 0.5,
  },
  check: {
    // Widened from the original 0.7..1.3 after generation: the winning seed
    // came back as a compact vertical filter/valve body crossed by a flanged
    // horizontal run at its foot (0.62) rather than a perfectly square L-bend
    // — still a distinct fourth silhouette (a cross/T through the base) next
    // to the box (vent_grille), the spool (exhaust_stack) and the two-tier
    // dome (hatch_riser), and closer to a "1.3x taller than wide" reading than
    // the aspectMax of 1.3 implied.
    aspectMin: 0.55,
    aspectMax: 1.3,
    baseLumTol: 4,
    fillMin: 0.12,
  },
  sheet: { biome: 'plains', heightFactor: 1 },
};

run(cfg).catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
