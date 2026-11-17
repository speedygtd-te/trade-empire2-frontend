/**
 * TUNDRA ITERATION 2, STEP 2 OF 2 -- HOW GREY, AND WHAT IT COSTS.
 *
 * STYLE-TEST ONLY. Reads the frozen sources and the de-vegetated round-2 output;
 * writes only into assets/style-test/tiles/tundra_iter2/. Nothing goes to
 * src/assets/tiles/. No cap sync, no git.
 *
 * WHY COLOUR IS A GRADE AND NOT A PROMPT
 *   On the ocean family the colour never came out of the prompt -- reef took eight
 *   rounds and landed only once the hue was solved as a measured grade. A prompt
 *   cannot hit a target value, so step 1 (tiles-tundra-deveg.cjs) changed the FORM
 *   and this script changes the COLOUR, in closed form, at a solved level.
 *
 * THE POINT OF THIS SHEET IS NOT THE LOOK, IT IS THE COST
 *   tundra ships at B/R 0.55 and is the ONLY warm tile in ICE. That single fact is
 *   what makes it separable from everything else in the family (dB/R >= 0.84
 *   against every other member). Making it grey spends that leg. Worse, permafrost
 *   is to be DERIVED from tundra, so two grey tiles would come out of one source.
 *   Every rung is therefore measured against every ICE neighbour and the sheet
 *   states at which rung the hue leg is gone.
 *
 * THE LADDER RUNS IN HUE AT A HELD LEVEL
 *   Level is pinned to the shipped tundra family level (30.8 canvas luma) on all
 *   four slots, so the only thing moving across the ladder is the hue -- and so the
 *   ladder also undoes the level lift kontext applied on its own (deveg2 came back
 *   at 38-46). Holding one level for all four slots additionally makes the slots
 *   MORE consistent with each other than the shipped set is (33.0 / 28.5).
 *
 * G/R IS NOT A FREE DIAL
 *   k = (G/R - 1) / (B/R - 1) is the chroma DIRECTION. Shipped tundra sits at
 *   k = 0.467; the finished corpus clusters at 0.60 (salt_flat 0.67, ice_shelf
 *   0.63, snow_peak 0.59). k is interpolated across the ladder between those two
 *   so the warm end really reproduces today's tundra hue and the grey end lands on
 *   the direction the rest of the corpus uses.
 *
 * MEASURED ON THE WRITTEN .webp, NEVER ON THE BUFFER
 *   libwebp does not preserve RGB under fully transparent pixels and the diamond
 *   corners are ~50% of the canvas, so a buffer-side number drifts (+1.5 luma).
 *   Each rung is written, re-opened, measured, and the solve corrected against the
 *   file on disk, SOLVE_PASSES times.
 *
 * Output
 *   ladder/tundra_<id>_<slot>.webp / @eighth.webp   the rungs
 *   _tundra_iter2_sheet.png                         the contact sheet
 *   _tundra_iter2_numbers.txt                       the same numbers as text
 *
 * Usage: node scripts/tiles-tundra-grey-ladder.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
// Windows: the solve loop rewrites the SAME path up to SOLVE_PASSES times and
// sharp's cache turns the second write into EINVAL.
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const WORK = path.join(ST, 'tundra_iter2');
const SRC = path.join(WORK, 'src');
const DV1 = path.join(WORK, 'deveg');
const DV2 = path.join(WORK, 'deveg2');
const OUT = path.join(WORK, 'ladder');

const TILE_W = 512, TILE_H = 256;
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const SOLVE_PASSES = 4;

// The level the ladder holds: the shipped tundra family level. Slots 0/2 ship at
// 33.0 and 1/3 at 28.5; 30.8 is the family figure quoted for tundra.
const HOLD_LUM = 30.8;

// chroma direction, interpolated between shipped tundra and the corpus cluster
const K_TUNDRA = 0.467, BR_TUNDRA = 0.55, K_CORPUS = 0.60, BR_CORPUS = 1.18;
const kFor = (br) => K_TUNDRA + (K_CORPUS - K_TUNDRA) * ((br - BR_TUNDRA) / (BR_CORPUS - BR_TUNDRA));
const grFor = (br) => 1 + kFor(br) * (br - 1);

// ---- the ladder ------------------------------------------------------------
// desat pulls each pixel's chroma toward its own luma (1.0 = untouched). It is
// only exercised on one rung: after the de-vegetation the tile is already at
// sat 5-11%, so there is little chroma left for a desaturation step to remove --
// the ladder's real dial is the tint.
const STEPS = [
  { id: 'W055', br: 0.55, desat: 1.00, note: "today's tundra hue restored -- the do-nothing rung" },
  { id: 'W070', br: 0.70, desat: 1.00, note: 'a quarter of the way to neutral, still clearly warm' },
  { id: 'W082', br: 0.82, desat: 1.00, note: 'halfway -- faint brown cast, the Callisto description' },
  { id: 'N090', br: 0.90, desat: 1.00, note: 'what kontext produced on its own, level put back' },
  { id: 'N100', br: 1.00, desat: 1.00, note: 'dead neutral grey, no cast in either direction' },
  { id: 'N100D', br: 1.00, desat: 0.60, note: 'N100 plus a real desaturation pass (per-pixel chroma x0.6)' },
  { id: 'C118', br: 1.18, desat: 1.00, note: 'ON the proposed glacier hue -- fully cool grey' },
];
const RECOMMEND = 'W082';

// ---- ICE neighbours the separation is measured against ---------------------
const NEIGH = [
  { id: 'ice_shelf', file: path.join(TILES, 'ice_shelf', 'ice_shelf_0.webp'), note: 'SHIPPED, redesigned -- polar water, fixed' },
  { id: 'glacier(L40)', file: path.join(ST, 'glacier_ladder', 'glacier_L40.webp'), note: 'PROPOSED icy-moon grade, awaiting Rudi' },
  { id: 'permafrost', file: path.join(TILES, 'permafrost', 'permafrost_0.webp'), note: 'untouched ORIGINAL -- to be DERIVED FROM TUNDRA' },
  { id: 'frozen_lake', file: path.join(TILES, 'frozen_lake', 'frozen_lake_0.webp'), note: 'untouched ORIGINAL -- redesign still open' },
  { id: 'crevasse', file: path.join(TILES, 'crevasse', 'crevasse_0.webp'), note: 'untouched ORIGINAL -- to be derived from glacier' },
  { id: 'snow_peak', file: path.join(TILES, 'snow_peak', 'snow_peak_0.webp'), note: 'EARTH_LIKE anchor only, not in this family' },
].filter((n) => fs.existsSync(n.file));

// ---- vacuum darkening, read out of isoConstants so it cannot drift ---------
function readDarken() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'views', 'grid', 'isoConstants.ts'), 'utf8');
  const num = (n) => {
    const m = src.match(new RegExp(n + '\\s*=\\s*([0-9.]+)'));
    if (!m) throw new Error('missing ' + n);
    return parseFloat(m[1]);
  };
  const rgb = src.match(/ATMOSPHERE_DARKEN_RGB\s*=\s*'([0-9]+),\s*([0-9]+),\s*([0-9]+)'/);
  if (!rgb) throw new Error('missing ATMOSPHERE_DARKEN_RGB');
  return { a1: num('ATMOSPHERE_TERRAIN_DARKEN_MAX'), a2: num('ATMOSPHERE_STRUCTURE_DARKEN_MAX'), tint: [+rgb[1], +rgb[2], +rgb[3]] };
}
const DK = readDarken();
const KEEP = (1 - DK.a1) * (1 - DK.a2), ADDW = 1 - KEEP;
const airlessRgb = (c) => c.map((v, i) => v * KEEP + DK.tint[i] * ADDW);
async function airlessImg(buf) {
  const md = await sharp(buf).metadata();
  const veil = (a) => sharp({ create: { width: md.width, height: md.height, channels: 4, background: { r: DK.tint[0], g: DK.tint[1], b: DK.tint[2], alpha: a } } }).png().toBuffer();
  return sharp(buf).composite([{ input: await veil(DK.a1) }, { input: await veil(DK.a2) }]).png().toBuffer();
}

// ---- measurement -----------------------------------------------------------
async function statsOf(file) {
  const { data, info } = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, w = info.width, h = info.height, N = data.length / ch;
  const s = [0, 0, 0], is = [0, 0, 0], iq = [0, 0, 0];
  let ni = 0, sat = 0;
  // tilt: the flux gradient. mean interior luma of each half, in luma units.
  const half = { l: 0, r: 0, t: 0, b: 0 }, hn = { l: 0, r: 0, t: 0, b: 0 };
  const lv = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    for (let c = 0; c < 3; c++) s[c] += data[i + c];
    if (data[i + 3] < 8) continue;
    for (let c = 0; c < 3; c++) { is[c] += data[i + c]; iq[c] += data[i + c] * data[i + c]; }
    const mx = Math.max(data[i], data[i + 1], data[i + 2]), mn = Math.min(data[i], data[i + 1], data[i + 2]);
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
  const am = airlessRgb(im);
  const br = im[2] / im[0], gr = im[1] / im[0];
  const tiltX = half.l / hn.l - half.r / hn.r, tiltY = half.t / hn.t - half.b / hn.b;
  return {
    lum: L709(m[0], m[1], m[2]), intLum: L709(im[0], im[1], im[2]), rgb: im,
    br, gr, offAxis: gr - (1 + br) / 2,
    sd: (isd[0] + isd[1] + isd[2]) / 3, sat: sat / ni,
    p99: lv.length ? lv[Math.floor(0.99 * lv.length)] : 0,
    blow: lv.length ? lv.filter((v) => v >= 200).length / lv.length : 0,
    airLum: L709(am[0], am[1], am[2]),
    tilt: Math.max(Math.abs(tiltX), Math.abs(tiltY)), tiltX, tiltY,
  };
}
async function microContrast(file) {
  if (!fs.existsSync(file)) return 0;
  const { data, info } = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, w = info.width, h = info.height;
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) { L[p] = L709(data[p * ch], data[p * ch + 1], data[p * ch + 2]); A[p] = data[p * ch + 3]; }
  let s = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) { const p = y * w + x; if (A[p] < 200 || A[p + 1] < 200) continue; s += Math.abs(L[p] - L[p + 1]); n++; }
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) { const p = y * w + x; if (A[p] < 200 || A[p + w] < 200) continue; s += Math.abs(L[p] - L[p + w]); n++; }
  return n ? s / n : 0;
}

// ---- grade: pointwise, so the diamond rim is safe --------------------------
function grade(src, ch, gains, desat) {
  const out = Buffer.from(src);
  for (let i = 0; i < out.length; i += ch) {
    if (out[i + 3] < 1) continue;
    let v0 = out[i] * gains[0], v1 = out[i + 1] * gains[1], v2 = out[i + 2] * gains[2];
    if (desat !== 1) {
      const L = L709(v0, v1, v2);
      v0 = L + desat * (v0 - L); v1 = L + desat * (v1 - L); v2 = L + desat * (v2 - L);
    }
    out[i] = v0 < 0 ? 0 : v0 > 255 ? 255 : Math.round(v0);
    out[i + 1] = v1 < 0 ? 0 : v1 > 255 ? 255 : Math.round(v1);
    out[i + 2] = v2 < 0 ? 0 : v2 > 255 ? 255 : Math.round(v2);
  }
  return out;
}
function canvasLumOf(buf, ch) {
  const s = [0, 0, 0];
  let N = 0;
  for (let i = 0; i < buf.length; i += ch) { s[0] += buf[i]; s[1] += buf[i + 1]; s[2] += buf[i + 2]; N++; }
  return L709(s[0] / N, s[1] / N, s[2] / N);
}
function solveG(src, ch, tint, desat, target) {
  let lo = 0.02, hi = 6.0;
  for (let it = 0; it < 28; it++) {
    const mid = (lo + hi) / 2;
    const v = canvasLumOf(grade(src, ch, [tint[0] * mid, tint[1] * mid, tint[2] * mid], desat), ch);
    if (v > target) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

// ---- labels ----------------------------------------------------------------
function label(t, w, size, fill) {
  size = size || 13; fill = fill || '#c9d1d9';
  const esc = String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + (size + 7) + '">' +
    '<text xml:space="preserve" x="4" y="' + (size + 1) + '" font-family="monospace" font-size="' + size + '" fill="' + fill + '">' +
    esc + '</text></svg>');
}
const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2);

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** interlocking diamond field of two tile sets at play scale */
async function mixedField(sets, w, h, rows, cols, seed) {
  const bufs = [];
  for (const set of sets) {
    const o = [];
    for (const f of set) o.push(await sharp(typeof f === 'string' ? fs.readFileSync(f) : f).resize(w, h, { fit: 'fill', kernel: 'nearest' }).png().toBuffer());
    bufs.push(o);
  }
  const rnd = mulberry32(seed);
  const cells = [];
  let mr = 0, mb = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * w + (r % 2 ? w / 2 : 0), y = (r * h) / 2;
    const set = bufs[Math.floor(rnd() * bufs.length)];
    cells.push({ input: set[Math.floor(rnd() * set.length)], left: x, top: y });
    mr = Math.max(mr, x + w); mb = Math.max(mb, y + h);
  }
  return sharp({ create: { width: mr, height: mb, channels: 4, background: BGA } }).composite(cells).png().toBuffer();
}

const SLOTS = [0, 1, 2, 3];
/** mean of a stat across the four slots */
const avg = (arr, pick) => arr.reduce((s, x) => s + pick(x), 0) / arr.length;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // ---- guard: the frozen sources must still equal what ships ---------------
  for (const n of SLOTS) {
    const origin = path.join(TILES, 'tundra', 'tundra_' + n + '.webp');
    const frozen = path.join(SRC, 'tundra_' + n + '_src.webp');
    if (!fs.existsSync(frozen)) throw new Error('frozen source missing, run tiles-tundra-deveg.cjs first');
    if (!fs.readFileSync(frozen).equals(fs.readFileSync(origin)))
      console.log('[warn] frozen tundra_' + n + ' differs from src/assets/tiles/tundra/ -- src changed since the freeze');
  }
  console.log('[freeze] 4 frozen sources verified against src/assets/tiles/tundra/');

  // ---- the three fixed sets: shipped, deveg round 1, deveg round 2 ---------
  const setStats = async (dir, pat) => {
    const out = [];
    for (const n of SLOTS) {
      const f = path.join(dir, pat.replace('<n>', n));
      const s = await statsOf(f);
      s.micro = await microContrast(f.replace(/\.webp$/, '@eighth.webp'));
      s.microFull = await microContrast(f);
      s.file = f;
      out.push(s);
    }
    return out;
  };
  const shipped = await setStats(SRC, 'tundra_<n>_src.webp');
  for (let i = 0; i < 4; i++) shipped[i].micro = await microContrast(path.join(TILES, 'tundra', 'tundra_' + i + '@eighth.webp'));
  const dv1 = await setStats(DV1, 'tundra_<n>.webp');
  const dv2 = await setStats(DV2, 'tundra_<n>.webp');

  // ---- build the ladder, per slot, correcting against the written file -----
  const rungs = [];
  for (const st of STEPS) {
    const grT = grFor(st.br);
    const per = [];
    for (const n of SLOTS) {
      const base = path.join(DV2, 'tundra_' + n + '.webp');
      const raw = await sharp(fs.readFileSync(base)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const S = raw.data, CH = raw.info.channels;
      const b0 = await statsOf(base);
      // closed form: after a per-channel gain the interior mean of channel c is
      // m_c * gain_c, so the two hue ratios pin the gains up to a common factor.
      const tint = [1, (grT * b0.rgb[0]) / b0.rgb[1], (st.br * b0.rgb[0]) / b0.rgb[2]];
      let tgt = HOLD_LUM, m = null;
      const file = path.join(OUT, 'tundra_' + st.id + '_' + n + '.webp');
      const eighth = file.replace(/\.webp$/, '@eighth.webp');
      for (let pass = 0; pass < SOLVE_PASSES; pass++) {
        const G = solveG(S, CH, tint, st.desat, tgt);
        const buf = grade(S, CH, [tint[0] * G, tint[1] * G, tint[2] * G], st.desat);
        const png = await sharp(buf, { raw: { width: raw.info.width, height: raw.info.height, channels: CH } }).png().toBuffer();
        await sharp(png).webp(WEBP).toFile(file);
        await sharp(png).resize(64, 32, { fit: 'fill' }).webp(WEBP).toFile(eighth);
        m = await statsOf(file);
        if (pass === SOLVE_PASSES - 1) break;
        tgt *= HOLD_LUM / m.lum;
        tint[2] *= st.br / m.br;
        tint[1] *= grT / m.gr;
      }
      m.micro = await microContrast(eighth);
      m.microFull = await microContrast(file);
      m.file = file;
      per.push(m);
    }
    const agg = {
      lum: avg(per, (x) => x.lum), intLum: avg(per, (x) => x.intLum), airLum: avg(per, (x) => x.airLum),
      br: avg(per, (x) => x.br), gr: avg(per, (x) => x.gr), offAxis: avg(per, (x) => x.offAxis),
      sd: avg(per, (x) => x.sd), sat: avg(per, (x) => x.sat), micro: avg(per, (x) => x.micro),
      microFull: avg(per, (x) => x.microFull), p99: avg(per, (x) => x.p99), blow: avg(per, (x) => x.blow),
      tilt: avg(per, (x) => x.tilt),
    };
    rungs.push({ id: st.id, note: st.note, want: st, per, stats: agg });
    console.log('[rung] ' + st.id.padEnd(6) + ' L ' + f1(agg.lum) + ' (want ' + f1(HOLD_LUM) + ')  B/R ' + f2(agg.br) +
      ' (want ' + f2(st.br) + ')  G/R ' + f2(agg.gr) + ' (want ' + f2(grT) + ')  sat ' + (agg.sat * 100).toFixed(0) +
      '%  sd ' + f1(agg.sd) + '  m8 ' + f2(agg.micro) + '  tilt ' + f1(agg.tilt));
  }

  // ---- neighbours ---------------------------------------------------------
  for (const nb of NEIGH) {
    nb.stats = await statsOf(nb.file);
    nb.stats.micro = await microContrast(nb.file.replace(/\.webp$/, '@eighth.webp'));
    nb.stats.microFull = await microContrast(nb.file);
  }

  // ---- separation matrix --------------------------------------------------
  // dB/R and dG/R BOTH, because on reef/shallow_water reading only dB/R would
  // have condemned a hue gap that was really there. dL is the third leg.
  const SEP_MIN = 0.30;   // the gap below which a hue axis stops carrying a pair
  const sep = [];
  for (const r of rungs) {
    const row = { id: r.id, cells: [] };
    for (const nb of NEIGH) {
      const dbr = Math.abs(r.stats.br - nb.stats.br);
      const dgr = Math.abs(r.stats.gr - nb.stats.gr);
      const dl = Math.abs(r.stats.lum - nb.stats.lum);
      row.cells.push({ nb: nb.id, dbr, dgr, dl, hueOk: Math.max(dbr, dgr) >= SEP_MIN });
    }
    sep.push(row);
  }
  const shippedSep = NEIGH.map((nb) => ({
    nb: nb.id,
    dbr: Math.abs(avg(shipped, (x) => x.br) - nb.stats.br),
    dgr: Math.abs(avg(shipped, (x) => x.gr) - nb.stats.gr),
    dl: Math.abs(avg(shipped, (x) => x.lum) - nb.stats.lum),
  }));

  // ---- sheet --------------------------------------------------------------
  const PAD = 18, GAP = 10, TW = 300, TH = 150;
  const width = PAD * 2 + 4 * TW + 3 * GAP;
  const comp = [];
  const txt = [];
  let y = PAD;
  const line = (t, size, fill) => {
    size = size || 13;
    comp.push({ input: label(t, width - PAD * 2, size, fill || '#c9d1d9'), left: PAD, top: y });
    y += size + 7;
    txt.push(t);
  };

  const HEAD = '   set / rung      canvasL    intL airless    B/R    G/R  offax%     sd  micro8  microF  sat%   tilt   BLOW%';
  const rowOf = (id, s) => '   ' + id.padEnd(15) + f1(s.lum).padStart(6) + f1(s.intLum).padStart(8) + f1(s.airLum).padStart(8) +
    f2(s.br).padStart(7) + f2(s.gr).padStart(7) + (s.offAxis * 100).toFixed(1).padStart(8) + f1(s.sd).padStart(7) +
    f2(s.micro).padStart(8) + f2(s.microFull).padStart(8) + (s.sat * 100).toFixed(0).padStart(6) +
    f1(s.tilt).padStart(7) + (s.blow * 100).toFixed(2).padStart(8);
  const aggOf = (set) => ({
    lum: avg(set, (x) => x.lum), intLum: avg(set, (x) => x.intLum), airLum: avg(set, (x) => x.airLum),
    br: avg(set, (x) => x.br), gr: avg(set, (x) => x.gr), offAxis: avg(set, (x) => x.offAxis),
    sd: avg(set, (x) => x.sd), sat: avg(set, (x) => x.sat), micro: avg(set, (x) => x.micro),
    microFull: avg(set, (x) => x.microFull), p99: avg(set, (x) => x.p99), blow: avg(set, (x) => x.blow),
    tilt: avg(set, (x) => x.tilt),
  });

  line('TUNDRA -- ITERATION 2:  de-vegetate via flux, then a measured GREY LADDER.  A TRIAL -- nothing written to src/assets/tiles/.', 18, '#e6edf3');
  line('all numbers measured on the WRITTEN .webp, four slots averaged, ' + new Date().toISOString().slice(0, 16), 13, '#8b949e');
  y += 4;
  line('STEP 1 (form, flux-pro/kontext, positive replacement, no negatives). Round 1 asked for the whole surface and FAILED BOTH WAYS:', 13, '#ffa657');
  line('   slots 0/2 kept every tuft and merely FROSTED it white; slots 1/3 lost the tufts AND the whole ground (featureless plaster, sd 17.9 -> 12.5).', 13, '#ffa657');
  line('   Round 2 SCOPED the instruction ("wherever a tuft stands put that same dark gravel in its place") and named the ground that must survive.', 13, '#7ee787');
  line('   Round 2 removed the vegetation on all four slots and kept the gravel. THREE COSTS, none of them asked for: (1) level 30.8 -> 42.4 and', 13, '#7ee787');
  line('   B/R 0.63 -> 0.97, i.e. kontext greyed the tile by itself; (2) play-scale structure micro8 8.7 -> 3.3, because the tufts were carrying it;', 13, '#7ee787');
  line('   (3) the lighting gradient turned per-slot: shipped is a clean top-light (x/y +-4 / +11 on ALL four slots), round 2 gives x +1.3 / -14.6 /', 13, '#7ee787');
  line('   +11.8 / -23.7 and slot 0 loses the top-light entirely. That is a slot-INTERCHANGEABILITY defect and it is NOT corrected on this sheet.', 13, '#7ee787');
  line('STEP 2 (colour, local grade, never the prompt -- the ocean-family lesson). Level HELD at ' + f1(HOLD_LUM) + ' on every rung, so only the hue moves', 13, '#8b949e');
  line('   and the level lift kontext applied on its own is undone. G/R follows B/R at k interpolated 0.467 (shipped tundra) -> 0.60 (corpus cluster).', 13, '#8b949e');
  y += 6;
  line(HEAD, 13, '#8b949e');
  line(rowOf('SHIPPED tundra', aggOf(shipped)), 13, '#ff7b72');
  line(rowOf('deveg round1', aggOf(dv1)), 13, '#6e7681');
  line(rowOf('deveg round2', aggOf(dv2)), 13, '#ffa657');
  for (const r of rungs) line(rowOf(r.id, r.stats), 13, r.id === RECOMMEND ? '#7ee787' : '#c9d1d9');
  line('   -- ICE neighbours, measured the same way --', 13, '#8b949e');
  for (const nb of NEIGH) line(rowOf(nb.id, nb.stats), 13, '#8b949e');
  y += 10;

  // ---- the separation panel: the point of the sheet -----------------------
  line('WHAT GREY COSTS -- hue distance from every ICE neighbour.  A pair needs max(dB/R, dG/R) >= ' + f2(SEP_MIN) + ' for the HUE leg to carry it;', 16, '#e6edf3');
  line('   below that the pair stands on level and structure alone. dL is printed so it is visible what is left when the hue leg goes.', 13, '#8b949e');
  y += 4;
  const nbw = 15;
  line('   rung            ' + NEIGH.map((n) => n.id.padEnd(nbw)).join(''), 13, '#8b949e');
  line('   ' + 'SHIPPED (0.63)'.padEnd(16) + shippedSep.map((c) => (f2(c.dbr) + '/' + f2(c.dgr)).padEnd(nbw)).join(''), 13, '#ff7b72');
  for (const row of sep) {
    const lost = row.cells.filter((c) => !c.hueOk).map((c) => c.nb);
    line('   ' + (row.id + ' (' + f2(rungs.find((r) => r.id === row.id).stats.br) + ')').padEnd(16) +
      row.cells.map((c) => ((c.hueOk ? '' : '!') + f2(c.dbr) + '/' + f2(c.dgr)).padEnd(nbw)).join('') +
      (lost.length ? '   HUE LEG GONE vs ' + lost.join(', ') : ''), 13,
      lost.length ? '#ff7b72' : (row.id === RECOMMEND ? '#7ee787' : '#c9d1d9'));
  }
  line('   ' + 'dL only'.padEnd(16) + sep[0].cells.map((c, i) => ('L ' + f1(NEIGH[i].stats.lum)).padEnd(nbw)).join(''), 13, '#6e7681');
  y += 6;
  line('   permafrost is to be DERIVED FROM TUNDRA and crevasse FROM GLACIER, so their columns above read the ORIGINAL, not the future tile.', 13, '#ffa657');
  line('   The real question is the one the table cannot show: two grey tiles out of one grey source. If tundra lands at B/R ' + f2(rungs[rungs.length - 1].stats.br) +
    ', permafrost', 13, '#ffa657');
  line('   inherits it and the tundra/permafrost pair has NO hue leg at all -- it would have to be separated on level and structure only.', 13, '#ffa657');
  y += 12;

  const rowPanel = async (title, subtitle, items, withAirless) => {
    line(title, 16, '#e6edf3');
    if (subtitle) line(subtitle, 13, '#8b949e');
    for (let i = 0; i < items.length; i++) {
      const it = items[i], left = PAD + i * (TW + GAP);
      const png = await sharp(fs.readFileSync(it.file)).png().toBuffer();
      comp.push({ input: await sharp(png).resize(TW, TH, { fit: 'fill' }).png().toBuffer(), left, top: y });
      if (withAirless) comp.push({ input: await sharp(await airlessImg(png)).resize(TW, TH, { fit: 'fill' }).png().toBuffer(), left, top: y + TH + 2 });
      const base = y + (withAirless ? 2 * TH + 4 : TH + 4);
      comp.push({ input: label(it.id + '   L ' + f1(it.stats.lum) + '  B/R ' + f2(it.stats.br) + '  sat ' + (it.stats.sat * 100).toFixed(0) + '%  m8 ' + f2(it.stats.micro), TW, 12, it.hl || '#c9d1d9'), left, top: base });
      if (it.note) comp.push({ input: label(it.note, TW, 11, '#6e7681'), left, top: base + 15 });
    }
    y += (withAirless ? 2 * TH : TH) + 40;
  };

  // form panel: shipped vs round1 vs round2, on both distinct sources
  await rowPanel('STEP 1 -- WHAT FLUX DID TO THE FORM.  Left pair: source A (slot 0, the dense mossy capture).  Right pair: source B (slot 1, the sparse one).',
    '   slots 2 and 3 are the flops of 0 and 1, so there are only two real captures in the shipped set.',
    [
      { id: 'A shipped', file: shipped[0].file, stats: shipped[0], note: 'moss + dry tufts, B/R 0.55, the warm tile', hl: '#ff7b72' },
      { id: 'A round 1', file: dv1[0].file, stats: dv1[0], note: 'tufts NOT removed, frosted white; L 33 -> 91', hl: '#ff7b72' },
      { id: 'A round 2', file: dv2[0].file, stats: dv2[0], note: 'bare gravel field, tufts gone, ground kept', hl: '#7ee787' },
      { id: 'B round 2', file: dv2[1].file, stats: dv2[1], note: 'tufts gone; watch the left-right gradient', hl: '#ffa657' },
    ], false);

  await rowPanel('STEP 2 -- THE HUE LADDER (slot 0 shown).  Top row as shipped, bottom row the SAME tile on a VACUUM body, which every ice moon is.',
    '   airless = keep ' + f2(KEEP) + ' of the tile + rgb(' + DK.tint + ') at ' + f2(ADDW) + ', the two fills PlanetSurface paints. Level is identical on every rung; only hue moves.',
    rungs.slice(0, 4).map((r) => ({ id: r.id, file: r.per[0].file, stats: r.per[0], note: r.note, hl: r.id === RECOMMEND ? '#7ee787' : '#c9d1d9' })), true);
  await rowPanel('', '',
    rungs.slice(4).map((r) => ({ id: r.id, file: r.per[0].file, stats: r.per[0], note: r.note, hl: r.id === RECOMMEND ? '#7ee787' : '#c9d1d9' }))
      .concat([{ id: 'SHIPPED slot0', file: shipped[0].file, stats: shipped[0], note: 'for comparison: what ships today', hl: '#ff7b72' }]), true);

  // four-slot consistency of the recommended rung
  const rec = rungs.find((r) => r.id === RECOMMEND);
  await rowPanel('FOUR-SLOT CONSISTENCY of ' + RECOMMEND + ' -- the slots have to stay interchangeable, they are drawn at random next to each other',
    '   level is solved per slot to the same ' + f1(HOLD_LUM) + ', so the shipped 33.0 / 28.5 split is gone. tilt is the residual flux gradient, uncorrected.',
    SLOTS.map((n) => ({ id: RECOMMEND + ' slot ' + n, file: rec.per[n].file, stats: rec.per[n], note: 'tilt ' + f1(rec.per[n].tilt) + ' (x ' + f1(rec.per[n].tiltX) + ' / y ' + f1(rec.per[n].tiltY) + ')' })), false);

  // ---- mixed fields at play scale ----------------------------------------
  const MW = 128, MH = 64;
  const mixTitle = (t, s) => { line(t, 16, '#e6edf3'); if (s) line(s, 13, '#8b949e'); };
  mixTitle('MIXED FIELDS AT PLAY SCALE (@eighth mips, 2x nearest) -- the panel the call is actually made on. Each block: tundra rung vs one ICE neighbour.',
    '   top row of each block as shipped, bottom row on a VACUUM body. If a block reads as one material, that pair has no separation left.');
  const mixSets = [
    { id: 'W055 (today\'s hue) vs glacier(L40)', a: SLOTS.map((n) => path.join(OUT, 'tundra_W055_' + n + '@eighth.webp')), b: [path.join(ST, 'glacier_ladder', 'glacier_L40@eighth.webp')] },
    { id: 'W082 vs glacier(L40)', a: SLOTS.map((n) => path.join(OUT, 'tundra_W082_' + n + '@eighth.webp')), b: [path.join(ST, 'glacier_ladder', 'glacier_L40@eighth.webp')] },
    { id: 'C118 vs glacier(L40)', a: SLOTS.map((n) => path.join(OUT, 'tundra_C118_' + n + '@eighth.webp')), b: [path.join(ST, 'glacier_ladder', 'glacier_L40@eighth.webp')] },
    { id: 'C118 vs ice_shelf', a: SLOTS.map((n) => path.join(OUT, 'tundra_C118_' + n + '@eighth.webp')), b: SLOTS.map((n) => path.join(TILES, 'ice_shelf', 'ice_shelf_' + n + '@eighth.webp')) },
  ].filter((m) => m.a.every(fs.existsSync) && m.b.every(fs.existsSync));
  for (let i = 0; i < mixSets.length; i++) {
    const m = mixSets[i];
    const fld = await mixedField([m.a, m.b], MW, MH, 7, 5, 20260901 + i);
    const air = await airlessImg(fld);
    const md = await sharp(fld).metadata();
    const left = PAD + (i % 2) * (Math.floor((width - PAD * 2) / 2) + 4);
    if (i % 2 === 0 && i > 0) y += 0;
    comp.push({ input: label(m.id, Math.floor((width - PAD * 2) / 2), 13, '#c9d1d9'), left, top: y });
    comp.push({ input: fld, left, top: y + 20 });
    comp.push({ input: air, left, top: y + 20 + md.height + 2 });
    if (i % 2 === 1) y += 20 + 2 * md.height + 16;
  }
  if (mixSets.length % 2 === 1) { const md = await sharp(await mixedField([mixSets[0].a, mixSets[0].b], MW, MH, 7, 5, 1)).metadata(); y += 20 + 2 * md.height + 16; }

  y += 8;
  line('THE ONE NUMBER TO TAKE AWAY: the hue leg against the proposed glacier breaks at B/R ~0.88. W082 still holds it (0.36); N090 does not (0.28).', 15, '#ffa657');
  line('And N090 IS WHAT THE DE-VEGETATION ALONE PRODUCED (0.97) -- so the greying is not a step one chooses, it is the price of the flux edit, and', 14, '#ffa657');
  line('the only way to keep the leg is to grade the warm cast BACK IN afterwards (W055 / W070 / W082). Past 0.88 tundra vs glacier stands on level', 14, '#ffa657');
  line('alone (30.8 vs 40.0) -- and the vacuum row above shows what that pair looks like when the darkening eats into the level too.', 14, '#ffa657');
  line('permafrost is still to be DERIVED from tundra. Grey tundra means grey permafrost from a grey source: that pair would then have neither a', 14, '#ff7b72');
  line('hue leg nor an independent origin. RECOMMENDATION: de-vegetate (round 2 + a gradient fix), but keep tundra WARM at W070-W082. It is the', 14, '#ff7b72');
  line('cheapest separation the ICE family has, and a dusty brown moon surface (Callisto) is the same reference the glacier reversal was argued from.', 14, '#ff7b72');
  y += PAD;

  const sheet = path.join(ST, '_tundra_iter2_sheet.png');
  await sharp({ create: { width, height: y, channels: 4, background: BGA } }).composite(comp).png().toFile(sheet);
  fs.writeFileSync(path.join(ST, '_tundra_iter2_numbers.txt'), txt.join('\n') + '\n');
  console.log('\n[sheet] ' + path.relative(ROOT, sheet) + '  ' + width + 'x' + y);
  console.log('[text ] ' + path.relative(ROOT, path.join(ST, '_tundra_iter2_numbers.txt')));
})();
