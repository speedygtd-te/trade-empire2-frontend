/**
 * DUST_PLAIN -- the gate. Runs against any directory holding the four
 * dust_plain_<n>.webp, so the same checks run on the candidate rung before
 * integration and on src/assets/tiles/dust_plain/ after it.
 *
 *   node scripts/dust-plain-verify.cjs assets/style-test/tiles/dust_plain/build/ramp0
 *   node scripts/dust-plain-verify.cjs                       (defaults to src/assets/tiles)
 *
 * Gates, in the brief's units:
 *   blowout           < 1 %            (LESSONS' cleanest indicator)
 *   rim               |rim| <= 4       (the brief: the new slots must not land
 *                                       at -7..-13; the finished corpus median
 *                                       is -2.7)
 *   B/R               0.80 .. 0.83     (the brief's band)
 *   tiltX             |gx| <= 0.5      (the lateral component costs nothing
 *                                       and is the cause of the quilt)
 *   inter-slot |NCC|  <= 0.10 in every orientation (no slot repeats another)
 *   seam step/rough   reported, compared against the shipped set
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const L = require('./tiles-dust-plain-lib.cjs');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const DIR = path.resolve(process.argv[2] || path.join(ROOT, 'src', 'assets', 'tiles', 'dust_plain'));
const SHIP = path.join(ROOT, 'assets', 'style-test', 'tiles', 'dust_plain', 'src');
const { f1, f2, f3 } = L;

const MIPS = [['@half', 256, 128], ['@quarter', 128, 64], ['@eighth', 64, 32]];

(async () => {
  console.log('verifying ' + DIR + '\n');
  const fails = [];
  const S = [];
  console.log('slot   mean    p70   B/R    G/R    sat%  blow%    sd    tiltX   tiltY    rim   micro8');
  for (let n = 0; n < 4; n++) {
    const f = path.join(DIR, 'dust_plain_' + n + '.webp');
    if (!fs.existsSync(f)) throw new Error('missing ' + f);
    const md = await sharp(fs.readFileSync(f)).metadata();
    if (md.width !== 512 || md.height !== 256) fails.push('slot' + n + ' is ' + md.width + 'x' + md.height + ', not 512x256');
    if (!md.hasAlpha) fails.push('slot' + n + ' has no alpha');
    const s = await L.statsOf(f);
    const mip = path.join(DIR, 'dust_plain_' + n + '@eighth.webp');
    s.micro = fs.existsSync(mip) ? await L.microContrast(mip) : NaN;
    s.buf = fs.readFileSync(f);
    S.push(s);
    console.log(' ' + n + '   ' + f1(s.intLum).padStart(6) + f1(s.p70).padStart(7) + '  ' + f3(s.br) + '  ' + f3(s.gr) +
      f1(100 * s.sat).padStart(7) + f2(100 * s.blow).padStart(7) + f1(s.sd).padStart(7) +
      f1(s.gx).padStart(8) + f1(s.gy).padStart(8) + f1(s.rim).padStart(8) + f2(s.micro).padStart(8));
    if (s.blow >= 0.01) fails.push('slot' + n + ' blowout ' + f2(100 * s.blow) + '% >= 1%');
    if (Math.abs(s.rim) > 4) fails.push('slot' + n + ' rim ' + f1(s.rim) + ' outside +-4');
    if (s.br < 0.80 || s.br > 0.83) fails.push('slot' + n + ' B/R ' + f3(s.br) + ' outside 0.80..0.83');
    if (Math.abs(s.gx) > 0.5) fails.push('slot' + n + ' tiltX ' + f1(s.gx) + ' outside +-0.5');
  }
  const spread = (k) => Math.max.apply(null, S.map((s) => s[k])) - Math.min.apply(null, S.map((s) => s[k]));
  console.log('\n  spread across the four:  p70 ' + f1(spread('p70')) + '   B/R ' + f3(spread('br')) +
    '   tiltY ' + f1(spread('gy')) + '   rim ' + f1(spread('rim')) +
    '   sd ' + f1(spread('sd')) + ' (deliberate: two grainy, two smooth)');

  // ---- mips present and correctly sized ---------------------------------
  const want = ['dust_plain_0.webp', 'dust_plain_1.webp', 'dust_plain_2.webp', 'dust_plain_3.webp'];
  for (let n = 0; n < 4; n++) for (const m of MIPS) { want.push('dust_plain_' + n + m[0] + '.webp'); want.push('dust_plain_' + n + m[0] + '.png'); }
  const have = fs.readdirSync(DIR);
  const missing = want.filter((f) => !have.includes(f));
  if (DIR.includes('src' + path.sep + 'assets')) {
    if (missing.length) fails.push('missing files: ' + missing.join(', '));
    else {
      for (let n = 0; n < 4; n++) for (const m of MIPS) for (const ext of ['webp', 'png']) {
        const md = await sharp(fs.readFileSync(path.join(DIR, 'dust_plain_' + n + m[0] + '.' + ext))).metadata();
        if (md.width !== m[1] || md.height !== m[2]) fails.push('dust_plain_' + n + m[0] + '.' + ext + ' is ' + md.width + 'x' + md.height);
      }
      console.log('  ' + want.length + ' files present, every mip at its nominal size');
    }
    const extra = have.filter((f) => !want.includes(f));
    if (extra.length) console.log('  unexpected extras: ' + extra.join(', '));
  }

  // ---- cross-correlation -------------------------------------------------
  console.log('\n  inter-slot NCC, worst of the four orientations');
  let mx = 0;
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const v = await L.nccAll(S[i].buf, S[j].buf);
    const k = Object.keys(v).reduce((a, b) => (Math.abs(v[b]) > Math.abs(v[a]) ? b : a), 'id');
    mx = Math.max(mx, Math.abs(v[k]));
    console.log('     ' + i + ' vs ' + j + '   id ' + f3(v.id).padStart(6) + '  flop ' + f3(v.flop).padStart(6) +
      '  flip ' + f3(v.flip).padStart(6) + '  r180 ' + f3(v.r180).padStart(6) + '   worst ' + k + ' ' + f3(v[k]));
    if (Math.abs(v[k]) > 0.10) fails.push('slots ' + i + '/' + j + ' correlate ' + f3(v[k]) + ' on ' + k);
  }
  console.log('     -> worst |NCC| over all pairs and orientations: ' + f3(mx));

  // ---- mirror proof: written slot vs its own pre-mirror buffer ------------
  const preDir = fs.existsSync(path.join(DIR, 'pre_0.webp')) ? DIR : null;
  if (preDir) {
    console.log('\n  mirror proof -- each written slot against its own pre-mirror buffer');
    for (let n = 0; n < 4; n++) {
      const v = await L.nccAll(S[n].buf, fs.readFileSync(path.join(preDir, 'pre_' + n + '.webp')));
      console.log('     slot' + n + '  id ' + f3(v.id).padStart(6) + '  flop ' + f3(v.flop).padStart(6) +
        '  flip ' + f3(v.flip).padStart(6) + '  r180 ' + f3(v.r180).padStart(6));
    }
  }

  // ---- the lattice -------------------------------------------------------
  const g = await L.gridOf(S.map((s) => s.buf));
  console.log('\n  lattice:  grid_play ' + f2(g.play.gridTot) + '  coh ' + f2(g.play.gridCoh) + '  slot ' + f2(g.play.gridSlot));
  console.log('            seam step/rough ' + f2(g.bs.step) + '/' + f2(g.bs.rough) + '   RATIO ' + f2(g.bs.ratio));
  if (fs.existsSync(path.join(SHIP, 'dust_plain_0_src.webp'))) {
    const old = [0, 1, 2, 3].map((n) => fs.readFileSync(path.join(SHIP, 'dust_plain_' + n + '_src.webp')));
    const go = await L.gridOf(old);
    console.log('  shipped:  grid_play ' + f2(go.play.gridTot) + '  coh ' + f2(go.play.gridCoh) + '  slot ' + f2(go.play.gridSlot));
    console.log('            seam step/rough ' + f2(go.bs.step) + '/' + f2(go.bs.rough) + '   RATIO ' + f2(go.bs.ratio));
  }

  console.log('\n' + (fails.length ? 'FAILED:\n  - ' + fails.join('\n  - ') : 'PASSED -- every gate green'));
  if (fails.length) process.exitCode = 1;
})();
