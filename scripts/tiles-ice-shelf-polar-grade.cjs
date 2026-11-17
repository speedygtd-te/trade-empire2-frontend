/**
 * ice_shelf GROUND TILE — polar-water grade (local only, NO fal.ai, NO kontext).
 *
 * ── WHY A SEPARATE SCRIPT FROM tiles-water-grade.cjs
 *
 * tiles-water-grade.cjs owns the three signed-off water biomes. Its `ice_shelf`
 * config is built for the ABANDONED design: kontext sources with floes baked
 * into the tile, graded through the `twoPoint` anchor that pins a WATER level
 * and an ICE level. That design is gone — Rudi's decision is that ice floes are
 * PROPS (see props-ice-floe-generate.cjs), because the prop layer is allowed to
 * overhang the diamond boundary and therefore cannot produce the cut-off-at-the-
 * seam / point-raster failures the three kontext attempts hit.
 *
 * What the ground tile has to be now is much simpler: OCEAN, graded cold. There
 * is no second anchor because there is no ice in the tile, and the source is
 * src/assets/tiles/ocean/, not a style-test kontext png. Rather than edit the
 * signed-off script (deep_ocean and shallow_water were accepted from it and must
 * stay reproducible byte-for-byte), this file carries the new config.
 *
 * ── THE GRADE
 * Pointwise only, exactly the discipline tiles-water-grade.cjs established:
 *   1. desaturate   c' = L + desat·(c − L)              (luma preserving)
 *   2. tint + level c'' = c'·tint[c]·G                  (G solved by bisection)
 *   3. contrast     c''' = m[c] + k·(c'' − m[c])        (interior-mean preserving)
 * NO divide-by-blur / 2D equalisation: on a diamond-masked tile that lifts the
 * rim and produces the gold-rim artefact (toxic_marsh failure mode). Every
 * operation here is position independent, so the rim cannot be singled out — the
 * script proves it per slot with the rim guard.
 *
 * ALPHA IS NEVER TOUCHED: only pixels with alpha ≥ 1 are graded, alpha is copied
 * verbatim, verified byte-wise against the source, against the ocean_0 diamond
 * mask, and again after the webp round-trip.
 *
 * ── THE TARGET BAND
 *   ocean        canvas 24.4  (EARTH_LIKE, the source)
 *   ice_shelf    canvas 20–24  ← this file, 22.0
 *   deep_ocean   canvas 15.8  (planet type OCEAN)
 * Polar water: clearly LIGHTER and COLDER than deep_ocean, a little darker and
 * much bluer than temperate ocean. Red comes down hardest (water absorbs red
 * first, and the extra red cut is what makes it read "cold" rather than just
 * "dark"), blue is held slightly above unity, and the desaturation pulls the
 * whole thing towards grey so it reads pale rather than tropical.
 *
 * The foam streaks that ocean has baked in are DELIBERATELY KEPT: at polar
 * colour temperature they read as brash ice / frost streaks on the surface,
 * which is exactly the biome. contrastK stays at 1.0 so they are not flattened.
 *
 * Usage:
 *   node scripts/tiles-ice-shelf-polar-grade.cjs --candidates   comparison sheet only
 *   node scripts/tiles-ice-shelf-polar-grade.cjs --no-integrate measure + sheets
 *   node scripts/tiles-ice-shelf-polar-grade.cjs                grade + integrate
 *   ... --desat=0.7 --tint=0.7,0.98,1.14 --target=22 --k=1.0    dial a look in
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const TILE_W = 512,
  TILE_H = 256;
const ROOT = path.join(__dirname, '..');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const BIOME = 'ice_shelf';
const SRC = (n) => path.join(TILES, 'ocean', `ocean_${n}.webp`);
const SRC_LABEL = 'src/assets/tiles/ocean/ocean_N.webp';

const MIPS = [
  { suffix: '@half', w: 256, h: 128 },
  { suffix: '@quarter', w: 128, h: 64 },
  { suffix: '@eighth', w: 64, h: 32 },
];
const WEBP = { quality: 90, effort: 4, smartSubsample: true };

// Shipping config — the values that produced the integrated tiles.
const CFG = {
  desat: 0.7,
  tint: { r: 0.7, g: 0.98, b: 1.14 },
  contrastK: 1.0,
  target: 22.0,
  band: [20, 24],
};

// Candidate grid for the --candidates comparison sheet. Kept in the file so the
// choice is reproducible and the rejected options are visible.
const CANDIDATES = [
  { id: 'A', desat: 0.85, tint: { r: 0.78, g: 0.98, b: 1.08 }, contrastK: 1.0, target: 22.0 },
  { id: 'B', desat: 0.7, tint: { r: 0.7, g: 0.98, b: 1.14 }, contrastK: 1.0, target: 22.0 },
  { id: 'C', desat: 0.55, tint: { r: 0.66, g: 0.97, b: 1.2 }, contrastK: 1.0, target: 22.0 },
  { id: 'D', desat: 0.7, tint: { r: 0.7, g: 0.98, b: 1.14 }, contrastK: 1.0, target: 20.5 },
  { id: 'E', desat: 0.7, tint: { r: 0.7, g: 0.98, b: 1.14 }, contrastK: 1.0, target: 23.5 },
];

// ─────────────────────────────────────────────────────────────── metrics ────
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function statsOf(data, ch) {
  const N = data.length / ch;
  const cs = [0, 0, 0],
    cq = [0, 0, 0],
    is = [0, 0, 0],
    iq = [0, 0, 0];
  let ni = 0;
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    cs[0] += r;
    cs[1] += g;
    cs[2] += b;
    cq[0] += r * r;
    cq[1] += g * g;
    cq[2] += b * b;
    if (data[i + 3] >= 8) {
      is[0] += r;
      is[1] += g;
      is[2] += b;
      iq[0] += r * r;
      iq[1] += g * g;
      iq[2] += b * b;
      ni++;
    }
  }
  const cm = cs.map((s) => s / N);
  const csd = cq.map((q, k) => Math.sqrt(Math.max(0, q / N - cm[k] * cm[k])));
  const im = is.map((s) => s / ni);
  const isd = iq.map((q, k) => Math.sqrt(Math.max(0, q / ni - im[k] * im[k])));
  return {
    canvas: { rgb: cm, lum: L709(cm[0], cm[1], cm[2]), sd: (csd[0] + csd[1] + csd[2]) / 3 },
    inner: { rgb: im, lum: L709(im[0], im[1], im[2]), sd: (isd[0] + isd[1] + isd[2]) / 3, n: ni },
  };
}

// ───────────────────────────────────────────────────────────────── grade ────
/** pointwise grade; returns a NEW buffer, alpha copied verbatim */
function grade(src, ch, cfg, G) {
  const out = Buffer.from(src);
  const { desat, tint, contrastK: k } = cfg;
  const gains = [tint.r * G, tint.g * G, tint.b * G];
  const lin = new Float32Array((out.length / ch) * 3);
  const s = [0, 0, 0];
  let n = 0;
  for (let i = 0, p = 0; i < out.length; i += ch, p += 3) {
    if (out[i + 3] < 1) {
      lin[p] = out[i];
      lin[p + 1] = out[i + 1];
      lin[p + 2] = out[i + 2];
      continue;
    }
    const r = out[i],
      g = out[i + 1],
      b = out[i + 2];
    const L = L709(r, g, b);
    const v0 = (L + desat * (r - L)) * gains[0];
    const v1 = (L + desat * (g - L)) * gains[1];
    const v2 = (L + desat * (b - L)) * gains[2];
    lin[p] = v0;
    lin[p + 1] = v1;
    lin[p + 2] = v2;
    if (out[i + 3] >= 8) {
      s[0] += v0;
      s[1] += v1;
      s[2] += v2;
      n++;
    }
  }
  const m = [s[0] / n, s[1] / n, s[2] / n];
  for (let i = 0, p = 0; i < out.length; i += ch, p += 3) {
    if (out[i + 3] < 1) continue;
    for (let c = 0; c < 3; c++) {
      const v = k === 1 ? lin[p + c] : m[c] + k * (lin[p + c] - m[c]);
      out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return out;
}

/** bisection on the global gain G so the whole-canvas luma hits cfg.target */
function solveG(src, ch, cfg) {
  let lo = 0.1,
    hi = 4.0;
  for (let it = 0; it < 24; it++) {
    const mid = (lo + hi) / 2;
    if (statsOf(grade(src, ch, cfg, mid), ch).canvas.lum > cfg.target) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

// ────────────────────────────────────────────────────── rim / edge guard ────
let INNER_MASK = null;
async function innerMask() {
  if (INNER_MASK) return INNER_MASK;
  const s = 0.86,
    iw = Math.round(TILE_W * s),
    ih = Math.round(TILE_H * s);
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}">` +
      `<polygon points="${TILE_W / 2},${(TILE_H - ih) / 2} ${(TILE_W + iw) / 2},${TILE_H / 2} ` +
      `${TILE_W / 2},${(TILE_H + ih) / 2} ${(TILE_W - iw) / 2},${TILE_H / 2}" fill="white"/></svg>`,
  );
  INNER_MASK = await sharp(svg).greyscale().raw().toBuffer();
  return INNER_MASK;
}
/** mean Rec709 luma of the OUTERMOST diamond band */
async function edgeLum(data, ch) {
  const inner = await innerMask();
  let sum = 0,
    n = 0;
  for (let p = 0; p < TILE_W * TILE_H; p++) {
    const i = p * ch;
    if (data[i + 3] < 8) continue;
    if (inner[p] > 8) continue;
    sum += L709(data[i], data[i + 1], data[i + 2]);
    n++;
  }
  return { lum: n ? sum / n : 0, n };
}

/**
 * Seam metric. The four diamond EDGES are what butts against a neighbour tile,
 * so a seam shows up as a luminance step between the band on one side of the
 * shared edge and the band on the other. Because every slot is the same
 * pointwise function of an already-seamless source, the four per-edge means must
 * agree slot-to-slot; the spread is the number that proves it.
 */
async function edgeQuadrants(data, ch) {
  const inner = await innerMask();
  const acc = [0, 0, 0, 0],
    cnt = [0, 0, 0, 0];
  for (let y = 0; y < TILE_H; y++) {
    for (let x = 0; x < TILE_W; x++) {
      const p = y * TILE_W + x,
        i = p * ch;
      if (data[i + 3] < 8 || inner[p] > 8) continue;
      const q = (x < TILE_W / 2 ? 0 : 1) + (y < TILE_H / 2 ? 0 : 2);
      acc[q] += L709(data[i], data[i + 1], data[i + 2]);
      cnt[q]++;
    }
  }
  return acc.map((s, q) => (cnt[q] ? s / cnt[q] : 0));
}

// ─────────────────────────────────────────────────────────────── helpers ────
async function rawOf(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
const rgbS = (v) => `rgb(${f1(v[0])},${f1(v[1])},${f1(v[2])})`;

// ───────────────────────────────────────────────────────────── integrate ────
async function integrate(pngs) {
  const dst = path.join(TILES, BIOME);
  fs.mkdirSync(dst, { recursive: true });
  const written = [];
  for (let n = 0; n < pngs.length; n++) {
    const buf = pngs[n];
    await sharp(buf).webp(WEBP).toFile(path.join(dst, `${BIOME}_${n}.webp`));
    written.push(`${BIOME}_${n}.webp`);
    for (const m of MIPS) {
      await sharp(buf).resize(m.w, m.h, { fit: 'fill' }).webp(WEBP).toFile(path.join(dst, `${BIOME}_${n}${m.suffix}.webp`));
      await sharp(buf).resize(m.w, m.h, { fit: 'fill' }).png().toFile(path.join(dst, `${BIOME}_${n}${m.suffix}.png`));
      written.push(`${BIOME}_${n}${m.suffix}.webp`, `${BIOME}_${n}${m.suffix}.png`);
    }
  }
  return { dst, written };
}

// ──────────────────────────────────────────────────────────────── sheets ────
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const label = (text, w) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="22">` +
      `<text x="4" y="16" font-family="monospace" font-size="15" fill="#c9d1d9">${text}</text></svg>`,
  );

async function sheet2x2(pngs) {
  const LBL = 22,
    PAD = 16,
    GAP = 16;
  const comp = [];
  for (let n = 0; n < 4; n++) {
    const col = n % 2,
      row = (n - col) / 2;
    const cx = PAD + col * (TILE_W + GAP),
      cy = PAD + row * (LBL + TILE_H + GAP);
    comp.push({ input: label(`${BIOME}_${n}.webp`, TILE_W), left: cx, top: cy });
    comp.push({ input: pngs[n], left: cx, top: cy + LBL });
  }
  const out = await sharp({
    create: {
      width: PAD * 2 + TILE_W * 2 + GAP,
      height: PAD * 2 + (LBL + TILE_H) * 2 + GAP,
      channels: 4,
      background: BGA,
    },
  })
    .composite(comp)
    .png()
    .toBuffer();
  const p = path.join(ST, `_${BIOME}_slots_2x2.png`);
  fs.writeFileSync(p, out);
  return p;
}

async function sheetBeforeAfter(srcPngs, pngs) {
  const LBL = 22,
    PAD = 16,
    GAP = 12,
    W = 320,
    H = 160;
  const rows = [
    { t: `SOURCE  ${SRC_LABEL}`, b: srcPngs },
    { t: `GRADED  src/assets/tiles/${BIOME}/${BIOME}_N.webp  (polar grade, no baked ice)`, b: pngs },
  ];
  const comp = [];
  let y = PAD;
  for (const row of rows) {
    comp.push({ input: label(row.t, 4 * W + 3 * GAP), left: PAD, top: y });
    y += LBL;
    for (let n = 0; n < 4; n++) {
      comp.push({
        input: await sharp(row.b[n]).resize(W, H, { fit: 'fill' }).png().toBuffer(),
        left: PAD + n * (W + GAP),
        top: y,
      });
    }
    y += H + GAP + 6;
  }
  const out = await sharp({
    create: { width: PAD * 2 + 4 * W + 3 * GAP, height: y + PAD, channels: 4, background: BGA },
  })
    .composite(comp)
    .png()
    .toBuffer();
  const p = path.join(ST, `_${BIOME}_before_after.png`);
  fs.writeFileSync(p, out);
  return p;
}

/** interlocking iso mosaic of mixed slots — the seam / repetition check */
async function sheetMosaic(pngs) {
  const w = 256,
    h = 128;
  const halves = await Promise.all(pngs.map((b) => sharp(b).resize(w, h, { fit: 'fill' }).png().toBuffer()));
  let seed = 0x51ac;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed >>> 8) / 0x7fffff;
  };
  const comp = [];
  let mr = 0,
    mb = 0;
  for (let r = 0; r < 7; r++)
    for (let c = 0; c < 5; c++) {
      const x = c * w + (r % 2 ? w / 2 : 0),
        y = r * (h / 2);
      comp.push({ input: halves[Math.floor(rnd() * 4) % 4], left: x, top: y });
      mr = Math.max(mr, x + w);
      mb = Math.max(mb, y + h);
    }
  const out = await sharp({ create: { width: mr, height: mb, channels: 4, background: BGA } })
    .composite(comp)
    .png()
    .toBuffer();
  const p = path.join(ST, `_${BIOME}_mosaic.png`);
  fs.writeFileSync(p, out);
  return p;
}

/** candidate comparison against the two reference biomes */
async function sheetCandidates(rows) {
  const LBL = 22,
    PAD = 16,
    GAP = 10,
    W = 384,
    H = 192;
  const comp = [];
  let y = PAD;
  for (const row of rows) {
    comp.push({ input: label(row.t, 3 * W + 2 * GAP), left: PAD, top: y });
    y += LBL;
    for (let n = 0; n < row.b.length; n++)
      comp.push({
        input: await sharp(row.b[n]).resize(W, H, { fit: 'fill' }).png().toBuffer(),
        left: PAD + n * (W + GAP),
        top: y,
      });
    y += H + GAP + 4;
  }
  const out = await sharp({
    create: { width: PAD * 2 + 3 * W + 2 * GAP, height: y + PAD, channels: 4, background: BGA },
  })
    .composite(comp)
    .png()
    .toBuffer();
  const p = path.join(ST, `_${BIOME}_grade_candidates.png`);
  fs.writeFileSync(p, out);
  return p;
}

// ─────────────────────────────────────────────────────────────────── run ────
async function candidates() {
  const { data, ch } = await rawOf(SRC(0));
  const rows = [];
  const ref = async (biome, n) => (await rawOf(path.join(TILES, biome, `${biome}_${n}.webp`))).data;
  rows.push({
    t: `REFERENCE   ocean_0 (canvas 24.4)   |   deep_ocean_0 (15.8)   |   ocean_1`,
    b: [await toPng(data, ch), await toPng(await ref('deep_ocean', 0), 4), await toPng((await rawOf(SRC(1))).data, ch)],
  });
  for (const c of CANDIDATES) {
    const cfg = { ...c };
    const G = solveG(data, ch, cfg);
    const outs = [];
    for (let n = 0; n < 3; n++) {
      const { data: d } = await rawOf(SRC(n));
      outs.push(await toPng(grade(d, ch, cfg, G), ch));
    }
    const st = statsOf(grade(data, ch, cfg, G), ch);
    rows.push({
      t:
        `${c.id}  desat ${c.desat}  tint R${c.tint.r} G${c.tint.g} B${c.tint.b}  target ${c.target}` +
        `  ->  canvas lum ${f1(st.canvas.lum)}  inner ${rgbS(st.inner.rgb)} lum ${f1(st.inner.lum)}` +
        `  B/R ${(st.inner.rgb[2] / st.inner.rgb[0]).toFixed(2)}`,
      b: outs,
    });
    console.log(rows[rows.length - 1].t);
  }
  const p = await sheetCandidates(rows);
  console.log('[sheet] ' + path.relative(ROOT, p));
}

async function main(opts) {
  const cfg = { ...CFG, ...opts.override };
  console.log(`\n=== ${BIOME}  <-  ${SRC_LABEL}`);
  console.log(
    `    desat ${cfg.desat}  tint R${cfg.tint.r} G${cfg.tint.g} B${cfg.tint.b}  k ${cfg.contrastK}` +
      `  target canvas ${cfg.target} (band ${cfg.band[0]}-${cfg.band[1]})`,
  );

  const refAlpha = await alphaBytes(SRC(0)); // the ocean_0 diamond mask
  const pngs = [],
    srcPngs = [],
    rows = [];
  for (let n = 0; n < 4; n++) {
    const { data, ch } = await rawOf(SRC(n));
    const pre = statsOf(data, ch);
    const preEdge = await edgeLum(data, ch);
    const G = solveG(data, ch, cfg);
    const out = grade(data, ch, cfg, G);
    const post = statsOf(out, ch);
    const postEdge = await edgeLum(out, ch);

    let aDiff = 0,
      aMask = 0;
    for (let i = 0, p = 0; i < data.length; i += ch, p++) {
      if (data[i + 3] !== out[i + 3]) aDiff++;
      if (out[i + 3] !== refAlpha[p]) aMask++;
    }
    const eq = await edgeQuadrants(out, ch);

    pngs.push(await toPng(out, ch));
    srcPngs.push(await toPng(data, ch));
    rows.push({ n, G, pre, post, preEdge, postEdge, aDiff, aMask, eq });

    const inBand = post.canvas.lum >= cfg.band[0] && post.canvas.lum <= cfg.band[1];
    console.log(
      `  slot${n} G=${G.toFixed(4)}${inBand ? '' : '  <-- OUT OF BAND'}\n` +
        `    canvas  ${rgbS(pre.canvas.rgb)} lum ${f1(pre.canvas.lum)} sd ${f1(pre.canvas.sd)}` +
        `  ->  ${rgbS(post.canvas.rgb)} lum ${f1(post.canvas.lum)} sd ${f1(post.canvas.sd)}\n` +
        `    inner   ${rgbS(pre.inner.rgb)} lum ${f1(pre.inner.lum)} sd ${f1(pre.inner.sd)}` +
        `  ->  ${rgbS(post.inner.rgb)} lum ${f1(post.inner.lum)} sd ${f1(post.inner.sd)}` +
        `  B/R ${(post.inner.rgb[2] / post.inner.rgb[0]).toFixed(3)}\n` +
        `    edgeLum ${f1(preEdge.lum)} -> ${f1(postEdge.lum)} (n=${postEdge.n})` +
        `   alphaDiff vs source ${aDiff}   vs ocean_0 mask ${aMask}`,
    );
  }

  console.log('  [rim guard] edge band vs interior gain ratio (pointwise => must be ~1.00):');
  for (const r of rows) {
    const eR = r.postEdge.lum / r.preEdge.lum;
    const iR = r.post.inner.lum / r.pre.inner.lum;
    const rel = eR / iR;
    console.log(
      `    slot${r.n} edge x${eR.toFixed(3)} / inner x${iR.toFixed(3)} = ${rel.toFixed(3)}` +
        (Math.abs(rel - 1) > 0.12 ? '  <-- RIM WARN' : '  ok'),
    );
  }

  // ── SEAM CHECK ──
  // What can produce a seam here is NOT the grade shape (it is pointwise and
  // identical for every pixel of a slot) but the fact that G is solved PER SLOT.
  // If two neighbouring slots got noticeably different gains, their shared
  // diamond edge shows a brightness step. So the number that matters is the
  // slot-to-slot spread of the edge-band luma, measured before and after: the
  // grade must not WIDEN it.
  //
  // NOTE ON THE QUADRANTS: slots 2/3 of the ocean source are horizontal FLIPS of
  // 0/1 (verified: flop(ocean_0) alpha == ocean_2 alpha, byte-exact), so their
  // NW/NE and SW/SE quadrants are swapped by construction. Comparing them
  // un-flipped reports a ~10-unit "spread" that is the flip, not a seam — the
  // vectors are therefore printed flip-aware.
  const gs = rows.map((r) => r.G);
  const eS = rows.map((r) => r.preEdge.lum),
    eP = rows.map((r) => r.postEdge.lum);
  const spread = (v) => Math.max(...v) - Math.min(...v);
  console.log(
    `  [seam] G per slot ${gs.map((g) => g.toFixed(4)).join(' ')}  spread ${(100 * (spread(gs) / (gs[0] || 1))).toFixed(2)} %`,
  );
  console.log(
    `    edge-band luma across slots: source ${f1(Math.min(...eS))}-${f1(Math.max(...eS))} (spread ${spread(eS).toFixed(3)})` +
      `  ->  graded ${f1(Math.min(...eP))}-${f1(Math.max(...eP))} (spread ${spread(eP).toFixed(3)})` +
      `${spread(eP) > spread(eS) + 0.15 ? '  <-- SEAM WARN (grade widened the spread)' : '  ok'}`,
  );
  console.log('    per-edge-quadrant luma, flip-aware (slots 2/3 read NE NW SE SW):');
  for (const r of rows) {
    const v = r.n >= 2 ? [r.eq[1], r.eq[0], r.eq[3], r.eq[2]] : r.eq;
    console.log(`      slot${r.n} ` + v.map((x) => f1(x)).join('  '));
  }
  for (let q = 0; q < 4; q++) {
    const vs = rows.map((r) => (r.n >= 2 ? [r.eq[1], r.eq[0], r.eq[3], r.eq[2]] : r.eq)[q]);
    const sp = spread(vs);
    console.log(`      quadrant ${['NW', 'NE', 'SW', 'SE'][q]} spread ${sp.toFixed(3)}${sp > 1.5 ? '  <-- SEAM WARN' : '  ok'}`);
  }

  fs.mkdirSync(ST, { recursive: true });
  const sheets = [await sheet2x2(pngs), await sheetBeforeAfter(srcPngs, pngs), await sheetMosaic(pngs)];
  console.log('  [sheets] ' + sheets.map((p) => path.relative(ROOT, p)).join(', '));

  if (opts.integrate) {
    const { dst, written } = await integrate(pngs);
    console.log(`  [integrate] ${written.length} files -> ${path.relative(ROOT, dst)}`);
    for (let n = 0; n < 4; n++) {
      const a0 = await alphaBytes(pngs[n]);
      const a1 = await alphaBytes(path.join(dst, `${BIOME}_${n}.webp`));
      let d = 0,
        dm = 0;
      for (let i = 0; i < a0.length; i++) {
        if (a0[i] !== a1[i]) d++;
        if (a1[i] !== refAlpha[i]) dm++;
      }
      console.log(
        `    alpha round-trip slot${n}: ${d === 0 ? 'BIT-EXACT' : d + ' bytes differ'}` +
          `   vs ocean_0 mask: ${dm === 0 ? 'IDENTICAL' : dm + ' bytes differ'}`,
      );
    }
    const files = fs.readdirSync(dst);
    const missing = [];
    for (let n = 0; n < 4; n++) {
      const exp = [`${BIOME}_${n}.webp`];
      for (const m of MIPS) exp.push(`${BIOME}_${n}${m.suffix}.webp`, `${BIOME}_${n}${m.suffix}.png`);
      for (const e of exp) if (!files.includes(e)) missing.push(e);
    }
    const stale = files.filter((f) => !/^ice_shelf_[0-3](@(half|quarter|eighth))?\.(webp|png)$/.test(f));
    console.log(`    mips: ${missing.length ? 'MISSING ' + missing.join(',') : 'complete (28 files)'}`);
    console.log(`    folder: ${files.length} files${stale.length ? '  STALE: ' + stale.join(',') : ' (no strays)'}`);
  }
}

(async () => {
  const args = process.argv.slice(2);
  const arg = (name) => {
    const a = args.find((x) => x.startsWith(`--${name}=`));
    return a ? a.slice(name.length + 3) : null;
  };
  const override = {};
  if (arg('desat') !== null) override.desat = Number(arg('desat'));
  if (arg('target') !== null) override.target = Number(arg('target'));
  if (arg('k') !== null) override.contrastK = Number(arg('k'));
  if (arg('tint') !== null) {
    const [r, g, b] = arg('tint').split(',').map(Number);
    override.tint = { r, g, b };
  }
  if (args.includes('--candidates')) return candidates();
  await main({ integrate: !args.includes('--no-integrate'), override });
  console.log('\ndone');
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
