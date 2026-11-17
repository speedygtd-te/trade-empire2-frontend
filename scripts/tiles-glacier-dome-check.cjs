/**
 * DOME-INVERSION CHECK, 1:1 crops. Throwaway diagnostic.
 * Cuts the same interior window out of r0/v0 and r3/v3 (level-normalised, plane
 * re-lit) and puts them side by side, magnified 2x nearest, so the baked-in
 * crater shading can be judged: a crater lit from upper-left becomes a DOME
 * after a vertical flip. Also prints the per-variant saturation, because
 * regolith_3 carries real chroma (sat 5.9%) that a mean-based grade cannot
 * remove.
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

function statsRaw(data, ch, w, h) {
  const N = data.length / ch;
  const s = [0, 0, 0], is = [0, 0, 0];
  let ni = 0, sat = 0;
  const half = { l: 0, r: 0, t: 0, b: 0 }, hn = { l: 0, r: 0, t: 0, b: 0 };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    for (let c = 0; c < 3; c++) s[c] += data[i + c];
    if (data[i + 3] < 8) continue;
    for (let c = 0; c < 3; c++) is[c] += data[i + c];
    const mx = Math.max(data[i], data[i + 1], data[i + 2]), mn = Math.min(data[i], data[i + 1], data[i + 2]);
    if (mx > 0) sat += (mx - mn) / mx;
    ni++;
    const L = L709(data[i], data[i + 1], data[i + 2]);
    const kx = x < w / 2 ? 'l' : 'r', ky = y < h / 2 ? 't' : 'b';
    half[kx] += L; hn[kx]++; half[ky] += L; hn[ky]++;
  }
  const m = s.map((x) => x / N), im = is.map((x) => x / ni);
  return {
    lum: L709(m[0], m[1], m[2]), rgb: im, br: im[2] / im[0], gr: im[1] / im[0], sat: sat / ni,
    tiltX: half.l / hn.l - half.r / hn.r, tiltY: half.t / hn.t - half.b / hn.b,
  };
}
function grade(src, ch, w, h, tint, G, p, q, desat) {
  const out = Buffer.from(src);
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    const ny = (y - cy) / cy;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      if (out[i + 3] < 1) continue;
      const nx = (x - cx) / cx;
      const g = G * (1 + p * nx + q * ny);
      const Lp = L709(src[i], src[i + 1], src[i + 2]);
      for (let c = 0; c < 3; c++) {
        const base = desat === 1 ? src[i + c] : Lp + desat * (src[i + c] - Lp);
        const v = base * tint[c] * g;
        out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
      }
    }
  }
  return out;
}
async function normalise(png, lumT, desat) {
  const raw = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const S = raw.data, CH = raw.info.channels, W = raw.info.width, H = raw.info.height;
  const b0 = statsRaw(S, CH, W, H);
  const tint = [1, b0.rgb[0] / b0.rgb[1], b0.rgb[0] / b0.rgb[2]];
  let G = lumT / b0.lum, p = 0, q = 0;
  const t00 = statsRaw(grade(S, CH, W, H, tint, G, 0, 0, desat), CH, W, H);
  const tP = statsRaw(grade(S, CH, W, H, tint, G, 0.2, 0, desat), CH, W, H);
  const tQ = statsRaw(grade(S, CH, W, H, tint, G, 0, 0.2, desat), CH, W, H);
  const Kx = (tP.tiltX - t00.tiltX) / 0.2, Ky = (tQ.tiltY - t00.tiltY) / 0.2;
  let buf = null, m = null;
  for (let pass = 0; pass < 7; pass++) {
    buf = grade(S, CH, W, H, tint, G, p, q, desat);
    m = statsRaw(buf, CH, W, H);
    if (pass === 6) break;
    G *= lumT / m.lum; tint[1] *= 1 / m.gr; tint[2] *= 1 / m.br;
    p += (0 - m.tiltX) / Kx; q += (3.0 - m.tiltY) / Ky;
  }
  return { png: await sharp(buf, { raw: { width: W, height: H, channels: CH } }).png().toBuffer(), m };
}
const label = (t, w, size, fill) => Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + (size + 7) + '">' +
  '<text xml:space="preserve" x="4" y="' + (size + 1) + '" font-family="monospace" font-size="' + size +
  '" fill="' + (fill || '#c9d1d9') + '">' + String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</text></svg>');

(async () => {
  const CW = 300, CH2 = 120, MAG = 3;
  const rows = [
    { id: 'r0  regolith_0 unmirrored', src: 0, h: false, v: false, desat: 1 },
    { id: 'v0  regolith_0 VERTICALLY flipped', src: 0, h: false, v: true, desat: 1 },
    { id: 'r3  regolith_3 unmirrored', src: 3, h: false, v: false, desat: 1 },
    { id: 'v3  regolith_3 VERTICALLY flipped', src: 3, h: false, v: true, desat: 1 },
    { id: 'r3  regolith_3 unmirrored, desat 0.35', src: 3, h: false, v: false, desat: 0.35 },
    { id: 'r1  regolith_1 unmirrored (mirroring forbidden)', src: 1, h: false, v: false, desat: 1 },
  ];
  const comp = []; let y = 18;
  comp.push({ input: label('DOME-INVERSION CHECK -- 1:1 interior window, ' + MAG + 'x nearest. crater = dark bowl with a BRIGHT UPPER-LEFT rim. after a vertical flip the bright rim sits low -> reads as a dome.', 2600, 19, '#e6edf3'), left: 18, top: y }); y += 30;
  for (const r of rows) {
    let s = sharp(fs.readFileSync(path.join(TILES, 'regolith_' + r.src + '.webp')));
    if (r.h) s = s.flop();
    if (r.v) s = s.flip();
    const or = await s.png().toBuffer();
    const nz = await normalise(or, 40, r.desat);
    console.log(r.id.padEnd(46) + '  L ' + nz.m.lum.toFixed(1) + '  B/R ' + nz.m.br.toFixed(2) +
      '  G/R ' + nz.m.gr.toFixed(2) + '  sat ' + (100 * nz.m.sat).toFixed(1) + '%  tiltY ' + nz.m.tiltY.toFixed(1));
    const crop = await sharp(nz.png).extract({ left: 256 - CW / 2, top: 128 - CH2 / 2, width: CW, height: CH2 })
      .resize(CW * MAG, CH2 * MAG, { kernel: 'nearest' }).png().toBuffer();
    comp.push({ input: label(r.id, 1200, 15, '#7ee787'), left: 18, top: y }); y += 20;
    comp.push({ input: crop, left: 18, top: y }); y += CH2 * MAG + 12;
  }
  const out = path.join(ST, '_glacier_reg_domecheck.png');
  fs.writeFileSync(out, await sharp({ create: { width: Math.max(2600, CW * MAG + 40), height: y + 18, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
  console.log('\n[panel] ' + path.basename(out));
})();
