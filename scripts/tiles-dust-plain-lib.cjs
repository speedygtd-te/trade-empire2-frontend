/**
 * Shared measurement / grading / lattice helpers for the dust_plain (BARREN)
 * round. Lifted verbatim in behaviour from scripts/tiles-frozen-lake-ladder.cjs
 * so the numbers stay directly comparable with the ICE round, with three
 * additions this brief needs:
 *   - p70 of the interior luminance (the GROUND value; the mean is dragged by
 *     the amount of shadow, so the level is anchored on p70 here)
 *   - saturation over the interior  (the brief's "Saett.")
 *   - a polynomial illumination flattener, because the two shipped good slots
 *     differ by 14 points in vertical ramp and that has to be normalised out
 *     before a common ramp is imposed
 *
 * Nothing in here writes to src/assets/tiles/.
 */
const fs = require('fs');
const sharp = require('sharp');
sharp.cache(false);

const TILE_W = 512, TILE_H = 256;
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const VAC_A = 0.45, VAC_RGB = [5, 10, 25];
const PLAY_W = 48, PLAY_H = 24;

const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);

// ---------------------------------------------------------------- stats ----
function statsRaw(data, ch, w, h) {
  const N = data.length / ch;
  const s = [0, 0, 0], is = [0, 0, 0], iq = [0, 0, 0];
  let ni = 0;
  const half = { l: 0, r: 0, t: 0, b: 0 }, hn = { l: 0, r: 0, t: 0, b: 0 };
  const lv = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    for (let c = 0; c < 3; c++) s[c] += data[i + c];
    if (data[i + 3] < 8) continue;
    for (let c = 0; c < 3; c++) { is[c] += data[i + c]; iq[c] += data[i + c] * data[i + c]; }
    ni++;
    const L = L709(data[i], data[i + 1], data[i + 2]);
    if (data[i + 3] >= 250) lv.push(L);
    const kx = x < w / 2 ? 'l' : 'r', ky = y < h / 2 ? 't' : 'b';
    half[kx] += L; hn[kx]++; half[ky] += L; hn[ky]++;
  }
  lv.sort((a, b) => a - b);
  const m = s.map((x) => x / N), im = is.map((x) => x / ni);
  const isd = iq.map((x, k) => Math.sqrt(Math.max(0, x / ni - im[k] * im[k])));
  const q = (p) => (lv.length ? lv[Math.min(lv.length - 1, Math.floor(lv.length * p))] : 0);
  let cr = 0, cn2 = 0, sat = 0, sn = 0;
  for (let i = 0; i < data.length; i += ch) {
    if (data[i + 3] < 8) continue;
    const r = data[i] / im[0], g = data[i + 1] / im[1], b = data[i + 2] / im[2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 0) cr += (mx - mn) / mx;
    cn2++;
    const MX = Math.max(data[i], data[i + 1], data[i + 2]);
    const MN = Math.min(data[i], data[i + 1], data[i + 2]);
    if (MX > 0) { sat += (MX - MN) / MX; sn++; }
  }
  const tr = tiltRimRaw(data, ch, w, h);
  return {
    gx: tr.gx, gy: tr.gy, rim: tr.rim,
    chromaRes: cn2 ? cr / cn2 : 0,
    sat: sn ? sat / sn : 0,
    lum: L709(m[0], m[1], m[2]), intLum: L709(im[0], im[1], im[2]), rgb: im,
    br: im[2] / im[0], gr: im[1] / im[0],
    sd: (isd[0] + isd[1] + isd[2]) / 3,
    p70: q(0.70), p99: q(0.99),
    blow: lv.length ? lv.filter((v) => v >= 200).length / lv.length : 0,
    tiltX: half.l / hn.l - half.r / hn.r, tiltY: half.t / hn.t - half.b / hn.b,
  };
}

/**
 * THE BRIEF'S tilt AND rim, reproduced exactly -- so this round reports in the
 * same unit the brief states its numbers in.
 *
 *   gx / gy = least-squares slope of the interior luminance against the
 *     normalised coordinate (nx, ny in [-1,1], y pointing DOWN). Calibrated
 *     against the brief's four rows: rms 0.01 on tiltX, 0.03 on tiltY, over 60
 *     candidate definitions. It is 3/2 x the half-mean difference in statsRaw
 *     and carries the OPPOSITE sign -- the two are not interchangeable.
 *     gy < 0 means the tile is brighter at the top, i.e. lit from above.
 *
 *   rim = mean over the outer band (0..16 px inward from the diamond edge)
 *     minus mean over the inner half (64..128 px). Best of 60 scanned band
 *     pairs, rms 0.40 against the brief's four rows. Not the same thing as
 *     rimHalo (1..4 px vs 10..24 px), which only sees the encoder's edge.
 */
function tiltRimRaw(data, ch, w, h) {
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  let n = 0, sL = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxL = 0, syL = 0;
  let ro = 0, no = 0, ri = 0, nio = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (data[i + 3] < 250) continue;
    const nx = (x - cx) / cx, ny = (y - cy) / cy;
    const L = L709(data[i], data[i + 1], data[i + 2]);
    n++; sL += L; sx += nx; sy += ny;
    sxx += nx * nx; syy += ny * ny; sxL += nx * L; syL += ny * L;
    const dpx = (1 - (Math.abs(nx) + Math.abs(ny))) * (w / 4);
    if (dpx < 16) { ro += L; no++; } else if (dpx >= 64) { ri += L; nio++; }
  }
  const mL = sL / n, mx = sx / n, my = sy / n;
  const dxx = sxx - n * mx * mx, dyy = syy - n * my * my;
  return {
    gx: dxx > 0 ? (sxL - n * mx * mL) / dxx : 0,
    gy: dyy > 0 ? (syL - n * my * mL) / dyy : 0,
    rim: (no && nio) ? ro / no - ri / nio : 0,
  };
}
async function tiltRimOf(fileOrBuf) {
  const buf = Buffer.isBuffer(fileOrBuf) ? fileOrBuf : fs.readFileSync(fileOrBuf);
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return tiltRimRaw(r.data, r.info.channels, r.info.width, r.info.height);
}

async function statsOf(fileOrBuf) {
  const buf = Buffer.isBuffer(fileOrBuf) ? fileOrBuf : fs.readFileSync(fileOrBuf);
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return statsRaw(r.data, r.info.channels, r.info.width, r.info.height);
}
async function microContrast(fileOrBuf) {
  const buf = Buffer.isBuffer(fileOrBuf) ? fileOrBuf : fs.readFileSync(fileOrBuf);
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) { L[p] = L709(r.data[p * ch], r.data[p * ch + 1], r.data[p * ch + 2]); A[p] = r.data[p * ch + 3]; }
  let s = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) { const p = y * w + x; if (A[p] < 200 || A[p + 1] < 200) continue; s += Math.abs(L[p] - L[p + 1]); n++; }
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) { const p = y * w + x; if (A[p] < 200 || A[p + w] < 200) continue; s += Math.abs(L[p] - L[p + w]); n++; }
  return n ? s / n : 0;
}
async function rimHalo(fileOrBuf) {
  const buf = Buffer.isBuffer(fileOrBuf) ? fileOrBuf : fs.readFileSync(fileOrBuf);
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  let rs = 0, rn = 0, ins = 0, inn = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (r.data[i + 3] < 250) continue;
    const u = Math.abs(x - cx) / (w / 2) + Math.abs(y - cy) / (h / 2);
    const dpx = (1 - u) * (w / 4);
    const L = L709(r.data[i], r.data[i + 1], r.data[i + 2]);
    if (dpx >= 1 && dpx <= 4) { rs += L; rn++; }
    else if (dpx >= 10 && dpx <= 24) { ins += L; inn++; }
  }
  return (rn && inn) ? rs / rn - ins / inn : 0;
}

// ------------------------------------------------------------- diamond ----
const DIAMOND = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + TILE_W + '" height="' + TILE_H + '">' +
  '<polygon points="' + TILE_W / 2 + ',0 ' + TILE_W + ',' + TILE_H / 2 + ' ' +
  TILE_W / 2 + ',' + TILE_H + ' 0,' + TILE_H / 2 + '" fill="white"/></svg>');
let DMASK = null;
async function diamondMask() {
  if (!DMASK) {
    const g = await sharp(DIAMOND).greyscale().raw().toBuffer({ resolveWithObject: true });
    const w = g.info.width, h = g.info.height, ch = g.info.channels;
    const m = Buffer.alloc(w * h * 4);
    for (let p = 0; p < w * h; p++) { m[p * 4] = 255; m[p * 4 + 1] = 255; m[p * 4 + 2] = 255; m[p * 4 + 3] = g.data[p * ch]; }
    DMASK = await sharp(m, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  }
  return DMASK;
}
/** cut a TILE_W x TILE_H diamond window out of an opaque plate */
async function cutWindow(plate, ox, oy) {
  const flat = await sharp(plate).extract({ left: Math.round(ox), top: Math.round(oy), width: TILE_W, height: TILE_H })
    .removeAlpha().png().toBuffer();
  const masked = await sharp(flat).ensureAlpha()
    .composite([{ input: await diamondMask(), blend: 'dest-in' }]).png().toBuffer();
  const r = await sharp(masked).raw().toBuffer({ resolveWithObject: true });
  return { data: r.data, info: r.info, png: masked };
}

// --------------------------------------------------------------- grade ----
/** hue gains x level gain x (1 + p*nx + q*ny) plane. No flatten. */
function grade(src, ch, w, h, tint, G, p, q) {
  const out = Buffer.from(src);
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    const ny = (y - cy) / cy;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      if (out[i + 3] < 1) continue;
      const nx = (x - cx) / cx;
      const g = G * (1 + p * nx + q * ny);
      for (let c = 0; c < 3; c++) {
        const v = src[i + c] * tint[c] * g;
        out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
      }
    }
  }
  return out;
}
async function writeTile(buf, W, H, CH, outFile) {
  const png = await sharp(buf, { raw: { width: W, height: H, channels: CH } }).png().toBuffer();
  await sharp(png).webp(WEBP).toFile(outFile);
  return png;
}
/**
 * Solve tint / gain / ramp against the WRITTEN webp. LEVEL IS ANCHORED ON p70
 * (the ground value) and not on the mean, which the shadow fraction drags.
 */
async function solveTile(S, W, H, CH, outFile, P70T, BRT, GRT, gxT, gyT, passes) {
  passes = passes || 8;
  const b0 = statsRaw(S, CH, W, H);
  const tint = [1, (GRT * b0.rgb[0]) / b0.rgb[1], (BRT * b0.rgb[0]) / b0.rgb[2]];
  let G = P70T / b0.p70, p = 0, q = 0;
  const t00 = statsRaw(grade(S, CH, W, H, tint, G, 0, 0), CH, W, H);
  const tP = statsRaw(grade(S, CH, W, H, tint, G, 0.2, 0), CH, W, H);
  const tQ = statsRaw(grade(S, CH, W, H, tint, G, 0, 0.2), CH, W, H);
  const Kx = (tP.gx - t00.gx) / 0.2 || 1, Ky = (tQ.gy - t00.gy) / 0.2 || 1;
  let m = null, png = null;
  for (let pass = 0; pass < passes; pass++) {
    png = await writeTile(grade(S, CH, W, H, tint, G, p, q), W, H, CH, outFile);
    m = await statsOf(outFile);
    if (pass === passes - 1) break;
    G *= P70T / m.p70;
    tint[2] *= BRT / m.br;
    tint[1] *= GRT / m.gr;
    p += (gxT - m.gx) / Kx;
    q += (gyT - m.gy) / Ky;
  }
  m.png = png;
  return m;
}

// -------------------------------------------- polynomial illumination -----
function solveLinSys(A, b) {
  const n = b.length;
  const M = A.map((row, i) => row.concat([b[i]]));
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    const t = M[i]; M[i] = M[p]; M[p] = t;
    if (!isFinite(M[i][i]) || Math.abs(M[i][i]) < 1e-12) M[i][i] = 1e-12;
    const dd = M[i][i];
    for (let c = i; c <= n; c++) M[i][c] /= dd;
    for (let r = 0; r < n; r++) { if (r === i) continue; const f = M[r][i]; if (f === 0) continue; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]; }
  }
  return M.map((row) => row[n]);
}
function polyTerms(nx, ny, deg) {
  const t = [];
  for (let a = 0; a <= deg; a++) for (let b = 0; a + b <= deg; b++) t.push(Math.pow(nx, a) * Math.pow(ny, b));
  return t;
}
/**
 * Fit a degree-N 2D polynomial to the interior luminance and divide it out,
 * leaving the tile's own grain but no large-scale brightness field. LESSONS
 * forbids divide-by-blur on diamond-masked tiles (the dark corners poison the
 * kernel and a bright rim appears); an analytic fit has no kernel.
 */
function flattenPoly(src, ch, w, h, deg) {
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const nT = polyTerms(0, 0, deg).length;
  const A = Array.from({ length: nT }, () => new Float64Array(nT));
  const bv = new Float64Array(nT);
  let mean = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (src[i + 3] < 250) continue;
    const T = polyTerms((x - cx) / cx, (y - cy) / cy, deg);
    const L = L709(src[i], src[i + 1], src[i + 2]);
    for (let a = 0; a < nT; a++) { bv[a] += T[a] * L; for (let b = 0; b < nT; b++) A[a][b] += T[a] * T[b]; }
    mean += L; n++;
  }
  mean /= n;
  const coef = solveLinSys(A.map((r) => Array.from(r)), Array.from(bv));
  const out = Buffer.from(src);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (out[i + 3] < 1) continue;
    const T = polyTerms((x - cx) / cx, (y - cy) / cy, deg);
    let fit = 0; for (let a = 0; a < nT; a++) fit += coef[a] * T[a];
    const g = fit > 1 ? mean / fit : 1;
    for (let c = 0; c < 3; c++) { const v = src[i + c] * g; out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
  }
  return out;
}

/**
 * Divide out the DIAMOND-RADIAL brightness profile. The rim seam this brief
 * cares about is a broad bowl over the outer sixth of the tile, measured as
 * band[0,16px) minus band[64,128px); a 2D polynomial in (nx,ny) fits it badly
 * because the level set |nx|+|ny| = const has kinks at the four corners. So
 * fit a 1D profile in u = |nx|+|ny| directly, smooth it, and divide it out.
 * Still no kernel over the image, so LESSONS' ban on divide-by-blur on
 * diamond-masked tiles is not touched.
 */
function flattenRadial(src, ch, w, h, nbins, smooth) {
  nbins = nbins || 48; smooth = smooth == null ? 4 : smooth;
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const s = new Float64Array(nbins), n = new Float64Array(nbins);
  let mean = 0, mn = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (src[i + 3] < 250) continue;
    const u = Math.abs((x - cx) / cx) + Math.abs((y - cy) / cy);
    let b = Math.floor(u * nbins); if (b < 0) b = 0; if (b >= nbins) b = nbins - 1;
    const L = L709(src[i], src[i + 1], src[i + 2]);
    s[b] += L; n[b]++; mean += L; mn++;
  }
  mean /= mn;
  const prof = new Float64Array(nbins);
  for (let b = 0; b < nbins; b++) {
    let a = 0, c = 0;
    for (let k = -smooth; k <= smooth; k++) { const j = b + k; if (j < 0 || j >= nbins || n[j] < 32) continue; a += s[j]; c += n[j]; }
    prof[b] = c > 0 ? a / c : mean;
  }
  const out = Buffer.from(src);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (out[i + 3] < 1) continue;
    const u = Math.abs((x - cx) / cx) + Math.abs((y - cy) / cy);
    const t = Math.min(nbins - 1.0001, Math.max(0, u * nbins - 0.5));
    const b0 = Math.floor(t), fr = t - b0;
    const p = prof[b0] * (1 - fr) + prof[Math.min(nbins - 1, b0 + 1)] * fr;
    const g = p > 1 ? mean / p : 1;
    for (let c = 0; c < 3; c++) { const v = src[i + c] * g; out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
  }
  return out;
}

/**
 * Replace the outermost `depth` px ring of the diamond with content sampled
 * `depth+2` px further in. The shipped tiles carry libwebp's edge artefact
 * there (the transparent corners decode as near-black and bleed across the
 * 4:2:0 chroma block); left in place, an iso-lattice roll would drag that
 * hairline into the MIDDLE of the derived tile.
 */
function edgeRepair(src, ch, w, h, depth) {
  depth = depth || 3;
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const out = Buffer.from(src);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (src[i + 3] < 250) continue;
    const nx = (x - cx) / cx, ny = (y - cy) / cy;
    const dpx = (1 - (Math.abs(nx) + Math.abs(ny))) * (w / 4);
    if (dpx >= depth) continue;
    // inward normal of the diamond quadrant this pixel is in, in pixels
    const sx = nx >= 0 ? -1 : 1, sy = ny >= 0 ? -1 : 1;
    const push = depth + 2 - dpx;
    const jx = Math.round(x + sx * push), jy = Math.round(y + sy * push / 2);
    if (jx < 0 || jy < 0 || jx >= w || jy >= h) continue;
    const j = (jy * w + jx) * ch;
    if (src[j + 3] < 250) continue;
    for (let c = 0; c < 3; c++) out[i + c] = src[j + c];
  }
  return out;
}

/**
 * ROLL THE TILE ON THE ISO TORUS.
 *
 * A 512x256 diamond tiles the plane on the lattice generated by (512,0) and
 * (256,128), so the tile's content is a function on that torus and any roll of
 * it is another valid tile made of exactly the same pixels -- no mirror, no
 * resampling, no invented content. The only new artefact is that two parts of
 * the tile that were not adjacent inside the diamond now touch; but in the game
 * they ALREADY touch, across the tile boundary, so that seam is the tile's own
 * self-seam and nothing new. It is small only if the tile has been normalised
 * first, which is why this runs after flattenRadial/flattenPoly/edgeRepair.
 *
 * In (u,v) = ((x/256 + y/128)/2, (x/256 - y/128)/2) the lattice generators are
 * (1,1) and (1,0), so every integer (du,dv) is reachable and reduction to the
 * fundamental cell is just rounding.
 */
function latticeRoll(src, ch, w, h, dx, dy) {
  const HW = w / 2, HH = h / 2;                 // 256, 128
  const out = Buffer.alloc(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    out[i + 3] = src[i + 3];
    if (src[i + 3] < 1) continue;
    let sx = x - dx, sy = y - dy;
    for (let guard = 0; guard < 8; guard++) {
      const u = ((sx + 0.5) / HW + (sy + 0.5) / HH) / 2;
      const v = ((sx + 0.5) / HW - (sy + 0.5) / HH) / 2;
      const du = Math.round(u - 1), dv = Math.round(v);
      if (du === 0 && dv === 0) break;
      const al = dv, be = du - dv;              // (du,dv) = al*(1,1) + be*(1,0)
      sx -= al * w + be * HW; sy -= be * HH;
    }
    let j = (sy * w + sx) * ch;
    if (sx < 0 || sy < 0 || sx >= w || sy >= h || src[j + 3] < 250) {
      // land on the 1 px mask fringe: step one pixel toward the centre
      const kx = Math.min(w - 1, Math.max(0, sx + (sx < HW ? 1 : -1)));
      const ky = Math.min(h - 1, Math.max(0, sy + (sy < HH ? 1 : -1)));
      j = (ky * w + kx) * ch;
      if (src[j + 3] < 250) { for (let c = 0; c < 3; c++) out[i + c] = src[i + c]; continue; }
    }
    for (let c = 0; c < 3; c++) out[i + c] = src[j + c];
  }
  return out;
}

// ---------------------------------------------------------- iso lattice ----
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
async function isoField(bufs4, w, h, rows, cols, pick) {
  const bufs = [];
  for (const f of bufs4) bufs.push(await sharp(typeof f === 'string' ? fs.readFileSync(f) : f).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer());
  const cells = [];
  let mr = 0, mb = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const slot = pick(r, c);
    const x = c * w + (r % 2 ? w / 2 : 0), y = (r * h) / 2;
    cells.push({ input: bufs[slot], left: x, top: y, slot: slot });
    mr = Math.max(mr, x + w); mb = Math.max(mb, y + h);
  }
  const png = await sharp({ create: { width: mr, height: mb, channels: 4, background: BGA } })
    .composite(cells.map((c) => ({ input: c.input, left: c.left, top: c.top }))).png().toBuffer();
  return { png: png, cells: cells, w: mr, h: mb, tw: w, th: h };
}
async function vacuum(png) {
  const r = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels;
  for (let p = 0; p < r.info.width * r.info.height; p++) for (let c = 0; c < 3; c++) r.data[p * ch + c] = Math.round(r.data[p * ch + c] * (1 - VAC_A) + VAC_RGB[c] * VAC_A);
  return sharp(r.data, { raw: { width: r.info.width, height: r.info.height, channels: ch } }).png().toBuffer();
}
async function lumaOf(png) {
  const r = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const L = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) L[p] = L709(r.data[p * ch], r.data[p * ch + 1], r.data[p * ch + 2]);
  return { L: L, w: w, h: h };
}
const RIM_CUT = 0.42;
function gridMetrics(L, w, h, cells, TW, TH) {
  const BINS = Math.max(6, Math.min(32, Math.round(Math.sqrt((TW * TH) / 2 / 16))));
  const NB = BINS * BINS;
  const slotOf = new Map();
  for (const c of cells) {
    const cx = c.left + TW / 2, cy = c.top + TH / 2;
    const ru = Math.round((cx / (TW / 2) + cy / (TH / 2)) / 2);
    const rv = Math.round((cx / (TW / 2) - cy / (TH / 2)) / 2);
    slotOf.set((ru + 4096) * 8192 + (rv + 4096), c.slot);
  }
  const n = new Float64Array(4 * NB), s1 = new Float64Array(4 * NB), s2 = new Float64Array(4 * NB);
  for (let y = TH; y < h - TH; y++) for (let x = TW; x < w - TW; x++) {
    const up = (x / (TW / 2) + y / (TH / 2)) / 2, vp = (x / (TW / 2) - y / (TH / 2)) / 2;
    const ru = Math.round(up), rv = Math.round(vp);
    const du = up - ru, dv = vp - rv;
    if (Math.max(Math.abs(du), Math.abs(dv)) > RIM_CUT) continue;
    const sl = slotOf.get((ru + 4096) * 8192 + (rv + 4096));
    if (sl === undefined) continue;
    let bu = Math.floor((du + 0.5) * BINS); if (bu < 0) bu = 0; if (bu >= BINS) bu = BINS - 1;
    let bv = Math.floor((dv + 0.5) * BINS); if (bv < 0) bv = 0; if (bv >= BINS) bv = BINS - 1;
    const k = sl * NB + bu * BINS + bv;
    const v = L[y * w + x];
    n[k]++; s1[k] += v; s2[k] += v * v;
  }
  let wss = 0, wdf = 0;
  for (let k = 0; k < 4 * NB; k++) { if (n[k] < 2) continue; wss += s2[k] - (s1[k] * s1[k]) / n[k]; wdf += n[k] - 1; }
  const varWithin = wdf > 0 ? wss / wdf : 0;
  const cn = new Float64Array(NB), cs = new Float64Array(NB);
  for (let s = 0; s < 4; s++) for (let b = 0; b < NB; b++) { cn[b] += n[s * NB + b]; cs[b] += s1[s * NB + b]; }
  let cm = 0, cc = 0;
  for (let b = 0; b < NB; b++) if (cn[b] > 0) { cm += cs[b] / cn[b]; cc++; }
  cm /= cc;
  let cv = 0, nfloor = 0;
  for (let b = 0; b < NB; b++) if (cn[b] > 0) { const d = cs[b] / cn[b] - cm; cv += d * d; nfloor += 1 / cn[b]; }
  cv /= cc; nfloor = (varWithin * nfloor) / cc;
  const gridCoh = Math.sqrt(Math.max(0, cv - nfloor));
  let tm = 0, tc = 0;
  for (let k = 0; k < 4 * NB; k++) if (n[k] > 0) { tm += s1[k] / n[k]; tc++; }
  tm /= tc;
  let tv = 0, tf = 0;
  for (let k = 0; k < 4 * NB; k++) if (n[k] > 0) { const d = s1[k] / n[k] - tm; tv += d * d; tf += 1 / n[k]; }
  tv /= tc; tf = (varWithin * tf) / tc;
  const gridTot = Math.sqrt(Math.max(0, tv - tf));
  const gridSlot = Math.sqrt(Math.max(0, gridTot * gridTot - gridCoh * gridCoh));
  return { sdWithin: Math.sqrt(varWithin), gridCoh: gridCoh, gridTot: gridTot, gridSlot: gridSlot,
    ratio: Math.sqrt(varWithin) > 0 ? gridTot / Math.sqrt(varWithin) : 0 };
}
function boundaryStep(F) {
  const L = F.L, w = F.w, h = F.h, cells = F.cells, W = F.tw, H = F.th;
  const at = (x, y) => (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) ? null : L[Math.round(y) * w + Math.round(x)];
  const D = 4;
  const nrm = { UL: [1, 1], UR: [-1, 1], LL: [1, -1], LR: [-1, -1] };
  let s = 0, n = 0;
  for (const c of cells) {
    if (c.left < W || c.top < H / 2 || c.left + W > w - W || c.top + H > h - H / 2) continue;
    for (const e of ['UL', 'UR', 'LL', 'LR']) {
      const enx = nrm[e][0], eny = nrm[e][1];
      for (let t = 0.18; t <= 0.82; t += 0.02) {
        let ex, ey;
        if (e === 'UL') { ex = c.left + t * (W / 2); ey = c.top + H / 2 - t * (H / 2); }
        else if (e === 'UR') { ex = c.left + W / 2 + t * (W / 2); ey = c.top + t * (H / 2); }
        else if (e === 'LL') { ex = c.left + t * (W / 2); ey = c.top + H / 2 + t * (H / 2); }
        else { ex = c.left + W / 2 + t * (W / 2); ey = c.top + H - t * (H / 2); }
        const len = Math.hypot(enx, eny * 2);
        const ux = enx / len, uy = (eny * 2 / len) / 2;
        const a = at(ex + ux * D, ey + uy * D), b = at(ex - ux * D, ey - uy * D);
        if (a === null || b === null || a < 2 || b < 2) continue;
        s += Math.abs(a - b); n++;
      }
    }
  }
  let is = 0, ino = 0;
  for (const c of cells) {
    if (c.left < W || c.top < H / 2 || c.left + W > w - W || c.top + H > h - H / 2) continue;
    for (let dy = -40; dy <= 40; dy += 7) for (let dx = -120; dx <= 120; dx += 11) {
      const x = c.left + W / 2 + dx, y = c.top + H / 2 + dy;
      const a = at(x - 4, y), b = at(x + 4, y);
      if (a === null || b === null || a < 2 || b < 2) continue;
      is += Math.abs(a - b); ino++;
    }
  }
  return { step: n ? s / n : 0, rough: ino ? is / ino : 0, ratio: (ino && n) ? (s / n) / (is / ino) : 0 };
}
async function gridOf(bufs4) {
  const rnd = mulberry32(4242);
  const P = await isoField(bufs4, PLAY_W, PLAY_H, 50, 30, () => Math.floor(rnd() * 4));
  const Lp = await lumaOf(P.png);
  const g = gridMetrics(Lp.L, Lp.w, Lp.h, P.cells, PLAY_W, PLAY_H);
  const rndF = mulberry32(4242);
  const F = await isoField(bufs4, TILE_W, TILE_H, 10, 6, () => Math.floor(rndF() * 4));
  const Lf = await lumaOf(F.png);
  const gf = gridMetrics(Lf.L, Lf.w, Lf.h, F.cells, TILE_W, TILE_H);
  const bs = boundaryStep(Object.assign({}, F, { L: Lf.L, w: Lf.w, h: Lf.h }));
  return { play: g, full: gf, bs: bs };
}

// ------------------------------------------------------------------ NCC ----
async function lumaA(buf) {
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) { L[p] = L709(r.data[p * ch], r.data[p * ch + 1], r.data[p * ch + 2]); A[p] = r.data[p * ch + 3]; }
  return { L, A, w, h };
}
function nccOf(a, b) {
  let n = 0, sa = 0, sb = 0;
  for (let p = 0; p < a.L.length; p++) { if (a.A[p] < 250 || b.A[p] < 250) continue; sa += a.L[p]; sb += b.L[p]; n++; }
  if (!n) return 0; sa /= n; sb /= n;
  let num = 0, da = 0, db = 0;
  for (let p = 0; p < a.L.length; p++) { if (a.A[p] < 250 || b.A[p] < 250) continue; const x = a.L[p] - sa, y = b.L[p] - sb; num += x * y; da += x * x; db += y * y; }
  return (da > 0 && db > 0) ? num / Math.sqrt(da * db) : 0;
}
const ORI = { id: (s) => s.clone(), flop: (s) => s.clone().flop(), flip: (s) => s.clone().flip(), r180: (s) => s.clone().rotate(180) };
async function nccAll(bufA, bufB) {
  const a = await lumaA(bufA);
  const out = {};
  for (const k of Object.keys(ORI)) out[k] = nccOf(a, await lumaA(await ORI[k](sharp(bufB)).png().toBuffer()));
  return out;
}

function label(t, w, size, fill) {
  size = size || 13; fill = fill || '#c9d1d9';
  const esc = String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + (size + 7) + '">' +
    '<text xml:space="preserve" x="4" y="' + (size + 1) + '" font-family="monospace" font-size="' + size + '" fill="' + fill + '">' + esc + '</text></svg>');
}

module.exports = {
  TILE_W, TILE_H, WEBP, BGA, L709, PLAY_W, PLAY_H, f1, f2, f3,
  statsRaw, statsOf, microContrast, rimHalo, tiltRimRaw, tiltRimOf, diamondMask, cutWindow,
  grade, writeTile, solveTile, flattenPoly, flattenRadial, edgeRepair, latticeRoll,
  polyTerms, solveLinSys,
  mulberry32, isoField, vacuum, lumaOf, gridMetrics, boundaryStep, gridOf,
  lumaA, nccOf, nccAll, ORI, label,
};
