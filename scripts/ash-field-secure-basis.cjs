/**
 * STEP 0: secure the APPROVED ash_field basis.
 *
 * Rudi picked ash_field_dark (near-black ash with glowing orange lava cracks)
 * as the best. That tile already lives in the style-test workspace:
 *   assets/style-test/tiles/ash_field_dark.png (512x256 diamond-masked RGBA).
 * It becomes BOTH the i2i init source AND the final slot 0. We copy/convert it
 * to ash_field_basis.png so it cannot be lost when the slots get overwritten.
 *
 * Output: assets/style-test/tiles/ash_field_basis.png (512x256 RGBA)
 *
 * Usage: node scripts/ash-field-secure-basis.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DIR = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');
const SRC = path.join(DIR, 'ash_field_dark.png');
const OUT = path.join(DIR, 'ash_field_basis.png');

(async () => {
  const buf = fs.readFileSync(SRC);
  const meta = await sharp(buf).metadata();
  if (meta.width !== 512 || meta.height !== 256) {
    throw new Error(`basis source not 512x256: ${meta.width}x${meta.height}`);
  }
  await sharp(buf).ensureAlpha().png().toFile(OUT);
  const m2 = await sharp(OUT).metadata();
  console.log(`[secured] ${OUT} ${m2.width}x${m2.height} ${m2.format} alpha=${m2.hasAlpha}`);
})();
