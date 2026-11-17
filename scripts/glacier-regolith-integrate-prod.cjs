/**
 * PRODUCTION: integrate the L 44 / B/R 1.10 / flatten deg-5 rung (L44C110F5) of
 * the regolith-derived glacier ladder into src/assets/tiles/glacier/, replacing
 * the old blue glacier-ice set in place.
 *
 * WHY THIS RUNG (Rudi's pick from the ladder, 2026-09-03)
 *   The ICE family follows real ice moons (Ganymede, Callisto): dusty neutral
 *   grey, not blue glacier ice. The set is therefore derived from REGOLITH, not
 *   from the shipped blue original, and graded to canvas luma 44 with a mild
 *   cool cast B/R 1.10 (G/R on the corpus line 1 + 0.60*(B/R-1) = 1.06).
 *   Flatten degree 5 divides an analytic deg-5 polynomial out of each tile's own
 *   interior luma: it takes the lattice at play scale (grid_tot, 48x24 px per
 *   tile) from 14.76 (plane only) down to 5.77, ratio 0.59 against the texture's
 *   own roughness -- below the new tundra's 0.87, far below the rejected
 *   shipped tundra's 1.12. Degree 3 was rejected because its rim halo tipped
 *   positive (+0.82); degree 5 keeps it negative (-1.66).
 *   Light plane tiltY 3.0 / tiltX 0.0 -- the same normalisation as the new
 *   tundra, so the two biomes on one planet do not show two raster characters.
 *
 * SLOTS (orientation already baked into the source PNGs)
 *   slot 0 = regolith_3            (unmirrored)
 *   slot 1 = regolith_1            (unmirrored -- carries a directional ridge
 *                                   highlight, must never be mirrored)
 *   slot 2 = regolith_0 rotated 180
 *   slot 3 = regolith_3 rotated 180
 *   regolith_2 is excluded (crater too prominent).
 *
 * src/assets/tiles/regolith/ IS NOT TOUCHED -- the base biome stays as it is.
 *
 * Sources (already final, 512x256 diamond-masked RGBA PNG, built and verified by
 * scripts/tiles-glacier-regolith-ladder.cjs):
 *   assets/style-test/tiles/glacier_reg/L44C110F5/glacier_<n>.png
 * Integrated AS-IS. The old tiles are recoverable from git.
 *
 * Per tile, matching the layout of every other biome in src/assets/tiles/
 * (full size in webp only, the three mips in webp AND png; the mip PNGs are
 * deliberately untracked, .gitignore:24):
 *   glacier_<n>.webp                full 512x256
 *   glacier_<n>@half.{webp,png}     256x128
 *   glacier_<n>@quarter.{webp,png}  128x64
 *   glacier_<n>@eighth.{webp,png}   64x32
 *
 * WebP: quality 90, effort 4, smartSubsample -- as the rest of the corpus.
 *
 * Usage: node scripts/glacier-regolith-integrate-prod.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'style-test', 'tiles', 'glacier_reg', 'L44C110F5');
const DST = path.join(ROOT, 'src', 'assets', 'tiles', 'glacier');

const MIPS = [
  { suffix: '@half', w: 256, h: 128 },
  { suffix: '@quarter', w: 128, h: 64 },
  { suffix: '@eighth', w: 64, h: 32 },
];
const WEBP = { quality: 90, effort: 4, smartSubsample: true };

(async () => {
  fs.mkdirSync(DST, { recursive: true });
  for (let n = 0; n < 4; n++) {
    const src = path.join(SRC, 'glacier_' + n + '.png');
    const buf = fs.readFileSync(src);
    const meta = await sharp(buf).metadata();
    if (meta.width !== 512 || meta.height !== 256) throw new Error('glacier_' + n + '.png is not 512x256');
    if (!meta.hasAlpha) throw new Error('glacier_' + n + '.png has no alpha');

    await sharp(buf).webp(WEBP).toFile(path.join(DST, 'glacier_' + n + '.webp'));
    for (const m of MIPS) {
      const r = () => sharp(buf).resize(m.w, m.h, { fit: 'fill' });
      await r().webp(WEBP).toFile(path.join(DST, 'glacier_' + n + m.suffix + '.webp'));
      await r().png().toFile(path.join(DST, 'glacier_' + n + m.suffix + '.png'));
    }
    console.log('[done] glacier_' + n + ' <- glacier_reg/L44C110F5/glacier_' + n + '.png (AS-IS, orientation already baked in)');
  }

  const want = [];
  for (let n = 0; n < 4; n++) {
    want.push('glacier_' + n + '.webp');
    for (const m of MIPS) { want.push('glacier_' + n + m.suffix + '.webp'); want.push('glacier_' + n + m.suffix + '.png'); }
  }
  const have = fs.readdirSync(DST);
  const missing = want.filter((f) => !have.includes(f));
  const extra = have.filter((f) => !want.includes(f));
  if (missing.length) throw new Error('missing after integration: ' + missing.join(', '));
  console.log('[verify] ' + want.length + ' files present' + (extra.length ? ', unexpected extras: ' + extra.join(', ') : ', no extras'));
  console.log('integration complete');
})();
