/**
 * PARAMETERISED WATER-TILE GRADE + INTEGRATION (local only, NO fal.ai).
 *
 * Brings OCEAN-planet / ICE water biomes into the dark redesign by a purely
 * POINTWISE colour grade of an existing 4-slot source set, then integrates the
 * result into src/assets/tiles/<biome>/ with the full mip set, and writes
 * review sheets into assets/style-test/tiles/.
 *
 * Biomes (see CONFIG below):
 *   deep_ocean     <- src/assets/tiles/ocean/ocean_N.webp          (pure grade)
 *   shallow_water  <- assets/style-test/tiles/shallow_water_kN.png (kontext out)
 *   ice_shelf      <- assets/style-test/tiles/ice_shelf_kN.png     (kontext out)
 *   reef           <- assets/style-test/tiles/reef_kN.png          (kontext out)
 *   kelp_forest    <- assets/style-test/tiles/kelp_forest_kN.png   (kontext out)
 *   island         <- src/assets/tiles/beach/beach_N.webp          (pure grade)
 *
 * OCEAN-PLANET SEPARATION (the constraint that shaped the targets below)
 * deep_ocean, shallow_water, reef, island, kelp_forest and volcanic_vent all
 * appear NEXT TO EACH OTHER on one planet, so they have to be told apart at a
 * glance. Brightness alone cannot carry that -- reef 28 and kelp_forest 30 are
 * nearly the same level -- so each biome is separated on TWO axes at once:
 *   deep_ocean    15.8  near-black blue-green, no structure
 *   reef          28    blue-teal water + muted warm coral colour + coral lumps
 *   kelp_forest   30    green-olive teal, big frond shapes, no bottom visible
 *   shallow_water 40    pale green-grey sand bottom, seagrass, light reflexes
 *   island        24    WARM golden-brown sand -- the only land tile
 *   volcanic_vent 29-37 strongly orange/red (already shipped)
 * reef is kept BLUE-dominant on purpose so its warm coral accents cannot be
 * confused with volcanic_vent's orange, and kelp_forest is pushed GREEN so it
 * separates from reef by hue where it cannot separate by level.
 *
 * HARD RULES (repo lessons -- do not change):
 *  - NO divide-by-blur / 2D equalisation. Every operation here is POINTWISE
 *    (per-pixel, position independent), so the diamond rim can never be
 *    over-brightened (that was the toxic_marsh / gold-rim failure mode).
 *  - ALPHA IS NEVER TOUCHED. Only pixels with alpha >= 1 are graded, the alpha
 *    channel is copied verbatim, and the result is verified byte-wise against
 *    the source alpha (and again after the webp round-trip).
 *  - Slots 2/3 are NOT re-flipped -- the flip already lives in the sources.
 *
 * OPTIONAL PRE-PASS -- SLOT WHITE BALANCE (cfg.wbSlots)
 *   The four slots of a kontext biome come back with different colour casts,
 *   because each slot is its own generation. The level solve below pins each
 *   slot's BRIGHTNESS but not its hue, so without this pre-pass the finished set
 *   lays out as a visible patchwork of warm and cold tiles (reef came back with
 *   10 levels of blue between slot 2 and slot 1). wbSlots computes the interior
 *   channel means of all four slots, averages them into a family reference, and
 *   applies one uniform per-channel gain per slot to pull each onto it. Uniform
 *   gain = pointwise = the diamond rim is safe. Clamped to [0.8, 1.25] so a
 *   genuinely odd slot is nudged rather than forced.
 *
 * GRADE PIPELINE (per pixel, alpha >= 1):
 *   1. desaturate  c' = L + desat * (c - L)             L = Rec709 luma of px
 *   2. tint+level  c'' = c' * tint[c] * G               G solved by bisection
 *   3. contrast    c''' = mean[c] + k * (c'' - mean[c]) mean = interior mean
 *   Step 3 preserves the interior channel means, so 2 and 3 do not fight.
 *
 * THE TARGET IS MEASURED ON THE SHIPPED .webp, NOT ON THE GRADED BUFFER.
 *   libwebp does not preserve RGB underneath fully transparent pixels (exact is
 *   off), so the diamond's 0/0/0 corners come back as roughly 3/3/3 after the
 *   round trip. The corners are 49.6% of the canvas, so that alone lifts the
 *   canvas metric by ~1.5 -- reef graded to 28.0 measured 29.5 once integrated.
 *   Sources that were already .webp (deep_ocean from ocean, island from beach)
 *   carry those ~3/3/3 corners in from the start and show no shift at all, which
 *   is why the effect only appeared on the kontext biomes and why the published
 *   deep_ocean/shallow_water numbers were never affected. cfg.target is therefore
 *   stated in GRADED-BUFFER terms and cfg.shipTarget, when present, records where
 *   the integrated file must land; integrate() re-opens every written .webp and
 *   prints its real canvas luma against cfg.band.
 *
 * METRIC (matches the numbers the brief was written in):
 *   "canvas" = mean over ALL 512x256 pixels incl. the transparent diamond
 *   corners, Rec709 luma of the channel means, sd = mean of the three
 *   whole-canvas channel stdevs. Interior-only stats are reported alongside
 *   because the canvas metric is diluted ~x0.504 by the transparent corners.
 *
 * Usage:
 *   node scripts/tiles-water-grade.cjs deep_ocean
 *   node scripts/tiles-water-grade.cjs deep_ocean shallow_water ice_shelf
 *   node scripts/tiles-water-grade.cjs deep_ocean --measure-only
 *   node scripts/tiles-water-grade.cjs deep_ocean --no-integrate
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const TILE_W = 512, TILE_H = 256;
const ROOT = path.join(__dirname, '..');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');

const MIPS = [
  { suffix: '@half', w: 256, h: 128 },
  { suffix: '@quarter', w: 128, h: 64 },
  { suffix: '@eighth', w: 64, h: 32 },
];
const WEBP = { quality: 90, effort: 4, smartSubsample: true };

// ---------------------------------------------------------------- CONFIG ----
const CONFIG = {
  // Rudi's recycling idea: deep_ocean re-uses the finished EARTH_LIKE ocean
  // slots. The two biomes can never meet on one planet (ocean = EARTH_LIKE,
  // deep_ocean = planet type OCEAN), so the reuse cannot read as a duplicate.
  // Depth grade: darker, slightly desaturated, red pulled down harder than
  // blue (water absorbs red first) -> blue-black. Foam streaks must darken to
  // grey, NOT disappear.
  deep_ocean: {
    src: (n) => path.join(TILES, 'ocean', `ocean_${n}.webp`),
    srcLabel: 'src/assets/tiles/ocean/ocean_N.webp',
    desat: 0.85,
    tint: { r: 0.80, g: 0.98, b: 1.06 },
    contrastK: 0.95,
    anchor: 'canvasLum',
    target: 16.0,
    band: [15, 18],
  },
  // shallow_water: kontext has added sand / stones / shells / plants on the
  // bottom. The grade knocks the loud clean turquoise of the original down
  // into the dirty redesign palette. Bottom structure must stay readable, so
  // no contrast reduction (k = 1) -- only level + saturation come down.
  shallow_water: {
    src: (n) => path.join(ST, `shallow_water_k${n}.png`),
    srcLabel: 'assets/style-test/tiles/shallow_water_kN.png (kontext)',
    // desat 0.60 + tint R1.18 turned the caustic highlights PINK/salmon (the
    // desaturation already lifts R towards luma, the warm tint then pushed the
    // brights past neutral). Near-neutral gains with a hair less green-blue
    // give the dirty muted teal without the colour cast.
    desat: 0.55,
    tint: { r: 0.95, g: 1.00, b: 0.95 },
    contrastK: 1.0,
    anchor: 'canvasLum',
    target: 50.0,
    band: [46, 54],
  },
  // PREVIEW ONLY (never integrated): what shallow_water would look like from a
  // pure grade of its untouched original, i.e. the fallback if the kontext
  // sea-floor content cannot be landed. Same target band as shallow_water so
  // the two options are directly comparable.
  shallow_water_orig: {
    src: (n) => path.join(TILES, 'shallow_water', `shallow_water_${n}.webp`),
    srcLabel: 'src/assets/tiles/shallow_water/shallow_water_N.webp (untouched original)',
    desat: 0.55,
    tint: { r: 0.95, g: 1.00, b: 0.95 },
    contrastK: 1.0,
    anchor: 'canvasLum',
    target: 50.0,
    band: [46, 54],
    previewOnly: true,
  },
  // ice_shelf: kontext has added drifting floes / tabular ice on open dark
  // water. The grade anchors the WATER portion (dark half of the histogram),
  // not the tile mean, so the floes stay bright -- the water/ice contrast is
  // the whole point of the biome.
  ice_shelf: {
    src: (n) => path.join(ST, `ice_shelf_k${n}.png`),
    srcLabel: 'assets/style-test/tiles/ice_shelf_kN.png (kontext)',
    // TWO anchors: the kontext slots came back with water levels between 22 and
    // 34, so a single mean/water gain gave slot2 a small factor that crushed its
    // floes to mid grey while slot0's stayed bright -- four slots that no longer
    // matched. Pinning water AND ice level per slot removes that spread.
    desat: 0.80,
    tint: { r: 0.88, g: 0.99, b: 1.05 },
    contrastK: 1.0,
    anchor: 'twoPoint',
    target: 20.0,     // open water, same class as deep_ocean's 16
    band: [18, 22],
    targetHi: 76.0,   // floes -- eyeballed on the contact sheet, ~3.8x the water
    bandHi: [72, 80],
  },
  // reef: kontext has grown a coral carpet on the ocean base, but it returned it
  // as a DRY, sandy, warm-beige reef (that was the price of getting pigment into
  // it at all -- see the P_REEF v1..v4 history in tiles-water-kontext.cjs). The
  // grade is what puts it back under water, and the two settings do exactly that:
  //   tint R0.66 B1.42 is a strong red-down / blue-up gain, which is physically
  //     what a metre of water does to daylight. It is also the separation from
  //     ISLAND, which is warm sand on the same planet and would otherwise be
  //     reef's twin, and from VOLCANIC_VENT's orange.
  //   desat 2.05 was well ABOVE 1, i.e. it INCREASED saturation, to stop the
  //     coral reading as grey gravel after the blue gain.
  //
  // ROUND 5 (2026-08-25) -- "reef ist zu lila" (Rudi). REVERSED, and the reason
  // is worth keeping because it is a trap this pipeline can fall into again.
  //   THE MEASUREMENT. The round-4 tile shipped at interior rgb 51/53/55, i.e.
  //   B/R = 1.09: not blue at all, effectively NEUTRAL GREY. Against a neutral
  //   ground every scrap of remaining pigment dominates, so the rose coral heads
  //   read as violet. The tile was never "too purple" -- it was too GREY, and the
  //   violet was the symptom.
  //   THE CAUSE. desat 2.05 and tint B/R 2.15 were pulling against each other.
  //   The source is a DRY warm reef (interior 123.6/110.1/90.7, B/R 0.73); the
  //   chroma boost pushed it further warm (B/R 0.505) and the blue tint then had
  //   to spend all of its authority just clawing back to neutral. Two strong
  //   settings, no net colour.
  //   THE FIX is arithmetic, not taste. The grade's channel means are predictable:
  //   with contrastK = 1 the mean of channel c is (Lm + desat*(m_c - Lm)) * tint_c
  //   * G, so the output B/R follows in closed form from the source means. That
  //   model reproduced the shipped 1.089 to three digits, so the new settings were
  //   SOLVED for the target rather than dialled in: desat 1.15 with tint
  //   0.60/1.06/1.55 lands B/R 1.807 and G/R 1.552 on the first try.
  //   WHERE IT SITS. B/R 1.81 puts reef between shallow_water (1.77) and
  //   deep_ocean (2.66) -- "medium shallow water", as asked. G/R 1.55 keeps B a
  //   little above G, so reef is BLUE-leaning cyan where shallow_water is neutral
  //   cyan (G ~ B); that hue difference is a second separation axis against the
  //   new risk pair, on top of the level gap (28 vs 39).
  //
  // ROUND 6 (2026-08-25) -- the hue gap widened, G pulled down. Round 5 landed
  //   B/R 1.82 next to shallow_water's 1.77, and the pair check said out loud what
  //   that means: level x1.42, hue dB/R 0.05, play-scale structure x1.01. Two of
  //   the three separation axes were flat -- reef and shallow_water were being told
  //   apart by BRIGHTNESS ALONE, which is exactly the one-legged separation the
  //   header warns about, and it is the leg that goes first under the surface
  //   darkening / cloud overlay. Compare the pair that does work, volcanic_vent vs
  //   deep_ocean: level x1.35 but dB/R 0.69 and structure x1.99.
  //   B/R was already right (1.82 = "medium shallow water"), so the axis with room
  //   in it was GREEN. reef sat at G/R 1.56 against shallow_water's 1.72: both read
  //   as cyan, and cyan next to cyan is one hue. Dropping reef to G/R 1.42 at an
  //   UNCHANGED B/R 1.82 pushes B decisively clear of G, so reef reads BLUE and
  //   shallow_water stays CYAN -- a named colour difference, not a nuance.
  //   tint 0.641/1.039/1.670 is the solve for that pair of targets. Its Rec709
  //   weight is 0.9999 against round 5's 0.9976, i.e. the rotation is luma-neutral
  //   by construction and the level solve barely moves; canvas stays 28.0 and the
  //   family ladder (15.8 / 21.2 / 24.6 / 28.0 / 29.9 / 39.8) is untouched.
  //   The olive-drift warning below still binds and is now the tighter constraint:
  //   G/R must not walk back UP towards kelp_forest, and it must not be bought by
  //   dropping desat, which is what carries the coral/weed variation.
  //   desat 1.15 rather than lower: 0.85 / 1.15 / 1.60 were rendered side by side
  //   at the same solved B/R, and 1.15 is the point where the olive weed between
  //   the colonies still separates from the blue-grey boulder heads. That
  //   variation is what stops reef reading as one flat sheet of blue, and it costs
  //   nothing in "buntes Riff" -- the coral remains legible as STRUCTURE, which is
  //   luminance and which desat does not touch at all.
  //   The old olive-drift warning still binds in the other direction: pushing
  //   desat back up walks reef towards kelp_forest's olive teal.
  //
  // ROUND 7 (2026-08-25) -- G walked back UP a step: "jetzt driftet reef wieder
  //   zu sehr ins lilane, jetzt einen hauch mehr ins gruene" (Rudi). Round 6
  //   overshot, and the mechanism is worth naming because it is not obvious:
  //   lowering G at a FIXED B/R does not only widen the gap to shallow_water, it
  //   rotates the mix towards MAGENTA -- red and blue are what is left when green
  //   is taken out -- so the very move that bought the hue gap handed back the
  //   violet cast that round 5 had cured.
  //   G/R 1.43 was the far side of the useful range; 1.50 is the compromise. The
  //   pair check reads dG/R 0.29 -> 0.22 against shallow_water's 1.72: still well
  //   clear of round 5's 0.16 (the value that read as "cyan next to cyan"), but
  //   with B no longer so far above G that the residual coral pigment tips violet.
  //   B/R is untouched at 1.84 -- it was never the problem.
  //   tint 0.619/1.051/1.613 is the closed-form solve for (B/R 1.839, G/R 1.500)
  //   MEASURED ON THE SHIPPED WEBP: the model's buffer prediction (1.819 / 1.488)
  //   is corrected by the round-trip factors x1.0109 / x1.0080 that the round-6
  //   set established, so the target is stated where the eye sees it and not in
  //   buffer terms. Rec709 weight 0.9997, i.e. the tint stays a pure hue rotation
  //   and the level solve barely moves: canvas stays 28.0 and the family ladder
  //   (15.8 / 21.2 / 24.6 / 28.0 / 29.9 / 39.8) is untouched.
  //   desat stays 1.15 for the reason given above -- G/R must never be bought or
  //   sold by moving desat, that dial owns the coral/weed variation, not the hue.
  //
  // ROUND 8 (2026-08-25) -- "dann nimm doch die +15,4% wieder, ggf. sogar mit
  //   einem leichten gruenlicheren ton dazu" (Rudi). Round 7 was rejected as too
  //   purple as well, so nudging G/R alone was not the answer, and the reason is
  //   finally measurable. The useful number is the DISTANCE FROM THE VIOLET AXIS
  //   -- violet being the hue that lies on the straight R->B line, i.e.
  //       off = G/R - (1 + B/R) / 2
  //   because a pixel whose G sits exactly halfway between R and B carries no
  //   green of its own and reads as a red-blue mix. That one number sorts every
  //   verdict this biome has had:
  //     round 4  B/R 1.09  G/R 1.04   -0.2 %   "zu lila"
  //     round 5  B/R 1.82  G/R 1.56  +15.4 %   "war ok"
  //     round 6  B/R 1.84  G/R 1.43   +1.3 %   "zu lila"
  //     round 7  B/R 1.84  G/R 1.50   +8.3 %   "zu lila"
  //     shallow_water +34 %, deep_ocean +31 %, kelp_forest +41 %
  //   Both rejections sit ON the axis; the accepted one sits 15 % off it. G/R in
  //   isolation was the wrong dial all along -- at B/R 1.84 the violet axis is
  //   already at G/R 1.42, so green has to climb just to stand still.
  //   THE MOVE. Target off-axis 17 %, bought from BOTH sides as asked: B/R
  //   1.84 -> 1.74 (less blue) and G/R 1.50 -> 1.54 (a touch more green). Blue
  //   carries the larger share on purpose -- see the two walls below.
  //   tint 0.612/1.064/1.508 is the closed-form solve for (B/R 1.740, G/R 1.540)
  //   MEASURED ON THE SHIPPED WEBP: the intrinsic channel ratios are read back
  //   off the round-7 .webp files, so the webp round-trip factor is already
  //   inside them and the target is stated where the eye sees it, not in buffer
  //   terms. Rec709 weight 0.99996 -- a pure hue rotation, so the level solve
  //   barely moves: canvas stays 28.0 and the family ladder
  //   (15.8 / 21.2 / 24.6 / 28.0 / 29.9 / 39.8) is untouched.
  //
  //   THE TWO WALLS, and why blue pays more than green. reef has a neighbour on
  //   each side and they fail differently -- the pair check makes it explicit:
  //     vs shallow_water  level x1.42, dB/R 0.07, dG/R 0.22, structure x1.03
  //       -> two legs only: LEVEL and GREEN. No structure leg at all (both are
  //          flat fields at play scale) and the blue axis is already worthless.
  //          Raising reef's green eats one of the two legs, so green must stay
  //          cheap. Lowering reef's blue is FREE here -- 1.74 against 1.83 even
  //          widens a gap that was 0.01 on the family means.
  //     vs kelp_forest    level x1.07, dB/R 0.58, dG/R 0.04, structure x1.70
  //       -> the pair with NO level gap (28.0 vs 29.9), but two strong legs: a
  //          huge blue gap plus real structure (kelp sd 23.4 vs reef 10.3).
  //          Spending 0.10 of B/R here leaves 0.48 -- still ~7x the whole
  //          shallow_water blue gap and backed by structure, so this is the side
  //          that can afford to pay.
  //   That is why the corridor is 16-18 % and not "as green as possible": past
  //   ~18 % the green leg against shallow_water -- the THIN pair -- falls under
  //   0.15 and reef starts reading as a darker shallow_water.
  // wbSlots is on because the four slots are four independent generations and
  // came back up to 10 levels of blue apart -- visible as a patchwork.
  reef: {
    src: (n) => path.join(ST, `reef_k${n}.png`),
    srcLabel: 'assets/style-test/tiles/reef_kN.png (kontext)',
    desat: 1.15,
    tint: { r: 0.612, g: 1.064, b: 1.508 },
    contrastK: 1.0,
    wbSlots: true,
    anchor: 'canvasLum',
    target: 26.5,   // -> 28.0 once integrated (see the webp corner note above)
    shipTarget: 28.0,
    band: [26, 30],
  },
  // kelp_forest: kontext produced three minimal variations of the hero
  // (kelp_forest_2). The original art is loud clean cyan with yellow fronds --
  // far too bright and far too saturated for the redesign, and the yellow reads
  // as autumn leaves rather than kelp. desat 0.60 plus a green-leaning tint with
  // red pulled down turns it into dark olive-teal; the fronds stay readable
  // because they are a SHAPE difference, not only a colour difference, so no
  // contrast reduction (k = 1).
  kelp_forest: {
    src: (n) => path.join(ST, `kelp_forest_k${n}.png`),
    srcLabel: 'assets/style-test/tiles/kelp_forest_kN.png (kontext, hero = kelp_forest_2)',
    desat: 0.45,
    tint: { r: 0.82, g: 1.02, b: 0.94 },
    contrastK: 1.0,
    anchor: 'canvasLum',
    target: 28.5,   // -> 30.0 once integrated (see the webp corner note above)
    shipTarget: 30.0,
    band: [28, 32],
  },
  // island: the only LAND tile on an OCEAN planet, and the only one of the six
  // that needs no kontext at all. Source is EARTH_LIKE's finished `beach`
  // (Rudi's call over `plains`: the GDD says sand and palms literally, and beach
  // can never meet island because they live on different planet types). beach is
  // already dirty and already tiles, so a pure pointwise grade is the cheapest
  // path that holds -- the only job is a WARM shift, from beach's grey-brown
  // (47/45/38) towards the GDD's "goldener Sandstrand", which simultaneously
  // stops island reading as a byte-copy of beach. desat > 1 pushes saturation
  // UP (the one config here that does), because beach is nearly neutral and a
  // tint alone on a neutral surface barely moves.
  // volcanic_vent: NOT a kontext biome and not a pure grade either -- its source
  // is the local composite built by scripts/volcanic-vent-compose.cjs (obsidian
  // ground + desaturated charred_tree chimney sprites + drawn sulfur plumes +
  // a translucent ocean sheet over all of it). Read that script's header first;
  // the reason the biome was rebuilt at all is in there.
  // The grade's only jobs here are LEVEL and the last bit of hue separation:
  //   target 21.0  Rudi's band. volcanic_vent and deep_ocean (15.8) are the two
  //     dark tiles of the OCEAN planet and they are deliberately close, because
  //     the GDD calls this biome "dunkel". The separation is therefore NOT
  //     brightness: it is structure (a vent field against deep_ocean's
  //     deliberately structureless water, interior sd ~13 against 9) and the
  //     olive sulfur haze.
  //   desat 1.15   a mild chroma LIFT, not a cut. The composite is already muted
  //     by the water sheet, and the one thing that must not be muted further is
  //     the plume's yellow-olive note against the teal -- it is the only carrier
  //     of the GDD's "sulfurisch" left after the chimney sprites were
  //     desaturated to kill their amber ember seam.
  //   tint         a hair off blue (R up, B down) so the water column reads a
  //     little turbid and sulfurous rather than as clean deep_ocean water. Kept
  //     tiny: this is the same ocean, one biome away.
  //   k = 1        no contrast change. The contrast decision was already made in
  //     the composite (groundContrast 0.62, which is what let the vents read at
  //     all); touching it again here would fight that.
  volcanic_vent: {
    src: (n) => path.join(ST, `volcanic_vent_c${n}.png`),
    srcLabel: 'assets/style-test/tiles/volcanic_vent_cN.png (local composite)',
    desat: 1.15,
    tint: { r: 1.03, g: 1.00, b: 0.97 },
    contrastK: 1.0,
    anchor: 'canvasLum',
    target: 21.0,
    band: [20, 22],
  },
  island: {
    src: (n) => path.join(TILES, 'beach', `beach_${n}.webp`),
    srcLabel: 'src/assets/tiles/beach/beach_N.webp',
    desat: 1.20,
    tint: { r: 1.15, g: 1.02, b: 0.80 },
    contrastK: 1.0,
    anchor: 'canvasLum',
    target: 24.5,
    band: [23, 26],
  },
};

// ---------------------------------------------------------------- METRICS ---
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** whole-canvas + interior stats in one pass over RGBA raw data */
function statsOf(data, ch) {
  const N = data.length / ch;
  const cs = [0, 0, 0], cq = [0, 0, 0];
  const is = [0, 0, 0], iq = [0, 0, 0];
  let iL = 0, iL2 = 0, ni = 0;
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    cs[0] += r; cs[1] += g; cs[2] += b;
    cq[0] += r * r; cq[1] += g * g; cq[2] += b * b;
    if (a >= 8) {
      is[0] += r; is[1] += g; is[2] += b;
      iq[0] += r * r; iq[1] += g * g; iq[2] += b * b;
      const L = L709(r, g, b); iL += L; iL2 += L * L; ni++;
    }
  }
  const cm = cs.map((s) => s / N);
  const csd = cq.map((q, k) => Math.sqrt(Math.max(0, q / N - cm[k] * cm[k])));
  const im = is.map((s) => s / ni);
  const isd = iq.map((q, k) => Math.sqrt(Math.max(0, q / ni - im[k] * im[k])));
  return {
    canvas: { rgb: cm, lum: L709(cm[0], cm[1], cm[2]), sd: (csd[0] + csd[1] + csd[2]) / 3, sdCh: csd },
    inner: {
      rgb: im, lum: L709(im[0], im[1], im[2]),
      sd: (isd[0] + isd[1] + isd[2]) / 3, sdCh: isd,
      lumSd: Math.sqrt(Math.max(0, iL2 / ni - (iL / ni) * (iL / ni))), n: ni,
    },
  };
}

/**
 * "water luminance": mean Rec709 luma of the DARK half of the interior
 * histogram (pixels below the interior median), expressed on the same diluted
 * canvas scale as canvas.lum so it is directly comparable to deep_ocean's
 * number. Used to anchor ice_shelf, whose bright floes would otherwise drag a
 * plain mean-anchored grade far too dark.
 */
function waterLum(data, ch) {
  const lums = [];
  const tr = [0, 0, 0];
  let ntr = 0;
  for (let i = 0; i < data.length; i += ch) {
    if (data[i + 3] >= 8) lums.push(L709(data[i], data[i + 1], data[i + 2]));
    else { tr[0] += data[i]; tr[1] += data[i + 1]; tr[2] += data[i + 2]; ntr++; }
  }
  lums.sort((a, b) => a - b);
  const half = lums.slice(0, Math.max(1, Math.floor(lums.length / 2)));
  const wl = half.reduce((s, v) => s + v, 0) / half.length;
  const N = data.length / ch;
  const p = lums.length / N;
  const trL = ntr ? L709(tr[0] / ntr, tr[1] / ntr, tr[2] / ntr) : 0;
  return p * wl + (1 - p) * trL;
}

const metric = (data, ch, anchor) =>
  anchor === 'waterLum' ? waterLum(data, ch) : statsOf(data, ch).canvas.lum;

/** transparent-corner share and mean luma -- the dilution the canvas metric adds */
function dilution(data, ch) {
  const N = data.length / ch;
  const tr = [0, 0, 0];
  let ntr = 0, ni = 0;
  for (let i = 0; i < data.length; i += ch) {
    if (data[i + 3] >= 8) ni++;
    else { tr[0] += data[i]; tr[1] += data[i + 1]; tr[2] += data[i + 2]; ntr++; }
  }
  return { p: ni / N, trL: ntr ? L709(tr[0] / ntr, tr[1] / ntr, tr[2] / ntr) : 0 };
}
const toRaw = (diluted, d) => (diluted - (1 - d.p) * d.trL) / d.p;
const toDiluted = (raw, d) => d.p * raw + (1 - d.p) * d.trL;

/**
 * Two anchors on the interior luma histogram, in RAW interior luma:
 *   lo = mean of the dark half            -> the open WATER level
 *   hi = 97th percentile                  -> the ICE / highlight level
 * ice_shelf lives or dies on the gap between these two, so the grade pins both
 * instead of just scaling the mean -- otherwise a slot whose kontext water came
 * back bright gets a small gain that crushes its floes to mid grey, and the
 * four slots no longer match.
 */
function anchors(data, ch) {
  const lums = [];
  for (let i = 0; i < data.length; i += ch) {
    if (data[i + 3] >= 8) lums.push(L709(data[i], data[i + 1], data[i + 2]));
  }
  lums.sort((a, b) => a - b);
  const halfN = Math.max(1, Math.floor(lums.length / 2));
  const lo = lums.slice(0, halfN).reduce((s, v) => s + v, 0) / halfN;
  const hi = lums[Math.min(lums.length - 1, Math.floor(lums.length * 0.97))];
  return { lo, hi };
}

/** interior channel means (alpha >= 8) */
function interiorMeans(data, ch) {
  const s = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < data.length; i += ch) {
    if (data[i + 3] < 8) continue;
    s[0] += data[i]; s[1] += data[i + 1]; s[2] += data[i + 2]; n++;
  }
  return [s[0] / n, s[1] / n, s[2] / n];
}

/**
 * SLOT WHITE BALANCE (see the header). One uniform per-channel gain for the
 * whole tile -- pointwise and position independent, so it cannot over-brighten
 * the diamond rim. Alpha untouched. Returns a NEW buffer.
 */
function whiteBalance(src, ch, gains) {
  const out = Buffer.from(src);
  for (let i = 0; i < out.length; i += ch) {
    if (out[i + 3] < 1) continue;
    for (let c = 0; c < 3; c++) {
      const v = Math.round(out[i + c] * gains[c]);
      out[i + c] = v > 255 ? 255 : v;
    }
  }
  return out;
}

// ----------------------------------------------------------------- GRADE ----
/** pointwise grade. Returns a NEW buffer; alpha copied verbatim. */
function grade(src, ch, cfg, G) {
  const out = Buffer.from(src);
  const { desat, tint, contrastK: k } = cfg;
  const gains = [tint.r * G, tint.g * G, tint.b * G];
  const lin = new Float32Array(out.length / ch * 3);
  const s = [0, 0, 0];
  let n = 0;
  // pass 1: desaturate + tint/level (kept in float so pass 2 has no rounding loss)
  for (let i = 0, p = 0; i < out.length; i += ch, p += 3) {
    if (out[i + 3] < 1) { lin[p] = out[i]; lin[p + 1] = out[i + 1]; lin[p + 2] = out[i + 2]; continue; }
    const r = out[i], g = out[i + 1], b = out[i + 2];
    const L = L709(r, g, b);
    const v0 = (L + desat * (r - L)) * gains[0];
    const v1 = (L + desat * (g - L)) * gains[1];
    const v2 = (L + desat * (b - L)) * gains[2];
    lin[p] = v0; lin[p + 1] = v1; lin[p + 2] = v2;
    if (out[i + 3] >= 8) { s[0] += v0; s[1] += v1; s[2] += v2; n++; }
  }
  const m = [s[0] / n, s[1] / n, s[2] / n];
  // pass 2: contrast around the interior channel means (mean-preserving), clamp, write
  for (let i = 0, p = 0; i < out.length; i += ch, p += 3) {
    if (out[i + 3] < 1) continue;
    for (let c = 0; c < 3; c++) {
      const v = k === 1 ? lin[p + c] : m[c] + k * (lin[p + c] - m[c]);
      out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return out;
}

/**
 * TWO-POINT grade. Pointwise, position independent, so the diamond rim is safe.
 *   1. desaturate                       c' = L + desat * (c - L)
 *   2. LUMA-NEUTRAL tint                gains normalised to Rec709 weight 1, so
 *                                       the tint only rotates hue and step 3
 *                                       alone owns brightness
 *   3. two-point tone curve on luma     f(L) = thi * (L/hi)^p, with p fixed so
 *                                       f(lo) = tlo -- pins the water level AND
 *                                       the ice level, then rescales the pixel's
 *                                       RGB by f(L)/L (hue preserving)
 * Targets are given in the diluted canvas scale and converted to raw internally.
 */
function gradeTwoPoint(src, ch, cfg) {
  const out = Buffer.from(src);
  const { desat, tint } = cfg;
  const d = dilution(src, ch);
  const a = anchors(src, ch);
  const tlo = toRaw(cfg.target, d);
  const thi = toRaw(cfg.targetHi, d);
  // exponent that makes the power curve pass through BOTH anchors
  const p = Math.log(tlo / thi) / Math.log(a.lo / a.hi);
  // luma-neutral tint: unit Rec709 weight so it cannot shift brightness
  const w = 0.2126 * tint.r + 0.7152 * tint.g + 0.0722 * tint.b;
  const g = [tint.r / w, tint.g / w, tint.b / w];
  const MAXSCALE = 4;
  for (let i = 0; i < out.length; i += ch) {
    if (out[i + 3] < 1) continue;
    const r = out[i], gg = out[i + 1], b = out[i + 2];
    const L = L709(r, gg, b);
    const v = [
      (L + desat * (r - L)) * g[0],
      (L + desat * (gg - L)) * g[1],
      (L + desat * (b - L)) * g[2],
    ];
    const L2 = L709(v[0], v[1], v[2]);
    let s = L2 > 0.5 ? (thi * Math.pow(L2 / a.hi, p)) / L2 : 1;
    if (!isFinite(s) || s < 0) s = 0;
    if (s > MAXSCALE) s = MAXSCALE;
    for (let c = 0; c < 3; c++) {
      const q = v[c] * s;
      out[i + c] = q < 0 ? 0 : q > 255 ? 255 : Math.round(q);
    }
  }
  return { buf: out, info: { lo: a.lo, hi: a.hi, tlo, thi, p } };
}

/** bisection on the global gain G so the chosen anchor metric hits cfg.target */
function solveG(src, ch, cfg) {
  let lo = 0.10, hi = 4.0;
  for (let it = 0; it < 24; it++) {
    const mid = (lo + hi) / 2;
    const v = metric(grade(src, ch, cfg, mid), ch, cfg.anchor);
    if (v > cfg.target) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

// --------------------------------------------------------------- EDGE CHK ---
let INNER_MASK = null;
async function innerMask() {
  if (INNER_MASK) return INNER_MASK;
  const s = 0.86, iw = Math.round(TILE_W * s), ih = Math.round(TILE_H * s);
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}">` +
    `<polygon points="${TILE_W / 2},${(TILE_H - ih) / 2} ${(TILE_W + iw) / 2},${TILE_H / 2} ` +
    `${TILE_W / 2},${(TILE_H + ih) / 2} ${(TILE_W - iw) / 2},${TILE_H / 2}" fill="white"/></svg>`
  );
  INNER_MASK = await sharp(svg).greyscale().raw().toBuffer();
  return INNER_MASK;
}
/** mean Rec709 luma of the OUTERMOST diamond band (rim guard) */
async function edgeLum(data, ch) {
  const inner = await innerMask();
  let sum = 0, n = 0;
  for (let p = 0; p < TILE_W * TILE_H; p++) {
    const i = p * ch;
    if (data[i + 3] < 8) continue;
    if (inner[p] > 8) continue;
    sum += L709(data[i], data[i + 1], data[i + 2]); n++;
  }
  return { lum: n ? sum / n : 0, n };
}

// ---------------------------------------------------------------- HELPERS ---
async function rawOf(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== TILE_W || info.height !== TILE_H)
    throw new Error(`${file} is ${info.width}x${info.height}, expected ${TILE_W}x${TILE_H}`);
  return { data, ch: info.channels };
}
const toPng = (data, ch) =>
  sharp(data, { raw: { width: TILE_W, height: TILE_H, channels: ch } }).png().toBuffer();

async function alphaBytes(fileOrBuf) {
  const { data, info } = await sharp(fileOrBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const a = Buffer.alloc(info.width * info.height);
  for (let p = 0; p < a.length; p++) a[p] = data[p * info.channels + 3];
  return a;
}

const f1 = (x) => x.toFixed(1);
const rgbS = (v) => `rgb(${f1(v[0])},${f1(v[1])},${f1(v[2])})`;

// ------------------------------------------------------------- INTEGRATE ----
/** canvas luma of a file as it will actually be loaded by the game */
async function shippedCanvasLum(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, N = data.length / ch;
  const s = [0, 0, 0];
  for (let i = 0; i < data.length; i += ch) { s[0] += data[i]; s[1] += data[i + 1]; s[2] += data[i + 2]; }
  return L709(s[0] / N, s[1] / N, s[2] / N);
}

async function integrate(biome, pngs) {
  const dst = path.join(TILES, biome);
  fs.mkdirSync(dst, { recursive: true });
  const written = [];
  for (let n = 0; n < pngs.length; n++) {
    const buf = pngs[n];
    const full = path.join(dst, `${biome}_${n}.webp`);
    await sharp(buf).webp(WEBP).toFile(full);
    written.push(path.basename(full));
    for (const m of MIPS) {
      const w = path.join(dst, `${biome}_${n}${m.suffix}.webp`);
      const p = path.join(dst, `${biome}_${n}${m.suffix}.png`);
      await sharp(buf).resize(m.w, m.h, { fit: 'fill' }).webp(WEBP).toFile(w);
      await sharp(buf).resize(m.w, m.h, { fit: 'fill' }).png().toFile(p);
      written.push(path.basename(w), path.basename(p));
    }
  }
  return { dst, written };
}

// ----------------------------------------------------------------- SHEETS ---
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
function label(text, w) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="22">` +
    `<text x="4" y="16" font-family="monospace" font-size="15" fill="#c9d1d9">${text}</text></svg>`
  );
}
async function sheet2x2(biome, pngs) {
  const LBL = 22, PAD = 16, GAP = 16;
  const cw = TILE_W, chh = TILE_H;
  const comp = [];
  for (let n = 0; n < 4; n++) {
    const col = n % 2, row = (n - col) / 2;
    const cx = PAD + col * (cw + GAP), cy = PAD + row * (LBL + chh + GAP);
    comp.push({ input: label(`${biome}_${n}.webp`, cw), left: cx, top: cy });
    comp.push({ input: pngs[n], left: cx, top: cy + LBL });
  }
  const out = await sharp({
    create: { width: PAD * 2 + cw * 2 + GAP, height: PAD * 2 + (LBL + chh) * 2 + GAP, channels: 4, background: BGA },
  }).composite(comp).png().toBuffer();
  const p = path.join(ST, `_${biome}_slots_2x2.png`);
  fs.writeFileSync(p, out);
  return p;
}
/** before/after: source row over graded row */
async function sheetBeforeAfter(biome, srcPngs, pngs, srcLabel) {
  const LBL = 22, PAD = 16, GAP = 12, W = 320, H = 160;
  const rows = [
    { t: `SOURCE  ${srcLabel}`, b: srcPngs },
    { t: `GRADED  src/assets/tiles/${biome}/${biome}_N.webp`, b: pngs },
  ];
  const comp = [];
  let y = PAD;
  for (const row of rows) {
    comp.push({ input: label(row.t, 4 * W + 3 * GAP), left: PAD, top: y });
    y += LBL;
    for (let n = 0; n < 4; n++) {
      comp.push({
        input: await sharp(row.b[n]).resize(W, H, { fit: 'fill' }).png().toBuffer(),
        left: PAD + n * (W + GAP), top: y,
      });
    }
    y += H + GAP + 6;
  }
  const out = await sharp({
    create: { width: PAD * 2 + 4 * W + 3 * GAP, height: y + PAD, channels: 4, background: BGA },
  }).composite(comp).png().toBuffer();
  const p = path.join(ST, `_${biome}_before_after.png`);
  fs.writeFileSync(p, out);
  return p;
}
/** seam check: interlocking iso mosaic of mixed slots -> shows the tile edges */
async function sheetMosaic(biome, pngs) {
  const w = 256, h = 128;
  const halves = await Promise.all(pngs.map((b) => sharp(b).resize(w, h, { fit: 'fill' }).png().toBuffer()));
  let seed = 0x51ac;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >>> 8) / 0x7fffff; };
  const comp = [];
  let mr = 0, mb = 0;
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 5; c++) {
      const x = c * w + (r % 2 ? w / 2 : 0), y = r * (h / 2);
      comp.push({ input: halves[Math.floor(rnd() * 4) % 4], left: x, top: y });
      mr = Math.max(mr, x + w); mb = Math.max(mb, y + h);
    }
  }
  const out = await sharp({ create: { width: mr, height: mb, channels: 4, background: BGA } })
    .composite(comp).png().toBuffer();
  const p = path.join(ST, `_${biome}_mosaic.png`);
  fs.writeFileSync(p, out);
  return p;
}

// -------------------------------------------------------------------- RUN ---
async function runBiome(biome, opts) {
  const base = CONFIG[biome];
  if (!base) throw new Error(`unknown biome ${biome}`);
  // --desat= / --tint=r,g,b / --target= / --target-hi= let a look be dialled in
  // without editing CONFIG; the value that ends up shipping is written back into
  // CONFIG so the script alone reproduces the integrated tiles.
  const cfg = { ...base, ...opts.override };
  console.log(`\n=== ${biome}  <-  ${cfg.srcLabel}`);
  console.log(
    `    desat ${cfg.desat}  tint R${cfg.tint.r} G${cfg.tint.g} B${cfg.tint.b}  k ${cfg.contrastK}` +
    `  anchor ${cfg.anchor} -> ${cfg.target} (band ${cfg.band[0]}-${cfg.band[1]})`
  );

  // ---- optional pre-pass: pull all four slots onto one colour reference ----
  let wbGains = null;
  if (cfg.wbSlots) {
    const means = [];
    for (let n = 0; n < 4; n++) {
      const f = cfg.src(n);
      if (!fs.existsSync(f)) throw new Error(`missing source: ${f}`);
      const { data, ch } = await rawOf(f);
      means.push(interiorMeans(data, ch));
    }
    const fam = [0, 1, 2].map((c) => means.reduce((s, m) => s + m[c], 0) / means.length);
    const clamp = (x) => (x < 0.8 ? 0.8 : x > 1.25 ? 1.25 : x);
    wbGains = means.map((m) => [0, 1, 2].map((c) => clamp(fam[c] / m[c])));
    console.log(`  [slot wb] family reference RGB ${fam.map((v) => f1(v)).join('/')}`);
    for (let n = 0; n < 4; n++) {
      console.log(
        `    slot${n} ${means[n].map((v) => f1(v)).join('/')}  x` +
        wbGains[n].map((v) => v.toFixed(3)).join('/')
      );
    }
  }

  const pngs = [], srcPngs = [], rows = [];
  for (let n = 0; n < 4; n++) {
    const file = cfg.src(n);
    if (!fs.existsSync(file)) throw new Error(`missing source: ${file}`);
    const raw0 = await rawOf(file);
    const ch = raw0.ch;
    const data = wbGains ? whiteBalance(raw0.data, ch, wbGains[n]) : raw0.data;
    const pre = statsOf(data, ch);
    const preWater = waterLum(data, ch);
    const preEdge = await edgeLum(data, ch);

    const twoPoint = cfg.anchor === 'twoPoint';
    let G = 1, tp = null, out;
    if (opts.measureOnly) out = Buffer.from(data);
    else if (twoPoint) { const r = gradeTwoPoint(data, ch, cfg); out = r.buf; tp = r.info; }
    else { G = solveG(data, ch, cfg); out = grade(data, ch, cfg, G); }
    const post = statsOf(out, ch);
    const postWater = waterLum(out, ch);
    const postEdge = await edgeLum(out, ch);

    // alpha integrity: byte-exact against the source
    let aDiff = 0;
    for (let i = 0; i < data.length; i += ch) if (data[i + 3] !== out[i + 3]) aDiff++;

    const preA = anchors(data, ch), postA = anchors(out, ch), dil = dilution(data, ch);
    pngs.push(await toPng(out, ch));
    srcPngs.push(await toPng(data, ch));
    rows.push({ n, G, pre, post, preWater, postWater, preEdge, postEdge, aDiff, preA, postA, dil, tp });

    console.log(
      `  slot${n} ` + (tp ? `two-point p=${tp.p.toFixed(3)}` : `G=${G.toFixed(4)}`) + '\n' +
      `    canvas  ${rgbS(pre.canvas.rgb)} lum ${f1(pre.canvas.lum)} sd ${f1(pre.canvas.sd)}` +
      `  ->  ${rgbS(post.canvas.rgb)} lum ${f1(post.canvas.lum)} sd ${f1(post.canvas.sd)}\n` +
      `    inner   ${rgbS(pre.inner.rgb)} lum ${f1(pre.inner.lum)} sd ${f1(pre.inner.sd)}` +
      `  ->  ${rgbS(post.inner.rgb)} lum ${f1(post.inner.lum)} sd ${f1(post.inner.sd)}\n` +
      `    waterLum ${f1(preWater)} -> ${f1(postWater)}   edgeLum ${f1(preEdge.lum)} -> ${f1(postEdge.lum)}` +
      ` (n=${postEdge.n})   alphaDiff ${aDiff}\n` +
      `    anchors(diluted) water ${f1(toDiluted(preA.lo, dil))} -> ${f1(toDiluted(postA.lo, dil))}` +
      `   ice/hi ${f1(toDiluted(preA.hi, dil))} -> ${f1(toDiluted(postA.hi, dil))}`
    );
  }

  // rim guard: the edge band must move by the same ratio as the interior.
  console.log('  [rim guard] edge-band vs interior gain ratio (pointwise grade => must be ~1.00):');
  for (const r of rows) {
    const eR = r.postEdge.lum / r.preEdge.lum;
    const iR = r.post.inner.lum / r.pre.inner.lum;
    const rel = eR / iR;
    console.log(
      `    slot${r.n} edge x${eR.toFixed(3)} / inner x${iR.toFixed(3)} = ${rel.toFixed(3)}` +
      (Math.abs(rel - 1) > 0.12 ? '  <-- RIM WARN' : '  ok')
    );
  }

  fs.mkdirSync(ST, { recursive: true });
  const sheets = [
    await sheet2x2(biome, pngs),
    await sheetBeforeAfter(biome, srcPngs, pngs, cfg.srcLabel),
    await sheetMosaic(biome, pngs),
  ];
  console.log('  [sheets] ' + sheets.map((p) => path.relative(ROOT, p)).join(', '));

  if (cfg.previewOnly) console.log('  [preview-only config -- integration skipped by design]');
  if (opts.integrate && !opts.measureOnly && !cfg.previewOnly) {
    const { dst, written } = await integrate(biome, pngs);
    console.log(`  [integrate] ${written.length} files -> ${path.relative(ROOT, dst)}`);
    for (let n = 0; n < 4; n++) {
      const a0 = await alphaBytes(pngs[n]);
      const a1 = await alphaBytes(path.join(dst, `${biome}_${n}.webp`));
      let d = 0;
      for (let i = 0; i < a0.length; i++) if (a0[i] !== a1[i]) d++;
      console.log(`    alpha round-trip slot${n}: ${d === 0 ? 'BIT-EXACT' : d + ' bytes differ'}`);
    }
    // the number that actually matters: what the game will load
    const shipped = [];
    for (let n = 0; n < 4; n++) shipped.push(await shippedCanvasLum(path.join(dst, `${biome}_${n}.webp`)));
    const inBand = shipped.every((v) => v >= cfg.band[0] && v <= cfg.band[1]);
    console.log(
      `    shipped canvas luma ${shipped.map((v) => f1(v)).join(' / ')}` +
      `  (band ${cfg.band[0]}-${cfg.band[1]}) ${inBand ? 'ok' : '<-- OUT OF BAND'}`
    );

    const files = fs.readdirSync(dst);
    const missing = [];
    for (let n = 0; n < 4; n++) {
      const exp = [`${biome}_${n}.webp`];
      for (const m of MIPS) exp.push(`${biome}_${n}${m.suffix}.webp`, `${biome}_${n}${m.suffix}.png`);
      for (const e of exp) if (!files.includes(e)) missing.push(e);
    }
    console.log(`    mips: ${missing.length ? 'MISSING ' + missing.join(',') : 'complete (28 files)'}`);
  }
  return rows;
}

(async () => {
  const args = process.argv.slice(2);
  const arg = (name) => {
    const a = args.find((x) => x.startsWith(`--${name}=`));
    return a ? a.slice(name.length + 3) : null;
  };
  const override = {};
  if (arg('desat') !== null) override.desat = Number(arg('desat'));
  if (arg('target') !== null) override.target = Number(arg('target'));
  if (arg('target-hi') !== null) override.targetHi = Number(arg('target-hi'));
  if (arg('k') !== null) override.contrastK = Number(arg('k'));
  if (arg('tint') !== null) {
    const [r, g, b] = arg('tint').split(',').map(Number);
    override.tint = { r, g, b };
  }
  const opts = {
    measureOnly: args.includes('--measure-only'),
    integrate: !args.includes('--no-integrate'),
    override,
  };
  const biomes = args.filter((a) => !a.startsWith('--'));
  if (!biomes.length) {
    console.error('usage: node scripts/tiles-water-grade.cjs <biome...> [--measure-only] [--no-integrate]');
    process.exit(1);
  }
  for (const b of biomes) await runBiome(b, opts);
  console.log('\ndone');
})();
