/**
 * Asset-Pipeline STUFE 2-4: PILOT "Elektronikfabrik" — Basis + Montage.
 *
 * Verfahren (Rudi):
 *   1. Basis-Kandidaten generieren            -> scripts/factory-base-generate.cjs (fertig)
 *   2. Rudi waehlt die Basis                  -> b1 (Hero)
 *   3. echte Produkt-Assets per Flux-Edit in "in construction" wandeln   <- DIESES SCRIPT (wip)
 *   4. diese per Flux-Edit in die Basis mergen                           <- DIESES SCRIPT (merge)
 *
 * Eingangsbilder des Merge:
 *   1. assets/style-test/modules/factory_base_b1.png   — die Buehne (Hero)
 *   2. assets/style-test/modules/factory_base_b8.png   — lange Montagestrasse
 *   3. robot_t2 "in construction"                      — Kettenplattform (breit, niedrig)
 *   4. robot_t4 "in construction"                      — schlanker Humanoid (hoch, schmal)
 *
 * Modelle:
 *   - "in construction": fal-ai/flux-pro/kontext          (1 Eingangsbild, image_url)
 *   - Merge:             fal-ai/flux-pro/kontext/max/multi (n Eingangsbilder, image_urls)
 *   - BG-Removal:        fal-ai/birefnet/v2
 *
 * Nachmessung nach JEDEM Schritt (die Fallen aus den Vorlaeufen):
 *   - Alpha-Deckung (ein randlos gefuelltes Bild loescht birefnet komplett -> 0%)
 *   - Iso-Achse: Steigung der beiden unteren Silhouettenkanten (Soll +0.5/-0.5)
 *     Funktion WORTGLEICH aus scripts/factory-base-sheet.cjs uebernommen.
 *
 * Schreibt NUR nach assets/. Nichts unter src/. Kein cap sync, kein git.
 * fal-Key aus scripts/.env (FAL_API_KEY) — nie hardcoden.
 *
 * Usage:
 *   node scripts/factory-electronics-merge.cjs probe          # wieviele Bilder nimmt multi?
 *   node scripts/factory-electronics-merge.cjs wip            # Stufe 3
 *   node scripts/factory-electronics-merge.cjs merge-one [n]  # Stufe 4, alle 4 auf einmal
 *   node scripts/factory-electronics-merge.cjs merge-seq [n]  # Stufe 4, zweistufig
 *   node scripts/factory-electronics-merge.cjs measure <png>  # Alpha + Iso-Achse
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

const BASE_B1 = path.join(DIR_ST, 'factory_base_b1.png');
const BASE_B8 = path.join(DIR_ST, 'factory_base_b8.png');

// ── Die zwei gewaehlten Roboter ──────────────────────────────────────────────
// Begruendung: maximaler Silhouettenkontrast. t2 ist die einzige NICHT-humanoide
// Form der Familie (Kettenlaufwerk, breit+niedrig, Seitenverhaeltnis 0.82),
// t4 der schlankste+hoechste Humanoid (0.40). Nebeneinander auf einer Linie
// liest sich das als Serie zweier Produkte, nicht als Dopplung.
const ROBOTS = {
  t2: {
    src: path.join(ROOT, 'src', 'assets', 'workforce', 'robot_t2', 'robot_t2_0.webp'),
    seed: 720201,
    desc: 'tracked platform drone',
    // Identitaets-Anker (Fassung 3): ohne ihn hat Fassung 2 aus dem Kettenfahrzeug
    // einen zweibeinigen Mech gemacht — das Asset war dann nicht mehr robot_t2.
    keep:
      'KEEP THE IDENTITY of this machine exactly: it is a tracked platform drone, it has ' +
      'NO legs at all, it rolls on two caterpillar tracks, its body is a wide low boxy hull ' +
      'with an orange light bar on the front and a single manipulator arm. ' +
      'The caterpillar tracks and the low wide boxy shape must stay exactly as they are. ',
    missing: 'its single manipulator arm is DETACHED and lies on the floor next to it, the empty bare shoulder socket with its connector pins stands open, ',
  },
  t4: {
    src: path.join(ROOT, 'src', 'assets', 'workforce', 'robot_t4', 'robot_t4_0.webp'),
    seed: 720407,
    desc: 'tall slim humanoid',
    keep:
      'KEEP THE IDENTITY of this machine exactly: it is a tall slim bipedal humanoid android ' +
      'standing upright, with a cyan visor face plate and narrow limbs. ' +
      'The tall slim upright humanoid silhouette must stay exactly as it is. ',
    missing: 'one whole arm is MISSING and the empty bare shoulder socket with its connector pins stands open, ',
  },
};

// ── Prompt Stufe 3: "in construction" ────────────────────────────────────────
const WIP_PROMPT =
  'Show this exact same robot as an UNFINISHED unit on a factory assembly line. ' +
  'Several outer armor panels are still missing so the bare inner metal frame, ribs, ' +
  'hydraulic lines and a wiring loom are exposed, one limb is not yet attached and hangs ' +
  'from a thin cable, patches of bare unpainted metal and grey primer where the paint has ' +
  'not been applied yet, a thin light scaffolding clamp holds the torso. ' +
  'Keep the exact same pose, the exact same camera, the exact same isometric 2.5D ' +
  'perspective, the same proportions and the same lighting from the upper left. ' +
  'Plain flat neutral grey background, one single object, nothing else in the image, ' +
  'entire robot fully visible, nothing cropped at the image borders.';

// ── Prompt Stufe 3, Fassung 2: haerter. Fassung 1 blieb zu dezent — der Roboter
// kam nur leicht entsaettigt zurueck, "unfertig" war nicht abzulesen.
const WIP_PROMPT_V2 =
  'Rebuild this exact same robot as a HALF-FINISHED unit still under construction in a factory. ' +
  'It is visibly incomplete: one whole arm is MISSING and the empty bare shoulder socket with ' +
  'its connector pins stands open, the chest hatch is removed so the inner skeleton frame, ribs, ' +
  'hydraulic cylinders and a thick orange wiring loom are wide open and clearly visible, ' +
  'more than half of the outer armor plating is not mounted yet and shows raw grey primer and ' +
  'bare unpainted steel underneath, thick cables run out of the open body down to the floor, ' +
  'a yellow steel assembly jig with clamps grips the unit and holds it upright, ' +
  'two loose armor panels lean against the jig. ' +
  'Keep the exact same overall pose, the same camera, the same isometric 2.5D perspective, ' +
  'the same proportions and the same lighting from the upper left. ' +
  'Plain flat neutral grey background, one single object, nothing else in the image, ' +
  'entire robot fully visible, nothing cropped at the image borders.';

// ── Prompt Stufe 3, Fassung 3 (GENOMMEN): Fassung 2 mit Identitaets-Anker.
// Fassung 1 war zu dezent, Fassung 2 hat bei t2 die Form verloren. Fassung 3
// stellt den Anker VOR den Auftrag und nennt das fehlende Teil je Roboter.
const wipPromptV3 = (cfg) =>
  cfg.keep +
  'Now rebuild this same machine as a HALF-FINISHED unit still under construction in a factory. ' +
  'It is visibly incomplete: ' +
  cfg.missing +
  'a body hatch is removed so the inner skeleton frame, ribs, hydraulic cylinders and a thick ' +
  'orange wiring loom are wide open and clearly visible, more than half of the outer armor ' +
  'plating is not mounted yet and shows raw grey primer and bare unpainted steel underneath, ' +
  'thick cables run out of the open body down to the floor, a yellow steel assembly jig with ' +
  'clamps stands beside the unit and supports it, two loose armor panels lie on the floor. ' +
  'Keep the exact same pose, the same camera, the same isometric 2.5D perspective, the same ' +
  'proportions and the same lighting from the upper left. ' +
  'Plain flat neutral grey background, one single object, nothing else in the image, ' +
  'entire machine fully visible, nothing cropped at the image borders.';

// ── Prompt Stufe 4: Merge (one-shot, 4 Eingangsbilder) ───────────────────────
const MERGE_PROMPT_ONE =
  'Image 1 is the scene and must be preserved: keep its factory bay, its back walls with the ' +
  'roller doors, its overhead gantry crane, its yellow and black hazard striping, its deck ' +
  'plate, its camera angle and its lighting exactly as they are and do not redraw them. ' +
  'Place the long yellow roller conveyor assembly line from image 2 onto the empty deck of ' +
  'image 1, running along the isometric axis from the lower left toward the upper right, ' +
  'fitted inside the bay and not sticking out over its rim. ' +
  'On that conveyor place the two unfinished robots from image 3 and image 4 as the workpieces ' +
  'being assembled: the tracked platform from image 3 nearer to the lower left, the tall slim ' +
  'humanoid from image 4 behind it toward the upper right, both standing upright on the line, ' +
  'both clearly smaller than the gantry crane above them. ' +
  'This is an electronics factory, so add thin cable looms and a few flat circuit panels on the ' +
  'work stations beside the line. ' +
  'Everything keeps the same isometric 2.5D perspective, 2:1 isometric, 30 degree camera angle, ' +
  'lit from the upper left, The Expanse hard sci-fi aesthetic, navy blue painted steel with ' +
  'yellow safety stripes, weathered metal, photorealistic textures. ' +
  'No background, isolated object on a plain empty background, no ground plane, no shadow, ' +
  'the whole factory module fully inside the frame with a generous empty margin, ' +
  'nothing cropped at the image borders, clean isometric alignment, not tilted, no rotation.';

// ── Merge-Prompt Fassung 2 (GENOMMEN): Fassung 1 lieferte nur EINEN Roboter,
// zu gross und NEBEN der Linie; die Bucht wirkte bei 48 px leer. Fassung 2
// fordert beide Einheiten AUF der Linie, kleiner, und fuellt die Raender.
const MERGE_PROMPT_ONE_V2 =
  'Image 1 is the scene and must be preserved: keep its factory bay, its back walls with the ' +
  'roller doors, its overhead gantry crane, its yellow and black hazard striped rim, its deck ' +
  'plate, its camera angle and its lighting exactly as they are and do not redraw them. ' +
  'Place the long yellow roller conveyor assembly line from image 2 onto the empty deck of ' +
  'image 1, running along the isometric axis from the lower left toward the upper right, ' +
  'fitted inside the bay and not sticking out over its rim. ' +
  'TWO half-finished robots stand ON TOP of that conveyor line, one behind the other, as the ' +
  'workpieces being assembled: image 3, the small tracked platform drone on caterpillar tracks, ' +
  'sits on the line nearer to the lower left; image 4, the slim humanoid android, stands on the ' +
  'line behind it toward the upper right. Both are SMALL, each only about one third of the ' +
  'height of the gantry crane, both clearly unfinished with missing armor panels, exposed inner ' +
  'frames and bright orange wiring looms. ' +
  'Fill the free deck beside the line with electronics factory equipment so the bay is busy: ' +
  'work stations with flat green circuit panels, part racks, cable drums, tool trolleys and ' +
  'stacked crates along both long edges of the deck, and a small yellow assembly jig. ' +
  'Everything keeps the same isometric 2.5D perspective, 2:1 isometric, 30 degree camera angle, ' +
  'lit from the upper left, The Expanse hard sci-fi aesthetic, navy blue painted steel with ' +
  'yellow safety stripes, weathered metal, photorealistic textures. ' +
  'No background, isolated object on a plain empty background, no ground plane, no shadow, ' +
  'the whole factory module fully inside the frame with a generous empty margin, ' +
  'nothing cropped at the image borders, clean isometric alignment, not tilted, no rotation.';

// ── Prompt Stufe 4a/4b: sequenziell ──────────────────────────────────────────
const MERGE_PROMPT_SEQ_A =
  'Image 1 is the scene and must be preserved: keep its factory bay, its back walls with the ' +
  'roller doors, its overhead gantry crane, its yellow and black hazard striping, its deck ' +
  'plate, its camera angle and its lighting exactly as they are and do not redraw them. ' +
  'Place the long yellow roller conveyor assembly line from image 2 onto the empty deck of ' +
  'image 1, running along the isometric axis from the lower left toward the upper right, ' +
  'fitted inside the bay and not sticking out over its rim, with nothing standing on it yet. ' +
  'Everything keeps the same isometric 2.5D perspective, 2:1 isometric, 30 degree camera angle, ' +
  'lit from the upper left, The Expanse hard sci-fi aesthetic, navy blue painted steel with ' +
  'yellow safety stripes, weathered metal, photorealistic textures. ' +
  'No background, isolated object on a plain empty background, no ground plane, no shadow, ' +
  'the whole factory module fully inside the frame with a generous empty margin, ' +
  'nothing cropped at the image borders, clean isometric alignment, not tilted, no rotation.';

const MERGE_PROMPT_SEQ_B =
  'Image 1 is the scene and must be preserved: keep its factory bay, its back walls, its ' +
  'overhead gantry crane, its yellow conveyor assembly line, its deck plate, its camera angle ' +
  'and its lighting exactly as they are and do not redraw them. ' +
  'TWO half-finished robots stand ON TOP of that conveyor line, one behind the other, as the ' +
  'workpieces being assembled: image 2, the small tracked platform drone on caterpillar tracks, ' +
  'sits on the line nearer to the lower left; image 3, the slim humanoid android, stands on the ' +
  'line behind it toward the upper right. Both are SMALL, each only about one third of the ' +
  'height of the gantry crane, both clearly unfinished with missing armor panels, exposed inner ' +
  'frames and bright orange wiring looms. ' +
  'Fill the free deck beside the line with electronics factory equipment so the bay is busy: ' +
  'work stations with flat green circuit panels, part racks, cable drums, tool trolleys and ' +
  'stacked crates along both long edges of the deck, and a small yellow assembly jig. ' +
  'Everything keeps the same isometric 2.5D perspective, 2:1 isometric, 30 degree camera angle, ' +
  'lit from the upper left, The Expanse hard sci-fi aesthetic, navy blue painted steel with ' +
  'yellow safety stripes, weathered metal, photorealistic textures. ' +
  'No background, isolated object on a plain empty background, no ground plane, no shadow, ' +
  'the whole factory module fully inside the frame with a generous empty margin, ' +
  'nothing cropped at the image borders, clean isometric alignment, not tilted, no rotation.';

// ── HTTP-Helfer (Konvention aus factory-base-generate.cjs) ───────────────────
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

// ── Messung ─────────────────────────────────────────────────────────────────
/**
 * Steigung der beiden unteren Silhouettenkanten. WORTGLEICH aus
 * scripts/factory-base-sheet.cjs — damit das Endergebnis mit derselben Zahl
 * gegen b1 verglichen wird und nicht mit einer zweiten Definition.
 */
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

/** Alpha-Deckung: Anteil sichtbarer Pixel. 0 = birefnet hat alles geloescht. */
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
    coverage: op / N, // Anteil am ganzen Canvas
    fill: bw * bh ? op / (bw * bh) : 0, // Anteil innerhalb der Bounding-Box
    bboxW: bw,
    bboxH: bh,
    edgeTouch: bw >= info.width - 1 || bh >= info.height - 1, // randlos gefuellt?
  };
}

/** Tight Crop, dann auf zentriertes 1:1-Quadrat padden. Kein Resize. */
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

// ── STUFE 3: "in construction" ──────────────────────────────────────────────
/** Roboter auf neutrales Grau flatten — Kontext-Modelle deuten Alpha sonst als Schwarz. */
async function flattenForEdit(file) {
  return sharp(file).flatten({ background: { r: 128, g: 130, b: 134 } }).png().toBuffer();
}

async function runWip(variant) {
  const sfx = variant === 1 ? '_wip' : `_wip${variant}`;
  for (const d of [DIR_RAW, DIR_NOBG, DIR_CROP, DIR_ST]) fs.mkdirSync(d, { recursive: true });
  const out = [];
  for (const [tag, cfg] of Object.entries(ROBOTS)) {
    const seed = cfg.seed + (variant - 1) * 11;
    const PROMPT = variant === 3 ? wipPromptV3(cfg) : variant === 2 ? WIP_PROMPT_V2 : WIP_PROMPT;
    console.log(`\n[wip v${variant}] robot_${tag} (${cfg.desc}, seed ${seed})`);
    const flat = await flattenForEdit(cfg.src);
    const inUrl = await uploadToFal(flat, `robot_${tag}_in.png`);
    const r = await falRun('fal-ai/flux-pro/kontext', {
      prompt: PROMPT,
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
    fs.writeFileSync(path.join(DIR_RAW, `robot_${tag}${sfx}_raw.png`), gen);
    await report('gen', gen);

    const falUrl = await uploadToFal(gen, `robot_${tag}${sfx}.png`);
    const noBg = await removeBackground(falUrl);
    fs.writeFileSync(path.join(DIR_NOBG, `robot_${tag}${sfx}_nobg.png`), noBg);
    const st = await report('nobg', noBg);

    const { squared, cropped, cropW, cropH, size } = await cropAndSquare(noBg);
    fs.writeFileSync(path.join(DIR_CROP, `robot_${tag}${sfx}_cropped.png`), cropped);
    const dst = path.join(DIR_ST, `robot_${tag}${sfx}.png`);
    fs.writeFileSync(dst, squared);
    console.log(`    crop ${cropW}x${cropH} -> square ${size}x${size}  [save] ${path.relative(ROOT, dst)}`);
    out.push({ tag, desc: cfg.desc, seed, size, cropW, cropH, alpha: st, prompt: PROMPT });
  }
  fs.writeFileSync(
    path.join(DIR_ST, `electronics${sfx}_results.json`),
    JSON.stringify({ variant, model: 'fal-ai/flux-pro/kontext', results: out }, null, 2),
  );
  console.log('\nwip done');
}

// ── Probe: wieviele Eingangsbilder nimmt kontext/max/multi? ─────────────────
async function runProbe() {
  const files = [BASE_B1, BASE_B8, path.join(DIR_ST, 'robot_t2_wip3.png'), path.join(DIR_ST, 'robot_t4_wip3.png'), path.join(DIR_ST, 'factory_base_b5.png'), path.join(DIR_ST, 'factory_base_b9.png')];
  const urls = [];
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.log(`  (fehlt, uebersprungen: ${path.relative(ROOT, f)})`);
      continue;
    }
    urls.push(await uploadToFal(await sharp(f).flatten({ background: { r: 128, g: 130, b: 134 } }).png().toBuffer(), path.basename(f)));
  }
  for (let n = 2; n <= urls.length; n++) {
    process.stdout.write(`  probe n=${n} ... `);
    try {
      const r = await falRun('fal-ai/flux-pro/kontext/max/multi', {
        prompt: 'keep image 1 exactly as it is',
        image_urls: urls.slice(0, n),
        seed: 1,
        num_images: 1,
        safety_tolerance: '5',
        output_format: 'png',
      });
      console.log(r?.images?.[0]?.url ? 'OK' : `keine Bild-URL: ${JSON.stringify(r).slice(0, 200)}`);
    } catch (e) {
      console.log(`ABGELEHNT — ${e.message.slice(0, 300)}`);
    }
  }
}

// ── STUFE 4: Merge ──────────────────────────────────────────────────────────
async function multiEdit(prompt, files, seed) {
  const urls = [];
  for (const f of files) {
    const buf = await sharp(f).flatten({ background: { r: 128, g: 130, b: 134 } }).png().toBuffer();
    urls.push(await uploadToFal(buf, path.basename(f)));
  }
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

/** gen -> birefnet -> tight crop -> 1:1, mit Messung an jeder Station. */
async function finishStage(name, gen) {
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

async function runMergeOne(attempt) {
  const PROMPT = attempt >= 2 ? MERGE_PROMPT_ONE_V2 : MERGE_PROMPT_ONE;
  fs.mkdirSync(DIR_ST, { recursive: true });
  const seed = 830000 + attempt;
  const files = [BASE_B1, BASE_B8, path.join(DIR_ST, 'robot_t2_wip3.png'), path.join(DIR_ST, 'robot_t4_wip3.png')];
  for (const f of files) if (!fs.existsSync(f)) throw new Error(`fehlt: ${f}`);
  console.log(`\n[merge-one] 4 Eingangsbilder, seed ${seed}`);
  const gen = await multiEdit(PROMPT, files, seed);
  return finishStage(`electronics_merge_one_a${attempt}`, gen);
}

async function runMergeSeq(attempt) {
  fs.mkdirSync(DIR_ST, { recursive: true });
  const seed = 840000 + attempt;
  console.log(`\n[merge-seq A] b1 + b8, seed ${seed}`);
  const genA = await multiEdit(MERGE_PROMPT_SEQ_A, [BASE_B1, BASE_B8], seed);
  const a = await finishStage(`electronics_merge_seqA_a${attempt}`, genA);

  console.log(`\n[merge-seq B] Stufe A + 2 Roboter, seed ${seed + 1}`);
  const genB = await multiEdit(
    MERGE_PROMPT_SEQ_B,
    [a.file, path.join(DIR_ST, 'robot_t2_wip3.png'), path.join(DIR_ST, 'robot_t4_wip3.png')],
    seed + 1,
  );
  const b = await finishStage(`electronics_merge_seqB_a${attempt}`, genB);
  return { a, b };
}

async function runMeasure(file) {
  const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
  const st = await alphaStats(fs.readFileSync(abs));
  const sl = await isoSlopes(abs);
  console.log(
    `${path.relative(ROOT, abs)}  ${st.W}x${st.H}  deckung=${pct(st.coverage)}  ` +
      `bbox=${st.bboxW}x${st.bboxH}  iso-achse ${sl.l >= 0 ? '+' : ''}${sl.l.toFixed(3)} / ${sl.r.toFixed(3)}`,
  );
}

(async () => {
  const mode = (process.argv[2] || '').toLowerCase();
  const arg = process.argv[3];
  if (mode === 'wip') return runWip(parseInt(arg || '1', 10));
  if (mode === 'probe') return runProbe();
  if (mode === 'merge-one') {
    const r = await runMergeOne(parseInt(arg || '1', 10));
    fs.writeFileSync(path.join(DIR_ST, `${r.name}.json`), JSON.stringify({ prompt: parseInt(arg||'1',10) >= 2 ? MERGE_PROMPT_ONE_V2 : MERGE_PROMPT_ONE, ...r }, null, 2));
    return;
  }
  if (mode === 'merge-seq') {
    const r = await runMergeSeq(parseInt(arg || '1', 10));
    fs.writeFileSync(
      path.join(DIR_ST, `${r.b.name}.json`),
      JSON.stringify({ promptA: MERGE_PROMPT_SEQ_A, promptB: MERGE_PROMPT_SEQ_B, ...r }, null, 2),
    );
    return;
  }
  // Prompt-Protokoll ohne API-Aufruf nachschreiben (der v3-Lauf brach nach dem
  // Speichern der Bilder, aber vor dem Schreiben der JSON ab).
  if (mode === 'wip-json') {
    const variant = parseInt(arg || '3', 10);
    const sfx = variant === 1 ? '_wip' : `_wip${variant}`;
    const out = [];
    for (const [tag, cfg] of Object.entries(ROBOTS)) {
      const file = path.join(DIR_ST, `robot_${tag}${sfx}.png`);
      const m = await sharp(file).metadata();
      out.push({
        tag, desc: cfg.desc, seed: cfg.seed + (variant - 1) * 11,
        size: m.width, file: path.relative(ROOT, file),
        prompt: variant === 3 ? wipPromptV3(cfg) : variant === 2 ? WIP_PROMPT_V2 : WIP_PROMPT,
      });
    }
    const dst = path.join(DIR_ST, `electronics${sfx}_results.json`);
    fs.writeFileSync(dst, JSON.stringify({ variant, model: 'fal-ai/flux-pro/kontext', results: out }, null, 2));
    console.log('[save] ' + path.relative(ROOT, dst));
    return;
  }
  if (mode === 'measure') return runMeasure(arg);
  console.error('usage: probe | wip | merge-one [n] | merge-seq [n] | measure <png>');
  process.exit(1);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
