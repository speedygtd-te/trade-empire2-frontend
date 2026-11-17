/**
 * ÜBERBLENDUNGS-VERSUCH FÜR BIOM-ÜBERGÄNGE
 *
 * Rudis Hypothese (2026-09-05): "beach ocean würde ich tatsächlich mal
 * ausprobieren ob man das mit alpha blending nicht gut hinbekommt, wenn man das
 * wasser auf den strand überblenden lässt sieht es wie ein strand aus, ohne
 * brandung, das wasser ist aber ohnehin relativ wellenlos".
 *
 * Physikalisch ist das ein ernsthaftes Argument: eine Überblendung von Wasser
 * über Sand IST flaches Wasser über Sand — der Verlauf bildet die Zone ab, in
 * der man den Grund noch durchscheinen sieht. Trägt sie, wandern 27 HF-Paare
 * von hart nach weich und die Maskenbibliothek schrumpft entsprechend.
 *
 * Der Versuch prüft das an echten Kacheln, nicht am Argument:
 *   1  Prämisse: ist ocean/deep_ocean/shallow_water wirklich "wellenlos"?
 *      micro4 / micro8 / MESO / grain gegen das Korpusband aller 55 Biome.
 *   2  Rampenleiter: 3 Breiten x 3 Kantenkonfigurationen (SW / SE / beide),
 *      BEIDE Richtungen, alle vier Varianten.
 *   3  Küstenfeld: eine echte Biomgrenze über ein Iso-Feld, in der
 *      Zeichenregel "nur untere Kanten" — einmal gerichtet (jede Kachel
 *      zeichnet ihre eigene untere Kante) und einmal mit Inhalts-Vorrang
 *      (immer die Landkachel zeichnet).
 *   4  Spielskala + Achtel-Mip + Vakuum.
 *   5  Zahl zur Fehlerart "schmutziger Schleier": die Chroma-Senke. Eine
 *      lineare Überblendung zwischen einem WARMEN und einem KALTEN Ton läuft
 *      zwangsläufig durch Neutralgrau. Gemessen wird, wie tief.
 *
 * Zusätzlich als Gegenprobe ein zweiter Operator (ABS, "Wasser über Sand" als
 * Absorption statt als Mittelung) — er kostet fünf Zeilen und beantwortet die
 * Frage, ob ein Fehlschlag am Verfahren oder nur am Operator liegt.
 *
 * Schreibt NUR nach assets/style-test/tiles/_transition_*. Nichts nach src/.
 * Kein fal.ai, kein Netz.
 *
 * Aufruf: node scripts/tiles-transition-alpha-test.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const OUT = path.join(ROOT, 'assets', 'style-test', 'tiles');
const PRE = '_transition_';

const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
// Vakuum-Abdunkelung aus src/views/grid/isoConstants.ts
const VAC_A = 0.45, VAC_RGB = [5, 10, 25];
const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);

const tilePath = (b, v) => path.join(TILES, b, `${b}_${v}.webp`);

// ══════════════════════════════════════════════════════════════════
// 1 — Metriken
// ══════════════════════════════════════════════════════════════════

async function rawOf(buf, w, h) {
  let img = sharp(buf).ensureAlpha();
  if (w) img = img.resize(w, h, { fit: 'fill', kernel: 'lanczos3' });
  return img.raw().toBuffer({ resolveWithObject: true });
}

/** mittlere absolute Nachbardifferenz der Luma auf einer Mip-Stufe */
async function microAt(file, w, h) {
  const enc = await sharp(fs.readFileSync(file))
    .resize(w, h, { fit: 'fill' }).webp({ quality: 90, effort: 4 }).toBuffer();
  const { data, info } = await rawOf(enc);
  const ch = info.channels;
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    L[p] = L709(data[p * ch], data[p * ch + 1], data[p * ch + 2]);
    A[p] = data[p * ch + 3];
  }
  let s = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) {
    const p = y * w + x; if (A[p] < 200 || A[p + 1] < 200) continue;
    s += Math.abs(L[p] - L[p + 1]); n++;
  }
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x; if (A[p] < 200 || A[p + w] < 200) continue;
    s += Math.abs(L[p] - L[p + w]); n++;
  }
  return n ? s / n : 0;
}

/**
 * MESO  = Hell/Dunkel-Modulation auf Steingröße: sd des Bandpasses r6..r32,
 *         je 100 Einheiten Grundniveau (p70). Die Achse, auf der "flach" lebt.
 * grain = Autokorrelations-Halbwertslänge des Hochpasses in px auf der
 *         512er-Kachel; klein = feines, ruhiges Korn.
 */
async function textureMetrics(file) {
  const src = fs.readFileSync(file);
  const { data, info } = await rawOf(src);
  const ch = info.channels, w = info.width, h = info.height;
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    L[p] = L709(data[p * ch], data[p * ch + 1], data[p * ch + 2]);
    A[p] = data[p * ch + 3];
  }
  const blurL = async (sigma) => {
    const g = await sharp(src).ensureAlpha().blur(sigma).raw()
      .toBuffer({ resolveWithObject: true });
    const c = g.info.channels, o = new Float32Array(w * h);
    for (let p = 0; p < w * h; p++) o[p] = L709(g.data[p * c], g.data[p * c + 1], g.data[p * c + 2]);
    return o;
  };
  const b6 = await blurL(6), b32 = await blurL(32), b2 = await blurL(2);
  // nur der sichere Innenbereich der Raute (Rand ist gefiedert)
  const inside = (x, y) => {
    const u = Math.abs(x - (w - 1) / 2) / (w / 2) + Math.abs(y - (h - 1) / 2) / (h / 2);
    return u < 0.78 && A[y * w + x] >= 250;
  };
  let n = 0, s = 0, q = 0, lvl = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    const p = y * w + x, v = b6[p] - b32[p];
    s += v; q += v * v; n++; lvl.push(L[p]);
  }
  lvl.sort((a, b) => a - b);
  const p70 = lvl[Math.floor(lvl.length * 0.7)] || 1;
  const meso = n ? Math.sqrt(Math.max(0, q / n - (s / n) * (s / n))) / p70 * 100 : 0;
  // grain: Autokorrelation des Hochpasses entlang x, Halbwertslänge
  const hp = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) hp[p] = L[p] - b2[p];
  const acf = (d) => {
    let a = 0, b = 0, c = 0, m = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w - d; x++) {
      if (!inside(x, y) || !inside(x + d, y)) continue;
      const u = hp[y * w + x], v = hp[y * w + x + d];
      a += u * v; b += u * u; c += v * v; m++;
    }
    return m && b > 0 && c > 0 ? a / Math.sqrt(b * c) : 0;
  };
  const a0 = acf(1) || 1;
  let grain = 1;
  for (let d = 1; d <= 24; d++) { if (acf(d) < 0.5 * a0) { grain = d; break; } grain = d; }
  return { meso, grain, p70 };
}

async function tileStats(file) {
  const { data, info } = await rawOf(fs.readFileSync(file));
  const ch = info.channels, w = info.width, h = info.height;
  let n = 0; const s = [0, 0, 0]; const lv = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (data[i + 3] < 250) continue;
    const u = Math.abs(x - (w - 1) / 2) / (w / 2) + Math.abs(y - (h - 1) / 2) / (h / 2);
    if (u > 0.78) continue;
    s[0] += data[i]; s[1] += data[i + 1]; s[2] += data[i + 2];
    lv.push(L709(data[i], data[i + 1], data[i + 2])); n++;
  }
  lv.sort((a, b) => a - b);
  const m = s.map((x) => x / n);
  return {
    rgb: m, L: L709(m[0], m[1], m[2]), br: m[2] / m[0], gr: m[1] / m[0],
    p70: lv[Math.floor(n * 0.7)],
  };
}

/** Chroma eines RGB-Tripels: Abstand von der Grauachse, auf das Mittel bezogen */
const chroma = (rgb) => {
  const mx = Math.max(rgb[0], rgb[1], rgb[2]), mn = Math.min(rgb[0], rgb[1], rgb[2]);
  return mx > 0 ? (mx - mn) / mx : 0;
};

/**
 * Die Kernzahl des Versuchs. Eine lineare Überblendung ist eine GERADE im
 * RGB-Raum. Liegen die beiden Endpunkte auf verschiedenen Seiten der Grauachse
 * (warmer Sand, kaltes Wasser), läuft die Gerade zwangsläufig NÄHER an Grau
 * heran als beide Enden — das ist der "schmutzige Schleier", und er ist
 * ausrechenbar, bevor man ihn sieht.
 *
 *   dip   = wie weit die Chroma unter das schwächere Ende fällt (Prozentpunkte)
 *   tDip  = Mischungsanteil, an dem das passiert
 *   band  = Anteil der Rampe, dessen Chroma unter 90% des schwächeren Endes liegt
 */
function chromaDip(rgbA, rgbB) {
  const cA = chroma(rgbA), cB = chroma(rgbB), floor = Math.min(cA, cB);
  let min = Infinity, tMin = 0, under = 0, N = 101;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const c = chroma([0, 1, 2].map((k) => rgbA[k] * (1 - t) + rgbB[k] * t));
    if (c < min) { min = c; tMin = t; }
    if (c < 0.9 * floor) under++;
  }
  return { cA, cB, min, dip: (floor - min) * 100, tDip: tMin, band: under / N };
}

// ══════════════════════════════════════════════════════════════════
// 2 — Rautengeometrie und Rampen
// ══════════════════════════════════════════════════════════════════
//
// Eckpunkte der Raute in einem w x h Bild: N(w/2,0) E(w,h/2) S(w/2,h) W(0,h/2).
// Die UNTEREN Kanten sind SW (W→S, Nachbar (x, y+1)) und SE (S→E, Nachbar
// (x+1, y)) — hergeleitet aus worldToScreen in src/views/grid/isoConstants.ts.
// Die Rampe ist der Abstand zur jeweiligen Kante, nach innen laufend.

// Wert-Rauschen, in WELTKOORDINATEN ausgewertet: die Maske muss über die
// Kachelgrenze hinweg stetig sein, sonst zerfällt die Küste in eine Kette
// gleicher Lappen (LESSONS 4 — ein Raster fällt auf, wenn seine Tarnung fehlt).
function hash2(x, y) {
  let hh = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  hh = Math.imul(hh ^ (hh >>> 13), 1274126177);
  return ((hh ^ (hh >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0), b = hash2(x0 + 1, y0), c = hash2(x0, y0 + 1), d = hash2(x0 + 1, y0 + 1);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

function edgeAlpha(w, h, cfg, widthFrac, noiseAmp, wx, wy) {
  // Abstand quer durch die Raute (Kante zu Gegenkante), in Einheiten der
  // normierten Rautenkoordinate u = |x-cx|/(w/2) + |y-cy|/(h/2) <= 1.
  const cx = w / 2, cy = h / 2;
  const a = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // normierte Koordinaten: nx nach rechts-unten, ny nach links-unten
    const dx = (x - cx) / (w / 2), dy = (y - cy) / (h / 2);
    // Abstand zur SW-Kante (W→S): die Kante ist -dx + dy = 1
    const dSW = 1 - (-dx + dy);
    // Abstand zur SE-Kante (S→E): die Kante ist dx + dy = 1
    const dSE = 1 - (dx + dy);
    const rSW = Math.max(0, Math.min(1, 1 - dSW / widthFrac));
    const rSE = Math.max(0, Math.min(1, 1 - dSE / widthFrac));
    let v = 0;
    if (cfg === 'sw') v = rSW;
    else if (cfg === 'se') v = rSE;
    else v = Math.max(rSW, rSE); // Vereinigung, kein doppelter Auftrag
    if (noiseAmp) {
      // Weltposition dieses Pixels in Kacheleinheiten -> stetig über Kanten
      const n = vnoise((wx + (dx + 1) / 2) * 3.0, (wy + (dy + 1) / 2) * 3.0);
      const n2 = vnoise((wx + (dx + 1) / 2) * 7.0 + 11.3, (wy + (dy + 1) / 2) * 7.0 + 7.7);
      v = Math.max(0, Math.min(1, v + noiseAmp * ((n - 0.5) + 0.5 * (n2 - 0.5))));
    }
    // weiche S-Kurve statt linear: eine lineare Rampe zeigt an ihrem Anfang
    // eine sichtbare Bahnkante
    a[y * w + x] = v * v * (3 - 2 * v);
  }
  return a;
}

/**
 * Eine Zelle rendern: Grundkachel A, darüber Nachbarmaterial B mit der Rampe.
 * mode 'lin' = lineare Überblendung (Rudis Vorschlag)
 * mode 'abs' = Absorption: B wirkt als Filter über A und geht erst am Ende in
 *              volles B über — "Wasser über Sand" statt "Mittelwert aus beiden"
 */
function blendCell(A, B, alpha, w, h, mode) {
  const out = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    const aA = A[i + 3] / 255, aB = B[i + 3] / 255;
    const t = alpha[p] * aB;
    for (let c = 0; c < 3; c++) {
      const va = A[i + c], vb = B[i + c];
      let v;
      if (mode === 'abs') {
        // Filterphase bis t=0.6: A wird mit B eingefärbt und abgedunkelt,
        // danach Übergang in volles B
        const k = Math.min(1, t / 0.6);
        const bl = (vb / 255) * 1.35; // B als Filterfarbe, leicht angehoben
        const filtered = va * (1 - k) + va * bl * k;
        const u = Math.max(0, (t - 0.6) / 0.4);
        v = filtered * (1 - u) + vb * u;
      } else {
        v = va * (1 - t) + vb * t;
      }
      out[i + c] = Math.max(0, Math.min(255, Math.round(v)));
    }
    out[i + 3] = A[i + 3];
  }
  return out;
}

async function loadRaw(file, w, h) {
  const { data, info } = await rawOf(fs.readFileSync(file), w, h);
  if (info.channels === 4) return data;
  const out = Buffer.alloc(w * h * 4, 255);
  for (let p = 0; p < w * h; p++) for (let c = 0; c < 3; c++) out[p * 4 + c] = data[p * info.channels + c];
  return out;
}

/** Achtel-Mip nachstellen: erst auf 64x32 herunter, dann auf die Zeichengröße */
async function loadRawMip(file, w, h) {
  const small = await sharp(fs.readFileSync(file)).resize(64, 32, { fit: 'fill' })
    .webp({ quality: 90 }).toBuffer();
  const { data, info } = await sharp(small).ensureAlpha()
    .resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).raw()
    .toBuffer({ resolveWithObject: true });
  return info.channels === 4 ? data : data;
}

// ── Leinwand ─────────────────────────────────────────────────────

function newCanvas(w, h) {
  const c = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    c[p * 4] = BGA.r; c[p * 4 + 1] = BGA.g; c[p * 4 + 2] = BGA.b; c[p * 4 + 3] = 255;
  }
  return c;
}

function blit(canvas, CW, CH, cell, w, h, ox, oy) {
  for (let y = 0; y < h; y++) {
    const cy = oy + y; if (cy < 0 || cy >= CH) continue;
    for (let x = 0; x < w; x++) {
      const cx = ox + x; if (cx < 0 || cx >= CW) continue;
      const s = (y * w + x) * 4, d = (cy * CW + cx) * 4;
      const a = cell[s + 3] / 255; if (a <= 0) continue;
      for (let c = 0; c < 3; c++) canvas[d + c] = Math.round(canvas[d + c] * (1 - a) + cell[s + c] * a);
    }
  }
}

const png = (buf, w, h) => sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();

async function vacuum(buf, w, h) {
  const o = Buffer.from(buf);
  for (let p = 0; p < w * h; p++)
    for (let c = 0; c < 3; c++)
      o[p * 4 + c] = Math.round(o[p * 4 + c] * (1 - VAC_A) + VAC_RGB[c] * VAC_A);
  return png(o, w, h);
}

const svgLabel = (t, w, size, fill) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${size + 8}">` +
  `<text xml:space="preserve" x="2" y="${size + 1}" font-family="monospace" font-size="${size}" ` +
  `fill="${fill || '#8b949e'}">${String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`);

// ══════════════════════════════════════════════════════════════════
// 3 — Panels
// ══════════════════════════════════════════════════════════════════

const WIDTHS = [
  { id: 'schmal', f: 0.30 },
  { id: 'mittel', f: 0.55 },
  { id: 'breit', f: 0.85 },
];
const CFGS = ['sw', 'se', 'both'];
const CFG_LABEL = { sw: 'unten links', se: 'unten rechts', both: 'unten beide' };

/** Leiter: Zeilen = Breite, Spalten = Konfiguration x Variante */
async function ladder(aBiome, bBiome, mode, tw, th, variants) {
  const cols = CFGS.length * variants.length;
  const cellW = tw + 6, cellH = th + 22;
  const CW = cols * cellW + 8, CH = WIDTHS.length * cellH + 26;
  const canvas = newCanvas(CW, CH);
  const labels = [];
  const A = [], B = [];
  for (const v of variants) {
    A.push(await loadRaw(tilePath(aBiome, v), tw, th));
    B.push(await loadRaw(tilePath(bBiome, v), tw, th));
  }
  labels.push({ input: svgLabel(`${aBiome}  <-  ${bBiome}   (${mode === 'lin' ? 'lineare Überblendung' : 'Absorption'})`, CW, 13, '#79c0ff'), left: 2, top: 2 });
  for (let r = 0; r < WIDTHS.length; r++) {
    for (let ci = 0; ci < CFGS.length; ci++) {
      const alpha = edgeAlpha(tw, th, CFGS[ci], WIDTHS[r].f);
      for (let vi = 0; vi < variants.length; vi++) {
        const cell = blendCell(A[vi], B[vi], alpha, tw, th, mode);
        const x = (ci * variants.length + vi) * cellW + 4;
        const y = r * cellH + 24;
        blit(canvas, CW, CH, cell, tw, th, x, y);
        if (r === 0) labels.push({ input: svgLabel(`${CFG_LABEL[CFGS[ci]]} v${variants[vi]}`, cellW, 10), left: x, top: 14 });
      }
    }
    labels.push({ input: svgLabel(`${WIDTHS[r].id} ${f2(WIDTHS[r].f)}`, 90, 10), left: 4, top: r * cellH + 24 + th + 2 });
  }
  const base = await png(canvas, CW, CH);
  return sharp(base).composite(labels).png().toBuffer();
}

/**
 * Küstenfeld. Weltkoordinaten wie im Spiel (worldToScreen), damit SW/SE
 * wirklich SW/SE sind. `owner`:
 *   'grid'  jede Kachel zeichnet ihre eigenen unteren Kanten (gerichtet)
 *   'land'  immer die Landkachel zeichnet, gleich an welcher Kante
 */
async function coastField(aBiome, bBiome, opts) {
  const { tw, th, N, mode, width, owner, mip, isWaterFn } = opts;
  const half = tw / 2, hh = th / 2;
  const CW = (N + 1) * tw + tw, CH = (N + 1) * th + th;
  const canvas = newCanvas(CW, CH);
  const load = mip ? loadRawMip : loadRaw;
  const A = [], B = [];
  for (let v = 0; v < 4; v++) {
    A.push(await load(tilePath(aBiome, v), tw, th));
    B.push(await load(tilePath(bBiome, v), tw, th));
  }
  const variantOf = (x, y) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return Math.abs(h) % 4;
  };
  const alphaCache = {};
  const noiseAmp = opts.noise || 0;
  const getAlpha = (cfg, gx, gy) => (noiseAmp
    ? edgeAlpha(tw, th, cfg, width, noiseAmp, gx, gy)
    : (alphaCache[cfg] ||= edgeAlpha(tw, th, cfg, width)));
  for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
    const water = isWaterFn(gx, gy);
    const self = water ? bBiome : aBiome;
    const selfImgs = water ? B : A;
    const v = variantOf(gx, gy);
    let cell = selfImgs[v];
    // untere Nachbarn: SW = (gx, gy+1), SE = (gx+1, gy)
    const nSW = isWaterFn(gx, gy + 1), nSE = isWaterFn(gx + 1, gy);
    let drawSW = nSW !== water, drawSE = nSE !== water;
    if (owner === 'land') {
      // Inhalts-Vorrang: nur die Landkachel zeichnet; dafür alle vier Kanten
      drawSW = !water && nSW; drawSE = !water && nSE;
      if (!water) {
        const nNW = isWaterFn(gx - 1, gy), nNE = isWaterFn(gx, gy - 1);
        if (nNW || nNE) {
          const cfg = nNW && nNE ? 'both' : nNW ? 'sw' : 'se';
          // obere Kanten durch Spiegelung der unteren
          const a = getAlpha(cfg, gx, gy), flip = new Float32Array(tw * th);
          for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++)
            flip[y * tw + x] = a[(th - 1 - y) * tw + (tw - 1 - x)];
          cell = blendCell(cell, B[variantOf(gx, gy - 1)], flip, tw, th, mode);
        }
      }
    }
    if (drawSW || drawSE) {
      const cfg = drawSW && drawSE ? 'both' : drawSW ? 'sw' : 'se';
      const other = water ? A : B;
      const ov = variantOf(gx + (cfg === 'se' ? 1 : 0), gy + (cfg === 'sw' ? 1 : 0));
      cell = blendCell(cell, other[ov], getAlpha(cfg, gx, gy), tw, th, mode);
    }
    const sx = (gx - gy) * half + CW / 2 - half;
    const sy = (gx + gy) * hh + hh;
    blit(canvas, CW, CH, cell, tw, th, Math.round(sx), Math.round(sy));
  }
  return { buf: canvas, w: CW, h: CH };
}

// ══════════════════════════════════════════════════════════════════
// Hauptlauf
// ══════════════════════════════════════════════════════════════════

// ── Ko-Okkurrenz: welche Biome können überhaupt aneinandergrenzen ──
// Quelle: Docs/planet-biomes-by-type.md (Kanon). Identische Sätze
// (MOON_ICY/ICE, MOON_ROCKY/BARREN, MOON_VOLCANIC/VOLCANIC) sind weggelassen,
// sie erzeugen keine neuen Paare.
const SETS = {
  EARTH_LIKE: ['ocean', 'beach', 'plains', 'forest', 'mountain', 'snow_peak', 'swamp', 'desert_patch'],
  DESERT: ['sand_dunes', 'rocky_desert', 'mesa', 'salt_flat', 'oasis', 'canyon'],
  OCEAN: ['deep_ocean', 'shallow_water', 'reef', 'island', 'kelp_forest', 'volcanic_vent'],
  ICE: ['glacier', 'frozen_lake', 'tundra', 'ice_shelf', 'permafrost', 'crevasse'],
  VOLCANIC: ['lava_flow', 'basalt_plain', 'ash_field', 'caldera', 'obsidian_ridge', 'fumarole'],
  BARREN: ['regolith', 'crater', 'dust_plain', 'rocky_outcrop'],
  TOXIC: ['acid_lake', 'toxic_marsh', 'corroded_plain', 'chemical_vent', 'crystal_field'],
  ASTEROID_M: ['metallic_surface', 'impact_crater', 'boulder_field', 'dust_basin'],
  ASTEROID_C: ['carbon_crust', 'silicate_plain', 'fractured_zone', 'dust_basin'],
  ASTEROID_S: ['silicate_plain', 'impact_crater', 'void_edge', 'boulder_field'],
  UG_STANDARD: ['rock_layer', 'mineral_vein', 'cave_floor', 'deep_stone'],
  UG_EISIG: ['ice_cavern', 'mineral_vein', 'deep_stone'],
  UG_VULKANISCH: ['rock_layer', 'mineral_vein', 'magma_pocket'],
  UG_KERN: ['magma_pocket', 'lava_flow'],
};

/**
 * GRUND 2 — der Verlauf bedeutet etwas Reales, auch wenn die Kacheln weit
 * auseinanderliegen. Nicht messbar, deshalb eine ausdrückliche Liste mit je
 * einer Begründung. Fast ausschließlich Fluide über einem Grund.
 */
const FLOW = {
  'beach|ocean': 'Wasser über Sand = flaches Wasser, der Verlauf IST die Zone, in der man den Grund sieht',
  'ocean|plains': 'überflutete Wiese, Wasserkante über Bewuchs',
  'ocean|forest': 'überflutete Baumgrenze — Mangrovenlogik',
  'ocean|swamp': 'Marsch ist ohnehin Übergangszone Wasser/Land',
  'desert_patch|ocean': 'Wasser über Sand, wie beach',
  'island|shallow_water': 'Wasser über Sandbank',
  'island|reef': 'Riffsaum um die Insel — Wasser über Kalk',
  'island|kelp_forest': 'Wasser über Bewuchs',
  'island|volcanic_vent': 'Wasser über Vulkangrund',
  'deep_ocean|island': 'Steilküste — Verlauf ist die Tiefenzunahme',
  'oasis|sand_dunes': 'Wasser über Sand',
  'oasis|rocky_desert': 'Wasser über Fels',
  'oasis|salt_flat': 'Salzsee-Rand: Wasser verdunstet in die Kruste',
  'canyon|oasis': 'Wasser am Fuß der Wand',
  'mesa|oasis': 'Wasser am Fuß der Wand',
  'ice_shelf|tundra': 'Wasser/Eis über Frostgrus',
  'frozen_lake|ice_shelf': 'gefrorenes gegen offenes Wasser — Eisrand',
  'glacier|ice_shelf': 'Gletscher kalbt ins Wasser',
  'ice_shelf|permafrost': 'Wasser über Frostboden',
  'crevasse|ice_shelf': 'Eis gegen Wasser',
  'ash_field|lava_flow': 'Lava fließt über Asche — der Verlauf ist die Abkühlzone',
  'caldera|lava_flow': 'Lava im Kessel',
  'fumarole|lava_flow': 'Lava über Schwefelfeld',
  'lava_flow|obsidian_ridge': 'Lava am Fuß des Grats',
  'acid_lake|toxic_marsh': 'Säure über Marsch',
  'acid_lake|corroded_plain': 'Säure über zerfressenem Grund',
  'acid_lake|chemical_vent': 'Säure über Schlot',
  'acid_lake|crystal_field': 'Säure über Kristallfeld — die Kristalle wachsen daraus',
  'magma_pocket|rock_layer': 'Magma im Gestein',
  'magma_pocket|mineral_vein': 'Magma an der Ader',
  'lava_flow|magma_pocket': 'dasselbe Material',
};

/**
 * AUSDRÜCKLICH HART, unabhängig vom gemessenen Abstand. Rudis Ausnahme:
 * eine erstarrte Lavadecke hat einen Rand.
 */
const FORCE_HARD = { basalt_plain: 'erstarrte Decke mit Rand (Rudi)' };

/**
 * MATERIALFAMILIE je Biom — Rudis Regel: "alle wasser biome per alpha blending
 * arbeiten lassen, stein genauso, vulkan bis auf basalt plain ebenfalls".
 * Gleiche Familie -> weich. Familienwechsel -> hart, sofern nicht ein Verlauf
 * (FLOW) greift.
 *
 * Randfälle stehen im Dokument einzeln begründet:
 *   beach/island/sand_dunes  Sand ist verwitterter Fels -> Mineralisch
 *   oasis/ice_shelf          sind Gewässer -> Wasser (ice_shelf per PLAN 3.2)
 *   frozen_lake              gefrorene Fläche, fester Grund -> Eis
 *   tundra/permafrost        Frostboden gehört zur Eisfamilie ihres Satzes
 *   snow_peak                Fels mit Schneehaube -> Mineralisch
 *   swamp                    bewachsener Nassboden -> Vegetation
 *   toxic_marsh/crystal_field  gehören zur Chemie ihres Satzes
 *   volcanic_vent            Unterwasserschlot im OCEAN-Satz -> Wasser
 *   void_edge                Motiv ungeklärt -> offen
 */
const FAM = {
  ocean: 'Wasser', deep_ocean: 'Wasser', shallow_water: 'Wasser', reef: 'Wasser',
  kelp_forest: 'Wasser', volcanic_vent: 'Wasser', ice_shelf: 'Wasser', oasis: 'Wasser',
  acid_lake: 'Wasser',
  mountain: 'Mineralisch', snow_peak: 'Mineralisch', mesa: 'Mineralisch', canyon: 'Mineralisch',
  rocky_desert: 'Mineralisch', rocky_outcrop: 'Mineralisch', regolith: 'Mineralisch',
  crater: 'Mineralisch', dust_plain: 'Mineralisch', salt_flat: 'Mineralisch',
  beach: 'Mineralisch', sand_dunes: 'Mineralisch', desert_patch: 'Mineralisch',
  island: 'Mineralisch', boulder_field: 'Mineralisch', impact_crater: 'Mineralisch',
  dust_basin: 'Mineralisch', silicate_plain: 'Mineralisch', carbon_crust: 'Mineralisch',
  metallic_surface: 'Mineralisch', fractured_zone: 'Mineralisch', rock_layer: 'Mineralisch',
  mineral_vein: 'Mineralisch', cave_floor: 'Mineralisch', deep_stone: 'Mineralisch',
  glacier: 'Eis', frozen_lake: 'Eis', crevasse: 'Eis', ice_cavern: 'Eis',
  tundra: 'Eis', permafrost: 'Eis',
  plains: 'Vegetation', forest: 'Vegetation', swamp: 'Vegetation',
  lava_flow: 'Vulkanisch', basalt_plain: 'Vulkanisch', ash_field: 'Vulkanisch',
  caldera: 'Vulkanisch', obsidian_ridge: 'Vulkanisch', fumarole: 'Vulkanisch',
  magma_pocket: 'Vulkanisch',
  corroded_plain: 'Chemisch', chemical_vent: 'Chemisch', crystal_field: 'Chemisch',
  toxic_marsh: 'Chemisch',
  void_edge: '?',
};

const PAIRS = [
  // Rudis Fluid-Hypothese
  { a: 'beach', b: 'ocean', fam: 'Sand|Wasser', note: 'Rudis Fall — Wasser auf den Strand überblenden' },
  { a: 'island', b: 'shallow_water', fam: 'Sand|Wasser', note: 'analog, aber helles Flachwasser' },
  { a: 'reef', b: 'shallow_water', fam: 'Wasser|Wasser', note: 'Wasser gegen Wasser — Kontrolle, hier MUSS es gehen' },
  { a: 'sand_dunes', b: 'oasis', fam: 'Sand|Wasser', note: 'kleines Gewässer in Sand' },
  { a: 'beach', b: 'deep_ocean', fam: 'Sand|Wasser', note: 'GEGENPROBE — größter Helligkeitsabstand' },
  // Rudis Materialfamilien-Regel: Stein in Stein
  { a: 'regolith', b: 'dust_plain', fam: 'Stein|Stein', note: 'weiche Referenz aus BARREN' },
  { a: 'regolith', b: 'rocky_outcrop', fam: 'Stein|Stein', note: 'Stein gegen Stein MIT Höhensprung' },
  { a: 'rocky_desert', b: 'mesa', fam: 'Stein|Stein', note: 'Stein gegen Stein MIT Höhensprung (Tafelberg)' },
  // Rudis Materialfamilien-Regel: Vulkanisch in Vulkanisch, mit der Ausnahme
  { a: 'ash_field', b: 'lava_flow', fam: 'Vulkan|Vulkan', note: 'vulkanisch weich — Lavafront auf Asche' },
  { a: 'ash_field', b: 'basalt_plain', fam: 'Vulkan|Vulkan*', note: 'GEGENPROBE zur Ausnahme basalt_plain' },
  { a: 'basalt_plain', b: 'lava_flow', fam: 'Vulkan|Vulkan*', note: 'GEGENPROBE zur Ausnahme basalt_plain' },
  // Familienwechsel als Kontrast
  { a: 'beach', b: 'plains', fam: 'Sand|Vegetation', note: 'Rudi früher: "braucht eine ordentliche kante"' },
];

// ══════════════════════════════════════════════════════════════════
// 4 — Optischer Abstand zweier Kacheln (GRUND 1)
// ══════════════════════════════════════════════════════════════════
//
// Rudi: "mesa gegen rocky desert passt, die sehen sich optisch sehr ähnlich."
// Daraus folgt ein Kriterium, das sich messen lässt: liegen zwei Kacheln in
// Helligkeit, Farbe und Textur dicht beieinander, kann die Mischzone gar nicht
// falsch aussehen — sie liegt zwischen zwei ähnlichen Zuständen.
//
// Der Abstand wird auf drei Beine gestellt, jedes davon am Korpus normiert
// (Streuung über alle 55 Biome), damit kein Bein die Skala bestimmt:
//   LEVEL   p70                       — Helligkeitsniveau
//   FARBE   B/R, G/R                  — Farbton
//   TEXTUR  micro4, MESO, grain       — Feinkontrast, Reliefband, Kornlänge
// d = sqrt(mittel der drei quadrierten Beine). Ein Bein von 1.0 bedeutet:
// so weit auseinander wie eine Standardabweichung des ganzen Korpus.

function makeDistance(perBiome, keys) {
  const sd = {};
  for (const k of keys) {
    const a = Object.values(perBiome).map((b) => b[k]);
    const m = a.reduce((s, x) => s + x, 0) / a.length;
    sd[k] = Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length) || 1;
  }
  return (x, y) => {
    const A = perBiome[x], B = perBiome[y];
    if (!A || !B) return null;
    const z = (k) => (A[k] - B[k]) / sd[k];
    const level = Math.abs(z('p70'));
    const colour = Math.sqrt((z('br') ** 2 + z('gr') ** 2) / 2);
    const texture = Math.sqrt((z('micro4') ** 2 + z('meso') ** 2 + z('grain') ** 2) / 3);
    return { d: Math.sqrt((level ** 2 + colour ** 2 + texture ** 2) / 3), level, colour, texture };
  };
}

// ══════════════════════════════════════════════════════════════════
// Hauptlauf
// ══════════════════════════════════════════════════════════════════

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const CACHE = path.join(OUT, PRE + 'metrics.json');

  // ── 1  alle 220 Kacheln vermessen (gecacht) ──
  const biomes = fs.readdirSync(TILES, { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name).sort();
  let raw = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  let measured = 0;
  for (const b of biomes) {
    for (let v = 0; v < 4; v++) {
      const key = `${b}_${v}`;
      const f = tilePath(b, v);
      if (!fs.existsSync(f) || raw[key]) continue;
      const t = await textureMetrics(f);
      const s = await tileStats(f);
      raw[key] = {
        b, v, L: s.L, p70: s.p70, br: s.br, gr: s.gr, rgb: s.rgb,
        micro4: await microAt(f, 128, 64), micro8: await microAt(f, 64, 32),
        meso: t.meso, grain: t.grain,
      };
      measured++;
      if (measured % 20 === 0) console.log(`    … ${measured} Kacheln vermessen`);
    }
  }
  fs.writeFileSync(CACHE, JSON.stringify(raw));
  console.log(`1/5  ${Object.keys(raw).length} Kacheln vermessen (${measured} neu)`);

  // Mittel über die vier Varianten je Biom
  const perBiome = {};
  for (const b of biomes) {
    const rows = [0, 1, 2, 3].map((v) => raw[`${b}_${v}`]).filter(Boolean);
    if (!rows.length) continue;
    const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
    perBiome[b] = {
      L: avg('L'), p70: avg('p70'), br: avg('br'), gr: avg('gr'),
      micro4: avg('micro4'), micro8: avg('micro8'), meso: avg('meso'), grain: avg('grain'),
      rgb: [0, 1, 2].map((c) => rows.reduce((s, r) => s + r.rgb[c], 0) / rows.length),
      n: rows.length,
    };
  }
  const KEYS = ['p70', 'br', 'gr', 'micro4', 'meso', 'grain'];
  const dist = makeDistance(perBiome, KEYS);

  // Korpusband
  const band = {};
  for (const k of ['micro4', 'micro8', 'meso', 'grain', 'p70']) {
    const a = Object.values(perBiome).map((x) => x[k]).sort((p, q) => p - q);
    const at = (p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
    band[k] = { p10: at(0.1), p50: at(0.5), p90: at(0.9), min: a[0], max: a[a.length - 1] };
  }
  const rankOf = (k, v) => {
    const a = Object.values(perBiome).map((x) => x[k]).sort((p, q) => p - q);
    return a.filter((x) => x < v).length / a.length;
  };

  // ── 2  Prüfen, ob der Abstand Rudis Urteile reproduziert ──
  const CALIB = [
    { a: 'mesa', b: 'rocky_desert', soll: 'nah', quelle: 'Rudi: "sehen sich optisch sehr ähnlich"' },
    { a: 'regolith', b: 'dust_plain', soll: 'nah', quelle: 'Rudi: BARREN per Alpha-Blending' },
    { a: 'regolith', b: 'crater', soll: 'nah', quelle: 'Rudi: BARREN per Alpha-Blending' },
    { a: 'crater', b: 'dust_plain', soll: 'nah', quelle: 'Rudi: BARREN per Alpha-Blending' },
    { a: 'regolith', b: 'rocky_outcrop', soll: 'nah', quelle: 'Rudi: Stein per Alpha-Blending' },
    { a: 'reef', b: 'shallow_water', soll: 'nah', quelle: 'Rudi: alle Wasserbiome per Alpha-Blending' },
    { a: 'deep_ocean', b: 'kelp_forest', soll: 'nah', quelle: 'Rudi: alle Wasserbiome' },
    { a: 'beach', b: 'plains', soll: 'weit', quelle: 'Rudi: "braucht eine ordentliche kante"' },
    { a: 'plains', b: 'mountain', soll: 'weit', quelle: 'Rudi: "genauso"' },
    { a: 'ash_field', b: 'basalt_plain', soll: 'weit', quelle: 'Rudi: basalt_plain ist die Ausnahme' },
    { a: 'basalt_plain', b: 'lava_flow', soll: 'weit', quelle: 'Rudi: basalt_plain ist die Ausnahme' },
  ];
  const famVerdict = (a, b) => {
    if (FORCE_HARD[a] || FORCE_HARD[b]) return 'weit';
    if (FAM[a] === '?' || FAM[b] === '?') return '?';
    return FAM[a] === FAM[b] ? 'nah' : 'weit';
  };
  for (const c of CALIB) {
    Object.assign(c, dist(c.a, c.b));
    c.fam = `${FAM[c.a]}|${FAM[c.b]}`;
    c.famSagt = famVerdict(c.a, c.b);
    c.famOk = c.famSagt === c.soll;
  }
  const nah = CALIB.filter((c) => c.soll === 'nah').map((c) => c.d);
  const weit = CALIB.filter((c) => c.soll === 'weit').map((c) => c.d);
  const maxNah = Math.max(...nah), minWeit = Math.min(...weit);
  const trennt = maxNah < minWeit;
  const THRESH = trennt ? (maxNah + minWeit) / 2 : maxNah;
  const famHits = CALIB.filter((c) => c.famOk).length;
  // bester erreichbarer Trefferanteil einer EINZELNEN Schwelle auf d
  let bestDist = 0, bestT = 0;
  for (const t of CALIB.map((c) => c.d).concat([0, 9]).sort((a, b) => a - b)) {
    const hits = CALIB.filter((c) => (c.d < t ? 'nah' : 'weit') === c.soll).length;
    if (hits > bestDist) { bestDist = hits; bestT = t; }
  }
  console.log(`2/5  Kalibrierung: Abstand trifft ${bestDist}/${CALIB.length} (beste Schwelle ${f2(bestT)}), Materialfamilie trifft ${famHits}/${CALIB.length}`);

  // ── 3  alle 132 Paare einordnen ──
  const seen = new Map();
  for (const [sname, list] of Object.entries(SETS)) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const k = [list[i], list[j]].sort().join('|');
      if (!seen.has(k)) seen.set(k, { a: k.split('|')[0], b: k.split('|')[1], sets: [] });
      seen.get(k).sets.push(sname);
    }
  }
  const pairs = [];
  for (const [k, p] of seen) {
    const d = dist(p.a, p.b);
    const forced = FORCE_HARD[p.a] || FORCE_HARD[p.b] ? (FORCE_HARD[p.a] ? p.a : p.b) : null;
    const flow = FLOW[k] || FLOW[[p.b, p.a].join('|')] || null;
    const fa = FAM[p.a], fb = FAM[p.b];
    let cls, grund;
    if (fa === '?' || fb === '?') { cls = 'OFFEN'; grund = 'void_edge ungeklärt'; }
    else if (forced) { cls = 'HART'; grund = 'Ausnahme ' + forced; }
    else if (fa === fb) { cls = 'WEICH'; grund = 'gleiche Familie ' + fa + ' (Grund 1)'; }
    else if (flow) { cls = 'WEICH'; grund = 'Verlauf (Grund 2)'; }
    else { cls = 'HART'; grund = `Familienwechsel ${fa}/${fb}, kein Verlauf`; }
    pairs.push({ k, ...p, ...(d || { d: null }), fam: `${fa}|${fb}`, cls, grund, flow });
  }
  pairs.sort((x, y) => (x.d ?? 99) - (y.d ?? 99));
  const nW = pairs.filter((p) => p.cls === 'WEICH').length;
  const nH = pairs.filter((p) => p.cls === 'HART').length;
  const nO = pairs.filter((p) => p.cls === 'OFFEN').length;
  console.log(`3/5  ${pairs.length} Paare: ${nW} weich, ${nH} hart, ${nO} offen`);

  // ── 4  Chroma-Senke für die gezeigten Paare ──
  const dips = [];
  for (const p of PAIRS) {
    const A = perBiome[p.a], B = perBiome[p.b];
    const dd = chromaDip(A.rgb, B.rgb);
    const od = dist(p.a, p.b);
    const key = [p.a, p.b].sort().join('|');
    const row = pairs.find((x) => x.k === key);
    dips.push({
      ...p, La: A.L, Lb: B.L, dL: Math.abs(A.L - B.L), bra: A.br, brb: B.br,
      ...dd, ...od, cls: row ? row.cls : '—', grund: row ? row.grund : '—',
    });
  }

  // ── 5  Bilder ──
  console.log('4/5  Rampenleitern rendern …');
  const written = [];
  const write = async (name, buf) => {
    fs.writeFileSync(path.join(OUT, PRE + name), buf);
    written.push(PRE + name);
    return PRE + name;
  };
  for (const p of PAIRS) {
    for (const dir of [[p.a, p.b], [p.b, p.a]]) {
      await write(`ladder_${dir[0]}__${dir[1]}_lin.png`, await ladder(dir[0], dir[1], 'lin', 192, 96, [0, 2]));
    }
  }
  for (const p of [PAIRS[0], PAIRS[4]]) {
    await write(`ladder_${p.a}__${p.b}_abs.png`, await ladder(p.a, p.b, 'abs', 192, 96, [0, 2]));
  }

  console.log('5/5  Küstenfelder rendern …');
  const coast = (gx, gy) => (gx * 0.55 + gy * 0.45 + 2.2 * Math.sin(gx * 0.7) + 1.4 * Math.cos(gy * 0.9)) > 8.2;
  const N = 15;
  const fieldJobs = [
    { key: 'beach_ocean', a: 'beach', b: 'ocean', mode: 'lin', width: 0.55, owner: 'grid' },
    { key: 'beach_ocean_land', a: 'beach', b: 'ocean', mode: 'lin', width: 0.55, owner: 'land' },
    { key: 'beach_ocean_abs', a: 'beach', b: 'ocean', mode: 'abs', width: 0.55, owner: 'grid' },
    { key: 'beach_ocean_hart', a: 'beach', b: 'ocean', mode: 'lin', width: 0.0001, owner: 'grid' },
    { key: 'beach_deep_ocean', a: 'beach', b: 'deep_ocean', mode: 'lin', width: 0.55, owner: 'grid' },
    { key: 'island_shallow', a: 'island', b: 'shallow_water', mode: 'lin', width: 0.55, owner: 'grid' },
    { key: 'reef_shallow', a: 'reef', b: 'shallow_water', mode: 'lin', width: 0.55, owner: 'grid' },
    { key: 'sand_oasis', a: 'sand_dunes', b: 'oasis', mode: 'lin', width: 0.55, owner: 'grid' },
    { key: 'regolith_dust', a: 'regolith', b: 'dust_plain', mode: 'lin', width: 0.55, owner: 'grid' },
    { key: 'regolith_outcrop', a: 'regolith', b: 'rocky_outcrop', mode: 'lin', width: 0.55, owner: 'grid' },
    { key: 'rockydesert_mesa', a: 'rocky_desert', b: 'mesa', mode: 'lin', width: 0.55, owner: 'grid' },
    { key: 'ash_lava', a: 'ash_field', b: 'lava_flow', mode: 'lin', width: 0.55, owner: 'grid' },
    { key: 'ash_basalt', a: 'ash_field', b: 'basalt_plain', mode: 'lin', width: 0.55, owner: 'grid' },
    { key: 'basalt_lava', a: 'basalt_plain', b: 'lava_flow', mode: 'lin', width: 0.55, owner: 'grid' },
    { key: 'beach_plains', a: 'beach', b: 'plains', mode: 'lin', width: 0.55, owner: 'grid' },
    // verrauschte Rampe: bricht sie die 45-Grad-Treppe?
    { key: 'beach_ocean_noise', a: 'beach', b: 'ocean', mode: 'lin', width: 0.55, owner: 'grid', noise: 0.9 },
    { key: 'beach_ocean_noise_breit', a: 'beach', b: 'ocean', mode: 'lin', width: 0.95, owner: 'grid', noise: 1.3 },
    { key: 'regolith_dust_noise', a: 'regolith', b: 'dust_plain', mode: 'lin', width: 0.55, owner: 'grid', noise: 0.9 },
    { key: 'ash_lava_noise', a: 'ash_field', b: 'lava_flow', mode: 'lin', width: 0.55, owner: 'grid', noise: 0.9 },
  ];
  for (const j of fieldJobs) {
    const big = await coastField(j.a, j.b, { tw: 96, th: 48, N, mode: j.mode, width: j.width, owner: j.owner, noise: j.noise, isWaterFn: coast });
    await write(`field_${j.key}.png`, await png(big.buf, big.w, big.h));
    await write(`field_${j.key}_vac.png`, await vacuum(big.buf, big.w, big.h));
    const play = await coastField(j.a, j.b, { tw: 48, th: 24, N, mode: j.mode, width: j.width, owner: j.owner, noise: j.noise, isWaterFn: coast });
    await write(`play_${j.key}.png`, await sharp(await png(play.buf, play.w, play.h))
      .resize(play.w * 2, play.h * 2, { kernel: 'nearest' }).png().toBuffer());
    const mip = await coastField(j.a, j.b, { tw: 48, th: 24, N, mode: j.mode, width: j.width, owner: j.owner, noise: j.noise, isWaterFn: coast, mip: true });
    await write(`mip_${j.key}.png`, await sharp(await png(mip.buf, mip.w, mip.h))
      .resize(mip.w * 2, mip.h * 2, { kernel: 'nearest' }).png().toBuffer());
  }

  // ── Zahlen ──
  const T = [];
  T.push('KORPUSBAND (55 Biome, Mittel über 4 Varianten)');
  T.push('  Kennzahl      p10       p50       p90       min       max');
  for (const k of ['p70', 'micro4', 'micro8', 'meso', 'grain'])
    T.push(`  ${k.padEnd(9)} ${f2(band[k].p10).padStart(8)} ${f2(band[k].p50).padStart(9)} ${f2(band[k].p90).padStart(9)} ${f2(band[k].min).padStart(9)} ${f2(band[k].max).padStart(9)}`);
  T.push('');
  T.push('PRÄMISSE: sind die Wasserkacheln "relativ wellenlos"?');
  T.push('  biome              L     p70    B/R    G/R   micro4   Perz   micro8    MESO   Perz   grain   Perz');
  for (const b of ['ocean', 'deep_ocean', 'shallow_water', 'reef', 'kelp_forest', 'ice_shelf', 'oasis', 'acid_lake', 'volcanic_vent']) {
    const r = perBiome[b]; if (!r) continue;
    T.push(`  ${b.padEnd(15)} ${f1(r.L).padStart(5)} ${f1(r.p70).padStart(7)}  ${f3(r.br)}  ${f3(r.gr)}  ${f2(r.micro4).padStart(6)}  ${(rankOf('micro4', r.micro4) * 100).toFixed(0).padStart(4)}%  ${f2(r.micro8).padStart(6)}  ${f2(r.meso).padStart(6)}  ${(rankOf('meso', r.meso) * 100).toFixed(0).padStart(4)}%  ${f2(r.grain).padStart(6)}  ${(rankOf('grain', r.grain) * 100).toFixed(0).padStart(4)}%`);
  }
  T.push('');
  T.push('KALIBRIERUNG — welches Kriterium reproduziert Rudis Urteile?');
  T.push('  Paar                        soll       d   LEVEL   FARBE  TEXTUR   Familie                    sagt   ok   Quelle');
  for (const c of CALIB)
    T.push(`  ${(c.a + ' | ' + c.b).padEnd(26)} ${c.soll.padEnd(5)} ${f2(c.d).padStart(6)}  ${f2(c.level).padStart(6)}  ${f2(c.colour).padStart(6)}  ${f2(c.texture).padStart(6)}   ${c.fam.padEnd(26)} ${c.famSagt.padEnd(5)} ${(c.famOk ? 'JA' : 'NEIN').padEnd(5)} ${c.quelle}`);
  T.push(`  --> OPTISCHER ABSTAND: nah max ${f2(maxNah)} | weit min ${f2(minWeit)} | ${trennt ? 'trennt' : 'UEBERLAPPT'} | beste einzelne Schwelle trifft ${bestDist}/${CALIB.length} bei ${f2(bestT)}`);
  T.push(`  --> MATERIALFAMILIE:   trifft ${famHits}/${CALIB.length}`);
  const dNah = nah.reduce((s2, x) => s2 + x, 0) / nah.length;
  const dWeit = weit.reduce((s2, x) => s2 + x, 0) / weit.length;
  T.push(`  --> Mittel d der als NAH beurteilten Paare ${f2(dNah)} gegen ${f2(dWeit)} der als WEIT beurteilten -- die harten liegen im Mittel NAEHER.`);
  T.push('');
  T.push('CHROMA-SENKE der linearen Überblendung (gezeigte Paare)');
  T.push('  Paar                      Einordnung      d    L(A)   L(B)     dL  B/R(A) B/R(B)  chr(A) chr(B)  chr_min  Senke  bei t  Grauband');
  for (const d of dips)
    T.push(`  ${(d.a + ' | ' + d.b).padEnd(24)}  ${d.cls.padEnd(6)} ${f2(d.d).padStart(6)} ${f1(d.La).padStart(6)} ${f1(d.Lb).padStart(6)} ${f1(d.dL).padStart(6)}  ${f3(d.bra)}  ${f3(d.brb)}   ${f3(d.cA)}  ${f3(d.cB)}   ${f3(d.min)}  ${f1(d.dip).padStart(5)}  ${f2(d.tDip)}   ${(d.band * 100).toFixed(0).padStart(5)}%`);
  T.push('');
  T.push(`ALLE ${pairs.length} PAARE, nach optischem Abstand sortiert (d nur noch als Beobachtung)`);
  T.push('  Paar                                d   LEVEL   FARBE  TEXTUR   Einordnung  Grund');
  for (const p of pairs)
    T.push(`  ${(p.a + ' | ' + p.b).padEnd(34)} ${p.d === null ? '   —  ' : f2(p.d).padStart(6)}  ${p.d === null ? '  —   ' : f2(p.level).padStart(6)}  ${p.d === null ? '  —   ' : f2(p.colour).padStart(6)}  ${p.d === null ? '  —   ' : f2(p.texture).padStart(6)}   ${p.cls.padEnd(6)}  ${p.grund}`);
  T.push('');
  T.push(`VERTEILUNG: ${nW} weich / ${nH} hart / ${nO} offen von ${pairs.length}`);
  const byGrund = {};
  for (const p of pairs) byGrund[p.grund] = (byGrund[p.grund] || 0) + 1;
  for (const [g, n] of Object.entries(byGrund).sort((a, b) => b[1] - a[1])) T.push(`  ${String(n).padStart(3)}  ${g}`);
  T.push('');
  T.push('HARTE PAARE (die Restmenge, um die es beim Backen ginge)');
  for (const p of pairs.filter((x) => x.cls === 'HART' || x.cls === 'OFFEN'))
    T.push(`  ${(p.a + ' | ' + p.b).padEnd(34)} d ${p.d === null ? '—' : f2(p.d)}  ${p.grund}`);

  const txt = T.join('\n');
  fs.writeFileSync(path.join(OUT, PRE + 'numbers.txt'), txt);
  console.log('\n' + txt);
  fs.writeFileSync(path.join(OUT, PRE + 'data.json'), JSON.stringify({
    band, perBiome, CALIB, THRESH, trennt, pairs, dips, written,
  }, null, 1));
  console.log(`\nfertig in ${((Date.now() - t0) / 1000).toFixed(1)} s — ${written.length} Bilder`);
}

main().catch((e) => { console.error(e); process.exit(1); });
