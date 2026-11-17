/**
 * KONTAKTBOGEN — Runde 3, Varianten + Lit-Fassungen (24 Basisdateien).
 *
 * Legt assets/style-test/hull-new3/hull-new3-variants.html an. Der abgenommene
 * Basis-Bogen (hull-new3.html) bleibt unangetastet — er dokumentiert die
 * Abnahmerunde der drei Basisbilder.
 *
 * Aufbau je Huelle:
 *   Zeile 1: Varianten 0..3 in GERAETEPIXELN (512 aus der Quelle)
 *   Zeile 2: die vier Lit-Fassungen, gleiche Reihenfolge
 *   danach:  Spielskala-Galerie 144 / 288 / 576 Geraetepixel (zoom 1/2/4 bei dpr 3)
 *            mit allen acht Dateien nebeneinander — die Frage dort ist nicht
 *            "schoen", sondern "dieselbe Huelle, aber keine Kopie?"
 *   dazu:    Grundriss + Aspect-Abweichung gegen die eigene Basis je Datei
 *
 * Die Bilder werden nach hull-new3/variants/ kopiert, damit der Bogen
 * self-contained ist. Gemessen wird ueber hull-new3-verify.measure — kein
 * zweiter Messpfad.
 *
 * Usage: node scripts/hull-new3-variants-sheet.cjs
 */
const fs = require('fs');
const path = require('path');
const { measure, TYPES, srcNormal, srcLit } = require('./hull-new3-verify.cjs');

const ROOT = path.resolve(__dirname, '..');
const SHEET_DIR = path.join(ROOT, 'assets', 'style-test', 'hull-new3');
const IMG_DIR = path.join(SHEET_DIR, 'variants');

const LABEL = {
  composite: 'COMPOSITE — Composite Hull (INDOOR, Seed 1271001)',
  composite_platform_space: 'COMPOSITE_PLATFORM_SPACE — Composite Gun Deck (OUTDOOR/SPACE, Seed 1233001)',
  glass_carbon: 'GLASS_CARBON — Glass & Carbon Hull (INDOOR, Seed 1452001)',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function cell(src, cap, sub, cls) {
  return `<figure class="${cls || ''}">
  <div class=one><img class=onepx src="${src}" alt="${esc(cap)}"></div>
  <figcaption><b>${esc(cap)}</b><br><span class=fn>${esc(sub)}</span></figcaption>
</figure>`;
}

function scaleRow(label, cssVar, files) {
  const cells = files.map((f) => `<div class=zcell><img class="gs ${cssVar}" src="${f.src}" alt="${esc(f.name)}"><span class=zname>${esc(f.name)}</span></div>`).join('');
  return `<div class=scalerow><div class=zlab>${esc(label)}</div>${cells}</div>`;
}

(async () => {
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const sections = [];
  const bigRows = [];

  for (const t of TYPES) {
    const rows = [];
    for (const kind of ['normal', 'lit']) {
      for (let n = 0; n <= 3; n++) {
        const src = kind === 'normal' ? srcNormal(t, n) : srcLit(t, n);
        if (!fs.existsSync(src)) throw new Error(`fehlt: ${src}`);
        const name = kind === 'normal' ? `${t}_${n}.png` : `${t}_lit_${n}.png`;
        fs.copyFileSync(src, path.join(IMG_DIR, name));
        const m = await measure(src);
        rows.push({ kind, n, name, m });
      }
    }
    const base = rows[0].m;
    for (const r of rows) r.dev = ((r.m.aspect - base.aspect) / base.aspect) * 100;
    const litLum = {};
    for (const r of rows) if (r.kind === 'normal') litLum[r.n] = r.m.luma;

    const rowNormal = rows.filter((r) => r.kind === 'normal').map((r) => cell(
      `variants/${r.name}`,
      r.n === 0 ? 'Variante 0 (abgenommene Basis)' : `Variante ${r.n}`,
      `${r.name} · Grundriss ${r.m.bw}x${r.m.bh} · Aspect ${r.m.aspect.toFixed(4)} · dev ${r.dev >= 0 ? '+' : ''}${r.dev.toFixed(2)} %`,
      r.n === 0 ? 'hero' : '',
    )).join('\n');

    const rowLit = rows.filter((r) => r.kind === 'lit').map((r) => cell(
      `variants/${r.name}`,
      `Lit ${r.n}`,
      `${r.name} · Grundriss ${r.m.bw}x${r.m.bh} · dev ${r.dev >= 0 ? '+' : ''}${r.dev.toFixed(2)} % · Luminanz ${(r.m.luma / litLum[r.n] * 100).toFixed(1)} % der unbeleuchteten Fassung`,
    )).join('\n');

    const gsFiles = rows.map((r) => ({ src: `variants/${r.name}`, name: r.kind === 'normal' ? `v${r.n}` : `lit ${r.n}` }));

    sections.push(`<section>
  <h2>${esc(LABEL[t] || t)}</h2>
  <h3>1:1 — 512 Gerätepixel je Bild · Varianten</h3>
  <div class=row>${rowNormal}</div>
  <h3>1:1 — Lit-Fassungen (atmosphärenlose Welten)</h3>
  <div class=row>${rowLit}</div>
  <h3>Spielskala — Gerätepixel</h3>
  <div class=scaleblock>
    ${scaleRow('576 px (zoom 4, dpr 3)', 'z576', gsFiles)}
    ${scaleRow('288 px (zoom 2, dpr 3)', 'z288', gsFiles)}
    ${scaleRow('144 px (zoom 1, dpr 3)', 'z144', gsFiles)}
  </div>
</section>`);

    for (const r of rows) {
      bigRows.push(`<tr${r.kind === 'lit' ? ' class=lit' : ''}><td>${esc(r.name)}</td><td>${r.m.bw}x${r.m.bh}</td>` +
        `<td>${r.m.aspect.toFixed(4)}</td><td>${r.dev >= 0 ? '+' : ''}${r.dev.toFixed(2)} %</td>` +
        `<td>${r.m.holes}</td><td>${r.m.minAlpha}</td><td>${r.m.luma.toFixed(1)}</td></tr>`);
    }
  }

  const html = `<!doctype html><meta charset=utf8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>Drei neue Hüllen — Varianten + Lit</title>
<style>
:root{--bg:#14161a;--fg:#e8eaed;--dim:#9aa3ad;--card:#1c1f25;--line:#2c313a}
body{background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif;margin:0;padding:20px 16px 60px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:34px 0 4px;border-bottom:1px solid var(--line);padding-bottom:6px}
h3{font-size:14px;color:var(--dim);margin:22px 0 8px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.note{color:var(--dim);max-width:86ch}
.row{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;max-width:100%}
figure.hero{border-color:#3d6ea5}
.one{background:repeating-conic-gradient(#2a2d33 0 25%,#22252a 0 50%) 0 0/28px 28px;border-radius:4px;display:flex;justify-content:center}
/* GERÄTEPIXEL: CSS-Breite = Zielpixel / dpr */
img.onepx{width:calc(512px / var(--dpr,1));height:auto;image-rendering:auto;max-width:100%}
figcaption{font-size:12.5px;margin-top:8px;max-width:34ch}
.fn{color:var(--dim);font-family:ui-monospace,monospace;font-size:11px}
.scaleblock{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;display:block;max-width:100%;overflow-x:auto}
.scalerow{display:flex;align-items:flex-end;gap:14px;margin-bottom:14px}
.zlab{width:150px;flex:none;color:var(--dim);font-size:12px}
.zcell{flex:none;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;background:#0d1013;border-radius:4px;padding:6px}
.zname{font-size:11px;color:var(--dim);text-align:center;display:block;margin-top:4px}
img.gs{height:auto;image-rendering:auto}
img.z576{width:calc(576px / var(--dpr,1))}
img.z288{width:calc(288px / var(--dpr,1))}
img.z144{width:calc(144px / var(--dpr,1))}
table.big{border-collapse:collapse;font-size:12.5px;margin-top:8px}
table.big th,table.big td{border:1px solid var(--line);padding:4px 8px;text-align:right}
table.big th:first-child,table.big td:first-child{text-align:left}
table.big tr.lit{background:#1b2230}
code{font-family:ui-monospace,monospace;font-size:12px;color:#a8c7e8}
#dprbox{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px;display:inline-block;margin:10px 0}
</style>
<h1>Drei neue Hüllen — vier Varianten und vier Lit-Fassungen je Hülle</h1>
<p class=note>24 Basisdateien. Variante 0 ist das abgenommene Basisbild (unverändert),
<code>_1.._3</code> sind daraus abgeleitet (<code>flux/dev/image-to-image</code>, strength 0.45,
aspekt-erhaltender Footprint-Fit auf Bbox+Offset der Basis — kein Squash, keine Drehung).
Die Lit-Fassungen behalten die Silhouette exakt (Original-Alpha als Maske).
Die Frage an dieser Tafel ist nicht „schön", sondern: <b>erkennt man die vier Varianten im Raster
als dieselbe Hülle, aber nicht als Kopie?</b> — und zwar auf der kleinsten Zoomstufe.</p>
<div id=dprbox>
  <b>Gerätepixel dieses Bildschirms:</b> dpr = <span id=dpr>?</span> ·
  1:1-Ansicht = 512 Gerätepixel (CSS-Breite <span id=csspx>?</span> px) ·
  Spielskala: <code>HULL_DRAW_W = 48</code> CSS-px × zoom × dpr
  <div class=fn id=warn></div>
</div>
${sections.join('\n')}
<section>
  <h2>Alle 24 Dateien — Grundriss und Abweichung</h2>
  <table class=big>
    <tr><th>Datei</th><th>Grundriss (Bbox)</th><th>Aspect</th><th>dev gegen <code>_0</code></th>
        <th>Alpha-Löcher &lt;250</th><th>min Alpha</th><th>Luminanz</th></tr>
    ${bigRows.join('\n    ')}
  </table>
  <p class=note>„Alpha-Löcher" = vom Rand nicht erreichbare Pixel mit Alpha &lt; 250 (Referenz
  <code>standard_0</code>: 2 Pixel bei min Alpha 249). Bei <code>composite_platform_space</code> ist
  Durchsicht Familienkonvention — dort wird nicht versiegelt.</p>
</section>
<script>
(function(){
  var dpr = window.devicePixelRatio || 1;
  document.documentElement.style.setProperty('--dpr', dpr);
  document.getElementById('dpr').textContent = dpr;
  document.getElementById('csspx').textContent = (512/dpr).toFixed(1);
  if (Math.abs(dpr - 3) > 0.01) document.getElementById('warn').textContent =
    'Hinweis: dpr ist ' + dpr + ', nicht 3 — die Spielskala-Zeilen zeigen trotzdem 576/288/144 Geraetepixel.';
})();
</script>`;

  const out = path.join(SHEET_DIR, 'hull-new3-variants.html');
  fs.writeFileSync(out, html);
  console.log('[sheet]', path.relative(ROOT, out));
  console.log('[imgs ]', fs.readdirSync(IMG_DIR).length, 'Dateien in', path.relative(ROOT, IMG_DIR));
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
