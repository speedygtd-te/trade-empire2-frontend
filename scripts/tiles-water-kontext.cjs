/**
 * PARAMETERISED WATER-TILE KONTEXT STEP (fal.ai flux-pro/kontext).
 *
 * Stage 1 of a two-stage pipeline. Adds CONTENT to a water tile that a colour
 * grade can never invent (shallow_water: sea floor -- sand / stones / shells /
 * plants; ice_shelf: drifting floes on open water). Stage 2 is
 * scripts/tiles-water-grade.cjs, which pulls the result into the dark redesign
 * target band.
 *
 * ORDER MATTERS -- kontext FIRST, grade SECOND:
 *  - kontext needs a BRIGHT base. On a pre-darkened tile it has too little
 *    signal to see the water surface / sea floor and invents mush.
 *  - grading last normalises whatever brightness kontext happened to return,
 *    so the target band is guaranteed regardless of the model's exposure.
 *
 * kontext is NEVER additive -- it REGENERATES the whole frame and will happily
 * delete the base. Every prompt therefore leads with an explicit preservation
 * clause ("keep ALL the existing ... ; only ADD ...") and every slot is
 * reviewed on the contact sheet afterwards. Prompts are POSITIVE-ONLY: no
 * negative phrasing anywhere (negations reproduce the thing they forbid) --
 * unwanted looks are displaced by naming the wanted replacement instead.
 *
 * Slot bases keep the existing per-slot variation and the flips that are
 * already baked into the sources -- nothing is re-flipped here.
 *
 * Outputs (assets/style-test/tiles/):
 *   <biome>_src<N>.png    snapshot of the untouched base (before/after ref)
 *   <biome>_<N>_kraw.png  cached raw kontext download (re-process without FAL)
 *   <biome>_k<N>.png      512x256 diamond-masked kontext result -> grade input
 *   _<biome>_kontext_check.png  contact sheet: base row over kontext row
 *
 * fal key from scripts/.env (FAL_AI_API_KEY / FAL_API_KEY) -- never hardcoded.
 *
 * Usage:
 *   node scripts/tiles-water-kontext.cjs shallow_water
 *   node scripts/tiles-water-kontext.cjs ice_shelf 1 3      re-roll slots 1,3 (seed+1000)
 *   node scripts/tiles-water-kontext.cjs shallow_water --reprocess   from cache, no FAL
 *   node scripts/tiles-water-kontext.cjs shallow_water --sheet-only
 *
 * TWO CONFIG SHAPES
 *  a) PER-SLOT BASE (shallow_water, ice_shelf, reef): base(n) returns a different
 *     source tile per slot and kontext adds the same content to each -- the
 *     per-slot variation comes from the four different sources.
 *  b) SINGLE HERO (kelp_forest): base(n) returns the SAME hero for all four slots,
 *     `passthrough` lists the slot(s) that ARE the hero (copied through, no FAL
 *     call), and the remaining slots are minimal-variation kontext derivations of
 *     that hero on distinct seeds. `matchHero` white-balances every derivation back
 *     onto the hero's interior channel means (uniform per-channel gain -- pointwise,
 *     so the diamond rim stays safe), and `flop` mirrors the listed slots
 *     left<->right to fight visible repetition. This is the ocean-4slot pattern
 *     (scripts/ocean-4slot-build.cjs) folded into the parameterised path.
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
} catch { /* .env optional for --sheet-only / --reprocess */ }
const FAL_API_KEY = process.env.FAL_AI_API_KEY || process.env.FAL_API_KEY;

const TILE_W = 512, TILE_H = 256;
const ROOT = path.join(__dirname, '..');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const BG = { r: 0x14, g: 0x17, b: 0x1c };

// ---------------------------------------------------------------- PROMPTS ---
// Preservation clause first, then the ADD list, then perspective + light +
// palette. Positive-only throughout.
// v3.
// v1 ('add detail to the sea floor') made kontext read the tile as a SHORELINE:
//    it flattened the water and piled all the new detail into one corner as a
//    gravel beach, deleting the coral patches.
// v2 fixed the destruction (naming the coral patches individually in the
//    preservation clause + asserting the tile is submerged edge to edge) but
//    over-constrained it into a near no-op: nothing was actually added.
// v3 keeps v2's preservation and edge-to-edge clauses, drops v2's 'at the same
//    size' (which pushed towards identity), and replaces v2's timid 'small
//    extra detail' with an assertive COVER/FILL instruction plus concrete
//    counts -- add signal without ever phrasing a prohibition.
const P_SHALLOW =
  'isometric view of the same warm turquoise shallow lagoon seen from above, entirely ' +
  'underwater from edge to edge; keep the existing turquoise water with its ripples and ' +
  'its dancing light reflections, and keep the existing dark coral patches and dark rock ' +
  'clusters where they are; now COVER the pale sandy bottom in every open stretch of ' +
  'water with dense new detail, spread evenly across the whole tile: rippled grey-brown ' +
  'sand banks, many scattered dark wet pebbles and small rounded stones gathered into ' +
  'loose gravel patches, several pale spiral and fan shells lying flat on the sand, and ' +
  'numerous small tufts of dull olive-green seagrass and short stubby weed; the sand, ' +
  'stones, shells and plants FILL the empty stretches of water, lying flat on the bottom ' +
  'and seen through the clear water from directly above; clear turquoise water covers all ' +
  'four corners and all four edges of the image; isometric 2.5D perspective, lit from ' +
  'upper left, muted desaturated dirty colours, matte grainy surfaces, seamless tiling ' +
  'underwater ground texture';

// v3.
// v1 preserved the dark water and the open lanes, but rendered the floes as
//    SCREEN-AXIS-ALIGNED RECTANGLES -- white boxes pasted on top of the image
//    rather than ice lying in the isometric ground plane -- and slot1 came back
//    with only two of them.
// v2 added 'ten to fifteen' plus 'long straight edges run diagonally along the
//    isometric grid'. Both backfired: the count overcrowded slots 0/1 until the
//    tile read as a parking lot of concrete slabs, and 'long straight edges'
//    reinforced the rectangles. Only slot3 came out right -- irregular jagged
//    polygons on open water -- so slot3 is KEPT from v2 and not re-rolled.
// v3 therefore drops the count in favour of a coverage statement ('open dark
//    water fills most of the tile', 'well separated'), and replaces the
//    straight-edge geometry with explicit many-sided broken pack-ice outlines.
const P_ICE =
  'isometric view of the same dark open ocean water, keep the existing dark water surface ' +
  'with its ripples and pale foam streaks, and keep open dark water filling most of the ' +
  'tile with wide dark channels running between the ice; only ADD a scattering of well ' +
  'separated drifting sea ice floes lying flat on that water, each floe a flat thin plate ' +
  'of pale grey-white ice shaped as an irregular many-sided polygon with uneven jagged ' +
  'broken edges like a cracked piece of pack ice, every floe a different size and a ' +
  'different irregular shape, each carrying a bright thin rim on its upper-left side and a ' +
  'thicker blue-grey submerged edge where it meets the water, with a few small brash-ice ' +
  'crumbs drifting in the water beside them; the floes lie flat within the isometric ' +
  'ground plane of the water and are foreshortened with it, isometric 2.5D perspective at ' +
  'a 2:1 diamond angle, lit from upper left, cold desaturated grey-blue palette, matte ' +
  'frosted surfaces, seamless tiling ground texture';

// v4 (reef).
// v1 asked for a reef growing on the bottom of the existing ocean water, with
// "narrow winding lanes of darker water running between" the colonies and
// "patches of coarse pale sand and bare reef rock between them". Both clauses
// backfired the same way: kontext stopped reading the frame as a close-up of
// ground and read it as an AERIAL MAP -- the lanes came back as sandy paths that
// cut the tile into rectangular fields, the sand patches became the fields
// themselves, and the coral was pushed out to the border as a decorative frame.
// v2 fixed the structure completely by deleting every phrase that implies
// distance or a route between things and replacing them with close-up framing
// ("the coral heads are LARGE in the frame", "coral touching coral everywhere")
// plus shadowed crevices instead of lanes -- a continuous reef carpet, edge to
// edge, which every version since has kept verbatim.
// COLOUR then took two more rounds, and both failures had the same cause: a
// GLOBAL colour adjective is read as an instruction about the whole image, and
// the model resolves it towards grey.
//   v2 said "every colour soft and desaturated as if seen deep under water" and
//     returned four grey-teal tiles with no pigment at all.
//   v3 said "muted earthy pigments rather than bright ones" and returned the
//     same grey-green. Boosting saturation afterwards in the grade (desat 2.0)
//     only amplified the teal, because there was no warm pigment left to amplify
//     -- proof that colour has to be won here and cannot be recovered downstream.
// v4 therefore stops describing the palette and ASSIGNS A PIGMENT TO EACH NAMED
// CORAL TYPE. Attaching a colour to an object the model is already drawing is a
// far stronger signal than an adjective floating over the whole frame, and it
// cannot collapse to "make it grey". Muting is then left entirely to the grade
// stage's desat, which is the controllable end of the pipeline.
// Colour matters here more than anywhere else in the ocean set: REEF sits on the
// same planet as deep_ocean and kelp_forest, which are also blue-green, and
// pigment is the only thing that tells it apart from them at a glance.
// Carried over unchanged: coverage instead of counts, the explicit corners/edges
// clause, positive-only phrasing, and no phrase containing "isometric grid".
const P_REEF =
  'extreme close-up view of a living coral reef in shallow sunlit water, filling the ' +
  'entire frame, seen from directly above; the whole frame is one continuous carpet of ' +
  'coral, coral touching coral everywhere: rounded knobbly brain-coral boulders and ' +
  'mounded encrusting coral heads packed tightly against one another, dense thickets of ' +
  'branching staghorn coral, broad overlapping plate corals and low ruffled fan corals, ' +
  'small tufts of dull olive weed growing between them, and narrow dark shadowed crevices ' +
  'where the colonies touch; the coral heads are LARGE in the frame and the carpet of ' +
  'coral continues straight past all four edges and all four corners of the picture; the ' +
  'brain-coral boulders are dusty rose and faded salmon pink, the staghorn thickets are ' +
  'muddy amber and burnt ochre, the plate corals are dull violet-grey, the fan corals are ' +
  'rust brown, and the encrusting mats between them are greyed olive-green; these coral ' +
  'colours are clearly present all over the reef and are spread evenly across the whole ' +
  'frame; isometric 2.5D perspective at a 2:1 diamond angle, lit from upper left, matte ' +
  'grainy surfaces, seamless tiling underwater texture';

// v1 (kelp_forest) -- MINIMAL VARIATION, not new content.
// kelp_forest already has its own original art. Rudi picked slot 2 as the hero
// because the other three do not tile: their fronds bunch in the middle or in one
// corner, which repeats as a visible dot pattern once the tiles are laid out
// (measured by scripts/tiles-frond-evenness.cjs -- slot2 rim/interior delta 1.9pp
// against 9.3pp and 9.2pp for slots 1 and 3). The job here is therefore only three
// slightly different arrangements of the SAME hero. Positive-only phrasing: instead
// of "do not change the colour" the prompt asserts "keep the exact same water
// colour". The evenness clause is the acceptance criterion, so it is stated openly.
const P_KELP =
  'keep the exact same underwater kelp forest with the exact same water colour, the exact ' +
  'same brightness and the exact same mood; only shift and rearrange the kelp fronds and ' +
  'the small gaps of open water between them into a different arrangement; keep the kelp ' +
  'spread evenly over the whole picture so that every part carries the same amount of ' +
  'kelp, right into all four corners and all along all four edges; keep the same fronds, ' +
  'the same water, the same light and the same overall amount of kelp; seen from directly ' +
  'above, isometric 2.5D perspective, lit from upper left, seamless tiling underwater ' +
  'ground texture';

// SELF-REFERENCE HAZARD -- read before changing this path.
// kelp_forest is the only biome here whose source is its OWN shipped tile. The
// moment the grade stage integrates, src/assets/tiles/kelp_forest/kelp_forest_2
// .webp IS the graded output, and re-running this script would white-balance the
// derivations against the graded tile and push the passthrough slot through the
// grade a second time -- the tiles darken and desaturate a little more on every
// run, silently. So the hero is pinned to a frozen copy that the pipeline never
// writes to. It was lifted out of git (the state before this biome was first
// integrated) and lives next to the review sheets.
const KELP_HERO = path.join(ST, 'kelp_forest_hero_src.webp');

const CONFIG = {
  shallow_water: {
    // its OWN bright original -- the loud clean turquoise is exactly the
    // signal kontext needs to place bottom detail under the water.
    base: (n) => path.join(TILES, 'shallow_water', `shallow_water_${n}.webp`),
    baseLabel: 'src/assets/tiles/shallow_water/shallow_water_N.webp (original)',
    prompt: P_SHALLOW,
    seeds: [412903, 528117, 637421, 741883],
  },
  ice_shelf: {
    // ocean, same source family as deep_ocean (Rudi). Deliberate GDD
    // divergence: the GDD's "hundreds of metres high ice cliff" cannot be a
    // seamlessly self-tiling ground tile -- floes on open water can, and the
    // GDD's "tabular" reads fine as tabular ice.
    base: (n) => path.join(TILES, 'ocean', `ocean_${n}.webp`),
    baseLabel: 'src/assets/tiles/ocean/ocean_N.webp',
    prompt: P_ICE,
    seeds: [813557, 926041, 138269, 249713],
  },
  // reef: OCEAN-planet sibling of deep_ocean out of the same `ocean` source
  // family. deep_ocean is a pure darkening grade; reef gets kontext coral content
  // and a far lighter target band (~28 against 15.8) because reef sits in shallow
  // lit water. Unlike ocean/deep_ocean these two DO meet on one planet, so the
  // coral structure and the muted colour accents are what has to carry them apart.
  reef: {
    base: (n) => path.join(TILES, 'ocean', `ocean_${n}.webp`),
    baseLabel: 'src/assets/tiles/ocean/ocean_N.webp',
    prompt: P_REEF,
    seeds: [305881, 417263, 526409, 638147],
  },
  // kelp_forest: SINGLE-HERO shape. Hero = its own kelp_forest_2 (Rudi's pick).
  // Slot 2 is the hero itself (flopped), slots 0/1/3 are minimal-variation
  // derivations of it, white-balanced back onto the hero.
  kelp_forest: {
    base: () => KELP_HERO,
    baseLabel: 'assets/style-test/tiles/kelp_forest_hero_src.webp (frozen kelp_forest_2 hero, base of all four slots)',
    prompt: P_KELP,
    seeds: [714203, 825619, 936041, 147829],
    passthrough: [2],
    flop: [2, 3],
    matchHero: true,
    // rectFill: TRIED AND REJECTED on this hero -- see the rectFill() comment.
    // The theory held (the flatten-over-dark-BG input is what teaches kontext to
    // vignette), but on kelp_forest the cure was worse: shown a seamless
    // edge-to-edge kelp texture the model re-read the SCALE and came back with a
    // handful of huge single fern fronds instead of the hero's dense small ones,
    // which is a different biome. Kept off here; the mechanism is still worth
    // trying on a biome whose content has no strong intrinsic scale.
    // (attempt archived: _water_attempts/kelp_forest_N_rectfill_REJECTED_rescaled_kraw.png)
    rectFill: false,
  },
};

const DIAMOND_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}">` +
  `<polygon points="${TILE_W / 2},0 ${TILE_W},${TILE_H / 2} ${TILE_W / 2},${TILE_H} 0,${TILE_H / 2}" fill="white"/></svg>`
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
        Authorization: `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      const ch = [];
      res.on('data', (c) => ch.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(ch).toString();
        if (res.statusCode >= 400) return reject(new Error(`fal ${res.statusCode}: ${raw.slice(0, 400)}`));
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

// ----------------------------------------------------------------- STATS -----
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
async function canvasStats(fileOrBuf) {
  const { data, info } = await sharp(fileOrBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, N = data.length / ch;
  const s = [0, 0, 0];
  let dark = 0, light = 0, ni = 0;
  const lums = [];
  for (let i = 0; i < data.length; i += ch) {
    s[0] += data[i]; s[1] += data[i + 1]; s[2] += data[i + 2];
    if (data[i + 3] >= 8) { lums.push(L709(data[i], data[i + 1], data[i + 2])); ni++; }
  }
  lums.sort((a, b) => a - b);
  dark = lums.slice(0, Math.floor(ni / 2)).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(ni / 2));
  light = lums.slice(Math.floor(ni / 2)).reduce((a, b) => a + b, 0) / Math.max(1, ni - Math.floor(ni / 2));
  const m = s.map((x) => x / N);
  return { rgb: m, lum: L709(m[0], m[1], m[2]), darkHalf: dark, lightHalf: light, spread: light - dark };
}
const f1 = (x) => x.toFixed(1);

/**
 * RECT FILL -- what kontext actually gets to look at.
 *
 * A tile is a DIAMOND on a transparent canvas. Flattening it over the dark page
 * background (the obvious thing, and what this script did for shallow_water and
 * ice_shelf) hands kontext an image with four black triangular corners, and the
 * model does the reasonable thing with them: it treats them as part of the
 * picture and reproduces a VIGNETTE, thinning the content out towards the rim.
 * On kelp_forest that showed up as a measured 6-7pp drop in frond share in the
 * outer band against the interior, on a hero whose own drop is 1.9pp -- i.e. the
 * damage was done by the input, not by the prompt. Tiles thinned out like that
 * repeat as a visible dot pattern (see scripts/tiles-frond-evenness.cjs).
 *
 * So instead of black, the corners are filled with the tile's OWN ISO
 * NEIGHBOURS. Diamond tiles tessellate at a row pitch of H/2 with every other
 * row offset by W/2, so laying that grid down and cutting the central W x H
 * window back out gives a fully covered rectangle whose centre is the original
 * tile, byte for byte, and whose corners are seamless continuations of it.
 * kontext then sees an edge-to-edge texture and has no vignette to copy.
 */
async function rectFill(baseBuf) {
  const cells = [];
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 4; c++) {
      cells.push({
        input: baseBuf,
        left: c * TILE_W + (r % 2 ? TILE_W / 2 : 0),
        top: r * (TILE_H / 2),
      });
    }
  }
  // the r=2,c=1 cell lands exactly at (TILE_W, TILE_H) -- that is the window we cut
  const big = await sharp({
    create: { width: 3 * TILE_W + TILE_W / 2, height: 3 * TILE_H + TILE_H / 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(cells).png().toBuffer();
  return sharp(big)
    .extract({ left: TILE_W, top: TILE_H, width: TILE_W, height: TILE_H })
    .flatten({ background: BG }).png().toBuffer();
}

// ------------------------------------------------------------- PROCESSING ---
const krawPath = (biome, n) => path.join(ST, `${biome}_${n}_kraw.png`);
const kPath = (biome, n) => path.join(ST, `${biome}_k${n}.png`);
const srcPath = (biome, n) => path.join(ST, `${biome}_src${n}.png`);

/**
 * Zero the RGB underneath fully transparent pixels.
 *
 * Every slot must reach the grade stage with the SAME corner state, because the
 * grade's target is a whole-canvas mean and the transparent corners are 49.6% of
 * it. A kontext slot comes out of the diamond composite with 0/0/0 corners; a
 * passthrough slot copied from an existing .webp carries that file's ~3/3/3
 * corners instead. Left alone, that 3-level difference is worth 1.5 canvas luma,
 * and the level solve silently makes the passthrough slot's INTERIOR ~5% darker
 * than its three siblings to compensate. Alpha is not touched.
 */
async function zeroTransparentRgb(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  for (let i = 0; i < data.length; i += ch) {
    if (data[i + 3] !== 0) continue;
    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: ch } }).png().toBuffer();
}

/** interior channel means of a diamond-masked tile (hero reference for matchHero) */
async function interiorRgb(fileOrBuf) {
  const { data, info } = await sharp(fileOrBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const s = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < data.length; i += ch) {
    if (data[i + 3] < 8) continue;
    s[0] += data[i]; s[1] += data[i + 1]; s[2] += data[i + 2]; n++;
  }
  return [s[0] / n, s[1] / n, s[2] / n];
}

/**
 * UNIFORM PER-CHANNEL WHITE BALANCE onto the hero's interior means. One gain per
 * channel for the whole tile -- pointwise and position independent, so it can
 * never over-brighten the diamond rim (the toxic_marsh gold-rim failure mode).
 * Only used by the single-hero shape, where every slot must read as the same
 * material as the hero; the per-slot brightness is pinned later by the grade.
 */
async function whiteBalanceTo(buf, heroRgb, tag) {
  const cur = await interiorRgb(buf);
  const clamp = (x) => (x < 0.8 ? 0.8 : x > 1.25 ? 1.25 : x);
  const g = [clamp(heroRgb[0] / cur[0]), clamp(heroRgb[1] / cur[1]), clamp(heroRgb[2] / cur[2])];
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < 1) continue;
    for (let c = 0; c < 3; c++) data[i + c] = Math.min(255, Math.round(data[i + c] * g[c]));
  }
  const out = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png().toBuffer();
  const post = await interiorRgb(out);
  console.log(
    `  [wb] ${tag} R x${g[0].toFixed(3)} G x${g[1].toFixed(3)} B x${g[2].toFixed(3)}  ` +
    `${cur.map((v) => v.toFixed(1)).join('/')} -> ${post.map((v) => v.toFixed(1)).join('/')}` +
    `  (hero ${heroRgb.map((v) => v.toFixed(1)).join('/')})`
  );
  return out;
}

/**
 * kontext rect -> 512x256 fill -> optional flop -> diamond mask -> optional
 * white balance. The FLOP HAPPENS BEFORE THE MASK on purpose: the diamond
 * polygon's antialiased rim is not exactly symmetric about the pixel grid, so
 * flopping an already-masked tile would shift the alpha by a fraction of a pixel
 * and the four slots would no longer share one byte-identical mask. Masking last
 * guarantees every slot of every biome carries the same alpha.
 * No level/contrast ops here -- the grade stage owns every brightness decision.
 */
async function postProcess(biome, n, rawBuf, cfg, heroRgb) {
  const doFlop = Array.isArray(cfg && cfg.flop) && cfg.flop.includes(n);
  let pipe = sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha();
  if (doFlop) pipe = pipe.flop();
  const resized = await pipe.png().toBuffer();
  const mask = await sharp(DIAMOND_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  let masked = await sharp(resized).ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  if (heroRgb) masked = await whiteBalanceTo(masked, heroRgb, `${biome} slot${n}`);
  masked = await zeroTransparentRgb(masked);
  fs.writeFileSync(kPath(biome, n), masked);
  if (doFlop) console.log(`  [flop] ${biome} slot${n} mirrored left<->right (pre-mask)`);
  return masked;
}

/** snapshot the untouched base so the before/after survives overwriting src/ */
async function snapshotBase(biome, n, cfg) {
  const p = srcPath(biome, n);
  const buf = await sharp(cfg.base(n)).ensureAlpha().png().toBuffer();
  fs.writeFileSync(p, buf);
  return buf;
}

async function runSlot(biome, n, cfg, reroll, bump, heroRgb) {
  const baseBuf = await snapshotBase(biome, n, cfg);
  // passthrough slot: this slot IS the hero. No FAL call, no white balance
  // (it is the reference); it still goes through postProcess so its flop and
  // its diamond mask are produced by exactly the same code path as the others.
  if (Array.isArray(cfg.passthrough) && cfg.passthrough.includes(n)) {
    // The hero is copied BYTE FOR BYTE, deliberately bypassing postProcess.
    // Round-tripping it through the normal path would flatten it over the page
    // background first, and the diamond's antialiased rim pixels (partial alpha,
    // true content colour) would come back as content*a + background*(1-a) --
    // a darker rim that the re-mask then makes permanent. Measured cost of that
    // detour on this hero: its rim/interior frond delta drifts from -1.9pp to
    // -3.1pp, i.e. the one slot that was chosen FOR its evenness gets worse just
    // by being processed. The diamond alpha is exactly mirror symmetric, so the
    // flop can be applied to the RGBA directly with no mask rebuild at all.
    console.log(`  [passthrough] ${biome} slot${n} = hero, byte-for-byte (no FAL, no re-mask)`);
    const doFlop = Array.isArray(cfg.flop) && cfg.flop.includes(n);
    let out = sharp(baseBuf).ensureAlpha();
    if (doFlop) out = out.flop();
    const buf = await zeroTransparentRgb(await out.png().toBuffer());
    fs.writeFileSync(krawPath(biome, n), buf);
    fs.writeFileSync(kPath(biome, n), buf);
    if (doFlop) console.log(`  [flop] ${biome} slot${n} mirrored left<->right (RGBA, alpha symmetric)`);
    return buf;
  }
  const flat = cfg.rectFill
    ? await rectFill(baseBuf)
    : await sharp(baseBuf).flatten({ background: BG }).png().toBuffer();
  const seed = cfg.seeds[n] + (reroll ? 1000 * bump : 0);
  console.log(`  [kontext] ${biome} slot${n} seed ${seed}`);
  const r = await postJson('https://fal.run/fal-ai/flux-pro/kontext', {
    image_url: `data:image/png;base64,${flat.toString('base64')}`,
    prompt: cfg.prompt,
    num_images: 1,
    safety_tolerance: '5',
    seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error(`no kontext url for ${biome} slot${n}: ${JSON.stringify(r).slice(0, 200)}`);
  const raw = await download(url);
  fs.writeFileSync(krawPath(biome, n), raw);
  return postProcess(biome, n, raw, cfg, heroRgb);
}

// ----------------------------------------------------------------- SHEET -----
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const label = (t, w) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="22">` +
  `<text x="4" y="16" font-family="monospace" font-size="15" fill="#c9d1d9">${t}</text></svg>`
);
async function checkSheet(biome, cfg) {
  const PAD = 16, GAP = 12, LBL = 22, W = 380, H = 190;
  const bases = [], ks = [];
  for (let n = 0; n < 4; n++) {
    bases.push(fs.readFileSync(srcPath(biome, n)));
    ks.push(fs.readFileSync(kPath(biome, n)));
  }
  const rows = [
    { t: `BASE     ${cfg.baseLabel}`, b: bases },
    { t: `KONTEXT  assets/style-test/tiles/${biome}_kN.png  (pre-grade)`, b: ks },
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
  const p = path.join(ST, `_${biome}_kontext_check.png`);
  fs.writeFileSync(p, out);
  return p;
}

// ------------------------------------------------------------------- MAIN ----
(async () => {
  const args = process.argv.slice(2);
  const sheetOnly = args.includes('--sheet-only');
  // --bump=N shifts the re-roll seed offset (N*1000) so a second re-roll of the
  // same slot does not land on the seed the previous attempt already used.
  const bumpArg = args.find((a) => a.startsWith('--bump='));
  const bump = bumpArg ? Number(bumpArg.slice(7)) : 1;
  const reprocess = args.includes('--reprocess');
  const rest = args.filter((a) => !a.startsWith('--'));
  const biome = rest.shift();
  const rerolls = rest.map(Number);
  const cfg = CONFIG[biome];
  if (!cfg) {
    console.error(`usage: node scripts/tiles-water-kontext.cjs <${Object.keys(CONFIG).join('|')}> [slot...] [--reprocess] [--sheet-only]`);
    process.exit(1);
  }
  fs.mkdirSync(ST, { recursive: true });
  console.log(`=== ${biome} kontext  base: ${cfg.baseLabel}`);

  // single-hero shape: every derivation is white-balanced back onto the hero
  const heroRgb = cfg.matchHero ? await interiorRgb(cfg.base(0)) : null;
  if (heroRgb) console.log(`  [hero] interior RGB ${heroRgb.map((v) => v.toFixed(1)).join('/')}`);

  for (let n = 0; n < 4; n++) {
    const isPass = Array.isArray(cfg.passthrough) && cfg.passthrough.includes(n);
    if (sheetOnly) { await snapshotBase(biome, n, cfg); continue; }
    if (reprocess) {
      // a passthrough slot has no meaningful cached raw -- it is just the hero,
      // so it is rebuilt through runSlot (which makes no FAL call for it)
      if (isPass) { await runSlot(biome, n, cfg, false, bump, null); }
      else {
        if (!fs.existsSync(krawPath(biome, n))) throw new Error('no cached raw for --reprocess: ' + krawPath(biome, n));
        await snapshotBase(biome, n, cfg);
        await postProcess(biome, n, fs.readFileSync(krawPath(biome, n)), cfg, heroRgb);
      }
    } else if (rerolls.length && !rerolls.includes(n)) {
      await snapshotBase(biome, n, cfg);
      if (!fs.existsSync(kPath(biome, n))) throw new Error(`slot${n} not built yet, run without slot filter first`);
    } else {
      if (!FAL_API_KEY && !isPass) { console.error('No fal key (FAL_AI_API_KEY in scripts/.env)'); process.exit(1); }
      await runSlot(biome, n, cfg, rerolls.includes(n), bump, heroRgb);
    }
    const b = await canvasStats(fs.readFileSync(srcPath(biome, n)));
    const k = await canvasStats(fs.readFileSync(kPath(biome, n)));
    console.log(
      `  slot${n} base lum ${f1(b.lum)} dark/light ${f1(b.darkHalf)}/${f1(b.lightHalf)} spread ${f1(b.spread)}` +
      `  ->  kontext lum ${f1(k.lum)} dark/light ${f1(k.darkHalf)}/${f1(k.lightHalf)} spread ${f1(k.spread)}`
    );
  }
  const p = await checkSheet(biome, cfg);
  console.log(`[sheet] ${path.relative(ROOT, p)}`);
  console.log('kontext stage done -- review the sheet, then run scripts/tiles-water-grade.cjs ' + biome);
})();
