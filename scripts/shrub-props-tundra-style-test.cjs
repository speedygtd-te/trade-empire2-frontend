/**
 * Asset-Pipeline (STYLE TEST): TUNDRA biome prop-layer SHRUB sprites.
 *
 * Mirrors scripts/tree-props-v2-style-test.cjs, adapted for LOW hardy dwarf
 * tundra shrubs (a few per tile, ground-hugging, NOT tall):
 *   - LOW + small + wide, dense-packable — dwarf bushes, not trees.
 *   - Palette: matte, desaturated, DARK muted green + dry yellow-brown / ochre
 *     (mix of green and dead/dry hardy tundra vegetation). No neon.
 *   - NO ground under the shrub — only the shrub's own woody base / a hint of
 *     roots on full transparency. Enforced by (a) hard anti-ground cutout prompt,
 *     (b) birefnet bg-remove, (c) a base cleaner: kills a ground disc splaying
 *     wider than the bush + light soil/tan + bright ground-green in the foot band,
 *     keeping the dark matte shrub itself.
 *   - Gentle color grade to unify + match the dark/dirty tile redesign.
 *
 * Pipeline per shrub:
 *   flux/dev @512x512 -> raw PNG
 *   birefnet/v2 bg removal -> nobg PNG
 *   trim + baseClean(disc/color) + retrim + colorGrade + bottom-center pad -> final PNG
 *
 * Output:
 *   assets/style-test/props/shrub_1.png .. shrub_6.png
 *   assets/style-test/props/shrub_preview.png  (scatter on tundra_0)
 *
 * Usage:
 *   node scripts/shrub-props-tundra-style-test.cjs            # all + preview
 *   node scripts/shrub-props-tundra-style-test.cjs shrub_3    # one
 *   node scripts/shrub-props-tundra-style-test.cjs shrub_3 4711  # one, seed override
 *   node scripts/shrub-props-tundra-style-test.cjs clean      # re-run post from nobg, no fal
 *   node scripts/shrub-props-tundra-style-test.cjs preview    # rebuild scatter preview only
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
const TUNDRA_TILE = path.join(ROOT, 'src', 'assets', 'tiles', 'tundra', 'tundra_0.webp');

const GEN_W = 512, GEN_H = 512;

// Shared style anchor — identical across prompts so the set reads as one family.
// Front-loads the cut-out + no-ground + low-dwarf-shrub intent.
const SHARED_ANCHOR =
  'isometric 2.5D perspective single small low dwarf shrub game sprite, ' +
  'a low ground-hugging hardy tundra bush, wider than it is tall, very short and compact, ' +
  'a multi-stemmed low bushy shrub with many short thin woody stems spreading from a low center, ' +
  'no central trunk, not a tree, not a sapling, dwarf arctic vegetation, ' +
  'earthy dark desaturated muted palette of olive-green ochre and brown tones only, very low saturation, ' +
  'matte grimy dim naturalistic, dark moody lighting, ' +
  'lit from upper left with soft top-down light, subtle form shadow on the shrub itself only, ' +
  'the shrub is cut off cleanly at the very bottom edge of the frame with its bare roots exposed, ' +
  'isolated single shrub specimen floating on an empty background, ' +
  'absolutely no ground, no soil, no grass, no dirt mound, no terrain, no rocks, no snow, no puddle, ' +
  'no pedestal, no plinth, no base disc, no soil pad, no display base, no slab, no platform beneath the shrub, ' +
  'nothing under the shrub except its own bare roots dangling on empty background, ' +
  'matching a dark gritty grimy sci-fi alien-planet tundra biome aesthetic';

const NEGATIVE_PROMPT =
  'tall, tree, tree trunk, trunk, single stem, central stem, sapling, big bush, large shrub, towering, ' +
  'spiky ball, sea urchin, cactus, succulent, durian, sphere, pixel art, blocky, voxel, minecraft, ' +
  'blue, teal, cyan, turquoise, blue tint, cool tones, ' +
  'bright, neon, vivid, saturated, vibrant green, lush green, glowing, cartoon, anime, fantasy, cute, cheerful, flowers, blossoms, ' +
  'text, logo, watermark, frame, border, ' +
  'solid dome, round dome, leafy dome, foliage dome, round ball of foliage, dense foliage ball, ' +
  'dense canopy, solid canopy, dense bush, thick foliage, full bush, round bush, ball-shaped, ' +
  'bubble cluster, berry cluster, cluster of berries, grapes, bubbles, blobs, smooth blobs, pom-pom, ' +
  'background scenery, landscape, whole field, multiple shrubs, group of bushes, row of bushes, ' +
  'ground, ground plane, grass, grass patch, grass tuft, lawn, moss patch, soil, dirt, dirt mound, mud, snow, ice, ' +
  'terrain disc, earth disc, rocks, stones, boulders, pebbles, undergrowth, ' +
  'pedestal, plinth, base slab, platform, display base, podium, soil pad, dirt disc, pot, planter, flowerpot, vase, ' +
  'water, puddle, pool, reflection, shadow on ground, cast ground shadow, base platform, island of grass, ' +
  'people, animals, buildings, cropped, cut off top, out of frame';

// 6 variants: 2 green-ish, 2 dry yellow-brown/ochre, 2 mixed. Varied small silhouettes.
const SHRUBS = {
  shrub_1: {
    seed: 512377, desc: 'low sparse twiggy dwarf shrub (muted olive)',
    add: 'a low sparse hardy tundra dwarf shrub built from thin woody twigs and stems, ' +
      'many bare thin twigs spreading outward and upward from a low center with wide open gaps between them, ' +
      'open airy see-through branching structure, only a few small sparse muted leaves scattered along the twigs, ' +
      'definitely not a solid round ball, not a dome, not dense foliage, mostly bare twigs showing, ' +
      'warm muted olive-brown and grey-brown woody twigs with a few dull khaki-olive leaves, earthy warm tones, ' +
      'weathered woody, low to the ground and wide, ' +
      'absolutely no trunk, no single stem, no tree, this is a low twiggy scrub not a tree, ' +
      'dull matte earthy brown-olive, absolutely not teal not cyan not blue-green not cool-toned',
  },
  shrub_2: {
    seed: 684109, desc: 'low twiggy open dwarf scrub (olive-grey)',
    add: 'a low hardy tundra dwarf shrub of thin woody stems and twigs, ' +
      'open see-through twiggy branching that fans out low and wide, lots of gaps and bare twigs, ' +
      'sparse small muted leaves clinging here and there along the stems, wispy and twiggy not dense, ' +
      'definitely not a round bush, not a dome, not a solid foliage ball, an open airy skeletal shrub, ' +
      'muted dark desaturated olive-green leaning grey-brown, weathered and dull, very low to the ground, ' +
      'absolutely no trunk, no single stem, no tree shape, this is a low twiggy scrub not a tree, ' +
      'dull matte muted olive not bright not teal not blue',
  },
  shrub_3: {
    seed: 417442, desc: 'dry yellow-brown dead dwarf shrub (bare twiggy)',
    add: 'a small dry dead dwarf shrub, brittle bare tangled yellow-brown and ochre twigs, ' +
      'leafless dry hardy bush, dead straw-brown woody stems, very low tangled mound, no leaves',
  },
  shrub_4: {
    seed: 418018, desc: 'dry ochre-brown low bush (dried leaves)',
    add: 'a low dry hardy bush with sparse dried curled yellow-brown and tan leaves clinging to short woody stems, ' +
      'dead ochre autumn tundra vegetation, dull brown, low and compact',
  },
  shrub_5: {
    seed: 903244, desc: 'low sparse twiggy mixed dwarf scrub (olive + dry)',
    add: 'a low sparse twiggy mixed hardy tundra dwarf shrub, ' +
      'thin woody twigs and stems fanning out low and open with wide gaps between them, mostly bare twigs, ' +
      'only a few sparse small leaves — some muted dark olive-green, some dry grey-brown — scattered along the twigs, ' +
      'half-alive weathered arctic scrub, open airy skeletal branching structure, ' +
      'definitely not a solid dome, not a round ball, not a dense cluster, not a bubble cluster, ' +
      'muted desaturated dark olive-green and ochre-brown tones, low to the ground and wide, ' +
      'absolutely no trunk, no single central stem, no tree, this is a low twiggy scrub not a tree, ' +
      'dull matte muted not bright not teal not blue',
  },
  shrub_6: {
    seed: 420345, desc: 'mixed hardy dwarf shrub (broad low spread)',
    add: 'a low broad-spreading hardy dwarf shrub, a low tangle of woody stems with mixed dull olive-green and dry ' +
      'tan-brown small leaves, weathered scrubby arctic bush, wide and very low to the ground, earthy tones not blue',
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
    `a single isolated small low dwarf ${prompt}, clean cut-out asset floating in empty space on a plain flat pale grey empty background, ` +
    `absolutely no ground, no grass, no soil, no dirt, no snow, no terrain, no pedestal, no base disc, no slab, no platform beneath the shrub, ` +
    `only the shrub and its own thin bare roots dangling in the air, cut off cleanly at the bottom edge, ${SHARED_ANCHOR}`;
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
// A dwarf shrub is WIDE and LOW, so the tree "root cone" (narrow trunk) does not
// apply. Instead, in the bottom foot band we remove:
//   (1) DISC SPLAY: pixels that splay wider than the shrub's own body — a ground
//       disc/soil pad is wider than the bush. We measure the bush half-width from
//       the mid-body rows and cut bottom-band pixels beyond a tolerance of that.
//   (2) COLOR: light soil/tan and bright ground-green pixels in the very foot
//       band (a baked soil pad / grass ring reads lighter/greener than the dark
//       matte shrub). Dark woody/leaf pixels are kept.
async function cleanBase(rgbaBuf) {
  const trimmed = await sharp(rgbaBuf).trim({ threshold: 10 }).ensureAlpha().png().toBuffer();
  const { data, info } = await sharp(trimmed).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels; // C=4
  const A = (x, y) => data[(y * W + x) * C + 3];

  // ── (0a) SOLID-PAD CUT: a baked ground disc / soil slab / pedestal reads as a
  // SOLID filled block at the bottom (fill≈1.0 across its width), whereas organic
  // foliage/twigs above have gaps (fill<0.95). Scan up from the bottom while rows
  // stay solid-and-wide; if that solid bottom block is a thin-ish band (not the
  // whole sprite — a genuinely solid plant is skipped), delete it.
  const rowStats = (y) => {
    let lo = -1, hi = -1, n = 0;
    for (let x = 0; x < W; x++) if (A(x, y) > 40) { if (lo < 0) lo = x; hi = x; n++; }
    const ext = lo < 0 ? 0 : hi - lo + 1;
    return { ext, fill: ext ? n / ext : 0 };
  };
  {
    const midExt = [];
    for (let y = Math.round(H * 0.25); y <= Math.round(H * 0.55); y++) midExt.push(rowStats(y).ext);
    const medExt = midExt.length ? midExt.slice().sort((a, b) => a - b)[Math.floor(midExt.length / 2)] : W;
    const solid = (y) => { const s = rowStats(y); return s.fill >= 0.9 && s.ext >= medExt * 0.4; };
    // find the bottom-most solid row (tolerate a few ragged anti-aliased edge rows)
    let bot = -1;
    for (let y = H - 1; y >= Math.round(H * 0.9); y--) { if (solid(y)) { bot = y; break; } }
    if (bot >= 0) {
      let top = bot;
      for (let y = bot - 1; y >= 0; y--) { if (solid(y)) top = y; else break; }
      const padH = bot - top + 1;
      // cut the solid bottom block only if it's a thin-ish band (not the whole
      // sprite: a genuinely solid plant has top≈0 → skipped).
      if (top > H * 0.5 && padH >= H * 0.05 && padH <= H * 0.4) {
        for (let y = top; y < H; y++)
          for (let x = 0; x < W; x++) data[(y * W + x) * C + 3] = 0;
      }
    }
  }

  // ── (0b) ANKLE CUT: remove a ground pad / soil slab / disc / pedestal that flares
  // BELOW the point where the shrub's stems narrow. Flux almost always grounds the
  // plant on a wide pad; that pad sits below a "neck" (narrow row) where stems meet
  // it. Find the neck, and if a distinctly wider blob exists below it, delete the
  // blob. A plant that tapers naturally to thin roots has no wider-below blob → kept.
  const rowWidth = (y) => { let n = 0; for (let x = 0; x < W; x++) if (A(x, y) > 40) n++; return n; };
  const widths = new Array(H);
  for (let y = 0; y < H; y++) widths[y] = rowWidth(y);
  const midSamp = [];
  for (let y = Math.round(H * 0.25); y <= Math.round(H * 0.60); y++) midSamp.push(widths[y]);
  const medMid = midSamp.length ? midSamp.slice().sort((a, b) => a - b)[Math.floor(midSamp.length / 2)] : W;
  let neckY = -1, neckW = Infinity;
  for (let y = Math.round(H * 0.58); y <= Math.round(H * 0.90); y++) {
    if (widths[y] > 0 && widths[y] < neckW) { neckW = widths[y]; neckY = y; }
  }
  if (neckY > 0) {
    let padMax = 0;
    for (let y = neckY + 1; y < H; y++) padMax = Math.max(padMax, widths[y]);
    // pad present when the region below the neck flares noticeably wider than the neck
    // and the neck is genuinely a narrowing (well below the body width).
    if (neckW < medMid * 0.88 && padMax > neckW * 1.55 && (H - neckY) < H * 0.34) {
      for (let y = neckY + 1; y < H; y++)
        for (let x = 0; x < W; x++) data[(y * W + x) * C + 3] = 0;
    }
  }

  // measure the shrub body extent (left/right of opaque run) at a set of mid rows,
  // take the median half-width + center → represents the actual bush width.
  function extentAtRow(ry) {
    let lo = -1, hi = -1;
    for (let x = 0; x < W; x++) {
      if (A(x, ry) > 40) { if (lo < 0) lo = x; hi = x; }
    }
    if (lo < 0) return null;
    return { cx: (lo + hi) / 2, half: (hi - lo) / 2 };
  }
  let halves = [], cxs = [];
  for (const frac of [0.30, 0.40, 0.50, 0.60, 0.68]) {
    const e = extentAtRow(Math.min(H - 1, Math.round(H * frac)));
    if (e) { halves.push(e.half); cxs.push(e.cx); }
  }
  const median = (arr) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)];
  const bodyHalf = halves.length ? median(halves) : W * 0.4;
  const bodyCx = cxs.length ? median(cxs) : W / 2;
  // allow the bottom to be a touch wider than the body (natural spread), but a
  // ground disc splays far beyond → cut past this tolerance.
  const allowHalf = Math.min(W / 2, bodyHalf * 1.18 + 6);

  const discBandY = Math.round(H * 0.72);  // where a ground disc would start splaying
  const colorBandY = Math.round(H * 0.82); // very-foot band for color cleanup
  const coreHalf = Math.max(6, bodyHalf * 0.42); // central stem column to always protect

  for (let y = discBandY; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * C;
      if (data[idx + 3] === 0) continue;
      // (1) disc splay: kill pixels wider than the shrub body tolerance
      if (Math.abs(x - bodyCx) > allowHalf) { data[idx + 3] = 0; continue; }
      // (2) color: in the very-foot band, kill light soil/tan + bright ground-green
      //     + flat desaturated grey pads/discs/puddles (pedestal, slab). The central
      //     stem column (coreHalf) is always protected so we never eat the shrub base.
      if (y >= colorBandY && Math.abs(x - bodyCx) > coreHalf) {
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        const isBrightGreen = g > r + 14 && g > b + 14 && max > 115;        // vivid ground-green ring
        const isLightSoil = max > 130 && r >= g && g >= b && sat > 0.12;    // light tan/brown soil pad
        const isGreyPad = sat < 0.17 && max >= 95 && max <= 215;            // flat grey pedestal/disc/puddle
        if (isBrightGreen || isLightSoil || isGreyPad) data[idx + 3] = 0;
      }
    }
  }

  const cleaned = await sharp(Buffer.from(data), { raw: { width: W, height: H, channels: C } })
    .png().toBuffer();
  return sharp(cleaned).trim({ threshold: 10 }).png().toBuffer();
}

// gentle color grade to unify the set: knock down saturation + brightness so
// nothing reads neon/bright, matching the dark/dirty tiles.
async function colorGrade(buf) {
  return sharp(buf).modulate({ saturation: 0.64, brightness: 0.84 }).png().toBuffer();
}

// pad horizontally so content is centered (bottom-center anchor)
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

async function runShrub(id, cfg) {
  console.log(`[gen] ${id} — ${cfg.desc} (seed ${cfg.seed})`);
  const raw = await generateImage(cfg.add, cfg.seed);
  fs.writeFileSync(path.join(DIR_RAW, `${id}_raw.png`), raw);
  const falUrl = await uploadToFal(raw, `${id}_raw.png`);
  const noBg = await removeBackground(falUrl);
  fs.writeFileSync(path.join(DIR_NOBG, `${id}_nobg.png`), noBg);
  await postProcess(id);
}

// ── SCATTER PREVIEW ─────────────────────────────────────────────────────────
// Scatter ~8-10 low shrubs (mixed variants, seeded jitter) inside the tundra
// diamond. Painter's order: sort by ground-contact Y (back-to-front).
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

async function buildPreview() {
  const ids = Object.keys(SHRUBS).filter((id) => fs.existsSync(path.join(DIR_OUT, `${id}.png`)));
  if (!ids.length) { console.log('  [preview] no candidates yet, skipping'); return; }

  const tileW = 512, tileH = 256, cx = 256, groundY = 128; // diamond contact center
  const topPad = 140, sidePad = 60, botPad = 40; // shrubs are low → less top pad than trees
  const canvasW = tileW + sidePad * 2;
  const canvasH = topPad + tileH + botPad;
  const tileLeft = sidePad, tileTop = topPad;
  const tile = await sharp(TUNDRA_TILE).png().toBuffer();

  const shrubs = {};
  for (const id of ids) {
    const b = fs.readFileSync(path.join(DIR_OUT, `${id}.png`));
    const m = await sharp(b).metadata();
    shrubs[id] = { buf: b, w: m.width, h: m.height };
  }

  const rnd = mulberry32(70210);
  // seeded scatter across the diamond (unit square → iso diamond floor).
  const N = 9;
  const placements = [];
  for (let i = 0; i < N; i++) {
    const u = 0.10 + rnd() * 0.80;
    const v = 0.10 + rnd() * 0.80;
    const sx = cx + (u - v) * (tileW / 2);
    const sy = groundY + (u + v - 1) * (tileH / 2);
    const id = ids[Math.floor(rnd() * ids.length)];
    // target on-tile height — LOW dwarf shrubs: 40-72px on a 256-tall tile
    const th = 40 + rnd() * 32;
    placements.push({ id, sx, sy, th });
  }
  placements.sort((a, b) => a.sy - b.sy);

  const layers = [{ input: tile, left: tileLeft, top: tileTop }];
  for (const p of placements) {
    const t = shrubs[p.id];
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
  const outPath = path.join(DIR_OUT, 'shrub_preview.png');
  fs.writeFileSync(outPath, preview);
  console.log(`  [preview] ${outPath} (${canvasW}x${canvasH}, ${N} shrubs)`);
}

// checkerboard contact sheet to verify clean bases
async function buildContactSheet() {
  const ids = Object.keys(SHRUBS).filter((id) => fs.existsSync(path.join(DIR_OUT, `${id}.png`)));
  if (!ids.length) return;
  const cell = 260, cols = 3, rows = Math.ceil(ids.length / cols), sq = 13;
  const cw = cols * cell, ch = rows * cell;
  // checkerboard bg
  const check = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const on = ((x / sq | 0) + (y / sq | 0)) % 2 === 0;
    const v = on ? 200 : 120;
    const i = (y * cw + x) * 4; check[i] = v; check[i + 1] = v; check[i + 2] = v; check[i + 3] = 255;
  }
  const layers = [];
  for (let k = 0; k < ids.length; k++) {
    const b = fs.readFileSync(path.join(DIR_OUT, `${ids[k]}.png`));
    const m = await sharp(b).metadata();
    const maxDim = cell - 24;
    const scale = Math.min(maxDim / m.width, maxDim / m.height, 1);
    const w = Math.round(m.width * scale), h = Math.round(m.height * scale);
    const r = await sharp(b).resize(w, h).png().toBuffer();
    const col = k % cols, row = (k / cols) | 0;
    layers.push({ input: r, left: col * cell + ((cell - w) >> 1), top: row * cell + (cell - h - 8) });
  }
  const out = await sharp(check, { raw: { width: cw, height: ch, channels: 4 } })
    .composite(layers).png().toBuffer();
  const outPath = path.join(DIR_OUT, 'shrub_contact_sheet.png');
  fs.writeFileSync(outPath, out);
  console.log(`  [contact] ${outPath} (${cw}x${ch})`);
}

(async () => {
  for (const d of [DIR_RAW, DIR_NOBG, DIR_CROP, DIR_OUT]) fs.mkdirSync(d, { recursive: true });
  const arg = (process.argv[2] || '').toLowerCase();
  const seedOverride = process.argv[3] ? parseInt(process.argv[3], 10) : null;

  if (arg === 'preview') { await buildPreview(); await buildContactSheet(); console.log('done'); return; }
  if (arg === 'clean') {
    for (const id of Object.keys(SHRUBS)) {
      if (fs.existsSync(path.join(DIR_NOBG, `${id}_nobg.png`))) {
        console.log(`[clean] ${id}`); await postProcess(id);
      }
    }
    await buildPreview(); await buildContactSheet(); console.log('done'); return;
  }

  if (!FAL_API_KEY) { console.error('No fal key in scripts/.env'); process.exit(1); }
  for (const [id, cfg] of Object.entries(SHRUBS)) {
    if (arg && arg !== id) continue;
    const eff = seedOverride != null ? { ...cfg, seed: seedOverride } : cfg;
    try { await runShrub(id, eff); }
    catch (e) { console.error(`ERR ${id}: ${e.message}`); }
  }
  await buildPreview();
  await buildContactSheet();
  console.log('done');
})();
