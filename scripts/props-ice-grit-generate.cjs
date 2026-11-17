/**
 * Asset-Pipeline: surface PROP sprites — ICE GRIT / EISSPLITT (the SMALL end).
 *
 *   ice_grit_0..4  ->  glacier, permafrost, tundra (planet types ICE / MOON_ICY)
 *
 * ── THE BRIEF, VERBATIM
 *
 * Rudi, 2026-09-11, after the frost props went live on Moon Icy: "es sieht
 * grundsätzlich gut aus, aber etwas zu gleichmäßig … es sieht jetzt sehr
 * redundant alles aus", and then "zusätzlich auch mal auf einer kachel zwei
 * unterschiedliche props oder auch mal drei. generier ruhig ein paar mehr
 * assets und leg auf eine kachel einfach mehrere props".
 *
 * ── WHY A NEW FAMILY AND NOT A SMALLER HEIGHT FACTOR ON ice_rubble
 *
 * This is the one thing that has to be said first, because it looks like
 * duplication and is not. The renderer normalises EVERY sprite to the same
 * drawH (PROP_BASE_HEIGHT × scale) and derives the width from the aspect, so
 * "make it smaller" is only ever a FACTOR change — and a factor change applies
 * to the whole family. The instance scale range is PROP_SCALE_MIN 0.85 ..
 * PROP_SCALE_MAX 1.15, i.e. ±15 %: measured on the shipped ice_rubble that is
 * a drawH spread of 4.8 .. 6.4 CSS px. At 144×72 device pixels that is a
 * difference of 4.8 device px on a 17 px object — below the threshold at which
 * two instances read as different sizes. **The shipped layer therefore has no
 * size staggering at all**, and the ±15 % cannot produce any.
 *
 * A second family with its own height factor is the only lever that does:
 *   ice_grit at 0.12   drawH  3.4 CSS / 10 device px
 *   ice_rubble at 0.20 drawH  5.6 CSS / 17 device px
 *   ice_block at 0.45  drawH 12.6 CSS / 38 device px
 * Three clearly separated rungs on one tile, which is what "zwei oder drei
 * props" needs in order not to read as three copies of one thing.
 *
 * ── AND WHY THE MOTIF IS *FEWER* PIECES, NOT MORE
 *
 * The obvious idea — "fine grit = many tiny crumbs in one sprite" — is wrong at
 * this size and ice_rubble_3 already occupies it. At drawH 10 device px a
 * 400-px sprite is downscaled 40×; twenty pieces become one grey smudge (the
 * micro8 finding of LESSONS § 5: few broad forms survive a mip, many fine ones
 * do not). So this family is ONE or TWO small angular chips per sprite — the
 * simplest silhouette in the whole frost set, chosen so that it still reads as
 * a *shape* after the @quarter mip and the draw-size resize.
 *
 * ── TONE: 72, INHERITED DELIBERATELY
 *
 * Same targetLum and the same warm-corrective tint as ice_rubble. These two
 * families land on the same tiles and often on the same tile, so they must be
 * the same MATERIAL at different sizes — a second tone would read as two
 * different substances scattered together. 72 is 1.24× tundra (58.0) and 1.42×
 * permafrost (50.6); the derivation is in props-ice-rubble-generate.cjs and is
 * not re-litigated here.
 *
 * ── SIZE, RUN ON PAPER (LESSONS § 7: scale over the HEIGHT)
 *
 * drawW = PROP_BASE_HEIGHT(28) × factor × aspect against TW = 48. Aspect band
 * 1.0..2.0, factor 0.12:
 *   drawH 3.4 px, drawW 3.4..6.7 px = 7..14 % of a tile.
 * Below the rock sets (0.25 → ~11 px wide, 23 %) by design: this is the rung
 * BELOW ground clutter. Overhang at the south-vertex anchor is drawW/2 + the
 * 6.7 px x-jitter = 8.4..10.1 px against the diamond's 24 px half width, so no
 * PROP_GROUND_INSET — it is a small body standing on the ground, not a decal.
 *
 * ── PROMPT RULES
 *
 * LESSONS § 3, all of them, and two that cost the sister families a round each:
 *   - NOTHING UNDER THE OBJECT. No "lying on the ground", no "resting on",
 *     no heap "on" anything: flux renders the underlay as a second body and
 *     birefnet keeps it (ice_rubble variant 3, attempt 1: a dark oval ground
 *     disc). The object is freestanding against the backdrop, full stop.
 *   - NO BOX WORDS. slab / block / face / plank / beam / cube all returned
 *     cuboids across ice_rubble and ice_block. chip, splinter, shard, lump are
 *     safe; "chip" is the word this family is built on.
 * No negative prompts, light from the upper left, generous margin.
 *
 * Usage:
 *   node scripts/props-ice-grit-generate.cjs gen
 *   node scripts/props-ice-grit-generate.cjs gen 3 --seed 911003
 *   node scripts/props-ice-grit-generate.cjs validate | sheet
 * NOTE: `integrate` is DELIBERATELY NOT RUN in this round — the sprites go to
 * assets/final/ and onto the review sheet first.
 */
const { run } = require('./props-family-runner.cjs');

// Inherited verbatim from ice_rubble: same material, same light, same backdrop
// wording (the one that stopped producing ground discs), only the forms differ.
const ANCHOR =
  'Photorealistic photograph of broken ice, one isolated object floating in mid-air against a plain ' +
  'flat uniform mid-grey seamless backdrop that continues unbroken behind it and below it, seen ' +
  'from a high three-quarter isometric angle looking down. The ice is dull greyish and translucent ' +
  'at its broken edges, its faces frosted with a thin dry rime and stained faint grey-brown with ' +
  'dust and frozen grit, worn and rounded rather than freshly cut. Soft directional light from the ' +
  'upper left, deep shadow on the lower-right side, dim moody lighting, matte, muted desaturated ' +
  'palette, only a faint cold blue cast, dirty weathered ice, fine crystalline texture, sharp ' +
  'focus, crisp clean silhouette, centred with a generous empty margin on every side.';

const cfg = {
  family: 'ice_grit',
  n: 5,
  mode: 'gen',
  anchor: ANCHOR,
  shapes: [
    {
      // 0 — the reference chip: ONE small worn piece, squat, nearly as tall as
      // wide. The simplest silhouette in the frost set; it has to survive a 40×
      // downscale, so it carries no internal detail worth losing.
      seed: 911003,
      gen: { w: 1024, h: 1024 },
      form:
        'One single small worn chip of broken ice, roughly a hand span across, knobbly and uneven ' +
        'with one glassy translucent broken edge, a little wider than it is tall.',
    },
    {
      // 1 — the PAIR: two chips of unequal size leaning together. Gives the
      // family a second silhouette without adding a third size class.
      seed: 911017,
      gen: { w: 1152, h: 896 },
      form:
        'Two small worn chips of broken ice of unequal size tipped against each other, the larger ' +
        'one knobbly with a glassy broken edge, the smaller one tucked at its side, a narrow dark ' +
        'gap of shadow between them.',
    },
    {
      // 2 — the ELONGATED chip, and it is DIRECTED per
      // feedback_asset_ausrichtung_links_unten: it thickens towards the upper
      // right. Named as a swelling rather than as an axis, because ice_rubble
      // variant 1 proved that an axis plus a profile gets swept into a plank.
      seed: 911029,
      gen: { w: 1216, h: 832 },
      form:
        'One single small worn shard of broken ice, longer than it is deep and thicker towards its ' +
        'upper right end, its back bumpy and its sides bulging by different amounts, one crooked ' +
        'glassy break across it.',
    },
    {
      // 3 — the ANGULAR chip: the one member with visible straight breaks, so
      // the family is not five pebbles. "shard" and "splinter" rather than any
      // box word — see the prompt rules in the header.
      seed: 911041,
      gen: { w: 1024, h: 1024 },
      form:
        'One single small angular splinter of broken ice, wedge shaped with two clean glassy ' +
        'fracture planes meeting at a blunt point, its remaining surfaces frosted and dulled.',
    },
    {
      // 4 — the TRIPLE: three very small chips spread apart rather than heaped.
      // The most "verteilt" member, and the closest this family comes to
      // ice_rubble_2 — kept deliberately smaller and emptier so the two do not
      // become the same sprite at two sizes.
      seed: 911053,
      gen: { w: 1216, h: 832 },
      form:
        'Three very small worn chips of broken ice spread apart from one another rather than ' +
        'touching, each no bigger than a fist, of slightly different sizes, with gritty frozen dust ' +
        'in the spaces between them.',
    },
  ],
  // No overlay classifier, for the reason ice_rubble states: a bright
  // sub-material on this family IS the rock_snow snow cap.
  maskFn: null,
  speckMinFrac: 0.0025,
  tone: {
    targetLum: 72,
    // The warm-corrective tint of the sister family, unchanged. Asking flux for
    // ice returns blue ice whatever the prompt says (LESSONS § 2: colour comes
    // from the grade), and these chips sit on warm grounds (B/R 0.698 / 0.819).
    tint: [1.055, 1.0, 0.95],
    minFactor: 0.2,
    maxFactor: 2.5,
  },
  check: {
    // A chip is a small BODY, so it may be close to square — unlike ice_rubble,
    // whose 1.1 floor exists to keep it lying down. The ceiling stays at 2.2
    // for the same reason: past it there is no visible side left.
    aspectMin: 0.85,
    aspectMax: 2.2,
    baseLumTol: 3.0,
    // Identical band to ice_rubble — same material, so the same colour gate.
    baseRBMin: 0.85,
    baseRBMax: 1.06,
    // Variants 1 and 4 are legitimately two or three separated pieces.
    fillMin: 0.2,
  },
  sheet: {
    biome: 'permafrost',
    heightFactor: 0.12,
  },
};

run(cfg).catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
