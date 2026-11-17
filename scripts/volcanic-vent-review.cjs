/**
 * volcanic_vent REVIEW SHEETS (local only, no fal.ai, writes nothing to src/).
 *
 * scripts/tiles-water-grade.cjs already emits the standard three sheets
 * (_volcanic_vent_slots_2x2 / _before_after / _mosaic), but two questions this
 * rebuild has to answer are not covered by them:
 *
 *  1. IS IT ACTUALLY DIFFERENT FROM WHAT IT REPLACES, AND FROM ITS GROUND?
 *     The grade's own before/after only shows composite -> graded, i.e. the last
 *     5% of the work. This script overwrites _volcanic_vent_before_after.png with
 *     the comparison that matters: the archived 2026-06-27 LAVA tile, the
 *     obsidian_ridge ground it is now built from, and the shipped result.
 *
 *  2. SEAMS. _mosaic uses random slots at half scale; this adds a tight
 *     interlocked 2x2 at FULL scale, where a chimney cut by the diamond edge
 *     would show as a broken silhouette across the seam.
 *
 * THE PLAY-SCALE COMPARISON AGAINST deep_ocean USED TO LIVE HERE and was moved
 * out on 2026-08-25 to scripts/tiles-pair-check.cjs, because the same question
 * came up for a second pair (reef vs shallow_water, created by re-grading reef
 * into the blue) and two copies of that logic writing the same _A_vs_B.png
 * filename is a trap. It is still MANDATORY for this biome -- run:
 *     node scripts/tiles-pair-check.cjs volcanic_vent deep_ocean
 *
 * Usage: node scripts/volcanic-vent-review.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ARCH = path.join(ST, '_water_attempts');
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const TILE_W = 512, TILE_H = 256;
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const label = (t, w, size = 15, fill = '#c9d1d9') => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${size + 7}">` +
  `<text x="4" y="${size + 1}" font-family="monospace" font-size="${size}" fill="${fill}">${t}</text></svg>`
);

async function canvasStats(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, N = data.length / ch;
  const s = [0, 0, 0], q = [0, 0, 0];
  const is = [0, 0, 0], iq = [0, 0, 0];
  let ni = 0;
  for (let i = 0; i < data.length; i += ch) {
    for (let c = 0; c < 3; c++) { s[c] += data[i + c]; q[c] += data[i + c] * data[i + c]; }
    if (data[i + 3] >= 8) {
      for (let c = 0; c < 3; c++) { is[c] += data[i + c]; iq[c] += data[i + c] * data[i + c]; }
      ni++;
    }
  }
  const m = s.map((x) => x / N), im = is.map((x) => x / ni);
  const isd = iq.map((x, k) => Math.sqrt(Math.max(0, x / ni - im[k] * im[k])));
  return { lum: L709(m[0], m[1], m[2]), sd: (isd[0] + isd[1] + isd[2]) / 3, inner: L709(im[0], im[1], im[2]) };
}

const slots = (biome, suffix = '') =>
  [0, 1, 2, 3].map((n) => path.join(TILES, biome, `${biome}_${n}${suffix}.webp`));

(async () => {
  const PAD = 18, GAP = 12, LBL = 22;

  // ------------------------------------------------- 1. before / after -------
  {
    const W = 320, H = 160;
    const old = [0, 1, 2, 3].map((n) =>
      path.join(ARCH, `volcanic_vent_${n}_2026-06-27_LAVA_SUPERSEDED_wrong_planet.webp`));
    const oldStats = await Promise.all(old.map(canvasStats));
    const grdStats = await Promise.all(slots('obsidian_ridge').map(canvasStats));
    const newStats = await Promise.all(slots('volcanic_vent').map(canvasStats));
    const avg = (a) => (a.reduce((s, v) => s + v.lum, 0) / a.length).toFixed(1);
    const rows = [
      { t: `WAS SHIPPED  2026-06-27 lava tile, canvas luma ${avg(oldStats)}` +
           `  -- a VOLCANIC-planet look on an OCEAN biome (archived in _water_attempts/)`, b: old },
      { t: `GROUND       src/assets/tiles/obsidian_ridge/obsidian_ridge_N.webp, canvas luma ${avg(grdStats)}` +
           `  (VOLCANIC planet -- never meets volcanic_vent)`, b: slots('obsidian_ridge') },
      { t: `SHIPPED NOW  src/assets/tiles/volcanic_vent/volcanic_vent_N.webp, canvas luma ${avg(newStats)}` +
           `  -- obsidian + desaturated charred_tree chimneys + drawn sulfur plumes + ocean sheet`,
        b: slots('volcanic_vent') },
    ];
    const comp = [];
    let y = PAD;
    for (const row of rows) {
      comp.push({ input: label(row.t, 4 * W + 3 * GAP), left: PAD, top: y });
      y += LBL;
      for (let n = 0; n < 4; n++) {
        comp.push({ input: await sharp(row.b[n]).resize(W, H, { fit: 'fill' }).png().toBuffer(), left: PAD + n * (W + GAP), top: y });
      }
      y += H + GAP + 6;
    }
    const p = path.join(ST, '_volcanic_vent_before_after.png');
    await sharp({ create: { width: PAD * 2 + 4 * W + 3 * GAP, height: y + PAD, channels: 4, background: BGA } })
      .composite(comp).png().toFile(p);
    console.log('[before/after] ' + path.relative(ROOT, p));
  }

  // --------------------------------------- 2. tight interlocked 2x2 seam -----
  {
    const vv = slots('volcanic_vent');
    const cells = [];
    // four different slots meeting at one point, full scale, no gaps
    const lay = [[0, 0, 0], [1, TILE_W / 2, TILE_H / 2], [2, TILE_W, 0], [3, TILE_W * 1.5, TILE_H / 2],
      [3, TILE_W / 2, -TILE_H / 2 + TILE_H], [0, TILE_W, TILE_H], [2, 0, TILE_H], [1, TILE_W * 1.5, TILE_H * 1.5]];
    for (const [n, x, yy] of lay) cells.push({ input: fs.readFileSync(vv[n]), left: Math.round(x), top: Math.round(yy + TILE_H / 2) });
    const p = path.join(ST, '_volcanic_vent_seam_2x2.png');
    await sharp({ create: { width: TILE_W * 2 + TILE_W / 2, height: TILE_H * 3, channels: 4, background: BGA } })
      .composite(cells).png().toFile(p);
    console.log('[seam 2x2] ' + path.relative(ROOT, p));
  }
})();
