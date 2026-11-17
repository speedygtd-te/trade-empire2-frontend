/**
 * Programmatische Lit-Fassung fuer die dock_large-Reihenstuecke: punktweise
 * Nachtabsenkung (wie make-lit-variant.cjs, DIM=[0.61,0.63,0.66], Bestands-
 * Median ueber alle bisherigen Module) plus optional warme Bloom-Punkte an
 * HANDGEWAEHLTEN Koordinaten (Hangar-Innenraum, Beacon). Punktweise Operation
 * -> erhaelt Silhouette/Alpha exakt, sicher fuer Reihenstuecke.
 *
 * Usage: node scripts/_dl_lit.cjs --input assets/final/X.png --output assets/final/X_lit_0.png [--glow "cx,cy,sigma,gain,r,g,b" ...]
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const argOf = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const argAll = (n) => { const out = []; for (let i = 0; i < process.argv.length; i++) if (process.argv[i] === n) out.push(process.argv[i + 1]); return out; };
const INPUT = argOf('--input');
const OUTPUT = argOf('--output');
const DIM = (argOf('--dim', '0.61,0.63,0.66')).split(',').map(Number);
const GLOWS = argAll('--glow').map(s => s.split(',').map(Number)); // cx,cy,sigma,gain,r,g,b

function blurField(field, w, h, sigma) {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float64Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); kernel[i + radius] = v; sum += v; }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  const tmp = new Float64Array(w * h);
  const out = new Float64Array(w * h);
  const cl = (v, m) => Math.min(m - 1, Math.max(0, v));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let acc = 0; for (let k = -radius; k <= radius; k++) acc += field[y * w + cl(x + k, w)] * kernel[k + radius]; tmp[y * w + x] = acc; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let acc = 0; for (let k = -radius; k <= radius; k++) acc += tmp[cl(y + k, h) * w + x] * kernel[k + radius]; out[y * w + x] = acc; }
  return out;
}

(async () => {
  const { data, info } = await sharp(INPUT).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const out = Buffer.from(data);

  // 1. Nachtabsenkung, punktweise.
  for (let i = 0; i < W * H; i++) {
    if (data[i * 4 + 3] === 0) continue;
    out[i * 4] = Math.round(data[i * 4] * DIM[0]);
    out[i * 4 + 1] = Math.round(data[i * 4 + 1] * DIM[1]);
    out[i * 4 + 2] = Math.round(data[i * 4 + 2] * DIM[2]);
  }

  // 2. Warme Bloom-Punkte, auf die Original-Silhouette geklemmt.
  for (const [cx, cy, sigma, gain, gr, gg, gb] of GLOWS) {
    const field = new Float64Array(W * H);
    field[Math.round(cy) * W + Math.round(cx)] = 1;
    const blurred = blurField(field, W, H, sigma);
    let maxV = 0; for (let i = 0; i < W * H; i++) if (blurred[i] > maxV) maxV = blurred[i];
    for (let i = 0; i < W * H; i++) {
      if (data[i * 4 + 3] === 0) continue;
      const w = Math.min(1, (blurred[i] / maxV) * gain);
      out[i * 4] = Math.min(255, Math.round(out[i * 4] + w * gr));
      out[i * 4 + 1] = Math.min(255, Math.round(out[i * 4 + 1] + w * gg));
      out[i * 4 + 2] = Math.min(255, Math.round(out[i * 4 + 2] + w * gb));
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(OUTPUT);
  console.log(`[dl-lit] ${OUTPUT}`);
})().catch(e => { console.error(String(e)); process.exit(1); });
