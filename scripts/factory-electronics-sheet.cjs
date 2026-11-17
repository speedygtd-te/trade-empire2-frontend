/**
 * Kontaktbogen fuer den PILOT "Elektronikfabrik" (Stufe 2-4).
 *
 * Zeigt die GANZE Kette, nicht nur das Ergebnis:
 *   b1 · b8 · robot_t2/t4 im Original · dieselben "in construction" · Endergebnis,
 *   dazu alle verworfenen Merge-Versuche (damit sichtbar ist, WO es scheitert)
 *   und das Endergebnis in Spielgroesse (48/96/144 px) neben dem heutigen
 *   electronics_factory.
 *
 * PRUEFT anschliessend JEDE src-Referenz gegen das Dateisystem und nennt die
 * Zahl — der Split-Lauf hatte drei leere Rahmen, weil Pfade eine Ebene daneben
 * lagen. Verfahren wortgleich aus scripts/factory-base-sheet.cjs.
 *
 * Usage: node scripts/factory-electronics-sheet.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const DIR_SHEET = path.join(ROOT, 'assets', 'style-test');
const OUT = path.join(DIR_SHEET, 'factory-electronics-merge.html');

const srcs = [];
const img = (src, attrs = '') => {
  srcs.push(src);
  return `<img src="${src}" ${attrs}>`;
};

async function stats(rel) {
  const abs = path.join(DIR_SHEET, rel);
  if (!fs.existsSync(abs)) return null;
  const { data, info } = await sharp(abs).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width,
    H = info.height,
    ch = info.channels;
  let op = 0;
  const bottom = new Array(W).fill(-1);
  for (let x = 0; x < W; x++)
    for (let y = H - 1; y >= 0; y--)
      if (data[(y * W + x) * ch + 3] > 128) {
        bottom[x] = y;
        break;
      }
  for (let i = 3; i < data.length; i += ch) if (data[i] > 16) op++;
  let bx = 0;
  for (let x = 0; x < W; x++) if (bottom[x] > bottom[bx]) bx = x;
  const fit = (a, b) => {
    let n = 0,
      sx = 0,
      sy = 0,
      sxy = 0,
      sxx = 0;
    for (let x = a; x <= b; x++) {
      if (bottom[x] < 0) continue;
      n++;
      sx += x;
      sy += bottom[x];
      sxy += x * bottom[x];
      sxx += x * x;
    }
    return n < 20 ? NaN : (n * sxy - sx * sy) / (n * sxx - sx * sx);
  };
  const l = fit(Math.round(bx * 0.25), Math.round(bx * 0.85));
  const r = fit(Math.round(bx + (W - bx) * 0.15), Math.round(bx + (W - bx) * 0.75));
  return {
    size: `${W}x${H}`,
    cov: `${((100 * op) / (W * H)).toFixed(1)}%`,
    slope: Number.isNaN(l) || Number.isNaN(r) ? 'n/a' : `${l >= 0 ? '+' : ''}${l.toFixed(3)} / ${r.toFixed(3)}`,
  };
}

const CHAIN = [
  { src: 'modules/factory_base_b1.png', cap: '1 · b1 — Hero-Basis (Buehne)' },
  { src: 'modules/factory_base_b8.png', cap: '2 · b8 — Montagestrasse' },
  { src: '../../src/assets/workforce/robot_t2/robot_t2_0.webp', cap: '3 · robot_t2 Original' },
  { src: '../../src/assets/workforce/robot_t4/robot_t4_0.webp', cap: '4 · robot_t4 Original' },
];
const WIP = [
  { src: 'modules/robot_t2_wip.png', cap: 't2 — Fassung 1 (zu dezent)' },
  { src: 'modules/robot_t2_wip2.png', cap: 't2 — Fassung 2 (Form verloren)' },
  { src: 'modules/robot_t2_wip3.png', cap: 't2 — Fassung 3 GENOMMEN' },
  { src: 'modules/robot_t4_wip.png', cap: 't4 — Fassung 1 (zu dezent)' },
  { src: 'modules/robot_t4_wip2.png', cap: 't4 — Fassung 2' },
  { src: 'modules/robot_t4_wip3.png', cap: 't4 — Fassung 3 GENOMMEN' },
];
const MERGES = [
  { src: 'modules/electronics_merge_one_a1.png', cap: 'one-shot a1 — nur 1 Roboter, Bucht leer' },
  { src: 'modules/electronics_merge_one_a2.png', cap: 'one-shot a2 — Achse verzogen (+0.686)' },
  { src: 'modules/electronics_merge_one_a3.png', cap: 'one-shot a3 — GENOMMEN' },
  { src: 'modules/electronics_merge_one_a4.png', cap: 'one-shot a4 — rechte Wand weg' },
  { src: 'modules/electronics_merge_one_a5.png', cap: 'one-shot a5 — Bucht zerfallen' },
  { src: 'modules/electronics_merge_seqA_a2.png', cap: 'seq A — b1+b8 (Linie sitzt)' },
  { src: 'modules/electronics_merge_seqB_a2.png', cap: 'seq B — Roboter zu gross, Deck leer' },
];
const RESULT = '../final/electronics_factory_v2.png';
const TODAY = '../../src/assets/modules/electronics_factory/electronics_factory_0.webp';

const CSS = `
:root{color-scheme:dark}
body{margin:0;padding:24px;background:#12151b;color:#d7dce3;font:14px/1.5 system-ui,sans-serif}
h1{font-size:22px;color:#67e8f9;margin:0 0 4px}
h2{font-size:17px;color:#67e8f9;margin:32px 0 6px;border-bottom:1px solid #263041;padding-bottom:4px}
p.lead{color:#94a3b8;margin:0 0 8px;max-width:78ch}
.row{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;margin:10px 0}
figure{margin:0;text-align:center}
figure img{background:#1b212c;border:1px solid #2b3545;border-radius:8px;display:block}
figcaption{font-size:11px;color:#94a3b8;margin-top:5px;max-width:230px}
.pick img{border-color:#22d3ee;box-shadow:0 0 0 2px rgba(34,211,238,.28)}
.bad img{border-color:#7f1d1d}
.m{font:11px/1.5 ui-monospace,monospace;color:#64748b}
pre{white-space:pre-wrap;background:#171c25;border:1px solid #263041;border-radius:8px;padding:12px;
    font:11.5px/1.55 ui-monospace,monospace;color:#cbd5e1;max-width:120ch}
table{border-collapse:collapse;margin:8px 0;font-size:13px}
td,th{border:1px solid #263041;padding:5px 10px;text-align:left}
th{color:#94a3b8;font-weight:600}
.ok{color:#34d399}.warn{color:#fbbf24}
`;

(async () => {
  const st = {};
  for (const s of [...CHAIN, ...WIP, ...MERGES].map((x) => x.src).concat([RESULT, TODAY]))
    st[s] = await stats(s);

  const cell = (o, px, cls = '') => {
    const s = st[o.src];
    return `<figure class="${cls}">${img(o.src, `width="${px}" height="${px}" alt="${o.cap}"`)}<figcaption>${o.cap}${
      s ? `<br><span class="m">${s.size} · ${s.cov} · ${s.slope}</span>` : '<br><span class="m warn">FEHLT</span>'
    }</figcaption></figure>`;
  };

  const wipJson = JSON.parse(
    fs.readFileSync(path.join(DIR_SHEET, 'modules', 'electronics_wip3_results.json'), 'utf8'),
  );
  const mergeJson = JSON.parse(
    fs.readFileSync(path.join(DIR_SHEET, 'modules', 'electronics_merge_one_a3.json'), 'utf8'),
  );

  const sizeRow = (px) => `
  <div class="row">
    <figure class="pick">${img(RESULT, `width="${px}" height="${px}" alt="neu"`)}<figcaption>NEU ${px} px</figcaption></figure>
    <figure>${img(TODAY, `width="${px}" height="${px}" alt="heute"`)}<figcaption>heute ${px} px</figcaption></figure>
  </div>`;

  const html = `<!doctype html><meta charset="utf-8"><title>Elektronikfabrik — Basis + Montage</title>
<style>${CSS}</style>
<h1>Pilot Elektronikfabrik — Stufe 2 bis 4</h1>
<p class="lead">Basis b1 (Hero) + Montagestrasse b8 + zwei Roboter „in construction“, in EINEM
Schritt per <code>fal-ai/flux-pro/kontext/max/multi</code> gemerged. Unter jedem Bild:
Groesse · Alpha-Deckung · Iso-Achse (Steigung der beiden unteren Silhouettenkanten,
Soll +0.500 / -0.500, Referenz b1 = +0.568 / -0.562).</p>

<h2>Die vier Eingangsbilder</h2>
<div class="row">${CHAIN.map((o) => cell(o, 230)).join('\n')}</div>

<h2>Stufe 3 — „in construction“ (drei Fassungen)</h2>
<p class="lead">Fassung 1 war zu dezent (der Roboter kam nur leicht entsaettigt zurueck).
Fassung 2 las sich als unfertig, machte aus dem Kettenfahrzeug t2 aber einen zweibeinigen
Mech — Identitaet weg. Fassung 3 stellt einen Identitaets-Anker VOR den Auftrag und nennt
das fehlende Teil je Roboter; sie ist genommen.</p>
<div class="row">${WIP.map((o) => cell(o, 200, o.src.includes('wip3') ? 'pick' : '')).join('\n')}</div>

<h2>Stufe 4 — Merge, alle Versuche</h2>
<p class="lead">Fuenf Versuche in EINEM Schritt (4 Eingangsbilder) und zwei sequenzielle
(erst b1+b8, dann die Roboter). Der einstufige Weg gewinnt: sequenziell blieb das Deck leer
und der Humanoid wurde riesig.</p>
<div class="row">${MERGES.map((o) =>
    cell(o, 250, o.src.includes('one_a3') ? 'pick' : o.src.includes('seqA') ? '' : 'bad'),
  ).join('\n')}</div>

<h2>Spielgroesse — neu gegen heute</h2>
${sizeRow(144)}${sizeRow(96)}${sizeRow(48)}

<h2>Messung des Endergebnisses gegen b1</h2>
<table>
<tr><th>Asset</th><th>Groesse</th><th>Alpha-Deckung</th><th>Iso-Achse links / rechts</th></tr>
<tr><td>b1 (Basis)</td><td>${st['modules/factory_base_b1.png'].size}</td><td>${st['modules/factory_base_b1.png'].cov}</td><td>${st['modules/factory_base_b1.png'].slope}</td></tr>
<tr><td>Endergebnis</td><td>${st[RESULT].size}</td><td>${st[RESULT].cov}</td><td>${st[RESULT].slope}</td></tr>
<tr><td>heutiges electronics_factory</td><td>${st[TODAY].size}</td><td>${st[TODAY].cov}</td><td>${st[TODAY].slope}</td></tr>
</table>

<h2>Prompt — „in construction“ (Fassung 3, robot_t2)</h2>
<pre>${wipJson.results[0].prompt.replace(/</g, '&lt;')}</pre>
<h2>Prompt — „in construction“ (Fassung 3, robot_t4)</h2>
<pre>${wipJson.results[1].prompt.replace(/</g, '&lt;')}</pre>
<h2>Prompt — Merge (Fassung 2, genommen)</h2>
<pre>${mergeJson.prompt.replace(/</g, '&lt;')}</pre>
`;

  fs.writeFileSync(OUT, html);

  // ── Pfadpruefung: JEDE src-Referenz gegen das Dateisystem ──
  let ok = 0;
  const missing = [];
  for (const s of srcs) {
    if (fs.existsSync(path.resolve(DIR_SHEET, s))) ok++;
    else missing.push(s);
  }
  console.log(`[sheet] ${path.relative(ROOT, OUT)}`);
  console.log(`[refs]  ${ok}/${srcs.length} src-Referenzen existieren`);
  if (missing.length) {
    console.error('FEHLEND:');
    for (const m of [...new Set(missing)]) console.error('  ' + m);
    process.exit(1);
  }
})();
