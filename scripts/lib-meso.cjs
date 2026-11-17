/**
 * THE THIRD METRIC: MESO CONTRAST -- light/dark modulation at the scale of
 * stones and hollows, the band that makes a tile read as relief.
 *
 * micro4 sits BELOW this band (neighbour pixels on a 4x mip) and the luma ramp
 * sits ABOVE it. Between them nothing was measured, and that gap is exactly
 * where "flach" lives: the shipped slot 0 (micro4 15.5) and the flux slot 0
 * (micro4 20.8) differ by 35 % in micro4 and got the SAME verdict from Rudi.
 *
 * DEFINITION
 *   bandpass = blur(L, rIn) - blur(L, rOut), both box blurs over opaque pixels
 *   only, so the diamond's outside cannot bleed in. meso = sd of that bandpass
 *   over the opaque interior, divided by the tile's own p70 and x100, because
 *   contrast scales with level exactly as micro4 does and an absolute number is
 *   not comparable between a p141 and a p90 tile.
 *
 * WHY IT CANNOT BE FAKED BY AN UNSHARP
 *   An unsharp with radius r adds energy at scales BELOW r. With rIn >= 6 the
 *   meso band starts above the radius any sharpening filter usefully operates
 *   at, so the filter that lifts micro4 leaves meso where it was. That is the
 *   whole point: a metric you can satisfy with a filter is not an acceptance
 *   criterion.
 */
const S = require('./lib-tile-metrics.cjs');
const G = require('./lib-grain.cjs');
const L709 = S.L709;

function meso(data, ch, w, h, rIn, rOut) {
  rIn = rIn || 6; rOut = rOut || 32;
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    L[p] = L709(data[p * ch], data[p * ch + 1], data[p * ch + 2]);
    A[p] = data[p * ch + 3] >= 250 ? 1 : 0;
  }
  const bi = G.blurOpaque(L, A, w, h, rIn);
  const bo = G.blurOpaque(L, A, w, h, rOut);
  // keep well inside the diamond so the feathered rim cannot contribute
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  let s = 0, q = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x; if (!A[p]) continue;
    const u = Math.abs(x - cx) / (w / 2) + Math.abs(y - cy) / (h / 2);
    if ((1 - u) * (w / 4) < rOut + 4) continue;
    const v = bi[p] - bo[p];
    s += v; q += v * v; n++;
  }
  if (n < 100) return { sd: NaN, n };
  const m = s / n;
  return { sd: Math.sqrt(Math.max(0, q / n - m * m)), n };
}
/** level-free form: sd of the meso band per 100 units of ground level */
function mesoNorm(data, ch, w, h, p70, rIn, rOut) {
  const r = meso(data, ch, w, h, rIn, rOut);
  return p70 > 1e-6 ? 100 * r.sd / p70 : NaN;
}
module.exports = { meso, mesoNorm };
