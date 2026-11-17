/**
 * VERIFY the H70L27M permafrost rung -- measured on the WRITTEN .webp files that
 * actually ship, not on any in-memory buffer (libwebp drops RGB under alpha 0 and
 * the diamond corners are ~50% of the canvas -> the well-known +1.5 luma drift).
 *
 * The metric code is NOT re-implemented here: every measurement function is lifted
 * verbatim out of scripts/tiles-permafrost-ladder.cjs, so the numbers are directly
 * comparable to _permafrost_numbers.txt and to ladder_stats.json.
 *
 * Runs twice in the workflow:
 *   SET=src   node scripts/permafrost-verify-prod.cjs   (the ladder output, PRE-integration gate)
 *   SET=prod  node scripts/permafrost-verify-prod.cjs   (src/assets/tiles/permafrost, POST-integration)
 *
 * Writes only diagnostics into assets/style-test/tiles/_permafrost_prod_*.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');

const LADDER = path.join(__dirname, 'tiles-permafrost-ladder.cjs');
const srcTxt = fs.readFileSync(LADDER, 'utf8');
const cut = srcTxt.indexOf('\n(async () => {');
if (cut < 0) throw new Error('cannot find the ladder IIFE');
const NAMES = ['statsRaw', 'statsOf', 'microContrast', 'microQuarter', 'rimHalo', 'rimGroove',
  'groundNcc', 'ncc', 'isoField', 'mixedField', 'vacuum', 'lumaOf', 'separability',
  'gridMetrics', 'boundaryStep', 'label', 'mulberry32',
  'TILE_W', 'TILE_H', 'PLAY_W', 'PLAY_H', 'BGA', 'L709', 'RIM_CUT', 'WEBP'];
const M = new Function('require', '__dirname', '__filename',
  srcTxt.slice(0, cut) + '\nreturn {' + NAMES.join(',') + '};')(require, __dirname, LADDER);

const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);
const MODE = process.env.SET || 'prod';
const PERMA_DIR = MODE === 'src'
  ? path.join(ST, 'permafrost', 'H70L27M')
  : path.join(TILES, 'permafrost');

const SETS = {
  permafrost: { dir: PERMA_DIR, pat: 'permafrost_$' },
  tundra: { dir: path.join(TILES, 'tundra'), pat: 'tundra_$' },
  glacier: { dir: path.join(TILES, 'glacier'), pat: 'glacier_$' },
  ice_shelf: { dir: path.join(TILES, 'ice_shelf'), pat: 'ice_shelf_$' },
};
const filesOf = (k) => [0, 1, 2, 3].map((n) => path.join(SETS[k].dir, SETS[k].pat.replace('$', String(n)) + '.webp'));

async function measure(key) {
  const files = filesOf(key);
  const slots = [];
  for (const f of files) {
    const s = await M.statsOf(f);
    s.micro = await M.microContrast(f);
    s.micro4 = await M.microQuarter(f);
    s.rim = await M.rimHalo(f);
    s.rimFis = await M.rimGroove(f);
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

  // chroma BEFORE the webp encode. It has to be read off a LOSSLESS file -- decoding
  // the webp and re-encoding it as PNG measures the encoder again, not the colour.
  // For permafrost that lossless file is the ladder's own 512x256 RGBA PNG, which is
  // exactly the buffer the integration hands to libwebp; for the reference biomes
  // there is none, so chrPng falls back to chromaRes (they were graded neutral, and
  // the column is only ever read for the permafrost/tundra comparison).
  for (let n = 0; n < 4; n++) {
    const lossless = path.join(ST, 'permafrost', 'H70L27M', 'permafrost_' + n + '.png');
    if (key === 'permafrost' && fs.existsSync(lossless)) {
      const r = await sharp(fs.readFileSync(lossless)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      slots[n].chrPng = M.statsRaw(r.data, r.info.channels, r.info.width, r.info.height).chromaRes;
    } else {
      slots[n].chrPng = slots[n].chromaRes;
    }
  }

  const avg = (fn) => slots.reduce((a, s) => a + fn(s), 0) / 4;
  return {
    key, files, bufs, slots, gFull, gPlay, gVac, bs,
    L: avg((s) => s.lum), br: avg((s) => s.br), gr: avg((s) => s.gr),
    micro: avg((s) => s.micro), micro4: avg((s) => s.micro4),
    chr: avg((s) => s.chromaRes), chrPng: avg((s) => s.chrPng),
    tiltY: avg((s) => s.tiltY), tiltX: avg((s) => s.tiltX),
    blowWorst: Math.max.apply(null, slots.map((s) => s.blow)),
    rimWorst: Math.max.apply(null, slots.map((s) => s.rim)),
  };
}

/**
 * The rim fade, measured on the SHIPPED FILES instead of on the mask.
 *
 * dark% and rimG% are unusable on this frost-gravel ground (tundra itself already
 * sits at 8.7% dark and 31.3% rimG), so the NET is recovered from the files. No
 * estimator is needed for the grade, because the ladder shipped the grade-only
 * control H70L27-none -- same hue, same level, no cracks. Per distance band:
 *
 *   ink(band) = 1 - [mean L_permafrost / mean L_tundra](band)
 *                 / [mean L_control    / mean L_tundra](band)
 *
 * which is exactly the net's mean multiplier in that band, grade divided out. It is
 * a ratio of BAND MEANS, so the +-3% per-pixel webp noise averages out rather than
 * rectifying. amp(band) = sd of the per-pixel net multiplier = the net's amplitude,
 * which is the quantity the rim fade is supposed to take to zero.
 *
 * The mask fades over the last 11% of world distance = dpx 0..14, so bands inside
 * 14 px must be damped and bands beyond it must be at full strength.
 */
const BANDS = [[1, 6], [7, 14], [15, 24], [25, 128]];
async function netProfile(fileP, fileT, fileC) {
  const ld = async (f) => sharp(fs.readFileSync(f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const A = await ld(fileP), B = await ld(fileT), C = await ld(fileC);
  const ca = A.info.channels, cb = B.info.channels, cc = C.info.channels, w = A.info.width, h = A.info.height;
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const acc = BANDS.map(() => ({ sp: 0, st: 0, sc: 0, n: 0, q: [] }));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (A.data[p * ca + 3] < 250 || B.data[p * cb + 3] < 250 || C.data[p * cc + 3] < 250) continue;
    const lt = M.L709(B.data[p * cb], B.data[p * cb + 1], B.data[p * cb + 2]);
    const lc = M.L709(C.data[p * cc], C.data[p * cc + 1], C.data[p * cc + 2]);
    if (lt < 4 || lc < 4) continue;
    const lp = M.L709(A.data[p * ca], A.data[p * ca + 1], A.data[p * ca + 2]);
    const u = Math.abs(x - cx) / (w / 2) + Math.abs(y - cy) / (h / 2);
    const dpx = (1 - u) * (w / 4);
    for (let bi = 0; bi < BANDS.length; bi++) {
      if (dpx < BANDS[bi][0] || dpx > BANDS[bi][1]) continue;
      const a = acc[bi];
      a.sp += lp; a.st += lt; a.sc += lc; a.n++; a.q.push(lp / lc);
      break;
    }
  }
  const mean = (v) => v.reduce((s, z) => s + z, 0) / v.length;
  return acc.map((a) => {
    const m = mean(a.q);
    return {
      n: a.n,
      ink: 1 - (a.sp / a.st) / (a.sc / a.st),
      amp: Math.sqrt(mean(a.q.map((v) => (v - m) * (v - m)))),
    };
  });
}

// ---- targets from the ladder table, rung H70L27M ---------------------------
const T = {
  L: 27.0, br: 0.700, gr: 0.850, micro: 5.77, micro4: 6.90,
  gridPlay: 2.92, gridCoh: 2.53, ratio: 0.53, gridFull: 7.25,
  chr: 12.10, chrPng: 7.62, bsRatio: 1.13, stamp: 0.76,
  dLevel: 31.49, dTexture: 13.09, dJoint: 34.10,
};
let failed = 0;
const check = (name, cond, detail) => {
  if (!cond) failed++;
  console.log('  [' + (cond ? 'PASS' : 'FAIL') + '] ' + name.padEnd(50) + detail);
};

(async () => {
  console.log('\n############ PERMAFROST H70L27M  --  ' +
    (MODE === 'src' ? 'PRE-INTEGRATION GATE on the ladder output' : 'POST-INTEGRATION on the shipped set') +
    '\n############ ' + PERMA_DIR.replace(ROOT, '.') + '\n');

  const P = await measure('permafrost');
  const TU = await measure('tundra');
  const GL = await measure('glacier');
  const IS = await measure('ice_shelf');

  console.log('(0) PER SLOT, measured on the written .webp');
  console.log('  slot      L    intL    B/R    G/R      sd   chr%  chrP%  blow%     p99  micro8  micro4   tiltX   tiltY     rim  rimFis%');
  for (let n = 0; n < 4; n++) {
    const s = P.slots[n];
    console.log('   ' + n + '  ' + f1(s.lum).padStart(7) + f1(s.intLum).padStart(8) + f3(s.br).padStart(7) + f3(s.gr).padStart(7) +
      f1(s.sd).padStart(8) + f2(s.chromaRes * 100).padStart(7) + f2(s.chrPng * 100).padStart(7) +
      f2(s.blow * 100).padStart(7) + f1(s.p99).padStart(8) + f2(s.micro).padStart(8) + f2(s.micro4).padStart(8) +
      f1(s.tiltX).padStart(8) + f1(s.tiltY).padStart(8) +
      ((s.rim >= 0 ? '+' : '') + f2(s.rim)).padStart(8) + f1(100 * s.rimFis).padStart(9));
  }
  console.log('  mean' + f1(P.L).padStart(7) + '        ' + f3(P.br).padStart(6) + f3(P.gr).padStart(7) +
    '        ' + f2(100 * P.chr).padStart(6) + f2(100 * P.chrPng).padStart(7) +
    f2(100 * P.blowWorst).padStart(7) + ' worst' + f2(P.micro).padStart(8) + f2(P.micro4).padStart(8) +
    f1(P.tiltX).padStart(8) + f1(P.tiltY).padStart(8));

  console.log('\n(1) TARGETS -- L 27.0 / B/R 0.700 / G/R 0.850, on EVERY slot, on the written file');
  check('L 27.0 on every slot (+-0.4)', P.slots.every((s) => Math.abs(s.lum - T.L) <= 0.4),
    'slots ' + P.slots.map((s) => f2(s.lum)).join(' / '));
  check('B/R 0.700 on every slot (+-0.01)', P.slots.every((s) => Math.abs(s.br - T.br) <= 0.01),
    'slots ' + P.slots.map((s) => f3(s.br)).join(' / '));
  check('G/R 0.850 = 0.5+0.5*B/R on every slot (+-0.01)', P.slots.every((s) => Math.abs(s.gr - T.gr) <= 0.01),
    'slots ' + P.slots.map((s) => f3(s.gr)).join(' / '));
  check('tiltY 3.0 / tiltX 0.0 (+-0.5)', P.slots.every((s) => Math.abs(s.tiltY - 3) <= 0.5 && Math.abs(s.tiltX) <= 0.5),
    'tiltY ' + P.slots.map((s) => f1(s.tiltY)).join('/') + '  tiltX ' + P.slots.map((s) => f1(s.tiltX)).join('/'));
  check('micro8 = ladder 5.77 (+-0.15)', Math.abs(P.micro - T.micro) <= 0.15,
    'mean ' + f2(P.micro) + '  slots ' + P.slots.map((s) => f2(s.micro)).join(' / '));
  const lsd = Math.sqrt(P.slots.reduce((a, s) => a + Math.pow(s.lum - P.L, 2), 0) / 4);
  check('slots consistent with each other: level sd <= 0.10', lsd <= 0.10, 'sd ' + f3(lsd));

  console.log('\n    CHROMA -- the first measuring trap. chr% is measured AFTER the webp encode, chrP% on the');
  console.log('    PNG before it. The tholin grade drops blue ~30%, so the SAME absolute 4:2:0 quantization');
  console.log('    error becomes a larger RELATIVE one. chrP% is the colour, chr% is the encoder tax.');
  console.log('    tundra itself: chr ' + f2(100 * TU.chr) + '%  chrP ' + f2(100 * TU.chrPng) + '%');
  check('chr% (webp) = ladder 12.10% (+-0.6pp)', Math.abs(100 * P.chr - T.chr) <= 0.6, f2(100 * P.chr) + '%');
  check('chrP% (png) = ladder 7.62%, i.e. tundra level', Math.abs(100 * P.chrPng - T.chrPng) <= 0.6,
    f2(100 * P.chrPng) + '% vs tundra ' + f2(100 * TU.chrPng) + '% -- no colour noise added');

  console.log('\n(2) BLOWOUT, share of opaque pixels at Rec709 luma >= 200, bar < 1%');
  check('blowout < 1% on all four slots', P.slots.every((s) => s.blow < 0.01),
    'slots ' + P.slots.map((s) => f2(100 * s.blow) + '%').join(' / '));

  console.log('\n(3) RASTER, lattice fold (rim band excluded, max(|du|,|dv|) <= ' + M.RIM_CUT + ')');
  for (const pair of [['FULL RES', P.gFull], ['PLAY 48x24', P.gPlay], ['PLAY + VACUUM', P.gVac]]) {
    const g = pair[1];
    console.log('    ' + pair[0].padEnd(15) + 'grid_tot ' + f2(g.gridTot) + '  (coh ' + f2(g.gridCoh) + ', slot ' + f2(g.gridSlot) +
      ')  ramp_pp ' + f2(g.rampPP) + '  resid ' + f2(g.gridResid) + '  sd_within ' + f2(g.sdWithin) +
      '  ratio ' + f3(g.ratio) + '  [' + g.BINS + 'x' + g.BINS + ' bins]');
  }
  console.log('    reference PLAY: REJECTED old tundra 10.40 (coh 1.12) | glacier ' + f2(GL.gPlay.gridTot) +
    ' (coh ' + f2(GL.gPlay.gridCoh) + ') | new tundra ' + f2(TU.gPlay.gridTot) + ' (coh ' + f2(TU.gPlay.gridCoh) +
    ') | ice_shelf ' + f2(IS.gPlay.gridTot) + ' (coh ' + f2(IS.gPlay.gridCoh) + ')');
  check('grid_play = ladder 2.92 (+-0.15)', Math.abs(P.gPlay.gridTot - T.gridPlay) <= 0.15, f2(P.gPlay.gridTot));
  check('coh = ladder 2.53 (+-0.15)', Math.abs(P.gPlay.gridCoh - T.gridCoh) <= 0.15, f2(P.gPlay.gridCoh));
  check('grid_play under the rejected old tundra 10.40', P.gPlay.gridTot < 10.40, f2(P.gPlay.gridTot));
  check('grid_play at or under glacier ' + f2(GL.gPlay.gridTot), P.gPlay.gridTot <= GL.gPlay.gridTot + 0.05,
    f2(P.gPlay.gridTot) + ' vs glacier ' + f2(GL.gPlay.gridTot));
  check('coh at or under glacier ' + f2(GL.gPlay.gridCoh), P.gPlay.gridCoh <= GL.gPlay.gridCoh + 0.05,
    f2(P.gPlay.gridCoh) + ' vs glacier ' + f2(GL.gPlay.gridCoh));

  console.log('\n(4) EDGES -- boundary step in the interlocking field over interior roughness, same stride');
  console.log('    set            step   interior   ratio');
  for (const S of [P, TU, GL, IS]) {
    console.log('    ' + S.key.padEnd(14) + f2(S.bs.step).padStart(5) + '    ' + f2(S.bs.rough).padStart(6) + '   ' + f2(S.bs.ratio).padStart(5));
  }
  check('boundary step ratio = ladder 1.13 (+-0.05)', Math.abs(P.bs.ratio - T.bsRatio) <= 0.05, f2(P.bs.ratio));
  check('boundary step ratio <= tundra ' + f2(TU.bs.ratio), P.bs.ratio <= TU.bs.ratio + 0.02,
    'permafrost ' + f2(P.bs.ratio) + ' vs tundra ' + f2(TU.bs.ratio) + ' (the net LOWERS the seam)');

  console.log('\n(5) RIM FADE -- second measuring trap: dark% and rimG% are useless on this ground');
  console.log('    (tundra itself is already at ' + f1(100 * TU.slots[0].darkFrac) + '-' + f1(100 * TU.slots[2].darkFrac) +
    '% dark and ' + f1(100 * TU.slots[0].rimFis) + '-' + f1(100 * TU.slots[2].rimFis) + '% rimG).');
  console.log('    So the multiplier map is recovered from the pair of written files instead:');
  console.log('      the net is divided out of the grade using the ladder\'s OWN grade-only control');
  console.log('      H70L27-none (same hue, same level, no cracks), so nothing is estimated:');
  console.log('        ink(band) = 1 - [mean Lperma/mean Ltundra] / [mean Lcontrol/mean Ltundra]  = the net');
  console.log('        amp(band) = sd of the per-pixel net multiplier = the amplitude the fade kills');
  console.log('      The mask fades over the last 11% of world distance = dpx 0-14.');
  console.log('    slot |  dpx 1-6        |  dpx 7-14       |  dpx 15-24      |  dpx >=25');
  console.log('         |   ink     amp   |   ink     amp   |   ink     amp   |   ink     amp');
  const profs = [];
  for (let n = 0; n < 4; n++) {
    const pr = await netProfile(P.files[n], TU.files[n],
      path.join(ST, 'permafrost', 'H70L27-none', 'permafrost_' + n + '.webp'));
    profs.push(pr);
    console.log('     ' + n + '   |' + pr.map((b) => f3(b.ink).padStart(7) + f3(b.amp).padStart(8) + '  ').join('|'));
  }
  // NOTE on the ink column: it is a SIGNED mean and it is near zero by construction,
  // because the bright wall at 1.30x depth sits beside every dark furrow and the two
  // nearly cancel in the area average (mask: ink 0.037 against lit 0.023). So ink is
  // NOT the fade indicator here -- amp is. ink is printed only to show that the net
  // does not shift the level, which is what lets the gain solve hit L 27 exactly.
  const rimAmp = profs.map((p) => p[0].amp / p[3].amp);
  check('net AMPLITUDE at the rim < 0.50 of the core', rimAmp.every((r) => r < 0.50),
    'amp_rim/amp_core ' + rimAmp.map((r) => f2(r)).join(' / ') + '   (ladder mask rimInk/coreInk 0.34-0.38)');
  check('amp rises monotonically outward on every slot',
    profs.every((p) => p[0].amp < p[1].amp && p[1].amp < p[2].amp && p[2].amp < p[3].amp),
    profs.map((p) => p.map((b) => f3(b.amp)).join('<')).join('  |  '));
  check('net level-neutral: |ink| <= 0.04 in every band',
    profs.every((p) => p.every((b) => Math.abs(b.ink) <= 0.04)),
    'worst ' + f3(Math.max.apply(null, profs.map((p) => Math.max.apply(null, p.map((b) => Math.abs(b.ink)))))));
  console.log('    rimHalo (1-4px vs 10-24px inside), for the record -- permafrost ' +
    P.slots.map((s) => (s.rim >= 0 ? '+' : '') + f2(s.rim)).join(' / '));
  console.log('    the same on tundra                                   ' +
    TU.slots.map((s) => (s.rim >= 0 ? '+' : '') + f2(s.rim)).join(' / '));
  check('rimHalo stays inside +-1.0 luma on every slot', P.slots.every((s) => Math.abs(s.rim) <= 1.0),
    'worst ' + f2(Math.max.apply(null, P.slots.map((s) => Math.abs(s.rim)))));

  console.log('\n(6) MIRROR CONVENTION, by cross-correlation (tiltX is 0, so the ramp sign proves nothing).');
  console.log('    Mean-centred masked NCC of each permafrost slot against the SHIPPED tundra slot of the');
  console.log('    same index, in all four orientations. IDENTITY must win on every slot -- slot n IS');
  console.log('    tundra slot n with a multiplier on it, and tundra already carries the flop of 2/3.');
  console.log('    slot     ident      flop      flip        hv    winner');
  const nccRows = [];
  for (let n = 0; n < 4; n++) {
    const id = await M.ncc(P.files[n], TU.files[n], false, false);
    const fo = await M.ncc(P.files[n], TU.files[n], true, false);
    const fl = await M.ncc(P.files[n], TU.files[n], false, true);
    const hv = await M.ncc(P.files[n], TU.files[n], true, true);
    const best = Math.max(id, fo, fl, hv);
    const win = best === id ? 'identity' : best === fo ? 'FLOP' : best === fl ? 'FLIP' : 'HV';
    nccRows.push({ id, fo, fl, hv, win });
    console.log('     ' + n + '     ' + f3(id).padStart(6) + f3(fo).padStart(10) + f3(fl).padStart(10) + f3(hv).padStart(10) + '    ' + win);
  }
  check('identity wins on all four slots', nccRows.every((r) => r.win === 'identity'), nccRows.map((r) => r.win).join(' / '));
  check('identity >= 0.85 and >= 20x the runner-up', nccRows.every((r) => r.id >= 0.85 && r.id >= 20 * Math.max(r.fo, r.fl, r.hv)),
    'min ident ' + f3(Math.min.apply(null, nccRows.map((r) => r.id))) +
    ', max runner-up ' + f3(Math.max.apply(null, nccRows.map((r) => Math.max(r.fo, r.fl, r.hv)))));

  console.log('\n    STAMP -- worst pairwise slot-vs-slot NCC over all orientations. The four slots share the');
  console.log('    tundra ground, so it cannot go to zero; what matters is that the net does not RAISE it.');
  let stamp = 0;
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) for (const o of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    stamp = Math.max(stamp, Math.abs(await M.ncc(P.files[a], P.files[b], !!o[0], !!o[1])));
  }
  let stampTU = 0;
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) for (const o of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    stampTU = Math.max(stampTU, Math.abs(await M.ncc(TU.files[a], TU.files[b], !!o[0], !!o[1])));
  }
  check('stamp = ladder 0.76 (+-0.03) and <= tundra ' + f2(stampTU),
    Math.abs(stamp - T.stamp) <= 0.03 && stamp <= stampTU + 0.02,
    'permafrost ' + f3(stamp) + ' vs tundra ' + f3(stampTU));

  console.log('\n(7) PAIR DISTANCE TO THE NEIGHBOURS. Corpus legs: level |dL| >= 6, hue |dB/R| >= 0.30 or');
  console.log('    |dG/R| >= 0.20, structure micro8 ratio >= 1.6 or <= 0.62.');
  console.log('    neighbour        L    B/R    G/R  micro8       dL    dB/R    dG/R  micro x   legs');
  const rows = [];
  for (const trio of [['tundra', TU], ['glacier', GL], ['ice_shelf', IS]]) {
    const nm = trio[0], S = trio[1];
    const dL = P.L - S.L, dB = P.br - S.br, dG = P.gr - S.gr, rM = P.micro / S.micro;
    const legs = [];
    if (Math.abs(dL) >= 6) legs.push('level');
    if (Math.abs(dB) >= 0.30 || Math.abs(dG) >= 0.20) legs.push('hue');
    if (rM >= 1.6 || rM <= 0.62) legs.push('structure');
    rows.push({ nm, legs, dL, dB, dG, rM });
    console.log('    ' + nm.padEnd(12) + f1(S.L).padStart(6) + f3(S.br).padStart(7) + f3(S.gr).padStart(7) + f2(S.micro).padStart(8) +
      ((dL >= 0 ? '+' : '') + f1(dL)).padStart(9) + ((dB >= 0 ? '+' : '') + f2(dB)).padStart(8) +
      ((dG >= 0 ? '+' : '') + f2(dG)).padStart(8) + f2(rM).padStart(9) + '   ' + (legs.length ? legs.join(' + ') : 'NO LEG'));
  }
  for (const r of rows) check('separable from ' + r.nm, r.legs.length >= 1, r.legs.join(' + ') || 'none');
  const tuRow = rows[0];
  console.log('\n    The three legs against tundra, one by one -- this is the risk pair:');
  console.log('      LEG 1 hue        dB/R ' + f3(tuRow.dB) + '  dG/R ' + f3(tuRow.dG) + '   -> ' +
    (Math.abs(tuRow.dB) >= 0.30 || Math.abs(tuRow.dG) >= 0.20 ? 'FIRES' : 'does NOT fire (bar 0.30 / 0.20)'));
  console.log('      LEG 2 level      dL   ' + f2(tuRow.dL) + '                -> ' +
    (Math.abs(tuRow.dL) >= 6 ? 'FIRES' : 'does NOT fire (bar 6.0) -- L 27 is inside the asked 26-28 band'));
  console.log('      LEG 3 structure  micro8 x' + f2(tuRow.rM) + '             -> ' +
    (tuRow.rM >= 1.6 || tuRow.rM <= 0.62 ? 'FIRES -- this is the bearing leg' : 'does NOT fire (bar 1.60)'));
  check('the STRUCTURE leg carries the tundra pair', tuRow.rM >= 1.6, 'micro8 x' + f2(tuRow.rM) + ' (bar 1.60)');

  console.log('\n    d\' at play scale (40x24 field, per-tile level and texture), tundra as the reference:');
  const sep = await M.separability(P.bufs, TU.bufs, false);
  const sepV = await M.separability(P.bufs, TU.bufs, true);
  console.log('      plain    d_level ' + f2(sep.dLevel) + '   d_texture ' + f2(sep.dTexture) + '   d_JOINT ' + f2(sep.dJoint));
  console.log('      vacuum   d_level ' + f2(sepV.dLevel) + '   d_texture ' + f2(sepV.dTexture) + '   d_JOINT ' + f2(sepV.dJoint));
  console.log('      raw play quantities: permafrost tile mean L ' + f1(sep.A.m) + ' +-' + f2(sep.A.msd) +
    ' vs tundra ' + f1(sep.B.m) + ' +-' + f2(sep.B.msd) + '  (Weber ' + f1(100 * (sep.A.m - sep.B.m) / sep.B.m) + '%)');
  console.log('                           within-tile sd ' + f2(sep.A.s) + ' vs ' + f2(sep.B.s) + '  (x' + f2(sep.A.s / sep.B.s) + ')');
  check('d_JOINT = ladder 34.10 (+-1.5)', Math.abs(sep.dJoint - T.dJoint) <= 1.5, f2(sep.dJoint));
  check('d_texture >= 1.0 (structure separates on its own)', sep.dTexture >= 1.0, f2(sep.dTexture));

  console.log('\n(8) GROUND GUARD -- the net is only a multiplier, the ground must stay tundra');
  const gn = [];
  for (let n = 0; n < 4; n++) gn.push(await M.groundNcc(P.files[n], TU.files[n]));
  console.log('    gNCC fine   ' + gn.map((g) => f2(g.fine)).join(' / ') + '     blur12   ' + gn.map((g) => f2(g.blur12)).join(' / '));
  check('gNCC fine >= 0.85 on all slots', gn.every((g) => g.fine >= 0.85), gn.map((g) => f2(g.fine)).join(' / '));

  // ---- panels ------------------------------------------------------------
  const PAD = 18, SW = 2400;
  const rndD = M.mulberry32(90210);
  const FD = await M.isoField(P.bufs, M.TILE_W, M.TILE_H, 6, 4, () => Math.floor(rndD() * 4));
  const CW = 1400, CH = 640;
  const cl = Math.round(FD.w / 2 - CW / 2), ct = Math.round(FD.h / 2 - CH / 2);
  const junction = await sharp(FD.png).extract({ left: cl, top: ct, width: CW, height: CH }).png().toBuffer();
  const junctionV = await sharp(await M.vacuum(FD.png)).extract({ left: cl, top: ct, width: CW, height: CH }).png().toBuffer();
  const grid2 = await M.isoField(P.bufs, M.TILE_W, M.TILE_H, 4, 3, (r, c) => (r * 2 + c) % 4);

  const comp = [];
  let y = PAD;
  const line = (t, size, fill) => {
    comp.push({ input: M.label(t, SW - PAD * 2, size || 14, fill || '#c9d1d9'), left: PAD, top: y });
    y += (size || 14) + 8;
  };
  line('PERMAFROST H70L27M -- L 27, B/R 0.700, Voronoi net 60px cells / 12px furrows, depth 0.28, wall 1.30x   ' +
    new Date().toISOString().slice(0, 16), 19, '#7ee787');
  line('multiplier on the frozen shipped tundra; measured on ' + PERMA_DIR.replace(ROOT, '.').replace(/\\/g, '/') + '/*.webp', 14, '#8b949e');
  y += 6;
  const TW2 = 580, TH2 = 290, GAP = 12;
  for (let n = 0; n < 4; n++) {
    const cx = PAD + n * (TW2 + GAP);
    comp.push({ input: M.label('slot ' + n + '   L ' + f1(P.slots[n].lum) + '  B/R ' + f3(P.slots[n].br) +
      '  micro8 ' + f2(P.slots[n].micro) + '  blow ' + f2(100 * P.slots[n].blow) + '%', TW2, 14, '#c9d1d9'), left: cx, top: y });
    comp.push({ input: await sharp(P.bufs[n]).resize(TW2, TH2, { fit: 'fill' }).png().toBuffer(), left: cx, top: y + 22 });
  }
  y += 22 + TH2 + 16;
  line('2x2 BLOCK, deterministic slot order (r*2+c)%4 -- the strictest lattice case', 15, '#7ee787');
  const g2s = Math.min(1, (SW - PAD * 2) / grid2.w);
  comp.push({ input: await sharp(grid2.png).resize(Math.round(grid2.w * g2s), Math.round(grid2.h * g2s)).png().toBuffer(), left: PAD, top: y });
  y += Math.round(grid2.h * g2s) + 16;
  line('1:1 CROP of a four-tile junction, random draw -- look for the net crossing the seam', 15, '#7ee787');
  comp.push({ input: junction, left: PAD, top: y });
  y += CH + 10;
  line('the same crop under the vacuum darkening rgba(5,10,25,0.45)', 15, '#7ee787');
  comp.push({ input: junctionV, left: PAD, top: y });
  y += CH + PAD;
  fs.writeFileSync(path.join(ST, '_permafrost_prod_edges.png'),
    await sharp({ create: { width: SW, height: y, channels: 4, background: M.BGA } }).composite(comp).png().toBuffer());
  console.log('\n[panel] _permafrost_prod_edges.png');

  const cc = [];
  const panels = [];
  for (const trio of [['permafrost (new)', P, '#7ee787'], ['tundra (the risk pair)', TU, '#d2a8ff'],
    ['glacier', GL, '#79c0ff'], ['ice_shelf', IS, '#a5d6ff']]) {
    const rp = M.mulberry32(90210);
    const F2 = await M.isoField(trio[1].bufs, 96, 48, 16, 8, () => Math.floor(rp() * 4));
    panels.push({ nm: trio[0], col: trio[2], png: F2.png, vac: await M.vacuum(F2.png), w: F2.w, h: F2.h });
  }
  let cx2 = 18;
  for (const p of panels) {
    cc.push({ input: M.label(p.nm, p.w, 15, p.col), left: cx2, top: 10 });
    cc.push({ input: p.png, left: cx2, top: 34 });
    cc.push({ input: p.vac, left: cx2, top: 34 + p.h + 10 });
    cx2 += p.w + 24;
  }
  fs.writeFileSync(path.join(ST, '_permafrost_prod_mosaic.png'),
    await sharp({ create: { width: cx2, height: 34 + panels[0].h * 2 + 24, channels: 4, background: M.BGA } }).composite(cc).png().toBuffer());
  console.log('[panel] _permafrost_prod_mosaic.png');

  // permafrost NEXT TO tundra in one interlocked field -- the actual risk picture
  const mixed = await M.mixedField([P.bufs, TU.bufs], 96, 48, 14, 10, 777);
  const mixedV = await M.vacuum(mixed);
  const mm = await sharp(mixed).metadata();
  fs.writeFileSync(path.join(ST, '_permafrost_prod_vs_tundra.png'),
    await sharp({ create: { width: mm.width + 36, height: mm.height * 2 + 60, channels: 4, background: M.BGA } })
      .composite([
        { input: M.label('permafrost and tundra interlocked, 5x4 patches -- can you see the border?', mm.width, 15, '#7ee787'), left: 18, top: 10 },
        { input: mixed, left: 18, top: 34 },
        { input: mixedV, left: 18, top: 44 + mm.height },
      ]).png().toBuffer());
  console.log('[panel] _permafrost_prod_vs_tundra.png');

  console.log('\n' + (failed === 0 ? 'ALL CHECKS PASSED' : failed + ' CHECK(S) FAILED'));
  process.exit(failed === 0 ? 0 : 1);
})();
