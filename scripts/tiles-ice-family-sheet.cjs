/**
 * ICE-PLANET FAMILY SHEET -- can the six biomes of one ice planet be told apart?
 *
 * Same question the ocean sheet asks (scripts/tiles-ocean-family-sheet.cjs), for
 * the ICE family: GLACIER, FROZEN_LAKE, PERMAFROST, CREVASSE plus the two that
 * are already redesigned and therefore FIXED POINTS, not free variables --
 * TUNDRA and ICE_SHELF. All six generate next to each other on one surface, so
 * a tile that is lovely alone and mush next to its neighbour is a failed tile.
 *
 * TWO THINGS THIS SHEET DOES THAT THE OCEAN SHEET DID NOT
 *
 * 1. IT MEASURES INSTEAD OF ASSERTING. In the ocean sheet the per-biome notes
 *    ("B/R 1.73 G/R 1.54") were hand-typed constants that went stale the moment
 *    a tile was re-graded, and had to be chased by hand. Here every number on
 *    the sheet -- luma, hue ratios, sd, micro-contrast, and the whole pair
 *    matrix -- is computed from the files at run time. The only editable text
 *    is each biome's IDENTITY note (what the tile is supposed to depict), which
 *    is a design intent and cannot be measured.
 *
 * 2. IT SHOWS THE AIRLESS COMPOSITE. Ice worlds are typically thin-atmosphere,
 *    and PlanetSurface paints two darkening fills over the ground on such
 *    bodies (isoConstants: ATMOSPHERE_TERRAIN_DARKEN_MAX then
 *    ATMOSPHERE_STRUCTURE_DARKEN_MAX of ATMOSPHERE_DARKEN_RGB). That transform
 *    compresses the whole family toward one level, so a staircase that is
 *    comfortable on this sheet can collapse in game. The airless panel applies
 *    the EXACT same composite -- the constants are parsed out of
 *    isoConstants.ts, not copied here, so the panel follows any retune.
 *
 * Panels
 *   1  measured family table   all six, sorted by measured canvas luma
 *   2  per-biome slot rows     four slots each, measured numbers per biome
 *   3  play-scale strip        the @eighth mip (64x32) at 3x nearest
 *   4  mixed iso field         random biome per cell, seeded and reproducible
 *   5  AIRLESS mixed field     the same field under the vacuum darkening
 *   6  pair matrix             all 15 pairs, with the weak legs flagged
 *
 * Read-only. No fal.ai, no writes to src/. Output:
 *   assets/style-test/tiles/_ice_family.png
 *
 * Usage: node scripts/tiles-ice-family-sheet.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// The six biomes of an ICE planet. `note` is DESIGN INTENT -- the one thing on
// this sheet that cannot be measured. Everything else is computed.
// `fixed: true` marks the two that are already shipped in the new style: the
// staircase has to be built around them, they do not move.
// `target` is the PROPOSED redesign staircase (2026-09-01 analysis). It is the
// one block here that is a decision rather than a measurement, and it is
// labelled as such on the sheet: measured columns are computed, target columns
// are declared. Chosen so that all 15 pairs keep at least two separation legs
// UNDER the airless composite (see the airless panel) -- level, hue and
// structure, with the level leg deliberately not load-bearing anywhere,
// because level is the leg the darkening compresses.
const BIOMES = [
  {
    id: 'ice_shelf', fixed: true,
    target: { lum: 22.0, br: 2.86, gr: 2.18, micro: 4.2 },
    note: 'FIXED -- floes on open polar water. Bluest and flattest of the six.',
  },
  {
    id: 'tundra', fixed: true,
    target: { lum: 30.8, br: 0.63, gr: 0.82, micro: 8.7 },
    note: 'FIXED -- barren frozen ground, deliberately NOT blue. The only WARM tile (B/R < 1).',
  },
  {
    id: 'permafrost',
    target: { lum: 27.0, br: 1.25, gr: 1.12, micro: 15.0 },
    note: 'frozen soil -- grit and rock bound in ice. The dark, neutral, granular one; ' +
      'reads frozen through RIME SPECKS, not through blue tint.',
  },
  {
    id: 'frozen_lake',
    target: { lum: 36.0, br: 1.95, gr: 1.62, micro: 10.0 },
    note: 'a surface frozen THROUGH (vs ice_shelf = floes): dark clear ice under a ' +
      'fine bright stress-crack web.',
  },
  {
    id: 'crevasse',
    target: { lum: 41.0, br: 1.60, gr: 1.38, micro: 17.0 },
    note: 'bright ice split by FEW WIDE BLACK chasms. Highest structure; the voids ' +
      'pull its hue back toward neutral, which is its leg against glacier.',
  },
  {
    id: 'glacier',
    target: { lum: 46.0, br: 2.20, gr: 1.78, micro: 6.0 },
    note: 'smooth banded compressed ice. Brightest AND bluest AND flattest of the ice ' +
      'tiles -- all three are what keep it off crevasse.',
  },
];

// Context anchors from finished families -- not part of the ICE planet, but the
// scale the staircase has to be judged against. snow_peak matters most: it is
// approved snow in the redesigned style, i.e. the empirical answer to "how
// bright may frozen white ground be". The stone anchors are the other bound --
// ice that lands in their hue is ice that reads as grey rock.
const ANCHORS = [
  { id: 'snow_peak', note: 'approved SNOW in the new style -- the brightness ceiling that already shipped' },
  { id: 'salt_flat', note: 'pale flat STONE -- the "not ice any more" hue bound' },
  { id: 'cave_floor', note: 'grey STONE with structure -- the other "not ice any more" bound' },
  { id: 'boulder_field', note: 'grey rubble, very high structure -- recycling candidate for permafrost' },
  { id: 'deep_ocean', note: 'darkest shipped tile of any family' },
  { id: 'shallow_water', note: 'brightest shipped WATER tile' },
];

const label = (t, w, size = 15, fill = '#c9d1d9') => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${size + 7}">` +
  // xml:space="preserve" is load-bearing: without it the renderer collapses the
  // runs of spaces that hold the measured columns in line and the table becomes
  // an unreadable single run of numbers.
  `<text xml:space="preserve" x="4" y="${size + 1}" font-family="monospace" font-size="${size}" fill="${fill}">` +
  `${String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`
);

const slotFile = (b, n, suffix = '') => path.join(TILES, b, `${b}_${n}${suffix}.webp`);

/**
 * Airless darkening, read out of isoConstants.ts rather than duplicated, so
 * this sheet cannot drift away from what PlanetSurface actually paints. Two
 * sequential source-over fills of the same tint: the terrain pass over the
 * ground, then the weaker structure pass over everything.
 */
function readDarkenConstants() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'views', 'grid', 'isoConstants.ts'), 'utf8');
  const num = (name) => {
    const m = src.match(new RegExp(`${name}\\s*=\\s*([0-9.]+)`));
    if (!m) throw new Error(`could not read ${name} from isoConstants.ts`);
    return parseFloat(m[1]);
  };
  const rgbm = src.match(/ATMOSPHERE_DARKEN_RGB\s*=\s*'([0-9]+),\s*([0-9]+),\s*([0-9]+)'/);
  if (!rgbm) throw new Error('could not read ATMOSPHERE_DARKEN_RGB from isoConstants.ts');
  return {
    a1: num('ATMOSPHERE_TERRAIN_DARKEN_MAX'),
    a2: num('ATMOSPHERE_STRUCTURE_DARKEN_MAX'),
    tint: [+rgbm[1], +rgbm[2], +rgbm[3]],
    cutoff: num('ATMOSPHERE_DENSITY_CUTOFF'),
  };
}
const DK = readDarkenConstants();
/** keep = surviving fraction of the tile colour, add = the tint contribution */
const KEEP = (1 - DK.a1) * (1 - DK.a2);
const ADDW = 1 - KEEP;
const airless = (c) => c.map((v, i) => v * KEEP + DK.tint[i] * ADDW);

async function stats(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, N = data.length / ch;
  const s = [0, 0, 0], is = [0, 0, 0], iq = [0, 0, 0];
  let ni = 0, sat = 0;
  for (let i = 0; i < data.length; i += ch) {
    for (let c = 0; c < 3; c++) s[c] += data[i + c];
    if (data[i + 3] >= 8) {
      for (let c = 0; c < 3; c++) { is[c] += data[i + c]; iq[c] += data[i + c] * data[i + c]; }
      const mx = Math.max(data[i], data[i + 1], data[i + 2]);
      const mn = Math.min(data[i], data[i + 1], data[i + 2]);
      if (mx > 0) sat += (mx - mn) / mx;
      ni++;
    }
  }
  // Blowout: the share of opaque pixels above luma 200, and p99. This is the
  // number that separates an OLD tile from a REDESIGNED one more sharply than
  // the mean does. Checked across all 55 tile folders on 2026-09-01: every one
  // of the 37 redesigned tiles is under 1% (highest: caldera 0.88%), and every
  // tile above 1% is an untouched original from a family still open. A clean
  // split with no overlap. For ICE it is the load-bearing
  // style check, because ice is legitimately allowed a high mean and the mean
  // therefore cannot tell "bright ice" from "old blown-out ice".
  const lv = [];
  for (let i = 0; i < data.length; i += ch) {
    if (data[i + 3] < 250) continue;
    lv.push(L709(data[i], data[i + 1], data[i + 2]));
  }
  lv.sort((a, b) => a - b);
  const p99 = lv[Math.min(lv.length - 1, Math.floor(0.99 * lv.length))];
  const blow = lv.filter((v) => v >= 200).length / lv.length;

  const m = s.map((x) => x / N), im = is.map((x) => x / ni);
  const isd = iq.map((x, k) => Math.sqrt(Math.max(0, x / ni - im[k] * im[k])));
  const am = airless(im);
  return {
    p99, blow,
    lum: L709(m[0], m[1], m[2]),                 // canvas luma -- the shipped level
    intLum: L709(im[0], im[1], im[2]),           // interior luma -- what airLum transforms
    sd: (isd[0] + isd[1] + isd[2]) / 3,
    rgb: im, br: im[2] / im[0], gr: im[1] / im[0],
    sat: sat / ni,
    // what the same tile becomes on a vacuum body, before any prop/cloud pass
    airLum: L709(am[0], am[1], am[2]),
    airBr: am[2] / am[0], airGr: am[1] / am[0],
  };
}

/** mean |dL| between 4-neighbours, on fully opaque pixels only */
async function microContrast(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, w = info.width, h = info.height;
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    L[p] = L709(data[p * ch], data[p * ch + 1], data[p * ch + 2]);
    A[p] = data[p * ch + 3];
  }
  let s = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) {
    const p = y * w + x;
    if (A[p] < 200 || A[p + 1] < 200) continue;
    s += Math.abs(L[p] - L[p + 1]); n++;
  }
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (A[p] < 200 || A[p + w] < 200) continue;
    s += Math.abs(L[p] - L[p + w]); n++;
  }
  return n ? s / n : 0;
}

/** Family-level measurement of one biome: mean over its four slots. */
async function measure(id) {
  const per = [];
  for (let n = 0; n < 4; n++) {
    const st = await stats(slotFile(id, n));
    st.micro = await microContrast(slotFile(id, n, '@eighth'));
    st.n = n;
    per.push(st);
  }
  const avg = (f) => per.reduce((a, s) => a + f(s), 0) / per.length;
  return {
    id, per,
    lum: avg((s) => s.lum), sd: avg((s) => s.sd), micro: avg((s) => s.micro),
    br: avg((s) => s.br), gr: avg((s) => s.gr), sat: avg((s) => s.sat),
    intLum: avg((s) => s.intLum), p99: avg((s) => s.p99), blow: avg((s) => s.blow),
    airLum: avg((s) => s.airLum), airBr: avg((s) => s.airBr), airGr: avg((s) => s.airGr),
    // distance from the violet axis -- the ocean family's transferable metric
    offAxis: avg((s) => s.gr) - (1 + avg((s) => s.br)) / 2,
  };
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded iso field mixing every biome, at the mip size the map is played at. */
async function mixedField(ids, w, h, rows, cols, seed, darken) {
  const bufs = [];
  for (const id of ids) {
    const o = [];
    for (let n = 0; n < 4; n++) {
      o.push(await sharp(slotFile(id, n, '@eighth'))
        .resize(w, h, { fit: 'fill', kernel: 'nearest' }).png().toBuffer());
    }
    bufs.push(o);
  }
  const rnd = mulberry32(seed);
  const cells = [];
  let mr = 0, mb = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * w + (r % 2 ? w / 2 : 0), y = r * (h / 2);
    const set = bufs[Math.floor(rnd() * bufs.length)];
    cells.push({ input: set[Math.floor(rnd() * set.length)], left: x, top: y });
    mr = Math.max(mr, x + w); mb = Math.max(mb, y + h);
  }
  let img = sharp({ create: { width: mr, height: mb, channels: 4, background: BGA } })
    .composite(cells).png();
  if (!darken) return img.toBuffer();
  // Exactly what PlanetSurface does on a vacuum body: two source-over fills of
  // the darkening tint at their full-airlessness alphas.
  const base = await img.toBuffer();
  const veil = (a) => sharp({
    create: {
      width: mr, height: mb, channels: 4,
      background: { r: DK.tint[0], g: DK.tint[1], b: DK.tint[2], alpha: a },
    },
  }).png().toBuffer();
  return sharp(base)
    .composite([{ input: await veil(DK.a1) }, { input: await veil(DK.a2) }])
    .png().toBuffer();
}

const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2);

(async () => {
  fs.mkdirSync(ST, { recursive: true });

  // ---- measure everything up front; the sheet only formats these -----------
  const fam = [];
  for (const b of BIOMES) fam.push({ ...b, ...(await measure(b.id)) });
  fam.sort((a, b) => a.lum - b.lum);          // darkest first -- read as a ramp
  const anch = [];
  for (const a of ANCHORS) anch.push({ ...a, ...(await measure(a.id)) });

  // all 15 pairs, with the separation legs named
  const pairs = [];
  for (let i = 0; i < fam.length; i++) for (let j = i + 1; j < fam.length; j++) {
    const A = fam[i], B = fam[j];
    const level = Math.max(A.lum, B.lum) / Math.min(A.lum, B.lum);
    const dbr = Math.abs(A.br - B.br), dgr = Math.abs(A.gr - B.gr);
    const struct = Math.max(A.micro, B.micro) / Math.min(A.micro, B.micro);
    const airLevel = Math.max(A.airLum, B.airLum) / Math.min(A.airLum, B.airLum);
    // A leg "carries" when it is on its own enough to separate the pair. The
    // thresholds are the ocean family's shipped separations read back as a
    // floor: level x1.35, hue 0.15 on either ratio, structure x1.5.
    const legs = [];
    if (level >= 1.35) legs.push('level');
    if (dbr >= 0.15 || dgr >= 0.15) legs.push('hue');
    if (struct >= 1.5) legs.push('structure');
    pairs.push({ a: A.id, b: B.id, level, airLevel, dbr, dgr, struct, legs });
  }
  pairs.sort((x, y) => x.legs.length - y.legs.length || x.level - y.level);

  // ---- console report ------------------------------------------------------
  console.log(`\nICE FAMILY -- measured ${new Date().toISOString().slice(0, 10)}`);
  console.log(`airless composite: keep ${f2(KEEP)} of tile + ${f2(ADDW)} of rgb(${DK.tint})` +
    `  (a1 ${DK.a1}, a2 ${DK.a2}, cutoff ${DK.cutoff})\n`);
  // "luma" is the canvas mean (the convention the other family notes use);
  // "intL" is the interior mean and "airless" is intL after the vacuum fills,
  // so those two are the pair that may be compared with each other.
  const HEAD = '   biome           luma   intL airless   B/R   G/R offax%    sd  micro8  sat%   p99  blow%';
  const row = (r, tag) => `${tag}${r.id.padEnd(15)}` +
    `${f1(r.lum).padStart(6)}${f1(r.intLum).padStart(7)}${f1(r.airLum).padStart(8)}` +
    `${f2(r.br).padStart(6)}${f2(r.gr).padStart(6)}${(r.offAxis * 100).toFixed(1).padStart(7)}` +
    `${f1(r.sd).padStart(6)}${f2(r.micro).padStart(8)}${(r.sat * 100).toFixed(1).padStart(6)}` +
    `${f1(r.p99).padStart(6)}${(r.blow * 100).toFixed(1).padStart(7)}`;
  console.log(HEAD);
  for (const r of fam) console.log(row(r, r.fixed ? ' * ' : '   '));
  console.log('   -- anchors (other families, for scale) --');
  for (const r of anch) console.log(row(r, '   '));

  // target vs measured -- how far each tile still is from the proposed staircase
  const tgtRow = (r) => {
    const t = r.target;
    const d = (m, v) => (m - v >= 0 ? '+' : '') + (m - v).toFixed(2);
    return `   ${r.id.padEnd(15)}` +
      `lum ${f1(t.lum).padStart(5)} (${d(r.lum, t.lum).padStart(7)})   ` +
      `B/R ${f2(t.br)} (${d(r.br, t.br).padStart(6)})   ` +
      `G/R ${f2(t.gr)} (${d(r.gr, t.gr).padStart(6)})   ` +
      `micro ${f2(t.micro).padStart(5)} (${d(r.micro, t.micro).padStart(6)})` +
      (r.fixed ? '   [fixed -- delta must stay ~0]' : '');
  };
  console.log('\n   TARGET vs MEASURED  (target = declared design intent, delta = measured - target)');
  for (const r of fam) console.log(tgtRow(r));
  console.log('\n   pair                            level  airLvl   dB/R   dG/R  struct  carried by');
  for (const p of pairs) {
    console.log(`   ${(p.a + ' / ' + p.b).padEnd(30)}` +
      `x${f2(p.level).padStart(5)} x${f2(p.airLevel).padStart(5)}` +
      `${f2(p.dbr).padStart(7)}${f2(p.dgr).padStart(7)} x${f2(p.struct).padStart(5)}  ` +
      (p.legs.length ? p.legs.join('+') : 'NOTHING') +
      (p.legs.length === 1 ? '   <-- single leg' : p.legs.length === 0 ? '   <-- RISK' : ''));
  }

  // ---- baseline: freeze today's numbers once, then show drift every run ----
  // The point of a progress sheet is to hold the family against where it
  // STARTED, and a number typed into a comment goes stale the first time a
  // tile is re-graded. So the first run writes the measurement to disk and
  // every later run diffs against it. Delete the json to re-baseline.
  const BASE = path.join(ST, '_ice_family_baseline.json');
  let baselineNote = '';
  const driftLines = [];
  if (!fs.existsSync(BASE)) {
    fs.writeFileSync(BASE, JSON.stringify({
      capturedAt: new Date().toISOString(),
      note: 'pre-redesign baseline of the ICE family -- delete this file to re-baseline',
      biomes: Object.fromEntries(fam.map((b) => [b.id, {
        lum: b.lum, intLum: b.intLum, br: b.br, gr: b.gr,
        sd: b.sd, micro: b.micro, sat: b.sat, p99: b.p99, blow: b.blow,
      }])),
    }, null, 2));
    baselineNote = `baseline captured -> ${path.relative(ROOT, BASE)} (first run; later runs diff against it)`;
  } else {
    const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
    baselineNote = `DRIFT vs baseline of ${base.capturedAt.slice(0, 10)}  (${path.relative(ROOT, BASE)})`;
    for (const b of fam) {
      const o = base.biomes[b.id];
      if (!o) { driftLines.push(`   ${b.id.padEnd(15)}not in baseline`); continue; }
      const d = (n, v) => (v - n >= 0 ? '+' : '') + (v - n).toFixed(2);
      const moved = Math.abs(b.lum - o.lum) > 0.05 || Math.abs(b.br - o.br) > 0.005 ||
        Math.abs(b.micro - o.micro) > 0.05;
      driftLines.push(`   ${b.id.padEnd(15)}${moved ? 'REDONE ' : 'same   '}` +
        `luma ${d(o.lum, b.lum).padStart(7)}   B/R ${d(o.br, b.br).padStart(6)}   ` +
        `micro ${d(o.micro, b.micro).padStart(6)}   blow% ${d(o.blow * 100, b.blow * 100).padStart(6)}`);
    }
  }
  console.log(`\n   ${baselineNote}`);
  for (const l of driftLines) console.log(l);

  // ---- sheet ---------------------------------------------------------------
  const PAD = 18, GAP = 10, LBL = 22, W = 300, H = 150;
  const width = PAD * 2 + 4 * W + 3 * GAP;
  const comp = [];
  let y = PAD;
  const line = (t, size = 13, fill = '#c9d1d9') => {
    comp.push({ input: label(t, width - PAD * 2, size, fill), left: PAD, top: y });
    y += size + 8;
  };

  line('ICE PLANET -- all six biomes appear side by side on one surface', 18, '#e6edf3');
  line(`every number below is measured from the files at run time  --  ${new Date().toISOString().slice(0, 16)}`, 13, '#8b949e');
  y += 6;

  line('MEASURED FAMILY TABLE   (* = already shipped in the redesign style, fixed point)', 16, '#e6edf3');
  line('   blow% = share of opaque pixels above luma 200. Redesigned tiles run under ~1%; untouched bright originals 3-50%.', 13, '#8b949e');
  line(HEAD, 13, '#8b949e');
  for (const r of fam) line(row(r, r.fixed ? ' * ' : '   '), 13, r.fixed ? '#7ee787' : (r.blow > 0.01 ? '#ff7b72' : '#c9d1d9'));
  line('   -- anchors from finished families, for scale --', 13, '#8b949e');
  for (const r of anch) line(row(r, '   '), 13, '#8b949e');
  y += 10;

  line('TARGET vs MEASURED -- the proposed staircase. Targets are a DECLARED DECISION, everything else on this sheet is measured.', 16, '#e6edf3');
  for (const r of fam) line(tgtRow(r), 13, r.fixed ? '#7ee787' : '#c9d1d9');
  y += 10;

  if (baselineNote) line(baselineNote, 13, '#8b949e');
  for (const l of driftLines) line(l, 13, '#d29922');
  y += 10;

  line('PAIR MATRIX -- all 15 pairs, weakest first. A pair on ONE leg is a pair one retune from failing.', 16, '#e6edf3');
  line('   pair                            level  airLvl   dB/R   dG/R  struct  carried by', 13, '#8b949e');
  for (const p of pairs) {
    line(`   ${(p.a + ' / ' + p.b).padEnd(30)}x${f2(p.level).padStart(5)} x${f2(p.airLevel).padStart(5)}` +
      `${f2(p.dbr).padStart(7)}${f2(p.dgr).padStart(7)} x${f2(p.struct).padStart(5)}  ` +
      (p.legs.length ? p.legs.join('+') : 'NOTHING'),
      13, p.legs.length === 0 ? '#ff7b72' : p.legs.length === 1 ? '#d29922' : '#8b949e');
  }
  y += 14;

  // panel: per-biome slot rows
  for (const b of fam) {
    line(`${b.id}   luma ${f1(b.lum)} (airless ${f1(b.airLum)})   B/R ${f2(b.br)}  G/R ${f2(b.gr)}` +
      `   sd ${f1(b.sd)}   micro8 ${f2(b.micro)}   sat ${(b.sat * 100).toFixed(0)}%   ${b.note}`,
      13, b.fixed ? '#7ee787' : '#c9d1d9');
    for (let n = 0; n < 4; n++) {
      comp.push({
        input: await sharp(slotFile(b.id, n)).resize(W, H, { fit: 'fill' }).png().toBuffer(),
        left: PAD + n * (W + GAP), top: y,
      });
      comp.push({
        input: label(`slot ${n}  ${f1(b.per[n].lum)}`, W, 12, '#8b949e'),
        left: PAD + n * (W + GAP), top: y + H + 1,
      });
    }
    y += H + GAP + 14;
  }

  // panel: play-scale strip
  y += 12;
  line('PLAY SCALE -- @eighth mip (64x32) at 3x nearest, slot 0 of each biome, darkest first', 16, '#e6edf3');
  {
    const w = 64 * 3, h = 32 * 3;
    for (let i = 0; i < fam.length; i++) {
      comp.push({
        input: await sharp(slotFile(fam[i].id, 0, '@eighth'))
          .resize(w, h, { fit: 'fill', kernel: 'nearest' }).png().toBuffer(),
        left: PAD + i * (w + GAP), top: y,
      });
      comp.push({ input: label(fam[i].id, w, 12, '#8b949e'), left: PAD + i * (w + GAP), top: y + h + 2 });
    }
    y += h + 26;
  }

  // panel: mixed field, normal then airless
  const ids = fam.map((b) => b.id);
  let fieldW = 0;
  for (const [dark, cap] of [
    [false, 'MIXED FIELD AT PLAY SCALE -- all six interleaved, @eighth mips at 4x nearest. The panel the call is made on.'],
    [true, `SAME FIELD ON A VACUUM BODY -- keep ${f2(KEEP)} + tint rgb(${DK.tint}) at ${f2(ADDW)}.` +
      ' Ice worlds are thin-atmosphere, so THIS is the real test.'],
  ]) {
    y += 12;
    line(cap, 16, dark ? '#ffa657' : '#e6edf3');
    const field = await mixedField(ids, 256, 128, 9, 5, 0x1CE0, dark);
    const fm = await sharp(field).metadata();
    fieldW = Math.max(fieldW, fm.width);
    comp.push({ input: field, left: PAD, top: y });
    y += fm.height + 8;
  }

  const p = path.join(ST, '_ice_family.png');
  await sharp({
    create: {
      width: Math.max(width, PAD * 2 + fieldW), height: y + PAD,
      channels: 4, background: BGA,
    },
  }).composite(comp).png().toFile(p);
  console.log(`\n[ice-family] ${path.relative(ROOT, p)}\n`);
})();
