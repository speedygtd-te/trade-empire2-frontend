/**
 * CREVASSE FROM GLACIER, ROUND 4 -- THE HAIRLINE NET.
 *
 * STYLE TEST. Writes only into assets/style-test/tiles/crevasse4/ and
 * assets/style-test/tiles/_crevasse4_*.png|txt. NOTHING is written to
 * src/assets/tiles/. No cap sync, no build, no git.
 *
 * WHY THIS ROUND EXISTS
 *   Rounds 1-3 cut DEEP gashes. A deep gash separates from glacier through
 *   DARKNESS: it drops the mean and paints large dark areas. That is why micro8
 *   never got past 12.4 and why dark% ran 6-25% against glacier's 2.4%. Rudi
 *   turned all three down and asked for the opposite: "die risse eher sehr
 *   dezent, nicht so tiefe wie bisher, sondern eher oberflaechliche".
 *
 *   A dense net of SHALLOW hairlines does the reverse arithmetic. It adds a lot
 *   of short edges (micro8 up) while barely moving the mean (level stays at
 *   glacier's 44) and never crossing the dark threshold (dark% stays at 2-3%).
 *   THE SEPARATION MUST COME OUT OF d'texture, NOT d'level. A level leg in the
 *   final table would mean the cracks got too deep again.
 *
 * THE VORLAGE (Rudi, round 4 addendum): Pluto, Europa, Ganymede.
 *   PLUTO / Sputnik Planitia -- a bright nitrogen-ice plain covered by a POLYGONAL
 *     NET OF SHALLOW TROUGHS (convection-cell boundaries). Literally a Voronoi
 *     network of soft grooves. This is the primary form; the ladder's main axis is
 *     its CELL SIZE relative to the tile.
 *   EUROPA -- lineae: long curved bands, frequently a BRIGHT CORE between darker
 *     margins. Round 2 measured that a bright edge beside a dark one buys the
 *     raster back (grid_play 9.39 -> 7.81) because the two partly cancel inside a
 *     fold bin. Here it is not a trick, it is the reference picture.
 *   GANYMEDE -- sulci: blocks of PARALLEL furrows at different headings that abut
 *     along sharp domain boundaries. The directed answer to Pluto's isotropic one.
 *
 * THE GROUND IS GLACIER, UNTOUCHED. Everything below produces a multiplier map
 *   m = (1 - dark) * (1 + bright) which is applied to the frozen shipped glacier
 *   tile. It is achromatic, so B/R and G/R come through unchanged, and the chroma
 *   cap is set to glacier's OWN residual chroma so the desaturation step is a
 *   no-op -- "glacier ist perfekt" is taken literally. groundNCC ~1.0 is the guard.
 *
 * NO UPSCALE. The mask is evaluated at 2x (1024x512) and box-downsampled to
 *   512x256, which is anti-aliasing, not upscaling -- a 4 px hairline drawn at 1x
 *   would be a staircase. The tile itself is never resized.
 *
 * NO SECOND FLATTEN, per rounds 1-3.
 *
 * GRADE: B/R 1.100, G/R 1.060, tiltY 3.0 / tiltX 0.0, level solved on the ground's
 *   p70 = glacier's own. Whole-tile mean L is an OUTPUT, never dialled in.
 *
 * RIM FADE: dark and bright both ramp to zero in the last 11% of world distance
 *   before the diamond edge, so a groove closes up INSIDE the tile instead of
 *   announcing a continuation the random neighbour cannot deliver. One rung runs
 *   the fade to a floor of 0.30 instead of 0 so the cost of the clean rim ring is
 *   visible as a number rather than as an opinion.
 *
 * MEASURED ON THE WRITTEN .webp, NEVER ON THE BUFFER. sharp.cache(false).
 *
 * Usage: node scripts/tiles-crevasse-r4-hairline.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const SRCD = path.join(ST, 'crevasse4', 'src');
const WORK = path.join(ST, 'crevasse4');

const TILE_W = 512, TILE_H = 256;
const SS = 2, MW = TILE_W * SS, MH = TILE_H * SS;
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const TILT_Y = 3.0, TILT_X = 0.0;
const BR_T = 1.100, GR_T = 1.060;
const SOLVE_PASSES = 5;

const VAC_A = 0.45, VAC_RGB = [5, 10, 25];
const PLAY_W = 48, PLAY_H = 24;

const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);

// ==========================================================================
// world <-> screen. The diamond maps onto the unit square in world coords, so a
// groove drawn as a straight line in (u,v) lies IN THE GROUND PLANE and comes out
// foreshortened correctly. One world unit is ~286 screen px along either axis.
// ==========================================================================
const W2PX = Math.hypot(TILE_W / 2, TILE_H / 2);   // 286.2 px per world unit
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

/** 2D value noise, cubic-smoothed, 256-periodic. */
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

/**
 * THE LIGHT, IN WORLD COORDINATES. The ICE family is lit from the screen's upper
 * left (tiltY 3.0 / tiltX 0.0). Screen (-1,-1) normalises to world (-0.83,-0.55).
 * A groove is not symmetric about its axis: the up-light shoulder catches the sun
 * and reads as the pale break lip, the down-light wall carries the shadow. Draw it
 * symmetric and it reads as a SCRATCH instead of as a fracture.
 */
const LU = -0.832, LV = -0.555;

// ==========================================================================
// THE THREE GENERATORS
// ==========================================================================
/** PLUTO -- jittered-grid Voronoi. The groove sits on the cell boundary. */
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
 * distance to the cell boundary, and the direction pointing AWAY from it into the
 * pixel's own cell. (d2-d1)/2 is the exact bisector distance near the edge, which
 * is the only place it is used.
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

/**
 * GANYMEDE -- sulci. A coarse Voronoi partitions the world into domains; each
 * domain carries its own heading, pitch and phase, so parallel furrow fields abut
 * along sharp block boundaries the way they do on Ganymede.
 */
function makeSulci(seed, domCell, pitch, pitchVar) {
  const V = makeVoro(seed, domCell, 0.7);
  const rnd = mulberry32(seed + 4242);
  const par = [];
  for (let i = 0; i < V.n * V.n; i++) {
    par.push({ ang: rnd() * Math.PI, pitch: pitch * (1 - pitchVar + 2 * pitchVar * rnd()), ph: rnd() });
  }
  return { V: V, par: par };
}
function sulciEdge(S, u, v, out) {
  const V = S.V;
  const ci = Math.floor((u + V.R) / V.cell), cj = Math.floor((v + V.R) / V.cell);
  let d1 = 1e9, best = -1;
  for (let jj = cj - 1; jj <= cj + 1; jj++) {
    if (jj < 0 || jj >= V.n) continue;
    for (let ii = ci - 1; ii <= ci + 1; ii++) {
      if (ii < 0 || ii >= V.n) continue;
      const k = (jj * V.n + ii) * 2, dx = u - V.pts[k], dy = v - V.pts[k + 1];
      const d = dx * dx + dy * dy;
      if (d < d1) { d1 = d; best = jj * V.n + ii; }
    }
  }
  if (best < 0) { out[0] = 1e9; return; }
  const p = S.par[best], ca = Math.cos(p.ang), sa = Math.sin(p.ang);
  const t = (-sa * u + ca * v) / p.pitch + p.ph;
  const f = t - Math.round(t);
  out[0] = Math.abs(f) * p.pitch;
  const sg = f >= 0 ? 1 : -1;
  out[1] = -sa * sg; out[2] = ca * sg;
}

/**
 * EUROPA -- lineae. Wide-pitched bands with a BRIGHT CORE between DARK MARGINS.
 * Only two or three bands cross a tile, so the pitch is large and the domain warp
 * is strong; the profile is symmetric because that is what the pictures show.
 */
function makeLinea(seed, pitch, pitchVar) {
  const rnd = mulberry32(seed);
  return { ang: rnd() * Math.PI, pitch: pitch * (1 - pitchVar + 2 * pitchVar * rnd()), ph: rnd() };
}
function lineaEdge(Lo, u, v, out) {
  const ca = Math.cos(Lo.ang), sa = Math.sin(Lo.ang);
  const t = (-sa * u + ca * v) / Lo.pitch + Lo.ph;
  const f = t - Math.round(t);
  out[0] = Math.abs(f) * Lo.pitch;
  const sg = f >= 0 ? 1 : -1;
  out[1] = -sa * sg; out[2] = ca * sg;
}

// ==========================================================================
// THE MASK. One pass over the 2x grid; every layer is evaluated at the same
// domain-warped world point and combined with max, so crossing grooves never
// double-darken and the mean stays put.
// ==========================================================================
function buildMask(seed, C) {
  const D = new Float32Array(MW * MH), B = new Float32Array(MW * MH);
  const warp = fbm2(seed + 101, 3), warp2 = fbm2(seed + 202, 3);
  const wvar = fbm2(seed + 303, 2);
  const gens = C.layers.map((Ly, i) => {
    if (Ly.kind === 'voro') return makeVoro(seed + 1000 + i * 331, Ly.cell, Ly.jitter === undefined ? 0.75 : Ly.jitter);
    if (Ly.kind === 'sulci') return makeSulci(seed + 1000 + i * 331, Ly.dom, Ly.pitch, Ly.pitchVar === undefined ? 0.3 : Ly.pitchVar);
    return makeLinea(seed + 1000 + i * 331, Ly.pitch, Ly.pitchVar === undefined ? 0.2 : Ly.pitchVar);
  });
  const o = [0, 0, 0];
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      const w = s2wM(x + 0.5, y + 0.5);
      const u0 = w[0], v0 = w[1];
      if (Math.abs(u0) > 0.52 || Math.abs(v0) > 0.52) continue;      // outside the diamond
      const wu = u0 + C.warpAmp * warp(u0 * C.warpFreq, v0 * C.warpFreq);
      const wv = v0 + C.warpAmp * warp2(u0 * C.warpFreq, v0 * C.warpFreq);
      const wf = C.wvarFreq || 5.5;
      const wj = 0.66 + 0.68 * (wvar(u0 * wf, v0 * wf) * 0.5 + 0.5);
      const p = y * MW + x;
      let dk = 0, br = 0;
      for (let li = 0; li < C.layers.length; li++) {
        const Ly = C.layers[li];
        if (Ly.kind === 'voro') voroEdge(gens[li], wu, wv, o);
        else if (Ly.kind === 'sulci') sulciEdge(gens[li], wu, wv, o);
        else lineaEdge(gens[li], wu, wv, o);
        const e = o[0];
        if (e > 0.25) continue;
        const hw = 0.5 * Ly.width * (Ly.widthVar === false ? 1 : wj);
        const toLight = o[1] * LU + o[2] * LV > 0;
        if (Ly.kind === 'linea') {
          // bright core between dark margins -- symmetric, Europa's own profile
          if (e < hw) {
            const s = smooth((1 - e / hw) / (1 - Ly.core));
            const b = Ly.lip * s; if (b > br) br = b;
          } else if (e < hw * (1 + Ly.flankW)) {
            const s = smooth(1 - Math.abs(e - hw * (1 + Ly.flankW * 0.5)) / (hw * Ly.flankW * 0.5));
            const d = Ly.depth * s; if (d > dk) dk = d;
          }
        } else if (e < hw) {
          let s = smooth((1 - e / hw) / (1 - Ly.core));
          if (toLight) s *= Ly.asym;
          const d = Ly.depth * s; if (d > dk) dk = d;
        } else if (Ly.lip > 0 && e < hw * (1 + Ly.lipW)) {
          // BOTH shoulders catch light, the up-light one much more. Putting the lip
          // on one side only forced the amplitude so high that blowout ran to 0.99%
          // when the solver pushed it to cancel the ink; two shoulders halve the
          // amplitude for the same cancelled area, and a trough does physically have
          // two rims.
          const s = smooth(1 - (e - hw) / (hw * Ly.lipW));
          const b = Ly.lip * s * (toLight ? 1 : (Ly.lipBack === undefined ? 0.55 : Ly.lipBack));
          if (b > br) br = b;
        }
      }
      D[p] = dk; B[p] = br;
    }
  }
  // RIM FADE -- zero (or `rimFloor`) darkening in the last `rimBand` of world
  // distance before the diamond edge. The groove closes up before the boundary.
  if (C.rimBand > 0) {
    const fl = C.rimFloor || 0;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const p = y * MW + x;
      if (D[p] === 0 && B[p] === 0) continue;
      const w = s2wM(x + 0.5, y + 0.5);
      const m = Math.min(0.5 - Math.abs(w[0]), 0.5 - Math.abs(w[1]));
      const k = fl + (1 - fl) * smooth(m / C.rimBand);
      D[p] *= k; B[p] *= k;
    }
  }
  // box-downsample 2x2 -- anti-aliasing, not upscaling
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

/**
 * THE LIP IS SOLVED, NOT GUESSED.
 * The bright lip and the dark trough have to cancel in the MEAN, otherwise the
 * separation from glacier shows up as d'level and the round has failed its own
 * premise. How much lip that takes is not a constant: locking the level on the
 * ground's p70 (the corpus convention) means a strong lip pushes p70 up and the
 * gain solve then pulls the whole tile back down, so the balance point moves with
 * the cell size. So `lipK` is solved per rung by secant on the finished tile's
 * mean L, and the mask -- which does not depend on lipK -- is built once and cached.
 */
const maskCache = new Map();
function maskFor(seed, C) {
  const key = seed + '|' + JSON.stringify(C);
  if (!maskCache.has(key)) {
    if (maskCache.size > 8) maskCache.clear();
    maskCache.set(key, buildMask(seed, C));
  }
  return maskCache.get(key);
}
/** multiply the mask onto the frozen shipped glacier -- the ground stays glacier */
async function proceduralBase(glacierFile, seed, C, lipK) {
  const G = await sharp(fs.readFileSync(glacierFile)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = G.info.channels, w = G.info.width, h = G.info.height;
  const M0 = maskFor(seed, C);
  const k = lipK === undefined ? 1 : lipK;
  const M = k === 1 ? M0 : { D: M0.D, B: M0.B.map((v) => v * k) };
  const out = Buffer.from(G.data);
  let ink = 0, lit = 0, inkR = 0, nR = 0, inkC = 0, nC = 0;
  const band = C.rimBand || 0.11;
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
// measurement -- identical to rounds 1-3 so the tables can be read together
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
async function microContrast(file, fallbackFull) {
  let buf;
  if (file && fs.existsSync(file)) buf = fs.readFileSync(file);
  else if (fallbackFull && fs.existsSync(fallbackFull)) {
    buf = await sharp(fs.readFileSync(fallbackFull)).resize(64, 32, { fit: 'fill' }).webp(WEBP).toBuffer();
  } else return 0;
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
/** micro contrast on the QUARTER mip too -- the play view is 48x24, between the two */
async function microQuarter(file) {
  const buf = await sharp(fs.readFileSync(file)).resize(128, 64, { fit: 'fill' }).webp(WEBP).toBuffer();
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
async function rimFissure(file, k) {
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
    if (L709(r.data[i], r.data[i + 1], r.data[i + 2]) < k * s.p50) dark++;
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
/**
 * THE GROUND, MEASURED ON THE PIXELS THE MASK NEVER TOUCHED.
 * Once a trough net covers ~50% of the tile, whole-tile p70 lands inside the
 * BRIGHT LIP and stops being a ground statistic -- it read 92-96 against glacier's
 * 89.8 on rungs whose untouched ground had not moved at all. So the ground level
 * and the ground NCC are both taken over {D + B < 0.02}, and glacier's own p70 is
 * taken over the SAME pixel set so the two numbers are comparable. This is the
 * real guard for "the ground is still glacier".
 */
async function groundStats(outFile, glacierFile, M) {
  const A = await sharp(fs.readFileSync(outFile)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(fs.readFileSync(glacierFile)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ca = A.info.channels, cb = B.info.channels, w = A.info.width, h = A.info.height;
  const a = [], b = [];
  for (let p = 0; p < w * h; p++) {
    if (A.data[p * ca + 3] < 250 || B.data[p * cb + 3] < 250) continue;
    if (M.D[p] + M.B[p] >= 0.02) continue;
    a.push(L709(A.data[p * ca], A.data[p * ca + 1], A.data[p * ca + 2]));
    b.push(L709(B.data[p * cb], B.data[p * cb + 1], B.data[p * cb + 2]));
  }
  if (a.length < 200) return { frac: a.length / (w * h), p70: 0, p70g: 0, ncc: 0 };
  const q = (arr, t) => { const s = arr.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * t))]; };
  const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { const u = a[i] - ma, v = b[i] - mb; n += u * v; da += u * u; db += v * v; }
  return { frac: a.length / (w * h), p70: q(a, 0.70), p70g: q(b, 0.70), ncc: n / Math.sqrt(da * db + 1e-9) };
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
// the grade (no flatten -- see the header)
// ==========================================================================
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
/**
 * THE LEVEL IS LOCKED ON THE MEAN THIS ROUND, NOT ON p70. Rounds 1-3 locked the
 * ground's p70 because a deep fissure is a small dark area that leaves p70 alone.
 * A Sputnik-style trough net covers ~40% of the tile, so p70 lands INSIDE the
 * bright lip and locking it locks the wrong statistic -- measured: with the lip
 * strong enough to cancel the ink, the p70 lock pulled the whole tile 1.5 luma
 * BELOW glacier and manufactured a d'level leg out of nothing. `lumT` is glacier's
 * own per-slot mean L; the ground p70 is then reported as an OUTPUT and has to
 * stay near 89.8 for the tile to still be glacier underneath.
 */
async function solveTile(baseBuf, W, H, CH, outFile, lumT, cap) {
  const S = baseBuf;
  const b0 = statsRaw(S, CH, W, H);
  const desat = b0.chromaRes > cap ? cap / b0.chromaRes : 1;
  const tint = [1, (GR_T * b0.rgb[0]) / b0.rgb[1], (BR_T * b0.rgb[0]) / b0.rgb[2]];
  let G = lumT / b0.lum, p = 0, q = 0;
  const t00 = statsRaw(grade(S, CH, W, H, desat, tint, G, 0, 0), CH, W, H);
  const tP = statsRaw(grade(S, CH, W, H, desat, tint, G, 0.2, 0), CH, W, H);
  const tQ = statsRaw(grade(S, CH, W, H, desat, tint, G, 0, 0.2), CH, W, H);
  const Kx = (tP.tiltX - t00.tiltX) / 0.2, Ky = (tQ.tiltY - t00.tiltY) / 0.2;
  const eighth = outFile.replace(/\.webp$/, '@eighth.webp');
  let m = null, png = null;
  for (let pass = 0; pass < SOLVE_PASSES; pass++) {
    const buf = grade(S, CH, W, H, desat, tint, G, p, q);
    png = await sharp(buf, { raw: { width: W, height: H, channels: CH } }).png().toBuffer();
    await sharp(png).webp(WEBP).toFile(outFile);
    await sharp(png).resize(64, 32, { fit: 'fill' }).webp(WEBP).toFile(eighth);
    m = await statsOf(outFile);
    if (pass === SOLVE_PASSES - 1) break;
    G *= lumT / m.lum;
    tint[2] *= BR_T / m.br;
    tint[1] *= GR_T / m.gr;
    p += (TILT_X - m.tiltX) / Kx;
    q += (TILT_Y - m.tiltY) / Ky;
  }
  m.png = png;
  m.desat = desat;
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
// THE GRID INDEX -- lattice fold, verbatim from rounds 1-3
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

const NEIGH = [
  { id: 'glacier  (THE ONE)', lum: 44.0, br: 1.10, gr: 1.06, micro: 7.40 },
  { id: 'tundra        (ICE)', lum: 30.8, br: 0.82, gr: 0.91, micro: 3.3 },
  { id: 'ice_shelf     (ICE)', lum: 22.0, br: 2.86, gr: 2.18, micro: 4.5 },
];

// ==========================================================================
// THE LADDER
//
// One world unit = 286 screen px on a 512x256 tile, and 27 px at play scale
// (48x24). micro8 lives on the 64x32 mip, i.e. one mip pixel = 8 screen px, so a
// groove NET only lifts micro8 if the groove PITCH is of that order -- ~16-32 px,
// world 0.055-0.11. That is the whole reason the ladder's main axis is CELL SIZE
// and not depth.
//
// depth is deliberately shallow everywhere: dark% counts pixels below 0.55x the
// tile's own p50 (~47 luma against a ground of ~85), so a groove has to darken by
// more than 45% before it registers as "dark area" at all. Nothing here comes
// close -- that is what "oberflaechlich" means in numbers.
// ==========================================================================
// WHAT THE FIRST PROBE OF THIS ROUND TAUGHT, and why the ladder looks like it does.
// A 5 px hairline net (cells 41 px, depth .34) came out at micro8 8.70 and level
// 43.2 -- fine -- but d'level 4.59 against d'texture 0.11. Backwards. The reason is
// pure scale arithmetic: at play scale a 512 px tile is 48 px, so a 5 px groove is
// HALF A PIXEL. It cannot make texture there; all it can do is dim the tile. Thin
// grooves therefore separate from glacier by LEVEL no matter how shallow they are,
// which is exactly the failure mode this round exists to avoid.
//
// Sputnik Planitia solves it, and it is the vorlage anyway: its troughs are WIDE
// RELATIVE TO THE CELL and shallow. "Oberflaechlich" is about DEPTH, not width. So
// the width is pinned at ~19% of the cell size, the depth is dropped far below
// anything in rounds 1-3, and the bright lip is scaled to CANCEL the darkening in
// the mean -- which is what drives d'level to zero and leaves d'texture to carry.
//
// ink   ~ 0.79 * (w/cell) * depth          (measured on the probe, not assumed)
// lit   ~ 0.275 * (w/cell) * lipW * lip
// => lip = (0.79/0.275/lipW) * depth = 1.91 * depth at lipW 1.5.
const WREL = 0.19, LIPW = 1.8, LIPK = +(process.env.LIPK || 1.95);
const DEPTHK = +(process.env.DEPTHK || 1);
const V = (cell, depth0, sub) => { const depth = depth0 * DEPTHK; return ({
  warpAmp: 0.11 * cell, warpFreq: 2.4, wvarFreq: 0.85 / cell, rimBand: 0.11, rimFloor: 0,
  layers: [
    { kind: 'voro', cell: cell, jitter: 0.78, width: WREL * cell, core: 0.30, depth: depth, lip: LIPK * depth, lipW: LIPW, asym: 0.78 },
  ].concat(sub ? [
    { kind: 'voro', cell: cell * 0.38, jitter: 0.85, width: WREL * cell * 0.38 * 1.15, core: 0.26, depth: depth * sub, lip: LIPK * depth * sub, lipW: LIPW, asym: 0.85 },
  ] : []),
}); };
const strip = (C) => {
  const O = JSON.parse(JSON.stringify(C));
  for (const L of O.layers) { L.lip = 0; L.asym = 1.0; }
  return O;
};

// PLUTO ladder -- four cell sizes, width pinned at 19% of the cell.
//   W1 cells 120px / troughs 23px  = 11 / 2.1 px at play scale   [sehr dezent]
//   W2 cells  86px / troughs 16px  =  8 / 1.5 px
//   W3 cells  60px / troughs 11px  =  5.6 / 1.1 px
//   W4 cells  41px / troughs  8px  =  3.9 / 0.7 px               [deutlich, but
//     already below one play pixel per trough -- that is the fineness floor and
//     the ladder is built to show where it is]
const A1 = V(0.420, 0.230, 0);
const A2 = V(0.300, 0.290, 0.42);
const A3 = V(0.210, 0.360, 0.42);
const A4 = V(0.145, 0.430, 0.40);
// the AMPLITUDE sub-ladder at A3's cell size. With the level nailed by the lip
// solve, depth is the only free knob left, and it trades micro8 against dark%:
//   x0.6 -> micro8 ~9,  dark 2.5%      x1.0 -> micro8 ~13, dark 3.4%
//   x1.5 -> micro8 ~18, dark 8.6%      x2.3 -> micro8 ~24, dark 17%  (rejected)
const A3q = V(0.210, 0.220, 0.42);
const A3s = V(0.210, 0.540, 0.42);
// the FINENESS FLOOR: the first probe's hairline net, kept in the ladder on purpose
// so the width axis has a documented lower end and its failure is a number.
const FINE = {
  warpAmp: 0.030, warpFreq: 2.6, wvarFreq: 5.5, rimBand: 0.11, rimFloor: 0,
  layers: [
    { kind: 'voro', cell: 0.145, jitter: 0.78, width: 0.018, core: 0.34, depth: 0.34, lip: 0.34, lipW: 0.95, asym: 0.78 },
    { kind: 'voro', cell: 0.058, jitter: 0.85, width: 0.011, core: 0.28, depth: 0.15, lip: 0.14, lipW: 0.95, asym: 0.85 },
  ],
};

// GANYMEDE -- parallel furrow blocks at the W2 pitch, so the two forms meet at
// equal frequency and equal ink and only the ISOTROPY differs.
const GAN = {
  warpAmp: 0.030, warpFreq: 2.2, wvarFreq: 3.0, rimBand: 0.11, rimFloor: 0,
  layers: [
    { kind: 'sulci', dom: 0.52, pitch: 0.150, pitchVar: 0.34, width: 0.057, core: 0.30, depth: 0.36, lip: LIPK * 0.36, lipW: LIPW, asym: 0.78 },
    { kind: 'voro', cell: 0.30, jitter: 0.8, width: 0.040, core: 0.30, depth: 0.18, lip: LIPK * 0.18, lipW: LIPW, asym: 0.85 },
  ],
};
// EUROPA -- two lineae bands, BRIGHT CORE between DARK MARGINS, over a quiet Pluto
// net so the tile is not empty between the bands. The profile is symmetric because
// that is what the pictures show.
const EUR = {
  warpAmp: 0.055, warpFreq: 1.7, wvarFreq: 2.6, rimBand: 0.11, rimFloor: 0,
  layers: [
    { kind: 'voro', cell: 0.300, jitter: 0.78, width: 0.050, core: 0.30, depth: 0.26, lip: LIPK * 0.26, lipW: LIPW, asym: 0.78 },
    { kind: 'linea', pitch: 0.34, pitchVar: 0.20, width: 0.045, core: 0.42, depth: 0.40, lip: 0.60, flankW: 1.20 },
    { kind: 'linea', pitch: 0.50, pitchVar: 0.25, width: 0.036, core: 0.42, depth: 0.34, lip: 0.52, flankW: 1.20 },
  ],
};
// HYBRID -- the Pluto net plus ONE sulci province, which is what the real surfaces
// look like: a polygonal plain with a banded block set cut into it.
const HYB = {
  warpAmp: 0.033, warpFreq: 2.4, wvarFreq: 2.8, rimBand: 0.11, rimFloor: 0,
  layers: [
    { kind: 'voro', cell: 0.300, jitter: 0.78, width: 0.057, core: 0.30, depth: 0.36, lip: LIPK * 0.36, lipW: LIPW, asym: 0.78 },
    { kind: 'sulci', dom: 0.62, pitch: 0.120, pitchVar: 0.30, width: 0.030, core: 0.28, depth: 0.24, lip: LIPK * 0.24, lipW: LIPW, asym: 0.82 },
  ],
};
const A2soft = JSON.parse(JSON.stringify(A2)); A2soft.rimFloor = 0.32;

const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
let GLACIER_STAMP = 0, GLACIER_STAMP_PAIR = '';
const VARIANTS = [
  // ---- A: the DENSITY axis, one amplitude, four cell sizes ---------------
  { id: 'A1-lip', C: A1, col: '#79c0ff', label: 'PLUTO net  cells 120px / troughs 23px, depth .23, BRIGHT LIP  [sehr dezent]' },
  { id: 'A1-plain', C: strip(A1), col: '#8b949e', label: 'PLUTO net  cells 120px / troughs 23px, depth .23, no lip      [sehr dezent]' },
  { id: 'A2-lip', C: A2, col: '#79c0ff', label: 'PLUTO net  cells  86px / troughs 16px, depth .29, BRIGHT LIP  [dezent]' },
  { id: 'A2-plain', C: strip(A2), col: '#8b949e', label: 'PLUTO net  cells  86px / troughs 16px, depth .29, no lip      [dezent]' },
  { id: 'A3-lip', C: A3, col: '#7ee787', label: 'PLUTO net  cells  60px / troughs 11px, depth .36, BRIGHT LIP  [mittel]' },
  { id: 'A3-plain', C: strip(A3), col: '#8b949e', label: 'PLUTO net  cells  60px / troughs 11px, depth .36, no lip      [mittel]' },
  { id: 'A4-lip', C: A4, col: '#7ee787', label: 'PLUTO net  cells  41px / troughs  8px, depth .43, BRIGHT LIP  [dicht]' },
  { id: 'A4-plain', C: strip(A4), col: '#8b949e', label: 'PLUTO net  cells  41px / troughs  8px, depth .43, no lip      [dicht]' },
  // ---- B: the AMPLITUDE axis at A3's cell size ---------------------------
  { id: 'B-quiet', C: A3q, col: '#58a6ff', label: 'PLUTO net  cells 60px, depth .22 = A3 x0.6, BRIGHT LIP  [the QUIET end]' },
  { id: 'B-strong', C: A3s, col: '#3fb950', label: 'PLUTO net  cells 60px, depth .54 = A3 x1.5, BRIGHT LIP  [deutlich sichtbar]' },
  // ---- the fineness floor ------------------------------------------------
  { id: 'FINE-lip', C: FINE, col: '#6e7681', label: 'HAIRLINE net cells 41px / cracks 5px, depth .34  [the fineness FLOOR]' },
  // ---- C: the FORM axis --------------------------------------------------
  { id: 'GAN-lip', C: GAN, col: '#d2a8ff', label: 'GANYMEDE sulci blocks, pitch 43px / furrows 16px, BRIGHT LIP  [gerichtet]' },
  { id: 'GAN-plain', C: strip(GAN), col: '#a371f7', label: 'GANYMEDE sulci blocks, pitch 43px / furrows 16px, no lip      [gerichtet]' },
  { id: 'EUR-linea', C: EUR, col: '#ffa657', label: 'EUROPA lineae, BRIGHT CORE + dark margins, over a quiet Pluto net' },
  { id: 'HYB', C: HYB, col: '#f0883e', label: 'HYBRID  Pluto net + one sulci province, BRIGHT LIP' },
  // ---- D: the rim probe --------------------------------------------------
  { id: 'A2-rimsoft', C: A2soft, col: '#db6d28', label: 'PLUTO net cells 86px, RIM FADE ONLY TO 0.32 (probe: cost of the clean ring)' },
];

(async () => {
  fs.mkdirSync(WORK, { recursive: true });

  const GL = [], GLB = [];
  let p70T = 0, chrG = 0;
  for (let n = 0; n < 4; n++) {
    const f = path.join(SRCD, 'glacier_' + n + '_src.webp');
    const origin = path.join(TILES, 'glacier', 'glacier_' + n + '.webp');
    if (!fs.readFileSync(f).equals(fs.readFileSync(origin))) console.log('[freeze] WARNING glacier_' + n + ' frozen copy DIFFERS from src/assets/tiles/glacier/');
    const s = await statsOf(f);
    s.micro = await microContrast(path.join(TILES, 'glacier', 'glacier_' + n + '@eighth.webp'), f);
    s.micro4 = await microQuarter(f);
    s.rim = await rimHalo(f); s.rimFis = await rimFissure(f, 0.55); s.rimFis80 = await rimFissure(f, 0.80);
    GL.push(s); GLB.push(f); p70T += s.p70; chrG += s.chromaRes;
  }
  p70T /= 4; chrG /= 4;
  const LT0 = GL[0].lum;   // slot 0's OWN glacier mean -- the lip solve runs on slot 0, so the
  //                         target must be that slot's glacier level, not the 4-slot average.
  // the chroma cap is glacier's OWN residual chroma: the multiply is achromatic,
  // so the desaturation step must be a no-op. Anything else would repaint the
  // ground Rudi called perfect.
  const CAP = chrG * 1.06;
  const gAvg = (f) => GL.reduce((a, s) => a + f(s), 0) / 4;
  console.log('[glacier]  L ' + f1(gAvg((s) => s.lum)) + '  intL ' + f1(gAvg((s) => s.intLum)) +
    '  micro8 ' + f2(gAvg((s) => s.micro)) + '  micro4 ' + f2(gAvg((s) => s.micro4)) +
    '  dark% ' + f2(100 * gAvg((s) => s.darkFrac)) +
    '  chr% ' + f2(100 * chrG) + '  rimFis ' + f1(100 * gAvg((s) => s.rimFis)) + '%' +
    '   ==> p70 target ' + f1(p70T) + ', chroma cap ' + f2(100 * CAP) + '%\n');

  const results = [];
  {
    const bufs = [];
    for (let n = 0; n < 4; n++) bufs.push(await sharp(fs.readFileSync(GLB[n])).png().toBuffer());
    let gw = 0, gwp = '';
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      for (const o of [[false, false], [true, false], [false, true], [true, true]]) {
        const v = Math.abs(await ncc(GLB[a], GLB[b], o[0], o[1]));
        if (v > gw) { gw = v; gwp = a + 'x' + b; }
      }
    }
    GLACIER_STAMP = gw; GLACIER_STAMP_PAIR = gwp;
    console.log('[glacier]  own worst pairwise slot-vs-slot NCC over all 4 orientations: ' + f2(gw) + ' (pair ' + gwp +
      ') -- slots 0 and 3 ARE the same regolith tile rotated 180 by corpus convention, so this is the BASELINE, not zero.');
    results.push({ V: { id: 'GLACIER', label: 'glacier as shipped (the reference)', col: '#e6edf3', ref: true }, bufs: bufs, slots: GL, files: GLB.slice(), stamp: gw, stampPair: gwp });
  }

  for (const Vr of VARIANTS) {
    if (ONLY && ONLY.indexOf(Vr.id) < 0) continue;
    const t0 = Date.now();
    const outDir = path.join(WORK, Vr.id);
    fs.mkdirSync(outDir, { recursive: true });
    const bufs = [], slots = [], files = [], notes = [], rimInk = [], lipKs = [];
    // --- THE LIP IS SOLVED PER SLOT ---------------------------------------
    // The lit fraction depends on how the random cell edges happen to face the
    // light, so it swings ~1 luma from slot to slot. Solving one k for all four
    // left slots 1 and 2 a full luma below glacier while 0 and 3 sat on it. So each
    // slot gets its own k, driven to ITS OWN glacier slot's mean L. That is the
    // whole point: the level is not a target that gets dialled in at the end, it is
    // enforced by making the bright and the dark cancel tile by tile.
    const hasLip = Vr.C.layers.some((L) => L.lip > 0);
    const tmp = path.join(outDir, '_solve.webp');
    for (let n = 0; n < 4; n++) {
      const seed = 4400000 + n * 65539;
      // THE LIP IS SOLVED IN CLOSED FORM, not by iterating on the finished tile.
      // The multiplier is (1-D)(1+kB); its mean is 1 exactly when
      //     k = mean(D) / (mean(B) - mean(D*B)).
      // That is computed straight off the mask, per slot, for free -- no search, no
      // convergence risk, and it states the intent plainly: THE BRIGHT AND THE DARK
      // CANCEL, TILE BY TILE. The lit fraction depends on how this slot's cell edges
      // happen to face the light, which swings ~1 luma slot to slot, so k has to be
      // per slot; one k for all four left two slots a full luma low.
      let lipK = 1;
      if (hasLip) {
        const M = maskFor(seed, Vr.C);
        let mD = 0, mB = 0, mDB = 0;
        for (let i = 0; i < M.D.length; i++) { mD += M.D[i]; mB += M.B[i]; mDB += M.D[i] * M.B[i]; }
        const den = mB - mDB;
        lipK = den > 1e-6 ? mD / den : 1;
        lipK = Math.max(0.05, Math.min(8, lipK));
      }
      lipKs.push(lipK);
      const R = await proceduralBase(GLB[n], seed, Vr.C, lipK);
      notes.push('slot ' + n + ' seed ' + seed + ' lipK ' + f2(lipK) + ' (x' + f2(LIPK * lipK) + ' of depth)' +
        ' ink ' + f3(R.ink) + ' lit ' + f3(R.lit) + ' rimInk/coreInk ' + f2(R.inkCore > 0 ? R.inkRim / R.inkCore : 0));
      rimInk.push(R.inkCore > 0 ? R.inkRim / R.inkCore : 0);
      const out = path.join(outDir, 'crevasse_' + n + '.webp');
      const m = await solveTile(R.data, R.info.width, R.info.height, R.info.channels, out, GL[n].lum, CAP);
      fs.writeFileSync(path.join(outDir, 'crevasse_' + n + '.png'), m.png);
      bufs.push(m.png); files.push(out);
      const s = await statsOf(out);
      s.micro = await microContrast(out.replace(/\.webp$/, '@eighth.webp'));
      s.micro4 = await microQuarter(out);
      s.rim = await rimHalo(out);
      s.rimFis = await rimFissure(out, 0.55); s.rimFis80 = await rimFissure(out, 0.80);
      s.desat = m.desat;
      s.nccId = await ncc(out, GLB[n], false, false);
      s.nccFlop = await ncc(out, GLB[n], true, false);
      s.nccFlip = await ncc(out, GLB[n], false, true);
      s.nccHV = await ncc(out, GLB[n], true, true);
      const gn = await groundNcc(out, GLB[n]);
      s.gnFine = gn.fine; s.gnBlur = gn.blur12;
      const gs = await groundStats(out, GLB[n], maskFor(seed, Vr.C));
      s.gFrac = gs.frac; s.gP70 = gs.p70; s.gP70ref = gs.p70g; s.gNccMask = gs.ncc;
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
    try { fs.unlinkSync(tmp); fs.unlinkSync(tmp.replace(/\.webp$/, '@eighth.webp')); } catch (e) { /* no solve file */ }
    results.push({
      V: Vr, bufs: bufs, slots: slots, files: files, notes: notes, stamp: worst, stampPair: worstPair,
      lipK: lipKs.reduce((a, b) => a + b, 0) / 4, rimInk: rimInk.reduce((a, b) => a + b, 0) / 4,
    });
    console.log('[' + Vr.id.padEnd(11) + '] built in ' + f1((Date.now() - t0) / 1000) + 's');
  }

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
    console.log('[' + R.V.id.padEnd(11) + '] L ' + f1(avg((s) => s.lum)).padStart(5) +
      '  dark ' + f1(100 * avg((s) => s.darkFrac)).padStart(5) + '%' +
      '  micro8 ' + f2(avg((s) => s.micro)).padStart(6) +
      '  micro4 ' + f2(avg((s) => s.micro4)).padStart(6) +
      '  blow ' + f2(100 * Math.max.apply(null, R.slots.map((s) => s.blow))) + '%' +
      '  GRIDplay ' + f2(R.gPlay.gridTot).padStart(5) + ' (coh ' + f2(R.gPlay.gridCoh) + ')' +
      (R.sep ? "   d'lvl " + f2(R.sep.dLevel) + "  d'tex " + f2(R.sep.dTexture) + "  JOINT " + f2(R.sep.dJoint) : ''));
  }

  // ======================================================================
  // PER-RUNG CONTACT SHEETS -- glacier always next to it
  // ======================================================================
  const REF = results[0];
  const SW = 2400, PAD = 18;
  const QUESTION = 'THE QUESTION OVER THIS SHEET:  on play scale, can you see where glacier stops and crevasse starts?';
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

    line('CREVASSE FROM GLACIER, ROUND 4 -- THE HAIRLINE NET -- ' + R.V.label, 19, R.V.col);
    line(QUESTION, 17, '#ffa657');
    line('STYLE TEST, nothing written to src/assets/tiles/. Vorlage: Pluto/Sputnik Planitia polygon troughs, Europa lineae, Ganymede sulci. The mask is a multiplier ' +
      '(1-dark)(1+bright) applied to the FROZEN shipped glacier; the ground is glacier by construction. Mask evaluated at 2x and box-downsampled -- ' +
      'no upscale of the tile. The bright lip is SOLVED in closed form per slot so bright and dark cancel in the mean; the level is then locked on the MEAN at ' +
      'glacier\'s own per-slot L, and the ground p70 over untouched pixels is the check. No second flatten. ' + new Date().toISOString().slice(0, 16), 13, '#8b949e');
    if (R.notes) line('per-slot: ' + R.notes.join('   |   '), 13, '#8b949e');
    y += 4;
    line('  slot     L    intL     p30     p50     p70    B/R    G/R     sd  chr%  dark%  blow%  micro8  micro4   tiltX   tiltY    rim   rimFis%   groundNCC fine/blur12   NCC vs glacier n  id/flop/flip/hv', 13, '#8b949e');
    for (let n = 0; n < 4; n++) {
      const s = R.slots[n];
      line('   ' + n + '  ' + f1(s.lum).padStart(6) + f1(s.intLum).padStart(8) + f1(s.p30).padStart(8) + f1(s.p50).padStart(8) + f1(s.p70).padStart(8) +
        f2(s.br).padStart(7) + f2(s.gr).padStart(7) + f1(s.sd).padStart(7) +
        f2(s.chromaRes * 100).padStart(6) + f1(s.darkFrac * 100).padStart(7) + f2(s.blow * 100).padStart(7) +
        f2(s.micro).padStart(8) + f2(s.micro4).padStart(8) + f1(s.tiltX).padStart(8) + f1(s.tiltY).padStart(8) +
        ((s.rim >= 0 ? '+' : '') + f2(s.rim)).padStart(7) + f1(100 * s.rimFis).padStart(9) + '   ' +
        (s.gnFine !== undefined ? (f2(s.gnFine) + ' / ' + f2(s.gnBlur)).padStart(15) : '              -') + '     ' +
        (s.nccId !== undefined ? (f2(s.nccId) + ' / ' + f2(s.nccFlop) + ' / ' + f2(s.nccFlip) + ' / ' + f2(s.nccHV)) : '(the reference itself)'), 13, '#c9d1d9');
    }
    y += 6;
    if (!R.V.ref) {
      const gnf = avg((s) => s.gnFine), gnb = avg((s) => s.gnBlur);
      const gm = avg((s) => s.gNccMask);
      line('GROUND SURVIVAL   on the pixels the mask never touched (' + f1(100 * avg((s) => s.gFrac)) + '% of the tile): NCC vs the frozen glacier ' + f2(gm) +
        '   ground p70 ' + f1(avg((s) => s.gP70)) + ' vs glacier\'s own p70 on the SAME pixels ' + f1(avg((s) => s.gP70ref)) +
        '   |  whole-tile NCC ' + f2(gnf) + ' / blur12 ' + f2(gnb) + '   desat ' + f2(avg((s) => s.desat)) + ' (1.00 = colour untouched)', 13,
        gm >= 0.985 ? '#7ee787' : gm >= 0.95 ? '#ffa657' : '#ff7b72');
      line('                  whole-tile p70 ' + f1(avg((s) => s.p70)) + ' vs glacier 89.8 -- EXPECTED to run high: with ~50% of the tile under trough+lip the 70th ' +
        'percentile lands IN THE BRIGHT LIP and is no longer a ground statistic. That is exactly why the level is locked on the MEAN this round.', 13, '#8b949e');
    }
    line('LEVEL          whole-tile mean L ' + f1(mL) +
      '   vs glacier 44.0   =  dL ' + ((mL - 44.0 >= 0 ? '+' : '') + f1(mL - 44.0)) + '   [target 43-44: the separation must NOT come from here]', 13,
      Math.abs(mL - 43.5) <= 1.2 ? '#7ee787' : '#ffa657');
    line('HUE            B/R ' + f2(mb) + '   G/R ' + f2(mg) + '   residual chroma ' + f2(100 * avg((s) => s.chromaRes)) + '%  (glacier ' + f2(100 * chrG) + '%)', 13, '#ffa657');
    line('DARK AREA      ' + f1(100 * avg((s) => s.darkFrac)) + '% of the tile below 0.55x its own p50   glacier ' + f1(100 * gAvg((s) => s.darkFrac)) +
      '%   [round 1 ran 25% -- shallow grooves must not register here at all]', 13,
      avg((s) => s.darkFrac) < 0.05 ? '#7ee787' : '#ff7b72');
    line('MICRO CONTRAST micro8 ' + f2(mM) + '  (glacier 7.40, x' + f2(mM / 7.40) + ')     micro4 (128x64 mip) ' + f2(avg((s) => s.micro4)) +
      '  (glacier ' + f2(gAvg((s) => s.micro4)) + ', x' + f2(avg((s) => s.micro4) / gAvg((s) => s.micro4)) + ')', 13,
      mM >= 10 ? '#7ee787' : mM >= 8.3 ? '#ffa657' : '#ff7b72');
    line('BLOWOUT        worst slot ' + f2(100 * worstBlow) + '%   (bar: < 1.00%)', 13, worstBlow < 0.01 ? '#7ee787' : '#ff7b72');
    line('RIM HALO       worst slot ' + ((worstRim >= 0 ? '+' : '') + f2(worstRim)), 13, worstRim <= 0.3 ? '#7ee787' : '#ff7b72');
    line('RIM FADE       ink in the last ' + f2(100 * (R.V.C ? (R.V.C.rimBand || 0) : 0)) + '% of world distance before the edge, as a fraction of the interior ink: ' +
      (R.rimInk === undefined ? '-' : f2(R.rimInk)) + '   (0.50 = a smooth ramp, 0.00 = a groove-free ring, 1.00 = no fade at all)' +
      '   |   rim band darker than 0.80xp50: ' + f1(100 * avg((s) => s.rimFis80)) + '% vs glacier ' + f1(100 * gAvg((s) => s.rimFis80)) + '%' +
      '   |   0.55xp50: ' + f1(100 * avg((s) => s.rimFis)) + '% vs glacier ' + f1(100 * gAvg((s) => s.rimFis)) + '%', 13, '#ffa657');
    line('BOUNDARY STEP  step ' + f2(R.bs.step) + '   interior roughness ' + f2(R.bs.rough) + '   RATIO ' + f2(R.bs.ratio) + '   (glacier 1.57)', 13, '#ffa657');
    if (R.stamp !== undefined) line('STAMP PROOF    worst pairwise slot-vs-slot NCC over all 4 orientations ' + f2(R.stamp) + '  (pair ' + R.stampPair + ')  -- glacier itself reads ' + f2(GLACIER_STAMP) + ' (slots 0 and 3 ARE the same regolith tile rotated 180 by corpus convention), so THAT is the baseline, not zero', 13, R.stamp < GLACIER_STAMP * 0.85 ? '#7ee787' : '#ffa657');
    line('GRID INDEX     lattice fold of the tessellated field, rim band excluded (max(|du|,|dv|) <= ' + RIM_CUT + ')', 13, '#ffa657');
    for (const pair of [['FULL RES', R.gFull], ['PLAY 48x24', R.gPlay], ['PLAY + VACUUM', R.gPlayVac]]) {
      const g = pair[1];
      line('      ' + pair[0].padEnd(14) + 'grid_tot ' + f2(g.gridTot) + ' L   (COHERENT ' + f2(g.gridCoh) + ' = the same shape on all four slots, SLOT-DEPENDENT ' + f2(g.gridSlot) +
        ')   ramp_pp ' + f2(g.rampPP) + '   sd_within ' + f2(g.sdWithin) +
        '   ratio ' + f3(g.ratio) + '   ' + f2(g.pctOfMean) + '% of mean ' + f1(g.mean), 13, '#8b949e');
    }
    line('    reference at PLAY scale: glacier 5.79 (coh 3.22) / ratio 0.59  |  new tundra 2.60 / 0.86  |  REJECTED old tundra 10.40 / 1.12  -- the bar for this round is < 10.40', 13, '#8b949e');
    y += 6;
    if (R.sep) {
      line("SEPARABILITY FROM GLACIER at play scale -- d' over the per-tile distribution of a 40x24 field.  THE POINT OF ROUND 4: it must come out of d'texture.", 15, '#ffa657');
      for (const pair of [['plain', R.sep], ['under vacuum', R.sepVac]]) {
        const S = pair[1];
        line('    ' + pair[0].padEnd(14) +
          'tile mean L  crevasse ' + f1(S.A.m) + ' +-' + f1(S.A.msd) + '   glacier ' + f1(S.B.m) + ' +-' + f1(S.B.msd) + "   d'level " + f2(S.dLevel) +
          '        within-tile sd  crevasse ' + f1(S.A.s) + ' +-' + f1(S.A.ssd) + '   glacier ' + f1(S.B.s) + ' +-' + f1(S.B.ssd) + "   d'texture " + f2(S.dTexture) +
          "        JOINT " + f2(S.dJoint), 13,
          S.dJoint >= 1.0 ? '#7ee787' : S.dJoint >= 0.6 ? '#ffa657' : '#ff7b72');
      }
      line("    d' >= 1.0 = an area of one is told from an area of the other;  d' < 0.5 = the same tile with two names.  d'texture > d'level is the round-4 requirement.", 13, '#8b949e');
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

    // --- the four slots, and glacier's four slots underneath for comparison ---
    const TW = 570, TH = 285, GAP = 12;
    line('THE FOUR SLOTS at 1:1                                                                                                            (glacier\'s own four underneath)', 15, '#7ee787');
    let rowY = y;
    for (let n = 0; n < 4; n++) {
      const cx = PAD + n * (TW + GAP);
      comp.push({ input: label('slot ' + n, TW, 13, '#c9d1d9'), left: cx, top: rowY });
      comp.push({ input: await sharp(R.bufs[n]).resize(TW, TH, { fit: 'fill' }).png().toBuffer(), left: cx, top: rowY + 20 });
      comp.push({ input: label('glacier ' + n, TW, 13, '#6e7681'), left: cx, top: rowY + 20 + TH + 4 });
      comp.push({ input: await sharp(REF.bufs[n]).resize(TW, TH, { fit: 'fill' }).png().toBuffer(), left: cx, top: rowY + 20 + TH + 22 });
    }
    y = rowY + 20 + TH + 22 + TH + 16;

    // --- closed 2x2 repeat, crevasse | glacier ---
    const F22 = await isoField(R.bufs, TILE_W, TILE_H, 4, 3, (r, c) => ((r % 2) * 2 + (c % 2)));
    const G22 = await isoField(REF.bufs, TILE_W, TILE_H, 4, 3, (r, c) => ((r % 2) * 2 + (c % 2)));
    line('THE CLOSED 2x2 REPEAT at 1:1 -- every slot touches every other slot          |          GLACIER, same 2x2', 15, '#7ee787');
    const s22 = Math.min(1, ((SW - PAD * 3) / 2) / F22.w);
    const w22 = Math.round(F22.w * s22), h22 = Math.round(F22.h * s22);
    comp.push({ input: await sharp(F22.png).resize(w22, h22).png().toBuffer(), left: PAD, top: y });
    comp.push({ input: await sharp(G22.png).resize(w22, h22).png().toBuffer(), left: PAD + w22 + PAD, top: y });
    y += h22 + 14;

    // --- full-res random field, crevasse | glacier ---
    const rndD = mulberry32(90210);
    const FD = await isoField(R.bufs, TILE_W, TILE_H, 6, 4, () => Math.floor(rndD() * 4));
    const rndG = mulberry32(90210);
    const GD = await isoField(REF.bufs, TILE_W, TILE_H, 6, 4, () => Math.floor(rndG() * 4));
    line('FULL RES interlocking field, identical random draw -- crevasse          |          glacier', 15, '#7ee787');
    const fdScale = Math.min(1, ((SW - PAD * 3) / 2) / FD.w);
    const fw = Math.round(FD.w * fdScale), fh = Math.round(FD.h * fdScale);
    comp.push({ input: await sharp(FD.png).resize(fw, fh).png().toBuffer(), left: PAD, top: y });
    comp.push({ input: await sharp(GD.png).resize(fw, fh).png().toBuffer(), left: PAD + fw + PAD, top: y });
    y += fh + 14;

    // --- play scale + vacuum, crevasse over glacier ---
    const rndP = mulberry32(90210);
    const PD = await isoField(R.bufs, PLAY_W, PLAY_H, 44, 22, () => Math.floor(rndP() * 4));
    const PDv = await vacuum(PD.png);
    const rndPG = mulberry32(90210);
    const PG = await isoField(REF.bufs, PLAY_W, PLAY_H, 44, 22, () => Math.floor(rndPG() * 4));
    const PGv = await vacuum(PG.png);
    line('PLAY SCALE 48x24 px per tile (zoom 1.0)      |      the SAME field under the VACUUM darkening rgba(5,10,25,0.45)      -- crevasse on top, GLACIER below', 15, '#7ee787');
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
    line('1:1 crop of a four-tile junction      |      the same crop under the VACUUM darkening   -- watch the grooves at the tile edges', 15, '#7ee787');
    comp.push({ input: await sharp(FD.png).extract({ left: cl, top: ct, width: CW, height: CH2 }).png().toBuffer(), left: PAD, top: y });
    comp.push({ input: await sharp(FDv).extract({ left: cl, top: ct, width: CW, height: CH2 }).png().toBuffer(), left: PAD + CW + 26, top: y });
    y += CH2 + PAD;

    const out = path.join(ST, '_crevasse4_' + R.V.id + '.png');
    fs.writeFileSync(out, await sharp({ create: { width: SW, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[sheet] ' + path.basename(out));
    R.playField = PD.png; R.playVac = PDv;
  }

  // ======================================================================
  // DECISION PANELS
  // ======================================================================
  if (!process.env.NOSHEETS) for (const trio of [
    ['playscale', 'playField', 'PLAY SCALE 48x24 px per tile (zoom 1.0). This is where it is decided. glacier is the TOP row -- the question is whether the rest look different from it AND do not read as a repeat.'],
    ['vacuum', 'playVac', 'PLAY SCALE under the VACUUM darkening rgba(5,10,25,0.45) -- airless ice moon. glacier is the TOP row.'],
  ]) {
    const comp = []; let y = PAD, maxW = 0;
    comp.push({ input: label('CREVASSE ROUND 4, THE HAIRLINE NET -- ' + trio[2], 2900, 19, '#e6edf3'), left: PAD, top: y }); y += 30;
    comp.push({ input: label('every rung holds B/R 1.10, G/R 1.06, tiltY 3.0 / tiltX 0.0, and a mean L locked on glacier\'s own per-slot level by a closed-form lip solve (bright cancels dark). ' +
      'No second flatten, identical random draw on every rung. Vorlage: Pluto Sputnik Planitia / Europa lineae / Ganymede sulci.', 2900, 13, '#8b949e'), left: PAD, top: y }); y += 24;
    for (const R of results) {
      const avg = (f) => R.slots.reduce((a, s) => a + f(s), 0) / 4;
      comp.push({
        input: label(R.V.label.padEnd(74) + 'L ' + f1(avg((s) => s.lum)).padStart(5) +
          '  micro8 ' + f2(avg((s) => s.micro)).padStart(6) +
          '  dark ' + f1(100 * avg((s) => s.darkFrac)).padStart(5) + '%' +
          '  GRIDplay ' + f2(R.gPlay.gridTot) + ' (coh ' + f2(R.gPlay.gridCoh) + ')' +
          (R.sep ? "   d'lvl " + f2(R.sep.dLevel) + "  d'tex " + f2(R.sep.dTexture) + "  JOINT " + f2(R.sep.dJoint) : '   (the reference)'),
          2850, 15, R.V.col), left: PAD, top: y,
      });
      y += 22;
      const img = R[trio[1]];
      const m = await sharp(img).metadata();
      comp.push({ input: img, left: PAD, top: y });
      maxW = Math.max(maxW, m.width); y += m.height + 16;
    }
    const out = path.join(ST, '_crevasse4_' + trio[0] + '.png');
    fs.writeFileSync(out, await sharp({ create: { width: Math.max(maxW, 2900) + PAD * 2, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[panel] ' + path.basename(out));
  }

  // ======================================================================
  // crevasse AND glacier in ONE field -- the recognisability threshold
  // ======================================================================
  {
    const comp = []; let y = PAD, maxW = 0;
    comp.push({ input: label('CREVASSE vs GLACIER -- ONE FIELD, coherent patches, play scale. left plain, right under vacuum. THE question: can you see where one stops and the other starts?', 2900, 19, '#e6edf3'), left: PAD, top: y }); y += 28;
    comp.push({ input: label('patches alternate every 5 rows / 4 columns. If you cannot find the boundary, the rung is below the recognisability threshold -- that is a RESULT, not a failure.', 2900, 13, '#8b949e'), left: PAD, top: y }); y += 24;
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
    const out = path.join(ST, '_crevasse4_vs_glacier.png');
    fs.writeFileSync(out, await sharp({ create: { width: Math.max(maxW, 2900) + PAD * 2, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[panel] ' + path.basename(out));
  }

  // ======================================================================
  // FOLD MAP
  // ======================================================================
  {
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
    const FW = 660, FH = 330, PER = 5, comp = []; let y = PAD;
    comp.push({ input: label('CREVASSE ROUND 4 -- THE FOLD MAP: the lattice, drawn.', 2400, 19, '#e6edf3'), left: PAD, top: y }); y += 30;
    comp.push({ input: label('the whole tessellated field folded onto ONE tile through the exact iso lattice and averaged. what survives IS the visible lattice. ' +
      'grey 128 = field mean, +-' + AMP_RANGE + ' luma -> +-110. a flat grey diamond is what you want; a drawn shape is a stamp the eye will find. ' +
      'WATCH THE RIM: a bright ring means the rim fade cleared a groove-free border on every tile.', 2400, 13, '#8b949e'), left: PAD, top: y }); y += 26;
    let x = PAD, rowTop = y, rowMax = 0;
    for (let i = 0; i < results.length; i++) {
      const R = results[i];
      if (i > 0 && i % PER === 0) { rowTop = rowTop + rowMax; y = rowTop; x = PAD; rowMax = 0; }
      comp.push({ input: label(R.V.label, FW, 13, R.V.col), left: x, top: y });
      comp.push({
        input: label('FULL ' + f2(R.gFull.gridTot) + ' (coh ' + f2(R.gFull.gridCoh) + ' slot ' + f2(R.gFull.gridSlot) +
          ')   |   PLAY ' + f2(R.gPlay.gridTot) + ' (coh ' + f2(R.gPlay.gridCoh) + ')  ratio ' + f2(R.gPlay.ratio), FW, 13, '#8b949e'), left: x, top: y + 20,
      });
      comp.push({ input: await foldImage(R.gFull.fold, FW, FH), left: x, top: y + 40 });
      x += FW + 16; rowMax = Math.max(rowMax, 40 + FH + 22);
    }
    const out = path.join(ST, '_crevasse4_foldmap.png');
    fs.writeFileSync(out, await sharp({ create: { width: PAD * 2 + PER * (FW + 16), height: rowTop + rowMax + PAD, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[panel] ' + path.basename(out));
  }

  // ======================================================================
  // NUMBERS
  // ======================================================================
  const txt = [];
  const T = (s) => txt.push(s);
  T('CREVASSE FROM GLACIER, ROUND 4 -- THE HAIRLINE NET  ' + new Date().toISOString().slice(0, 16) + '   (style test, nothing written to src/assets/tiles/)');
  T('THE REVERSAL vs rounds 1-3: those cut DEEP gashes and separated from glacier through DARKNESS (dark% 6-25%, level -1 to -7, micro8 capped at 12.4).');
  T('  Rudi asked for the opposite -- "eher sehr dezent, oberflaechliche risse". A dense net of SHALLOW grooves adds short edges (micro8 UP) without');
  T('  touching the mean (level STAYS at glacier). The separation therefore has to come out of d\'texture, not d\'level. A level leg here = grooves too deep.');
  T('VORLAGE (Rudi): PLUTO / Sputnik Planitia = a bright ice plain under a polygonal net of shallow troughs -> a Voronoi cell net, the primary form here, and');
  T('  the ladder\'s main axis is its CELL SIZE. EUROPA lineae = long bands with a BRIGHT CORE between dark margins -> the "helle Bruchkante" as a vorlage, not');
  T('  a trick. GANYMEDE sulci = blocks of parallel furrows at differing headings -> the directed answer, measured against Pluto at the same pitch.');
  T('THE GROUND IS GLACIER. Every rung is the multiplier (1-dark)(1+bright) applied to the frozen shipped tile. It is achromatic and the chroma cap is set to');
  T('  glacier\'s own residual chroma (' + f2(100 * chrG) + '%), so the desaturation step is a NO-OP and glacier\'s colour is untouched. Full-tile NCC vs glacier is the guard.');
  T('SCALE ARITHMETIC: 1 world unit = ' + f1(W2PX) + ' screen px. micro8 lives on the 64x32 mip = 8 screen px per mip pixel, so only a groove PITCH of ~16-32 px lifts it.');
  T('  That is why the ladder moves CELL SIZE and not depth. Mask evaluated at 2x (1024x512) and box-downsampled -- anti-aliasing, never an upscale of the tile.');
  T('THE LIP IS SOLVED IN CLOSED FORM, PER SLOT. The multiplier is (1-D)(1+kB) and its mean is exactly 1 when k = mean(D)/(mean(B)-mean(D*B)), read straight off the');
  T('  mask -- no search, no convergence risk. That is the whole mechanism: THE BRIGHT AND THE DARK CANCEL, TILE BY TILE, so the level cannot drift and d\'level cannot');
  T('  become the leg. k must be per slot: how much trough wall faces the light depends on how that slot\'s random cell edges happen to lie, and one k for all four');
  T('  left two slots a full luma below glacier. Measured ink and lit per slot are in the PER-SLOT block below and agree to ~0.003.');
  T('THE LEVEL IS LOCKED ON THE MEAN, NOT ON p70 -- a deliberate break with rounds 1-3. A deep fissure is a small dark area and leaves p70 alone, so p70 was a fine');
  T('  ground anchor there. A Sputnik trough net covers ~50% of the tile, p70 lands INSIDE the bright lip, and locking it dragged the whole tile 1.5 luma below');
  T('  glacier and manufactured a d\'level leg out of nothing. So: mean L is locked to glacier\'s own per-slot L, and the GROUND level is reported separately as gp70,');
  T('  measured only on pixels the mask never touched, against glacier\'s p70 over that SAME pixel set (gp70R). gp70 ~ gp70R is the real "still glacier" proof.');
  T('GRADE: B/R 1.100, G/R 1.060, tiltY 3.0 / tiltX 0.0. No second flatten. RIM FADE to zero in the last 11% of world distance before the diamond edge.');
  T('');
  T('  rung                                                                          L   gp70  gp70R  gNCCm    B/R    G/R   chr%  dark%   blow%     sd  micro8 micro4     tY    step  rough    s/r rimInk  stamp   GRIDfull    coh   slot   GRIDplay    coh   slot  ratio   GRIDvac    d\'lvl   d\'tex  d\'JOINT   d\'vac');
  for (const R of results) {
    const avg = (f) => R.slots.reduce((a, s) => a + f(s), 0) / 4;
    T('  ' + R.V.label.padEnd(74) +
      f1(avg((s) => s.lum)).padStart(5) +
      (R.V.ref ? f1(avg((s) => s.p70)).padStart(7) + '      -' + '      -'
               : f1(avg((s) => s.gP70)).padStart(7) + f1(avg((s) => s.gP70ref)).padStart(7) + f2(avg((s) => s.gNccMask)).padStart(7)) +
      f2(avg((s) => s.br)).padStart(7) + f2(avg((s) => s.gr)).padStart(7) +
      f2(100 * avg((s) => s.chromaRes)).padStart(7) + f1(100 * avg((s) => s.darkFrac)).padStart(7) +
      f2(100 * Math.max.apply(null, R.slots.map((s) => s.blow))).padStart(8) +
      f1(avg((s) => s.sd)).padStart(7) + f2(avg((s) => s.micro)).padStart(8) + f2(avg((s) => s.micro4)).padStart(7) +
      f1(avg((s) => s.tiltY)).padStart(7) +
      f2(R.bs.step).padStart(8) + f2(R.bs.rough).padStart(7) + f2(R.bs.ratio).padStart(7) +
      (R.V.ref ? '      -' : f2(R.rimInk).padStart(7)) +
      (R.V.ref ? '      -' : f2(R.stamp).padStart(7)) +
      f2(R.gFull.gridTot).padStart(11) + f2(R.gFull.gridCoh).padStart(7) + f2(R.gFull.gridSlot).padStart(7) +
      f2(R.gPlay.gridTot).padStart(11) + f2(R.gPlay.gridCoh).padStart(7) + f2(R.gPlay.gridSlot).padStart(7) + f2(R.gPlay.ratio).padStart(7) +
      f2(R.gPlayVac.gridTot).padStart(10) +
      (R.sep ? f2(R.sep.dLevel).padStart(9) + f2(R.sep.dTexture).padStart(8) + f2(R.sep.dJoint).padStart(9) + f2(R.sepVac.dJoint).padStart(8) : '        -       -        -       -'));
  }
  T('');
  T('THE RECOGNISABILITY THRESHOLD -- the question Rudi actually asked: can "sehr dezent" and "unterscheidbar" hold at the same time?');
  T('  Read d\'texture as the answer, because at play scale that is the only channel left once the level is nulled: >= 1.0 = an area of crevasse is told from');
  T('  an area of glacier, 0.5-1.0 = only side by side, < 0.5 = the same tile with two names. dark% says whether the grooves are still "oberflaechlich".');
  T('  rung                                                                        micro8   d\'tex   d\'lvl   dark%   GRIDplay   verdict');
  for (const R of results) {
    if (R.V.ref) continue;
    const avg = (f) => R.slots.reduce((a, s) => a + f(s), 0) / 4;
    const dt = R.sep.dTexture, dl = R.sep.dLevel, dk = 100 * avg((s) => s.darkFrac);
    let v;
    if (dt >= 1.0 && dl <= 1.0 && dk <= 5.0) v = 'PASSES -- separated by TEXTURE, level nulled, grooves still shallow';
    else if (dt >= 1.0 && dk > 5.0) v = 'separated, but dark% left "oberflaechlich" behind';
    else if (dt >= 1.0 && dl > 1.0) v = 'separated, but a LEVEL leg is back -- not what round 4 is for';
    else if (dt >= 0.5) v = 'BORDERLINE -- reads only side by side';
    else if (dl > 1.0) v = 'BELOW THRESHOLD in texture; what little separation there is, is level';
    else v = 'BELOW THRESHOLD -- the same tile with two names';
    T('  ' + R.V.label.padEnd(74) + f2(avg((s) => s.micro)).padStart(6) + f2(dt).padStart(8) + f2(dl).padStart(8) +
      f1(dk).padStart(8) + f2(R.gPlay.gridTot).padStart(11) + '   ' + v);
  }
  T('');
  T('THE THREE EARLIER ROUNDS IN THE SAME COLUMNS (best rungs only), so the reversal is visible:');
  T('  R1 DIRECT 6 fissures, black walls                     38.1  ... dark 22.4%  micro8 11.71   GRIDplay 18.57   d\'lvl 2.66  d\'tex 3.90   -- separated by DARKNESS');
  T('  R2 B 3 gashes drawn, contained                        42.6  ... dark  6.4%  micro8 10.03   GRIDplay  7.81   d\'lvl 7.18  d\'tex 1.47   -- still a level leg');
  T('  R3 d6 dense, blue ice on the break lip                43.9  ... dark  8.5%  micro8  6.85   GRIDplay  9.44   d\'lvl 0.46  d\'tex 1.09   -- flux ground, level ok, micro8 BELOW glacier');
  T('');
  T('PAIR DISTANCES per rung, same-planet neighbours.');
  T('  rung                                                                        vs glacier (44.0 / 1.10 / 1.06 / 7.40)     vs tundra (30.8 / 0.82 / 0.91 / 3.3)       vs ice_shelf (22.0 / 2.86 / 2.18 / 4.5)');
  for (const R of results) {
    const avg = (f) => R.slots.reduce((a, s) => a + f(s), 0) / 4;
    const mL = avg((s) => s.lum), mb = avg((s) => s.br), mg = avg((s) => s.gr), mM = avg((s) => s.micro);
    let row = '  ' + R.V.label.padEnd(74);
    for (const nb of NEIGH) {
      row += ('dL ' + ((mL - nb.lum >= 0 ? '+' : '') + f1(mL - nb.lum)) +
        '  dB/R ' + ((mb - nb.br >= 0 ? '+' : '') + f2(mb - nb.br)) +
        '  dG/R ' + ((mg - nb.gr >= 0 ? '+' : '') + f2(mg - nb.gr)) +
        '  mic x' + f2(mM / nb.micro)).padEnd(44);
    }
    T(row);
  }
  T('');
  T('MIRROR CONVENTION, PROVEN BY CROSS-CORRELATION. crevasse inherits its orientation from glacier because slot n IS glacier slot n with a multiplier on it,');
  T('and glacier already carries the ICE-corpus convention (glacier slots: 0 <- regolith_3 as is, 1 <- regolith_1 as is, 2 <- regolith_0 ROTATED 180,');
  T('3 <- regolith_3 ROTATED 180). The proof is that IDENTITY must WIN on every slot in the four-orientation NCC against glacier slot n, and win at ~1.0:');
  T('anything less would mean the mask moved the base and the inherited rotation of slots 2/3 could no longer be assumed.');
  T('  rung                                                                        slot 0 id/flop/flip/hv               slot 1                               slot 2 (rot180 inherited)            slot 3 (rot180 inherited)');
  for (const R of results) {
    if (R.V.ref) continue;
    let row = '  ' + R.V.label.padEnd(74);
    for (let n = 0; n < 4; n++) {
      const s = R.slots[n];
      row += (f2(s.nccId) + ' / ' + f2(s.nccFlop) + ' / ' + f2(s.nccFlip) + ' / ' + f2(s.nccHV)).padEnd(37);
    }
    T(row);
  }
  T('');
  T('STAMP PROOF -- worst pairwise slot-vs-slot NCC over all four orientations. THE BASELINE IS NOT ZERO: glacier itself reads ' + f2(GLACIER_STAMP) + ' (pair ' + GLACIER_STAMP_PAIR + ')');
  T('because slots 0 and 3 ARE the same regolith tile rotated 180 by corpus convention. Every rung below sits UNDER that, i.e. the trough net actively de-correlates the pair.');
  T('  ' + 'glacier as shipped (the reference)'.padEnd(74) + f2(GLACIER_STAMP) + '   (worst pair ' + GLACIER_STAMP_PAIR + ')');
  for (const R of results) if (!R.V.ref) T('  ' + R.V.label.padEnd(74) + f2(R.stamp) + '   (worst pair ' + R.stampPair + ')');
  T('');
  T('PER-SLOT SEED, SOLVED LIP AND INK BALANCE. lipK is the closed-form solution above; "x N of depth" is the resulting lip amplitude as a multiple of the trough');
  T('depth. ink = mean darkening over the tile, lit = mean brightening. THE TWO MUST MATCH -- that is the level guarantee, and it is not iterated, it is solved.');
  for (const R of results) if (R.notes) T('  ' + R.V.label.padEnd(74) + R.notes.join('   |   '));
  T('');
  T('WHAT THE COLUMNS ARE.');
  T('  micro8 = mean |dL| between 4-neighbours on the 64x32 mip. glacier 7.40. This is the round-4 target column: it must go UP while L stays at 44.');
  T('  micro4 = the same on the 128x64 mip (4 screen px per pixel) -- added this round because the play view at 48x24 sits between the two mips and a');
  T('           groove net can lift one without the other. glacier ' + f2(gAvg((s) => s.micro4)) + '.');
  T('  gp70   = GROUND level: p70 over the pixels with D+B < 0.02, i.e. the ones the mask never touched. gp70R = glacier\'s p70 over that SAME pixel set. The two must');
  T('           agree. The whole-tile p70 column of rounds 1-3 is not shown because here it sits in the bright lip (92-96 against glacier 89.8) and means nothing.');
  T('  gNCCm  = NCC against the frozen glacier over those same untouched pixels. ~1.00 = the ground came through bit for bit, which the multiply guarantees by');
  T('           construction. It is the guard, not the question.');
  T('  rimInk = ink inside the rim-fade band as a fraction of the interior ink. 0.50 = a smooth ramp to zero, i.e. grooves thin out and close before the edge.');
  T('           0.00 would be a groove-FREE ring, a lattice tell in itself; 1.00 = no fade. The A2-rimsoft rung runs the fade to a floor of 0.32 for comparison.');
  T('  dark%  = share of opaque pixels below 0.55x the tile\'s own p50 (~0.55 x ' + f1(gAvg((s) => s.p50)) + '). A groove has to darken by >45% to register. glacier ' + f1(100 * gAvg((s) => s.darkFrac)) + '%.');
  T('  rimG%  = share of the diamond rim band (1-6 px inside) darker than 0.80x p50 -- i.e. groove rather than ground. glacier ' + f1(100 * gAvg((s) => s.rimFis)) + '%.');
  T('           NOTE this round uses a 0.80x threshold, not round 1-3\'s 0.55x, because shallow grooves never reach 0.55x; the columns are NOT comparable across rounds.');
  T('  gNCC   = full-tile NCC against the frozen glacier. The multiply keeps the ground, so this must stay high; it is the guard, not the question.');
  T('  grid   = sd, in luma units, over the 4 x BINS^2 slot-bin cells of the lattice fold = the tile\'s own LOW-FREQUENCY contrast at bin resolution.');
  T('           COH = the part identical on all four slots (literally a stamp). SLOT = the part that differs per slot. Bar for this round: PLAY < 10.40,');
  T('           coh as close to glacier\'s 3.22 as the form allows.');
  T('  d\'     = separability from glacier at play scale over the per-tile distribution of a 40x24 field: |mean difference| / rms of the two spreads.');
  T('           d\'level on tile mean luma, d\'texture on within-tile sd. >= 1.0 separated, < 0.5 the same tile with two names.');
  T('           ROUND 4 REQUIREMENT: JOINT >= 1.0 CARRIED BY d\'texture. A big d\'level would mean the grooves went deep again.');
  fs.writeFileSync(path.join(ST, '_crevasse4_numbers.txt'), txt.join('\n') + '\n');
  fs.writeFileSync(path.join(WORK, 'ladder_stats.json'), JSON.stringify(
    results.map((R) => ({
      id: R.V.id, label: R.V.label, notes: R.notes, stamp: R.stamp, lipK: R.lipK, rimInk: R.rimInk,
      slots: R.slots.map((s) => Object.assign({}, s, { png: undefined })),
      bs: R.bs, sep: R.sep, sepVac: R.sepVac,
      gFull: Object.assign({}, R.gFull, { fold: undefined }),
      gPlay: Object.assign({}, R.gPlay, { fold: undefined }),
      gPlayVac: Object.assign({}, R.gPlayVac, { fold: undefined }),
    })), null, 1));
  console.log('\n' + txt.join('\n'));
  console.log('\n[out] _crevasse4_numbers.txt  +  crevasse4/ladder_stats.json');
})();
