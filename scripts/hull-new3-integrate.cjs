/**
 * HULL RUNDE 3 — INTEGRATION (composite, composite_platform_space, glass_carbon).
 *
 * Legt je Huelle 4 Varianten + 4 Lit-Fassungen nach src/assets/hulls/ ab,
 * jeweils mit @half/@quarter/@eighth — **NUR .webp**.
 * Die PNG-Mips der aelteren Ordner sind bekannte Altlast (889 verwaiste PNGs)
 * und werden hier bewusst NICHT fortgeschrieben.
 *
 * Quellen:
 *   v0        assets/hulls/<t>/<t>_0.png                    (abgenommene Basis)
 *   v1..v3    assets/style-test/hull-variants/<t>_<n>.png    (hull-variants-prod)
 *   lit v0..3 assets/lit-batch/<t>_<n>_lit.png               (generate-lit-variant)
 *
 * Ziele (Ordnername = Glob-Schluessel in spriteCache.ts, Lit-Ordner = <t>_lit):
 *   src/assets/hulls/<t>/<t>_<n>[@mip].webp
 *   src/assets/hulls/<t>_lit/<t>_lit_<n>[@mip].webp
 *
 * WebP: quality 90, effort 4, smartSubsample (wie finalize-module-webp).
 * KEIN cap sync, KEIN build, KEIN git.
 *
 * Usage: node scripts/hull-new3-integrate.cjs [typ ...]
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.resolve(__dirname, '..');
const STAGE_V = path.join(ROOT, 'assets', 'style-test', 'hull-variants');
const STAGE_LIT = path.join(ROOT, 'assets', 'lit-batch');
const BASES = path.join(ROOT, 'assets', 'hulls');
const OUT_ROOT = path.join(ROOT, 'src', 'assets', 'hulls');

const TYPES = ['composite', 'composite_platform_space', 'glass_carbon'];
const MIPS = [
  { suffix: '', scale: 1 },
  { suffix: '@half', scale: 0.5 },
  { suffix: '@quarter', scale: 0.25 },
  { suffix: '@eighth', scale: 0.125 },
];

const WEBP = { quality: 90, effort: 4, smartSubsample: true };

async function write(srcFile, outDir, baseName) {
  if (!fs.existsSync(srcFile)) throw new Error(`Missing source: ${srcFile}`);
  fs.mkdirSync(outDir, { recursive: true });
  const meta = await sharp(srcFile).metadata();
  const w = meta.width, h = meta.height;
  if (w !== 512 || h !== 512) throw new Error(`${srcFile}: ${w}x${h}, erwartet 512x512`);
  const written = [];
  for (const m of MIPS) {
    const out = path.join(outDir, `${baseName}${m.suffix}.webp`);
    await sharp(srcFile)
      .resize(Math.round(w * m.scale), Math.round(h * m.scale), { fit: 'fill' })
      .ensureAlpha()
      .webp(WEBP)
      .toFile(out);
    written.push(path.basename(out));
  }
  return written;
}

(async () => {
  const filter = process.argv.slice(2).map((s) => s.toLowerCase());
  const types = filter.length ? TYPES.filter((t) => filter.includes(t)) : TYPES;
  for (const t of types) {
    for (let n = 0; n <= 3; n++) {
      const src = n === 0
        ? path.join(BASES, t, `${t}_0.png`)
        : path.join(STAGE_V, `${t}_${n}.png`);
      const files = await write(src, path.join(OUT_ROOT, t), `${t}_${n}`);
      console.log(`[ok] ${t}/${files.join(', ')}`);
    }
    for (let n = 0; n <= 3; n++) {
      const src = path.join(STAGE_LIT, `${t}_${n}_lit.png`);
      const files = await write(src, path.join(OUT_ROOT, `${t}_lit`), `${t}_lit_${n}`);
      console.log(`[ok] ${t}_lit/${files.join(', ')}`);
    }
  }
  for (const t of types) {
    for (const dir of [t, `${t}_lit`]) {
      const p = path.join(OUT_ROOT, dir);
      const all = fs.existsSync(p) ? fs.readdirSync(p) : [];
      const png = all.filter((f) => f.endsWith('.png'));
      console.log(`[count] ${dir}: ${all.length} Dateien (${png.length} png — Soll 0)`);
    }
  }
  console.log('done.');
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
