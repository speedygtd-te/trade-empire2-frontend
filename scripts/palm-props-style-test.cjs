/**
 * Asset-Pipeline (STYLE TEST): OASIS biome prop-layer PALM sprites.
 *
 * Mirrors scripts/tree-props-v2-style-test.cjs. Palms for the oasis biome (mid `g`,
 * a few per tile). Varied silhouettes/heights: tall date-palm, shorter fan-palm,
 * small young palm, leaning palm, bare/sparse palm, + one extra.
 *
 * Key constraints (same discipline as the tree props):
 *   - NO ground / sand disc / puddle under the palm. The only thing at the base is
 *     the palm's own trunk foot / exposed roots on FULL transparency. Enforced by
 *     (a) hard anti-ground cutout prompt, (b) birefnet bg-remove, (c) GEOMETRIC
 *     "root cone" base cleaner that erases any wide disc splaying beyond the trunk,
 *     (d) color pass that erases sand-tan / grass-green directly under the trunk.
 *   - Matte, DESATURATED, DARK: muted deep-green fronds + dry brown trunk. No neon /
 *     tropical-bright. Lit upper-left. Transparent PNG. Base anchor = bottom-center.
 *
 * Pipeline per palm:
 *   flux/dev @512x768 portrait -> raw PNG
 *   birefnet/v2 bg removal     -> nobg PNG
 *   trim + rootConeClean + baseColorClean + retrim + colorGrade + bottom-center pad -> final PNG
 *
 * Output:
 *   assets/style-test/props/palm_1.png .. palm_6.png
 *   assets/style-test/props/palm_preview.png  (scatter on oasis_0)
 *
 * Usage:
 *   node scripts/palm-props-style-test.cjs               # all + preview
 *   node scripts/palm-props-style-test.cjs palm_3        # one
 *   node scripts/palm-props-style-test.cjs palm_3 4711   # one, seed override
 *   node scripts/palm-props-style-test.cjs clean         # re-run post from nobg, no fal
 *   node scripts/palm-props-style-test.cjs preview       # rebuild preview only
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
const OASIS_TILE = path.join(ROOT, 'src', 'assets', 'tiles', 'oasis', 'oasis_0.webp');

const GEN_W = 512, GEN_H = 768;

// Shared style anchor — identical across prompts so the set reads as one family.
// Front-loads the cut-out + no-ground + bare-base intent (flux weights the head).
const SHARED_ANCHOR =
  'isometric 2.5D perspective single palm tree game sprite, ' +
  'a single slender palm trunk that ends cleanly at the very bottom center of the frame with its own small exposed root base, ' +
  'dark desaturated muted deep-green palm fronds, very low saturation, dark olive and grey-green tones, ' +
  'dry weathered brown palm trunk with rough fibrous bark texture, matte grimy dim naturalistic, dark moody lighting, ' +
  'lit from upper left with soft top-down light, subtle form shadow on the palm itself only, ' +
  'isolated single palm specimen, botanical cutout, studio product shot, ' +
  'on a plain flat pale neutral grey background, ' +
  'absolutely no ground, no soil, no sand, no sand mound, no dune, no grass, no dirt, no terrain, no rocks, no puddle, no oasis water, no platform beneath the palm, ' +
  'nothing under the palm except its own narrow trunk foot on empty background, ' +
  'matching a dark gritty grimy sci-fi alien-planet biome aesthetic';

const NEGATIVE_PROMPT =
  'bright, neon, vivid, saturated, vibrant green, lush tropical green, glowing, cartoon, anime, fantasy, cute, cheerful, beach resort, ' +
  'text, logo, watermark, frame, border, ' +
  'background scenery, landscape, whole oasis, multiple palms, group of palms, row of palms, palm grove, ' +
  'ground, ground plane, sand, sand dune, sand mound, beach, grass, grass patch, lawn, moss, soil, dirt, dirt mound, mud, ' +
  'terrain disc, earth disc, rocks, stones, boulders, pebbles, flowers, undergrowth, bushes at base, coconuts on ground, ' +
  'water, puddle, pool, oasis pond, reflection, shadow on ground, cast ground shadow, base platform, island of sand, ' +
  'people, animals, buildings, pot, planter, flowerpot, vase, cropped, cut off top, out of frame';

// 6 variants — varied silhouettes/heights (oasis g is mid -> small-medium, a few per tile).
const PALMS = {
  palm_1: {
    seed: 310411, desc: 'tall date-palm', tall: true,
    add: 'a tall slender date palm, single tall bare trunk with a crown of long arching pinnate feathery fronds at the very top, ' +
      'dark muted-green drooping fronds, tall and elegant, clearly the tallest palm',
  },
  palm_2: {
    seed: 310875, desc: 'shorter fan-palm', tall: false,
    add: 'a shorter stocky fan palm, thicker trunk, rounded crown of broad stiff fan-shaped palmate fronds, ' +
      'dark muted grey-green fronds, low and compact, distinctly shorter and bushier than a date palm',
  },
  palm_3: {
    seed: 517042, desc: 'small young palm', tall: false,
    add: 'a small young palm, very short thin trunk barely emerged, a modest low tuft of a few dark muted-green fronds, ' +
      'small and low, clearly a young juvenile palm',
  },
  palm_4: {
    seed: 448520, desc: 'leaning palm', tall: true,
    add: 'a tall palm with a curved leaning trunk bending to one side, asymmetric windswept crown of long dark muted-green fronds, ' +
      'trunk clearly bent and leaning, irregular silhouette',
  },
  palm_5: {
    seed: 771404, desc: 'bare / sparse palm', tall: true,
    add: 'a tall dying half-dead palm, very long bare naked thin trunk, an extremely sparse crown of just three or four ragged drooping withered fronds, ' +
      'mostly brown dead brittle hanging dead fronds skirt, almost leafless, gaunt skeletal thin silhouette, sickly and barren, clearly a dying sparse palm not a healthy full one',
  },
  palm_6: {
    seed: 312477, desc: 'medium twin-lean palm', tall: false,
    add: 'a medium palm with a gently curved trunk and a full but modest crown of arching pinnate dark muted-green fronds, ' +
      'medium height between the tall and small palms, balanced silhouette',
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
    `absolutely no ground, no sand, no grass, no soil, no dirt, no terrain, no platform beneath the palm, ` +
    `only the palm and its own narrow trunk foot, the trunk ends cleanly at the bottom, ${SHARED_ANCHOR}`;
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
// Erase any ground residue (sand disc / grass / puddle) at the base while keeping
// the palm's own narrow trunk foot. Palms have a wide frond crown at the TOP and a
// narrow trunk at the bottom, so the cone (which only acts in the lower region) never
// touches the fronds.
//   1) rootCone: find the trunk column low in the sprite, then in the lower region
//      delete opaque pixels splaying OUTSIDE a cone widening downward from the trunk.
//   2) baseColorClean: in the very bottom band, delete sand-tan / grass-green pixels
//      (not dark trunk/root) -> removes sand disc / tufts directly under the trunk.
async function cleanBase(rgbaBuf) {
  const trimmed = await sharp(rgbaBuf).trim({ threshold: 10 }).ensureAlpha().png().toBuffer();
  const { data, info } = await sharp(trimmed).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels; // C=4
  const A = (x, y) => data[(y * W + x) * C + 3];

  // find trunk center + half-width at a reference row. Measure ONLY the opaque run
  // nearest horizontal center (the trunk column), ignoring the wide sand disc.
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
  // Sample the PURE-TRUNK zone (0.60–0.76 down). Below ~0.78 the baked sand disc
  // blooms 4-8x wider than the trunk, so sampling lower would poison the estimate.
  let samples = [];
  for (const frac of [0.60, 0.66, 0.72, 0.76]) {
    const t = trunkAtRow(Math.min(H - 1, Math.round(H * frac)));
    if (t) samples.push(t);
  }
  const med = (arr) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)];
  const trunk = samples.length
    ? { cx: med(samples.map((s) => s.cx)), half: med(samples.map((s) => s.half)) }
    : { cx: W / 2, half: Math.max(6, W * 0.05) };
  // Clamp trunk half hard: palm trunks are narrow — this stops any stray-wide sample
  // from opening the cone onto the disc.
  trunk.half = Math.min(trunk.half, W * 0.10);

  // Cone kicks in right where the disc blooms (~0.78 down) and stays TIGHT: palms
  // have almost no root flare, so allow only ~1.4x trunk half at the very foot. Any
  // opaque pixel splaying wider than this is disc/puddle -> erased. Geometric, so it
  // works regardless of the disc's colour.
  const coneStartY = Math.round(H * 0.78);
  const topHalf = trunk.half * 1.15;
  const bottomHalf = trunk.half * 1.45 + 3;
  const span = Math.max(1, (H - 1) - coneStartY);

  const colorBandY = coneStartY; // colour cleanup across the whole cone foot region

  for (let y = coneStartY; y < H; y++) {
    const t = (y - coneStartY) / span;
    const allowedHalf = topHalf + (bottomHalf - topHalf) * t;
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * C;
      if (data[idx + 3] === 0) continue;
      // (1) cone: kill anything splaying wider than the tight root cone
      if (Math.abs(x - trunk.cx) > allowedHalf) { data[idx + 3] = 0; continue; }
      // (2) colour: within the cone foot band, also kill sand-tan / grass-green,
      // keeping only the dark trunk foot (belt-and-suspenders vs. a thin disc lip).
      if (y >= colorBandY) {
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const max = Math.max(r, g, b);
        const isGrass = g > r + 8 && g > b + 8 && max > 60;             // green tuft
        // Sand/tan disc lip is distinctly BRIGHT (max > 150) and warm (r>g>b). The
        // dark palm trunk peaks well below that, so this catches the beige remnant
        // without nibbling the trunk foot. (Saturation is not capped — the raw disc
        // is more saturated than the graded output.)
        const isSandTan = max > 150 && r >= g && g >= b && (r - b) > 14;
        if (isGrass || isSandTan) data[idx + 3] = 0;
      }
    }
  }

  // (3) despeckle: remove small disconnected opaque blobs (bg-removal specks/haloes
  // floating near the base) via connected-component labelling; keep only components
  // >= 0.4% of the total opaque area.
  const total = (() => { let n = 0; for (let p = 0; p < W * H; p++) if (data[p * C + 3] > 20) n++; return n; })();
  const minArea = Math.max(24, Math.round(total * 0.004));
  const label = new Int32Array(W * H).fill(0);
  const stack = new Int32Array(W * H);
  let cur = 0;
  for (let p0 = 0; p0 < W * H; p0++) {
    if (data[p0 * C + 3] <= 20 || label[p0] !== 0) continue;
    cur++;
    let sp = 0; stack[sp++] = p0; label[p0] = cur; const members = [p0];
    while (sp > 0) {
      const p = stack[--sp];
      const px = p % W, py = (p / W) | 0;
      const nb = [];
      if (px > 0) nb.push(p - 1);
      if (px < W - 1) nb.push(p + 1);
      if (py > 0) nb.push(p - W);
      if (py < H - 1) nb.push(p + W);
      for (const q of nb) {
        if (data[q * C + 3] > 20 && label[q] === 0) { label[q] = cur; stack[sp++] = q; members.push(q); }
      }
    }
    if (members.length < minArea) for (const q of members) data[q * C + 3] = 0;
  }

  const cleaned = await sharp(Buffer.from(data), { raw: { width: W, height: H, channels: C } })
    .png().toBuffer();
  // retrim (cone/color removal may have opened transparent margins)
  return sharp(cleaned).trim({ threshold: 10 }).png().toBuffer();
}

// gentle color grade to unify the set: knock down saturation + brightness so
// nothing reads neon/bright, matching the dark/dirty tiles.
async function colorGrade(buf) {
  return sharp(buf).modulate({ saturation: 0.70, brightness: 0.9 }).png().toBuffer();
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

async function runPalm(id, cfg) {
  console.log(`[gen] ${id} — ${cfg.desc} (seed ${cfg.seed})`);
  const raw = await generateImage(cfg.add, cfg.seed);
  fs.writeFileSync(path.join(DIR_RAW, `${id}_raw.png`), raw);
  const falUrl = await uploadToFal(raw, `${id}_raw.png`);
  const noBg = await removeBackground(falUrl);
  fs.writeFileSync(path.join(DIR_NOBG, `${id}_nobg.png`), noBg);
  await postProcess(id);
}

// ── SCATTER PREVIEW ─────────────────────────────────────────────────────────
// Scatter ~5-8 palms (mixed variants + sizes, seeded jitter) inside the oasis
// diamond. Painter's order: sort by ground-contact Y (back-to-front).
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

async function buildPreview() {
  const ids = Object.keys(PALMS).filter((id) => fs.existsSync(path.join(DIR_OUT, `${id}.png`)));
  if (!ids.length) { console.log('  [preview] no candidates yet, skipping'); return; }

  const tileW = 512, tileH = 256, cx = 256, groundY = 128; // diamond contact center
  const topPad = 380, sidePad = 70, botPad = 40;
  const canvasW = tileW + sidePad * 2;
  const canvasH = topPad + tileH + botPad;
  const tileLeft = sidePad, tileTop = topPad;
  const tile = await sharp(OASIS_TILE).png().toBuffer();

  // preload palms + metadata
  const palms = {};
  for (const id of ids) {
    const b = fs.readFileSync(path.join(DIR_OUT, `${id}.png`));
    const m = await sharp(b).metadata();
    palms[id] = { buf: b, w: m.width, h: m.height, tall: PALMS[id].tall };
  }
  const tallIds = ids.filter((id) => PALMS[id].tall);
  const shortIds = ids.filter((id) => !PALMS[id].tall);

  const rnd = mulberry32(74021);
  // seeded scatter across the diamond. Sub-tile coords u,v in [0,1] map onto the
  // iso diamond floor:
  //   screenX = cx + (u - v)*(tileW/2)
  //   contactY = groundY + (u + v - 1)*(tileH/2)
  const N = 7;
  const placements = [];
  for (let i = 0; i < N; i++) {
    const u = 0.10 + rnd() * 0.80; // margin so foot doesn't overhang the tile edge
    const v = 0.10 + rnd() * 0.80;
    const sx = cx + (u - v) * (tileW / 2);
    const sy = groundY + (u + v - 1) * (tileH / 2); // ground-contact Y within tile
    // pick variant: mix tall + short (~40% tall)
    const useTall = tallIds.length && rnd() < 0.42;
    const pool = (useTall ? tallIds : shortIds).length ? (useTall ? tallIds : shortIds) : ids;
    const id = pool[Math.floor(rnd() * pool.length)];
    // target on-tile height: tall 200-270px, short 110-165px (mid `g` -> a few per tile)
    const th = useTall ? 200 + rnd() * 70 : 110 + rnd() * 55;
    placements.push({ id, sx, sy, th });
  }
  // painter: back (small sy) to front (large sy)
  placements.sort((a, b) => a.sy - b.sy);

  const layers = [{ input: tile, left: tileLeft, top: tileTop }];
  for (const p of placements) {
    const t = palms[p.id];
    const scale = p.th / t.h;
    const w = Math.max(1, Math.round(t.w * scale));
    const h = Math.max(1, Math.round(t.h * scale));
    const resized = await sharp(t.buf).resize(w, h).png().toBuffer();
    const left = Math.round(tileLeft + p.sx - w / 2);
    const top = Math.round(tileTop + p.sy - h); // base flush to contact point
    layers.push({ input: resized, left, top });
  }

  const preview = await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: { r: 24, g: 24, b: 22, alpha: 1 } },
  }).composite(layers).png().toBuffer();
  const outPath = path.join(DIR_OUT, 'palm_preview.png');
  fs.writeFileSync(outPath, preview);
  console.log(`  [preview] ${outPath} (${canvasW}x${canvasH}, ${N} palms)`);
}

// contact sheet on a checkerboard to VERIFY clean bases (no sand disc)
async function buildContactSheet() {
  const ids = Object.keys(PALMS).filter((id) => fs.existsSync(path.join(DIR_OUT, `${id}.png`)));
  if (!ids.length) return;
  const cell = 300, cols = 3, rows = Math.ceil(ids.length / cols);
  // checkerboard background
  const sq = 20;
  const cbW = cols * cell, cbH = rows * cell;
  const cb = Buffer.alloc(cbW * cbH * 3);
  for (let y = 0; y < cbH; y++) for (let x = 0; x < cbW; x++) {
    const on = ((Math.floor(x / sq) + Math.floor(y / sq)) % 2) === 0;
    const v = on ? 210 : 170;
    const i = (y * cbW + x) * 3; cb[i] = v; cb[i + 1] = v; cb[i + 2] = v;
  }
  const layers = [];
  for (let k = 0; k < ids.length; k++) {
    const id = ids[k];
    const b = fs.readFileSync(path.join(DIR_OUT, `${id}.png`));
    const m = await sharp(b).metadata();
    const maxH = cell - 30, maxW = cell - 20;
    const scale = Math.min(maxW / m.width, maxH / m.height);
    const w = Math.round(m.width * scale), h = Math.round(m.height * scale);
    const resized = await sharp(b).resize(w, h).png().toBuffer();
    const col = k % cols, row = Math.floor(k / cols);
    layers.push({ input: resized, left: col * cell + Math.round((cell - w) / 2), top: row * cell + (cell - 15 - h) });
  }
  const sheet = await sharp(cb, { raw: { width: cbW, height: cbH, channels: 3 } })
    .composite(layers).png().toBuffer();
  const outPath = path.join(DIR_OUT, 'palm_contact_sheet.png');
  fs.writeFileSync(outPath, sheet);
  console.log(`  [contact] ${outPath} (${cbW}x${cbH})`);
}

(async () => {
  for (const d of [DIR_RAW, DIR_NOBG, DIR_CROP, DIR_OUT]) fs.mkdirSync(d, { recursive: true });
  const arg = (process.argv[2] || '').toLowerCase();
  const seedOverride = process.argv[3] ? parseInt(process.argv[3], 10) : null;

  if (arg === 'preview') { await buildPreview(); await buildContactSheet(); console.log('done'); return; }
  if (arg === 'clean') {
    for (const id of Object.keys(PALMS)) {
      if (fs.existsSync(path.join(DIR_NOBG, `${id}_nobg.png`))) {
        console.log(`[clean] ${id}`); await postProcess(id);
      }
    }
    await buildPreview(); await buildContactSheet(); console.log('done'); return;
  }

  if (!FAL_API_KEY) { console.error('No fal key in scripts/.env'); process.exit(1); }
  for (const [id, cfg] of Object.entries(PALMS)) {
    if (arg && arg !== id) continue;
    const eff = seedOverride != null ? { ...cfg, seed: seedOverride } : cfg;
    try { await runPalm(id, eff); }
    catch (e) { console.error(`ERR ${id}: ${e.message}`); }
  }
  await buildPreview();
  await buildContactSheet();
  console.log('done');
})();
