/**
 * MESSSKRIPT: vergleicht Iso-Modulsprites gegen die harten Anforderungen einer
 * Reihenfamilie (Massstab, Fusspunkt, Farbe, Hoehe). Typunabhaengig.
 *
 *   node scripts/measure-iso-piece.cjs assets/final/large_storage_mid_0.png \
 *        assets/final/large_storage_end_0.png assets/final/large_storage_0.png
 *   node scripts/measure-iso-piece.cjs --period-ref 256,-128 <dateien...>
 *
 * Argumente:
 *   --period-ref dx,dy   Kachelversatz in Autorenpixeln (Vorgabe 256,-128).
 *   --no-period          Periodenmessung ueberspringen (sie ist die teure).
 *
 * ── Was gemessen wird und warum ───────────────────────────────────────────
 *
 * MASSSTAB — Periode des Motivs entlang der Reihenrichtung, per Autokorrelation
 * des HOCHPASSES (LESSONS §8: die rohe NCC misst geteilte Beleuchtung mit).
 * Ein Einzelstueck, dessen Motivperiode von der des Mittelstuecks abweicht,
 * zeigt beim Wechsel Einzel<->Reihe unterschiedlich grosse Regalfelder.
 *
 * FUSSPUNKT — unterste opake Zeile und Anteil der opaken Pixel UNTERHALB der
 * Bodenraute. Die Raute hat ihre Suedspitze im Anker (256,512), ihre OBEREN
 * Kanten laufen also y = 256 + 0.5*|x-256|, ihre UNTEREN y = 384 + 0.5x
 * (links) bzw. y = 640 - 0.5x (rechts). Weicht der Anteil ab, sitzt das
 * Gebaeude anders auf der Zelle und huepft beim Spritewechsel.
 *
 * "unter der Raute" meint hier die OBEREN Kanten — das ist die Groesse, die in
 * Commit 46f20065 mit 34-45 % (altes Sprite 36 %) ausgewiesen wurde, und sie
 * unterscheidet ein Gebaeude, das in die Zelle hinein sitzt, von einem, das
 * ueber ihr aufragt. Der Anteil unter den UNTEREN Kanten wird als zweite Zahl
 * mitgegeben: er misst, wie weit das Sprite ueber die Zelle nach unten haengt.
 *
 * ANKERLINIE — die untere Huellkurve einer Reihe liegt auf y + 0.5x = 640
 * (die nach links verlaengerte Suedost-Kante der Raute). Gemessen wird die
 * Abweichung der untersten opaken Zeile je Spalte von dieser Linie, als
 * Median/p90 ueber die Spalten, in denen die Linie im Bild liegt.
 *
 * FARBE — Luma/B/R/G/R ueber opake Pixel (alpha >= 200). Die Reihenstuecke des
 * grossen Lagers sind mit EINEM gemeinsamen Gain-Satz auf Luma ~82 / B/R ~1.00
 * gegradet; ein Einzelstueck daneben muss im selben Band liegen.
 *
 * HOEHE — Alpha-Bbox. Die 48x48-Zeichenbox wird von der ganzen Datei gefuellt,
 * eine kleinere Bbox macht das Sprite im Spiel kleiner.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const argOf = (n, d) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};
const PERIOD_REF = argOf('--period-ref', '256,-128').split(',').map(Number);
const NO_PERIOD = process.argv.includes('--no-period');
const FILES = process.argv.slice(2).filter(a => !a.startsWith('--') && /\.(png|webp)$/i.test(a));
if (!FILES.length) {
  console.error('Mindestens eine Bilddatei angeben.');
  process.exit(1);
}

async function loadRGBA(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { d: data, W: info.width, H: info.height };
}

/** Separabler Box-Blur, Rand geklemmt. */
function blur(src, W, H, r) {
  const t = new Float32Array(W * H);
  const o = new Float32Array(W * H);
  const cl = (v, m) => Math.min(m - 1, Math.max(0, v));
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[y * W + cl(x, W)];
    for (let x = 0; x < W; x++) {
      t[y * W + x] = s / (2 * r + 1);
      s -= src[y * W + cl(x - r, W)];
      s += src[y * W + cl(x + r + 1, W)];
    }
  }
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += t[cl(y, H) * W + x];
    for (let y = 0; y < H; y++) {
      o[y * W + x] = s / (2 * r + 1);
      s -= t[cl(y - r, H) * W + x];
      s += t[cl(y + r + 1, H) * W + x];
    }
  }
  return o;
}

const bil = (F, W, H, x, y) => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 + 1 >= W || y0 + 1 >= H) return null;
  const fx = x - x0;
  const fy = y - y0;
  return (
    F[y0 * W + x0] * (1 - fx) * (1 - fy) +
    F[y0 * W + x0 + 1] * fx * (1 - fy) +
    F[(y0 + 1) * W + x0] * (1 - fx) * fy +
    F[(y0 + 1) * W + x0 + 1] * fx * fy
  );
};

function nccShift(HP, A, W, H, dx, dy, minN) {
  let sa = 0,
    sb = 0,
    saa = 0,
    sbb = 0,
    sab = 0,
    n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (A[i] < 0.5) continue;
      const av = bil(A, W, H, x + dx, y + dy);
      if (av === null || av < 0.5) continue;
      const a = HP[i];
      const b = bil(HP, W, H, x + dx, y + dy);
      sa += a;
      sb += b;
      saa += a * a;
      sbb += b * b;
      sab += a * b;
      n++;
    }
  }
  if (n < minN) return { v: -2, n };
  const ma = sa / n,
    mb = sb / n;
  const cov = sab / n - ma * mb;
  const va = saa / n - ma * ma;
  const vb = sbb / n - mb * mb;
  return { v: cov / Math.sqrt(va * vb), n };
}

(async () => {
  console.log(`[measure-iso-piece] Kachelversatz-Referenz ${PERIOD_REF[0]},${PERIOD_REF[1]}`);
  for (const rel of FILES) {
    const file = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
    if (!fs.existsSync(file)) {
      console.log(`\n${rel}: FEHLT`);
      continue;
    }
    const img = await loadRGBA(file);
    const { d, W, H } = img;
    const meta = await sharp(file).metadata();
    console.log(`\n── ${rel}  ${W}x${H}  alpha=${meta.hasAlpha} ─────────────────────`);

    // ── Bbox + Fusspunkt ──
    let x0 = 1e9,
      y0 = 1e9,
      x1 = -1,
      y1 = -1,
      nOp = 0;
    const lowestOf = new Int32Array(W).fill(-1);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
          if (y > lowestOf[x]) lowestOf[x] = y;
          nOp++;
        }
      }
    console.log(
      `   Bbox      x[${x0}..${x1}] y[${y0}..${y1}]  ${x1 - x0 + 1}x${y1 - y0 + 1}` +
        `  opak ${nOp} px (${((100 * nOp) / (W * H)).toFixed(1)} %)`,
    );
    console.log(`   Fusspunkt unterste opake Zeile = ${y1}`);

    // ── Anteil unterhalb der Bodenraute ──
    const sc = W / 512; // erlaubt auch andere Autorenkanten
    const upperEdge = x => 256 * sc + 0.5 * Math.abs(x - 256 * sc);
    const lowerEdge = x => (x < 256 * sc ? 384 * sc + 0.5 * x : 640 * sc - 0.5 * x);
    let belowUp = 0,
      belowLow = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] <= 8) continue;
        if (y > upperEdge(x)) belowUp++;
        if (y > lowerEdge(x)) belowLow++;
      }
    console.log(
      `   Raute     Anteil opaker Pixel unter der Bodenraute = ${((100 * belowUp) / nOp).toFixed(1)} %` +
        `  (unter deren UNTERkanten: ${((100 * belowLow) / nOp).toFixed(1)} %)`,
    );

    // ── Abweichung der unteren Huellkurve von der Ankerlinie y + 0.5x = 640 ──
    const devs = [];
    for (let x = 0; x < W; x++) {
      if (lowestOf[x] < 0) continue;
      const yAnchor = 640 * sc - 0.5 * x;
      if (yAnchor < 0 || yAnchor > H - 1) continue;
      devs.push(lowestOf[x] - yAnchor);
    }
    devs.sort((a, b) => a - b);
    const q = p => (devs.length ? devs[Math.min(devs.length - 1, Math.round(p * (devs.length - 1)))] : NaN);
    console.log(
      `   Ankerlinie Abweichung der untersten Zeile von y+0.5x=${640 * sc}: ` +
        `min ${q(0).toFixed(0)} p10 ${q(0.1).toFixed(0)} Median ${q(0.5).toFixed(0)} ` +
        `p90 ${q(0.9).toFixed(0)} max ${q(1).toFixed(0)}  (n=${devs.length} Spalten)`,
    );

    // ── Farbe ──
    let r = 0,
      g = 0,
      b = 0,
      nc = 0;
    for (let i = 0; i < W * H; i++) {
      if (d[i * 4 + 3] < 200) continue;
      r += d[i * 4];
      g += d[i * 4 + 1];
      b += d[i * 4 + 2];
      nc++;
    }
    r /= nc;
    g /= nc;
    b /= nc;
    console.log(
      `   Farbe     R${r.toFixed(1)} G${g.toFixed(1)} B${b.toFixed(1)}  ` +
        `Luma ${(0.2126 * r + 0.7152 * g + 0.0722 * b).toFixed(1)}  ` +
        `B/R ${(b / r).toFixed(3)}  G/R ${(g / r).toFixed(3)}  (n=${nc})`,
    );

    if (NO_PERIOD) continue;

    // ── Motivperiode entlang der Reihenrichtung ──
    const L = new Float32Array(W * H);
    const A = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      L[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
      A[i] = d[i * 4 + 3] / 255;
    }
    const LA = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) LA[i] = L[i] * A[i];
    const bLA = blur(LA, W, H, 12);
    const bA = blur(A, W, H, 12);
    const HP = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const m = bA[i] > 0.05 ? bLA[i] / bA[i] : 0;
      HP[i] = A[i] > 0.5 ? L[i] - m : 0;
    }
    // Grobsuche entlang der Iso-Richtung (Steigung -0.5), Verschiebung nach
    // rechts oben. Ein 512er Sprite gibt bei dx=256 noch ~halbe Ueberdeckung.
    let best = { v: -2 };
    const minN = 6000;
    for (let dx = 96 * sc; dx <= 320 * sc; dx += 2) {
      for (let dy = Math.round(-0.75 * dx); dy <= Math.round(-0.25 * dx); dy += 2) {
        const res = nccShift(HP, A, W, H, dx, dy, minN);
        if (res.v > best.v) best = { dx, dy, v: res.v, n: res.n };
      }
    }
    if (best.v > -1) {
      let ref = { ...best };
      for (let dx = best.dx - 3; dx <= best.dx + 3; dx += 0.5)
        for (let dy = best.dy - 3; dy <= best.dy + 3; dy += 0.5) {
          const res = nccShift(HP, A, W, H, dx, dy, minN);
          if (res.v > ref.v) ref = { dx, dy, v: res.v, n: res.n };
        }
      console.log(
        `   Periode   Motivperiode ${ref.dx.toFixed(1)},${ref.dy.toFixed(1)} ` +
          `ncc=${ref.v.toFixed(4)} (n=${ref.n})  ` +
          `-> ${((ref.dx / PERIOD_REF[0]) * 100).toFixed(1)} % des Kachelversatzes`,
      );
    } else {
      console.log('   Periode   keine verwertbare Ueberdeckung');
    }
    // Gezielt: NCC am Kachelversatz und an seiner Haelfte. Die Regalfelder des
    // grossen Lagers liegen auf der HALBEN Kachelperiode (zwei Felder je Zelle),
    // deshalb sind beide Zahlen zu nennen.
    for (const f of [1, 0.5]) {
      const dx = PERIOD_REF[0] * sc * f,
        dy = PERIOD_REF[1] * sc * f;
      const at = nccShift(HP, A, W, H, dx, dy, 2000);
      console.log(
        `   Periode   ncc bei (${dx},${dy}) = ${at.v.toFixed(4)} (n=${at.n})` +
          (f === 1 ? '  <- Kachelversatz' : '  <- halber Kachelversatz (Regalfeld)'),
      );
    }
  }
})().catch(e => {
  console.error(String(e));
  process.exit(1);
});
