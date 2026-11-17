/**
 * ice_shelf QA MEASUREMENT (local only, no fal.ai, read-only).
 *
 * THE DECIDING CRITERION, ROUND 8 (Rudi): "ice shelf passt noch nicht ganz, da
 * die Schollen alle nur mittig zentriert sind und die Raender komplett frei
 * sind. das kachelt dann wieder nicht gut."
 *
 * That retires the rule this script was originally written for. Rounds 1-7
 * chased N = the min perpendicular distance from any ice pixel to the diamond
 * edge and pushed it to N >= 24 px -- which only moved the tiling defect to the
 * other end. Before: ice glued to the rim, so the mosaic showed a grid of
 * seams. After: ice only in the middle, so the mosaic shows a DOT GRID with
 * water lanes between the tiles. Both are regular patterns. A floe clipped by
 * the diamond is fine -- every other biome clips its rocks and plants the same
 * way, and at 48 px on-screen per tile a clipped floe is invisible. What IS
 * visible is the coverage pattern across the surface.
 *
 * SO THE CRITERION IS NOW COVERAGE UNIFORMITY -- the metric that confirmed
 * Rudi's kelp_forest hero: the share of ice pixels in the RIM BAND against the
 * share in the INTERIOR, split on the normalised diamond radius
 *     d = |x/W - 0.5| * 2 + |y/H - 0.5| * 2         (d <= 1 inside the diamond)
 *     rim band  d > BAND (0.82)        interior  d <= BAND
 * counting only pixels with alpha > 0. Target |bandShare - innerShare| <= 3
 * percentage points per slot. kelp_forest reference: accepted hero 31.1 % rim
 * vs 33.0 % inner (delta 1.9 pp), rejected ones delta 9.2-9.3 pp.
 *
 * Reported alongside, because a per-slot-uniform set can still tile as a
 * pattern:
 *  - CENTROID of the ice mask, normalised to the diamond (cx, cy in -1..1).
 *    The four slots must SCATTER; if every slot piles its ice in the same spot
 *    the mosaic gets a rhythm again.
 *  - N and rim pixel count: still measured, no longer a pass/fail gate.
 *  - RIM WATER lum and hf = mean |L - blur3(L)| over the OPEN WATER pixels of
 *    the outer rim band. That is the water-character figure the v4 kontext
 *    prompt was written for: all four slots must carry the SAME amount of
 *    surface structure or the mosaic reads as a patchwork of flat and textured
 *    tiles.
 *
 * ICE DETECTION -- the hard part is that foam streaks are bright too, and they
 * MAY touch the edge (they are a water feature and tile fine). Floes are THICK
 * blobs, foam is THIN lines, so:
 *   1. bright mask   L > lo + f * (hi - lo)   (lo = dark-half mean = water,
 *                                              hi = 97th pct = ice)
 *   2. EROSION by r px removes every structure thinner than 2r  -> foam gone
 *   3. connected components on the eroded cores; cores >= minArea are floes
 *   4. the reported distance covers the FULL bright pixels reachable from a
 *      surviving core (flood fill back out), i.e. the real floe outline.
 *
 * Usage:
 *   node scripts/ice-shelf-edge-measure.cjs src/assets/tiles/ice_shelf/ice_shelf_1.webp
 *   node scripts/ice-shelf-edge-measure.cjs --set=src/assets/tiles/ice_shelf/ice_shelf_%d.webp
 *   node scripts/ice-shelf-edge-measure.cjs --set=assets/style-test/tiles/ice_shelf_k%d.png
 *   ... [--frac=0.45] [--erode=3] [--min-area=60] [--band=0.82] [--rim=18] [--dump=out.png]
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const S5 = Math.sqrt(5);

/** perpendicular distance of (x,y) to the nearest of the four diamond edges */
function edgeDist(x, y) {
  const a = Math.abs(x + 2 * y - 256) / S5;   // upper-left
  const b = Math.abs(x - 2 * y - 256) / S5;   // upper-right
  const c = Math.abs(x - 2 * y + 256) / S5;   // lower-left
  const d = Math.abs(x + 2 * y - 768) / S5;   // lower-right
  return Math.min(a, b, c, d);
}

/** normalised diamond radius: 0 at the centre, 1 on the boundary */
const diamondR = (x, y, w, h) => Math.abs(x / w - 0.5) * 2 + Math.abs(y / h - 0.5) * 2;

/**
 * 3x3 box blur of a luma plane, restricted to pixels the mask allows. The
 * high-frequency figure is mean |L - blur3(L)|; blurring across the transparent
 * corners would invent structure at the rim, hence the mask.
 */
function blur3(L, mask, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (!mask[q]) continue;
          s += L[q]; n++;
        }
      }
      out[y * w + x] = n ? s / n : L[y * w + x];
    }
  }
  return out;
}

function erode(mask, w, h, r) {
  let cur = mask;
  for (let it = 0; it < r; it++) {
    const nxt = new Uint8Array(cur.length);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        if (!cur[p]) continue;
        if (cur[p - 1] && cur[p + 1] && cur[p - w] && cur[p + w]) nxt[p] = 1;
      }
    }
    cur = nxt;
  }
  return cur;
}

function labelComponents(mask, w, h) {
  const lab = new Int32Array(mask.length).fill(-1);
  const sizes = [];
  const stack = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || lab[s] !== -1) continue;
    const id = sizes.length;
    let n = 0;
    stack.push(s); lab[s] = id;
    while (stack.length) {
      const p = stack.pop(); n++;
      const x = p % w, y = (p - x) / w;
      if (x > 0 && mask[p - 1] && lab[p - 1] === -1) { lab[p - 1] = id; stack.push(p - 1); }
      if (x < w - 1 && mask[p + 1] && lab[p + 1] === -1) { lab[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && mask[p - w] && lab[p - w] === -1) { lab[p - w] = id; stack.push(p - w); }
      if (y < h - 1 && mask[p + w] && lab[p + w] === -1) { lab[p + w] = id; stack.push(p + w); }
    }
    sizes.push(n);
  }
  return { lab, sizes };
}

/** flood the full bright mask outwards from the surviving eroded cores */
function reachable(bright, cores, w, h) {
  const out = new Uint8Array(bright.length);
  const stack = [];
  for (let p = 0; p < cores.length; p++) if (cores[p] && bright[p]) { out[p] = 1; stack.push(p); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p - x) / w;
    const push = (q) => { if (bright[q] && !out[q]) { out[q] = 1; stack.push(q); } };
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  return out;
}

async function measure(file, opt) {
  const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
  const { data, info } = await sharp(abs).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const lums = [], L = new Float32Array(w * h);
  const alpha = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * ch;
    alpha[p] = data[i + 3];
    L[p] = L709(data[i], data[i + 1], data[i + 2]);
    if (data[i + 3] >= 8) lums.push(L[p]);
  }
  lums.sort((a, b) => a - b);
  const halfN = Math.max(1, Math.floor(lums.length / 2));
  const lo = lums.slice(0, halfN).reduce((s, v) => s + v, 0) / halfN;
  const hi = lums[Math.min(lums.length - 1, Math.floor(lums.length * 0.97))];
  const thr = lo + opt.frac * (hi - lo);

  const bright = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) if (alpha[p] >= 8 && L[p] > thr) bright[p] = 1;
  const eroded = erode(bright, w, h, opt.erode);
  const { lab, sizes } = labelComponents(eroded, w, h);
  const bigIds = new Set();
  for (let id = 0; id < sizes.length; id++) if (sizes[id] >= opt.minArea) bigIds.add(id);
  const keep = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) if (lab[p] >= 0 && bigIds.has(lab[p])) keep[p] = 1;
  const ice = reachable(bright, keep, w, h);

  const { lab: labIce, sizes: sizesIce } = labelComponents(ice, w, h);
  const floeMin = new Array(sizesIce.length).fill(Infinity);
  let minD = Infinity, minAt = null, iceN = 0, iceL = 0, touch = 0;
  for (let p = 0; p < w * h; p++) {
    if (!ice[p]) continue;
    const x = p % w, y = (p - x) / w;
    const d = edgeDist(x, y);
    iceN++; iceL += L[p];
    if (d < minD) { minD = d; minAt = [x, y]; }
    if (d < 2) touch++;
    if (d < floeMin[labIce[p]]) floeMin[labIce[p]] = d;
  }
  const perFloe = [];
  for (let id = 0; id < sizesIce.length; id++) if (sizesIce[id] >= 40) perFloe.push({ px: sizesIce[id], d: floeMin[id] });
  perFloe.sort((a, b) => a.d - b.d);

  let wN = 0, wL = 0, inN = 0;
  for (let p = 0; p < w * h; p++) {
    if (alpha[p] < 8) continue;
    inN++;
    if (!ice[p]) { wN++; wL += L[p]; }
  }

  // ---- COVERAGE UNIFORMITY (the round-8 criterion) + ice centroid ----------
  let bandN = 0, bandIce = 0, innN = 0, innIce = 0, cx = 0, cy = 0, cn = 0;
  for (let p = 0; p < w * h; p++) {
    if (alpha[p] < 8) continue;
    const x = p % w, y = (p - x) / w;
    if (diamondR(x, y, w, h) > opt.band) { bandN++; if (ice[p]) bandIce++; }
    else { innN++; if (ice[p]) innIce++; }
    if (ice[p]) { cx += x; cy += y; cn++; }
  }
  const bandShare = bandN ? bandIce / bandN : 0;
  const innShare = innN ? innIce / innN : 0;
  const centroid = cn
    ? { x: cx / cn, y: cy / cn, nx: (cx / cn - w / 2) / (w / 2), ny: (cy / cn - h / 2) / (h / 2) }
    : null;

  // ---- rim-band open-water character: level + high-frequency structure -----
  const inside = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) if (alpha[p] >= 8) inside[p] = 1;
  const Lb = blur3(L, inside, w, h);
  let rwN = 0, rwL = 0, rwHf = 0;
  for (let p = 0; p < w * h; p++) {
    if (!inside[p] || ice[p]) continue;
    const x = p % w, y = (p - x) / w;
    if (edgeDist(x, y) >= opt.rim) continue;
    rwN++; rwL += L[p]; rwHf += Math.abs(L[p] - Lb[p]);
  }

  if (opt.dump) {
    const vis = Buffer.alloc(w * h * 4);
    for (let p = 0; p < w * h; p++) {
      const i = p * ch, o = p * 4;
      vis[o] = data[i]; vis[o + 1] = data[i + 1]; vis[o + 2] = data[i + 2]; vis[o + 3] = alpha[p];
      if (ice[p]) { vis[o] = 255; vis[o + 1] = 40; vis[o + 2] = 160; }
    }
    await sharp(vis, { raw: { width: w, height: h, channels: 4 } }).png().toFile(opt.dump);
  }

  return {
    file, w, h, lo, hi, thr, nFloes: bigIds.size,
    minD: iceN ? minD : Infinity, minAt,
    iceShare: iceN / inN, iceLum: iceN ? iceL / iceN : 0,
    waterLum: wN ? wL / wN : 0, touchPx: touch,
    perFloe: perFloe.slice(0, 10),
    bandShare, innShare, delta: Math.abs(bandShare - innShare) * 100, centroid,
    rimWaterLum: rwN ? rwL / rwN : 0, rimHf: rwN ? rwHf / rwN : 0, rimN: rwN,
  };
}

const f1 = (x) => (isFinite(x) ? x.toFixed(1) : 'n/a');

(async () => {
  const args = process.argv.slice(2);
  const num = (n, d) => { const a = args.find((x) => x.startsWith('--' + n + '=')); return a ? Number(a.slice(n.length + 3)) : d; };
  const dumpArg = args.find((a) => a.startsWith('--dump='));
  const opt = {
    frac: num('frac', 0.45), erode: num('erode', 3), minArea: num('min-area', 60),
    band: num('band', 0.82), rim: num('rim', 18),
    dump: dumpArg ? dumpArg.slice(7) : null,
  };
  const setArg = args.find((a) => a.startsWith('--set='));
  const files = setArg
    ? [0, 1, 2, 3].map((n) => setArg.slice(6).replace('%d', String(n)))
    : args.filter((a) => !a.startsWith('--'));
  if (!files.length) { console.error('usage: node scripts/ice-shelf-edge-measure.cjs <file...> | --set=path_%d.webp'); process.exit(1); }
  console.log('ice detect: L > lo + ' + opt.frac + '*(hi-lo), erode ' + opt.erode + 'px, core >= ' + opt.minArea + 'px');
  console.log('CRITERION (round 8): coverage uniformity -- |rim band share - interior share| <= 3.0 pp,');
  console.log('  band split at normalised diamond radius d > ' + opt.band + ', rim water measured within ' + opt.rim + ' px of the edge.');
  console.log('N (min perpendicular ice-to-edge distance) is informational only -- clipped floes are allowed.');
  for (const f of files) {
    const abs = path.isAbsolute(f) ? f : path.join(ROOT, f);
    if (!fs.existsSync(abs)) { console.log('  MISSING ' + f); continue; }
    const r = await measure(f, opt);
    console.log(
      '\n' + path.basename(r.file) + '  ' + r.w + 'x' + r.h + '\n' +
      '  water lum ' + f1(r.waterLum) + '   ice lum ' + f1(r.iceLum) +
      '   ratio x' + f1(r.iceLum / r.waterLum) +
      '   ice share ' + (r.iceShare * 100).toFixed(1) + '%   floes ' + r.nFloes + '\n' +
      '  coverage  band ' + (r.bandShare * 100).toFixed(1) + '%  inner ' + (r.innShare * 100).toFixed(1) +
      '%  delta ' + r.delta.toFixed(1) + ' pp' + (r.delta <= 3 ? '  ok' : '  <-- UNEVEN COVERAGE') + '\n' +
      '  centroid  ' + (r.centroid ? '(' + f1(r.centroid.x) + ',' + f1(r.centroid.y) + ')  normalised (' +
        r.centroid.nx.toFixed(3) + ',' + r.centroid.ny.toFixed(3) + ')' : 'n/a') + '\n' +
      '  rim water lum ' + f1(r.rimWaterLum) + '   hf ' + r.rimHf.toFixed(2) + '   (n=' + r.rimN + ')\n' +
      '  N = ' + f1(r.minD) + ' px' + (r.minAt ? ' at (' + r.minAt[0] + ',' + r.minAt[1] + ')' : '') +
      '   rim px (<2) ' + r.touchPx + '   [informational]\n' +
      '  per-floe edge distance: ' + r.perFloe.map((p) => p.px + 'px@' + f1(p.d)).join('  ')
    );
  }
})();
