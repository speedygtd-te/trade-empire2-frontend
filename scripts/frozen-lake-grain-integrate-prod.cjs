/**
 * PRODUCTION: integrate the L51B152 rung of the frozen_lake grain ladder into
 * src/assets/tiles/frozen_lake/, replacing the old set in place. This closes the
 * ICE family -- frozen_lake was its last open tile.
 *
 * WHY THIS HERO (Rudi's pick from the candidate sheet, 2026-09-04)
 *   R3-GRAIN: "the levelled ground is packed with thousands of small flat facets
 *   the size of a grain of rice, each one a barely different shade of the same
 *   grey" -- drawn by flux into a RIMLESS texture-bombed glacier plate, so flux
 *   never saw the diamond and never pinned a form to it. Fine crystal grain, no
 *   relief, no shapes. Raw micro8 1.61, and a raw seam ratio of 1.01 -- the best
 *   number in the whole tile corpus.
 *
 * WHY THIS RUNG
 *   L 51.0 -- +7.0 over glacier/crevasse (44.0) and +6.3 over snow_peak (44.7),
 *     so frozen_lake is visibly the lighter tile of the family, which is what a
 *     refrozen sheet should be. It is the middle of Rudi's own 48-54 band and
 *     far below the untouched originals (regolith 61, dust_plain 76,
 *     silicate_plain 91), so there is no ceiling problem. L 54 was built and
 *     rejected: it lifts micro8 from 1.38 to 1.66 and the grain starts reading
 *     as grit rather than as a frozen sheet. L 48 was rejected for clearing
 *     glacier by only 4.0 -- not a separate brightness.
 *   B/R 1.520 -- clears snow_peak's 1.32 by +0.20 (1.45 clears it by only 0.13
 *     and reads as a smoother glacier), stops well short of the frozen_lake
 *     being REPLACED (1.84) and nowhere near ice_shelf's 2.86. 1.60 was built
 *     and rejected: it starts leaning into ice_shelf's teal.
 *   G/R 1.312 -- the corpus k-curve, 1 + 0.60*(B/R-1).
 *
 * WHY tiltY 0.0 / tiltX 0.0, BREAKING THE FAMILY'S 3.0
 *   The rest of the ICE family carries a per-tile top-light ramp of 3.0. A ramp
 *   that restarts at every tile is a sawtooth, and on a tile chosen for being
 *   SMOOTH there is no texture left to hide it behind. Worse, the sawtooth does
 *   not land in the stamp component: it alternates with the flop of slots 2/3,
 *   so it reads as a QUILT, which is worse than a stamp. The candidate round
 *   measured the cost -- on four of five round-3 candidates dropping 3.0 to 0.0
 *   cut the absolute boundary step by up to 40%. On GRAIN itself the ramp costs
 *   only -0.2%, because its own grain is large enough to swallow it -- but it
 *   buys nothing either, so it goes.
 *
 * WHY THE THREE DERIVATIONS ARE OFFSET WINDOWS AND NOT FLUX EDITS
 *   Both routes were built and measured at the mid rung. Three fresh flux
 *   returns off the SAME frozen plate with the SAME frozen sentence, three new
 *   seeds, came back having LOST the grain and GAINED forms: a scatter of large
 *   flat discs on all three, a broad photographic sweep on two, and on one a
 *   hard tonal boundary running corner to corner straight through the diamond.
 *   Same plate, same words, only the seed different -- so this is not a wording
 *   problem: the motif has no forms to hold flux to, and without forms the seed
 *   decides everything. The numbers agree: flux micro8 spread 1.22 and sd spread
 *   4.63 across its four slots (the four do not read as one biome) against
 *   offset's 0.31 and 0.65, and inter-slot NCC max 0.061 against offset's 0.009.
 *   So the four slots are four windows cut at four offsets out of the ONE hero
 *   return -- slot 0 is the centred window Rudi actually judged, the other three
 *   take three corners of the 224 px offset range. Windows do share plate
 *   pixels, but a shared pixel lands at a different position inside the diamond
 *   in each window, so for a formless grain it is not a visible repeat: measured
 *   inter-slot NCC is 0.009 max, 0.003 mean.
 *
 * SLOT / MIRROR CONVENTION, read off the shipped family and not invented here
 *   slot0 = centre window            (as cut)
 *   slot1 = top-left window          (as cut)
 *   slot2 = bottom-right window      .flop  (left<->right)
 *   slot3 = top-right window         .flop  (left<->right)
 *   Masked mean-centred NCC of every shipped ICE biome slot against slot in all
 *   four orientations says slots 2/3 are the FLOP of 0/1 -- tundra 0.66-0.90,
 *   permafrost 0.52-0.76, snow_peak 0.82-0.96, ice_shelf 0.83-0.95 on 'flop',
 *   0.00-0.03 on everything else. Never .flip: that inverts the upper-left
 *   lighting. At tiltX 0 the ramp sign proves nothing, so the mirroring is
 *   proven by NCC of each written slot against its own pre-mirror window
 *   instead: slots 0/1 id 0.965-0.967, slots 2/3 flop 0.963-0.967, every other
 *   orientation <= 0.014.
 *
 * src/assets/tiles/glacier/ IS NOT TOUCHED -- it is the source this biome was
 *   drawn out of and it stays exactly as it is. Checked by md5 before and after.
 *
 * Sources (already final, 512x256 diamond-masked RGBA PNG, built and verified by
 * scripts/tiles-frozen-lake-ladder.cjs):
 *   assets/style-test/tiles/frozen_lake/ladder/L51B152/frozen_lake_<n>.png
 * Integrated AS-IS, orientation already baked in. The old tiles are recoverable
 * from git.
 *
 * Per tile, matching the layout of every other biome in src/assets/tiles/
 * (full size in webp only, the three mips in webp AND png; the mip PNGs are
 * deliberately untracked, .gitignore:22-24):
 *   frozen_lake_<n>.webp                full 512x256
 *   frozen_lake_<n>@half.{webp,png}     256x128
 *   frozen_lake_<n>@quarter.{webp,png}  128x64
 *   frozen_lake_<n>@eighth.{webp,png}   64x32
 *
 * WebP: quality 90, effort 4, smartSubsample -- as the rest of the corpus.
 *
 * Usage: node scripts/frozen-lake-grain-integrate-prod.cjs
 *   then: node scripts/frozen-lake-verify-prod.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const WORK = path.join(ROOT, 'assets', 'style-test', 'tiles', 'frozen_lake');
const SRC = path.join(WORK, 'ladder', 'L51B152');
const DST = path.join(ROOT, 'src', 'assets', 'tiles', 'frozen_lake');
const GLACIER = path.join(ROOT, 'src', 'assets', 'tiles', 'glacier');

const MIPS = [
  { suffix: '@half', w: 256, h: 128 },
  { suffix: '@quarter', w: 128, h: 64 },
  { suffix: '@eighth', w: 64, h: 32 },
];
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
const dirHash = (d) => fs.readdirSync(d).sort().map((f) => f + ' ' + md5(path.join(d, f)));

(async () => {
  // -- the glacier this biome was drawn out of must not have moved -----------
  for (let n = 0; n < 4; n++) {
    const frozen = path.join(WORK, 'src', 'glacier_' + n + '_src.webp');
    if (!fs.readFileSync(frozen).equals(fs.readFileSync(path.join(GLACIER, 'glacier_' + n + '.webp')))) {
      throw new Error('glacier_' + n + ' has moved since the plate was built -- rebuild the plate first');
    }
  }
  console.log('[freeze] all four frozen glacier sources are byte-identical to src/assets/tiles/glacier/');
  const glacierBefore = dirHash(GLACIER);

  fs.mkdirSync(DST, { recursive: true });
  for (let n = 0; n < 4; n++) {
    const src = path.join(SRC, 'frozen_lake_' + n + '.png');
    const buf = fs.readFileSync(src);
    const meta = await sharp(buf).metadata();
    if (meta.width !== 512 || meta.height !== 256) throw new Error('frozen_lake_' + n + '.png is not 512x256');
    if (!meta.hasAlpha) throw new Error('frozen_lake_' + n + '.png has no alpha');

    await sharp(buf).webp(WEBP).toFile(path.join(DST, 'frozen_lake_' + n + '.webp'));
    for (const m of MIPS) {
      const r = () => sharp(buf).resize(m.w, m.h, { fit: 'fill' });
      await r().webp(WEBP).toFile(path.join(DST, 'frozen_lake_' + n + m.suffix + '.webp'));
      await r().png().toFile(path.join(DST, 'frozen_lake_' + n + m.suffix + '.png'));
    }
    console.log('[done] frozen_lake_' + n + ' <- frozen_lake/ladder/L51B152/frozen_lake_' + n +
      '.png (AS-IS, ' + (n < 2 ? 'as cut' : 'flop already baked in') + ')');
  }

  const want = [];
  for (let n = 0; n < 4; n++) {
    want.push('frozen_lake_' + n + '.webp');
    for (const m of MIPS) { want.push('frozen_lake_' + n + m.suffix + '.webp'); want.push('frozen_lake_' + n + m.suffix + '.png'); }
  }
  const have = fs.readdirSync(DST);
  const missing = want.filter((f) => !have.includes(f));
  const extra = have.filter((f) => !want.includes(f));
  if (missing.length) throw new Error('missing after integration: ' + missing.join(', '));
  console.log('[verify] ' + want.length + ' files present' + (extra.length ? ', unexpected extras: ' + extra.join(', ') : ', no extras'));

  const glacierAfter = dirHash(GLACIER);
  if (glacierBefore.join('\n') !== glacierAfter.join('\n')) throw new Error('src/assets/tiles/glacier/ CHANGED -- aborting');
  console.log('[verify] src/assets/tiles/glacier/ untouched (' + glacierAfter.length + ' files, md5 identical)');
  console.log('integration complete');
})();
