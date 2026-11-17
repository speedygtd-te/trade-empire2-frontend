/**
 * Baut die Vergleichsansicht fuer die Avatar-Freistellung.
 *
 * EINE HTML pro Vergleichszweck (Projektregel): assets/avatars/compare-cutout.html.
 * Neue Laeufe werden NICHT in eine zweite Datei geschrieben — dieses Script
 * scannt assets/avatars/transparent/report_*.json und baut die Datei komplett
 * neu, sodass alle vorhandenen Varianten in einer Ansicht untereinander stehen.
 *
 * Usage: node scripts/avatars/build-cutout-compare.cjs
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const AV = path.join(REPO, 'assets/avatars');
const TRANS = path.join(AV, 'transparent');
const OUT = path.join(AV, 'compare-cutout.html');

const ORDER = ['director_ashford', 'dr_vasquez', 'captain_bredvik'];
const NAMES = {
  director_ashford: 'Director Marcus Ashford',
  dr_vasquez: 'Dr. Elena Vasquez',
  captain_bredvik: 'Captain Jørn Bredvik',
};
const CURRENT_FILE = {
  director_ashford: 'e1HxFL9lYq9UwCqTi3tZa_39JGq3fQ.png',
  dr_vasquez: 'NW6tNFF70LppOtjNEgnlR_ZjzJ8v2i.png',
  captain_bredvik: null,
};

const ex = (p) => fs.existsSync(path.join(AV, p));
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function reports(id) {
  return fs.readdirSync(TRANS)
    .filter((f) => f.startsWith(`report_${id}_`) && f.endsWith('.json'))
    .map((f) => ({ file: f, data: JSON.parse(fs.readFileSync(path.join(TRANS, f), 'utf8')) }));
}

/** Eine Kachel: Bild ueber dem umschaltbaren Grund (.tp) oder opak (.op). */
function tile(src, label, note, transparent) {
  if (!src || !ex(src)) {
    return `<figure class="tile missing"><div class="frame">nicht vorhanden</div>
      <figcaption><b>${esc(label)}</b><span>${esc(note || '')}</span></figcaption></figure>`;
  }
  return `<figure class="tile"><div class="frame ${transparent ? 'tp' : 'op'}">
      <img src="${src}" alt="${esc(label)}" loading="lazy"></div>
    <figcaption><b>${esc(label)}</b><span>${esc(note || '')}</span></figcaption></figure>`;
}

/** Zoom-Paar: dasselbe transparente PNG vor hellem UND vor dunklem Grund. */
function zoomPair(src, label, note) {
  if (!src || !ex(src)) {
    return `<figure class="tile missing"><div class="frame">nicht vorhanden</div>
      <figcaption><b>${esc(label)}</b><span>${esc(note || '')}</span></figcaption></figure>`;
  }
  return `<figure class="tile zoom"><div class="pair">
      <div class="frame light"><img src="${src}" alt="${esc(label)} hell" loading="lazy"></div>
      <div class="frame dark"><img src="${src}" alt="${esc(label)} dunkel" loading="lazy"></div>
    </div><figcaption><b>${esc(label)}</b><span>${esc(note || '')}</span></figcaption></figure>`;
}

function metricRow(name, a) {
  if (!a) return `<tr><td>${esc(name)}</td><td colspan="5" class="muted">—</td></tr>`;
  const r = a.matteResolution ? a.matteResolution.rmse.map((v) => v.rmse).join(' / ') : '—';
  const halo = a.hairEdge.haloDelta;
  const haloCls = halo === null ? '' : Math.abs(halo) <= 3 ? 'good' : Math.abs(halo) <= 8 ? 'warn' : 'bad';
  const fil = a.strandiness.filamentPct;
  return `<tr>
    <td>${esc(name)}</td>
    <td>${esc(a.size)}</td>
    <td class="${fil > 0 ? 'good' : 'warn'}">${fil}%</td>
    <td>${a.hairEdge.softPerEdge}</td>
    <td class="${haloCls}">${halo}</td>
    <td class="mono">${r}</td>
  </tr>`;
}

function section(id) {
  const reps = reports(id);
  // Nicht reps[0] nehmen: der erste Report kann eine reine Checkpoint-Probe
  // (--direct-only) ohne .current/.direct sein.
  const all = reps.map((r) => r.data);
  const withCurrent = all.find((d) => d.current);
  const withDirect = all.find((d) => d.direct);
  const cur = CURRENT_FILE[id];
  const curNote = cur ? cur : 'noch nicht in Verwendung — für Bredvik existiert keine bisherige Freistellung';

  // Alle kontext-Varianten (light, contrast, light_a2, ...)
  const kontext = reps
    .filter((r) => r.data.variant && r.data.new)
    .map((r) => r.data)
    .sort((a, b) => (a.variant || '').localeCompare(b.variant || ''));

  const directs = [
    { suffix: '', label: 'NEU B — direkt, Checkpoint "Matting"' },
    { suffix: '_portrait', label: 'NEU B — direkt, Checkpoint "Portrait"' },
  ].filter((d) => ex(`transparent/${id}_direct${d.suffix}.png`));

  let html = `<section id="${id}">
  <h2>${esc(NAMES[id])}</h2>
  <p class="sub">Original 2048×2880 (kein Alpha, Figur steht in einer detailreichen dunklen Szene).</p>

  <h3>Gesamtansicht</h3>
  <div class="grid">
    ${tile(`transparent/${id}_orig_web.png`, 'Original mit Hintergrund', 'Ausgangsmaterial, unverändert', false)}
    ${cur
      ? tile(`transparent/${id}_current_web.png`, 'Bisherige Freistellung', `Ist-Zustand · ${cur}`, true)
      : tile(null, 'Bisherige Freistellung', curNote, true)}
    ${kontext.map((k) => tile(`flux-edit/${id}_${k.variant}_web.png`,
      `Flux-Edit — Uni-BG "${k.bgWord}"${k.attempt > 1 ? ` (Versuch ${k.attempt})` : ''}`, `${k.edit.w}×${k.edit.h} · Drift ${k.interiorDrift}`, false)).join('\n    ')}
    ${kontext.map((k) => tile(`transparent/${id}_${k.variant}_web.png`,
      `NEU C — Uni-BG "${k.bgWord}"${k.attempt > 1 ? ` (Versuch ${k.attempt})` : ''} freigestellt`, `${k.new.size}`, true)).join('\n    ')}
    ${directs.map((d) => tile(`transparent/${id}_direct${d.suffix}_web.png`, d.label, '2048×2880, Figur unangetastet', true)).join('\n    ')}
  </div>

  <h3>Haarkante — Zoom, jeweils vor hellem und vor dunklem Grund</h3>
  <p class="sub">Ein Halo fällt nur vor dunklem Grund auf, ein dunkler Saum nur vor hellem. Deshalb beides.</p>
  <div class="grid zooms">
    ${tile(`transparent/${id}_orig_zoom.png`, 'Original', 'zum Abgleich der Strähnen', false)}
    ${cur
      ? zoomPair(`transparent/${id}_current_zoom.png`, 'Bisherige Freistellung', 'Ist-Zustand')
      : zoomPair(null, 'Bisherige Freistellung', curNote)}
    ${kontext.map((k) => zoomPair(`transparent/${id}_${k.variant}_zoom.png`,
      `NEU C — Uni-BG "${k.bgWord}"${k.attempt > 1 ? ` (Versuch ${k.attempt})` : ''}`, `aus ${k.edit.w}×${k.edit.h} hochskaliert`)).join('\n    ')}
    ${kontext.map((k) => zoomPair(`transparent/${id}_${k.variant}_fullres_zoom.png`,
      `NEU C-fullres — "${k.bgWord}"${k.attempt > 1 ? ` (Versuch ${k.attempt})` : ''} auf das Original`, 'volle Auflösung, Maske aus dem Edit')).join('\n    ')}
    ${directs.map((d) => zoomPair(`transparent/${id}_direct${d.suffix}_zoom.png`, d.label, 'volle Auflösung')).join('\n    ')}
  </div>
  <p class="sub warn-line">&#9888; <b>NEU C-fullres ist unbrauchbar</b> und steht nur zur Dokumentation hier:
  der Flux-Edit &auml;ndert das Seitenverh&auml;ltnis (880&times;1184 = 0,743 statt 0,711), deshalb sitzt die
  &uuml;bertragene Maske versetzt und der alte Szenen-Hintergrund bleibt sichtbar.</p>

  <h3>Kennzahlen der Haarpartie</h3>
  <table>
    <thead><tr>
      <th>Variante</th><th>Auflösung</th>
      <th title="Anteil teiltransparenter Pixel, die als freistehende Strähne im transparenten Bereich liegen. 0 % = keine einzige Strähne, nur ein weicher Blob-Rand.">Strähnen</th>
      <th title="Weiche Pixel pro harter Kantenpixel — Breite des Übergangs.">Kantenweichheit</th>
      <th title="Luminanz der teiltransparenten Pixel minus der angrenzenden opaken. Positiv = heller Halo, negativ = dunkler Saum. |Δ| ≤ 3 ist unauffällig.">Halo Δ</th>
      <th title="RMSE nach Downscale/Upscale des Alphakanals um k = 2/4/8/16/32. Kleine Werte = die Matte trägt auf dieser Skala keine Information mehr, wurde also klein gerechnet und hochskaliert.">Matte-Detail k=2/4/8/16/32</th>
    </tr></thead>
    <tbody>
      ${withCurrent ? metricRow('Bisherige Freistellung', withCurrent.current) : `<tr><td>Bisherige Freistellung</td><td colspan="5" class="muted">${esc(curNote)}</td></tr>`}
      ${kontext.map((k) => metricRow(`NEU C — Uni-BG "${k.bgWord}"${k.attempt > 1 ? ` (Versuch ${k.attempt})` : ''}`, k.new)).join('\n      ')}
      ${kontext.map((k) => metricRow(`NEU C-fullres — "${k.bgWord}"${k.attempt > 1 ? ` (Versuch ${k.attempt})` : ''}`, k.newFullres)).join('\n      ')}
      ${directs.map((d) => {
        const rp = path.join(TRANS, `report_${id}_direct${d.suffix}.json`);
        let a = null;
        if (d.suffix === '' && withDirect) a = withDirect.direct;
        else if (fs.existsSync(rp)) a = JSON.parse(fs.readFileSync(rp, 'utf8'));
        return metricRow(d.label, a);
      }).join('\n      ')}
    </tbody>
  </table>
</section>`;
  return html;
}

const body = ORDER.filter((id) => fs.existsSync(path.join(AV, `base/${id}.png`))).map(section).join('\n\n');

const html = `<!DOCTYPE html>
<html lang="de" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Trade Empire — Avatar-Freistellung: Haarkanten-Vergleich</title>
<style>
  :root { --bg:#030712; --panel:#0b1220; --panel2:#111a2e; --border:#1f2c44;
          --text:#e5edf7; --muted:#8aa0bd; --accent:#22d3ee; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
         font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  header { position:sticky; top:0; z-index:10; background:var(--panel);
           border-bottom:1px solid var(--border); padding:12px 18px;
           display:flex; flex-wrap:wrap; gap:14px; align-items:center; }
  header h1 { font-size:17px; margin:0; }
  .toc { display:flex; flex-wrap:wrap; gap:8px; }
  .toc a { color:var(--accent); text-decoration:none; font-size:13px;
           border:1px solid var(--border); padding:4px 9px; border-radius:6px; }
  .toc a:hover { background:var(--panel2); }
  .spacer { flex:1; }
  button { cursor:pointer; background:var(--panel2); color:var(--text);
           border:1px solid var(--border); border-radius:6px; padding:6px 12px; font-size:13px; }
  button.on { border-color:var(--accent); color:var(--accent); }
  main { padding:18px; max-width:1500px; margin:0 auto; }
  section { margin-bottom:48px; border-top:1px solid var(--border); padding-top:20px; }
  h2 { font-size:22px; margin:0 0 2px; }
  h3 { font-size:15px; margin:26px 0 6px; color:var(--accent); }
  .sub { color:var(--muted); font-size:13px; margin:0 0 12px; }
  .grid { display:flex; flex-wrap:wrap; gap:16px; align-items:flex-start; }
  .tile { margin:0; }
  .tile .frame { border:1px solid var(--border); border-radius:8px; overflow:hidden;
                 display:flex; align-items:center; justify-content:center; }
  .tile img { display:block; max-width:100%; }
  .grid .tile .frame { width:260px; min-height:120px; }
  .grid .tile img { width:260px; }
  .zooms .tile .frame, .zooms .tile .pair .frame { width:280px; height:280px; }
  .zooms .tile img { width:280px; height:280px; object-fit:contain; }
  .pair { display:flex; gap:8px; }
  .frame.light { background:#e8ecf1; }
  .frame.dark  { background:#0a0d14; }
  .frame.op    { background:#000; }
  /* umschaltbarer Grund fuer die Gesamtansicht-Freistellungen */
  body[data-bd="light"]  .frame.tp { background:#e8ecf1; }
  body[data-bd="dark"]   .frame.tp { background:#0a0d14; }
  body[data-bd="checker"] .frame.tp {
    background: repeating-conic-gradient(#222b3d 0% 25%, #1a2334 0% 50%) 50% / 18px 18px; }
  figcaption { font-size:12px; margin-top:6px; max-width:280px; line-height:1.45; }
  figcaption b { display:block; }
  figcaption span { color:var(--muted); }
  .tile.missing .frame { width:260px; height:160px; border-style:dashed;
    border-color:#7f1d1d; color:#fca5a5; font-size:12px; text-align:center; padding:10px; }
  table { border-collapse:collapse; margin-top:8px; font-size:13px; width:100%; }
  th, td { border:1px solid var(--border); padding:6px 10px; text-align:left; }
  th { background:var(--panel2); font-weight:600; cursor:help; }
  td.mono { font-family: ui-monospace, Consolas, monospace; font-size:12px; }
  td.good { color:#4ade80; } td.warn { color:#fbbf24; } td.bad { color:#f87171; }
  .muted { color:var(--muted); }
  .note { background:var(--panel); border:1px solid var(--border); border-radius:10px;
          padding:14px 18px; margin:0 0 26px; font-size:13.5px; line-height:1.6; }
  .note h3 { margin-top:0; }
  .note ul { margin:8px 0 0 18px; padding:0; }
  .note li { margin-bottom:6px; }
  .warn-line { color:#fbbf24; margin-top:10px; max-width:900px; }
</style>
</head>
<body data-bd="dark">
<header>
  <h1>Avatar-Freistellung — Haarkanten-Vergleich</h1>
  <nav class="toc">
    ${ORDER.map((id) => `<a href="#${id}">${esc(NAMES[id])}</a>`).join('\n    ')}
    <a href="#befund">Befund</a>
  </nav>
  <span class="spacer"></span>
  <span class="muted" style="font-size:12px">Grund der Freistellungen:</span>
  <button data-bd="light">hell</button>
  <button data-bd="dark" class="on">dunkel</button>
  <button data-bd="checker">karo</button>
</header>
<main>

<div class="note" id="befund">
  <h3>Befund zum Ist-Zustand</h3>
  <p>Der Alphakanal der beiden produktiv genutzten Freistellungen ist <b>nicht binär</b> —
  die ursprüngliche Vermutung trifft nicht zu. Er ist weich, aber die Weichheit ist ein
  gleichmäßig verwaschener Rand von rund 9–10 px <b>ohne jede Strähnenstruktur</b>
  (Strähnenanteil 0,01 %). Der Alphakanal verliert beim Herunter- und wieder
  Hochrechnen um Faktor 4 fast nichts (RMSE ≈ 2,4), trägt also unterhalb von etwa
  4–8 px gar keine Information: die Maske wurde klein gerechnet und hochskaliert.</p>
  <p>Ursache ist der Aufruf, nicht das Modell: <code>utils.removeBackground()</code> und
  <code>props-pipeline-lib.cjs</code> schicken an <code>fal-ai/birefnet/v2</code> nur
  <code>image_url</code> und fahren damit auf den Defaults
  <code>model = "General Use (Light)"</code>, <code>operating_resolution = "1024x1024"</code>,
  <code>refine_foreground = false</code> — Salient-Object-Segmentierung bei 1024 px auf
  einem 2048×2880-Bild, ohne Farbtrennung an der Kante.</p>
</div>

<div class="note">
  <h3>Empfehlung</h3>
  <p><b>Der Uni-Hintergrund-Umweg (NEU C) ist nicht das, was die Haarkanten repariert.</b>
  Er kostet Auflösung (2048×2880 → 880×1184), verändert das Seitenverhältnis und –
  bei Dr. Vasquez deutlich sichtbar – das Gesicht. Was die Kanten repariert, ist der
  korrekt parametrierte Matting-Aufruf.</p>
  <p><b>NEU B</b> (direktes Matting auf dem unveränderten Original mit
  <code>model:"Portrait"</code>, <code>operating_resolution:"2048x2048"</code>,
  <code>refine_foreground:true</code>) liefert die beste Kante, behält die volle
  Auflösung und lässt die Figur zu 100 % unangetastet. Vergleicht in den Zooms
  „Bisherige Freistellung" gegen „NEU B — Portrait".</p>
</div>

${body}

</main>
<script>
  for (const b of document.querySelectorAll('header button[data-bd]')) {
    b.addEventListener('click', () => {
      document.body.dataset.bd = b.dataset.bd;
      for (const o of document.querySelectorAll('header button[data-bd]')) o.classList.remove('on');
      b.classList.add('on');
    });
  }
</script>
</body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log('written:', path.relative(REPO, OUT));
