/**
 * CREVASSE FROM GLACIER, STEP 1 OF 2 -- DRAW THE FISSURES WITH FLUX KONTEXT.
 *
 * STYLE TEST. Writes only into assets/style-test/tiles/crevasse/. NOTHING is
 * written to src/assets/tiles/. No cap sync, no build, no git.
 *
 * WHY THIS RUN EXISTS
 *   `glacier` shipped today as the Ganymede-direction ground: dusty neutral grey,
 *   L 44.0, B/R 1.100, G/R 1.060, micro8 6.2-8.8 (mean 7.40), tiltY 3.0 / tiltX 0.0,
 *   blowout 0.00%, derived from `regolith`. `crevasse` sits on the SAME planet, so
 *   it has to be told apart from `glacier` at play scale -- and the family analysis
 *   said how: "wenige breite schwarze Spalten", target micro8 ~17 against
 *   glacier's 7.40. The ground is therefore NOT rebuilt; glacier IS the ground,
 *   and the only thing added is the fissures.
 *
 * THE PROMPT IS SCOPED, NOT AREAL -- the one lesson that decides this run
 *   kontext regenerates a surface whenever the prompt describes the surface. On
 *   `tundra` "replace every plant by gravel" failed (the ground was rebuilt into
 *   pale plaster) and "keep the existing dark stony soil, and WHERE a tuft stands
 *   put that same gravel" worked. So here the ground is named as the thing that
 *   must SURVIVE, verbatim and first, and the instruction after it is purely
 *   additive ("ONLY ADD ..."). No negative prompt anywhere -- negatives reproduce
 *   the unwanted concept (the sand_dunes relief lesson).
 *
 * WIDE, FEW. A tile is ~2 screen pixels tall at play scale; a hairline crack is
 * gone there without trace. The fissures have to CROSS the tile and be areal
 * enough to move the mean down and the structure up, otherwise `crevasse` and
 * `glacier` are the same tile with two names.
 *
 * THE LADDER (6 variants = 3 densities x 2 wall treatments)
 *   d2 / d4 / d6      two, four, six fissures -- sparse to strong
 *   NEUTRAL           the gash interior is flat black shadow, no material hint
 *   BLUE              plus a thin pale blue glacial-ice band on the fresh upper
 *                     break lip: the one place the blue that left the AREA still
 *                     belongs physically -- fresh ice under the dust cover.
 *   The seed is held PER SLOT across all six variants, so the fissure layout is
 *   comparable down a column and only the instruction changes.
 *
 * SOURCES ARE FROZEN FIRST and never read from src/assets/tiles/ again, so this
 * pipeline cannot eat its own output the way the kelp_forest run did.
 *
 * Output (assets/style-test/tiles/crevasse/)
 *   src/glacier_<n>_src.webp               the frozen input, byte-compared every run
 *   kraw/<VARIANT>/crevasse_<n>_kraw.png   raw kontext return, for judging collateral
 *   kraw/<VARIANT>/collateral.json         per-slot before/after numbers
 *
 * Grading, tilt normalisation, mips, metrics and the contact sheets are step 2:
 *   scripts/tiles-crevasse-ladder.cjs
 *
 * Usage: node scripts/tiles-crevasse-kontext.cjs                all 6 variants x 4 slots, skips what exists
 *        node scripts/tiles-crevasse-kontext.cjs d4-NEUTRAL     one variant
 *        node scripts/tiles-crevasse-kontext.cjs d4-NEUTRAL:2   one variant, one slot (re-roll, seed +1000)
 *        FORCE=1 node scripts/tiles-crevasse-kontext.cjs ...    overwrite instead of skip
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
const WORK = path.join(ROOT, 'assets', 'style-test', 'tiles', 'crevasse');
const SRCD = path.join(WORK, 'src');
const KRAW = path.join(WORK, 'kraw');
const TILE_W = 512, TILE_H = 256;
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// -- THE PROMPT ------------------------------------------------------------
// (1) the ground is named first and named as the thing that survives;
// (2) the addition is scoped with ONLY ADD;
// (3) no negatives anywhere.
const KEEP =
  'keep ALL of the existing dusty grey ice surface exactly as it is, do not regenerate ' +
  'and do not recolour the ground, keep every grain of dust, every speckle and every small ' +
  'stone that is already there, and keep the same overall brightness. ONLY ADD ';
const WIDE =
  'each fissure is a wide gaping gash, many times wider than a hairline crack, wide enough ' +
  'to look down into, with ragged broken lips, ';
const TAIL =
  'same camera angle, same diamond shape, seamless tileable ground texture, matte';

// LAYOUT PROBE, 2026-09-03 (scripts/_probe_crevasse_layout.cjs, deleted after the
// read; panels kept as _crevasse_layout_probe.png). The first wording -- "each
// running right across the whole tile from one edge to the opposite edge" -- made
// kontext converge EVERY fissure on the tile centre: a four-armed X reaching the
// four edge midpoints, the same motif on every slot. That is a per-tile motif and
// therefore a lattice hint, which is exactly what grid_tot measures. Rewording to
// a ROUGHLY PARALLEL SET with its own offsets breaks the convergence on some
// slots but not all; kontext still centres an X on part of the draws. The wording
// below is the better of the two and is physically the right one anyway -- real
// crevasse fields are near-parallel shear sets, not radial stars. Whether the
// residue still reads as a lattice is decided by grid_tot at play scale in step 2,
// not by the prompt.
const DENS = {
  d2: 'two broad open crevasse fissures running across the tile as a roughly parallel pair, both slanting the same way, ' +
      'set well apart from each other, each one crossing from one edge to the opposite edge, ',
  d4: 'four broad open crevasse fissures running across the tile as a roughly parallel set, all slanting the same way, ' +
      'spaced apart at their own offsets so they spread over the whole tile, each one crossing from one edge to the opposite edge, ',
  d6: 'six broad open crevasse fissures running across the tile as a roughly parallel set, all slanting the same way, ' +
      'spaced apart at their own offsets so they spread over the whole tile, each one crossing from one edge to the opposite edge, ',
};
const WALL = {
  NEUTRAL: 'and the inside of every gash is deep flat black shadow with no colour at all, ',
  BLUE: 'and the inside of every gash is deep dark shadow, with a thin band of pale blue glacial ice ' +
        'showing along the freshly broken upper lip of every gash where the dust cover has fallen away, ',
};
const VARIANTS = [];
for (const d of ['d2', 'd4', 'd6']) for (const w of ['NEUTRAL', 'BLUE']) {
  VARIANTS.push({ id: d + '-' + w, dens: d, wall: w, prompt: KEEP + DENS[d] + WIDE + WALL[w] + TAIL });
}

const SEED = [83011, 83022, 83033, 83044];   // per SLOT, held across all variants

const DIAMOND = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + TILE_W + '" height="' + TILE_H + '">' +
  '<polygon points="' + TILE_W / 2 + ',0 ' + TILE_W + ',' + TILE_H / 2 + ' ' +
  TILE_W / 2 + ',' + TILE_H + ' 0,' + TILE_H / 2 + '" fill="white"/></svg>');

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

/** interior stats + micro contrast, measured on a masked buffer */
async function quick(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, w = info.width, h = info.height;
  const is = [0, 0, 0]; let ni = 0;
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  const lv = [];
  for (let p = 0; p < w * h; p++) {
    const i = p * ch;
    L[p] = L709(data[i], data[i + 1], data[i + 2]); A[p] = data[i + 3];
    if (A[p] >= 8) { for (let c = 0; c < 3; c++) is[c] += data[i + c]; ni++; lv.push(L[p]); }
  }
  const im = is.map((x) => x / ni);
  lv.sort((a, b) => a - b);
  let s = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) { const p = y * w + x; if (A[p] < 200 || A[p + 1] < 200) continue; s += Math.abs(L[p] - L[p + 1]); n++; }
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) { const p = y * w + x; if (A[p] < 200 || A[p + w] < 200) continue; s += Math.abs(L[p] - L[p + w]); n++; }
  const med = lv[Math.floor(lv.length * 0.5)];
  return {
    intLum: L709(im[0], im[1], im[2]), br: im[2] / im[0], gr: im[1] / im[0],
    p50: med, p70: lv[Math.floor(lv.length * 0.7)], p99: lv[Math.floor(lv.length * 0.99)],
    darkFrac: lv.filter((v) => v < 0.55 * med).length / lv.length,
    microFull: n ? s / n : 0,
  };
}
const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2);

(async () => {
  fs.mkdirSync(SRCD, { recursive: true });
  fs.mkdirSync(KRAW, { recursive: true });

  // -- freeze guard: copy once, then byte-compare on every run -------------
  for (let n = 0; n < 4; n++) {
    const origin = path.join(TILES, 'glacier', 'glacier_' + n + '.webp');
    const frozen = path.join(SRCD, 'glacier_' + n + '_src.webp');
    if (!fs.existsSync(frozen)) { fs.copyFileSync(origin, frozen); console.log('[freeze] glacier_' + n + '_src.webp created'); }
    const same = fs.readFileSync(frozen).equals(fs.readFileSync(origin));
    console.log('[freeze] glacier_' + n + '  frozen copy ' + (same ? 'MATCHES' : 'DIFFERS FROM') + ' src/assets/tiles/glacier/');
  }
  console.log('');

  // -- arg parsing: VARIANT[:slot] -----------------------------------------
  const args = process.argv.slice(2);
  const want = [];
  for (const a of args) {
    const [v, s] = a.split(':');
    want.push({ v, slot: s === undefined ? null : parseInt(s, 10) });
  }
  const FORCE = process.env.FORCE === '1';

  const before = [];
  for (let n = 0; n < 4; n++) before.push(await quick(fs.readFileSync(path.join(SRCD, 'glacier_' + n + '_src.webp'))));
  console.log('[base] glacier as frozen');
  for (let n = 0; n < 4; n++) {
    const b = before[n];
    console.log('   slot ' + n + '  intL ' + f1(b.intLum) + '  B/R ' + f2(b.br) + '  p50 ' + f1(b.p50) +
      '  p70 ' + f1(b.p70) + '  dark% ' + f2(100 * b.darkFrac) + '  microFull ' + f2(b.microFull));
  }
  console.log('');

  for (const V of VARIANTS) {
    const sel = want.filter((x) => x.v === V.id);
    if (want.length && !sel.length) continue;
    const slots = sel.length && sel.some((x) => x.slot !== null)
      ? sel.filter((x) => x.slot !== null).map((x) => x.slot) : [0, 1, 2, 3];
    const dir = path.join(KRAW, V.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'prompt.txt'), V.prompt + '\n');
    console.log('== ' + V.id + ' ==');
    console.log('   ' + V.prompt);
    const coll = [];
    for (const n of slots) {
      const out = path.join(dir, 'crevasse_' + n + '_kraw.png');
      const reroll = sel.some((x) => x.slot === n);
      if (fs.existsSync(out) && !FORCE && !reroll) { console.log('   slot ' + n + '  exists, skipped'); continue; }
      const frozen = path.join(SRCD, 'glacier_' + n + '_src.webp');
      const flat = await sharp(fs.readFileSync(frozen))
        .flatten({ background: { r: 0x14, g: 0x17, b: 0x1c } }).png().toBuffer();
      const seed = (reroll && fs.existsSync(out)) ? SEED[n] + 1000 : SEED[n];
      const r = await postJson('https://fal.run/fal-ai/flux-pro/kontext', {
        image_url: 'data:image/png;base64,' + flat.toString('base64'),
        prompt: V.prompt, num_images: 1, safety_tolerance: '5', seed,
      });
      const url = r.images && r.images[0] && r.images[0].url;
      if (!url) throw new Error('no image url ' + V.id + ' slot ' + n + ': ' + JSON.stringify(r).slice(0, 300));
      fs.writeFileSync(out, await download(url));

      // masked preview only for the collateral read -- the real grade is step 2
      const resized = await sharp(fs.readFileSync(out)).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha().png().toBuffer();
      const mask = await sharp(DIAMOND).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
      const masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
      const a = await quick(masked);
      const b = before[n];
      coll.push({ slot: n, seed, before: b, after: a });
      console.log('   slot ' + n + ' seed ' + seed +
        '   intL ' + f1(b.intLum) + '->' + f1(a.intLum) +
        '   B/R ' + f2(b.br) + '->' + f2(a.br) +
        '   p70 ' + f1(b.p70) + '->' + f1(a.p70) +
        '   dark% ' + f2(100 * b.darkFrac) + '->' + f2(100 * a.darkFrac) +
        '   microFull ' + f2(b.microFull) + '->' + f2(a.microFull) +
        '   (x' + f2(a.microFull / b.microFull) + ')');
    }
    if (coll.length) fs.writeFileSync(path.join(dir, 'collateral.json'), JSON.stringify(coll, null, 1));
  }
  console.log('\ndone -- judge kraw/<VARIANT>/crevasse_<n>_kraw.png for collateral, then run tiles-crevasse-ladder.cjs');
})();
