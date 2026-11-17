// Baut _uebergang_vergleich.html aus der Vorlage + den Zahlen aus data.json.
// Aus dem Repo-Wurzelverzeichnis aufrufen.
const fs = require('fs');
const path = require('path');
const OUT = path.join('assets', 'style-test', 'tiles');
const TPL = process.argv[2] || path.join(__dirname, 'tiles-uebergang-bogen.tpl.html');
const d = JSON.parse(fs.readFileSync(path.join(OUT, '_uebergang_data.json'), 'utf8'));
const f1 = (x) => (x == null || Number.isNaN(x) ? '—' : x.toFixed(1));
const f2 = (x) => (x == null || Number.isNaN(x) ? '—' : x.toFixed(2));
const f3 = (x) => (x == null || Number.isNaN(x) ? '—' : x.toFixed(3));
const mb = (b) => (b / 1048576).toFixed(2);
const apk = d.kosten.apkB;
const pct = (b) => ((b / apk) * 100).toFixed(1);

const STATE_TITLE = {
  heute: ['1 · heute', 'keine Übergänge — die Biomgrenze ist die Rautenkante', 's1'],
  glatt: ['2 · Alpha glatt', 'smoothstep-Rampe 0.55 zur unteren Kante', 's2'],
  rausch: ['3 · Alpha verrauscht', 'Rampe 0.95, Rauschamplitude 1.3, in Weltkoordinaten ausgewertet', 's3'],
  gebacken: ['4 · gebacken', 'echte 512×256-Übergangskachel, 3 Rauschvarianten je Kante', 's4'],
};
const SCALE = [
  ['512', '512er Kachelpaarung — eine Grenzzelle mit ihren beiden unteren Nachbarn, Originalauflösung'],
  ['feld', 'gemischtes Feld, 15×15 Zellen bei 96×48'],
  ['spiel', 'Spielskala 48×24, für die Ansicht 2× nearest vergrößert'],
];

// ── Urteile. Ein Satz je Zustand: trägt es? ──────────────────────
const V = {
  'rocky_desert__mesa': {
    kopf: `<b>Der Kontrollfall für Rudis Materialregel.</b> Mit d = 0.46 das <b>engste Paar</b> der ganzen Kalibrierliste; beide Mineralisch, beide auf DESERT. Wenn Alpha irgendwo reicht, dann hier.`,
    heute: ['bad', 'Trägt nicht — die Grenze ist eine gerade Linie quer durch die Wüste, und weil beide Flächen dasselbe Material sind, gibt es für eine gerade Linie überhaupt keinen Anlass.'],
    glatt: ['', 'Trägt bereits: der Sprung verschwindet, und weil sich die beiden Kacheln ähnlich sehen, fällt gar nicht auf, dass der Umriss gerade geblieben ist — auf Spielskala ist die Grenze kaum noch zu finden.'],
    rausch: ['', 'Trägt am besten: die Risse der Mesa laufen in den sandigen Grund aus, die Brocken werden teilweise überdeckt, und es entsteht kein Motiv, das es nicht geben könnte.'],
    gebacken: ['bad', '<b>Trägt hier NICHT — der lehrreichste Einzelbefund dieses Bogens.</b> Der Saum zeichnet eine dunkle Fuge, wo im Material keine ist, und erfindet genau die Kante wieder, die die Überblendung eben abgeschafft hatte. Bei familieninternen Paaren ist Backen nicht nur teurer, sondern <i>schlechter</i>.'],
  },
  'beach__ocean': {
    kopf: `<b>Rudis Fluidfall.</b> Verschiedene Familien, aber der Verlauf bildet einen realen Zustand ab: Wasser über Sand <i>ist</i> flaches Wasser. Chroma-Senke 12.9 Punkte über 39 % der Rampe — die Zahl, die einen „schmutzigen Schleier“ vorhersagte.`,
    heute: ['bad', 'Trägt nicht — die Küste ist eine Treppe aus 45°-Stufen, das einzige Motiv, das es an einem Strand mit Sicherheit nicht gibt.'],
    glatt: ['warn', 'Trägt halb: die Entsättigung liest das Auge als <b>nassen Sand</b>, die vorhergesagte Chroma-Senke ist also kein Fehler, sondern der Effekt — aber die Treppe steht unverändert (Auslenkung 0.6 px).'],
    rausch: ['', 'Trägt: die Küste zerfällt in Buchten und liest sich als Flachwasserzone, ohne gemalte Brandung — genau Rudis Vermutung. Auf Spielskala hält es.'],
    gebacken: ['warn', 'Trägt ebenfalls, ist aber ein <i>anderes</i> Motiv: eine scharfe Wasserlinie mit Schaumsaum statt einer Wattzone. Beides ist richtig; weil das gerechnete Bild nichts kostet, ist der gebackene Weg hier nur teurer, nicht besser.'],
  },
  'beach__plains': {
    kopf: `<b>Der Fall, an dem 12 der 20 harten Paare hängen.</b> Sand gegen Bewuchs, Familienwechsel ohne Verlauf. Chroma-Senke <b>0</b> — die Kennzahl, die den Schleier vorhersagen sollte, schweigt ausgerechnet bei dem Paar, das Rudi hart nennt.`,
    heute: ['warn', 'Trägt nicht, stört hier aber am wenigsten: eine Vegetationsgrenze <i>darf</i> eine Linie sein — sie darf nur keine 45°-Linie sein.'],
    glatt: ['bad', 'Trägt nicht: der Bewuchs wird durchsichtig statt dünner. Halbtransparente Grasbüschel über dunklem Sand sind kein Zustand, den es gibt.'],
    rausch: ['warn', 'Trägt knapp: bei dieser Rauschstärke liest es sich als ausdünnender Bewuchs, also als Dünengras, und der Fehler wird zum Motiv. Ein sichtbarer Fehler ist es nicht — <b>der Bogen kann Rudis Urteil hier weder bestätigen noch widerlegen.</b>'],
    gebacken: ['', 'Trägt am saubersten: die Büschel stehen einzeln über der Linie, jeder Halm ist deckend, der Fußschatten macht aus der Grenze eine Bewuchskante. Der Abstand zum verrauschten Alpha ist aber klein — es ist eine Motiventscheidung, kein Fehler, der behoben wird.'],
  },
  'basalt_plain__lava_flow': {
    kopf: `<b>Rudis ausdrückliche Ausnahme.</b> Beide vulkanisch, also nach der Familienregel weich — und trotzdem hart gesetzt. Begründung war Struktur-Ghosting: min(MESO) 12.1, beide Kacheln kräftig strukturiert.`,
    heute: ['warn', 'Trägt nicht, fällt aber kaum auf: die Plattenzeichnung des Basalts bricht an einer Kante ohnehin ab, eine gerade Linie ist hier das kleinste Problem.'],
    glatt: ['bad', '<b>Trägt nicht — hier ist das Ghosting zu sehen.</b> Plattennähte und Lava-Adern liegen übereinander, das liest sich als Doppelbelichtung, nicht als Übergang.'],
    rausch: ['bad', 'Trägt nicht: das Rauschen macht die Doppelbelichtung unregelmäßiger, nicht schwächer. Glühende Adern scheinen durch eine erstarrte Platte hindurch.'],
    gebacken: ['', '<b>Trägt, und nur das.</b> Jeder Pixel trägt genau ein Material: die Platte endet an einer facettierten Kante, die Lava beginnt dahinter. <b>Rudis Ausnahme ist damit im Bild bestätigt</b> — und ihr Grund ist nicht Geschmack, sondern dass zwei kräftige Muster sich nicht mischen lassen.'],
  },
  'mineral_vein__ice_cavern': {
    kopf: `<b>Der einzige harte Untergrundfall, und beide Kacheln sind neu</b> (UNDERGROUND-Runde, 5./6. September). Sie treffen sich auf der eisigen Familie, Tiefe −1 bis −4. Das zweite hart gesetzte Paar dieser Gruppe, <code>deep_stone|ice_cavern</code>, ist bei dieser Prüfung <b>weggefallen</b>: die beiden können auf keiner Tiefe koexistieren.`,
    heute: ['bad', 'Trägt nicht: eine gerade Linie zwischen Erzbrocken und Eiskristallen sieht aus wie ein Kartenfehler.'],
    glatt: ['bad', 'Trägt nicht: dasselbe Ghosting wie beim Basalt, min(MESO) 12.6 — halbtransparente Eiskegel über Erzknollen.'],
    rausch: ['bad', 'Trägt nicht, und aus einem Grund, der über dieses Paar hinausgeht: die Eiskegel sind <b>Erhebungen mit eingebackenem Schatten</b>, und eine Erhebung lässt sich nicht zur Hälfte einblenden — sie wird zum Geist.'],
    gebacken: ['', 'Trägt: die Bruchkante mit dunkler Fuge liest sich als Gesteinsstufe, und jeder Kristall steht entweder ganz da oder gar nicht.'],
  },
};

const ORDER = ['rocky_desert__mesa', 'beach__ocean', 'beach__plains', 'basalt_plain__lava_flow', 'mineral_vein__ice_cavern'];
const HEAD = {
  'rocky_desert__mesa': '3 &nbsp; <code>rocky_desert</code> ↔ <code>mesa</code> — optisch nah, gleiche Familie',
  'beach__ocean': '4 &nbsp; <code>beach</code> ↔ <code>ocean</code> — Fluid mit sinnvollem Verlauf',
  'beach__plains': '5 &nbsp; <code>beach</code> ↔ <code>plains</code> — hart: Vegetationslinie',
  'basalt_plain__lava_flow': '6 &nbsp; <code>basalt_plain</code> ↔ <code>lava_flow</code> — hart: Deckenrand, Rudis Ausnahme',
  'mineral_vein__ice_cavern': '7 &nbsp; <code>mineral_vein</code> ↔ <code>ice_cavern</code> — hart: Bruchkante unter Tage',
};

const byKey = {};
for (const r of d.results) byKey[r.key] = r;

function pairSection(key) {
  const r = byKey[key], v = V[key];
  const L = [`<section>`, `<h2>${HEAD[key]}</h2>`, `<p class="sub">${v.kopf}</p>`];
  L.push(`<table><tr><th>Kennzahl</th><th>Wert</th><th style="text-align:left">wozu</th></tr>` +
    `<tr><td>optischer Abstand d</td><td>${f2(r.optik.d)}</td><td style="text-align:left">LEVEL ${f2(r.optik.level)} · FARBE ${f2(r.optik.colour)} · TEXTUR ${f2(r.optik.texture)}</td></tr>` +
    `<tr><td>MESO beider Kacheln</td><td>${f1(r.mesoA)} / ${f1(r.mesoB)}</td><td style="text-align:left">min ${f1(Math.min(r.mesoA, r.mesoB))} — ab ~12 ist Struktur-Ghosting zu erwarten</td></tr>` +
    `<tr><td>Chroma-Senke</td><td>${f1(r.chroma.dip)}</td><td style="text-align:left">über ${(r.chroma.band * 100).toFixed(0)} % der Rampe, tiefster Punkt bei t = ${f2(r.chroma.tDip)}</td></tr>` +
    `</table>`);
  for (const st of ['heute', 'glatt', 'rausch', 'gebacken']) {
    const [ttl, sub, cls] = STATE_TITLE[st];
    const m = r.metrics[st];
    L.push(`<div class="state ${cls}"><b>${ttl}</b> — ${sub} &nbsp;·&nbsp; geänderte Bildfläche ${f2(m.diff.area)} % · mittlere Änderung ${f1(m.diff.mean)} Luma · Zellgleichheit ${f3(m.repeat)}</div>`);
    L.push('<div class="row">');
    for (const [sc, cap] of SCALE)
      L.push(`<figure><figcaption>${cap}</figcaption><img src="${r.images[st + '_' + sc]}" alt=""></figure>`);
    L.push('</div>');
    const [vc, txt] = v[st];
    L.push(`<div class="verdict ${vc}">${txt}</div>`);
  }
  L.push('</section>');
  return L.join('\n');
}

// ── Kontur-Tabelle ───────────────────────────────────────────────
const K = d.kontur;
let kt = '<table><tr><th>Alphakurve / Silhouette</th><th>Kontur-Index</th><th>Auslenkung sd</th><th>Spanne</th><th>mittl. Abstand zur Kante</th></tr>';
const krow = (n, o, hl) => `<tr${hl ? ' class="hl"' : ''}><td>${n}</td><td>${f2(o.index)}</td><td>${f1(o.defl.sd)} px</td><td>${f1(o.defl.max)} px</td><td>${f1(o.defl.mean)} px</td></tr>`;
kt += krow('glatte Rampe 0.55', K.glatt, true);
kt += krow('verrauschte Rampe 0.95 / amp 1.3', K.rausch);
for (const k of ['wasser', 'vegetation', 'decke', 'bruch'])
  kt += krow('gebackene Silhouette „' + k + '“', K['gebacken_' + k]);
kt += '</table>';

// ── Zellgleichheit-Tabelle ───────────────────────────────────────
let rt = '<table><tr><th>Paar</th><th>Alpha glatt</th><th>Alpha verrauscht</th><th>gebacken K=3</th><th>gebacken K=1</th></tr>';
for (const key of ORDER) {
  const r = byKey[key];
  rt += `<tr><td>${r.a} | ${r.b}</td><td>${f3(r.metrics.glatt.repeat)}</td><td>${f3(r.metrics.rausch.repeat)}</td>` +
    `<td>${f3(r.metrics.gebacken.repeat)}</td><td class="no">${f3(r.metrics.gebackenK1.repeat)}</td></tr>`;
}
rt += '</table>';

// ── Kosten-Tabelle ───────────────────────────────────────────────
const per = d.kosten.bakeAvgB;
const rows = [
  ['<b>Gerechnete Blende oder Silhouette</b> (kein Asset)', '0', '0 MB', '0 %', 'deckt <b>alle 128</b> wirksamen Paare, benutzt die echte Nachbarvariante, Rauschen in Weltkoordinaten'],
  ['gebacken, nur die 20 harten, je 1 Variante', '120', mb(120 * per) + ' MB', '+' + pct(120 * per) + ' %', 'Grundvariante an jeder Grenze eingefroren, dieselbe Silhouette an jeder Zelle'],
  ['… mit 3 Rauschvarianten je Kante', '360', mb(360 * per) + ' MB', '+' + pct(360 * per) + ' %', 'gegen die Kette gleicher Lappen — mildert sie, behebt sie nicht (Zellgleichheit 0.67 → 0.43)'],
  ['… mit 4 Grundvarianten statt Rauschvarianten', '480', mb(480 * per) + ' MB', '+' + pct(480 * per) + ' %', 'gegen die Kette gleicher Böden'],
  ['<b>… beides, wie es sein müsste</b>', '<b>1 440</b>', '<b>' + mb(1440 * per) + ' MB</b>', '<b>+' + pct(1440 * per) + ' %</b>', 'streng korrekt wären sogar 4×4 Kombinationen der Grundvarianten'],
  ['gebacken, alle 128 Paare, je 1 Variante', '768', mb(768 * per) + ' MB', '+' + pct(768 * per) + ' %', 'die alte Rechnung, zum Vergleich'],
];
let ct = '<table><tr><th>Weg</th><th>Assets</th><th>Speicher</th><th>APK 103,0 MB</th><th style="text-align:left">Anmerkung</th></tr>';
for (const [a, b, c, e, f] of rows)
  ct += `<tr${a.startsWith('<b>') ? ' class="hl"' : ''}><td>${a}</td><td>${b}</td><td>${c}</td><td>${e}</td><td style="text-align:left">${f}</td></tr>`;
ct += `<tr><td colspan="5" style="text-align:left;color:#8b949e">Bezug: alle 220 Biomkacheln zusammen ${mb(d.kosten.tilesTotalB)} MB — die 20 harten Paare mit allen Varianten wären <b>${(1440 * per / d.kosten.tilesTotalB).toFixed(1)}×</b> so viel wie sämtliche Biomkacheln des Spiels.</td></tr>`;
ct += '</table>';

let html = fs.readFileSync(TPL, 'utf8');
html = html.replace('<!--KONTUR-->', kt);
html = html.replace('<!--REPEAT-->', rt);
html = html.replace('<!--KOSTEN-->', ct);
html = html.replace('<!--PAARE-->', ORDER.map(pairSection).join('\n\n'));
html = html.replace('<!--TABELLE-->', fs.readFileSync(path.join(OUT, '_uebergang_tabelle.html'), 'utf8'));
if (html.includes('<!--')) console.warn('WARNUNG: unersetzter Platzhalter');
fs.writeFileSync(path.join(OUT, '_uebergang_vergleich.html'), html);
console.log('geschrieben: assets/style-test/tiles/_uebergang_vergleich.html', (html.length / 1024).toFixed(0), 'KB');
