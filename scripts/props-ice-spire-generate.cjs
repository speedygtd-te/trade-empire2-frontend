/**
 * Asset-Pipeline: surface PROP sprites — ICE SPIRE / EISNADEL (the TALL-NARROW end).
 *
 *   ice_spire_0..3  ->  permafrost, tundra (planet types ICE / MOON_ICY),
 *                       optionally glacier — decided at the review sheet
 *
 * ── THE BRIEF
 *
 * Same round as ice_grit. Rudi: "es sieht jetzt sehr redundant alles aus" and
 * "zusätzlich auch mal auf einer kachel zwei unterschiedliche props … generier
 * ruhig ein paar mehr assets".
 *
 * ── WHAT THIS FAMILY IS FOR, AND IT IS NOT SIZE
 *
 * ice_grit answers the SIZE half of the redundancy (a rung below ice_rubble,
 * see that file's header for why the ±15 % instance scale cannot). This family
 * answers the SHAPE half, and the two are different problems:
 *
 * Measured on the shipped set, all five ice_rubble silhouettes are squat and
 * lying — aspect 1.27 .. 2.14, i.e. every one of them is WIDER than it is tall,
 * and at 144×72 device pixels they present the same low rounded mass. Adding a
 * sixth lump of the same proportions adds a variant and no variety. What the
 * frost biomes have none of is a VERTICAL element below sérac size: permafrost
 * and tundra are a field of things lying down.
 *
 * So the family is deliberately on the other side of aspect 1.0 — narrow
 * splinters tipped up, 0.30 .. 0.75 — which is the one silhouette property that
 * still reads after the @quarter mip at a 9 px draw height.
 *
 * ── TONE: 76, BETWEEN THE TWO SISTER FAMILIES AND JUSTIFIED AS SUCH
 *
 * ice_rubble 72 (lying, dust-stained) · ice_block 100 (a sérac, broad lit
 * planes) · this 76. Against the two target grounds that is 1.31× tundra (58.0)
 * and 1.50× permafrost (50.6) — above the lying rubble because an upright piece
 * catches the upper-left light on a steeper face, and still well below the
 * rejected rock_snow (1.68× / 1.93×). The decisive rock_snow defect was never
 * the level but the BLOWOUT of its snow caps (11.78 % of pixels over luminance
 * 200 against the tiles' 0.00 %); this family ships with maskFn null for the
 * same reason ice_rubble does — there is no bright sub-material to blow out.
 *
 * ── SIZE, RUN ON PAPER (LESSONS § 7)
 *
 * drawW = PROP_BASE_HEIGHT(28) × factor × aspect against TW = 48. Aspect band
 * 0.30..0.75, factor 0.32:
 *   drawH 9.0 px, drawW 2.7..6.7 px = 6..14 % of a tile.
 * Taller than ice_rubble (5.6) and well under ice_block (12.6), so the three
 * families form a real height ladder on a shared tile. Narrow enough that the
 * south-vertex overhang is drawW/2 + the 6.7 px x-jitter = 8.1..10.1 px against
 * the diamond's 24 px half width — no PROP_GROUND_INSET, it is a standing body.
 *
 * ── PROMPT RULES
 *
 * LESSONS § 3 in full, plus the two that cost the sister families a round each:
 *   - NOTHING UNDER THE OBJECT. No ground, no base, no "standing on", no
 *     "buried foot" — flux renders any underlay as a second body. Orientation
 *     is expressed through the object's own proportions ("its lower end narrow
 *     and ragged"), never through what it rests on.
 *   - NO BOX WORDS. block / slab / cube / plank produced cuboids on both frost
 *     families. splinter, shard, needle, spike and fin are safe.
 * Directed members lean towards the upper right
 * (feedback_asset_ausrichtung_links_unten). No negative prompts.
 *
 * Usage:
 *   node scripts/props-ice-spire-generate.cjs gen
 *   node scripts/props-ice-spire-generate.cjs gen 2 --seed 912029
 *   node scripts/props-ice-spire-generate.cjs validate | sheet
 * NOTE: `integrate` is DELIBERATELY NOT RUN in this round.
 */
const { run } = require('./props-family-runner.cjs');

// Built from ice_block's anchor (the standing-ice one) rather than
// ice_rubble's, because the subject is upright and has to be lit as such — but
// with ice_block's "buried foot" removed, since naming what is under the object
// is the documented way to get a second body rendered.
// ── ATTEMPT 1 RETURNED FOUR FLOATING SHARDS, AND THE ANCHOR SAID SO ──
//
// Variants 0/1/2 came back as blades hanging at 20-60 degrees off vertical with
// a narrow point at the bottom — objects in free fall, not objects standing.
// Variant 3, the only one that read as planted, was the only one whose FORM
// used the word "standing"; the other three inherited the anchor's "tipped up
// on end … leaning". At a bottom-centre ground anchor a sprite whose lowest
// pixel is a point balances on that point, which is the one silhouette a
// standing prop must not have.
//
// The fix is in the anchor, not in three forms: "standing upright, broadest at
// its foot" replaces "tipped up on end". Note what is NOT said — nothing about
// ground, base, pedestal or resting (LESSONS § 3: every mention of something
// UNDER the object is rendered as a second body, which cost the FROZEN round
// three of five sprites).
const ANCHOR =
  'Photorealistic photograph of a splinter of old glacier ice standing upright, one isolated object ' +
  'floating in mid-air against a plain flat uniform mid-grey seamless backdrop that continues ' +
  'unbroken behind it and below it, seen from a high three-quarter isometric angle looking down. ' +
  'It is taller than it is wide, its lower end snapped off square and blunt and widest there, ' +
  'narrowing upward to a ragged crest, its sides narrow fracture planes at uneven angles. The ice ' +
  'is dull greyish, finely granular and matt like ' +
  'old snow-ice, translucent along its thin broken edges and stained faint grey-brown with frozen ' +
  'grit. Soft directional light from the upper left, deep shadow on the lower-right side, dim moody ' +
  'lighting, matte, muted desaturated palette, only a faint cold blue cast, sharp focus, crisp ' +
  'clean silhouette, centred with a generous empty margin on every side.';

const cfg = {
  family: 'ice_spire',
  n: 4,
  mode: 'gen',
  anchor: ANCHOR,
  shapes: [
    {
      // 0 — the reference needle: ONE narrow splinter, leaning to the upper
      // right per the direction convention. The narrowest member; it sets the
      // bottom of the aspect band.
      // ATTEMPT 1 (seed 912007, canvas 768x1280) came back at aspect 0.25,
      // under the 0.28 floor: "three or four times as tall as it is wide" on a
      // 0.60 canvas is a needle, and at a 9 px draw height a 2 px wide sprite
      // is a hairline. Both numbers moved — the ask to "about twice as tall"
      // and the canvas to 0.74 — because the canvas aspect steers the returned
      // aspect at least as hard as the words do.
      seed: 912071,
      gen: { w: 896, h: 1216 },
      form:
        'One single splinter of ice standing on end, about twice as tall as it is wide, its foot wide ' +
        'and its crest tipped over towards the upper right.',
    },
    {
      // 1 — the UNEQUAL PAIR, the archetype that worked twice on ice_rubble: two
      // members of very different height tipped against each other. Reads as
      // broken-apart material without any word that can be swept into a prism.
      seed: 912019,
      gen: { w: 896, h: 1216 },
      form:
        // The anchor is 1000 chars, so a form over ~100 lands past the 1100
        // encoder budget and the runner refuses it before it costs a call.
        'Two splinters of ice of very different heights standing side by side and touching, the taller ' +
        'tipped towards the upper right, both of them wide at the foot.',
    },
    {
      // 2 — the FIN: the broad-based member, widest at the bottom and thinning
      // upward. The top of the aspect band, and the one that reads as a mass
      // rather than as a needle at a 9 px draw height.
      seed: 912083,
      gen: { w: 960, h: 1216 },
      form:
        'One single fin of ice standing upright, wide and knobbly across its lower half and thinning to ' +
        'a ragged crest at the top, one flank freshly broken away to glassy ice.',
    },
    {
      // 3 — the CLUSTER: three needles of different heights standing close. The
      // busiest silhouette of the family; it is what puts several upright
      // elements onto one tile without the layout having to draw three
      // instances.
      seed: 912043,
      gen: { w: 1024, h: 1152 },
      form:
        'Three upright ice needles of clearly different heights standing close together, each ' +
        'leaning at its own angle, the tallest towards the upper right, all of them narrow and ' +
        'ragged with blunt broken tops.',
    },
  ],
  // No overlay classifier — a bright sub-material here would be a snow cap, the
  // documented rock_snow defect.
  maskFn: null,
  speckMinFrac: 0.0025,
  tone: {
    targetLum: 76,
    // Between ice_rubble's [1.055, 1.0, 0.95] and ice_block's [1.085, 1.0,
    // 0.92], because the subject is between the two: upright glacier ice, but
    // standing on the warm brown grounds the rubble was toned for. Asking flux
    // for ice returns blue ice whatever the prompt says (LESSONS § 2).
    tint: [1.07, 1.0, 0.935],
    minFactor: 0.2,
    maxFactor: 2.5,
  },
  check: {
    // The POINT of the family: below 1.0, i.e. the other side of the shipped
    // frost sets. 0.80 is the ceiling — past it the piece stops reading as
    // upright at a 9 px draw height and becomes a fifth lump.
    aspectMin: 0.28,
    aspectMax: 0.8,
    baseLumTol: 3.0,
    // Between ice_rubble (0.85..1.06) and ice_block (0.80..0.98): the same
    // material seen on a steeper, better-lit face.
    baseRBMin: 0.82,
    baseRBMax: 1.0,
    // Variants 1 and 3 are legitimately several separated pieces in a tall box.
    fillMin: 0.18,
  },
  sheet: {
    biome: 'permafrost',
    heightFactor: 0.32,
  },
};

run(cfg).catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
