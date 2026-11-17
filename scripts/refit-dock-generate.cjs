/**
 * Asset-Pipeline: REFIT_DOCK module sprite (Spec 0.24.0 — new module type).
 *
 * REFIT_DOCK = a dry dock / refit cradle. A shipyard with enough of them can
 * rebuild a docked ship (add/remove hulls and modules). Capacity is measured in
 * hulls (refitHullCapacity). It belongs to the SHIP_YARD / DOCK_LARGE family:
 * navy-blue painted steel, yellow-black hazard stripes, grey concrete apron,
 * weathered "The Expanse" hard sci-fi industrial look.
 *
 * Distinct from its siblings:
 *   ship_yard   BUILDS ships   -> gantry cranes + a hull under construction
 *   dock_large  BERTHS a ship  -> closed hangar box with a bay mouth
 *   refit_dock  HOLDS & WORKS  -> OPEN cradle/clamps, work platforms, service
 *                                 arms; you must see that something fits INTO it
 *
 * Style anchor + anti-crop/anti-rotation constraints taken VERBATIM from the
 * proven scripts/regenerate-dock-large.ts (closest sibling, same family).
 * Orientation rule (project convention): directed objects run lower-left ->
 * upper-right. That belongs in the PROMPT — mirroring afterwards is forbidden,
 * it flips the light.
 *
 * Pipeline (CLAUDE.md Phase 2b, steps 2-5):
 *   flux/dev @512x512 PNG -> birefnet/v2 bg removal -> sharp trim (tight crop)
 *   -> pad to centered 1:1 square (NO resize; family is ~477-508px square)
 *
 * Writes ONLY to assets/ — nothing under src/. No cap sync, no commit.
 * fal key comes from scripts/.env (FAL_API_KEY) — never hardcoded.
 *
 * Usage:
 *   node scripts/refit-dock-generate.cjs candidates        # c1..c3 -> style-test
 *   node scripts/refit-dock-generate.cjs final c2          # chosen -> assets/final
 *   node scripts/refit-dock-generate.cjs candidates 4 <seed>  # extra retry cand.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');

// ── fal key from scripts/.env ──
try {
  const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const FAL_API_KEY = process.env.FAL_API_KEY || process.env.FAL_AI_API_KEY;
if (!FAL_API_KEY) { console.error('No FAL_API_KEY in scripts/.env'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const DIR_RAW = path.join(ROOT, 'assets', 'raw');
const DIR_NOBG = path.join(ROOT, 'assets', 'nobg');
const DIR_CROP = path.join(ROOT, 'assets', 'cropped');
const DIR_FINAL = path.join(ROOT, 'assets', 'final');
const DIR_ST = path.join(ROOT, 'assets', 'style-test', 'modules');

// ── Style anchor: verbatim from regenerate-dock-large.ts (same family) ──
const BASE_STYLE =
  'isometric game asset, isometric 2.5D perspective, 30 degree camera angle from horizontal, ' +
  '2:1 isometric perspective, The Expanse hard sci-fi aesthetic, ' +
  'navy-blue painted steel with yellow safety stripes, weathered metal surfaces, ' +
  'photorealistic textures, scratched paint, grime and oil residue, ' +
  'lit from upper left, soft top-left key light, no background, isolated object, ' +
  'game sprite, centered, single object, no ground plane, no shadow, ' +
  // anti-crop
  'entire structure fully visible in frame, generous empty margin around the complete object, ' +
  'nothing cropped at image borders, whole object inside the canvas, zoomed out, small in frame, ' +
  // anti-rotation
  'clean isometric alignment, both visible facades at equal symmetric angles, no rotation, ' +
  'axis-aligned, not tilted, straight isometric orientation';

// ── Project orientation convention: directed objects run lower-left -> upper-right ──
const ORIENTATION =
  'the long axis of the cradled ship runs diagonally from the lower left of the image ' +
  'toward the upper right, bow pointing to the upper right, ' +
  'the whole dock is aligned along that same lower-left to upper-right diagonal';

// Round 2: the bow kept landing at the lower left. State both ends explicitly and
// forbid the closed-hangar read that c1 fell into.
const ORIENTATION_STRICT =
  'the ship lies on the lower-left to upper-right diagonal, its sharp pointed nose and cockpit ' +
  'at the UPPER RIGHT end of the ship, its engine nozzles and thruster bells at the LOWER LEFT ' +
  'end of the ship, the bow aims away from the viewer toward the top right corner, ' +
  'the whole dock is aligned along that same lower-left to upper-right diagonal';

const OPENNESS =
  'the cradle is open on top and open at both ends, the ship is fully visible from above, ' +
  'no roof over the ship, no closed hangar box, no enclosing walls around the ship, ' +
  'only low open framework, clamps and railed catwalks stand next to the hull';

// Negatives — kill maritime read (inherited from dock_large) + keep it open.
const NEG =
  'no boats, no yachts, no sailing ships, no water, no maritime vessels, no sea, no masts, no sails, ' +
  'not a closed box, no solid enclosing walls, no sealed hangar, cartoon, anime, fantasy, ' +
  'text, logos, watermark, background, scene, landscape, human figures, multiple separate objects';

const SHARED_REFIT =
  'refit dry dock module, an OPEN service cradle that holds one spaceship for rebuilding, ' +
  'the ship rests in open U-shaped support clamps and is NOT enclosed, ' +
  'you can clearly see that a hull fits into the cradle, ' +
  'grey concrete apron base with yellow and black hazard striping along its edges';

const CANDIDATES = {
  c1: {
    seed: 240101,
    note: 'cradle + side work gantries, hull plates opened',
    body:
      `${SHARED_REFIT}, a mid-size grey spaceship hull sits in the cradle with several hull plates ` +
      'removed and stacked beside it, two tall navy-blue work gantries with railed service platforms ' +
      'flank the ship at waist height, articulated service arms and umbilical hoses reach from the ' +
      'gantries to the opened hull, cable spools and welding equipment on the apron, ' +
      `${ORIENTATION}`,
  },
  c2: {
    seed: 240238,
    note: 'heavy clamp arms + overhead travelling crane, module swap',
    body:
      `${SHARED_REFIT}, four heavy hydraulic clamp arms rise from the apron and grip the mid-size grey ` +
      'ship hull, a navy-blue overhead travelling crane spans the cradle on side rails and lowers a ' +
      'replacement module toward an open hull bay, stepped work platforms with yellow railings run ' +
      'along both flanks of the ship, supply conduits coil across the apron, ' +
      `${ORIENTATION}`,
  },
  c3: {
    seed: 240377,
    note: 'skeletal scaffold cradle, ship partly stripped to frame',
    body:
      `${SHARED_REFIT}, an open skeletal navy-blue steel scaffold cradle wraps the lower half of a ` +
      'mid-size grey ship hull whose midsection is stripped back to bare structural ribs, ' +
      'multi-level catwalks with yellow railings surround the exposed frame, ' +
      'boom arms and a small jib crane lean in over the open section, ' +
      'toolboxes, gas bottles and removed hull panels laid out on the apron, ' +
      `${ORIENTATION}`,
  },
  // ── Round 2 (Versuch 2): family palette of c2 + open cradle of c3 + strict bow ──
  c4: {
    seed: 240412,
    note: 'R2 — open U-clamp cradle, twin flank catwalks, strict bow upper-right',
    body:
      `${SHARED_REFIT}, a mid-size grey spaceship hull rests in four open U-shaped navy-blue support ` +
      'clamps that grip it from below, two railed navy-blue work catwalks on stilts run along both ' +
      'flanks of the hull at mid height, articulated service arms and umbilical hoses reach from the ' +
      'catwalks to an opened hull panel, removed hull plates stacked on the apron, ' +
      `${OPENNESS}, ${ORIENTATION_STRICT}`,
  },
  c5: {
    seed: 240547,
    note: 'R2 — low gantry arch over open cradle, module being lowered, strict bow',
    body:
      `${SHARED_REFIT}, a mid-size grey spaceship hull sits in an open navy-blue keel cradle, ` +
      'a single low navy-blue gantry arch straddles the hull on side rails and lowers a replacement ' +
      'module into an opened hull bay, railed stair towers at the corners of the apron, ' +
      'cable spools, gas bottles and removed hull plates laid out on the concrete, ' +
      `${OPENNESS}, ${ORIENTATION_STRICT}`,
  },
  c6: {
    seed: 240683,
    note: 'R2 — scaffold cradle, midsection stripped to ribs, strict bow',
    body:
      `${SHARED_REFIT}, a mid-size grey spaceship hull rests in an open navy-blue scaffold cradle, ` +
      'its midsection stripped back to bare structural ribs so the empty module bays are visible, ' +
      'multi-level catwalks with yellow railings stand along both flanks of the exposed frame, ' +
      'a small jib crane and boom arms lean in over the open section from the side, ' +
      `${OPENNESS}, ${ORIENTATION_STRICT}`,
  },
};

// ── HTTP helpers (convention from regenerate-dock-large.ts) ──
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
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const dl = (u) => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) { dl(res.headers.location); return; }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    };
    dl(url);
  });
}

async function generateImage(prompt, seed) {
  const submitRaw = await httpsRequest({
    hostname: 'queue.fal.run', path: '/fal-ai/flux/dev', method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
  }, JSON.stringify({
    prompt, negative_prompt: NEG,
    image_size: { width: 512, height: 512 }, num_inference_steps: 28,
    guidance_scale: 7.5, num_images: 1, enable_safety_checker: false,
    output_format: 'png', seed,
  }));
  const submit = JSON.parse(submitRaw);
  if (!submit.status_url) throw new Error(`Submit failed: ${submitRaw.slice(0, 300)}`);
  process.stdout.write('    waiting');
  for (let i = 0; i < 120; i++) {
    await sleep(2000);
    const status = JSON.parse(await httpsGet(submit.status_url, { Authorization: `Key ${FAL_API_KEY}` }));
    if (status.status === 'COMPLETED') {
      const result = JSON.parse(await httpsGet(submit.response_url, { Authorization: `Key ${FAL_API_KEY}` }));
      process.stdout.write(' done\n');
      return downloadBuffer(result.images[0].url);
    }
    if (status.status === 'FAILED') throw new Error(`Generation failed: ${JSON.stringify(status).slice(0, 300)}`);
    process.stdout.write('.');
  }
  throw new Error('Timeout waiting for generation');
}

async function uploadToFal(buffer, fileName) {
  const initRaw = await httpsRequest({
    hostname: 'rest.alpha.fal.ai', path: '/storage/upload/initiate', method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
  }, JSON.stringify({ content_type: 'image/png', file_name: fileName }));
  const init = JSON.parse(initRaw);
  const u = new URL(init.upload_url);
  await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'PUT',
      headers: { 'Content-Type': 'image/png', 'Content-Length': buffer.length.toString() },
    }, (res) => { res.on('data', () => {}); res.on('end', () => resolve()); });
    req.on('error', reject); req.write(buffer); req.end();
  });
  return init.file_url;
}

async function removeBackground(imageUrl) {
  const raw = await httpsRequest({
    hostname: 'fal.run', path: '/fal-ai/birefnet/v2', method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
  }, JSON.stringify({ image_url: imageUrl }));
  const result = JSON.parse(raw);
  if (!result?.image?.url) throw new Error(`BG removal failed: ${raw.slice(0, 300)}`);
  return downloadBuffer(result.image.url);
}

/** Tight crop then pad to a centered 1:1 square. No resize — family is ~477-508px. */
async function cropAndSquare(noBgBuf, tag) {
  const cropped = await sharp(noBgBuf).trim().png().toBuffer();
  fs.writeFileSync(path.join(DIR_CROP, `module_refit_dock_${tag}_cropped.png`), cropped);
  const meta = await sharp(cropped).metadata();
  const w = meta.width ?? 1, h = meta.height ?? 1;
  const size = Math.max(w, h);
  const padLeft = Math.floor((size - w) / 2);
  const padTop = Math.floor((size - h) / 2);
  const squared = await sharp(cropped).extend({
    top: padTop, bottom: size - h - padTop, left: padLeft, right: size - w - padLeft,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).png().toBuffer();
  return { squared, cropW: w, cropH: h, size };
}

async function runOne(tag, cfg, outFile) {
  const prompt = `${BASE_STYLE}, ${cfg.body}`;
  console.log(`\n[gen] refit_dock ${tag} (seed ${cfg.seed}) — ${cfg.note}`);
  const raw = await generateImage(prompt, cfg.seed);
  fs.writeFileSync(path.join(DIR_RAW, `module_refit_dock_${tag}_raw.png`), raw);

  process.stdout.write('    bg removal');
  const falUrl = await uploadToFal(raw, `module_refit_dock_${tag}.png`);
  const noBg = await removeBackground(falUrl);
  fs.writeFileSync(path.join(DIR_NOBG, `module_refit_dock_${tag}_nobg.png`), noBg);
  console.log(' done');

  const { squared, cropW, cropH, size } = await cropAndSquare(noBg, tag);
  fs.writeFileSync(outFile, squared);
  // half-size preview next to it (style-test convention)
  const half = outFile.replace(/\.png$/, '_half.png');
  await sharp(squared).resize(Math.round(size / 2), Math.round(size / 2)).png().toFile(half);
  console.log(`    crop ${cropW}x${cropH} -> square ${size}x${size}`);
  console.log(`    [save] ${path.relative(ROOT, outFile)}`);
  return { tag, seed: cfg.seed, size, prompt };
}

(async () => {
  for (const d of [DIR_RAW, DIR_NOBG, DIR_CROP, DIR_FINAL, DIR_ST]) fs.mkdirSync(d, { recursive: true });
  const mode = (process.argv[2] || 'candidates').toLowerCase();
  const results = [];

  // Dump every prompt verbatim without touching the API (documentation mode).
  if (mode === 'prompts') {
    const all = Object.entries(CANDIDATES).map(([tag, cfg]) => ({
      tag, seed: cfg.seed, note: cfg.note, prompt: `${BASE_STYLE}, ${cfg.body}`,
    }));
    const out = path.join(DIR_ST, 'refit_dock_prompts.json');
    fs.writeFileSync(out, JSON.stringify({
      module: 'REFIT_DOCK', model: 'fal-ai/flux/dev', imageSize: '512x512',
      steps: 28, guidanceScale: 7.5, chosen: 'c4',
      baseStyle: BASE_STYLE, orientation: ORIENTATION,
      orientationStrict: ORIENTATION_STRICT, openness: OPENNESS,
      sharedRefit: SHARED_REFIT, negativePrompt: NEG, candidates: all,
    }, null, 2));
    console.log(`[save] ${path.relative(ROOT, out)} (${all.length} prompts)`);
    return;
  }

  if (mode === 'candidates') {
    const only = process.argv[3];
    const seedOverride = process.argv[4] ? parseInt(process.argv[4], 10) : null;
    for (const [tag, cfg] of Object.entries(CANDIDATES)) {
      if (only && only !== tag) continue;
      const eff = seedOverride != null ? { ...cfg, seed: seedOverride } : cfg;
      try { results.push(await runOne(tag, eff, path.join(DIR_ST, `refit_dock_${tag}.png`))); }
      catch (e) { console.error(`ERR ${tag}: ${e.message}`); }
    }
  } else if (mode === 'final') {
    const tag = process.argv[3];
    const cfg = CANDIDATES[tag];
    if (!cfg) { console.error(`Unknown candidate "${tag}" (${Object.keys(CANDIDATES).join(', ')})`); process.exit(1); }
    // Re-run the exact same seed+prompt -> deterministic, same image, into assets/final.
    results.push(await runOne(tag, cfg, path.join(DIR_FINAL, 'refit_dock_0.png')));
  } else {
    console.error('mode must be "candidates" or "final"'); process.exit(1);
  }

  fs.writeFileSync(
    path.join(ROOT, 'assets', 'style-test', 'modules', 'refit_dock_prompts.json'),
    JSON.stringify({ baseStyle: BASE_STYLE, orientation: ORIENTATION, negative: NEG, results }, null, 2),
  );
  console.log('\ndone');
})();
