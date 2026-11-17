/**
 * DIE ERD-BASIS, RUNDE 2 -- NASS statt nur DUNKEL.
 *
 * Rudi zur ersten Leiter: "die ableitungen aus permafrost sehen mir etwas zu
 * trocken aus ... ich glaube nass wuerde hoeherer kontrast und mehr highlights
 * aber auch mehr lowlights bedeuten".
 *
 * WARUM RUNDE 1 TROCKEN WIRKTE, in einem Satz:
 *   sie hat die nassen Stellen nur VERSCHOBEN (luma-erhaltende Umfaerbung plus
 *   gleichmaessige Abdunklung) und nicht GESPREIZT. Nasser Boden wird dunkler,
 *   WEIL Wasser die Poren fuellt und weniger Licht zurueckstreut -- und bekommt
 *   gleichzeitig eine spiegelnde Komponente obendrauf. Der Dynamikumfang
 *   INNERHALB der nassen Flaeche waechst also in beide Richtungen. Genau das
 *   fehlte.
 *
 * DREI OPERATOREN, ALLE INNERHALB DER FEUCHTEMASKE, KEINER GLOBAL
 *
 * 1. PORENFUELLUNG -- der lokale Mittelwert (Blur r8) sinkt um dip*M.
 *
 * 2. ASYMMETRISCHE SPREIZUNG -- die Abweichung vom lokalen Mittel wird nach
 *    UNTEN staerker verstaerkt als nach oben (aLow >> aHigh). Das ist der
 *    Unterschied zu einem Unsharp, und er ist nicht kosmetisch:
 *      - ein Unsharp ist SYMMETRISCH, global und ohne Pegelabsenkung
 *      - hier ist er maskiert, asymmetrisch, und der lokale Mittelwert faellt
 *    Physikalisch richtig: die diffusen Lichter werden nass sogar DUNKLER, die
 *    Tiefen deutlich dunkler, und das Licht kommt als SPIEGELUNG zurueck, nicht
 *    als Streuung. Deshalb traegt Punkt 3 die Helligkeit, nicht Punkt 2.
 *    (LESSONS: micro4 laesst sich mit einem Unsharp um 56 % heben, ohne dass
 *    das Bild besser wird -- micro4 ist hier Diagnose, nicht Kriterium.)
 *
 * 3. SPIEGELLICHTER AUS DER EIGENEN MIKRO-GEOMETRIE, nicht aus Rauschen.
 *    Die Luma wird als Hoehenfeld gelesen, die Normale aus zentralen Differenzen
 *    ueber +-2 px, Blinn-Phong mit Licht von OBEN-LINKS (Iso-Standard, dieselbe
 *    Richtung, die die geplante Steinschattierung bekommt). Eine KNIE-Quantile
 *    laesst nur die obersten `specTop` Prozent der Mikro-Haenge aufleuchten --
 *    daher kleine Lichter in Poren und an Schollenkanten statt eines breiten
 *    Schimmers. Der breite Schimmer war der Fehler, den metallic_surface gerade
 *    losgeworden ist (spec1.6 11.82 -> 2.8).
 *    Und sie sitzen NUR, wo die Maske nass sagt -- das ist der Unterschied
 *    zwischen "nassen Stellen" und "glaenzender Kachel".
 *
 * DIE ABLEITUNGEN LAUFEN TOROIDAL. Die +-2-px-Differenzen werden ueber
 * D.latticeRoll geholt, also exakt auf dem Iso-Torus statt an der Rautenkante
 * abgeschnitten. Der lokale Mittelwert nutzt blurOpaque wie corrosionMask -- das
 * ist der Pfad, der bei metallic_surface die Kachelung messbar nichts gekostet
 * hat (Raster 8.23 -> 8.18). Nachgemessen wird trotzdem.
 *
 * Jeder Operator wirkt als SKALAR pro Pixel auf R,G,B, also bleibt der
 * Farbton-Feldanteil (cbPP/cbSd) aus der Umfaerbung unberuehrt.
 *
 * Schreibt NUR nach assets/style-test/tiles/.
 * Usage: node scripts/tiles-earth-basis-wet.cjs
 */
const fs = require('fs');
const path = require('path');
const S = require('./lib-tile-metrics.cjs');
const D = require('./tiles-dust-plain-lib.cjs');
const GR = require('./lib-grain.cjs');
const CO = require('./lib-corrode.cjs');
const sharp = S.sharp;
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const HERO = path.join(TILES, 'permafrost', 'permafrost_0.webp');

const P70_T = 44, BR_T = 0.660, GR_T = 0.830;
const SEED = 20260905;

/**
 * name, cover, dry[br,gr], damp[br,gr], dip, aLow, aHigh, aFine, spec, specTop
 *   dip     Absenkung des lokalen Mittels (Blur r16) in der Maske
 *   aLow    Verstaerkung des MESO-Bandes NACH UNTEN -- die Poren und Schollenfugen
 *   aHigh   dasselbe nach oben (klein -- nass streut weniger diffus zurueck)
 *   aFine   das KORN-Band, absichtlich klein: verstaerkt man es, entsteht
 *           Pfeffer-Rauschen und keine Naesse. Runde 2a hat genau das gemacht.
 *   spec    Staerke der Spiegellichter, in Einheiten von p70
 *   specTop Anteil der Mikro-Haenge, der ueberhaupt aufleuchtet
 */
const RUNGS = [
  ['w0_trocken', 0.35, [0.740, 0.870], [0.620, 0.800], 0.06, 0.00, 0.00, 0.00, 0.00, 0.00],
  ['w1_leicht',  0.35, [0.745, 0.872], [0.605, 0.792], 0.07, 0.40, 0.05, 0.03, 0.30, 0.05],
  ['w2_mittel',  0.40, [0.750, 0.875], [0.585, 0.782], 0.10, 0.80, 0.08, 0.06, 0.60, 0.05],
  ['w3_nass',    0.45, [0.755, 0.878], [0.560, 0.770], 0.13, 1.30, 0.10, 0.09, 0.95, 0.06],
  ['w4_trief',   0.50, [0.760, 0.880], [0.540, 0.760], 0.16, 1.90, 0.12, 0.12, 1.40, 0.07],
];

const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : 'NaN');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'NaN');
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : 'NaN');

const lumaOf = (b, ch, w, h) => {
  const L = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) L[p] = S.L709(b[p * ch], b[p * ch + 1], b[p * ch + 2]);
  return L;
};

/**
 * Der Nasse-Operator. Gibt einen SKALAREN Gewinn pro Pixel zurueck, der auf
 * R,G,B gleich wirkt -- Farbton, cbPP und cbSd bleiben davon unberuehrt.
 */
function wet(src, ch, w, h, M, dip, aLow, aHigh, aFine, spec, specTop) {
  const L = lumaOf(src, ch, w, h);
  const A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) A[p] = src[p * ch + 3] >= 250 ? 1 : 0;
  // Drei Baender, dieselbe Zerlegung wie lib-band.bandScale:
  //   L = b16 (Pegel) + (b6 - b16) (MESO, Poren und Schollenfugen) + (L - b6) (KORN)
  const b6 = GR.blurOpaque(L, A, w, h, 6);
  const b16 = GR.blurOpaque(L, A, w, h, 16);

  // ---- toroidale zentrale Differenzen ueber +-2 px -----------------------
  const roll = (dx, dy) => lumaOf(D.latticeRoll(src, ch, w, h, dx, dy), ch, w, h);
  const Lxm = roll(-2, 0), Lxp = roll(2, 0), Lym = roll(0, -2), Lyp = roll(0, 2);

  // ---- Blinn-Phong, Licht von oben-links (y zeigt nach unten) ------------
  const lv = [-1, -1, 1.4], ln = Math.hypot(lv[0], lv[1], lv[2]);
  const hv = [lv[0] / ln, lv[1] / ln, lv[2] / ln + 1];
  const hn = Math.hypot(hv[0], hv[1], hv[2]);
  hv[0] /= hn; hv[1] /= hn; hv[2] /= hn;
  const SLOPE = 0.10;                       // px Luma -> Neigung
  const SHINE = 40;                         // Blinn-Exponent: eng = kleine Lichter

  const raw = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (!A[p]) continue;
    const gx = (Lxm[p] - Lxp[p]) * 0.25 * SLOPE;   // /4 = zentrale Differenz ueber 2*2 px
    const gy = (Lym[p] - Lyp[p]) * 0.25 * SLOPE;
    const nz = 1 / Math.sqrt(gx * gx + gy * gy + 1);
    const nx = -gx * nz, ny = -gy * nz;
    const d = nx * hv[0] + ny * hv[1] + nz * hv[2];
    raw[p] = d > 0 ? Math.pow(d, SHINE) : 0;
  }
  // Knie: nur die obersten specTop Prozent der Haenge leuchten -- UND danach auf
  // [0,1] normieren. Ohne die Normierung erreicht d^SHINE nie annaehernd 1 und
  // die angeforderte Amplitude kommt nie an: in der ersten Fassung blieb `tail`
  // bei 2.01 -> 2.07 stehen, waehrend `spec` schon auf 0.48 stand.
  let knee = 1, span = 1;
  if (spec > 0 && specTop > 0) {
    const v = [];
    for (let p = 0; p < w * h; p++) if (A[p]) v.push(raw[p]);
    v.sort((a, b) => a - b);
    knee = v[Math.min(v.length - 1, Math.floor(v.length * (1 - specTop)))];
    const top = v[Math.min(v.length - 1, Math.floor(v.length * 0.99))];   // ab p99 volle Staerke: ~1 % der Pixel sind das LICHT, der Rest die Flanke
    span = Math.max(1e-6, top - knee);
  }

  // ---- zusammensetzen ---------------------------------------------------
  const p70 = S.statsRaw(src, ch, w, h).p70;
  const out = Buffer.from(src);
  let hi = 0;
  for (let p = 0; p < w * h; p++) {
    if (src[p * ch + 3] < 1) continue;
    const m = M[p];
    const meso = b6[p] - b16[p];
    const fine = L[p] - b6[p];
    const mesoOut = meso < 0 ? meso * (1 + aLow * m) : meso * (1 + aHigh * m);
    const t = b16[p] * (1 - dip * m) + mesoOut + fine * (1 + aFine * m);
    // Der diffuse Anteil bleibt ein SKALAR -> Farbton unberuehrt.
    const k = L[p] > 1e-6 ? t / L[p] : 1;
    // Das Spiegellicht ist ADDITIV auf alle drei Kanaele gleich. Physikalisch
    // richtig: eine Spiegelung traegt die Farbe des LICHTS, nicht die des
    // Materials -- und deshalb entsaettigt sie das Licht von selbst. Als
    // skalarer Gewinn kam es in Runde 2b als oranger Punkt zurueck.
    let add = 0;
    if (spec > 0 && knee < 1) {
      let s = raw[p] > knee ? (raw[p] - knee) / span : 0;
      if (s > 1) s = 1;
      if (s > 0) { add = spec * p70 * m * s; hi++; }
    }
    for (let c = 0; c < 3; c++) {
      const v = src[p * ch + c] * k + add;
      out[p * ch + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return { buf: out, lit: 100 * hi / (w * h) };
}

(async () => {
  fs.mkdirSync(ST, { recursive: true });
  const r0 = await sharp(fs.readFileSync(HERO)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const CHN = r0.info.channels, W = r0.info.width, H = r0.info.height;
  console.log('Quelle permafrost_0, Ziel p70 ' + P70_T + '  B/R ' + BR_T + '  G/R ' + GR_T + '  Rampe 0/0\n');

  for (const [name, cover, dry, damp, dip, aLow, aHigh, aFine, spec, specTop] of RUNGS) {
    const M = CO.corrosionMask(r0.data, CHN, W, H, cover, 0.5, SEED);
    const c = CO.corrode(r0.data, CHN, W, H, M, dry, damp);
    const wres = wet(c.buf, CHN, W, H, M, dip, aLow, aHigh, aFine, spec, specTop);
    const flat = D.flattenPoly(wres.buf, CHN, W, H, 5);
    const out = path.join(ST, '_underground_basis_' + name + '.webp');
    await D.solveTile(flat, W, H, CHN, out, P70_T, BR_T, GR_T, 0, 0, 10);
    const rr = await sharp(fs.readFileSync(out)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    await D.writeTile(D.edgeRepair(rr.data, rr.info.channels, W, H, 3), W, H, rr.info.channels, out);
    console.log(name.padEnd(12) + '  Maske ' + f1(100 * cover) + '%   beleuchtete Pixel ' + f2(wres.lit) + '%'
      + '   clip ' + c.clipped);
  }
  console.log('\n-> ' + ST + '\\_underground_basis_w*.webp');
})();
