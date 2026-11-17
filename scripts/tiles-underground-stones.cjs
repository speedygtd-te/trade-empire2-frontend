/**
 * DIE DREI STEINSCHICHTEN -- rock_layer, deep_stone, mineral_vein.
 *
 * Alle drei stehen auf DERSELBEN Erd-Basis (`_underground_basis_w3_nass`, von
 * Rudi gewaehlt) und unterscheiden sich nur in Steingroesse, Deckung,
 * Reliefstaerke, Pegel und Farbe. Das ist Absicht: rock_layer und mineral_vein
 * DUERFEN dieselbe Materialsignatur tragen -- es ist derselbe Fels, einer mit
 * Erz. rock_layer (Tiefe 1-3) und deep_stone (ab 4) begegnen sich nie.
 *
 *   Biom            Lambda      Deckung  Amplitude  Pegel   Farbe
 *   rock_layer      30- 70 px    ~18 %   schwach    = Basis  keine
 *   deep_stone      55-130 px    ~42 %   stark      -9       kuehler/entsaettigt
 *   mineral_vein    40- 95 px    ~22 %   mittel     -4       zweiter Farbton
 *
 * REIHENFOLGE DER OPERATOREN, und warum sie so ist
 *   deep_stone bekommt VOR den Steinen ein bandScale(kMeso 0.6): das
 *   Schollennetz der nassen Basis liegt im selben Band wie die Steine und wuerde
 *   mit ihnen konkurrieren. Es tritt zurueck, die Steine tragen das Relief.
 *   mineral_vein bekommt seine Farbe ZULETZT, nach solveTile: corrode() haelt
 *   die Rec709-Luma pro Pixel exakt, also bewegen sich p70, sd, Rampe, meso und
 *   micro nicht mehr -- ein globales B/R-Ziel wuerde die beiden Materialien
 *   sonst zu Braungrau mitteln (LESSONS 5, cbSd).
 *
 * DIE ZWOELF VERSAETZE
 *   dx in {64,192,320,448} x dy in {21,64,107}, drei Biome zu je vier.
 *   Alle 66 Paardifferenzen liegen off-lattice (analytisch: |dy-Differenz| <=
 *   86 < 128, also muss n = 0 sein, also dy gleich und dx-Differenz in
 *   {128,256,384} -- nie ein Vielfaches von 512). KEIN Slot bekommt (0,0):
 *   das war der dust_basin-Baufehler.
 *
 * Schreibt AUSSCHLIESSLICH nach assets/style-test/tiles/.
 * Usage: node scripts/tiles-underground-stones.cjs [biom ...]
 */
const fs = require('fs');
const path = require('path');
const S = require('./lib-tile-metrics.cjs');
const D = require('./tiles-dust-plain-lib.cjs');
const B = require('./lib-band.cjs');
const CO = require('./lib-corrode.cjs');
const ST_ = require('./lib-stones.cjs');
const sharp = S.sharp;
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const BASE = path.join(ST, '_underground_basis_w3_nass.webp');

const OFF = {
  rock_layer: [[64, 21], [192, 64], [320, 107], [448, 21]],
  // (320,64) und (64,64) waeren die Differenz (256,0) -- off-lattice, aber bei
  // deep_stones grossem Lambda kam sie messbar auf 0.112 heran (Schwelle 0.12).
  // Getauscht: deep_stone bekommt (64,107), mineral_vein (64,64).
  deep_stone: [[192, 21], [320, 64], [448, 107], [64, 107]],
  mineral_vein: [[320, 21], [448, 64], [64, 64], [192, 107]],
};

/**
 * lam    Lambda-Band in px
 * cover  Deckung der Steinmaske
 * hAmp   Scheitelhoehe des Hoehenfeldes in px  (AMPLITUDE)
 * shadeK Staerke des Lambert-Terms
 * aoK    Kontaktverschattung in den Fugen, aoR ihr Radius
 * kMeso  bandScale auf der Basis VOR den Steinen (1 = unberuehrt)
 * p70/br/gr  Ziel der Endkachel
 * ore    zweiter Farbton via corrode NACH solveTile (null = keiner)
 */
const SPEC = {
  rock_layer: {
    lam: [30, 70], cover: 0.18, hAmp: 4.6, shadeK: 0.88, aoK: 0.16, aoR: 9,
    albK: 0.26, smMeso: 0.58, smFine: 0.38,
    kMeso: 1.0, p70: 44, br: 0.660, gr: 0.830, seed: 706011, ore: null,
    note: 'Erdklumpen und Kiesel, viel Grund sichtbar',
  },
  deep_stone: {
    lam: [55, 130], cover: 0.42, hAmp: 9.0, shadeK: 1.05, aoK: 0.22, aoR: 16,
    albK: 0.30, smMeso: 0.70, smFine: 0.45,
    kMeso: 0.60, p70: 35, br: 0.780, gr: 0.880, seed: 706022, ore: null,
    note: 'massiver Kopfsteinfels, Schollennetz zurueckgenommen',
  },
  mineral_vein: {
    lam: [40, 95], cover: 0.22, hAmp: 5.8, shadeK: 0.85, aoK: 0.18, aoR: 12,
    albK: 0.30, smMeso: 0.60, smFine: 0.40,
    glint: { strength: 0.75, top: 0.11 },
    kMeso: 1.0, p70: 40, br: 0.660, gr: 0.830, seed: 706033,
    ore: { ground: [0.660, 0.830], stone: [1.150, 1.020] },
    note: 'derselbe Fels wie rock_layer, mit metallischen Brocken',
  },
};

/**
 * DIE ERZ-LEITER -- weil zwei Befunde in dieselbe Richtung zeigen.
 *
 * (1) cbSd der Auslegung liegt bei 0.126-0.135. Das geforderte Band 0.8-1.7
 *     stammt vom ALTEN mineral_vein mit leuchtend elektrisch-blauen Adern, und
 *     es ist mit dem Paar (Grund 0.66 / Brocken 1.15) arithmetisch nicht
 *     erreichbar: cbSd ist die Streuung der Block-B/R nach Abzug der Ebene,
 *     also ungefaehr sd(Erzanteil je 16-px-Block) x Delta(B/R). Der erste
 *     Faktor liegt bei ~0.28, fuer cbSd 0.8 muesste Delta(B/R) also ~2.7
 *     betragen -- Brocken bei B/R 3.4. Das IST das Neon, das der Redesign
 *     gerade loswerden will.
 * (2) Auf der Spielskala-Tafel (48x24) verschwinden die Brocken: ~30 px im
 *     512er-Bild sind dort 3 px. rock_layer und mineral_vein trennen sich dort
 *     nicht mehr, deep_stone ueber den Pegel schon.
 *
 * Beide Befunde zeigen auf dieselben zwei Hebel -- GROESSE und FARBABSTAND.
 * Also eine Leiter statt einer Behauptung, und Rudi entscheidet am Bild.
 */
const ORE_LADDER = {
  'mineral_vein-o0': { of: 'mineral_vein' },
  'mineral_vein-o1': { of: 'mineral_vein', lam: [50, 110], cover: 0.26, hAmp: 6.6,
    ore: { ground: [0.660, 0.830], stone: [1.450, 1.060] }, glint: { strength: 0.85, top: 0.11 } },
  'mineral_vein-o2': { of: 'mineral_vein', lam: [62, 128], cover: 0.30, hAmp: 7.4,
    ore: { ground: [0.660, 0.830], stone: [1.900, 1.100] }, glint: { strength: 1.00, top: 0.12 } },
};
for (const [k, v] of Object.entries(ORE_LADDER)) {
  SPEC[k] = Object.assign({}, SPEC[v.of], v, { seed: SPEC[v.of].seed + 555 });
  OFF[k] = OFF[v.of];
}

const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : 'NaN');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'NaN');
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : 'NaN');
const heroF = (b) => path.join(ST, '_underground_' + b + '_hero.webp');
const slotF = (b, i) => path.join(ST, '_underground_' + b + '_s' + i + '.webp');

/**
 * JEDER SLOT BEKOMMT SEIN EIGENES STEINFELD, nicht nur ein anderes Fenster.
 *
 * Der erste Anlauf rollte einen Hero viermal. Das reicht bei kleinen Elementen,
 * aber deep_stones Steine sind gross (Lambda bis 130 px), es liegen nur ein
 * gutes Dutzend davon auf der Kachel, und zwei verschobene Fenster desselben
 * Feldes bleiben sich dann statistisch aehnlich: gemessen max|NCC| 0.110-0.112
 * unter den vier Slots, gegen eine Schwelle von 0.12. Zu knapp.
 *   Also: die BASIS wird gerollt (das ist der bewaehrte Gitterversatz, kein
 * Resampling, keine Spiegelung) UND das Steinfeld pro Slot mit eigenem Seed neu
 * gewuerfelt. Beide Quellen der Aehnlichkeit sind damit gebrochen, und jeder
 * Slot wird einzeln auf Pegel und Farbton geloest, trifft sie also exakt.
 */
async function build(name) {
  const P = SPEC[name];
  const r0 = await sharp(fs.readFileSync(BASE)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const CH = r0.info.channels, W = r0.info.width, H = r0.info.height;
  const A = ST_.opaqueOf(r0.data, CH, W, H);

  let base = r0.data;
  if (P.kMeso !== 1.0) base = B.bandScale(base, CH, W, H, P.kMeso, 1.0);

  const rows = [];
  for (let i = 0; i < 4; i++) {
    const rolled = D.edgeRepair(D.latticeRoll(base, CH, W, H, OFF[name][i][0], OFF[name][i][1]), CH, W, H, 3);
    const sm = ST_.stoneMask(A, W, H, P.lam[0], P.lam[1], P.cover, P.seed + i * 131071);
    let buf = ST_.stoneSurface(rolled, CH, W, H, sm.M, A, P.albK, P.smMeso, P.smFine);
    const sh = ST_.shadeStones(sm.H, A, W, H, P.hAmp, P.shadeK, P.aoK, P.aoR);
    buf = ST_.applyGain(buf, CH, W, H, sh.G);
    let lit = 0;
    if (P.glint) {
      const p70now = S.statsRaw(buf, CH, W, H).p70;
      const gl = ST_.oreGlint(buf, CH, W, H, sm.H, sm.M, A, P.hAmp, P.glint.strength, P.glint.top, p70now);
      buf = gl.buf; lit = gl.lit;
    }
    buf = D.flattenPoly(buf, CH, W, H, 5);
    const f = slotF(name, i);
    const m = await D.solveTile(buf, W, H, CH, f, P.p70, P.br, P.gr, 0, 0, 10);

    // Farbe ZULETZT: corrode haelt die Rec709-Luma pro Pixel exakt, also
    // bewegen sich p70, sd, Rampe, meso und micro danach nicht mehr.
    const rr = await sharp(fs.readFileSync(f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let out = rr.data, clipped = 0;
    if (P.ore) {
      const c = CO.corrode(out, rr.info.channels, W, H, sm.M, P.ore.ground, P.ore.stone);
      out = c.buf; clipped = c.clipped;
    }
    out = D.edgeRepair(out, rr.info.channels, W, H, 3);
    await D.writeTile(out, W, H, rr.info.channels, f);
    if (i === 0) fs.copyFileSync(f, heroF(name));

    const fin = await sharp(fs.readFileSync(f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const tt = ST_.twoToneRatios(fin.data, fin.info.channels, W, H, sm.M, A);
    rows.push({ i, sm, m, tt, clipped, lit });
  }

  for (const r of rows) {
    console.log((r.i === 0 ? name.padEnd(13) : ''.padEnd(13))
      + ' s' + r.i + '  Versatz (' + OFF[name][r.i][0] + ',' + OFF[name][r.i][1] + ')'
      + '  Deckung ' + f1(100 * r.sm.cover) + '%'
      + '  Masken-Ebene ' + f3(r.sm.maskGx) + '/' + f3(r.sm.maskGy)
      + '  p70 ' + f1(r.m.p70) + '  B/R ' + f3(r.m.br)
      + '  Grund/Stein B/R ' + f3(r.tt.ground.br) + ' / ' + f3(r.tt.stone.br)
      + '  Luma-Abstand ' + f2(r.tt.stone.luma - r.tt.ground.luma)
      + (P.ore ? '  clip ' + r.clipped : '') + (P.glint ? '  Glanz ' + f2(r.lit) + '%' : ''));
  }
  return { name, spec: P, rows };
}

(async () => {
  if (!fs.existsSync(BASE)) { console.error('Basis fehlt: ' + BASE); process.exit(1); }
  const st = CO.selfTest(512, 256);
  console.log('Torus-Selbsttest b_i.a_j/2pi = ' + [st.b1a1, st.b1a2, st.b2a1, st.b2a2].map(f3).join(' ') + '  (soll 1 0 0 1)\n');
  const want = process.argv.slice(2);
  for (const n of Object.keys(SPEC)) {
    if (want.length ? !want.includes(n) : ORE_LADDER[n]) continue;   // Leiter nur auf Zuruf
    await build(n);
  }
  console.log('\n-> ' + ST);
})();

module.exports = { SPEC, OFF };
