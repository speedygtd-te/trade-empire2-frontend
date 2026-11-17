/**
 * Asset-Pipeline: miniaturization "custom_module" iso sprites (levels 2-5).
 * Complexity escalates L2 -> L5. One shared sprite per level.
 *
 * Full pipeline in one pass (per CLAUDE.md Phase 2b):
 *   flux/dev @512x512  ->  raw PNG (assets/raw)
 *   birefnet/v2 bg removal -> nobg PNG (assets/nobg)
 *   sharp trim -> cropped PNG (assets/cropped, tight crop)
 *   pad to 1:1 square + resize 512x512 -> final PNG (assets/final)
 *
 * Output size 512x512: existing placed-module sprites (src/assets/modules/*)
 * are square ~490-508px (trim+pad-to-square). Square family => 512x512.
 *
 * NO integration into src/, NO cap sync, NO commit.
 *
 * Usage:
 *   node scripts/generate-custom-modules.cjs                 # all 4 levels
 *   node scripts/generate-custom-modules.cjs l3              # only l3
 *   node scripts/generate-custom-modules.cjs l3 778812       # only l3, seed override (retry)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');

// ── load fal key from scripts/.env ──
try {
  const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const FAL_API_KEY = process.env.FAL_API_KEY || process.env.FAL_AI_API_KEY;
if (!FAL_API_KEY) { console.error('No fal key in scripts/.env'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const DIR_RAW = path.join(ROOT, 'assets', 'raw');
const DIR_NOBG = path.join(ROOT, 'assets', 'nobg');
const DIR_CROP = path.join(ROOT, 'assets', 'cropped');
const DIR_FINAL = path.join(ROOT, 'assets', 'final');
const FINAL_SIZE = 512;

// Shared style anchor — identical in every prompt for series consistency.
const SHARED_ANCHOR =
  'isometric 2.5D perspective, sci-fi miniaturization module, compact dark brushed-metal housing, ' +
  'teal/cyan accent glow, lit from upper left, isolated object, no background, single game asset, ' +
  'matching a dark gritty industrial sci-fi factory aesthetic';

const NEGATIVE_PROMPT =
  'cartoon, anime, fantasy, magical runes, glyphs, text, logos, watermark, background, scene, ' +
  'landscape, ground plane, floor, walls, enclosure, human figures, multiple separate objects, shadow, ' +
  'pyramid, pyramidal, wedge, trapezoid, tapering toward the bottom, narrow base, base narrower than top, ' +
  'cone, inverted, top-heavy';

// Shared perspective/form cue — forces a correct isometric solid whose base is
// as wide as (or wider than) the top, fixing the downward-taper defect on L2/L4/L5.
const FORM_CUE =
  'true isometric perspective, object sits flat on the ground plane, base footprint as wide as the top, ' +
  'straight vertical or outward-sloping sides, NOT tapering toward the bottom, NOT pyramidal, NOT a wedge, ' +
  'solid cuboid stance';

// per-level complexity additions (rises L2 -> L5)
const LEVELS = {
  l2: {
    seed: 220104,
    add: 'simple minimal apparatus: a single laser emitter and a few glass lenses, clean and uncluttered, ' +
      FORM_CUE,
  },
  l3: {
    seed: 330207,
    add: 'moderately complex: several prisms and lenses plus one small holographic display, more internal detail',
  },
  l4: {
    seed: 440311,
    add: 'complex: a mirror array, multiple laser emitters and several displays, densely packed technical components, ' +
      'all contained within a compact CUBIC housing, roughly square silhouette, equal width height and depth, ' +
      'boxy self-contained cube chassis, not wide, not flat, not elongated, not a low crate, ' +
      FORM_CUE,
  },
  l5: {
    seed: 550419,
    add: 'highly complex intricate apparatus: a dense field of prisms, mirrors and lasers with multiple ' +
      'holographic displays and nested precision optics, maximum detail, ' +
      FORM_CUE,
  },
};

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
  const fullPrompt = `${SHARED_ANCHOR}, ${prompt}`;
  const submitBody = JSON.stringify({
    prompt: fullPrompt, negative_prompt: NEGATIVE_PROMPT,
    image_size: { width: 512, height: 512 }, num_inference_steps: 28,
    guidance_scale: 7.5, num_images: 1, enable_safety_checker: false,
    output_format: 'png', seed,
  });
  const submitRaw = await httpsRequest({
    hostname: 'queue.fal.run', path: '/fal-ai/flux/dev', method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
  }, submitBody);
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
    if (status.status === 'FAILED') throw new Error(`Generation failed: ${JSON.stringify(status)}`);
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
  const uploadUrl = new URL(init.upload_url);
  await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: uploadUrl.hostname, path: uploadUrl.pathname + uploadUrl.search, method: 'PUT',
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
  if (!result?.image?.url) throw new Error(`Background removal failed: ${raw.slice(0, 300)}`);
  return downloadBuffer(result.image.url);
}

async function runLevel(levelId, cfg) {
  const name = `custom_module_${levelId}`;
  console.log(`[gen] ${name} (seed ${cfg.seed})`);
  console.log(`  prompt add: ${cfg.add}`);

  // 1. generate raw
  const raw = await generateImage(cfg.add, cfg.seed);
  fs.writeFileSync(path.join(DIR_RAW, `${name}_raw.png`), raw);

  // 2. background removal
  const falUrl = await uploadToFal(raw, `${name}_raw.png`);
  const noBg = await removeBackground(falUrl);
  fs.writeFileSync(path.join(DIR_NOBG, `${name}_nobg.png`), noBg);

  // 3. tight crop (trim transparent border)
  const cropped = await sharp(noBg).trim().png().toBuffer();
  fs.writeFileSync(path.join(DIR_CROP, `${name}_cropped.png`), cropped);

  // 4. pad to square (keep aspect) then resize to FINAL_SIZE
  const meta = await sharp(cropped).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;
  const size = Math.max(width, height);
  const padLeft = Math.floor((size - width) / 2);
  const padTop = Math.floor((size - height) / 2);
  const squared = await sharp(cropped).extend({
    top: padTop, bottom: size - height - padTop, left: padLeft, right: size - width - padLeft,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).png().toBuffer();
  const final = await sharp(squared)
    .resize(FINAL_SIZE, FINAL_SIZE, { fit: 'fill' })
    .png().toBuffer();
  const finalPath = path.join(DIR_FINAL, `${name}.png`);
  fs.writeFileSync(finalPath, final);
  const fm = await sharp(final).metadata();
  console.log(`  [save] ${finalPath} (${fm.width}x${fm.height}, alpha=${fm.hasAlpha})`);
}

(async () => {
  for (const d of [DIR_RAW, DIR_NOBG, DIR_CROP, DIR_FINAL]) fs.mkdirSync(d, { recursive: true });
  const only = (process.argv[2] || '').toLowerCase();
  const seedOverride = process.argv[3] ? parseInt(process.argv[3], 10) : null;
  for (const [levelId, cfg] of Object.entries(LEVELS)) {
    if (only && only !== levelId) continue;
    const eff = seedOverride != null ? { ...cfg, seed: seedOverride } : cfg;
    try { await runLevel(levelId, eff); }
    catch (e) { console.error(`ERR ${levelId}: ${e.message}`); }
  }
  console.log('done');
})();
