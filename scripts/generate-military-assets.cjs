/**
 * Asset-Pipeline: military combat data-layer assets (CLAUDE.md Phase 2b).
 *
 *   9 module sprites   -> src/assets/modules/<name>/<name>_0.webp + @half/@quarter/@eighth
 *   5 resource icons   -> src/assets/resources/<name>/<name>_0.webp   (single file, no mips)
 *
 * Style is derived from the existing industrial module/resource sets
 * (see scripts/regenerate-37-modules.ts + scripts/generate-resource-assets.ts):
 * navy-blue painted steel, muted yellow safety trim, weathered surfaces,
 * The Expanse hard sci-fi, 2:1 isometric, lit from upper left.
 * Military content, identical material world -- it must blend in, not stand out.
 *
 * NO negative prompts (they reproduce the unwanted thing) -- every constraint is
 * phrased as a positive replacement instruction.
 *
 * Pipeline per asset:
 *   flux/dev              -> assets/raw/<name>_raw.png
 *   birefnet/v2 (bg)      -> assets/nobg/<name>_nobg.png
 *   sharp trim            -> assets/cropped/<name>_cropped.png   (tight crop, alpha>0)
 *   pad square + resize   -> assets/final/<name>_0.png           (512x512 RGBA)
 *
 * Usage:
 *   node scripts/generate-military-assets.cjs                 # generate all 14
 *   node scripts/generate-military-assets.cjs autocannon      # one or more by name
 *   node scripts/generate-military-assets.cjs autocannon --seed 4711   # retry w/ new seed
 *   node scripts/generate-military-assets.cjs --variant 1     # alt prompt variant (0..2)
 *   node scripts/generate-military-assets.cjs --validate      # dimension/alpha/crop check
 *   node scripts/generate-military-assets.cjs --integrate     # assets/final -> src/assets
 *   node scripts/generate-military-assets.cjs --sheets        # review contact sheets
 *
 * NO cap sync, NO commit, NO app code.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');

// ── fal key from scripts/.env (never hardcoded, never committed) ──
try {
  const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const FAL_API_KEY = process.env.FAL_API_KEY || process.env.FAL_AI_API_KEY;

const ROOT = path.join(__dirname, '..');
const DIR_RAW = path.join(ROOT, 'assets', 'raw');
const DIR_NOBG = path.join(ROOT, 'assets', 'nobg');
const DIR_CROP = path.join(ROOT, 'assets', 'cropped');
const DIR_FINAL = path.join(ROOT, 'assets', 'final');
const DIR_SHEET = path.join(ROOT, 'assets', 'style-test', 'military');
const FINAL_SIZE = 512;
const GEN_SIZE = 1024;

// ── shared style anchors ─────────────────────────────────────────────────────

/** Canonical module look, copied from the industrial set. */
const MODULE_STYLE =
  'isometric game asset, isometric 2.5D perspective, 30 degree camera angle from horizontal, ' +
  '2:1 isometric perspective, The Expanse hard sci-fi aesthetic, ' +
  'navy-blue painted steel with muted yellow safety trim, weathered metal surfaces, ' +
  'photorealistic textures, scratched paint, grime and oil residue, ' +
  'lit from upper left, soft top-left key light, no background, isolated object, ' +
  'game sprite, centered, single object, no ground plane, no shadow';

/** Every module in the set sits on its own square bolted deck plate. */
const MOUNT_SUFFIX =
  ', the equipment is bolted onto a square steel deck plate that forms its footprint, ' +
  'bolted edge trim on the plate, free-standing single unit, exposed open machinery, ' +
  'plain utilitarian factory equipment finish identical to the rest of the industrial set, ' +
  'the whole object fits inside a square frame';

/** Canonical resource icon look, copied from the resource set. */
const RESOURCE_STYLE =
  'isometric game icon, single resource item, 30 degree camera angle, 2:1 isometric perspective, ' +
  'The Expanse hard sci-fi aesthetic, photorealistic textures, lit from upper left, ' +
  'transparent background, no background, isolated object, game sprite, centered, single object, ' +
  'no ground plane, no shadow, clean edges';

// ── asset table ──────────────────────────────────────────────────────────────
// `variants` = up to 3 prompt bodies; variant 0 is the production prompt.
// Silhouettes are deliberately spread apart so the families stay readable at 48px:
//   cannons   low twin-barrel  ->  single medium barrel  ->  huge long barrel
//   lasers    small dome       ->  tube + flat radiators ->  long low lance
//   support   hatch grid / radial pylon / flat slab

const ASSETS = [
  // ── A: projectile weapons, ascending calibre ──────────────────────────────
  {
    name: 'autocannon',
    kind: 'module',
    seed: 610101,
    variants: [
      'a small rapid-fire autocannon turret, low flat box-shaped turret housing, two short slim barrels ' +
        'pointing up-left at a shallow angle, a linked ammunition belt feeding from a side hopper, ' +
        'compact and low profile, the smallest gun of the series',
      'a compact twin-barrel autocannon on a low traverse ring, two long slim barrels reaching well out ' +
        'past the edge of the deck plate toward the upper left, ribbed barrel shrouds, a drum magazine and ' +
        'a linked ammunition belt on the right, a small gun cradle, low and wide, the two thin barrels are ' +
        'the dominant feature and stand clear of the housing',
      'light autocannon mount, low armoured gun box with a pair of short barrels and an ammunition belt drum, ' +
        'small elevation actuator, minimal compact machinery',
    ],
  },
  {
    name: 'medium_cannon',
    kind: 'module',
    seed: 620202,
    variants: [
      'a medium calibre cannon turret, a rounded armoured turret housing on a traverse ring, ' +
        'one thick barrel of medium length with a slotted muzzle brake pointing up-left, ' +
        'a side ammunition hoist cabinet, mid-height silhouette, clearly larger than a light autocannon ' +
        'and clearly smaller than a heavy gun',
      'medium ship cannon emplacement, single-barrel gun in a boxy armoured mantlet on a rotating ring, ' +
        'medium-length barrel with muzzle brake, shell hoist and loader cabinet beside it, ' +
        'moderate height, one barrel only',
      'medium calibre gun mount, one thick medium barrel on a mantlet cradle, recoil cylinders, ' +
        'ammunition ready-rack box, mid-sized machinery',
    ],
  },
  {
    name: 'heavy_cannon',
    kind: 'module',
    seed: 630303,
    variants: [
      'a massive heavy siege cannon, one enormous long thick barrel with a heavy recoil sleeve and a ' +
        'large muzzle brake, mounted in a huge armoured cradle on a wide traverse ring, ' +
        'a counterweight block at the rear, hydraulic elevation rams, ' +
        'the gun dominates the whole plate, by far the largest weapon of the series',
      'heavy capital gun emplacement, single gigantic barrel with recoil sleeves stretching across the ' +
        'entire deck plate, massive trunnion cradle, breech block and counterweight, thick hydraulic rams, ' +
        'oversized heavy machinery',
      'oversized heavy artillery mount, one very long very thick cannon barrel on a reinforced ring mount, ' +
        'huge breech housing, elevation hydraulics, dominating bulky weapon',
    ],
  },

  // ── A: energy weapons, compact emitter -> long barrel ─────────────────────
  {
    name: 'pulse_laser',
    kind: 'module',
    seed: 640404,
    variants: [
      'a compact pulse laser emitter turret, a small low hemispherical emitter dome with a cluster of ' +
        'four short stubby lens apertures glowing faint cyan, a capacitor bank cabinet beside it, ' +
        'a stack of cooling fins, no gun barrel at all, small and rounded',
      'a small pulse laser turret on a round traverse ring, the turret head is a smooth rounded ball-shaped ' +
        'housing, its front face carries a cluster of four short thick lens apertures that glow bright cyan, ' +
        'in place of a gun barrel there are only these stubby glowing lenses, a small capacitor cabinet and ' +
        'a stack of cooling fins sit behind the head, small compact rounded turret',
      'compact laser pulse turret, low dome housing studded with short cyan-lit emitter lenses, ' +
        'capacitor block, radiator fins, coiled power cabling, small rounded unit',
    ],
  },
  {
    name: 'beam_laser',
    kind: 'module',
    seed: 650505,
    variants: [
      'a medium continuous-beam laser turret, one medium-length focusing tube with stacked lens rings ' +
        'held in a yoke mount, a flat radiator panel standing on each side of the tube, ' +
        'coolant lines running to the panels, a cyan glow in the front lens, ' +
        'mid-height, distinctly flanked by two flat panels',
      'beam laser emplacement, a single medium focusing barrel with segmented lens collars in a fork mount, ' +
        'two large flat cooling radiator panels flanking it, coolant piping and a pump block, ' +
        'cyan lens glow, moderate size',
      'medium beam laser mount, focusing tube on a yoke between two upright flat radiator fins, ' +
        'lens assembly glowing cyan, coolant manifolds, mid-sized optics weapon',
    ],
  },
  {
    name: 'spinal_laser',
    kind: 'module',
    seed: 660606,
    variants: [
      'a very long spinal laser lance, a slender segmented accelerator barrel lying almost horizontally ' +
        'along the entire length of the deck plate, ringed with evenly spaced focusing collars, ' +
        'a bulky radiator and capacitor stack at the rear end, a bright cyan lens at the far tip, ' +
        'very long and very low, the barrel spans the whole plate',
      'spinal mount laser lance, an extremely elongated low-lying emitter barrel segmented by focusing rings, ' +
        'support cradles along its length, a large radiator and power block at the back, ' +
        'cyan glow at the muzzle lens, long slim horizontal silhouette',
      'long spinal laser weapon, slender lance-like accelerator tube stretching across the deck plate ' +
        'on low support saddles, ring collars, heavy capacitor stack at the rear, cyan tip glow, ' +
        'elongated flat profile',
    ],
  },

  // ── A: missiles ───────────────────────────────────────────────────────────
  {
    name: 'missile_launcher',
    kind: 'module',
    seed: 670707,
    variants: [
      'a vertical launch missile cell block, a rectangular armoured block filled with a grid of ' +
        'square silo hatches seen from above, three hatches standing open showing the conical nose ' +
        'of a missile inside each, the remaining hatches closed and flush, scorch marks on the rims, ' +
        'a flat blocky module made of square cells',
      'vertical launch system module, a flat armoured block with a four by four grid of square launch ' +
        'hatch covers, a few covers hinged open revealing missile tips, blast rims, cable trunking ' +
        'along the side, boxy cell array',
      'missile silo cell bank, rectangular launcher block with an array of square capped launch tubes, ' +
        'two open cells showing loaded missiles, exhaust deflector plates, low grid-patterned box',
    ],
  },

  // ── A: defence ────────────────────────────────────────────────────────────
  {
    name: 'shield_generator',
    kind: 'module',
    seed: 680808,
    variants: [
      'a deflector shield generator installation, a tall central coil pylon wound with heavy conductor ' +
        'rings, four emitter dishes on radial arms pointing outward and upward around it, ' +
        'thick armoured cabling running into capacitor cabinets at the base, ' +
        'a faint cyan glow at the dish centres, tall radial star-shaped silhouette',
      'shield emitter station, central heavy induction coil tower with four dish emitters on arms ' +
        'radiating outward, capacitor cabinets and cable trunks around the base, faint cyan emitter glow, ' +
        'tall symmetrical radial machine',
      'field generator module, a wound coil column with radial emitter dishes on outstretched arms, ' +
        'power capacitor boxes at the foot, heavy cabling, cyan lit dish centres, tall spiky outline',
    ],
  },
  {
    name: 'armor_plating',
    kind: 'module',
    seed: 690909,
    variants: [
      'a flat armour plating segment, thick layered composite armour slabs bolted flush onto the deck, ' +
        'chamfered edges showing the laminated ceramic and steel layers, rows of large hex bolts, ' +
        'weld seams and impact scoring, almost completely flat with no tall parts at all',
      'armour plate section, a low slab of laminated battle plating laid across the deck plate, ' +
        'bevelled edges revealing the composite layers, bolt rows, scuffed paint and dents, ' +
        'entirely flat low-profile segment',
      'a wide flat armour deck segment, thick armour tiles laid down flush like paving over the deck plate, ' +
        'the whole segment is only a hand thick so it reads as a thin sheet seen almost edge-on, ' +
        'chamfered laminate edges, rows of heavy bolt heads, weld seams, dents and impact scoring, ' +
        'nothing rises above the surface, a flat covered floor panel rather than a box or a crate',
    ],
  },

  // ── B: resource icons ─────────────────────────────────────────────────────
  {
    name: 'composite_armor',
    kind: 'resource',
    seed: 710101,
    variants: [
      'a single thick composite armour tile standing at an angle, dark grey ceramic face with a ' +
        'chipped corner exposing the pale ceramic core and the black fibre weave backing layer, ' +
        'bevelled laminated edges, bolt holes at the corners, scuffed and scarred battle plating',
      'a slab of composite battle armour, dark hexagonal ceramic facing plate with visible laminate ' +
        'layers along the bevelled edge, chipped corner showing white ceramic and carbon weave inside, ' +
        'heavy protective panel product',
      'composite armour plate item, thick dark tile with layered ceramic and fibre construction visible ' +
        'at the cut edge, corner impact damage, corner bolt holes, industrial protective material',
    ],
  },
  {
    name: 'weapon_component',
    kind: 'resource',
    seed: 720202,
    variants: [
      'a machined weapon breech mechanism, a gunmetal bolt carrier assembly with a short rifled barrel ' +
        'stub, a coiled recoil spring, a locking lug ring and precision machined surfaces, ' +
        'oil sheen on the steel, a manufactured firearm mechanism part',
      'weapon mechanism component, a precision machined steel breech block with rifled barrel section, ' +
        'recoil spring, extractor claw and mounting lugs, dark gunmetal with light oil film, ' +
        'engineered gun part',
      'gun component assembly, machined breech housing with a stub of rifled barrel and a coil spring, ' +
        'bolt face and locking lugs, blued steel finish, industrial weapon subassembly',
    ],
  },
  {
    name: 'shield_emitter',
    kind: 'resource',
    seed: 730303,
    variants: [
      'a shield emitter head, a conical emitter nozzle wrapped in copper induction windings on a ' +
        'machined mounting collar, a glowing cyan focusing lens set in the centre of the cone, ' +
        'ceramic insulator rings, high-voltage terminal posts, compact field-projector part',
      'field emitter component, a truncated cone projector with copper coil windings and ceramic ' +
        'insulator bands, cyan lit lens core, heavy contact terminals on the base collar, ' +
        'precision high-energy part',
      'deflector emitter unit, conical emitter head with wound copper coils, cyan glowing focus lens, ' +
        'insulator rings and mounting flange, compact energy component',
    ],
  },
  {
    name: 'ammunition',
    kind: 'resource',
    seed: 740404,
    variants: [
      'a group of large brass-cased cannon shells standing upright in a steel ready-rack, ' +
        'pointed dark grey projectile tips, stencilled markings on the cases, ' +
        'a short linked ammunition belt coiled beside the rack, machined brass sheen',
      'cannon ammunition, several tall brass shell casings with dark ogive tips clustered in a metal ' +
        'holder frame, a linked belt of rounds looped at the base, stencilled lot numbers, ' +
        'polished brass and gunmetal',
      'stack of autocannon rounds, upright brass cartridges with grey armour-piercing tips in a wire ' +
        'ready-rack, a coiled linked belt next to them, worn brass with stencil markings',
    ],
  },
  {
    name: 'missile',
    kind: 'resource',
    seed: 750505,
    variants: [
      'a single guided missile lying at an angle, slender dark grey cylindrical body with a conical ' +
        'sensor nose cone, four swept tail fins, a rocket nozzle at the rear, ' +
        'stencilled service markings and a thin band stripe on the body, weathered military ordnance',
      'guided missile item, a slim tapered missile with a pointed seeker nose, mid-body strakes and ' +
        'four rear fins, exposed exhaust nozzle, grey painted casing with stencil lettering, ' +
        'single piece of ordnance',
      'anti-ship missile round, elongated grey missile body with conical nose, folded tail fins and ' +
        'a thruster nozzle, stencilled markings and a coloured band, worn paint, single projectile',
    ],
  },
];

// ── fal.ai helpers ───────────────────────────────────────────────────────────

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
  const body = JSON.stringify({
    prompt,
    image_size: { width: GEN_SIZE, height: GEN_SIZE },
    num_inference_steps: 28,
    guidance_scale: 7.5,
    num_images: 1,
    enable_safety_checker: false,
    output_format: 'png',
    seed,
  });
  const submitRaw = await httpsRequest({
    hostname: 'queue.fal.run', path: '/fal-ai/flux/dev', method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
  }, body);
  const submit = JSON.parse(submitRaw);
  if (!submit.status_url) throw new Error(`Submit failed: ${submitRaw.slice(0, 300)}`);
  process.stdout.write('    waiting');
  for (let i = 0; i < 150; i++) {
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
    }, (res) => { res.on('data', () => {}); res.on('end', resolve); });
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
  if (!result?.image?.url) throw new Error(`Background removal failed: ${raw.slice(0, 300)}`);
  return downloadBuffer(result.image.url);
}

// ── pipeline ─────────────────────────────────────────────────────────────────

function buildPrompt(asset, variantIdx) {
  const body = asset.variants[Math.min(variantIdx, asset.variants.length - 1)];
  return asset.kind === 'module'
    ? `${MODULE_STYLE}, ${body}${MOUNT_SUFFIX}`
    : `${RESOURCE_STYLE}, ${body}`;
}

/** Trim fully-transparent border, pad to square, resize to FINAL_SIZE. */
async function cropPadResize(noBgBuffer, name) {
  const cropped = await sharp(noBgBuffer).trim({ threshold: 1 }).png().toBuffer();
  fs.writeFileSync(path.join(DIR_CROP, `${name}_cropped.png`), cropped);

  const meta = await sharp(cropped).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const size = Math.max(w, h);
  const padLeft = Math.floor((size - w) / 2);
  const padTop = Math.floor((size - h) / 2);
  const squared = await sharp(cropped).extend({
    top: padTop, bottom: size - h - padTop, left: padLeft, right: size - w - padLeft,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).png().toBuffer();
  const final = await sharp(squared)
    .resize(FINAL_SIZE, FINAL_SIZE, { fit: 'fill' })
    .png().toBuffer();
  fs.writeFileSync(path.join(DIR_FINAL, `${name}_0.png`), final);
  return { cropW: w, cropH: h };
}

async function runAsset(asset, variantIdx, seedOverride) {
  const { name } = asset;
  const seed = seedOverride ?? asset.seed;
  const prompt = buildPrompt(asset, variantIdx);
  console.log(`[gen] ${name} (${asset.kind}, seed ${seed}, variant ${variantIdx})`);

  const raw = await generateImage(prompt, seed);
  fs.writeFileSync(path.join(DIR_RAW, `${name}_raw.png`), raw);

  const falUrl = await uploadToFal(raw, `${name}_raw.png`);
  const noBg = await removeBackground(falUrl);
  fs.writeFileSync(path.join(DIR_NOBG, `${name}_nobg.png`), noBg);

  const { cropW, cropH } = await cropPadResize(noBg, name);
  console.log(`  [ok] crop ${cropW}x${cropH} -> final ${FINAL_SIZE}x${FINAL_SIZE}`);
}

// ── validation ───────────────────────────────────────────────────────────────

/** Dimensions, alpha channel, tight crop (opaque pixel on every border row/col). */
async function validate(assets) {
  let allOk = true;
  for (const a of assets) {
    const p = path.join(DIR_FINAL, `${a.name}_0.png`);
    if (!fs.existsSync(p)) { console.log(`FAIL ${a.name}: missing ${p}`); allOk = false; continue; }
    const img = sharp(p);
    const meta = await img.metadata();
    const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    const alphaAt = (x, y) => data[(y * W + x) * C + (C - 1)];
    let minX = W, maxX = -1, minY = H, maxY = -1, opaque = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (alphaAt(x, y) > 8) {
          opaque++;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    const sizeOk = meta.width === FINAL_SIZE && meta.height === FINAL_SIZE;
    const alphaOk = meta.hasAlpha === true;
    // tight crop: content must touch the canvas on the long axis (square pad
    // leaves transparent bands on the short axis by construction)
    const spanX = maxX - minX + 1;
    const spanY = maxY - minY + 1;
    const tightOk = Math.max(spanX, spanY) >= FINAL_SIZE - 4;
    const fill = ((opaque / (W * H)) * 100).toFixed(1);
    const ok = sizeOk && alphaOk && tightOk;
    if (!ok) allOk = false;
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${a.name.padEnd(18)} ${meta.width}x${meta.height} ` +
      `alpha=${meta.hasAlpha} bbox=${spanX}x${spanY} fill=${fill}%` +
      `${sizeOk ? '' : ' [size]'}${alphaOk ? '' : ' [alpha]'}${tightOk ? '' : ' [crop]'}`,
    );
  }
  return allOk;
}

// ── integration into src/assets ──────────────────────────────────────────────

const MIP_LEVELS = [
  { suffix: '', scale: 1 },
  { suffix: '@half', scale: 0.5 },
  { suffix: '@quarter', scale: 0.25 },
  { suffix: '@eighth', scale: 0.125 },
];

/**
 * Modules get the full mip ladder -- spriteCache.getImageWithMip loads @eighth
 * first on a cold start, so a missing mip makes the module invisible at every
 * zoom level (silent no-op, no error). Resources are single-file (no mips).
 */
async function integrate(assets) {
  for (const a of assets) {
    const src = path.join(DIR_FINAL, `${a.name}_0.png`);
    if (!fs.existsSync(src)) { console.error(`Missing ${src}`); process.exitCode = 1; continue; }
    const sub = a.kind === 'module' ? 'modules' : 'resources';
    const outDir = path.join(ROOT, 'src', 'assets', sub, a.name);
    fs.mkdirSync(outDir, { recursive: true });
    const meta = await sharp(src).metadata();
    const levels = a.kind === 'module' ? MIP_LEVELS : [MIP_LEVELS[0]];
    for (const lv of levels) {
      const out = path.join(outDir, `${a.name}_0${lv.suffix}.webp`);
      const nw = Math.max(1, Math.round(meta.width * lv.scale));
      const nh = Math.max(1, Math.round(meta.height * lv.scale));
      await sharp(src).resize(nw, nh, { fit: 'fill' })
        .webp({ quality: 90, effort: 4, smartSubsample: true }).toFile(out);
      console.log(`  ${path.relative(ROOT, out)} (${nw}x${nh})`);
    }
  }
}

// ── review sheets ────────────────────────────────────────────────────────────

async function composeSheet(items, cols, cell, outFile, label) {
  const rows = Math.ceil(items.length / cols);
  const pad = 22; // caption strip under each cell
  const layers = [];
  for (let i = 0; i < items.length; i++) {
    const left = (i % cols) * cell;
    const top = Math.floor(i / cols) * (cell + pad);
    layers.push({ input: items[i].buf, left, top });
    const svg = Buffer.from(
      `<svg width="${cell}" height="${pad}"><text x="${cell / 2}" y="${pad - 6}" ` +
      `font-family="sans-serif" font-size="13" fill="#c8ccd4" text-anchor="middle">${items[i].name}</text></svg>`,
    );
    layers.push({ input: svg, left, top: top + cell });
  }
  await sharp({
    create: {
      width: cols * cell, height: rows * (cell + pad), channels: 4,
      background: { r: 26, g: 28, b: 32, alpha: 1 },
    },
  }).composite(layers).png().toFile(outFile);
  console.log(`  ${label}: ${path.relative(ROOT, outFile)}`);
}

async function sheets() {
  fs.mkdirSync(DIR_SHEET, { recursive: true });
  const mods = ASSETS.filter((a) => a.kind === 'module');
  const res = ASSETS.filter((a) => a.kind === 'resource');
  const load = async (a, size) => ({
    name: a.name,
    buf: await sharp(path.join(DIR_FINAL, `${a.name}_0.png`))
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toBuffer(),
  });

  await composeSheet(await Promise.all(mods.map((a) => load(a, 256))), 3, 256,
    path.join(DIR_SHEET, 'contact_modules.png'), 'modules contact sheet');
  await composeSheet(await Promise.all(res.map((a) => load(a, 256))), 5, 256,
    path.join(DIR_SHEET, 'contact_resources.png'), 'resources contact sheet');

  // Real draw size: renderer paints every module sprite into a fixed 48x48 box
  // (isoConstants.ts) -- this is the sheet that decides if the families read.
  const small = await Promise.all(mods.map((a) => load(a, 48)));
  const zoom = await Promise.all(small.map(async (s) => ({
    name: s.name,
    buf: await sharp(s.buf).resize(192, 192, { kernel: 'nearest' }).png().toBuffer(),
  })));
  await composeSheet(small, 9, 48, path.join(DIR_SHEET, 'gamesize_48.png'), '48x48 game size');
  await composeSheet(zoom, 9, 192, path.join(DIR_SHEET, 'gamesize_48_zoom.png'), '48x48 (4x nearest zoom)');
}

// ── entry point ──────────────────────────────────────────────────────────────

(async () => {
  const argv = process.argv.slice(2);
  const flag = (f) => argv.includes(f);
  const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  const names = argv.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));
  const selected = names.length ? ASSETS.filter((a) => names.includes(a.name)) : ASSETS;
  if (!selected.length) { console.error(`No asset matched: ${names.join(', ')}`); process.exit(1); }

  if (flag('--validate')) { process.exit((await validate(selected)) ? 0 : 1); }
  if (flag('--integrate')) { await integrate(selected); return; }
  if (flag('--sheets')) { await sheets(); return; }

  if (!FAL_API_KEY) { console.error('No FAL_API_KEY in scripts/.env'); process.exit(1); }
  for (const d of [DIR_RAW, DIR_NOBG, DIR_CROP, DIR_FINAL]) fs.mkdirSync(d, { recursive: true });
  const variantIdx = parseInt(opt('--variant') ?? '0', 10);
  const seedOverride = opt('--seed') ? parseInt(opt('--seed'), 10) : null;
  for (const asset of selected) {
    try { await runAsset(asset, variantIdx, seedOverride); }
    catch (e) { console.error(`ERR ${asset.name}: ${e.message}`); process.exitCode = 1; }
  }
  console.log('done');
})();
