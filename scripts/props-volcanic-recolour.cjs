/**
 * Asset-Pipeline: surface PROP sprites — VOLCANIC RE-DERIVATIONS by pure local
 * colour grade. NO API CALL, NO REGENERATION.
 *
 *   rock_ash_0..4      matt ashy grey-black rubble  -> biomes basalt_plain, ash_field
 *   sulfur_chunk_0..4  dirty yellow sulfur lumps    -> biomes caldera, fumarole
 *
 * Both are graded from the SHIPPED rock_arid sprites
 * (src/assets/props/rock_arid/rock_arid_<i>.webp), variants 0..4. The transform
 * touches RGB only; ALPHA IS COPIED THROUGH UNCHANGED, so silhouette, tight crop
 * and anti-aliasing are bit-identical to the source. Re-running is idempotent
 * because the source is the shipped webp, never the previous output.
 *
 * ── WHY GRADE INSTEAD OF GENERATE
 * Three reasons, in order of weight:
 *   1. STYLE CONSISTENCY. These two are the highest-frequency props in round 2 —
 *      rock_ash is 3/5 of the basalt_plain mix (50.8 % of the surface) and 2/3
 *      of ash_field (16.0 %). Deriving them from the signed-off arid rocks
 *      guarantees they sit in exactly the same fracture / grain / lighting
 *      family as round 1 instead of merely near it.
 *   2. The look asked for is a COLOUR difference, not a shape difference. Ash
 *      rubble and sulfur lumps are weathered stone; the arid set already is
 *      weathered stone, shot from the right angle, at the right resolution.
 *   3. Zero generation risk and zero API cost, so the four real generations in
 *      round 2 get the whole re-roll budget.
 * The precedent is `rock` / `rock_arid` / `rock_snow`, which already ship as
 * three colour states of the SAME six silhouettes.
 *
 * Sharing silhouettes with rock_arid is therefore deliberate and harmless:
 * rock_arid appears only inside the EARTH_LIKE beach mix, and rock_ash /
 * sulfur_chunk only on VOLCANIC biomes — they can never be drawn on the same
 * tile, let alone the same planet.
 *
 * ── THE GRADE (per opaque pixel, alpha untouched)
 *   1. desaturate toward the pixel's own luminance   — kills the arid set's warm
 *      cast before a new one is applied, so the result does not carry two tints
 *   2. per-channel gain                              — puts the hue in the new family
 *   3. blend a small fraction toward a flat target colour — locks a uniform
 *      undertone independent of each sprite's own variance (the trick that made
 *      the round-1 rock recolour consistent across all six)
 *   4. a final MEASURED uniform multiply pinning mean luminance to the family
 *      target — so the output tone is a number, not a hope
 * Step 4 is what makes this script deterministic in the sense the validators
 * care about: every variant lands on the family luminance regardless of how
 * bright its source happened to be.
 *
 * ── TONE TARGETS (measured against the floors they stand on)
 *   rock_ash      lum 52, R/B ~0.97   floors: basalt_plain 55.6/0.721, ash_field 39.2/0.748
 *                 Matt, dusty, near-neutral with a cool breath. NOT glossy —
 *                 gloss is `lava_rock`'s job and is the only thing telling the
 *                 two apart at 28 px.
 *   sulfur_chunk  lum 78, R/B ~2.0    floors: caldera 49.1/1.123, fumarole 63.0/0.983
 *                 Dirty mustard, roughly 0.5 saturation — bright enough to read
 *                 as sulfur, dull enough not to out-shout the ember glow, which
 *                 owns the top of the volcanic attention budget.
 *
 * Writes assets/final/<family>_<i>.png. Integration is a separate step:
 *   node scripts/props-integrate.cjs rock_ash
 *   node scripts/props-integrate.cjs sulfur_chunk
 *
 * Usage:
 *   node scripts/props-volcanic-recolour.cjs              both families
 *   node scripts/props-volcanic-recolour.cjs rock_ash     one family
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const L = require('./props-pipeline-lib.cjs');

const SRC_FAMILY = 'rock_arid';
const SRC_VARIANTS = [0, 1, 2, 3, 4];

const GRADES = {
  rock_ash: {
    sat: 0.35, // strong desaturation: ash is grey, the source is warm brown-grey
    gain: [0.96, 1.0, 1.06], // a breath of cool, matching the basalt/ash floors
    blend: { rgb: [70, 72, 76], amount: 0.1 }, // flat ash undertone; also lifts the blacks,
    // which is what makes a surface read as dusty/matte rather than wet
    targetLum: 52,
    sheetBiome: 'basalt_plain',
    sheetHeightFactor: 1, // no PROP_HEIGHT_FACTORS entry — normal rock size
  },
  sulfur_chunk: {
    sat: 0.5, // keep more of the stone's own modelling than rock_ash does
    gain: [1.25, 1.18, 0.68],
    blend: { rgb: [140, 126, 66], amount: 0.14 },
    targetLum: 78,
    sheetBiome: 'fumarole',
    sheetHeightFactor: 0.6, // planned PROP_HEIGHT_FACTORS entry — ground cover under the vents
  },
};

function clamp8(v) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

async function gradeOne(family, srcIdx, outIdx) {
  const g = GRADES[family];
  const src = path.join(L.SRC_PROPS, SRC_FAMILY, `${SRC_FAMILY}_${srcIdx}.webp`);
  if (!fs.existsSync(src)) throw new Error(`source missing: ${src}`);
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;

  // Passes 1..3 — hue/undertone. Luminance is left where it lands here and
  // corrected in one measured multiply afterwards.
  const a = g.blend.amount;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const l = L.lum(data[i], data[i + 1], data[i + 2]);
    for (let c = 0; c < 3; c++) {
      let v = l + (data[i + c] - l) * g.sat;
      v *= g.gain[c];
      v = v * (1 - a) + g.blend.rgb[c] * a;
      data[i + c] = clamp8(v);
    }
  }

  // Pass 4 — pin the family luminance.
  let sum = 0,
    n = 0,
    r = 0,
    b = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    sum += L.lum(data[i], data[i + 1], data[i + 2]);
    r += data[i];
    b += data[i + 2];
    n++;
  }
  const factor = g.targetLum / (sum / n);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) data[i + c] = clamp8(data[i + c] * factor);
  }

  const out = path.join(L.DIR_FINAL, `${family}_${outIdx}.png`);
  await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toFile(out);
  console.log(
    `  ${SRC_FAMILY}_${srcIdx} -> ${family}_${outIdx}  ${W}x${H} aspect ${(W / H).toFixed(2)} ` +
      `lum ${(sum / n).toFixed(1)} x${factor.toFixed(3)} -> ${g.targetLum}  R/B ${((r / b) * 1).toFixed(3)}`,
  );
}

/** Re-measure the written PNGs so the report numbers come from the files, not from intent. */
async function verify(family) {
  const g = GRADES[family];
  console.log(`\n[verify] ${family}`);
  let ok = true;
  for (let i = 0; i < SRC_VARIANTS.length; i++) {
    const p = path.join(L.DIR_FINAL, `${family}_${i}.png`);
    const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let n = 0,
      sl = 0,
      sr = 0,
      sb = 0;
    for (let k = 0; k < data.length; k += 4) {
      if (data[k + 3] < 200) continue;
      sl += L.lum(data[k], data[k + 1], data[k + 2]);
      sr += data[k];
      sb += data[k + 2];
      n++;
    }
    const iou = await L.silhouetteIoU(p, path.join(L.SRC_PROPS, SRC_FAMILY, `${SRC_FAMILY}_${SRC_VARIANTS[i]}.webp`));
    const lumV = sl / n;
    const bad = Math.abs(lumV - g.targetLum) > 1.0 || iou < 0.999;
    if (bad) ok = false;
    console.log(
      `  ${family}_${i}  ${info.width}x${info.height} aspect ${(info.width / info.height).toFixed(2)} ` +
        `lum ${lumV.toFixed(1)} R/B ${(sr / sb).toFixed(3)} IoU-vs-source ${iou.toFixed(4)} ${bad ? 'FAIL' : 'ok'}`,
    );
  }
  return ok;
}

(async () => {
  L.ensureDirs();
  const only = process.argv[2];
  const families = only ? [only] : Object.keys(GRADES);
  for (const family of families) {
    if (!GRADES[family]) throw new Error(`unknown family: ${family}`);
    console.log(`[grade] ${family} from ${SRC_FAMILY}`);
    for (let i = 0; i < SRC_VARIANTS.length; i++) await gradeOne(family, SRC_VARIANTS[i], i);
    if (!(await verify(family))) throw new Error(`${family}: verification failed`);
    await L.contactSheet(family, SRC_VARIANTS.length);
    await L.abSheet(family, SRC_FAMILY, SRC_VARIANTS.length, 'rock_arid');
    const hf = GRADES[family].sheetHeightFactor;
    await L.floorSheet(family, SRC_VARIANTS.length, GRADES[family].sheetBiome, hf);
    await L.densitySheet(family, SRC_VARIANTS.length, GRADES[family].sheetBiome, hf);
  }
  console.log('\ndone — run scripts/props-integrate.cjs <family> to publish');
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
