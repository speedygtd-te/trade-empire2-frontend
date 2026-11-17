/**
 * Extrahiert aus einem dock_large_extend_*.png-Kompositbild NUR den NEUEN,
 * vom Modell gemalten Bereich (das Polygon aus _dl_extend_gen.cjs) -- alles
 * ausserhalb bleibt transparent, damit kein Hangar-/Schiffs-Pixel aus dem
 * Original in die Mid-Kachel durchsickert. Danach in eine 494x494-Leinwand
 * (Familienkonvention) einsortiert.
 *
 * Usage: node scripts/_dl_extract_mid.cjs --input assets/prev/dock_large_extend_empty_b2.png --output assets/final/dock_large_mid_empty_0.png
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const argOf = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const INPUT = argOf('--input');
const OUTPUT = argOf('--output');
const MARGIN_LEFT = Number(argOf('--margin-left', '260'));
const POLY = (argOf('--poly', '260,340 530,494 283,618 13,464')).trim().split(/\s+/).map(p => p.split(',').map(Number));
const FEATHER = Number(argOf('--feather', '4'));
const CANVAS = 494;
// Ziel-Crop-Fenster (in Komposit-Koordinaten), damit der Suedpunkt des neuen
// Parallelogramms nahe dem unteren Rand der 494er Zielleinwand landet.
const CROP_LEFT = Number(argOf('--crop-left', '0'));
const CROP_TOP = Number(argOf('--crop-top', '128'));

function inPoly(px, py, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function distOutside(mask, W, H) {
  const BIG = 1e6; const D = new Float32Array(W*H).fill(BIG);
  for (let i=0;i<W*H;i++) if (mask[i]) D[i]=0;
  const rel = (x,y,v) => { if (x<0||y<0||x>=W||y>=H) return v; return Math.min(v, D[y*W+x]+1); };
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) { let v=D[y*W+x]; v=rel(x-1,y,v); v=rel(x,y-1,v); v=rel(x-1,y-1,v); v=rel(x+1,y-1,v); D[y*W+x]=v; }
  for (let y=H-1;y>=0;y--) for (let x=W-1;x>=0;x--) { let v=D[y*W+x]; v=rel(x+1,y,v); v=rel(x,y+1,v); v=rel(x+1,y+1,v); v=rel(x-1,y+1,v); D[y*W+x]=v; }
  return D;
}

(async () => {
  const { data, info } = await sharp(INPUT).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const inside = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inPoly(x + 0.5, y + 0.5, POLY)) inside[y * W + x] = 1;
  const invert = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) invert[i] = inside[i] ? 0 : 1;
  const dIn = distOutside(invert, W, H); // 0 outside poly, grows inside

  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const w = Math.max(0, Math.min(1, dIn[i] / FEATHER));
    out[i * 4] = data[i * 4]; out[i * 4 + 1] = data[i * 4 + 1]; out[i * 4 + 2] = data[i * 4 + 2];
    out[i * 4 + 3] = Math.round(data[i * 4 + 3] * w);
  }
  const masked = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  await sharp(masked).extract({ left: CROP_LEFT, top: CROP_TOP, width: CANVAS, height: CANVAS }).png().toFile(OUTPUT);
  console.log(`[extract-mid] ${OUTPUT}`);
})().catch(e => { console.error(String(e)); process.exit(1); });
