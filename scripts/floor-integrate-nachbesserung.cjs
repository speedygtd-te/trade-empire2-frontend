/**
 * SCOPED INTEGRATION (Nachbesserung): replace ONLY floor_1..3 for
 * airtight + reinforced in src/assets/hull_floors/<typ>/.
 * floor_0 (hero) and all other types are NOT touched.
 *
 * Per variant, matching the existing bestand file-set exactly:
 *   <typ>_floor_<n>.webp              512x256  webp alpha   (full res: webp only)
 *   <typ>_floor_<n>@half.webp/.png    256x128  webp + png
 *   <typ>_floor_<n>@quarter.webp/.png 128x64   webp + png
 *   <typ>_floor_<n>@eighth.webp/.png  64x32    webp + png
 *
 * Source: assets/style-test/variants-prod/<typ>_floor_<n>.png (512x256 diamond+alpha)
 *
 * NO writes outside the two type folders. NO cap sync. NO git.
 *
 * Usage: node scripts/floor-integrate-nachbesserung.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const VARIANTS = path.join(ROOT, 'assets', 'style-test', 'variants-prod');
const DEST = path.join(ROOT, 'src', 'assets', 'hull_floors');

const TYPES = ['airtight', 'reinforced'];
const MIPS = [
  { suffix: '@half', w: 256, h: 128 },
  { suffix: '@quarter', w: 128, h: 64 },
  { suffix: '@eighth', w: 64, h: 32 },
];

async function writeVariant(typ, n, srcBuf) {
  const dir = path.join(DEST, typ);
  if (!fs.existsSync(dir)) throw new Error('missing dest dir ' + dir);
  const base = `${typ}_floor_${n}`;
  const full = await sharp(srcBuf).resize(512, 256, { fit: 'fill' }).ensureAlpha().png().toBuffer();
  fs.writeFileSync(path.join(dir, `${base}.webp`), await sharp(full).webp({ quality: 90, alphaQuality: 100 }).toBuffer());
  for (const m of MIPS) {
    const mip = await sharp(full).resize(m.w, m.h, { fit: 'fill' }).ensureAlpha().png().toBuffer();
    fs.writeFileSync(path.join(dir, `${base}${m.suffix}.webp`), await sharp(mip).webp({ quality: 90, alphaQuality: 100 }).toBuffer());
    fs.writeFileSync(path.join(dir, `${base}${m.suffix}.png`), mip);
  }
  console.log(`[ok] ${typ}/${base} (.webp + 3 mips webp/png)`);
}

(async () => {
  for (const typ of TYPES) {
    for (let n = 1; n <= 3; n++) {
      const vPath = path.join(VARIANTS, `${typ}_floor_${n}.png`);
      if (!fs.existsSync(vPath)) throw new Error('missing variant ' + vPath);
      await writeVariant(typ, n, fs.readFileSync(vPath));
    }
  }
  console.log('scoped integration done (floor_0 + other types untouched)');
})();
