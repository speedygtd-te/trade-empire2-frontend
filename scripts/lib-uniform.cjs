/**
 * THE SECOND MISSING METRIC: how EVENLY the micro contrast is spread.
 *
 * micro4 / micro8 measure the STRENGTH of neighbour contrast averaged over the
 * whole tile. They say nothing about its DISTRIBUTION. rocky_outcrop_3 has the
 * highest micro4 in the set (20.8) and is still the worse hero, because its
 * structure sits in clumps; slot 1 (19.9) spreads it. Rudi: "3 ist sehr
 * unruhig, 1 ist eher gleichmaessiger verteilt".
 *
 * DEFINITION
 *   Build the neighbour-|dL| field at full resolution (the same quantity
 *   microContrast averages, just not yet averaged), then average it inside
 *   cells of a CELLS x CELLS grid over the tile, keeping only cells that are
 *   at least 75 % opaque. Over those cell values report
 *     uCV  = sd / mean            scale-free, so it compares across biomes
 *     uP90 = p90 / p50            the heavy-tail form of the same thing
 *   Low = evenly spread. High = the texture is in clumps.
 *
 * Both are ratios, so a grade cannot move them: multiplying every pixel by a
 * constant multiplies mean and sd alike. That is the property that makes them
 * safe to use as an acceptance criterion on a tile that is about to be graded.
 */
const S = require('./lib-tile-metrics.cjs');
const L709 = S.L709;

/** neighbour-|dL| per pixel (right and down), NaN where either side is not opaque */
function microField(data, ch, w, h) {
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    L[p] = L709(data[p * ch], data[p * ch + 1], data[p * ch + 2]);
    A[p] = data[p * ch + 3];
  }
  const F = new Float32Array(w * h), N = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) {
    const p = y * w + x; if (A[p] < 200 || A[p + 1] < 200) continue;
    F[p] += Math.abs(L[p] - L[p + 1]); N[p]++;
  }
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x; if (A[p] < 200 || A[p + w] < 200) continue;
    F[p] += Math.abs(L[p] - L[p + w]); N[p]++;
  }
  return { F, N, A };
}

function uniformity(data, ch, w, h, CELLS) {
  CELLS = CELLS || 8;
  const { F, N, A } = microField(data, ch, w, h);
  const cw = w / CELLS, chh = h / CELLS;
  const cs = new Float64Array(CELLS * CELLS), cn = new Float64Array(CELLS * CELLS), ca = new Float64Array(CELLS * CELLS);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    let bx = Math.floor(x / cw); if (bx >= CELLS) bx = CELLS - 1;
    let by = Math.floor(y / chh); if (by >= CELLS) by = CELLS - 1;
    const k = by * CELLS + bx;
    if (A[p] >= 200) ca[k]++;
    if (N[p]) { cs[k] += F[p] / N[p]; cn[k]++; }
  }
  const v = [];
  for (let k = 0; k < CELLS * CELLS; k++) {
    if (ca[k] < cw * chh * 0.75) continue;      // only cells well inside the diamond
    if (cn[k] < 16) continue;
    v.push(cs[k] / cn[k]);
  }
  if (v.length < 6) return { uCV: NaN, uP90: NaN, cells: v.length, mean: NaN };
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
  const s = v.slice().sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { uCV: sd / m, uP90: q(0.90) / q(0.50), cells: v.length, mean: m,
    min: s[0], max: s[s.length - 1], ratio: s[s.length - 1] / s[0] };
}

module.exports = { microField, uniformity };
