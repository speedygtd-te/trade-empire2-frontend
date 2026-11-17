/**
 * CREVASSE FROM GLACIER, ROUND 3 -- FLUX' OWN GROUND, CUT OUT OF A RIMLESS PLATE.
 *
 * STYLE TEST. Writes only into assets/style-test/tiles/crevasse3/ and
 * assets/style-test/tiles/_crevasse3_*.png|txt. NOTHING is written to
 * src/assets/tiles/. No cap sync, no build, no git.
 *
 * THE DECISION THIS ROUND IS BUILT ON, AND IT IS A REVERSAL
 *   Rounds 1 and 2 held glacier's ground sacred: flux' luma was reduced to a shadow
 *   and multiplied back onto the real glacier tile (ground-only NCC 0.79) so that
 *   crevasse was provably "glacier with gashes cut into it". Rudi has since seen
 *   both and said the DIRECT round-1 returns were the better picture. Those returns
 *   are exactly the ones that threw glacier's dusty crater ground away (gNCC
 *   0.02-0.22) and reinvented it as rounded polygon plates with a bright vein
 *   network. That reinvention is now the brief, not the bug. It is also the better
 *   physics -- broken terrain does not look like the intact plain -- and it gives
 *   crevasse TEXTURE as a second leg away from glacier instead of shadow alone.
 *   So: no composite, no multiply, no ground-NCC guard. flux' pixels are the tile.
 *
 * WHAT IS TAKEN FROM ROUND 2 -- THE PLATE, WHICH IS THE ONE THING IT PROVED
 *   Round 1 handed flux the DIAMOND-MASKED tile. flux read the diamond edge as the
 *   picture frame and pinned the gashes to it: rimFis 11-25% against glacier's 3.2%,
 *   two slots came back radial mandalas, two came back untouched, grid_play 12.8-26.0
 *   against glacier's 5.79. Round 2's answer -- never show flux the diamond, let it
 *   draw into a big rimless square and cut the tile out afterwards -- took rimFis to
 *   3.6-4.3% with no mandalas and no untouched returns. That is this round's method.
 *
 * WHAT IS FIXED AGAINST ROUND 2 -- ITS OWN COST, AND ONE MORE OF ITS OWN
 *   (a) NO UPSCALE. Round 2 wanted a six-tile-wide frame, so it downscaled the cut
 *       3:1 for flux and then scaled the returned SHADOW back up 3x; the stair-
 *       stepped lips were visible at 1:1. Here the flux return is 1024x1024 and the
 *       tile is a 512x256 window cut straight out of it. The output is never
 *       resampled. (The plate INPUT is smoothed, in step 1, which costs nothing:
 *       flux redraws the ground anyway.)
 *   (b) NO LATTICE IN THE INPUT. Cutting the square straight out of the iso field
 *       leaves the tile lattice legible at 1:1 -- and flux found it and answered
 *       with a periodic array of holes on that grid, one slot as bubble wrap. Step 1
 *       therefore texture-bombs the plate: random patches from random places in the
 *       field, randomly flipped, feathered, at jittered positions. Glacier dust
 *       everywhere, a repeat nowhere.
 *   (c) FOUR PLATES, FOUR OFFSETS. Round 2 cut all four slots out of ONE plate.
 *       Here each slot has its own plate AND its own window offset -- the widest
 *       scatter of gash centres available, which is the lever round 2 measured
 *       against the stamp (gridCoh 4.1-5.2 -> ~3.3, glacier's own 3.22).
 *
 * WHAT IS KEPT FROM BOTH ROUNDS
 *   NO SECOND FLATTEN. Fissures ARE large-scale brightness structure; glacier's
 *   degree-5 polynomial would fit them and divide them straight back out.
 *   The light plane is re-imposed at tiltY 3.0 / tiltX 0.0, B/R 1.100, G/R 1.060,
 *   and the LEVEL is solved on the ground's p70 = glacier's own, never on the mean.
 *   The whole-tile mean L is an OUTPUT; round 1 landed 37-41 against glacier's 44.0
 *   and that was right.
 *
 * WHAT grid_tot IS, said plainly, because it decides this round
 *   The sd, in luma units, over the 4 x BINS^2 slot-bin cells of the lattice fold =
 *   the tile's own LOW-FREQUENCY CONTRAST at bin resolution. It does not care
 *   whether the structure repeats, only that it is there. gridCoh (identical on all
 *   four slots) is literally a stamp; gridSlot is "each slot has its own big shapes",
 *   which a four-slot corpus can never drive to zero. coh is the honest number and
 *   glacier's is 3.22.
 *
 * MEASURED ON THE WRITTEN .webp, NEVER ON THE BUFFER. sharp.cache(false).
 *
 * Usage: node scripts/tiles-crevasse-r3-ladder.cjs     (needs the step-1 plates)
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const SRCD = path.join(ST, 'crevasse', 'src');           // the round-1 frozen glacier
const WORK = path.join(ST, 'crevasse3');
const PLATE = path.join(WORK, 'plate');
const TAG = '_crevasse3_';

const TILE_W = 512, TILE_H = 256;
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const TILT_Y = 3.0, TILT_X = 0.0;
const BR_T = 1.100, GR_T = 1.060;
// residual-chroma cap. Round 1's convention: 1.2% on the black-walled variants,
// 4.0% on the blue ones, because the pale ice on the break lip IS residual chroma
// and a 1.2% cap would desaturate away the very thing the BLUE variant tests.
const CAP_NEUTRAL = 0.012;
const CAP_BLUE = 0.040;
const SOLVE_PASSES = 8;

const VAC_A = 0.45, VAC_RGB = [5, 10, 25];
const PLAY_W = 48, PLAY_H = 24;

const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);

// ==========================================================================
// world <-> screen for the iso diamond.
// The diamond maps onto the UNIT SQUARE in world coords, so a fissure drawn as a
// straight line in (u,v) is a straight line ON THE GROUND and comes out correctly
// foreshortened on screen. Drawing in screen space instead would paste the gash
// flat against the camera, which is exactly the tell that makes hand-drawn iso
// decals look wrong.
//   u = dx/W + dy/H,  v = -dx/W + dy/H       inverse:  dx = (u-v)W/2, dy = (u+v)H/2
// corners: top (u,v)=(-.5,-.5), right (.5,-.5), bottom (.5,.5), left (-.5,.5)
// ==========================================================================
const s2w = (x, y) => {
  const dx = x - TILE_W / 2, dy = y - TILE_H / 2;
  return [dx / TILE_W + dy / TILE_H, -dx / TILE_W + dy / TILE_H];
};
const w2s = (u, v) => [TILE_W / 2 + ((u - v) * TILE_W) / 2, TILE_H / 2 + ((u + v) * TILE_H) / 2];

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

// ==========================================================================
// THE TILE IS A WINDOW ONTO THE PLATE. No composite, no multiply, no shadow.
//
// Round 2 took only flux' luma, turned it into a shadow and multiplied it onto the
// real glacier so that glacier's ground survived (gNCC 0.79). Rudi has since said
// the direct round-1 returns were the better picture, which reverses that: flux'
// own reinvented ground -- rounded plates, a vein network, columnar break walls --
// IS crevasse. So the window is taken as RGB, straight, and the only things done to
// it afterwards are the diamond mask and the family grade.
//
// The window is cut at a DIFFERENT PLACE for every slot and every slot has its own
// plate, which is the lever round 2 measured: widely scattered fissure centres take
// gridCoh from 4.1-5.2 down toward glacier's own 3.22. The offset is kept off the
// plate border by MARG so nothing flux may still have pinned to its own frame edge
// can get into a tile.
// ==========================================================================
const MARG = 56;
const DIAMOND = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + TILE_W + '" height="' + TILE_H + '">' +
  '<polygon points="' + TILE_W / 2 + ',0 ' + TILE_W + ',' + TILE_H / 2 + ' ' +
  TILE_W / 2 + ',' + TILE_H + ' 0,' + TILE_H / 2 + '" fill="white"/></svg>');
let DIAMOND_MASK = null;
async function diamondMask() {
  if (!DIAMOND_MASK) DIAMOND_MASK = await sharp(DIAMOND).greyscale().png().toBuffer();
  return DIAMOND_MASK;
}

/**
 * Cut slot n its own 512x256 window out of its own plate, rotate it 180 if the
 * corpus convention says so for that slot, and mask it into the diamond.
 * Returns the raw masked tile plus the pre-rotation crop, which the mirror proof
 * cross-correlates against.
 */
async function cropTile(plateFile, rnd, rot180) {
  const md = await sharp(fs.readFileSync(plateFile)).metadata();
  const ox = MARG + Math.floor(rnd() * Math.max(1, md.width - TILE_W - 2 * MARG));
  const oy = MARG + Math.floor(rnd() * Math.max(1, md.height - TILE_H - 2 * MARG));
  const flat = await sharp(fs.readFileSync(plateFile))
    .extract({ left: ox, top: oy, width: TILE_W, height: TILE_H })
    .removeAlpha().png().toBuffer();
  const oriented = rot180 ? await sharp(flat).rotate(180).png().toBuffer() : flat;
  const masked = await sharp(oriented).ensureAlpha()
    .composite([{ input: await diamondMask(), blend: 'dest-in' }]).png().toBuffer();
  const r = await sharp(masked).raw().toBuffer({ resolveWithObject: true });
  const preMasked = await sharp(flat).ensureAlpha()
    .composite([{ input: await diamondMask(), blend: 'dest-in' }]).png().toBuffer();
  return {
    data: r.data, info: r.info,
    crop: { ox: ox, oy: oy, rot180: rot180 },
    pre: preMasked,
  };
}

// ==========================================================================
// measurement -- identical to round 1 so the two tables can be read together
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
async function rimFissure(file) {
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
    if (L709(r.data[i], r.data[i + 1], r.data[i + 2]) < 0.55 * s.p50) dark++;
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
  const sa = await statsOf(fileA);
  const cut = 0.55 * sa.p50;
  const out = {};
  for (const pair of [['fine', 0], ['blur12', 12]]) {
    const A = await load(fileA, pair[1]), B = await load(fileB, pair[1]);
    const Am = await load(fileA, 0);
    const ca = A.info.channels, cb = B.info.channels, w = A.info.width, h = A.info.height;
    const a = [], b = [];
    for (let p = 0; p < w * h; p++) {
      if (Am.data[p * ca + 3] < 250 || B.data[p * cb + 3] < 250) continue;
      if (L709(Am.data[p * ca], Am.data[p * ca + 1], Am.data[p * ca + 2]) < cut) continue;
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
const rd = (x) => (typeof x === 'string' ? fs.readFileSync(x) : x);
async function ncc(fileA, fileB, flop, flip) {
  let sb = sharp(rd(fileB));
  if (flop) sb = sb.flop();
  if (flip) sb = sb.flip();
  const A = await sharp(rd(fileA)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
/** the four orientations at once: identity, flopped, flipped, both (= rot180) */
async function ncc4(a, b) {
  return {
    id: await ncc(a, b, false, false),
    flop: await ncc(a, b, true, false),
    flip: await ncc(a, b, false, true),
    hv: await ncc(a, b, true, true),
  };
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
  m.plane = { p: p, q: q, G: G, desat: desat, tint: tint.slice() };
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
// THE GRID INDEX -- lattice fold, verbatim from the round-1 ladder
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
// THE LADDER -- the round-1 axis, unchanged: 3 fissure densities x 2 wall
// treatments. Rudi has not chosen between the walls yet and with a texture of its
// own the pair can read differently than it did on the composite, so both are here.
// The density is set in the PLATE and lands about 0.37x of that per tile.
// ==========================================================================
const VARIANTS = [
  { id: 'd2-NEUTRAL', dens: 'd2', cap: CAP_NEUTRAL, col: '#8b949e', label: 'd2 sparse, BLACK walls' },
  { id: 'd2-BLUE', dens: 'd2', cap: CAP_BLUE, col: '#79c0ff', label: 'd2 sparse, blue ice on the break lip' },
  { id: 'd4-NEUTRAL', dens: 'd4', cap: CAP_NEUTRAL, col: '#c9d1d9', label: 'd4 medium, BLACK walls' },
  { id: 'd4-BLUE', dens: 'd4', cap: CAP_BLUE, col: '#58a6ff', label: 'd4 medium, blue ice on the break lip' },
  { id: 'd6-NEUTRAL', dens: 'd6', cap: CAP_NEUTRAL, col: '#e6edf3', label: 'd6 dense, BLACK walls' },
  { id: 'd6-BLUE', dens: 'd6', cap: CAP_BLUE, col: '#1f6feb', label: 'd6 dense, blue ice on the break lip' },
];
// the corpus convention the ICE family already carries: slots 2 and 3 are the
// rotated pair. Round 1 inherited it by drawing on glacier slot n; here the tile is
// new, so the rotation is applied on purpose and then PROVEN by cross-correlation.
const ROT180 = [false, false, true, true];
// one rng per variant, so all six rungs cut their windows at the SAME four offsets
// and a column of the sheet is a comparison of the instruction, nothing else.
const CROP_SEED = 5150123;

(async () => {
  fs.mkdirSync(WORK, { recursive: true });

  const GL = [], GLB = [];
  let p70T = 0;
  for (let n = 0; n < 4; n++) {
    const f = path.join(SRCD, 'glacier_' + n + '_src.webp');
    const origin = path.join(TILES, 'glacier', 'glacier_' + n + '.webp');
    if (!fs.readFileSync(f).equals(fs.readFileSync(origin))) console.log('[freeze] WARNING glacier_' + n + ' frozen copy DIFFERS from src/assets/tiles/glacier/');
    const s = await statsOf(f);
    s.micro = await microContrast(path.join(TILES, 'glacier', 'glacier_' + n + '@eighth.webp'), f);
    s.rim = await rimHalo(f); s.rimFis = await rimFissure(f);
    GL.push(s); GLB.push(f); p70T += s.p70;
  }
  p70T /= 4;
  console.log('[glacier]  L ' + f1(GL.reduce((a, s) => a + s.lum, 0) / 4) +
    '  micro8 ' + f2(GL.reduce((a, s) => a + s.micro, 0) / 4) +
    '  dark% ' + f2(100 * GL.reduce((a, s) => a + s.darkFrac, 0) / 4) +
    '  rimFis ' + f1(100 * GL.reduce((a, s) => a + s.rimFis, 0) / 4) + '%' +
    '   ==> GROUND LEVEL TARGET p70 = ' + f1(p70T) + '\n');

  const results = [];
  {
    const bufs = [];
    for (let n = 0; n < 4; n++) bufs.push(await sharp(fs.readFileSync(GLB[n])).png().toBuffer());
    results.push({ V: { id: 'GLACIER', label: 'glacier as shipped (the reference)', col: '#8b949e', ref: true }, bufs: bufs, slots: GL, files: GLB.slice() });
  }

  for (const V of VARIANTS) {
    const miss = [0, 1, 2, 3].filter((k) => !fs.existsSync(path.join(PLATE, V.id + '_' + k + '_kraw.png')));
    if (miss.length) { console.log('[skip] ' + V.id + ' -- plate(s) ' + miss.join(',') + ' missing, run tiles-crevasse-r3-plate.cjs'); continue; }
    const outDir = path.join(WORK, V.id);
    fs.mkdirSync(outDir, { recursive: true });
    const bufs = [], slots = [], files = [], notes = [], pres = [];
    // ONE rng for the whole variant, so every rung cuts at the same four offsets
    const rnd = mulberry32(CROP_SEED);
    for (let n = 0; n < 4; n++) {
      const pf = path.join(PLATE, V.id + '_' + n + '_kraw.png');
      const R = await cropTile(pf, rnd, ROT180[n]);
      notes.push('slot ' + n + ' <- ' + path.basename(pf) + ' @ ' + R.crop.ox + ',' + R.crop.oy + (R.crop.rot180 ? ' rot180' : ''));
      pres.push(R.pre);
      const out = path.join(outDir, 'crevasse_' + n + '.webp');
      const m = await solveTile(R.data, R.info.width, R.info.height, R.info.channels, out, p70T, V.cap);
      fs.writeFileSync(path.join(outDir, 'crevasse_' + n + '.png'), m.png);
      bufs.push(m.png); files.push(out);
      const s = await statsOf(out);
      s.micro = await microContrast(out.replace(/\.webp$/, '@eighth.webp'));
      s.rim = await rimHalo(out); s.rimFis = await rimFissure(out);
      // MIRROR PROOF. The tile against its own PRE-ROTATION window: identity has to
      // win on slots 0/1 and hv (= rot180) has to win on slots 2/3. Round 1's check
      // ran against glacier, which cannot work here -- the ground is not glacier any
      // more -- so the reference is the crop the tile was actually made from.
      s.mir = await ncc4(out, R.pre);
      // and the same four orientations against GLACIER slot n, kept in the table as
      // the honest record that the ground was REPLACED and not preserved.
      s.vsGl = await ncc4(out, GLB[n]);
      s.noop = s.darkFrac < 0.02;
      slots.push(s);
    }
    // STAMP PROOF. Every slot against every other slot in all four orientations.
    // A high value anywhere means two of the four slots are the same picture (or a
    // mirror of it) and the corpus is really three tiles, not four.
    let worst = 0, worstAt = '';
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const o = await ncc4(files[i], files[j]);
      const mx = Math.max(o.id, o.flop, o.flip, o.hv);
      if (mx > worst) { worst = mx; worstAt = i + 'x' + j; }
    }
    results.push({ V: V, bufs: bufs, slots: slots, files: files, notes: notes, pres: pres, xslot: { max: worst, at: worstAt } });
  }

  for (const R of results) {
    const rnd = mulberry32(4242);
    const F = await isoField(R.bufs, TILE_W, TILE_H, 10, 6, () => Math.floor(rnd() * 4));
    const Lf = await lumaOf(F.png);
    R.gFull = gridMetrics(Lf.L, Lf.w, Lf.h, F.cells, TILE_W, TILE_H);
    R.bs = boundaryStep(Object.assign({}, F, { L: Lf.L, w: Lf.w, h: Lf.h }));
    // and the same edge measure on the CLOSED 2x2 repeat, where every slot touches
    // every other slot -- the worst case for a gash that runs out of its own tile.
    const F22 = await isoField(R.bufs, TILE_W, TILE_H, 8, 6, (r, c) => ((r % 2) * 2 + (c % 2)));
    const L22 = await lumaOf(F22.png);
    R.bs22 = boundaryStep(Object.assign({}, F22, { L: L22.L, w: L22.w, h: L22.h }));
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
      '  dark ' + f1(100 * avg((s) => s.darkFrac)).padStart(5) + '%' +
      '  micro8 ' + f2(avg((s) => s.micro)).padStart(6) +
      '  blow ' + f2(100 * Math.max.apply(null, R.slots.map((s) => s.blow))) + '%' +
      '  rimFis ' + f1(100 * avg((s) => s.rimFis)).padStart(5) + '%' +
      '  GRIDplay ' + f2(R.gPlay.gridTot).padStart(5) + ' (coh ' + f2(R.gPlay.gridCoh) + ' slot ' + f2(R.gPlay.gridSlot) + ') r ' + f2(R.gPlay.ratio) +
      '  xslot ' + (R.xslot ? f2(R.xslot.max) : ' -  ') +
      (R.sep ? "  d'J " + f2(R.sep.dJoint) : ''));
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

    line('CREVASSE FROM GLACIER, ROUND 3 -- ' + R.V.label, 19, R.V.col);
    line('STYLE TEST, nothing written to src/assets/tiles/. numbers measured on the WRITTEN .webp. the tile is a 512x256 window cut 1:1 out of a rimless ' +
      '1024 flux plate -- flux\' OWN GROUND, no composite, no multiply, no upscale anywhere. ground level solved on p70 = ' + f1(p70T) +
      ' (glacier\'s own), whole-tile mean L is an OUTPUT. no second flatten. ' + new Date().toISOString().slice(0, 16), 13, '#8b949e');
    if (R.notes) line('per-slot window: ' + R.notes.join('   |   '), 13, '#8b949e');
    y += 4;
    line('  slot     L    intL     p30     p50     p70    B/R    G/R     sd  chr%  dark%  blow%  micro8   tiltX   tiltY    rim   rimFis%   MIRROR id/flop/flip/hv (vs own pre-rot window)   vs GLACIER id/flop/flip/hv', 13, '#8b949e');
    for (let n = 0; n < 4; n++) {
      const s = R.slots[n];
      const m4 = (o) => o ? (f2(o.id) + ' / ' + f2(o.flop) + ' / ' + f2(o.flip) + ' / ' + f2(o.hv)) : '(the reference itself)';
      line('   ' + n + '  ' + f1(s.lum).padStart(6) + f1(s.intLum).padStart(8) + f1(s.p30).padStart(8) + f1(s.p50).padStart(8) + f1(s.p70).padStart(8) +
        f2(s.br).padStart(7) + f2(s.gr).padStart(7) + f1(s.sd).padStart(7) +
        f2(s.chromaRes * 100).padStart(6) + f1(s.darkFrac * 100).padStart(7) + f2(s.blow * 100).padStart(7) +
        f2(s.micro).padStart(8) + f1(s.tiltX).padStart(8) + f1(s.tiltY).padStart(8) +
        ((s.rim >= 0 ? '+' : '') + f2(s.rim)).padStart(7) + f1(100 * s.rimFis).padStart(9) + '     ' +
        m4(s.mir).padEnd(30) + (s.mir ? (ROT180[n] ? '  [rot180 expected -> hv must win]' : '  [as is -> id must win]') : '') + '   ' +
        m4(s.vsGl) + (s.noop ? '   <== NO FISSURES' : ''), 13, s.noop ? '#ff7b72' : '#c9d1d9');
    }
    y += 6;
    if (!R.V.ref) {
      const mirOk = R.slots.every((s, n) => {
        const o = s.mir, best = ROT180[n] ? o.hv : o.id;
        return best > 0.98 && best > Math.max(o.id, o.flop, o.flip, o.hv) - 1e-9;
      });
      line('MIRROR PROOF     slot 0/1 taken as cut, slot 2/3 rotated 180 -- the corpus convention the ICE family already carries.  ' +
        (mirOk ? 'the expected orientation WINS on all four slots at >= 0.98.' : 'FAILED -- see the table above.'), 13, mirOk ? '#7ee787' : '#ff7b72');
      line('STAMP PROOF      worst pairwise slot-vs-slot NCC over all four orientations: ' + f2(R.xslot.max) + '  (pair ' + R.xslot.at + ')' +
        '   -- near zero means the four slots are four different pictures and not one picture mirrored', 13,
        R.xslot.max < 0.25 ? '#7ee787' : R.xslot.max < 0.5 ? '#ffa657' : '#ff7b72');
      line('GROUND            deliberately NOT glacier any more. the "vs GLACIER" column above is the record of that, not a guard: round 1 read 0.02-0.22 ' +
        'on the direct returns and that is the picture Rudi picked.', 13, '#8b949e');
    }
    line('LEVEL          ground p70 ' + f1(avg((s) => s.p70)) + ' (target ' + f1(p70T) + ', glacier\'s own)   ->   whole-tile mean L ' + f1(mL) +
      '   vs glacier 44.0   =  dL ' + ((mL - 44.0 >= 0 ? '+' : '') + f1(mL - 44.0)) + '   [the fissures pay for this, it is not dialled in]', 13, '#ffa657');
    line('HUE            B/R ' + f2(mb) + '   G/R ' + f2(mg) + '   RESIDUAL chroma ' + f2(100 * avg((s) => s.chromaRes)) + '%  (cap ' + f1(100 * (R.V.cap || CAP_NEUTRAL)) + '%, glacier ' + f2(100 * GL.reduce((a, s) => a + s.chromaRes, 0) / 4) + '%)', 13, '#ffa657');
    line('FISSURE AREA   dark ' + f1(100 * avg((s) => s.darkFrac)) + '% of the tile (below 0.55x its own p50)   glacier ' + f1(100 * GL.reduce((a, s) => a + s.darkFrac, 0) / 4) + '%', 13, '#ffa657');
    line('BLOWOUT        worst slot ' + f2(100 * worstBlow) + '%   (bar: < 1.00%)', 13, worstBlow < 0.01 ? '#7ee787' : '#ff7b72');
    line('RIM HALO       worst slot ' + ((worstRim >= 0 ? '+' : '') + f2(worstRim)) + '     must not go positive (uniform plane, no divide-by-blur)', 13, worstRim <= 0.3 ? '#7ee787' : '#ff7b72');
    line('RIM FISSURE    ' + f1(100 * avg((s) => s.rimFis)) + '% of the diamond rim band is fissure, not ground  (glacier ' + f1(100 * GL.reduce((a, s) => a + s.rimFis, 0) / 4) +
      '%)  -- a fissure that stops at the tile edge cannot be continued by a random neighbour slot', 13,
      avg((s) => s.rimFis) < 0.05 ? '#7ee787' : avg((s) => s.rimFis) < 0.10 ? '#ffa657' : '#ff7b72');
    line('BOUNDARY STEP  random field: step ' + f2(R.bs.step) + '  interior roughness ' + f2(R.bs.rough) + '  RATIO ' + f2(R.bs.ratio) +      '      CLOSED 2x2: step ' + f2(R.bs22.step) + '  rough ' + f2(R.bs22.rough) + '  RATIO ' + f2(R.bs22.ratio) +      '   (lower = the tile edge reads less as a line. glacier 1.57)', 13, R.bs22.ratio <= 1.8 ? '#7ee787' : '#ffa657');
    line('GRID INDEX     lattice fold of the tessellated field, rim band excluded (max(|du|,|dv|) <= ' + RIM_CUT + ')', 13, '#ffa657');
    for (const pair of [['FULL RES', R.gFull], ['PLAY 48x24', R.gPlay], ['PLAY + VACUUM', R.gPlayVac]]) {
      const g = pair[1];
      line('      ' + pair[0].padEnd(14) + 'grid_tot ' + f2(g.gridTot) + ' L   (COHERENT ' + f2(g.gridCoh) + ' = the same shape on all four slots, SLOT-DEPENDENT ' + f2(g.gridSlot) +
        ')   ramp_pp ' + f2(g.rampPP) + '   sd_within ' + f2(g.sdWithin) +
        '   ratio ' + f3(g.ratio) + '   ' + f2(g.pctOfMean) + '% of mean ' + f1(g.mean), 13, '#8b949e');
    }
    line('    reference at PLAY scale: glacier 5.79 / ratio 0.59  |  new tundra 2.60 / 0.86  |  ice_shelf 7.10 / 1.21  |  REJECTED old tundra 10.40 / 1.12', 13, '#8b949e');
    line('    round 1 DIRECT (the picture Rudi picked) landed 25.98 / 21.15 / 18.57 at play scale, coh 21.7 / 20.7 / 14.5. round 1 COMPOSITE 23.75 / 18.93 / 15.86.', 13, '#8b949e');
    y += 6;
    if (R.sep) {
      line("SEPARABILITY FROM GLACIER at play scale -- d' over the per-tile distribution of a 40x24 field", 15, '#ffa657');
      for (const pair of [['plain', R.sep], ['under vacuum', R.sepVac]]) {
        const S = pair[1];
        line('    ' + pair[0].padEnd(14) +
          'tile mean L  crevasse ' + f1(S.A.m) + ' +-' + f1(S.A.msd) + '   glacier ' + f1(S.B.m) + ' +-' + f1(S.B.msd) + "   d' " + f2(S.dLevel) +
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

    const out = path.join(ST, TAG + '' + R.V.id + '.png');
    fs.writeFileSync(out, await sharp({ create: { width: SW, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[sheet] ' + path.basename(out));
    R.playField = PD.png; R.playVac = PDv;
  }

  // ======================================================================
  // DECISION PANELS
  // ======================================================================
  for (const trio of [
    ['playscale', 'playField', 'PLAY SCALE 48x24 px per tile (zoom 1.0). This is where it is decided. glacier is the top row -- the question is whether the rest look different from it AND do not read as a repeat.'],
    ['vacuum', 'playVac', 'PLAY SCALE under the VACUUM darkening rgba(5,10,25,0.45) -- airless ice moon. glacier top row.'],
  ]) {
    const comp = []; let y = PAD, maxW = 0;
    comp.push({ input: label('CREVASSE ROUND 3 -- ' + trio[2], 2600, 19, '#e6edf3'), left: PAD, top: y }); y += 30;
    comp.push({ input: label('every rung holds B/R 1.10, G/R 1.06, tiltY 3.0 / tiltX 0.0, ground p70 = glacier\'s own. no second flatten. identical random draw on all rungs.', 2600, 13, '#8b949e'), left: PAD, top: y }); y += 24;
    for (const R of results) {
      const avg = (f) => R.slots.reduce((a, s) => a + f(s), 0) / 4;
      comp.push({
        input: label(R.V.label.padEnd(52) + 'L ' + f1(avg((s) => s.lum)).padStart(5) +
          '  micro8 ' + f2(avg((s) => s.micro)).padStart(6) +
          '  dark ' + f1(100 * avg((s) => s.darkFrac)).padStart(5) + '%' +
          '  rimFis ' + f1(100 * avg((s) => s.rimFis)).padStart(5) + '%' +
          '  GRIDplay ' + f2(R.gPlay.gridTot) + ' (coh ' + f2(R.gPlay.gridCoh) + ')/' + f2(R.gPlay.ratio) +
          (R.sep ? "   vs glacier d'JOINT " + f2(R.sep.dJoint) : '   (the reference)'),
          2500, 15, R.V.col), left: PAD, top: y,
      });
      y += 22;
      const img = R[trio[1]];
      const m = await sharp(img).metadata();
      comp.push({ input: img, left: PAD, top: y });
      maxW = Math.max(maxW, m.width); y += m.height + 16;
    }
    const out = path.join(ST, TAG + '' + trio[0] + '.png');
    fs.writeFileSync(out, await sharp({ create: { width: Math.max(maxW, 2600) + PAD * 2, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[panel] ' + path.basename(out));
  }

  // ======================================================================
  // crevasse AND glacier in one field
  // ======================================================================
  {
    const comp = []; let y = PAD, maxW = 0;
    comp.push({ input: label('CREVASSE vs GLACIER -- ONE FIELD, coherent patches, play scale. left plain, right under vacuum. THE question: can you see where one stops and the other starts?', 2600, 19, '#e6edf3'), left: PAD, top: y }); y += 30;
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
    const out = path.join(ST, TAG + 'vs_glacier.png');
    fs.writeFileSync(out, await sharp({ create: { width: Math.max(maxW, 2600) + PAD * 2, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[panel] ' + path.basename(out));
  }

  // ======================================================================
  // FOLD MAP -- the lattice, drawn
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
    const FW = 660, FH = 330, PER = 4, comp = []; let y = PAD;
    comp.push({ input: label('CREVASSE ROUND 3 -- THE FOLD MAP: the lattice, drawn.', 2400, 19, '#e6edf3'), left: PAD, top: y }); y += 30;
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
    const out = path.join(ST, TAG + 'foldmap.png');
    fs.writeFileSync(out, await sharp({ create: { width: PAD * 2 + PER * (FW + 16), height: rowTop + rowMax + PAD, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[panel] ' + path.basename(out));
  }

  // ======================================================================
  // NUMBERS
  // ======================================================================
  const txt = [];
  const T = (s) => txt.push(s);
  T('CREVASSE FROM GLACIER, ROUND 3 -- FLUX\' OWN GROUND, CUT OUT OF A RIMLESS PLATE  ' + new Date().toISOString().slice(0, 16) + '   (style test, nothing written to src/assets/tiles/)');
  T('THE REVERSAL: rounds 1+2 kept glacier as the ground and added only a shadow. Rudi picked the DIRECT round-1 returns instead -- the ones where flux threw');
  T('  glacier\'s ground away and reinvented it as rounded plates with a vein network. So there is NO COMPOSITE here: flux\' own pixels ARE the tile, and the');
  T('  "vs GLACIER" correlations in the mirror table are a record of that, not a guard.');
  T('THE METHOD, from round 2: flux never sees the diamond. A rimless 1024x1024 plate is texture-bombed out of the glacier iso field (bombed, not cut -- a straight');
  T('  cut leaves the tile lattice legible and flux answers with a PERIODIC ARRAY OF HOLES on it; that cost one generation to learn). flux draws into the plate,');
  T('  then each slot is cut its own 512x256 window at its own offset out of its OWN plate. Four plates, four offsets = the widest scatter of gash centres there is.');
  T('NO UPSCALE ANYWHERE ON THE OUTPUT. flux returns 1024x1024 and the tile is a 1:1 window of it. Round 2 needed a 3x upscale of its shadow and the stair-stepped');
  T('  lips showed at 1:1; the only rescale in this pipeline is a 3:1 downscale of the INPUT plate, which costs nothing because flux redraws the ground anyway.');
  T('GRADE after the crop -- B/R 1.100, G/R 1.060, tiltY 3.0 / tiltX 0.0, ground level solved on p70 = ' + f1(p70T) + ' (glacier\'s own). No second flatten.');
  T('  residual-chroma cap 1.2% on the BLACK-wall rungs, 4.0% on the BLUE ones (round 1\'s convention: the pale ice on the break lip IS residual chroma).');
  T('');
  T('  rung                                                  L     p70    B/R    G/R   chr%  dark%   blow%     sd  micro8     tY    step  rough   s/r   s/r22  rimFis%  xslot   GRIDfull    coh   slot   GRIDplay    coh   slot  ratio   GRIDvac    d\'lvl   d\'tex  d\'JOINT   d\'vac');
  for (const R of results) {
    const avg = (f) => R.slots.reduce((a, s) => a + f(s), 0) / 4;
    T('  ' + R.V.label.padEnd(52) +
      f1(avg((s) => s.lum)).padStart(5) + f1(avg((s) => s.p70)).padStart(8) +
      f2(avg((s) => s.br)).padStart(7) + f2(avg((s) => s.gr)).padStart(7) +
      f2(100 * avg((s) => s.chromaRes)).padStart(7) + f1(100 * avg((s) => s.darkFrac)).padStart(7) +
      f2(100 * Math.max.apply(null, R.slots.map((s) => s.blow))).padStart(8) +
      f1(avg((s) => s.sd)).padStart(7) + f2(avg((s) => s.micro)).padStart(8) +
      f1(avg((s) => s.tiltY)).padStart(7) +
      f2(R.bs.step).padStart(8) + f2(R.bs.rough).padStart(7) + f2(R.bs.ratio).padStart(6) + f2(R.bs22.ratio).padStart(7) +
      f1(100 * avg((s) => s.rimFis)).padStart(9) +
      (R.xslot ? f2(R.xslot.max).padStart(7) : '      -') +
      f2(R.gFull.gridTot).padStart(11) + f2(R.gFull.gridCoh).padStart(7) + f2(R.gFull.gridSlot).padStart(7) +
      f2(R.gPlay.gridTot).padStart(11) + f2(R.gPlay.gridCoh).padStart(7) + f2(R.gPlay.gridSlot).padStart(7) + f2(R.gPlay.ratio).padStart(7) +
      f2(R.gPlayVac.gridTot).padStart(10) +
      (R.sep ? f2(R.sep.dLevel).padStart(9) + f2(R.sep.dTexture).padStart(8) + f2(R.sep.dJoint).padStart(9) + f2(R.sepVac.dJoint).padStart(8) : '        -       -        -       -'));
  }
  T('');
  T('THE TWO EARLIER ROUNDS IN THE SAME COLUMNS. Round 1 DIRECT is the picture Rudi picked; round 1 COMPOSITE and round 2 are what he turned down.');
  T('  rung                                                  L     p70    B/R    G/R   chr%  dark%   blow%     sd  micro8     tY    step  rough   s/r   s/r22  rimFis%  xslot   GRIDfull    coh   slot   GRIDplay    coh   slot  ratio   GRIDvac    d\'lvl   d\'tex  d\'JOINT   d\'vac');
  T('  R1 DIRECT  2 fissures, black walls                    37.2    89.9   1.10   1.06   4.35   25.1    0.00   32.8    8.05    3.0   33.92  10.05  3.38       -     14.8       -      32.21  21.71  23.79      25.98      -      -   1.41     14.28     5.02    7.31     8.87    8.86');
  T('  R1 DIRECT  4 fissures, black walls                    38.1    89.9   1.10   1.06   4.21   20.5    0.00   30.3    8.96    3.0   33.45  11.16  3.00       -     25.2       -      26.80  20.69  17.03      21.15      -      -   1.23     11.62     5.66    5.81     8.11    8.14');
  T('  R1 DIRECT  6 fissures, black walls                    38.1    90.0   1.10   1.06   3.91   22.4    0.00   30.0   11.71    3.0   39.85  12.29  3.24       -     24.4       -      27.19  14.53  22.98      18.57      -      -   0.90     10.22     2.66    3.90     4.72    4.71');
  T('  R1 DIRECT  4 fissures, blue break lip                  40.1    89.6   1.10   1.06   4.46   14.4    0.00   26.8    8.93    3.0   29.62  12.84  2.31       -     17.5       -      23.49  15.44  17.69      17.35      -      -   1.05      9.54     3.36    3.57     4.90    4.90');
  T('  R1 DIRECT  6 fissures, blue break lip                  40.7    89.7   1.10   1.06   3.89   15.1    0.00   22.8    8.32    3.0   29.88  13.34  2.24       -     15.1       -      19.50   8.97  17.31      12.78      -      -   0.85      7.03     3.03    3.00     4.26    4.26');
  T('  R1 COMPOSITE 4 fissures                                38.6    90.1   1.10   1.06   3.95   18.3    0.01   30.0   10.72    3.0   31.88  15.36  2.08       -     24.4       -      25.33  18.79  16.99      18.93      -      -   1.11     10.40    11.03    5.16    12.18   12.11');
  T('  R1 COMPOSITE 6 fissures                                38.5    90.0   1.10   1.06   3.77   19.4    0.01   28.8   12.37    3.0   37.02  15.86  2.33       -     22.8       -      24.94  12.92  21.34      15.86      -      -   0.81      8.73     3.28    3.29     4.65    4.64');
  T('  R2 A plate frame 6 tiles, upscaled shadow              41.3    89.9   1.10   1.06   2.53   11.4    0.02   24.2    8.69    3.0   27.26  12.85  2.12       -      4.3       -      22.26  11.26  19.21      16.26   8.31  13.97   1.08      8.95     2.70    3.07     4.09    4.09');
  T('  R2 B 3 gashes drawn, contained                         42.6    89.9   1.10   1.06   2.64    6.4    0.00   20.7   10.03    3.0   18.32  14.35  1.28       -      3.2       -      16.66   8.08  14.56       7.81   4.25   6.55   0.61      4.30     7.18    1.47     7.33    7.27');
  T('');
  T('PAIR DISTANCES per rung, same-planet neighbours.');
  T('  rung                                                vs glacier (44.0 / 1.10 / 1.06 / 7.40)     vs tundra (30.8 / 0.82 / 0.91 / 3.3)       vs ice_shelf (22.0 / 2.86 / 2.18 / 4.5)');
  for (const R of results) {
    const avg = (f) => R.slots.reduce((a, s) => a + f(s), 0) / 4;
    const mL = avg((s) => s.lum), mb = avg((s) => s.br), mg = avg((s) => s.gr), mM = avg((s) => s.micro);
    let row = '  ' + R.V.label.padEnd(52);
    for (const nb of NEIGH) {
      row += ('dL ' + ((mL - nb.lum >= 0 ? '+' : '') + f1(mL - nb.lum)) +
        '  dB/R ' + ((mb - nb.br >= 0 ? '+' : '') + f2(mb - nb.br)) +
        '  dG/R ' + ((mg - nb.gr >= 0 ? '+' : '') + f2(mg - nb.gr)) +
        '  mic x' + f2(mM / nb.micro)).padEnd(44);
    }
    T(row);
  }
  T('');
  T('MIRROR CONVENTION, PROVEN BY CROSS-CORRELATION. The ICE corpus convention is "slots 2 and 3 are the rotated pair" (glacier itself: slot 0 <- regolith_3 as is,');
  T('1 <- regolith_1 as is, 2 <- regolith_0 rotated 180, 3 <- regolith_3 rotated 180). Round 1 inherited that for free by drawing ON glacier slot n. Here the tile is a');
  T('fresh window on a plate, so the rotation is APPLIED and then proven: mean-centred masked NCC of the finished tile against ITS OWN PRE-ROTATION WINDOW in all four');
  T('orientations. id must win on slots 0/1, hv (= rot180) must win on slots 2/3, and the winner must be ~1.00 -- anything less means the grade moved the pattern.');
  T('  rung                                                slot 0 id/flop/flip/hv               slot 1                               slot 2 (rot180)                      slot 3 (rot180)');
  for (const R of results) {
    if (R.V.ref) continue;
    let row = '  ' + R.V.label.padEnd(52);
    for (let n = 0; n < 4; n++) {
      const o = R.slots[n].mir;
      row += (f2(o.id) + ' / ' + f2(o.flop) + ' / ' + f2(o.flip) + ' / ' + f2(o.hv)).padEnd(37);
    }
    T(row);
  }
  T('');
  T('THE SAME FOUR ORIENTATIONS AGAINST GLACIER SLOT n -- the record that the ground was REPLACED, not preserved. Round 1 DIRECT read 0.02-0.22 here and that is the');
  T('picture Rudi picked; round 1 COMPOSITE read 0.28-0.56 because it put glacier back underneath. Near zero here is the intent of this round, not a failure.');
  T('  rung                                                slot 0 id/flop/flip/hv               slot 1                               slot 2                               slot 3');
  for (const R of results) {
    if (R.V.ref) continue;
    let row = '  ' + R.V.label.padEnd(52);
    for (let n = 0; n < 4; n++) {
      const o = R.slots[n].vsGl;
      row += (f2(o.id) + ' / ' + f2(o.flop) + ' / ' + f2(o.flip) + ' / ' + f2(o.hv)).padEnd(37);
    }
    T(row);
  }
  T('');
  T('STAMP PROOF -- worst pairwise slot-vs-slot NCC over all four orientations. Near zero = four different pictures. High = the corpus is really three tiles.');
  for (const R of results) if (R.xslot) T('  ' + R.V.label.padEnd(52) + f2(R.xslot.max) + '   (worst pair ' + R.xslot.at + ')');
  T('');
  T('PER-SLOT WINDOW (the actual lever against a stamp -- round 1 put the fissures in the same place on every slot, round 2 cut all four out of ONE plate):');
  for (const R of results) if (R.notes) T('  ' + R.V.label.padEnd(52) + R.notes.join('   |   '));
  T('');
  T('WHAT grid_tot IS. sd, in luma units, over the 4 x BINS^2 slot-bin cells of the lattice fold = the tile\'s own LOW-FREQUENCY CONTRAST at bin resolution.');
  T('  COH  = the part identical on all four slots. This is literally a stamp: the same shape in the same place every time a tile is drawn.');
  T('  SLOT = the part that differs per slot. A four-slot corpus can never drive this to zero -- four big shapes are still only four.');
  T('  ratio = grid_tot over the texture\'s own roughness at the same scale. reference at play scale: glacier 5.79/0.59, new tundra 2.60/0.86,');
  T('  ice_shelf 7.10/1.21, REJECTED old tundra 10.40/1.12.');
  T('micro8 = mean |dL| between 4-neighbours on the 64x32 mip. glacier 7.40. The family analysis asked crevasse for ~17; round 1 showed that is unreachable');
  T('  with FEW WIDE fissures (max 12.37) because few wide shapes are low-frequency by definition, and it is not chased here.');
  T('dark% = share of opaque pixels below 0.55x the tile\'s own p50 -- the fissure area. glacier ' + f1(100 * GL.reduce((a, s) => a + s.darkFrac, 0) / 4) + '%.');
  T('rimFis% = share of the diamond rim band (1-6 px inside) that is fissure rather than ground. glacier ' + f1(100 * GL.reduce((a, s) => a + s.rimFis, 0) / 4) + '%.');
  T('s/r = boundary step over interior roughness on the RANDOM field, s/r22 the same on the CLOSED 2x2 repeat where every slot touches every other one.');
  T('  xslot = worst pairwise slot-vs-slot NCC over four orientations. blow% = share of opaque pixels above Rec709 luma 200, bar < 1%.');
  T('d\'  = separability from glacier at play scale over the per-tile distribution of a 40x24 field: |mean difference| / rms of the two spreads.');
  T('      d\'level on tile mean luma, d\'texture on within-tile sd, JOINT = quadrature sum. >= 1.0 separated, < 0.5 the same tile with two names.');
  fs.writeFileSync(path.join(ST, TAG + 'numbers.txt'), txt.join('\n') + '\n');
  fs.writeFileSync(path.join(WORK, 'ladder_stats.json'), JSON.stringify(
    results.map((R) => ({
      id: R.V.id, label: R.V.label, notes: R.notes,
      slots: R.slots.map((s) => Object.assign({}, s, { png: undefined })),
      bs: R.bs, bs22: R.bs22, xslot: R.xslot, sep: R.sep, sepVac: R.sepVac,
      gFull: Object.assign({}, R.gFull, { fold: undefined }),
      gPlay: Object.assign({}, R.gPlay, { fold: undefined }),
      gPlayVac: Object.assign({}, R.gPlayVac, { fold: undefined }),
    })), null, 1));
  console.log('\n' + txt.join('\n'));
  console.log('\n[out] _crevasse2_numbers.txt  +  crevasse2/ladder_stats.json');
})();
