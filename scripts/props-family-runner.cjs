/**
 * Generic per-variant runner + CLI for a prop family.
 *
 * A family script (props-<family>-generate.cjs) declares WHAT to make — prompts,
 * seeds, canvases, tone targets, validation bands — and calls `run(config)`.
 * Everything mechanical (order of the six pipeline steps, --reuse-raw, index
 * selection, seed override, validate/sheet/integrate subcommands, the summary
 * table) lives here so it is written and debugged once.
 *
 * Two source modes:
 *   mode 'gen'    — flux-pro/v1.1 text→image from `shapes[i].form` + `anchor`
 *   mode 'derive' — flux-pro/kontext image→image from `baseRaw(i)`, with a
 *                   MANDATORY silhouette-IoU floor against `iouRef` so a derive
 *                   that re-sculpts the subject fails instead of shipping
 *
 * CONFIG
 *   family        folder + file prefix, CASE-SENSITIVE identical to the propThemes key
 *   n             variant count
 *   mode          'gen' | 'derive'
 *   anchor        shared style sentence appended after each shape's `form` (gen)
 *   shapes[]      { seed, gen:{w,h}, form, promptExtra? }            (gen)
 *   derivePrompt  kontext edit instruction                            (derive)
 *   deriveSeeds[] one seed per variant                                (derive)
 *   baseRaw(i)    absolute path of the source raw png                 (derive)
 *   iouRef(i)     absolute path of the reference sprite for the IoU   (derive)
 *   iouMin        IoU floor (derive)
 *   maskFn        overlay classifier (glowWeight / sulfurWeight), or null
 *   tone          see props-pipeline-lib.toneNormalise
 *   speckMinFrac  connected-component cutoff for the alpha cleanup
 *   check         { aspectMin, aspectMax, baseLumTol, overlayMinPct,
 *                   overlayMaxPct, overlayLumMin, overlayLumMax, fillMin }
 *   sheet         { biome, heightFactor, abRef?, abLabel? }
 *
 * Usage (identical for every family script):
 *   node scripts/props-<family>-generate.cjs gen
 *   node scripts/props-<family>-generate.cjs gen 2 4
 *   node scripts/props-<family>-generate.cjs gen 2 --seed 990112
 *   node scripts/props-<family>-generate.cjs gen --reuse-raw     steps 2..6 only
 *   node scripts/props-<family>-generate.cjs validate
 *   node scripts/props-<family>-generate.cjs sheet
 *   node scripts/props-<family>-generate.cjs integrate
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const L = require('./props-pipeline-lib.cjs');

async function validateOne(cfg, i) {
  const name = `${cfg.family}_${i}`;
  const p = path.join(L.DIR_FINAL, `${name}.png`);
  if (!fs.existsSync(p)) return { name, ok: false, problems: ['missing'], m: null, iou: null };
  const m = await L.measure(p, name);
  const c = cfg.check;
  const problems = [];

  if (Math.max(m.w, m.h) !== L.TARGET_MAX) problems.push(`max side ${Math.max(m.w, m.h)} != ${L.TARGET_MAX}`);
  if (m.aspect < c.aspectMin || m.aspect > c.aspectMax)
    problems.push(`aspect ${m.aspect.toFixed(2)} outside ${c.aspectMin}..${c.aspectMax}`);
  if (!m.tight) problems.push('not tight-cropped (transparent border)');
  if (c.fillMin != null && m.fill < c.fillMin)
    problems.push(`fill ${(100 * m.fill).toFixed(1)}% < ${(100 * c.fillMin).toFixed(0)}% — mostly empty box`);
  if (Math.abs(m.baseLum - cfg.tone.targetLum) > c.baseLumTol)
    problems.push(`base lum ${m.baseLum.toFixed(1)} off family target ${cfg.tone.targetLum}`);
  if (c.baseRBMin != null && m.baseRB < c.baseRBMin)
    problems.push(`base R/B ${m.baseRB.toFixed(3)} < ${c.baseRBMin} — wrong colour family`);
  if (c.baseRBMax != null && m.baseRB > c.baseRBMax)
    problems.push(`base R/B ${m.baseRB.toFixed(3)} > ${c.baseRBMax} — wrong colour family`);
  if (cfg.maskFn) {
    if (c.overlayMinPct != null && m.overlayPct < c.overlayMinPct)
      problems.push(`overlay ${m.overlayPct.toFixed(1)}% < ${c.overlayMinPct}% — does not read at 28 px`);
    if (c.overlayMaxPct != null && m.overlayPct > c.overlayMaxPct)
      problems.push(`overlay ${m.overlayPct.toFixed(1)}% > ${c.overlayMaxPct}% — swamps the silhouette`);
    if (c.overlayLumMin != null && m.overlayPct > 0 && m.overlayLum < c.overlayLumMin)
      problems.push(`overlay lum ${m.overlayLum.toFixed(1)} < ${c.overlayLumMin} — off the glow budget`);
    if (c.overlayLumMax != null && m.overlayLum > c.overlayLumMax)
      problems.push(`overlay lum ${m.overlayLum.toFixed(1)} > ${c.overlayLumMax} — off the glow budget`);
  }

  let iou = null;
  if (cfg.mode === 'derive' && cfg.iouRef) {
    iou = await L.silhouetteIoU(p, cfg.iouRef(i));
    if (iou !== null && iou < cfg.iouMin)
      problems.push(`silhouette drift (IoU ${iou.toFixed(3)} < ${cfg.iouMin}) — kontext re-sculpted the subject`);
  }
  return { name, ok: problems.length === 0, problems, m, iou };
}

function fmt(v) {
  if (!v.m) return `${v.name.padEnd(22)} MISSING`;
  return (
    `${v.name.padEnd(22)} ${String(v.m.w).padStart(3)}x${String(v.m.h).padStart(3)} ` +
    `asp ${v.m.aspect.toFixed(2)} base ${v.m.baseLum.toFixed(1)} R/B ${v.m.baseRB.toFixed(2)} ` +
    `ovl ${v.m.overlayPct.toFixed(1)}%@lum${v.m.overlayLum.toFixed(0)}/val${v.m.overlayVal.toFixed(0)} ` +
    `${v.iou === null ? '' : `IoU ${v.iou.toFixed(3)} `}` +
    `${v.ok ? 'PASS' : 'FAIL: ' + v.problems.join('; ')}`
  );
}

async function runVariant(cfg, i, seedOverride, reuseRaw) {
  const name = `${cfg.family}_${i}`;
  const rawPath = path.join(L.DIR_RAW, `${name}_raw.png`);

  let raw;
  if (reuseRaw && fs.existsSync(rawPath)) {
    console.log(`\n[${name}] raw reused`);
    raw = fs.readFileSync(rawPath);
  } else if (cfg.mode === 'derive') {
    const seed = seedOverride ?? cfg.deriveSeeds[i];
    const base = cfg.baseRaw(i);
    if (!fs.existsSync(base)) throw new Error(`derive base missing: ${base}`);
    console.log(`\n[${name}] kontext derive from ${path.basename(base)}, seed ${seed}`);
    raw = await L.deriveKontext(fs.readFileSync(base), cfg.derivePrompt, seed);
    fs.writeFileSync(rawPath, raw);
  } else {
    const shape = cfg.shapes[i];
    const seed = seedOverride ?? shape.seed;
    const prompt = `${shape.form} ${cfg.anchor}${shape.promptExtra ? ` ${shape.promptExtra}` : ''}`;
    L.assertPromptFits(prompt, `${name} prompt`);
    console.log(`\n[${name}] seed ${seed}, canvas ${shape.gen.w}x${shape.gen.h}, prompt ${prompt.length} chars`);
    raw = await L.genFluxPro(prompt, shape.gen, seed);
    fs.writeFileSync(rawPath, raw);
  }

  // --reuse-raw also reuses the cut-out: iterating on the TONE step alone must
  // not re-bill a birefnet call per attempt.
  const nobgPath = path.join(L.DIR_NOBG, `${name}_nobg.png`);
  let nobg;
  if (reuseRaw && fs.existsSync(nobgPath)) {
    nobg = fs.readFileSync(nobgPath);
    console.log('    nobg: reused');
  } else {
    nobg = await L.cleanAlpha(await L.removeBackground(raw), cfg.speckMinFrac);
    fs.writeFileSync(nobgPath, nobg);
  }

  let pre = await L.tightCrop(nobg);
  // Optional per-family step between crop and tone. Used by paired derive
  // families to transfer their overlay onto the base sprite's own pixels and
  // alpha (see L.transferOverlay), which pins the silhouette by construction.
  if (cfg.postCrop) pre = await cfg.postCrop(pre, i);
  const mask = cfg.maskFn ? await L.writeMask(pre, name, cfg.maskFn) : null;
  const cropped = await L.toneNormalise(pre, name, mask, cfg.tone);
  fs.writeFileSync(path.join(L.DIR_CROP, `${name}_cropped.png`), cropped);

  const final = await L.scaleToConvention(cropped);
  fs.writeFileSync(path.join(L.DIR_FINAL, `${name}.png`), final);

  const v = await validateOne(cfg, i);
  console.log('    -> ' + fmt(v));
  return v;
}

async function sheets(cfg) {
  fs.mkdirSync(L.DIR_REVIEW, { recursive: true });
  const hf = cfg.sheet?.heightFactor ?? 1;
  await L.contactSheet(cfg.family, cfg.n);
  if (cfg.sheet?.abRef) await L.abSheet(cfg.family, cfg.sheet.abRef, cfg.n, cfg.sheet.abLabel);
  if (cfg.sheet?.biome) {
    await L.floorSheet(cfg.family, cfg.n, cfg.sheet.biome, hf);
    await L.densitySheet(cfg.family, cfg.n, cfg.sheet.biome, hf, cfg.sheet.densitySpecs);
  }
}

/**
 * Integration lives in scripts/props-integrate.cjs (one parameterised script for
 * all families). It is invoked from here only so `... integrate` keeps working
 * the way the round-1 scripts did — and it re-runs the family's own validator
 * first, so an out-of-band edit to assets/final cannot sneak into src/assets.
 */
async function integrate(cfg, indices) {
  const dir = path.join(L.SRC_PROPS, cfg.family);
  fs.mkdirSync(dir, { recursive: true });
  for (const i of indices) {
    const name = `${cfg.family}_${i}`;
    const src = path.join(L.DIR_FINAL, `${name}.png`);
    if (!fs.existsSync(src)) {
      console.log(`  SKIP ${name} (no final png)`);
      continue;
    }
    const v = await validateOne(cfg, i);
    if (!v.ok) throw new Error(`refusing to integrate ${name}: ${v.problems.join('; ')}`);
    await sharp(src).webp(L.WEBP).toFile(path.join(dir, `${name}.webp`));
    const m = await sharp(src).metadata();
    for (const mip of L.MIPS) {
      await sharp(src)
        .resize(Math.max(1, Math.round(m.width * mip.scale)), Math.max(1, Math.round(m.height * mip.scale)), {
          fit: 'fill',
        })
        .webp(L.WEBP)
        .toFile(path.join(dir, `${name}${mip.suffix}.webp`));
    }
    console.log(`  ${cfg.family}/${name}.webp  ${m.width}x${m.height} (+3 mips)`);
  }
}

async function run(cfg) {
  const argv = process.argv.slice(2);
  const cmd = argv[0] || 'gen';
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const seedIdx = argv.indexOf('--seed');
  const seedOverride = seedIdx >= 0 ? parseInt(argv[seedIdx + 1], 10) : null;
  const idxArgs = argv
    .slice(1)
    .filter((a) => /^\d+$/.test(a))
    .map(Number)
    .filter((n) => n !== seedOverride);
  const indices = idxArgs.length ? idxArgs : Array.from({ length: cfg.n }, (_, i) => i);

  L.ensureDirs();

  if (cmd === 'sheet') return sheets(cfg);
  if (cmd === 'integrate') return integrate(cfg, indices);
  if (cmd === 'validate') {
    for (const i of indices) console.log(fmt(await validateOne(cfg, i)));
    return;
  }
  if (!L.FAL_API_KEY && !flags.has('--reuse-raw')) {
    console.error('No fal key (FAL_AI_API_KEY) in scripts/.env');
    process.exit(1);
  }

  const reuseRaw = flags.has('--reuse-raw');
  const results = [];
  for (const i of indices) {
    try {
      results.push(await runVariant(cfg, i, seedOverride, reuseRaw));
    } catch (e) {
      console.error(`    ERROR ${cfg.family}_${i}: ${e.message}`);
      results.push({ name: `${cfg.family}_${i}`, ok: false, problems: [e.message], m: null, iou: null });
    }
  }
  console.log('\n── summary ──');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.problems.join('; ')}`);
  await sheets(cfg);
}

module.exports = { run, runVariant, validateOne, sheets, integrate, fmt };
