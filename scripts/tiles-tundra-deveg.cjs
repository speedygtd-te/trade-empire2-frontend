/**
 * TUNDRA ITERATION 2, STEP 1 OF 2 -- REMOVE THE VEGETATION (form only).
 *
 * STYLE-TEST ONLY. Writes nothing to src/assets/tiles/. No cap sync, no git.
 *
 * WHY THIS RUN EXISTS
 *   `tundra` belongs to ICE and only to ICE (Docs/openapi.yaml:9619 lists it in
 *   the ICE group, not with EARTH_LIKE). It was BUILT in the EARTH_LIKE round as
 *   "karge, spaerlich bewachsene Flaeche" off the plains_dirty_mix captures, so it
 *   ships with grass tufts and moss on it. The ICE family is now being turned into
 *   real icy moons (Ganymede / Callisto -- dusty grey, faint brown cast), and
 *   living plants on an airless icy moon are hard to defend.
 *
 * THE ONE THING THAT MAKES THIS DIFFERENT FROM THE 2026-08-10 ATTEMPT
 *   Back then the requirement was to KEEP the vegetation and only add features,
 *   and kontext failed at it: it regenerates the ground and wipes existing detail
 *   (see project_biome_redesign_progress, "kontext ist NIE echt additiv"). Rudi
 *   rejected it for that reason. Here REMOVAL is the goal, so the failure mode of
 *   the tool is the effect we want. What still has to be watched is collateral:
 *   kontext may also rebuild the ground itself, so every slot is measured and
 *   eyeballed on its own rather than trusted as a batch.
 *
 * PROMPT DISCIPLINE
 *   No negative prompts -- they reproduce the unwanted concept (the sand_dunes
 *   relief lesson). The instruction is a positive REPLACEMENT: the plants become
 *   bare frost-crusted grit and dust. Nothing in the prompt asks for a colour
 *   change; colour is step 2 and is done as a measured local grade, because on
 *   the ocean family the colour came out of the grade and never out of the prompt.
 *
 * SOURCES ARE FROZEN FIRST
 *   assets/style-test/tiles/tundra_iter2/src/tundra_<n>_src.webp is the only input.
 *   src/assets/tiles/tundra/ is never read after the freeze, so this pipeline
 *   cannot eat its own output the way the kelp_forest run did.
 *
 * Output (all under assets/style-test/tiles/tundra_iter2/)
 *   deveg/tundra_<n>_kraw.png      raw kontext return, for judging collateral
 *   deveg/tundra_<n>.webp          512x256, diamond-masked, shipped geometry
 *   deveg/tundra_<n>@eighth.webp   64x32 mip -- the size the map is played at
 *
 * Usage: node scripts/tiles-tundra-deveg.cjs [slot ...]      (default: all four)
 *        re-roll a slot: pass it again, the seed is bumped by +1000
 *        explicit seed:  node scripts/tiles-tundra-deveg.cjs 1=77001
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');
// The solve/re-roll loops rewrite the same paths; on Windows sharp's file cache
// turns the second write into EINVAL.
sharp.cache(false);

try {
  const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const FAL_API_KEY = process.env.FAL_AI_API_KEY || process.env.FAL_API_KEY;
if (!FAL_API_KEY) { console.error('no fal key in scripts/.env'); process.exit(1); }

const ROUND = process.env.ROUND === '2' ? 2 : 1;
const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const WORK = path.join(ROOT, 'assets', 'style-test', 'tiles', 'tundra_iter2');
const SRC = path.join(WORK, 'src');
const OUT = path.join(WORK, ROUND === 2 ? 'deveg2' : 'deveg');
const TILE_W = 512, TILE_H = 256;
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// POSITIVE REPLACEMENT. The plants are not forbidden, they are replaced by a
// named material. Tileability clauses stay positive too (uniform / even), never
// "no patches" / "no hotspot".
//
// ROUND 1 (env ROUND unset) -- a whole-surface replacement instruction. It failed
// in two different ways, and the two ways split exactly along the two distinct
// sources (slots 0/2 are one capture, 1/3 are another; 2 and 3 are their flops):
//   slots 0/2 (dense mossy brown): the tufts were NOT removed, they were FROSTED.
//     Every clump is still there as a white star. Naming "grass tuft" in the
//     instruction handed the model the shape to preserve.
//   slots 1/3 (sparse grey gravel): the tufts went, and so did the whole ground --
//     regenerated into featureless pale plaster, sd 17.9 -> 12.5.
//   both: canvas luma 33 -> ~90, saturation 47% -> 5%. kontext greyed and lifted
//     the tile all by itself, without being asked to.
//
// ROUND 2 (env ROUND=2) -- two corrections, no negatives added:
//   (a) SCOPE the replacement instead of restating the surface ("where a tuft
//       stands, put gravel in its place"), so the instruction points at the thing
//       to remove rather than at the field to re-render.
//   (b) name the ground that must SURVIVE and name the tone, since round 1 proved
//       kontext moves level and chroma unprompted.
const PROMPT_R1 =
  'replace every plant, grass tuft, dry straw and moss patch with bare frost-crusted grit ' +
  'and dust, so the whole surface is uniform frozen stony soil of fine gravel, coarse sand ' +
  'and thin pale frost crust, evenly distributed across the entire tile, even brightness, ' +
  'seamless tileable ground texture, matte, keep the same camera angle and the same diamond shape';
const PROMPT_R2 =
  'keep the existing dark stony soil, the loose gravel and the small dark pebbles exactly as ' +
  'they are, and wherever a plant, a grass tuft, dry straw or a moss patch stands, put that ' +
  'same dark frozen gravel and grit in its place, so the ground becomes one continuous field ' +
  'of bare frozen rubble, keep the original dark matte tone and the original brightness, ' +
  'same camera angle, same diamond shape, seamless tileable ground texture';
const PROMPT = ROUND === 2 ? PROMPT_R2 : PROMPT_R1;

const SLOTS = [
  { slot: 0, seed: 71011 },
  { slot: 1, seed: 71022 },
  { slot: 2, seed: 71033 },
  { slot: 3, seed: 71044 },
];

const DIAMOND = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + TILE_W + '" height="' + TILE_H + '">' +
  '<polygon points="' + TILE_W / 2 + ',0 ' + TILE_W + ',' + TILE_H / 2 + ' ' + TILE_W / 2 + ',' + TILE_H + ' 0,' + TILE_H / 2 + '" fill="white"/></svg>');

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), payload = JSON.stringify(body);
    const req = (u.protocol === 'https:' ? https : http).request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'POST',
      headers: { Authorization: 'Key ' + FAL_API_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      const c = [];
      res.on('data', (d) => c.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(c).toString();
        if (res.statusCode >= 400) return reject(new Error('fal ' + res.statusCode + ': ' + raw.slice(0, 400)));
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('bad json ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject); req.write(payload); req.end();
  });
}
function download(url) {
  return new Promise((resolve, reject) => {
    const go = (u) => (u.startsWith('https') ? https : http).get(u, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) return go(res.headers.location);
      const c = [];
      res.on('data', (d) => c.push(d));
      res.on('end', () => resolve(Buffer.concat(c)));
      res.on('error', reject);
    }).on('error', reject);
    go(url);
  });
}

/** measured on the WRITTEN file: libwebp does not keep RGB under alpha 0 */
async function statsOf(file) {
  const { data, info } = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, N = data.length / ch;
  const s = [0, 0, 0], is = [0, 0, 0], iq = [0, 0, 0];
  let ni = 0, sat = 0;
  for (let i = 0; i < data.length; i += ch) {
    for (let c = 0; c < 3; c++) s[c] += data[i + c];
    if (data[i + 3] >= 8) {
      for (let c = 0; c < 3; c++) { is[c] += data[i + c]; iq[c] += data[i + c] * data[i + c]; }
      const mx = Math.max(data[i], data[i + 1], data[i + 2]), mn = Math.min(data[i], data[i + 1], data[i + 2]);
      if (mx > 0) sat += (mx - mn) / mx;
      ni++;
    }
  }
  const m = s.map((x) => x / N), im = is.map((x) => x / ni);
  const isd = iq.map((x, k) => Math.sqrt(Math.max(0, x / ni - im[k] * im[k])));
  return {
    lum: L709(m[0], m[1], m[2]), rgb: im, br: im[2] / im[0], gr: im[1] / im[0],
    sd: (isd[0] + isd[1] + isd[2]) / 3, sat: sat / ni,
  };
}
/** mean |dL| between 4-neighbours on opaque pixels -- structure that survives */
async function microContrast(file) {
  const { data, info } = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, w = info.width, h = info.height;
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) { L[p] = L709(data[p * ch], data[p * ch + 1], data[p * ch + 2]); A[p] = data[p * ch + 3]; }
  let s = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) { const p = y * w + x; if (A[p] < 200 || A[p + 1] < 200) continue; s += Math.abs(L[p] - L[p + 1]); n++; }
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) { const p = y * w + x; if (A[p] < 200 || A[p + w] < 200) continue; s += Math.abs(L[p] - L[p + w]); n++; }
  return n ? s / n : 0;
}

const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(SRC, { recursive: true });

  // ---- freeze guard: copy once, then verify the copy still matches ---------
  for (const s of SLOTS) {
    const origin = path.join(TILES, 'tundra', 'tundra_' + s.slot + '.webp');
    const frozen = path.join(SRC, 'tundra_' + s.slot + '_src.webp');
    if (!fs.existsSync(frozen)) { fs.copyFileSync(origin, frozen); console.log('[freeze] ' + path.basename(frozen) + ' created'); }
    const same = fs.readFileSync(frozen).equals(fs.readFileSync(origin));
    console.log('[freeze] tundra_' + s.slot + ' frozen copy ' + (same ? 'MATCHES' : 'DIFFERS FROM') + ' src/assets/tiles/tundra/');
  }

  const args = process.argv.slice(2);
  const only = args.map((a) => a.split('=')[0]).filter((a) => /^[0-3]$/.test(a));
  const seedOv = {};
  for (const a of args) { const [k, v] = a.split('='); if (v) seedOv[k] = parseInt(v, 10); }

  console.log('\n[prompt] ' + PROMPT + '\n');

  for (const s of SLOTS) {
    const key = String(s.slot);
    if (only.length && !only.includes(key)) continue;
    const frozen = path.join(SRC, 'tundra_' + s.slot + '_src.webp');
    const before = await statsOf(frozen);

    // kontext sees the diamond flattened on the dark grid background, exactly as
    // the ice_shelf / tundra derivations did -- the re-mask below restores alpha.
    const flat = await sharp(fs.readFileSync(frozen)).flatten({ background: { r: 0x14, g: 0x17, b: 0x1c } }).png().toBuffer();
    const seed = seedOv[key] || (only.includes(key) ? s.seed + 1000 : s.seed);
    console.log('[kontext] slot ' + s.slot + ' seed ' + seed);
    const r = await postJson('https://fal.run/fal-ai/flux-pro/kontext', {
      image_url: 'data:image/png;base64,' + flat.toString('base64'),
      prompt: PROMPT, num_images: 1, safety_tolerance: '5', seed,
    });
    const url = r.images && r.images[0] && r.images[0].url;
    if (!url) throw new Error('no image url for slot ' + s.slot + ': ' + JSON.stringify(r).slice(0, 300));
    const raw = await download(url);
    fs.writeFileSync(path.join(OUT, 'tundra_' + s.slot + '_kraw.png'), raw);

    const resized = await sharp(raw).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha().png().toBuffer();
    const mask = await sharp(DIAMOND).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
    const masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    const file = path.join(OUT, 'tundra_' + s.slot + '.webp');
    await sharp(masked).webp(WEBP).toFile(file);
    await sharp(masked).resize(64, 32, { fit: 'fill' }).webp(WEBP).toFile(file.replace(/\.webp$/, '@eighth.webp'));

    const after = await statsOf(file);
    const m8b = await microContrast(frozen.replace('_src.webp', '_src.webp'));
    const m8a = await microContrast(file);
    console.log('   before  L ' + f1(before.lum) + '  B/R ' + f2(before.br) + '  G/R ' + f2(before.gr) + '  sd ' + f1(before.sd) + '  sat ' + (before.sat * 100).toFixed(0) + '%  microFull ' + f2(m8b));
    console.log('   after   L ' + f1(after.lum) + '  B/R ' + f2(after.br) + '  G/R ' + f2(after.gr) + '  sd ' + f1(after.sd) + '  sat ' + (after.sat * 100).toFixed(0) + '%  microFull ' + f2(m8a));
  }
  console.log('\ndone -- judge deveg/tundra_<n>_kraw.png for collateral before grading');
})();
