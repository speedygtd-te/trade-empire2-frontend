/**
 * VERIFY the FINE-lip crevasse rung (Rudi's pick from the round-4 ladder, 2026-09-04)
 * -- measured on the WRITTEN .webp files that actually ship, never on an in-memory
 * buffer (libwebp drops RGB under alpha 0 and the diamond corners are ~50% of the
 * canvas -> the well-known +1.5 luma drift).
 *
 * The metric code is NOT re-implemented here: every measurement function is lifted
 * verbatim out of scripts/tiles-crevasse-r4-hairline.cjs, so the numbers are directly
 * comparable to _crevasse4_numbers.txt.
 *
 * Runs twice in the workflow:
 *   SET=src   node scripts/crevasse-hairline-verify-prod.cjs   (ladder output, PRE-integration gate)
 *   SET=prod  node scripts/crevasse-hairline-verify-prod.cjs   (src/assets/tiles/crevasse, POST-integration)
 *
 * THE KNOWN, ACCEPTED LIMIT OF THIS RUNG. At the coarsest overview scale it is NOT
 * statistically separated from glacier: d'level 0.32 / d'texture 0.12, both far under
 * the 1.0 bar, and the ladder marked it "BELOW THRESHOLD -- the same tile with two
 * names". Rudi chose it at the picture anyway ("der unterschied ist dezent aber
 * ausreichend um als eigenes biome wahrgenommen zu werden"), and the numbers that back
 * that choice are the OTHER scale: micro4 (128x64 mip, 4 screen px per pixel = normal
 * play zoom) is 10.68 against glacier's 6.62, x1.61. So this script measures and prints
 * BOTH scales side by side and gates on micro4, not on d'. d' is asserted only in the
 * direction that must hold: the LEVEL must not be the separator.
 *
 * Writes only diagnostics into assets/style-test/tiles/_crevasse_prod_*.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');

const LADDER = path.join(__dirname, 'tiles-crevasse-r4-hairline.cjs');
const srcTxt = fs.readFileSync(LADDER, 'utf8');
const cut = srcTxt.indexOf('\n(async () => {');
if (cut < 0) throw new Error('cannot find the ladder IIFE');
const NAMES = ['statsRaw', 'statsOf', 'microContrast', 'microQuarter', 'rimHalo', 'rimFissure',
  'groundNcc', 'groundStats', 'ncc', 'isoField', 'mixedField', 'vacuum', 'lumaOf', 'separability',
  'gridMetrics', 'boundaryStep', 'label', 'mulberry32', 'maskFor', 'FINE',
  'TILE_W', 'TILE_H', 'PLAY_W', 'PLAY_H', 'BGA', 'L709', 'RIM_CUT', 'WEBP'];
const M = new Function('require', '__dirname', '__filename',
  srcTxt.slice(0, cut) + '\nreturn {' + NAMES.join(',') + '};')(require, __dirname, LADDER);

const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);
const MODE = process.env.SET || 'prod';
const CREV_DIR = MODE === 'src' ? path.join(ST, 'crevasse4', 'FINE-lip') : path.join(TILES, 'crevasse');
const SEED = (n) => 4400000 + n * 65539;   // the ladder's own per-slot seeds

const SETS = {
  crevasse: { dir: CREV_DIR, pat: 'crevasse_$' },
  glacier: { dir: path.join(TILES, 'glacier'), pat: 'glacier_$' },
  permafrost: { dir: path.join(TILES, 'permafrost'), pat: 'permafrost_$' },
  tundra: { dir: path.join(TILES, 'tundra'), pat: 'tundra_$' },
  ice_shelf: { dir: path.join(TILES, 'ice_shelf'), pat: 'ice_shelf_$' },
};
const filesOf = (k) => [0, 1, 2, 3].map((n) => path.join(SETS[k].dir, SETS[k].pat.replace('$', String(n)) + '.webp'));

async function measure(key) {
  const files = filesOf(key);
  const slots = [];
  for (const f of files) {
    const s = await M.statsOf(f);
    // micro8 is read off the WRITTEN @eighth.webp where one exists -- the same file the
    // game samples at overview zoom -- and derived from the full tile with identical
    // resize+encode settings where it does not.
    const e8 = f.replace(/\.webp$/, '@eighth.webp');
    s.micro = await M.microContrast(fs.existsSync(e8) ? e8 : null, f);
    s.micro4 = await M.microQuarter(f);
    s.rim = await M.rimHalo(f);
    s.rimFis80 = await M.rimFissure(f, 0.80);
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

  const avg = (fn) => slots.reduce((a, s) => a + fn(s), 0) / 4;
  return {
    key, files, bufs, slots, gFull, gPlay, gVac, bs,
    L: avg((s) => s.lum), br: avg((s) => s.br), gr: avg((s) => s.gr),
    micro: avg((s) => s.micro), micro4: avg((s) => s.micro4),
    chr: avg((s) => s.chromaRes), sd: avg((s) => s.sd),
    dark: avg((s) => s.darkFrac),
    tiltY: avg((s) => s.tiltY), tiltX: avg((s) => s.tiltX),
    blowWorst: Math.max.apply(null, slots.map((s) => s.blow)),
  };
}

/**
 * THE RIM SEAM, measured twice and independently.
 *
 * (a) ON THE MASK -- the ground truth of the net. maskFor() is deterministic in the
 *     slot seed and the FINE config, so the exact D and B fields that were multiplied
 *     onto glacier are rebuilt here and binned by distance to the diamond edge.
 *     amp = sd(D + kB), the amplitude the rim fade is supposed to take to zero, with k
 *     the closed-form lip solution read straight off the mask.
 *
 * (b) ON THE WRITTEN FILES -- crevasse IS glacier times a multiplier, so the ratio
 *     r = L_crevasse / L_glacier is that multiplier, grade included. The grade is a
 *     smooth gain-plus-tilt plane, so it is divided out with a local box mean of r
 *     (radius 16 px) and what remains is the net alone. amp = sd(r / r_local).
 *
 * The mask fades over the last 11% of world distance = dpx 0..14, so bands inside
 * 14 px must be damped and bands beyond it at full strength.
 */
const BANDS = [[1, 6], [7, 14], [15, 24], [25, 128]];
const BAND_OF = (dpx) => {
  for (let i = 0; i < BANDS.length; i++) if (dpx >= BANDS[i][0] && dpx <= BANDS[i][1]) return i;
  return -1;
};

function maskProfile(n) {
  const mk = M.maskFor(SEED(n), M.FINE);
  const w = M.TILE_W, h = M.TILE_H, cx = (w - 1) / 2, cy = (h - 1) / 2;
  const acc = BANDS.map(() => []);
  let sD = 0, sB = 0, sDB = 0;
  for (let i = 0; i < mk.D.length; i++) { sD += mk.D[i]; sB += mk.B[i]; sDB += mk.D[i] * mk.B[i]; }
  const k = sB - sDB > 1e-6 ? sD / (sB - sDB) : 1;
  // The ladder's OWN rimInk/coreInk, reproduced here so the 0.53 in the table is
  // directly checkable: its rim band is the whole fade zone in WORLD distance
  // (md < C.rimBand = 0.11, i.e. dpx 0..14), not the innermost dpx 1-6 band below.
  // The two are different questions -- ink over the whole fade vs amplitude at the
  // very edge -- and both are reported.
  let iR = 0, nR = 0, iC = 0, nC = 0;
  const band = M.FINE.rimBand;
  for (let p = 0; p < w * h; p++) {
    const px = p % w, py = (p - (p % w)) / w;
    const ddx = px + 0.5 - w / 2, ddy = py + 0.5 - h / 2;
    const uu = ddx / w + ddy / h, vv = -ddx / w + ddy / h;
    const md = Math.min(0.5 - Math.abs(uu), 0.5 - Math.abs(vv));
    if (md >= 0 && md < band) { iR += mk.D[p]; nR++; } else if (md >= band) { iC += mk.D[p]; nC++; }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    const u = Math.abs(x - cx) / (w / 2) + Math.abs(y - cy) / (h / 2);
    if (u > 1) continue;
    const bi = BAND_OF((1 - u) * (w / 4));
    if (bi < 0) continue;
    acc[bi].push({ d: mk.D[p], t: mk.D[p] + k * mk.B[p] });
  }
  const mean = (v, f) => v.reduce((s, z) => s + f(z), 0) / v.length;
  return {
    lipK: k,
    rimInk: (iR / nR) / (iC / nC),
    bands: acc.map((v) => {
      const m = mean(v, (z) => z.t);
      return {
        n: v.length,
        ink: mean(v, (z) => z.d),
        amp: Math.sqrt(mean(v, (z) => (z.t - m) * (z.t - m))),
      };
    }),
  };
}

async function fileProfile(fileC, fileG) {
  const ld = async (f) => sharp(fs.readFileSync(f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const A = await ld(fileC), B = await ld(fileG);
  const ca = A.info.channels, cb = B.info.channels, w = A.info.width, h = A.info.height;
  const r = new Float32Array(w * h), ok = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (A.data[p * ca + 3] < 250 || B.data[p * cb + 3] < 250) continue;
    const lg = M.L709(B.data[p * cb], B.data[p * cb + 1], B.data[p * cb + 2]);
    if (lg < 6) continue;
    r[p] = M.L709(A.data[p * ca], A.data[p * ca + 1], A.data[p * ca + 2]) / lg;
    ok[p] = 1;
  }
  const R = 16;                       // local box mean radius, stride 2 -- kills the grade plane
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const acc = BANDS.map(() => []);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (!ok[p]) continue;
    const u = Math.abs(x - cx) / (w / 2) + Math.abs(y - cy) / (h / 2);
    const bi = BAND_OF((1 - u) * (w / 4));
    if (bi < 0) continue;
    let s = 0, n = 0;
    for (let j = -R; j <= R; j += 2) for (let i = -R; i <= R; i += 2) {
      const yy = y + j, xx = x + i;
      if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue;
      const q = yy * w + xx;
      if (!ok[q]) continue;
      s += r[q]; n++;
    }
    if (n < 12) continue;
    acc[bi].push(r[p] / (s / n));
  }
  const mean = (v) => v.reduce((s, z) => s + z, 0) / v.length;
  return acc.map((v) => {
    const m = mean(v);
    return { n: v.length, amp: Math.sqrt(mean(v.map((z) => (z - m) * (z - m)))) };
  });
}

// ---- targets from the ladder table, rung FINE-lip -------------------------
const T = {
  L: 44.0, br: 1.100, gr: 1.060, chr: 2.58, dark: 3.0, blow: 0.08, sd: 21.0,
  micro: 8.70, micro4: 10.68,
  step: 18.55, rough: 22.19, sr: 0.84, rimInk: 0.53, stamp: 0.47,
  gridFull: 13.24, gridPlay: 5.83, gridCoh: 3.25, ratio: 0.58, gridVac: 3.20,
  dLevel: 0.32, dTexture: 0.12, dJoint: 0.34,
};

let failed = 0;
const check = (name, cond, detail) => {
  if (!cond) failed++;
  console.log('  [' + (cond ? 'PASS' : 'FAIL') + '] ' + name.padEnd(58) + detail);
};

(async () => {
  console.log('\n############ CREVASSE FINE-lip (HAIRLINE net, cells 41px / cracks 5px, depth .34, solved lip)');
  console.log('############ ' + (MODE === 'src' ? 'PRE-INTEGRATION GATE on the ladder output' : 'POST-INTEGRATION on the shipped set'));
  console.log('############ ' + CREV_DIR.replace(ROOT, '.').replace(/\\/g, '/') + '\n');

  const C = await measure('crevasse');
  const GL = await measure('glacier');
  const hasPerma = fs.existsSync(filesOf('permafrost')[0]);
  const PF = hasPerma ? await measure('permafrost') : null;
  const TU = await measure('tundra');
  const IS = await measure('ice_shelf');

  console.log('(0) PER SLOT, measured on the written .webp (libwebp; the +1.5 offset is inside every number)');
  console.log('  slot      L    intL    B/R    G/R      sd   chr%  dark%  blow%     p99  micro8  micro4   tiltX   tiltY     rim  rimG80%');
  for (let n = 0; n < 4; n++) {
    const s = C.slots[n];
    console.log('   ' + n + '  ' + f1(s.lum).padStart(7) + f1(s.intLum).padStart(8) + f3(s.br).padStart(7) + f3(s.gr).padStart(7) +
      f1(s.sd).padStart(8) + f2(s.chromaRes * 100).padStart(7) + f2(100 * s.darkFrac).padStart(7) +
      f2(s.blow * 100).padStart(7) + f1(s.p99).padStart(8) + f2(s.micro).padStart(8) + f2(s.micro4).padStart(8) +
      f1(s.tiltX).padStart(8) + f1(s.tiltY).padStart(8) +
      ((s.rim >= 0 ? '+' : '') + f2(s.rim)).padStart(8) + f1(100 * s.rimFis80).padStart(9));
  }
  console.log('  mean' + f1(C.L).padStart(7) + '        ' + f3(C.br).padStart(6) + f3(C.gr).padStart(7) +
    f1(C.sd).padStart(8) + f2(100 * C.chr).padStart(7) + f2(100 * C.dark).padStart(7) +
    f2(100 * C.blowWorst).padStart(7) + f2(C.micro).padStart(13) + f2(C.micro4).padStart(8) +
    f1(C.tiltX).padStart(8) + f1(C.tiltY).padStart(8) + '   (blow% = worst slot)');
  console.log('  glac' + f1(GL.L).padStart(7) + '        ' + f3(GL.br).padStart(6) + f3(GL.gr).padStart(7) +
    f1(GL.sd).padStart(8) + f2(100 * GL.chr).padStart(7) + f2(100 * GL.dark).padStart(7) +
    f2(100 * GL.blowWorst).padStart(7) + f2(GL.micro).padStart(13) + f2(GL.micro4).padStart(8) +
    f1(GL.tiltX).padStart(8) + f1(GL.tiltY).padStart(8) + '   <- the ground, as shipped');

  console.log('\n(1) TARGETS -- L 44.0 / B/R 1.100 / G/R 1.060, on EVERY slot, on the written file');
  check('L 44.0 on every slot (+-0.4)', C.slots.every((s) => Math.abs(s.lum - T.L) <= 0.4),
    'slots ' + C.slots.map((s) => f2(s.lum)).join(' / '));
  console.log('      THE LEVEL IS EXACTLY GLACIER BY DESIGN. The closed-form lip solve makes bright and dark');
  console.log('      cancel per slot, so this biome must NOT separate through brightness.');
  const dPer = C.slots.map((s, n) => s.lum - GL.slots[n].lum);
  check('|L_crevasse - L_glacier| <= 0.3 PER SLOT', dPer.every((d) => Math.abs(d) <= 0.3),
    'per slot ' + dPer.map((d) => (d >= 0 ? '+' : '') + f2(d)).join(' / '));
  check('B/R 1.100 on every slot (+-0.01)', C.slots.every((s) => Math.abs(s.br - T.br) <= 0.01),
    'slots ' + C.slots.map((s) => f3(s.br)).join(' / '));
  check('G/R 1.060 on every slot (+-0.01)', C.slots.every((s) => Math.abs(s.gr - T.gr) <= 0.01),
    'slots ' + C.slots.map((s) => f3(s.gr)).join(' / '));
  check('tiltY 3.0 / tiltX 0.0 (+-0.5)', C.slots.every((s) => Math.abs(s.tiltY - 3) <= 0.5 && Math.abs(s.tiltX) <= 0.5),
    'tiltY ' + C.slots.map((s) => f1(s.tiltY)).join('/') + '  tiltX ' + C.slots.map((s) => f1(s.tiltX)).join('/'));
  check('chr% = ladder 2.58 (+-0.4pp)', Math.abs(100 * C.chr - T.chr) <= 0.4,
    f2(100 * C.chr) + '% vs glacier ' + f2(100 * GL.chr) + '% -- the multiply is achromatic, the desat step a no-op');
  check('dark% = ladder 3.0 (+-0.6pp): the grooves stayed shallow', Math.abs(100 * C.dark - T.dark) <= 0.6,
    f2(100 * C.dark) + '% vs glacier ' + f2(100 * GL.dark) + '%');
  check('sd = ladder 21.0 (+-1.2)', Math.abs(C.sd - T.sd) <= 1.2, f1(C.sd) + ' vs glacier ' + f1(GL.sd));

  console.log('\n(2) THE TWO SCALES. This is the decision Rudi made, and these are the numbers behind it.');
  console.log('      micro8 = mean |dL| between 4-neighbours on the 64x32 mip = 8 screen px per pixel = OVERVIEW');
  console.log('      micro4 = the same on the 128x64 mip                      = 4 screen px per pixel = PLAY ZOOM');
  console.log('      set              micro8    x glacier      micro4    x glacier');
  for (const trio of [['crevasse', C], ['glacier', GL]].concat(hasPerma ? [['permafrost', PF]] : []).concat([['tundra', TU]])) {
    console.log('      ' + trio[0].padEnd(14) + f2(trio[1].micro).padStart(7) + f2(trio[1].micro / GL.micro).padStart(12) +
      f2(trio[1].micro4).padStart(13) + f2(trio[1].micro4 / GL.micro4).padStart(12));
  }
  check('micro8 = ladder 8.70 (+-0.15)', Math.abs(C.micro - T.micro) <= 0.15,
    'mean ' + f2(C.micro) + '  slots ' + C.slots.map((s) => f2(s.micro)).join(' / '));
  check('micro4 = ladder 10.68 (+-0.25)', Math.abs(C.micro4 - T.micro4) <= 0.25,
    'mean ' + f2(C.micro4) + '  slots ' + C.slots.map((s) => f2(s.micro4)).join(' / '));
  check('AT PLAY ZOOM micro4 clears glacier by >= 1.50x', C.micro4 / GL.micro4 >= 1.50,
    'x' + f2(C.micro4 / GL.micro4) + '  (' + f2(C.micro4) + ' vs ' + f2(GL.micro4) + ') -- the net works where detail is visible');
  console.log('      At overview the same net is only x' + f2(C.micro / GL.micro) + ' (' + f2(C.micro) + ' vs ' +
    f2(GL.micro) + '). That is the accepted limit -- see (7).');

  console.log('\n(3) BLOWOUT, share of opaque pixels at Rec709 luma >= 200, bar < 1%');
  check('blowout < 1% on all four slots', C.slots.every((s) => s.blow < 0.01),
    'slots ' + C.slots.map((s) => f2(100 * s.blow) + '%').join(' / ') + '  -- the bright lip is the only source');
  check('blowout = ladder 0.08% (+-0.15pp)', Math.abs(100 * C.blowWorst - T.blow) <= 0.15, 'worst slot ' + f2(100 * C.blowWorst) + '%');

  console.log('\n(4) RASTER, lattice fold (rim band excluded, max(|du|,|dv|) <= ' + M.RIM_CUT + ')');
  for (const pair of [['FULL RES', C.gFull], ['PLAY 48x24', C.gPlay], ['PLAY + VACUUM', C.gVac]]) {
    const g = pair[1];
    console.log('      ' + pair[0].padEnd(15) + 'grid_tot ' + f2(g.gridTot) + '  (coh ' + f2(g.gridCoh) + ', slot ' + f2(g.gridSlot) +
      ')  ramp_pp ' + f2(g.rampPP) + '  resid ' + f2(g.gridResid) + '  sd_within ' + f2(g.sdWithin) +
      '  ratio ' + f3(g.ratio) + '  [' + g.BINS + 'x' + g.BINS + ' bins]');
  }
  console.log('      reference PLAY: glacier ' + f2(GL.gPlay.gridTot) + ' (coh ' + f2(GL.gPlay.gridCoh) + ')' +
    (hasPerma ? ' | permafrost ' + f2(PF.gPlay.gridTot) + ' (coh ' + f2(PF.gPlay.gridCoh) + ')' : '') +
    ' | new tundra ' + f2(TU.gPlay.gridTot) + ' (coh ' + f2(TU.gPlay.gridCoh) + ')' +
    ' | REJECTED old tundra 10.40 (coh 1.12) | ice_shelf ' + f2(IS.gPlay.gridTot) + ' (coh ' + f2(IS.gPlay.gridCoh) + ')');
  check('grid_play = ladder 5.83 (+-0.15)', Math.abs(C.gPlay.gridTot - T.gridPlay) <= 0.15, f2(C.gPlay.gridTot));
  check('coh = ladder 3.25 (+-0.15)', Math.abs(C.gPlay.gridCoh - T.gridCoh) <= 0.15, f2(C.gPlay.gridCoh));
  check('grid_play far under the rejected old tundra 10.40', C.gPlay.gridTot < 10.40, f2(C.gPlay.gridTot));
  check('grid_play within 0.30 of glacier ' + f2(GL.gPlay.gridTot), Math.abs(C.gPlay.gridTot - GL.gPlay.gridTot) <= 0.30,
    f2(C.gPlay.gridTot) + ' vs glacier ' + f2(GL.gPlay.gridTot) + ' -- the net adds no lattice of its own');
  check('coh within 0.30 of glacier ' + f2(GL.gPlay.gridCoh), Math.abs(C.gPlay.gridCoh - GL.gPlay.gridCoh) <= 0.30,
    f2(C.gPlay.gridCoh) + ' vs glacier ' + f2(GL.gPlay.gridCoh));

  console.log('\n(5) EDGES -- boundary step in the interlocking field over interior roughness, same stride');
  console.log('      set             step   interior   ratio');
  for (const S of [C, GL].concat(hasPerma ? [PF] : []).concat([TU, IS])) {
    console.log('      ' + S.key.padEnd(14) + f2(S.bs.step).padStart(5) + '    ' + f2(S.bs.rough).padStart(6) + '   ' + f2(S.bs.ratio).padStart(5));
  }
  check('boundary step = ladder 18.55 (+-0.6)', Math.abs(C.bs.step - T.step) <= 0.6, f2(C.bs.step));
  check('step/rough = ladder 0.84 (+-0.07)', Math.abs(C.bs.ratio - T.sr) <= 0.07, f2(C.bs.ratio));
  check('step at or under glacier ' + f2(GL.bs.step), C.bs.step <= GL.bs.step + 0.15,
    'crevasse ' + f2(C.bs.step) + ' vs glacier ' + f2(GL.bs.step) + ' -- the net adds no seam');
  check('step/rough at or under glacier ' + f2(GL.bs.ratio), C.bs.ratio <= GL.bs.ratio + 0.02,
    'crevasse ' + f2(C.bs.ratio) + ' vs glacier ' + f2(GL.bs.ratio) + ' (interior roughness rose, the seam did not)');

  console.log('\n(6) THE RIM SEAM -- do the cracks run OUT before the tile edge, or break off at it?');
  console.log('      Measured twice, independently. (a) on the MASK that was multiplied on, rebuilt from the');
  console.log('      slot seed (deterministic). (b) on the WRITTEN FILES as r = L_crevasse/L_glacier with the');
  console.log('      smooth grade plane divided out by a local 16px box mean. The fade runs over the last 11%');
  console.log('      of world distance = dpx 0-14, so dpx 1-6 must be strongly damped, dpx >=25 at full strength.');
  console.log('      slot |   dpx 1-6      |  dpx 7-14      |  dpx 15-24     |   dpx >=25     | rim/core');
  console.log('           |  mask    file  |  mask    file  |  mask    file  |  mask    file  | mask  file');
  const mProf = [], fProf = [];
  for (let n = 0; n < 4; n++) {
    const mp = maskProfile(n);
    const fp = await fileProfile(C.files[n], GL.files[n]);
    mProf.push(mp); fProf.push(fp);
    console.log('        ' + n + '  |' + mp.bands.map((b, i) => f3(b.amp).padStart(7) + f3(fp[i].amp).padStart(8) + ' ').join('|') +
      '|' + f2(mp.bands[0].amp / mp.bands[3].amp).padStart(5) + f2(fp[0].amp / fp[3].amp).padStart(6));
  }
  const mkRim = mProf.map((p) => p.bands[0].amp / p.bands[3].amp);
  const flRim = fProf.map((p) => p[0].amp / p[3].amp);
  check('MASK: net amplitude at the rim < 0.55 of the core', mkRim.every((r) => r < 0.55),
    'rim/core ' + mkRim.map((r) => f2(r)).join(' / ') + '   (ladder rimInk/coreInk 0.51-0.56)');
  check('FILE: net amplitude at the rim < 0.70 of the core', flRim.every((r) => r < 0.70),
    'rim/core ' + flRim.map((r) => f2(r)).join(' / '));
  check('MASK: amplitude rises monotonically outward on every slot',
    mProf.every((p) => p.bands[0].amp < p.bands[1].amp && p.bands[1].amp < p.bands[2].amp && p.bands[2].amp <= p.bands[3].amp * 1.03),
    mProf.map((p) => p.bands.map((b) => f3(b.amp)).join('<')).join('  |  '));
  check('FILE: amplitude rises monotonically outward on every slot',
    fProf.every((p) => p[0].amp < p[1].amp && p[1].amp < p[2].amp),
    fProf.map((p) => p.map((b) => f3(b.amp)).join('<')).join('  |  '));
  console.log('      The fade is a RAMP, not a groove-free ring: rimInk/coreInk ~0.5 means the cracks THIN OUT');
  console.log('      and close inside the tile. A 0.00 there would itself be a lattice tell (a bare rim ring).');
  check('rim ink fraction = ladder 0.53 (+-0.10): a ramp, not a bare ring',
    mProf.every((p) => Math.abs(p.rimInk - T.rimInk) <= 0.10),
    'ink_rim/ink_core ' + mProf.map((p) => f3(p.rimInk)).join(' / ') + '  (ladder 0.51 / 0.56 / 0.53 / 0.53)');
  console.log('      rimHalo (1-4px vs 10-24px inside) -- crevasse ' + C.slots.map((s) => (s.rim >= 0 ? '+' : '') + f2(s.rim)).join(' / '));
  console.log('      the same on glacier                          ' + GL.slots.map((s) => (s.rim >= 0 ? '+' : '') + f2(s.rim)).join(' / '));
  console.log('      GLACIER ITSELF carries a -1.7 to -3.1 rim halo (its diamond edge is slightly dark). The');
  console.log('      question for this biome is therefore not the absolute value, which is inherited, but');
  console.log('      whether the crack net ADDS to it.');
  const dHalo = C.slots.map((s, n) => s.rim - GL.slots[n].rim);
  check('the net changes rimHalo by <= 0.5 luma vs glacier', dHalo.every((d) => Math.abs(d) <= 0.5),
    'delta ' + dHalo.map((d) => (d >= 0 ? '+' : '') + f2(d)).join(' / ') + ' -- inherited, not added');

  console.log('\n(7) THE ACCEPTED LIMIT, stated in numbers rather than in prose.');
  const sep = await M.separability(C.bufs, GL.bufs, false);
  const sepV = await M.separability(C.bufs, GL.bufs, true);
  console.log('      d\' vs glacier at play scale (40x24 field, per-tile level and texture):');
  console.log('        plain    d_level ' + f2(sep.dLevel) + '   d_texture ' + f2(sep.dTexture) + '   d_JOINT ' + f2(sep.dJoint));
  console.log('        vacuum   d_level ' + f2(sepV.dLevel) + '   d_texture ' + f2(sepV.dTexture) + '   d_JOINT ' + f2(sepV.dJoint));
  console.log('        raw play quantities: crevasse tile mean L ' + f1(sep.A.m) + ' +-' + f2(sep.A.msd) +
    ' vs glacier ' + f1(sep.B.m) + ' +-' + f2(sep.B.msd));
  console.log('                             within-tile sd ' + f2(sep.A.s) + ' vs ' + f2(sep.B.s) + '  (x' + f2(sep.A.s / sep.B.s) + ')');
  console.log('      BOTH ARE UNDER THE 1.0 BAR. At the coarsest overview an AREA of crevasse is not told from');
  console.log('      an area of glacier by statistics. Rudi checked the picture and chose it knowingly; the');
  console.log('      scale where it does work is micro4 in (2), x' + f2(C.micro4 / GL.micro4) + ' over glacier.');
  check('d_JOINT = ladder 0.34 (+-0.30) -- the documented value, not a bar', Math.abs(sep.dJoint - T.dJoint) <= 0.30, f2(sep.dJoint));
  check('d_level <= 1.0: the LEVEL is not the separator (the lip solve held)', sep.dLevel <= 1.0,
    f2(sep.dLevel) + ' -- a level leg here would mean the cracks went deep again');

  console.log('\n(8) GROUND GUARD -- the net is only a multiplier, the ground must stay glacier.');
  console.log('      Measured over the pixels the mask never touched (D + B < 0.02), because whole-tile p70');
  console.log('      stops being a ground statistic once a net covers half the canvas.');
  console.log('      slot   untouched%    gp70   gp70(glacier, SAME pixels)   gNCC_mask   gNCC_full   blur12');
  const gsAll = [];
  for (let n = 0; n < 4; n++) {
    const gs = await M.groundStats(C.files[n], GL.files[n], M.maskFor(SEED(n), M.FINE));
    const gn = await M.groundNcc(C.files[n], GL.files[n]);
    gsAll.push({ gs, gn });
    console.log('        ' + n + '   ' + f1(100 * gs.frac).padStart(9) + '%' + f1(gs.p70).padStart(8) + f1(gs.p70g).padStart(16) +
      '       ' + f3(gs.ncc).padStart(14) + f3(gn.fine).padStart(12) + f3(gn.blur12).padStart(9));
  }
  check('gNCC over untouched pixels >= 0.97 on every slot', gsAll.every((g) => g.gs.ncc >= 0.97),
    gsAll.map((g) => f3(g.gs.ncc)).join(' / ') + '  (ladder 0.99)');
  check('ground p70 agrees with glacier p70 over the SAME pixels (+-1.0)',
    gsAll.every((g) => Math.abs(g.gs.p70 - g.gs.p70g) <= 1.0),
    gsAll.map((g) => f1(g.gs.p70) + ' vs ' + f1(g.gs.p70g)).join('  |  '));
  check('full-tile gNCC >= 0.70 (the net is dense, so this is not 1.0)', gsAll.every((g) => g.gn.fine >= 0.70),
    gsAll.map((g) => f2(g.gn.fine)).join(' / '));

  console.log('\n(9) MIRROR CONVENTION, by cross-correlation. tiltX is 0, so a ramp sign proves nothing.');
  console.log('      Mean-centred masked NCC of each crevasse slot against the SHIPPED glacier slot of the same');
  console.log('      index, in all four orientations. IDENTITY must WIN on every slot: slot n IS glacier slot n');
  console.log('      with a multiplier on it, and glacier already carries the ICE-corpus convention');
  console.log('      (glacier: 0 <- regolith_3 as is, 1 <- regolith_1 as is, 2 <- regolith_0 ROT180, 3 <- regolith_3 ROT180).');
  console.log('      slot     ident      flop      flip        hv    winner');
  const nccRows = [];
  for (let n = 0; n < 4; n++) {
    const id = await M.ncc(C.files[n], GL.files[n], false, false);
    const fo = await M.ncc(C.files[n], GL.files[n], true, false);
    const fl = await M.ncc(C.files[n], GL.files[n], false, true);
    const hv = await M.ncc(C.files[n], GL.files[n], true, true);
    const best = Math.max(id, fo, fl, hv);
    const win = best === id ? 'identity' : best === fo ? 'FLOP' : best === fl ? 'FLIP' : 'HV';
    nccRows.push({ id, fo, fl, hv, win });
    console.log('       ' + n + '     ' + f3(id).padStart(6) + f3(fo).padStart(10) + f3(fl).padStart(10) + f3(hv).padStart(10) + '    ' + win);
  }
  check('identity wins on all four slots', nccRows.every((r) => r.win === 'identity'), nccRows.map((r) => r.win).join(' / '));
  check('identity >= 0.65 and >= 5x the runner-up', nccRows.every((r) => r.id >= 0.65 && r.id >= 5 * Math.max(r.fo, r.fl, r.hv)),
    'min ident ' + f3(Math.min.apply(null, nccRows.map((r) => r.id))) +
    ', max runner-up ' + f3(Math.max.apply(null, nccRows.map((r) => Math.max(r.fo, r.fl, r.hv)))) +
    '  (ladder 0.72 / 0.81 / 0.81 / 0.71)');

  console.log('\n      THE INHERITED PAIR -- the special case of this biome. glacier slots 0 and 3 ARE the same');
  console.log('      regolith tile rotated 180 by corpus convention, so glacier\'s own worst pairwise slot-vs-slot');
  console.log('      NCC is NOT zero, it is the baseline. The question is whether the crack net DE-CORRELATES it.');
  const orients = [[0, 0], [1, 0], [0, 1], [1, 1]];
  const stampOf = async (files) => {
    let w = 0, pair = '';
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) for (const o of orients) {
      const v = Math.abs(await M.ncc(files[a], files[b], !!o[0], !!o[1]));
      if (v > w) { w = v; pair = a + 'x' + b; }
    }
    return { w, pair };
  };
  const pairOf = async (files, a, b) => {
    let w = 0;
    for (const o of orients) w = Math.max(w, Math.abs(await M.ncc(files[a], files[b], !!o[0], !!o[1])));
    return w;
  };
  const stC = await stampOf(C.files), stG = await stampOf(GL.files);
  const p03C = await pairOf(C.files, 0, 3), p03G = await pairOf(GL.files, 0, 3);
  console.log('      worst pairwise NCC   glacier ' + f2(stG.w) + ' (pair ' + stG.pair + ')     crevasse ' + f2(stC.w) + ' (pair ' + stC.pair + ')');
  console.log('      the inherited 0x3 pair specifically:  glacier ' + f2(p03G) + '  ->  crevasse ' + f2(p03C) +
    '   (x' + f2(p03C / p03G) + ')');
  check('stamp = ladder 0.47 (+-0.04)', Math.abs(stC.w - T.stamp) <= 0.04, f3(stC.w));
  check('the net DE-CORRELATES the inherited 0x3 pair', p03C < p03G - 0.20,
    f2(p03G) + ' -> ' + f2(p03C) + '  (the round-4 ladder measured 0.33-0.73 across its rungs)');

  console.log('\n(10) PAIR DISTANCE TO THE SAME-PLANET NEIGHBOURS. Corpus legs: level |dL| >= 6,');
  console.log('     hue |dB/R| >= 0.30 or |dG/R| >= 0.20, structure micro8 ratio >= 1.6 or <= 0.62.');
  console.log('     neighbour        L    B/R    G/R  micro8  micro4       dL    dB/R    dG/R  mic8 x  mic4 x   legs');
  const nb = [['glacier', GL]].concat(hasPerma ? [['permafrost', PF]] : []).concat([['tundra', TU], ['ice_shelf', IS]]);
  const rows = [];
  for (const trio of nb) {
    const nm = trio[0], S = trio[1];
    const dL = C.L - S.L, dB = C.br - S.br, dG = C.gr - S.gr, rM = C.micro / S.micro, rM4 = C.micro4 / S.micro4;
    const legs = [];
    if (Math.abs(dL) >= 6) legs.push('level');
    if (Math.abs(dB) >= 0.30 || Math.abs(dG) >= 0.20) legs.push('hue');
    if (rM >= 1.6 || rM <= 0.62) legs.push('structure');
    rows.push({ nm, legs, dL, dB, dG, rM, rM4 });
    console.log('     ' + nm.padEnd(12) + f1(S.L).padStart(6) + f3(S.br).padStart(7) + f3(S.gr).padStart(7) + f2(S.micro).padStart(8) + f2(S.micro4).padStart(8) +
      ((dL >= 0 ? '+' : '') + f1(dL)).padStart(9) + ((dB >= 0 ? '+' : '') + f2(dB)).padStart(8) +
      ((dG >= 0 ? '+' : '') + f2(dG)).padStart(8) + f2(rM).padStart(8) + f2(rM4).padStart(8) + '   ' + (legs.length ? legs.join(' + ') : 'NO LEG'));
  }
  if (!hasPerma) console.log('     (permafrost is not yet in src/assets/tiles/ -- row omitted, its integration runs in parallel)');
  for (const r of rows.slice(1)) check('separable from ' + r.nm, r.legs.length >= 1, r.legs.join(' + ') || 'none');
  console.log('\n     Against GLACIER no corpus leg fires, and that is the whole construction of the rung: same');
  console.log('     level (dL ' + f2(rows[0].dL) + '), same hue (dB/R ' + f3(rows[0].dB) + '), micro8 only x' + f2(rows[0].rM) +
    ' against a 1.60 bar. The pair lives on');
  console.log('     micro4 x' + f2(rows[0].rM4) + ' at play zoom instead. DOCUMENTED, CHOSEN AT THE PICTURE -- not asserted as a pass.');

  // ---- panels ------------------------------------------------------------
  const PAD = 18, SW = 2400;
  const rndD = M.mulberry32(90210);
  const FD = await M.isoField(C.bufs, M.TILE_W, M.TILE_H, 6, 4, () => Math.floor(rndD() * 4));
  const CW = 1400, CH = 640;
  const cl = Math.round(FD.w / 2 - CW / 2), ct = Math.round(FD.h / 2 - CH / 2);
  const junction = await sharp(FD.png).extract({ left: cl, top: ct, width: CW, height: CH }).png().toBuffer();
  const junctionV = await sharp(await M.vacuum(FD.png)).extract({ left: cl, top: ct, width: CW, height: CH }).png().toBuffer();
  const grid2 = await M.isoField(C.bufs, M.TILE_W, M.TILE_H, 4, 3, (r, c) => (r * 2 + c) % 4);

  const comp = [];
  let y = PAD;
  const line = (t, size, fill) => {
    comp.push({ input: M.label(t, SW - PAD * 2, size || 14, fill || '#c9d1d9'), left: PAD, top: y });
    y += (size || 14) + 8;
  };
  line('CREVASSE FINE-lip -- hairline net, cells 41px / cracks 5px, depth .34, solved bright lip   ' +
    new Date().toISOString().slice(0, 16), 19, '#7ee787');
  line('multiplier on the frozen shipped glacier; measured on ' + CREV_DIR.replace(ROOT, '.').replace(/\\/g, '/') + '/*.webp', 14, '#8b949e');
  y += 6;
  const TW2 = 580, TH2 = 290, GAP = 12;
  for (let n = 0; n < 4; n++) {
    const cx = PAD + n * (TW2 + GAP);
    comp.push({ input: M.label('slot ' + n + '   L ' + f1(C.slots[n].lum) + '  micro8 ' + f2(C.slots[n].micro) +
      '  micro4 ' + f2(C.slots[n].micro4) + '  blow ' + f2(100 * C.slots[n].blow) + '%', TW2, 14, '#c9d1d9'), left: cx, top: y });
    comp.push({ input: await sharp(C.bufs[n]).resize(TW2, TH2, { fit: 'fill' }).png().toBuffer(), left: cx, top: y + 22 });
  }
  y += 22 + TH2 + 16;
  line('2x2 BLOCK, deterministic slot order (r*2+c)%4 -- the strictest lattice case', 15, '#7ee787');
  const g2s = Math.min(1, (SW - PAD * 2) / grid2.w);
  comp.push({ input: await sharp(grid2.png).resize(Math.round(grid2.w * g2s), Math.round(grid2.h * g2s)).png().toBuffer(), left: PAD, top: y });
  y += Math.round(grid2.h * g2s) + 16;
  line('1:1 CROP of a four-tile junction, random draw -- do the cracks run out before the seam?', 15, '#7ee787');
  comp.push({ input: junction, left: PAD, top: y });
  y += CH + 10;
  line('the same crop under the vacuum darkening rgba(5,10,25,0.45)', 15, '#7ee787');
  comp.push({ input: junctionV, left: PAD, top: y });
  y += CH + PAD;
  fs.writeFileSync(path.join(ST, '_crevasse_prod_edges.png'),
    await sharp({ create: { width: SW, height: y, channels: 4, background: M.BGA } }).composite(comp).png().toBuffer());
  console.log('\n[panel] _crevasse_prod_edges.png');

  const cc = [];
  const panels = [];
  const mos = [['crevasse (new)', C, '#7ee787'], ['glacier (the ground AND the risk pair)', GL, '#79c0ff']]
    .concat(hasPerma ? [['permafrost', PF, '#ffa657']] : []).concat([['tundra', TU, '#d2a8ff']]);
  for (const trio of mos) {
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
  fs.writeFileSync(path.join(ST, '_crevasse_prod_mosaic.png'),
    await sharp({ create: { width: cx2, height: 34 + panels[0].h * 2 + 24, channels: 4, background: M.BGA } }).composite(cc).png().toBuffer());
  console.log('[panel] _crevasse_prod_mosaic.png');

  const mixed = await M.mixedField([C.bufs, GL.bufs], 96, 48, 14, 10, 777);
  const mixedV = await M.vacuum(mixed);
  const mm = await sharp(mixed).metadata();
  fs.writeFileSync(path.join(ST, '_crevasse_prod_vs_glacier.png'),
    await sharp({ create: { width: mm.width + 36, height: mm.height * 2 + 60, channels: 4, background: M.BGA } })
      .composite([
        { input: M.label('crevasse and glacier interlocked, 5x4 patches -- this is the pair Rudi judged', mm.width, 15, '#7ee787'), left: 18, top: 10 },
        { input: mixed, left: 18, top: 34 },
        { input: mixedV, left: 18, top: 44 + mm.height },
      ]).png().toBuffer());
  console.log('[panel] _crevasse_prod_vs_glacier.png');

  console.log('\n' + (failed === 0 ? 'ALL CHECKS PASSED' : failed + ' CHECK(S) FAILED'));
  process.exit(failed === 0 ? 0 : 1);
})();
