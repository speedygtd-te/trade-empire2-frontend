/**
 * PRODUCTION: integrate the 4 FINAL rocky_desert variants (Rudi-approved) into
 * src/assets/tiles/rocky_desert/.
 *
 * Sources (style-test workspace, all 512x256 diamond-masked RGBA PNG,
 * derived from sand_dunes_2 + grey stones via FLUX edit):
 *   rocky_desert_0 = rocky_desert_sd_0.png   (original)
 *   rocky_desert_1 = rocky_desert_sd_v1.png  (original)
 *   rocky_desert_2 = rocky_desert_sd_v3.png  (.flop L<->R)
 *   rocky_desert_3 = rocky_desert_sd_v2.png  (.flop L<->R)
 *
 * Slots 2 & 3 are mirrored on the VERTICAL axis (sharp .flop = left<->right) to
 * individualise them (.flop convention, never .flip top<->bottom).
 *
 * Per tile writes (matching existing bestand exactly):
 *   rocky_desert_<n>.webp                full 512x256
 *   rocky_desert_<n>@half.{webp,png}     256x128
 *   rocky_desert_<n>@quarter.{webp,png}  128x64
 *   rocky_desert_<n>@eighth.{webp,png}   64x32
 *
 * WebP: quality 90, effort 4. PNG mips: lossless.
 *
 * Usage: node scripts/rocky-desert-integrate-prod.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');
const DST = path.join(__dirname, '..', 'src', 'assets', 'tiles', 'rocky_desert');

const MAP = [
  { n: 0, src: 'rocky_desert_sd_0.png', flop: false },
  { n: 1, src: 'rocky_desert_sd_v1.png', flop: false },
  { n: 2, src: 'rocky_desert_sd_v3.png', flop: true },
  { n: 3, src: 'rocky_desert_sd_v2.png', flop: true },
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
    await writeWebp(buf, null, null, path.join(DST, `rocky_desert_${n}.webp`));
    for (const m of MIPS) {
      await writeWebp(buf, m.w, m.h, path.join(DST, `rocky_desert_${n}${m.suffix}.webp`));
      await writePng(buf, m.w, m.h, path.join(DST, `rocky_desert_${n}${m.suffix}.png`));
    }
    console.log(`[done] rocky_desert_${n} <- ${src}${flop ? ' (flop L<->R)' : ''}`);
  }
  console.log('integration complete');
})();
