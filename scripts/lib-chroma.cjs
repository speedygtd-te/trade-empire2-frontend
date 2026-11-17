/**
 * THE MISSING METRIC: a COLOUR gradient across the tile.
 *
 * Everything measured so far treats colour as a tile CONSTANT (B/R, G/R over
 * the whole diamond) and brightness as a FIELD (gx, gy, rampPP). Rudi's
 * "braun/blau Grenze quer durch" on rocky_outcrop_0 is a colour FIELD, and it
 * appears in none of the existing numbers -- a tile can hold its family B/R on
 * average while running brown at one end and blue at the other.
 *
 * DEFINITION, deliberately the same shape as tiltRimRaw's gx/gy so the numbers
 * read alike:
 *   the least-squares slope of the ratio B/R (and G/R) against the normalised
 *   coordinates nx, ny in [-1,1], y pointing DOWN, fitted on 16-px BLOCK MEANS
 *   rather than per pixel. Blocks, because a per-pixel ratio explodes wherever
 *   R is near zero and rocky_outcrop is 63 % shadow; a block mean of B over a
 *   block mean of R is stable and is what the eye integrates anyway.
 *   cRampPP = 2*hypot(cgx, cgy) = the peak-to-peak swing of the ratio across
 *   the tile, in ratio units. B/R 1.35 at one tip and 1.15 at the other is
 *   cRampPP 0.20.
 *
 * WHY flatten() CANNOT REMOVE IT: flatten and grade both apply a SCALAR gain
 * to all three channels at a pixel. A scalar cancels in B/R. So the luma
 * flatten leaves the colour field exactly where it was -- confirmed by
 * measurement, not assumed.
 *
 * chromaFlatten() is the counterpart: fit the two ratio fields with a
 * polynomial and divide them out, holding Rec709 luma per pixel so the level
 * and the ramp that were just solved for do not move (LESSONS 2: keep the
 * Rec709 weight of a tint at 1.0).
 */
const S = require('./lib-tile-metrics.cjs');
const D = require('./tiles-dust-plain-lib.cjs');
const L709 = S.L709;

const BLK = 16;

/** block means of R,G,B over opaque pixels -> [{nx,ny,r,g,b,n}] */
function blocks(data, ch, w, h, blk) {
  blk = blk || BLK;
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const bw = Math.ceil(w / blk), bh = Math.ceil(h / blk);
  const acc = new Float64Array(bw * bh * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (data[i + 3] < 250) continue;
    const k = (Math.floor(y / blk) * bw + Math.floor(x / blk)) * 4;
    acc[k] += data[i]; acc[k + 1] += data[i + 1]; acc[k + 2] += data[i + 2]; acc[k + 3]++;
  }
  const out = [];
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const k = (by * bw + bx) * 4, n = acc[k + 3];
    if (n < blk * blk * 0.75) continue;          // only blocks fully inside the diamond
    out.push({ nx: ((bx + 0.5) * blk - cx) / cx, ny: ((by + 0.5) * blk - cy) / cy,
      r: acc[k] / n, g: acc[k + 1] / n, b: acc[k + 2] / n, n });
  }
  return out;
}

/** weighted least-squares plane fit of v over (nx,ny) -> {c0, gx, gy} */
function planeFit(pts, v) {
  let Sw = 0, Sx = 0, Sy = 0, Sxx = 0, Syy = 0, Sxy = 0, Sv = 0, Svx = 0, Svy = 0;
  for (const p of pts) {
    const w = p.n, t = v(p);
    Sw += w; Sx += w * p.nx; Sy += w * p.ny;
    Sxx += w * p.nx * p.nx; Syy += w * p.ny * p.ny; Sxy += w * p.nx * p.ny;
    Sv += w * t; Svx += w * t * p.nx; Svy += w * t * p.ny;
  }
  const s = D.solveLinSys([[Sw, Sx, Sy], [Sx, Sxx, Sxy], [Sy, Sxy, Syy]], [Sv, Svx, Svy]);
  return { c0: s[0], gx: s[1], gy: s[2] };
}

/** the metric. cbx/cby = B/R slope, cgx/cgy = G/R slope, pp = 2*hypot */
function chromaRamp(data, ch, w, h) {
  const pts = blocks(data, ch, w, h);
  const B = planeFit(pts, (p) => p.b / p.r);
  const G = planeFit(pts, (p) => p.g / p.r);
  // residual after the plane: how much of the colour field is NOT a plane
  let rb = 0, rg = 0, n = 0;
  for (const p of pts) {
    rb += Math.pow(p.b / p.r - (B.c0 + B.gx * p.nx + B.gy * p.ny), 2);
    rg += Math.pow(p.g / p.r - (G.c0 + G.gx * p.nx + G.gy * p.ny), 2);
    n++;
  }
  // split of the B/R swing: how much runs along the tile's long axis
  return {
    cbx: B.gx, cby: B.gy, cbPP: 2 * Math.hypot(B.gx, B.gy),
    cgx: G.gx, cgy: G.gy, cgPP: 2 * Math.hypot(G.gx, G.gy),
    cbSd: Math.sqrt(rb / n), cgSd: Math.sqrt(rg / n),
    nBlocks: n,
  };
}

/**
 * Divide the fitted colour field out. Degree `deg` polynomial over (nx,ny)
 * fitted to B/R and G/R on the block means, then per pixel:
 *   R,G,B are rescaled so the LOCAL ratios become the tile's TARGET ratios,
 *   and the per-pixel Rec709 luma is held exactly. Level, ramp and micro
 *   contrast therefore survive untouched; only the hue field moves.
 */
function chromaFlatten(src, ch, w, h, deg, brT, grT) {
  deg = deg == null ? 2 : deg;
  const pts = blocks(src, ch, w, h);
  const terms = [];
  for (let a = 0; a <= deg; a++) for (let b = 0; a + b <= deg; b++) terms.push([a, b]);
  const K = terms.length;
  const basis = (nx, ny) => terms.map((t) => Math.pow(nx, t[0]) * Math.pow(ny, t[1]));
  const fit = (v) => {
    const A = Array.from({ length: K }, () => new Float64Array(K)), bv = new Float64Array(K);
    for (const p of pts) {
      const T = basis(p.nx, p.ny), t = v(p), wt = p.n;
      for (let a = 0; a < K; a++) { bv[a] += wt * T[a] * t; for (let b = 0; b < K; b++) A[a][b] += wt * T[a] * T[b]; }
    }
    return D.solveLinSys(A.map((r) => Array.from(r)), Array.from(bv));
  };
  const cB = fit((p) => p.b / p.r), cG = fit((p) => p.g / p.r);
  const at = (c, nx, ny) => { const T = basis(nx, ny); let s = 0; for (let k = 0; k < K; k++) s += c[k] * T[k]; return s; };
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const out = Buffer.from(src);
  for (let y = 0; y < h; y++) {
    const ny = (y - cy) / cy;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      if (out[i + 3] < 1) continue;
      const nx = (x - cx) / cx;
      // gains that turn the LOCAL ratio into the TARGET ratio
      let gb = at(cB, nx, ny), gg = at(cG, nx, ny);
      if (!(gb > 0.05) || !(gg > 0.05)) continue;
      let kb = brT / gb, kg = grT / gg;
      if (kb < 0.5) kb = 0.5; if (kb > 2) kb = 2;      // never let the fit invert a channel
      if (kg < 0.5) kg = 0.5; if (kg > 2) kg = 2;
      const r = src[i], g = src[i + 1], b = src[i + 2];
      const L0 = L709(r, g, b);
      const r2 = r, g2 = g * kg, b2 = b * kb;
      const L1 = L709(r2, g2, b2);
      const k = L1 > 1e-6 ? L0 / L1 : 1;               // hold per-pixel luma exactly
      const v = [r2 * k, g2 * k, b2 * k];
      for (let c = 0; c < 3; c++) out[i + c] = v[c] < 0 ? 0 : v[c] > 255 ? 255 : Math.round(v[c]);
    }
  }
  return out;
}

module.exports = { blocks, planeFit, chromaRamp, chromaFlatten, BLK };
