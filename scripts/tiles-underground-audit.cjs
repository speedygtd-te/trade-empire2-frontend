/**
 * UNDERGROUND FAMILY AUDIT -- the full metric set for the underground biomes
 * plus the anchors this round needs (crystal_field for ice_cavern, and the
 * earth-base candidates swamp / plains).
 *
 * Reads only. Writes assets/style-test/tiles/_underground_numbers.txt.
 *
 * Measured with the AUTHORITATIVE definitions (LESSONS 5):
 *   per slot   p70 p99 blow% sd  B/R G/R  meso  micro4 micro8  grain
 *              cbPP cgPP cbSd cgSd  gx gy rim  spec16 tail  uCV uP90
 *   per biome  Raster (grid_play gridTot), Naht (boundaryStep ratio),
 *              intra-slot max|NCC| and max hpNCC
 *   both NORMAL and under the vacuum darkening (VAC_A 0.45 vs rgb(5,10,25))
 *
 * Usage: node scripts/tiles-underground-audit.cjs [fam ...]
 */
const fs = require('fs');
const path = require('path');
const S = require('./lib-tile-metrics.cjs');
const D = require('./tiles-dust-plain-lib.cjs');
const MS = require('./lib-meso.cjs');
const GR = require('./lib-grain.cjs');
const CH = require('./lib-chroma.cjs');
const UN = require('./lib-uniform.cjs');
const CO = require('./lib-corrode.cjs');
const sharp = S.sharp;

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');

const ARGS = process.argv.slice(2);
const FAMS = ARGS.length ? ARGS : [
  'rock_layer', 'mineral_vein', 'deep_stone', 'ice_cavern',
  'cave_floor', 'magma_pocket', 'crystal_field', 'swamp', 'plains',
];

const tile = (f, n) => path.join(TILES, f, f + '_' + n + '.webp');
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : 'NaN');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'NaN');
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : 'NaN');

function vacRaw(src, ch, w, h) {
  const out = Buffer.from(src);
  for (let p = 0; p < w * h; p++) {
    for (let c = 0; c < 3; c++) {
      out[p * ch + c] = Math.round(src[p * ch + c] * (1 - S.VAC_A) + S.VAC_RGB[c] * S.VAC_A);
    }
  }
  return out;
}

async function hpField(webpBuf) {
  const r = await sharp(webpBuf).resize(256, 128, { fit: 'fill' })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const L = new Float32Array(w * h), A = new Uint8Array(w * h), Ab = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    L[p] = S.L709(r.data[p * ch], r.data[p * ch + 1], r.data[p * ch + 2]);
    A[p] = r.data[p * ch + 3];
    Ab[p] = A[p] >= 250 ? 1 : 0;
  }
  const bl = GR.blurOpaque(L, Ab, w, h, 6);
  const H = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) H[p] = L[p] - bl[p];
  return { L: H, A, w, h };
}
function nccF(a, b) {
  let n = 0, sa = 0, sb = 0;
  for (let p = 0; p < a.L.length; p++) { if (a.A[p] < 250 || b.A[p] < 250) continue; sa += a.L[p]; sb += b.L[p]; n++; }
  if (!n) return 0;
  sa /= n; sb /= n;
  let num = 0, da = 0, db = 0;
  for (let p = 0; p < a.L.length; p++) {
    if (a.A[p] < 250 || b.A[p] < 250) continue;
    const x = a.L[p] - sa, y = b.L[p] - sb;
    num += x * y; da += x * x; db += y * y;
  }
  return (da > 0 && db > 0) ? num / Math.sqrt(da * db) : 0;
}
async function hpNccAll(bufA, bufB) {
  const a = await hpField(bufA);
  let mx = 0;
  for (const k of Object.keys(D.ORI)) {
    const bb = await D.ORI[k](sharp(bufB)).png().toBuffer();
    mx = Math.max(mx, Math.abs(nccF(a, await hpField(bb))));
  }
  return mx;
}

async function slotSet(webpBuf) {
  const r = await sharp(webpBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const a = S.statsRaw(r.data, ch, w, h);
  const tr = D.tiltRimRaw(r.data, ch, w, h);
  const meso = MS.mesoNorm(r.data, ch, w, h, a.p70, 6, 32);
  const m4 = await D.microContrast(await sharp(webpBuf).resize(128, 64, { fit: 'fill' }).webp(D.WEBP).toBuffer());
  const m8 = await D.microContrast(await sharp(webpBuf).resize(64, 32, { fit: 'fill' }).webp(D.WEBP).toBuffer());
  const g = GR.grain(r.data, ch, w, h);
  const c = CH.chromaRamp(r.data, ch, w, h);
  const u = UN.uniformity(r.data, ch, w, h);
  const sp = CO.specular(r.data, ch, w, h);
  return {
    p70: a.p70, p99: a.p99, blow: 100 * a.blow, sd: a.sd, lum: a.lum, intLum: a.intLum,
    br: a.br, gr: a.gr, dark: 100 * a.dark, gx: tr.gx, gy: tr.gy, rim: tr.rim,
    meso, m4, m8, grain: g.half,
    cbPP: c.cbPP, cgPP: c.cgPP, cbSd: c.cbSd, cgSd: c.cgSd,
    uCV: u.uCV, uP90: u.uP90, spec16: sp.spec16, tail: sp.tail,
  };
}

const HDR = 'slot   p70    p99  blow%  dark%    sd   B/R   G/R   meso  micro4 micro8 grain'
  + '   cbPP   cgPP   cbSd   cgSd     gx     gy    rim  spec16  tail   uCV  uP90';
function row(n, m) {
  return ('  ' + n).padEnd(5)
    + f1(m.p70).padStart(6) + f1(m.p99).padStart(7) + f2(m.blow).padStart(7) + f1(m.dark).padStart(7)
    + f1(m.sd).padStart(6) + f3(m.br).padStart(6) + f3(m.gr).padStart(6)
    + f2(m.meso).padStart(7) + f2(m.m4).padStart(8) + f2(m.m8).padStart(7)
    + f2(m.grain).padStart(6)
    + f3(m.cbPP).padStart(7) + f3(m.cgPP).padStart(7)
    + f3(m.cbSd).padStart(7) + f3(m.cgSd).padStart(7)
    + f2(m.gx).padStart(7) + f2(m.gy).padStart(7) + f2(m.rim).padStart(7)
    + f2(m.spec16).padStart(8) + f2(m.tail).padStart(6)
    + f3(m.uCV).padStart(6) + f2(m.uP90).padStart(6);
}

(async () => {
  const out = [];
  const say = (s) => { out.push(s); console.log(s); };
  say('UNDERGROUND FAMILY AUDIT  ' + new Date().toISOString().slice(0, 10));
  say('micro4/micro8 = massgebliche Definition (Vollkachel -> 128x64 / 64x32, fit fill, durch webp)');
  say('');

  const store = {};
  for (const fam of FAMS) {
    const bufs = [0, 1, 2, 3].map((n) => fs.readFileSync(tile(fam, n)));
    const vacs = [];
    for (const b of bufs) {
      const r = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const v = vacRaw(r.data, r.info.channels, r.info.width, r.info.height);
      vacs.push(await sharp(v, { raw: { width: r.info.width, height: r.info.height, channels: r.info.channels } })
        .webp(D.WEBP).toBuffer());
    }
    const norm = [], vac = [];
    for (let i = 0; i < 4; i++) { norm.push(await slotSet(bufs[i])); vac.push(await slotSet(vacs[i])); }
    const g = await D.gridOf(bufs);
    const gv = await D.gridOf(vacs);

    let selfN = 0, selfH = 0, worstH = '', worstN = '';
    const pairs = [];
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const n = await D.nccAll(bufs[i], bufs[j]);
      const mn = Math.max(...Object.values(n).map(Math.abs));
      const mh = await hpNccAll(bufs[i], bufs[j]);
      pairs.push([i + '/' + j, mn, mh]);
      if (mh > selfH) { selfH = mh; worstH = i + '/' + j; }
      if (mn > selfN) { selfN = mn; worstN = i + '/' + j; }
    }
    store[fam] = { bufs, vacs, norm, vac, g, gv, selfN, selfH, pairs };

    say('=== ' + fam.toUpperCase() + ' ===');
    say('NORMAL');
    say(HDR);
    norm.forEach((m, i) => say(row(i, m)));
    say('VAKUUM');
    say(HDR);
    vac.forEach((m, i) => say(row(i, m)));
    say('  Raster grid_play ' + f2(g.play.gridTot) + '  coh ' + f2(g.play.gridCoh) + '  slot ' + f2(g.play.gridSlot)
      + '  Naht(ratio) ' + f2(g.bs.ratio) + '  Naht-Sprung ' + f2(g.bs.step)
      + '   |  VAC Raster ' + f2(gv.play.gridTot) + '  VAC Naht ' + f2(gv.bs.ratio));
    say('  Slotpaare (max|NCC| / hpNCC): '
      + pairs.map((p) => p[0] + ' ' + f3(p[1]) + '/' + f3(p[2])).join('   '));
    say('  worst |NCC| ' + f3(selfN) + ' (' + worstN + ')   worst hpNCC ' + f3(selfH) + ' (' + worstH + ')');
    say('');
  }

  const keys = Object.keys(store);
  say('=== KREUZ-KORRELATION (max ueber alle 16 Slotpaare x 4 Orientierungen) ===');
  say('Paar                                       max|NCC|   max hpNCC');
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    let mn = 0, mh = 0;
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
      const n = await D.nccAll(store[keys[i]].bufs[a], store[keys[j]].bufs[b]);
      mn = Math.max(mn, ...Object.values(n).map(Math.abs));
      mh = Math.max(mh, await hpNccAll(store[keys[i]].bufs[a], store[keys[j]].bufs[b]));
    }
    say((keys[i] + ' x ' + keys[j]).padEnd(44) + f3(mn).padStart(8) + f3(mh).padStart(11));
  }
  say('');

  say('=== d-PRIME auf Spielskala (64x32, Pegel / B/R / G/R / joint) ===');
  const feats = {};
  for (const k of keys) {
    const v = [];
    for (const b of store[k].bufs) {
      const r = await sharp(b).resize(64, 32, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const ch = r.info.channels, w = r.info.width, h = r.info.height;
      for (let p = 0; p < w * h; p++) {
        if (r.data[p * ch + 3] < 250) continue;
        v.push([S.L709(r.data[p * ch], r.data[p * ch + 1], r.data[p * ch + 2]),
          r.data[p * ch + 2] / Math.max(1, r.data[p * ch]),
          r.data[p * ch + 1] / Math.max(1, r.data[p * ch])]);
      }
    }
    const mean = [0, 1, 2].map((c) => v.reduce((s, x) => s + x[c], 0) / v.length);
    const sd = [0, 1, 2].map((c) => Math.sqrt(v.reduce((s, x) => s + Math.pow(x[c] - mean[c], 2), 0) / v.length));
    feats[k] = { mean, sd };
  }
  say('Paar                                       dPegel   dB/R   dG/R   d-JOINT');
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const A = feats[keys[i]], B = feats[keys[j]];
    const d = [0, 1, 2].map((c) => Math.abs(A.mean[c] - B.mean[c])
      / Math.sqrt(0.5 * (A.sd[c] * A.sd[c] + B.sd[c] * B.sd[c])));
    say((keys[i] + ' x ' + keys[j]).padEnd(44) + f2(d[0]).padStart(6) + f2(d[1]).padStart(7)
      + f2(d[2]).padStart(7) + f2(Math.hypot(d[0], d[1], d[2])).padStart(10));
  }

  fs.mkdirSync(ST, { recursive: true });
  fs.writeFileSync(path.join(ST, '_underground_numbers.txt'), out.join('\n') + '\n');
  console.log('\n-> ' + path.join(ST, '_underground_numbers.txt'));
})();
