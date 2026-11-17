/**
 * SHARED ICE / DIAMOND GEOMETRY HELPERS for the ice_shelf tile pipeline.
 * Pure CommonJS module, no side effects, no fal.ai. Used by
 *   scripts/ice-shelf-edge-measure.cjs   (QA measurement)
 *   scripts/ice-shelf-compose.cjs        (deterministic inward re-layout)
 *
 * WHY A SHARED DETECTOR: the whole biome hinges on ONE number -- how far the
 * nearest ice pixel sits from the diamond boundary -- so the measurement tool
 * and the tool that builds the layout must agree on what "ice" is, pixel for
 * pixel. Foam streaks are bright too and are allowed to touch the rim (they are
 * a water feature and tile fine); floes are thick blobs, foam is thin lines, so
 * an erosion pass separates the two.
 */
const TILE_W = 512, TILE_H = 256;
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const S5 = Math.sqrt(5);

/** perpendicular distance of (x,y) to the nearest of the four diamond edges */
function edgeDist(x, y) {
  return Math.min(
    Math.abs(x + 2 * y - 256) / S5,   // upper-left
    Math.abs(x - 2 * y - 256) / S5,   // upper-right
    Math.abs(x - 2 * y + 256) / S5,   // lower-left
    Math.abs(x + 2 * y - 768) / S5    // lower-right
  );
}
/** inside the diamond, at least d px away from its boundary */
const insideBy = (x, y, d) =>
  Math.abs(x - 256) / 256 + Math.abs(y - 128) / 128 <= 1 && edgeDist(x, y) >= d;

function erode(mask, w, h, r) {
  let cur = mask;
  for (let it = 0; it < r; it++) {
    const nxt = new Uint8Array(cur.length);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        if (cur[p] && cur[p - 1] && cur[p + 1] && cur[p - w] && cur[p + w]) nxt[p] = 1;
      }
    }
    cur = nxt;
  }
  return cur;
}

function dilate(mask, w, h, r) {
  let cur = mask;
  for (let it = 0; it < r; it++) {
    const nxt = new Uint8Array(cur.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (cur[p] ||
          (x > 0 && cur[p - 1]) || (x < w - 1 && cur[p + 1]) ||
          (y > 0 && cur[p - w]) || (y < h - 1 && cur[p + w])) nxt[p] = 1;
      }
    }
    cur = nxt;
  }
  return cur;
}

function labelComponents(mask, w, h) {
  const lab = new Int32Array(mask.length).fill(-1);
  const sizes = [];
  const stack = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || lab[s] !== -1) continue;
    const id = sizes.length;
    let n = 0;
    stack.push(s); lab[s] = id;
    while (stack.length) {
      const p = stack.pop(); n++;
      const x = p % w, y = (p - x) / w;
      if (x > 0 && mask[p - 1] && lab[p - 1] === -1) { lab[p - 1] = id; stack.push(p - 1); }
      if (x < w - 1 && mask[p + 1] && lab[p + 1] === -1) { lab[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && mask[p - w] && lab[p - w] === -1) { lab[p - w] = id; stack.push(p - w); }
      if (y < h - 1 && mask[p + w] && lab[p + w] === -1) { lab[p + w] = id; stack.push(p + w); }
    }
    sizes.push(n);
  }
  return { lab, sizes };
}

/** flood a full mask outwards from surviving seed cores */
function reachable(full, cores, w, h) {
  const out = new Uint8Array(full.length);
  const stack = [];
  for (let p = 0; p < cores.length; p++) if (cores[p] && full[p]) { out[p] = 1; stack.push(p); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p - x) / w;
    const push = (q) => { if (full[q] && !out[q]) { out[q] = 1; stack.push(q); } };
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  return out;
}

/**
 * Detect floe ice in a decoded RGBA tile.
 *   lo = mean of the dark half of the interior histogram (open water level)
 *   hi = 97th percentile (ice level)
 *   bright = L > lo + frac*(hi-lo)  ->  erode(erodeR) kills foam lines
 *   -> components >= minArea are floe cores -> flood back over `bright`
 * Returns the ice mask plus the luminance figures the report quotes.
 */
function detectIce(data, w, h, ch, opt) {
  const o = Object.assign({ frac: 0.45, erodeR: 3, minArea: 60 }, opt || {});
  const L = new Float32Array(w * h);
  const alpha = new Uint8Array(w * h);
  const lums = [];
  for (let p = 0; p < w * h; p++) {
    const i = p * ch;
    alpha[p] = data[i + 3];
    L[p] = L709(data[i], data[i + 1], data[i + 2]);
    if (alpha[p] >= 8) lums.push(L[p]);
  }
  lums.sort((a, b) => a - b);
  const halfN = Math.max(1, Math.floor(lums.length / 2));
  const lo = lums.slice(0, halfN).reduce((s, v) => s + v, 0) / halfN;
  const hi = lums[Math.min(lums.length - 1, Math.floor(lums.length * 0.97))];
  const thr = lo + o.frac * (hi - lo);

  const bright = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) if (alpha[p] >= 8 && L[p] > thr) bright[p] = 1;
  const cores = erode(bright, w, h, o.erodeR);
  const { lab, sizes } = labelComponents(cores, w, h);
  const big = new Set();
  for (let id = 0; id < sizes.length; id++) if (sizes[id] >= o.minArea) big.add(id);
  const keep = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) if (lab[p] >= 0 && big.has(lab[p])) keep[p] = 1;
  const ice = reachable(bright, keep, w, h);

  let iceN = 0, iceL = 0, wN = 0, wL = 0, inN = 0;
  for (let p = 0; p < w * h; p++) {
    if (alpha[p] < 8) continue;
    inN++;
    if (ice[p]) { iceN++; iceL += L[p]; } else { wN++; wL += L[p]; }
  }
  return {
    ice, alpha, L, lo, hi, thr, nFloes: big.size,
    iceN, inN, iceShare: iceN / inN,
    iceLum: iceN ? iceL / iceN : 0,
    waterLum: wN ? wL / wN : 0,
  };
}

/** min edge distance over a mask, plus how many pixels sit on the rim */
function edgeStats(mask, w, h) {
  let minD = Infinity, at = null, rim = 0;
  for (let p = 0; p < w * h; p++) {
    if (!mask[p]) continue;
    const x = p % w, y = (p - x) / w;
    const d = edgeDist(x, y);
    if (d < minD) { minD = d; at = [x, y]; }
    if (d < 2) rim++;
  }
  return { minD, at, rim };
}

module.exports = {
  TILE_W, TILE_H, L709, edgeDist, insideBy,
  erode, dilate, labelComponents, reachable, detectIce, edgeStats,
};
