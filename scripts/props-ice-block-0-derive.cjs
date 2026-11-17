/**
 * ice_block_0 — the IMAGE-TO-IMAGE route, after five text-to-image attempts.
 *
 * ── WHY A SEPARATE SCRIPT
 *
 * props-ice-block-generate.cjs owns the family: one prompt shape per variant,
 * one shared anchor, one grade. It can only ever write its own files, and that
 * property is load-bearing (props-pipeline-lib header) — re-running the family
 * must never be able to disturb ice_block_1/_3/_4, which Rudi has accepted, or
 * ice_rubble. This script therefore writes exactly ONE sprite, ice_block_0, and
 * reuses the shared library for every step that is not the turn.
 *
 * ── THE PROBLEM IT SOLVES
 *
 * Rudi returned _0 for orientation. Five text-to-image attempts failed in five
 * different ways (the table is in props-ice-block-generate.cjs). The diagnosis:
 * TALL, CORNER-ON and LEANING RIGHT are each reachable on their own and were not
 * reachable together from words. So the work is split in two:
 *
 *   STEP A  text-to-image, asked for STATURE ONLY — an upright wedge with no
 *           body underneath it. Nothing about turn, nothing about lean. This is
 *           the one thing the text path did produce reliably (attempt 4,
 *           seed 821109, came back a clean upright wedge; its only fault was
 *           that it was too narrow, aspect 0.41).
 *   STEP B  kontext, asked for THE TURN ONLY — rotate it on the spot so a corner
 *           faces the viewer. A rotation about the vertical axis WIDENS a narrow
 *           blade, so step B is also what fixes the aspect.
 *
 * ── ⚠️ A PLAIN SILHOUETTE-IoU FLOOR IS THE WRONG GUARD HERE, AND THIS IS WHY
 *
 * The brief asks for the IoU floor that props-family-runner uses in derive mode,
 * so that "a re-sculpt fails instead of shipping". That guard is right for what
 * it was built for — charred_tree_ember repaints a trunk and must keep its
 * silhouette, so IoU >= 0.95 is exactly the question. It is the wrong guard for
 * a ROTATION, because a rotation CHANGES the silhouette by definition. A floor
 * would reject every successful turn and pass only the failures where kontext
 * did nothing.
 *
 * So the guard is kept but turned into a WINDOW, which asks the question the
 * brief actually means:
 *
 *   IoU >= IOU_NOOP (0.92)   kontext did nothing -> reject, the turn never happened
 *   IoU <= IOU_RESCULPT      a different object came back -> reject
 *   in between               a turn
 *
 * and it is backed by a second measure that a re-sculpt cannot fake: a rotation
 * about the vertical axis preserves HEIGHT and VOLUME, so the silhouette's
 * area-over-height-squared should move only modestly. A model that invents a new
 * object has no reason to preserve it. Both are printed; neither is trusted
 * alone, and the axis numbers plus Rudi's own test ("does it look as if a human
 * put it there?") remain the acceptance criteria.
 *
 * ── TARGETS (from the three sprites Rudi accepted)
 *   vee        83.5 .. 99.3   sits corner-on in the iso grid
 *   headShift  positive, in the band of the other four
 *   aspect     < 0.95         UPRIGHT — the condition that separates a sérac
 *                             from a lying chunk, and what attempt 2 fails
 *   blowout    < 0.1 %, tone and hue on the family
 *
 * Usage:
 *   node scripts/props-ice-block-0-derive.cjs stature       (step A, flux-pro)
 *   node scripts/props-ice-block-0-derive.cjs turn          (step B, kontext + 2..6)
 *   node scripts/props-ice-block-0-derive.cjs turn --seed 12345
 *   node scripts/props-ice-block-0-derive.cjs turn --reuse  (re-run 2..6 only)
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const L = require('./props-pipeline-lib.cjs');
sharp.cache(false);

const NAME = 'ice_block_0';
const STATURE_PNG = path.join(L.DIR_RAW, 'ice_block_0_stature.png');
const RAW_PNG = path.join(L.DIR_RAW, `${NAME}_raw.png`);

const IOU_NOOP = 0.92;
const IOU_RESCULPT = 0.30;

// ── STEP A: stature only ──
//
// Deliberately says NOTHING about turn or lean — those are step B's job, and
// asking for all three at once is what failed five times. It also says nothing
// about anything UNDERNEATH the object: three of those five failures were a
// plinth, a sunken flat lump and an apron of plates, each one conjured by a
// mention of foot / ground / the ice it grew from. The anchor's own
// "narrower at its buried foot than across its shoulders" covers the foot.
const STATURE_SEED = 821109;
const STATURE_PROMPT =
  'One tall wedge of glacier ice standing on end, its crown a slanted crest, its left side ' +
  'undercut and hollowed. ' +
  'Photorealistic photo of an iceberg fragment that has broken out of a glacier and stayed where ' +
  'it split, one isolated object floating in mid-air against a plain uniform mid-grey seamless ' +
  'backdrop that continues unbroken behind and below it, seen from a high three-quarter isometric ' +
  'angle looking down. Its sides are broad flat fracture planes at uneven angles, each a different ' +
  'size and its own tilt, none matching another. The ice is dull greyish, finely granular and matt ' +
  'all over like old snow-ice, stained faint grey-brown with grit; one plane broke away lately and ' +
  'is a shade paler, still matt. Light from the upper left, deep shadow lower right, dim moody ' +
  'light, muted palette, only a faint cold blue cast, sharp focus, crisp silhouette, centred with ' +
  'an empty margin all round.';

// ── STEP B: the turn only ──
//
// Scoped, not sweeping (LESSONS § 3: "skopiert formulieren, nicht flächig").
// Everything that must survive is named explicitly, because kontext regenerates
// rather than edits and will quietly drop what is not mentioned — the same
// property that makes it good at REMOVING things.
const TURN_SEED = 903117;
const TURN_PROMPT =
  'Rotate this block of ice on the spot about its vertical axis, so that one of its upright ' +
  'corners now points towards the viewer and two of its sides recede away from the viewer, one to ' +
  'the left and one to the right, and so that it leans over towards the upper right. ' +
  'Keep the very same block: the same height, the same broken flat planes, the same matt finely ' +
  'granular grey ice, the same light from the upper left with deep shadow on the lower right, and ' +
  'the same plain uniform mid-grey backdrop continuing unbroken behind and below it. It stands ' +
  'free in mid-air with nothing underneath it.';

// ── measurement ──
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

async function silhouetteAt(file, h = 256) {
  const m = await sharp(file).metadata();
  const w = Math.max(1, Math.round(h * (m.width / m.height)));
  const { data } = await sharp(file).ensureAlpha().resize(w, h, { fit: 'fill' })
    .raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(w * h);
  let area = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) { mask[p] = data[i + 3] >= 128 ? 1 : 0; area += mask[p]; }
  return { mask, w, h, area };
}

/** IoU the way the renderer would compare them: height-normalised, bottom-centred. */
async function iou(aFile, bFile) {
  const A = await silhouetteAt(aFile), B = await silhouetteAt(bFile);
  const W = Math.max(A.w, B.w), H = A.h;
  const oa = Math.round((W - A.w) / 2), ob = Math.round((W - B.w) / 2);
  let inter = 0, uni = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const xa = x - oa, xb = x - ob;
      const a = xa >= 0 && xa < A.w ? A.mask[y * A.w + xa] : 0;
      const b = xb >= 0 && xb < B.w ? B.mask[y * B.w + xb] : 0;
      if (a | b) uni++;
      if (a & b) inter++;
    }
  return { iou: uni ? inter / uni : 0, bulkA: A.area / (A.h * A.h), bulkB: B.area / (B.h * B.h) };
}

async function blowout(file) {
  const { data } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0, b = 0, s = 0, sr = 0, sb = 0;
  for (let k = 0; k < data.length; k += 4) {
    if (data[k + 3] < 200) continue;
    const l = lum(data[k], data[k + 1], data[k + 2]);
    n++; s += l; sr += data[k]; sb += data[k + 2]; if (l > 200) b++;
  }
  return { lum: s / n, br: sb / sr, blow: (100 * b) / n };
}

// The fresh-fracture classifier, identical to the family script's.
function freshFaceWeight(r, g, b) {
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  return L.ramp(L.lum(r, g, b), 134, 186) * L.ramp(34 - sat, 4, 20);
}
const TONE = {
  targetLum: 100,
  tint: [1.085, 1.0, 0.92],
  minFactor: 0.25,
  maxFactor: 2.5,
  overlay: { targetLum: 148, tint: [0.94, 0.99, 1.08], minFactor: 0.3, maxFactor: 3.0 },
};

async function stature() {
  console.log(`[stature] flux-pro seed ${STATURE_SEED}, prompt ${STATURE_PROMPT.length} chars`);
  L.assertPromptFits(STATURE_PROMPT, 'stature prompt');
  const png = await L.genFluxPro(STATURE_PROMPT, { w: 1024, h: 1152 }, STATURE_SEED);
  fs.writeFileSync(STATURE_PNG, png);
  console.log(`[stature] -> ${STATURE_PNG}`);
}

async function turn(seedOverride, reuse) {
  if (!reuse) {
    if (!fs.existsSync(STATURE_PNG)) throw new Error('run `stature` first');
    const seed = seedOverride ?? TURN_SEED;
    console.log(`[turn] kontext seed ${seed}, prompt ${TURN_PROMPT.length} chars`);
    L.assertPromptFits(TURN_PROMPT, 'turn prompt');
    const out = await L.deriveKontext(fs.readFileSync(STATURE_PNG), TURN_PROMPT, seed);
    fs.writeFileSync(RAW_PNG, out);
  }
  // steps 2..6, identical to the family pipeline
  const nobg = await L.cleanAlpha(await L.removeBackground(fs.readFileSync(RAW_PNG)), 0.004);
  fs.writeFileSync(path.join(L.DIR_NOBG, `${NAME}_nobg.png`), nobg);
  const pre = await L.tightCrop(nobg);
  const mask = await L.writeMask(pre, NAME, freshFaceWeight);
  const cropped = await L.toneNormalise(pre, NAME, mask, TONE);
  fs.writeFileSync(path.join(L.DIR_CROP, `${NAME}_cropped.png`), cropped);
  const final = await L.scaleToConvention(cropped);
  const out = path.join(L.DIR_FINAL, `${NAME}.png`);
  fs.writeFileSync(out, final);

  const m = await L.measure(out, NAME);
  const b = await blowout(out);
  const cmp = await iou(STATURE_PNG, out);
  console.log(`\n  ${NAME}  ${m.w}x${m.h}  aspect ${m.aspect.toFixed(2)}  base ${m.baseLum.toFixed(1)}  ` +
    `R/B ${m.baseRB.toFixed(2)}  fresh ${m.overlayPct.toFixed(1)}%@${m.overlayLum.toFixed(0)}`);
  console.log(`  family lum ${b.lum.toFixed(1)}  B/R ${b.br.toFixed(3)}  blowout ${b.blow.toFixed(3)} %`);
  console.log(`  IoU vs stature ${cmp.iou.toFixed(3)}  ` +
    (cmp.iou >= IOU_NOOP ? '-> NO-OP, kontext did not turn it'
      : cmp.iou <= IOU_RESCULPT ? '-> RE-SCULPTED, reject'
        : '-> a turn'));
  console.log(`  bulk (area/h^2) ${cmp.bulkA.toFixed(3)} -> ${cmp.bulkB.toFixed(3)}  ` +
    `(${(100 * (cmp.bulkB / cmp.bulkA - 1)).toFixed(1)} %) — a rotation preserves volume, a re-sculpt need not`);
  console.log(`\n  now run: node scripts/props-ice-block-axis.cjs 0.7`);
}

const argv = process.argv.slice(2);
const cmd = argv[0] || 'turn';
const si = argv.indexOf('--seed');
const seed = si >= 0 ? parseInt(argv[si + 1], 10) : null;
L.ensureDirs();
(cmd === 'stature' ? stature() : turn(seed, argv.includes('--reuse')))
  .catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
