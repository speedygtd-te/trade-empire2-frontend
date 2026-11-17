/**
 * PRODUCTION: integrate the tiltY 3.0 / tiltX 0.0 tundra rung (T030X0) into
 * src/assets/tiles/tundra/, replacing the tiltY 11 set in place.
 *
 * WHY THIS RUNG
 *   The tiltY 11 set that ships today still reads as a diamond lattice: every
 *   tile is brighter at the top, and a ramp that restarts at every tile is a
 *   sawtooth. Flattening the ramp to tiltY 3 and dropping the side ramp to
 *   tiltX 0 takes the lattice amplitude at play scale (grid_tot, sd of the
 *   lattice-folded phase average in luma units, 48x24 px per tile) from
 *   10.40 (pre-iteration) -> 7.23 (tiltY 11, shipping now) -> 2.57, and the
 *   same number against the texture's own roughness from 1.12 -> 2.23 -> 0.85.
 *   The tile keeps 17% of brightness travel top-to-bottom, so it is not flat.
 *
 * Sources (already final, 512x256 diamond-masked RGBA PNG, built and verified by
 * scripts/tiles-tundra-tilt-ladder.cjs):
 *   assets/style-test/tiles/tundra_iter2/tilt/T030X0/tundra_<n>.png
 * The flop of slots 2/3 is already baked into those files -- integrated AS-IS.
 * With tiltX 0 the flop can no longer be read off the ramp sign; it was proven
 * on the PATTERN instead (masked NCC against the ungraded base: slots 2/3 score
 * 0.99 against flop(base) and 0.00 against base, slots 0/1 the other way round).
 *
 * The old tiles are recoverable from git (the tree was clean before this run).
 *
 * Per tile, matching the layout of every other biome in src/assets/tiles/
 * (see ice_shelf: full size in webp only, the three mips in webp AND png;
 * the mip PNGs are deliberately untracked, .gitignore:24):
 *   tundra_<n>.webp                full 512x256
 *   tundra_<n>@half.{webp,png}     256x128
 *   tundra_<n>@quarter.{webp,png}  128x64
 *   tundra_<n>@eighth.{webp,png}   64x32
 *
 * WebP: quality 90, effort 4, smartSubsample -- as the rest of the corpus.
 *
 * Usage: node scripts/tundra-tilt3-integrate-prod.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'style-test', 'tiles', 'tundra_iter2', 'tilt', 'T030X0');
const DST = path.join(ROOT, 'src', 'assets', 'tiles', 'tundra');

const MIPS = [
  { suffix: '@half', w: 256, h: 128 },
  { suffix: '@quarter', w: 128, h: 64 },
  { suffix: '@eighth', w: 64, h: 32 },
];
const WEBP = { quality: 90, effort: 4, smartSubsample: true };

(async () => {
  fs.mkdirSync(DST, { recursive: true });
  for (let n = 0; n < 4; n++) {
    const src = path.join(SRC, 'tundra_' + n + '.png');
    const buf = fs.readFileSync(src);
    const meta = await sharp(buf).metadata();
    if (meta.width !== 512 || meta.height !== 256) throw new Error('tundra_' + n + '.png is not 512x256');
    if (!meta.hasAlpha) throw new Error('tundra_' + n + '.png has no alpha');

    await sharp(buf).webp(WEBP).toFile(path.join(DST, 'tundra_' + n + '.webp'));
    for (const m of MIPS) {
      const r = () => sharp(buf).resize(m.w, m.h, { fit: 'fill' });
      await r().webp(WEBP).toFile(path.join(DST, 'tundra_' + n + m.suffix + '.webp'));
      await r().png().toFile(path.join(DST, 'tundra_' + n + m.suffix + '.png'));
    }
    console.log('[done] tundra_' + n + ' <- tilt/T030X0/tundra_' + n + '.png (AS-IS, flop already baked in)');
  }

  const want = [];
  for (let n = 0; n < 4; n++) {
    want.push('tundra_' + n + '.webp');
    for (const m of MIPS) { want.push('tundra_' + n + m.suffix + '.webp'); want.push('tundra_' + n + m.suffix + '.png'); }
  }
  const have = fs.readdirSync(DST);
  const missing = want.filter((f) => !have.includes(f));
  const extra = have.filter((f) => !want.includes(f));
  if (missing.length) throw new Error('missing after integration: ' + missing.join(', '));
  console.log('[verify] ' + want.length + ' files present' + (extra.length ? ', unexpected extras: ' + extra.join(', ') : ', no extras'));
  console.log('integration complete');
})();
