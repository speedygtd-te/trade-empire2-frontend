/**
 * Kontaktbogen fuer die FABRIK-FAMILIE (Pilot + die fuenf Nachzuegler).
 *
 * Zeigt je Fabrik die ganze Kette (Basis, Fertigungsvorrichtung, die zwei
 * Produkte, Ergebnis), ALLE Seeds — auch die verworfenen, damit sichtbar ist
 * WO es scheitert —, das Zwei-Gleise-Experiment (mit/ohne Vorwandlung) und
 * ganz oben alle sechs Endergebnisse nebeneinander in Spielgroesse 48/96/144
 * px gegen die heutigen Bestandsfassungen.
 *
 * PRUEFT anschliessend JEDE src-Referenz gegen das Dateisystem und bricht bei
 * einem Fehltreffer mit Exit 1 ab — Verfahren wortgleich aus
 * scripts/factory-electronics-sheet.cjs (der Split-Lauf hatte leere Rahmen).
 *
 * Usage: node scripts/factory-family-sheet.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const DIR_SHEET = path.join(ROOT, 'assets', 'style-test');
const OUT = path.join(DIR_SHEET, 'factory-family-merge.html');

const srcs = [];
const img = (src, attrs = '') => {
  srcs.push(src);
  return `<img src="${src}" ${attrs}>`;
};

async function stats(rel) {
  const abs = path.resolve(DIR_SHEET, rel);
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

const B1 = 'modules/factory_base_b1.png';
const B8 = 'modules/factory_base_b8.png';

// Die sechs Fabriken in der Reihenfolge des Bogens.
const FAMILY = [
  {
    key: 'electronics_factory',
    label: 'Elektronikfabrik (Pilot, abgenommen)',
    domain: 'ELECTRONICS_FACTORY — Platinen, Roboter, Steuerelektronik',
    fixture: 'b8 — gelbe Rollenbahn (Bild 2 des Merge)',
    fixtureImg: B8,
    products: [
      { src: '../../src/assets/workforce/robot_t2/robot_t2_0.webp', cap: 'robot_t2 — Kettenplattform, Aspekt 0,82' },
      { src: '../../src/assets/workforce/robot_t4/robot_t4_0.webp', cap: 'robot_t4 — schlanker Humanoid, Aspekt 0,40' },
    ],
    result: '../final/electronics_factory_v2.png',
    today: '../../src/assets/modules/electronics_factory/electronics_factory_0.webp',
    pick: 'modules/electronics_merge_one_a3.png',
    candidates: [],
    marker: 'gelbe Rollenbahn quer durch die Bucht',
  },
  {
    key: 'factory',
    label: 'Fabrik (generisch)',
    domain: 'FACTORY — Industriemaschinen, Kraftwerke, Lager, Nahrung/Lebenserhaltung, Docks, Kolonie-Infrastruktur',
    fixture: 'zwei quadratische Montagelehren unter dem Kranhaken (Text, kein b8)',
    fixtureImg: null,
    products: [
      { src: '../../src/assets/modules/solar_panel/solar_panel_0.webp', cap: 'solar_panel — flaches Zellgitter, Aspekt 0,79' },
      { src: '../../src/assets/modules/fusion_reactor/fusion_reactor_0.webp', cap: 'fusion_reactor — runde Trommel, Aspekt 1,27' },
    ],
    result: '../final/factory_v2.png',
    today: '../../src/assets/modules/factory/factory_0.webp',
    pick: 'modules/factory_raw_a11.png',
    candidates: [
      { src: 'modules/factory_raw_a1.png', cap: 'a1 — Achse flach (+0.428), Panel fehlt', bad: true },
      { src: 'modules/factory_raw_a2.png', cap: 'a2 — Kran weg', bad: true },
      { src: 'modules/factory_raw_a3.png', cap: 'a3 — Panel nur leerer Rahmen', bad: true },
      { src: 'modules/factory_raw_a4.png', cap: 'a4 — Bucht zerfallen', bad: true },
      { src: 'modules/factory_raw_a5.png', cap: 'a5 — Bucht zerfallen', bad: true },
      { src: 'modules/factory_raw_a11.png', cap: 'a11 — GENOMMEN (Rudi: etwas leerer, aber gut)' },
      { src: 'modules/factory_raw_a12.png', cap: 'a12 — Bucht weg', bad: true },
      { src: 'modules/factory_raw_a13.png', cap: 'a13 — nur Fragment', bad: true },
      { src: 'modules/factory_raw_a14.png', cap: 'a14 — verworfen: Basis-Bucht um 90° gedreht (Kran und Torwand vertauscht)', bad: true },
      { src: 'modules/factory_raw_a15.png', cap: 'a15 — Bucht weg', bad: true },
    ],
    marker: 'grosses dunkelblaues Zellgitter flach auf dem Deck + runde Trommel',
  },
  {
    key: 'housing_factory',
    label: 'Wohnraumfabrik',
    domain: 'HOUSING_FACTORY — Wohnmodule der HABITAT-Familie',
    fixture: 'zweistoeckiges Stapelgeruest mit Treppe (Text, kein b8)',
    fixtureImg: null,
    products: [
      { src: '../../src/assets/modules/habitat_t2/habitat_t2_0.webp', cap: 'habitat_t2 — nackte Kabinenzelle, Aspekt 1,04' },
      { src: '../../src/assets/modules/habitat_t4/habitat_t4_0.webp', cap: 'habitat_t4 — ausgebaute Kabine, Aspekt 1,12' },
    ],
    result: '../final/housing_factory_v2.png',
    today: '../../src/assets/modules/housing_factory/housing_factory_0.webp',
    pick: 'modules/housing_factory_raw_a1.png',
    candidates: [
      { src: 'modules/housing_factory_raw_a1.png', cap: 'a1 — GENOMMEN' },
      { src: 'modules/housing_factory_raw_a2.png', cap: 'a2 — Kran weg', bad: true },
      { src: 'modules/housing_factory_raw_a3.png', cap: 'a3 — brauchbar, Deck vorn leer' },
      { src: 'modules/housing_factory_raw_a4.png', cap: 'a4 — Rand angeschnitten', bad: true },
      { src: 'modules/housing_factory_raw_a5.png', cap: 'a5 — brauchbar' },
    ],
    marker: 'warm gelb leuchtendes Kabinenfenster oben im Geruest + helle Plattenstapel',
  },
  {
    key: 'hull_forge',
    label: 'Huellenschmiede',
    domain: 'HULL_FORGE — alle HULL_*/PLATFORM_*-Rezepte',
    fixture: 'schwere Schweissboecke + drehbare Schweisslehre (Text, kein b8)',
    fixtureImg: null,
    products: [
      { src: '../../src/assets/hulls/platform_outdoor/platform_outdoor_0.webp', cap: 'platform_outdoor — flaches Decksegment, Aspekt 1,54' },
      { src: '../../src/assets/hulls/reinforced/reinforced_0.webp', cap: 'reinforced — Huellenwuerfel, Aspekt 1,01' },
    ],
    result: '../final/hull_forge_v2.png',
    today: '../final/hull_forge_0.png',
    pick: 'modules/hull_forge_raw_a13.png',
    candidates: [
      { src: 'modules/hull_forge_raw_a1.png', cap: 'a1 — Werkstuecke zu klein', bad: true },
      { src: 'modules/hull_forge_raw_a2.png', cap: 'a2 — Werkstuecke zu klein', bad: true },
      { src: 'modules/hull_forge_raw_a3.png', cap: 'a3 — Werkstuecke zu klein', bad: true },
      { src: 'modules/hull_forge_raw_a4.png', cap: 'a4 — Werkstuecke zu klein', bad: true },
      { src: 'modules/hull_forge_raw_a5.png', cap: 'a5 — Werkstuecke zu klein', bad: true },
      { src: 'modules/hull_forge_raw_a11.png', cap: 'a11 — brauchbar, Deck leerer' },
      { src: 'modules/hull_forge_raw_a12.png', cap: 'a12 — kein Wuerfel' },
      { src: 'modules/hull_forge_raw_a13.png', cap: 'a13 — GENOMMEN' },
      { src: 'modules/hull_forge_raw_a14.png', cap: 'a14 — Bucht zerfallen', bad: true },
      { src: 'modules/hull_forge_raw_a15.png', cap: 'a15 — Bucht weg', bad: true },
    ],
    marker: 'grauer Huellenwuerfel mit blauem Schweissbogen + flache Platte auf dem Deck',
  },
  {
    key: 'drive_works',
    label: 'Antriebswerk',
    domain: 'DRIVE_WORKS — Antriebsrezepte + SHIP_YARD_MANUFACTURING',
    fixture: 'zwei lange Triebwerkswiegen mit Sattelschalen (Text, kein b8)',
    fixtureImg: null,
    products: [
      { src: '../../src/assets/modules/chemical_thruster/chemical_thruster_0.webp', cap: 'chemical_thruster — stumpfe Glocke, Aspekt 1,06' },
      { src: '../../src/assets/modules/fusion_drive/fusion_drive_0.webp', cap: 'fusion_drive — langer Zylinder, Aspekt 1,40' },
    ],
    result: '../final/drive_works_v2.png',
    today: '../final/drive_works_0.png',
    pick: 'modules/drive_works_raw_a1.png',
    candidates: [
      { src: 'modules/drive_works_raw_a1.png', cap: 'a1 — GENOMMEN' },
      { src: 'modules/drive_works_raw_a2.png', cap: 'a2 — Triebwerke klein' },
      { src: 'modules/drive_works_raw_a3.png', cap: 'a3 — verworfen: Absaugvorrichtungen sehen komisch aus', bad: true },
      { src: 'modules/drive_works_raw_a4.png', cap: 'a4 — brauchbar, Achse +0.673' },
      { src: 'modules/drive_works_raw_a5.png', cap: 'a5 — Deck leerer' },
    ],
    marker: 'zwei dicke liegende Zylinder in Wiegen, laengs der Iso-Achse',
  },
  {
    key: 'arms_plant',
    label: 'Waffenfabrik',
    domain: 'ARMS_PLANT — Waffen-, Panzerungs- und Sensorrezepte',
    fixture: 'flacher Schienenwagen + lange Richtbank (Text, kein b8)',
    fixtureImg: null,
    products: [
      { src: '../../src/assets/resources/missile/missile_0.webp', cap: 'missile — langer Flossenkoerper, Aspekt 1,36' },
      { src: '../../src/assets/resources/composite_armor/composite_armor_0.webp', cap: 'composite_armor — flache Sechseckplatte, Aspekt 0,79' },
    ],
    result: '../final/arms_plant_v2.png',
    today: '../final/arms_plant_0.png',
    pick: 'modules/arms_plant_raw_e35.png',
    note:
      '<b>Iteration 2026-09-15 (Rudi: "da gefaellt mir gar nichts wirklich", praezisiert an a2/a3):</b> ' +
      'gleicher Prompt, gleiche Basis- und Produkt-Assets, zwoelf neue Seeds in zwei Prompt-Varianten — ' +
      '<code>d21-d26</code> unveraendert wie a-Serie, <code>e31-e36</code> mit einem zusaetzlichen Satz, ' +
      'der NUR den Kran anspricht ("leave a clearly visible empty margin above its topmost beam and to ' +
      'the left of its outer support column"). Von 12 Seeds haben 5 die Bucht zerstoert (d21, d22, e31, ' +
      'e32, e34) — bei BEIDEN Varianten, die Zusatzklausel hat die Zerstoerungsrate nicht sichtbar ' +
      'gesenkt. Kein einziger der 12 neuen Seeds reproduziert a2s harten Kran-Schnitt (dort 196px Alpha ' +
      'in der obersten Zeile, 61px in der linken Spalte); die schlimmste neue Randberuehrung ist eine ' +
      '76px breite Antennenspitze (e36), harmlos bei Spielgroesse. e33 und e35 beruehren oben/links ' +
      'ueberhaupt keinen Pixel. d26 reproduziert dagegen a3s Achsenfehler fast exakt (+0.664 gegen a3s ' +
      '+0.668, beide ueber dem Band +0.526…+0.641) — ein Hinweis, dass diese Perspektiv-Abweichung eher ' +
      'an der Rakete-allein-auf-Trolley-Komposition haengt als am Seed.',
    candidates: [
      { src: 'modules/arms_plant_raw_a1.png', cap: 'a1 — gut, aber farblos' },
      {
        src: 'modules/arms_plant_raw_a2.png',
        cap:
          'a2 — Rudi: "war schön, war aber abgeschnitten". Bestaetigt: Kran OBEN (196 von 1024px ' +
          'Alpha in Zeile 0) UND LINKS (61px in Spalte 0) an der Generierung geschnitten, nicht erst ' +
          'beim Crop — die Saeule und der Kranarm selbst reichen ueber den 1024x1024-Canvas hinaus.',
        bad: true,
      },
      {
        src: 'modules/arms_plant_raw_a3.png',
        cap:
          'a3 — Rudi: "Perspektive war falsch". Linke Iso-Achse +0.668 liegt UEBER dem Band der ' +
          'fuenf abgenommenen Fabriken (+0.526…+0.641), rechte Achse -0.577 liegt im Band — die ' +
          'linke Bucht-Kante ist steiler/spitzer als bei den abgenommenen Fassungen, die rechte nicht: ' +
          'ein einseitiger Kamera-Skew statt sauberer 2:1-Isometrie.',
        bad: true,
      },
      { src: 'modules/arms_plant_raw_a4.png', cap: 'a4 — Deck fast leer' },
      { src: 'modules/arms_plant_raw_a5.png', cap: 'a5 — keine Rakete erkennbar', bad: true },
      { src: 'modules/arms_plant_raw_a11.png', cap: 'a11 — brauchbar' },
      { src: 'modules/arms_plant_raw_a12.png', cap: 'a12 — bisheriger Pick (heutiger Stand v2), jetzt ersetzt durch e35' },
      { src: 'modules/arms_plant_raw_a13.png', cap: 'a13 — Kran abgerissen', bad: true },
      { src: 'modules/arms_plant_raw_a14.png', cap: 'a14 — Kran weg', bad: true },
      { src: 'modules/arms_plant_raw_a15.png', cap: 'a15 — zerfallen', bad: true },
      {
        src: 'modules/arms_plant_raw_d21.png',
        cap: 'd21 (Variante plain, unveraendert) — Bucht zerstoert, nur Rakete freigestellt',
        bad: true,
      },
      {
        src: 'modules/arms_plant_raw_d22.png',
        cap: 'd22 (plain) — Bucht zerstoert, nur Rakete + Panzerplatte auf Transparent',
        bad: true,
      },
      {
        src: 'modules/arms_plant_raw_d23.png',
        cap: 'd23 (plain) — sauber, Kran ohne Rand-Beruehrung, Achse +0.606/-0.556 im Band',
      },
      {
        src: 'modules/arms_plant_raw_d24.png',
        cap:
          'd24 (plain) — Panzerplatte gut sichtbar, Achse +0.655/-0.570 (links knapp ueber dem Band), ' +
          'Kran-Saeule beruehrt den linken Rand auf 41px (Antenne, nicht die Saeule selbst)',
      },
      {
        src: 'modules/arms_plant_raw_d25.png',
        cap:
          'd25 (plain) — zwei Raketen statt Rakete+Platte (weicht vom Prompt ab), Achse +0.582/-0.598 ' +
          '(rechts knapp ueber dem Band)',
      },
      {
        src: 'modules/arms_plant_raw_d26.png',
        cap:
          'd26 (plain) — Rakete mit Flossen + Panzerplattenstapel, sauberer Rand, ABER derselbe ' +
          'Achsen-Fehler wie a3: +0.664/-0.579 (links ueber dem Band) — vor Abnahme gegenpruefen',
      },
      {
        src: 'modules/arms_plant_raw_e31.png',
        cap: 'e31 (Variante margin, Kran-Zusatzsatz im Prompt) — Bucht zerstoert',
        bad: true,
      },
      {
        src: 'modules/arms_plant_raw_e32.png',
        cap: 'e32 (margin) — Bucht zerstoert, Rakete um 90° verdreht auf Transparent',
        bad: true,
      },
      {
        src: 'modules/arms_plant_raw_e33.png',
        cap:
          'e33 (margin) — VORAUSWAHL: Kran ohne jede Randberuehrung (0px oben/links), Rakete + ' +
          'Munitionsregal klar erkennbar, Achse +0.608/-0.570 im Band',
      },
      {
        src: 'modules/arms_plant_raw_e34.png',
        cap: 'e34 (margin) — Bucht zerstoert, nur Rakete + Platte auf Transparent',
        bad: true,
      },
      {
        src: 'modules/arms_plant_raw_e35.png',
        cap:
          'e35 (margin) — GENOMMEN (Rudi: "da passt alles fuer mich"): grosszuegigste Kran-Marge im ' +
          'ganzen Satz (0px oben/links), Achse +0.606/-0.562 im Band',
      },
      {
        src: 'modules/arms_plant_raw_e36.png',
        cap:
          'e36 (margin) — Rakete mit Flossen + Munitionsregal, Achse +0.657/-0.582 (links knapp ueber ' +
          'dem Band), oben eine 76px breite Antennenspitze am Rand (keine Bauteile betroffen)',
      },
    ],
    marker: 'dunkle liegende Rakete + olivgruenes Munitionsregal mit Messinghuelsen',
  },
];

// Das Zwei-Gleise-Experiment an drive_works.
const TRACK = {
  wipProducts: [
    { src: 'modules/drive_works_chemical_thruster_wip.png', cap: 'chemical_thruster vorgewandelt — Blau weg, grau' },
    { src: 'modules/drive_works_fusion_drive_wip.png', cap: 'fusion_drive vorgewandelt — grau, fast formgleich' },
  ],
  wipMerges: [
    { src: 'modules/drive_works_wip_a1.png', cap: 'wip a1 — Kran weg, Deck kahl', bad: true },
    { src: 'modules/drive_works_wip_a2.png', cap: 'wip a2 — Bucht komplett weg', bad: true },
    { src: 'modules/drive_works_wip_a3.png', cap: 'wip a3 — Bucht da, alles grau' },
    { src: 'modules/drive_works_wip_a4.png', cap: 'wip a4 — zerfallen', bad: true },
  ],
  rawMerges: [
    { src: 'modules/drive_works_raw_a1.png', cap: 'raw a1 — Bucht + Palette intakt, GENOMMEN' },
    { src: 'modules/drive_works_raw_a3.png', cap: 'raw a3 — Bucht + Palette intakt, aber Absaugvorrichtungen komisch' },
  ],
};

const CSS = `
:root{color-scheme:dark}
body{margin:0;padding:24px;background:#12151b;color:#d7dce3;font:14px/1.5 system-ui,sans-serif}
h1{font-size:23px;color:#67e8f9;margin:0 0 4px}
h2{font-size:18px;color:#67e8f9;margin:34px 0 6px;border-bottom:1px solid #263041;padding-bottom:4px}
h3{font-size:14px;color:#a5b4fc;margin:18px 0 4px;text-transform:uppercase;letter-spacing:.06em}
p.lead{color:#94a3b8;margin:0 0 8px;max-width:88ch}
.row{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;margin:10px 0}
figure{margin:0;text-align:center}
figure img{background:#1b212c;border:1px solid #2b3545;border-radius:8px;display:block}
figcaption{font-size:11px;color:#94a3b8;margin-top:5px;max-width:240px}
.pick img{border-color:#22d3ee;box-shadow:0 0 0 2px rgba(34,211,238,.28)}
.bad img{border-color:#7f1d1d}
.note{display:flex;align-items:center;justify-content:center;width:200px;height:200px;
      border:1px dashed #3b475c;border-radius:8px;background:#171c25;color:#94a3b8;
      font:11.5px/1.5 ui-monospace,monospace;padding:10px;box-sizing:border-box;text-align:center}
.m{font:11px/1.5 ui-monospace,monospace;color:#64748b}
pre{white-space:pre-wrap;background:#171c25;border:1px solid #263041;border-radius:8px;padding:12px;
    font:11.5px/1.55 ui-monospace,monospace;color:#cbd5e1;max-width:120ch}
table{border-collapse:collapse;margin:8px 0;font-size:13px}
td,th{border:1px solid #263041;padding:5px 10px;text-align:left}
th{color:#94a3b8;font-weight:600}
.ok{color:#34d399}.warn{color:#fbbf24}
.sizewrap{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 16px}
.sizecol{text-align:center}
.sizecol .lbl{font:11px/1.4 ui-monospace,monospace;color:#94a3b8;margin-top:4px;width:150px}
.sizecell{width:150px;height:150px;display:flex;align-items:center;justify-content:center;
          background:#1b212c;border:1px solid #2b3545;border-radius:8px}
`;

(async () => {
  const st = {};
  const all = [];
  for (const f of FAMILY) {
    all.push(f.result, f.today, ...f.products.map((p) => p.src), ...f.candidates.map((c) => c.src));
    if (f.fixtureImg) all.push(f.fixtureImg);
  }
  all.push(B1, B8, ...TRACK.wipProducts.map((x) => x.src), ...TRACK.wipMerges.map((x) => x.src), ...TRACK.rawMerges.map((x) => x.src));
  for (const s of [...new Set(all)]) st[s] = await stats(s);

  const cell = (o, px, cls = '') => {
    const s = st[o.src];
    return `<figure class="${cls}">${img(o.src, `width="${px}" height="${px}" alt="${o.cap}"`)}<figcaption>${o.cap}${
      s ? `<br><span class="m">${s.size} · ${s.cov} · ${s.slope}</span>` : '<br><span class="m warn">FEHLT</span>'
    }</figcaption></figure>`;
  };

  // Spielgroessen-Block: alle sechs nebeneinander, je Groesse eine Zeile.
  const sizeRow = (px, which) => `
  <div class="sizewrap">${FAMILY.map(
    (f) =>
      `<div class="sizecol"><div class="sizecell">${img(which === 'new' ? f.result : f.today, `width="${px}" height="${px}" alt="${f.key}"`)}</div>
       <div class="lbl">${f.key}</div></div>`,
  ).join('')}</div>`;

  const chain = (f) => {
    const fix = f.fixtureImg
      ? cell({ src: f.fixtureImg, cap: `2 · ${f.fixture}` }, 200)
      : `<figure><div class="note">2 · Fertigungsvorrichtung<br>nur im Prompt:<br><br>${f.fixture}</div><figcaption>&nbsp;</figcaption></figure>`;
    return `<div class="row">
      ${cell({ src: B1, cap: '1 · b1 — Hero-Basis' }, 200)}
      ${fix}
      ${f.products.map((p, i) => cell({ src: p.src, cap: `${i + 3} · ${p.cap}` }, 200)).join('\n')}
      ${cell({ src: f.result, cap: 'ERGEBNIS' }, 200, 'pick')}
    </div>`;
  };

  const promptOf = (f) => {
    const jsonFile = f.pick.replace(/^modules\//, '').replace(/\.png$/, '.json');
    const abs = path.join(DIR_SHEET, 'modules', jsonFile);
    if (!fs.existsSync(abs)) return null;
    return JSON.parse(fs.readFileSync(abs, 'utf8')).prompt || null;
  };

  const sections = FAMILY.map((f) => {
    const p = promptOf(f);
    return `
<h2>${f.label}</h2>
<p class="lead"><b>Domaene:</b> ${f.domain}<br>
<b>Vorrichtung:</b> ${f.fixture}<br>
<b>Erkennungsmerkmal bei 48 px:</b> ${f.marker}</p>
${f.note ? `<p class="lead">${f.note}</p>` : ''}
${chain(f)}
${
  f.candidates.length
    ? `<h3>Alle Seeds</h3><div class="row">${f.candidates
        .map((c) => cell(c, 190, c.src === f.pick ? 'pick' : c.bad ? 'bad' : ''))
        .join('\n')}</div>`
    : '<p class="lead">Seeds des Piloten stehen im eigenen Bogen <code>factory-electronics-merge.html</code>.</p>'
}
${p ? `<h3>Merge-Prompt (genommener Seed)</h3><pre>${p.replace(/</g, '&lt;')}</pre>` : ''}`;
  }).join('\n');

  const table = `
<table>
<tr><th>Asset</th><th>Groesse</th><th>Alpha-Deckung</th><th>Iso-Achse links / rechts</th><th>Seeds</th><th>davon Bucht zerstoert</th></tr>
<tr><td>b1 (Basis, Referenz)</td><td>${st[B1].size}</td><td>${st[B1].cov}</td><td>${st[B1].slope}</td><td>—</td><td>—</td></tr>
${FAMILY.map((f) => {
  const s = st[f.result];
  const seeds = f.candidates.length || 5;
  const broken = f.candidates.filter((c) => c.bad).length;
  return `<tr><td>${f.key}_v2</td><td>${s.size}</td><td>${s.cov}</td><td>${s.slope}</td><td>${seeds}</td><td>${
    f.candidates.length ? broken : '3 (Pilot)'
  }</td></tr>`;
}).join('\n')}
</table>`;

  const html = `<!doctype html><meta charset="utf-8"><title>Fabrik-Familie — Basis + Montage</title>
<style>${CSS}</style>
<h1>Fabrik-Familie — sechs Buchten auf derselben Buehne</h1>
<p class="lead">Basis fuer alle sechs ist <code>factory_base_b1.png</code> (Rudis Hero-Wahl). Der Pilot
(Elektronik) ist abgenommen; die fuenf uebrigen sind nach demselben Verfahren gebaut: EIN Merge-Schritt
mit <code>fal-ai/flux-pro/kontext/max/multi</code>, danach <code>birefnet/v2</code>, Tight Crop, 1:1-Padding,
kein Resize. Unter jedem Bild: Groesse · Alpha-Deckung · Iso-Achse (Steigung der beiden unteren
Silhouettenkanten; Referenz b1 = +0.568 / -0.562, abgenommener Pilot = +0.641 / -0.577).</p>
<p class="lead"><b>Abweichung vom Piloten, bewusst:</b> die Montagestrasse b8 traegt Roboter und Platinen,
aber keine Huellenplatte, kein Triebwerk und keine Kabinenzelle. Jede der fuenf hat deshalb ihre eigene
Fertigungsvorrichtung, im Merge-Prompt beschrieben statt als zweites Bild eingespeist. Das ist zugleich das,
was die sechs Buchten bei 48 px auseinanderhaelt — sechsmal dieselbe gelbe Rollenbahn waere ein Rueckschritt
gegenueber heute.</p>

<h2>Spielgroesse — alle sechs nebeneinander</h2>
<h3>Neu — 144 px</h3>${sizeRow(144, 'new')}
<h3>Neu — 96 px</h3>${sizeRow(96, 'new')}
<h3>Neu — 48 px</h3>${sizeRow(48, 'new')}
<h3>Heute — 144 px</h3>${sizeRow(144, 'old')}
<h3>Heute — 96 px</h3>${sizeRow(96, 'old')}
<h3>Heute — 48 px</h3>${sizeRow(48, 'old')}

<h2>Messung gegen b1</h2>
${table}

<h2>Zwei Gleise: lohnt die Vorwandlung der Produkte?</h2>
<p class="lead">Offene Frage aus dem Piloten: dort kostete die Vorstufe („in construction“ je Produkt,
mit Identitaets-Anker) drei Fassungen, und der Zustand ueberlebte den Merge trotzdem nicht. An
<code>drive_works</code> wurden beide Gleise mit denselben vier Seeds gefahren.
<b>Ergebnis: der kuerzere Weg traegt — und ist nicht nur billiger, sondern besser.</b> Die Vorwandlung
zieht beiden Produkten die Farbe aus (alles wird Primer-Grau und formaehnlich), und dieses Grau
dominiert anschliessend den Merge: von vier wip-Seeds haben drei die Bucht beschaedigt oder zerstoert,
waehrend alle fuenf raw-Seeds Bucht, Kran und Blau-Gelb-Palette behalten haben.</p>
<h3>Die vorgewandelten Produkte</h3>
<div class="row">${TRACK.wipProducts.map((o) => cell(o, 200, 'bad')).join('\n')}</div>
<h3>Merge mit Vorwandlung</h3>
<div class="row">${TRACK.wipMerges.map((o) => cell(o, 200, o.bad ? 'bad' : '')).join('\n')}</div>
<h3>Merge ohne Vorwandlung (Original-Assets, „clearly unfinished“ nur im Prompt)</h3>
<div class="row">${TRACK.rawMerges.map((o) => cell(o, 200, 'pick')).join('\n')}</div>

${sections}
`;

  fs.writeFileSync(OUT, html);

  // -- Pfadpruefung: JEDE src-Referenz gegen das Dateisystem --
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
