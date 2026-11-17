/**
 * PRODUCTION: integrate the four de-vegetated W082-hero tundra slots into
 * src/assets/tiles/tundra/, replacing the EARTH_LIKE-era tiles in place.
 *
 * Sources (already final, 512x256 diamond-masked RGBA PNG, built and verified by
 * scripts/tiles-tundra-hero-variants.cjs):
 *   assets/style-test/tiles/tundra_iter2/final/tundra_<n>.png
 * The flop of slots 2/3 is already baked into those files -- integrated AS-IS.
 *
 * The old tiles are recoverable from git (the tree was clean before this run) and
 * the pre-run captures stay frozen in tundra_iter2/src/.
 *
 * Per tile, matching the layout of every other biome in src/assets/tiles/
 * (see ice_shelf: full size in webp only, the three mips in webp AND png):
 *   tundra_<n>.webp                full 512x256
 *   tundra_<n>@half.{webp,png}     256x128
 *   tundra_<n>@quarter.{webp,png}  128x64
 *   tundra_<n>@eighth.{webp,png}   64x32
 *
 * WebP: quality 90, effort 4, smartSubsample -- as the rest of the corpus.
 *
 * Usage: node scripts/tundra-hero4-integrate-prod.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'style-test', 'tiles', 'tundra_iter2', 'final');
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
    console.log('[done] tundra_' + n + ' <- final/tundra_' + n + '.png (AS-IS, flop already baked in)');
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
