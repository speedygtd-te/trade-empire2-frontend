/**
 * Baut den Kontaktbogen fuer die Fabrik-BASIS-Kandidaten (Stufe 1) und PRUEFT
 * anschliessend JEDE src-Referenz gegen das Dateisystem.
 *
 * Der vorige Lauf (factory-split-family.html) zeigte leere Rahmen, weil Pfade
 * eine Verzeichnisebene daneben lagen. Deshalb wird hier jeder Pfad relativ zu
 * assets/style-test/ aufgeloest und vor dem Schreiben verifiziert; am Ende
 * steht die Zahl der geprueften Referenzen.
 *
 * Usage: node scripts/factory-base-sheet.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const DIR_SHEET = path.join(ROOT, 'assets', 'style-test');
const OUT = path.join(DIR_SHEET, 'factory-base-family.html');

const results = JSON.parse(
  fs.readFileSync(path.join(DIR_SHEET, 'modules', 'factory_base_results.json'), 'utf8'),
);
const prompts = JSON.parse(
  fs.readFileSync(path.join(DIR_SHEET, 'modules', 'factory_base_prompts.json'), 'utf8'),
);
const byTag = new Map(prompts.candidates.map((c) => [c.tag, c]));
const order = prompts.candidates.map((c) => c.tag);
const meta = new Map(results.results.map((r) => [r.tag, r]));

const EXISTING = [
  { name: 'factory', src: '../../src/assets/modules/factory/factory_0.webp' },
  {
    name: 'electronics_factory',
    src: '../../src/assets/modules/electronics_factory/electronics_factory_0.webp',
  },
  {
    name: 'housing_factory',
    src: '../../src/assets/modules/housing_factory/housing_factory_0.webp',
  },
];

/**
 * Steigung der beiden unteren Silhouettenkanten. Bei sauberer 2:1-Iso muss sie
 * +0.5 / -0.5 betragen und SYMMETRISCH sein — asymmetrisch heisst gedreht.
 * Diagnostik, kein Abnahmekriterium: Rampen, Treppen und Vorbauten verfaelschen
 * die jeweilige Seite.
 */
async function isoSlopes(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const bottom = new Array(W).fill(-1);
  for (let x = 0; x < W; x++)
    for (let y = H - 1; y >= 0; y--)
      if (data[(y * W + x) * ch + 3] > 128) { bottom[x] = y; break; }
  let bx = 0;
  for (let x = 0; x < W; x++) if (bottom[x] > bottom[bx]) bx = x;
  const fit = (a, b) => {
    let n = 0, sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let x = a; x <= b; x++) { if (bottom[x] < 0) continue; n++; sx += x; sy += bottom[x]; sxy += x * bottom[x]; sxx += x * x; }
    return n < 20 ? NaN : (n * sxy - sx * sy) / (n * sxx - sx * sx);
  };
  return {
    l: fit(Math.round(bx * 0.25), Math.round(bx * 0.85)),
    r: fit(Math.round(bx + (W - bx) * 0.15), Math.round(bx + (W - bx) * 0.75)),
  };
}

const slopes = new Map();
const fmt = (v) =>
  !v || Number.isNaN(v.l) || Number.isNaN(v.r)
    ? 'n/a'
    : `${v.l >= 0 ? '+' : ''}${v.l.toFixed(3)} / ${v.r.toFixed(3)}`;

const srcs = [];
const img = (src, attrs = '') => {
  srcs.push(src);
  return `<img src="${src}" ${attrs}>`;
};

const sizeRow = (px) => `
  <h3>${px} px</h3>
  <div class="row">
    ${order
      .map(
        (t) =>
          `<figure class="new">${img(`modules/factory_base_${t}.png`, `width="${px}" height="${px}" alt="${t}"`)}<figcaption>${t}</figcaption></figure>`,
      )
      .join('\n    ')}
  </div>
  <div class="row old">
    ${EXISTING.map(
      (e) =>
        `<figure>${img(e.src, `width="${px}" height="${px}" alt="${e.name}"`)}<figcaption>${e.name}</figcaption></figure>`,
    ).join('\n    ')}
  </div>`;

const detail = (t) => {
  const c = byTag.get(t);
  const m = meta.get(t) || {};
  return `
  <section class="card">
    <h3>${t} <span class="muted">— ${c.axis}</span></h3>
    <div class="pair">
      <div class="imgwrap">${img(`modules/factory_base_${t}.png`, `alt="${t}"`)}<span class="cap">Kandidat · ${m.size || '?'}px</span></div>
      <div class="imgwrap">${img(`modules/factory_base_${t}_zone.png`, `alt="${t} Zone"`)}<span class="cap">freie Fertigungsflaeche (cyan)</span></div>
    </div>
    <dl>
      <dt>Lage</dt><dd>${c.meta.pos}</dd>
      <dt>Groesse</dt><dd>${c.meta.size}</dd>
      <dt>Rahmen</dt><dd>${c.meta.frame}</dd>
      <dt>Kopffreiheit</dt><dd>${c.meta.head}</dd>
      <dt>Iso-Achse</dt><dd>Unterkanten ${fmt(slopes.get(t))} <span class="muted">(Soll +0.500 / -0.500, symmetrisch)</span></dd>
      <dt>Seed</dt><dd>${c.seed}</dd>
    </dl>
  </section>`;
};

const buildHtml = () => `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Fabrik-Basis-Kandidaten — Stufe 1 (Buehne fuer den Merge)</title>
<style>
  body { background:#14161a; color:#d6dae0; font-family:system-ui,sans-serif; margin:0; padding:24px 28px 80px; }
  h1 { color:#67e8f9; font-size:22px; margin:0 0 6px; }
  h2 { color:#67e8f9; font-size:17px; margin:34px 0 10px; border-bottom:1px solid #2a2f37; padding-bottom:6px; }
  h3 { font-size:14px; margin:16px 0 8px; color:#9fb0c0; font-weight:600; }
  p.lead { max-width:860px; line-height:1.55; color:#aab4c0; font-size:13px; }
  .row { display:flex; flex-wrap:wrap; gap:14px; align-items:flex-end; background:#1b1e24; padding:12px; border-radius:8px; }
  .row.old { background:#241b1b; margin-top:8px; }
  figure { margin:0; text-align:center; }
  figure img { display:block; background:#0e1013; border:1px solid #2a2f37; border-radius:4px; }
  figure.new img { border-color:#0e7490; }
  figcaption { font-size:10px; color:#8b97a5; margin-top:4px; font-family:monospace; }
  .card { background:#1b1e24; border:1px solid #2a2f37; border-radius:10px; padding:14px; margin:14px 0; }
  .card h3 { color:#67e8f9; font-size:15px; margin:0 0 10px; }
  .muted { color:#8b97a5; font-weight:400; font-size:13px; }
  .pair { display:flex; gap:14px; flex-wrap:wrap; }
  .imgwrap { position:relative; }
  .imgwrap img { width:330px; height:330px; object-fit:contain; background:#0e1013; border:1px solid #2a2f37; border-radius:6px; }
  .cap { display:block; font-size:10px; color:#8b97a5; font-family:monospace; margin-top:4px; }
  dl { display:grid; grid-template-columns:auto 1fr; gap:2px 12px; font-size:12px; margin:10px 0 0; max-width:520px; }
  dt { color:#8b97a5; } dd { margin:0; }
  .warn { border-left:3px solid #f59e0b; padding:8px 12px; background:#221c11; border-radius:0 6px 6px 0; font-size:13px; max-width:860px; line-height:1.5; }
  code { font-family:monospace; color:#fbbf24; }
  .warn.pick { border-left-color:#22d3ee; background:#0f2126; }
</style>
</head>
<body>
<h1>Fabrik-Basis-Kandidaten — Stufe 1</h1>
<p class="lead">
  Die Basis ist <b>kein fertiges Bild, sondern eine Buehne</b>: In Stufe 3/4 werden echte
  Produkt-Assets in einen „in construction“-Zustand gewandelt und per Flux-Edit auf die
  <b>freie Fertigungsflaeche</b> montiert. Gewaehlt wird also nicht die huebscheste Fabrik,
  sondern die, in die sich am besten etwas einsetzen laesst — gross genug fuer alle
  <b>sechs</b> Anlagen (Huellenplatten flach+breit, Triebwerke lang, Waffen schlank,
  Industriemaschinen klobig, Elektronik klein+flach, Wohnmodule als Quader).
</p>
<div class="warn">
  Die drei bestehenden Fabriken stehen hier als <b>Vergleich — das, was ersetzt wird</b>,
  nicht als Zielbild (roter Kasten). Sie laufen auch untereinander auseinander:
  <code>factory</code> ist dunkel-violett mit messingfarbenen Baendern statt gelben
  Warnstreifen, <code>electronics_factory</code> hell-stahlblau mit gelbem Deckenband,
  <code>housing_factory</code> mittelblau auf sandfarbenem Deck.
</div>

<div class="warn pick">
  <b>Vorauswahl des Agenten (Rudi entscheidet):</b>
  <b>b11</b> — grosse, gelb umrandete Flaeche ganz vorn, nichts darueber, Empore dahinter
  liefert den Fabrik-Kontext, ohne den Montageplatz zu verdecken; nimmt auch einen hohen
  Wohnmodul-Quader.
  <b>b1</b> — die groesste helle Freiflaeche ueberhaupt, Portalkran macht die Fabrik auf
  einen Blick lesbar; der Kranbalken liegt allerdings ueber der linken Bildhaelfte.
  <b>b15</b> — unmissverstaendlich markiertes Feld in der Bildmitte; der erhoehte Deckrand
  schneidet ein eingesetztes Objekt unten an (erdet es, kann aber stoeren).
  Reserve: <b>b10</b> (groesstes voellig freies Deck, dafuer am wenigsten „Fabrik“),
  <b>b12</b> (sauberste Iso-Symmetrie +0.507 / -0.507).
</div>
<div class="warn">
  <b>Iso-Validierung:</b> Dimensionen, Tight Crop, Alpha und Content-Coverage bestehen bei
  allen 16. Die Pruefung „Lighting upper-left“ schlaegt bei 11 von 16 fehl — sie vergleicht
  das obere linke Bildviertel mit dem unteren rechten. Bei einer Bucht ist oben links die
  <i>beschattete Rueckwand</i> und unten rechts der <i>helle Boden</i>; die Kennzahl misst
  hier also genau das Gegenteil dessen, was sie soll. Beleg: das ausgelieferte
  <code>electronics_factory</code> und das vorige <code>hull_forge_0</code> fallen an
  derselben Pruefung durch. Nachgeneriert wurde deshalb nicht — ein „Bestehen“ hiesse,
  die Montageflaeche abzudunkeln.
</div>

<h2>1 — Spielgroessen (48 / 96 / 144 px)</h2>
${sizeRow(48)}
${sizeRow(96)}
${sizeRow(144)}

<h2>2 — Kandidaten in voller Aufloesung, mit markierter Fertigungsflaeche</h2>
${order.map(detail).join('\n')}

<h2>3 — Bestand zum Vergleich (wird ersetzt)</h2>
<div class="row old">
  ${EXISTING.map(
    (e) =>
      `<figure><div class="imgwrap">${img(e.src, `alt="${e.name}"`)}</div><figcaption>${e.name}</figcaption></figure>`,
  ).join('\n  ')}
</div>
</body>
</html>
`;

(async () => {
  for (const t of order)
    slopes.set(t, await isoSlopes(path.join(DIR_SHEET, 'modules', `factory_base_${t}.png`)));
  fs.writeFileSync(OUT, buildHtml());
  console.log(`[save] ${path.relative(ROOT, OUT)}`);

  // ── Pflichtpruefung: jede src-Referenz gegen das Dateisystem ──
  let ok = 0;
  const bad = [];
  for (const s of srcs) {
    const abs = path.resolve(DIR_SHEET, s);
    if (fs.existsSync(abs)) ok++;
    else bad.push(s);
  }
  console.log(`[check] ${srcs.length} src-Referenzen, ${ok} aufgeloest, ${bad.length} fehlend`);
  for (const b of bad) console.error(`  MISSING: ${b} -> ${path.resolve(DIR_SHEET, b)}`);
  if (bad.length) process.exit(1);
})();
