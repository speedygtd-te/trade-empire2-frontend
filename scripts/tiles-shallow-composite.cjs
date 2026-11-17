/**
 * SHALLOW_WATER = LOCAL COMPOSITE OF TWO FINISHED TILE SETS (no fal.ai).
 *
 * Rudi's idea: brighten + turquoise-shift the finished `ocean` slots into a
 * translucent water sheet, then lay that over the finished `oasis` slots.
 * oasis is warm sand with grass tufts and small stones -- seen through
 * turquoise water it reads as a sand bottom with sea grass and gravel, i.e.
 * the "bottom detail" wish without generating anything.
 *
 *   water sheet   src/assets/tiles/ocean/ocean_N.webp
 *   sea floor     src/assets/tiles/oasis/oasis_N.webp
 *   Slot i is paired with slot i, and slots are NOT re-flipped -- the flip
 *   already lives in both source series. THE ONE EXCEPTION is slot 2, whose own
 *   oasis ground is nearly bare: it is built on oasis_1 FLOPPED (see
 *   groundPerSlot in CONFIG).
 *
 * DEAD END, do not re-open: painting bottom detail INTO the old shallow_water
 * tile via fal.ai/kontext failed 3x per slot (kontext regenerates, it is never
 * additive). Attempts archived in assets/style-test/tiles/_water_attempts/.
 *
 * HARD RULES (repo lessons -- do not change):
 *  - NO divide-by-blur / 2D equalisation. Every operation is POINTWISE, so the
 *    diamond rim can never be over-brightened (the toxic_marsh gold-rim
 *    failure mode).
 *  - ALPHA IS NEVER COMPUTED, only copied: the output alpha is the GROUND
 *    alpha byte for byte, verified against the source and again after the webp
 *    round trip.
 *  - Full mip set on integrate: 28 files (4 x [full.webp + @half/@quarter/
 *    @eighth as webp+png]), convention from scripts/ocean-integrate-prod.cjs.
 *
 * PIPELINE (per pixel with alpha >= 1)
 *   1. water sheet = ocean * G * norm * shift[c]
 *        shift  turquoise channel shift (R down, G/B up)
 *        norm   1 / (0.2126*sr + 0.7152*sg + 0.0722*sb) -> luma neutral, so
 *               the shift only rotates hue and G alone owns brightness
 *        G      solved by bisection so the sheet's INTERIOR luma hits
 *               --water-lum (bisection rather than naive target/measured, so
 *               highlight clipping cannot leave the level above target)
 *   2. composite  out = ground*(1-op) + water*op       (plain alpha blend)
 *   3. POST-SHIFT: one luma-neutral hue shift on the finished composite --
 *      MANDATORY, see the CONFIG comment. Without it the tile reads as a swamp
 *      bottom, because teal water over orange sand averages out to grey.
 *   (--variant-b adds the rejected darkened variant, for comparison only.)
 *
 * SHIPPING RECIPE (all of it lives in CONFIG -- running the script with NO
 * arguments reproduces the integrated tiles exactly):
 *   water sheet interior luma 62, shift R0.70 G1.12 B1.18, op 0.65 on all four
 *   slots, post-shift R0.80 G1.08 B1.15, and slot 2 built on oasis_1 FLOPPED
 *   instead of the near-bare oasis_2.
 *
 * METRICS -- BOTH SCALES ARE PRINTED, because the two numbers circulating for
 * these tiles live on different scales:
 *   inner  = Rec709 luma of the channel means over pixels with alpha >= 8
 *   canvas = the same over ALL 512x256 px incl. the transparent diamond
 *            corners, which dilutes by ~x0.504:
 *              ocean             inner 46.3  = canvas 24.5
 *              deep_ocean        inner 29.6  = canvas 15.8
 *              old shallow_water inner 139   = canvas 73.5
 *   --water-lum and --variant-b-lum are INNER values.
 *
 * Usage:
 *   node scripts/tiles-shallow-composite.cjs                    # A + integrate
 *   node scripts/tiles-shallow-composite.cjs --no-integrate     # sheets only
 *   node scripts/tiles-shallow-composite.cjs --water-lum=62 --op=0.65 \
 *        --shift=0.70,1.12,1.18 --variant-b-lum=60
 *   node scripts/tiles-shallow-composite.cjs --op0=0.70         # per-slot op
 *   node scripts/tiles-shallow-composite.cjs --ground2=oasis_3:flop --tag=g3 \
 *        --no-integrate     # try another floor for one slot; --tag keeps the
 *                           # shipped sheets intact, --ground2=off drops the
 *                           # override entirely
 *   node scripts/tiles-shallow-composite.cjs --no-post-shift --tag=nopostshift \
 *        --no-integrate     # the olive-grey look that was rejected
 *   node scripts/tiles-shallow-composite.cjs --variant-b --tag=withb \
 *        --no-integrate     # adds the rejected darkened variant to the sheets
 *   node scripts/tiles-shallow-composite.cjs --ground-desat=0.45 --tag=desat \
 *        --no-integrate     # the other, rejected way to fight the grey-out
 *   node scripts/tiles-shallow-composite.cjs --equalize         # solve per-slot
 *                                                               # op (+-0.05) so
 *                                                               # all 4 slots
 *                                                               # match slot 3
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const TILE_W = 512, TILE_H = 256;
const ROOT = path.join(__dirname, '..');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const BIOME = 'shallow_water';

const MIPS = [
  { suffix: '@half', w: 256, h: 128 },
  { suffix: '@quarter', w: 128, h: 64 },
  { suffix: '@eighth', w: 64, h: 32 },
];
const WEBP = { quality: 90, effort: 4, smartSubsample: true };

// ---------------------------------------------------------------- CONFIG ----
const CONFIG = {
  water: { biome: 'ocean', label: 'src/assets/tiles/ocean/ocean_N.webp' },
  ground: { biome: 'oasis', label: 'src/assets/tiles/oasis/oasis_N.webp' },
  // interior luma the water sheet is lifted to before blending (ocean: 46.3)
  waterLum: 62.0,
  // turquoise shift, normalised to luma weight 1 inside the grade
  shift: { r: 0.70, g: 1.12, b: 1.18 },
  // water opacity; 0.65 reviewed as best (0.55 leaves the sand too orange,
  // 0.75 swallows the floor). Per-slot deviation of +-0.05 is allowed.
  op: 0.65,
  opPerSlot: {},
  // Variant B (composite darkened to this interior luma) was REVIEWED AND
  // REJECTED -- variant A's brightness is the shipping one. Kept behind
  // --variant-b so the comparison stays reproducible, but OFF by default: the
  // sheets this script writes must always show the INTEGRATED fassung, never a
  // discarded one.
  variantBLum: 60.0,
  // ---------------------------------------------------------------------
  // POST-SHIFT -- SHIPPING, Rudi-approved. THE LESSON FOR EVERY FUTURE WATER
  // BIOME: turquoise water over ORANGE sand cancels BOTH saturations, because
  // teal and orange are complementary and any weighted average of them lands
  // on grey. The straight composite therefore measured rgb(57,76,74) and read
  // as a SWAMP / ALGAE bottom, not as water -- even though both sources are
  // strongly coloured and the water sheet on its own is a clean teal. That
  // cancellation cannot be predicted from the source numbers, it only shows up
  // once the blend is rendered and looked at.
  // The fix is one luma-neutral hue shift on the FINISHED composite, i.e. a
  // single water column tinting floor and water alike (physically the honest
  // model: light travels through the water above everything). It restores the
  // GDD turquoise ("Tuerkises Wasser, Lichtreflexe tanzen auf dem Boden",
  // Docs/GAME_DESIGN_DOCUMENT.md l.5358ff) and, unlike desaturating the sand
  // first, it KEEPS THE SEA GRASS GREEN.
  //   rgb(57,76,74) olive-grey  ->  rgb(45,80,84) aqua
  postShift: { r: 0.80, g: 1.08, b: 1.15 },
  // Rejected alternative, kept only as a flag: desaturating the ground before
  // blending (--ground-desat=0.45) also cools the tile down, but it washes the
  // vegetation out with the sand. 1.0 = off.
  groundDesat: 1.0,
  // Per-slot ground override. Slot 2's own oasis ground is nearly bare, so the
  // composite read as empty haze instead of a sea floor (corr 0.48, interior
  // sd 14.9, no structure at all). It gets a planted oasis slot instead,
  // FLOPPED -- the repo's established slot variation, free of any generation,
  // and the diamond mask is left/right symmetric so a flop preserves it
  // exactly (verified byte-wise). The WATER sheet stays ocean_2.
  //
  // oasis_1 flopped BEAT oasis_3 flopped, both measured and looked at:
  //   oasis_1 flop  corr 0.62  sd 16.7  headroom 94.6   <- chosen
  //   oasis_3 flop  corr 0.72  sd 18.2  headroom 104.1
  // oasis_3 scores higher on paper but loses on the two criteria that decide a
  // TILED field:
  //  1. REPETITION. Any override makes slot 2 a mirror twin of another slot.
  //     oasis_3's motif is big high-contrast grass clumps with radiating
  //     blades -- a mirrored copy of that is spotted instantly where slot 2 and
  //     slot 3 touch in the interlocked mosaic. oasis_1's motif is a
  //     low-contrast scatter of pebbles with a few tufts; its twin is
  //     effectively undetectable.
  //  2. BALANCE. With oasis_3 the set is two dense grass tiles plus two quiet
  //     ones and the mosaic trends towards uniform grass. With oasis_1 it stays
  //     a density staircase -- one dense (3), two medium (1, 2), one quiet (0)
  //     -- and no bald tile is left.
  groundPerSlot: {
    2: { biome: 'oasis', slot: 1, flop: true },
  },
};

// --------------------------------------------------------------- METRICS ----
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** interior + whole-canvas stats plus interior luma percentiles, one pass */
function statsOf(data, ch) {
  const N = data.length / ch;
  const cs = [0, 0, 0], is = [0, 0, 0], iq = [0, 0, 0], tr = [0, 0, 0];
  let ni = 0, nt = 0;
  const lums = [];
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    cs[0] += r; cs[1] += g; cs[2] += b;
    if (a >= 8) {
      is[0] += r; is[1] += g; is[2] += b;
      iq[0] += r * r; iq[1] += g * g; iq[2] += b * b;
      ni++; lums.push(L709(r, g, b));
    } else {
      tr[0] += r; tr[1] += g; tr[2] += b; nt++;
    }
  }
  const cm = cs.map((s) => s / N), im = is.map((s) => s / ni);
  const isd = iq.map((q, k) => Math.sqrt(Math.max(0, q / ni - im[k] * im[k])));
  lums.sort((a, b) => a - b);
  const pct = (p) => lums[Math.min(lums.length - 1, Math.floor(lums.length * p))];
  return {
    inner: {
      rgb: im, lum: L709(im[0], im[1], im[2]),
      sd: (isd[0] + isd[1] + isd[2]) / 3, n: ni,
      p50: pct(0.5), p90: pct(0.9), p97: pct(0.97), p999: pct(0.999),
    },
    canvas: { rgb: cm, lum: L709(cm[0], cm[1], cm[2]) },
    dil: { p: ni / N, trL: nt ? L709(tr[0] / nt, tr[1] / nt, tr[2] / nt) : 0 },
  };
}

/** interior luma threshold above which `share` of the interior pixels lie */
function lumThreshold(data, ch, share) {
  const lums = [];
  for (let i = 0; i < data.length; i += ch) {
    if (data[i + 3] >= 8) lums.push(L709(data[i], data[i + 1], data[i + 2]));
  }
  lums.sort((a, b) => a - b);
  return lums[Math.min(lums.length - 1, Math.floor(lums.length * (1 - share)))];
}

/**
 * Does the composite's sparkle still COME FROM the ocean foam?
 * Of the brightest 1% interior pixels of the composite, what share sits in the
 * brightest 5% of the water sheet? Random overlap would be ~5%; the GDD's
 * "light reflexes dancing on the floor" needs this to stay high.
 */
function reflexShare(comp, water, ch) {
  const tc = lumThreshold(comp, ch, 0.01);
  const tw = lumThreshold(water, ch, 0.05);
  let hit = 0, tot = 0;
  for (let i = 0; i < comp.length; i += ch) {
    if (comp[i + 3] < 8) continue;
    if (L709(comp[i], comp[i + 1], comp[i + 2]) < tc) continue;
    tot++;
    if (L709(water[i], water[i + 1], water[i + 2]) >= tw) hit++;
  }
  return { share: tot ? hit / tot : 0, tot };
}

/** how much FLOOR structure survives: corr(composite, ground) on interior luma */
function groundCorr(comp, ground, ch) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, n = 0;
  for (let i = 0; i < comp.length; i += ch) {
    if (comp[i + 3] < 8) continue;
    const x = L709(ground[i], ground[i + 1], ground[i + 2]);
    const y = L709(comp[i], comp[i + 1], comp[i + 2]);
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; n++;
  }
  const cov = sxy / n - (sx / n) * (sy / n);
  const vx = sxx / n - (sx / n) ** 2, vy = syy / n - (sy / n) ** 2;
  return cov / Math.sqrt(Math.max(1e-9, vx * vy));
}

// ------------------------------------------------------------ GRADE/BLEND ---
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
  if (d === 1) return Buffer.from(src);
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

/** luma-neutral channel shift: rotates hue, cannot change brightness */
function hueShift(src, ch, shift) {
  const w = 0.2126 * shift.r + 0.7152 * shift.g + 0.0722 * shift.b;
  return gain(src, ch, [shift.r / w, shift.g / w, shift.b / w]);
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

/** turquoise water sheet from an ocean slot, lifted to `target` interior luma */
function waterSheet(src, ch, shift, target) {
  const w = 0.2126 * shift.r + 0.7152 * shift.g + 0.0722 * shift.b;
  const base = [shift.r / w, shift.g / w, shift.b / w];
  const G = solve(src, ch, base, target);
  return { buf: gain(src, ch, base.map((b) => b * G)), G, base };
}

/**
 * out = ground*(1-op) + water*op for alpha >= 1. ALPHA and every fully
 * transparent pixel are copied from the ground, byte for byte.
 */
function composite(ground, water, ch, op) {
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

// --------------------------------------------------------------- EDGE CHK ---
let INNER_MASK = null;
async function innerMask() {
  if (INNER_MASK) return INNER_MASK;
  const s = 0.86, iw = Math.round(TILE_W * s), ih = Math.round(TILE_H * s);
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}">` +
    `<polygon points="${TILE_W / 2},${(TILE_H - ih) / 2} ${(TILE_W + iw) / 2},${TILE_H / 2} ` +
    `${TILE_W / 2},${(TILE_H + ih) / 2} ${(TILE_W - iw) / 2},${TILE_H / 2}" fill="white"/></svg>`
  );
  INNER_MASK = await sharp(svg).greyscale().raw().toBuffer();
  return INNER_MASK;
}
/** mean interior luma of the OUTERMOST diamond band (rim guard) */
async function edgeLum(data, ch) {
  const inner = await innerMask();
  let sum = 0, n = 0;
  for (let p = 0; p < TILE_W * TILE_H; p++) {
    const i = p * ch;
    if (data[i + 3] < 8 || inner[p] > 8) continue;
    sum += L709(data[i], data[i + 1], data[i + 2]); n++;
  }
  return { lum: n ? sum / n : 0, n };
}

// ---------------------------------------------------------------- HELPERS ---
async function rawOf(file, flop) {
  const pipe = flop ? sharp(file).flop() : sharp(file);
  const { data, info } = await pipe.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== TILE_W || info.height !== TILE_H)
    throw new Error(`${file} is ${info.width}x${info.height}, expected ${TILE_W}x${TILE_H}`);
  return { data, ch: info.channels };
}
const toPng = (data, ch) =>
  sharp(data, { raw: { width: TILE_W, height: TILE_H, channels: ch } }).png().toBuffer();

async function alphaBytes(fileOrBuf) {
  const { data, info } = await sharp(fileOrBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const a = Buffer.alloc(info.width * info.height);
  for (let p = 0; p < a.length; p++) a[p] = data[p * info.channels + 3];
  return a;
}
const f1 = (x) => x.toFixed(1);
const f2 = (x) => x.toFixed(2);
const rgbS = (v) => `rgb(${f1(v[0])},${f1(v[1])},${f1(v[2])})`;

// ------------------------------------------------------------- INTEGRATE ----
async function integrate(pngs) {
  const dst = path.join(TILES, BIOME);
  fs.mkdirSync(dst, { recursive: true });
  const written = [];
  for (let n = 0; n < pngs.length; n++) {
    const buf = pngs[n];
    await sharp(buf).webp(WEBP).toFile(path.join(dst, `${BIOME}_${n}.webp`));
    written.push(`${BIOME}_${n}.webp`);
    for (const m of MIPS) {
      const base = `${BIOME}_${n}${m.suffix}`;
      await sharp(buf).resize(m.w, m.h, { fit: 'fill' }).webp(WEBP).toFile(path.join(dst, `${base}.webp`));
      await sharp(buf).resize(m.w, m.h, { fit: 'fill' }).png().toFile(path.join(dst, `${base}.png`));
      written.push(`${base}.webp`, `${base}.png`);
    }
  }
  return { dst, written };
}

// ----------------------------------------------------------------- SHEETS ---
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const label = (text, w) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="22">` +
  `<text x="4" y="16" font-family="monospace" font-size="15" fill="#c9d1d9">${text}</text></svg>`
);

async function sheet2x2(pngs, file, cap) {
  const LBL = 22, PAD = 16, GAP = 16;
  const comp = [];
  for (let n = 0; n < 4; n++) {
    const col = n % 2, row = (n - col) / 2;
    const cx = PAD + col * (TILE_W + GAP), cy = PAD + row * (LBL + TILE_H + GAP);
    comp.push({ input: label(cap(n), TILE_W), left: cx, top: cy });
    comp.push({ input: pngs[n], left: cx, top: cy + LBL });
  }
  const out = await sharp({
    create: {
      width: PAD * 2 + TILE_W * 2 + GAP,
      height: PAD * 2 + (LBL + TILE_H) * 2 + GAP,
      channels: 4, background: BGA,
    },
  }).composite(comp).png().toBuffer();
  const p = path.join(ST, file);
  fs.writeFileSync(p, out);
  return p;
}

/** stacked rows of 4: water src / ground / water sheet / variant A / variant B */
async function sheetBeforeAfter(rows, file) {
  const LBL = 22, PAD = 16, GAP = 12, W = 320, H = 160;
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
  const p = path.join(ST, file);
  fs.writeFileSync(p, out);
  return p;
}

/** seam check: interlocking iso mosaic of mixed slots at half scale */
async function sheetMosaic(pngs, file) {
  const w = 256, h = 128;
  const halves = await Promise.all(
    pngs.map((b) => sharp(b).resize(w, h, { fit: 'fill' }).png().toBuffer())
  );
  let seed = 0x51ac;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >>> 8) / 0x7fffff; };
  const comp = [];
  let mr = 0, mb = 0;
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 5; c++) {
      const x = c * w + (r % 2 ? w / 2 : 0), y = r * (h / 2);
      comp.push({ input: halves[Math.floor(rnd() * 4) % 4], left: x, top: y });
      mr = Math.max(mr, x + w); mb = Math.max(mb, y + h);
    }
  }
  const out = await sharp({ create: { width: mr, height: mb, channels: 4, background: BGA } })
    .composite(comp).png().toBuffer();
  const p = path.join(ST, file);
  fs.writeFileSync(p, out);
  return p;
}

// -------------------------------------------------------------------- RUN ---
async function run(cfg, opts) {
  console.log(`\n=== ${BIOME}  =  ${cfg.water.label}  OVER  ${cfg.ground.label}`);
  console.log(
    `    water interior luma -> ${cfg.waterLum}   shift R${cfg.shift.r} G${cfg.shift.g} B${cfg.shift.b}` +
    ` (luma neutral)   op ${cfg.op}${Object.keys(cfg.opPerSlot).length ? ' + per-slot' : ''}` +
    `   variant B -> ${cfg.variantBLum}`
  );
  if (cfg.groundDesat !== 1 || cfg.postShift) {
    console.log(
      `    [refinement] groundDesat ${cfg.groundDesat}` +
      (cfg.postShift ? `  postShift R${cfg.postShift.r} G${cfg.postShift.g} B${cfg.postShift.b}` : '') +
      (opts.tag ? `  tag "${opts.tag}"` : '  (NO TAG -- this overwrites the default sheets)')
    );
  }

  const A = [], B = [], WS = [], GR = [], SRC = [], rows = [];
  const grounds = [];
  for (let n = 0; n < 4; n++) {
    const ov = cfg.groundPerSlot[n];
    const biome = ov ? ov.biome : cfg.ground.biome;
    const slot = ov ? ov.slot : n;
    const flop = !!(ov && ov.flop);
    const file = path.join(TILES, biome, `${biome}_${slot}.webp`);
    if (!fs.existsSync(file)) throw new Error(`missing ground source: ${file}`);
    const g = await rawOf(file, flop);
    grounds.push({
      ...g, st: statsOf(g.data, g.ch),
      label: `${biome}_${slot}${flop ? ' FLOPPED' : ''}${ov ? '  (override)' : ''}`,
    });
  }
  // --equalize: choose op per slot so every composite lands on the slot-3 level
  let eqTarget = null;
  if (opts.equalize) {
    eqTarget = grounds[3].st.inner.lum * (1 - cfg.op) + cfg.waterLum * cfg.op;
    console.log(`    [equalize] target composite interior luma ${f1(eqTarget)} (slot 3 at op ${cfg.op})`);
  }

  for (let n = 0; n < 4; n++) {
    const { data: gd, ch } = grounds[n];
    const gst = grounds[n].st;
    const wf = path.join(TILES, cfg.water.biome, `${cfg.water.biome}_${n}.webp`);
    if (!fs.existsSync(wf)) throw new Error(`missing water source: ${wf}`);
    const { data: wd } = await rawOf(wf);
    const wpre = statsOf(wd, ch);

    const sheetR = waterSheet(wd, ch, cfg.shift, cfg.waterLum);
    const wst = statsOf(sheetR.buf, ch);

    let op = cfg.opPerSlot[n] !== undefined ? cfg.opPerSlot[n] : cfg.op;
    if (eqTarget !== null) {
      const raw = (gst.inner.lum - eqTarget) / (gst.inner.lum - wst.inner.lum);
      op = Math.round(Math.max(cfg.op - 0.05, Math.min(cfg.op + 0.05, raw)) * 100) / 100;
    }

    const gBlend = desaturate(gd, ch, cfg.groundDesat);
    let a = composite(gBlend, sheetR.buf, ch, op);
    if (cfg.postShift) a = hueShift(a, ch, cfg.postShift);
    const ast = statsOf(a, ch);
    const bG = opts.variantB ? solve(a, ch, [1, 1, 1], cfg.variantBLum) : 1;
    const b = opts.variantB ? gain(a, ch, [bG, bG, bG]) : a;
    const bst = opts.variantB ? statsOf(b, ch) : ast;

    // alpha integrity: byte-exact against the GROUND for both variants
    let aDiff = 0, bDiff = 0;
    for (let i = 0; i < gd.length; i += ch) {
      if (gd[i + 3] !== a[i + 3]) aDiff++;
      if (gd[i + 3] !== b[i + 3]) bDiff++;
    }
    const refl = reflexShare(a, sheetR.buf, ch);
    const corr = groundCorr(a, gd, ch);
    const eg = await edgeLum(gd, ch), ea = await edgeLum(a, ch);

    A.push(await toPng(a, ch));
    B.push(await toPng(b, ch));
    WS.push(await toPng(sheetR.buf, ch));
    GR.push(await toPng(gd, ch));
    SRC.push(await toPng(wd, ch));
    rows.push({ n, op, G: sheetR.G, bG, gst, wpre, wst, ast, bst, aDiff, bDiff, refl, corr, eg, ea });

    console.log(
      `  slot${n}  op ${op}  waterG ${f2(sheetR.G)}  variantB gain ${f2(bG)}\n` +
      `    ground   ${grounds[n].label}  ${rgbS(gst.inner.rgb)} inner ${f1(gst.inner.lum)}` +
      ` (canvas ${f1(gst.canvas.lum)})` +
      ` sd ${f1(gst.inner.sd)} p97 ${f1(gst.inner.p97)}\n` +
      `    water    ocean inner ${f1(wpre.inner.lum)} -> sheet ${rgbS(wst.inner.rgb)}` +
      ` inner ${f1(wst.inner.lum)} (canvas ${f1(wst.canvas.lum)}) p99.9 ${f1(wst.inner.p999)}\n` +
      `    VAR A    ${rgbS(ast.inner.rgb)} inner ${f1(ast.inner.lum)} (canvas ${f1(ast.canvas.lum)})` +
      ` sd ${f1(ast.inner.sd)} p50 ${f1(ast.inner.p50)} p97 ${f1(ast.inner.p97)} p99.9 ${f1(ast.inner.p999)}\n` +
      (opts.variantB
        ? `    VAR B    ${rgbS(bst.inner.rgb)} inner ${f1(bst.inner.lum)}` +
          ` (canvas ${f1(bst.canvas.lum)}) sd ${f1(bst.inner.sd)} p99.9 ${f1(bst.inner.p999)}\n`
        : '') +
      `    floor    corr(A,ground) ${f2(corr)}   reflexShare ${(refl.share * 100).toFixed(1)}%` +
      ` of top-1% px (random ~5%)   headroom p99.9-p50 ${f1(ast.inner.p999 - ast.inner.p50)}\n` +
      `    alpha    vs ground: A ${aDiff} B ${bDiff} bytes differ   edge band` +
      ` ${f1(eg.lum)} -> ${f1(ea.lum)} (n=${ea.n})`
    );
  }

  // rim guard -- the blend is pointwise, so the rim must move like the interior
  console.log('  [rim guard] edge band vs interior gain ratio (pointwise => must be ~1.00):');
  for (const r of rows) {
    const eR = r.ea.lum / r.eg.lum, iR = r.ast.inner.lum / r.gst.inner.lum;
    const rel = eR / iR;
    console.log(`    slot${r.n} edge x${f2(eR)} / inner x${f2(iR)} = ${f2(rel)}` +
      (Math.abs(rel - 1) > 0.12 ? '  <-- RIM WARN' : '  ok'));
  }
  // cross-slot spread: adjacent tiles must not visibly step in brightness
  const lums = rows.map((r) => r.ast.inner.lum);
  console.log(`  [slot spread] A inner ${lums.map(f1).join(' / ')}  ->  max delta ` +
    `${f1(Math.max(...lums) - Math.min(...lums))}`);

  fs.mkdirSync(ST, { recursive: true });
  const tag = opts.tag ? `_${opts.tag}` : '';
  const sheets = [
    await sheet2x2(A, `_${BIOME}_slots_2x2${tag}.png`,
      (n) => `${BIOME}_${n}${tag}  FINAL  inner ${f1(rows[n].ast.inner.lum)}  op ${rows[n].op}` +
             `  floor ${grounds[n].label.replace('  (override)', ' *')}`),
    ...(opts.variantB ? [await sheet2x2(B, `_${BIOME}_variantB_2x2${tag}.png`,
      (n) => `${BIOME}_${n}  VARIANT B -- REJECTED${tag}  inner ${f1(rows[n].bst.inner.lum)}`)] : []),
    await sheetBeforeAfter([
      { t: `WATER SRC    ${cfg.water.label}`, b: SRC },
      { t: `GROUND       ${grounds.map((g) => g.label.replace('  (override)', '*')).join('  |  ')}`, b: GR },
      { t: `WATER SHEET  graded ocean, interior luma ${cfg.waterLum}`, b: WS },
      { t: `INTEGRATED   -> src/assets/tiles/${BIOME}/${BIOME}_N.webp` +
           `${cfg.postShift ? '  + post-shift' : ''}`, b: A },
      ...(opts.variantB
        ? [{ t: `VARIANT B    darkened to interior luma ${cfg.variantBLum} -- REJECTED`, b: B }]
        : []),
    ], `_${BIOME}_before_after${tag}.png`),
    await sheetMosaic(A, `_${BIOME}_mosaic${tag}.png`),
    ...(opts.variantB ? [await sheetMosaic(B, `_${BIOME}_variantB_mosaic${tag}.png`)] : []),
  ];
  console.log('  [sheets] ' + sheets.map((p) => path.relative(ROOT, p)).join('\n           '));

  if (opts.integrate) {
    const { dst, written } = await integrate(A);
    console.log(`  [integrate] ${written.length} files -> ${path.relative(ROOT, dst)}`);
    for (let n = 0; n < 4; n++) {
      const a0 = await alphaBytes(A[n]);
      const a1 = await alphaBytes(path.join(dst, `${BIOME}_${n}.webp`));
      let d = 0;
      for (let i = 0; i < a0.length; i++) if (a0[i] !== a1[i]) d++;
      console.log(`    alpha round-trip slot${n}: ${d === 0 ? 'BIT-EXACT' : d + ' bytes differ'}`);
    }
    const files = fs.readdirSync(dst);
    const missing = [];
    for (let n = 0; n < 4; n++) {
      const exp = [`${BIOME}_${n}.webp`];
      for (const m of MIPS) exp.push(`${BIOME}_${n}${m.suffix}.webp`, `${BIOME}_${n}${m.suffix}.png`);
      for (const e of exp) if (!files.includes(e)) missing.push(e);
    }
    console.log(`    mips: ${missing.length ? 'MISSING ' + missing.join(',') : `complete (${4 + 4 * MIPS.length * 2} files)`}`);
  } else {
    console.log('  [--no-integrate] src/assets/tiles/shallow_water untouched');
  }
}

(async () => {
  const args = process.argv.slice(2);
  const arg = (name) => {
    const a = args.find((x) => x.startsWith(`--${name}=`));
    return a ? a.slice(name.length + 3) : null;
  };
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  if (arg('water-lum') !== null) cfg.waterLum = Number(arg('water-lum'));
  if (arg('op') !== null) cfg.op = Number(arg('op'));
  if (arg('variant-b-lum') !== null) cfg.variantBLum = Number(arg('variant-b-lum'));
  if (arg('shift') !== null) {
    const [r, g, b] = arg('shift').split(',').map(Number);
    cfg.shift = { r, g, b };
  }
  if (arg('ground-desat') !== null) cfg.groundDesat = Number(arg('ground-desat'));
  for (let n = 0; n < 4; n++) {
    const v = arg(`ground${n}`);
    if (v === null) continue;
    if (v === 'off') { delete cfg.groundPerSlot[n]; continue; }
    const [src, mod] = v.split(':');
    const m = /^(.+)_([0-9]+)$/.exec(src);
    if (!m) throw new Error(`--ground${n} expects <biome>_<slot>[:flop] or off`);
    cfg.groundPerSlot[n] = { biome: m[1], slot: Number(m[2]), flop: mod === 'flop' };
  }
  if (args.includes('--no-post-shift')) cfg.postShift = null;
  else if (arg('post-shift') !== null) {
    const [r, g, b] = arg('post-shift').split(',').map(Number);
    cfg.postShift = { r, g, b };
  }
  for (let n = 0; n < 4; n++) if (arg(`op${n}`) !== null) cfg.opPerSlot[n] = Number(arg(`op${n}`));
  await run(cfg, {
    variantB: args.includes('--variant-b'),
    integrate: !args.includes('--no-integrate'),
    equalize: args.includes('--equalize'),
    tag: arg('tag'),
  });
  console.log('\ndone');
})();
