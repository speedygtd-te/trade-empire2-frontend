/**
 * HULL RUNDE 3 — VERMESSUNG der 24 Basisdateien (3 Huellen x 4 Varianten x
 * {normal, lit}).
 *
 * Misst je Datei:
 *   - Alpha-BBox (Grundriss) und Objekt-Aspect
 *   - Abweichung des Aspects gegen die EIGENE Basis (<t>_0)
 *   - Alpha-Massivitaet: vom Rand nicht erreichbare Pixel mit Alpha < 250
 *     und das Minimum-Alpha darin (Referenz standard_0: 2 / 249)
 *   - Luminanz (Rec.601) innerhalb der Alpha-Maske; bei Lit zusaetzlich das
 *     Verhaeltnis zur zugehoerigen unbeleuchteten Fassung
 *
 * Quelle sind die STAGING-PNGs (nicht die webp), damit gemessen wird, was
 * integriert wurde, ohne den webp-Encoder mitzumessen.
 *
 * Usage: node scripts/hull-new3-verify.cjs [--json <datei>]
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.resolve(__dirname, '..');
const TYPES = ['composite', 'composite_platform_space', 'glass_carbon'];

const srcNormal = (t, n) => n === 0
  ? path.join(ROOT, 'assets', 'hulls', t, `${t}_0.png`)
  : path.join(ROOT, 'assets', 'style-test', 'hull-variants', `${t}_${n}.png`);
const srcLit = (t, n) => path.join(ROOT, 'assets', 'lit-batch', `${t}_${n}_lit.png`);

async function measure(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * C + 3] > 16) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  // Alpha-Massivitaet: Flood-Fill vom Rand ueber alles unter Alpha 250.
  const outside = new Uint8Array(W * H); const st = [];
  const push = (x, y) => { const q = y * W + x; if (!outside[q] && data[q * C + 3] < 250) { outside[q] = 1; st.push(q); } };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (st.length) {
    const q = st.pop(), x = q % W, y = (q - x) / W;
    if (x > 0) push(x - 1, y); if (x < W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1); if (y < H - 1) push(x, y + 1);
  }
  let holes = 0, minA = 255, lumSum = 0, lumN = 0;
  for (let q = 0; q < W * H; q++) {
    const a = data[q * C + 3];
    if (a > 16) {
      lumSum += 0.299 * data[q * C] + 0.587 * data[q * C + 1] + 0.114 * data[q * C + 2];
      lumN++;
    }
    if (outside[q]) continue;
    if (a < 250) { holes++; if (a < minA) minA = a; }
  }
  return {
    file: path.basename(file), W, H,
    bw: maxX - minX + 1, bh: maxY - minY + 1, minX, minY,
    aspect: (maxX - minX + 1) / (maxY - minY + 1),
    holes, minAlpha: holes ? minA : 255,
    opaque: lumN, luma: lumN ? lumSum / lumN : 0,
  };
}

// Der Kontaktbogen (hull-new3-variants-sheet.cjs) misst NICHT selbst, sondern
// benutzt diese Funktion — eine zweite Abschrift waere die erste Stelle, an der
// Bogen und Bericht auseinanderlaufen.
module.exports = { measure, TYPES, srcNormal, srcLit };

if (require.main !== module) return;

(async () => {
  const out = { measuredAt: new Date().toISOString(), types: {} };
  for (const t of TYPES) {
    const base = await measure(srcNormal(t, 0));
    const rows = [];
    for (const kind of ['normal', 'lit']) {
      for (let n = 0; n <= 3; n++) {
        const f = kind === 'normal' ? srcNormal(t, n) : srcLit(t, n);
        if (!fs.existsSync(f)) { rows.push({ kind, n, missing: f }); continue; }
        const m = await measure(f);
        m.kind = kind; m.n = n;
        m.devPct = ((m.aspect - base.aspect) / base.aspect) * 100;
        if (kind === 'lit') {
          const un = await measure(srcNormal(t, n));
          m.lumRatio = un.luma ? m.luma / un.luma : null;
        }
        rows.push(m);
      }
    }
    out.types[t] = { base: { bw: base.bw, bh: base.bh, aspect: base.aspect }, rows };
    console.log(`\n### ${t}  Basis-Grundriss ${base.bw}x${base.bh}  aspect ${base.aspect.toFixed(4)}`);
    console.log('kind   n  bbox        aspect   dev%    holes  minA  luma   lum/orig');
    for (const r of rows) {
      if (r.missing) { console.log(`${r.kind.padEnd(6)} ${r.n}  FEHLT: ${r.missing}`); continue; }
      console.log(
        `${r.kind.padEnd(6)} ${r.n}  ${String(r.bw + 'x' + r.bh).padEnd(11)} ` +
        `${r.aspect.toFixed(4)}  ${r.devPct >= 0 ? '+' : ''}${r.devPct.toFixed(2)}%  ` +
        `${String(r.holes).padStart(5)}  ${String(r.minAlpha).padStart(4)}  ` +
        `${r.luma.toFixed(1).padStart(5)}  ${r.lumRatio != null ? (r.lumRatio * 100).toFixed(1) + '%' : '-'}`,
      );
    }
  }
  const ji = process.argv.indexOf('--json');
  if (ji >= 0 && process.argv[ji + 1]) {
    fs.writeFileSync(path.resolve(ROOT, process.argv[ji + 1]), JSON.stringify(out, null, 2));
    console.log(`\n[json] ${process.argv[ji + 1]}`);
  }
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
