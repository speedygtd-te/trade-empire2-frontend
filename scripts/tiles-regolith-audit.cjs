/**
 * REGOLITH -- BASELINE AUDIT. Read only, measures, writes panels.
 *
 * STYLE TEST. Writes only into assets/style-test/tiles/regolith_fix/.
 * NOTHING is written to src/assets/tiles/. No fal.ai, no cap sync, no git.
 *
 * WHAT IT ESTABLISHES
 *  1. The four shipped regolith slots on the WRITTEN .webp -- level, hue,
 *     blowout, texture, and the GROUND level p70 (the mean is dragged by how
 *     much shadow a tile carries; p70 is what a level target must use).
 *  2. Which regolith captures the shipped glacier set was derived from, checked
 *     against the file rather than against the header of the integration script.
 *  3. Panels: the four slots side by side, a 2x2, and an interleaved mosaic, so
 *     the crater in slot 2 can be seen rather than argued about.
 *
 * Usage: node scripts/tiles-regolith-audit.cjs
 */
const fs = require('fs');
const path = require('path');
const M = require('./lib-tile-metrics.cjs');
const sharp = M.sharp;

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const WORK = path.join(ROOT, 'assets', 'style-test', 'tiles', 'regolith_fix');
const SRCD = path.join(WORK, 'src');
const TILE_W = 512, TILE_H = 256;

const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);

/** mean-centred masked NCC of two tiles' interior luma, at full res */
async function ncc(fileA, fileB, flopB, flipB) {
  const A = await sharp(fs.readFileSync(fileA)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let sb = sharp(fs.readFileSync(fileB));
  if (flopB) sb = sb.flop();
  if (flipB) sb = sb.flip();
  const B = await sb.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ca = A.info.channels, cb = B.info.channels, n = A.info.width * A.info.height;
  if (B.info.width !== A.info.width || B.info.height !== A.info.height) return NaN;
  const la = [], lb = [];
  for (let p = 0; p < n; p++) {
    if (A.data[p * ca + 3] < 250 || B.data[p * cb + 3] < 250) continue;
    la.push(M.L709(A.data[p * ca], A.data[p * ca + 1], A.data[p * ca + 2]));
    lb.push(M.L709(B.data[p * cb], B.data[p * cb + 1], B.data[p * cb + 2]));
  }
  const ma = la.reduce((s, v) => s + v, 0) / la.length;
  const mb = lb.reduce((s, v) => s + v, 0) / lb.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < la.length; i++) {
    const x = la[i] - ma, y = lb[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return num / Math.sqrt(da * db);
}

(async () => {
  fs.mkdirSync(SRCD, { recursive: true });

  // ---- FREEZE the four regolith captures, verified by checksum every run ----
  const crypto = require('crypto');
  const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
  const SRC = [];
  for (let n = 0; n < 4; n++) {
    const origin = path.join(TILES, 'regolith', 'regolith_' + n + '.webp');
    const frozen = path.join(SRCD, 'regolith_' + n + '_src.webp');
    if (!fs.existsSync(frozen)) fs.copyFileSync(origin, frozen);
    const same = fs.readFileSync(frozen).equals(fs.readFileSync(origin));
    console.log('[freeze] regolith_' + n + '  frozen copy ' + (same ? 'MATCHES' : 'DIFFERS FROM') +
      ' src/  md5 ' + md5(fs.readFileSync(frozen)).slice(0, 12));
    SRC.push(frozen);
  }
  console.log('');

  // ---- the four shipped slots ---------------------------------------------
  console.log('REGOLITH as shipped -- measured on the written .webp');
  console.log(' slot  canvasL   intL     p50     p70     p90    dark%   B/R    G/R   sat%  chr%  blow%    sd  micro8   tiltX  tiltY');
  const R = [];
  for (let n = 0; n < 4; n++) {
    const f = path.join(TILES, 'regolith', 'regolith_' + n + '.webp');
    const s = await M.statsOf(f);
    s.micro = await M.microContrast(f.replace(/\.webp$/, '@eighth.webp'), f);
    s.rim = await M.rimHalo(f);
    R.push(s);
    console.log('   ' + n + f1(s.lum).padStart(8) + f1(s.intLum).padStart(8) + f1(s.p50).padStart(8) +
      f1(s.p70).padStart(8) + f1(s.p90).padStart(8) + f1(100 * s.dark).padStart(8) +
      f3(s.br).padStart(7) + f3(s.gr).padStart(7) + f1(100 * s.sat).padStart(6) +
      f2(100 * s.chromaRes).padStart(6) + f2(100 * s.blow).padStart(7) + f1(s.sd).padStart(6) +
      f2(s.micro).padStart(8) + f1(s.tiltX).padStart(8) + f1(s.tiltY).padStart(7));
  }
  const mean = (f) => R.reduce((a, s) => a + f(s), 0) / 4;
  console.log('  ---  mean intL ' + f1(mean((s) => s.intLum)) + '   mean p70 ' + f1(mean((s) => s.p70)) +
    '   worst blow ' + f2(100 * Math.max.apply(null, R.map((s) => s.blow))) + '%');
  console.log('');

  // ---- alpha shape: is the diamond mask hard or feathered? -----------------
  {
    const a = await sharp(fs.readFileSync(SRC[0])).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const ch = a.info.channels;
    let full = 0, zero = 0, part = 0;
    for (let p = 0; p < a.info.width * a.info.height; p++) {
      const v = a.data[p * ch + 3];
      if (v >= 250) full++; else if (v < 8) zero++; else part++;
    }
    console.log('[mask] regolith_0 alpha: opaque ' + full + '  transparent ' + zero + '  partial ' + part +
      '   (' + f1(100 * full / (a.info.width * a.info.height)) + '% opaque, ' +
      (part > 0 ? 'FEATHERED edge' : 'HARD edge') + ')');
    console.log('');
  }

  // ---- glacier: which regolith capture is each slot? -----------------------
  // The integration script's header claims slots 3 / 1 / hv0 / hv3. Checked
  // here against the FILE by mean-centred masked NCC in all four orientations.
  console.log('GLACIER slots vs REGOLITH captures -- mean-centred masked NCC, best orientation');
  console.log('  glacier   best match          NCC    (2nd best)');
  const ORI = [{ h: 0, v: 0, id: 'as-is' }, { h: 1, v: 0, id: 'h' }, { h: 0, v: 1, id: 'v' }, { h: 1, v: 1, id: '180deg' }];
  const usesR2 = [];
  for (let g = 0; g < 4; g++) {
    const gf = path.join(TILES, 'glacier', 'glacier_' + g + '.webp');
    const cand = [];
    for (let r = 0; r < 4; r++) for (const o of ORI) {
      cand.push({ tag: 'regolith_' + r + ' ' + o.id, r, c: await ncc(gf, SRC[r], o.h, o.v) });
    }
    cand.sort((a, b) => b.c - a.c);
    usesR2.push(cand[0].r === 2);
    console.log('     ' + g + '      ' + cand[0].tag.padEnd(20) + f3(cand[0].c).padStart(6) +
      '   (' + cand[1].tag + ' ' + f3(cand[1].c) + ')');
  }
  console.log('  => glacier uses regolith_2: ' + (usesR2.some(Boolean) ? 'YES  <== slot replacement WOULD affect glacier' : 'NO'));
  console.log('');

  // ---- glacier's own numbers, for the after-check -------------------------
  console.log('GLACIER as shipped (untouched, for the neighbour check)');
  console.log(' slot  canvasL   intL     p70   B/R    G/R   sat%  blow%  micro8');
  for (let n = 0; n < 4; n++) {
    const f = path.join(TILES, 'glacier', 'glacier_' + n + '.webp');
    const s = await M.statsOf(f);
    s.micro = await M.microContrast(f.replace(/\.webp$/, '@eighth.webp'), f);
    console.log('   ' + n + f1(s.lum).padStart(8) + f1(s.intLum).padStart(8) + f1(s.p70).padStart(8) +
      f3(s.br).padStart(7) + f3(s.gr).padStart(7) + f1(100 * s.sat).padStart(6) +
      f2(100 * s.blow).padStart(7) + f2(s.micro).padStart(8));
  }
  console.log('');

  // ---- panels --------------------------------------------------------------
  const PAD = 16, SW = 4 * TILE_W + 5 * PAD;
  const comp = [];
  let y = PAD;
  comp.push({ input: M.label('REGOLITH as shipped -- the four slots, 1:1. slot 2 is the one to be replaced (crater too prominent).', SW - 2 * PAD, 18, '#8b949e'), left: PAD, top: y });
  y += 30;
  for (let n = 0; n < 4; n++) {
    comp.push({ input: fs.readFileSync(SRC[n]), left: PAD + n * (TILE_W + PAD), top: y });
    comp.push({ input: M.label('slot ' + n + '  intL ' + f1(R[n].intLum) + '  p70 ' + f1(R[n].p70) + '  B/R ' + f3(R[n].br), TILE_W, 15, '#c9d1d9'), left: PAD + n * (TILE_W + PAD), top: y + TILE_H + 4 });
  }
  y += TILE_H + 30;
  const rnd = M.mulberry32(4242);
  const F = await M.isoField(SRC, TILE_W, TILE_H, 8, 4, () => Math.floor(rnd() * 4));
  const fieldW = Math.min(F.w, SW - 2 * PAD);
  comp.push({ input: await sharp(F.png).extract({ left: 0, top: 0, width: fieldW, height: Math.min(F.h, 1400) }).png().toBuffer(), left: PAD, top: y });
  const H = y + Math.min(F.h, 1400) + PAD;
  await sharp({ create: { width: SW, height: H, channels: 4, background: M.BGA } })
    .composite(comp).png().toFile(path.join(WORK, '_audit_slots.png'));
  console.log('[panel] ' + path.join(WORK, '_audit_slots.png'));

  fs.writeFileSync(path.join(WORK, '_audit_numbers.json'), JSON.stringify({
    when: new Date().toISOString(),
    regolith: R.map((s, i) => ({ slot: i, canvasL: s.lum, intL: s.intLum, p50: s.p50, p70: s.p70, p90: s.p90, dark: s.dark, br: s.br, gr: s.gr, sat: s.sat, chromaRes: s.chromaRes, blow: s.blow, sd: s.sd, micro: s.micro, tiltX: s.tiltX, tiltY: s.tiltY })),
    glacierUsesRegolith2: usesR2.some(Boolean),
  }, null, 2));
  console.log('done');
})();
