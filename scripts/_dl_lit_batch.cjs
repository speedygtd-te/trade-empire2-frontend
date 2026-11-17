/**
 * Lit-Fassungen v2 fuer die dock_large-Reihe: globale Nachtabsenkung (wie
 * bisher) PLUS in die Stellflaeche eingelassene Landebahnbefeuerung.
 *
 * Die Lichtpunkte sind RECHNERISCH gesetzt, nicht generativ: gemessen an
 * dock_large_mid_empty_0.png (zwei sauberen Ankerpunkten auf den beiden
 * Laengskanten-Streifen) und dann mit dem renderer-exakten Kachelversatz
 * STEP = (-247, +124) Autoren-px (aus isoConstants.ts TW/TH=48/24, Skala
 * 494/48) periodisch fortgesetzt. Weil JEDES Reihenstueck (start/mid/end)
 * denselben Versatz zum jeweils naechsten Stueck hat, liefert genau diese
 * Konstruktion fuer JEDES Stueck dasselbe lokale Punktmuster -- Start, alle
 * vier Mids und Ende benutzen daher exakt dieselbe Koordinatenliste. Das ist
 * die Garantie, dass der Rapport ueber jede Naht durchlaeuft (keine Naht
 * wird einzeln nachjustiert).
 *
 * Ein Punkt (rechte Kante, naeher zur Mitte) lag innerhalb des Schiffs-
 * Parkbereichs (Polygon aus _dl_mid_ship_gen.cjs) und wurde aus der Liste
 * ENTFERNT -- konsistent fuer alle Varianten inkl. leer, statt ihn nur bei
 * den Schiff-Varianten zu verstecken.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const DIR_FINAL = path.join(ROOT, 'assets', 'final');

const DIM = [0.61, 0.63, 0.66];

// Kanonische Landebahn-Lichtpunkte (lokale Autoren-px, IDENTISCH fuer jedes
// Stueck -- siehe Kopfkommentar). Je Punkt: [x, y].
const RUNWAY_LIGHTS = [
  [427.8, 167.5],
  [304.3, 229.5],
  [180.8, 291.5],
  [57.3, 353.5],
  [471.0, 338.5],
  [224.0, 462.5],
];
// Zwei Bloom-Schichten pro Punkt: weicher Hof + kleiner heller Kern.
const RUNWAY_LAYERS = [
  { sigma: 7, gain: 0.8, rgb: [255, 225, 165] },
  { sigma: 2.5, gain: 1.0, rgb: [255, 235, 200] },
];

// Feature-Glows je Stueck (unveraendert aus v1): Hangar-Innenraum (start),
// Beacon (end). Format wie RUNWAY_LAYERS, plus eigene Koordinate.
const FEATURE_GLOWS = {
  start_0: [{ cx: 260, cy: 200, sigma: 45, gain: 0.55, rgb: [200, 150, 90] }, { cx: 260, cy: 200, sigma: 12, gain: 0.9, rgb: [255, 200, 140] }],
  end_0: [{ cx: 260, cy: 415, sigma: 16, gain: 0.85, rgb: [255, 190, 110] }],
};

// dock_large_start_0.png ist NICHT aus derselben Crop-Kette wie mid/end
// entstanden (Original-Hangar-Asset, kein extrahiertes Kachelstueck) -- an
// seiner eigenen Kachel deckt der Hangar selbst einen Teil der Weltposition
// ab, die bei mid/end offene Stellflaeche ist. Drei der sechs Punkte liegen
// dort auf der Hangarwand bzw. mitten auf dem Schiffsrumpf (per Sichtpruefung
// in assets/prev/_dl_pt1..5.png), nicht auf dem Boden -- werden NUR fuer
// start ausgelassen. Bei allen anderen Stuecken (identische Crop-Kette)
// liegen alle sechs Punkte auf offener Stellflaeche.
const EXCLUDE_FOR = {
  start_0: new Set(['427.8,167.5', '304.3,229.5', '471,338.5']),
};

const PIECES = ['start_0', 'mid_empty_0', 'mid_c1_0', 'mid_c2_0', 'mid_c3_0', 'end_0'];

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

function addGlow(out, data, W, H, cx, cy, sigma, gain, rgb) {
  const field = new Float64Array(W * H);
  const ix = Math.round(cx), iy = Math.round(cy);
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
  field[iy * W + ix] = 1;
  const blurred = blurField(field, W, H, sigma);
  let maxV = 0; for (let i = 0; i < W * H; i++) if (blurred[i] > maxV) maxV = blurred[i];
  if (maxV <= 0) return;
  for (let i = 0; i < W * H; i++) {
    if (data[i * 4 + 3] === 0) continue;
    const w = Math.min(1, (blurred[i] / maxV) * gain);
    out[i * 4] = Math.min(255, Math.round(out[i * 4] + w * rgb[0]));
    out[i * 4 + 1] = Math.min(255, Math.round(out[i * 4 + 1] + w * rgb[1]));
    out[i * 4 + 2] = Math.min(255, Math.round(out[i * 4 + 2] + w * rgb[2]));
  }
}

async function processOne(name) {
  const input = path.join(DIR_FINAL, `dock_large_${name}.png`);
  const output = path.join(DIR_FINAL, `dock_large_${name.replace('_0', '_lit_0')}.png`);
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const out = Buffer.from(data);
  for (let i = 0; i < W * H; i++) {
    if (data[i * 4 + 3] === 0) continue;
    out[i * 4] = Math.round(data[i * 4] * DIM[0]);
    out[i * 4 + 1] = Math.round(data[i * 4 + 1] * DIM[1]);
    out[i * 4 + 2] = Math.round(data[i * 4 + 2] * DIM[2]);
  }
  // Landebahnbefeuerung: identische Weltkoordinaten fuer alle Stuecke, je
  // Stueck nur ausgelassen wo die Weltposition dort keine Stellflaeche ist
  // (siehe EXCLUDE_FOR).
  const excl = EXCLUDE_FOR[name] || new Set();
  for (const [x, y] of RUNWAY_LIGHTS) {
    if (excl.has(`${x},${y}`)) continue;
    for (const layer of RUNWAY_LAYERS) addGlow(out, data, W, H, x, y, layer.sigma, layer.gain, layer.rgb);
  }
  // Feature-Glow (Hangar / Beacon), falls fuer dieses Stueck definiert.
  for (const g of FEATURE_GLOWS[name] || []) addGlow(out, data, W, H, g.cx, g.cy, g.sigma, g.gain, g.rgb);

  await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(output);
  console.log(`[lit-batch] ${path.relative(ROOT, output)}`);
}

(async () => {
  for (const p of PIECES) await processOne(p);
})().catch(e => { console.error(String(e)); process.exit(1); });
