/**
 * Integrate the 8 approved hull-batch sprites into src/assets/hulls/<typ>/.
 *
 * Source: assets/style-test/hull-batch/hull_<typ>.png (512x512 RGBA)
 * Output per type (matches existing bestand exactly):
 *   <typ>_0.webp                 512x512  webp only (full res has no png)
 *   <typ>_0@half.webp/.png       256x256
 *   <typ>_0@quarter.webp/.png    128x128
 *   <typ>_0@eighth.webp/.png     64x64
 *
 * WebP: quality 90, alphaQuality 100 (floor-integrate.cjs pattern).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const REPO_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(REPO_ROOT, 'assets', 'style-test', 'hull-batch');
const OUT_ROOT = path.join(REPO_ROOT, 'src', 'assets', 'hulls');

const TYPES = [
  'standard',
  'starter',
  'reinforced',
  'airtight',
  'pressurized',
  'platform_outdoor',
  'platform_space',
  'platform_underwater',
];

const MIPS = [
  { suffix: '@half', w: 256, h: 256 },
  { suffix: '@quarter', w: 128, h: 128 },
  { suffix: '@eighth', w: 64, h: 64 },
];

async function integrate(typ) {
  const src = path.join(SRC_DIR, `hull_${typ}.png`);
  if (!fs.existsSync(src)) throw new Error(`Missing source: ${src}`);
  const dir = path.join(OUT_ROOT, typ);
  fs.mkdirSync(dir, { recursive: true });
  const base = `${typ}_0`;
  const srcBuf = fs.readFileSync(src);

  // full res 512x512 -> webp only
  const full = await sharp(srcBuf).resize(512, 512, { fit: 'fill' }).ensureAlpha().png().toBuffer();
  fs.writeFileSync(
    path.join(dir, `${base}.webp`),
    await sharp(full).webp({ quality: 90, alphaQuality: 100 }).toBuffer()
  );

  for (const m of MIPS) {
    const mip = await sharp(full).resize(m.w, m.h, { fit: 'fill' }).ensureAlpha().png().toBuffer();
    fs.writeFileSync(
      path.join(dir, `${base}${m.suffix}.webp`),
      await sharp(mip).webp({ quality: 90, alphaQuality: 100 }).toBuffer()
    );
    fs.writeFileSync(path.join(dir, `${base}${m.suffix}.png`), mip);
  }
  console.log(`[ok] ${typ}/${base} (.webp + 3 mips webp/png)`);
}

(async () => {
  // optional CLI filter: only integrate the named types (e.g. airtight reinforced)
  const filter = process.argv.slice(2).map((s) => s.toLowerCase());
  const types = filter.length ? TYPES.filter((t) => filter.includes(t)) : TYPES;
  for (const t of types) await integrate(t);
  console.log('done.');
})().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});
