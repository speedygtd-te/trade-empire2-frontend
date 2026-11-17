/**
 * ORIENTATION PROBE for the glacier-from-regolith run. Throwaway diagnostic.
 *
 * Rudi widened the mirroring rules: regolith_0 and regolith_3 may be used in all
 * four orientations (id / h / v / hv), regolith_1 only unmirrored ("would look
 * upside down"), regolith_2 stays excluded. This probe does the two things that
 * decision needs:
 *
 *   (1) the full 9x9 mean-centred masked NCC matrix over
 *       {r0,h0,v0,hv0, r3,h3,v3,hv3, r1}, at full res and after blur 24 (the
 *       large-scale structure the eye reads as "same tile again"), then an
 *       exhaustive search over every 4-subset that contains r1 and every one
 *       that does not, minimising the WORST pair.
 *   (2) a 1:1 look panel of r0 and r3 in all four orientations, each already
 *       level-normalised to L 40 and re-lit to tiltY 3.0 / tiltX 0.0 (mirror
 *       FIRST, plane AFTER), so the only thing left to judge by eye is whether
 *       the baked-in crater shading inverts into domes.
 *
 * Writes only assets/style-test/tiles/_glacier_reg_orient.png.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles', 'regolith');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const WEBP = { quality: 90, effort: 4, smartSubsample: true };

const VARIANTS = [
  { id: 'r0', src: 0, h: false, v: false }, { id: 'h0', src: 0, h: true, v: false },
  { id: 'v0', src: 0, h: false, v: true }, { id: 'hv0', src: 0, h: true, v: true },
  { id: 'r3', src: 3, h: false, v: false }, { id: 'h3', src: 3, h: true, v: false },
  { id: 'v3', src: 3, h: false, v: true }, { id: 'hv3', src: 3, h: true, v: true },
  { id: 'r1', src: 1, h: false, v: false },
];

async function oriented(srcId, h, v) {
  let s = sharp(fs.readFileSync(path.join(TILES, 'regolith_' + srcId + '.webp')));
  if (h) s = s.flop();
  if (v) s = s.flip();
  return s.png().toBuffer();
}
async function lumaMask(png, blur) {
  let s = sharp(png);
  if (blur) s = s.blur(blur);
  const { data, info } = await s.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, w = info.width, h2 = info.height;
  const L = new Float32Array(w * h2), A = new Uint8Array(w * h2);
  for (let p = 0; p < w * h2; p++) {
    L[p] = L709(data[p * ch], data[p * ch + 1], data[p * ch + 2]);
    A[p] = data[p * ch + 3];
  }
  return { L, A };
}
function ncc(a, b) {
  let n = 0, sa = 0, sb = 0;
  for (let p = 0; p < a.L.length; p++) { if (a.A[p] < 250 || b.A[p] < 250) continue; n++; sa += a.L[p]; sb += b.L[p]; }
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let p = 0; p < a.L.length; p++) {
    if (a.A[p] < 250 || b.A[p] < 250) continue;
    const x = a.L[p] - ma, y = b.L[p] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return num / Math.sqrt(da * db);
}
// --- level + plane normalisation, identical maths to the ladder -------------
function statsRaw(data, ch, w, h) {
  const N = data.length / ch;
  const s = [0, 0, 0], is = [0, 0, 0];
  let ni = 0;
  const half = { l: 0, r: 0, t: 0, b: 0 }, hn = { l: 0, r: 0, t: 0, b: 0 };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    for (let c = 0; c < 3; c++) s[c] += data[i + c];
    if (data[i + 3] < 8) continue;
    for (let c = 0; c < 3; c++) is[c] += data[i + c];
    ni++;
    const L = L709(data[i], data[i + 1], data[i + 2]);
    const kx = x < w / 2 ? 'l' : 'r', ky = y < h / 2 ? 't' : 'b';
    half[kx] += L; hn[kx]++; half[ky] += L; hn[ky]++;
  }
  const m = s.map((x) => x / N), im = is.map((x) => x / ni);
  return {
    lum: L709(m[0], m[1], m[2]), rgb: im, br: im[2] / im[0], gr: im[1] / im[0],
    tiltX: half.l / hn.l - half.r / hn.r, tiltY: half.t / hn.t - half.b / hn.b,
  };
}
function grade(src, ch, w, h, tint, G, p, q) {
  const out = Buffer.from(src);
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    const ny = (y - cy) / cy;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      if (out[i + 3] < 1) continue;
      const nx = (x - cx) / cx;
      const g = G * (1 + p * nx + q * ny);
      for (let c = 0; c < 3; c++) {
        const v = src[i + c] * tint[c] * g;
        out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
      }
    }
  }
  return out;
}
async function normalise(png, lumT) {
  const raw = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const S = raw.data, CH = raw.info.channels, W = raw.info.width, H = raw.info.height;
  const b0 = statsRaw(S, CH, W, H);
  const tint = [1, b0.rgb[0] / b0.rgb[1], b0.rgb[0] / b0.rgb[2]];   // to neutral B/R = G/R = 1
  let G = lumT / b0.lum, p = 0, q = 0;
  const t00 = statsRaw(grade(S, CH, W, H, tint, G, 0, 0), CH, W, H);
  const tP = statsRaw(grade(S, CH, W, H, tint, G, 0.2, 0), CH, W, H);
  const tQ = statsRaw(grade(S, CH, W, H, tint, G, 0, 0.2), CH, W, H);
  const Kx = (tP.tiltX - t00.tiltX) / 0.2, Ky = (tQ.tiltY - t00.tiltY) / 0.2;
  let buf = null;
  for (let pass = 0; pass < 6; pass++) {
    buf = grade(S, CH, W, H, tint, G, p, q);
    const m = statsRaw(buf, CH, W, H);
    if (pass === 5) break;
    G *= lumT / m.lum; tint[1] *= 1 / m.gr; tint[2] *= 1 / m.br;
    p += (0 - m.tiltX) / Kx; q += (3.0 - m.tiltY) / Ky;
  }
  return sharp(buf, { raw: { width: W, height: H, channels: CH } }).png().toBuffer();
}
const label = (t, w, size, fill) => Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + (size + 7) + '">' +
  '<text xml:space="preserve" x="4" y="' + (size + 1) + '" font-family="monospace" font-size="' + size +
  '" fill="' + (fill || '#c9d1d9') + '">' + String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</text></svg>');

(async () => {
  const png = {}, lf = {}, ff = {};
  for (const v of VARIANTS) {
    png[v.id] = await oriented(v.src, v.h, v.v);
    ff[v.id] = await lumaMask(png[v.id], 0);
    lf[v.id] = await lumaMask(png[v.id], 24);
  }
  const ids = VARIANTS.map((v) => v.id);
  const M = {}, MF = {};
  for (const a of ids) { M[a] = {}; MF[a] = {}; for (const b of ids) { M[a][b] = ncc(lf[a], lf[b]); MF[a][b] = ncc(ff[a], ff[b]); } }

  const f2 = (x) => (x >= 0 ? '+' : '') + x.toFixed(2);
  console.log('LOW-FREQ (blur 24) mean-centred masked NCC -- the structure the eye reads as repetition');
  console.log('        ' + ids.map((i) => i.padStart(7)).join(''));
  for (const a of ids) console.log(a.padEnd(8) + ids.map((b) => f2(M[a][b]).padStart(7)).join(''));
  console.log('\nFULL RES mean-centred masked NCC');
  console.log('        ' + ids.map((i) => i.padStart(7)).join(''));
  for (const a of ids) console.log(a.padEnd(8) + ids.map((b) => f2(MF[a][b]).padStart(7)).join(''));

  // --- exhaustive 4-subset search -----------------------------------------
  // A subset may not contain two orientations that are the SAME image, and the
  // score is the worst |NCC| in the subset. Both matrices are scored; the
  // low-frequency one decides, the full-res one is reported alongside.
  const combos = [];
  for (let a = 0; a < 9; a++) for (let b = a + 1; b < 9; b++) for (let c = b + 1; c < 9; c++) for (let d = c + 1; d < 9; d++) {
    const set = [ids[a], ids[b], ids[c], ids[d]];
    let wLF = 0, wFF = 0, sLF = 0;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      wLF = Math.max(wLF, Math.abs(M[set[i]][set[j]]));
      wFF = Math.max(wFF, Math.abs(MF[set[i]][set[j]]));
      sLF += Math.abs(M[set[i]][set[j]]);
    }
    combos.push({ set, wLF, wFF, mLF: sLF / 6, hasR1: set.includes('r1') });
  }
  combos.sort((x, y) => x.wLF - y.wLF);
  console.log('\nBEST 4-SUBSETS by worst |low-freq NCC| (mean |NCC| in brackets):');
  for (const c of combos.slice(0, 12)) {
    console.log('  ' + c.set.join(' ').padEnd(22) + 'worst_LF ' + c.wLF.toFixed(2) +
      '  mean_LF ' + c.mLF.toFixed(2) + '  worst_FULL ' + c.wFF.toFixed(2) + (c.hasR1 ? '   [contains r1]' : ''));
  }
  const withR1 = combos.filter((c) => c.hasR1);
  console.log('\nBEST 4-SUBSETS THAT CONTAIN r1 (all three captures represented):');
  for (const c of withR1.slice(0, 8)) {
    console.log('  ' + c.set.join(' ').padEnd(22) + 'worst_LF ' + c.wLF.toFixed(2) +
      '  mean_LF ' + c.mLF.toFixed(2) + '  worst_FULL ' + c.wFF.toFixed(2));
  }
  console.log('\nfor reference, the previous pick (r0 r1 h3 h1):  h1 is now forbidden.');
  console.log('  r0 r1 h3 -> worst_LF ' + Math.max(Math.abs(M.r0.r1), Math.abs(M.r0.h3), Math.abs(M.r1.h3)).toFixed(2));

  // --- the look panel: dome-inversion check -------------------------------
  const PAD = 18, TW = 512, TH = 256, GAP = 14;
  const comp = []; let y = PAD;
  comp.push({ input: label('GLACIER FROM REGOLITH -- ORIENTATION CHECK. every tile already level-normalised to L 40 and re-lit to tiltY 3.0 / tiltX 0.0 (mirror FIRST, plane AFTER),', 2400, 19, '#e6edf3'), left: PAD, top: y }); y += 26;
  comp.push({ input: label('so the only thing left to judge is whether the BAKED-IN crater shading inverts into domes. 1:1, no downscale. r1 is shown unmirrored only, per Rudi.', 2400, 13, '#8b949e'), left: PAD, top: y }); y += 26;
  for (const grp of [[0, ['r0', 'h0', 'v0', 'hv0']], [3, ['r3', 'h3', 'v3', 'hv3']], [1, ['r1']]]) {
    comp.push({ input: label('regolith_' + grp[0] + '   ' + grp[1].join('  /  ') + '      (h = horizontal flop, v = vertical flip, hv = 180 deg)', 2400, 15, '#7ee787'), left: PAD, top: y }); y += 22;
    let x = PAD;
    for (const id of grp[1]) {
      comp.push({ input: label(id, TW, 13, '#c9d1d9'), left: x, top: y });
      comp.push({ input: await normalise(png[id], 40), left: x, top: y + 20 });
      x += TW + GAP;
    }
    y += 20 + TH + GAP;
  }
  const out = path.join(ST, '_glacier_reg_orient.png');
  fs.writeFileSync(out, await sharp({ create: { width: Math.max(2400, 4 * (TW + GAP)) + PAD * 2, height: y + PAD, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
  console.log('\n[panel] ' + path.basename(out));
})();
