/**
 * Asset-Pipeline: surface PROP sprites — LEAFY BUSH (plains biome).
 *
 *   bush_0..4   low dense leafy bushes standing on `plains` ground
 *
 * Structurally a sibling of scripts/props-rock-sand-generate.cjs — same pipeline
 * building blocks (flux-pro/v1.1 -> birefnet -> alpha levels -> speck removal ->
 * tight crop -> bidirectional tone step with hue pin -> scale -> validate ->
 * integrate), same size conventions, same CLI. The rock/driftwood scripts are
 * left untouched; this file owns its prompts, tone constants and validator bands.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RUN 2 — rework after the emulator review of run 1
 * ═══════════════════════════════════════════════════════════════════════════
 * Verdict on the shipped run-1 set: "blue cast, and make them thinner and not
 * so full". Three corrections, each with its own guard so the next run cannot
 * silently regress:
 *
 *  1. WARMTH.  Run 1 measured G/R 1.01..1.24 (mean 1.12) — the ONLY prop set in
 *     the project where green beats red. Everything it stands next to is the
 *     other way round: plains ground 0.90, deciduous trees 0.84..1.10 (mean
 *     0.97), grass 0.75..0.80. Against a warm-olive ground that reads cold.
 *     -> new band G/R 0.88..1.02, i.e. R >= G, inside the ground's own family.
 *     -> PRE_GR_MAX rejects a green render BEFORE the tone step (see there):
 *        the hue pin only rotates R against B, it cannot pull green out of
 *        green foliage, and a multiply that tried would just yield mud.
 *
 *  2. AIRINESS.  Run 1 was generated as "one solid rounded mass of dense small
 *     leaves" with "solid leaf right down to the ground", and it delivered
 *     exactly that: five clipped garden hedge-balls. Measured as bbox FILL
 *     (opaque px / w*h) the run-1 set is 58.1..69.7 % — by a wide margin the
 *     densest thing in the project (trees 14.9..41.0 %, grass 14.8..39.0 %,
 *     tundra shrubs 16.7..50.6 %). Fill is the objective handle on "too full":
 *     it drops both when the interior opens up and when the outline goes from
 *     a clipped dome to a broken ragged edge, which is precisely the two-part
 *     change asked for.
 *     -> new band FILL 30..52 % and the motif rewritten around open growth.
 *
 *  3. WIDTH.  Run 1 measured aspect 1.19..1.56 (mean 1.42).
 *     -> new band 1.00..1.30. Squat stays right, broad does not.
 *
 * The heightFactor stays at 0.60 (PROP_HEIGHT_FACTORS in propThemes.ts is
 * application code and out of scope here). At aspect ~1.15 and 16.8 px drawn
 * height that is ~19 px wide on a 48 px tile.
 *
 * ── TARGET TONE (measured, not guessed) ──────────────────────────────────────
 * `plains` ground, mean over the 4 tile variants:
 *     lum 66.3 · rgb 74/66/46 · R/B 1.59 · G/R 0.90 · saturation 38.9 %
 * Bands for this set:
 *     mean luminance   50..64   DARKER than the ground. A leafy bush reads as a
 *                               dense dark volume. This is deliberately the
 *                               opposite direction from the parallel `grass` set
 *                               (which targets 88..112, i.e. lighter than the
 *                               ground) so the two vegetation families separate
 *                               tonally, not only by silhouette.
 *     R/B              1.40..1.90   same warm-olive family as the ground
 *     G/R              0.88..1.02   red at least matches green (run-2 fix 1)
 *     saturation       33..55 %     floor lowered in run 2 — see SAT_MIN, it is
 *                                  forced by the G/R target, not a taste call
 *     aspect (w/h)     1.00..1.30   squat but not broad (run-2 fix 3)
 *     bbox fill        30..55 %     open airy growth, not a hedge ball (fix 2)
 *     contrast         >= 0.52      light-to-shade modelling still intact
 *     base cover       >= 15 %      foliage down to the ground
 *     ankle cover      >= 50 %      not a sapling on a stem (run 2, and the
 *                                   only stem check a grass tuft cannot fool)
 *
 * Reference — the deciduous trees that share this vegetation language
 * (src/assets/props/tree, variants 1/2/3/5/7): lum 45.6..70.0, R/B 1.71..2.52,
 * saturation 42..60 %. The bush has to belong to the same planting but must NOT
 * read as a shrunken tree: no visible trunk, no root flare, a ground-hugging
 * leafy plant instead.
 *
 * Full G/R and FILL reference table, measured over the shipped sets (this is
 * what bands 1 and 2 above were calibrated against):
 *     plains ground   G/R 0.895..0.901   fill n/a (opaque tile)
 *     tree_0..7       G/R 0.843..1.096   fill 14.9..41.0 %
 *     grass_0..5      G/R 0.753..0.795   fill 14.8..39.0 %
 *     shrub_0..5      G/R 0.686..1.124   fill 16.7..50.6 %
 *     bush run 1      G/R 1.014..1.244   fill 58.1..69.7 %   <- the outlier
 *
 * NOT a model for this set: src/assets/props/shrub (tundra dwarf shrubs). Same
 * motif family, but woody and BARE, and two of the six measure R/B 0.88..0.91,
 * i.e. cold blue-grey — those would break hard against warm plains ground.
 *
 * ── HEIGHTFACTOR (renderer, out of scope for this script) ────────────────────
 * PlanetSurface draws every prop at drawH = PROP_BASE_HEIGHT (28) * scale and
 * derives the width from the sprite ASPECT. Without a correction a bush would be
 * drawn exactly as tall as a tree. A separate implementation agent adds a
 * PROP_HEIGHT_FACTORS entry (`driftwood` uses 0.25 for comparison). That is why
 * the aspect band here is NARROW: one factor has to fit all five variants.
 *
 * ── STYLE ────────────────────────────────────────────────────────────────────
 * The trees are semi-realistic PAINTED game art (soft matte foliage masses, no
 * photographic leaf macro-detail), not photographs — unlike the rock/driftwood
 * sets, whose anchors start with "photorealistic photograph". The bush follows
 * the TREES, for two reasons: (a) it stands next to them in the same biome, and
 * (b) painted foliage masses survive the downscale to ~17 px on screen, while
 * photographic leaf detail aliases into noise.
 *
 * ── PROMPT LESSONS CARRIED IN FROM EARLIER RUNS ──────────────────────────────
 *   * The HEAD NOUN drives silhouette and aspect — not the canvas ratio and not
 *     explicit ratio phrases ("three times wider than tall" measured as a no-op).
 *     "shrub" / "bush" / "thicket" / "hedge" have very different proportions, so
 *     the noun is chosen per shape and the canvas is only a fine trim.
 *   * Negations often SUMMON the named thing. Everything that can be said
 *     positively is said positively ("the leaves reach all the way down to the
 *     ground" instead of "no trunk"); the negative block stays as a backstop.
 *   * Asking for a TONE in the prompt overshoots into extremes. The motif comes
 *     from the prompt, the tone comes from the tone step.
 *
 * ── PROMPT BUDGET — the most expensive lesson of run 2 ──────────────────────
 * The text encoder silently TRUNCATES a long prompt. Run 1 and the first half
 * of run 2 both shipped a ~4300-character prompt, and everything past roughly
 * 1200 characters was never encoded at all. That was proven, not guessed: an
 * edit to the colour block at character 1364 produced a BYTE-IDENTICAL image on
 * the same seed, while every edit inside the first ~1100 characters changed the
 * render immediately.
 *
 * What that means for the old prompt: the entire NEGATIVE block (started at
 * ~char 2400), the UPRIGHT_NEGATIVE and the DENSITY_NEGATIVE were dead text.
 * This retroactively explains several run-1 mysteries recorded below — most
 * obviously why a render came back as a clipped topiary while "not a topiary"
 * and "NOT a cone" sat in the negatives, and why negations in general "summoned
 * the named thing": they were not weak, they were absent, and only the positive
 * wording near the front of the prompt was ever doing anything.
 *
 * Consequences, all load-bearing:
 *   * the prompt is now ~1100 chars and buildPrompt() is guarded by
 *     assertPromptFits(), which throws BEFORE spending a fal credit;
 *   * the negative list keeps only the four failure modes this set actually
 *     produces, because a negative that does not fit is worse than none — it
 *     reads as due diligence while doing nothing;
 *   * POSITION IS THE STRONGEST LEVER. The form comes first and dominates. The
 *     same colour clause measured -0.45 on G/R in the form and ~0 in the
 *     anchor. When a metric will not move, move its wording forward before
 *     rewording it.
 *
 * MODEL: fal-ai/flux-pro/v1.1 (flux/dev returns cel-shaded low-poly assets with a
 * painted-on floor — documented in props-rock-generate.cjs). flux-pro/v1.1 has no
 * `negative_prompt` input, so negatives are folded into the prompt as plain text.
 *
 * PROP SIZE CONVENTION: tight-cropped, aspect preserved, no fixed canvas, no
 * transparent padding, RGBA webp, max(w,h) = 400, mips @half/@quarter/@eighth at
 * Math.round(dim * 0.5 / 0.25 / 0.125), webp { quality: 90, effort: 4,
 * smartSubsample: true }.
 *
 * FILE NAMING: spriteCache matches /\/props\/([^/]+)\/\1_(\d+)\.webp$/ — the file
 * name must start with the folder name, hence bush/bush_N.webp.
 *
 * fal key from scripts/.env (FAL_AI_API_KEY) — never hardcode, never log, never commit.
 *
 * Usage:
 *   node scripts/props-bush-generate.cjs gen
 *   node scripts/props-bush-generate.cjs gen 2 4
 *   node scripts/props-bush-generate.cjs gen 2 --seed 870999
 *   node scripts/props-bush-generate.cjs gen 2 --tries 4
 *   node scripts/props-bush-generate.cjs gen 2 --reuse-raw   re-run steps 2..6 only
 *   node scripts/props-bush-generate.cjs validate
 *   node scripts/props-bush-generate.cjs sheet
 *   node scripts/props-bush-generate.cjs integrate [indices]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');

// ── fal key from scripts/.env ──
try {
  const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const FAL_API_KEY = process.env.FAL_AI_API_KEY || process.env.FAL_API_KEY;

const ROOT = path.join(__dirname, '..');
const DIR_RAW = path.join(ROOT, 'assets', 'raw');
const DIR_NOBG = path.join(ROOT, 'assets', 'nobg');
const DIR_CROP = path.join(ROOT, 'assets', 'cropped');
const DIR_FINAL = path.join(ROOT, 'assets', 'final');
const DIR_REVIEW = path.join(ROOT, 'assets', 'style-test', 'props');
const SRC_PROPS = path.join(ROOT, 'src', 'assets', 'props');
const DIR_TILES = path.join(ROOT, 'src', 'assets', 'tiles', 'plains');

const FAMILY = 'bush';
const PREFIX = 'bush';
const COUNT = 5;
const TARGET_MAX = 400;
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const MIPS = [
  { suffix: '@half', scale: 0.5 },
  { suffix: '@quarter', scale: 0.25 },
  { suffix: '@eighth', scale: 0.125 },
];

// ══════════════════════════════════════
// PROMPTS
// ══════════════════════════════════════

// Shared style anchor — identical for all five variants so the set reads as ONE
// plant species. Five things are stated redundantly on purpose:
//   a) PAINTED, not photographic (style match with src/assets/props/tree)
//   b) OPEN AIRY growth (run-2 fix 2 — run 1 said "one solid rounded mass of
//      dense small leaves" and got five clipped hedge balls at 58..70 % fill)
//   c) LEAFY GROWTH DOWN TO THE GROUND (the run-1 failure mode was a mini-tree
//      on a bare stem; airiness must not bring that back, hence the wording is
//      "many thin stems fanning out from the ground", i.e. multi-stemmed from
//      soil level, rather than the run-1 "solid leaf right down to the ground"
//      which is what made it a solid mass in the first place)
//   d) NOTHING UNDERNEATH (a baked-in soil clod or drop shadow is unusable on a
//      tile whose neighbours vary)
//   e) WARM KHAKI-OLIVE (run-2 fix 1 — the run-1 colour list led with "sage
//      green" and "moss green", both green-dominant words, and measured
//      G/R 1.01..1.24. The head colour noun is now khaki, with green
//      subordinate to it; the words that demonstrably pull G/R down are
//      khaki / tan / straw / ochre / buff / drab / brown, and the grass set
//      reached 0.75..0.80 on exactly that vocabulary.)
//
// ── r2 of the run-2 anchor ───────────────────────────────────────────────────
// r1 of this anchor overcorrected on BOTH new levers at once and produced dead
// winter scrub — leafless brown twig bundles, one of them a bare sapling.
// Measured on r1 (seeds 8801xx..8805xx): raw G/R 0.82..1.05, final R/B up to
// 2.43 (one hue-reject), fill down to 13.3 %, and one render at aspect 0.78.
// Three words did most of the damage and are removed:
//   * "bare twigs"  — asking for bare twigs gets bare twigs. Now the twigs are
//     described as CARRYING and being HIDDEN BY leaf tufts.
//   * "scrubby"     — as the head noun it pulls the whole plant towards dead
//     desert scrub. Back to "leafy shrub", with the openness carried by the
//     separate airiness sentence instead of by the noun.
// The airiness wording is kept but made a property of the LEAF COVER rather
// than of the whole plant: the gaps are between leaf clumps, not instead of
// leaves. "You can see straight through the plant" / "daylight comes through"
// are dropped for the same reason.
//
// ── r3: the colour block and the deadness are INDEPENDENT levers ─────────────
// r2 also softened the colour block back towards green ("warm khaki-olive
// green", brown/buff/bleached removed) AND dropped the per-shape fade clause,
// on the assumption that r1's dead look and r1's low G/R were the same problem.
// They are not, and r2 proved it the expensive way: all five renders came back
// at raw G/R 1.21..1.49, i.e. GREENER than run 1 ever was (1.01..1.24) and a
// full 0.6 above r1. Every seed pre-rejected, five generations spent to learn
// one thing.
//
// The three measured points, all raw G/R, mean over the measurable variants:
//     run 1  green anchor (sage/moss led) + fade clause on 3 of 5   1.12
//     r1     khaki anchor (khaki/brown/buff/bleached) + clause on 5 0.83
//     r2     khaki-olive-GREEN anchor, no clause                    1.42
// Differencing run 1's clause-carrying variants against its clause-free ones
// puts the per-shape fade clause at about -0.16, so the anchor colour block on
// its own accounts for ~0.43 of the swing and is by far the dominant lever.
//
// r3 therefore restored r1's colour block almost verbatim — it is the only
// calibrated point near the target (0.83 with the clause, so ~0.99 without) —
// while KEEPING every r2 motif fix.
//
// ── r4: the colour block is a WEAK lever; the MOTIF is the colour lever ──────
// r3 was wrong, and cheaply falsified: with r1's colour block back in place and
// only the motif words changed, ten seeds came back at raw G/R 1.24..1.56 —
// statistically indistinguishable from r2's 1.21..1.49, which had no khaki
// colour block at all. Reading the two experiments together:
//
//     anchor colour block   motif words          raw G/R
//     khaki / brown / buff  scrubby, sparse,     0.82..1.05   (r1)
//                           wiry, bare twigs,
//                           scrub, sun-bleached
//     khaki-olive-green     leafy, well covered  1.21..1.49   (r2)
//     khaki / brown / buff  leafy, well covered  1.24..1.56   (r3)
//
// Swapping the colour block with the motif held constant (r2 -> r3) moved G/R
// by ~0.04. Swapping the motif with the colour block held constant (r1 -> r3)
// moved it by ~0.45. The colour list is nearly a no-op; what flux is actually
// keying on is whether the plant is ALIVE. Alive and leafy renders green, dead
// and dry renders brown, and the colour adjectives barely bend either.
//
// That coupling is the whole problem, because the brief needs all three of
// leafy, airy and warm-khaki at once. r4 breaks it with three levers that give
// warmth WITHOUT asking for a dead plant:
//   1. SPECIES ANCHOR. Real plants exist that are fully in leaf and genuinely
//      khaki — olive, saltbush, rabbitbrush, wormwood. Naming olive foliage
//      gives flux a live-plant referent whose leaves are already the target
//      colour. ("Sage" is the obvious other one and stays banned: run 1
//      documented that the word buys cold, R/B ~1.1, not warm.)
//   2. AN EXPLICIT SEPARATOR SENTENCE that says in as many words that the plant
//      is alive and in full leaf but its colour is khaki rather than green.
//      This is the only wording that addresses the coupling head-on.
//   3. THE DUST CLAUSE BACK IN THE FORM, first position. Run 1 measured it at
//      about -0.16 on G/R, and — unlike every other warm-word lever — it
//      demonstrably does NOT cause deadness: the three run-1 variants that
//      carried it were lush solid hedge balls. It is the one proven lever that
//      buys warmth and costs no leaves. It is reinstated colour-only, without
//      run 1's "faded to ... straw-tan" tail, which is the notch that took r1
//      to rust at R/B 2.43.
//
// r4 probe (shape 0, seeds 880111 / 880118): the species anchor WORKS — this is
// the first wording that produced a plant in full leaf at a warm colour. It
// simply produced too much of it. Measured: raw G/R 0.79 (one seed rusted out
// at R/B 3.03), final 0.83 against a 0.88 floor, sat 36.7 % against a 40 %
// floor. Shape was excellent on the same render: aspect 1.08, fill 38.9 %.
//
// ── r5: trim one lever, fix the base ────────────────────────────────────────
// COLOUR. r3 sat at raw 1.38, r4 at 0.79, and the target is ~0.95. The three
// r4 levers are worth ~0.6 together; the dust clause is the one of the three
// with a measured individual value (-0.16) and the one whose removal also buys
// back saturation, so it is the lever to drop. The species anchor and the
// separator sentence stay — they are what made the plant leafy AND warm at the
// same time, which nothing before r4 managed. Predicted raw G/R ~0.95.
//
// BASE. The r4 probe failed the trunk guard at 11.0 % and the render shows why:
// a clean fan of bare woody stems for the bottom third, leaves only above it.
// This is the run-1 sapling failure returning through a new door — r1..r4 all
// weakened the ground-contact wording (run 1's "solid leaf right down to the
// ground") to stop it forcing a solid mass, and "slender twigs fan out low from
// the very base" turns out to be an active INVITATION to draw a visible stem
// fan. r5 keeps the twigs but moves the emphasis to what has to be at the very
// bottom edge, and says it in terms of the SILHOUETTE, which is what the guard
// actually measures.
const ANCHOR =
  'a semi-realistic painted video game asset, one single small leafy shrub, three-quarter view from ' +
  'slightly above, cut out on a plain flat mid grey backdrop, nothing underneath it: no ground, no soil, ' +
  'no grass, no pot, no shadow, its foliage is open and airy, small leaves in separate tufts with gaps of ' +
  'empty space between them, ragged broken outline, many thin stems rise straight out of the ground and ' +
  'spread apart, its lowest leafy shoots sweep down and brush the ground, the leaves are dusty khaki-olive, ' +
  'muted olive green softened with warm tan and straw, alive and in full leaf but khaki not bright green, ' +
  'light from the upper left, deep shade inside, matte painterly brushwork, muted earthy colours, ' +
  'low and squat, at least as wide as it is tall, centered with an empty margin';

// Folded into the prompt (flux-pro/v1.1 has no negative_prompt input) and kept
// SHORT so it survives the encoder window — see the PROMPT BUDGET note above.
// Only the four failure modes this set has actually produced are listed: the
// sapling/trunk, the clipped hedge ball, the dead leafless twig bundle, and a
// baked-on floor. Everything else that used to be here (60+ clauses on flowers,
// snow, cel shading, watermarks, low-poly, cactus, bamboo...) was never encoded
// and is dropped rather than carried as decoration.
const NEGATIVE =
  'Not a tree, not a sapling, no trunk, no bare stem, no grass, no lawn, no tuft of grass at its base, ' +
  'not a clipped hedge ball, not a topiary, not bare, not leafless, no flowers, no floor, no pot.';

const buildPrompt = (shape) => `${shape.form} ${ANCHOR}. ${NEGATIVE}${shape.negExtra ? ` ${shape.negExtra}` : ''}`;

// Hard budget guard. The whole point of the rewrite above is that text past the
// encoder window is not merely weak, it is ABSENT — so silently growing the
// prompt again would reintroduce exactly the bug that cost this run a dozen
// generations. 1200 characters is the empirically safe window (see header);
// anything longer throws before a single fal credit is spent.
const PROMPT_BUDGET = 1200;
function assertPromptFits(shape, idx) {
  const p = buildPrompt(shape);
  if (p.length > PROMPT_BUDGET)
    throw new Error(
      `SHAPES[${idx}] prompt is ${p.length} chars, over the ${PROMPT_BUDGET} budget — the tail would be ` +
        `silently dropped by the text encoder. Shorten the form or the anchor instead of appending.`,
    );
  return p;
}

// Five silhouettes. The HEAD NOUN is the aspect lever (see header): "bush" alone
// tends to a round dome (~1.1..1.3); "spreading" / "clump" / "thicket" widen it.
// Canvases are a fine trim only, matched roughly to the intended aspect.
// Seed range 87xxxx keeps this set traceable apart from rock (85xxxx) and
// driftwood (93xxxx).
//
// RUN 2 seeds are 88xxxx (run 1 was 87xxxx), so a git archaeologist can tell at a
// glance which run a raw file came from. Every run-1 comment block below is kept
// verbatim — it is the record of which levers were tried and what they cost.
const SHAPES = [
  {
    // Baseline dome. Roundest of the five, expected near the bottom of the band.
    // ── run 1 ──────────────────────────────────────────────────────────────
    // 870101, canvas 1024x960 -> aspect 1.41, lum 56.9, G/R 1.185, fill 69.7 %.
    // Shipped, then rejected in the emulator review: too green, too wide, and
    // the densest of all five. All three run-2 corrections apply here.
    // ── run 2 ──────────────────────────────────────────────────────────────
    // Width: the run-1 form carried "the leaf mass slightly wider than it is
    // high" — one explicit width driver — on a 1.067 canvas and landed 1.41.
    // Both are removed: the driver is dropped and the canvas goes to 960x1024
    // (0.9375), two steps narrower. Density: "dense evenly domed crown" is
    // exactly the hedge-ball instruction, replaced by open tufted growth.
    // r1 (880101, canvas 960x1024) -> raw G/R 1.05, pre-rejected as green. No
    // aspect reading. Canvas goes to square 1024x1024: 960x1024 was chosen as
    // two steps narrower than run 1, but it took shape 3 to aspect 0.78, so the
    // portrait canvas is too strong a lever for this set.
    // Airy renders grow UPRIGHT where dense ones sprawled: on the square canvas
    // this form measured aspect 0.81, against run 1's 1.41 on a landscape one.
    // The whole set's canvases were sized for hedge balls and are now too tall.
    // 1152x896 (1.286) plus one width driver in the form.
    // 1024x1024 measured 0.81..1.27, 1152x896 measured 1.31/1.45 -> 1088x928.
    // Seed 880118 passed every numeric check (base cover 24.1 %) and was
    // rejected on sight: a sapling on ONE woody trunk with a grass tuft at its
    // foot, the grass alone carrying the base score. It is the render the
    // ankle guard was built from (ankle cover 11.6 % against 56..70 % for the
    // other four). Cause is in this form: "its twigs spraying outwards and
    // upwards" names no origin for the twigs, and flux supplies a trunk for
    // them to spray FROM. Replaced with an explicit multi-stem origin at
    // ground level, which is the positive form of "no trunk".
    // The multi-stem wording fixed the stem (ankle 11.6 % -> 80.0 %) but
    // "rising STRAIGHT from the ground" is a vertical driver: three renders
    // measured 0.97/0.98/0.98 on 1088x928. "Straight" -> "spreading outwards",
    // and the canvas widens 1.172 -> 1.357 (1216x896).
    // Seed 880153 then failed the new contrast floor at 0.47 (flat and murky,
    // tone factor 0.499). Re-rolling exposed a second problem specific to this
    // form: leading with THIN STEMS gives thin ankles — 30.0 % and 13.3 %
    // against a 50 % floor. The multi-stem origin has to stay (it is what keeps
    // the trunk away), so the leaf cover low down is stated alongside it.
    // That fixed the ankle (63..80 %) but 1216x896 with the added low-foliage
    // wording ran wide, 1.27..1.53. Canvas back to 1056x976 (1.082), and the
    // same warm word that fixed shape 2's green skew moved into this form.
    // ACCEPTED seed 880230: aspect 1.21, G/R 0.95, fill 44.7 %, ankle 72.1 %,
    // contrast 0.58, base 42.1 %.
    seed: 880230,
    gen: { w: 1056, h: 976 },
    form:
      'One small open shrub, a little wider than it is high, many thin stems rising from the ground and ' +
      'spreading out, its dusty khaki leaves thick low down as well as on top.' +
      ' Its lowest shoots sweep down to hide its base.',
  },
  {
    // Widest of the five.
    // r1 (870201/870208/870215, canvas 1152x832) -> 2.35 .. 2.82, far over the
    // 1.60 cap on every seed. Not seed luck: the v1 wording stacked FIVE width
    // drivers at once ("low spreading", "sprawling out sideways", "broad
    // flattened leaf cushion", "much wider than it is high", "long low outer
    // shoots draped down on the left and on the right") and flux resolved the
    // sum as a hedge-like band. Exactly the elongation-vocabulary trap logged in
    // props-rock-sand-generate.cjs SHAPES[1].
    // r2 keeps ONE width driver — the head-noun modifier "low spreading bush",
    // which is the lever that actually works — drops the other four, and adds
    // the band-shape archetypes to the negatives. Canvas deliberately unchanged
    // so the wording change is measurable on its own. Target ~1.5, i.e. the wide
    // end of the set (the other four measure 1.03..1.41).
    // r2 (870221 / 870228 / 870235) -> aspect 1.59 / hue-reject / 1.56. The
    // aspect problem is SOLVED by the wording change. New blocker: saturation
    // 56.1 % and 65.4 %, i.e. over the 55 % cap on both measurable samples — this
    // form renders juicier foliage than the other four (which land 47..54 %),
    // because dropping the woody "shoots draped to the ground" also dropped the
    // dark twiggy pixels that were pulling the mean down.
    // r3 adds a dust/fade clause to the FORM (first position, strongest) rather
    // than to the shared ANCHOR: the anchor string is what seeds 870101 / 870308
    // / 870408 / 870508 were drawn against, and editing it would make those four
    // unreproducible. Aspect wording is left untouched.
    // r3 (870241 / 870248 / 870255, canvas 1152x832) -> sat 48.9 / 42.1 / 41.1 %:
    // the dust clause SOLVED saturation on all three. It cost ~0.15 aspect
    // though (r2 1.56..1.59 -> r3 1.69..1.90), presumably because a dust-caked
    // cushion reads flatter. Both levers are now aimed correctly but overshoot
    // by one step, so r4 changes CANVAS ONLY — 1152x832 (ratio 1.385) ->
    // 1024x960 (1.067) — and leaves every word of r3 in place.
    // r4 (870261 / 870268 / 870275, canvas 1024x960) -> the canvas bought only
    // ~0.1 aspect (1.67), and the STRONG dust clause had meanwhile over-shot
    // colour: R/B 1.29 / 1.10 / 1.09, i.e. two of three renders came back
    // grey-green and were rejected by the hue pin before the tone step, and the
    // third measured sat 39.3 %, under the 40 % floor. Full sweep for this form:
    //     r2  no dust,     1152x832 -> aspect 1.56..1.59, sat 56..65 %
    //     r3  strong dust, 1152x832 -> aspect 1.69..1.90, sat 41..49 %
    //     r4  strong dust, 1024x960 -> aspect 1.67,       sat 39 %, R/B 1.09..1.29
    // Every combination puts one of the three bands out. r5 therefore stops
    // chasing an EXTRA-WIDE shape 1 and re-aims all three levers at band centre:
    //   - width driver softened, "low spreading bush" -> "low broad bush"
    //     (r2 proved "spreading" alone is worth ~1.57; the other four measure
    //     1.03..1.41, so a mid-band shape 1 also TIGHTENS the set's aspect
    //     spread, which is what the single shared heightFactor needs);
    //   - dust clause reduced to one mild sentence (r3 proved a strong one moves
    //     saturation ~15 points and takes R/B down with it);
    //   - canvas kept at the narrower 1024x960 from r4.
    // r5 (870281 / 870288 / 870295 / 870302) -> aspect 1.74, then three renders
    // rejected at R/B 1.03 / 1.06 / 1.09. Isolated cause: the word GREY. Every
    // shape-1 form carrying "grey-green" or "dust" pulled the render's R/B from
    // ~1.7 down to ~1.1, i.e. the desaturation was bought by going COLD, which
    // is precisely what PRE_RB_MIN exists to refuse. Long "cushion / spreading /
    // shoots reaching down" wording also stayed wide (1.67..1.74) regardless of
    // canvas.
    // r6 rewrites the form from scratch, short, with exactly one lever each:
    //   width       "broad flat-topped crown ... clearly wider than it is high"
    //   saturation  "sun-dried", "faded" — but faded TOWARDS WARM KHAKI AND
    //               STRAW-TAN, never towards grey, so the fade lowers the green
    //               without lowering R/B
    // Canvas stays 1024x960 (shape 0 lands 1.41 on it, and this form carries one
    // extra width driver, so ~1.5 is the expectation).
    // 870321 -> aspect 1.41, sat 45.3 %, R/B 1.63, lum 56.8. Accepted on the
    // first seed of r6 — all three bands hit at once.
    // ── run 2 ──────────────────────────────────────────────────────────────
    // This stays the BROADEST of the five, but "clearly wider than it is high"
    // is dialled back to "a little wider than it is high": run 1 landed 1.41 on
    // the strong wording and the cap is now 1.30. "Broad flat-topped crown of
    // dense small leaves ... thickest close to the ground" is the densest form
    // sentence in the set and is replaced by an open flat-topped spray.
    // The warm-fade clause is KEPT and strengthened from "faded towards warm
    // khaki and straw-tan" to leading with khaki, because run 1 proved this
    // exact wording lowers saturation without dragging R/B down — and it is
    // also the G/R lever. Note the run-1 measurements: the two variants that
    // carried this clause (shapes 1 and 4) are also the two least green of the
    // set at G/R 1.040 and 1.014, versus 1.13..1.24 for the three without it.
    // That is the strongest single piece of evidence available for the run-2
    // colour rewrite, so the clause now goes on all five forms.
    // r1 (880201, canvas 1024x960) -> R/B 2.43, hue-rejected: rust. This is the
    // documented "one notch too far" trap, and here it was caused by the fade
    // clause DOUBLING with the khaki-led anchor rewrite. The clause is dropped
    // from all five forms in r2 — with the anchor now carrying the warm-khaki
    // vocabulary, a second per-shape fade is one notch too many. It also cost
    // saturation: r1 measured 39.6..43.0 % against a 40 % floor.
    // r-final: 1024x960 measured 1.03, close to the 1.00 floor -> 1088x928.
    // ACCEPTED seed 880225: aspect 1.17, G/R 0.97, fill 53.6 %, base 33.5 %,
    // sat 38.2 %, lum 57.0. Visually the reference render for the whole run —
    // broken outline, gaps through the crown, leafy to the ground, no stem.
    seed: 880225,
    gen: { w: 1088, h: 928 },
    form:
      'One single low open shrub with a broad flat-topped spray of leafy twigs, a little wider than it is high, ' +
      'thickest low down and thinning to a ragged open edge.' +
      ' Its own lowest leafy shoots sweep down and hide its base.',
  },
  {
    // Two-lobed clump: adds silhouette variety without changing density.
    // 870301 failed the validator on the first pass (exact reason not captured —
    // console log truncated). 870308 then passed all SIX numeric checks
    // (aspect 1.03, lum 57.0, R/B 1.62, sat 47.1 %) and was still unusable: on
    // visual inspection it was a small multi-stem TREE with bare woody trunks
    // under the crown. That render is what the BASE_COVER_MIN guard was built
    // from — it measures 6.2 % base cover against 44..46 % for a real bush.
    // Cause: "two leafy LOBES ... the taller on the left ... leaning out to the
    // right" describes a canopy, and a canopy implies something holding it up.
    // r2 keeps the two-part silhouette but renames the parts to MOUNDS (a mound
    // sits on the ground by definition) and states the merged leafy skirt at the
    // base in the form itself, where it outranks the shared anchor.
    // r2 (870331 ff.) -> trunk SOLVED (base cover 37 %), but the long two-sentence
    // ground-contact clause cost width and colour: aspect 1.69, sat 66.1 %.
    // r3 keeps the mound vocabulary, compresses the ground contact to the four
    // words that carry it ("solid leaf right down to the ground"), and bolts on
    // the warm-fade clause that fixed shape 1's saturation without dragging R/B
    // down (fade towards KHAKI/STRAW, never towards grey — see SHAPES[1] r5/r6).
    // r3 (870361 / 870368 / 870375 / 870382) -> aspect 1.09 / — / 1.84 / 1.12,
    // sat 48.3 / — / 51.4 / 60.5 %, base 3.0 / — / 30.2 / 65.7 %. Four seeds,
    // four DIFFERENT bands missed and no two the same: that is seed noise around
    // a correctly-aimed prompt, not a systematic fault, so the wording is only
    // nudged rather than rewritten. The one repeat offender is saturation, so
    // the fade clause was strengthened by one notch in r4 ("faded well down",
    // plus olive-ochre alongside khaki/straw). ("Bleached" was deliberately not
    // tried — props-driftwood-generate.cjs documents it as an overwhelming white
    // attractor.)
    // r4 (870391 / 870398 / 870405 / 870412 / 870419) -> R/B 2.43 / 3.18 / 2.53 /
    // 3.30 / 2.22: the stronger fade blew straight past warm into RUST, and four
    // of five renders were hue-rejected before the tone step. One notch of
    // "olive-ochre" is worth ~+0.6 R/B. Reverted.
    // r5 = r3 verbatim, and the answer to r3's scatter is simply more seeds:
    // r3's five measurable bands failed independently (one aspect, one
    // saturation, one trunk), which is noise around a correctly aimed prompt.
    // r5 seeds: 870431 hue-reject (R/B 2.39), 870438 aspect 2.07,
    // 870445 -> aspect 1.03, sat 50.9 %, base 71.7 %, lum 57.0 — PASSED all
    // seven numeric checks and was rejected on VISUAL inspection: a tightly
    // clipped garden TOPIARY, a tall cone next to a ball. The trunk guard cannot
    // see this, and the negatives already contain "not a topiary" / "NOT
    // conical" / "NOT a cone" — the form beat them, because "two mounds of
    // unequal height ... the TALLER mound on the left" explicitly asks for a
    // vertical element, and a vertical clipped element is a topiary.
    // r6 drops the two-mound construction that has now failed three different
    // ways (trunks in r1, hedge-width in r2/r3, topiary in r5) and gets its
    // silhouette variety from ONE lopsided plant instead. Note that shape 4
    // still carries a two-mound motif — that one works precisely because its
    // second mound is small and overlapped, so no separate vertical body forms.
    // 870461 -> aspect 1.24, sat 47.2 %, base 39.4 %, accepted.
    // ── run 2 ──────────────────────────────────────────────────────────────
    // The lopsided single plant from r6 is the right motif and is kept — it is
    // the only construction that survived all three run-1 failure modes. Two
    // edits only: "solid leaf right down to the ground" (a direct instruction
    // to fill in, and one of the reasons this variant measured 63.7 % fill)
    // becomes leafy-but-open ground contact, and the crown is opened up.
    // Canvas 1088x896 (1.214) -> 1024x960 (1.067); run 1 landed 1.54 here.
    // r1 (880301, canvas 1024x960) -> aspect 1.29, fill 40.9 %, base 30.1 %,
    // sat 43.0 %, lum 56.6 — every band hit except G/R 0.86 (floor 0.88), and
    // visually it was dry winter scrub with barely any leaf on it. Both are the
    // shared anchor's fault, not this form's, so the form is only detwigged a
    // little and the canvas is left alone. This is the run-2 aspect reference
    // point: 1024x960 with a lopsided single plant = 1.29.
    // r-final: 1024x960 measured 1.44/1.61 -> 960x1024 measured 1.25/1.37/1.56.
    // Still the widest shape of the five, so one more step: 880x1024 (0.859),
    // which measured 1.02..1.20 — in band. The remaining problem was colour:
    // across nine renders this form averaged G/R 1.06 against ~0.95 for the
    // other four, i.e. a systematic skew, not seed noise. "Bushy clump" plus
    // "leaf tufts piled" renders a lusher plant. Head noun softened to "shrub"
    // and one warm word ("dusty khaki") moved into the form, which is the
    // strongest position in the prompt.
    // That colour fix worked (G/R 1.04..1.14 -> 0.89..0.92) but softening the
    // head noun also removed the width it was supplying: aspect fell to
    // 0.67..1.10 on 880x1024. The canvas pays it back — 1088x912 (1.193).
    // ACCEPTED seed 880437: aspect 1.19, G/R 0.98, fill 49.7 %, base 32.7 %.
    seed: 880437,
    gen: { w: 1088, h: 912 },
    form:
      'One single open shrub with a lopsided off-centre shape, its dusty khaki leaf tufts piled higher on ' +
      'the left and sloping to a low shoulder on the right.' +
      ' Its lowest shoots sweep down to hide its base.',
  },
  {
    // Ragged / windswept: uneven crown, densest of the five in the middle.
    // 870401 -> rejected BEFORE the tone step: R/B 2.41, i.e. the render came
    // back rust/autumn-warm past the hue-pin cap. Seed-only re-roll (the anchor
    // already excludes autumn colour; one render drifting is noise, not a
    // systematic prompt fault).
    // 870408 -> aspect 1.19, accepted. Narrowest of run 1 and the closest to the
    // run-2 aspect band already, but it measured G/R 1.244 — the greenest of
    // all five — and it is the one form that never carried the warm-fade clause
    // in run 1. It gets it now.
    // ── run 2 ──────────────────────────────────────────────────────────────
    // "One single DENSE bush ... thick and heavy in the middle" is the direct
    // cause of its 58.1 % fill and is inverted. The wind-combed raggedness and
    // the loose shoots are kept — they are already airiness vocabulary and this
    // was visually the least hedge-like of run 1. Canvas 1088x896 -> 960x1024
    // to bring 1.19 down towards the middle of the new band.
    // r1 (880401, canvas 960x1024) -> aspect 0.78, fill 13.3 %, and visually a
    // BARE SAPLING on a single stem: the worst render of either run. This form
    // stacked every airiness driver the set has ("wiry", "thin twigs leaning
    // together", "sparse tufts", "thinning out into bare twig tips", "wide gaps
    // of empty space") on top of an anchor that already asked for bare twigs,
    // on the one canvas that was portrait. All four are reverted: canvas back
    // to landscape 1024x960, "wiry"/"bare twig tips"/"wide gaps" removed, and
    // the wind-combed raggedness — which is this variant's actual identity and
    // was already airiness vocabulary in run 1 — left to carry the openness on
    // its own. Note run 1 measured 1.19 here on 1088x896 while being dense, so
    // a landscape canvas is not what made it wide.
    // r-final: 1024x960 measured 0.90/0.93/0.97, too tall -> 1152x896.
    // ACCEPTED seed 880432: aspect 1.18, G/R 0.94, fill 53.0 %, base 47.2 %.
    seed: 880432,
    gen: { w: 1152, h: 896 },
    form:
      'One single leafy shrub with a ragged wind-combed shape, its leaf tufts combed to one side, a few loose ' +
      'shoots sticking out of the top and leaning right.' +
      ' Its own lowest leafy shoots sweep down and hide its base.',
  },
  {
    // Widest silhouette variety: a small thicket of two bushes side by side.
    // 870501 -> aspect 1.70 (over the cap) AND sat 57.5 % (over the cap). Both
    // are the same render being "more": two full-size plants spread wide and a
    // vivid green. Seed-only re-roll — "thicket" is the motif and the wording
    // carries only one width driver already.
    // 870508 -> aspect 1.37, sat 47.5 %: numerically clean, visually two small
    // TREES on bare stems (base cover 4.1 %, i.e. worse than shape 2's failure).
    // Same cause, stronger: "two bushes STANDING right beside each other" —
    // "standing" plus two separate plants is a grove, and flux draws a grove with
    // trunks. r2 replaces the two plants with two leafy MOUNDS that "sit" and
    // "rest on the ground", and moves the ground contact into the form.
    // r2 (870531 / 870538 / 870545 / 870552) -> trunk SOLVED (base cover
    // 48..72 %) but aspect exploded to 2.44 / 2.60 / 2.61 / 3.77. Cause is
    // isolated: "one wide low BAND of foliage that rests on the ground ALONG ITS
    // WHOLE LENGTH". Asking for ground contact in a phrase that also contains
    // "band" and "length" makes flux draw a hedge.
    // r3 states the ground contact in the same compressed form as shape 2
    // ("solid leaf right down to the ground"), drops every band/length word,
    // adds the khaki/straw warm-fade clause for saturation, and narrows the
    // canvas 1152x832 -> 1024x960.
    // r3 (870561 / 870568 / 870575 / 870582, canvas 1024x960) -> aspect 1.92 /
    // 1.68 / — / 1.73. Trunk and colour are fine now (base 30..41 %), but the
    // aspect mean sits at ~1.78 on every seed: two mounds placed SIDE BY SIDE
    // are inherently one-and-a-bit mounds wide, and no canvas trims that.
    // r4 attacks the geometry instead of the adjectives — the second mound is
    // made much smaller and OVERLAPPED by the first, so the pair still reads as
    // a thicket but occupies barely more width than a single bush.
    // 870591 -> aspect 1.56, sat 40.8 %, base 43.9 %, lum 56.8. Accepted on the
    // first seed of r4: making the second mound overlap fixed the width without
    // touching a single colour or tone word.
    // ── run 2 ──────────────────────────────────────────────────────────────
    // The overlap geometry is the load-bearing part and is untouched — it is
    // what got the pair from 1.78 down to 1.56, and 1.56 is still the widest of
    // run 1, so this variant needs the most width work of the five. The word
    // MOUND is the problem now: a mound is by definition a solid heap, and this
    // was needed in run 1 only to beat the trunk failure. With the anchor now
    // carrying explicit ground-level multi-stem wording the mounds can become
    // clumps, which drops both the density and, being less heaped, the width.
    // "Solid leaf right down to the ground" goes, same as in shape 2.
    // r1 (880501, canvas 1024x960) -> aspect 1.54, fill 49.7 %, base 27.6 %,
    // G/R 0.93, sat 39.6 %. Fill and colour are the best of r1; aspect is the
    // problem and it is structural, not verbal: run 1 measured 1.56 and r1
    // measured 1.54 on the same canvas through two complete form rewrites, so
    // two clumps side by side simply cost ~0.25 of aspect over a single plant.
    // The fix is therefore the canvas, sized from that constant: 1.54 * (896/1024)
    // / (1024/960) = 1.26, so 896x1024. That is the most portrait canvas in the
    // set, which is safe HERE and nowhere else — the form explicitly describes
    // two LOW clumps sitting side by side, so there is no vertical element for
    // a portrait frame to stretch (contrast shape 3 r1, where a portrait canvas
    // met a single wiry plant and produced a sapling).
    // r-final: 896x1024 measured 1.22/1.27/1.39 -> 832x1024 measured 0.93..1.24.
    // Densest form of the five (fill 47.9..59.3): the two-clump motif carried no
    // airiness driver of its own, so one is added to the form.
    // ACCEPTED seed 880553: aspect 1.07, G/R 1.00, fill 50.7 %, base 36.2 %.
    seed: 880553,
    gen: { w: 832, h: 1024 },
    form:
      'A small low thicket of two open leafy clumps, a bigger one with a much smaller one at its front left, ' +
      'mostly overlapped, gaps showing between their twigs.' +
      ' Its lowest shoots sweep down to hide its base.',
  },
];


// ══════════════════════════════════════
// HTTP helpers
// ══════════════════════════════════════

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        if (res.statusCode >= 400) {
          reject(new Error(`fal ${res.statusCode}: ${raw.slice(0, 400)}`));
          return;
        }
        resolve(raw);
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
function get(url, headers) {
  const u = new URL(url);
  return request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers });
}
function post(host, p, body) {
  return request(
    {
      hostname: host,
      path: p,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
    },
    JSON.stringify(body),
  );
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function download(url) {
  return new Promise((resolve, reject) => {
    const go = (u) => {
      const mod = u.startsWith('https') ? https : http;
      mod
        .get(u, (res) => {
          if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
            go(res.headers.location);
            return;
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        })
        .on('error', reject);
    };
    go(url);
  });
}

// ══════════════════════════════════════
// Step 1 — generate
// ══════════════════════════════════════

async function generate(shape, seed) {
  const submit = JSON.parse(
    await post('queue.fal.run', '/fal-ai/flux-pro/v1.1', {
      // Form FIRST — appended after the long anchor it gets ignored.
      prompt: assertPromptFits(shape, SHAPES.indexOf(shape)),
      image_size: { width: shape.gen.w, height: shape.gen.h },
      num_images: 1,
      enable_safety_checker: false,
      safety_tolerance: '5',
      output_format: 'png',
      seed,
    }),
  );
  if (!submit.status_url) throw new Error('submit failed');
  process.stdout.write('    gen');
  for (let i = 0; i < 150; i++) {
    await sleep(2000);
    const st = JSON.parse(await get(submit.status_url, { Authorization: `Key ${FAL_API_KEY}` }));
    if (st.status === 'COMPLETED') {
      const r = JSON.parse(await get(submit.response_url, { Authorization: `Key ${FAL_API_KEY}` }));
      process.stdout.write(' ok\n');
      return download(r.images[0].url);
    }
    if (st.status === 'FAILED') throw new Error(`generation failed: ${JSON.stringify(st).slice(0, 200)}`);
    process.stdout.write('.');
  }
  throw new Error('generation timeout');
}

// ══════════════════════════════════════
// Step 2 — background removal + alpha cleanup
// ══════════════════════════════════════

async function removeBackground(png) {
  process.stdout.write('    birefnet');
  const r = JSON.parse(
    await post('fal.run', '/fal-ai/birefnet/v2', {
      image_url: `data:image/png;base64,${png.toString('base64')}`,
    }),
  );
  if (!r?.image?.url) throw new Error('birefnet returned no image');
  process.stdout.write(' ok\n');
  return download(r.image.url);
}

// Foliage has a far more broken edge than a boulder: birefnet leaves a wide band
// of low alpha around the leaf fringe, and on a grey backdrop that band carries
// grey pixels. The window is tighter than the rock script's 40..205 so the fringe
// is cut rather than feathered — a light halo around a dark bush is very visible
// on the dark plains tile.
const ALPHA_LO = 60;
const ALPHA_HI = 200;
function alphaLevels(data) {
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a <= ALPHA_LO) data[i] = 0;
    else if (a >= ALPHA_HI) data[i] = 255;
    else data[i] = Math.round(((a - ALPHA_LO) / (ALPHA_HI - ALPHA_LO)) * 255);
  }
}

// Speck threshold is LOWER than the rock script's 0.02: a legitimate outlying
// leafy shoot can be a genuinely small blob, and shape 4 is two plants of
// different size touching — 2 % of the biggest blob would risk eating the small
// one if birefnet separates them.
function removeSpecks(data, w, h, minFrac = 0.005) {
  const n = w * h;
  const label = new Int32Array(n).fill(-1);
  const sizes = [];
  const stack = new Int32Array(n);
  let next = 0;
  for (let s = 0; s < n; s++) {
    if (data[s * 4 + 3] === 0 || label[s] !== -1) continue;
    let sp = 0;
    stack[sp++] = s;
    label[s] = next;
    let size = 0;
    while (sp > 0) {
      const p = stack[--sp];
      size++;
      const px = p % w;
      const py = (p - px) / w;
      for (const [ox, oy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = px + ox;
        const ny = py + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (label[q] !== -1 || data[q * 4 + 3] === 0) continue;
        label[q] = next;
        stack[sp++] = q;
      }
    }
    sizes.push(size);
    next++;
  }
  if (sizes.length <= 1) return 0;
  const biggest = Math.max(...sizes);
  let dropped = 0;
  for (let p = 0; p < n; p++) {
    const l = label[p];
    if (l >= 0 && sizes[l] < biggest * minFrac) {
      data[p * 4 + 3] = 0;
      dropped++;
    }
  }
  return dropped;
}

async function cleanAlpha(nobgPng) {
  const { data, info } = await sharp(nobgPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  alphaLevels(data);
  const dropped = removeSpecks(data, info.width, info.height);
  if (dropped > 0) console.log(`    specks removed: ${dropped}px`);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

// ══════════════════════════════════════
// Step 3 — tight crop
// ══════════════════════════════════════

async function alphaBBox(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('image is fully transparent');
  return { minX, minY, maxX, maxY, w, h };
}

async function tightCrop(png) {
  const b = await alphaBBox(png);
  return sharp(png)
    .extract({ left: b.minX, top: b.minY, width: b.maxX - b.minX + 1, height: b.maxY - b.minY + 1 })
    .png()
    .toBuffer();
}

// ══════════════════════════════════════
// Step 4 — tone normalisation (bidirectional, hue-pinned)
// ══════════════════════════════════════
//
// Taken over from props-rock-sand-generate.cjs and re-aimed:
//   * bidirectional factor, guarded on both sides;
//   * hue pin FIRST (symmetric R/B rotation, kR * kB = 1, G untouched), then the
//     luminance pin computed on the hue-pinned pixels, so the stated target is
//     what lands in the file;
//   * a uniform multiply cannot MANUFACTURE colour — a blue-green render stays
//     blue-green when scaled. PRE_RB_MIN therefore REJECTS a cold render instead
//     of tinting it, and HUE_MAX_K caps how far the pin may pull.
//
// Note on saturation: a uniform per-channel multiply is scale-invariant for
// (max-min)/max, so the tone step CANNOT move the saturation metric; only the
// hue pin can, and only slightly. Saturation is therefore a generation property
// and is validated, not corrected.

// 57 — centre of the 50..64 brief. The ground sits at 66.3, so this puts the
// bush a clear step darker without dropping it to the near-black end where the
// four tree variants at 45..50 already live.
const TONE_TARGET_LUM = 57;
// 0.55, raised from 0.40 in run 2. The tone step can pin the MEAN luminance but
// it cannot restore modelling: multiplying an over-exposed render down by 2x
// collapses its highlights and yields a flat murky sprite. The correlation is
// clean across the accepted run-2 renders — factor 0.499 -> contrast 0.47,
// 0.609 -> 0.56, 0.643 -> 0.67, 0.648 -> 0.66, 0.698 -> 0.70. The 0.499 render
// was the one visibly washed-out member of the set. 0.55 rejects a render whose
// mean luminance exceeds ~104 (against the 57 target) and asks for a new seed
// instead of darkening a bad exposure into mud.
const TONE_MIN_FACTOR = 0.55; // render came out far too bright -> reroll
const TONE_MAX_FACTOR = 1.5; // render came out far too dark  -> reroll
// Cold-render reject. The tundra shrubs that must NOT be copied measure R/B
// 0.88..0.91; a default "bush" render often comes back emerald at R/B ~0.9..1.0.
// 1.05 is the line below which the hue pin would have to invent warmth.
const PRE_RB_MIN = 1.05;
// GREEN-render reject (run-2 fix 1), taken over from props-grass-generate.cjs.
//
// This guard is necessary because the hue pin CANNOT fix greenness. The pin is a
// symmetric rotation on the R:B axis with kR * kB = 1 and G deliberately left
// alone, so it moves R/B and only incidentally moves G/R (by 1/kR, i.e. a few
// percent). The luminance factor multiplies all three channels equally and is
// exactly neutral on G/R. So whatever greenness comes out of flux is essentially
// what ships — and no multiply can convert green leaves into warm khaki ones; it
// only darkens them into mud. The correct response is a new seed.
//
// Threshold 1.05 rather than the final band's 1.02: this fires on the RAW render
// before the pin, and the pin still has a few percent of authority left (for a
// render on the cool side of RB_TARGET, kR > 1 and G/R drops accordingly). The
// same 0.03..0.05 gap between the pre-gate and the final gate exists in the
// grass script (PRE_GR_MAX 1.00 / GR_MAX 0.95).
//
// Calibration: run 1 shipped at G/R 1.014 / 1.040 / 1.133 / 1.185 / 1.244, so
// this guard would have caught three of the five outright.
const PRE_GR_MAX = 1.05;
// Hue pin target: centre of the 1.40..1.90 brief, and within 0.03 of the ground's
// own 1.59 — the bush lives in exactly the ground's colour family and separates
// by VALUE (57 vs 66.3) and by silhouette, not by hue.
const RB_TARGET = 1.62;
const HUE_MAX_K = 1.2; // per-channel cap; beyond this -> reroll, not tint

async function toneNormalise(png, name) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  // pass 1 — measure the raw render (opaque pixels only)
  let n = 0,
    sumR = 0,
    sumG = 0,
    sumB = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    sumR += data[i];
    sumG += data[i + 1];
    sumB += data[i + 2];
    n++;
  }
  const preRB = sumR / sumB;
  const preGR = sumG / sumR;
  if (preGR > PRE_GR_MAX)
    throw new Error(
      `${name}: generation is GREEN (G/R ${preGR.toFixed(2)} > ${PRE_GR_MAX}) — the plains ground it stands ` +
        `on measures G/R 0.90, and green foliage cannot be tinted into warm khaki (the hue pin leaves G ` +
        `untouched by design), regenerate with a new seed`,
    );
  if (preRB < PRE_RB_MIN)
    throw new Error(
      `${name}: generation is too cold/green (R/B ${preRB.toFixed(2)} < ${PRE_RB_MIN}) — ` +
        `a blue-green render cannot be tinted into warm olive, regenerate with a new seed`,
    );

  const kR = Math.sqrt(RB_TARGET / preRB);
  const kB = 1 / kR;
  if (kR > HUE_MAX_K || kR < 1 / HUE_MAX_K)
    throw new Error(
      `${name}: hue too far off the set (R/B ${preRB.toFixed(2)}, would need x${kR.toFixed(2)} on red, ` +
        `cap ${HUE_MAX_K}) — regenerate with a new seed`,
    );

  const hueMeanLum = (0.2126 * sumR * kR + 0.7152 * sumG + 0.0722 * sumB * kB) / n;
  const factor = TONE_TARGET_LUM / hueMeanLum;
  if (factor < TONE_MIN_FACTOR || factor > TONE_MAX_FACTOR)
    throw new Error(
      `${name}: generation off-target (meanLum ${hueMeanLum.toFixed(1)}, would need ` +
        `x${factor.toFixed(2)} outside ${TONE_MIN_FACTOR}..${TONE_MAX_FACTOR}) — regenerate with a new seed`,
    );

  console.log(
    `    tone: G/R ${preGR.toFixed(2)} (pass), R/B ${preRB.toFixed(2)} -> ${RB_TARGET} (red x${kR.toFixed(3)}), ` +
      `meanLum ${hueMeanLum.toFixed(1)} -> x${factor.toFixed(3)}`,
  );

  const mul = [kR * factor, factor, kB * factor];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) {
      data[i + c] = Math.min(255, Math.round(data[i + c] * mul[c]));
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

async function scaleToConvention(croppedPng) {
  const m = await sharp(croppedPng).metadata();
  const f = TARGET_MAX / Math.max(m.width, m.height);
  const w = Math.max(1, Math.round(m.width * f));
  const h = Math.max(1, Math.round(m.height * f));
  return sharp(croppedPng).resize(w, h, { fit: 'fill' }).png().toBuffer();
}

// ══════════════════════════════════════
// Step 5 — validation
// ══════════════════════════════════════

// All four bands come straight from the brief. LUM is pinned by the tone step,
// so the luminance check is really a guard against a clipped render whose
// highlights saturate away from the target.
const LUM_MIN = 50;
const LUM_MAX = 64;
const RB_MIN = 1.4;
const RB_MAX = 1.9;
// Saturation. The floor drops 40 -> 33 in run 2, and this is forced by
// arithmetic rather than by taste. Saturation here is mean (max-min)/max per
// pixel. Luminance is pinned at 57 and R/B is pinned at 1.62, so R and B are
// effectively fixed; the only free channel is G, and the run-2 brief moves G
// DOWN until it no longer exceeds R. That necessarily narrows the max-min
// spread. Concretely, on the set means: run 1 sat 47.5 % at rgb 51/61/32
// (max 61, min 32), run 2 sat 38.5 % at rgb 65/58/40 (max 65, min 40). The old
// 40 % floor was calibrated on a green set and is unreachable for a khaki one —
// keeping it would mean rejecting renders for being exactly what was asked for.
// 33 % still sits below the plains ground's own 38.9 %, which is the number
// that matters: the prop must not read flatter than what it stands on.
const SAT_MIN = 33;
const SAT_MAX = 55;
// Greenness on the FINAL file (run-2 fix 1). Ceiling 1.02 = "red at least
// matches green", the thing run 1 got wrong on all five variants. Floor 0.88
// stops the correction overshooting into a dead brown twig bundle: the plant
// still has to read as foliage, and the whole neighbourhood it lives in sits
// just above this line (plains ground 0.895..0.901, trees mean 0.97). Note the
// straw grass set at 0.75..0.80 is deliberately BELOW the floor — grass is
// supposed to be dry and the bush is not.
const GR_MIN = 0.88;
const GR_MAX = 1.02;
// Aspect. Narrow on purpose: a single PROP_HEIGHT_FACTORS entry has to fit all
// five variants (see header). Run 2 pulls the ceiling 1.60 -> 1.30 on review
// feedback; the floor stays at 1.00 because a bush taller than it is wide reads
// as a sapling.
const ASPECT_MIN = 1.0;
const ASPECT_MAX = 1.3;
// Bbox fill = opaque px / (w*h), the run-2 handle on "not so full" (fix 2).
//
// The ceiling was first set to 52 % by the arithmetic rule "just under run 1's
// lightest variant (58.1 %)", and that turned out to be too strict: it was
// rejecting renders on a 1..2 point margin that are visually exactly what the
// review asked for. Recalibrated against inspected renders instead:
//     53.6 %  clearly right — broken outline, gaps through the crown, twigs and
//             leaf clusters legible, see-through at the edges
//     54.8 %  still good
//     56.4 %  drifting back towards a solid mass; outline still broken but the
//             crown reads closed. Borderline, not wanted.
//     58.1 %  run 1's LIGHTEST, and visually a clipped hedge ball
// 55 % sits above both accepted renders and below the borderline one. Note how
// narrow that window is: 4.5 points separate "airy" from "hedge ball", so fill
// is a backstop against gross density, not a fine style knob — the real gate on
// this axis is looking at the render, which is why the pipeline does both.
//
// Floor 30 % keeps the plant a plant: two renders at 13.3 % and 20.1 % were bare
// twig bundles with almost no leaf on them, which is the opposite failure and
// just as unusable at 17 px on screen. For scale the trees measure 14.9..41.0 %,
// but they are drawn 1.67x larger, so they can afford to be sparser than this.
const FILL_MIN = 30;
const FILL_MAX = 55;
// Roughness / detail proxy: std-dev of luminance over the opaque pixels, relative
// to the mean. A leaf mass with lit tops and a shaded interior has a broad
// histogram; a flat washed-out blob does not. The trees measure 0.39..0.48.
// Raised 0.30 -> 0.52 in run 2. An open airy shrub actually has MORE internal
// light-to-shade range than a solid one, and the run-2 set measures 0.56..0.70,
// so the old floor was far below anything this prompt produces and never fired.
// 0.52 sits just under the set and catches the flat-and-murky render that
// TONE_MIN_FACTOR is aimed at, from the other direction.
const CONTRAST_MIN = 0.52;
// TRUNK GUARD — the one failure this set actually suffers from.
// Every tone/colour/aspect band can be satisfied by a small TREE: run 1 produced
// two renders (shapes 2 and 4) that passed all six numeric checks and were
// plainly saplings on bare woody stems, i.e. exactly the "shrunken tree" the
// brief rules out. The cheap discriminator is how much of the sprite's BASE is
// filled: a bush's foliage runs down to the ground across most of its width, a
// trunk is a thin stick.
//   measured, mean opaque coverage over the bottom 10 % of rows:
//     run-1 bushes       45.9 / 43.6 / 24.8 / 19.6 / 43.9 %
//     trunked "bushes"    6.2 /  4.1 %
//     real trees 0..7     3.4 /  6.3 /  8.4 /  9.8 / 13.0 / 14.5 / 19.8 %
//
// ── run-2 recalibration: tested, and the answer was "leave it at 15" ─────────
// The review asked for this threshold to come down, on the reasonable theory
// that a lighter plant necessarily has less foliage at ground level. It was
// lowered to 11 % for the run and the theory was then falsified by the renders:
//
//     run-1 set (dense, fill 58..70 %)   base cover 19.6 .. 45.9 %
//     run-2 set (airy,  fill 34..54 %)   base cover 24.1 .. 47.2 %
//
// Halving the density did not lower base cover at all — the run-2 minimum is
// HIGHER than run 1's. The reason is that ground contact turned out not to be a
// by-product of density: it is controlled by one explicit clause ("its lowest
// leafy shoots sweep down and brush the ground"), and once that clause is in
// the prompt the plant hugs the ground whether it is dense or open. So there
// was never a conflict between "airier" and "still covered at the base", only
// an assumption that there would be.
//
// Keeping 11 % would have cost real quality. During the run the guard rejected
// renders at 10.3 % and 6.5 % that were visibly standing on bare stems, and it
// PASSED one at exactly 11.0 % that was also visibly a stem fan — a documented
// false negative, i.e. 11 is demonstrably below the line. 15 % is restored: it
// sits in the middle of the observed gap (worst accepted 19.6 %, best rejected
// 11.0 %) and clears every accepted run-2 render by at least 9 points.
//
// Two things this guard CANNOT do, both learned the hard way in run 2:
//   * It cannot see a baked-on GRASS SKIRT. An earlier run-2 wording asked for
//     "low leaf tufts spread out along the ground around its foot" and flux
//     answered with a tuft of grass at the base of a small tree. That render
//     scored base cover 46.9 % — a comfortable pass — and was unusable. Base
//     covers of 47..70 % across that pass were all the same artefact. The fix
//     was in the prompt (ground contact must describe the PLANT's own shoots,
//     never anything lying on the ground) plus "no grass" in the negatives.
//   * It cannot replace looking at the render, for the same reason.
//
// A relative variant (base10 / fill, or base10 / mid-band coverage) was measured
// as a candidate and REJECTED: base/mid puts good run-1 bushes at 0.24..0.62 and
// real trees at 0.08..1.28, i.e. it overlaps far worse than the absolute number.
// Density-normalising the guard sounds right and measures wrong, because a
// trunked render's canopy is dense, which inflates its denominator too.
const BASE_ROW_FRAC = 0.1;
const BASE_COVER_MIN = 15;

// ── ANKLE GUARD — the grass-skirt-proof stem detector (run 2) ────────────────
// BASE_COVER measures the bottom 10 % of rows, which is exactly where a baked-on
// grass tuft or litter mat lands, so it can be defeated by the very artefact
// this set keeps producing. The ankle guard measures a band ABOVE that litter —
// 78..90 % of the height — where nothing but the plant's own body can be. A
// bush is still broad there; a sapling is a stick; grass does not reach.
//
// Measured, mean opaque coverage over rows 0.78h..0.90h:
//     accepted run-2 bushes    56.7 / 65.3 / 68.8 / 69.7 %
//     the sapling-on-a-trunk   11.6 %   (which scored base cover 24.1 % — a
//                                        PASS — purely on its grass tuft)
//     real trees 0..7          10.8 / 21.6..42.2 %  (max 42.2)
// 50 % sits in a very wide gap: 6.7 points under the weakest accepted bush and
// 7.8 points over the densest-ankled tree, with the actual failure case 38
// points below. This is a much cleaner discriminator than base cover ever was,
// so it is the primary check and BASE_COVER_MIN is kept only as a backstop
// against a plant that floats clear of the ground altogether.
const ANKLE_LO = 0.78;
const ANKLE_HI = 0.9;
const ANKLE_COVER_MIN = 50;

async function measure(pngPath) {
  const { data, info } = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let n = 0,
    lum = 0,
    lum2 = 0,
    sr = 0,
    sg = 0,
    sb = 0,
    sat = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lum += L;
    lum2 += L * L;
    sr += r;
    sg += g;
    sb += b;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    sat += mx === 0 ? 0 : (mx - mn) / mx;
    n++;
  }
  const meanLum = lum / n;
  const sd = Math.sqrt(Math.max(0, lum2 / n - meanLum * meanLum));

  // base coverage — trunk guard, see BASE_COVER_MIN.
  // Also total opaque coverage — the FILL density metric, see FILL_MAX.
  const baseRows = Math.max(1, Math.round(h * BASE_ROW_FRAC));
  let cover = 0;
  let opaque = 0;
  let ankle = 0;
  let ankleRows = 0;
  const ankleFrom = Math.floor(h * ANKLE_LO);
  const ankleTo = Math.max(ankleFrom + 1, Math.floor(h * ANKLE_HI));
  for (let y = 0; y < h; y++) {
    let c = 0;
    for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] >= 128) c++;
    opaque += c;
    if (y >= h - baseRows) cover += c / w;
    if (y >= ankleFrom && y < ankleTo) {
      ankle += c / w;
      ankleRows++;
    }
  }
  const baseCover = (100 * cover) / baseRows;
  const ankleCover = (100 * ankle) / Math.max(1, ankleRows);

  const bbox = await alphaBBox(pngPath);
  return {
    w,
    h,
    baseCover,
    ankleCover,
    fill: (100 * opaque) / (w * h),
    aspect: w / h,
    meanLum,
    sd,
    contrast: sd / meanLum,
    r: sr / n,
    g: sg / n,
    b: sb / n,
    rb: sr / sb,
    gr: sg / sr,
    sat: (100 * sat) / n,
    tight: bbox.minX === 0 && bbox.minY === 0 && bbox.maxX === w - 1 && bbox.maxY === h - 1,
  };
}

async function validate(name) {
  const p = path.join(DIR_FINAL, `${name}.png`);
  if (!fs.existsSync(p)) return { name, ok: false, problems: ['missing'], m: null };
  const m = await measure(p);
  const problems = [];
  if (Math.max(m.w, m.h) !== TARGET_MAX) problems.push(`max side ${Math.max(m.w, m.h)} != ${TARGET_MAX}`);
  if (m.aspect < ASPECT_MIN || m.aspect > ASPECT_MAX)
    problems.push(`aspect ${m.aspect.toFixed(2)} outside ${ASPECT_MIN}..${ASPECT_MAX}`);
  if (!m.tight) problems.push('not tight-cropped (transparent border)');
  if (m.meanLum < LUM_MIN) problems.push(`too dark (meanLum ${m.meanLum.toFixed(1)} < ${LUM_MIN})`);
  if (m.meanLum > LUM_MAX) problems.push(`too light (meanLum ${m.meanLum.toFixed(1)} > ${LUM_MAX})`);
  if (m.rb < RB_MIN) problems.push(`not warm enough (R/B ${m.rb.toFixed(2)} < ${RB_MIN})`);
  if (m.rb > RB_MAX) problems.push(`too warm/orange (R/B ${m.rb.toFixed(2)} > ${RB_MAX})`);
  if (m.gr > GR_MAX) problems.push(`too green — green beats red (G/R ${m.gr.toFixed(2)} > ${GR_MAX})`);
  if (m.gr < GR_MIN) problems.push(`too brown/dead — not enough green (G/R ${m.gr.toFixed(2)} < ${GR_MIN})`);
  if (m.fill > FILL_MAX)
    problems.push(`too dense/full — reads as a clipped hedge ball (fill ${m.fill.toFixed(1)}% > ${FILL_MAX}%)`);
  if (m.fill < FILL_MIN)
    problems.push(`too sparse — reads as a bare twig bundle (fill ${m.fill.toFixed(1)}% < ${FILL_MIN}%)`);
  if (m.sat < SAT_MIN) problems.push(`too desaturated (sat ${m.sat.toFixed(1)}% < ${SAT_MIN}%)`);
  if (m.sat > SAT_MAX) problems.push(`too saturated (sat ${m.sat.toFixed(1)}% > ${SAT_MAX}%)`);
  if (m.contrast < CONTRAST_MIN)
    problems.push(`surface too flat (contrast ${m.contrast.toFixed(2)} < ${CONTRAST_MIN})`);
  if (m.baseCover < BASE_COVER_MIN)
    problems.push(
      `foliage does not reach the ground — reads as a tree on a trunk ` +
        `(base cover ${m.baseCover.toFixed(1)}% < ${BASE_COVER_MIN}%)`,
    );
  if (m.ankleCover < ANKLE_COVER_MIN)
    problems.push(
      `narrow at ankle height — reads as a sapling on a stem, or the base cover ` +
        `is a baked-on grass tuft (ankle cover ${m.ankleCover.toFixed(1)}% < ${ANKLE_COVER_MIN}%)`,
    );
  return { name, ok: problems.length === 0, problems, m };
}

// ══════════════════════════════════════
// Per-variant run
// ══════════════════════════════════════

async function runVariant(idx, seedOverride, reuseRaw) {
  const name = `${PREFIX}_${idx}`;
  const shape = SHAPES[idx];
  const seed = seedOverride ?? shape.seed;
  console.log(`\n[${name}] seed ${seed}`);

  const rawPath = path.join(DIR_RAW, `${name}_raw.png`);
  let raw;
  if (reuseRaw && fs.existsSync(rawPath)) {
    raw = fs.readFileSync(rawPath);
    console.log('    raw: reused');
  } else {
    raw = await generate(shape, seed);
    fs.writeFileSync(rawPath, raw);
  }

  const nobg = await cleanAlpha(await removeBackground(raw));
  fs.writeFileSync(path.join(DIR_NOBG, `${name}_nobg.png`), nobg);

  const cropped = await toneNormalise(await tightCrop(nobg), name);
  fs.writeFileSync(path.join(DIR_CROP, `${name}_cropped.png`), cropped);

  const final = await scaleToConvention(cropped);
  fs.writeFileSync(path.join(DIR_FINAL, `${name}.png`), final);

  const v = await validate(name);
  console.log(
    `    -> ${v.m.w}x${v.m.h} aspect ${v.m.aspect.toFixed(2)} lum ${v.m.meanLum.toFixed(1)} ` +
      `rgb ${v.m.r.toFixed(0)}/${v.m.g.toFixed(0)}/${v.m.b.toFixed(0)} ` +
      `G/R ${v.m.gr.toFixed(2)} R/B ${v.m.rb.toFixed(2)} sat ${v.m.sat.toFixed(1)}% ` +
      `fill ${v.m.fill.toFixed(1)}% contrast ${v.m.contrast.toFixed(2)} base ${v.m.baseCover.toFixed(1)}% ankle ${v.m.ankleCover.toFixed(1)}% ` +
      `${v.ok ? 'PASS' : 'FAIL: ' + v.problems.join('; ')}`,
  );
  return v;
}

// ══════════════════════════════════════
// Review sheets
// ══════════════════════════════════════

/** Iso lattice of plains tiles — the actual ground this set has to sit on. */
async function groundSlab(width, height, tileW) {
  const tileH = Math.round(tileW / 2);
  const tiles = [];
  for (let i = 0; i < 4; i++) {
    const p = path.join(DIR_TILES, `plains_${i}.webp`);
    if (fs.existsSync(p)) tiles.push(await sharp(p).resize(tileW, tileH, { fit: 'fill' }).png().toBuffer());
  }
  const comp = [];
  let k = 0;
  for (let row = -1; row * (tileH / 2) < height + tileH; row++) {
    for (let col = -1; col * tileW < width + tileW; col++) {
      comp.push({
        input: tiles[k++ % tiles.length],
        left: Math.round(col * tileW + (row & 1 ? tileW / 2 : 0)),
        top: Math.round((row * tileH) / 2),
      });
    }
  }
  return sharp({
    create: { width, height, channels: 4, background: { r: 60, g: 54, b: 38, alpha: 1 } },
  })
    .composite(comp)
    .png()
    .toBuffer();
}

async function finals() {
  const out = [];
  for (let i = 0; i < COUNT; i++) {
    const p = path.join(DIR_FINAL, `${PREFIX}_${i}.png`);
    if (fs.existsSync(p)) out.push(p);
  }
  return out;
}

/** 1) plain contact sheet */
async function sheetPlain() {
  const files = await finals();
  if (!files.length) return;
  const CELL = 260,
    COLS = 5;
  const rows = Math.ceil(files.length / COLS);
  const comp = [];
  for (let i = 0; i < files.length; i++) {
    comp.push({
      input: await sharp(files[i])
        .resize(CELL - 16, CELL - 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer(),
      left: (i % COLS) * CELL + 8,
      top: Math.floor(i / COLS) * CELL + 8,
    });
  }
  const out = path.join(DIR_REVIEW, `${PREFIX}_sheet.png`);
  await sharp({
    create: { width: COLS * CELL, height: rows * CELL, channels: 4, background: { r: 122, g: 116, b: 104, alpha: 1 } },
  })
    .composite(comp)
    .png()
    .toFile(out);
  console.log(`[sheet] ${out}`);
}

/** 2) the 5 bushes large, standing on real plains ground */
async function sheetOnPlains() {
  const files = await finals();
  if (!files.length) return;
  const CELL_W = 300,
    CELL_H = 250,
    COLS = 5,
    BUSH_H = 170;
  const rows = Math.ceil(files.length / COLS);
  const W = COLS * CELL_W,
    H = rows * CELL_H;
  const bg = await groundSlab(W, H, 300);
  const comp = [];
  for (let i = 0; i < files.length; i++) {
    const m = await sharp(files[i]).metadata();
    const w = Math.round(BUSH_H * (m.width / m.height));
    comp.push({
      input: await sharp(files[i]).resize(w, BUSH_H, { fit: 'fill' }).png().toBuffer(),
      left: (i % COLS) * CELL_W + Math.round((CELL_W - w) / 2),
      top: Math.floor(i / COLS) * CELL_H + Math.round((CELL_H - BUSH_H) / 2),
    });
  }
  const out = path.join(DIR_REVIEW, `${PREFIX}_on_plains.png`);
  await sharp(bg).composite(comp).png().toFile(out);
  console.log(`[sheet] ${out}`);
}

/**
 * 3) THE verdict sheet: real in-game geometry (TW = 48, PROP_BASE_HEIGHT = 28)
 * on real plains ground, upscaled 6x nearest-neighbour so the 1:1 pixels stay
 * visible. This is the only view that shows what actually ships — everything
 * else on the review page is 10x too big to judge.
 *
 * Four strips (run 2 adds the second one):
 *   1 — NEW bush at the shipped heightFactor 0.60 (drawn height 28 * 0.60)
 *   2 — OLD run-1 bush at the same heightFactor, from assets/prev/bush/ — the
 *       direct A/B at the size Rudi actually sees. Skipped if absent.
 *   3 — NEW bush WITHOUT a heightFactor (28 px, i.e. tree height), the thing
 *       the PROP_HEIGHT_FACTORS entry has to prevent
 *   4 — the deciduous trees at 28 px, for scale reference
 */
// Mirrors PROP_HEIGHT_FACTORS.bush in src/.../propThemes.ts. Application code is
// out of scope for this script; this constant only has to AGREE with it so the
// preview is honest. If the renderer value changes, change this to match.
const HEIGHT_FACTOR_PREVIEW = 0.6;
// PROPOSAL ONLY — this script does not and must not change the renderer.
//
// Run 2 makes the bush warmer, narrower and airier, and all three reduce how
// much of it is actually painted on screen. Measured as drawn area x fill, mean
// over the five variants at PROP_BASE_HEIGHT 28:
//     OLD @ hf 0.60   drawn width 23.9 px,  painted 255 px^2
//     NEW @ hf 0.60   drawn width 19.6 px,  painted 165 px^2   (-35 %)
//     NEW @ hf 0.75   drawn width 24.4 px,  painted 258 px^2   (parity with OLD)
// On top of that the set no longer contrasts with the ground by hue, which was
// the whole point of the colour fix — so the lost area is not compensated by
// pop the way it used to be. At hf 0.60 the new bushes read as ground texture
// rather than as props. 0.75 is the factor that restores the previous on-screen
// mass exactly while keeping the corrected look; the sheet renders both rows so
// the call can be made by eye.
const HEIGHT_FACTOR_SUGGESTED = 0.75;
async function sheetGameSize() {
  const TW = 48,
    PROP_H = 28,
    ZOOM = 6;
  const files = await finals();
  if (!files.length) return;

  const treeDir = path.join(SRC_PROPS, 'tree');
  const treeFiles = [1, 2, 3, 5, 7]
    .map((i) => path.join(treeDir, `tree_${i}.webp`))
    .filter((p) => fs.existsSync(p));

  const oldDir = path.join(ROOT, 'assets', 'prev', FAMILY);
  const oldFiles = [];
  for (let i = 0; i < COUNT; i++) {
    const p = path.join(oldDir, `${PREFIX}_${i}.webp`);
    if (fs.existsSync(p)) oldFiles.push(p);
  }

  const strips = [
    { list: files, drawH: PROP_H * HEIGHT_FACTOR_PREVIEW, label: `new @ hf ${HEIGHT_FACTOR_PREVIEW}` },
    ...(oldFiles.length
      ? [{ list: oldFiles, drawH: PROP_H * HEIGHT_FACTOR_PREVIEW, label: `OLD @ hf ${HEIGHT_FACTOR_PREVIEW}` }]
      : []),
    // Readability proposal, see HEIGHT_FACTOR_SUGGESTED.
    { list: files, drawH: PROP_H * HEIGHT_FACTOR_SUGGESTED, label: `new @ hf ${HEIGHT_FACTOR_SUGGESTED}` },
    { list: files, drawH: PROP_H, label: 'new @ 1.0' },
    { list: treeFiles, drawH: PROP_H, label: 'tree @ 1.0' },
  ];

  const stripH = 46;
  const W = 6 * TW + 24;
  const H = stripH * strips.length;
  const bg = await groundSlab(W, H, TW);
  const comp = [];
  const place = async (list, rowBottom, drawH) => {
    for (let i = 0; i < list.length; i++) {
      const m = await sharp(list[i]).metadata();
      const h = Math.max(1, Math.round(drawH));
      const w = Math.max(1, Math.round(h * (m.width / m.height)));
      comp.push({
        input: await sharp(list[i]).resize(w, h, { fit: 'fill' }).png().toBuffer(),
        left: 12 + i * TW + Math.round((TW - w) / 2),
        top: Math.max(0, Math.round(rowBottom - h)),
      });
    }
  };
  // bottom-anchored, exactly like PlanetSurface draws props
  for (let s = 0; s < strips.length; s++) await place(strips[s].list, (s + 1) * stripH - 6, strips[s].drawH);

  const flat = await sharp(bg).composite(comp).png().toBuffer();
  const out = path.join(DIR_REVIEW, `${PREFIX}_gamesize.png`);
  await sharp(flat)
    .resize(W * ZOOM, H * ZOOM, { kernel: 'nearest' })
    .png()
    .toFile(out);
  console.log(
    `[sheet] ${out}   (rows: ${strips.map((s) => s.label).join(' | ')}, ${ZOOM}x nearest)`,
  );
}

/**
 * 4) A/B against the run-1 set that Rudi reviewed in the emulator.
 *
 * Two rows on real plains ground, same draw height in both, so the three
 * corrections (warmth / airiness / width) can be judged side by side rather
 * than from memory:
 *   top    — OLD, the shipped run-1 sprites, snapshotted to assets/prev/bush/
 *   bottom — NEW, the current assets/final/ set
 *
 * The old sprites come from a plain directory rather than from git so this can
 * be re-run after integration without checking anything out. Populate it with
 *   cp src/assets/props/bush/bush_[0-4].webp assets/prev/bush/
 * BEFORE integrating a new run; the sheet is skipped if the directory is empty.
 */
async function sheetAB() {
  const newFiles = await finals();
  const oldDir = path.join(ROOT, 'assets', 'prev', FAMILY);
  if (!fs.existsSync(oldDir)) {
    console.log('[sheet] A/B skipped — no assets/prev/bush snapshot of the previous run');
    return;
  }
  const oldFiles = [];
  for (let i = 0; i < COUNT; i++) {
    const p = path.join(oldDir, `${PREFIX}_${i}.webp`);
    if (fs.existsSync(p)) oldFiles.push(p);
  }
  if (!oldFiles.length || !newFiles.length) return;

  const CELL_W = 300,
    ROW_H = 250,
    BUSH_H = 165,
    LABEL = 34;
  const COLS = Math.max(oldFiles.length, newFiles.length);
  const W = COLS * CELL_W;
  const H = 2 * ROW_H + 2 * LABEL;
  const bg = await groundSlab(W, H, 300);

  const comp = [];
  const strip = async (list, top) => {
    for (let i = 0; i < list.length; i++) {
      const m = await sharp(list[i]).metadata();
      const w = Math.round(BUSH_H * (m.width / m.height));
      comp.push({
        input: await sharp(list[i]).resize(w, BUSH_H, { fit: 'fill' }).png().toBuffer(),
        left: i * CELL_W + Math.round((CELL_W - w) / 2),
        top: top + Math.round((ROW_H - BUSH_H) / 2),
      });
    }
  };
  // label bars: dark strip above each row so the two are unambiguous
  const bar = async (text, top) => {
    const svg = Buffer.from(
      `<svg width="${W}" height="${LABEL}"><rect width="${W}" height="${LABEL}" fill="#141210" fill-opacity="0.85"/>` +
        `<text x="10" y="23" font-family="monospace" font-size="17" fill="#e8e2d4">${text}</text></svg>`,
    );
    comp.push({ input: await sharp(svg).png().toBuffer(), left: 0, top });
  };
  await bar('OLD  run 1  — G/R 1.01..1.24 (green), fill 58..70% (dense), aspect 1.19..1.56 (wide)', 0);
  await strip(oldFiles, LABEL);
  await bar('NEW  run 2  — warmer (R >= G), airier, narrower', LABEL + ROW_H);
  await strip(newFiles, 2 * LABEL + ROW_H);

  const out = path.join(DIR_REVIEW, `${PREFIX}_ab_old_vs_new.png`);
  await sharp(bg).composite(comp).png().toFile(out);
  console.log(`[sheet] ${out}   (top = run 1 as shipped, bottom = run 2)`);
}

async function sheet() {
  fs.mkdirSync(DIR_REVIEW, { recursive: true });
  await sheetPlain();
  await sheetOnPlains();
  await sheetGameSize();
  await sheetAB();
}

// ══════════════════════════════════════
// Integrate
// ══════════════════════════════════════

async function integrate(indices = SHAPES.map((_, i) => i)) {
  const dir = path.join(SRC_PROPS, FAMILY);
  fs.mkdirSync(dir, { recursive: true });
  for (const i of indices) {
    const name = `${PREFIX}_${i}`;
    const src = path.join(DIR_FINAL, `${name}.png`);
    if (!fs.existsSync(src)) {
      console.log(`  SKIP ${name} (no final png)`);
      continue;
    }
    const v = await validate(name);
    if (!v.ok) throw new Error(`refusing to integrate ${name}: ${v.problems.join('; ')}`);
    await sharp(src).webp(WEBP).toFile(path.join(dir, `${name}.webp`));
    const m = await sharp(src).metadata();
    for (const mip of MIPS) {
      await sharp(src)
        .resize(Math.max(1, Math.round(m.width * mip.scale)), Math.max(1, Math.round(m.height * mip.scale)), {
          fit: 'fill',
        })
        .webp(WEBP)
        .toFile(path.join(dir, `${name}${mip.suffix}.webp`));
    }
    console.log(`  ${FAMILY}/${name}.webp  ${m.width}x${m.height} (+3 mips)`);
  }
}

// ══════════════════════════════════════
// main
// ══════════════════════════════════════

(async () => {
  const argv = process.argv.slice(2);
  const cmd = argv[0] || 'gen';
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const seedIdx = argv.indexOf('--seed');
  const seedOverride = seedIdx >= 0 ? parseInt(argv[seedIdx + 1], 10) : null;
  // Skip the VALUE of every value-taking flag by position, otherwise `--tries 4`
  // makes 4 look like a variant index.
  const valuePositions = new Set();
  for (const f of ['--seed', '--tries']) {
    const at = argv.indexOf(f);
    if (at >= 0) valuePositions.add(at + 1);
  }
  const idxArgs = argv
    .map((a, i) => ({ a, i }))
    .filter(({ a, i }) => i > 0 && /^\d+$/.test(a) && !valuePositions.has(i))
    .map(({ a }) => Number(a));
  const indices = idxArgs.length ? idxArgs : SHAPES.map((_, i) => i);

  for (const d of [DIR_RAW, DIR_NOBG, DIR_CROP, DIR_FINAL, DIR_REVIEW]) fs.mkdirSync(d, { recursive: true });

  if (cmd === 'sheet') return sheet();
  if (cmd === 'integrate') return integrate(indices);
  if (cmd === 'prompt') {
    console.log(buildPrompt(SHAPES[indices[0]]));
    return;
  }
  if (cmd === 'validate') {
    for (const i of indices) {
      const v = await validate(`${PREFIX}_${i}`);
      console.log(
        v.m
          ? `${v.name.padEnd(10)} ${v.m.w}x${v.m.h} aspect ${v.m.aspect.toFixed(2)} lum ${v.m.meanLum.toFixed(1)} ` +
              `rgb ${v.m.r.toFixed(0)}/${v.m.g.toFixed(0)}/${v.m.b.toFixed(0)} ` +
              `G/R ${v.m.gr.toFixed(2)} R/B ${v.m.rb.toFixed(2)} sat ${v.m.sat.toFixed(1)}% ` +
              `fill ${v.m.fill.toFixed(1)}% contrast ${v.m.contrast.toFixed(2)} base ${v.m.baseCover.toFixed(1)}% ankle ${v.m.ankleCover.toFixed(1)}% ` +
              `tight=${v.m.tight} ` +
              `${v.ok ? 'PASS' : 'FAIL: ' + v.problems.join('; ')}`
          : `${v.name.padEnd(10)} MISSING`,
      );
    }
    return;
  }

  if (!FAL_API_KEY) {
    console.error('No fal key (FAL_AI_API_KEY) in scripts/.env');
    process.exit(1);
  }

  const reuseRaw = flags.has('--reuse-raw');
  // `--tries N` re-rolls a failing variant with SEED-ONLY changes, up to N times,
  // stopping at the first PASS. It is a bounded retry on pure noise, NOT a
  // substitute for fixing a prompt that is systematically off; every try is
  // logged with its seed and an accepted seed must be written back into SHAPES.
  const triesIdx = argv.indexOf('--tries');
  const tries = triesIdx >= 0 ? parseInt(argv[triesIdx + 1], 10) : 1;
  const SEED_STEP = 7;

  const results = [];
  for (const i of indices) {
    let last = null;
    for (let t = 0; t < tries; t++) {
      const seed = (seedOverride ?? SHAPES[i].seed) + t * SEED_STEP;
      try {
        last = await runVariant(i, seed, reuseRaw && t === 0);
      } catch (e) {
        console.log(`    !! ${e.message}`);
        last = { name: `${PREFIX}_${i}`, ok: false, problems: [e.message], m: null, seed };
      }
      last.seed = seed;
      if (last.ok) {
        if (t > 0) console.log(`    ACCEPTED on try ${t + 1} — write seed ${seed} into SHAPES[${i}]`);
        break;
      }
    }
    results.push(last);
  }

  console.log('\n── summary ──');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.problems.join('; ')}`);
  await sheet();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
