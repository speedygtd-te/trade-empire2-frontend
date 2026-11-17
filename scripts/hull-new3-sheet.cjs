/**
 * KONTAKTBOGEN für die drei neuen Hüllentypen (COMPOSITE,
 * COMPOSITE_PLATFORM_SPACE, GLASS_CARBON).
 *
 * GERÄTEPIXEL, nicht CSS-Zoom: eine Hülle bedeckt im Spiel
 *   HULL_DRAW_W (48) x zoom x dpr  Gerätepixel
 * (src/views/grid/isoConstants.ts, SURFACE_MAX_ZOOM = 4). Die
 * Darstellungsgröße wird daraus gerechnet: die CSS-Breite ist 48*zoom, der
 * Browser zieht daraus 48*zoom*dpr Gerätepixel aus der 512er Quelle — also
 * immer HERUNTER skaliert, nie hoch. Die 1:1-Ansicht setzt die CSS-Breite auf
 * 512/dpr, damit genau 512 Gerätepixel dargestellt werden.
 *
 * Kennzahlen kommen aus scripts/lib-tile-metrics.cjs / lib-grain.cjs, gemessen
 * an der GESCHRIEBENEN Datei (Docs/LESSONS-asset-pipeline.md §1).
 *
 * Usage: node scripts/hull-new3-sheet.cjs
 * Output: assets/style-test/hull-new3/hull-new3.html (+ Bildkopien daneben)
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const S = require('./lib-tile-metrics.cjs');
const G = require('./lib-grain.cjs');
// Prompts und Seed-Basen kommen aus dem Generator, nicht als zweite Abschrift.
const K = require('./hull-new3-kontext.cjs');
sharp.cache(false);

const PROMPT_MAPS = { hard: K.HARD, r2: K.R2, r3: K.R3, navy: K.NAVY, navy2: K.NAVY2, navy3: K.NAVY3, navy4: K.NAVY4 };
/** Prompt und Seed einer Fassung — `mode` ist der Modus des Generatorlaufs. */
function promptInfo(item) {
  if (!item.mode) return null;
  const type = item.type || 'glass_carbon';
  const p = K.GLASSDIR[item.mode] || (PROMPT_MAPS[item.mode] && PROMPT_MAPS[item.mode][type]);
  if (!p) return null;
  const base = K.JOBS[type] ? K.JOBS[type].seed : 0;
  const seed = base + (K.SEED_OFFSETS[item.mode] || 0) + (item.off || 0) * 137;
  return { prompt: p, seed };
}
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function promptBlock(item) {
  const pi = promptInfo(item);
  if (!pi) return '';
  return `<details><summary>Prompt · Seed ${pi.seed}</summary><pre class=prompt>${esc(pi.prompt)}</pre></details>`;
}

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'style-test', 'hull-new3');
const ATT = path.join(OUT, 'attempts');
const SRC = path.join(ROOT, 'src', 'assets', 'hulls');
const NEW = path.join(ROOT, 'assets', 'hulls');

// ── Messung ────────────────────────────────────────────────────────────────
function chamfer(A, w, h) {
  const D = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) D[p] = A[p] ? 1e9 : 0;
  const a = [[-1, -1, 1.414], [0, -1, 1], [1, -1, 1.414], [-1, 0, 1]];
  const b = [[1, 1, 1.414], [0, 1, 1], [-1, 1, 1.414], [1, 0, 1]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = y * w + x; if (!D[p]) continue;
    for (const [dx, dy, c] of a) { const nx = x + dx, ny = y + dy; const v = (nx < 0 || ny < 0 || nx >= w || ny >= h) ? 0 : D[ny * w + nx]; if (v + c < D[p]) D[p] = v + c; } }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const p = y * w + x; if (!D[p]) continue;
    for (const [dx, dy, c] of b) { const nx = x + dx, ny = y + dy; const v = (nx < 0 || ny < 0 || nx >= w || ny >= h) ? 0 : D[ny * w + nx]; if (v + c < D[p]) D[p] = v + c; } }
  return D;
}
/** meso = sd(Blur r6 - Blur r32) / p70 x100, über den um rOut+4 EROdierten
 *  Alphabereich (die Diamant-Innenmaske aus lib-meso passt nicht auf Sprites). */
function mesoEroded(data, ch, w, h, p70, rIn = 6, rOut = 32) {
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) { L[p] = S.L709(data[p * ch], data[p * ch + 1], data[p * ch + 2]); A[p] = data[p * ch + 3] >= 250 ? 1 : 0; }
  const bi = G.blurOpaque(L, A, w, h, rIn), bo = G.blurOpaque(L, A, w, h, rOut);
  const D = chamfer(A, w, h);
  let s = 0, q = 0, n = 0;
  for (let p = 0; p < w * h; p++) { if (!A[p] || D[p] < rOut + 4) continue; const v = bi[p] - bo[p]; s += v; q += v * v; n++; }
  if (n < 100) return NaN;
  const m = s / n;
  return p70 > 1e-6 ? 100 * Math.sqrt(Math.max(0, q / n - m * m)) / p70 : NaN;
}
/** ALPHA-MASSIVITÄT: Glaswände dürfen das Sprite nicht durchsichtig machen.
 *  Gezählt werden transparente/halbtransparente Pixel, die vom Bildrand aus
 *  NICHT erreichbar sind — also Löcher IN der Silhouette. `holes` muss 0 sein;
 *  `minA` ist das kleinste Alpha innerhalb der Silhouette. Am Auge ist das
 *  nicht zu sehen, deshalb wird es gezählt, nicht begutachtet. */
function alphaSolidity(data, ch, w, h) {
  const outside = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => { const p = y * w + x; if (!outside[p] && data[p * ch + 3] < 250) { outside[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const p = stack.pop(), x = p % w, y = (p - x) / w;
    if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1);
  }
  let holes = 0, minA = 255, inner = 0;
  for (let p = 0; p < w * h; p++) {
    if (outside[p]) continue;
    inner++;
    const a = data[p * ch + 3];
    if (a < minA) minA = a;
    if (a < 250) holes++;
  }
  return { holes, minA, inner };
}
async function measure(file) {
  const { data, info } = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, ch = info.channels;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * ch + 3] > 16) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const st = S.statsRaw(data, ch, w, h);
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const al = alphaSolidity(data, ch, w, h);
  return { w, h, bw, bh, aspect: bw / bh, cover: st.nOpaque / (w * h) * 100,
    p70: st.p70, blow: st.blow * 100, br: st.br, gr: st.gr, dark: st.dark * 100,
    meso: mesoEroded(data, ch, w, h, st.p70), grain: G.grain(data, ch, w, h).half,
    holes: al.holes, minA: al.minA, inner: al.inner };
}

// ── Bilder des Bogens ──────────────────────────────────────────────────────
const BLOCKS = [
  {
    id: 'COMPOSITE', title: 'COMPOSITE — Composite Hull ✅ ABGENOMMEN (Seed 1271001)',
    meta: 'INDOOR · SURFACE, SPACE · 1800 HP (härteste Hülle im Spiel) · Composite Armor 12, Titanium Plate 8, Structural Frame 4',
    desc: '„Composite hull for warships and combat vehicles. Light and tough, mobile structures only."',
    hero: { file: path.join(NEW, 'composite', 'composite_0.png'), name: 'composite_0', type: 'composite', mode: 'navy4', label: 'NEU — COMPOSITE (Fassung B: bernstein-warmweiße Kanten)' },
    refs: [
      { file: path.join(SRC, 'reinforced', 'reinforced_0.webp'), name: 'ref_reinforced_0', label: 'Bestand REINFORCED' },
      { file: path.join(SRC, 'standard', 'standard_0.webp'), name: 'ref_standard_0', label: 'Bestand STANDARD' },
    ],
    alts: [
      { file: path.join(ATT, 'composite_navy3.png'), name: 'alt_composite_navy3', type: 'composite', mode: 'navy3', label: 'FASSUNG A — Bänder + cyane Kanten', note: 'Dieselbe Runde, aber die cyanen Leuchtkanten von STANDARD bleiben stehen. Mit Navy und breitem Gelb ist Cyan eine dritte Akzentfarbe — deshalb liegt oben Fassung B mit bernstein-warmweißen Kanten. Nicht stillschweigend geändert: hier stehen beide, du entscheidest.' },
      { file: path.join(ATT, 'composite_navy.png'), name: 'alt_composite_navy_sparse', type: 'composite', mode: 'navy', label: 'Vorstufe — Navy mit sparsamem Gelb', note: 'Vor deiner Korrektur: Gelb nur als Akzent. Zum Vergleich, wie viel die breiten Bänder tatsächlich ausmachen.' },
      { file: path.join(ATT, 'composite_r2.png'), name: 'alt_composite_r2', type: 'composite', mode: 'r2', label: 'Vorstufe — Karbon ohne Navy', note: 'Der Beleg für das Materialproblem: Karbongewebe auf dunkelgrauem Panzer liegt dunkel auf dunkel und ist praktisch unsichtbar. Erst der Navy-Kontrast macht es lesbar.' },
      { file: path.join(ATT, 'composite_r1final.png'), name: 'alt_composite_r1final', label: 'Runde 1 — Abgabe von vorhin', note: 'Das Aussehen, das du gelobt hast — aber „wenig nach composite".' },
      { file: path.join(ATT, 'composite_t2i.png'), name: 'alt_composite_t2i', label: 'Runde 1, Versuch 1 — text-to-image', note: 'Familien-Geometrie verfehlt: offene Grube im Dach, eigene Silhouette, Blowout 6.9 %.' },
    ],
  },
  {
    id: 'COMPOSITE_PLATFORM_SPACE', title: 'COMPOSITE_PLATFORM_SPACE — Composite Space Platform ✅ ABGENOMMEN (freies Deck, Seed 1233001)',
    meta: 'OUTDOOR · SURFACE, SPACE · 80 HP · Composite Armor 6, Titanium Plate 4',
    desc: '„Armoured outdoor platform for laser mounts on warships." — Sockel, kein Geschütz: die Waffe ist ein eigenes Modul.',
    hero: { file: path.join(NEW, 'composite_platform_space', 'composite_platform_space_0.png'), name: 'composite_platform_space_0', type: 'composite_platform_space', mode: 'navy3', label: 'NEU — COMPOSITE_PLATFORM_SPACE (freies Deck)' },
    refs: [
      { file: path.join(SRC, 'platform_space', 'platform_space_0.webp'), name: 'ref_platform_space_0', label: 'Bestand PLATFORM_SPACE' },
      { file: path.join(SRC, 'platform_outdoor', 'platform_outdoor_0.webp'), name: 'ref_platform_outdoor_0', label: 'Bestand PLATFORM_OUTDOOR' },
    ],
    alts: [
      { file: path.join(ATT, 'composite_platform_space_pedestals_rejected.png'), name: 'alt_cps_pedestals', type: 'composite_platform_space', mode: 'navy3', off: 2, label: 'VERWORFEN — Fassung mit vier Lasersockeln', note: 'Rudi: die Sockel sind fremd im Hüllenbestand, auch wenn sie fachlich erklärbar sind. Freies Deck gewinnt — und die Abgabe hat dadurch sogar den besseren Grundriss (−3.5 % statt −4.2 %).' },
      { file: path.join(ATT, 'composite_platform_space_navy3_s1.png'), name: 'alt_cps_navy3_s1', type: 'composite_platform_space', mode: 'navy3', off: 1, label: 'Alternative — bester Grundriss', note: 'Grundriss 1.4715 (−2.4 %, die beste Rückgabe der Runde), aber das gelbe Band ist auf einen Fleck zusammengefallen und es stehen keine Sockel auf dem Deck. Wenn dir der Grundriss über allem steht: diese.' },
      { file: path.join(ATT, 'composite_platform_space_navy.png'), name: 'alt_cps_navy_sparse', type: 'composite_platform_space', mode: 'navy', label: 'Vorstufe — Navy mit sparsamem Gelb', note: 'Vor der Korrektur, Gelb kaum sichtbar. Achtung: dieser Re-Roll hat die Rückgabe mit Grundriss +0.5 % überschrieben, bevor der Dateiname den Seed-Offset trug — der Fehler ist im Skript behoben.' },
      { file: path.join(ATT, 'composite_platform_space_r1final.png'), name: 'alt_cps_r1final', label: 'Runde 1 — Abgabe von vorhin', note: 'Dunkelgrau, Grundriss −7.8 % (das Untermaß, das diese Runde mitgezogen hat).' },
      { file: path.join(ATT, 'composite_platform_space_t2i.png'), name: 'alt_cps_t2i', label: 'Runde 1, Versuch 1 — text-to-image', note: 'Ohne Reling, eigener Formenkanon, p70 145.9 gegen 25.8 / 56.9 im Bestand.' },
    ],
  },
  {
    id: 'GLASS_CARBON', title: 'GLASS_CARBON — Glass &amp; Carbon Hull ✅ ABGENOMMEN (G pur, Seed 1452001)',
    meta: 'INDOOR · nur SURFACE · 180 HP · Structural Frame 10, Glass 15, Carbon Fiber 12, Advanced Electronics 4',
    desc: '„Bright surface hull of glass and carbon fiber. Radiates comfort and greenery to the module it hosts." — <b>„greenery" ist Spielmechanik, nicht Motiv:</b> leerer Innenraum, nur die Wände verglast, Decke Sicht-Karbon in Anthrazit. Die Nähe zu STANDARD ist gewollt — die Hülle folgt der Designsprache, und ihre Kennzeichen sind die zwei neuen Materialien: Glas und Sicht-Karbon.',
    hero: { file: path.join(NEW, 'glass_carbon', 'glass_carbon_0.png'), name: 'glass_carbon_0', mode: 'ge', label: 'ABGENOMMEN — G pur, Familienchassis verglast' },
    refs: [
      { file: path.join(SRC, 'airtight', 'airtight_0.webp'), name: 'ref_airtight_0', label: 'Bestand AIRTIGHT' },
      { file: path.join(SRC, 'standard', 'standard_0.webp'), name: 'ref_standard_0', label: 'Bestand STANDARD' },
    ],
    // Die Entscheidungszeile: G pur gegen die vier Kombinationsversuche.
    gallery: [
      { file: path.join(ATT, 'glass_carbon_ge.png'), name: 'g_ge', mode: 'ge', label: 'G pur ✅' },
      { file: path.join(ATT, 'glass_carbon_gz.png'), name: 'g_gz', mode: 'gz', label: 'G + Geflecht (verworfen)' },
      { file: path.join(ATT, 'glass_carbon_gx.png'), name: 'g_gx', mode: 'gx', label: 'Kombi Seed A' },
      { file: path.join(ATT, 'glass_carbon_gx_s1.png'), name: 'g_gx1', mode: 'gx', off: 1, label: 'Kombi Seed B' },
      { file: path.join(ATT, 'glass_carbon_gx_s2.png'), name: 'g_gx2', mode: 'gx', off: 2, label: 'Kombi Seed C' },
      { file: path.join(ATT, 'glass_carbon_gh.png'), name: 'g_gh', mode: 'gh', label: 'E Hexagon (Vorlauf)' },
      { file: path.join(ATT, 'glass_carbon_go.png'), name: 'g_go', mode: 'go', label: 'F Organisch (Vorlauf)' },
    ],
    alts: [
      { file: path.join(ATT, 'glass_carbon_gz.png'), name: 'alt_glass_gz', mode: 'gz', label: 'VERWORFEN — G + Hexagon-Geflecht (Seed 1652001)', note: 'Rudi: „zu überladen und unruhig, vor allem in kleineren zoomstufen." Technisch war der additive Weg ein Erfolg — Bbox, Grundriss und Pegel von G blieben exakt erhalten, dazu meso +35 %. Genau daran hängt die Lehre unten: erkennbar ist nicht gut.' },
      { file: path.join(ATT, 'glass_carbon_gx.png'), name: 'alt_glass_gx', mode: 'gx', label: 'VERWORFEN — Kombi Seed A aus standard_0 (Seed 1572001)', note: 'Geflecht als helle geätzte Linien auf der Scheibe statt als Gitter dahinter, wenige Knotenpunkte; Glas deutlich heller (p70 126.7 gegen 84.3 bei G).' },
      { file: path.join(ATT, 'glass_carbon_gx_s1.png'), name: 'alt_glass_gx1', mode: 'gx', off: 1, label: 'VERWORFEN — Kombi Seed B (Seed 1572138)', note: 'Geflecht nur auf der linken Scheibe ausgeprägt, rechts fast leer — asymmetrisch.' },
      { file: path.join(ATT, 'glass_carbon_gx_s2.png'), name: 'alt_glass_gx2', mode: 'gx', off: 2, label: 'VERWORFEN — Kombi Seed C (Seed 1572275)', note: 'Gröbste Zellen der Runde, dafür etwas dünnerer Rahmen.' },
      { file: path.join(ATT, 'glass_carbon_gh.png'), name: 'alt_glass_gh', mode: 'gh', label: 'E — Hexagon-Geflecht ohne Chassis (Seed 1492001)', note: 'Die Vorlage für das Geflecht. Deine Kritik trifft: außer dem Geflecht ist daran nichts.' },
      { file: path.join(ATT, 'glass_carbon_go.png'), name: 'alt_glass_go', mode: 'go', label: 'F — Organisches Karbonnetz (Seed 1532001)', note: 'Trägt auf Spielskala genauso; die Adern lesen bei 144 px etwas nach Rissen im Glas.' },
      { file: path.join(ATT, 'glass_carbon_gb.png'), name: 'alt_glass_gb', mode: 'gb', label: 'B — Smart-Glass mit Leuchtfugen (Seed 1332001)', note: 'Kräftigste Kantenlichter, sauberes Glas — aber ohne eigene Struktur hinter den Scheiben.' },
      { file: path.join(ATT, 'glass_carbon_ga.png'), name: 'alt_glass_ga', mode: 'ga', label: 'A — Tech-Rahmen mit Sockelband (Seed 1292001)', note: 'Das anthrazitene Sockelband gibt Körper, ist aber die sachlichste der Runde.' },
      { file: path.join(ATT, 'glass_carbon_gc.png'), name: 'alt_glass_gc', mode: 'gc', label: 'C — Karbon-Exoskelett (Seed 1372001)', note: 'Der einzige Beleg zum Deckengewebe: Twill auf Pfosten, Rahmen UND Decke bei 512 px lesbar — bei 144 px weg.' },
      { file: path.join(ATT, 'glass_carbon_gd.png'), name: 'alt_glass_gd', mode: 'gd', label: 'D — Facettierte Verglasung (Seed 1412001)', note: 'Die Facetten kommen als schräge cyane Linien zurück, das liest wie Kratzer.' },
      { file: path.join(ATT, 'glass_carbon_r3.png'), name: 'alt_glass_r3', mode: 'r3', label: 'VERWORFEN — die „zu einfache" Fassung', note: 'Die Abgabe von vorhin. Deine Diagnose trifft: schlanker Rahmen, kein Körper, dicke Platte oben — liest wie eine Vitrine, nicht wie ein Baukörper.' },
      { file: path.join(ATT, 'glass_carbon_r1final.png'), name: 'alt_glass_r1final', label: 'VERWORFEN — Gewächshaus', note: 'Mein Fehler aus Runde 1: „greenery" aus der Backend-Beschreibung ist Spielmechanik (Emissionsbonus), nicht Motiv.' },
    ],
  },
];

const CAVEATS = `
<h2>Zu den Kennzahlen</h2>
<p class=note>Gemessen an der <b>geschriebenen</b> Datei (LESSONS §1), über den opaken Pixeln.
Der Korpus in <code>Docs/LESSONS-asset-pipeline.md</code> ist gegen <b>512×256-Rautenkacheln</b>
kalibriert — seine Bänder gelten hier <b>nicht</b>. Vergleichsmaßstab ist ausschließlich der
Hüllen-Bestand in derselben Tabelle.</p>
<ul class=note>
<li><b>Grundriss</b> (Objekt-Bbox und deren Seitenverhältnis) — das harte Kriterium: die Hülle
muss neben ihren Nachbarn gleich groß und gleich flach liegen. Keine LESSONS-Kennzahl,
sondern Geometrie.</li>
<li><b>p70</b> — Pegel (70. Perzentil der opaken Luma). Für die Farb-/Helligkeitsnähe zur
Familie. Wenn er nicht passt, kommt er aus einem <i>Grade</i>, nicht aus dem Prompt (§2).</li>
<li><b>meso</b> = sd(Blur r6 − Blur r32) / p70 ×100 — Relief auf Bauteilgröße, das Band, in dem
„flach" wohnt. <b>Vorbehalt:</b> das Band ist r6–r32; <i>wenige breite Formen</i> zahlen dort
nicht ein (§5), und die Diamant-Innenmaske aus <code>lib-meso</code> passt nicht auf ein
Sprite — hier ist die Maske eine <b>Erosion</b> des Alphabereichs um r+4.</li>
<li><b>grain</b> — Autokorrelations-Halbwertslänge des Hochpasses in px: trennt „stark und
fein" von „stark und klobig", was ein Kontrastmaß nicht kann.</li>
<li><b>B/R, G/R</b> — Farbton als Kanalverhältnis. <b>Vorbehalt:</b> Farbe ist ein
<i>Feld</i>, keine Konstante; das Paar cbPP/cbSd, das das ausdrücken würde, ist auf diesen
Sprites <b>undefiniert</b> — Blöcke mit Mittel-R = 0 (Fugen, Schattenkanten, transparente
Ränder) kippen die ganze Kennzahl auf NaN (§5).</li>
<li><b>blow%</b> (Anteil opaker Pixel über Luma 200) nur als Runden-Grenze mitgeführt.
<b>Vorbehalt:</b> <i>kein</i> Indikator für „unbearbeitet" — das ausgelieferte
<code>silicate_plain</code> liegt bei 47–70 % und ist fertig (§5).</li>
<li><b>Nicht geführt:</b> micro4/micro8 (zwei nicht austauschbare Definitionen, und ein
Unsharp erfüllt sie ohne Bildgewinn — Diagnose, kein Kriterium, §5), Faltmetrik/Naht
(Kachelmaße, hier sinnlos), Blowout als Zustandsdiagnose, cbPP/cbSd (siehe oben).</li>
</ul>
<p class=note><b>Lehre dieser Runde:</b> „bei 144 Gerätepixeln noch erkennbar" ist <b>nicht</b> dasselbe wie „bei 144 Gerätepixeln gut". Das Hexagon-Geflecht hat die Lesbarkeitsschwelle bestanden und das Bild trotzdem zugebaut — auf Spielskala las es als Unruhe, nicht als Struktur. Und <code>meso</code> misst zusätzliches Relief, ohne zwischen <i>Tiefe</i> und <i>Unruhe</i> unterscheiden zu können: +35 % waren echt und trotzdem kein Argument. Genau die Sorte Kennzahl, vor der LESSONS §5 warnt — sie beantwortet eine Frage, die niemand gestellt hat. Das Urteil fällt am gemischten Feld auf Spielskala, nicht an der Zahl.</p>
<p class=note><b>Iso-Validierung</b> (<code>scripts/validate-iso.ts --type hull</code>): alle drei neuen
Sprites bestehen Alpha, Deckung, Beleuchtung oben-links und 1:1 — und fallen, <b>genau wie die
abgenommenen Bestandssprites</b>, durch die Tight-Crop-Prüfung: Hüllen sind absichtlich
<i>nicht</i> tight gecroppt, sondern auf die Bbox+Offset der Basis gesetzt, damit sie auf der
Iso-Zelle sitzen. Für diese Familie ist die Prüfung kein Kriterium.</p>`;

const ZOOMS = [4, 2, 1];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const rows = [];
  const copy = async (item) => {
    const dest = path.join(OUT, `${item.name}.png`);
    if (path.resolve(item.file) !== path.resolve(dest)) {
      await sharp(fs.readFileSync(item.file)).png().toFile(dest);
    }
    const m = await measure(dest);
    return { ...item, src: `${item.name}.png`, m };
  };

  const blocks = [];
  for (const b of BLOCKS) {
    const hero = await copy(b.hero);
    const refs = []; for (const r of b.refs) refs.push(await copy(r));
    const alts = []; for (const a of b.alts) alts.push(await copy(a));
    const gallery = []; for (const g of (b.gallery || [])) gallery.push(await copy(g));
    blocks.push({ ...b, hero, refs, alts, gallery });
    rows.push({ label: `${b.id} (neu)`, ...hero.m });
    for (const r of refs) rows.push({ label: r.label, ...r.m });
  }

  const num = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');
  const metricTable = (m, base) => {
    const dev = base ? ((m.aspect - base.aspect) / base.aspect) * 100 : null;
    return `<table class=met>
<tr><th>Grundriss</th><td>${m.bw}×${m.bh} px · <b>${num(m.aspect, 3)}</b>${dev !== null ? ` <span class="${Math.abs(dev) < 2 ? 'ok' : Math.abs(dev) < 5 ? 'warn' : 'bad'}">(${dev >= 0 ? '+' : ''}${dev.toFixed(1)} %)</span>` : ''}</td></tr>
<tr><th>Deckung</th><td>${num(m.cover, 1)} % der 512²-Fläche</td></tr>
<tr><th>p70 (Pegel)</th><td>${num(m.p70, 1)}</td></tr>
<tr><th>meso</th><td>${num(m.meso)}</td></tr>
<tr><th>grain</th><td>${num(m.grain)} px</td></tr>
<tr><th>B/R · G/R</th><td>${num(m.br, 3)} · ${num(m.gr, 3)}</td></tr>
<tr><th>blow%</th><td>${num(m.blow)}</td></tr>
<tr><th>Alpha massiv</th><td><span class="${m.holes === 0 ? 'ok' : 'bad'}">${m.holes === 0 ? 'ja' : m.holes + ' Löcher'}</span> · min. Alpha innen ${m.minA}</td></tr>
</table>`;
  };

  const cell = (item, base, cls) => `<figure class="${cls || ''}">
  <div class=one><img class=onepx src="${item.src}" alt="${item.label}"></div>
  <figcaption><b>${item.label}</b><br><span class=fn>${item.src}</span></figcaption>
  ${metricTable(item.m, base)}
  ${promptBlock(item)}
</figure>`;

  const scaleStrip = (items) => `<div class=scaleblock>${ZOOMS.map((z) => `
    <div class=scalerow>
      <div class=zlab>zoom ${z}<br><span class=fn>48×${z}×dpr Gerätepixel<br>= <span class="devpx" data-z="${z}"></span></span></div>
      ${items.map((it) => `<div class=zcell><img class="gs z${z}" src="${it.src}" alt="${it.label}"></div>`).join('')}
    </div>`).join('')}
    <div class=scalerow><div class=zlab></div>${items.map((it) => `<div class="zcell zname">${it.label}</div>`).join('')}</div>
  </div>`;

  const blockHtml = (b) => {
    const base = b.refs[0].m;
    return `<section>
  <h2>${b.title}</h2>
  <p class=meta>${b.meta}</p>
  <p class=desc>${b.desc}</p>
  <h3>1:1 — 512 Gerätepixel je Bild</h3>
  <div class=row>${cell(b.hero, base, 'hero')}${b.refs.map((r) => cell(r, base)).join('')}</div>
  <h3>Spielskala — aus Gerätepixeln gerechnet</h3>
  ${scaleStrip([b.hero, ...b.refs])}
  ${b.gallery && b.gallery.length ? `<h3>Entscheidungszeile auf Spielskala — G pur gegen G + Geflecht</h3>
  <p class=note>Ein feines Muster ist auf 144 Gerätepixeln tot; nur was in dieser Zeile lesbar bleibt, trägt im Spiel etwas bei. Und alles, was Fenster oder Karbon am Chassis verdeckt, ist eine Verschlechterung — auch wenn es bei 512 px reicher aussieht.</p>
  ${scaleStrip(b.gallery)}` : ''}
  <h3>Fassungen und verworfene Versuche — 256 Gerätepixel</h3>
  <div class=row>${b.alts.map((a) => `<figure class=alt>
    <div class=one><img class="onepx half" src="${a.src}" alt="${a.label}"></div>
    <figcaption><b>${a.label}</b><br><span class=fn>attempts/${path.basename(a.file)}</span><br>
    Grundriss ${a.m.bw}×${a.m.bh} · ${num(a.m.aspect, 3)} · p70 ${num(a.m.p70, 1)} · meso ${num(a.m.meso)} · Alpha ${a.m.holes === 0 ? 'massiv' : a.m.holes + ' Löcher'}<br>
    <span class=why>${a.note}</span>${promptBlock(a)}</figcaption></figure>`).join('')}</div>
</section>`;
  };

  const summary = `<h2>Alle Werte nebeneinander</h2>
<table class=big><thead><tr><th>Sprite</th><th>Bbox</th><th>Grundriss</th><th>Deckung %</th><th>p70</th><th>meso</th><th>grain</th><th>B/R</th><th>G/R</th><th>blow%</th></tr></thead><tbody>
${rows.map((r) => `<tr class="${/neu/.test(r.label) ? 'isnew' : ''}"><td>${r.label}</td><td>${r.bw}×${r.bh}</td><td>${num(r.aspect, 3)}</td><td>${num(r.cover, 1)}</td><td>${num(r.p70, 1)}</td><td>${num(r.meso)}</td><td>${num(r.grain)}</td><td>${num(r.br, 3)}</td><td>${num(r.gr, 3)}</td><td>${num(r.blow)}</td></tr>`).join('\n')}
</tbody></table>`;

  const html = `<!doctype html><meta charset=utf8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>Drei neue Hüllen — Kontaktbogen</title>
<style>
:root{--bg:#14161a;--fg:#e8eaed;--dim:#9aa3ad;--card:#1c1f25;--line:#2c313a}
body{background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif;margin:0;padding:20px 16px 60px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:34px 0 4px;border-bottom:1px solid var(--line);padding-bottom:6px}
h3{font-size:14px;color:var(--dim);margin:22px 0 8px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.meta{color:var(--dim);margin:2px 0}.desc{margin:2px 0 10px}
.note{color:var(--dim);max-width:80ch}ul.note{padding-left:20px}
.row{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px}
figure.hero{border-color:#3d6ea5}
.one{background:repeating-conic-gradient(#2a2d33 0 25%,#22252a 0 50%) 0 0/28px 28px;border-radius:4px;display:flex;justify-content:center}
/* GERÄTEPIXEL: 512/dpr CSS-Pixel => genau 512 Gerätepixel aus der Quelle */
img.onepx{width:calc(512px / var(--dpr,1));height:auto;image-rendering:auto;max-width:100%}
img.onepx.half{width:calc(256px / var(--dpr,1))}
figure.alt{max-width:340px}
figcaption{font-size:12.5px;margin-top:8px}
.fn{color:var(--dim);font-family:ui-monospace,monospace;font-size:11px}
.why{color:#e0b070}
table.met{border-collapse:collapse;margin-top:8px;font-size:12px}
table.met th{text-align:left;color:var(--dim);font-weight:500;padding:1px 10px 1px 0;white-space:nowrap}
table.met td{padding:1px 0}
.ok{color:#6cc17a}.warn{color:#e0b070}.bad{color:#e07070}
.scaleblock{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;display:inline-block;max-width:100%;overflow-x:auto}
.scalerow{display:flex;align-items:flex-end;gap:18px;margin-bottom:14px}
.zlab{width:130px;flex:none;color:var(--dim);font-size:12px}
.zcell{width:200px;flex:none;display:flex;justify-content:center;align-items:flex-end;background:#0d1013;border-radius:4px;padding:6px 0}
.zname{font-size:11px;color:var(--dim);background:none;text-align:center;display:block}
/* Spielskala: CSS-Breite = 48*zoom, mal dpr ergibt die Gerätepixel */
img.gs{height:auto;image-rendering:auto}
img.z4{width:192px}img.z2{width:96px}img.z1{width:48px}
table.big{border-collapse:collapse;font-size:12.5px;margin-top:8px}
table.big th,table.big td{border:1px solid var(--line);padding:4px 8px;text-align:right}
table.big th:first-child,table.big td:first-child{text-align:left}
table.big tr.isnew{background:#1e2a38}
pre.prompt{white-space:pre-wrap;font-size:11px;line-height:1.45;color:#b8c2cc;background:#15181d;border:1px solid var(--line);border-radius:4px;padding:8px;max-width:60ch}
details summary{cursor:pointer;color:#8fb4dd;font-size:12px;margin-top:6px}
code{font-family:ui-monospace,monospace;font-size:12px;color:#a8c7e8}
#dprbox{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px;display:inline-block;margin:10px 0}
</style>
<h1>Drei neue Hüllen — Basisvariante <code>_0</code></h1>
<p class=note>Nur die Basisbilder. Keine Varianten <code>_1.._3</code>, keine Lit-Fassungen, keine Mipmaps,
keine Integration in <code>src/</code>. Jeder neue Typ steht neben zwei Bestandshüllen derselben Bauart.</p>
<div id=dprbox>
  <b>Gerätepixel dieses Bildschirms:</b> dpr = <span id=dpr>?</span> ·
  1:1-Ansicht = 512 Gerätepixel (CSS-Breite <span id=csspx>?</span> px) ·
  Spielskala zoom 4 = <span id=gs4>?</span> Gerätepixel bei <code>HULL_DRAW_W = 48</code>
  (<code>SURFACE_MAX_ZOOM = 4</code>).
  <div class=fn id=warn></div>
</div>
${blocks.map(blockHtml).join('\n')}
${summary}
${CAVEATS}
<script>
(function(){
  var dpr = window.devicePixelRatio || 1;
  document.documentElement.style.setProperty('--dpr', dpr);
  document.getElementById('dpr').textContent = dpr;
  document.getElementById('csspx').textContent = (512/dpr).toFixed(1);
  document.getElementById('gs4').textContent = Math.round(48*4*dpr);
  document.querySelectorAll('.devpx').forEach(function(el){
    var z = parseFloat(el.getAttribute('data-z'));
    el.textContent = Math.round(48*z*dpr) + '×' + Math.round(48*z*dpr) + ' px';
  });
  var need = 48*4*dpr;
  document.getElementById('warn').textContent = need > 512
    ? 'Hinweis: zoom 4 braucht ' + Math.round(need) + ' Gerätepixel, die Quelle hat 512 — diese eine Zeile skaliert um Faktor ' + (need/512).toFixed(2) + ' hoch. Alle anderen Ansichten skalieren herunter.'
    : 'Alle Ansichten skalieren aus der 512er Quelle herunter.';
})();
</script>`;

  fs.writeFileSync(path.join(OUT, 'hull-new3.html'), html);
  console.log('sheet:', path.join(OUT, 'hull-new3.html'));
  for (const r of rows) console.log(`  ${r.label.padEnd(34)} ${String(r.bw + 'x' + r.bh).padEnd(9)} aspect ${r.aspect.toFixed(3)}  p70 ${r.p70.toFixed(1).padStart(6)}  meso ${r.meso.toFixed(2).padStart(6)}  grain ${r.grain.toFixed(2)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
