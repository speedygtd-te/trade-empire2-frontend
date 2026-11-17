/**
 * CREVASSE ROUND 2 -- CROSS-RUNG SEAM VIEWER (style test, writes nothing to src/).
 *
 * The per-rung sheets from tiles-crevasse-r2-ladder.cjs each hold their own 2x2
 * and junction crops, but the tiling question is answered by looking at several
 * rungs ONE UNDER THE OTHER at 1:1. That is what this makes:
 *   left   the CLOSED 2x2 repeat, cropped to a junction -- every slot touches
 *          every other slot, so all four seam types are in one look
 *   right  an interlocked random draw under the VACUUM darkening
 *
 * Usage: node scripts/tiles-crevasse-r2-compare.cjs GLACIER B-5-strong B-5-balanced A-field
 *        -> assets/style-test/tiles/_crevasse2_SEAM.png
 * 'GLACIER' reads the frozen shipped glacier; any other name is a rung directory
 * under assets/style-test/tiles/crevasse2/.
 */
const fs = require('fs'), path = require('path'), sharp = require('sharp');
sharp.cache(false);
const ROOT = path.join(__dirname, '..');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const W = path.join(ST, 'crevasse2');
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const TW = 512, TH = 256;
const VAC_A = 0.45, VAC_RGB = [5, 10, 25];
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
async function field(files, rows, cols, pick) {
  const bufs = [];
  for (const f of files) bufs.push(await sharp(fs.readFileSync(f)).png().toBuffer());
  const cells = []; let mr = 0, mb = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * TW + (r % 2 ? TW / 2 : 0), y = (r * TH) / 2;
    cells.push({ input: bufs[pick(r, c)], left: x, top: y });
    mr = Math.max(mr, x + TW); mb = Math.max(mb, y + TH);
  }
  return { png: await sharp({ create: { width: mr, height: mb, channels: 4, background: BGA } }).composite(cells).png().toBuffer(), w: mr, h: mb };
}
async function vacuum(png) {
  const r = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels;
  for (let p = 0; p < r.info.width * r.info.height; p++) for (let c = 0; c < 3; c++) r.data[p * ch + c] = Math.round(r.data[p * ch + c] * (1 - VAC_A) + VAC_RGB[c] * VAC_A);
  return sharp(r.data, { raw: { width: r.info.width, height: r.info.height, channels: ch } }).png().toBuffer();
}
const label = (t, w, s, f) => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + (s + 7) + '"><text x="4" y="' + (s + 1) + '" font-family="monospace" font-size="' + s + '" fill="' + (f || '#c9d1d9') + '">' + t + '</text></svg>');

(async () => {
  const comp = []; let y = 10;
  for (const id of process.argv.slice(2)) {
    const files = [];
    for (let n = 0; n < 4; n++) {
      files.push(id === 'GLACIER'
        ? path.join(ST, 'crevasse', 'src', 'glacier_' + n + '_src.webp')
        : path.join(W, id, 'crevasse_' + n + '.webp'));
    }
    comp.push({ input: label(id + '   --   left: CLOSED 2x2 REPEAT (every slot touches every other)   |   right: interlocked random draw, under VACUUM', 2400, 17, '#e6edf3'), left: 10, top: y });
    y += 24;
    const F22 = await field(files, 4, 3, (r, c) => ((r % 2) * 2 + (c % 2)));
    const cw = 1150, chh = 540;
    comp.push({ input: await sharp(F22.png).extract({ left: 120, top: 50, width: cw, height: chh }).png().toBuffer(), left: 10, top: y });
    const rnd = mulberry32(90210);
    const FR = await field(files, 6, 4, () => Math.floor(rnd() * 4));
    const FRv = await vacuum(FR.png);
    comp.push({ input: await sharp(FRv).extract({ left: 200, top: 100, width: cw, height: chh }).png().toBuffer(), left: 10 + cw + 20, top: y });
    y += chh + 18;
  }
  const out = path.join(ST, '_crevasse2_SEAM.png');
  fs.writeFileSync(out, await sharp({ create: { width: 2450, height: y + 10, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
  console.log(out);
})();
