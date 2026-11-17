/**
 * Principal-axis measurement for the ice_block séracs.
 *
 * ── WHY THIS EXISTS
 *
 * Rudi accepted ice_block_1, _3 and _4 and rejected _0 and _2 on ORIENTATION
 * alone ("ice_block_2 und ice_block_0 passt die ausrichtung nicht. der rest ist
 * gut"). Three accepted pieces define the target axis empirically, which is a
 * better reference than anybody's reading of the two rejects — so the axis is
 * MEASURED off the accepted three and the replacements are aimed at that.
 *
 * The project convention (feedback_asset_ausrichtung_links_unten) is that a
 * directed object runs LOWER LEFT -> UPPER RIGHT, and that it belongs in the
 * PROMPT rather than in the post-selection. This script does not select; it
 * says which way each shipped sprite actually points, so the prompt can be
 * written against a number instead of an impression.
 *
 * ⚠️ MIRRORING IS NOT A REPAIR. Flipping a sprite to fix its axis moves the
 * light from upper-left to upper-right and breaks the other convention. A
 * mis-aimed variant is re-generated, never flipped.
 *
 * ── THE THREE MEASURES, AND WHY THREE
 *
 * "Axis" is vague on a broken mass, so it is split into the three things that
 * actually make one of these read as leaning, all signed so that
 * POSITIVE = points to the upper right = correct:
 *
 *   headShift   x-centroid of the top 25 % band minus that of the bottom 25 %,
 *               as a fraction of the sprite width. Where the head sits relative
 *               to the foot. This is the plainest reading of "leans".
 *   overhang    how far the silhouette reaches past the FOOT's own span, right
 *               minus left, as a fraction of width. This is the one the anchor's
 *               "narrower at its buried foot than across its shoulders" clause
 *               is aimed at, and it is what makes a shape look broken-off rather
 *               than set down.
 *   peakShift   x of the tallest column minus the x-centroid of the whole
 *               silhouette. Which way the outline climbs.
 *
 * They are reported separately because they can disagree — a mass can overhang
 * right while its crown sits left — and the disagreement is itself the finding.
 *
 * ── MEASURED ON A REDUCED IMAGE, ON PURPOSE
 *
 * LESSONS: the axis is clearer on the downscaled image than at 1024, and at game
 * scale (144x72 device px per tile) it is the only scale that decides anything.
 * Everything here is computed at the sprite's real DRAW HEIGHT in device pixels
 * (PROP_BASE_HEIGHT x factor x zoom x dpr), so the numbers describe what the
 * player is shown, not what the source file contains.
 *
 * Usage: node scripts/props-ice-block-axis.cjs [heightFactor]
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const DIR_FINAL = path.join(ROOT, 'assets', 'final');
const DIR_REJECTED = path.join(ROOT, 'assets', 'rejected');
const PROP_BASE_HEIGHT = 28;
const DPR = 3;
const ZOOM = 1;

/** Alpha silhouette at the real device draw size. */
async function silhouette(file, factor) {
  const m = await sharp(file).metadata();
  const h = Math.max(4, Math.round(PROP_BASE_HEIGHT * factor * ZOOM * DPR));
  const w = Math.max(2, Math.round(h * (m.width / m.height)));
  const { data } = await sharp(file).ensureAlpha().resize(w, h, { fit: 'fill' })
    .raw().toBuffer({ resolveWithObject: true });
  const a = new Float64Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) a[p] = data[i + 3] / 255;
  return { a, w, h };
}

/** x-centroid of the rows in [y0, y1), alpha-weighted; null when empty. */
function bandCentroid(s, y0, y1) {
  let sx = 0, sw = 0;
  for (let y = y0; y < y1; y++)
    for (let x = 0; x < s.w; x++) { const v = s.a[y * s.w + x]; sx += v * x; sw += v; }
  return sw > 0 ? sx / sw : null;
}

/** Left/right extent of the rows in [y0, y1) at a coverage threshold. */
function bandSpan(s, y0, y1, thr = 0.5) {
  let lo = Infinity, hi = -Infinity;
  for (let y = y0; y < y1; y++)
    for (let x = 0; x < s.w; x++)
      if (s.a[y * s.w + x] >= thr) { if (x < lo) lo = x; if (x > hi) hi = x; }
  return lo === Infinity ? null : { lo, hi };
}

function measure(s) {
  const topEnd = Math.max(1, Math.round(s.h * 0.25));
  const botStart = Math.min(s.h - 1, Math.round(s.h * 0.75));
  const top = bandCentroid(s, 0, topEnd);
  const bot = bandCentroid(s, botStart, s.h);
  const headShift = top !== null && bot !== null ? (top - bot) / s.w : null;

  // overhang: how far the whole silhouette reaches past the foot's own span
  const foot = bandSpan(s, botStart, s.h);
  const all = bandSpan(s, 0, s.h);
  const overhang = foot && all ? ((foot.lo - all.lo) - (all.hi - foot.hi)) / s.w : null;
  //                              ^ left reach          ^ right reach
  // signed so POSITIVE = reaches further RIGHT than LEFT:
  const overhangR = foot && all ? ((all.hi - foot.hi) - (foot.lo - all.lo)) / s.w : null;

  // peak: the tallest column (smallest top-most y), against the whole centroid
  let bestY = Infinity, bestX = 0, tie = [];
  for (let x = 0; x < s.w; x++)
    for (let y = 0; y < s.h; y++)
      if (s.a[y * s.w + x] >= 0.5) {
        if (y < bestY) { bestY = y; tie = [x]; } else if (y === bestY) tie.push(x);
        break;
      }
  bestX = tie.length ? tie.reduce((p, c) => p + c, 0) / tie.length : 0;
  const cen = bandCentroid(s, 0, s.h);
  const peakShift = cen !== null ? (bestX - cen) / s.w : null;

  // BASE SLOPE — the measure that actually separates Rudi's two groups.
  //
  // headShift/overhang/peakShift all describe where the MASS hangs. They put
  // ice_block_0 inside the accepted band and still Rudi rejected it, so they are
  // not what he is reading. What the accepted three share is the GROUND
  // FOOTPRINT: in an iso projection the bottom contour traces the front edge of
  // the footprint, so its slope says which way the object lies on the ground.
  // The convention (lower left -> upper right) wants that edge to RISE to the
  // right, i.e. the bottom-most y to DECREASE with x.
  //
  // Least squares over the bottom-most opaque pixel per column, weighted towards
  // the middle of the span so a single splayed corner cannot set the angle.
  // Reported as a screen ANGLE in degrees, positive = rises to the right. The
  // iso ground axes sit at +-26.57 deg, so a well-aligned piece lands near +26.
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, sw = 0;
  for (let x = 0; x < s.w; x++) {
    let yb = -1;
    for (let y = s.h - 1; y >= 0; y--) if (s.a[y * s.w + x] >= 0.5) { yb = y; break; }
    if (yb < 0) continue;
    const t = (x + 0.5) / s.w;
    const wgt = 1 - Math.abs(2 * t - 1); // triangular, 0 at the edges
    if (wgt <= 0) continue;
    n++; sw += wgt; sx += wgt * x; sy += wgt * yb; sxx += wgt * x * x; sxy += wgt * x * yb;
  }
  let baseAngle = null;
  if (n > 3) {
    const den = sw * sxx - sx * sx;
    if (Math.abs(den) > 1e-9) {
      const slope = (sw * sxy - sx * sy) / den;       // dy/dx in image coords
      baseAngle = (Math.atan(-slope) * 180) / Math.PI; // +ve = rises to the right
    }
  }
  // ── THE ONE THAT ACTUALLY SEPARATES RUDI'S TWO GROUPS: IS A CORNER FACING US?
  //
  // headShift, overhang, peakShift and baseAngle all fail to separate them —
  // ice_block_0 sits inside the accepted band on every one of the four and Rudi
  // still rejected it. What the accepted three share is not where the mass leans
  // but HOW THE OBJECT IS TURNED: each presents a near CORNER to the camera, so
  // two faces recede left and right along the iso ground axes. ice_block_0 and _2
  // present one big plane FACE-ON, square to the screen, which is the same defect
  // as a building drawn in elevation inside an iso scene — it does not sit in the
  // grid, whatever direction its mass happens to lean.
  //
  // In an iso projection a corner-on footprint draws its two front-bottom edges at
  // about -+26.57 deg, so the BOTTOM CONTOUR is a shallow V with its vertex near
  // the middle. A face-on footprint draws one horizontal front edge, so the bottom
  // contour is a flat line. Fitting the two halves of the bottom contour
  // separately therefore measures exactly the thing the eye is reading:
  //
  //   legL   angle of the left half, positive = rises towards the LEFT
  //   legR   angle of the right half, positive = rises towards the RIGHT
  //   vee    legL + legR, the total opening of the V. Near 0 = face-on.
  //
  // Note this is orthogonal to the lower-left -> upper-right convention rather
  // than a replacement for it: vee says the piece sits IN the grid, headShift
  // says which way along it. Both have to hold.
  const leg = (x0, x1) => {
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let x = x0; x < x1; x++) {
      let yb = -1;
      for (let y = s.h - 1; y >= 0; y--) if (s.a[y * s.w + x] >= 0.5) { yb = y; break; }
      if (yb < 0) continue;
      n++; sx += x; sy += yb; sxx += x * x; sxy += x * yb;
    }
    if (n < 3) return null;
    const den = n * sxx - sx * sx;
    if (Math.abs(den) < 1e-9) return null;
    return (n * sxy - sx * sy) / den; // dy/dx
  };
  const half = Math.floor(s.w / 2);
  const sL = leg(0, half), sR = leg(half, s.w);
  const deg = (v) => (Math.atan(v) * 180) / Math.PI;
  // left half: rising towards the LEFT means y grows with x -> slope > 0
  const legL = sL === null ? null : deg(sL);
  // right half: rising towards the RIGHT means y falls with x -> slope < 0
  const legR = sR === null ? null : -deg(sR);
  const vee = legL === null || legR === null ? null : legL + legR;

  return { headShift, overhang: overhangR, peakShift, baseAngle, legL, legR, vee, w: s.w, h: s.h };
}

const d1 = (v) => (v === null ? '  n/a' : (v >= 0 ? '+' : '') + v.toFixed(1).padStart(5));
const vfmt = (m) =>
  `${d1(m.legL)} ${d1(m.legR)} ${d1(m.vee)} ${m.vee === null ? '' : m.vee > 22 ? 'CORNER-ON' : m.vee < 12 ? 'face-on  ' : 'shallow  '}`;
const arrow = (v) => (v === null ? ' ?' : v > 0.02 ? '-> RIGHT' : v < -0.02 ? '<- LEFT ' : '   flat ');
const fmt = (v) => (v === null ? '  n/a' : (v >= 0 ? '+' : '') + v.toFixed(3));
/** Screen angle of the base edge; the iso ground axes sit at +-26.57 deg. */
const ang = (v) =>
  v === null ? '   n/a  ' : `${(v >= 0 ? '+' : '') + v.toFixed(1).padStart(5)} deg ${v > 8 ? '/ up-right' : v < -8 ? '\ up-left ' : '- flat    '}`;

async function main() {
  const factor = parseFloat(process.argv[2] || '0.7');
  // After the renumbering every shipped variant is accepted; the band below
  // is therefore the FAMILY band rather than a target to aim a reject at.
  const ACCEPTED = [0, 1, 2, 3];
  const REDONE = [];
  console.log(`ice_block principal axis — measured at the real draw size ` +
    `(factor ${factor}, zoom ${ZOOM}, dpr ${DPR})`);
  console.log('POSITIVE = points to the UPPER RIGHT = the project convention.\n');
  console.log('sprite            px      headShift        overhang        peakShift       baseAngle        legL   legR    vee    verdict');

  const rows = [];
  for (const i of [0, 1, 2, 3]) {
    const f = path.join(DIR_FINAL, `ice_block_${i}.png`);
    if (!fs.existsSync(f)) continue;
    const m = measure(await silhouette(f, factor));
    const tag = ACCEPTED.includes(i) ? 'ACCEPTED' : REDONE.includes(i) ? 'redo' : '';
    rows.push({ i, m, tag });
    console.log(
      `ice_block_${i}      ${String(m.w).padStart(3)}x${String(m.h).padStart(2)}` +
      `   ${fmt(m.headShift)} ${arrow(m.headShift)}` +
      `   ${fmt(m.overhang)} ${arrow(m.overhang)}` +
      `   ${fmt(m.peakShift)} ${arrow(m.peakShift)}   ${ang(m.baseAngle)}  ${vfmt(m)}  ${tag}`);
  }

  const acc = rows.filter((r) => ACCEPTED.includes(r.i));
  if (acc.length) {
    const mean = (k) => acc.reduce((s, r) => s + (r.m[k] ?? 0), 0) / acc.length;
    console.log(`\nTARGET, from the ${acc.length} accepted sprites:`);
    console.log(`  headShift ${fmt(mean('headShift'))}   overhang ${fmt(mean('overhang'))}   peakShift ${fmt(mean('peakShift'))}   baseAngle ${ang(mean('baseAngle'))}`);
    console.log(`  vee ${d1(mean('vee'))} deg   range ${Math.min(...acc.map(r => r.m.vee)).toFixed(1)} .. ${Math.max(...acc.map(r => r.m.vee)).toFixed(1)}`);
    console.log(`  range headShift ${fmt(Math.min(...acc.map(r => r.m.headShift)))} .. ${fmt(Math.max(...acc.map(r => r.m.headShift)))}`);
    console.log(`  range overhang  ${fmt(Math.min(...acc.map(r => r.m.overhang)))} .. ${fmt(Math.max(...acc.map(r => r.m.overhang)))}`);
    console.log(`  range baseAngle ${Math.min(...acc.map(r => r.m.baseAngle)).toFixed(1)} .. ${Math.max(...acc.map(r => r.m.baseAngle)).toFixed(1)} deg`);
  }

  // the superseded round-1 versions, for the record
  let printed = false;
  for (const i of [0, 1, 2, 3, 4]) {
    const f = path.join(DIR_REJECTED, `ice_block_${i}_r1.png`);
    if (!fs.existsSync(f)) continue;
    if (!printed) { console.log('\nsuperseded round-1 versions (assets/rejected/), for the record:'); printed = true; }
    const m = measure(await silhouette(f, factor));
    console.log(
      `ice_block_${i}_r1   ${String(m.w).padStart(3)}x${String(m.h).padStart(2)}` +
      `   ${fmt(m.headShift)} ${arrow(m.headShift)}` +
      `   ${fmt(m.overhang)} ${arrow(m.overhang)}` +
      `   ${fmt(m.peakShift)} ${arrow(m.peakShift)}   ${ang(m.baseAngle)}  ${vfmt(m)}`);
  }
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
