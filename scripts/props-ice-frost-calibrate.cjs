/**
 * Height-factor and density-band calibration for the frost families, computed
 * against the REAL src/views/grid/propLayout.ts (via props-layout-bridge.cjs).
 *
 * ── WHY THIS EXISTS
 *
 * The first recommendation (ice_block 0.70, ice_rubble 0.30) was derived from a
 * review sheet that drew ONE prop per tile, on the tile's south vertex, at unit
 * size. Rudi: "oft sind auf einem tile mehrere props positioniert. dafuer sind
 * die props selbst dann etwas kleiner". The shipped layer differs in four ways
 * at once, so the question a factor answers changes with it:
 *
 *   not  "how big may ONE serac be"
 *   but  "how big may TWO TO FOUR be together without closing the tile"
 *
 * ── WHAT IS REAL HERE AND WHAT IS PROPOSED
 *
 * Real: propLayout itself — the count from propCountForBiomeG, the per-instance
 * dx/dy over JITTER 0.28, the per-instance scale over PROP_SCALE_MIN 0.85 ..
 * PROP_SCALE_MAX 1.15 multiplied by the height factor, the variant draw and the
 * key hash. Nothing is mirrored.
 * Proposed: the per-biome config (keys / minCount / maxCount / minG) and the
 * height factor, because propThemes has no entry for these biomes yet and this
 * round writes nothing under src/.
 *
 * ── THE NUMBER THAT ANSWERS "ZUGEBAUT"
 *
 * INK COVER: the alpha-weighted painted area of every instance on a tile, over
 * the diamond's own area (TW x TH / 2 = 576 px^2). Alpha-weighted rather than
 * bounding box, for the reason the crater_decal round recorded: the box and the
 * paint can disagree by an order of magnitude, and it is the ink the eye sees.
 * Bounding-box cover is printed beside it because the BOX is what governs
 * overhang onto neighbouring tiles.
 *
 * `g` is sampled from the histograms measured live on the reachable MOON_ICY
 * (1 064 960 surface cells), so the distribution of empty and occupied tiles is
 * the real one rather than a uniform guess.
 *
 * ── AND THE RULE FROM THE LESSONS
 *
 * "Groesse und Dichte nie gleichzeitig senken" — so this prints TWO separate
 * ladders: one that moves the height factor at a fixed band, one that moves the
 * band at a fixed factor. Never a diagonal.
 *
 * Usage: node scripts/props-ice-frost-calibrate.cjs
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { loadPropLayout } = require('./props-layout-bridge.cjs');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const DIR_FINAL = path.join(ROOT, 'assets', 'final');
const TW = 48, TH = 24, PBH = 28;
const TILE_AREA = (TW * TH) / 2; // the diamond, 576 px^2

/** Measured live on MOON_ICY "Delta Tauri Tertius XI", 1 064 960 cells. */
const G_HIST = {
  glacier: [75.0, 18.0, 6.0, 0.9, 0.0, 0.0, 0.0],
  permafrost: [75.1, 17.9, 6.0, 1.0, 0.0, 0.0, 0.0],
  tundra: [39.9, 35.1, 18.1, 6.0, 1.0, 0.0, 0.0],
};

const VARIANTS = { ice_block: 4, ice_rubble: 5 };

/** Per-variant aspect and alpha fill, measured on the shipped pngs. */
async function spriteGeometry() {
  const geo = {};
  for (const [fam, n] of Object.entries(VARIANTS)) {
    geo[fam] = [];
    for (let i = 0; i < n; i++) {
      const f = path.join(DIR_FINAL, `${fam}_${i}.png`);
      const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let a = 0;
      for (let k = 3; k < data.length; k += 4) a += data[k] / 255;
      geo[fam].push({
        aspect: info.width / info.height,
        fill: a / (info.width * info.height), // alpha-weighted fill of the box
      });
    }
  }
  return geo;
}

/** Deterministic g sampler with the measured distribution. */
function makeG(hist, seed) {
  const cum = []; let acc = 0;
  for (const p of hist) { acc += p; cum.push(acc); }
  let rnd = seed >>> 0;
  return () => {
    rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
    const u = (rnd / 0x7fffffff) * acc;
    let g = 0; while (g < cum.length - 1 && u > cum[g]) g++;
    return g;
  };
}

/**
 * Run the real propLayout over N x N tiles and summarise what lands on them.
 * Returns per-tile instance counts and per-tile ink / box cover.
 */
function survey(L, biome, fam, geo, N = 240, seed = 20260911) {
  const nextG = makeG(G_HIST[biome], seed);
  const counts = [];
  const ink = [];
  const box = [];
  let widest = 0, tallest = 0;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const insts = L.propLayout(x, y, biome, nextG());
      counts.push(insts.length);
      let i2 = 0, b2 = 0;
      for (const inst of insts) {
        const g = geo[fam][Math.min(inst.variant, geo[fam].length - 1)];
        const drawH = PBH * inst.scale;
        const drawW = drawH * g.aspect;
        b2 += drawW * drawH;
        i2 += drawW * drawH * g.fill;
        if (drawW > widest) widest = drawW;
        if (drawH > tallest) tallest = drawH;
      }
      ink.push(i2);
      box.push(b2);
    }
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const pct = (a, p) => { const s = [...a].sort((u, v) => u - v); return s[Math.floor(p * (s.length - 1))]; };
  const share = (a, f) => (100 * a.filter(f).length) / a.length;
  return {
    n: counts.length,
    meanCount: mean(counts),
    bare: share(counts, (c) => c === 0),
    c1: share(counts, (c) => c === 1),
    c2: share(counts, (c) => c === 2),
    c3p: share(counts, (c) => c >= 3),
    maxCount: Math.max(...counts),
    inkMean: (100 * mean(ink)) / TILE_AREA,
    inkP90: (100 * pct(ink, 0.9)) / TILE_AREA,
    inkMax: (100 * Math.max(...ink)) / TILE_AREA,
    boxMean: (100 * mean(box)) / TILE_AREA,
    boxP90: (100 * pct(box, 0.9)) / TILE_AREA,
    widest, tallest,
  };
}

const row = (label, s) =>
  `${label.padEnd(34)} ${s.meanCount.toFixed(3).padStart(6)} ` +
  `${s.bare.toFixed(1).padStart(5)} ${s.c1.toFixed(1).padStart(5)} ${s.c2.toFixed(1).padStart(5)} ${s.c3p.toFixed(1).padStart(5)} ${String(s.maxCount).padStart(3)}  ` +
  `${s.inkMean.toFixed(1).padStart(6)} ${s.inkP90.toFixed(1).padStart(6)} ${s.inkMax.toFixed(1).padStart(6)}  ` +
  `${s.boxMean.toFixed(1).padStart(6)} ${s.boxP90.toFixed(1).padStart(6)}  ${s.widest.toFixed(1).padStart(5)}`;

const HEAD =
  `${'case'.padEnd(34)} ${'n/tile'.padStart(6)} ${'bare%'.padStart(5)} ${'1'.padStart(5)} ${'2'.padStart(5)} ${'3+'.padStart(5)} ${'max'.padStart(3)}  ` +
  `${'ink%'.padStart(6)} ${'p90'.padStart(6)} ${'max'.padStart(6)}  ${'box%'.padStart(6)} ${'p90'.padStart(6)}  ${'wMax'.padStart(5)}`;

function build(biome, fam, band, minG, factor) {
  const cfg = {};
  cfg[biome] = { keys: [fam], minCount: band[0], maxCount: band[1], minG };
  return loadPropLayout(cfg, VARIANTS, { [fam]: factor });
}

/** A fresh module graph per case — the bridge caches, so clear it each time. */
function fresh() {
  for (const k of Object.keys(require.cache))
    if (k.includes(path.join('src', 'views', 'grid'))) delete require.cache[k];
}

async function main() {
  const geo = await spriteGeometry();
  console.log('sprite geometry (aspect, alpha fill of the box):');
  for (const [fam, arr] of Object.entries(geo))
    console.log('  ' + fam.padEnd(11) + arr.map((g, i) => `v${i} ${g.aspect.toFixed(2)}/${(100 * g.fill).toFixed(0)}%`).join('  '));
  console.log('\nink% = alpha-weighted painted area over the 576 px^2 diamond.');
  console.log('box% = bounding-box area over the same. wMax = widest single draw, px (TW = 48).\n');

  const CASES = [
    // biome        family        band      minG  label
    ['glacier', 'ice_block', [1, 2], 0],
    ['permafrost', 'ice_rubble', [1, 2], 0],
    ['tundra', 'ice_rubble', [1, 2], 1],
  ];

  // ── LADDER 1: the HEIGHT FACTOR, band held at 1..2 ──
  console.log('── LADDER 1 — height factor, density band held at 1..2 ──');
  console.log(HEAD);
  for (const [biome, fam, band, minG] of CASES) {
    const ladder = fam === 'ice_block' ? [0.45, 0.55, 0.6, 0.7] : [0.18, 0.22, 0.26, 0.3];
    for (const f of ladder) {
      fresh();
      const L = build(biome, fam, band, minG, f);
      console.log(row(`${biome}/${fam} f=${f.toFixed(2)}`, survey(L, biome, fam, geo)));
    }
    console.log('');
  }

  // ── LADDER 2: the DENSITY BAND, factor held at the recommendation ──
  const REC = { ice_block: 0.55, ice_rubble: 0.22 };
  console.log('── LADDER 2 — density band, height factor held at the recommendation ──');
  console.log(`   (ice_block f=${REC.ice_block}, ice_rubble f=${REC.ice_rubble})`);
  console.log(HEAD);
  for (const [biome, fam, , minG] of CASES) {
    for (const band of [[1, 2], [1, 3], [1, 4], [2, 4]]) {
      fresh();
      const L = build(biome, fam, band, minG, REC[fam]);
      console.log(row(`${biome}/${fam} ${band[0]}..${band[1]}`, survey(L, biome, fam, geo)));
    }
    console.log('');
  }

  // ── the minG question, at the recommended factor and band ──
  console.log('── minG, at the recommended factor and band 1..2 ──');
  console.log(HEAD);
  for (const [biome, fam] of CASES) {
    for (const mg of [0, 1]) {
      fresh();
      const L = build(biome, fam, [1, 2], mg, REC[fam]);
      console.log(row(`${biome}/${fam} minG=${mg}`, survey(L, biome, fam, geo)));
    }
  }

  // ── for scale: what the shipped families do on their own biomes ──
  console.log('\n── for scale, the SHIPPED families through the same measurement ──');
  console.log(HEAD);
  const real = (() => { fresh(); return loadPropLayout({}, {}, {}); })();
  console.log('  (rock on mountain and tree on forest, using their real propThemes entries)');
  for (const [biome, fam, n] of [['mountain', 'rock', 6], ['forest', 'tree', 8]]) {
    fresh();
    const L = loadPropLayout({}, { [fam]: n }, {});
    const g2 = {};
    g2[fam] = [];
    const dir = path.join(ROOT, 'src', 'assets', 'props', fam);
    for (let i = 0; i < n; i++) {
      const f = path.join(dir, `${fam}_${i}.webp`);
      if (!fs.existsSync(f)) continue;
      const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let a = 0;
      for (let k = 3; k < data.length; k += 4) a += data[k] / 255;
      g2[fam].push({ aspect: info.width / info.height, fill: a / (info.width * info.height) });
    }
    const hist = biome === 'mountain' ? [50.5, 33.6, 10.1, 4.2, 1.7, 0, 0] : [1.9, 5.8, 15.7, 21.1, 22.8, 19.0, 13.6];
    G_HIST[biome] = hist;
    console.log(row(`${biome}/${fam} (shipped)`, survey(L, biome, fam, g2)));
  }
  void real;
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
