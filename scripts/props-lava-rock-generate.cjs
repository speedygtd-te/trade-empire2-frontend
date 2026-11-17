/**
 * Asset-Pipeline: surface PROP sprites — LAVA ROCK (obsidian chunks).
 *
 *   lava_rock_0..2  ->  biomes obsidian_ridge, lava_flow (VOLCANIC, round 2)
 *
 * Black volcanic glass: sharp conchoidal fractures, glassy specular sheen on the
 * fresh break faces, dull weathered crust elsewhere. The one family in round 2
 * that is allowed to be SHINY — everything else in the tile redesign is matte,
 * and obsidian's sheen is precisely what tells it apart from `rock_ash` at 28 px.
 *
 * THREE variants, not five. lava_rock sits on obsidian_ridge (1.4 % of the
 * measured surface) and one third of lava_flow (1.2 %), i.e. ~1.8 % of all props
 * on the planet. Five silhouettes for a prop the player meets a handful of times
 * per screen is resolution nobody sees; three keeps the repeat rate invisible at
 * that frequency. (Round-1 families run 4–8 variants — 5 is a convention, not a
 * rule.)
 *
 * ── TONE
 * Base target 44 luminance, i.e. clearly DARKER than the rock_arid family (56.5)
 * and than rock_ash (52). It has to be: the obsidian_ridge tile it stands on
 * measures 30.4 lum / R/B 0.749 and is the darkest floor on the planet, so a
 * prop at the arid family value would read as a pale blob dropped on black
 * glass. 44 keeps a ~1.45x separation from the floor — enough to read, not
 * enough to look pasted on. The tint is faintly COOL (R/B band 0.80..1.15)
 * because the floor is cool; the warm [1.08,1.0,0.88] vector the arid rocks use
 * would put a brown stone on a blue-black ridge.
 *
 * ── PROMPT NOTES
 * Phrased POSITIVELY throughout, no "no X" clauses. Round 1 established (moss
 * run, props-rock-generate.cjs) that naming an unwanted artefact makes the model
 * paint it in. Where round 1 wrote "NOTHING underneath: no ground, no pedestal,
 * no cast shadow", this says the subject FLOATS IN MID-AIR and the backdrop
 * CONTINUES UNBROKEN BEHIND AND BELOW it — same intent, stated as something to
 * render rather than something to omit.
 *
 * Usage: see scripts/props-family-runner.cjs
 */
const { run } = require('./props-family-runner.cjs');

// Shared style anchor — identical for all three variants so the set reads as ONE
// material. Darkness and glassiness are both stated twice on purpose: a single
// mention of "black" reliably came back as mid-grey granite in round 1.
const ANCHOR =
  'Photorealistic studio macro photograph of a single piece of black volcanic obsidian glass, ' +
  'floating in mid-air against a plain flat uniform mid-grey seamless backdrop that continues ' +
  'unbroken behind it and below it, seen from a three-quarter angle slightly above. ' +
  'The material is natural obsidian: near-black volcanic glass, very dark value, faintly cool ' +
  'neutral black, with smooth curved conchoidal fracture faces that catch a crisp specular ' +
  'highlight, and duller pitted weathered crust on the older surfaces. ' +
  'Razor-sharp broken edges, thin translucent flake margins, fine bubble pits in the crust. ' +
  'Soft directional light from the upper left, deep black shadows on the lower-right faces, ' +
  'dim moody lighting, muted desaturated palette, high detail, sharp focus, crisp clean silhouette, ' +
  'centred in the frame with a generous empty margin on every side.';

const cfg = {
  family: 'lava_rock',
  n: 3,
  mode: 'gen',
  anchor: ANCHOR,
  shapes: [
    {
      // 0 — the workhorse: one blocky chunk, clearly wider than tall so it reads
      // as a rock lying on the ground rather than a standing shard.
      seed: 910101,
      gen: { w: 1152, h: 832 },
      form:
        'One single chunky angular block of obsidian resting on its widest face, with two large ' +
        'flat fracture planes meeting in a sharp ridge across the top and a chipped notch out of ' +
        'the right shoulder. A solid heavy chunk, clearly wider than it is tall.',
    },
    {
      // 1 — a cluster, so the set carries a busier silhouette without needing a
      // second material. Rubble is the shape a fracturing glass actually leaves.
      seed: 910207,
      gen: { w: 1216, h: 768 },
      form:
        'A low cluster of one medium obsidian chunk with five smaller angular shards and splinters ' +
        'scattered tightly around its base, all of the same black glass. A wide low group, much ' +
        'wider than it is tall.',
    },
    {
      // 2 — the tallest of the three but still a rock, not a shard: "wedge
      // resting on the ground" rather than "spike". Round 1 proved that upright
      // vocabulary ("standing", "spire") turns flux into a menhir generator, so
      // the wedge is described by how it LIES.
      seed: 910313,
      gen: { w: 1024, h: 896 },
      form:
        // Trimmed to fit the 1100-char budget the assert enforces (first draft: 1111).
        'One broken wedge of obsidian lying tilted, its thick end raised and its thin end buried, ' +
        'one huge glossy fracture face turned toward the camera and a crumbling crust shoulder ' +
        'above it. A solid chunk with real depth, slightly wider than it is tall.',
    },
  ],
  maskFn: null,
  speckMinFrac: 0.004, // the cluster shape (variant 1) has legitimate small shards
  tone: {
    targetLum: 44,
    tint: [0.98, 1.0, 1.05], // faintly cool — matches the obsidian_ridge floor (R/B 0.749)
    minFactor: 0.3,
    maxFactor: 1.5,
  },
  check: {
    aspectMin: 0.9,
    aspectMax: 1.75, // renderer cap at height factor 1.0: TW / PROP_BASE_HEIGHT = 48/28
    baseLumTol: 2.5,
    baseRBMin: 0.8,
    baseRBMax: 1.15,
    fillMin: 0.25,
  },
  sheet: { biome: 'obsidian_ridge', heightFactor: 1 },
};

run(cfg).catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
