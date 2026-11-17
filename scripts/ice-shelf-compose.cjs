/**
 * ice_shelf DETERMINISTIC INWARD RE-LAYOUT (local only, NO fal.ai).
 *
 * WHY: two prompt rounds tried to make flux-pro/kontext place the floes away
 * from the diamond boundary -- v1 against the diamond, v2 against the picture
 * border on an unmasked base. Both came back at N = 0 px, i.e. floes cut clean
 * through the rim, the exact defect Rudi rejected. What kontext DOES follow is
 * the LAYOUT OF ITS INPUT: every output mirrored the edge-heavy distribution of
 * the frame it was handed. So the layout is built here, deterministically, and
 * kontext is afterwards only asked to re-blend it (stage 2 of the derive
 * script, prompt v3).
 *
 * HOW:
 *  1. detect the hero's floes (scripts/ice-shelf-mask.cjs) and cut each one out
 *     WITH a dilated halo, so the cut-out already carries the floe's own
 *     blue-grey submerged shelf and the ripples right around it. The library is
 *     cut from the UNMASKED hero frame (ice_shelf_1_kraw.png resized to
 *     512x256 -- exactly the geometry the mask is applied to), because five of
 *     the hero's seven floes are sliced by the diamond: in the masked tile their
 *     halo runs out into the transparent corners and the cut-out drags black
 *     wedges along with it, and the floe itself is only half there;
 *  1b. floes touching the frame border are dropped -- those really are
 *     incomplete and nothing can restore them;
 *  2. build a pure-water plate from src/assets/tiles/ocean/ocean_1.webp -- the
 *     very tile the hero was generated from, so it is the same water -- and pin
 *     its channel means onto the hero's WATER pixels (pointwise, hue+level);
 *  3. re-place the cut-out floes by seeded rejection sampling, subject to
 *     edgeDist >= MARGIN for every floe pixel and a minimum gap between floes,
 *     which makes N a guaranteed property of the tile instead of a hope;
 *  4. feather-composite (the alpha mask is blurred -- the IMAGE never is; no
 *     divide-by-blur anywhere, that is what burnt the toxic_marsh rim gold).
 *
 * ALL FOUR SLOTS ARE COMPOSED (round 7). Slot 1 used to ship the raw hero
 * frame untouched, but it was the worst tiler of the set: N = 0 px, 595 rim
 * pixels, 30% of its ice inside the 18 px rim band, five of seven floes tangent
 * to or sliced by the diamond. Re-composing it does not invent anything -- the
 * floe library IS the hero's own floes and the plate IS the hero's own water, so
 * slot 1 keeps Rudi's motif and only loses the severed-floe seams.
 * Slots 2/3 get the PLATE flopped
 * (water has no directional feature, so mirroring it is free de-repetition)
 * while the floes stay unflopped -- a floe carries a bright rim on its
 * upper-left side, and mirroring the floes would light them from upper right.
 *
 * Outputs (assets/style-test/tiles/):
 *   ice_shelf_comp<N>.png          composed 512x256 diamond tile -> kontext base
 *   _ice_shelf_compose_check.png   hero + floe library + the three layouts
 *
 * Usage:
 *   node scripts/ice-shelf-compose.cjs                 build all four slots
 *   node scripts/ice-shelf-compose.cjs 0 --margin=24   one slot, wider margin
 *   node scripts/ice-shelf-compose.cjs --bump=1        different seeded layouts
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const M = require('./ice-shelf-mask.cjs');

const { TILE_W, TILE_H, L709, edgeDist, insideBy } = M;
const ROOT = path.join(__dirname, '..');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
// The hero lives in its OWN file, not in ice_shelf_k1.png: slot 1 is composed
// like every other slot now (round 7 -- the raw hero had N = 0 px and 595 rim
// pixels, five of its seven floes tangent to or cut by the diamond, so every
// seam against a non-hero neighbour showed a severed floe). The derive stage
// writes its output to ice_shelf_k1.png, which would otherwise clobber the very
// frame the floe library and the tone reference are read from.
const HERO = path.join(ST, 'ice_shelf_hero_masked.png'); // masked hero: tone reference + sheet
const HERO_RECT = path.join(ST, 'ice_shelf_1_kraw.png'); // unmasked hero frame: floe library
const PLATE_SRC = path.join(TILES, 'ocean', 'ocean_1.webp');

// Layout rules. MARGIN is the promise the tile makes to its neighbours: no ice
// pixel closer than this to the diamond boundary. It is set above the value the
// kontext re-blend pass can plausibly smear an outline by (a few px), so the
// FINAL tile still clears the hard rule (>= 16 px).
const MARGIN = 24;
const GAP = 10;          // min clearance between two placed floes
const HALO = 14;         // dilation of the ice mask -> cut-out includes the shelf
const FEATHER = 5;       // blur radius of the composite alpha (mask only!)
const SLOTS = [
  { slot: 0, seed: 0x1f35, flopPlate: false },
  { slot: 1, seed: 0x4a83, flopPlate: false },
  { slot: 2, seed: 0x27a9, flopPlate: true },
  { slot: 3, seed: 0x3c17, flopPlate: true },
];

const DIAMOND_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + TILE_W + '" height="' + TILE_H + '">' +
  '<polygon points="' + (TILE_W / 2) + ',0 ' + TILE_W + ',' + (TILE_H / 2) + ' ' +
  (TILE_W / 2) + ',' + TILE_H + ' 0,' + (TILE_H / 2) + '" fill="white"/></svg>'
);

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rawOf = async (file) => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== TILE_W || info.height !== TILE_H)
    throw new Error(file + ' is ' + info.width + 'x' + info.height);
  return { data, ch: info.channels };
};
const toPng = (data) =>
  sharp(Buffer.from(data), { raw: { width: TILE_W, height: TILE_H, channels: 4 } }).png().toBuffer();

/**
 * Blur a binary mask into a 0..255 alpha ramp. Only the MASK is ever blurred --
 * the image never is (a divide-by-blur on a diamond-masked tile burns the rim
 * gold, the toxic_marsh failure).
 * sharp expands a 1-channel raw input to 3 channels on output, so the result is
 * de-interleaved back to one byte per pixel here; indexing the 3-channel buffer
 * as if it were 1-channel misaligns alpha against colour and paints black combs
 * across every floe.
 */
async function featherMask(mask, w, h, r) {
  const g = Buffer.alloc(w * h);
  for (let p = 0; p < w * h; p++) g[p] = mask[p] ? 255 : 0;
  const { data, info } = await sharp(g, { raw: { width: w, height: h, channels: 1 } })
    .blur(r).raw().toBuffer({ resolveWithObject: true });
  if (info.channels === 1) return data;
  const out = Buffer.alloc(w * h);
  for (let p = 0; p < w * h; p++) out[p] = data[p * info.channels];
  return out;
}

// --------------------------------------------------------------- FLOE CUTS ---
/**
 * One entry per floe: its own RGBA pixels, a feathered alpha, its bbox and the
 * ice-only sub-mask used for the edge-distance and collision tests.
 */
async function cutFloes(frame, ch) {
  const det = M.detectIce(frame, TILE_W, TILE_H, ch);
  // The hero frame is not full bleed: kontext drew the diamond itself and
  // surrounded it with near-black. The floes sit TANGENT to that boundary
  // (measured: 0-6% of any floe falls outside it, so they are complete), but a
  // 14 px halo around a tangent floe scoops the black surround up with it and
  // paints black slashes into the composite. Two filters remove it: geometry
  // (inside the diamond) and tone (anything far darker than the open water is
  // surround, not water).
  const grown = M.dilate(det.ice, TILE_W, TILE_H, HALO);
  const floor = 0.6 * det.waterLum;
  const halo = new Uint8Array(grown.length);
  for (let p = 0; p < grown.length; p++) {
    if (!grown[p]) continue;
    const x = p % TILE_W, y = (p - x) / TILE_W;
    if (Math.abs(x - 256) / 256 + Math.abs(y - 128) / 128 > 1) continue;
    if (!det.ice[p] && det.L[p] < floor) continue;
    halo[p] = 1;
  }
  const soft = await featherMask(halo, TILE_W, TILE_H, FEATHER);
  const { lab, sizes } = M.labelComponents(halo, TILE_W, TILE_H);
  const floes = [];
  const dropped = [];
  for (let id = 0; id < sizes.length; id++) {
    if (sizes[id] < 200) continue;
    let x0 = TILE_W, y0 = TILE_H, x1 = -1, y1 = -1;
    for (let p = 0; p < TILE_W * TILE_H; p++) {
      if (lab[p] !== id) continue;
      const x = p % TILE_W, y = (p - x) / TILE_W;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const rgba = Buffer.alloc(w * h * 4);
    const iceSub = new Uint8Array(w * h);
    let iceN = 0, borderTouch = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const gx = x + x0, gy = y + y0;
        const src = gy * TILE_W + gx, dst = (y * w + x) * 4;
        if (lab[src] !== id) continue;
        rgba[dst] = frame[src * ch]; rgba[dst + 1] = frame[src * ch + 1];
        rgba[dst + 2] = frame[src * ch + 2]; rgba[dst + 3] = soft[src];
        if (det.ice[src]) {
          iceSub[y * w + x] = 1; iceN++;
          if (gx <= 1 || gy <= 1 || gx >= TILE_W - 2 || gy >= TILE_H - 2) borderTouch = true;
        }
      }
    }
    if (borderTouch) { dropped.push(iceN); continue; }
    floes.push({ id, w, h, rgba, iceSub, iceN, halo: sizes[id] });
  }
  floes.sort((a, b) => b.iceN - a.iceN);
  return { floes, det, dropped };
}

// ------------------------------------------------------------------ PLATE ----
/**
 * Pure-water background pinned to the hero's WATER tone. Pointwise per-channel
 * gain onto the hero's non-ice interior means -- position independent, so the
 * diamond rim cannot be over-brightened.
 */
async function buildPlate(heroDet, hero, ch) {
  const { data, ch: pch } = await rawOf(PLATE_SRC);
  const hs = [0, 0, 0]; let hn = 0;
  for (let p = 0; p < TILE_W * TILE_H; p++) {
    if (heroDet.alpha[p] < 8 || heroDet.ice[p]) continue;
    hs[0] += hero[p * ch]; hs[1] += hero[p * ch + 1]; hs[2] += hero[p * ch + 2]; hn++;
  }
  const ps = [0, 0, 0]; let pn = 0;
  for (let p = 0; p < TILE_W * TILE_H; p++) {
    if (data[p * pch + 3] < 8) continue;
    ps[0] += data[p * pch]; ps[1] += data[p * pch + 1]; ps[2] += data[p * pch + 2]; pn++;
  }
  const g = [0, 1, 2].map((c) => (hs[c] / hn) / (ps[c] / pn));
  const out = Buffer.alloc(TILE_W * TILE_H * 4);
  for (let p = 0; p < TILE_W * TILE_H; p++) {
    for (let c = 0; c < 3; c++) {
      const v = Math.round(data[p * pch + c] * g[c]);
      out[p * 4 + c] = v > 255 ? 255 : v;
    }
    out[p * 4 + 3] = data[p * pch + 3];
  }
  console.log('[plate] ocean_1 -> hero water tone, gains R x' + g[0].toFixed(3) +
    ' G x' + g[1].toFixed(3) + ' B x' + g[2].toFixed(3) +
    '  (hero water RGB ' + (hs[0] / hn).toFixed(1) + ',' + (hs[1] / hn).toFixed(1) + ',' + (hs[2] / hn).toFixed(1) + ')');
  return out;
}

// ----------------------------------------------------------------- PLACING ---
/**
 * Seeded rejection sampling. A candidate offset is accepted only if EVERY ice
 * pixel of the floe sits at least MARGIN px inside the diamond and no ice pixel
 * lands within GAP of an already placed floe. That makes N a guarantee rather
 * than something we hope the model respected.
 */
function placeFloes(floes, rnd, margin) {
  const occupied = new Uint8Array(TILE_W * TILE_H);
  const placed = [];
  const skipped = [];
  for (const f of floes) {
    let done = false;
    for (let tries = 0; tries < 4000 && !done; tries++) {
      const ox = Math.floor(rnd() * (TILE_W - f.w));
      const oy = Math.floor(rnd() * (TILE_H - f.h));
      let ok = true;
      for (let y = 0; y < f.h && ok; y++) {
        for (let x = 0; x < f.w; x++) {
          if (!f.iceSub[y * f.w + x]) continue;
          const gx = ox + x, gy = oy + y;
          if (!insideBy(gx, gy, margin)) { ok = false; break; }
          if (occupied[gy * TILE_W + gx]) { ok = false; break; }
        }
      }
      if (!ok) continue;
      // reserve this floe's ice dilated by GAP so the next floe keeps clear
      const mine = new Uint8Array(TILE_W * TILE_H);
      for (let y = 0; y < f.h; y++) {
        for (let x = 0; x < f.w; x++) {
          if (f.iceSub[y * f.w + x]) mine[(oy + y) * TILE_W + (ox + x)] = 1;
        }
      }
      const grown = M.dilate(mine, TILE_W, TILE_H, GAP);
      for (let p = 0; p < occupied.length; p++) if (grown[p]) occupied[p] = 1;
      placed.push({ f, ox, oy });
      done = true;
    }
    if (!done) skipped.push(f);
  }
  return { placed, skipped };
}

/** alpha-over composite of the placed cut-outs onto the plate */
function compose(plate, placed) {
  const out = Buffer.from(plate);
  for (const { f, ox, oy } of placed) {
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const s = (y * f.w + x) * 4;
        const a = f.rgba[s + 3];
        if (!a) continue;
        const gx = ox + x, gy = oy + y;
        if (gx < 0 || gy < 0 || gx >= TILE_W || gy >= TILE_H) continue;
        const d = (gy * TILE_W + gx) * 4;
        const t = a / 255;
        for (let c = 0; c < 3; c++) out[d + c] = Math.round(out[d + c] * (1 - t) + f.rgba[s + c] * t);
      }
    }
  }
  return out;
}

async function reMask(buf) {
  const mask = await sharp(DIAMOND_SVG).greyscale().png().toBuffer();
  return sharp(Buffer.from(buf), { raw: { width: TILE_W, height: TILE_H, channels: 4 } })
    .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

// ------------------------------------------------------------------ SHEET -----
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const label = (t, w) => Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="22">' +
  '<text x="4" y="16" font-family="monospace" font-size="15" fill="#c9d1d9">' + t + '</text></svg>'
);
async function checkSheet(rows) {
  const PAD = 16, GAP2 = 12, LBL = 22, W = 420, H = 210;
  const comp = [];
  let y = PAD;
  for (const row of rows) {
    comp.push({ input: label(row.t, 4 * W + 3 * GAP2), left: PAD, top: y });
    y += LBL;
    for (let n = 0; n < row.b.length; n++) {
      comp.push({
        input: await sharp(row.b[n]).resize(W, H, { fit: 'fill' }).png().toBuffer(),
        left: PAD + n * (W + GAP2), top: y,
      });
    }
    y += H + GAP2 + 6;
  }
  const out = await sharp({
    create: { width: PAD * 2 + 4 * W + 3 * GAP2, height: y + PAD, channels: 4, background: BGA },
  }).composite(comp).png().toBuffer();
  const p = path.join(ST, '_ice_shelf_compose_check.png');
  fs.writeFileSync(p, out);
  return p;
}

// -------------------------------------------------------------------- MAIN ---
(async () => {
  const args = process.argv.slice(2);
  const num = (n, d) => { const a = args.find((x) => x.startsWith('--' + n + '=')); return a ? Number(a.slice(n.length + 3)) : d; };
  const margin = num('margin', MARGIN);
  const bump = num('bump', 0);
  const only = args.filter((a) => !a.startsWith('--')).map(Number);

  const { data: hero, ch } = await rawOf(HERO);
  // the floe library comes from the UNMASKED hero frame, resized to exactly the
  // geometry the diamond mask is applied to, so every floe is complete
  const frame = await sharp(HERO_RECT).resize(TILE_W, TILE_H, { fit: 'fill' })
    .ensureAlpha().raw().toBuffer();
  const { floes, det, dropped } = await cutFloes(frame, 4);
  const heroDet = M.detectIce(hero, TILE_W, TILE_H, ch);
  console.log('[hero] frame floes ' + floes.length +
    (dropped.length ? ' (dropped ' + dropped.length + ' touching the frame border: ' + dropped.join(',') + 'px)' : '') +
    '  masked-tile ice share ' + (heroDet.iceShare * 100).toFixed(1) +
    '%  water lum ' + heroDet.waterLum.toFixed(1) + '  ice lum ' + heroDet.iceLum.toFixed(1));
  console.log('       library sizes (ice px): ' + floes.map((f) => f.iceN).join(', '));
  const plateBase = await buildPlate(heroDet, hero, ch);

  const sheetRow = [];
  for (const s of SLOTS) {
    if (only.length && !only.includes(s.slot)) continue;
    let plate = plateBase;
    if (s.flopPlate) {
      const flopped = await sharp(Buffer.from(plateBase), { raw: { width: TILE_W, height: TILE_H, channels: 4 } })
        .flop().raw().toBuffer();
      plate = flopped;
    }
    const rnd = mulberry32(s.seed + bump * 7919);
    const { placed, skipped } = placeFloes(floes, rnd, margin);
    const buf = compose(plate, placed);
    const png = await reMask(buf);
    const p = path.join(ST, 'ice_shelf_comp' + s.slot + '.png');
    fs.writeFileSync(p, png);

    // verify the guarantee on the composed tile itself
    const mask = new Uint8Array(TILE_W * TILE_H);
    for (const { f, ox, oy } of placed) {
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
        if (f.iceSub[y * f.w + x]) mask[(oy + y) * TILE_W + (ox + x)] = 1;
      }
    }
    const es = M.edgeStats(mask, TILE_W, TILE_H);
    let iceN = 0;
    for (let p2 = 0; p2 < mask.length; p2++) if (mask[p2]) iceN++;
    console.log('[slot' + s.slot + '] placed ' + placed.length + '/' + floes.length +
      (skipped.length ? ' (skipped ' + skipped.map((f) => f.iceN + 'px').join(',') + ')' : '') +
      '  ice share ' + (iceN / (TILE_W * TILE_H / 2) * 100).toFixed(1) + '%' +
      '  layout N = ' + es.minD.toFixed(1) + ' px' + (s.flopPlate ? '  [plate flopped]' : ''));
    sheetRow.push(png);
  }

  const heroPng = await toPng((() => {
    const b = Buffer.alloc(TILE_W * TILE_H * 4);
    for (let p = 0; p < TILE_W * TILE_H; p++) for (let c = 0; c < 4; c++) b[p * 4 + c] = hero[p * ch + c];
    return b;
  })());
  const p = await checkSheet([
    { t: 'HERO  ice_shelf_hero_masked.png  (floe library + water tone source, no longer shipped as-is)', b: [heroPng] },
    { t: 'COMPOSED  ice_shelf_comp{0,1,2,3}.png  margin >= ' + margin + ' px  (kontext re-blend input)', b: sheetRow },
  ]);
  console.log('[sheet] ' + path.relative(ROOT, p));
  console.log('compose done -- next: node scripts/ice-shelf-hero-derive.cjs (prompt v4, composite base)');
})();
