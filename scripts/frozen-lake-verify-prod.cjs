/**
 * VERIFY the integrated frozen_lake set in src/assets/tiles/frozen_lake/ against
 * the targets of the L51B152 rung -- measured on the WRITTEN .webp files that
 * actually ship, not on any buffer (libwebp drops RGB under alpha 0 and the
 * diamond corners are ~50% of the canvas -> ~+1.5 luma drift).
 *
 * The metric code is not re-implemented here: the measurement functions are
 * lifted verbatim out of scripts/tiles-frozen-lake-ladder.cjs (whose gridMetrics
 * and boundaryStep are in turn verbatim from the tundra/crevasse/glacier
 * ladders), so the numbers are directly comparable to the ladder table.
 *
 * WHAT IS CHECKED
 *   levels/hue        L, B/R, G/R against the rung targets
 *   blowout           must be under 1%
 *   seam              boundary step over interior roughness -- the metric that
 *                     decides on a smooth tile, because what is visible on a
 *                     blank field is the diamond edge and not much else
 *   grid_play / coh   the lattice fold at play scale, against the family bars
 *   rim               the diamond's own halo
 *   mirror            NCC of slots 2/3 against slots 0..3 in all four
 *                     orientations -- at tiltX 0 the light-ramp sign is useless
 *   pair distances    diagnostic only, never a gate
 *   glacier untouched md5 of every file in src/assets/tiles/glacier/
 *
 * Writes only diagnostics into assets/style-test/tiles/_frozen_lake_prod_*.
 * Usage: node scripts/frozen-lake-verify-prod.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const DST = path.join(TILES, 'frozen_lake');
const RUNG = path.join(ST, 'frozen_lake', 'ladder', 'L51B152');

// ---- lift the ladder's measurement code, verbatim --------------------------
const LADDER = path.join(__dirname, 'tiles-frozen-lake-ladder.cjs');
const srcTxt = fs.readFileSync(LADDER, 'utf8');
const cut = srcTxt.indexOf('\n(async () => {');
if (cut < 0) throw new Error('cannot find the ladder IIFE');
const NAMES = ['statsRaw', 'statsOf', 'microContrast', 'rimHalo', 'gridMetrics', 'isoField',
  'lumaOf', 'lumaA', 'nccOf', 'nccAll', 'boundaryStep', 'gridOf', 'mulberry32', 'vacuum',
  'label', 'TILE_W', 'TILE_H', 'PLAY_W', 'PLAY_H', 'BGA', 'L709', 'RIM_CUT', 'WEBP', 'FLOP'];
const M = new Function('require', '__dirname', '__filename',
  srcTxt.slice(0, cut) + '\nreturn {' + NAMES.join(',') + '};')(require, __dirname, LADDER);

const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);
const TARGET = { L: 51.0, br: 1.520, gr: 1.312 };
const BARS = [
  ['permafrost', 2.91, 2.51], ['tundra (new)', 2.60, 2.43],
  ['glacier', 5.79, 3.22], ['crevasse', 5.83, 3.26], ['tundra (REJECTED old)', 10.40, 1.12],
];

(async () => {
  let fail = 0;
  const bad = (msg) => { console.log('   !! ' + msg); fail++; };

  // ---- the four shipped slots -------------------------------------------
  console.log('[shipped set] src/assets/tiles/frozen_lake/, measured on the .webp that ships\n');
  const slots = [], bufs = [];
  for (let n = 0; n < 4; n++) {
    const f = path.join(DST, 'frozen_lake_' + n + '.webp');
    const meta = await sharp(fs.readFileSync(f)).metadata();
    if (meta.width !== 512 || meta.height !== 256) bad('frozen_lake_' + n + '.webp is ' + meta.width + 'x' + meta.height);
    if (!meta.hasAlpha) bad('frozen_lake_' + n + '.webp has no alpha');
    const s = await M.statsOf(f);
    s.micro = await M.microContrast(path.join(DST, 'frozen_lake_' + n + '@eighth.webp'));
    s.rim = await M.rimHalo(f);
    slots.push(s);
    bufs.push(await sharp(fs.readFileSync(f)).png().toBuffer());
    console.log('   slot' + n + (M.FLOP[n] ? ' (flop)' : '      ') +
      '  L ' + f1(s.lum).padStart(5) + '  B/R ' + f3(s.br) + '  G/R ' + f3(s.gr) +
      '  micro8 ' + f2(s.micro) + '  sd ' + f2(s.sd) +
      '  blowout ' + f3(100 * s.blow) + '%  p99 ' + f1(s.p99) + '  rim ' + f2(s.rim).padStart(6) +
      '  chroma ' + f2(100 * s.chromaRes) + '%');
  }
  const av = (k) => slots.reduce((a, x) => a + x[k], 0) / 4;
  console.log('   ----' +
    '\n   mean       L ' + f1(av('lum')).padStart(5) + '  B/R ' + f3(av('br')) + '  G/R ' + f3(av('gr')) +
    '  micro8 ' + f2(av('micro')) + '  blowout ' + f3(100 * av('blow')) + '%  rim ' + f2(av('rim')));
  if (Math.abs(av('lum') - TARGET.L) > 0.5) bad('L ' + f1(av('lum')) + ' off target ' + f1(TARGET.L));
  if (Math.abs(av('br') - TARGET.br) > 0.02) bad('B/R ' + f3(av('br')) + ' off target ' + f3(TARGET.br));
  if (Math.abs(av('gr') - TARGET.gr) > 0.02) bad('G/R ' + f3(av('gr')) + ' off target ' + f3(TARGET.gr));
  if (100 * av('blow') >= 1.0) bad('blowout ' + f3(100 * av('blow')) + '% is not under 1%');
  for (let n = 0; n < 4; n++) if (100 * slots[n].blow >= 1.0) bad('slot' + n + ' blowout ' + f3(100 * slots[n].blow) + '%');

  // ---- the shipped bytes must BE the rung --------------------------------
  console.log('\n[provenance] shipped .webp vs a fresh encode of the rung PNG');
  for (let n = 0; n < 4; n++) {
    const re = await sharp(fs.readFileSync(path.join(RUNG, 'frozen_lake_' + n + '.png'))).webp(M.WEBP).toBuffer();
    const same = re.equals(fs.readFileSync(path.join(DST, 'frozen_lake_' + n + '.webp')));
    console.log('   slot' + n + ': ' + (same ? 'byte-identical to L51B152/frozen_lake_' + n + '.png' : 'DIFFERS'));
    if (!same) bad('slot' + n + ' is not the L51B152 rung');
  }

  // ---- mips present and the right size -----------------------------------
  console.log('\n[mips]');
  const MIPS = [['@half', 256, 128], ['@quarter', 128, 64], ['@eighth', 64, 32]];
  for (let n = 0; n < 4; n++) for (const [suf, w, h] of MIPS) for (const ext of ['webp', 'png']) {
    const f = path.join(DST, 'frozen_lake_' + n + suf + '.' + ext);
    if (!fs.existsSync(f)) { bad('missing ' + path.basename(f)); continue; }
    const md = await sharp(fs.readFileSync(f)).metadata();
    if (md.width !== w || md.height !== h) bad(path.basename(f) + ' is ' + md.width + 'x' + md.height);
  }
  console.log('   24 mip files, ' + (fail ? 'SEE FAILURES ABOVE' : 'all present at the right sizes'));

  // ---- the lattice and the seam ------------------------------------------
  const g = await M.gridOf(bufs);
  console.log('\n[lattice + seam]');
  console.log('   grid_play  ' + f2(g.play.gridTot) + '   coh ' + f2(g.play.gridCoh) + '   slot ' + f2(g.play.gridSlot) +
    '   ramp_pp ' + f2(g.play.rampPP) + '   sd_within ' + f2(g.play.sdWithin) + '   ratio ' + f3(g.play.ratio));
  console.log('   full-res   ' + f2(g.full.gridTot) + '   coh ' + f2(g.full.gridCoh));
  console.log('   SEAM       step ' + f2(g.bs.step) + '   rough ' + f2(g.bs.rough) + '   RATIO ' + f2(g.bs.ratio) +
    '     <- the metric that decides on a smooth tile');
  console.log('   bars:      ' + BARS.map((b) => b[0] + ' ' + f2(b[1]) + '/' + f2(b[2])).join('  |  '));
  if (g.play.gridTot > 2.60) bad('grid_play ' + f2(g.play.gridTot) + ' is above the new tundra bar 2.60');
  if (g.bs.ratio > 1.30) bad('seam ratio ' + f2(g.bs.ratio) + ' is above 1.30');
  if (Math.abs(av('rim')) > 1.0) bad('rim ' + f2(av('rim')) + ' exceeds +-1.0');

  // ---- the mirror proof ---------------------------------------------------
  console.log('\n[mirror] every slot against every slot, all four orientations');
  console.log('          the flop of a pre-mirror pair is the ICE convention; .flip must never fire');
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const v = await M.nccAll(bufs[i], bufs[j]);
    console.log('   slot' + i + ' vs slot' + j + ':  id ' + f3(v.id).padStart(6) + '   flop ' + f3(v.flop).padStart(6) +
      '   flip ' + f3(v.flip).padStart(6) + '   r180 ' + f3(v.r180).padStart(6));
  }
  console.log('\n[mirror] each shipped slot against its own PRE-MIRROR ladder window');
  for (let n = 0; n < 4; n++) {
    const pre = fs.readFileSync(path.join(RUNG, 'pre_' + n + '.webp'));
    const v = await M.nccAll(bufs[n], await sharp(pre).png().toBuffer());
    const want = M.FLOP[n] ? 'flop' : 'id';
    const ok = v[want] > 0.90 && ['id', 'flop', 'flip', 'r180'].filter((k) => k !== want).every((k) => Math.abs(v[k]) < 0.10);
    console.log('   slot' + n + ' (' + (M.FLOP[n] ? 'flopped' : 'as cut ') + '):  id ' + f3(v.id).padStart(6) +
      '   flop ' + f3(v.flop).padStart(6) + '   flip ' + f3(v.flip).padStart(6) + '   r180 ' + f3(v.r180).padStart(6) +
      '     expected ' + want.toUpperCase() + ' -> ' + (ok ? 'PROVEN' : 'NOT PROVEN'));
    if (!ok) bad('slot' + n + ' does not prove the ' + want + ' convention');
  }

  // ---- pair distances, diagnostic only -----------------------------------
  console.log('\n[pair distances -- DIAGNOSTIC, NOT A GATE]');
  for (const fam of ['glacier', 'crevasse', 'permafrost', 'tundra', 'ice_shelf', 'snow_peak']) {
    const dir = path.join(TILES, fam);
    if (!fs.existsSync(dir)) continue;
    let L = 0, br = 0, mi = 0, nn = 0;
    for (let n = 0; n < 4; n++) {
      const f = path.join(dir, fam + '_' + n + '.webp');
      if (!fs.existsSync(f)) continue;
      const s = await M.statsOf(f); L += s.lum; br += s.br;
      mi += await M.microContrast(path.join(dir, fam + '_' + n + '@eighth.webp')); nn++;
    }
    L /= nn; br /= nn; mi /= nn;
    console.log('   ' + fam.padEnd(12) + ' dL ' + ((av('lum') - L >= 0 ? '+' : '') + f1(av('lum') - L)).padStart(6) +
      '   dB/R ' + ((av('br') - br >= 0 ? '+' : '') + f2(av('br') - br)).padStart(6) +
      '   micro ratio ' + f2(av('micro') / (mi || 1e-6)));
  }

  // ---- glacier untouched --------------------------------------------------
  console.log('\n[glacier] src/assets/tiles/glacier/ must be exactly what the plate was built from');
  let glOk = true;
  for (let n = 0; n < 4; n++) {
    const frozen = path.join(ST, 'frozen_lake', 'src', 'glacier_' + n + '_src.webp');
    const live = path.join(TILES, 'glacier', 'glacier_' + n + '.webp');
    const same = fs.readFileSync(frozen).equals(fs.readFileSync(live));
    if (!same) { glOk = false; bad('glacier_' + n + ' differs from the frozen source'); }
  }
  console.log('   ' + (glOk ? 'all four glacier tiles byte-identical to the frozen sources -- UNTOUCHED' : 'GLACIER HAS MOVED'));

  // ---- the look sheet -----------------------------------------------------
  {
    const SW = 2200, PAD = 18;
    const comp = []; let y = PAD;
    const ln = (t, size, fill) => { size = size || 13; comp.push({ input: M.label(t, SW - PAD * 2, size, fill || '#c9d1d9'), left: PAD, top: y }); y += size + 7; };
    ln('frozen_lake AS SHIPPED -- src/assets/tiles/frozen_lake/   rung L51B152   tiltY 0.0 / tiltX 0.0', 19, '#7ee787');
    ln('L ' + f1(av('lum')) + '  B/R ' + f3(av('br')) + '  G/R ' + f3(av('gr')) + '  micro8 ' + f2(av('micro')) +
      '  blowout ' + f3(100 * av('blow')) + '%  rim ' + f2(av('rim')) +
      '   grid_play ' + f2(g.play.gridTot) + ' coh ' + f2(g.play.gridCoh) +
      '   SEAM ' + f2(g.bs.step) + '/' + f2(g.bs.rough) + ' ratio ' + f2(g.bs.ratio), 14, '#ffa657');
    y += 6;
    ln('THE FOUR SHIPPED SLOTS   (0,1 as cut  |  2,3 flopped)', 15, '#7ee787');
    for (let n = 0; n < 4; n++) comp.push({ input: bufs[n], left: PAD + n * 522, top: y });
    y += 256 + 10;
    ln('INTERLOCKED MOSAIC, full res', 15, '#7ee787');
    const rndF = M.mulberry32(90210);
    const FD = await M.isoField(bufs, M.TILE_W, M.TILE_H, 6, 4, () => Math.floor(rndF() * 4));
    const sc = Math.min(1, (SW - PAD * 2) / FD.w);
    comp.push({ input: await sharp(FD.png).resize(Math.round(FD.w * sc), Math.round(FD.h * sc)).png().toBuffer(), left: PAD, top: y });
    y += Math.round(FD.h * sc) + 12;
    ln('PLAY SCALE 48x24      |      under the VACUUM darkening rgba(5,10,25,0.45)', 15, '#7ee787');
    const rndP = M.mulberry32(90210);
    const PD = await M.isoField(bufs, M.PLAY_W, M.PLAY_H, 40, 22, () => Math.floor(rndP() * 4));
    comp.push({ input: PD.png, left: PAD, top: y });
    comp.push({ input: await M.vacuum(PD.png), left: PAD + PD.w + 24, top: y });
    y += PD.h + PAD;
    const f = path.join(ST, '_frozen_lake_prod_SHIPPED.png');
    fs.writeFileSync(f, await sharp({ create: { width: SW, height: y, channels: 4, background: M.BGA } }).composite(comp).png().toBuffer());
    console.log('\n[sheet] ' + path.basename(f));
  }

  console.log('\n' + (fail ? 'VERIFY FAILED -- ' + fail + ' problem(s)' : 'VERIFY PASSED'));
  process.exit(fail ? 1 : 0);
})();
