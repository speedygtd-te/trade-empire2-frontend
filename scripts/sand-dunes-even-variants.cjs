/**
 * STYLE-TEST ONLY: flatten the sand_dunes i2i variants.
 *
 * flux/dev i2i (strength 0.50-0.55) on the flat sand_dunes basis keeps
 * re-interpreting the fine ripples as RAISED dune relief with bright crests +
 * dark cast shadows (the "sand kippt" / sand_mild relief problem). The ripple
 * PATTERN is the wanted variance, but the bright/dark relief contrast must go so
 * the tile reads as FLAT even desert sand like the basis.
 *
 * Fix = the 2D zone brightness egalization from beach-even-variants.cjs, applied
 * to each variant SQUARE (pre-mask). It measures mean luma in an 8x8 grid, builds
 * a smooth bilinear correction surface that pulls every zone to the global mean,
 * and adds it back. This kills the per-zone bright-crest / dark-shadow luma
 * imbalance (-> reads flat) AND any per-tile bright-center/dark-corner gradient,
 * while keeping the ripple pattern. Diamond mask re-applied after.
 *
 * Input  : assets/style-test/tiles/sand_dunes_var_v{1,2,3}.png (512x256 masked)
 * Output : overwrites the same files (+ _mosaic.png) with the equalized version.
 *
 * Usage: node scripts/sand-dunes-even-variants.cjs [v1 v2 v3]
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const TILE_W = 512, TILE_H = 256;
const OUT = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');

const DIAMOND_MASK_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}">
    <polygon points="${TILE_W / 2},0 ${TILE_W},${TILE_H / 2} ${TILE_W / 2},${TILE_H} 0,${TILE_H / 2}" fill="white"/>
  </svg>`
);

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function zoneMeans(data, width, height, channels, G) {
  const sum = new Float64Array(G * G);
  const cnt = new Float64Array(G * G);
  for (let y = 0; y < height; y++) {
    const gy = Math.min(G - 1, Math.floor((y / height) * G));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(G - 1, Math.floor((x / width) * G));
      const i = (y * width + x) * channels;
      const zi = gy * G + gx;
      sum[zi] += luma(data[i], data[i + 1], data[i + 2]);
      cnt[zi] += 1;
    }
  }
  const means = new Float64Array(G * G);
  let gsum = 0;
  for (let z = 0; z < G * G; z++) { means[z] = cnt[z] ? sum[z] / cnt[z] : 0; gsum += means[z]; }
  return { means, global: gsum / (G * G), G };
}

// 2D zone equalization on a SQUARE RGB buffer (verbatim from beach-even-variants.cjs).
async function equalize2D(squareBuf, G = 8) {
  const { data, info } = await sharp(squareBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const { means, global } = zoneMeans(data, width, height, channels, G);
  const deficit = new Float64Array(G * G);
  for (let z = 0; z < G * G; z++) deficit[z] = global - means[z];
  const cellW = width / G, cellH = height / G;
  const out = Buffer.from(data);
  for (let y = 0; y < height; y++) {
    const fy = (y + 0.5) / cellH - 0.5;
    const y0 = Math.max(0, Math.min(G - 1, Math.floor(fy)));
    const y1 = Math.max(0, Math.min(G - 1, y0 + 1));
    const ty = Math.max(0, Math.min(1, fy - y0));
    for (let x = 0; x < width; x++) {
      const fx = (x + 0.5) / cellW - 0.5;
      const x0 = Math.max(0, Math.min(G - 1, Math.floor(fx)));
      const x1 = Math.max(0, Math.min(G - 1, x0 + 1));
      const tx = Math.max(0, Math.min(1, fx - x0));
      const d00 = deficit[y0 * G + x0], d01 = deficit[y0 * G + x1];
      const d10 = deficit[y1 * G + x0], d11 = deficit[y1 * G + x1];
      const dTop = d00 + (d01 - d00) * tx;
      const dBot = d10 + (d11 - d10) * tx;
      const delta = dTop + (dBot - dTop) * ty;
      const i = (y * width + x) * channels;
      for (let c = 0; c < channels; c++) {
        let v = data[i + c] + delta;
        out[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
  return sharp(out, { raw: { width, height, channels } }).png().toBuffer();
}

async function mosaic(maskedBuf, outPath) {
  const HW = TILE_W / 2, HH = TILE_H / 2;
  const place = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) place.push({ cx: (c - r) * HW, cy: (c + r) * HH });
  const minX = Math.min(...place.map(p => p.cx));
  const maxX = Math.max(...place.map(p => p.cx));
  const maxY = Math.max(...place.map(p => p.cy));
  const canvasW = (maxX - minX) + TILE_W;
  const canvasH = maxY + TILE_H;
  const comp = place.map(p => ({ input: maskedBuf, left: p.cx - minX, top: p.cy }));
  const out = await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 } } })
    .composite(comp).png().toBuffer();
  fs.writeFileSync(outPath, out);
}

(async () => {
  const tags = process.argv.slice(2);
  const targets = (tags.length ? tags : ['v1', 'v2', 'v3']);
  for (const tag of targets) {
    const file = path.join(OUT, `sand_dunes_var_${tag}.png`);
    if (!fs.existsSync(file)) { console.error(`missing ${file}`); continue; }
    // The masked tile has transparent diamond corners; equalize on the RGB only,
    // re-apply alpha mask afterwards so corners don't poison the zone means... but
    // the file is already diamond-masked. removeAlpha() in equalize2D drops alpha
    // and treats transparent corners as black -> would bias the means. So first
    // composite over the bg colour the same way generation did, equalize, re-mask.
    const flat = await sharp(fs.readFileSync(file))
      .flatten({ background: { r: 0x14, g: 0x17, b: 0x1c } })
      .png().toBuffer();
    const eq = await equalize2D(flat, 8);
    const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
    const masked = await sharp(eq).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    fs.writeFileSync(file, masked);
    await mosaic(masked, path.join(OUT, `sand_dunes_var_${tag}_mosaic.png`));
    console.log(`[equalized] sand_dunes_var_${tag}.png (+ _mosaic)`);
  }
  console.log('done');
})();
