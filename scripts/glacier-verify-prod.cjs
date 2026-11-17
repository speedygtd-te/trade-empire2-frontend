/**
 * VERIFY the integrated glacier set in src/assets/tiles/glacier/ against the
 * targets of the L44C110F5 rung -- measured on the WRITTEN .webp files that
 * actually ship, not on any buffer (libwebp drops RGB under alpha 0 and the
 * diamond corners are ~50% of the canvas -> +1.5 luma drift).
 *
 * The metric code is not re-implemented here: the measurement functions are
 * lifted verbatim out of scripts/tiles-glacier-regolith-ladder.cjs (whose
 * gridMetrics is in turn verbatim from tiles-tundra-tilt-ladder.cjs, modulo
 * comments and the solver's name), so the numbers are directly comparable to
 * the ladder table and to the tundra run.
 *
 * Writes only diagnostics into assets/style-test/tiles/_glacier_prod_*.
 * Usage: node scripts/glacier-verify-prod.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');

// ---- lift the ladder's measurement code, verbatim --------------------------
const LADDER = path.join(__dirname, 'tiles-glacier-regolith-ladder.cjs');
const srcTxt = fs.readFileSync(LADDER, 'utf8');
const cut = srcTxt.indexOf('\n(async () => {');
if (cut < 0) throw new Error('cannot find the ladder IIFE');
const NAMES = ['statsRaw', 'statsOf', 'microContrast', 'rimHalo', 'gridMetrics', 'isoField',
  'lumaOf', 'boundaryStep', 'mulberry32', 'vacuum', 'label', 'TILE_W', 'TILE_H',
  'PLAY_W', 'PLAY_H', 'BGA', 'L709', 'SLOT_MAP', 'RIM_CUT', 'WEBP'];
const M = new Function('require', '__dirname', '__filename',
  srcTxt.slice(0, cut) + '\nreturn {' + NAMES.join(',') + '};')(require, __dirname, LADDER);

const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);
const SETS = {
  glacier: { dir: path.join(TILES, 'glacier'), pat: 'glacier_$' },
  tundra: { dir: path.join(TILES, 'tundra'), pat: 'tundra_$' },
  ice_shelf: { dir: path.join(TILES, 'ice_shelf'), pat: 'ice_shelf_$' },
  regolith: { dir: path.join(TILES, 'regolith'), pat: 'regolith_$' },
};
const filesOf = (k) => [0, 1, 2, 3].map((n) => path.join(SETS[k].dir, SETS[k].pat.replace('$', String(n)) + '.webp'));

async function measure(key) {
  const files = filesOf(key);
  const slots = [];
  for (const f of files) {
    const s = await M.statsOf(f);
    s.micro = await M.microContrast(f.replace(/\.webp$/, '@eighth.webp'), f);
    s.rim = await M.rimHalo(f);
    slots.push(s);
  }
  const bufs = [];
  for (const f of files) bufs.push(await sharp(fs.readFileSync(f)).png().toBuffer());

  const rnd = M.mulberry32(4242);
  const F = await M.isoField(bufs, M.TILE_W, M.TILE_H, 10, 6, () => Math.floor(rnd() * 4));
  const Lf = await M.lumaOf(F.png);
  const gFull = M.gridMetrics(Lf.L, Lf.w, Lf.h, F.cells, M.TILE_W, M.TILE_H);
  const bs = M.boundaryStep(Object.assign({}, F, { L: Lf.L, w: Lf.w, h: Lf.h }));

  const rnd2 = M.mulberry32(4242);
  const P = await M.isoField(bufs, M.PLAY_W, M.PLAY_H, 50, 30, () => Math.floor(rnd2() * 4));
  const Lp = await M.lumaOf(P.png);
  const gPlay = M.gridMetrics(Lp.L, Lp.w, Lp.h, P.cells, M.PLAY_W, M.PLAY_H);
  const Pv = await M.vacuum(P.png);
  const Lpv = await M.lumaOf(Pv);
  const gVac = M.gridMetrics(Lpv.L, Lpv.w, Lpv.h, P.cells, M.PLAY_W, M.PLAY_H);

  const meanL = slots.reduce((a, s) => a + s.intLum, 0) / 4;
  const slotLsd = Math.sqrt(slots.reduce((a, s) => a + Math.pow(s.intLum - meanL, 2), 0) / 4);
  const avg = (fn) => slots.reduce((a, s) => a + fn(s), 0) / 4;
  return {
    key, files, bufs, slots, gFull, gPlay, gVac, bs, slotLsd,
    L: avg((s) => s.lum), br: avg((s) => s.br), gr: avg((s) => s.gr), micro: avg((s) => s.micro),
    chr: avg((s) => s.chromaRes), tiltY: avg((s) => s.tiltY), tiltX: avg((s) => s.tiltX),
    blowWorst: Math.max.apply(null, slots.map((s) => s.blow)),
    rimWorst: Math.max.apply(null, slots.map((s) => s.rim)),
  };
}

const TARGET = { L: 44, br: 1.10, gr: 1.06, gridPlay: 5.77, ratio: 0.59 };
let failed = 0;
const check = (name, cond, detail) => {
  if (!cond) failed++;
  console.log('  [' + (cond ? 'PASS' : 'FAIL') + '] ' + name.padEnd(46) + detail);
};

(async () => {
  const G = await measure('glacier');
  const T = await measure('tundra');
  const I = await measure('ice_shelf');
  const R = await measure('regolith');

  console.log('\nGLACIER as integrated into src/assets/tiles/glacier/  --  measured on the shipped .webp');
  console.log('  slot      L    intL    B/R    G/R      sd   chr%  blow%     p99  micro8   tiltX   tiltY      rim');
  for (let n = 0; n < 4; n++) {
    const s = G.slots[n];
    console.log('   ' + n + '  ' + f1(s.lum).padStart(7) + f1(s.intLum).padStart(8) + f2(s.br).padStart(7) + f2(s.gr).padStart(7) +
      f1(s.sd).padStart(8) + f2(s.chromaRes * 100).padStart(7) + f2(s.blow * 100).padStart(7) + f1(s.p99).padStart(8) +
      f2(s.micro).padStart(8) + f1(s.tiltX).padStart(8) + f1(s.tiltY).padStart(8) +
      ((s.rim >= 0 ? '+' : '') + f2(s.rim)).padStart(9));
  }
  console.log('  mean' + f1(G.L).padStart(7) + '        ' + f2(G.br).padStart(6) + f2(G.gr).padStart(7) +
    '        ' + f2(100 * G.chr).padStart(6) + f2(100 * G.blowWorst).padStart(7) + ' worst' +
    f2(G.micro).padStart(8) + f1(G.tiltX).padStart(8) + f1(G.tiltY).padStart(8));
  console.log('  slotL_sd ' + f2(G.slotLsd) + '   (ladder table for this rung: 0.15)');

  console.log('\n(1) TARGETS, per slot, measured on the written file');
  check('L 44 on every slot (+-0.6)', G.slots.every((s) => Math.abs(s.lum - TARGET.L) <= 0.6),
    'slots ' + G.slots.map((s) => f1(s.lum)).join(' / '));
  check('B/R 1.10 on every slot (+-0.01)', G.slots.every((s) => Math.abs(s.br - TARGET.br) <= 0.01),
    'slots ' + G.slots.map((s) => f3(s.br)).join(' / '));
  check('G/R 1.06 = 1+0.60*(B/R-1) (+-0.01)', G.slots.every((s) => Math.abs(s.gr - TARGET.gr) <= 0.01),
    'slots ' + G.slots.map((s) => f3(s.gr)).join(' / '));
  check('tiltY 3.0 / tiltX 0.0 (+-0.5)', G.slots.every((s) => Math.abs(s.tiltY - 3) <= 0.5 && Math.abs(s.tiltX) <= 0.5),
    'tiltY ' + G.slots.map((s) => f1(s.tiltY)).join('/') + '  tiltX ' + G.slots.map((s) => f1(s.tiltX)).join('/'));
  // RESIDUAL CHROMA. CHROMA_CAP 1.2% is solved on the FLATTENED SOURCE in float,
  // before the per-channel tint. Residual chroma is exactly invariant under a
  // per-channel gain (the metric divides each channel by its own mean), so the
  // tint cannot add any -- but the 8-bit rounding after it can, and the webp
  // chroma path adds the rest. Measured on the same tile: cap solve 1.20% ->
  // lossless PNG 1.37% -> shipped webp 2.15%; the neutral B/R 1.00 rung of the
  // same source reads 0.64%, which is that quantization floor with three nearly
  // equal channel gains. So the number to check post-webp is not the cap but
  // (a) that it matches the ladder's own value for the accepted rung and
  // (b) the SPREAD across slots, which is what the metric was built for: one
  // slot reading brown next to the others.
  const chrs = G.slots.map((s) => 100 * s.chromaRes);
  const chrSpread = Math.max.apply(null, chrs) - Math.min.apply(null, chrs);
  check('residual chroma = ladder 2.13% (+-0.15pp)', Math.abs(100 * G.chr - 2.13) <= 0.15,
    'slots ' + chrs.map((c) => f2(c) + '%').join(' / ') + '  mean ' + f2(100 * G.chr) + '%');
  check('no slot reads brown: spread <= 0.30pp', chrSpread <= 0.30, f2(chrSpread) + 'pp');

  console.log('\n(2) BLOWOUT, share of opaque pixels above Rec709 luma 200, bar < 1%');
  check('blowout < 1% on all four slots', G.slots.every((s) => s.blow < 0.01),
    'slots ' + G.slots.map((s) => f2(100 * s.blow) + '%').join(' / '));

  console.log('\n(3) RASTER, lattice fold (rim band excluded, max(|du|,|dv|) <= ' + M.RIM_CUT + ')');
  for (const pair of [['FULL RES', G.gFull], ['PLAY 48x24', G.gPlay], ['PLAY + VACUUM', G.gVac]]) {
    const g = pair[1];
    console.log('    ' + pair[0].padEnd(15) + 'grid_tot ' + f2(g.gridTot) + '  (coh ' + f2(g.gridCoh) + ', slot ' + f2(g.gridSlot) +
      ')  ramp_pp ' + f2(g.rampPP) + '  resid ' + f2(g.gridResid) + '  sd_within ' + f2(g.sdWithin) +
      '  ratio ' + f3(g.ratio) + '  [' + g.BINS + 'x' + g.BINS + ' bins]');
  }
  console.log('    reference PLAY: shipped tundra 10.40 (ratio 1.12, REJECTED) | new tundra ' +
    f2(T.gPlay.gridTot) + ' (ratio ' + f2(T.gPlay.ratio) + ', accepted) | ice_shelf ' + f2(I.gPlay.gridTot) +
    ' (ratio ' + f2(I.gPlay.ratio) + ') | regolith ' + f2(R.gPlay.gridTot) + ' (ratio ' + f2(R.gPlay.ratio) + ')');
  check('grid_tot@play matches the ladder 5.77 (+-0.15)', Math.abs(G.gPlay.gridTot - TARGET.gridPlay) <= 0.15, f2(G.gPlay.gridTot));
  check('ratio matches the ladder 0.59 (+-0.03)', Math.abs(G.gPlay.ratio - TARGET.ratio) <= 0.03, f3(G.gPlay.ratio));
  check('ratio below the rejected shipped tundra 1.12', G.gPlay.ratio < 1.12, f3(G.gPlay.ratio) + ' vs 1.12');

  console.log('\n(4) EDGES -- boundary step in the interlocking field vs interior roughness at the same stride');
  console.log('    set          step   interior   ratio   (lower = the seam reads less as a line)');
  for (const S of [G, T, I, R]) {
    console.log('    ' + S.key.padEnd(12) + f2(S.bs.step).padStart(5) + '    ' + f2(S.bs.rough).padStart(6) + '   ' + f2(S.bs.ratio).padStart(5));
  }
  check('boundary step ratio <= new tundra + 0.35', G.bs.ratio <= T.bs.ratio + 0.35,
    'glacier ' + f2(G.bs.ratio) + ' vs tundra ' + f2(T.bs.ratio));

  console.log('\n(5) RIM SEAM per slot, 1-4px inside the diamond vs 10-24px inside; must not go positive');
  console.log('    ' + G.slots.map((s, n) => 'slot' + n + ' ' + (s.rim >= 0 ? '+' : '') + f2(s.rim)).join('   '));
  check('rim negative on all four slots', G.slots.every((s) => s.rim < 0),
    'worst ' + (G.rimWorst >= 0 ? '+' : '') + f2(G.rimWorst) + ' (flatten deg-3 was +0.82)');

  console.log('\n(6) PAIR DISTANCES -- legs: level |dL|>=6, hue |dB/R|>=0.30 or |dG/R|>=0.20, structure micro ratio >=1.6 or <=0.62');
  console.log('    neighbour        L    B/R    G/R  micro8       dL    dB/R    dG/R  micro x   legs');
  const rows = [];
  for (const trio of [['tundra', T, true], ['ice_shelf', I, true], ['regolith', R, false]]) {
    const nm = trio[0], S = trio[1], same = trio[2];
    const dL = G.L - S.L, dB = G.br - S.br, dG = G.gr - S.gr, rM = G.micro / S.micro;
    const legs = [];
    if (Math.abs(dL) >= 6) legs.push('level');
    if (Math.abs(dB) >= 0.30 || Math.abs(dG) >= 0.20) legs.push('hue');
    if (rM >= 1.6 || rM <= 0.62) legs.push('structure');
    rows.push({ nm, legs, same });
    console.log('    ' + nm.padEnd(12) + f1(S.L).padStart(6) + f2(S.br).padStart(7) + f2(S.gr).padStart(7) + f2(S.micro).padStart(8) +
      ((dL >= 0 ? '+' : '') + f1(dL)).padStart(9) + ((dB >= 0 ? '+' : '') + f2(dB)).padStart(8) +
      ((dG >= 0 ? '+' : '') + f2(dG)).padStart(8) + f2(rM).padStart(9) + '   ' +
      (same ? (legs.length ? legs.join(' + ') : 'NO LEG -- too close') : 'other planet, no collision'));
  }
  for (const r of rows) if (r.same) check('separable from ' + r.nm, r.legs.length >= 1, r.legs.join(' + ') || 'none');

  console.log('\n(7) regolith untouched');
  check('regolith still at its shipped numbers', Math.abs(R.L - 64.9) < 0.2 && Math.abs(R.br - 0.99) < 0.02,
    'L ' + f1(R.L) + '  B/R ' + f2(R.br) + '  (ladder table: 64.9 / 0.99)');

  // ---- panels ------------------------------------------------------------
  const PAD = 18, SW = 2400;
  const rndD = M.mulberry32(90210);
  const FD = await M.isoField(G.bufs, M.TILE_W, M.TILE_H, 6, 4, () => Math.floor(rndD() * 4));
  const CW = 1400, CH = 640;
  const cl = Math.round(FD.w / 2 - CW / 2), ct = Math.round(FD.h / 2 - CH / 2);
  const junction = await sharp(FD.png).extract({ left: cl, top: ct, width: CW, height: CH }).png().toBuffer();
  const FDv = await M.vacuum(FD.png);
  const junctionV = await sharp(FDv).extract({ left: cl, top: ct, width: CW, height: CH }).png().toBuffer();
  const grid2 = await M.isoField(G.bufs, M.TILE_W, M.TILE_H, 4, 3, (r, c) => (r * 2 + c) % 4);

  const comp = [];
  let y = PAD;
  const line = (t, size, fill) => {
    comp.push({ input: M.label(t, SW - PAD * 2, size || 14, fill || '#c9d1d9'), left: PAD, top: y });
    y += (size || 14) + 8;
  };
  line('GLACIER as integrated -- L44C110F5 (L 44, B/R 1.10, flatten deg 5)   ' + new Date().toISOString().slice(0, 16), 19, '#7ee787');
  line('slots 0<-regolith_3  1<-regolith_1  2<-regolith_0 180deg  3<-regolith_3 180deg      measured on src/assets/tiles/glacier/*.webp', 14, '#8b949e');
  y += 6;
  const TW2 = 580, TH2 = 290, GAP = 12;
  for (let n = 0; n < 4; n++) {
    const cx = PAD + n * (TW2 + GAP);
    comp.push({ input: M.label('slot ' + n + '   L ' + f1(G.slots[n].lum) + '  B/R ' + f2(G.slots[n].br) + '  blow ' + f2(100 * G.slots[n].blow) + '%  rim ' + f2(G.slots[n].rim), TW2, 14, '#c9d1d9'), left: cx, top: y });
    comp.push({ input: await sharp(G.bufs[n]).resize(TW2, TH2, { fit: 'fill' }).png().toBuffer(), left: cx, top: y + 22 });
  }
  y += 22 + TH2 + 16;
  line('2x2 BLOCK, deterministic slot order (r*2+c)%4 -- the strictest lattice case', 15, '#7ee787');
  const g2s = Math.min(1, (SW - PAD * 2) / grid2.w);
  comp.push({ input: await sharp(grid2.png).resize(Math.round(grid2.w * g2s), Math.round(grid2.h * g2s)).png().toBuffer(), left: PAD, top: y });
  y += Math.round(grid2.h * g2s) + 16;
  line('1:1 CROP of a four-tile junction, random draw', 15, '#7ee787');
  comp.push({ input: junction, left: PAD, top: y });
  y += CH + 10;
  line('the same crop under the vacuum darkening rgba(5,10,25,0.45)', 15, '#7ee787');
  comp.push({ input: junctionV, left: PAD, top: y });
  y += CH + PAD;
  fs.writeFileSync(path.join(ST, '_glacier_prod_edges.png'),
    await sharp({ create: { width: SW, height: y, channels: 4, background: M.BGA } }).composite(comp).png().toBuffer());
  console.log('\n[panel] _glacier_prod_edges.png');

  const cc = [];
  const panels = [];
  for (const trio of [['glacier (new)', G, '#7ee787'], ['tundra (new)', T, '#d2a8ff'], ['ice_shelf', I, '#79c0ff']]) {
    const rp = M.mulberry32(90210);
    const P = await M.isoField(trio[1].bufs, 96, 48, 16, 8, () => Math.floor(rp() * 4));
    panels.push({ nm: trio[0], col: trio[2], png: P.png, vac: await M.vacuum(P.png), w: P.w, h: P.h });
  }
  let cx2 = 18;
  for (const p of panels) {
    cc.push({ input: M.label(p.nm, p.w, 15, p.col), left: cx2, top: 10 });
    cc.push({ input: p.png, left: cx2, top: 34 });
    cc.push({ input: p.vac, left: cx2, top: 34 + p.h + 10 });
    cx2 += p.w + 24;
  }
  fs.writeFileSync(path.join(ST, '_glacier_prod_mosaic.png'),
    await sharp({ create: { width: cx2, height: 34 + panels[0].h * 2 + 24, channels: 4, background: M.BGA } }).composite(cc).png().toBuffer());
  console.log('[panel] _glacier_prod_mosaic.png   (top row plain, bottom row under vacuum darkening)');

  console.log('\n' + (failed === 0 ? 'ALL CHECKS PASSED' : failed + ' CHECK(S) FAILED'));
  process.exit(failed === 0 ? 0 : 1);
})();
