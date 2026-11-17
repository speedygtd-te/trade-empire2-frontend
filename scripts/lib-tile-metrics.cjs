/**
 * Shared measurement helpers for the surface-tile work.
 *
 * Everything measures RAW PIXELS THAT WERE HANDED IN -- callers are expected to
 * have READ THE WRITTEN FILE first (LESSONS 1: libwebp does not preserve RGB
 * under alpha 0, so a buffer measurement misses the target by ~1.5 luma).
 * sharp.cache(false) is set here once for every consumer.
 *
 * Extracted behaviour-identical from scripts/tiles-glacier-regolith-ladder.cjs
 * so the regolith round is judged on the same numbers the glacier round was.
 *
 * ONE ADDITION, and it is the point of the regolith round: groundP70().
 * The plain interior MEAN is pulled down by how much SHADOW a tile happens to
 * carry -- a tile with fewer craters measures brighter without its GROUND being
 * brighter. crevasse and frozen_lake were both anchored on the 70th percentile
 * of the unmasked interior instead, and that is what a level target must use.
 */
const fs = require('fs');
const sharp = require('sharp');
sharp.cache(false);

const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
// vacuum darkening, from src/views/grid/isoConstants.ts
const VAC_A = 0.45, VAC_RGB = [5, 10, 25];
// play scale: zoom 1.0 build view is a 48x24 CSS px tile (detailTier.ts)
const PLAY_W = 48, PLAY_H = 24;

function statsRaw(data, ch, w, h) {
  const N = data.length / ch;
  const s = [0, 0, 0], is = [0, 0, 0], iq = [0, 0, 0];
  let ni = 0, sat = 0;
  const half = { l: 0, r: 0, t: 0, b: 0 }, hn = { l: 0, r: 0, t: 0, b: 0 };
  const lv = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    for (let c = 0; c < 3; c++) s[c] += data[i + c];
    if (data[i + 3] < 8) continue;
    for (let c = 0; c < 3; c++) { is[c] += data[i + c]; iq[c] += data[i + c] * data[i + c]; }
    const mx = Math.max(data[i], data[i + 1], data[i + 2]);
    const mn = Math.min(data[i], data[i + 1], data[i + 2]);
    if (mx > 0) sat += (mx - mn) / mx;
    ni++;
    const L = L709(data[i], data[i + 1], data[i + 2]);
    if (data[i + 3] >= 250) lv.push(L);
    const kx = x < w / 2 ? 'l' : 'r', ky = y < h / 2 ? 't' : 'b';
    half[kx] += L; hn[kx]++; half[ky] += L; hn[ky]++;
  }
  lv.sort((a, b) => a - b);
  const m = s.map((x) => x / N), im = is.map((x) => x / ni);
  const isd = iq.map((x, k) => Math.sqrt(Math.max(0, x / ni - im[k] * im[k])));
  // RESIDUAL CHROMA -- per-pixel saturation after the tile's OWN channel means
  // are divided out, so a uniform cast scores ~0 and only real colour variation
  // survives. Plain saturation is useless once a B/R target is imposed.
  let cr = 0, cn2 = 0;
  for (let i = 0; i < data.length; i += ch) {
    if (data[i + 3] < 8) continue;
    const r = data[i] / im[0], g = data[i + 1] / im[1], b = data[i + 2] / im[2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 0) cr += (mx - mn) / mx;
    cn2++;
  }
  const q = (p) => (lv.length ? lv[Math.min(lv.length - 1, Math.floor(lv.length * p))] : 0);
  const p70 = q(0.70);
  return {
    chromaRes: cn2 ? cr / cn2 : 0,
    lum: L709(m[0], m[1], m[2]), intLum: L709(im[0], im[1], im[2]), rgb: im,
    br: im[2] / im[0], gr: im[1] / im[0],
    sd: (isd[0] + isd[1] + isd[2]) / 3, sat: sat / ni,
    blow: lv.length ? lv.filter((v) => v >= 200).length / lv.length : 0,
    p50: q(0.50), p70: p70, p90: q(0.90), p99: q(0.99),
    // shadow fraction: opaque pixels more than 15% below the ground level
    dark: lv.length ? lv.filter((v) => v < 0.85 * p70).length / lv.length : 0,
    tiltX: half.l / hn.l - half.r / hn.r, tiltY: half.t / hn.t - half.b / hn.b,
    nOpaque: ni,
  };
}
async function statsOf(file) {
  const { data, info } = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return statsRaw(data, info.channels, info.width, info.height);
}
/** the 70th percentile of the fully-opaque interior luma -- the GROUND level */
function groundP70(data, ch, w, h) {
  const lv = [];
  for (let p = 0; p < w * h; p++) {
    const i = p * ch;
    if (data[i + 3] < 250) continue;
    lv.push(L709(data[i], data[i + 1], data[i + 2]));
  }
  lv.sort((a, b) => a - b);
  return lv.length ? lv[Math.floor(lv.length * 0.70)] : 0;
}
async function microContrast(file, fallbackFull) {
  let buf;
  if (file && fs.existsSync(file)) buf = fs.readFileSync(file);
  else if (fallbackFull && fs.existsSync(fallbackFull)) {
    buf = await sharp(fs.readFileSync(fallbackFull)).resize(64, 32, { fit: 'fill' }).webp(WEBP).toBuffer();
  } else return 0;
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, w = info.width, h = info.height;
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    L[p] = L709(data[p * ch], data[p * ch + 1], data[p * ch + 2]);
    A[p] = data[p * ch + 3];
  }
  let s = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) {
    const p = y * w + x; if (A[p] < 200 || A[p + 1] < 200) continue;
    s += Math.abs(L[p] - L[p + 1]); n++;
  }
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x; if (A[p] < 200 || A[p + w] < 200) continue;
    s += Math.abs(L[p] - L[p + w]); n++;
  }
  return n ? s / n : 0;
}
async function rimHalo(file) {
  const { data, info } = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, w = info.width, h = info.height;
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  let rs = 0, rn = 0, ins = 0, inn = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (data[i + 3] < 250) continue;
    const u = Math.abs(x - cx) / (w / 2) + Math.abs(y - cy) / (h / 2);
    const dpx = (1 - u) * (w / 4);
    const L = L709(data[i], data[i + 1], data[i + 2]);
    if (dpx >= 1 && dpx <= 4) { rs += L; rn++; }
    else if (dpx >= 10 && dpx <= 24) { ins += L; inn++; }
  }
  return (rn && inn) ? rs / rn - ins / inn : 0;
}
function solveLin(A, b) {
  const n = b.length;
  const M = A.map((row, i) => row.concat([b[i]]));
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    const t = M[i]; M[i] = M[p]; M[p] = t;
    if (!isFinite(M[i][i]) || Math.abs(M[i][i]) < 1e-12) M[i][i] = 1e-12;
    const dd = M[i][i];
    for (let c = i; c <= n; c++) M[i][c] /= dd;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = M[r][i];
      if (f === 0) continue;
      for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
    }
  }
  return M.map((row) => row[n]);
}
/** monomial exponents for all terms of total degree <= N */
function polyTerms(N) {
  const t = [];
  for (let d = 0; d <= N; d++) for (let i = 0; i <= d; i++) t.push([i, d - i]);
  return t;
}
/**
 * FLATTEN: fit an analytic 2D polynomial of total degree N to the interior luma
 * and divide it out, mean preserved. N = 1 is the plane; N = 5 removes blob
 * scale too. There is NO BLUR anywhere in this, so a masked tile's dark corners
 * cannot contaminate a denominator -- the failure that made divide-by-blur
 * unusable and produced a bright yellow rim (LESSONS 2). The multiplier is
 * clamped so a polynomial misbehaving at the diamond tips cannot blow a corner.
 *
 * Verbatim from tiles-glacier-regolith-ladder.cjs, with the alpha gate made
 * optional so it can also flatten a RIMLESS square (every pixel opaque).
 */
function flatten(src, ch, w, h, N, clamp) {
  if (N < 1) return Buffer.from(src);
  const CL = clamp === undefined ? 0.45 : clamp;
  const terms = polyTerms(N), K = terms.length;
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const A = Array.from({ length: K }, () => new Float64Array(K));
  const B = new Float64Array(K);
  const basis = new Float64Array(K);
  for (let y = 0; y < h; y++) {
    const ny = (y - cy) / cy;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      if (src[i + 3] < 250) continue;
      const nx = (x - cx) / cx;
      for (let k = 0; k < K; k++) basis[k] = Math.pow(nx, terms[k][0]) * Math.pow(ny, terms[k][1]);
      const L = L709(src[i], src[i + 1], src[i + 2]);
      for (let a = 0; a < K; a++) {
        B[a] += basis[a] * L;
        for (let b2 = a; b2 < K; b2++) A[a][b2] += basis[a] * basis[b2];
      }
    }
  }
  for (let a = 0; a < K; a++) for (let b2 = 0; b2 < a; b2++) A[a][b2] = A[b2][a];
  const coef = solveLin(A.map((r) => Array.from(r)), Array.from(B));
  const evalAt = (nx, ny) => {
    let v = 0;
    for (let k = 0; k < K; k++) v += coef[k] * Math.pow(nx, terms[k][0]) * Math.pow(ny, terms[k][1]);
    return v;
  };
  let fs2 = 0, fn = 0;
  for (let y = 0; y < h; y++) {
    const ny = (y - cy) / cy;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      if (src[i + 3] < 250) continue;
      fs2 += evalAt((x - cx) / cx, ny); fn++;
    }
  }
  const fmean = fn ? fs2 / fn : 1;
  const out = Buffer.from(src);
  for (let y = 0; y < h; y++) {
    const ny = (y - cy) / cy;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      if (out[i + 3] < 1) continue;
      const F = evalAt((x - cx) / cx, ny);
      let g = F > 1e-3 ? fmean / F : 1;
      if (g < 1 - CL) g = 1 - CL;
      if (g > 1 + CL) g = 1 + CL;
      for (let c = 0; c < 3; c++) {
        const v = src[i + c] * g;
        out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
      }
    }
  }
  return out;
}
/**
 * The grade: desat toward luma x per-channel tint x level x uniform luma plane.
 * Verbatim from tiles-glacier-regolith-ladder.cjs.
 */
function grade(src, ch, w, h, desat, tint, G, p, q) {
  const out = Buffer.from(src);
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    const ny = (y - cy) / cy;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      if (out[i + 3] < 1) continue;
      const nx = (x - cx) / cx;
      const g = G * (1 + p * nx + q * ny);
      const Lp = desat === 1 ? 0 : L709(src[i], src[i + 1], src[i + 2]);
      for (let c = 0; c < 3; c++) {
        const base = desat === 1 ? src[i + c] : Lp + desat * (src[i + c] - Lp);
        const v = base * tint[c] * g;
        out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
      }
    }
  }
  return out;
}
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
  for (const f of bufs4) {
    bufs.push(await sharp(typeof f === 'string' ? fs.readFileSync(f) : f)
      .resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer());
  }
  const cells = [];
  let mr = 0, mb = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const slot = pick(r, c);
    const x = c * w + (r % 2 ? w / 2 : 0), y = (r * h) / 2;
    cells.push({ input: bufs[slot], left: x, top: y, slot });
    mr = Math.max(mr, x + w); mb = Math.max(mb, y + h);
  }
  const png = await sharp({ create: { width: mr, height: mb, channels: 4, background: BGA } })
    .composite(cells.map(({ input, left, top }) => ({ input, left, top }))).png().toBuffer();
  return { png, cells, w: mr, h: mb, tw: w, th: h };
}
async function vacuum(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  for (let p = 0; p < info.width * info.height; p++) {
    for (let c = 0; c < 3; c++) data[p * ch + c] = Math.round(data[p * ch + c] * (1 - VAC_A) + VAC_RGB[c] * VAC_A);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: ch } }).png().toBuffer();
}
async function lumaOf(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, w = info.width, h = info.height;
  const L = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) L[p] = L709(data[p * ch], data[p * ch + 1], data[p * ch + 2]);
  return { L, w, h };
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
  const mx = TW, my = TH;
  for (let y = my; y < h - my; y++) for (let x = mx; x < w - mx; x++) {
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
  for (let k = 0; k < 4 * NB; k++) {
    if (n[k] < 2) continue;
    wss += s2[k] - (s1[k] * s1[k]) / n[k]; wdf += n[k] - 1;
  }
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
  let Sw = 0, Su = 0, Sv = 0, Suu = 0, Svv = 0, Suv = 0, Sl = 0, Slu = 0, Slv = 0;
  for (let bu = 0; bu < BINS; bu++) for (let bv = 0; bv < BINS; bv++) {
    const b = bu * BINS + bv; if (cn[b] <= 0) continue;
    const du = (bu + 0.5) / BINS - 0.5, dv = (bv + 0.5) / BINS - 0.5;
    const ww = cn[b], lv = cs[b] / cn[b];
    Sw += ww; Su += ww * du; Sv += ww * dv; Suu += ww * du * du; Svv += ww * dv * dv;
    Suv += ww * du * dv; Sl += ww * lv; Slu += ww * lv * du; Slv += ww * lv * dv;
  }
  const sol = solveLin([[Sw, Su, Sv], [Su, Suu, Suv], [Sv, Suv, Svv]], [Sl, Slu, Slv]);
  return {
    BINS, mean: cm, sdWithin: Math.sqrt(varWithin),
    gridCoh, gridTot, gridSlot, rampPP: Math.abs(sol[1]) + Math.abs(sol[2]),
    ratio: Math.sqrt(varWithin) > 0 ? gridTot / Math.sqrt(varWithin) : 0,
  };
}
function boundaryStep(F) {
  const { L, w, h, cells, tw: W, th: H } = F;
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
function label(t, w, size, fill) {
  size = size || 13; fill = fill || '#c9d1d9';
  const esc = String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + (size + 7) + '">' +
    '<text xml:space="preserve" x="4" y="' + (size + 1) + '" font-family="monospace" font-size="' +
    size + '" fill="' + fill + '">' + esc + '</text></svg>');
}
module.exports = {
  sharp, L709, WEBP, BGA, PLAY_W, PLAY_H, VAC_A, VAC_RGB,
  statsRaw, statsOf, groundP70, microContrast, rimHalo, solveLin, mulberry32,
  polyTerms, flatten, grade,
  isoField, vacuum, lumaOf, gridMetrics, boundaryStep, label,
};
