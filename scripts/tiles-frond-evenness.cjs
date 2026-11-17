/**
 * TILE EVENNESS CHECK -- rim band vs interior share of "feature" pixels.
 *
 * WHY THIS EXISTS
 * A tile whose features (kelp fronds, coral heads, stones ...) are bunched in
 * the middle and thin out towards the diamond rim looks fine on its own and
 * terrible once it is laid out: the empty rims of neighbouring tiles meet and
 * the tiling reads as a regular DOT PATTERN. A tile whose features reach the rim
 * with the same density as the middle hides its own seams. So the acceptance
 * number for a derived slot is not "does it look nice" but "is the feature share
 * in the outer band the same as in the middle".
 *
 * BAND
 *   normalised diamond distance  d = |x/W - 0.5| * 2 + |y/H - 0.5| * 2
 *   d > 0.82  -> RIM band (outermost ~18% of the diamond)
 *   d <= 0.82 -> INTERIOR
 * Fully transparent pixels are skipped, so only real tile area is counted.
 *
 * FEATURE PIXEL -- two modes
 *   --thr=N   (default 70)  Rec709 luma > N. Absolute, so it is comparable
 *             across tiles ONLY while they share a brightness level. These are
 *             the numbers kelp_forest's hero was picked on (slot0 40.7/39.3,
 *             slot1 40.2/49.5, slot2 31.1/33.0, slot3 34.8/44.0 -- slot2 chosen).
 *   --median  threshold = the tile's OWN interior median luma. Scale invariant,
 *             so it still works after a grade has moved the level. Use this to
 *             re-check integrated tiles.
 *
 * ACCEPTANCE: |rim% - interior%| < 3 percentage points.
 *
 * Usage:
 *   node scripts/tiles-frond-evenness.cjs kelp_forest
 *   node scripts/tiles-frond-evenness.cjs kelp_forest --median
 *   node scripts/tiles-frond-evenness.cjs kelp_forest --stage=kontext   (style-test _kN.png)
 *   node scripts/tiles-frond-evenness.cjs reef island --thr=60
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const RIM_D = 0.82;
const PASS_PP = 3.0;
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

async function measure(file, thrArg, useMedian) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: ch } = info;
  let thr = thrArg;
  if (useMedian) {
    const l = [];
    for (let i = 0; i < data.length; i += ch) if (data[i + 3] >= 8) l.push(L709(data[i], data[i + 1], data[i + 2]));
    l.sort((a, b) => a - b);
    thr = l[Math.floor(l.length / 2)];
  }
  let rimHit = 0, rimN = 0, inHit = 0, inN = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * ch;
      if (data[i + 3] < 8) continue;
      const d = Math.abs(x / W - 0.5) * 2 + Math.abs(y / H - 0.5) * 2;
      const hit = L709(data[i], data[i + 1], data[i + 2]) > thr;
      if (d > RIM_D) { rimN++; if (hit) rimHit++; } else { inN++; if (hit) inHit++; }
    }
  }
  const rim = (rimHit / rimN) * 100, inner = (inHit / inN) * 100;
  return { thr, rim, inner, delta: rim - inner };
}

(async () => {
  const args = process.argv.slice(2);
  const useMedian = args.includes('--median');
  const thrA = args.find((a) => a.startsWith('--thr='));
  const thr = thrA ? Number(thrA.slice(6)) : 70;
  const stageA = args.find((a) => a.startsWith('--stage='));
  const stage = stageA ? stageA.slice(8) : 'final';
  const biomes = args.filter((a) => !a.startsWith('--'));
  if (!biomes.length) {
    console.error('usage: node scripts/tiles-frond-evenness.cjs <biome...> [--thr=N|--median] [--stage=kontext]');
    process.exit(1);
  }
  console.log(
    `evenness  band d>${RIM_D}  feature = luma > ` +
    (useMedian ? "each tile's own interior median" : thr) + `  pass |delta| < ${PASS_PP}pp`
  );
  let worst = 0;
  for (const b of biomes) {
    for (let n = 0; n < 4; n++) {
      const file = stage === 'kontext'
        ? path.join(ST, `${b}_k${n}.png`)
        : path.join(TILES, b, `${b}_${n}.webp`);
      if (!fs.existsSync(file)) { console.log(`  ${b}_${n}  MISSING ${path.relative(ROOT, file)}`); continue; }
      const m = await measure(file, thr, useMedian);
      const ok = Math.abs(m.delta) < PASS_PP;
      worst = Math.max(worst, Math.abs(m.delta));
      console.log(
        `  ${b}_${n}  thr ${m.thr.toFixed(0).padStart(3)}  rim ${m.rim.toFixed(1).padStart(5)}%  ` +
        `interior ${m.inner.toFixed(1).padStart(5)}%  delta ${(m.delta >= 0 ? '+' : '') + m.delta.toFixed(1)}pp  ` +
        (ok ? 'ok' : '<-- UNEVEN')
      );
    }
  }
  console.log(`worst |delta| ${worst.toFixed(1)}pp`);
})();
