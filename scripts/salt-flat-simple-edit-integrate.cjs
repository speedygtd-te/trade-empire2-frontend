/**
 * PRODUCTION: integrate the approved salt_flat basis + 3 simple-edit variants
 * into src/assets/tiles/salt_flat/ slots 0/1/2/3.
 *
 * Sources (style-test workspace, 512x256 diamond-masked RGBA PNG):
 *   salt_flat_0 = salt_flat_basis.png    (approved dark2 basis, unchanged)
 *   salt_flat_1 = salt_flat_se_v1.png    (seed 20480, original)
 *   salt_flat_2 = salt_flat_se_v2.png    (seed 48002, .flop L<->R)
 *   salt_flat_3 = salt_flat_se_v3.png    (seed 58003, .flop L<->R)
 *
 * Variants from scripts/salt-flat-simple-edit-variants.cjs (flux-pro/kontext,
 * prompt "create a slightly different pattern", per-variant vertical
 * brightness equalization). Slots 2 & 3 flopped on the VERTICAL axis
 * (sharp .flop = left<->right) for individualisation. Never .flip (top<->bottom).
 *
 * Per tile writes (matching existing bestand exactly):
 *   salt_flat_<n>.webp                full 512x256 webp
 *   salt_flat_<n>@half.{webp,png}     256x128
 *   salt_flat_<n>@quarter.{webp,png}  128x64
 *   salt_flat_<n>@eighth.{webp,png}   64x32
 *
 * WebP: quality 90, effort 4. PNG mips: lossless.
 *
 * Usage: node scripts/salt-flat-simple-edit-integrate.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');
const DST = path.join(__dirname, '..', 'src', 'assets', 'tiles', 'salt_flat');

const MAP = [
  { n: 0, src: 'salt_flat_basis.png', flop: false },
  { n: 1, src: 'salt_flat_se_v1.png', flop: false },
  { n: 2, src: 'salt_flat_se_v2.png', flop: true },
  { n: 3, src: 'salt_flat_se_v3.png', flop: true },
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
    if (meta.width !== 512 || meta.height !== 256) throw new Error(`${src} not 512x256 (got ${meta.width}x${meta.height})`);
    if (flop) buf = await sharp(buf).flop().png().toBuffer();
    await writeWebp(buf, null, null, path.join(DST, `salt_flat_${n}.webp`));
    for (const m of MIPS) {
      await writeWebp(buf, m.w, m.h, path.join(DST, `salt_flat_${n}${m.suffix}.webp`));
      await writePng(buf, m.w, m.h, path.join(DST, `salt_flat_${n}${m.suffix}.png`));
    }
    console.log(`[done] salt_flat_${n} <- ${src}${flop ? ' (flop L<->R)' : ''}`);
  }
  console.log('integration complete');
})();
