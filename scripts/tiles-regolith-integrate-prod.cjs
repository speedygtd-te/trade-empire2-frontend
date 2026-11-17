/**
 * PRODUCTION: write the two agreed regolith changes into src/assets/tiles/regolith/.
 *
 * TWO FILES CHANGE. SLOTS 0 AND 1 ARE NOT TOUCHED, and neither is
 * src/assets/tiles/glacier/ -- see the coherence note at the bottom.
 *
 *   regolith_2  <-  slot2/OFF-c.webp
 *       A new capture derived from regolith_0, as Rudi asked. The shipped slot
 *       2 was one enormous smooth basin filling most of the diamond (blob 29.7,
 *       the highest in the biome) and it repeated visibly in a field.
 *       ROUTE: the OFFSET route, not flux. regolith_0 was flattened with a
 *       degree-5 polynomial, laid into the iso lattice, texture-bombed into a
 *       rimless 768x512 plate, and a 512x256 window cut out of it at offset
 *       (0, 256), then masked with regolith's own diamond alpha and graded.
 *       WHY NOT FLUX: seven kontext returns were fetched over two rounds. Round
 *       1 failed on all four because the plate still carried regolith_0's own
 *       ramp and flux quantised onto the lattice it could see (bubble wrap,
 *       scaly arrays, a studio render). Round 2 on the flattened plate returned
 *       one usable image, R2-SOFT, but it had smoothed the ground away:
 *       micro8 6.1-6.6 against the biome's 10.2-13.7, sd 13.5-14.7 against
 *       27-42. It read as a soft grey cloud, not as regolith. The plate window
 *       keeps the biome's own grain exactly (micro8 10.84 against regolith_0's
 *       10.55) and has no dominant feature (blob 4.8).
 *       Graded to the GROUND level p70 132.0 -- regolith_0's own value, not a
 *       mean: the interior mean is dragged by how much shadow a tile carries.
 *       B/R 1.000, G/R 1.000, exactly neutral like slots 0 and 1.
 *       No light plane is imposed -- regolith is first batch and this round is
 *       explicitly not a tilt intervention.
 *
 *   regolith_3  <-  slot3/regolith_3_T101.webp
 *       Pure grade, no flux, no new pixels. The shipped capture is the only one
 *       in the biome that is not neutral: B/R 0.942, G/R 0.979, sat 5.9% -- it
 *       reads as sand patches among grey ones. T101 puts it at B/R 1.010 /
 *       G/R 1.006, a shade to the cool side of neutral, on the corpus line
 *       G/R = 1 + 0.60 x (B/R - 1). Level is HELD at its own p70 154.9: hue
 *       only, no darkening.
 *       The residual-chroma cap of the corpus (1.2%) runs with it. It has to:
 *       slot 3 also carries 3.32% RESIDUAL chroma against 0.02-0.05% for the
 *       other three, so a uniform tint alone fixes the cast and leaves the
 *       warm mottling behind (variant T100-RAW shows exactly that).
 *
 * GLACIER IS NOT AFFECTED AND IS NOT TOUCHED.
 *   Verified against the files, not against a header: mean-centred masked NCC
 *   of each shipped glacier slot against all four regolith captures in all four
 *   orientations gives glacier_0 <- regolith_3 (0.833), glacier_1 <- regolith_1
 *   (0.785), glacier_2 <- regolith_0 rotated 180 (0.607), glacier_3 <-
 *   regolith_3 rotated 180 (0.737). regolith_2 is used NOWHERE in glacier, so
 *   replacing it cannot reach it. regolith_3 IS a glacier source, but the
 *   glacier tiles are already baked and graded to B/R 1.100 with the chroma cap
 *   applied -- the warm cast was removed there in 2026-09-03. Neutralising
 *   regolith_3 moves regolith TOWARD glacier's direction, not away from it.
 *
 * Per tile, matching the layout of every other biome in src/assets/tiles/
 * (full size in webp only, the three mips in webp AND png; the mip PNGs are
 * deliberately untracked, .gitignore:24):
 *   regolith_<n>.webp                full 512x256
 *   regolith_<n>@half.{webp,png}     256x128
 *   regolith_<n>@quarter.{webp,png}  128x64
 *   regolith_<n>@eighth.{webp,png}   64x32
 *
 * WebP: quality 90, effort 4, smartSubsample -- as the rest of the corpus.
 * The old tiles are recoverable from git.
 *
 * Usage: node scripts/tiles-regolith-integrate-prod.cjs
 */
const fs = require('fs');
const path = require('path');
const M = require('./lib-tile-metrics.cjs');
const sharp = M.sharp;

const ROOT = path.join(__dirname, '..');
const WORK = path.join(ROOT, 'assets', 'style-test', 'tiles', 'regolith_fix');
const DST = path.join(ROOT, 'src', 'assets', 'tiles', 'regolith');

const SOURCE = {
  2: path.join(WORK, 'slot2', 'OFF-c.webp'),
  3: path.join(WORK, 'slot3', 'regolith_3_T101.webp'),
};
const MIPS = [
  { suffix: '@half', w: 256, h: 128 },
  { suffix: '@quarter', w: 128, h: 64 },
  { suffix: '@eighth', w: 64, h: 32 },
];

(async () => {
  const before = {};
  for (const n of [0, 1, 2, 3]) {
    before[n] = require('crypto').createHash('md5')
      .update(fs.readFileSync(path.join(DST, 'regolith_' + n + '.webp'))).digest('hex');
  }

  for (const n of Object.keys(SOURCE)) {
    const src = SOURCE[n];
    const buf = fs.readFileSync(src);
    const meta = await sharp(buf).metadata();
    if (meta.width !== 512 || meta.height !== 256) throw new Error(src + ' is not 512x256');
    if (!meta.hasAlpha) throw new Error(src + ' has no alpha');

    // the full size goes over as PNG -> webp, so the tile is encoded once, not twice
    const png = await sharp(buf).png().toBuffer();
    await sharp(png).webp(M.WEBP).toFile(path.join(DST, 'regolith_' + n + '.webp'));
    for (const m of MIPS) {
      const r = () => sharp(png).resize(m.w, m.h, { fit: 'fill' });
      await r().webp(M.WEBP).toFile(path.join(DST, 'regolith_' + n + m.suffix + '.webp'));
      await r().png().toFile(path.join(DST, 'regolith_' + n + m.suffix + '.png'));
    }
    console.log('[done] regolith_' + n + ' <- ' + path.relative(ROOT, src));
  }

  // ---- slots 0 and 1 must be byte-identical to what they were --------------
  for (const n of [0, 1]) {
    const now = require('crypto').createHash('md5')
      .update(fs.readFileSync(path.join(DST, 'regolith_' + n + '.webp'))).digest('hex');
    if (now !== before[n]) throw new Error('regolith_' + n + ' CHANGED -- it must not');
    console.log('[hold] regolith_' + n + ' unchanged, md5 ' + now.slice(0, 12));
  }

  // ---- the file set is complete and has no extras -------------------------
  const want = [];
  for (let n = 0; n < 4; n++) {
    want.push('regolith_' + n + '.webp');
    for (const m of MIPS) { want.push('regolith_' + n + m.suffix + '.webp'); want.push('regolith_' + n + m.suffix + '.png'); }
  }
  const have = fs.readdirSync(DST);
  const missing = want.filter((f) => !have.includes(f));
  const extra = have.filter((f) => !want.includes(f));
  if (missing.length) throw new Error('missing after integration: ' + missing.join(', '));
  console.log('[verify] ' + want.length + ' files present' + (extra.length ? ', unexpected extras: ' + extra.join(', ') : ', no extras'));

  // ---- and measure what was actually written ------------------------------
  console.log('');
  console.log('AFTER -- measured on the written .webp in src/assets/tiles/regolith/');
  console.log(' slot    intL     p70   dark%     B/R    G/R  sat%  chr%  blow%    sd  micro8   tiltX  tiltY');
  for (let n = 0; n < 4; n++) {
    const f = path.join(DST, 'regolith_' + n + '.webp');
    const s = await M.statsOf(f);
    const mi = await M.microContrast(f.replace(/\.webp$/, '@eighth.webp'), f);
    console.log('   ' + n + (n === 2 || n === 3 ? '*' : ' ') + s.intLum.toFixed(1).padStart(7) + s.p70.toFixed(1).padStart(8) +
      (100 * s.dark).toFixed(1).padStart(8) + s.br.toFixed(3).padStart(8) + s.gr.toFixed(3).padStart(7) +
      (100 * s.sat).toFixed(1).padStart(6) + (100 * s.chromaRes).toFixed(2).padStart(6) +
      (100 * s.blow).toFixed(2).padStart(7) + s.sd.toFixed(1).padStart(6) + mi.toFixed(2).padStart(8) +
      s.tiltX.toFixed(1).padStart(8) + s.tiltY.toFixed(1).padStart(7));
  }
  console.log('   * = replaced in this run');
  console.log('integration complete -- src/assets/tiles/glacier/ was not touched');
})();
