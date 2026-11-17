/**
 * Asset-Pipeline (STYLE TEST): ROCK prop-layer sprites — RECOLOUR PASS.
 *
 * Rudi rejected the current rock colour: the COOL / slate-BLUE grey
 * (avg hsl ~213-214deg, B>G>R) clashes with the warm-orange desert ground
 * (rocky_desert_0 ~ rgb 77,49,26 / hsl 27deg). This is a pure POST colour-grade
 * on the existing PNGs (NO regeneration): shape + alpha are preserved EXACTLY.
 *
 * Goal: NEUTRAL / slightly WARM grey — remove the cool/blue slate tint, add a
 * faint warm/tan undertone — so the rocks read as natural weathered stone that
 * sits well on BOTH warm desert AND neutral-warm mountain ground. Still matte,
 * desaturated and DARK (dark redesign) — not bright, not orange.
 *
 * Transform (per OPAQUE pixel, alpha untouched):
 *   1. De-cool / warm  : per-channel gain  R*1.15  G*1.00  B*0.84
 *                        -> inverts the B>G>R (cool) ordering into R>G>B (warm),
 *                           pushing hue from slate-blue (~213deg) into a warm
 *                           neutral-grey / faint-tan family (~30-34deg).
 *   2. Keep dark/matte : multiply RGB * 0.95  -> stays grounded, no brightening.
 *   3. Warm undertone  : blend 6% toward warm-grey rgb(112,100,86)
 *                        -> locks a uniform faint tan undertone across all 6,
 *                           independent of each sprite's source variance.
 * Net result (measured): hsl ~30-34deg, saturation ~9-11%, lightness ~28-38%.
 * Same hue family as both grounds (27-31deg) but far greyer (sat 9-11% vs ground
 * 16-49%) -> harmonises, never reads orange.
 *
 * Source of truth = a one-time backup of the ORIGINAL cool-grey PNGs, so
 * re-running never double-applies the grade. Falls back to live PNGs if no backup.
 *
 * Output (overwrites in place):
 *   assets/style-test/props/rock_1.png .. rock_6.png
 *   assets/style-test/props/rock_preview.png            (scatter on rocky_desert_0 — WARM)
 *   assets/style-test/props/rock_preview_mountain.png   (scatter on mountain_0 — GREY)
 *
 * Usage:
 *   node scripts/rock-props-recolour.cjs            # recolour all 6 + both previews
 *   node scripts/rock-props-recolour.cjs preview    # rebuild both previews only
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const DIR_OUT = path.join(ROOT, 'assets', 'style-test', 'props');
const DIR_BK = process.env.ROCK_ORIG_DIR ||
  path.join('C:', 'Users', 'SPEEDY~1', 'AppData', 'Local', 'Temp', 'claude',
    'F--Trade-Empire-Frontend', 'a14002f2-4aa4-433f-89e7-c1e02ae6d707',
    'scratchpad', 'rock_orig');

const DESERT_TILE = path.join(ROOT, 'src', 'assets', 'tiles', 'rocky_desert', 'rocky_desert_0.webp');
const MOUNTAIN_TILE = path.join(ROOT, 'src', 'assets', 'tiles', 'mountain', 'mountain_0.webp');

const IDS = ['rock_1', 'rock_2', 'rock_3', 'rock_4', 'rock_5', 'rock_6'];
// size class per sprite (from rock-props-style-test.cjs) — drives preview scaling
const SIZE = { rock_1: 'large', rock_2: 'large', rock_3: 'medium', rock_4: 'medium', rock_5: 'small', rock_6: 'medium' };

// ── GRADE PARAMS ────────────────────────────────────────────────────────────
const BASE = {
  gR: 1.15, gG: 1.00, gB: 0.84,     // de-cool + warm (invert B>G>R -> R>G>B)
  darken: 0.95,                     // stay dark / matte, no brightening
  warm: [112, 100, 86], warmMix: 0.06, // faint uniform warm-grey undertone
};
const PER_SPRITE = {
  // global grade verified consistent across all 6; nudge here if one over/undershoots
};

function clamp8(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }

// one-time backup of the pristine originals (source of truth for re-runs)
function ensureBackup() {
  if (!fs.existsSync(DIR_BK)) fs.mkdirSync(DIR_BK, { recursive: true });
  for (const id of IDS) {
    const bk = path.join(DIR_BK, `${id}.png`);
    const live = path.join(DIR_OUT, `${id}.png`);
    if (!fs.existsSync(bk) && fs.existsSync(live)) {
      fs.copyFileSync(live, bk);
      console.log(`  [backup] ${id}.png -> rock_orig/`);
    }
  }
}

async function recolourOne(id) {
  const src = fs.existsSync(path.join(DIR_BK, `${id}.png`))
    ? path.join(DIR_BK, `${id}.png`)
    : path.join(DIR_OUT, `${id}.png`);
  const p = { ...BASE, ...(PER_SPRITE[id] || {}) };
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels; // 4
  const wm = p.warmMix, wk = 1 - wm;
  for (let i = 0; i < data.length; i += C) {
    if (data[i + 3] === 0) continue; // fully transparent -> alpha preserved exactly
    let R = data[i] * p.gR, G = data[i + 1] * p.gG, B = data[i + 2] * p.gB;
    R *= p.darken; G *= p.darken; B *= p.darken;
    R = R * wk + p.warm[0] * wm;
    G = G * wk + p.warm[1] * wm;
    B = B * wk + p.warm[2] * wm;
    data[i] = clamp8(R); data[i + 1] = clamp8(G); data[i + 2] = clamp8(B);
    // data[i+3] (alpha) untouched
  }
  const out = await sharp(Buffer.from(data), { raw: { width: W, height: H, channels: C } }).png().toBuffer();
  fs.writeFileSync(path.join(DIR_OUT, `${id}.png`), out);
  const m = await sharp(out).metadata();
  console.log(`  [recolour] ${id}.png (${m.width}x${m.height}, alpha=${m.hasAlpha})`);
}

// ── SCATTER PREVIEW (ported from rock-props-style-test.cjs) ───────────────────
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const SIZE_PX = { large: [95, 135], medium: [65, 100], small: [34, 55] };

async function buildPreviewOn(tilePath, outName, bg) {
  const ids = IDS.filter((id) => fs.existsSync(path.join(DIR_OUT, `${id}.png`)));
  if (!ids.length) { console.log('  [preview] no sprites, skipping'); return; }

  const tileW = 512, tileH = 256, cx = 256, groundY = 128;
  const topPad = 220, sidePad = 60, botPad = 40;
  const canvasW = tileW + sidePad * 2, canvasH = topPad + tileH + botPad;
  const tileLeft = sidePad, tileTop = topPad;
  const tile = await sharp(tilePath).png().toBuffer();

  const rocks = {};
  for (const id of ids) {
    const b = fs.readFileSync(path.join(DIR_OUT, `${id}.png`));
    const m = await sharp(b).metadata();
    rocks[id] = { buf: b, w: m.width, h: m.height, size: SIZE[id] };
  }

  const rnd = mulberry32(70217); // same seed as style-test -> identical layout for A/B
  const N = 6;
  const placements = [];
  for (let i = 0; i < N; i++) {
    const u = 0.12 + rnd() * 0.76, v = 0.12 + rnd() * 0.76;
    const sx = cx + (u - v) * (tileW / 2);
    const sy = groundY + (u + v - 1) * (tileH / 2);
    const id = ids[Math.floor(rnd() * ids.length)];
    const [lo, hi] = SIZE_PX[rocks[id].size] || SIZE_PX.medium;
    const th = lo + rnd() * (hi - lo);
    placements.push({ id, sx, sy, th });
  }
  placements.sort((a, b) => a.sy - b.sy); // back-to-front

  const layers = [{ input: tile, left: tileLeft, top: tileTop }];
  for (const p of placements) {
    const t = rocks[p.id];
    const scale = p.th / t.h;
    const w = Math.max(1, Math.round(t.w * scale)), h = Math.max(1, Math.round(t.h * scale));
    const resized = await sharp(t.buf).resize(w, h).png().toBuffer();
    layers.push({ input: resized, left: Math.round(tileLeft + p.sx - w / 2), top: Math.round(tileTop + p.sy - h) });
  }

  const preview = await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: bg } })
    .composite(layers).png().toBuffer();
  fs.writeFileSync(path.join(DIR_OUT, outName), preview);
  console.log(`  [preview] ${outName} (${canvasW}x${canvasH}, ${N} rocks)`);
}

(async () => {
  const arg = (process.argv[2] || '').toLowerCase();
  if (arg !== 'preview') {
    ensureBackup();
    console.log(`[recolour] source: ${fs.existsSync(DIR_BK) ? 'ORIGINAL backup' : 'live PNGs'}`);
    for (const id of IDS) if (fs.existsSync(path.join(DIR_BK, `${id}.png`)) || fs.existsSync(path.join(DIR_OUT, `${id}.png`))) await recolourOne(id);
  }
  await buildPreviewOn(DESERT_TILE, 'rock_preview.png', { r: 24, g: 26, b: 28, alpha: 1 });
  await buildPreviewOn(MOUNTAIN_TILE, 'rock_preview_mountain.png', { r: 20, g: 20, b: 22, alpha: 1 });
  console.log('done');
})();
