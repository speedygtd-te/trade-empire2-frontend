/**
 * CREVASSE FROM GLACIER, STEP 2 OF 2 -- GRADE BACK, MEASURE, CONTACT SHEETS.
 *
 * STYLE TEST. Writes only into assets/style-test/tiles/crevasse/ and
 * assets/style-test/tiles/_crevasse_lad_*.png|txt. NOTHING is written to
 * src/assets/tiles/. No fal.ai, no cap sync, no build, no git.
 *
 * INPUT: the raw kontext returns produced by tiles-crevasse-kontext.cjs,
 *        assets/style-test/tiles/crevasse/kraw/<VARIANT>/crevasse_<n>_kraw.png
 *
 * WHAT THIS SCRIPT DOES AND, MORE IMPORTANTLY, WHAT IT DOES NOT
 *
 * (a) GRADE BACK. kontext lifts and de-tints of its own accord (on tundra
 *     30.8 -> 42.4 and B/R 0.63 -> 0.97). So the return has to be pulled back onto
 *     the family: B/R 1.100, G/R 1.060, the shipped glacier hue.
 *
 * (b) THE LEVEL IS SOLVED ON THE GROUND, NOT ON THE MEAN. If the whole-tile mean
 *     were driven to glacier's 44.0, the grade would BRIGHTEN the ground to pay
 *     for the dark fissures, and crevasse would end up with a lighter ground than
 *     the glacier next to it -- the opposite of what a crevasse field looks like.
 *     The solver therefore targets the 70th luma PERCENTILE, which is ground and
 *     only ground (the fissures live in the bottom tail), onto glacier's own p70.
 *     The whole-tile mean is then an OUTPUT, not a target: the fissures subtract
 *     from it and whatever it lands on is the honest brightness leg. Expected
 *     somewhere in 38-41 against glacier's 44.0; it is reported, never forced.
 *
 * (c) NO SECOND FLATTEN. glacier was flattened with a total-degree-5 polynomial
 *     to kill the regolith brightness blobs. FISSURES ARE LARGE-SCALE BRIGHTNESS
 *     STRUCTURE. Running the polynomial again would fit the fissures and divide
 *     them straight back out -- it would undo the entire point of this run. The
 *     ground underneath is already flat, so there is nothing left to flatten.
 *     flatten() does not exist in this file, deliberately.
 *
 * (d) THE LIGHT PLANE IS RE-IMPOSED at tiltY 3.0 / tiltX 0.0, the ramp the whole
 *     ICE family holds, so two raster characters cannot end up on one planet. It
 *     is a UNIFORM multiplicative luma plane; there is no divide-by-blur anywhere,
 *     hence no contaminated denominator at the diamond edge and no yellow rim.
 *     rim_max proves it per rung.
 *
 * (e) THE CHROMA CAP IS PER-VARIANT. The residual-chroma cap (per-pixel saturation
 *     after the tile's own channel means are divided out) is what keeps one slot
 *     from reading brown next to the others -- glacier holds 1.2%. On the BLUE
 *     variants the pale ice on the fresh break lip IS residual chroma, so a 1.2%
 *     cap would desaturate exactly the thing the variant exists to test. BLUE
 *     therefore runs at 4.0% and the achieved value is reported, so the cost of
 *     the blue is visible as a number rather than hidden by the solver.
 *
 * MEASURED ON THE WRITTEN .webp, NEVER ON THE BUFFER (libwebp drops RGB under
 * alpha 0 and the diamond corners are ~50% of the canvas -> +1.5 luma drift).
 * sharp.cache(false) because the solve loop rewrites the same path repeatedly.
 *
 * THE TRENNBEIN. glacier and crevasse share a planet, so the run only succeeds if
 * they are told apart AT PLAY SCALE. Three numbers say so, and all three are in
 * the report: micro8 (glacier 7.40, family analysis asked crevasse for ~17), the
 * whole-tile mean L, and d' -- the per-tile separability of the two biomes in a
 * 48x24 field, computed on tile mean luma and on within-tile sd. d' >= 1.0 is
 * "an area of one is told from an area of the other"; d' < 0.5 is "same tile,
 * two names".
 *
 * Usage: node scripts/tiles-crevasse-ladder.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const WORK = path.join(ST, 'crevasse');
const SRCD = path.join(WORK, 'src');
const KRAW = path.join(WORK, 'kraw');

const TILE_W = 512, TILE_H = 256;
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// -- held on every rung, the shipped glacier target ------------------------
const TILT_Y = 3.0, TILT_X = 0.0;
const BR_T = 1.100, GR_T = 1.060;
const CAP_NEUTRAL = 0.012, CAP_BLUE = 0.040;
const SOLVE_PASSES = 8;

// -- vacuum darkening, from src/views/grid/isoConstants.ts ----------------
const VAC_A = 0.45, VAC_RGB = [5, 10, 25];
// -- play scale: zoom 1.0 build view is a 48x24 CSS px tile (detailTier.ts)
const PLAY_W = 48, PLAY_H = 24;

const VARIANTS = [];
for (const d of ['d2', 'd4', 'd6']) for (const w of ['NEUTRAL', 'BLUE']) {
  VARIANTS.push({
    id: d + '-' + w, dens: d, wall: w, mode: 'direct', src: d + '-' + w,
    label: d.replace('d', '') + ' fissures, ' + (w === 'NEUTRAL' ? 'black walls' : 'blue ice on the break lip'),
    cap: w === 'BLUE' ? CAP_BLUE : CAP_NEUTRAL,
    col: w === 'BLUE' ? '#79c0ff' : '#7ee787',
  });
}
// COMPOSITE rungs -- no extra fal.ai calls, the same kontext returns re-used.
// See compositeBase() for what they are and why they exist.
for (const d of ['d2', 'd4', 'd6']) {
  VARIANTS.push({
    id: d + '-COMPOSITE', dens: d, wall: 'NEUTRAL', mode: 'composite', src: d + '-NEUTRAL',
    label: d.replace('d', '') + ' fissures, COMPOSITE onto the real glacier',
    cap: CAP_NEUTRAL, col: '#ffa657',
  });
}

/**
 * THE COMPOSITE. The direct rungs measure ground-only NCC ~0.05 against the frozen
 * glacier: kontext drew the fissures AND threw the ground away, inheriting nothing
 * but the diamond silhouette. The scoped "keep ALL of the existing surface" wording
 * cut the collateral down but did not stop it. So the fissures are taken from
 * kontext and the GROUND IS TAKEN BACK FROM GLACIER, which is what the brief asks
 * for in the first place -- crevasse derived from the finished glacier.
 *
 * The transfer is a pure SHADOW MULTIPLY. The kontext return's luma is divided by
 * its OWN ground level (its p70), giving a ratio r that is ~1 on ground and ~0 in a
 * fissure. r is then put through a knee at T: anything within (1-T) of ground level
 * is passed as exactly 1.0, so kontext's regenerated ground modulation -- the
 * polygon vein network, the new crater rings, the smoothed plates -- multiplies by
 * one and vanishes, while the fissures, which sit far below the knee, come through
 * at full depth. glacier's own grain survives because it is what is being
 * multiplied. Ground-only NCC is ~1.0 by construction, and the numbers below prove
 * it rather than assert it.
 *
 * A pure multiply can only ever DARKEN, so the BLUE break lip -- which is added
 * light, not shadow -- cannot ride on it. A composite BLUE needs a second, additive
 * lip layer keyed on the kontext pixel's own chroma excess. That is a next round,
 * not a silent extra here; the BLUE question is answered by the direct rungs.
 */
const KNEE = 0.72;
async function compositeBase(krawFile, glacierFile) {
  const K = await sharp(fs.readFileSync(krawFile)).resize(TILE_W, TILE_H, { fit: 'fill' })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const G = await sharp(fs.readFileSync(glacierFile)).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const kc = K.info.channels, gc = G.info.channels, w = G.info.width, h = G.info.height;
  const lv = [];
  for (let p = 0; p < w * h; p++) {
    if (G.data[p * gc + 3] < 250) continue;
    lv.push(L709(K.data[p * kc], K.data[p * kc + 1], K.data[p * kc + 2]));
  }
  lv.sort((a, b) => a - b);
  const p70k = lv[Math.floor(lv.length * 0.7)] || 1;
  const out = Buffer.from(G.data);
  for (let p = 0; p < w * h; p++) {
    if (out[p * gc + 3] < 1) continue;
    const r = L709(K.data[p * kc], K.data[p * kc + 1], K.data[p * kc + 2]) / p70k;
    let m = r >= KNEE ? 1 : r / KNEE;
    if (m < 0) m = 0;
    for (let c = 0; c < 3; c++) {
      const v = G.data[p * gc + c] * m;
      out[p * gc + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return { data: out, width: w, height: h, channels: gc };
}

const DIAMOND = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + TILE_W + '" height="' + TILE_H + '">' +
  '<polygon points="' + TILE_W / 2 + ',0 ' + TILE_W + ',' + TILE_H / 2 + ' ' +
  TILE_W / 2 + ',' + TILE_H + ' 0,' + TILE_H / 2 + '" fill="white"/></svg>');

const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);

// ==========================================================================
// measurement, always on the WRITTEN file
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
  // RESIDUAL CHROMA -- per-pixel saturation after the tile's OWN channel means
  // are divided out, so a uniform hue cast scores ~0 and only genuine colour
  // variation survives. This is what says "the blue lip is actually there".
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
    p30: q(0.30), p50, p70: q(0.70), p99: q(0.99),
    // fissure area: opaque pixels well below the tile's own ground level
    darkFrac: lv.length ? lv.filter((v) => v < 0.55 * p50).length / lv.length : 0,
    blow: lv.length ? lv.filter((v) => v >= 200).length / lv.length : 0,
    tiltX: half.l / hn.l - half.r / hn.r, tiltY: half.t / hn.t - half.b / hn.b,
  };
}
async function statsOf(file) {
  const { data, info } = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return statsRaw(data, info.channels, info.width, info.height);
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
/**
 * RIM FISSURE COVERAGE. A fissure that stops dead at the tile boundary is a
 * visible raster hint: the neighbour is a random one of four slots and cannot
 * continue it. This is the share of the diamond rim band (1-6 px inside the
 * edge) that is fissure rather than ground. It is a COST of the "cross the whole
 * tile" instruction, reported next to the benefit it buys.
 */
async function rimFissure(file) {
  const { data, info } = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, w = info.width, h = info.height;
  const s = await statsOf(file);
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  let dark = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (data[i + 3] < 250) continue;
    const u = Math.abs(x - cx) / (w / 2) + Math.abs(y - cy) / (h / 2);
    const dpx = (1 - u) * (w / 4);
    if (dpx < 1 || dpx > 6) continue;
    if (L709(data[i], data[i + 1], data[i + 2]) < 0.55 * s.p50) dark++;
    n++;
  }
  return n ? dark / n : 0;
}
/**
 * GROUND-ONLY NCC -- did glacier's own texture actually survive under the fissures?
 * The plain NCC below cannot answer that: the fissures hold 15-25% of the tile and
 * swamp the mean-centred variance, so a tile whose ground was perfectly preserved
 * and a tile whose ground was rebuilt both score near zero. This one throws the
 * fissure pixels away (everything below 0.55x the crevasse tile's own p50) and
 * correlates only what is left against the same pixels of the frozen glacier.
 * It is also run on a blur-12 copy, because the kontext return comes back at
 * 1456x720 and is resized to 512x256, so a few pixels of geometric drift are
 * expected and must not be mistaken for a destroyed ground: large-scale structure
 * survives a small shift, fine grain does not.
 *   ~0.7+  the ground is glacier's, with fissures cut into it
 *   ~0.0   kontext regenerated the surface and only the silhouette is inherited
 */
async function groundNcc(fileA, fileB) {
  const load = async (f, blur) => {
    let s = sharp(fs.readFileSync(f));
    if (blur) s = s.blur(blur);
    return s.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  };
  const sa = await statsOf(fileA);
  const cut = 0.55 * sa.p50;
  const out = {};
  for (const [key, blur] of [['fine', 0], ['blur12', 12]]) {
    const A = await load(fileA, blur), B = await load(fileB, blur);
    const Am = await load(fileA, 0);   // the fissure mask is read unblurred
    const ca = A.info.channels, cb = B.info.channels, w = A.info.width, h = A.info.height;
    const a = [], b = [];
    for (let p = 0; p < w * h; p++) {
      if (Am.data[p * ca + 3] < 250 || B.data[p * cb + 3] < 250) continue;
      if (L709(Am.data[p * ca], Am.data[p * ca + 1], Am.data[p * ca + 2]) < cut) continue;
      a.push(L709(A.data[p * ca], A.data[p * ca + 1], A.data[p * ca + 2]));
      b.push(L709(B.data[p * cb], B.data[p * cb + 1], B.data[p * cb + 2]));
    }
    if (a.length < 100) { out[key] = 0; continue; }
    const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
    let n = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) { const u = a[i] - ma, v = b[i] - mb; n += u * v; da += u * u; db += v * v; }
    out[key] = n / Math.sqrt(da * db + 1e-9);
  }
  return out;
}

/** mean-centred masked NCC between two tiles' luma -- the mirror-convention check */
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
// the grade: desat toward luma x per-channel tint x level x uniform luma plane
// (no flatten -- see the header, (c))
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
 * Solve desat / tint / G / plane so the WRITTEN file hits p70 = p70T (THE GROUND
 * LEVEL, not the mean), B/R = BR_T, G/R = GR_T, tiltX 0.0, tiltY 3.0, with
 * residual chroma <= cap. The whole-tile mean L falls out of the fissures and is
 * measured afterwards, never targeted.
 */
async function solveTile(baseBuf, W, H, CH, outFile, p70T, cap) {
  const S = baseBuf;
  const b0 = statsRaw(S, CH, W, H);
  const desat = b0.chromaRes > cap ? cap / b0.chromaRes : 1;
  const tint = [1, (GR_T * b0.rgb[0]) / b0.rgb[1], (BR_T * b0.rgb[0]) / b0.rgb[2]];
  let G = p70T / b0.p70, p = 0, q = 0;
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
    G *= p70T / m.p70;
    tint[2] *= BR_T / m.br;
    tint[1] *= GR_T / m.gr;
    p += (TILT_X - m.tiltX) / Kx;
    q += (TILT_Y - m.tiltY) / Ky;
  }
  m.png = png;
  m.plane = { p, q, G, desat, tint: tint.slice() };
  return m;
}

// ==========================================================================
// fields
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
/** two biomes in ONE field, in coherent patches -- the core question, drawn */
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

/**
 * SEPARABILITY d'. Renders a pure field of each biome at play scale, reads every
 * tile's own mean luma and own within-tile sd, and returns d' = |mA-mB| /
 * sqrt((sA^2+sB^2)/2) for both features. This is the answer to "are the two told
 * apart on the map", as a number: d' >= 1.0 separated, < 0.5 the same tile twice.
 */
async function separability(bufsA, bufsB, vac) {
  const feat = async (bufs) => {
    const rnd = mulberry32(31337);
    const F = await isoField(bufs, PLAY_W, PLAY_H, 40, 24, () => Math.floor(rnd() * 4));
    const img = vac ? await vacuum(F.png) : F.png;
    const { L, w, h } = await lumaOf(img);
    const mm = [], ss = [];
    for (const c of F.cells) {
      let s = 0, s2 = 0, n = 0;
      for (let y = 2; y < PLAY_H - 2; y++) for (let x = 2; x < PLAY_W - 2; x++) {
        const dx = Math.abs(x - PLAY_W / 2) / (PLAY_W / 2), dy = Math.abs(y - PLAY_H / 2) / (PLAY_H / 2);
        if (dx + dy > 0.80) continue;                 // stay inside the diamond
        const px = c.left + x, py = c.top + y;
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const v = L[py * w + px];
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
    A, B,
    dLevel: dp(A.m, A.msd, B.m, B.msd),
    dTexture: dp(A.s, A.ssd, B.s, B.ssd),
    dJoint: Math.sqrt(Math.pow(dp(A.m, A.msd, B.m, B.msd), 2) + Math.pow(dp(A.s, A.ssd, B.s, B.ssd), 2)),
  };
}

// ==========================================================================
// THE GRID INDEX -- lattice fold, verbatim from tiles-tundra-tilt-ladder.cjs
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
    BINS, N: tot / (4 * NB), mean: cm, sdWithin: Math.sqrt(varWithin),
    fold: { BINS, cn: Array.from(cn), cs: Array.from(cs), mean: cm },
    gridCoh, gridTot, gridSlot, gridResid, rampPP,
    ratio: Math.sqrt(varWithin) > 0 ? gridTot / Math.sqrt(varWithin) : 0,
    pctOfMean: cm > 0 ? (100 * gridTot) / cm : 0,
  };
}

// ==========================================================================
// boundary step vs interior roughness
// ==========================================================================
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

// neighbours crevasse has to be separable from on the same planet
const NEIGH = [
  { id: 'glacier  (THE ONE)', lum: 44.0, br: 1.10, gr: 1.06, micro: 7.40, samePlanet: true },
  { id: 'tundra        (ICE)', lum: 30.8, br: 0.82, gr: 0.91, micro: 3.3, samePlanet: true },
  { id: 'ice_shelf     (ICE)', lum: 22.0, br: 2.86, gr: 2.18, micro: 4.5, samePlanet: true },
];

(async () => {
  // ---- the reference: shipped glacier, its own numbers, and its p70 target --
  const GL = [], GLB = [];
  let p70T = 0;
  for (let n = 0; n < 4; n++) {
    const f = path.join(SRCD, 'glacier_' + n + '_src.webp');
    const s = await statsOf(f);
    s.micro = await microContrast(path.join(TILES, 'glacier', 'glacier_' + n + '@eighth.webp'), f);
    s.rim = await rimHalo(f); s.rimFis = await rimFissure(f);
    GL.push(s); GLB.push(f); p70T += s.p70;
  }
  p70T /= 4;
  console.log('[glacier]  L ' + f1(GL.reduce((a, s) => a + s.lum, 0) / 4) +
    '  B/R ' + f2(GL.reduce((a, s) => a + s.br, 0) / 4) +
    '  G/R ' + f2(GL.reduce((a, s) => a + s.gr, 0) / 4) +
    '  micro8 ' + f2(GL.reduce((a, s) => a + s.micro, 0) / 4) +
    '  chr ' + f2(100 * GL.reduce((a, s) => a + s.chromaRes, 0) / 4) + '%' +
    '  dark% ' + f2(100 * GL.reduce((a, s) => a + s.darkFrac, 0) / 4) +
    '   ==> GROUND LEVEL TARGET p70 = ' + f1(p70T) + '\n');

  const results = [];

  // glacier itself as rung 0, measured through the identical pipeline
  {
    const bufs = [];
    for (let n = 0; n < 4; n++) bufs.push(await sharp(fs.readFileSync(GLB[n])).png().toBuffer());
    results.push({ V: { id: 'GLACIER', label: 'glacier as shipped (the reference)', col: '#8b949e', ref: true }, bufs, slots: GL, files: GLB.slice() });
  }

  for (const V of VARIANTS) {
    const dir = path.join(KRAW, V.src);
    if (!fs.existsSync(path.join(dir, 'crevasse_3_kraw.png'))) { console.log('[skip] ' + V.id + ' -- raws missing'); continue; }
    const outDir = path.join(WORK, V.id);
    fs.mkdirSync(outDir, { recursive: true });
    const bufs = [], slots = [], files = [];
    for (let n = 0; n < 4; n++) {
      const rawF = path.join(dir, 'crevasse_' + n + '_kraw.png');
      let R;
      if (V.mode === 'composite') {
        R = await compositeBase(rawF, GLB[n]);
        R = { data: R.data, info: { width: R.width, height: R.height, channels: R.channels } };
      } else {
        const resized = await sharp(fs.readFileSync(rawF)).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha().png().toBuffer();
        const mask = await sharp(DIAMOND).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
        const masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
        R = await sharp(masked).raw().toBuffer({ resolveWithObject: true });
      }
      const out = path.join(outDir, 'crevasse_' + n + '.webp');
      const m = await solveTile(R.data, R.info.width, R.info.height, R.info.channels, out, p70T, V.cap);
      fs.writeFileSync(path.join(outDir, 'crevasse_' + n + '.png'), m.png);
      bufs.push(m.png); files.push(out);
      const s = await statsOf(out);
      s.micro = await microContrast(out.replace(/\.webp$/, '@eighth.webp'));
      s.rim = await rimHalo(out); s.rimFis = await rimFissure(out);
      s.plane = m.plane;
      s.nccId = await ncc(out, GLB[n], false, false);
      s.nccFlop = await ncc(out, GLB[n], true, false);
      s.nccFlip = await ncc(out, GLB[n], false, true);
      s.nccHV = await ncc(out, GLB[n], true, true);
      const gn = await groundNcc(out, GLB[n]);
      s.gnFine = gn.fine; s.gnBlur = gn.blur12;
      // a slot kontext left alone: no fissure area worth the name
      s.noop = s.darkFrac < 0.06;
      slots.push(s);
    }
    results.push({ V, bufs, slots, files });
  }

  // ---- field metrics on every rung, identical random draw -----------------
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
      '  p70 ' + f1(avg((s) => s.p70)) +
      '  B/R ' + f2(avg((s) => s.br)) + '  G/R ' + f2(avg((s) => s.gr)) +
      '  chr ' + f2(100 * avg((s) => s.chromaRes)) + '%' +
      '  dark ' + f1(100 * avg((s) => s.darkFrac)) + '%' +
      '  micro8 ' + f2(avg((s) => s.micro)).padStart(6) +
      '  blow ' + f2(100 * Math.max.apply(null, R.slots.map((s) => s.blow))) + '%' +
      '  tY ' + f1(avg((s) => s.tiltY)) +
      '  GRIDplay ' + f2(R.gPlay.gridTot) + '/' + f2(R.gPlay.ratio) +
      '  s/r ' + f2(R.bs.ratio) +
      '  rimFis ' + f1(100 * avg((s) => s.rimFis)) + '%' +
      (R.sep ? "  d'L " + f2(R.sep.dLevel) + " d'T " + f2(R.sep.dTexture) : ''));
  }

  // ======================================================================
  // PER-RUNG CONTACT SHEETS
  // ======================================================================
  const SW = 2160, PAD = 18;
  for (const R of results) {
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

    line('CREVASSE FROM GLACIER -- ' + R.V.label, 19, R.V.col);
    line('STYLE TEST, nothing written to src/assets/tiles/. numbers measured on the WRITTEN .webp. derived from the FROZEN shipped glacier; ' +
      'ground level solved on p70 = ' + f1(p70T) + ' (glacier\'s own), whole-tile mean L is an OUTPUT. no second flatten. ' + new Date().toISOString().slice(0, 16), 13, '#8b949e');
    y += 4;
    line('  slot     L    intL     p30     p50     p70    B/R    G/R     sd  chr%  dark%  blow%  micro8   tiltX   tiltY    rim   rimFis%   groundNCC fine/blur12   NCC id/flop/flip/hv', 13, '#8b949e');
    for (let n = 0; n < 4; n++) {
      const s = R.slots[n];
      line('   ' + n + '  ' + f1(s.lum).padStart(6) + f1(s.intLum).padStart(8) + f1(s.p30).padStart(8) + f1(s.p50).padStart(8) + f1(s.p70).padStart(8) +
        f2(s.br).padStart(7) + f2(s.gr).padStart(7) + f1(s.sd).padStart(7) +
        f2(s.chromaRes * 100).padStart(6) + f1(s.darkFrac * 100).padStart(7) + f2(s.blow * 100).padStart(7) +
        f2(s.micro).padStart(8) + f1(s.tiltX).padStart(8) + f1(s.tiltY).padStart(8) +
        ((s.rim >= 0 ? '+' : '') + f2(s.rim)).padStart(7) + f1(100 * s.rimFis).padStart(9) + '   ' +
        (s.gnFine !== undefined ? (f2(s.gnFine) + ' / ' + f2(s.gnBlur)).padStart(15) : '              -') + '     ' +
        (s.nccId !== undefined ? (f2(s.nccId) + ' / ' + f2(s.nccFlop) + ' / ' + f2(s.nccFlip) + ' / ' + f2(s.nccHV)) : '(the reference itself)') +
        (s.noop ? '   <== NO FISSURES DRAWN, kontext returned the input' : ''), 13, s.noop ? '#ff7b72' : '#c9d1d9');
    }
    y += 6;
    if (!R.V.ref) {
      const gnf = avg((s) => s.gnFine), gnb = avg((s) => s.gnBlur);
      line('GROUND SURVIVAL  ground-only NCC against the frozen glacier, fissure pixels excluded:  fine ' + f2(gnf) + '   blur12 ' + f2(gnb) +
        '     ~0.7+ = the ground IS glacier with fissures cut into it;  ~0.0 = kontext regenerated the surface and only the silhouette is inherited', 13,
        gnf >= 0.6 ? '#7ee787' : gnf >= 0.3 ? '#ffa657' : '#ff7b72');
    }
    line('LEVEL          ground p70 ' + f1(avg((s) => s.p70)) + ' (target ' + f1(p70T) + ', glacier\'s own)   ->   whole-tile mean L ' + f1(mL) +
      '   vs glacier 44.0   =  dL ' + ((mL - 44.0 >= 0 ? '+' : '') + f1(mL - 44.0)) + '   [the fissures pay for this, it is not dialled in]', 13, '#ffa657');
    line('HUE            B/R ' + f2(mb) + '   G/R ' + f2(mg) + '   RESIDUAL chroma ' + f2(100 * avg((s) => s.chromaRes)) + '%  (cap ' + f1(100 * (R.V.cap || CAP_NEUTRAL)) + '%, glacier ' + f2(100 * GL.reduce((a, s) => a + s.chromaRes, 0) / 4) + '%)', 13, '#ffa657');
    line('FISSURE AREA   dark ' + f1(100 * avg((s) => s.darkFrac)) + '% of the tile (below 0.55x its own p50)   glacier ' + f1(100 * GL.reduce((a, s) => a + s.darkFrac, 0) / 4) + '%', 13, '#ffa657');
    line('BLOWOUT        worst slot ' + f2(100 * worstBlow) + '%   (bar: < 1.00%)', 13, worstBlow < 0.01 ? '#7ee787' : '#ff7b72');
    line('RIM HALO       worst slot ' + ((worstRim >= 0 ? '+' : '') + f2(worstRim)) + '     must not go positive (uniform plane, no divide-by-blur)', 13, worstRim <= 0.3 ? '#7ee787' : '#ff7b72');
    line('RIM FISSURE    ' + f1(100 * avg((s) => s.rimFis)) + '% of the diamond rim band is fissure, not ground  (glacier ' + f1(100 * GL.reduce((a, s) => a + s.rimFis, 0) / 4) +
      '%)  -- a fissure that stops at the tile edge cannot be continued by a random neighbour slot', 13,
      avg((s) => s.rimFis) < 0.10 ? '#7ee787' : avg((s) => s.rimFis) < 0.20 ? '#ffa657' : '#ff7b72');
    line('BOUNDARY STEP  step ' + f2(R.bs.step) + '   interior roughness ' + f2(R.bs.rough) + '   RATIO ' + f2(R.bs.ratio) + '   (lower = the tile edge reads less as a line)', 13, '#ffa657');
    line('GRID INDEX     lattice fold of the tessellated field, rim band excluded (max(|du|,|dv|) <= ' + RIM_CUT + ')', 13, '#ffa657');
    for (const [nm, g] of [['FULL RES', R.gFull], ['PLAY 48x24', R.gPlay], ['PLAY + VACUUM', R.gPlayVac]]) {
      line('      ' + nm.padEnd(14) + 'grid_tot ' + f2(g.gridTot) + ' L   (coherent ' + f2(g.gridCoh) + ', slot-dependent ' + f2(g.gridSlot) +
        ')   ramp_pp ' + f2(g.rampPP) + '   resid ' + f2(g.gridResid) + '   sd_within ' + f2(g.sdWithin) +
        '   ratio ' + f3(g.ratio) + '   ' + f2(g.pctOfMean) + '% of mean ' + f1(g.mean), 13, '#8b949e');
    }
    line('    reference at PLAY scale: glacier 5.79 / ratio 0.59  |  new tundra 2.60 / 0.86  |  ice_shelf 7.10 / 1.21  |  REJECTED old tundra 10.40 / 1.12', 13, '#8b949e');
    y += 6;
    if (R.sep) {
      line("SEPARABILITY FROM GLACIER at play scale -- d' over the per-tile distribution of a 40x24 field", 15, '#ffa657');
      for (const [nm, S] of [['plain', R.sep], ['under vacuum', R.sepVac]]) {
        line('    ' + nm.padEnd(14) +
          "tile mean L  crevasse " + f1(S.A.m) + ' +-' + f1(S.A.msd) + '   glacier ' + f1(S.B.m) + ' +-' + f1(S.B.msd) + "   d' " + f2(S.dLevel) +
          '        within-tile sd  crevasse ' + f1(S.A.s) + ' +-' + f1(S.A.ssd) + '   glacier ' + f1(S.B.s) + ' +-' + f1(S.B.ssd) + "   d' " + f2(S.dTexture) +
          "        JOINT d' " + f2(S.dJoint), 13,
          S.dJoint >= 1.5 ? '#7ee787' : S.dJoint >= 0.8 ? '#ffa657' : '#ff7b72');
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
    comp.push({ input: await sharp(FD.png).resize(Math.round(FD.w * fdScale), Math.round(FD.h * fdScale)).png().toBuffer(), left: PAD, top: y });
    y += Math.round(FD.h * fdScale) + 14;

    const F22 = await isoField(R.bufs, TILE_W, TILE_H, 4, 3, (r, c) => ((r % 2) * 2 + (c % 2)));
    line('THE CLOSED 2x2 REPEAT at 1:1 -- every slot touches every other slot, all four seam types in one look', 15, '#7ee787');
    const s22 = Math.min(1, (SW - PAD * 2) / F22.w);
    comp.push({ input: await sharp(F22.png).resize(Math.round(F22.w * s22), Math.round(F22.h * s22)).png().toBuffer(), left: PAD, top: y });
    y += Math.round(F22.h * s22) + 14;

    const rndP = mulberry32(90210);
    const PD = await isoField(R.bufs, PLAY_W, PLAY_H, 44, 20, () => Math.floor(rndP() * 4));
    const PDv = await vacuum(PD.png);
    line('PLAY SCALE, 48x24 px per tile (zoom 1.0 build view)      |      the SAME field under the VACUUM darkening rgba(5,10,25,0.45)', 15, '#7ee787');
    comp.push({ input: PD.png, left: PAD, top: y });
    comp.push({ input: PDv, left: PAD + PD.w + 30, top: y });
    y += PD.h + 14;

    const CW = Math.min(1020, FD.w - 20), CH2 = Math.min(470, FD.h - 20);
    const FDv = await vacuum(FD.png);
    const cl = Math.round(FD.w / 2 - CW / 2), ct = Math.round(FD.h / 2 - CH2 / 2);
    line('1:1 crop of a four-tile junction      |      the same crop under the VACUUM darkening   -- watch the fissures at the tile edges', 15, '#7ee787');
    comp.push({ input: await sharp(FD.png).extract({ left: cl, top: ct, width: CW, height: CH2 }).png().toBuffer(), left: PAD, top: y });
    comp.push({ input: await sharp(FDv).extract({ left: cl, top: ct, width: CW, height: CH2 }).png().toBuffer(), left: PAD + CW + 30, top: y });
    y += CH2 + PAD;

    const out = path.join(ST, '_crevasse_lad_' + R.V.id + '.png');
    fs.writeFileSync(out, await sharp({ create: { width: SW, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[sheet] ' + path.basename(out));
    R.playField = PD.png; R.playVac = PDv;
  }

  // ======================================================================
  // DECISION PANELS: every rung at play scale, plain and under vacuum
  // ======================================================================
  for (const [suffix, key, head] of [
    ['playscale', 'playField', 'PLAY SCALE 48x24 px per tile (zoom 1.0). This is where it is decided. glacier is the top row -- the question is whether the rest look different from it.'],
    ['vacuum', 'playVac', 'PLAY SCALE under the VACUUM darkening rgba(5,10,25,0.45) -- airless ice moon. glacier top row.'],
  ]) {
    const comp = []; let y = PAD, maxW = 0;
    comp.push({ input: label('CREVASSE FROM GLACIER -- ' + head, 2400, 19, '#e6edf3'), left: PAD, top: y }); y += 30;
    comp.push({ input: label('every rung holds B/R 1.10, G/R 1.06, tiltY 3.0 / tiltX 0.0, ground p70 = glacier\'s own. no second flatten. identical random draw on all rungs.', 2400, 13, '#8b949e'), left: PAD, top: y }); y += 24;
    for (const R of results) {
      const avg = (f) => R.slots.reduce((a, s) => a + f(s), 0) / 4;
      comp.push({
        input: label(R.V.label.padEnd(42) + 'L ' + f1(avg((s) => s.lum)).padStart(5) +
          '  micro8 ' + f2(avg((s) => s.micro)).padStart(6) +
          '  dark ' + f1(100 * avg((s) => s.darkFrac)).padStart(5) + '%' +
          '  grid_tot ' + f2(R.gPlay.gridTot) + '/' + f2(R.gPlay.ratio) +
          '  blow ' + f2(100 * Math.max.apply(null, R.slots.map((s) => s.blow))) + '%' +
          (R.sep ? "   vs glacier: d'L " + f2(R.sep.dLevel) + "  d'T " + f2(R.sep.dTexture) + "  JOINT " + f2(R.sep.dJoint) : '   (the reference)'),
          2300, 15, R.V.col), left: PAD, top: y,
      });
      y += 22;
      const img = R[key];
      const m = await sharp(img).metadata();
      comp.push({ input: img, left: PAD, top: y });
      maxW = Math.max(maxW, m.width); y += m.height + 16;
    }
    const out = path.join(ST, '_crevasse_lad_' + suffix + '.png');
    fs.writeFileSync(out, await sharp({ create: { width: Math.max(maxW, 2400) + PAD * 2, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[panel] ' + path.basename(out));
  }

  // ======================================================================
  // THE CORE PANEL: crevasse AND glacier in one field, in coherent patches
  // ======================================================================
  {
    const comp = []; let y = PAD, maxW = 0;
    comp.push({ input: label('CREVASSE vs GLACIER -- ONE FIELD, coherent patches, play scale. left plain, right under vacuum. THE question: can you see where one stops and the other starts?', 2600, 19, '#e6edf3'), left: PAD, top: y }); y += 30;
    comp.push({ input: label('patches are 5 rows x 4 cols, alternating. if a rung is invisible here it is glacier with another name, whatever the tile numbers say.', 2600, 13, '#8b949e'), left: PAD, top: y }); y += 26;
    for (const R of results) {
      if (R.V.ref) continue;
      const mg2 = await mixedField([R.bufs, results[0].bufs], PLAY_W, PLAY_H, 30, 22, 777);
      const mgv = await vacuum(mg2);
      const md = await sharp(mg2).metadata();
      comp.push({ input: label(R.V.label + '    +  glacier      d\'level ' + f2(R.sep.dLevel) + '   d\'texture ' + f2(R.sep.dTexture) + '   JOINT ' + f2(R.sep.dJoint) +
        '   |  under vacuum JOINT ' + f2(R.sepVac.dJoint), 2400, 15, R.V.col), left: PAD, top: y }); y += 22;
      comp.push({ input: mg2, left: PAD, top: y });
      comp.push({ input: mgv, left: PAD + md.width + 24, top: y });
      y += md.height + 18;
      maxW = Math.max(maxW, md.width * 2 + 24);
    }
    const out = path.join(ST, '_crevasse_lad_vs_glacier.png');
    fs.writeFileSync(out, await sharp({ create: { width: Math.max(maxW, 2600) + PAD * 2, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[panel] ' + path.basename(out));
  }

  // ======================================================================
  // FOLD MAP -- the lattice, drawn. The whole tessellated field folded onto ONE
  // tile through the exact iso lattice and averaged: what survives IS what the
  // eye reads as "that same tile again".
  // ======================================================================
  {
    const AMP_RANGE = 30;   // wider than the glacier run: a fissure field swings far more
    const foldImage = async (fold, w, h) => {
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
    };
    const FW = 660, FH = 330, PER = 5, comp = []; let y = PAD;
    comp.push({ input: label('CREVASSE FROM GLACIER -- THE FOLD MAP: the lattice, drawn.', 2400, 19, '#e6edf3'), left: PAD, top: y }); y += 30;
    comp.push({ input: label('the whole tessellated field folded onto ONE tile through the exact iso lattice and averaged. what survives IS the visible lattice. ' +
      'grey 128 = field mean, +-' + AMP_RANGE + ' luma -> +-110. a flat grey diamond is what you want; a drawn shape is a stamp the eye will find.', 2400, 13, '#8b949e'), left: PAD, top: y }); y += 26;
    let x = PAD, rowTop = y, rowMax = 0;
    for (let i = 0; i < results.length; i++) {
      const R = results[i];
      if (i > 0 && i % PER === 0) { rowTop = rowTop + rowMax; y = rowTop; x = PAD; rowMax = 0; }
      comp.push({ input: label(R.V.label, FW, 14, R.V.col), left: x, top: y });
      comp.push({
        input: label('FULL grid_tot ' + f2(R.gFull.gridTot) + '  coh ' + f2(R.gFull.gridCoh) + '  slot ' + f2(R.gFull.gridSlot) +
          '   |   PLAY ' + f2(R.gPlay.gridTot) + '  ratio ' + f2(R.gPlay.ratio), FW, 13, '#8b949e'), left: x, top: y + 20,
      });
      comp.push({ input: await foldImage(R.gFull.fold, FW, FH), left: x, top: y + 40 });
      x += FW + 16; rowMax = Math.max(rowMax, 40 + FH + 22);
    }
    const out = path.join(ST, '_crevasse_lad_foldmap.png');
    fs.writeFileSync(out, await sharp({ create: { width: PAD * 2 + PER * (FW + 16), height: rowTop + rowMax + PAD, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[panel] ' + path.basename(out));
  }

  // ======================================================================
  // NUMBERS
  // ======================================================================
  const txt = [];
  const T = (s) => txt.push(s);
  T('CREVASSE FROM GLACIER -- fissure density x wall treatment ladder  ' + new Date().toISOString().slice(0, 16) +
    '   (style test, nothing written to src/assets/tiles/)');
  T('source: the FROZEN shipped glacier (assets/style-test/tiles/crevasse/src/), byte-compared against src/assets/tiles/glacier/ on every generation run.');
  T('flux-pro/kontext draws the fissures; the prompt keeps the ground ("keep ALL of the existing dusty grey ice surface ... ONLY ADD ...") and has no negatives.');
  T('grade after kontext: B/R 1.100, G/R 1.060, tiltY 3.0 / tiltX 0.0, GROUND LEVEL solved on p70 = ' + f1(p70T) + ' (glacier\'s own p70).');
  T('NO SECOND FLATTEN: glacier\'s degree-5 polynomial would fit the fissures and divide them straight back out. Whole-tile mean L is an OUTPUT, never a target.');
  T('residual-chroma cap 1.2% on NEUTRAL, 4.0% on BLUE (the pale ice on the break lip IS residual chroma; a 1.2% cap would desaturate the thing the variant tests).');
  T('');
  T('  rung                                        L     p70    B/R    G/R   chr%  dark%   blow%     sd  micro8     tY    step  rough   s/r  rimFis%  gNCCfine  blur12  noop   GRIDfull   coh   slot   GRIDplay  ratio   GRIDvac    d\'lvl   d\'tex   d\'JOINT   d\'vac');
  for (const R of results) {
    const avg = (f) => R.slots.reduce((a, s) => a + f(s), 0) / 4;
    T('  ' + R.V.label.padEnd(42) +
      f1(avg((s) => s.lum)).padStart(5) + f1(avg((s) => s.p70)).padStart(8) +
      f2(avg((s) => s.br)).padStart(7) + f2(avg((s) => s.gr)).padStart(7) +
      f2(100 * avg((s) => s.chromaRes)).padStart(7) + f1(100 * avg((s) => s.darkFrac)).padStart(7) +
      f2(100 * Math.max.apply(null, R.slots.map((s) => s.blow))).padStart(8) +
      f1(avg((s) => s.sd)).padStart(7) + f2(avg((s) => s.micro)).padStart(8) +
      f1(avg((s) => s.tiltY)).padStart(7) +
      f2(R.bs.step).padStart(8) + f2(R.bs.rough).padStart(7) + f2(R.bs.ratio).padStart(6) +
      f1(100 * avg((s) => s.rimFis)).padStart(9) +
      (R.V.ref ? '         -       -     -' : f2(avg((s) => s.gnFine)).padStart(10) + f2(avg((s) => s.gnBlur)).padStart(8) + String(R.slots.filter((s) => s.noop).length).padStart(6)) +
      f2(R.gFull.gridTot).padStart(11) + f2(R.gFull.gridCoh).padStart(6) + f2(R.gFull.gridSlot).padStart(7) +
      f2(R.gPlay.gridTot).padStart(11) + f2(R.gPlay.ratio).padStart(7) + f2(R.gPlayVac.gridTot).padStart(10) +
      (R.sep ? f2(R.sep.dLevel).padStart(9) + f2(R.sep.dTexture).padStart(8) + f2(R.sep.dJoint).padStart(10) + f2(R.sepVac.dJoint).padStart(8) : '        -       -         -       -'));
  }
  T('');
  T('PAIR DISTANCES per rung, same-planet neighbours.');
  T('  rung                                      vs glacier (44.0 / 1.10 / 1.06 / 7.40)     vs tundra (30.8 / 0.82 / 0.91 / 3.3)       vs ice_shelf (22.0 / 2.86 / 2.18 / 4.5)');
  for (const R of results) {
    const avg = (f) => R.slots.reduce((a, s) => a + f(s), 0) / 4;
    const mL = avg((s) => s.lum), mb = avg((s) => s.br), mg = avg((s) => s.gr), mM = avg((s) => s.micro);
    let row = '  ' + R.V.label.padEnd(42);
    for (const nb of NEIGH) {
      row += ('dL ' + ((mL - nb.lum >= 0 ? '+' : '') + f1(mL - nb.lum)) +
        '  dB/R ' + ((mb - nb.br >= 0 ? '+' : '') + f2(mb - nb.br)) +
        '  dG/R ' + ((mg - nb.gr >= 0 ? '+' : '') + f2(mg - nb.gr)) +
        '  mic x' + f2(mM / nb.micro)).padEnd(44);
    }
    T(row);
  }
  T('');
  T('MIRROR CONVENTION. crevasse inherits its orientation from glacier: slot n is drawn on glacier slot n, which already carries the corpus convention');
  T('(glacier slots: 0 <- regolith_3 as is, 1 <- regolith_1 as is, 2 <- regolith_0 rotated 180, 3 <- regolith_3 rotated 180). The check below is on the PATTERN, not on a');
  T('tilt sign: mean-centred masked NCC of each crevasse slot against its own glacier slot in all four orientations. identity must win, which proves the base was kept.');
  T('  rung                                      slot 0 id/flop/flip/hv                slot 1                               slot 2                               slot 3');
  for (const R of results) {
    if (R.V.ref) continue;
    let row = '  ' + R.V.label.padEnd(42);
    for (let n = 0; n < 4; n++) {
      const s = R.slots[n];
      row += (f2(s.nccId) + ' / ' + f2(s.nccFlop) + ' / ' + f2(s.nccFlip) + ' / ' + f2(s.nccHV)).padEnd(37);
    }
    T(row);
  }
  T('');
  T('');
  T('GROUND SURVIVAL. gNCC = ground-only NCC against the frozen glacier with the fissure pixels thrown away. ~0.7+ means the ground IS glacier with fissures cut');
  T('into it; ~0.0 means kontext regenerated the surface and only the diamond silhouette was inherited. READ THE FINE COLUMN. blur12 sits next to it as a drift');
  T('guard -- the kontext return comes back at 1456x720 and is resized to 512x256 -- but it is the WEAK test here: glacier was flattened with a degree-5');
  T('polynomial and has almost no low-frequency signal left to correlate against, so a middling blur12 on a composite rung is that missing signal, not a missing');
  T('ground. noop = slots where kontext drew no fissures at all (fissure area under 6%): they deflate every other number of their rung and must be re-rolled');
  T('before that rung can be judged. Those two slots also read gNCC 0.86 / 1.00 -- which is exactly what "kontext handed the input straight back" looks like.');
  T('');
  T('micro8 = mean |dL| between 4-neighbours on the 64x32 mip -- structure that survives to play scale. glacier 7.40. family analysis asked crevasse for ~17.');
  T('dark% = share of opaque pixels below 0.55x the tile\'s own p50 -- the fissure area. glacier ' + f1(100 * GL.reduce((a, s) => a + s.darkFrac, 0) / 4) + '%.');
  T('rimFis% = share of the diamond rim band (1-6 px inside) that is fissure rather than ground. A fissure ending at the tile edge cannot be continued by a random');
  T('neighbour slot, so this is the price of "cross the whole tile" and is reported next to the structure it buys.');
  T('grid_tot = sd of the lattice-folded phase average, LUMA UNITS. coh = identical on all four slots (a regular lattice). slot = differs per slot (patchwork).');
  T('ratio = grid_tot over the texture\'s own roughness at the same scale. reference at play scale: glacier 5.79/0.59, new tundra 2.60/0.86, ice_shelf 7.10/1.21,');
  T('REJECTED old tundra 10.40/1.12. s/r = boundary step over interior roughness. blow% = share of opaque pixels above Rec709 luma 200, bar < 1%.');
  T('d\'  = separability from glacier at play scale over the per-tile distribution of a 40x24 field: |mean difference| / rms of the two spreads.');
  T('      d\'level on tile mean luma, d\'texture on within-tile sd, JOINT = quadrature sum. >= 1.0 separated, < 0.5 the same tile with two names.');
  fs.writeFileSync(path.join(ST, '_crevasse_lad_numbers.txt'), txt.join('\n') + '\n');
  fs.writeFileSync(path.join(WORK, 'ladder_stats.json'), JSON.stringify(
    results.map((R) => ({
      id: R.V.id, label: R.V.label,
      slots: R.slots.map((s) => Object.assign({}, s, { png: undefined })),
      bs: R.bs, sep: R.sep, sepVac: R.sepVac,
      gFull: Object.assign({}, R.gFull, { fold: undefined }),
      gPlay: Object.assign({}, R.gPlay, { fold: undefined }),
      gPlayVac: Object.assign({}, R.gPlayVac, { fold: undefined }),
    })), null, 1));
  console.log('\n' + txt.join('\n'));
  console.log('\n[out] _crevasse_lad_numbers.txt  +  crevasse/ladder_stats.json');
})();
