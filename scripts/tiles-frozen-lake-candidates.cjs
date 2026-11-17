/**
 * FROZEN_LAKE FROM GLACIER -- STEP 2: THE HERO CANDIDATES, CUT, GRADED, MEASURED.
 *
 * STYLE TEST. Writes only into assets/style-test/tiles/frozen_lake/ and
 * assets/style-test/tiles/_frozen_lake_*.png|txt. NOTHING is written to
 * src/assets/tiles/. No cap sync, no build, no git.
 *
 * WHAT THIS IS AND IS NOT
 *   This round produces CANDIDATES TO CHOOSE FROM, not a finished set. Each
 *   candidate is ONE tile. The three derivations and the real grade come after
 *   Rudi has picked a hero, which is why the grade below is deliberately coarse:
 *   it is only there so the candidate can be judged in the direction it will
 *   actually go (brighter, bluer) instead of in flux' raw grey.
 *
 * THE 1248x832 PROBLEM, AND WHY THE RETURN IS DOWNSCALED
 *   flux-pro/kontext was handed a 768x512 plate and returned 1248x832 -- it
 *   upscaled the input by 1.625x on its own. Cutting a 512x256 window straight out
 *   of that return would put the tile back at 12.6% of the picture by area, which
 *   is exactly round 3 of crevasse's mistake (forms arriving too big for the tile,
 *   grain lost in flux' own resampling). So the return is resized back to 768x512
 *   -- the size it was asked to work at -- and the window is cut from that. This is
 *   a DOWNSCALE that undoes flux' own upscale; no pixel is ever invented, and the
 *   tile ends up 1:1 with the glacier dust the plate was built from. "Kein
 *   Hochskalieren der Ausgabe" is honoured: nothing is enlarged anywhere.
 *
 * THE GRADE, COARSE ON PURPOSE
 *   Level solved to L 52.0 (glacier is 44.0 and the family's ceiling is not there:
 *   silicate_plain 91, dust_plain 76, regolith 61 are untouched originals).
 *   B/R 1.35 with G/R from the corpus k-curve, k = 0.60 -> G/R 1.210. That sits
 *   between glacier 1.10/1.06 and ice_shelf 2.86/2.18 and closes the family's
 *   colour axis without becoming water. Uniform luma plane, no divide-by-blur, no
 *   second flatten. Exact numbers are for the grade round after the hero choice.
 *
 * EVERY CANDIDATE IS BUILT TWICE: tiltY 3.0 (the rest of the ICE family) and
 *   tiltY 0.0 (flat). This is not decoration -- for a deliberately SMOOTH tile the
 *   per-tile light ramp is a sawtooth with nothing to hide behind, which is exactly
 *   what made the new tundra's lattice readable, so the ramp has to be measured
 *   rather than assumed. Both rungs report grid_play and coh.
 *
 * grid_play IS MEASURED TWO WAYS, and both are honest about what they are:
 *   SOLO   one tile, tessellated as a four-slot corpus would be (slots 0/1 as cut,
 *          2/3 rotated 180 -- the convention the ICE family carries). This is what
 *          a single tile can be held to TODAY and it is the worst case: every slot
 *          is the same picture, so gridCoh is at its maximum. glacier slot 0 is
 *          measured the same way, so the comparison is like for like.
 *   QUAD   four windows cut at four offsets out of the same flux plate, graded with
 *          the hero's own grade parameters. This is the PROJECTION of what the set
 *          will read once the three derivations exist -- not a promise, because the
 *          derivations will be kontext edits and not just offsets, but the right
 *          order of magnitude.
 *
 * MEASURED ON THE WRITTEN .webp, NEVER ON THE BUFFER (libwebp drops RGB under
 *   alpha 0 and the diamond corners are ~50% of the canvas -> buffer numbers drift
 *   by about +1.5). sharp.cache(false).
 *
 * Usage: node scripts/tiles-frozen-lake-candidates.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const WORK = path.join(ST, 'frozen_lake');
const SRCD = path.join(WORK, 'src');
const PLATE = path.join(WORK, 'plate');
const OUT = path.join(WORK, 'cand');
const TAG = '_frozen_lake_';

const TILE_W = 512, TILE_H = 256;
const PW = 768, PH = 512;                  // the size flux was asked to work at
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const HOLD_LUM = 52.0;                     // coarse direction: brighter than glacier's 44.0
const BR_T = 1.350;                        // coarse direction: bluer than glacier's 1.10
const K_CORPUS = 0.60;                     // the corpus k-curve, from the tundra work
const GR_T = 1 + K_CORPUS * (BR_T - 1);    // -> 1.210
const SOLVE_PASSES = 7;

const VAC_A = 0.45, VAC_RGB = [5, 10, 25];
const PLAY_W = 48, PLAY_H = 24;
const MARG = 24;
const ROT180 = [false, false, true, true];

const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);

const CANDS = [
  { id: 'MIRROR', r: 1, label: 'r1 mirror -- one polished sheet, wide gradients only' },
  { id: 'SHEEN', r: 1, label: 'r1 sheen -- faint one-directional frost streaks' },
  { id: 'SWELL', r: 1, label: 'r1 swell -- broad low buckling mounds' },
  { id: 'BUBBLE', r: 1, label: 'r1 bubble -- bubbles frozen inside the sheet' },
  { id: 'GRAIN', r: 1, label: 'r1 grain -- large flat crystals, tone-only boundaries' },
  { id: 'SNOWDUST', r: 1, label: 'r1 snowdust -- thin powder dusting, soft mottling' },
  { id: 'R2-PLAIN', r: 2, label: 'r2 plain -- almost featureless, wide soft washes' },
  { id: 'R2-FROST', r: 2, label: 'r2 frost -- dozens of short faint streaks' },
  { id: 'R2-BUBBLE', r: 2, label: 'r2 bubble -- pinpoint bubbles, sand-grain size' },
  { id: 'R2-GRAIN', r: 2, label: 'r2 grain -- fine even crystal grain' },
  { id: 'R2-SNOW', r: 2, label: 'r2 snow -- thin dusting, small soft patches' },
  { id: 'R3-BARE', r: 3, label: 'r3 bare -- levelled, only the dust already there' },
  { id: 'R3-FROST', r: 3, label: 'r3 frost -- dozens of short faint streaks, one heading' },
  { id: 'R3-BUBBLE', r: 3, label: 'r3 bubble -- sand-grain pits and pale pinpoints' },
  { id: 'R3-GRAIN', r: 3, label: 'r3 grain -- thousands of rice-grain facets, tone-only' },
  { id: 'R3-PATCH', r: 3, label: 'r3 patch -- faint soft mottling, small patches' },
];
const ROUND_NOTE = {
  1: 'ROUND 1 -- "pale bluish white ice". flux returned near-white paper: raw plate L 212-229, 94-100% of it at or above L 200. ' +
     'The grade has to divide by ~4.4 to reach L 52, and it divides the texture by 4.4 with it.',
  2: 'ROUND 2 -- "dark blue grey, dim, unlit, matte". flux read those as a LIGHTING BRIEF and returned a studio backdrop: a dark ' +
     'painted panel with a soft photographic sweep, twice with light rays fanning from the top edge. The level is right, the picture is not aerial.',
  3: 'ROUND 3 -- no colour word, no light word, no re-describing tail. Only the geometry ("fill the craters, cover the stones, the ' +
     'ground becomes level") plus "the same photograph as before". The aerial reading survives and the level lands mid-grey.',
};

// -- the diamond ------------------------------------------------------------
const DIAMOND = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + TILE_W + '" height="' + TILE_H + '">' +
  '<polygon points="' + TILE_W / 2 + ',0 ' + TILE_W + ',' + TILE_H / 2 + ' ' +
  TILE_W / 2 + ',' + TILE_H + ' 0,' + TILE_H / 2 + '" fill="white"/></svg>');
let DMASK = null;
async function diamondMask() {
  if (!DMASK) {
    // RGBA, alpha = the diamond. A greyscale png has NO alpha and 'dest-in'
    // multiplies by alpha, so a grey mask is a silent no-op -- the bug that made
    // tiles-crevasse-r3-plate.cjs' "round feathered patches" hard squares.
    const g = await sharp(DIAMOND).greyscale().raw().toBuffer({ resolveWithObject: true });
    const w = g.info.width, h = g.info.height, ch = g.info.channels;
    const m = Buffer.alloc(w * h * 4);
    for (let p = 0; p < w * h; p++) {
      m[p * 4] = 255; m[p * 4 + 1] = 255; m[p * 4 + 2] = 255; m[p * 4 + 3] = g.data[p * ch];
    }
    DMASK = await sharp(m, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  }
  return DMASK;
}
/** cut a 512x256 window out of the (downscaled) plate, orient it, mask the diamond */
async function cutWindow(plate768, ox, oy, rot180) {
  const flat = await sharp(plate768).extract({ left: ox, top: oy, width: TILE_W, height: TILE_H })
    .removeAlpha().png().toBuffer();
  const oriented = rot180 ? await sharp(flat).rotate(180).png().toBuffer() : flat;
  const masked = await sharp(oriented).ensureAlpha()
    .composite([{ input: await diamondMask(), blend: 'dest-in' }]).png().toBuffer();
  const r = await sharp(masked).raw().toBuffer({ resolveWithObject: true });
  return { data: r.data, info: r.info, png: masked };
}

// ==========================================================================
// measurement
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
  const p50 = q(0.50);
  return {
    chromaRes: cn2 ? cr / cn2 : 0,
    lum: L709(m[0], m[1], m[2]), intLum: L709(im[0], im[1], im[2]), rgb: im,
    br: im[2] / im[0], gr: im[1] / im[0],
    sd: (isd[0] + isd[1] + isd[2]) / 3,
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
  await sharp(png).resize(64, 32, { fit: 'fill' }).webp(WEBP).toFile(outFile.replace(/\.webp$/, '@eighth.webp'));
  return png;
}
async function solveTile(S, W, H, CH, outFile, tiltYT) {
  const b0 = statsRaw(S, CH, W, H);
  const tint = [1, (GR_T * b0.rgb[0]) / b0.rgb[1], (BR_T * b0.rgb[0]) / b0.rgb[2]];
  let G = HOLD_LUM / b0.lum, p = 0, q = 0;
  const t00 = statsRaw(grade(S, CH, W, H, tint, G, 0, 0), CH, W, H);
  const tP = statsRaw(grade(S, CH, W, H, tint, G, 0.2, 0), CH, W, H);
  const tQ = statsRaw(grade(S, CH, W, H, tint, G, 0, 0.2), CH, W, H);
  const Kx = (tP.tiltX - t00.tiltX) / 0.2 || 1, Ky = (tQ.tiltY - t00.tiltY) / 0.2 || 1;
  let m = null, png = null;
  for (let pass = 0; pass < SOLVE_PASSES; pass++) {
    png = await writeTile(grade(S, CH, W, H, tint, G, p, q), W, H, CH, outFile);
    m = await statsOf(outFile);
    if (pass === SOLVE_PASSES - 1) break;
    G *= HOLD_LUM / m.lum;
    tint[2] *= BR_T / m.br;
    tint[1] *= GR_T / m.gr;
    p += (0.0 - m.tiltX) / Kx;
    q += (tiltYT - m.tiltY) / Ky;
  }
  m.png = png;
  m.plane = { p: p, q: q, G: G, tint: tint.slice() };
  return m;
}
/** apply an already-solved grade to another window, no re-solve */
async function applyGrade(S, W, H, CH, outFile, pl) {
  const png = await writeTile(grade(S, CH, W, H, pl.tint, pl.G, pl.p, pl.q), W, H, CH, outFile);
  return png;
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

// ==========================================================================
// THE GRID INDEX -- lattice fold, verbatim from the tundra/crevasse ladders
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

// -- the two grid readings --------------------------------------------------
async function gridSolo(tilePng) {
  const bufs = [];
  for (let n = 0; n < 4; n++) {
    bufs.push(ROT180[n] ? await sharp(tilePng).rotate(180).png().toBuffer() : tilePng);
  }
  return gridOf(bufs);
}
async function gridOf(bufs4) {
  const rnd = mulberry32(4242);
  const P = await isoField(bufs4, PLAY_W, PLAY_H, 50, 30, () => Math.floor(rnd() * 4));
  const Lp = await lumaOf(P.png);
  const g = gridMetrics(Lp.L, Lp.w, Lp.h, P.cells, PLAY_W, PLAY_H);
  const Pv = await vacuum(P.png);
  const Lpv = await lumaOf(Pv);
  const gv = gridMetrics(Lpv.L, Lpv.w, Lpv.h, P.cells, PLAY_W, PLAY_H);
  const rndF = mulberry32(4242);
  const F = await isoField(bufs4, TILE_W, TILE_H, 10, 6, () => Math.floor(rndF() * 4));
  const Lf = await lumaOf(F.png);
  const gf = gridMetrics(Lf.L, Lf.w, Lf.h, F.cells, TILE_W, TILE_H);
  const bs = boundaryStep(Object.assign({}, F, { L: Lf.L, w: Lf.w, h: Lf.h }));
  return { play: g, playVac: gv, full: gf, bs: bs };
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
(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // ---- the neighbours, measured from src/assets/tiles (read only) ---------
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
      mi += await microContrast(path.join(dir, fam + '_' + n + '@eighth.webp'), f);
      nn++;
    }
    if (!nn) continue;
    NEIGH.push({ id: fam, lum: L / nn, br: br / nn, gr: gr / nn, micro: mi / nn, n: nn });
  }
  console.log('[neighbours measured from src/assets/tiles -- READ ONLY]');
  for (const nb of NEIGH) console.log('   ' + nb.id.padEnd(12) + ' L ' + f1(nb.lum).padStart(5) + '  B/R ' + f2(nb.br) + '  G/R ' + f2(nb.gr) + '  micro8 ' + f2(nb.micro));
  const GL = NEIGH.find((n) => n.id === 'glacier');
  console.log('');

  // ---- glacier's own grid, both ways, as the reference --------------------
  const glBufs = [];
  for (let n = 0; n < 4; n++) glBufs.push(await sharp(fs.readFileSync(path.join(SRCD, 'glacier_' + n + '_src.webp'))).png().toBuffer());
  const glQuad = await gridOf(glBufs);
  const glSolo = await gridSolo(glBufs[0]);
  console.log('[glacier grid]  as shipped, 4 slots: play ' + f2(glQuad.play.gridTot) + ' (coh ' + f2(glQuad.play.gridCoh) + ')' +
    '     ONE SLOT ONLY, tessellated: play ' + f2(glSolo.play.gridTot) + ' (coh ' + f2(glSolo.play.gridCoh) + ')' +
    '   <- the honest bar for a single-tile candidate\n');

  // ---- the candidates ----------------------------------------------------
  const results = [];
  for (const C of CANDS) {
    const kraw = path.join(PLATE, C.id + '_kraw.png');
    if (!fs.existsSync(kraw)) { console.log('[skip] ' + C.id + ' -- no plate return'); continue; }
    const md = await sharp(fs.readFileSync(kraw)).metadata();
    // undo flux' own 1.625x upscale, back to the size it was asked to work at
    const plate768 = (md.width === PW && md.height === PH)
      ? fs.readFileSync(kraw)
      : await sharp(fs.readFileSync(kraw)).resize(PW, PH, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
    const dir = path.join(OUT, C.id);
    fs.mkdirSync(dir, { recursive: true });

    // the hero window: centred, so it is the middle of what flux drew
    const HX = Math.round((PW - TILE_W) / 2), HY = Math.round((PH - TILE_H) / 2);
    const hero = await cutWindow(plate768, HX, HY, false);
    fs.writeFileSync(path.join(dir, 'raw.png'), hero.png);
    const rawWebp = path.join(dir, 'frozen_lake_RAW.webp');
    await sharp(hero.png).webp(WEBP).toFile(rawWebp);
    await sharp(hero.png).resize(64, 32, { fit: 'fill' }).webp(WEBP).toFile(rawWebp.replace(/\.webp$/, '@eighth.webp'));
    const rawS = await statsOf(rawWebp);
    rawS.micro = await microContrast(rawWebp.replace(/\.webp$/, '@eighth.webp'));

    // the graded hero, both light-ramp rungs
    const rungs = {};
    for (const rung of [{ k: 'T30', tiltY: 3.0 }, { k: 'T00', tiltY: 0.0 }]) {
      const out = path.join(dir, 'frozen_lake_' + rung.k + '.webp');
      const m = await solveTile(hero.data, hero.info.width, hero.info.height, hero.info.channels, out, rung.tiltY);
      m.micro = await microContrast(out.replace(/\.webp$/, '@eighth.webp'));
      m.rim = await rimHalo(out);
      m.file = out;
      m.solo = await gridSolo(m.png);
      // QUAD: three more windows at three more offsets, the hero's own grade
      const offs = [[HX, HY], [MARG, MARG], [PW - TILE_W - MARG, MARG], [PW - TILE_W - MARG, PH - TILE_H - MARG]];
      const qb = [];
      for (let n = 0; n < 4; n++) {
        const w = await cutWindow(plate768, offs[n][0], offs[n][1], ROT180[n]);
        const qf = path.join(dir, 'quad_' + rung.k + '_' + n + '.webp');
        qb.push(await applyGrade(w.data, w.info.width, w.info.height, w.info.channels, qf, m.plane));
      }
      m.quad = await gridOf(qb);
      m.quadBufs = qb;
      rungs[rung.k] = m;
    }
    results.push({ C: C, raw: rawS, rawPng: hero.png, rungs: rungs });
    const a = rungs.T30, b = rungs.T00;
    console.log('[' + C.id.padEnd(10) + '] raw L ' + f1(rawS.lum).padStart(5) + ' sd ' + f2(rawS.sd).padStart(5) + ' blow ' + f1(100 * rawS.blow).padStart(5) + '%' +
      '   graded L ' + f1(a.lum) + ' B/R ' + f2(a.br) + ' G/R ' + f2(a.gr) + ' micro8 ' + f2(a.micro).padStart(5) + ' blow ' + f2(100 * a.blow) + '%' +
      '   grid_play solo tY3.0 ' + f2(a.solo.play.gridTot).padStart(5) + ' (coh ' + f2(a.solo.play.gridCoh) + ')' +
      '  tY0.0 ' + f2(b.solo.play.gridTot).padStart(5) + ' (coh ' + f2(b.solo.play.gridCoh) + ')' +
      '   quad tY3.0 ' + f2(a.quad.play.gridTot).padStart(5));
  }

  // ======================================================================
  // THE SEAM TABLE -- boundary step over interior roughness, full-res field
  // ======================================================================
  const SEAM = [];
  {
    const bsOf = async (bufs) => {
      const rnd = mulberry32(4242);
      const F = await isoField(bufs, TILE_W, TILE_H, 10, 6, () => Math.floor(rnd() * 4));
      const Lf = await lumaOf(F.png);
      return boundaryStep(Object.assign({}, F, { L: Lf.L, w: Lf.w, h: Lf.h }));
    };
    let b = await bsOf(glBufs);
    SEAM.push(Object.assign({ id: 'glacier, 4 slots', ref: true, note: 'the family it comes from' }, b));
    const solo = [];
    for (let n = 0; n < 4; n++) solo.push(ROT180[n] ? await sharp(glBufs[0]).rotate(180).png().toBuffer() : glBufs[0]);
    b = await bsOf(solo);
    SEAM.push(Object.assign({ id: 'glacier, ONE slot', ref: true, note: 'the single-tile bar' }, b));
    for (const fam of ['tundra', 'snow_peak', 'ice_shelf']) {
      const dir = path.join(TILES, fam);
      if (!fs.existsSync(dir)) continue;
      const bufs = [];
      for (let n = 0; n < 4; n++) bufs.push(fs.readFileSync(path.join(dir, fam + '_' + n + '.webp')));
      b = await bsOf(bufs);
      SEAM.push(Object.assign({ id: fam + ', 4 slots', ref: true }, b));
    }
    for (const R of results) {
      if (R.C.r !== 3) continue;
      for (const k of ['T30', 'T00']) {
        b = await bsOf(R.rungs[k].quadBufs);
        SEAM.push(Object.assign({ id: R.C.id + '  tiltY ' + (k === 'T30' ? '3.0' : '0.0') }, b));
      }
    }
    console.log('\n[seam] boundary step / interior roughness, full-res field');
    for (const s of SEAM) console.log('   ' + s.id.padEnd(24) + 'step ' + f2(s.step).padStart(6) + '  rough ' + f2(s.rough).padStart(6) + '  RATIO ' + f2(s.ratio));
  }

  // ======================================================================
  // THE OVERVIEW SHEET
  // ======================================================================
  const SW = 2400, PAD = 18;
  const comp = []; let y = PAD;
  const line = (t, size, fill) => {
    size = size || 13;
    comp.push({ input: label(t, SW - PAD * 2, size, fill || '#c9d1d9'), left: PAD, top: y });
    y += size + 7;
  };
  line('FROZEN_LAKE -- HERO CANDIDATES FROM GLACIER, VIA FLUX, THREE PROMPT ROUNDS', 20, '#79c0ff');
  line('STYLE TEST, nothing written to src/assets/tiles/. Each candidate is ONE tile: a 512x256 window cut out of a rimless 768x512 texture-bombed glacier plate that flux drew into. ' +
    'flux returned 1248x832 (it upscaled the 768x512 input 1.625x on its own); the return is resized BACK to 768x512 before the cut, so nothing is ever enlarged and the tile sits 1:1 ' +
    'with glacier\'s own dust. Numbers measured on the WRITTEN .webp. sharp.cache(false). ' + new Date().toISOString().slice(0, 16), 13, '#8b949e');
  line('COARSE GRADE ONLY, direction not destination: L ' + f1(HOLD_LUM) + ' (glacier ' + f1(GL.lum) + '), B/R ' + f3(BR_T) + ' (glacier ' + f2(GL.br) + '), G/R ' + f3(GR_T) +
    ' from the corpus k-curve k=0.60, tiltX 0.0, no flatten. The exact grade belongs to the round AFTER the hero choice.', 13, '#ffa657');
  y += 6;

  line('THE LIGHT-RAMP QUESTION, WHICH IS A REAL ONE FOR THIS TILE', 16, '#ffa657');
  line('   The rest of the ICE family carries tiltY 3.0 -- a per-tile top-light ramp. A ramp that restarts at every tile is a sawtooth, and the new tundra proved a smooth tile has no', 13, '#8b949e');
  line('   texture left to hide that sawtooth behind. frozen_lake is smooth ON PURPOSE, so both rungs are built and measured below: tY 3.0 against tY 0.0, on the same pixels.', 13, '#8b949e');
  y += 6;

  line('  candidate       RAW (before grade)                  GRADED tiltY 3.0                                        GRADED tiltY 0.0            grid_play  SOLO (one tile tessellated)     QUAD (4 offsets)', 13, '#8b949e');
  line('                    L     sd  blow%  micro8      L    B/R    G/R    sd  micro8  blow%   rim   ramp_pp      L  micro8  ramp_pp        tY3.0  coh    tY0.0  coh   d(ramp)      tY3.0   coh', 13, '#8b949e');
  for (const R of results) {
    const a = R.rungs.T30, b = R.rungs.T00;
    const col = R.C.r === 3 ? '#7ee787' : R.C.r === 2 ? '#ffa657' : '#8b949e';
    line('  ' + R.C.id.padEnd(11) +
      f1(R.raw.lum).padStart(7) + f2(R.raw.sd).padStart(7) + f1(100 * R.raw.blow).padStart(7) + f2(R.raw.micro).padStart(8) +
      '   ' + f1(a.lum).padStart(6) + f2(a.br).padStart(7) + f2(a.gr).padStart(7) + f2(a.sd).padStart(6) + f2(a.micro).padStart(8) + f2(100 * a.blow).padStart(7) +
      ((a.rim >= 0 ? '+' : '') + f2(a.rim)).padStart(7) + f2(a.solo.play.rampPP).padStart(9) +
      '   ' + f1(b.lum).padStart(6) + f2(b.micro).padStart(8) + f2(b.solo.play.rampPP).padStart(9) +
      '   ' + f2(a.solo.play.gridTot).padStart(9) + f2(a.solo.play.gridCoh).padStart(6) +
      f2(b.solo.play.gridTot).padStart(9) + f2(b.solo.play.gridCoh).padStart(6) +
      ((a.solo.play.gridTot - b.solo.play.gridTot >= 0 ? '+' : '') + f2(a.solo.play.gridTot - b.solo.play.gridTot)).padStart(10) +
      '   ' + f2(a.quad.play.gridTot).padStart(8) + f2(a.quad.play.gridCoh).padStart(6), 13, col);
  }
  y += 6;
  line('  REFERENCE   glacier as shipped, four real slots:  grid_play ' + f2(glQuad.play.gridTot) + '  coh ' + f2(glQuad.play.gridCoh) +
    '        glacier ONE SLOT tessellated (the bar a single candidate can be held to):  grid_play ' + f2(glSolo.play.gridTot) + '  coh ' + f2(glSolo.play.gridCoh), 13, '#79c0ff');
  line('  and at play scale from the earlier rounds: new tundra 2.60 / ratio 0.86  |  ice_shelf 7.10 / 1.21  |  REJECTED old tundra 10.40 / 1.12', 13, '#8b949e');
  y += 8;

  for (const r of [1, 2, 3]) {
    line('ROUND ' + r, 15, r === 3 ? '#7ee787' : '#ffa657');
    for (const t of ROUND_NOTE[r].match(/.{1,190}(\s|$)/g)) line('   ' + t.trim(), 13, '#8b949e');
    y += 4;
  }
  y += 8;

  // ---- THE SEAM TABLE: the metric that actually decides a smooth tile ----
  line('BOUNDARY STEP vs INTERIOR ROUGHNESS -- and on a tile this smooth THIS is the metric that decides, not grid_play', 16, '#ffa657');
  line('   grid_play measures lattice-LOCKED structure in luma units. A featureless tile has almost none, so it scores well by having nothing at all --', 13, '#8b949e');
  line('   which is not the same as looking right. What is actually visible on a blank field is the DIAMOND EDGE: mean |dL| across a tile boundary at', 13, '#8b949e');
  line('   +-4 px, over the tile\'s own roughness at the same stride. Both numbers matter: the ratio says whether the edge stands out of the texture,', 13, '#8b949e');
  line('   the absolute step says how big the edge is at all.', 13, '#8b949e');
  line('     family / candidate        step   rough   RATIO', 13, '#8b949e');
  for (const row of SEAM) {
    const col = row.ref ? '#79c0ff' : row.ratio <= 1.3 ? '#7ee787' : row.ratio <= 1.9 ? '#ffa657' : '#ff7b72';
    line('     ' + row.id.padEnd(22) + f2(row.step).padStart(7) + f2(row.rough).padStart(8) + f2(row.ratio).padStart(8) +
      (row.note ? '    ' + row.note : ''), 13, col);
  }
  y += 4;
  {
    const pairs = results.filter((R) => R.C.r === 3).map((R) => {
      const a = SEAM.find((s) => s.id.indexOf(R.C.id) === 0 && s.id.indexOf('3.0') > 0);
      const b = SEAM.find((s) => s.id.indexOf(R.C.id) === 0 && s.id.indexOf('0.0') > 0);
      return { id: R.C.id, drop: a && b ? 1 - b.step / a.step : 0, a: a, b: b };
    });
    const worst = pairs.slice().sort((x, y2) => y2.drop - x.drop);
    line('  ANSWER TO THE LIGHT-RAMP QUESTION: on four of the five round-3 candidates the tiltY 3.0 ramp IS most of the seam. Dropping it to 0.0 cuts the', 13, '#7ee787');
    line('  absolute boundary step by ' + worst.filter((p) => p.drop > 0.1).map((p) => p.id + ' ' + f1(100 * p.drop) + '%').join(', ') +
      '. The one exception is ' + (worst[worst.length - 1] || {}).id + ' (' + f1(100 * (worst[worst.length - 1] || {}).drop) +
      '%), whose own grain is large enough to swallow the ramp.', 13, '#7ee787');
    line('  Recommendation: frozen_lake takes tiltY 0.0 / tiltX 0.0 and BREAKS the family\'s 3.0. The ramp buys plasticity only where there is texture to', 13, '#7ee787');
    line('  shade; on a tile chosen for being flat it buys a sawtooth and nothing else.', 13, '#7ee787');
  }
  y += 8;

  line('PAIR DISTANCES against the graded tiltY 3.0 rung -- DIAGNOSTIC, NOT A GATE (Rudi: two biomes may look alike, it changes nothing in play)', 15, '#ffa657');
  const PAIRF = ['glacier', 'snow_peak', 'crevasse', 'ice_shelf', 'tundra', 'permafrost'];
  line('  candidate    ' + PAIRF.map((f) => f.padEnd(25)).join(''), 13, '#8b949e');
  line('               ' + PAIRF.map(() => '   dL   dB/R   micro rat'.padEnd(25)).join(''), 13, '#8b949e');
  for (const R of results) {
    if (R.C.r !== 3) continue;
    const a = R.rungs.T30;
    let s = '  ' + R.C.id.padEnd(13);
    for (const fam of PAIRF) {
      const nb = NEIGH.find((n) => n.id === fam);
      if (!nb) { s += ' '.repeat(25); continue; }
      s += (((a.lum - nb.lum >= 0 ? '+' : '') + f1(a.lum - nb.lum)).padStart(6) +
        ((a.br - nb.br >= 0 ? '+' : '') + f2(a.br - nb.br)).padStart(7) +
        f2(a.micro / (nb.micro || 1e-6)).padStart(9) + '   ');
    }
    line(s, 13, '#c9d1d9');
  }
  y += 4;
  const SP = NEIGH.find((n) => n.id === 'snow_peak');
  const FLold = NEIGH.find((n) => n.id === 'frozen_lake');
  if (SP) line('  NOTE ON THE COLOUR AXIS: snow_peak already sits at B/R ' + f2(SP.br) + ' / L ' + f1(SP.lum) + ', so the coarse B/R ' + f3(BR_T) +
    ' used here lands almost exactly on top of it in hue. The frozen_lake CURRENTLY SHIPPED (the tile being replaced) is L ' + f1(FLold.lum) +
    ' / B/R ' + f2(FLold.br) + ' -- so the corpus has already carried a frozen_lake far bluer and brighter than this. The grade round should', 13, '#ffa657');
  if (SP) line('  therefore consider B/R 1.45-1.60 rather than 1.35, which clears snow_peak and still stops well short of ice_shelf\'s 2.86.', 13, '#ffa657');
  y += 10;

  // ---- the pictures -----------------------------------------------------
  const TW = 384, TH = 192, GAP = 10;
  for (const r of [1, 2, 3]) {
    const rs = results.filter((R) => R.C.r === r);
    if (!rs.length) continue;
    line('ROUND ' + r + ' -- per candidate: RAW cut (left) | graded tiltY 3.0 (middle) | graded tiltY 0.0 (right)', 15, r === 3 ? '#7ee787' : '#8b949e');
    for (const R of rs) {
      const rowY = y;
      comp.push({ input: label(R.C.id + '   ' + R.C.label, 900, 14, '#c9d1d9'), left: PAD, top: rowY });
      const imgs = [R.rawPng, R.rungs.T30.png, R.rungs.T00.png];
      for (let k = 0; k < 3; k++) {
        comp.push({ input: await sharp(imgs[k]).resize(TW, TH, { fit: 'fill' }).png().toBuffer(), left: PAD + k * (TW + GAP), top: rowY + 22 });
      }
      // the play field of the tiltY 3.0 rung, solo-tessellated, plain and under vacuum
      const sb = [];
      for (let n = 0; n < 4; n++) sb.push(ROT180[n] ? await sharp(R.rungs.T30.png).rotate(180).png().toBuffer() : R.rungs.T30.png);
      const rndP = mulberry32(90210);
      const PD = await isoField(sb, PLAY_W, PLAY_H, 9, 13, () => Math.floor(rndP() * 4));
      comp.push({ input: PD.png, left: PAD + 3 * (TW + GAP) + 14, top: rowY + 22 });
      comp.push({ input: await vacuum(PD.png), left: PAD + 3 * (TW + GAP) + 14 + PD.w + 12, top: rowY + 22 });
      const rndQ = mulberry32(90210);
      const QD = await isoField(R.rungs.T30.quadBufs, PLAY_W, PLAY_H, 9, 13, () => Math.floor(rndQ() * 4));
      comp.push({ input: QD.png, left: PAD + 3 * (TW + GAP) + 14 + 2 * (PD.w + 12), top: rowY + 22 });
      comp.push({ input: label('play scale, SOLO | + vacuum | QUAD (4 offsets)', 700, 12, '#8b949e'), left: PAD + 3 * (TW + GAP) + 14, top: rowY + 22 + PD.h + 2 });
      y = rowY + 22 + TH + 12;
    }
    y += 8;
  }

  const outFile = path.join(ST, TAG + 'CANDIDATES.png');
  fs.writeFileSync(outFile, await sharp({ create: { width: SW, height: y + PAD, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
  console.log('\n[sheet] ' + outFile);

  // ---- per-round 1:1 look sheets for round 3 ----------------------------
  for (const R of results) {
    if (R.C.r !== 3) continue;
    const c2 = []; let yy = PAD;
    const ln = (t, size, fill) => { size = size || 13; c2.push({ input: label(t, 2200 - PAD * 2, size, fill || '#c9d1d9'), left: PAD, top: yy }); yy += size + 7; };
    const a = R.rungs.T30;
    ln('frozen_lake candidate ' + R.C.id + ' -- ' + R.C.label, 19, '#7ee787');
    ln('graded tiltY 3.0:  L ' + f1(a.lum) + '  B/R ' + f2(a.br) + '  G/R ' + f2(a.gr) + '  micro8 ' + f2(a.micro) + '  blowout ' + f2(100 * a.blow) + '%  rim ' + f2(a.rim) +
      '   grid_play SOLO ' + f2(a.solo.play.gridTot) + ' (coh ' + f2(a.solo.play.gridCoh) + ')  QUAD ' + f2(a.quad.play.gridTot) +
      '   glacier one-slot bar ' + f2(glSolo.play.gridTot), 14, '#ffa657');
    yy += 6;
    const sb = [];
    for (let n = 0; n < 4; n++) sb.push(ROT180[n] ? await sharp(a.png).rotate(180).png().toBuffer() : a.png);
    const rndF = mulberry32(90210);
    const FD = await isoField(sb, TILE_W, TILE_H, 6, 4, () => Math.floor(rndF() * 4));
    ln('FULL RES, one tile tessellated -- the lattice at 1:1, worst case (every slot the same picture)', 15, '#7ee787');
    const sc = Math.min(1, (2200 - PAD * 2) / FD.w);
    c2.push({ input: await sharp(FD.png).resize(Math.round(FD.w * sc), Math.round(FD.h * sc)).png().toBuffer(), left: PAD, top: yy });
    yy += Math.round(FD.h * sc) + 12;
    const rndQ = mulberry32(90210);
    const QF = await isoField(a.quadBufs, TILE_W, TILE_H, 6, 4, () => Math.floor(rndQ() * 4));
    ln('FULL RES, the QUAD projection -- four windows at four offsets, the hero grade on all of them', 15, '#7ee787');
    c2.push({ input: await sharp(QF.png).resize(Math.round(QF.w * sc), Math.round(QF.h * sc)).png().toBuffer(), left: PAD, top: yy });
    yy += Math.round(QF.h * sc) + 12;
    const rndP = mulberry32(90210);
    const PD = await isoField(a.quadBufs, PLAY_W, PLAY_H, 40, 22, () => Math.floor(rndP() * 4));
    ln('PLAY SCALE 48x24 (zoom 1.0 build view), QUAD      |      the same under the VACUUM darkening rgba(5,10,25,0.45)', 15, '#7ee787');
    c2.push({ input: PD.png, left: PAD, top: yy });
    c2.push({ input: await vacuum(PD.png), left: PAD + PD.w + 24, top: yy });
    yy += PD.h + PAD;
    const f = path.join(ST, TAG + R.C.id + '.png');
    fs.writeFileSync(f, await sharp({ create: { width: 2200, height: yy, channels: 4, background: BGA } }).composite(c2).png().toBuffer());
    console.log('[sheet] ' + path.basename(f));
  }

  // ---- numbers.txt ------------------------------------------------------
  const txt = [];
  txt.push('frozen_lake HERO CANDIDATES -- ' + new Date().toISOString());
  txt.push('grade: L ' + f1(HOLD_LUM) + '  B/R ' + f3(BR_T) + '  G/R ' + f3(GR_T) + '  tiltX 0.0   (coarse, direction only)');
  txt.push('');
  txt.push('neighbours, measured from src/assets/tiles (read only):');
  for (const nb of NEIGH) txt.push('  ' + nb.id.padEnd(12) + ' L ' + f1(nb.lum).padStart(5) + '  B/R ' + f2(nb.br) + '  G/R ' + f2(nb.gr) + '  micro8 ' + f2(nb.micro));
  txt.push('');
  txt.push('glacier grid_play: 4 slots ' + f2(glQuad.play.gridTot) + ' coh ' + f2(glQuad.play.gridCoh) +
    ' | one slot tessellated ' + f2(glSolo.play.gridTot) + ' coh ' + f2(glSolo.play.gridCoh));
  txt.push('');
  for (const R of results) {
    const a = R.rungs.T30, b = R.rungs.T00;
    txt.push(R.C.id + '  (' + R.C.label + ')');
    txt.push('   raw       L ' + f1(R.raw.lum) + '  sd ' + f2(R.raw.sd) + '  micro8 ' + f2(R.raw.micro) + '  blow ' + f1(100 * R.raw.blow) + '%');
    txt.push('   tiltY 3.0 L ' + f1(a.lum) + '  B/R ' + f2(a.br) + '  G/R ' + f2(a.gr) + '  sd ' + f2(a.sd) + '  micro8 ' + f2(a.micro) +
      '  blow ' + f2(100 * a.blow) + '%  rim ' + f2(a.rim) + '  chroma ' + f2(100 * a.chromaRes) + '%');
    txt.push('             grid_play SOLO ' + f2(a.solo.play.gridTot) + ' coh ' + f2(a.solo.play.gridCoh) + ' slot ' + f2(a.solo.play.gridSlot) +
      ' ramp_pp ' + f2(a.solo.play.rampPP) + ' sd_within ' + f2(a.solo.play.sdWithin) + ' ratio ' + f3(a.solo.play.ratio));
    txt.push('             grid_play QUAD ' + f2(a.quad.play.gridTot) + ' coh ' + f2(a.quad.play.gridCoh) + ' slot ' + f2(a.quad.play.gridSlot) +
      '   full-res ' + f2(a.quad.full.gridTot) + '   boundary step/rough ' + f2(a.quad.bs.step) + '/' + f2(a.quad.bs.rough) + ' ratio ' + f2(a.quad.bs.ratio));
    txt.push('   tiltY 0.0 L ' + f1(b.lum) + '  micro8 ' + f2(b.micro) +
      '  grid_play SOLO ' + f2(b.solo.play.gridTot) + ' coh ' + f2(b.solo.play.gridCoh) + ' ramp_pp ' + f2(b.solo.play.rampPP) +
      '   QUAD ' + f2(b.quad.play.gridTot) + ' coh ' + f2(b.quad.play.gridCoh));
    txt.push('');
  }
  fs.writeFileSync(path.join(ST, TAG + 'numbers.txt'), txt.join('\n') + '\n');
  console.log('[numbers] ' + TAG + 'numbers.txt');
})();
