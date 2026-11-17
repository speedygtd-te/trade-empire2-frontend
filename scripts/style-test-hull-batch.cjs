/**
 * STYLE-TEST BATCH (Rudi nimmt per HTML ab — KEINE Integration).
 *
 * Multi-image hull restyle for all 8 hull types, validated approach from
 * scripts/style-test-hull-from-floor.cjs (multi / kontext/max/multi).
 *
 * Per type:
 *   image_urls = [ existing hull src/assets/hulls/<t>/<t>_0.webp (as png),
 *                  floor square of the type ]
 *   prompt = base rebuild instruction + per-type accent
 *   -> birefnet bg-remove -> tight-crop -> scale into the ORIGINAL hull's
 *      bounding box at the same offset inside a 512x512 canvas (drop-in match).
 *
 * Output: assets/style-test/hull-batch/hull_<t>.png  (+ _half.png for HTML)
 * NO src/ writes. NO cap sync. NO git.
 *
 * Usage:
 *   node scripts/style-test-hull-batch.cjs [type|all] [attemptSeedOffset]
 *   e.g. node scripts/style-test-hull-batch.cjs all
 *        node scripts/style-test-hull-batch.cjs reinforced 1   (retry, new seed)
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

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'style-test', 'hull-batch');
const RAW = path.join(ROOT, 'assets', 'raw');
const HULLS = path.join(ROOT, 'src', 'assets', 'hulls');

// ---------------------------------------------------------------------------
// ROUND 2 (Rudi): UNIFIED GEOMETRY BASES.
//   Box-types (starter, reinforced, airtight, pressurized) all inherit the
//     SAME cube geometry (doors etc.) from the OLD accepted standard hull
//     sprite: src/assets/hulls/standard/standard_0.webp.
//   Platform-types (platform_space, platform_underwater) inherit the open
//     railing-platform geometry from the NEW accepted platform_outdoor:
//     assets/style-test/hull-batch/hull_platform_outdoor.png.
//   NOT regenerated: standard, platform_outdoor (already accepted).
// The first image_url = the geometry base; second = the type's floor square.
// Footprint-fit target = the same geometry base's bbox.
// ---------------------------------------------------------------------------
const STANDARD_BASE = path.join(HULLS, 'standard', 'standard_0.webp');
const PLATFORM_BASE = path.join(OUT, 'hull_platform_outdoor.png');
const PLATFORM_TYPES = new Set(['platform_space', 'platform_underwater']);

// geometry base sprite path per (regenerated) type
const GEOM_BASE = (t) => (PLATFORM_TYPES.has(t) ? PLATFORM_BASE : STANDARD_BASE);

// floor square partner per type (standard has no _edit_square; reinforced_edit = octagon)
const FLOOR = (t) =>
  t === 'standard'
    ? path.join(RAW, 'floor_hero_standard_square.png')
    : path.join(RAW, `floor_hero_${t}_edit_square.png`);

const ACCENT = {
  standard: 'with cyan glowing edge lines',
  starter: 'with a rusty, weathered, scratched finish',
  reinforced: 'heavily armored and reinforced, with copper-toned metal accents',
  airtight: 'with rubber gasket seal seams running along all panel edges',
  pressurized: 'with navy-blue steel reinforcement beam elements across the faces',
  platform_outdoor: 'weathered, with perforated metal grating elements',
  platform_space: 'void-black, with faint starlight glints across the surface',
  platform_underwater: 'with teal accents and a wet, glistening look',
};

// BOX base: cube geometry inherited from the old standard hull (doors etc.)
const BASE =
  "Rebuild this cubic box structure's exterior surfaces using the panel " +
  'material and design language from the second image. Keep the exact cubic ' +
  'box geometry, the door placements, the silhouette and the proportions of ' +
  'the first image. Isolated single object on a plain flat neutral grey ' +
  'background. No yellow.';

// PLATFORM base: open railing-platform geometry inherited from platform_outdoor
const BASE_PLATFORM =
  'Rebuild this flat open platform / deck structure using the panel material ' +
  'and design language from the second image. Keep the exact flat open ' +
  'platform geometry of the first image: a low square deck with safety ' +
  'railings around the open top surface and a chunky machinery base ' +
  'underneath. Do NOT turn it into a closed box - it must stay an open flat ' +
  'platform with railings. Isolated single object on a plain flat neutral ' +
  'grey background. No yellow.';

// EXPLICIT perspective + camera lock (Rudi geo-retry: pressurized was
// compressed, starter was rotated). Appended to the targeted retry prompts.
const CAMERA =
  'isometric three-quarter view, camera at 45 degree azimuth and ' +
  'approximately 30 degree elevation, EXACTLY matching the perspective, ' +
  'orientation and proportions of the first image - front-left and ' +
  'front-right facades at equal symmetric angles, no rotation, not tilted, ' +
  'not compressed, preserve the exact aspect ratio and cube proportions of ' +
  'the first image.';

// Per-type full prompt overrides (used when the generic BASE under-transfers
// material or loses geometry). Keyed by type.
const PROMPT_OVERRIDE = {
  // GEO-RETRY (Rudi): pressurized = vertically compressed at generation.
  // Lock camera + cube proportions explicitly.
  pressurized:
    "Rebuild this cubic box structure's exterior surfaces using the panel " +
    'material and design language from the second image. Keep the exact cubic ' +
    'box geometry, the door placements, the silhouette and the proportions of ' +
    'the first image. Make the structure with navy-blue steel reinforcement ' +
    'beam elements across the faces and copper-toned bolt accents. ' +
    CAMERA +
    ' Isolated single object on a plain flat neutral grey background. No yellow.',
  // GEO-RETRY (Rudi): starter = rotated at generation. Lock orientation.
  starter:
    "Rebuild this cubic box structure's exterior surfaces using the panel " +
    'material and design language from the second image. Keep the exact cubic ' +
    'box geometry, the door placements, the silhouette and the proportions of ' +
    'the first image. Give the structure a rusty, weathered, scratched, ' +
    'corroded metal finish. ' +
    CAMERA +
    ' Isolated single object on a plain flat neutral grey background. No yellow.',
  // BOX types (cube geometry from old standard hull) ---------------------
  // DETAIL-RETRY (Rudi: "zu langweilig"): keep dark graphite + copper accents,
  // ADD bolted-on external armor plates with prominent chunky rivets.
  reinforced:
    "Rebuild this cubic box structure's exterior surfaces using the dark " +
    'armored panel material and octagonal panel framing from the second image. ' +
    'Keep the exact cubic box geometry, the door placements and the ' +
    'proportions of the first image, but REMOVE all yellow and orange hazard ' +
    'stripes. Make it heavily armored and reinforced with subtle copper-toned ' +
    'metal accents only. IMPORTANT new detail that MUST be clearly visible: ' +
    'cover the side facades with large additional external armor plates ' +
    'BOLTED ON top of the existing panels, thick layered overlapping plating ' +
    'casting visible shadow edges, and a dense grid of big prominent chunky ' +
    'round rivets and hex bolts along every plate edge - heavy fortified ' +
    'battle-armor appearance, the bolted plates and rivets must be an ' +
    'obvious dominant surface feature. ' +
    CAMERA +
    ' Isolated single object on a plain flat neutral grey background. No ' +
    'yellow, no orange hazard stripes.',
  // DETAIL-RETRY (Rudi: "zu langweilig"): keep VERY DARK look + gasket seams +
  // green accents, ADD small sealed porthole windows with glowing interior.
  airtight:
    "Repaint ALL exterior surfaces of this cubic box structure in VERY DARK " +
    "near-black graphite panels exactly like the second image's material - " +
    'dark charcoal colour mandatory, NOT light grey, NOT white. Keep the exact ' +
    'cubic box geometry, the door placements, the silhouette and the ' +
    'proportions of the first image. Add rubber gasket seal seams running ' +
    'along all panel edges and around the doors (airtight pressure-door look). ' +
    'Add small green accent lights. IMPORTANT new detail that MUST be clearly ' +
    'visible: place several small round sealed porthole windows with thick ' +
    'raised rounded metal frames on the side facades, the glass clearly ' +
    'showing a faint warm glowing interior light from inside - the glowing ' +
    'portholes must be an obvious distinct feature on the dark facades, like ' +
    'lit windows on a submarine. ' +
    CAMERA +
    ' Isolated single object on a plain flat neutral grey background. No yellow.',
  // PLATFORM types (open railing platform from platform_outdoor) ---------
  platform_space:
    'Rebuild this flat open platform / deck structure using the VERY DARK ' +
    "void-black panel material from the second image. Repaint the entire deck " +
    'surface and railings in near-black void-black metal, with faint cool ' +
    'starlight glints scattered across the surface. Keep the exact flat open ' +
    'platform geometry of the first image: a low square deck with safety ' +
    'railings around the open top surface and a chunky machinery base ' +
    'underneath. Do NOT turn it into a closed box - it must stay an open flat ' +
    'platform with railings. Isolated single object on a plain flat neutral ' +
    'grey background. No yellow, no coloured markings.',
  platform_underwater:
    'Rebuild this flat open platform / deck structure using the dark graphite ' +
    "panel material with glowing teal accent lines from the second image. " +
    'Repaint the deck and railings in dark near-black graphite metal with ' +
    'glowing teal accent strips, and give all surfaces a wet, glistening, ' +
    'water-slicked look. Keep the exact flat open platform geometry of the ' +
    'first image: a low square deck with safety railings around the open top ' +
    'surface and a chunky machinery base underneath. Do NOT turn it into a ' +
    'closed box - it must stay an open flat platform with railings. Isolated ' +
    'single object on a plain flat neutral grey background. No yellow.',
};

const SEEDS = {
  standard: 770001, starter: 771001, reinforced: 772001, airtight: 773001,
  pressurized: 774001, platform_outdoor: 775001, platform_space: 776001,
  platform_underwater: 777001,
};

function dataUri(buf) { return `data:image/png;base64,${buf.toString('base64')}`; }
function fetchJson(model, body) {
  return new Promise((resolve, reject) => {
    const u = new URL('https://fal.run/' + model);
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { Authorization: `Key ${FAL_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      const c = [];
      res.on('data', (d) => c.push(d));
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
  if (!url) throw new Error('no bg url: ' + JSON.stringify(r).slice(0, 200));
  return download(url);
}

// tight crop on alpha
async function tightCrop(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * C + 3] > 16) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) throw new Error('fully transparent after bg-remove');
  return sharp(buf).extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }).png().toBuffer();
}

// measure the GEOMETRY BASE bbox to place the new sprite into the same footprint
async function origBox(t) {
  const { data, info } = await sharp(GEOM_BASE(t)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * C + 3] > 16) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  return { W, H, minX, minY, bw: maxX - minX + 1, bh: maxY - minY + 1 };
}

// fit cropped sprite into a WxH canvas matching the original bbox+offset
async function fitToOriginal(croppedBuf, t) {
  const o = await origBox(t);
  const meta = await sharp(croppedBuf).metadata();
  const scale = Math.min(o.bw / meta.width, o.bh / meta.height);
  const nw = Math.max(1, Math.round(meta.width * scale));
  const nh = Math.max(1, Math.round(meta.height * scale));
  const resized = await sharp(croppedBuf).resize(nw, nh, { fit: 'fill' }).png().toBuffer();
  // center inside the original bbox, then place bbox at original offset
  const left = o.minX + Math.round((o.bw - nw) / 2);
  const top = o.minY + Math.round((o.bh - nh) / 2);
  return sharp({ create: { width: o.W, height: o.H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, left, top }])
    .png().toBuffer();
}

async function genType(t, seedOffset) {
  const floorPath = FLOOR(t);
  if (!fs.existsSync(floorPath)) throw new Error('missing floor: ' + floorPath);
  const basePath = GEOM_BASE(t);
  if (!fs.existsSync(basePath)) throw new Error('missing geometry base: ' + basePath);
  const hullBuf = await sharp(fs.readFileSync(basePath)).png().toBuffer();
  const floorBuf = await sharp(fs.readFileSync(floorPath)).png().toBuffer();
  const baseTmpl = PLATFORM_TYPES.has(t) ? BASE_PLATFORM : BASE;
  const prompt = PROMPT_OVERRIDE[t] || baseTmpl.replace('No yellow.', `Make the structure ${ACCENT[t]}. No yellow.`);
  const seed = SEEDS[t] + (seedOffset || 0) * 137;
  const r = await fetchJson('fal-ai/flux-pro/kontext/max/multi', {
    prompt, image_urls: [dataUri(hullBuf), dataUri(floorBuf)],
    seed, guidance_scale: 3.5, num_images: 1, safety_tolerance: '5', output_format: 'png',
  });
  const genRaw = await download(r.images[0].url);
  const nobg = await removeBg(genRaw);
  const cropped = await tightCrop(nobg);
  const fitted = await fitToOriginal(cropped, t);
  fs.mkdirSync(OUT, { recursive: true });
  const full = path.join(OUT, `hull_${t}.png`);
  fs.writeFileSync(full, fitted);
  const half = path.join(OUT, `hull_${t}_half.png`);
  fs.writeFileSync(half, await sharp(fitted).resize(256, 256).png().toBuffer());
  // also keep the pre-fit raw gen for debugging
  fs.writeFileSync(path.join(OUT, `hull_${t}_gen.png`), genRaw);
  console.log(`[done] ${t}  seed=${seed}  -> ${path.basename(full)} + _half`);
}

(async () => {
  const arg = (process.argv[2] || 'all').toLowerCase();
  const seedOffset = parseInt(process.argv[3] || '0', 10);
  // ROUND 2: only the 6 regenerated types. standard + platform_outdoor are
  // already accepted and are used as geometry bases, not regenerated.
  const all = ['starter', 'reinforced', 'airtight', 'pressurized', 'platform_space', 'platform_underwater'];
  const list = arg === 'all' ? all : [arg];
  for (const t of list) {
    try { console.log(`[gen] ${t} ...`); await genType(t, seedOffset); }
    catch (e) { console.error(`ERR ${t}: ${e.message}`); }
  }
  console.log('batch done');
})();
