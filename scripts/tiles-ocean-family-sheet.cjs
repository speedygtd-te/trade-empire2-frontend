/**
 * OCEAN-PLANET FAMILY SHEET -- can the six biomes of one planet be told apart?
 *
 * Every other review sheet in this folder looks at ONE biome. That is the wrong
 * question for an OCEAN planet: DEEP_OCEAN, REEF, KELP_FOREST, SHALLOW_WATER,
 * ISLAND and VOLCANIC_VENT are generated NEXT TO EACH OTHER on the same surface,
 * and four of the six are blue-green water. A tile that is beautiful on its own
 * and indistinguishable from its neighbour at play zoom is a failed tile. So this
 * sheet puts them side by side and, more importantly, MIXES them into one iso
 * field at the size they are actually rendered at.
 *
 * Panels
 *   1  per-biome slot row      all four slots, with the measured canvas luma
 *   2  play-scale strip        the @eighth mip (64x32) blown up 3x nearest, i.e.
 *                              what the eye gets when the map is zoomed out
 *   3  MIXED iso field         random biome per cell, seeded and reproducible --
 *                              the panel the decision is actually made on
 *
 * No fal.ai, no writes to src/. Output:
 *   assets/style-test/tiles/_ocean_family.png
 *
 * Usage: node scripts/tiles-ocean-family-sheet.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// order = darkest to brightest, so the sheet reads as a ramp and any two biomes
// that sit on the same level end up as neighbours where the clash is obvious
// volcanic_vent moved from the middle of this ramp to second place on
// 2026-08-25: it used to be the orange lava tile (canvas 29-37) and is now the
// dark hydrothermal vent field the GDD actually asks for (21.2). That puts it
// right next to deep_ocean (15.8), which is why the RISK PAIR line below calls
// it out -- these two are the sheet's real test, and their separation is
// structure and the olive sulfur haze, not brightness.
const BIOMES = [
  { id: 'deep_ocean', note: 'near-black blue-green, NO structure  [risk pair with volcanic_vent]' },
  { id: 'volcanic_vent', note: 'black chimneys + olive sulfur haze on dark rock  [risk pair with deep_ocean]' },
  { id: 'island', note: 'LAND -- warm sand, the only surface biome' },
  { id: 'reef', note: 'blue-teal coral carpet -- B/R 1.73 G/R 1.54, +17% off violet  [risk: shallow_water dG/R 0.18, kelp dB/R 0.48]' },
  { id: 'kelp_forest', note: 'dark olive-teal fronds -- B/R 1.25 G/R 1.54  [risk pair reef: dB/R 0.48 + structure x1.69, level x1.07 only]' },
  { id: 'shallow_water', note: 'pale sand bottom, seagrass, CYAN -- B/R 1.77 G/R 1.72  [risk pair reef: level x1.42 + dG/R 0.18, no structure]' },
];

const label = (t, w, size = 15, fill = '#c9d1d9') => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${size + 7}">` +
  `<text x="4" y="${size + 1}" font-family="monospace" font-size="${size}" fill="${fill}">${t}</text></svg>`
);

async function canvasLum(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, N = data.length / ch;
  const s = [0, 0, 0];
  for (let i = 0; i < data.length; i += ch) { s[0] += data[i]; s[1] += data[i + 1]; s[2] += data[i + 2]; }
  const m = s.map((x) => x / N);
  return L709(m[0], m[1], m[2]);
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

(async () => {
  const PAD = 18, GAP = 10, LBL = 22;
  const W = 300, H = 150;              // per-slot thumb in panel 1
  const comp = [];
  let y = PAD;
  const width = PAD * 2 + 4 * W + 3 * GAP;

  comp.push({ input: label('OCEAN PLANET -- all six biomes appear side by side on one surface', width - PAD * 2, 18, '#e6edf3'), left: PAD, top: y });
  y += 30;

  // --- panel 1: per-biome slot rows -----------------------------------------
  for (const b of BIOMES) {
    const lums = [];
    for (let n = 0; n < 4; n++) lums.push(await canvasLum(path.join(TILES, b.id, `${b.id}_${n}.webp`)));
    const avg = lums.reduce((a, c) => a + c, 0) / 4;
    comp.push({
      // font 13 (not the default 15): the risk-pair notes now carry both hue
      // ratios per biome and would clip out of the sheet at 15 px monospace.
      input: label(`${b.id}   canvas luma ${avg.toFixed(1)}   ${b.note}`, width - PAD * 2, 13),
      left: PAD, top: y,
    });
    y += LBL;
    for (let n = 0; n < 4; n++) {
      comp.push({
        input: await sharp(path.join(TILES, b.id, `${b.id}_${n}.webp`)).resize(W, H, { fit: 'fill' }).png().toBuffer(),
        left: PAD + n * (W + GAP), top: y,
      });
    }
    y += H + GAP;
  }

  // --- panel 2: play-scale strip (@eighth mip, 64x32, nearest x3) -----------
  y += 12;
  comp.push({ input: label('PLAY SCALE -- @eighth mip (64x32) at 3x nearest, slot 0 of each biome', width - PAD * 2, 16, '#e6edf3'), left: PAD, top: y });
  y += LBL + 2;
  {
    const w = 64 * 3, h = 32 * 3;
    for (let i = 0; i < BIOMES.length; i++) {
      const f = path.join(TILES, BIOMES[i].id, `${BIOMES[i].id}_0@eighth.webp`);
      comp.push({
        input: await sharp(f).resize(w, h, { fit: 'fill', kernel: 'nearest' }).png().toBuffer(),
        left: PAD + i * (w + GAP), top: y,
      });
      comp.push({ input: label(BIOMES[i].id, w, 12, '#8b949e'), left: PAD + i * (w + GAP), top: y + h + 2 });
    }
    y += h + 24;
  }

  // --- panel 3: mixed iso field ---------------------------------------------
  y += 14;
  comp.push({ input: label('MIXED FIELD -- random biome per cell, the actual "can you tell them apart" test', width - PAD * 2, 16, '#e6edf3'), left: PAD, top: y });
  y += LBL + 2;
  {
    const mw = 192, mh = 96;                    // unit tile in the mixed field
    const cols = Math.floor((width - PAD * 2) / mw), rows = 11;
    const halves = [];
    for (const b of BIOMES) {
      const set = [];
      for (let n = 0; n < 4; n++) {
        set.push(await sharp(path.join(TILES, b.id, `${b.id}_${n}.webp`)).resize(mw, mh, { fit: 'fill' }).png().toBuffer());
      }
      halves.push(set);
    }
    const rnd = mulberry32(0x0CEA7);
    const cells = [];
    let maxR = 0, maxB = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * mw + (r % 2 ? mw / 2 : 0), yy = r * (mh / 2);
        const b = Math.floor(rnd() * BIOMES.length), n = Math.floor(rnd() * 4);
        cells.push({ input: halves[b][n], left: x, top: yy });
        maxR = Math.max(maxR, x + mw); maxB = Math.max(maxB, yy + mh);
      }
    }
    const field = await sharp({ create: { width: maxR, height: maxB, channels: 4, background: BGA } })
      .composite(cells).png().toBuffer();
    comp.push({ input: field, left: PAD, top: y });
    y += maxB;
  }

  fs.mkdirSync(ST, { recursive: true });
  const out = path.join(ST, '_ocean_family.png');
  await sharp({ create: { width, height: y + PAD, channels: 4, background: BGA } })
    .composite(comp).png().toFile(out);
  console.log('[family sheet] ' + path.relative(ROOT, out));
})();
