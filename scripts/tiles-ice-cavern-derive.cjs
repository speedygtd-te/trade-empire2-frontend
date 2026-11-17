/**
 * ICE_CAVERN, SCHRITT 2 -- FENSTER AUS DEN flux-RUECKGABEN, DANN DIE VIER SLOTS.
 *
 * DIE RUECKGABE WIRD NUR HERUNTERSKALIERT, NIE HOCH. kontext liefert
 * 1248x832 zurueck; das geht auf 768x512, und daraus wird ein 512x256-Fenster
 * geschnitten und in die Raute maskiert. Treppige Kanten bei 1:1 sind sichtbar,
 * ein Hochskalieren waere also selbst der Fehler.
 *
 * DIE FENSTER WERDEN GEMESSEN UND VERWORFEN, NICHT NACHGESCHAERFT.
 *   Das ist die rocky_outcrop-Falle in einem Satz: ein Unsharp hebt micro4 um
 *   56 %, ohne dass sich meso bewegt oder das Bild besser wird. Wenn ein
 *   Fenster das Relief nicht mitbringt, bringt es keiner nachtraeglich hinein.
 *   Schranke hier: meso >= 10.0, gemessen NACH einem neutralen Pegel-Solve,
 *   damit die Fenster untereinander vergleichbar sind (meso ist ueber p70
 *   normiert, aber der Solve raeumt auch die Rampe weg). Zum Vergleich die
 *   Quellen: crystal_field_0 meso 12.45, crystal_field_1 9.60.
 *
 * DAZU DER RANDANTEIL. flux heftet Formen an den Bildrahmen, wenn es einen
 * sieht; die Platte hat keinen, aber belegt wird es trotzdem (rimHalo).
 *
 * SLOT 0 und 1 kommen per Gitterversatz aus crystal_field_0 und _1 -- den
 * einzigen zwei eigenstaendigen Anordnungen des Bioms. SLOT 2 und 3 aus den
 * beiden besten flux-Fenstern, moeglichst aus VERSCHIEDENEN Rueckgaben.
 *
 * Schreibt NUR nach assets/style-test/tiles/.
 * Usage: node scripts/tiles-ice-cavern-derive.cjs
 */
const fs = require('fs');
const path = require('path');
const S = require('./lib-tile-metrics.cjs');
const D = require('./tiles-dust-plain-lib.cjs');
const MS = require('./lib-meso.cjs');
const CO = require('./lib-corrode.cjs');
const ST_ = require('./lib-stones.cjs');
const RC = require('./tiles-ice-cavern-recolor.cjs');
const sharp = S.sharp;
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const WORK = path.join(ST, 'ice_cavern_fix');

const PW = 768, PH = 512;
const RUNS = ['SHARD', 'SLAB', 'HEAP'];
const MESO_MIN = 10.0;

/** die zwei fertigen Saetze, die als Ganzes beurteilt werden */
const SETS = [
  { tag: 'p56L1-b1', lvl: 56, lift: 0.45, matrix: [1.215, 1.080], crystal: [1.470, 1.140] },
  { tag: 'p38L1-b1', lvl: 38, lift: 0.45, matrix: [1.215, 1.080], crystal: [1.470, 1.140] },
];
/** Versaetze der vier Slots -- keiner ist (0,0) */
const OFF = [[192, 43], [384, 86], [128, 107], [320, 21]];

const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : 'NaN');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'NaN');
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : 'NaN');

/**
 * MITTLERER KRISTALLRADIUS, in px.
 *   Flaeche durch halben Umfang -- fuer eine runde Scheibe ist das exakt der
 *   Radius, fuer alles andere ein monotoner Stellvertreter. Gebraucht wird er,
 *   weil kontext die Kristalle GROESSER zurueckgegeben hat als die Vorlage: die
 *   ersten Fenster brachten Kristalle, die neben crystal_field_0 und _1 wie
 *   eine andere Kachelgeneration aussahen. Die Groesse ist damit ein Kriterium
 *   der Fensterwahl und nicht eine Sache, die man hinterher wegskaliert
 *   (Hochskalieren ist ohnehin verboten, und Herunterskalieren des FENSTERS
 *   wuerde die Kachel kleiner machen, nicht die Kristalle).
 */
function blobRadius(M, A, w, h) {
  let area = 0, per = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (!A[p]) continue;
    area += M[p];
    const xp = x + 1 < w ? p + 1 : p, yp = y + 1 < h ? p + w : p;
    per += Math.abs(M[xp] - M[p]) + Math.abs(M[yp] - M[p]);
  }
  return per > 1e-6 ? (2 * area) / per : 0;
}

async function windowMetrics(win, probeFile) {
  // neutraler Pegel-Solve, damit die Fenster vergleichbar sind
  const r = await sharp(win).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const CH = r.info.channels, W = r.info.width, H = r.info.height;
  const flat = D.flattenPoly(r.data, CH, W, H, 5);
  await D.solveTile(flat, W, H, CH, probeFile, 56, 1.000, 1.000, 0, 0, 8);
  const rr = await sharp(fs.readFileSync(probeFile)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const a = S.statsRaw(rr.data, rr.info.channels, W, H);
  const meso = MS.mesoNorm(rr.data, rr.info.channels, W, H, a.p70, 6, 32);
  const rim = await D.rimHalo(fs.readFileSync(probeFile));
  const cm = RC.crystalMask(rr.data, rr.info.channels, W, H, 0.085);
  const lg = RC.lumaGap(rr.data, rr.info.channels, W, H, cm.M, cm.A);
  const m4 = await D.microContrast(await sharp(fs.readFileSync(probeFile)).resize(128, 64, { fit: 'fill' }).webp(D.WEBP).toBuffer());
  return { meso, m4, rim: rim.rimG !== undefined ? rim.rimG : (rim.dark || 0), d: lg.d,
    blow: 100 * a.blow, sd: a.sd, rad: blobRadius(cm.M, cm.A, W, H), cover: cm.cover };
}

/** eine Quelle (Rohkachel-Buffer) in einen fertigen ice_cavern-Slot verwandeln */
async function makeSlot(rawBuf, set, offset, outFile) {
  const r0 = await sharp(rawBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const CH = r0.info.channels, W = r0.info.width, H = r0.info.height;
  const cm = RC.crystalMask(r0.data, CH, W, H, 0.085);
  let pre = r0.data;
  if (set.lift) {
    const g = new Float32Array(W * H);
    for (let p = 0; p < W * H; p++) g[p] = 1 + set.lift * cm.M[p];
    pre = ST_.applyGain(pre, CH, W, H, g);
  }
  const flat = D.flattenPoly(pre, CH, W, H, 5);
  await D.solveTile(flat, W, H, CH, outFile, set.lvl, 1.000, 1.000, 0, 0, 10);
  const rr = await sharp(fs.readFileSync(outFile)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const c = CO.corrode(rr.data, rr.info.channels, W, H, cm.M, set.matrix, set.crystal);
  let out = c.buf;
  if (offset) out = D.latticeRoll(out, rr.info.channels, W, H, offset[0], offset[1]);
  out = D.edgeRepair(out, rr.info.channels, W, H, 3);
  await D.writeTile(out, W, H, rr.info.channels, outFile);
}

(async () => {
  const out = [];
  const say = (s) => { out.push(s); console.log(s); };
  say('ICE_CAVERN -- FENSTERWAHL AUS DEN flux-RUECKGABEN   ' + new Date().toISOString().slice(0, 10));
  say('Rueckgabe 1248x832 -> 768x512 (nur herunter), Fenster 512x256, danach in die Raute maskiert.');
  say('Gemessen NACH neutralem Pegel-Solve auf p70 56. Schranke meso >= ' + f1(MESO_MIN)
    + '  (Quellen: crystal_field_0 12.45, _1 9.60).');
  say('');
  // Referenz-Kristallradius aus den beiden Quellen
  let radRef = 0;
  for (const s of ['0', '1']) {
    const r = await sharp(fs.readFileSync(path.join(TILES, 'crystal_field', 'crystal_field_' + s + '.webp')))
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const cm = RC.crystalMask(r.data, r.info.channels, r.info.width, r.info.height, 0.085);
    radRef += blobRadius(cm.M, cm.A, r.info.width, r.info.height) / 2;
  }
  say('Referenz-Kristallradius (crystal_field_0/_1): ' + f2(radRef) + ' px.');
  say('kontext gibt die Kegel GROESSER zurueck als die Vorlage. Darum wird die Rueckgabe auf');
  say('MEHRERE Plattenbreiten heruntergerechnet und das Fenster nach der Groesse gewaehlt --');
  say('nicht die fertige Kachel hinterher skaliert.');
  say('');
  say('Fenster                 meso  micro4  Radius  rel   d(Kr)  blow%    sd   Urteil');

  const cands = [];
  for (const R of RUNS) {
    const raw = path.join(WORK, R + '_kraw.png');
    if (!fs.existsSync(raw)) { say('  ' + R + ' fehlt'); continue; }
    const md = await sharp(fs.readFileSync(raw)).metadata();
    for (const pw of [768, 640, 560]) {
      const ph = Math.round((pw * PH) / PW);
      if (pw > md.width || ph > md.height) continue;
      const plate = await sharp(fs.readFileSync(raw)).resize(pw, ph, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
      fs.writeFileSync(path.join(WORK, R + '_plate' + pw + '.png'), plate);
      const oxs = [0, Math.round((pw - 512) / 2), pw - 512].filter((v, i, a) => v >= 0 && a.indexOf(v) === i);
      const oys = [0, Math.round((ph - 256) / 2), ph - 256].filter((v, i, a) => v >= 0 && a.indexOf(v) === i);
      for (const ox of oxs) for (const oy of oys) {
        const w = await D.cutWindow(plate, ox, oy);
        const id = R + '/' + pw + '@' + ox + ',' + oy;
        const m = await windowMetrics(w.png, path.join(WORK, 'probe.webp'));
        const rel = m.rad / radRef;
        const okM = m.meso >= MESO_MIN;
        const okR = rel >= 0.75 && rel <= 1.30;
        say('  ' + id.padEnd(22) + f2(m.meso).padStart(6) + f2(m.m4).padStart(8)
          + f2(m.rad).padStart(8) + f2(rel).padStart(6) + f2(m.d).padStart(8)
          + f2(m.blow).padStart(7) + f1(m.sd).padStart(6)
          + '   ' + (!okM ? 'VERWORFEN (meso)' : !okR ? 'VERWORFEN (Kristallgroesse)' : 'ok'));
        if (okM && okR) cands.push({ id, run: R, png: w.png, meso: m.meso, d: m.d, rel });
      }
    }
  }
  say('');
  if (cands.length < 2) {
    say('WENIGER ALS ZWEI FENSTER HALTEN DIE SCHRANKE -- Rueckfallebene noetig.');
    fs.writeFileSync(path.join(ST, '_underground_ic_flux_numbers.txt'), out.join('\n') + '\n');
    return;
  }
  // die zwei besten, moeglichst aus verschiedenen Rueckgaben, und untereinander
  // dekorreliert (dasselbe Motiv zweimal waere kein zweiter Slot)
  // Rangfolge: Relief zaehlt, Kristallabstand zaehlt, und eine Abweichung der
  // Kristallgroesse von der Vorlage wird bestraft
  const score = (c) => c.meso + 4 * c.d - 14 * Math.abs(c.rel - 1);
  cands.sort((a, b) => score(b) - score(a));

  /**
   * UND JETZT DIE KORRELATION -- die Platte ist AUS crystal_field_0 und _1
   * gebombt, also teilt jedes flux-Fenster Material mit den Slots 0 und 1.
   * Der erste Durchlauf hat genau das produziert: Slot 1 gegen Slot 2 auf
   * 0.125, ueber der Schwelle 0.12.
   *
   * UND SIE MUSS AM FERTIGEN SLOT GEMESSEN WERDEN, nicht am Fenster.
   *   Der zweite Versuch prueft das rohe Fenster und kam auf 0.067 -- die
   *   fertige Kachel lag trotzdem wieder bei 0.125. Der Grund ist der EIS-LIFT:
   *   er ist keine globale Skalierung, sondern ein Gewinn AUF DER MASKE, und
   *   die Maske trifft genau das, was Fenster und Quelle gemeinsam haben. Er
   *   verstaerkt also gerade den geteilten Anteil. Alles andere in der Kette
   *   (flattenPoly, solveTile, corrode) ist ein Skalar pro Pixel und kann eine
   *   Korrelation nicht bewegen -- der Lift kann es. Also wird jeder Kandidat
   *   FERTIG GEBAUT und dann gemessen.
   */
  const NCC_MAX = 0.10;
  const tmp = (n) => path.join(WORK, 'cand' + n + '.webp');
  const worstAgainst = async (buf, list) => {
    let mx = 0;
    for (const o of list) mx = Math.max(mx, ...Object.values(await D.nccAll(buf, o)).map(Math.abs));
    return mx;
  };
  await makeSlot(fs.readFileSync(path.join(TILES, 'crystal_field', 'crystal_field_0.webp')), SETS[0], OFF[0], tmp(0));
  await makeSlot(fs.readFileSync(path.join(TILES, 'crystal_field', 'crystal_field_1.webp')), SETS[0], OFF[1], tmp(1));
  const fixed = [fs.readFileSync(tmp(0)), fs.readFileSync(tmp(1))];
  const pick = [], rejected = [];
  for (const pass of [0, 1]) {                 // Durchlauf 0: zwei verschiedene Rueckgaben
    for (const c of cands) {
      if (pick.length === 2) break;
      if (pick.includes(c)) continue;
      if (pass === 0 && pick.length && c.run === pick[0].run) continue;
      const f = tmp(2 + pick.length);
      await makeSlot(c.png, SETS[0], OFF[2 + pick.length], f);
      const b = fs.readFileSync(f);
      const nn = await worstAgainst(b, fixed.concat(pick.map((p) => p.built)));
      if (nn >= NCC_MAX) { rejected.push(c.id + ' ' + f3(nn)); continue; }
      c.ncc = nn; c.built = b; pick.push(c);
    }
    if (pick.length === 2) break;
  }
  if (rejected.length) say('Wegen Korrelation der FERTIGEN Kachel verworfen (Schranke ' + NCC_MAX + '): '
    + rejected.slice(0, 10).join(', ') + (rejected.length > 10 ? ' ... (' + rejected.length + ' insgesamt)' : ''));
  if (pick.length < 2) {
    say('WENIGER ALS ZWEI FENSTER HALTEN MESO, GROESSE UND KORRELATION GLEICHZEITIG.');
    say('Rueckfallebene: weitere Gitterversaetze aus crystal_field_0 und _1 -- dann aber als');
    say('solche zu benennen, es waeren nur zwei eigenstaendige Anordnungen in vier Slots.');
    fs.writeFileSync(path.join(ST, '_underground_ic_flux_numbers.txt'), out.join('\n') + '\n');
    return;
  }
  say('Gewaehlt: ' + pick.map((p) => p.id + ' (meso ' + f2(p.meso) + (p.ncc !== undefined ? ', NCC gegen den ersten ' + f3(p.ncc) : '') + ')').join('   |   '));
  say('');

  const srcs = [
    fs.readFileSync(path.join(TILES, 'crystal_field', 'crystal_field_0.webp')),
    fs.readFileSync(path.join(TILES, 'crystal_field', 'crystal_field_1.webp')),
    pick[0].png, pick[1].png,
  ];
  for (const set of SETS) {
    for (let i = 0; i < 4; i++) {
      await makeSlot(srcs[i], set, OFF[i], path.join(ST, '_underground_icset-' + set.tag + '_s' + i + '.webp'));
    }
    say('Satz ' + set.tag + ' gebaut: _underground_icset-' + set.tag + '_s0..3.webp'
      + '   (s0 = crystal_field_0, s1 = crystal_field_1, s2 = ' + pick[0].id + ', s3 = ' + pick[1].id + ')');
  }
  // der Vorschlagssatz, unter dem Namen, den die Abnahme-Messung liest
  for (let i = 0; i < 4; i++) {
    fs.copyFileSync(path.join(ST, '_underground_icset-p56L1-b1_s' + i + '.webp'),
      path.join(ST, '_underground_ice_cavern_s' + i + '.webp'));
  }
  fs.copyFileSync(path.join(ST, '_underground_ice_cavern_s0.webp'), path.join(ST, '_underground_ice_cavern_hero.webp'));
  say('Vorschlag (p56L1-b1) zusaetzlich als _underground_ice_cavern_s0..3.webp abgelegt.');
  fs.writeFileSync(path.join(ST, '_underground_ic_flux_numbers.txt'), out.join('\n') + '\n');
  console.log('\n-> ' + path.join(ST, '_underground_ic_flux_numbers.txt'));
})();
