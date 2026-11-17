/**
 * Beleuchtete Fassung ("_lit") eines Modul-Sprites PROGRAMMATISCH erzeugen.
 *
 * Warum programmatisch und nicht ueber fal.ai (wie scripts/generate-lit-variant.cjs,
 * mit dem der Bestand entstanden ist):
 *
 *   Fuer die Reihenstuecke des Autotilings (<name>_start / _mid / _end) muss die
 *   beleuchtete Fassung DIESELBE Periodizitaet und DENSELBEN Fusspunkt haben wie
 *   das unbeleuchtete Stueck — sonst reisst die Reihe auf luftlosen Welten auf.
 *   Eine img2img-Rueckgabe erfuellt das nicht verlaesslich (LESSONS § 3:
 *   "kontext ist NIE additiv", es regeneriert). Eine PUNKTWEISE Operation auf dem
 *   Basisbild erhaelt Periodizitaet und Fusspunkt dagegen exakt: gilt
 *   base(x,y) == base(x+256,y-128), dann gilt es auch fuer f(base(x,y)).
 *   Der einzige nicht-punktweise Anteil ist der Bloom; sein Feld ist ausserhalb
 *   der Lampen exakt 0, und die Lampen liegen weit genug im Bildinneren, dass der
 *   Blur den Rand nie erreicht (per --verify nachgemessen).
 *
 * Die Operation (drei Schritte, alle aus dem Bestand abgemessen):
 *
 *   1. Nachtabsenkung  out = base * K
 *      K = (0.61, 0.63, 0.66) — Median des Bestands liegt bei 0.614/0.620/0.629
 *      mit leichtem Kaelte-Tilt. isoConstants.ts haelt >= 60 % Luminanz fest
 *      ("pre-dimmed at bake time"), darueber kommt im Renderer noch der schwache
 *      Struktur-Darken-Pass (ATMOSPHERE_STRUCTURE_DARKEN_MAX, 15 %).
 *
 *   2. Emissive Kerne  an den WARMEN Beschlaegen, die das Basisbild schon hat
 *      (Kabelanschluesse am Mastfuss, Status-/Markierungspunkte am Schaltschrank).
 *      Die Maske ist aus dem Bild abgeleitet, also automatisch periodisch —
 *      genau das, was ein frei generiertes Lampenmuster nicht waere.
 *
 *   3. Bloom  gaussverschmiertes Maskenfeld, additiv in LIT_HALO_RGB
 *      (255,190,120 — derselbe Warmton, den der Renderer fuer den Bodenhalo
 *      benutzt), auf die Original-Silhouette geklemmt. Alpha bleibt Bit fuer Bit
 *      das des Basisbildes: gleiche Silhouette, gleicher Fusspunkt.
 *
 * Eingabe : src/assets/modules/<name>/<name>_0.webp
 * Ausgabe : assets/final/<name>_lit_0.png   (danach finalize-module-webp.ts)
 *
 * Usage:
 *   node scripts/make-lit-variant.cjs --name solar_panel_mid
 *   node scripts/make-lit-variant.cjs --name solar_panel_mid --verify
 *   npx tsx scripts/finalize-module-webp.ts --asset solar_panel_mid_lit
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

sharp.cache(false); // LESSONS § 1 — sonst EINVAL auf Windows beim Neuschreiben

const REPO_ROOT = path.resolve(__dirname, '..');

/** Nachtabsenkung pro Kanal. Bestands-Median 0.614/0.620/0.629. */
const DIM = [0.61, 0.63, 0.66];
/** Farbe des Lampenkerns. */
const CORE_RGB = [255, 198, 120];
/** Wie weit der Kern zur Lampenfarbe gezogen wird (0..1). */
const CORE_STRENGTH = 0.9;
/**
 * Bloom: Warmton (= LIT_HALO_RGB aus isoConstants.ts) in ZWEI Keulen.
 * Die enge Keule macht den Lampenhof, die weite den Lichtsaum auf dem Deck.
 * Beide mit FESTEM Gain statt Normierung auf das Bildmaximum: start/mid/end
 * haben nahezu identische Feldspitzen (0.679/0.679/0.680 bei Sigma 3), eine
 * bildweise Normierung wuerde dagegen jedes Stueck anders hell machen und die
 * Reihe in ungleich helle Abschnitte zerlegen.
 */
const BLOOM_RGB = [255, 190, 120];
const BLOOM_NEAR_SIGMA = 3;
const BLOOM_NEAR_GAIN = 1.6;
const BLOOM_NEAR_WEIGHT = 0.55;
const BLOOM_FAR_SIGMA = 14;
const BLOOM_FAR_GAIN = 4.0;
const BLOOM_FAR_WEIGHT = 0.3;

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

/**
 * Weiche Lampenmaske aus dem Basisbild: warme, gesaettigte, nicht zu dunkle
 * Beschlaege. Rein punktweise, damit sie die Periodizitaet der Reihe erbt.
 */
function lampWeight(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx === 0) return 0;
  const sat = (mx - mn) / mx;
  if (!(r > g && g >= b)) return 0;
  return (
    clamp01((r - b - 30) / 40) *
    clamp01((sat - 0.28) / 0.15) *
    clamp01((mx - 60) / 40)
  );
}

/** Separierbarer Gauss auf einem Float-Feld, Rand geklemmt. */
function blurField(field, w, h, sigma) {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float64Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const tmp = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        acc += field[y * w + xx] * kernel[k + radius];
      }
      tmp[y * w + x] = acc;
    }
  }
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        acc += tmp[yy * w + x] * kernel[k + radius];
      }
      out[y * w + x] = acc;
    }
  }
  return out;
}

/** max/mean |delta| zwischen (x,y) und (x+dx,y+dy) ueber opake Pixel. */
function periodicity(data, w, h, dx, dy) {
  let max = 0;
  let sum = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const X = x + dx;
      const Y = y + dy;
      if (X < 0 || X >= w || Y < 0 || Y >= h) continue;
      const i = (y * w + x) * 4;
      const j = (Y * w + X) * 4;
      if (data[i + 3] < 250 && data[j + 3] < 250) continue;
      let d = Math.abs(data[i + 3] - data[j + 3]);
      for (let c = 0; c < 3; c++) {
        d = Math.max(d, Math.abs(data[i + c] - data[j + c]));
      }
      if (d > max) max = d;
      sum += d;
      n++;
    }
  }
  return { max, mean: n ? sum / n : 0, n };
}

/** Unterste Zeile mit Alpha >= 200 — der Fusspunkt des Sprites. */
function footRow(data, w, h) {
  for (let y = h - 1; y >= 0; y--) {
    for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] >= 200) return y;
  }
  return -1;
}

async function main() {
  const name = arg('--name');
  if (!name) {
    console.error('--name <module> required (z.B. --name solar_panel_mid)');
    process.exit(1);
  }
  const verify = process.argv.includes('--verify');

  const src = path.join(
    REPO_ROOT,
    'src/assets/modules',
    name,
    `${name}_0.webp`,
  );
  if (!fs.existsSync(src)) {
    console.error(`Missing base sprite: ${src}`);
    process.exit(1);
  }

  const { data, info } = await sharp(src)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const out = Buffer.from(data);

  // ── 1 + 2: Nachtabsenkung und emissive Kerne (punktweise) ──
  const lamp = new Float64Array(w * h);
  let lampPx = 0;
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3];
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const wgt = a >= 200 ? lampWeight(r, g, b) : 0;
    lamp[i] = wgt;
    if (wgt > 0.5) lampPx++;
    for (let c = 0; c < 3; c++) {
      const dim = data[i * 4 + c] * DIM[c];
      out[i * 4 + c] = Math.round(
        dim + (CORE_RGB[c] - dim) * wgt * CORE_STRENGTH,
      );
    }
  }

  // ── 3: Bloom, additiv, auf die Original-Silhouette geklemmt ──
  const near = blurField(lamp, w, h, BLOOM_NEAR_SIGMA);
  const far = blurField(lamp, w, h, BLOOM_FAR_SIGMA);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3];
    if (a === 0) continue;
    const amt =
      (BLOOM_NEAR_WEIGHT * Math.min(1, near[i] * BLOOM_NEAR_GAIN) +
        BLOOM_FAR_WEIGHT * Math.min(1, far[i] * BLOOM_FAR_GAIN)) *
      (a / 255);
    for (let c = 0; c < 3; c++) {
      out[i * 4 + c] = Math.min(
        255,
        Math.round(out[i * 4 + c] + BLOOM_RGB[c] * amt),
      );
    }
  }
  // Alpha bleibt unangetastet: identische Silhouette, identischer Fusspunkt.

  const dst = path.join(REPO_ROOT, 'assets/final', `${name}_lit_0.png`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(dst);

  // ── Kennzahlen ──
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  let tot = 0;
  let glow = 0;
  const fit = [
    { xx: 0, xy: 0 },
    { xx: 0, xy: 0 },
    { xx: 0, xy: 0 },
  ];
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] < 250) continue;
    tot++;
    const la = lum(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    const lb = lum(out[i * 4], out[i * 4 + 1], out[i * 4 + 2]);
    if (lb > la + 8) glow++;
    else {
      for (let c = 0; c < 3; c++) {
        fit[c].xx += data[i * 4 + c] ** 2;
        fit[c].xy += data[i * 4 + c] * out[i * 4 + c];
      }
    }
  }
  console.log(`${name}_lit  ${w}x${h}  -> ${path.relative(REPO_ROOT, dst)}`);
  console.log(
    `  k=${fit.map(f => (f.xy / f.xx).toFixed(3)).join('/')}  ` +
      `glow=${((100 * glow) / tot).toFixed(1)}%  lampPx=${lampPx}`,
  );

  if (verify) {
    const before = footRow(data, w, h);
    const after = footRow(out, w, h);
    console.log(`  Fusspunkt: base ${before} / lit ${after}`);
    for (const [dx, dy] of [[256, -128]]) {
      const pb = periodicity(data, w, h, dx, dy);
      const pl = periodicity(out, w, h, dx, dy);
      console.log(
        `  Periodizitaet (${dx},${dy}): base max ${pb.max} mean ${pb.mean.toFixed(2)} | ` +
          `lit max ${pl.max} mean ${pl.mean.toFixed(2)} (n=${pl.n})`,
      );
    }
  }
}

main().catch(e => {
  console.error('Failed:', e);
  process.exit(1);
});
