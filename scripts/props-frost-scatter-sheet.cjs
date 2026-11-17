/**
 * Review sheet — WHY THE FROST FIELD READS AS REDUNDANT, in three separated
 * levers, rendered in DEVICE PIXELS with the real propLayout mathematics.
 *
 * Output: assets/style-test/tiles/_frost_scatter-*.png + _frost_scatter_sheet.html
 * (feedback_style_test_html_location: sheets go here, never into a scratchpad.)
 *
 * ── THE BRIEF
 *
 * Rudi, 2026-09-11, on Moon Icy floor 0 after the frost props went live:
 *   "es sieht grundsätzlich gut aus, aber etwas zu gleichmäßig … es sieht jetzt
 *    sehr redundant alles aus"
 *   "das problem ist das was ich vorhin schonmal genannt hatte. alle props sind
 *    unten an der spitze positioniert. wenn die mehr auf dem tile verteilt sind
 *    wird das schon helfen"
 *   "und zusätzlich auch mal auf einer kachel zwei unterschiedliche props oder
 *    auch mal drei. generier ruhig ein paar mehr assets"
 *   "kannst du bitte noch ein paar krater auf ice verteilen?"
 *
 * Four asks, and they are NOT one problem. This sheet separates them so that
 * afterwards it is knowable which one did the work:
 *
 *   § 1  SCATTER   the ground point moves from the tile's SOUTH VERTEX to the
 *                  tile CENTRE and the jitter opens onto the DIAMOND
 *   § 2  MIXTURE   several prop FAMILIES per biome instead of one
 *   § 3  CRATERS   crater_decal wired onto the four frost grounds
 *   § 4  the two diagnoses: are four tile variants really drawn, and are the
 *        prop silhouettes distinguishable at 144x72 device pixels
 *
 * ── WHY DEVICE PIXELS, AND WHY NOTHING IS UPSCALED
 *
 * Inherited from props-crater-decal-generate.cjs and props-ice-frost-sheet.cjs,
 * where it cost a round ("es ist alles extrem pixelig … ich kann da leider kaum
 * etwas erkennen" — panels had been composed at the tile's CSS size and blown
 * up). PlanetSurface sizes its cache canvas as round(cacheW * dpr), then
 * setTransform(dpr,…) then scale(cam.zoom), so ONE TILE COVERS
 *     TW * zoom * dpr = 144 x 72 device pixels at zoom 1, dpr 3.
 * Every panel is composed at that size from full-resolution sources, and the
 * mip chain is SIMULATED rather than short-cut: spriteCache.computeMipLevel
 * picks from zoom alone, so at zoom 1 the renderer draws the @quarter mip.
 *
 * ── THE LAYOUT IS THE SHIPPED MODULE, THE DRAW GEOMETRY IS COPIED EXACTLY
 *
 * scripts/props-layout-bridge.cjs loads src/views/grid/propLayout.ts itself, so
 * the count, the key hash, the variant draw, the per-instance dx/dy and the
 * per-instance scale are the shipped code and not mirrored constants. Only the
 * DRAW geometry is reproduced here, from the prop branch of PlanetSurface.tsx
 * (:1070-1090), and it is reproduced line for line:
 *
 *   psx, psy  the tile's screen centre
 *   gx        = psx + dx * (TW/2)
 *   gyPx      = psy + (TH/2) * (1 - propGroundInset(key)) + dy * (TH/2)
 *   drawH     = PROP_BASE_HEIGHT * inst.scale       (scale carries the factor)
 *   drawW     = drawH * spriteAspect
 *   px, py    = gx - drawW/2, gyPx - drawH          (bottom-centre anchor)
 *   order     by (posX + posY), then posX, then sub
 *             sub = -Infinity for a ground-inset key, otherwise inst.dy
 *
 * every length times sc = zoom * dpr.
 *
 * ══════════════════════════════════════
 * § 1 — THE SCATTER, AND THE ARITHMETIC THAT SAYS HOW FAR IT MAY GO
 * ══════════════════════════════════════
 *
 * Today `propGroundInset` is 0 for every key except the three flat decals, so
 * EVERY standing prop's ground point is the diamond's SOUTH VERTEX and the
 * JITTER 0.28 is laid around that one point: +-6.7 px in x and +-3.4 px in y on
 * a 48x24 tile. The feet therefore sit on a lattice of tile spikes, which is
 * what a diagonal row of props is.
 *
 * The proposed model samples the foot uniformly over the tile's GROUND SQUARE
 * and projects it, which is what "verteilt auf dem tile" means geometrically.
 * With the iso basis of isoConstants.worldToScreen (sx = (wx-wy)*TW/2,
 * sy = (wx+wy)*TH/2) a world-local offset (u, v) inside the tile maps to
 *     dx = (u - v) * SPAN     dy = (u + v) * SPAN
 * and the diamond is exactly |dx| + |dy| <= 1, so any SPAN <= 1 keeps the foot
 * inside its own tile. The two existing uniform streams are reused unchanged
 * (u = dx/JITTER/2, v = dy/JITTER/2), so the layout stays deterministic and the
 * same tile keeps the same scatter.
 *
 * ── DOES THE DEPTH SORT SURVIVE IT? THE ANSWER IS YES UP TO SPAN 0.5, AND IT
 *    IS ARITHMETIC, NOT AN OPINION.
 *
 * The sort key in PlanetSurface is (posX + posY, posX, sub) and contains NO
 * screen y. So:
 *
 *  (a) THE INSET ALONE CANNOT BREAK ANYTHING. It is a uniform vertical
 *      translation applied to every standing prop, so every relative depth
 *      relation is unchanged. Moving the ground point to the tile centre is
 *      free.
 *
 *  (b) WIDENING dy IS THE PART THAT HAS A LIMIT. Take tiles A = (x, y) and
 *      B = (x+1, y): B sorts after A (posX+posY one higher) and its centre is
 *      TH/2 lower on screen. A's deepest prop sits at +SPAN*(TH/2) below A's
 *      centre, B's shallowest at -SPAN*(TH/2) below B's. B is still lower on
 *      screen — i.e. still genuinely in front — iff
 *          (1 - SPAN) * TH/2  >  SPAN * TH/2    <=>    SPAN < 0.5
 *      At SPAN = 0.5 the two coincide exactly and nothing ever inverts; above
 *      0.5 a prop in the tile BEHIND can stand lower on screen than one in the
 *      tile in front and still be painted first. For props taller than TH/2 =
 *      12 world px — which is every family except ice_grit — that is a visible
 *      wrong overlap.
 *
 *  (c) HULLS ARE UNAFFECTED. A hull keeps sub = +Infinity, so it still draws
 *      after every prop of its own cell, and props of the next depth row still
 *      draw after the hull. Neither depends on the ground point.
 *
 * So SPAN 0.5 is the recommendation: it needs the ground point and the jitter
 * shape to change and NOTHING else — no sort change, no hull change. The sheet
 * shows 0.75 and 1.00 as well, and they are labelled as needing a sort key of
 * (posX + posY + dy) first; that is a one-line change, but it is a separate
 * decision because it touches every biome's draw order.
 *
 * ⚠️ AND THE SCATTER IS GLOBAL. propGroundInset and the jitter live in
 * propThemes/propLayout, not in a biome. Changing them moves forest, the six
 * VOLCANIC biomes, the deserts — everything Rudi has already signed off. That
 * is why basalt_plain is on this sheet next to the frost biomes: the same
 * lattice exists there, and the change has to be judged there too.
 *
 * ══════════════════════════════════════
 * § 2 — THE MIXTURE
 * ══════════════════════════════════════
 *
 * Today every frost biome draws from ONE family: glacier ['ice_block',
 * 'ice_block', null], permafrost/tundra ['ice_rubble', 'ice_rubble', null].
 * Several instances on a tile are therefore several variants of one motif. The
 * precedent for the fix is already in the file — plains runs
 * [null, null, 'grass', 'bush', 'tree_leafy'], i.e. different FAMILIES plus
 * empty slots in one key array.
 *
 * Two new families were generated for this round (assets/final only — they are
 * NOT integrated and NOT wired; the sheet is what decides that):
 *   ice_grit   5 variants, factor 0.12 — the rung BELOW ice_rubble
 *   ice_spire  4 variants, factor 0.32 — the only UPRIGHT sub-sérac element
 * The reasons are in their generator headers; the short version is that the
 * per-instance scale range is PROP_SCALE_MIN 0.85 .. PROP_SCALE_MAX 1.15, so
 * size variety cannot come from the layout — only a second family with its own
 * height factor produces it.
 *
 * ══════════════════════════════════════
 * § 3 — THE CRATERS
 * ══════════════════════════════════════
 *
 * crater_decal exists (4 variants, a STRENGTH LADDER, PROP_GROUND_INSET 1.0)
 * and was built for BARREN/ASTEROIDS. Measured against the frost grounds with
 * the same sigma the family was calibrated on — the decal's deepest contrast in
 * units of the ground's own texture sd, through the full renderer chain
 * including blitPropTint — it lands INSIDE the usable band on all four, but at
 * three DIFFERENT rung pairs, because the frost grounds run from screen
 * luminance 32 to 50 while their sd barely moves. The table is in the HTML.
 * No recolour is needed: the induced B/R shift is <= 0.010 on every ground.
 *
 * Usage: node scripts/props-frost-scatter-sheet.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const L = require('./props-pipeline-lib.cjs');
const { loadPropLayout } = require('./props-layout-bridge.cjs');
sharp.cache(false);

const SHEET_DIR = path.join(L.ROOT, 'assets', 'style-test', 'tiles');
const PFX = '_frost_scatter';
const TW = L.TW, TH = L.TH, PBH = L.PROP_BASE_HEIGHT;
const DPR = 3; // Rudi's test device
const JITTER = 0.28; // propLayout's half-range; the sheet reads it back below

// ── the renderer's airless darkening (isoConstants). MOON_ICY has
//    atmosphereDensity 0, so airlessFactor(0) = 1 and terrainAlpha = 0.45:
//    the frost surfaces run DARKENED in the game. ──
const VAC_A = 0.45;
const VAC_RGB = [5, 10, 25];

/** spriteCache.computeMipLevel, reproduced. Driven by zoom alone, not by dpr. */
function mipForZoom(zoom) {
  if (zoom > 2.0) return null;
  if (zoom > 1.0) return '@half';
  if (zoom > 0.5) return '@quarter';
  return '@eighth';
}
const MIP_SCALE = { '@half': 0.5, '@quarter': 0.25, '@eighth': 0.125 };

function view(zoom, dpr = DPR) {
  const sc = zoom * dpr;
  return {
    zoom, dpr, sc,
    tw: Math.max(1, Math.round(TW * sc)),
    th: Math.max(1, Math.round(TH * sc)),
    mip: mipForZoom(zoom),
  };
}

// ══════════════════════════════════════
// raster helpers
// ══════════════════════════════════════
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function makeCanvas(W, H, bg) {
  const c = Buffer.alloc(W * H * 3);
  for (let p = 0; p < W * H; p++) { c[p * 3] = bg[0]; c[p * 3 + 1] = bg[1]; c[p * 3 + 2] = bg[2]; }
  return c;
}
function blit(canvas, W, H, buf, bw, bh, x0, y0) {
  for (let y = 0; y < bh; y++) {
    const yy = y0 + y; if (yy < 0 || yy >= H) continue;
    for (let x = 0; x < bw; x++) {
      const xx = x0 + x; if (xx < 0 || xx >= W) continue;
      const s = (y * bw + x) * 4; const a = buf[s + 3] / 255; if (a === 0) continue;
      const d = (yy * W + xx) * 3;
      for (let c = 0; c < 3; c++) canvas[d + c] = Math.round(canvas[d + c] * (1 - a) + buf[s + c] * a);
    }
  }
}
/** drawImage + the renderer's blitPropTint pass (tints at imgAlpha x t). */
function blitProp(canvas, W, H, buf, bw, bh, x0, y0, t) {
  for (let y = 0; y < bh; y++) {
    const yy = y0 + y; if (yy < 0 || yy >= H) continue;
    for (let x = 0; x < bw; x++) {
      const xx = x0 + x; if (xx < 0 || xx >= W) continue;
      const s = (y * bw + x) * 4; const a = buf[s + 3] / 255; if (a === 0) continue;
      const d = (yy * W + xx) * 3;
      for (let c = 0; c < 3; c++) {
        const C = canvas[d + c] * (1 - a) + buf[s + c] * a;
        canvas[d + c] = clamp(Math.round(C * (1 - t * a) + VAC_RGB[c] * (t * a)), 0, 255);
      }
    }
  }
}
const toPng = (canvas, W, H) =>
  sharp(canvas, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();

// ══════════════════════════════════════
// sources — every sprite from assets/final (one uniform source for shipped and
// candidate families alike, exactly as the frost sheet did)
// ══════════════════════════════════════
const finalPath = (fam, i) => path.join(L.DIR_FINAL, `${fam}_${i}.png`);

async function tileRaw(biome, slot, w, h, t, mip) {
  const mipPath = path.join(L.DIR_TILES, biome, `${biome}_${slot}${mip || ''}.webp`);
  const full = path.join(L.DIR_TILES, biome, `${biome}_${slot}.webp`);
  const src = fs.existsSync(mipPath) ? mipPath : full;
  const { data } = await sharp(src).ensureAlpha().resize(w, h, { fit: 'fill' })
    .raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let k = 0; k < out.length; k += 4)
    for (let c = 0; c < 3; c++) out[k + c] = Math.round(out[k + c] * (1 - t) + VAC_RGB[c] * t);
  return { data: out, w, h };
}

const propCache = new Map();
async function propRaw(fam, i, drawW, drawH, mip) {
  const key = `${fam}|${i}|${drawW}|${drawH}|${mip}`;
  if (propCache.has(key)) return propCache.get(key);
  const src = finalPath(fam, i);
  const m = await sharp(src).metadata();
  let img = sharp(src).ensureAlpha();
  const ms = MIP_SCALE[mip];
  if (ms) {
    img = sharp(await img.resize(Math.max(1, Math.round(m.width * ms)),
      Math.max(1, Math.round(m.height * ms)), { fit: 'fill' }).png().toBuffer()).ensureAlpha();
  }
  const { data } = await img.resize(drawW, drawH, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  propCache.set(key, Buffer.from(data));
  return propCache.get(key);
}

const aspCache = new Map();
async function aspectOf(fam, i) {
  const k = `${fam}|${i}`;
  if (!aspCache.has(k)) {
    const m = await sharp(finalPath(fam, i)).metadata();
    aspCache.set(k, m.width / m.height);
  }
  return aspCache.get(k);
}

async function panelBg(biome, t) {
  const { data } = await sharp(path.join(L.DIR_TILES, biome, `${biome}_0.webp`))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0; const s = [0, 0, 0];
  for (let k = 0; k < data.length; k += 4) {
    if (data[k + 3] < 200) continue;
    n++; for (let c = 0; c < 3; c++) s[c] += data[k + c];
  }
  return [0, 1, 2].map((c) => Math.round((s[c] / n) * (1 - t) + VAC_RGB[c] * t));
}

// ══════════════════════════════════════
// THE SCATTER MODELS — § 1
// ══════════════════════════════════════
//
// Each takes propLayout's own (dx, dy) — two independent uniform streams in
// [-JITTER, +JITTER] — and returns the (dx, dy) the renderer would use, in the
// same units (fractions of TW/2 and TH/2). Nothing is re-randomised: the
// streams stay the shipped ones, so a tile keeps its identity across rungs and
// the panels are comparable.
//
// ⚠️ THE BASELINE FLIPPED ON 2026-09-11, AND THAT IS WHY THESE LOOK INVERTED.
// The shipped propLayout now emits the DIAMOND point directly
// (dx, dy) = (u − v, u + v) at PROP_SCATTER_SPAN 1. So the rung that has to be
// reconstructed is the OLD one, not the new one, and it is reconstructed by
// inverting the projection rather than by mirroring a constant:
//     u = (dx + dy) / 2      v = (dy − dx) / 2
// and the old rectangular jitter was (2u · JITTER, 2v · JITTER). Same two
// streams, so the panels stay comparable tile for tile.
//
// FLAT DECALS pass through every rung untouched: propLayout keeps them on the
// rectangular jitter by design (their whole WIDTH has to stay on the tile), so
// there is nothing to map either way.
const SCATTER = {
  /** What shipped BEFORE the change: rectangular jitter on the south vertex. */
  today: (dx, dy) => ({ dx: (dx + dy) * JITTER, dy: (dy - dx) * JITTER }),
  /**
   * The shipped model, optionally narrowed. propLayout already hands over the
   * point in the tile's ground square at span 1, so a smaller span is a plain
   * scalar on it — |dx| + |dy| <= span <= 1, i.e. still inside the diamond.
   */
  diamond: (dx, dy, span) => ({ dx: dx * span, dy: dy * span }),
};

/**
 * An iso field, laid out by the REAL propLayout, drawn with PlanetSurface's
 * geometry, under a chosen scatter model.
 *
 * `scatter` = { inset, fn } — `inset` overrides propGroundInset for STANDING
 * props only (a key that already has an inset of 1.0 keeps it; the maximum of
 * the two is used), `fn` maps the jitter.
 */
async function fieldPanel({ biome, cfg, factors, variantCounts, hist, gField, R, C, seed, v, t, scatter }) {
  for (const k of Object.keys(require.cache))
    if (k.includes(path.join('src', 'views', 'grid'))) delete require.cache[k];
  const proposed = {}; proposed[biome] = cfg;
  const PL = loadPropLayout(proposed, variantCounts, factors);

  const W = Math.round((R + C) * (v.tw / 2) + v.tw);
  const H = Math.round((R + C) * (v.th / 2) + v.th + 8);
  const canvas = makeCanvas(W, H, await panelBg(biome, t));
  let rnd = seed >>> 0;
  const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const cum = []; let acc = 0;
  for (const q of hist) { acc += q; cum.push(acc); }
  // ── WHERE g COMES FROM, AND WHY THERE ARE TWO SOURCES ──
  //
  // `hist` draws g INDEPENDENTLY per tile. That is the right model for a
  // marginal-distribution question ("how many props per tile on average") and
  // the WRONG one for a clumping question: an i.i.d. draw has no spatial
  // structure by construction, so a panel fed from it can never show clumping
  // and can never show its absence either — it would only show the sampler.
  //
  // `gField` is the alternative and it is REAL DATA: a raster of the actual g
  // values read off the live surface endpoint for this biome. When it is given
  // the histogram is ignored and the panel lays out the field the backend
  // really produces, wrapping the raster if the panel is larger than it.
  const drawGHist = () => { const u = rand() * acc; let g = 0; while (g < cum.length - 1 && u > cum[g]) g++; return g; };
  const drawG = (r, c) =>
    gField ? gField[r % gField.length][c % gField[r % gField.length].length] : drawGHist();

  const tiles = [];
  for (let sI = 0; sI < 4; sI++) tiles.push(await tileRaw(biome, sI, v.tw, v.th, t, v.mip));
  const at = (r, c) => ({
    sx: Math.round((c - r) * (v.tw / 2) + W / 2 - v.tw / 2),
    sy: Math.round((c + r) * (v.th / 2) + 4),
  });
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const { sx, sy } = at(r, c);
      blit(canvas, W, H, tiles[(r * C + c + ((r * 7 + c * 3) % 4)) % 4].data, v.tw, v.th, sx, sy);
    }

  const items = [];
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const { sx, sy } = at(r, c);
      for (const inst of PL.propLayout(c, r, biome, drawG(r, c))) {
        const asp = await aspectOf(inst.propKey, inst.variant);
        const dh = Math.max(1, Math.round(PBH * inst.scale * v.sc));
        const dw = Math.max(1, Math.round(dh * asp));
        const keyInset = PL.propGroundInset(inst.propKey);
        const inset = Math.max(keyInset, scatter.inset);
        // Flat decals are already on their own (rectangular) jitter in the
        // shipped layout and must not be re-mapped by any rung.
        const j = keyInset > 0 ? { dx: inst.dx, dy: inst.dy } : scatter.fn(inst.dx, inst.dy);
        const psx = sx + v.tw / 2, psy = sy + v.th / 2;
        const gx = psx + j.dx * (v.tw / 2);
        const gy = psy + (v.th / 2) * (1 - inset) + j.dy * (v.th / 2);
        items.push({
          key: inst.propKey, variant: inst.variant, dw, dh,
          x: Math.round(gx - dw / 2), y: Math.round(gy - dh),
          // PlanetSurface: sub = -Infinity for an inset key, else inst.dy.
          o: (r + c) * 1e6 + c * 1e3 + (keyInset > 0 ? -1e3 : j.dy),
        });
      }
    }
  items.sort((a, b) => a.o - b.o);
  for (const it of items)
    blitProp(canvas, W, H, await propRaw(it.key, it.variant, it.dw, it.dh, v.mip), it.dw, it.dh, it.x, it.y, t);
  return toPng(canvas, W, H);
}

/**
 * § 1b — HOW BANDED IS THE FOOT-POINT SET? The number behind Rudi's "alle props
 * sind unten an der spitze positioniert".
 *
 * A nearest-neighbour distance would be the obvious metric and it is the WRONG
 * one here: it measures CLUSTERING, and moving the ground point to the tile
 * centre is a pure translation, so NN cannot see the change at all (measured:
 * identical to three decimals before and after). The perception Rudi describes
 * is not clustering, it is PHASE — every foot lands at the same offset within
 * the iso lattice, so the props line up in rows.
 *
 * So: take every foot's screen y modulo the iso row period TH/2 = 12 px (and x
 * modulo TW/2 = 24) and compute the circular concentration
 *     R = |mean of exp(2*pi*i * (pos mod period) / period)|
 * R = 1 means every prop sits on the same lattice phase — a row. R = 0 means
 * the phase is uniform and no row can form. It is scale-free, it needs no
 * threshold, and it is exactly the quantity the eye is picking up.
 */
function latticePhase(models, cfg, hist, biome, variantCounts, R = 60, C = 60) {
  const conc = (vals, per) => {
    let sr = 0, si = 0;
    for (const v of vals) { const a = (2 * Math.PI * (((v % per) + per) % per)) / per; sr += Math.cos(a); si += Math.sin(a); }
    return Math.hypot(sr, si) / vals.length;
  };
  const out = [];
  for (const [name, m] of models) {
    for (const k of Object.keys(require.cache))
      if (k.includes(path.join('src', 'views', 'grid'))) delete require.cache[k];
    const proposed = {}; proposed[biome] = cfg;
    const PL = loadPropLayout(proposed, variantCounts, {});
    let rnd = 20260911 >>> 0;
    const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const cum = []; let acc = 0;
    for (const q of hist) { acc += q; cum.push(acc); }
    const drawG = () => { const u = rand() * acc; let g = 0; while (g < cum.length - 1 && u > cum[g]) g++; return g; };
    const X = [], Y = []; let mdy = 0, mdx = 0;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const sx = (c - r) * (TW / 2), sy = (c + r) * (TH / 2);
      for (const inst of PL.propLayout(c, r, biome, drawG())) {
        const j = m.fn(inst.dx, inst.dy);
        mdy = Math.max(mdy, Math.abs(j.dy) * (TH / 2)); mdx = Math.max(mdx, Math.abs(j.dx) * (TW / 2));
        X.push(sx + j.dx * (TW / 2));
        Y.push(sy + (TH / 2) * (1 - m.inset) + j.dy * (TH / 2));
      }
    }
    out.push({ name, n: Y.length, Ry: conc(Y, TH / 2), Rx: conc(X, TW / 2), mdy, mdx });
  }
  return out;
}

/**
 * § 4b — the SILHOUETTE panel. Every variant of every frost family on one
 * ground, at the size the device really draws it, with the bare tile first.
 * The question it answers is Rudi's "redundant" at the level of the art: do the
 * five ice_rubble shapes read as five things at 144x72, or as one blob.
 */
async function silhouettePanel(fams, biome, v, t) {
  const cells = [];
  for (const { fam, n, factor } of fams)
    for (let i = 0; i < n; i++) cells.push({ fam, i, factor });
  const pad = Math.max(2, Math.round(4 * v.sc / 3));
  const CW = v.tw + pad * 2, CH = v.th + pad * 2 + Math.round(28 * v.sc);
  const W = (cells.length + 1) * CW, H = CH;
  const canvas = makeCanvas(W, H, [26, 28, 32]);
  const baseY = H - v.th - pad;
  blit(canvas, W, H, (await tileRaw(biome, 0, v.tw, v.th, t, v.mip)).data, v.tw, v.th, pad, baseY);
  for (let k = 0; k < cells.length; k++) {
    const { fam, i, factor } = cells[k];
    const g = await tileRaw(biome, (k + 1) % 4, v.tw, v.th, t, v.mip);
    const x0 = (k + 1) * CW + pad;
    blit(canvas, W, H, g.data, v.tw, v.th, x0, baseY);
    const dh = Math.max(1, Math.round(PBH * factor * v.sc));
    const dw = Math.max(1, Math.round(dh * (await aspectOf(fam, i))));
    // Drawn at the tile CENTRE so the silhouette is not clipped by the panel —
    // this panel is about the ART, the placement panels are § 1.
    blitProp(canvas, W, H, await propRaw(fam, i, dw, dh, v.mip),
      dw, dh, x0 + Math.round((v.tw - dw) / 2), baseY + Math.round(v.th / 2) - dh, t);
  }
  return toPng(canvas, W, H);
}

// ══════════════════════════════════════
// measurement
// ══════════════════════════════════════
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const vacC = (x, c) => x * (1 - VAC_A) + VAC_RGB[c] * VAC_A;

async function groundStats(biome) {
  let sr = 0, sg = 0, sb = 0, sl = 0, sl2 = 0, n = 0;
  for (let i = 0; i < 4; i++) {
    const p = path.join(L.DIR_TILES, biome, `${biome}_${i}.webp`);
    if (!fs.existsSync(p)) continue;
    const { data } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let k = 0; k < data.length; k += 4) {
      if (data[k + 3] < 250) continue;
      sr += data[k]; sg += data[k + 1]; sb += data[k + 2];
      const l = L709(data[k], data[k + 1], data[k + 2]); sl += l; sl2 += l * l; n++;
    }
  }
  if (!n) return null;
  const mean = sl / n, rm = sr / n, gm = sg / n, bm = sb / n;
  const vr = vacC(rm, 0), vg = vacC(gm, 1), vb = vacC(bm, 2);
  return { biome, mean, sd: Math.sqrt(sl2 / n - mean * mean), br: bm / rm,
    vr, vg, vb, vacLum: L709(vr, vg, vb), vacBR: vb / vr };
}

/** crater_decal's sigma on a ground — the number the family is calibrated on.
 *  Copied verbatim from props-crater-decal-generate.cjs groundEffect; verified
 *  against its published table (crater 1.14/1.44, dust_plain 2.71/4.54, …). */
async function decalSigma(i, s) {
  const { data } = await sharp(finalPath('crater_decal', i)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const G1 = [s.vr, s.vg, s.vb], refL = L709(G1[0], G1[1], G1[2]), refBR = G1[2] / G1[0];
  let minG = 9, sr = 0, sb = 0;
  for (let k = 0; k < data.length; k += 4) {
    const a8 = data[k + 3]; if (a8 === 0) continue;
    const a = a8 / 255; const tot = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const dec = G1[c] * (1 - a) + data[k + c] * a;
      tot[c] = dec * (1 - VAC_A * a) + VAC_RGB[c] * (VAC_A * a);
    }
    const gain = L709(tot[0], tot[1], tot[2]) / refL;
    if (gain < minG) minG = gain;
    sr += tot[0]; sb += tot[2];
  }
  return { sigma: ((1 - minG) * refL) / Math.max(1e-6, s.sd * (1 - VAC_A)), dBR: sb / sr - refBR };
}

/**
 * § 4a — ARE THE FOUR TILE VARIANTS REALLY FOUR TILES?
 *
 * The surface endpoint hands every cell a `v` in 0..3 and spriteCache looks the
 * slot up without a clamp or a modulo, so the DATA path can only be wrong if
 * `v` itself is degenerate — measured on the live endpoint it is not (uniform
 * 24.2..25.8 % per slot on every frost biome, no spatial structure). That
 * leaves the other possibility: the four FILES are four files but not four
 * pictures.
 *
 * The metric is the one LESSONS § 8 settles on — NCC after a high pass
 * (blur r6), because the raw NCC measures shared LIGHTING and two featureless
 * tiles reach 0.997 without being related. Threshold for "same source": 0.12.
 * Each pair is measured twice, direct and against the horizontally flopped
 * partner, because the ICE corpus builds slots 2/3 as horizontal mirrors.
 */
async function slotTwins(biome) {
  const { blurOpaque } = require('./lib-grain.cjs');
  const load = async (i, flip) => {
    let s = sharp(path.join(L.DIR_TILES, biome, `${biome}_${i}.webp`)).ensureAlpha();
    if (flip) s = sharp(await s.flop().png().toBuffer()).ensureAlpha();
    const { data, info } = await s.raw().toBuffer({ resolveWithObject: true });
    const n = info.width * info.height, lum = new Float64Array(n), al = new Uint8Array(n);
    for (let k = 0; k < n; k++) { lum[k] = L709(data[k * 4], data[k * 4 + 1], data[k * 4 + 2]); al[k] = data[k * 4 + 3]; }
    const bl = blurOpaque(lum, al, info.width, info.height, 6);
    const hp = new Float64Array(n);
    for (let k = 0; k < n; k++) hp[k] = lum[k] - bl[k];
    return { hp, al };
  };
  const ncc = (a, b) => {
    let n = 0, sa = 0, sb = 0;
    for (let k = 0; k < a.hp.length; k++) { if (a.al[k] < 250 || b.al[k] < 250) continue; sa += a.hp[k]; sb += b.hp[k]; n++; }
    const ma = sa / n, mb = sb / n; let num = 0, da = 0, db = 0;
    for (let k = 0; k < a.hp.length; k++) {
      if (a.al[k] < 250 || b.al[k] < 250) continue;
      const x = a.hp[k] - ma, y = b.hp[k] - mb; num += x * y; da += x * x; db += y * y;
    }
    return num / Math.sqrt(da * db);
  };
  const P = [], F = [];
  for (let i = 0; i < 4; i++) { P.push(await load(i, false)); F.push(await load(i, true)); }
  let worst = 0, wp = '', mirrored = false;
  const cells = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const c = Math.abs(ncc(P[i], P[j])), cf = Math.abs(ncc(P[i], F[j]));
    cells.push({ pair: `${i}${j}`, direct: c, mirror: cf });
    if (Math.max(c, cf) > worst) { worst = Math.max(c, cf); wp = `${i}–${j}`; mirrored = cf > c; }
  }
  return { biome, worst, wp, mirrored, cells };
}

/** Family stats over the shipped variants: level, hue, blowout. */
async function famStats(fam, n) {
  let c = 0, sl = 0, sr = 0, sb = 0, blow = 0;
  for (let i = 0; i < n; i++) {
    const f = finalPath(fam, i); if (!fs.existsSync(f)) continue;
    const { data } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let k = 0; k < data.length; k += 4) {
      if (data[k + 3] < 200) continue;
      const l = L709(data[k], data[k + 1], data[k + 2]);
      c++; sl += l; sr += data[k]; sb += data[k + 2]; if (l > 200) blow++;
    }
  }
  return { lum: sl / c, BR: sb / sr, blow: (100 * blow) / c };
}

/**
 * § 4b — SHAPE descriptors at the REAL device draw size, which is the whole
 * point: a metric taken on the 400 px source answers a question nobody asked.
 * Each sprite is put through the mip chain to its draw size, then measured on
 * the resulting ALPHA mask.
 *   fill  = painted share of the bounding box
 *   A/h^2 = a rotation-invariant bulk measure (LESSONS § 8: the one that caught
 *           a re-sculpt where the silhouette IoU could not)
 *   IoU   = worst pairwise silhouette overlap inside the family, both sprites
 *           scaled into a common box — how alike the two most alike members are
 */
async function shapeAtDrawSize(fam, n, factor, v) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const asp = await aspectOf(fam, i);
    const dh = Math.max(1, Math.round(PBH * factor * v.sc));
    const dw = Math.max(1, Math.round(dh * asp));
    const buf = await propRaw(fam, i, dw, dh, v.mip);
    let on = 0; const mask = new Uint8Array(dw * dh);
    for (let k = 0; k < dw * dh; k++) { const a = buf[k * 4 + 3] > 96 ? 1 : 0; mask[k] = a; on += a; }
    out.push({ i, dw, dh, asp, fill: on / (dw * dh), Ah2: on / (dh * dh), mask });
  }
  // pairwise IoU on a common 64x64 box (aspect preserved by stretching to the
  // box — we are asking about SHAPE, and both members get the same treatment)
  const S = 64;
  const norm = out.map((o) => {
    const m = new Uint8Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const sx = Math.min(o.dw - 1, Math.floor((x * o.dw) / S));
      const sy = Math.min(o.dh - 1, Math.floor((y * o.dh) / S));
      m[y * S + x] = o.mask[sy * o.dw + sx];
    }
    return m;
  });
  let worst = 0, wp = '';
  const ious = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    let inter = 0, uni = 0;
    for (let k = 0; k < S * S; k++) { const p = norm[a][k], q = norm[b][k]; if (p && q) inter++; if (p || q) uni++; }
    const iou = uni ? inter / uni : 0;
    ious.push(iou);
    if (iou > worst) { worst = iou; wp = `${a}-${b}`; }
  }
  return { rows: out.map(({ mask, ...r }) => r), worstIoU: worst, worstPair: wp,
    meanIoU: ious.reduce((s, x) => s + x, 0) / ious.length };
}

// ══════════════════════════════════════
// the measured g histograms (MOON_ICY, 1 064 960 cells, 2026-09-11)
// ══════════════════════════════════════
/**
 * SUPERSEDED — the distribution the frost props were calibrated against
 * (MOON_ICY, 1 064 960 cells, 2026-09-11 morning). Kept because every published
 * frost number stands on it, and because the new one is only readable as a
 * CHANGE against it.
 */
const G_HIST_OLD = {
  glacier: [75.0, 18.0, 6.0, 0.9, 0.0, 0.0, 0.0],
  permafrost: [75.1, 17.9, 6.0, 1.0, 0.0, 0.0, 0.0],
  tundra: [39.9, 35.1, 18.1, 6.0, 1.0, 0.0, 0.0],
  frozen_lake: [79.4, 15.1, 5.5, 0.0, 0.0, 0.0, 0.0],
  crevasse: [75.5, 17.6, 6.1, 0.8, 0.0, 0.0, 0.0],
  basalt_plain: [50.5, 33.6, 10.1, 4.2, 1.7, 0.0, 0.0],
};

/**
 * CURRENT — re-measured after the backend cut the frost zero share (Rudi:
 * "backend hat für die ersten 4 mit 75% auf 30% und frozen lake auf 40% g=0
 * reduziert"). Filled from the live endpoint; see the report for the census.
 */
const G_HIST = {
  // Re-measured 2026-09-11 evening over 184 320 live cells (45 windows of
  // 64x64) on the same MOON_ICY. Means: glacier 1.090 · permafrost 1.081 ·
  // tundra 0.934 (untouched) · frozen_lake 0.768 · crevasse 1.175.
  //
  // TWO THINGS THE DENSITY ARITHMETIC HAS TO KNOW. (1) The mean roughly TRIPLED
  // on the four changed biomes and g = 1 is now the modal value, not g = 0.
  // (2) g IS CAPPED WELL BELOW MAX_G on this body: 0..3 on glacier /
  // permafrost / crevasse, 0..2 on frozen_lake, and only tundra reaches g = 4
  // (1.0 %). g = 5 and g = 6 do not occur at all, so the top of every band is
  // unreachable here and the count a biome really gets is decided by the g = 0
  // and g = 1 rows.
  glacier: [29.55, 40.04, 22.22, 8.18, 0.0, 0.0, 0.0],
  permafrost: [29.96, 40.13, 21.76, 8.14, 0.0, 0.0, 0.0],
  tundra: [39.77, 35.11, 18.11, 6.01, 1.0, 0.0, 0.0],
  frozen_lake: [40.5, 42.23, 17.27, 0.0, 0.0, 0.0, 0.0],
  // n = 177 only — crevasse is 0.1 % of this moon, so this row is the weakest
  // of the six and its rung should not be pinned on it alone.
  crevasse: [30.51, 29.94, 31.07, 8.47, 0.0, 0.0, 0.0],
  // The ARID regime, for the legacy control biome (measured 2026-09-08 over
  // 331 776 cells; mean 0.73).
  basalt_plain: [50.5, 33.6, 10.1, 4.2, 1.7, 0.0, 0.0],
};

const SHIPPED = { ice_block: 4, ice_rubble: 5, crater_decal: 4, ice_grit: 5, ice_spire: 4,
  basalt_column: 5, rock_ash: 5, charred_tree: 5 };
const FACTORS = { ice_grit: 0.12, ice_spire: 0.32 }; // candidates only; the rest come from propThemes

// ══════════════════════════════════════
// configurations
// ══════════════════════════════════════
/** What ships right now. */
const TODAY = {
  glacier: { keys: ['ice_block', 'ice_block', null], minCount: 2, maxCount: 4, minG: 0 },
  permafrost: { keys: ['ice_rubble', 'ice_rubble', null], minCount: 2, maxCount: 4, minG: 0 },
  tundra: { keys: ['ice_rubble', 'ice_rubble', null], minCount: 2, maxCount: 4 },
  crevasse: { keys: ['ice_block'], minCount: 1, maxCount: 2 },
  basalt_plain: {
    keys: ['basalt_column', 'basalt_column', 'rock_ash', 'basalt_column', 'charred_tree'],
    minCount: 1, maxCount: 4,
  },
};

/**
 * WIRED IN THIS ROUND — only families that exist under src/assets/props.
 * ice_grit and ice_spire are candidates in assets/final and are deliberately
 * NOT in here: propVariantCount would return 0 for them, propLayout would fall
 * back to ASSUMED_VARIANTS and getPropImage would silently draw nothing, and
 * propLayout.test.ts pins variant contiguity for every CONFIGURED key.
 * Key arrays stay ODD (5 / 3) per the KEY-ARRAY LENGTH rule.
 */
const WIRED = {
  glacier: { keys: ['ice_block', 'ice_block', 'ice_block', 'crater_decal', null], minCount: 2, maxCount: 4, minG: 0, variants: { crater_decal: [0, 1] } },
  permafrost: { keys: ['ice_rubble', 'ice_rubble', 'ice_rubble', 'crater_decal', null], minCount: 2, maxCount: 4, minG: 0, variants: { crater_decal: [2, 3] } },
  tundra: { keys: ['ice_rubble', 'ice_rubble', 'ice_rubble', 'crater_decal', null], minCount: 2, maxCount: 4, variants: { crater_decal: [2, 3] } },
  crevasse: { keys: ['ice_block', 'ice_block', 'crater_decal'], minCount: 1, maxCount: 2, variants: { crater_decal: [1, 2] } },
};

/**
 * THE FULL PROPOSAL — needs ice_grit + ice_spire integrated first, and it comes
 * as a LADDER because the count is a separate decision from the mixture.
 * Rudi asked for "auch mal zwei oder drei", which is a distribution and not a
 * mean, so the three rungs differ ONLY in the band and the number of empty
 * slots — the family shares are held constant across them.
 *   A  band 2..4, one null   the conservative rung: barely more than today
 *   B  band 3..5, two nulls  RECOMMENDED — mean ~2.1, a third of tiles carry 3+
 *   C  band 3..5, one null   the dense rung: almost no bare ground left
 * Key arrays stay ODD (7) in every rung; null sentinels count (KEY-ARRAY LENGTH).
 *
 * glacier keeps THREE ice_block slots on purpose. The séracs are the biome's
 * identity (PLAN § 4: the tile is deliberately flat because the props carry the
 * relief), and at 3/7 of the instances the block count lands at 1.3 per tile,
 * i.e. where the approved configuration already had it (1.374). Cutting it to
 * 2/7 would have thinned the one element glacier is named for in the name of
 * variety.
 */
const MIX_KEYS = {
  glacier: ['ice_block', 'ice_block', 'ice_rubble', 'ice_block', 'ice_grit', 'crater_decal', null],
  permafrost: ['ice_rubble', 'ice_grit', 'ice_spire', 'ice_grit', 'ice_rubble', 'crater_decal', null],
  tundra: ['ice_rubble', 'ice_grit', 'ice_spire', 'ice_grit', 'ice_rubble', 'crater_decal', null],
};
/** rung B swaps one family slot for a second empty slot — same length, same order. */
const MIX_KEYS_B = {
  // glacier keeps crater_decal in rung B and gives up ice_grit instead: on a
  // lum-82.9 ground the grit (72.5) is 0.87x the ground, i.e. DARKER than what
  // it lies on — see the tone note in the report. The three blocks stay.
  glacier: ['ice_block', 'ice_block', 'ice_block', 'ice_rubble', 'crater_decal', null, null],
  permafrost: ['ice_rubble', 'ice_grit', 'ice_spire', 'ice_grit', 'crater_decal', null, null],
  tundra: ['ice_rubble', 'ice_grit', 'ice_spire', 'ice_grit', 'crater_decal', null, null],
};
const RUNG = {
  glacier: { minG: 0, variants: { crater_decal: [0, 1] } },
  permafrost: { minG: 0, variants: { crater_decal: [2, 3] } },
  tundra: { variants: { crater_decal: [2, 3] } },
};
const mix = (b, keys, min, max) => ({ keys, minCount: min, maxCount: max, ...RUNG[b] });
const MIXED_A = {
  glacier: mix('glacier', MIX_KEYS.glacier, 2, 4),
  permafrost: mix('permafrost', MIX_KEYS.permafrost, 2, 4),
  tundra: mix('tundra', MIX_KEYS.tundra, 2, 4),
  crevasse: { keys: ['ice_block', 'ice_rubble', 'crater_decal'], minCount: 1, maxCount: 2, variants: { crater_decal: [1, 2] } },
};
const MIXED = {
  glacier: mix('glacier', MIX_KEYS_B.glacier, 3, 5),
  permafrost: mix('permafrost', MIX_KEYS_B.permafrost, 3, 5),
  tundra: mix('tundra', MIX_KEYS_B.tundra, 3, 5),
  crevasse: MIXED_A.crevasse,
};
const MIXED_C = {
  glacier: mix('glacier', MIX_KEYS.glacier, 3, 5),
  permafrost: mix('permafrost', MIX_KEYS.permafrost, 3, 5),
  tundra: mix('tundra', MIX_KEYS.tundra, 3, 5),
  crevasse: MIXED_A.crevasse,
};

// ══════════════════════════════════════
// count arithmetic (countForG from propLayout, tabulated)
// ══════════════════════════════════════
function countTable(min, max, minG) {
  return Array.from({ length: 7 }, (_, g) =>
    g < minG ? 0 : Math.round(min + (max - min) * ((Math.min(6, g) - minG) / (6 - minG))));
}
/**
 * Exact distribution of the DRAWN prop count for a config: for each g the layout
 * draws `count` instances and each independently survives with probability
 * (non-null keys / keys). Binomial per g, weighted by the g histogram.
 */
function countStats(cfg, hist) {
  const counts = countTable(cfg.minCount, cfg.maxCount, cfg.minG ?? 1);
  const p = cfg.keys.filter((k) => k !== null).length / cfg.keys.length;
  const perKey = {};
  for (const k of new Set(cfg.keys.filter(Boolean))) perKey[k] = 0;
  let mean = 0, bare = 0, two = 0, three = 0;
  for (let g = 0; g < 7; g++) {
    const w = (hist[g] ?? 0) / 100; if (!w) continue;
    const n = counts[g];
    mean += w * n * p;
    bare += w * Math.pow(1 - p, n);
    let ge2 = 0, ge3 = 0;
    for (let k = 0; k <= n; k++) {
      let c = 1; for (let j = 0; j < k; j++) c = (c * (n - j)) / (j + 1);
      const pr = c * Math.pow(p, k) * Math.pow(1 - p, n - k);
      if (k >= 2) ge2 += pr; if (k >= 3) ge3 += pr;
    }
    two += w * ge2; three += w * ge3;
    for (const k of Object.keys(perKey))
      perKey[k] += w * n * (cfg.keys.filter((x) => x === k).length / cfg.keys.length);
  }
  return { counts: counts.join(','), mean, bare: 100 * bare, two: 100 * two, three: 100 * three, perKey };
}

// ══════════════════════════════════════
// the run
// ══════════════════════════════════════
async function main() {
  fs.mkdirSync(SHEET_DIR, { recursive: true });
  let removed = 0;
  for (const f of fs.readdirSync(SHEET_DIR))
    if (f.startsWith(`${PFX}-`)) { fs.unlinkSync(path.join(SHEET_DIR, f)); removed++; }
  if (removed) console.log(`[sheet] removed ${removed} panels from the previous run`);

  const wrote = [];
  const w = async (name, buf) => {
    fs.writeFileSync(path.join(SHEET_DIR, `${PFX}-${name}.png`), buf); wrote.push(name);
  };

  const NEAR = view(1);   // tile 144x72 device px, mip @quarter — the build view
  const FAR = view(0.5);  // tile  72x36,            mip @eighth  — the overview
  const SEED = 20260911;

  // ── § 1 SCATTER LADDER ──
  const RUNGS = [
    ['today', { inset: 0, fn: SCATTER.today }],
    ['centre', { inset: 1, fn: SCATTER.today }],
    ['dia50', { inset: 1, fn: (dx, dy) => SCATTER.diamond(dx, dy, 0.5) }],
    ['dia75', { inset: 1, fn: (dx, dy) => SCATTER.diamond(dx, dy, 0.75) }],
    ['dia100', { inset: 1, fn: (dx, dy) => SCATTER.diamond(dx, dy, 1.0) }],
  ];
  for (const biome of ['permafrost', 'glacier', 'basalt_plain'])
    for (const [tag, scatter] of RUNGS) {
      await w(`sc-${biome}-${tag}`, await fieldPanel({
        biome, cfg: TODAY[biome], factors: FACTORS, variantCounts: SHIPPED,
        hist: G_HIST[biome], R: 6, C: 6, seed: SEED, v: NEAR, t: VAC_A, scatter }));
      await w(`sc-far-${biome}-${tag}`, await fieldPanel({
        biome, cfg: TODAY[biome], factors: FACTORS, variantCounts: SHIPPED,
        hist: G_HIST[biome], R: 11, C: 11, seed: SEED, v: FAR, t: VAC_A, scatter }));
    }

  // ── § 2/§ 3 the three configurations, each under today's scatter AND the
  //    recommended one, so the two levers are never confounded ──
  const DIA50 = { inset: 1, fn: (dx, dy) => SCATTER.diamond(dx, dy, 0.5) };
  const TODAY_SC = { inset: 0, fn: SCATTER.today };
  const CFGS = [['today', TODAY], ['wired', WIRED], ['mixedA', MIXED_A], ['mixed', MIXED], ['mixedC', MIXED_C]];
  for (const biome of ['permafrost', 'glacier', 'tundra', 'crevasse'])
    for (const [ctag, table] of CFGS) {
      if (!table[biome]) continue;
      for (const [stag, sc] of [['old', TODAY_SC], ['new', DIA50]]) {
        await w(`cfg-${biome}-${ctag}-${stag}`, await fieldPanel({
          biome, cfg: table[biome], factors: FACTORS, variantCounts: SHIPPED,
          hist: G_HIST[biome], R: 6, C: 6, seed: SEED, v: NEAR, t: VAC_A, scatter: sc }));
      }
      await w(`cfg-far-${biome}-${ctag}`, await fieldPanel({
        biome, cfg: table[biome], factors: FACTORS, variantCounts: SHIPPED,
        hist: G_HIST[biome], R: 11, C: 11, seed: SEED, v: FAR, t: VAC_A, scatter: DIA50 }));
    }

  // ── § 4b SILHOUETTES at the real device draw size ──
  const FAMS = [
    { fam: 'ice_block', n: 4, factor: 0.45 },
    { fam: 'ice_rubble', n: 5, factor: 0.2 },
    { fam: 'ice_spire', n: 4, factor: 0.32 },
    { fam: 'ice_grit', n: 5, factor: 0.12 },
  ];
  await w('sil-permafrost', await silhouettePanel(FAMS, 'permafrost', NEAR, VAC_A));
  await w('sil-glacier', await silhouettePanel(FAMS, 'glacier', NEAR, VAC_A));
  await w('sil-far-permafrost', await silhouettePanel(FAMS, 'permafrost', FAR, VAC_A));
  // the art on trial, native 400 px
  for (const { fam, n } of FAMS)
    for (let i = 0; i < n; i++) {
      const f = finalPath(fam, i); if (!fs.existsSync(f)) continue;
      const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const canvas = makeCanvas(info.width, info.height, [98, 96, 92]);
      blit(canvas, info.width, info.height, data, info.width, info.height, 0, 0);
      await w(`src-${fam}-${i}`, await toPng(canvas, info.width, info.height));
    }

  // ── § 3 the crater rungs on each frost ground, one tile per variant ──
  for (const biome of ['glacier', 'crevasse', 'tundra', 'permafrost']) {
    const pad = Math.max(2, Math.round(4 * NEAR.sc / 3));
    const CW = NEAR.tw + pad * 2, H = NEAR.th + pad * 2;
    const W = 5 * CW;
    const canvas = makeCanvas(W, H, [26, 28, 32]);
    blit(canvas, W, H, (await tileRaw(biome, 0, NEAR.tw, NEAR.th, VAC_A, NEAR.mip)).data, NEAR.tw, NEAR.th, pad, pad);
    for (let i = 0; i < 4; i++) {
      const g = await tileRaw(biome, (i + 1) % 4, NEAR.tw, NEAR.th, VAC_A, NEAR.mip);
      const x0 = (i + 1) * CW + pad;
      blit(canvas, W, H, g.data, NEAR.tw, NEAR.th, x0, pad);
      // crater_decal is a flat decal: PROP_GROUND_INSET 1.0 = the tile centre.
      const factor = [0.386, 0.471, 0.557, 0.617][i];
      const dh = Math.max(1, Math.round(PBH * factor * NEAR.sc));
      const dw = Math.max(1, Math.round(dh * (await aspectOf('crater_decal', i))));
      blitProp(canvas, W, H, await propRaw('crater_decal', i, dw, dh, NEAR.mip),
        dw, dh, x0 + Math.round((NEAR.tw - dw) / 2), pad + Math.round(NEAR.th / 2) - dh, VAC_A);
    }
    await w(`dec-${biome}`, await toPng(canvas, W, H));
  }

  // ══════════════════════════════════════
  // numbers
  // ══════════════════════════════════════
  const gs = {};
  const ICE = ['glacier', 'permafrost', 'tundra', 'crevasse', 'frozen_lake'];
  for (const b of [...ICE, 'crater', 'regolith', 'dust_plain']) gs[b] = await groundStats(b);

  const sigmaRows = [];
  for (const b of [...ICE, 'crater', 'regolith', 'dust_plain']) {
    const s = gs[b]; if (!s) continue;
    const cells = [];
    for (let i = 0; i < 4; i++) cells.push(await decalSigma(i, s));
    sigmaRows.push({ b, sd: s.sd, vacLum: s.vacLum, cells });
  }

  const famRows = [];
  for (const { fam, n, factor } of FAMS)
    famRows.push({ fam, n, factor, st: await famStats(fam, n),
      shape: await shapeAtDrawSize(fam, n, factor, NEAR) });

  // Every configuration is costed against BOTH histograms and BOTH minG
  // settings. The minG column is the decision the backend change reopened:
  // `minG: 0` exists only because three quarters of the frost field used to be
  // g = 0 and would otherwise have been bare. With the new distribution that
  // premise is gone, and minG 0 additionally COLLAPSES g = 0 and g = 1 onto the
  // same count — which is exactly the reason tundra was never given it.
  const densRows = [];
  for (const [ctag, table] of CFGS)
    for (const biome of ['glacier', 'permafrost', 'tundra', 'crevasse']) {
      if (!table[biome]) continue;
      for (const [htag, H] of [['neu', G_HIST], ['alt', G_HIST_OLD]])
        for (const mg of [0, 1]) {
          const cfg = { ...table[biome], minG: mg };
          densRows.push({ ctag, biome, htag, mg, cfg, shipped: (table[biome].minG ?? 1) === mg,
            ...countStats(cfg, H[biome]) });
        }
    }

  const twinRows = [];
  for (const b of ['tundra', 'permafrost', 'ice_shelf', 'glacier', 'crevasse', 'frozen_lake', 'forest', 'regolith'])
    if (fs.existsSync(path.join(L.DIR_TILES, b))) twinRows.push(await slotTwins(b));

  const phaseRows = latticePhase(RUNGS.map(([t, sc]) => [t, sc]), TODAY.permafrost,
    G_HIST.permafrost, 'permafrost', SHIPPED);

  writeHtml(wrote, sigmaRows, famRows, densRows, gs, phaseRows, twinRows);
  console.log(`[sheet] ${wrote.length} panels at device resolution, no nearest-neighbour upscaling`);
  console.log(`[sheet] ${path.join(SHEET_DIR, `${PFX}_sheet.html`)}`);
}

function writeHtml(wrote, sigmaRows, famRows, densRows, gs, phaseRows, twinRows) {
  const img = (n, cap) => wrote.includes(n)
    ? `<figure class="cell"><img src="${PFX}-${n}.png" alt="${n}"><figcaption>${cap || n}</figcaption></figure>`
    : `<figure class="cell miss"><figcaption>${cap || n} — fehlt</figcaption></figure>`;
  const row = (cells) => `<div class="scroll"><div class="row">${cells.join('')}</div></div>`;

  const scatterBlock = (biome, label) => `
<h3>${label}</h3>
${row(['today', 'centre', 'dia50', 'dia75', 'dia100'].map((t, i) =>
    img(`sc-${biome}-${t}`, ['<b>1 · heute</b> — Südspitze, Rechteck ±0.28',
      '<b>2 · Mitte</b> — Fußpunkt Kachelmitte, gleiche Streuung',
      '<b>3 · Raute 0.5</b> — EMPFEHLUNG, Tiefensortierung hält',
      '4 · Raute 0.75 — braucht neuen Sortierschlüssel',
      '5 · Raute 1.00 — ganze Kachel, braucht neuen Sortierschlüssel'][i])))}
${row(['today', 'centre', 'dia50', 'dia75', 'dia100'].map((t) =>
    img(`sc-far-${biome}-${t}`, `Übersicht (zoom 0.5) — ${t}`)))}`;

  const cfgBlock = (biome) => `
<h3>${biome}</h3>
${row(['today', 'wired', 'mixedA', 'mixed', 'mixedC'].flatMap((c) => [
    img(`cfg-${biome}-${c}-old`, `${c} · <b>alte</b> Streuung`),
    img(`cfg-${biome}-${c}-new`, `${c} · <b>neue</b> Streuung (Raute 0.5)`),
  ]))}
${row(['today', 'wired', 'mixedA', 'mixed', 'mixedC'].map((c) => img(`cfg-far-${biome}-${c}`, `Übersicht — ${c}, neue Streuung`)))}`;

  const sigmaTable = `
<table><thead><tr><th>Grund</th><th>eigene sd</th><th>vacLum</th>
<th>σ v0</th><th>σ v1</th><th>σ v2</th><th>σ v3</th><th>ΔB/R (v2)</th><th>verdrahtete Sprossen</th></tr></thead><tbody>
${sigmaRows.map((r) => {
    const wired = { glacier: '[0, 1]', permafrost: '[2, 3]', tundra: '[2, 3]', crevasse: '[1, 2]',
      frozen_lake: '— kein Eintrag', crater: '[2, 3] (Bestand)', regolith: '[1, 2] (Bestand)',
      dust_plain: '[0, 1] (Bestand)' }[r.b] || '';
    return `<tr><td>${r.b}</td><td class="n">${r.sd.toFixed(1)}</td><td class="n">${r.vacLum.toFixed(1)}</td>` +
      r.cells.map((c) => `<td class="n ${c.sigma < 0.7 ? 'warn' : c.sigma > 1.9 ? 'warn' : 'ok'}">${c.sigma.toFixed(2)}</td>`).join('') +
      `<td class="n">${r.cells[2].dBR.toFixed(3)}</td><td>${wired}</td></tr>`;
  }).join('\n')}
</tbody></table>`;

  const famTable = `
<table><thead><tr><th>Familie</th><th>n</th><th>Faktor</th><th>drawH (CSS / Gerät)</th>
<th>drawW Gerät</th><th>lum</th><th>B/R</th><th>Blowout</th><th>A/h² Spanne</th>
<th>IoU Ø</th><th>IoU schlechtestes Paar</th></tr></thead><tbody>
${famRows.map((f) => {
    const dh = PBH * f.factor;
    const dws = f.shape.rows.map((r) => r.dw);
    const ah = f.shape.rows.map((r) => r.Ah2);
    return `<tr><td>${f.fam}</td><td class="n">${f.n}</td><td class="n">${f.factor}</td>` +
      `<td class="n">${dh.toFixed(1)} / ${(dh * 3).toFixed(0)}</td>` +
      `<td class="n">${Math.min(...dws)}–${Math.max(...dws)}</td>` +
      `<td class="n">${f.st.lum.toFixed(1)}</td><td class="n">${f.st.BR.toFixed(3)}</td>` +
      `<td class="n ${f.st.blow > 0.5 ? 'warn' : 'ok'}">${f.st.blow.toFixed(2)} %</td>` +
      `<td class="n">${Math.min(...ah).toFixed(2)}–${Math.max(...ah).toFixed(2)}</td>` +
      `<td class="n">${f.shape.meanIoU.toFixed(2)}</td>` +
      `<td class="n ${f.shape.worstIoU > 0.75 ? 'warn' : 'ok'}">${f.shape.worstIoU.toFixed(2)} (${f.shape.worstPair})</td></tr>`;
  }).join('\n')}
</tbody></table>`;

  const PHASE_NOTE = {
    today: 'Südspitze, Rechteck ±0.28 — <b>ausgeliefert</b>',
    centre: 'Fußpunkt Mitte, gleiche Streuung — reine Verschiebung',
    dia50: 'Raute 0.5 — <b>ohne Renderer-Risiko</b>, Sortierung hält',
    dia75: 'Raute 0.75 — braucht Sortierschlüssel (posX+posY+dy)',
    dia100: 'Raute 1.00 = ganzes Bodenquadrat — braucht denselben Schlüssel',
  };
  const phaseTable = `
<table><thead><tr><th>Modell</th><th>Fußpunkte</th><th>R (y mod 12 px)</th><th>R (x mod 24 px)</th>
<th>max |dy|</th><th>max |dx|</th><th></th></tr></thead><tbody>
${phaseRows.map((r) => `<tr><td>${r.name}</td><td class="n">${r.n}</td>` +
    `<td class="n ${r.Ry > 0.3 ? 'warn' : 'ok'}"><b>${r.Ry.toFixed(3)}</b></td>` +
    `<td class="n ${r.Rx > 0.3 ? 'warn' : 'ok'}">${r.Rx.toFixed(3)}</td>` +
    `<td class="n">${r.mdy.toFixed(1)} px</td><td class="n">${r.mdx.toFixed(1)} px</td>` +
    `<td>${PHASE_NOTE[r.name] || ''}</td></tr>`).join('\n')}
</tbody></table>
<p><b>R</b> ist die Gitterphase der Fußpunkte: 1 = jeder Prop auf derselben Phase der Iso-Zeile
(= eine Reihe), 0 = Phase gleichverteilt, es kann keine Reihe entstehen. Eine
Nächster-Nachbar-Distanz wäre hier das falsche Maß — sie misst BALLUNG, und der Wechsel zur
Kachelmitte ist eine reine Verschiebung, die sie auf drei Stellen gar nicht sieht (gemessen:
identisch). Die Reihung ist keine Ballung, sie ist <b>Phase</b>.</p>
<div class="note"><b>Und das ist der Befund, der die Empfehlung verschiebt.</b>
Der Fußpunkt allein bringt <b>nichts</b> (0.503 → 0.503, exakt, es ist eine Verschiebung).
Raute 0.5 nimmt nur ein Drittel der Reihung weg (0.503 → 0.348). Erst <b>Raute 0.75 löscht sie</b>
(0.053) und Raute 1.00 vollends (0.007). Die wirksame Sprosse liegt also <b>über</b> der Grenze,
bis zu der die heutige Tiefensortierung trägt — sie braucht den Sortierschlüssel
<code>posX + posY + dy</code> (Hüllen auf <code>posX + posY + 1</code>, Aufleger davor). Das ist
klein, aber es ist eine Renderer-Änderung und gehört Rudi vorgelegt, nicht nebenbei gemacht.</div>`;

  const densTable = `
<table><thead><tr><th>Konfig</th><th>Biom</th><th>g-Vert.</th><th>minG</th><th>Schlüssel</th><th>Band</th><th>counts g0..g6</th>
<th>Props je Kachel</th><th>leer</th><th>≥2</th><th>≥3</th><th>je Familie</th></tr></thead><tbody>
${densRows.map((d) => `<tr class="${d.ctag}${d.htag === 'alt' ? ' old' : ''}"><td>${d.ctag}</td><td>${d.biome}</td>` +
    `<td>${d.htag}</td><td class="n">${d.mg}${d.shipped ? ' *' : ''}</td>` +
    `<td class="k">[${d.cfg.keys.map((k) => (k === null ? 'null' : k)).join(', ')}]</td>` +
    `<td class="n">${d.cfg.minCount}..${d.cfg.maxCount}</td>` +
    `<td class="n">${d.counts}</td><td class="n"><b>${d.mean.toFixed(2)}</b></td>` +
    `<td class="n">${d.bare.toFixed(1)} %</td><td class="n">${d.two.toFixed(1)} %</td>` +
    `<td class="n">${d.three.toFixed(1)} %</td>` +
    `<td class="k">${Object.entries(d.perKey).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')}</td></tr>`).join('\n')}
</tbody></table>`;

  const html = `<!doctype html><meta charset="utf-8">
<title>Frost — Streuung, Mischung, Krater</title>
<style>
 body{background:#111418;color:#dfe3e8;font:14px/1.55 system-ui,sans-serif;margin:0;padding:24px 28px 80px}
 h1{font-size:22px;margin:0 0 4px} h2{font-size:18px;margin:38px 0 6px;border-bottom:1px solid #2a2f36;padding-bottom:6px}
 h3{font-size:15px;margin:22px 0 6px;color:#9fb4c8}
 p{max-width:104ch;color:#b9c2cc} code{background:#1b2026;padding:1px 5px;border-radius:3px}
 .scroll{overflow-x:auto;padding-bottom:6px} .row{display:flex;gap:14px;align-items:flex-end}
 .cell{margin:0;flex:0 0 auto} .cell img{display:block;image-rendering:auto;background:#000;border:1px solid #2a2f36}
 figcaption{font-size:11.5px;color:#8d99a6;margin-top:5px;max-width:46ch}
 .miss{color:#c77;border:1px dashed #543;padding:20px 26px}
 table{border-collapse:collapse;margin:10px 0 4px;font-size:12.5px}
 th,td{border:1px solid #2a2f36;padding:4px 8px;text-align:left} th{background:#1b2026;color:#9fb4c8}
 td.n{text-align:right;font-variant-numeric:tabular-nums} td.k{font-family:ui-monospace,monospace;font-size:11.5px}
 .ok{color:#8fd694} .warn{color:#e0b155}
 tr.mixed td{background:#151d19} tr.wired td{background:#151a22} tr.old td{opacity:.45}
 .note{background:#171c22;border-left:3px solid #3c4756;padding:10px 14px;margin:12px 0;max-width:104ch}
</style>
<h1>Frost-Props — warum das Feld gleichförmig liest</h1>
<p>Alle Felder mit dem <b>echten</b> <code>src/views/grid/propLayout.ts</code> gelegt
(<code>scripts/props-layout-bridge.cjs</code>) und mit der Zeichengeometrie aus dem Prop-Zweig von
<code>PlanetSurface.tsx</code>. Gerätepixel: eine Kachel = <b>144 × 72</b> (zoom 1, dpr 3), Mip-Kette
simuliert, nichts hochskaliert. Alle Panels unter der <b>Vakuum-Abdunklung</b> — MOON_ICY hat
atmosphereDensity 0, also terrainAlpha 0.45.</p>

<div class="note"><b>Drei getrennte Hebel.</b> § 1 verändert nur, WO ein Prop steht; § 2 nur, WAS
gezogen wird; § 3 fügt eine Familie hinzu. Jedes Panel unterscheidet sich vom Nachbarn in genau
einem davon — sonst wüsste hinterher niemand, was gewirkt hat.</div>

<h2>§ 1 — Die Streuung: Südspitze → Raute</h2>
<p>Heute ist <code>propGroundInset</code> für jeden stehenden Prop <b>0</b>, der Fußpunkt also die
<b>Südspitze</b> der Raute, und <code>JITTER 0.28</code> wird rechteckig um genau diesen Punkt
gelegt: ±6.7 px in x, ±3.4 px in y auf einer 48×24-Kachel. Die Füße liegen damit auf einem Gitter
aus Kachelspitzen — das ist die diagonale Reihung.</p>
<p>Das vorgeschlagene Modell zieht den Fußpunkt gleichverteilt über das <b>Bodenquadrat</b> der
Kachel und projiziert ihn: mit der Iso-Basis aus <code>worldToScreen</code> wird ein lokaler
Weltversatz (u, v) zu <code>dx = (u−v)·SPAN</code>, <code>dy = (u+v)·SPAN</code>, und die Raute ist
exakt <code>|dx| + |dy| ≤ 1</code>. Die beiden vorhandenen Zufallsströme werden unverändert
weiterverwendet, die Anordnung bleibt also deterministisch.</p>
<div class="note"><b>Tiefensortierung — hält bis SPAN 0.5, und das ist Arithmetik.</b>
Der Sortierschlüssel in <code>PlanetSurface</code> ist <code>(posX+posY, posX, sub)</code> und
enthält <b>kein</b> Bildschirm-y. Daraus folgt:<br>
(a) <b>Der Inset allein kann nichts brechen</b> — er ist eine gleichmäßige Verschiebung ALLER
stehenden Props, jede relative Tiefenbeziehung bleibt.<br>
(b) <b>Das Aufmachen von dy hat eine Grenze.</b> Für die Nachbarkacheln A=(x,y) und B=(x+1,y) steht
B eine Tiefenzeile weiter vorn und liegt TH/2 tiefer. B ist noch immer wirklich vorn, solange
<code>(1−SPAN)·TH/2 &gt; SPAN·TH/2</code>, also <b>SPAN &lt; 0.5</b>. Bei 0.5 fallen die beiden
exakt zusammen (kein Wechsel), darüber kann ein Prop der HINTEREN Kachel tiefer stehen und trotzdem
zuerst gezeichnet werden — sichtbar bei allem, was höher als TH/2 = 12 px ist, also bei jeder
Familie außer <code>ice_grit</code>.<br>
(c) <b>Hüllen sind unberührt</b> — <code>sub = +Infinity</code> zeichnet sie weiter nach den Props
ihrer eigenen Zelle, und das hängt nicht am Fußpunkt.<br>
→ <b>Empfehlung SPAN 0.5</b>: braucht nur Fußpunkt und Streuform, <b>keine</b> Änderung an der
Sortierung. Die Sprossen 0.75 und 1.00 stehen zum Vergleich dabei; sie bräuchten zuerst einen
Sortierschlüssel <code>(posX+posY+dy)</code> — ein Einzeiler, aber eine eigene Entscheidung.</div>
<div class="note">⚠️ <b>Die Streuung ist global.</b> Sie träfe Wald, alle sechs VOLCANIC-Biome, die
Wüsten — alles, was längst abgenommen ist. Deshalb steht <code>basalt_plain</code> hier neben den
Frostbiomen: dieselbe Reihung existiert dort, und die Änderung ist dort mitzubeurteilen.</div>
${phaseTable}
${scatterBlock('permafrost', 'permafrost (ice_rubble, heutige Mischung)')}
${scatterBlock('glacier', 'glacier (ice_block, heutige Mischung)')}
${scatterBlock('basalt_plain', 'basalt_plain — BESTANDSBIOM, die globale Wirkung')}

<h2>§ 2 / § 3 — Mischung und Krater</h2>
<p>Je Konfiguration zwei Panels: links mit der <b>heutigen</b> Streuung, rechts mit der
<b>empfohlenen</b> (Raute 0.5). Damit ist ablesbar, welcher Hebel welchen Teil der Wirkung trägt.
<code>today</code> = was ausgeliefert ist · <code>wired</code> = was in dieser Runde eingetragen
wurde (nur Familien, die unter <code>src/assets/props</code> existieren) · <code>mixed</code> = der
volle Vorschlag, der <code>ice_grit</code> und <code>ice_spire</code> voraussetzt.</p>
${cfgBlock('permafrost')}
${cfgBlock('glacier')}
${cfgBlock('tundra')}
${cfgBlock('crevasse')}

<h2>§ 2b — Die Anzahl-Leiter</h2>
<p>Exakt gerechnet, nicht geschätzt: je g zieht das Layout <code>countForG</code> Instanzen, jede
überlebt unabhängig mit (Nicht-Null-Schlüssel / Schlüssel). Binomial je g, gewichtet mit dem
gemessenen g-Histogramm.</p>
${densTable}

<h2>§ 3b — crater_decal auf den Frostgründen</h2>
<p><b>σ</b> ist die Zahl, an der diese Familie kalibriert ist: der tiefste Kontrast des Aufflegers in
Einheiten der <b>eigenen Textur-sd des Grundes</b>, durch die volle Renderer-Kette inklusive
<code>blitPropTint</code>. Unter 0.7 kaum sichtbar, über ~1.9 ein Loch statt eines Hinweises. Die
drei unteren Zeilen sind Bestandsbiome und reproduzieren die veröffentlichte Tabelle — sie sind die
Kalibrierprobe dieser Messung.</p>
${sigmaTable}
<p>Der induzierte Farbstich <b>ΔB/R ≤ 0.010</b> auf jedem Frostgrund: der Aufleger ist achromatisch,
eine <b>Umfärbung ist nicht nötig</b>.</p>
${row(['glacier', 'crevasse', 'tundra', 'permafrost'].map((b) =>
    img(`dec-${b}`, `${b} — nackte Kachel, dann v0 v1 v2 v3 der Stärkeleiter`)))}

<h2>§ 4 — Die Diagnosen</h2>
<h3>4a · Ziehen die Kacheln wirklich vier Varianten?</h3>
<p>Am Datenpfad: <b>ja</b> — <code>v</code> ist auf dem Live-Endpunkt über alle Frostbiome
gleichverteilt (24.2–25.8 % je Slot, keine räumliche Struktur), und
<code>spriteCache</code> schlägt den Slot ohne Clamp und ohne Modulo nach. Die Frage ist damit
nicht, ob vier Dateien gezogen werden, sondern ob die vier Dateien vier <b>Bilder</b> sind.</p>
<p>Maß: <b>NCC nach Hochpass</b> (Blur r6), das Maß aus LESSONS § 8 — die rohe NCC misst geteilte
Beleuchtung mit und erreicht auf zwei merkmalsarmen Kacheln 0.997, ohne dass sie verwandt wären.
Schwelle für „gleiche Quelle": <b>0.12</b>. Jedes Paar zweimal, direkt und gegen den
horizontal gespiegelten Partner — der ICE-Korpus baut Slot 2/3 als Spiegel.</p>
<table><thead><tr><th>Biom</th><th>schlechtestes Paar</th><th>hpNCC</th>
<th>alle sechs Paare (direkt / gespiegelt)</th></tr></thead><tbody>
${twinRows.map((t) => `<tr><td>${t.biome}</td><td>${t.wp}${t.mirrored ? ' (gespiegelt)' : ''}</td>` +
    `<td class="n ${t.worst > 0.12 ? 'warn' : 'ok'}"><b>${t.worst.toFixed(3)}</b></td>` +
    `<td class="k">${t.cells.map((c) => `${c.pair}:${c.direct.toFixed(2)}/${c.mirror.toFixed(2)}`).join('  ')}</td></tr>`).join('\n')}
</tbody></table>
<div class="note"><b>Das ist der größte Einzelbefund dieser Runde.</b> Auf
<code>tundra</code>, <code>permafrost</code> und <code>ice_shelf</code> sind die vier Slots
<b>ein einziges Bild</b> — zwei Fensterversätze und deren Spiegelungen, hpNCC 0.81–0.93 gegen eine
Schwelle von 0.12. <code>glacier</code>, <code>crevasse</code>, <code>frozen_lake</code>,
<code>forest</code> und <code>regolith</code> liegen alle unter 0.04, sind also sauber vier Kacheln.
Und auf dem erreichbaren Eismond sind <b>tundra + permafrost zusammen 87 % der Fläche</b>. Der
Wiederholungseindruck kommt damit zuerst aus dem <b>Kachelsatz</b>, nicht aus dem Prop-Layer.
Das ist ein Befund, kein Auftrag — die Kacheln sind in dieser Runde unangetastet.</div>
<h3>4b · Silhouetten bei Spielgröße</h3>
<p>Jede Variante jeder Familie auf ihrem Grund, in der Größe, die das Gerät wirklich zeichnet.
<code>A/h²</code> ist ein drehinvariantes Bulk-Maß (LESSONS § 8), <code>IoU</code> die
Silhouetten-Überdeckung zweier Mitglieder in einer gemeinsamen Box — je höher, desto ähnlicher.</p>
${row(['sil-permafrost', 'sil-glacier', 'sil-far-permafrost'].map((n) => img(n)))}
${famTable}
<h3>4b · Die Quellen, 400 px, ungeskaliert</h3>
${['ice_block', 'ice_rubble', 'ice_spire', 'ice_grit'].map((f) =>
    `<h3>${f}</h3>${row(Array.from({ length: 5 }, (_, i) => `src-${f}-${i}`).filter((n) => wrote.includes(n)).map((n) => img(n)))}`).join('\n')}
`;
  fs.writeFileSync(path.join(SHEET_DIR, `${PFX}_sheet.html`), html);
}

main().catch((e) => { console.error(e); process.exit(1); });
