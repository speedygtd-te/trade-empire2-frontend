/**
 * Regenerates assets/style-test/hull-batch/hull-batch.html for ROUND 2.
 * Adds a "Basis" column (geometry base: standard-box or outdoor-platform).
 * Pure HTML/asset assembly — NO fal, NO src writes, NO git, NO cap sync.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'style-test', 'hull-batch');
const RAW = path.join(ROOT, 'assets', 'raw');
const HULLS = path.join(ROOT, 'src', 'assets', 'hulls');

const FLOOR = (t) =>
  t === 'standard'
    ? path.join(RAW, 'floor_hero_standard_square.png')
    : path.join(RAW, `floor_hero_${t}_edit_square.png`);

// geometry base label + image source per type
const STANDARD_BASE = path.join(HULLS, 'standard', 'standard_0.webp');
const PLATFORM_BASE = path.join(OUT, 'hull_platform_outdoor.png');

// rows: type, accent caption, basis label, basis image path (null = self/accepted)
const ROWS = [
  ['standard', 'cyan glow edges (abgenommen)', '— selbst (abgenommen)', null],
  ['starter', 'rusty / weathered', 'standard-Box', STANDARD_BASE],
  ['reinforced', 'armored, copper accents (Oktagon)', 'standard-Box', STANDARD_BASE],
  ['airtight', 'VERY DARK graphite, green seams', 'standard-Box', STANDARD_BASE],
  ['pressurized', 'navy-blue steel beams + bolts', 'standard-Box', STANDARD_BASE],
  ['platform_outdoor', 'weathered grating (abgenommen)', '— selbst (abgenommen)', null],
  ['platform_space', 'void-black, starlight', 'outdoor-Plattform', PLATFORM_BASE],
  ['platform_underwater', 'teal accents, wet look', 'outdoor-Plattform', PLATFORM_BASE],
];

async function thumb(p, size) {
  const b = await sharp(p).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return `data:image/png;base64,${b.toString('base64')}`;
}

(async () => {
  let rowsHtml = '';
  for (const [t, accent, basisLbl, basisPath] of ROWS) {
    const neuPath = path.join(OUT, `hull_${t}.png`);
    const floorPath = FLOOR(t);
    const neu = await thumb(neuPath, 220);
    const floor = await thumb(floorPath, 200);
    const basis = basisPath ? `<img src="${await thumb(basisPath, 200)}">` : '<span class="self">—</span>';
    rowsHtml +=
      `<tr><td class="lbl"><b>${t}</b><br><span>${accent}</span></td>` +
      `<td>${basis}<div>${basisLbl}</div></td>` +
      `<td><img src="${floor}"><div>Material-Partner</div></td>` +
      `<td class="neu"><img src="${neu}"><div>512&times;512 · Alpha</div></td></tr>`;
  }

  const html =
    `<!doctype html><html><head><meta charset="utf-8"><title>Hull Batch Style Test — Runde 2</title>
<style>body{background:#1b1f24;color:#e6e9ec;font-family:system-ui,sans-serif;margin:0;padding:24px}
h1{font-weight:600;font-size:20px}p{color:#9aa3ad;font-size:13px;max-width:1100px}
table{border-collapse:collapse;width:100%;max-width:1100px}
td{border:1px solid #2c333b;padding:10px;text-align:center;vertical-align:middle}
td.lbl{text-align:left;width:200px}td.lbl span{color:#9aa3ad;font-size:12px}
img{width:200px;height:200px;object-fit:contain;background:repeating-conic-gradient(#23272e 0% 25%,#1b1f24 0% 50%) 50%/24px 24px;border-radius:6px}
td div{font-size:11px;color:#8b949e;margin-top:4px}
span.self{color:#5ec8ff;font-size:28px}
td.neu{background:#1d2630}td.neu div{color:#5ec8ff}
th{padding:8px;color:#9aa3ad;font-size:12px;text-align:center}</style></head>
<body><h1>Hull Batch — Runde 2: Einheitliche Geometrie-Basen (Style-Test, nicht integriert)</h1>
<p>Box-Typen (starter, reinforced, airtight, pressurized) erben dieselbe Würfel-Geometrie (Türen etc.) vom abgenommenen <b>standard</b>-Hull. Plattform-Typen (platform_space, platform_underwater) erben die offene Reling-Plattform vom abgenommenen <b>platform_outdoor</b>. Material kommt jeweils vom Floor-Partner. standard &amp; platform_outdoor sind bereits abgenommen und unverändert. Alle NEU 512&times;512, transparenter Alpha.</p>
<table><tr><th>Typ</th><th>Basis (Geometrie)</th><th>Floor</th><th>NEU</th></tr>${rowsHtml}</table>
</body></html>`;

  fs.writeFileSync(path.join(OUT, 'hull-batch.html'), html);
  console.log('wrote hull-batch.html (' + html.length + ' bytes)');
})();
