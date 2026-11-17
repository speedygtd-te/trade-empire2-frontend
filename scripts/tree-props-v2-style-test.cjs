/**
 * Asset-Pipeline (STYLE TEST v2): forest prop-layer TREE sprites — REGENERATION.
 *
 * v1 was rejected: trees too big, and flux baked a grass mound / soil disc /
 * rocks / green puddle under every tree (birefnet kept it because it connects to
 * the trunk). v2 fixes:
 *   - SMALL + varied, skewed small (saplings/young/small conifer/small dead + 1-2 medium),
 *     dense-packable 6-15 per tile.
 *   - NO ground under the tree — the only thing at the base is the tree's own bare
 *     ROOTS on full transparency. Enforced by (a) hard anti-ground cutout prompt,
 *     (b) birefnet bg-remove, (c) GEOMETRIC "root cone" base cleaner that erases the
 *     wide ground disc/puddle splaying far beyond the trunk while keeping narrow roots,
 *     (d) color pass that erases grass-green / soil-tan directly under the trunk foot.
 *   - Dark desaturated matte palette (gentle post color-grade to unify + match the
 *     dark/dirty tile redesign).
 *
 * Pipeline per tree:
 *   flux/dev @512x768 portrait -> raw PNG
 *   birefnet/v2 bg removal    -> nobg PNG
 *   trim + rootConeClean + baseColorClean + retrim + colorGrade + bottom-center pad -> final PNG
 *
 * Output:
 *   assets/style-test/props/tree_v2_1.png .. tree_v2_8.png
 *   assets/style-test/props/tree_v2_forest_preview.png  (dense scatter on forest_0)
 *
 * Usage:
 *   node scripts/tree-props-v2-style-test.cjs               # all + preview
 *   node scripts/tree-props-v2-style-test.cjs tree_v2_3     # one
 *   node scripts/tree-props-v2-style-test.cjs tree_v2_3 4711 # one, seed override
 *   node scripts/tree-props-v2-style-test.cjs clean         # re-run post (cone/color/grade) from nobg, no fal
 *   node scripts/tree-props-v2-style-test.cjs preview       # rebuild dense preview only
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

const ROOT = path.join(__dirname, '..');
const DIR_RAW = path.join(ROOT, 'assets', 'raw');
const DIR_NOBG = path.join(ROOT, 'assets', 'nobg');
const DIR_CROP = path.join(ROOT, 'assets', 'cropped');
const DIR_OUT = path.join(ROOT, 'assets', 'style-test', 'props');
const FOREST_TILE = path.join(ROOT, 'src', 'assets', 'tiles', 'forest', 'forest_0.webp');

const GEN_W = 512, GEN_H = 768;

// Shared style anchor — identical across prompts so the set reads as one family.
// Front-loads the cut-out + no-ground + bare-roots intent (flux weights the head).
const SHARED_ANCHOR =
  'isometric 2.5D perspective single small tree game sprite, ' +
  'exposed bare gnarled tree roots flaring out at the very base of the trunk, roots clearly visible, ' +
  'dark desaturated muted deep-green foliage, very low saturation, dark olive and grey-green tones, ' +
  'dark weathered bark trunk, matte grimy dim naturalistic, dark moody lighting, ' +
  'lit from upper left with soft top-down light, subtle form shadow on the tree itself only, ' +
  'the trunk with its bare roots ends cleanly at the very bottom center of the frame, ' +
  'isolated single tree specimen, botanical cutout, studio product shot, ' +
  'on a plain flat pale neutral grey background, ' +
  'absolutely no ground, no soil, no grass, no dirt mound, no terrain, no rocks, no puddle, no platform beneath the tree, ' +
  'nothing under the tree except its own bare roots on empty background, ' +
  'matching a dark gritty grimy sci-fi alien-planet biome aesthetic';

const NEGATIVE_PROMPT =
  'bright, neon, vivid, saturated, vibrant green, lush green, glowing, cartoon, anime, fantasy, cute, cheerful, ' +
  'text, logo, watermark, frame, border, ' +
  'background scenery, landscape, whole forest, multiple trees, group of trees, row of trees, ' +
  'ground, ground plane, grass, grass patch, grass tuft, lawn, moss patch, soil, dirt, dirt mound, mud, ' +
  'terrain disc, earth disc, rocks, stones, boulders, pebbles, flowers, undergrowth, bushes at base, ' +
  'water, puddle, pool, reflection, shadow on ground, cast ground shadow, base platform, island of grass, ' +
  'people, animals, buildings, pot, planter, flowerpot, vase, cropped, cut off top, out of frame';

// 8 variants, skewed SMALL: 5 small + 1 small dead + 2 medium.
const TREES = {
  tree_v2_1: {
    seed: 220411, desc: 'small young conifer (short spruce)', medium: false,
    add: 'a small short young conifer spruce sapling, compact narrow pointed spire, ' +
      'sparse layered dark-green needle branches, thin straight trunk, low and small, much smaller than a mature tree',
  },
  tree_v2_2: {
    seed: 220875, desc: 'small young broadleaf', medium: false,
    add: 'a small young broadleaf tree, modest open rounded canopy of dark muted-green leaves, ' +
      'slender trunk, small and low, clearly a young small tree not a big mature one',
  },
  tree_v2_3: {
    seed: 517442, desc: 'tiny sapling (few leaves)', medium: false,
    add: 'a tiny very small sapling, very short and slender, only a few sparse thin leaves on delicate twigs, ' +
      'thin wispy trunk, minimal foliage, the smallest young plant',
  },
  tree_v2_4: {
    seed: 448120, desc: 'small crooked twisted tree', medium: false,
    add: 'a small crooked twisted young tree, bent leaning gnarled trunk, sparse windswept crown of dark muted-green leaves, ' +
      'small and low, irregular asymmetric silhouette',
  },
  tree_v2_5: {
    seed: 222018, desc: 'small dead / bare tree', medium: false,
    add: 'a small bare leafless dead tree, entirely defoliated skeletal small tree, ' +
      'thin twiggy bare branches and forked twigs, gnarled cracked grey-brown trunk, dry brittle dead wood, short and small',
  },
  tree_v2_6: {
    seed: 222477, desc: 'small slender birch-like', medium: false,
    add: 'a small slender young birch-like tree, thin pale-grey trunk, light open airy crown of few dark muted-green leaves, ' +
      'delicate and small, taller than wide but short overall',
  },
  tree_v2_7: {
    seed: 640318, desc: 'medium conifer', medium: true,
    add: 'a medium tall conifer pine tree, narrow pointed spire silhouette, layered drooping dark-green needle branches, ' +
      'straight dark trunk, taller than the small trees but still a modest specimen',
  },
  tree_v2_8: {
    seed: 223345, desc: 'medium broadleaf', medium: true,
    add: 'a medium broadleaf tree with a full rounded dome canopy of dark muted-green leaves, ' +
      'sturdy dark trunk with a few visible branches, a modest mature specimen',
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
  const fullPrompt =
    `a single isolated small ${prompt}, clean cut-out asset floating on a plain flat pale grey empty background, ` +
    `absolutely no ground, no grass, no soil, no dirt, no terrain, no platform beneath the tree, ` +
    `only the tree and its own bare exposed roots, the roots end cleanly at the bottom, ${SHARED_ANCHOR}`;
  const submitBody = JSON.stringify({
    prompt: fullPrompt, negative_prompt: NEGATIVE_PROMPT,
    image_size: { width: GEN_W, height: GEN_H }, num_inference_steps: 30,
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

// ── BASE CLEANUP ──────────────────────────────────────────────────────────
// Erase any ground residue (grass mound / soil disc / puddle) at the base while
// keeping the tree's own bare roots. Two combined filters on the trimmed sprite:
//   1) rootCone: find the trunk column low in the sprite, then in the lower region
//      delete opaque pixels that splay OUTSIDE a cone widening downward from the
//      trunk. Ground discs/puddles extend far wider than roots -> removed. Narrow
//      roots inside the cone -> kept.
//   2) baseColorClean: inside the very bottom band, delete pixels that are
//      grass-green or light soil/tan (not dark root/bark) -> removes grass tufts
//      and soil directly under the trunk.
async function cleanBase(rgbaBuf) {
  const trimmed = await sharp(rgbaBuf).trim({ threshold: 10 }).ensureAlpha().png().toBuffer();
  const { data, info } = await sharp(trimmed).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels; // C=4
  const A = (x, y) => data[(y * W + x) * C + 3];

  // find trunk center + half-width at a low reference row (~80% down) where it's
  // usually just trunk. Use the opaque run nearest horizontal center.
  function trunkAtRow(ry) {
    let runs = [], s = -1;
    for (let x = 0; x < W; x++) {
      const on = A(x, ry) > 40;
      if (on && s < 0) s = x;
      if ((!on || x === W - 1) && s >= 0) { runs.push([s, on && x === W - 1 ? x : x - 1]); s = -1; }
    }
    if (!runs.length) return null;
    const cxTarget = W / 2;
    runs.sort((a, b) => Math.abs((a[0] + a[1]) / 2 - cxTarget) - Math.abs((b[0] + b[1]) / 2 - cxTarget));
    const r = runs[0];
    return { cx: (r[0] + r[1]) / 2, half: Math.max(4, (r[1] - r[0]) / 2 + 1) };
  }
  // sample a few low rows and take the median trunk (robust vs. a stray root/leaf)
  let samples = [];
  for (const frac of [0.74, 0.78, 0.82, 0.86]) {
    const t = trunkAtRow(Math.min(H - 1, Math.round(H * frac)));
    if (t) samples.push(t);
  }
  const trunk = samples.length
    ? { cx: samples.map((s) => s.cx).sort((a, b) => a - b)[Math.floor(samples.length / 2)],
        half: samples.map((s) => s.half).sort((a, b) => a - b)[Math.floor(samples.length / 2)] }
    : { cx: W / 2, half: Math.max(6, W * 0.06) };
  // Clamp trunk half: if the low rows sampled a wide ground slab/platform instead of
  // the trunk, the cone would open up and keep the slab. A real trunk is narrow, so
  // cap the half-width — this lets the cone erase baked platforms.
  trunk.half = Math.min(trunk.half, W * 0.13);

  // cone starts a bit above the trunk reference and widens toward the bottom to
  // permit root splay (~3.2x trunk half at the very bottom).
  const coneStartY = Math.round(H * 0.70);
  const bottomHalf = Math.min(W / 2, trunk.half * 3.2 + 6);
  const span = Math.max(1, (H - 1) - coneStartY);

  const colorBandY = Math.round(H * 0.88); // very-foot band for color cleanup

  for (let y = coneStartY; y < H; y++) {
    const t = (y - coneStartY) / span;
    const allowedHalf = trunk.half + (bottomHalf - trunk.half) * t;
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * C;
      if (data[idx + 3] === 0) continue;
      // (1) cone: kill anything splaying wider than the root cone
      if (Math.abs(x - trunk.cx) > allowedHalf) { data[idx + 3] = 0; continue; }
      // (2) color: in the very-foot band, kill grass-green / light soil, keep dark roots
      if (y >= colorBandY) {
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        const isGrass = g > r + 8 && g > b + 8 && max > 60;            // green tuft
        const isLightSoil = max > 105 && r >= g && g >= b && sat > 0.12; // tan/brown light disc
        const isRoot = max <= 115 && !(g > r + 12 && g > b + 12);       // dark bark/root -> keep
        if ((isGrass || isLightSoil) && !isRoot) data[idx + 3] = 0;
      }
    }
  }

  const cleaned = await sharp(Buffer.from(data), { raw: { width: W, height: H, channels: C } })
    .png().toBuffer();
  // retrim (cone/color removal may have opened transparent margins)
  return sharp(cleaned).trim({ threshold: 10 }).png().toBuffer();
}

// gentle color grade to unify the set: knock down saturation + brightness so
// nothing reads neon/bright, matching the dark/dirty tiles.
async function colorGrade(buf) {
  return sharp(buf).modulate({ saturation: 0.72, brightness: 0.9 }).png().toBuffer();
}

// tight crop already applied; pad horizontally so content is centered (bottom-center anchor)
async function anchorBottomCenter(buf) {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 1, h = meta.height ?? 1;
  const pad = Math.max(8, Math.round(w * 0.06));
  const out = await sharp(buf).extend({
    top: 0, bottom: 0, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).png().toBuffer();
  return { buf: out, w: w + pad * 2, h };
}

async function postProcess(id) {
  const noBg = fs.readFileSync(path.join(DIR_NOBG, `${id}_nobg.png`));
  const cleaned = await cleanBase(noBg);
  const graded = await colorGrade(cleaned);
  const { buf } = await anchorBottomCenter(graded);
  fs.writeFileSync(path.join(DIR_CROP, `${id}_cropped.png`), buf);
  const outPath = path.join(DIR_OUT, `${id}.png`);
  fs.writeFileSync(outPath, buf);
  const fm = await sharp(buf).metadata();
  console.log(`  [save] ${outPath} (${fm.width}x${fm.height}, alpha=${fm.hasAlpha})`);
}

async function runTree(id, cfg) {
  console.log(`[gen] ${id} — ${cfg.desc} (seed ${cfg.seed})`);
  const raw = await generateImage(cfg.add, cfg.seed);
  fs.writeFileSync(path.join(DIR_RAW, `${id}_raw.png`), raw);
  const falUrl = await uploadToFal(raw, `${id}_raw.png`);
  const noBg = await removeBackground(falUrl);
  fs.writeFileSync(path.join(DIR_NOBG, `${id}_nobg.png`), noBg);
  await postProcess(id);
}

// ── DENSE SCATTER PREVIEW ───────────────────────────────────────────────────
// Scatter ~10-14 trees (mixed variants + sizes, seeded jitter) inside the forest
// diamond to show the intended 6-15-per-tile FOREST look. Painter's order: sort
// by ground-contact Y (back-to-front) so nearer trees overlap farther ones.
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

async function buildPreview() {
  const ids = Object.keys(TREES).filter((id) => fs.existsSync(path.join(DIR_OUT, `${id}.png`)));
  if (!ids.length) { console.log('  [preview] no candidates yet, skipping'); return; }

  const tileW = 512, tileH = 256, cx = 256, groundY = 128; // diamond contact center
  const topPad = 300, sidePad = 60, botPad = 40;
  const canvasW = tileW + sidePad * 2;
  const canvasH = topPad + tileH + botPad;
  const tileLeft = sidePad, tileTop = topPad;
  const tile = await sharp(FOREST_TILE).png().toBuffer();

  // preload trees + metadata
  const trees = {};
  for (const id of ids) {
    const b = fs.readFileSync(path.join(DIR_OUT, `${id}.png`));
    const m = await sharp(b).metadata();
    trees[id] = { buf: b, w: m.width, h: m.height, medium: TREES[id].medium };
  }
  const smallIds = ids.filter((id) => !TREES[id].medium);
  const medIds = ids.filter((id) => TREES[id].medium);

  const rnd = mulberry32(90210);
  // seeded scatter across the diamond. Sub-tile coords u,v in [0,1] map to the full
  // diamond: the unit square maps exactly onto the iso diamond floor.
  //   screenX = cx + (u - v)*(tileW/2)
  //   contactY = groundY + (u + v - 1)*(tileH/2)
  const N = 14;
  const placements = [];
  for (let i = 0; i < N; i++) {
    const u = 0.06 + rnd() * 0.88; // margin so roots don't overhang the tile edge
    const v = 0.06 + rnd() * 0.88;
    const sx = cx + (u - v) * (tileW / 2);
    const sy = groundY + (u + v - 1) * (tileH / 2); // ground-contact Y within tile
    // pick variant: skew small (medium ~1 in 6)
    const useMed = medIds.length && rnd() < 0.16;
    const pool = useMed ? medIds : smallIds;
    const id = pool[Math.floor(rnd() * pool.length)];
    // target on-tile height (dense-packable): small 55-100px, medium 120-165px
    const th = useMed ? 120 + rnd() * 45 : 55 + rnd() * 48;
    placements.push({ id, sx, sy, th });
  }
  // painter: back (small sy) to front (large sy)
  placements.sort((a, b) => a.sy - b.sy);

  const layers = [{ input: tile, left: tileLeft, top: tileTop }];
  for (const p of placements) {
    const t = trees[p.id];
    const scale = p.th / t.h;
    const w = Math.max(1, Math.round(t.w * scale));
    const h = Math.max(1, Math.round(t.h * scale));
    const resized = await sharp(t.buf).resize(w, h).png().toBuffer();
    const left = Math.round(tileLeft + p.sx - w / 2);
    const top = Math.round(tileTop + p.sy - h); // base flush to contact point
    layers.push({ input: resized, left, top });
  }

  const preview = await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: { r: 24, g: 26, b: 24, alpha: 1 } },
  }).composite(layers).png().toBuffer();
  const outPath = path.join(DIR_OUT, 'tree_v2_forest_preview.png');
  fs.writeFileSync(outPath, preview);
  console.log(`  [preview] ${outPath} (${canvasW}x${canvasH}, ${N} trees)`);
}

(async () => {
  for (const d of [DIR_RAW, DIR_NOBG, DIR_CROP, DIR_OUT]) fs.mkdirSync(d, { recursive: true });
  const arg = (process.argv[2] || '').toLowerCase();
  const seedOverride = process.argv[3] ? parseInt(process.argv[3], 10) : null;

  if (arg === 'preview') { await buildPreview(); console.log('done'); return; }
  if (arg === 'clean') {
    for (const id of Object.keys(TREES)) {
      if (fs.existsSync(path.join(DIR_NOBG, `${id}_nobg.png`))) {
        console.log(`[clean] ${id}`); await postProcess(id);
      }
    }
    await buildPreview(); console.log('done'); return;
  }

  if (!FAL_API_KEY) { console.error('No fal key in scripts/.env'); process.exit(1); }
  for (const [id, cfg] of Object.entries(TREES)) {
    if (arg && arg !== id) continue;
    const eff = seedOverride != null ? { ...cfg, seed: seedOverride } : cfg;
    try { await runTree(id, eff); }
    catch (e) { console.error(`ERR ${id}: ${e.message}`); }
  }
  await buildPreview();
  console.log('done');
})();
