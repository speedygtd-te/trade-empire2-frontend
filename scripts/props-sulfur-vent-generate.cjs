/**
 * Asset-Pipeline: surface PROP sprites — SULFUR VENTS (fumarole chimneys).
 *
 *   sulfur_vent_0..2  ->  biome fumarole (VOLCANIC, round 2)
 *
 * The landmark object of the fumarole biome: a low chimney of vent rock crusted
 * over with bright yellow sulfur deposits, the way a real fumarole builds its
 * own cone out of sublimated sulfur.
 *
 * THREE variants. fumarole is 4.5 % of the measured surface and its key array is
 * 1/3 vents + 2/3 sulfur_chunk, so a vent lands on roughly 1.5 % of props —
 * frequent enough to be the biome's signature, rare enough that three
 * silhouettes never repeat visibly.
 *
 * ── NO STEAM, NO PLUME
 * A fumarole obviously steams, and the prompt deliberately does not ask for it.
 * Two reasons. Mechanically, birefnet cuts on a subject/background decision and
 * a soft translucent plume comes back either as a hard-edged white blob or as
 * nothing, never as vapour. Semantically, the volcanic smoke/steam overlay is
 * its own planned feature (an extension of the cloud system, explicitly out of
 * scope in the round-2 plan) and baking a static plume into the sprite would
 * collide with it later.
 *
 * ── TONE: TWO CHANNELS
 * The sulfur crust is graded separately from the vent rock via the `sulfurWeight`
 * overlay mask, exactly the way rock_snow separates snow from stone. It has to
 * be: sulfur is far brighter than the rock, so measuring them together would let
 * a heavily crusted vent pull the mean up and the darkening multiply would crush
 * the rock to black (the failure mode measured on the first rock_snow run).
 *   base   -> 55 lum, near-neutral            (the fumarole floor is 63.0 / R/B 0.983)
 *   crust  -> 120 lum, yellow tint
 * 120 is deliberately DIRTY yellow, not a fresh-paint yellow: the round-1 tile
 * redesign is dark, grimy and desaturated, and a saturated lemon prop would be
 * the single loudest thing on a VOLCANIC planet — louder than the ember glow,
 * which is supposed to own that role (see the glow budget in the round-2 plan).
 *
 * ── PROMPT NOTES
 * Positive phrasing only. "Sulfur" is described by its crust behaviour ("crusted
 * over", "powdery rind", "needle crystals in the cracks") rather than by colour
 * alone, because "yellow rock" alone comes back as sandstone.
 *
 * Usage: see scripts/props-family-runner.cjs
 */
const L = require('./props-pipeline-lib.cjs');
const { run } = require('./props-family-runner.cjs');

const ANCHOR =
  'Photorealistic studio photograph of one small volcanic fumarole vent chimney, ' +
  'floating in mid-air against a plain flat uniform mid-grey seamless backdrop that continues ' +
  'unbroken behind it and below it, seen from a three-quarter angle slightly above. ' +
  'It is built of dark grey-brown vent rock, crusted over with dirty sulfur: a powdery ' +
  'mustard-yellow rind on the upward faces, thin pale yellow needle crystals lining the vent ' +
  'mouth and the cracks, rust-orange and grey-green mineral staining bleeding down the flanks, ' +
  'much of the dark rock still bare between the crusts. ' +
  'Rough porous corroded surface, dusty and weathered. ' +
  'Soft directional light from the upper left, deep shadows on the lower-right faces, ' +
  'dim moody lighting, matte, muted desaturated palette, high detail, sharp focus, ' +
  'crisp clean silhouette, centred with a generous empty margin on every side.';

const cfg = {
  family: 'sulfur_vent',
  n: 3,
  mode: 'gen',
  anchor: ANCHOR,
  shapes: [
    {
      // 0 — the classic cone. Portrait-ish canvas so it stands up; described by
      // how it SITS (squat, broad base) so flux does not reach for the menhir
      // archetype the way it did in round 1.
      seed: 930101,
      gen: { w: 832, h: 1152 },
      form:
        'One squat cone-shaped vent chimney sitting on a broad crusted base, its ragged open mouth ' +
        'at the top rimmed with pale yellow crystals, its flanks streaked with yellow deposits. ' +
        'Taller than it is wide.',
    },
    {
      // 1 — a twin vent, so the set has one silhouette with two peaks.
      seed: 930211,
      gen: { w: 960, h: 1088 },
      form:
        'Two vent chimneys of unequal height fused at their crusted base, the taller one leaning ' +
        'slightly away from the shorter, both with ragged crystal-rimmed mouths, loose yellow ' +
        'crumbs around the foot. Slightly taller than it is wide.',
    },
    {
      // 2 — a collapsed vent: the wide, low member of the set. Round 1 showed
      // that a set of three uprights reads as one prop repeated; a broken one
      // changes the silhouette class, not just the detail.
      seed: 930317,
      gen: { w: 1152, h: 832 },
      form:
        // (Trimmed to fit the 1100-char budget; the first draft ran 1112.)
        'One low collapsed vent, its chimney broken away to leave a wide crusted crater rim with a ' +
        'dark open throat, thick yellow sulfur rind spilling over the near edge and a fallen chunk ' +
        'of the old chimney beside it. Wider than it is tall.',
    },
  ],
  maskFn: L.sulfurWeight,
  speckMinFrac: 0.006,
  tone: {
    targetLum: 55,
    tint: [1.0, 1.0, 1.0], // vent rock stays neutral; the fumarole floor is R/B 0.983
    minFactor: 0.3,
    maxFactor: 1.6,
    minBaseFrac: 0.25,
    overlay: {
      targetLum: 120, // dirty mustard, not fresh lemon — see the tone note above
      tint: [1.04, 0.99, 0.82],
      minFactor: 0.4,
      maxFactor: 2.2,
    },
  },
  check: {
    aspectMin: 0.45,
    aspectMax: 1.75,
    baseLumTol: 2.5,
    // 4.5, not the 8 this file first shipped with. The 8 was a guess and it
    // failed variants 0 and 1 at 5.7 % / 5.9 % — which the on-floor 4x sheet
    // then showed reading perfectly at the true 28 px draw size: a dark cone
    // with an unmistakable yellow crown. The reason the guess was wrong is that
    // `sulfurWeight` only counts CONFIDENT sulfur (bright, clearly yellow); the
    // dimmer crust in shadow reads as sulfur to the eye but scores below the
    // mask threshold, so the measured percentage systematically understates the
    // visible coverage. Judged against the sheet, not against the intuition.
    overlayMinPct: 4.5, // below this the vent does not read as sulfur at 28 px
    overlayMaxPct: 55, // above this it is a yellow blob, not a crusted rock
    overlayLumMin: 100,
    overlayLumMax: 145,
    fillMin: 0.2,
  },
  sheet: { biome: 'fumarole', heightFactor: 1 },
};

run(cfg).catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
