/**
 * SILICATE_PLAIN -- REPLACE SLOT 0 ONLY. Slots 1, 2, 3 are never touched.
 *
 * WHY
 *   Rudi: "silicate_plain ist fast perfekt ... wir muessen nur silicate_plain_0
 *   loeschen und durch einen anderen ersetzen, der aus einem der anderen 3
 *   abgeleitet ist. die anderen 3 sind zwar sehr hell, haben aber alle die
 *   gleiche farbe, kacheln sehr gut und sehen insgesamt sehr gut aus."
 *   Measured: slot 0 is the only bluish one (sat 16.3 %, B/R 1.177) and the only
 *   dark one (ground p70 149.7 against 208-215). It is the outlier, nothing else.
 *
 * THE ROUTE: OFFSET WINDOW OUT OF A TEXTURE-BOMBED PLATE, NO FLUX.
 *   LESSONS section 3: on a motif with no forms the seed decides everything, and
 *   other windows of one plate beat fresh flux returns (frozen_lake: inter-slot
 *   NCC 0.009 for offset against 0.061 for flux, micro8 spread 0.31 against
 *   1.22). A silicate plain is the same kind of motif -- fine grit with faint
 *   hairline cracks -- so the offset route is tried FIRST, as briefed. No flux
 *   call is made unless this fails.
 *
 * THE TEMPLATE IS SLOT 2, and the reason is derivation-specific, not aesthetic:
 *   slot 1  sd 17.2  micro8 3.72  blowout 55.9 %   nearly featureless
 *   slot 2  sd 24.6  micro8 5.64  blowout 46.9 %   hairline crack net + one crater
 *   slot 3  sd 18.3  micro8 4.88  blowout 70.4 %   broad soft crater lobes
 *   A texture bomb SUBTRACTS coherence -- it chops long features into disc-sized
 *   fragments -- so whatever goes in comes out flatter. Starting from slot 1
 *   would land under the 17-25 sd band and produce a second near-featureless
 *   slot, which buys the corpus nothing. Slot 2 is also the one with the most
 *   headroom on the blowout ceiling. Slot 3 is dismissed on blowout (70.4 %, the
 *   highest of the three) and on its forms: its broad crater lobes are the kind
 *   of large shape that a bomb reproduces recognisably.
 *
 * NO FLIP AND NO FLOP ON THE PATCHES.
 *   LESSONS section 4: a vertical flip inverts the baked-in shading and turns
 *   craters into domes. A horizontal flop would do the same to the left-lit
 *   crater walls of this source, and would additionally cancel the family's
 *   own tiltX. Decorrelation here comes from POSITION alone, which is enough:
 *   the field is one tile laid in the iso lattice, so a disc taken at a random
 *   place carries a random phase of it.
 *
 * THE RAMP IS A MEASURED CHOICE, NOT A COPIED CONSTANT.
 *   The three keepers carry tiltX +10.7/+15.1/+21.5 and tiltY +12.8/+21.6/+18.5.
 *   LESSONS section 4 says a per-tile ramp IS most of the seam and belongs at 0;
 *   but here three of four tiles already carry one, so the question is only what
 *   the FOURTH should do. Both are built (RAMP = family mean, and RAMP = 0) and
 *   the seam ratio on the interlocked mosaic decides. Nothing is assumed.
 *
 * MEASURED ON THE WRITTEN .webp, sharp.cache(false), per LESSONS section 1.
 *   The grade is anchored on the GROUND p70, never on the mean: the mean is
 *   dragged by however much shadow a tile happens to hold, and forcing a tile
 *   with a different shadow fraction onto a mean is forcing it onto the wrong
 *   number.
 *
 * Writes ONLY into assets/style-test/tiles/silicate_plain/.
 * Nothing here writes src/assets/tiles/ -- that is the integrate script.
 *
 * Usage: node scripts/tiles-silicate-plain-slot0.cjs
 *        FORCE=1 ...   rebuild the plate
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const BIOME = 'silicate_plain';
const WORK = path.join(ROOT, 'assets', 'style-test', 'tiles', BIOME);
const SRCD = path.join(WORK, 'src');
const OUT = path.join(WORK, 'cand');

const TILE_W = 512, TILE_H = 256;
const PW = 768, PH = 512;
const TEMPLATE = 2;
const BOMB_SEED = 5140277;
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const SOLVE_PASSES = 8;
const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);

// targets -- ground p70 in the keepers' band, exactly neutral
const P70_T = 212.0;
const BR_T = 1.000, GR_T = 1.000;

// ==========================================================================
// measurement (identical to the audit script)
// ==========================================================================
function statsRaw(data, ch, w, h) {
  const is = [0, 0, 0], iq = [0, 0, 0];
  let ni = 0, grey = 0;
  const half = { l: 0, r: 0, t: 0, b: 0 }, hn = { l: 0, r: 0, t: 0, b: 0 };
  const lv = [];
  let satS = 0, satN = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (data[i + 3] < 8) continue;
    for (let c = 0; c < 3; c++) { is[c] += data[i + c]; iq[c] += data[i + c] * data[i + c]; }
    ni++;
    const L = L709(data[i], data[i + 1], data[i + 2]);
    if (data[i + 3] >= 250) lv.push(L);
    const kx = x < w / 2 ? 'l' : 'r', ky = y < h / 2 ? 't' : 'b';
    half[kx] += L; hn[kx]++; half[ky] += L; hn[ky]++;
    const mx = Math.max(data[i], data[i + 1], data[i + 2]);
    const mn = Math.min(data[i], data[i + 1], data[i + 2]);
    if (mx > 0) { satS += (mx - mn) / mx; satN++; }
    if (data[i] === data[i + 1] && data[i + 1] === data[i + 2]) grey++;
  }
  lv.sort((a, b) => a - b);
  const im = is.map((x) => x / ni);
  const isd = iq.map((x, k) => Math.sqrt(Math.max(0, x / ni - im[k] * im[k])));
  const q = (p) => (lv.length ? lv[Math.min(lv.length - 1, Math.floor(lv.length * p))] : 0);
  return {
    mean: L709(im[0], im[1], im[2]), rgb: im,
    br: im[2] / im[0], gr: im[1] / im[0],
    sd: (isd[0] + isd[1] + isd[2]) / 3,
    sat: satN ? satS / satN : 0, greyFrac: ni ? grey / ni : 0,
    p50: q(0.50), p70: q(0.70), p90: q(0.90), p99: q(0.99),
    clip: lv.length ? lv.filter((v) => v >= 254).length / lv.length : 0,
    blow: lv.length ? lv.filter((v) => v >= 200).length / lv.length : 0,
    tiltX: half.l / hn.l - half.r / hn.r, tiltY: half.t / hn.t - half.b / hn.b,
  };
}
async function statsOfBuf(buf) {
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return statsRaw(r.data, r.info.channels, r.info.width, r.info.height);
}
const statsOf = async (f) => statsOfBuf(fs.readFileSync(f));
async function microContrast(buf) {
  const r = await sharp(Buffer.isBuffer(buf) ? buf : fs.readFileSync(buf)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) { L[p] = L709(r.data[p * ch], r.data[p * ch + 1], r.data[p * ch + 2]); A[p] = r.data[p * ch + 3]; }
  let s = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) { const p = y * w + x; if (A[p] < 200 || A[p + 1] < 200) continue; s += Math.abs(L[p] - L[p + 1]); n++; }
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) { const p = y * w + x; if (A[p] < 200 || A[p + w] < 200) continue; s += Math.abs(L[p] - L[p + w]); n++; }
  return n ? s / n : 0;
}
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
  const a = await lumaA(bufA), out = {};
  for (const k of Object.keys(ORI)) out[k] = nccOf(a, await lumaA(await ORI[k](sharp(bufB)).png().toBuffer()));
  return out;
}
/**
 * HIGH-PASS NCC. The raw NCC between any two of these tiles is 0.44-0.49 in
 * 'id' -- but that is the SHARED LIGHT RAMP talking, not shared texture. A
 * 16x16 box high-pass removes everything at ramp scale and leaves the question
 * that actually matters: do the two carry the same grain and the same cracks?
 */
function highpass(a, k) {
  const { L, A, w, h } = a;
  const H = new Float32Array(w * h);
  const S = new Float64Array((w + 1) * (h + 1)), N = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, q = (y + 1) * (w + 1) + (x + 1);
    const v = A[p] >= 250 ? L[p] : 0, m = A[p] >= 250 ? 1 : 0;
    S[q] = v + S[q - 1] + S[q - w - 1] - S[q - w - 2];
    N[q] = m + N[q - 1] + N[q - w - 1] - N[q - w - 2];
  }
  const box = (x0, y0, x1, y1, T) => T[(y1 + 1) * (w + 1) + (x1 + 1)] - T[y0 * (w + 1) + (x1 + 1)] - T[(y1 + 1) * (w + 1) + x0] + T[y0 * (w + 1) + x0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (A[p] < 250) { H[p] = 0; continue; }
    const x0 = Math.max(0, x - k), x1 = Math.min(w - 1, x + k), y0 = Math.max(0, y - k), y1 = Math.min(h - 1, y + k);
    const n = box(x0, y0, x1, y1, N);
    H[p] = L[p] - (n > 0 ? box(x0, y0, x1, y1, S) / n : L[p]);
  }
  return { L: H, A, w, h };
}
async function nccAllHP(bufA, bufB, k) {
  const a = highpass(await lumaA(bufA), k || 16), out = {};
  for (const key of Object.keys(ORI)) out[key] = nccOf(a, highpass(await lumaA(await ORI[key](sharp(bufB)).png().toBuffer()), k || 16));
  return out;
}

// ---- iso field + seam ----------------------------------------------------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
async function isoField(bufs, w, h, rows, cols, pick) {
  const px = [];
  for (const f of bufs) px.push(await sharp(Buffer.isBuffer(f) ? f : fs.readFileSync(f)).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer());
  const cells = [];
  let mr = 0, mb = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const slot = pick(r, c);
    const x = c * w + (r % 2 ? w / 2 : 0), y = (r * h) / 2;
    cells.push({ input: px[slot], left: x, top: y, slot });
    mr = Math.max(mr, x + w); mb = Math.max(mb, y + h);
  }
  const png = await sharp({ create: { width: mr, height: mb, channels: 4, background: BGA } })
    .composite(cells.map((c) => ({ input: c.input, left: c.left, top: c.top }))).png().toBuffer();
  return { png, cells, w: mr, h: mb, tw: w, th: h };
}
async function lumaOf(png) {
  const r = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const L = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) L[p] = L709(r.data[p * ch], r.data[p * ch + 1], r.data[p * ch + 2]);
  return { L, w, h };
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
async function seamOf(bufs4, seed) {
  const rnd = mulberry32(seed || 4242);
  const F = await isoField(bufs4, TILE_W, TILE_H, 10, 6, () => Math.floor(rnd() * bufs4.length));
  const Lf = await lumaOf(F.png);
  return { bs: boundaryStep(Object.assign({}, F, { L: Lf.L, w: Lf.w, h: Lf.h })), png: F.png };
}

// ==========================================================================
// diamond, grade, solve
// ==========================================================================
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
async function cutWindow(plate, ox, oy) {
  const flat = await sharp(plate).extract({ left: Math.round(ox), top: Math.round(oy), width: TILE_W, height: TILE_H })
    .removeAlpha().png().toBuffer();
  const masked = await sharp(flat).ensureAlpha().composite([{ input: await diamondMask(), blend: 'dest-in' }]).png().toBuffer();
  const r = await sharp(masked).raw().toBuffer({ resolveWithObject: true });
  return { data: r.data, info: r.info };
}
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
 * Solve on the WRITTEN webp, and solve the LEVEL against the GROUND p70, not
 * against the mean: a tile with more shadow in it has a lower mean at the same
 * ground, so a mean target would push it to the wrong ground.
 */
async function solveTile(S, W, H, CH, outFile, p70T, brT, grT, tiltXT, tiltYT) {
  const b0 = statsRaw(S, CH, W, H);
  const tint = [1, (grT * b0.rgb[0]) / b0.rgb[1], (brT * b0.rgb[0]) / b0.rgb[2]];
  let G = p70T / b0.p70, p = 0, q = 0;
  const t00 = statsRaw(grade(S, CH, W, H, tint, G, 0, 0), CH, W, H);
  const tP = statsRaw(grade(S, CH, W, H, tint, G, 0.2, 0), CH, W, H);
  const tQ = statsRaw(grade(S, CH, W, H, tint, G, 0, 0.2), CH, W, H);
  const Kx = (tP.tiltX - t00.tiltX) / 0.2 || 1, Ky = (tQ.tiltY - t00.tiltY) / 0.2 || 1;
  let m = null, png = null;
  for (let pass = 0; pass < SOLVE_PASSES; pass++) {
    png = await writeTile(grade(S, CH, W, H, tint, G, p, q), W, H, CH, outFile);
    m = await statsOf(outFile);
    if (pass === SOLVE_PASSES - 1) break;
    G *= p70T / m.p70;
    tint[2] *= brT / m.br;
    tint[1] *= grT / m.gr;
    p += (tiltXT - m.tiltX) / Kx;
    q += (tiltYT - m.tiltY) / Ky;
  }
  m.png = png;
  return m;
}

// ==========================================================================
// FLATTENING THE TEMPLATE BEFORE IT IS LAID IN THE LATTICE
//
// The first build of this script bombed the RAW slot 2 and came back with
// straight horizontal bands right across every candidate. The cause is not the
// bomb: slot 2 carries tiltY +21.6 and tiltX +21.5, so laid in the lattice it
// steps by ~40 luma at every row boundary, and a 460 px disc is big enough to
// carry that step whole. Discs land at random phases, so the plate ends up
// full of straight horizontal edges -- exactly the artefact LESSONS section 4
// describes, arriving by a different door.
//
// So the ramp comes OUT of the template before the lattice is built. Not by
// divide-by-blur -- LESSONS section 2 is explicit that a blur denominator is
// poisoned by the dark diamond corners and returns a bright rim -- but by
// fitting a 2D polynomial to the luma over the OPAQUE pixels only and dividing
// that out. No blur, no contaminated denominator. The degree is a knob: too low
// leaves the dome, too high starts eating the crater shading, which is the tile's
// character. Both are measured (tilt and rim-interior step) before a choice.
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
    for (let r = 0; r < n; r++) { if (r === i) continue; const f = M[r][i]; if (f === 0) continue; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]; }
  }
  return M.map((row) => row[n]);
}
function polyTerms(deg) {
  const t = [];
  for (let d = 0; d <= deg; d++) for (let i = 0; i <= d; i++) t.push([i, d - i]);
  return t;
}
async function flattenTile(buf, deg, gainClamp) {
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = r.info;
  const T = polyTerms(deg), NT = T.length;
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const A = Array.from({ length: NT }, () => new Float64Array(NT));
  const bb = new Float64Array(NT);
  const basis = new Float64Array(NT);
  let sumL = 0, nL = 0;
  const fill = (x, y) => {
    const nx = (x - cx) / cx, ny = (y - cy) / cy;
    for (let k = 0; k < NT; k++) basis[k] = Math.pow(nx, T[k][0]) * Math.pow(ny, T[k][1]);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (r.data[i + 3] < 250) continue;
    const L = L709(r.data[i], r.data[i + 1], r.data[i + 2]);
    fill(x, y);
    for (let a = 0; a < NT; a++) { bb[a] += basis[a] * L; for (let b2 = a; b2 < NT; b2++) A[a][b2] += basis[a] * basis[b2]; }
    sumL += L; nL++;
  }
  for (let a = 0; a < NT; a++) for (let b2 = 0; b2 < a; b2++) A[a][b2] = A[b2][a];
  const coef = solveLin(A.map((row) => Array.from(row)), Array.from(bb));
  const meanL = sumL / nL;
  const CL = gainClamp || 0.45;
  const out = Buffer.from(r.data);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (out[i + 3] < 1) continue;
    fill(x, y);
    let p = 0;
    for (let k = 0; k < NT; k++) p += coef[k] * basis[k];
    let g = p > 1 ? meanL / p : 1;
    if (g < 1 - CL) g = 1 - CL; if (g > 1 + CL) g = 1 + CL;
    for (let c = 0; c < 3; c++) { const v = out[i + c] * g; out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
  }
  return sharp(out, { raw: { width: w, height: h, channels: ch } }).png().toBuffer();
}
/**
 * RIM EQUALISATION -- the second half of the same problem.
 *
 * After the polynomial flatten the template still measured rim-interior -3.65:
 * its outermost few pixels are darker than its middle. Laid in the lattice that
 * is a DARK HAIRLINE along every diamond edge, and the first plate built this
 * way was visibly ruled into diagonal cells (see cand/field_d5_crop.png).
 *
 * The fix is a 1D gain on the DISTANCE FROM THE DIAMOND EDGE, not a blur: mean
 * luma is taken per one-pixel band of that distance, divided into the plateau
 * value from the tile's middle, smoothed, clamped and ramped back to 1 beyond
 * the rim. Each band averages ~1500 pixels, so it is a stable estimate of the
 * vignette and not of the content. LESSONS section 2 forbids divide-by-blur on
 * diamond-masked tiles because the dark corners poison the denominator; here
 * nothing outside the diamond is ever read, so that failure mode cannot occur.
 */
async function rimFlatten(buf, band, clamp) {
  band = band || 40; clamp = clamp || 0.12;
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = r.info;
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const dOf = (x, y) => (1 - (Math.abs(x - cx) / (w / 2) + Math.abs(y - cy) / (h / 2))) * (w / 4);
  const s = new Float64Array(band + 1), n = new Float64Array(band + 1);
  let ps = 0, pn = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (r.data[i + 3] < 250) continue;
    const L = L709(r.data[i], r.data[i + 1], r.data[i + 2]);
    const d = dOf(x, y);
    if (d < band) { const k = Math.max(0, Math.floor(d)); s[k] += L; n[k]++; } else { ps += L; pn++; }
  }
  const plateau = ps / pn;
  const gain = new Float64Array(band + 1).fill(1);
  for (let k = 0; k <= band; k++) gain[k] = n[k] > 50 ? plateau / (s[k] / n[k]) : 1;
  // smooth over 5 bands, then taper the last quarter back to 1 so there is no step
  const sm = new Float64Array(band + 1);
  for (let k = 0; k <= band; k++) {
    let a = 0, b = 0;
    for (let j = Math.max(0, k - 2); j <= Math.min(band, k + 2); j++) { a += gain[j]; b++; }
    sm[k] = Math.min(1 + clamp, Math.max(1 - clamp, a / b));
  }
  for (let k = 0; k <= band; k++) {
    const t = Math.max(0, Math.min(1, (k - band * 0.7) / (band * 0.3)));
    sm[k] = sm[k] * (1 - t) + t;
  }
  const out = Buffer.from(r.data);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (out[i + 3] < 1) continue;
    const d = dOf(x, y);
    let g = 1;
    if (d < band) {
      const k = Math.max(0, Math.min(band - 1, Math.floor(d))), f = Math.max(0, Math.min(1, d - k));
      g = sm[k] * (1 - f) + sm[k + 1] * f;
    }
    for (let c = 0; c < 3; c++) { const v = out[i + c] * g; out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
  }
  return sharp(out, { raw: { width: w, height: h, channels: ch } }).png().toBuffer();
}

/**
 * THE FIELD, BUILT BY DIRECT PIXEL MAPPING AND NOT BY COMPOSITING.
 *
 * isoField() lays antialiased diamonds over each other; where two meet, their
 * partial alphas do not add to exactly 255 and the background shows through as a
 * one-pixel line. Since the diamond is an exact fundamental domain of the iso
 * lattice, the honest construction is the inverse map: for every field pixel,
 * find which lattice cell it is in and read the tile pixel it corresponds to.
 * Every output pixel gets exactly one input pixel -- no alpha, no gap, no
 * double coverage. What remains at a cell boundary is only the CONTENT
 * mismatch, which is what rimFlatten and the bomb are for.
 */
async function latticeField(tileBuf, W, H, fw, fh) {
  const t = await sharp(tileBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const tw = t.info.width, th = t.info.height, tc = t.info.channels;
  const out = Buffer.alloc(fw * fh * 3);
  const hw = W / 2, hh = H / 2;
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const up = (x / hw + y / hh) / 2, vp = (x / hw - y / hh) / 2;
      const ru = Math.round(up), rv = Math.round(vp);
      const ccx = (ru + rv) * hw, ccy = (ru - rv) * hh;
      let tx = Math.round(x - ccx + hw), ty = Math.round(y - ccy + hh);
      if (tx < 0) tx = 0; if (tx > tw - 1) tx = tw - 1;
      if (ty < 0) ty = 0; if (ty > th - 1) ty = th - 1;
      const si = (ty * tw + tx) * tc, di = (y * fw + x) * 3;
      out[di] = t.data[si]; out[di + 1] = t.data[si + 1]; out[di + 2] = t.data[si + 2];
    }
  }
  const png = await sharp(out, { raw: { width: fw, height: fh, channels: 3 } }).png().toBuffer();
  return { png, w: fw, h: fh };
}

async function rimStep(buf) {
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = r.info;
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  let rs = 0, rn = 0, is = 0, inn = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (r.data[i + 3] < 250) continue;
    const u = Math.abs(x - cx) / (w / 2) + Math.abs(y - cy) / (h / 2);
    const d = (1 - u) * (w / 4);
    const L = L709(r.data[i], r.data[i + 1], r.data[i + 2]);
    if (d >= 1 && d <= 4) { rs += L; rn++; } else if (d >= 10 && d <= 24) { is += L; inn++; }
  }
  return (rn && inn) ? rs / rn - is / inn : 0;
}

// ==========================================================================
// the plate
// ==========================================================================
async function bombPlate(field, seed, W, H) {
  const rnd = mulberry32(seed);
  const PATCH = Number(process.env.PATCH || 460), FEATH = Math.round(Number(process.env.PATCH || 460) * 70 / 460);
  const MX = 600, MY = 400;
  const CW = W + 2 * PATCH, CH = H + 2 * PATCH;
  const mask = Buffer.alloc(PATCH * PATCH * 4);
  const R = PATCH / 2;
  for (let y = 0; y < PATCH; y++) for (let x = 0; x < PATCH; x++) {
    const d = Math.hypot(x - (PATCH - 1) / 2, y - (PATCH - 1) / 2);
    const k = Math.min(1, Math.max(0, (R - d) / FEATH));
    const i = (y * PATCH + x) * 4;
    mask[i] = 255; mask[i + 1] = 255; mask[i + 2] = 255;
    mask[i + 3] = Math.round(255 * (k * k * (3 - 2 * k)));
  }
  const maskPng = await sharp(mask, { raw: { width: PATCH, height: PATCH, channels: 4 } }).png().toBuffer();
  const layers = [];
  for (let k = 0; k < 4; k++) {
    const sx = MX + Math.floor(rnd() * (field.w - CW - 2 * MX));
    const sy = MY + Math.floor(rnd() * (field.h - CH - 2 * MY));
    layers.push({ input: await sharp(field.png).extract({ left: sx, top: sy, width: CW, height: CH }).png().toBuffer(), left: 0, top: 0 });
  }
  let dropped = 0;
  const passes = [{ step: 112, jit: 63 }, { step: 131, jit: 74 }, { step: 154, jit: 86 }, { step: 180, jit: 101 }];
  for (const pass of passes) {
    for (let gy = -2; gy * pass.step < H + PATCH; gy++) {
      for (let gx = -2; gx * pass.step < W + PATCH; gx++) {
        const sx = MX + Math.floor(rnd() * (field.w - PATCH - 2 * MX));
        const sy = MY + Math.floor(rnd() * (field.h - PATCH - 2 * MY));
        // NO flop, NO flip -- see the header. Decorrelation is positional only.
        const patch = await sharp(field.png).extract({ left: sx, top: sy, width: PATCH, height: PATCH })
          .ensureAlpha().composite([{ input: maskPng, blend: 'dest-in' }]).png().toBuffer();
        const L = Math.round(gx * pass.step + (rnd() - 0.5) * 2 * pass.jit) + PATCH;
        const T = Math.round(gy * pass.step + (rnd() - 0.5) * 2 * pass.jit) + PATCH;
        if (L + PATCH <= 0 || T + PATCH <= 0 || L >= CW || T >= CH) { dropped++; continue; }
        layers.push({ input: patch, left: Math.max(0, Math.min(CW - PATCH, L)), top: Math.max(0, Math.min(CH - PATCH, T)) });
      }
    }
  }
  const big = await sharp({ create: { width: CW, height: CH, channels: 4, background: BGA } }).composite(layers).png().toBuffer();
  const cut = await sharp(big).extract({ left: PATCH, top: PATCH, width: W, height: H }).png().toBuffer();
  const r = await sharp(cut).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let holes = 0;
  for (let p = 0; p < W * H; p++) if (r.data[p * r.info.channels + 3] < 250) holes++;
  console.log('[bomb] ' + layers.length + ' layers (' + dropped + ' outside), coverage holes ' + holes + ' px' + (holes ? '   <== NOT COVERED' : '   (fully covered)'));
  return sharp(cut).flatten({ background: BGA }).png().toBuffer();
}

function label(t, w, size, fill) {
  size = size || 13; fill = fill || '#c9d1d9';
  const esc = String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + (size + 7) + '">' +
    '<text xml:space="preserve" x="4" y="' + (size + 1) + '" font-family="monospace" font-size="' + size + '" fill="' + fill + '">' + esc + '</text></svg>');
}

// ==========================================================================
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(SRCD, { recursive: true });

  // -- FREEZE the three keepers. They are READ here and nowhere written. ----
  for (const n of [1, 2, 3]) {
    const origin = path.join(TILES, BIOME, BIOME + '_' + n + '.webp');
    const frozen = path.join(SRCD, BIOME + '_' + n + '_src.webp');
    if (!fs.existsSync(frozen)) fs.copyFileSync(origin, frozen);
    console.log('[freeze] slot ' + n + '  ' + (fs.readFileSync(frozen).equals(fs.readFileSync(origin)) ? 'MATCHES' : 'DIFFERS FROM') +
      ' src/assets/tiles/' + BIOME + '/   md5 ' + crypto.createHash('md5').update(fs.readFileSync(frozen)).digest('hex').slice(0, 12));
  }

  const keep = [1, 2, 3].map((n) => fs.readFileSync(path.join(SRCD, BIOME + '_' + n + '_src.webp')));
  const K = [];
  for (const b of keep) K.push(await statsOfBuf(b));
  const mean = (f) => K.reduce((a, s) => a + f(s), 0) / K.length;
  const TX_FAM = mean((s) => s.tiltX), TY_FAM = mean((s) => s.tiltY);
  console.log('');
  console.log('[keepers 1/2/3]  p70 ' + K.map((s) => f1(s.p70)).join(' / ') + '   sd ' + K.map((s) => f1(s.sd)).join(' / ') +
    '   tiltX ' + K.map((s) => f1(s.tiltX)).join(' / ') + '   tiltY ' + K.map((s) => f1(s.tiltY)).join(' / '));
  console.log('[targets]        p70 ' + f1(P70_T) + '   B/R ' + f3(BR_T) + '   G/R ' + f3(GR_T) +
    '   family ramp tiltX ' + f2(TX_FAM) + ' tiltY ' + f2(TY_FAM));
  console.log('');

  // -- flatten the template, then the plate --------------------------------
  const DEG = Number(process.env.DEG || 5);
  const plateFile = path.join(OUT, 'plate_d' + DEG + '_p' + (process.env.PATCH || 460) + '.png');
  if (!fs.existsSync(plateFile) || process.env.FORCE === '1') {
    const tplRaw = fs.readFileSync(path.join(SRCD, BIOME + '_' + TEMPLATE + '_src.webp'));
    const s0 = await statsOfBuf(tplRaw);
    const tplP = await flattenTile(tplRaw, DEG);
    const tpl = await rimFlatten(tplP);
    const s1 = await statsOfBuf(tpl);
    fs.writeFileSync(path.join(OUT, 'template_flat_d' + DEG + '.png'), tpl);
    console.log('[flatten] slot ' + TEMPLATE + ' deg ' + DEG +
      '   tiltX ' + f1(s0.tiltX) + ' -> ' + f1(s1.tiltX) +
      '   tiltY ' + f1(s0.tiltY) + ' -> ' + f1(s1.tiltY) +
      '   rim-int ' + f2(await rimStep(tplRaw)) + ' -> ' + f2(await rimStep(tplP)) + ' -> ' + f2(await rimStep(tpl)) +
      '   sd ' + f1(s0.sd) + ' -> ' + f1(s1.sd) + '   micro ' + f2(await microContrast(tplRaw)) + ' -> ' + f2(await microContrast(tpl)));
    const F = await latticeField(tpl, TILE_W, TILE_H, 5376, 3200);
    console.log('[field] flattened slot ' + TEMPLATE + ' mapped into the iso lattice: ' + F.w + 'x' + F.h);
    fs.writeFileSync(path.join(OUT, 'field_d' + DEG + '_crop.png'),
      await sharp(F.png).extract({ left: 1200, top: 900, width: 1024, height: 640 }).png().toBuffer());
    fs.writeFileSync(plateFile, await bombPlate(F, BOMB_SEED, PW, PH));
    console.log('[plate] ' + PW + 'x' + PH + ', window ' + TILE_W + 'x' + TILE_H + ' = ' +
      (100 * (TILE_W * TILE_H) / (PW * PH)).toFixed(0) + '% of it by area, seed ' + BOMB_SEED +
      ', patch ' + (process.env.PATCH || 460));
  } else console.log('[plate] exists, kept');
  const plate = fs.readFileSync(plateFile);
  console.log('');

  // -- candidate windows x ramp variants -----------------------------------
  const MARG = 16;
  const WINS = [
    { id: 'C', ox: (PW - TILE_W) / 2, oy: (PH - TILE_H) / 2 },
    { id: 'TL', ox: MARG, oy: MARG },
    { id: 'BR', ox: PW - TILE_W - MARG, oy: PH - TILE_H - MARG },
    { id: 'TR', ox: PW - TILE_W - MARG, oy: MARG },
    { id: 'BL', ox: MARG, oy: PH - TILE_H - MARG },
  ];
  const RAMPS = [
    { id: 'F', tx: TX_FAM, ty: TY_FAM, note: 'family ramp' },
    { id: '0', tx: 0, ty: 0, note: 'no ramp' },
  ];

  const rows = [];
  for (const W of WINS) for (const R of RAMPS) {
    const tag = W.id + '-' + R.id;
    const cw = await cutWindow(plate, W.ox, W.oy);
    const file = path.join(OUT, 'slot0_d' + DEG + 'p' + (process.env.PATCH || 460) + '_' + tag + '.webp');
    const m = await solveTile(cw.data, cw.info.width, cw.info.height, cw.info.channels, file, P70_T, BR_T, GR_T, R.tx, R.ty);
    const buf = fs.readFileSync(file);
    m.micro = await microContrast(await sharp(buf).resize(64, 32, { fit: 'fill' }).webp(WEBP).toBuffer());
    // cross-correlation against the three keepers, plain and high-pass
    m.ncc = [];
    for (let i = 0; i < 3; i++) m.ncc.push({ plain: await nccAll(buf, keep[i]), hp: await nccAllHP(buf, keep[i], 16) });
    m.seam = (await seamOf([buf, keep[0], keep[1], keep[2]])).bs;
    rows.push({ tag, W, R, m, buf, file });
    console.log('[' + tag.padEnd(5) + '] p70 ' + f1(m.p70) + '  mean ' + f1(m.mean) + '  B/R ' + f3(m.br) + '  G/R ' + f3(m.gr) +
      '  sat ' + f1(100 * m.sat) + '%  blow ' + f1(100 * m.blow) + '%  clip ' + f2(100 * m.clip) + '%  sd ' + f1(m.sd) +
      '  micro8 ' + f2(m.micro) + '  tilt ' + f1(m.tiltX) + '/' + f1(m.tiltY) +
      '  NCCmax(hp) ' + f3(Math.max(...m.ncc.map((x) => Math.max(...Object.values(x.hp).map(Math.abs))))) +
      '  seam ' + f3(m.seam.ratio));
  }

  // -- reference seams ------------------------------------------------------
  const oldSlot0 = fs.readFileSync(path.join(TILES, BIOME, BIOME + '_0.webp'));
  const seamOld = (await seamOf([oldSlot0, keep[0], keep[1], keep[2]])).bs;
  const seamKeep = (await seamOf(keep)).bs;
  console.log('');
  console.log('[seam] shipped set (old slot 0 + 1/2/3)  step ' + f2(seamOld.step) + '  rough ' + f2(seamOld.rough) + '  ratio ' + f3(seamOld.ratio));
  console.log('[seam] the three keepers alone          step ' + f2(seamKeep.step) + '  rough ' + f2(seamKeep.rough) + '  ratio ' + f3(seamKeep.ratio));

  // -- contact sheet --------------------------------------------------------
  const cells = [];
  let y = 0;
  for (const r of rows) {
    const img = await sharp(r.buf).flatten({ background: BGA }).png().toBuffer();
    cells.push({ input: img, left: 0, top: y });
    cells.push({ input: label(r.tag + '  p70 ' + f1(r.m.p70) + '  sd ' + f1(r.m.sd) + '  seam ' + f3(r.m.seam.ratio) +
      '  nccHP ' + f3(Math.max(...r.m.ncc.map((x) => Math.max(...Object.values(x.hp).map(Math.abs))))), 520, 14, '#ffd166'), left: 4, top: y + 234 });
    y += 262;
  }
  await sharp({ create: { width: 520, height: y, channels: 4, background: BGA } }).composite(cells).png()
    .toFile(path.join(WORK, 'CAND_sheet_d' + DEG + 'p' + (process.env.PATCH || 460) + '.png'));
  console.log('');
  console.log('sheet -> ' + path.join(WORK, 'CAND_sheet_d' + DEG + 'p' + (process.env.PATCH || 460) + '.png'));
  fs.writeFileSync(path.join(WORK, 'CAND_numbers_d' + DEG + 'p' + (process.env.PATCH || 460) + '.json'), JSON.stringify(rows.map((r) => ({
    tag: r.tag, p70: r.m.p70, mean: r.m.mean, br: r.m.br, gr: r.m.gr, sat: r.m.sat, blow: r.m.blow,
    sd: r.m.sd, micro: r.m.micro, tiltX: r.m.tiltX, tiltY: r.m.tiltY, seam: r.m.seam, ncc: r.m.ncc,
  })), null, 2));
  console.log('done');
})();
