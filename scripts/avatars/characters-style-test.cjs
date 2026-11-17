/**
 * STYLE TEST (kein Produktionslauf): Neuentwurf der drei Cutscene-Charaktere
 * fuer die inzwischen dreckige/rough Bildsprache ("The Expanse", dunkles
 * Metall, abgenutzte Oberflaechen).
 *
 * Es wird NICHTS integriert. Dieses Script schreibt ausschliesslich nach
 * assets/style-test/characters/. Es fasst weder src/assets/ noch
 * scripts/avatars/characters.ts noch src/data/cutscenes.ts an, und es
 * ueberschreibt keine Datei unter assets/avatars/.
 *
 * ── Warum GANZKOERPER und nicht halbnah ───────────────────────────────────
 * Das Basis-Bild ist eine QUELLE, kein fertiges Bild. Aus einer ganzen Figur
 * laesst sich jederzeit ein Portrait beschneiden, aus einem Portrait nie eine
 * ganze Figur. Und die Bilder gehen in die Video-Pipeline (generate-video.ts,
 * wan-story-2seg.ts, batch-*-cutscenes.ts): ein halbnahes Portrait gibt dem
 * Video-Modell einen sprechenden Kopf, eine ganze Figur einen Koerper, der
 * sich bewegen kann. Die bestehenden Avatare unter assets/avatars/base/ sind
 * "half-body portrait" — genau das wird hier nicht fortgeschrieben.
 *
 * Vier Konsequenzen, die im Prompt und in der Pruefung haengen:
 *   a) Aufloesung ist der Kern, nicht ein Extra. Ein Portrait-Zuschnitt aus
 *      einer stehenden Figur hat nur einen Bruchteil der Pixel. metrics.json
 *      weist deshalb die Kopfhoehe in Pixeln aus (headPx*) — daran entscheidet
 *      sich, ob fuer Nahaufnahmen spaeter eigene Bilder noetig sind.
 *   b) Stehen, nicht agieren. Eine eingefrorene Bewegung (der rennende
 *      Professor) taugt als Quelle nicht: daraus laesst sich weder ein
 *      Portrait noch eine andere Bewegung ableiten. Die Haltung soll die Figur
 *      erkennbar machen, ohne einen Moment festzunageln.
 *   c) Rand lassen. Wer den Rahmen beruehrt, laesst sich nicht mehr
 *      beschneiden und nicht mehr animieren — oben, unten und seitlich Luft.
 *   d) Gleicher Massstab ueber alle drei. Wenn sie gegeneinander geschnitten
 *      werden, duerfen sie nicht verschieden gross wirken: Augenhoehe,
 *      Kameraabstand und Figurenhoehe im Rahmen sind fuer alle drei identisch
 *      (STAGING), unterschiedlich sind nur Haltung, Kleidung, Hintergrund.
 *
 * Pipeline je Variante:
 *   1. fal-ai/flux-pro/v1.1-ultra, aspect_ratio 9:16, raw=true
 *      -> 1536x2752 nativ. flux-pro/v1.1 (der Pfad der Alt-Avatare) faellt aus:
 *         es klemmt JEDE Kante auf 1440 px, eine 9:16-Anfrage kam dort als
 *         1440x1440 zurueck — fuer eine stehende Figur unbrauchbar.
 *         raw=true, weil der Auftrag ausdruecklich gegen den KI-Hochglanz-Look
 *         arbeitet; ultra liefert damit weniger nachbearbeitete Bilder.
 *   2. fal-ai/creative-upscaler 2x -> 3072x5504.
 *   3. Ablage:
 *        raw/<id>_src.png  3072x5504, Arbeitsquelle
 *        raw/<id>.jpg      2048 px breit, Ansicht
 *        face/<id>.jpg     Portrait-Zuschnitt aus der 3072er Fassung, 1:1-Pixel
 *                          — genau der Zuschnitt, den eine Cutscene-Nahaufnahme
 *                            spaeter nehmen wuerde
 *        cutout/<id>.png   2048 px breit, freigestellt
 *   4. Freistellen ueber den JUENGSTEN freigegebenen Pfad: fal-ai/birefnet/v2
 *      mit model='Portrait', operating_resolution='2048x2048',
 *      refine_foreground=true — exakt der Parametersatz aus
 *      utils.ts:BIREFNET_PORTRAIT_MATTING (Commit af845745). KEINE
 *      Alpha-Levels-Kurve, KEINE manuelle Spill-Decontamination.
 *      Gemattet wird die 2048er Fassung, nicht die 3072er: birefnet rechnet
 *      intern bei 2048x2048, auf 3072x5504 wuerde die Matte klein gerechnet
 *      und hochskaliert — genau der Fehler aus Commit af845745.
 *      Die Trennbarkeit wird nicht dem Matting ueberlassen, sondern im Prompt
 *      hergestellt (SEPARATION: heller, diesiger Hintergrund + Kantenlicht
 *      rund um die Silhouette). Das ist derselbe Gedanke wie Stufe 1 von
 *      uni-bg-cutout.cjs — nur ohne dessen Nachteil, dass der kontext-Edit das
 *      Seitenverhaeltnis aendert und die Maske versetzt sitzt.
 *   5. Kantenforensik ueber scripts/avatars/analyze-cutout.cjs (analyseBuffer),
 *      dazu zwei Pruefungen, die erst der Ganzkoerper noetig macht:
 *        FUSS   — Abstand des untersten deckenden Pixels zur Leinwand-Unterkante.
 *                 ~0 heisst: Figur steht auf dem Bildrand, Fuesse angeschnitten.
 *        RAND   — Abstand oben/links/rechts. 0 heisst: nicht mehr beschneidbar.
 *        KOPF   — geschaetzte Kopfhoehe aus der Alphamaske (Schulterknick).
 *                                       -> metrics.json
 *   6. Kontaktbogen je Charakter (Figur / Portrait-Zuschnitt / Freistellung,
 *      Kennung unter jeder Spalte)      -> contact_<rolle>.png
 *      Ausschuss (Fuesse oder Rand verletzt) kommt NICHT in den Bogen.
 *   7. Eine HTML-Ansicht (eine Datei je Vergleichszweck, wird komplett neu
 *      gebaut)                          -> characters-style-test.html
 *      Jede src-Referenz wird gegen das Dateisystem geprueft; bei Abweichung
 *      bricht das Script mit Exit-Code 1 ab.
 *
 * fal key aus scripts/.env (FAL_AI_API_KEY / FAL_API_KEY) — nie hardcoden,
 * nie loggen.
 *
 * Usage:
 *   node scripts/avatars/characters-style-test.cjs            # alles
 *   node scripts/avatars/characters-style-test.cjs gen        # nur generieren
 *   node scripts/avatars/characters-style-test.cjs cutout     # nur freistellen
 *   node scripts/avatars/characters-style-test.cjs metrics    # nur Forensik
 *   node scripts/avatars/characters-style-test.cjs sheets     # nur Bogen+HTML
 *   node scripts/avatars/characters-style-test.cjs gen research_a3   # eine
 *   node scripts/avatars/characters-style-test.cjs regen research_a3 # neu ziehen
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');
const A = require('./analyze-cutout.cjs');

sharp.cache(false);

// ── fal key aus scripts/.env ───────────────────────────────────────────────
try {
  const envRaw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* .env optional, wenn der Key als env var gesetzt ist */ }
const FAL_API_KEY = process.env.FAL_AI_API_KEY || process.env.FAL_API_KEY;

const REPO = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO, 'assets', 'style-test', 'characters');
const RAW_DIR = path.join(OUT_DIR, 'raw');
const FACE_DIR = path.join(OUT_DIR, 'face');
const CUT_DIR = path.join(OUT_DIR, 'cutout');
for (const d of [OUT_DIR, RAW_DIR, FACE_DIR, CUT_DIR]) fs.mkdirSync(d, { recursive: true });

const GEN_ASPECT = '9:16';       // ultra nativ: 1536x2752
const USE_UPSCALER = process.argv.includes('--upscale');
const WORK_W = 2048;             // Arbeits-/Matting-Breite
/** Mindestabstand der Figur zur Leinwand-Unterkante, sonst Fuesse angeschnitten. */
const FOOT_GAP_MIN = 20;
/** Mindestrand oben/links/rechts, damit spaeter noch beschnitten werden kann. */
const EDGE_GAP_MIN = 12;

// ───────────────────────────────────────────────────────────────────────────
// Prompt-Bausteine
// ───────────────────────────────────────────────────────────────────────────
//
// REIHENFOLGE IST HIER DAS ENTSCHEIDENDE. Ein erster Versuch stellte einen
// langen Anti-Retusche-Anker VORAN und haengte die Figur dahinter — heraus kam
// eine glatte Gesichts-Grossaufnahme ohne Brille, ohne Kittel, ohne Labor: der
// Textencoder hatte das Motiv schlicht nicht mehr gelesen. Der bestehende
// director_ashford-Prompt macht es richtig herum und ist das Vorbild:
//   "RAW photograph, unretouched DSLR photo, <AUSSCHNITT> of <FIGUR> …"
// also Bildart + Ausschnitt + Figur zuerst, Kamera und die NO-Liste ganz ans
// Ende. Laenger heisst nicht genauer, sondern abgeschnitten.

/**
 * Bildart + Ausschnitt. Steht ganz vorne, direkt vor der Figur.
 * Die Fuesse werden mehrfach eingefordert — das ist die Stelle, an der solche
 * Prompts regelmaessig scheitern — und danach maschinell nachgeprueft.
 */
const LEAD =
  'RAW unretouched photograph taken in a photo studio against a plain empty backdrop, ' +
  'full-length standing figure, ' +
  'the entire body from the top of the head down to the shoes inside the frame, both shoes completely visible, ' +
  'nothing cropped at the knees or ankles, tall vertical full-body frame, of';

/**
 * Buehne. Fuer alle drei Rollen WORTGLEICH, damit die drei Figuren im gleichen
 * Massstab stehen und gegeneinander geschnitten werden koennen. Enthaelt
 * zugleich die Randforderung (Luft oben/unten/seitlich).
 */
const STAGING =
  'standing still and upright, photographed from eye level: the camera sits at the subject\'s own eye height, ' +
  'about 1.6 metres above the floor, the lens perfectly level and horizontal, no downward tilt, no upward tilt, ' +
  'taken from about eight metres away with an 85mm short telephoto lens so the body has natural proportions ' +
  'and no wide-angle distortion, ' +
  'both feet flat on the same level horizontal floor with the ground line under the shoes running horizontally, ' +
  'the figure occupying about three quarters of the frame height and centred, ' +
  'clear empty headroom above the head, empty backdrop below the shoes, open space left and right, ' +
  'the figure never touching any edge of the frame';

/**
 * HINTERGRUND: gleichmaessige Studioflaeche, KEINE Szene. Die Kulisse wird
 * ohnehin weggeschnitten; eingebackenes Szenenlicht wuerde die Figur ausserdem
 * an eine Location binden, in der sie spaeter gar nicht steht. Cutscene-
 * Hintergruende entstehen in einem eigenen Auftrag aus den Iso-Modul-Assets.
 *
 * Die Farbe ist nicht gesetzt, sondern GEMESSEN: literales Chroma-Gruen setzt
 * sich als Streulicht in Haarstraehnen fest und faerbt den Saum. Der Probe-
 * Schritt faehrt jede Flaeche unten gegen dieselben Figuren und entscheidet
 * anhand der von analyze-cutout.cjs gemessenen Saumfarbe (semiRGB) und des
 * Halos, nicht nach Augenschein.
 */
const BACKDROPS = {
  grey: 'a completely plain smooth seamless neutral mid-grey studio backdrop, ' +
    'an unbroken empty flat surface, nothing behind the subject at all',
  green: 'a completely plain smooth seamless chroma-key green screen backdrop, ' +
    'an unbroken empty flat surface, nothing behind the subject at all',
  light: 'a completely plain smooth seamless very light neutral grey studio backdrop, ' +
    'an unbroken empty flat surface, nothing behind the subject at all',
};
/**
 * GEMESSENES ERGEBNIS der Probe (assets/style-test/characters/probe/
 * backdrop-probe.json, Saumfarbe der teiltransparenten Randpixel):
 *
 *   Rolle      Flaeche  SaumRGB        Gruenueberschuss  Halo    softPerEdge  Filament%
 *   research   grey     [110, 99, 88]    0.0             -19.9   11.00        0.26
 *   research   green    [104,107, 82]  +14.0             -54.1   11.96        0.34
 *   research   light    [110, 99, 90]   -1.0             -25.7   11.46        0.32
 *   admin      grey     [159,141,123]    0.0              +3.3    5.60        0.19
 *   admin      green    [115,150,100]  +42.5              -1.3    6.08        0.00
 *   admin      light    [153,133,115]   -1.0              +4.0    6.53        0.07
 *
 * Chroma-Gruen faellt durch: der Saum traegt einen klaren Gruenueberschuss
 * (+14 bzw. +42.5), also genau das Streulicht in den Haaren, das befuerchtet
 * war — und bei der Verwalterin kostet es zugleich jede Straehne (Filament 0).
 * Grau und Hellgrau sind farblich beide neutral (0 / -1); Grau gewinnt beim
 * Halo (-19.9 statt -25.7 bzw. +3.3 statt +4.0) und bei den erhaltenen
 * Straehnen der Verwalterin (0.19 statt 0.07). Default ist deshalb 'grey'.
 */
const BG_KEY = (() => {
  const i = process.argv.indexOf('--bg');
  return i >= 0 && BACKDROPS[process.argv[i + 1]] ? process.argv[i + 1] : 'grey';
})();

/**
 * LICHT: neutral und gleichmaessig, wie eine echte Studioaufnahme. Kein
 * Streiflicht, keine farbigen Lichtakzente — die Figur soll spaeter in Szenen
 * mit ganz unterschiedlichem Licht einsetzbar sein.
 */
const LIGHT =
  'flat even neutral studio lighting from a large soft frontal source, daylight balanced, ' +
  'no coloured light, no dramatic side light, no hard shadows on the subject or the backdrop';

/**
 * Kamera + Hauttextur + NO-Liste. Steht ganz hinten, wie bei Ashford.
 * Bewusst NUR fotografische Sprache. Render-Vokabular ("8k", "ultra detailed",
 * "cinematic", "dramatic lighting", "masterpiece") zieht das Bild in den
 * CGI-Look und steht deshalb in der Negativliste, nicht hier.
 */
const RAW_TAIL =
  'Shot on a Canon EOS R5 with an 85mm f/5.6 lens from eye level, even exposure, fine 35mm film grain. ' +
  'Harsh truthful skin: visible enlarged pores, oily sebum shine on forehead and nose, blotchy uneven skin tone, ' +
  'broken capillaries, small blemishes, uneven teeth, stray flyaway hairs, clearly asymmetric features, ' +
  'one eye slightly different from the other. ' +
  'NO retouching, NO airbrushing, NO skin smoothing, NO beauty filter, NOT perfect skin, NOT symmetrical, ' +
  'NO AI look, NOT a render, NOT digital art, an ordinary unedited photograph taken by a person.';

/**
 * SETTING + DIENSTKLEIDUNG.
 *
 * Die Referenz beschreibt ausdruecklich die WELT und die KLEIDUNG, nicht den
 * Bildstil. "The Expanse aesthetic", "cinematic", "concept art" und Verwandtes
 * bleiben draussen — sie ziehen sofort in den CGI-Look zurueck, der gerade
 * muehsam losgeworden wurde. Die fotografische Sprache und die Nein-Liste
 * stehen unveraendert am Ende des Prompts.
 *
 * Die Farben sind NICHT erfunden, sondern aus den Spiel-Assets gemessen
 * (assets/style-test/backgrounds/drive_works_raw_a5.png und
 * drive-works-scene.png, mittlere Blau- bzw. Gelbtoene der Anlagen und
 * Warnmarkierungen):
 *   Blau  #4a6b81 / #2c3f4f  — entsaettigtes Stahl-/Petrolblau, KEIN Royalblau
 *   Gelb  #b6922f / #9d773f  — stumpfes Ocker-/Bernsteingelb, KEIN Signalgelb
 * Deshalb "faded steel-blue" und "muted ochre-yellow" statt "blue and yellow":
 * die gesaettigte Lesart erzeugt ein Kostuem, keine Arbeitskleidung.
 */
/**
 * Die drei sind REPRAESENTANTEN, keine Putzkolonne. Der erste Anlauf
 * buchstabierte "verschlissen" als Arbeitskleidung aus (Overall, Oelflecken,
 * fehlende Knoepfe) — und genau so lasen die Bilder: Reinigungsdienst.
 * Der Satz, der die Korrektur traegt:
 *
 *   Die Kleidung ist repraesentativ. Die Abnutzung kommt von den MENSCHEN,
 *   nicht von der Kleidungsklasse.
 *
 * Also: Dienstkleidung im Schnitt, Alter und Gebrauch statt Schmutz.
 * Merksatz fuer die Abnutzung — abgenutzt wie ein guter Mantel nach zehn
 * Jahren, nicht wie eine Werkstattmontur nach einer Schicht.
 */
const SETTING =
  'they are senior staff who represent a rough, used, lived-in spaceship colony, ' +
  'the working future of The Expanse or Elite Dangerous, where everything is repaired rather than replaced';

const UNIFORM =
  // LEHRE AUS DEM HI-VIS-BEFUND: Negative nehmen nicht zurueck, was der
  // positive Teil impliziert. "crew work clothing" stand hier und hat gegen
  // jede Negativliste gewonnen — deshalb steht jetzt im positiven Teil
  // ausschliesslich Dienstkleidungs-Vokabular, kein "work", kein "coverall".
  // Farbe ganz nach vorn. Der Kapitaen kam zweimal in Khaki zurueck, obwohl
  // 'steel-blue' weiter hinten stand — bei gleichem Seed bleibt das Bild in
  // derselben Farbwelt. Die Farbe steht jetzt VOR dem Kleidungsstueck.
  'wearing a dark steel-blue service uniform, blue cloth throughout, no khaki and no tan: ' +
  'a tailored fleet service tunic jacket in faded desaturated ' +
  'steel-blue and petrol-blue with a proper stand collar, a defined shoulder line and a shaped waist, ' +
  'over matching trousers — merchant-marine officer service dress, the kind of uniform you put on to ' +
  'receive someone, ' +
  // Rangabzeichen gehoeren dazu — aber als Abzeichen, nicht als Band. Der
  // Unterschied zum Warnstreifen ist genau die Stelle, an der es vorher kippte.
  'small discreet rank insignia in matt muted ochre: shoulder boards, collar tabs and one narrow braid ' +
  'stripe at the cuff, embroidered or dull unpolished metal, never reflective, never a wide band, ' +
  // Abnutzung: gleiche Haerte, andere Art. Alter und Gebrauch, nicht Dreck.
  'the uniform aged rather than soiled: the cloth sun-faded across the shoulders and back, the elbows ' +
  'and cuff edges rubbed smooth and shiny with wear, the collar gone soft and out of shape, one seam ' +
  're-sewn, one replaced button that does not quite match, creases that come from being worn';

/**
 * NAMENSSCHILD. Die Namen sind abgenommen; auf dem Stoff steht wie bei echter
 * Dienstkleidung nur der Nachname in Grossbuchstaben — kein voller Name, kein
 * Titel.
 *
 *   research  Dr. Anselm Brehm   Research Lead      -> BREHM
 *   admin     Rita Novak         Colony Supervisor  -> NOVAK
 *   captain   Declan Boyd        Captain            -> BOYD
 *
 * ACHTUNG, bekannte Schwachstelle: Bildmodelle schreiben Text unzuverlaessig,
 * und bei einer Ganzkoerperaufnahme ist das Schild winzig — bei 1536x2752 und
 * einer Figur ueber rund drei Viertel der Bildhoehe entfallen auf das Schild
 * etwa 110 px Breite und auf die Buchstaben rund 20 px Hoehe. Deshalb wird
 * jede Variante auf die Schrift GEPRUEFT und ein verungluecktes Schild wie
 * abgeschnittene Beine behandelt: Ausschuss.
 * Haelt die Trefferquote nicht, ist der gemeldete Ausweg ein ausgeblichenes,
 * halb abgerissenes oder ueberklebtes Schild (NAME_WORN) — das verstaerkt
 * "gebraucht und verschlissen" genau dort, wo es glaubwuerdig ist, und umgeht
 * das Textproblem. Das ist eine Entscheidung, die berichtet wird, kein stilles
 * Ausweichen.
 */
/**
 * GEMESSENES ERGEBNIS: 0 von 18 lesbaren Schildern.
 * Der benannte Durchgang (archiviert als contact_*_v2_arbeitskleidung.png,
 * Brustausschnitte in patches_*.png) hat KEINE einzige lesbare Beschriftung
 * geliefert — bei ~110 px Schildbreite und ~20 px Buchstabenhoehe entstand
 * entweder gar kein Schild oder Buchstabensalat ("RAW WER", "CRETW").
 * Deshalb ist das ausgeblichene, halb abgerissene Schild jetzt der DEFAULT.
 * Das ist eine berichtete Entscheidung, kein stilles Ausweichen: der
 * Textversuch bleibt ueber --name-text erreichbar und reproduzierbar.
 */
const NAME_WORN = !process.argv.includes('--name-text');
function nameClause(r) {
  return NAME_WORN
    ? `a small rectangular name plate above the breast pocket, sun-bleached blank with one corner lifting, ` +
      `its lettering long worn away and unreadable`
    : `the name patch on ${r.pronoun} chest reads the single surname "${r.surname}" ` +
      `in worn stencilled capital letters, ${r.surname}, clearly legible, no other text anywhere`;
}

/** Kleidung bleibt gebraucht — ohne Stil-Vokabular, das Richtung Render zieht. */
const WARDROBE =
  'the clothing worn like a good coat after ten years, not like a workshop overall after one shift — ' +
  'nothing new, nothing stiff, no costume, and no dirt, oil or grease on the uniform';

const NEGATIVE =
  'cgi, 3d render, digital art, concept art, octane, unreal engine, hdr, 8k, ultra detailed, masterpiece, ' +
  'cinematic, cinematic lighting, dramatic lighting, rim light, backlit, lens flare, colour grading, ' +
  'airbrushed, retouched, smooth skin, flawless skin, beauty retouch, glamour, glossy, plastic skin, waxy, ' +
  'illustration, painting, anime, cartoon, caricature, comedic, goofy, clown, exaggerated features, ' +
  'model, fashion photo, bright saturated colors, neon, brand new uniform, ' +
  'scenery, background, room, wall, furniture, table, desk, railing, props, objects behind the subject, ' +
  'doorway, door, garage, workshop, warehouse, corridor, building, street, outdoors, window, ' +
  'floor tiles, concrete floor, visible horizon line, ' +
  'high visibility clothing, hi-vis, hi-vis coverall, safety vest, fluorescent yellow, neon yellow, ' +
  'reflective stripes, reflective tape, retroreflective bands, striped sleeves, striped trouser legs, ' +
  'road worker, refuse collector, mechanic, janitor, cleaner, maintenance crew, ' +
  'coverall, overall, boiler suit, jumpsuit, utility jacket, work jacket, workwear, ' +
  'two-tone jacket, contrasting yoke panel, shoulder yoke, ' +
  'oil stains, grease stains, smeared dirt, mud, grime on the clothing, ' +
  'khaki, olive drab, tan shirt, beige uniform, ' +
  'close-up, portrait crop, half body, bust, waist up, cropped legs, cut off at the knees, cut off at the ankles, ' +
  'feet out of frame, feet cropped, touching the frame edge, tight crop, ' +
  'running, walking, mid-stride, jumping, leaning over, action pose, dynamic pose, motion blur on the body, ' +
  'sitting, lying down, ' +
  'wide angle, wide angle distortion, fisheye, foreshortening, oversized feet, small head, ' +
  'high angle, looking down at the subject, downward tilt, bird eye view, low angle, worm eye view, ' +
  'tilted horizon, dutch angle, sloping floor, uneven ground, one foot higher than the other, ' +
  // "text" steht hier bewusst NICHT mehr: das Namensschild SOLL beschriftet
  // sein. Ausgeschlossen wird nur Beschriftung, die dort nichts zu suchen hat.
  'logo, watermark, caption, subtitle, paragraph of text, random letters, text across the image, ' +
  'multiple people, crowd, extra limbs, deformed hands';

/**
 * Sechs Ausrichtungs-/Blick-Varianten, identisch fuer alle drei Rollen, damit
 * der Kontaktbogen spaltenweise vergleichbar bleibt. Was NICHT variiert:
 * Abstand, Augenhoehe, Figurengroesse im Rahmen (STAGING) — und seit dem
 * Studio-Umbau auch das LICHT nicht mehr. Ein Streiflicht waere eingebackenes
 * Szenenlicht und wuerde die Figur an eine Location binden. Variiert wird nur,
 * wie die Figur zur Kamera steht und wohin sie schaut.
 */
const SHOTS = [
  { k: '1', t: 'squarely frontal, looking straight into the lens' },
  { k: '2', t: 'the body turned slightly to the left with the head towards the lens, eyes on the camera' },
  { k: '3', t: 'the body turned slightly to the right, looking a little off-camera past the lens' },
  { k: '4', t: 'frontal with the head level and a slight lift of the chin, eyes into the lens' },
  { k: '5', t: 'standing three-quarters to the camera with the head turned back over the shoulder' },
  { k: '6', t: 'frontal and unposed, caught between two thoughts, the eyes unfocused just past the camera' },
];

/**
 * Bei einer ganzen Figur traegt die Haltung so viel wie das Gesicht. Die drei
 * stehen bewusst verschieden — aber alle drei STEHEN, keine eingefrorene
 * Bewegung: der Professor unausgerichtet, die Verwalterin verankert, der
 * Kapitaen aufrecht aus Gewohnheit und trotzdem schwer.
 */
const ROLES = {
  research: {
    prefix: 'a',
    title: 'Forschung — Dr. Anselm Brehm, Research Lead',
    surname: 'BREHM',
    pronoun: 'his',
    seed: 730000,
    subject:
      'a man in his late forties with greasy unwashed stringy hair sticking out at odd angles and falling into his face, ' +
      'patchy uneven several-day beard growth, crooked smudged eyeglasses with a hinge crudely repaired with tape, ' +
      'a stained and wrinkled white lab coat hanging open over his blue service uniform, ' +
      'scuffed worn shoes, ' +
      'pale indoor skin and dark sleepless circles, his gaze absent and razor sharp at once, ' +
      'as if he were mid-way through understanding something you cannot see',
    posture:
      'standing loosely with rounded shoulders and his weight settled onto one leg, one foot turned slightly out, ' +
      'a datapad held forgotten against his thigh, the other hand pushed into the coat pocket',
    // Er hat sich nicht angezogen, er hat sich bedeckt.
    wear: 'the service tunic is there, he simply wears it wrong: a stained open lab coat pulled over it, the tunic collar hanging open, the front mis-buttoned, ink marks on the pocket — the neglect is his own, not the uniform',
    guard: 'a real photograph of a real brilliant unkempt scientist, dignified and sharp, never a caricature, never comedic',
  },
  admin: {
    prefix: 'b',
    title: 'Verwaltung — Rita Novak, Colony Supervisor',
    surname: 'NOVAK',
    pronoun: 'her',
    seed: 810000,
    subject:
      'a heavy-set broad-shouldered woman in her early fifties, substantial but not obese, ' +
      'thin limp home-dyed hair scraped back into a clip with the scalp showing at the parting and grey roots grown out, ' +
      'a lit cigarette wedged in the corner of her mouth, thin smoke drifting past one squinting eye, ' +
      'deep nasolabial folds and fine smoker lines around the lips, heavy tired eyelids over eyes that register everything, ' +
      'no makeup, flat worn shoes',
    posture:
      'standing squarely and immovably with both feet planted flat and evenly apart, arms folded across her chest, ' +
      'chin a little down, entirely at home where she is standing',
    // Sie haelt sich an die Vorschrift, die Uniform haelt nur nicht mehr mit.
    wear: 'she wears the uniform correctly and completely fastened, the same one for years, the most properly turned out of the three — she keeps to the regulation, only the cloth no longer keeps up',
    guard: 'a real photograph of a real working woman, down to earth, capable, never a caricature, never grotesque',
  },
  captain: {
    prefix: 'c',
    title: 'Kapitaen — Declan Boyd, Captain',
    surname: 'BOYD',
    pronoun: 'his',
    seed: 660000,
    subject:
      'a man of about sixty, a heavy drinker and chain smoker and his face shows it: flushed ruddy complexion, ' +
      'burst capillaries across a swollen reddened nose and both cheeks, puffy bagged eyelids, yellowed bloodshot eyes, ' +
      'a drinker\'s face: the nose swollen and purple-red with visible burst veins, the cheeks blotched and ' +
      'broken-veined, the eyes watery and yellowed with heavy slack bags beneath them, ' +
      'deep furrows, an unkempt grown-out grey beard stained yellow in the moustache, ' +
      'nicotine-stained fingers holding a half-burned cigarette, trousers bagged at the knee over scuffed boots',
    posture:
      'standing upright out of thirty years of habit but with the shoulders gone heavy and the belly forward, ' +
      'feet a little apart and braced, one thumb hooked in his belt',
    // War mal die beste der drei — und ist es nicht mehr.
    // 'hanging open ... over a rumpled blue shirt' hat ihn in Arbeitshemd und
    // Overall gezogen. Der Schnitt muss so ausdruecklich dastehen wie die Farbe.
    wear: 'he wears the same tailored blue service tunic as the others, a structured jacket with a stand ' +
      'collar, shoulder boards and the most cuff braid of the three, now tarnished — his was the best ' +
      'uniform of them, and he has let it slide: the tunic unfastened at the throat, the collar out of ' +
      'shape; the decline is in the man, not in the cloth',
    guard: 'a real photograph of a real weathered fleet officer in a dark steel-blue service uniform, still an officer, ' +
      'never a comedic drunk, never a caricature',
  },
};

function buildPrompt(roleKey, shot, bgKey) {
  const r = ROLES[roleKey];
  return `${LEAD} ${r.subject}, ${UNIFORM}, ${nameClause(r)}, ${r.wear}, ${r.posture}, ` +
    `standing in front of ${BACKDROPS[bgKey || BG_KEY]}. ${STAGING}. ${LIGHT}, ${shot.t}. ` +
    `${SETTING}. ${WARDROBE}. ${r.guard}. ${RAW_TAIL}`;
}

/** Alle Varianten als flache Liste. */
function allVariants() {
  const out = [];
  for (const [roleKey, r] of Object.entries(ROLES)) {
    SHOTS.forEach((shot, i) => {
      out.push({
        id: `${roleKey}_${r.prefix}${shot.k}`,
        roleKey, shot,
        seed: r.seed + i * 137,
        prompt: buildPrompt(roleKey, shot),
      });
    });
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// HTTP / fal
// ───────────────────────────────────────────────────────────────────────────

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
function httpsGet(url, headers) {
  const u = new URL(url);
  return httpsRequest({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const dl = (u, depth = 0) => {
      if (depth > 5) { reject(new Error('too many redirects')); return; }
      (u.startsWith('https') ? https : http).get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) { dl(res.headers.location, depth + 1); return; }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    };
    dl(url);
  });
}

/** Queue-Submit + Polling gegen einen fal-Endpoint. */
async function falQueue(modelPath, payload, label) {
  const submitRaw = await httpsRequest({
    hostname: 'queue.fal.run', path: modelPath, method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
  }, JSON.stringify(payload));
  const submit = JSON.parse(submitRaw);
  if (!submit.status_url) throw new Error(`Submit failed (${modelPath}): ${submitRaw.slice(0, 400)}`);
  process.stdout.write(`    ${label}`);
  for (let i = 0; i < 240; i++) {
    await sleep(2000);
    const status = JSON.parse(await httpsGet(submit.status_url, { Authorization: `Key ${FAL_API_KEY}` }));
    if (status.status === 'COMPLETED') {
      process.stdout.write(' done\n');
      return JSON.parse(await httpsGet(submit.response_url, { Authorization: `Key ${FAL_API_KEY}` }));
    }
    if (status.status === 'FAILED') throw new Error(`${modelPath} failed: ${JSON.stringify(status).slice(0, 400)}`);
    process.stdout.write('.');
  }
  throw new Error(`Timeout (${modelPath})`);
}
const urlOf = (res) => (res.image && res.image.url) || (res.images && res.images[0] && res.images[0].url);

async function generate(variant, seedOffset) {
  const res = await falQueue('/fal-ai/flux-pro/v1.1-ultra', {
    prompt: variant.prompt,
    // WIRKUNGSLOS, bleibt nur als Dokumentation stehen: flux-pro/v1.1-ultra
    // kennt kein negative_prompt und verwirft das Feld still. Belegt am
    // Kapitaen — 'khaki, olive drab, tan shirt, beige uniform' standen in der
    // Liste, und genau das kam zurueck. Alles, was ausgeschlossen werden soll,
    // muss POSITIV formuliert werden.
    negative_prompt: NEGATIVE,
    aspect_ratio: GEN_ASPECT,
    num_images: 1,
    enable_safety_checker: false,
    output_format: 'png',
    raw: true,
    seed: variant.seed + (seedOffset || 0),
  }, 'flux-ultra 9:16');
  const url = urlOf(res);
  if (!url) throw new Error('flux returned no image: ' + JSON.stringify(res).slice(0, 300));
  return downloadBuffer(url);
}

async function uploadToFal(buffer, fileName) {
  const initRaw = await httpsRequest({
    hostname: 'rest.alpha.fal.ai', path: '/storage/upload/initiate', method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
  }, JSON.stringify({ content_type: 'image/png', file_name: fileName }));
  const init = JSON.parse(initRaw);
  if (!init.upload_url || !init.file_url) throw new Error(`Storage initiate failed: ${initRaw.slice(0, 300)}`);
  const u = new URL(init.upload_url);
  await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'PUT',
      headers: { 'Content-Type': 'image/png', 'Content-Length': buffer.length.toString() },
    }, (res) => { res.on('data', () => {}); res.on('end', resolve); });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
  return init.file_url;
}

async function upscale(buffer, id) {
  const falUrl = await uploadToFal(buffer, `${id}_pre_upscale.png`);
  const res = await falQueue('/fal-ai/creative-upscaler', {
    image_url: falUrl, scale: 2, creativity: 0.3, override_size_limits: true,
  }, 'creative-upscaler 2x');
  const url = urlOf(res);
  if (!url) throw new Error('upscaler returned no image: ' + JSON.stringify(res).slice(0, 300));
  return downloadBuffer(url);
}

/**
 * Freistellen ueber den freigegebenen Pfad: birefnet/v2, Portrait @2048,
 * refine_foreground. Identisch zu utils.ts:BIREFNET_PORTRAIT_MATTING.
 * Kein Nachbearbeiten der Alphakurve, keine Spill-Decontamination.
 */
async function cutout(buffer, id) {
  const falUrl = await uploadToFal(buffer, `${id}_styletest.png`);
  const res = await falQueue('/fal-ai/birefnet/v2', {
    image_url: falUrl,
    model: 'Portrait',
    operating_resolution: '2048x2048',
    refine_foreground: true,
    output_format: 'png',
  }, 'birefnet Portrait@2048');
  const url = urlOf(res);
  if (!url) throw new Error('birefnet returned no image: ' + JSON.stringify(res).slice(0, 300));
  return downloadBuffer(url);
}

// ───────────────────────────────────────────────────────────────────────────
// Schritte
// ───────────────────────────────────────────────────────────────────────────

function needKey() {
  if (!FAL_API_KEY) { console.error('Kein fal key (FAL_AI_API_KEY / FAL_API_KEY in scripts/.env)'); process.exit(1); }
}

async function stepGen(variants, regen) {
  needKey();
  for (const v of variants) {
    const srcFile = path.join(RAW_DIR, `${v.id}_src.png`);
    if (fs.existsSync(srcFile) && !regen) { console.log(`  ${v.id}: vorhanden — skip`); continue; }
    const offset = regen ? 9000 + Math.floor(Math.random() * 9000) : 0;
    console.log(`  ${v.id}: generiere (seed ${v.seed + offset})`);
    const gen = await generate(v, offset);
    // creative-upscaler NUR auf ausdrueckliche Anforderung. Er laeuft mit
    // creativity 0.3 und MALT das Bild neu: der erste Kapitaen-Durchlauf kam
    // wachsern und gemalt zurueck, waehrend die nicht hochskalierten
    // Probe-Bilder fotografisch aussahen. Fotorealismus schlaegt Pixelzahl —
    // ehrliche 1536x2752 sind besser als erfundene 3072x5504.
    const up = USE_UPSCALER ? await upscale(gen, v.id) : gen;
    fs.writeFileSync(srcFile, up);
    await sharp(up).resize(Math.min(WORK_W, (await sharp(up).metadata()).width), null, { kernel: 'lanczos3' }).jpeg({ quality: 92 })
      .toFile(path.join(RAW_DIR, `${v.id}.jpg`));
    const m = await sharp(up).metadata();
    console.log(`    -> raw/${v.id}_src.png (${m.width}x${m.height}) + raw/${v.id}.jpg`);
  }
}

async function stepCutout(variants, regen) {
  needKey();
  for (const v of variants) {
    const src = path.join(RAW_DIR, `${v.id}_src.png`);
    const out = path.join(CUT_DIR, `${v.id}.png`);
    if (!fs.existsSync(src)) { console.log(`  ${v.id}: keine Quelle — skip`); continue; }
    if (fs.existsSync(out) && !regen) { console.log(`  ${v.id}: cutout vorhanden — skip`); continue; }
    console.log(`  ${v.id}: freistellen`);
    // Auf Matting-Breite bringen: birefnet rechnet intern 2048x2048.
    const nativeW = (await sharp(src).metadata()).width;
    const work = await sharp(src).resize(Math.min(WORK_W, nativeW), null, { kernel: 'lanczos3' }).png().toBuffer();
    const buf = await cutout(work, v.id);
    fs.writeFileSync(out, buf);
    const m = await sharp(buf).metadata();
    console.log(`    -> cutout/${v.id}.png (${m.width}x${m.height}, alpha=${!!m.hasAlpha})`);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// UMKLEIDEN statt neu wuerfeln
// ───────────────────────────────────────────────────────────────────────────
//
// Die Verwalterin aus der Backdrop-Probe sitzt: Gesicht, Statur, Haltung und
// Zigarette sind genau die beschriebene Figur. Eine Neugenerierung mit den
// zusaetzlichen Uniform-Tokens wuerfelt all das neu. Deshalb wird die Uniform
// per Edit-Modell auf die BESTEHENDEN Bilder gebracht — das Umziehen bei
// gleichbleibendem Gesicht ist die Staerke dieser Modelle.
//
// Die Quellbilder werden dabei NIE ueberschrieben: Ergebnis landet in dressed/.

const EDIT_MODELS = {
  nano: '/google/nano-banana-lite/edit',
  flare: '/openai/gpt-image-2.5/flare/edit',
  sunburst: '/openai/gpt-image-2.5/sunburst/edit',
};
const DRESSED_DIR = path.join(OUT_DIR, 'dressed');

/**
 * Der Edit-Prompt fuehrt zuerst auf, was UNVERAENDERT bleiben muss. Genau das
 * ist der Zweck des Schritts; ohne diese Liste interpretiert das Modell die
 * Figur neu und der Vorteil gegenueber einer Neugenerierung ist weg.
 */
function dressPrompt(roleKey) {
  const r = ROLES[roleKey];
  return 'Change ONLY the clothing. Keep everything else exactly as it is: the same face, the same facial ' +
    'features and skin texture, the same age, the same body shape and weight, the same hair, the same pose ' +
    'and stance, the same hands, the same cigarette, the same shoes, the same flat even lighting, the same ' +
    'plain grey backdrop, the same framing and the same camera position. Do not beautify the face, do not ' +
    'smooth the skin, do not slim the body. ' +
    `Replace the clothes with ${UNIFORM}. ${r.wear}. ` +
    `${SETTING}. ${WARDROBE}. ` +
    'The result must still look like the same unretouched photograph of the same person, only in different ' +
    'clothes — NOT a render, NO CGI look, NO airbrushing.';
}

async function editImage(buffer, prompt, modelPath, id) {
  const falUrl = await uploadToFal(buffer, `${id}_dress_src.png`);
  const res = await falQueue(modelPath, {
    prompt,
    image_urls: [falUrl],
    num_images: 1,
    output_format: 'png',
  }, `edit ${modelPath.split('/').slice(-2).join('/')}`);
  const url = urlOf(res);
  if (!url) throw new Error(`edit returned no image: ${JSON.stringify(res).slice(0, 300)}`);
  return downloadBuffer(url);
}

/**
 * Zieht die gelungenen Probe-Figuren um. `jobs` ist eine Liste
 * { src, id, roleKey } — src relativ zu OUT_DIR.
 */
async function stepDress(jobs, models) {
  needKey();
  fs.mkdirSync(DRESSED_DIR, { recursive: true });
  const out = [];
  for (const j of jobs) {
    const srcPath = path.join(OUT_DIR, j.src);
    if (!fs.existsSync(srcPath)) { console.log(`  ${j.id}: Quelle fehlt (${j.src}) — skip`); continue; }
    for (const mk of models) {
      const outId = `${j.id}_${mk}`;
      const outFile = path.join(DRESSED_DIR, `${outId}.png`);
      if (fs.existsSync(outFile)) { console.log(`  ${outId}: vorhanden — skip`); out.push({ outId, roleKey: j.roleKey, model: mk }); continue; }
      console.log(`  ${outId}: umkleiden`);
      try {
        const buf = await editImage(fs.readFileSync(srcPath), dressPrompt(j.roleKey), EDIT_MODELS[mk], outId);
        fs.writeFileSync(outFile, buf);
        const m = await sharp(buf).metadata();
        console.log(`    -> dressed/${outId}.png (${m.width}x${m.height})`);
        out.push({ outId, roleKey: j.roleKey, model: mk });
      } catch (e) {
        console.log(`    FEHLGESCHLAGEN (${mk}): ${String(e.message).slice(0, 220)}`);
      }
    }
  }
  return out;
}

/**
 * BACKDROP-PROBE: welche Hintergrundflaeche stellt sich am saubersten frei?
 *
 * Entschieden wird nicht nach Augenschein, sondern an drei Zahlen aus
 * analyze-cutout.cjs, gemessen an den TEILTRANSPARENTEN Randpixeln:
 *   semiRGB        — die Farbe des Saums. Faerbt der Hintergrund die Haare ein,
 *                    steht es hier. Bei Chroma-Gruen erwartet man einen klaren
 *                    Gruenueberschuss G-(R+B)/2.
 *   haloDelta      — Luminanz des Saums minus Luminanz der angrenzenden
 *                    deckenden Pixel. Nahe 0 ist gut; stark positiv heisst
 *                    heller Saum (Hintergrund haengt in den Haaren).
 *   bleed          — was unter voll transparenten Pixeln steht.
 * Zusaetzlich softPerEdge/filament als Mass fuer erhaltene Straehnen.
 *
 * Gefahren werden zwei Figuren mit schwierigem Haar (der Professor mit
 * straehnigem, die Verwalterin mit duennem zurueckgestecktem Haar) gegen jede
 * Flaeche. Ohne Upscaler — verglichen werden die Flaechen untereinander, und
 * der Farbstich des Saums haengt nicht an der Aufloesung.
 */
const PROBE_DIR = path.join(OUT_DIR, 'probe');
const PROBE_CASES = [
  { roleKey: 'research', shot: SHOTS[0] },
  { roleKey: 'admin', shot: SHOTS[0] },
];

async function stepProbe() {
  needKey();
  fs.mkdirSync(PROBE_DIR, { recursive: true });
  const rows = [];
  for (const c of PROBE_CASES) {
    for (const bg of Object.keys(BACKDROPS)) {
      const id = `${c.roleKey}_bg_${bg}`;
      const rawFile = path.join(PROBE_DIR, `${id}.png`);
      const cutFile = path.join(PROBE_DIR, `${id}_cut.png`);
      if (!fs.existsSync(rawFile)) {
        console.log(`  ${id}: generiere`);
        const buf = await generate(
          { prompt: buildPrompt(c.roleKey, c.shot, bg), seed: ROLES[c.roleKey].seed }, 0,
        );
        fs.writeFileSync(rawFile, buf);
      }
      if (!fs.existsSync(cutFile)) {
        console.log(`  ${id}: freistellen`);
        fs.writeFileSync(cutFile, await cutout(fs.readFileSync(rawFile), id));
      }
      const r = await A.analyseBuffer(fs.readFileSync(cutFile), id);
      const s = r.hairEdge.semiRGB;
      rows.push({
        id, role: c.roleKey, bg,
        semiRGB: s,
        greenExcess: s ? +(s[1] - (s[0] + s[2]) / 2).toFixed(1) : null,
        semiLum: r.hairEdge.semiLum,
        edgeOpaqueLum: r.hairEdge.edgeOpaqueLum,
        haloDelta: r.hairEdge.haloDelta,
        softPerEdge: r.hairEdge.softPerEdge,
        filamentPct: r.strandiness.filamentPct,
        bleedNonBlackPct: r.bleed ? r.bleed.nonBlackPct : null,
        bleedRGB: r.bleed ? r.bleed.meanRGB : null,
      });
    }
  }
  console.log('\n  Rolle      Flaeche  SaumRGB          Gruenueberschuss  Halo    softPerEdge  Filament%  Bleed%');
  for (const r of rows) {
    console.log(
      `  ${r.role.padEnd(10)} ${r.bg.padEnd(8)} ${String(JSON.stringify(r.semiRGB)).padEnd(17)} ` +
      `${String(r.greenExcess).padEnd(17)} ${String(r.haloDelta).padEnd(7)} ` +
      `${String(r.softPerEdge).padEnd(12)} ${String(r.filamentPct).padEnd(10)} ${r.bleedNonBlackPct}`,
    );
  }
  fs.writeFileSync(path.join(PROBE_DIR, 'backdrop-probe.json'), JSON.stringify(rows, null, 2));
  console.log(`  -> ${path.relative(REPO, path.join(PROBE_DIR, 'backdrop-probe.json'))}`);
  return rows;
}

/**
 * Kopfhoehe aus der Alphamaske. Von der Scheitelzeile abwaerts waechst die
 * Maskenbreite beim Schulteransatz sprunghaft; die erste Zeile, deren Breite
 * das Doppelte der schmalsten Kopfbreite ueberschreitet, ist der Schulterknick.
 * Grob, aber ausreichend fuer die Frage "reicht das fuer eine Nahaufnahme".
 */
async function headHeight(buf, bbox) {
  const a = await sharp(buf).ensureAlpha().extractChannel(3)
    .extract({ left: bbox.left, top: bbox.top, width: bbox.w, height: Math.min(bbox.h, Math.round(bbox.h * 0.45)) })
    .raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = a.info;
  const widths = [];
  for (let y = 0; y < H; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < W; x++) if (a.data[y * W + x] > 128) { if (l < 0) l = x; r = x; }
    widths.push(l < 0 ? 0 : r - l + 1);
  }
  const head = widths.slice(0, Math.max(4, Math.round(H * 0.12))).filter((w) => w > 0);
  if (!head.length) return null;
  const base = Math.max(...head);
  for (let y = 0; y < H; y++) if (widths[y] > base * 2) return y;
  return null;
}

async function stepMetrics(variants) {
  const out = [];
  for (const v of variants) {
    const p = path.join(CUT_DIR, `${v.id}.png`);
    if (!fs.existsSync(p)) continue;
    const buf = fs.readFileSync(p);
    const r = await A.analyseBuffer(buf, v.id);
    const [cw, ch] = r.size.split('x').map(Number);
    const b = r.bbox;
    const footGap = ch - (b.top + b.h);
    const edgeGap = Math.min(b.top, b.left, cw - (b.left + b.w));
    const hh = await headHeight(buf, b);
    // Hochrechnung auf die 3072er Quelle, aus der ein Nahaufnahme-Zuschnitt kaeme.
    const srcW = (await sharp(path.join(RAW_DIR, `${v.id}_src.png`)).metadata()).width;
    const srcScale = srcW / cw;
    const row = {
      id: v.id, role: v.roleKey, size: r.size, hasAlpha: r.hasAlpha,
      bbox: b,
      footGapPx: footGap, feetInFrame: footGap >= FOOT_GAP_MIN,
      edgeGapPx: edgeGap, marginOk: edgeGap >= EDGE_GAP_MIN,
      headPxWork: hh,
      headPxSource: hh ? Math.round(hh * srcScale) : null,
      figureFillPct: +(100 * b.h / ch).toFixed(1),
      softPct: r.alpha.softPct,
      hairSoftPerEdge: r.hairEdge.softPerEdge,
      haloDelta: r.hairEdge.haloDelta,
      semiLum: r.hairEdge.semiLum,
      edgeOpaqueLum: r.hairEdge.edgeOpaqueLum,
      semiRGB: r.hairEdge.semiRGB,
      strandiness: r.strandiness,
      matteResolution: r.matteResolution,
      bleed: r.bleed,
    };
    row.usable = row.feetInFrame && row.marginOk;
    out.push(row);
    console.log(
      `  ${v.id.padEnd(13)} ${row.usable ? 'OK      ' : 'AUSSCHUSS'} ` +
      `Fuss=${String(footGap).padEnd(5)} Rand=${String(edgeGap).padEnd(5)} ` +
      `Kopf=${String(row.headPxSource || '?').padEnd(5)}px ` +
      `soft%=${String(row.softPct).padEnd(7)} softPerEdge=${String(row.hairSoftPerEdge).padEnd(7)} ` +
      `Halo=${String(row.haloDelta).padEnd(6)} Filament%=${row.strandiness.filamentPct} ` +
      `Bleed%=${row.bleed ? row.bleed.nonBlackPct : '-'}`,
    );
  }
  fs.writeFileSync(path.join(OUT_DIR, 'metrics.json'), JSON.stringify(out, null, 2));
  console.log(`  -> metrics.json (${out.length} Eintraege)`);
  return out;
}

/**
 * Portrait-Zuschnitt aus der 3072er Quelle — genau der Ausschnitt, den eine
 * Cutscene-Nahaufnahme spaeter nehmen wuerde. Der Kopf wird aus der Alphamaske
 * lokalisiert, damit der Zuschnitt sitzt und nicht geraten ist.
 */
async function stepFaces(variants, metrics) {
  const mById = Object.fromEntries(metrics.map((m) => [m.id, m]));
  for (const v of variants) {
    const src = path.join(RAW_DIR, `${v.id}_src.png`);
    const m = mById[v.id];
    if (!fs.existsSync(src) || !m) continue;
    const [cw] = m.size.split('x').map(Number);
    const meta = await sharp(src).metadata();
    const s = meta.width / cw;
    const headPx = m.headPxSource || Math.round(meta.height * 0.09);
    const cx = Math.round((m.bbox.left + m.bbox.w / 2) * s);
    const top = Math.max(0, Math.round(m.bbox.top * s - headPx * 0.25));
    const h = Math.min(meta.height - top, Math.round(headPx * 2.1));
    const w = Math.min(meta.width, Math.round(h * 0.78));
    const left = Math.max(0, Math.min(meta.width - w, Math.round(cx - w / 2)));
    await sharp(src).extract({ left, top, width: w, height: h })
      .jpeg({ quality: 94 }).toFile(path.join(FACE_DIR, `${v.id}.jpg`));
    console.log(`  ${v.id}: Portrait-Zuschnitt ${w}x${h} px (Kopf ~${headPx} px)`);
  }
}

/**
 * NAMENSSCHILD-PRUEFUNG. Schneidet aus jeder Variante das Brustband in
 * NATIVEN Pixeln heraus und legt sie je Rolle zu einem Streifen zusammen, auf
 * dem sich die Schrift beurteilen laesst. Die Lage kommt aus der Alphamaske
 * (Scheitel + Kopfhoehe), nicht aus einer geratenen Prozentzahl.
 * Ein verungluecktes Schild ist Ausschuss wie abgeschnittene Beine.
 */
async function stepPatches(variants, metrics) {
  const mById = Object.fromEntries(metrics.map((m) => [m.id, m]));
  const byRole = {};
  for (const v of variants) {
    const src = path.join(RAW_DIR, `${v.id}_src.png`);
    const m = mById[v.id];
    if (!fs.existsSync(src) || !m || !m.headPxSource) continue;
    const meta = await sharp(src).metadata();
    const s = meta.width / Number(m.size.split('x')[0]);
    const hh = m.headPxSource;
    const top = Math.max(0, Math.round(m.bbox.top * s + hh * 1.15));
    const h = Math.min(meta.height - top, Math.round(hh * 1.35));
    const left = Math.max(0, Math.round(m.bbox.left * s));
    const w = Math.min(meta.width - left, Math.round(m.bbox.w * s));
    const buf = await sharp(src).extract({ left, top, width: w, height: h })
      .resize(460, null, { kernel: 'lanczos3' }).png().toBuffer();
    (byRole[v.roleKey] = byRole[v.roleKey] || []).push({ id: v.id, buf });
  }
  for (const [roleKey, list] of Object.entries(byRole)) {
    if (!list.length) continue;
    const ms = await Promise.all(list.map((e) => sharp(e.buf).metadata()));
    const H = Math.max(...ms.map((x) => x.height));
    const LB = 34;
    const comps = [];
    for (let i = 0; i < list.length; i++) {
      comps.push({ input: list[i].buf, left: i * 470, top: 26 });
      comps.push({ input: await textPng(list[i].id, 460, LB, 20, '#ffffff'), left: i * 470, top: 26 + H });
    }
    comps.push({ input: await textPng(
      `Namensschild ${ROLES[roleKey].surname} — native Pixel`, list.length * 470, 26, 18, '#8fd3e8'), left: 0, top: 0 });
    const out = path.join(OUT_DIR, `patches_${roleKey}.png`);
    await sharp({ create: { width: list.length * 470, height: 26 + H + LB, channels: 4, background: BG } })
      .composite(comps).png().toFile(out);
    console.log(`  -> ${path.relative(REPO, out)} (${list.length} Schilder)`);
  }
}

// ── Kontaktbogen ───────────────────────────────────────────────────────────

const TILE_W = 300;
const TILE_H = Math.round(TILE_W * 2752 / 1536); // 538, 9:16
const FACE_H = Math.round(TILE_W * 1.28);
const LABEL_H = 42;
const PAD = 12;
const BG = { r: 18, g: 20, b: 24, alpha: 255 };

const escXml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function textPng(text, w, h, size, fill, weight) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<text x="${Math.round(w / 2)}" y="${Math.round(h / 2 + size * 0.36)}" text-anchor="middle" ` +
    `font-family="DejaVu Sans, Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="${weight || 700}" ` +
    `fill="${fill}" letter-spacing="1">${escXml(text)}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Schachbrett als Grund fuer die Freistellung — macht die Alphakante sichtbar. */
function checkerTile(w, h) {
  const c = 14;
  const rects = [];
  for (let y = 0; y < h; y += c) {
    for (let x = 0; x < w; x += c) {
      if (((x / c) + (y / c)) % 2 === 0) rects.push(`<rect x="${x}" y="${y}" width="${c}" height="${c}" fill="rgb(52,55,61)"/>`);
    }
  }
  return sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<rect width="${w}" height="${h}" fill="rgb(34,36,41)"/>${rects.join('')}</svg>`,
  )).png().toBuffer();
}

/** Nur Varianten, die Fuss- und Randpruefung bestanden haben, kommen in den Bogen. */
function sheetRows(roleKey, variants, mById) {
  return variants.filter((v) => v.roleKey === roleKey
    && fs.existsSync(path.join(RAW_DIR, `${v.id}.jpg`))
    && fs.existsSync(path.join(FACE_DIR, `${v.id}.jpg`))
    && mById[v.id] && mById[v.id].usable);
}

async function buildSheet(roleKey, variants, mById) {
  const role = ROLES[roleKey];
  const rows = sheetRows(roleKey, variants, mById);
  if (!rows.length) { console.log(`  ${roleKey}: keine bestandene Variante — kein Bogen`); return null; }

  const n = rows.length;
  const HEAD_H = 58;
  const W = PAD + n * (TILE_W + PAD);
  const H = HEAD_H + PAD + TILE_H + FACE_H + TILE_H + LABEL_H + PAD;

  const comps = [];
  comps.push({ input: await textPng(`${role.title}   —   ${rows.map((r) => r.id).join('  ·  ')}`, W, HEAD_H, 21, '#8fd3e8'), left: 0, top: 0 });

  const checker = await checkerTile(TILE_W, TILE_H);
  const yFig = HEAD_H + PAD;
  const yFace = yFig + TILE_H;
  const yCut = yFace + FACE_H;
  const yLabel = yCut + TILE_H;

  for (let i = 0; i < n; i++) {
    const v = rows[i];
    const x = PAD + i * (TILE_W + PAD);
    comps.push({
      input: await sharp(path.join(RAW_DIR, `${v.id}.jpg`)).resize(TILE_W, TILE_H, { fit: 'fill' }).png().toBuffer(),
      left: x, top: yFig,
    });
    comps.push({
      input: await sharp(path.join(FACE_DIR, `${v.id}.jpg`)).resize(TILE_W, FACE_H, { fit: 'cover' }).png().toBuffer(),
      left: x, top: yFace,
    });
    const fg = await sharp(path.join(CUT_DIR, `${v.id}.png`)).resize(TILE_W, TILE_H, { fit: 'fill' }).png().toBuffer();
    comps.push({ input: await sharp(checker).composite([{ input: fg, left: 0, top: 0 }]).png().toBuffer(), left: x, top: yCut });
    comps.push({ input: await textPng(v.id, TILE_W, LABEL_H, 25, '#ffffff'), left: x, top: yLabel });
  }

  const out = path.join(OUT_DIR, `contact_${roleKey}.png`);
  await sharp({ create: { width: W, height: H, channels: 4, background: BG } })
    .composite(comps).png().toFile(out);
  console.log(`  -> ${path.relative(REPO, out)} (${W}x${H}, ${n} Varianten: Figur / Portrait-Zuschnitt / Freistellung)`);
  return out;
}

// ── HTML-Ansicht (eine Datei je Vergleichszweck) ───────────────────────────

/**
 * Baut die HTML neu und PRUEFT JEDE src-Referenz gegen das Dateisystem.
 * Bei auch nur einer Abweichung: Abbruch mit Exit-Code 1 (in diesem Projekt
 * sind falsche Pfade in Kontaktbogen-HTML schon zweimal durchgerutscht).
 */
function buildHtml(variants, metrics) {
  const srcs = [];
  const ref = (rel) => { srcs.push(rel); return rel; };
  const mById = Object.fromEntries(metrics.map((m) => [m.id, m]));

  let body = '';
  for (const [roleKey, role] of Object.entries(ROLES)) {
    const ok = sheetRows(roleKey, variants, mById);
    const bad = variants.filter((v) => v.roleKey === roleKey
      && fs.existsSync(path.join(RAW_DIR, `${v.id}.jpg`))
      && !(mById[v.id] && mById[v.id].usable));
    if (!ok.length && !bad.length) continue;

    body += `<h2>${escXml(role.title)}</h2>\n`;
    if (ok.length) body += `<p class="sheet"><img src="${ref(`contact_${roleKey}.png`)}" alt="Kontaktbogen ${roleKey}"></p>\n`;
    body += '<div class="grid">\n';
    for (const v of ok) {
      const m = mById[v.id];
      body +=
        `<figure><div class="trio">` +
        `<img class="fig" src="${ref(`raw/${v.id}.jpg`)}" alt="${v.id}">` +
        `<img class="cut" src="${ref(`cutout/${v.id}.png`)}" alt="${v.id} freigestellt">` +
        `</div><img class="face" src="${ref(`face/${v.id}.jpg`)}" alt="${v.id} Portrait-Zuschnitt">` +
        `<figcaption><b>${v.id}</b><span>${escXml(v.shot.t.slice(0, 80))}</span>` +
        `<span class="m">Kopf ${m.headPxSource || '?'}px · Fuss ${m.footGapPx}px · Rand ${m.edgeGapPx}px · ` +
        `soft ${m.softPct}% · softPerEdge ${m.hairSoftPerEdge} · Halo ${m.haloDelta} · ` +
        `Filament ${m.strandiness.filamentPct}%</span></figcaption></figure>\n`;
    }
    body += '</div>\n';
    if (bad.length) {
      body += `<p class="reject"><b>Ausschuss (Fuesse angeschnitten oder kein Rand, nicht zur Auswahl):</b> ` +
        bad.map((v) => {
          const m = mById[v.id];
          return `${escXml(v.id)} (${m ? `Fuss ${m.footGapPx}px, Rand ${m.edgeGapPx}px` : 'ungeprueft'})`;
        }).join(', ') + `</p>\n`;
    }
  }

  const missing = srcs.filter((s) => !fs.existsSync(path.join(OUT_DIR, s)));
  if (missing.length) {
    console.error('ABBRUCH — src-Referenzen ohne Datei:');
    for (const s of missing) console.error(`  ${s}`);
    process.exit(1);
  }
  console.log(`  src-Verifikation: ${srcs.length} Referenzen, alle vorhanden`);

  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<title>Charakter-Style-Test — Trade Empire</title>
<style>
  body{margin:0;padding:24px;background:#0f1115;color:#d7dde5;font:14px/1.5 "Segoe UI",system-ui,sans-serif}
  h1{color:#63c8e0;font-size:22px;margin:0 0 4px}
  h2{color:#8fd3e8;font-size:18px;margin:36px 0 10px;border-bottom:1px solid #2a2f38;padding-bottom:6px}
  .note{color:#8a94a3;margin:0 0 8px;max-width:1100px}
  .sheet img{max-width:100%;border:1px solid #2a2f38;border-radius:6px}
  .reject{color:#c86b6b;font-size:12px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
  figure{margin:0;background:#171a20;border:1px solid #2a2f38;border-radius:8px;overflow:hidden}
  .trio{display:grid;grid-template-columns:1fr 1fr;background:#0b0d11}
  .trio img{width:100%;display:block}
  .trio .cut{background-color:#33363d;
    background-image:linear-gradient(45deg,#44474f 25%,transparent 25%,transparent 75%,#44474f 75%),
                     linear-gradient(45deg,#44474f 25%,transparent 25%,transparent 75%,#44474f 75%);
    background-size:18px 18px;background-position:0 0,9px 9px}
  .face{width:100%;display:block;border-top:1px solid #2a2f38}
  figcaption{padding:8px 10px;display:flex;flex-direction:column;gap:2px}
  figcaption b{color:#63c8e0;font-family:ui-monospace,Consolas,monospace}
  figcaption span{color:#8a94a3;font-size:11px}
  figcaption .m{color:#6f7a88;font-family:ui-monospace,Consolas,monospace}
</style></head><body>
<h1>Charakter-Style-Test — Ganzkoerper, dreckig &amp; rough</h1>
<p class="note">Versuch, keine Umsetzung. Nichts hiervon ist integriert.
Ganze Figur statt Portrait, weil das Basis-Bild eine Quelle ist: aus einer Figur laesst sich ein Portrait
beschneiden, aus einem Portrait nie eine Figur — und die Video-Pipeline bekommt einen Koerper statt eines Kopfes.
Bildaufbau, Augenhoehe und Kameraabstand sind ueber alle drei Rollen wortgleich vorgegeben, damit sie im
gleichen Massstab stehen.<br>
Generierung: fal-ai/flux-pro/v1.1-ultra, aspect_ratio ${GEN_ASPECT}, raw=true (1536&times;2752 nativ),
danach fal-ai/creative-upscaler 2&times; auf 3072&times;5504. Ansicht und Freistellung auf ${WORK_W}&nbsp;px Breite.
Freistellung: fal-ai/birefnet/v2, model=Portrait, operating_resolution=2048&times;2048, refine_foreground=true
(Parametersatz aus <code>scripts/avatars/utils.ts:BIREFNET_PORTRAIT_MATTING</code>, Commit af845745).<br>
Je Kachel: ganze Figur &middot; Freistellung auf Schachbrett &middot; darunter der Portrait-Zuschnitt in
Originalpixeln — das ist die Nahaufnahme, die eine Cutscene daraus schneiden wuerde.
Kennungen sind die Dateinamen &mdash; z.&nbsp;B. &bdquo;nimm admin_b3&ldquo;.</p>
${body}</body></html>`;

  const out = path.join(OUT_DIR, 'characters-style-test.html');
  fs.writeFileSync(out, html);
  console.log(`  -> ${path.relative(REPO, out)}`);
}

// ───────────────────────────────────────────────────────────────────────────

(async () => {
  const args = process.argv.slice(2);
  const regen = args.includes('regen');
  const step = args.find((a) => ['probe', 'dress', 'gen', 'cutout', 'metrics', 'patches', 'sheets', 'all'].includes(a)) || (regen ? 'gen' : 'all');
  if (step === 'patches') {
    const all = allVariants();
    const mp = path.join(OUT_DIR, 'metrics.json');
    if (!fs.existsSync(mp)) { console.error('metrics.json fehlt — erst "metrics" fahren'); process.exit(1); }
    console.log('=== Namensschild-Pruefung ===');
    await stepPatches(all, JSON.parse(fs.readFileSync(mp, 'utf8')));
    console.log('\nFertig.');
    return;
  }
  if (step === 'dress') {
    // Standardauftrag: die beiden gelungenen Probe-Figuren umkleiden.
    const models = args.includes('--models')
      ? args[args.indexOf('--models') + 1].split(',')
      : ['nano', 'flare'];
    console.log('=== Umkleiden === Modelle: ' + models.join(', '));
    await stepDress([
      { src: 'probe/admin_bg_grey.png', id: 'admin_probe', roleKey: 'admin' },
      { src: 'probe/research_bg_grey.png', id: 'research_probe', roleKey: 'research' },
    ], models);
    console.log('\nFertig.');
    return;
  }
  if (step === 'probe') {
    console.log('=== Backdrop-Probe === Flaechen: ' + Object.keys(BACKDROPS).join(', '));
    await stepProbe();
    console.log('\nFertig.');
    return;
  }
  const only = args.filter((a) => /_[abc]\d$/.test(a));
  let variants = allVariants();
  if (only.length) variants = variants.filter((v) => only.includes(v.id));

  console.log(`=== Charakter-Style-Test (Ganzkoerper) === Schritt: ${step}${regen ? ' (regen)' : ''}, Varianten: ${variants.length}`);
  console.log(`Ausgabe: ${path.relative(REPO, OUT_DIR)}`);

  if (step === 'gen' || step === 'all') { console.log('\n[1/5] Generierung'); await stepGen(variants, regen); }
  if (step === 'cutout' || step === 'all' || (regen && step === 'gen')) {
    console.log('\n[2/5] Freistellung (birefnet/v2 Portrait@2048)');
    await stepCutout(variants, regen);
  }

  let metrics = [];
  if (['metrics', 'sheets', 'all'].includes(step) || regen) {
    console.log('\n[3/5] Kantenforensik + Fuss-/Rand-/Kopf-Pruefung');
    metrics = await stepMetrics(allVariants());
    console.log('\n[4/5] Portrait-Zuschnitte');
    await stepFaces(allVariants(), metrics);
  }
  if (step === 'sheets' || step === 'all' || regen) {
    console.log('\n[5/5] Kontaktboegen + HTML');
    const all = allVariants();
    const mById = Object.fromEntries(metrics.map((m) => [m.id, m]));
    for (const roleKey of Object.keys(ROLES)) await buildSheet(roleKey, all, mById);
    buildHtml(all, metrics);
  }
  console.log('\nFertig.');
})().catch((e) => { console.error('FEHLER:', e && e.stack ? e.stack : String(e)); process.exit(1); });
