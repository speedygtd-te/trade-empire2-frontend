/**
 * Asset-Pipeline (STYLE TEST v2): forest prop-layer TREE sprites — RECOLOUR PASS.
 *
 * Rudi rejected the v2 tree colour: too BLUE ("blaustichig") — the muted blue-green
 * foliage + blue-grey trunks clashed with the green-yellow / olive forest floor
 * (forest_0.webp ~ hsl 57deg, rgb 43,42,24). This is a pure POST colour-grade on the
 * existing PNGs (NO regeneration): shape + alpha + roots are preserved exactly.
 *
 * Transform (per opaque pixel, alpha untouched):
 *   1. De-blue / warm : per-channel gain  R*1.30  G*0.99  B*0.55
 *                       -> kills the blue cast, pushes hue from teal (~166-214deg)
 *                          into the yellow-green / olive family (~42-73deg).
 *   2. Gloom          : multiply RGB * 0.80  -> darker, gloomier.
 *   3. Grime          : blend 18% toward muddy dark-olive rgb(42,40,25)
 *                       -> desaturated, dirty look; unifies the set toward the floor.
 * Foliage stays green-dominant (higher hue ~58-73deg), trunks land warmer/browner
 * (~42-57deg) because they started bluer/neutral — the natural warm ordering is kept.
 *
 * Per-sprite tuning: PER_SPRITE lets us nudge any sprite that over/undershoots.
 *
 * Source of truth = the backup of the ORIGINAL v2 PNGs (so re-running never
 * double-applies the grade). Falls back to the live PNGs if no backup is present.
 *
 * Output (overwrites in place):
 *   assets/style-test/props/tree_v2_1.png .. tree_v2_8.png
 *   assets/style-test/props/tree_v2_forest_preview.png   (dense scatter on forest_0)
 *   assets/style-test/props/_v2_contact_sheet.png        (4x2 grid, checkerboard)
 *
 * Usage:
 *   node scripts/tree-props-v2-recolour.cjs            # recolour all 8 + both previews
 *   node scripts/tree-props-v2-recolour.cjs preview    # rebuild both previews only
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const DIR_OUT = path.join(ROOT, 'assets', 'style-test', 'props');
const DIR_BK = process.env.TREE_ORIG_DIR ||
  path.join('C:', 'Users', 'SPEEDY~1', 'AppData', 'Local', 'Temp', 'claude',
    'F--Trade-Empire-Frontend', 'a14002f2-4aa4-433f-89e7-c1e02ae6d707',
    'scratchpad', 'tree_v2_orig');
const FOREST_TILE = path.join(ROOT, 'src', 'assets', 'tiles', 'forest', 'forest_0.webp');

const IDS = ['tree_v2_1', 'tree_v2_2', 'tree_v2_3', 'tree_v2_4', 'tree_v2_5', 'tree_v2_6', 'tree_v2_7', 'tree_v2_8'];
const MEDIUM = new Set(['tree_v2_7', 'tree_v2_8']);

// ── GRADE PARAMS ────────────────────────────────────────────────────────────
const BASE = {
  gR: 1.30, gG: 0.99, gB: 0.55, // de-blue + warm
  darken: 0.80,                 // gloom
  grime: [42, 40, 25], grimeMix: 0.18, // muddy dark-olive dirt tint
};
// per-sprite overrides (partial). Left empty by default — the global grade was
// verified consistent across all 8. Nudge here if a sprite over/undershoots.
const PER_SPRITE = {
  // e.g. tree_v2_6: { darken: 0.74 },  // birch reads a touch bright
};

function clamp8(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }

async function recolourOne(id) {
  const src = fs.existsSync(path.join(DIR_BK, `${id}.png`))
    ? path.join(DIR_BK, `${id}.png`)
    : path.join(DIR_OUT, `${id}.png`);
  const p = { ...BASE, ...(PER_SPRITE[id] || {}) };
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels; // 4
  const gm = p.grimeMix, gk = 1 - gm;
  for (let i = 0; i < data.length; i += C) {
    if (data[i + 3] === 0) continue; // fully transparent -> leave (alpha preserved)
    let R = data[i] * p.gR, G = data[i + 1] * p.gG, B = data[i + 2] * p.gB;
    R *= p.darken; G *= p.darken; B *= p.darken;
    R = R * gk + p.grime[0] * gm;
    G = G * gk + p.grime[1] * gm;
    B = B * gk + p.grime[2] * gm;
    data[i] = clamp8(R); data[i + 1] = clamp8(G); data[i + 2] = clamp8(B);
    // data[i+3] (alpha) untouched
  }
  const out = await sharp(Buffer.from(data), { raw: { width: W, height: H, channels: C } }).png().toBuffer();
  fs.writeFileSync(path.join(DIR_OUT, `${id}.png`), out);
  const m = await sharp(out).metadata();
  console.log(`  [recolour] ${id}.png (${m.width}x${m.height}, alpha=${m.hasAlpha})`);
}

// ── DENSE SCATTER PREVIEW (ported from tree-props-v2-style-test.cjs) ──────────
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

async function buildPreview() {
  const ids = IDS.filter((id) => fs.existsSync(path.join(DIR_OUT, `${id}.png`)));
  if (!ids.length) { console.log('  [preview] no sprites, skipping'); return; }
  const tileW = 512, tileH = 256, cx = 256, groundY = 128;
  const topPad = 300, sidePad = 60, botPad = 40;
  const canvasW = tileW + sidePad * 2, canvasH = topPad + tileH + botPad;
  const tileLeft = sidePad, tileTop = topPad;
  const tile = await sharp(FOREST_TILE).png().toBuffer();

  const trees = {};
  for (const id of ids) {
    const b = fs.readFileSync(path.join(DIR_OUT, `${id}.png`));
    const m = await sharp(b).metadata();
    trees[id] = { buf: b, w: m.width, h: m.height };
  }
  const smallIds = ids.filter((id) => !MEDIUM.has(id));
  const medIds = ids.filter((id) => MEDIUM.has(id));

  const rnd = mulberry32(90210);
  const N = 14;
  const placements = [];
  for (let i = 0; i < N; i++) {
    const u = 0.06 + rnd() * 0.88, v = 0.06 + rnd() * 0.88;
    const sx = cx + (u - v) * (tileW / 2);
    const sy = groundY + (u + v - 1) * (tileH / 2);
    const useMed = medIds.length && rnd() < 0.16;
    const pool = useMed ? medIds : smallIds;
    const id = pool[Math.floor(rnd() * pool.length)];
    const th = useMed ? 120 + rnd() * 45 : 55 + rnd() * 48;
    placements.push({ id, sx, sy, th });
  }
  placements.sort((a, b) => a.sy - b.sy);

  const layers = [{ input: tile, left: tileLeft, top: tileTop }];
  for (const p of placements) {
    const t = trees[p.id];
    const scale = p.th / t.h;
    const w = Math.max(1, Math.round(t.w * scale)), h = Math.max(1, Math.round(t.h * scale));
    const resized = await sharp(t.buf).resize(w, h).png().toBuffer();
    layers.push({ input: resized, left: Math.round(tileLeft + p.sx - w / 2), top: Math.round(tileTop + p.sy - h) });
  }
  const preview = await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: { r: 24, g: 26, b: 24, alpha: 1 } } })
    .composite(layers).png().toBuffer();
  fs.writeFileSync(path.join(DIR_OUT, 'tree_v2_forest_preview.png'), preview);
  console.log(`  [preview] tree_v2_forest_preview.png (${canvasW}x${canvasH}, ${N} trees)`);
}

// ── CONTACT SHEET (4x2, checkerboard bg, black header w/ label) ───────────────
function checkerboard(W, H, sq = 16) {
  const buf = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const on = ((x / sq | 0) + (y / sq | 0)) % 2 === 0;
    const v = on ? 204 : 153; const i = (y * W + x) * 4;
    buf[i] = v; buf[i + 1] = v; buf[i + 2] = v; buf[i + 3] = 255;
  }
  return sharp(buf, { raw: { width: W, height: H, channels: 4 } });
}

async function buildContactSheet() {
  const ids = IDS.filter((id) => fs.existsSync(path.join(DIR_OUT, `${id}.png`)));
  if (!ids.length) return;
  const cols = 4, rows = 2, cellW = 262, cellH = 353, hdr = 20;
  const W = cols * cellW, H = rows * cellH;
  const base = checkerboard(W, H);
  const layers = [];
  for (let idx = 0; idx < ids.length; idx++) {
    const id = ids[idx];
    const col = idx % cols, row = (idx / cols) | 0;
    const cellL = col * cellW, cellT = row * cellH;
    const b = fs.readFileSync(path.join(DIR_OUT, `${id}.png`));
    const m = await sharp(b).metadata();
    // fit tree into cell (below header) preserving aspect
    const availW = cellW - 24, availH = cellH - hdr - 16;
    const scale = Math.min(availW / m.width, availH / m.height, 1);
    const w = Math.round(m.width * scale), h = Math.round(m.height * scale);
    const resized = await sharp(b).resize(w, h).png().toBuffer();
    layers.push({ input: resized, left: cellL + ((cellW - w) >> 1), top: cellT + hdr + (cellH - hdr - h) - 8 });
    // header bar + label
    const label = `${id} ${m.width}x${m.height}`;
    const svg = `<svg width="${cellW}" height="${hdr}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="0" width="${cellW}" height="${hdr}" fill="rgba(0,0,0,0.82)"/>` +
      `<text x="6" y="14" font-family="monospace" font-size="12" fill="#cfcfc0">${label}</text></svg>`;
    layers.push({ input: Buffer.from(svg), left: cellL, top: cellT });
  }
  const sheet = await base.composite(layers).png().toBuffer();
  fs.writeFileSync(path.join(DIR_OUT, '_v2_contact_sheet.png'), sheet);
  console.log(`  [contact] _v2_contact_sheet.png (${W}x${H})`);
}

(async () => {
  const arg = (process.argv[2] || '').toLowerCase();
  if (arg !== 'preview') {
    console.log(`[recolour] source: ${fs.existsSync(DIR_BK) ? 'ORIGINAL backup' : 'live PNGs'}`);
    for (const id of IDS) if (fs.existsSync(path.join(DIR_BK, `${id}.png`)) || fs.existsSync(path.join(DIR_OUT, `${id}.png`))) await recolourOne(id);
  }
  await buildPreview();
  await buildContactSheet();
  console.log('done');
})();
