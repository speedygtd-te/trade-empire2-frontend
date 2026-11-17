/**
 * Asset-Pipeline: surface PROP sprite — EXHAUST STACK (underground-structure rooftop fixture).
 *
 *   exhaust_stack_0  ->  the "tall narrow chimney" of the four underground-fixture props
 *
 * See props-vent-grille-generate.cjs for the shared context (the underground
 * rooftop-fixture feature) and the silhouette table for how the four types
 * split apart. This one is the TALL member: a thin welded steel exhaust pipe
 * rising out of the ground with a conical rain cap, braced by two diagonal
 * support gussets so it does not read as a bare pole.
 *
 * ── WHY TALL AND NARROW SPECIFICALLY
 * Every other fixture in the set (vent_grille, hatch_riser, pipe_elbow) is
 * squat and wider than tall — a set of four boxes would blur together at 28 px
 * no matter how different their surface detail is. A genuinely narrow silhouette
 * (aspect ~0.45-0.55, i.e. roughly half as wide as it is tall) is the one shape
 * none of the others can be mistaken for.
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
  '2:1 isometric perspective, The Expanse hard sci-fi aesthetic, one small welded steel exhaust ' +
  'stack, floating in mid-air against a plain flat uniform mid-grey seamless backdrop that ' +
  'continues unbroken behind it and below it. A cylindrical dark grey-green pipe rising from a ' +
  'broad flat square base plate, topped by a broad flared rain hood shaped like an umbrella disc ' +
  'clearly wider than the base plate, a weld seam ring partway up, worn paint, faint rust, no ' +
  'rock, no crust, purely man-made hardware. Lit from upper left, deep shadows lower-right, dim ' +
  'moody lighting, matte non-reflective, muted desaturated palette, high detail, sharp focus, ' +
  'crisp clean silhouette, centred with a generous empty margin on every side.';

const cfg = {
  family: 'exhaust_stack',
  n: 1,
  mode: 'gen',
  anchor: ANCHOR,
  shapes: [
    {
      // Narrow portrait canvas is what actually forces the aspect down — a
      // square canvas would let flux fatten the pipe into a barrel (the same
      // failure basalt_column round-1 measured on square canvases).
      seed: 940229,
      gen: { w: 896, h: 1088 },
      form:
        'One single tall exhaust pipe standing upright, flared disc rain hood at the top spanning ' +
        'nearly the full frame width, flat square base plate at the bottom nearly as wide as the ' +
        'hood, the pipe in between. An upright shape a little taller than wide, wide top and ' +
        'bottom, NOT a hairline rod.',
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
    aspectMin: 0.4,
    aspectMax: 0.95,
    baseLumTol: 4,
    fillMin: 0.12,
  },
  sheet: { biome: 'plains', heightFactor: 1 },
};

run(cfg).catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
