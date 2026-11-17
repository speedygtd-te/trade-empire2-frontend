/**
 * FROZEN_LAKE -- STEP 3b: ROUTE CHOICE + THE GRADE LADDER.
 *
 * Rudi's three decisions are already made and are hard-coded here:
 *   1. tiltY 0.0 / tiltX 0.0. frozen_lake BREAKS the ICE family's 3.0 on purpose:
 *      on a smooth tile the per-tile ramp is most of the seam, and it does not
 *      land in the stamp component -- it alternates with the flop of slots 2/3,
 *      so it reads as a QUILT, which is worse than a stamp.
 *   2. B/R is searched in 1.45-1.60, not at 1.35 -- snow_peak already sits at
 *      B/R 1.32 / L 44.7 and 1.35 would land on top of it. The frozen_lake being
 *      replaced sat at L 60.8 / B/R 1.84, so the corpus has carried bluer.
 *   3. Level above glacier's 44: the band 48-54 is searched.
 *
 * WHAT THIS SCRIPT DECIDES
 *   (a) ROUTE. Two ways to get four slots out of a motif that has no forms:
 *         FLUX   -- three fresh flux returns off the SAME frozen plate and the
 *                   SAME frozen sentence, three new seeds (step 3a).
 *         OFFSET -- four windows cut at four offsets out of the ONE hero return.
 *       Both are built at the mid rung and measured against each other on what
 *       matters for a grain: inter-slot NCC, micro8 and its spread, seam ratio,
 *       grid_play/coh.
 *   (b) THE RUNG. 3 levels x 3 blues, every rung measured on the WRITTEN .webp.
 *
 * THE METRIC THAT DECIDES HERE IS THE SEAM RATIO, NOT grid_play. On a tile this
 *   smooth grid_play scores well by having nothing at all; what is actually
 *   visible on a blank field is the DIAMOND EDGE. step/rough is that edge over
 *   the tile's own roughness at the same stride. The hero measured 1.01 raw --
 *   the best in the corpus -- and that has to survive the grade.
 *
 * SLOT / MIRROR CONVENTION, read off the shipped family, not invented here.
 *   Masked mean-centred NCC of every shipped ICE biome, slot against slot in all
 *   four orientations, says slots 2 and 3 are the FLOP (left<->right) of slots
 *   0 and 1: tundra 0.66-0.90, permafrost 0.52-0.76, snow_peak 0.82-0.96,
 *   ice_shelf 0.83-0.95 on 'flop', 0.00-0.03 on every other orientation. Never
 *   .flip -- that would invert the upper-left lighting. (glacier and crevasse
 *   carry an older rot180 convention inherited from their regolith origin; the
 *   flop is the newer and the majority one, and snow-peak-4slot-build.cjs states
 *   it outright.)
 *   So slot0 = W0, slot1 = W1, slot2 = flop(W2), slot3 = flop(W3), and the
 *   mirroring is PROVEN by NCC of each written slot against its own pre-mirror
 *   window in all four orientations -- at tiltX 0 the light-ramp sign is useless.
 *
 * Writes only into assets/style-test/tiles/frozen_lake/ and
 * assets/style-test/tiles/_frozen_lake_*. NOTHING into src/assets/tiles/.
 *
 * Usage: node scripts/tiles-frozen-lake-ladder.cjs
 *        ROUTE=offset node scripts/tiles-frozen-lake-ladder.cjs   (force a route)
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const WORK = path.join(ST, 'frozen_lake');
const HERO = path.join(WORK, 'hero');
const LAD = path.join(WORK, 'ladder');
const TAG = '_frozen_lake_';

const TILE_W = 512, TILE_H = 256;
const PW = 768, PH = 512;
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const K_CORPUS = 0.60;
const SOLVE_PASSES = 7;
const TILT_Y = 0.0, TILT_X = 0.0;       // decision 1
const LEVELS = [48, 51, 54];            // decision 3
const BLUES = [1.45, 1.52, 1.60];       // decision 2
const MID = { L: 51, br: 1.52 };

const VAC_A = 0.45, VAC_RGB = [5, 10, 25];
const PLAY_W = 48, PLAY_H = 24;
const FLOP = [false, false, true, true];

/**
 * THE FOUR WINDOWS OF THE OFFSET ROUTE.
 * Slot 0 is the CENTRED window -- the exact tile Rudi judged the hero on, kept
 * as slot 0 unchanged. The other three take three corners of the 224 px offset
 * range so the pairwise separations are (112,112) to the centre and (224,224) /
 * (224,0) / (0,224) between the corners. Windows overlap in plate pixels, but a
 * shared pixel lands at a DIFFERENT position inside the diamond in each window,
 * which for a formless grain is not a visible repeat -- inter-slot NCC below is
 * the proof, not the assumption.
 */
const MARG = 16;
const OFFS = [[(PW - TILE_W) / 2, (PH - TILE_H) / 2], [MARG, MARG],
  [PW - TILE_W - MARG, PH - TILE_H - MARG], [PW - TILE_W - MARG, MARG]];

const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);

// ==========================================================================
// diamond + window cutting
// ==========================================================================
const DIAMOND = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + TILE_W + '" height="' + TILE_H + '">' +
  '<polygon points="' + TILE_W / 2 + ',0 ' + TILE_W + ',' + TILE_H / 2 + ' ' +
  TILE_W / 2 + ',' + TILE_H + ' 0,' + TILE_H / 2 + '" fill="white"/></svg>');
let DMASK = null;
async function diamondMask() {
  if (!DMASK) {
    // RGBA, alpha = the diamond. A greyscale png has NO alpha and 'dest-in'
    // multiplies by alpha, so a grey mask is a silent no-op.
    const g = await sharp(DIAMOND).greyscale().raw().toBuffer({ resolveWithObject: true });
    const w = g.info.width, h = g.info.height, ch = g.info.channels;
    const m = Buffer.alloc(w * h * 4);
    for (let p = 0; p < w * h; p++) { m[p * 4] = 255; m[p * 4 + 1] = 255; m[p * 4 + 2] = 255; m[p * 4 + 3] = g.data[p * ch]; }
    DMASK = await sharp(m, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  }
  return DMASK;
}
async function cutWindow(plate768, ox, oy) {
  const flat = await sharp(plate768).extract({ left: Math.round(ox), top: Math.round(oy), width: TILE_W, height: TILE_H })
    .removeAlpha().png().toBuffer();
  const masked = await sharp(flat).ensureAlpha()
    .composite([{ input: await diamondMask(), blend: 'dest-in' }]).png().toBuffer();
  const r = await sharp(masked).raw().toBuffer({ resolveWithObject: true });
  return { data: r.data, info: r.info, png: masked };
}

// ==========================================================================
// measurement -- verbatim from tiles-frozen-lake-candidates.cjs
// ==========================================================================
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
  let cr = 0, cn2 = 0;
  for (let i = 0; i < data.length; i += ch) {
    if (data[i + 3] < 8) continue;
    const r = data[i] / im[0], g = data[i + 1] / im[1], b = data[i + 2] / im[2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 0) cr += (mx - mn) / mx;
    cn2++;
  }
  return {
    chromaRes: cn2 ? cr / cn2 : 0,
    lum: L709(m[0], m[1], m[2]), intLum: L709(im[0], im[1], im[2]), rgb: im,
    br: im[2] / im[0], gr: im[1] / im[0],
    sd: (isd[0] + isd[1] + isd[2]) / 3,
    p99: q(0.99),
    blow: lv.length ? lv.filter((v) => v >= 200).length / lv.length : 0,
    tiltX: half.l / hn.l - half.r / hn.r, tiltY: half.t / hn.t - half.b / hn.b,
  };
}
async function statsOf(file) {
  const r = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
async function rimHalo(file) {
  const r = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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

// ==========================================================================
// the grade: hue gains x level gain x uniform luma plane. No flatten.
// ==========================================================================
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
/** solve against the WRITTEN webp -- libwebp drops RGB under alpha 0 and the
 *  diamond corners are ~50% of the canvas, so buffer numbers drift by ~+1.5 */
async function solveTile(S, W, H, CH, outFile, LT, BRT, GRT) {
  const b0 = statsRaw(S, CH, W, H);
  const tint = [1, (GRT * b0.rgb[0]) / b0.rgb[1], (BRT * b0.rgb[0]) / b0.rgb[2]];
  let G = LT / b0.lum, p = 0, q = 0;
  const t00 = statsRaw(grade(S, CH, W, H, tint, G, 0, 0), CH, W, H);
  const tP = statsRaw(grade(S, CH, W, H, tint, G, 0.2, 0), CH, W, H);
  const tQ = statsRaw(grade(S, CH, W, H, tint, G, 0, 0.2), CH, W, H);
  const Kx = (tP.tiltX - t00.tiltX) / 0.2 || 1, Ky = (tQ.tiltY - t00.tiltY) / 0.2 || 1;
  let m = null, png = null;
  for (let pass = 0; pass < SOLVE_PASSES; pass++) {
    png = await writeTile(grade(S, CH, W, H, tint, G, p, q), W, H, CH, outFile);
    m = await statsOf(outFile);
    if (pass === SOLVE_PASSES - 1) break;
    G *= LT / m.lum;
    tint[2] *= BRT / m.br;
    tint[1] *= GRT / m.gr;
    p += (TILT_X - m.tiltX) / Kx;
    q += (TILT_Y - m.tiltY) / Ky;
  }
  m.png = png;
  return m;
}

// ==========================================================================
// fields, grid index, seam -- verbatim from the candidate ladder
// ==========================================================================
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
    for (let r = 0; r < n; r++) { if (r === i) continue; const f = M[r][i]; if (f === 0) continue; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]; }
  }
  return M.map((row) => row[n]);
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
  let wss = 0, wdf = 0, tot = 0;
  for (let k = 0; k < 4 * NB; k++) { if (n[k] < 2) continue; wss += s2[k] - (s1[k] * s1[k]) / n[k]; wdf += n[k] - 1; tot += n[k]; }
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
  const rampPP = Math.abs(sol[1]) + Math.abs(sol[2]);
  return { sdWithin: Math.sqrt(varWithin), gridCoh: gridCoh, gridTot: gridTot, gridSlot: gridSlot, rampPP: rampPP,
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

// ==========================================================================
// masked mean-centred NCC in all four orientations
// ==========================================================================
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

// ==========================================================================
(async () => {
  fs.mkdirSync(LAD, { recursive: true });

  // ---- the neighbours, read only ----------------------------------------
  const NEIGH = [];
  for (const fam of ['glacier', 'crevasse', 'tundra', 'permafrost', 'ice_shelf', 'snow_peak', 'frozen_lake']) {
    const dir = path.join(TILES, fam);
    if (!fs.existsSync(dir)) continue;
    let L = 0, br = 0, gr = 0, mi = 0, nn = 0;
    for (let n = 0; n < 4; n++) {
      const f = path.join(dir, fam + '_' + n + '.webp');
      if (!fs.existsSync(f)) continue;
      const s = await statsOf(f);
      L += s.lum; br += s.br; gr += s.gr;
      mi += await microContrast(path.join(dir, fam + '_' + n + '@eighth.webp'));
      nn++;
    }
    if (nn) NEIGH.push({ id: fam, lum: L / nn, br: br / nn, gr: gr / nn, micro: mi / nn });
  }
  console.log('[neighbours -- src/assets/tiles, READ ONLY]');
  for (const nb of NEIGH) console.log('   ' + nb.id.padEnd(12) + ' L ' + f1(nb.lum).padStart(5) + '  B/R ' + f2(nb.br) + '  G/R ' + f2(nb.gr) + '  micro8 ' + f2(nb.micro));
  console.log('');

  // ---- the plates: flux' 1248x832 return goes BACK DOWN to 768x512 -------
  const toPlate = async (file) => {
    const buf = fs.readFileSync(file);
    const md = await sharp(buf).metadata();
    return (md.width === PW && md.height === PH) ? buf
      : await sharp(buf).resize(PW, PH, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  };
  const heroPlate = await toPlate(path.join(HERO, 'HERO_R3-GRAIN_kraw_FROZEN.png'));
  const derivPlates = [];
  for (const t of ['D1', 'D2', 'D3']) {
    const f = path.join(HERO, t + '_kraw.png');
    derivPlates.push(fs.existsSync(f) ? await toPlate(f) : null);
  }
  const haveFlux = derivPlates.every((p) => p);
  console.log('[plates] hero + ' + derivPlates.filter(Boolean).length + '/3 flux derivations');

  const HC = [(PW - TILE_W) / 2, (PH - TILE_H) / 2];

  /** the four PRE-MIRROR windows of a route, in slot order */
  async function windowsOf(route) {
    const out = [];
    for (let n = 0; n < 4; n++) {
      if (route === 'flux') out.push(await cutWindow(n === 0 ? heroPlate : derivPlates[n - 1], HC[0], HC[1]));
      else out.push(await cutWindow(heroPlate, OFFS[n][0], OFFS[n][1]));
    }
    return out;
  }
  /** graded slots of a route at one rung; slots 2/3 flopped AFTER the grade */
  async function buildRung(route, LT, BRT, dir) {
    fs.mkdirSync(dir, { recursive: true });
    const GRT = 1 + K_CORPUS * (BRT - 1);
    const pre = await windowsOf(route);
    const slots = [];
    for (let n = 0; n < 4; n++) {
      const preFile = path.join(dir, 'pre_' + n + '.webp');
      const m = await solveTile(pre[n].data, pre[n].info.width, pre[n].info.height, pre[n].info.channels, preFile, LT, BRT, GRT);
      const file = path.join(dir, 'frozen_lake_' + n + '.webp');
      const png = FLOP[n] ? await sharp(m.png).flop().png().toBuffer() : m.png;
      await sharp(png).webp(WEBP).toFile(file);
      await sharp(png).resize(64, 32, { fit: 'fill' }).webp(WEBP).toFile(file.replace(/\.webp$/, '@eighth.webp'));
      fs.writeFileSync(path.join(dir, 'frozen_lake_' + n + '.png'), png);
      const s = await statsOf(file);
      s.micro = await microContrast(file.replace(/\.webp$/, '@eighth.webp'));
      s.rim = await rimHalo(file);
      s.png = png; s.file = file; s.prePng = m.png;
      slots.push(s);
    }
    const g = await gridOf(slots.map((s) => s.png));
    return { slots: slots, grid: g, GRT: GRT, L: LT, br: BRT, route: route, dir: dir };
  }
  const av = (R, k) => R.slots.reduce((a, x) => a + x[k], 0) / 4;

  // ======================================================================
  // (a) ROUTE CHOICE, at the mid rung
  // ======================================================================
  const ROUTES = haveFlux ? ['flux', 'offset'] : ['offset'];
  const routeRes = {};
  console.log('\n[route choice] mid rung L ' + MID.L + '  B/R ' + f2(MID.br) + '  tiltY ' + f1(TILT_Y) + ' / tiltX ' + f1(TILT_X));
  for (const r of ROUTES) {
    const R = await buildRung(r, MID.L, MID.br, path.join(LAD, 'route_' + r));
    let mx = 0, sum = 0, cnt = 0;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const v = Math.abs((await nccAll(R.slots[i].prePng, R.slots[j].prePng)).id);
      mx = Math.max(mx, v); sum += v; cnt++;
    }
    R.nccMax = mx; R.nccMean = sum / cnt;
    const mi = R.slots.map((s) => s.micro);
    R.microMean = mi.reduce((a, b) => a + b) / 4;
    R.microSpread = Math.max.apply(null, mi) - Math.min.apply(null, mi);
    const sds = R.slots.map((s) => s.sd);
    R.sdSpread = Math.max.apply(null, sds) - Math.min.apply(null, sds);
    routeRes[r] = R;
    console.log('   ' + r.toUpperCase().padEnd(7) +
      ' micro8 ' + f2(R.microMean) + ' (spread ' + f2(R.microSpread) + ')  sd spread ' + f2(R.sdSpread) +
      '   inter-slot NCC max ' + f3(R.nccMax) + ' mean ' + f3(R.nccMean) +
      '   grid_play ' + f2(R.grid.play.gridTot) + ' coh ' + f2(R.grid.play.gridCoh) +
      '   seam ' + f2(R.grid.bs.step) + '/' + f2(R.grid.bs.rough) + ' ratio ' + f2(R.grid.bs.ratio));
    // side-by-side of the four slots of this route, for the eye
    const cmp = [];
    for (let n = 0; n < 4; n++) cmp.push({ input: await sharp(R.slots[n].png).resize(512, 256, { fit: 'fill' }).png().toBuffer(), left: n * 520, top: 0 });
    fs.writeFileSync(path.join(ST, TAG + 'ROUTE_' + r + '.png'),
      await sharp({ create: { width: 4 * 520, height: 256, channels: 4, background: BGA } }).composite(cmp).png().toBuffer());
  }
  let ROUTE = process.env.ROUTE || null;
  if (!ROUTE) {
    if (!haveFlux) ROUTE = 'offset';
    else {
      const a = routeRes.flux, b = routeRes.offset;
      ROUTE = (a.grid.bs.ratio <= b.grid.bs.ratio + 0.05 && a.microSpread <= b.microSpread + 0.30) ? 'flux' : 'offset';
    }
  }
  console.log('   -> ROUTE: ' + ROUTE.toUpperCase() + (process.env.ROUTE ? ' (forced)' : '') + '\n');

  // ======================================================================
  // (b) THE LADDER
  // ======================================================================
  const rungs = [];
  for (const LT of LEVELS) for (const BRT of BLUES) {
    const id = 'L' + LT + 'B' + String(Math.round(BRT * 100));
    const R = await buildRung(ROUTE, LT, BRT, path.join(LAD, id));
    R.id = id;
    rungs.push(R);
    console.log('[' + id + '] L ' + f1(av(R, 'lum')) + '  B/R ' + f3(av(R, 'br')) + '  G/R ' + f3(av(R, 'gr')) +
      '  micro8 ' + f2(av(R, 'micro')) + '  blow ' + f3(100 * av(R, 'blow')) + '%' +
      '  p99 ' + f1(av(R, 'p99')) + '  rim ' + f2(av(R, 'rim')).padStart(6) +
      '   grid_play ' + f2(R.grid.play.gridTot) + ' coh ' + f2(R.grid.play.gridCoh) +
      '   seam ' + f2(R.grid.bs.step) + '/' + f2(R.grid.bs.rough) + ' RATIO ' + f2(R.grid.bs.ratio));
  }
  const midR = rungs.find((r) => r.L === MID.L && Math.abs(r.br - MID.br) < 1e-6);

  // ---- the mirror proof --------------------------------------------------
  console.log('\n[mirror proof] each WRITTEN slot vs its own PRE-MIRROR window, all four orientations (rung ' + midR.id + ')');
  for (let n = 0; n < 4; n++) {
    const v = await nccAll(fs.readFileSync(midR.slots[n].file), midR.slots[n].prePng);
    console.log('   slot' + n + ' (' + (FLOP[n] ? 'flopped' : 'as cut ') + '):  id ' + f3(v.id) + '   flop ' + f3(v.flop) + '   flip ' + f3(v.flip) + '   r180 ' + f3(v.r180));
  }
  console.log('\n[inter-slot NCC] the four written slots against each other, identity orientation');
  for (let i = 0; i < 4; i++) {
    const row = [];
    for (let j = 0; j < 4; j++) row.push(i === j ? ' 1.000' : f3((await nccAll(fs.readFileSync(midR.slots[i].file), fs.readFileSync(midR.slots[j].file))).id).padStart(6));
    console.log('   slot' + i + '  ' + row.join(' '));
  }

  // ---- pair distances ----------------------------------------------------
  console.log('\n[pair distances -- DIAGNOSTIC, NOT A GATE]');
  for (const fam of ['glacier', 'crevasse', 'permafrost', 'tundra', 'ice_shelf', 'snow_peak']) {
    const nb = NEIGH.find((n) => n.id === fam); if (!nb) continue;
    console.log('   ' + fam.padEnd(12) + ' dL ' + ((av(midR, 'lum') - nb.lum >= 0 ? '+' : '') + f1(av(midR, 'lum') - nb.lum)).padStart(6) +
      '   dB/R ' + ((av(midR, 'br') - nb.br >= 0 ? '+' : '') + f2(av(midR, 'br') - nb.br)).padStart(6) +
      '   micro ratio ' + f2(av(midR, 'micro') / (nb.micro || 1e-6)));
  }

  // ---- sheets ------------------------------------------------------------
  const sheetFor = async (R, name) => {
    const SW = 2200, PAD = 18;
    const comp = []; let y = PAD;
    const ln = (t, size, fill) => { size = size || 13; comp.push({ input: label(t, SW - PAD * 2, size, fill || '#c9d1d9'), left: PAD, top: y }); y += size + 7; };
    ln('frozen_lake  ' + R.id + '   route ' + R.route.toUpperCase() + '   tiltY ' + f1(TILT_Y) + ' / tiltX ' + f1(TILT_X), 19, '#7ee787');
    ln('L ' + f1(av(R, 'lum')) + '  B/R ' + f3(av(R, 'br')) + '  G/R ' + f3(av(R, 'gr')) + '  micro8 ' + f2(av(R, 'micro')) +
      '  blowout ' + f3(100 * av(R, 'blow')) + '%  rim ' + f2(av(R, 'rim')) +
      '   grid_play ' + f2(R.grid.play.gridTot) + ' coh ' + f2(R.grid.play.gridCoh) +
      '   seam step/rough ' + f2(R.grid.bs.step) + '/' + f2(R.grid.bs.rough) + ' ratio ' + f2(R.grid.bs.ratio), 14, '#ffa657');
    y += 6;
    ln('THE FOUR SLOTS   (0,1 as cut  |  2,3 flopped)', 15, '#7ee787');
    for (let n = 0; n < 4; n++) comp.push({ input: await sharp(R.slots[n].png).resize(512, 256, { fit: 'fill' }).png().toBuffer(), left: PAD + n * 522, top: y });
    y += 256 + 10;
    ln('2x2 -- slots 0..3 laid in the iso lattice in a fixed 2x2 repeat, full res', 15, '#7ee787');
    const F22 = await isoField(R.slots.map((s) => s.png), TILE_W, TILE_H, 6, 4, (r, c) => (r % 2) * 2 + (c % 2));
    let sc = Math.min(1, (SW - PAD * 2) / F22.w);
    comp.push({ input: await sharp(F22.png).resize(Math.round(F22.w * sc), Math.round(F22.h * sc)).png().toBuffer(), left: PAD, top: y });
    y += Math.round(F22.h * sc) + 12;
    ln('INTERLOCKED MOSAIC -- random slots, full res', 15, '#7ee787');
    const rndF = mulberry32(90210);
    const FD = await isoField(R.slots.map((s) => s.png), TILE_W, TILE_H, 6, 4, () => Math.floor(rndF() * 4));
    sc = Math.min(1, (SW - PAD * 2) / FD.w);
    comp.push({ input: await sharp(FD.png).resize(Math.round(FD.w * sc), Math.round(FD.h * sc)).png().toBuffer(), left: PAD, top: y });
    y += Math.round(FD.h * sc) + 12;
    ln('PLAY SCALE 48x24 (zoom 1.0)      |      the same under the VACUUM darkening rgba(5,10,25,0.45)', 15, '#7ee787');
    const rndP = mulberry32(90210);
    const PD = await isoField(R.slots.map((s) => s.png), PLAY_W, PLAY_H, 40, 22, () => Math.floor(rndP() * 4));
    comp.push({ input: PD.png, left: PAD, top: y });
    comp.push({ input: await vacuum(PD.png), left: PAD + PD.w + 24, top: y });
    y += PD.h + PAD;
    const f = path.join(ST, TAG + name + '.png');
    fs.writeFileSync(f, await sharp({ create: { width: SW, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[sheet] ' + path.basename(f));
  };

  // ---- the ladder overview ----------------------------------------------
  {
    const SW = 2200, PAD = 18;
    const comp = []; let y = PAD;
    const ln = (t, size, fill) => { size = size || 13; comp.push({ input: label(t, SW - PAD * 2, size, fill || '#c9d1d9'), left: PAD, top: y }); y += size + 7; };
    ln('FROZEN_LAKE -- GRADE LADDER ON THE R3-GRAIN HERO   route ' + ROUTE.toUpperCase() + '   tiltY 0.0 / tiltX 0.0', 20, '#79c0ff');
    ln('STYLE TEST. Measured on the WRITTEN .webp (libwebp, +1.5 offset). sharp.cache(false). Nothing written to src/assets/tiles/. ' + new Date().toISOString().slice(0, 16), 13, '#8b949e');
    y += 6;
    if (haveFlux) {
      ln('ROUTE COMPARISON at L ' + MID.L + ' / B/R ' + f2(MID.br), 16, '#ffa657');
      ln('   route     micro8  spread  sd spr   NCC max  NCC mean   grid_play   coh    seam step  rough   RATIO', 13, '#8b949e');
      for (const r of ROUTES) { const R = routeRes[r];
        ln('   ' + r.padEnd(9) + f2(R.microMean).padStart(6) + f2(R.microSpread).padStart(8) + f2(R.sdSpread).padStart(8) +
          f3(R.nccMax).padStart(10) + f3(R.nccMean).padStart(10) + f2(R.grid.play.gridTot).padStart(12) + f2(R.grid.play.gridCoh).padStart(7) +
          f2(R.grid.bs.step).padStart(11) + f2(R.grid.bs.rough).padStart(7) + f2(R.grid.bs.ratio).padStart(8), 13, r === ROUTE ? '#7ee787' : '#8b949e'); }
      y += 6;
    }
    ln('THE LADDER -- 3 levels x 3 blues', 16, '#ffa657');
    ln('   rung        L     B/R    G/R  micro8   blow%    p99     rim   grid_play  coh    seam step  rough  RATIO', 13, '#8b949e');
    for (const R of rungs) {
      ln('   ' + R.id.padEnd(10) + f1(av(R, 'lum')).padStart(6) + f3(av(R, 'br')).padStart(8) + f3(av(R, 'gr')).padStart(7) +
        f2(av(R, 'micro')).padStart(8) + f3(100 * av(R, 'blow')).padStart(8) + f1(av(R, 'p99')).padStart(7) + f2(av(R, 'rim')).padStart(8) +
        f2(R.grid.play.gridTot).padStart(12) + f2(R.grid.play.gridCoh).padStart(6) + f2(R.grid.bs.step).padStart(11) +
        f2(R.grid.bs.rough).padStart(7) + f2(R.grid.bs.ratio).padStart(7), 13, '#c9d1d9');
    }
    y += 6;
    ln('grid_play/coh BARS: permafrost 2.91/2.51 | new tundra 2.60/2.43 | glacier 5.79/3.22 | crevasse 5.83/3.26 | REJECTED old tundra 10.40/1.12', 13, '#79c0ff');
    ln('SEAM: the hero measured step/rough ratio 1.01 raw, the best in the corpus. That is the number that has to survive the grade.', 13, '#79c0ff');
    y += 8;
    ln('EVERY RUNG AT PLAY SCALE (48x24), interlocked      |      under the vacuum darkening', 16, '#ffa657');
    for (const R of rungs) {
      const rndP = mulberry32(90210);
      const PD = await isoField(R.slots.map((s) => s.png), PLAY_W, PLAY_H, 10, 16, () => Math.floor(rndP() * 4));
      comp.push({ input: label(R.id, 120, 13, '#c9d1d9'), left: PAD, top: y + 4 });
      comp.push({ input: PD.png, left: PAD + 90, top: y });
      comp.push({ input: await vacuum(PD.png), left: PAD + 90 + PD.w + 16, top: y });
      y += PD.h + 8;
    }
    y += PAD;
    const f = path.join(ST, TAG + 'LADDER.png');
    fs.writeFileSync(f, await sharp({ create: { width: SW, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('\n[sheet] ' + path.basename(f));
  }
  for (const R of rungs) if (['L48B152', 'L51B145', 'L51B152', 'L51B160', 'L54B152'].includes(R.id)) await sheetFor(R, R.id);

  // ---- numbers -----------------------------------------------------------
  const txt = [];
  txt.push('frozen_lake LADDER (hero R3-GRAIN) -- ' + new Date().toISOString());
  txt.push('route ' + ROUTE + '   tiltY ' + f1(TILT_Y) + ' / tiltX ' + f1(TILT_X) + '   G/R = 1 + 0.60*(B/R-1)');
  txt.push('');
  for (const nb of NEIGH) txt.push('  neighbour ' + nb.id.padEnd(12) + ' L ' + f1(nb.lum).padStart(5) + '  B/R ' + f2(nb.br) + '  G/R ' + f2(nb.gr) + '  micro8 ' + f2(nb.micro));
  txt.push('');
  if (haveFlux) for (const r of ROUTES) { const R = routeRes[r];
    txt.push('route ' + r.padEnd(7) + ' micro8 ' + f2(R.microMean) + ' spread ' + f2(R.microSpread) + ' sd spread ' + f2(R.sdSpread) +
      '  NCC max ' + f3(R.nccMax) + ' mean ' + f3(R.nccMean) + '  grid_play ' + f2(R.grid.play.gridTot) + ' coh ' + f2(R.grid.play.gridCoh) +
      '  seam ' + f2(R.grid.bs.step) + '/' + f2(R.grid.bs.rough) + ' ratio ' + f2(R.grid.bs.ratio)); }
  txt.push('');
  for (const R of rungs) {
    txt.push(R.id + '   L ' + f1(av(R, 'lum')) + '  B/R ' + f3(av(R, 'br')) + '  G/R ' + f3(av(R, 'gr')) + '  micro8 ' + f2(av(R, 'micro')) +
      '  blow ' + f3(100 * av(R, 'blow')) + '%  p99 ' + f1(av(R, 'p99')) + '  rim ' + f2(av(R, 'rim')) +
      '  grid_play ' + f2(R.grid.play.gridTot) + ' coh ' + f2(R.grid.play.gridCoh) +
      '  seam ' + f2(R.grid.bs.step) + '/' + f2(R.grid.bs.rough) + ' ratio ' + f2(R.grid.bs.ratio));
    for (let n = 0; n < 4; n++) { const s = R.slots[n];
      txt.push('     slot' + n + (FLOP[n] ? ' (flop)' : '      ') + '  L ' + f1(s.lum) + '  B/R ' + f3(s.br) + '  G/R ' + f3(s.gr) +
        '  micro8 ' + f2(s.micro) + '  blow ' + f3(100 * s.blow) + '%  p99 ' + f1(s.p99) + '  rim ' + f2(s.rim) + '  sd ' + f2(s.sd)); }
  }
  fs.writeFileSync(path.join(ST, TAG + 'LADDER.txt'), txt.join('\n') + '\n');
  console.log('[numbers] ' + TAG + 'LADDER.txt');
})();
