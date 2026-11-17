/**
 * ICE_CAVERN AUS crystal_field -- die Umfaerbung ins Blaugraue.
 *
 * WARUM crystal_field UND NICHT DAS HEUTIGE ice_cavern
 *   Das heutige ice_cavern ist der void_edge-Fehler in gross: EIN grosses Loch
 *   pro Kachel, im Feld ein Raster schwarzer Trichter. Raster 35.20 -- die
 *   schlechteste Kachelung im ganzen Untergrund. Es wird komplett ersetzt.
 *   crystal_field ist fertig (2026-08-10, TOXIC), kachelt gut (Raster 5.40,
 *   Naht 1.22) und IST inhaltlich, was gesucht wird: spitze Kristalle, die aus
 *   einem rissigen Grund stehen. Eis im Berg ist dasselbe Motiv in anderem
 *   Material -- und Material kommt aus dem Grade, nicht aus dem Prompt.
 *
 * WARUM DIE UMFAERBUNG EINE AUS DEM BILD ABGELEITETE MASKE BRAUCHT
 *   Eine globale Umfaerbung mit KONSTANTER Maske ist eine Farbersetzung: sie
 *   ebnet den Kontrast zwischen Kristall und Matrix ein. Vorgemessen fiel cbSd
 *   dabei von 2.950 auf 0.022 -- der ganze Zweiton war weg. Also zwei
 *   Zielverhaeltnisse und eine Maske, die aus dem BILD kommt: Kristall gegen
 *   Matrix ueber SAETTIGUNG und LUMA.
 *     Die Kristalle sind in allen vier Slots das Saettigste und Hellste auf der
 *   Kachel (gruen, kupfern, violett -- die Slots unterscheiden sich fast nur
 *   darin). Ein reiner Luma-Schnitt wuerde die hellen Kiesel mitnehmen; darum
 *   ein Groessenfilter: die Maske wird geblurrt und neu geschnitten, was kleiner
 *   ist als ein paar Pixel faellt heraus.
 *
 * WARUM cbSd HIER NICHT DIE ABNAHMEZAHL IST
 *   cbSd ist die Streuung der Farbe ueber 16-px-BLOECKE. Die Kristalle sind
 *   klein gegen 16 px, also mitteln die Bloecke sie weg und cbSd misst
 *   hauptsaechlich, wie bunt der GRUND ist. Die Zahl, die zaehlt, ist der
 *   LUMA-ABSTAND Kristall <-> Matrix, in Einheiten der Kachel-sd -- das ist das,
 *   woran das Auge die Kristalle findet, nachdem die Farbe getauscht ist.
 *   Dazu spec1.6, micro4 und meso.
 *
 * REIHENFOLGE
 *   Maske aus dem ORIGINAL (dort steckt die Saettigung, die die Kristalle
 *   verraet) -> flattenPoly -> solveTile auf Pegel und neutrales Grau
 *   -> corrode() ZULETZT mit zwei Zielverhaeltnissen (haelt die Rec709-Luma pro
 *   Pixel exakt, also bleiben Pegel, Rampe, meso und micro stehen) -> Rollung.
 *
 * Schreibt NUR nach assets/style-test/tiles/.
 * Usage: node scripts/tiles-ice-cavern-recolor.cjs
 */
const fs = require('fs');
const path = require('path');
const S = require('./lib-tile-metrics.cjs');
const D = require('./tiles-dust-plain-lib.cjs');
const MS = require('./lib-meso.cjs');
const GR = require('./lib-grain.cjs');
const CHR = require('./lib-chroma.cjs');
const CO = require('./lib-corrode.cjs');
const ST_ = require('./lib-stones.cjs');
const sharp = S.sharp;
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');

/**
 * crystal_field hat NUR ZWEI eigenstaendige Anordnungen: {0,2,3} teilen sich
 * denselben Rissgrund und dieselben Kristallpositionen (ein Drilling, nur die
 * Kristallfarbe unterscheidet sie), {1} ist der Einzelgaenger. Als Quelle
 * taugen daher genau 0 und 1; Slot 2 und 3 muessen anders entstehen.
 */
const SRC = [
  { src: 'crystal_field_0', off: [192, 43] },
  { src: 'crystal_field_1', off: [384, 86] },
];

/** Blaugrau-Leiter: [Matrix br,gr] [Kristall br,gr] */
const HUES = [
  ['b0_stahl', [1.100, 1.045], [1.270, 1.095], 'kuehles Stahlgrau, Kristalle nur eine Spur blauer'],
  ['b1_blau', [1.215, 1.080], [1.470, 1.140], 'deutliches Blaugrau, Kristalle klar blau'],
  ['b2_tief', [1.340, 1.105], [1.720, 1.190], 'tiefes Gletscherblau -- die obere Schranke'],
];
/**
 * ZWEI PEGEL, und sie muessen weit genug auseinanderliegen, um eine Wahl zu
 * sein. ice_cavern steht in der eisigen Familie (Tiefe 1-5) mit mineral_vein
 * (p70 40) zusammen -- ein Pegel bei 44 waere keine Entscheidung, sondern
 * dasselbe noch einmal.
 */
const LEVELS = [['p56', 56], ['p38', 38]];
/**
 * DAZU EINE DRITTE ACHSE, weil eine Frage offen bleibt, die die Leiter nicht
 * beantwortet: soll das Eis LEUCHTEN? Die reine Umfaerbung laesst die Kristalle
 * bei d = 0.91 stehen (Quelle 1.00) -- sie ueberleben, aber sie sind Stein in
 * blau. Ein skalarer Albedo-Lift innerhalb der Maske, VOR dem Pegel-Solve
 * angewandt (damit p70 exakt bleibt), macht daraus Eis. Zwei Sprossen: keiner
 * und deutlich.
 */
const LIFTS = [['L0', 0.00, 'kein Lift -- Kristalle nur umgefaerbt'],
  ['L1', 0.45, 'Eis-Lift +45 % Albedo auf der Maske']];

const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : 'NaN');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'NaN');
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : 'NaN');
const tileF = (f, n) => path.join(TILES, f, f + '_' + n + '.webp');

/**
 * DIE KRISTALLMASKE, aus dem Bild.
 *   z(Saettigung) und z(Luma) gemischt, leicht geglaettet, an einem
 *   Deckungsquantil geschnitten, danach ein GROESSENFILTER (Blur r4 + zweiter
 *   Schnitt), der Kiesel-Speckle verwirft und die zusammenhaengenden
 *   Kristallflaechen behaelt.
 */
function crystalMask(src, ch, w, h, cover, opt) {
  const o = opt || {};
  const wS = o.wSat === undefined ? 1.0 : o.wSat;
  const wL = o.wLum === undefined ? 0.85 : o.wLum;
  const A = ST_.opaqueOf(src, ch, w, h);
  const L = new Float32Array(w * h), St = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const r = src[p * ch], g = src[p * ch + 1], b = src[p * ch + 2];
    L[p] = S.L709(r, g, b);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    St[p] = mx > 1 ? (mx - mn) / mx : 0;
  }
  const zn = (F) => {
    let s = 0, q = 0, n = 0;
    for (let p = 0; p < w * h; p++) if (A[p]) { s += F[p]; q += F[p] * F[p]; n++; }
    const mu = s / n, sd = Math.sqrt(Math.max(1e-9, q / n - mu * mu));
    const Z = new Float32Array(w * h);
    for (let p = 0; p < w * h; p++) Z[p] = (F[p] - mu) / sd;
    return Z;
  };
  const zL = zn(L), zS = zn(St);
  const raw = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) raw[p] = wS * zS[p] + wL * zL[p];
  const sm = GR.blurOpaque(raw, A, w, h, 2);
  const cut = (F, cv) => {
    const v = [];
    for (let p = 0; p < w * h; p++) if (A[p]) v.push(F[p]);
    v.sort((a, b) => a - b);
    return v[Math.min(v.length - 1, Math.floor(v.length * (1 - cv)))];
  };
  const t1 = cut(sm, cover * 1.9);
  const b1 = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) b1[p] = A[p] && sm[p] > t1 ? 1 : 0;
  // Groessenfilter: was nach dem Blur nicht mehr steht, war Speckle
  const b2 = GR.blurOpaque(b1, A, w, h, 4);
  const t2 = cut(b2, cover);
  const M = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) M[p] = A[p] ? CO.smooth((b2[p] - t2) / 0.26 + 0.5) : 0;
  let cov = 0, nA = 0;
  for (let p = 0; p < w * h; p++) if (A[p]) { nA++; if (M[p] > 0.5) cov++; }
  return { M, A, cover: cov / nA, L };
}

/** Luma-Abstand Kristall <-> Matrix, in Einheiten der Kachel-sd */
function lumaGap(src, ch, w, h, M, A) {
  let sc = 0, nc = 0, sg = 0, ng = 0, all = 0, n = 0, q = 0;
  for (let p = 0; p < w * h; p++) {
    if (!A[p]) continue;
    const L = S.L709(src[p * ch], src[p * ch + 1], src[p * ch + 2]);
    all += L; q += L * L; n++;
    if (M[p] > 0.6) { sc += L; nc++; } else if (M[p] < 0.4) { sg += L; ng++; }
  }
  const mu = all / n, sd = Math.sqrt(Math.max(1e-9, q / n - mu * mu));
  const c = nc ? sc / nc : NaN, g = ng ? sg / ng : NaN;
  return { crystal: c, matrix: g, gap: c - g, d: (c - g) / sd, sd };
}

async function metrics(buf) {
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const a = S.statsRaw(r.data, ch, w, h);
  const c = CHR.chromaRamp(r.data, ch, w, h);
  const sp = CO.specular(r.data, ch, w, h);
  return {
    p70: a.p70, blow: 100 * a.blow, sd: a.sd, br: a.br, gr: a.gr,
    meso: MS.mesoNorm(r.data, ch, w, h, a.p70, 6, 32),
    m4: await D.microContrast(await sharp(buf).resize(128, 64, { fit: 'fill' }).webp(D.WEBP).toBuffer()),
    m8: await D.microContrast(await sharp(buf).resize(64, 32, { fit: 'fill' }).webp(D.WEBP).toBuffer()),
    cbPP: c.cbPP, cbSd: c.cbSd, spec16: sp.spec16, tail: sp.tail,
  };
}

/** eine Sprosse fuer eine Quelle bauen, Rueckgabe: Datei + Zahlen */
async function rung(srcName, hue, lvl, offset, outFile, lift) {
  const r0 = await sharp(fs.readFileSync(tileF('crystal_field', srcName.slice(-1))))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const CH = r0.info.channels, W = r0.info.width, H = r0.info.height;
  const cm = crystalMask(r0.data, CH, W, H, 0.085);
  let pre = r0.data;
  if (lift) {
    const g = new Float32Array(W * H);
    for (let p = 0; p < W * H; p++) g[p] = 1 + lift * cm.M[p];
    pre = ST_.applyGain(pre, CH, W, H, g);
  }
  const flat = D.flattenPoly(pre, CH, W, H, 5);
  // neutral loesen -- corrode setzt die Farbe danach, ein globales Ziel wuerde
  // die beiden Materialien sonst zu einem mitteln
  await D.solveTile(flat, W, H, CH, outFile, lvl[1], 1.000, 1.000, 0, 0, 10);
  const rr = await sharp(fs.readFileSync(outFile)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const c = CO.corrode(rr.data, rr.info.channels, W, H, cm.M, hue[1], hue[2]);
  let out = c.buf;
  if (offset) out = D.latticeRoll(out, rr.info.channels, W, H, offset[0], offset[1]);
  out = D.edgeRepair(out, rr.info.channels, W, H, 3);
  await D.writeTile(out, W, H, rr.info.channels, outFile);
  const fin = await sharp(fs.readFileSync(outFile)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // die Maske mitrollen, damit der Luma-Abstand auf der GEROLLTEN Kachel gilt
  let Mr = cm.M;
  if (offset) {
    const tmp = Buffer.alloc(W * H * 4);
    for (let p = 0; p < W * H; p++) { tmp[p * 4] = Math.round(255 * cm.M[p]); tmp[p * 4 + 3] = cm.A[p] ? 255 : 0; }
    const rolled = D.latticeRoll(tmp, 4, W, H, offset[0], offset[1]);
    Mr = new Float32Array(W * H);
    for (let p = 0; p < W * H; p++) Mr[p] = rolled[p * 4] / 255;
  }
  const A2 = ST_.opaqueOf(fin.data, fin.info.channels, W, H);
  const lg = lumaGap(fin.data, fin.info.channels, W, H, Mr, A2);
  return { cover: cm.cover, lg, m: await metrics(fs.readFileSync(outFile)) };
}

if (require.main === module) (async () => {
  const out = [];
  const say = (s) => { out.push(s); console.log(s); };
  say('ICE_CAVERN -- BLAUGRAU-LEITER UND ZWEI PEGEL   ' + new Date().toISOString().slice(0, 10));
  say('Quelle crystal_field_0 (Drilling {0,2,3}) und crystal_field_1 (Einzelgaenger).');
  say('Maske aus dem Bild: z(Saettigung) + 0.85 z(Luma), Blur r2, Deckungsschnitt, danach');
  say('Groessenfilter (Blur r4 + zweiter Schnitt) gegen Kiesel-Speckle.');
  say('cbSd ist hier NICHT die Abnahmezahl -- die Kristalle sind klein gegen die 16-px-Bloecke.');
  say('Massgeblich: LUMA-ABSTAND Kristall<->Matrix (Spalte gap, und d = gap/sd).');
  say('');
  say('Sprosse           Deckung   Kristall  Matrix    gap      d    p70  blow%  B/R   G/R   meso  micro4 micro8   cbPP   cbSd  spec1.6  tail');
  for (const [ln, lv] of LEVELS) for (const [kn, kv] of LIFTS) {
    for (const [hn, mm, cc, note] of HUES) {
      const f = path.join(ST, '_underground_ic-' + ln + kn + '-' + hn + '.webp');
      const r = await rung('crystal_field_0', [hn, mm, cc], [ln, lv], null, f, kv);
      say((ln + kn + '/' + hn).padEnd(16)
        + f1(100 * r.cover).padStart(7) + '%'
        + f1(r.lg.crystal).padStart(10) + f1(r.lg.matrix).padStart(8)
        + f2(r.lg.gap).padStart(8) + f2(r.lg.d).padStart(7)
        + f1(r.m.p70).padStart(7) + f2(r.m.blow).padStart(7)
        + f3(r.m.br).padStart(7) + f3(r.m.gr).padStart(6)
        + f2(r.m.meso).padStart(7) + f2(r.m.m4).padStart(8) + f2(r.m.m8).padStart(7)
        + f3(r.m.cbPP).padStart(8) + f3(r.m.cbSd).padStart(7)
        + f2(r.m.spec16).padStart(8) + f2(r.m.tail).padStart(6)
        + '   ' + note);
    }
  }
  say('');
  say('Zum Vergleich die Quelle und das heutige ice_cavern:');
  for (const a of ['crystal_field_0', 'crystal_field_1', 'ice_cavern_0']) {
    const fam = a.slice(0, a.lastIndexOf('_')), i = a.slice(a.lastIndexOf('_') + 1);
    const b = fs.readFileSync(tileF(fam, i));
    const r = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const cm = crystalMask(r.data, r.info.channels, r.info.width, r.info.height, 0.085);
    const lg = lumaGap(r.data, r.info.channels, r.info.width, r.info.height, cm.M, cm.A);
    const m = await metrics(b);
    say(a.padEnd(16) + f1(100 * cm.cover).padStart(7) + '%'
      + f1(lg.crystal).padStart(10) + f1(lg.matrix).padStart(8)
      + f2(lg.gap).padStart(8) + f2(lg.d).padStart(7)
      + f1(m.p70).padStart(7) + f2(m.blow).padStart(7)
      + f3(m.br).padStart(7) + f3(m.gr).padStart(6)
      + f2(m.meso).padStart(7) + f2(m.m4).padStart(8) + f2(m.m8).padStart(7)
      + f3(m.cbPP).padStart(8) + f3(m.cbSd).padStart(7)
      + f2(m.spec16).padStart(8) + f2(m.tail).padStart(6));
  }
  // Maskenbild zur Kontrolle
  for (const s of ['0', '1']) {
    const r = await sharp(fs.readFileSync(tileF('crystal_field', s))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const cm = crystalMask(r.data, r.info.channels, r.info.width, r.info.height, 0.085);
    const vis = Buffer.alloc(r.info.width * r.info.height * 4);
    for (let p = 0; p < r.info.width * r.info.height; p++) {
      const m = cm.M[p];
      vis[p * 4] = Math.round(r.data[p * r.info.channels] * (1 - m) + 255 * m);
      vis[p * 4 + 1] = Math.round(r.data[p * r.info.channels + 1] * (1 - m) + 60 * m);
      vis[p * 4 + 2] = Math.round(r.data[p * r.info.channels + 2] * (1 - m) + 60 * m);
      vis[p * 4 + 3] = r.data[p * r.info.channels + 3];
    }
    fs.writeFileSync(path.join(ST, '_underground_ic-mask' + s + '.png'),
      await sharp(vis, { raw: { width: r.info.width, height: r.info.height, channels: 4 } }).png().toBuffer());
  }
  fs.writeFileSync(path.join(ST, '_underground_ic_numbers.txt'), out.join('\n') + '\n');
  console.log('\n-> ' + path.join(ST, '_underground_ic_numbers.txt'));
})();

module.exports = { crystalMask, lumaGap, SRC, HUES, LEVELS };
