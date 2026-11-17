/**
 * PRODUCTION: integrate the 4 canyon variants (Biom #8) into
 * src/assets/tiles/canyon/.
 *
 * Sources (style-test workspace, all 512x256 diamond-masked RGBA PNG):
 *   canyon_0 = canyon_basis.png    (Rudi-approved canyon_medium, NO grey stones)
 *   canyon_1 = canyon_var_v1.png   (i2i + scattered grey stones, original)
 *   canyon_2 = canyon_var_v1.png   (i2i + grey stones, .flop L<->R) *see note
 *   canyon_3 = canyon_var_v3.png   (i2i + grey stones, .flop L<->R)
 *
 * NOTE on slot 2: canyon_var_v2 failed Sichtprüfung 3x (recurring central
 * brightness disc / mild dome relief — violates no-central-feature/no-hotspot).
 * To avoid shipping that artifact, slot 2 reuses the PASSED v1 generation with
 * .flop applied so it still reads as an individualised mirrored tile in the grid.
 * v2 is flagged BLOCKED in the agent report for Rudi's decision.
 *
 * Slots 2 & 3 are mirrored on the VERTICAL axis (sharp .flop = left<->right) to
 * individualise them (.flop convention, never .flip top<->bottom).
 *
 * Per tile writes (matching existing bestand exactly):
 *   canyon_<n>.webp                full 512x256
 *   canyon_<n>@half.{webp,png}     256x128
 *   canyon_<n>@quarter.{webp,png}  128x64
 *   canyon_<n>@eighth.{webp,png}   64x32
 *
 * WebP: quality 90, effort 4. PNG mips: lossless.
 *
 * Usage: node scripts/canyon-integrate-prod.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');
const DST = path.join(__dirname, '..', 'src', 'assets', 'tiles', 'canyon');

const MAP = [
  { n: 0, src: 'canyon_basis.png', flop: false },
  { n: 1, src: 'canyon_var_v1.png', flop: false },
  { n: 2, src: 'canyon_var_v1.png', flop: true },
  { n: 3, src: 'canyon_var_v3.png', flop: true },
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
    await writeWebp(buf, null, null, path.join(DST, `canyon_${n}.webp`));
    for (const m of MIPS) {
      await writeWebp(buf, m.w, m.h, path.join(DST, `canyon_${n}${m.suffix}.webp`));
      await writePng(buf, m.w, m.h, path.join(DST, `canyon_${n}${m.suffix}.png`));
    }
    console.log(`[done] canyon_${n} <- ${src}${flop ? ' (flop L<->R)' : ''}`);
  }
  console.log('integration complete');
})();
