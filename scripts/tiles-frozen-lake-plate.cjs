/**
 * FROZEN_LAKE FROM GLACIER -- STEP 1: HERO CANDIDATES, DRAWN INTO A RIMLESS PLATE.
 *
 * STYLE TEST. Writes only into assets/style-test/tiles/frozen_lake/. NOTHING is
 * written to src/assets/tiles/. No cap sync, no build, no git.
 *
 * WHY A PLATE AND NOT THE TILE
 *   All three crevasse rounds that handed flux the DIAMOND-MASKED tile got the
 *   same failure: flux reads the diamond edge as the picture frame and pins its
 *   shapes to it (rimFis 11-25% vs glacier's 3.2%, radial mandalas, grid_play
 *   12.8-26.0 vs glacier's 5.79). The fix that worked is to never show flux the
 *   diamond: lay the glacier tiles into the gapless iso lattice, texture-bomb a
 *   RIMLESS square out of it, let flux draw into that, and cut the tile out
 *   afterwards. That is what happens here.
 *
 * WHY THE PLATE IS SMALL -- 768x512, NOT 1024x1024
 *   Round 3 used a 1024x1024 plate with a 512x256 window: the tile was ONE EIGHTH
 *   of the plate by area, so whatever flux drew arrived in the tile at one third
 *   of its intended linear size and the grain went with it. Here the window is
 *   2/3 of the plate's width and 1/2 of its height -- ONE THIRD by area -- so what
 *   flux draws at plate scale is roughly what lands in the tile. The price is less
 *   crop scatter (offset range 256x256 instead of 512x512); for a deliberately
 *   FEATURELESS tile that price is small, because there are few features to scatter.
 *
 * WHY THE PLATE IS BOMBED AND NOT TILED
 *   Cutting the square straight out of the iso lattice leaves the lattice legible
 *   at 1:1, and round 3 measured what flux does with that: it quantises onto the
 *   grid and returns a periodic array (one slot came back as bubble wrap). So the
 *   plate is built from round feathered patches taken from random places in the
 *   glacier field, randomly flopped/flipped, dropped at jittered positions. Round
 *   patches, not square ones: a square patch leaves straight edges wherever its
 *   feather is not covered, and straight edges are exactly what flux quantised
 *   onto. Same glacier dust, same craters, at full resolution, repeat nowhere.
 *
 * ONE PLATE FOR ALL SIX CANDIDATES, ONE SEED FOR ALL SIX
 *   The candidates are meant to differ in CHARACTER, not in noise. Ground and seed
 *   are held so the only variable across the six returns is the sentence.
 *
 * THE PROMPTS ARE SCOPED SUBSTITUTIONS, AND THERE ARE NO NEGATIVES
 *   tundra proved that a flat re-description of the surface makes flux redraw the
 *   framing too; "keep X, and where Y is, put Z" keeps it. And a negative clause
 *   reproduces the thing it names, so "no cracks" is not available -- every
 *   candidate says what IS there, never what is not. The tail that rounds 1-3 used
 *   ("no vignette, no border, no frame") is therefore rewritten positively.
 *
 * NO RESCALE OF THE RETURN, EVER. If flux hands back something other than
 *   768x512 the script says so and leaves it alone; step 2 cuts a 512x256 window
 *   out of whatever arrived.
 *
 * Output (assets/style-test/tiles/frozen_lake/plate/)
 *   plate.png              the rimless bombed square that flux is shown
 *   <ID>_kraw.png          the raw flux return, never resized
 *   <ID>_prompt.txt        the exact sentence
 *
 * Usage: node scripts/tiles-frozen-lake-plate.cjs                all six
 *        node scripts/tiles-frozen-lake-plate.cjs MIRROR SHEEN   a subset
 *        FORCE=1 ...                                             overwrite
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');
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

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const WORK = path.join(ST, 'frozen_lake');
const SRCD = path.join(WORK, 'src');
const PLATE = path.join(WORK, 'plate');

const TILE_W = 512, TILE_H = 256;
const PW = 768, PH = 512;                 // window = 2/3 x 1/2 = one third of the plate
const BGA = { r: 0x14, g: 0x17, b: 0x1c };
const SEED = 88011;
const BOMB_SEED = 4400771;

// ---- the prompt ----------------------------------------------------------
// KEEP first (framing, light, brightness, bleed past the edges), then the
// substitution (rubble -> lake ice), then the one clause that is the candidate.
const KEEP =
  'keep the straight-down aerial framing of this picture, keep the even flat lighting, ' +
  'keep the same overall brightness, and keep the surface running right out past all four ' +
  'edges of the frame. Wherever there is dusty grey rubble, loose stones, speckled grit or ' +
  'a shallow crater, put in its place the surface of a frozen lake: pale bluish white ice ' +
  'that has refrozen flat and level, ';
const TAIL =
  'straight-down aerial view of a wide flat frozen lake filling the whole picture, ' +
  'even flat lighting, matte, the ice carrying on past every edge.';

const CANDS = [
  { id: 'MIRROR', label: 'mirror -- one continuous polished sheet, wide soft gradients only',
    body: 'so smooth and so level that the whole picture reads as one continuous polished sheet, ' +
          'its brightness changing only in very wide soft gradients that run across the entire frame, ' },
  { id: 'SHEEN', label: 'sheen -- faint one-directional frost streaks, wind-polished',
    body: 'smooth and level, and lying across it long faint frost streaks all leaning the same way, ' +
          'the sheen the wind leaves on a polished ice sheet, each streak only a shade brighter than ' +
          'the ice beside it, ' },
  { id: 'SWELL', label: 'swell -- broad low buckling mounds, soft wide shading',
    body: 'smooth and level, and swelling very gently into broad low mounds several hand widths across, ' +
          'the way thick lake ice buckles as it freezes, with soft wide shading passing from one swell ' +
          'to the next, ' },
  { id: 'BUBBLE', label: 'bubble -- air bubbles and pale flecks frozen inside the sheet',
    body: 'smooth and level, with small round air bubbles and pale flecks frozen inside it, scattered ' +
          'evenly through the sheet at slightly different depths, each one a tiny soft bright point ' +
          'seen through clear ice, ' },
  { id: 'GRAIN', label: 'grain -- large flat crystals packed edge to edge, tone-only boundaries',
    body: 'made of large flat ice crystals packed edge to edge, every crystal a slightly different ' +
          'shade of the same pale blue white, their boundaries showing only as the faintest change ' +
          'of tone across an otherwise level surface, ' },
  { id: 'SNOWDUST', label: 'snowdust -- thin powder dusting, faint soft mottling',
    body: 'smooth and level, with a thin dusting of dry powder snow lying on top of it, gathered a ' +
          'little more thickly in some places than in others so that the sheet is faintly mottled ' +
          'in soft broad patches, ' },
];
// ---- ROUND 2, and why it exists -----------------------------------------
// Round 1 above came back with three faults, all six returns sharing them:
//   (a) BRIGHTNESS IGNORED. "keep the same overall brightness" lost against
//       "pale bluish white ice"; every return is near-white paper. The grade can
//       pull the level back down, but it scales the texture down with it, so the
//       tile arrives flatter than intended rather than by choice.
//   (b) GRAIN GONE. Nothing was said about the dust, so flux binned it. glacier's
//       micro8 is 7.40; a blank gradient has nothing to carry into the tile.
//   (c) SCALE WRONG, AND WRONG IN THE ONE DIRECTION THAT MATTERS. Asked for a
//       texture, flux drew ONE enormous feature per picture: a pair of cracks
//       meeting at a point (SHEEN), two polygon lobes (SWELL), a dozen giant
//       bubbles (BUBBLE). At 1.6 tiles per picture each of those spans a whole
//       tile, which is both the opposite of "smooth and level" and unusable in a
//       four-slot corpus.
// So round 2 anchors all three explicitly: the tone is named DARK and tied to the
// picture that is already there, the grain is named as something to KEEP, and every
// feature is given a COUNT and a SIZE ("dozens", "no longer than a finger"). The
// substitution is narrowed too -- only stones, rubble and crater rims are replaced,
// not "everything dusty" -- so there is less licence to start over.
const KEEP2 =
  'keep this picture as dark as it is now, keep its dim even lighting, keep its ' +
  'straight-down aerial framing, and keep the fine dust grain and speckle of the ' +
  'surface. Only where there are loose stones, sharp rubble and crater rims, smooth ' +
  'those away into level frozen ground: dark blue grey lake ice, unlit and matte, ';
const TAIL2 =
  'straight-down aerial view, dim even lighting, dark grey blue tones, matte, ' +
  'the ground carrying on past every edge.';

const CANDS2 = [
  { id: 'R2-PLAIN', label: 'r2 plain -- level and almost featureless, wide soft washes',
    body: 'level and almost featureless, its tone changing only in wide soft washes ' +
          'that run right across the frame, ' },
  { id: 'R2-FROST', label: 'r2 frost -- dozens of short faint streaks, one heading',
    body: 'level, with dozens of short faint frost streaks scattered all over the frame, ' +
          'each one no longer than a finger and only a shade lighter than the ground beside ' +
          'it, all leaning the same way, ' },
  { id: 'R2-BUBBLE', label: 'r2 bubble -- many dozens of pinpoint bubbles, sand-grain size',
    body: 'level, with many dozens of tiny air bubbles frozen just under the surface, ' +
          'spread evenly over the whole frame, each one a pinpoint no bigger than a grain ' +
          'of sand, ' },
  { id: 'R2-GRAIN', label: 'r2 grain -- fine even crystal grain, rice-grain facets',
    body: 'level, and covered all over in a fine even crystal grain, thousands of small ' +
          'flat facets the size of a grain of rice, each one a barely different shade of the ' +
          'same dark blue grey, ' },
  { id: 'R2-SNOW', label: 'r2 snow -- thin dusting, many small soft patches',
    body: 'level, with a thin dusting of dry snow over it, faintly mottled in many small ' +
          'soft patches a few fingers wide, spread evenly across the whole frame, ' },
];
// ---- ROUND 3, and it is the one that should have been round 1 ------------
// Round 1 said "pale bluish white ice" and got near-white paper (L 212-229,
// blowout 94-100%). Round 2 said "dark blue grey, dim, unlit, matte" and got the
// opposite failure: flux read those as a LIGHTING BRIEF and returned a studio
// backdrop -- a dark painted panel with a soft photographic sweep across it, in
// two cases with light rays fanning down from the top edge. Neither is an aerial
// surface any more. The words that did the damage in both rounds were the COLOUR
// and LIGHT words.
//
// And they were never needed. Rudi's own order of work is: get the surface from
// flux, THEN lighten it and push it blue in the grade. So the prompt does not have
// to name a colour at all -- it only has to ask for the GEOMETRY (level, smooth,
// craters filled, stones covered) and to insist that everything else is left
// alone. The re-describing tail goes too: "straight-down aerial view of a wide flat
// frozen lake filling the whole picture" is an invitation to start a new picture,
// and it was taken up in both earlier rounds. Round 3's tail says only that this is
// the same photograph as before.
//
// The word "ice" is kept out as well, for the same reason "pale" was: it drags a
// whole look with it. What is asked for is a levelled ground, which is what a
// frozen lake basin IS.
const KEEP3 =
  'keep this photograph as it is: the same grey ground, the same fine dust and grain, ' +
  'the same brightness, the same lighting. Only fill in the craters and cover over the ' +
  'loose stones and the rubble, so that the ground becomes level and smooth, ';
const TAIL3 =
  'the same aerial photograph as before, unchanged except that the ground is now level.';

const CANDS3 = [
  { id: 'R3-BARE', label: 'r3 bare -- levelled, nothing added, only the dust already there',
    body: 'and the levelled ground is bare and even, carrying only the fine dust grain that ' +
          'is already there, ' },
  { id: 'R3-FROST', label: 'r3 frost -- dozens of short faint streaks, one heading',
    body: 'and lying across the levelled ground are dozens of short faint pale streaks, each ' +
          'one no longer than a finger, all leaning the same way, spread over the whole frame, ' },
  { id: 'R3-BUBBLE', label: 'r3 bubble -- many dozens of sand-grain pits and pinpoints',
    body: 'and set into the levelled ground are many dozens of tiny round pits and pale ' +
          'pinpoints, each no bigger than a grain of sand, spread evenly over the whole frame, ' },
  { id: 'R3-GRAIN', label: 'r3 grain -- thousands of rice-grain facets, tone-only',
    body: 'and the levelled ground is packed with thousands of small flat facets the size of a ' +
          'grain of rice, each one a barely different shade of the same grey, ' },
  { id: 'R3-PATCH', label: 'r3 patch -- faint soft mottling, many small patches',
    body: 'and the levelled ground is faintly mottled in many small soft patches a few fingers ' +
          'wide, spread evenly over the whole frame, ' },
];

for (const c of CANDS) c.prompt = KEEP + c.body + TAIL;
for (const c of CANDS2) { c.prompt = KEEP2 + c.body + TAIL2; CANDS.push(c); }
for (const c of CANDS3) { c.prompt = KEEP3 + c.body + TAIL3; CANDS.push(c); }

// ---- fal -----------------------------------------------------------------
function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), payload = JSON.stringify(body);
    const req = (u.protocol === 'https:' ? https : http).request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'POST',
      headers: {
        Authorization: 'Key ' + FAL_API_KEY, 'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
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
function getJson(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    (u.protocol === 'https:' ? https : http).get({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: { Authorization: 'Key ' + FAL_API_KEY },
    }, (res) => {
      const c = [];
      res.on('data', (d) => c.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(c).toString();
        if (res.statusCode >= 400) return reject(new Error('fal ' + res.statusCode + ': ' + raw.slice(0, 300)));
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('bad json ' + raw.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}
/**
 * THE SYNCHRONOUS HOST fal.run IS UNREACHABLE FROM THIS MACHINE TODAY -- its TLS
 * handshake is reset before any bytes come back (curl exit 35, "schannel: failed
 * to receive handshake"), while queue.fal.run answers normally and fal.ai serves
 * 200. So every call goes through the QUEUE API instead: submit, poll the status
 * url, then fetch the response url. Same model, same parameters, same result.
 * Retries are kept because a ~1.5 MB base64 upload occasionally gets dropped.
 */
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
        if (st.status === 'ERROR' || st.status === 'FAILED') throw new Error('queue ' + st.status + ': ' + JSON.stringify(st).slice(0, 200));
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
      const c = [];
      res.on('data', (d) => c.push(d));
      res.on('end', () => resolve(Buffer.concat(c)));
      res.on('error', reject);
    }).on('error', reject);
    go(url);
  });
}
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** the four frozen glacier tiles laid in the iso lattice -> a gapless plane */
async function glacierField(rows, cols) {
  const bufs = [];
  for (let n = 0; n < 4; n++) bufs.push(await sharp(fs.readFileSync(path.join(SRCD, 'glacier_' + n + '_src.webp'))).png().toBuffer());
  let seed = 20260904;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const cells = [];
  let mr = 0, mb = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * TILE_W + (r % 2 ? TILE_W / 2 : 0), y = (r * TILE_H) / 2;
    cells.push({ input: bufs[Math.floor(rnd() * 4)], left: x, top: y });
    mr = Math.max(mr, x + TILE_W); mb = Math.max(mb, y + TILE_H);
  }
  const png = await sharp({ create: { width: mr, height: mb, channels: 4, background: Object.assign({ alpha: 1 }, BGA) } })
    .composite(cells).png().toBuffer();
  return { png: png, w: mr, h: mb };
}

/**
 * round-patch texture bombing at 1:1 -- glacier dust everywhere, a repeat nowhere.
 *
 * TWO BUGS INHERITED FROM tiles-crevasse-r3-plate.cjs, BOTH FIXED HERE AND BOTH
 * WORTH WRITING DOWN, because round 3's plate was not what its own header claims:
 *
 *  (1) THE FEATHER MASK NEVER APPLIED. The mask was written as a ONE-CHANNEL png
 *      and handed to composite with blend 'dest-in'. sharp encodes a 1-channel
 *      raw buffer as a 3-channel GREY png with NO ALPHA (verified: metadata
 *      channels 3, hasAlpha false), and 'dest-in' multiplies by the input's
 *      ALPHA -- which is 255 everywhere. So every patch went down as a HARD
 *      SQUARE. Round 3's "round feathered patches" were opaque rectangles, and
 *      its plate is full of straight patch edges -- the very thing the round
 *      comment says round patches were chosen to avoid. Here the mask is built
 *      as RGBA (white, alpha = the disc profile) so dest-in has an alpha to bite
 *      on.
 *  (2) OUT-OF-CANVAS LAYERS. left/top ran past the padded canvas on the right and
 *      bottom, and sharp drops such a layer instead of clipping it, so the cover
 *      had holes. Layers are now clamped to the canvas and any that fall wholly
 *      outside are skipped.
 *
 * Plus a BASE PASS as insurance: four full-size crops of the field laid down
 * opaque first, so a hole is arithmetically impossible. It carries the lattice,
 * which is why it is only insurance -- the ~400 feathered discs on top bury it.
 */
async function bombPlate(field, seed, W, H) {
  const rnd = mulberry32(seed);
  const PATCH = 460, FEATH = 70;
  const MX = 900, MY = 620;
  const CW = W + 2 * PATCH, CH = H + 2 * PATCH;

  // -- the disc mask, as RGBA so that dest-in has an alpha channel to read -----
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
  const cutSrc = () => ({
    sx: MX + Math.floor(rnd() * (field.w - PATCH - 2 * MX)),
    sy: MY + Math.floor(rnd() * (field.h - PATCH - 2 * MY)),
  });

  const layers = [];
  // -- base: four opaque full-canvas crops, so the cover can never have a hole -
  for (let k = 0; k < 4; k++) {
    const sx = MX + Math.floor(rnd() * (field.w - CW - 2 * MX));
    const sy = MY + Math.floor(rnd() * (field.h - CH - 2 * MY));
    let s = sharp(field.png).extract({ left: sx, top: sy, width: CW, height: CH });
    if (rnd() < 0.5) s = s.flop();
    if (rnd() < 0.5) s = s.flip();
    layers.push({ input: await s.png().toBuffer(), left: 0, top: 0 });
  }
  // -- the bombing itself -----------------------------------------------------
  let dropped = 0;
  const passes = [{ step: 112, jit: 63 }, { step: 131, jit: 74 }, { step: 154, jit: 86 }, { step: 180, jit: 101 }];
  for (const pass of passes) {
    for (let gy = -2; gy * pass.step < H + PATCH; gy++) {
      for (let gx = -2; gx * pass.step < W + PATCH; gx++) {
        const c = cutSrc();
        let s = sharp(field.png).extract({ left: c.sx, top: c.sy, width: PATCH, height: PATCH });
        if (rnd() < 0.5) s = s.flop();
        if (rnd() < 0.5) s = s.flip();
        const patch = await s.ensureAlpha().composite([{ input: maskPng, blend: 'dest-in' }]).png().toBuffer();
        const L = Math.round(gx * pass.step + (rnd() - 0.5) * 2 * pass.jit) + PATCH;
        const T = Math.round(gy * pass.step + (rnd() - 0.5) * 2 * pass.jit) + PATCH;
        // sharp DROPS a layer that runs past the canvas instead of clipping it,
        // so clamp; a patch wholly outside is skipped and counted.
        if (L + PATCH <= 0 || T + PATCH <= 0 || L >= CW || T >= CH) { dropped++; continue; }
        layers.push({
          input: patch,
          left: Math.max(0, Math.min(CW - PATCH, L)),
          top: Math.max(0, Math.min(CH - PATCH, T)),
        });
      }
    }
  }
  const big = await sharp({ create: { width: CW, height: CH, channels: 4, background: Object.assign({ alpha: 1 }, BGA) } })
    .composite(layers).png().toBuffer();
  const cut = await sharp(big).extract({ left: PATCH, top: PATCH, width: W, height: H }).png().toBuffer();
  // -- coverage proof: no pixel of the plate may still be the padding colour ---
  const r = await sharp(cut).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let holes = 0;
  for (let p = 0; p < W * H; p++) if (r.data[p * r.info.channels + 3] < 250) holes++;
  console.log('[bomb] ' + layers.length + ' layers (' + dropped + ' outside, skipped), coverage holes ' + holes + ' px' +
    (holes ? '   <== NOT FULLY COVERED' : '   (fully covered)'));
  return sharp(cut).flatten({ background: BGA }).png().toBuffer();
}

(async () => {
  fs.mkdirSync(PLATE, { recursive: true });
  fs.mkdirSync(SRCD, { recursive: true });

  // -- FREEZE. src/assets/tiles/glacier is READ here and nowhere written. ----
  for (let n = 0; n < 4; n++) {
    const origin = path.join(TILES, 'glacier', 'glacier_' + n + '.webp');
    const frozen = path.join(SRCD, 'glacier_' + n + '_src.webp');
    if (!fs.existsSync(frozen)) fs.copyFileSync(origin, frozen);
    console.log('[freeze] glacier_' + n + '  frozen copy ' +
      (fs.readFileSync(frozen).equals(fs.readFileSync(origin)) ? 'MATCHES' : 'DIFFERS FROM') + ' src/assets/tiles/glacier/');
  }

  const plateFile = path.join(PLATE, 'plate.png');
  if (!fs.existsSync(plateFile) || process.env.FORCE === '1') {
    const F = await glacierField(40, 16);
    console.log('[field] glacier iso field ' + F.w + 'x' + F.h);
    fs.writeFileSync(plateFile, await bombPlate(F, BOMB_SEED, PW, PH));
    console.log('[plate] bombed 1:1 with round patches, no rescale, seed ' + BOMB_SEED + '  ' + PW + 'x' + PH +
      '   window ' + TILE_W + 'x' + TILE_H + ' = ' + (100 * (TILE_W * TILE_H) / (PW * PH)).toFixed(0) + '% of it by area' +
      '   (round 3 was 12%)');
  } else {
    console.log('[plate] exists, kept');
  }
  console.log('');

  const want = process.argv.slice(2);
  const FORCE = process.env.FORCE === '1';
  const plate = fs.readFileSync(plateFile);

  for (const C of CANDS) {
    if (want.length && !want.includes(C.id)) continue;
    fs.writeFileSync(path.join(PLATE, C.id + '_prompt.txt'), C.prompt + '\n');
    const out = path.join(PLATE, C.id + '_kraw.png');
    if (fs.existsSync(out) && !FORCE) { console.log('== ' + C.id + ' == exists, skipped'); continue; }
    console.log('== ' + C.id + ' ==  ' + C.label);
    console.log('   ' + C.prompt);
    const r = await runModel('fal-ai/flux-pro/kontext', {
      image_url: 'data:image/png;base64,' + plate.toString('base64'),
      prompt: C.prompt, num_images: 1, safety_tolerance: '5', seed: SEED,
    });
    const url = r.images && r.images[0] && r.images[0].url;
    if (!url) throw new Error('no image url ' + C.id + ': ' + JSON.stringify(r).slice(0, 300));
    fs.writeFileSync(out, await download(url));
    const md = await sharp(fs.readFileSync(out)).metadata();
    console.log('   -> ' + path.basename(out) + '  ' + md.width + 'x' + md.height +
      (md.width !== PW || md.height !== PH ? '   <== not ' + PW + 'x' + PH + '; left alone, never rescaled' : '') + '\n');
  }
  console.log('done -- plates in ' + PLATE + '\nnext: node scripts/tiles-frozen-lake-candidates.cjs');
})();
