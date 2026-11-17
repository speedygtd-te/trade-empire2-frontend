/**
 * REGOLITH -- STEP 3: THE CANDIDATES IN A FIELD, WHICH IS WHERE THEY ARE JUDGED.
 *
 * STYLE TEST. Writes only into assets/style-test/tiles/regolith_fix/.
 * NOTHING is written to src/assets/tiles/.
 *
 * Innenmessungen verfehlen den Rand (LESSONS 4): a tile that measures well can
 * still show a seam. So every candidate is looked at THREE ways --
 *   2x2        the four slots in the smallest repeating block, edges touching
 *   MOSAIC     an interleaved field at 1:1, slots drawn at random
 *   PLAY       the same field at 48x24 per tile, the scale the player builds at,
 *              with and without the vacuum darkening from isoConstants.ts
 * plus the seam number (boundary step / interior roughness) for each.
 *
 * Usage: node scripts/tiles-regolith-field.cjs OFF-a OFF-c OFF-e
 *        node scripts/tiles-regolith-field.cjs OFF-c --slot3 T101
 */
const fs = require('fs');
const path = require('path');
const M = require('./lib-tile-metrics.cjs');
const sharp = M.sharp;

const ROOT = path.join(__dirname, '..');
const WORK = path.join(ROOT, 'assets', 'style-test', 'tiles', 'regolith_fix');
const SRCD = path.join(WORK, 'src');
const OUT2 = path.join(WORK, 'slot2');
const OUT3 = path.join(WORK, 'slot3');
const TILE_W = 512, TILE_H = 256;
const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2);

(async () => {
  const args = process.argv.slice(2);
  const i3 = args.indexOf('--slot3');
  const slot3 = i3 >= 0 ? args[i3 + 1] : null;
  const ids = args.filter((a, i) => a !== '--slot3' && (i3 < 0 || i !== i3 + 1));
  if (!ids.length) { console.error('give at least one candidate id, e.g. OFF-c'); process.exit(1); }

  const s3file = slot3
    ? path.join(OUT3, 'regolith_3_' + slot3 + '.webp')
    : path.join(SRCD, 'regolith_3_src.webp');
  console.log('[set] slot 0 and 1 as shipped, slot 3 = ' + path.basename(s3file));

  for (const id of ids) {
    const cand = path.join(OUT2, id + '.webp');
    if (!fs.existsSync(cand)) { console.error('no such candidate: ' + cand); continue; }
    const set = [
      path.join(SRCD, 'regolith_0_src.webp'),
      path.join(SRCD, 'regolith_1_src.webp'),
      cand,
      s3file,
    ];

    // -- the numbers on the field ------------------------------------------
    const rnd = M.mulberry32(4242);
    const F = await M.isoField(set, TILE_W, TILE_H, 10, 6, () => Math.floor(rnd() * 4));
    const Lf = await M.lumaOf(F.png);
    const bs = M.boundaryStep(Object.assign({}, F, { L: Lf.L, w: Lf.w, h: Lf.h }));
    const g = M.gridMetrics(Lf.L, Lf.w, Lf.h, F.cells, TILE_W, TILE_H);

    const rnd2 = M.mulberry32(4242);
    const P = await M.isoField(set, M.PLAY_W, M.PLAY_H, 46, 26, () => Math.floor(rnd2() * 4));
    const Lp = await M.lumaOf(P.png);
    const gp = M.gridMetrics(Lp.L, Lp.w, Lp.h, P.cells, M.PLAY_W, M.PLAY_H);
    const Pv = await M.vacuum(P.png);

    console.log('[' + id.padEnd(6) + '] seam step/rough ' + f2(bs.ratio) +
      '  GRIDfull ' + f2(g.gridTot) + ' (coh ' + f2(g.gridCoh) + ' slot ' + f2(g.gridSlot) + ' ramp ' + f2(g.rampPP) + ')' +
      '  GRIDplay ' + f2(gp.gridTot) + ' ratio ' + f2(gp.ratio));

    // -- 2x2, the smallest repeating block, edges touching ------------------
    const two = await M.isoField(set, TILE_W, TILE_H, 4, 3, (r, c) => (r % 2) * 2 + (c % 2));

    // -- the sheet ----------------------------------------------------------
    const PAD = 14;
    const mosW = Math.min(F.w, 2600), mosH = Math.min(F.h, 1500);
    const twoW = Math.min(two.w, 1300), twoH = Math.min(two.h, 700);
    const SW = PAD * 3 + twoW + mosW;
    const comp = [];
    let y = 6;
    comp.push({ input: M.label('REGOLITH with the new slot 2 = ' + id + '   (slot 0, 1 as shipped; slot 3 = ' + path.basename(s3file) + ')', SW - 2 * PAD, 18, '#7ee787'), left: PAD, top: y });
    y += 26;
    comp.push({ input: M.label('2x2, edges touching -- slot order 0/1 over 2/3', twoW, 14, '#8b949e'), left: PAD, top: y });
    comp.push({ input: M.label('interleaved mosaic at 1:1, slots drawn at random   seam step/rough ' + f2(bs.ratio) + '   grid ' + f2(g.gridTot), mosW, 14, '#8b949e'), left: PAD * 2 + twoW, top: y });
    y += 20;
    comp.push({ input: await sharp(two.png).extract({ left: 0, top: 0, width: twoW, height: twoH }).png().toBuffer(), left: PAD, top: y });
    comp.push({ input: await sharp(F.png).extract({ left: 0, top: 0, width: mosW, height: mosH }).png().toBuffer(), left: PAD * 2 + twoW, top: y });
    let y2 = y + twoH + 16;
    comp.push({ input: M.label('play scale, 48x24 per tile -- left as drawn, right with the vacuum darkening', twoW, 14, '#8b949e'), left: PAD, top: y2 });
    y2 += 20;
    const pw = Math.min(P.w, Math.floor((twoW - 10) / 2));
    comp.push({ input: await sharp(P.png).extract({ left: 0, top: 0, width: pw, height: Math.min(P.h, 560) }).png().toBuffer(), left: PAD, top: y2 });
    comp.push({ input: await sharp(Pv).extract({ left: 0, top: 0, width: pw, height: Math.min(P.h, 560) }).png().toBuffer(), left: PAD + pw + 10, top: y2 });

    const H = Math.max(y + mosH, y2 + Math.min(P.h, 560)) + PAD;
    await sharp({ create: { width: SW, height: H, channels: 4, background: M.BGA } })
      .composite(comp).png().toFile(path.join(WORK, '_C_field_' + id + '.png'));
    console.log('         -> _C_field_' + id + '.png');
  }
  console.log('done');
})();
