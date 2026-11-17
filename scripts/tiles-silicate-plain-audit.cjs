/**
 * SILICATE_PLAIN -- AUDIT. Read-only measurement of the four shipped slots.
 *
 * Measures on the WRITTEN .webp (libwebp drops RGB under alpha 0, so buffer
 * numbers drift). sharp.cache(false) throughout.
 *
 * Answers, in order:
 *   1. the four slots: mean L, p70 of the ground, B/R, G/R, saturation,
 *      blowout, sd  -- reproducing the numbers in the brief
 *   2. the MIRROR CONVENTION of this biome, read off the shipped files:
 *      masked mean-centred NCC of every slot against every other slot in all
 *      four orientations
 *   3. seam: boundary step / interior roughness on the interlocked mosaic
 *   4. the same four slots under the vacuum darkening the game applies
 *   5. the whole corpus under the same vacuum, for the band
 *
 * Writes nothing outside assets/style-test/tiles/silicate_plain/.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const WORK = path.join(ROOT, 'assets', 'style-test', 'tiles', 'silicate_plain');
const BIOME = 'silicate_plain';
const TILE_W = 512, TILE_H = 256;
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);

// -------------------------------------------------------------------------
function statsRaw(data, ch, w, h) {
  const N = data.length / ch;
  const s = [0, 0, 0], is = [0, 0, 0], iq = [0, 0, 0];
  let ni = 0, grey = 0, greyN = 0;
  const half = { l: 0, r: 0, t: 0, b: 0 }, hn = { l: 0, r: 0, t: 0, b: 0 };
  const lv = [];
  let satS = 0, satN = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    for (let c = 0; c < 3; c++) s[c] += data[i + c];
    if (data[i + 3] < 8) continue;
    for (let c = 0; c < 3; c++) { is[c] += data[i + c]; iq[c] += data[i + c] * data[i + c]; }
    ni++;
    const L = L709(data[i], data[i + 1], data[i + 2]);
    if (data[i + 3] >= 250) lv.push(L);
    const kx = x < w / 2 ? 'l' : 'r', ky = y < h / 2 ? 't' : 'b';
    half[kx] += L; hn[kx]++; half[ky] += L; hn[ky]++;
    const mx = Math.max(data[i], data[i + 1], data[i + 2]);
    const mn = Math.min(data[i], data[i + 1], data[i + 2]);
    if (mx > 0) { satS += (mx - mn) / mx; satN++; }
    greyN++; if (data[i] === data[i + 1] && data[i + 1] === data[i + 2]) grey++;
  }
  lv.sort((a, b) => a - b);
  const m = s.map((x) => x / N), im = is.map((x) => x / ni);
  const isd = iq.map((x, k) => Math.sqrt(Math.max(0, x / ni - im[k] * im[k])));
  const q = (p) => (lv.length ? lv[Math.min(lv.length - 1, Math.floor(lv.length * p))] : 0);
  return {
    lum: L709(m[0], m[1], m[2]), intLum: L709(im[0], im[1], im[2]), rgb: im,
    br: im[2] / im[0], gr: im[1] / im[0],
    sd: (isd[0] + isd[1] + isd[2]) / 3,
    sat: satN ? satS / satN : 0,
    greyFrac: greyN ? grey / greyN : 0,
    p50: q(0.50), p70: q(0.70), p90: q(0.90), p99: q(0.99),
    blow: lv.length ? lv.filter((v) => v >= 200).length / lv.length : 0,
    tiltX: half.l / hn.l - half.r / hn.r, tiltY: half.t / hn.t - half.b / hn.b,
  };
}
async function statsOfBuf(buf) {
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return statsRaw(r.data, r.info.channels, r.info.width, r.info.height);
}
const statsOf = async (f) => statsOfBuf(fs.readFileSync(f));

async function microContrast(buf) {
  const r = await sharp(Buffer.isBuffer(buf) ? buf : fs.readFileSync(buf)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) { L[p] = L709(r.data[p * ch], r.data[p * ch + 1], r.data[p * ch + 2]); A[p] = r.data[p * ch + 3]; }
  let s = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) { const p = y * w + x; if (A[p] < 200 || A[p + 1] < 200) continue; s += Math.abs(L[p] - L[p + 1]); n++; }
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) { const p = y * w + x; if (A[p] < 200 || A[p + w] < 200) continue; s += Math.abs(L[p] - L[p + w]); n++; }
  return n ? s / n : 0;
}

// ---- NCC ----------------------------------------------------------------
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
const ORI = { id: (s) => s.clone(), flop: (s) => s.clone().flop(), flip: (s) => s.clone().flip(), r180: (s) => s.clone().rotate(180) };
async function nccAll(bufA, bufB) {
  const a = await lumaA(bufA);
  const out = {};
  for (const k of Object.keys(ORI)) out[k] = nccOf(a, await lumaA(await ORI[k](sharp(bufB)).png().toBuffer()));
  return out;
}

// ---- iso field + seam ----------------------------------------------------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
async function isoField(bufs4, w, h, rows, cols, pick) {
  const bufs = [];
  for (const f of bufs4) bufs.push(await sharp(Buffer.isBuffer(f) ? f : fs.readFileSync(f)).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer());
  const cells = [];
  let mr = 0, mb = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const slot = pick(r, c);
    const x = c * w + (r % 2 ? w / 2 : 0), y = (r * h) / 2;
    cells.push({ input: bufs[slot], left: x, top: y, slot: slot });
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

// ---- vacuum -------------------------------------------------------------
const VAC_A = 0.45, VAC_RGB = [5, 10, 25];
async function vacuum(buf) {
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels;
  for (let p = 0; p < r.info.width * r.info.height; p++)
    for (let c = 0; c < 3; c++) r.data[p * ch + c] = Math.round(r.data[p * ch + c] * (1 - VAC_A) + VAC_RGB[c] * VAC_A);
  return sharp(r.data, { raw: { width: r.info.width, height: r.info.height, channels: ch } }).png().toBuffer();
}

// =========================================================================
(async () => {
  fs.mkdirSync(WORK, { recursive: true });
  const dir = path.join(TILES, BIOME);
  const files = [0, 1, 2, 3].map((n) => path.join(dir, BIOME + '_' + n + '.webp'));

  console.log('=== 1. the four shipped slots, measured on the written .webp ===');
  console.log('slot   mean    p50    p70    p90    B/R     G/R     sat%   blow%   sd     micro8  greyPx%  tiltX  tiltY');
  const S = [];
  for (let n = 0; n < 4; n++) {
    const s = await statsOf(files[n]);
    s.micro = await microContrast(path.join(dir, BIOME + '_' + n + '@eighth.webp'));
    S.push(s);
    console.log('  ' + n + '  ' + f1(s.lum).padStart(6) + ' ' + f1(s.p50).padStart(6) + ' ' + f1(s.p70).padStart(6) + ' ' + f1(s.p90).padStart(6) +
      '  ' + f3(s.br) + '  ' + f3(s.gr) + '  ' + f1(100 * s.sat).padStart(5) + '  ' + f1(100 * s.blow).padStart(5) +
      '  ' + f1(s.sd).padStart(5) + '   ' + f2(s.micro).padStart(5) + '   ' + f1(100 * s.greyFrac).padStart(5) +
      '  ' + f2(s.tiltX).padStart(6) + ' ' + f2(s.tiltY).padStart(6));
  }

  console.log('');
  console.log('=== 2. mirror convention: masked mean-centred NCC, slot vs slot, all 4 orientations ===');
  const bufs = files.map((f) => fs.readFileSync(f));
  console.log('pair      id      flop    flip    r180    <- winner');
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
    const r = await nccAll(bufs[a], bufs[b]);
    const win = Object.keys(r).sort((x, y) => Math.abs(r[y]) - Math.abs(r[x]))[0];
    console.log('  ' + a + ' vs ' + b + '   ' + ['id', 'flop', 'flip', 'r180'].map((k) => f3(r[k]).padStart(6)).join('  ') +
      '   ' + win + ' ' + f3(r[win]));
  }

  console.log('');
  console.log('=== 3. seam on the interlocked mosaic (10x6 full-size tiles, random slots) ===');
  const rnd = mulberry32(4242);
  const F = await isoField(bufs, TILE_W, TILE_H, 10, 6, () => Math.floor(rnd() * 4));
  const Lf = await lumaOf(F.png);
  const bs = boundaryStep(Object.assign({}, F, { L: Lf.L, w: Lf.w, h: Lf.h }));
  console.log('  step ' + f2(bs.step) + '   rough ' + f2(bs.rough) + '   ratio ' + f3(bs.ratio));
  fs.writeFileSync(path.join(WORK, 'AUDIT_mosaic.png'), await sharp(F.png).extract({ left: 512, top: 256, width: 1536, height: 768 }).png().toBuffer());

  console.log('');
  console.log('=== 4. under the vacuum darkening (a=' + VAC_A + ', toward rgb ' + VAC_RGB.join('/') + ') ===');
  console.log('slot   mean    p70    p90    B/R     G/R     blow%   sd');
  for (let n = 0; n < 4; n++) {
    const v = await statsOfBuf(await vacuum(bufs[n]));
    console.log('  ' + n + '  ' + f1(v.lum).padStart(6) + ' ' + f1(v.p70).padStart(6) + ' ' + f1(v.p90).padStart(6) +
      '  ' + f3(v.br) + '  ' + f3(v.gr) + '  ' + f1(100 * v.blow).padStart(5) + '  ' + f1(v.sd).padStart(5));
  }

  console.log('');
  console.log('=== 5. the rest of the corpus under the same vacuum, for the band ===');
  const fams = fs.readdirSync(TILES).filter((d) => fs.statSync(path.join(TILES, d)).isDirectory());
  const rows = [];
  for (const fam of fams) {
    const f0 = path.join(TILES, fam, fam + '_0.webp');
    if (!fs.existsSync(f0)) continue;
    let L = 0, p70 = 0, bl = 0, blv = 0, nn = 0;
    for (let n = 0; n < 4; n++) {
      const f = path.join(TILES, fam, fam + '_' + n + '.webp');
      if (!fs.existsSync(f)) continue;
      const raw = await statsOf(f);
      const vac = await statsOfBuf(await vacuum(fs.readFileSync(f)));
      L += vac.lum; p70 += vac.p70; bl += raw.blow; blv += vac.blow; nn++;
    }
    if (nn) rows.push({ fam, L: L / nn, p70: p70 / nn, blow: bl / nn, vblow: blv / nn });
  }
  rows.sort((a, b) => b.L - a.L);
  console.log('  biome              vacL   vacP70  rawBlow%  vacBlow%');
  for (const r of rows) console.log('  ' + r.fam.padEnd(18) + f1(r.L).padStart(5) + '  ' + f1(r.p70).padStart(6) +
    '   ' + f1(100 * r.blow).padStart(6) + '   ' + f1(100 * r.vblow).padStart(6));
  console.log('');
  console.log('done');
})();
