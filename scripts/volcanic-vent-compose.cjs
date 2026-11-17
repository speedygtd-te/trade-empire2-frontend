/**
 * volcanic_vent = LOCAL COMPOSITE, NO fal.ai.
 *
 * WHY THIS TILE WAS REBUILT (2026-08-25). The 2026-06-27 volcanic_vent was
 * generated as the "hot cousin of lava_flow": a flat neon-orange lava crack net,
 * canvas luma 29-37. It is not a VOLCANIC biome. Docs/GAME_DESIGN_DOCUMENT.md
 * l.354 puts VOLCANIC_VENT on planet type OCEAN, and l.5403-5412 describes it as
 * "Heiss, sulfurisch, DUNKEL -- hydrothermale Schlote", environment UNDERWATER,
 * "schwarze Schornsteine". The shipped tile contradicted its own GDD entry and
 * dominated an otherwise muted ocean surface. (src/utils/biomeGroups.ts:62 files
 * it under the `volcanic` MUSIC group -- that is a mood grouping and says nothing
 * about the planet type; that is where the confusion came from.)
 *
 * THE RECIPE (Rudi's, three refinements folded in)
 *   ground        src/assets/tiles/obsidian_ridge/obsidian_ridge_N.webp
 *                 black glassy rock, canvas 11.9-19.6. obsidian_ridge lives on
 *                 VOLCANIC planets and volcanic_vent on OCEAN, so the two can
 *                 never meet and the recycling cannot read as a duplicate.
 *   chimneys      src/assets/props/charred_tree/charred_tree_4.webp  (upright)
 *                 src/assets/props/charred_tree/charred_tree_3.webp  (flush)
 *                 Already-shipped, already-approved prop sprites. _4 is a leaning
 *                 hollow broken stump with an open ragged mouth -- the silhouette
 *                 of a black smoker. _3 is a wide low ring with a hole through it
 *                 -- a ground-flush vent opening. Both are used: a field of only
 *                 identical chimneys reads as a stamp pattern, and the low rings
 *                 give the field a second scale that keeps it from looking like
 *                 rows of the same object.
 *                 SPRITES ARE FULLY DESATURATED before use (Rudi): both carry an
 *                 amber ember seam from the charred-tree art direction, and a
 *                 glow of any kind is out ("dunkel", and a real black smoker does
 *                 not glow -- the water quenches it instantly). Saturation 0
 *                 removes the seam completely while every brightness difference,
 *                 i.e. all of the bark / fibre / broken-rim / hollow structure,
 *                 survives. Contrast is NOT touched: pulling contrast to 0 would
 *                 erase the chimney as a shape.
 *   plumes        drawn here, procedurally (see PLUME below)
 *   water         src/assets/tiles/ocean/ocean_M.webp as a translucent sheet
 *                 laid OVER ground AND chimneys, so one water column tints both
 *                 and binds them into a single underwater image. Chimneys on top
 *                 of the water would read as pasted on.
 *   grade         scripts/tiles-water-grade.cjs volcanic_vent  (stage 2)
 *
 * WHY THE PLUMES ARE DRAWN AND NOT GENERATED
 * With the amber seam desaturated away the tile has no colour accent left, and
 * volcanic_vent would be dark AND colourless right next to deep_ocean (canvas
 * 15.8), which is also dark and colourless -- separation would rest on silhouette
 * alone. The plume is the only remaining carrier of the GDD's "sulfurisch". It is
 * also the feature that SURVIVES DOWNSCALING: at the @eighth mip (64x32) a 60 px
 * chimney is ~7 px and its rim detail is sub-pixel, whereas a broad soft haze is
 * still a haze. flux-pro/kontext was not used for it because kontext regenerates
 * the whole frame -- it would have deleted the very chimney layout this script
 * exists to guarantee. A rising smudge is a simple shape; drawing it keeps the
 * whole tile deterministic.
 * NO GLOW: the plume is turbulent fBm noise, drifting sideways, with a soft
 * ceiling on alpha and no radial falloff around the mouth. A radial falloff
 * centred on a vent is exactly what reads as light; a sheared noisy column reads
 * as particulate.
 *
 * TILEABILITY IS THE MAIN RISK OF THIS METHOD (it cost ice_shelf three rounds).
 * A chimney that crosses the diamond boundary ends mid-break on the neighbouring
 * tile. Same cure as scripts/ice-shelf-compose.cjs: seeded rejection sampling
 * with a hard perpendicular MARGIN to the diamond edge, verified afterwards by
 * measuring the minimum edge distance of every placed pixel. Plus:
 *   - the chimney mask must clear MARGIN px,
 *   - the plume mask must clear PLUME_MARGIN px,
 *   - and the plume alpha additionally gets a positional ramp to zero inside
 *     PLUME_GUARD px of the boundary. That ramp only ever DARKENS towards the rim
 *     and is applied to a soft MASK, never to the image -- it is not a
 *     divide-by-blur and cannot burn the rim (the toxic_marsh failure mode).
 *
 * HARD RULES (repo lessons)
 *  - Every colour operation is POINTWISE. No divide-by-blur, no 2D equalisation.
 *  - ALPHA IS NEVER COMPUTED, ONLY COPIED. The output alpha is the ground alpha
 *    byte for byte; nothing is ever composited where the ground alpha is 0.
 *  - Slots 2/3 are NOT re-flipped -- the flip already lives in obsidian_ridge.
 *  - The water slot is DECORRELATED from deep_ocean: slot n takes ocean_(n+2)%4,
 *    so volcanic_vent_0 and deep_ocean_0 do not share the same ripple field.
 *
 * Output: assets/style-test/tiles/volcanic_vent_cN.png  (-> grade stage)
 *         assets/style-test/tiles/_volcanic_vent_compose_check.png
 *
 * Usage:
 *   node scripts/volcanic-vent-compose.cjs
 *   node scripts/volcanic-vent-compose.cjs --no-plume --tag=noplume
 *   node scripts/volcanic-vent-compose.cjs --op=0.40 --plume-amp=0.7
 *   node scripts/volcanic-vent-compose.cjs --bump=1        # other seeded layouts
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const TILE_W = 512, TILE_H = 256;
const ROOT = path.join(__dirname, '..');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const PROPS = path.join(ROOT, 'src', 'assets', 'props');
const BIOME = 'volcanic_vent';

const S5 = Math.sqrt(5);
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
/** perpendicular distance to the nearest diamond edge (ice-shelf-mask.cjs) */
const edgeDist = (x, y) => Math.min(
  Math.abs(x + 2 * y - 256) / S5,
  Math.abs(x - 2 * y - 256) / S5,
  Math.abs(x - 2 * y + 256) / S5,
  Math.abs(x + 2 * y - 768) / S5
);
const inDiamond = (x, y) => Math.abs(x - 256) / 256 + Math.abs(y - 128) / 128 <= 1;
const insideBy = (x, y, d) => inDiamond(x, y) && edgeDist(x, y) >= d;

// ---------------------------------------------------------------- CONFIG ----
const CONFIG = {
  ground: { biome: 'obsidian_ridge', label: 'src/assets/tiles/obsidian_ridge/obsidian_ridge_N.webp' },
  // ocean_(n+2)%4 -- same water body as deep_ocean/reef, different ripple field
  water: { biome: 'ocean', slotOf: (n) => (n + 2) % 4, label: 'src/assets/tiles/ocean/ocean_((N+2)%4).webp' },

  // Water sheet. The shift is luma-neutral (it only rotates hue), matched to the
  // hue rotation deep_ocean uses on the same source, so the water column of the
  // two biomes is the same water. waterLum ~= ocean's own interior level, i.e.
  // the sheet is essentially ungraded: the final level is owned by stage 2.
  shift: { r: 0.86, g: 1.00, b: 1.05 },
  waterLum: 46.0,
  // 0.45: heavy enough that the blue-green column damps the chimneys and the
  // plumes into the same underwater image (0.30 left them sitting on top),
  // light enough that the obsidian structure -- the whole reason this biome is
  // not deep_ocean -- survives (0.65, shallow_water's value, swallowed it).
  op: 0.45,

  // "relativ klein" (Rudi). Heights are in 512x256 TILE space; the game draws a
  // tile at TW = 48, so 512 px of tile = 48 world px, i.e. divide by 10.67 for
  // the world size. A 60 px chimney is 5.6 world px against PROP_BASE_HEIGHT 28
  // -- deliberately far below the fumarole hero prop, because this is ground
  // texture, not a prop. At the @eighth mip it is still ~7 px of 32.
  //
  // ROUND 2 CORRECTIONS on the chimney sprites, both from looking at the first
  // contact sheet rather than at the numbers:
  //   rotate -14  charred_tree_4 leans about 30 degrees out of vertical. At prop
  //     size that reads as a broken stump; shrunk to 60 px in a tile it reads as
  //     a FALLEN LOG lying on the rock, not as something rising out of it. A 14
  //     degree counter-rotation (mirrored with the flop, so the lean stays a
  //     lean and the light keeps its side) brings it to a plausible smoker tilt
  //     without redrawing anything. The sprite is re-trimmed to its alpha bbox
  //     afterwards so the rotation costs no size.
  //   gain 0.80   the desaturated stump means 35 against an obsidian ground whose
  //     median is 25, so it came out as a PALE stick on black rock -- the exact
  //     opposite of "schwarze Schornsteine". One pointwise gain puts it back at
  //     ground level and leaves the form to the silhouette, the hollow mouth and
  //     the contact shadow. Not lower than 0.80: below that the chimney merges
  //     into the rock and the structure that has to separate this biome from
  //     deep_ocean at play scale goes with it.
  // DENSITY -- Rudi's call, 2026-08-25. Round 5 shipped count [2,3] + [2,3], i.e.
  // 4-6 vents per tile. On a single tile that reads fine, but the interlocked
  // mosaic showed it at the upper edge of "nicht ueberfuellt", so both options
  // were built and compared (both mosaics kept in _water_attempts/ as
  // volcanic_vent_mosaic_DENSITY-*). Rudi picked the sparser one: 2-4 per tile.
  // WHAT THAT COSTS, measured, because it touches the one thing this biome had to
  // win: essentially nothing. The @eighth micro-contrast against deep_ocean went
  // 5.51 -> 5.42 (deep_ocean 2.72), i.e. x2.02 -> x1.99. The reason it barely
  // moved is that the play-scale signal is carried by the GROUND (obsidian rubble
  // at groundContrast 0.62) plus the broad plumes, not by the vent count -- the
  // chimneys are only ~7 px at 64x32. So the density wish and the
  // distinguishability do not collide. Going below this is untested: re-measure
  // with scripts/tiles-pair-check.cjs volcanic_vent deep_ocean before shipping a
  // sparser set, and treat a ratio under about x1.5 as a conflict to escalate.
  vents: [
    {
      key: 'charred_tree_4', file: path.join(PROPS, 'charred_tree', 'charred_tree_4.webp'),
      kind: 'upright', h: [56, 88], count: [1, 2], plume: true, plumeScale: 1.0,
      rotate: -14, gain: 0.80,
    },
    {
      key: 'charred_tree_3', file: path.join(PROPS, 'charred_tree', 'charred_tree_3.webp'),
      kind: 'flush', h: [30, 58], count: [1, 2], plume: true, plumeScale: 0.55,
      rotate: 0, gain: 0.84,
    },
  ],
  // ASPECT JITTER. The whole field is built from TWO sprites, so with a plain
  // flop there are only four distinct silhouettes and the interlocked mosaic
  // showed them as recognisable repeats. A +-9% width squash per instance is the
  // cheapest way to break that recognition -- it changes the outline without
  // touching the sprite's own light direction, which a rotation would.
  aspectJitter: 0.09,

  // GROUND CONTRAST -- pointwise, mean preserving, applied to obsidian_ridge
  // BEFORE anything is stamped on it. Round 3 shipped the ground untouched and
  // the vent field vanished into it: obsidian_ridge is a carpet of large angular
  // chips at interior sd 22-34, which is more mid-frequency contrast than the
  // chimneys themselves carry, so the eye read rubble with some sticks in it.
  // Pulling k to 0.62 turns the chips into dark sediment and hands the tile's
  // structure budget to the vents, which is where this biome's identity lives.
  // It also fits the GDD ("dunkel", fine hydrothermal sediment) and it does NOT
  // cost the separation from deep_ocean: the ground still measures sd ~17
  // against deep_ocean's 9, and the vents add far more on top.
  groundContrast: 0.62,
  // GROUND HIGHLIGHT ROLLOFF. obsidian_ridge is glassy: its brightest chips run
  // to luma 232 and survive the contrast pull as hard white specks. On a dark
  // teal underwater field those specks read as SNOW or salt grains, not as wet
  // rock. Same pointwise soft clip as the sprites, one knee higher so the broad
  // facets keep their sheen and only the speculars come down.
  groundKnee: 105, groundKneeK: 0.42,
  desatSprites: 0.0,      // Rudi: saturation 0 kills the amber ember seam
  // HIGHLIGHT ROLLOFF -- pointwise soft clip on the sprite. Desaturating the
  // amber seam removes the COLOUR of the ember but not its BRIGHTNESS: the
  // broken rim of charred_tree_4 peaks at luma 210, which on a tile whose mean
  // is 38 reads as a lit edge, i.e. glow arriving by another route. The knee
  // compresses only what is above it, so the rim survives as a lighter edge
  // while the chimney body (mean 35, far below the knee) is untouched.
  spriteKnee: 85, spriteKneeK: 0.28,
  spriteGainJitter: 0.14, // +-14% pointwise level jitter so copies are not clones
  // CONTACT SHADOW. Round 4 ran op 0.55 / rx 0.50 x footW / blur 7 and the seam
  // sheet showed it for what it was: a dark DISC around every vent, wider than
  // the object and clearly circular, which on an interlocked field reads as a
  // repeated stain rather than as contact. Halved and pulled in tight to the
  // foot -- its only job is to stop the sprite looking pasted on.
  shadow: { op: 0.30, rx: 0.34, ry: 0.22, blur: 6 },

  margin: 18,        // chimney pixels: min perpendicular distance to the diamond
  plumeMargin: 13,   // plume pixels (alpha >= 25) in the placement test
  plumeGuard: 11,    // hard positional ramp: no plume alpha at all inside this
  gap: 6,            // min clearance between two placed vents

  // PLUME -- round 2. Round 1 (w0 0.30 / grow 1.55 / maxA 0.30 / rgb 188,178,142)
  // was rejected on sight: a narrow cone opening out of a point, bright core,
  // smooth falloff -- a torch beam, i.e. exactly the glow the brief forbids.
  // Three changes fix it, in order of importance:
  //   1. COLUMN, NOT CONE. w0 up and grow down, so the haze leaves the mouth
  //      already at width and only widens a little. A cone apex sitting on a
  //      vent is what the eye reads as a light source.
  //   2. NOISE OWNS THE SHAPE. The smooth gaussian profile is now only an
  //      envelope; density is a thresholded fBm raised to a power, so the plume
  //      breaks into separate wisps with holes instead of being a solid body
  //      with a soft edge.
  //   3. DIM. maxA 0.30 -> 0.15 and the colour roughly halved. Sulfur haze in
  //      cold deep water is a turbid smudge slightly lighter than the ground.
  plume: {
    hFactor: 0.95,   // plume height as a share of the chimney height
    w0: 0.46,        // base half-width as a share of the chimney width
    grow: 0.85,      // half-width growth from mouth to top
    drift: 0.30,     // sideways shear at the top, in plume heights
    amp: 0.70,
    maxA: 0.20,      // ceiling: a soft haze, never a bright core
    rgbLo: [188, 150, 74],   // muted sulfur yellow-white at the mouth
    rgbHi: [128, 122, 96],   // cooling to grey as it disperses
    freq: 0.075, yStretch: 0.35,
    nGain: 1.35, nBias: 0.28, nPow: 1.15,
  },

  seeds: [0x5E17, 0x2C9B, 0x7A34, 0x14F6],
};

const DIAMOND_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}">` +
  `<polygon points="${TILE_W / 2},0 ${TILE_W},${TILE_H / 2} ${TILE_W / 2},${TILE_H} 0,${TILE_H / 2}" fill="white"/></svg>`
);

// ------------------------------------------------------------------ RNG ------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- METRICS ----
function statsOf(data, ch) {
  const N = data.length / ch;
  const cs = [0, 0, 0], is = [0, 0, 0], iq = [0, 0, 0], tr = [0, 0, 0];
  let ni = 0, nt = 0;
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    cs[0] += r; cs[1] += g; cs[2] += b;
    if (a >= 8) {
      is[0] += r; is[1] += g; is[2] += b;
      iq[0] += r * r; iq[1] += g * g; iq[2] += b * b; ni++;
    } else { tr[0] += r; tr[1] += g; tr[2] += b; nt++; }
  }
  const cm = cs.map((s) => s / N), im = is.map((s) => s / ni);
  const isd = iq.map((q, k) => Math.sqrt(Math.max(0, q / ni - im[k] * im[k])));
  return {
    inner: { rgb: im, lum: L709(im[0], im[1], im[2]), sd: (isd[0] + isd[1] + isd[2]) / 3, n: ni },
    canvas: { rgb: cm, lum: L709(cm[0], cm[1], cm[2]) },
    corner: { n: nt, lum: nt ? L709(tr[0] / nt, tr[1] / nt, tr[2] / nt) : 0 },
  };
}

// ------------------------------------------------------------- POINTWISE -----
/** pointwise per-channel gain; alpha copied verbatim */
function gain(src, ch, g) {
  const out = Buffer.from(src);
  for (let i = 0; i < out.length; i += ch) {
    if (out[i + 3] < 1) continue;
    for (let c = 0; c < 3; c++) {
      const v = out[i + c] * g[c];
      out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return out;
}
/** pointwise saturation pull towards Rec709 luma; alpha copied verbatim */
function desaturate(src, ch, d) {
  const out = Buffer.from(src);
  for (let i = 0; i < out.length; i += ch) {
    if (out[i + 3] < 1) continue;
    const L = L709(out[i], out[i + 1], out[i + 2]);
    for (let c = 0; c < 3; c++) {
      const v = L + d * (out[i + c] - L);
      out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return out;
}
/**
 * Pointwise highlight soft clip: values above `knee` are compressed by `k`.
 * Position independent and monotone, so it can never brighten a pixel and can
 * never treat the diamond rim differently from the interior.
 */
function softClip(src, ch, knee, k) {
  const out = Buffer.from(src);
  for (let i = 0; i < out.length; i += ch) {
    if (out[i + 3] < 1) continue;
    for (let c = 0; c < 3; c++) {
      const v = out[i + c];
      if (v > knee) out[i + c] = Math.round(knee + (v - knee) * k);
    }
  }
  return out;
}

/**
 * Pointwise contrast around the INTERIOR channel means, so the means are
 * preserved and this cannot fight a later level solve. Position independent.
 */
function contrast(src, ch, k) {
  if (k === 1) return Buffer.from(src);
  const out = Buffer.from(src);
  const s = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < out.length; i += ch) {
    if (out[i + 3] < 8) continue;
    s[0] += out[i]; s[1] += out[i + 1]; s[2] += out[i + 2]; n++;
  }
  const m = s.map((v) => v / n);
  for (let i = 0; i < out.length; i += ch) {
    if (out[i + 3] < 1) continue;
    for (let c = 0; c < 3; c++) {
      const v = m[c] + k * (out[i + c] - m[c]);
      out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return out;
}

/** luma-neutral channel shift: rotates hue, cannot change brightness */
function hueShift(src, ch, s) {
  const w = 0.2126 * s.r + 0.7152 * s.g + 0.0722 * s.b;
  return gain(src, ch, [s.r / w, s.g / w, s.b / w]);
}
/** bisect a scalar multiplier on `base` until the interior luma hits target */
function solve(src, ch, base, target) {
  let lo = 0.05, hi = 8.0;
  for (let it = 0; it < 28; it++) {
    const mid = (lo + hi) / 2;
    const v = statsOf(gain(src, ch, base.map((b) => b * mid)), ch).inner.lum;
    if (v > target) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
/** water sheet: hue-shifted ocean lifted to `target` interior luma */
function waterSheet(src, ch, shift, target) {
  const w = 0.2126 * shift.r + 0.7152 * shift.g + 0.0722 * shift.b;
  const base = [shift.r / w, shift.g / w, shift.b / w];
  const G = solve(src, ch, base, target);
  return { buf: gain(src, ch, base.map((b) => b * G)), G };
}
/** out = ground*(1-op) + water*op. ALPHA and all transparent px copied from ground. */
function blendWater(ground, water, ch, op) {
  const out = Buffer.from(ground);
  for (let i = 0; i < out.length; i += ch) {
    if (out[i + 3] < 1) continue;
    for (let c = 0; c < 3; c++) {
      const v = ground[i + c] * (1 - op) + water[i + c] * op;
      out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return out;
}

// ------------------------------------------------------------------ NOISE ----
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const h = (ix, iy) => {
    let n = Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(seed, 83492791);
    n = (n << 13) ^ n;
    return ((Math.imul(n, Math.imul(n, Math.imul(n, 15731)) + 789221) + 1376312589) & 0x7fffffff) / 2147483647;
  };
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x, y, seed) {
  let v = 0, amp = 0.5, f = 1;
  for (let o = 0; o < 4; o++) { v += amp * vnoise(x * f, y * f, seed + o * 7919); f *= 2.07; amp *= 0.5; }
  return v / 0.9375;
}

// ------------------------------------------------------------------ STAMP -----
/**
 * One placeable object: chimney sprite (desaturated, level-jittered, optionally
 * flopped) with its plume drawn ABOVE the mouth and BEHIND the sprite, so the
 * broken rim occludes the plume base instead of the haze floating in front of it.
 */
/**
 * Rotate (flop-mirrored so the lean stays a lean), re-trim to the alpha bbox,
 * cached per spec+flop. Rotating once at native resolution and only then
 * resizing keeps the resampling to a single step.
 */
const PREP = new Map();
async function prepSprite(spec, flop) {
  const key = `${spec.key}|${flop}`;
  if (PREP.has(key)) return PREP.get(key);
  let pipe = sharp(spec.file).ensureAlpha();
  if (flop) pipe = pipe.flop();
  if (spec.rotate) {
    pipe = sharp(await pipe.png().toBuffer())
      .rotate(flop ? -spec.rotate : spec.rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .trim({ threshold: 1 });
  }
  const buf = await pipe.png().toBuffer();
  const m = await sharp(buf).metadata();
  const v = { buf, aspect: m.width / m.height };
  PREP.set(key, v);
  return v;
}

async function buildStamp(spec, h, flop, rnd, pcfg, wantPlume) {
  const prep = await prepSprite(spec, flop);
  const aj = 1 + (rnd() * 2 - 1) * CONFIG.aspectJitter;
  const sw = Math.max(8, Math.round(h * prep.aspect * aj)), sh = Math.round(h);

  const { data: sd0, info } = await sharp(prep.buf).resize(sw, sh, { fit: 'fill' })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const sch = info.channels;
  let sd = desaturate(sd0, sch, CONFIG.desatSprites);
  sd = softClip(sd, sch, CONFIG.spriteKnee, CONFIG.spriteKneeK);
  const jit = (spec.gain !== undefined ? spec.gain : 1) *
    (1 + (rnd() * 2 - 1) * CONFIG.spriteGainJitter);
  sd = gain(sd, sch, [jit, jit, jit]);

  // mouth = centroid of the opaque pixels in the top 14% of the sprite
  let mx = sw / 2, my = 0, mn = 0, msum = 0;
  const band = Math.max(2, Math.round(sh * 0.14));
  for (let y = 0; y < band; y++) {
    for (let x = 0; x < sw; x++) {
      if (sd[(y * sw + x) * sch + 3] < 40) continue;
      msum += x; mn++; my = y;
    }
  }
  if (mn) mx = msum / mn;
  my = Math.min(sh - 1, my + 1);

  // plumeScale < 1: the flush rings get a low, short wisp rather than a column.
  // They are openings in the sea floor, not chimneys, so the discharge spreads
  // sideways instead of rising -- and it keeps the tile's activity spread over
  // the whole field instead of concentrating it on two or three tall objects.
  const pscale = spec.plumeScale === undefined ? 1 : spec.plumeScale;
  const ph = wantPlume && spec.plume ? Math.round(sh * pcfg.hFactor * pscale) : 0;
  const halfMax = ph ? pcfg.w0 * sw * (0.55 + pcfg.grow) : 0;
  const driftDir = rnd() < 0.5 ? -1 : 1;
  const driftPx = ph ? driftDir * pcfg.drift * ph : 0;
  const padL = Math.ceil(Math.max(0, halfMax - mx + Math.max(0, -driftPx)));
  const padR = Math.ceil(Math.max(0, mx + halfMax + Math.max(0, driftPx) - sw));
  const W = sw + padL + padR, H = sh + ph;
  const out = Buffer.alloc(W * H * 4);

  // ---- plume (drawn first, i.e. behind the sprite) ----
  if (ph) {
    const nseed = Math.floor(rnd() * 1e6);
    const baseY = ph + my, cx0 = mx + padL;
    for (let y = 0; y < baseY; y++) {
      const v = (baseY - y) / ph;
      if (v > 1) continue;
      const halfW = pcfg.w0 * sw * (0.55 + pcfg.grow * v);
      const cx = cx0 + driftPx * v * v;
      const fIn = Math.min(1, v / 0.06);
      const fOut = Math.pow(1 - v, 1.10);
      for (let x = 0; x < W; x++) {
        const u = (x - cx) / halfW;
        if (u < -2.2 || u > 2.2) continue;
        const shape = Math.exp(-1.5 * u * u) * fIn * fOut;
        if (shape < 0.01) continue;
        const n0 = fbm(x * pcfg.freq, y * pcfg.freq * pcfg.yStretch, nseed);
        const n = Math.pow(Math.max(0, n0 * pcfg.nGain - pcfg.nBias), pcfg.nPow);
        let a = shape * n * pcfg.amp * 2.2;
        if (a > pcfg.maxA) a = pcfg.maxA;
        if (a <= 0.004) continue;
        const t = Math.min(1, v * 1.15);
        const d = (y * W + x) * 4;
        for (let c = 0; c < 3; c++) out[d + c] = Math.round(pcfg.rgbLo[c] * (1 - t) + pcfg.rgbHi[c] * t);
        out[d + 3] = Math.round(a * 255);
      }
    }
  }

  // ---- sprite over it ----
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const s = (y * sw + x) * sch, a = sd[s + 3];
      if (!a) continue;
      const d = ((y + ph) * W + (x + padL)) * 4;
      const t = a / 255, bt = out[d + 3] / 255;
      const oa = t + bt * (1 - t);
      for (let c = 0; c < 3; c++) {
        out[d + c] = Math.round((sd[s + c] * t + out[d + c] * bt * (1 - t)) / (oa || 1));
      }
      out[d + 3] = Math.round(oa * 255);
    }
  }

  // masks for the placement test
  const hard = new Uint8Array(W * H), soft = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const a = out[p * 4 + 3];
    if (a >= 8 && p >= ph * W) hard[p] = 1;   // sprite region
    if (a >= 25) soft[p] = 1;                  // sprite + dense plume
  }
  return {
    key: spec.key, kind: spec.kind, W, H, sw, sh, ph, rgba: out, hard, soft, flop,
    footY: sh + ph - 1, footX: padL + sw / 2, footW: sw,
  };
}

// ---------------------------------------------------------------- PLACING ----
/**
 * Seeded rejection sampling. Accepted only if EVERY chimney pixel clears
 * cfg.margin, every dense plume pixel clears cfg.plumeMargin, and no chimney
 * pixel lands within cfg.gap of an already placed one. That makes the tiling
 * guarantee a property of the tile, not a hope.
 */
function place(stamps, rnd, cfg) {
  const occupied = new Uint8Array(TILE_W * TILE_H);
  const placed = [], skipped = [];
  for (const s of stamps) {
    let done = false;
    for (let tries = 0; tries < 6000 && !done; tries++) {
      const ox = Math.floor(rnd() * (TILE_W - s.W));
      const oy = Math.floor(rnd() * (TILE_H - s.H));
      let ok = true;
      for (let y = 0; y < s.H && ok; y++) {
        for (let x = 0; x < s.W; x++) {
          const p = y * s.W + x;
          if (!s.soft[p] && !s.hard[p]) continue;
          const gx = ox + x, gy = oy + y;
          const need = s.hard[p] ? cfg.margin : cfg.plumeMargin;
          if (!insideBy(gx, gy, need)) { ok = false; break; }
          if (s.hard[p] && occupied[gy * TILE_W + gx]) { ok = false; break; }
        }
      }
      if (!ok) continue;
      for (let y = 0; y < s.H; y++) {
        for (let x = 0; x < s.W; x++) {
          if (!s.hard[y * s.W + x]) continue;
          for (let dy = -cfg.gap; dy <= cfg.gap; dy++) {
            for (let dx = -cfg.gap; dx <= cfg.gap; dx++) {
              const gx = ox + x + dx, gy = oy + y + dy;
              if (gx < 0 || gy < 0 || gx >= TILE_W || gy >= TILE_H) continue;
              occupied[gy * TILE_W + gx] = 1;
            }
          }
        }
      }
      placed.push({ s, ox, oy });
      done = true;
    }
    if (!done) skipped.push(s);
  }
  return { placed, skipped };
}

// -------------------------------------------------------------- COMPOSITE ----
/** soft elliptical contact shadow so the chimney sits IN the ground, not ON it */
async function shadowLayer(placed, cfg) {
  const ell = placed.map(({ s, ox, oy }) => {
    const rx = Math.round(s.footW * cfg.rx), ry = Math.max(3, Math.round(s.footW * cfg.ry));
    const cx = Math.round(ox + s.footX + rx * 0.10), cy = Math.round(oy + s.footY - ry * 0.25);
    return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="white"/>`;
  }).join('');
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}">${ell}</svg>`
  );
  const { data, info } = await sharp(svg).blur(cfg.blur).greyscale().raw().toBuffer({ resolveWithObject: true });
  const m = Buffer.alloc(TILE_W * TILE_H);
  for (let p = 0; p < m.length; p++) m[p] = data[p * info.channels];
  return m;
}

/**
 * Chimneys + plumes onto the ground.
 *  - nothing is written where the GROUND alpha is 0 (the diamond corners),
 *  - the ground alpha byte is never read as anything but a gate and never written,
 *  - the plume alpha additionally gets a positional ramp to 0 inside plumeGuard
 *    px of the diamond boundary. Applied to the soft MASK only and monotone
 *    downwards, so it can only ever remove plume, never brighten the rim.
 */
function stampOnto(ground, ch, placed, shadow, cfg) {
  const out = Buffer.from(ground);
  // contact shadow first (multiply, pointwise, gated on ground alpha)
  for (let p = 0; p < TILE_W * TILE_H; p++) {
    const i = p * ch;
    if (out[i + 3] < 1 || !shadow[p]) continue;
    const t = (shadow[p] / 255) * cfg.shadow.op;
    for (let c = 0; c < 3; c++) out[i + c] = Math.round(out[i + c] * (1 - t));
  }
  let guarded = 0;
  const plumeMask = new Uint8Array(TILE_W * TILE_H);
  for (const { s, ox, oy } of placed) {
    for (let y = 0; y < s.H; y++) {
      for (let x = 0; x < s.W; x++) {
        const sp = (y * s.W + x) * 4;
        let a = s.rgba[sp + 3];
        if (!a) continue;
        const gx = ox + x, gy = oy + y;
        if (gx < 0 || gy < 0 || gx >= TILE_W || gy >= TILE_H) continue;
        const d = (gy * TILE_W + gx) * ch;
        if (out[d + 3] < 1) continue;          // never touch the transparent corners
        const isPlume = !s.hard[y * s.W + x];
        if (isPlume) {
          const e = edgeDist(gx, gy);
          const k = Math.max(0, Math.min(1, (e - cfg.plumeGuard) / 10));
          if (k < 1) guarded++;
          a = a * k;
          if (a < 1) continue;
          if (a > plumeMask[gy * TILE_W + gx]) plumeMask[gy * TILE_W + gx] = a;
        }
        const t = a / 255;
        for (let c = 0; c < 3; c++) out[d + c] = Math.round(out[d + c] * (1 - t) + s.rgba[sp + c] * t);
      }
    }
  }
  return { buf: out, guarded, plumeMask };
}

// ---------------------------------------------------------------- HELPERS ----
async function rawOf(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== TILE_W || info.height !== TILE_H)
    throw new Error(`${file} is ${info.width}x${info.height}, expected ${TILE_W}x${TILE_H}`);
  return { data, ch: info.channels };
}
const toPng = (data, ch) =>
  sharp(data, { raw: { width: TILE_W, height: TILE_H, channels: ch } }).png().toBuffer();
const f1 = (x) => x.toFixed(1);
const f2 = (x) => x.toFixed(2);
const rgbS = (v) => `rgb(${f1(v[0])},${f1(v[1])},${f1(v[2])})`;

// ------------------------------------------------------------------ SHEET -----
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const label = (t, w) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="22">` +
  `<text x="4" y="16" font-family="monospace" font-size="15" fill="#c9d1d9">${t}</text></svg>`
);
async function rowsSheet(rows, file, W = 380, H = 190) {
  const PAD = 16, GAP = 12, LBL = 22;
  const cols = Math.max(...rows.map((r) => r.b.length));
  const comp = [];
  let y = PAD;
  for (const row of rows) {
    comp.push({ input: label(row.t, cols * W + (cols - 1) * GAP), left: PAD, top: y });
    y += LBL;
    for (let n = 0; n < row.b.length; n++) {
      comp.push({
        input: await sharp(row.b[n]).resize(W, H, { fit: 'fill' }).png().toBuffer(),
        left: PAD + n * (W + GAP), top: y,
      });
    }
    y += H + GAP + 6;
  }
  const out = await sharp({
    create: { width: PAD * 2 + cols * W + (cols - 1) * GAP, height: y + PAD, channels: 4, background: BGA },
  }).composite(comp).png().toBuffer();
  const p = path.join(ST, file);
  fs.writeFileSync(p, out);
  return p;
}

// -------------------------------------------------------------------- RUN -----
(async () => {
  const args = process.argv.slice(2);
  const arg = (n) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
  const cfg = JSON.parse(JSON.stringify(CONFIG, (k, v) => (typeof v === 'function' ? undefined : v)));
  cfg.water.slotOf = CONFIG.water.slotOf;
  cfg.vents = CONFIG.vents;
  if (arg('op') !== null) cfg.op = Number(arg('op'));
  if (arg('water-lum') !== null) cfg.waterLum = Number(arg('water-lum'));
  if (arg('plume-amp') !== null) cfg.plume.amp = Number(arg('plume-amp'));
  if (arg('plume-maxa') !== null) cfg.plume.maxA = Number(arg('plume-maxa'));
  if (arg('margin') !== null) cfg.margin = Number(arg('margin'));
  // --counts=uMin,uMax,fMin,fMax -- the density knob. The shipped set is
  // 2..3 uprights + 2..3 flush rings, i.e. 4-6 vents per tile. See the
  // DENSITY comparison sheet in _water_attempts/ for the sparser option.
  if (arg('counts') !== null) {
    const c = arg('counts').split(',').map(Number);
    cfg.vents[0].count = [c[0], c[1]];
    cfg.vents[1].count = [c[2], c[3]];
  }
  if (arg('shift') !== null) { const [r, g, b] = arg('shift').split(',').map(Number); cfg.shift = { r, g, b }; }
  const wantPlume = !args.includes('--no-plume');
  const bump = Number(arg('bump') || 0);
  const tag = arg('tag') ? `_${arg('tag')}` : '';

  console.log(`\n=== ${BIOME}  =  ${cfg.ground.label}  +  chimney props  +  ${cfg.water.label}`);
  console.log(`    op ${cfg.op}  waterLum ${cfg.waterLum}  shift R${cfg.shift.r} G${cfg.shift.g} B${cfg.shift.b}` +
    `  desatSprites ${cfg.desatSprites}  plume ${wantPlume ? `amp ${cfg.plume.amp} maxA ${cfg.plume.maxA}` : 'OFF'}` +
    `  margin ${cfg.margin}/${cfg.plumeMargin} guard ${cfg.plumeGuard}`);

  fs.mkdirSync(ST, { recursive: true });
  const OUT = [], GR = [], DRY = [], reports = [];

  for (let n = 0; n < 4; n++) {
    const gf = path.join(TILES, cfg.ground.biome, `${cfg.ground.biome}_${n}.webp`);
    const { data: gd0, ch } = await rawOf(gf);
    const gd = softClip(contrast(gd0, ch, cfg.groundContrast), ch, cfg.groundKnee, cfg.groundKneeK);
    const gst = statsOf(gd, ch);
    const rnd = mulberry32(cfg.seeds[n] + bump * 7919);

    // build the stamp list for this slot
    const stamps = [];
    for (const spec of cfg.vents) {
      const [c0, c1] = spec.count;
      const k = c0 + Math.floor(rnd() * (c1 - c0 + 1));
      for (let i = 0; i < k; i++) {
        const h = spec.h[0] + rnd() * (spec.h[1] - spec.h[0]);
        stamps.push(await buildStamp(spec, h, rnd() < 0.5, rnd, cfg.plume, wantPlume));
      }
    }
    // biggest first: the hard ones get the free space
    stamps.sort((a, b) => b.W * b.H - a.W * a.H);

    const { placed, skipped } = place(stamps, rnd, cfg);
    const shadow = await shadowLayer(placed, cfg.shadow);
    const { buf: dry, guarded, plumeMask } = stampOnto(gd, ch, placed, shadow, cfg);

    // tiling guarantee, measured on the composed tile
    let minChim = Infinity, minPlume = Infinity, chimPx = 0, plumePx = 0;
    for (const { s, ox, oy } of placed) {
      for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) {
        const p = y * s.W + x;
        const a = s.rgba[p * 4 + 3];
        if (!a) continue;
        const e = edgeDist(ox + x, oy + y);
        if (s.hard[p]) { chimPx++; if (e < minChim) minChim = e; }
        else if (a >= 25) {
          const k = Math.max(0, Math.min(1, (e - cfg.plumeGuard) / 10));
          if (a * k >= 25) { plumePx++; if (e < minPlume) minPlume = e; }
        }
      }
    }

    // water sheet over everything
    const wSlot = cfg.water.slotOf(n);
    const { data: wd } = await rawOf(path.join(TILES, cfg.water.biome, `${cfg.water.biome}_${wSlot}.webp`));
    const sheetR = waterSheet(wd, ch, cfg.shift, cfg.waterLum);
    const out = blendWater(dry, sheetR.buf, ch, cfg.op);
    const ost = statsOf(out, ch), dst = statsOf(dry, ch);

    // alpha integrity vs the ground, byte for byte
    let aDiff = 0;
    for (let i = 0; i < gd.length; i += ch) if (gd[i + 3] !== out[i + 3]) aDiff++;

    // hottest pixel: proof there is no glow left after the water sheet
    let maxL = 0, maxWarm = 0;
    // SULFUR DELTA. A blue-green water sheet at op 0.45 makes an ABSOLUTELY warm
    // pixel arithmetically impossible: the sheet alone contributes 0.45 x (-35)
    // to R-B, so the plume would need R-B > 230 before blending to come out warm.
    // The sulfur note is therefore RELATIVE -- the plume is markedly LESS BLUE and
    // a little lighter than everything around it, which on a teal field is read as
    // yellowish. That relative shift is what this measures: mean R-B and mean luma
    // over the plume-covered pixels against the rest of the interior.
    let pR = 0, pB = 0, pL = 0, pn = 0, oR = 0, oB = 0, oL = 0, on = 0;
    for (let p = 0; p < TILE_W * TILE_H; p++) {
      const i = p * ch;
      if (out[i + 3] < 8) continue;
      const L = L709(out[i], out[i + 1], out[i + 2]);
      if (L > maxL) maxL = L;
      const w = out[i] - out[i + 2];
      if (w > maxWarm) maxWarm = w;
      if (plumeMask[p] >= 20) { pR += out[i]; pB += out[i + 2]; pL += L; pn++; }
      else { oR += out[i]; oB += out[i + 2]; oL += L; on++; }
    }
    const plumeRB = pn ? pR / pn - pB / pn : 0, restRB = on ? oR / on - oB / on : 0;
    const plumeL = pn ? pL / pn : 0, restL = on ? oL / on : 0;

    const png = await toPng(out, ch);
    fs.writeFileSync(path.join(ST, `${BIOME}_c${n}${tag}.png`), png);
    OUT.push(png); GR.push(await toPng(gd, ch)); DRY.push(await toPng(dry, ch));
    reports.push({ n, placed: placed.length, skipped: skipped.length, minChim, minPlume });

    const kinds = {};
    for (const { s } of placed) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
    console.log(
      `  slot${n}  ground ${cfg.ground.biome}_${n}  water ${cfg.water.biome}_${wSlot}  waterG ${f2(sheetR.G)}\n` +
      `    vents    placed ${placed.length}/${stamps.length}` +
      (skipped.length ? ` (skipped ${skipped.length})` : '') +
      `  ${Object.entries(kinds).map(([k, v]) => `${v}x ${k}`).join(' + ')}` +
      `  chimney px ${chimPx} (${(chimPx / (TILE_W * TILE_H / 2) * 100).toFixed(1)}% of diamond)\n` +
      `    TILING   min edge dist: chimney ${minChim === Infinity ? 'n/a' : f1(minChim)} px` +
      ` (need >= ${cfg.margin})   plume ${minPlume === Infinity ? 'n/a' : f1(minPlume)} px` +
      ` (need >= ${cfg.plumeGuard})   ${(minChim >= cfg.margin && (minPlume === Infinity || minPlume >= cfg.plumeGuard)) ? 'ok' : '<-- FAIL'}` +
      `   guard-faded plume px ${guarded}\n` +
      `    ground   ${rgbS(gst.inner.rgb)} inner ${f1(gst.inner.lum)} (canvas ${f1(gst.canvas.lum)}) sd ${f1(gst.inner.sd)}\n` +
      `    +vents   ${rgbS(dst.inner.rgb)} inner ${f1(dst.inner.lum)} (canvas ${f1(dst.canvas.lum)}) sd ${f1(dst.inner.sd)}\n` +
      `    +water   ${rgbS(ost.inner.rgb)} inner ${f1(ost.inner.lum)} (canvas ${f1(ost.canvas.lum)}) sd ${f1(ost.inner.sd)}` +
      `  corners lum ${f1(ost.corner.lum)}\n` +
      `    no-glow  brightest interior px luma ${f1(maxL)}   max R-B ${maxWarm}   alphaDiff vs ground ${aDiff}\n` +
      `    sulfur   plume px ${pn} (${(pn / (TILE_W * TILE_H / 2) * 100).toFixed(1)}% of diamond)` +
      `   R-B ${f1(plumeRB)} vs rest ${f1(restRB)} (delta +${f1(plumeRB - restRB)})` +
      `   luma ${f1(plumeL)} vs rest ${f1(restL)} (delta +${f1(plumeL - restL)})`
    );
  }

  const sheets = [
    await rowsSheet([
      { t: `GROUND    ${cfg.ground.label}`, b: GR },
      { t: `+ CHIMNEYS  charred_tree_4 (upright) + charred_tree_3 (flush), saturation ${cfg.desatSprites}` +
           `${wantPlume ? ' + drawn sulfur plumes' : ' (NO PLUMES)'}`, b: DRY },
      { t: `+ WATER SHEET  ${cfg.water.label} at op ${cfg.op}  ->  ${BIOME}_cN${tag}.png (grade input)`, b: OUT },
    ], `_${BIOME}_compose_check${tag}.png`),
  ];
  console.log('  [sheets] ' + sheets.map((p) => path.relative(ROOT, p)).join('\n           '));
  console.log(`  [tiling] ${reports.every((r) => r.minChim >= cfg.margin) ? 'ALL SLOTS CLEAR THE MARGIN' : 'MARGIN VIOLATED'}`);
  console.log('\ncompose done -- next: node scripts/tiles-water-grade.cjs volcanic_vent');
})();
