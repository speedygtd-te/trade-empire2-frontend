/**
 * Asset-Pipeline: FACTORY split — HULL_FORGE / DRIVE_WORKS / ARMS_PLANT.
 *
 * Spec-Kommentar (Docs/openapi.yaml, ModuleType-Enum):
 *   "Spun out of FACTORY: HULL_FORGE hosts all HULL- and PLATFORM-recipes;
 *    DRIVE_WORKS hosts propulsion + SHIP_YARD recipes; ARMS_PLANT hosts
 *    weapon/armor/sensor recipes. Placed like FACTORY (ALL_STRUCTURES, INDOOR)."
 *
 * Familie = FACTORY / ELECTRONICS_FACTORY / HOUSING_FACTORY. Style-Anker und
 * INDOOR_SUFFIX sind WORTGLEICH aus scripts/regenerate-37-modules.ts bzw.
 * regenerate-17-modules.ts uebernommen (dort entstanden electronics_factory und
 * housing_factory). Anti-Crop-/Anti-Rotations-Klauseln aus dem juengsten
 * erfolgreichen Lauf scripts/refit-dock-generate.cjs.
 *
 * INDOOR => KEINE _lit-Fassung. Im Bestand hat kein einziges INDOOR-Modul eine
 * _lit-Variante (alle 21 *_lit unter src/assets/modules/ sind Aussenmodule:
 * solar_panel, wind_turbine, dock_large, pump, telescope_module, ...).
 *
 * Unterscheidbarkeit bei 48 px ist das eigentliche Ziel dieser Runde. Deshalb
 * traegt jeder der drei eine eigene Silhouette UND einen eigenen Farbakzent:
 *   HULL_FORGE  hoch + massiv, kalte Stahlplatten, keine Glut  -> dunkle Masse
 *   DRIVE_WORKS niedrig + breit, glueh-orange Duesenmuendung   -> Orange
 *   ARMS_PLANT  kompakt, senkrechte duenne Laeufe + helle Kuppel -> Weiss/Rods
 *
 * Pipeline (CLAUDE.md Phase 2b, Schritte 2-5):
 *   flux/dev @512x512 PNG -> birefnet/v2 BG-Removal -> sharp trim (tight crop)
 *   -> auf zentriertes 1:1-Quadrat padden (KEIN Resize; Familie ist 479-512 px)
 *
 * Schreibt NUR nach assets/. Nichts unter src/. Kein cap sync, kein commit.
 * fal-Key aus scripts/.env (FAL_API_KEY) — nie hardcoden.
 *
 * Usage:
 *   node scripts/factory-split-generate.cjs prompts
 *   node scripts/factory-split-generate.cjs candidates            # alle
 *   node scripts/factory-split-generate.cjs candidates hull_forge # nur einer
 *   node scripts/factory-split-generate.cjs final hull_forge c2   # -> assets/final
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
const DIR_FINAL = path.join(ROOT, 'assets', 'final');
const DIR_ST = path.join(ROOT, 'assets', 'style-test', 'modules');

// ── Style-Anker: wortgleich aus regenerate-37-modules.ts (Familien-Quelle) ──
const BASE_STYLE =
  'isometric game asset, isometric 2.5D perspective, 30 degree camera angle from horizontal, ' +
  '2:1 isometric perspective, The Expanse hard sci-fi aesthetic, ' +
  'navy-blue painted steel with yellow safety stripes, weathered metal surfaces, ' +
  'photorealistic textures, scratched paint, grime and oil residue, ' +
  'lit from upper left, soft top-left key light, no background, isolated object, ' +
  'game sprite, centered, single object, no ground plane, no shadow, ' +
  // anti-crop (aus refit-dock-generate.cjs)
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

// ── Negativ-Basis (Familie) ──
const NEG_BASE =
  'cartoon, anime, fantasy, text, logos, watermark, background, scene, landscape, ' +
  'human figures, multiple separate objects, top-down view, front view, ' +
  'standalone building, roof, closed box';

// Abgrenzung: jeder verneint ausdruecklich die beiden Geschwister UND die
// bestehenden Fabriken. Lehre aus dem Refit-Dock (erster Wurf = zweites dock_large).
const NEG_SIBLINGS = {
  hull_forge:
    'no rocket engines, no thruster nozzles, no bell nozzles, no exhaust flames, ' +
    'no gun barrels, no cannons, no missiles, no sensor domes, ' +
    'no circuit boards, no electronics, no living pods, no habitat cubes',
  drive_works:
    'no gun barrels, no cannons, no missiles, no artillery, no sensor domes, ' +
    'no flat steel plate stacks, no forging press, no circuit boards, no electronics, ' +
    'no living pods, no habitat cubes, no spaceship hull',
  arms_plant:
    'no rocket engines, no thruster nozzles, no bell nozzles, no exhaust flames, ' +
    'no forging press, no flat steel plate stacks, no circuit boards, no electronics, ' +
    'no living pods, no habitat cubes, no spaceship hull, ' +
    // Runde 2: die Hull-Forge-Lesart ausdruecklich verneinen
    'no forging press frame, no gantry tower, no large blue wall, no tall machine block',
};

// ── Ausrichtungs-Konvention: gerichtete Objekte laufen links unten -> rechts oben ──
const ORI = {
  hull_forge:
    'the roller bed and the row of steel hull plates run diagonally from the LOWER LEFT of the ' +
    'image toward the UPPER RIGHT, the plates travel toward the upper right',
  drive_works:
    'the engine lies on the LOWER-LEFT to UPPER-RIGHT diagonal, its wide glowing bell nozzle at ' +
    'the LOWER LEFT end, its narrow injector head and turbopump at the UPPER RIGHT end',
  arms_plant:
    'the long barrel clamped in the boring lathe runs diagonally from the LOWER LEFT toward the ' +
    'UPPER RIGHT, its muzzle pointing to the upper right',
};

const ASSETS = {
  hull_forge: {
    neg: NEG_SIBLINGS.hull_forge,
    candidates: {
      c1: {
        seed: 510101,
        note: 'grosse Presse hinten + Rollenbahn mit flachen Platten',
        body:
          'hull forge module, the heavy plate shop of a shipyard, a massive tall hydraulic forging ' +
          'press with four thick columns and a heavy crosshead dominates the back of the bay, ' +
          'a long roller bed feeds huge flat steel hull plates into the press, ' +
          'a low stack of finished curved hull plates lies flat on the deck beside it, ' +
          'a heavy overhead bridge crane on side rails carries one large plate, ' +
          'cold grey unpainted steel plates against navy-blue machine frames, ' +
          'the heaviest and bulkiest machinery of the whole factory, ' +
          `${ORI.hull_forge}`,
      },
      c2: {
        seed: 510237,
        note: 'Presse + Plattenbieger + aufrecht gestapelte Rohplatten',
        body:
          'hull forge module, a heavy structural plate forge, one enormous navy-blue hydraulic press ' +
          'tower stands tall in the middle of the bay with a glowing hot steel plate under its ram, ' +
          'a three-roll plate bending machine curves a second plate next to it, ' +
          'tall raw steel plates stand on edge in a storage rack at the side, ' +
          'finished curved hull segments and flat platform decks stacked low on the deck plate, ' +
          'thick hydraulic cylinders and yellow hazard striping, very tall and massive silhouette, ' +
          `${ORI.hull_forge}`,
      },
      c3: {
        seed: 510383,
        note: 'Portalpresse + Rahmenbau, komplett kalt',
        body:
          'hull forge module, a structural frame and hull plate shop, a huge navy-blue gantry press ' +
          'straddles the deck and presses a broad steel sheet, a welded steel bulkhead frame stands ' +
          'upright in a jig behind it, stacks of flat grey hull plates and platform deck sections ' +
          'lie on the floor, heavy clamps, rollers and a plate trolley, ' +
          'cold heavy steelwork, no heat glow anywhere, tall press tower silhouette, ' +
          `${ORI.hull_forge}`,
      },
    },
  },
  drive_works: {
    neg: NEG_SIBLINGS.drive_works,
    candidates: {
      c1: {
        seed: 520104,
        note: 'horizontaler Pruefstand, Duesenglut, Ablenkkegel',
        body:
          'drive works module, a rocket engine assembly and test bay, one large spaceship thruster ' +
          'lies horizontally on a low navy-blue cradle, its wide bell nozzle glowing hot orange, ' +
          'a heavy armored blast deflector and a thick exhaust duct behind the nozzle, ' +
          'turbopumps, combustion chambers and coiled fuel lines laid out on the deck, ' +
          'a spare bell nozzle standing on a rack, orange heat glow and faint exhaust haze, ' +
          'low and wide silhouette, warm orange light spilling over the navy-blue steel, ' +
          `${ORI.drive_works}`,
      },
      c2: {
        seed: 520246,
        note: 'zwei Triebwerke auf Staendern, Brennkammer-Montage',
        body:
          'drive works module, an engine works building spaceship thrusters, two fusion drive engines ' +
          'rest on navy-blue assembly stands, the nearer one open with its combustion chamber and ' +
          'injector plate exposed, its large bell nozzle glowing hot orange at the lower left, ' +
          'an overhead hoist lowers a turbopump into the second engine, ' +
          'racks of nozzle cones, cryogenic feed lines and pressure tanks along the side, ' +
          'orange heat glow from the nozzle throat, low wide horizontal silhouette, ' +
          `${ORI.drive_works}`,
      },
      c3: {
        seed: 520391,
        note: 'Pruefstand mit Flammenkanal, kraeftigster Glut-Akzent',
        body:
          'drive works module, a thruster test stand section, a single big rocket engine is clamped ' +
          'horizontally in a heavy navy-blue test cradle and fires into an armored flame trench, ' +
          'the bell nozzle and the trench mouth glow bright orange, hot exhaust haze rises, ' +
          'cooling water pipes, propellant lines and instrument booms surround the cradle, ' +
          'a second bare combustion chamber waits on a trolley, ' +
          'wide low silhouette dominated by the glowing nozzle, ' +
          `${ORI.drive_works}`,
      },
    },
  },
  arms_plant: {
    neg: NEG_SIBLINGS.arms_plant,
    candidates: {
      c1: {
        seed: 530107,
        note: 'Laufrack senkrecht + Bohrbank + helle Sensorkuppel',
        body:
          'arms plant module, a compact precision weapons workshop, a rack of long dark gun barrels ' +
          'stands upright in a tight row like organ pipes, a horizontal boring lathe machines one ' +
          'long barrel on the deck, thick angular armor plates lean stacked against the machine ' +
          'frame, a pale white sensor dome sits finished on a low calibration stand, ' +
          'bright white work lamps on an inspection gantry, small ammunition crates, ' +
          'compact tidy precise machinery, much smaller and lower than a heavy forge, ' +
          `${ORI.arms_plant}`,
      },
      c2: {
        seed: 530259,
        note: 'Panzerplatten-Wand + Laufrack + zwei Kuppeln',
        body:
          'arms plant module, a weapons and armor shop, thick angular composite armor plates stand ' +
          'upright in a row along the back like a wall of slabs, a vertical rack of slender dark gun ' +
          'barrels stands beside them, two pale white sensor domes rest on calibration cradles at the ' +
          'front, a precision lathe works a barrel on the deck plate, ' +
          'tool cabinets, gauges and small ammunition crates, clean and precise workshop, ' +
          'compact low silhouette with thin vertical barrels and round white domes, ' +
          `${ORI.arms_plant}`,
      },
      // ── Runde 2: c1-c3 kollidierten bei 48 px mit hull_forge (beide "blauer
      // Rahmen + helles Metall auf dem Deck"). Runde 2 erzwingt eine STACHELIGE
      // Silhouette (viele duenne Laeufe schraeg nach oben) plus eine helle runde
      // Kuppel — Formen, die sonst kein Modul der Familie hat — und verneint
      // ausdruecklich die Presse-/Plattenrahmen-Lesart des Hull Forge.
      c4: {
        seed: 540118,
        note: 'R2 — Faecher langer Laeufe schraeg nach oben + weisse Kuppel',
        body:
          'arms plant module, a low compact weapons workshop, a tall open rack holds a fan of MANY ' +
          'long slender dark gun barrels that stick out and upward at spread angles like a bundle of ' +
          'spears, a second bundle of finished barrels lies angled on a trolley, ' +
          'a large pale white hemispherical sensor dome sits on a low calibration cradle in front, ' +
          'a small precision boring lathe machines one barrel on the deck, ' +
          'small ammunition crates and tool chests, everything low and compact, ' +
          'spiky bristling silhouette of thin angled barrels above a low deck, no tall solid machine, ' +
          `${ORI.arms_plant}`,
      },
      c5: {
        seed: 540263,
        note: 'R2 — Zwillingsgeschuetz mit langen Laeufen schraeg nach oben + 2 Kuppeln',
        body:
          'arms plant module, a turret and sensor shop, a finished twin cannon turret stands on a low ' +
          'rotating test mount with its two very long slender barrels raised at a steep upward angle ' +
          'into the air, a rack of spare thin barrels stands bristling beside it, ' +
          'two pale white hemispherical sensor domes rest on small cradles at the front of the deck, ' +
          'a calibration bench with gauges, small ammunition crates, ' +
          'low compact deck with thin barrels reaching up and out, no massive machine block, ' +
          `${ORI.arms_plant}`,
      },
      c6: {
        seed: 540407,
        note: 'R2 — Laufbuendel + Panzerplatten-Palette + grosse helle Kuppel',
        body:
          'arms plant module, a compact arms and armor shop, a bundle of long slender dark gun ' +
          'barrels is stacked in an open A-frame rack with the muzzles fanning out and upward, ' +
          'a big pale white sensor dome on a wheeled cradle dominates the front of the deck, ' +
          'a low pallet of thick angular armor tiles beside it, a fine precision lathe working a ' +
          'barrel, bright focused white work lamps on slim stands, ' +
          'small, low and precise, bristling thin barrels and one big round white dome, ' +
          'no press frame, no gantry tower, no large flat steel plates, ' +
          `${ORI.arms_plant}`,
      },
      // ── Runde 3 (letzter Versuch): c5 hatte die richtige Silhouette (langes
      // Zwillingsgeschuetz = unverwechselbar), zeigte die Muendungen aber nach
      // LINKS UNTEN — gegen die Projektkonvention. Spiegeln ist verboten (kippt
      // das Licht), also wird die Richtung im Prompt erzwungen. Zusaetzlich mehr
      // Werkstatt-Kontext, damit es eine FABRIK bleibt und nicht als fertiges
      // Geschuetzmodul (autocannon / heavy_cannon) gelesen wird.
      c7: {
        seed: 550129,
        note: 'R3 — Zwillingslauf-Geschuetz halb montiert, Muendungen rechts oben',
        body:
          'arms plant module, a weapon assembly bay, a half assembled twin cannon turret sits on a ' +
          'low navy-blue assembly cradle in the middle of the deck, its two very long slender barrels ' +
          'raised and aiming AWAY from the viewer toward the UPPER RIGHT corner of the image, ' +
          'the turret housing is still open with cabling and a hoist hook above it, ' +
          'a rack of spare thin barrels and a pallet of angular armor tiles stand at the side, ' +
          'a pale white sensor dome waits on a small calibration cradle at the front, ' +
          'tool benches, gauges and ammunition crates around the cradle, ' +
          'long thin barrels reaching up to the upper right, low compact deck, ' +
          'the muzzles point to the upper right, never to the lower left',
      },
      c8: {
        seed: 550274,
        note: 'R3 — Laufbohrbank + Geschuetz auf Montagebock, alles nach rechts oben',
        body:
          'arms plant module, a gun barrel shop, a long slender cannon barrel is clamped in a ' +
          'precision boring lathe on the deck with its muzzle pointing toward the UPPER RIGHT, ' +
          'behind it a single long barrel weapon on an assembly trestle also aims toward the ' +
          'UPPER RIGHT, a bundle of spare barrels leans in an open rack angled to the upper right, ' +
          'a pale white sensor dome on a low cradle and a pallet of thick angular armor tiles ' +
          'at the front of the deck, calibration bench, gauges, small ammunition crates, ' +
          'low compact precise workshop, all long thin barrels aligned lower-left to upper-right, ' +
          'the muzzles point to the upper right, never to the lower left',
      },
      c9: {
        seed: 550418,
        note: 'R3 — Geschuetzturm + Panzerplatten-Wand + zwei Kuppeln, Muendungen rechts oben',
        body:
          'arms plant module, an arms and armor workshop, a compact turret with two long slender ' +
          'barrels stands on a rotating test mount, the barrels raised and aiming toward the ' +
          'UPPER RIGHT corner of the image away from the viewer, ' +
          'a row of thick angular armor tiles stacked on a low pallet beside it, ' +
          'two pale white hemispherical sensor domes on small cradles at the front of the deck, ' +
          'an open rack of spare thin barrels tilted to the upper right, a precision lathe, ' +
          'bright white work lamps on slim stands, low compact deck, ' +
          'the muzzles point to the upper right, never to the lower left',
      },
      // ── Runde 4 (Diagnose vor dem Wurf): c5 war bei 48 px mit Abstand am
      // besten lesbar — kollidiert aber mit dem BESTEHENDEN Modul `autocannon`
      // (src/assets/modules/autocannon: Zwillingsgeschuetz auf Platte). Ein
      // montiertes Geschuetz ist als WAFFENFABRIK also verbrannt. Alle uebrigen
      // Werkstatt-Lesarten (c1/c2/c6/c8) verschwammen bei 48 px entweder mit
      // hull_forge (blauer Rahmen + helles Metall) oder mit electronics_factory
      // (blaue Eckkammer). Runde 4 traegt den Unterschied deshalb ueber eine
      // FORM, die kein anderes Modul der Familie hat: mehrere grosse, helle,
      // RUNDE Sensorkuppeln vorn auf dem Deck, dahinter eine dichte Reihe
      // senkrechter duenner Laeufe. Rund+hell gegen Turm (hull_forge) und gegen
      // Orange (drive_works).
      c10: {
        seed: 560131,
        note: 'R4 — drei grosse weisse Kuppeln vorn + dichtes senkrechtes Laufregal',
        body:
          'arms plant module, a weapons and sensor workshop, THREE large pale white hemispherical ' +
          'sensor domes of different sizes stand in a row on low navy-blue calibration cradles across ' +
          'the front of the deck, behind them an open steel rack holds a dense row of long slender ' +
          'dark gun barrels standing upright side by side like organ pipes, ' +
          'a low pallet of thick angular armor tiles at the side, a small precision lathe on a bench, ' +
          'only parts, racks and workbenches, nothing is assembled into a finished weapon, ' +
          'big round white domes against thin dark vertical barrels, low compact deck, ' +
          `${ORI.arms_plant}`,
      },
      c11: {
        seed: 560276,
        note: 'R4 — eine sehr grosse weisse Kuppel + Laufregal + Panzerplattenstapel',
        body:
          'arms plant module, a sensor and gun barrel shop, one very large pale white hemispherical ' +
          'sensor dome dominates the front half of the deck on a navy-blue calibration ring, ' +
          'a second smaller white dome sits beside it, an open rack of long slender dark gun barrels ' +
          'stands upright behind them, a neat stack of thick angular armor tiles on a pallet, ' +
          'a precision boring lathe with a barrel clamped in it on the deck, gauges and tool chests, ' +
          'parts and workbenches only, no finished weapon, no gun mount, ' +
          'one big bright round dome is the dominant shape, low compact deck, ' +
          `${ORI.arms_plant}`,
      },
      c12: {
        seed: 560419,
        note: 'R4 — Kuppelreihe + schraege Laufbuendel, ganz ohne Geschuetz',
        body:
          'arms plant module, an armaments parts shop, a row of four pale white hemispherical sensor ' +
          'domes of decreasing size stands on low cradles along the front edge of the deck, ' +
          'two open A-frame racks behind them hold bundles of long slender dark gun barrels leaning ' +
          'at a shallow angle, thick angular armor tiles stacked flat on pallets between the racks, ' +
          'a precision lathe and a calibration bench with gauges at the side, ' +
          'strictly a parts workshop, no assembled cannon, no turret, no gun mount anywhere, ' +
          'bright round white domes in front of thin dark barrels, low and compact, ' +
          `${ORI.arms_plant}`,
      },
      c3: {
        seed: 530404,
        note: 'Geschuetzturm-Montage + Laeufe + Kuppel',
        body:
          'arms plant module, a turret assembly shop, a compact weapon turret with two slender long ' +
          'barrels sits half assembled on a rotating test mount, a rack of spare dark barrels stands ' +
          'upright behind it, angular armor plates stacked flat on a pallet, a pale white sensor dome ' +
          'on a small stand at the front, a fine precision lathe and calibration bench at the side, ' +
          'bright focused work lighting, compact precise and low, the smallest of the factory bays, ' +
          `${ORI.arms_plant}`,
      },
    },
  },
};

// ── HTTP-Helfer (Konvention aus refit-dock-generate.cjs) ──
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
  return httpsRequest({
    hostname: u.hostname,
    path: u.pathname + u.search,
    method: 'GET',
    headers,
  });
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
async function cropAndSquare(noBgBuf, name, tag) {
  const cropped = await sharp(noBgBuf).trim().png().toBuffer();
  fs.writeFileSync(path.join(DIR_CROP, `module_${name}_${tag}_cropped.png`), cropped);
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

async function runOne(name, tag, cfg, neg, outFile) {
  const prompt = `${BASE_STYLE}, ${cfg.body}${INDOOR_SUFFIX}`;
  const negative = `${NEG_BASE}, ${neg}`;
  console.log(`\n[gen] ${name} ${tag} (seed ${cfg.seed}) — ${cfg.note}`);
  const raw = await generateImage(prompt, negative, cfg.seed);
  fs.writeFileSync(path.join(DIR_RAW, `module_${name}_${tag}_raw.png`), raw);

  process.stdout.write('    bg removal');
  const falUrl = await uploadToFal(raw, `module_${name}_${tag}.png`);
  const noBg = await removeBackground(falUrl);
  fs.writeFileSync(path.join(DIR_NOBG, `module_${name}_${tag}_nobg.png`), noBg);
  console.log(' done');

  const { squared, cropW, cropH, size } = await cropAndSquare(noBg, name, tag);
  fs.writeFileSync(outFile, squared);
  console.log(`    crop ${cropW}x${cropH} -> square ${size}x${size}`);
  console.log(`    [save] ${path.relative(ROOT, outFile)}`);
  return { name, tag, seed: cfg.seed, size, cropW, cropH, prompt, negative };
}

(async () => {
  for (const d of [DIR_RAW, DIR_NOBG, DIR_CROP, DIR_FINAL, DIR_ST])
    fs.mkdirSync(d, { recursive: true });
  const mode = (process.argv[2] || 'candidates').toLowerCase();
  const results = [];

  if (mode === 'prompts') {
    const dump = {
      module: 'FACTORY split (HULL_FORGE / DRIVE_WORKS / ARMS_PLANT)',
      model: 'fal-ai/flux/dev',
      imageSize: '512x512',
      steps: 28,
      guidanceScale: 7.5,
      baseStyle: BASE_STYLE,
      indoorSuffix: INDOOR_SUFFIX,
      negativeBase: NEG_BASE,
      picks: { hull_forge: 'c1', drive_works: 'c3', arms_plant: 'c10' },
      assets: {},
    };
    for (const [name, def] of Object.entries(ASSETS)) {
      dump.assets[name] = {
        negative: `${NEG_BASE}, ${def.neg}`,
        orientation: ORI[name],
        candidates: Object.entries(def.candidates).map(([tag, cfg]) => ({
          tag,
          seed: cfg.seed,
          note: cfg.note,
          prompt: `${BASE_STYLE}, ${cfg.body}${INDOOR_SUFFIX}`,
        })),
      };
    }
    const out = path.join(DIR_ST, 'factory_split_prompts.json');
    fs.writeFileSync(out, JSON.stringify(dump, null, 2));
    console.log(`[save] ${path.relative(ROOT, out)}`);
    return;
  }

  if (mode === 'candidates') {
    const onlyName = process.argv[3];
    const onlyTag = process.argv[4];
    for (const [name, def] of Object.entries(ASSETS)) {
      if (onlyName && onlyName !== name) continue;
      for (const [tag, cfg] of Object.entries(def.candidates)) {
        if (onlyTag && onlyTag !== tag) continue;
        try {
          results.push(
            await runOne(name, tag, cfg, def.neg, path.join(DIR_ST, `${name}_${tag}.png`)),
          );
        } catch (e) {
          console.error(`ERR ${name} ${tag}: ${e.message}`);
        }
      }
    }
  } else if (mode === 'promote') {
    // Gewaehlten Kandidaten aus style-test nach assets/final uebernehmen.
    // runOne() schreibt in beide Modi exakt denselben Puffer (tight crop, auf
    // 1:1 gepaddet, kein Resize) — Kopieren ist also bit-identisch zum
    // Neu-Generieren, spart aber einen weiteren Generator-Lauf und schliesst
    // jede Seed-Drift aus.
    const PICKS = { hull_forge: 'c1', drive_works: 'c3', arms_plant: 'c10' };
    for (const [name, tag] of Object.entries(PICKS)) {
      const src = path.join(DIR_ST, `${name}_${tag}.png`);
      const dst = path.join(DIR_FINAL, `${name}_0.png`);
      fs.copyFileSync(src, dst);
      const m = await sharp(dst).metadata();
      console.log(`[promote] ${name}_${tag} -> assets/final/${name}_0.png  ${m.width}x${m.height}`);
    }
    return;
  } else if (mode === 'final') {
    const name = process.argv[3];
    const tag = process.argv[4];
    const def = ASSETS[name];
    if (!def) {
      console.error(`Unknown asset "${name}" (${Object.keys(ASSETS).join(', ')})`);
      process.exit(1);
    }
    const cfg = def.candidates[tag];
    if (!cfg) {
      console.error(`Unknown candidate "${tag}" (${Object.keys(def.candidates).join(', ')})`);
      process.exit(1);
    }
    // gleicher Seed + gleicher Prompt => deterministisch dasselbe Bild
    results.push(await runOne(name, tag, cfg, def.neg, path.join(DIR_FINAL, `${name}_0.png`)));
  } else {
    console.error('mode must be "prompts", "candidates" or "final"');
    process.exit(1);
  }

  fs.writeFileSync(
    path.join(DIR_ST, 'factory_split_results.json'),
    JSON.stringify({ baseStyle: BASE_STYLE, indoorSuffix: INDOOR_SUFFIX, results }, null, 2),
  );
  console.log('\ndone');
})();
