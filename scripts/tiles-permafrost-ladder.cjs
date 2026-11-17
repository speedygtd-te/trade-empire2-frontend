/**
 * PERMAFROST FROM TUNDRA -- THE PATTERNED-GROUND LADDER.
 *
 * STYLE TEST. Writes only into assets/style-test/tiles/permafrost/ and
 * assets/style-test/tiles/_permafrost_*.png|txt. NOTHING is written to
 * src/assets/tiles/. No cap sync, no build, no git.
 *
 * WHAT RUDI ASKED FOR
 *   "fuer permafrost koennen wir tundra clonen und leicht ins roetlich/braune
 *    einfaerben mit rissen im boden wie crevasse"  + agreed addition: ALSO shift
 *   the LEVEL, because the hue shift alone does not separate the two.
 *
 * THE VORLAGE -- PLUTO's THOLINS
 *   The ICE family follows real ice bodies (Ganymede, Europa, now Pluto). Pluto's
 *   tholin deposits are reddish-brown AND they are the DARK regions of the disc.
 *   "darker and redder" is therefore ONE statement about one material, not two
 *   independent dials -- which is why this ladder moves B/R and level together.
 *
 *   And the defining feature of permafrost is PATTERNED GROUND: polygonal frost
 *   cracks that close into a honeycomb. That is true on Earth (ice-wedge polygons)
 *   and on icy bodies (Sputnik Planitia's convection-cell troughs). So the cracks
 *   here are not a borrowing from crevasse -- they are this biome's own vorlage,
 *   and a VORONOI CELL NET is both faithful to it and exactly steerable.
 *
 * THE RISK PAIR IS PERMAFROST vs TUNDRA -- same source, adjacent level.
 *   The hue distance alone is ~0.12 in B/R against a corpus threshold of 0.30, so
 *   it can only SUPPORT. The separation has to be carried by three legs together,
 *   and this ladder reports the three SEPARATELY:
 *     LEG 1  hue       B/R 0.82 -> 0.66..0.74            (support only, by design)
 *     LEG 2  level     canvas L 30.8 -> 26..28           (the second leg)
 *     LEG 3  structure micro8 3.3 -> as high as the net gets   (the strongest)
 *   plus the play-scale d', split into d'level and d'texture exactly as the
 *   crevasse rounds did, because that is the measure that answers the real
 *   question: two AREAS side by side at 48x24 px per tile.
 *
 * WHY PROCEDURAL AND NOT FLUX
 *   Crevasse round 2/3 measured it: procedural grid_play 5.9-6.7 against flux'
 *   12.2-17.9, because flux reads the diamond mask as a picture frame and pins
 *   its shapes to it. For a honeycomb the argument is stronger still -- a Voronoi
 *   net is exactly steerable, re-drawable per slot, and free. The colour shift is
 *   a grade, never a generation.
 *
 * WHAT IS CARRIED OVER FROM THE CREVASSE ROUNDS
 *   (a) THE MULTIPLY. The net is only ever a multiplier map (1-dark)(1+bright)
 *       applied to the frozen shipped tundra. The ground stays tundra by
 *       construction -- Rudi called that ground "perfekt". groundNCC is the guard.
 *   (b) NO SECOND FLATTEN, no upscale, no divide-by-blur equalization. The mask is
 *       evaluated at 2x (1024x512) and box-downsampled: anti-aliasing, not upscale.
 *   (c) THE RIM FADE. Darkening and brightening both ramp to zero in the last 11%
 *       of world distance before the diamond edge, so a furrow closes up INSIDE
 *       the tile instead of announcing a continuation the random neighbour slot
 *       cannot deliver. Contained shapes tessellate; crossing ones do not.
 *   (d) THE BRIGHT WALL beside the dark furrow. Round 2 measured it buying the
 *       raster back (grid_play 9.39 -> 7.81) because the pair partly cancels
 *       inside a fold bin. On frost cracks it is not a trick at all: the heaved
 *       lip beside an ice wedge really is the brighter, freshly exposed ridge.
 *       A no-lip rung is in the ladder so the cost is a number, not an opinion.
 *   (e) The light is taken in WORLD coordinates (tiltY 3.0 / tiltX 0.0 means lit
 *       from the screen's upper left), so the up-light shoulder carries the wall
 *       and the down-light one carries the shadow. Symmetric furrows read as
 *       scratches.
 *
 * WHAT IS DIFFERENT FROM THE CREVASSE ROUNDS
 *   The level is NOT locked to the source's p70. Here the level is a DELIBERATE
 *   axis, so the gain is solved directly on the finished tile's CANVAS MEAN L
 *   against the rung's target (26 / 27 / 28), and the bright wall is set at a
 *   fixed fraction of the depth instead of being solved to cancel the mean.
 *   G/R is not free either: tundra sits at B/R 0.820 / G/R 0.906, which is
 *   G/R = 0.5 + 0.5 x B/R to three decimals. That line is the natural warm axis
 *   through the corpus, so every rung holds G/R = 0.5 + 0.5 x B/R and the hue
 *   ladder stays one-dimensional.
 *
 * MEASURED ON THE WRITTEN .webp, NEVER ON THE BUFFER (libwebp drops RGB under
 * alpha 0 and the diamond corners are ~50% of the canvas -> buffer numbers drift
 * about +1.5). sharp.cache(false).
 *
 * Usage:  node scripts/tiles-permafrost-ladder.cjs
 *         ONLY=H70L27M node scripts/tiles-permafrost-ladder.cjs     one rung
 *         NOSHEETS=1   node scripts/tiles-permafrost-ladder.cjs     numbers only
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const SRCD = path.join(ST, 'permafrost', 'src');
const WORK = path.join(ST, 'permafrost');

const TILE_W = 512, TILE_H = 256;
const SS = 2, MW = TILE_W * SS, MH = TILE_H * SS;
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const TILT_Y = 3.0, TILT_X = 0.0;
const SOLVE_PASSES = 6;

const VAC_A = 0.45, VAC_RGB = [5, 10, 25];
const PLAY_W = 48, PLAY_H = 24;

const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);

// the corpus neighbours this tile has to live next to on one planet
const NEIGH = [
  { id: 'tundra    (THE RISK)', lum: 30.8, br: 0.820, gr: 0.906, micro: 3.32 },
  { id: 'glacier         (ICE)', lum: 44.0, br: 1.10, gr: 1.06, micro: 7.40 },
  { id: 'ice_shelf       (ICE)', lum: 22.0, br: 2.86, gr: 2.18, micro: 4.5 },
];

// ==========================================================================
// world <-> screen. The diamond maps onto the unit square in world coords, so a
// furrow drawn as a straight line in (u,v) lies IN THE GROUND PLANE and comes
// out correctly foreshortened. 1 world unit = 286.2 screen px along either axis.
// ==========================================================================
const s2wM = (x, y) => {
  const dx = x - MW / 2, dy = y - MH / 2;
  return [dx / MW + dy / MH, -dx / MW + dy / MH];
};

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

/** 2D value noise, cubic-smoothed, 128-periodic. */
function noise2(seed) {
  const P = 128, g = new Float32Array(P * P), r = mulberry32(seed);
  for (let i = 0; i < P * P; i++) g[i] = r() * 2 - 1;
  return (x, y) => {
    const xf = Math.floor(x), yf = Math.floor(y);
    const sx = smooth(x - xf), sy = smooth(y - yf);
    const i0 = ((xf % P) + P) % P, j0 = ((yf % P) + P) % P;
    const i1 = (i0 + 1) % P, j1 = (j0 + 1) % P;
    const a = g[j0 * P + i0], b = g[j0 * P + i1], c = g[j1 * P + i0], d = g[j1 * P + i1];
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}
function fbm2(seed, oct) {
  const fns = [];
  let norm = 0;
  for (let k = 0; k < oct; k++) { const a = Math.pow(0.52, k); fns.push({ f: noise2(seed + k * 7919), a: a, s: Math.pow(2.03, k) }); norm += a; }
  return (x, y) => { let s = 0; for (const o of fns) s += o.a * o.f(x * o.s, y * o.s); return s / norm; };
}

/** the light, in world coords -- screen upper-left normalises to (-0.832,-0.555) */
const LU = -0.832, LV = -0.555;

// ==========================================================================
// THE HONEYCOMB -- a jittered-grid Voronoi. The furrow sits on the cell boundary,
// which is exactly what a frost-crack polygon net is: cells with cracks between.
// ==========================================================================
function makeVoro(seed, cell, jitter) {
  const R = 1.15, n = Math.ceil((2 * R) / cell);
  const pts = new Float32Array(n * n * 2), rnd = mulberry32(seed);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = (j * n + i) * 2;
    pts[k] = -R + (i + 0.5) * cell + (rnd() - 0.5) * cell * jitter;
    pts[k + 1] = -R + (j + 0.5) * cell + (rnd() - 0.5) * cell * jitter;
  }
  return { pts: pts, n: n, cell: cell, R: R };
}
/**
 * Distance to the cell boundary, plus the direction pointing AWAY from it into
 * the pixel's own cell. (d2-d1)/2 is the exact bisector distance near the edge,
 * which is the only place it is used.
 */
function voroEdge(V, u, v, out) {
  const ci = Math.floor((u + V.R) / V.cell), cj = Math.floor((v + V.R) / V.cell);
  let d1 = 1e9, d2 = 1e9, ax = 0, ay = 0, bx = 0, by = 0;
  for (let jj = cj - 2; jj <= cj + 2; jj++) {
    if (jj < 0 || jj >= V.n) continue;
    for (let ii = ci - 2; ii <= ci + 2; ii++) {
      if (ii < 0 || ii >= V.n) continue;
      const k = (jj * V.n + ii) * 2, dx = u - V.pts[k], dy = v - V.pts[k + 1];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; bx = ax; by = ay; d1 = d; ax = V.pts[k]; ay = V.pts[k + 1]; }
      else if (d < d2) { d2 = d; bx = V.pts[k]; by = V.pts[k + 1]; }
    }
  }
  if (d2 > 1e8) { out[0] = 1e9; return; }
  const nx = ax - bx, ny = ay - by, nl = Math.hypot(nx, ny) || 1;
  out[0] = (d2 - d1) * 0.5;
  out[1] = nx / nl; out[2] = ny / nl;
}

// ==========================================================================
// THE MASK. One pass over the 2x grid; both net layers are evaluated at the same
// domain-warped world point and combined with max, so a crossing never
// double-darkens and the mean stays put.
// ==========================================================================
function buildMask(seed, C) {
  const D = new Float32Array(MW * MH), B = new Float32Array(MW * MH);
  const warp = fbm2(seed + 101, 3), warp2 = fbm2(seed + 202, 3);
  const wvar = fbm2(seed + 303, 2);
  const gens = C.layers.map((Ly, i) => makeVoro(seed + 1000 + i * 331, Ly.cell, Ly.jitter));
  const o = [0, 0, 0];
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      const w = s2wM(x + 0.5, y + 0.5);
      const u0 = w[0], v0 = w[1];
      if (Math.abs(u0) > 0.52 || Math.abs(v0) > 0.52) continue;      // outside the diamond
      const wu = u0 + C.warpAmp * warp(u0 * C.warpFreq, v0 * C.warpFreq);
      const wv = v0 + C.warpAmp * warp2(u0 * C.warpFreq, v0 * C.warpFreq);
      const wf = C.wvarFreq;
      const wj = 0.66 + 0.68 * (wvar(u0 * wf, v0 * wf) * 0.5 + 0.5);  // width varies along the crack
      const p = y * MW + x;
      let dk = 0, br = 0;
      for (let li = 0; li < C.layers.length; li++) {
        const Ly = C.layers[li];
        voroEdge(gens[li], wu, wv, o);
        const e = o[0];
        if (e > 0.25) continue;
        const hw = 0.5 * Ly.width * wj;
        const toLight = o[1] * LU + o[2] * LV > 0;
        if (e < hw) {
          let s = smooth((1 - e / hw) / (1 - Ly.core));
          if (toLight) s *= Ly.asym;                 // the up-light wall is the shallower one
          const d = Ly.depth * s; if (d > dk) dk = d;
        } else if (Ly.lip > 0 && toLight && e < hw * (1 + Ly.lipW)) {
          const s = smooth(1 - (e - hw) / (hw * Ly.lipW));
          const b = Ly.lip * s; if (b > br) br = b;
        }
      }
      D[p] = dk; B[p] = br;
    }
  }
  // RIM FADE -- zero darkening in the last `rimBand` of world distance before the
  // diamond edge, so the honeycomb closes up before the boundary.
  if (C.rimBand > 0) {
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const p = y * MW + x;
      if (D[p] === 0 && B[p] === 0) continue;
      const w = s2wM(x + 0.5, y + 0.5);
      const m = Math.min(0.5 - Math.abs(w[0]), 0.5 - Math.abs(w[1]));
      const k = smooth(m / C.rimBand);
      D[p] *= k; B[p] *= k;
    }
  }
  // box-downsample 2x2 -- anti-aliasing, not an upscale of anything
  const d1 = new Float32Array(TILE_W * TILE_H), b1 = new Float32Array(TILE_W * TILE_H);
  for (let y = 0; y < TILE_H; y++) for (let x = 0; x < TILE_W; x++) {
    let sd = 0, sb = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const p = (y * SS + j) * MW + (x * SS + i); sd += D[p]; sb += B[p];
    }
    d1[y * TILE_W + x] = sd / (SS * SS); b1[y * TILE_W + x] = sb / (SS * SS);
  }
  return { D: d1, B: b1 };
}

/** multiply the net onto the frozen shipped tundra -- the ground stays tundra */
async function proceduralBase(srcFile, seed, C) {
  const G = await sharp(fs.readFileSync(srcFile)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = G.info.channels, w = G.info.width, h = G.info.height;
  const out = Buffer.from(G.data);
  if (!C) return { data: out, info: { width: w, height: h, channels: ch }, ink: 0, lit: 0, inkRim: 0, inkCore: 0 };
  const M = buildMask(seed, C);
  let ink = 0, lit = 0, inkR = 0, nR = 0, inkC = 0, nC = 0;
  const band = C.rimBand;
  for (let p = 0; p < w * h; p++) {
    const i = p * ch;
    if (out[i + 3] < 1) continue;
    ink += M.D[p]; lit += M.B[p];
    const px = p % w, py = (p - (p % w)) / w;
    const ddx = px + 0.5 - w / 2, ddy = py + 0.5 - h / 2;
    const uu = ddx / w + ddy / h, vv = -ddx / w + ddy / h;
    const md = Math.min(0.5 - Math.abs(uu), 0.5 - Math.abs(vv));
    if (md >= 0 && md < band) { inkR += M.D[p]; nR++; } else if (md >= band) { inkC += M.D[p]; nC++; }
    const m = Math.max(0, (1 - M.D[p]) * (1 + M.B[p]));
    for (let c = 0; c < 3; c++) {
      const v = G.data[i + c] * m;
      out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return {
    data: out, info: { width: w, height: h, channels: ch },
    ink: ink / (w * h), lit: lit / (w * h),
    inkRim: nR ? inkR / nR : 0, inkCore: nC ? inkC / nC : 0,
  };
}

// ==========================================================================
// measurement -- the same functions the crevasse rounds used, so the tables read
// together. Always on the WRITTEN file.
// ==========================================================================
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
  const q = (p) => (lv.length ? lv[Math.min(lv.length - 1, Math.floor(lv.length * p))] : 0);
  let cr = 0, cn2 = 0;
  for (let i = 0; i < data.length; i += ch) {
    if (data[i + 3] < 8) continue;
    const r = data[i] / im[0], g = data[i + 1] / im[1], b = data[i + 2] / im[2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 0) cr += (mx - mn) / mx;
    cn2++;
  }
  const p50 = q(0.50);
  return {
    chromaRes: cn2 ? cr / cn2 : 0,
    lum: L709(m[0], m[1], m[2]), intLum: L709(im[0], im[1], im[2]), rgb: im,
    br: im[2] / im[0], gr: im[1] / im[0],
    sd: (isd[0] + isd[1] + isd[2]) / 3, sat: sat / ni,
    p30: q(0.30), p50: p50, p70: q(0.70), p99: q(0.99),
    darkFrac: lv.length ? lv.filter((v) => v < 0.55 * p50).length / lv.length : 0,
    blow: lv.length ? lv.filter((v) => v >= 200).length / lv.length : 0,
    tiltX: half.l / hn.l - half.r / hn.r, tiltY: half.t / hn.t - half.b / hn.b,
  };
}
async function statsOf(file) {
  const r = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return statsRaw(r.data, r.info.channels, r.info.width, r.info.height);
}
async function microOn(buf) {
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    L[p] = L709(r.data[p * ch], r.data[p * ch + 1], r.data[p * ch + 2]);
    A[p] = r.data[p * ch + 3];
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
/** micro8 = the 64x32 mip (8 screen px per pixel). Always rebuilt from the full
 *  written file with the same resize the mip bake uses, so every row is comparable. */
const microContrast = async (file) => microOn(await sharp(fs.readFileSync(file)).resize(64, 32, { fit: 'fill' }).webp(WEBP).toBuffer());
/** micro4 = the 128x64 mip. The play view at 48x24 sits between the two mips. */
const microQuarter = async (file) => microOn(await sharp(fs.readFileSync(file)).resize(128, 64, { fit: 'fill' }).webp(WEBP).toBuffer());

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
/** share of the diamond rim band (1-6 px inside) that is furrow rather than
 *  ground. Threshold 0.80x p50, as in crevasse round 4 -- shallow furrows never
 *  reach round 1-3's 0.55x, so the columns are NOT comparable across rounds. */
async function rimGroove(file) {
  const r = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const s = await statsOf(file);
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  let dark = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (r.data[i + 3] < 250) continue;
    const u = Math.abs(x - cx) / (w / 2) + Math.abs(y - cy) / (h / 2);
    const dpx = (1 - u) * (w / 4);
    if (dpx < 1 || dpx > 6) continue;
    if (L709(r.data[i], r.data[i + 1], r.data[i + 2]) < 0.80 * s.p50) dark++;
    n++;
  }
  return n ? dark / n : 0;
}
async function groundNcc(fileA, fileB) {
  const load = async (f, blur) => {
    let s = sharp(fs.readFileSync(f));
    if (blur) s = s.blur(blur);
    return s.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  };
  const out = {};
  for (const pair of [['fine', 0], ['blur12', 12]]) {
    const A = await load(fileA, pair[1]), B = await load(fileB, pair[1]);
    const Am = await load(fileA, 0);
    const ca = A.info.channels, cb = B.info.channels, w = A.info.width, h = A.info.height;
    const a = [], b = [];
    for (let p = 0; p < w * h; p++) {
      if (Am.data[p * ca + 3] < 250 || B.data[p * cb + 3] < 250) continue;
      a.push(L709(A.data[p * ca], A.data[p * ca + 1], A.data[p * ca + 2]));
      b.push(L709(B.data[p * cb], B.data[p * cb + 1], B.data[p * cb + 2]));
    }
    if (a.length < 100) { out[pair[0]] = 0; continue; }
    const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
    let n = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) { const u = a[i] - ma, v = b[i] - mb; n += u * v; da += u * u; db += v * v; }
    out[pair[0]] = n / Math.sqrt(da * db + 1e-9);
  }
  return out;
}
async function ncc(fileA, fileB, flop, flip) {
  let sb = sharp(fs.readFileSync(fileB));
  if (flop) sb = sb.flop();
  if (flip) sb = sb.flip();
  const A = await sharp(fs.readFileSync(fileA)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const B = await sb.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ca = A.info.channels, cb = B.info.channels, w = A.info.width, h = A.info.height;
  const a = [], b = [];
  for (let p = 0; p < w * h; p++) {
    if (A.data[p * ca + 3] < 250 || B.data[p * cb + 3] < 250) continue;
    a.push(L709(A.data[p * ca], A.data[p * ca + 1], A.data[p * ca + 2]));
    b.push(L709(B.data[p * cb], B.data[p * cb + 1], B.data[p * cb + 2]));
  }
  const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { const u = a[i] - ma, v = b[i] - mb; n += u * v; da += u * u; db += v * v; }
  return n / Math.sqrt(da * db);
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
/**
 * Solve gain, hue and the light plane against the WRITTEN file.
 * The level target is the CANVAS MEAN L -- unlike the crevasse rounds, where the
 * level was pinned to the source's p70 and the mean was an output. Here the level
 * IS one of the three legs, so it is dialled, not observed.
 */
async function solveTile(baseBuf, W, H, CH, outFile, lumT, brT, grT) {
  const S = baseBuf;
  const b0 = statsRaw(S, CH, W, H);
  const tint = [1, (grT * b0.rgb[0]) / b0.rgb[1], (brT * b0.rgb[0]) / b0.rgb[2]];
  let G = lumT / b0.lum, p = 0, q = 0;
  const t00 = statsRaw(grade(S, CH, W, H, tint, G, 0, 0), CH, W, H);
  const tP = statsRaw(grade(S, CH, W, H, tint, G, 0.2, 0), CH, W, H);
  const tQ = statsRaw(grade(S, CH, W, H, tint, G, 0, 0.2), CH, W, H);
  const Kx = (tP.tiltX - t00.tiltX) / 0.2, Ky = (tQ.tiltY - t00.tiltY) / 0.2;
  let m = null, png = null;
  for (let pass = 0; pass < SOLVE_PASSES; pass++) {
    const buf = grade(S, CH, W, H, tint, G, p, q);
    png = await sharp(buf, { raw: { width: W, height: H, channels: CH } }).png().toBuffer();
    await sharp(png).webp(WEBP).toFile(outFile);
    m = await statsOf(outFile);
    if (pass === SOLVE_PASSES - 1) break;
    G *= lumT / m.lum;
    tint[2] *= brT / m.br;
    tint[1] *= grT / m.gr;
    p += (TILT_X - m.tiltX) / Kx;
    q += (TILT_Y - m.tiltY) / Ky;
  }
  m.png = png;
  return m;
}

// ==========================================================================
// fields
// ==========================================================================
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
    cells.push({ input: bufs[slot], left: x, top: y, slot: slot });
    mr = Math.max(mr, x + w); mb = Math.max(mb, y + h);
  }
  const png = await sharp({ create: { width: mr, height: mb, channels: 4, background: BGA } })
    .composite(cells.map((c) => ({ input: c.input, left: c.left, top: c.top }))).png().toBuffer();
  return { png: png, cells: cells, w: mr, h: mb, tw: w, th: h };
}
async function mixedField(setsBufs, w, h, rows, cols, seed) {
  const packs = [];
  for (const set of setsBufs) {
    const o = [];
    for (const f of set) o.push(await sharp(typeof f === 'string' ? fs.readFileSync(f) : f).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer());
    packs.push(o);
  }
  const rnd = mulberry32(seed);
  const cells = [];
  let mr = 0, mb = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const which = (Math.floor(r / 5) + Math.floor(c / 4)) % 2;
    const x = c * w + (r % 2 ? w / 2 : 0), y = (r * h) / 2;
    cells.push({ input: packs[which][Math.floor(rnd() * 4)], left: x, top: y });
    mr = Math.max(mr, x + w); mb = Math.max(mb, y + h);
  }
  return sharp({ create: { width: mr, height: mb, channels: 4, background: BGA } }).composite(cells).png().toBuffer();
}
async function vacuum(png) {
  const r = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels;
  for (let p = 0; p < r.info.width * r.info.height; p++) {
    for (let c = 0; c < 3; c++) r.data[p * ch + c] = Math.round(r.data[p * ch + c] * (1 - VAC_A) + VAC_RGB[c] * VAC_A);
  }
  return sharp(r.data, { raw: { width: r.info.width, height: r.info.height, channels: ch } }).png().toBuffer();
}
async function lumaOf(png) {
  const r = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const L = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) L[p] = L709(r.data[p * ch], r.data[p * ch + 1], r.data[p * ch + 2]);
  return { L: L, w: w, h: h };
}
/**
 * d' at play scale over the per-tile distribution of a 40x24 field, split into a
 * LEVEL part (tile mean luma) and a TEXTURE part (within-tile sd), exactly as the
 * crevasse rounds did it. This is the measure that answers "two areas side by
 * side" -- the pair-distance thresholds further down are the corpus' cruder rule.
 */
async function separability(bufsA, bufsB, vac) {
  const feat = async (bufs) => {
    const rnd = mulberry32(31337);
    const F = await isoField(bufs, PLAY_W, PLAY_H, 40, 24, () => Math.floor(rnd() * 4));
    const img = vac ? await vacuum(F.png) : F.png;
    const Lo = await lumaOf(img);
    const mm = [], ss = [];
    for (const c of F.cells) {
      let s = 0, s2 = 0, n = 0;
      for (let y = 2; y < PLAY_H - 2; y++) for (let x = 2; x < PLAY_W - 2; x++) {
        const dx = Math.abs(x - PLAY_W / 2) / (PLAY_W / 2), dy = Math.abs(y - PLAY_H / 2) / (PLAY_H / 2);
        if (dx + dy > 0.80) continue;
        const px = c.left + x, py = c.top + y;
        if (px < 0 || py < 0 || px >= Lo.w || py >= Lo.h) continue;
        const v = Lo.L[py * Lo.w + px];
        s += v; s2 += v * v; n++;
      }
      if (n < 20) continue;
      mm.push(s / n); ss.push(Math.sqrt(Math.max(0, s2 / n - (s / n) * (s / n))));
    }
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const sdv = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) * (v - m)))); };
    return { m: mean(mm), msd: sdv(mm), s: mean(ss), ssd: sdv(ss) };
  };
  const A = await feat(bufsA), B = await feat(bufsB);
  const dp = (ma, sa, mb, sb) => Math.abs(ma - mb) / Math.sqrt((sa * sa + sb * sb) / 2 + 1e-9);
  return {
    A: A, B: B,
    dLevel: dp(A.m, A.msd, B.m, B.msd),
    dTexture: dp(A.s, A.ssd, B.s, B.ssd),
    dJoint: Math.sqrt(Math.pow(dp(A.m, A.msd, B.m, B.msd), 2) + Math.pow(dp(A.s, A.ssd, B.s, B.ssd), 2)),
  };
}

// ==========================================================================
// THE GRID INDEX -- lattice fold, verbatim from the crevasse rounds
// ==========================================================================
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
  let wss = 0, wdf = 0, tot = 0;
  for (let k = 0; k < 4 * NB; k++) {
    if (n[k] < 2) continue;
    wss += s2[k] - (s1[k] * s1[k]) / n[k]; wdf += n[k] - 1; tot += n[k];
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
  return {
    BINS: BINS, N: tot / (4 * NB), mean: cm, sdWithin: Math.sqrt(varWithin),
    fold: { BINS: BINS, cn: Array.from(cn), cs: Array.from(cs), mean: cm },
    gridCoh: gridCoh, gridTot: gridTot, gridSlot: gridSlot, gridResid: gridResid, rampPP: rampPP,
    ratio: Math.sqrt(varWithin) > 0 ? gridTot / Math.sqrt(varWithin) : 0,
    pctOfMean: cm > 0 ? (100 * gridTot) / cm : 0,
  };
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
function label(t, w, size, fill) {
  size = size || 13; fill = fill || '#c9d1d9';
  const esc = String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + (size + 7) + '">' +
    '<text xml:space="preserve" x="4" y="' + (size + 1) + '" font-family="monospace" font-size="' +
    size + '" fill="' + fill + '">' + esc + '</text></svg>');
}

// ==========================================================================
// THE LADDER
// ==========================================================================
// 1 world unit = 286.2 screen px. micro8 lives on the 64x32 mip = 8 screen px per
// mip pixel, so only a crack PITCH in the 16-32 px range lifts it -- which is why
// the net axis is CELL SIZE and the width is pinned as a fraction of the cell.
// crevasse round 4 measured the same net on the (much brighter) glacier ground:
// cells 86 px -> micro8 x1.36, cells 60 px -> x1.46, cells 41 px -> x1.71.
//
// The bright wall is NOT solved to cancel the mean here (crevasse had to, because
// its level was pinned to glacier's). Here the level is an axis of its own and the
// gain solve carries it, so the wall is fixed at LIPK x depth and its only job is
// to be the heaved lip beside the wedge -- and to keep the fold flat.
const WREL = 0.20, LIPW = 1.5, LIPK = 1.30;
const NET = (cell, depth, sub, lipk) => {
  const K = lipk === undefined ? LIPK : lipk;
  return {
    warpAmp: 0.11 * cell, warpFreq: 2.4, wvarFreq: 0.85 / cell, rimBand: 0.11,
    layers: [
      { kind: 'voro', cell: cell, jitter: 0.78, width: WREL * cell, core: 0.30, depth: depth, lip: K * depth, lipW: LIPW, asym: 0.78 },
    ].concat(sub ? [
      { kind: 'voro', cell: cell * 0.38, jitter: 0.85, width: WREL * cell * 0.38 * 1.15, core: 0.26, depth: depth * sub, lip: K * depth * sub, lipW: LIPW, asym: 0.85 },
    ] : []),
  };
};
const stripLip = (C) => {
  const O = JSON.parse(JSON.stringify(C));
  for (const L of O.layers) { L.lip = 0; L.asym = 1.0; }
  return O;
};

// cell sizes in screen px: 0.300 -> 86 px, 0.210 -> 60 px, 0.145 -> 41 px
const NET_W = NET(0.300, 0.22, 0.42);   // weit   -- 86 px cells / 17 px furrows
const NET_M = NET(0.210, 0.28, 0.42);   // mittel -- 60 px cells / 12 px furrows
const NET_S = NET(0.145, 0.34, 0.40);   // eng    -- 41 px cells /  8 px furrows
// the structure leg is the one that has to carry this pair, so the ladder needs a
// rung with headroom above it: same fine net, but the heaved wall raised to 1.9x
// depth (crevasse round 4 ran 1.95 on the much brighter glacier ground).
const NET_SX = NET(0.145, 0.34, 0.40, 1.90);

const GR_OF = (br) => 0.5 + 0.5 * br;   // tundra's own warm axis, to 3 decimals

const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const VARIANTS = [
  // ---- the isolating control: hue + level, NO cracks -----------------------
  { id: 'H70L27-none', br: 0.70, lum: 27, C: null, col: '#6e7681',
    label: 'B/R 0.70  L 27  NO CRACKS            [control: what hue+level alone buy]' },
  // ---- the crack axis at the centre hue and level -------------------------
  { id: 'H70L27-weit', br: 0.70, lum: 27, C: NET_W, col: '#79c0ff',
    label: 'B/R 0.70  L 27  net 86px/17px d.22   [weit]' },
  { id: 'H70L27M', br: 0.70, lum: 27, C: NET_M, col: '#7ee787',
    label: 'B/R 0.70  L 27  net 60px/12px d.28   [mittel -- the centre rung]' },
  { id: 'H70L27-eng', br: 0.70, lum: 27, C: NET_S, col: '#79c0ff',
    label: 'B/R 0.70  L 27  net 41px/ 8px d.34   [eng]' },
  { id: 'H70L27-engX', br: 0.70, lum: 27, C: NET_SX, col: '#7ee787',
    label: 'B/R 0.70  L 27  net 41px/ 8px d.34 wall1.9  [eng + strong heaved wall]' },
  { id: 'H70L27M-nolip', br: 0.70, lum: 27, C: stripLip(NET_M), col: '#8b949e',
    label: 'B/R 0.70  L 27  net 60px/12px d.28   [mittel, NO bright wall]' },
  // ---- the hue axis at the centre level and net ---------------------------
  { id: 'H74L27M', br: 0.74, lum: 27, C: NET_M, col: '#ffa657',
    label: 'B/R 0.74  L 27  net 60px/12px d.28   [hue one step back toward tundra]' },
  { id: 'H66L27M', br: 0.66, lum: 27, C: NET_M, col: '#ffa657',
    label: 'B/R 0.66  L 27  net 60px/12px d.28   [hue one step further into tholin]' },
  // ---- the level axis at the centre hue and net ---------------------------
  { id: 'H70L28M', br: 0.70, lum: 28, C: NET_M, col: '#d2a8ff',
    label: 'B/R 0.70  L 28  net 60px/12px d.28   [level one step back toward tundra]' },
  { id: 'H70L26M', br: 0.70, lum: 26, C: NET_M, col: '#d2a8ff',
    label: 'B/R 0.70  L 26  net 60px/12px d.28   [level one step further down]' },
  // Rudi asked for 26-28, and none of that range makes the corpus' own level bar
  // (|dL| >= 6.0) fire -- tundra sits at 30.8. This rung is OUTSIDE the requested
  // range on purpose, so the price of a formally firing second leg is a number and
  // not a guess. It is still far from ice_shelf (L 22.0) and nowhere near it in hue.
  { id: 'H70L245M', br: 0.70, lum: 24.5, C: NET_M, col: '#f0883e',
    label: 'B/R 0.70  L 24.5 net 60px/12px d.28  [BELOW the asked range: what a firing level leg costs]' },
  // ... and the answer to what that costs: micro8 scales with the tile's own
  // brightness, so dropping the level pulls the STRUCTURE leg back down again --
  // L 24.5 with the mittel net fires level and loses structure. This rung pairs
  // the low level with the strong fine net so BOTH can fire at once. It is the
  // only rung in the ladder that reaches 2 of 3 on the corpus' own rule.
  { id: 'H70L245-engX', br: 0.70, lum: 24.5, C: NET_SX, col: '#f0883e',
    label: 'B/R 0.70  L 24.5 net 41px/8px d.34 wall1.9  [the only 2-of-3 rung]' },
];

(async () => {
  fs.mkdirSync(WORK, { recursive: true });

  // ---- the frozen source, and the guard that it IS what ships -------------
  const TU = [], TUB = [];
  for (let n = 0; n < 4; n++) {
    const f = path.join(SRCD, 'tundra_' + n + '_src.webp');
    const origin = path.join(TILES, 'tundra', 'tundra_' + n + '.webp');
    if (!fs.readFileSync(f).equals(fs.readFileSync(origin))) {
      console.log('[freeze] WARNING tundra_' + n + ' frozen copy DIFFERS from src/assets/tiles/tundra/');
    }
    const s = await statsOf(f);
    s.micro = await microContrast(f);
    s.micro4 = await microQuarter(f);
    s.rim = await rimHalo(f); s.rimFis = await rimGroove(f);
    s.chrPng = s.chromaRes;   // the shipped tundra IS a webp; there is no pre-encode file for it
    TU.push(s); TUB.push(f);
  }
  const tAvg = (f) => TU.reduce((a, s) => a + f(s), 0) / 4;
  const TU_L = tAvg((s) => s.lum), TU_BR = tAvg((s) => s.br), TU_GR = tAvg((s) => s.gr);
  const TU_M8 = tAvg((s) => s.micro), TU_M4 = tAvg((s) => s.micro4);
  console.log('[tundra frozen]  L ' + f2(TU_L) + '  intL ' + f1(tAvg((s) => s.intLum)) +
    '  B/R ' + f3(TU_BR) + '  G/R ' + f3(TU_GR) + '  micro8 ' + f2(TU_M8) + '  micro4 ' + f2(TU_M4) +
    '  chr% ' + f2(100 * tAvg((s) => s.chromaRes)) + '  dark% ' + f1(100 * tAvg((s) => s.darkFrac)) +
    '  rimG% ' + f1(100 * tAvg((s) => s.rimFis)) + '  tY ' + f2(tAvg((s) => s.tiltY)) + '\n');

  const results = [];
  {
    const bufs = [];
    for (let n = 0; n < 4; n++) bufs.push(await sharp(fs.readFileSync(TUB[n])).png().toBuffer());
    results.push({ V: { id: 'TUNDRA', label: 'tundra as shipped (the source AND the risk pair)', col: '#e6edf3', ref: true }, bufs: bufs, slots: TU, files: TUB.slice() });
  }

  for (const Vr of VARIANTS) {
    if (ONLY && ONLY.indexOf(Vr.id) < 0) continue;
    const t0 = Date.now();
    const outDir = path.join(WORK, Vr.id);
    fs.mkdirSync(outDir, { recursive: true });
    const grT = GR_OF(Vr.br);
    const bufs = [], slots = [], files = [], notes = [];
    for (let n = 0; n < 4; n++) {
      const seed = 7700000 + n * 65539;           // per-slot seed: the lever against a stamp
      const R = await proceduralBase(TUB[n], seed, Vr.C);
      notes.push('slot ' + n + ' seed ' + seed + ' ink ' + f3(R.ink) + ' lit ' + f3(R.lit) +
        ' rimInk/coreInk ' + f2(R.inkCore > 0 ? R.inkRim / R.inkCore : 0));
      const out = path.join(outDir, 'permafrost_' + n + '.webp');
      const m = await solveTile(R.data, R.info.width, R.info.height, R.info.channels, out, Vr.lum, Vr.br, grT);
      const outPng = path.join(outDir, 'permafrost_' + n + '.png');
      fs.writeFileSync(outPng, m.png);
      bufs.push(m.png); files.push(out);
      const s = await statsOf(out);
      // chroma BEFORE the webp encode. libwebp lossy is always YUV 4:2:0, and the
      // tholin grade drops the blue channel ~21%, so the same absolute chroma
      // quantization error becomes a larger relative one. That inflates the
      // measured chr% without any colour actually having been added -- the PNG
      // column is the truth, the webp column is what the decoder hands the game.
      s.chrPng = (await statsOf(outPng)).chromaRes;
      s.micro = await microContrast(out);
      s.micro4 = await microQuarter(out);
      s.rim = await rimHalo(out); s.rimFis = await rimGroove(out);
      s.nccId = await ncc(out, TUB[n], false, false);
      s.nccFlop = await ncc(out, TUB[n], true, false);
      s.nccFlip = await ncc(out, TUB[n], false, true);
      s.nccHV = await ncc(out, TUB[n], true, true);
      const gn = await groundNcc(out, TUB[n]);
      s.gnFine = gn.fine; s.gnBlur = gn.blur12;
      slots.push(s);
    }
    // stamp proof -- worst pairwise slot-vs-slot NCC over all four orientations
    let worst = 0, worstPair = '';
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      for (const o of [[false, false], [true, false], [false, true], [true, true]]) {
        const v = Math.abs(await ncc(files[a], files[b], o[0], o[1]));
        if (v > worst) { worst = v; worstPair = a + 'x' + b; }
      }
    }
    results.push({ V: Vr, bufs: bufs, slots: slots, files: files, notes: notes, stamp: worst, stampPair: worstPair, grT: grT });
    console.log('[' + Vr.id.padEnd(14) + '] built in ' + f1((Date.now() - t0) / 1000) + 's');
  }

  // ---- field metrics ------------------------------------------------------
  for (const R of results) {
    const rnd = mulberry32(4242);
    const F = await isoField(R.bufs, TILE_W, TILE_H, 10, 6, () => Math.floor(rnd() * 4));
    const Lf = await lumaOf(F.png);
    R.gFull = gridMetrics(Lf.L, Lf.w, Lf.h, F.cells, TILE_W, TILE_H);
    R.bs = boundaryStep(Object.assign({}, F, { L: Lf.L, w: Lf.w, h: Lf.h }));
    const rnd2 = mulberry32(4242);
    const P = await isoField(R.bufs, PLAY_W, PLAY_H, 50, 30, () => Math.floor(rnd2() * 4));
    const Lp = await lumaOf(P.png);
    R.gPlay = gridMetrics(Lp.L, Lp.w, Lp.h, P.cells, PLAY_W, PLAY_H);
    const Pv = await vacuum(P.png);
    const Lpv = await lumaOf(Pv);
    R.gPlayVac = gridMetrics(Lpv.L, Lpv.w, Lpv.h, P.cells, PLAY_W, PLAY_H);
    R.sep = R.V.ref ? null : await separability(R.bufs, results[0].bufs, false);
    R.sepVac = R.V.ref ? null : await separability(R.bufs, results[0].bufs, true);
    const avg = (f) => R.slots.reduce((a, s) => a + f(s), 0) / 4;
    console.log('[' + R.V.id.padEnd(14) + '] L ' + f1(avg((s) => s.lum)).padStart(5) +
      '  B/R ' + f3(avg((s) => s.br)) +
      '  micro8 ' + f2(avg((s) => s.micro)).padStart(6) + ' (x' + f2(avg((s) => s.micro) / TU_M8) + ')' +
      '  blow ' + f2(100 * Math.max.apply(null, R.slots.map((s) => s.blow))) + '%' +
      '  GRIDplay ' + f2(R.gPlay.gridTot).padStart(5) + ' (coh ' + f2(R.gPlay.gridCoh) + ')' +
      (R.sep ? "   d'lvl " + f2(R.sep.dLevel) + "  d'tex " + f2(R.sep.dTexture) + "  JOINT " + f2(R.sep.dJoint) : '   (the reference)'));
  }

  // ======================================================================
  // FOLD IMAGE helper (used both in the per-rung sheet and the fold panel)
  // ======================================================================
  const AMP_RANGE = 30;
  const foldImage = async (fold, w, h) => {
    const Bn = fold.BINS;
    const out = Buffer.alloc(w * h * 4);
    const cx = (w - 1) / 2, cy = (h - 1) / 2;
    for (let y2 = 0; y2 < h; y2++) for (let x2 = 0; x2 < w; x2++) {
      const i = (y2 * w + x2) * 4;
      const dxn = (x2 - cx) / (w / 2), dyn = (y2 - cy) / (h / 2);
      if (Math.abs(dxn) + Math.abs(dyn) > 1) { out[i + 3] = 0; continue; }
      const du = (dxn + dyn) / 2, dv = (dxn - dyn) / 2;
      let bu = Math.floor((du + 0.5) * Bn); if (bu < 0) bu = 0; if (bu >= Bn) bu = Bn - 1;
      let bv = Math.floor((dv + 0.5) * Bn); if (bv < 0) bv = 0; if (bv >= Bn) bv = Bn - 1;
      const b = bu * Bn + bv;
      if (fold.cn[b] <= 0) { out[i + 3] = 0; continue; }
      let g = 128 + ((fold.cs[b] / fold.cn[b] - fold.mean) / AMP_RANGE) * 110;
      g = g < 0 ? 0 : g > 255 ? 255 : Math.round(g);
      out[i] = out[i + 1] = out[i + 2] = g; out[i + 3] = 255;
    }
    return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  };

  // ======================================================================
  // PER-RUNG CONTACT SHEETS -- tundra always next to it
  // ======================================================================
  const REF = results[0];
  const SW = 2400, PAD = 18;
  const QUESTION = 'THE QUESTION OVER THIS SHEET:  on play scale, can you tell a permafrost area from a tundra area?';
  if (process.env.NOSHEETS) console.log('[NOSHEETS] contact sheets skipped');
  else for (const R of results) {
    const comp = []; let y = PAD;
    const line = (t, size, fill) => {
      size = size || 13;
      comp.push({ input: label(t, SW - PAD * 2, size, fill || '#c9d1d9'), left: PAD, top: y });
      y += size + 7;
    };
    const avg = (f) => R.slots.reduce((a, s) => a + f(s), 0) / 4;
    const mL = avg((s) => s.lum), mb = avg((s) => s.br), mg = avg((s) => s.gr), mM = avg((s) => s.micro);
    const worstBlow = Math.max.apply(null, R.slots.map((s) => s.blow));
    const worstRim = Math.max.apply(null, R.slots.map((s) => s.rim));

    line('PERMAFROST FROM TUNDRA -- ' + R.V.label, 19, R.V.col);
    line(QUESTION, 17, '#ffa657');
    line('STYLE TEST, nothing written to src/assets/tiles/. Vorlage: PLUTO tholins (reddish-brown = the DARK terrain) + PATTERNED GROUND (polygonal frost cracks). ' +
      'The net is a multiplier (1-dark)(1+bright) on the FROZEN shipped tundra, evaluated at 2x and box-downsampled -- no upscale, no second flatten, no equalization. ' +
      'Level solved on the CANVAS MEAN L (it is an axis here, not an output). ' + new Date().toISOString().slice(0, 16), 13, '#8b949e');
    if (R.notes) line('per-slot: ' + R.notes.join('   |   '), 13, '#8b949e');
    y += 4;
    line('  slot     L    intL     p30     p50     p70    B/R    G/R     sd  chr%  dark%  blow%  micro8  micro4   tiltX   tiltY    rim   rimG%   groundNCC fine/blur12   NCC vs tundra n  id/flop/flip/hv', 13, '#8b949e');
    for (let n = 0; n < 4; n++) {
      const s = R.slots[n];
      line('   ' + n + '  ' + f1(s.lum).padStart(6) + f1(s.intLum).padStart(8) + f1(s.p30).padStart(8) + f1(s.p50).padStart(8) + f1(s.p70).padStart(8) +
        f3(s.br).padStart(7) + f3(s.gr).padStart(7) + f1(s.sd).padStart(7) +
        f2(s.chromaRes * 100).padStart(6) + f1(s.darkFrac * 100).padStart(7) + f2(s.blow * 100).padStart(7) +
        f2(s.micro).padStart(8) + f2(s.micro4).padStart(8) + f1(s.tiltX).padStart(8) + f1(s.tiltY).padStart(8) +
        ((s.rim >= 0 ? '+' : '') + f2(s.rim)).padStart(7) + f1(100 * s.rimFis).padStart(8) + '   ' +
        (s.gnFine !== undefined ? (f2(s.gnFine) + ' / ' + f2(s.gnBlur)).padStart(15) : '              -') + '     ' +
        (s.nccId !== undefined ? (f2(s.nccId) + ' / ' + f2(s.nccFlop) + ' / ' + f2(s.nccFlip) + ' / ' + f2(s.nccHV)) : '(the reference itself)'), 13, '#c9d1d9');
    }
    y += 6;

    if (!R.V.ref) {
      line('THE THREE LEGS AGAINST TUNDRA -- reported separately, because no single one carries this pair', 15, '#ffa657');
      const dL = mL - TU_L, dB = mb - TU_BR, dG = mg - TU_GR, rM = mM / TU_M8;
      const legHue = Math.abs(dB) >= 0.30 || Math.abs(dG) >= 0.20;
      const legLvl = Math.abs(dL) >= 6;
      const legStr = rM >= 1.6 || rM <= 0.62;
      line('    LEG 1  HUE        B/R ' + f3(mb) + ' vs tundra ' + f3(TU_BR) + '   dB/R ' + ((dB >= 0 ? '+' : '') + f3(dB)) +
        '   |   G/R ' + f3(mg) + ' vs ' + f3(TU_GR) + '   dG/R ' + ((dG >= 0 ? '+' : '') + f3(dG)) +
        '      corpus bar |dB/R| >= 0.30 or |dG/R| >= 0.20  ->  ' + (legHue ? 'CARRIES' : 'does NOT carry on its own'),
        13, legHue ? '#7ee787' : '#8b949e');
      line('    LEG 2  LEVEL      canvas L ' + f1(mL) + ' vs tundra ' + f1(TU_L) + '   dL ' + ((dL >= 0 ? '+' : '') + f1(dL)) +
        '                                        corpus bar |dL| >= 6.0                     ->  ' + (legLvl ? 'CARRIES' : 'does NOT carry on its own'),
        13, legLvl ? '#7ee787' : '#8b949e');
      line('    LEG 3  STRUCTURE  micro8 ' + f2(mM) + ' vs tundra ' + f2(TU_M8) + '   ratio x' + f2(rM) +
        '   |   micro4 ' + f2(avg((s) => s.micro4)) + ' vs ' + f2(TU_M4) + '  x' + f2(avg((s) => s.micro4) / TU_M4) +
        '     corpus bar ratio >= 1.60             ->  ' + (legStr ? 'CARRIES' : 'does NOT carry on its own'),
        13, legStr ? '#7ee787' : '#ff7b72');
      const nlegs = (legHue ? 1 : 0) + (legLvl ? 1 : 0) + (legStr ? 1 : 0);
      line('    ==> ' + nlegs + ' of 3 corpus legs fire. The corpus rule wants >= 2. Whether the three TOGETHER carry is answered by the play-scale d\' below, ' +
        'which is the finer instrument: it measures two AREAS at 48x24 px per tile, not two numbers.', 13, nlegs >= 2 ? '#7ee787' : '#ffa657');
      y += 6;
      const gnf = avg((s) => s.gnFine), gnb = avg((s) => s.gnBlur);
      line('GROUND SURVIVAL   full-tile NCC against the frozen tundra: fine ' + f2(gnf) + '   blur12 ' + f2(gnb) +
        '     the net is a multiply, so the ground IS tundra by construction -- this is the guard, not the question', 13,
        gnf >= 0.90 ? '#7ee787' : gnf >= 0.75 ? '#ffa657' : '#ff7b72');
    }
    line('HUE            B/R ' + f3(mb) + ' (target ' + f3(R.V.br || TU_BR) + ')   G/R ' + f3(mg) + ' (target ' + f3(R.grT || TU_GR) +
      ' = 0.5 + 0.5 x B/R, tundra\'s own axis)   residual chroma ' + f2(100 * avg((s) => s.chromaRes)) + '% on the webp / ' + f2(100 * avg((s) => s.chrPng)) +
      '% on the PNG before the encode  (tundra ' + f2(100 * tAvg((s) => s.chromaRes)) + '%)  -- the webp figure is a YUV 4:2:0 artifact of the lowered blue channel, not added colour', 13, '#ffa657');
    line('LEVEL          canvas mean L ' + f1(mL) + ' (target ' + (R.V.lum || TU_L) + ')   interior L ' + f1(avg((s) => s.intLum)) +
      '   p30/p50/p70 ' + f1(avg((s) => s.p30)) + ' / ' + f1(avg((s) => s.p50)) + ' / ' + f1(avg((s) => s.p70)), 13, '#ffa657');
    line('DARK AREA      ' + f1(100 * avg((s) => s.darkFrac)) + '% of the tile below 0.55x its own p50   tundra ' + f1(100 * tAvg((s) => s.darkFrac)) +
      '%   [tundra is already at 8.7% -- this column is NOT a crack signal here]', 13, '#8b949e');
    line('BLOWOUT        worst slot ' + f2(100 * worstBlow) + '%   (bar: < 1.00%)', 13, worstBlow < 0.01 ? '#7ee787' : '#ff7b72');
    line('RIM HALO       worst slot ' + ((worstRim >= 0 ? '+' : '') + f2(worstRim)) + '     must not go positive (uniform plane, no divide-by-blur)', 13, worstRim <= 0.3 ? '#7ee787' : '#ff7b72');
    line('RIM GROOVE     ' + f1(100 * avg((s) => s.rimFis)) + '% of the diamond rim band is furrow rather than ground  (tundra ' + f1(100 * tAvg((s) => s.rimFis)) +
      '%)  -- a furrow that stops at the tile edge cannot be continued by a random neighbour', 13,
      avg((s) => s.rimFis) < 0.07 ? '#7ee787' : avg((s) => s.rimFis) < 0.12 ? '#ffa657' : '#ff7b72');
    line('BOUNDARY STEP  step ' + f2(R.bs.step) + '   interior roughness ' + f2(R.bs.rough) + '   RATIO ' + f2(R.bs.ratio), 13, '#ffa657');
    if (R.stamp !== undefined) line('STAMP PROOF    worst pairwise slot-vs-slot NCC over all 4 orientations ' + f2(R.stamp) + '  (pair ' + R.stampPair +
      ')  -- the four slots share the tundra ground, so this cannot go to zero; what matters is that it does not RISE with the net', 13, '#8b949e');
    line('GRID INDEX     lattice fold of the tessellated field, rim band excluded (max(|du|,|dv|) <= ' + RIM_CUT + ')', 13, '#ffa657');
    for (const pair of [['FULL RES', R.gFull], ['PLAY 48x24', R.gPlay], ['PLAY + VACUUM', R.gPlayVac]]) {
      const g = pair[1];
      line('      ' + pair[0].padEnd(14) + 'grid_tot ' + f2(g.gridTot) + ' L   (COHERENT ' + f2(g.gridCoh) + ' = the same shape on all four slots, SLOT-DEPENDENT ' + f2(g.gridSlot) +
        ')   ramp_pp ' + f2(g.rampPP) + '   sd_within ' + f2(g.sdWithin) +
        '   ratio ' + f3(g.ratio) + '   ' + f2(g.pctOfMean) + '% of mean ' + f1(g.mean), 13, '#8b949e');
    }
    line('    reference at PLAY scale: tundra 2.57 (coh 1.42)  |  glacier 5.79 (coh 3.22)  |  ice_shelf 7.10  |  REJECTED old tundra 10.40  -- the bar is < 10.40, the aim coh <= 3.22', 13, '#8b949e');
    y += 6;
    if (R.sep) {
      line("SEPARABILITY FROM TUNDRA at play scale -- d' over the per-tile distribution of a 40x24 field, split into level and texture", 15, '#ffa657');
      for (const pair of [['plain', R.sep], ['under vacuum', R.sepVac]]) {
        const S = pair[1];
        line('    ' + pair[0].padEnd(14) +
          'tile mean L  permafrost ' + f1(S.A.m) + ' +-' + f1(S.A.msd) + '   tundra ' + f1(S.B.m) + ' +-' + f1(S.B.msd) + "   d'level " + f2(S.dLevel) +
          '        within-tile sd  permafrost ' + f1(S.A.s) + ' +-' + f1(S.A.ssd) + '   tundra ' + f1(S.B.s) + ' +-' + f1(S.B.ssd) + "   d'texture " + f2(S.dTexture) +
          "        JOINT " + f2(S.dJoint), 13,
          S.dJoint >= 1.0 ? '#7ee787' : S.dJoint >= 0.6 ? '#ffa657' : '#ff7b72');
      }
      line("    d' >= 1.0 = an area of one is told from an area of the other;  d' < 0.5 = the same tile with two names.", 13, '#8b949e');
      y += 6;
    }
    line('PAIR DISTANCES (same planet)', 13, '#ffa657');
    line('    neighbour              dL     dB/R    dG/R   micro8 ratio   legs', 13, '#8b949e');
    for (const nb of NEIGH) {
      const dL = mL - nb.lum, dB = mb - nb.br, dG = mg - nb.gr, rM = mM / nb.micro;
      const legs = [];
      if (Math.abs(dL) >= 6) legs.push('level');
      if (Math.abs(dB) >= 0.30 || Math.abs(dG) >= 0.20) legs.push('hue');
      if (rM >= 1.6 || rM <= 0.62) legs.push('structure');
      line('    ' + nb.id.padEnd(22) + ((dL >= 0 ? '+' : '') + f1(dL)).padStart(6) +
        ((dB >= 0 ? '+' : '') + f2(dB)).padStart(8) + ((dG >= 0 ? '+' : '') + f2(dG)).padStart(8) +
        f2(rM).padStart(13) + '   ' + (legs.length ? legs.join(' + ') : 'NO LEG -- too close'),
        13, legs.length >= 2 ? '#7ee787' : legs.length ? '#ffa657' : '#ff7b72');
    }
    y += 10;

    // --- the four slots, tundra's four underneath ---
    const TW = 570, TH = 285, GAP = 12;
    line('THE FOUR SLOTS at 1:1                                                                                                              (tundra\'s own four underneath)', 15, '#7ee787');
    let rowY = y;
    for (let n = 0; n < 4; n++) {
      const cx = PAD + n * (TW + GAP);
      comp.push({ input: label('slot ' + n, TW, 13, '#c9d1d9'), left: cx, top: rowY });
      comp.push({ input: await sharp(R.bufs[n]).resize(TW, TH, { fit: 'fill' }).png().toBuffer(), left: cx, top: rowY + 20 });
      comp.push({ input: label('tundra ' + n, TW, 13, '#6e7681'), left: cx, top: rowY + 20 + TH + 4 });
      comp.push({ input: await sharp(REF.bufs[n]).resize(TW, TH, { fit: 'fill' }).png().toBuffer(), left: cx, top: rowY + 20 + TH + 22 });
    }
    y = rowY + 20 + TH + 22 + TH + 16;

    // --- closed 2x2 repeat, permafrost | tundra ---
    const F22 = await isoField(R.bufs, TILE_W, TILE_H, 4, 3, (r, c) => ((r % 2) * 2 + (c % 2)));
    const G22 = await isoField(REF.bufs, TILE_W, TILE_H, 4, 3, (r, c) => ((r % 2) * 2 + (c % 2)));
    line('THE CLOSED 2x2 REPEAT at 1:1 -- every slot touches every other slot, all four seam types          |          TUNDRA, same 2x2', 15, '#7ee787');
    const s22 = Math.min(1, ((SW - PAD * 3) / 2) / F22.w);
    const w22 = Math.round(F22.w * s22), h22 = Math.round(F22.h * s22);
    comp.push({ input: await sharp(F22.png).resize(w22, h22).png().toBuffer(), left: PAD, top: y });
    comp.push({ input: await sharp(G22.png).resize(w22, h22).png().toBuffer(), left: PAD + w22 + PAD, top: y });
    y += h22 + 14;

    // --- full-res random field, permafrost | tundra ---
    const rndD = mulberry32(90210);
    const FD = await isoField(R.bufs, TILE_W, TILE_H, 6, 4, () => Math.floor(rndD() * 4));
    const rndG = mulberry32(90210);
    const GD = await isoField(REF.bufs, TILE_W, TILE_H, 6, 4, () => Math.floor(rndG() * 4));
    line('FULL RES interlocking field, identical random draw -- permafrost          |          tundra', 15, '#7ee787');
    const fdScale = Math.min(1, ((SW - PAD * 3) / 2) / FD.w);
    const fw = Math.round(FD.w * fdScale), fh = Math.round(FD.h * fdScale);
    comp.push({ input: await sharp(FD.png).resize(fw, fh).png().toBuffer(), left: PAD, top: y });
    comp.push({ input: await sharp(GD.png).resize(fw, fh).png().toBuffer(), left: PAD + fw + PAD, top: y });
    y += fh + 14;

    // --- play scale + vacuum, permafrost over tundra ---
    const rndP = mulberry32(90210);
    const PD = await isoField(R.bufs, PLAY_W, PLAY_H, 44, 22, () => Math.floor(rndP() * 4));
    const PDv = await vacuum(PD.png);
    const rndPG = mulberry32(90210);
    const PG = await isoField(REF.bufs, PLAY_W, PLAY_H, 44, 22, () => Math.floor(rndPG() * 4));
    const PGv = await vacuum(PG.png);
    line('PLAY SCALE 48x24 px per tile (zoom 1.0)      |      the SAME field under the VACUUM darkening rgba(5,10,25,0.45)      -- permafrost on top, TUNDRA below', 15, '#7ee787');
    comp.push({ input: PD.png, left: PAD, top: y });
    comp.push({ input: PDv, left: PAD + PD.w + 26, top: y });
    y += PD.h + 6;
    comp.push({ input: PG.png, left: PAD, top: y });
    comp.push({ input: PGv, left: PAD + PG.w + 26, top: y });
    y += PG.h + 14;

    // --- 1:1 junction crop, plain | vacuum ---
    const CW = Math.min(1120, FD.w - 20), CH2 = Math.min(500, FD.h - 20);
    const FDv = await vacuum(FD.png);
    const cl = Math.round(FD.w / 2 - CW / 2), ct = Math.round(FD.h / 2 - CH2 / 2);
    line('1:1 crop of a four-tile junction      |      the same crop under the VACUUM darkening   -- watch the furrows at the tile edges', 15, '#7ee787');
    comp.push({ input: await sharp(FD.png).extract({ left: cl, top: ct, width: CW, height: CH2 }).png().toBuffer(), left: PAD, top: y });
    comp.push({ input: await sharp(FDv).extract({ left: cl, top: ct, width: CW, height: CH2 }).png().toBuffer(), left: PAD + CW + 26, top: y });
    y += CH2 + 14;

    // --- the fold map for THIS rung, next to tundra's ---
    line('THE FOLD MAP -- the whole tessellated field folded onto ONE tile through the iso lattice and averaged. What survives IS the visible lattice. ' +
      'grey 128 = field mean, +-' + AMP_RANGE + ' luma -> +-110.   this rung          |          tundra', 15, '#7ee787');
    const FW = 700, FH = 350;
    comp.push({ input: await foldImage(R.gFull.fold, FW, FH), left: PAD, top: y + 20 });
    comp.push({ input: label('FULL ' + f2(R.gFull.gridTot) + ' (coh ' + f2(R.gFull.gridCoh) + ' slot ' + f2(R.gFull.gridSlot) + ')  |  PLAY ' +
      f2(R.gPlay.gridTot) + ' (coh ' + f2(R.gPlay.gridCoh) + ')  ratio ' + f2(R.gPlay.ratio), FW, 13, R.V.col), left: PAD, top: y });
    comp.push({ input: await foldImage(REF.gFull.fold, FW, FH), left: PAD + FW + 26, top: y + 20 });
    comp.push({ input: label('tundra   FULL ' + f2(REF.gFull.gridTot) + ' (coh ' + f2(REF.gFull.gridCoh) + ')  |  PLAY ' +
      f2(REF.gPlay.gridTot) + ' (coh ' + f2(REF.gPlay.gridCoh) + ')', FW, 13, '#6e7681'), left: PAD + FW + 26, top: y });
    y += 20 + FH + PAD;

    const out = path.join(ST, '_permafrost_' + R.V.id + '.png');
    fs.writeFileSync(out, await sharp({ create: { width: SW, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[sheet] ' + path.basename(out));
    R.playField = PD.png; R.playVac = PDv;
  }

  // ======================================================================
  // DECISION PANELS
  // ======================================================================
  if (!process.env.NOSHEETS) for (const trio of [
    ['playscale', 'playField', 'PLAY SCALE 48x24 px per tile (zoom 1.0). This is where it is decided. TUNDRA is the TOP row -- the question is whether the rest look different from it AND do not read as a repeat.'],
    ['vacuum', 'playVac', 'PLAY SCALE under the VACUUM darkening rgba(5,10,25,0.45) -- airless ice body. TUNDRA is the TOP row.'],
  ]) {
    const comp = []; let y = PAD, maxW = 0;
    comp.push({ input: label('PERMAFROST FROM TUNDRA -- ' + trio[2], 2900, 19, '#e6edf3'), left: PAD, top: y }); y += 30;
    comp.push({ input: label('every rung holds tiltY 3.0 / tiltX 0.0, G/R = 0.5 + 0.5 x B/R, the same per-slot seeds and the same random draw. The ground is the frozen shipped tundra under a multiplier.', 2900, 13, '#8b949e'), left: PAD, top: y }); y += 24;
    for (const R of results) {
      const avg = (f) => R.slots.reduce((a, s) => a + f(s), 0) / 4;
      comp.push({
        input: label(R.V.label.padEnd(62) + 'L ' + f1(avg((s) => s.lum)).padStart(5) +
          '  B/R ' + f3(avg((s) => s.br)) +
          '  micro8 ' + f2(avg((s) => s.micro)).padStart(6) + ' x' + f2(avg((s) => s.micro) / TU_M8) +
          '  GRIDplay ' + f2(R.gPlay.gridTot) + ' (coh ' + f2(R.gPlay.gridCoh) + ')' +
          (R.sep ? "   d'lvl " + f2(R.sep.dLevel) + "  d'tex " + f2(R.sep.dTexture) + "  JOINT " + f2(R.sep.dJoint) : '   (tundra, the reference)'),
          2850, 15, R.V.col), left: PAD, top: y,
      });
      y += 22;
      const img = R[trio[1]];
      const m = await sharp(img).metadata();
      comp.push({ input: img, left: PAD, top: y });
      maxW = Math.max(maxW, m.width); y += m.height + 16;
    }
    const out = path.join(ST, '_permafrost_' + trio[0] + '.png');
    fs.writeFileSync(out, await sharp({ create: { width: Math.max(maxW, 2900) + PAD * 2, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[panel] ' + path.basename(out));
  }

  // ======================================================================
  // permafrost AND tundra in ONE field -- the recognisability threshold
  // ======================================================================
  if (!process.env.NOSHEETS) {
    const comp = []; let y = PAD, maxW = 0;
    comp.push({ input: label('PERMAFROST vs TUNDRA -- ONE FIELD, coherent patches, play scale. left plain, right under vacuum. THE question: can you see where one stops and the other starts?', 2900, 19, '#e6edf3'), left: PAD, top: y }); y += 28;
    comp.push({ input: label('patches alternate every 5 rows / 4 columns. This is the RISK PAIR: same source, adjacent level. If you cannot find the boundary, the rung has failed -- that is the whole test.', 2900, 13, '#8b949e'), left: PAD, top: y }); y += 24;
    for (const R of results) {
      if (R.V.ref) continue;
      const mg2 = await mixedField([R.bufs, results[0].bufs], PLAY_W, PLAY_H, 30, 22, 777);
      const mgv = await vacuum(mg2);
      const md = await sharp(mg2).metadata();
      comp.push({ input: label(R.V.label + "      d'level " + f2(R.sep.dLevel) + "   d'texture " + f2(R.sep.dTexture) + '   JOINT ' + f2(R.sep.dJoint) +
        '   |  under vacuum JOINT ' + f2(R.sepVac.dJoint), 2850, 15, R.V.col), left: PAD, top: y }); y += 22;
      comp.push({ input: mg2, left: PAD, top: y });
      comp.push({ input: mgv, left: PAD + md.width + 24, top: y });
      y += md.height + 18;
      maxW = Math.max(maxW, md.width * 2 + 24);
    }
    const out = path.join(ST, '_permafrost_vs_tundra.png');
    fs.writeFileSync(out, await sharp({ create: { width: Math.max(maxW, 2900) + PAD * 2, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[panel] ' + path.basename(out));
  }

  // ======================================================================
  // FOLD MAP PANEL -- all rungs side by side
  // ======================================================================
  if (!process.env.NOSHEETS) {
    const FW = 660, FH = 330, PER = 5, comp = []; let y = PAD;
    comp.push({ input: label('PERMAFROST -- THE FOLD MAP: the lattice, drawn.', 2400, 19, '#e6edf3'), left: PAD, top: y }); y += 30;
    comp.push({ input: label('the whole tessellated field folded onto ONE tile through the exact iso lattice and averaged. what survives IS the visible lattice. ' +
      'grey 128 = field mean, +-' + AMP_RANGE + ' luma -> +-110. a flat grey diamond is what you want; a drawn shape is a stamp the eye will find.', 2400, 13, '#8b949e'), left: PAD, top: y }); y += 26;
    let x = PAD, rowTop = y, rowMax = 0;
    for (let i = 0; i < results.length; i++) {
      const R = results[i];
      if (i > 0 && i % PER === 0) { rowTop = rowTop + rowMax; y = rowTop; x = PAD; rowMax = 0; }
      comp.push({ input: label(R.V.label, FW, 14, R.V.col), left: x, top: y });
      comp.push({
        input: label('FULL ' + f2(R.gFull.gridTot) + ' (coh ' + f2(R.gFull.gridCoh) + ' slot ' + f2(R.gFull.gridSlot) +
          ')   |   PLAY ' + f2(R.gPlay.gridTot) + ' (coh ' + f2(R.gPlay.gridCoh) + ')  ratio ' + f2(R.gPlay.ratio), FW, 13, '#8b949e'), left: x, top: y + 20,
      });
      comp.push({ input: await foldImage(R.gFull.fold, FW, FH), left: x, top: y + 40 });
      x += FW + 16; rowMax = Math.max(rowMax, 40 + FH + 22);
    }
    const out = path.join(ST, '_permafrost_foldmap.png');
    fs.writeFileSync(out, await sharp({ create: { width: PAD * 2 + PER * (FW + 16), height: rowTop + rowMax + PAD, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[panel] ' + path.basename(out));
  }

  // ======================================================================
  // NUMBERS
  // ======================================================================
  const txt = [];
  const T = (s) => txt.push(s);
  T('PERMAFROST FROM TUNDRA -- THE PATTERNED-GROUND LADDER  ' + new Date().toISOString().slice(0, 16) + '   (style test, nothing written to src/assets/tiles/)');
  T('VORLAGE: PLUTO tholins -- reddish-brown deposits that ARE the dark terrain, so "darker and redder" is one statement, not two. Plus PATTERNED GROUND:');
  T('  polygonal frost cracks closing into a honeycomb, which is what permafrost looks like on Earth and on icy bodies alike. A Voronoi cell net is the');
  T('  faithful AND the steerable form; the crevasse rounds already measured procedural beating flux on exactly this (grid_play 5.9-6.7 vs 12.2-17.9).');
  T('METHOD: the net is only ever a multiplier (1-dark)(1+bright) on the FROZEN shipped tundra -- the ground stays tundra by construction, groundNCC is the');
  T('  guard. Mask evaluated at 2x (1024x512) and box-downsampled: anti-aliasing, never an upscale. Rim fade to zero darkening in the last 11% of world');
  T('  distance before the diamond edge. No second flatten, no divide-by-blur equalization. Bright wall beside the dark furrow at ' + f2(LIPK) + 'x depth.');
  T('GRADE: tiltY ' + f1(TILT_Y) + ' / tiltX ' + f1(TILT_X) + ' like the rest of the ICE family; G/R = 0.5 + 0.5 x B/R (tundra sits exactly on that line at 0.820/0.906);');
  T('  and -- unlike the crevasse rounds -- the LEVEL is solved directly on the canvas mean L, because here it is a deliberate axis and not an output.');
  T('');
  T('  rung                                                              L     B/R    G/R   chr%  chrP%  dark%   blow%     sd  micro8    x tu  micro4     tY      tX    step  rough    s/r   rimG%   gNCC  stamp   GRIDfull    coh   slot   GRIDplay    coh   slot  ratio   GRIDvac    d\'lvl   d\'tex  d\'JOINT   d\'vac');
  for (const R of results) {
    const avg = (f) => R.slots.reduce((a, s) => a + f(s), 0) / 4;
    T('  ' + R.V.label.padEnd(62) +
      f1(avg((s) => s.lum)).padStart(5) + f3(avg((s) => s.br)).padStart(8) + f3(avg((s) => s.gr)).padStart(7) +
      f2(100 * avg((s) => s.chromaRes)).padStart(7) + f2(100 * avg((s) => s.chrPng)).padStart(7) + f1(100 * avg((s) => s.darkFrac)).padStart(7) +
      f2(100 * Math.max.apply(null, R.slots.map((s) => s.blow))).padStart(8) +
      f1(avg((s) => s.sd)).padStart(7) + f2(avg((s) => s.micro)).padStart(8) + f2(avg((s) => s.micro) / TU_M8).padStart(8) +
      f2(avg((s) => s.micro4)).padStart(8) +
      f1(avg((s) => s.tiltY)).padStart(7) + f1(avg((s) => s.tiltX)).padStart(8) +
      f2(R.bs.step).padStart(8) + f2(R.bs.rough).padStart(7) + f2(R.bs.ratio).padStart(7) +
      f1(100 * avg((s) => s.rimFis)).padStart(8) +
      (R.V.ref ? '      -' : f2(avg((s) => s.gnFine)).padStart(7)) +
      (R.stamp === undefined ? '      -' : f2(R.stamp).padStart(7)) +
      f2(R.gFull.gridTot).padStart(11) + f2(R.gFull.gridCoh).padStart(7) + f2(R.gFull.gridSlot).padStart(7) +
      f2(R.gPlay.gridTot).padStart(11) + f2(R.gPlay.gridCoh).padStart(7) + f2(R.gPlay.gridSlot).padStart(7) + f2(R.gPlay.ratio).padStart(7) +
      f2(R.gPlayVac.gridTot).padStart(10) +
      (R.sep ? f2(R.sep.dLevel).padStart(9) + f2(R.sep.dTexture).padStart(8) + f2(R.sep.dJoint).padStart(9) + f2(R.sepVac.dJoint).padStart(8) : '        -       -        -       -'));
  }
  T('');
  T('THE THREE LEGS AGAINST TUNDRA, SEPARATELY. The corpus rule wants at least two of three to fire. tundra: L ' + f1(TU_L) + ', B/R ' + f3(TU_BR) + ', G/R ' + f3(TU_GR) + ', micro8 ' + f2(TU_M8) + '.');
  T('  rung                                                        LEG1 hue dB/R  dG/R   fires   LEG2 level dL   fires   LEG3 struct micro8 x   fires    legs   d\'JOINT');
  for (const R of results) {
    if (R.V.ref) continue;
    const avg = (f) => R.slots.reduce((a, s) => a + f(s), 0) / 4;
    const mL = avg((s) => s.lum), mb = avg((s) => s.br), mg = avg((s) => s.gr), mM = avg((s) => s.micro);
    const dL = mL - TU_L, dB = mb - TU_BR, dG = mg - TU_GR, rM = mM / TU_M8;
    const h = Math.abs(dB) >= 0.30 || Math.abs(dG) >= 0.20, l = Math.abs(dL) >= 6, s3 = rM >= 1.6 || rM <= 0.62;
    T('  ' + R.V.label.padEnd(62) +
      ((dB >= 0 ? '+' : '') + f3(dB)).padStart(6) + ((dG >= 0 ? '+' : '') + f3(dG)).padStart(7) + (h ? '     YES' : '      no') +
      ((dL >= 0 ? '+' : '') + f1(dL)).padStart(16) + (l ? '     YES' : '      no') +
      ('x' + f2(rM)).padStart(22) + (s3 ? '     YES' : '      no') +
      ((h ? 1 : 0) + (l ? 1 : 0) + (s3 ? 1 : 0) + ' of 3').padStart(9) + f2(R.sep.dJoint).padStart(10));
  }
  T('');
  T('WHY d\' IS SO LARGE HERE, AND WHAT THE ABSOLUTE NUMBERS ARE. d\' divides the difference of the two per-tile MEANS by the rms of their SPREADS, and');
  T('tundra\'s four slots were deliberately levelled to each other (slot level sd 0.07 in the tilt run), so its spread is almost zero and any level shift');
  T('comes out as a huge d\'. That is real separation but it is not a perceptual scale, so the raw play-scale quantities are given here as well.');
  T('  rung                                                        play tile mean L    vs tundra       Weber   |   play within-tile sd   vs tundra      ratio');
  for (const R of results) {
    if (R.V.ref) continue;
    const S = R.sep;
    T('  ' + R.V.label.padEnd(62) +
      (f1(S.A.m) + ' +-' + f2(S.A.msd)).padStart(14) +
      ((S.A.m - S.B.m >= 0 ? '+' : '') + f2(S.A.m - S.B.m)).padStart(13) +
      f1(100 * (S.A.m - S.B.m) / S.B.m).padStart(9) + '%   |   ' +
      (f2(S.A.s) + ' +-' + f2(S.A.ssd)).padStart(14) +
      ((S.A.s - S.B.s >= 0 ? '+' : '') + f2(S.A.s - S.B.s)).padStart(13) +
      ('x' + f2(S.A.s / S.B.s)).padStart(11));
  }
  T('  tundra itself:                                                ' + f1(results[0] && results.find((r) => r.sep) ? results.find((r) => r.sep).sep.B.m : 0) +
    ' +-' + f2(results.find((r) => r.sep) ? results.find((r) => r.sep).sep.B.msd : 0) +
    '                             |   ' + f2(results.find((r) => r.sep) ? results.find((r) => r.sep).sep.B.s : 0) +
    ' +-' + f2(results.find((r) => r.sep) ? results.find((r) => r.sep).sep.B.ssd : 0));
  T('');
  T('MIRROR CONVENTION, PROVEN BY CROSS-CORRELATION. permafrost inherits its orientation from tundra because slot n IS tundra slot n with a multiplier on it,');
  T('and tundra already carries the corpus convention with the flop of slots 2/3 baked in (scripts/tundra-tilt3-integrate-prod.cjs). With tiltX 0 the flop');
  T('cannot be read off a ramp sign, so the proof is on the PATTERN: mean-centred masked NCC of each permafrost slot against its own tundra slot in all four');
  T('orientations. IDENTITY MUST WIN on every slot -- anything else would mean the net moved the base and the inherited rotation could no longer be assumed.');
  T('  rung                                                        slot 0 id/flop/flip/hv               slot 1                               slot 2 (flop inherited)              slot 3 (flop inherited)');
  for (const R of results) {
    if (R.V.ref) continue;
    let row = '  ' + R.V.label.padEnd(62);
    for (let n = 0; n < 4; n++) {
      const s = R.slots[n];
      row += (f2(s.nccId) + ' / ' + f2(s.nccFlop) + ' / ' + f2(s.nccFlip) + ' / ' + f2(s.nccHV)).padEnd(37);
    }
    T(row);
  }
  T('');
  T('PER-SLOT SEED AND INK (ink = mean darkening over the tile, lit = mean brightening; rimInk/coreInk shows the rim fade doing its job):');
  for (const R of results) if (R.notes) T('  ' + R.V.label.padEnd(62) + R.notes.join('   |   '));
  T('');
  T('WHAT THE COLUMNS ARE.');
  T('  L      = CANVAS mean luma over the whole 512x256 rect including the transparent corners (~50% of it), measured on the WRITTEN webp. tundra ' + f1(TU_L) + '.');
  T('  micro8 = mean |dL| between 4-neighbours on the 64x32 mip (8 screen px per mip pixel). tundra ' + f2(TU_M8) + '. THIS is leg 3 and it is the strongest one.');
  T('  micro4 = the same on the 128x64 mip. tundra ' + f2(TU_M4) + '. The play view at 48x24 sits between the two mips.');
  T('  chr%   = residual per-pixel chroma on the WRITTEN webp; chrP% the same on the PNG before the encode. libwebp lossy is always YUV 4:2:0 and the');
  T('           tholin grade lowers the blue channel about 21%, so the same absolute chroma quantization error becomes a larger RELATIVE one. chrP%');
  T('           stays at tundra\'s own level on every rung, i.e. no extra colour noise was created -- and at play scale the tile is downsampled ~10x,');
  T('           which averages the 4:2:0 noise away. Read chrP% as the colour, chr% as the encoder tax.');
  T('  dark%  = share of opaque pixels below 0.55x the tile\'s own p50. tundra is ALREADY at ' + f1(100 * tAvg((s) => s.darkFrac)) + '%, so this is not a crack signal here.');
  T('  rimG%  = share of the diamond rim band (1-6 px inside) darker than 0.80x p50, i.e. furrow rather than ground. tundra ' + f1(100 * tAvg((s) => s.rimFis)) + '%.');
  T('  grid   = sd, in luma units, over the 4 x BINS^2 slot-bin cells of the lattice fold = the tile\'s own LOW-FREQUENCY contrast at bin resolution.');
  T('           COH = the part identical on all four slots (literally a stamp). SLOT = the part that differs per slot. Bar: PLAY < 10.40, aim coh <= 3.22.');
  T('           reference at play scale: tundra 2.57 (coh 1.42) | glacier 5.79 (coh 3.22) | ice_shelf 7.10 | REJECTED old tundra 10.40.');
  T('  gNCC   = full-tile NCC against the frozen tundra. The multiply keeps the ground, so this must stay high; it is the guard, not the question.');
  T('  stamp  = worst pairwise slot-vs-slot NCC over all four orientations. The four slots share the tundra ground, so it cannot go to zero -- what');
  T('           matters is that adding the net does not RAISE it, i.e. the net is not the same picture four times.');
  T('  s/r    = boundary step over interior roughness. blow% = share of opaque pixels above Rec709 luma 200, bar < 1%.');
  T('  d\'     = separability from TUNDRA at play scale over the per-tile distribution of a 40x24 field: |mean difference| / rms of the two spreads.');
  T('           d\'level on tile mean luma, d\'texture on within-tile sd, JOINT = quadrature sum. >= 1.0 separated, < 0.5 the same tile with two names.');
  fs.writeFileSync(path.join(ST, '_permafrost_numbers.txt'), txt.join('\n') + '\n');
  fs.writeFileSync(path.join(WORK, 'ladder_stats.json'), JSON.stringify(
    results.map((R) => ({
      id: R.V.id, label: R.V.label, notes: R.notes, stamp: R.stamp,
      slots: R.slots.map((s) => Object.assign({}, s, { png: undefined })),
      bs: R.bs, sep: R.sep, sepVac: R.sepVac,
      gFull: Object.assign({}, R.gFull, { fold: undefined }),
      gPlay: Object.assign({}, R.gPlay, { fold: undefined }),
      gPlayVac: Object.assign({}, R.gPlayVac, { fold: undefined }),
    })), null, 1));
  console.log('\n' + txt.join('\n'));
  console.log('\n[out] _permafrost_numbers.txt  +  permafrost/ladder_stats.json');
})();
