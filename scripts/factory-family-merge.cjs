/**
 * Asset-Pipeline: die restlichen FUENF Fabriken nach dem abgenommenen Piloten-
 * Verfahren (scripts/factory-electronics-merge.cjs).
 *
 *   Basis  : assets/style-test/modules/factory_base_b1.png  (Rudis Hero-Wahl)
 *   Merge  : fal-ai/flux-pro/kontext/max/multi, EIN Schritt, 3-4 Eingangsbilder
 *   BG     : fal-ai/birefnet/v2, danach tight crop + 1:1 padding, KEIN resize
 *
 * Unterschied zum Piloten — bewusst, je Fabrik geprueft:
 *   Die Montagestrasse b8 (Rollenbahn) traegt Roboter und Platinen. Eine
 *   Huellenplatte gehoert auf Boecke, ein Triebwerk in eine Wiege, eine Rakete
 *   auf einen flachen Wagen, Kabinenzellen in ein Stapelgeruest. Deshalb hat
 *   JEDE Fabrik ihre eigene Fertigungsvorrichtung (useLine=false => b8 raus,
 *   Vorrichtung steht im Prompt). Das ist zugleich das, was die sechs Buchten
 *   bei 48 px auseinanderhaelt — sechsmal dieselbe gelbe Rollenbahn waere ein
 *   Rueckschritt.
 *
 * Zwei Gleise (Frage aus dem Piloten: ueberlebt "in construction" den Merge?):
 *   track "raw" — Original-Assets direkt in den Merge, "clearly unfinished"
 *                 nur im Merge-Prompt.                       (1 fal-Call/Seed)
 *   track "wip" — Produkte vorher per kontext in "half finished" gewandelt
 *                 (mit Identitaets-Anker), dann Merge.  (+2 Calls einmalig)
 *
 * Usage:
 *   node scripts/factory-family-merge.cjs wip   <factory>
 *   node scripts/factory-family-merge.cjs merge <factory> <raw|wip> <n> [n...]
 *   node scripts/factory-family-merge.cjs measure <png...>
 *   node scripts/factory-family-merge.cjs promote <factory> <track> <n>
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');

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
const DIR_FINAL = path.join(ROOT, 'assets', 'final');
const SRC = path.join(ROOT, 'src', 'assets');

const BASE_B1 = path.join(DIR_ST, 'factory_base_b1.png');
const BASE_B8 = path.join(DIR_ST, 'factory_base_b8.png');

// -- Stil- und Rahmenklauseln: WORTGLEICH aus dem abgenommenen Piloten -------
const SCENE =
  'Image 1 is the scene and must be preserved: keep its factory bay, its back walls with the ' +
  'roller doors, its overhead gantry crane, its yellow and black hazard striped rim, its deck ' +
  'plate, its camera angle and its lighting exactly as they are and do not redraw them. ';
const STYLE =
  'Everything keeps the same isometric 2.5D perspective, 2:1 isometric, 30 degree camera angle, ' +
  'lit from the upper left, The Expanse hard sci-fi aesthetic, navy blue painted steel with ' +
  'yellow safety stripes, weathered metal, photorealistic textures. ';
const NOBG =
  'No background, isolated object on a plain empty background, no ground plane, no shadow, ' +
  'the whole factory module fully inside the frame with a generous empty margin, ' +
  'nothing cropped at the image borders, clean isometric alignment, not tilted, no rotation.';
// Variante "margin" — arms_plant-Iteration 2026-09-15: a2 aus dem a-Lauf hatte den Kran am
// oberen und linken Bildrand abgeschnitten (schon im generierten 1024x1024, nicht erst beim
// Crop verloren). Adressiert gezielt den Kran statt die Marge nur generisch zu wiederholen.
const NOBG_MARGIN =
  NOBG +
  ' The overhead gantry crane at the back is the tallest part of the scene: leave a clearly ' +
  'visible empty margin above its topmost beam and to the left of its outer support column so ' +
  'that no part of the crane, its cable or its hook touches the top edge or the left edge of ' +
  'the frame.';

// -- Die fuenf Fabriken -----------------------------------------------------
// products[].file   = vorhandenes Asset aus src/assets (nur gelesen)
// products[].aspect = gemessenes bbox-Seitenverhaeltnis (Breite/Hoehe)
const FACTORIES = {
  drive_works: {
    seedBase: 910000,
    useLine: false, // Triebwerke liegen in Wiegen, nicht auf einer Rollenbahn
    products: [
      {
        key: 'chemical_thruster',
        file: path.join(SRC, 'modules', 'chemical_thruster', 'chemical_thruster_0.webp'),
        aspect: 1.06,
        phrase: 'the short stubby rocket engine with the wide bell nozzle and the yellow collar ring',
        wipKeep:
          'KEEP THE IDENTITY of this machine exactly: it is a short stubby rocket engine with ONE ' +
          'wide round bell nozzle at the front and a yellow collar ring around its body. The wide ' +
          'bell mouth and the short stubby proportions must stay exactly as they are. ',
        wipMissing:
          'half of its outer casing panels are NOT mounted yet so the inner turbopump, the coolant ' +
          'pipes and a thick cable loom are wide open and clearly visible, ',
      },
      {
        key: 'fusion_drive',
        file: path.join(SRC, 'modules', 'fusion_drive', 'fusion_drive_0.webp'),
        aspect: 1.4,
        phrase: 'the long slim cylindrical fusion drive',
        wipKeep:
          'KEEP THE IDENTITY of this machine exactly: it is a LONG SLIM cylindrical fusion drive, ' +
          'a straight tube with ring segments and a nozzle at one end. The long slim tube shape ' +
          'must stay exactly as it is. ',
        wipMissing:
          'several ring segments of its outer shell are NOT mounted yet so the inner coils, ' +
          'feed lines and a thick cable loom are wide open and clearly visible, ',
      },
    ],
    fixture:
      'Place two long low engine cradles with curved steel saddles on the empty deck of image 1, ' +
      'standing one behind the other along the isometric axis from the lower left toward the ' +
      'upper right, fitted inside the bay and not sticking out over its rim. ',
    work:
      'TWO half-finished rocket engines rest IN those cradles as the workpieces being built: ' +
      '{P1} lies in the cradle nearer to the lower left with its nozzle mouth turned toward the ' +
      'viewer; {P2} lies in the cradle behind it toward the upper right. Both are SMALL, each ' +
      'only about one third of the height of the gantry crane, both clearly unfinished: outer ' +
      'casing panels missing so the inner turbopumps, coolant pipes and bright orange cable looms ' +
      'are exposed, patches of bare grey primer. Both engines are cold and dead, NO exhaust flame, ' +
      'NO glowing nozzle, nothing is firing. ',
    density:
      'Fill the free deck beside the cradles with drive works equipment so the bay is busy: ' +
      'spare bell nozzles and ring segments stacked in racks, coiled coolant pipes, rows of ' +
      'pressure gas bottles, a chain hoist with a lifting sling, tool trolleys and stacked crates ' +
      'along both long edges of the deck. ',
  },

  hull_forge: {
    seedBase: 920000,
    useLine: false, // Platten liegen auf Boecken, der Wuerfel steht in der Wendevorrichtung
    products: [
      {
        key: 'platform_outdoor',
        file: path.join(SRC, 'hulls', 'platform_outdoor', 'platform_outdoor_0.webp'),
        aspect: 1.54,
        phrase: 'the large flat open deck platform section',
        wipKeep:
          'KEEP THE IDENTITY of this part exactly: it is a large FLAT open deck platform section, ' +
          'a wide low square steel deck with a railing, no roof and no walls. The flat wide low ' +
          'shape must stay exactly as it is. ',
        wipMissing:
          'its seams are not welded shut yet, one corner of the railing is missing and lies ' +
          'beside it, ',
      },
      {
        key: 'reinforced_hull',
        file: path.join(SRC, 'hulls', 'reinforced', 'reinforced_0.webp'),
        aspect: 1.01,
        phrase: 'the boxy armored hull cube segment',
        wipKeep:
          'KEEP THE IDENTITY of this part exactly: it is a BOXY CUBE shaped armored hull segment ' +
          'with heavy plated walls and a hatch. The cubic boxy shape must stay exactly as it is. ',
        wipMissing:
          'one of its wall plates is not mounted yet and leans against it so the bare inner ribs ' +
          'and frame are visible, ',
      },
    ],
    fixture:
      'Place a row of heavy steel welding trestles and one large rotating welding jig on the ' +
      'empty deck of image 1, standing along the isometric axis from the lower left toward the ' +
      'upper right, fitted inside the bay and not sticking out over its rim. ',
    work:
      'TWO half-finished raw steel hull parts are being welded there as the workpieces: ' +
      '{P1} lies FLAT across the trestles nearer to the lower left and is LARGE, a wide heavy ' +
      'steel slab that covers a good half of the free deck; {P2} stands clamped in the rotating ' +
      'welding jig behind it toward the upper right and is a BIG heavy box, about two thirds of ' +
      'the height of the gantry crane. Both are clearly unfinished: raw bare unpainted ' +
      'steel and grey primer, no paint and no markings yet, open seams not welded shut, a bright ' +
      'blue welding arc and a shower of sparks at one seam, weld spatter on the deck. ',
    density:
      'Fill the free deck beside the trestles with hull forge equipment so the bay is busy: tall ' +
      'stacks of flat steel plates, a vertical plate rack, a plasma cutting table, rows of gas ' +
      'bottles, slag bins, cable drums and stacked crates along both long edges of the deck. ',
  },

  arms_plant: {
    seedBase: 930000,
    useLine: false, // Rakete auf flachem Wagen, Panzerplatten auf der Richtbank
    products: [
      {
        key: 'missile',
        file: path.join(SRC, 'resources', 'missile', 'missile_0.webp'),
        aspect: 1.36,
        phrase: 'the long slim finned missile body',
        wipKeep:
          'KEEP THE IDENTITY of this part exactly: it is a LONG SLIM finned missile body, a ' +
          'slender pointed tube with small tail fins. The long slender tube shape must stay ' +
          'exactly as it is. ',
        wipMissing:
          'its nose cone is NOT fitted yet and lies beside it, the open nose section shows the ' +
          'bare inner frame and wiring, ',
      },
      {
        key: 'composite_armor',
        file: path.join(SRC, 'resources', 'composite_armor', 'composite_armor_0.webp'),
        aspect: 0.79,
        phrase: 'the flat hexagonal composite armor plates',
        wipKeep:
          'KEEP THE IDENTITY of this part exactly: it is a FLAT hexagonal composite armor plate, ' +
          'a thin angular slab. The flat hexagonal slab shape must stay exactly as it is. ',
        wipMissing:
          'its surface coating is not applied yet and the bare grey composite edges and open ' +
          'bolt holes are visible, ',
      },
    ],
    fixture:
      'Place a low flat rail trolley and a long fitting bench on the empty deck of image 1, ' +
      'standing one behind the other along the isometric axis from the lower left toward the ' +
      'upper right, fitted inside the bay and not sticking out over its rim. ',
    work:
      'TWO half-finished weapon PARTS lie there as the workpieces being manufactured: ' +
      '{P1} lies HORIZONTALLY in a padded cradle on the low trolley nearer to the lower left, ' +
      'flat on its side, and it is LARGE and dark: a long dark olive green body as long as half ' +
      'the bay, its nose cone not fitted yet so the bare inner frame and wiring show; ' +
      'a tall stack of {P2} lies flat on the fitting bench behind it toward the upper right, ' +
      'dark olive green composite slabs with open bolt holes. ' +
      'This bay MANUFACTURES weapon parts, it does not carry a weapon: there is NO turret, NO ' +
      'gun barrel, NO cannon, NO launcher tube, NO missile pod and NO swivel mount anywhere in ' +
      'the image, nothing is aimed, nothing stands ready to fire, every part lies disassembled ' +
      'and unfinished on the workbenches. ',
    density:
      'Fill the free deck beside the bench with arms plant equipment so the bay is busy: a tall ' +
      'steel rack along the back wall filled with rows of shiny BRASS shell casings and loose ' +
      'tail fins, walls of stacked OLIVE GREEN ammunition crates with yellow stencils along both ' +
      'long edges of the deck, a hydraulic press, an inspection bench with gauges and a measuring ' +
      'arm, and tool trolleys. Hardly any bare deck plate is left visible. ',
  },

  factory: {
    seedBase: 940000,
    useLine: false, // grosse Modulrahmen stehen in quadratischen Montagelehren unterm Kran
    products: [
      {
        key: 'solar_panel',
        file: path.join(SRC, 'modules', 'solar_panel', 'solar_panel_0.webp'),
        aspect: 0.79,
        phrase: 'the dark blue solar panel array',
        wipKeep:
          'KEEP THE IDENTITY of this machine exactly: it is a DARK BLUE solar panel array, a grid ' +
          'of flat rectangular photovoltaic cells on a steel frame. The flat dark blue cell grid ' +
          'must stay exactly as it is. ',
        wipMissing:
          'half of the grid is still EMPTY bare frame with no cells fitted yet, loose cells lie ' +
          'beside it, ',
      },
      {
        key: 'fusion_reactor',
        file: path.join(SRC, 'modules', 'fusion_reactor', 'fusion_reactor_0.webp'),
        aspect: 1.27,
        phrase: 'the round drum shaped reactor module',
        wipKeep:
          'KEEP THE IDENTITY of this machine exactly: it is a ROUND DRUM shaped reactor module, a ' +
          'squat cylinder with a ring on top. The round squat drum shape must stay exactly as it ' +
          'is. ',
        wipMissing:
          'its side covers are taken off so the inner coils and pipes are wide open, the drum is ' +
          'cold, dark and completely switched off with no light inside, ',
      },
    ],
    fixture:
      'Place two large square steel assembly jigs on the empty deck of image 1, standing one ' +
      'behind the other along the isometric axis from the lower left toward the upper right, ' +
      'fitted inside the bay and not sticking out over its rim, and lower the hook of the ' +
      'overhead gantry crane on its cable over the rear jig. ',
    work:
      'TWO half-finished machine modules are being assembled in those jigs as the workpieces: ' +
      '{P1} lies FLAT in the jig nearer to the lower left and is LARGE and unmistakable: a wide ' +
      'rectangular grid of shiny DARK BLUE photovoltaic cells in neat rows, the front half of ' +
      'the grid already filled with dark blue glass cells that catch the light, the back half ' +
      'still an empty bare steel frame with loose cells stacked beside it; {P2} stands upright ' +
      'in the jig behind it toward the upper right, a squat round drum with its side covers ' +
      'taken off so the inner coils and pipes show, about half the height of the gantry crane. ' +
      'Both are clearly unfinished with bare grey primer patches and loose cable ends. The ' +
      'reactor drum is cold, dark and switched off, it does NOT glow and emits NO light. ',
    density:
      'Fill the free deck beside the jigs with general factory equipment so the bay is busy: part ' +
      'racks holding empty module frames, pallets stacked with flat panel glass, cable drums, a ' +
      'pallet stack with a hand fork lift, tool trolleys and stacked crates along both long edges ' +
      'of the deck. ',
  },

  housing_factory: {
    seedBase: 950000,
    useLine: false, // Kabinenzellen stehen im zweistoeckigen Stapelgeruest
    products: [
      {
        key: 'habitat_cell_bare',
        file: path.join(SRC, 'modules', 'habitat_t2', 'habitat_t2_0.webp'),
        aspect: 1.04,
        phrase: 'the bare prefabricated cabin cell with the bunk inside',
        wipKeep:
          'KEEP THE IDENTITY of this part exactly: it is a prefabricated living cabin cell, a ' +
          'boxy room with painted steel walls, a bunk and a door. The boxy room shape must stay ' +
          'exactly as it is. ',
        wipMissing:
          'its front wall is not mounted yet so the bare interior is open to view, the floor ' +
          'covering is missing and cable ends hang out of the wall, ',
      },
      {
        key: 'habitat_cell_fitted',
        file: path.join(SRC, 'modules', 'habitat_t4', 'habitat_t4_0.webp'),
        aspect: 1.12,
        phrase: 'the larger fitted-out cabin module with the warm lit window and the green plants',
        wipKeep:
          'KEEP THE IDENTITY of this part exactly: it is a fitted-out living cabin module with a ' +
          'couch, green plants and a warm lit doorway. The furnished warm interior must stay ' +
          'exactly as it is. ',
        wipMissing:
          'one of its outer wall panels is not mounted yet and leans against it, ',
      },
    ],
    fixture:
      'Place a two-storey steel stacking rack on the empty deck of image 1, standing along the ' +
      'isometric axis from the lower left toward the upper right, fitted inside the bay and not ' +
      'sticking out over its rim, with a short steel stair and a walkway on its upper tier. ',
    work:
      'TWO prefabricated living cabin cells stand there as the workpieces being built: ' +
      '{P1} stands on the deck in front of the rack nearer to the lower left, its front wall not ' +
      'mounted yet so the bare interior with the bunk is open to view, floor covering missing, ' +
      'cable ends hanging out of the wall; {P2} sits in the upper tier of the rack behind it ' +
      'toward the upper right, already finished, its window glowing with warm yellow light. Both ' +
      'are SMALL, each only about one third of the height of the gantry crane. ',
    density:
      'Fill the free deck beside the rack with housing factory equipment so the bay is busy: tall ' +
      'stacks of flat white wall and floor panels, pallets with bunk frames and doors, rolls of ' +
      'insulation mat, a row of finished cabin cells waiting at the back wall, tool trolleys and ' +
      'stacked crates along both long edges of the deck. ',
  },
};

// -- HTTP-Helfer: WORTGLEICH aus scripts/factory-electronics-merge.cjs -------
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => {
        data += c;
      });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const dl = (u) => {
      const mod = u.startsWith('https') ? https : http;
      mod
        .get(u, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) return dl(res.headers.location);
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        })
        .on('error', reject);
    };
    dl(url);
  });
}
async function uploadToFal(buffer, fileName) {
  const init = JSON.parse(
    (
      await httpsRequest(
        {
          hostname: 'rest.alpha.fal.ai',
          path: '/storage/upload/initiate',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
        },
        JSON.stringify({ content_type: 'image/png', file_name: fileName }),
      )
    ).body,
  );
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
        res.on('end', resolve);
      },
    );
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
  return init.file_url;
}
async function falRun(model, payload) {
  const r = await httpsRequest(
    {
      hostname: 'fal.run',
      path: `/${model}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
    },
    JSON.stringify(payload),
  );
  let parsed;
  try {
    parsed = JSON.parse(r.body);
  } catch {
    throw new Error(`HTTP ${r.status}: ${r.body.slice(0, 400)}`);
  }
  if (r.status >= 400) throw new Error(`HTTP ${r.status}: ${r.body.slice(0, 600)}`);
  return parsed;
}
async function removeBackground(imageUrl) {
  const result = await falRun('fal-ai/birefnet/v2', { image_url: imageUrl });
  if (!result?.image?.url) throw new Error(`BG removal failed: ${JSON.stringify(result).slice(0, 300)}`);
  return downloadBuffer(result.image.url);
}

// -- Messung: WORTGLEICH aus dem Piloten ------------------------------------
async function isoSlopes(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width,
    H = info.height,
    ch = info.channels;
  const bottom = new Array(W).fill(-1);
  for (let x = 0; x < W; x++)
    for (let y = H - 1; y >= 0; y--)
      if (data[(y * W + x) * ch + 3] > 128) {
        bottom[x] = y;
        break;
      }
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
  return {
    l: fit(Math.round(bx * 0.25), Math.round(bx * 0.85)),
    r: fit(Math.round(bx + (W - bx) * 0.15), Math.round(bx + (W - bx) * 0.75)),
  };
}
async function alphaStats(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const N = info.width * info.height;
  let op = 0;
  let minx = 1e9,
    maxx = -1,
    miny = 1e9,
    maxy = -1;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] > 16) {
        op++;
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
    }
  const bw = maxx < 0 ? 0 : maxx - minx + 1;
  const bh = maxy < 0 ? 0 : maxy - miny + 1;
  return {
    W: info.width,
    H: info.height,
    coverage: op / N,
    fill: bw * bh ? op / (bw * bh) : 0,
    bboxW: bw,
    bboxH: bh,
    edgeTouch: bw >= info.width - 1 || bh >= info.height - 1,
  };
}
async function cropAndSquare(noBgBuf) {
  const cropped = await sharp(noBgBuf).trim().png().toBuffer();
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
  return { squared, cropped, cropW: w, cropH: h, size };
}
const pct = (v) => `${(v * 100).toFixed(1)}%`;
async function report(tag, buf) {
  const s = await alphaStats(buf);
  console.log(
    `    [alpha] ${tag}: ${s.W}x${s.H} deckung=${pct(s.coverage)} bbox=${s.bboxW}x${s.bboxH} ` +
      `fuellung=${pct(s.fill)}${s.edgeTouch ? '  *** RANDLOS — Warnung ***' : ''}`,
  );
  if (s.coverage < 0.02) throw new Error(`${tag}: Alpha-Deckung ${pct(s.coverage)} — Bild ist leer.`);
  return s;
}
async function flattenForEdit(file) {
  return sharp(file).flatten({ background: { r: 128, g: 130, b: 134 } }).png().toBuffer();
}
async function multiEdit(prompt, files, seed) {
  const urls = [];
  for (const f of files) urls.push(await uploadToFal(await flattenForEdit(f), path.basename(f)));
  const r = await falRun('fal-ai/flux-pro/kontext/max/multi', {
    prompt,
    image_urls: urls,
    seed,
    guidance_scale: 3.5,
    num_images: 1,
    safety_tolerance: '5',
    output_format: 'png',
    aspect_ratio: '1:1',
  });
  const url = r?.images?.[0]?.url;
  if (!url) throw new Error(`no image: ${JSON.stringify(r).slice(0, 400)}`);
  return downloadBuffer(url);
}
async function finishStage(name, gen) {
  for (const d of [DIR_RAW, DIR_NOBG, DIR_CROP, DIR_ST]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(DIR_RAW, `${name}_raw.png`), gen);
  await report(`${name} gen`, gen);
  const falUrl = await uploadToFal(gen, `${name}.png`);
  const noBg = await removeBackground(falUrl);
  fs.writeFileSync(path.join(DIR_NOBG, `${name}_nobg.png`), noBg);
  const st = await report(`${name} nobg`, noBg);
  const { squared, cropped, cropW, cropH, size } = await cropAndSquare(noBg);
  fs.writeFileSync(path.join(DIR_CROP, `${name}_cropped.png`), cropped);
  const dst = path.join(DIR_ST, `${name}.png`);
  fs.writeFileSync(dst, squared);
  const sq = await alphaStats(squared);
  const sl = await isoSlopes(dst);
  console.log(
    `    crop ${cropW}x${cropH} -> square ${size}x${size}  deckung=${pct(sq.coverage)}  ` +
      `iso-achse ${sl.l >= 0 ? '+' : ''}${sl.l.toFixed(3)} / ${sl.r.toFixed(3)}`,
  );
  console.log(`    [save] ${path.relative(ROOT, dst)}`);
  return { name, size, cropW, cropH, alphaGen: st, alphaSquare: sq, slopes: sl, file: dst };
}

// -- Prompt-Bau -------------------------------------------------------------
/** Bildindizes: 1 = b1, [2 = b8], dann die zwei Produkte. */
function buildMergePrompt(cfg, track, variant = 'plain') {
  const first = cfg.useLine ? 3 : 2;
  const p = cfg.products.map((pr, i) => `${pr.phrase} from image ${first + i}`);
  const line = cfg.useLine
    ? 'Place the long yellow roller conveyor assembly line from image 2 onto the empty deck of ' +
      'image 1, running along the isometric axis from the lower left toward the upper right, ' +
      'fitted inside the bay and not sticking out over its rim. '
    : cfg.fixture;
  const work = cfg.work.replace('{P1}', p[0]).replace('{P2}', p[1]);
  const trackNote =
    track === 'wip'
      ? '' // die Produktbilder sind bereits als halbfertig gezeichnet
      : 'Even though images of the finished parts are given, draw both workpieces CLEARLY ' +
        'UNFINISHED and still under construction, never as finished products. ';
  const nobg = variant === 'margin' ? NOBG_MARGIN : NOBG;
  return SCENE + line + work + trackNote + cfg.density + STYLE + nobg;
}
function wipPrompt(pr) {
  return (
    pr.wipKeep +
    'Now rebuild this same part as a HALF-FINISHED unit still under construction in a factory. ' +
    'It is visibly incomplete: ' +
    pr.wipMissing +
    'more than half of its outer plating is not mounted yet and shows raw grey primer and bare ' +
    'unpainted steel underneath, thick cables run out of the open body down to the floor, a ' +
    'yellow steel assembly jig with clamps stands beside the unit and supports it, two loose ' +
    'panels lie on the floor. ' +
    'Keep the exact same pose, the same camera, the same isometric 2.5D perspective, the same ' +
    'proportions and the same lighting from the upper left. ' +
    'Plain flat neutral grey background, one single object, nothing else in the image, ' +
    'entire part fully visible, nothing cropped at the image borders.'
  );
}

// -- Modi -------------------------------------------------------------------
function cfgOf(name) {
  const cfg = FACTORIES[name];
  if (!cfg) throw new Error(`unbekannte Fabrik "${name}" — bekannt: ${Object.keys(FACTORIES).join(', ')}`);
  return cfg;
}

async function runWip(name) {
  const cfg = cfgOf(name);
  const out = [];
  for (let i = 0; i < cfg.products.length; i++) {
    const pr = cfg.products[i];
    const seed = cfg.seedBase + 700 + i;
    const prompt = wipPrompt(pr);
    console.log(`\n[wip] ${name} / ${pr.key} (seed ${seed})`);
    const inUrl = await uploadToFal(await flattenForEdit(pr.file), `${pr.key}_in.png`);
    const r = await falRun('fal-ai/flux-pro/kontext', {
      prompt,
      image_url: inUrl,
      seed,
      guidance_scale: 3.5,
      num_images: 1,
      safety_tolerance: '5',
      output_format: 'png',
    });
    const genUrl = r?.images?.[0]?.url;
    if (!genUrl) throw new Error(`no image: ${JSON.stringify(r).slice(0, 300)}`);
    const gen = await downloadBuffer(genUrl);
    for (const d of [DIR_RAW, DIR_ST]) fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(DIR_RAW, `${name}_${pr.key}_wip_raw.png`), gen);
    await report('gen', gen);
    const falUrl = await uploadToFal(gen, `${name}_${pr.key}_wip.png`);
    const noBg = await removeBackground(falUrl);
    const { squared, cropW, cropH, size } = await cropAndSquare(noBg);
    const dst = path.join(DIR_ST, `${name}_${pr.key}_wip.png`);
    fs.writeFileSync(dst, squared);
    console.log(`    crop ${cropW}x${cropH} -> square ${size}x${size}  [save] ${path.relative(ROOT, dst)}`);
    out.push({ key: pr.key, seed, file: path.relative(ROOT, dst), prompt });
  }
  fs.writeFileSync(
    path.join(DIR_ST, `${name}_wip_results.json`),
    JSON.stringify({ factory: name, model: 'fal-ai/flux-pro/kontext', results: out }, null, 2),
  );
}

async function runMerge(name, track, nums, opts = {}) {
  const label = opts.label || 'a';
  const variant = opts.variant || 'plain';
  const cfg = cfgOf(name);
  const prompt = buildMergePrompt(cfg, track, variant);
  for (const n of nums) {
    const files = [BASE_B1];
    if (cfg.useLine) files.push(BASE_B8);
    for (const pr of cfg.products)
      files.push(track === 'wip' ? path.join(DIR_ST, `${name}_${pr.key}_wip.png`) : pr.file);
    for (const f of files) if (!fs.existsSync(f)) throw new Error(`fehlt: ${f}`);
    const seed = cfg.seedBase + n;
    const tag = `${name}_${track}_${label}${n}`;
    console.log(`\n[merge] ${tag}: ${files.length} Eingangsbilder, seed ${seed}, variant=${variant}`);
    const gen = await multiEdit(prompt, files, seed);
    const r = await finishStage(tag, gen);
    fs.writeFileSync(
      path.join(DIR_ST, `${tag}.json`),
      JSON.stringify(
        { factory: name, track, variant, seed, inputs: files.map((f) => path.relative(ROOT, f)), prompt, ...r },
        null,
        2,
      ),
    );
  }
}

async function runMeasure(files) {
  for (const file of files) {
    const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
    if (!fs.existsSync(abs)) {
      console.log(`FEHLT ${file}`);
      continue;
    }
    const st = await alphaStats(fs.readFileSync(abs));
    const sl = await isoSlopes(abs);
    console.log(
      `${path.relative(ROOT, abs).padEnd(52)} ${st.W}x${st.H}  deckung=${pct(st.coverage)}  ` +
        `bbox=${st.bboxW}x${st.bboxH}  iso-achse ${sl.l >= 0 ? '+' : ''}${sl.l.toFixed(3)} / ${sl.r.toFixed(3)}`,
    );
  }
}

/** Gewaehlten Kandidaten nach assets/final/<name>_v2.png kopieren. */
async function promote(name, track, n, label = 'a') {
  const src = path.join(DIR_ST, `${name}_${track}_${label}${n}.png`);
  if (!fs.existsSync(src)) throw new Error(`fehlt: ${src}`);
  fs.mkdirSync(DIR_FINAL, { recursive: true });
  const dst = path.join(DIR_FINAL, `${name}_v2.png`);
  fs.copyFileSync(src, dst);
  console.log(`[promote] ${path.relative(ROOT, src)} -> ${path.relative(ROOT, dst)}`);
  await runMeasure([dst]);
}

(async () => {
  const mode = (process.argv[2] || '').toLowerCase();
  const a = process.argv.slice(3);
  if (mode === 'wip') return runWip(a[0]);
  if (mode === 'merge') {
    const rest = a.slice(2);
    let label = 'a';
    let variant = 'plain';
    const nums = [];
    for (const tok of rest) {
      const lm = tok.match(/^--label=(.+)$/);
      const vm = tok.match(/^--variant=(plain|margin)$/);
      if (lm) label = lm[1];
      else if (vm) variant = vm[1];
      else nums.push(parseInt(tok, 10));
    }
    return runMerge(a[0], a[1], nums, { label, variant });
  }
  if (mode === 'measure') return runMeasure(a);
  if (mode === 'promote') {
    let label = 'a';
    for (const tok of a.slice(3)) {
      const lm = tok.match(/^--label=(.+)$/);
      if (lm) label = lm[1];
    }
    return promote(a[0], a[1], parseInt(a[2], 10), label);
  }
  if (mode === 'prompt') {
    console.log(buildMergePrompt(cfgOf(a[0]), a[1] || 'raw', a[2] || 'plain'));
    return;
  }
  console.error(
    'usage: wip <factory> | merge <factory> <raw|wip> <n...> [--label=X] [--variant=plain|margin] | ' +
      'measure <png...> | promote <factory> <track> <n> [--label=X] | prompt <factory> [track] [variant]',
  );
  process.exit(1);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
