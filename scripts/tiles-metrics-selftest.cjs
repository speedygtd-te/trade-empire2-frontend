/**
 * REGRESSION GUARD FOR DIE KENNZAHL-MODULE.
 *
 * Der gesamte 55-Biome-Korpus ist gegen die Formeln in scripts/lib-*.cjs
 * kalibriert. Wird eine davon "harmlos" umgestellt, verschieben sich Zahlen,
 * gegen die alles andere gemessen wurde -- und das faellt erst auf, wenn eine
 * Runde spaeter niemand mehr weiss, warum zwei Tabellen nicht zusammenpassen.
 *
 * Dieses Script faehrt fuenf bekannte Korpuszeilen gegen die ausgelieferten
 * Kacheln in src/assets/tiles/ und meldet jede Abweichung. Es schreibt nichts.
 *
 *   node scripts/tiles-metrics-selftest.cjs      -> Exit 0 = alle Zahlen halten
 *
 * Referenzwerte: assets/style-test/tiles/_asteroids_numbers.txt (LATTICE-Zeilen)
 * und _boulder_field_numbers.txt (Abschnitt B, nach dem fine-band-Eingriff).
 *
 * micro4 hier ist die MASSGEBLICHE Definition -- Vollkachel neu auf 128x64
 * skaliert, NICHT die ausgelieferte @quarter-Mip. Der Unterschied ist real,
 * siehe Docs/LESSONS-asset-pipeline.md Paragraph 5.
 */
const fs = require('fs');
const path = require('path');
const S = require('./lib-tile-metrics.cjs');
const D = require('./tiles-dust-plain-lib.cjs');
const MS = require('./lib-meso.cjs');
const sharp = S.sharp;

const TILES = path.join(__dirname, '..', 'src', 'assets', 'tiles');
const TOL = 0.005;   // die Referenzen sind auf 2 Nachkommastellen notiert

/** [Familie, Raster (grid_play gridTot), Naht (boundaryStep ratio), extra] */
const REF = [
  ['regolith',      21.11, 2.29],
  ['crater',         5.21, 1.23],
  ['dust_plain',     2.61, 1.14],
  ['rocky_outcrop', 15.17, 1.49],
  ['boulder_field', 10.88, 1.04, { slot: 2, meso: 39.52, micro4: 19.45 }],
];

const tile = (fam, n) => path.join(TILES, fam, fam + '_' + n + '.webp');

async function slotMetrics(fam, n) {
  const buf = fs.readFileSync(tile(fam, n));
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const a = S.statsRaw(r.data, ch, w, h);
  const m4 = await D.microContrast(await sharp(buf).resize(128, 64, { fit: 'fill' }).webp(D.WEBP).toBuffer());
  return { meso: MS.mesoNorm(r.data, ch, w, h, a.p70, 6, 32), micro4: m4 };
}

(async () => {
  let bad = 0;
  const chk = (what, got, want) => {
    const ok = Math.abs(got - want) < TOL;
    if (!ok) bad++;
    console.log('  ' + (ok ? 'OK  ' : 'FAIL') + '  ' + what.padEnd(28) +
      'soll ' + want.toFixed(2).padStart(7) + '   ist ' + got.toFixed(2).padStart(7) +
      (ok ? '' : '   DELTA ' + (got - want).toFixed(4)));
  };

  for (const [fam, raster, naht, extra] of REF) {
    console.log(fam);
    const bufs = [0, 1, 2, 3].map((n) => fs.readFileSync(tile(fam, n)));
    const g = await D.gridOf(bufs);
    chk('Raster (grid_play)', g.play.gridTot, raster);
    chk('Naht (seam ratio)', g.bs.ratio, naht);
    if (extra) {
      const m = await slotMetrics(fam, extra.slot);
      chk('meso   slot ' + extra.slot, m.meso, extra.meso);
      chk('micro4 slot ' + extra.slot, m.micro4, extra.micro4);
    }
  }
  console.log(bad ? '\nFAILED -- ' + bad + ' Kennzahl(en) weichen ab.'
                  : '\nPASSED -- alle Referenzwerte reproduziert.');
  process.exit(bad ? 1 : 0);
})();
