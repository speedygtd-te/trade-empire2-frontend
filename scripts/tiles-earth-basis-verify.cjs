/**
 * DIE ERD-BASIS -- Kennzahlen, Kachelung, Dekorrelation, und der Kontaktbogen.
 *
 * 1. Voller Kennzahlensatz je Kandidat, normal und unter Vakuum.
 * 2. Vier Gitterversaetze aus einem Kandidaten -> Raster / Naht / Slot-NCC.
 * 3. Dekorrelation gegen die Quelle (permafrost) und gegen die Biome, die auf
 *    DERSELBEN z-EBENE stehen koennen (cave_floor, magma_pocket, deep_stone,
 *    rock_layer, mineral_vein, ice_cavern -- alle gemessen, die relevanten
 *    markiert).
 * 4. Der Bogen _underground_sheet.html mit Basis, Vergleichsbiomen,
 *    Zufallsfeld, 2x2-Repeat, Spielskala und Vakuum.
 *
 * DAS VERSATZ-GITTER, analytisch entschieden.
 * Die 512x256-Raute kachelt auf dem Gitter a1=(512,0), a2=(256,128). Eine
 * Differenz (dx,dy) liegt AUF dem Gitter genau dann, wenn
 *     dy = 0 (mod 128)   UND   dx = 256*(dy/128) (mod 512).
 * Gewaehlt wird dx in {0,128,256,384} x dy in {0,43,86}, also 12 Versaetze fuer
 * 3 Biome x 4 Slots. Die dy-Differenzen sind 0, +-43, +-86 -- nur 0 ist durch
 * 128 teilbar, und dann muessen die dx-Differenzen durch 512 teilbar sein, was
 * unter {0,128,256,384} nur die Differenz 0 erfuellt, also nur der Versatz mit
 * sich selbst. ALLE 66 Paardifferenzen liegen damit off-lattice. Bewiesen, nicht
 * gehofft -- das ist die Falle aus LESSONS 8, die dust_basin Slot 0 gekostet hat.
 *
 * Usage: node scripts/tiles-earth-basis-verify.cjs [kandidat]
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
const PICK = process.argv[2] || 'e1_mild';

const CANDS = ['e0_flat', 'e1_mild', 'e2_strong', 'e1_light', 'e1_dark'];
// Das Gitter ist bewusst um (64,21) VERSCHOBEN, damit kein Versatz (0,0) ist:
// Slot 0 mit Versatz (0,0) waere der ungerollte Hero und damit exakt der
// Baufehler, den dust_basin_0 gekostet hat (LESSONS 8). Gemessen gegen
// permafrost_0: Versatz (0,0) -> 0.934, (64,21) -> 0.013.
const DX = [64, 192, 320, 448], DY = [21, 64, 107];
const PLAN = {                          // dieselbe Zuordnung, die die Ableitungen bekommen
  rock_layer: [[64, 21], [192, 64], [320, 107], [448, 21]],
  mineral_vein: [[192, 21], [320, 64], [448, 107], [64, 64]],
  deep_stone: [[320, 21], [448, 64], [64, 107], [192, 107]],
};
const NEIGH = {                         // Biome, die auf DERSELBEN z-Ebene stehen koennen
  cave_floor: 'ja (Standard, Tiefe 1-3)',
  magma_pocket: 'ja (nur gegen mineral_vein, vulkanisch Tiefe 3+)',
  deep_stone: 'ja (nur gegen mineral_vein, Standard Tiefe 4+)',
  rock_layer: 'ja (nur gegen mineral_vein/cave_floor, Tiefe 1-3)',
  mineral_vein: 'ja (jede Tiefe)',
  ice_cavern: 'ja (nur gegen mineral_vein, eisig Tiefe 1-5)',
  permafrost: 'NEIN -- Oberflaeche, nur die Quelle',
};

const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : 'NaN');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'NaN');
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : 'NaN');
const basisFile = (n) => path.join(ST, '_underground_basis_' + n + '.webp');
const slotFile = (n, i) => path.join(ST, '_underground_basis_' + n + '_s' + i + '.webp');
const tileF = (f, n) => path.join(TILES, f, f + '_' + n + '.webp');

function vacRaw(src, ch, w, h) {
  const o = Buffer.from(src);
  for (let p = 0; p < w * h; p++) for (let c = 0; c < 3; c++) {
    o[p * ch + c] = Math.round(src[p * ch + c] * (1 - S.VAC_A) + S.VAC_RGB[c] * S.VAC_A);
  }
  return o;
}
async function toWebp(buf, w, h, ch) {
  return sharp(buf, { raw: { width: w, height: h, channels: ch } }).webp(D.WEBP).toBuffer();
}
async function metrics(webpBuf) {
  const r = await sharp(webpBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const a = S.statsRaw(r.data, ch, w, h);
  const tr = D.tiltRimRaw(r.data, ch, w, h);
  const c = CHR.chromaRamp(r.data, ch, w, h);
  const u = UN.uniformity(r.data, ch, w, h);
  const sp = CO.specular(r.data, ch, w, h);
  return {
    p70: a.p70, p99: a.p99, blow: 100 * a.blow, dark: 100 * a.dark, sd: a.sd,
    br: a.br, gr: a.gr, gx: tr.gx, gy: tr.gy, rim: tr.rim,
    meso: MS.mesoNorm(r.data, ch, w, h, a.p70, 6, 32),
    m4: await D.microContrast(await sharp(webpBuf).resize(128, 64, { fit: 'fill' }).webp(D.WEBP).toBuffer()),
    m8: await D.microContrast(await sharp(webpBuf).resize(64, 32, { fit: 'fill' }).webp(D.WEBP).toBuffer()),
    grain: GR.grain(r.data, ch, w, h).half,
    cbPP: c.cbPP, cgPP: c.cgPP, cbSd: c.cbSd, cgSd: c.cgSd,
    uCV: u.uCV, uP90: u.uP90, spec16: sp.spec16, tail: sp.tail,
  };
}
const HDR = 'name          p70    p99  blow%  dark%    sd   B/R   G/R   meso  micro4 micro8 grain'
  + '   cbPP   cgPP   cbSd   cgSd     gx     gy    rim  spec16  tail   uCV  uP90';
const row = (nm, m) => nm.padEnd(13)
  + f1(m.p70).padStart(6) + f1(m.p99).padStart(7) + f2(m.blow).padStart(7) + f1(m.dark).padStart(7)
  + f1(m.sd).padStart(6) + f3(m.br).padStart(6) + f3(m.gr).padStart(6)
  + f2(m.meso).padStart(7) + f2(m.m4).padStart(8) + f2(m.m8).padStart(7) + f2(m.grain).padStart(6)
  + f3(m.cbPP).padStart(7) + f3(m.cgPP).padStart(7) + f3(m.cbSd).padStart(7) + f3(m.cgSd).padStart(7)
  + f2(m.gx).padStart(7) + f2(m.gy).padStart(7) + f2(m.rim).padStart(7)
  + f2(m.spec16).padStart(8) + f2(m.tail).padStart(6) + f3(m.uCV).padStart(6) + f2(m.uP90).padStart(6);

/** 2x2 repeat, interlocked, as PNG */
async function repeat2(bufs) {
  const W = D.TILE_W, H = D.TILE_H;
  const cells = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
    cells.push({ input: bufs[(r * 3 + c) % bufs.length], left: c * W + (r % 2 ? W / 2 : 0), top: (r * H) / 2 });
  }
  return sharp({ create: { width: 3 * W + W / 2, height: 3 * H, channels: 4, background: D.BGA } })
    .composite(cells).png().toBuffer();
}

(async () => {
  const out = [];
  const say = (s) => { out.push(s); console.log(s); };

  // ---------------------------------------------------------------- 1 ----
  say('ERD-BASIS -- KANDIDATEN  ' + new Date().toISOString().slice(0, 10));
  say('Quelle: permafrost_0. Ziel B/R 0.660 G/R 0.830, Rampe gx=gy=0.');
  say('');
  say('NORMAL');
  say(HDR);
  const M = {};
  for (const n of CANDS) { M[n] = await metrics(fs.readFileSync(basisFile(n))); say(row(n, M[n])); }
  const anchors = ['permafrost_0', 'cave_floor_0', 'deep_stone_1', 'magma_pocket_0', 'rock_layer_1'];
  for (const a of anchors) {
    const fam = a.slice(0, a.lastIndexOf('_')), i = a.slice(a.lastIndexOf('_') + 1);
    say(row('~' + a, await metrics(fs.readFileSync(tileF(fam, i)))));
  }
  say('');
  say('VAKUUM');
  say(HDR);
  for (const n of CANDS) {
    const r = await sharp(fs.readFileSync(basisFile(n))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const v = await toWebp(vacRaw(r.data, r.info.channels, r.info.width, r.info.height),
      r.info.width, r.info.height, r.info.channels);
    say(row(n, await metrics(v)));
  }
  say('');

  // ---------------------------------------------------------------- 2 ----
  say('=== VIER GITTERVERSAETZE aus ' + PICK + ' (die rock_layer-Zeile des Plans) ===');
  const src = await sharp(fs.readFileSync(basisFile(PICK))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const CHN = src.info.channels, W = src.info.width, H = src.info.height;
  const slots = [];
  for (let i = 0; i < 4; i++) {
    const [dx, dy] = PLAN.rock_layer[i];
    let b = D.latticeRoll(src.data, CHN, W, H, dx, dy);
    b = D.edgeRepair(b, CHN, W, H, 3);
    await D.writeTile(b, W, H, CHN, slotFile(PICK, i));
    slots.push(fs.readFileSync(slotFile(PICK, i)));
    say('  s' + i + ' Versatz (' + dx + ',' + dy + ')');
  }
  const g = await D.gridOf(slots);
  const vslots = [];
  for (const b of slots) {
    const r = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    vslots.push(await toWebp(vacRaw(r.data, r.info.channels, r.info.width, r.info.height), W, H, r.info.channels));
  }
  const gv = await D.gridOf(vslots);
  say('  Raster grid_play ' + f2(g.play.gridTot) + '  coh ' + f2(g.play.gridCoh)
    + '  Naht(ratio) ' + f2(g.bs.ratio) + '  Naht-Sprung ' + f2(g.bs.step)
    + '   |  VAC Raster ' + f2(gv.play.gridTot) + '  VAC Naht ' + f2(gv.bs.ratio));
  let worst = 0, wp = '';
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const n = Math.max(...Object.values(await D.nccAll(slots[i], slots[j])).map(Math.abs));
    if (n > worst) { worst = n; wp = i + '/' + j; }
  }
  say('  max|NCC| unter den 4 Slots: ' + f3(worst) + ' (' + wp + ')   Schwelle 0.12');
  say('');

  // ---------------------------------------------------------------- 3 ----
  say('=== ALLE 12 VERSAETZE: Paardifferenzen gegen das Torusgitter ===');
  const all = [];
  for (const k of Object.keys(PLAN)) PLAN[k].forEach((o, i) => all.push([k + '_' + i, o]));
  let onLat = 0;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const ddx = ((all[i][1][0] - all[j][1][0]) % 512 + 512) % 512;
    const ddy = ((all[i][1][1] - all[j][1][1]) % 128 + 128) % 128;
    if (ddy === 0 && ddx === 0) { onLat++; say('  AUF DEM GITTER: ' + all[i][0] + ' x ' + all[j][0]); }
  }
  say('  ' + (all.length * (all.length - 1) / 2) + ' Paare geprueft, auf dem Gitter: ' + onLat
    + (onLat ? '  <-- BAUFEHLER' : '  -> alle off-lattice, analytisch bewiesen'));
  say('');

  say('=== DEKORRELATION der 4 Slots gegen Quelle und Nachbarn ===');
  say('gegen                    z-Ebene gemeinsam?                        max|NCC|');
  for (const nb of Object.keys(NEIGH)) {
    let mx = 0;
    for (let i = 0; i < 4; i++) for (let n = 0; n < 4; n++) {
      const v = Math.max(...Object.values(await D.nccAll(slots[i], fs.readFileSync(tileF(nb, n)))).map(Math.abs));
      mx = Math.max(mx, v);
    }
    say('  ' + nb.padEnd(22) + NEIGH[nb].padEnd(42) + f3(mx).padStart(8));
  }
  say('');

  fs.writeFileSync(path.join(ST, '_underground_basis_numbers.txt'), out.join('\n') + '\n');

  // ---------------------------------------------------------------- 4 ----
  const rnd = D.mulberry32(9091);
  const field = await D.isoField(slots, D.TILE_W, D.TILE_H, 8, 5, () => Math.floor(rnd() * 4));
  fs.writeFileSync(path.join(ST, '_underground_basis_field.png'), field.png);
  fs.writeFileSync(path.join(ST, '_underground_basis_field_vac.png'), await D.vacuum(field.png));
  const rep = await repeat2(slots);
  fs.writeFileSync(path.join(ST, '_underground_basis_rep.png'), rep);
  fs.writeFileSync(path.join(ST, '_underground_basis_rep_vac.png'), await D.vacuum(rep));
  const rnd2 = D.mulberry32(9091);
  const play = await D.isoField(slots, D.PLAY_W, D.PLAY_H, 26, 16, () => Math.floor(rnd2() * 4));
  fs.writeFileSync(path.join(ST, '_underground_basis_play.png'), play.png);
  fs.writeFileSync(path.join(ST, '_underground_basis_play_vac.png'), await D.vacuum(play.png));

  // vacuum single tiles for the sheet
  for (const n of CANDS) {
    const r = await sharp(fs.readFileSync(basisFile(n))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    fs.writeFileSync(path.join(ST, '_underground_basis_' + n + '_vac.png'),
      await sharp(vacRaw(r.data, r.info.channels, r.info.width, r.info.height),
        { raw: { width: r.info.width, height: r.info.height, channels: r.info.channels } }).png().toBuffer());
  }
  console.log('\n-> ' + ST);
})();
