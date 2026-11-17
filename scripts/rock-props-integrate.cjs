/**
 * ROCK prop-layer sprites — INTEGRATION into src/assets/props/rock/.
 *
 * Mirrors the swamp/palm/tree prop integration:
 *   key = folder name ('rock'), NATIVE non-square aspect preserved, RGBA alpha
 *   preserved, tight-cropped to the visible bounds, +@half/@quarter/@eighth webp
 *   mips (props ship webp only — no png mips, matching the existing prop bestand).
 *
 * Source (warm-neutral re-toned, Rudi-approved):
 *   assets/style-test/props/rock_1.png .. rock_6.png
 * Output:
 *   src/assets/props/rock/rock_0.webp .. rock_5.webp  (+ @half/@quarter/@eighth)
 *
 * Source rock_<1..6> maps to output rock_<0..5> (0-based variant scheme).
 * WebP: quality 90, alphaQuality 100 (same as the tile/prop bestand).
 *
 * KEIN cap sync, KEIN build, KEIN git (macht der Agent separat).
 *
 * Usage: node scripts/rock-props-integrate.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'assets', 'style-test', 'props');
const OUT_DIR = path.join(ROOT, 'src', 'assets', 'props', 'rock');

// source id (1-based) -> output variant (0-based)
const SLOTS = [1, 2, 3, 4, 5, 6].map((srcId, i) => ({ srcId, variant: i }));

const MIPS = [
  { suffix: '@half', div: 2 },
  { suffix: '@quarter', div: 4 },
  { suffix: '@eighth', div: 8 },
];

const WEBP = { quality: 90, alphaQuality: 100 };

// Tight crop to the visible (alpha > 0) bounding box, alpha preserved exactly.
async function tightCrop(srcPath) {
  const { data, info } = await sharp(srcPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  let minx = W,
    miny = H,
    maxx = -1,
    maxy = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * C + 3] > 0) {
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
    }
  }
  if (maxx < 0) throw new Error(`${srcPath}: fully transparent`);
  const cw = maxx - minx + 1;
  const ch = maxy - miny + 1;
  const cropped = await sharp(srcPath)
    .ensureAlpha()
    .extract({ left: minx, top: miny, width: cw, height: ch })
    .png()
    .toBuffer();
  return { buf: cropped, w: cw, h: ch };
}

async function writeWebp(buf, outPath) {
  fs.writeFileSync(
    outPath,
    await sharp(buf).ensureAlpha().webp(WEBP).toBuffer(),
  );
}

async function validate(outPath, expW, expH) {
  const m = await sharp(outPath).metadata();
  const ok =
    m.format === 'webp' &&
    m.hasAlpha === true &&
    m.width === expW &&
    m.height === expH;
  console.log(
    `  ${ok ? '[ok]' : '[FAIL]'} ${path.relative(ROOT, outPath)} ` +
      `${m.width}x${m.height} alpha=${m.hasAlpha} ${m.format}`,
  );
  if (!ok) throw new Error(`validation failed: ${outPath}`);
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const { srcId, variant } of SLOTS) {
    const srcPath = path.join(SRC_DIR, `rock_${srcId}.png`);
    if (!fs.existsSync(srcPath)) throw new Error('missing source: ' + srcPath);
    const { buf, w, h } = await tightCrop(srcPath);
    console.log(`rock_${srcId}.png -> rock_${variant} (tight ${w}x${h})`);

    // full res (native aspect)
    const full = path.join(OUT_DIR, `rock_${variant}.webp`);
    await writeWebp(buf, full);
    await validate(full, w, h);

    // mips
    for (const m of MIPS) {
      const mw = Math.max(1, Math.round(w / m.div));
      const mh = Math.max(1, Math.round(h / m.div));
      const resized = await sharp(buf)
        .resize(mw, mh, { fit: 'fill' })
        .ensureAlpha()
        .png()
        .toBuffer();
      const mipPath = path.join(OUT_DIR, `rock_${variant}${m.suffix}.webp`);
      await writeWebp(resized, mipPath);
      await validate(mipPath, mw, mh);
    }
  }
  console.log(`\ndone — 6 rock variants + 3 mips each in ${path.relative(ROOT, OUT_DIR)}`);
})().catch(e => {
  console.error('FAILED:', e);
  process.exit(1);
});
