/**
 * PRODUCTION: integrate the FINE-lip rung (hairline Voronoi net, cells 41 px /
 * cracks 5 px, depth 0.34, closed-form bright lip) of the round-4 crevasse ladder
 * into src/assets/tiles/crevasse/, replacing the old set in place.
 *
 * WHY THIS RUNG (Rudi's pick from the ladder, 2026-09-04)
 *   "der unterschied ist dezent aber ausreichend um als eigenes biome wahrgenommen
 *   zu werden." Rounds 1-3 cut DEEP gashes and separated from glacier through
 *   DARKNESS; Rudi turned all three down and asked for the opposite -- shallow,
 *   surface cracks. Round 4 does that with a dense net of hairlines that adds short
 *   edges without touching the mean.
 *
 *   THE LEVEL IS EXACTLY GLACIER, ON PURPOSE. The multiplier is (1 - D)(1 + kB) and
 *   its mean is exactly 1 when k = mean(D) / (mean(B) - mean(D*B)) -- read straight
 *   off the mask, per slot, no search and no convergence risk. The bright lip and
 *   the dark trough cancel tile by tile, so the biome cannot separate through
 *   brightness and a level leg would mean the cracks had gone deep again.
 *   Measured: L 44.0 on all four slots, |L_crevasse - L_glacier| <= 0.14 per slot.
 *
 * THE KNOWN, ACCEPTED LIMIT -- recorded here so nobody rediscovers it as a bug.
 *   At the coarsest overview scale this rung is NOT statistically separated from
 *   glacier: d'level 0.32 / d'texture 0.12 against a 1.0 bar, and the ladder marked
 *   it "BELOW THRESHOLD -- the same tile with two names". Rudi checked the picture
 *   and chose it knowingly. The scale where it does work is normal play zoom: on the
 *   128x64 mip (4 screen px per pixel) micro4 is 10.68 against glacier's 6.62, x1.61.
 *   On the 64x32 overview mip it is only x1.18. Both numbers are asserted by
 *   scripts/crevasse-hairline-verify-prod.cjs, which gates on micro4, not on d'.
 *
 * THE GROUND IS GLACIER AND STAYS GLACIER. The net is only ever a multiplier on the
 *   frozen shipped glacier tile, it is achromatic, and the chroma cap is set to
 *   glacier's own residual chroma so the desaturation step is a no-op. Measured over
 *   the pixels the mask never touched (D + B < 0.02): NCC 0.989-0.995 against
 *   glacier, and ground p70 agrees with glacier's p70 over the SAME pixel set to
 *   within 0.7 luma.
 *
 * SLOTS
 *   slot n IS glacier slot n with the net multiplied onto it, so the ICE-corpus
 *   mirror convention is inherited unchanged (glacier: 0 <- regolith_3 as is,
 *   1 <- regolith_1 as is, 2 <- regolith_0 ROT180, 3 <- regolith_3 ROT180). With
 *   tiltX 0 that cannot be read off a ramp sign, so it is proven on the PATTERN:
 *   four-orientation masked NCC against glacier slot n, identity 0.71-0.81 and every
 *   other orientation <= 0.11.
 *   NOTE the corpus peculiarity this biome inherits: glacier slots 0 and 3 are the
 *   SAME regolith tile rotated 180, so glacier's own worst pairwise slot NCC is 0.94,
 *   not zero. The crack net de-correlates that pair to 0.47.
 *
 * RIM FADE. Dark and bright both ramp to zero over the last 11% of world distance
 *   before the diamond edge, so a crack closes up INSIDE the tile instead of
 *   announcing a continuation the random neighbour cannot deliver. rimInk/coreInk
 *   0.51-0.56 -- a ramp, not a bare groove-free ring (which would be a lattice tell
 *   in itself). The boundary step is 18.49 against glacier's own 18.62: the net adds
 *   no seam.
 *
 * src/assets/tiles/glacier/ IS NOT TOUCHED -- it is the source and it stays as it is.
 *   The script hashes the directory before and after and aborts if anything moved.
 *
 * Sources (already final, 512x256 diamond-masked RGBA PNG, built and verified by
 * scripts/tiles-crevasse-r4-hairline.cjs):
 *   assets/style-test/tiles/crevasse4/FINE-lip/crevasse_<n>.png
 * Integrated AS-IS. The old tiles are recoverable from git.
 *
 * Per tile, matching the layout of every other biome in src/assets/tiles/
 * (full size in webp only, the three mips in webp AND png; the mip PNGs are
 * deliberately untracked, .gitignore:21-24):
 *   crevasse_<n>.webp                full 512x256
 *   crevasse_<n>@half.{webp,png}     256x128
 *   crevasse_<n>@quarter.{webp,png}  128x64
 *   crevasse_<n>@eighth.{webp,png}   64x32
 *
 * WebP: quality 90, effort 4, smartSubsample -- as the rest of the corpus.
 *
 * Usage: node scripts/crevasse-hairline-integrate-prod.cjs
 *   then: SET=prod node scripts/crevasse-hairline-verify-prod.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const SRC = path.join(ST, 'crevasse4', 'FINE-lip');
const FROZEN = path.join(ST, 'crevasse4', 'src');
const DST = path.join(ROOT, 'src', 'assets', 'tiles', 'crevasse');
const GLACIER = path.join(ROOT, 'src', 'assets', 'tiles', 'glacier');

const MIPS = [
  { suffix: '@half', w: 256, h: 128 },
  { suffix: '@quarter', w: 128, h: 64 },
  { suffix: '@eighth', w: 64, h: 32 },
];
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const hashDir = (d) => fs.readdirSync(d).sort()
  .map((f) => f + ' ' + crypto.createHash('md5').update(fs.readFileSync(path.join(d, f))).digest('hex'));

(async () => {
  // the source of this biome must be the set that actually ships as glacier
  for (let n = 0; n < 4; n++) {
    const frozen = path.join(FROZEN, 'glacier_' + n + '_src.webp');
    if (!fs.readFileSync(frozen).equals(fs.readFileSync(path.join(GLACIER, 'glacier_' + n + '.webp')))) {
      throw new Error('glacier_' + n + ' has moved since the ladder ran -- rebuild the ladder first');
    }
  }
  console.log('[freeze] all four frozen glacier sources are byte-identical to src/assets/tiles/glacier/');

  const glacierBefore = hashDir(GLACIER);

  fs.mkdirSync(DST, { recursive: true });
  for (let n = 0; n < 4; n++) {
    const src = path.join(SRC, 'crevasse_' + n + '.png');
    const buf = fs.readFileSync(src);
    const meta = await sharp(buf).metadata();
    if (meta.width !== 512 || meta.height !== 256) throw new Error('crevasse_' + n + '.png is not 512x256');
    if (!meta.hasAlpha) throw new Error('crevasse_' + n + '.png has no alpha');

    await sharp(buf).webp(WEBP).toFile(path.join(DST, 'crevasse_' + n + '.webp'));
    for (const m of MIPS) {
      const r = () => sharp(buf).resize(m.w, m.h, { fit: 'fill' });
      await r().webp(WEBP).toFile(path.join(DST, 'crevasse_' + n + m.suffix + '.webp'));
      await r().png().toFile(path.join(DST, 'crevasse_' + n + m.suffix + '.png'));
    }
    console.log('[done] crevasse_' + n + ' <- crevasse4/FINE-lip/crevasse_' + n + '.png (AS-IS, mirror inherited from glacier)');
  }

  const want = [];
  for (let n = 0; n < 4; n++) {
    want.push('crevasse_' + n + '.webp');
    for (const m of MIPS) { want.push('crevasse_' + n + m.suffix + '.webp'); want.push('crevasse_' + n + m.suffix + '.png'); }
  }
  const have = fs.readdirSync(DST);
  const missing = want.filter((f) => !have.includes(f));
  const extra = have.filter((f) => !want.includes(f));
  if (missing.length) throw new Error('missing after integration: ' + missing.join(', '));
  console.log('[verify] ' + want.length + ' files present' + (extra.length ? ', unexpected extras: ' + extra.join(', ') : ', no extras'));

  const glacierAfter = hashDir(GLACIER);
  if (glacierBefore.join('\n') !== glacierAfter.join('\n')) throw new Error('src/assets/tiles/glacier/ CHANGED -- aborting');
  console.log('[verify] src/assets/tiles/glacier/ untouched (' + glacierAfter.length + ' files, md5 identical)');
  console.log('integration complete');
})();
