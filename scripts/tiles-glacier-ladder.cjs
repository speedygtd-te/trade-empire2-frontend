/**
 * GLACIER GRADE LADDER -- local colour grade only, NO fal.ai, NO writes to src/.
 *
 * The glacier MOTIF is settled: Rudi picked src/assets/tiles/glacier/glacier_2.webp
 * (zero-based; glacier_1 was rejected). Open is only the GRADE. This script builds
 * a ladder of graded candidates out of that one hero and lays them out for a pick.
 *
 * THE LOOK (Rudi, 2026-09-01 -- this REVERSES the earlier blue-ice direction)
 *   Ice planets and ice moons follow the real ones: Ganymede, Callisto, Europa.
 *   Those are dusty, cratered GREY worlds with a faint brown cast, not blue
 *   glacier ice -- billions of years of rock and dust worked into the ice. Clean
 *   blue ice survives only on fresh fracture faces, so blue is an ACCENT, never
 *   the field. The hue target is therefore the band the family analysis had
 *   marked as the "stone bound" and treated as the failure zone, B/R 1.10-1.27.
 *   One rung of the discarded blue direction (X180) stays on the sheet so the
 *   reversal can be seen rather than argued.
 *
 * WHY A LADDER AND NOT ONE CANDIDATE
 *   glacier is the brightest of the four open ICE tiles, so whatever level it
 *   lands on sets the CEILING for the whole family (crevasse is to be derived
 *   from the finished glacier by cutting deeper chasms into it). Picking glacier
 *   is picking the family ceiling, so the ladder runs in level first and hue
 *   second -- and with the hue leg now nearly gone family-wide, the level choice
 *   matters more than it did, not less (see the FAMILY ARITHMETIC panel).
 *
 * THE HARD CONSTRAINT -- BLOWOUT
 *   blow% = share of opaque pixels above Rec709 luma 200. Measured over all 55 tile
 *   folders: every one of the 37 redesigned tiles is under 1%, every tile above 1%
 *   is an untouched original. The hero sits at 42.8%. That number, not the mean, is
 *   what separates "bright ice" from "old blown-out ice" -- ice is legitimately
 *   allowed a high mean. Every rung below must come in under 1%.
 *
 * WHAT THE TILE IS AND IS NOT RESPONSIBLE FOR (Rudi, 2026-09-01)
 *   Plasticity on ice comes from the PROP LAYER (ice blocks, seracs, floes,
 *   bergs), not from the tile. So for glacier LOW MICRO-CONTRAST IS A GOAL, not a
 *   compromise: the tile carries base hue, level and a flat surface texture and
 *   serves as GROUND FOR OBJECTS. The one exception that stays in the tile is
 *   crevasse's chasms -- those are HOLES, not objects.
 *   The props panel at the bottom shows the recommended rung with ice_floe sprites
 *   laid on at true render size, so the flat rungs are judged as ground and not as
 *   a standalone picture. Nothing in propThemes.ts is touched; its numbers are
 *   read and reproduced here.
 *
 * GRADE (pointwise, so the diamond rim is safe)
 *   1. tint + level  c' = c * tint[c] * G
 *   2. contrast      c'' = mean[c] + k * (c' - mean[c])   (interior-mean preserving)
 *   No desaturation step: the hero is already low-chroma (sat 25%) and the whole
 *   point of the look is a uniform blue cast, which the tint alone produces.
 *   tint is SOLVED in closed form for the requested (B/R, G/R) off the hero's
 *   interior channel means; G is solved by bisection for the requested canvas luma.
 *
 * MEASURED ON THE WRITTEN .webp, NEVER ON THE BUFFER
 *   libwebp does not preserve RGB under fully transparent pixels, and the diamond
 *   corners are 49.6% of the canvas, so a buffer-side number drifts (+1.5 luma on
 *   the ocean family). Each rung is therefore written, re-opened, measured, and the
 *   solve corrected and re-run (SOLVE_PASSES times) against the file on disk.
 *
 * HERO IS FROZEN
 *   assets/style-test/tiles/glacier_hero_src.webp. The pipeline reads only that
 *   copy, never src/assets/tiles/glacier/, so it cannot eat its own output the way
 *   the kelp_forest run did.
 *
 * Output
 *   assets/style-test/tiles/_glacier_ladder.png        contact sheet
 *   assets/style-test/tiles/glacier_ladder/<id>.webp   the rungs themselves
 *
 * Usage: node scripts/tiles-glacier-ladder.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
// Windows: sharp keeps a cached handle on a file it has already read, and the
// solve loop below deliberately rewrites the SAME path up to SOLVE_PASSES times
// (write -> measure the file -> correct -> write again). With the cache on, the
// second write fails with EINVAL. Every read additionally goes through
// fs.readFileSync so no handle is held at all.
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const PROPS = path.join(ROOT, 'src', 'assets', 'props');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const OUT = path.join(ST, 'glacier_ladder');
const HERO = path.join(ST, 'glacier_hero_src.webp');
const HERO_ORIGIN = path.join(TILES, 'glacier', 'glacier_2.webp');

const TILE_W = 512, TILE_H = 256;
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const SOLVE_PASSES = 4;

// G/R IS NOT A FREE DIAL -- it is derived from B/R by a fixed CHROMA DIRECTION
//     k = (G/R - 1) / (B/R - 1)
// which says where the tint sits between a pure blue/amber axis (k = 0) and a
// cyan/olive one (k = 1), and lets B/R alone say how FAR from neutral it goes.
// The alternative -- holding the OCEAN family's off-violet-axis distance
// off = G/R - (1 + B/R)/2 constant -- was tried first and is wrong for a ladder
// that varies B/R: off is an ABSOLUTE distance, so holding it while lowering B/R
// does not make the tile less blue, it makes it GREEN. Measured on the first cut
// of this sheet: at off +17% the B/R 1.45 rung came out olive-teal.
// k = 0.60 is not invented, the finished corpus clusters there:
//   salt_flat 0.67   ice_shelf 0.63   snow_peak 0.59   tundra 0.47
// and it works on BOTH sides of neutral, so the same rule covers the cool rungs
// and the warm dusty ones.
//
// NOTE ON THE VIOLET METRIC: off-axis is still reported per rung, but it is a
// HIGH-CHROMA diagnostic. At B/R ~1.2 the entire chroma is ~17%, and snow_peak
// ships at off +3.0%, so a small off here is not the "zu lila" failure the ocean
// family hit at B/R 1.8.
const CHROMA_K = 0.60;
const grFor = (br) => 1 + CHROMA_K * (br - 1);

// ---- the ladder ------------------------------------------------------------
// TARGET, after Rudi's reversal of 2026-09-01: NOT blue glacier ice, but a real
// ICY-MOON surface -- Ganymede / Callisto / Europa. Those are dusty, cratered
// GREY worlds with a faint brown cast: ice shot through with rock and dust over
// billions of years. Clean blue ice appears there only on fresh fracture faces,
// i.e. as an ACCENT, never as the field. So the hue target is the band the
// earlier analysis had marked as the "stone bound" and treated as the abyss --
// B/R 1.10-1.27 -- and saturation goes down with it.
//
// axis 'level' : the icy moon reads as a MID GREY, so no new corpus maximum is
//                needed. The band spans from tundra's level (33.0) to
//                snow_peak's (44.7); glacier still has to be the brightest of
//                the four open ICE tiles, so it belongs in the upper half.
// axis 'hue'   : neutral vs a warm dusty cast vs a cool fresh-ice cast, all at
//                the same level and the same chroma direction k. The warm end
//                is checked against tundra (B/R 0.55 on slot 0), the only warm
//                tile of the family and the pair now worth watching.
// axis 'ref'   : one rung of the DISCARDED blue direction, kept on the sheet at
//                the new level so the reversal can be seen rather than argued.
// axis 'flat'  : contrast pulled down; plasticity is the prop layer's job.
const BR_MAIN = 1.18;
const STEPS = [
  { id: 'L32', axis: 'level', lum: 32.0, br: BR_MAIN, k: 1.00, note: 'at tundra level -- too dark to lead the family' },
  { id: 'L36', axis: 'level', lum: 36.0, br: BR_MAIN, k: 1.00, note: 'just above salt_flat 37.1 -- dusty mid grey' },
  { id: 'L40', axis: 'level', lum: 40.0, br: BR_MAIN, k: 1.00, note: 'clear of tundra, clear of the snow ceiling' },
  { id: 'L44', axis: 'level', lum: 44.0, br: BR_MAIN, k: 1.00, note: 'level with snow_peak -- as bright as fresh snow' },
  { id: 'H090', axis: 'hue', lum: 40.0, br: 0.90, k: 1.00, note: 'WARM dust/silicate cast -- check against tundra' },
  { id: 'H100', axis: 'hue', lum: 40.0, br: 1.00, k: 1.00, note: 'dead neutral grey, no cast at all' },
  { id: 'H130', axis: 'hue', lum: 40.0, br: 1.30, k: 1.00, note: 'top of the stone band -- coolest still-grey rung' },
  { id: 'X180', axis: 'ref', lum: 40.0, br: 1.80, k: 1.00, note: 'DISCARDED blue direction, shown for contrast only' },
  { id: 'L40F', axis: 'flat', lum: 40.0, br: BR_MAIN, k: 0.80, note: 'L40 at contrast 0.80 -- flatter ground for props' },
];
const RECOMMEND = 'L40';   // the rung the props panel and the mixed fields are built on

// ---- airless composite, read out of isoConstants so it cannot drift ---------
function readDarken() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'views', 'grid', 'isoConstants.ts'), 'utf8');
  const num = (n) => {
    const m = src.match(new RegExp(n + '\\s*=\\s*([0-9.]+)'));
    if (!m) throw new Error('missing ' + n + ' in isoConstants.ts');
    return parseFloat(m[1]);
  };
  const rgb = src.match(/ATMOSPHERE_DARKEN_RGB\s*=\s*'([0-9]+),\s*([0-9]+),\s*([0-9]+)'/);
  if (!rgb) throw new Error('missing ATMOSPHERE_DARKEN_RGB');
  return { a1: num('ATMOSPHERE_TERRAIN_DARKEN_MAX'), a2: num('ATMOSPHERE_STRUCTURE_DARKEN_MAX'), tint: [+rgb[1], +rgb[2], +rgb[3]] };
}
const DK = readDarken();
const KEEP = (1 - DK.a1) * (1 - DK.a2), ADDW = 1 - KEEP;
const airlessRgb = (c) => c.map((v, i) => v * KEEP + DK.tint[i] * ADDW);
/** the exact two source-over fills PlanetSurface paints on a vacuum body */
async function airlessImg(buf) {
  const md = await sharp(buf).metadata();
  const veil = (a) => sharp({ create: { width: md.width, height: md.height, channels: 4, background: { r: DK.tint[0], g: DK.tint[1], b: DK.tint[2], alpha: a } } }).png().toBuffer();
  return sharp(buf).composite([{ input: await veil(DK.a1) }, { input: await veil(DK.a2) }]).png().toBuffer();
}

// ---- measurement -----------------------------------------------------------
async function statsOf(fileOrBuf) {
  if (typeof fileOrBuf === 'string') fileOrBuf = fs.readFileSync(fileOrBuf);
  const { data, info } = await sharp(fileOrBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, N = data.length / ch;
  const s = [0, 0, 0], is = [0, 0, 0], iq = [0, 0, 0];
  let ni = 0, sat = 0, clipped = 0;
  const lv = [];
  for (let i = 0; i < data.length; i += ch) {
    for (let c = 0; c < 3; c++) s[c] += data[i + c];
    if (data[i + 3] >= 8) {
      for (let c = 0; c < 3; c++) { is[c] += data[i + c]; iq[c] += data[i + c] * data[i + c]; }
      const mx = Math.max(data[i], data[i + 1], data[i + 2]), mn = Math.min(data[i], data[i + 1], data[i + 2]);
      if (mx > 0) sat += (mx - mn) / mx;
      if (mx >= 254) clipped++;
      ni++;
    }
    if (data[i + 3] >= 250) lv.push(L709(data[i], data[i + 1], data[i + 2]));
  }
  lv.sort((a, b) => a - b);
  const m = s.map((x) => x / N), im = is.map((x) => x / ni);
  const isd = iq.map((x, k) => Math.sqrt(Math.max(0, x / ni - im[k] * im[k])));
  const am = airlessRgb(im);
  const br = im[2] / im[0], gr = im[1] / im[0];
  return {
    lum: L709(m[0], m[1], m[2]), intLum: L709(im[0], im[1], im[2]), rgb: im,
    br: br, gr: gr, offAxis: gr - (1 + br) / 2,
    sd: (isd[0] + isd[1] + isd[2]) / 3, sat: sat / ni, clip: clipped / ni,
    p99: lv[Math.floor(0.99 * lv.length)], blow: lv.filter((v) => v >= 200).length / lv.length,
    airLum: L709(am[0], am[1], am[2]),
  };
}

/** mean |dL| between 4-neighbours on fully opaque pixels -- the structure metric */
async function microContrast(fileOrBuf) {
  if (typeof fileOrBuf === 'string') fileOrBuf = fs.readFileSync(fileOrBuf);
  const { data, info } = await sharp(fileOrBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, w = info.width, h = info.height;
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) { L[p] = L709(data[p * ch], data[p * ch + 1], data[p * ch + 2]); A[p] = data[p * ch + 3]; }
  let s = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) { const p = y * w + x; if (A[p] < 200 || A[p + 1] < 200) continue; s += Math.abs(L[p] - L[p + 1]); n++; }
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) { const p = y * w + x; if (A[p] < 200 || A[p + w] < 200) continue; s += Math.abs(L[p] - L[p + w]); n++; }
  return n ? s / n : 0;
}

// ---- grade -----------------------------------------------------------------
function grade(src, ch, gains, k) {
  const out = Buffer.from(src);
  const lin = new Float32Array((out.length / ch) * 3);
  const s = [0, 0, 0];
  let n = 0;
  for (let i = 0, p = 0; i < out.length; i += ch, p += 3) {
    if (out[i + 3] < 1) { lin[p] = out[i]; lin[p + 1] = out[i + 1]; lin[p + 2] = out[i + 2]; continue; }
    const v0 = out[i] * gains[0], v1 = out[i + 1] * gains[1], v2 = out[i + 2] * gains[2];
    lin[p] = v0; lin[p + 1] = v1; lin[p + 2] = v2;
    if (out[i + 3] >= 8) { s[0] += v0; s[1] += v1; s[2] += v2; n++; }
  }
  const m = [s[0] / n, s[1] / n, s[2] / n];
  for (let i = 0, p = 0; i < out.length; i += ch, p += 3) {
    if (out[i + 3] < 1) continue;
    for (let c = 0; c < 3; c++) {
      const v = k === 1 ? lin[p + c] : m[c] + k * (lin[p + c] - m[c]);
      out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return out;
}
function canvasLumOf(buf, ch) {
  const s = [0, 0, 0];
  let N = 0;
  for (let i = 0; i < buf.length; i += ch) { s[0] += buf[i]; s[1] += buf[i + 1]; s[2] += buf[i + 2]; N++; }
  return L709(s[0] / N, s[1] / N, s[2] / N);
}
/** bisection on the global gain so the GRADED BUFFER hits `target` canvas luma */
function solveG(src, ch, tint, k, target) {
  let lo = 0.05, hi = 4.0;
  for (let it = 0; it < 26; it++) {
    const mid = (lo + hi) / 2;
    const v = canvasLumOf(grade(src, ch, [tint[0] * mid, tint[1] * mid, tint[2] * mid], k), ch);
    if (v > target) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

// ---- labels ----------------------------------------------------------------
// xml:space="preserve" is load-bearing: without it the renderer collapses the
// space runs that hold the measured columns in line.
function label(t, w, size, fill) {
  size = size || 14; fill = fill || '#c9d1d9';
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

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // ---- hero freeze guard --------------------------------------------------
  if (!fs.existsSync(HERO)) {
    fs.copyFileSync(HERO_ORIGIN, HERO);
    console.log('[hero] frozen ' + path.relative(ROOT, HERO_ORIGIN) + ' -> ' + path.relative(ROOT, HERO));
  }
  const heroBytes = fs.readFileSync(HERO), originBytes = fs.readFileSync(HERO_ORIGIN);
  console.log('[hero] frozen copy ' + (heroBytes.equals(originBytes) ? 'MATCHES' : 'DIFFERS FROM') + ' ' +
    path.relative(ROOT, HERO_ORIGIN) + ' (' + heroBytes.length + ' bytes) -- the pipeline reads ONLY the frozen copy');

  const srcRaw = await sharp(HERO).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const SRC = srcRaw.data, CH = srcRaw.info.channels;
  if (srcRaw.info.width !== TILE_W || srcRaw.info.height !== TILE_H)
    throw new Error('hero is ' + srcRaw.info.width + 'x' + srcRaw.info.height);
  const hero = await statsOf(HERO);
  hero.micro = await microContrast(path.join(TILES, 'glacier', 'glacier_2@eighth.webp'));
  hero.microFull = await microContrast(HERO);

  // ---- build every rung, correcting against the WRITTEN file ---------------
  const rungs = [];
  for (const st of STEPS) {
    const grT = grFor(st.br);
    // Closed form on the hero's interior means: after a pure per-channel gain the
    // interior mean of channel c is m_c * gain_c, so the two hue ratios pin the
    // gains up to a common factor, which the level solve then supplies.
    const tint = [1, (grT * hero.rgb[0]) / hero.rgb[1], (st.br * hero.rgb[0]) / hero.rgb[2]];
    let tgtLum = st.lum;
    const file = path.join(OUT, 'glacier_' + st.id + '.webp');
    const eighth = file.replace(/\.webp$/, '@eighth.webp');
    let m = null;
    for (let pass = 0; pass < SOLVE_PASSES; pass++) {
      const G = solveG(SRC, CH, tint, st.k, tgtLum);
      const buf = grade(SRC, CH, [tint[0] * G, tint[1] * G, tint[2] * G], st.k);
      const png = await sharp(buf, { raw: { width: TILE_W, height: TILE_H, channels: CH } }).png().toBuffer();
      await sharp(png).webp(WEBP).toFile(file);
      await sharp(png).resize(64, 32, { fit: 'fill' }).webp(WEBP).toFile(eighth);
      m = await statsOf(file);
      if (pass === SOLVE_PASSES - 1) break;
      tgtLum *= st.lum / m.lum;          // correct the solve against the file on disk
      tint[2] *= st.br / m.br;
      tint[1] *= grT / m.gr;
    }
    m.micro = await microContrast(eighth);
    m.microFull = await microContrast(file);
    rungs.push({ id: st.id, axis: st.axis, note: st.note, file: file, eighth: eighth, stats: m, png: await sharp(file).png().toBuffer() });
    console.log('[rung] ' + st.id.padEnd(5) + ' lum ' + f1(m.lum) + ' (want ' + f1(st.lum) + ')  B/R ' + f2(m.br) +
      ' (want ' + f2(st.br) + ')  G/R ' + f2(m.gr) + ' (want ' + f2(grT) + ')  offax ' + (m.offAxis * 100).toFixed(1) +
      '%  micro8 ' + f2(m.micro) + '  blow ' + (m.blow * 100).toFixed(2) + '%');
  }

  // ---- anchors ------------------------------------------------------------
  const ANCH = [
    { id: 'snow_peak_0', file: path.join(TILES, 'snow_peak', 'snow_peak_0.webp'), note: 'EARTH_LIKE fresh snow -- scale anchor, NOT a model' },
    { id: 'tundra_0', file: path.join(TILES, 'tundra', 'tundra_0.webp'), note: 'FIXED family member, the warm one -- the pair to watch' },
    { id: 'ice_shelf_0', file: path.join(TILES, 'ice_shelf', 'ice_shelf_0.webp'), note: 'FIXED family member, polar WATER (floes are props)' },
    { id: 'salt_flat_0', file: path.join(TILES, 'salt_flat', 'salt_flat_0.webp'), note: 'pale flat stone -- now inside the target hue band' },
    { id: 'cave_floor_0', file: path.join(TILES, 'cave_floor', 'cave_floor_0.webp'), note: 'grey stone with structure -- the dusty-grey reference' },
    { id: 'regolith_0', file: path.join(TILES, 'regolith', 'regolith_0.webp'), note: 'BARREN regolith (untouched original) -- closest thing to a moon surface in the corpus' },
  ].filter((a) => fs.existsSync(a.file));
  for (const a of ANCH) {
    a.stats = await statsOf(a.file);
    a.stats.micro = await microContrast(a.file.replace(/\.webp$/, '@eighth.webp'));
    a.stats.microFull = await microContrast(a.file);
    a.png = await sharp(a.file).png().toBuffer();
  }

  // ---- sheet --------------------------------------------------------------
  const PAD = 18, GAP = 10, TW_ = 300, TH_ = 150;
  const width = PAD * 2 + 4 * TW_ + 3 * GAP;
  const comp = [];
  let y = PAD;
  const line = (t, size, fill) => {
    size = size || 13;
    comp.push({ input: label(t, width - PAD * 2, size, fill || '#c9d1d9'), left: PAD, top: y });
    y += size + 7;
  };

  const HEAD = '   rung         canvasL   intL airless    B/R    G/R  offax%     sd  micro8  microF  sat%    p99   BLOW%';
  const rowOf = (id, s) => '   ' + id.padEnd(13) + f1(s.lum).padStart(5) + f1(s.intLum).padStart(7) + f1(s.airLum).padStart(8) +
    f2(s.br).padStart(7) + f2(s.gr).padStart(7) + (s.offAxis * 100).toFixed(1).padStart(8) + f1(s.sd).padStart(7) +
    f2(s.micro).padStart(8) + f2(s.microFull).padStart(8) + (s.sat * 100).toFixed(0).padStart(6) +
    f1(s.p99).padStart(7) + (s.blow * 100).toFixed(2).padStart(8);

  line('GLACIER -- GRADE LADDER off the frozen hero glacier_2.webp   (the motif is settled, only the grade is open)', 18, '#e6edf3');
  line('every number measured on the WRITTEN .webp, never on the buffer  --  ' + new Date().toISOString().slice(0, 16), 13, '#8b949e');
  y += 4;
  line('LOOK: a real ICY MOON -- Ganymede / Callisto / Europa. Dusty cratered GREY with a faint brown cast, not blue glacier ice. Blue survives only on fresh', 13, '#ffa657');
  line('   fracture faces, so it belongs in the prop/accent layer, never in the field. Target hue band B/R 1.10-1.27, i.e. what the earlier analysis called the stone bound.', 13, '#ffa657');
  line('BLOW% is the hard gate: share of opaque pixels over luma 200. All 37 finished tiles are under 1%; every tile over 1% is an untouched original. Hero = 42.8%.', 13, '#8b949e');
  line('The tile is GROUND FOR PROPS (ice blocks / seracs / bergs come from the prop layer), so a LOW micro8 is a goal here, not a loss.', 13, '#8b949e');
  line('G/R is derived from B/R at a fixed chroma direction k = (G/R-1)/(B/R-1) = ' + CHROMA_K.toFixed(2) + ' -- the value the finished corpus already clusters at (salt_flat 0.67,', 13, '#8b949e');
  line('   ice_shelf 0.63, snow_peak 0.59, tundra 0.47). It works on both sides of neutral, so the same rule covers the cool rungs and the warm dusty ones.', 13, '#8b949e');
  y += 6;
  line(HEAD, 13, '#8b949e');
  line(rowOf('HERO (raw)', hero), 13, '#ff7b72');
  for (const r of rungs) line(rowOf(r.id, r.stats), 13, r.stats.blow > 0.01 ? '#ff7b72' : (r.id === RECOMMEND ? '#7ee787' : '#c9d1d9'));
  line('   -- anchors from finished tiles, measured the same way --', 13, '#8b949e');
  for (const a of ANCH) line(rowOf(a.id, a.stats), 13, '#8b949e');
  y += 12;

  const rowPanel = async (title, subtitle, items) => {
    line(title, 16, '#e6edf3');
    if (subtitle) line(subtitle, 13, '#8b949e');
    for (let i = 0; i < items.length; i++) {
      const it = items[i], left = PAD + i * (TW_ + GAP);
      comp.push({ input: await sharp(it.png).resize(TW_, TH_, { fit: 'fill' }).png().toBuffer(), left: left, top: y });
      comp.push({ input: await sharp(await airlessImg(it.png)).resize(TW_, TH_, { fit: 'fill' }).png().toBuffer(), left: left, top: y + TH_ + 2 });
      comp.push({ input: label(it.id + '   L ' + f1(it.stats.lum) + '  B/R ' + f2(it.stats.br) + '  m8 ' + f2(it.stats.micro) + '  blow ' + (it.stats.blow * 100).toFixed(2) + '%', TW_, 12, it.id === RECOMMEND ? '#7ee787' : '#c9d1d9'), left: left, top: y + 2 * TH_ + 4 });
      if (it.note) comp.push({ input: label(it.note, TW_, 11, '#6e7681'), left: left, top: y + 2 * TH_ + 19 });
    }
    y += 2 * TH_ + 40;
  };

  await rowPanel('LEVEL LADDER at B/R ' + f2(BR_MAIN) + ' -- top row as shipped, bottom row the SAME tile on a VACUUM body (ice worlds are thin-atmosphere)',
    '   airless = keep ' + f2(KEEP) + ' of the tile + rgb(' + DK.tint + ') at ' + f2(ADDW) + ', the two fills PlanetSurface paints. tundra_0 sits at 33.0, salt_flat_0 at 37.1, snow_peak_0 at 44.7.',
    rungs.filter((r) => r.axis === 'level'));
  await rowPanel('HUE AXIS at canvas luma 40 -- same level, same chroma direction, only B/R moves. L40 above is the B/R ' + f2(BR_MAIN) + ' member.',
    '   H090 is the warm dusty end (silicates); H130 the coolest rung that still reads as stone. X180 is one rung of the DISCARDED blue direction, kept only for contrast.',
    [rungs.find((r) => r.id === 'H090'), rungs.find((r) => r.id === 'H100'), rungs.find((r) => r.id === 'H130'), rungs.find((r) => r.id === 'X180')]);
  await rowPanel('FLATNESS VARIANT + THE TWO FIXED FAMILY MEMBERS',
    '   L40F is L40 at contrast 0.80. tundra and ice_shelf are shipped ICE-family tiles and cannot move -- the ladder has to sit against them, not against snow_peak.',
    [rungs.find((r) => r.id === 'L40'), rungs.find((r) => r.id === 'L40F'),
      ANCH.find((a) => a.id === 'tundra_0'), ANCH.find((a) => a.id === 'ice_shelf_0')]);

  // ---- FAMILY ARITHMETIC ---------------------------------------------------
  // The consequence of the reversal, in numbers rather than opinion. With every
  // ICE tile going grey, the HUE leg the OCEAN family leaned on is gone, and the
  // question is what is left to separate SIX tiles that share one planet.
  {
    const recStats = rungs.find((r) => r.id === RECOMMEND).stats;
    const floor = ANCH.find((a) => a.id === 'ice_shelf_0').stats.lum;   // darkest FIXED member
    const span = recStats.lum / floor;
    const STEP = 1.35;                        // the "level carries on its own" threshold
    const fits = Math.log(span) / Math.log(STEP);
    const tun = ANCH.find((a) => a.id === 'tundra_0').stats;
    const warm = rungs.find((r) => r.id === 'H090').stats;
    y += 8;
    line('FAMILY ARITHMETIC -- what still separates the six tiles once the hue leg is gone. A count, not an opinion.', 17, '#ffa657');
    line('   The level band is bounded BELOW by ice_shelf (fixed, ' + f1(floor) + ') and ABOVE by glacier, the brightest of the four open tiles. At ' + RECOMMEND +
      ' that band is x' + f2(span) + ' wide.', 13, '#c9d1d9');
    line('   The ocean family\'s "level carries a pair on its own" floor is x' + f2(STEP) + '. x' + f2(span) + ' therefore holds ' +
      fits.toFixed(1) + ' such steps -- i.e. about ' + Math.floor(fits + 1) + ' distinguishable levels for SIX tiles.', 13, '#ff7b72');
    line('   Even at a generous x1.20 per step the band holds ' + (Math.log(span) / Math.log(1.2)).toFixed(1) + ' steps = ' +
      Math.floor(Math.log(span) / Math.log(1.2) + 1) + ' levels. LEVEL ALONE CANNOT CARRY THE FAMILY, at any glacier level inside the frame.', 13, '#ff7b72');
    line('   So the remaining legs have to be FORM, not colour: in-tile PATTERN (crater density, sulci/furrows, crack webs, polygonal frost) and the PROP layer', 13, '#c9d1d9');
    line('   (blocks/seracs on glacier, nothing on crevasse, rubble on permafrost). Both survive the vacuum darkening, which level and hue only partly do.', 13, '#c9d1d9');
    line('   Residual hue stays useful as SUPPORT, not as a leg: the warm rung H090 sits at B/R ' + f2(warm.br) + ' vs tundra ' + f2(tun.br) +
      ', dB/R ' + f2(Math.abs(warm.br - tun.br)) + ' -- still over the 0.15 floor,', 13, '#8b949e');
    line('   so a dusty glacier does NOT collide with tundra. Between two GREY tiles a dB/R of 0.1-0.2 is all there is, which is support and nothing more.', 13, '#8b949e');
    y += 8;
  }

  // play-scale strip
  y += 6;
  line('PLAY SCALE -- @eighth mip (64x32) at 4x nearest. This is the size at which the decision actually matters.', 16, '#e6edf3');
  {
    const w = 64 * 4, h = 32 * 4;
    const strip = [{ id: 'HERO', png: await sharp(path.join(TILES, 'glacier', 'glacier_2@eighth.webp')).png().toBuffer() }]
      .concat(rungs.map((r) => ({ id: r.id, png: fs.readFileSync(r.eighth) })))
      .concat(ANCH.slice(0, 3).map((a) => ({ id: a.id, png: fs.readFileSync(a.file.replace(/\.webp$/, '@eighth.webp')) })));
    for (let i = 0; i < strip.length; i++) {
      const col = i % 4, row = (i - col) / 4;
      const left = PAD + col * (w + GAP), top = y + row * (h + 22);
      comp.push({ input: await sharp(strip[i].png).resize(w, h, { fit: 'fill', kernel: 'nearest' }).png().toBuffer(), left: left, top: top });
      comp.push({ input: label(strip[i].id, w, 12, strip[i].id === RECOMMEND ? '#7ee787' : '#8b949e'), left: left, top: top + h + 2 });
    }
    y += Math.ceil(strip.length / 4) * (h + 22) + 12;
  }

  // ---- mixed iso field: recommended rung against its finished neighbours ----
  const rec = rungs.find((r) => r.id === RECOMMEND);
  const CW = 192, CHh = 96;
  const cellOf = async (f) => sharp(f).resize(CW, CHh, { fit: 'fill', kernel: 'nearest' }).png().toBuffer();
  const mixCells = [
    await cellOf(rec.eighth), await cellOf(rec.eighth),
    await cellOf(path.join(TILES, 'snow_peak', 'snow_peak_0@eighth.webp')),
    await cellOf(path.join(TILES, 'snow_peak', 'snow_peak_2@eighth.webp')),
    await cellOf(path.join(TILES, 'tundra', 'tundra_0@eighth.webp')),
    await cellOf(path.join(TILES, 'tundra', 'tundra_2@eighth.webp')),
    await cellOf(path.join(TILES, 'ice_shelf', 'ice_shelf_0@eighth.webp')),
  ];
  async function field(cells, rows, cols, seed, dark) {
    const rnd = mulberry32(seed);
    const parts = [];
    let mr = 0, mb = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = c * CW + (r % 2 ? CW / 2 : 0), yy = r * (CHh / 2);
      parts.push({ input: cells[Math.floor(rnd() * cells.length)], left: x, top: yy });
      mr = Math.max(mr, x + CW); mb = Math.max(mb, yy + CHh);
    }
    const base = await sharp({ create: { width: mr, height: mb, channels: 4, background: BGA } }).composite(parts).png().toBuffer();
    return { buf: dark ? await airlessImg(base) : base, w: mr, h: mb };
  }
  let fieldW = 0;
  for (const dark of [false, true]) {
    y += 10;
    line(dark
      ? 'SAME FIELD ON A VACUUM BODY -- ice worlds are thin-atmosphere, so THIS is the real test of the level choice.'
      : 'MIXED FIELD -- ' + RECOMMEND + ' with tundra + ice_shelf (its real ICE neighbours) AND snow_peak, which is EARTH_LIKE and can never co-occur: it is in the field'
      + ' on purpose, to show how little separates two grey tiles at play scale. @eighth mips at 3x nearest.',
      16, dark ? '#ffa657' : '#e6edf3');
    const f = await field(mixCells, 9, 5, 0x61AC, dark);
    fieldW = Math.max(fieldW, f.w);
    comp.push({ input: f.buf, left: PAD, top: y });
    y += f.h + 8;
  }

  // ---- props panel: the rung as GROUND, ice_floe at true render size --------
  // TW 48 / PROP_BASE_HEIGHT 28 from isoConstants, ICE_FLOE_VARIANT_FACTORS and
  // PROP_GROUND_INSET 1.0 from propThemes. Read and reproduced, nothing modified.
  const S = 4;
  const FTW = 48 * S, FTH = 24 * S, PBH = 28 * S;
  const FLOE_FACTOR = { 0: 0.48, 1: 0.48, 2: 0.44, 3: 0.55, 4: 0.30 };
  const floes = [];
  for (let v = 0; v < 5; v++) {
    const p = path.join(PROPS, 'ice_floe', 'ice_floe_' + v + '@quarter.webp');
    if (!fs.existsSync(p)) continue;
    const md = await sharp(p).metadata();
    const h = Math.max(2, Math.round(PBH * FLOE_FACTOR[v]));
    const w = Math.max(2, Math.round(h * (md.width / md.height)));
    floes.push({ buf: await sharp(p).resize(w, h, { fit: 'fill' }).png().toBuffer(), h: h, w: w });
  }
  if (floes.length) {
    y += 14;
    line('THE RUNG AS GROUND -- ice_floe props laid on ' + RECOMMEND + ' at TRUE render size (drawH = 28 x factor, anchor at tile centre, inset 1.0 as shipped).', 16, '#e6edf3');
    line('   PLACEHOLDER ONLY: these floes were drawn for OPEN WATER and read wrong on solid ice -- glacier needs blocks/seracs of its own. The panel exists to show', 13, '#8b949e');
    line('   that a flat rung is a GROUND and is judged with objects on it, not as a picture on its own. Left = as shipped, right = the same on a vacuum body.', 13, '#8b949e');
    const cols = 6, rows = 7;
    const groundCell = await sharp(rec.file).resize(FTW, FTH, { fit: 'fill' }).png().toBuffer();
    const rnd = mulberry32(0x1CEB10C);
    const parts = [];
    let mr = 0, mb = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = c * FTW + (r % 2 ? FTW / 2 : 0), yy = r * (FTH / 2);
      parts.push({ input: groundCell, left: x, top: yy });
      mr = Math.max(mr, x + FTW); mb = Math.max(mb, yy + FTH);
    }
    const placed = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (rnd() > 0.45) continue;                      // roughly the ice_shelf density band
      const fl = floes[Math.floor(rnd() * floes.length)];
      const x = c * FTW + (r % 2 ? FTW / 2 : 0), yy = r * (FTH / 2);
      const cx = x + FTW / 2 + Math.round((rnd() - 0.5) * 0.28 * FTW);
      const cy = yy + FTH / 2 + Math.round((rnd() - 0.5) * 0.28 * FTH);
      placed.push({ input: fl.buf, left: Math.max(0, cx - Math.round(fl.w / 2)), top: Math.max(0, cy - fl.h), sortY: cy });
    }
    placed.sort((a, b) => a.sortY - b.sortY);
    const base = await sharp({ create: { width: mr, height: mb, channels: 4, background: BGA } })
      .composite(parts.concat(placed.map((p) => ({ input: p.input, left: p.left, top: p.top })))).png().toBuffer();
    const hw = Math.round(mr / 2), hh = Math.round(mb / 2);
    const half = await sharp(base).resize(hw, hh).png().toBuffer();
    comp.push({ input: half, left: PAD, top: y });
    comp.push({ input: await airlessImg(half), left: PAD + hw + GAP, top: y });
    fieldW = Math.max(fieldW, hw * 2 + GAP);
    y += hh + 12;
  }

  const outPath = path.join(ST, '_glacier_ladder.png');
  await sharp({ create: { width: Math.max(width, PAD * 2 + fieldW), height: y + PAD, channels: 4, background: BGA } })
    .composite(comp).png().toFile(outPath);

  // ---- console table -------------------------------------------------------
  console.log('\nGLACIER LADDER -- measured on the written .webp');
  console.log(HEAD);
  console.log(rowOf('HERO (raw)', hero) + '   <-- BLOWOUT FAIL (untouched original)');
  for (const r of rungs) console.log(rowOf(r.id, r.stats) + (r.stats.blow > 0.01 ? '   <-- BLOWOUT FAIL' : ''));
  for (const a of ANCH) console.log(rowOf(a.id, a.stats));
  console.log('\n[glacier-ladder] ' + path.relative(ROOT, outPath));
  console.log('[glacier-ladder] rungs -> ' + path.relative(ROOT, OUT) + '\n');
})();
