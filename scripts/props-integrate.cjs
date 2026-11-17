/**
 * Parameterised prop INTEGRATION: assets/… PNGs -> src/assets/props/<family>/.
 *
 * Replaces the per-family copies (rock-props-integrate.cjs, shrub-props-integrate.cjs,
 * forest-integrate-prod.cjs, …) which were identical apart from their family
 * name and source folder — CLAUDE.md: "Abstraktion wenn 3+ Stellen denselben
 * Code hätten". The round-1 scripts stay in place untouched; new families use
 * this one.
 *
 *   node scripts/props-integrate.cjs <family> [srcPattern]
 *
 *   <family>      folder name AND file prefix under src/assets/props/.
 *                 CASE-SENSITIVE: spriteCache matches /props/([^/]+)/\1_(\d+)\.webp,
 *                 i.e. the folder name and the file prefix must be byte-identical
 *                 and must equal the key used in propThemes.ts.
 *   [srcPattern]  source path template, `{i}` = variant index.
 *                 Default: assets/final/<family>_{i}.png
 *                 Example: node scripts/props-integrate.cjs rock_ash \
 *                            "assets/final/rock_ash_{i}.png"
 *
 * Per variant it writes FOUR files:
 *   <family>_<i>.webp  <family>_<i>@half.webp  @quarter.webp  @eighth.webp
 *
 * ── THE MIPS ARE MANDATORY, NOT A NICE-TO-HAVE ──
 * getImageWithMip (spriteCache.ts) ALWAYS requests @eighth first on a cold
 * start. If that file is missing, loadMipVariant returns silently, the queued
 * full-res load in pendingTargetLoads is never resolved, and the prop is
 * invisible at EVERY zoom level — no error, no console output, no failed
 * request. A family that ships without mips looks exactly like a family that was
 * never wired into propThemes at all, which is a miserable thing to debug.
 * `--verify` re-checks the 4-file invariant for a family without rebuilding.
 *
 * Output convention (matches the shipped prop bestand):
 *   tight-cropped to the visible alpha bbox, NATIVE non-square aspect preserved,
 *   NO padding, RGBA webp q90.
 *
 * KEIN cap sync, KEIN build, KEIN git — das macht der verwaltende Agent.
 *
 * Usage:
 *   node scripts/props-integrate.cjs lava_rock
 *   node scripts/props-integrate.cjs lava_rock "assets/final/lava_rock_{i}.png"
 *   node scripts/props-integrate.cjs lava_rock --verify
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const OUT_ROOT = path.join(ROOT, 'src', 'assets', 'props');
const MAX_SCAN = 64; // upper bound on variants probed for a family

const MIPS = [
  { suffix: '@half', scale: 0.5 },
  { suffix: '@quarter', scale: 0.25 },
  { suffix: '@eighth', scale: 0.125 },
];
const WEBP = { quality: 90, effort: 4, smartSubsample: true };

async function tightCrop(srcPath) {
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  let minx = W,
    miny = H,
    maxx = -1,
    maxy = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] === 0) continue;
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
    }
  }
  if (maxx < 0) throw new Error(`${srcPath}: fully transparent`);
  const w = maxx - minx + 1;
  const h = maxy - miny + 1;
  const buf = await sharp(srcPath)
    .ensureAlpha()
    .extract({ left: minx, top: miny, width: w, height: h })
    .png()
    .toBuffer();
  return { buf, w, h, wasTight: minx === 0 && miny === 0 && maxx === W - 1 && maxy === H - 1 };
}

async function writeWebp(buf, outPath, expW, expH) {
  await sharp(buf).ensureAlpha().webp(WEBP).toFile(outPath);
  const m = await sharp(outPath).metadata();
  if (m.format !== 'webp' || !m.hasAlpha || m.width !== expW || m.height !== expH)
    throw new Error(`validation failed: ${outPath} -> ${m.width}x${m.height} alpha=${m.hasAlpha} ${m.format}`);
}

/** The 4-files-per-variant invariant. Run after every integration. */
function verify(family) {
  const dir = path.join(OUT_ROOT, family);
  if (!fs.existsSync(dir)) {
    console.log(`[verify] ${family}: FOLDER MISSING`);
    return false;
  }
  const files = new Set(fs.readdirSync(dir));
  const variants = [...files]
    .map((f) => f.match(new RegExp(`^${family}_(\\d+)\\.webp$`)))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
  if (!variants.length) {
    console.log(`[verify] ${family}: NO VARIANTS`);
    return false;
  }
  const missing = [];
  for (const i of variants)
    for (const mip of MIPS) if (!files.has(`${family}_${i}${mip.suffix}.webp`)) missing.push(`${family}_${i}${mip.suffix}.webp`);
  const contiguous = variants.every((v, k) => v === k);
  const ok = missing.length === 0 && contiguous;
  console.log(
    `[verify] ${family}: ${variants.length} variants x 4 files = ${variants.length * 4} expected, ` +
      `${variants.length * 4 - missing.length} present` +
      (contiguous ? '' : `  — INDICES NOT CONTIGUOUS (${variants.join(',')})`) +
      (missing.length ? `  — MISSING: ${missing.join(', ')}` : '  OK'),
  );
  return ok;
}

(async () => {
  const argv = process.argv.slice(2);
  const family = argv.find((a) => !a.startsWith('--'));
  if (!family) {
    console.error('usage: node scripts/props-integrate.cjs <family> [srcPattern] [--verify]');
    process.exit(1);
  }
  if (argv.includes('--verify')) {
    process.exit(verify(family) ? 0 : 1);
  }
  const patternArg = argv.filter((a) => !a.startsWith('--'))[1];
  const pattern = patternArg || path.join('assets', 'final', `${family}_{i}.png`);

  const outDir = path.join(OUT_ROOT, family);
  fs.mkdirSync(outDir, { recursive: true });

  let count = 0;
  for (let i = 0; i < MAX_SCAN; i++) {
    const src = path.resolve(ROOT, pattern.replace('{i}', String(i)));
    if (!fs.existsSync(src)) {
      if (i === 0) throw new Error(`no source for variant 0: ${src}`);
      break;
    }
    const { buf, w, h, wasTight } = await tightCrop(src);
    console.log(
      `${path.relative(ROOT, src)} -> ${family}_${i}  ${w}x${h} aspect ${(w / h).toFixed(2)}` +
        (wasTight ? '' : '  (source had a transparent border — cropped)'),
    );
    await writeWebp(buf, path.join(outDir, `${family}_${i}.webp`), w, h);
    for (const mip of MIPS) {
      const mw = Math.max(1, Math.round(w * mip.scale));
      const mh = Math.max(1, Math.round(h * mip.scale));
      const resized = await sharp(buf).resize(mw, mh, { fit: 'fill' }).ensureAlpha().png().toBuffer();
      await writeWebp(resized, path.join(outDir, `${family}_${i}${mip.suffix}.webp`), mw, mh);
    }
    count++;
  }

  console.log(`\ndone — ${count} ${family} variants + 3 mips each in ${path.relative(ROOT, outDir)}`);
  if (!verify(family)) process.exit(1);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
