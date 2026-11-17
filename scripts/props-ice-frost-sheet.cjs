/**
 * Review sheet for the two FROST prop families — rendered in DEVICE PIXELS.
 *
 *   ice_block   (séracs, standing)   -> glacier          [+ frozen_lake / crevasse probes]
 *   ice_rubble  (frost rubble, lying) -> permafrost, tundra
 *
 * Output: assets/style-test/tiles/_ice_frost-*.png  +  _ice_frost_sheet.html
 * (feedback_style_test_html_location: viewing HTML and contact sheets go to
 * assets/style-test/tiles/, never into the scratchpad.)
 *
 * ── WHY DEVICE PIXELS, AND WHY NOTHING IS UPSCALED
 *
 * Inherited verbatim from props-crater-decal-generate.cjs, where it cost a
 * round. Rudi on the first attempt there: "es ist alles extrem pixelig. die
 * grafiken sehen aus wie in 128x128 generiert und hochskaliert. ich kann da
 * leider kaum etwas erkennen." The panels had been composed at the tile's CSS
 * size (48x24) and then blown up with nearest neighbour.
 *
 * PlanetSurface sizes its cache canvas as round(cacheW * dpr), then
 * setTransform(dpr,…) then scale(cam.zoom), so ONE TILE COVERS
 *     TW * zoom * dpr  =  144 x 72 device pixels at zoom 1, dpr 3.
 * Every panel here is composed at that size from the full-resolution sources and
 * displayed at that size. No nearest neighbour anywhere.
 *
 * THE MIP CHAIN IS SIMULATED, not short-cut. spriteCache.computeMipLevel picks
 * from ZOOM ALONE, so at zoom 1 the renderer draws the prop's @quarter mip
 * (100x… for a 400 px sprite) scaled to the draw size. These families are not
 * integrated yet, so there is no @quarter on disk — the panel therefore resizes
 * 400 -> quarter -> draw size in two steps, which is the chain `integrate` will
 * actually produce. Going 400 -> draw size in one step would show the sprite
 * slightly SHARPER than the device will.
 *
 * ── THE VACUUM IS THE REAL CONDITION HERE, NOT A DIAGNOSTIC PANEL
 *
 * Measured, not assumed: GET /planets/{id} on the reachable MOON_ICY
 * ("Delta Tauri Tertius XI") returns atmosphereDensity 0. isoConstants:
 * airlessFactor(0) = 1, so atmosphereDarkening at z >= 0 gives terrainAlpha
 * 0.45 — the full fill toward rgb(5,10,25), exactly as on BARREN and ASTEROIDS.
 * The ICE surfaces run DARKENED in the game. The un-darkened panels are kept
 * only as a magnifier.
 *
 * Note this cuts the other way from UNDERGROUND, where the same check came back
 * negative (PLAN § 5.5). It is worth running per family; it is not a constant.
 *
 * ── WHAT THE SHEET HAS TO ANSWER
 *
 * Not "is this a nice object" — at 144x72 a sérac is ~19 device px tall and a
 * frost chunk ~12. The question is whether it reads as ICE ON ICE (or ice on
 * frozen ground) without building the tile shut. So every family gets:
 *   1. the SOURCE at 400 px, native, no scaling at all — the art on trial
 *   2. one tile per variant per target ground, at zoom 1 device size
 *   3. an iso FIELD at the MEASURED density, which is the only panel that can
 *      show "zugebaut" or "leer"
 *   4. a SIZE ladder (the height factor is the one number still open)
 *   5. for ice_rubble, a TONE ladder that puts the rejected rock_snow level
 *      (1.68x tundra / 1.93x permafrost) beside the candidate, so the dose is a
 *      comparison and not an assertion
 *
 * Usage: node scripts/props-ice-frost-sheet.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const L = require('./props-pipeline-lib.cjs');
const { loadPropLayout } = require('./props-layout-bridge.cjs');
sharp.cache(false);

const SHEET_DIR = path.join(L.ROOT, 'assets', 'style-test', 'tiles');
const PFX = '_ice_frost';
const TW = L.TW, TH = L.TH, PBH = L.PROP_BASE_HEIGHT;
const DPR = 3; // Rudi's test device

// ── the renderer's airless darkening, reproduced (isoConstants) ──
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
// raster helpers (RGB canvas, premultiplied blits)
// ══════════════════════════════════════
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function makeCanvas(W, H, bg) {
  const c = Buffer.alloc(W * H * 3);
  for (let p = 0; p < W * H; p++) { c[p * 3] = bg[0]; c[p * 3 + 1] = bg[1]; c[p * 3 + 2] = bg[2]; }
  return c;
}
function blit(canvas, W, H, buf, bw, bh, x0, y0) {
  for (let y = 0; y < bh; y++) {
    const yy = y0 + y;
    if (yy < 0 || yy >= H) continue;
    for (let x = 0; x < bw; x++) {
      const xx = x0 + x;
      if (xx < 0 || xx >= W) continue;
      const s = (y * bw + x) * 4;
      const a = buf[s + 3] / 255;
      if (a === 0) continue;
      const d = (yy * W + xx) * 3;
      for (let c = 0; c < 3; c++) canvas[d + c] = Math.round(canvas[d + c] * (1 - a) + buf[s + c] * a);
    }
  }
}
/** drawImage + the renderer's blitPropTint pass (tints at imgAlpha x t). */
function blitProp(canvas, W, H, buf, bw, bh, x0, y0, t) {
  for (let y = 0; y < bh; y++) {
    const yy = y0 + y;
    if (yy < 0 || yy >= H) continue;
    for (let x = 0; x < bw; x++) {
      const xx = x0 + x;
      if (xx < 0 || xx >= W) continue;
      const s = (y * bw + x) * 4;
      const a = buf[s + 3] / 255;
      if (a === 0) continue;
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
// sources
// ══════════════════════════════════════
const finalPath = (fam, i) => path.join(L.DIR_FINAL, `${fam}_${i}.png`);
/** The superseded sprites, kept rather than deleted so the sheet can show them. */
const DIR_REJECTED = path.join(L.ROOT, 'assets', 'rejected');
const rejectedPath = (fam, i) => path.join(DIR_REJECTED, `${fam}_${i}_r1.png`);

/** A darkened tile at a device size, from the mip the renderer would use. */
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

/**
 * Prop raw RGBA at a device draw size, THROUGH the mip the renderer would use.
 * `gain` is an optional uniform multiply for the tone ladder — a scalar per
 * pixel, i.e. exactly what a different `tone.targetLum` would have produced
 * (LESSONS § 8: a scalar is a scalar), so the ladder is honest without
 * re-billing five generations per rung.
 */
/** What the pipeline has shipped, for propVariantCount inside the bridge. */
const SHIPPED_VARIANTS = { ice_block: 4, ice_rubble: 5 };

const propCache = new Map();
async function propRaw(fam, i, drawW, drawH, mip, gain = 1) {
  const key = `${fam}|${i}|${drawW}|${drawH}|${mip}|${gain}`;
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
  const out = Buffer.from(data);
  if (gain !== 1)
    for (let k = 0; k < out.length; k += 4)
      for (let c = 0; c < 3; c++) out[k + c] = clamp(Math.round(out[k + c] * gain), 0, 255);
  propCache.set(key, out);
  return out;
}

async function aspectOf(fam, i) {
  const m = await sharp(finalPath(fam, i)).metadata();
  return m.width / m.height;
}

/** Draw size in DEVICE pixels: height first, width from the sprite aspect. */
function drawSize(aspect, factor, sc) {
  const dh = Math.max(1, Math.round(PBH * factor * sc));
  return { dw: Math.max(1, Math.round(dh * aspect)), dh };
}

/** Mean tile colour after darkening — the honest panel background. */
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
// panels
// ══════════════════════════════════════

/** The art on trial: the sprite at its native 400 px over a flat mid grey. */
async function sourcePanel(fam, i, file) {
  const { data, info } = await sharp(file || finalPath(fam, i)).ensureAlpha()
    .raw().toBuffer({ resolveWithObject: true });
  const canvas = makeCanvas(info.width, info.height, [98, 96, 92]);
  blit(canvas, info.width, info.height, data, info.width, info.height, 0, 0);
  return toPng(canvas, info.width, info.height);
}

/** Every variant of a family on one ground, one tile each, at device size. */
async function rowPanel(fam, n, biome, factor, v, t, gain = 1) {
  const pad = Math.max(2, Math.round(4 * v.sc / 3));
  const CW = v.tw + pad * 2, CH = v.th + pad * 2;
  const W = (n + 1) * CW, H = CH;
  const canvas = makeCanvas(W, H, [26, 28, 32]);
  // leftmost cell: the bare tile, as the reference
  blit(canvas, W, H, (await tileRaw(biome, 0, v.tw, v.th, t, v.mip)).data, v.tw, v.th, pad, pad);
  for (let i = 0; i < n; i++) {
    const g = await tileRaw(biome, (i + 1) % 4, v.tw, v.th, t, v.mip);
    const x0 = (i + 1) * CW + pad;
    blit(canvas, W, H, g.data, v.tw, v.th, x0, pad);
    const { dw, dh } = drawSize(await aspectOf(fam, i), factor, v.sc);
    const p = await propRaw(fam, i, dw, dh, v.mip, gain);
    // STANDING prop: the renderer anchors bottom-centre on the tile's SOUTH
    // vertex (PROP_GROUND_INSET 0 for both of these families).
    blitProp(canvas, W, H, p, dw, dh, x0 + Math.round((v.tw - dw) / 2), pad + v.th - dh, t);
  }
  return toPng(canvas, W, H);
}

/**
 * An iso field laid out by the REAL src/views/grid/propLayout.ts.
 *
 * ── THE PREVIOUS VERSION OF THIS FUNCTION WAS WRONG IN FOUR PLACES AT ONCE
 *
 * It put ONE prop on each tile, on the tile's south vertex, at unit size, with
 * one variant per tile. Rudi: "wichtig ist nur die position auf einem tile.
 * aktuell sind alle auf der unteren spitze positioniert. der prop layer arbeitet
 * so aber aktuell nicht. oft sind auf einem tile mehrere props positioniert.
 * dafuer sind die props selbst dann etwas kleiner". The shipped layer gives each
 * tile a COUNT (propCountForBiomeG), and each instance its own dx/dy over
 * JITTER 0.28, its own scale over PROP_SCALE_MIN..MAX times the height factor,
 * and its own variant. The height-factor recommendation derived from those
 * panels was therefore derived from a model that was wrong.
 *
 * Nothing here is mirrored any more: props-layout-bridge loads propLayout.ts
 * itself. Only the DRAW geometry is reproduced, from the prop branch of
 * PlanetSurface.tsx, and it is reproduced exactly:
 *
 *   psx, psy   the tile's screen centre
 *   gx         = psx + dx * (TW/2)
 *   gyPx       = psy + (TH/2) * (1 - groundInset) + dy * (TH/2)
 *   drawH      = PROP_BASE_HEIGHT * inst.scale      (scale already carries the
 *                                                    height factor)
 *   drawW      = drawH * spriteAspect
 *   px, py     = gx - drawW/2, gyPx - drawH          (bottom-centre anchor)
 *   order      by (posX + posY), then posX, then inst.dy
 *
 * every length multiplied by sc = zoom x dpr so the panel is in device pixels.
 * Neither family has a PROP_GROUND_INSET entry — both are bodies standing on the
 * ground, not flat decals — so the inset is 0 and the anchor is the south vertex
 * per instance, with the jitter around it.
 */
async function fieldPanel(fam, cfg, biome, factor, hist, R, C, seed, v, t, gain = 1) {
  // A fresh module graph per call: the bridge caches propThemes/propLayout, and
  // each panel proposes a different config.
  for (const k of Object.keys(require.cache))
    if (k.includes(path.join('src', 'views', 'grid'))) delete require.cache[k];
  const proposed = {};
  proposed[biome] = cfg;
  const PL = loadPropLayout(proposed, SHIPPED_VARIANTS, { [fam]: factor });

  const W = Math.round((R + C) * (v.tw / 2) + v.tw);
  const H = Math.round((R + C) * (v.th / 2) + v.th + 8);
  const canvas = makeCanvas(W, H, await panelBg(biome, t));
  let rnd = seed >>> 0;
  const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const cum = []; let acc = 0;
  for (const q of hist) { acc += q; cum.push(acc); }
  const drawG = () => { const u = rand() * acc; let g = 0; while (g < cum.length - 1 && u > cum[g]) g++; return g; };

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
      // The tile's own coordinates drive propLayout's determinism, so the scatter
      // is the one the game would draw for these cells.
      for (const inst of PL.propLayout(c, r, biome, drawG())) {
        const asp = await aspectOf(inst.propKey, inst.variant);
        const dh = Math.max(1, Math.round(L.PROP_BASE_HEIGHT * inst.scale * v.sc));
        const dw = Math.max(1, Math.round(dh * asp));
        const psx = sx + v.tw / 2, psy = sy + v.th / 2;
        const gx = psx + inst.dx * (v.tw / 2);
        const gy = psy + (v.th / 2) + inst.dy * (v.th / 2); // groundInset 0
        items.push({
          key: inst.propKey, variant: inst.variant, dw, dh,
          x: Math.round(gx - dw / 2), y: Math.round(gy - dh),
          o: (r + c) * 1e6 + c * 1e3 + inst.dy,
          gain,
        });
      }
    }
  items.sort((a, b) => a.o - b.o);
  for (const it of items) {
    const buf = await propRaw(it.key, it.variant, it.dw, it.dh, v.mip, it.gain);
    blitProp(canvas, W, H, buf, it.dw, it.dh, it.x, it.y, t);
  }
  return toPng(canvas, W, H);
}

// ══════════════════════════════════════
// measurement (for the tables in the HTML)
// ══════════════════════════════════════
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function srgb2lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function labL(r, g, b) {
  const Y = 0.2126 * srgb2lin(r) + 0.7152 * srgb2lin(g) + 0.0722 * srgb2lin(b);
  return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
}
async function statsOf(files, gain = 1) {
  let n = 0, sl = 0, sL = 0, sr = 0, sg = 0, sb = 0, sq = 0, blow = 0;
  for (const f of files) {
    const { data } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue;
      const r = clamp(data[i] * gain, 0, 255), g = clamp(data[i + 1] * gain, 0, 255), b = clamp(data[i + 2] * gain, 0, 255);
      const l = lum(r, g, b);
      n++; sl += l; sL += labL(r, g, b); sr += r; sg += g; sb += b; sq += l * l;
      if (l > 200) blow++;
    }
  }
  return { n, lum: sl / n, L: sL / n, BR: sb / sr, sd: Math.sqrt(sq / n - (sl / n) ** 2), blow: 100 * blow / n };
}
const tileFiles = (b) => [0, 1, 2, 3].map((i) => path.join(L.DIR_TILES, b, `${b}_${i}.webp`)).filter(fs.existsSync);
const famFiles = (f, n) => Array.from({ length: n }, (_, i) => finalPath(f, i)).filter(fs.existsSync);

// ══════════════════════════════════════
// the run
// ══════════════════════════════════════

/** MEASURED on the reachable MOON_ICY, 1 064 960 surface cells (260 chunks of 64x64). */
const G_HIST = {
  glacier:     [75.0, 18.0, 6.0, 0.9, 0.0, 0.0, 0.0],
  permafrost:  [75.1, 17.9, 6.0, 1.0, 0.0, 0.0, 0.0],
  tundra:      [39.9, 35.1, 18.1, 6.0, 1.0, 0.0, 0.0],
  frozen_lake: [79.4, 15.1, 5.5, 0.0, 0.0, 0.0, 0.0],
  crevasse:    [75.5, 17.6, 6.1, 0.8, 0.0, 0.0, 0.0],
};
/** countForG(g, min, max, minG) from propLayout, tabulated for g = 0..6. */
function countTable(min, max, minG) {
  return Array.from({ length: 7 }, (_, g) =>
    g < minG ? 0 : Math.round(min + (max - min) * ((Math.min(6, g) - minG) / (6 - minG))));
}
const meanCount = (hist, counts) =>
  hist.reduce((s, p, g) => s + (p / 100) * counts[g], 0);
const bareShare = (hist, counts) =>
  hist.reduce((s, p, g) => s + (counts[g] === 0 ? p : 0), 0);

// ══════════════════════════════════════
// THE PROPOSED CONFIGURATION
// ══════════════════════════════════════
//
// Derived against the real propLayout by scripts/props-ice-frost-calibrate.cjs.
// Not wired into propThemes — this round writes nothing under src/ — so the
// bridge feeds it to the real layout and the panels below show what it does.
//
// The NULL SENTINEL is what makes "oft mehrere props je Kachel" and "manche
// Kacheln leer" possible at the same time. It is the plains precedent: the band
// picks a count, then the key stream decides per instance whether it survives,
// which reads as natural clumping instead of an evenly thinned carpet. Without
// it, minG 0 + band 1..2 under the measured FROZEN g puts exactly ONE prop on
// 99.2 % of tiles and none anywhere — no clumping and no empty ground.
// Key arrays are ODD (3), per the KEY-ARRAY LENGTH rule in propThemes.
const PROPOSED = {
  glacier: { keys: ['ice_block', 'ice_block', null], minCount: 2, maxCount: 4, minG: 0 },
  permafrost: { keys: ['ice_rubble', 'ice_rubble', null], minCount: 2, maxCount: 4, minG: 0 },
  tundra: { keys: ['ice_rubble', 'ice_rubble', null], minCount: 2, maxCount: 4 },
  // probes, same shape as their host biome
  crevasse: { keys: ['ice_block', 'ice_block', null], minCount: 2, maxCount: 4 },
  frozen_lake: { keys: ['ice_block', 'ice_block', null], minCount: 2, maxCount: 4, minG: 0 },
};
/** Recommended height factors — see the report and the ladders in § 6. */
const REC_FACTOR = { ice_block: 0.45, ice_rubble: 0.2 };

const FAMS = [
  { fam: 'ice_block', n: 4, factor: 0.45, ladder: [0.4, 0.45, 0.5, 0.55], grounds: ['glacier', 'crevasse', 'frozen_lake'] },
  { fam: 'ice_rubble', n: 5, factor: 0.2, ladder: [0.16, 0.2, 0.24, 0.3], grounds: ['permafrost', 'tundra'] },
];

async function main() {
  fs.mkdirSync(SHEET_DIR, { recursive: true });
  let removed = 0;
  for (const f of fs.readdirSync(SHEET_DIR))
    if (f.startsWith(`${PFX}-`)) { fs.unlinkSync(path.join(SHEET_DIR, f)); removed++; }
  if (removed) console.log(`[sheet] removed ${removed} panels from the previous run`);

  const wrote = [];
  const w = async (name, buf) => {
    fs.writeFileSync(path.join(SHEET_DIR, `${PFX}-${name}.png`), buf);
    wrote.push(name);
  };

  const NEAR = view(1);   // the build view: tile 144x72 device px, mip @quarter
  const FAR = view(0.5);  // zoomed out:    tile  72x36,            mip @eighth
  const IN = view(2);     // zoomed in:     tile 288x144,           mip @half
  const V = [['vac', VAC_A], ['lit', 0]];

  for (const { fam, n, factor, ladder, grounds } of FAMS) {
    for (let i = 0; i < n; i++)
      if (fs.existsSync(finalPath(fam, i))) await w(`src-${fam}-${i}`, await sourcePanel(fam, i));
    // The superseded versions, shown as superseded rather than deleted.
    for (let i = 0; i < n; i++)
      if (fs.existsSync(rejectedPath(fam, i)))
        await w(`rej-${fam}-${i}`, await sourcePanel(fam, i, rejectedPath(fam, i)));

    for (const [tag, t] of V)
      for (const b of grounds) {
        await w(`row-${fam}-${b}-${tag}`, await rowPanel(fam, n, b, factor, NEAR, t));
        if (tag === 'vac') {
          await w(`row-in-${fam}-${b}`, await rowPanel(fam, n, b, factor, IN, t));
          await w(`row-far-${fam}-${b}`, await rowPanel(fam, n, b, factor, FAR, t));
        }
      }

    for (const f of ladder)
      await w(`size-${fam}-${f}`, await rowPanel(fam, n, grounds[0], f, NEAR, VAC_A));
  }

  // ── FIELDS, laid out by the REAL propLayout ──
  //
  // Each entry is (panel, family, biome, config, height factor, gain). The
  // config is the full BiomePropConfig the bridge hands to propLayout, so a
  // panel differs from its neighbour in exactly the field being asked about.
  const G = (b) => G_HIST[b];
  const cfgOf = (b, over) => ({ ...PROPOSED[b], ...(over || {}) });
  const fields = [
    // 1 — the proposal, on each of the three target biomes
    ['field-glacier', 'ice_block', 'glacier', cfgOf('glacier'), REC_FACTOR.ice_block, 1],
    ['field-permafrost', 'ice_rubble', 'permafrost', cfgOf('permafrost'), REC_FACTOR.ice_rubble, 1],
    ['field-tundra', 'ice_rubble', 'tundra', cfgOf('tundra'), REC_FACTOR.ice_rubble, 1],

    // 2 — minG, the existential question: the FROZEN regime is 75 % g = 0
    ['field-glacier-minG1', 'ice_block', 'glacier', cfgOf('glacier', { minG: 1 }), REC_FACTOR.ice_block, 1],
    ['field-permafrost-minG1', 'ice_rubble', 'permafrost', cfgOf('permafrost', { minG: 1 }), REC_FACTOR.ice_rubble, 1],
    ['field-tundra-minG0', 'ice_rubble', 'tundra', cfgOf('tundra', { minG: 0 }), REC_FACTOR.ice_rubble, 1],

    // 3 — LADDER A: the HEIGHT FACTOR, config held fixed
    ['size-field-glacier-040', 'ice_block', 'glacier', cfgOf('glacier'), 0.4, 1],
    ['size-field-glacier-045', 'ice_block', 'glacier', cfgOf('glacier'), 0.45, 1],
    ['size-field-glacier-050', 'ice_block', 'glacier', cfgOf('glacier'), 0.5, 1],
    ['size-field-glacier-055', 'ice_block', 'glacier', cfgOf('glacier'), 0.55, 1],
    ['size-field-permafrost-016', 'ice_rubble', 'permafrost', cfgOf('permafrost'), 0.16, 1],
    ['size-field-permafrost-020', 'ice_rubble', 'permafrost', cfgOf('permafrost'), 0.2, 1],
    ['size-field-permafrost-024', 'ice_rubble', 'permafrost', cfgOf('permafrost'), 0.24, 1],
    ['size-field-permafrost-030', 'ice_rubble', 'permafrost', cfgOf('permafrost'), 0.3, 1],

    // 4 — LADDER B: the DENSITY BAND, height factor held at the recommendation.
    //     Never a diagonal: LESSONS "Groesse und Dichte nie gleichzeitig senken".
    ['dens-field-glacier-1-2', 'ice_block', 'glacier', cfgOf('glacier', { keys: ['ice_block'], minCount: 1, maxCount: 2 }), REC_FACTOR.ice_block, 1],
    ['dens-field-glacier-2-4n', 'ice_block', 'glacier', cfgOf('glacier'), REC_FACTOR.ice_block, 1],
    ['dens-field-glacier-3-4n', 'ice_block', 'glacier', cfgOf('glacier', { minCount: 3 }), REC_FACTOR.ice_block, 1],
    ['dens-field-permafrost-1-2', 'ice_rubble', 'permafrost', cfgOf('permafrost', { keys: ['ice_rubble'], minCount: 1, maxCount: 2 }), REC_FACTOR.ice_rubble, 1],
    ['dens-field-permafrost-2-4n', 'ice_rubble', 'permafrost', cfgOf('permafrost'), REC_FACTOR.ice_rubble, 1],
    ['dens-field-permafrost-3-4n', 'ice_rubble', 'permafrost', cfgOf('permafrost', { minCount: 3 }), REC_FACTOR.ice_rubble, 1],

    // 5 — the tone ladder for ice_rubble, unchanged in purpose
    ['field-tundra-tone120', 'ice_rubble', 'tundra', cfgOf('tundra'), REC_FACTOR.ice_rubble, 1.2],
    ['field-tundra-tone136', 'ice_rubble', 'tundra', cfgOf('tundra'), REC_FACTOR.ice_rubble, 1.356],
    ['field-permafrost-tone136', 'ice_rubble', 'permafrost', cfgOf('permafrost'), REC_FACTOR.ice_rubble, 1.356],

    // 6 — the probes
    ['field-frozen_lake', 'ice_block', 'frozen_lake', cfgOf('frozen_lake'), REC_FACTOR.ice_block, 1],
    ['field-crevasse', 'ice_block', 'crevasse', cfgOf('crevasse'), REC_FACTOR.ice_block, 1],
  ];
  for (const [name, fam, biome, cfg, factor, gain] of fields)
    await w(name, await fieldPanel(fam, cfg, biome, factor, G(biome), 6, 6, 20260911, NEAR, VAC_A, gain));

  // The far view, because "zugebaut" is judged at the smallest zoom the thing
  // occurs at, not at the build zoom (LESSONS § 5).
  await w('field-far-glacier', await fieldPanel('ice_block', PROPOSED.glacier, 'glacier',
    REC_FACTOR.ice_block, G_HIST.glacier, 10, 10, 20260911, FAR, VAC_A));
  await w('field-far-permafrost', await fieldPanel('ice_rubble', PROPOSED.permafrost, 'permafrost',
    REC_FACTOR.ice_rubble, G_HIST.permafrost, 10, 10, 20260911, FAR, VAC_A));
  await w('field-far-tundra', await fieldPanel('ice_rubble', PROPOSED.tundra, 'tundra',
    REC_FACTOR.ice_rubble, G_HIST.tundra, 10, 10, 20260911, FAR, VAC_A));
  // And the build zoom, zoomed IN, so the individual placement is inspectable.
  await w('field-in-glacier', await fieldPanel('ice_block', PROPOSED.glacier, 'glacier',
    REC_FACTOR.ice_block, G_HIST.glacier, 3, 3, 20260911, IN, VAC_A));

  // ══════════════════════════════════════
  // numbers
  // ══════════════════════════════════════
  const rows = [];
  for (const b of ['glacier', 'crevasse', 'frozen_lake', 'permafrost', 'tundra', 'snow_peak'])
    rows.push(['TILE  ' + b, await statsOf(tileFiles(b))]);
  rows.push(['PROP  ice_block', await statsOf(famFiles('ice_block', 4))]);
  rows.push(['PROP  ice_rubble', await statsOf(famFiles('ice_rubble', 5))]);
  rows.push(['PROP  ice_rubble x1.20', await statsOf(famFiles('ice_rubble', 5), 1.2)]);
  rows.push(['PROP  ice_rubble x1.356', await statsOf(famFiles('ice_rubble', 5), 1.356)]);
  rows.push(['PROP  rock_snow (rejected)', await statsOf(
    fs.readdirSync(path.join(L.SRC_PROPS, 'rock_snow')).filter((f) => /^rock_snow_\d+\.webp$/.test(f))
      .map((f) => path.join(L.SRC_PROPS, 'rock_snow', f)))]);
  rows.push(['PROP  ice_floe (wrong ground)', await statsOf(
    fs.readdirSync(path.join(L.SRC_PROPS, 'ice_floe')).filter((f) => /^ice_floe_\d+\.webp$/.test(f))
      .map((f) => path.join(L.SRC_PROPS, 'ice_floe', f)))]);

  const geom = [];
  for (const { fam, n, factor } of FAMS)
    for (let i = 0; i < n; i++) {
      const m = await sharp(finalPath(fam, i)).metadata();
      const a = m.width / m.height;
      geom.push({ fam, i, w: m.width, h: m.height, a, dh: PBH * factor, dw: PBH * factor * a, factor });
    }

  const dens = [];
  for (const [b, hist] of Object.entries(G_HIST))
    for (const mg of [0, 1]) {
      const c = countTable(1, 2, mg);
      dens.push({ b, mg, mean: meanCount(hist, c), bare: bareShare(hist, c), counts: c.join(',') });
    }

  writeHtml(wrote, rows, geom, dens);
  console.log(`[sheet] ${wrote.length} panels at device resolution, no nearest-neighbour upscaling`);
  console.log(`[sheet] ${path.join(SHEET_DIR, `${PFX}_sheet.html`)}`);
}

function writeHtml(wrote, rows, geom, dens) {
  const img = (n, cap) => wrote.includes(n)
    ? `<figure><img src="${PFX}-${n}.png" alt="${n}"><figcaption>${cap}</figcaption></figure>` : '';
  const numTable = `<table><tr><th>Fläche</th><th>lum</th><th>L*</th><th>B/R</th><th>sd</th><th>Blowout&nbsp;&gt;200</th></tr>` +
    rows.map(([name, s]) =>
      `<tr><td>${name}</td><td>${s.lum.toFixed(1)}</td><td>${s.L.toFixed(1)}</td><td>${s.BR.toFixed(3)}</td><td>${s.sd.toFixed(1)}</td><td${s.blow > 1 ? ' class="bad"' : ''}>${s.blow.toFixed(2)} %</td></tr>`).join('') +
    '</table>';
  const geomTable = `<table><tr><th>Sprite</th><th>px</th><th>Aspect</th><th>Faktor</th><th>drawH</th><th>drawW</th><th>% von TW 48</th></tr>` +
    geom.map((g) =>
      `<tr><td>${g.fam}_${g.i}</td><td>${g.w}×${g.h}</td><td>${g.a.toFixed(2)}</td><td>${g.factor}</td><td>${g.dh.toFixed(1)}</td><td>${g.dw.toFixed(1)}</td><td${g.dw / 48 > 0.66 ? ' class="bad"' : ''}>${(100 * g.dw / 48).toFixed(0)} %</td></tr>`).join('') +
    '</table>';
  const densTable = `<table><tr><th>Biom</th><th>minG</th><th>counts g=0..6</th><th>Props/Kachel</th><th>leere Kacheln</th></tr>` +
    dens.map((d) =>
      `<tr><td>${d.b}</td><td>${d.mg}</td><td><code>${d.counts}</code></td><td>${d.mean.toFixed(3)}</td><td${d.bare > 60 ? ' class="bad"' : ''}>${d.bare.toFixed(1)} %</td></tr>`).join('') +
    '</table>';

  const html = `<!doctype html><meta charset="utf-8"><title>Frost-Props — ice_block / ice_rubble</title>
<style>
 body{background:#15171b;color:#d8dde4;font:14px/1.55 system-ui,sans-serif;margin:0;padding:24px 28px;max-width:1400px}
 h1{font-size:22px;margin:0 0 4px}
 figcaption:first-letter{text-transform:none} h2{font-size:17px;margin:34px 0 8px;border-bottom:1px solid #2c3037;padding-bottom:5px}
 h3{font-size:14px;margin:20px 0 6px;color:#9fb4c8}
 p{max-width:78ch;color:#b6bfca} code{background:#20242a;padding:1px 5px;border-radius:3px;color:#cfe3f5}
 .row{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start;margin:10px 0 4px}
 figure{margin:0} img{display:block;image-rendering:auto;background:#0d0f12;border:1px solid #2c3037}
 figcaption{font-size:11px;color:#7f8b98;margin-top:4px;max-width:46ch}
 table{border-collapse:collapse;font:12px/1.5 ui-monospace,monospace;margin:8px 0 4px}
 th,td{border:1px solid #2c3037;padding:3px 9px;text-align:right} th{background:#20242a;color:#9fb4c8}
 td:first-child,th:first-child{text-align:left}
 .bad{color:#ff9d7a;font-weight:600} .note{border-left:3px solid #3d6b8f;padding-left:12px;margin:12px 0}
</style>
<h1>Frost-Prop-Familien — <code>ice_block</code> (Séracs) und <code>ice_rubble</code> (Frostgrus)</h1>
<p>Alles auf dieser Seite ist in <b>Gerätepixeln</b> gerendert: eine Kachel bedeckt
<code>TW × zoom × dpr</code> = <b>144×72</b> bei zoom 1 und dpr 3. Kein Nearest-Neighbour, kein
Hochskalieren eines kleinen Bildes. Die Mip-Kette ist mitsimuliert — bei zoom 1 zeichnet der
Renderer die <code>@quarter</code>-Mip.</p>
<div class="note"><b>Das Vakuum ist hier der ECHTE Zustand, kein Diagnose-Panel.</b>
<code>GET /planets/…</code> auf dem erreichbaren MOON_ICY liefert <code>atmosphereDensity 0</code>,
also <code>airlessFactor 1</code> und <code>terrainAlpha 0.45</code>. Die „vac"-Panels sind das Spiel;
die „lit"-Panels sind nur eine Lupe.</div>

<h2>1 — Die Quelle, nativ 400 px, ohne jede Skalierung</h2>
<div class="note"><b>Rudis Abnahmetest, auf jede Rückgabe angewandt bevor sie durch die
Pipeline ging:</b> „sieht es aus, als hätte ein Mensch es dort hingestellt?" Wenn ja, ist es falsch.
Ein Sérac ist aus dem Gletscher <i>herausgebrochen</i> und stehengeblieben — kein Sockel, keine
Standfläche, keine Ausrichtung zur Kamera. Flache Abbruchflächen sind erwünscht; was nicht
vorkommt, sind parallele Gegenflächen, rechte Winkel und ein gleichförmiger Querschnitt.</div>
<h3>ice_block — VIERER-Familie, alle vier abgenommen (neu durchnummeriert)</h3>
<div class="row">${[0, 1, 2, 3].map((i) => img(`src-ice_block-${i}`,
  ['ice_block_0 (war _1) — Zahn', 'ice_block_1 (war _2) — Spaltmasse, neu ausgerichtet',
   'ice_block_2 (war _3) — gekippte Tafel', 'ice_block_3 (war _4) — Kerbmasse'][i])).join('')}</div>
<div class="note"><b>ice_block ist eine Vierer-Familie, und das ist eine Entscheidung, kein Rest.</b>
Das alte <code>_0</code> ist nach fünf Text-zu-Bild- und drei Bild-zu-Bild-Versuchen entfallen; alle
Fassungen liegen unter <code>assets/rejected/</code>. Die vier Überlebenden sind <b>neu
durchnummeriert</b>, weil <code>propVariantCount</code> die Map-Größe ist und <code>propLayout</code>
auf 0..n−1 klemmt — eine Lücke bei 0 hieße, dass ein Viertel aller Zeichnungen ins Leere greift.
<table style="margin-top:8px">
<tr><th>Sprite</th><th>vorher</th><th>headShift</th><th>peakShift</th><th>vee</th><th>Aspect</th></tr>
<tr><td>ice_block_0</td><td>_1</td><td>+0.069</td><td>+0.083</td><td>+99.3</td><td>0.74</td></tr>
<tr><td>ice_block_1</td><td>_2</td><td>+0.297</td><td>+0.171</td><td>+53.6</td><td>0.91</td></tr>
<tr><td>ice_block_2</td><td>_3</td><td>+0.114</td><td>+0.177</td><td>+83.5</td><td>0.88</td></tr>
<tr><td>ice_block_3</td><td>_4</td><td>+0.157</td><td>+0.244</td><td>+90.4</td><td>0.86</td></tr>
</table>
Alle vier lehnen nach rechts oben. <code>vee</code> misst, ob dem Betrachter eine <b>Ecke</b>
zugewandt ist — das Maß, an dem das entfallene <code>_0</code> mit 28.8 scheiterte, während es auf
vier anderen Achsenmaßen im Band lag.</div>

<h3>ice_rubble — 0 und 2 von Rudi behalten, 1/3/4 neu</h3>
<div class="row">${[0, 1, 2, 3, 4].map((i) => img(`src-ice_rubble-${i}`,
  (i === 0 || i === 2) ? `ice_rubble_${i} — BEHALTEN (Rudis Maßstab)` : `ice_rubble_${i} — neu`)).join('')}</div>

<h2>1b — Verworfen, nicht gelöscht: die Fassungen aus Runde 1</h2>
<p>Quaderförmig, teils mit Marmoräderung. Sie liegen unter <code>assets/rejected/</code> und stehen
hier als Vergleich, nicht als Angebot.</p>
<h3>ice_block — verworfen</h3>
<div class="row">${[0, 1, 2, 3, 4].map((i) => img(`rej-ice_block-${i}`, `VERWORFEN Runde 1 — ice_block_${i} (Quader)`)).join('')}</div>
<p>Dazu die letzte Bild-zu-Bild-Rückgabe für das entfallene <code>_0</code>: <code>assets/rejected/ice_block_0_kontext_resculpt.png</code> — kontext hat es nicht gedreht, sondern neu modelliert (Volumen −45 %, flache Bruchflächen weg).</p>
<h3>ice_rubble — verworfen</h3>
<div class="row">${[1, 3, 4].map((i) => img(`rej-ice_rubble-${i}`, `VERWORFEN ice_rubble_${i}`)).join('')}</div>

<h2>2 — Auf der Zielkachel, Spielskala (zoom 1, dpr 3 → Kachel 144×72)</h2>
<p>Linke Zelle jeweils die nackte Kachel als Referenz, danach Variante 0..4.</p>
<h3>ice_block auf glacier</h3><div class="row">${img('row-ice_block-glacier-vac', 'glacier, Vakuum (Spielzustand)')}</div>
<div class="row">${img('row-ice_block-glacier-lit', 'dieselbe Reihe ohne Vakuum — nur als Lupe')}</div>
<h3>ice_rubble auf permafrost / tundra</h3>
<div class="row">${img('row-ice_rubble-permafrost-vac', 'permafrost, Vakuum')}${img('row-ice_rubble-permafrost-lit', 'permafrost ohne Vakuum — Lupe')}</div>
<div class="row">${img('row-ice_rubble-tundra-vac', 'tundra, Vakuum')}</div>
<div class="row">${img('row-ice_rubble-tundra-lit', 'tundra ohne Vakuum — Lupe')}</div>

<h2>3 — Andere Zoomstufen</h2>
<p>LESSONS § 5: das Urteil über „zugebaut" fällt auf der KLEINSTEN Zoomstufe, auf der es vorkommt.</p>
<div class="row">${img('row-in-ice_block-glacier', 'zoom 2 — Kachel 288×144, Mip @half')}</div>
<div class="row">${img('row-far-ice_block-glacier', 'zoom 0.5 — Kachel 72×36, Mip @eighth')}</div>
<div class="row">${img('row-in-ice_rubble-permafrost', 'permafrost, zoom 2')}${img('row-in-ice_rubble-tundra', 'tundra, zoom 2')}</div>
<div class="row">${img('row-far-ice_rubble-tundra', 'tundra, zoom 0.5')}${img('row-far-ice_rubble-permafrost', 'permafrost, zoom 0.5')}</div>

<h2>4 — Felder, gelegt vom ECHTEN <code>propLayout</code></h2>
<div class="note"><b>Diese Panels bauen den Prop-Layer nicht mehr nach — sie rufen ihn auf.</b>
<code>scripts/props-layout-bridge.cjs</code> lädt <code>src/views/grid/propLayout.ts</code> über einen
TypeScript-Transpile-Hook; Anzahl, <code>dx</code>/<code>dy</code> über <code>JITTER 0.28</code>,
Skalierung über <code>PROP_SCALE_MIN 0.85 … MAX 1.15</code> mal Höhenfaktor, Variante und Key-Hash
sind der ausgelieferte Code. Nur die Zeichen-Geometrie ist aus <code>PlanetSurface.tsx</code>
übernommen (Ankerpunkt Südspitze, <code>drawH = 28 × scale</code>, Sortierung nach
<code>posX+posY</code> dann <code>dy</code>).<br>
<b>Ersetzt wird ausschließlich</b> <code>spriteCache</code> (nutzt <code>import.meta.glob</code>, gibt
hier nur <code>propVariantCount</code> zurück) und <code>propThemes</code> für genau diese drei Biome
— die haben noch keinen Eintrag, und diese Runde schreibt nichts unter <code>src/</code>.
<b>Echte Layout-Mathematik, vorgeschlagene Konfiguration.</b><br><br>
Die vorherige Fassung setzte <b>ein</b> Prop je Kachel auf die <b>Südspitze</b> in Einheitsgröße —
Rudi: „oft sind auf einem tile mehrere props positioniert. dafür sind die props selbst dann etwas
kleiner". Die alte Höhenfaktor-Empfehlung stammte aus diesem falschen Modell.</div>

<h3>Der Vorschlag auf den drei Zielbiomen</h3>
<div class="row">
${img('field-glacier', 'glacier · ice_block · 2..4 + null · minG 0 · f 0.45 → 1.38 Props/Kachel, 10.7 % leer, 44 % mit zwei')}
${img('field-permafrost', 'permafrost · ice_rubble · 2..4 + null · minG 0 · f 0.20 → 1.38/Kachel, Ink 6.8 %')}
</div>
<div class="row">
${img('field-tundra', 'tundra · ice_rubble · 2..4 + null · Default minG 1 · f 0.20 → 0.84/Kachel, 46.7 % leer')}
${img('field-in-glacier', 'glacier bei zoom 2 — die Einzelplatzierung im Detail')}
</div>

<h3>Übersicht — dort entscheidet sich „zugebaut"</h3>
<div class="row">
${img('field-far-glacier', 'glacier, zoom 0.5, 10×10')}
${img('field-far-permafrost', 'permafrost, zoom 0.5, 10×10')}
</div>
<div class="row">${img('field-far-tundra', 'tundra, zoom 0.5, 10×10')}</div>

<h2>5 — <code>minG</code>: die Existenzfrage der Runde</h2>
<p>Das FROZEN-Regime liegt bei <b>75 % g = 0</b> (glacier, permafrost) gegen <b>39,9 %</b> bei tundra
— tundra ist ein anderes Regime (mean 0,93 gegen 0,33). Ohne <code>minG: 0</code> bleiben drei von
vier Kacheln leer.</p>
<div class="row">
${img('field-glacier', 'glacier · minG 0 → 10.7 % leer')}
${img('field-glacier-minG1', 'glacier · minG 1 (Default) → 75 % leer')}
</div>
<div class="row">
${img('field-permafrost', 'permafrost · minG 0 → 10.7 % leer')}
${img('field-permafrost-minG1', 'permafrost · minG 1 → 75 % leer')}
</div>
<div class="row">
${img('field-tundra', 'tundra · Default minG 1 → 46.7 % leer ✅ empfohlen')}
${img('field-tundra-minG0', 'tundra · minG 0 → nur 9.3 % leer, zu voll für „verteilt"')}
</div>

<h2>6 — Zwei getrennte Leitern</h2>
<p><b>Größe und Dichte nie gleichzeitig senken</b> (LESSONS § 7) — also nie eine Diagonale. Leiter A
bewegt den Höhenfaktor bei fester Konfiguration, Leiter B das Band bei festem Faktor.</p>

<h3>Leiter A — Höhenfaktor, Konfiguration fest (2..4 + null, minG 0)</h3>
<div class="row">
${img('size-field-glacier-040', 'ice_block f 0.40 — Ink 16.4 %')}
${img('size-field-glacier-045', 'ice_block f 0.45 — Ink 20.0 % ✅ empfohlen')}
</div>
<div class="row">
${img('size-field-glacier-050', 'ice_block f 0.50 — Ink 24.7 %')}
${img('size-field-glacier-055', 'ice_block f 0.55 — Ink 29.9 %')}
</div>
<div class="row">
${img('size-field-permafrost-016', 'ice_rubble f 0.16 — Ink 4.4 %')}
${img('size-field-permafrost-020', 'ice_rubble f 0.20 — Ink 6.8 % ✅ empfohlen')}
</div>
<div class="row">
${img('size-field-permafrost-024', 'ice_rubble f 0.24 — Ink 9.8 %')}
${img('size-field-permafrost-030', 'ice_rubble f 0.30 — Ink 15.3 % (die alte Empfehlung)')}
</div>

<h3>Leiter B — Dichteband, Höhenfaktor fest</h3>
<div class="row">
${img('dens-field-glacier-1-2', 'glacier 1..2 ohne Sentinel — genau ein Sérac auf 99 % der Kacheln')}
${img('dens-field-glacier-2-4n', 'glacier 2..4 + null ✅ empfohlen')}
</div>
<div class="row">${img('dens-field-glacier-3-4n', 'glacier 3..4 + null — 2.0/Kachel, 30 % mit drei')}</div>
<div class="row">
${img('dens-field-permafrost-1-2', 'permafrost 1..2 ohne Sentinel')}
${img('dens-field-permafrost-2-4n', 'permafrost 2..4 + null ✅ empfohlen')}
</div>
<div class="row">${img('dens-field-permafrost-3-4n', 'permafrost 3..4 + null')}</div>

<h3>Die Varianten einzeln, auf der Kachel</h3>
<p>Ein Stück je Zelle, linke Zelle die nackte Kachel — zum Beurteilen des Einzelsprites, nicht der
Belegung.</p>
<div class="row">${img('row-ice_block-glacier-vac', 'ice_block auf glacier, f 0.45')}</div>
<div class="row">${img('row-ice_rubble-permafrost-vac', 'ice_rubble auf permafrost, f 0.20')}</div>
<div class="row">${img('row-ice_rubble-tundra-vac', 'ice_rubble auf tundra, f 0.20')}</div>
<div class="row">${img('row-in-ice_block-glacier', 'zoom 2')}${img('row-far-ice_block-glacier', 'zoom 0.5')}</div>

<h2>7 — Die Ton-Leiter für ice_rubble, und die Sonden</h2>
<p>Der Kandidat steht bei Luminanz 72. Rechts derselbe Satz auf <b>97,6</b> — der Pegel, auf dem
<code>rock_snow</code> liegt und mit dem es verworfen wurde.</p>
<div class="row">
${img('field-tundra', 'tundra · lum 72 (Kandidat)')}
${img('field-tundra-tone120', 'tundra · lum 86 (×1.20)')}
</div>
<div class="row">
${img('field-tundra-tone136', 'tundra · lum 97.6 = rock_snow-Pegel')}
${img('field-permafrost-tone136', 'permafrost auf rock_snow-Pegel')}
</div>
<h3>Sonden: frozen_lake und crevasse</h3>
<p><code>crevasse</code> ist der heikle Fall — die Klüfte sind <b>Vertiefungen</b> und stehen bereits
in der Kachel (LESSONS § 6); Props dürfen sie nicht zudecken.</p>
<div class="row">
${img('field-frozen_lake', 'frozen_lake · minG 0')}
${img('field-crevasse', 'crevasse · Default minG 1, damit die Klüfte frei bleiben')}
</div>
<div class="row">
${img('row-ice_block-frozen_lake-vac', 'ice_block auf frozen_lake')}
${img('row-ice_block-crevasse-vac', 'ice_block auf crevasse')}
</div>

<h2>8 — Anhang: Einzelsprite-Leitern und die restlichen Zoomstufen</h2>
<p>Die Leitern aus Abschnitt 6 auf EINEM Stück je Zelle statt im Feld — nützlich, um die reine
Sprite-Größe zu vergleichen, aber <b>nicht</b> die Grundlage der Empfehlung: die fällt am Feld mit
echter Belegung.</p>
<div class="row">${['0.4','0.45','0.5','0.55'].map((f) => img(`size-ice_block-${f}`, `ice_block f ${f}`)).join('')}</div>
<div class="row">${['0.16','0.2','0.24','0.3'].map((f) => img(`size-ice_rubble-${f}`, `ice_rubble f ${f}`)).join('')}</div>
<div class="row">
${img('row-in-ice_block-frozen_lake', 'frozen_lake, zoom 2')}
${img('row-in-ice_block-crevasse', 'crevasse, zoom 2')}
</div>
<div class="row">
${img('row-far-ice_block-frozen_lake', 'frozen_lake, zoom 0.5')}
${img('row-far-ice_block-crevasse', 'crevasse, zoom 0.5')}
</div>
<div class="row">
${img('row-ice_block-frozen_lake-lit', 'frozen_lake ohne Vakuum — Lupe')}
${img('row-ice_block-crevasse-lit', 'crevasse ohne Vakuum — Lupe')}
</div>

<h2>9 — Zahlen</h2>
<h3>Pegel, Farbe, Blowout (opake Pixel, alle Slots / alle Varianten)</h3>
${numTable}
<p><b>Vorbehalt zu jeder Spalte.</b> <code>Blowout</code> ist laut LESSONS § 5 <i>keine</i>
Zustandsdiagnose, sondern nur eine Rundengrenze — hier ist genau das gemeint: die Zielkacheln
liegen bei 0.00 %, <code>rock_snow</code> bei 11.78 %, und das ist der Unterschied, den keine
Dichte wegregelt. <code>sd</code> über eine ganze Sprite-Familie mischt Objekt und Schatten und ist
nicht mit der Kachel-sd vergleichbar. <code>B/R</code> ist bei niedriger Sättigung wenig
aussagekräftig (LESSONS § 5, Violett-Achse) — es trennt hier nur „kühl" von „warm", nicht mehr.</p>
<h3>Geometrie und Zeichengröße</h3>
${geomTable}
<h3>Dichte: countForG × gemessenes g-Histogramm</h3>
${densTable}
`;
  fs.writeFileSync(path.join(SHEET_DIR, `${PFX}_sheet.html`), html);
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
