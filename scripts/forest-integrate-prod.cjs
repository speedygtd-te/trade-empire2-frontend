/**
 * PRODUCTION: integrate the 4 FINAL forest slots (Rudi-approved) into
 * src/assets/tiles/forest/ — replacing the old forest tiles IN PLACE.
 *
 * Sources (style-test workspace, all 512x256 diamond-masked RGBA PNG):
 *   forest_0 = forest_0.png
 *   forest_1 = forest_1.png
 *   forest_2 = forest_2.png
 *   forest_3 = forest_3.png
 *
 * Sources are already final — integrated 1:1 / AS-IS, NO flop/flip.
 *
 * Per tile writes (matching existing bestand exactly):
 *   forest_<n>.webp                full 512x256
 *   forest_<n>@half.{webp,png}     256x128
 *   forest_<n>@quarter.{webp,png}  128x64
 *   forest_<n>@eighth.{webp,png}   64x32
 *
 * WebP: quality 90, effort 4, smartSubsample. PNG mips: sharp defaults.
 *
 * Usage: node scripts/forest-integrate-prod.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');
const DST = path.join(__dirname, '..', 'src', 'assets', 'tiles', 'forest');

const MAP = [
  { n: 0, src: 'forest_0.png' },
  { n: 1, src: 'forest_1.png' },
  { n: 2, src: 'forest_2.png' },
  { n: 3, src: 'forest_3.png' },
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
    await writeWebp(buf, null, null, path.join(DST, `forest_${n}.webp`));
    for (const m of MIPS) {
      await writeWebp(buf, m.w, m.h, path.join(DST, `forest_${n}${m.suffix}.webp`));
      await writePng(buf, m.w, m.h, path.join(DST, `forest_${n}${m.suffix}.png`));
    }
    console.log(`[done] forest_${n} <- ${src} (AS-IS, no flop)`);
  }
  console.log('integration complete');
})();
