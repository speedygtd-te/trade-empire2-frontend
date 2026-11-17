/**
 * PRODUCTION: integrate the final 4 acid_lake slots into
 * src/assets/tiles/acid_lake/.
 *
 * Final layout (Rudi's pick acid_lake_3 as basis):
 *   acid_lake_0 = acid_lake_basis.png   (the approved old acid_lake_3, unchanged)
 *   acid_lake_1 = acid_lake_var_v1.png  (i2i, original)
 *   acid_lake_2 = acid_lake_var_v2.png  (i2i, .flop L<->R)
 *   acid_lake_3 = acid_lake_var_v3.png  (i2i, .flop L<->R)
 *
 * Sources are all 512x256 diamond-masked RGBA PNG in the style-test workspace.
 * Slots 2 & 3 are mirrored on the VERTICAL axis (sharp .flop = left<->right).
 * acid_lake is LIQUID so the flip axis is uncritical; .flop stays the convention
 * (never .flip top<->bottom).
 *
 * Per tile writes (matching existing bestand exactly):
 *   acid_lake_<n>.webp                full 512x256
 *   acid_lake_<n>@half.{webp,png}     256x128
 *   acid_lake_<n>@quarter.{webp,png}  128x64
 *   acid_lake_<n>@eighth.{webp,png}   64x32
 *
 * WebP: quality 90, effort 4. PNG mips: lossless.
 *
 * Usage: node scripts/acid-lake-integrate-basis.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');
const DST = path.join(__dirname, '..', 'src', 'assets', 'tiles', 'acid_lake');

const MAP = [
  { n: 0, src: 'acid_lake_basis.png', flop: false },
  { n: 1, src: 'acid_lake_var_v1.png', flop: false },
  { n: 2, src: 'acid_lake_var_v2.png', flop: true },
  { n: 3, src: 'acid_lake_var_v3.png', flop: true },
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
  for (const { n, src, flop } of MAP) {
    let buf = fs.readFileSync(path.join(SRC, src));
    const meta = await sharp(buf).metadata();
    if (meta.width !== 512 || meta.height !== 256) throw new Error(`${src} not 512x256`);
    if (flop) buf = await sharp(buf).flop().png().toBuffer();
    await writeWebp(buf, null, null, path.join(DST, `acid_lake_${n}.webp`));
    for (const m of MIPS) {
      await writeWebp(buf, m.w, m.h, path.join(DST, `acid_lake_${n}${m.suffix}.webp`));
      await writePng(buf, m.w, m.h, path.join(DST, `acid_lake_${n}${m.suffix}.png`));
    }
    console.log(`[done] acid_lake_${n} <- ${src}${flop ? ' (flop L<->R)' : ''}`);
  }
  console.log('integration complete');
})();
