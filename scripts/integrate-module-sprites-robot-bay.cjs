/**
 * Integrate chosen robot-bay module candidate PNGs into src/assets/modules/<id>/.
 *
 * Reproduces the existing module asset convention 1:1 (matches
 * scripts/integrate-module-sprites.cjs / scripts/finalize-module-webp.ts):
 *   <id>_0.webp (full, native source dimension), plus mip ladder
 *   <id>_0@half.webp / @quarter.webp / @eighth.webp
 *   Q90 WebP, effort 4, smartSubsample.
 *
 * Native source dimension is preserved (no fixed canonical size); aspect ratio
 * and transparency preserved (sources are square, transparent PNGs).
 * Only the 4 webp files per dir are committed (matches wormhole_module/
 * orbital_collector/collector — webp-only).
 *
 * Usage: node scripts/integrate-module-sprites-robot-bay.cjs
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const REPO_ROOT = path.resolve(__dirname, '..');

const MIP_LEVELS = [
  { suffix: '', scale: 1 },
  { suffix: '@half', scale: 0.5 },
  { suffix: '@quarter', scale: 0.25 },
  { suffix: '@eighth', scale: 0.125 },
];

const JOBS = [
  { src: 'assets/style-test/modules/robot_bay_c1.png', id: 'robot_bay' },
  { src: 'assets/style-test/modules/robot_bay_large_c2.png', id: 'robot_bay_large' },
];

async function main() {
  for (const job of JOBS) {
    const src = path.join(REPO_ROOT, job.src);
    if (!fs.existsSync(src)) {
      console.error(`Missing source: ${src}`);
      process.exit(1);
    }
    const outDir = path.join(REPO_ROOT, 'src', 'assets', 'modules', job.id);
    fs.mkdirSync(outDir, { recursive: true });

    const meta = await sharp(src).metadata();
    const w = meta.width;
    const h = meta.height;
    console.log(`${job.id}: source ${w}x${h} alpha=${meta.hasAlpha}`);

    for (const level of MIP_LEVELS) {
      const out = path.join(outDir, `${job.id}_0${level.suffix}.webp`);
      const nw = Math.max(1, Math.round(w * level.scale));
      const nh = Math.max(1, Math.round(h * level.scale));
      await sharp(src)
        .resize(nw, nh, { fit: 'fill' })
        .webp({ quality: 90, effort: 4, smartSubsample: true })
        .toFile(out);
      console.log(`  ${path.relative(REPO_ROOT, out)} (${nw}x${nh})`);
    }
  }
  console.log('Done.');
}

main().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});
