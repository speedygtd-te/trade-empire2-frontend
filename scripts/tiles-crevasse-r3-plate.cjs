/**
 * CREVASSE ROUND 3, STEP 1 -- FLUX DRAWS ITS OWN GROUND, INTO A RIMLESS SQUARE.
 *
 * STYLE TEST. Writes only into assets/style-test/tiles/crevasse3/. NOTHING is
 * written to src/assets/tiles/. No cap sync, no build, no git.
 *
 * WHAT CHANGED AT THE TOP, AND IT CHANGES EVERYTHING BELOW IT
 *   Rounds 1 and 2 were run under the rule "glacier IS the ground, only a shadow
 *   may be added". Round 1's DIRECT kontext returns broke that rule -- flux threw
 *   glacier's dusty crater ground away and reinvented it as rounded polygon plates
 *   with a bright vein network (ground-only NCC 0.02-0.22) -- and round 2 spent
 *   itself building a composite that put glacier's ground back (gNCC 0.79).
 *   That decision is now REVERSED: the reinvented plate ground IS what crevasse
 *   is meant to be. It is also the physically better answer -- shattered terrain
 *   on an ice moon does not look like the smooth plain with scratches in it -- and
 *   it gives crevasse TEXTURE as a second leg away from glacier instead of only
 *   shadow. So there is no composite here, no multiply, no gNCC guard: flux'
 *   pixels are the tile.
 *
 * WHAT IS KEPT FROM ROUND 2 -- THE ONE THING IT PROVED
 *   Round 1 handed flux the DIAMOND-MASKED tile. flux read the diamond edge as the
 *   picture frame and pinned the fissures to it: rimFis 11-25% against glacier's
 *   3.2%, two slots came back radial mandalas, two came back untouched, grid_play
 *   12.8-26.0 against glacier's 5.79. Round 2 fixed that by never showing flux the
 *   diamond: the four glacier tiles are laid in the ISO LATTICE (which tiles the
 *   plane with no gaps), a big SQUARE is cut out of the middle -- no rim anywhere
 *   inside it -- and flux draws into that. rimFis fell to 3.6-4.3%, no mandalas,
 *   no untouched returns. That technique is this round's technique.
 *
 * WHAT IS FIXED AGAINST ROUND 2 -- ITS OWN COST
 *   Round 2 wanted a six-tile-wide frame, so it downscaled a 3072 cut to 1024 for
 *   flux and then UPSCALED the result 3x. The stair-stepped lips of that upscale
 *   were visible at 1:1. Here every plate is cut 1:1 -- 1024x1024 of real tile
 *   pixels in, 1024x1024 out, one screen pixel is one screen pixel the whole way.
 *   The frame is bought back by generating FOUR SEPARATE PLATES instead of one big
 *   one, at four different places in the glacier field, one per slot.
 *
 * AND THE SECOND LEVER AGAINST THE STAMP
 *   Each slot is cut its own 512x256 window out of its own plate at its own offset
 *   (step 2). Round 2 measured that scattering the fissure centres widely is what
 *   pushes gridCoh from 4.1-5.2 down to ~3.3 -- glacier's own 3.22. Four separate
 *   plates plus four separate offsets is the widest scatter available.
 *
 * THE INPUT PLATE IS BOMBED, NOT TILED -- and this cost one generation to learn
 *   The first attempt cut the square straight out of the iso lattice, exactly as
 *   round 2 did. Round 2 got away with it because it DOWNSCALED 3:1 before flux saw
 *   it, which wiped the seams out. At 1:1 the lattice is still legible in the plate:
 *   four glacier tiles repeating on a regular diamond grid. flux found it instantly
 *   and answered with a PERIODIC ARRAY OF HOLES on that very grid -- one slot came
 *   back as bubble wrap. Removing the diamond RIM is not enough; the periodicity has
 *   to go too. So the plate is now built by texture bombing: ~180 random square
 *   patches cut from random places in the glacier field, each randomly flopped /
 *   flipped, dropped at jittered positions with a feathered edge. Same pixels, same
 *   dust, same craters, no repeat anywhere for flux to quantise onto.
 *
 * THE PROMPT is round 1's verbatim -- KEEP-clause first, ONLY ADD, no negatives --
 * with the tile/diamond words removed, because it is round 1's LOOK that is wanted
 * and the prompt is half of that look. The counts are scaled to the plate: a
 * 512x256 window is half the plate wide and a quarter of it tall, so a set of
 * roughly parallel diagonals at plate count N shows about 0.37N per tile. 6 / 12 /
 * 18 in the plate is therefore about 2 / 4 / 6 in the tile -- the round-1 axis.
 *
 * Output (assets/style-test/tiles/crevasse3/plate/)
 *   src_<slot>.png                 the 1024x1024 rimless cut of the glacier field
 *   <VARIANT>_<slot>_kraw.png      the raw flux return, 1024x1024, never resized
 *
 * Usage: node scripts/tiles-crevasse-r3-plate.cjs                 all 6 variants
 *        node scripts/tiles-crevasse-r3-plate.cjs d4-NEUTRAL      one variant
 *        node scripts/tiles-crevasse-r3-plate.cjs d4-NEUTRAL:2    one variant, one slot (re-roll)
 *        FORCE=1 ...                                              overwrite instead of skip
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
const SRCD = path.join(ST, 'crevasse', 'src');        // the round-1 frozen glacier
const WORK = path.join(ST, 'crevasse3');
const PLATE = path.join(WORK, 'plate');
const TILE_W = 512, TILE_H = 256;
const PLATE_N = 1024;                                  // 1:1, in and out. no rescale, ever.
const BGA = { r: 0x14, g: 0x17, b: 0x1c };

// -- THE PROMPT, round 1 verbatim except the tile/diamond words ------------
const KEEP =
  'keep ALL of the existing dusty grey ice surface exactly as it is, do not regenerate ' +
  'and do not recolour the ground, keep every grain of dust, every speckle and every small ' +
  'stone that is already there, and keep the same overall brightness. ONLY ADD ';
const WIDE =
  'each fissure is a wide gaping gash, many times wider than a hairline crack, wide enough ' +
  'to look down into, with ragged broken lips, ';
const TAIL =
  'straight-down aerial view of a dusty grey glacier surface filling the whole frame, ' +
  'even flat lighting, matte, no vignette, no border, no frame';
// IRREG is positive-framed on purpose. The house rule is that a negative prompt
// reproduces the concept it names, so "not a grid" is not available; "irregular,
// uneven, no two the same length" says the same thing from the other side. It is
// there because the first attempt came back as a regular array of holes.
const IRREG =
  'the fissures are irregular and natural, unevenly spaced, no two the same length ' +
  'or the same width, at slightly different angles from each other, ';
const DENS = {
  d2: 'six broad open crevasse fissures spread over the whole frame as a roughly parallel set, all slanting the same way, ' +
      'set widely apart at their own offsets with large untouched stretches of plain ground between them, ',
  d4: 'twelve long broad open crevasse fissures spread over the whole frame as a roughly parallel set, all slanting the same way, ' +
      'in several offset ranks with untouched ground between the ranks, ',
  d6: 'eighteen long broad open crevasse fissures spread evenly over the whole frame as a roughly parallel set, all slanting the same way, ' +
      'in several offset ranks, breaking the surface into large flat plates, ',
};
const WALL = {
  NEUTRAL: 'and the inside of every gash is deep flat black shadow with no colour at all, ',
  BLUE: 'and the inside of every gash is deep dark shadow, with a thin band of pale blue glacial ice ' +
        'showing along the freshly broken upper lip of every gash where the dust cover has fallen away, ',
};
const VARIANTS = [];
for (const d of ['d2', 'd4', 'd6']) for (const w of ['NEUTRAL', 'BLUE']) {
  VARIANTS.push({ id: d + '-' + w, prompt: KEEP + DENS[d] + IRREG + WIDE + WALL[w] + TAIL });
}
// per SLOT, held across all six variants, so a column is comparable and only the
// instruction changes -- round 1's convention.
const SEED = [73011, 73022, 73033, 73044];
// one bombing seed per slot, so the four input plates are four different grounds.
const BOMB_SEED = [610011, 610022, 610033, 610044];

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

/** the four frozen glacier tiles laid in the iso lattice -> a gapless plane */
async function glacierField(rows, cols) {
  const bufs = [];
  for (let n = 0; n < 4; n++) bufs.push(await sharp(fs.readFileSync(path.join(SRCD, 'glacier_' + n + '_src.webp'))).png().toBuffer());
  let seed = 20260903;
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

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * TEXTURE BOMBING. Fill a PLATE_N square with random square patches cut from
 * random places in the gapless glacier field, each randomly flopped/flipped and
 * dropped at a jittered position with a feathered edge, so the result is glacier
 * dust everywhere and a repeat nowhere. A first pass of full-cover patches lays
 * the ground, a second denser pass breaks up whatever regularity the first left.
 */
/**
 * TWO GROUND TREATMENTS, and the second one exists because of what the first
 * measured.
 *
 * SMOOTH -- bomb with SQUARE feathered patches at 3x and downscale 3:1. The
 *   downscale wipes both the lattice and the patch seams, and flux comes back
 *   consistent on all four slots: no mandalas, no untouched returns, grid_play
 *   7.5-11.3 against round 1's 18.6-26.0. But it also wipes glacier's dust and
 *   craters, so flux has no grain to imitate and the finished tile reads micro8
 *   3.7-6.9 against glacier's own 7.40. The tile comes out SMOOTHER than the ground
 *   it is supposed to be the broken version of, which is backwards, and it costs
 *   the separation: d' 0.25 on the sparse blue rung.
 *
 * SHARP -- bomb with ROUND feathered patches at 1:1, no rescale at all. Round
 *   patches are the point: a square patch leaves STRAIGHT edges wherever its
 *   feather is not fully covered, and straight edges are exactly what flux
 *   quantised a hole-grid onto in the first attempt. Overlapping discs leave no
 *   straight line anywhere, so the lattice is gone and the dust and craters are
 *   still there at full resolution.
 */
async function bombPlate(field, seed, sharp1to1) {
  const rnd = mulberry32(seed);
  const SS = sharp1to1 ? 1 : 3;          // bomb at 3x, then down to PLATE_N (smooth ground)
  const N = PLATE_N * SS;
  const PATCH = sharp1to1 ? 620 : 1020, FEATH = sharp1to1 ? 95 : 250;
  // source crops stay well inside the field: its outer rows/columns are the ragged
  // edge of the lattice and carry background, which would punch holes in the plate.
  const MX = 900, MY = 620;
  const mask = Buffer.alloc(PATCH * PATCH);
  for (let y = 0; y < PATCH; y++) for (let x = 0; x < PATCH; x++) {
    let k;
    if (sharp1to1) {
      // a disc: full opacity to (R - FEATH), then smoothly out to R, zero beyond
      const R = PATCH / 2;
      const d = Math.hypot(x - (PATCH - 1) / 2, y - (PATCH - 1) / 2);
      k = Math.min(1, Math.max(0, (R - d) / FEATH));
    } else {
      const d = Math.min(x, y, PATCH - 1 - x, PATCH - 1 - y);
      k = Math.min(1, d / FEATH);
    }
    mask[y * PATCH + x] = Math.round(255 * (k * k * (3 - 2 * k)));
  }
  const maskPng = await sharp(mask, { raw: { width: PATCH, height: PATCH, channels: 1 } }).png().toBuffer();
  const layers = [];
  const passes = sharp1to1
    ? [{ step: 150, jit: 84 }, { step: 175, jit: 98 }, { step: 205, jit: 115 }, { step: 240, jit: 135 }]
    : [{ step: 400, jit: 210 }, { step: 470, jit: 250 }, { step: 580, jit: 320 }];
  for (const pass of passes) {
    for (let gy = -2; gy * pass.step < N + PATCH; gy++) {
      for (let gx = -2; gx * pass.step < N + PATCH; gx++) {
        const sx = MX + Math.floor(rnd() * (field.w - PATCH - 2 * MX));
        const sy = MY + Math.floor(rnd() * (field.h - PATCH - 2 * MY));
        let s = sharp(field.png).extract({ left: sx, top: sy, width: PATCH, height: PATCH });
        if (rnd() < 0.5) s = s.flop();
        if (rnd() < 0.5) s = s.flip();
        const patch = await s.ensureAlpha().composite([{ input: maskPng, blend: 'dest-in' }]).png().toBuffer();
        layers.push({
          input: patch,
          left: Math.round(gx * pass.step + (rnd() - 0.5) * 2 * pass.jit),
          top: Math.round(gy * pass.step + (rnd() - 0.5) * 2 * pass.jit),
        });
      }
    }
  }
  const big = await sharp({ create: { width: N + 2 * PATCH, height: N + 2 * PATCH, channels: 4, background: Object.assign({ alpha: 1 }, BGA) } })
    .composite(layers.map((l) => ({ input: l.input, left: l.left + PATCH, top: l.top + PATCH })))
    .extract({ left: PATCH, top: PATCH, width: N, height: N })
    .flatten({ background: BGA }).png().toBuffer();
  if (!sharp1to1) {
    // the ONLY rescale in the whole pipeline, and it is on the INPUT. Round 2's sin
    // was upscaling the OUTPUT; the output here is never touched.
    return sharp(big).resize(PLATE_N, PLATE_N, { kernel: 'lanczos3' }).png().toBuffer();
  }
  return big;                            // 1:1 -- no rescale anywhere at all
}

(async () => {
  fs.mkdirSync(PLATE, { recursive: true });
  for (let n = 0; n < 4; n++) {
    const origin = path.join(TILES, 'glacier', 'glacier_' + n + '.webp');
    const frozen = path.join(SRCD, 'glacier_' + n + '_src.webp');
    if (!fs.existsSync(frozen)) throw new Error('round-1 frozen glacier missing: ' + frozen);
    console.log('[freeze] glacier_' + n + '  frozen copy ' +
      (fs.readFileSync(frozen).equals(fs.readFileSync(origin)) ? 'MATCHES' : 'DIFFERS FROM') + ' src/assets/tiles/glacier/');
  }

  // -- the four rimless 1024 squares, one per slot, per ground treatment ---
  // SMOOTH = bombed at 3x and downscaled: no lattice, no seams, but no dust either.
  // SHARP  = bombed at 1:1 and warped: dust and craters kept, seams bent, no lattice.
  const SHARP = process.env.GROUND === 'sharp';
  const SFX = SHARP ? 'S' : '';
  const srcName = (n) => 'src' + SFX + '_' + n + '.png';
  const need = [0, 1, 2, 3].some((n) => !fs.existsSync(path.join(PLATE, srcName(n))));
  if (need || process.env.FORCE === '1') {
    const F = await glacierField(40, 16);
    console.log('[field] glacier iso field ' + F.w + 'x' + F.h);
    for (let n = 0; n < 4; n++) {
      const sq = await bombPlate(F, BOMB_SEED[n], SHARP);
      fs.writeFileSync(path.join(PLATE, srcName(n)), sq);
      console.log('[src] slot ' + n + '  ' + (SHARP ? 'bombed 1:1 with round patches, no rescale' : 'bombed 3x + downscaled 3:1') +
        ', seed ' + BOMB_SEED[n] + '  ' + PLATE_N + 'x' + PLATE_N +
        '  (frame = ' + (PLATE_N / TILE_W).toFixed(1) + ' tile widths, no lattice)');
    }
  } else {
    console.log('[src] four rimless ' + (SHARP ? 'SHARP' : 'SMOOTH') + ' squares exist, kept');
  }
  console.log('');

  const args = process.argv.slice(2);
  const want = args.map((a) => { const p = a.split(':'); return { v: p[0], slot: p[1] === undefined ? null : parseInt(p[1], 10) }; });
  const FORCE = process.env.FORCE === '1';

  for (const V of VARIANTS) {
    const sel = want.filter((x) => x.v === V.id);
    if (want.length && !sel.length) continue;
    const slots = sel.length && sel.some((x) => x.slot !== null)
      ? sel.filter((x) => x.slot !== null).map((x) => x.slot) : [0, 1, 2, 3];
    fs.writeFileSync(path.join(PLATE, V.id + SFX + '_prompt.txt'), V.prompt + '\n');
    console.log('== ' + V.id + SFX + ' ==');
    console.log('   ' + V.prompt);
    for (const n of slots) {
      const out = path.join(PLATE, V.id + SFX + '_' + n + '_kraw.png');
      const reroll = sel.some((x) => x.slot === n);
      if (fs.existsSync(out) && !FORCE && !reroll) { console.log('   slot ' + n + '  exists, skipped'); continue; }
      const sq = fs.readFileSync(path.join(PLATE, srcName(n)));
      const seed = (reroll && fs.existsSync(out)) ? SEED[n] + 1000 : SEED[n];
      const r = await postJson('https://fal.run/fal-ai/flux-pro/kontext', {
        image_url: 'data:image/png;base64,' + sq.toString('base64'),
        prompt: V.prompt, num_images: 1, safety_tolerance: '5', seed: seed,
      });
      const url = r.images && r.images[0] && r.images[0].url;
      if (!url) throw new Error('no image url ' + V.id + ' slot ' + n + ': ' + JSON.stringify(r).slice(0, 300));
      fs.writeFileSync(out, await download(url));
      const md = await sharp(fs.readFileSync(out)).metadata();
      console.log('   slot ' + n + ' seed ' + seed + '  -> ' + path.basename(out) + '  ' + md.width + 'x' + md.height +
        (md.width !== PLATE_N || md.height !== PLATE_N ? '   <== NOT 1:1, the no-rescale promise is broken' : ''));
    }
    console.log('');
  }
  console.log('done -- plates in ' + PLATE + '\nnext: node scripts/tiles-crevasse-r3-ladder.cjs');
})();
