/**
 * Asset-Pipeline (STYLE TEST): ARID/ROCK biome prop-layer ROCK sprites.
 *
 * Scattered boulders/rocks for arid biomes (mountain/beach/desert/rocky). Mirrors
 * the finished tree-prop pipeline (scripts/tree-props-v2-style-test.cjs) but tuned
 * for rocks:
 *   - A rock sits DIRECTLY on transparency, its base flush (no ground/soil disc,
 *     no cast-shadow blob). Unlike a tree the rock is WIDEST at its base, so there
 *     is NO root-cone narrowing — instead the base cleaner (a) floors soft alpha
 *     halo, and (b) erases warm sandy/tan SOIL pixels in the bottom band while
 *     keeping cool-grey stone.
 *   - Cool grey / weathered DARK stone, matte, desaturated, no neon. Lit upper-left.
 *   - Varied sizes: medium angular boulders, a rounded boulder, a small cluster,
 *     pebbles, a jagged shard.
 *
 * Pipeline per rock:
 *   flux/dev @768x576 landscape -> raw PNG
 *   birefnet/v2 bg removal      -> nobg PNG
 *   trim + alphaFloor + soilClean + retrim + coolGreyGrade + bottom-center pad -> final PNG
 *
 * Output:
 *   assets/style-test/props/rock_1.png .. rock_6.png
 *   assets/style-test/props/rock_preview.png  (scatter on rocky_desert_0)
 *
 * Usage:
 *   node scripts/rock-props-style-test.cjs            # all + preview
 *   node scripts/rock-props-style-test.cjs rock_3     # one
 *   node scripts/rock-props-style-test.cjs rock_3 4711 # one, seed override
 *   node scripts/rock-props-style-test.cjs clean      # re-run post from nobg, no fal
 *   node scripts/rock-props-style-test.cjs preview    # rebuild scatter preview only
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
const ROCK_TILE = path.join(ROOT, 'src', 'assets', 'tiles', 'rocky_desert', 'rocky_desert_0.webp');

const GEN_W = 768, GEN_H = 576;

// Shared style anchor — identical across prompts so the set reads as one family.
// Front-loads the cut-out + no-ground + flush-base intent (flux weights the head).
const SHARED_ANCHOR =
  'isometric 2.5D perspective single rock game sprite, ' +
  'cool grey weathered dark stone, desaturated slate-grey and charcoal tones, very low saturation, ' +
  'rough matte grimy stone surface, angular facets and chipped edges, dry dusty rock, ' +
  'lit from upper left with soft top-down light, subtle form shadow on the rock itself only, ' +
  'the rock rests flat and its base ends cleanly at the very bottom center of the frame, ' +
  'isolated single rock specimen, geology cutout, studio product shot, ' +
  'on a plain flat pale neutral grey background, ' +
  'absolutely no ground, no sand, no soil, no dirt, no terrain, no grass, no dust cloud, ' +
  'no cast shadow on the floor, no base platform, no puddle, nothing under the rock, ' +
  'the rock floats as a clean cut-out, matching a dark gritty grimy sci-fi alien-planet biome aesthetic';

const NEGATIVE_PROMPT =
  'bright, neon, vivid, saturated, colorful, glowing, crystal, gem, glossy, wet, cartoon, anime, fantasy, cute, ' +
  'warm orange, warm tan, sandy yellow, reddish, rusty, ' +
  'text, logo, watermark, frame, border, ' +
  'background scenery, landscape, mountain range, whole rock field, ' +
  'ground, ground plane, sand, sand dune, soil, dirt, dirt mound, mud, dust, dust cloud, ' +
  'terrain disc, earth disc, grass, moss, plants, flowers, water, puddle, pool, reflection, ' +
  'cast ground shadow, shadow on ground, base platform, island of sand, ' +
  'people, animals, buildings, cropped, cut off, out of frame';

// 6 variants: mixed sizes. medium boulders, rounded boulder, cluster, pebbles, shard.
const ROCKS = {
  rock_1: {
    seed: 310411, size: 'large', desc: 'two medium angular boulders (a pair)',
    add: 'two medium angular boulders resting together side by side, faceted chunky blocky stones, ' +
      'sharp broken edges, one slightly larger than the other, cool grey weathered rock',
  },
  rock_2: {
    seed: 310875, size: 'large', desc: 'single large rounded boulder',
    add: 'a single large rounded boulder, smooth weathered dome shape with shallow cracks and pits, ' +
      'squat and heavy, wider than tall, cool grey stone',
  },
  rock_3: {
    seed: 311442, size: 'medium', desc: 'single medium angular boulder (faceted)',
    add: 'a single medium angular boulder, sharply faceted blocky stone with flat broken planes and crisp edges, ' +
      'chunky and solid, cool grey weathered rock',
  },
  rock_4: {
    seed: 311120, size: 'medium', desc: 'small rock cluster (several stones grouped)',
    add: 'a small cluster of several rocks grouped together, a few small and medium stones of varied shape piled loosely, ' +
      'low and spread, cool grey weathered rock',
  },
  rock_5: {
    seed: 312018, size: 'small', desc: 'a few pebbles / small stones',
    add: 'a few small scattered pebbles and small stones grouped low together, tiny rounded and chipped little rocks, ' +
      'very low and small, cool grey weathered stone',
  },
  rock_6: {
    seed: 312477, size: 'medium', desc: 'jagged upright shard',
    add: 'a single jagged upright rock shard, splintered angular stone spike leaning slightly, ' +
      'sharp pointed broken silhouette, taller than wide, cool grey weathered rock',
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
    `a single isolated ${prompt}, clean cut-out asset floating on a plain flat pale grey empty background, ` +
    `absolutely no ground, no sand, no soil, no dirt, no terrain, no cast shadow beneath the rock, ` +
    `only the rock itself, its base rests flush at the bottom, ${SHARED_ANCHOR}`;
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
// A rock is widest at its base (unlike a tree), so NO cone narrowing. Instead:
//   1) alphaFloor: harden the alpha edge — anything below a floor becomes fully
//      transparent (kills the soft translucent halo / faint cast-shadow blob that
//      birefnet leaves), anything above stays opaque.
//   2) soilClean: in the bottom band, delete WARM sandy/tan/soil-colored pixels
//      (a desert ground disc) while keeping cool-grey stone. Cool grey stone has
//      near-equal channels + low saturation; sand/soil is warm (r>g>b) + saturated.
async function cleanBase(rgbaBuf) {
  const trimmed = await sharp(rgbaBuf).trim({ threshold: 12 }).ensureAlpha().png().toBuffer();
  const { data, info } = await sharp(trimmed).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels; // C=4

  const colorBandY = Math.round(H * 0.80); // bottom 20% — where a ground disc would sit

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * C;
      const a = data[idx + 3];
      if (a === 0) continue;
      // (1) alpha floor: kill soft halo / faint shadow, harden real edges
      if (a < 40) { data[idx + 3] = 0; continue; }
      // (2) warm-soil color clean in the bottom band
      if (y >= colorBandY) {
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        // warm sandy/tan soil: bright-ish, red>=green>=blue, noticeably saturated
        const isWarmSoil = max > 100 && r >= g && g > b + 6 && sat > 0.18;
        // cool grey stone: low saturation OR not warm -> keep
        const isCoolStone = sat <= 0.16 || b >= g;
        if (isWarmSoil && !isCoolStone) data[idx + 3] = 0;
      }
    }
  }

  const cleaned = await sharp(Buffer.from(data), { raw: { width: W, height: H, channels: C } })
    .png().toBuffer();
  // retrim (color removal may have opened transparent margins)
  return sharp(cleaned).trim({ threshold: 12 }).png().toBuffer();
}

// cool-grey grade: strongly desaturate + darken so nothing reads warm/bright, then
// a faint cool tint to push weathered slate-grey, matching the dark/dirty tiles.
async function coolGreyGrade(buf) {
  return sharp(buf)
    .modulate({ saturation: 0.5, brightness: 0.88 })
    .tint({ r: 226, g: 232, b: 240 }) // faint cool slate cast
    .png().toBuffer();
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
  const graded = await coolGreyGrade(cleaned);
  const { buf } = await anchorBottomCenter(graded);
  fs.writeFileSync(path.join(DIR_CROP, `${id}_cropped.png`), buf);
  const outPath = path.join(DIR_OUT, `${id}.png`);
  fs.writeFileSync(outPath, buf);
  const fm = await sharp(buf).metadata();
  console.log(`  [save] ${outPath} (${fm.width}x${fm.height}, alpha=${fm.hasAlpha})`);
}

async function runRock(id, cfg) {
  console.log(`[gen] ${id} — ${cfg.desc} (seed ${cfg.seed})`);
  const raw = await generateImage(cfg.add, cfg.seed);
  fs.writeFileSync(path.join(DIR_RAW, `${id}_raw.png`), raw);
  const falUrl = await uploadToFal(raw, `${id}_raw.png`);
  const noBg = await removeBackground(falUrl);
  fs.writeFileSync(path.join(DIR_NOBG, `${id}_nobg.png`), noBg);
  await postProcess(id);
}

// ── SCATTER PREVIEW ─────────────────────────────────────────────────────────
// Arid ground is low -> few rocks per tile. Scatter ~6 (mixed variants + sizes,
// seeded jitter) inside the rocky-desert diamond. Painter's order: sort by
// ground-contact Y (back-to-front) so nearer rocks overlap farther ones.
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const SIZE_PX = { // target on-tile heights per size class
  large: [95, 135],
  medium: [65, 100],
  small: [34, 55],
};

async function buildPreview() {
  const ids = Object.keys(ROCKS).filter((id) => fs.existsSync(path.join(DIR_OUT, `${id}.png`)));
  if (!ids.length) { console.log('  [preview] no candidates yet, skipping'); return; }

  const tileW = 512, tileH = 256, cx = 256, groundY = 128; // diamond contact center
  const topPad = 220, sidePad = 60, botPad = 40;
  const canvasW = tileW + sidePad * 2;
  const canvasH = topPad + tileH + botPad;
  const tileLeft = sidePad, tileTop = topPad;
  const tile = await sharp(ROCK_TILE).png().toBuffer();

  const rocks = {};
  for (const id of ids) {
    const b = fs.readFileSync(path.join(DIR_OUT, `${id}.png`));
    const m = await sharp(b).metadata();
    rocks[id] = { buf: b, w: m.width, h: m.height, size: ROCKS[id].size };
  }

  const rnd = mulberry32(70217);
  //   screenX = cx + (u - v)*(tileW/2)
  //   contactY = groundY + (u + v - 1)*(tileH/2)
  const N = 6; // arid: few per tile
  const placements = [];
  for (let i = 0; i < N; i++) {
    const u = 0.12 + rnd() * 0.76;
    const v = 0.12 + rnd() * 0.76;
    const sx = cx + (u - v) * (tileW / 2);
    const sy = groundY + (u + v - 1) * (tileH / 2);
    const id = ids[Math.floor(rnd() * ids.length)];
    const [lo, hi] = SIZE_PX[rocks[id].size] || SIZE_PX.medium;
    const th = lo + rnd() * (hi - lo);
    placements.push({ id, sx, sy, th });
  }
  placements.sort((a, b) => a.sy - b.sy); // back-to-front

  const layers = [{ input: tile, left: tileLeft, top: tileTop }];
  for (const p of placements) {
    const t = rocks[p.id];
    const scale = p.th / t.h;
    const w = Math.max(1, Math.round(t.w * scale));
    const h = Math.max(1, Math.round(t.h * scale));
    const resized = await sharp(t.buf).resize(w, h).png().toBuffer();
    const left = Math.round(tileLeft + p.sx - w / 2);
    const top = Math.round(tileTop + p.sy - h); // base flush to contact point
    layers.push({ input: resized, left, top });
  }

  const preview = await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: { r: 24, g: 26, b: 28, alpha: 1 } },
  }).composite(layers).png().toBuffer();
  const outPath = path.join(DIR_OUT, 'rock_preview.png');
  fs.writeFileSync(outPath, preview);
  console.log(`  [preview] ${outPath} (${canvasW}x${canvasH}, ${N} rocks)`);
}

(async () => {
  for (const d of [DIR_RAW, DIR_NOBG, DIR_CROP, DIR_OUT]) fs.mkdirSync(d, { recursive: true });
  const arg = (process.argv[2] || '').toLowerCase();
  const seedOverride = process.argv[3] ? parseInt(process.argv[3], 10) : null;

  if (arg === 'preview') { await buildPreview(); console.log('done'); return; }
  if (arg === 'clean') {
    for (const id of Object.keys(ROCKS)) {
      if (fs.existsSync(path.join(DIR_NOBG, `${id}_nobg.png`))) {
        console.log(`[clean] ${id}`); await postProcess(id);
      }
    }
    await buildPreview(); console.log('done'); return;
  }

  if (!FAL_API_KEY) { console.error('No fal key in scripts/.env'); process.exit(1); }
  for (const [id, cfg] of Object.entries(ROCKS)) {
    if (arg && arg !== id) continue;
    const eff = seedOverride != null ? { ...cfg, seed: seedOverride } : cfg;
    try { await runRock(id, eff); }
    catch (e) { console.error(`ERR ${id}: ${e.message}`); }
  }
  await buildPreview();
  console.log('done');
})();
