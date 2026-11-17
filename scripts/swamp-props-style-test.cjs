/**
 * Asset-Pipeline (STYLE TEST): SWAMP biome prop-layer sprites.
 *
 * Mirrors the finished tree props pipeline (tree-props-v2-style-test.cjs +
 * tree-props-v2-recolour.cjs):
 *   flux/dev portrait -> birefnet bg-remove -> tight trim -> geometric base
 *   cleanup (NO ground/soil/water disc — only the plant's own stems/roots at the
 *   base on full transparency) -> colour grade -> bottom-center pad.
 *
 * Set (~8 variants), mostly REEDS/CATTAILS (tall thin grassy clumps, a few
 * heights) + 2 small DEAD/BARE trees:
 *   swamp_1  tall reed clump
 *   swamp_2  medium reed clump
 *   swamp_3  cattail / bulrush clump (brown seed heads)
 *   swamp_4  short sedge / grass tuft
 *   swamp_5  tall bent windswept reeds
 *   swamp_6  cattail clump (mixed heights, few seed heads)
 *   swamp_7  small dead / bare tree (leafless, grey-brown)
 *   swamp_8  small crooked dead / bare tree
 *
 * Palette: matte, desaturated, DARK — muted swamp brown-green / dry tan-olive,
 * consistent with the dark/dirty tile redesign (swamp_0 avg rgb ~61,54,42). No
 * neon. Lit upper-left. Transparent PNG. Base anchor = bottom-center.
 *
 * BASE CLEANUP: reeds are themselves tan/olive so the tree "grass-green colour
 * band" cleaner would eat their stems — reeds use the GEOMETRIC cone only
 * (colourClean=false). Dead trees keep the full cone + colour cleaner.
 *
 * Output:
 *   assets/style-test/props/swamp_1.png .. swamp_8.png
 *   assets/style-test/props/swamp_preview.png       (dense scatter on swamp_0)
 *   assets/style-test/props/_swamp_contact_sheet.png (checkerboard grid)
 *
 * Usage:
 *   node scripts/swamp-props-style-test.cjs            # all + previews
 *   node scripts/swamp-props-style-test.cjs swamp_3    # one
 *   node scripts/swamp-props-style-test.cjs swamp_3 42 # one, seed override
 *   node scripts/swamp-props-style-test.cjs clean      # re-run post from nobg, no fal
 *   node scripts/swamp-props-style-test.cjs preview    # rebuild previews only
 *
 * NO integrate / commit / cap-sync — style test only.
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
const SWAMP_TILE = path.join(ROOT, 'src', 'assets', 'tiles', 'swamp', 'swamp_0.webp');

const GEN_W = 512, GEN_H = 768;

// Shared style anchor — identical across prompts so the set reads as one family.
// Front-loads the cut-out + no-ground + own-base intent (flux weights the head).
const SHARED_ANCHOR =
  'isometric 2.5D perspective single small swamp plant game sprite, ' +
  'thin bare stems clustered at the very base on empty transparency, ' +
  'matte desaturated very muted dark swamp palette, dry olive-brown, muddy grey-green, dull tan, drab, low saturation, ' +
  'grimy weathered dead marsh vegetation, dark moody naturalistic, ' +
  'lit from upper left with soft top-down light, subtle form shadow on the plant itself only, ' +
  'the plant stems end cleanly at the very bottom center of the frame, ' +
  'isolated single specimen, botanical cutout, studio product shot, ' +
  'on a plain flat pale neutral grey background, ' +
  'absolutely no ground, no soil, no mud, no water, no puddle, no grass patch, no terrain, no rocks, no platform beneath the plant, ' +
  'nothing under the plant except its own thin stems on empty background, ' +
  'matching a dark gritty grimy sci-fi alien-planet swamp biome aesthetic';

const NEGATIVE_PROMPT =
  'bright, neon, vivid, saturated, vibrant green, lush green, glowing, cartoon, anime, fantasy, cute, cheerful, flowers, blossom, ' +
  'text, logo, watermark, frame, border, ' +
  'background scenery, landscape, whole marsh, field of reeds, wall of reeds, ' +
  'ground, ground plane, grass patch, lawn, moss patch, soil, dirt, dirt mound, mud, mud patch, ' +
  'terrain disc, earth disc, rocks, stones, boulders, pebbles, undergrowth, bushes at base, ' +
  'water, puddle, pool, pond, reflection, ripples, shadow on ground, cast ground shadow, base platform, island, ' +
  'people, animals, buildings, pot, planter, flowerpot, vase, cropped, cut off top, out of frame';

// 8 variants: 6 reeds/cattails/sedge + 2 small dead trees.
// deadTree flag drives base colour-clean + preview sizing pool.
const PROPS = {
  swamp_1: {
    seed: 310411, desc: 'tall reed clump', deadTree: false,
    add: 'a tall slender clump of dry swamp reeds, a bundle of thin straight vertical reed stalks of slightly varied height, ' +
      'narrow drooping blade leaves, dull olive-brown and pale tan dried tips, stems gathered to a thin base',
  },
  swamp_2: {
    seed: 310875, desc: 'medium reed clump', deadTree: false,
    add: 'a medium clump of swamp reeds, a small bundle of thin upright reed stalks, ' +
      'a few narrow arching leaf blades, muted dry grey-green and tan, short and modest, thin gathered base',
  },
  swamp_3: {
    seed: 317442, desc: 'cattail / bulrush clump (brown seed heads)', deadTree: false,
    add: 'a clump of cattails bulrush, a few tall thin straight stems each topped with a dark brown cylindrical sausage-shaped cattail seed head, ' +
      'long narrow blade leaves, dull brown and drab olive, thin gathered base',
  },
  swamp_4: {
    seed: 314120, desc: 'short sedge / grass tuft', deadTree: false,
    add: 'a short dense tuft of swamp sedge grass, a low spray of thin arching wiry blades fanning outward, ' +
      'dry dull tan and muted olive, small and low, narrow gathered base',
  },
  swamp_5: {
    seed: 312018, desc: 'tall bent windswept reeds', deadTree: false,
    add: 'a clump of tall reeds bent and leaning to one side as if windswept, thin stalks curving over, ' +
      'wispy drooping dried leaf blades, dull olive-brown and pale straw tan, thin gathered base',
  },
  swamp_6: {
    seed: 312477, desc: 'cattail clump, mixed heights', deadTree: false,
    add: 'a mixed clump of marsh cattails and reeds of varied heights, one or two dark brown cylindrical cattail seed heads among thin bare stalks, ' +
      'sparse narrow leaves, drab muddy olive and dull tan, thin gathered base',
  },
  swamp_7: {
    seed: 312918, desc: 'small dead / bare tree', deadTree: true,
    add: 'a small bare leafless dead swamp tree, entirely defoliated skeletal small tree, ' +
      'thin twiggy bare branches and forked twigs, gnarled cracked grey-brown trunk, dry brittle dead wood, short and small, ' +
      'exposed bare roots flaring at the very base',
  },
  swamp_8: {
    seed: 313345, desc: 'small crooked dead / bare tree', deadTree: true,
    add: 'a small crooked twisted bare dead swamp tree, bent leaning gnarled leafless trunk, ' +
      'sparse skeletal windswept bare branches and twigs, grey-brown weathered dead wood, short and small, ' +
      'exposed bare roots flaring at the very base',
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
    `absolutely no ground, no water, no mud, no grass patch, no soil, no terrain, no platform beneath the plant, ` +
    `only the plant and its own thin stems, the stems end cleanly at the bottom, ${SHARED_ANCHOR}`;
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
// Erase any ground residue (mud disc / water puddle / grass slab) at the base
// while keeping the plant's own thin stems/roots.
//   1) cone: find the stem column low in the sprite, then in the lower region
//      delete opaque pixels that splay OUTSIDE a cone widening downward from the
//      stem base. Ground discs/puddles extend far wider -> removed. Narrow
//      stems inside the cone -> kept.
//   2) colourClean (dead trees only): inside the very bottom band, delete pixels
//      that are grass-green or light soil/tan -> removes grass tufts and soil
//      directly under the trunk. DISABLED for reeds (the reeds ARE tan/olive).
async function cleanBase(rgbaBuf, { colourClean }) {
  const trimmed = await sharp(rgbaBuf).trim({ threshold: 10 }).ensureAlpha().png().toBuffer();
  const { data, info } = await sharp(trimmed).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels; // C=4
  const A = (x, y) => data[(y * W + x) * C + 3];
  const isReed = !colourClean;

  // central opaque run nearest horizontal center at a row -> {cx, half}
  function runAtRow(ry) {
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
  // total opaque span (leftmost..rightmost) at a row -> half-width
  function spanHalfAtRow(ry) {
    let lo = -1, hi = -1;
    for (let x = 0; x < W; x++) if (A(x, ry) > 40) { if (lo < 0) lo = x; hi = x; }
    return lo < 0 ? 0 : (hi - lo) / 2 + 1;
  }

  if (isReed) {
    // Reeds: the stems converge to a narrow NECK just above the baked flat
    // water/mud disc. Find that neck (min total span in the lower band), then
    // clip everything below it that splays wider than a narrow constant column.
    // This erases the wide disc while keeping the thin gathered stem bundle.
    // neck = narrowest CENTRAL contiguous run in the lower band (the point where
    // stems gather just above the disc). Using the central run — not total span —
    // ignores stray drooping blade tips that would otherwise inflate the width.
    const y0 = Math.round(H * 0.62), y1 = Math.round(H * 0.92);
    let neck = null;
    for (let y = y0; y <= y1; y += 2) {
      const r = runAtRow(y);
      if (!r) continue;
      if (!neck || r.half < neck.half) neck = { y, half: r.half, cx: r.cx };
    }
    if (!neck) neck = { y: Math.round(H * 0.80), half: W * 0.08, cx: W / 2 };
    const colHalf = Math.min(neck.half * 1.7 + 6, W * 0.14);
    const clipFromY = Math.max(0, neck.y - 4);
    const greenBandY = Math.round(H * 0.78);
    for (let y = clipFromY; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * C;
        if (data[idx + 3] === 0) continue;
        if (Math.abs(x - neck.cx) > colHalf) { data[idx + 3] = 0; continue; }
        // backup: kill flat olive/grey-green water-disc residue inside the column
        // low down (stems are brown r>=g and survive; the disc is g-dominant).
        if (y >= greenBandY) {
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          if (g >= r + 3 && g >= b + 3 && max > 50) { data[idx + 3] = 0; continue; }
          // bright low-saturation water-disc specular highlight -> remove
          if (max > 140 && sat < 0.30) { data[idx + 3] = 0; continue; }
          // light flat tan/grey soil pedestal in the very-bottom band (brighter &
          // less saturated than the dark reed stems) -> remove
          if (y >= H - Math.round(H * 0.10) && max > 118 && r >= g && g >= b && sat < 0.42) {
            data[idx + 3] = 0;
          }
        }
      }
    }
  } else {
    // Dead trees: real roots splay outward -> keep a downward-WIDENING cone plus
    // grass-green / light-soil colour cleanup in the very-foot band.
    let samples = [];
    for (const frac of [0.74, 0.78, 0.82, 0.86]) {
      const t = runAtRow(Math.min(H - 1, Math.round(H * frac)));
      if (t) samples.push(t);
    }
    const stem = samples.length
      ? { cx: samples.map((s) => s.cx).sort((a, b) => a - b)[Math.floor(samples.length / 2)],
          half: samples.map((s) => s.half).sort((a, b) => a - b)[Math.floor(samples.length / 2)] }
      : { cx: W / 2, half: Math.max(6, W * 0.06) };
    stem.half = Math.min(stem.half, W * 0.14);
    const coneStartY = Math.round(H * 0.72);
    const bottomHalf = Math.min(W / 2, stem.half * 2.6 + 6);
    const span = Math.max(1, (H - 1) - coneStartY);
    const colourBandY = Math.round(H * 0.86);
    for (let y = coneStartY; y < H; y++) {
      const t = (y - coneStartY) / span;
      const allowedHalf = stem.half + (bottomHalf - stem.half) * t;
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * C;
        if (data[idx + 3] === 0) continue;
        if (Math.abs(x - stem.cx) > allowedHalf) { data[idx + 3] = 0; continue; }
        if (y >= colourBandY) {
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          const isGrass = g > r + 8 && g > b + 8 && max > 60;
          const isLightSoil = max > 105 && r >= g && g >= b && sat > 0.12;
          const isRoot = max <= 120 && !(g > r + 12 && g > b + 12);
          if ((isGrass || isLightSoil) && !isRoot) data[idx + 3] = 0;
        }
      }
    }
  }

  // Drop detached fragments (leftover disc rim slivers, stray ground bits) by
  // keeping only opaque pixels connected (8-way) to the plant body — seeded from
  // every opaque pixel in the top 55% (foliage / branches). Roots/stems stay
  // because they connect upward to the body.
  {
    const seedYmax = Math.round(H * 0.55);
    const visited = new Uint8Array(W * H);
    const stack = [];
    for (let y = 0; y < seedYmax; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (data[p * C + 3] > 0 && !visited[p]) { visited[p] = 1; stack.push(p); }
    }
    while (stack.length) {
      const p = stack.pop(); const px = p % W, py = (p / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const np = ny * W + nx;
        if (!visited[np] && data[np * C + 3] > 0) { visited[np] = 1; stack.push(np); }
      }
    }
    for (let p = 0; p < W * H; p++) if (data[p * C + 3] > 0 && !visited[p]) data[p * C + 3] = 0;
  }

  const cleaned = await sharp(Buffer.from(data), { raw: { width: W, height: H, channels: C } }).png().toBuffer();
  return sharp(cleaned).trim({ threshold: 10 }).png().toBuffer();
}

// ── COLOUR GRADE ────────────────────────────────────────────────────────────
// Unify + push the set into the dark muddy swamp palette (swamp_0 avg ~61,54,42).
// Per opaque pixel (alpha untouched): mild de-green/warm, darken, then blend
// toward muddy dark-olive grime. Matte + desaturated, no neon.
const GRADE = {
  gR: 1.06, gG: 0.98, gB: 0.82, // gentle warm / de-green (kills any bright green)
  darken: 0.82,
  grime: [56, 50, 36], grimeMix: 0.20,
  saturation: 0.68,
};
function clamp8(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
async function colourGrade(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const C = info.channels, gm = GRADE.grimeMix, gk = 1 - gm;
  for (let i = 0; i < data.length; i += C) {
    if (data[i + 3] === 0) continue;
    let R = data[i] * GRADE.gR, G = data[i + 1] * GRADE.gG, B = data[i + 2] * GRADE.gB;
    R *= GRADE.darken; G *= GRADE.darken; B *= GRADE.darken;
    R = R * gk + GRADE.grime[0] * gm;
    G = G * gk + GRADE.grime[1] * gm;
    B = B * gk + GRADE.grime[2] * gm;
    data[i] = clamp8(R); data[i + 1] = clamp8(G); data[i + 2] = clamp8(B);
  }
  const graded = await sharp(Buffer.from(data), { raw: { width: info.width, height: info.height, channels: C } })
    .png().toBuffer();
  return sharp(graded).modulate({ saturation: GRADE.saturation }).png().toBuffer();
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
  const cfg = PROPS[id];
  const noBg = fs.readFileSync(path.join(DIR_NOBG, `${id}_nobg.png`));
  const cleaned = await cleanBase(noBg, { colourClean: !!cfg.deadTree });
  const graded = await colourGrade(cleaned);
  const { buf } = await anchorBottomCenter(graded);
  fs.writeFileSync(path.join(DIR_CROP, `${id}_cropped.png`), buf);
  const outPath = path.join(DIR_OUT, `${id}.png`);
  fs.writeFileSync(outPath, buf);
  const fm = await sharp(buf).metadata();
  console.log(`  [save] ${outPath} (${fm.width}x${fm.height}, alpha=${fm.hasAlpha})`);
}

async function runProp(id, cfg) {
  console.log(`[gen] ${id} — ${cfg.desc} (seed ${cfg.seed})`);
  const raw = await generateImage(cfg.add, cfg.seed);
  fs.writeFileSync(path.join(DIR_RAW, `${id}_raw.png`), raw);
  const falUrl = await uploadToFal(raw, `${id}_raw.png`);
  const noBg = await removeBackground(falUrl);
  fs.writeFileSync(path.join(DIR_NOBG, `${id}_nobg.png`), noBg);
  await postProcess(id);
}

// ── DENSE SCATTER PREVIEW ───────────────────────────────────────────────────
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

async function buildPreview() {
  const ids = Object.keys(PROPS).filter((id) => fs.existsSync(path.join(DIR_OUT, `${id}.png`)));
  if (!ids.length) { console.log('  [preview] no candidates yet, skipping'); return; }

  const tileW = 512, tileH = 256, cx = 256, groundY = 128;
  const topPad = 300, sidePad = 60, botPad = 40;
  const canvasW = tileW + sidePad * 2, canvasH = topPad + tileH + botPad;
  const tileLeft = sidePad, tileTop = topPad;
  const tile = await sharp(SWAMP_TILE).png().toBuffer();

  const props = {};
  for (const id of ids) {
    const b = fs.readFileSync(path.join(DIR_OUT, `${id}.png`));
    const m = await sharp(b).metadata();
    props[id] = { buf: b, w: m.width, h: m.height, deadTree: PROPS[id].deadTree };
  }
  const reedIds = ids.filter((id) => !PROPS[id].deadTree);
  const treeIds = ids.filter((id) => PROPS[id].deadTree);

  const rnd = mulberry32(90210);
  // swamp g is dense (~3.7) -> pack many. Reeds dominate, trees are rare accents.
  const N = 13;
  const placements = [];
  for (let i = 0; i < N; i++) {
    const u = 0.07 + rnd() * 0.86;
    const v = 0.07 + rnd() * 0.86;
    const sx = cx + (u - v) * (tileW / 2);
    const sy = groundY + (u + v - 1) * (tileH / 2);
    const useTree = treeIds.length && rnd() < 0.15;
    const pool = useTree ? treeIds : reedIds;
    const id = pool[Math.floor(rnd() * pool.length)];
    // on-tile height: reeds 60-120px (dense), dead trees 130-175px (accents)
    const th = useTree ? 130 + rnd() * 45 : 60 + rnd() * 60;
    placements.push({ id, sx, sy, th });
  }
  placements.sort((a, b) => a.sy - b.sy); // painter: back -> front

  const layers = [{ input: tile, left: tileLeft, top: tileTop }];
  for (const p of placements) {
    const t = props[p.id];
    const scale = p.th / t.h;
    const w = Math.max(1, Math.round(t.w * scale)), h = Math.max(1, Math.round(t.h * scale));
    const resized = await sharp(t.buf).resize(w, h).png().toBuffer();
    layers.push({ input: resized, left: Math.round(tileLeft + p.sx - w / 2), top: Math.round(tileTop + p.sy - h) });
  }

  const preview = await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: { r: 22, g: 24, b: 20, alpha: 1 } },
  }).composite(layers).png().toBuffer();
  const outPath = path.join(DIR_OUT, 'swamp_preview.png');
  fs.writeFileSync(outPath, preview);
  console.log(`  [preview] ${outPath} (${canvasW}x${canvasH}, ${N} props)`);
}

// ── CONTACT SHEET (checkerboard bg, labelled) ─────────────────────────────────
function checkerboard(W, H, sq = 16) {
  const buf = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const on = ((x / sq | 0) + (y / sq | 0)) % 2 === 0;
    const v = on ? 204 : 153; const i = (y * W + x) * 4;
    buf[i] = v; buf[i + 1] = v; buf[i + 2] = v; buf[i + 3] = 255;
  }
  return sharp(buf, { raw: { width: W, height: H, channels: 4 } });
}

async function buildContactSheet() {
  const ids = Object.keys(PROPS).filter((id) => fs.existsSync(path.join(DIR_OUT, `${id}.png`)));
  if (!ids.length) return;
  const cols = 4, rows = Math.ceil(ids.length / cols), cellW = 262, cellH = 353, hdr = 20;
  const W = cols * cellW, H = rows * cellH;
  const base = checkerboard(W, H);
  const layers = [];
  for (let idx = 0; idx < ids.length; idx++) {
    const id = ids[idx];
    const col = idx % cols, row = (idx / cols) | 0;
    const cellL = col * cellW, cellT = row * cellH;
    const b = fs.readFileSync(path.join(DIR_OUT, `${id}.png`));
    const m = await sharp(b).metadata();
    const availW = cellW - 24, availH = cellH - hdr - 16;
    const scale = Math.min(availW / m.width, availH / m.height, 1);
    const w = Math.round(m.width * scale), h = Math.round(m.height * scale);
    const resized = await sharp(b).resize(w, h).png().toBuffer();
    layers.push({ input: resized, left: cellL + ((cellW - w) >> 1), top: cellT + hdr + (cellH - hdr - h) - 8 });
    const label = `${id} ${m.width}x${m.height}`;
    const svg = `<svg width="${cellW}" height="${hdr}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="0" width="${cellW}" height="${hdr}" fill="rgba(0,0,0,0.82)"/>` +
      `<text x="6" y="14" font-family="monospace" font-size="12" fill="#cfcfc0">${label}</text></svg>`;
    layers.push({ input: Buffer.from(svg), left: cellL, top: cellT });
  }
  const sheet = await base.composite(layers).png().toBuffer();
  fs.writeFileSync(path.join(DIR_OUT, '_swamp_contact_sheet.png'), sheet);
  console.log(`  [contact] _swamp_contact_sheet.png (${W}x${H})`);
}

(async () => {
  for (const d of [DIR_RAW, DIR_NOBG, DIR_CROP, DIR_OUT]) fs.mkdirSync(d, { recursive: true });
  const arg = (process.argv[2] || '').toLowerCase();
  const seedOverride = process.argv[3] ? parseInt(process.argv[3], 10) : null;

  if (arg === 'preview') { await buildPreview(); await buildContactSheet(); console.log('done'); return; }
  if (arg === 'clean') {
    for (const id of Object.keys(PROPS)) {
      if (fs.existsSync(path.join(DIR_NOBG, `${id}_nobg.png`))) { console.log(`[clean] ${id}`); await postProcess(id); }
    }
    await buildPreview(); await buildContactSheet(); console.log('done'); return;
  }

  if (!FAL_API_KEY) { console.error('No fal key in scripts/.env'); process.exit(1); }
  for (const [id, cfg] of Object.entries(PROPS)) {
    if (arg && arg !== id) continue;
    const eff = seedOverride != null ? { ...cfg, seed: seedOverride } : cfg;
    try { await runProp(id, eff); }
    catch (e) { console.error(`ERR ${id}: ${e.message}`); }
  }
  await buildPreview();
  await buildContactSheet();
  console.log('done');
})();
