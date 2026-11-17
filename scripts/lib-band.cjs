/**
 * BAND OPERATORS -- the two edits that move a single spatial band of a tile and
 * provably leave the others where they were. Both are built on the same
 * opaque-only box blur the meso metric uses (lib-grain.blurOpaque), so what they
 * change is exactly what lib-meso measures.
 *
 * Split used throughout:
 *     L  =  blur32  +  (blur6 - blur32)  +  (L - blur6)
 *            level        MESO band          FINE band
 *
 *   bandScale(kMeso, kFine)  rebuild the luma from that split with the two upper
 *            terms scaled, then apply the resulting per-pixel gain to R,G,B alike.
 *            Because the gain is a SCALAR, B/R and G/R are untouched -- the
 *            chroma field survives (lib-chroma), and so do level, ramp and the
 *            lattice numbers, since blur32 is carried through unchanged.
 *
 *   unsharpLuma(R, amt)  the classic unsharp, but on LUMA only, so a chroma
 *            flatten applied just before it is not undone. Applied BEFORE the
 *            grade, so the level solve still lands exactly; blowout has to be
 *            re-measured after, because this is the operator that creates it.
 *
 * WHY THEY ARE NOT INTERCHANGEABLE, and why meso is not gameable: unsharp at
 * radius r adds energy BELOW r. With the meso band starting at rIn = 6 -- above
 * any useful sharpening radius -- unsharpLuma lifts micro4 and leaves meso where
 * it was. Only bandScale moves meso. That asymmetry is the reason meso is an
 * acceptance criterion and micro4 alone is not.
 *
 * Verbatim from the scratchpad runs that produced the BARREN/ASTEROIDS numbers
 * (ast-db-options.cjs bandScale, t-sharp.cjs unsharpLuma).
 */
const S = require('./lib-tile-metrics.cjs');
const G = require('./lib-grain.cjs');

/** scale the meso and fine terms alone; level, ramp and chroma are held */
function bandScale(b, ch, w, h, kMeso, kFine) {
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) { L[p] = S.L709(b[p * ch], b[p * ch + 1], b[p * ch + 2]); A[p] = b[p * ch + 3] >= 250 ? 1 : 0; }
  const b6 = G.blurOpaque(L, A, w, h, 6), b32 = G.blurOpaque(L, A, w, h, 32);
  const o = Buffer.from(b);
  for (let p = 0; p < w * h; p++) {
    if (!A[p]) continue;
    const target = b32[p] + kMeso * (b6[p] - b32[p]) + kFine * (L[p] - b6[p]);
    const k = L[p] > 1e-6 ? target / L[p] : 1;
    for (let c = 0; c < 3; c++) { const v = b[p * ch + c] * k; o[p * ch + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
  }
  return o;
}

/** unsharp on LUMA only, so a chroma flatten just done is not undone */
function unsharpLuma(src, ch, w, h, R, amt) {
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) { L[p] = S.L709(src[p * ch], src[p * ch + 1], src[p * ch + 2]); A[p] = src[p * ch + 3] >= 250 ? 1 : 0; }
  const bl = G.blurOpaque(L, A, w, h, R);
  const out = Buffer.from(src);
  for (let p = 0; p < w * h; p++) {
    if (!A[p]) continue;
    const tgt = L[p] + amt * (L[p] - bl[p]); const k = L[p] > 1e-6 ? tgt / L[p] : 1;
    for (let c = 0; c < 3; c++) { const v = src[p * ch + c] * k; out[p * ch + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
  }
  return out;
}

module.exports = { bandScale, unsharpLuma };
