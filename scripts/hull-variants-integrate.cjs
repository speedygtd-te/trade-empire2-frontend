/**
 * HULL VARIANTS — INTEGRATION (Schritt 3).
 *
 * Integriert die 3 Varianten je Typ aus dem Staging in src/assets/hulls/<typ>/.
 * Variante 0 wird NICHT angefasst.
 *
 * Source: assets/style-test/hull-variants/<typ>_<n>.png  (512x512 RGBA)
 * Output je (typ, n in 1..3) — exakt wie der Bestand von <typ>_0:
 *   <typ>_<n>.webp                512x512  (full res: webp only, kein png)
 *   <typ>_<n>@half.webp/.png      256x256
 *   <typ>_<n>@quarter.webp/.png   128x128
 *   <typ>_<n>@eighth.webp/.png    64x64
 * (png-Mips sind gitignored, lokal aber Teil des Bestands — daher mitschreiben.)
 *
 * WebP: quality 90, alphaQuality 100 (wie hull-batch-integrate.cjs).
 * KEIN cap sync, KEIN build, KEIN git.
 *
 * Usage:
 *   node scripts/hull-variants-integrate.cjs           # alle Typen
 *   node scripts/hull-variants-integrate.cjs airtight  # nur ein Typ
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'style-test', 'hull-variants');
const OUT_ROOT = path.join(ROOT, 'src', 'assets', 'hulls');

const TYPES = ['standard', 'starter', 'reinforced', 'airtight', 'pressurized',
  'platform_outdoor', 'platform_space', 'platform_underwater'];
const MIPS = [
  { suffix: '@half', w: 256, h: 256 },
  { suffix: '@quarter', w: 128, h: 128 },
  { suffix: '@eighth', w: 64, h: 64 },
];

async function integrateVariant(typ, n) {
  const src = path.join(SRC, `${typ}_${n}.png`);
  if (!fs.existsSync(src)) throw new Error(`Missing source: ${src}`);
  const dir = path.join(OUT_ROOT, typ);
  fs.mkdirSync(dir, { recursive: true });
  const base = `${typ}_${n}`;
  const srcBuf = fs.readFileSync(src);

  const full = await sharp(srcBuf).resize(512, 512, { fit: 'fill' }).ensureAlpha().png().toBuffer();
  fs.writeFileSync(path.join(dir, `${base}.webp`),
    await sharp(full).webp({ quality: 90, alphaQuality: 100 }).toBuffer());

  for (const m of MIPS) {
    const mip = await sharp(full).resize(m.w, m.h, { fit: 'fill' }).ensureAlpha().png().toBuffer();
    fs.writeFileSync(path.join(dir, `${base}${m.suffix}.webp`),
      await sharp(mip).webp({ quality: 90, alphaQuality: 100 }).toBuffer());
    fs.writeFileSync(path.join(dir, `${base}${m.suffix}.png`), mip);
  }
  console.log(`[ok] ${typ}/${base} (.webp + 3 mips webp/png)`);
}

(async () => {
  const filter = process.argv.slice(2).map((s) => s.toLowerCase());
  const types = filter.length ? TYPES.filter((t) => filter.includes(t)) : TYPES;
  for (const t of types) for (let n = 1; n <= 3; n++) await integrateVariant(t, n);
  console.log('done.');
})().catch((e) => { console.error('Failed:', e); process.exit(1); });
