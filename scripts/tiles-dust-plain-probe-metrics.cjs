/**
 * DUST_PLAIN -- metric calibration. The brief hands me four rows of numbers.
 * mean / p70 / B/R / G/R / sat / blowout / sd reproduce exactly with the
 * corpus definitions; tiltX/tiltY and the rim seam do not. Rather than report
 * in a different unit than the brief, find the definition that reproduces it.
 *
 * TARGETS (from the brief)
 *   tiltX  -0.9  -2.3  -2.7 -24.6
 *   tiltY -22.1  -8.1 -31.6 -23.7
 *   rim    -7.4  -3.9  -7.7 -13.1
 *
 * Usage: node scripts/tiles-dust-plain-probe-metrics.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const LB = require('./tiles-dust-plain-lib.cjs');
sharp.cache(false);

const TILES = path.join(__dirname, '..', 'src', 'assets', 'tiles', 'dust_plain');
const { f1, f2, L709 } = LB;

const T_TX = [-0.9, -2.3, -2.7, -24.6];
const T_TY = [-22.1, -8.1, -31.6, -23.7];
const T_RIM = [-7.4, -3.9, -7.7, -13.1];

async function px(file) {
  const r = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const out = [];
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (r.data[i + 3] < 250) continue;
    const nx = (x - cx) / cx, ny = (y - cy) / cy;
    const u = Math.abs(nx) + Math.abs(ny);
    out.push({ nx, ny, u, dpx: (1 - u) * (w / 4), L: L709(r.data[i], r.data[i + 1], r.data[i + 2]) });
  }
  return out;
}
const err = (got, want) => Math.sqrt(got.reduce((a, g, i) => a + (g - want[i]) * (g - want[i]), 0) / got.length);

(async () => {
  const S = [];
  for (let n = 0; n < 4; n++) S.push(await px(path.join(TILES, 'dust_plain_' + n + '.webp')));

  // ---------------------------------------------------------------- tilt ---
  console.log('TILT -- candidate definitions vs the brief\n');
  const cand = {
    'half-diff L-R / T-B (corpus statsRaw)': (p, ax) => {
      let a = 0, na = 0, b = 0, nb = 0;
      for (const q of p) { const v = ax === 'x' ? q.nx : q.ny; if (v < 0) { a += q.L; na++; } else { b += q.L; nb++; } }
      return a / na - b / nb;
    },
    'LSQ slope on n (per half-width), SIGNED +': (p, ax) => {
      let sn = 0, sd = 0, m = 0;
      for (const q of p) m += q.L; m /= p.length;
      for (const q of p) { const v = ax === 'x' ? q.nx : q.ny; sn += (q.L - m) * v; sd += v * v; }
      return sn / sd;
    },
    'LSQ slope, span peak-to-peak (x2)': (p, ax) => {
      let sn = 0, sd = 0, m = 0;
      for (const q of p) m += q.L; m /= p.length;
      for (const q of p) { const v = ax === 'x' ? q.nx : q.ny; sn += (q.L - m) * v; sd += v * v; }
      return 2 * sn / sd;
    },
  };
  for (const name of Object.keys(cand)) {
    const gx = S.map((p) => cand[name](p, 'x')), gy = S.map((p) => cand[name](p, 'y'));
    console.log('  ' + name);
    console.log('     tiltX ' + gx.map((v) => f1(v).padStart(7)).join('') + '   rms vs brief ' + f2(err(gx, T_TX)) +
      '   (negated ' + f2(err(gx.map((v) => -v), T_TX)) + ')');
    console.log('     tiltY ' + gy.map((v) => f1(v).padStart(7)).join('') + '   rms vs brief ' + f2(err(gy, T_TY)) +
      '   (negated ' + f2(err(gy.map((v) => -v), T_TY)) + ')');
  }

  // ----------------------------------------------------------------- rim ---
  console.log('\nRIM -- scan of band definitions, rim band mean minus interior band mean');
  console.log('   (dpx = pixels inward from the diamond edge, 0..128)\n');
  const bandMean = (p, lo, hi) => {
    let s = 0, n = 0;
    for (const q of p) if (q.dpx >= lo && q.dpx < hi) { s += q.L; n++; }
    return n ? s / n : NaN;
  };
  let best = null;
  const RIMS = [[0, 4], [0, 8], [0, 12], [0, 16], [0, 24], [0, 32], [1, 4], [1, 8], [2, 10], [4, 16], [0, 20]];
  const INTS = [[10, 24], [16, 48], [24, 64], [32, 128], [40, 128], [48, 128], [20, 60], [64, 128]];
  for (const R of RIMS) for (const I of INTS) {
    if (R[1] > I[0]) continue;
    const got = S.map((p) => bandMean(p, R[0], R[1]) - bandMean(p, I[0], I[1]));
    const e = err(got, T_RIM);
    if (!best || e < best.e) best = { e, R, I, got };
  }
  for (const R of RIMS) for (const I of INTS) {
    if (R[1] > I[0]) continue;
    const got = S.map((p) => bandMean(p, R[0], R[1]) - bandMean(p, I[0], I[1]));
    console.log('   rim[' + R[0] + ',' + R[1] + ') - int[' + I[0] + ',' + I[1] + ')  ->  ' +
      got.map((v) => f1(v).padStart(7)).join('') + '   rms ' + f2(err(got, T_RIM)));
  }
  console.log('\n   BEST: rim[' + best.R[0] + ',' + best.R[1] + ') - int[' + best.I[0] + ',' + best.I[1] + ')  rms ' + f2(best.e) +
    '   -> ' + best.got.map((v) => f1(v).padStart(7)).join(''));

  // a normalised alternative: linear fit of L against the edge distance in the
  // outer third, expressed as the drop over that third
  console.log('\n   alternative -- drop over the outer third: mean(dpx<42) - mean(dpx>=42)');
  const alt = S.map((p) => bandMean(p, 0, 42) - bandMean(p, 42, 1e9));
  console.log('      ' + alt.map((v) => f1(v).padStart(7)).join('') + '   rms ' + f2(err(alt, T_RIM)));
})();
