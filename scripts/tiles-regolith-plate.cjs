/**
 * REGOLITH_2 FROM REGOLITH_0 -- STEP 1: THE RIMLESS PLATE, AND FOUR SENTENCES.
 *
 * STYLE TEST. Writes only into assets/style-test/tiles/regolith_fix/plate/.
 * NOTHING is written to src/assets/tiles/. No cap sync, no build, no git.
 *
 * WHY THIS EXISTS
 *   regolith_2 is one enormous smooth crater basin filling most of the diamond.
 *   In a four-slot field it is recognisable at a glance and repeats visibly.
 *   Rudi: "regolith_2 muss geloescht werden und neu generiert werden, am besten
 *   aus regolith_0 abgeleitet." The rest of regolith stays exactly as it is.
 *
 * WHY A PLATE AND NOT THE TILE (LESSONS 3)
 *   flux reads the diamond mask as the PICTURE FRAME and pins its shapes to it
 *   -- three crevasse rounds proved it, two slots came back as radial mandalas.
 *   So flux never sees the diamond: regolith_0 is laid into the gapless iso
 *   lattice, a RIMLESS square is texture-bombed out of it, flux draws into that,
 *   and the tile is cut out afterwards (step 2).
 *
 * WHY 768x512 AND NOT LARGER
 *   Round 3 of crevasse used a 1024x1024 plate with a 512x256 window -- one
 *   EIGHTH of the plate by area -- and the shapes arrived at a third of their
 *   intended size with the grain gone. Here the window is 2/3 x 1/2 = ONE THIRD
 *   of the plate by area, so what flux draws at plate scale is roughly what
 *   lands in the tile. Copied from tiles-frozen-lake-plate.cjs, which is the one
 *   plate in the corpus that was built correctly.
 *
 * ORIENTATIONS: as-is and horizontal flop ONLY.
 *   regolith_0 carries a strong top-bright ramp (tiltY 29.9). A vertical flip
 *   would invert the baked shading -- craters become domes (LESSONS 4). The ICE
 *   corpus convention is horizontal mirroring anyway.
 *
 * THE PROMPTS ARE SCOPED SUBSTITUTIONS WITH NO COLOUR AND NO LIGHT WORDS
 *   LESSONS 3: "pale bluish white ice" returned white paper; "dark blue grey,
 *   dim, unlit, matte" returned a studio backdrop. Both failures were caused by
 *   the COLOUR and LIGHT words. The grade sets level and hue afterwards, so the
 *   sentence asks for GEOMETRY only. And no negatives -- a negative clause
 *   reproduces the thing it names, so every candidate says what IS there.
 *
 * NO RESCALE UP, EVER. flux/kontext often returns 1248x832; step 2 resizes that
 * BACK DOWN to 768x512 and never the other way.
 *
 * Output (assets/style-test/tiles/regolith_fix/plate/)
 *   plate.png          the rimless bombed square flux is shown
 *   <ID>_kraw.png      the raw flux return, never resized here
 *   <ID>_prompt.txt    the exact sentence
 *
 * Usage: node scripts/tiles-regolith-plate.cjs            all candidates
 *        node scripts/tiles-regolith-plate.cjs PLAIN      a subset
 *        FORCE=1 ...                                      overwrite
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const M = require('./lib-tile-metrics.cjs');
const sharp = M.sharp;

try {
  const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const FAL_API_KEY = process.env.FAL_AI_API_KEY || process.env.FAL_API_KEY;
if (!FAL_API_KEY) { console.error('no fal key in scripts/.env'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const WORK = path.join(ROOT, 'assets', 'style-test', 'tiles', 'regolith_fix');
const SRCD = path.join(WORK, 'src');
const PLATE = path.join(WORK, 'plate');

const TILE_W = 512, TILE_H = 256;
const PW = 768, PH = 512;
const SEED = 51207;
const BOMB_SEED = 9130455;

// ---- the sentence --------------------------------------------------------
// KEEP first (framing, light, brightness, grain, bleed past the edges), then
// the one scoped substitution that is the candidate. The basin is named as the
// thing to be replaced; everything else is named as the thing to be kept.
const KEEP =
  'keep this photograph as it is: the same grey dusty ground, the same fine grit and ' +
  'speckle, the same brightness, the same lighting, the same straight-down aerial ' +
  'framing, and the ground running right out past all four edges. Only where a single ' +
  'wide smooth hollow spreads across a large part of the picture, ';
const TAIL =
  ' The same aerial photograph as before, unchanged except in those wide hollows.';

const CANDS = [
  { id: 'PLAIN', label: 'plain -- basins levelled, only the grit already there',
    body: 'fill that hollow in until the ground across it is level and even, carrying only ' +
          'the fine grit and the small pits that are already there,' },
  { id: 'FIELD', label: 'field -- basins broken into many small even craters',
    body: 'break that hollow up into level ground carrying many small round craters, dozens ' +
          'of them spread evenly across it, each one no wider than a thumbnail and none of ' +
          'them larger than the rest,' },
  { id: 'ROLL', label: 'roll -- basins into low broad rises and shallow dips',
    body: 'replace that hollow with ground that rises and falls in low broad swells a hand ' +
          'width across, none of them deeper than a finger, so that no one dip is larger ' +
          'than its neighbours,' },
  { id: 'RUBBLE', label: 'rubble -- basins filled with strewn grit and small stones',
    body: 'fill that hollow with the same dusty ground strewn with grit and small stones, ' +
          'hundreds of them the size of a grain of rice scattered evenly across it,' },
];
for (const c of CANDS) { c.prompt = KEEP + c.body + TAIL; c.plate = 'plate.png'; }

// ---- ROUND 2, and WHY ROUND 1 WAS UNUSABLE -------------------------------
// All four round-1 returns failed, and they failed together, which means the
// fault was the PLATE and not the sentences. Measured:
//
//   plate                     sd    low-freq sd (32px blocks)   ratio
//   regolith round 1        31.4            21.17               0.675
//   frozen_lake (good)      15.1             6.28               0.415
//
// The regolith plate carries 3.4x the low-frequency energy of the frozen_lake
// plate, and it is VISIBLE AS THE ISO LATTICE: the diamonds read as a
// light/dark checkerboard straight through the bombing. The cause is that
// regolith_0 has a strong brightness structure of its own -- tiltY 29.9, tiltX
// 9.9, plus one large dark basin. EVERY 460 px bomb patch carries a piece of
// that same ramp, so averaging hundreds of them does not cancel it; they all
// lean the same way. frozen_lake did not hit this because its source (glacier)
// had ALREADY been flattened with a degree-5 polynomial and normalised to a
// single shallow ramp before the plate was ever built.
//
// This is a general lesson and it is worth stating plainly:
//   TEXTURE BOMBING DOES NOT BURY A LATTICE WHOSE CELLS CARRY A STRONG INTERNAL
//   BRIGHTNESS RAMP. Flatten the cell first, then bomb.
//
// And flux did exactly what a visible lattice invites (LESSONS 3): it QUANTISED
// ONTO IT. FIELD came back as a regular array of identical craters -- bubble
// wrap, the same failure crevasse round 3 recorded. ROLL came back as a regular
// scaly array. PLAIN kept the lattice and added one large smooth blob in the
// middle, which is the very fault being removed. RUBBLE abandoned the input and
// returned a studio render of one giant crater with pebbles in it.
//
// SO ROUND 2 CHANGES THE PLATE, NOT THE WORDS:
//   (a) regolith_0 is FLATTENED (degree-5 polynomial divided out, mean
//       preserved) before the field is laid, so no cell carries a ramp;
//   (b) the field background is the tile's own mean grey instead of the near
//       black BGA, so the ~0.7 px feathered diamond edge blends toward the
//       ground rather than leaving a dark seam line on every tile boundary;
//   (c) one extra, finer bombing pass to break any residual straight edge.
// The sentences are re-pointed accordingly: with the basin already flattened
// away there is no "wide smooth hollow" left to name, so round 2 asks only for
// the crater SIZE DISTRIBUTION, which is the thing Rudi actually objected to.
const KEEP2 =
  'keep this photograph as it is: the same grey dusty ground, the same fine grit and ' +
  'speckle, the same brightness, the same lighting, the same straight-down aerial ' +
  'framing, and the ground running right out past all four edges. Only where a crater ' +
  'is wider than a thumbnail, ';
const TAIL2 =
  ' The same aerial photograph as before, unchanged except in the size of its craters.';

const CANDS2 = [
  { id: 'R2-EVEN', label: 'r2 even -- wide craters broken into many small ones',
    body: 'break it up into several smaller craters of its own kind, so that the whole ' +
          'picture carries craters of one modest size scattered evenly over it,' },
  { id: 'R2-SOFT', label: 'r2 soft -- wide craters worn down and shallow, small ones kept',
    body: 'wear it down until it is shallow and its rim is worn flat into the ground ' +
          'around it, and leave every smaller crater and pit exactly as it is,' },
  { id: 'R2-FILL', label: 'r2 fill -- wide craters filled level, grain kept',
    body: 'fill it in with the same dusty ground until it is level with the surface ' +
          'around it, carrying only the fine grit and the small pits already there,' },
];
for (const c of CANDS2) { c.prompt = KEEP2 + c.body + TAIL2; c.plate = 'plate2.png'; CANDS.push(c); }

// ---- fal, queue API only (fal.run's TLS handshake is reset from this box) --
function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), payload = JSON.stringify(body);
    const req = (u.protocol === 'https:' ? https : http).request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'POST',
      headers: { Authorization: 'Key ' + FAL_API_KEY, 'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      const c = []; res.on('data', (d) => c.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(c).toString();
        if (res.statusCode >= 400) return reject(new Error('fal ' + res.statusCode + ': ' + raw.slice(0, 400)));
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('bad json ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject); req.write(payload); req.end();
  });
}
function getJson(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    (u.protocol === 'https:' ? https : http).get({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: { Authorization: 'Key ' + FAL_API_KEY },
    }, (res) => {
      const c = []; res.on('data', (d) => c.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(c).toString();
        if (res.statusCode >= 400) return reject(new Error('fal ' + res.statusCode + ': ' + raw.slice(0, 300)));
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('bad json ' + raw.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}
async function runModel(model, body, tries) {
  let last = null;
  for (let k = 0; k < (tries || 4); k++) {
    try {
      const sub = await postJson('https://queue.fal.run/' + model, body);
      const statusUrl = sub.status_url || ('https://queue.fal.run/' + model + '/requests/' + sub.request_id + '/status');
      const respUrl = sub.response_url || ('https://queue.fal.run/' + model + '/requests/' + sub.request_id);
      for (let t = 0; t < 240; t++) {
        await new Promise((r) => setTimeout(r, 2500));
        const st = await getJson(statusUrl);
        if (st.status === 'COMPLETED') return await getJson(respUrl);
        if (st.status === 'ERROR' || st.status === 'FAILED') throw new Error('queue ' + st.status);
      }
      throw new Error('queue timeout');
    } catch (e) {
      last = e;
      console.log('   [retry ' + (k + 1) + '] ' + String(e.message).slice(0, 140));
      await new Promise((r) => setTimeout(r, 4000 * (k + 1)));
    }
  }
  throw last;
}
function download(url) {
  return new Promise((resolve, reject) => {
    const go = (u) => (u.startsWith('https') ? https : http).get(u, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) return go(res.headers.location);
      const c = []; res.on('data', (d) => c.push(d));
      res.on('end', () => resolve(Buffer.concat(c))); res.on('error', reject);
    }).on('error', reject);
    go(url);
  });
}

/**
 * regolith_0, as-is and flopped, laid in the iso lattice -> a gapless plane.
 *
 * flat  -- divide a degree-5 polynomial out of the tile's own luma first, so no
 *          cell carries a brightness ramp for the bombing to preserve. Round 1
 *          skipped this and the lattice came straight through (see the round-2
 *          comment above).
 * The background is the tile's OWN interior mean, not the near-black BGA: the
 * diamond mask is feathered (1024 partial-alpha pixels, ~0.7 px wide) and over
 * a dark ground every tile boundary draws itself as a dark line.
 */
async function regolithField(rows, cols, flat) {
  const base = fs.readFileSync(path.join(SRCD, 'regolith_0_src.webp'));
  let tile = base;
  const st = await M.statsOf(path.join(SRCD, 'regolith_0_src.webp'));
  let bg = { r: Math.round(st.rgb[0]), g: Math.round(st.rgb[1]), b: Math.round(st.rgb[2]), alpha: 1 };
  if (flat) {
    const r = await sharp(base).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const F = M.flatten(r.data, r.info.channels, r.info.width, r.info.height, 5, 0.45);
    tile = await sharp(F, { raw: { width: r.info.width, height: r.info.height, channels: r.info.channels } }).png().toBuffer();
    const fs2 = M.statsRaw(F, r.info.channels, r.info.width, r.info.height);
    bg = { r: Math.round(fs2.rgb[0]), g: Math.round(fs2.rgb[1]), b: Math.round(fs2.rgb[2]), alpha: 1 };
    console.log('[flat] regolith_0 deg-5 flattened for the plate: tiltX ' + st.tiltX.toFixed(1) + ' -> ' +
      fs2.tiltX.toFixed(1) + ', tiltY ' + st.tiltY.toFixed(1) + ' -> ' + fs2.tiltY.toFixed(1) +
      ', sd ' + st.sd.toFixed(1) + ' -> ' + fs2.sd.toFixed(1));
  }
  const bufs = [
    await sharp(tile).png().toBuffer(),
    await sharp(tile).flop().png().toBuffer(),
  ];
  let seed = 20260905;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const cells = [];
  let mr = 0, mb = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * TILE_W + (r % 2 ? TILE_W / 2 : 0), y = (r * TILE_H) / 2;
    cells.push({ input: bufs[rnd() < 0.5 ? 0 : 1], left: x, top: y });
    mr = Math.max(mr, x + TILE_W); mb = Math.max(mb, y + TILE_H);
  }
  const png = await sharp({ create: { width: mr, height: mb, channels: 4, background: bg } })
    .composite(cells).png().toBuffer();
  return { png, w: mr, h: mb, bg };
}

/**
 * Round-patch texture bombing at 1:1 -- regolith dust everywhere, a repeat
 * nowhere. Both bugs that ruined the crevasse round 3 plate are avoided here,
 * exactly as in tiles-frozen-lake-plate.cjs:
 *   (1) the feather mask is built as RGBA, so 'dest-in' has an alpha to bite on
 *       (a 1-channel PNG is encoded WITHOUT alpha and every patch lands as a
 *       hard square);
 *   (2) layers are CLAMPED to the canvas -- sharp DROPS an out-of-canvas layer
 *       instead of clipping it, which leaves holes.
 * A base pass of four opaque full-canvas crops goes down first so a hole is
 * arithmetically impossible; the ~400 feathered discs on top bury its lattice.
 */
async function bombPlate(field, seed, W, H, extraPass) {
  const rnd = M.mulberry32(seed);
  const PATCH = 460, FEATH = 70;
  const MX = 900, MY = 620;
  const CW = W + 2 * PATCH, CH = H + 2 * PATCH;
  const BG = field.bg || M.BGA;

  const mask = Buffer.alloc(PATCH * PATCH * 4);
  const R = PATCH / 2;
  for (let y = 0; y < PATCH; y++) for (let x = 0; x < PATCH; x++) {
    const d = Math.hypot(x - (PATCH - 1) / 2, y - (PATCH - 1) / 2);
    const k = Math.min(1, Math.max(0, (R - d) / FEATH));
    const i = (y * PATCH + x) * 4;
    mask[i] = 255; mask[i + 1] = 255; mask[i + 2] = 255;
    mask[i + 3] = Math.round(255 * (k * k * (3 - 2 * k)));
  }
  const maskPng = await sharp(mask, { raw: { width: PATCH, height: PATCH, channels: 4 } }).png().toBuffer();

  const layers = [];
  for (let k = 0; k < 4; k++) {
    const sx = MX + Math.floor(rnd() * (field.w - CW - 2 * MX));
    const sy = MY + Math.floor(rnd() * (field.h - CH - 2 * MY));
    let s = sharp(field.png).extract({ left: sx, top: sy, width: CW, height: CH });
    if (rnd() < 0.5) s = s.flop();
    layers.push({ input: await s.png().toBuffer(), left: 0, top: 0 });
  }
  let dropped = 0;
  const passes = [{ step: 112, jit: 63 }, { step: 131, jit: 74 }, { step: 154, jit: 86 }, { step: 180, jit: 101 }];
  if (extraPass) passes.push({ step: 94, jit: 53 });
  for (const pass of passes) {
    for (let gy = -2; gy * pass.step < H + PATCH; gy++) {
      for (let gx = -2; gx * pass.step < W + PATCH; gx++) {
        const sx = MX + Math.floor(rnd() * (field.w - PATCH - 2 * MX));
        const sy = MY + Math.floor(rnd() * (field.h - PATCH - 2 * MY));
        let s = sharp(field.png).extract({ left: sx, top: sy, width: PATCH, height: PATCH });
        if (rnd() < 0.5) s = s.flop();
        const patch = await s.ensureAlpha().composite([{ input: maskPng, blend: 'dest-in' }]).png().toBuffer();
        const L = Math.round(gx * pass.step + (rnd() - 0.5) * 2 * pass.jit) + PATCH;
        const T = Math.round(gy * pass.step + (rnd() - 0.5) * 2 * pass.jit) + PATCH;
        if (L + PATCH <= 0 || T + PATCH <= 0 || L >= CW || T >= CH) { dropped++; continue; }
        layers.push({ input: patch, left: Math.max(0, Math.min(CW - PATCH, L)), top: Math.max(0, Math.min(CH - PATCH, T)) });
      }
    }
  }
  const big = await sharp({ create: { width: CW, height: CH, channels: 4, background: BG } })
    .composite(layers).png().toBuffer();
  const cut = await sharp(big).extract({ left: PATCH, top: PATCH, width: W, height: H }).png().toBuffer();
  const r = await sharp(cut).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let holes = 0;
  for (let p = 0; p < W * H; p++) if (r.data[p * r.info.channels + 3] < 250) holes++;
  console.log('[bomb] ' + layers.length + ' layers (' + dropped + ' outside, skipped), coverage holes ' + holes + ' px' +
    (holes ? '   <== NOT FULLY COVERED' : '   (fully covered)'));
  return sharp(cut).flatten({ background: BG }).png().toBuffer();
}

(async () => {
  fs.mkdirSync(PLATE, { recursive: true });
  if (!fs.existsSync(path.join(SRCD, 'regolith_0_src.webp'))) {
    console.error('run scripts/tiles-regolith-audit.cjs first -- it freezes the sources');
    process.exit(1);
  }

  const want = process.argv.slice(2);
  const FORCE = process.env.FORCE === '1';
  const need = new Set(CANDS.filter((c) => !want.length || want.includes(c.id)).map((c) => c.plate));

  /** low-frequency energy of a plate -- the number that condemned round 1 */
  const lowFreq = async (file) => {
    const r = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const ch = r.info.channels, w = r.info.width, h = r.info.height;
    const L = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) L[i] = M.L709(r.data[i * ch], r.data[i * ch + 1], r.data[i * ch + 2]);
    let m = 0; for (let i = 0; i < w * h; i++) m += L[i]; m /= w * h;
    let v = 0; for (let i = 0; i < w * h; i++) v += (L[i] - m) * (L[i] - m); v = Math.sqrt(v / (w * h));
    const B = 32, bw = Math.floor(w / B), bh = Math.floor(h / B), bm = [];
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      let s = 0;
      for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) s += L[(by * B + y) * w + bx * B + x];
      bm.push(s / (B * B));
    }
    const bmm = bm.reduce((a, b) => a + b, 0) / bm.length;
    const bv = Math.sqrt(bm.reduce((a, b) => a + (b - bmm) * (b - bmm), 0) / bm.length);
    return { mean: m, sd: v, low: bv, ratio: bv / v };
  };

  for (const name of ['plate.png', 'plate2.png']) {
    if (!need.has(name)) continue;
    const flat = name === 'plate2.png';
    const file = path.join(PLATE, name);
    if (!fs.existsSync(file) || FORCE) {
      const F = await regolithField(40, 16, flat);
      console.log('[field] regolith_0 iso field ' + F.w + 'x' + F.h + ' (as-is + flop, no vertical flip)' +
        (flat ? ', deg-5 flattened, mid-grey ground' : ''));
      fs.writeFileSync(file, await bombPlate(F, BOMB_SEED + (flat ? 1 : 0), PW, PH, flat));
      console.log('[plate] ' + name + ' bombed 1:1, no rescale  ' + PW + 'x' + PH +
        '   window ' + TILE_W + 'x' + TILE_H + ' = ' + (100 * (TILE_W * TILE_H) / (PW * PH)).toFixed(0) + '% by area');
    } else {
      console.log('[plate] ' + name + ' exists, kept');
    }
    const q = await lowFreq(file);
    console.log('       ' + name + '  mean ' + q.mean.toFixed(1) + '  sd ' + q.sd.toFixed(1) +
      '  low-freq sd ' + q.low.toFixed(2) + '  ratio ' + q.ratio.toFixed(3) +
      '   (frozen_lake, the good one: 0.415)');
  }
  console.log('');

  for (const C of CANDS) {
    if (want.length && !want.includes(C.id)) continue;
    const plate = fs.readFileSync(path.join(PLATE, C.plate));
    fs.writeFileSync(path.join(PLATE, C.id + '_prompt.txt'), C.prompt + '\n');
    const out = path.join(PLATE, C.id + '_kraw.png');
    if (fs.existsSync(out) && !FORCE) { console.log('== ' + C.id + ' == exists, skipped'); continue; }
    console.log('== ' + C.id + ' ==  ' + C.label);
    const r = await runModel('fal-ai/flux-pro/kontext', {
      image_url: 'data:image/png;base64,' + plate.toString('base64'),
      prompt: C.prompt, num_images: 1, safety_tolerance: '5', seed: SEED,
    });
    const url = r.images && r.images[0] && r.images[0].url;
    if (!url) throw new Error('no image url ' + C.id + ': ' + JSON.stringify(r).slice(0, 300));
    fs.writeFileSync(out, await download(url));
    const md = await sharp(fs.readFileSync(out)).metadata();
    console.log('   -> ' + C.id + '_kraw.png  ' + md.width + 'x' + md.height +
      (md.width !== PW || md.height !== PH ? '   (step 2 resizes BACK DOWN to ' + PW + 'x' + PH + ')' : '') + '\n');
  }
  console.log('done -- next: node scripts/tiles-regolith-ladder.cjs');
})();
