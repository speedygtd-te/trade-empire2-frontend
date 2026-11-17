/**
 * ice_shelf HERO-DERIVED SLOT BUILD -- fal.ai flux-pro/kontext (stage 1 of 2).
 *
 * WHY THIS SCRIPT EXISTS
 * ----------------------
 * The first ice_shelf round (scripts/tiles-water-kontext.cjs, one kontext call
 * per ocean slot) was rejected by Rudi: "only slot 1 is usable, all the others
 * are far too edge-oriented and would not tile well". Diagnosis: tiles are laid
 * edge to edge, so a floe that is CUT OFF at the diamond boundary produces a
 * hard seam -- the ice stops mid fracture and does not continue on the
 * neighbour. Slot 1 keeps its ice mostly inland, the others do not.
 *
 * So slot 1 becomes the HERO and every slot is a MINIMAL-VARIATION kontext
 * derivation OF THAT HERO (the repo's *-4slot-build.cjs pattern, e.g.
 * scripts/ocean-4slot-build.cjs): same water, same floe language, same palette
 * -- only the floe layout is shuffled, and shuffled INWARDS so a band of open
 * water runs all the way round the rim. That fixes the tiling problem at the
 * source instead of hoping four independent generations happen to behave.
 *
 * ROUND 7 EXTENDED THAT TO SLOT 1 ITSELF. Shipping the hero frame verbatim was
 * measured at N = 0 px with 595 rim pixels and five of seven floes tangent to or
 * sliced by the diamond -- the worst tiler in the set, and every seam between a
 * hero tile and a composed neighbour showed a severed floe. Slot 1 therefore
 * goes through the compositor too, which re-places the HERO'S OWN floes on the
 * HERO'S OWN water: the motif Rudi picked survives, only the placement changes.
 * The hero frame is preserved unaltered as ice_shelf_hero_masked.png and stays
 * the tone + floe-library reference for all four slots.
 *
 * BASE IS THE PRE-GRADE HERO, not the integrated dark webp: kontext needs a
 * BRIGHT base or it cannot see the water surface and invents mush. Two forms of
 * that same hero exist and the prompt version picks one (see PROMPTS below):
 *   'masked'  assets/style-test/tiles/ice_shelf_hero_masked.png  512x256, diamond
 *   'rect'    assets/style-test/tiles/ice_shelf_1_kraw.png  1456x720, full frame
 * The grade (stage 2,
 * scripts/tiles-water-grade.cjs ice_shelf) runs AFTERWARDS and re-anchors every
 * slot, so whatever exposure kontext returns is normalised there. Because the
 * grade is pointwise, content survives it untouched -- it only moves levels.
 *
 * PROMPT RULES (burnt-in failure modes -- do not reintroduce):
 *  - POSITIVE ONLY. No negations anywhere; a negation reproduces the thing it
 *    forbids. Unwanted looks are displaced by naming the wanted replacement.
 *  - NEVER the words "isometric grid": that phrase drew fine raster lines
 *    across the water in an earlier round.
 *  - NEVER a NUMBER of floes: "ten to fifteen" overcrowded the tile into a
 *    parking lot of concrete slabs. Coverage statements only ("open dark water
 *    fills most of the tile").
 *  - Keep the vocabulary that worked on the hero: "irregular many-sided polygon
 *    with jagged broken edges", "well separated", "wide dark channels".
 *
 * COLOUR HANDLING: a single POINTWISE, luma-neutral per-channel white balance
 * onto the hero's interior means (hue only -- the gains are normalised to
 * Rec709 weight 1 so brightness is left entirely to the grade stage).
 * NO divide-by-blur / 2D equalisation anywhere: on a diamond-masked tile the
 * dark transparent corners poison the edge blur and the rim burns to a gold
 * ring (the toxic_marsh failure).
 *
 * ALPHA: the diamond mask is re-applied from the same SVG polygon the rest of
 * the pipeline uses, so alpha is bit-identical to every other tile.
 *
 * Outputs (assets/style-test/tiles/):
 *   ice_shelf_k0.png, ice_shelf_k2.png, ice_shelf_k3.png   -> grade stage input
 *   ice_shelf_k1.png                                        slot 1 (composed too, v4+)
 *   ice_shelf_hero_d<N>_kraw.png                            cached raw download
 *   _ice_shelf_kontext_check.png                            hero vs derivations
 *
 * fal key from scripts/.env (FAL_AI_API_KEY / FAL_API_KEY) -- never hardcoded.
 *
 * Usage:
 *   node scripts/ice-shelf-hero-derive.cjs                 build all four slots
 *   node scripts/ice-shelf-hero-derive.cjs 0 3             re-roll those slots
 *   node scripts/ice-shelf-hero-derive.cjs 0 --bump=2      second re-roll (seed +2000)
 *   node scripts/ice-shelf-hero-derive.cjs --v=1           use an older prompt version
 *   node scripts/ice-shelf-hero-derive.cjs --reprocess     from cache, no FAL
 *   node scripts/ice-shelf-hero-derive.cjs --sheet-only
 *   node scripts/ice-shelf-hero-derive.cjs --no-flop       skip the 2/3 mirroring
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');

try {
  const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* .env optional for --reprocess / --sheet-only */ }
const FAL_API_KEY = process.env.FAL_AI_API_KEY || process.env.FAL_API_KEY;

const TILE_W = 512, TILE_H = 256;
const ROOT = path.join(__dirname, '..');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
// The hero is kept in a file of its own: the derive stage now WRITES
// ice_shelf_k1.png (slot 1 is composed like every other slot since round 7),
// so reading the tone reference from that same path would make a run
// self-poisoning -- each pass would re-anchor on its own previous output.
const HERO_MASKED = path.join(ST, 'ice_shelf_hero_masked.png');
const HERO_RECT = path.join(ST, 'ice_shelf_1_kraw.png');
const BG = { r: 0x14, g: 0x17, b: 0x1c };

// ---------------------------------------------------------------- PROMPTS ---
// Shared tail: the floe vocabulary that actually worked on the hero, plus
// perspective / light / palette. Positive only, no counts, never "isometric
// grid".
const FLOE_LANGUAGE =
  'keep the exact same dark open ocean water with the exact same colours, brightness and ' +
  'mood, and keep the same pale grey-white sea ice floes, each floe a flat thin plate ' +
  'shaped as an irregular many-sided polygon with uneven jagged broken edges like a cracked ' +
  'piece of pack ice, every floe a different size and a different irregular shape, each ' +
  'carrying a bright thin rim on its upper-left side and a thicker blue-grey submerged edge ' +
  'where it meets the water; ';
const LOOK_TAIL =
  ' open dark water fills most of the picture, with wide dark channels running between the ' +
  'floes and pale foam streaks drifting across the water; the floes lie flat on the water ' +
  'surface and are foreshortened with it, isometric 2.5D perspective at a 2:1 diamond ' +
  'angle, lit from upper left, cold desaturated grey-blue palette, matte frosted surfaces, ' +
  'seamless tiling ground texture';

// v1 -- masked base, inward placement expressed against the DIAMOND.
//   Result: no effect whatsoever. All three slots came back with N = 0 px and
//   ~950 rim pixels, i.e. floes cut straight through the diamond boundary, the
//   same defect Rudi rejected. Reading: the model composes for the RECTANGULAR
//   frame it is handed and does not treat the bright diamond inside the dark
//   corners as the region a placement instruction refers to -- "the four
//   sloping borders of that diamond" is not a frame it can aim at.
const P_V1 = FLOE_LANGUAGE +
  'create a slightly different pattern by moving the floes around to other spots, well ' +
  'separated from each other and gathered towards the middle of the bright diamond-shaped ' +
  'patch of water, so that a wide band of open dark water lies between the ice and every ' +
  'one of the four sloping borders of that diamond and runs unbroken all the way around ' +
  'it;' + LOOK_TAIL;

// v2 -- RECT base + placement expressed against the PICTURE BORDER.
//   Two changes, both aimed at the v1 failure:
//   (a) base is the unmasked 1456x720 hero frame, so the model sees water edge
//       to edge and its own composition frame is the frame the instruction
//       talks about;
//   (b) the target region is stated as "the middle of the picture" with the
//       border and corner bands named as empty water. Geometry check: the
//       diamond is inscribed in the rect, so the central third of the rect
//       (x 171..341, y 85..171 at 512x256) sits >= 38 px inside the diamond
//       boundary -- a "middle of the picture" placement is automatically a safe
//       placement once the mask is applied, whereas an inset RECTANGLE would
//       not be (its corners land exactly ON the diamond edge).
const P_V2 = FLOE_LANGUAGE +
  'create a slightly different pattern by moving all of the ice into the middle of the ' +
  'picture, well separated from each other and clustered around the centre point, so that ' +
  'the whole outer border of the picture is empty open water: a broad expanse of bare dark ' +
  'water fills the left edge, the right edge, the top edge, the bottom edge and all four ' +
  'corners, and that bare water is at least a quarter of the picture width deep on every ' +
  'side, with the ice sitting far inside it;' + LOOK_TAIL;

// v3 -- STOP ASKING. The layout is no longer the model's job.
//   v1 and v2 established that kontext ignores spatial placement instructions
//   but faithfully REPRODUCES THE LAYOUT OF ITS INPUT (both rounds mirrored the
//   edge-heavy distribution of the frame they were handed). So
//   scripts/ice-shelf-compose.cjs builds the layout deterministically -- the
//   hero's own floes, cut out and re-placed by seeded rejection sampling with a
//   hard edgeDist >= 24 px constraint -- and this prompt only asks kontext to
//   re-blend that scaffold into one coherent surface: harmonise the water,
//   re-jag the floe outlines, restore rim and submerged shelf. Placement is
//   restated only to keep the model from tidying the floes back outwards.
const P_V3 =
  'keep every ice floe exactly where it is, at the same size and in the same place, and ' +
  'keep the open water exactly where it is; only make the ice and the water read as one ' +
  'photograph of drifting sea ice: give each floe an irregular many-sided outline with ' +
  'uneven jagged broken edges like a cracked piece of pack ice, a bright thin rim along its ' +
  'upper-left side and a blue-grey submerged shelf just under the surface where it dips into ' +
  'the water, and let gentle ripples and thin pale foam curl around it; settle the open ' +
  'water into one calm dark surface throughout, with wide dark channels running between the ' +
  'floes and a broad expanse of bare open water all around the outside of the group;' +
  LOOK_TAIL;

// v4 -- v3 with the WATER CHARACTER put back.
//   v3 landed the layout but its clause "settle the open water into one calm
//   dark surface throughout" was taken literally: slots 0 and 2 came back with
//   featureless flat water (rim-band water lum 41.4 / 41.6) while slot 3 kept
//   wave structure (45.7) and the hero sat at 49.3. In the interlocking mosaic
//   that reads as a patchwork of flat and textured tiles -- the more visible of
//   the two defects Rudi called out.
//   Fix: "one calm dark surface" is gone and the hero's own water features are
//   named as things to KEEP -- pale foam streaks and thin cracks drifting across
//   the dark water. The reference for all four slots is the hero's water
//   (lum ~49, foam + cracks), because that is the tile Rudi picked. Still
//   positive-only, still no floe count, still never "isometric grid".
const P_V4 =
  'keep every ice floe exactly where it is, at the same size and in the same place, and ' +
  'keep the open water exactly where it is; only make the ice and the water read as one ' +
  'photograph of drifting sea ice: give each floe an irregular many-sided outline with ' +
  'uneven jagged broken edges like a cracked piece of pack ice, a bright thin rim along its ' +
  'upper-left side and a blue-grey submerged shelf just under the surface where it dips into ' +
  'the water, and let gentle ripples and thin pale foam curl around it; keep the faint pale ' +
  'foam streaks and the thin pale cracks drifting across the dark water exactly as they are, ' +
  'the same streaks in the same places, and carry that same softly rippled dark water ' +
  'surface evenly across the whole picture, with wide dark channels running between the ' +
  'floes and a broad expanse of the same rippled open water all around the outside of the ' +
  'group;' + LOOK_TAIL;

const PROMPTS = {
  1: { base: 'masked', prompt: P_V1 },
  2: { base: 'rect', prompt: P_V2 },
  3: { base: 'composite', prompt: P_V3 },
  4: { base: 'composite', prompt: P_V4 },
};
const LATEST = 4;

// Round 7: slot 1 is derived like the rest. It used to ship the raw hero, whose
// floes ran straight through the diamond boundary (N = 0 px, 595 rim px) -- the
// worst tiler of the four. Its replacement is composed from the hero's OWN
// floes and the hero's OWN water, so the motif survives and only the placement
// changes. The hero frame itself lives on untouched in
// assets/style-test/tiles/ice_shelf_hero_masked.png.
// Distinct fixed seeds (no Math.random) so a run is reproducible; slots 2/3 are
// mirrored left<->right afterwards (v1/v2 only -- see `flop` below).
//
// THESE ARE THE SHIPPED SEEDS -- a plain run reproduces the integrated tiles.
// Slots 0 and 2 were re-rolled for water TEXTURE: the v4 prompt fixes the
// featureless-water defect on average, but how much surface structure kontext
// returns still varies per seed, and the mosaic only reads as one water if all
// four slots carry the same amount. Measured on the open-water pixels as
// hf = mean |L - blur3(L)| in the outer 18 px rim band (the band a seam
// actually shows), the accepted set sits at 5.27-5.87. Rejected on the way:
// slot0 704219 (2.13), slot2 815733 (3.20), 816733 (1.66), 817733 (2.28),
// 818733 (1.48), 819733 (2.04), 615733 (1.47) -- all archived under
// assets/style-test/tiles/_water_attempts/.
const DERIVE = [
  { slot: 0, seed: 705219, flop: false },
  { slot: 1, seed: 613085, flop: false },
  { slot: 2, seed: 915733, flop: true },
  { slot: 3, seed: 927461, flop: true },
];

const DIAMOND_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + TILE_W + '" height="' + TILE_H + '">' +
  '<polygon points="' + (TILE_W / 2) + ',0 ' + TILE_W + ',' + (TILE_H / 2) + ' ' +
  (TILE_W / 2) + ',' + TILE_H + ' 0,' + (TILE_H / 2) + '" fill="white"/></svg>'
);

// ------------------------------------------------------------------- HTTP ---
function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = JSON.stringify(body);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'POST',
      headers: {
        Authorization: 'Key ' + FAL_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      const ch = [];
      res.on('data', (c) => ch.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(ch).toString();
        if (res.statusCode >= 400) return reject(new Error('fal ' + res.statusCode + ': ' + raw.slice(0, 400)));
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('bad json ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
function download(url) {
  return new Promise((resolve, reject) => {
    const go = (u) => {
      (u.startsWith('https') ? https : http).get(u, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) return go(res.headers.location);
        const ch = [];
        res.on('data', (c) => ch.push(c));
        res.on('end', () => resolve(Buffer.concat(ch)));
        res.on('error', reject);
      }).on('error', reject);
    };
    go(url);
  });
}

// ------------------------------------------------------------------ STATS ---
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
async function interior(fileOrBuf) {
  const { data, info } = await sharp(fileOrBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const s = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < data.length; i += ch) {
    if (data[i + 3] < 8) continue;
    s[0] += data[i]; s[1] += data[i + 1]; s[2] += data[i + 2]; n++;
  }
  const m = [s[0] / n, s[1] / n, s[2] / n];
  return { r: m[0], g: m[1], b: m[2], lum: L709(m[0], m[1], m[2]) };
}
const f1 = (x) => x.toFixed(1);
const fmtC = (c) => 'R' + f1(c.r) + ' G' + f1(c.g) + ' B' + f1(c.b) + ' lum' + f1(c.lum);

let HERO_RGB = null;

/**
 * POINTWISE luma-neutral per-channel white balance onto the hero. The three
 * gains are divided by their Rec709-weighted mean, so the operation can only
 * rotate hue -- brightness stays exactly where kontext put it and the grade
 * stage remains the single owner of levels.
 */
async function wbToHero(buf, tag) {
  if (!HERO_RGB) return buf;
  const pre = await interior(buf);
  const clamp = (x) => (x < 0.85 ? 0.85 : x > 1.18 ? 1.18 : x);
  let g = [clamp(HERO_RGB.r / pre.r), clamp(HERO_RGB.g / pre.g), clamp(HERO_RGB.b / pre.b)];
  const w = 0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2];
  g = g.map((x) => x / w);
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  for (let i = 0; i < data.length; i += ch) {
    if (data[i + 3] < 1) continue;
    for (let c = 0; c < 3; c++) {
      const v = Math.round(data[i + c] * g[c]);
      data[i + c] = v > 255 ? 255 : v;
    }
  }
  const out = await sharp(data, { raw: { width: info.width, height: info.height, channels: ch } }).png().toBuffer();
  const post = await interior(out);
  console.log('  [wb]   ' + tag + ' R x' + g[0].toFixed(3) + ' G x' + g[1].toFixed(3) + ' B x' + g[2].toFixed(3) +
    '  ' + fmtC(pre) + ' -> ' + fmtC(post));
  return out;
}

// -------------------------------------------------------------- PROCESSING --
const krawPath = (slot) => path.join(ST, 'ice_shelf_hero_d' + slot + '_kraw.png');
const kPath = (slot) => path.join(ST, 'ice_shelf_k' + slot + '.png');

/** kontext rect -> 512x256 fill -> diamond mask -> hue WB -> optional flop */
async function postProcess(cfg, rawBuf, flop) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha().png().toBuffer();
  const mask = await sharp(DIAMOND_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  let buf = await sharp(resized).ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  buf = await wbToHero(buf, 'slot' + cfg.slot);
  if (cfg.flop && flop) {
    buf = await sharp(buf).flop().png().toBuffer();
    console.log('  [flop] slot' + cfg.slot + ' mirrored left<->right');
  }
  fs.writeFileSync(kPath(cfg.slot), buf);
  return buf;
}

async function runSlot(cfg, heroFlat, reroll, bump, flop, prompt) {
  const seed = cfg.seed + (reroll ? 1000 * bump : 0);
  console.log('  [kontext] slot' + cfg.slot + ' seed ' + seed);
  const r = await postJson('https://fal.run/fal-ai/flux-pro/kontext', {
    image_url: 'data:image/png;base64,' + heroFlat.toString('base64'),
    prompt,
    num_images: 1,
    safety_tolerance: '5',
    seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no kontext url for slot' + cfg.slot + ': ' + JSON.stringify(r).slice(0, 200));
  const raw = await download(url);
  fs.writeFileSync(krawPath(cfg.slot), raw);
  return postProcess(cfg, raw, flop);
}

// ------------------------------------------------------------------ SHEET ----
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const label = (t, w) => Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="22">' +
  '<text x="4" y="16" font-family="monospace" font-size="15" fill="#c9d1d9">' + t + '</text></svg>'
);
async function checkSheet() {
  const PAD = 16, GAP = 12, LBL = 22, W = 380, H = 190;
  const hero = fs.readFileSync(HERO_MASKED);
  const rows = [
    { t: 'HERO (Rudi\'s pick -- tone + floe reference)  ice_shelf_hero_masked.png  x4', b: [hero, hero, hero, hero] },
    { t: 'DERIVED  ice_shelf_kN.png  (all four composed + re-blended; pre-grade)', b: [0, 1, 2, 3].map((n) => fs.readFileSync(kPath(n))) },
  ];
  const comp = [];
  let y = PAD;
  for (const row of rows) {
    comp.push({ input: label(row.t, 4 * W + 3 * GAP), left: PAD, top: y });
    y += LBL;
    for (let n = 0; n < 4; n++) {
      comp.push({
        input: await sharp(row.b[n]).resize(W, H, { fit: 'fill' }).png().toBuffer(),
        left: PAD + n * (W + GAP), top: y,
      });
    }
    y += H + GAP + 6;
  }
  const out = await sharp({
    create: { width: PAD * 2 + 4 * W + 3 * GAP, height: y + PAD, channels: 4, background: BGA },
  }).composite(comp).png().toBuffer();
  const p = path.join(ST, '_ice_shelf_kontext_check.png');
  fs.writeFileSync(p, out);
  return p;
}

// ------------------------------------------------------------------- MAIN ----
(async () => {
  const args = process.argv.slice(2);
  const sheetOnly = args.includes('--sheet-only');
  const reprocess = args.includes('--reprocess');
  const bumpArg = args.find((a) => a.startsWith('--bump='));
  const bump = bumpArg ? Number(bumpArg.slice(7)) : 1;
  const rerolls = args.filter((a) => !a.startsWith('--')).map(Number);
  const vArg = args.find((a) => a.startsWith('--v='));
  const version = vArg ? Number(vArg.slice(4)) : LATEST;
  const pv = PROMPTS[version];
  if (!pv) throw new Error('unknown prompt version ' + version);

  if (!fs.existsSync(HERO_MASKED)) throw new Error('hero missing: ' + HERO_MASKED);
  const heroBuf = fs.readFileSync(HERO_MASKED);
  const heroC = await interior(heroBuf);
  HERO_RGB = { r: heroC.r, g: heroC.g, b: heroC.b };
  console.log('[hero] ice_shelf_hero_masked.png ' + fmtC(heroC));
  // v1/v2 mirror slots 2/3 (the *-4slot-build playbook). v3 does NOT: the
  // compositor already flopped each slot's WATER plate for de-repetition and
  // deliberately left the floes unflopped, because a floe carries its bright rim
  // on the upper-left side and mirroring it would light it from upper right.
  const flop = args.includes('--flop') ? true : (version < 3 && !args.includes('--no-flop'));
  console.log('[prompt] v' + version + '  base: ' + pv.base + '  flop slots 2/3: ' + flop);

  const baseFor = (slot) => {
    if (pv.base === 'composite') return path.join(ST, 'ice_shelf_comp' + slot + '.png');
    return pv.base === 'rect' ? HERO_RECT : HERO_MASKED;
  };
  const flatBase = async (slot) => {
    const f = baseFor(slot);
    if (!fs.existsSync(f)) {
      throw new Error('kontext base missing: ' + f +
        (pv.base === 'composite' ? '  -- run node scripts/ice-shelf-compose.cjs first' : ''));
    }
    return sharp(f).flatten({ background: BG }).png().toBuffer();
  };

  if (!sheetOnly) {
    for (const cfg of DERIVE) {
      if (rerolls.length && !rerolls.includes(cfg.slot)) {
        if (!fs.existsSync(kPath(cfg.slot))) throw new Error('slot' + cfg.slot + ' not built yet, run without a slot filter first');
        continue;
      }
      if (reprocess) {
        if (!fs.existsSync(krawPath(cfg.slot))) throw new Error('no cached raw for --reprocess: ' + krawPath(cfg.slot));
        await postProcess(cfg, fs.readFileSync(krawPath(cfg.slot)), flop);
      } else {
        if (!FAL_API_KEY) { console.error('No fal key (FAL_AI_API_KEY in scripts/.env)'); process.exit(1); }
        await runSlot(cfg, await flatBase(cfg.slot), rerolls.includes(cfg.slot), bump, flop, pv.prompt);
      }
      const c = await interior(fs.readFileSync(kPath(cfg.slot)));
      console.log('  slot' + cfg.slot + ' -> ' + fmtC(c));
    }
  }
  const p = await checkSheet();
  console.log('[sheet] ' + path.relative(ROOT, p));
  console.log('derive stage done -- review, then: node scripts/tiles-water-grade.cjs ice_shelf');
})();
