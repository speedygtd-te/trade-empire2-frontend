/**
 * DIE NASSE ERD-BASIS -- Kachelung, Dekorrelation, Spielskala je Sprosse.
 *
 * Fuer JEDE Sprosse der Leiter: vier Gitterversaetze, Raster/Naht, Slot-NCC,
 * Dekorrelation gegen die Quelle und die z-Ebenen-Nachbarn, und die volle
 * Bildstrecke (Slots, 2x2-Repeat, Zufallsfeld, SPIELSKALA, je mit Vakuum).
 *
 * Die Spielskala-Tafel ist hier die wichtigste: die Spiegellichter sind klein
 * und hochfrequent, sie laufen dort zusammen -- oder eben nicht. `spec1.6` und
 * `tail` sagen, ob sie DA sind; ob der Eindruck traegt, entscheidet die Tafel.
 *
 * Schreibt NUR nach assets/style-test/tiles/.
 * Usage: node scripts/tiles-earth-basis-wet-verify.cjs
 */
const fs = require('fs');
const path = require('path');
const S = require('./lib-tile-metrics.cjs');
const D = require('./tiles-dust-plain-lib.cjs');
const MS = require('./lib-meso.cjs');
const GR = require('./lib-grain.cjs');
const CHR = require('./lib-chroma.cjs');
const UN = require('./lib-uniform.cjs');
const CO = require('./lib-corrode.cjs');
const sharp = S.sharp;
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');

const RUNGS = ['w0_trocken', 'w1_leicht', 'w2_mittel', 'w3_nass', 'w4_trief'];
// dieselbe rock_layer-Zeile des 12er-Plans, kein Versatz (0,0)
const OFF = [[64, 21], [192, 64], [320, 107], [448, 21]];
const NEIGH = ['cave_floor', 'magma_pocket', 'deep_stone', 'rock_layer', 'mineral_vein', 'ice_cavern', 'permafrost'];

const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : 'NaN');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'NaN');
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : 'NaN');
const bas = (n) => path.join(ST, '_underground_basis_' + n + '.webp');
const slotF = (n, i) => path.join(ST, '_underground_basis_' + n + '_s' + i + '.webp');
const tileF = (f, n) => path.join(TILES, f, f + '_' + n + '.webp');

function vacRaw(src, ch, w, h) {
  const o = Buffer.from(src);
  for (let p = 0; p < w * h; p++) for (let c = 0; c < 3; c++) {
    o[p * ch + c] = Math.round(src[p * ch + c] * (1 - S.VAC_A) + S.VAC_RGB[c] * S.VAC_A);
  }
  return o;
}
async function metrics(buf) {
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const a = S.statsRaw(r.data, ch, w, h);
  const c = CHR.chromaRamp(r.data, ch, w, h);
  const u = UN.uniformity(r.data, ch, w, h);
  const sp = CO.specular(r.data, ch, w, h);
  return {
    p70: a.p70, p99: a.p99, p999: sp.p999, blow: 100 * a.blow, dark: 100 * a.dark, sd: a.sd,
    br: a.br, gr: a.gr,
    meso: MS.mesoNorm(r.data, ch, w, h, a.p70, 6, 32),
    m4: await D.microContrast(await sharp(buf).resize(128, 64, { fit: 'fill' }).webp(D.WEBP).toBuffer()),
    m8: await D.microContrast(await sharp(buf).resize(64, 32, { fit: 'fill' }).webp(D.WEBP).toBuffer()),
    grain: GR.grain(r.data, ch, w, h).half,
    cbPP: c.cbPP, cbSd: c.cbSd, spec14: sp.spec14, spec16: sp.spec16, spec18: sp.spec18,
    tail: sp.tail, uCV: u.uCV,
  };
}
const HDR = 'Sprosse        p70    p99  p99.9  blow%  dark%    sd   B/R   meso  micro4 micro8 grain'
  + '   cbPP   cbSd  spec1.4 spec1.6 spec1.8  tail   uCV';
const row = (n, m) => n.padEnd(13)
  + f1(m.p70).padStart(6) + f1(m.p99).padStart(7) + f1(m.p999).padStart(7)
  + f2(m.blow).padStart(7) + f1(m.dark).padStart(7) + f1(m.sd).padStart(6) + f3(m.br).padStart(6)
  + f2(m.meso).padStart(7) + f2(m.m4).padStart(8) + f2(m.m8).padStart(7) + f2(m.grain).padStart(6)
  + f3(m.cbPP).padStart(7) + f3(m.cbSd).padStart(7)
  + f2(m.spec14).padStart(8) + f2(m.spec16).padStart(8) + f2(m.spec18).padStart(8)
  + f2(m.tail).padStart(6) + f3(m.uCV).padStart(6);

async function stripOf(bufs) {
  const W = D.TILE_W, H = D.TILE_H, ins = [];
  for (let i = 0; i < bufs.length; i++) ins.push({ input: bufs[i], left: i * (W + 8), top: 0 });
  return sharp({ create: { width: bufs.length * (W + 8), height: H, channels: 4, background: D.BGA } })
    .composite(ins).png().toBuffer();
}
async function repeat2(bufs) {
  const W = D.TILE_W, H = D.TILE_H, cells = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
    cells.push({ input: bufs[(r * 3 + c) % bufs.length], left: c * W + (r % 2 ? W / 2 : 0), top: (r * H) / 2 });
  }
  return sharp({ create: { width: 3 * W + W / 2, height: 3 * H, channels: 4, background: D.BGA } })
    .composite(cells).png().toBuffer();
}

(async () => {
  const out = [];
  const say = (s) => { out.push(s); console.log(s); };
  say('DIE NASSE ERD-BASIS -- LEITER  ' + new Date().toISOString().slice(0, 10));
  say('Quelle permafrost_0, alle Sprossen auf p70 44 / B/R 0.660 / G/R 0.830 / Rampe 0.');
  say('Operatoren NUR innerhalb der Feuchtemaske: Porenfuellung (Pegel r16 sinkt),');
  say('asymmetrische Spreizung des MESO-Bandes (Poren tiefer), Korn-Band fast unberuehrt,');
  say('Spiegellichter additiv aus der eigenen Mikro-Geometrie, Licht von oben-links.');
  say('');
  say(HDR);
  for (const n of RUNGS) say(row(n, await metrics(fs.readFileSync(bas(n)))));
  say('');

  say('=== KACHELUNG je Sprosse (vier Gitterversaetze (64,21)(192,64)(320,107)(448,21)) ===');
  say('Sprosse        Raster   coh   Naht  Sprung  |  VAC Raster  VAC Naht  |  max|NCC| Slots');
  for (const n of RUNGS) {
    const r = await sharp(fs.readFileSync(bas(n))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const CHN = r.info.channels, W = r.info.width, H = r.info.height;
    const slots = [];
    for (let i = 0; i < 4; i++) {
      let b = D.latticeRoll(r.data, CHN, W, H, OFF[i][0], OFF[i][1]);
      b = D.edgeRepair(b, CHN, W, H, 3);
      await D.writeTile(b, W, H, CHN, slotF(n, i));
      slots.push(fs.readFileSync(slotF(n, i)));
    }
    const g = await D.gridOf(slots);
    const vslots = [];
    for (const b of slots) {
      const rr = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      vslots.push(await sharp(vacRaw(rr.data, rr.info.channels, W, H), { raw: { width: W, height: H, channels: rr.info.channels } })
        .webp(D.WEBP).toBuffer());
    }
    const gv = await D.gridOf(vslots);
    let worst = 0;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      worst = Math.max(worst, ...Object.values(await D.nccAll(slots[i], slots[j])).map(Math.abs));
    }
    say(n.padEnd(13) + f2(g.play.gridTot).padStart(7) + f2(g.play.gridCoh).padStart(6)
      + f2(g.bs.ratio).padStart(7) + f2(g.bs.step).padStart(8)
      + f2(gv.play.gridTot).padStart(13) + f2(gv.bs.ratio).padStart(10)
      + f3(worst).padStart(18));

    // Bildstrecke
    const tag = '_underground_wet-' + n;
    const st = await stripOf(slots);
    fs.writeFileSync(path.join(ST, tag + '_slots.png'), st);
    fs.writeFileSync(path.join(ST, tag + '_slots_vac.png'), await D.vacuum(st));
    const rep = await repeat2(slots);
    fs.writeFileSync(path.join(ST, tag + '_rep.png'), rep);
    fs.writeFileSync(path.join(ST, tag + '_rep_vac.png'), await D.vacuum(rep));
    const r1 = D.mulberry32(9091);
    const fld = await D.isoField(slots, D.TILE_W, D.TILE_H, 8, 5, () => Math.floor(r1() * 4));
    fs.writeFileSync(path.join(ST, tag + '_field.png'), fld.png);
    fs.writeFileSync(path.join(ST, tag + '_field_vac.png'), await D.vacuum(fld.png));
    const r2 = D.mulberry32(9091);
    const ply = await D.isoField(slots, D.PLAY_W, D.PLAY_H, 26, 16, () => Math.floor(r2() * 4));
    fs.writeFileSync(path.join(ST, tag + '_play.png'), ply.png);
    fs.writeFileSync(path.join(ST, tag + '_play_vac.png'), await D.vacuum(ply.png));
    // Spielskala 3x nearest -- dort laufen die kleinen Lichter zusammen
    fs.writeFileSync(path.join(ST, tag + '_play3x.png'),
      await sharp(ply.png).resize(ply.w * 3, ply.h * 3, { kernel: 'nearest' }).png().toBuffer());
    // Einzelkachel unter Vakuum
    const rb = await sharp(fs.readFileSync(bas(n))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    fs.writeFileSync(path.join(ST, '_underground_basis_' + n + '_vac.png'),
      await sharp(vacRaw(rb.data, rb.info.channels, W, H), { raw: { width: W, height: H, channels: rb.info.channels } })
        .png().toBuffer());
  }
  say('');

  say('=== DEKORRELATION der Slots (Sprosse w2_mittel) gegen Quelle und z-Ebenen-Nachbarn ===');
  const sl = [0, 1, 2, 3].map((i) => fs.readFileSync(slotF('w2_mittel', i)));
  for (const nb of NEIGH) {
    let mx = 0;
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) {
      mx = Math.max(mx, ...Object.values(await D.nccAll(sl[i], fs.readFileSync(tileF(nb, k)))).map(Math.abs));
    }
    say('  ' + nb.padEnd(16) + f3(mx).padStart(8) + (mx < 0.12 ? '   ok' : '   REISST 0.12'));
  }

  fs.writeFileSync(path.join(ST, '_underground_wet_numbers.txt'), out.join('\n') + '\n');
  console.log('\n-> ' + path.join(ST, '_underground_wet_numbers.txt'));
})();
