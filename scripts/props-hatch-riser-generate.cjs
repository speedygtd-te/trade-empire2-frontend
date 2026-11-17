/**
 * Asset-Pipeline: surface PROP sprite — HATCH RISER (underground-structure rooftop fixture).
 *
 *   hatch_riser_0  ->  the "raised maintenance hatch" of the four underground-fixture props
 *
 * See props-vent-grille-generate.cjs for the shared context and the silhouette
 * table. This one is the WIDE, LOW member: a raised access-hatch housing with
 * an angled lid, standing proud of the ground on its own coaming collar.
 *
 * ── WHY "RISER", NOT A FLAT MANHOLE COVER
 * A flat manhole cover flush with the ground is a floor DECAL, not a standing
 * prop — CLAUDE.md explicitly rules that out for this set ("stehende Objekte,
 * kein flacher Belag — also kein Boden-Einzug"). This is instead a raised
 * coaming (the same idea as a ship's deck hatch, or a submarine sail hatch): a
 * low box/dome on a collar a few inches proud of the ground, with the lid
 * itself canted at an angle so the object has real height and a shadow side,
 * not a shape that would look right printed flat into the tile.
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
  '2:1 isometric perspective, The Expanse hard sci-fi aesthetic, one small welded steel ' +
  'maintenance hatch housing, floating in mid-air against a plain flat uniform mid-grey seamless ' +
  'backdrop that continues unbroken behind it and below it. A low raised steel coaming collar ' +
  'proud of the ground, topped by a hinged hatch lid canted at an angle, a raised wheel-lock ' +
  'handle on the lid, two hinges along one edge, rivets around the collar rim, worn dark ' +
  'grey-green paint, faint rust, no rock, no crust, purely man-made hardware. Lit from upper ' +
  'left, deep shadows lower-right, dim moody lighting, matte non-reflective, muted desaturated ' +
  'palette, high detail, sharp focus, crisp clean silhouette, centred with a generous empty ' +
  'margin on every side.';

const cfg = {
  family: 'hatch_riser',
  n: 1,
  mode: 'gen',
  anchor: ANCHOR,
  shapes: [
    {
      // Wide landscape canvas forces the low, wide silhouette.
      seed: 940317,
      gen: { w: 1216, h: 832 },
      form:
        'One low wide raised hatch housing on a short square collar, its lid canted at a shallow ' +
        'angle with a raised wheel-lock handle on top and two hinges along the back edge. A low, ' +
        'wide, squat shape, clearly wider than it is tall, NOT a tall tower, NOT a narrow pipe.',
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
    aspectMin: 1.1,
    aspectMax: 1.9,
    baseLumTol: 4,
    fillMin: 0.2,
  },
  sheet: { biome: 'plains', heightFactor: 1 },
};

run(cfg).catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
