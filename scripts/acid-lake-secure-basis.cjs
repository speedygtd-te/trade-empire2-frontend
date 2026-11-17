/**
 * STEP 0: secure the APPROVED acid_lake basis.
 *
 * Rudi picked acid_lake_3 (of the prior 4 variants) as the best. That tile —
 * src/assets/tiles/acid_lake/acid_lake_3.webp (512x256 diamond-masked) — becomes
 * BOTH the i2i init source AND the final slot 0. We copy/convert it to PNG into
 * the style-test workspace so it cannot be lost when the slots get overwritten.
 *
 * Output: assets/style-test/tiles/acid_lake_basis.png (512x256 RGBA)
 *
 * Usage: node scripts/acid-lake-secure-basis.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'src', 'assets', 'tiles', 'acid_lake', 'acid_lake_3.webp');
const OUTDIR = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');
const OUT = path.join(OUTDIR, 'acid_lake_basis.png');

(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const buf = fs.readFileSync(SRC);
  const meta = await sharp(buf).metadata();
  if (meta.width !== 512 || meta.height !== 256) {
    throw new Error(`basis source not 512x256: ${meta.width}x${meta.height}`);
  }
  await sharp(buf).ensureAlpha().png().toFile(OUT);
  const m2 = await sharp(OUT).metadata();
  console.log(`[secured] ${OUT} ${m2.width}x${m2.height} ${m2.format} alpha=${m2.hasAlpha}`);
})();
