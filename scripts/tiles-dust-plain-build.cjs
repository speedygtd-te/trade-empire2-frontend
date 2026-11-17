/**
 * DUST_PLAIN -- STEP 2: BUILD. Four targeted steps, no redesign.
 *
 *   1. Slot 0 loses some of its yellow: B/R 0.706 -> the family band. A ladder
 *      of three rungs is built and sheeted so the step can be judged, not
 *      asserted.
 *   2. Slot 1 keeps its content untouched -- only the light plane is normalised.
 *   3. Slots 2 and 3 are rebuilt: slot 2 out of slot 0 (the grainy one), slot 3
 *      out of slot 1 (the smooth one), so the spread Rudi asked for survives.
 *   4. One light plane over all four: gx 0 everywhere, one common gy.
 *
 * WHY THE ISO-TORUS ROLL AND NOT flux
 *   The brief says to try window offset from a plate first, and for dust_plain
 *   the plate is already in hand: the two good slots. A 512x256 diamond tiles
 *   the plane on the lattice (512,0)/(256,128), so the tile's content already
 *   IS a plate -- a plate wrapped on a torus. Rolling it is an offset window in
 *   the exact sense frozen_lake used, with three advantages over cutting a
 *   rectangular plate: no resampling, no mirror symmetry, and no invented
 *   pixels. The only new artefact is that two parts of the tile that did not
 *   touch inside the diamond now touch -- but in the game they already touch,
 *   across the tile boundary. That is the tile's own self-seam, measured here
 *   before the roll is used.
 *
 * ORDER OF OPERATIONS PER SOURCE (all of it before any roll)
 *   edgeRepair(3)     the outermost ring carries libwebp's edge artefact; a
 *                     roll would drag that hairline into the middle of the tile
 *   flattenRadial     divides out the diamond-radial bowl -- this is the rim
 *                     seam the brief wants off the new slots
 *   flattenPoly(5)    divides out the broad blobs and the tile's own ramp
 *   solveTile         imposes p70 / B/R / G/R / gx / gy on the WRITTEN webp
 *
 * MIRROR CONVENTION, read off the shipped corpus in
 * scripts/tiles-dust-plain-audit.cjs and not assumed: over the 48 finished
 * biomes the best-|NCC| orientation of slot2-vs-slot0 and slot3-vs-slot1 is
 * flop 40 times, id 6, flip 1, r180 1. So slots 2/3 are flopped. Never flip --
 * that inverts the upper-left lighting. dust_plain itself is NOT mirrored
 * today (all four slots independent), which is why the convention had to come
 * from the corpus.
 *
 * Nothing here writes to src/assets/tiles/.
 *
 * Usage: node scripts/tiles-dust-plain-build.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const L = require('./tiles-dust-plain-lib.cjs');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles', 'dust_plain');
const WORK = path.join(ROOT, 'assets', 'style-test', 'tiles', 'dust_plain');
const BUILD = path.join(WORK, 'build');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const TAG = '_dust_plain_';
const { f1, f2, f3, TILE_W, TILE_H, WEBP, BGA } = L;

// ---- the decisions -------------------------------------------------------
const P70T = 161.5;                 // p70 of the two good slots: 161.2 / 162.4
const BR_FAMILY = 0.82;             // brief's band 0.80-0.83; slot 2 sits at 0.825
const K_WARM = 0.50;                // (G/R-1)/(B/R-1). dust_plain's own slots
                                    // measure 0.414/0.504/0.530/0.476, corpus
                                    // warm median 0.456, tundra 0.522. NOT the
                                    // ICE k of 0.60, which was fitted above B/R 1.
const GR_OF = (br) => 1 + K_WARM * (br - 1);
const SLOT0_BLUES = [0.75, 0.79, 0.82];
/** corpus tiltY unit (half-mean top-bottom, tundra 3.0 / frozen_lake 0.0);
 *  gy = -1.5 x that, see tiles-dust-plain-lib.cjs */
const RAMPS = [0, 3, 6];
const gyOf = (r) => -1.5 * r;
const FLOP = [false, false, true, true];
/** candidate rolls, in pixels. Only non-lattice shifts change anything;
 *  (256,128) and (512,0) are lattice vectors and are the identity. */
const ROLLS = [[256, 0], [0, 128], [128, 64], [384, 64], [128, 192]];

const av = (a, k) => a.reduce((x, s) => x + s[k], 0) / a.length;

async function decode(file) {
  const r = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: r.data, w: r.info.width, h: r.info.height, ch: r.info.channels };
}
async function toPng(o) {
  return sharp(o.data, { raw: { width: o.w, height: o.h, channels: o.ch } }).png().toBuffer();
}
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');

(async () => {
  fs.mkdirSync(BUILD, { recursive: true });
  fs.mkdirSync(path.join(WORK, 'src'), { recursive: true });

  // ======================================================================
  // A. freeze + normalise the two good sources
  // ======================================================================
  console.log('[A] sources frozen and normalised\n');
  const SRC = [];
  for (const n of [0, 1]) {
    const live = fs.readFileSync(path.join(TILES, 'dust_plain_' + n + '.webp'));
    const froz = path.join(WORK, 'src', 'dust_plain_' + n + '_src.webp');
    if (fs.existsSync(froz) && !fs.readFileSync(froz).equals(live)) throw new Error('slot ' + n + ' moved since the audit');
    fs.writeFileSync(froz, live);
    const o = await decode(froz);
    const before = L.statsRaw(o.data, o.ch, o.w, o.h);
    let d = L.edgeRepair(o.data, o.ch, o.w, o.h, 3);
    d = L.flattenRadial(d, o.ch, o.w, o.h, 48, 4);
    d = L.flattenPoly(d, o.ch, o.w, o.h, 5);
    const after = L.statsRaw(d, o.ch, o.w, o.h);
    SRC.push({ n: n, o: o, norm: d, before: before, after: after, md5: md5(live) });
    console.log('  slot' + n + '  md5 ' + md5(live).slice(0, 12));
    console.log('     before   p70 ' + f1(before.p70) + '  B/R ' + f3(before.br) + '  sd ' + f1(before.sd) +
      '  tiltX ' + f1(before.gx).padStart(6) + '  tiltY ' + f1(before.gy).padStart(6) + '  rim ' + f1(before.rim).padStart(6));
    console.log('     flattened p70 ' + f1(after.p70) + '  B/R ' + f3(after.br) + '  sd ' + f1(after.sd) +
      '  tiltX ' + f1(after.gx).padStart(6) + '  tiltY ' + f1(after.gy).padStart(6) + '  rim ' + f1(after.rim).padStart(6) +
      '   (buffer numbers; the webp round-trip is solved for later)');
  }

  // self-seam of each normalised source: the exact seam a roll would move
  // inside the tile. Measured by laying the ONE tile out in the lattice.
  console.log('\n  self-seam of each normalised source (a field of that tile alone):');
  for (const s of SRC) {
    const png = await toPng({ data: s.norm, w: s.o.w, h: s.o.h, ch: s.o.ch });
    const g = await L.gridOf([png, png, png, png]);
    s.selfSeam = g.bs;
    console.log('     slot' + s.n + '  step/rough ' + f2(g.bs.step) + '/' + f2(g.bs.rough) + '  ratio ' + f2(g.bs.ratio));
  }
  {
    const raw = [];
    for (const n of [0, 1]) { const b = fs.readFileSync(path.join(WORK, 'src', 'dust_plain_' + n + '_src.webp')); const g = await L.gridOf([b, b, b, b]); raw.push(g.bs); }
    console.log('     for contrast, the SHIPPED slots un-normalised: slot0 ratio ' + f2(raw[0].ratio) + '  slot1 ratio ' + f2(raw[1].ratio));
  }

  // ======================================================================
  // B. the roll: pick one vector per source
  // ======================================================================
  console.log('\n[B] iso-torus roll -- candidates, NCC of the rolled tile against its own source');
  const cands = [];
  for (const s of SRC) {
    for (const R of ROLLS) {
      const d = L.latticeRoll(s.norm, s.o.ch, s.o.w, s.o.h, R[0], R[1]);
      const a = await toPng({ data: d, w: s.o.w, h: s.o.h, ch: s.o.ch });
      const b = await toPng({ data: s.norm, w: s.o.w, h: s.o.h, ch: s.o.ch });
      const v = await L.nccAll(a, b);
      const st = L.statsRaw(d, s.o.ch, s.o.w, s.o.h);
      cands.push({ src: s.n, roll: R, png: a, data: d, ncc: v, sd: st.sd });
      console.log('   slot' + s.n + ' roll (' + R[0] + ',' + R[1] + ')   id ' + f3(v.id).padStart(6) +
        '  flop ' + f3(v.flop).padStart(6) + '  flip ' + f3(v.flip).padStart(6) + '  r180 ' + f3(v.r180).padStart(6) +
        '   sd ' + f1(st.sd));
    }
  }
  // pick, per source, the roll with the smallest worst-orientation correlation
  const worst = (c) => Math.max.apply(null, Object.keys(c.ncc).map((k) => Math.abs(c.ncc[k])));
  const pick0 = cands.filter((c) => c.src === 0).sort((a, b) => worst(a) - worst(b))[0];
  const pick1 = cands.filter((c) => c.src === 1).sort((a, b) => worst(a) - worst(b))[0];
  console.log('   -> slot2 from slot0, roll (' + pick0.roll.join(',') + ')  worst |NCC| ' + f3(worst(pick0)));
  console.log('   -> slot3 from slot1, roll (' + pick1.roll.join(',') + ')  worst |NCC| ' + f3(worst(pick1)));

  const PRE = [
    { data: SRC[0].norm, o: SRC[0].o, from: 'slot0 as-is' },
    { data: SRC[1].norm, o: SRC[1].o, from: 'slot1 as-is' },
    { data: pick0.data, o: SRC[0].o, from: 'slot0 rolled (' + pick0.roll.join(',') + ')' },
    { data: pick1.data, o: SRC[1].o, from: 'slot1 rolled (' + pick1.roll.join(',') + ')' },
  ];

  // ======================================================================
  // C. the ladder: one rung per ramp
  // ======================================================================
  async function buildRung(gyT, brT, dir) {
    fs.mkdirSync(dir, { recursive: true });
    const grT = GR_OF(brT);
    const slots = [];
    for (let n = 0; n < 4; n++) {
      const P = PRE[n];
      const pre = path.join(dir, 'pre_' + n + '.webp');
      const m = await L.solveTile(P.data, P.o.w, P.o.h, P.o.ch, pre, P70T, brT, grT, 0, gyT, 9);
      const png = FLOP[n] ? await sharp(m.png).flop().png().toBuffer() : m.png;
      const file = path.join(dir, 'dust_plain_' + n + '.webp');
      await sharp(png).webp(WEBP).toFile(file);
      await sharp(png).resize(64, 32, { fit: 'fill' }).webp(WEBP).toFile(file.replace(/\.webp$/, '@eighth.webp'));
      fs.writeFileSync(path.join(dir, 'dust_plain_' + n + '.png'), png);
      const s = await L.statsOf(file);
      s.micro = await L.microContrast(file.replace(/\.webp$/, '@eighth.webp'));
      s.rimHalo = await L.rimHalo(file);
      s.png = png; s.prePng = m.png; s.file = file; s.from = P.from;
      slots.push(s);
    }
    const g = await L.gridOf(slots.map((s) => s.png));
    return { slots, grid: g, gy: gyT, br: brT, dir };
  }

  console.log('\n[C] TILT LADDER -- gx 0 on every rung, gy varied. The brief asks for the');
  console.log('    raster value at several tilts; on the two smooth slots the raster value');
  console.log('    is nearly worthless (LESSONS 5) so the seam ratio decides.\n');
  console.log('   ramp   gy      p70    B/R    G/R   micro8  blow%    sd    rim    grid_play  coh   seam step/rough  RATIO');
  const rungs = [];
  for (const r of RAMPS) {
    const R = await buildRung(gyOf(r), BR_FAMILY, path.join(BUILD, 'ramp' + r));
    R.ramp = r;
    rungs.push(R);
    console.log('   ' + String(r).padEnd(5) + f1(gyOf(r)).padStart(6) + f1(av(R.slots, 'p70')).padStart(8) +
      '  ' + f3(av(R.slots, 'br')) + '  ' + f3(av(R.slots, 'gr')) + f2(av(R.slots, 'micro')).padStart(8) +
      f2(100 * av(R.slots, 'blow')).padStart(7) + f1(av(R.slots, 'sd')).padStart(7) + f1(av(R.slots, 'rim')).padStart(7) +
      f2(R.grid.play.gridTot).padStart(11) + f2(R.grid.play.gridCoh).padStart(6) +
      ('   ' + f2(R.grid.bs.step) + '/' + f2(R.grid.bs.rough)).padStart(16) + f2(R.grid.bs.ratio).padStart(8));
  }

  // per-slot detail for every rung
  console.log('\n   per slot');
  for (const R of rungs) {
    console.log('   ramp ' + R.ramp);
    for (let n = 0; n < 4; n++) { const s = R.slots[n];
      console.log('      slot' + n + (FLOP[n] ? ' flop' : '     ') + '  mean ' + f1(s.intLum).padStart(6) + '  p70 ' + f1(s.p70).padStart(6) +
        '  B/R ' + f3(s.br) + '  G/R ' + f3(s.gr) + '  sat ' + f1(100 * s.sat).padStart(5) + '%  blow ' + f2(100 * s.blow).padStart(5) + '%' +
        '  sd ' + f1(s.sd).padStart(5) + '  tiltX ' + f1(s.gx).padStart(6) + '  tiltY ' + f1(s.gy).padStart(6) +
        '  rim ' + f1(s.rim).padStart(6) + '  micro8 ' + f2(s.micro) + '   <- ' + s.from); }
  }

  // ======================================================================
  // D. sheets
  // ======================================================================
  const sheetFor = async (R, name, title) => {
    const SW = 2200, PAD = 18;
    const comp = []; let y = PAD;
    const ln = (t, size, fill) => { size = size || 13; comp.push({ input: L.label(t, SW - PAD * 2, size, fill || '#c9d1d9'), left: PAD, top: y }); y += size + 7; };
    ln(title, 19, '#7ee787');
    ln('p70 ' + f1(av(R.slots, 'p70')) + '  B/R ' + f3(av(R.slots, 'br')) + '  G/R ' + f3(av(R.slots, 'gr')) +
      '  micro8 ' + f2(av(R.slots, 'micro')) + '  blow ' + f2(100 * av(R.slots, 'blow')) + '%  rim ' + f1(av(R.slots, 'rim')) +
      '   grid_play ' + f2(R.grid.play.gridTot) + ' coh ' + f2(R.grid.play.gridCoh) +
      '   seam ' + f2(R.grid.bs.step) + '/' + f2(R.grid.bs.rough) + ' ratio ' + f2(R.grid.bs.ratio), 14, '#ffa657');
    for (let n = 0; n < 4; n++) { const s = R.slots[n];
      ln('   slot' + n + '  p70 ' + f1(s.p70) + '  B/R ' + f3(s.br) + '  sd ' + f1(s.sd) + '  tiltX ' + f1(s.gx) +
        '  tiltY ' + f1(s.gy) + '  rim ' + f1(s.rim) + '  micro8 ' + f2(s.micro) + '   <- ' + s.from, 13, '#8b949e'); }
    y += 6;
    ln('THE FOUR SLOTS   (0,1 as cut  |  2,3 rolled then flopped)', 15, '#7ee787');
    for (let n = 0; n < 4; n++) comp.push({ input: await sharp(R.slots[n].png).resize(512, 256, { fit: 'fill' }).png().toBuffer(), left: PAD + n * 522, top: y });
    y += 256 + 10;
    ln('2x2 -- fixed repeat, full res', 15, '#7ee787');
    const F22 = await L.isoField(R.slots.map((s) => s.png), TILE_W, TILE_H, 6, 4, (r, c) => (r % 2) * 2 + (c % 2));
    let sc = Math.min(1, (SW - PAD * 2) / F22.w);
    comp.push({ input: await sharp(F22.png).resize(Math.round(F22.w * sc), Math.round(F22.h * sc)).png().toBuffer(), left: PAD, top: y });
    y += Math.round(F22.h * sc) + 12;
    ln('INTERLOCKED MOSAIC -- random slots, full res', 15, '#7ee787');
    const rndF = L.mulberry32(90210);
    const FD = await L.isoField(R.slots.map((s) => s.png), TILE_W, TILE_H, 6, 4, () => Math.floor(rndF() * 4));
    sc = Math.min(1, (SW - PAD * 2) / FD.w);
    comp.push({ input: await sharp(FD.png).resize(Math.round(FD.w * sc), Math.round(FD.h * sc)).png().toBuffer(), left: PAD, top: y });
    y += Math.round(FD.h * sc) + 12;
    ln('PLAY SCALE 48x24      |      under the vacuum darkening', 15, '#7ee787');
    const rndP = L.mulberry32(90210);
    const PD = await L.isoField(R.slots.map((s) => s.png), L.PLAY_W, L.PLAY_H, 40, 22, () => Math.floor(rndP() * 4));
    comp.push({ input: PD.png, left: PAD, top: y });
    comp.push({ input: await L.vacuum(PD.png), left: PAD + PD.w + 24, top: y });
    y += PD.h + PAD;
    fs.writeFileSync(path.join(ST, TAG + name + '.png'),
      await sharp({ create: { width: SW, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[sheet] ' + TAG + name + '.png');
  };
  console.log('');
  for (const R of rungs) await sheetFor(R, 'RAMP' + R.ramp, 'dust_plain -- ramp ' + R.ramp + ' (gy ' + f1(gyOf(R.ramp)) + '), gx 0, B/R ' + f2(BR_FAMILY));

  // ---- slot 0 de-yellow ladder ------------------------------------------
  console.log('\n[D] SLOT 0 DE-YELLOW LADDER -- three rungs, ramp fixed at 0 for the comparison');
  const s0 = { data: SRC[0].norm, o: SRC[0].o };
  const s0dir = path.join(BUILD, 'slot0_blue');
  fs.mkdirSync(s0dir, { recursive: true });
  const s0rows = [];
  for (const br of SLOT0_BLUES.concat([BR_FAMILY])) {
    const id = 'B' + Math.round(br * 100);
    const file = path.join(s0dir, 'dust_plain_0_' + id + '.webp');
    const m = await L.solveTile(s0.data, s0.o.w, s0.o.h, s0.o.ch, file, P70T, br, GR_OF(br), 0, 0, 9);
    const st = await L.statsOf(file);
    s0rows.push({ id, br, st, png: m.png });
    console.log('   ' + id + '  B/R ' + f3(st.br) + '  G/R ' + f3(st.gr) + '  sat ' + f1(100 * st.sat) + '%  p70 ' + f1(st.p70) +
      '  mean ' + f1(st.intLum) + '  (shipped slot0: B/R 0.706, sat 29.6%)');
  }
  {
    const SW = 2200, PAD = 18;
    const comp = []; let y = PAD;
    const ln = (t, size, fill) => { size = size || 13; comp.push({ input: L.label(t, SW - PAD * 2, size, fill || '#c9d1d9'), left: PAD, top: y }); y += size + 7; };
    ln('DUST_PLAIN SLOT 0 -- HOW MUCH YELLOW COMES OFF', 20, '#79c0ff');
    ln('left: shipped (B/R 0.706, sat 29.6%).  then three rungs.  right of each: slot 1 for reference (B/R 0.805).', 13, '#8b949e');
    y += 6;
    const shipped = fs.readFileSync(path.join(WORK, 'src', 'dust_plain_0_src.webp'));
    const one = fs.readFileSync(path.join(WORK, 'src', 'dust_plain_1_src.webp'));
    const row = [{ b: shipped, t: 'SHIPPED  B/R 0.706  sat 29.6%' }]
      .concat(s0rows.map((r) => ({ b: r.png, t: r.id + '  B/R ' + f3(r.st.br) + '  sat ' + f1(100 * r.st.sat) + '%' })))
      .concat([{ b: one, t: 'slot 1 (unchanged) B/R 0.805' }]);
    const CW = Math.floor((SW - PAD * 2) / row.length) - 8;
    const CH = Math.round(CW / 2);
    for (let i = 0; i < row.length; i++) comp.push({ input: L.label(row[i].t, CW, 12, '#ffa657'), left: PAD + i * (CW + 8), top: y });
    y += 20;
    for (let i = 0; i < row.length; i++) comp.push({ input: await sharp(row[i].b).resize(CW, CH, { fit: 'fill' }).png().toBuffer(), left: PAD + i * (CW + 8), top: y });
    y += CH + 14;
    ln('THE SAME AT PLAY SCALE, each rung as a uniform field (48x24)', 15, '#7ee787');
    for (let i = 0; i < row.length; i++) {
      const F = await L.isoField([row[i].b, row[i].b, row[i].b, row[i].b], L.PLAY_W, L.PLAY_H, 14, 8, () => 0);
      comp.push({ input: F.png, left: PAD + i * (CW + 8), top: y });
    }
    y += 14 * (L.PLAY_H / 2) + L.PLAY_H + PAD;
    fs.writeFileSync(path.join(ST, TAG + 'SLOT0_BLUE.png'),
      await sharp({ create: { width: SW, height: y, channels: 4, background: BGA } }).composite(comp).png().toBuffer());
    console.log('[sheet] ' + TAG + 'SLOT0_BLUE.png');
  }

  // ---- cross-correlation of the final four, per rung ---------------------
  console.log('\n[E] CROSS-CORRELATION of the four written slots (identity orientation), ramp 0 rung');
  const R0 = rungs.find((r) => r.ramp === 0);
  for (let i = 0; i < 4; i++) {
    const row = [];
    for (let j = 0; j < 4; j++) row.push(i === j ? ' 1.000' : f3((await L.nccAll(fs.readFileSync(R0.slots[i].file), fs.readFileSync(R0.slots[j].file))).id).padStart(6));
    console.log('   slot' + i + '  ' + row.join(' '));
  }
  console.log('\n   worst orientation, every pair:');
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const v = await L.nccAll(fs.readFileSync(R0.slots[i].file), fs.readFileSync(R0.slots[j].file));
    const k = Object.keys(v).reduce((a, b) => (Math.abs(v[b]) > Math.abs(v[a]) ? b : a), 'id');
    console.log('     ' + i + ' vs ' + j + '   worst ' + k + ' ' + f3(v[k]));
  }
  console.log('\n   mirror proof -- each written slot against its own pre-mirror buffer:');
  for (let n = 0; n < 4; n++) {
    const v = await L.nccAll(fs.readFileSync(R0.slots[n].file), R0.slots[n].prePng);
    console.log('     slot' + n + ' (' + (FLOP[n] ? 'flopped' : 'as cut ') + ')  id ' + f3(v.id) + '  flop ' + f3(v.flop) +
      '  flip ' + f3(v.flip) + '  r180 ' + f3(v.r180));
  }
  console.log('\ndone -- pick a ramp, then run scripts/dust-plain-integrate-prod.cjs');
})();
