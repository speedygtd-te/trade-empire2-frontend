/**
 * PRODUCTION: integrate the final 4 boulder_field slots into
 * src/assets/tiles/boulder_field/.
 *
 * Final layout (basis = the approved boulder_field_even_d, secured as basis.png):
 *   boulder_field_0 = boulder_field_basis.png   (even_d, unchanged)
 *   boulder_field_1 = boulder_field_var_v1.png  (i2i strength 0.60, original)
 *   boulder_field_2 = boulder_field_var_v2.png  (i2i strength 0.60, .flop L<->R)
 *   boulder_field_3 = boulder_field_var_v3.png  (i2i strength 0.60, .flop L<->R)
 *
 * Sources are all 512x256 diamond-masked RGBA PNG in the style-test workspace.
 * Slots 2 & 3 are mirrored on the VERTICAL axis (sharp .flop = left<->right) to
 * reduce column-pattern repetition; never .flip (top<->bottom) — that breaks the
 * upper-left lighting convention.
 *
 * Per tile writes (matching existing bestand exactly):
 *   boulder_field_<n>.webp                full 512x256
 *   boulder_field_<n>@half.{webp,png}     256x128
 *   boulder_field_<n>@quarter.{webp,png}  128x64
 *   boulder_field_<n>@eighth.{webp,png}   64x32
 *
 * WebP: quality 90, effort 4. PNG mips: lossless.
 *
 * Usage: node scripts/boulder-field-integrate-basis.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');
const DST = path.join(__dirname, '..', 'src', 'assets', 'tiles', 'boulder_field');

const MAP = [
  { n: 0, src: 'boulder_field_basis.png', flop: false },
  { n: 1, src: 'boulder_field_var_v1.png', flop: false },
  { n: 2, src: 'boulder_field_var_v2.png', flop: true },
  { n: 3, src: 'boulder_field_var_v3.png', flop: true },
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
    await writeWebp(buf, null, null, path.join(DST, `boulder_field_${n}.webp`));
    for (const m of MIPS) {
      await writeWebp(buf, m.w, m.h, path.join(DST, `boulder_field_${n}${m.suffix}.webp`));
      await writePng(buf, m.w, m.h, path.join(DST, `boulder_field_${n}${m.suffix}.png`));
    }
    console.log(`[done] boulder_field_${n} <- ${src}${flop ? ' (flop L<->R)' : ''}`);
  }
  console.log('integration complete');
})();
