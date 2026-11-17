/**
 * THE GRAIN metric: the autocorrelation half-length of the high-pass field, in
 * pixels. SMALL = fine, evenly spread detail. LARGE = big restless elements.
 *
 * This is the number that reproduces Rudi's reading of the four rocky_outcrop
 * slots, which micro4 alone contradicts:
 *   slot 1  micro4 19.9  grain 2.96   strong AND fine   -> the hero
 *   slot 3  micro4 20.8  grain 4.65   strong but chunky -> "sehr unruhig"
 *   slot 0  micro4 15.5  grain 3.44   weak              -> "sehr flach"
 * micro4 says slot 3 is the most textured tile in the set; grain says why that
 * does not make it the calmest. The two are orthogonal and both are needed.
 */
const S = require('./lib-tile-metrics.cjs');
const L709 = S.L709;

/** box blur over opaque pixels only, radius R, separable */
function blurOpaque(L, A, w, h, R) {
  const tmp = new Float32Array(w * h), tn = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) { let s = 0, n = 0;
    for (let x = 0; x < w + R; x++) {
      if (x < w && A[y * w + x]) { s += L[y * w + x]; n++; }
      const xo = x - R;
      if (xo - R - 1 >= 0 && A[y * w + xo - R - 1]) { s -= L[y * w + xo - R - 1]; n--; }
      if (xo >= 0 && xo < w) { tmp[y * w + xo] = s; tn[y * w + xo] = n; }
    } }
  for (let x = 0; x < w; x++) { let s = 0, n = 0;
    for (let y = 0; y < h + R; y++) {
      if (y < h) { s += tmp[y * w + x]; n += tn[y * w + x]; }
      const yo = y - R;
      if (yo - R - 1 >= 0) { s -= tmp[(yo - R - 1) * w + x]; n -= tn[(yo - R - 1) * w + x]; }
      if (yo >= 0 && yo < h) out[yo * w + x] = n > 0 ? s / n : 0;
    } }
  return out;
}

function grain(data, ch, w, h, R, M) {
  R = R || 12; M = M || 48;
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    L[p] = L709(data[p * ch], data[p * ch + 1], data[p * ch + 2]);
    A[p] = data[p * ch + 3] >= 250 ? 1 : 0;
  }
  const bl = blurOpaque(L, A, w, h, R);
  const HP = new Float32Array(w * h);
  let s0 = 0, n0 = 0;
  for (let p = 0; p < w * h; p++) { if (!A[p]) continue; HP[p] = L[p] - bl[p]; s0 += HP[p]; n0++; }
  const mu = s0 / n0;
  const ac = new Float64Array(M + 1);
  for (let lag = 0; lag <= M; lag++) {
    let num = 0, da = 0, db = 0;
    for (let y = 8; y < h - 8; y++) for (let x = 8; x < w - 8 - lag; x++) {
      const p = y * w + x, q = p + lag;
      if (!A[p] || !A[q]) continue;
      const a = HP[p] - mu, b = HP[q] - mu;
      num += a * b; da += a * a; db += b * b;
    }
    ac[lag] = (da > 0 && db > 0) ? num / Math.sqrt(da * db) : 0;
  }
  let half = M;
  for (let lag = 1; lag <= M; lag++) if (ac[lag] < 0.5) { half = lag - 1 + (ac[lag - 1] - 0.5) / (ac[lag - 1] - ac[lag]); break; }
  return { half, ac };
}
module.exports = { grain, blurOpaque };
