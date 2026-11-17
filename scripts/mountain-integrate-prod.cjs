/**
 * PRODUCTION: integrate the 4 FINAL mountain slots (Rudi-approved) into
 * src/assets/tiles/mountain/ — replacing the old Batch-1 mountain tiles IN PLACE.
 *
 * Sources (style-test workspace, all 512x256 diamond-masked RGBA PNG):
 *   mountain_0 = mountain_0.png
 *   mountain_1 = mountain_1.png
 *   mountain_2 = mountain_2.png
 *   mountain_3 = mountain_3.png
 *
 * Sources are already final — integrated 1:1 / AS-IS, NO flop/flip.
 *
 * Per tile writes (matching existing bestand exactly):
 *   mountain_<n>.webp                full 512x256
 *   mountain_<n>@half.{webp,png}     256x128
 *   mountain_<n>@quarter.{webp,png}  128x64
 *   mountain_<n>@eighth.{webp,png}   64x32
 *
 * WebP: quality 90, effort 4, smartSubsample. PNG mips: sharp defaults.
 *
 * Usage: node scripts/mountain-integrate-prod.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');
const DST = path.join(__dirname, '..', 'src', 'assets', 'tiles', 'mountain');

const MAP = [
  { n: 0, src: 'mountain_0.png' },
  { n: 1, src: 'mountain_1.png' },
  { n: 2, src: 'mountain_2.png' },
  { n: 3, src: 'mountain_3.png' },
];

const MIPS = [
  { suffix: '@half', w: 256, h: 128 },
  { suffix: '@quarter', w: 128, h: 64 },
  { suffix: '@eighth', w: 64, h: 32 },
];

const WEBP = { quality: 90, effort: 4, smartSubsample: true };

async function writeWebp(buf, w, h, out) {
  const img = w ? sharp(buf).resize(w, h, { fit: 'fill' }) : sharp(buf);
  await img.webp(WEBP).toFile(out);
}
async function writePng(buf, w, h, out) {
  await sharp(buf).resize(w, h, { fit: 'fill' }).png().toFile(out);
}

(async () => {
  fs.mkdirSync(DST, { recursive: true });
  for (const { n, src } of MAP) {
    const buf = fs.readFileSync(path.join(SRC, src));
    const meta = await sharp(buf).metadata();
    if (meta.width !== 512 || meta.height !== 256) throw new Error(`${src} not 512x256`);
    if (!meta.hasAlpha) throw new Error(`${src} has no alpha`);
    await writeWebp(buf, null, null, path.join(DST, `mountain_${n}.webp`));
    for (const m of MIPS) {
      await writeWebp(buf, m.w, m.h, path.join(DST, `mountain_${n}${m.suffix}.webp`));
      await writePng(buf, m.w, m.h, path.join(DST, `mountain_${n}${m.suffix}.png`));
    }
    console.log(`[done] mountain_${n} <- ${src} (AS-IS, no flop)`);
  }
  console.log('integration complete');
})();
