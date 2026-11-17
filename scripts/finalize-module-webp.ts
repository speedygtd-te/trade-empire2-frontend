/**
 * Finalize a staged module sprite: assets/final/<name>_0.png ->
 * src/assets/modules/<name>/<name>_0.webp (+ @half/@quarter/@eighth.webp).
 *
 * Matches the existing module naming scheme exactly (Q90 WebP, smartSubsample).
 *
 * Usage: npx tsx scripts/finalize-module-webp.ts --asset assembler
 *
 * `--out <folder>` and `--variant <n>` are for a row-tiled `_MID` piece that
 * ships several fassungen sharing ONE sprite-key folder (e.g. DOCK_LARGE_MID's
 * three ships + empty berth): `--asset` still names the STAGED source PNG
 * (`assets/final/<asset>_0.png`), `--out` overrides the destination folder
 * (defaults to `<asset>`), and `--variant` overrides the output index
 * (defaults to 0) — so `dock_large_mid_c1_0.png` can land as
 * `dock_large_mid/dock_large_mid_1.webp`. Omitting both keeps the original
 * single-variant behaviour byte-for-byte.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const MIP_LEVELS = [
  { suffix: '', scale: 1 },
  { suffix: '@half', scale: 0.5 },
  { suffix: '@quarter', scale: 0.25 },
  { suffix: '@eighth', scale: 0.125 },
] as const;

async function main(): Promise<void> {
  const idx = process.argv.indexOf('--asset');
  const name = idx >= 0 ? process.argv[idx + 1] : '';
  if (!name) {
    console.error('--asset <name> required');
    process.exit(1);
  }
  const outIdx = process.argv.indexOf('--out');
  const outName = outIdx >= 0 ? process.argv[outIdx + 1] : name;
  const variantIdx = process.argv.indexOf('--variant');
  const variant = variantIdx >= 0 ? process.argv[variantIdx + 1] : '0';

  const src = path.join(REPO_ROOT, 'assets', 'final', `${name}_0.png`);
  if (!fs.existsSync(src)) {
    console.error(`Missing staged PNG: ${src}`);
    process.exit(1);
  }

  const outDir = path.join(REPO_ROOT, 'src', 'assets', 'modules', outName);
  fs.mkdirSync(outDir, { recursive: true });

  const meta = await sharp(src).metadata();
  const w = meta.width ?? 512;
  const h = meta.height ?? 512;

  for (const level of MIP_LEVELS) {
    const out = path.join(outDir, `${outName}_${variant}${level.suffix}.webp`);
    const nw = Math.max(1, Math.round(w * level.scale));
    const nh = Math.max(1, Math.round(h * level.scale));
    await sharp(src)
      .resize(nw, nh, { fit: 'fill' })
      .webp({ quality: 90, effort: 4, smartSubsample: true })
      .toFile(out);
    console.log(`  ${path.relative(REPO_ROOT, out)} (${nw}x${nh})`);
  }
  console.log(`${name} -> ${outName}_${variant}: webp + mips written.`);
}

main().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});
