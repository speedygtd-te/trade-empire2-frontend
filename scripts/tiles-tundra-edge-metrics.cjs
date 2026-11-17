/**
 * EDGE METRICS, throwaway diagnostic for the tundra hero4 run.
 *
 * Two numbers the interior measurements cannot give:
 *
 * (1) BOUNDARY STEP. In the real interlocking layout, sample the luma 4px inside
 *     a tile along its diamond edge and 4px on the other side (which belongs to
 *     the neighbouring tile) and average |dL|. That IS the visible seam. It is
 *     compared with the tile's own interior micro-contrast at the same 8px stride
 *     -- a step that is no bigger than the texture's own roughness cannot be read
 *     as a line. Measured for SHIPPED, the uncorrected W082 rung, and NEW.
 *
 * (2) RIM HALO. Mean luma in a 1-4px band just inside the diamond boundary
 *     against a 10-24px band further in, per slot. A divide-by-blur equalization
 *     shows up here as a bright rim; a global plane must show ~nothing.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const WORK = path.join(ST, 'tundra_iter2');
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const W = 512, H = 256;

const SETS = [
  { id: 'SHIPPED tundra', files: [0, 1, 2, 3].map((n) => path.join(WORK, 'src', 'tundra_' + n + '_src.webp')) },
  { id: 'W082 uncorrected', files: [0, 1, 2, 3].map((n) => path.join(WORK, 'ladder', 'tundra_W082_' + n + '.webp')) },
  { id: 'NEW hero4', files: [0, 1, 2, 3].map((n) => path.join(WORK, 'final', 'tundra_' + n + '.webp')) },
];

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** composite an interlocking field and return {L, A, w, h, cells} */
async function field(files, rows, cols, seed) {
  const bufs = [];
  for (const f of files) bufs.push(await sharp(fs.readFileSync(f)).resize(W, H, { fit: 'fill' }).png().toBuffer());
  const rnd = mulberry32(seed);
  const cells = [];
  let mr = 0, mb = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * W + (r % 2 ? W / 2 : 0), y = (r * H) / 2;
    cells.push({ input: bufs[Math.floor(rnd() * 4)], left: x, top: y });
    mr = Math.max(mr, x + W); mb = Math.max(mb, y + H);
  }
  const png = await sharp({ create: { width: mr, height: mb, channels: 4, background: { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 } } })
    .composite(cells).png().toBuffer();
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, w = info.width, h = info.height;
  const L = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) L[p] = L709(data[p * ch], data[p * ch + 1], data[p * ch + 2]);
  return { L, w, h, cells };
}

/** (1) boundary step vs interior roughness at the same stride */
async function boundaryStep(files) {
  const F = await field(files, 8, 5, 4242);
  const at = (x, y) => (x < 1 || y < 1 || x >= F.w - 1 || y >= F.h - 1) ? null : F.L[Math.round(y) * F.w + Math.round(x)];
  const D = 4;                       // how far either side of the edge we sample
  const edges = [                    // unit inward normals of the four diamond edges
    { name: 'UL', nx: 1, ny: 1 }, { name: 'UR', nx: -1, ny: 1 },
    { name: 'LL', nx: 1, ny: -1 }, { name: 'LR', nx: -1, ny: -1 },
  ];
  let s = 0, n = 0;
  for (const c of F.cells) {
    // skip the outer ring of tiles, they have no neighbour on some sides
    if (c.left < W || c.top < H / 2 || c.left + W > F.w - W || c.top + H > F.h - H / 2) continue;
    for (const e of edges) {
      for (let t = 0.18; t <= 0.82; t += 0.02) {
        // point on that edge
        let ex, ey;
        if (e.name === 'UL') { ex = c.left + t * (W / 2); ey = c.top + H / 2 - t * (H / 2); }
        else if (e.name === 'UR') { ex = c.left + W / 2 + t * (W / 2); ey = c.top + t * (H / 2); }
        else if (e.name === 'LL') { ex = c.left + t * (W / 2); ey = c.top + H / 2 + t * (H / 2); }
        else { ex = c.left + W / 2 + t * (W / 2); ey = c.top + H - t * (H / 2); }
        const len = Math.hypot(e.nx, e.ny * 2);          // iso aspect: dy counts double
        const ux = (e.nx / len), uy = (e.ny * 2 / len) / 2;
        const a = at(ex + ux * D, ey + uy * D), b = at(ex - ux * D, ey - uy * D);
        if (a === null || b === null || a < 2 || b < 2) continue;
        s += Math.abs(a - b); n++;
      }
    }
  }
  // interior roughness at the SAME 8px stride, so the two are comparable
  let is = 0, ino = 0;
  for (const c of F.cells) {
    if (c.left < W || c.top < H / 2 || c.left + W > F.w - W || c.top + H > F.h - H / 2) continue;
    for (let dy = -40; dy <= 40; dy += 7) for (let dx = -120; dx <= 120; dx += 11) {
      const x = c.left + W / 2 + dx, y = c.top + H / 2 + dy;
      const a = at(x - 4, y), b = at(x + 4, y);
      if (a === null || b === null || a < 2 || b < 2) continue;
      is += Math.abs(a - b); ino++;
    }
  }
  return { step: n ? s / n : 0, rough: ino ? is / ino : 0, n };
}

/** (2) rim band vs inner band, per slot */
async function rimHalo(file) {
  const { data, info } = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, w = info.width, h = info.height;
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  // |x-cx|/(w/2) + |y-cy|/(h/2) = 1 is the diamond boundary; d = 1 - that, in px
  let rs = 0, rn = 0, ins = 0, inn = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (data[i + 3] < 250) continue;
    const u = Math.abs(x - cx) / (w / 2) + Math.abs(y - cy) / (h / 2);
    const dpx = (1 - u) * (w / 4);   // approx distance to the edge in px
    const L = L709(data[i], data[i + 1], data[i + 2]);
    if (dpx >= 1 && dpx <= 4) { rs += L; rn++; }
    else if (dpx >= 10 && dpx <= 24) { ins += L; inn++; }
  }
  return { rim: rn ? rs / rn : 0, inner: inn ? ins / inn : 0, d: (rn && inn) ? rs / rn - ins / inn : 0 };
}

const f2 = (x) => x.toFixed(2);
(async () => {
  console.log('(1) BOUNDARY STEP in the interlocking field -- mean |dL| across a tile edge at +-4px,');
  console.log('    against the tile interior roughness at the SAME 8px stride. ratio < 1 = the step is');
  console.log('    smaller than the texture is rough by itself, i.e. no readable line.\n');
  console.log('    set                 step   interior   ratio');
  const res = [];
  for (const s of SETS) {
    res.push({ id: s.id, ...(await boundaryStep(s.files)) });
  }
  for (const r of res) {
    console.log('    ' + r.id.padEnd(20) + f2(r.step).padStart(5) + '    ' + f2(r.rough).padStart(6) + '   ' + f2(r.step / r.rough).padStart(5));
  }
  console.log('\n(2) RIM HALO per slot -- mean luma 1-4px inside the diamond boundary minus 10-24px inside.');
  console.log('    a divide-by-blur equalization shows a bright rim here; a global plane must show ~0.\n');
  console.log('    set                slot   rim    inner    delta');
  for (const s of SETS) {
    for (let n = 0; n < 4; n++) {
      const r = await rimHalo(s.files[n]);
      console.log('    ' + s.id.padEnd(19) + n + '   ' + f2(r.rim).padStart(6) + '  ' + f2(r.inner).padStart(6) + '   ' + (r.d >= 0 ? '+' : '') + f2(r.d));
    }
  }
})();
