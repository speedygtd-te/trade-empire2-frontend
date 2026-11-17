/**
 * RISK-PAIR CHECK -- can two biomes of the same planet be told apart AT PLAY SCALE?
 *
 * The ocean-planet family sheet (scripts/tiles-ocean-family-sheet.cjs) asks that
 * question of all six biomes at once. This script asks it of ONE PAIR, in the
 * detail a decision needs, and it exists because the answer keeps changing as
 * biomes are re-graded: fixing one tile's colour moves it next to a different
 * neighbour, and the pair that was safe last week is not the pair that is at risk
 * today.
 *
 *   volcanic_vent vs deep_ocean   the two DARK tiles (21.2 / 15.8). Both are dark
 *     by GDD mandate, so the separation cannot be level -- it is structure.
 *   reef vs shallow_water         created on 2026-08-25 by pulling reef out of
 *     neutral grey into blue (B/R 1.09 -> 1.81). reef used to be trivially
 *     separable because it was the only colourless tile; now shallow_water
 *     (B/R 1.77) is its nearest neighbour in hue and the separation rests on
 *     level (28 vs 39) and structure (coral lumps vs flat sand + seagrass).
 *     2026-08-25 round 6 widened it on the GREEN axis instead: both tiles sit at
 *     B/R ~1.8, so dB/R alone reads this pair as inseparable while the eye sees
 *     blue against cyan. BOTH ratios are therefore printed and stamped -- for any
 *     given pair the separation may live in either one, and reading only dB/R
 *     would have condemned a hue gap that is actually there.
 *
 * THE METRIC THAT MATTERS IS NOT THE FULL-RESOLUTION TILE. A 512x256 sheet
 * flatters everything; the map is played zoomed out, where the @eighth mip
 * (64x32) is what the eye gets. So the panels are: full tiles for reference, the
 * @eighth mip at its true size AND at 4x nearest, and a MIXED field of the two at
 * play scale -- the panel the call is actually made on.
 *
 * Numbers printed and stamped on the sheet:
 *   canvas luma     the shipped level (whole canvas incl. transparent corners)
 *   interior sd     how much variation the tile carries at full resolution
 *   B/R, G/R        interior channel-mean ratios -- the hue separation
 *   micro-contrast  mean |dL| between 4-neighbours OF THE @eighth MIP, i.e. how
 *                   much structure actually survives downscaling. This is the
 *                   number that decides a dark pair, because two tiles can differ
 *                   a lot at 512 px and be the same grey mush at 64.
 *
 * Reads only; writes one sheet to assets/style-test/tiles/_<a>_vs_<b>.png.
 *
 * Usage:
 *   node scripts/tiles-pair-check.cjs volcanic_vent deep_ocean
 *   node scripts/tiles-pair-check.cjs reef shallow_water
 */
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const label = (t, w, size = 15, fill = '#c9d1d9') => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${size + 7}">` +
  `<text x="4" y="${size + 1}" font-family="monospace" font-size="${size}" fill="${fill}">${t}</text></svg>`
);
const slots = (b, suffix = '') =>
  [0, 1, 2, 3].map((n) => path.join(TILES, b, `${b}_${n}${suffix}.webp`));

async function stats(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, N = data.length / ch;
  const s = [0, 0, 0], is = [0, 0, 0], iq = [0, 0, 0];
  let ni = 0;
  for (let i = 0; i < data.length; i += ch) {
    for (let c = 0; c < 3; c++) s[c] += data[i + c];
    if (data[i + 3] >= 8) {
      for (let c = 0; c < 3; c++) { is[c] += data[i + c]; iq[c] += data[i + c] * data[i + c]; }
      ni++;
    }
  }
  const m = s.map((x) => x / N), im = is.map((x) => x / ni);
  const isd = iq.map((x, k) => Math.sqrt(Math.max(0, x / ni - im[k] * im[k])));
  return {
    lum: L709(m[0], m[1], m[2]),
    sd: (isd[0] + isd[1] + isd[2]) / 3,
    rgb: im, br: im[2] / im[0], gr: im[1] / im[0],
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

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function mixedField(sets, w, h, rows, cols, seed) {
  const bufs = [];
  for (const set of sets) {
    const o = [];
    for (const f of set) o.push(await sharp(f).resize(w, h, { fit: 'fill', kernel: 'nearest' }).png().toBuffer());
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
  return sharp({ create: { width: mr, height: mb, channels: 4, background: BGA } })
    .composite(cells).png().toBuffer();
}

(async () => {
  const [a, b] = process.argv.slice(2);
  if (!a || !b) {
    console.error('usage: node scripts/tiles-pair-check.cjs <biomeA> <biomeB>');
    process.exit(1);
  }
  const PAD = 18, GAP = 12, LBL = 22, W = 320, H = 160;
  const width = PAD * 2 + 4 * W + 3 * GAP;
  const comp = [];
  let y = PAD;

  const sa = await stats(slots(a)[0]), sb = await stats(slots(b)[0]);
  const ma = (await Promise.all(slots(a, '@eighth').map(microContrast))).reduce((x, v) => x + v, 0) / 4;
  const mb = (await Promise.all(slots(b, '@eighth').map(microContrast))).reduce((x, v) => x + v, 0) / 4;
  const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2);

  comp.push({ input: label(`RISK PAIR -- ${a}  vs  ${b}`, width - PAD * 2, 18, '#e6edf3'), left: PAD, top: y });
  y += 30;
  for (const [id, s, m] of [[a, sa, ma], [b, sb, mb]]) {
    comp.push({
      input: label(`${id.padEnd(15)} canvas luma ${f1(s.lum)}   interior rgb ${s.rgb.map(f1).join('/')}` +
        `   B/R ${f2(s.br)}  G/R ${f2(s.gr)}   interior sd ${f1(s.sd)}   @eighth micro-contrast ${f2(m)}`,
      width - PAD * 2),
      left: PAD, top: y,
    });
    y += LBL;
  }
  comp.push({
    input: label(`separation:  level x${f2(Math.max(sa.lum, sb.lum) / Math.min(sa.lum, sb.lum))}` +
      `   hue dB/R ${f2(Math.abs(sa.br - sb.br))}  dG/R ${f2(Math.abs(sa.gr - sb.gr))}` +
      `   play-scale structure x${f2(Math.max(ma, mb) / Math.min(ma, mb))}`, width - PAD * 2, 16, '#e6edf3'),
    left: PAD, top: y,
  });
  y += LBL + 8;

  for (const id of [a, b]) {
    comp.push({ input: label(`${id}  full 512x256`, width - PAD * 2), left: PAD, top: y });
    y += LBL;
    const fs4 = slots(id);
    for (let n = 0; n < 4; n++) {
      comp.push({ input: await sharp(fs4[n]).resize(W, H, { fit: 'fill' }).png().toBuffer(), left: PAD + n * (W + GAP), top: y });
    }
    y += H + GAP + 6;
  }

  y += 10;
  comp.push({ input: label('PLAY SCALE -- the @eighth mip at its real 64x32, then the same file at 4x nearest', width - PAD * 2, 16, '#e6edf3'), left: PAD, top: y });
  y += LBL + 2;
  for (const id of [a, b]) {
    comp.push({ input: label(`${id} @eighth`, width - PAD * 2), left: PAD, top: y });
    y += LBL;
    const fs4 = slots(id, '@eighth');
    for (let n = 0; n < 4; n++) {
      comp.push({ input: await sharp(fs4[n]).png().toBuffer(), left: PAD + n * (64 + GAP), top: y + 32 });
      comp.push({
        input: await sharp(fs4[n]).resize(256, 128, { fit: 'fill', kernel: 'nearest' }).png().toBuffer(),
        left: PAD + 4 * (64 + GAP) + 20 + n * (256 + GAP), top: y,
      });
    }
    y += 128 + GAP + 6;
  }

  y += 10;
  comp.push({ input: label(`MIXED FIELD AT PLAY SCALE -- ${a} and ${b} interleaved, @eighth mips at 4x nearest`, width - PAD * 2, 16, '#e6edf3'), left: PAD, top: y });
  y += LBL + 2;
  const field = await mixedField([slots(a, '@eighth'), slots(b, '@eighth')], 256, 128, 9, 5, 0x5E17);
  const fm = await sharp(field).metadata();
  comp.push({ input: field, left: PAD, top: y });
  y += fm.height;

  const p = path.join(ST, `_${a}_vs_${b}.png`);
  await sharp({ create: { width: Math.max(width, PAD * 2 + fm.width), height: y + PAD, channels: 4, background: BGA } })
    .composite(comp).png().toFile(p);
  console.log(`[pair] ${path.relative(ROOT, p)}`);
  console.log(`  ${a.padEnd(15)} luma ${f1(sa.lum)}  B/R ${f2(sa.br)}  G/R ${f2(sa.gr)}  sd ${f1(sa.sd)}  micro ${f2(ma)}`);
  console.log(`  ${b.padEnd(15)} luma ${f1(sb.lum)}  B/R ${f2(sb.br)}  G/R ${f2(sb.gr)}  sd ${f1(sb.sd)}  micro ${f2(mb)}`);
  console.log(`  separation: level x${f2(Math.max(sa.lum, sb.lum) / Math.min(sa.lum, sb.lum))}` +
    `  hue dB/R ${f2(Math.abs(sa.br - sb.br))}  dG/R ${f2(Math.abs(sa.gr - sb.gr))}` +
    `  play-scale structure x${f2(Math.max(ma, mb) / Math.min(ma, mb))}`);
})();
