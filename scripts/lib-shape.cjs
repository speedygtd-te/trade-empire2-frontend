/**
 * TILE-SHAPE METRICS -- the three numbers that describe how a tile sits in its
 * diamond, as opposed to what its surface looks like. Lifted verbatim from the
 * BARREN/ASTEROIDS measuring runs (scratchpad ast-measure.cjs, build-numbers-txt.cjs)
 * so every corpus table stays reproducible.
 *
 *   edgeDrop   how much darker the OUTER eighth of the diamond is than the
 *              INNER eighth. Eight bands by Manhattan distance from the centre
 *              in diamond coordinates, band 0 = rim, band 7 = middle; the number
 *              is band0 - band7. A tile that is vignetted by its own generation
 *              reads strongly negative and will show a dark seam ring in the
 *              lattice no matter how well its level is solved. This is NOT rim
 *              halo (lib-tile-metrics.rimHalo), which looks at the outermost
 *              1-4 px against 10-24 px -- edgeDrop is the whole radial profile.
 *
 *   lowpassRaw the "tiefp" column. sd of the 32-px BLOCK MEANS over the sd of
 *              the raw interior luma -- the share of a tile's contrast that
 *              lives at block scale rather than at pixel scale. High = the tile
 *              is built from big blotches; low = detail is fine. Reported next
 *              to grain, which measures the same thing from the other side
 *              (autocorrelation rather than variance split).
 *
 *   opaque     the alpha census. A ground tile is ~50 % fully opaque (the
 *              diamond) and the rest zero, with a thin feathered rim. void_edge
 *              broke that assumption, and every metric that gates on alpha >= 250
 *              silently measures a different population when it does.
 *
 * All three take RAW PIXELS THAT WERE READ BACK FROM THE WRITTEN FILE, for the
 * reason in lib-tile-metrics: libwebp does not preserve RGB under alpha 0.
 */
const S = require('./lib-tile-metrics.cjs');
const L709 = S.L709;

/** rim band minus centre band of the 8-band radial luma profile */
function edgeDrop(data, ch, w, h) {
  const cx = (w - 1) / 2, cy = (h - 1) / 2, NB = 8;
  const s = new Float64Array(NB), n = new Float64Array(NB);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch; if (data[i + 3] < 250) continue;
    const u = Math.abs(x - cx) / (w / 2) + Math.abs(y - cy) / (h / 2);
    let b = Math.floor((1 - u) * NB); if (b < 0) b = 0; if (b >= NB) b = NB - 1;
    s[b] += L709(data[i], data[i + 1], data[i + 2]); n[b]++;
  }
  return s[0] / n[0] - s[NB - 1] / n[NB - 1];
}

/** "tiefp": sd of 32-px block means / sd of the raw interior luma */
function lowpassRaw(data, ch, w, h) {
  const BS = 32; let s = 0, q = 0, n = 0; const bs = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch; if (data[i + 3] < 250) continue;
    const L = L709(data[i], data[i + 1], data[i + 2]);
    s += L; q += L * L; n++;
    const k = Math.floor(y / BS) * 1000 + Math.floor(x / BS);
    const e = bs.get(k) || [0, 0]; e[0] += L; e[1]++; bs.set(k, e);
  }
  const tot = Math.sqrt(q / n - (s / n) ** 2);
  const mv = []; for (const [, e] of bs) if (e[1] >= BS * BS * 0.6) mv.push(e[0] / e[1]);
  const mm = mv.reduce((a, b) => a + b, 0) / mv.length;
  return Math.sqrt(mv.reduce((a, b) => a + (b - mm) ** 2, 0) / mv.length) / tot;
}

/** opaque-pixel share -- a tile like void_edge may not be a normal ground tile */
function opaque(data, ch, w, h) {
  let full = 0, part = 0, zero = 0;
  for (let p = 0; p < w * h; p++) { const v = data[p * ch + 3];
    if (v >= 250) full++; else if (v < 8) zero++; else part++; }
  return { full: full / (w * h), part: part / (w * h), zero: zero / (w * h) };
}

module.exports = { edgeDrop, lowpassRaw, opaque };
