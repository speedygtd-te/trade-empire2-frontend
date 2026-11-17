/**
 * PRODUCTION: integrate the 3 simple-edit sand_dunes variants into
 * src/assets/tiles/sand_dunes/ slots 1/2/3. Slot 0 (basis) stays UNTOUCHED.
 *
 * Sources (style-test workspace, 512x256 diamond-masked RGBA PNG), produced by
 * scripts/sand-dunes-simple-edit-variants.cjs (flux-pro/kontext, prompt
 * "create a slightly different pattern"):
 *   sand_dunes_1 = sand_dunes_se_v1.png  (seed 31001, original)
 *   sand_dunes_2 = sand_dunes_se_v2.png  (seed 48002, .flop L<->R)
 *   sand_dunes_3 = sand_dunes_se_v3.png  (seed 58003, .flop L<->R)
 *
 * Slots 2 & 3 flopped on the VERTICAL axis (sharp .flop = left<->right) for
 * individualisation. Never .flip (top<->bottom).
 *
 * Per tile writes (matching existing bestand exactly):
 *   sand_dunes_<n>.webp                full 512x256 webp
 *   sand_dunes_<n>@half.{webp,png}     256x128
 *   sand_dunes_<n>@quarter.{webp,png}  128x64
 *   sand_dunes_<n>@eighth.{webp,png}   64x32
 *
 * WebP: quality 90, effort 4. PNG mips: lossless.
 *
 * Usage: node scripts/sand-dunes-simple-edit-integrate.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');
const DST = path.join(__dirname, '..', 'src', 'assets', 'tiles', 'sand_dunes');

const MAP = [
  { n: 1, src: 'sand_dunes_se_v1.png', flop: false },
  { n: 2, src: 'sand_dunes_se_v2.png', flop: true },
  { n: 3, src: 'sand_dunes_se_v3.png', flop: true },
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
  for (const { n, src, flop } of MAP) {
    let buf = fs.readFileSync(path.join(SRC, src));
    const meta = await sharp(buf).metadata();
    if (meta.width !== 512 || meta.height !== 256) throw new Error(`${src} not 512x256`);
    if (flop) buf = await sharp(buf).flop().png().toBuffer();
    await writeWebp(buf, null, null, path.join(DST, `sand_dunes_${n}.webp`));
    for (const m of MIPS) {
      await writeWebp(buf, m.w, m.h, path.join(DST, `sand_dunes_${n}${m.suffix}.webp`));
      await writePng(buf, m.w, m.h, path.join(DST, `sand_dunes_${n}${m.suffix}.png`));
    }
    console.log(`[done] sand_dunes_${n} <- ${src}${flop ? ' (flop L<->R)' : ''}`);
  }
  console.log('integration complete');
})();
