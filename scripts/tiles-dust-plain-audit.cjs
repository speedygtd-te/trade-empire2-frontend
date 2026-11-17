/**
 * DUST_PLAIN -- STEP 1: AUDIT. Reads only, writes only into
 * assets/style-test/tiles/. src/assets/tiles/ is never touched.
 *
 * Reports in the BRIEF'S units: tiltX/tiltY are the least-squares luminance
 * slope on the normalised coordinates, rim is outer-band minus inner-half.
 * Both were calibrated against the brief's four rows in
 * scripts/tiles-dust-plain-probe-metrics.cjs.
 *
 * Answers, with numbers:
 *   1. Do the metric definitions reproduce the four rows the brief hands me?
 *   2. What is the mirror convention IN THE SHIPPED CORPUS (not assumed)?
 *   3. Is dust_plain itself mirrored today?
 *   4. Corpus baseline for the rim seam and for the vertical ramp gy, so
 *      "must not land at -7..-13" and "tundra 3.0 / frozen_lake 0.0" have a
 *      reference measured here rather than quoted.
 *   5. The hue curve k = (G/R-1)/(B/R-1) among the finished WARM tiles. The
 *      ICE k of 0.60 was fitted on blue tiles and must not be assumed below
 *      B/R 1.
 *
 * Usage: node scripts/tiles-dust-plain-audit.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const L = require('./tiles-dust-plain-lib.cjs');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const WORK = path.join(ROOT, 'assets', 'style-test', 'tiles', 'dust_plain');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const { f1, f2, f3 } = L;

const BIOME = 'dust_plain';
const BRIEF = [
  { mean: 152.2, p70: 161.2, br: 0.705, gr: 0.878, sat: 29.5, blow: 0.0, sd: 15.6, gx: -0.9, gy: -22.1, rim: -7.4 },
  { mean: 159.4, p70: 162.4, br: 0.804, gr: 0.901, sat: 19.6, blow: 0.0, sd: 5.8, gx: -2.3, gy: -8.1, rim: -3.9 },
  { mean: 147.0, p70: 156.6, br: 0.825, gr: 0.907, sat: 17.5, blow: 0.0, sd: 15.4, gx: -2.7, gy: -31.6, rim: -7.7 },
  { mean: 147.6, p70: 159.7, br: 0.772, gr: 0.892, sat: 22.8, blow: 0.1, sd: 19.0, gx: -24.6, gy: -23.7, rim: -13.1 },
];

(async () => {
  fs.mkdirSync(path.join(WORK, 'src'), { recursive: true });

  // ---------------------------------------------------------------- 1 -----
  console.log('[1] dust_plain as shipped -- measured on the WRITTEN .webp, brief units\n');
  console.log('slot   mean    p70   B/R    G/R    sat%  blow%    sd    tiltX   tiltY    rim   micro8  canvasL');
  const cur = [];
  for (let n = 0; n < 4; n++) {
    const f = path.join(TILES, BIOME, BIOME + '_' + n + '.webp');
    const s = await L.statsOf(f);
    s.micro = await L.microContrast(path.join(TILES, BIOME, BIOME + '_' + n + '@eighth.webp'));
    s.rimHalo = await L.rimHalo(f);
    s.buf = fs.readFileSync(f);
    fs.writeFileSync(path.join(WORK, 'src', BIOME + '_' + n + '_src.webp'), s.buf);
    cur.push(s);
    console.log(' ' + n + '   ' + f1(s.intLum).padStart(6) + f1(s.p70).padStart(7) + '  ' + f3(s.br) + '  ' + f3(s.gr) +
      f1(100 * s.sat).padStart(7) + f1(100 * s.blow).padStart(7) + f1(s.sd).padStart(7) +
      f1(s.gx).padStart(8) + f1(s.gy).padStart(8) + f1(s.rim).padStart(8) +
      f2(s.micro).padStart(8) + f1(s.lum).padStart(9));
  }
  console.log('\n  brief for comparison:');
  for (let n = 0; n < 4; n++) { const b = BRIEF[n];
    console.log(' ' + n + '   ' + f1(b.mean).padStart(6) + f1(b.p70).padStart(7) + '  ' + f3(b.br) + '  ' + f3(b.gr) +
      f1(b.sat).padStart(7) + f1(b.blow).padStart(7) + f1(b.sd).padStart(7) +
      f1(b.gx).padStart(8) + f1(b.gy).padStart(8) + f1(b.rim).padStart(8)); }
  const rms = (k) => Math.sqrt(cur.reduce((a, s, i) => a + Math.pow((k === 'mean' ? s.intLum : k === 'sat' ? 100 * s.sat : k === 'blow' ? 100 * s.blow : s[k]) - BRIEF[i][k], 2), 0) / 4);
  console.log('  rms vs brief:  mean ' + f2(rms('mean')) + '  p70 ' + f2(rms('p70')) + '  B/R ' + f3(rms('br')) +
    '  G/R ' + f3(rms('gr')) + '  sat ' + f2(rms('sat')) + '  sd ' + f2(rms('sd')) +
    '  tiltX ' + f2(rms('gx')) + '  tiltY ' + f2(rms('gy')) + '  rim ' + f2(rms('rim')));
  console.log('\n   k = (G/R-1)/(B/R-1) per slot: ' + cur.map((s) => f3((s.gr - 1) / (s.br - 1))).join('  '));

  // ---------------------------------------------------------------- 3 -----
  console.log('\n[3] dust_plain inter-slot NCC, all four orientations (is it mirrored today?)');
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const v = await L.nccAll(cur[i].buf, cur[j].buf);
    console.log('   ' + i + ' vs ' + j + '   id ' + f3(v.id).padStart(6) + '   flop ' + f3(v.flop).padStart(6) +
      '   flip ' + f3(v.flip).padStart(6) + '   r180 ' + f3(v.r180).padStart(6));
  }

  // ---------------------------------------------------------------- 2+4+5 -
  const fams = fs.readdirSync(TILES).filter((d) => fs.statSync(path.join(TILES, d)).isDirectory());
  const rows = [];
  for (const fam of fams) {
    const files = [0, 1, 2, 3].map((n) => path.join(TILES, fam, fam + '_' + n + '.webp'));
    if (!files.every((f) => fs.existsSync(f))) continue;
    const S = [];
    for (const f of files) { const s = await L.statsOf(f); s.buf = fs.readFileSync(f); S.push(s); }
    const av = (k) => S.reduce((a, s) => a + s[k], 0) / 4;
    const m20 = await L.nccAll(S[2].buf, S[0].buf);
    const m31 = await L.nccAll(S[3].buf, S[1].buf);
    const best = (v) => Object.keys(v).reduce((a, k) => (Math.abs(v[k]) > Math.abs(v[a]) ? k : a), 'id');
    rows.push({ fam, blow: av('blow'), rim: av('rim'), br: av('br'), gr: av('gr'), lum: av('intLum'),
      gx: S.map((s) => s.gx), gy: S.map((s) => s.gy),
      b20: best(m20), b31: best(m31), v20: m20[best(m20)], v31: m31[best(m31)] });
  }
  const done = rows.filter((r) => r.blow < 0.01);
  const raw = rows.filter((r) => r.blow >= 0.01);
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };

  console.log('\n[2] MIRROR CONVENTION, read off every 4-slot biome in src/assets/tiles/');
  console.log('    (best-|NCC| orientation of slot2 vs slot0 and slot3 vs slot1; "-" = no relation)');
  console.log('    biome                blow%    2vs0            3vs1');
  const conv = {};
  for (const r of rows.slice().sort((a, b) => a.fam.localeCompare(b.fam))) {
    const s20 = Math.abs(r.v20) > 0.30 ? r.b20 + ' ' + f3(r.v20) : '-    ' + f3(r.v20);
    const s31 = Math.abs(r.v31) > 0.30 ? r.b31 + ' ' + f3(r.v31) : '-    ' + f3(r.v31);
    console.log('    ' + r.fam.padEnd(18) + f1(100 * r.blow).padStart(7) + '   ' + s20.padEnd(15) + ' ' + s31 +
      (r.blow >= 0.01 ? '   [ORIGINAL]' : ''));
    if (r.blow < 0.01) {
      if (Math.abs(r.v20) > 0.30) conv[r.b20] = (conv[r.b20] || 0) + 1;
      if (Math.abs(r.v31) > 0.30) conv[r.b31] = (conv[r.b31] || 0) + 1;
    }
  }
  console.log('\n    tally over the FINISHED biomes only: ' + JSON.stringify(conv));

  console.log('\n[4a] RIM baseline, brief units. finished biomes (blowout < 1%):');
  for (const r of done.slice().sort((a, b) => a.rim - b.rim)) console.log('    ' + r.fam.padEnd(18) + f1(r.rim).padStart(7));
  const rd = done.map((r) => r.rim);
  console.log('    n=' + rd.length + '  min ' + f1(Math.min.apply(null, rd)) + '  median ' + f1(med(rd)) +
    '  max ' + f1(Math.max.apply(null, rd)) + '  mean ' + f1(rd.reduce((a, b) => a + b, 0) / rd.length));
  console.log('    untouched originals: median ' + f1(med(raw.map((r) => r.rim))) + '  (n=' + raw.length + ')');

  console.log('\n[4b] VERTICAL RAMP gy of the finished biomes -- what does the corpus actually carry?');
  console.log('    biome              gy (4 slots)                       gx (4 slots)');
  for (const r of done.slice().sort((a, b) => a.fam.localeCompare(b.fam))) {
    console.log('    ' + r.fam.padEnd(17) + r.gy.map((v) => f1(v).padStart(7)).join('') + '   ' + r.gx.map((v) => f1(v).padStart(7)).join(''));
  }
  const allgy = [].concat.apply([], done.map((r) => r.gy)), allgx = [].concat.apply([], done.map((r) => r.gx));
  console.log('    all finished slots: |gy| median ' + f1(med(allgy.map(Math.abs))) + '   |gx| median ' + f1(med(allgx.map(Math.abs))));

  console.log('\n[5] HUE CURVE k = (G/R-1)/(B/R-1) among FINISHED WARM biomes (B/R 0.60..0.97):');
  const warm = done.filter((r) => r.br < 0.97 && r.br > 0.60).sort((a, b) => a.br - b.br);
  const ks = [];
  for (const r of warm) {
    const k = (r.gr - 1) / (r.br - 1);
    ks.push(k);
    console.log('    ' + r.fam.padEnd(18) + ' B/R ' + f3(r.br) + '  G/R ' + f3(r.gr) + '  k ' + f3(k) + '  L ' + f1(r.lum).padStart(6));
  }
  console.log('    n=' + ks.length + '  median k ' + f3(med(ks)) + '  mean k ' + f3(ks.reduce((a, b) => a + b, 0) / ks.length));

  // ---- lattice + sheet ---------------------------------------------------
  const bufs = cur.map((s) => s.buf);
  const g = await L.gridOf(bufs);
  console.log('\n[6] dust_plain as shipped, in the lattice:');
  console.log('    grid_play ' + f2(g.play.gridTot) + '  coh ' + f2(g.play.gridCoh) + '  slot ' + f2(g.play.gridSlot));
  console.log('    seam step/rough ' + f2(g.bs.step) + '/' + f2(g.bs.rough) + '  RATIO ' + f2(g.bs.ratio));

  const SW = 2200, PAD = 18;
  const comp = []; let y = PAD;
  const ln = (t, size, fill) => { size = size || 13; comp.push({ input: L.label(t, SW - PAD * 2, size, fill || '#c9d1d9'), left: PAD, top: y }); y += size + 7; };
  ln('DUST_PLAIN -- AS SHIPPED (audit, nothing changed)   ' + new Date().toISOString().slice(0, 16), 20, '#79c0ff');
  ln('slot   mean    p70   B/R    G/R    sat%  blow%    sd    tiltX   tiltY    rim   micro8', 13, '#8b949e');
  for (let n = 0; n < 4; n++) { const s = cur[n];
    ln(' ' + n + '   ' + f1(s.intLum).padStart(6) + f1(s.p70).padStart(7) + '  ' + f3(s.br) + '  ' + f3(s.gr) +
      f1(100 * s.sat).padStart(7) + f1(100 * s.blow).padStart(7) + f1(s.sd).padStart(7) +
      f1(s.gx).padStart(8) + f1(s.gy).padStart(8) + f1(s.rim).padStart(8) + f2(s.micro).padStart(8), 13, '#c9d1d9'); }
  ln('grid_play ' + f2(g.play.gridTot) + ' coh ' + f2(g.play.gridCoh) + '   seam ' + f2(g.bs.step) + '/' + f2(g.bs.rough) + ' ratio ' + f2(g.bs.ratio), 14, '#ffa657');
  y += 6;
  ln('THE FOUR SLOTS AS SHIPPED', 15, '#7ee787');
  for (let n = 0; n < 4; n++) comp.push({ input: await sharp(bufs[n]).resize(512, 256, { fit: 'fill' }).png().toBuffer(), left: PAD + n * 522, top: y });
  y += 256 + 10;
  ln('2x2 -- fixed repeat, full res', 15, '#7ee787');
  const F22 = await L.isoField(bufs, L.TILE_W, L.TILE_H, 6, 4, (r, c) => (r % 2) * 2 + (c % 2));
  let sc = Math.min(1, (SW - PAD * 2) / F22.w);
  comp.push({ input: await sharp(F22.png).resize(Math.round(F22.w * sc), Math.round(F22.h * sc)).png().toBuffer(), left: PAD, top: y });
  y += Math.round(F22.h * sc) + 12;
  ln('INTERLOCKED MOSAIC -- random slots, full res', 15, '#7ee787');
  const rndF = L.mulberry32(90210);
  const FD = await L.isoField(bufs, L.TILE_W, L.TILE_H, 6, 4, () => Math.floor(rndF() * 4));
  sc = Math.min(1, (SW - PAD * 2) / FD.w);
  comp.push({ input: await sharp(FD.png).resize(Math.round(FD.w * sc), Math.round(FD.h * sc)).png().toBuffer(), left: PAD, top: y });
  y += Math.round(FD.h * sc) + 12;
  ln('PLAY SCALE 48x24      |      under the vacuum darkening', 15, '#7ee787');
  const rndP = L.mulberry32(90210);
  const PD = await L.isoField(bufs, L.PLAY_W, L.PLAY_H, 40, 22, () => Math.floor(rndP() * 4));
  comp.push({ input: PD.png, left: PAD, top: y });
  comp.push({ input: await L.vacuum(PD.png), left: PAD + PD.w + 24, top: y });
  y += PD.h + PAD;
  fs.writeFileSync(path.join(ST, '_dust_plain_AUDIT.png'),
    await sharp({ create: { width: SW, height: y, channels: 4, background: L.BGA } }).composite(comp).png().toBuffer());
  console.log('\n[sheet] _dust_plain_AUDIT.png');
})();
