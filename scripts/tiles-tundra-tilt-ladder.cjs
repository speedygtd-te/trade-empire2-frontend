/**
 * TUNDRA ITERATION 2, STEP 4 -- THE tiltY LADDER.
 *
 * STYLE TEST ONLY. Writes into assets/style-test/tiles/tundra_iter2/tilt/ and
 * assets/style-test/tiles/_tundra_tilt*.png only. NOTHING is written to
 * src/assets/tiles/. No cap sync, no build, no git.
 *
 * THE QUESTION
 *   The new tundra set is integrated and the colour/level is right, but the
 *   TILE GRID is still readable as a diamond lattice. The mirroring is not the
 *   cause (slots 2/3 are flopped, verified: the brightness centroid tips from
 *   -0.016 to +0.018). The cause is the PER-TILE LIGHT RAMP: every tile is
 *   brighter at the top, tiltY ~ 11.0. A ramp that restarts at every tile is a
 *   sawtooth, and a sawtooth has a hard step at every tile boundary.
 *
 *   So: four complete four-slot sets at tiltY 11 / 8 / 5 / 0, plus a fifth at
 *   tiltY 0 AND tiltX 0, because a tile with a pure side-ramp and no top-light
 *   may look stranger than a flat one. Everything else held: level 30.8,
 *   B/R 0.82, G/R from the tundra k-curve, tiltX +-4.1 with the sign flip on
 *   the flopped slots. Same uniform luma plane g(x,y)=G*(1+p*nx+q*ny), same
 *   solve loop, same file-measured targets, sharp.cache(false), no
 *   divide-by-blur equalization.
 *
 * THE NUMBERS THAT DECIDE IT
 *
 *  (1) BOUNDARY STEP / INTERIOR ROUGHNESS -- the metric the predecessor used
 *      (new 1.24, shipped 1.45). Mean |dL| across a tile edge at +-4 px in the
 *      real interlocking layout, over the tile's own roughness at the same 8 px
 *      stride. This is the SHARPNESS of the seam.
 *
 *  (2) RIM HALO -- mean luma 1-4 px inside the diamond boundary minus 10-24 px
 *      inside. Must not go positive; a global plane has no local term so it
 *      should stay ~0 at every rung.
 *
 *  (3) GRID INDEX -- new, and the actual target quantity. See the long comment
 *      on gridMetrics() below for the derivation. Short version: fold the whole
 *      tessellated field onto ONE tile through the exact iso lattice and
 *      average. Anything that repeats with the tile survives the average;
 *      texture decays as 1/sqrt(N). The standard deviation of that
 *      phase-averaged tile IS the amplitude of the visible lattice, in luma
 *      units.
 *
 *      Why not "std of tile MEANS over a grid of positions" (the obvious first
 *      idea): a ramp is zero-mean by construction, so it does not move the tile
 *      mean at all. Tile-mean spread is blind to exactly the defect at issue --
 *      it measures patchwork (slot level differences), not the sawtooth. It is
 *      still reported, as slotL_sd, because patchwork is a second, independent
 *      failure mode.
 *
 *  (4) PLASTICITY, the counter-quantity: ramp_pp, the peak-to-peak of the plane
 *      fitted to the phase-averaged tile, in luma units. Micro-contrast is the
 *      wrong instrument here -- it measures the TEXTURE, which the plane does
 *      not touch, so it is flat across the whole ladder by construction.
 *
 * Fields are measured at FULL RES and at PLAY SCALE (48x24 CSS px = zoom 1.0,
 * the build view per detailTier.ts), and once more under the VACUUM DARKENING
 * (rgba(5,10,25,0.45) source-over, ATMOSPHERE_TERRAIN_DARKEN_MAX at density 0),
 * because ice moons are airless and the darkening compresses the luma range.
 *
 * Usage: node scripts/tiles-tundra-tilt-ladder.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const WORK = path.join(ST, 'tundra_iter2');
const SRCD = path.join(WORK, 'src');
const HEROD = path.join(WORK, 'hero');
const VARD = path.join(WORK, 'var');
const TILT = path.join(WORK, 'tilt');

const TILE_W = 512, TILE_H = 256;
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// ---- held targets (identical to tiles-tundra-hero-variants.cjs) ------------
const HOLD_LUM = 30.8, BR_T = 0.82;
const K_TUNDRA = 0.467, BR_TUNDRA = 0.55, K_CORPUS = 0.60, BR_CORPUS = 1.18;
const kFor = (br) => K_TUNDRA + (K_CORPUS - K_TUNDRA) * ((br - BR_TUNDRA) / (BR_CORPUS - BR_TUNDRA));
const GR_T = 1 + kFor(BR_T) * (BR_T - 1);
const SOLVE_PASSES = 6;

// ---- vacuum darkening, from src/views/grid/isoConstants.ts -----------------
const VAC_A = 0.45, VAC_RGB = [5, 10, 25];

// ---- play scale: zoom 1.0 build view is a 48x24 CSS px tile (detailTier.ts) -
const PLAY_W = 48, PLAY_H = 24;

const STAGES = [
  { id: 'SHIPPED', label: 'SHIPPED tundra (pre-iteration)', ref: SRCD, refPat: 'tundra_$_src.webp', col: '#ff7b72' },
  { id: 'PROD', label: 'NEW set as integrated (tiltY 11)', ref: path.join(TILES, 'tundra'), refPat: 'tundra_$.webp', col: '#d2a8ff' },
  { id: 'T110', label: 'rung  tiltY 11.0  tiltX 4.1', tiltY: 11.0, tiltX: 4.1, col: '#7ee787' },
  { id: 'T080', label: 'rung  tiltY  8.0  tiltX 4.1', tiltY: 8.0, tiltX: 4.1, col: '#7ee787' },
  { id: 'T050', label: 'rung  tiltY  5.0  tiltX 4.1', tiltY: 5.0, tiltX: 4.1, col: '#7ee787' },
  { id: 'T000', label: 'rung  tiltY  0.0  tiltX 4.1', tiltY: 0.0, tiltX: 4.1, col: '#79c0ff' },
  { id: 'T000F', label: 'rung  tiltY  0.0  tiltX 0.0 (flat)', tiltY: 0.0, tiltX: 0.0, col: '#79c0ff' },
  // The tiltX ramp does NOT cancel visually just because slots 2/3 are flopped:
  // the flop turns a coherent side-ramp into an ALTERNATING one, which reads as
  // a vertical quilt instead of a horizontal one. It therefore has to come off
  // together with tiltY -- and once it is off, more tiltY is affordable again.
  // These two rungs test exactly that combination.
  { id: 'T050X0', label: 'rung  tiltY  5.0  tiltX 0.0', tiltY: 5.0, tiltX: 0.0, col: '#ffa657' },
  { id: 'T030X0', label: 'rung  tiltY  3.0  tiltX 0.0', tiltY: 3.0, tiltX: 0.0, col: '#ffa657' },
];

const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);

// ══════════════════════════════════════════════════════════════════════
// measurement, always on the WRITTEN file (libwebp drops RGB under alpha 0
// and the diamond corners are ~50% of the canvas -> buffer numbers drift +1.5)
// ══════════════════════════════════════════════════════════════════════
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
  return {
    lum: L709(m[0], m[1], m[2]), intLum: L709(im[0], im[1], im[2]), rgb: im,
    br: im[2] / im[0], gr: im[1] / im[0],
    sd: (isd[0] + isd[1] + isd[2]) / 3, sat: sat / ni,
    blow: lv.length ? lv.filter((v) => v >= 200).length / lv.length : 0,
    tiltX: half.l / hn.l - half.r / hn.r, tiltY: half.t / hn.t - half.b / hn.b,
  };
}
async function statsOf(file) {
  const { data, info } = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return statsRaw(data, info.channels, info.width, info.height);
}
/**
 * Texture roughness at play scale. Normally read off the @eighth sibling; when
 * that sibling does not exist (the frozen SHIPPED sources have none) it is
 * derived from the full-res file with the same 64x32 resize the mip bake uses,
 * so the row carries a real number instead of a 0.00 that reads like "flat".
 */
async function microContrast(file, fallbackFull) {
  let buf;
  if (fs.existsSync(file)) buf = fs.readFileSync(file);
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
/** rim band 1-4px inside the diamond vs 10-24px inside */
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

// ══════════════════════════════════════════════════════════════════════
// the grade: hue gains x level gain x uniform luma plane
// ══════════════════════════════════════════════════════════════════════
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
async function solveTile(baseFile, outFile, tiltXT, tiltYT) {
  const raw = await sharp(fs.readFileSync(baseFile)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const S = raw.data, CH = raw.info.channels, W = raw.info.width, H = raw.info.height;
  const b0 = statsRaw(S, CH, W, H);
  const tint = [1, (GR_T * b0.rgb[0]) / b0.rgb[1], (BR_T * b0.rgb[0]) / b0.rgb[2]];
  let G = HOLD_LUM / b0.lum, p = 0, q = 0;
  const t00 = statsRaw(grade(S, CH, W, H, tint, G, 0, 0), CH, W, H);
  const tP = statsRaw(grade(S, CH, W, H, tint, G, 0.2, 0), CH, W, H);
  const tQ = statsRaw(grade(S, CH, W, H, tint, G, 0, 0.2), CH, W, H);
  const Kx = (tP.tiltX - t00.tiltX) / 0.2, Ky = (tQ.tiltY - t00.tiltY) / 0.2;
  let m = null;
  const eighth = outFile.replace(/\.webp$/, '@eighth.webp');
  for (let pass = 0; pass < SOLVE_PASSES; pass++) {
    const buf = grade(S, CH, W, H, tint, G, p, q);
    const png = await sharp(buf, { raw: { width: W, height: H, channels: CH } }).png().toBuffer();
    await sharp(png).webp(WEBP).toFile(outFile);
    await sharp(png).resize(64, 32, { fit: 'fill' }).webp(WEBP).toFile(eighth);
    m = await statsOf(outFile);
    if (pass === SOLVE_PASSES - 1) { m.png = png; m.plane = { p, q, G }; break; }
    G *= HOLD_LUM / m.lum;
    tint[2] *= BR_T / m.br;
    tint[1] *= GR_T / m.gr;
    p += (tiltXT - m.tiltX) / Kx;
    q += (tiltYT - m.tiltY) / Ky;
  }
  return m;
}

// ══════════════════════════════════════════════════════════════════════
// fields
// ══════════════════════════════════════════════════════════════════════
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** the layout PlanetSurface uses: rows offset by half a tile, stepping h/2 */
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
/** vacuum darkening exactly as PlanetSurface does it: rgba(5,10,25,0.45) over */
async function vacuum(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  for (let p = 0; p < info.width * info.height; p++) {
    for (let c = 0; c < 3; c++) {
      data[p * ch + c] = Math.round(data[p * ch + c] * (1 - VAC_A) + VAC_RGB[c] * VAC_A);
    }
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

// ══════════════════════════════════════════════════════════════════════
// (3) THE GRID INDEX -- lattice fold of the tessellated field
// ══════════════════════════════════════════════════════════════════════
//
// The iso layout puts tile origins at (c*W + (r%2)*W/2, r*H/2). Change to
// lattice coordinates
//     u = (x/(W/2) + y/(H/2)) / 2      v = (x/(W/2) - y/(H/2)) / 2
// Then dx/(W/2) = du+dv and dy/(H/2) = du-dv, so the diamond membership test
//     |dx|/(W/2) + |dy|/(H/2) <= 1
// becomes 2*max(|du|,|dv|) <= 1, i.e. the UNIT SQUARE in (u,v). And every tile
// CENTRE lands on integer (u,v) for both row parities. So (u - round(u),
// v - round(v)) is an EXACT bijection from the tessellated plane onto one tile.
// No approximation, no windowing, no FFT leakage.
//
// Fold every interior pixel into a BINSxBINS grid of that square and average:
//
//     P(bu,bv) = mean luma over all tile repetitions at that phase
//
// A component that repeats with the tile survives the average untouched.
// Uncorrelated texture decays as 1/sqrt(N) with N repetitions per bin
// (N ~ 1600 at full res here, so the noise floor is ~2.5% of the texture sd).
// The estimator is debiased explicitly: E[var(P)] = var_true + var_within/N.
//
//   grid_amp   = sqrt(max(0, var(P) - var_within/N))     luma units
//                the amplitude of the lattice-locked pattern. THE target number.
//   grid_ratio = grid_amp / sd_within
//                the same thing against the texture's own roughness -- a
//                lattice pattern well under the texture it sits in cannot be
//                picked out of it.
//   ramp_pp    = |b| + |c| from the weighted plane fit L = a + b*du + c*dv over
//                the square, i.e. the peak-to-peak of the LINEAR part of P.
//                This is BOTH the grid's dominant component AND the tile's
//                plasticity -- they are the same physical quantity.
//   grid_resid = the part that is NOT the plane. If the grid survives at
//                tiltY 0, this is what is left and what has to be blamed on
//                something else.
//   grid_slot  = the part that differs BETWEEN slots (patchwork rather than a
//                coherent lattice) -- includes the tiltX ramp, which cancels in
//                the all-slot average because slots 2/3 are flopped.
//
// The outer rim band (max(|du|,|dv|) > RIM_CUT) is excluded: the diamond edge
// carries resampling/alpha artefacts that repeat per tile by construction and
// would swamp the ramp. The rim is judged by metric (1)/(2) instead.
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
  // pooled within-bin variance = the texture roughness at the phase level
  let wss = 0, wdf = 0, tot = 0;
  for (let k = 0; k < 4 * NB; k++) {
    if (n[k] < 2) continue;
    wss += s2[k] - (s1[k] * s1[k]) / n[k]; wdf += n[k] - 1; tot += n[k];
  }
  const varWithin = wdf > 0 ? wss / wdf : 0;

  // (a) coherent lattice: collapse the slots
  const cn = new Float64Array(NB), cs = new Float64Array(NB);
  for (let s = 0; s < 4; s++) for (let b = 0; b < NB; b++) { cn[b] += n[s * NB + b]; cs[b] += s1[s * NB + b]; }
  let cm = 0, cc = 0;
  for (let b = 0; b < NB; b++) if (cn[b] > 0) { cm += cs[b] / cn[b]; cc++; }
  cm /= cc;
  let cv = 0, nfloor = 0;
  for (let b = 0; b < NB; b++) if (cn[b] > 0) { const d = cs[b] / cn[b] - cm; cv += d * d; nfloor += 1 / cn[b]; }
  cv /= cc; nfloor = (varWithin * nfloor) / cc;
  const gridCoh = Math.sqrt(Math.max(0, cv - nfloor));

  // (b) total lattice-locked, slots kept apart
  let tm = 0, tc = 0;
  for (let k = 0; k < 4 * NB; k++) if (n[k] > 0) { tm += s1[k] / n[k]; tc++; }
  tm /= tc;
  let tv = 0, tf = 0;
  for (let k = 0; k < 4 * NB; k++) if (n[k] > 0) { const d = s1[k] / n[k] - tm; tv += d * d; tf += 1 / n[k]; }
  tv /= tc; tf = (varWithin * tf) / tc;
  const gridTot = Math.sqrt(Math.max(0, tv - tf));
  const gridSlot = Math.sqrt(Math.max(0, gridTot * gridTot - gridCoh * gridCoh));

  // (c) weighted plane fit on the coherent phase average
  let Sw = 0, Su = 0, Sv = 0, Suu = 0, Svv = 0, Suv = 0, Sl = 0, Slu = 0, Slv = 0;
  for (let bu = 0; bu < BINS; bu++) for (let bv = 0; bv < BINS; bv++) {
    const b = bu * BINS + bv; if (cn[b] <= 0) continue;
    const du = (bu + 0.5) / BINS - 0.5, dv = (bv + 0.5) / BINS - 0.5;
    const ww = cn[b], lv = cs[b] / cn[b];
    Sw += ww; Su += ww * du; Sv += ww * dv; Suu += ww * du * du; Svv += ww * dv * dv;
    Suv += ww * du * dv; Sl += ww * lv; Slu += ww * lv * du; Slv += ww * lv * dv;
  }
  const sol = solve3([[Sw, Su, Sv], [Su, Suu, Suv], [Sv, Suv, Svv]], [Sl, Slu, Slv]);
  const b1 = sol[1], c1 = sol[2];
  const rampPP = Math.abs(b1) + Math.abs(c1);
  let rv2 = 0, rc = 0;
  for (let bu = 0; bu < BINS; bu++) for (let bv = 0; bv < BINS; bv++) {
    const b = bu * BINS + bv; if (cn[b] <= 0) continue;
    const du = (bu + 0.5) / BINS - 0.5, dv = (bv + 0.5) / BINS - 0.5;
    const d = cs[b] / cn[b] - (sol[0] + b1 * du + c1 * dv);
    rv2 += d * d; rc++;
  }
  const gridResid = Math.sqrt(Math.max(0, rv2 / rc - nfloor));
  // ramp split back into screen axes: dx/(W/2)=du+dv, dy/(H/2)=du-dv
  const Bx = (b1 + c1) / 2, By = (b1 - c1) / 2;
  return {
    BINS, N: tot / (4 * NB), mean: cm, sdWithin: Math.sqrt(varWithin),
    fold: { BINS, cn: Array.from(cn), cs: Array.from(cs), mean: cm },
    gridCoh, gridTot, gridSlot, gridResid, rampPP,
    rampX: 2 * Math.abs(Bx), rampY: 2 * Math.abs(By),
    ratio: Math.sqrt(varWithin) > 0 ? gridTot / Math.sqrt(varWithin) : 0,
    pctOfMean: cm > 0 ? (100 * gridTot) / cm : 0,
  };
}
function solve3(A, Y) {
  const M = [[A[0][0], A[0][1], A[0][2], Y[0]], [A[1][0], A[1][1], A[1][2], Y[1]], [A[2][0], A[2][1], A[2][2], Y[2]]];
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    const t = M[i]; M[i] = M[p]; M[p] = t;
    const d = M[i][i] || 1e-12;
    for (let c = i; c < 4; c++) M[i][c] /= d;
    for (let r = 0; r < 3; r++) {
      if (r === i) continue;
      const f = M[r][i];
      for (let c = i; c < 4; c++) M[r][c] -= f * M[i][c];
    }
  }
  return [M[0][3], M[1][3], M[2][3]];
}

// ══════════════════════════════════════════════════════════════════════
// (1) boundary step vs interior roughness -- the predecessor's metric
// ══════════════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════════════
function label(t, w, size, fill) {
  size = size || 13; fill = fill || '#c9d1d9';
  const esc = String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + (size + 7) + '">' +
    '<text xml:space="preserve" x="4" y="' + (size + 1) + '" font-family="monospace" font-size="' +
    size + '" fill="' + fill + '">' + esc + '</text></svg>');
}

(async () => {
  fs.mkdirSync(TILT, { recursive: true });
  const heroFrozen = path.join(HEROD, 'tundra_hero_src.webp');
  const BASES = [heroFrozen, path.join(VARD, 'tundra_v1.webp'), path.join(VARD, 'tundra_v2.webp'), path.join(VARD, 'tundra_v3.webp')];
  for (const b of BASES) if (!fs.existsSync(b)) throw new Error('missing base ' + b);
  console.log('[bases] hero + kontext v1..v3 present and frozen -- only the plane target changes per rung\n');

  const results = [];
  for (const st of STAGES) {
    const t0 = Date.now();
    const bufs = [], slots = [];
    if (st.ref) {
      for (let n = 0; n < 4; n++) {
        const f = path.join(st.ref, st.refPat.replace('$', String(n)));
        bufs.push(await sharp(fs.readFileSync(f)).png().toBuffer());
        const s = await statsOf(f);
        s.micro = await microContrast(f.replace(/\.webp$/, '@eighth.webp'), f);
        s.rim = await rimHalo(f);
        s.plane = null;
        slots.push(s);
      }
    } else {
      const dir = path.join(TILT, st.id);
      fs.mkdirSync(dir, { recursive: true });
      for (let n = 0; n < 4; n++) {
        const out = path.join(dir, 'tundra_' + n + '.webp');
        const m = await solveTile(BASES[n], out, st.tiltX, st.tiltY);
        let png = m.png;
        if (n >= 2) {
          png = await sharp(png).flop().png().toBuffer();
          await sharp(png).webp(WEBP).toFile(out);
          await sharp(png).resize(64, 32, { fit: 'fill' }).webp(WEBP).toFile(out.replace(/\.webp$/, '@eighth.webp'));
        }
        fs.writeFileSync(path.join(dir, 'tundra_' + n + '.png'), png);
        bufs.push(png);
        const s = await statsOf(out);
        s.micro = await microContrast(out.replace(/\.webp$/, '@eighth.webp'));
        s.rim = await rimHalo(out);
        s.plane = m.plane;
        slots.push(s);
      }
    }

    // ---- measurement fields ------------------------------------------------
    const rnd = mulberry32(4242);
    const F = await isoField(bufs, TILE_W, TILE_H, 10, 6, () => Math.floor(rnd() * 4));
    const Lf = await lumaOf(F.png);
    const gFull = gridMetrics(Lf.L, Lf.w, Lf.h, F.cells, TILE_W, TILE_H);
    const bs = boundaryStep(Object.assign({}, F, { L: Lf.L, w: Lf.w, h: Lf.h }));

    const rnd2 = mulberry32(4242);
    const P = await isoField(bufs, PLAY_W, PLAY_H, 50, 30, () => Math.floor(rnd2() * 4));
    const Lp = await lumaOf(P.png);
    const gPlay = gridMetrics(Lp.L, Lp.w, Lp.h, P.cells, PLAY_W, PLAY_H);
    const Pv = await vacuum(P.png);
    const Lpv = await lumaOf(Pv);
    const gPlayVac = gridMetrics(Lpv.L, Lpv.w, Lpv.h, P.cells, PLAY_W, PLAY_H);

    const meanL = slots.reduce((a, s) => a + s.intLum, 0) / 4;
    const slotLsd = Math.sqrt(slots.reduce((a, s) => a + Math.pow(s.intLum - meanL, 2), 0) / 4);

    results.push({ st, bufs, slots, gFull, gPlay, gPlayVac, bs, slotLsd });
    console.log('[' + st.id.padEnd(8) + '] ' + ((Date.now() - t0) / 1000).toFixed(0) + 's  ' +
      'tY ' + f1(slots.reduce((a, s) => a + s.tiltY, 0) / 4).padStart(5) +
      '  |tX| ' + f1(slots.reduce((a, s) => a + Math.abs(s.tiltX), 0) / 4).padStart(4) +
      '  L ' + f1(slots.reduce((a, s) => a + s.lum, 0) / 4) +
      '  step/rough ' + f2(bs.ratio) +
      '  GRIDfull ' + f2(gFull.gridTot) + ' (coh ' + f2(gFull.gridCoh) + ' slot ' + f2(gFull.gridSlot) +
      ' ramp ' + f2(gFull.rampPP) + ' resid ' + f2(gFull.gridResid) + ')' +
      '  GRIDplay ' + f2(gPlay.gridTot) + '  vac ' + f2(gPlayVac.gridTot));
  }

  // ══════════════════════════════════════════════════════════════════
  // PANELS
  // ══════════════════════════════════════════════════════════════════
  const SW = 2160, PAD = 18;

  for (const R of results) {
    const comp = []; let y = PAD;
    const line = (t, size, fill) => {
      size = size || 13;
      comp.push({ input: label(t, SW - PAD * 2, size, fill || '#c9d1d9'), left: PAD, top: y });
      y += size + 7;
    };
    line('TUNDRA tiltY LADDER -- ' + R.st.label, 19, R.st.col);
    line('STYLE TEST, nothing written to src/assets/tiles/. tile numbers measured on the WRITTEN .webp; field numbers on the composited field. ' +
      new Date().toISOString().slice(0, 16), 13, '#8b949e');
    y += 4;
    line('  slot     L    intL    B/R    G/R     sd  micro8   tiltX   tiltY        rim(1-4 vs 10-24px)   plane p / q', 13, '#8b949e');
    for (let n = 0; n < 4; n++) {
      const s = R.slots[n];
      line('   ' + n + '  ' + f1(s.lum).padStart(6) + f1(s.intLum).padStart(8) + f2(s.br).padStart(7) + f2(s.gr).padStart(7) +
        f1(s.sd).padStart(7) + f2(s.micro).padStart(8) + f1(s.tiltX).padStart(8) + f1(s.tiltY).padStart(8) +
        ((s.rim >= 0 ? '+' : '') + f2(s.rim)).padStart(23) + '   ' +
        (s.plane ? (f3(s.plane.p) + ' / ' + f3(s.plane.q)) : '(as shipped / integrated)'), 13, '#c9d1d9');
    }
    y += 6;
    line('(1) BOUNDARY STEP    step ' + f2(R.bs.step) + '   interior roughness ' + f2(R.bs.rough) + '   RATIO ' + f2(R.bs.ratio) +
      '     (predecessor: NEW 1.24, SHIPPED 1.45 -- lower = the edge reads less as a line)', 13, '#ffa657');
    line('(2) RIM HALO         worst slot ' + ((Math.max.apply(null, R.slots.map((s) => s.rim)) >= 0 ? '+' : '') +
      f2(Math.max.apply(null, R.slots.map((s) => s.rim)))) + '     must not go positive; a global plane has no local term', 13, '#ffa657');
    line('(3) GRID INDEX       lattice fold of the tessellated field, rim band excluded (max(|du|,|dv|) <= ' + RIM_CUT + ')', 13, '#ffa657');
    const rows = [['FULL RES', R.gFull], ['PLAY 48x24', R.gPlay], ['PLAY + VACUUM', R.gPlayVac]];
    for (let i = 0; i < rows.length; i++) {
      const nm = rows[i][0], g = rows[i][1];
      line('      ' + nm.padEnd(14) + 'grid_tot ' + f2(g.gridTot) + ' L   (coherent ' + f2(g.gridCoh) + ', slot-dependent ' + f2(g.gridSlot) +
        ')   ramp_pp ' + f2(g.rampPP) + ' L (x ' + f2(g.rampX) + ' / y ' + f2(g.rampY) + ')   resid ' + f2(g.gridResid) +
        '   sd_within ' + f2(g.sdWithin) + '   ratio ' + f3(g.ratio) + '   ' + f2(g.pctOfMean) + '% of mean ' + f1(g.mean) +
        '   [' + g.BINS + 'x' + g.BINS + ' bins, N~' + Math.round(g.N) + ']', 13, '#8b949e');
    }
    line('(4) PLASTICITY       ramp_pp above IS the plasticity of the single tile -- literally the same physical quantity as the grid ramp.', 13, '#ffa657');
    line('    patchwork (independent of the ramp): slot level spread  slotL_sd ' + f2(R.slotLsd) +
      '     micro8 (texture, untouched by the plane) ' + f2(R.slots.reduce((a, s) => a + s.micro, 0) / 4), 13, '#8b949e');
    y += 10;

    const TW = 510, TH = 255, GAP = 12, rowY = y;
    for (let n = 0; n < 4; n++) {
      const cx = PAD + n * (TW + GAP);
      comp.push({ input: label('slot ' + n, TW, 14, '#c9d1d9'), left: cx, top: rowY });
      comp.push({ input: await sharp(R.bufs[n]).resize(TW, TH, { fit: 'fill' }).png().toBuffer(), left: cx, top: rowY + 22 });
    }
    y = rowY + 22 + TH + 14;

    const rndD = mulberry32(90210);
    const FD = await isoField(R.bufs, TILE_W, TILE_H, 6, 4, () => Math.floor(rndD() * 4));
    line('FULL RES interlocking field, random draw -- the lattice at 1:1', 15, '#7ee787');
    const fdScale = Math.min(1, (SW - PAD * 2) / FD.w);
    const fdW = Math.round(FD.w * fdScale), fdH = Math.round(FD.h * fdScale);
    comp.push({ input: await sharp(FD.png).resize(fdW, fdH).png().toBuffer(), left: PAD, top: y });
    y += fdH + 14;

    const rndP = mulberry32(90210);
    const PD = await isoField(R.bufs, PLAY_W, PLAY_H, 44, 20, () => Math.floor(rndP() * 4));
    const PDv = await vacuum(PD.png);
    line('PLAY SCALE, 48x24 px per tile (zoom 1.0 build view)      |      the SAME field under the VACUUM darkening rgba(5,10,25,0.45)', 15, '#7ee787');
    comp.push({ input: PD.png, left: PAD, top: y });
    comp.push({ input: PDv, left: PAD + PD.w + 30, top: y });
    y += PD.h + 14;

    const CW = Math.min(1020, FD.w - 20), CH = Math.min(470, FD.h - 20);
    const FDv = await vacuum(FD.png);
    const cl = Math.round(FD.w / 2 - CW / 2), ct = Math.round(FD.h / 2 - CH / 2);
    line('1:1 crop of a four-tile junction      |      the same crop under the VACUUM darkening', 15, '#7ee787');
    comp.push({ input: await sharp(FD.png).extract({ left: cl, top: ct, width: CW, height: CH }).png().toBuffer(), left: PAD, top: y });
    comp.push({ input: await sharp(FDv).extract({ left: cl, top: ct, width: CW, height: CH }).png().toBuffer(), left: PAD + CW + 30, top: y });
    y += CH + PAD;

    const out = path.join(ST, '_tundra_tilt_' + R.st.id + '.png');
    fs.writeFileSync(out, await sharp({ create: { width: SW, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[sheet] ' + path.basename(out));
    R.playField = PD.png; R.playVac = PDv;
  }

  // --- the decision panels: every rung at play scale, plain and under vacuum
  const PANELS = [
    ['playscale', 'playField', 'PLAY SCALE 48x24 px per tile (zoom 1.0). This is where it is decided.', false],
    ['vacuum', 'playVac', 'PLAY SCALE under the VACUUM darkening rgba(5,10,25,0.45) -- airless ice moon.', true],
  ];
  for (const pn of PANELS) {
    const suffix = pn[0], key = pn[1], head = pn[2], isVac = pn[3];
    const comp = []; let y = PAD, maxW = 0;
    comp.push({ input: label('TUNDRA tiltY LADDER -- ' + head, 2000, 19, '#e6edf3'), left: PAD, top: y }); y += 30;
    comp.push({
      input: label('every rung holds level 30.8 / B-R 0.82 / G-R ' + f2(GR_T) + '; only the luma plane differs. identical random draw on all rungs.',
        2000, 13, '#8b949e'), left: PAD, top: y,
    }); y += 24;
    for (const R of results) {
      const g = isVac ? R.gPlayVac : R.gPlay;
      comp.push({
        input: label(R.st.label.padEnd(34) + 'grid_tot ' + f2(g.gridTot) + ' L    ramp_pp ' + f2(g.rampPP) +
          ' L    resid ' + f2(g.gridResid) + '    step/rough ' + f2(R.bs.ratio), 1500, 15, R.st.col), left: PAD, top: y,
      });
      y += 22;
      const img = R[key];
      const m = await sharp(img).metadata();
      comp.push({ input: img, left: PAD, top: y });
      maxW = Math.max(maxW, m.width); y += m.height + 16;
    }
    const out = path.join(ST, '_tundra_tilt_' + suffix + '.png');
    const pw = Math.max(maxW, 2000) + PAD * 2;
    fs.writeFileSync(out, await sharp({ create: { width: pw, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[panel] ' + path.basename(out));
  }

  // --- THE FOLD MAP: the phase-averaged tile IS the visible lattice --------
  // Every pixel of the tessellated field is folded onto one tile through the
  // exact iso lattice and averaged. What is left after ~1600 repetitions per
  // bin is precisely the pattern that repeats at every tile -- i.e. the grid,
  // drawn. Amplified around the field mean with ONE fixed scale on all rungs,
  // so the rungs are directly comparable by eye.
  const AMP_RANGE = 14;   // luma; +-AMP_RANGE maps to +-110 grey levels
  async function foldImage(fold, w, h) {
    const B = fold.BINS;
    const out = Buffer.alloc(w * h * 4);
    const cx = (w - 1) / 2, cy = (h - 1) / 2;
    for (let y2 = 0; y2 < h; y2++) for (let x2 = 0; x2 < w; x2++) {
      const i = (y2 * w + x2) * 4;
      const dxn = (x2 - cx) / (w / 2), dyn = (y2 - cy) / (h / 2);
      if (Math.abs(dxn) + Math.abs(dyn) > 1) { out[i + 3] = 0; continue; }
      const du = (dxn + dyn) / 2, dv = (dxn - dyn) / 2;
      let bu = Math.floor((du + 0.5) * B); if (bu < 0) bu = 0; if (bu >= B) bu = B - 1;
      let bv = Math.floor((dv + 0.5) * B); if (bv < 0) bv = 0; if (bv >= B) bv = B - 1;
      const b = bu * B + bv;
      if (fold.cn[b] <= 0) { out[i + 3] = 0; continue; }
      let g = 128 + ((fold.cs[b] / fold.cn[b] - fold.mean) / AMP_RANGE) * 110;
      g = g < 0 ? 0 : g > 255 ? 255 : Math.round(g);
      out[i] = out[i + 1] = out[i + 2] = g; out[i + 3] = 255;
    }
    return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  }
  {
    const FW = 660, FH = 330, PER = 3, comp = []; let y = PAD;
    comp.push({ input: label('TUNDRA tiltY LADDER -- THE FOLD MAP: the grid, drawn.', 2000, 19, '#e6edf3'), left: PAD, top: y }); y += 30;
    comp.push({ input: label('the whole tessellated field folded onto ONE tile through the exact iso lattice and averaged over ~1600 repetitions per bin. what survives that average is,', 2000, 13, '#8b949e'), left: PAD, top: y }); y += 20;
    comp.push({ input: label('by construction, exactly the part that repeats at every tile -- so this IS the visible lattice. grey 128 = field mean; one fixed amplification (+-' + AMP_RANGE + ' luma -> +-110) everywhere.', 2000, 13, '#8b949e'), left: PAD, top: y }); y += 26;
    let x = PAD, rowTop = y, rowMax = 0;
    for (let i = 0; i < results.length; i++) {
      const R = results[i];
      if (i > 0 && i % PER === 0) { rowTop = rowTop + rowMax; y = rowTop; x = PAD; rowMax = 0; }
      comp.push({ input: label(R.st.label, FW, 14, R.st.col), left: x, top: y });
      comp.push({
        input: label('grid_tot ' + f2(R.gFull.gridTot) + '   coh ' + f2(R.gFull.gridCoh) + '   ramp_pp ' + f2(R.gFull.rampPP) +
          '   resid ' + f2(R.gFull.gridResid), FW, 13, '#8b949e'), left: x, top: y + 20,
      });
      comp.push({ input: await foldImage(R.gFull.fold, FW, FH), left: x, top: y + 40 });
      x += FW + 16; rowMax = Math.max(rowMax, 40 + FH + 22);
    }
    const H = rowTop + rowMax + PAD;
    const out = path.join(ST, '_tundra_tilt_foldmap.png');
    fs.writeFileSync(out, await sharp({ create: { width: PAD * 2 + PER * (FW + 16), height: H, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[panel] ' + path.basename(out));
  }

  // --- numbers table -----------------------------------------------------
  const txt = [];
  const T = (s) => txt.push(s);
  T('TUNDRA tiltY LADDER -- ' + new Date().toISOString().slice(0, 16) + '  (style test, nothing written to src/assets/tiles/)');
  T('held on every rung: canvas L 30.8, B/R 0.82, G/R ' + f2(GR_T) + ', tiltX +-4.1 (sign flips with the flop of slots 2/3) unless stated.');
  T('');
  T('  rung                                 tY  |tX|      L    step  rough   s/r   GRIDfull   coh   slot   ramp  resid   GRIDplay   ramp  GRIDvac   ramp   micro8  slotLsd  rim_max');
  for (const R of results) {
    const avg = (f) => R.slots.reduce((a, s) => a + f(s), 0) / 4;
    T('  ' + R.st.label.padEnd(35) +
      f1(avg((s) => s.tiltY)).padStart(5) + f1(avg((s) => Math.abs(s.tiltX))).padStart(6) +
      f1(avg((s) => s.lum)).padStart(8) +
      f2(R.bs.step).padStart(8) + f2(R.bs.rough).padStart(7) + f2(R.bs.ratio).padStart(6) +
      f2(R.gFull.gridTot).padStart(11) + f2(R.gFull.gridCoh).padStart(6) + f2(R.gFull.gridSlot).padStart(7) +
      f2(R.gFull.rampPP).padStart(7) + f2(R.gFull.gridResid).padStart(7) +
      f2(R.gPlay.gridTot).padStart(11) + f2(R.gPlay.rampPP).padStart(7) +
      f2(R.gPlayVac.gridTot).padStart(9) + f2(R.gPlayVac.rampPP).padStart(7) +
      f2(avg((s) => s.micro)).padStart(9) + f2(R.slotLsd).padStart(9) +
      ((Math.max.apply(null, R.slots.map((s) => s.rim)) >= 0 ? '+' : '') + f2(Math.max.apply(null, R.slots.map((s) => s.rim)))).padStart(9));
  }
  T('');
  T('GRIDfull / GRIDplay / GRIDvac = grid_tot, the sd of the lattice-folded phase average in LUMA UNITS, at full res / 48x24 / 48x24 under vacuum.');
  T('coh  = the part identical on all four slots (reads as a regular lattice).  slot = the part that differs per slot (reads as patchwork).');
  T('ramp = ramp_pp, peak-to-peak of the plane fitted to the phase average = ALSO the plasticity of the single tile. Same quantity, both roles.');
  T('resid = what is left of the coherent fold once the plane is removed -- the floor no tiltY value can go below.');
  T('s/r  = boundary step over interior roughness. rim_max = worst-slot rim halo. slotLsd = spread of the four slot interior levels.');
  fs.writeFileSync(path.join(ST, '_tundra_tilt_numbers.txt'), txt.join('\n') + '\n');
  fs.writeFileSync(path.join(WORK, 'tilt_stats.json'), JSON.stringify(
    results.map((R) => ({
      id: R.st.id, label: R.st.label, tiltY: R.st.tiltY, tiltX: R.st.tiltX,
      slots: R.slots.map((s) => Object.assign({}, s, { png: undefined })),
      bs: R.bs,
      gFull: Object.assign({}, R.gFull, { fold: undefined }),
      gPlay: Object.assign({}, R.gPlay, { fold: undefined }),
      gPlayVac: Object.assign({}, R.gPlayVac, { fold: undefined }),
      slotLsd: R.slotLsd,
    })), null, 1));
  console.log('\n' + txt.join('\n'));
  console.log('\n[out] _tundra_tilt_numbers.txt  +  tundra_iter2/tilt_stats.json');
})();
