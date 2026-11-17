/**
 * PRODUCTION: integrate the 4 approved plains tiles into src/assets/tiles/plains/.
 *
 * Sources (style-test workspace, all 512x256 diamond-masked RGBA PNG):
 *   plains_0 = assets/style-test/tiles/plains_dirty_mix3.png   (approved hero, original)
 *   plains_1 = assets/style-test/tiles/plains_var_v1.png       (original)
 *   plains_2 = assets/style-test/tiles/plains_var_v2.png       (.flop() left<->right)
 *   plains_3 = assets/style-test/tiles/plains_var_v3.png       (.flop() left<->right)
 *
 * Slots 2 & 3 are mirrored on the VERTICAL axis (sharp .flop = left<->right swap)
 * to individualise them. This keeps the grass tufts UPRIGHT (only composition /
 * side lighting flips). NEVER .flip() (top<->bottom) — that would invert the
 * vegetation overhead. Verified visually before integration.
 *
 * Per tile writes (matching existing bestand):
 *   plains_<n>.webp                full 512x256
 *   plains_<n>@half.{webp,png}     256x128
 *   plains_<n>@quarter.{webp,png}  128x64
 *   plains_<n>@eighth.{webp,png}   64x32
 *
 * WebP: quality 90, effort 4 (matches generate-mipmaps.ts). PNG mips: lossless.
 *
 * Usage: node scripts/plains-integrate-prod.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');
const DST = path.join(__dirname, '..', 'src', 'assets', 'tiles', 'plains');

const MAP = [
  { n: 0, src: 'plains_dirty_mix3.png', flop: false },
  { n: 1, src: 'plains_var_v1.png', flop: false },
  { n: 2, src: 'plains_var_v2.png', flop: true },
  { n: 3, src: 'plains_var_v3.png', flop: true },
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
    // Slots 2 & 3: vertical-axis mirror (left<->right). Keeps tufts upright.
    if (flop) buf = await sharp(buf).flop().png().toBuffer();
    // full webp
    await writeWebp(buf, null, null, path.join(DST, `plains_${n}.webp`));
    // mips webp + png
    for (const m of MIPS) {
      await writeWebp(buf, m.w, m.h, path.join(DST, `plains_${n}${m.suffix}.webp`));
      await writePng(buf, m.w, m.h, path.join(DST, `plains_${n}${m.suffix}.png`));
    }
    console.log(`[done] plains_${n} <- ${src}${flop ? ' (flop L<->R)' : ''}`);
  }
  console.log('integration complete');
})();
