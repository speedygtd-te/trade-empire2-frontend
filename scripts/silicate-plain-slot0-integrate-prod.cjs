/**
 * PRODUCTION: replace ONLY silicate_plain_0 in src/assets/tiles/silicate_plain/.
 *
 * Slots 1, 2 and 3 are not touched -- their md5s are taken before and after and
 * compared, and the script aborts if any of them moved. Rudi's brief was
 * explicit: "die anderen 3 ... kacheln sehr gut und sehen insgesamt sehr gut
 * aus", so nothing about them is re-encoded, re-graded or re-written.
 *
 * WHAT SLOT 0 IS NOW
 *   assets/style-test/tiles/silicate_plain/cand/slot0_d5p460_BR-F.webp
 *   = the bottom-right 512x256 window of a 768x512 rimless plate that was
 *     texture-bombed out of slot 2, after slot 2 was flattened (degree-5
 *     polynomial over the opaque pixels, then a rim-distance equalisation) so
 *     that its own light ramp could not print itself into the plate as a
 *     lattice of straight lines; then graded to ground p70 212.0, B/R 1.000,
 *     G/R 1.000 and the family's mean ramp tiltX +15.8 / tiltY +17.6.
 *
 * WHY THAT WINDOW, out of ten built (five offsets x two ramp settings):
 *   - ramp: the no-ramp variants land at sd 15.0-17.3 and blowout 83-87 %, both
 *     outside the keepers' bands (sd 17.2-24.6, blowout 46.9-70.4). The family
 *     ramp variants land at sd 20.3-22.6 and blowout 47-58 %, inside both. The
 *     ramp is what makes those bands, so matching the family means carrying it.
 *   - offset: BR has the lowest cross-correlation with the keepers (high-pass
 *     |NCC| 0.024 max), the lowest blowout (47.3 %, matching slot 2's 46.9 %),
 *     sd 21.2 in band, and seam ratio 3.574 -- second best of the five and well
 *     under the three keepers' own 4.382. TR scored a better seam but repeats
 *     slot 2's signature crater recognisably; C and BL correlate more.
 *
 * SLOT 0 IS WRITTEN AS CUT -- NO MIRRORING.
 *   The mirror convention was read off the shipped biome, not assumed. Plain
 *   slot-to-slot NCC here is 0.43-0.49 in 'id' for EVERY pair, which is the
 *   shared light ramp and not shared texture: under a 16 px high-pass every
 *   pair drops to |0.023| max in every orientation. All four slots also carry
 *   the SAME ramp sign (tiltX +10.7..+21.5, tiltY +12.7..+21.6), which a flop
 *   or a flip would invert. So this biome applies no mirroring to any slot --
 *   the four are four independent originals -- and the replacement follows suit.
 *
 * Layout, matching every other biome in src/assets/tiles/ (full size in webp
 * only, the three mips in webp AND png; the mip PNGs are untracked,
 * .gitignore:21-24):
 *   silicate_plain_0.webp                full 512x256
 *   silicate_plain_0@half.{webp,png}     256x128
 *   silicate_plain_0@quarter.{webp,png}  128x64
 *   silicate_plain_0@eighth.{webp,png}   64x32
 * WebP quality 90, effort 4, smartSubsample -- as the rest of the corpus.
 *
 * The old slot 0 is recoverable from git.
 *
 * Usage: node scripts/silicate-plain-slot0-integrate-prod.cjs
 *   then: PICK=ship node scripts/tiles-silicate-plain-verify.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const BIOME = 'silicate_plain';
const WORK = path.join(ROOT, 'assets', 'style-test', 'tiles', BIOME);
const SRC = path.join(WORK, 'cand', 'slot0_d5p460_BR-F.webp');
const DST = path.join(ROOT, 'src', 'assets', 'tiles', BIOME);

const MIPS = [
  { suffix: '@half', w: 256, h: 128 },
  { suffix: '@quarter', w: 128, h: 64 },
  { suffix: '@eighth', w: 64, h: 32 },
];
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');

(async () => {
  // -- the three keepers must be byte-identical to the frozen copies --------
  for (const n of [1, 2, 3]) {
    const frozen = path.join(WORK, 'src', BIOME + '_' + n + '_src.webp');
    if (!fs.readFileSync(frozen).equals(fs.readFileSync(path.join(DST, BIOME + '_' + n + '.webp')))) {
      throw new Error('slot ' + n + ' has moved since the plate was built -- rebuild first');
    }
  }
  console.log('[freeze] slots 1/2/3 are byte-identical to the frozen sources');
  const before = fs.readdirSync(DST).filter((f) => !f.startsWith(BIOME + '_0')).sort().map((f) => f + ' ' + md5(path.join(DST, f)));

  const buf = fs.readFileSync(SRC);
  const meta = await sharp(buf).metadata();
  if (meta.width !== 512 || meta.height !== 256) throw new Error('source is not 512x256');
  if (!meta.hasAlpha) throw new Error('source has no alpha');
  console.log('[source] ' + path.relative(ROOT, SRC) + '  ' + meta.width + 'x' + meta.height + '  md5 ' + md5(SRC).slice(0, 12));

  await sharp(buf).webp(WEBP).toFile(path.join(DST, BIOME + '_0.webp'));
  for (const m of MIPS) {
    const r = () => sharp(buf).resize(m.w, m.h, { fit: 'fill' });
    await r().webp(WEBP).toFile(path.join(DST, BIOME + '_0' + m.suffix + '.webp'));
    await r().png().toFile(path.join(DST, BIOME + '_0' + m.suffix + '.png'));
  }
  console.log('[done] silicate_plain_0 + 3 mips written (webp and png), as cut, no mirroring');

  const want = [BIOME + '_0.webp'];
  for (const m of MIPS) { want.push(BIOME + '_0' + m.suffix + '.webp'); want.push(BIOME + '_0' + m.suffix + '.png'); }
  const have = fs.readdirSync(DST);
  const missing = want.filter((f) => !have.includes(f));
  if (missing.length) throw new Error('missing after integration: ' + missing.join(', '));
  console.log('[verify] all ' + want.length + ' slot-0 files present, ' + have.length + ' files in the biome directory');

  const after = fs.readdirSync(DST).filter((f) => !f.startsWith(BIOME + '_0')).sort().map((f) => f + ' ' + md5(path.join(DST, f)));
  if (before.join('\n') !== after.join('\n')) throw new Error('a slot 1/2/3 file CHANGED -- aborting');
  console.log('[verify] slots 1/2/3 untouched (' + after.length + ' files, md5 identical)');

  const s = await sharp(fs.readFileSync(path.join(DST, BIOME + '_0.webp'))).stats();
  console.log('[written] silicate_plain_0.webp  channel means R/G/B ' +
    s.channels.slice(0, 3).map((c) => c.mean.toFixed(1)).join(' / '));
  console.log('integration complete');
})();
