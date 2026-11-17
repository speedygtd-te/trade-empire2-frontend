/**
 * Asset-Pipeline (STYLE TEST): forest prop-layer TREE sprite candidates.
 *
 * Decorative iso tree props that stand ON the forest floor tile and rise above
 * it (overflow the diamond). NOT integrated into src/, NO cap sync, NO commit.
 *
 * Pipeline per tree (mirrors scripts/generate-custom-modules.cjs):
 *   flux/dev @512x768 (portrait, trees taller than wide) -> raw PNG
 *   birefnet/v2 bg removal -> nobg PNG (transparent)
 *   sharp trim (tight crop) -> cropped PNG
 *   anchor bottom-center: pad horizontally so the content bbox is centered,
 *     keep trunk base flush to the bottom edge -> candidate PNG
 *
 * Candidate resolution kept native (~<=768 tall). NO scale to tile size — final
 * sizing/anchor tuning happens at prop-layer integration.
 *
 * Output:
 *   assets/style-test/props/tree_1.png .. tree_4.png
 *   assets/style-test/props/tree-preview.png  (trees composited on forest_0)
 *
 * Usage:
 *   node scripts/tree-props-style-test.cjs            # all 4 + preview
 *   node scripts/tree-props-style-test.cjs tree_2     # only one
 *   node scripts/tree-props-style-test.cjs tree_2 4711 # one, seed override (retry)
 *   node scripts/tree-props-style-test.cjs preview    # rebuild preview only
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
const DIR_OUT = path.join(ROOT, 'assets', 'style-test', 'props');
const FOREST_TILE = path.join(ROOT, 'src', 'assets', 'tiles', 'forest', 'forest_0.webp');

const GEN_W = 512, GEN_H = 768; // portrait: trees taller than wide

// Shared style anchor — identical in every prompt so the set reads as one family.
const SHARED_ANCHOR =
  'isometric 2.5D perspective single tree game sprite, ' +
  'dark desaturated muted deep-green foliage, very low saturation, dark olive and grey-green, ' +
  'dark weathered bark trunk, matte grimy dim naturalistic, dark moody lighting, ' +
  'lit from upper left with soft top-down light, subtle form shadow on the tree itself, ' +
  'the bare trunk goes straight down and ends cleanly at the very bottom center of the frame, ' +
  'absolutely nothing around the base of the trunk, no grass tuft, no dirt mound, no soil patch, no roots spreading on ground, ' +
  'whole tree fully in frame, isolated single floating object on a pure solid empty background, ' +
  'matching a dark gritty grimy sci-fi alien-planet biome aesthetic';

const NEGATIVE_PROMPT =
  'bright, neon, vivid, saturated, vibrant green, lush green, glowing, cartoon, anime, fantasy, cute, cheerful, ' +
  'text, logo, watermark, frame, border, ' +
  'background, scenery, landscape, forest, multiple trees, group of trees, row of trees, ' +
  'ground, ground plane, grass, grass patch, grass tuft, soil, dirt, dirt mound, terrain disc, ' +
  'rocks, flowers, plants at base, shadow on ground, cast ground shadow, base platform, island of grass, ' +
  'people, animals, buildings, pot, planter, flowerpot, cropped, cut off, out of frame';

// 4 distinct silhouettes so a scatter doesn't look cloned.
const TREES = {
  tree_1: {
    seed: 710777,
    desc: 'tall narrow conifer',
    add: 'tall slender conifer pine tree, narrow pointed spire silhouette, layered drooping dark-green needle branches, ' +
      'straight dark trunk, much taller than wide',
  },
  tree_2: {
    seed: 710047,
    desc: 'rounded broadleaf',
    add: 'mature broadleaf tree with a full rounded dome canopy of dark muted-green leaves, ' +
      'thick sturdy dark trunk with a few visible branches, roughly as tall as its canopy is wide',
  },
  tree_3: {
    seed: 711248,
    desc: 'small young sapling',
    add: 'small young sapling, short and slender, sparse thin canopy with few leaves, thin delicate trunk, ' +
      'clearly smaller and less dense than a mature tree',
  },
  tree_4: {
    seed: 710933,
    desc: 'dead / sparse bare tree',
    add: 'bare leafless winter tree with no leaves, an entirely defoliated skeletal tree, ' +
      'thin twiggy bare branches and forked twigs, gnarled cracked grey-brown trunk, ' +
      'dry brittle dead wood, ominous withered, empty branch silhouette',
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
  // Front-load the subject + cut-out framing — flux/dev weights the prompt head
  // far more than negatives, so the anti-ground intent must lead.
  const fullPrompt =
    `a single isolated ${prompt}, clean cut-out asset floating on a pure solid flat empty background, ` +
    `absolutely no ground, no grass, no soil, no terrain, no platform beneath the tree, ` +
    `the trunk ends cleanly at the bottom, ${SHARED_ANCHOR}`;
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

// Tight-crop, then pad horizontally so the content bbox is horizontally centered
// (bbox center == canvas center == trunk for a roughly symmetric tree) and the
// trunk base stays flush to the bottom edge -> anchor is bottom-center.
async function anchorBottomCenter(noBgBuf) {
  const cropped = await sharp(noBgBuf).trim({ threshold: 10 }).png().toBuffer();
  const meta = await sharp(cropped).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  // symmetric horizontal pad -> content centered; small bottom pad avoids edge clipping
  const pad = Math.max(8, Math.round(w * 0.06));
  const outW = w + pad * 2;
  const squared = await sharp(cropped).extend({
    top: 0, bottom: 0, left: pad, right: pad,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).png().toBuffer();
  return { buf: squared, w: outW, h };
}

async function runTree(id, cfg) {
  console.log(`[gen] ${id} — ${cfg.desc} (seed ${cfg.seed})`);
  const raw = await generateImage(cfg.add, cfg.seed);
  fs.writeFileSync(path.join(DIR_RAW, `${id}_raw.png`), raw);

  const falUrl = await uploadToFal(raw, `${id}_raw.png`);
  const noBg = await removeBackground(falUrl);
  fs.writeFileSync(path.join(DIR_NOBG, `${id}_nobg.png`), noBg);

  const { buf, w, h } = await anchorBottomCenter(noBg);
  fs.writeFileSync(path.join(DIR_CROP, `${id}_cropped.png`), buf);
  const outPath = path.join(DIR_OUT, `${id}.png`);
  fs.writeFileSync(outPath, buf);
  const fm = await sharp(buf).metadata();
  console.log(`  [save] ${outPath} (${fm.width}x${fm.height}, alpha=${fm.hasAlpha})`);
}

// Composite each candidate onto a copy of the forest floor tile at its
// base-center (diamond center = 256,128 on the 512x256 tile). Preview canvas is
// tall enough that the tallest tree isn't clipped.
async function buildPreview() {
  const tile = await sharp(FOREST_TILE).png().toBuffer();
  const tileW = 512, tileH = 256;
  const cx = 256, groundY = 128; // diamond ground-contact center
  const ids = Object.keys(TREES).filter((id) => fs.existsSync(path.join(DIR_OUT, `${id}.png`)));
  if (!ids.length) { console.log('  [preview] no candidates yet, skipping'); return; }

  const cellW = tileW;
  const topPad = 640; // headroom for tall trees above the tile
  const cellH = topPad + tileH + 24;
  const cols = ids.length;
  const canvasW = cellW * cols;
  const canvasH = cellH;

  const layers = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const ox = i * cellW;
    const tileTop = topPad;
    // tile
    layers.push({ input: tile, left: ox, top: tileTop });
    // tree, base-center at (cx, tileTop+groundY)
    const treeBuf = fs.readFileSync(path.join(DIR_OUT, `${id}.png`));
    const tm = await sharp(treeBuf).metadata();
    const tw = tm.width ?? 0, th = tm.height ?? 0;
    const left = Math.round(ox + cx - tw / 2);
    const top = Math.round(tileTop + groundY - th); // base flush to ground line
    layers.push({ input: treeBuf, left, top });
    // label
    const svg = Buffer.from(
      `<svg width="${cellW}" height="28"><text x="12" y="20" font-family="sans-serif" font-size="18" fill="#ddd">${id} — ${TREES[id].desc}</text></svg>`
    );
    layers.push({ input: svg, left: ox, top: 4 });
  }

  const preview = await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: { r: 30, g: 32, b: 30, alpha: 1 } },
  }).composite(layers).png().toBuffer();
  const outPath = path.join(DIR_OUT, 'tree-preview.png');
  fs.writeFileSync(outPath, preview);
  console.log(`  [preview] ${outPath} (${canvasW}x${canvasH})`);
}

(async () => {
  for (const d of [DIR_RAW, DIR_NOBG, DIR_CROP, DIR_OUT]) fs.mkdirSync(d, { recursive: true });
  const arg = (process.argv[2] || '').toLowerCase();
  const seedOverride = process.argv[3] ? parseInt(process.argv[3], 10) : null;

  if (arg === 'preview') { await buildPreview(); console.log('done'); return; }

  for (const [id, cfg] of Object.entries(TREES)) {
    if (arg && arg !== id) continue;
    const eff = seedOverride != null ? { ...cfg, seed: seedOverride } : cfg;
    try { await runTree(id, eff); }
    catch (e) { console.error(`ERR ${id}: ${e.message}`); }
  }
  await buildPreview();
  console.log('done');
})();
