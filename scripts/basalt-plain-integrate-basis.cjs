/**
 * PRODUCTION: integrate the final 4 basalt_plain slots into
 * src/assets/tiles/basalt_plain/.
 *
 * Final layout (Rudi's pick basalt_plain_mild as basis):
 *   basalt_plain_0 = basalt_plain_basis.png   (the approved basalt_plain_mild, unchanged)
 *   basalt_plain_1 = basalt_plain_var_v1.png  (i2i, original)
 *   basalt_plain_2 = basalt_plain_var_v2.png  (i2i, .flop L<->R)
 *   basalt_plain_3 = basalt_plain_var_v3.png  (i2i, .flop L<->R)
 *
 * Sources are all 512x256 diamond-masked RGBA PNG in the style-test workspace.
 * Slots 2 & 3 are mirrored on the VERTICAL axis (sharp .flop = left<->right) to
 * reduce column-pattern repetition; never .flip (top<->bottom) — that breaks the
 * upper-left lighting convention.
 *
 * Per tile writes (matching existing bestand exactly):
 *   basalt_plain_<n>.webp                full 512x256
 *   basalt_plain_<n>@half.{webp,png}     256x128
 *   basalt_plain_<n>@quarter.{webp,png}  128x64
 *   basalt_plain_<n>@eighth.{webp,png}   64x32
 *
 * WebP: quality 90, effort 4. PNG mips: lossless.
 *
 * Usage: node scripts/basalt-plain-integrate-basis.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');
const DST = path.join(__dirname, '..', 'src', 'assets', 'tiles', 'basalt_plain');

const MAP = [
  { n: 0, src: 'basalt_plain_basis.png', flop: false },
  { n: 1, src: 'basalt_plain_var_v1.png', flop: false },
  { n: 2, src: 'basalt_plain_var_v2.png', flop: true },
  { n: 3, src: 'basalt_plain_var_v3.png', flop: true },
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
    await writeWebp(buf, null, null, path.join(DST, `basalt_plain_${n}.webp`));
    for (const m of MIPS) {
      await writeWebp(buf, m.w, m.h, path.join(DST, `basalt_plain_${n}${m.suffix}.webp`));
      await writePng(buf, m.w, m.h, path.join(DST, `basalt_plain_${n}${m.suffix}.png`));
    }
    console.log(`[done] basalt_plain_${n} <- ${src}${flop ? ' (flop L<->R)' : ''}`);
  }
  console.log('integration complete');
})();
