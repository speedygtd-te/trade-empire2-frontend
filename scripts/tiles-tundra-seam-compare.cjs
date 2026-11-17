/**
 * SEAM/GRID COMPARISON, throwaway diagnostic for the tundra hero4 run.
 * Lays SHIPPED tundra, the un-corrected W082 rung and the NEW hero4 set out in
 * the SAME interlocking arrangement so the question "does the new set show more
 * tile grid than what ships today" can actually be answered by eye, plus 1:1
 * crops of a four-tile junction to look for halo / a bright rim.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const WORK = path.join(ST, 'tundra_iter2');
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };

const SETS = [
  { id: 'SHIPPED tundra (what ships today)', files: [0, 1, 2, 3].map((n) => path.join(WORK, 'src', 'tundra_' + n + '_src.webp')), col: '#ff7b72' },
  { id: 'W082 rung, gradient UNCORRECTED', files: [0, 1, 2, 3].map((n) => path.join(WORK, 'ladder', 'tundra_W082_' + n + '.webp')), col: '#6e7681' },
  { id: 'NEW hero4, plane-corrected', files: [0, 1, 2, 3].map((n) => path.join(WORK, 'final', 'tundra_' + n + '.webp')), col: '#7ee787' },
];

function label(t, w, size, fill) {
  const esc = String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + (size + 7) +
    '"><text xml:space="preserve" x="4" y="' + (size + 1) + '" font-family="monospace" font-size="' + size +
    '" fill="' + fill + '">' + esc + '</text></svg>');
}
async function isoField(files, w, h, rows, cols, pick) {
  const bufs = [];
  for (const f of files) bufs.push(await sharp(fs.readFileSync(f)).resize(w, h, { fit: 'fill' }).png().toBuffer());
  const cells = [];
  let mr = 0, mb = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * w + (r % 2 ? w / 2 : 0), y = (r * h) / 2;
    cells.push({ input: bufs[pick(r, c)], left: x, top: y });
    mr = Math.max(mr, x + w); mb = Math.max(mb, y + h);
  }
  return sharp({ create: { width: mr, height: mb, channels: 4, background: BGA } }).composite(cells).png().toBuffer();
}

(async () => {
  // --- three fields side by side, half res so all three fit in one look -----
  const W = 256, H = 128, ROWS = 8, COLS = 5;
  const panels = [];
  for (const s of SETS) panels.push(await isoField(s.files, W, H, ROWS, COLS, (r, c) => (r * 2 + c) % 4));
  const pm = await sharp(panels[0]).metadata();
  const comp = [];
  let x = 18;
  for (let i = 0; i < SETS.length; i++) {
    comp.push({ input: label(SETS[i].id, pm.width, 15, SETS[i].col), left: x, top: 10 });
    comp.push({ input: panels[i], left: x, top: 34 });
    x += pm.width + 24;
  }
  fs.writeFileSync(path.join(ST, '_tundra_hero4_gridcompare.png'),
    await sharp({ create: { width: x, height: pm.height + 46, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
  console.log('[panel] _tundra_hero4_gridcompare.png  ' + x + 'x' + (pm.height + 46));

  // --- 1:1 crop of a four-tile junction, shipped vs new ---------------------
  // full-res field, then cut a window centred on where four diamonds meet
  const CW = 700, CH = 380;
  const crops = [];
  for (const s of SETS) {
    const field = await isoField(s.files, 512, 256, 6, 4, (r, c) => (r * 2 + c) % 4);
    const fm = await sharp(field).metadata();
    const left = Math.round(fm.width / 2 - CW / 2), top = Math.round(fm.height / 2 - CH / 2);
    crops.push(await sharp(field).extract({ left, top, width: CW, height: CH }).png().toBuffer());
  }
  const cc = [];
  let cy = 10;
  for (let i = 0; i < SETS.length; i++) {
    cc.push({ input: label(SETS[i].id + '  --  1:1 crop of a four-tile junction', CW, 15, SETS[i].col), left: 18, top: cy });
    cc.push({ input: crops[i], left: 18, top: cy + 24 });
    cy += CH + 34;
  }
  fs.writeFileSync(path.join(ST, '_tundra_hero4_junction.png'),
    await sharp({ create: { width: CW + 36, height: cy + 10, channels: 4, background: BGA } }).composite(cc).png().toBuffer());
  console.log('[panel] _tundra_hero4_junction.png  ' + (CW + 36) + 'x' + (cy + 10));
})();
