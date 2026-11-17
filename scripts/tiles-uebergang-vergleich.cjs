/**
 * BIOM-ÜBERGÄNGE — VERGLEICHSBOGEN
 *
 * Baut vier Zustände derselben Biomgrenze nebeneinander, in drei Maßstäben:
 *
 *   1  HEUTE          harte 45°-Kante, kein Übergang
 *   2  ALPHA GLATT    smoothstep-Rampe zur unteren Kante
 *   3  ALPHA VERRAUSCHT   dieselbe Rampe, Rauschen in WELTKOORDINATEN
 *   4  GEBACKEN       eine WIRKLICH ERZEUGTE Übergangskachel (512x256 webp),
 *                     gezeichnete Silhouette + Saum passend zur Grenzart
 *
 * Zustand 4 ist der Grund für dieses Script: bisher hat niemand eine gebackene
 * Kante gesehen, die Kostenrechnung stand gegen eine Vorstellung.
 *
 * Warum PROZEDURAL gebacken und nicht per flux:
 *   - eine Übergangskachel muss an ihren DREI anderen Kanten exakt die
 *     Basiskachel A bleiben, sonst reißt die Naht zum Nachbarn. flux
 *     regeneriert die Fläche (LESSONS §3: "kontext ist NIE additiv") und
 *     liest die Rautenmaske als Bildrahmen — beides bricht genau das.
 *   - der Inhalt links und rechts der Silhouette ist bereits vorhanden
 *     (die beiden fertigen Biomkacheln). Zu erfinden ist nur die SILHOUETTE
 *     und ihr Saum, und das ist eine Masken-, keine Generierungsaufgabe.
 *   - damit ist die gebackene Kachel reproduzierbar und die vier
 *     Grenzarten (Wasserlinie / Vegetationslinie / Deckenrand / Bruchkante)
 *     sind je eine Funktion statt je eines Prompts.
 *
 * Schreibt NUR nach assets/style-test/tiles/_uebergang_*. Nichts nach src/.
 * Kein fal.ai, kein Netz.
 *
 * Aufruf: node scripts/tiles-uebergang-vergleich.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const OUT = path.join(ROOT, 'assets', 'style-test', 'tiles');
const PRE = '_uebergang_';
const OLD_CACHE = path.join(OUT, '_transition_metrics.json');
const CACHE = path.join(OUT, PRE + 'metrics.json');

const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const BGA = { r: 0x14, g: 0x17, b: 0x1c };
const VAC_A = 0.45, VAC_RGB = [5, 10, 25];
const f1 = (x) => (x === null || x === undefined || Number.isNaN(x) ? '—' : x.toFixed(1));
const f2 = (x) => (x === null || x === undefined || Number.isNaN(x) ? '—' : x.toFixed(2));
const f3 = (x) => (x === null || x === undefined || Number.isNaN(x) ? '—' : x.toFixed(3));
const tilePath = (b, v) => path.join(TILES, b, `${b}_${v}.webp`);

// ══════════════════════════════════════════════════════════════════
// 1 — Metriken (identisch zu scripts/tiles-transition-alpha-test.cjs,
//     damit die Zahlen mit dem alten Bogen vergleichbar bleiben)
// ══════════════════════════════════════════════════════════════════

async function rawOf(buf, w, h) {
  let img = sharp(buf).ensureAlpha();
  if (w) img = img.resize(w, h, { fit: 'fill', kernel: 'lanczos3' });
  return img.raw().toBuffer({ resolveWithObject: true });
}

async function microAt(file, w, h) {
  const enc = await sharp(fs.readFileSync(file))
    .resize(w, h, { fit: 'fill' }).webp({ quality: 90, effort: 4 }).toBuffer();
  const { data, info } = await rawOf(enc);
  const ch = info.channels;
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    L[p] = L709(data[p * ch], data[p * ch + 1], data[p * ch + 2]);
    A[p] = data[p * ch + 3];
  }
  let s = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) {
    const p = y * w + x; if (A[p] < 200 || A[p + 1] < 200) continue;
    s += Math.abs(L[p] - L[p + 1]); n++;
  }
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x; if (A[p] < 200 || A[p + w] < 200) continue;
    s += Math.abs(L[p] - L[p + w]); n++;
  }
  return n ? s / n : 0;
}

async function textureMetrics(file) {
  const src = fs.readFileSync(file);
  const { data, info } = await rawOf(src);
  const ch = info.channels, w = info.width, h = info.height;
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    L[p] = L709(data[p * ch], data[p * ch + 1], data[p * ch + 2]);
    A[p] = data[p * ch + 3];
  }
  const blurL = async (sigma) => {
    const g = await sharp(src).ensureAlpha().blur(sigma).raw()
      .toBuffer({ resolveWithObject: true });
    const c = g.info.channels, o = new Float32Array(w * h);
    for (let p = 0; p < w * h; p++) o[p] = L709(g.data[p * c], g.data[p * c + 1], g.data[p * c + 2]);
    return o;
  };
  const b6 = await blurL(6), b32 = await blurL(32), b2 = await blurL(2);
  const inside = (x, y) => {
    const u = Math.abs(x - (w - 1) / 2) / (w / 2) + Math.abs(y - (h - 1) / 2) / (h / 2);
    return u < 0.78 && A[y * w + x] >= 250;
  };
  let n = 0, s = 0, q = 0; const lvl = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    const p = y * w + x, v = b6[p] - b32[p];
    s += v; q += v * v; n++; lvl.push(L[p]);
  }
  lvl.sort((a, b) => a - b);
  const p70 = lvl[Math.floor(lvl.length * 0.7)] || 1;
  const meso = n ? Math.sqrt(Math.max(0, q / n - (s / n) * (s / n))) / p70 * 100 : 0;
  const hp = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) hp[p] = L[p] - b2[p];
  const acf = (d) => {
    let a = 0, b = 0, c = 0, m = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w - d; x++) {
      if (!inside(x, y) || !inside(x + d, y)) continue;
      const u = hp[y * w + x], v = hp[y * w + x + d];
      a += u * v; b += u * u; c += v * v; m++;
    }
    return m && b > 0 && c > 0 ? a / Math.sqrt(b * c) : 0;
  };
  const a0 = acf(1) || 1;
  let grain = 1;
  for (let d = 1; d <= 24; d++) { if (acf(d) < 0.5 * a0) { grain = d; break; } grain = d; }
  return { meso, grain, p70 };
}

async function tileStats(file) {
  const { data, info } = await rawOf(fs.readFileSync(file));
  const ch = info.channels, w = info.width, h = info.height;
  let n = 0; const s = [0, 0, 0]; const lv = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (data[i + 3] < 250) continue;
    const u = Math.abs(x - (w - 1) / 2) / (w / 2) + Math.abs(y - (h - 1) / 2) / (h / 2);
    if (u > 0.78) continue;
    s[0] += data[i]; s[1] += data[i + 1]; s[2] += data[i + 2];
    lv.push(L709(data[i], data[i + 1], data[i + 2])); n++;
  }
  lv.sort((a, b) => a - b);
  const m = s.map((x) => x / n);
  return { rgb: m, L: L709(m[0], m[1], m[2]), br: m[2] / m[0], gr: m[1] / m[0], p70: lv[Math.floor(n * 0.7)] };
}

const chroma = (rgb) => {
  const mx = Math.max(rgb[0], rgb[1], rgb[2]), mn = Math.min(rgb[0], rgb[1], rgb[2]);
  return mx > 0 ? (mx - mn) / mx : 0;
};
function chromaDip(rgbA, rgbB) {
  const cA = chroma(rgbA), cB = chroma(rgbB), floor = Math.min(cA, cB);
  let min = Infinity, tMin = 0, under = 0; const N = 101;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const c = chroma([0, 1, 2].map((k) => rgbA[k] * (1 - t) + rgbB[k] * t));
    if (c < min) { min = c; tMin = t; }
    if (c < 0.9 * floor) under++;
  }
  return { cA, cB, cMin: min, dip: (floor - min) * 100, tDip: tMin, band: under / N };
}

// ══════════════════════════════════════════════════════════════════
// 2 — Rautengeometrie, Rauschen, Alphakurven
// ══════════════════════════════════════════════════════════════════
//
// Eckpunkte der Raute in einem w x h Bild: N(w/2,0) E(w,h/2) S(w/2,h) W(0,h/2).
// Untere Kanten: SW (W->S, Nachbar (x, y+1)), SE (S->E, Nachbar (x+1, y)) —
// hergeleitet aus worldToScreen in src/views/grid/isoConstants.ts.
//
//   dx = (x-cx)/(w/2),  dy = (y-cy)/(h/2)
//   SE-Kante:  dx+dy = 1      Abstand nach innen  dSE = 1-(dx+dy)
//   SW-Kante: -dx+dy = 1      Abstand nach innen  dSW = 1-(-dx+dy)
//   Lauf ENTLANG der SE-Kante:  uSE = dx-dy   (S = -1 … E = +1)
//   Lauf ENTLANG der SW-Kante:  uSW = dx+dy   (W = -1 … S = +1)

function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, s), b = hash2(x0 + 1, y0, s);
  const c = hash2(x0, y0 + 1, s), d = hash2(x0 + 1, y0 + 1, s);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}
// 1D-Wertrauschen entlang einer Kante (fuer die gebackene Silhouette)
function vnoise1(t, s) {
  const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
  return hash2(i, 0, s) * (1 - u) + hash2(i + 1, 0, s) * u;
}

/** Alphakurve: 0 = eigene Kachel, 1 = Nachbarmaterial. cfg = sw|se|both */
function edgeAlpha(w, h, cfg, widthFrac, noiseAmp, wx, wy) {
  const cx = w / 2, cy = h / 2;
  const a = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x - cx) / (w / 2), dy = (y - cy) / (h / 2);
    const rSW = Math.max(0, Math.min(1, 1 - (1 - (-dx + dy)) / widthFrac));
    const rSE = Math.max(0, Math.min(1, 1 - (1 - (dx + dy)) / widthFrac));
    let v = cfg === 'sw' ? rSW : cfg === 'se' ? rSE : Math.max(rSW, rSE);
    if (noiseAmp) {
      // WELTposition des Pixels in Kacheleinheiten -> stetig ueber Kachelgrenzen
      const px = wx + (dx + 1) / 2, py = wy + (dy + 1) / 2;
      const n1 = vnoise(px * 3.0, py * 3.0, 1);
      const n2 = vnoise(px * 7.0 + 11.3, py * 7.0 + 7.7, 2);
      v = Math.max(0, Math.min(1, v + noiseAmp * ((n1 - 0.5) + 0.5 * (n2 - 0.5))));
    }
    a[y * w + x] = v * v * (3 - 2 * v);
  }
  return a;
}

// ══════════════════════════════════════════════════════════════════
// 3 — Die GEBACKENE Kachel
// ══════════════════════════════════════════════════════════════════
//
// Erzeugt bei 512x256 aus den beiden echten Kacheln plus einer gezeichneten
// SILHOUETTE. Vier Grenzarten, je eine eigene Kurve und ein eigener Saum:
//
//   wasser      Wasserlinie: gerundete Buchten, nasser Sand als Band auf der
//               Landseite, ein schmaler heller Schaumstrich auf der Wasserseite
//   vegetation  Vegetationslinie: Grundkurve + kleine Bueschel, die einzeln
//               ueber die Linie hinausstehen, plus Fussschatten
//   decke       Deckenrand (basalt_plain): facettierte, fast gerade Abschnitte,
//               belichtete Lippe auf der Deckenseite, Schatten dahinter
//   bruch       Bruchkante: gerade Facetten mit Versatz, duenne dunkle Fuge
//
// Die Silhouette ist BINAER (mit ~1.6 px Antialias) — das ist der Unterschied
// zur Ueberblendung: es gibt keine Mischzone, jeder Pixel traegt EIN Material.

const SEAM = {
  wasser:     { w0: 0.34, lobeLen: 2.2, lobeAmp: 0.20, fineLen: 9.0, fineAmp: 0.045, facet: 0 },
  vegetation: { w0: 0.30, lobeLen: 3.0, lobeAmp: 0.14, fineLen: 14.0, fineAmp: 0.055, facet: 0, tuft: 0.10 },
  decke:      { w0: 0.32, lobeLen: 1.6, lobeAmp: 0.16, fineLen: 6.0, fineAmp: 0.02, facet: 5 },
  bruch:      { w0: 0.32, lobeLen: 1.8, lobeAmp: 0.18, fineLen: 5.0, fineAmp: 0.03, facet: 7 },
};

/** Breite der Nachbarzunge an der Stelle u (entlang der Kante), in Halbrauten */
function tongueWidth(kind, u, seed) {
  const s = SEAM[kind];
  let t = u;
  if (s.facet) t = Math.round(u * s.facet) / s.facet;   // Facettierung: Geraden
  let w = s.w0 + s.lobeAmp * (vnoise1(t * s.lobeLen + 3.1, seed) - 0.5) * 2;
  w += s.fineAmp * (vnoise1(u * s.fineLen + 17.7, seed + 41) - 0.5) * 2;
  if (s.tuft) {
    // Bueschel: einzelne, schmale Ausreisser ueber die Linie hinaus
    const g = vnoise1(u * 26.0 + 5.5, seed + 77);
    if (g > 0.66) w += s.tuft * (g - 0.66) / 0.34;
  }
  return Math.max(0.05, w);
}

/** Silhouettenmaske. m = 1 dort, wo das NACHBARmaterial liegt. */
function bakedMask(w, h, cfg, kind, seed) {
  const cx = w / 2, cy = h / 2, m = new Float32Array(w * h);
  const aaPx = 1.6, sx = 2 / w, sy = 2 / h;      // Pixel -> Halbrauten
  const scale = 1 / Math.sqrt(sx * sx + sy * sy);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x - cx) / (w / 2), dy = (y - cy) / (h / 2);
    let best = -9;
    if (cfg === 'sw' || cfg === 'both') {
      const d = 1 - (-dx + dy), u = dx + dy;
      const v = tongueWidth(kind, u, seed) - d;
      if (v > best) best = v;
    }
    if (cfg === 'se' || cfg === 'both') {
      const d = 1 - (dx + dy), u = dx - dy;
      const v = tongueWidth(kind, u, seed + 13) - d;
      if (v > best) best = v;
    }
    m[y * w + x] = Math.max(0, Math.min(1, 0.5 + best * scale / aaPx));
  }
  return m;
}

/** Abstand zur Silhouette in px, positiv auf der NACHBARseite (Chamfer) */
function seamDistance(mask, w, h) {
  const INF = 1e6, d = new Float32Array(w * h).fill(INF);
  const bin = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) bin[p] = mask[p] > 0.5 ? 1 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    let edge = false;
    if (x > 0 && bin[p - 1] !== bin[p]) edge = true;
    if (x < w - 1 && bin[p + 1] !== bin[p]) edge = true;
    if (y > 0 && bin[p - w] !== bin[p]) edge = true;
    if (y < h - 1 && bin[p + w] !== bin[p]) edge = true;
    if (edge) d[p] = 0;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (x > 0 && d[p - 1] + 1 < d[p]) d[p] = d[p - 1] + 1;
    if (y > 0 && d[p - w] + 1 < d[p]) d[p] = d[p - w] + 1;
    if (x > 0 && y > 0 && d[p - w - 1] + 1.414 < d[p]) d[p] = d[p - w - 1] + 1.414;
    if (x < w - 1 && y > 0 && d[p - w + 1] + 1.414 < d[p]) d[p] = d[p - w + 1] + 1.414;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const p = y * w + x;
    if (x < w - 1 && d[p + 1] + 1 < d[p]) d[p] = d[p + 1] + 1;
    if (y < h - 1 && d[p + w] + 1 < d[p]) d[p] = d[p + w] + 1;
    if (x < w - 1 && y < h - 1 && d[p + w + 1] + 1.414 < d[p]) d[p] = d[p + w + 1] + 1.414;
    if (x > 0 && y < h - 1 && d[p + w - 1] + 1.414 < d[p]) d[p] = d[p + w - 1] + 1.414;
  }
  const out = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) out[p] = bin[p] ? d[p] : -d[p];
  return out;
}

/**
 * Die gebackene Kachel. A = eigenes Material, B = Nachbarmaterial, beide als
 * RGBA-Rohpuffer. Ergebnis bleibt an den drei NICHT beteiligten Kanten exakt A.
 * scl = w/512, damit die Saumbreiten bei kleineren Puffern mitskalieren.
 */
function bakeTile(A, B, w, h, cfg, kind, seed) {
  const mask = bakedMask(w, h, cfg, kind, seed);
  const dist = seamDistance(mask, w, h);
  const scl = w / 512;
  const out = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4, m = mask[p], d = dist[p] / scl;
    let r = A[i] * (1 - m) + B[i] * m;
    let g = A[i + 1] * (1 - m) + B[i + 1] * m;
    let b = A[i + 2] * (1 - m) + B[i + 2] * m;
    if (kind === 'wasser') {
      if (d < 0 && d > -26) {                       // nasser Sand auf der Landseite
        const k = (1 + d / 26) * 0.30, L = L709(r, g, b);
        r = r * (1 - k) + (L * 0.72) * k; g = g * (1 - k) + (L * 0.74) * k; b = b * (1 - k) + (L * 0.86) * k;
      }
      if (d >= 0 && d < 4) {                        // Schaumstrich auf der Wasserseite
        const k = (1 - d / 4) * 0.42;
        r += (235 - r) * k * 0.5; g += (240 - g) * k * 0.5; b += (245 - b) * k * 0.5;
      }
    } else if (kind === 'vegetation') {
      if (d >= 0 && d < 7) {                        // Fussschatten unter dem Bewuchs
        const k = (1 - d / 7) * 0.34;
        r *= 1 - k * 0.55; g *= 1 - k * 0.5; b *= 1 - k * 0.45;
      }
      if (d < 0 && d > -3) {                        // heller Saumstreifen (Sandkante)
        const k = (1 + d / 3) * 0.22;
        r += (200 - r) * k * 0.35; g += (196 - g) * k * 0.35; b += (176 - b) * k * 0.35;
      }
    } else if (kind === 'decke') {
      if (d < 0 && d > -6) {                        // belichtete Lippe der Decke
        const k = (1 + d / 6) * 0.55;
        r += (215 - r) * k * 0.32; g += (205 - g) * k * 0.32; b += (195 - b) * k * 0.32;
      }
      if (d >= 0 && d < 9) {                        // Schatten hinter der Lippe
        const k = (1 - d / 9) * 0.45;
        r *= 1 - k * 0.5; g *= 1 - k * 0.5; b *= 1 - k * 0.48;
      }
    } else if (kind === 'bruch') {
      if (Math.abs(d) < 2.2) {                      // duenne dunkle Fuge
        const k = (1 - Math.abs(d) / 2.2) * 0.6;
        r *= 1 - k * 0.55; g *= 1 - k * 0.55; b *= 1 - k * 0.52;
      }
      if (d >= 2.2 && d < 7) {                      // schmale helle Bruchflaeche
        const k = (1 - (d - 2.2) / 4.8) * 0.28;
        r += (190 - r) * k * 0.3; g += (188 - g) * k * 0.3; b += (182 - b) * k * 0.3;
      }
    }
    out[i] = Math.max(0, Math.min(255, Math.round(r)));
    out[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    out[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
    out[i + 3] = A[i + 3];
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════
// 4 — Compositing, Leinwand, Felder
// ══════════════════════════════════════════════════════════════════

/** lineare Ueberblendung innerhalb des Rautenclips */
function blendCell(A, B, alpha, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4, t = alpha[p] * (B[i + 3] / 255);
    for (let c = 0; c < 3; c++) out[i + c] = Math.round(A[i + c] * (1 - t) + B[i + c] * t);
    out[i + 3] = A[i + 3];
  }
  return out;
}

async function loadRaw(file, w, h) {
  const { data, info } = await rawOf(fs.readFileSync(file), w, h);
  if (info.channels === 4) return data;
  const out = Buffer.alloc(w * h * 4, 255);
  for (let p = 0; p < w * h; p++) for (let c = 0; c < 3; c++) out[p * 4 + c] = data[p * info.channels + c];
  return out;
}
async function rawFromBuf(buf, w, h) {
  const { data } = await sharp(buf).ensureAlpha().resize(w, h, { fit: 'fill', kernel: 'lanczos3' })
    .raw().toBuffer({ resolveWithObject: true });
  return data;
}

function newCanvas(w, h) {
  const c = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    c[p * 4] = BGA.r; c[p * 4 + 1] = BGA.g; c[p * 4 + 2] = BGA.b; c[p * 4 + 3] = 255;
  }
  return c;
}
function blit(canvas, CW, CH, cell, w, h, ox, oy) {
  for (let y = 0; y < h; y++) {
    const cy = oy + y; if (cy < 0 || cy >= CH) continue;
    for (let x = 0; x < w; x++) {
      const cx = ox + x; if (cx < 0 || cx >= CW) continue;
      const s = (y * w + x) * 4, d = (cy * CW + cx) * 4;
      const a = cell[s + 3] / 255; if (a <= 0) continue;
      for (let c = 0; c < 3; c++) canvas[d + c] = Math.round(canvas[d + c] * (1 - a) + cell[s + c] * a);
    }
  }
}
const png = (buf, w, h) => sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
const svgLabel = (t, w, size, fill) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${size + 8}">` +
  `<text xml:space="preserve" x="2" y="${size + 1}" font-family="monospace" font-size="${size}" ` +
  `fill="${fill || '#8b949e'}">${String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`);

// ══════════════════════════════════════════════════════════════════
// 5 — Ko-Okkurrenz, Materialfamilie, Klassifikation
// ══════════════════════════════════════════════════════════════════
// Quelle (Kanon): Docs/planet-biomes-by-type.md. Identische Saetze
// (MOON_ICY/ICE, MOON_ROCKY/BARREN, MOON_VOLCANIC/VOLCANIC) sind angemerkt,
// erzeugen aber keine neuen Paare.

const SETS = {
  EARTH_LIKE: ['ocean', 'beach', 'plains', 'forest', 'mountain', 'snow_peak', 'swamp', 'desert_patch'],
  DESERT: ['sand_dunes', 'rocky_desert', 'mesa', 'salt_flat', 'oasis', 'canyon'],
  OCEAN: ['deep_ocean', 'shallow_water', 'reef', 'island', 'kelp_forest', 'volcanic_vent'],
  ICE: ['glacier', 'frozen_lake', 'tundra', 'ice_shelf', 'permafrost', 'crevasse'],
  VOLCANIC: ['lava_flow', 'basalt_plain', 'ash_field', 'caldera', 'obsidian_ridge', 'fumarole'],
  BARREN: ['regolith', 'crater', 'dust_plain', 'rocky_outcrop'],
  TOXIC: ['acid_lake', 'toxic_marsh', 'corroded_plain', 'chemical_vent', 'crystal_field'],
  ASTEROID_M: ['metallic_surface', 'impact_crater', 'boulder_field', 'dust_basin'],
  ASTEROID_C: ['carbon_crust', 'silicate_plain', 'fractured_zone', 'dust_basin'],
  ASTEROID_S: ['silicate_plain', 'impact_crater', 'void_edge', 'boulder_field'],
};
const SET_ALIAS = { BARREN: 'BARREN / MOON_ROCKY', ICE: 'ICE / MOON_ICY', VOLCANIC: 'VOLCANIC / MOON_VOLCANIC' };

// Untergrund: die MENGEN je Familie …
// KORRIGIERT 2026-09-06 gegen shared/surface/underground-biome.ts:
// der tiefe Kern ruft resolveVolcanicUnderground mit ZURUECKGESETZTER Tiefe auf
// und traegt damit ROCK_LAYER/MINERAL_VEIN/MAGMA_POCKET — LAVA_FLOW gibt es
// untertage ueberhaupt nicht.
const UG_FAM = {
  UG_STANDARD: ['rock_layer', 'mineral_vein', 'cave_floor', 'deep_stone'],
  UG_EISIG: ['ice_cavern', 'mineral_vein', 'deep_stone'],
  UG_VULKANISCH: ['rock_layer', 'mineral_vein', 'magma_pocket'],
  UG_KERN: ['rock_layer', 'mineral_vein', 'magma_pocket'],
};
// … und die z-EBENEN, auf denen zwei davon wirklich gleichzeitig aufloesbar
// sind (Regelreihenfolge aus planet-biomes-by-type.md, Backend-Verifikation
// steht aus — PLAN §9/Frage 7).
// T = deepThresholdDepth, typisch 7 (calculateDeepThreshold), Bereich 0..8.
const UG_PLANES = {
  'Standard Tiefe 1-3': ['mineral_vein', 'cave_floor', 'rock_layer'],
  'Standard Tiefe 4..T-1': ['mineral_vein', 'deep_stone'],
  'Eisig Tiefe 1..min(5,T-1)': ['mineral_vein', 'ice_cavern'],
  'Eisig Tiefe 6..T-1 (nur T>=7)': ['deep_stone'],
  'Vulkanisch Tiefe 1-2': ['mineral_vein', 'rock_layer'],
  'Vulkanisch Tiefe 3..min(5,T-1)': ['mineral_vein', 'magma_pocket'],
  'Tiefer Kern rebasiert 0-2': ['mineral_vein', 'rock_layer'],
  'Tiefer Kern rebasiert 3-5': ['mineral_vein', 'magma_pocket'],
  'Tiefer Kern rebasiert >=6': ['magma_pocket'],
};

const FAM = {
  ocean: 'Wasser', deep_ocean: 'Wasser', shallow_water: 'Wasser', reef: 'Wasser',
  kelp_forest: 'Wasser', volcanic_vent: 'Wasser', ice_shelf: 'Wasser', oasis: 'Wasser',
  acid_lake: 'Wasser',
  mountain: 'Mineralisch', snow_peak: 'Mineralisch', mesa: 'Mineralisch', canyon: 'Mineralisch',
  rocky_desert: 'Mineralisch', rocky_outcrop: 'Mineralisch', regolith: 'Mineralisch',
  crater: 'Mineralisch', dust_plain: 'Mineralisch', salt_flat: 'Mineralisch',
  beach: 'Mineralisch', sand_dunes: 'Mineralisch', desert_patch: 'Mineralisch',
  island: 'Mineralisch', boulder_field: 'Mineralisch', impact_crater: 'Mineralisch',
  dust_basin: 'Mineralisch', silicate_plain: 'Mineralisch', carbon_crust: 'Mineralisch',
  metallic_surface: 'Mineralisch', fractured_zone: 'Mineralisch', rock_layer: 'Mineralisch',
  mineral_vein: 'Mineralisch', cave_floor: 'Mineralisch', deep_stone: 'Mineralisch',
  glacier: 'Eis', frozen_lake: 'Eis', crevasse: 'Eis', ice_cavern: 'Eis',
  tundra: 'Eis', permafrost: 'Eis',
  plains: 'Vegetation', forest: 'Vegetation', swamp: 'Vegetation',
  lava_flow: 'Vulkanisch', basalt_plain: 'Vulkanisch', ash_field: 'Vulkanisch',
  caldera: 'Vulkanisch', obsidian_ridge: 'Vulkanisch', fumarole: 'Vulkanisch',
  magma_pocket: 'Vulkanisch',
  corroded_plain: 'Chemisch', chemical_vent: 'Chemisch', crystal_field: 'Chemisch',
  toxic_marsh: 'Chemisch',
  void_edge: '?',
};

const FLOW = {
  'beach|ocean': 'Wasser ueber Sand = flaches Wasser',
  'ocean|plains': 'ueberflutete Wiese',
  'forest|ocean': 'ueberflutete Baumgrenze (Mangrovenlogik)',
  'ocean|swamp': 'Marsch ist selbst Uebergangszone Wasser/Land',
  'desert_patch|ocean': 'Wasser ueber Sand',
  'island|shallow_water': 'Wasser ueber Sandbank',
  'island|reef': 'Riffsaum um die Insel',
  'island|kelp_forest': 'Wasser ueber Bewuchs',
  'island|volcanic_vent': 'Wasser ueber Vulkangrund',
  'deep_ocean|island': 'Steilkueste = Tiefenzunahme',
  'oasis|sand_dunes': 'Wasser ueber Sand',
  'oasis|rocky_desert': 'Wasser ueber Fels',
  'oasis|salt_flat': 'Salzseerand: Wasser verdunstet in die Kruste',
  'canyon|oasis': 'Wasser am Fuss der Wand',
  'mesa|oasis': 'Wasser am Fuss der Wand',
  'ice_shelf|tundra': 'Wasser/Eis ueber Frostgrus',
  'frozen_lake|ice_shelf': 'gefrorenes gegen offenes Wasser — Eisrand',
  'glacier|ice_shelf': 'Gletscher kalbt ins Wasser',
  'ice_shelf|permafrost': 'Wasser ueber Frostboden',
  'crevasse|ice_shelf': 'Eis gegen Wasser',
  'ash_field|lava_flow': 'Lava ueber Asche = Abkuehlzone',
  'caldera|lava_flow': 'Lava im Kessel',
  'fumarole|lava_flow': 'Lava ueber Schwefelfeld',
  'lava_flow|obsidian_ridge': 'Lava am Fuss des Grats',
  'acid_lake|toxic_marsh': 'Saeure ueber Marsch',
  'acid_lake|corroded_plain': 'Saeure ueber zerfressenem Grund',
  'acid_lake|chemical_vent': 'Saeure ueber Schlot',
  'acid_lake|crystal_field': 'Saeure ueber Kristallfeld',
  'magma_pocket|rock_layer': 'Magma im Gestein',
  'magma_pocket|mineral_vein': 'Magma an der Ader',
};
const FORCE_HARD = { basalt_plain: 'erstarrte Decke mit Rand (Rudi)' };

const HARD_GROUP = (a, b) => {
  if (FORCE_HARD[a] || FORCE_HARD[b]) return 'Deckenrand (basalt_plain)';
  const fa = FAM[a], fb = FAM[b];
  const set = new Set([fa, fb]);
  if (set.has('Vegetation') && set.has('Mineralisch')) return 'Vegetationslinie';
  if (set.has('Wasser') && set.has('Mineralisch')) return 'Kliff (Wasser gegen Steilkante)';
  if (set.has('Eis') && set.has('Mineralisch')) return 'Bruchkante (Eis gegen Fels)';
  return 'sonstiger Familienwechsel';
};
const SEAM_OF_GROUP = {
  'Deckenrand (basalt_plain)': 'decke',
  'Vegetationslinie': 'vegetation',
  'Kliff (Wasser gegen Steilkante)': 'wasser',
  'Bruchkante (Eis gegen Fels)': 'bruch',
  'sonstiger Familienwechsel': 'bruch',
};

function buildPairs() {
  const seen = new Map();
  const add = (a0, b0, where) => {
    const [a, b] = [a0, b0].sort();
    const k = `${a}|${b}`;
    if (!seen.has(k)) seen.set(k, { k, a, b, where: [] });
    if (!seen.get(k).where.includes(where)) seen.get(k).where.push(where);
  };
  for (const [s, list] of Object.entries(SETS))
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++)
      add(list[i], list[j], SET_ALIAS[s] || s);
  const surface = seen.size;
  for (const [s, list] of Object.entries(UG_FAM))
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++)
      add(list[i], list[j], s.replace('UG_', 'UG '));
  const total = seen.size;
  // z-Ebenen-Filter fuer den Untergrund
  const planeOf = new Map();
  for (const [plane, list] of Object.entries(UG_PLANES))
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const k = [list[i], list[j]].sort().join('|');
      if (!planeOf.has(k)) planeOf.set(k, []);
      planeOf.get(k).push(plane);
    }
  const out = [];
  for (const p of seen.values()) {
    const ug = p.where.some((w) => w.startsWith('UG'));
    const planes = planeOf.get(p.k) || [];
    const fa = FAM[p.a], fb = FAM[p.b];
    const flow = FLOW[p.k] || FLOW[`${p.b}|${p.a}`] || null;
    const forced = FORCE_HARD[p.a] ? p.a : FORCE_HARD[p.b] ? p.b : null;
    let cls, why, group = null;
    if (fa === '?' || fb === '?') { cls = 'OFFEN'; why = 'void_edge — Motiv ungeklaert'; }
    else if (ug && planes.length === 0) { cls = 'ENTFAELLT'; why = 'nie auf derselben z-Ebene aufloesbar'; }
    else if (forced) { cls = 'GEBACKEN'; why = 'Ausnahme ' + forced + ': ' + FORCE_HARD[forced]; group = HARD_GROUP(p.a, p.b); }
    else if (fa === fb) { cls = 'ALPHA'; why = `gleiche Materialfamilie (${fa})`; }
    else if (flow) { cls = 'ALPHA'; why = 'sinnvoller Verlauf: ' + flow; }
    else { cls = 'GEBACKEN'; why = `Familienwechsel ${fa}/${fb}, kein Verlauf`; group = HARD_GROUP(p.a, p.b); }
    out.push({ ...p, ug, planes, fam: `${fa}|${fb}`, famA: fa, famB: fb, flow, cls, why, group });
  }
  return { pairs: out, surface, total };
}

// ══════════════════════════════════════════════════════════════════
// 6 — Kontur-Index: wie krumm ist die wahrgenommene Grenzlinie?
// ══════════════════════════════════════════════════════════════════
// Eine glatte Rampe laesst die 0.5-Niveaulinie GERADE — sie mildert den
// Farbsprung, nicht den Umriss. Gezaehlt werden die 0.5-Durchgaenge zwischen
// benachbarten Pixeln; das ist bis auf einen konstanten Faktor die Laenge der
// Niveaulinie. Der Index ist das Verhaeltnis zur glatten Rampe.
function contourCrossings(field, w, h) {
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) {
    const p = y * w + x; if ((field[p] > 0.5) !== (field[p + 1] > 0.5)) n++;
  }
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x; if ((field[p] > 0.5) !== (field[p + w] > 0.5)) n++;
  }
  return n;
}

/**
 * AUSLENKUNG der 0.5-Linie von der geraden Kante, in Pixeln (sd und max).
 * Der Kontur-INDEX oben misst die LAENGE der Linie und sieht eine grosse,
 * langsame Welle deshalb fast nicht — die Auslenkung sieht genau sie.
 * Beide werden ausgewiesen; welche traegt, entscheidet das Bild.
 */
function edgeDeflection(field, w, h, cfg) {
  const cx = w / 2, cy = h / 2;
  const sx = 2 / w, sy = 2 / h;
  const scale = 1 / Math.sqrt(sx * sx + sy * sy);   // Halbrauten -> px quer zur Kante
  const vals = [];
  for (let i = 0; i < 240; i++) {
    const u = -0.92 + (1.84 * i) / 239;
    let hit = null;
    for (let d = 0.005; d < 1.0; d += 0.004) {
      const dx = cfg === 'sw' ? (u - 1 + d) / 2 : (u + 1 - d) / 2;
      const dy = cfg === 'sw' ? (u + 1 - d) / 2 : (1 - d - u) / 2;
      const x = Math.round(cx + dx * (w / 2)), y = Math.round(cy + dy * (h / 2));
      if (x < 0 || y < 0 || x >= w || y >= h) break;
      if (field[y * w + x] <= 0.5) { hit = d; break; }
    }
    if (hit !== null) vals.push(hit * scale);
  }
  if (!vals.length) return { mean: 0, sd: 0, max: 0 };
  const m = vals.reduce((s, x) => s + x, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((s, x) => s + (x - m) ** 2, 0) / vals.length);
  return { mean: m, sd, max: Math.max(...vals) - Math.min(...vals) };
}

// ══════════════════════════════════════════════════════════════════
// 7 — Felder in vier Zustaenden
// ══════════════════════════════════════════════════════════════════

const STATES = ['heute', 'glatt', 'rausch', 'gebacken'];
const STATE_LABEL = {
  heute: 'heute — harte 45°-Kante',
  glatt: 'Alpha glatt (Rampe 0.55)',
  rausch: 'Alpha verrauscht (0.95 / amp 1.3)',
  gebacken: 'gebacken (echte Uebergangskachel)',
};
const RAMP_SMOOTH = 0.55, RAMP_NOISE = 0.95, NOISE_AMP = 1.3;
const BAKE_K = 3;   // Rauschvarianten je Kante — gegen die Kette gleicher Lappen

/** Zell-Luma minus Boxblur r3, plus Innenmaske der Raute */
function cellHighpass(cell, w, h) {
  const L = new Float32Array(w * h), msk = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    L[p] = L709(cell[i], cell[i + 1], cell[i + 2]);
    const x = p % w, y = (p / w) | 0;
    const u = Math.abs(x - (w - 1) / 2) / (w / 2) + Math.abs(y - (h - 1) / 2) / (h / 2);
    msk[p] = cell[i + 3] > 250 && u < 0.82 ? 1 : 0;
  }
  const R = 3, hp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      s += L[ny * w + nx]; n++;
    }
    hp[y * w + x] = L[y * w + x] - s / n;
  }
  return { hp, msk };
}

function variantOf(x, y, n) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return Math.abs(h) % n;
}

/**
 * Ein Iso-Feld in einem der vier Zustaende.
 * mats.A[v] / mats.B[v]  = Basiskacheln in Zeichengroesse
 * mats.bakeA[cfg][k]     = gebackene Kachel "A mit B-Nachbar"
 * mats.bakeB[cfg][k]     = gebackene Kachel "B mit A-Nachbar"
 */
function renderField(mats, state, opts) {
  const { tw, th, N, isB, collect } = opts;
  const half = tw / 2, hh = th / 2;
  const CW = (N + 1) * tw, CH = (N + 1) * th + th;
  const canvas = newCanvas(CW, CH);
  const alphaCache = {};
  const patches = [];
  for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
    const self = isB(gx, gy);
    const v = variantOf(gx, gy, 4);
    const base = self ? mats.B[v] : mats.A[v];
    let cell = base;
    const nSW = isB(gx, gy + 1), nSE = isB(gx + 1, gy);
    const drawSW = nSW !== self, drawSE = nSE !== self;
    if ((drawSW || drawSE) && state !== 'heute') {
      const cfg = drawSW && drawSE ? 'both' : drawSW ? 'sw' : 'se';
      if (state === 'gebacken') {
        const k = variantOf(gx * 7 + 3, gy * 5 + 1, BAKE_K);
        cell = self ? mats.bakeB[cfg][k] : mats.bakeA[cfg][k];
      } else {
        const other = self ? mats.A : mats.B;
        const ov = variantOf(gx + (cfg === 'se' ? 1 : 0), gy + (cfg === 'sw' ? 1 : 0), 4);
        const alpha = state === 'rausch'
          ? edgeAlpha(tw, th, cfg, RAMP_NOISE, NOISE_AMP, gx, gy)
          : (alphaCache[cfg] ||= edgeAlpha(tw, th, cfg, RAMP_SMOOTH));
        cell = blendCell(base, other[ov], alpha, tw, th);
      }
      if (collect) patches.push({ cfg, ...cellHighpass(cell, tw, th) });
    }
    const sx = (gx - gy) * half + CW / 2 - half;
    const sy = (gx + gy) * hh + hh;
    blit(canvas, CW, CH, cell, tw, th, Math.round(sx), Math.round(sy));
  }
  return { buf: canvas, w: CW, h: CH, patches };
}

/**
 * ZELLGLEICHHEIT — wie aehnlich sind zwei Grenzzellen derselben
 * Kantenkonfiguration einander? 1.00 heisst: entlang der ganzen Biomgrenze
 * steht immer dasselbe Bild, also eine Kette gleicher Lappen (LESSONS §4).
 * Gemessen als mittlere |NCC| der HOCHPASS-gefilterten Zell-Luma — roh
 * messen zwei ruhige Kacheln 0.99, ohne verwandt zu sein (LESSONS §8).
 */
function cellSimilarity(patches) {
  const byCfg = {};
  for (const p of patches) (byCfg[p.cfg] ||= []).push(p);
  let sum = 0, n = 0;
  for (const list of Object.values(byCfg)) {
    const use = list.slice(0, 20);
    for (let i = 0; i < use.length; i++) for (let j = i + 1; j < use.length; j++) {
      const a = use[i], b = use[j], msk = a.msk;
      let ma = 0, mb = 0, cnt = 0;
      for (let p = 0; p < a.hp.length; p++) { if (!msk[p]) continue; ma += a.hp[p]; mb += b.hp[p]; cnt++; }
      if (!cnt) continue;
      ma /= cnt; mb /= cnt;
      let sab = 0, sa = 0, sb = 0;
      for (let p = 0; p < a.hp.length; p++) {
        if (!msk[p]) continue;
        const u = a.hp[p] - ma, v = b.hp[p] - mb; sab += u * v; sa += u * u; sb += v * v;
      }
      if (sa > 0 && sb > 0) { sum += Math.abs(sab / Math.sqrt(sa * sb)); n++; }
    }
  }
  return n ? sum / n : null;
}

function diffStats(state, ref, w, h) {
  let changed = 0, sum = 0, n = 0;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    const d = Math.abs(L709(state[i], state[i + 1], state[i + 2]) - L709(ref[i], ref[i + 1], ref[i + 2]));
    n++;
    if (d > 2) { changed++; sum += d; }
  }
  return { area: changed / n * 100, mean: changed ? sum / changed : 0 };
}

function vacuumBuf(buf, w, h) {
  const o = Buffer.from(buf);
  for (let p = 0; p < w * h; p++) for (let c = 0; c < 3; c++)
    o[p * 4 + c] = Math.round(o[p * 4 + c] * (1 - VAC_A) + VAC_RGB[c] * VAC_A);
  return o;
}

// ══════════════════════════════════════════════════════════════════
// 8 — Die gezeigten Paare
// ══════════════════════════════════════════════════════════════════
// Vier Grenzarten, vier Zustaende, drei Massstaebe. a = das Material, das
// "unten" liegt und ueberblendet wird; b = der Nachbar.

const SHOW = [
  { a: 'rocky_desert', b: 'mesa', seam: 'bruch',
    art: 'optisch nah, gleiche Familie', ziel: 'Alpha muss hier offensichtlich reichen' },
  { a: 'beach', b: 'ocean', seam: 'wasser',
    art: 'Fluid mit sinnvollem Verlauf', ziel: 'Wasser ueber Sand IST Flachwasser' },
  { a: 'beach', b: 'plains', seam: 'vegetation',
    art: 'hart — Vegetationslinie', ziel: 'der Fall, den Rudi hart nennt' },
  { a: 'basalt_plain', b: 'lava_flow', seam: 'decke',
    art: 'hart — Deckenrand (Rudis Ausnahme)', ziel: 'Struktur-Ghosting pruefen' },
  { a: 'mineral_vein', b: 'ice_cavern', seam: 'bruch',
    art: 'hart — Bruchkante unter Tage', ziel: 'beide Kacheln neu, Eisig z -1…-4' },
];

const coastFn = (gx, gy) =>
  (gx * 0.55 + gy * 0.45 + 2.2 * Math.sin(gx * 0.7) + 1.4 * Math.cos(gy * 0.9)) > 8.2;

function trimBg(buf, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (buf[i] === BGA.r && buf[i + 1] === BGA.g && buf[i + 2] === BGA.b) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return { buf, w, h };
  const pad = 6;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const nw = x1 - x0 + 1, nh = y1 - y0 + 1, out = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++)
    buf.copy(out, y * nw * 4, ((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + nw) * 4);
  return { buf: out, w: nw, h: nh };
}

// ══════════════════════════════════════════════════════════════════
// Hauptlauf
// ══════════════════════════════════════════════════════════════════

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const written = [];
  const write = async (name, buf) => {
    fs.writeFileSync(path.join(OUT, PRE + name), buf);
    written.push(PRE + name);
    return PRE + name;
  };

  // ── 1  Kacheln vermessen. Uebernimmt den alten Cache nur fuer Kacheln,
  //       die seit dessen Schreibzeit NICHT angefasst wurden.
  const biomes = fs.readdirSync(TILES, { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name).sort();
  let cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  if (!Object.keys(cache).length && fs.existsSync(OLD_CACHE)) {
    const oldT = fs.statSync(OLD_CACHE).mtimeMs;
    const old = JSON.parse(fs.readFileSync(OLD_CACHE, 'utf8'));
    let kept = 0, dropped = 0;
    for (const [k, v] of Object.entries(old)) {
      const f = tilePath(v.b, v.v);
      if (fs.existsSync(f) && fs.statSync(f).mtimeMs < oldT - 60000) { cache[k] = v; kept++; }
      else dropped++;
    }
    console.log(`0/6  alter Cache: ${kept} Zeilen uebernommen, ${dropped} neu zu messen`);
  }
  let measured = 0;
  for (const b of biomes) for (let v = 0; v < 4; v++) {
    const key = `${b}_${v}`, f = tilePath(b, v);
    if (!fs.existsSync(f) || cache[key]) continue;
    const t = await textureMetrics(f), s = await tileStats(f);
    cache[key] = { b, v, L: s.L, p70: s.p70, br: s.br, gr: s.gr, rgb: s.rgb,
      micro4: await microAt(f, 128, 64), micro8: await microAt(f, 64, 32), meso: t.meso, grain: t.grain };
    measured++;
    if (measured % 8 === 0) console.log(`     … ${measured} Kacheln neu vermessen`);
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  console.log(`1/6  ${Object.keys(cache).length} Kacheln (${measured} neu vermessen)`);

  const perBiome = {};
  for (const b of biomes) {
    const rows = [0, 1, 2, 3].map((v) => cache[`${b}_${v}`]).filter(Boolean);
    if (!rows.length) continue;
    const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
    perBiome[b] = { L: avg('L'), p70: avg('p70'), br: avg('br'), gr: avg('gr'),
      micro4: avg('micro4'), micro8: avg('micro8'), meso: avg('meso'), grain: avg('grain'),
      rgb: [0, 1, 2].map((c) => rows.reduce((s, r) => s + r.rgb[c], 0) / rows.length) };
  }
  const KEYS = ['p70', 'br', 'gr', 'micro4', 'meso', 'grain'];
  const sd = {};
  for (const k of KEYS) {
    const a = Object.values(perBiome).map((x) => x[k]);
    const m = a.reduce((s, x) => s + x, 0) / a.length;
    sd[k] = Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length) || 1;
  }
  const dist = (x, y) => {
    const A = perBiome[x], B = perBiome[y];
    if (!A || !B) return { d: null, level: null, colour: null, texture: null };
    const z = (k) => (A[k] - B[k]) / sd[k];
    const level = Math.abs(z('p70'));
    const colour = Math.sqrt((z('br') ** 2 + z('gr') ** 2) / 2);
    const texture = Math.sqrt((z('micro4') ** 2 + z('meso') ** 2 + z('grain') ** 2) / 3);
    return { d: Math.sqrt((level ** 2 + colour ** 2 + texture ** 2) / 3), level, colour, texture };
  };

  // ── 2  Kalibrierung gegen Rudis elf Urteile, mit den NEUEN Zahlen
  const CALIB = [
    ['mesa', 'rocky_desert', 'nah'], ['regolith', 'dust_plain', 'nah'], ['regolith', 'crater', 'nah'],
    ['crater', 'dust_plain', 'nah'], ['regolith', 'rocky_outcrop', 'nah'], ['reef', 'shallow_water', 'nah'],
    ['deep_ocean', 'kelp_forest', 'nah'], ['beach', 'plains', 'weit'], ['plains', 'mountain', 'weit'],
    ['ash_field', 'basalt_plain', 'weit'], ['basalt_plain', 'lava_flow', 'weit'],
  ].map(([a, b, soll]) => {
    const d = dist(a, b);
    const famSagt = (FORCE_HARD[a] || FORCE_HARD[b]) ? 'weit'
      : (FAM[a] === '?' || FAM[b] === '?') ? '?' : FAM[a] === FAM[b] ? 'nah' : 'weit';
    return { a, b, soll, ...d, fam: `${FAM[a]}|${FAM[b]}`, famSagt, famOk: famSagt === soll,
      mesoMin: Math.min(perBiome[a].meso, perBiome[b].meso) };
  });
  const nahD = CALIB.filter((c) => c.soll === 'nah').map((c) => c.d);
  const weitD = CALIB.filter((c) => c.soll === 'weit').map((c) => c.d);
  let bestHits = 0, bestT = 0;
  for (const t of CALIB.map((c) => c.d).concat([0, 9]).sort((p, q) => p - q)) {
    const hits = CALIB.filter((c) => (c.d < t ? 'nah' : 'weit') === c.soll).length;
    if (hits > bestHits) { bestHits = hits; bestT = t; }
  }
  const famHits = CALIB.filter((c) => c.famOk).length;
  console.log(`2/6  Kalibrierung neu: Abstand ${bestHits}/11 (Schwelle ${f2(bestT)}), Materialfamilie ${famHits}/11`);

  // ── 3  Klassifikation aller Paare
  const { pairs, surface, total } = buildPairs();
  for (const p of pairs) {
    Object.assign(p, dist(p.a, p.b));
    p.mesoMin = perBiome[p.a] && perBiome[p.b] ? Math.min(perBiome[p.a].meso, perBiome[p.b].meso) : null;
    p.chroma = perBiome[p.a] && perBiome[p.b] ? chromaDip(perBiome[p.a].rgb, perBiome[p.b].rgb) : null;
  }
  const cnt = (c) => pairs.filter((p) => p.cls === c).length;
  console.log(`3/6  ${pairs.length} Paare (${surface} Oberflaeche): ` +
    `${cnt('ALPHA')} Alpha, ${cnt('GEBACKEN')} gebacken, ${cnt('OFFEN')} offen, ${cnt('ENTFAELLT')} entfaellt`);

  // ── 4  Kontur-Index (auf 512x256, cfg = both)
  const kontur = {};
  {
    const glatt = edgeAlpha(512, 256, 'both', RAMP_SMOOTH);
    const rausch = edgeAlpha(512, 256, 'both', RAMP_NOISE, NOISE_AMP, 3, 5);
    const cG = contourCrossings(glatt, 512, 256);
    kontur.glatt = { index: 1, defl: edgeDeflection(glatt, 512, 256, 'se') };
    kontur.rausch = { index: contourCrossings(rausch, 512, 256) / cG, defl: edgeDeflection(rausch, 512, 256, 'se') };
    for (const kind of Object.keys(SEAM)) {
      const mk = bakedMask(512, 256, 'both', kind, 7);
      kontur['gebacken_' + kind] = { index: contourCrossings(mk, 512, 256) / cG, defl: edgeDeflection(mk, 512, 256, 'se') };
    }
    kontur.crossingsGlatt = cG;
  }

  // ── 5  Bilder je Paar
  console.log('4/6  gebackene Kacheln erzeugen und Felder rendern …');
  const bakeBytes = [];
  const results = [];
  for (const s of SHOW) {
    const key = `${s.a}__${s.b}`;
    console.log(`     ${s.a} | ${s.b}  (${s.seam})`);
    // (a) gebackene Kacheln bei 512x256 aus Variante 0 beider Biome
    const A512 = await loadRaw(tilePath(s.a, 0), 512, 256);
    const B512 = await loadRaw(tilePath(s.b, 0), 512, 256);
    const bakedFiles = { A: {}, B: {} };
    for (const cfg of ['sw', 'se', 'both']) {
      bakedFiles.A[cfg] = []; bakedFiles.B[cfg] = [];
      for (let k = 0; k < BAKE_K; k++) {
        const rawA = bakeTile(A512, B512, 512, 256, cfg, s.seam, 100 + k * 17);
        const rawB = bakeTile(B512, A512, 512, 256, cfg, s.seam, 300 + k * 17);
        for (const [tag, raw] of [['A', rawA], ['B', rawB]]) {
          const base = `bake_${key}_${tag}_${cfg}_k${k}`;
          const wb = await sharp(raw, { raw: { width: 512, height: 256, channels: 4 } })
            .webp({ quality: 90, effort: 4 }).toBuffer();
          const f = await write(base + '.webp', wb);
          let mips = 0;
          for (const [suf, mw, mh] of [['@half', 256, 128], ['@quarter', 128, 64], ['@eighth', 64, 32]]) {
            const m = await sharp(raw, { raw: { width: 512, height: 256, channels: 4 } })
              .resize(mw, mh, { fit: 'fill', kernel: 'lanczos3' }).webp({ quality: 90, effort: 4 }).toBuffer();
            fs.writeFileSync(path.join(OUT, PRE + base + suf + '.webp'), m);
            mips += m.length;
          }
          bakeBytes.push({ pair: key, tag, cfg, k, base: wb.length, mips, total: wb.length + mips });
          bakedFiles[tag][cfg].push(path.join(OUT, PRE + base + '.webp'));
        }
      }
    }
    // (b) Materialien je Zeichengroesse
    const matsAt = async (tw, th) => {
      const m = { A: [], B: [], bakeA: {}, bakeB: {} };
      for (let v = 0; v < 4; v++) {
        m.A.push(await loadRaw(tilePath(s.a, v), tw, th));
        m.B.push(await loadRaw(tilePath(s.b, v), tw, th));
      }
      for (const cfg of ['sw', 'se', 'both']) {
        m.bakeA[cfg] = []; m.bakeB[cfg] = [];
        for (let k = 0; k < BAKE_K; k++) {
          m.bakeA[cfg].push(await rawFromBuf(fs.readFileSync(bakedFiles.A[cfg][k]), tw, th));
          m.bakeB[cfg].push(await rawFromBuf(fs.readFileSync(bakedFiles.B[cfg][k]), tw, th));
        }
      }
      return m;
    };
    const m512 = await matsAt(512, 256);
    const m96 = await matsAt(96, 48);
    const m48 = await matsAt(48, 24);

    const row = { ...s, key, images: {}, metrics: {}, bakeBytes: null };
    let refField = null;
    for (const st of STATES) {
      // Massstab 1 — die 512er Kachelpaarung
      const p1 = renderField(m512, st, { tw: 512, th: 256, N: 2, isB: (gx, gy) => gx + gy >= 1 });
      const t1 = trimBg(p1.buf, p1.w, p1.h);
      row.images[st + '_512'] = await write(`${key}_${st}_512.png`, await png(t1.buf, t1.w, t1.h));
      // Massstab 2 — gemischtes Feld
      const p2 = renderField(m96, st, { tw: 96, th: 48, N: 15, isB: coastFn, collect: true });
      row.images[st + '_feld'] = await write(`${key}_${st}_feld.png`, await png(p2.buf, p2.w, p2.h));
      if (st === 'heute') refField = p2.buf;
      row.metrics[st] = {
        diff: st === 'heute' ? { area: 0, mean: 0 } : diffStats(p2.buf, refField, p2.w, p2.h),
        repeat: cellSimilarity(p2.patches),
        zellen: p2.patches.length,
      };
      // Massstab 3 — Spielskala 48x24, x2 nearest
      const p3 = renderField(m48, st, { tw: 48, th: 24, N: 15, isB: coastFn });
      row.images[st + '_spiel'] = await write(`${key}_${st}_spiel.png`,
        await sharp(await png(p3.buf, p3.w, p3.h)).resize(p3.w * 2, p3.h * 2, { kernel: 'nearest' }).png().toBuffer());
      // Vakuum nur fuer den verrauschten und den gebackenen Zustand
      if (st === 'rausch' || st === 'gebacken') {
        const v = vacuumBuf(p2.buf, p2.w, p2.h);
        row.images[st + '_vac'] = await write(`${key}_${st}_vac.png`, await png(v, p2.w, p2.h));
      }
    }
    // (b2) Assetblatt: die SECHS Uebergaenge eines Paares, k=0
    {
      const TWa = 256, THa = 128, cw = TWa + 10, chh = THa + 26;
      const CW = 3 * cw + 8, CH = 2 * chh + 16;
      const canvas = newCanvas(CW, CH);
      const labels = [];
      let ci = 0;
      for (const [tag, other] of [['A', s.b], ['B', s.a]]) {
        const own = tag === 'A' ? s.a : s.b;
        let cj = 0;
        for (const cfg of ['sw', 'se', 'both']) {
          const raw = await rawFromBuf(fs.readFileSync(bakedFiles[tag][cfg][0]), TWa, THa);
          const x = cj * cw + 4, y = ci * chh + 18;
          blit(canvas, CW, CH, raw, TWa, THa, x, y);
          labels.push({ input: svgLabel(`${own} + ${other} ${cfg}`, cw, 11, ci ? '#ffa657' : '#79c0ff'), left: x, top: y - 14 });
          cj++;
        }
        ci++;
      }
      const base = await png(canvas, CW, CH);
      row.images.assets = await write(`${key}_assets.png`, await sharp(base).composite(labels).png().toBuffer());
    }
    // (c) gebacken mit NUR EINER Rauschvariante — die Kette gleicher Lappen
    const one = { ...m96, bakeA: {}, bakeB: {} };
    for (const cfg of ['sw', 'se', 'both']) {
      one.bakeA[cfg] = [m96.bakeA[cfg][0], m96.bakeA[cfg][0], m96.bakeA[cfg][0]];
      one.bakeB[cfg] = [m96.bakeB[cfg][0], m96.bakeB[cfg][0], m96.bakeB[cfg][0]];
    }
    const pK1 = renderField(one, 'gebacken', { tw: 96, th: 48, N: 15, isB: coastFn, collect: true });
    row.images.gebacken_k1_feld = await write(`${key}_gebackenK1_feld.png`, await png(pK1.buf, pK1.w, pK1.h));
    row.metrics.gebackenK1 = { diff: diffStats(pK1.buf, refField, pK1.w, pK1.h), repeat: cellSimilarity(pK1.patches), zellen: pK1.patches.length };

    row.optik = dist(s.a, s.b);
    row.chroma = chromaDip(perBiome[s.a].rgb, perBiome[s.b].rgb);
    row.mesoA = perBiome[s.a].meso; row.mesoB = perBiome[s.b].meso;
    row.bakeBytes = bakeBytes.filter((x) => x.pair === key);
    results.push(row);
  }

  // ── 6  Kosten
  const allTiles = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f); else if (e.name.endsWith('.webp')) allTiles.push(fs.statSync(f).size);
    }
  })(TILES);
  const tilesTotal = allTiles.reduce((s, x) => s + x, 0);
  const nBase = 55 * 4;
  const perTile = tilesTotal / nBase;
  const bakeAvg = bakeBytes.reduce((s, x) => s + x.total, 0) / bakeBytes.length;
  const apkPath = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  const apk = fs.existsSync(apkPath) ? fs.statSync(apkPath).size : null;

  const nGeb = cnt('GEBACKEN');
  const kosten = {
    tilesTotalB: tilesTotal, perTileB: perTile, nBase, apkB: apk,
    bakeAvgB: bakeAvg,
    bakeBaseB: bakeBytes.reduce((s, x) => s + x.base, 0) / bakeBytes.length,
    wegA: { assets: nGeb * 6, bytes: nGeb * 6 * bakeAvg },
    wegA4: { assets: nGeb * 6 * 4, bytes: nGeb * 6 * 4 * bakeAvg },
    wegAall: { assets: pairs.filter((p) => p.cls !== 'ENTFAELLT').length * 6, bytes: pairs.filter((p) => p.cls !== 'ENTFAELLT').length * 6 * bakeAvg },
    wegAK: { assets: nGeb * 6 * BAKE_K, bytes: nGeb * 6 * BAKE_K * bakeAvg },
  };

  // ── 7  Ausgabe
  const T = [];
  const P = (s) => T.push(s);
  P(`BIOM-UEBERGAENGE — NEU GEMESSEN  ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);
  P(`Kacheln: ${Object.keys(cache).length} (${measured} in diesem Lauf neu vermessen)`);
  P('');
  P('KALIBRIERUNG — reproduziert der optische Abstand Rudis Urteile? (NEUE Zahlen)');
  P('  Paar                          soll       d   LEVEL   FARBE  TEXTUR  min(MESO)  Familie sagt   ok');
  for (const c of CALIB)
    P(`  ${(c.a + ' | ' + c.b).padEnd(28)} ${c.soll.padEnd(5)} ${f2(c.d).padStart(6)}  ${f2(c.level).padStart(6)}  ${f2(c.colour).padStart(6)}  ${f2(c.texture).padStart(6)}  ${f2(c.mesoMin).padStart(9)}  ${c.famSagt.padEnd(11)} ${c.famOk ? 'JA' : 'NEIN'}`);
  P(`  --> Abstand trifft ${bestHits}/11 (beste Schwelle ${f2(bestT)}); Materialfamilie trifft ${famHits}/11`);
  P(`  --> Mittel d "nah" ${f2(nahD.reduce((s, x) => s + x, 0) / nahD.length)} gegen "weit" ${f2(weitD.reduce((s, x) => s + x, 0) / weitD.length)}`);
  P('');
  P('DIE GRENZLINIE SELBST (512x256, Auslenkung an der SE-Kante gemessen)');
  P('                          Kontur-Index   Auslenkung sd    Spanne   mittl. Abstand');
  const kl = (n, o) => P(`  ${n.padEnd(22)} ${f2(o.index).padStart(8)}   ${f1(o.defl.sd).padStart(11)} px ${f1(o.defl.max).padStart(8)} px ${f1(o.defl.mean).padStart(12)} px`);
  kl('glatte Rampe 0.55', kontur.glatt);
  kl('verrauscht 0.95/1.3', kontur.rausch);
  for (const k of Object.keys(SEAM)) kl('gebacken ' + k, kontur['gebacken_' + k]);
  P(`  (Kontur-Index = Laenge der 0.5-Linie relativ zur glatten Rampe, dort ${kontur.crossingsGlatt} Durchgaenge)`);
  P('');
  P('DIE GEZEIGTEN PAARE');
  for (const r of results) {
    P(`  ${r.a} | ${r.b}   [${r.art}]  Saum "${r.seam}"`);
    P(`    optisch d ${f2(r.optik.d)}  (LEVEL ${f2(r.optik.level)} FARBE ${f2(r.optik.colour)} TEXTUR ${f2(r.optik.texture)})`);
    P(`    MESO ${f1(r.mesoA)} / ${f1(r.mesoB)}  min ${f1(Math.min(r.mesoA, r.mesoB))}   Chroma-Senke ${f1(r.chroma.dip)} ueber ${(r.chroma.band * 100).toFixed(0)}% der Rampe`);
    for (const st of STATES) {
      const m = r.metrics[st];
      P(`    ${st.padEnd(10)} geaenderte Flaeche ${f2(m.diff.area).padStart(5)}%  mittlere Aenderung ${f1(m.diff.mean).padStart(5)} Luma  Grenzzellen ${m.zellen}  Zellgleichheit ${f3(m.repeat)}`);
    }
    const k1 = r.metrics.gebackenK1;
    P(`    ${'gebacken K=1'.padEnd(10)} Zellgleichheit ${f3(k1.repeat)}  (gegen ${f3(r.metrics.gebacken.repeat)} bei K=${BAKE_K})`);
  }
  P('');
  P('KOSTEN');
  P(`  Biomkacheln heute       ${nBase} Basiskacheln + Mips = ${(tilesTotal / 1048576).toFixed(2)} MB, ${(perTile / 1024).toFixed(1)} KB je Kachel`);
  P(`  gebackene Uebergangskachel  ${(kosten.bakeBaseB / 1024).toFixed(1)} KB Basis + Mips = ${(bakeAvg / 1024).toFixed(1)} KB (${bakeBytes.length} gemessen)`);
  if (apk) P(`  Release-APK             ${(apk / 1048576).toFixed(1)} MB`);
  const mb = (b) => (b / 1048576).toFixed(2);
  const pct = (b) => apk ? ((b / apk) * 100).toFixed(1) + ' %' : '—';
  P(`  Weg A, nur die ${nGeb} harten, 1 Variante   ${kosten.wegA.assets} Kacheln  ${mb(kosten.wegA.bytes)} MB  = +${pct(kosten.wegA.bytes)} APK`);
  P(`  Weg A, harte x ${BAKE_K} Rauschvarianten     ${kosten.wegAK.assets} Kacheln  ${mb(kosten.wegAK.bytes)} MB  = +${pct(kosten.wegAK.bytes)} APK`);
  P(`  Weg A, harte x 4 Grundvarianten     ${kosten.wegA4.assets} Kacheln  ${mb(kosten.wegA4.bytes)} MB  = +${pct(kosten.wegA4.bytes)} APK`);
  P(`  Weg A, ALLE Paare x1                ${kosten.wegAall.assets} Kacheln  ${mb(kosten.wegAall.bytes)} MB  = +${pct(kosten.wegAall.bytes)} APK`);
  P('');
  P(`ALLE ${pairs.length} PAARE — harte zuerst`);
  const ord = { GEBACKEN: 0, OFFEN: 1, ENTFAELLT: 2, ALPHA: 3 };
  pairs.sort((x, y) => (ord[x.cls] - ord[y.cls]) || (x.group || '').localeCompare(y.group || '') || x.k.localeCompare(y.k));
  P('  Paar                                 Vorkommen                          Verfahren   d      Begruendung');
  for (const p of pairs)
    P(`  ${(p.a + ' | ' + p.b).padEnd(36)} ${p.where.join(', ').padEnd(34)} ${p.cls.padEnd(10)} ${f2(p.d).padStart(5)}  ${p.why}`);
  P('');
  P(`VERTEILUNG: ${cnt('ALPHA')} Alpha / ${cnt('GEBACKEN')} gebacken / ${cnt('OFFEN')} offen / ${cnt('ENTFAELLT')} entfaellt (Summe ${pairs.length})`);
  const byGroup = {};
  for (const p of pairs.filter((x) => x.cls === 'GEBACKEN')) byGroup[p.group] = (byGroup[p.group] || 0) + 1;
  for (const [g, n] of Object.entries(byGroup)) P(`  gebacken: ${String(n).padStart(3)}  ${g}`);
  const byFam = {};
  for (const p of pairs.filter((x) => x.cls === 'ALPHA' && x.famA === x.famB)) byFam[p.famA] = (byFam[p.famA] || 0) + 1;
  for (const [g, n] of Object.entries(byFam)) P(`  alpha, gleiche Familie: ${String(n).padStart(3)}  ${g}`);
  P(`  alpha, Verlauf (Grund 2): ${pairs.filter((x) => x.cls === 'ALPHA' && x.famA !== x.famB).length}`);

  fs.writeFileSync(path.join(OUT, PRE + 'zahlen.txt'), T.join('\n'));
  console.log('5/6  Zahlen geschrieben');

  // HTML-Fragment: die vollstaendige Paartabelle
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const F = ['<table class="pairs">',
    '<tr><th>Paar</th><th>trifft sich auf</th><th>Grenzart</th><th>Verfahren</th><th>d</th><th>min MESO</th><th>Begründung</th></tr>'];
  for (const p of pairs) {
    const cl = p.cls === 'GEBACKEN' ? 'geb' : p.cls === 'ALPHA' ? 'alp' : p.cls === 'OFFEN' ? 'off' : 'ent';
    F.push(`<tr class="${cl}"><td>${esc(p.a)} | ${esc(p.b)}</td><td>${esc(p.where.join(', '))}${p.ug && p.planes.length ? ' — ' + esc(p.planes.join('; ')) : ''}</td>` +
      `<td>${esc(p.group || (p.famA === p.famB ? 'familienintern' : p.flow ? 'Verlauf' : '—'))}</td>` +
      `<td class="v">${p.cls}</td><td>${f2(p.d)}</td><td>${f1(p.mesoMin)}</td><td>${esc(p.why)}</td></tr>`);
  }
  F.push('</table>');
  fs.writeFileSync(path.join(OUT, PRE + 'tabelle.html'), F.join('\n'));

  // Markdown-Fragment fuer Docs/PLAN-biome-uebergaenge.md
  const M = ['| Paar | trifft sich auf | Grenzart | Verfahren | d | min MESO | Begründung |', '|---|---|---|---|---|---|---|'];
  for (const p of pairs)
    M.push(`| \`${p.a}\` \\| \`${p.b}\` | ${p.where.join(', ')}${p.ug && p.planes.length ? ' — ' + p.planes.join('; ') : ''} | ${p.group || (p.famA === p.famB ? 'familienintern' : p.flow ? 'Verlauf' : '—')} | **${p.cls}** | ${f2(p.d)} | ${f1(p.mesoMin)} | ${p.why} |`);
  fs.writeFileSync(path.join(OUT, PRE + 'tabelle.md'), M.join('\n'));

  fs.writeFileSync(path.join(OUT, PRE + 'data.json'), JSON.stringify({
    stand: new Date().toISOString(), perBiome, CALIB, bestHits, bestT, famHits,
    kontur, pairs, results: results.map((r) => ({ ...r, images: r.images, metrics: r.metrics })),
    kosten, bakeBytes, written: written.length,
  }, null, 1));
  console.log(`6/6  fertig in ${((Date.now() - t0) / 1000).toFixed(1)} s — ${written.length} Dateien`);
  console.log('\n' + T.join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
