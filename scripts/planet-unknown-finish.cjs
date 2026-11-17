// ═══════════════════════════════════════════
// Trade Empire — planet_unknown: finish + integrate + contact sheet.
//
// Usage:  node scripts/planet-unknown-finish.cjs <TAG> [--integrate]
//         TAG = e.g. ECLIPSE_s10101 (a file in assets/raw/)
//
// ── STEP 3 OF THE PIPELINE IS DELIBERATELY NOT RUN ────────────────────────
// The brief warns about it and the warning is correct: the motif IS a black
// disc. birefnet decides what is "subject" from contrast against a backdrop —
// here the backdrop and the subject are the same pure black (measured: source
// interior luma 0.00, source outside-corona luma 0.00). It would either keep
// the bright corona and drop the disc, or eat the limb. So no cut-out pass.
//
// ── HOW THE ALPHA IS BUILT INSTEAD ────────────────────────────────────────
//   alpha = max( disc mask , corona luminance / T )   capped to r <= R_FOOT
//
//   · disc mask   the ACTUAL dark blob (flood-filled from the frame centre),
//                 dilated 2 px and feathered — not a circle at the mean
//                 radius. First attempt used the mean-radius circle and the
//                 alpha channel came back with a 1-px TRANSPARENT HAIRLINE
//                 arc along the lower-left limb: the per-angle radius varies
//                 (sd 1.35 px), so on the arcs where the true disc is wider
//                 than the mean, the circle ended inside still-black pixels
//                 that the corona term then valued at alpha 0. Visible in
//                 the alpha channel as a thin dark arc, and on the header
//                 card it would have shown as a bright hairline ring around
//                 the silhouette. The blob cannot have that failure mode.
//                 The silhouette stays FULLY OPAQUE and pure black, so it is
//                 darker than every app ground it can sit on. That edge is
//                 what makes the shape readable at all.
//   · corona/T    the ring is opaque where it is bright and fades out with its
//                 OWN falloff. No invented ramp radius, and no hard boundary
//                 to notice. Gaps between streamers go transparent, which is
//                 what a gap in a corona should do.
//   · R_FOOT 254  the footprint radius measured off a real backend planet
//                 image (planet-sys--22_-11_-1-113-1.webp: a centred opaque
//                 circle, alpha 255 out to r 252, 12 at 256, 0 beyond). The
//                 placeholder therefore occupies EXACTLY the same footprint as
//                 the image it stands in for, so the reveal is not a size jump.
//                 The corona has died before this radius, so the cap clips
//                 nothing — it only guarantees the convention.
//
// Two alternatives were rejected and are worth recording:
//   (a) opaque square with fading corners — leaves a straight-edged fade that
//       competes with the disc edge, which is the one edge that must read.
//   (b) alpha from luminance ALONE (only the corona carries) — the silhouette
//       would go transparent. On the gray-900/60 header card the "planet"
//       would then be BRIGHTER than its surroundings, inverting the motif.
//
// ── NO ISO VALIDATION ─────────────────────────────────────────────────────
// CLAUDE.md step 6 checks a 26.57° tilt and upper-left light. Neither applies:
// a planet is seen frontally, and a corona is annular by construction. The
// checks that replace it are in `validate()` below and printed on every run.
// ═══════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const DIR_RAW = path.join(ROOT, 'assets', 'raw');
const DIR_CROP = path.join(ROOT, 'assets', 'cropped');
const DIR_FINAL = path.join(ROOT, 'assets', 'final');
const DIR_SHEET = path.join(ROOT, 'assets', 'style-test', 'tiles');
const DIR_SRC = path.join(ROOT, 'src', 'assets', 'planets');
for (const d of [DIR_CROP, DIR_FINAL, DIR_SHEET]) fs.mkdirSync(d, { recursive: true });

const SIZE = 512; // backend planet-image convention (openapi.yaml: 512x512 WebP)
const R_FOOT = 254; // measured off the real backend image
const CORONA_T = 26; // luma at which the corona counts as fully opaque
const NAME = 'planet_unknown';
// @eighth is NOT produced: the shipped planet images have no @eighth level
// (utils/planetImage.ts — it answers 403 on the CDN and nothing asks for it).
const MIPS = [
  { suffix: '@half', px: 256 },
  { suffix: '@quarter', px: 128 },
];
const WEBP = { quality: 90, effort: 6, smartSubsample: true };

const L = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => t * t * (3 - 2 * t);

/** Separable box blur with radius r, clamped at the borders. */
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let o = -r; o <= r; o++) {
        const nx = x + o;
        if (nx < 0 || nx >= w) continue;
        s += src[y * w + nx];
        n++;
      }
      tmp[y * w + x] = s / n;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let o = -r; o <= r; o++) {
        const ny = y + o;
        if (ny < 0 || ny >= h) continue;
        s += tmp[ny * w + x];
        n++;
      }
      out[y * w + x] = s / n;
    }
  return out;
}

// ── geometry of a source frame: disc centre, disc radius, corona extent ──
async function probe(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  const lum = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * ch;
    lum[p] = L(data[i], data[i + 1], data[i + 2]);
  }
  // Centroid of the dark core. It MUST be the flood-filled blob: the first
  // version averaged dark pixels inside a circle around the frame centre,
  // and a circular crop pins the centroid to the crop's own centre — it
  // reported 512.0, 512.0 exactly, which is the crop speaking, not the disc.
  // The blob then came out 3.2 px off centre in the finished 512 frame.
  const blob = new Uint8Array(w * h);
  const seed = (h >> 1) * w + (w >> 1);
  if (lum[seed] >= 18) throw new Error('frame centre is not dark — no silhouette to centre on');
  const stack = new Int32Array(w * h);
  let sp = 0;
  stack[sp++] = seed;
  blob[seed] = 1;
  let sx = 0;
  let sy = 0;
  let n = 0;
  while (sp > 0) {
    const p = stack[--sp];
    const x = p % w;
    const y = (p - x) / w;
    sx += x;
    sy += y;
    n++;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const q = ny * w + nx;
      if (blob[q] || lum[q] >= 18) continue;
      blob[q] = 1;
      stack[sp++] = q;
    }
  }
  const cx = sx / n;
  const cy = sy / n;

  // per-angle disc radius = last radius that is still dark walking outward
  const radii = [];
  for (let a = 0; a < 720; a++) {
    const th = (a * Math.PI) / 360;
    let r = 0;
    for (let t = 0; t < w; t += 0.5) {
      const x = Math.round(cx + Math.cos(th) * t);
      const y = Math.round(cy + Math.sin(th) * t);
      if (x < 0 || y < 0 || x >= w || y >= h) break;
      if (lum[y * w + x] >= 18) break;
      r = t;
    }
    radii.push(r);
  }
  const rDisc = radii.reduce((a, b) => a + b, 0) / radii.length;
  const rSd = Math.sqrt(radii.reduce((a, b) => a + (b - rDisc) ** 2, 0) / radii.length);

  // corona extent = outermost 2-px ring whose p99 luma still exceeds 2
  const RB = 2;
  const nb = Math.floor(Math.min(w, h) / 2 / RB);
  const rings = Array.from({ length: nb }, () => []);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const b = Math.floor(Math.hypot(x - cx, y - cy) / RB);
      if (b < nb) rings[b].push(lum[y * w + x]);
    }
  let rCorona = rDisc;
  for (let b = nb - 1; b >= 0; b--) {
    const a = rings[b];
    if (!a.length) continue;
    a.sort((p, q) => p - q);
    if (a[Math.floor(0.99 * a.length)] > 2) {
      rCorona = (b + 1) * RB;
      break;
    }
  }
  return { w, h, ch, cx, cy, rDisc, rSdPct: (rSd / rDisc) * 100, rCorona, lum, data };
}

// ── build the 512x512 RGBA buffer ──
async function build(file) {
  const g = await probe(file);
  // Scale so the corona's own outer extent lands on the footprint radius.
  const scale = R_FOOT / g.rCorona;
  const sw = Math.round(g.w * scale);
  const sh = Math.round(g.h * scale);
  // Recentre: the disc centre must land on the frame centre.
  const ncx = g.cx * scale;
  const ncy = g.cy * scale;
  const left = Math.round(ncx - (SIZE - 1) / 2);
  const top = Math.round(ncy - (SIZE - 1) / 2);

  const resized = await sharp(file)
    .removeAlpha()
    .resize(sw, sh, { fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toBuffer();
  // extract() cannot go outside the canvas (LESSONS § 3: sharp drops
  // out-of-canvas layers), so pad first, then extract from the padded frame.
  const pad = Math.max(0, -left, -top, left + SIZE - sw, top + SIZE - sh) + 2;
  const padded = await sharp(resized)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0 } })
    .png()
    .toBuffer();
  const rgb = await sharp(padded)
    .extract({ left: left + pad, top: top + pad, width: SIZE, height: SIZE })
    .removeAlpha()
    .raw()
    .toBuffer();

  const rDisc = g.rDisc * scale;
  const N = SIZE * SIZE;

  // ── disc mask from the ACTUAL dark blob, not from a mean-radius circle ──
  const lum = new Float32Array(N);
  for (let p = 0; p < N; p++) lum[p] = L(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]);
  const blob = new Uint8Array(N);
  const seed = (SIZE >> 1) * SIZE + (SIZE >> 1);
  if (lum[seed] < 18) {
    const stack = new Int32Array(N);
    let sp = 0;
    stack[sp++] = seed;
    blob[seed] = 1;
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % SIZE;
      const y = (p - x) / SIZE;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        const q = ny * SIZE + nx;
        if (blob[q] || lum[q] >= 18) continue;
        blob[q] = 1;
        stack[sp++] = q;
      }
    }
  }
  // dilate by DILATE px (chebyshev is enough at this radius), then feather
  const DILATE = 2;
  const dil = new Uint8Array(N);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      if (!blob[y * SIZE + x]) continue;
      for (let oy = -DILATE; oy <= DILATE; oy++)
        for (let ox = -DILATE; ox <= DILATE; ox++) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE) dil[ny * SIZE + nx] = 1;
        }
    }
  // 3x3 box blur x2 = a ~2 px feather on the dilated edge; the *1.5 clamp
  // keeps the interior at a solid 1 so only the outer 2 px ramp
  const soft = boxBlur(boxBlur(Float32Array.from(dil), SIZE, SIZE, 1), SIZE, SIZE, 1);
  // 1 px blur on the corona luminance so a single dark pixel between two
  // streamers cannot punch a transparent speck into the ring
  const cor = boxBlur(lum, SIZE, SIZE, 1);

  const out = Buffer.alloc(N * 4);
  const c = (SIZE - 1) / 2;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const p = y * SIZE + x;
      const i3 = p * 3;
      const d = Math.hypot(x - c, y - c);
      const mDisc = clamp01(soft[p] * 1.5);
      const mCorona = clamp01(cor[p] / CORONA_T);
      // footprint cap: hard circle at R_FOOT with the same ~4 px edge the real
      // backend image has
      const mFoot = 1 - smooth(clamp01((d - (R_FOOT - 4)) / 4));
      const i4 = p * 4;
      out[i4] = rgb[i3];
      out[i4 + 1] = rgb[i3 + 1];
      out[i4 + 2] = rgb[i3 + 2];
      out[i4 + 3] = Math.round(255 * Math.min(mFoot, Math.max(mDisc, mCorona)));
    }
  return { buf: out, geom: g, scale, rDisc };
}

// ── checks that replace the iso validation ──
async function validate(pngFile) {
  const { data, info } = await sharp(pngFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const c = (w - 1) / 2;
  const rows = [];
  const ok = [];
  const say = (label, pass, detail) => {
    ok.push(pass);
    rows.push(`  ${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(30)} ${detail}`);
  };

  say('dimensions 512x512', w === SIZE && h === SIZE, `${w}x${h}`);

  // alpha census + footprint
  let opaque = 0;
  let anyAlpha = 0;
  let maxR = 0;
  let minR = 1e9;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      const d = Math.hypot(x - c, y - c);
      if (a === 255) opaque++;
      if (a > 8) {
        anyAlpha++;
        if (d > maxR) maxR = d;
      }
      if (a < 250 && d < minR) minR = d;
    }
  say('alpha channel present', anyAlpha > 0 && anyAlpha < w * h, `${((anyAlpha / (w * h)) * 100).toFixed(1)} % carries alpha`);
  say('footprint radius <= 254', maxR <= R_FOOT + 1, `max r with alpha>8 = ${maxR.toFixed(1)} px`);
  say('corners transparent', data[3] === 0 && data[(w - 1) * 4 + 3] === 0, `corner alpha ${data[3]}`);

  // disc: opaque, round, centred, featureless
  const radii = [];
  for (let a2 = 0; a2 < 720; a2++) {
    const th = (a2 * Math.PI) / 360;
    let r = 0;
    for (let t = 0; t < w / 2; t += 0.25) {
      const x = Math.round(c + Math.cos(th) * t);
      const y = Math.round(c + Math.sin(th) * t);
      if (x < 0 || y < 0 || x >= w || y >= h) break;
      const i = (y * w + x) * 4;
      if (L(data[i], data[i + 1], data[i + 2]) >= 18) break;
      if (data[i + 3] < 250) break;
      r = t;
    }
    radii.push(r);
  }
  const rM = radii.reduce((a2, b) => a2 + b, 0) / radii.length;
  const rSd = Math.sqrt(radii.reduce((a2, b) => a2 + (b - rM) ** 2, 0) / radii.length);
  say('disc round (sd < 1.5 % of r)', (rSd / rM) * 100 < 1.5, `r = ${rM.toFixed(1)} px, sd = ${((rSd / rM) * 100).toFixed(2)} %`);

  // centred: centroid of the fully-opaque dark region
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 250) continue;
      if (L(data[i], data[i + 1], data[i + 2]) >= 18) continue;
      if (Math.hypot(x - c, y - c) > rM * 1.05) continue;
      sx += x;
      sy += y;
      n++;
    }
  const dx = sx / n - c;
  const dy = sy / n - c;
  say('disc centred (< 2 px)', Math.hypot(dx, dy) < 2, `offset ${dx.toFixed(2)}, ${dy.toFixed(2)} px`);

  // no type hint: the face must carry no structure at all
  let fMax = 0;
  let fS = 0;
  let fS2 = 0;
  let fN = 0;
  let aMin = 255;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (Math.hypot(x - c, y - c) > rM * 0.92) continue;
      const i = (y * w + x) * 4;
      const v = L(data[i], data[i + 1], data[i + 2]);
      fMax = Math.max(fMax, v);
      fS += v;
      fS2 += v * v;
      fN++;
      aMin = Math.min(aMin, data[i + 3]);
    }
  const fMean = fS / fN;
  const fSd = Math.sqrt(fS2 / fN - fMean * fMean);
  say('face featureless (sd < 1.0)', fSd < 1.0, `mean ${fMean.toFixed(3)}, sd ${fSd.toFixed(3)}, max ${fMax.toFixed(0)}`);
  say('face fully opaque', aMin === 255, `min alpha inside disc = ${aMin}`);

  // No transparent hairline anywhere in the silhouette. This is the check the
// first attempt failed: every pixel of the dark blob connected to the centre
  // must be fully opaque, not just those inside the mean-radius circle.
  const blob = new Uint8Array(w * h);
  const seed = (h >> 1) * w + (w >> 1);
  let holeMin = 255;
  if (L(data[seed * 4], data[seed * 4 + 1], data[seed * 4 + 2]) < 18) {
    const stack = new Int32Array(w * h);
    let sp = 0;
    stack[sp++] = seed;
    blob[seed] = 1;
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p - x) / w;
      if (data[p * 4 + 3] < holeMin) holeMin = data[p * 4 + 3];
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (blob[q]) continue;
        const j = q * 4;
        if (L(data[j], data[j + 1], data[j + 2]) >= 18) continue;
        blob[q] = 1;
        stack[sp++] = q;
      }
    }
  }
  say('no hairline in silhouette', holeMin === 255, `min alpha over the whole dark blob = ${holeMin}`);

  // corona present + achromatic (a tinted ring would suggest a biome)
  let cMax = 0;
  let cR = 0;
  let cG = 0;
  let cB = 0;
  let cN = 0;
  let cA = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d < rM || d > R_FOOT) continue;
      const i = (y * w + x) * 4;
      const v = L(data[i], data[i + 1], data[i + 2]);
      cMax = Math.max(cMax, v);
      if (v > 40) {
        cR += data[i];
        cG += data[i + 1];
        cB += data[i + 2];
        cN++;
        cA += data[i + 3];
      }
    }
  say('corona present (max > 180)', cMax > 180, `max luma ${cMax.toFixed(0)} in the ring`);
  const br = cB / cR;
  const gr = cG / cR;
  say('corona achromatic (±4 %)', Math.abs(br - 1) < 0.04 && Math.abs(gr - 1) < 0.04, `B/R ${br.toFixed(3)}, G/R ${gr.toFixed(3)}`);
  say('bright corona is opaque', cA / cN > 250, `mean alpha of luma>40 ring px = ${(cA / cN).toFixed(1)}`);

  console.log(rows.join('\n'));
  return ok.every(Boolean);
}

(async () => {
  const tag = process.argv[2];
  if (!tag) throw new Error('usage: planet-unknown-finish.cjs <TAG> [--integrate]');
  const integrate = process.argv.includes('--integrate');
  const src = path.join(DIR_RAW, `planet_unknown_${tag}_raw.png`);
  if (!fs.existsSync(src)) throw new Error(`no such source: ${src}`);

  const { buf, geom, scale, rDisc } = await build(src);
  console.log(
    `source ${tag}: ${geom.w}x${geom.h}  centre ${geom.cx.toFixed(1)},${geom.cy.toFixed(1)}  ` +
      `rDisc ${geom.rDisc.toFixed(1)} (sd ${geom.rSdPct.toFixed(2)} %)  rCorona ${geom.rCorona}`,
  );
  console.log(`scale ${scale.toFixed(4)} (downscale)  ->  512 frame, rDisc ${rDisc.toFixed(1)} px, footprint r ${R_FOOT}`);

  const pngOut = path.join(DIR_FINAL, `${NAME}${integrate ? '' : `_${tag}`}.png`);
  await sharp(buf, { raw: { width: SIZE, height: SIZE, channels: 4 } }).png().toFile(pngOut);
  console.log(`\nchecks (replacing the iso validation) on ${path.relative(ROOT, pngOut)}:`);
  const pass = await validate(pngOut);
  console.log(`\n=> ${pass ? 'PASSED' : 'FAILED'}`);

  if (!integrate) {
    console.log('(dry run — pass --integrate to write src/assets/planets/)');
    return;
  }
  fs.mkdirSync(DIR_SRC, { recursive: true });
  await sharp(pngOut).webp(WEBP).toFile(path.join(DIR_SRC, `${NAME}.webp`));
  for (const m of MIPS)
    await sharp(pngOut).resize(m.px, m.px, { kernel: 'lanczos3' }).webp(WEBP).toFile(path.join(DIR_SRC, `${NAME}${m.suffix}.webp`));
  console.log('\nintegrated:');
  for (const f of fs.readdirSync(DIR_SRC))
    console.log(`  src/assets/planets/${f}  ${(fs.statSync(path.join(DIR_SRC, f)).size / 1024).toFixed(1)} KB`);
})();
