/**
 * STRUCTURE OVERVIEW — PORT VERIFICATION (local only, no network).
 *
 * Renders the SHIPPED implementation (src/views/grid/overview/*.ts, loaded
 * through jiti so the very same TypeScript the app bundles is executed) and
 * puts the result next to the validated PoC reference `R1_final_z-3`.
 *
 * There is no Canvas2D in plain Node, so the drawing code is fed a RECORDING
 * context that re-emits every operation as SVG and hands it to sharp. The
 * translation is faithful where it matters:
 *
 *   ctx.fill('nonzero'|'evenodd')      -> <path fill-rule=...>
 *   ctx.stroke()                       -> <path fill="none" stroke=...>
 *   ctx.drawImage(scratch, 0,0,w,h)    -> <g opacity="globalAlpha">…</g>
 *
 * — that last line is exactly the P3 equivalence the implementation is built
 * on (`<g opacity>` in the PoC == draw opaque into a scratch layer, blit once
 * at 85 %), so if the port were wrong about it, this render would show it.
 *
 * WHAT IS COMPARED — AND WHAT DELIBERATELY IS NOT
 * The claim this script has to keep proving is: GEOMETRY, COLOURS and the
 * per-deck OPACITY of the drawing are still the validated ones. The GROUND is
 * NOT part of that claim any more. The tile's ground may be painted by the
 * draw code, or left transparent and put behind the canvas in CSS at some
 * opacity — that is a presentation decision taken in the header, and the
 * reference PNGs (which are opaque `OVERVIEW_GROUND`) can say nothing about
 * it. So THIS SCRIPT supplies the ground: `renderTile` lays an opaque
 * `OVERVIEW_GROUND` rect down first and the drawing goes on top of it, the way
 * a CSS background sits behind the canvas. If the draw code still fills a
 * ground of its own it merely covers that rect with the identical colour, so
 * the render — and every number below — is the same either way, and stays
 * bit-exact rather than picking up the rounding a post-hoc flatten costs.
 * Whether the draw code still paints a ground itself is reported separately,
 * as `paintsGround` (see probeGround) — reported, not asserted.
 *
 * NOTHING in src/ is touched. Output: assets/style-test/structure-overview-impl/
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { createJiti } = require('jiti');

const jiti = createJiti(__filename);
const OUTLINE = jiti('../src/views/grid/overview/structureOutline.ts');
const DRAW = jiti('../src/views/grid/overview/drawOverview.ts');
const THEME = jiti('../src/views/grid/overview/overviewTheme.ts');

const SNAPSHOT =
  process.env.SNAPSHOT ||
  'C:/Users/SPEEDY~1/AppData/Local/Temp/claude/F--Trade-Empire-Frontend/c8323739-b1d3-47a6-81a5-4789cbef0bd7/scratchpad/snapshot.json';
const OUT = path.resolve(__dirname, '../assets/style-test/structure-overview-impl');
const REF_DIR = path.resolve(__dirname, '../assets/style-test/structure-overview-r4');
const CURRENT_Z = -3; // the deck the reference render highlights
const MINI_W = 200;
const MINI_H = 150;

// ── recording 2D context → SVG ────────────────────────────────────────────
const f2 = n => (Math.round(n * 100) / 100).toString();

class RecCtx {
  constructor(w, h) {
    this.canvas = { width: w, height: h, __ctx: this };
    this.ops = [];
    this.sub = [];
    this.cur = null;
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.lineJoin = 'miter';
    this.lineCap = 'butt';
    this.globalAlpha = 1;
    this.w = w;
    this.h = h;
  }
  beginPath() {
    this.sub = [];
    this.cur = null;
  }
  moveTo(x, y) {
    this.cur = { pts: [[x, y]], closed: false };
    this.sub.push(this.cur);
  }
  lineTo(x, y) {
    if (!this.cur) this.moveTo(x, y);
    else this.cur.pts.push([x, y]);
  }
  closePath() {
    if (this.cur) this.cur.closed = true;
  }
  arc(cx, cy, r) {
    this.cur = { circle: [cx, cy, r] };
    this.sub.push(this.cur);
  }
  _d() {
    const d = [];
    for (const s of this.sub) {
      if (s.circle) continue;
      d.push(
        'M' + s.pts.map(p => f2(p[0]) + ' ' + f2(p[1])).join('L') + (s.closed ? 'Z' : ''),
      );
    }
    return d.join('');
  }
  _circles() {
    return this.sub.filter(s => s.circle);
  }
  fill(rule) {
    const d = this._d();
    if (d)
      this.ops.push(
        `<path d="${d}" fill="${this.fillStyle}" fill-rule="${rule || 'nonzero'}" ` +
          `fill-opacity="${f2(this.globalAlpha)}" stroke="none"/>`,
      );
    for (const c of this._circles())
      this.ops.push(
        `<circle cx="${f2(c.circle[0])}" cy="${f2(c.circle[1])}" r="${f2(c.circle[2])}" ` +
          `fill="${this.fillStyle}" fill-opacity="${f2(this.globalAlpha)}"/>`,
      );
  }
  stroke() {
    const common =
      `fill="none" stroke="${this.strokeStyle}" stroke-width="${f2(this.lineWidth)}" ` +
      `stroke-opacity="${f2(this.globalAlpha)}" stroke-linejoin="${this.lineJoin}" ` +
      `stroke-linecap="${this.lineCap}"`;
    const d = this._d();
    if (d) this.ops.push(`<path d="${d}" ${common}/>`);
    for (const c of this._circles())
      this.ops.push(
        `<circle cx="${f2(c.circle[0])}" cy="${f2(c.circle[1])}" r="${f2(c.circle[2])}" ${common}/>`,
      );
  }
  fillRect(x, y, w, h) {
    this.ops.push(
      `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" ` +
        `fill="${this.fillStyle}" fill-opacity="${f2(this.globalAlpha)}"/>`,
    );
  }
  clearRect() {
    this.ops = [];
  }
  /** The scratch blit: the recorded layer becomes ONE group at globalAlpha. */
  drawImage(src) {
    const inner = src.__ctx.ops.join('');
    if (!inner) return;
    this.ops.push(
      this.globalAlpha >= 0.999
        ? inner
        : `<g opacity="${f2(this.globalAlpha)}">${inner}</g>`,
    );
  }
  /** `bg` is laid down FIRST, as the header's ground lies behind the canvas. */
  svg(bg) {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" ` +
      `viewBox="0 0 ${this.w} ${this.h}">` +
      (bg ? `<rect x="0" y="0" width="${this.w}" height="${this.h}" fill="${bg}"/>` : '') +
      `${this.ops.join('')}</svg>`
    );
  }
}

// ── render one tile through the shipped code ──────────────────────────────
async function renderTile(geom, w, h, marker) {
  const ctx = new RecCtx(w, h);
  const scratch = new RecCtx(w, h);
  const t0 = process.hrtime.bigint();
  const res = DRAW.drawOverview(ctx, scratch, {
    geometry: geom,
    currentZ: CURRENT_Z,
    width: w,
    height: h,
  });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (marker && res) DRAW.drawLocationMarker(ctx, marker, res.fit);
  // The ground is laid down by THIS script, not asserted from the draw code
  // (header note). If the draw code still paints one it simply covers this
  // rect with an identical opaque fill, so the render is the same either way —
  // and it stays bit-exact against the reference, because the rasteriser does
  // the compositing instead of a lossy flatten after the fact.
  const buf = await sharp(Buffer.from(ctx.svg(THEME.OVERVIEW_GROUND))).png().toBuffer();
  return { buf, segments: res ? res.segments : 0, fit: res && res.fit, ms };
}

// ── JS-side cost of the draw pass ─────────────────────────────────────────
// A context whose operations are all no-ops: measures everything drawOverview
// does OUTSIDE the rasteriser (projection, Douglas-Peucker, quad winding, path
// walking). The real per-tile cost on the device is this plus the WebView's
// own fill/stroke work, which no Node harness can stand in for.
function nullCtx() {
  const noop = () => {};
  const c = {
    canvas: null,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineJoin: '',
    lineCap: '',
    globalAlpha: 1,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    fillRect: noop,
    clearRect: noop,
    drawImage: noop,
  };
  c.canvas = { width: 0, height: 0 };
  return c;
}

function measureDrawJs(geom, w, h, runs) {
  const a = nullCtx();
  const b = nullCtx();
  const opts = { geometry: geom, currentZ: CURRENT_Z, width: w, height: h };
  for (let i = 0; i < 3; i++) DRAW.drawOverview(a, b, opts); // warm up
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < runs; i++) DRAW.drawOverview(a, b, opts);
  return Number(process.hrtime.bigint() - t0) / 1e6 / runs;
}

// ── ground probe ──────────────────────────────────────────────────────────
// Does the DRAW CODE still fill the tile's ground? Render the same tile over a
// sentinel colour and read the four corners — OVERVIEW_PADDING keeps the fitted
// drawing well clear of them, so a corner is ground or it is nothing.
// Reported for the record; the pixel compare above is independent of it.
const SENTINEL = '#ff00ff';

async function probeGround(geom, w, h) {
  const ctx = new RecCtx(w, h);
  const scratch = new RecCtx(w, h);
  DRAW.drawOverview(ctx, scratch, { geometry: geom, currentZ: CURRENT_Z, width: w, height: h });
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect x="0" y="0" width="${w}" height="${h}" fill="${SENTINEL}"/>${ctx.ops.join('')}</svg>`;
  const { data, info } = await sharp(Buffer.from(svg))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = (x, y) => {
    const o = (y * info.width + x) * 3;
    return '#' + [data[o], data[o + 1], data[o + 2]].map(v => v.toString(16).padStart(2, '0')).join('');
  };
  const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
  const uniform = corners.every(c => c === corners[0]);
  return {
    corners,
    paintsGround: uniform ? corners[0] !== SENTINEL : null,
    groundColor: uniform && corners[0] !== SENTINEL ? corners[0] : null,
  };
}

// ── pixel comparison ──────────────────────────────────────────────────────
// Both sides are opaque here: `renderTile` puts OVERVIEW_GROUND behind the
// drawing itself, so this compares the DRAWING on the reference ground — see
// the header note on what is and is not asserted.
async function compare(bufA, fileB) {
  const A = await sharp(bufA).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(fileB).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (A.info.width !== B.info.width || A.info.height !== B.info.height)
    return { error: `size ${A.info.width}x${A.info.height} vs ${B.info.width}x${B.info.height}` };
  const n = A.info.width * A.info.height;
  let sum = 0;
  let peak = 0;
  let over8 = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const d =
      (Math.abs(A.data[o] - B.data[o]) +
        Math.abs(A.data[o + 1] - B.data[o + 1]) +
        Math.abs(A.data[o + 2] - B.data[o + 2])) /
      3;
    sum += d;
    if (d > peak) peak = d;
    if (d > 8) over8++;
  }
  return { meanDiff: sum / n, peakDiff: peak, pctOver8: (over8 / n) * 100 };
}

// ── contact sheet ─────────────────────────────────────────────────────────
async function sheet(rows, file) {
  const gap = 14;
  const head = 46;
  const cellW = Math.max(...rows.map(r => r.w));
  const cellH = Math.max(...rows.map(r => r.h));
  const W = 2 * cellW + 3 * gap;
  const H = head + rows.length * (cellH + 62) + gap;
  const comps = [];
  const lab = [
    `<text x="${gap}" y="24" fill="#e8f4ff" font-family="monospace" font-size="15" font-weight="bold">` +
      `Structure overview — PoC reference (left) vs. shipped port (right)</text>`,
    `<text x="${gap}" y="40" fill="#7d8ea3" font-family="monospace" font-size="11">` +
      `R1_final_z-3 · deck z=-3 · from src/views/grid/overview/*.ts · ` +
      `ground supplied by the harness (${THEME.OVERVIEW_GROUND}) — this asserts geometry/colours/opacity only</text>`,
  ];
  rows.forEach((r, i) => {
    const y = head + i * (cellH + 62);
    comps.push({ input: r.refFile, left: gap, top: y });
    comps.push({ input: r.implFile, left: gap * 2 + cellW, top: y });
    lab.push(
      `<rect x="${gap}" y="${y}" width="${r.w}" height="${r.h}" fill="none" stroke="#243044"/>`,
      `<rect x="${gap * 2 + cellW}" y="${y}" width="${r.w}" height="${r.h}" fill="none" stroke="#243044"/>`,
      `<text x="${gap}" y="${y + cellH + 16}" fill="#8fd3ff" font-family="monospace" font-size="11">` +
        `PoC ${r.w}x${r.h}</text>`,
      `<text x="${gap * 2 + cellW}" y="${y + cellH + 16}" fill="#8fd3ff" font-family="monospace" font-size="11">` +
        `PORT ${r.w}x${r.h}  seg ${r.segments}</text>`,
      `<text x="${gap * 2 + cellW}" y="${y + cellH + 30}" fill="#ffb703" font-family="monospace" font-size="10">` +
        `mean diff ${r.cmp.meanDiff.toFixed(2)}/255   peak ${r.cmp.peakDiff.toFixed(0)}   ` +
        `pixels &gt;8: ${r.cmp.pctOver8.toFixed(2)} %</text>`,
      `<text x="${gap * 2 + cellW}" y="${y + cellH + 44}" fill="#7d8ea3" font-family="monospace" font-size="10">` +
        `draw ${r.ms.toFixed(1)} ms (recording ctx, not a real canvas)</text>`,
    );
  });
  const ov = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${lab.join('')}</svg>`,
  );
  await sharp({ create: { width: W, height: H, channels: 4, background: '#070a11' } })
    .composite([...comps, { input: ov, left: 0, top: 0 }])
    .png()
    .toFile(file);
}

// ── run ───────────────────────────────────────────────────────────────────
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));

  const tTrace = process.hrtime.bigint();
  const geom = OUTLINE.buildOutlineGeometry(snap.hulls, []);
  const traceMs = Number(process.hrtime.bigint() - tTrace) / 1e6;

  const sizes = [
    { id: 'full', w: 411, h: 279, ref: 'R1_final_z-3__full.png' },
    { id: 'mini', w: 200, h: 150, ref: 'R1_final_z-3__mini.png' },
  ];

  const rows = [];
  for (const sz of sizes) {
    const bare = await renderTile(geom, sz.w, sz.h, null);
    const implFile = path.join(OUT, `port_R1_final_z-3__${sz.id}.png`);
    fs.writeFileSync(implFile, bare.buf);
    const refFile = path.join(REF_DIR, sz.ref);
    const cmp = await compare(bare.buf, refFile);

    // the same tile WITH the location marker — the one element the reference
    // has no counterpart for (it is new in this implementation).
    const marked = await renderTile(geom, sz.w, sz.h, {
      wx: -14.5,
      wy: -30.5,
      z: CURRENT_Z,
    });
    fs.writeFileSync(
      path.join(OUT, `port_with_marker__${sz.id}.png`),
      marked.buf,
    );

    rows.push({ ...sz, implFile, refFile, cmp, segments: bare.segments, ms: bare.ms });
    console.log(
      `${sz.id.padEnd(5)} ${sz.w}x${sz.h}  segments ${bare.segments}  ` +
        `pxPerTile ${(bare.fit.s * 48).toFixed(2)}  ` +
        `meanDiff ${cmp.meanDiff.toFixed(3)}  peak ${cmp.peakDiff.toFixed(0)}  ` +
        `>8: ${cmp.pctOver8.toFixed(2)} %  draw ${bare.ms.toFixed(1)} ms`,
    );
  }

  // Reported, never asserted: the ground is a presentation decision now.
  const ground = await probeGround(geom, sizes[0].w, sizes[0].h);
  console.log(
    `\nground painted by the draw code: ` +
      (ground.paintsGround === null
        ? `INDETERMINATE (corners differ: ${ground.corners.join(' ')})`
        : ground.paintsGround
          ? `yes, ${ground.groundColor} (opaque)`
          : `no — tile is transparent outside the drawing, ` +
            `the header supplies the ground`),
  );

  const jsMs = {
    full: measureDrawJs(geom, 411, 279, 20),
    mini: measureDrawJs(geom, MINI_W, MINI_H, 20),
  };
  console.log(
    `
draw pass, JS side only (no rasteriser): full ${jsMs.full.toFixed(2)} ms, ` +
      `mini ${jsMs.mini.toFixed(2)} ms  |  buildOutlineGeometry cold ${traceMs.toFixed(1)} ms`,
  );

  const sheetFile = path.join(OUT, 'SHEET_port_vs_reference.png');
  await sheet(rows, sheetFile);

  fs.writeFileSync(
    path.join(OUT, 'stats-impl.json'),
    JSON.stringify(
      {
        snapshot: { hulls: snap.hulls.length, structureId: snap.structureId },
        // What the pixel numbers below do and do not cover — see the header note.
        comparison: {
          asserts: 'geometry, colours, per-deck opacity of the drawing',
          excludes: 'the tile ground (presentation, set in the header)',
          groundSuppliedByHarness: THEME.OVERVIEW_GROUND,
        },
        ground,
        buildOutlineGeometryMs: +traceMs.toFixed(2),
        drawJsOnlyMs: { full: +jsMs.full.toFixed(2), mini: +jsMs.mini.toFixed(2) },
        levels: geom.levels.map(l => ({
          z: l.z,
          cells: l.cellCount,
          rings: l.rings.length,
          nodes: l.rings.reduce((a, r) => a + r.length, 0),
        })),
        accesses: geom.accesses.length,
        tiles: rows.map(r => ({
          size: r.id,
          w: r.w,
          h: r.h,
          segments: r.segments,
          meanDiff: +r.cmp.meanDiff.toFixed(3),
          peakDiff: +r.cmp.peakDiff.toFixed(1),
          pctOver8: +r.cmp.pctOver8.toFixed(3),
        })),
      },
      null,
      2,
    ),
  );
  console.log('\nsheet: ' + sheetFile);

  // The gate. The port is a pixel-exact reproduction of the reference drawing
  // and has to stay one — anything above 0 means geometry, a colour or an
  // opacity moved, which is precisely what this script exists to catch.
  const bad = rows.filter(r => r.cmp.error || r.cmp.peakDiff > 0);
  if (bad.length) {
    console.error(
      '\nFAILED — the drawing changed:\n' +
        bad
          .map(
            r =>
              `  ${r.id}: ` +
              (r.cmp.error ||
                `peak ${r.cmp.peakDiff.toFixed(0)}/255, mean ${r.cmp.meanDiff.toFixed(3)}, ` +
                  `${r.cmp.pctOver8.toFixed(2)} % of pixels off by >8`),
          )
          .join('\n'),
    );
    process.exitCode = 1;
    return;
  }
  console.log('PASSED — drawing pixel-identical to R1_final_z-3 at both sizes.');
})();
