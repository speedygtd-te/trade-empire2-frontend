/**
 * UNDERGROUND -- ABNAHME-MESSUNG der neu gebauten Biome.
 *
 * Fuer jedes Biom mit vier _underground_<biom>_s{0..3}.webp:
 *   - die volle Messtabelle je Slot (massgebliche micro4/micro8-Definition)
 *   - Raster / Naht / Slot-Kreuzkorrelation
 *   - die Bildstrecke: Slot-Streifen, 2x2-Repeat, Zufallsfeld, SPIELSKALA,
 *     jeweils normal und unter Vakuum (unter Tage reine Diagnose --
 *     isoConstants.ts:326 gated die Abdunklung auf currentZ >= 0)
 *   - die drei Steinbiome zusaetzlich NEBENEINANDER auf einer z-Ebene
 *   - die volle Dekorrelationsmatrix gegen jeden z-Ebenen-Nachbarn
 *
 * Schreibt NUR nach assets/style-test/tiles/.
 * Usage: node scripts/tiles-underground-verify.cjs
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

const NEW = process.argv.slice(2).length ? process.argv.slice(2)
  : ['rock_layer', 'deep_stone', 'mineral_vein', 'ice_cavern'];
// Bestandskacheln, gegen die dekorreliert wird (z-Ebenen-Nachbarn + Quellen)
const OLD = ['cave_floor', 'magma_pocket', 'permafrost', 'crystal_field', 'lava_flow'];

/** Wer steht mit wem auf DERSELBEN z-Ebene? (Docs/planet-biomes-by-type.md) */
const SAME_Z = {
  'rock_layer|mineral_vein': 'Standard Tiefe 1-3 und vulkanisch 1-2',
  'rock_layer|cave_floor': 'Standard Tiefe 1-3',
  'mineral_vein|cave_floor': 'Standard Tiefe 1-3',
  'mineral_vein|deep_stone': 'Standard Tiefe 4+, eisig ab 6 nein',
  'mineral_vein|magma_pocket': 'vulkanisch Tiefe 3+',
  'mineral_vein|ice_cavern': 'eisig Tiefe 1-5',
  'magma_pocket|lava_flow': 'tiefer Kern',
};

const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : 'NaN');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'NaN');
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : 'NaN');
const newSlot = (b, i) => path.join(ST, '_underground_' + b + '_s' + i + '.webp');
const oldSlot = (b, i) => path.join(TILES, b, b + '_' + i + '.webp');
/**
 * PROD=1 misst die AUSGELIEFERTEN Kacheln in src/assets/tiles/ statt der
 * Werkstattdateien. Nach der Integration ist das die Fassung, die zaehlt --
 * gemessen wird an der geschriebenen Datei, nie am Puffer (LESSONS 1).
 */
const PROD = process.env.PROD === '1';
const slotOf = (b, i) => (!PROD && NEW.includes(b) ? newSlot(b, i) : oldSlot(b, i));

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
  const tr = D.tiltRimRaw(r.data, ch, w, h);
  const c = CHR.chromaRamp(r.data, ch, w, h);
  const u = UN.uniformity(r.data, ch, w, h);
  const sp = CO.specular(r.data, ch, w, h);
  return {
    p70: a.p70, p99: a.p99, blow: 100 * a.blow, dark: 100 * a.dark, sd: a.sd, br: a.br, gr: a.gr,
    meso: MS.mesoNorm(r.data, ch, w, h, a.p70, 6, 32),
    m4: await D.microContrast(await sharp(buf).resize(128, 64, { fit: 'fill' }).webp(D.WEBP).toBuffer()),
    m8: await D.microContrast(await sharp(buf).resize(64, 32, { fit: 'fill' }).webp(D.WEBP).toBuffer()),
    grain: GR.grain(r.data, ch, w, h).half,
    cbPP: c.cbPP, cbSd: c.cbSd, cgPP: c.cgPP, cgSd: c.cgSd, gx: tr.gx, gy: tr.gy,
    spec16: sp.spec16, tail: sp.tail, uCV: u.uCV,
  };
}
const HDR = 'slot            p70    p99  blow%  dark%    sd   B/R   G/R   meso  micro4 micro8 grain'
  + '   cbPP   cbSd     gx     gy  spec1.6  tail   uCV';
const row = (n, m) => n.padEnd(14)
  + f1(m.p70).padStart(6) + f1(m.p99).padStart(7) + f2(m.blow).padStart(7) + f1(m.dark).padStart(7)
  + f1(m.sd).padStart(6) + f3(m.br).padStart(6) + f3(m.gr).padStart(6)
  + f2(m.meso).padStart(7) + f2(m.m4).padStart(8) + f2(m.m8).padStart(7) + f2(m.grain).padStart(6)
  + f3(m.cbPP).padStart(7) + f3(m.cbSd).padStart(7) + f2(m.gx).padStart(7) + f2(m.gy).padStart(7)
  + f2(m.spec16).padStart(9) + f2(m.tail).padStart(6) + f3(m.uCV).padStart(6);

async function strip(bufs) {
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
async function pictures(bufs, tag) {
  const st = await strip(bufs);
  fs.writeFileSync(path.join(ST, tag + '_slots.png'), st);
  fs.writeFileSync(path.join(ST, tag + '_slots_vac.png'), await D.vacuum(st));
  const rep = await repeat2(bufs);
  fs.writeFileSync(path.join(ST, tag + '_rep.png'), rep);
  fs.writeFileSync(path.join(ST, tag + '_rep_vac.png'), await D.vacuum(rep));
  const r1 = D.mulberry32(9091);
  const fld = await D.isoField(bufs, D.TILE_W, D.TILE_H, 8, 5, () => Math.floor(r1() * 4));
  fs.writeFileSync(path.join(ST, tag + '_field.png'), fld.png);
  fs.writeFileSync(path.join(ST, tag + '_field_vac.png'), await D.vacuum(fld.png));
  const r2 = D.mulberry32(9091);
  const ply = await D.isoField(bufs, D.PLAY_W, D.PLAY_H, 26, 16, () => Math.floor(r2() * 4));
  fs.writeFileSync(path.join(ST, tag + '_play.png'), ply.png);
  fs.writeFileSync(path.join(ST, tag + '_play_vac.png'), await D.vacuum(ply.png));
  fs.writeFileSync(path.join(ST, tag + '_play3x.png'),
    await sharp(ply.png).resize(ply.w * 3, ply.h * 3, { kernel: 'nearest' }).png().toBuffer());
}

/**
 * DIE ENTSCHEIDENDE TAFEL: die drei Steinbiome GEMISCHT auf einer Flaeche.
 * Kein Biom fuer sich, sondern das, was der Spieler sieht, wenn er eine
 * Untergrund-Ebene aufmacht -- Rasterzellen, die zufaellig einem der Biome
 * gehoeren. Nur hier ist die Unterscheidbarkeit ueberhaupt beurteilbar.
 */
async function mixedPlate(names, tag, rows, cols, tw, th) {
  const all = [];
  for (const n of names) for (let i = 0; i < 4; i++) all.push(fs.readFileSync(slotOf(n, i)));
  const bufs = [];
  for (const b of all) bufs.push(await sharp(b).resize(tw, th, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer());
  // grosse zusammenhaengende Flecken pro Biom, wie die Hoehen-/Feuchte-Noise
  // des Backends sie erzeugt: ein Wuerfel je 3x3-Block, nicht je Kachel
  const rnd = D.mulberry32(4711);
  const rq = D.mulberry32(20260905);
  const brows = Math.ceil(rows / 3), bcols = Math.ceil(cols / 3);
  const blk = [];
  for (let i = 0; i < brows * bcols; i++) blk.push(Math.floor(rq() * names.length) % names.length);
  const region = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    region.push(blk[Math.floor(r / 3) * bcols + Math.floor(c / 3)]);
  }
  const cells = [];
  let mr = 0, mb = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const g = region[r * cols + c];
    const idx = g * 4 + Math.floor(rnd() * 4);
    const x = c * tw + (r % 2 ? tw / 2 : 0), y = (r * th) / 2;
    cells.push({ input: bufs[idx], left: x, top: y });
    mr = Math.max(mr, x + tw); mb = Math.max(mb, y + th);
  }
  const png = await sharp({ create: { width: mr, height: mb, channels: 4, background: D.BGA } })
    .composite(cells).png().toBuffer();
  fs.writeFileSync(path.join(ST, tag + '.png'), png);
  fs.writeFileSync(path.join(ST, tag + '_vac.png'), await D.vacuum(png));
  fs.writeFileSync(path.join(ST, tag + '_3x.png'),
    await sharp(png).resize(mr * 3, mb * 3, { kernel: 'nearest' }).png().toBuffer());
}

/**
 * DIE DREI STEINBIOME NEBENEINANDER, jedes als zusammenhaengendes Band.
 * Die gemischte Tafel zeigt, ob sie sich im Feld trennen; diese hier zeigt,
 * ob sie sich BENANNT trennen -- man sieht, welches welches ist, und kann
 * dann im Mischbild pruefen, ob man es dort wiedererkennt.
 */
async function bandPlate(names, tag, tw, th, rowsPer, cols) {
  const bufs = {};
  for (const n of names) {
    bufs[n] = [];
    for (let i = 0; i < 4; i++) {
      bufs[n].push(await sharp(fs.readFileSync(slotOf(n, i)))
        .resize(tw, th, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer());
    }
  }
  const rnd = D.mulberry32(31337);
  const cells = [];
  let mr = 0, mb = 0, r = 0;
  const labels = [];
  for (const n of names) {
    labels.push({ y: (r * th) / 2, name: n });
    for (let k = 0; k < rowsPer; k++, r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * tw + (r % 2 ? tw / 2 : 0), y = (r * th) / 2;
        cells.push({ input: bufs[n][Math.floor(rnd() * 4)], left: x, top: y });
        mr = Math.max(mr, x + tw); mb = Math.max(mb, y + th);
      }
    }
  }
  const png = await sharp({ create: { width: mr, height: mb, channels: 4, background: D.BGA } })
    .composite(cells).png().toBuffer();
  const lab = labels.map((l) => ({ input: D.label(l.name, 260, 22, '#ffd479'), left: 6, top: Math.round(l.y) + 4 }));
  const withLab = await sharp(png).composite(lab).png().toBuffer();
  fs.writeFileSync(path.join(ST, tag + '.png'), withLab);
  fs.writeFileSync(path.join(ST, tag + '_vac.png'), await D.vacuum(withLab));
}

(async () => {
  const out = [];
  const say = (s) => { out.push(s); console.log(s); };
  const have = NEW.filter((n) => fs.existsSync(slotOf(n, 3)));
  say('UNDERGROUND -- ABNAHME  ' + new Date().toISOString().slice(0, 10));
  say('Basis fuer die drei Steinschichten: _underground_basis_w3_nass (permafrost_0, nass, p70 44 / B/R 0.660).');
  say('micro4/micro8 = massgebliche Definition (Vollkachel -> 128x64 / 64x32, fit fill, durch webp).');
  say('VAKUUM-Spalten sind reine Diagnose: isoConstants.atmosphereDarkening() gated auf currentZ >= 0,');
  say('untertage wird NIE abgedunkelt.');
  say('');

  for (const n of have) {
    const slots = [0, 1, 2, 3].map((i) => fs.readFileSync(slotOf(n, i)));
    say('=== ' + n.toUpperCase() + ' ===');
    say(HDR);
    for (let i = 0; i < 4; i++) say(row(n + '_' + i, await metrics(slots[i])));
    const g = await D.gridOf(slots);
    const W = D.TILE_W, H = D.TILE_H;
    const vslots = [];
    for (const b of slots) {
      const rr = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      vslots.push(await sharp(vacRaw(rr.data, rr.info.channels, W, H),
        { raw: { width: W, height: H, channels: rr.info.channels } }).webp(D.WEBP).toBuffer());
    }
    const gv = await D.gridOf(vslots);
    let worst = 0, wp = '';
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const v = Math.max(...Object.values(await D.nccAll(slots[i], slots[j])).map(Math.abs));
      if (v > worst) { worst = v; wp = i + '/' + j; }
    }
    say('  Raster grid_play ' + f2(g.play.gridTot) + '  coh ' + f2(g.play.gridCoh)
      + '  Naht(ratio) ' + f2(g.bs.ratio) + '  Naht-Sprung ' + f2(g.bs.step)
      + '   |  VAC Raster ' + f2(gv.play.gridTot) + '  VAC Naht ' + f2(gv.bs.ratio));
    say('  max|NCC| unter den 4 Slots ' + f3(worst) + ' (' + wp + ')   Schwelle 0.12');
    say('');
    await pictures(slots, '_underground_new-' + n);
  }

  // ---------------------------------------------------- Dekorrelationsmatrix
  say('=== DEKORRELATIONSMATRIX (max|NCC| ueber 16 Slotpaare x 4 Orientierungen) ===');
  const univ = have.concat(OLD);
  const cache = {};
  for (const b of univ) cache[b] = [0, 1, 2, 3].map((i) => fs.readFileSync(slotOf(b, i)));
  say('Paar                                 max|NCC|  z-Ebene gemeinsam?  Urteil');
  for (let a = 0; a < univ.length; a++) for (let b = a + 1; b < univ.length; b++) {
    if (!have.includes(univ[a]) && !have.includes(univ[b])) continue;
    let mx = 0;
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) {
      mx = Math.max(mx, ...Object.values(await D.nccAll(cache[univ[a]][i], cache[univ[b]][k])).map(Math.abs));
    }
    const key1 = univ[a] + '|' + univ[b], key2 = univ[b] + '|' + univ[a];
    const z = SAME_Z[key1] || SAME_Z[key2];
    say('  ' + (univ[a] + ' x ' + univ[b]).padEnd(34) + f3(mx).padStart(8) + '   '
      + (z ? 'JA (' + z + ')' : 'nein').padEnd(38)
      + (z ? (mx < 0.12 ? 'ok' : 'REISST 0.12') : (mx < 0.12 ? 'ok' : 'folgenlos')));
  }
  say('');

  // ------------------------------------------------ die drei nebeneinander
  const stones = have.filter((n) => n !== 'ice_cavern');
  if (stones.length >= 2) {
    await mixedPlate(stones, '_underground_mix-stones', 26, 16, D.PLAY_W, D.PLAY_H);
    await mixedPlate(stones, '_underground_mixbig-stones', 12, 7, 256, 128);
    await bandPlate(stones, '_underground_band-stones', 256, 128, 3, 6);
    await bandPlate(stones, '_underground_bandplay-stones', D.PLAY_W, D.PLAY_H, 6, 26);
    say('Gemischte Tafel der Steinbiome: _underground_mix-stones.png (Spielskala) und '
      + '_underground_mixbig-stones.png (256x128); nebeneinander als Baender: '
      + '_underground_band-stones.png / _underground_bandplay-stones.png.');
  }
  if (have.includes('ice_cavern')) {
    await mixedPlate(['ice_cavern', 'mineral_vein'].filter((n) => have.includes(n)),
      '_underground_mix-icy', 26, 16, D.PLAY_W, D.PLAY_H);
    say('Gemischte Tafel der eisigen Ebene (ice_cavern x mineral_vein): _underground_mix-icy.png');
  }

  fs.writeFileSync(path.join(ST, '_underground_new_numbers.txt'), out.join('\n') + '\n');
  console.log('\n-> ' + path.join(ST, '_underground_new_numbers.txt'));
})();
