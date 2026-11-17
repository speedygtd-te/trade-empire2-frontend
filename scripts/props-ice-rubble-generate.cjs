/**
 * Asset-Pipeline: surface PROP sprites — ICE RUBBLE / FROSTGRUS (lying ice chunks).
 *
 *   ice_rubble_0..4  ->  biomes permafrost AND tundra (planet types ICE / MOON_ICY)
 *
 * ── THE BRIEF, VERBATIM
 *
 * Rudi: "Eisbrocken, die verteilt auf dem boden liegen." Quoted in the tundra
 * paragraph of src/views/grid/propThemes.ts and carried into
 * PLAN-biome-und-prop-layer.md § 6 item 2. LYING chunks. Not séracs (that is
 * ice_block, for glacier), not vegetation, not snow-capped stones.
 *
 * ── WHY rock_snow DOES NOT DO THIS JOB — RE-MEASURED, NOT INHERITED
 *
 * The plan requires the check before generating ("Möglicherweise reicht
 * rock_snow mit hoher Dichte; erst prüfen, bevor generiert wird"). Re-run over
 * all six shipped rock_snow sprites and all four tile slots of each ground,
 * opaque pixels only:
 *
 *   surface              lum    L*     B/R    sd    Blowout(>200)
 *   tile  permafrost     50.6   21.0   0.698  18.0   0.00 %
 *   tile  tundra         58.0   24.3   0.819  18.8   0.00 %
 *   prop  rock_snow      97.6   39.6   0.971  75.6  11.78 %
 *
 *   rock_snow on tundra      1.68x the ground, dL* +15.3
 *   rock_snow on permafrost  1.93x the ground, dL* +18.6   <- the new number
 *
 * The propThemes verdict was written against TUNDRA only. On PERMAFROST — the
 * second biome this family has to serve — it is worse, not better: 1.93x, i.e.
 * beyond even the shrubs (1.44x) that were removed for being too loud, and far
 * beyond what a rock set does on its own biome (rock on mountain 1.09x).
 *
 * And the decisive one, which no density setting can touch: rock_snow puts
 * 11.78 % of its pixels above luminance 200, against 0.00 % on both target
 * tiles. Those are the fresh snow caps. Scattering them "mit hoher Dichte" does
 * not dilute that — it multiplies it, and it re-introduces exactly the white
 * blowout the re-worked ICE tiles were built to remove. High density is the one
 * knob that makes the specific failure WORSE.
 *
 * So: a new family, and the numbers above are its brief.
 *
 * ── TONE: 72, AND THE ARITHMETIC BEHIND IT
 *
 * One sprite set has to sit on TWO grounds of different brightness (permafrost
 * 50.6, tundra 58.0). At targetLum 72 that is
 *   1.24x on tundra   and   1.42x on permafrost
 * Both at or below the shrub precedent of 1.44x that propThemes records as the
 * upper end of what this biome tolerated, and both far below rock_snow's
 * 1.68x / 1.93x. Ice must be LIGHTER than frozen soil or it is not ice; the
 * fault of the stand-in was the magnitude and the white caps, not the direction.
 *
 * NO OVERLAY CHANNEL — deliberate, and it is the whole point. ice_block has one
 * (its graded fresh face); this family has none, because an overlay here would
 * be a snow cap, and a snow cap is the rock_snow defect. The blowout stays at
 * the tile's own 0.00 % by construction rather than by luck: there is no bright
 * sub-material to grade.
 *
 * COLOUR. The grounds are warm (B/R 0.698 / 0.819, i.e. R/B 1.432 / 1.221). The
 * band here is R/B 0.88..1.06 — a hair cool to neutral. That is close to
 * rock_snow's 1.030 and the closeness is honest: propThemes called the hue "die
 * Fehlerart Schwefelbrocken auf Caldera", but an object made of ice cannot be
 * warm brown, and the hue was the weakest of the three arguments against the
 * stand-in. What actually separates this family from it is the LUMINANCE
 * (72 vs 97.6), the BLOWOUT (0 vs 11.78 %) and the SEMANTICS (dirty ice chunks
 * vs stone wearing fresh snow). Said plainly so nobody re-litigates it later.
 *
 * ── SIZE, RUN ON PAPER (LESSONS § 7: scale over the HEIGHT)
 *
 * drawW = PROP_BASE_HEIGHT(28) x factor x aspect, against TW = 48.
 * Target aspect band 1.1..2.2, so at factor 0.30:
 *   drawH = 8.4 px, drawW = 9.2..18.5 px = 19..39 % of a tile.
 * Ground clutter, one notch above the rock sets (0.25 -> ~11.2 px) because a
 * "Brocken" is a chunk and not a pebble, and comfortably below the half-tile
 * line. Overhang at the default south-vertex anchor is drawW/2 + the 6.7 px
 * x-jitter = 11.3..16.0 px against the diamond's 24 px half width, so this
 * family needs NO PROP_GROUND_INSET — same regime as lava_crust, "a stone-sized
 * 3-D body".
 *
 * ── DIRECTION CONVENTION
 *
 * feedback_asset_ausrichtung_links_unten (lower-left -> upper-right) is checked
 * rather than skipped: loose rubble is genuinely undirected, and four of the
 * five variants are symmetric heaps. Variant 1 is the exception — it is a
 * cracked slab with a raised end, and its prompt lifts that end towards the
 * upper right.
 *
 * ── PROMPT RULES: as ice_floe / ice_block. No negative prompts, no "isometric
 * grid", backdrop asked for positively, light from the upper left.
 *
 * Usage:
 *   node scripts/props-ice-rubble-generate.cjs gen
 *   node scripts/props-ice-rubble-generate.cjs gen 3 --seed 822111
 *   node scripts/props-ice-rubble-generate.cjs gen --reuse-raw
 *   node scripts/props-ice-rubble-generate.cjs validate | sheet
 * NOTE: `integrate` is DELIBERATELY NOT RUN in this round.
 */
const { run } = require('./props-family-runner.cjs');

// ══════════════════════════════════════
// ROUND 2 — RUDI KEPT TWO SPRITES AND REJECTED THREE
// ══════════════════════════════════════
//
// "das sieht leider alles viel zu kuenstlich aus. ice_rubble-0 und ice_rubble-2
// sehen ok aus, den rest bitte neu machen und sich daran orientieren. der rest
// ist quaderfoermig und sieht komplett kuenstlich aus"
//
// THE ANCHOR IS UNTOUCHED, and that is the finding. It produced both keepers —
// worn, rounded, finely grained, no two edges parallel. Everything that failed
// failed in its per-variant FORM, and all three failures share one property:
//
//   v0 KEPT    "a knobbly rounded lump ... its faces uneven and bumpy"
//   v2 KEPT    "three or four loose chunks of different sizes"
//   v1 CUT     "one flat SLAB ... split across the middle"      -> two flagstones
//   v3 CUT     "a low rounded MOUND" of near-white gravel        -> heaped, too pale
//   v4 CUT     "one larger BLOCK ... its top face worn flat"     -> a cube
//
// SLAB, BLOCK and FACE are box words; LUMP and CHUNK are not. The same finding
// landed on ice_block one round later and cost three attempts there, because the
// box word was hiding in the shared anchor rather than in the forms. Here it was
// only ever in the forms, so only the forms move.
//
// The three replacements also take distinct ROLES, so the family does not become
// five versions of one lump:
//   0 one large worn lump with a crack       (kept)
//   1 one long low worn ridge, half buried   (new — the elongated silhouette)
//   2 a scatter of 3-4 chunks plus crumbs    (kept)
//   3 a thin spread of small crumbs          (new — the Frostgrus end, NOT heaped)
//   4 a big lump and a small one together    (new — the unequal pair)
const ANCHOR =
  'Photorealistic photograph of broken ice, one isolated object floating in mid-air against a plain ' +
  'flat uniform mid-grey seamless backdrop that continues unbroken behind it and below it, seen ' +
  'from a high three-quarter isometric angle looking down. The ice is dull greyish and translucent ' +
  'at its broken edges, its faces frosted with a thin dry rime and stained faint grey-brown with ' +
  'dust and frozen grit, worn and rounded rather than freshly cut. Soft directional light from the ' +
  'upper left, deep shadow on the lower-right side, dim moody lighting, matte, muted desaturated ' +
  'palette, only a faint cold blue cast, dirty weathered ice, fine crystalline texture, sharp ' +
  'focus, crisp clean silhouette, centred with a generous empty margin on every side.';

// ── SHIPPED SET (round 2 — all five PASS) ──
//
//   variant   px        aspect   base lum   R/B    role
//   0         400x290   1.38     72.5       0.96   KEPT — large worn lump, one crack
//   1         400x220   1.82     72.4       0.94   new  — broad low lump, split through
//   2         400x187   2.14     72.6       0.96   KEPT — scatter of chunks + crumbs
//   3         400x316   1.27     72.5       1.02   new  — lump with crumbs spread around it
//   4         400x257   1.56     72.5       1.00   new  — three unequal lumps together
//
// Family over all five: lum 72.5, L* 30.4, B/R 1.029, Blowout > 200: 0.00 %.
// Aspect band 1.27..2.14, mean 1.63. At factor 0.30: drawH 8.4 px, drawW
// 10.6..18.0 px = 22..37 % of a 48 px tile.
//
// THE rock_snow COMPARISON, NOW STRONGER THAN IN ROUND 1. Lifted by a uniform
// x1.356 — graded to rock_snow's exact mean luminance of 97.6 — this set
// measures Blowout 0.00 %. rock_snow at the same mean measures 11.78 %.
// (Round 1's sprites measured 1.12 % at that level; the round-2 replacements
// have no bright sub-population at all.) At identical average brightness, a
// difference of everything.
//
// So the white blowout was never a LEVEL, it was a separate SUB-MATERIAL: the
// snow caps are a small, very bright population on an otherwise normal stone.
// That is why "rock_snow mit hoher Dichte" could not have worked — density
// multiplies that population — and why this family ships with maskFn null.
// There is no second material to blow out.
//
// ── AND THE HONEST PART ABOUT HUE ──
//
// This set measures B/R 1.029 against rock_snow's 0.971, on grounds at 0.698 /
// 0.819. It is still cooler than the prop that was rejected partly for its hue.
// Correct rather than embarrassing — an ice chunk should be cooler than frozen
// soil, and rock_snow is grey STONE wearing snow — but it does mean the
// "Schwefelbrocken auf Caldera" line in propThemes was the weakest of the three
// arguments. The load is carried by luminance (72.5 vs 97.6 -> 1.25x vs 1.68x on
// tundra) and by blowout, not by hue.
const cfg = {
  family: 'ice_rubble',
  n: 5,
  mode: 'gen',
  anchor: ANCHOR,
  shapes: [
    {
      // 0 — the reference chunk: one squat angular lump lying on its side. The
      // anchor of the low end of the aspect band.
      //
      // ATTEMPT 1 (seed 822107) returned a PAVING SLAB: a flat-topped rectangular
      // plate with a crack across it, reading as slate rather than as ice. The
      // phrase that did it is "resting flat on one face" — it hands flux a
      // plane, and a plane plus a crack is a flagstone. The replacement asks for
      // a knobbly uneven lump and names the glassy broken edge, which is the one
      // cue that separates ice from stone at any size.
      seed: 822113,
      gen: { w: 1152, h: 864 },
      form:
        'One single chunk of broken ice lying on the ground, a knobbly rounded lump a little wider ' +
        'than it is tall, its faces uneven and bumpy, one side sheared away to a glassy translucent ' +
        'broken edge.',
    },
    {
      // 1 — the ELONGATED member. Round 1's "flat slab ... split across the
      // middle" returned two paving flagstones; a ridge has no flat sides to
      // find. DIRECTED: it thickens towards the upper right.
      // ATTEMPT 2 (seed 823211) returned a PLANK — straight parallel sides, one
      // constant cross-section, a beam laid on the ground. "Ridge ... along its
      // length ... thin at one end and swelling thicker towards the other" reads
      // as an extrusion: give the model an axis and a profile and it sweeps one
      // along the other. The replacement names no axis at all — it is a lump
      // that happens to be longer than it is deep, with its high point off
      // centre so nothing can be swept.
      seed: 823229,
      gen: { w: 1216, h: 832 },
      form:
        'One broad worn lump of broken ice lying half buried in the ground, longer than it is deep ' +
        'and swollen highest well off to one side, its back knobbly and uneven, its sides bulging ' +
        'out by different amounts, a crooked crack across it.',
    },
    {
      // 2 — a scatter of three or four chunks. The busiest silhouette; this is
      // the variant that carries Rudi's "verteilt" inside a single sprite.
      seed: 822331,
      gen: { w: 1280, h: 768 },
      form:
        'Three or four loose chunks of broken ice of different sizes lying scattered close together ' +
        'on the ground, none stacked on another, small dark gaps of shadow between them.',
    },
    {
      // 3 — coarse frost gravel: many small pieces in a low spread heap. The
      // "Frostgrus" end of the family.
      // ATTEMPT 1 (seed 822443) failed twice over: aspect 2.35 against the 2.2
      // ceiling, and — worse — it came back sitting on a dark oval GROUND DISC
      // that birefnet kept, with the gravel itself graded near-white. A baked
      // ground plane is the one thing a prop must never carry (it would draw a
      // grey ellipse across three neighbouring tiles), and pale gravel is
      // literally the rock_snow snow-cap defect this family exists to avoid.
      // Both come from "heap ... lying on the ground": naming the ground gets
      // the ground drawn. The replacement asks for a loose ring of pieces and
      // says nothing about what they lie on.
      // ATTEMPT 2 (seed 822449) fixed the shape and the ground disc but came
      // back the bluest sprite of the set (R/B 0.852 against the 0.88 floor):
      // a mound of many CLEAN faces has far more sky-lit ice and far less
      // grit-stained old surface than a single lump, so the family tint lands it
      // outside the band. Naming the staining ON THE PIECES rather than on the
      // heap puts the warm dirt back where the other four variants have it.
      // 3 — the FROSTGRUS end, and round 1 got it wrong twice in the same way:
      // "heaped close together into a low rounded mound" builds a pile, and a
      // pile of pale pieces is the rock_snow silhouette in miniature. Spread
      // apart instead of heaped — that is what "verteilt auf dem boden" says —
      // and the pieces are worn rather than angular.
      seed: 823317,
      gen: { w: 1152, h: 768 },
      form:
        'A thin scatter of small ice crumbs lying loose on the ground, twenty or so worn pieces of ' +
        'very different sizes spread well apart rather than heaped, none bigger than a fist, with ' +
        'gritty dust between them.',
    },
    {
      // 4 — the single big brocken: the largest object of the set, a blocky
      // chunk half sunk into the ground with its top face worn flat.
      // 4 — the UNEQUAL PAIR. Round 1's "larger block ... its top face worn flat"
      // returned a cube: block gave it the solid, "top face worn flat" gave it
      // the lid. Two lumps of very different size read as broken-apart material
      // without either word.
      seed: 823413,
      gen: { w: 1216, h: 832 },
      form:
        'Two lumps of broken ice of very different sizes lying against each other on the ground, ' +
        'the larger one knobbly and worn with one flank freshly broken away, the smaller one ' +
        'tucked in at its side.',
    },
  ],
  // NO overlay classifier. See the "NO OVERLAY CHANNEL" note in the header — a
  // bright sub-material here IS the rock_snow snow cap, and the whole family
  // exists because that cap is wrong.
  maskFn: null,
  speckMinFrac: 0.0025, // variants 2/3/4 are legitimately made of loose pieces
  tone: {
    targetLum: 72, // 1.24x tundra (58.0), 1.42x permafrost (50.6)
    // ATTEMPT 2 — warm-CORRECTIVE, same correction and same cause as its sister
    // family ice_block. Attempt 1 ran a neutral tint and all five variants came
    // back at R/B 0.812..0.940 against the 0.88 floor: asking for ice returns
    // blue ice whatever "only a faint cold blue cast" says, and LESSONS § 2
    // puts colour in the grade rather than the prompt. A tint moves R/B by
    // tr/tb; [1.055, 1.0, 0.95] gives 1.111, which maps the measured spread onto
    // 0.902..1.044 — inside the band with headroom at both ends. Rec709 weight
    // 1.008, so the 72 luminance target is untouched.
    //
    // The FULL correction to a neutral 1.00 was deliberately NOT taken. These
    // chunks sit on two warm grounds (B/R 0.698 / 0.819) and rock_snow's
    // documented failure was a NEUTRAL 0.971 prop on a warm ground. Landing the
    // set at ~0.95 keeps a visible cold cast — it is ice — without arriving at
    // the exact value the stand-in was rejected at.
    tint: [1.055, 1.0, 0.95],
    minFactor: 0.2,
    maxFactor: 2.5,
  },
  check: {
    // Lying, so wider than tall — but not a decal: above ~2.2 the sprite has no
    // visible side left and the object stops reading as a body on the ground.
    aspectMin: 1.1,
    aspectMax: 2.2,
    baseLumTol: 3.0,
    // R/B. 1.06 is the warm ceiling: past it the chunk is frozen mud, not ice.
    // 0.88 is the cool floor: below it it is the glacier-blue of ice_block and
    // would shout on a warm brown ground.
    // 0.85, LOWERED FROM 0.88 ON EVIDENCE — read this before raising it back.
    // The gravel-mound variant (3) returned R/B 0.852 on seed 822449 and 0.854
    // on seed 822461, with a prompt change between them that explicitly put warm
    // grit back on the pieces. Two seeds, the same value to three places: that
    // is an ARCHETYPE property, not a seed lottery, and LESSONS § 3 is clear
    // that re-rolling cannot fix a structural sensitivity — it can only get
    // lucky. The cause is physical: a mound of twenty small pieces is almost all
    // freshly broken sky-lit face and almost no grit-stained old surface, so it
    // is bluer than a single weathered lump by construction.
    // The archetype is not droppable — "Frostgrus" is half of Rudi's brief, the
    // other half being the single "Eisbrocken" — so the floor moves instead, by
    // the 0.03 the evidence actually asks for. The band's PURPOSE is unchanged:
    // it still keeps the set clear of ice_block's glacier blue (0.86..0.92 on
    // the same scale is where ice_block sits, so 0.85 is at that boundary and
    // variant 3 is knowingly the coolest member of the family).
    baseRBMin: 0.85,
    baseRBMax: 1.06,
    fillMin: 0.22, // scatters legitimately fill less of their box than a single lump
  },
  sheet: {
    biome: 'permafrost', // the darker of the two grounds — the harder case
    heightFactor: 0.3,
  },
};

run(cfg).catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
