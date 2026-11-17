/**
 * GLACIER FROM REGOLITH -- level / hue / flatten ladder, LOCAL GRADE ONLY.
 *
 * STYLE TEST. Writes only into assets/style-test/tiles/glacier_reg/ and
 * assets/style-test/tiles/_glacier_reg_*.png|txt. NOTHING is written to
 * src/assets/tiles/. No fal.ai, no flux, no cap sync, no build, no git.
 *
 * WHY REGOLITH AND NOT THE OLD BLUE GLACIER
 *   The ICE family is being moved onto REAL ice moons (Ganymede, Callisto):
 *   dusty neutral grey, not blue glacier ice. On such a body the GROUND IS
 *   REGOLITH; what separates the biomes sits on top of it. regolith_0 already
 *   measures L 59.6 / B/R 1.00 / G/R 1.00 / sat 0% / blow 0.10% -- exactly
 *   neutral and already under the 1% blowout bar all 37 finished tiles respect.
 *   regolith is a BARREN biome, so it appears on different planets than the ICE
 *   set: collision-free as a derivation base.
 *   ICE SLABS DO NOT GO INTO THE TILE. They come later via the prop layer.
 *   This script produces the GROUND only.
 *
 * SOURCES AND ORIENTATIONS (Rudi, 2026-09-03)
 *   regolith_0 and regolith_3 may be used in ALL FOUR orientations
 *   (id / h / v / hv=180deg); regolith_1 must stay UNMIRRORED ("would look
 *   upside down"); regolith_2 is excluded (crater too prominent).
 *   Vertical mirroring is admissible here -- unlike on tundra -- because the
 *   light plane is re-imposed by this script anyway: MIRROR FIRST, PLANE AFTER,
 *   so the lighting direction is independent of the orientation. What mirroring
 *   does NOT repair is the BAKED-IN shading of the texture, and that was checked
 *   by eye (scripts/tiles-glacier-dome-check.cjs, panel _glacier_reg_domecheck.png):
 *   regolith_0 and regolith_3 are lit near-nadir, their craters stay bowls after
 *   a vertical flip; regolith_1 has a strongly directional ridge highlight and
 *   does invert -- which is exactly Rudi's restriction, confirmed.
 *
 * THE FOUR SLOTS -- chosen by exhaustive search over all 4-subsets of
 * {r0,h0,v0,hv0, r3,h3,v3,hv3, r1} minimising the WORST pairwise mean-centred
 * masked NCC after blur 24 (the large-scale structure the eye reads as "same
 * tile again"). Full 9x9 matrix in _glacier_reg_orient.png.
 *
 *   slot 0 = regolith_3            (unmirrored)
 *   slot 1 = regolith_1            (unmirrored -- the only orientation allowed)
 *   slot 2 = regolith_0 rotated 180 (h+v)
 *   slot 3 = regolith_3 rotated 180 (h+v)
 *
 *   pairwise low-freq NCC: s0-s1 -0.29  s0-s2 -0.34  s0-s3 -0.24
 *                          s1-s2 +0.24  s1-s3 +0.12  s2-s3 +0.36
 *   worst 0.36, mean 0.265. The best subset overall scores 0.36 as well
 *   (r3 h3 hv3 r1), but that one uses regolith_3 three times; this one uses all
 *   three captures and no capture more than twice. The set also happens to keep
 *   the corpus convention -- slots 0/1 unmirrored, slots 2/3 mirrored -- without
 *   violating Rudi's ban on mirroring regolith_1.
 *   (The 0.85-0.93 figure quoted for these sources is UNCENTRED cosine
 *   similarity, dominated by the shared mean level rather than by shared
 *   structure. Mean-centred masked NCC at full res is 0.21-0.39.)
 *
 * CHROMA CAP. regolith_3 carries real chroma and reads brown next to the other
 * two. Plain saturation cannot express that once a B/R target is imposed -- a
 * uniform B/R 1.18 cast alone reads sat 15%. The cap therefore runs on RESIDUAL
 * chroma: per-pixel saturation after the tile's OWN channel means are divided
 * out, so a uniform cast scores ~0 and only genuine colour variation survives.
 * Each source gets a desaturation toward its own luma, solved from its residual
 * chroma; sources already under CHROMA_CAP are untouched and the correction only
 * ever goes downward.
 *
 * THE LADDER
 *   Axis 1, LEVEL. regolith sits at 59.6, too bright: the corpus maximum today
 *   is snow_peak 44.7. Rungs at canvas luma 36 / 40 / 44, neutral B/R 1.00.
 *   Axis 2, HUE, sparingly. regolith is exactly neutral and the NEW tundra is at
 *   0.82 (warm), so the hue gap would be only 0.18 -- under the 0.30 bar. Rungs
 *   at B/R 1.10 and 1.18 give the glacier/tundra pair some hue leg back without
 *   leaving the Ganymede direction. G/R follows the corpus cool-grey line
 *   G/R = 1 + 0.60*(B/R - 1) -- snow_peak's own slope (1.19 at B/R 1.32) and the
 *   K_CORPUS constant of the tundra run.
 *   Axis 3, FLATTEN, added because the first pass of this ladder measured
 *   grid_tot 10.7 at play scale -- the level of the SHIPPED tundra (10.40) that
 *   was rejected as a readable diamond lattice, not of the new one (2.59). The
 *   diagnosis: the raster is NOT the light ramp (ramp_pp is down to 4.7 from
 *   58.3) and NOT slot correlation (grid_coh already sits at grid_tot/2, the
 *   floor for four independent slots). It is the LOW-FREQUENCY BRIGHTNESS BLOB
 *   STRUCTURE INSIDE EACH regolith TILE -- basin rings, crater fields, ~15 luma
 *   peak to peak -- which repeats whenever that slot is drawn. The lever is
 *   therefore to flatten it, by fitting an ANALYTIC 2D POLYNOMIAL of total
 *   degree N to the tile's own interior luma and dividing it out. N = 1 is the
 *   plane, i.e. what the tundra run did; N = 3 and N = 5 remove blob scale too.
 *   This is NOT divide-by-blur: there is no blur, so there is no contaminated
 *   denominator at the diamond edge and no bright yellow rim. The multiplier is
 *   a smooth global function, clamped, and the rim halo metric is reported to
 *   prove it. It also fits glacier's design intent -- plasticity is to come from
 *   the prop layer, so a flat ground is a goal here, not a compromise.
 *
 * MEASURED ON THE WRITTEN .webp, NEVER ON THE BUFFER (libwebp drops RGB under
 * alpha 0 and the diamond corners are ~50% of the canvas -> +1.5 luma drift).
 * sharp.cache(false) because the solve loop rewrites the same path repeatedly.
 *
 * Usage: node scripts/tiles-glacier-regolith-ladder.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const WORK = path.join(ST, 'glacier_reg');
const SRCD = path.join(WORK, 'src');

const TILE_W = 512, TILE_H = 256;
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// ---- held on every rung ----------------------------------------------------
const TILT_Y = 3.0, TILT_X = 0.0;      // the tundra ramp, verbatim
const K_CORPUS = 0.60;                  // G/R = 1 + K*(B/R - 1), snow_peak's slope
const grFor = (br) => 1 + K_CORPUS * (br - 1);
const CHROMA_CAP = 0.012;               // residual-chroma ceiling, 1.2% (see statsRaw)
const SOLVE_PASSES = 7;
const FLAT_CLAMP = 0.45;                // the flatten multiplier stays in [1-c, 1+c]

// ---- vacuum darkening, from src/views/grid/isoConstants.ts -----------------
const VAC_A = 0.45, VAC_RGB = [5, 10, 25];
// ---- play scale: zoom 1.0 build view is a 48x24 CSS px tile (detailTier.ts) -
const PLAY_W = 48, PLAY_H = 24;

// slot -> oriented source variant. h = horizontal flop, v = vertical flip.
const SLOT_MAP = [
  { src: 3, h: false, v: false, id: 'r3' },
  { src: 1, h: false, v: false, id: 'r1' },
  { src: 0, h: true, v: true, id: 'hv0' },
  { src: 3, h: true, v: true, id: 'hv3' },
];

const STAGES = [
  { id: 'REGOLITH', label: 'regolith as shipped (the base)', ref: path.join(TILES, 'regolith'), refPat: 'regolith_$.webp', col: '#8b949e' },
  { id: 'GLACIER_OLD', label: 'glacier as shipped (blue original)', ref: path.join(TILES, 'glacier'), refPat: 'glacier_$.webp', col: '#ff7b72' },
  { id: 'TUNDRA_NEW', label: 'tundra as shipped (the neighbour)', ref: path.join(TILES, 'tundra'), refPat: 'tundra_$.webp', col: '#d2a8ff' },
  { id: 'L36', label: 'L 36  B/R 1.00  flat 1 (plane only)', lum: 36, br: 1.00, flat: 1, col: '#7ee787' },
  { id: 'L40', label: 'L 40  B/R 1.00  flat 1 (plane only)', lum: 40, br: 1.00, flat: 1, col: '#7ee787' },
  { id: 'L44', label: 'L 44  B/R 1.00  flat 1 (plane only)', lum: 44, br: 1.00, flat: 1, col: '#7ee787' },
  { id: 'L40C110', label: 'L 40  B/R 1.10  flat 1 (plane only)', lum: 40, br: 1.10, flat: 1, col: '#79c0ff' },
  { id: 'L40C118', label: 'L 40  B/R 1.18  flat 1 (plane only)', lum: 40, br: 1.18, flat: 1, col: '#79c0ff' },
  { id: 'L44C110', label: 'L 44  B/R 1.10  flat 1 (plane only)', lum: 44, br: 1.10, flat: 1, col: '#79c0ff' },
  { id: 'L44C118', label: 'L 44  B/R 1.18  flat 1 (plane only)', lum: 44, br: 1.18, flat: 1, col: '#79c0ff' },
  { id: 'L40C110F3', label: 'L 40  B/R 1.10  flat 3 (deg-3 poly)', lum: 40, br: 1.10, flat: 3, col: '#ffa657' },
  { id: 'L40C110F5', label: 'L 40  B/R 1.10  flat 5 (deg-5 poly)', lum: 40, br: 1.10, flat: 5, col: '#ffa657' },
  { id: 'L44C110F5', label: 'L 44  B/R 1.10  flat 5 (deg-5 poly)', lum: 44, br: 1.10, flat: 5, col: '#ffa657' },
];

const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);

// ══════════════════════════════════════════════════════════════════════
// measurement, always on the WRITTEN file
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
  // RESIDUAL CHROMA. Plain saturation is useless once a hue is targeted: a
  // uniform B/R 1.18 cast alone reads as sat 15%. What matters for "does this
  // slot look brown next to the others" is the colour variation that is LEFT
  // once the tile's own channel means are divided out -- a uniform cast then
  // scores ~0 and only genuine per-pixel chroma survives.
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
    sd: (isd[0] + isd[1] + isd[2]) / 3, sat: sat / ni,
    blow: lv.length ? lv.filter((v) => v >= 200).length / lv.length : 0,
    p99: lv.length ? lv[Math.floor(lv.length * 0.99)] : 0,
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

// ══════════════════════════════════════════════════════════════════════
// generic least squares -- used by the polynomial flatten
// ══════════════════════════════════════════════════════════════════════
function solveLin(A, b) {
  const n = b.length;
  const M = A.map((row, i) => row.concat([b[i]]));
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    const t = M[i]; M[i] = M[p]; M[p] = t;
    const d = M[i][i];
    if (!isFinite(d) || Math.abs(d) < 1e-12) { M[i][i] = 1e-12; }
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
 * FLATTEN: fit an analytic 2D polynomial of total degree N to the tile's own
 * interior luma and divide it out, mean preserved. N = 1 is the plane. There is
 * no blur anywhere in this, so the diamond edge cannot contaminate a
 * denominator -- the failure mode that made divide-by-blur unusable on masked
 * tiles. The multiplier is clamped to [1-FLAT_CLAMP, 1+FLAT_CLAMP] so a
 * polynomial that misbehaves at the diamond tips cannot blow a corner out.
 */
function flatten(src, ch, w, h, N) {
  if (N < 1) return Buffer.from(src);
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
  // the fitted surface's own mean over the interior, so the level is preserved
  let fs2 = 0, fn = 0;
  const evalAt = (nx, ny) => {
    let v = 0;
    for (let k = 0; k < K; k++) v += coef[k] * Math.pow(nx, terms[k][0]) * Math.pow(ny, terms[k][1]);
    return v;
  };
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
      if (g < 1 - FLAT_CLAMP) g = 1 - FLAT_CLAMP;
      if (g > 1 + FLAT_CLAMP) g = 1 + FLAT_CLAMP;
      for (let c = 0; c < 3; c++) {
        const v = src[i + c] * g;
        out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
      }
    }
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════
// the grade: desat toward luma x per-channel tint x level x uniform luma plane
// ══════════════════════════════════════════════════════════════════════
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
 * Solve desat / tint / G / plane so that the WRITTEN file hits (lumT, brT, grT,
 * TILT_X, TILT_Y) with residual chroma <= CHROMA_CAP. The orientation (mirroring) has
 * already been applied to baseFile, and the flatten runs before the grade, so
 * the plane the solver imposes is the ONLY light ramp on the tile.
 */
async function solveTile(baseFile, outFile, lumT, brT, grT, flatN) {
  const raw = await sharp(fs.readFileSync(baseFile)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const CH = raw.info.channels, W = raw.info.width, H = raw.info.height;
  const S = flatten(raw.data, CH, W, H, flatN);
  const b0 = statsRaw(S, CH, W, H);
  // desaturation is solved on the SOURCE's residual chroma and only ever
  // applied downward -- a source already under the cap is left untouched.
  const desat = b0.chromaRes > CHROMA_CAP ? CHROMA_CAP / b0.chromaRes : 1;
  const tint = [1, (grT * b0.rgb[0]) / b0.rgb[1], (brT * b0.rgb[0]) / b0.rgb[2]];
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
    tint[2] *= brT / m.br;
    tint[1] *= grT / m.gr;
    p += (TILT_X - m.tiltX) / Kx;
    q += (TILT_Y - m.tiltY) / Ky;
  }
  m.png = png;
  m.plane = { p, q, G, desat, tint: tint.slice() };
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
/** two biomes in ONE field, in coherent patches -- for the pair panels */
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

// ══════════════════════════════════════════════════════════════════════
// THE GRID INDEX -- lattice fold, verbatim from tiles-tundra-tilt-ladder.cjs
// (the derivation and its justification live in that file's comment)
// ══════════════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════════════
// boundary step vs interior roughness
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

// neighbours the rung has to be separable from
const NEIGH = [
  { id: 'tundra   (new, ICE)', lum: 30.8, br: 0.82, gr: 0.91, micro: 3.3, samePlanet: true },
  { id: 'ice_shelf      (ICE)', lum: 22.0, br: 2.86, gr: 2.18, micro: 4.5, samePlanet: true },
  { id: 'regolith    (BARREN)', lum: 59.6, br: 1.00, gr: 1.00, micro: 10.6, samePlanet: false },
];

(async () => {
  fs.mkdirSync(SRCD, { recursive: true });

  // ---- FREEZE THE ORIENTED SOURCES first, before anything is graded --------
  // mirror FIRST, plane AFTER: the orientation is baked into the frozen base,
  // so the light ramp the grade imposes is independent of it.
  const BASE = [];
  for (let n = 0; n < 4; n++) {
    const sm = SLOT_MAP[n];
    const to = path.join(SRCD, 'base_slot' + n + '_' + sm.id + '.webp');
    if (!fs.existsSync(to)) {
      let s = sharp(fs.readFileSync(path.join(TILES, 'regolith', 'regolith_' + sm.src + '.webp')));
      if (sm.h) s = s.flop();
      if (sm.v) s = s.flip();
      await s.webp(WEBP).toFile(to);
    }
    BASE.push(to);
    const st = await statsOf(to);
    console.log('[frozen] slot ' + n + ' <- ' + sm.id.padEnd(4) + ' (regolith_' + sm.src +
      (sm.h || sm.v ? ', ' + (sm.h ? 'h' : '') + (sm.v ? 'v' : '') : ', as is') + ')' +
      '   L ' + f1(st.lum) + '  B/R ' + f2(st.br) + '  sat ' + f1(100 * st.sat) + '%  sd ' + f1(st.sd) +
      '  blow ' + f2(100 * st.blow) + '%  tiltX ' + f1(st.tiltX) + '  tiltY ' + f1(st.tiltY));
  }
  console.log('');

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
      const dir = path.join(WORK, st.id);
      fs.mkdirSync(dir, { recursive: true });
      const grT = grFor(st.br);
      for (let n = 0; n < 4; n++) {
        const out = path.join(dir, 'glacier_' + n + '.webp');
        const m = await solveTile(BASE[n], out, st.lum, st.br, grT, st.flat);
        fs.writeFileSync(path.join(dir, 'glacier_' + n + '.png'), m.png);
        bufs.push(m.png);
        const s = await statsOf(out);
        s.micro = await microContrast(out.replace(/\.webp$/, '@eighth.webp'));
        s.rim = await rimHalo(out);
        s.plane = m.plane;
        slots.push(s);
      }
    }

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
    console.log('[' + st.id.padEnd(11) + '] ' + ((Date.now() - t0) / 1000).toFixed(0) + 's  ' +
      'L ' + f1(slots.reduce((a, s) => a + s.lum, 0) / 4).padStart(5) +
      '  B/R ' + f2(slots.reduce((a, s) => a + s.br, 0) / 4) +
      '  chr ' + f2(100 * slots.reduce((a, s) => a + s.chromaRes, 0) / 4) + '%' +
      '  tY ' + f1(slots.reduce((a, s) => a + s.tiltY, 0) / 4).padStart(5) +
      '  blow ' + f2(100 * Math.max.apply(null, slots.map((s) => s.blow))) + '%' +
      '  micro8 ' + f2(slots.reduce((a, s) => a + s.micro, 0) / 4) +
      '  s/r ' + f2(bs.ratio) +
      '  GRIDfull ' + f2(gFull.gridTot) + ' (coh ' + f2(gFull.gridCoh) + ' slot ' + f2(gFull.gridSlot) +
      ' ramp ' + f2(gFull.rampPP) + ')' +
      '  GRIDplay ' + f2(gPlay.gridTot) + ' ratio ' + f2(gPlay.ratio) + '  vac ' + f2(gPlayVac.gridTot) +
      '  rim ' + f2(Math.max.apply(null, slots.map((s) => s.rim))));
  }

  // ══════════════════════════════════════════════════════════════════
  // PER-RUNG CONTACT SHEETS
  // ══════════════════════════════════════════════════════════════════
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

    line('GLACIER FROM REGOLITH -- ' + R.st.label, 19, R.st.col);
    line('STYLE TEST, nothing written to src/assets/tiles/. tile numbers measured on the WRITTEN .webp.  ' +
      'slots: 0<-r3  1<-r1  2<-hv0  3<-hv3  (hv = 180 deg; regolith_1 never mirrored).  ' + new Date().toISOString().slice(0, 16), 13, '#8b949e');
    y += 4;
    line('  slot     L    intL    B/R    G/R     sd  sat%  chr%  blow%    p99  micro8   tiltX   tiltY      rim(1-4 vs 10-24px)   desat   plane p / q', 13, '#8b949e');
    for (let n = 0; n < 4; n++) {
      const s = R.slots[n];
      line('   ' + n + '  ' + f1(s.lum).padStart(6) + f1(s.intLum).padStart(8) + f2(s.br).padStart(7) + f2(s.gr).padStart(7) +
        f1(s.sd).padStart(7) + f1(s.sat * 100).padStart(6) + f2(s.chromaRes * 100).padStart(6) + f2(s.blow * 100).padStart(7) + f1(s.p99).padStart(7) +
        f2(s.micro).padStart(8) + f1(s.tiltX).padStart(8) + f1(s.tiltY).padStart(8) +
        ((s.rim >= 0 ? '+' : '') + f2(s.rim)).padStart(21) + '  ' +
        (s.plane ? (f2(s.plane.desat).padStart(6) + '   ' + f3(s.plane.p) + ' / ' + f3(s.plane.q)) : '        (as shipped)'), 13, '#c9d1d9');
    }
    y += 6;
    line('HUE            B/R ' + f2(mb) + '   G/R ' + f2(mg) + '   off-violet-axis  G/R-(1+B/R)/2 = ' +
      ((mg - (1 + mb) / 2) >= 0 ? '+' : '') + f1(100 * (mg - (1 + mb) / 2)) + '%   sat ' + f1(100 * avg((s) => s.sat)) + '%   RESIDUAL chroma ' + f2(100 * avg((s) => s.chromaRes)) + '%  (cap ' + f1(100 * CHROMA_CAP) + '%)', 13, '#ffa657');
    line('BLOWOUT        worst slot ' + f2(100 * worstBlow) + '%   (bar: < 1.00%, where all 37 redesigned tiles sit)', 13,
      worstBlow < 0.01 ? '#7ee787' : '#ff7b72');
    line('(1) BOUNDARY STEP    step ' + f2(R.bs.step) + '   interior roughness ' + f2(R.bs.rough) + '   RATIO ' + f2(R.bs.ratio) +
      '     (tundra run: new 1.24, shipped 1.45 -- lower = the edge reads less as a line)', 13, '#ffa657');
    line('(2) RIM HALO         worst slot ' + ((worstRim >= 0 ? '+' : '') + f2(worstRim)) +
      '     must not go positive; neither a global plane nor an analytic polynomial has a local term', 13,
      worstRim <= 0.3 ? '#7ee787' : '#ff7b72');
    line('(3) GRID INDEX       lattice fold of the tessellated field, rim band excluded (max(|du|,|dv|) <= ' + RIM_CUT + ')', 13, '#ffa657');
    for (const [nm, g] of [['FULL RES', R.gFull], ['PLAY 48x24', R.gPlay], ['PLAY + VACUUM', R.gPlayVac]]) {
      line('      ' + nm.padEnd(14) + 'grid_tot ' + f2(g.gridTot) + ' L   (coherent ' + f2(g.gridCoh) + ', slot-dependent ' + f2(g.gridSlot) +
        ')   ramp_pp ' + f2(g.rampPP) + ' L (x ' + f2(g.rampX) + ' / y ' + f2(g.rampY) + ')   resid ' + f2(g.gridResid) +
        '   sd_within ' + f2(g.sdWithin) + '   ratio ' + f3(g.ratio) + '   ' + f2(g.pctOfMean) + '% of mean ' + f1(g.mean) +
        '   [' + g.BINS + 'x' + g.BINS + ' bins, N~' + Math.round(g.N) + ']', 13, '#8b949e');
    }
    line('    reference at PLAY scale: shipped tundra grid_tot 10.40 (ratio 1.12, REJECTED as a readable lattice) -> new tundra 2.59 (ratio 0.87, accepted)', 13, '#8b949e');
    line('    patchwork: slotL_sd ' + f2(R.slotLsd) + '     micro8 mean ' + f2(mM), 13, '#8b949e');
    y += 6;
    line('PAIR DISTANCES (this rung vs the neighbours it shares a planet with)', 13, '#ffa657');
    line('    neighbour              dL     dB/R    dG/R   micro8 ratio   verdict', 13, '#8b949e');
    for (const nb of NEIGH) {
      const dL = mL - nb.lum, dB = mb - nb.br, dG = mg - nb.gr, rM = mM / nb.micro;
      const legs = [];
      if (Math.abs(dL) >= 6) legs.push('level');
      if (Math.abs(dB) >= 0.30 || Math.abs(dG) >= 0.20) legs.push('hue');
      if (rM >= 1.6 || rM <= 0.62) legs.push('structure');
      line('    ' + nb.id.padEnd(22) + ((dL >= 0 ? '+' : '') + f1(dL)).padStart(6) +
        ((dB >= 0 ? '+' : '') + f2(dB)).padStart(8) + ((dG >= 0 ? '+' : '') + f2(dG)).padStart(8) +
        f2(rM).padStart(13) + '   ' + (nb.samePlanet ? (legs.length ? legs.join(' + ') : 'NO LEG -- too close') : 'other planet, no collision'),
        13, nb.samePlanet ? (legs.length >= 2 ? '#7ee787' : legs.length ? '#ffa657' : '#ff7b72') : '#8b949e');
    }
    y += 10;

    const TW = 510, TH = 255, GAP = 12, rowY = y;
    for (let n = 0; n < 4; n++) {
      const cx = PAD + n * (TW + GAP);
      comp.push({ input: label('slot ' + n + '  (' + SLOT_MAP[n].id + ')', TW, 14, '#c9d1d9'), left: cx, top: rowY });
      comp.push({ input: await sharp(R.bufs[n]).resize(TW, TH, { fit: 'fill' }).png().toBuffer(), left: cx, top: rowY + 22 });
    }
    y = rowY + 22 + TH + 14;

    const rndD = mulberry32(90210);
    const FD = await isoField(R.bufs, TILE_W, TILE_H, 6, 4, () => Math.floor(rndD() * 4));
    line('FULL RES interlocking field, random draw -- the lattice at 1:1', 15, '#7ee787');
    const fdScale = Math.min(1, (SW - PAD * 2) / FD.w);
    comp.push({ input: await sharp(FD.png).resize(Math.round(FD.w * fdScale), Math.round(FD.h * fdScale)).png().toBuffer(), left: PAD, top: y });
    y += Math.round(FD.h * fdScale) + 14;

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
    const crop = await sharp(FD.png).extract({ left: cl, top: ct, width: CW, height: CH }).png().toBuffer();
    comp.push({ input: crop, left: PAD, top: y });
    comp.push({ input: await sharp(FDv).extract({ left: cl, top: ct, width: CW, height: CH }).png().toBuffer(), left: PAD + CW + 30, top: y });
    y += CH + PAD;

    const out = path.join(ST, '_glacier_reg_' + R.st.id + '.png');
    fs.writeFileSync(out, await sharp({ create: { width: SW, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[sheet] ' + path.basename(out));
    R.playField = PD.png; R.playVac = PDv; R.junction = crop;
  }

  // ══════════════════════════════════════════════════════════════════
  // DECISION PANELS: every rung at play scale, plain and under vacuum
  // ══════════════════════════════════════════════════════════════════
  for (const [suffix, key, head, isVac] of [
    ['playscale', 'playField', 'PLAY SCALE 48x24 px per tile (zoom 1.0). This is where it is decided.', false],
    ['vacuum', 'playVac', 'PLAY SCALE under the VACUUM darkening rgba(5,10,25,0.45) -- airless ice moon.', true],
  ]) {
    const comp = []; let y = PAD, maxW = 0;
    comp.push({ input: label('GLACIER FROM REGOLITH -- ' + head, 2000, 19, '#e6edf3'), left: PAD, top: y }); y += 30;
    comp.push({ input: label('every rung holds tiltY 3.0 / tiltX 0.0 (the tundra ramp), G/R = 1 + 0.60*(B/R-1) and residual chroma <= 1.2%. identical random draw on all rungs.', 2000, 13, '#8b949e'), left: PAD, top: y }); y += 24;
    for (const R of results) {
      const g = isVac ? R.gPlayVac : R.gPlay;
      comp.push({
        input: label(R.st.label.padEnd(38) + 'L ' + f1(R.slots.reduce((a, s) => a + s.lum, 0) / 4).padStart(5) +
          '  B/R ' + f2(R.slots.reduce((a, s) => a + s.br, 0) / 4) +
          '  blow ' + f2(100 * Math.max.apply(null, R.slots.map((s) => s.blow))) + '%' +
          '  grid_tot ' + f2(g.gridTot) + '  ratio ' + f2(g.ratio) + '  micro8 ' + f2(R.slots.reduce((a, s) => a + s.micro, 0) / 4) +
          '  s/r ' + f2(R.bs.ratio), 1800, 15, R.st.col), left: PAD, top: y,
      });
      y += 22;
      const img = R[key];
      const m = await sharp(img).metadata();
      comp.push({ input: img, left: PAD, top: y });
      maxW = Math.max(maxW, m.width); y += m.height + 16;
    }
    const out = path.join(ST, '_glacier_reg_' + suffix + '.png');
    fs.writeFileSync(out, await sharp({ create: { width: Math.max(maxW, 2000) + PAD * 2, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[panel] ' + path.basename(out));
  }

  // ══════════════════════════════════════════════════════════════════
  // 2x2 EDGE PANEL -- the closed 2x2 repeat at 1:1
  // ══════════════════════════════════════════════════════════════════
  {
    const comp = []; let y = PAD, maxW = 0;
    comp.push({ input: label('GLACIER FROM REGOLITH -- the closed 2x2 repeat at 1:1. every slot touches every other slot; all four seam types are in one look.', 2400, 19, '#e6edf3'), left: PAD, top: y }); y += 30;
    for (const R of results) {
      if (R.st.ref && R.st.id !== 'TUNDRA_NEW') continue;
      const F = await isoField(R.bufs, TILE_W, TILE_H, 4, 3, (r, c) => ((r % 2) * 2 + (c % 2)));
      comp.push({ input: label(R.st.label + '   (2x2 repeat, slot order 0 1 / 2 3)', 2000, 15, R.st.col), left: PAD, top: y }); y += 22;
      comp.push({ input: F.png, left: PAD, top: y });
      maxW = Math.max(maxW, F.w); y += F.h + 16;
    }
    const out = path.join(ST, '_glacier_reg_2x2.png');
    fs.writeFileSync(out, await sharp({ create: { width: Math.max(maxW, 2400) + PAD * 2, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[panel] ' + path.basename(out));
  }

  // ══════════════════════════════════════════════════════════════════
  // PAIR PANELS -- each rung against tundra and ice_shelf in ONE field
  // ══════════════════════════════════════════════════════════════════
  {
    const tundraB = [], shelfB = [];
    for (let n = 0; n < 4; n++) {
      tundraB.push(path.join(TILES, 'tundra', 'tundra_' + n + '.webp'));
      shelfB.push(path.join(TILES, 'ice_shelf', 'ice_shelf_' + n + '.webp'));
    }
    const comp = []; let y = PAD, maxW = 0;
    comp.push({ input: label('GLACIER FROM REGOLITH -- MIXED FIELDS at play scale. left column plain, right column under vacuum. per rung: upper pair = rung + new tundra, lower pair = rung + ice_shelf.', 2600, 19, '#e6edf3'), left: PAD, top: y }); y += 30;
    comp.push({ input: label('coherent patches, not per-tile noise -- the question is whether a glacier AREA is told apart from a tundra AREA, not whether two adjacent tiles differ.', 2600, 13, '#8b949e'), left: PAD, top: y }); y += 26;
    for (const R of results) {
      if (R.st.ref) continue;
      const mt = await mixedField([R.bufs, tundraB], PLAY_W, PLAY_H, 30, 22, 777);
      const ms = await mixedField([R.bufs, shelfB], PLAY_W, PLAY_H, 30, 22, 777);
      const mtv = await vacuum(mt), msv = await vacuum(ms);
      const md = await sharp(mt).metadata();
      comp.push({ input: label(R.st.label + '    vs tundra (upper) / vs ice_shelf (lower)', 2000, 15, R.st.col), left: PAD, top: y }); y += 22;
      comp.push({ input: mt, left: PAD, top: y });
      comp.push({ input: mtv, left: PAD + md.width + 24, top: y });
      y += md.height + 6;
      comp.push({ input: ms, left: PAD, top: y });
      comp.push({ input: msv, left: PAD + md.width + 24, top: y });
      y += md.height + 18;
      maxW = Math.max(maxW, md.width * 2 + 24);
    }
    const out = path.join(ST, '_glacier_reg_pairs.png');
    fs.writeFileSync(out, await sharp({ create: { width: Math.max(maxW, 2600) + PAD * 2, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[panel] ' + path.basename(out));
  }

  // ══════════════════════════════════════════════════════════════════
  // FOLD MAP -- the grid, drawn
  // ══════════════════════════════════════════════════════════════════
  const AMP_RANGE = 14;
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
    comp.push({ input: label('GLACIER FROM REGOLITH -- THE FOLD MAP: the grid, drawn.', 2000, 19, '#e6edf3'), left: PAD, top: y }); y += 30;
    comp.push({ input: label('the whole tessellated field folded onto ONE tile through the exact iso lattice and averaged. what survives IS the visible lattice. grey 128 = field mean, +-' + AMP_RANGE + ' luma -> +-110.', 2000, 13, '#8b949e'), left: PAD, top: y }); y += 26;
    let x = PAD, rowTop = y, rowMax = 0;
    for (let i = 0; i < results.length; i++) {
      const R = results[i];
      if (i > 0 && i % PER === 0) { rowTop = rowTop + rowMax; y = rowTop; x = PAD; rowMax = 0; }
      comp.push({ input: label(R.st.label, FW, 14, R.st.col), left: x, top: y });
      comp.push({
        input: label('grid_tot ' + f2(R.gFull.gridTot) + '   coh ' + f2(R.gFull.gridCoh) + '   slot ' + f2(R.gFull.gridSlot) +
          '   ramp ' + f2(R.gFull.rampPP), FW, 13, '#8b949e'), left: x, top: y + 20,
      });
      comp.push({ input: await foldImage(R.gFull.fold, FW, FH), left: x, top: y + 40 });
      x += FW + 16; rowMax = Math.max(rowMax, 40 + FH + 22);
    }
    const out = path.join(ST, '_glacier_reg_foldmap.png');
    fs.writeFileSync(out, await sharp({ create: { width: PAD * 2 + PER * (FW + 16), height: rowTop + rowMax + PAD, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[panel] ' + path.basename(out));
  }

  // ══════════════════════════════════════════════════════════════════
  // NUMBERS
  // ══════════════════════════════════════════════════════════════════
  const txt = [];
  const T = (s) => txt.push(s);
  T('GLACIER FROM REGOLITH -- level / hue / flatten ladder  ' + new Date().toISOString().slice(0, 16) +
    '   (style test, nothing written to src/assets/tiles/)');
  T('slots: 0 <- regolith_3 as is | 1 <- regolith_1 as is (mirroring forbidden) | 2 <- regolith_0 rotated 180 | 3 <- regolith_3 rotated 180.');
  T('regolith_2 excluded. mirror FIRST, light plane AFTER. held on every rung: tiltY 3.0, tiltX 0.0, G/R = 1 + 0.60*(B/R-1), residual chroma <= 1.2%.');
  T('flat = total degree of the analytic 2D polynomial fitted to each tile\'s own interior luma and divided out. flat 1 = the plane, i.e. what the tundra run did.');
  T('');
  T('  rung                                    L    B/R    G/R  off-ax%  chr%   blow%     sd  micro8    tY    step  rough   s/r   GRIDfull   coh   slot   ramp  resid   GRIDplay  ratio   GRIDvac  slotLsd  rim_max');
  for (const R of results) {
    const avg = (f) => R.slots.reduce((a, s) => a + f(s), 0) / 4;
    const mb = avg((s) => s.br), mg = avg((s) => s.gr);
    T('  ' + R.st.label.padEnd(38) +
      f1(avg((s) => s.lum)).padStart(5) + f2(mb).padStart(7) + f2(mg).padStart(7) +
      (((mg - (1 + mb) / 2) >= 0 ? '+' : '') + f1(100 * (mg - (1 + mb) / 2))).padStart(9) +
      f2(100 * avg((s) => s.chromaRes)).padStart(6) +
      f2(100 * Math.max.apply(null, R.slots.map((s) => s.blow))).padStart(8) +
      f1(avg((s) => s.sd)).padStart(7) + f2(avg((s) => s.micro)).padStart(8) +
      f1(avg((s) => s.tiltY)).padStart(6) +
      f2(R.bs.step).padStart(8) + f2(R.bs.rough).padStart(7) + f2(R.bs.ratio).padStart(6) +
      f2(R.gFull.gridTot).padStart(11) + f2(R.gFull.gridCoh).padStart(6) + f2(R.gFull.gridSlot).padStart(7) +
      f2(R.gFull.rampPP).padStart(7) + f2(R.gFull.gridResid).padStart(7) +
      f2(R.gPlay.gridTot).padStart(11) + f2(R.gPlay.ratio).padStart(7) + f2(R.gPlayVac.gridTot).padStart(10) +
      f2(R.slotLsd).padStart(9) +
      ((Math.max.apply(null, R.slots.map((s) => s.rim)) >= 0 ? '+' : '') + f2(Math.max.apply(null, R.slots.map((s) => s.rim)))).padStart(9));
  }
  T('');
  T('PAIR DISTANCES per rung. same-planet neighbours are tundra and ice_shelf; regolith is BARREN -> other planet, listed for information only.');
  T('  rung                                  vs tundra (30.8 / 0.82 / 0.91 / 3.3)        vs ice_shelf (22.0 / 2.86 / 2.18 / 4.5)      vs regolith (59.6 / 1.00 / 1.00 / 10.6)');
  for (const R of results) {
    const avg = (f) => R.slots.reduce((a, s) => a + f(s), 0) / 4;
    const mL = avg((s) => s.lum), mb = avg((s) => s.br), mg = avg((s) => s.gr), mM = avg((s) => s.micro);
    let row = '  ' + R.st.label.padEnd(38);
    for (const nb of NEIGH) {
      row += ('dL ' + ((mL - nb.lum >= 0 ? '+' : '') + f1(mL - nb.lum)) +
        '  dB/R ' + ((mb - nb.br >= 0 ? '+' : '') + f2(mb - nb.br)) +
        '  dG/R ' + ((mg - nb.gr >= 0 ? '+' : '') + f2(mg - nb.gr)) +
        '  mic x' + f2(mM / nb.micro)).padEnd(45);
    }
    T(row);
  }
  T('');
  T('ORIENTATION / SOURCE INDEPENDENCE. Chosen set hv0 / r3 / hv3 / r1 out of {r0,h0,v0,hv0, r3,h3,v3,hv3, r1}');
  T('(regolith_1 unmirrored only, regolith_2 excluded), by exhaustive search on the worst pairwise mean-centred masked NCC after blur 24:');
  T('  s0-s1 -0.29   s0-s2 -0.34   s0-s3 -0.24   s1-s2 +0.24   s1-s3 +0.12   s2-s3 +0.36     worst 0.36, mean 0.265');
  T('  the previous three-source pick (r0 / r1 / flop(r3) / flop(r1)) scored worst 0.47 and is now inadmissible (regolith_1 must not be mirrored).');
  T('  the 0.85-0.93 figure quoted for these sources is UNCENTRED cosine similarity (0.92-0.95 measured), dominated by the shared mean level,');
  T('  not by shared structure. It does not predict a visible lattice. Full 9x9 matrix: _glacier_reg_orient.png.');
  T('  DOME CHECK (_glacier_reg_domecheck.png): regolith_0 and regolith_3 are lit near-nadir, craters stay bowls after a vertical flip.');
  T('  regolith_1 carries a strongly directional ridge highlight and does invert -- Rudi\'s restriction confirmed by eye.');
  T('');
  T('grid_tot = sd of the lattice-folded phase average, LUMA UNITS. coh = identical on all four slots (regular lattice).');
  T('slot = differs per slot (patchwork). ramp = peak-to-peak of the plane fitted to the phase average = ALSO the tile plasticity.');
  T('resid = coherent fold minus the plane. ratio = grid_tot over the texture\'s own roughness at the same scale.');
  T('s/r = boundary step over interior roughness. off-ax% = G/R - (1+B/R)/2, distance from the violet axis.');
  T('blow% = share of opaque pixels above Rec709 luma 200, bar < 1%. rim_max = worst-slot rim halo, must not go positive.');
  T('chr% = RESIDUAL chroma: per-pixel saturation after each tile\'s own channel means are divided out. A uniform hue cast scores ~0 here,');
  T('so this is the number that says whether one slot reads brown next to the others -- plain sat cannot, once a B/R target is imposed.');
  fs.writeFileSync(path.join(ST, '_glacier_reg_numbers.txt'), txt.join('\n') + '\n');
  fs.writeFileSync(path.join(WORK, 'ladder_stats.json'), JSON.stringify(
    results.map((R) => ({
      id: R.st.id, label: R.st.label, lumT: R.st.lum, brT: R.st.br, flat: R.st.flat,
      slots: R.slots.map((s) => Object.assign({}, s, { png: undefined })),
      bs: R.bs, slotLsd: R.slotLsd,
      gFull: Object.assign({}, R.gFull, { fold: undefined }),
      gPlay: Object.assign({}, R.gPlay, { fold: undefined }),
      gPlayVac: Object.assign({}, R.gPlayVac, { fold: undefined }),
    })), null, 1));
  console.log('\n' + txt.join('\n'));
  console.log('\n[out] _glacier_reg_numbers.txt  +  glacier_reg/ladder_stats.json');
})();
