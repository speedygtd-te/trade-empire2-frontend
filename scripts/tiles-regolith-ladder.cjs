/**
 * REGOLITH -- STEP 2: THE TWO TASKS, BUILT AND MEASURED.
 *
 * STYLE TEST. Writes only into assets/style-test/tiles/regolith_fix/.
 * NOTHING is written to src/assets/tiles/. No cap sync, no build, no git.
 * src/assets/tiles/glacier/ is not touched at all, not even read for writing.
 *
 * TASK A -- A NEW regolith_2, DERIVED FROM regolith_0
 *   The shipped slot 2 is one enormous smooth basin filling most of the
 *   diamond; it is recognisable at a glance and repeats visibly in a field.
 *   TWO ROUTES ARE BUILT AND MEASURED AGAINST EACH OTHER, as frozen_lake did:
 *     OFFSET -- windows cut at several offsets out of plate2.png, the rimless
 *               bombed square built from a deg-5 flattened regolith_0. No flux.
 *               Legitimate and, at frozen_lake, superior.
 *     FLUX   -- windows out of the one usable kontext return (R2-SOFT), resized
 *               BACK DOWN from 1248x832 to 768x512, never up.
 *   Both are then masked with regolith's OWN diamond alpha and graded to the
 *   corpus targets.
 *
 * THE LEVEL TARGET IS THE GROUND, NOT THE MEAN.
 *   The interior mean is dragged by how much SHADOW a tile carries -- slot 3
 *   measures 139.5 against slot 2's 109.8 mostly because it has 22% dark pixels
 *   against 54%. Anchoring a new tile on a mean would force a tile with a
 *   different shadow budget onto a level that does not fit it. So the target is
 *   p70 OF THE OPAQUE INTERIOR, the same anchor crevasse and frozen_lake used,
 *   and the value is regolith_0's own 132.0 -- slot 2's source, and the low end
 *   of the corpus band (132.0 / 146.0 / 154.9).
 *
 * TASK B -- THE YELLOW CAST OUT OF regolith_3
 *   Pure grade, no flux. Shipped: B/R 0.942, G/R 0.979, sat 5.9% -- the only
 *   slot in the biome that is not exactly neutral. Three steps at B/R 1.000 /
 *   1.010 / 1.020, G/R following the corpus cool-grey line G/R = 1 + 0.60 x
 *   (B/R - 1). Level held at its own p70 154.9: this is a hue job only, no
 *   darkening, no tilt work.
 *   A FOURTH variant, T100-RAW, is tint-only with NO residual-chroma cap, so
 *   the second half of the problem is visible rather than assumed: slot 3 also
 *   carries 3.32% RESIDUAL chroma (per-pixel colour variation after its own
 *   channel means are divided out) against 0.02-0.05% for the other three. A
 *   uniform tint fixes the CAST and leaves that mottling untouched.
 *
 * MEASURED ON THE WRITTEN .webp, NEVER ON THE BUFFER (LESSONS 1).
 * sharp.cache(false) via the shared lib, because the solve loop rewrites the
 * same path repeatedly and Windows throws EINVAL otherwise.
 *
 * Usage: node scripts/tiles-regolith-ladder.cjs
 */
const fs = require('fs');
const path = require('path');
const M = require('./lib-tile-metrics.cjs');
const sharp = M.sharp;

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const WORK = path.join(ROOT, 'assets', 'style-test', 'tiles', 'regolith_fix');
const SRCD = path.join(WORK, 'src');
const PLATE = path.join(WORK, 'plate');
const OUT2 = path.join(WORK, 'slot2');
const OUT3 = path.join(WORK, 'slot3');

const TILE_W = 512, TILE_H = 256;
const PW = 768, PH = 512;
const K_CORPUS = 0.60;                 // G/R = 1 + K*(B/R - 1), snow_peak's slope
const grFor = (br) => 1 + K_CORPUS * (br - 1);
const CHROMA_CAP = 0.012;              // residual-chroma ceiling, the glacier run's constant
const SOLVE_PASSES = 8;

// TASK A targets. p70 132.0 = regolith_0's own ground level (slot 2's source).
const A_P70 = 132.0, A_BR = 1.000, A_GR = 1.000;
// TASK B: level held where slot 3 already is.
const B_P70 = 154.9;

const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);

/**
 * BLOB -- how much LOW-FREQUENCY brightness swing the tile carries in its own
 * interior. This is the number that says "one big crater dominates this tile":
 * a degree-5 polynomial is fitted to the interior luma and the standard
 * deviation OF THAT FITTED SURFACE is reported. Fine grain does not enter it,
 * a single wide basin does. Reported next to sd (total) so the ratio is visible.
 */
function blobOf(data, ch, w, h) {
  const terms = M.polyTerms(5), K = terms.length;
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const A = Array.from({ length: K }, () => new Float64Array(K));
  const B = new Float64Array(K);
  const basis = new Float64Array(K);
  for (let y = 0; y < h; y++) {
    const ny = (y - cy) / cy;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      if (data[i + 3] < 250) continue;
      const nx = (x - cx) / cx;
      for (let k = 0; k < K; k++) basis[k] = Math.pow(nx, terms[k][0]) * Math.pow(ny, terms[k][1]);
      const L = M.L709(data[i], data[i + 1], data[i + 2]);
      for (let a = 0; a < K; a++) {
        B[a] += basis[a] * L;
        for (let b2 = a; b2 < K; b2++) A[a][b2] += basis[a] * basis[b2];
      }
    }
  }
  for (let a = 0; a < K; a++) for (let b2 = 0; b2 < a; b2++) A[a][b2] = A[b2][a];
  const coef = M.solveLin(A.map((r) => Array.from(r)), Array.from(B));
  const vals = [];
  for (let y = 0; y < h; y++) {
    const ny = (y - cy) / cy;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      if (data[i + 3] < 250) continue;
      const nx = (x - cx) / cx;
      let v = 0;
      for (let k = 0; k < K; k++) v += coef[k] * Math.pow(nx, terms[k][0]) * Math.pow(ny, terms[k][1]);
      vals.push(v);
    }
  }
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) * (b - m), 0) / vals.length);
  vals.sort((a, b) => a - b);
  return { sd, pp: vals[vals.length - 1] - vals[0] };
}
async function blobOfFile(file) {
  const r = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return blobOf(r.data, r.info.channels, r.info.width, r.info.height);
}

/** the diamond alpha of the shipped biome, reused verbatim so the geometry matches */
async function diamondAlpha() {
  const r = await sharp(fs.readFileSync(path.join(SRCD, 'regolith_0_src.webp')))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const a = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    a[p * 4] = 255; a[p * 4 + 1] = 255; a[p * 4 + 2] = 255;
    a[p * 4 + 3] = r.data[p * ch + 3];
  }
  return sharp(a, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

/**
 * Solve tint / level so the WRITTEN file hits (p70T, brT, grT) with residual
 * chroma <= CHROMA_CAP. NO LIGHT PLANE IS IMPOSED: regolith is first-batch and
 * this round is explicitly not a tilt intervention, so p = q = 0 throughout and
 * whatever ramp the source carries is left alone.
 */
async function solveTile(srcPng, outFile, p70T, brT, grT, capChroma) {
  const raw = await sharp(srcPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const CH = raw.info.channels, W = raw.info.width, H = raw.info.height;
  const S = raw.data;
  const b0 = M.statsRaw(S, CH, W, H);
  const desat = (capChroma && b0.chromaRes > CHROMA_CAP) ? CHROMA_CAP / b0.chromaRes : 1;
  const tint = [1, (grT * b0.rgb[0]) / b0.rgb[1], (brT * b0.rgb[0]) / b0.rgb[2]];
  let G = p70T / b0.p70;
  let m = null, png = null;
  for (let pass = 0; pass < SOLVE_PASSES; pass++) {
    const buf = M.grade(S, CH, W, H, desat, tint, G, 0, 0);
    png = await sharp(buf, { raw: { width: W, height: H, channels: CH } }).png().toBuffer();
    await sharp(png).webp(M.WEBP).toFile(outFile);
    m = await M.statsOf(outFile);
    if (pass === SOLVE_PASSES - 1) break;
    G *= p70T / m.p70;
    tint[2] *= brT / m.br;
    tint[1] *= grT / m.gr;
  }
  m.png = png;
  m.desat = desat;
  return m;
}

async function enrich(file) {
  const s = await M.statsOf(file);
  s.micro = await M.microContrast(null, file);
  s.rim = await M.rimHalo(file);
  s.blob = await blobOfFile(file);
  return s;
}
const ROW = (tag, s) =>
  '  ' + String(tag).padEnd(16) + f1(s.intLum).padStart(7) + f1(s.p70).padStart(8) +
  f1(100 * s.dark).padStart(7) + f3(s.br).padStart(8) + f3(s.gr).padStart(7) +
  f1(100 * s.sat).padStart(6) + f2(100 * s.chromaRes).padStart(6) + f2(100 * s.blow).padStart(7) +
  f1(s.sd).padStart(6) + f1(s.blob.sd).padStart(7) + f1(s.blob.pp).padStart(7) +
  f2(s.micro).padStart(8) + f1(s.tiltX).padStart(7) + f1(s.tiltY).padStart(7) + f2(s.rim).padStart(7);
const HEAD =
  '  candidate           intL     p70   dark%     B/R    G/R  sat%  chr%  blow%    sd   blob  blobPP  micro8  tiltX  tiltY    rim';

(async () => {
  fs.mkdirSync(OUT2, { recursive: true });
  fs.mkdirSync(OUT3, { recursive: true });
  const MASK = await diamondAlpha();

  // ══════════════════════════════════════════════════════════════════
  // reference: the three slots that are NOT being touched
  // ══════════════════════════════════════════════════════════════════
  console.log('REFERENCE -- the shipped slots (0, 1, 3 stay exactly as they are)');
  console.log(HEAD);
  const REF = {};
  for (const n of [0, 1, 2, 3]) {
    const f = path.join(TILES, 'regolith', 'regolith_' + n + '.webp');
    const s = await enrich(f);
    s.micro = await M.microContrast(f.replace(/\.webp$/, '@eighth.webp'), f);
    REF[n] = s;
    console.log(ROW('regolith_' + n + (n === 2 ? ' (to go)' : ''), s));
  }
  console.log('');

  // ══════════════════════════════════════════════════════════════════
  // TASK A -- candidates for the new slot 2
  // ══════════════════════════════════════════════════════════════════
  const plate2 = fs.readFileSync(path.join(PLATE, 'plate2.png'));
  const fluxRaw = path.join(PLATE, 'R2-SOFT_kraw.png');
  // resize BACK DOWN to the plate size -- never up (LESSONS 3)
  const fluxMd = await sharp(fs.readFileSync(fluxRaw)).metadata();
  if (fluxMd.width < PW || fluxMd.height < PH) throw new Error('flux return is SMALLER than the plate; upscaling is not allowed');
  const fluxPlate = await sharp(fs.readFileSync(fluxRaw)).resize(PW, PH, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  console.log('[flux] R2-SOFT ' + fluxMd.width + 'x' + fluxMd.height + ' -> ' + PW + 'x' + PH + ' (down, lanczos3)');

  // windows: the plate is 768x512 and the tile 512x256, so the offsets run
  // 0..256 in each axis. Four corners plus the centre.
  const OFF = [
    { tag: 'a', x: 0, y: 0 }, { tag: 'b', x: 256, y: 0 },
    { tag: 'c', x: 0, y: 256 }, { tag: 'd', x: 256, y: 256 },
    { tag: 'e', x: 128, y: 128 },
  ];
  const CAND = [];
  for (const src of [{ id: 'OFF', buf: plate2 }, { id: 'FLX', buf: fluxPlate }]) {
    for (const o of OFF) {
      const id = src.id + '-' + o.tag;
      const win = await sharp(src.buf).extract({ left: o.x, top: o.y, width: TILE_W, height: TILE_H })
        .ensureAlpha().composite([{ input: MASK, blend: 'dest-in' }]).png().toBuffer();
      const out = path.join(OUT2, id + '.webp');
      const m = await solveTile(win, out, A_P70, A_BR, A_GR, true);
      const s = await enrich(out);
      CAND.push({ id, src: src.id, off: o, file: out, s, desat: m.desat });
    }
  }
  console.log('');
  console.log('TASK A -- new slot 2, both routes, all graded to p70 ' + A_P70 + ' / B/R ' + f3(A_BR) + ' / G/R ' + f3(A_GR));
  console.log('  OFF-* = window of plate2.png (no flux).   FLX-* = window of the R2-SOFT kontext return.');
  console.log(HEAD);
  for (const c of CAND) console.log(ROW(c.id, c.s));
  console.log('  ' + '-'.repeat(112));
  console.log(ROW('[old slot 2]', REF[2]));
  console.log(ROW('[slot 0 src]', REF[0]));
  console.log('');
  const byBlob = CAND.slice().sort((a, b) => a.s.blob.sd - b.s.blob.sd);
  console.log('  quietest by blob (low-freq swing; the old slot 2 sits at ' + f1(REF[2].blob.sd) + ', slot 0 at ' + f1(REF[0].blob.sd) + '):');
  for (const c of byBlob.slice(0, 5)) console.log('    ' + c.id + '  blob ' + f1(c.s.blob.sd) + '  micro8 ' + f2(c.s.micro) + '  blow ' + f2(100 * c.s.blow) + '%');
  console.log('');

  // ══════════════════════════════════════════════════════════════════
  // TASK B -- the yellow cast out of slot 3
  // ══════════════════════════════════════════════════════════════════
  const src3 = await sharp(fs.readFileSync(path.join(SRCD, 'regolith_3_src.webp'))).png().toBuffer();
  const STEPS = [
    { id: 'T100', br: 1.000, cap: true, label: 'neutral, corpus chroma cap' },
    { id: 'T101', br: 1.010, cap: true, label: 'a shade cool, corpus chroma cap' },
    { id: 'T102', br: 1.020, cap: true, label: 'two shades cool, corpus chroma cap' },
    { id: 'T100-RAW', br: 1.000, cap: false, label: 'neutral, TINT ONLY -- no chroma cap, to show what the cap does' },
  ];
  const S3 = [];
  for (const st of STEPS) {
    const out = path.join(OUT3, 'regolith_3_' + st.id + '.webp');
    const m = await solveTile(src3, out, B_P70, st.br, grFor(st.br), st.cap);
    const s = await enrich(out);
    S3.push({ st, file: out, s, desat: m.desat });
  }
  console.log('TASK B -- regolith_3 hue steps, level held at its own p70 ' + B_P70 + ', pure grade');
  console.log(HEAD);
  console.log(ROW('[shipped]', REF[3]));
  for (const r of S3) console.log(ROW(r.st.id, r.s) + '   desat ' + f3(r.desat));
  console.log('');
  console.log('  the neutral neighbours it has to sit beside: slot 0 / 1 B/R ' + f3(REF[0].br) + ' / ' + f3(REF[1].br) +
    ', residual chroma ' + f2(100 * REF[0].chromaRes) + '% / ' + f2(100 * REF[1].chromaRes) + '%');
  console.log('');

  // ══════════════════════════════════════════════════════════════════
  // PANELS
  // ══════════════════════════════════════════════════════════════════
  const PAD = 14;
  // -- A: all ten slot-2 candidates, 1:1, five per row ---------------------
  {
    const cols = 5, SW = PAD + cols * (TILE_W + PAD);
    const comp = [];
    comp.push({ input: M.label('TASK A -- new regolith_2, ten candidates 1:1. top row OFF-* (windows of the flattened bombed plate, no flux), bottom row FLX-* (windows of the R2-SOFT kontext return).', SW - 2 * PAD, 17, '#8b949e'), left: PAD, top: 6 });
    let y = 34;
    CAND.forEach((c, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = PAD + col * (TILE_W + PAD), ty = y + row * (TILE_H + 26);
      comp.push({ input: fs.readFileSync(c.file), left: x, top: ty });
      comp.push({ input: M.label(c.id + '  blob ' + f1(c.s.blob.sd) + '  micro8 ' + f2(c.s.micro) + '  blow ' + f2(100 * c.s.blow) + '%', TILE_W, 14, '#c9d1d9'), left: x, top: ty + TILE_H + 3 });
    });
    y += 2 * (TILE_H + 26) + 10;
    comp.push({ input: M.label('for comparison: the shipped slot 2 (going), and slot 0 (its source)', SW - 2 * PAD, 15, '#8b949e'), left: PAD, top: y });
    y += 22;
    comp.push({ input: fs.readFileSync(path.join(SRCD, 'regolith_2_src.webp')), left: PAD, top: y });
    comp.push({ input: M.label('shipped slot 2   blob ' + f1(REF[2].blob.sd), TILE_W, 14, '#ff7b72'), left: PAD, top: y + TILE_H + 3 });
    comp.push({ input: fs.readFileSync(path.join(SRCD, 'regolith_0_src.webp')), left: PAD + TILE_W + PAD, top: y });
    comp.push({ input: M.label('slot 0 (source)  blob ' + f1(REF[0].blob.sd), TILE_W, 14, '#7ee787'), left: PAD + TILE_W + PAD, top: y + TILE_H + 3 });
    await sharp({ create: { width: SW, height: y + TILE_H + 30, channels: 4, background: M.BGA } })
      .composite(comp).png().toFile(path.join(WORK, '_A_candidates.png'));
    console.log('[panel] _A_candidates.png');
  }
  // -- B: the slot-3 hue steps side by side --------------------------------
  {
    const cols = 5, SW = PAD + cols * (TILE_W + PAD);
    const comp = [];
    comp.push({ input: M.label('TASK B -- regolith_3, the yellow cast. left: as shipped. then the three hue steps, and the tint-only variant.', SW - 2 * PAD, 17, '#8b949e'), left: PAD, top: 6 });
    const y = 34;
    const items = [{ f: path.join(SRCD, 'regolith_3_src.webp'), t: 'shipped  B/R ' + f3(REF[3].br) + '  chr ' + f2(100 * REF[3].chromaRes) + '%  sat ' + f1(100 * REF[3].sat) + '%', c: '#ff7b72' }]
      .concat(S3.map((r) => ({ f: r.file, t: r.st.id + '  B/R ' + f3(r.s.br) + '  chr ' + f2(100 * r.s.chromaRes) + '%  sat ' + f1(100 * r.s.sat) + '%', c: '#7ee787' })));
    items.forEach((it, i) => {
      const x = PAD + i * (TILE_W + PAD);
      comp.push({ input: fs.readFileSync(it.f), left: x, top: y });
      comp.push({ input: M.label(it.t, TILE_W, 14, it.c), left: x, top: y + TILE_H + 3 });
    });
    await sharp({ create: { width: SW, height: y + TILE_H + 30, channels: 4, background: M.BGA } })
      .composite(comp).png().toFile(path.join(WORK, '_B_hue_steps.png'));
    console.log('[panel] _B_hue_steps.png');
  }

  fs.writeFileSync(path.join(WORK, '_ladder_numbers.json'), JSON.stringify({
    when: new Date().toISOString(),
    taskA: CAND.map((c) => ({ id: c.id, blob: c.s.blob.sd, blobPP: c.s.blob.pp, micro: c.s.micro, blow: c.s.blow, sd: c.s.sd, intL: c.s.intLum, p70: c.s.p70, br: c.s.br, gr: c.s.gr, tiltX: c.s.tiltX, tiltY: c.s.tiltY })),
    taskB: S3.map((r) => ({ id: r.st.id, br: r.s.br, gr: r.s.gr, sat: r.s.sat, chromaRes: r.s.chromaRes, intL: r.s.intLum, p70: r.s.p70, blow: r.s.blow, desat: r.desat })),
    ref: [0, 1, 2, 3].map((n) => ({ slot: n, intL: REF[n].intLum, p70: REF[n].p70, br: REF[n].br, gr: REF[n].gr, blob: REF[n].blob.sd, micro: REF[n].micro, blow: REF[n].blow })),
  }, null, 2));
  console.log('done');
})();
