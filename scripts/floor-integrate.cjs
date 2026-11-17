/**
 * INTEGRATION: build the exact bestand file-set for each hull-floor type folder
 * under src/assets/hull_floors/<typ>/ from:
 *   floor_0 = the approved type hero  (assets/style-test/heroes-edit/floor_hero_<typ>.png)
 *   floor_1..3 = the prod variants    (assets/style-test/variants-prod/<typ>_floor_<n>.png)
 *
 * Per variant, matching the measured bestand exactly:
 *   <typ>_floor_<n>.webp            512x256  webp alpha
 *   <typ>_floor_<n>@half.webp/.png  256x128
 *   <typ>_floor_<n>@quarter.webp/.png 128x64
 *   <typ>_floor_<n>@eighth.webp/.png  64x32
 *
 * Sources are already 512x256 diamond+alpha. We replace ALL existing files in
 * each type folder so the set stays identical (no extra/missing files).
 *
 * Usage: node scripts/floor-integrate.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const HEROES = path.join(ROOT, 'assets', 'style-test', 'heroes-edit');
const VARIANTS = path.join(ROOT, 'assets', 'style-test', 'variants-prod');
const DEST = path.join(ROOT, 'src', 'assets', 'hull_floors');

const TYPES = ['standard', 'starter', 'reinforced', 'airtight', 'pressurized', 'platform_outdoor', 'platform_space', 'platform_underwater'];
const MIPS = [
  { suffix: '@half', w: 256, h: 128 },
  { suffix: '@quarter', w: 128, h: 64 },
  { suffix: '@eighth', w: 64, h: 32 },
];

async function writeVariant(typ, n, srcBuf) {
  const dir = path.join(DEST, typ);
  fs.mkdirSync(dir, { recursive: true });
  const base = `${typ}_floor_${n}`;
  // full res 512x256 -> webp only (bestand: full res has no png)
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
    // floor_0 = hero
    const heroPath = path.join(HEROES, `floor_hero_${typ}.png`);
    if (!fs.existsSync(heroPath)) throw new Error('missing hero ' + heroPath);
    await writeVariant(typ, 0, fs.readFileSync(heroPath));
    // floor_1..3 = variants
    for (let n = 1; n <= 3; n++) {
      const vPath = path.join(VARIANTS, `${typ}_floor_${n}.png`);
      if (!fs.existsSync(vPath)) throw new Error('missing variant ' + vPath);
      await writeVariant(typ, n, fs.readFileSync(vPath));
    }
  }
  console.log('integration done');
})();
