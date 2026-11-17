/** STYLE-TEST ONLY: render a 3x3 mixed iso mosaic PNG of corroded_plain slots 0-3. */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const OUT = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');
const HW = 128, HH = 64; // half-tile display step (full half-tile = 256x128)
const COLS = 6, ROWS = 6;
const SLOTS = [0, 1, 2, 3];
// deterministic-ish mixed pattern ensuring all 4 appear and 0/1 (plants) mix with 2/3 (puddle)
const PATTERN = [
  [0, 2, 1, 3, 0, 2],
  [3, 1, 2, 0, 3, 1],
  [1, 3, 0, 2, 1, 0],
  [2, 0, 3, 1, 2, 3],
  [0, 1, 2, 3, 0, 1],
  [3, 2, 1, 0, 3, 2],
];
(async () => {
  const tiles = {};
  for (const s of SLOTS) tiles[s] = await sharp(path.join(OUT, `corroded_plain_${s}_half.png`)).png().toBuffer();
  const originX = (ROWS - 1) * HW;
  let maxX = 0, maxY = 0;
  const comps = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x = (c - r) * HW + originX;
    const y = (c + r) * HH;
    comps.push({ input: tiles[PATTERN[r][c]], left: x, top: y, _z: r + c });
    if (x + 256 > maxX) maxX = x + 256;
    if (y + 128 > maxY) maxY = y + 128;
  }
  comps.sort((a, b) => a._z - b._z).forEach(c => delete c._z);
  const canvas = sharp({ create: { width: maxX, height: maxY, channels: 4, background: { r: 13, g: 15, b: 18, alpha: 1 } } });
  const out = await canvas.composite(comps).png().toBuffer();
  fs.writeFileSync(path.join(OUT, 'corroded_plain_mix_mosaic.png'), out);
  console.log(`mosaic ${maxX}x${maxY} written`);
})();
