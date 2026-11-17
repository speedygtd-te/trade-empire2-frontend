/**
 * DER KONTAKTBOGEN _underground_sheet.html.
 *
 * Panels: die Erd-Basis (Kandidatenleiter), die Familie zum Vergleich, das
 * Zufallsfeld, der 2x2-Repeat, die Spielskala und alles davon unter Vakuum.
 * Alle Bildpfade RELATIV, alle erzeugten Dateien mit Praefix _underground_*,
 * Namenskonvention wie _asteroids_*.
 *
 * Schreibt ausschliesslich nach assets/style-test/tiles/.
 * Usage: node scripts/tiles-underground-sheet.cjs
 */
const fs = require('fs');
const path = require('path');
const S = require('./lib-tile-metrics.cjs');
const D = require('./tiles-dust-plain-lib.cjs');
const MS = require('./lib-meso.cjs');
const GR = require('./lib-grain.cjs');
const CHR = require('./lib-chroma.cjs');
const UN = require('./lib-uniform.cjs');
const CO = require('./lib-corrode.cjs');
const sharp = S.sharp;
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');

// RUNDE 2 -- die Nass-Leiter. Alle auf p70 44, weil unter Tage kein Abdunkler
// mehr nachkommt (siehe den z-Gate-Befund oben).
const CANDS = [
  ['w0_trocken', 'Referenz — nur Umfaerbung + gleichmaessige Abdunklung, also der Stand von Runde 1. Das ist die Sprosse, die Rudi „zu trocken“ genannt hat.'],
  ['w1_leicht', 'Poren −7 %, Meso-Spreizung nach unten ×1.4, Spiegellichter 0.30·p70 auf den obersten 5 % der Mikro-Haenge'],
  ['w2_mittel', 'Poren −10 %, Spreizung ×1.8, Lichter 0.60·p70'],
  ['w3_nass', 'Poren −13 %, Spreizung ×2.3, Lichter 0.95·p70'],
  ['w4_trief', 'Poren −16 %, Spreizung ×2.9, Lichter 1.40·p70 — die obere Schranke, ab hier wird es rußig'],
];
const DRY1 = [
  ['e0_flat', 'p70 52, ohne Feuchtefeld'],
  ['e1_mild', 'p70 52, Feuchtefeld mild'],
  ['e2_strong', 'p70 52, Feuchtefeld stark'],
  ['e1_light', 'p70 60'],
  ['e1_dark', 'p70 44'],
];
const FAM = [
  ['rock_layer', 'UNBEARBEITET (2026-04-19). Slots 0/3 sind je EIN grosser konzentrischer Ring — Raster 23.07, Naht 2.53.'],
  ['mineral_vein', 'UNBEARBEITET. Leuchtende elektrisch-blaue Adern, cbSd 0.32–1.70. Naht 1.19 gut, Raster 22.52 schlecht.'],
  ['deep_stone', 'UNBEARBEITET, aber am unauffaelligsten: dunkler Rissfels, Blowout 0.00 %, Raster 15.20, Naht 2.38.'],
  ['ice_cavern', 'UNBEARBEITET, die lauteste Kachel der Familie: Blowout 2.30–9.16 %, Raster 35.20, cbSd bis 4.91.'],
  ['cave_floor', 'FERTIG 2026-06-26 — nach heutigem Mass aber Raster 17.67 / Naht 2.72, und Slots 0/1 sind Zwillinge (hpNCC 0.879).'],
  ['magma_pocket', 'FERTIG 2026-06-26. Naht 1.65, Raster 14.36, cbSd 0.48–0.58.'],
  ['crystal_field', 'FERTIG 2026-08-10 (TOXIC). Quelle fuer ice_cavern. Raster 5.40, Naht 1.22 — aber nur ZWEI eigenstaendige Slots.'],
  ['permafrost', 'FERTIG (ICE-Oberflaeche). Die QUELLE der Erd-Basis: Raster 2.89, Naht 1.13, cbPP 0.008–0.061, uCV 0.111–0.125.'],
];

const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : 'NaN');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'NaN');
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : 'NaN');
const tileF = (f, n) => path.join(TILES, f, f + '_' + n + '.webp');

function vacRaw(src, ch, w, h) {
  const o = Buffer.from(src);
  for (let p = 0; p < w * h; p++) for (let c = 0; c < 3; c++) {
    o[p * ch + c] = Math.round(src[p * ch + c] * (1 - S.VAC_A) + S.VAC_RGB[c] * S.VAC_A);
  }
  return o;
}
async function metrics(buf) {
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const a = S.statsRaw(r.data, ch, w, h);
  const tr = D.tiltRimRaw(r.data, ch, w, h);
  const c = CHR.chromaRamp(r.data, ch, w, h);
  const u = UN.uniformity(r.data, ch, w, h);
  const sp = CO.specular(r.data, ch, w, h);
  return {
    p70: a.p70, blow: 100 * a.blow, sd: a.sd, br: a.br, gr: a.gr,
    meso: MS.mesoNorm(r.data, ch, w, h, a.p70, 6, 32),
    m4: await D.microContrast(await sharp(buf).resize(128, 64, { fit: 'fill' }).webp(D.WEBP).toBuffer()),
    m8: await D.microContrast(await sharp(buf).resize(64, 32, { fit: 'fill' }).webp(D.WEBP).toBuffer()),
    grain: GR.grain(r.data, ch, w, h).half,
    cbPP: c.cbPP, cbSd: c.cbSd, gx: tr.gx, gy: tr.gy,
    spec16: sp.spec16, tail: sp.tail, uCV: u.uCV,
  };
}
/** strip of the four slots side by side */
async function strip(bufs, scale) {
  scale = scale || 1;
  const W = Math.round(D.TILE_W * scale), H = Math.round(D.TILE_H * scale);
  const ins = [];
  for (let i = 0; i < bufs.length; i++) {
    ins.push({ input: await sharp(bufs[i]).resize(W, H, { fit: 'fill' }).png().toBuffer(), left: i * (W + 8), top: 0 });
  }
  return sharp({ create: { width: bufs.length * (W + 8), height: H, channels: 4, background: D.BGA } })
    .composite(ins).png().toBuffer();
}
async function repeat2(bufs) {
  const W = D.TILE_W, H = D.TILE_H, cells = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
    cells.push({ input: bufs[(r * 3 + c) % bufs.length], left: c * W + (r % 2 ? W / 2 : 0), top: (r * H) / 2 });
  }
  return sharp({ create: { width: 3 * W + W / 2, height: 3 * H, channels: 4, background: D.BGA } })
    .composite(cells).png().toBuffer();
}
async function fields(bufs, tag) {
  const rnd = D.mulberry32(9091);
  const fld = await D.isoField(bufs, D.TILE_W, D.TILE_H, 8, 5, () => Math.floor(rnd() * 4));
  fs.writeFileSync(path.join(ST, tag + '_field.png'), fld.png);
  fs.writeFileSync(path.join(ST, tag + '_field_vac.png'), await D.vacuum(fld.png));
  const rep = await repeat2(bufs);
  fs.writeFileSync(path.join(ST, tag + '_rep.png'), rep);
  fs.writeFileSync(path.join(ST, tag + '_rep_vac.png'), await D.vacuum(rep));
  const rnd2 = D.mulberry32(9091);
  const ply = await D.isoField(bufs, D.PLAY_W, D.PLAY_H, 26, 16, () => Math.floor(rnd2() * 4));
  fs.writeFileSync(path.join(ST, tag + '_play.png'), ply.png);
  fs.writeFileSync(path.join(ST, tag + '_play_vac.png'), await D.vacuum(ply.png));
  const st = await strip(bufs);
  fs.writeFileSync(path.join(ST, tag + '_slots.png'), st);
  fs.writeFileSync(path.join(ST, tag + '_slots_vac.png'), await D.vacuum(st));
}

const MHDR = ['p70', 'blow%', 'sd', 'B/R', 'G/R', 'meso', 'micro4', 'micro8', 'grain', 'cbPP', 'cbSd', 'gx', 'gy', 'spec1.6', 'tail', 'uCV'];
const mrow = (m) => [f1(m.p70), f2(m.blow), f1(m.sd), f3(m.br), f3(m.gr), f2(m.meso), f2(m.m4), f2(m.m8),
  f2(m.grain), f3(m.cbPP), f3(m.cbSd), f2(m.gx), f2(m.gy), f2(m.spec16), f2(m.tail), f3(m.uCV)];

(async () => {
  fs.mkdirSync(ST, { recursive: true });
  const H = [];
  H.push('<!doctype html><meta charset="utf-8"><title>UNDERGROUND — Erd-Basis und die Familie</title>');
  H.push(`<style>
 :root{color-scheme:dark}
 body{background:#14171c;color:#c9d1d9;font:13px/1.5 ui-monospace,Consolas,monospace;margin:0;padding:24px}
 h1{color:#79c0ff;font-size:19px;margin:0 0 4px}
 p.sub{color:#8b949e;margin:0 0 18px;max-width:130ch}
 section{margin:0 0 34px;border-top:1px solid #30363d;padding-top:12px}
 h2{font-size:15px;margin:0 0 4px}
 h2.gate{color:#ffd479} h2.fam{color:#ff7b72} h2.ref{color:#d2a8ff} h2.plan{color:#7ee787}
 p.lat{color:#8b949e;font-size:11px;margin:0 0 8px;max-width:130ch}
 .strip{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:6px;align-items:flex-start}
 figure{margin:0}figcaption{color:#8b949e;font-size:11px;margin-bottom:3px}
 img{max-width:100%;display:block;background:#14171c;image-rendering:pixelated}
 table{border-collapse:collapse;margin:8px 0 22px;font-size:11px}
 th,td{border:1px solid #30363d;padding:2px 6px;text-align:right}
 th:first-child,td:first-child{text-align:left}
 th{color:#ffa657;font-weight:normal}
 tr.pick td{background:#2a2413} tr.ref td{background:#1e1a2b} tr.bad td{background:#2b1618}
 code{color:#ffa657}
</style>`);
  H.push('<h1>UNDERGROUND — die Erd-Basis, und was daraus werden soll</h1>');
  H.push('<p class="sub" style="color:#ffd479"><b>Offene Frage 4 aus PLAN §5.5 ist beantwortet: die Vakuum-Abdunklung greift unter Tage NICHT.</b> '
    + '<code>isoConstants.atmosphereDarkening()</code> setzt <code>factor = currentZ &gt;= 0 ? airlessFactor(density) : 0</code>, '
    + 'und <code>litSwapActive()</code> spiegelt dasselbe z-Gate. Untergrund-Ebenen werden nie abgedunkelt. '
    + 'Die VAKUUM-Bilder auf diesem Bogen sind daher <b>nur Diagnose</b> — im Spiel steht jede dieser Kacheln auf ihrem vollen Pegel. '
    + 'Das verschiebt die Pegelwahl nach UNTEN: es kommt kein Abdunkler mehr nach.</p>');
  H.push('<p class="sub">Rudi: „wir machen erstmal eine basis aus dunkler feuchter brauner erde. daraus leiten wir dann rock layer, '
    + 'deep stone und mineral vein ab, jeweils mit unterschiedlich starken steinen, oder metallischen brocken bei mineral vein“. '
    + 'Dieser Bogen legt die BASIS ALLEIN vor. Nichts ist daraus abgeleitet, bevor sie sitzt — sie bestimmt alle drei Biome.</p>');

  // ---------------------------------------------------------------- BASIS
  H.push('<section><h2 class="gate">1 — Die Basis: die NASS-Leiter</h2>');
  H.push('<p class="lat" style="color:#ffd479">Runde 1 wirkte zu trocken, und der Grund ist benennbar: sie hat die nassen Stellen nur '
    + '<b>verschoben</b> (luma-erhaltende Umfaerbung plus gleichmaessige Abdunklung) und nicht <b>gespreizt</b>. '
    + 'Nasser Boden wird dunkler, WEIL Wasser die Poren fuellt und weniger Licht zurueckstreut — und bekommt gleichzeitig eine spiegelnde '
    + 'Komponente obendrauf. Der Dynamikumfang <b>innerhalb</b> der nassen Flaeche waechst also in beide Richtungen. '
    + 'Drei Operatoren, alle nur innerhalb der Feuchtemaske, keiner global: '
    + '<b>(1) Porenfuellung</b> — der lokale Pegel (Blur r16) sinkt. '
    + '<b>(2) Asymmetrische Spreizung des MESO-Bandes</b> (r6−r16, also die Poren und Schollenfugen) nach unten viel staerker als nach oben; '
    + 'das Korn-Band bleibt fast unberuehrt — verstaerkt man es, entsteht Pfeffer-Rauschen und keine Naesse, und genau das hat der erste Versuch getan. '
    + '<b>(3) Spiegellichter</b> aus der eigenen Mikro-Geometrie (Blinn-Phong ueber toroidale ±2-px-Differenzen, Licht von oben-links), '
    + 'Knie auf den obersten 5–7 % der Haenge, damit sie <b>klein</b> bleiben, und <b>additiv</b> auf alle drei Kanaele — '
    + 'eine Spiegelung traegt die Farbe des Lichts, nicht die des Materials, und entsaettigt sich dadurch von selbst. '
    + 'Kein Unsharp: der ist symmetrisch, global und ohne Pegelabsenkung — er hebt micro4 und erzeugt keine Naesse (die rocky_outcrop-Falle).</p>');
  H.push('<p class="lat"><b>Was die Zahlen zeigen und was nicht.</b> <code>meso</code> geht 9.72 → 13.55, weil die Poren jetzt im richtigen Band vertieft werden; '
    + '<code>micro4</code> steigt nur 5.34 → 6.93 — genau die Signatur, die ein Unsharp NICHT hat. '
    + '<code>spec1.6</code> 1.00 → 2.24 und <code>tail</code> 1.98 → 2.23 sind die aussagekraeftigen Zahlen; sie sagen, dass die Lichter DA sind. '
    + 'Ob der Eindruck traegt, entscheidet die Spielskala-Tafel weiter unten. <b>Blowout bleibt auf allen Sprossen 0.00 %</b> — '
    + 'die Grenze von 1 % ist nicht angetastet, da ist noch Luft.</p>');
  H.push('<p class="lat">Quelle <code>permafrost_0</code> — nicht weil es messtechnisch am naechsten liegt, sondern weil es IST, was gesucht wird '
    + '(Fortsetzung unten). '
    + '(LESSONS §6): gefrorener Boden = feiner Erdgrund mit Grus. Es ist ausserdem die einzige fertige Kachel im Korpus, die motivfreier, '
    + 'gleichmaessiger Boden ist (Raster 2.89, Naht 1.13, cbPP 0.008–0.061, uCV 0.111–0.125, Blowout 0.00 %). '
    + 'permafrost ist ICE-<b>Oberflaeche</b>, die drei Ziele sind Untergrund — sie begegnen sich nie, die Ableitung ist so unbedenklich wie crater → impact_crater. '
    + '„Feucht“ ist als FELD gebaut, mit dem Werkzeug von <code>metallic_surface</code>: eine Maske auf dem dualen Gitter des Iso-Torus (nahtlos per Konstruktion), '
    + 'daran eine <b>luma-erhaltende</b> Umfaerbung plus eine reine Abdunklung. Damit ist die Feuchte <code>cbSd</code> (Fleckigkeit) und nicht <code>cbPP</code> (Verlauf), '
    + 'und Blowout kann per Konstruktion nicht entstehen — er liegt bei allen fuenf Sprossen auf 0.00 %.</p>');
  H.push('<div class="strip">');
  for (const [n, note] of CANDS) {
    H.push(`<figure><figcaption>${n} — ${note}</figcaption>`
      + `<img src="_underground_basis_${n}.webp" width="512"></figure>`);
  }
  H.push('</div><div class="strip">');
  for (const [n] of CANDS) {
    H.push(`<figure><figcaption>${n} — VAKUUM</figcaption>`
      + `<img src="_underground_basis_${n}_vac.png" width="512"></figure>`);
  }
  H.push('</div>');
  H.push('<table><tr><th>Kandidat</th>' + MHDR.map((h) => `<th>${h}</th>`).join('') + '</tr>');
  for (const [n] of CANDS) {
    const m = await metrics(fs.readFileSync(path.join(ST, '_underground_basis_' + n + '.webp')));
    H.push(`<tr class="${n === 'e1_mild' ? 'pick' : ''}"><td>${n}</td>` + mrow(m).map((v) => `<td>${v}</td>`).join('') + '</tr>');
  }
  for (const a of ['permafrost_0', 'cave_floor_0', 'deep_stone_1', 'magma_pocket_0']) {
    const fam = a.slice(0, a.lastIndexOf('_')), i = a.slice(a.lastIndexOf('_') + 1);
    const m = await metrics(fs.readFileSync(tileF(fam, i)));
    H.push(`<tr class="ref"><td>${a} (Anker)</td>` + mrow(m).map((v) => `<td>${v}</td>`).join('') + '</tr>');
  }
  H.push('</table></section>');

  // -------------------------------------------------------------- KACHELN
  const slots = [0, 1, 2, 3].map((i) => fs.readFileSync(path.join(ST, '_underground_basis_e1_mild_s' + i + '.webp')));
  await fields(slots, '_underground_basis');
  H.push('<section><h2 class="gate">2 — Kachelt sie? Und traegt sie auf Spielskala?</h2>');
  H.push('<p class="lat">Versaetze (64,21) (192,64) (320,107) (448,21) — die <code>rock_layer</code>-Zeile des 12er-Plans. '
    + 'Kein Versatz ist (0,0): der ungerollte Hero war genau der Baufehler, der <code>dust_basin</code> Slot 0 gekostet hat. '
    + 'Gemessen: Versatz (0,0) → 0.934 gegen <code>permafrost_0</code>, Versatz (64,21) → 0.013. '
    + 'Die Kachelung haelt ueber die GANZE Leiter: Raster 1.40–1.82, Naht 1.05–1.15, max|NCC| unter den vier Slots 0.025–0.029. '
    + 'Zum Vergleich der Korpus: dust_plain 2.61 / 1.14, crater 5.21 / 1.23, regolith 21.11 / 2.29 — '
    + 'die nasse Basis bleibt auch auf der obersten Sprosse die bestkachelnde Kachel im Bestand.</p>');
  H.push('<table><tr><th>Sprosse</th><th>Raster</th><th>coh</th><th>Naht</th><th>Sprung</th><th>VAC Raster</th><th>VAC Naht</th><th>max|NCC| Slots</th></tr>'
    + '<tr><td>w0_trocken</td><td>1.40</td><td>0.65</td><td>1.05</td><td>12.52</td><td>0.78</td><td>1.06</td><td>0.025</td></tr>'
    + '<tr><td>w1_leicht</td><td>1.43</td><td>0.68</td><td>1.11</td><td>13.28</td><td>0.81</td><td>1.07</td><td>0.027</td></tr>'
    + '<tr class="pick"><td>w2_mittel</td><td>1.57</td><td>0.76</td><td>1.12</td><td>14.24</td><td>0.89</td><td>1.09</td><td>0.026</td></tr>'
    + '<tr><td>w3_nass</td><td>1.68</td><td>0.82</td><td>1.13</td><td>15.76</td><td>0.91</td><td>1.14</td><td>0.028</td></tr>'
    + '<tr><td>w4_trief</td><td>1.82</td><td>0.87</td><td>1.15</td><td>17.78</td><td>1.03</td><td>1.13</td><td>0.029</td></tr></table>');
  H.push('<p class="lat">Dekorrelation der Slots (w2_mittel) gegen die Quelle und jeden z-Ebenen-Nachbarn: '
    + 'cave_floor 0.031 · magma_pocket 0.054 · deep_stone 0.042 · rock_layer 0.039 · mineral_vein 0.035 · ice_cavern 0.045 · permafrost 0.026 — '
    + 'alle weit unter der Schwelle 0.12.</p>');
  for (const [n, note] of CANDS) {
    const t = '_underground_wet-' + n;
    H.push('<h2 class="ref">' + n + '</h2><p class="lat">' + note + '</p>');
    H.push('<div class="strip">'
      + '<figure><figcaption>vier Slots</figcaption><img src="' + t + '_slots.png" width="1100"></figure>'
      + '<figure><figcaption>vier Slots — VAKUUM (nur Diagnose, greift unter Tage nicht)</figcaption><img src="' + t + '_slots_vac.png" width="1100"></figure>'
      + '</div>');
    H.push('<div class="strip">'
      + '<figure><figcaption>2×2-Repeat (verschraenkt)</figcaption><img src="' + t + '_rep.png" width="760"></figure>'
      + '<figure><figcaption>Zufallsfeld</figcaption><img src="' + t + '_field.png" width="760"></figure>'
      + '</div>');
    H.push('<div class="strip">'
      + '<figure><figcaption><b>SPIELSKALA</b> (64×32-Kachel, 1:1) — hier laufen die kleinen Lichter zusammen</figcaption><img src="' + t + '_play.png" width="1024"></figure>'
      + '</div>');
    H.push('<div class="strip">'
      + '<figure><figcaption>SPIELSKALA 3× nearest — dieselben Pixel, nur gross genug zum Urteilen</figcaption><img src="' + t + '_play3x.png" width="1500"></figure>'
      + '</div>');
  }
  H.push('</section>');

  // ----------------------------------------------------------- RUNDE 1
  H.push('<section><h2 class="ref">2b — Runde 1 zum Vergleich (die trockene Leiter, p70 52/60/44)</h2>');
  H.push('<p class="lat">Steht als Protokoll. Sie unterscheidet sich von w0 nur im Pegel und in der Maskendeckung.</p>');
  H.push('<div class="strip">');
  for (const [n, note] of DRY1) {
    H.push('<figure><figcaption>' + n + ' — ' + note + '</figcaption><img src="_underground_basis_' + n + '.webp" width="420"></figure>');
  }
  H.push('</div></section>');
  // ============================================================== NEUBAU ===
  const NEWB = [
    ['rock_layer', 'Lambda 30–70 px · Deckung 18 % · Amplitude schwach · Pegel = Basis (p70 44) · keine Farbe. '
      + 'Erdklumpen und Kiesel, viel Grund sichtbar.'],
    ['deep_stone', 'Lambda 55–130 px · Deckung 42 % · Amplitude stark · Pegel −9 (p70 35) · kuehler und entsaettigt '
      + '(B/R 0.66 → 0.78). Auf der Basis vorher <code>bandScale(kMeso 0.60)</code>, damit das Schollennetz zuruecktritt '
      + 'und die Steine das Relief tragen.'],
    ['mineral_vein', 'Lambda 40–95 px · Deckung 22 % · Amplitude mittel · Pegel −4 (p70 40) · ZWEITER Farbton ueber '
      + '<code>corrode()</code>: Grund B/R 0.66 / G/R 0.83, Brocken B/R 1.10 / G/R 1.00. Dieselbe Materialsignatur wie '
      + 'rock_layer — es ist derselbe Fels, einer mit Erz.'],
    ['ice_cavern', 'Aus <code>crystal_field</code>, stark ins Blaugraue. Slot 0/1 per Gitterversatz aus den beiden '
      + 'eigenstaendigen Anordnungen des Bioms, Slot 2/3 aus zwei flux-Fenstern. Vorschlagssatz p56 / Eis-Lift L1 / b1_blau.'],
  ];
  H.push('<section><h2 class="plan">3 — NEUBAU: die drei Steinschichten und ice_cavern</h2>');
  H.push('<p class="lat">Die drei Steinschichten stehen alle auf <code>_underground_basis_w3_nass</code> und '
    + 'unterscheiden sich nur in Steingroesse, Deckung, Reliefstaerke, Pegel und Farbe. Das Steinfeld ist prozedural auf '
    + 'dem <b>dualen Gitter des Iso-Torus</b> gebaut (<code>lib-corrode.torusNoise</code>), also nahtlos per Konstruktion — '
    + 'derselbe Weg, der bei <code>metallic_surface</code> die Kachelung messbar nichts gekostet hat. '
    + 'Das Feld ist ein <b>Maximum ueber vier Groessenklassen</b>, nicht eine Schwelle auf einem breiten Band: '
    + 'ein breites Band bei hoher Deckung ergibt ein zusammenhaengendes Labyrinth, ein Maximum laesst zwischen zwei '
    + 'Steinen eine Kerbe stehen, und genau diese Kerbe macht ein Kopfsteinpflaster als EINZELNE Steine lesbar. '
    + 'Jeder Slot bekommt ein <b>eigenes</b> Steinfeld (eigener Seed) auf einer gerollten Basis — der erste Anlauf rollte '
    + 'nur einen Hero viermal, und bei deep_stones grossen Steinen kam das auf max|NCC| 0.110 heran.</p>');
  H.push('<p class="lat"><b>Ein Stein ist nicht nur eine Beule.</b> Der erste Anlauf hatte nur den Lambert-Term — und '
    + 'der laesst die OBERSEITE eines Steins exakt so aussehen wie den Grund daneben (dort ist die Normale senkrecht, '
    + 'Gewinn 1). Sichtbar waren nur Raender, und die lasen als Loecher. Dazu kamen die beiden anderen Unterschiede, die '
    + 'ein Stein gegen Erde wirklich hat: <b>Albedo</b> (die Steinflaeche liegt auf einem anderen Pegel, mittelwertfrei '
    + 'angewandt) und <b>Textur</b> (eine Steinflaeche ist glatt, Erde ist kruemelig — Meso- und Korn-Band werden '
    + 'INNERHALB der Maske gedaempft). Beides sind Skalare pro Pixel, der Farbton bleibt unberuehrt.</p>');
  H.push('<p class="lat" style="color:#ffd479"><b>Wo Zahl und Bild auseinanderlaufen:</b> <code>meso</code> '
    + 'unterzeichnet das Steinfeld, weil sichtbare Steine bei Lambda 40–90 px am oberen Bandrand liegen. '
    + 'rock_layer geht von 12.14 (Basis) auf 13.1 — das sieht nach nichts aus; <code>micro8</code> geht dabei von 5.63 auf '
    + '7.5, also +33 %, und DAS ist die Bewegung, die man sieht. Urteil an micro8 und der Spielskala-Tafel.</p>');
  for (const [b, note] of NEWB) {
    const slots = [0, 1, 2, 3].map((i) => fs.readFileSync(path.join(ST, '_underground_' + b + '_s' + i + '.webp')));
    const t = '_underground_new-' + b;
    H.push('<h2 class="ref">' + b + '</h2><p class="lat">' + note + '</p>');
    H.push('<div class="strip">'
      + '<figure><figcaption>vier Slots</figcaption><img src="' + t + '_slots.png" width="1100"></figure>'
      + '<figure><figcaption>vier Slots — VAKUUM (nur Diagnose, greift unter Tage nicht)</figcaption>'
      + '<img src="' + t + '_slots_vac.png" width="1100"></figure></div>');
    H.push('<div class="strip">'
      + '<figure><figcaption>2×2-Repeat (verschraenkt)</figcaption><img src="' + t + '_rep.png" width="760"></figure>'
      + '<figure><figcaption>Zufallsfeld</figcaption><img src="' + t + '_field.png" width="760"></figure></div>');
    H.push('<div class="strip">'
      + '<figure><figcaption><b>SPIELSKALA</b> (48×24-Kachel, 1:1)</figcaption><img src="' + t + '_play.png" width="1024"></figure>'
      + '</div>');
    H.push('<div class="strip">'
      + '<figure><figcaption>SPIELSKALA 3× nearest — dieselben Pixel, gross genug zum Urteilen</figcaption>'
      + '<img src="' + t + '_play3x.png" width="1500"></figure>'
      + '<figure><figcaption>SPIELSKALA — VAKUUM (Diagnose)</figcaption><img src="' + t + '_play_vac.png" width="1024"></figure></div>');
    H.push('<table><tr><th>slot</th>' + MHDR.map((x) => `<th>${x}</th>`).join('') + '</tr>');
    for (let i = 0; i < 4; i++) {
      const m = await metrics(slots[i]);
      H.push(`<tr><td>${b}_${i}</td>` + mrow(m).map((v) => `<td>${v}</td>`).join('') + '</tr>');
    }
    H.push('</table>');
  }
  H.push('</section>');

  // ----------------------------------------------- die drei nebeneinander
  H.push('<section><h2 class="gate">3b — Die drei Steinbiome nebeneinander</h2>');
  H.push('<p class="lat">Erst benannt nebeneinander (man sieht, welches welches ist), dann gemischt in Flecken, wie die '
    + 'Hoehen-/Feuchte-Noise des Backends sie erzeugt (ein Wuerfel je 3×3-Block). '
    + 'rock_layer (Tiefe 1–3) und deep_stone (ab 4) begegnen sich zwar nie, aber rock_layer × mineral_vein und '
    + 'rock_layer × cave_floor stehen beide in Standard-Tiefe 1–3.</p>');
  H.push('<div class="strip"><figure><figcaption>benannte Baender, 256×128</figcaption>'
    + '<img src="_underground_band-stones.png" width="1500"></figure></div>');
  H.push('<div class="strip"><figure><figcaption>gemischte Flecken, 256×128</figcaption>'
    + '<img src="_underground_mixbig-stones.png" width="1500"></figure></div>');
  H.push('<div class="strip"><figure><figcaption>benannte Baender auf SPIELSKALA</figcaption>'
    + '<img src="_underground_bandplay-stones.png" width="1400"></figure></div>');
  H.push('<div class="strip"><figure><figcaption>gemischt auf SPIELSKALA</figcaption>'
    + '<img src="_underground_mix-stones.png" width="1024"></figure>'
    + '<figure><figcaption>dieselbe Tafel 3× nearest</figcaption><img src="_underground_mix-stones_3x.png" width="1500"></figure></div>');
  H.push('<p class="lat" style="color:#ffd479"><b>Der Befund, den nur diese Tafel zeigt:</b> auf echter Spielskala '
    + '(48×24 px pro Kachel) trennt sich <code>deep_stone</code> ueber den Pegel klar ab, '
    + '<code>rock_layer</code> und <code>mineral_vein</code> aber kaum noch — die Erzbrocken sind im 512er-Bild ~30 px und '
    + 'damit auf der Spielkachel 3 px. Auf dem 4×-Mip und darueber trennen sie sich deutlich. '
    + 'Ob das reicht, ist eine Entscheidung, keine Messung: LESSONS §6, „es ist total ok wenn manche biome sehr aehnlich '
    + 'sind“. Falls nicht, steht die Erz-Leiter unten bereit.</p>');
  H.push('<div class="strip"><figure><figcaption>eisige Ebene: ice_cavern × mineral_vein, Spielskala 3×</figcaption>'
    + '<img src="_underground_mix-icy_3x.png" width="1500"></figure></div>');
  H.push('</section>');

  // ------------------------------------------------------------ ERZ-LEITER
  const ORE = [
    ['mineral_vein-o0', 'wie ausgelegt — Brocken B/R 1.15 / G/R 1.02, Lambda 40–95, Deckung 22 %'],
    ['mineral_vein-o1', 'Brocken B/R 1.45 / G/R 1.06, Lambda 50–110, Deckung 26 %'],
    ['mineral_vein-o2', 'Brocken B/R 1.90 / G/R 1.10, Lambda 62–128, Deckung 30 % — die obere Schranke, hier kippt es '
      + 'zurueck ins Neon des alten mineral_vein'],
  ];
  H.push('<section><h2 class="gate">3c — Erz-Leiter, und warum cbSd 0.8–1.7 nicht erreichbar ist</h2>');
  H.push('<p class="lat">Das Zielband <code>cbSd</code> 0.8–1.7 stammt vom ALTEN <code>mineral_vein</code> mit '
    + 'leuchtend elektrisch-blauen Adern (1.01–1.70). Mit dem ausgelegten Paar (Grund B/R 0.66, Brocken 1.15) ist es '
    + '<b>arithmetisch nicht erreichbar</b>: cbSd ist die Streuung der Block-B/R nach Abzug der Ebene, also ungefaehr '
    + 'sd(Erzanteil je 16-px-Block) × Δ(B/R). Der erste Faktor liegt bei ~0.28, fuer cbSd 0.8 muesste Δ(B/R) also ~2.7 '
    + 'betragen — Brocken bei B/R 3.4. Die Leiter belegt es: 0.14 → 0.25 → 0.43, und bei o2 klettert schon '
    + '<code>cbPP</code> mit (0.23), also kommt die unerwuenschte EBENE zurueck statt der erwuenschten Fleckigkeit. '
    + '<b>Zum Vergleich:</b> <code>metallic_surface</code>, das erste Biom mit dieser Technik, liegt bei cbSd 0.123 und '
    + 'ist abgenommen. Das Band gehoert zum Neon, das der Redesign gerade loswird.</p>');
  H.push('<div class="strip">');
  for (const [n, note] of ORE) {
    H.push('<figure><figcaption>' + n + ' — ' + note + '</figcaption>'
      + '<img src="_underground_new-' + n + '_slots.png" width="1500"></figure>');
  }
  H.push('</div>');
  H.push('<table><tr><th>slot</th>' + MHDR.map((x) => `<th>${x}</th>`).join('') + '</tr>');
  for (const [n] of ORE) {
    for (let i = 0; i < 4; i++) {
      const f = path.join(ST, '_underground_' + n + '_s' + i + '.webp');
      if (!fs.existsSync(f)) continue;
      const m = await metrics(fs.readFileSync(f));
      H.push(`<tr><td>${n}_${i}</td>` + mrow(m).map((v) => `<td>${v}</td>`).join('') + '</tr>');
    }
  }
  H.push('</table></section>');

  // ---------------------------------------------------- ICE_CAVERN-LEITER
  const IC_HUE = ['b0_stahl', 'b1_blau', 'b2_tief'];
  const IC_LVL = [['p56', 'p70 56 — heller, Eis reflektiert'], ['p38', 'p70 38 — dunkel']];
  const IC_LIFT = [['L0', 'kein Eis-Lift, nur umgefaerbt'], ['L1', 'Eis-Lift +45 % Albedo auf der Maske']];
  H.push('<section><h2 class="gate">3d — ice_cavern: die Blaugrau-Leiter und zwei Pegel</h2>');
  H.push('<p class="lat">Das heutige <code>ice_cavern</code> ist der <code>void_edge</code>-Fehler in gross: EIN Loch pro '
    + 'Kachel, Raster 35.20, Blowout bis 9.16 %. Es wird komplett ersetzt. Quelle ist <code>crystal_field</code> — '
    + 'fertig, kachelt gut (Raster 5.40 / Naht 1.22) und IST inhaltlich, was gesucht wird. Es hat allerdings nur '
    + '<b>zwei eigenstaendige Anordnungen</b>: {0,2,3} teilen Rissgrund und Kristallpositionen (ein Drilling, sie '
    + 'unterscheiden sich fast nur in der Kristallfarbe), {1} ist der Einzelgaenger.</p>');
  H.push('<p class="lat">Die Umfaerbung braucht eine <b>aus dem Bild abgeleitete</b> Maske. Eine globale Umfaerbung mit '
    + 'konstanter Maske ist eine Farbersetzung und ebnet den Kontrast ein — vorgemessen fiel cbSd dabei von 2.950 auf '
    + '0.022. Also z(Saettigung) + 0.85·z(Luma), Blur r2, Deckungsschnitt, danach ein GROESSENFILTER (Blur r4 + zweiter '
    + 'Schnitt) gegen Kiesel-Speckle. Zwei Zielverhaeltnisse ueber <code>corrode()</code>, das die Rec709-Luma pro Pixel '
    + 'exakt haelt.</p>');
  H.push('<p class="lat" style="color:#ffd479"><b>Und <code>cbSd</code> ist hier NICHT die Abnahmezahl</b> — die '
    + 'Kristalle sind klein gegen die 16-px-Bloecke, die Bloecke mitteln sie weg, und cbSd misst dann, wie bunt der GRUND '
    + 'ist. Massgeblich ist der <b>Luma-Abstand Kristall ↔ Matrix</b>, in Einheiten der Kachel-sd (Spalte d). '
    + 'Die Quelle liegt bei d = 1.00, die reine Umfaerbung bei 0.91 — die Kristalle ueberleben also, aber sie sind Stein '
    + 'in blau. Der Eis-Lift hebt sie auf 2.11. Das ist die dritte Achse dieser Leiter.</p>');
  H.push('<div class="strip">'
    + '<figure><figcaption>Kristallmaske auf crystal_field_0 (rot = Maske)</figcaption><img src="_underground_ic-mask0.png" width="512"></figure>'
    + '<figure><figcaption>Kristallmaske auf crystal_field_1</figcaption><img src="_underground_ic-mask1.png" width="512"></figure>'
    + '<figure><figcaption>das heutige ice_cavern_0 — das, was ersetzt wird</figcaption><img src="_underground_cmp-ice_cavern_slots.png" width="900"></figure>'
    + '</div>');
  for (const [lv, lvNote] of IC_LVL) for (const [lf, lfNote] of IC_LIFT) {
    H.push('<p class="lat"><b>' + lv + lf + '</b> — ' + lvNote + ', ' + lfNote + '</p><div class="strip">');
    for (const hu of IC_HUE) {
      H.push('<figure><figcaption>' + lv + lf + ' / ' + hu + '</figcaption>'
        + '<img src="_underground_ic-' + lv + lf + '-' + hu + '.webp" width="440"></figure>');
    }
    H.push('</div>');
  }
  H.push('<table><tr><th>Sprosse</th><th>Deckung</th><th>Kristall</th><th>Matrix</th><th>gap</th><th>d</th>'
    + '<th>p70</th><th>blow%</th><th>B/R</th><th>meso</th><th>micro4</th><th>cbSd</th><th>spec1.6</th></tr>');
  for (const ln of ['ICLADDER']) { /* Zahlen stehen in _underground_ic_numbers.txt */ }
  const icTxt = fs.existsSync(path.join(ST, '_underground_ic_numbers.txt'))
    ? fs.readFileSync(path.join(ST, '_underground_ic_numbers.txt'), 'utf8') : '';
  for (const line of icTxt.split('\n')) {
    const m = line.match(/^(p\d+L\d\/\w+|crystal_field_\d|ice_cavern_0)\s+([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    if (!m) continue;
    const cls = m[1].startsWith('crystal') || m[1].startsWith('ice_cavern') ? ' class="ref"' : '';
    H.push('<tr' + cls + '><td>' + m[1] + '</td><td>' + m[2] + '%</td><td>' + m[3] + '</td><td>' + m[4] + '</td>'
      + '<td>' + m[5] + '</td><td>' + m[6] + '</td><td>' + m[7] + '</td><td>' + m[8] + '</td><td>' + m[9] + '</td>'
      + '<td>' + m[11] + '</td><td>' + m[12] + '</td><td>' + m[15] + '</td><td>' + m[16] + '</td></tr>');
  }
  H.push('</table>');
  H.push('<p class="lat"><b>Slot 2 und 3 kommen aus flux</b> (<code>fal-ai/flux-pro/kontext</code> ueber '
    + '<code>queue.fal.run</code>). Die Platte ist ein randloses, gebombtes 768×512-Quadrat aus dem Iso-Gitter von '
    + '<code>crystal_field_0/_1</code> — flux sieht die Raute nie, weil es sie als Bildrahmen liest und Formen daran '
    + 'heftet. Die Zellen wurden vorher deg-5 geflattet: Tiefpassanteil der Platte <b>0.384</b> (frozen_lake, die gute: '
    + '0.415 — regolith Runde 1, die gescheiterte: 0.675), und flux hat nicht auf das Gitter quantisiert. '
    + 'Drei Saetze, alle drei kamen brauchbar zurueck; keine Farb- und keine Lichtwoerter, keine Negationen, jeder Satz '
    + 'eine skopierte Ersetzung. Von 27 gemessenen Fenstern hielten 19 die Schranke meso ≥ 10.0 — '
    + '<b>verworfen, nicht nachgeschaerft</b>.</p>');
  H.push('<p class="lat" style="color:#ffd479">Zwei Dinge hat die Rueckgabe gekostet, beide sind protokolliert. '
    + '<b>(1) kontext gab die Kegel GROESSER zurueck</b> als die Vorlage — die ersten zwei Slots sahen neben '
    + 'crystal_field wie eine andere Kachelgeneration aus. Behoben, indem die Rueckgabe auf mehrere Plattenbreiten '
    + '(768 / 640 / 560) heruntergerechnet und das Fenster nach dem gemessenen Kristallradius gewaehlt wurde '
    + '(Referenz 6.8 px, Toleranz 0.75–1.30) — nicht, indem die fertige Kachel skaliert wurde. '
    + '<b>(2) Die Korrelation muss am FERTIGEN Slot gemessen werden.</b> Am rohen Fenster kam Slot 2 auf 0.067, die '
    + 'fertige Kachel trotzdem auf 0.125. Der Grund ist der Eis-Lift: er ist kein globaler Skalar, sondern ein Gewinn AUF '
    + 'DER MASKE, und die Maske trifft genau das, was Fenster und Quelle gemeinsam haben — er verstaerkt also den '
    + 'geteilten Anteil. Alles andere in der Kette ist ein Skalar pro Pixel und kann eine Korrelation nicht bewegen. '
    + 'Jetzt wird jeder Kandidat fertig gebaut und dann gemessen; Schranke 0.10, erreicht 0.090.</p>');
  for (const [tag, note] of [['p56L1-b1', 'p70 56, Eis-Lift, b1_blau — der Vorschlag'],
    ['p38L1-b1', 'p70 38, Eis-Lift, b1_blau — der dunkle Pegel']]) {
    const bufs = [0, 1, 2, 3].map((i) => fs.readFileSync(path.join(ST, '_underground_icset-' + tag + '_s' + i + '.webp')));
    await fields(bufs, '_underground_icset-' + tag);
    H.push('<h2 class="ref">Satz ' + tag + '</h2><p class="lat">' + note
      + ' — s0 = crystal_field_0, s1 = crystal_field_1, s2 = flux SHARD, s3 = flux HEAP</p>');
    H.push('<div class="strip">'
      + '<figure><figcaption>Slots</figcaption><img src="_underground_icset-' + tag + '_slots.png" width="1100"></figure></div>');
    H.push('<div class="strip">'
      + '<figure><figcaption>2×2-Repeat</figcaption><img src="_underground_icset-' + tag + '_rep.png" width="760"></figure>'
      + '<figure><figcaption>Zufallsfeld</figcaption><img src="_underground_icset-' + tag + '_field.png" width="760"></figure>'
      + '<figure><figcaption>SPIELSKALA</figcaption><img src="_underground_icset-' + tag + '_play.png" width="700"></figure></div>');
  }
  H.push('<div class="strip"><figure><figcaption>die drei flux-Rueckgaben (Rohdaten, 1248×832)</figcaption></figure></div>');
  H.push('<div class="strip">'
    + '<figure><figcaption>die Platte, die flux gesehen hat (768×512, randlos, Tiefpassanteil 0.384)</figcaption>'
    + '<img src="ice_cavern_fix/plate.png" width="768"></figure></div>');
  H.push('<div class="strip">');
  for (const r of ['SHARD', 'SLAB', 'HEAP']) {
    H.push('<figure><figcaption>' + r + ' — Rueckgabe</figcaption><img src="ice_cavern_fix/' + r + '_kraw.png" width="620"></figure>');
  }
  H.push('</div></section>');

  // ---------------------------------------------------------- ABNAHME-TAB
  H.push('<section><h2 class="gate">3e — Kachelung und Dekorrelation der vier neuen Saetze</h2>');
  const nn = fs.existsSync(path.join(ST, '_underground_new_numbers.txt'))
    ? fs.readFileSync(path.join(ST, '_underground_new_numbers.txt'), 'utf8') : '';
  H.push('<pre style="color:#c9d1d9;font-size:11px;line-height:1.45;overflow-x:auto;border:1px solid #30363d;padding:10px">'
    + nn.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>');
  H.push('</section>');

  // -------------------------------------------------------------- FAMILIE
  H.push('<section><h2 class="fam">4 — Die Familie heute (Ausgangszustand)</h2>');
  H.push('<p class="lat">Zustand aus git-Historie UND Messwerten. Blowout hat als Zustandsindikator zuletzt versagt '
    + '(silicate_plain ist mit 47–70 % ausgeliefert); verlaesslicher war das <b>Nahtverhaeltnis</b> — unbearbeitet 2.85–4.94, fertig 1.04–1.57. '
    + 'Hier traegt es teilweise: rock_layer 2.53, deep_stone 2.38, ice_cavern 2.60 sind unbearbeitet — aber <code>mineral_vein</code> liegt bei 1.19 und '
    + 'ist trotzdem unbearbeitet, und das FERTIGE <code>cave_floor</code> liegt bei 2.72. <b>Die git-Historie ist hier die harte Zahl, die Naht die weiche.</b></p>');
  for (const [b, note] of FAM) {
    const bufs = [0, 1, 2, 3].map((i) => fs.readFileSync(tileF(b, i)));
    await fields(bufs, '_underground_cmp-' + b);
    H.push(`<h2 class="ref">${b}</h2><p class="lat">${note}</p>`);
    H.push('<div class="strip">'
      + `<figure><figcaption>Slots</figcaption><img src="_underground_cmp-${b}_slots.png" width="1100"></figure>`
      + `<figure><figcaption>Slots — VAKUUM</figcaption><img src="_underground_cmp-${b}_slots_vac.png" width="1100"></figure>`
      + '</div>');
    H.push('<div class="strip">'
      + `<figure><figcaption>2×2-Repeat</figcaption><img src="_underground_cmp-${b}_rep.png" width="700"></figure>`
      + `<figure><figcaption>Zufallsfeld</figcaption><img src="_underground_cmp-${b}_field.png" width="700"></figure>`
      + `<figure><figcaption>SPIELSKALA</figcaption><img src="_underground_cmp-${b}_play.png" width="700"></figure>`
      + `<figure><figcaption>SPIELSKALA — VAKUUM</figcaption><img src="_underground_cmp-${b}_play_vac.png" width="700"></figure>`
      + '</div>');
    H.push('<table><tr><th>slot</th>' + MHDR.map((h) => `<th>${h}</th>`).join('') + '</tr>');
    for (let i = 0; i < 4; i++) {
      const m = await metrics(bufs[i]);
      H.push(`<tr><td>${b}_${i}</td>` + mrow(m).map((v) => `<td>${v}</td>`).join('') + '</tr>');
    }
    H.push('</table>');
  }
  H.push('</section>');

  // ------------------------------------------------------------ z-EBENEN
  H.push('<section><h2 class="plan">5 — Wer steht auf DERSELBEN z-Ebene?</h2>');
  H.push('<p class="lat">Aus <code>Docs/planet-biomes-by-type.md</code>. Nachbarschaft ist die z-EBENE, nicht der Koerper (LESSONS §6).</p>');
  H.push(`<table>
<tr><th>Untergrund-Familie</th><th>Tiefe</th><th>steht gemeinsam auf einer z-Ebene</th></tr>
<tr><td>Standard</td><td>1–3</td><td>rock_layer · mineral_vein · cave_floor</td></tr>
<tr><td>Standard</td><td>4 … Schwelle−1</td><td>mineral_vein · deep_stone</td></tr>
<tr><td>Vulkanisch</td><td>1–2</td><td>rock_layer · mineral_vein</td></tr>
<tr><td>Vulkanisch</td><td>3 … Schwelle−1</td><td>mineral_vein · magma_pocket</td></tr>
<tr><td>Eisig</td><td>1–5</td><td>ice_cavern · mineral_vein</td></tr>
<tr><td>Eisig</td><td>≥6</td><td>deep_stone (allein)</td></tr>
<tr><td>Tiefer Kern</td><td>≥ Schwelle</td><td>magma_pocket · lava_flow</td></tr>
</table>`);
  H.push(`<table>
<tr><th>Paar</th><th>gemeinsame z-Ebene?</th><th>heute max|NCC|</th><th>Folge</th></tr>
<tr class="bad"><td>rock_layer × deep_stone</td><td>NEIN</td><td>0.799</td><td>duerfen sich beliebig aehneln — hoechster Wert der Familie, folgenlos</td></tr>
<tr class="bad"><td>deep_stone × ice_cavern</td><td>NEIN</td><td>0.534</td><td>der bekannte „Zwilling“ — folgenlos</td></tr>
<tr class="bad"><td>rock_layer × ice_cavern</td><td>NEIN</td><td>0.508</td><td>folgenlos</td></tr>
<tr><td>mineral_vein × rock_layer</td><td>JA</td><td>0.255</td><td>muss getrennt bleiben</td></tr>
<tr><td>mineral_vein × deep_stone</td><td>JA</td><td>0.292</td><td>muss getrennt bleiben</td></tr>
<tr><td>mineral_vein × cave_floor</td><td>JA</td><td>0.174</td><td>muss getrennt bleiben</td></tr>
<tr><td>mineral_vein × magma_pocket</td><td>JA</td><td>0.157</td><td>muss getrennt bleiben</td></tr>
<tr><td>mineral_vein × ice_cavern</td><td>JA</td><td>0.281</td><td>muss getrennt bleiben</td></tr>
<tr><td>rock_layer × cave_floor</td><td>JA</td><td>0.164</td><td>muss getrennt bleiben</td></tr>
</table>`);
  H.push('<p class="lat"><b>mineral_vein ist der Knotenpunkt</b> — es wird ueber <code>elevation &gt; 0.7</code> ausgeloest und steht damit in JEDER Tiefe '
    + 'jeder Familie. Es trifft alle fuenf anderen. <code>rock_layer</code> (Tiefe 1–3) und <code>deep_stone</code> (ab 4) begegnen sich nie — '
    + 'Rudis Annahme ist bestaetigt, und sie duerfen aus derselben Basis mit derselben Steinsorte gebaut werden.</p></section>');
  H.push('<p class="sub">Erzeugt von <code>scripts/tiles-underground-sheet.cjs</code>. Zahlen: <code>_underground_numbers.txt</code>, '
    + '<code>_underground_basis_numbers.txt</code>.</p>');

  fs.writeFileSync(path.join(ST, '_underground_sheet.html'), H.join('\n') + '\n');
  console.log('-> ' + path.join(ST, '_underground_sheet.html'));
})();
