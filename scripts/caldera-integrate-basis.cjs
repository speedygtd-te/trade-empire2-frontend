/**
 * PRODUCTION: integrate the final 4 caldera slots into
 * src/assets/tiles/caldera/.
 *
 * Final layout (Rudi's pick caldera_mild2_a as basis):
 *   caldera_0 = caldera_basis.png   (the approved caldera_mild2_a, unchanged)
 *   caldera_1 = caldera_var_v1.png  (i2i, original)
 *   caldera_2 = caldera_var_v2.png  (i2i, .flop L<->R)
 *   caldera_3 = caldera_var_v3.png  (i2i, .flop L<->R)
 *
 * Sources are all 512x256 diamond-masked RGBA PNG in the style-test workspace.
 * Slots 2 & 3 are mirrored on the VERTICAL axis (sharp .flop = left<->right) to
 * reduce lava-vein repetition; never .flip (top<->bottom) — that breaks the
 * upper-left lighting convention.
 *
 * Per tile writes (matching existing bestand exactly):
 *   caldera_<n>.webp                full 512x256
 *   caldera_<n>@half.{webp,png}     256x128
 *   caldera_<n>@quarter.{webp,png}  128x64
 *   caldera_<n>@eighth.{webp,png}   64x32
 *
 * WebP: quality 90, effort 4. PNG mips: lossless.
 *
 * Usage: node scripts/caldera-integrate-basis.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');
const DST = path.join(__dirname, '..', 'src', 'assets', 'tiles', 'caldera');

const MAP = [
  { n: 0, src: 'caldera_basis.png', flop: false },
  { n: 1, src: 'caldera_var_v1.png', flop: false },
  { n: 2, src: 'caldera_var_v2.png', flop: true },
  { n: 3, src: 'caldera_var_v3.png', flop: true },
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
    await writeWebp(buf, null, null, path.join(DST, `caldera_${n}.webp`));
    for (const m of MIPS) {
      await writeWebp(buf, m.w, m.h, path.join(DST, `caldera_${n}${m.suffix}.webp`));
      await writePng(buf, m.w, m.h, path.join(DST, `caldera_${n}${m.suffix}.png`));
    }
    console.log(`[done] caldera_${n} <- ${src}${flop ? ' (flop L<->R)' : ''}`);
  }
  console.log('integration complete');
})();
