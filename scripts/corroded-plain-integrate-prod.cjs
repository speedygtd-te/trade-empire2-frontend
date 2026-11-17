/**
 * PRODUCTION: integrate the 4 FINAL corroded_plain variants (Rudi-approved,
 * TOXIC family) into src/assets/tiles/corroded_plain/.
 *
 * Sources (style-test workspace, all 512x256 diamond-masked RGBA PNG):
 *   corroded_plain_0 = corroded_plain_0.png   (dry + dead plants, original)
 *   corroded_plain_1 = corroded_plain_1.png   (dry + dead plants, original)
 *   corroded_plain_2 = corroded_plain_2.png   (puddle, ALREADY .flop L<->R)
 *   corroded_plain_3 = corroded_plain_3.png   (puddle, ALREADY .flop L<->R)
 *
 * IMPORTANT: slots 2 & 3 are ALREADY mirrored in the source files. This script
 * integrates all 4 sources 1:1 / AS-IS — NO further flop/flip is applied.
 *
 * Per tile writes (matching existing bestand exactly):
 *   corroded_plain_<n>.webp                full 512x256
 *   corroded_plain_<n>@half.{webp,png}     256x128
 *   corroded_plain_<n>@quarter.{webp,png}  128x64
 *   corroded_plain_<n>@eighth.{webp,png}   64x32
 *
 * WebP: quality 90, effort 4, smartSubsample. PNG mips: lossless.
 *
 * Usage: node scripts/corroded-plain-integrate-prod.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');
const DST = path.join(__dirname, '..', 'src', 'assets', 'tiles', 'corroded_plain');

const MAP = [
  { n: 0, src: 'corroded_plain_0.png' },
  { n: 1, src: 'corroded_plain_1.png' },
  { n: 2, src: 'corroded_plain_2.png' },
  { n: 3, src: 'corroded_plain_3.png' },
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
    await writeWebp(buf, null, null, path.join(DST, `corroded_plain_${n}.webp`));
    for (const m of MIPS) {
      await writeWebp(buf, m.w, m.h, path.join(DST, `corroded_plain_${n}${m.suffix}.webp`));
      await writePng(buf, m.w, m.h, path.join(DST, `corroded_plain_${n}${m.suffix}.png`));
    }
    console.log(`[done] corroded_plain_${n} <- ${src} (AS-IS, no flop)`);
  }
  console.log('integration complete');
})();
