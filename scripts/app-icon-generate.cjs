#!/usr/bin/env node
/**
 * app-icon-generate.cjs
 *
 * Erzeugt aus Docs/icon.jpg (1408x1408, JPEG, ohne Alpha) alle App-Icons
 * fuer Android (Legacy-Mipmaps + Adaptive-Vordergrund) und iOS (1024er Single-Size).
 *
 * Zwei Adaptive-Varianten:
 *   A ("nichts verlieren")  vollstaendiges Bild, so skaliert dass Station + Wortmarke
 *                           komplett im 72dp-Kreis der Maske liegen.
 *   B ("Motiv gross")       nur die Station, formatfuellend in die sichere Zone.
 * Legacy-PNGs und iOS sind in BEIDEN Varianten identisch: das vollstaendige Bild.
 *
 * Nutzung:
 *   node scripts/app-icon-generate.cjs                 # baut beide Varianten + Vergleichsbogen,
 *                                                      # installiert Variante A
 *   node scripts/app-icon-generate.cjs --install b     # installiert Variante B
 *   node scripts/app-icon-generate.cjs --no-install    # nur Staging + Bogen
 *   node scripts/app-icon-generate.cjs --legacy-corners black|transparent|source
 *   node scripts/app-icon-generate.cjs --src Docs/icon2.jpg   # andere Quelle
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const argVal = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const SRC_REL = argVal('--src', path.join('Docs', 'icon.jpg'));
const SRC = path.resolve(ROOT, SRC_REL);
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const IOS_ICON = path.join(
  ROOT,
  'ios',
  'App',
  'App',
  'Assets.xcassets',
  'AppIcon.appiconset',
  'AppIcon-512@2x.png'
);
const STAGE = path.join(ROOT, 'assets', 'app-icon');
const SHEET_DIR = path.join(ROOT, 'assets', 'style-test', 'app-icon');

const DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
const SAFE_FRACTION = 72 / 108; // sichtbarer Bereich des Adaptive-Icons
const CIRCLE_FRACTION = 36 / 108; // Radius der Kreismaske, bezogen auf die 108dp-Kante

const INSTALL = args.includes('--no-install') ? null : argVal('--install', 'a').toLowerCase();
const LEGACY_CORNERS = argVal('--legacy-corners', 'source').toLowerCase();

const mkdir = (d) => fs.mkdirSync(d, { recursive: true });

/** Liest die vorhandenen Zielgroessen aus dem Bestand — der Bestand gilt. */
async function readTargetSizes() {
  const out = {};
  for (const d of DENSITIES) {
    const launcher = path.join(RES, `mipmap-${d}`, 'ic_launcher.png');
    const fg = path.join(RES, `mipmap-${d}`, 'ic_launcher_foreground.png');
    const a = await sharp(launcher).metadata();
    const b = await sharp(fg).metadata();
    out[d] = { legacy: a.width, foreground: b.width };
    if (a.width !== a.height || b.width !== b.height) {
      throw new Error(`Nicht-quadratisches Bestands-Icon in mipmap-${d}`);
    }
  }
  return out;
}

/**
 * Plakette ueber ihren umlaufenden hellen Rand finden: eine breite, ringfoermige
 * Komponente im unteren Bilddrittel, die keinen Bildrand beruehrt. Der Planetenbogen
 * faellt heraus, weil er bis an den Bildrand laeuft; die Buchstaben fallen heraus,
 * weil sie zu schmal und flaechig gefuellt sind.
 */
function brightRingBox(W, H, lum) {
  const THR = 90;
  const yTop = Math.floor(H * 0.63);
  const m = new Uint8Array(W * H);
  for (let y = yTop; y < H; y++)
    for (let x = 0; x < W; x++) if (lum(x, y) > THR) m[y * W + x] = 1;
  const seen = new Uint8Array(W * H);
  let best = null;
  for (let y = yTop; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k0 = y * W + x;
      if (!m[k0] || seen[k0]) continue;
      const st = [k0];
      seen[k0] = 1;
      let n = 0;
      let x0 = W;
      let y0 = H;
      let x1 = -1;
      let y1 = -1;
      while (st.length) {
        const k = st.pop();
        n++;
        const cx = k % W;
        const cy = (k / W) | 0;
        if (cx < x0) x0 = cx;
        if (cx > x1) x1 = cx;
        if (cy < y0) y0 = cy;
        if (cy > y1) y1 = cy;
        const nb = [];
        if (cx > 0) nb.push(k - 1);
        if (cx < W - 1) nb.push(k + 1);
        if (cy > yTop) nb.push(k - W);
        if (cy < H - 1) nb.push(k + W);
        for (const q of nb)
          if (m[q] && !seen[q]) {
            seen[q] = 1;
            st.push(q);
          }
      }
      const w = x1 - x0 + 1;
      const h = y1 - y0 + 1;
      const touchesEdge = x0 <= W * 0.05 || x1 >= W * 0.95;
      const ringLike = n / (w * h) < 0.25;
      if (touchesEdge || !ringLike || w < W * 0.4 || h < H * 0.08) continue;
      if (!best || w * h > (best.x1 - best.x0 + 1) * (best.y1 - best.y0 + 1))
        best = { x0, y0, x1, y1 };
    }
  return best || {};
}

/** Analysiert die Quelle: weisser Rand, Station, Wortmarke, Hintergrundfarbe. */
async function analyze() {
  const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const C = info.channels;
  const rgb = (x, y) => {
    const i = (y * W + x) * C;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const lum = (x, y) => {
    const p = rgb(x, y);
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
  };

  // 1) Weisser JPEG-Rand um die einbelichteten runden Ecken: Flutfuellung vom Bildrand.
  const bg = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push([x, 0], [x, H - 1]);
  for (let y = 0; y < H; y++) stack.push([0, y], [W - 1, y]);
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const k = y * W + x;
    if (bg[k] || lum(x, y) < 170) continue;
    bg[k] = 1;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const dilate = (mask, r) => {
    const tmp = new Uint8Array(W * H);
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let v = 0;
        for (let d = -r; d <= r && !v; d++) {
          const xx = x + d;
          if (xx >= 0 && xx < W && mask[y * W + xx]) v = 1;
        }
        tmp[y * W + x] = v;
      }
    for (let x = 0; x < W; x++)
      for (let y = 0; y < H; y++) {
        let v = 0;
        for (let d = -r; d <= r && !v; d++) {
          const yy = y + d;
          if (yy >= 0 && yy < H && tmp[yy * W + x]) v = 1;
        }
        out[y * W + x] = v;
      }
    return out;
  };
  const bgWide = dilate(bg, 10); // schluckt den JPEG-Saum an der Rundung

  // 2) Wortmarken-Box: neutrale, dunkle Flaeche im unteren Bilddrittel.
  const neutralBox = (x, y) => {
    const p = rgb(x, y);
    const mx = Math.max(p[0], p[1], p[2]);
    const mn = Math.min(p[0], p[1], p[2]);
    const l = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
    return l > 14 && l < 70 && mx - mn < 14;
  };
  const boxRows = [];
  for (let y = Math.floor(H * 0.68); y < H; y++) {
    let c = 0;
    for (let x = 0; x < W; x++) if (!bgWide[y * W + x] && neutralBox(x, y)) c++;
    if (c > W * 0.28) boxRows.push(y);
  }
  let box;
  if (boxRows.length) {
    box = { y0: boxRows[0], y1: boxRows[boxRows.length - 1] };
    const boxCols = [];
    for (let x = 0; x < W; x++) {
      let c = 0;
      for (let y = box.y0; y <= box.y1; y++) if (neutralBox(x, y)) c++;
      if (c > (box.y1 - box.y0) * 0.2) boxCols.push(x);
    }
    box.x0 = boxCols[0];
    box.x1 = boxCols[boxCols.length - 1];
    box.via = 'neutrale Flaeche';
  } else {
    // Plakette mit farbiger Fuellung (z.B. Karbon mit Cyan-Rand): die neutrale
    // Flaechenprobe greift nicht. Dann ueber den umlaufenden hellen Rand gehen —
    // eine ringfoermige, breite Komponente, die keinen Bildrand beruehrt.
    box = brightRingBox(W, H, lum);
    box.via = 'heller Rand (Ring)';
  }
  if (box.x0 === undefined || box.y0 === undefined) {
    throw new Error('Wortmarken-Plakette nicht gefunden — Quelle pruefen');
  }

  // 3) Station: helle, nicht blaue Struktur oberhalb der Wortmarke, Sterne weggeaetzt.
  const limitY = box.y0 - 4;
  const raw = new Uint8Array(W * H);
  for (let y = 0; y < limitY; y++)
    for (let x = 0; x < W; x++) {
      if (bgWide[y * W + x]) continue;
      const p = rgb(x, y);
      const l = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
      if (l > 50 && p[2] - p[0] < 20) raw[y * W + x] = 1;
    }
  // groesste zusammenhaengende Flaeche = Station; Sterne sind kleine Einzelflecken
  const station = new Uint8Array(W * H);
  {
    const seen = new Uint8Array(W * H);
    const comps = [];
    for (let y0 = 0; y0 < limitY; y0++)
      for (let x0 = 0; x0 < W; x0++) {
        const k0 = y0 * W + x0;
        if (!raw[k0] || seen[k0]) continue;
        const comp = [];
        const st2 = [k0];
        seen[k0] = 1;
        while (st2.length) {
          const k = st2.pop();
          comp.push(k);
          const x = k % W;
          const y = (k / W) | 0;
          const nb = [];
          if (x > 0) nb.push(k - 1);
          if (x < W - 1) nb.push(k + 1);
          if (y > 0) nb.push(k - W);
          if (y < limitY - 1) nb.push(k + W);
          for (const n of nb)
            if (raw[n] && !seen[n]) {
              seen[n] = 1;
              st2.push(n);
            }
        }
        comps.push(comp);
      }
    comps.sort((p, q) => q.length - p.length);
    const bboxOf = (c) => {
      let x0 = W;
      let y0 = H;
      let x1 = -1;
      let y1 = -1;
      for (const k of c) {
        const x = k % W;
        const y = (k / W) | 0;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      return { x0, y0, x1, y1 };
    };
    const main = bboxOf(comps[0]);
    const near = 90; // abgesetzte Teile (Dockarm) wieder anschliessen
    for (const c of comps) {
      if (c.length < 1200 && c !== comps[0]) continue;
      const b = bboxOf(c);
      const touches =
        b.x1 >= main.x0 - near &&
        b.x0 <= main.x1 + near &&
        b.y1 >= main.y0 - near &&
        b.y0 <= main.y1 + near;
      if (c === comps[0] || touches) for (const k of c) station[k] = 1;
    }
    // dunkle Huellenteile (z.B. der untere Dockarm) anwachsen lassen — der blaue
    // Planet bleibt aussen vor, weil er stark blaustichig ist.
    const queue = [];
    for (let k = 0; k < W * limitY; k++) if (station[k]) queue.push(k);
    while (queue.length) {
      const k = queue.pop();
      const x = k % W;
      const y = (k / W) | 0;
      const nb = [];
      if (x > 0) nb.push(k - 1);
      if (x < W - 1) nb.push(k + 1);
      if (y > 0) nb.push(k - W);
      if (y < limitY - 1) nb.push(k + W);
      for (const n of nb) {
        if (station[n] || bgWide[n]) continue;
        const p = rgb(n % W, (n / W) | 0);
        const l = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
        if (l > 22 && p[2] - p[0] < 35) {
          station[n] = 1;
          queue.push(n);
        }
      }
    }
  }
  let sx0 = W;
  let sy0 = H;
  let sx1 = -1;
  let sy1 = -1;
  for (let y = 0; y < limitY; y++)
    for (let x = 0; x < W; x++)
      if (station[y * W + x]) {
        if (x < sx0) sx0 = x;
        if (x > sx1) sx1 = x;
        if (y < sy0) sy0 = y;
        if (y > sy1) sy1 = y;
      }

  // 4) Kritischer Inhalt = Station + Wortmarke. Dessen Huellkreis bestimmt Variante A.
  const cx = (Math.min(sx0, box.x0) + Math.max(sx1, box.x1)) / 2;
  const cy = (Math.min(sy0, box.y0) + Math.max(sy1, box.y1)) / 2;
  let rmax = 0;
  for (let y = 0; y < limitY; y++)
    for (let x = 0; x < W; x++)
      if (station[y * W + x]) rmax = Math.max(rmax, Math.hypot(x - cx, y - cy));
  for (const [x, y] of [
    [box.x0, box.y0],
    [box.x1, box.y0],
    [box.x0, box.y1],
    [box.x1, box.y1],
  ])
    rmax = Math.max(rmax, Math.hypot(x - cx, y - cy));

  // 5) Hintergrundfarbe aus dem Bild sampeln (Median der dunklen Weltraumflaeche).
  const samples = [[], [], []];
  for (let y = Math.floor(H * 0.2); y < Math.floor(H * 0.3); y++)
    for (let x = Math.floor(H * 0.2); x < Math.floor(W * 0.3); x++) {
      const p = rgb(x, y);
      if (p[0] + p[1] + p[2] < 60) {
        samples[0].push(p[0]);
        samples[1].push(p[1]);
        samples[2].push(p[2]);
      }
    }
  const med = (a) => a.sort((m, n) => m - n)[Math.floor(a.length / 2)] || 0;
  const bgColor = { r: med(samples[0]), g: med(samples[1]), b: med(samples[2]) };

  // 6) Alphamaske: weisse Ecken raus (fuer den Adaptive-Vordergrund).
  // Nur wenn wirklich einbelichtete helle Ecken da sind. Bei einer randlosen Quelle
  // findet die Flutfuellung hoechstens ein paar helle Pixel, die den Bildrand streifen
  // (z.B. der Planetenbogen) — die duerfen nicht ausgestanzt werden.
  let bgArea = 0;
  for (let i = 0; i < W * H; i++) if (bg[i]) bgArea++;
  const hasBakedCorners = bgArea > W * H * 0.002;
  const cut = hasBakedCorners ? dilate(bg, 3) : new Uint8Array(W * H);
  const alpha = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) alpha[i] = cut[i] ? 0 : 255;

  return {
    W,
    H,
    box,
    stationBox: { x0: sx0, y0: sy0, x1: sx1, y1: sy1 },
    critical: { cx, cy, rmax },
    bgColor,
    alpha,
    hasBakedCorners,
    bgArea,
  };
}

const hex = (c) =>
  '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('');

/** Quelle mit transparenten (weissen) Ecken. */
async function sourceWithoutBakedCorners(a) {
  const base = await sharp(SRC).ensureAlpha().raw().toBuffer();
  for (let i = 0; i < a.W * a.H; i++) base[i * 4 + 3] = a.alpha[i];
  return sharp(base, { raw: { width: a.W, height: a.H, channels: 4 } }).png().toBuffer();
}

/** Adaptive-Vordergrund, Variante A: ganzes Bild in die sichere Zone. */
async function foregroundA(a, size) {
  const src = await sourceWithoutBakedCorners(a);
  const allowed = size * CIRCLE_FRACTION; // Radius der Kreismaske in Zielpixeln
  let k = allowed / a.critical.rmax;
  k = Math.min(k, (size * SAFE_FRACTION) / a.W); // nie groesser als die sichtbare Zone
  const w = Math.round(a.W * k);
  const scaled = await sharp(src).resize(w, w, { kernel: 'lanczos3' }).png().toBuffer();
  const left = Math.round(size / 2 - a.critical.cx * k);
  const top = Math.round(size / 2 - a.critical.cy * k);
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: scaled, left, top }])
    .png()
    .toBuffer();
}

/** Adaptive-Vordergrund, Variante B: nur die Station, formatfuellend in der sicheren Zone. */
async function foregroundB(a, size) {
  const s = a.stationBox;
  const cw = s.x1 - s.x0 + 1;
  const ch = s.y1 - s.y0 + 1;
  const safe = Math.round(size * SAFE_FRACTION);
  const k = safe / Math.max(cw, ch);
  const w = Math.max(1, Math.round(cw * k));
  const h = Math.max(1, Math.round(ch * k));
  const crop = await sharp(SRC)
    .extract({ left: s.x0, top: s.y0, width: cw, height: ch })
    .resize(w, h, { kernel: 'lanczos3' })
    .ensureAlpha()
    .raw()
    .toBuffer();
  // Weiche Kante aussen, damit der Zuschnitt keine harte Rechteckkante zeigt.
  const feather = Math.max(2, Math.round(size * 0.03));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (d < feather) crop[(y * w + x) * 4 + 3] = Math.round((d / feather) * 255);
    }
  const img = await sharp(crop, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: img, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }])
    .png()
    .toBuffer();
}

/** Legacy-/iOS-Icon: vollstaendiges Bild, ohne Alpha. */
async function fullIcon(a, size, corners) {
  let pipe;
  if (corners === 'source') {
    pipe = sharp(SRC).resize(size, size, { kernel: 'lanczos3' });
  } else {
    const src = await sourceWithoutBakedCorners(a);
    pipe = sharp(src).resize(size, size, { kernel: 'lanczos3' });
    if (corners === 'black') pipe = pipe.flatten({ background: { r: 0, g: 0, b: 0 } });
  }
  if (corners !== 'transparent') pipe = pipe.removeAlpha();
  return pipe.png({ compressionLevel: 9 }).toBuffer();
}

async function main() {
  if (!fs.existsSync(SRC)) throw new Error(`Quelle fehlt: ${SRC}`);
  const sizes = await readTargetSizes();
  const a = await analyze();
  const bgHex = hex(a.bgColor);

  console.log('Quelle       :', SRC, `${a.W}x${a.H}`);
  console.log('Station bbox :', JSON.stringify(a.stationBox));
  console.log('Wortmarke    :', JSON.stringify(a.box));
  console.log(
    'Ecken        :',
    a.hasBakedCorners
      ? `einbelichtet hell (${a.bgArea} px) — werden im Adaptive-Vordergrund ausgestanzt`
      : `randlos/dunkel (${a.bgArea} px Flutfuellung) — nichts wird ausgestanzt`
  );
  console.log(
    'Kritisch     : Mitte',
    a.critical.cx.toFixed(1) + '/' + a.critical.cy.toFixed(1),
    'Radius',
    a.critical.rmax.toFixed(1)
  );
  console.log('Hintergrund  :', bgHex);
  console.log('Zielgroessen :', JSON.stringify(sizes));

  // --- Staging: beide Varianten + gemeinsame Legacy/iOS-Dateien -------------
  for (const v of ['a', 'b']) {
    for (const d of DENSITIES) {
      const dir = path.join(STAGE, `variant-${v}`, `mipmap-${d}`);
      mkdir(dir);
      const size = sizes[d].foreground;
      const buf = v === 'a' ? await foregroundA(a, size) : await foregroundB(a, size);
      fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), buf);
    }
  }
  const legacy = {};
  for (const d of DENSITIES) legacy[d] = await fullIcon(a, sizes[d].legacy, LEGACY_CORNERS);
  const iosBuf = await fullIcon(a, 1024, 'source');
  mkdir(path.join(STAGE, 'shared'));
  for (const d of DENSITIES)
    fs.writeFileSync(path.join(STAGE, 'shared', `ic_launcher-${d}.png`), legacy[d]);
  fs.writeFileSync(path.join(STAGE, 'shared', 'AppIcon-512@2x.png'), iosBuf);

  // --- Vergleichsbogen ------------------------------------------------------
  mkdir(SHEET_DIR);
  const previews = {};
  for (const v of ['a', 'b']) {
    const size = sizes.xxxhdpi.foreground; // 432
    const fg = v === 'a' ? await foregroundA(a, size) : await foregroundB(a, size);
    const composed = await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { ...a.bgColor, alpha: 1 },
      },
    })
      .composite([{ input: fg }])
      .png()
      .toBuffer();
    const visible = Math.round(size * SAFE_FRACTION);
    const off = Math.round((size - visible) / 2);
    const cropped = await sharp(composed)
      .extract({ left: off, top: off, width: visible, height: visible })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(SHEET_DIR, `variant-${v}-visible.png`), cropped);
    fs.writeFileSync(path.join(SHEET_DIR, `variant-${v}-full.png`), composed);
    previews[v] = { visible, size };
  }
  fs.writeFileSync(path.join(SHEET_DIR, 'legacy-ios.png'), iosBuf);
  fs.writeFileSync(
    path.join(SHEET_DIR, 'legacy-android.png'),
    await fullIcon(a, 512, LEGACY_CORNERS)
  );
  writeSheet(bgHex, a, sizes);

  // --- Installation ---------------------------------------------------------
  if (INSTALL) {
    if (!['a', 'b'].includes(INSTALL)) throw new Error('--install erwartet a oder b');
    for (const d of DENSITIES) {
      const dir = path.join(RES, `mipmap-${d}`);
      fs.copyFileSync(
        path.join(STAGE, `variant-${INSTALL}`, `mipmap-${d}`, 'ic_launcher_foreground.png'),
        path.join(dir, 'ic_launcher_foreground.png')
      );
      fs.writeFileSync(path.join(dir, 'ic_launcher.png'), legacy[d]);
      fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), legacy[d]);
    }
    fs.writeFileSync(IOS_ICON, iosBuf);
    const colorFile = path.join(RES, 'values', 'ic_launcher_background.xml');
    fs.writeFileSync(
      colorFile,
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${bgHex}</color>\n</resources>\n`,
      'utf8'
    );
    console.log(`\nInstalliert: Variante ${INSTALL.toUpperCase()} (Adaptive-Vordergrund),`);
    console.log('Legacy + iOS: vollstaendiges Bild, Hintergrundfarbe', bgHex);
  } else {
    console.log('\nNur Staging + Vergleichsbogen erzeugt (--no-install).');
  }
  console.log('Bogen:', path.join(SHEET_DIR, 'index.html'));
}

function writeSheet(bgHex, a, sizes) {
  const masks = [
    ['Unmaskiert (Quadrat)', 'none'],
    ['Kreis', 'circle'],
    ['Squircle', 'squircle'],
    ['Abgerundetes Quadrat', 'rounded'],
    ['Teardrop', 'teardrop'],
  ];
  const STEPS = [192, 144, 96, 72, 48];
  const srcLabel = SRC_REL.split(path.sep).join('/');

  // Aeltere Fassungen, neueste zuerst. Ordner entstehen beim Archivieren vor dem Lauf.
  const HISTORY = [
    {
      dir: 'prev3',
      title: 'Iteration 3',
      src: 'Docs/icon3.jpg',
      desc: `Die zweite Textzeile fiel weg, die Plakette wurde sauber. Geometrisch der Stand, auf dem
             Iteration 4 aufsetzt &mdash; identische Komposition, aber die Station war noch so dunkel,
             dass sie bei 48&nbsp;px als Masse und nicht als Bauwerk gelesen wurde.`,
    },
    {
      dir: 'prev2',
      title: 'Iteration 2',
      src: 'Docs/icon2.jpg',
      desc: `Schwarze Ecken, weisses &bdquo;TE&ldquo; auf Karbon mit Cyan-Rand — der Kontrastsprung.
             Die zweite Zeile war noch da und die Plakette am breitesten (841&times;301 px), was den
             Huellkreis auf 749,5 px trieb und Variante A am staerksten herunterskalierte.`,
    },
    {
      dir: 'prev1',
      title: 'Iteration 1',
      src: 'Docs/icon.jpg',
      desc: `Die erste Fassung: weisse einbelichtete Ecken, gelbes &bdquo;TE&ldquo; auf grauer Plakette,
             schmalere Wortmarke. Der gelbe Schriftzug hatte den geringsten Kontrast der drei.`,
    },
  ].filter((h) => fs.existsSync(path.join(SHEET_DIR, h.dir, 'variant-a-visible.png')));

  // echte Superellipse (n=4) als Polygon — border-radius kann das nicht
  const squirclePoly = Array.from({ length: 96 }, (_, i) => {
    const t = (i / 96) * Math.PI * 2;
    const n = 4;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = Math.sign(s) * Math.abs(s) ** (2 / n);
    return `${((x + 1) * 50).toFixed(2)}% ${((y + 1) * 50).toFixed(2)}%`;
  }).join(',');

  const cell = (src, mask, px) =>
    `<div class="cell"><div class="icon ${mask}" style="width:${px}px;height:${px}px;background-image:url(${src})"></div><span>${px} px</span></div>`;
  const block = (src, heading, desc) => `
  <section>
    <h2>${heading}</h2>
    <p class="desc">${desc}</p>
    ${masks
      .map(
        ([label, m]) => `<div class="row"><h3>${label}</h3>
      <div class="cells">${STEPS.map((px) => cell(src, m, px)).join('')}</div></div>`
      )
      .join('')}
  </section>`;

  const historyHtml = HISTORY.map(
    (h) => `
<section class="prev">
  <h2>${h.title} — <code>${h.src}</code></h2>
  <p class="desc">${h.desc}</p>
  <div class="row"><h3>${h.title} — Variante A, alle Maskenformen</h3>
    ${masks
      .map(
        ([label, m]) =>
          `<div class="submask"><h4>${label}</h4><div class="cells">${STEPS.map((px) =>
            cell(h.dir + '/variant-a-visible.png', m, px)
          ).join('')}</div></div>`
      )
      .join('')}
  </div>
  <div class="row"><h3>${h.title} — Variante B</h3>
    <h4>Kreis</h4>
    <div class="cells">${STEPS.map((px) => cell(h.dir + '/variant-b-visible.png', 'circle', px)).join('')}</div>
    <h4>Squircle</h4>
    <div class="cells">${STEPS.map((px) => cell(h.dir + '/variant-b-visible.png', 'squircle', px)).join('')}</div>
  </div>
  <div class="row"><h3>${h.title} — Legacy / iOS</h3>
    <div class="strip">
      <div class="cell"><div class="icon" style="width:192px;height:192px;background-image:url(${h.dir}/legacy-android.png)"></div><span>Android Legacy 192 px</span></div>
      <div class="cell"><div class="icon" style="width:48px;height:48px;background-image:url(${h.dir}/legacy-android.png)"></div><span>48 px</span></div>
      <div class="cell"><div class="icon squircle" style="width:180px;height:180px;background-image:url(${h.dir}/legacy-ios.png)"></div><span>iOS 180 px, maskiert</span></div>
      <div class="cell"><div class="icon" style="width:180px;height:180px;background-image:url(${h.dir}/legacy-ios.png)"></div><span>180 px, roh</span></div>
    </div>
  </div>
</section>`
  ).join('');

  // Direkter Verlauf: dieselbe Maske, dieselbe Groesse, drei Fassungen nebeneinander
  const trail = (mask, px) => `
  <div class="row"><h3>${mask === 'circle' ? 'Kreismaske' : 'Squircle'} bei ${px} px — Verlauf</h3>
    <div class="cells">
      ${
        HISTORY.slice()
          .reverse()
          .map(
            (h, i) =>
              `<div class="cell"><div class="icon ${mask}" style="width:${px}px;height:${px}px;background-image:url(${h.dir}/variant-a-visible.png)"></div><span>Iteration ${i + 1}</span></div>`
          )
          .join('') +
        `<div class="cell"><div class="icon ${mask}" style="width:${px}px;height:${px}px;background-image:url(variant-a-visible.png)"></div><span><strong>Iteration 4</strong></span></div>`
      }
    </div>
  </div>`;

  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>App-Icon — Iteration 4, Variantenvergleich</title>
<style>
  body{margin:0;padding:32px;background:#14161a;color:#e7e9ee;font:14px/1.5 system-ui,sans-serif}
  h1{font-size:22px;margin:0 0 4px}
  h2{font-size:18px;margin:36px 0 2px}
  h3{font-size:13px;font-weight:600;color:#9aa3b2;margin:0 0 8px;text-transform:uppercase;letter-spacing:.06em}
  h4{font-size:12px;font-weight:600;color:#79828f;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.05em}
  p{max-width:82ch;color:#b9c0cc}
  .desc{margin:4px 0 18px}
  .row{margin:0 0 26px;padding:16px;background:#1c1f25;border-radius:10px}
  .cells{display:flex;flex-wrap:wrap;gap:26px;align-items:flex-end}
  .cell{display:flex;flex-direction:column;align-items:center;gap:6px}
  .cell span{font-size:11px;color:#7d8696}
  .icon{background-size:cover;background-position:center;image-rendering:auto}
  .circle{border-radius:50%}
  .rounded{border-radius:22%}
  .squircle{clip-path:polygon(${squirclePoly})}
  .teardrop{border-radius:8% 50% 50% 50%}
  .note{background:#20242c;border-left:3px solid #d9a441;padding:12px 16px;border-radius:6px;margin:18px 0;max-width:82ch}
  .verdict{background:#1b2620;border-left:3px solid #4fae76}
  .prev{opacity:.7;border-top:1px solid #2c313a;margin-top:56px;padding-top:8px}
  .prev .row{background:#181a1f}
  table{border-collapse:collapse;margin:12px 0}
  td,th{border:1px solid #2c313a;padding:6px 12px;text-align:left;font-size:13px}
  th{color:#9aa3b2;font-weight:600}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .now{background:#1b2620}
  .strip{display:flex;gap:26px;align-items:flex-end;flex-wrap:wrap}
  code{background:#22262e;padding:1px 5px;border-radius:4px;font-size:12.5px}
</style></head><body>
<h1>Trade Empire — App-Icon, Iteration 4</h1>
<p>Quelle <code>${srcLabel}</code> (${a.W}×${a.H}). Alle Kacheln zeigen den
<strong>sichtbaren Bereich</strong> des Adaptive-Icons (72 von 108 dp) in <strong>Geräte&shy;pixeln</strong>:
192 px entspricht einem Launcher-Icon auf einem xxxhdpi-Gerät, 48 px der mdpi-Stufe bzw. einem dicht
belegten Homescreen. Hintergrundfarbe aus dem Bild gesampelt: <code>${bgHex}</code>.</p>

<div class="note"><strong>Was sich geändert hat.</strong> Rudi hat die <strong>Raumstation aufgehellt</strong>,
damit sie auf einem 48-px-Icon überhaupt als Bauwerk lesbar wird. Sonst nichts: die Komposition ist
Pixel für Pixel dieselbe wie in Iteration 3 (Station 1194×902 gegen 1196×900 px, Plakette 710×279 gegen
712×279 px, Hüllkreis 712,0 gegen 711,2 px). Die Änderung ist rein <em>tonal</em>, nicht geometrisch —
und deshalb sauber messbar: was sich in den Zahlen bewegt, kommt von der Helligkeit, nicht von einer
verschobenen Skalierung.</div>

<div class="note"><strong>Wie gemessen wurde.</strong> Beide Fassungen durchlaufen dieselbe Pipeline bis
zur Kachel <code>variant-a-visible.png</code> (288 px sichtbare Zone), werden dann mit Lanczos auf die
Zielgröße heruntergerechnet — also genau das, was der Launcher zeigt — und im <strong>Stationsbereich</strong>
verglichen: alle Zeilen oberhalb der Plakettenoberkante (bei 48 px die Zeilen 0–34, 1680 px). Die Plakette
darunter dient als <strong>Kontrollfläche</strong>: sie wurde nicht angefasst und darf sich nicht bewegen.</div>

<div class="note"><strong>Warum hier kein Michelson steht.</strong> Der Hintergrund ist reines Schwarz
(<code>#000000</code>, 5.&nbsp;Perzentil = 0). Michelson und Weber laufen damit gegen 1 bzw. unendlich und
zeigen für <em>jede</em> Fassung denselben Wert — sie messen hier nichts. Aussagekräftig ist bei schwarzem
Grund die <strong>absolute Leuchtdichte der Station</strong> und der <strong>Flächenanteil</strong>, der
überhaupt über die Sichtbarkeitsschwelle kommt.</div>

<table>
  <tr><th>Messung im Stationsbereich, Variante A</th><th class="num">Iteration 3</th><th class="num now">Iteration 4</th><th class="num">Faktor</th></tr>
  <tr><td><strong>mittlere Leuchtdichte @ 48 px</strong></td><td class="num">24,2</td><td class="num now"><strong>51,3</strong></td><td class="num">2,12×</td></tr>
  <tr><td><strong>Flächenanteil L&nbsp;≥&nbsp;60 @ 48 px</strong></td><td class="num">13,8 %</td><td class="num now"><strong>39,3 %</strong></td><td class="num">2,85×</td></tr>
  <tr><td>Pixel L&nbsp;≥&nbsp;90 @ 48 px</td><td class="num">61</td><td class="num now">490</td><td class="num">8,0×</td></tr>
  <tr><td>Pixel L&nbsp;≥&nbsp;128 @ 48 px</td><td class="num">24</td><td class="num now">264</td><td class="num">11,0×</td></tr>
  <tr><td>90.&nbsp;Perzentil @ 48 px</td><td class="num">66,3</td><td class="num now">141,7</td><td class="num">2,14×</td></tr>
  <tr><td>Standardabweichung @ 48 px</td><td class="num">31,4</td><td class="num now">59,1</td><td class="num">1,88×</td></tr>
  <tr><td><strong>gemeinsame Stationsmaske @ 48 px</strong> (662 px, in mindestens einer Fassung hell)</td><td class="num">54,3</td><td class="num now"><strong>117,2</strong></td><td class="num">2,16×</td></tr>
  <tr><td>dasselbe @ 72 px</td><td class="num">56,8</td><td class="num now">119,2</td><td class="num">2,10×</td></tr>
  <tr><td>dasselbe @ 96 px</td><td class="num">57,7</td><td class="num now">121,8</td><td class="num">2,11×</td></tr>
  <tr><td>dasselbe @ 192 px</td><td class="num">61,5</td><td class="num now">127,0</td><td class="num">2,07×</td></tr>
  <tr><th colspan="4" style="padding-top:14px">Kontrollflächen — hier <em>darf</em> sich nichts bewegen</th></tr>
  <tr><td>Plakettenbereich, mittlere Leuchtdichte @ 48 px</td><td class="num">30,27</td><td class="num now">30,77</td><td class="num">1,02×</td></tr>
  <tr><td>Plakette: Glyphenhelligkeit / Grund (Quelle)</td><td class="num">250,9 / 18,1</td><td class="num now">250,6 / 18,3</td><td class="num">1,00×</td></tr>
  <tr><td>Plakette: Michelson in der Quelle</td><td class="num">0,8652</td><td class="num now">0,8640</td><td class="num">1,00×</td></tr>
  <tr><td>Station gerendert @ 48 px (Breite)</td><td class="num">40,4 px</td><td class="num now">40,2 px</td><td class="num">1,00×</td></tr>
  <tr><td>Skalierungsfaktor Variante A</td><td class="num">0,2025</td><td class="num now">0,2022</td><td class="num">1,00×</td></tr>
  <tr><th colspan="4" style="padding-top:14px">Maskenprüfung — bleibt die Station vollständig?</th></tr>
  <tr><td>Stationspixel außerhalb der Kreismaske (Adaptive, Variante A)</td><td class="num">—</td><td class="num now">3 von 28 867 (0,01 %)</td><td class="num">Kantenpixel</td></tr>
  <tr><td>Stationspixel außerhalb der Kreismaske (Legacy 512, <code>ic_launcher_round</code>)</td><td class="num">9 (0,03 %)</td><td class="num now">9 (0,01 %)</td><td class="num">Kantenpixel</td></tr>
  <tr><td>beschnitten wird stattdessen</td><td colspan="3">der blaue Planetenbogen (583 px im Adaptive, 2149 px im Legacy) — Hintergrund, absichtlich</td></tr>
</table>

<div class="note verdict"><strong>Das Ziel ist erreicht, und zwar deutlich.</strong> Bei 48 px ist die
Station nicht ein bisschen heller, sondern <strong>doppelt so hell</strong> (24,2&nbsp;→&nbsp;51,3), und der
Anteil der Fläche, der überhaupt über die Sichtbarkeitsschwelle von L&nbsp;=&nbsp;60 kommt, steigt von
<strong>13,8 % auf 39,3 %</strong> — knapp das Dreifache. Klare Lichter (L&nbsp;≥&nbsp;128) gab es vorher
praktisch keine (24 von 1680 px), jetzt sind es 264. Damit liest sich der Ring bei 48 px erstmals als
<em>Struktur</em> und nicht als dunkle Masse mit ein paar orangen Punkten. Die Plakette ist unverändert
(30,27&nbsp;→&nbsp;30,77, +1,7 % — Rauschen), also ist die Verbesserung nicht mit Kontrast an der Wortmarke
erkauft.</div>

<div class="note verdict"><strong>Empfehlung: weiterhin Variante A</strong> (installiert).
Variante A war bisher die richtige Wahl, weil das weiße „TE“ der einzige helle Anker im dunklen Motiv war.
Dieses Argument ist jetzt schwächer — die Station trägt selbst — aber es kippt nicht: A liefert bei 48 px
inzwischen <em>beides</em> (lesbare Station <strong>und</strong> Wortmarke, Gesamtkachel L&nbsp;≥&nbsp;128
bei 12,9 %), während B die Wortmarke per Zuschnitt verliert und dafür nur 1,9 Punkte mehr helle Fläche
gewinnt (14,8 %). Für einen Markennamen, den im Launcher niemand sonst sieht, ist das ein schlechter
Tausch. Kein Grund, vom Stand der letzten Runde abzuweichen.</div>

<section>
  <h2>Direkter Verlauf — dieselbe Maske, dieselbe Größe</h2>
  <p class="desc">Alle vier Fassungen nebeneinander, damit der Fortschritt sichtbar wird und nicht nur
  das neue Bild. Bei 48 px ist der Sprung von 3 auf 4 der größte der Reihe: bei 1 bis 3 ist die Station eine
  dunkle Masse, aus der nur die orangen Lichter herausstechen; bei 4 sieht man den Ring, die Nabe und den
  Mast. Der Unterschied 1 → 2 → 3 lag dagegen an der Wortmarke (Kontrast, dann Sauberkeit).</p>
  ${trail('circle', 48)}
  ${trail('circle', 72)}
  ${trail('squircle', 96)}
  ${trail('squircle', 192)}
</section>

${block(
  'variant-a-visible.png',
  'Variante A — &bdquo;nichts verlieren&ldquo; <span style="color:#4fae76">(installiert)</span>',
  `Das vollständige Bild, so skaliert, dass Station und Plakette auch unter der Kreismaske vollständig sichtbar bleiben
   (Hüllkreis des kritischen Inhalts = Radius ${a.critical.rmax.toFixed(0)} px der Quelle → 36 dp der Maske).
   Der Rest der Fläche ist die gesampelte Hintergrundfarbe <code>${bgHex}</code>. Die Quelle ist randlos,
   es wird nichts ausgestanzt.`
)}
${block(
  'variant-b-visible.png',
  'Variante B — &bdquo;Motiv groß&ldquo;',
  `Zuschnitt auf die Station (Quellbereich ${a.stationBox.x0}/${a.stationBox.y0} bis ${a.stationBox.x1}/${a.stationBox.y1}),
   formatfüllend in die sichere Zone. Kein &bdquo;TE&ldquo;. Der Zuschnitt ist außen weich ausgeblendet,
   damit keine harte Rechteckkante im Maskenrand steht.`
)}

<section>
  <h2>Legacy-Mipmap und iOS — in beiden Varianten identisch</h2>
  <p class="desc">Beide zeigen das vollständige Bild. Die Quelle hat <strong>keine einbelichteten runden
  Ecken</strong> — das Bild füllt das Quadrat bis in die Ecken mit Schwarz (gemessen 0/0/0). Erzeugt wurde
  deshalb mit <code>--legacy-corners ${LEGACY_CORNERS}</code>, also pixeltreu aus der Quelle.
  Der Android-Legacy-Pfad (<code>minSdkVersion 24</code>, also Android 7) maskiert <em>nicht</em> und zeigt
  das Quadrat; iOS maskiert selbst mit einem Squircle. Das iOS-PNG ist ohne Alphakanal.</p>
  <div class="row"><h3>Android Legacy — ic_launcher.png, unmaskiert</h3>
    <div class="strip">
      ${[192, 144, 96, 72, 48]
        .map(
          (px, i) =>
            `<div class="cell"><div class="icon" style="width:${px}px;height:${px}px;background-image:url(legacy-android.png)"></div><span>${px} px (${['xxxhdpi', 'xxhdpi', 'xhdpi', 'hdpi', 'mdpi'][i]})</span></div>`
        )
        .join('')}
    </div>
  </div>
  <div class="row"><h3>iOS (Squircle-Maske)</h3>
    <div class="strip">
      <div class="cell"><div class="icon squircle" style="width:180px;height:180px;background-image:url(legacy-ios.png)"></div><span>180 px, maskiert</span></div>
      <div class="cell"><div class="icon squircle" style="width:120px;height:120px;background-image:url(legacy-ios.png)"></div><span>120 px, maskiert</span></div>
      <div class="cell"><div class="icon squircle" style="width:60px;height:60px;background-image:url(legacy-ios.png)"></div><span>60 px, maskiert</span></div>
      <div class="cell"><div class="icon" style="width:180px;height:180px;background-image:url(legacy-ios.png)"></div><span>180 px, roh</span></div>
    </div>
  </div>
</section>

<section>
  <h2>Erzeugte Dateien</h2>
  <table>
    <tr><th>Ziel</th><th>Größen</th></tr>
    <tr><td>mipmap-*/ic_launcher.png, ic_launcher_round.png</td><td>${DENSITIES.map((d) => sizes[d].legacy).join(' / ')} — ohne Alpha</td></tr>
    <tr><td>mipmap-*/ic_launcher_foreground.png</td><td>${DENSITIES.map((d) => sizes[d].foreground).join(' / ')} — mit Alpha</td></tr>
    <tr><td>values/ic_launcher_background.xml</td><td>${bgHex}</td></tr>
    <tr><td>ios .../AppIcon-512@2x.png</td><td>1024 — ohne Alphakanal</td></tr>
  </table>
  <p>Erneut erzeugen:
  <code>node scripts/app-icon-generate.cjs --src ${srcLabel} --legacy-corners ${LEGACY_CORNERS} --install a|b</code></p>
</section>

<h2 style="margin-top:56px">Iterationsverlauf</h2>
<p>Die früheren Fassungen, zum Vergleich stehen gelassen — gleiche Darstellung, gleiche Maßstäbe.</p>
${historyHtml}
</body></html>
`;
  fs.writeFileSync(path.join(SHEET_DIR, 'index.html'), html, 'utf8');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
