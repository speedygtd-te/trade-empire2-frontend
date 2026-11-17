/**
 * STRUCTURE OVERVIEW — ROUND 4 (local only, no network).
 *
 * Base is E07_z48_op85 from structure-overview-poc.cjs and nothing about the
 * geometry pipeline changes: cells -> boundary half-edges -> rings -> collinear
 * collapse -> iso projection -> Douglas-Peucker in target pixel space -> SVG.
 * Prism body (painter occlusion + extruded side walls), walls darker than their
 * own deck, faces at 85 % group opacity, z step 48.
 *
 * Round 4 varies exactly two things, both of which are colour decisions:
 *
 *   AXIS A — how far the asset yellow goes.
 *     The measured sprite palette (28 sprites, opaque pixels by frequency) is
 *     navy-dominant; yellow is 2.9 % of pixels, i.e. an accent. Painting all
 *     988 outline segments yellow inverts that ratio. P-series renders the
 *     ladder: all outlines / top deck only / whole-body silhouette / vertical
 *     accesses only, each in bright #ebc448 and muted #a97509.
 *
 *   AXIS B — highlighting the deck the player is standing on.
 *     The painter algorithm draws bottom-up, so a low deck is buried under
 *     everything above it. Recolouring alone may be useless. L-series renders
 *     the ladder of what happens to the decks ABOVE the current one:
 *     keep / fade to 25 % / outline-only / cut away / cut away + dim below.
 *
 * MANDATORY MEASUREMENTS
 *   1. Per level, the WCAG contrast ratio of the rendered outline against the
 *      rendered top face of its own deck, both sampled from the actual PNG
 *      through per-level occlusion masks. This is where a fixed line colour and
 *      a luminance ramp collide, so it is measured, not assumed.
 *   2. Per highlight variant, how much of the highlighted deck survives the
 *      occlusion: unoccluded % (hard) and retention % (continuous, normalised
 *      between "nothing above" and "the do-nothing baseline").
 *
 * NOTHING in src/ is touched. Output: assets/style-test/structure-overview-r4/
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// ── config ────────────────────────────────────────────────────────────────
const SNAPSHOT =
  process.env.SNAPSHOT ||
  'C:/Users/SPEEDY~1/AppData/Local/Temp/claude/F--Trade-Empire-Frontend/c8323739-b1d3-47a6-81a5-4789cbef0bd7/scratchpad/snapshot.json';
const OUT = path.resolve(__dirname, '../assets/style-test/structure-overview-r4');

const TW = 48;
const HW = 24;
const HH = 12;
const ZSTEP = 48;
const FACE_OP = 0.85;

// ── measured asset palette ────────────────────────────────────────────────
// From src/assets/modules + src/assets/hulls, opaque pixels by frequency.
const NAVY = {
  d1: '#0f1b26',
  d2: '#141517',
  d3: '#142635',
  m1: '#15354b',
  m2: '#2f3b45',
  m3: '#344651',
  l1: '#6c93ae',
  l2: '#768793',
};
const YEL_HI = '#ebc448';
const YEL_MID = '#a97509';
const YEL_DK = '#986708';
const YEL_WARM = '#f6ca98';

// backgrounds under test
const BG_POC = '#0b0f18'; // round 3 ground
const BG_G950 = '#030712'; // tailwind gray-950
const BG_G900 = '#111827'; // tailwind gray-900
const BG_NAVY = '#080d13'; // navy-tinted, derived from #0f1b26 darkened

// ── colour helpers ────────────────────────────────────────────────────────
const px = (c) => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
];
const hx = (v) =>
  Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
const rgb2hex = (a) => '#' + hx(a[0]) + hx(a[1]) + hx(a[2]);
function mix(c1, c2, t) {
  const a = px(c1);
  const b = px(c2);
  return rgb2hex([
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]);
}
function shade(hex, f) {
  const c = px(hex);
  return rgb2hex([c[0] * f, c[1] * f, c[2] * f]);
}
/** multi-stop ramp, t in [0,1] */
function rampN(stops, t) {
  if (t <= 0) return stops[0];
  if (t >= 1) return stops[stops.length - 1];
  const seg = (stops.length - 1) * t;
  const i = Math.min(stops.length - 2, Math.floor(seg));
  return mix(stops[i], stops[i + 1], seg - i);
}
/** sRGB relative luminance */
function relLum(rgbArr) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgbArr[0]) + 0.7152 * f(rgbArr[1]) + 0.0722 * f(rgbArr[2]);
}
function contrastRatio(a, b) {
  const l1 = relLum(a);
  const l2 = relLum(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
/** CIE L* from relative luminance */
function lstar(rgbArr) {
  const y = relLum(rgbArr);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

// face ramps (bottom -> top)
const RAMP_WIDE = [NAVY.d1, NAVY.d3, NAVY.m1, NAVY.m3, NAVY.l1];
// "deck" ramp reserves the two lightening tones (#6c93ae/#768793) for lines and
// accents, exactly as the sprites use them — the faces top out at #344651.
const RAMP_DECK = [NAVY.d1, NAVY.d3, NAVY.m1, NAVY.m2, NAVY.m3];
// halfway house: keeps most of the height range but leaves the top deck enough
// headroom for its own outline to still sit above it.
const RAMP_MID = [NAVY.d1, NAVY.d3, NAVY.m1, NAVY.m3, '#4f6d80'];
// round-3 generic blue/cyan, for the honest A/B
const RAMP_GEN = ['#10304a', '#2a7194', '#8fcfe8'];
const GEN_STROKE = '#9fd8f5';

const LIGHT_NEUTRAL = '#cfe0ea';
/** navy outline: a constant step toward a light neutral above its own face */
const navyStroke = (face) => mix(face, LIGHT_NEUTRAL, 0.7);

// ── lattice geometry (verbatim from the round-1..3 PoC) ───────────────────
const K = (a, b) => a + ',' + b;

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
    if (!cells.has(K(x, y - 1))) push(x, y, x + 1, y);
    if (!cells.has(K(x + 1, y))) push(x + 1, y, x + 1, y + 1);
    if (!cells.has(K(x, y + 1))) push(x + 1, y + 1, x, y + 1);
    if (!cells.has(K(x - 1, y))) push(x, y + 1, x, y);
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
        if (!cand || !cand.length) break;
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

function collapse(ring) {
  const n = ring.length;
  if (n < 3) return ring;
  const res = [];
  for (let i = 0; i < n; i++) {
    const p = ring[(i - 1 + n) % n];
    const c = ring[i];
    const q = ring[(i + 1) % n];
    if (c[0] - p[0] !== q[0] - c[0] || c[1] - p[1] !== q[1] - c[1]) res.push(c);
  }
  return res.length ? res : ring;
}

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
    const dx = pts[e][0] - x1;
    const dy = pts[e][1] - y1;
    const len2 = dx * dx + dy * dy;
    let best = -1;
    let bestd = -1;
    for (let i = s + 1; i < e; i++) {
      const ex0 = pts[i][0] - x1;
      const ey0 = pts[i][1] - y1;
      let d2;
      if (len2 === 0) d2 = ex0 * ex0 + ey0 * ey0;
      else {
        let t = (ex0 * dx + ey0 * dy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = ex0 - t * dx;
        const ey = ey0 - t * dy;
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

// ── load snapshot ─────────────────────────────────────────────────────────
const tLoad0 = Date.now();
const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
const tLoad = Date.now() - tLoad0;

const byZ = new Map();
for (const h of snap.hulls) {
  let s = byZ.get(h.posZ);
  if (!s) byZ.set(h.posZ, (s = new Set()));
  s.add(K(h.posX, h.posY));
}
const zLevels = [...byZ.keys()].sort((a, b) => a - b);
const zMin = zLevels[0];
const zMax = zLevels[zLevels.length - 1];

const VERT = new Set(['STAIRCASE', 'ELEVATOR']);
const anchors = new Map();
for (const h of snap.hulls) {
  if (!VERT.has(h.moduleType)) continue;
  const k = K(h.posX, h.posY);
  let a = anchors.get(k);
  if (!a)
    anchors.set(k, (a = { x: h.posX, y: h.posY, zTop: h.posZ, levels: new Set() }));
  a.levels.add(h.posZ);
  if (h.posZ > a.zTop) a.zTop = h.posZ;
}

const levelGeom = new Map();
let traceTotal = 0;
for (const z of zLevels) {
  const t0 = process.hrtime.bigint();
  const rings = traceRings(byZ.get(z)).map(collapse);
  traceTotal += Number(process.hrtime.bigint() - t0) / 1e6;
  levelGeom.set(z, { rings, cellCount: byZ.get(z).size });
}

// ── projection / framing ──────────────────────────────────────────────────
function levelBBox(z) {
  const g = levelGeom.get(z);
  let x0 = 1e9;
  let x1 = -1e9;
  let y0 = 1e9;
  let y1 = -1e9;
  for (const ring of g.rings)
    for (const n of ring) {
      const x = (n[0] - n[1]) * HW;
      const y = (n[0] + n[1]) * HH - HH - z * ZSTEP;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  return { x0, x1, y0, y1 };
}
// One shared frame for EVERY variant. Cutting decks away must not re-zoom the
// drawing, otherwise the highlight variants are not comparable to each other.
const BB = (() => {
  let x0 = 1e9;
  let x1 = -1e9;
  let y0 = 1e9;
  let y1 = -1e9;
  for (const z of zLevels) {
    const b = levelBBox(z);
    if (b.x0 < x0) x0 = b.x0;
    if (b.x1 > x1) x1 = b.x1;
    if (b.y0 < y0) y0 = b.y0;
    if (b.y1 > y1) y1 = b.y1;
  }
  y1 += ZSTEP; // side walls hang below the lowest deck
  return { x0, x1, y0, y1 };
})();
const CONTENT_ASPECT = (BB.y1 - BB.y0) / (BB.x1 - BB.x0);

function fit(W, H) {
  const pad = 3;
  const cw = BB.x1 - BB.x0;
  const ch = BB.y1 - BB.y0;
  const s = Math.min((W - 2 * pad) / cw, (H - 2 * pad) / ch);
  return { s, ox: (W - cw * s) / 2 - BB.x0 * s, oy: (H - ch * s) / 2 - BB.y0 * s };
}

// ── per-level style resolution ────────────────────────────────────────────
/**
 * Everything colour-related for one deck of one variant.
 * Returns null when the deck is not drawn at all.
 */
function resolve(v, z) {
  const t = (z - zMin) / (zMax - zMin);
  const rampStops =
    v.ramp === 'deck'
      ? RAMP_DECK
      : v.ramp === 'mid'
        ? RAMP_MID
        : v.ramp === 'generic'
          ? RAMP_GEN
          : RAMP_WIDE;
  let face = rampN(rampStops, t);
  let wall = shade(face, 0.55);
  // strokeK: let the outline's distance from its own face GROW with height, so
  // the top deck — whose face has eaten most of the lightness range — still has
  // an edge. A constant mix runs out of headroom exactly there.
  let stroke =
    v.ramp === 'generic'
      ? GEN_STROKE
      : v.strokeK
        ? mix(face, LIGHT_NEUTRAL, 0.6 + 0.35 * t)
        : navyStroke(face);
  let sw = 0.9;
  let gop = FACE_OP;
  let strokeOp = 0.95;
  let faces = true;

  // ---- axis A: how far the yellow goes (only when no current deck is set)
  if (v.cur == null) {
    if (v.strokeMode === 'yellow') stroke = v.yellow;
    else if (v.strokeMode === 'topYellow' && z === v.topZ) {
      stroke = v.yellow;
      sw = 1.3;
    }
  }

  // ---- axis B: current deck highlight + treatment of the decks above
  if (v.cur != null) {
    if (z === v.cur && v.hl) {
      // MINIMAL highlight: the outline of the current deck and nothing else.
      // No face change, no opacity change, no deck hidden. Three free axes:
      // lightness (already taken by the height ramp), stroke width (free),
      // hue (free — nothing else in the drawing is yellow).
      if (v.hl.yellow) stroke = v.yellow;
      if (v.hl.lift) stroke = mix(stroke, '#ffffff', v.hl.lift);
      sw = 0.9 + (v.hl.widthAdd || 0);
      // M0 must be a true control: only an actual highlight changes opacity,
      // otherwise the control carries a false +1.8 L* floor of its own.
      if (v.hl.yellow || v.hl.lift || v.hl.widthAdd) strokeOp = 1;
    } else if (z === v.cur) {
      stroke = v.yellow;
      sw = 1.7;
      strokeOp = 1;
      gop = 1;
      face = v.curFaceYellow ? mix(face, YEL_MID, 0.45) : mix(face, NAVY.l1, 0.45);
      // The wall band is what stays visible when the deck above covers the top
      // face, so how the highlight treats the wall is a real decision, not a
      // detail: keep it dark like every other deck (plasticity), lift it to the
      // face colour, or tint it yellow.
      wall =
        v.curWall === 'full'
          ? face
          : v.curWall === 'yellow'
            ? mix(face, YEL_MID, 0.6)
            : shade(face, 0.55);
    } else if (z > v.cur) {
      if (v.above === 'cut') return null;
      if (v.above === 'fade') gop = v.aboveOp;
      if (v.above === 'ghost') {
        faces = false;
        strokeOp = 0.5;
        stroke = mix(face, LIGHT_NEUTRAL, 0.45);
        sw = 0.8;
      }
    } else if (v.belowDim) {
      face = shade(face, v.belowDim);
      wall = shade(wall, v.belowDim);
      stroke = shade(stroke, v.belowDim);
    }
  }
  return { face, wall, stroke, sw, gop, strokeOp, faces };
}

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── SVG builder ───────────────────────────────────────────────────────────
/**
 * opts:
 *   ssaa       supersample factor (silhouette tracing)
 *   noStroke   suppress all outlines (face-colour reference render)
 *   maskStroke z  -> black canvas, that deck's outlines white, decks above
 *                   opaque black. Gives the VISIBLE outline pixels of a deck.
 *   maskFace   z  -> same but the deck's top faces white.
 *   maskSil    true -> only the silhouette stroke, white on black
 *   maskAcc    true -> only the anchor markers, white on black
 *   dropAbove  z  -> pretend nothing above z exists (occlusion-free reference)
 *   silPath    precomputed silhouette path string (target-space coords)
 */
function buildSVG(v, W, H, opts) {
  opts = opts || {};
  const ss = opts.ssaa || 1;
  const f = fit(W, H);
  const s = f.s * ss;
  const ox = f.ox * ss;
  const oy = f.oy * ss;
  const CW = W * ss;
  const CH = H * ss;
  const isMask =
    opts.maskStroke != null ||
    opts.maskFace != null ||
    opts.maskWall != null ||
    opts.maskSil ||
    opts.maskAcc;
  const bg = isMask ? '#000000' : v.bg;
  const tol = 0.45 * ss;

  const parts = [];
  let segs = 0;

  for (const z of zLevels) {
    if (opts.dropAbove != null && z > opts.dropAbove) continue;
    const st = resolve(v, z);
    if (!st) continue;

    const g = levelGeom.get(z);
    const d = [];
    const polys = [];
    for (const ring of g.rings) {
      let pts = ring.map((n) => [
        ((n[0] - n[1]) * HW) * s + ox,
        ((n[0] + n[1]) * HH - HH - z * ZSTEP) * s + oy,
      ]);
      pts.push(pts[0]);
      pts = dp(pts, tol);
      if (pts.length < 3) continue;
      polys.push(pts);
      segs += pts.length - 1;
      d.push('M' + pts.map((p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L') + 'Z');
    }
    if (!d.length) continue;

    // --- mask modes short-circuit ---
    if (opts.maskFace != null) {
      if (z === opts.maskFace)
        parts.push(`<path d="${d.join('')}" fill="#ffffff" fill-rule="evenodd"/>`);
      else if (z > opts.maskFace)
        parts.push(bodyPaths(polys, d, s, '#000000', '#000000', 1));
      continue;
    }
    if (opts.maskWall != null) {
      // the VISIBLE wall band = the extrusion minus this deck's own top face,
      // minus everything drawn above it.
      if (z === opts.maskWall) {
        const q = wallQuads(polys, s);
        if (q) parts.push(`<path d="${q}" fill="#ffffff" fill-rule="nonzero"/>`);
        parts.push(`<path d="${d.join('')}" fill="#000000" fill-rule="evenodd"/>`);
      } else if (z > opts.maskWall) parts.push(bodyPaths(polys, d, s, '#000000', '#000000', 1));
      continue;
    }
    if (opts.maskStroke != null) {
      if (z === opts.maskStroke)
        parts.push(
          `<path d="${d.join('')}" fill="none" stroke="#ffffff" stroke-width="${(st.sw * ss).toFixed(2)}" stroke-linejoin="round"/>`,
        );
      else if (z > opts.maskStroke)
        parts.push(bodyPaths(polys, d, s, '#000000', '#000000', 1));
      continue;
    }
    if (opts.maskSil || opts.maskAcc) continue;

    // --- normal draw ---
    if (st.faces) parts.push(bodyPaths(polys, d, s, st.face, st.wall, st.gop));
    if (!opts.noStroke)
      parts.push(
        `<path d="${d.join('')}" fill="none" stroke="${st.stroke}" ` +
          `stroke-opacity="${st.strokeOp.toFixed(3)}" stroke-width="${(st.sw * ss).toFixed(2)}" ` +
          `stroke-linejoin="round" stroke-linecap="round"/>`,
      );
  }

  // whole-body silhouette (axis A, rung 3)
  if (opts.silPath) {
    const p = opts.silPath;
    const col = opts.maskSil ? '#ffffff' : v.yellow;
    if (
      opts.maskStroke == null &&
      opts.maskFace == null &&
      opts.maskWall == null &&
      !opts.maskAcc
    )
      parts.push(
        `<path d="${p}" fill="none" stroke="${col}" stroke-width="${(1.7 * ss).toFixed(2)}" ` +
          `stroke-linejoin="round" stroke-linecap="round" stroke-opacity="0.98"/>`,
      );
  }

  // vertical access markers
  const wantAnchors =
    opts.maskStroke == null &&
    opts.maskFace == null &&
    opts.maskWall == null &&
    !opts.maskSil;
  if (v.anchors && (wantAnchors || opts.maskAcc)) {
    const accent = opts.maskAcc
      ? '#ffffff'
      : v.strokeMode === 'access' || v.accessYellow
        ? v.yellow
        : NAVY.l1;
    const r = Math.max(1.3, 2.6 * Math.min(1, W / 411)) * ss;
    const m = [];
    for (const a of anchors.values()) {
      let z = a.zTop;
      if (v.cur != null && v.above === 'cut' && z > v.cur) {
        const vis = [...a.levels].filter((l) => l <= v.cur);
        if (!vis.length) continue;
        z = Math.max(...vis);
      }
      const cx = (a.x - a.y) * HW * s + ox;
      const cy = ((a.x + a.y) * HH - z * ZSTEP) * s + oy;
      const multi = a.levels.size > 1;
      m.push(
        `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${((multi ? r * 1.5 : r)).toFixed(2)}" ` +
          `fill="${multi ? accent : 'none'}" fill-opacity="0.9" stroke="${accent}" ` +
          `stroke-opacity="0.95" stroke-width="${(r * 0.5).toFixed(2)}"/>`,
      );
    }
    if (opts.maskAcc) parts.length = 0;
    parts.push(m.join(''));
  }

  return {
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH}" viewBox="0 0 ${CW} ${CH}">` +
      `<rect width="${CW}" height="${CH}" fill="${bg}"/>` +
      parts.join('') +
      `</svg>`,
    segs,
  };
}

/** the extruded side-wall band of one deck, as a single path d-string */
function wallQuads(polys, s) {
  const wallH = ZSTEP * s;
  const quads = [];
  for (const poly of polys)
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
      quads.push('M' + qq.map((p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L') + 'Z');
    }
  return quads.join('');
}

/** one deck as a solid prism: extruded walls + top face, flattened by group alpha */
function bodyPaths(polys, d, s, faceCol, wallCol, gop) {
  const q = wallQuads(polys, s);
  const inner =
    (q ? `<path d="${q}" fill="${wallCol}" fill-rule="nonzero"/>` : '') +
    `<path d="${d.join('')}" fill="${faceCol}" fill-rule="evenodd"/>`;
  return gop >= 0.999 ? inner : `<g opacity="${gop.toFixed(3)}">${inner}</g>`;
}

// ── raster helpers ────────────────────────────────────────────────────────
const png = (svg) => sharp(Buffer.from(svg)).png().toBuffer();
async function raw(svgOrBuf) {
  const src = typeof svgOrBuf === 'string' ? Buffer.from(svgOrBuf) : svgOrBuf;
  return sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
}
function meanColor(r, mask) {
  const ch = r.info.channels;
  let a = 0;
  let b = 0;
  let c = 0;
  let n = 0;
  for (let i = 0; i < mask.length; i++)
    if (mask[i]) {
      a += r.data[i * ch];
      b += r.data[i * ch + 1];
      c += r.data[i * ch + 2];
      n++;
    }
  return n ? { rgb: [a / n, b / n, c / n], n } : null;
}
function toMask(r, thr) {
  const ch = r.info.channels;
  const n = r.info.width * r.info.height;
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (r.data[i * ch] > thr) m[i] = 1;
  return m;
}
function dilate(m, w, h, rad) {
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue;
      for (let dy = -rad; dy <= rad; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -rad; dx <= rad; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          out[yy * w + xx] = 1;
        }
      }
    }
  return out;
}

// ── whole-body silhouette (raster trace of the union) ─────────────────────
// The visible silhouette of the stack is the boundary of the UNION of all
// projected decks after occlusion. There is no cheap exact vector form of that,
// so it is traced from a 2x supersampled body-only render with the very same
// ring tracer used on the hull lattice — a lit pixel is just a cell.
const silCache = new Map();
async function silhouettePath(v, W, H) {
  const key = W + 'x' + H;
  if (silCache.has(key)) return silCache.get(key);
  const SS = 2;
  const base = { ...v, strokeMode: 'navy', anchors: false, cur: null };
  const built = buildSVG(base, W, H, { ssaa: SS, noStroke: true });
  const r = await raw(built.svg);
  const ch = r.info.channels;
  const bgc = px(v.bg);
  const w = r.info.width;
  const h = r.info.height;
  const cells = new Set();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * ch;
      const d = Math.max(
        Math.abs(r.data[o] - bgc[0]),
        Math.abs(r.data[o + 1] - bgc[1]),
        Math.abs(r.data[o + 2] - bgc[2]),
      );
      if (d > 10) cells.add(K(x, y));
    }
  const rings = traceRings(cells).map(collapse);
  const MIN_AREA = 120 * SS * SS; // target px^2 -> supersampled px^2
  const d = [];
  let kept = 0;
  for (const ring of rings) {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i];
      const q = ring[(i + 1) % ring.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    if (Math.abs(a / 2) < MIN_AREA) continue;
    let pts = ring.map((n) => [n[0] / SS, n[1] / SS]);
    pts.push(pts[0]);
    pts = dp(pts, 0.55);
    if (pts.length < 3) continue;
    kept++;
    d.push('M' + pts.map((p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L') + 'Z');
  }
  const res = { path: d.join(''), rings: kept };
  silCache.set(key, res);
  return res;
}

// ── variant catalogue ─────────────────────────────────────────────────────
const base = {
  bg: BG_POC,
  ramp: 'wide',
  yellow: YEL_HI,
  strokeMode: 'navy',
  anchors: true,
  cur: null,
  above: 'keep',
  aboveOp: 0.25,
  belowDim: 0,
  curFaceYellow: false,
};
const V = (id, label, o) => ({ ...base, ...o, id, label });

// AXIS A — how far the asset yellow goes
const AXIS_A = [
  V('P00_navy_only', 'NAVY only, no yellow anywhere (control)', { strokeMode: 'navy' }),
  V('P01_all_yhi', 'rung 1: ALL 988 outlines yellow #ebc448', { strokeMode: 'yellow', yellow: YEL_HI }),
  V('P02_all_ymid', 'rung 1: ALL outlines muted yellow #a97509', { strokeMode: 'yellow', yellow: YEL_MID }),
  V('P03_top_yhi', 'rung 2: top deck z=7 yellow #ebc448, rest navy', { strokeMode: 'topYellow', topZ: zMax, yellow: YEL_HI }),
  V('P04_top_ymid', 'rung 2: top deck z=7 yellow #a97509, rest navy', { strokeMode: 'topYellow', topZ: zMax, yellow: YEL_MID }),
  V('P05_top0_yhi', 'rung 2b: deck z=0 yellow #ebc448, rest navy', { strokeMode: 'topYellow', topZ: 0, yellow: YEL_HI }),
  V('P06_silh_yhi', 'rung 3: whole-body silhouette yellow #ebc448', { strokeMode: 'silhouette', yellow: YEL_HI }),
  V('P07_silh_ymid', 'rung 3: whole-body silhouette yellow #a97509', { strokeMode: 'silhouette', yellow: YEL_MID }),
  V('P08_access_yhi', 'rung 4: 31 vertical accesses yellow #ebc448', { strokeMode: 'access', yellow: YEL_HI }),
  V('P09_access_ymid', 'rung 4: 31 vertical accesses yellow #a97509', { strokeMode: 'access', yellow: YEL_MID }),
  V('P10_r3_generic', 'ROUND 3 generic blue/cyan (E07 rebuilt) for A/B', { ramp: 'generic', strokeMode: 'navy' }),
  V('P11_silh_access', 'rung 3+4: silhouette AND accesses yellow', { strokeMode: 'silhouette', yellow: YEL_HI, accessYellow: true }),
  V('P12_all_yhi_deck', 'rung 1 on the DECK ramp (faces stop at #344651)', { strokeMode: 'yellow', yellow: YEL_HI, ramp: 'deck' }),
  V('P13_navy_deck', 'NAVY only on the DECK ramp (control for P12)', { strokeMode: 'navy', ramp: 'deck' }),
  V('P14_navy_mid', 'NAVY on the MID ramp (faces stop at #4f6d80)', { strokeMode: 'navy', ramp: 'mid' }),
  V('P15_navy_wide_kramp', 'NAVY, wide face ramp + outline distance grows with height', { strokeMode: 'navy', strokeK: true }),
  V('P16_access_mid_kramp', 'RECOMMENDATION: mid ramp + growing outline distance + yellow accesses', { strokeMode: 'access', ramp: 'mid', strokeK: true, yellow: YEL_HI, bg: BG_G950 }),
];

// background series on the leading yellow candidate
const AXIS_BG = [
  V('G1_bg_poc', 'bg #0b0f18 (round-3 ground)', { strokeMode: 'access', bg: BG_POC }),
  V('G2_bg_gray950', 'bg #030712 (tailwind gray-950)', { strokeMode: 'access', bg: BG_G950 }),
  V('G3_bg_gray900', 'bg #111827 (tailwind gray-900)', { strokeMode: 'access', bg: BG_G900 }),
  V('G4_bg_navy', 'bg #080d13 (navy-tinted)', { strokeMode: 'access', bg: BG_NAVY }),
];

// AXIS B — current deck highlight, per treatment of the decks above
function curSet(zc) {
  const tag = zc < 0 ? 'm' + Math.abs(zc) : 'p' + zc;
  const c = (id, label, o) =>
    V(`L${id}_${tag}`, label, { cur: zc, strokeMode: 'navy', yellow: YEL_HI, ...o });
  const out = [
    c('1_keep', `z=${zc} highlighted, nothing above changed (reference)`, { above: 'keep' }),
    c('2_fade25', `z=${zc} highlighted, decks above at 25 %`, { above: 'fade', aboveOp: 0.25 }),
    c('3_ghost', `z=${zc} highlighted, decks above outline-only`, { above: 'ghost' }),
    c('4_cut', `z=${zc} highlighted, decks above cut away`, { above: 'cut' }),
    c('5_cutdim', `z=${zc} highlighted, above cut + below dimmed 55 %`, { above: 'cut', belowDim: 0.55 }),
    // wall treatment of the highlighted deck — the wall band is what survives
    // occlusion, so this is tested against the do-nothing case on purpose.
    c('6_keep_wallfull', `z=${zc} keep above, highlighted WALL lifted to face colour`, { above: 'keep', curWall: 'full' }),
    c('7_keep_wallyel', `z=${zc} keep above, highlighted WALL tinted yellow`, { above: 'keep', curWall: 'yellow' }),
  ];
  if (zc === -3)
    out.push(
      c('8_cut_yface', `z=${zc} cut away + deck FACE tinted yellow too`, { above: 'cut', curFaceYellow: true }),
      c('9_keep_yface_wallyel', `z=${zc} keep above, FACE and WALL both yellow-tinted`, { above: 'keep', curFaceYellow: true, curWall: 'yellow' }),
    );
  return out;
}
const AXIS_B = [...curSet(-3), ...curSet(4)];

// ── AXIS C — the minimal highlight: change ONLY the outline of the deck ────
// Nothing is hidden, faded or recoloured. Rudi's own proposal, plus the two
// alternatives that do not collide with an axis the drawing already uses.
function hlSet(zc) {
  const tag = zc < 0 ? 'm' + Math.abs(zc) : 'p' + zc;
  const c = (id, label, hl) =>
    V(`M${id}_${tag}`, label, {
      cur: zc,
      strokeMode: 'navy',
      above: 'keep',
      yellow: YEL_HI,
      hl,
    });
  return [
    c('0_none', `z=${zc} NOT highlighted (control, identical framing)`, { lift: 0 }),
    c('1_light25', `way 1: outline lightened 25 % toward white`, { lift: 0.25 }),
    c('2_light50', `way 1: outline lightened 50 % toward white`, { lift: 0.5 }),
    c('3_light80', `way 1: outline lightened 80 % toward white`, { lift: 0.8 }),
    c('4_thick05', `way 2: outline 0.9 -> 1.4 px (+0.5), colour unchanged`, { widthAdd: 0.5 }),
    c('5_thick10', `way 2: outline 0.9 -> 1.9 px (+1.0), colour unchanged`, { widthAdd: 1.0 }),
    c('6_yellow', `way 3: outline #ebc448, width unchanged 0.9 px`, { yellow: true }),
    c('7_yellow_thick05', `way 4: outline #ebc448 at 1.4 px`, { yellow: true, widthAdd: 0.5 }),
    c('8_light50_thick05', `way 4: lightened 50 % AND 1.4 px, no hue`, { lift: 0.5, widthAdd: 0.5 }),
  ];
}
const AXIS_C = [...hlSet(-3), ...hlSet(4)];

// ── the assembled recommendation, both deck cases and the idle case ───────
const FINAL_BASE = {
  ramp: 'mid',
  strokeK: true,
  bg: BG_G950,
  yellow: YEL_HI,
  above: 'keep',
};
const FINAL = [
  V('R0_final_idle', 'RECOMMENDED: no deck selected — accesses yellow, everything else navy', {
    ...FINAL_BASE,
    strokeMode: 'access',
  }),
  V('R1_final_z-3', 'RECOMMENDED: deck z=-3 selected — its outline yellow 1.4 px', {
    ...FINAL_BASE,
    strokeMode: 'navy',
    accessYellow: false,
    cur: -3,
    hl: { yellow: true, widthAdd: 0.5 },
  }),
  V('R2_final_z+4', 'RECOMMENDED: deck z=+4 selected — its outline yellow 1.4 px', {
    ...FINAL_BASE,
    strokeMode: 'navy',
    cur: 4,
    hl: { yellow: true, widthAdd: 0.5 },
  }),
  V('R3_final_z-3_acc', 'variant: deck z=-3 yellow AND the accesses yellow at the same time', {
    ...FINAL_BASE,
    strokeMode: 'navy',
    accessYellow: true,
    cur: -3,
    hl: { yellow: true, widthAdd: 0.5 },
  }),
  V('R4_final_z-3_wide', 'same as R1 but on the WIDE face ramp (height range vs top-deck edge)', {
    ...FINAL_BASE,
    ramp: 'wide',
    strokeMode: 'navy',
    cur: -3,
    hl: { yellow: true, widthAdd: 0.5 },
  }),
];

const ALL = [...AXIS_A, ...AXIS_BG, ...AXIS_B, ...AXIS_C, ...FINAL];

const FULL_W = 411;
const FULL_H = Math.round(FULL_W * CONTENT_ASPECT) + 6;
const SIZES = [
  { id: 'full', w: FULL_W, h: FULL_H },
  { id: 'mini', w: 200, h: 150 },
];

// levels measured for the per-level line/face contrast table
const MEASURE_CONTRAST = [
  'P00_navy_only',
  'P01_all_yhi',
  'P02_all_ymid',
  'P10_r3_generic',
  'P12_all_yhi_deck',
  'P13_navy_deck',
  'P14_navy_mid',
  'P15_navy_wide_kramp',
  'P16_access_mid_kramp',
];

// ── run ───────────────────────────────────────────────────────────────────
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const tAll0 = Date.now();
  const rows = [];
  const contrastTables = {};
  const visTables = {};

  for (const v of ALL) {
    for (const sz of SIZES) {
      const t0 = Date.now();
      let opts = {};
      if (v.strokeMode === 'silhouette') {
        const sil = await silhouettePath(v, sz.w, sz.h);
        opts.silPath = sil.path;
      }
      const built = buildSVG(v, sz.w, sz.h, opts);
      const buf = await png(built.svg);
      const ms = Date.now() - t0;
      const file = path.join(OUT, `${v.id}__${sz.id}.png`);
      fs.writeFileSync(file, buf);

      const r = await raw(buf);
      const bgc = px(v.bg);
      const ch = r.info.channels;
      const n = r.info.width * r.info.height;
      let ink = 0;
      let lit = 0;
      let yellowPx = 0;
      for (let i = 0; i < n; i++) {
        const o = i * ch;
        const d = Math.max(
          Math.abs(r.data[o] - bgc[0]),
          Math.abs(r.data[o + 1] - bgc[1]),
          Math.abs(r.data[o + 2] - bgc[2]),
        );
        ink += Math.min(1, d / 160);
        if (d > 8) lit++;
        // "yellow" = warm pixel: red clearly above blue and reasonably saturated
        if (r.data[o] - r.data[o + 2] > 30 && r.data[o] > 70) yellowPx++;
      }
      rows.push({
        id: v.id,
        label: v.label,
        size: sz.id,
        W: sz.w,
        H: sz.h,
        segs: built.segs,
        ms,
        inkPct: +((ink / n) * 100).toFixed(2),
        coveredPct: +((lit / n) * 100).toFixed(2),
        yellowPctOfDrawn: lit ? +((yellowPx / lit) * 100).toFixed(2) : 0,
        file,
      });
    }
  }

  // ── measurement 1: per-level line vs own-face contrast (411 size) ───────
  const MW = FULL_W;
  const MH = FULL_H;
  for (const id of MEASURE_CONTRAST) {
    const v = ALL.find((x) => x.id === id);
    const A = await raw((await png(buildSVG(v, MW, MH, {}).svg)));
    const B = await raw((await png(buildSVG(v, MW, MH, { noStroke: true }).svg)));
    const w = A.info.width;
    const h = A.info.height;
    const tbl = [];
    for (const z of zLevels) {
      const ms = await raw(await png(buildSVG(v, MW, MH, { maskStroke: z }).svg));
      const mf = await raw(await png(buildSVG(v, MW, MH, { maskFace: z }).svg));
      const strokeM = toMask(ms, 110);
      const faceM = toMask(mf, 110);
      const ring = dilate(strokeM, w, h, 2);
      const faceRing = new Uint8Array(strokeM.length);
      let nr = 0;
      for (let i = 0; i < ring.length; i++)
        if (ring[i] && !strokeM[i] && faceM[i]) {
          faceRing[i] = 1;
          nr++;
        }
      const lineC = meanColor(A, strokeM);
      const faceC = nr ? meanColor(B, faceRing) : null;
      const localC = meanColor(B, ring);
      const st = resolve(v, z);
      tbl.push({
        z,
        cells: levelGeom.get(z).cellCount,
        strokePx: lineC ? lineC.n : 0,
        facePx: nr,
        nominalStroke: st ? st.stroke : null,
        nominalFace: st ? st.face : null,
        lineRGB: lineC ? lineC.rgb.map((x) => Math.round(x)) : null,
        faceRGB: faceC ? faceC.rgb.map((x) => Math.round(x)) : null,
        faceHex: faceC ? rgb2hex(faceC.rgb) : null,
        lineHex: lineC ? rgb2hex(lineC.rgb) : null,
        faceLstar: faceC ? +lstar(faceC.rgb).toFixed(1) : null,
        contrast: lineC && faceC ? +contrastRatio(lineC.rgb, faceC.rgb).toFixed(2) : null,
        contrastLocal:
          lineC && localC ? +contrastRatio(lineC.rgb, localC.rgb).toFixed(2) : null,
      });
    }
    // adjacent-deck face separation, from the SAME measured face colours
    for (let i = 1; i < tbl.length; i++) {
      if (tbl[i].faceLstar != null && tbl[i - 1].faceLstar != null)
        tbl[i].dLstarToBelow = +(tbl[i].faceLstar - tbl[i - 1].faceLstar).toFixed(1);
    }
    contrastTables[id] = tbl;
  }

  // silhouette + anchor accent contrast for the accent-only rungs
  for (const id of ['P06_silh_yhi', 'P07_silh_ymid', 'P08_access_yhi', 'P09_access_ymid']) {
    const v = ALL.find((x) => x.id === id);
    const sil = v.strokeMode === 'silhouette' ? await silhouettePath(v, MW, MH) : null;
    const opts = sil ? { silPath: sil.path } : {};
    const A = await raw(await png(buildSVG(v, MW, MH, opts).svg));
    const B = await raw(await png(buildSVG(v, MW, MH, { ...opts, noStroke: true }).svg));
    const maskOpts = sil ? { maskSil: true, silPath: sil.path } : { maskAcc: true };
    const M = await raw(await png(buildSVG(v, MW, MH, maskOpts).svg));
    const m = toMask(M, 110);
    const w = A.info.width;
    const h = A.info.height;
    const ring = dilate(m, w, h, 2);
    const outer = new Uint8Array(m.length);
    for (let i = 0; i < ring.length; i++) if (ring[i] && !m[i]) outer[i] = 1;
    const lc = meanColor(A, m);
    const bc = meanColor(B, outer);
    contrastTables[id + '__accent'] = {
      kind: sil ? 'silhouette' : 'access markers',
      accentPx: lc ? lc.n : 0,
      accentHex: lc ? rgb2hex(lc.rgb) : null,
      surroundHex: bc ? rgb2hex(bc.rgb) : null,
      contrast: lc && bc ? +contrastRatio(lc.rgb, bc.rgb).toFixed(2) : null,
      silRings: sil ? sil.rings : null,
    };
  }

  // ── measurement 2a: does a deck stay visible at all? ────────────────────
  // Rudi's objection: a deck can lose its whole top face and still be readable
  // through its extruded WALL BAND. So face and wall are counted separately and
  // together, for EVERY one of the 15 decks, on the plain unhighlighted body.
  // No highlighting is involved — this is a property of the geometry.
  const deckVis = {};
  for (const sz of SIZES) {
    const ctrl = ALL.find((x) => x.id === 'P00_navy_only');
    const tbl = [];
    for (const z of zLevels) {
      const faceAll = toMask(
        await raw(await png(buildSVG(ctrl, sz.w, sz.h, { maskFace: z, dropAbove: z }).svg)),
        110,
      );
      const faceVis = toMask(
        await raw(await png(buildSVG(ctrl, sz.w, sz.h, { maskFace: z }).svg)),
        110,
      );
      const wallAll = toMask(
        await raw(await png(buildSVG(ctrl, sz.w, sz.h, { maskWall: z, dropAbove: z }).svg)),
        110,
      );
      const wallVis = toMask(
        await raw(await png(buildSVG(ctrl, sz.w, sz.h, { maskWall: z }).svg)),
        110,
      );
      const cnt = (m) => {
        let n = 0;
        for (let i = 0; i < m.length; i++) if (m[i]) n++;
        return n;
      };
      const fA = cnt(faceAll);
      const fV = cnt(faceVis);
      const wA = cnt(wallAll);
      const wV = cnt(wallVis);
      tbl.push({
        z,
        hulls: levelGeom.get(z).cellCount,
        facePx: fA,
        faceVisPx: fV,
        facePct: fA ? +((fV / fA) * 100).toFixed(1) : null,
        wallPx: wA,
        wallVisPx: wV,
        wallPct: wA ? +((wV / wA) * 100).toFixed(1) : null,
        totalPx: fA + wA,
        totalVisPx: fV + wV,
        totalPct: fA + wA ? +(((fV + wV) / (fA + wA)) * 100).toFixed(1) : null,
      });
    }
    deckVis[sz.id] = tbl;
  }

  // ── measurement 2b: how much of the HIGHLIGHT survives ──────────────────
  // Same idea, but over the highlighted deck's face AND wall together, and
  // continuous: 100 % = looks as if nothing were above it, 0 % = as buried as
  // the do-nothing baseline.
  for (const sz of SIZES) {
    for (const v of AXIS_B) {
      const zc = v.cur;
      const REF = await raw(await png(buildSVG({ ...v, above: 'cut' }, sz.w, sz.h, { dropAbove: zc }).svg));
      const BASE = await raw(await png(buildSVG({ ...v, above: 'keep' }, sz.w, sz.h, {}).svg));
      const A = await raw(await png(buildSVG(v, sz.w, sz.h, {}).svg));
      const mf = toMask(
        await raw(await png(buildSVG(v, sz.w, sz.h, { maskFace: zc, dropAbove: zc }).svg)),
        110,
      );
      const mw = toMask(
        await raw(await png(buildSVG(v, sz.w, sz.h, { maskWall: zc, dropAbove: zc }).svg)),
        110,
      );
      const ch = A.info.channels;
      const acc = { face: [0, 0, 0], wall: [0, 0, 0] };
      for (let i = 0; i < mf.length; i++) {
        const which = mf[i] ? 'face' : mw[i] ? 'wall' : null;
        if (!which) continue;
        const a = acc[which];
        a[0]++;
        const o = i * ch;
        const dBase =
          (Math.abs(BASE.data[o] - REF.data[o]) +
            Math.abs(BASE.data[o + 1] - REF.data[o + 1]) +
            Math.abs(BASE.data[o + 2] - REF.data[o + 2])) /
          3;
        const dA =
          (Math.abs(A.data[o] - REF.data[o]) +
            Math.abs(A.data[o + 1] - REF.data[o + 1]) +
            Math.abs(A.data[o + 2] - REF.data[o + 2])) /
          3;
        if (dBase < 6) {
          a[1]++;
          a[2] += 1;
        } else a[2] += Math.max(0, 1 - dA / dBase);
      }
      const tot = acc.face[0] + acc.wall[0];
      const totUn = acc.face[1] + acc.wall[1];
      const totRet = acc.face[2] + acc.wall[2];
      visTables[v.id + '__' + sz.id] = {
        id: v.id,
        size: sz.id,
        z: zc,
        facePx: acc.face[0],
        wallPx: acc.wall[0],
        deckPx: tot,
        faceUnoccPct: acc.face[0] ? +((acc.face[1] / acc.face[0]) * 100).toFixed(1) : 0,
        wallUnoccPct: acc.wall[0] ? +((acc.wall[1] / acc.wall[0]) * 100).toFixed(1) : 0,
        unoccludedPct: tot ? +((totUn / tot) * 100).toFixed(1) : 0,
        retentionPct: tot ? +((totRet / tot) * 100).toFixed(1) : 0,
      };
    }
  }

  // ── measurement 3: the minimal outline highlight ────────────────────────
  // Lightness already encodes height. So the question is not "is the outline
  // brighter" but "is it brighter than the ramp step it has to beat, without
  // landing on the brightness of some other deck". Both numbers come from the
  // SAME source: the measured outline L* of every deck in the unhighlighted
  // drawing.
  const hlTables = {};
  for (const sz of SIZES) {
    const ctrl = ALL.find((x) => x.id === 'P00_navy_only');
    const A0 = await raw(await png(buildSVG(ctrl, sz.w, sz.h, {}).svg));
    const baseDeck = [];
    for (const z of zLevels) {
      const m = toMask(
        await raw(await png(buildSVG(ctrl, sz.w, sz.h, { maskStroke: z }).svg)),
        110,
      );
      const c = meanColor(A0, m);
      baseDeck.push({
        z,
        px: c ? c.n : 0,
        hex: c ? rgb2hex(c.rgb) : null,
        L: c ? +lstar(c.rgb).toFixed(2) : null,
      });
    }
    // the confusion floor: how far apart two neighbouring decks' outlines
    // already are. A highlight smaller than this cannot be seen as a highlight.
    const steps = [];
    for (let i = 1; i < baseDeck.length; i++)
      if (baseDeck[i].L != null && baseDeck[i - 1].L != null)
        steps.push(+(baseDeck[i].L - baseDeck[i - 1].L).toFixed(2));
    const sortedSteps = [...steps].map(Math.abs).sort((a, b) => a - b);

    const variants = [];
    for (const v of AXIS_C) {
      const zc = v.cur;
      const A = await raw(await png(buildSVG(v, sz.w, sz.h, {}).svg));
      const m = toMask(
        await raw(await png(buildSVG(v, sz.w, sz.h, { maskStroke: zc }).svg)),
        110,
      );
      const c = meanColor(A, m);
      const bd = baseDeck.find((b) => b.z === zc);
      const L = c ? +lstar(c.rgb).toFixed(2) : null;
      const dOwn = L != null && bd.L != null ? +(L - bd.L).toFixed(2) : null;
      const nb = [zc - 1, zc + 1]
        .map((z) => baseDeck.find((b) => b.z === z))
        .filter(Boolean);
      const dNb = L != null ? nb.map((n) => +(L - n.L).toFixed(2)) : [];
      // which deck's normal outline brightness does the highlighted one now
      // impersonate? if that is not the deck itself, the height cue is broken.
      let readsAs = null;
      let bestD = 1e9;
      for (const b of baseDeck) {
        if (b.L == null || L == null) continue;
        const d = Math.abs(b.L - L);
        if (d < bestD) {
          bestD = d;
          readsAs = b.z;
        }
      }
      const brightest = baseDeck.reduce((a, b) => (b.L != null && (!a || b.L > a.L) ? b : a), null);
      variants.push({
        id: v.id,
        z: zc,
        strokePx: c ? c.n : 0,
        strokePxBase: bd.px,
        weightMult: bd.px ? +((c ? c.n : 0) / bd.px).toFixed(2) : null,
        hex: c ? rgb2hex(c.rgb) : null,
        L,
        baseL: bd.L,
        dL_ownBase: dOwn,
        dL_neighbours: dNb,
        readsAsDeck: readsAs,
        readsAsSelf: readsAs === zc,
        brightestDeckL: brightest ? brightest.L : null,
        warmPx: (() => {
          const ch = A.info.channels;
          let n = 0;
          for (let i = 0; i < m.length; i++)
            if (m[i] && A.data[i * ch] - A.data[i * ch + 2] > 30) n++;
          return n;
        })(),
      });
    }
    hlTables[sz.id] = {
      pxPerTile: +(fit(sz.w, sz.h).s * TW).toFixed(2),
      baseStrokeWidthPx: 0.9,
      deckOutlineL: baseDeck,
      adjacentStepL: {
        min: sortedSteps[0],
        median: sortedSteps[(sortedSteps.length / 2) | 0],
        max: sortedSteps[sortedSteps.length - 1],
      },
      variants,
    };
  }

  // ── contact sheets ──────────────────────────────────────────────────────
  async function sheet(name, ids, sizeId, cols, cellW, cellH, note, extra) {
    const items = ids
      .map((id) => rows.find((r) => r.id === id && r.size === sizeId))
      .filter(Boolean);
    const LH = 40;
    const gap = 12;
    const rowsN = Math.ceil(items.length / cols);
    const W = cols * (cellW + gap) + gap;
    const H = rowsN * (cellH + LH + gap) + gap + 58;
    const comps = [];
    const lab = [
      `<text x="${gap}" y="24" fill="#ebc448" font-family="monospace" font-size="16" font-weight="bold">` +
        `Shadow Nexus I — round 4 — ${escapeXml(name)} — ${items.length ? items[0].W + 'x' + items[0].H : sizeId}</text>`,
      `<text x="${gap}" y="43" fill="#768793" font-family="monospace" font-size="11">${escapeXml(note || '')}</text>`,
    ];
    items.forEach((r, i) => {
      const c = i % cols;
      const rr = (i / cols) | 0;
      const x = gap + c * (cellW + gap);
      const y = 58 + rr * (cellH + LH + gap);
      comps.push({ input: r.file, left: x, top: y + Math.max(0, ((cellH - r.H) / 2) | 0) });
      const ex = extra ? extra(r) : '';
      lab.push(
        `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="none" stroke="#2f3b45"/>`,
        `<text x="${x}" y="${y + cellH + 13}" fill="#ebc448" font-family="monospace" font-size="11">${r.id}</text>`,
        `<text x="${x}" y="${y + cellH + 25}" fill="#768793" font-family="monospace" font-size="9">` +
          `${escapeXml(r.label.length > cellW / 5.2 ? r.label.slice(0, Math.floor(cellW / 5.2) - 1) + '…' : r.label)}</text>`,
        `<text x="${x}" y="${y + cellH + 36}" fill="#6c93ae" font-family="monospace" font-size="9">` +
          `ink ${r.inkPct}%  warm ${r.yellowPctOfDrawn}%  ${escapeXml(ex)}</text>`,
      );
    });
    const ov = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${lab.join('')}</svg>`,
    );
    const out = path.join(OUT, `SHEET_R4_${name}_${sizeId}.png`);
    await sharp({ create: { width: W, height: H, channels: 4, background: '#05080e' } })
      .composite([...comps, { input: ov, left: 0, top: 0 }])
      .png()
      .toFile(out);
    return out;
  }

  const sheets = [];
  const aIds = AXIS_A.map((v) => v.id);
  sheets.push(await sheet('yellow-ladder', aIds, 'full', 3, FULL_W, FULL_H, 'axis A: how far the asset yellow goes. warm% = share of drawn pixels that read as warm/yellow.'));
  sheets.push(await sheet('yellow-ladder', aIds, 'mini', 5, 200, 150, 'axis A at minimap size 200x150'));
  sheets.push(await sheet('background', AXIS_BG.map((v) => v.id), 'full', 4, FULL_W, FULL_H, 'does the bottom deck #0f1b26 drown against the ground?'));

  const vis = (r) => {
    const t = visTables[r.id + '__' + r.size];
    return t ? `deck vis ${t.unoccludedPct}% / retention ${t.retentionPct}%` : '';
  };
  const bIdsM3 = AXIS_B.filter((v) => v.cur === -3).map((v) => v.id);
  const bIdsP4 = AXIS_B.filter((v) => v.cur === 4).map((v) => v.id);
  sheets.push(await sheet('current-z-3', bIdsM3, 'full', 4, FULL_W, FULL_H, 'axis B, deck z=-3 (1915 hulls, TEN decks above it)', vis));
  sheets.push(await sheet('current-z-3', bIdsM3, 'mini', 4, 200, 150, 'axis B, deck z=-3 at minimap size', vis));
  sheets.push(await sheet('current-z+4', bIdsP4, 'full', 5, FULL_W, FULL_H, 'axis B, deck z=+4 (457 hulls, only three decks above it)', vis));
  sheets.push(await sheet('current-z+4', bIdsP4, 'mini', 5, 200, 150, 'axis B, deck z=+4 at minimap size', vis));

  // head-to-head: round-3 generic vs navy control vs the two accent rungs
  sheets.push(
    await sheet(
      'AB-palette',
      ['P10_r3_generic', 'P00_navy_only', 'P08_access_yhi', 'P06_silh_yhi', 'P01_all_yhi', 'P13_navy_deck'],
      'full',
      3,
      FULL_W,
      FULL_H,
      'round-3 generic blue/cyan vs the measured asset navy, and the yellow rungs',
    ),
  );
  sheets.push(
    await sheet(
      'AB-palette',
      ['P10_r3_generic', 'P00_navy_only', 'P08_access_yhi', 'P06_silh_yhi', 'P01_all_yhi', 'P13_navy_deck'],
      'mini',
      6,
      200,
      150,
      'the same six at minimap size',
    ),
  );

  // contrast chart: per-level line-vs-own-face contrast for the measured set
  {
    const ids = MEASURE_CONTRAST;
    const cw = 62;
    const rowH = 26;
    const left = 250;
    const W = left + zLevels.length * cw + 30;
    const H = 92 + ids.length * (rowH + 6) + 60;
    const p = [
      `<rect width="${W}" height="${H}" fill="#05080e"/>`,
      `<text x="16" y="26" fill="#ebc448" font-family="monospace" font-size="16" font-weight="bold">` +
        `MANDATORY MEASUREMENT — outline vs its OWN deck face, WCAG contrast ratio, measured from the rendered PNG</text>`,
      `<text x="16" y="46" fill="#768793" font-family="monospace" font-size="11">` +
        `line colour sampled over the visible outline pixels of that deck; face colour sampled in a 2 px ring restricted to that deck's visible top face. green >=3.0  amber 2.0-3.0  red &lt;2.0</text>`,
      `<text x="16" y="62" fill="#768793" font-family="monospace" font-size="11">` +
        `bottom row: measured face L* per deck — the level-separation the ramp buys, which is what a fixed line colour has to fight.</text>`,
    ];
    zLevels.forEach((z, i) => {
      p.push(
        `<text x="${left + i * cw + cw / 2}" y="86" text-anchor="middle" fill="#6c93ae" font-family="monospace" font-size="12">z=${z}</text>`,
      );
    });
    ids.forEach((id, r) => {
      const y = 100 + r * (rowH + 6);
      p.push(
        `<text x="16" y="${y + 17}" fill="#cfe0ea" font-family="monospace" font-size="11">${escapeXml(id)}</text>`,
      );
      contrastTables[id].forEach((c, i) => {
        const x = left + i * cw;
        const col =
          c.contrast == null
            ? '#2f3b45'
            : c.contrast >= 3
              ? '#2f6f4a'
              : c.contrast >= 2
                ? '#7a5a12'
                : '#7a2020';
        p.push(
          `<rect x="${x + 2}" y="${y}" width="${cw - 4}" height="${rowH}" fill="${col}"/>`,
          `<text x="${x + cw / 2}" y="${y + 17}" text-anchor="middle" fill="#e9eef2" font-family="monospace" font-size="12">` +
            `${c.contrast == null ? '—' : c.contrast.toFixed(2)}</text>`,
        );
      });
    });
    const yL = 100 + ids.length * (rowH + 6) + 14;
    p.push(
      `<text x="16" y="${yL + 15}" fill="#768793" font-family="monospace" font-size="11">face L* (wide ramp)</text>`,
    );
    contrastTables['P00_navy_only'].forEach((c, i) => {
      p.push(
        `<text x="${left + i * cw + cw / 2}" y="${yL + 15}" text-anchor="middle" fill="#768793" font-family="monospace" font-size="11">` +
          `${c.faceLstar == null ? '—' : c.faceLstar.toFixed(0)}</text>`,
      );
    });
    const yL2 = yL + 22;
    p.push(
      `<text x="16" y="${yL2 + 15}" fill="#768793" font-family="monospace" font-size="11">face L* (deck ramp)</text>`,
    );
    contrastTables['P13_navy_deck'].forEach((c, i) => {
      p.push(
        `<text x="${left + i * cw + cw / 2}" y="${yL2 + 15}" text-anchor="middle" fill="#768793" font-family="monospace" font-size="11">` +
          `${c.faceLstar == null ? '—' : c.faceLstar.toFixed(0)}</text>`,
      );
    });
    const out = path.join(OUT, 'SHEET_R4_contrast.png');
    await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${p.join('')}</svg>`))
      .png()
      .toFile(out);
    sheets.push(out);
  }

  // AXIS C sheets — the minimal outline highlight, deep deck vs high deck
  const hlEx = (r) => {
    const t = hlTables[r.size].variants.find((x) => x.id === r.id);
    if (!t) return '';
    return `L* ${t.L}  dL* own ${t.dL_ownBase >= 0 ? '+' : ''}${t.dL_ownBase}  reads as z=${t.readsAsDeck}  weight x${t.weightMult}`;
  };
  for (const zc of [-3, 4]) {
    const ids = AXIS_C.filter((v) => v.cur === zc).map((v) => v.id);
    const nm = 'outline-highlight-z' + (zc < 0 ? zc : '+' + zc);
    sheets.push(
      await sheet(nm, ids, 'full', 3, FULL_W, FULL_H,
        `axis C: ONLY the outline of deck z=${zc} changes. base stroke 0.9 px. "reads as z=" is the deck whose normal outline brightness the highlight now matches — if that is not ${zc}, the height ramp has been overwritten.`,
        hlEx),
    );
    sheets.push(
      await sheet(nm, ids, 'mini', 5, 200, 150,
        `axis C at 200x150 — ${hlTables.mini.pxPerTile} px per tile, so +1 px on a 0.9 px stroke is a 2.1x line`,
        hlEx),
    );
  }

  // the assembled recommendation
  sheets.push(
    await sheet('RECOMMENDATION', FINAL.map((v) => v.id), 'full', 3, FULL_W, FULL_H,
      'mid face ramp (#0f1b26 -> #4f6d80), outline distance grows with height, ground #030712, yellow only where it has a job'),
  );
  sheets.push(
    await sheet('RECOMMENDATION', FINAL.map((v) => v.id), 'mini', 5, 200, 150,
      'the same five at minimap size 200x150'),
  );

  // AXIS C chart — where lightness collides with the height ramp
  {
    const W = 1180;
    const rowH = 22;
    const nRows = AXIS_C.length;
    const H = 150 + nRows * (rowH + 4) + 120;
    const p = [
      `<rect width="${W}" height="${H}" fill="#05080e"/>`,
      `<text x="16" y="26" fill="#ebc448" font-family="monospace" font-size="16" font-weight="bold">` +
        `MINIMAL HIGHLIGHT — only the outline of the current deck changes</text>`,
      `<text x="16" y="46" fill="#768793" font-family="monospace" font-size="11">` +
        `lightness is NOT a free axis: the drawing already spends it on height. The measured outline L* of every deck, unhighlighted:</text>`,
    ];
    const bd = hlTables.full.deckOutlineL;
    const cw = 68;
    bd.forEach((b, i) => {
      p.push(
        `<text x="${40 + i * cw}" y="72" fill="#6c93ae" font-family="monospace" font-size="11">z=${b.z}</text>`,
        `<text x="${40 + i * cw}" y="88" fill="#cfe0ea" font-family="monospace" font-size="11">${b.L == null ? '—' : b.L.toFixed(1)}</text>`,
      );
    });
    const st = hlTables.full.adjacentStepL;
    p.push(
      `<text x="16" y="112" fill="#768793" font-family="monospace" font-size="11">` +
        `adjacent-deck outline step: min ${st.min}  median ${st.median}  max ${st.max} L*  — a highlight must beat the median to be seen, and must not land on another deck's value.</text>`,
      `<text x="16" y="134" fill="#6c93ae" font-family="monospace" font-size="11">variant</text>`,
      `<text x="300" y="134" fill="#6c93ae" font-family="monospace" font-size="11">size</text>`,
      `<text x="360" y="134" fill="#6c93ae" font-family="monospace" font-size="11">line L*</text>`,
      `<text x="440" y="134" fill="#6c93ae" font-family="monospace" font-size="11">dL* vs own</text>`,
      `<text x="550" y="134" fill="#6c93ae" font-family="monospace" font-size="11">dL* vs nbrs</text>`,
      `<text x="680" y="134" fill="#6c93ae" font-family="monospace" font-size="11">reads as</text>`,
      `<text x="780" y="134" fill="#6c93ae" font-family="monospace" font-size="11">line weight</text>`,
      `<text x="890" y="134" fill="#6c93ae" font-family="monospace" font-size="11">verdict</text>`,
    );
    let y = 150;
    for (const szId of ['full', 'mini'])
      for (const t of hlTables[szId].variants) {
        y += rowH + 2;
        const beats = t.dL_ownBase != null && Math.abs(t.dL_ownBase) >= hlTables[szId].adjacentStepL.median;
        const keeps = t.readsAsSelf;
        const hue = t.warmPx > t.strokePx * 0.5;
        const verdict = hue
          ? 'HUE — free axis, unambiguous'
          : t.weightMult > 1.25 && !t.dL_ownBase
            ? 'WIDTH — free axis'
            : beats && keeps
              ? 'ok'
              : beats && !keeps
                ? 'reads as another deck'
                : 'below the ramp step';
        const col = hue || (beats && keeps) || (t.weightMult > 1.25 && !t.dL_ownBase)
          ? '#2f6f4a'
          : beats && !keeps
            ? '#7a2020'
            : '#7a5a12';
        p.push(
          `<text x="16" y="${y}" fill="#cfe0ea" font-family="monospace" font-size="11">${escapeXml(t.id)}</text>`,
          `<text x="300" y="${y}" fill="#768793" font-family="monospace" font-size="11">${szId}</text>`,
          `<text x="360" y="${y}" fill="#e9eef2" font-family="monospace" font-size="11">${t.L}</text>`,
          `<text x="440" y="${y}" fill="#e9eef2" font-family="monospace" font-size="11">${t.dL_ownBase > 0 ? '+' : ''}${t.dL_ownBase}</text>`,
          `<text x="550" y="${y}" fill="#9fb4c2" font-family="monospace" font-size="11">${t.dL_neighbours.join(' / ')}</text>`,
          `<text x="680" y="${y}" fill="${keeps ? '#9fb4c2' : '#e0a0a0'}" font-family="monospace" font-size="11">z=${t.readsAsDeck}</text>`,
          `<text x="780" y="${y}" fill="#9fb4c2" font-family="monospace" font-size="11">x${t.weightMult}</text>`,
          `<rect x="885" y="${y - 12}" width="240" height="${rowH - 8}" fill="${col}" fill-opacity="0.45"/>`,
          `<text x="892" y="${y}" fill="#e9eef2" font-family="monospace" font-size="11">${verdict}</text>`,
        );
      }
    const out = path.join(OUT, 'SHEET_R4_outline-highlight-metrics.png');
    await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y + 24}">${p.join('')}</svg>`))
      .png()
      .toFile(out);
    sheets.push(out);
  }

  // deck-visibility chart: every deck, face vs wall vs total
  {
    const rowH = 22;
    const W = 1120;
    const H = 118 + zLevels.length * (rowH + 4) * 2 + 60;
    const p = [
      `<rect width="${W}" height="${H}" fill="#05080e"/>`,
      `<text x="16" y="26" fill="#ebc448" font-family="monospace" font-size="16" font-weight="bold">` +
        `IS A DECK VISIBLE AT ALL? — top face vs extruded WALL BAND, per deck, plain body, no highlighting</text>`,
      `<text x="16" y="46" fill="#768793" font-family="monospace" font-size="11">` +
        `measured on the rendered image through per-deck occlusion masks: everything drawn above the deck counts as opaque.</text>`,
      `<text x="16" y="62" fill="#768793" font-family="monospace" font-size="11">` +
        `the wall band is the extrusion minus the deck's own top face — it is exactly the part that survives when a bigger deck sits on top.</text>`,
    ];
    let y = 88;
    for (const szId of ['full', 'mini']) {
      p.push(
        `<text x="16" y="${y}" fill="#6c93ae" font-family="monospace" font-size="12" font-weight="bold">${szId === 'full' ? FULL_W + 'x' + FULL_H : '200x150'}</text>`,
        `<text x="120" y="${y}" fill="#6c93ae" font-family="monospace" font-size="11">deck</text>`,
        `<text x="185" y="${y}" fill="#6c93ae" font-family="monospace" font-size="11">hulls</text>`,
        `<text x="250" y="${y}" fill="#6c93ae" font-family="monospace" font-size="11">face vis</text>`,
        `<text x="340" y="${y}" fill="#6c93ae" font-family="monospace" font-size="11">wall vis</text>`,
        `<text x="430" y="${y}" fill="#6c93ae" font-family="monospace" font-size="11">TOTAL vis</text>`,
      );
      y += 8;
      for (const d of deckVis[szId]) {
        y += rowH + 2;
        const bw = 560 * ((d.totalPct || 0) / 100);
        const col = d.totalPct >= 50 ? '#2f6f4a' : d.totalPct >= 25 ? '#7a5a12' : '#7a2020';
        p.push(
          `<text x="120" y="${y}" fill="#cfe0ea" font-family="monospace" font-size="11">z=${d.z}</text>`,
          `<text x="185" y="${y}" fill="#768793" font-family="monospace" font-size="11">${d.hulls}</text>`,
          `<text x="250" y="${y}" fill="${d.facePct < 15 ? '#d08a8a' : '#9fb4c2'}" font-family="monospace" font-size="11">${d.facePct}%</text>`,
          `<text x="340" y="${y}" fill="${d.wallPct < 15 ? '#d08a8a' : '#9fb4c2'}" font-family="monospace" font-size="11">${d.wallPct}%</text>`,
          `<rect x="430" y="${y - 12}" width="${bw.toFixed(1)}" height="${rowH - 8}" fill="${col}"/>`,
          `<text x="${440 + bw}" y="${y}" fill="#e9eef2" font-family="monospace" font-size="11">${d.totalPct}%</text>`,
        );
      }
      y += 34;
    }
    const out = path.join(OUT, 'SHEET_R4_deck-visibility.png');
    await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${p.join('')}</svg>`))
      .png()
      .toFile(out);
    sheets.push(out);
  }

  // visibility chart for axis B
  {
    const items = Object.values(visTables);
    const rowH = 24;
    const W = 980;
    const H = 96 + items.length * (rowH + 4) + 20;
    const p = [
      `<rect width="${W}" height="${H}" fill="#05080e"/>`,
      `<text x="16" y="26" fill="#ebc448" font-family="monospace" font-size="16" font-weight="bold">` +
        `MEASUREMENT — how much of the highlighted deck survives the decks above it</text>`,
      `<text x="16" y="46" fill="#768793" font-family="monospace" font-size="11">` +
        `deck px = the deck's own footprint in the frame. unoccluded = pixels with literally nothing drawn over them.</text>`,
      `<text x="16" y="62" fill="#768793" font-family="monospace" font-size="11">` +
        `retention = 100 % means the deck looks as if nothing were above it, 0 % means as buried as the do-nothing baseline.</text>`,
      `<text x="16" y="86" fill="#6c93ae" font-family="monospace" font-size="11">variant</text>`,
      `<text x="330" y="86" fill="#6c93ae" font-family="monospace" font-size="11">size</text>`,
      `<text x="400" y="86" fill="#6c93ae" font-family="monospace" font-size="11">deck px</text>`,
      `<text x="470" y="86" fill="#6c93ae" font-family="monospace" font-size="11">face un.</text>`,
      `<text x="545" y="86" fill="#6c93ae" font-family="monospace" font-size="11">wall un.</text>`,
      `<text x="620" y="86" fill="#6c93ae" font-family="monospace" font-size="11">retention (face+wall)</text>`,
    ];
    items.forEach((it, i) => {
      const y = 96 + i * (rowH + 4);
      const bw = 280 * (it.retentionPct / 100);
      const col = it.retentionPct >= 80 ? '#2f6f4a' : it.retentionPct >= 45 ? '#7a5a12' : '#7a2020';
      p.push(
        `<text x="16" y="${y + 16}" fill="#cfe0ea" font-family="monospace" font-size="11">${escapeXml(it.id)}</text>`,
        `<text x="330" y="${y + 16}" fill="#768793" font-family="monospace" font-size="11">${it.size}</text>`,
        `<text x="400" y="${y + 16}" fill="#768793" font-family="monospace" font-size="11">${it.deckPx}</text>`,
        `<text x="470" y="${y + 16}" fill="#9fb4c2" font-family="monospace" font-size="11">${it.faceUnoccPct}%</text>`,
        `<text x="545" y="${y + 16}" fill="#9fb4c2" font-family="monospace" font-size="11">${it.wallUnoccPct}%</text>`,
        `<rect x="640" y="${y + 4}" width="${bw.toFixed(1)}" height="${rowH - 8}" fill="${col}"/>`,
        `<text x="${650 + bw}" y="${y + 16}" fill="#e9eef2" font-family="monospace" font-size="11">${it.retentionPct}%</text>`,
      );
    });
    const out = path.join(OUT, 'SHEET_R4_visibility.png');
    await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${p.join('')}</svg>`))
      .png()
      .toFile(out);
    sheets.push(out);
  }

  // ── background numeric check ────────────────────────────────────────────
  const bgTable = [];
  for (const [name, bg] of [
    ['#0b0f18 poc', BG_POC],
    ['#030712 gray-950', BG_G950],
    ['#111827 gray-900', BG_G900],
    ['#080d13 navy', BG_NAVY],
  ]) {
    const effBottom = mix(bg, NAVY.d1, FACE_OP); // bottom deck face at 85 % over ground
    const effWall = mix(bg, shade(NAVY.d1, 0.55), FACE_OP);
    bgTable.push({
      bg: name,
      bottomFaceEff: effBottom,
      bottomFaceVsBg: +contrastRatio(px(effBottom), px(bg)).toFixed(3),
      bottomWallVsBg: +contrastRatio(px(effWall), px(bg)).toFixed(3),
      dL: +(lstar(px(effBottom)) - lstar(px(bg))).toFixed(2),
      yellowHiVsBg: +contrastRatio(px(YEL_HI), px(bg)).toFixed(2),
      yellowMidVsBg: +contrastRatio(px(YEL_MID), px(bg)).toFixed(2),
    });
  }

  // ── stats ───────────────────────────────────────────────────────────────
  const stats = {
    snapshot: {
      structureId: snap.structureId,
      hulls: snap.hulls.length,
      parseMs: tLoad,
      zLevels: zLevels.length,
      anchors: anchors.size,
      anchorsMultiLevel: [...anchors.values()].filter((a) => a.levels.size > 1).length,
    },
    traceTotalMs: +traceTotal.toFixed(2),
    frame: { fullW: FULL_W, fullH: FULL_H, contentAspect: +CONTENT_ASPECT.toFixed(4) },
    palette: { NAVY, YEL_HI, YEL_MID, YEL_DK, YEL_WARM, RAMP_WIDE, RAMP_DECK },
    backgrounds: bgTable,
    variants: rows,
    contrast: contrastTables,
    outlineHighlight: hlTables,
    deckVisibility: deckVis,
    visibility: visTables,
    totalMs: Date.now() - tAll0,
    sheets,
  };
  fs.writeFileSync(path.join(OUT, 'stats-r4.json'), JSON.stringify(stats, null, 2));

  // ── console report ──────────────────────────────────────────────────────
  console.log(`\nframe ${FULL_W}x${FULL_H} (aspect ${CONTENT_ASPECT.toFixed(3)}), trace ${traceTotal.toFixed(1)} ms once, snapshot parse ${tLoad} ms`);
  console.log(`\n=== VARIANTS (ms = SVG build + PNG encode for that one image) ===`);
  console.log('id                     size   segs   ink%   cov%  warm%   ms');
  for (const r of rows)
    console.log(
      `${r.id.padEnd(22)} ${r.size.padEnd(5)} ${String(r.segs).padStart(5)} ${r.inkPct.toFixed(2).padStart(6)} ${r.coveredPct.toFixed(2).padStart(6)} ${r.yellowPctOfDrawn.toFixed(2).padStart(6)} ${String(r.ms).padStart(4)}`,
    );

  console.log(`\n=== CONTRAST: outline vs its OWN deck face (measured) ===`);
  console.log('variant                ' + zLevels.map((z) => ('z' + z).padStart(6)).join('') + '   min   med');
  for (const id of MEASURE_CONTRAST) {
    const t = contrastTables[id];
    const vals = t.map((c) => c.contrast).filter((x) => x != null);
    const sorted = [...vals].sort((a, b) => a - b);
    console.log(
      id.padEnd(22) +
        ' ' +
        t.map((c) => (c.contrast == null ? '     —' : c.contrast.toFixed(2).padStart(6))).join('') +
        '  ' +
        sorted[0].toFixed(2).padStart(5) +
        ' ' +
        sorted[(sorted.length / 2) | 0].toFixed(2).padStart(5),
    );
  }
  console.log('\nface L* per deck (wide ramp): ' + contrastTables['P00_navy_only'].map((c) => (c.faceLstar == null ? '—' : c.faceLstar.toFixed(0))).join(' '));
  console.log('face L* per deck (deck ramp): ' + contrastTables['P13_navy_deck'].map((c) => (c.faceLstar == null ? '—' : c.faceLstar.toFixed(0))).join(' '));

  console.log(`\n=== ACCENT contrast (silhouette / access markers vs surroundings) ===`);
  for (const k of Object.keys(contrastTables))
    if (k.endsWith('__accent')) {
      const a = contrastTables[k];
      console.log(`${k.replace('__accent', '').padEnd(22)} ${a.kind.padEnd(16)} px ${String(a.accentPx).padStart(6)}  ${a.accentHex} on ${a.surroundHex}  ratio ${a.contrast}`);
    }

  for (const szId of ['full', 'mini']) {
    const t = hlTables[szId];
    console.log(`\n=== MINIMAL OUTLINE HIGHLIGHT — ${szId} (${t.pxPerTile} px/tile, base stroke ${t.baseStrokeWidthPx} px) ===`);
    console.log('  deck outline L*: ' + t.deckOutlineL.map((b) => `z${b.z}=${b.L == null ? '—' : b.L.toFixed(1)}`).join(' '));
    console.log(`  adjacent-deck outline step L*: min ${t.adjacentStepL.min}  median ${t.adjacentStepL.median}  max ${t.adjacentStepL.max}`);
    console.log('variant                  lineL*   dL*own   dL*nbrs        readsAs  weight  warmPx/px');
    for (const v of t.variants)
      console.log(
        `${v.id.padEnd(24)} ${String(v.L).padStart(6)} ${String((v.dL_ownBase > 0 ? '+' : '') + v.dL_ownBase).padStart(8)} ${v.dL_neighbours.join('/').padStart(14)} ${('z=' + v.readsAsDeck).padStart(8)} ${('x' + v.weightMult).padStart(7)}  ${v.warmPx}/${v.strokePx}`,
      );
  }

  for (const szId of ['full', 'mini']) {
    console.log(`\n=== IS THE DECK VISIBLE AT ALL — ${szId} (plain body, no highlight) ===`);
    console.log('   z | hulls | facePx faceVis% | wallPx wallVis% | totalPx  TOTAL%');
    for (const d of deckVis[szId])
      console.log(
        `${String(d.z).padStart(4)} |${String(d.hulls).padStart(6)} |${String(d.facePx).padStart(7)} ${String(d.facePct).padStart(8)}% |` +
          `${String(d.wallPx).padStart(7)} ${String(d.wallPct).padStart(8)}% |${String(d.totalPx).padStart(8)} ${String(d.totalPct).padStart(6)}%`,
      );
  }

  console.log(`\n=== HIGHLIGHT SURVIVAL under the decks above (face+wall) ===`);
  console.log('variant                     size  deckPx  faceUn%  wallUn%  retention');
  for (const it of Object.values(visTables))
    console.log(
      `${it.id.padEnd(27)} ${it.size.padEnd(5)} ${String(it.deckPx).padStart(6)} ${(it.faceUnoccPct + '%').padStart(8)} ${(it.wallUnoccPct + '%').padStart(8)} ${(it.retentionPct + '%').padStart(10)}`,
    );

  console.log(`\n=== BACKGROUND: bottom deck (#0f1b26 at 85 %) against the ground ===`);
  console.log('ground              effective bottom  vs bg  wall vs bg   dL*   yel#ebc448  yel#a97509');
  for (const b of bgTable)
    console.log(
      `${b.bg.padEnd(19)} ${b.bottomFaceEff.padEnd(17)} ${b.bottomFaceVsBg.toFixed(3).padStart(5)} ${b.bottomWallVsBg.toFixed(3).padStart(11)} ${b.dL.toFixed(2).padStart(6)} ${b.yellowHiVsBg.toFixed(2).padStart(11)} ${b.yellowMidVsBg.toFixed(2).padStart(11)}`,
    );

  console.log(`\nsheets:\n  ${sheets.join('\n  ')}`);
  console.log(`\ntotal ${stats.totalMs} ms`);
})();
