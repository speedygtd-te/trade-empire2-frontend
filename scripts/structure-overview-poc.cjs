/**
 * STRUCTURE OVERVIEW — OUTLINE RENDER PROOF OF CONCEPT (local only, no network).
 *
 * Reads a real structure snapshot (Shadow Nexus I) and renders VECTOR OUTLINE
 * drawings of it: per z-level the boundary of the occupied-cell set — including
 * the boundary of every interior hole, which is not a special case (an edge is
 * a boundary edge iff the neighbour cell is empty).
 *
 * Pipeline: cells -> directed boundary half-edges -> chained closed rings ->
 * collinear collapse -> project to iso screen space -> Douglas-Peucker in
 * TARGET PIXEL space -> SVG -> sharp -> PNG.
 *
 * The DP simplification happens after projection to the final pixel scale on
 * purpose: at 200x200 a whole tile is ~2.3 px wide, so a tolerance of ~0.5 px
 * removes the staircase noise that would otherwise turn the drawing into mush.
 *
 * Projection is taken verbatim from src/views/grid/isoConstants.ts:
 *   TW=48 TH=24 TZ=16 ;  sx=(wx-wy)*24 ; sy=(wx+wy)*12 - wz*TZ
 * The only thing varied is the z step (TZ vs exaggerated), which is the
 * interesting design variable here.
 *
 * NOTHING in src/ is touched. Output: assets/style-test/structure-overview/
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// ── config ────────────────────────────────────────────────────────────────
const SNAPSHOT =
  process.env.SNAPSHOT ||
  'C:/Users/SPEEDY~1/AppData/Local/Temp/claude/F--Trade-Empire-Frontend/c8323739-b1d3-47a6-81a5-4789cbef0bd7/scratchpad/snapshot.json';
const OUT = path.resolve(__dirname, '../assets/style-test/structure-overview');

const TW = 48;
const TH = 24;
const HW = TW / 2; // 24
const HH = TH / 2; // 12

const BG = '#0b0f18'; // app-ish dark ground
const REF_LEVEL = -3; // largest level (1915 hulls)

// ── lattice helpers ───────────────────────────────────────────────────────
const K = (a, b) => a + ',' + b;

/**
 * Boundary rings of a set of cells, as closed loops of lattice corner nodes.
 * Corner (a,b) of the lattice sits at screen ((a-b)*HW, (a+b)*HH - HH).
 * Cell (x,y) has corners (x,y) top, (x+1,y) right, (x+1,y+1) bottom, (x,y+1) left.
 * Half-edges are emitted clockwise around each filled cell, so every boundary
 * edge carries exactly one direction and in-degree == out-degree at each node.
 */
function traceRings(cells) {
  const out = new Map();
  const push = (a1, b1, a2, b2) => {
    const k = K(a1, b1);
    let arr = out.get(k);
    if (!arr) out.set(k, (arr = []));
    arr.push([a2, b2]);
  };
  for (const c of cells) {
    const i = c.indexOf(',');
    const x = +c.slice(0, i);
    const y = +c.slice(i + 1);
    if (!cells.has(K(x, y - 1))) push(x, y, x + 1, y); // top -> right
    if (!cells.has(K(x + 1, y))) push(x + 1, y, x + 1, y + 1); // right -> bottom
    if (!cells.has(K(x, y + 1))) push(x + 1, y + 1, x, y + 1); // bottom -> left
    if (!cells.has(K(x - 1, y))) push(x, y + 1, x, y); // left -> top
  }

  const rings = [];
  for (const startKey of [...out.keys()]) {
    let arr = out.get(startKey);
    while (arr && arr.length) {
      const i = startKey.indexOf(',');
      const sa = +startKey.slice(0, i);
      const sb = +startKey.slice(i + 1);
      const ring = [[sa, sb]];
      let ca = sa;
      let cb = sb;
      let da = 0;
      let db = 0;
      for (;;) {
        const cand = out.get(K(ca, cb));
        if (!cand || !cand.length) break; // defensive; should not happen
        // prefer straight continuation -> fewer, longer polylines
        let pick = 0;
        for (let j = 0; j < cand.length; j++) {
          if (cand[j][0] - ca === da && cand[j][1] - cb === db) {
            pick = j;
            break;
          }
        }
        const nxt = cand.splice(pick, 1)[0];
        da = nxt[0] - ca;
        db = nxt[1] - cb;
        ca = nxt[0];
        cb = nxt[1];
        if (ca === sa && cb === sb) break;
        ring.push([ca, cb]);
      }
      rings.push(ring);
      arr = out.get(startKey);
    }
  }
  return rings;
}

/** collapse exactly-collinear lattice runs (closed ring) */
function collapse(ring) {
  const n = ring.length;
  if (n < 3) return ring;
  const res = [];
  for (let i = 0; i < n; i++) {
    const p = ring[(i - 1 + n) % n];
    const c = ring[i];
    const q = ring[(i + 1) % n];
    const ax = c[0] - p[0];
    const ay = c[1] - p[1];
    const bx = q[0] - c[0];
    const by = q[1] - c[1];
    if (ax !== bx || ay !== by) res.push(c);
  }
  return res.length ? res : ring;
}

/** Douglas-Peucker on an open polyline of [x,y] pixel points */
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const seg = stack.pop();
    const s = seg[0];
    const e = seg[1];
    if (e - s < 2) continue;
    const x1 = pts[s][0];
    const y1 = pts[s][1];
    const x2 = pts[e][0];
    const y2 = pts[e][1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let best = -1;
    let bestd = -1;
    for (let i = s + 1; i < e; i++) {
      const px = pts[i][0];
      const py = pts[i][1];
      let d2;
      if (len2 === 0) {
        const ex = px - x1;
        const ey = py - y1;
        d2 = ex * ex + ey * ey;
      } else {
        let t = ((px - x1) * dx + (py - y1) * dy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - (x1 + t * dx);
        const ey = py - (y1 + t * dy);
        d2 = ex * ex + ey * ey;
      }
      if (d2 > bestd) {
        bestd = d2;
        best = i;
      }
    }
    if (bestd > t2) {
      keep[best] = 1;
      stack.push([s, best], [best, e]);
    }
  }
  const res = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) res.push(pts[i]);
  return res;
}

/** connected components (4-neighbourhood) of a cell set */
function islands(cells) {
  const seen = new Set();
  let n = 0;
  for (const c of cells) {
    if (seen.has(c)) continue;
    n++;
    const st = [c];
    seen.add(c);
    while (st.length) {
      const cur = st.pop();
      const i = cur.indexOf(',');
      const x = +cur.slice(0, i);
      const y = +cur.slice(i + 1);
      const nb = [K(x + 1, y), K(x - 1, y), K(x, y + 1), K(x, y - 1)];
      for (const k of nb)
        if (cells.has(k) && !seen.has(k)) {
          seen.add(k);
          st.push(k);
        }
    }
  }
  return n;
}

// ── load + level build ────────────────────────────────────────────────────
const tLoad0 = Date.now();
const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
const tLoad = Date.now() - tLoad0;

const byZ = new Map();
let minX = 1e9;
let maxX = -1e9;
let minY = 1e9;
let maxY = -1e9;
for (const h of snap.hulls) {
  const z = h.posZ;
  let s = byZ.get(z);
  if (!s) byZ.set(z, (s = new Set()));
  s.add(K(h.posX, h.posY));
  if (h.posX < minX) minX = h.posX;
  if (h.posX > maxX) maxX = h.posX;
  if (h.posY < minY) minY = h.posY;
  if (h.posY > maxY) maxY = h.posY;
}
const zLevels = [...byZ.keys()].sort((a, b) => a - b);
const zMin = zLevels[0];
const zMax = zLevels[zLevels.length - 1];

// vertical accesses (staircase / elevator) -> anchor markers
const VERT = new Set(['STAIRCASE', 'ELEVATOR']);
const anchors = new Map(); // "x,y" -> {x,y,zTop,zBot,levels:Set}
for (const h of snap.hulls) {
  if (!VERT.has(h.moduleType)) continue;
  const k = K(h.posX, h.posY);
  let a = anchors.get(k);
  if (!a)
    anchors.set(
      k,
      (a = { x: h.posX, y: h.posY, zTop: h.posZ, zBot: h.posZ, levels: new Set() }),
    );
  a.levels.add(h.posZ);
  if (h.posZ > a.zTop) a.zTop = h.posZ;
  if (h.posZ < a.zBot) a.zBot = h.posZ;
}

// ── trace all levels once (geometry is z-step independent in lattice space) ─
const levelGeom = new Map();
let traceTotal = 0;
for (const z of zLevels) {
  const cells = byZ.get(z);
  const t0 = process.hrtime.bigint();
  const rings = traceRings(cells).map(collapse);
  const t1 = process.hrtime.bigint();
  const ms = Number(t1 - t0) / 1e6;
  traceTotal += ms;
  levelGeom.set(z, {
    rings,
    cellCount: cells.size,
    islands: islands(cells),
    rawSeg: rings.reduce((a, r) => a + r.length, 0),
    msTrace: ms,
  });
}

// ── projection / rendering ────────────────────────────────────────────────
function project(ring, z, zStep) {
  const pts = new Array(ring.length);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i][0];
    const b = ring[i][1];
    pts[i] = [(a - b) * HW, (a + b) * HH - HH - z * zStep];
  }
  return pts;
}

function contentBBox(zStep, wallFrac) {
  // Fit to the TRUE drawn geometry (every ring of every level), not to the
  // rectangular lattice bbox — that projects to a big iso diamond the structure
  // only partly fills, which left ~30% of every tile unused.
  let x0 = 1e9;
  let x1 = -1e9;
  let y0 = 1e9;
  let y1 = -1e9;
  for (const z of zLevels) {
    const b = levelBBox(z, zStep);
    if (b.x0 < x0) x0 = b.x0;
    if (b.x1 > x1) x1 = b.x1;
    if (b.y0 < y0) y0 = b.y0;
    if (b.y1 > y1) y1 = b.y1;
  }
  // side walls hang below the lowest deck's outline
  if (wallFrac) y1 += wallFrac * zStep;
  return { x0, x1, y0, y1 };
}

function levelBBox(z, zStep) {
  const g = levelGeom.get(z);
  let x0 = 1e9;
  let x1 = -1e9;
  let y0 = 1e9;
  let y1 = -1e9;
  for (const ring of g.rings)
    for (const n of ring) {
      const x = (n[0] - n[1]) * HW;
      const y = (n[0] + n[1]) * HH - HH - z * zStep;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  return { x0, x1, y0, y1 };
}

/** hex colour lerp */
function mix(c1, c2, t) {
  const p = (c) => [
    parseInt(c.slice(1, 3), 16),
    parseInt(c.slice(3, 5), 16),
    parseInt(c.slice(5, 7), 16),
  ];
  const a = p(c1);
  const b = p(c2);
  const h = (v) => Math.round(v).toString(16).padStart(2, '0');
  return (
    '#' +
    h(a[0] + (b[0] - a[0]) * t) +
    h(a[1] + (b[1] - a[1]) * t) +
    h(a[2] + (b[2] - a[2]) * t)
  );
}

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildSVG(v, targetW, targetH) {
  const bb = v.levels === 'all' ? contentBBox(v.zStep, v.body ? (v.body.wallFrac == null ? 1 : v.body.wallFrac) : 0) : levelBBox(v.levels, v.zStep);
  const cw = bb.x1 - bb.x0;
  const ch = bb.y1 - bb.y0;
  const pad = 3;
  const s = Math.min((targetW - 2 * pad) / cw, (targetH - 2 * pad) / ch);
  const ox = (targetW - cw * s) / 2 - bb.x0 * s;
  const oy = (targetH - ch * s) / 2 - bb.y0 * s;

  const zs = v.levels === 'all' ? zLevels : [v.levels];
  const parts = [];
  let segs = 0;
  const tol = v.dpTol == null ? 0.45 : v.dpTol;

  for (const z of zs) {
    const g = levelGeom.get(z);
    const t = zLevels.length > 1 ? (z - zMin) / (zMax - zMin) : 1;
    const w = v.width(t, z);
    const op = v.opacity(t, z);
    const col = v.color(t, z);
    if (op <= 0.005) continue;
    const d = [];
    const rawPolys = [];
    for (const ring of g.rings) {
      if (v.minRingCells && ring.length < v.minRingCells) continue;
      let pts = project(ring, z, v.zStep).map((p) => [p[0] * s + ox, p[1] * s + oy]);
      pts.push(pts[0]);
      pts = dp(pts, tol);
      if (pts.length < 3) continue;
      rawPolys.push(pts);
      segs += pts.length - 1;
      d.push(
        'M' + pts.map((p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L') + 'Z',
      );
    }
    if (!d.length) continue;
    if (v.body) {
      // Solid-body pass: opaque painter occlusion + extruded side walls.
      // Walls hang DOWN from this level's top face by wallFrac * zStep px, so
      // consecutive levels touch and the stack fuses into one closed volume.
      const wallH = (v.body.wallFrac == null ? 1 : v.body.wallFrac) * v.zStep * s;
      const quads = [];
      for (const poly of rawPolys) {
        for (let i = 0; i < poly.length - 1; i++) {
          const q = [
            poly[i],
            poly[i + 1],
            [poly[i + 1][0], poly[i + 1][1] + wallH],
            [poly[i][0], poly[i][1] + wallH],
          ];
          let a2 = 0;
          for (let k = 0; k < 4; k++) {
            const u = q[k];
            const uu = q[(k + 1) % 4];
            a2 += u[0] * uu[1] - uu[0] * u[1];
          }
          const qq = a2 < 0 ? q.slice().reverse() : q;
          quads.push(
            'M' + qq.map((pp) => pp[0].toFixed(2) + ' ' + pp[1].toFixed(2)).join('L') + 'Z',
          );
        }
      }
      // GROUP opacity, not fill-opacity: within one level the wall quads
      // overlap each other and the top face, so per-path alpha would compound
      // into blotches at every overlap. A <g opacity> flattens the level first
      // and composites it as ONE layer — which is also exactly the semantics
      // we want ("this deck is x% opaque over the deck below").
      const go = v.body.groupOpacity == null ? 1 : v.body.groupOpacity;
      const inner = [];
      if (quads.length)
        inner.push(
          `<path d="${quads.join('')}" fill="${v.body.wall(t, z)}" fill-rule="nonzero" stroke="none"/>`,
        );
      inner.push(
        `<path d="${d.join('')}" fill="${v.body.top(t, z)}" fill-rule="evenodd" stroke="none"/>`,
      );
      parts.push(
        go >= 0.999
          ? inner.join('')
          : `<g opacity="${go.toFixed(3)}">${inner.join('')}</g>`,
      );
    }
    parts.push(
      `<path d="${d.join('')}" fill="${v.fill ? v.fill.color(t, z) : 'none'}" ` +
        (v.fill
          ? `fill-opacity="${v.fill.opacity(t, z).toFixed(3)}" fill-rule="evenodd" `
          : '') +
        `stroke="${col}" stroke-opacity="${op.toFixed(3)}" ` +
        `stroke-width="${w.toFixed(2)}" stroke-linejoin="round" stroke-linecap="round"/>`,
    );
  }

  if (v.anchors) {
    const r = Math.max(1.3, 2.6 * Math.min(1, targetW / 411));
    const m = [];
    for (const a of anchors.values()) {
      if (v.levels !== 'all' && !a.levels.has(v.levels)) continue;
      const z = v.levels === 'all' ? a.zTop : v.levels;
      const cx = (a.x - a.y) * HW * s + ox;
      const cy = ((a.x + a.y) * HH - z * v.zStep) * s + oy;
      const multi = a.levels.size > 1;
      m.push(
        `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(multi ? r * 1.5 : r).toFixed(2)}" ` +
          `fill="${multi ? '#ffd166' : 'none'}" fill-opacity="0.9" stroke="#ffd166" ` +
          `stroke-opacity="0.95" stroke-width="${(r * 0.5).toFixed(2)}"/>`,
      );
    }
    parts.push(m.join(''));
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${targetW}" height="${targetH}" viewBox="0 0 ${targetW} ${targetH}">` +
    `<rect width="${targetW}" height="${targetH}" fill="${BG}"/>` +
    parts.join('') +
    `</svg>`;
  return { svg, segs, scale: s };
}

// ── ink measurement ───────────────────────────────────────────────────────
async function measureInk(buf) {
  const r = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const data = r.data;
  const info = r.info;
  const ch = info.channels;
  const bg = [
    parseInt(BG.slice(1, 3), 16),
    parseInt(BG.slice(3, 5), 16),
    parseInt(BG.slice(5, 7), 16),
  ];
  let lit = 0;
  let ink = 0;
  let x0 = 1e9;
  let x1 = -1;
  let y0 = 1e9;
  let y1 = -1;
  const D = new Float32Array(info.width * info.height);
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const i = y * info.width + x;
      const d = Math.max(
        Math.abs(data[i * ch] - bg[0]),
        Math.abs(data[i * ch + 1] - bg[1]),
        Math.abs(data[i * ch + 2] - bg[2]),
      );
      D[i] = Math.min(1, d / 160);
      ink += D[i];
      if (d > 8) {
        lit++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  const n = info.width * info.height;
  // ink measured only over the drawn bounding box — the honest crowding number,
  // undiluted by the empty margin the 1.8:1 content leaves in a square frame.
  let bInk = 0;
  let bLit = 0;
  let bN = 0;
  if (x1 >= 0) {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * info.width + x;
        bInk += D[i];
        if (D[i] > 8 / 160) bLit++;
        bN++;
      }
  }
  return {
    covered: lit / n,
    ink: ink / n,
    bboxInk: bN ? bInk / bN : 0,
    bboxCovered: bN ? bLit / bN : 0,
    bboxW: x1 - x0 + 1,
    bboxH: y1 - y0 + 1,
  };
}

// ── occlusion bleed ───────────────────────────────────────────────────────
// OCCLUSION BLEED: coverage/ink measure how crowded a LINE drawing is; they say
// nothing about the transparency axis, because a translucent face is just as
// much "ink" as an opaque one. The quantity actually being traded away is how
// much of the geometry that occlusion HIDES is now showing through. So: render
// the identical variant with the decks forced fully opaque, and take the mean
// per-pixel colour distance to it over the drawn area. 0 % = perfect occlusion
// (top and bottom cleanly separated), higher = more hidden structure bleeding
// into the visible surfaces.
async function measureBleed(bufA, bufB) {
  const A = await sharp(bufA).raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(bufB).raw().toBuffer({ resolveWithObject: true });
  const ch = A.info.channels;
  const bg = [
    parseInt(BG.slice(1, 3), 16),
    parseInt(BG.slice(3, 5), 16),
    parseInt(BG.slice(5, 7), 16),
  ];
  const n = A.info.width * A.info.height;
  let sum = 0;
  let cnt = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const o = i * ch;
    // only over pixels the OPAQUE reference actually draws on
    const drawn = Math.max(
      Math.abs(B.data[o] - bg[0]),
      Math.abs(B.data[o + 1] - bg[1]),
      Math.abs(B.data[o + 2] - bg[2]),
    );
    if (drawn <= 8) continue;
    const d =
      (Math.abs(A.data[o] - B.data[o]) +
        Math.abs(A.data[o + 1] - B.data[o + 1]) +
        Math.abs(A.data[o + 2] - B.data[o + 2])) /
      3;
    sum += d;
    if (d > peak) peak = d;
    cnt++;
  }
  return { bleed: cnt ? sum / cnt / 255 : 0, peak: peak / 255 };
}

// ── variant catalogue ─────────────────────────────────────────────────────
const C_DEEP = '#1b4a6b';
const C_MID = '#3ea0c8';
const C_TOP = '#bfeaff';
const MONO = '#9fd8f5';
const flatOp = (lo, hi) => (t) => lo + (hi - lo) * t;

const STACKED = [
  {
    id: 'A01_z16_opacity',
    label: 'z=16 (real TZ) opacity .20>1.0 w1.0',
    zStep: 16,
    width: () => 1.0,
    opacity: flatOp(0.2, 1.0),
    color: () => MONO,
  },
  {
    id: 'A02_z32_opacity',
    label: 'z=32 opacity .20>1.0 w1.0',
    zStep: 32,
    width: () => 1.0,
    opacity: flatOp(0.2, 1.0),
    color: () => MONO,
  },
  {
    id: 'A03_z48_opacity',
    label: 'z=48 opacity .20>1.0 w1.0',
    zStep: 48,
    width: () => 1.0,
    opacity: flatOp(0.2, 1.0),
    color: () => MONO,
  },
  {
    id: 'A04_z64_opacity',
    label: 'z=64 opacity .20>1.0 w1.0',
    zStep: 64,
    width: () => 1.0,
    opacity: flatOp(0.2, 1.0),
    color: () => MONO,
  },
  {
    id: 'A05_z48_color',
    label: 'z=48 COLOUR ramp deep>bright op .55>1',
    zStep: 48,
    width: () => 1.0,
    opacity: flatOp(0.55, 1.0),
    color: (t) => (t < 0.5 ? mix(C_DEEP, C_MID, t * 2) : mix(C_MID, C_TOP, (t - 0.5) * 2)),
  },
  {
    id: 'A06_z48_taper',
    label: 'z=48 width taper 0.5>1.7 + opacity',
    zStep: 48,
    width: (t) => 0.5 + 1.2 * t,
    opacity: flatOp(0.25, 1.0),
    color: () => MONO,
  },
  {
    id: 'A07_z48_focus0',
    label: 'z=48 ONLY z=0 bright, rest .14 ghost',
    zStep: 48,
    width: (t, z) => (z === 0 ? 1.5 : 0.7),
    opacity: (t, z) => (z === 0 ? 1.0 : 0.14),
    color: (t, z) => (z === 0 ? '#ffe08a' : MONO),
  },
  {
    id: 'A08_z48_focusM3',
    label: 'z=48 ONLY z=-3 bright, rest .14 ghost',
    zStep: 48,
    width: (t, z) => (z === -3 ? 1.5 : 0.7),
    opacity: (t, z) => (z === -3 ? 1.0 : 0.14),
    color: (t, z) => (z === -3 ? '#ffe08a' : MONO),
  },
  {
    id: 'A09_z48_declutter',
    label: 'z=48 DECLUTTER rings <12 corners dropped',
    zStep: 48,
    minRingCells: 12,
    width: () => 1.1,
    opacity: flatOp(0.25, 1.0),
    color: () => MONO,
  },
  {
    id: 'A10_z48_thick',
    label: 'z=48 uniform w1.7 opacity .35>1.0',
    zStep: 48,
    width: () => 1.7,
    opacity: flatOp(0.35, 1.0),
    color: () => MONO,
  },
  {
    id: 'A11_z48_hairline',
    label: 'z=48 hairline w0.6 opacity .30>1.0',
    zStep: 48,
    width: () => 0.6,
    opacity: flatOp(0.3, 1.0),
    color: () => MONO,
  },
  {
    id: 'A12_z48_anchors',
    label: 'z=48 opacity ramp + ANCHOR markers',
    zStep: 48,
    width: () => 1.0,
    opacity: flatOp(0.2, 1.0),
    color: () => MONO,
    anchors: true,
  },
  {
    id: 'A13_z96_opacity',
    label: 'z=96 (extreme) opacity .20>1.0 w1.0',
    zStep: 96,
    width: () => 1.0,
    opacity: flatOp(0.2, 1.0),
    color: () => MONO,
  },
  {
    id: 'A14_z48_decl_thick',
    label: 'z=48 DECLUTTER <20 + w1.5 + DP 0.9px',
    zStep: 48,
    minRingCells: 20,
    dpTol: 0.9,
    width: () => 1.5,
    opacity: flatOp(0.3, 1.0),
    color: () => MONO,
  },
  {
    id: 'A15_z48_top5',
    label: 'z=48 only 5 topmost levels drawn',
    zStep: 48,
    width: () => 1.1,
    opacity: (t, z) => (z >= zMax - 4 ? 0.35 + 0.65 * ((z - (zMax - 4)) / 4) : 0),
    color: () => MONO,
  },
  {
    id: 'A16_z48_outerhull',
    label: 'z=48 OUTER ring per level only (holes dropped)',
    zStep: 48,
    outerOnly: true,
    width: () => 1.2,
    opacity: flatOp(0.25, 1.0),
    color: () => MONO,
  },
];

// ── round 2: does the stack read as a BODY? ───────────────────────────────
// Pure outlines are transparent, so every level shows through every other one
// and the drawing reads as a wireframe cloud. These variants test the two
// things that turn a stack of outlines into a volume: painter OCCLUSION
// (opaque per-level fill) and EXTRUDED SIDE WALLS hanging down to the level
// below. Both are still vector-only — no per-cell drawing.
const BODY_TOP = (lo, hi) => (t) => mix(lo, hi, t);
const SOLID = [
  {
    id: 'C01_z48_fill_translucent',
    label: 'z=48 outline + translucent fill .07>.16 (no occlusion)',
    zStep: 48,
    width: () => 0.9,
    opacity: flatOp(0.3, 1.0),
    color: () => MONO,
    fill: { color: () => '#7fc4e8', opacity: (t) => 0.07 + 0.09 * t },
  },
  {
    id: 'C02_z48_opaque_occl',
    label: 'z=48 OPAQUE fill (painter occlusion) + outline',
    zStep: 48,
    width: () => 0.9,
    opacity: flatOp(0.55, 1.0),
    color: () => MONO,
    fill: { color: BODY_TOP('#101823', '#22384c'), opacity: () => 1 },
  },
  {
    id: 'D01_z48_prism_full',
    label: 'z=48 PRISM walls 100% + occlusion + outline',
    zStep: 48,
    width: () => 0.9,
    opacity: flatOp(0.5, 1.0),
    color: () => MONO,
    body: { top: BODY_TOP('#16222f', '#2d5470'), wall: BODY_TOP('#0d141d', '#16283a'), wallFrac: 1 },
  },
  {
    id: 'D02_z32_prism_full',
    label: 'z=32 PRISM walls 100% + occlusion + outline',
    zStep: 32,
    width: () => 0.9,
    opacity: flatOp(0.5, 1.0),
    color: () => MONO,
    body: { top: BODY_TOP('#16222f', '#2d5470'), wall: BODY_TOP('#0d141d', '#16283a'), wallFrac: 1 },
  },
  {
    id: 'D03_z16_prism_full',
    label: 'z=16 (real TZ) PRISM walls 100% + outline',
    zStep: 16,
    width: () => 0.9,
    opacity: flatOp(0.5, 1.0),
    color: () => MONO,
    body: { top: BODY_TOP('#16222f', '#2d5470'), wall: BODY_TOP('#0d141d', '#16283a'), wallFrac: 1 },
  },
  {
    id: 'D04_z64_prism_full',
    label: 'z=64 PRISM walls 100% + occlusion + outline',
    zStep: 64,
    width: () => 0.9,
    opacity: flatOp(0.5, 1.0),
    color: () => MONO,
    body: { top: BODY_TOP('#16222f', '#2d5470'), wall: BODY_TOP('#0d141d', '#16283a'), wallFrac: 1 },
  },
  {
    id: 'D05_z48_prism_gap',
    label: 'z=48 PRISM walls 55% (gap between decks) + outline',
    zStep: 48,
    width: () => 0.9,
    opacity: flatOp(0.5, 1.0),
    color: () => MONO,
    body: { top: BODY_TOP('#16222f', '#2d5470'), wall: BODY_TOP('#0d141d', '#16283a'), wallFrac: 0.55 },
  },
  {
    id: 'D06_z48_prism_outline_only',
    label: 'z=48 PRISM occlusion, walls = BG (outline silhouette only)',
    zStep: 48,
    width: () => 1.0,
    opacity: () => 1,
    color: () => MONO,
    body: { top: () => BG, wall: () => BG, wallFrac: 1 },
  },
  {
    id: 'D07_z48_prism_anchors',
    label: 'z=48 PRISM + ANCHOR markers',
    zStep: 48,
    width: () => 0.9,
    opacity: flatOp(0.5, 1.0),
    color: () => MONO,
    body: { top: BODY_TOP('#16222f', '#2d5470'), wall: BODY_TOP('#0d141d', '#16283a'), wallFrac: 1 },
    anchors: true,
  },
];

// ── round 3: Rudi's pick — D04 prism + A05 colour ramp + light face alpha ──
// Base is D04 (prism body: painter occlusion + extruded side walls + outline),
// recoloured with the A05 depth ramp and made partly translucent. The whole
// point of the series is the OPACITY axis: occlusion is what made D04 read as
// a body, and transparency spends exactly that. Everything else is held fixed.
function shade(hex, f) {
  const c = [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const h = (v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0');
  return '#' + h(c[0]) + h(c[1]) + h(c[2]);
}
// 3-stop ramp: deep blue at the bottom -> light cyan at the top (A05's idea,
// deepened for FACES so the outline still reads on top of them).
const F_LO = '#10304a', F_MID = '#2a7194', F_HI = '#8fcfe8';
const rampFace = (t) => (t < 0.5 ? mix(F_LO, F_MID, t * 2) : mix(F_MID, F_HI, (t - 0.5) * 2));
const wallDark = (t) => shade(rampFace(t), 0.55); // wall darker than its own deck -> plasticity
const wallRamp = (t) => shade(rampFace(t), 0.85); // wall follows the ramp -> height reads
// Stroke ramp kept ABOVE face luminance, otherwise the bottom decks lose their
// edges entirely against their own dark faces.
const S_LO = '#4a86ad', S_MID = '#7fc4e8', S_HI = '#e8f8ff';
const rampStroke = (t) => (t < 0.5 ? mix(S_LO, S_MID, t * 2) : mix(S_MID, S_HI, (t - 0.5) * 2));

const SIZES_R3 = [
  { id: 'mini', w: 200, h: 150 }, // measured content aspect of the prism body is 1.34:1
  { id: 'full', w: 411, h: null },
];
const SIZES_R3_SQ = [
  ...SIZES_R3,
  { id: 'sq', w: 200, h: 200 }, // the old square, for the format comparison
  { id: 'strip', w: 200, h: 112 }, // the 1.8:1 strip guessed from the bare lattice bbox
];

const mkR3 = (id, label, o) => ({
  id,
  label,
  zStep: o.zStep == null ? 64 : o.zStep,
  width: () => 0.9,
  opacity: o.strokeRamp ? () => 0.95 : flatOp(0.5, 1.0),
  color: o.strokeRamp ? (t) => rampStroke(t) : () => MONO,
  body: {
    top: (t) => rampFace(t),
    wall: o.wallRamp ? (t) => wallRamp(t) : (t) => wallDark(t),
    wallFrac: 1,
    groupOpacity: o.op,
  },
  sizes: o.sizes || SIZES_R3,
});

const R3 = [
  mkR3('E01_z64_op100', 'z=64 ramp, walls dark, faces 100% (= D04 recoloured)', { op: 1.0 }),
  mkR3('E02_z64_op92', 'z=64 ramp, walls dark, faces 92%', { op: 0.92 }),
  mkR3('E03_z64_op85', 'z=64 ramp, walls dark, faces 85%', { op: 0.85, sizes: SIZES_R3_SQ }),
  mkR3('E04_z64_op75', 'z=64 ramp, walls dark, faces 75%', { op: 0.75 }),
  mkR3('E05_z64_op65', 'z=64 ramp, walls dark, faces 65%', { op: 0.65 }),
  mkR3('E06_z64_op50', 'z=64 ramp, walls dark, faces 50%', { op: 0.5 }),
  mkR3('E07_z48_op85', 'z=48 ramp, walls dark, faces 85% (Z-COMPARE vs E03)', { op: 0.85, zStep: 48 }),
  mkR3('E08_z64_op85_strokeramp', 'z=64 faces 85% + OUTLINE follows the ramp too', { op: 0.85, strokeRamp: true }),
  mkR3('E09_z64_op85_wallramp', 'z=64 faces 85% + WALLS follow the ramp (not darker)', { op: 0.85, wallRamp: true }),
];

const SINGLE = [
  {
    id: 'B01_lvl_w1',
    label: `level z=${REF_LEVEL} w1.0`,
    zStep: 48,
    levels: REF_LEVEL,
    width: () => 1.0,
    opacity: () => 1,
    color: () => MONO,
  },
  {
    id: 'B02_lvl_w0_6',
    label: `level z=${REF_LEVEL} hairline w0.6`,
    zStep: 48,
    levels: REF_LEVEL,
    width: () => 0.6,
    opacity: () => 1,
    color: () => MONO,
  },
  {
    id: 'B03_lvl_w1_6',
    label: `level z=${REF_LEVEL} w1.6`,
    zStep: 48,
    levels: REF_LEVEL,
    width: () => 1.6,
    opacity: () => 1,
    color: () => MONO,
  },
  {
    id: 'B04_lvl_declutter',
    label: `level z=${REF_LEVEL} DECLUTTER <12 w1.2`,
    zStep: 48,
    levels: REF_LEVEL,
    minRingCells: 12,
    width: () => 1.2,
    opacity: () => 1,
    color: () => MONO,
  },
  {
    id: 'B05_lvl_anchors',
    label: `level z=${REF_LEVEL} w1.0 + ANCHORS`,
    zStep: 48,
    levels: REF_LEVEL,
    width: () => 1.0,
    opacity: () => 1,
    color: () => MONO,
    anchors: true,
  },
  {
    id: 'B06_lvl_outer',
    label: `level z=${REF_LEVEL} OUTER rings only w1.2`,
    zStep: 48,
    levels: REF_LEVEL,
    outerOnly: true,
    width: () => 1.2,
    opacity: () => 1,
    color: () => MONO,
  },
];

const SIZES = [
  { id: 'mini', w: 200, h: 200 },
  { id: 'full', w: 411, h: null },
];

// outer-ring filter: a ring is a HOLE iff it is wound counter-clockwise in
// screen space (filled cells are emitted clockwise, so hole boundaries come
// out reversed). Signed area on the projected ring decides it.
function signedArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const px = (p[0] - p[1]) * HW;
    const py = (p[0] + p[1]) * HH;
    const qx = (q[0] - q[1]) * HW;
    const qy = (q[0] + q[1]) * HH;
    a += px * qy - qx * py;
  }
  return a / 2;
}
for (const z of zLevels) {
  const g = levelGeom.get(z);
  g.outer = g.rings.filter((r) => signedArea(r) > 0);
  g.holes = g.rings.length - g.outer.length;
}

// ── run ───────────────────────────────────────────────────────────────────
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const rows = [];
  const tAll0 = Date.now();

  const allVariants = [...STACKED, ...SOLID, ...R3, ...SINGLE];
  for (const v of allVariants) {
    const vv = { ...v, levels: v.levels == null ? 'all' : v.levels };
    for (const sz of v.sizes || SIZES) {
      const W = sz.w;
      let H = sz.h;
      if (H == null) {
        const bb =
          vv.levels === 'all' ? contentBBox(vv.zStep, vv.body ? (vv.body.wallFrac == null ? 1 : vv.body.wallFrac) : 0) : levelBBox(vv.levels, vv.zStep);
        H = Math.min(
          700,
          Math.max(120, Math.round((W * (bb.y1 - bb.y0)) / (bb.x1 - bb.x0)) + 6),
        );
      }
      // outerOnly: swap in the filtered ring lists for the duration of the draw
      let saved = null;
      if (vv.outerOnly) {
        saved = new Map();
        for (const z of zLevels) {
          const g = levelGeom.get(z);
          saved.set(z, g.rings);
          g.rings = g.outer;
        }
      }
      const t0 = Date.now();
      const built = buildSVG(vv, W, H);
      const buf = await sharp(Buffer.from(built.svg)).png().toBuffer();
      const ms = Date.now() - t0;
      if (saved) for (const z of zLevels) levelGeom.get(z).rings = saved.get(z);

      const file = path.join(OUT, `${v.id}__${sz.id}.png`);
      fs.writeFileSync(file, buf);
      const m = await measureInk(buf);
      let bleed = null;
      if (vv.body && vv.body.groupOpacity != null && vv.body.groupOpacity < 0.999) {
        const ref = { ...vv, body: { ...vv.body, groupOpacity: 1 } };
        const refBuf = await sharp(Buffer.from(buildSVG(ref, W, H).svg)).png().toBuffer();
        bleed = await measureBleed(buf, refBuf);
      }
      rows.push({
        id: v.id,
        label: v.label,
        size: sz.id,
        W,
        H,
        segs: built.segs,
        scale: built.scale,
        ms,
        covered: m.covered,
        ink: m.ink,
        bboxInk: m.bboxInk,
        bboxCovered: m.bboxCovered,
        bboxW: m.bboxW,
        bboxH: m.bboxH,
        bleed: bleed ? bleed.bleed : 0,
        bleedPeak: bleed ? bleed.peak : 0,
        file,
      });
    }
  }

  // ── contact sheets ──────────────────────────────────────────────────────
  async function sheet(name, subset, sizeId, cols, cellW, cellH) {
    const items = rows.filter((r) => r.size === sizeId && subset.includes(r.id));
    const LH = 30;
    const gap = 10;
    const rowsN = Math.ceil(items.length / cols);
    const W = cols * (cellW + gap) + gap;
    const H = rowsN * (cellH + LH + gap) + gap + 40;
    const comps = [];
    const labels = [
      `<text x="${gap}" y="26" fill="#e8f4ff" font-family="monospace" font-size="17" font-weight="bold">` +
        `Shadow Nexus I - outline PoC - ${name} - ${items.length ? items[0].W + 'x' + items[0].H : sizeId}</text>`,
    ];
    items.forEach((r, i) => {
      const c = i % cols;
      const rr = (i / cols) | 0;
      const x = gap + c * (cellW + gap);
      const y = 40 + gap + rr * (cellH + LH + gap);
      comps.push({
        input: r.file,
        left: x,
        top: y + Math.max(0, ((cellH - r.H) / 2) | 0),
      });
      labels.push(
        `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="none" stroke="#243044" stroke-width="1"/>`,
        `<text x="${x}" y="${y + cellH + 13}" fill="#8fd3ff" font-family="monospace" font-size="11">${r.id}</text>`,
        `<text x="${x}" y="${y + cellH + 25}" fill="#7d8ea3" font-family="monospace" font-size="9">` +
          `${escapeXml(r.label.length > cellW / 5.4 ? r.label.slice(0, Math.floor(cellW / 5.4) - 1) + '…' : r.label)}</text>`,
        `<text x="${x + cellW - 4}" y="${y + cellH + 13}" text-anchor="end" fill="#ffb703" font-family="monospace" font-size="10">` +
          (r.bleed ? `bleed ${(r.bleed * 100).toFixed(1)}%` : `ink ${(r.ink * 100).toFixed(1)}%`) + ` seg ${r.segs}</text>`,
      );
    });
    const overlay = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${labels.join('')}</svg>`,
    );
    const out = path.join(OUT, `SHEET_${name}_${sizeId}.png`);
    await sharp({
      create: { width: W, height: H, channels: 4, background: '#070a11' },
    })
      .composite([...comps, { input: overlay, left: 0, top: 0 }])
      .png()
      .toFile(out);
    return out;
  }

  const sheets = [];
  sheets.push(await sheet('stacked', STACKED.map((v) => v.id), 'mini', 4, 200, 200));
  sheets.push(await sheet('stacked', STACKED.map((v) => v.id), 'full', 3, 411, 360));
  sheets.push(await sheet('solid', SOLID.map((v) => v.id), 'mini', 4, 200, 200));
  sheets.push(await sheet('solid', SOLID.map((v) => v.id), 'full', 3, 411, 360));
  sheets.push(await sheet('level', SINGLE.map((v) => v.id), 'mini', 3, 200, 200));
  sheets.push(await sheet('level', SINGLE.map((v) => v.id), 'full', 3, 411, 360));
  // the shortlist, both sizes on one page
  const FINAL = [
    'A03_z48_opacity',
    'A11_z48_hairline',
    'D06_z48_prism_outline_only',
    'D01_z48_prism_full',
    'D04_z64_prism_full',
    'B01_lvl_w1',
  ];
  sheets.push(await sheet('FINALISTS', FINAL, 'mini', 3, 200, 200));
  sheets.push(await sheet('FINALISTS', FINAL, 'full', 3, 411, 360));

  // ── round 3 sheets ──
  const R3IDS = R3.map((v) => v.id);
  sheets.push(await sheet('R3', R3IDS, 'mini', 3, 200, 156));
  sheets.push(await sheet('R3', R3IDS, 'full', 3, 411, 320));

  // format evidence: same drawing, same 200px width, three tile shapes
  {
    const pick = (sz) => rows.find((r) => r.id === 'E03_z64_op85' && r.size === sz);
    const tiles = [
      { r: pick('mini'), name: '200 x 150  (measured aspect)' },
      { r: pick('strip'), name: '200 x 112  (1.8:1 guess)' },
      { r: pick('sq'), name: '200 x 200  (old square)' },
    ];
    const W = 3 * 200 + 4 * 15;
    const H = 200 + 110;
    const lab = [
      '<text x="15" y="24" fill="#e8f4ff" font-family="monospace" font-size="15" font-weight="bold">' +
        'Minimap format: identical drawing, identical 200px width</text>',
      '<text x="15" y="42" fill="#7d8ea3" font-family="monospace" font-size="11">' +
        'the drawing fits itself to the tile - what changes is how much tile is left over</text>',
    ];
    const comps = [];
    tiles.forEach((t, i) => {
      const x = 15 + i * (200 + 15);
      const y = 60;
      comps.push({ input: t.r.file, left: x, top: y });
      const used = ((t.r.bboxW * t.r.bboxH) / (200 * t.r.H)) * 100;
      lab.push(
        '<rect x="' + x + '" y="' + y + '" width="200" height="' + t.r.H + '" fill="none" stroke="#243044"/>',
        '<text x="' + x + '" y="' + (y + 200 + 20) + '" fill="#8fd3ff" font-family="monospace" font-size="11">' + t.name + '</text>',
        '<text x="' + x + '" y="' + (y + 200 + 34) + '" fill="#ffb703" font-family="monospace" font-size="10">' +
          'drawn ' + t.r.bboxW + 'x' + t.r.bboxH + '  =  ' + used.toFixed(0) + '% of tile</text>',
        '<text x="' + x + '" y="' + (y + 200 + 46) + '" fill="#7d8ea3" font-family="monospace" font-size="10">' +
          'px/tile ' + (t.r.scale * TW).toFixed(2) + '</text>',
      );
    });
    const ov = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">' + lab.join('') + '</svg>',
    );
    const outF = path.join(OUT, 'SHEET_R3_format.png');
    await sharp({ create: { width: W, height: H, channels: 4, background: '#070a11' } })
      .composite([...comps, { input: ov, left: 0, top: 0 }])
      .png()
      .toFile(outF);
    sheets.push(outF);
  }

  // ── stats ───────────────────────────────────────────────────────────────
  const stats = {
    snapshot: {
      structureId: snap.structureId,
      version: snap.version,
      format: snap.format,
      hulls: snap.hulls.length,
      modules: snap.modules.length,
      parseMs: tLoad,
    },
    bbox: {
      minX,
      maxX,
      minY,
      maxY,
      zMin,
      zMax,
      cellsX: maxX - minX + 1,
      cellsY: maxY - minY + 1,
    },
    traceTotalMs: +traceTotal.toFixed(2),
    anchors: {
      columns: anchors.size,
      multiLevel: [...anchors.values()].filter((a) => a.levels.size > 1).length,
    },
    levels: zLevels.map((z) => {
      const g = levelGeom.get(z);
      return {
        z,
        cells: g.cellCount,
        islands: g.islands,
        rings: g.rings.length,
        outerRings: g.outer.length,
        holes: g.holes,
        rawSegments: g.rawSeg,
        traceMs: +g.msTrace.toFixed(2),
      };
    }),
    variants: rows.map((r) => ({
      id: r.id,
      size: r.size,
      w: r.W,
      h: r.H,
      segments: r.segs,
      pxPerTile: +(r.scale * TW).toFixed(3),
      renderMs: r.ms,
      inkPct: +(r.ink * 100).toFixed(2),
      coveredPct: +(r.covered * 100).toFixed(2),
      drawnBox: r.bboxW + "x" + r.bboxH,
      bboxInkPct: +(r.bboxInk * 100).toFixed(2),
      bboxCoveredPct: +(r.bboxCovered * 100).toFixed(2),
      bleedPct: +(r.bleed * 100).toFixed(2),
      bleedPeakPct: +(r.bleedPeak * 100).toFixed(2),
    })),
    totalMs: Date.now() - tAll0,
    sheets,
  };
  fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify(stats, null, 2));

  console.log(
    `\n=== LEVELS (trace total ${traceTotal.toFixed(1)} ms, snapshot parse ${tLoad} ms) ===`,
  );
  console.log('   z | cells | isl | rings | outer | holes | rawSeg | traceMs');
  for (const l of stats.levels)
    console.log(
      `${String(l.z).padStart(4)} |${String(l.cells).padStart(6)} |${String(l.islands).padStart(4)} |` +
        `${String(l.rings).padStart(6)} |${String(l.outerRings).padStart(6)} |${String(l.holes).padStart(6)} |` +
        `${String(l.rawSegments).padStart(7)} |${l.traceMs.toFixed(2).padStart(8)}`,
    );
  console.log(`\n=== VARIANTS ===`);
  console.log(
    'id                           size  WxH        seg   px/tile   ink%   cov%  drawn      bbInk%  bbCov%  bleed%  peak%   ms',
  );
  for (const v of stats.variants)
    console.log(
      `${v.id.padEnd(28)} ${v.size.padEnd(5)} ${(v.w + 'x' + v.h).padEnd(10)} ${String(v.segments).padStart(5)} ` +
        `${v.pxPerTile.toFixed(2).padStart(7)} ${v.inkPct.toFixed(2).padStart(6)} ${v.coveredPct.toFixed(2).padStart(6)} ${v.drawnBox.padStart(9)} ${v.bboxInkPct.toFixed(2).padStart(7)} ${v.bboxCoveredPct.toFixed(2).padStart(7)} ${v.bleedPct.toFixed(2).padStart(6)} ${v.bleedPeakPct.toFixed(2).padStart(6)} ${String(v.renderMs).padStart(4)}`,
    );
  console.log(`\nsheets:\n  ${sheets.join('\n  ')}`);
  console.log(`total ${stats.totalMs} ms`);
})();
