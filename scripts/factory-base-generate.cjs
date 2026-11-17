/**
 * Asset-Pipeline STUFE 1: FABRIK-BASIS-Kandidaten ("Bühne" für den Merge).
 *
 * Hintergrund (Rudis Verfahren, abgeleitet vom Backend-Tile-Bau):
 *   1. Basis-Assets generieren            <- DIESES SCRIPT
 *   2. Rudi waehlt die beste Basis
 *   3. echte Produkt-Assets (je 2) per Flux-Edit in "in construction" wandeln
 *   4. diese per Flux-Edit in die Basis mergen
 *
 * Die Basis ist deshalb KEIN fertiges Bild, sondern eine BUEHNE:
 *   - eine klar erkennbare, LEERE Fertigungsflaeche (Montageplatz / Bucht)
 *   - gut beleuchtet, perspektivisch eindeutig (Merge, kein Neuzeichnen)
 *   - gross genug fuer SECHS Produktfamilien: Huellenplatten (flach+breit),
 *     Triebwerke (lang), Waffen (schlank), Industriemaschinen (klobig),
 *     Elektronik (klein+flach), Wohnmodule (Quader, hoch)
 *   - auch LEER als Fabrik lesbar: Kran, Portal, Werkbaenke, Versorgungsarme
 *
 * Variationsachse = was fuer die MONTAGE zaehlt: Lage und Groesse der freien
 * Flaeche, Blickwinkel auf die Bucht, wieviel Rahmen drumherum steht, mittig
 * vs. seitlich, Kopffreiheit. NICHT Farbe/Beschriftung.
 *
 * Style-Anker + INDOOR_SUFFIX: WORTGLEICH aus scripts/regenerate-37-modules.ts.
 * Anti-Crop-/Anti-Rotations-Klauseln aus scripts/factory-split-generate.cjs.
 * INDOOR => KEINE _lit-Fassung.
 *
 * Pipeline (CLAUDE.md Phase 2b, Schritte 2-5):
 *   flux/dev @512x512 PNG -> birefnet/v2 BG-Removal -> sharp trim (tight crop)
 *   -> auf zentriertes 1:1-Quadrat padden (KEIN Resize; Familie ist 479-512 px)
 *
 * Schreibt NUR nach assets/. Nichts unter src/. Kein cap sync, kein commit.
 * fal-Key aus scripts/.env (FAL_API_KEY) — nie hardcoden.
 *
 * Usage:
 *   node scripts/factory-base-generate.cjs prompts
 *   node scripts/factory-base-generate.cjs candidates        # alle
 *   node scripts/factory-base-generate.cjs candidates b3 b7  # nur diese
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');

// ── fal key aus scripts/.env ──
try {
  const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const FAL_API_KEY = process.env.FAL_API_KEY || process.env.FAL_AI_API_KEY;
if (!FAL_API_KEY) {
  console.error('No FAL_API_KEY in scripts/.env');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const DIR_RAW = path.join(ROOT, 'assets', 'raw');
const DIR_NOBG = path.join(ROOT, 'assets', 'nobg');
const DIR_CROP = path.join(ROOT, 'assets', 'cropped');
const DIR_ST = path.join(ROOT, 'assets', 'style-test', 'modules');

// ── Style-Anker: wortgleich aus regenerate-37-modules.ts ──
const BASE_STYLE =
  'isometric game asset, isometric 2.5D perspective, 30 degree camera angle from horizontal, ' +
  '2:1 isometric perspective, The Expanse hard sci-fi aesthetic, ' +
  'navy-blue painted steel with yellow safety stripes, weathered metal surfaces, ' +
  'photorealistic textures, scratched paint, grime and oil residue, ' +
  'lit from upper left, soft top-left key light, no background, isolated object, ' +
  'game sprite, centered, single object, no ground plane, no shadow, ' +
  // anti-crop (aus factory-split-generate.cjs / refit-dock-generate.cjs)
  'entire structure fully visible in frame, generous empty margin around the complete object, ' +
  'nothing cropped at image borders, whole object inside the canvas, zoomed out, small in frame, ' +
  // anti-rotation
  'clean isometric alignment, both visible facades at equal symmetric angles, no rotation, ' +
  'axis-aligned, not tilted, straight isometric orientation';

// ── INDOOR-Pflichtsuffix: wortgleich aus regenerate-37-modules.ts ──
const INDOOR_SUFFIX =
  ', industrial module installed inside a factory hall, integral part of a larger factory floor, ' +
  'open cutaway view, no standalone building, no exterior walls or roof, ' +
  'exposed machinery section on a deck plate';

// ── Die Bühnen-Klausel: gilt fuer JEDEN Kandidaten, wortgleich ──
// Sie ist der eigentliche Auftrag: die Flaeche muss LEER und EINSEHBAR bleiben,
// weil Stufe 4 dort ein zweites Asset einsetzt.
const STAGE_CLAUSE =
  'the assembly area itself is COMPLETELY EMPTY, nothing is being built on it yet, ' +
  'bare clean deck plating with painted yellow boundary markings, ' +
  'the empty area is brightly and evenly lit from the upper left, fully visible, ' +
  'nothing overlaps or hides the empty area, no machine stands on it, ' +
  'all equipment is pushed to the edges of the bay, ' +
  'the empty deck area is generous and large enough for a big object, ' +
  'the empty floor runs along the isometric axis from the LOWER LEFT toward the UPPER RIGHT';

// ── Negativ-Basis (Familie) + Buehnen-Negative ──
const NEG_BASE =
  'cartoon, anime, fantasy, text, logos, watermark, background, scene, landscape, ' +
  'human figures, multiple separate objects, top-down view, front view, ' +
  'standalone building, roof, closed box';
const NEG_STAGE =
  'finished product on the platform, machine standing on the empty pad, ' +
  'cargo crates covering the floor, cluttered floor, workpiece in the middle, ' +
  'spaceship, vehicle, gun, engine nozzle, habitat pod, circuit board, ' +
  'dark unlit floor, floor in shadow, object blocking the assembly area';
const NEGATIVE = `${NEG_BASE}, ${NEG_STAGE}`;

/**
 * 12 Kandidaten. Variation ausschliesslich entlang der Montage-Achsen:
 *   pos   = Lage der freien Flaeche
 *   size  = wieviel Deck sie einnimmt
 *   frame = wieviel Rahmen/Geraet drumherum steht
 *   head  = Kopffreiheit (fuer hohe Objekte wie Wohnmodule)
 */
const CANDIDATES = {
  b1: {
    seed: 610101,
    axis: 'Bucht mittig, Portalkran darueber, Geraet nur an den Raendern',
    meta: { pos: 'mittig', size: 'gross', frame: 'mittel', head: 'hoch' },
    body:
      'an empty assembly bay of a factory floor, a wide open rectangular assembly pad of bare ' +
      'deck plating lies in the middle of the module, a tall navy-blue overhead gantry crane on ' +
      'two side rails spans across the empty pad with its hook hanging down empty, ' +
      'workbenches, tool cabinets and supply conduits line the left and right edges of the bay, ' +
      'yellow and black hazard striping frames the empty pad, ',
  },
  b2: {
    seed: 610247,
    axis: 'Bucht mittig, flacher Rahmen, steilerer Blick, sehr offen',
    meta: { pos: 'mittig', size: 'sehr gross', frame: 'niedrig', head: 'frei' },
    body:
      'an open empty assembly deck of a factory floor, almost the entire deck plate is a bare ' +
      'clean empty work surface with painted yellow outline markings, only low equipment stands ' +
      'around its edges, a low row of workbenches and a small control console at the back edge, ' +
      'two slim articulated robot arms folded back at the sides, ' +
      'a shallow low profile section with nothing tall in the middle, wide open headroom above, ',
  },
  b3: {
    seed: 610383,
    axis: 'Freiflaeche vorn LINKS, Maschinenblock hinten rechts',
    meta: { pos: 'links vorn', size: 'mittel', frame: 'hoch rechts', head: 'hoch' },
    body:
      'a factory assembly bay, the front left half of the deck plate is a completely bare empty ' +
      'assembly pad with yellow floor markings, a tall navy-blue machinery block with pipes, ' +
      'ducts and control panels stands at the back right corner, a jib crane arm reaches out ' +
      'from that block over the empty pad with an empty hook, ' +
      'tool chests and cable reels along the back edge, ',
  },
  b4: {
    seed: 610429,
    axis: 'Freiflaeche vorn RECHTS, Maschinenblock hinten links',
    meta: { pos: 'rechts vorn', size: 'mittel', frame: 'hoch links', head: 'hoch' },
    body:
      'a factory assembly bay, the front right half of the deck plate is a completely bare empty ' +
      'assembly pad with yellow floor markings, a tall navy-blue machinery wall with supply ' +
      'manifolds, valves and a stair runs along the back left corner, ' +
      'a swing crane arm reaches from it over the empty pad with an empty hook, ' +
      'workbenches and part racks pushed against the back left machinery, ',
  },
  b5: {
    seed: 610561,
    axis: 'maximale Freiflaeche, nur Umlaufgeraet am Rand (Nacktbuehne)',
    meta: { pos: 'mittig', size: 'maximal', frame: 'minimal', head: 'frei' },
    body:
      'a bare factory assembly deck, the deck plate is one single huge empty work surface with a ' +
      'painted yellow rectangle marking the work zone, only a thin perimeter of low equipment: ' +
      'a narrow line of floor sockets, power drops, hose reels and two small bollard lights at ' +
      'the corners, one slim control pedestal at the far corner, ' +
      'nothing at all in the middle of the deck, completely unobstructed, ',
  },
  b6: {
    seed: 610607,
    axis: 'abgesenkte Montagegrube mit Schienen — traegt lange, schwere Teile',
    meta: { pos: 'mittig, vertieft', size: 'gross, laenglich', frame: 'mittel', head: 'hoch' },
    body:
      'a factory assembly bay with a recessed assembly pit, a long rectangular sunken bay of ' +
      'bare deck plating is set into the middle of the deck plate with yellow edge striping and ' +
      'two heavy rails running along its floor, the empty pit is brightly lit from above, ' +
      'a low navy-blue service walkway with railings runs along both long sides of the pit, ' +
      'cable trays and hydraulic supply arms folded against the walkways, ' +
      'the empty pit runs diagonally from the lower left toward the upper right, ',
  },
  b7: {
    seed: 610743,
    axis: 'runder Drehteller mittig — jede Produktform passt drauf',
    meta: { pos: 'mittig, rund', size: 'gross', frame: 'mittel', head: 'hoch' },
    body:
      'a factory assembly bay built around a large empty circular turntable platform, ' +
      'the bare steel turntable is set flush into the middle of the deck plate with a painted ' +
      'yellow hazard ring around its rim and nothing standing on it, ' +
      'four slim navy-blue service columns with folded robotic arms surround the turntable, ' +
      'a ring of inspection lamps points down onto the empty platform, ' +
      'low tool cabinets and a control console at the outer edge of the deck, ',
  },
  b8: {
    seed: 610889,
    axis: 'lange Montagestrasse links unten -> rechts oben (fuer lange Teile)',
    meta: { pos: 'diagonale Bahn', size: 'lang', frame: 'niedrig', head: 'hoch' },
    body:
      'a factory assembly line section, a long straight empty roller conveyor bed of bare steel ' +
      'runs diagonally across the deck plate from the lower left to the upper right with nothing ' +
      'on it, painted yellow lane markings on the deck along both sides of the empty line, ' +
      'slim navy-blue working stations with tool arms flank the empty conveyor at intervals, ' +
      'a small overhead rail with an empty carrier follows the line, low silhouette, ',
  },
  b9: {
    seed: 610925,
    axis: 'hohes offenes Portal ueber leerer Flaeche — maximale Kopffreiheit',
    meta: { pos: 'mittig', size: 'gross', frame: 'hohes Portal', head: 'sehr hoch' },
    body:
      'a factory assembly bay framed by a tall open portal frame, two heavy navy-blue steel ' +
      'columns and a top cross beam stand around a large completely empty square of bare deck ' +
      'plating, the portal is open on all sides and encloses nothing, ' +
      'a chain hoist hangs empty from the cross beam, bright work lamps mounted on the beam ' +
      'point down onto the empty deck, small tool trolleys parked outside the portal legs, ' +
      'very generous headroom inside the portal, ',
  },
  b10: {
    seed: 611061,
    axis: 'zwei Roboterarme flankieren die Flaeche, naeherer Blick',
    meta: { pos: 'mittig', size: 'mittel', frame: 'mittel', head: 'mittel' },
    body:
      'a robotic assembly cell of a factory floor, a clean empty square work pad of bare deck ' +
      'plating in the middle, two large navy-blue articulated welding robot arms stand on ' +
      'pedestals on opposite sides of the empty pad, their tool heads lowered but touching ' +
      'nothing, a safety line of yellow and black striping painted around the empty pad, ' +
      'a supply cabinet and a coiled umbilical at the back edge, ',
  },
  b11: {
    seed: 611107,
    axis: 'Empore hinten, leere Flaeche vorn auf der unteren Ebene',
    meta: { pos: 'vorn, ganze Breite', size: 'gross', frame: 'Empore hinten', head: 'hoch' },
    body:
      'a two level factory assembly bay, a navy-blue mezzanine walkway with railings, pipes and ' +
      'control cabinets runs across the back of the module on stilts, ' +
      'the whole lower front deck below it is one wide bare empty assembly floor with painted ' +
      'yellow markings and nothing standing on it, a stair leads up to the mezzanine at the side, ' +
      'strip lights under the mezzanine light the empty floor evenly, ',
  },
  b12: {
    seed: 611243,
    axis: 'Eckraum wie electronics_factory: zwei Rueckwaende, leere Bodenmitte',
    meta: { pos: 'mittig im Eckraum', size: 'gross', frame: 'zwei Waende', head: 'mittel' },
    body:
      'a factory workshop corner section, two navy-blue interior bulkhead walls meet at the back ' +
      'corner with a yellow painted trim strip along their top edge, supply panels, valve racks ' +
      'and a wide shuttered hatch are mounted on the walls, ' +
      'the whole open floor in front of the walls is a bare empty assembly area of clean deck ' +
      'plating with yellow outline markings and nothing on it, ' +
      'a few low tool cabinets stand flat against the walls, open and unobstructed floor, ',
  },
  b13: {
    seed: 611389,
    axis: 'schwere Wiege/Bock mittig, oben offen — haelt flache UND klobige Teile',
    meta: { pos: 'mittig, erhoehte Wiege', size: 'mittel-gross', frame: 'niedrig', head: 'sehr hoch' },
    body:
      'a factory assembly bay with a large empty support cradle, a broad low navy-blue steel ' +
      'assembly trestle with a flat bare padded top stands in the middle of the deck plate and ' +
      'carries nothing, its wide flat empty top surface is fully open to the sky, ' +
      'yellow hazard striping on the trestle flanks, hydraulic jacks at its corners, ' +
      'a folded service arm and a lamp mast beside it, low equipment around the deck edges, ' +
      'the empty cradle top runs from the lower left to the upper right, ',
  },
  // b14 (seed 611425) lieferte ein VOLLFLAECHIGES Hallenbild ohne freistehendes
  // Objekt -> BiRefNet entfernte alles, Ergebnis war leer. Re-Roll mit neuem Seed
  // und ausdruecklicher Insel-Formulierung (das Deck ist eine freistehende Platte).
  b14: {
    seed: 612571,
    axis: 'Bucht zwischen zwei Maschinenreihen — Flaeche als Gasse (Re-Roll)',
    meta: { pos: 'mittlere Gasse', size: 'mittel, laenglich', frame: 'beidseitig hoch', head: 'hoch' },
    body:
      'a single small square factory deck plate floating alone on an empty background, ' +
      'two short rows of navy-blue machine cabinets and supply columns stand along its left and ' +
      'its right edge, between them a wide completely empty bare deck aisle runs diagonally from ' +
      'the lower left toward the upper right with yellow lane markings and nothing in it, ' +
      'overhead service arms and light strips reach inward over the empty aisle, ' +
      'the deck plate has clean straight cut edges and ends in empty space on all four sides, ',
  },
  // ── Nachschlag an der entscheidenden Achse (Lage + Groesse der Freiflaeche),
  // nachdem der Auftrag von drei auf SECHS Produktfamilien erweitert wurde:
  // die Flaeche muss auch einen Wohnmodul-Quader fassen.
  b15: {
    // Re-Roll: der erste Wurf (seed 612617) wurde von BiRefNet ausgehoehlt — die
    // leere Flaeche galt als Hintergrund, uebrig blieb nur der gelbe Rahmen.
    // Gegenmittel: solide Deckplatte mit sichtbarer Dicke, Fugen und Luken.
    // Versuch 3: Wurf 1 (612617) und 2 (613049) fuellten das Bild randlos aus —
    // BiRefNet fand kein freistehendes Objekt und entfernte alles. Wirksames
    // Gegenmittel war bei b14 die Insel-Formulierung; sie steht jetzt vorn.
    seed: 613185,
    axis: 'markiertes Abstellfeld + Portalkran darueber (b11-Markierung x b1-Kran)',
    meta: { pos: 'mittig-vorn, markiert', size: 'sehr gross', frame: 'Kran + Rueckwand', head: 'sehr hoch' },
    body:
      'a single small square factory deck plate floating alone on an empty background, ' +
      'the deck plate has clean straight cut edges and ends in empty space on all four sides, ' +
      'a factory assembly bay, a very large empty square drop zone is painted onto the bare deck ' +
      'plating with a thick yellow and black outline and nothing whatsoever inside it, ' +
      'a navy-blue overhead bridge crane runs high above on two side rails with an empty hook, ' +
      'a single low back wall with supply panels, valve racks and cable trays closes the far side, ' +
      'small tool cabinets and part trolleys stand outside the painted outline at the edges, ' +
      'the painted empty zone covers most of the deck and is brightly lit, very high clearance, ' +
      'the deck is one solid thick steel slab with a visible chunky rim and side edge, ' +
      'the floor shows riveted panel seams, floor hatches and grime so it never looks blank, ',
  },
  b16: {
    seed: 612753,
    axis: 'markiertes Abstellfeld, nur EINE Rueckwand, drei Seiten offen (max. Merge-Freiheit)',
    meta: { pos: 'mittig, drei Seiten offen', size: 'sehr gross', frame: 'minimal', head: 'frei' },
    body:
      'an open factory assembly platform, one low navy-blue equipment wall with conduits, gauges ' +
      'and a folded service arm stands only along the back edge of the deck plate, ' +
      'the remaining three sides are completely open with nothing on them, ' +
      'the whole floor is one large empty bare assembly area outlined with painted yellow corner ' +
      'markers, two slim lamp masts at the outer corners light it evenly, ' +
      'a shallow low section with no tall structure above the empty floor, ',
  },
};

// ── HTTP-Helfer (Konvention aus factory-split-generate.cjs) ──
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => {
        data += c;
      });
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
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const dl = (u) => {
      const mod = u.startsWith('https') ? https : http;
      mod
        .get(u, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            dl(res.headers.location);
            return;
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        })
        .on('error', reject);
    };
    dl(url);
  });
}

async function generateImage(prompt, negative, seed) {
  const submitRaw = await httpsRequest(
    {
      hostname: 'queue.fal.run',
      path: '/fal-ai/flux/dev',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
    },
    JSON.stringify({
      prompt,
      negative_prompt: negative,
      image_size: { width: 512, height: 512 },
      num_inference_steps: 28,
      guidance_scale: 7.5,
      num_images: 1,
      enable_safety_checker: false,
      output_format: 'png',
      seed,
    }),
  );
  const submit = JSON.parse(submitRaw);
  if (!submit.status_url) throw new Error(`Submit failed: ${submitRaw.slice(0, 300)}`);
  process.stdout.write('    waiting');
  for (let i = 0; i < 120; i++) {
    await sleep(2000);
    const status = JSON.parse(
      await httpsGet(submit.status_url, { Authorization: `Key ${FAL_API_KEY}` }),
    );
    if (status.status === 'COMPLETED') {
      const result = JSON.parse(
        await httpsGet(submit.response_url, { Authorization: `Key ${FAL_API_KEY}` }),
      );
      process.stdout.write(' done\n');
      return downloadBuffer(result.images[0].url);
    }
    if (status.status === 'FAILED')
      throw new Error(`Generation failed: ${JSON.stringify(status).slice(0, 300)}`);
    process.stdout.write('.');
  }
  throw new Error('Timeout waiting for generation');
}

async function uploadToFal(buffer, fileName) {
  const initRaw = await httpsRequest(
    {
      hostname: 'rest.alpha.fal.ai',
      path: '/storage/upload/initiate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
    },
    JSON.stringify({ content_type: 'image/png', file_name: fileName }),
  );
  const init = JSON.parse(initRaw);
  const u = new URL(init.upload_url);
  await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'PUT',
        headers: { 'Content-Type': 'image/png', 'Content-Length': buffer.length.toString() },
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve());
      },
    );
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
  return init.file_url;
}

async function removeBackground(imageUrl) {
  const raw = await httpsRequest(
    {
      hostname: 'fal.run',
      path: '/fal-ai/birefnet/v2',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
    },
    JSON.stringify({ image_url: imageUrl }),
  );
  const result = JSON.parse(raw);
  if (!result?.image?.url) throw new Error(`BG removal failed: ${raw.slice(0, 300)}`);
  return downloadBuffer(result.image.url);
}

/** Tight Crop, dann auf zentriertes 1:1-Quadrat padden. Kein Resize. */
async function cropAndSquare(noBgBuf, tag) {
  const cropped = await sharp(noBgBuf).trim().png().toBuffer();
  fs.writeFileSync(path.join(DIR_CROP, `factory_base_${tag}_cropped.png`), cropped);
  const meta = await sharp(cropped).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const size = Math.max(w, h);
  const padLeft = Math.floor((size - w) / 2);
  const padTop = Math.floor((size - h) / 2);
  const squared = await sharp(cropped)
    .extend({
      top: padTop,
      bottom: size - h - padTop,
      left: padLeft,
      right: size - w - padLeft,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  return { squared, cropW: w, cropH: h, size };
}

function promptFor(cfg) {
  return `${BASE_STYLE}, ${cfg.body}${STAGE_CLAUSE}${INDOOR_SUFFIX}`;
}

async function runOne(tag, cfg) {
  const prompt = promptFor(cfg);
  console.log(`\n[gen] factory_base ${tag} (seed ${cfg.seed}) — ${cfg.axis}`);
  const raw = await generateImage(prompt, NEGATIVE, cfg.seed);
  fs.writeFileSync(path.join(DIR_RAW, `factory_base_${tag}_raw.png`), raw);

  process.stdout.write('    bg removal');
  const falUrl = await uploadToFal(raw, `factory_base_${tag}.png`);
  const noBg = await removeBackground(falUrl);
  fs.writeFileSync(path.join(DIR_NOBG, `factory_base_${tag}_nobg.png`), noBg);
  console.log(' done');

  const { squared, cropW, cropH, size } = await cropAndSquare(noBg, tag);
  const outFile = path.join(DIR_ST, `factory_base_${tag}.png`);
  fs.writeFileSync(outFile, squared);
  console.log(`    crop ${cropW}x${cropH} -> square ${size}x${size}`);
  console.log(`    [save] ${path.relative(ROOT, outFile)}`);
  return { tag, seed: cfg.seed, axis: cfg.axis, meta: cfg.meta, size, cropW, cropH };
}

(async () => {
  for (const d of [DIR_RAW, DIR_NOBG, DIR_CROP, DIR_ST]) fs.mkdirSync(d, { recursive: true });
  const mode = (process.argv[2] || 'candidates').toLowerCase();

  if (mode === 'prompts') {
    const dump = {
      subject: 'FACTORY BASE (Stufe 1 der Basis+Montage-Pipeline)',
      model: 'fal-ai/flux/dev',
      imageSize: '512x512',
      steps: 28,
      guidanceScale: 7.5,
      baseStyle: BASE_STYLE,
      stageClause: STAGE_CLAUSE,
      indoorSuffix: INDOOR_SUFFIX,
      negative: NEGATIVE,
      candidates: Object.entries(CANDIDATES).map(([tag, cfg]) => ({
        tag,
        seed: cfg.seed,
        axis: cfg.axis,
        meta: cfg.meta,
        prompt: promptFor(cfg),
      })),
    };
    const out = path.join(DIR_ST, 'factory_base_prompts.json');
    fs.writeFileSync(out, JSON.stringify(dump, null, 2));
    console.log(`[save] ${path.relative(ROOT, out)}`);
    return;
  }

  const only = process.argv.slice(3);
  const results = [];
  for (const [tag, cfg] of Object.entries(CANDIDATES)) {
    if (only.length && !only.includes(tag)) continue;
    try {
      results.push(await runOne(tag, cfg));
    } catch (e) {
      console.error(`ERR ${tag}: ${e.message}`);
    }
  }
  const outJson = path.join(DIR_ST, 'factory_base_results.json');
  let merged = results;
  if (only.length && fs.existsSync(outJson)) {
    const prev = JSON.parse(fs.readFileSync(outJson, 'utf8')).results || [];
    const byTag = new Map(prev.map((r) => [r.tag, r]));
    for (const r of results) byTag.set(r.tag, r);
    merged = [...byTag.values()].sort((a, b) => a.tag.localeCompare(b.tag, 'en', { numeric: true }));
  }
  fs.writeFileSync(
    outJson,
    JSON.stringify(
      { baseStyle: BASE_STYLE, stageClause: STAGE_CLAUSE, indoorSuffix: INDOOR_SUFFIX, negative: NEGATIVE, results: merged },
      null,
      2,
    ),
  );
  console.log('\ndone');
})();
