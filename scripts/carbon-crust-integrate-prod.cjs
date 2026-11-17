/**
 * PRODUCTION: integrate the approved carbon_crust basis + 3 variants
 * into src/assets/tiles/carbon_crust/ slots 0/1/2/3.
 *
 * Sources (style-test workspace, 512x256 diamond-masked RGBA PNG):
 *   carbon_crust_0 = carbon_crust_v4.png    (basis, Rudi's favourite)
 *   carbon_crust_1 = carbon_crust_se_v1.png (already flopped IN-PLACE earlier)
 *   carbon_crust_2 = carbon_crust_se_v2.png (unflipped)
 *   carbon_crust_3 = carbon_crust_se_v3.png (already flopped IN-PLACE earlier)
 *
 * ⚠️ CRITICAL: NO re-flip here. Unlike the salt_flat pipeline, se_v1 & se_v3
 * were already horizontally mirrored in-place in a previous step. Flipping
 * them again would UNDO that mirror. Therefore ALL slots use flop:false.
 *
 * Per tile writes (matching existing bestand exactly):
 *   carbon_crust_<n>.webp                full 512x256 webp
 *   carbon_crust_<n>@half.{webp,png}     256x128
 *   carbon_crust_<n>@quarter.{webp,png}  128x64
 *   carbon_crust_<n>@eighth.{webp,png}   64x32
 *
 * WebP: quality 90, effort 4, smartSubsample. PNG mips: lossless.
 *
 * Usage: node scripts/carbon-crust-integrate-prod.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');
const DST = path.join(__dirname, '..', 'src', 'assets', 'tiles', 'carbon_crust');

const MAP = [
  { n: 0, src: 'carbon_crust_v4.png', flop: false },
  { n: 1, src: 'carbon_crust_se_v1.png', flop: false },
  { n: 2, src: 'carbon_crust_se_v2.png', flop: false },
  { n: 3, src: 'carbon_crust_se_v3.png', flop: false },
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
    await writeWebp(buf, null, null, path.join(DST, `carbon_crust_${n}.webp`));
    for (const m of MIPS) {
      await writeWebp(buf, m.w, m.h, path.join(DST, `carbon_crust_${n}${m.suffix}.webp`));
      await writePng(buf, m.w, m.h, path.join(DST, `carbon_crust_${n}${m.suffix}.png`));
    }
    console.log(`[done] carbon_crust_${n} <- ${src}${flop ? ' (flop L<->R)' : ' (NO flop)'}`);
  }
  console.log('integration complete');
})();
