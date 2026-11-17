// ═══════════════════════════════════════════
// Trade Empire — planet_unknown: candidate measurement.
//
// This asset gets NO iso validation (CLAUDE.md step 6): it is not a tile and
// not a module sprite, a planet is seen frontally, and there is no 26.57° edge
// to check. The checks below replace it. Each answers one thing the brief
// actually asks for:
//
//   discFrac      how much of the frame the dark disc fills (upscaling a small
//                 disc to 512 would show stair-stepped edges — LESSONS § 3)
//   cx, cy        centre offset in px from the frame centre
//   circ          circularity 4*pi*A/P^2 of the dark region, 1.0 = perfect circle
//   radialSd      sd of the disc radius over 360 angles, in % of the radius
//   faceMean/Sd/Max  the disc INTERIOR level. A type hint would show up here as
//                 structure: high sd or bright spots inside the silhouette
//   coronaMax/P99 the ring level — what makes the asset visible at all
//   coronaBR/GR   colour of the ring. A biome-suggesting tint shows here
//   frameMean     mean luma of the outer 4 % border. flux pins shapes to a
//                 frame (LESSONS § 3); a bright border is that failure mode
// ═══════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const DIR_RAW = path.join(ROOT, 'assets', 'raw');

const L = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// Dark-region threshold: the disc is void black, the corona is bright. A luma
// cut at 18 separates them on every candidate by a wide margin (checked: the
// histogram between 10 and 60 is nearly empty on all twelve).
const DARK = 18;

async function measure(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; p < w * h; p++, i += ch) lum[p] = L(data[i], data[i + 1], data[i + 2]);

  // ── dark blob: the connected dark component containing the frame centre ──
  const seed = ((h >> 1) * w + (w >> 1)) | 0;
  const inBlob = new Uint8Array(w * h);
  if (lum[seed] < DARK) {
    const stack = new Int32Array(w * h);
    let sp = 0;
    stack[sp++] = seed;
    inBlob[seed] = 1;
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p - x) / w;
      const nb = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ];
      for (const [nx, ny] of nb) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (inBlob[q] || lum[q] >= DARK) continue;
        inBlob[q] = 1;
        stack[sp++] = q;
      }
    }
  }

  let area = 0;
  let sx = 0;
  let sy = 0;
  let perim = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!inBlob[p]) continue;
      area++;
      sx += x;
      sy += y;
      let edge = false;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || !inBlob[ny * w + nx]) edge = true;
      }
      if (edge) perim++;
    }
  const cx = sx / area;
  const cy = sy / area;
  const rEq = Math.sqrt(area / Math.PI);
  const circ = (4 * Math.PI * area) / (perim * perim);

  // radial extent of the blob per angle
  const radii = [];
  for (let a = 0; a < 360; a++) {
    const th = (a * Math.PI) / 180;
    const dx = Math.cos(th);
    const dy = Math.sin(th);
    let r = 0;
    for (let t = 0; t < Math.max(w, h); t += 0.5) {
      const x = Math.round(cx + dx * t);
      const y = Math.round(cy + dy * t);
      if (x < 0 || y < 0 || x >= w || y >= h) break;
      if (!inBlob[y * w + x]) break;
      r = t;
    }
    radii.push(r);
  }
  const rMean = radii.reduce((a, b) => a + b, 0) / radii.length;
  const rSd = Math.sqrt(radii.reduce((a, b) => a + (b - rMean) ** 2, 0) / radii.length);

  // ── face: inside 0.85 * rMean, so the anti-aliased limb is excluded ──
  const rFace = rMean * 0.85;
  let fN = 0;
  let fS = 0;
  let fS2 = 0;
  let fMax = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > rFace) continue;
      const v = lum[y * w + x];
      fN++;
      fS += v;
      fS2 += v * v;
      if (v > fMax) fMax = v;
    }
  const fMean = fS / fN;
  const fSd = Math.sqrt(fS2 / fN - fMean * fMean);

  // ── corona: the annulus 1.0 .. 1.35 * rMean ──
  const cor = [];
  let cR = 0;
  let cG = 0;
  let cB = 0;
  let cN = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - cx, y - cy) / rMean;
      if (d < 1.0 || d > 1.35) continue;
      const p = y * w + x;
      cor.push(lum[p]);
      const i = p * ch;
      if (lum[p] > 25) {
        cR += data[i];
        cG += data[i + 1];
        cB += data[i + 2];
        cN++;
      }
    }
  cor.sort((a, b) => a - b);
  const q = (f) => cor[Math.min(cor.length - 1, Math.floor(f * cor.length))];

  // ── frame border, outer 4 % ──
  const bw = Math.round(w * 0.04);
  let brS = 0;
  let brN = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (x >= bw && x < w - bw && y >= bw && y < h - bw) continue;
      brS += lum[y * w + x];
      brN++;
    }

  return {
    file: path.basename(file).replace('planet_unknown_', '').replace('_raw.png', ''),
    discFrac: (2 * rMean) / w,
    dx: cx - w / 2,
    dy: cy - h / 2,
    circ,
    rSdPct: (rSd / rMean) * 100,
    rEqVsR: rEq / rMean,
    faceMean: fMean,
    faceSd: fSd,
    faceMax: fMax,
    corP99: q(0.99),
    corMax: cor[cor.length - 1],
    corMean: cor.reduce((a, b) => a + b, 0) / cor.length,
    corBR: cN ? cB / cR : NaN,
    corGR: cN ? cG / cR : NaN,
    frameMean: brS / brN,
  };
}

(async () => {
  const files = fs
    .readdirSync(DIR_RAW)
    .filter((f) => f.startsWith('planet_unknown_') && f.endsWith('_raw.png'))
    .map((f) => path.join(DIR_RAW, f));
  const rows = [];
  for (const f of files) rows.push(await measure(f));
  const cols = [
    ['file', 22, (v) => v],
    ['discFrac', 9, (v) => v.toFixed(3)],
    ['dx', 7, (v) => v.toFixed(1)],
    ['dy', 7, (v) => v.toFixed(1)],
    ['circ', 6, (v) => v.toFixed(3)],
    ['rSdPct', 7, (v) => v.toFixed(2)],
    ['faceMean', 9, (v) => v.toFixed(2)],
    ['faceSd', 7, (v) => v.toFixed(2)],
    ['faceMax', 8, (v) => v.toFixed(0)],
    ['corMean', 8, (v) => v.toFixed(1)],
    ['corP99', 7, (v) => v.toFixed(0)],
    ['corBR', 6, (v) => v.toFixed(3)],
    ['corGR', 6, (v) => v.toFixed(3)],
    ['frameMean', 10, (v) => v.toFixed(2)],
  ];
  console.log(cols.map(([n, wd]) => n.padEnd(wd)).join(''));
  for (const r of rows) console.log(cols.map(([n, wd, f]) => String(f(r[n])).padEnd(wd)).join(''));
})();
