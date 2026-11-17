/**
 * DIE ERD-BASIS fuer rock_layer / mineral_vein / deep_stone.
 *
 * Rudi: "wir machen erstmal eine basis aus dunkler feuchter brauner erde.
 * daraus leiten wir dann rock layer, deep stone und mineral vein ab."
 *
 * QUELLE: permafrost_0 -- NICHT weil es messtechnisch am naechsten liegt,
 * sondern weil es IST, was gesucht wird (LESSONS 6). permafrost ist per
 * Definition "gefrorener Boden -- Grus und Fels in Eis gebunden", also feiner
 * Erdboden mit Grus. Zieht man das Eis ab, bleibt genau der Grund, den eine
 * Steinschicht tragen soll. Es ist ausserdem die einzige fertige Kachel im
 * Korpus, die gleichmaessiger, motivfreier Boden ist:
 *
 *   Raster 2.89   Naht 1.13   gx 0.13  gy -4.65  rim -1.13
 *   cbPP 0.008-0.061  cbSd 0.011-0.013   uCV 0.111-0.125
 *   Blowout 0.00 %    B/R 0.700  G/R 0.850  ueber alle vier Slots identisch
 *
 * z-EBENE: permafrost ist ICE/MOON_ICY-OBERFLAECHE (z >= 0), die drei Ziele
 * sind Untergrund (z < 0). Sie begegnen sich nie -- die Ableitung ist so
 * unbedenklich wie crater -> impact_crater.
 *
 * DAS FROSTNETZ BLEIBT DRIN. Es traegt praktisch das ganze meso-Band (8.3-9.6)
 * der Kachel. Wer es herausrechnet, bekommt die tundra-Lehre zurueck: die
 * Tarnung faellt weg und das Raster kommt hervor (LESSONS 4). Unter Tage, warm
 * und dunkel gefaerbt und mit Steinen belegt, liest es als Schollenstruktur
 * verdichteter Erde, nicht als Frost.
 *
 * "FEUCHT" HEISST FLECKIG FEUCHT, NICHT GLAENZEND.
 * Spitzenlichter sind bei metallic_surface bewusst herausgeflogen. Feuchte wird
 * hier deshalb als FELD gebaut, mit genau dem Werkzeug von dort:
 *   - corrosionMask() auf dem dualen Gitter des Iso-Torus, also nahtlos per
 *     Konstruktion, mit crackW > 0, damit die Naesse in den eigenen Mulden der
 *     Kachel sitzt statt als fremdes Muster obendrauf. Physikalisch richtig:
 *     Wasser steht im Tiefen.
 *   - corrode() faerbt luma-erhaltend, kann also weder Blowout noch Glanz
 *     erzeugen; danach eine reine ABDUNKLUNG entlang derselben Maske.
 * Damit ist die Feuchte cbSd (Fleckigkeit) und nicht cbPP (Verlauf) -- die
 * Ebene wird aus der MASKE herausgerechnet, wie bei metallic_surface.
 *
 * Schreibt NUR nach assets/style-test/tiles/. Kein src/assets/tiles/.
 * Usage: node scripts/tiles-earth-basis-build.cjs
 */
const fs = require('fs');
const path = require('path');
const S = require('./lib-tile-metrics.cjs');
const D = require('./tiles-dust-plain-lib.cjs');
const CO = require('./lib-corrode.cjs');
const sharp = S.sharp;
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const HERO = path.join(TILES, 'permafrost', 'permafrost_0.webp');

/** [name, p70, dry[br,gr], damp[br,gr], cover, dip, seed] */
const CANDS = [
  ['e0_flat',   52, null,           null,         0,    0,    0],
  ['e1_mild',   52, [0.740, 0.870], [0.620, 0.800], 0.35, 0.06, 20260905],
  ['e2_strong', 52, [0.780, 0.890], [0.550, 0.760], 0.45, 0.11, 20260905],
  ['e1_light',  60, [0.740, 0.870], [0.620, 0.800], 0.35, 0.06, 20260905],
  ['e1_dark',   44, [0.740, 0.870], [0.620, 0.800], 0.35, 0.06, 20260905],
];
const BR_T = 0.660, GR_T = 0.830;

/** darken along the mask -- a pure scalar, so hue and blowout cannot move */
function dampen(src, ch, w, h, M, dip) {
  const out = Buffer.from(src);
  for (let p = 0; p < w * h; p++) {
    if (src[p * ch + 3] < 1) continue;
    const k = 1 - dip * M[p];
    for (let c = 0; c < 3; c++) out[p * ch + c] = Math.round(src[p * ch + c] * k);
  }
  return out;
}

(async () => {
  fs.mkdirSync(ST, { recursive: true });
  const st = CO.selfTest(512, 256);
  console.log('dual-lattice selftest (soll 1,0,0,1): '
    + [st.b1a1, st.b1a2, st.b2a1, st.b2a2].map((v) => v.toFixed(3)).join(' '));

  const r0 = await sharp(fs.readFileSync(HERO)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const CHN = r0.info.channels, W = r0.info.width, H = r0.info.height;
  console.log('Quelle permafrost_0  ' + W + 'x' + H + ' ch' + CHN);

  for (const [name, p70, dry, damp, cover, dip, seed] of CANDS) {
    let buf = Buffer.from(r0.data);
    let clipped = 0, mCover = 0;
    if (dry) {
      const M = CO.corrosionMask(buf, CHN, W, H, cover, 0.5, seed);
      const c = CO.corrode(buf, CHN, W, H, M, dry, damp);
      clipped = c.clipped;
      buf = dampen(c.buf, CHN, W, H, M, dip);
      let n = 0, o = 0;
      for (let p = 0; p < W * H; p++) { if (buf[p * CHN + 3] < 250) continue; o++; if (M[p] > 0.5) n++; }
      mCover = 100 * n / o;
    }
    buf = D.flattenPoly(buf, CHN, W, H, 5);
    const out = path.join(ST, '_underground_basis_' + name + '.webp');
    const m = await D.solveTile(buf, W, H, CHN, out, p70, BR_T, GR_T, 0, 0, 10);
    // edge repair after the solve, then rewrite (edgeRepair does not move levels)
    const rr = await sharp(fs.readFileSync(out)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    await D.writeTile(D.edgeRepair(rr.data, rr.info.channels, W, H, 3), W, H, rr.info.channels, out);
    const f = await D.statsOf(out);
    console.log(name.padEnd(11)
      + ' p70 ' + f.p70.toFixed(1).padStart(5)
      + '  B/R ' + f.br.toFixed(3) + '  G/R ' + f.gr.toFixed(3)
      + '  gx ' + f.gx.toFixed(2).padStart(6) + '  gy ' + f.gy.toFixed(2).padStart(6)
      + '  blow ' + (100 * f.blow).toFixed(2) + '%'
      + '  Maskendeckung ' + mCover.toFixed(1) + '%  clip ' + clipped);
  }
  console.log('\n-> ' + ST + '\\_underground_basis_*.webp');
})();
