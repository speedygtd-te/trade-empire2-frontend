/**
 * NEUE HÜLLEN (3) — Ableitung aus den abgenommenen Basissprites (Versuch 2).
 *
 * Versuch 1 lief über scripts/generate-hull-assets.ts (text-to-image,
 * flux-pro/v1.1) und trifft die Familien-Geometrie nicht: der ausgelieferte
 * Bestand (src/assets/hulls) erbt EINE Würfel-Geometrie (standard_0) bzw. EINE
 * Plattform-Geometrie (platform_outdoor -> platform_space).
 *
 * Dieser Lauf macht es wie die abgenommene Runde in
 * scripts/style-test-hull-batch.cjs: kontext/max auf dem Geometrie-Basissprite,
 * nur Material/Farbe/Zweck im Prompt getauscht, danach
 *   birefnet -> tight-crop -> aspekt-erhaltender Footprint-Fit auf bbox+offset
 *   der Basis (Math.min-Scale, kein Squash) -> 512x512 RGBA PNG.
 *
 * Output: assets/style-test/hull-new3/attempts/<typ>_kontext.png (+ _gen.png)
 * KEINE src-Writes, KEIN cap sync, KEIN git.
 *
 * Usage: node scripts/hull-new3-kontext.cjs [typ] [seedOffset]
 */
const fs = require('fs');
const path = require('path');
try {
  const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const FAL_API_KEY = process.env.FAL_AI_API_KEY || process.env.FAL_API_KEY;
if (!FAL_API_KEY) { console.error('No fal key'); process.exit(1); }
const https = require('https');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const HULLS = path.join(ROOT, 'src', 'assets', 'hulls');
const OUT = path.join(ROOT, 'assets', 'style-test', 'hull-new3', 'attempts');

// Kamera-/Proportionssperre, wörtlich aus der abgenommenen Runde.
const CAMERA =
  'isometric three-quarter view, camera at 45 degree azimuth and ' +
  'approximately 30 degree elevation, EXACTLY matching the perspective, ' +
  'orientation and proportions of the source image - front-left and ' +
  'front-right facades at equal symmetric angles, no rotation, not tilted, ' +
  'not compressed, preserve the exact aspect ratio and cube proportions of ' +
  'the source image.';

const CUBE = (material) =>
  "Rebuild this cubic box structure's exterior surfaces using " + material +
  '. Keep the exact cubic box geometry, the door placements, the silhouette ' +
  'and the proportions of the source image, including the flat closed top ' +
  'surface with its small central hatch. ' + CAMERA +
  ' Isolated single object on a plain flat neutral grey background. No yellow.';

const PLATFORM = (material) =>
  'Rebuild this flat open platform / deck structure using ' + material +
  '. Keep the exact flat open platform geometry of the source image: a low ' +
  'square deck with safety railings around the open top surface and a chunky ' +
  'machinery base underneath, a perfectly square footprint, very short ' +
  'height, open sides, no walls. Do NOT turn it into a closed box - it must ' +
  'stay an open flat platform with railings. ' + CAMERA +
  ' Isolated single object on a plain flat neutral grey background. No yellow.';

const JOBS = {
  composite: {
    base: path.join(HULLS, 'standard', 'standard_0.webp'),
    seed: 991001,
    prompt: CUBE(
      'layered faceted composite armor plates with chamfered angular facets, ' +
      'slim titanium frame rails along all edges and corners, a fine woven ' +
      'carbon hex weave texture on the panel faces, matte dark charcoal ' +
      'composite panels with a few small white status lights, plain unmarked ' +
      'uniform plating',
    ),
  },
  glass_carbon: {
    base: path.join(HULLS, 'standard', 'standard_0.webp'),
    seed: 992001,
    prompt: CUBE(
      'large bright glass window panels set in a slim woven carbon-fiber ' +
      'frame, warm bright interior light behind the glass with lush green ' +
      'plants and small trees clearly visible inside through the glass, light ' +
      'silver-white carbon panels with warm white accent lights, bright and ' +
      'inviting garden living quarters',
    ),
  },
  composite_platform_space: {
    base: path.join(HULLS, 'platform_space', 'platform_space_0.webp'),
    seed: 993001,
    prompt: PLATFORM(
      'a layered composite armor plate deck with a faceted armored top ' +
      'surface, reinforced armor edge beams along all sides, empty unarmed ' +
      'weapon mounting hardpoints and bolted turret pedestal sockets standing ' +
      'on the deck with nothing mounted on them, dark gunmetal and carbon ' +
      'black armor with dim white running lights along the edges',
    ),
  },
};

// VERSUCH 3 ("hard"): Versuch 2 traf die Familien-Geometrie, aber das Material
// blieb unsichtbar (composite kaum von standard zu unterscheiden, Plattform ohne
// erkennbare Panzerung/Hardpoints). Gegenmittel ist das in der abgenommenen
// Runde kalibrierte Muster "IMPORTANT new detail that MUST be clearly visible:"
// (dort für reinforced/airtight nach Rudis "zu langweilig" eingesetzt).
const HARD = {
  composite: CUBE(
    'layered faceted composite armor plating. IMPORTANT new details that MUST ' +
    'be clearly visible and dominant on every facade: large angular armor ' +
    'plates with wide chamfered bevelled edges catching the light, a distinct ' +
    'fine carbon-fiber hexagon weave pattern printed across the plate ' +
    'surfaces, and slim polished titanium frame rails running along every ' +
    'edge and corner. Matte dark charcoal composite with a few small white ' +
    'status lights, plain unmarked plating',
  ),
  glass_carbon: CUBE(
    'a bright glass-and-carbon greenhouse skin. IMPORTANT new details that ' +
    'MUST be clearly visible: every side facade is one large clean sheet of ' +
    'clear glass held in a slim woven carbon-fiber frame, and behind the ' +
    'glass a bright warm-lit interior full of lush green plants, ferns and ' +
    'small trees is clearly visible on all facades. Light silver-white carbon ' +
    'frame, warm white accent lights, clean unbroken glass panes',
  ),
  composite_platform_space: PLATFORM(
    'heavy composite deck armor. IMPORTANT new details that MUST be clearly ' +
    'visible: the whole open deck surface is covered with thick layered ' +
    'composite armor plates with chamfered facets and bolted plate edges, ' +
    'the railings are replaced by low reinforced armor beams, and four empty ' +
    'cylindrical turret mounting pedestals with bolt rings stand on the deck ' +
    'with nothing mounted on them. Dark gunmetal and carbon black armor with ' +
    'dim white running lights along the edges',
  ),
};

// ── RUNDE 2 (Rudi hat alle drei gesehen) ───────────────────────────────────
// COMPOSITE / COMPOSITE_PLATFORM_SPACE: Aussehen bleibt ("sehen eigentlich
//   toll aus"), es fehlt das MATERIAL. Zwei Ergänzungen: der Zweck
//   (gepanzert für Kampf-Raumschiffe / Laser-Lafetten auf Kriegsschiffen) und
//   ausdrücklich SICHTBARE Karbonteile. Gleiche Basis wie Versuch 3 der
//   ersten Runde (standard_0 / platform_space_0), damit die Geometrie und der
//   Grundriss nicht über zwei Generationen wegdriften — die cyanen
//   Leuchtkanten an COMPOSITE bleiben, sie sind entschieden.
// GLASS_CARBON: neu gedacht. Kein Gewächshaus, kein Grün — das "greenery" der
//   Backend-Beschreibung ist Spielmechanik, nicht Motiv. Leerer Glaskasten,
//   nur die WÄNDE verglast, DECKE aus Sicht-Karbon (anthrazit), sehr modern.
//   Glas liest über Reflexe und Tönung, nicht über Transparenz — die
//   Silhouette muss im Alphakanal massiv bleiben (sealAlpha + Nachweis).
const CARBON =
  'EXPOSED CARBON FIBRE left visible as the raw finish, never painted over, ' +
  'with the woven twill carbon weave pattern clearly readable on every panel, ' +
  'like exposed concrete but carbon';

const R2 = {
  composite: CUBE(
    'layered composite armor plating built from exposed carbon fibre. ' +
    'IMPORTANT details that MUST be clearly visible and dominant on every ' +
    'facade: large angular armor panels of ' + CARBON + ', wide chamfered ' +
    'bevelled plate edges catching the light, and slim polished titanium ' +
    'frame rails running along every edge and corner. This is the armored ' +
    'hull segment of a combat spaceship - a warship battle hull, armor for ' +
    'fighting starships. Matte dark charcoal carbon composite with a few ' +
    'small white status lights and the existing glowing edge strips kept ' +
    'exactly as they are, plain unmarked plating',
  ),
  glass_carbon: 'Rebuild this cubic box structure as an EMPTY modern glass ' +
    'and carbon room. IMPORTANT details that MUST be clearly visible: all ' +
    'four side walls are full-height flat panes of glass in a slim minimal ' +
    'frame, and the flat top surface is ' + CARBON + ' in matt anthracite. ' +
    'The volume behind the glass is completely EMPTY - a bare, unfurnished, ' +
    'empty dark interior. The glass reads as glass through crisp bright ' +
    'specular highlights and reflections on its surface and a faint cool ' +
    'tint, and it is dark and mirror-like, so every pane stays solid and ' +
    'shows reflections of its surroundings. Very modern, minimalist, clean, ' +
    'smooth flush surfaces. Keep the exact cubic box geometry, the silhouette ' +
    'and the proportions of the source image, and keep the flat closed top ' +
    'surface with its small central hatch. ' + CAMERA +
    ' Isolated single object on a plain flat neutral grey background. No yellow.',
  composite_platform_space: PLATFORM(
    'heavy composite deck armor built from exposed carbon fibre. IMPORTANT ' +
    'details that MUST be clearly visible: the whole open deck surface is ' +
    'covered with thick layered armor plates of ' + CARBON + ', with ' +
    'chamfered facets and bolted plate edges, the safety railings are ' +
    'armored with reinforced beam segments, and four empty cylindrical ' +
    'turret mounting pedestals with bolt rings stand on the deck with ' +
    'nothing mounted on them. This is an armoured outdoor platform for laser ' +
    'mounts on a warship - the gun deck of a combat spaceship, and the ' +
    'pedestals stay bare because the weapon itself is a separate module. ' +
    'Dark gunmetal and carbon black with dim white running lights along the ' +
    'edges',
  ),
};

// ── RUNDE 3 (Rudis Navy-Idee) ──────────────────────────────────────────────
// Nur COMPOSITE + COMPOSITE_PLATFORM_SPACE, als eigene Unterfamilie.
// Zwei Gründe, warum das mehr ist als eine Farbwahl:
//  (a) "wenig nach composite" kam daher, dass anthrazitfarbenes Karbongewebe
//      auf dunkelgrauem Panzerstahl DUNKEL AUF DUNKEL liegt. Als KONTRASTPAAR
//      formuliert — navy lackierte Segmente NEBEN unlackierten Sicht-Karbon-
//      Flächen — wird das Gewebe erst als eigenes Material lesbar.
//  (b) REINFORCED hat bereits Warnstreifen (orange). Gelb gegen Orange trennt
//      auf Spielskala nicht; der tragende Unterschied muss das NAVY sein.
//      Gelb daher ausdrücklich sparsam und nur als Akzent.
// Hinweis: die "No yellow."-Klausel der Familientemplates muss hier weg —
// deshalb eigene Templates ohne diesen Satz.
const CUBE_NAVY = (material) =>
  "Rebuild this cubic box structure's exterior surfaces using " + material +
  ' Keep the exact cubic box geometry, the door placements, the silhouette ' +
  'and the proportions of the source image, including the flat closed top ' +
  'surface with its small central hatch. ' + CAMERA +
  ' Isolated single object on a plain flat neutral grey background.';

const PLATFORM_NAVY = (material) =>
  'Rebuild this flat open platform / deck structure using ' + material +
  ' Keep the exact flat open platform geometry of the source image: a low ' +
  'square deck with safety railings around the open top surface and a chunky ' +
  'machinery base underneath, a perfectly square footprint, very short ' +
  'height, open sides, no walls. Do NOT turn it into a closed box - it must ' +
  'stay an open flat platform with railings. ' + CAMERA +
  ' Isolated single object on a plain flat neutral grey background.';

const NAVY_BODY =
  'armor plating made of a CONTRAST PAIR of two materials: large plates of ' +
  'NAVY BLUE painted armor - deep dark naval navy blue lacquer with a satin ' +
  'sheen - and, set between and around them, unpainted panels of ' + CARBON +
  ' in matt anthracite, so the woven carbon reads clearly as a DIFFERENT ' +
  'MATERIAL against the navy lacquer. IMPORTANT details that MUST be clearly ' +
  'visible: the navy painted armor plates dominate the facades, the ' +
  'anthracite exposed-carbon panels sit between them with their weave ' +
  'readable, wide chamfered bevelled plate edges catch the light, and a few ' +
  'narrow YELLOW hazard warning stripes appear sparingly as a small accent ' +
  'only on the corner rails, the door frame and the lower skirt - navy is the ' +
  'dominant colour, the yellow is only a sparse naval accent. This is the ' +
  'armored hull segment of a combat spaceship - a warship battle hull, armor ' +
  'for fighting starships.';

const NAVY = {
  // Fassung A: die vorhandenen cyanen Leuchtkanten bleiben stehen.
  composite: CUBE_NAVY(NAVY_BODY + ' Keep the existing glowing cyan edge light strips exactly as they are.'),
  composite_platform_space: PLATFORM_NAVY(
    'heavy deck armor made of a CONTRAST PAIR of two materials: NAVY BLUE ' +
    'painted armor plates - deep dark naval navy blue lacquer with a satin ' +
    'sheen - covering the open deck, and unpainted ' + CARBON + ' in matt ' +
    'anthracite on the edge beams, the railings and the machinery base, so ' +
    'the woven carbon reads clearly as a DIFFERENT MATERIAL against the navy ' +
    'lacquer. IMPORTANT details that MUST be clearly visible: navy armor ' +
    'plates cover the whole deck surface with chamfered facets and bolted ' +
    'plate edges, four empty cylindrical turret mounting pedestals with bolt ' +
    'rings stand on the deck with nothing mounted on them, and narrow YELLOW ' +
    'hazard warning stripes appear sparingly as a small accent only on the ' +
    'pedestal collars and the base skirt - navy is the dominant colour, the ' +
    'yellow is only a sparse naval accent. This is an armoured outdoor ' +
    'platform for laser mounts on a warship - the gun deck of a combat ' +
    'spaceship, and the pedestals stay bare because the weapon itself is a ' +
    'separate module. Dim warm white running lights along the edges.',
  ),
};

// Fassung B von COMPOSITE: Navy + Gelb wären mit Cyan eine DRITTE Akzentfarbe.
// Diese Fassung tauscht die Kantenstreifen auf bernstein-warmweiß. Beide gehen
// in den Kontaktbogen — die Entscheidung liegt bei Rudi.
const NAVY2 = {
  composite: CUBE_NAVY(NAVY_BODY + ' The glowing edge light strips are warm amber-white instead of cyan.'),
};


// RUNDE 3, GLASS_CARBON: die r2-Fassung traf Leere, Glaswände und anthrazitene
// Decke, aber das GEWEBE auf der Decke war nicht lesbar — genau der Punkt an
// Rudis "sicht-karbon". Diese Fassung verlangt es ausdrücklich grob genug, um
// es zu sehen, und schärft das Glas auf Reflexstreifen statt Milchglas.
const R3 = {
  glass_carbon: 'Rebuild this cubic box structure as an EMPTY modern glass ' +
    'and carbon room. IMPORTANT details that MUST be clearly visible: all ' +
    'four side walls are full-height flat panes of clear pale glass in a ' +
    'slim minimal frame, reading as glass through crisp bright specular ' +
    'highlight streaks and a faint cool tint, opaque and solid so each pane ' +
    'shows reflections of its surroundings rather than the interior; and the ' +
    'flat top surface is a thick slab of ' + CARBON + ' in matt anthracite, ' +
    'with the twill weave pattern COARSE ENOUGH TO READ clearly across the ' +
    'whole top slab. The volume behind the glass is completely EMPTY - a ' +
    'bare, unfurnished, empty interior. Very modern, minimalist, clean, ' +
    'smooth flush surfaces. Keep the exact cubic box geometry, the ' +
    'silhouette and the proportions of the source image, and keep the flat ' +
    'closed top surface with its small central hatch. ' + CAMERA +
    ' Isolated single object on a plain flat neutral grey background. No yellow.',
};


// ── RUNDE 4 (Rudi korrigiert die Streifen) ─────────────────────────────────
// "reinforced hat nur ganz dezente orange streifen. ich würde es eher
//  umgedreht machen. richtig offensiv gelbe warnstreifen oben und unten".
// Am Bild geprüft: REINFORCED trägt haarfeine rostorange Fugenlinien auf fast
// schwarzem Korpus, keine Warnbänder — die Kollisionsgefahr, vor der ich
// gewarnt hatte, gibt es nicht. Also: navy Korpus, Sicht-Karbon dazwischen,
// und BREITE gelbe Chevron-Bänder oben und unten, die das Bild mittragen.
const BODY4 =
  'armor plating made of a CONTRAST PAIR of two materials plus bold warning ' +
  'bands. The body is NAVY BLUE painted armor - deep dark naval navy blue ' +
  'lacquer with a satin sheen - and between the navy plates sit unpainted ' +
  'panels of ' + CARBON + ' in matt anthracite, so the woven carbon reads ' +
  'clearly as a DIFFERENT MATERIAL against the navy lacquer. IMPORTANT ' +
  'details that MUST be clearly visible and must CARRY the image: a WIDE ' +
  'BOLD YELLOW HAZARD WARNING BAND runs all the way around the structure ' +
  'just under the roof edge, and a second WIDE BOLD YELLOW HAZARD WARNING ' +
  'BAND runs all the way around the base skirt at the bottom - both bands ' +
  'painted with big graphic black diagonal chevron stripes, the classic ' +
  'hazard marking, dominant on every facade. Navy stays the body colour ' +
  'between the two bands, with the anthracite exposed-carbon panels in ' +
  'between. This is the armored hull segment of a combat spaceship - a ' +
  'warship battle hull, armor for fighting starships.';

// ── RUNDE 5, GLASS_CARBON ──────────────────────────────────────────────────
// Rudi: "sieht zu einfach aus ... zu 'normal' ... nicht wie aus der zukunft.
// nicht scifi". Fünf ausdrücklich VERSCHIEDENE Richtungen, nicht fünf Seeds
// derselben Formulierung. Bindend in allen: leerer Innenraum, nur die WÄNDE
// verglast, DECKE Sicht-Karbon anthrazit, Würfelgeometrie der Basis.
const GLASS_TAIL =
  ' The interior behind the glass is completely EMPTY - bare, unfurnished, ' +
  'nothing standing in it. Only the four side walls are glazed. Keep the ' +
  'exact cubic box geometry, the silhouette and the proportions of the ' +
  'source image. ' + CAMERA +
  ' Isolated single object on a plain flat neutral grey background. No yellow.';
const GLASS_LID =
  ' The flat top surface is a slab of ' + CARBON + ' in matt anthracite.';

const GLASSDIR = {
  // A — Tech-Rahmen / Aerospace: das anthrazitene Sockelband gibt der Hülle
  //     den Körper, der der Vitrinen-Fassung fehlte.
  ga: 'Rebuild this cubic box structure as an EMPTY high-tech glass and carbon ' +
    'habitat module. IMPORTANT details that MUST be clearly visible: the four ' +
    'side walls are glass panes seated in a CHAMFERED AEROSPACE FRAME - the ' +
    'cube edges are bevelled and machined, not thin and sharp, with visible ' +
    'dark rubber sealing gaskets between frame and glass and chunky machined ' +
    'CORNER NODES that read as real structural connectors; a solid ' +
    'ANTHRACITE SKIRT BAND of exposed carbon fibre wraps the bottom third of ' +
    'the module, with recessed service panels, latches and vents set into it, ' +
    'so the module has a heavy body standing on the ground; recessed cool ' +
    'white LED light lines glow along the top of that skirt band and under ' +
    'the roof overhang.' + GLASS_LID + GLASS_TAIL,
  // B — Smart-Glass: das Glas selbst wird zur aktiven Technik.
  gb: 'Rebuild this cubic box structure as an EMPTY futuristic smart-glass and ' +
    'carbon module. IMPORTANT details that MUST be clearly visible: the four ' +
    'side walls are laminated multi-layer ELECTROCHROMIC SMART GLASS panes ' +
    'with a tint gradient that grows clearly darker towards the top, a faint ' +
    'iridescent sheen shifting from blue to violet across the surface, and ' +
    'thin ILLUMINATED SEAMS glowing cool white between the panes and around ' +
    'their frames; the glass reads as ACTIVE TECHNOLOGY rather than window ' +
    'glass, and every pane stays solid and opaque, showing reflections and ' +
    'its own glow instead of the interior.' + GLASS_LID + GLASS_TAIL,
  // C — Karbon-Exoskelett: das Karbon bekommt Fläche statt nur eine Platte zu
  //     sein — die beste Chance, das Gewebe überhaupt lesbar zu bekommen.
  gc: 'Rebuild this cubic box structure as an EMPTY glass module held in a ' +
    'CARBON FIBRE EXOSKELETON. IMPORTANT details that MUST be clearly ' +
    'visible: broad moulded RIBS of ' + CARBON + ' in matt anthracite wrap ' +
    'every corner and every edge of the cube and run across the facades as a ' +
    'visible load-bearing skeleton, and the glass panes sit INSIDE the ribs ' +
    'as infill panels, recessed behind them; the carbon structure reads as ' +
    'engineered and constructed, the glass only as filling. The twill weave ' +
    'of the carbon ribs is coarse and clearly readable. The flat top surface ' +
    'is the same exposed carbon in matt anthracite, continuous with the ribs.' +
    GLASS_TAIL,
  // D — Facettierte Verglasung im schlanken Karbongitter.
  gd: 'Rebuild this cubic box structure as an EMPTY futuristic FACETED GLASS ' +
    'habitat module. IMPORTANT details that MUST be clearly visible: each ' +
    'side wall is built from several angled GLASS FACETS set in a slim ' +
    'anthracite carbon-fibre lattice, so the glazing breaks the light into ' +
    'many different planes like a cut gem, with crisp bright highlight ' +
    'streaks on some facets and darker tinted reflections on others, while ' +
    'the overall footprint stays a perfect cube; each facet stays solid and ' +
    'opaque, showing reflections instead of the interior.' + GLASS_LID +
    GLASS_TAIL,
  // E — meine eigene fünfte: nicht "moderner Glaskasten", sondern DIESELBE
  //     Hülle wie der Bestand, nur verglast. Antwort auf "wirkt wie ein
  //     anderes Objekt, nicht wie eine andere Hülle".
  ge: 'Rebuild this cubic box structure by REPLACING the door and wall panels ' +
    'of its facades with full-height GLASS PANES, while keeping everything ' +
    'else of this hull exactly as it is. IMPORTANT: keep the existing heavy ' +
    'corner posts, the edge frame rails, the top hatch, the bolted fittings ' +
    'and the small greebles of the source hull completely intact and ' +
    'recognisable as the same manufactured hull family - only the flat panel ' +
    'areas between them become glass. The glass panes are dark-tinted and ' +
    'mirror-like with crisp bright specular highlight streaks, solid and ' +
    'opaque, showing reflections instead of the interior, and the frame ' +
    'around them is ' + CARBON + ' in matt anthracite.' + GLASS_LID +
    GLASS_TAIL,
};

// E/F (Rudi): Karbongeflecht HINTER den Scheiben, mit Knotenleuchten.
// MASSSTAB: "fein" ist auf 144 Gerätepixeln (zoom 1, dpr 3) tot — das Sprite
// wird auf 28 % skaliert. Deshalb ausdrücklich GROSSE Zellen verlangt (6-8
// über eine Wand, also ~40 px in der 512er Quelle, ~11 px auf Spielskala) und
// Knotenleuchten als Punkte, die das Herunterskalieren besser überleben als
// dünne Linien. Und: das Geflecht ist WANDAUFBAU, nicht Inhalt — sonst füllt
// kontext den Kasten wieder mit Dingen.
const MESH_EMPTY =
  ' The mesh is integrated directly behind the glazing as part of the wall ' +
  'assembly, not an object standing in the room: the interior volume itself ' +
  'stays completely EMPTY, bare and unfurnished, with no machines, no ' +
  'furniture and no objects in it. Only the four side walls are glazed. Keep ' +
  'the exact cubic box geometry, the silhouette and the proportions of the ' +
  'source image. ' + CAMERA +
  ' Isolated single object on a plain flat neutral grey background. No yellow.';

Object.assign(GLASSDIR, {
  gh: 'Rebuild this cubic box structure as an EMPTY futuristic glass module ' +
    'with a CARBON HONEYCOMB MESH behind its glass. IMPORTANT details that ' +
    'MUST be clearly visible: behind each of the four glass walls sits a ' +
    'hexagonal honeycomb lattice of ' + CARBON + ', and the hexagon cells ' +
    'are LARGE AND COARSE - only about six to eight cells span the width of ' +
    'a wall, each cell as big as a hand, so the pattern stays clearly ' +
    'readable from a distance; a small bright cool-white light glows at ' +
    'every node where the struts of the lattice meet, and these glowing dots ' +
    'read as a technical grid through the glass. The glass panes stay solid ' +
    'and opaque with crisp specular highlight streaks.' + GLASS_LID +
    MESH_EMPTY,
  go: 'Rebuild this cubic box structure as an EMPTY futuristic glass module ' +
    'with an ORGANIC CARBON WEB behind its glass. IMPORTANT details that ' +
    'MUST be clearly visible: behind each of the four glass walls sits an ' +
    'irregular, grown, vein-like web of branching ' + CARBON + ' strands, ' +
    'like the veins of a leaf or a root system frozen in place; the strands ' +
    'are THICK AND COARSE - as thick as a finger, with only a handful of ' +
    'large openings across each wall, so the web stays clearly readable from ' +
    'a distance, and small bright cool-white lights glow at the branching ' +
    'points. The glass panes stay solid and opaque with crisp specular ' +
    'highlight streaks.' + GLASS_LID + MESH_EMPTY,
});

// ── RUNDE 6: SYNTHESE G + E (Rudis Entscheidung) ───────────────────────────
// "als scifi asset gefällt mir [G] am besten. die hexagons sehen auch ok aus.
//  der rest vom asset ist aber sehr langweilig bis auf die hexagons. bei
//  diesem ist auch endlich karbon richtig sichtbar."
// Also: Chassis von G (Rahmen, Eckpfosten, Beschläge, sichtbarer Karbon-Twill,
// Glas IN das Chassis eingesetzt) + das GROBE Hexagon-Geflecht von E dahinter.
// Die Zellgröße bleibt bei den 6-8 Zellen pro Wand aus E — nicht feiner, sonst
// stirbt sie auf 144 Gerätepixeln.
// Ton: cyan bleibt. Der zweite (bernsteinfarbene) Ton war als Absicherung
// gegen die STANDARD-Nähe vorgesehen; Rudi hat das Kriterium gestrichen ("es
// ist ja nicht schlimm wenn es nah an standard ist ... beide neuen materialien
// sind eingebracht"), gy wurde deshalb nie generiert und bleibt nur als
// dokumentierte, nicht gefahrene Alternative stehen.
const SYNTH = (tone) =>
  'Rebuild this cubic box structure by REPLACING the door and wall panels of ' +
  'its facades with full-height GLASS PANES, while keeping the hull chassis ' +
  'itself exactly as it is. IMPORTANT: keep the existing heavy corner posts, ' +
  'the edge frame rails, the top hatch, the bolted fittings, the service ' +
  'panels and the small greebles of the source hull completely intact and ' +
  'recognisable as the same manufactured hull family - only the flat panel ' +
  'areas between them become glass, set INTO the chassis. The chassis frame, ' +
  'posts and rails are ' + CARBON + ' in matt anthracite, and their twill ' +
  'weave must be clearly visible. SECOND IMPORTANT detail: directly behind ' +
  'each glass pane sits a hexagonal HONEYCOMB LATTICE of the same exposed ' +
  'carbon fibre, and its cells are LARGE AND COARSE - only about six to ' +
  'eight cells span the width of a wall, each cell as big as a hand, so the ' +
  'pattern stays clearly readable from a distance; a small bright ' + tone.node +
  ' light glows at every node where the struts of the lattice meet, and ' +
  'these glowing dots read as a technical grid through the glass. The glass ' +
  'panes are lightly tinted and clearly show the honeycomb lattice behind ' +
  'them, with crisp bright specular highlight streaks, and they stay solid ' +
  'and opaque. ' + tone.strip + GLASS_LID + MESH_EMPTY;

Object.assign(GLASSDIR, {
  gx: SYNTH({ node: 'cool white', strip: 'The glowing edge light strips of the hull stay cyan, exactly as they are.' }),
  gy: SYNTH({ node: 'warm amber', strip: 'The glowing edge light strips of the hull are warm amber-white instead of cyan.' }),
  // gz: der additive Weg — direkt aus der abgenommenen G-Rückgabe, es soll sich
  // NUR das Geflecht ändern. Laut LESSONS §3 ist kontext nie additiv und
  // regeneriert stattdessen; einen Aufruf ist die Probe wert, weil dieser Weg
  // theoretisch genau das erhält, was Rudi an G gefallen hat.
  gz: 'Keep this glass and carbon hull module exactly as it is - the same ' +
    'chassis, the same corner posts, frame rails, bolted fittings, service ' +
    'panels, glass panes, top slab and the same cyan edge lighting - and ' +
    'change only ONE thing: directly behind each glass pane a hexagonal ' +
    'HONEYCOMB LATTICE of exposed carbon fibre in matt anthracite becomes ' +
    'visible, with LARGE COARSE cells - only about six to eight cells across ' +
    'the width of a wall, each cell as big as a hand - and a small bright ' +
    'cool white light glowing at every node of the lattice, so a technical ' +
    'glowing grid reads through the glass.' + MESH_EMPTY,
});

/** Basis-Sprite je Modus, wo es von JOBS[type].base abweicht. */
const BASE_OVERRIDE = {
  gz: path.join(OUT, 'glass_carbon_ge.png'),
};

const NAVY3 = {
  composite: CUBE_NAVY(BODY4 + ' Keep the existing glowing cyan edge light strips exactly as they are.'),
  composite_platform_space: PLATFORM_NAVY(
    'heavy deck armor made of a CONTRAST PAIR of two materials plus bold ' +
    'warning bands. The deck plates are NAVY BLUE painted armor - deep dark ' +
    'naval navy blue lacquer with a satin sheen - and the edge beams, the ' +
    'railings and the machinery base carry unpainted ' + CARBON + ' in matt ' +
    'anthracite, so the woven carbon reads clearly as a DIFFERENT MATERIAL ' +
    'against the navy lacquer. IMPORTANT details that MUST be clearly ' +
    'visible and must CARRY the image: a WIDE BOLD YELLOW HAZARD WARNING ' +
    'BAND with big black diagonal chevron stripes runs all the way around ' +
    'the outside of the railing at the deck edge, and a second WIDE BOLD ' +
    'YELLOW chevron BAND runs all the way around the machinery base skirt at ' +
    'the bottom. The open deck surface itself stays clear flat navy armor ' +
    'plating carrying four empty cylindrical turret mounting pedestals with ' +
    'bolt rings and nothing mounted on them, so a separate weapon module has ' +
    'room to stand there. This is an armoured outdoor platform for laser ' +
    'mounts on a warship - the gun deck of a combat spaceship. Dim warm ' +
    'white running lights along the edges.',
  ),
};

// Fassung B: dieselben Bänder, aber die Leuchtkanten bernstein-warmweiß statt
// cyan - mit Navy und breitem Gelb ist Cyan eine dritte Akzentfarbe.
const NAVY4 = {
  composite: CUBE_NAVY(BODY4 + ' The glowing edge light strips are warm amber-white instead of cyan.'),
};

/** Glaswände dürfen das Sprite nicht durchsichtig machen: transparente Inseln
 *  INNERHALB der Silhouette (birefnet schneidet Glas gern heraus) werden auf
 *  Alpha 255 gesetzt. Von außen erreichbare Transparenz bleibt unberührt.
 *
 *  RGB kommt dabei aus der GENERIERUNG vor der Hintergrundentfernung, nicht aus
 *  birefnets Ausgabe: birefnet nullt die Farbe unter dem entfernten Alpha, ein
 *  Versiegeln auf dessen Puffer liefert also SCHWARZE Löcher in den Scheiben
 *  (Runde 2, 90813 Pixel — im Bild als zerrissene schwarze Flächen sichtbar). */
async function sealAlpha(buf, genBuf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, C = info.channels;
  let src = null;
  if (genBuf) {
    const g = await sharp(genBuf).ensureAlpha().resize(w, h, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    if (g.info.channels === C) src = g.data;
  }
  const outside = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => { const p = y * w + x; if (!outside[p] && data[p * C + 3] < 250) { outside[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const p = stack.pop(), x = p % w, y = (p - x) / w;
    if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1);
  }
  let sealed = 0;
  const out = Buffer.from(data);
  for (let p = 0; p < w * h; p++) {
    if (!outside[p] && data[p * C + 3] < 250) {
      if (src) { out[p * C] = src[p * C]; out[p * C + 1] = src[p * C + 1]; out[p * C + 2] = src[p * C + 2]; }
      out[p * C + 3] = 255; sealed++;
    }
  }
  return { buf: await sharp(out, { raw: { width: w, height: h, channels: C } }).png().toBuffer(), sealed };
}

function dataUri(buf) { return `data:image/png;base64,${buf.toString('base64')}`; }
function fetchJson(model, body) {
  return new Promise((resolve, reject) => {
    const u = new URL('https://fal.run/' + model);
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { Authorization: `Key ${FAL_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      const c = []; res.on('data', (d) => c.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(c).toString();
        if (res.statusCode >= 400) return reject(new Error(`fal ${model} ${res.statusCode}: ${raw.slice(0, 400)}`));
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('bad json ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject); req.write(payload); req.end();
  });
}
function download(url) {
  return new Promise((resolve, reject) => {
    const go = (u) => https.get(u, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) return go(res.headers.location);
      const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => resolve(Buffer.concat(c))); res.on('error', reject);
    }).on('error', reject);
    go(url);
  });
}
async function removeBg(buf) {
  const r = await fetchJson('fal-ai/birefnet', { image_url: dataUri(buf) });
  const url = (r.image && r.image.url) || (r.images && r.images[0] && r.images[0].url);
  if (!url) throw new Error('no bg url');
  return download(url);
}
async function bbox(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * C + 3] > 16) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) throw new Error('fully transparent');
  return { W, H, minX, minY, bw: maxX - minX + 1, bh: maxY - minY + 1 };
}
async function fitToBase(croppedBuf, o) {
  const meta = await sharp(croppedBuf).metadata();
  const scale = Math.min(o.bw / meta.width, o.bh / meta.height);
  const nw = Math.max(1, Math.round(meta.width * scale));
  const nh = Math.max(1, Math.round(meta.height * scale));
  const resized = await sharp(croppedBuf).resize(nw, nh, { fit: 'fill' }).png().toBuffer();
  const left = o.minX + Math.round((o.bw - nw) / 2);
  const top = o.minY + Math.round((o.bh - nh) / 2);
  return sharp({ create: { width: o.W, height: o.H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, left, top }]).png().toBuffer();
}

/** Glas/Karbon-Würfel sind massive Körper — bei ihnen wird Alpha versiegelt.
 *  Die Plattform ist ein offenes Gestell, dort ist Durchsicht gewollt. */
const SEAL = new Set(['composite', 'glass_carbon']);

async function run(type, seedOffset, mode) {
  const job = JOBS[type];
  if (!job) throw new Error('unknown type ' + type);
  const basePath = BASE_OVERRIDE[mode] || job.base;
  const baseBuf = await sharp(fs.readFileSync(basePath)).png().toBuffer();
  const o = await bbox(baseBuf);
  const P = { r2: R2, r3: R3, navy: NAVY, navy2: NAVY2, navy3: NAVY3, navy4: NAVY4, hard: HARD };
  for (const k of Object.keys(GLASSDIR)) P[k] = { glass_carbon: GLASSDIR[k] };
  const prompt = P[mode] ? P[mode][type] : job.prompt;
  if (!prompt) throw new Error('kein Prompt fuer ' + type + ' im Modus ' + mode);
  // seedOffset gehört in den Dateinamen — sonst überschreibt ein Re-Roll die
  // vorige Rückgabe desselben Modus (einmal passiert, kostete die beste
  // Plattform-Rückgabe mit Grundriss-Abweichung +0.5 %).
  const tag = (P[mode] ? (mode === 'hard' ? 'kontext2' : mode) : 'kontext')
    + (seedOffset ? `_s${seedOffset}` : '');
  const OFF = { hard: 40000, r2: 80000, navy: 120000, navy2: 160000, r3: 200000, navy3: 240000, navy4: 280000, ga: 300000, gb: 340000, gc: 380000, gd: 420000, ge: 460000, gh: 500000, go: 540000, gx: 580000, gy: 620000, gz: 660000 };
  const seed = job.seed + (OFF[mode] || 0) + (seedOffset || 0) * 137;
  console.log(`[kontext] ${type} seed=${seed} base=${path.basename(basePath)} baseAspect=${(o.bw / o.bh).toFixed(4)}`);
  const r = await fetchJson('fal-ai/flux-pro/kontext/max', {
    prompt, image_url: dataUri(baseBuf), seed,
    guidance_scale: 3.5, num_images: 1, safety_tolerance: '5', output_format: 'png',
  });
  const gen = await download(r.images[0].url);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${type}_${tag}_gen.png`), gen);
  let nobg; try { nobg = await removeBg(gen); } catch { nobg = gen; }
  if (SEAL.has(type)) {
    const s = await sealAlpha(nobg, gen);
    nobg = s.buf;
    console.log(`  [seal] ${s.sealed} innenliegende transparente Pixel auf Alpha 255 gesetzt`);
  }
  const cb = await bbox(nobg);
  const cropped = await sharp(nobg).extract({ left: cb.minX, top: cb.minY, width: cb.bw, height: cb.bh }).png().toBuffer();
  const fitted = await fitToBase(cropped, o);
  const outFile = path.join(OUT, `${type}_${tag}.png`);
  fs.writeFileSync(outFile, fitted);
  const dev = ((cb.bw / cb.bh - o.bw / o.bh) / (o.bw / o.bh)) * 100;
  console.log(`  -> ${outFile}  objAspect ${(cb.bw / cb.bh).toFixed(4)} (dev ${dev.toFixed(1)}%)`);
}

// Die Prompt-Tabellen und die Seed-Basen sind importierbar, damit der
// Kontaktbogen (scripts/hull-new3-sheet.cjs) Prompt und Seed je Fassung
// AUSWEISEN kann, ohne sie zu duplizieren — eine zweite Abschrift wäre die
// erste Stelle, an der Bogen und Generierung auseinanderlaufen.
module.exports = { JOBS, HARD, R2, R3, NAVY, NAVY2, NAVY3, NAVY4, GLASSDIR,
  SEED_OFFSETS: { hard: 40000, r2: 80000, navy: 120000, navy2: 160000, r3: 200000,
    navy3: 240000, navy4: 280000, ga: 300000, gb: 340000, gc: 380000, gd: 420000,
    ge: 460000, gh: 500000, go: 540000, gx: 580000, gy: 620000, gz: 660000 },
  BASE_OVERRIDE };

if (require.main !== module) return;

(async () => {
  const only = (process.argv[2] || '').toLowerCase();
  const seedOffset = parseInt(process.argv[3] || '0', 10);
  const MODE = ["navy3","navy4","navy2","navy","r2","r3","hard","ga","gb","gc","gd","ge","gh","go","gx","gy","gz"].find((m) => process.argv.includes("--" + m)) || "soft";
  const list = only && only !== 'all' ? [only] : Object.keys(({navy:NAVY,navy2:NAVY2,navy3:NAVY3,navy4:NAVY4,r3:R3,r2:R2}[MODE] || (GLASSDIR[MODE] ? {glass_carbon:1} : JOBS)));
  for (const t of list) {
    try { await run(t, seedOffset, MODE); } catch (e) { console.error(`ERR ${t}: ${e.message}`); }
  }
  console.log('done');
})();
