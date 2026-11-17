/**
 * SILICATE_PLAIN -- VERIFY THE PICKED SLOT 0 BEFORE (and after) INTEGRATION.
 *
 * Reads a candidate .webp and puts it in slot 0 next to the three untouched
 * keepers. Nothing is written to src/assets/tiles/ here.
 *
 *   PICK=cand/slot0_d5p460_BR-F.webp node scripts/tiles-silicate-plain-verify.cjs
 *   PICK=ship node scripts/tiles-silicate-plain-verify.cjs      (after integrating)
 *
 * Produces
 *   VERIFY_slots.png     the four slots, new one first
 *   VERIFY_mosaic_old.png / VERIFY_mosaic_new.png    interlocked, same seed
 *   VERIFY_2x2_old.png   / VERIFY_2x2_new.png        the 2x2 stamp
 *   VERIFY_vacuum.png    the four slots under the game's vacuum darkening
 * and the numbers on stdout.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const BIOME = 'silicate_plain';
const WORK = path.join(ROOT, 'assets', 'style-test', 'tiles', BIOME);
const SRCD = path.join(WORK, 'src');
const TILE_W = 512, TILE_H = 256;
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const VAC_A = 0.45, VAC_RGB = [5, 10, 25];   // ATMOSPHERE_TERRAIN_DARKEN_MAX / ATMOSPHERE_DARKEN_RGB
const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);

function statsRaw(data, ch, w, h) {
  const is = [0, 0, 0], iq = [0, 0, 0];
  let ni = 0;
  const half = { l: 0, r: 0, t: 0, b: 0 }, hn = { l: 0, r: 0, t: 0, b: 0 };
  const lv = [];
  let satS = 0, satN = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (data[i + 3] < 8) continue;
    for (let c = 0; c < 3; c++) { is[c] += data[i + c]; iq[c] += data[i + c] * data[i + c]; }
    ni++;
    const L = L709(data[i], data[i + 1], data[i + 2]);
    if (data[i + 3] >= 250) lv.push(L);
    const kx = x < w / 2 ? 'l' : 'r', ky = y < h / 2 ? 't' : 'b';
    half[kx] += L; hn[kx]++; half[ky] += L; hn[ky]++;
    const mx = Math.max(data[i], data[i + 1], data[i + 2]), mn = Math.min(data[i], data[i + 1], data[i + 2]);
    if (mx > 0) { satS += (mx - mn) / mx; satN++; }
  }
  lv.sort((a, b) => a - b);
  const im = is.map((x) => x / ni);
  const isd = iq.map((x, k) => Math.sqrt(Math.max(0, x / ni - im[k] * im[k])));
  const q = (p) => (lv.length ? lv[Math.min(lv.length - 1, Math.floor(lv.length * p))] : 0);
  return {
    mean: L709(im[0], im[1], im[2]), br: im[2] / im[0], gr: im[1] / im[0],
    sd: (isd[0] + isd[1] + isd[2]) / 3, sat: satN ? satS / satN : 0,
    p50: q(0.50), p70: q(0.70), p90: q(0.90),
    blow: lv.length ? lv.filter((v) => v >= 200).length / lv.length : 0,
    clip: lv.length ? lv.filter((v) => v >= 254).length / lv.length : 0,
    tiltX: half.l / hn.l - half.r / hn.r, tiltY: half.t / hn.t - half.b / hn.b,
  };
}
async function statsOfBuf(buf) {
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return statsRaw(r.data, r.info.channels, r.info.width, r.info.height);
}
async function microContrast(buf) {
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) { L[p] = L709(r.data[p * ch], r.data[p * ch + 1], r.data[p * ch + 2]); A[p] = r.data[p * ch + 3]; }
  let s = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) { const p = y * w + x; if (A[p] < 200 || A[p + 1] < 200) continue; s += Math.abs(L[p] - L[p + 1]); n++; }
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) { const p = y * w + x; if (A[p] < 200 || A[p + w] < 200) continue; s += Math.abs(L[p] - L[p + w]); n++; }
  return n ? s / n : 0;
}
async function lumaA(buf) {
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) { L[p] = L709(r.data[p * ch], r.data[p * ch + 1], r.data[p * ch + 2]); A[p] = r.data[p * ch + 3]; }
  return { L, A, w, h };
}
function nccOf(a, b) {
  let n = 0, sa = 0, sb = 0;
  for (let p = 0; p < a.L.length; p++) { if (a.A[p] < 250 || b.A[p] < 250) continue; sa += a.L[p]; sb += b.L[p]; n++; }
  if (!n) return 0; sa /= n; sb /= n;
  let num = 0, da = 0, db = 0;
  for (let p = 0; p < a.L.length; p++) { if (a.A[p] < 250 || b.A[p] < 250) continue; const x = a.L[p] - sa, y = b.L[p] - sb; num += x * y; da += x * x; db += y * y; }
  return (da > 0 && db > 0) ? num / Math.sqrt(da * db) : 0;
}
function highpass(a, k) {
  const { L, A, w, h } = a;
  const H = new Float32Array(w * h);
  const S = new Float64Array((w + 1) * (h + 1)), N = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, q = (y + 1) * (w + 1) + (x + 1);
    const v = A[p] >= 250 ? L[p] : 0, m = A[p] >= 250 ? 1 : 0;
    S[q] = v + S[q - 1] + S[q - w - 1] - S[q - w - 2];
    N[q] = m + N[q - 1] + N[q - w - 1] - N[q - w - 2];
  }
  const box = (x0, y0, x1, y1, T) => T[(y1 + 1) * (w + 1) + (x1 + 1)] - T[y0 * (w + 1) + (x1 + 1)] - T[(y1 + 1) * (w + 1) + x0] + T[y0 * (w + 1) + x0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (A[p] < 250) { H[p] = 0; continue; }
    const x0 = Math.max(0, x - k), x1 = Math.min(w - 1, x + k), y0 = Math.max(0, y - k), y1 = Math.min(h - 1, y + k);
    const n = box(x0, y0, x1, y1, N);
    H[p] = L[p] - (n > 0 ? box(x0, y0, x1, y1, S) / n : L[p]);
  }
  return { L: H, A, w, h };
}
const ORI = { id: (s) => s.clone(), flop: (s) => s.clone().flop(), flip: (s) => s.clone().flip(), r180: (s) => s.clone().rotate(180) };
async function nccAll(bufA, bufB, hp) {
  let a = await lumaA(bufA);
  if (hp) a = highpass(a, hp);
  const out = {};
  for (const k of Object.keys(ORI)) {
    let b = await lumaA(await ORI[k](sharp(bufB)).png().toBuffer());
    if (hp) b = highpass(b, hp);
    out[k] = nccOf(a, b);
  }
  return out;
}
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
async function isoField(bufs, w, h, rows, cols, pick) {
  const px = [];
  for (const f of bufs) px.push(await sharp(f).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer());
  const cells = [];
  let mr = 0, mb = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const slot = pick(r, c);
    const x = c * w + (r % 2 ? w / 2 : 0), y = (r * h) / 2;
    cells.push({ input: px[slot], left: x, top: y, slot });
    mr = Math.max(mr, x + w); mb = Math.max(mb, y + h);
  }
  const png = await sharp({ create: { width: mr, height: mb, channels: 4, background: BGA } })
    .composite(cells.map((c) => ({ input: c.input, left: c.left, top: c.top }))).png().toBuffer();
  return { png, cells, w: mr, h: mb, tw: w, th: h };
}
async function lumaOf(png) {
  const r = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const L = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) L[p] = L709(r.data[p * ch], r.data[p * ch + 1], r.data[p * ch + 2]);
  return { L, w, h };
}
function boundaryStep(F) {
  const L = F.L, w = F.w, h = F.h, cells = F.cells, W = F.tw, H = F.th;
  const at = (x, y) => (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) ? null : L[Math.round(y) * w + Math.round(x)];
  const D = 4;
  const nrm = { UL: [1, 1], UR: [-1, 1], LL: [1, -1], LR: [-1, -1] };
  let s = 0, n = 0;
  for (const c of cells) {
    if (c.left < W || c.top < H / 2 || c.left + W > w - W || c.top + H > h - H / 2) continue;
    for (const e of ['UL', 'UR', 'LL', 'LR']) {
      const enx = nrm[e][0], eny = nrm[e][1];
      for (let t = 0.18; t <= 0.82; t += 0.02) {
        let ex, ey;
        if (e === 'UL') { ex = c.left + t * (W / 2); ey = c.top + H / 2 - t * (H / 2); }
        else if (e === 'UR') { ex = c.left + W / 2 + t * (W / 2); ey = c.top + t * (H / 2); }
        else if (e === 'LL') { ex = c.left + t * (W / 2); ey = c.top + H / 2 + t * (H / 2); }
        else { ex = c.left + W / 2 + t * (W / 2); ey = c.top + H - t * (H / 2); }
        const len = Math.hypot(enx, eny * 2);
        const ux = enx / len, uy = (eny * 2 / len) / 2;
        const a = at(ex + ux * D, ey + uy * D), b = at(ex - ux * D, ey - uy * D);
        if (a === null || b === null || a < 2 || b < 2) continue;
        s += Math.abs(a - b); n++;
      }
    }
  }
  let is = 0, ino = 0;
  for (const c of cells) {
    if (c.left < W || c.top < H / 2 || c.left + W > w - W || c.top + H > h - H / 2) continue;
    for (let dy = -40; dy <= 40; dy += 7) for (let dx = -120; dx <= 120; dx += 11) {
      const x = c.left + W / 2 + dx, y = c.top + H / 2 + dy;
      const a = at(x - 4, y), b = at(x + 4, y);
      if (a === null || b === null || a < 2 || b < 2) continue;
      is += Math.abs(a - b); ino++;
    }
  }
  return { step: n ? s / n : 0, rough: ino ? is / ino : 0, ratio: (ino && n) ? (s / n) / (is / ino) : 0 };
}
async function seamOf(bufs, seed) {
  const rnd = mulberry32(seed || 4242);
  const F = await isoField(bufs, TILE_W, TILE_H, 10, 6, () => Math.floor(rnd() * bufs.length));
  const Lf = await lumaOf(F.png);
  return { bs: boundaryStep(Object.assign({}, F, { L: Lf.L, w: Lf.w, h: Lf.h })), png: F.png };
}
async function vacuum(buf) {
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels;
  for (let p = 0; p < r.info.width * r.info.height; p++)
    for (let c = 0; c < 3; c++) r.data[p * ch + c] = Math.round(r.data[p * ch + c] * (1 - VAC_A) + VAC_RGB[c] * VAC_A);
  return sharp(r.data, { raw: { width: r.info.width, height: r.info.height, channels: ch } }).png().toBuffer();
}
function label(t, w, size, fill) {
  size = size || 14; fill = fill || '#ffd166';
  const esc = String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + (size + 8) + '">' +
    '<text xml:space="preserve" x="4" y="' + (size + 1) + '" font-family="monospace" font-size="' + size + '" fill="' + fill + '">' + esc + '</text></svg>');
}
/** the 2x2 stamp: four tiles in one lattice block, the arrangement a repeat shows up in */
async function stamp2x2(bufs) {
  const F = await isoField(bufs, TILE_W, TILE_H, 4, 3, (r, c) => (r % 2) * 2 + (c % 2));
  return sharp(F.png).extract({ left: 256, top: 128, width: 1024, height: 512 }).flatten({ background: BGA }).png().toBuffer();
}

(async () => {
  const PICK = process.env.PICK || 'cand/slot0_d5p460_BR-F.webp';
  const keep = [1, 2, 3].map((n) => fs.readFileSync(path.join(SRCD, BIOME + '_' + n + '_src.webp')));
  const oldS0 = fs.readFileSync(path.join(SRCD, BIOME + '_0_src.webp'));
  const newS0 = PICK === 'ship'
    ? fs.readFileSync(path.join(TILES, BIOME, BIOME + '_0.webp'))
    : fs.readFileSync(path.join(WORK, PICK));
  console.log('[pick] ' + PICK);
  console.log('');

  const OLD = [oldS0].concat(keep), NEW = [newS0].concat(keep);

  console.log('=== the four slots, measured on the written .webp ===');
  console.log('                 mean    p70    p90    B/R     G/R     sat%   blow%  clip%   sd    micro8  tiltX  tiltY');
  const show = async (tag, buf) => {
    const s = await statsOfBuf(buf);
    const m = await microContrast(await sharp(buf).resize(64, 32, { fit: 'fill' }).webp({ quality: 90, effort: 4, smartSubsample: true }).toBuffer());
    console.log('  ' + tag.padEnd(14) + f1(s.mean).padStart(6) + ' ' + f1(s.p70).padStart(6) + ' ' + f1(s.p90).padStart(6) +
      '  ' + f3(s.br) + '  ' + f3(s.gr) + '  ' + f1(100 * s.sat).padStart(5) + '  ' + f1(100 * s.blow).padStart(5) +
      '  ' + f2(100 * s.clip).padStart(5) + ' ' + f1(s.sd).padStart(5) + '   ' + f2(m).padStart(5) +
      '  ' + f1(s.tiltX).padStart(5) + '  ' + f1(s.tiltY).padStart(5));
    return s;
  };
  await show('slot 0 OLD', oldS0);
  await show('slot 0 NEW', newS0);
  for (let i = 0; i < 3; i++) await show('slot ' + (i + 1), keep[i]);

  console.log('');
  console.log('=== cross-correlation of the NEW slot 0 against the three keepers ===');
  console.log('     (plain NCC is dominated by the shared light ramp; the 16px high-pass is the texture answer)');
  console.log('  vs        plain: id / flop / flip / r180        high-pass: id / flop / flip / r180');
  for (let i = 0; i < 3; i++) {
    const p = await nccAll(newS0, keep[i]);
    const q = await nccAll(newS0, keep[i], 16);
    console.log('  slot ' + (i + 1) + '     ' + ['id', 'flop', 'flip', 'r180'].map((k) => f3(p[k]).padStart(7)).join(' ') +
      '       ' + ['id', 'flop', 'flip', 'r180'].map((k) => f3(q[k]).padStart(7)).join(' '));
  }
  console.log('  (for reference, the same numbers between the shipped keepers themselves:)');
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
    const p = await nccAll(keep[a], keep[b]);
    const q = await nccAll(keep[a], keep[b], 16);
    console.log('  ' + (a + 1) + ' vs ' + (b + 1) + '   ' + ['id', 'flop', 'flip', 'r180'].map((k) => f3(p[k]).padStart(7)).join(' ') +
      '       ' + ['id', 'flop', 'flip', 'r180'].map((k) => f3(q[k]).padStart(7)).join(' '));
  }

  console.log('');
  console.log('=== seam on the interlocked mosaic, same seed, before and after ===');
  const sOld = await seamOf(OLD), sNew = await seamOf(NEW), sKeep = await seamOf(keep);
  const line = (t, b) => console.log('  ' + t.padEnd(34) + 'step ' + f2(b.step).padStart(6) + '   rough ' + f2(b.rough).padStart(5) + '   ratio ' + f3(b.ratio));
  line('BEFORE  old slot 0 + 1/2/3', sOld.bs);
  line('AFTER   new slot 0 + 1/2/3', sNew.bs);
  line('the three keepers alone', sKeep.bs);

  console.log('');
  console.log('=== under the vacuum darkening (alpha ' + VAC_A + ' toward rgb ' + VAC_RGB.join('/') + ') ===');
  console.log('               mean    p70    p90    B/R     blow%   sd');
  for (const [t, b] of [['slot 0 OLD', oldS0], ['slot 0 NEW', newS0], ['slot 1', keep[0]], ['slot 2', keep[1]], ['slot 3', keep[2]]]) {
    const v = await statsOfBuf(await vacuum(b));
    console.log('  ' + t.padEnd(12) + f1(v.mean).padStart(6) + ' ' + f1(v.p70).padStart(6) + ' ' + f1(v.p90).padStart(6) +
      '  ' + f3(v.br) + '  ' + f1(100 * v.blow).padStart(5) + '  ' + f1(v.sd).padStart(5));
  }

  // ---- pictures ---------------------------------------------------------
  const cells = [];
  for (let i = 0; i < 4; i++) {
    const b = i === 0 ? newS0 : keep[i - 1];
    cells.push({ input: await sharp(b).flatten({ background: BGA }).png().toBuffer(), left: (i % 2) * 530, top: Math.floor(i / 2) * 285 });
    cells.push({ input: label((i === 0 ? 'slot 0  NEW' : 'slot ' + i + '  kept'), 300, 15, i === 0 ? '#7fffd4' : '#ffd166'), left: (i % 2) * 530 + 4, top: Math.floor(i / 2) * 285 + 258 });
  }
  await sharp({ create: { width: 1060, height: 570, channels: 4, background: BGA } }).composite(cells).png().toFile(path.join(WORK, 'VERIFY_slots.png'));
  await sharp(sOld.png).extract({ left: 512, top: 256, width: 1536, height: 768 }).png().toFile(path.join(WORK, 'VERIFY_mosaic_old.png'));
  await sharp(sNew.png).extract({ left: 512, top: 256, width: 1536, height: 768 }).png().toFile(path.join(WORK, 'VERIFY_mosaic_new.png'));
  fs.writeFileSync(path.join(WORK, 'VERIFY_2x2_old.png'), await stamp2x2(OLD));
  fs.writeFileSync(path.join(WORK, 'VERIFY_2x2_new.png'), await stamp2x2(NEW));
  const vc = [];
  for (let i = 0; i < 4; i++) {
    const b = await vacuum(i === 0 ? newS0 : keep[i - 1]);
    vc.push({ input: await sharp(b).flatten({ background: BGA }).png().toBuffer(), left: (i % 2) * 530, top: Math.floor(i / 2) * 285 });
    vc.push({ input: label((i === 0 ? 'slot 0 NEW' : 'slot ' + i) + '  under vacuum', 300, 15, '#7fffd4'), left: (i % 2) * 530 + 4, top: Math.floor(i / 2) * 285 + 258 });
  }
  await sharp({ create: { width: 1060, height: 570, channels: 4, background: BGA } }).composite(vc).png().toFile(path.join(WORK, 'VERIFY_vacuum.png'));
  console.log('');
  console.log('pictures -> ' + WORK);
})();
