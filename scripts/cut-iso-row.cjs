/**
 * BACKSKRIPT (Prototyp): schneidet ein nahtloses Langbild einer Iso-Reihe in
 * Anfang / Mitte / Ende.  Vorbild: scripts/tiles-uebergang-masken.cjs.
 *
 *   node scripts/cut-iso-row.cjs --name large_storage --units 5 --measure
 *   node scripts/cut-iso-row.cjs --name large_storage --units 5 --phase 0,-20
 *   node scripts/cut-iso-row.cjs             # ohne Argumente: Solarpanel-Vorgaben
 *
 * Argumente: --name <basename> (Vorgabe solar_panel), --tag <v1>, --src <png>,
 * --units <n> (am Bild gezaehlt), --ref <i> (Referenzeinheit fuer das
 * Mittelstueck), --phase dx,dy, --blend <px>, --ramp <periodenbreiten>,
 * --measure, --grade "luma,B/R,G/R" (Pegel/Farbe auf den Modulkorpus ziehen).
 *
 * ══ 1. Die Geometrie, verifiziert am Renderer ═══════════════════════════════
 *
 * src/views/grid/isoConstants.ts:6-12
 *     TW = 48   TH = 24   TZ = 16   HULL_DRAW_W = HULL_DRAW_H = 48
 * src/views/grid/isoConstants.ts:87-96
 *     worldToScreen(wx,wy,wz) = { sx: (wx-wy)*24,  sy: (wx+wy)*12 - wz*16 }
 * src/views/grid/StructureCanvasRenderer.tsx:558-565
 *     ctx.drawImage(modImg, sx - 24, sy + TZ + TH/2 - 48, 48, 48)
 * src/views/grid/PlanetSurface.tsx:1272-1278
 *     ctx.drawImage(modImg, sx - 24, sy      + TH/2 - 48, 48, 48)
 *
 * ANKER: die UNTERE MITTE der 48x48-Zeichenbox liegt exakt auf der SÜDSPITZE
 * der Bodenraute der Zelle.  (Beide Renderer identisch; StructureCanvas hat
 * nur das zusätzliche +TZ, weil dort die Bodenkachel eine Etage höher liegt.)
 *
 * NACHBARVERSATZ auf dem Schirm, direkt aus worldToScreen:
 *     posX + 1  ->  (+24, +12)   rechts und runter
 *     posY + 1  ->  (-24, +12)   links  und runter
 *     posY - 1  ->  (+24, -12)   rechts und HOCH
 *
 * Rudis Laufrichtung "links unten -> rechts oben" ist damit die **Y-ACHSE**:
 * gleiche posX, posY läuft.  Steigung -12/+24 = -1:2 = der Iso-Winkel 26.57°.
 *
 * ÜBERDECKUNG: Zeichenboxen sind 48x48, der Versatz ist (24,12) -> zwei
 * Nachbarn überlappen sich um eine halbe Box (24 px) waagerecht und um 36 px
 * senkrecht.  Sichtbar bleibt pro Mittelstück ein 24-px-Streifen plus ein
 * 12-px-Saum oben — Rudis Rechnung stimmt.
 *
 * MALREIHENFOLGE (StructureCanvasRenderer.tsx:334-337 / PlanetSurface.tsx:507):
 *     posZ, dann posX+posY, dann posX
 * Bei gleichem posX wächst posX+posY mit posY, also wird die Zelle mit dem
 * HÖHEREN posY SPÄTER gezeichnet.  Sie liegt links unten und überdeckt ihren
 * Vorgänger rechts oben.  Für die Reihe heißt das:
 *     start = niedrigstes posY (rechts oben, wird zuerst gemalt)
 *     end   = höchstes  posY (links unten, wird zuletzt gemalt, liegt oben)
 *
 * ══ 2. Autorenauflösung ════════════════════════════════════════════════════
 *
 * Modul-Sprites sind quadratische WebP, Nennmaß 512x512 (33 von 123 exakt so;
 * der Rest liegt bei 394-511, weil trim+pad-to-square die Nennkante leicht
 * verfehlt.  solar_panel_0.webp ist 456x456.)  Die ganze Datei wird in die
 * 48x48-Box skaliert, das Nennmaß ist also frei wählbar -> 512.
 *     Faktor 512/48 = 10.667
 *     Kachelversatz (24,12) px  ->  (256,128) px in Autorenkoordinaten.
 *
 * ══ 3. Ausrichtung ═════════════════════════════════════════════════════════
 *
 * flux trifft das Kachelraster nicht.  Gemessen wird die tatsächliche Periode
 * (dx,dy) per Autokorrelation des HOCHPASSES (LESSONS §8: die rohe NCC misst
 * geteilte Beleuchtung mit) über MEHRERE Perioden, subpixelgenau.  Dann:
 *     1. gleichmäßige Skalierung  s = 256 / dx
 *     2. senkrechte Scherung      y += k*x  mit  k = (-128 - s*dy) / 256
 * Die Scherung ist bewusst gewählt statt einer Drehung: sie lässt SENKRECHTE
 * Linien senkrecht (Masten, Kanten der Kästen bleiben stehen) und kippt nur
 * die waagerechten Iso-Kanten.  Eine Drehung würde die Masten schief stellen.
 *
 * ══ 4. Periodizität des Mittelstücks — die harte Anforderung ═══════════════
 *
 * Eine Reihe aus n Mittelstücken zeigt an jeder Fuge den Sprung
 *     mid(511, y)  gegen  mid(256, y-128)
 * (rechte Kante der zuletzt gemalten Box gegen den Vorgänger dahinter).
 *
 * ERSTER, GESCHEITERTER ANSATZ — hier festgehalten, damit ihn niemand noch
 * einmal geht: das Stück in einen 256-px-Streifen FALTEN und wieder
 * entfalten.  Das macht box(x+256,y-128) == box(x,y) exakt, es verschiebt die
 * Fuge aber nur — über genau diese Periodizität ist der Fugensprung identisch
 * mit dem WRAP des Streifens, strip(255,v) gegen strip(0,v+128), und der ist
 * unberührt.  Gemessen: Spaltengradient an der Kachelkante 17.8 gegen 8.8 im
 * Mittel, also Faktor 2.  Eine Mittelung über mehrere Perioden senkt den
 * Sprung, beseitigt ihn ebenfalls nicht, und kostet Geisterkanten.
 *
 * WAS TRÄGT — Wrap-Blend plus synthetische Reihe.  Beschrieben an der Stelle,
 * an der es passiert (Abschnitt "Streifen, Wrap-Blend, synthetische Reihe"
 * weiter unten).  Kurz: der Streifen wird über die letzten BLEND Pixel von
 * der Basiseinheit auf die um eine Periode versetzte Nachbareinheit
 * übergeblendet, wodurch der Wrap zwei benachbarte Pixel derselben Quelle
 * verbindet.  Aus dem Streifen entsteht eine synthetische, per Konstruktion
 * periodische Reihe; die beiden echten Enden werden über eine Rampe
 * eingeblendet, die ausserhalb jedes Mittelstück-Sichtbereichs liegt.
 *
 * ── Phase ─────────────────────────────────────────────────────────────────
 * Der Anker einer Zeichenbox ist ihre UNTERE MITTE (256, 512).  Dort muss der
 * Fuß einer Einheit sitzen.  --phase dx,dy verschiebt das ausgerichtete Bild
 * gegen die Vereinigungsleinwand; assets/prev/*_boxgrid.png zeigt das Raster
 * über dem Bild, damit man es prüfen kann statt es zu glauben.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

// ── Geometrie (verifiziert, siehe Kopf) ────────────────────────────────────
const AUTHOR = 512; // Autorenkante einer Zeichenbox
const STEP_X = 256; // Kachelversatz in Autorenpixeln, x
const STEP_Y = 128; // Kachelversatz in Autorenpixeln, y (nach UNTEN bei +posY)

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'final');
const DBG_DIR = path.join(ROOT, 'assets', 'prev');
const MEASURE_ONLY = process.argv.includes('--measure');

const argOf = name => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};

/** Modul-Basisname; bestimmt Quelle und alle Ausgabenamen. */
const BASENAME = argOf('--name') ?? 'solar_panel';
/** Versuchskennung des Langbildes (wie in gen-iso-row.cjs --tag). */
const TAG = argOf('--tag') ?? 'v1';
/** Langbild; Vorgabe ist das, was gen-iso-row.cjs unter diesem Namen ablegt. */
const SRC =
  argOf('--src') ?? path.join(ROOT, 'assets', 'cropped', `${BASENAME}_row_${TAG}_cropped.png`);
/** Einheiten im Langbild — am BILD zaehlen, nicht aus dem Prompt uebernehmen. */
const UNITS = Number(argOf('--units') ?? 6);
/** Feinverschiebung des ausgerichteten Bildes gegen die Leinwand, "dx,dy". */
const PHASE = (argOf('--phase') ?? '0,0').split(',').map(Number);
/** Breite der Wrap-Rampe in Autorenpixeln (0 = aus, STEP_X = volle Periode). */
const BLEND = Number(argOf('--blend') ?? 96);
/** Breite der Endkappen-Rampe in Periodenbreiten. */
const RAMP = Number(argOf('--ramp') ?? 0.42);
/** Ziel-Grade "luma,B/R,G/R" fuer alle Stuecke gemeinsam; ohne Angabe: kein Grade. */
const GRADE = argOf('--grade') ? argOf('--grade').split(',').map(Number) : null;

// ───────────────────────────────────────────────────────────────────────────
// Bildpuffer
// ───────────────────────────────────────────────────────────────────────────
async function loadRGBA(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { d: data, W: info.width, H: info.height };
}

function lumaAlpha({ d, W, H }) {
  const L = new Float32Array(W * H);
  const A = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    L[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
    A[i] = d[i * 4 + 3] / 255;
  }
  return { L, A };
}

/** Separabler Box-Blur; Rand wird geklemmt. */
function blur(src, W, H, r) {
  const t = new Float32Array(W * H);
  const o = new Float32Array(W * H);
  const cx = x => Math.min(W - 1, Math.max(0, x));
  const cy = y => Math.min(H - 1, Math.max(0, y));
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[y * W + cx(x)];
    for (let x = 0; x < W; x++) {
      t[y * W + x] = s / (2 * r + 1);
      s -= src[y * W + cx(x - r)];
      s += src[y * W + cx(x + r + 1)];
    }
  }
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += t[cy(y) * W + x];
    for (let y = 0; y < H; y++) {
      o[y * W + x] = s / (2 * r + 1);
      s -= t[cy(y - r) * W + x];
      s += t[cy(y + r + 1) * W + x];
    }
  }
  return o;
}

/** Hochpass über opaken Pixeln (LESSONS §8: sonst misst die NCC die Beleuchtung). */
function highpass(L, A, W, H, r) {
  const LA = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) LA[i] = L[i] * A[i];
  const bLA = blur(LA, W, H, r);
  const bA = blur(A, W, H, r);
  const HP = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const m = bA[i] > 0.05 ? bLA[i] / bA[i] : 0;
    HP[i] = A[i] > 0.5 ? L[i] - m : 0;
  }
  return HP;
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

/** NCC des Hochpasses unter Verschiebung (dx,dy), subpixelgenau. */
function nccShift(HP, A, W, H, dx, dy) {
  let sa = 0,
    sb = 0,
    saa = 0,
    sbb = 0,
    sab = 0,
    n = 0;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
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
  if (n < 15000) return { v: -2, n };
  const ma = sa / n,
    mb = sb / n;
  const cov = sab / n - ma * mb;
  const va = saa / n - ma * ma;
  const vb = sbb / n - mb * mb;
  return { v: cov / Math.sqrt(va * vb), n };
}

/**
 * Periode messen. Grobsuche auf der einfachen Periode, danach Verfeinerung auf
 * der k-fachen Periode (k mal so genau, weil derselbe Subpixelfehler durch k
 * geteilt wird).
 */
function measurePeriod(HP, A, W, H) {
  let best = { v: -2 };
  for (let dx = 140; dx <= 430; dx += 2) {
    for (let dy = Math.round(-0.7 * dx); dy <= Math.round(-0.3 * dx); dy += 2) {
      const r = nccShift(HP, A, W, H, dx, dy);
      if (r.v > best.v) best = { dx, dy, v: r.v };
    }
  }
  const p1 = best;
  console.log(`  [messen] Grobsuche  dx=${p1.dx} dy=${p1.dy} ncc=${p1.v.toFixed(4)}`);

  // Verfeinerung auf k Perioden. k so groß wie möglich, solange genug Überlapp.
  let refined = { dx: p1.dx, dy: p1.dy, k: 1, v: p1.v };
  for (let k = 2; k <= UNITS - 2; k++) {
    let b = { v: -2 };
    const cx = k * p1.dx,
      cy = k * p1.dy;
    for (let dx = cx - 14; dx <= cx + 14; dx += 0.5) {
      for (let dy = cy - 14; dy <= cy + 14; dy += 0.5) {
        const r = nccShift(HP, A, W, H, dx, dy);
        if (r.v > b.v) b = { dx, dy, v: r.v, n: r.n };
      }
    }
    if (b.v < 0.12) {
      console.log(`  [messen] k=${k} ncc=${b.v.toFixed(4)} zu schwach, verworfen`);
      continue;
    }
    console.log(
      `  [messen] k=${k}  ${b.dx.toFixed(2)},${b.dy.toFixed(2)}  ncc=${b.v.toFixed(4)}` +
        `  -> Periode ${(b.dx / k).toFixed(3)},${(b.dy / k).toFixed(3)}`,
    );
    refined = { dx: b.dx / k, dy: b.dy / k, k, v: b.v };
  }
  return refined;
}

// ───────────────────────────────────────────────────────────────────────────
(async () => {
  if (!fs.existsSync(SRC)) {
    console.error(`Quelle fehlt: ${SRC}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(DBG_DIR, { recursive: true });

  const src = await loadRGBA(SRC);
  console.log(`[cut-iso-row] Quelle ${path.relative(ROOT, SRC)}  ${src.W}x${src.H}`);
  const { L, A } = lumaAlpha(src);
  const HP = highpass(L, A, src.W, src.H, 12);

  const per = measurePeriod(HP, A, src.W, src.H);
  const s = STEP_X / per.dx; // gleichmäßige Skalierung
  const k = (-STEP_Y - s * per.dy) / STEP_X; // senkrechte Scherung
  console.log(
    `  [ziel  ] Periode ist ${per.dx.toFixed(3)},${per.dy.toFixed(3)} (Steigung ` +
      `${(per.dy / per.dx).toFixed(4)}), soll ${STEP_X},${-STEP_Y} (-0.5000)`,
  );
  console.log(
    `  [ziel  ] Skalierung s=${s.toFixed(5)}  Scherung k=${k.toFixed(5)} ` +
      `(= ${((Math.atan(k) * 180) / Math.PI).toFixed(2)}° Kippung der waagerechten Kanten)`,
  );
  if (MEASURE_ONLY) return;

  // ── Ausrichten: s skalieren, dann y += k*x scheren ───────────────────────
  // sharp.affine([a,b,c,d]):  x' = a*x + b*y ,  y' = c*x + d*y
  const alignedBuf = await sharp(SRC)
    .ensureAlpha()
    .affine([s, 0, k * s, s], {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      interpolator: 'bicubic',
    })
    .trim({ threshold: 1 })
    .png()
    .toBuffer();
  const aligned = await loadRGBA(alignedBuf);
  console.log(`  [align ] ausgerichtet + getrimmt: ${aligned.W}x${aligned.H}`);

  // ── Vereinigungsleinwand aller UNITS Zeichenboxen ────────────────────────
  //  Zelle i (i=0 rechts oben / niedrigstes posY) hat ihre Box bei
  //     BX_i = (UNITS-1-i)*STEP_X ,  BY_i = i*STEP_Y
  const CW = AUTHOR + (UNITS - 1) * STEP_X;
  const CH = AUTHOR + (UNITS - 1) * STEP_Y;
  const ox = Math.round((CW - aligned.W) / 2) + PHASE[0];
  const oy = Math.round((CH - aligned.H) / 2) + PHASE[1];
  console.log(`  [canvas] ${CW}x${CH}, Bild bei (${ox},${oy})  Phase ${PHASE[0]},${PHASE[1]}`);

  const canvasBuf = await sharp({
    create: { width: CW, height: CH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: alignedBuf, left: ox, top: oy }])
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(DBG_DIR, `${BASENAME}_row_aligned.png`), canvasBuf);
  const cv = await loadRGBA(canvasBuf);

  const boxOf = i => ({ x: (UNITS - 1 - i) * STEP_X, y: i * STEP_Y });

  // ── Prüfbild: Zeichenboxen + Ankerkreuze über dem ausgerichteten Bild ────
  {
    const rects = [];
    for (let i = 0; i < UNITS; i++) {
      const b = boxOf(i);
      rects.push(
        `<rect x="${b.x}" y="${b.y}" width="${AUTHOR}" height="${AUTHOR}" fill="none" ` +
          `stroke="${i === 0 ? '#22d3ee' : i === UNITS - 1 ? '#f87171' : '#4ade80'}" stroke-width="4"/>`,
        // Anker = untere Mitte der Box = Südspitze der Bodenraute
        `<path d="M${b.x + STEP_X - 30} ${b.y + AUTHOR} h60 M${b.x + STEP_X} ${b.y + AUTHOR - 30} v60" ` +
          `stroke="#fbbf24" stroke-width="5"/>`,
        // die Bodenraute selbst (48x24 -> 512x256 in Autorenmaß), Anker = Südspitze
        `<path d="M${b.x + STEP_X} ${b.y + AUTHOR} l${AUTHOR / 2} ${-AUTHOR / 4} l${-AUTHOR / 2} ${-AUTHOR / 4} ` +
          `l${-AUTHOR / 2} ${AUTHOR / 4} Z" fill="none" stroke="#fbbf24" stroke-width="3" stroke-dasharray="14 10"/>`,
      );
    }
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH}">${rects.join('')}</svg>`,
    );
    fs.writeFileSync(
      path.join(DBG_DIR, `${BASENAME}_row_boxgrid.png`),
      await sharp({ create: { width: CW, height: CH, channels: 4, background: { r: 18, g: 22, b: 30, alpha: 255 } } })
        .composite([{ input: alignedBuf, left: ox, top: oy }, { input: svg }])
        .png()
        .toBuffer(),
    );
  }

  // ── Restfehler des AUSGERICHTETEN Langbildes unter der Kachelverschiebung ─
  // Genau der Sprung, den ein naiver Schnitt an jeder Fuge zeigen würde.
  {
    let sum = 0,
      n = 0,
      sq = 0,
      nv = 0;
    for (let y = 0; y < cv.H; y++) {
      for (let x = 0; x < cv.W; x++) {
        const i = y * cv.W + x;
        if (cv.d[i * 4 + 3] < 250) continue;
        const x2 = x + STEP_X,
          y2 = y - STEP_Y;
        if (x2 >= cv.W || y2 < 0) continue;
        const j = y2 * cv.W + x2;
        if (cv.d[j * 4 + 3] < 250) continue;
        const la = 0.2126 * cv.d[i * 4] + 0.7152 * cv.d[i * 4 + 1] + 0.0722 * cv.d[i * 4 + 2];
        const lb = 0.2126 * cv.d[j * 4] + 0.7152 * cv.d[j * 4 + 1] + 0.0722 * cv.d[j * 4 + 2];
        sum += Math.abs(la - lb);
        n++;
        sq += la;
        nv++;
      }
    }
    const mean = sq / nv;
    let vr = 0;
    for (let y = 0; y < cv.H; y++)
      for (let x = 0; x < cv.W; x++) {
        const i = y * cv.W + x;
        if (cv.d[i * 4 + 3] < 250) continue;
        const la = 0.2126 * cv.d[i * 4] + 0.7152 * cv.d[i * 4 + 1] + 0.0722 * cv.d[i * 4 + 2];
        vr += (la - mean) * (la - mean);
      }
    const sd = Math.sqrt(vr / nv);
    console.log(
      `  [rest  ] Langbild gegen sich selbst um (+256,-128) verschoben: ` +
        `mittlere |dLuma| = ${(sum / n).toFixed(2)} bei sd = ${sd.toFixed(2)} ` +
        `-> ${((sum / n / sd) * 100).toFixed(1)} % der Bildstreuung (n=${n})`,
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  Streifen, Wrap-Blend, synthetische Reihe
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Die reine Faltung (box(x+256,y-128) == box(x,y)) reicht NICHT. Sie macht
  // das Stück unter der Kachelverschiebung konsistent, aber die Fuge im
  // zusammengesetzten Bild liegt woanders: an der rechten Boxkante trifft
  // Spalte 511 der zuletzt gemalten Kachel auf Spalte 256 ihres Vorgängers,
  // und über die Periodizität ist das genau der WRAP des Streifens,
  // strip(255,v) gegen strip(0,v+128). Gemessen lag dort der doppelte
  // mittlere Spaltengradient — der naive Fold hatte die Fuge nur verschoben.
  //
  // Erzwungen wird sie deshalb mit einem WRAP-BLEND: der Streifen wird über
  // die Periodenbreite von der Basiseinheit auf die um eine Periode
  // versetzte Nachbareinheit übergeblendet.
  //     S(u,v) = (1-w(u))*F(X0+u, Y0+v) + w(u)*F(X0+u-256, Y0+v+128)
  //     w(0) = 0 , w(255) = 1
  // Damit gilt am Wrap
  //     S(255,v)   = F(X0-1, Y0+v+128)
  //     S(0,v+128) = F(X0,   Y0+v+128)
  // — zwei benachbarte Pixel derselben Quelle, also stetig. Die Rampe läuft
  // nur über die letzten BLEND Pixel (smoothstep, C1 an beiden Enden), damit
  // die Geisterkante lokal bleibt statt das ganze Stück weichzuzeichnen.
  //
  // Aus dem Streifen wird eine SYNTHETISCHE Reihe aufgebaut (Streifen entlang
  // des Periodengitters gekachelt). Sie ist per Konstruktion exakt periodisch
  // und stetig. Die beiden echten Enden (oben rechts das offene Deckende,
  // unten links der Schaltschrank) werden darüber eingeblendet — die Rampe
  // liegt dabei ausserhalb des Bereichs, den ein Mittelstück je zeigt, also
  // sitzt an keiner Kachelkante ein Sprung.
  // Einheit, aus der der Streifen gezogen wird. Die Schranke ist keine
  // Geschmacksfrage: die Box der Einheit i liegt auf der Periodenkoordinate
  // kc in [REF-i, REF-i+2], die beiden Endrampen setzen bei KC_START = REF+1
  // und KC_END = REF-UNITS+3 an. Damit KEINE Rampe in die Box des
  // Mittelstuecks (kc in [0,2]) hineinreicht, muss 1 <= REF <= UNITS-3 gelten
  // — sonst blutet ein echtes Ende ins Mittelstueck und die Periodizitaet
  // faellt von 0 auf dreistellige Werte (bei UNITS=4, REF=2 gemessen: 246).
  const REF = Number(argOf('--ref') ?? Math.min(2, UNITS - 3));
  if (!(REF >= 1 && REF <= UNITS - 3)) {
    console.error(`--ref ${REF} unzulaessig: bei --units ${UNITS} muss 1 <= ref <= ${UNITS - 3} sein.`);
    process.exit(1);
  }
  const X0 = boxOf(REF).x;
  const Y0 = boxOf(REF).y;
  const kmin = Math.floor((0 - X0) / STEP_X);
  const kmax = Math.floor((CW - 1 - X0) / STEP_X);
  const VMIN = -Y0 + STEP_Y * kmin;
  const VMAX = CH - Y0 + STEP_Y * kmax;
  const SH = VMAX - VMIN;
  console.log(`  [strip ] u=[0,${STEP_X})  v=[${VMIN},${VMAX})  (${STEP_X}x${SH}), Wrap-Blend ${BLEND} px`);

  const px = (X, Y) => {
    if (X < 0 || Y < 0 || X >= cv.W || Y >= cv.H) return null;
    const p = (Y * cv.W + X) * 4;
    return [cv.d[p], cv.d[p + 1], cv.d[p + 2], cv.d[p + 3] / 255];
  };
  const smooth = t => t * t * (3 - 2 * t);
  /** Rampe: 0 bis u = STEP_X-BLEND, dann glatt auf 1 bei u = STEP_X-1. */
  const wrapW = u => {
    const t = (u - (STEP_X - BLEND)) / (BLEND - 1);
    return t <= 0 ? 0 : t >= 1 ? 1 : smooth(t);
  };

  const strip = new Float32Array(STEP_X * SH * 4); // premultipliziert + Alpha
  for (let vi = 0; vi < SH; vi++) {
    const v = VMIN + vi;
    for (let u = 0; u < STEP_X; u++) {
      const G = px(X0 + u, Y0 + v);
      const Hn = px(X0 + u - STEP_X, Y0 + v + STEP_Y);
      let w = wrapW(u);
      let a, b;
      if (G && Hn) {
        a = G;
        b = Hn;
      } else if (G) {
        a = G;
        b = G;
        w = 0;
      } else if (Hn) {
        a = Hn;
        b = Hn;
        w = 0;
      } else continue;
      const o = (vi * STEP_X + u) * 4;
      for (let c = 0; c < 3; c++) strip[o + c] = (1 - w) * a[c] * a[3] + w * b[c] * b[3];
      strip[o + 3] = (1 - w) * a[3] + w * b[3];
    }
  }

  // ── synthetische Reihe: Streifen entlang des Periodengitters gekachelt ───
  const syn = Buffer.alloc(CW * CH * 4, 0);
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      const k = Math.floor((x - X0) / STEP_X);
      const u = x - X0 - k * STEP_X;
      const vi = y - Y0 + STEP_Y * k - VMIN;
      if (vi < 0 || vi >= SH) continue;
      const so = (vi * STEP_X + u) * 4;
      const a = strip[so + 3];
      if (a <= 0.002) continue;
      const to = (y * CW + x) * 4;
      syn[to + 3] = Math.round(Math.max(0, Math.min(255, a * 255)));
      for (let c = 0; c < 3; c++) syn[to + c] = Math.round(Math.max(0, Math.min(255, strip[so + c] / a)));
    }
  }

  // ── echte Enden einblenden ───────────────────────────────────────────────
  // kc = (x - X0) / STEP_X ist die fortlaufende Periodenkoordinate; Einheit i
  // liegt bei kc = REF - i.  Die Rampen sitzen in dem Bereich, den NUR das
  // jeweilige Endstück zeigt, nie in dem eines Mittelstücks.
  // Die Box der Kachel i beginnt bei kc = REF - i und ist 2 Perioden breit.
  // Die Fuge start|mid sitzt an der rechten Boxkante der Kachel 1,
  // die Fuge end|mid an der rechten Boxkante der Kachel UNITS-1.
  const KC_START = REF - 1 + 2; // = REF + 1
  const KC_END = REF - (UNITS - 1) + 2; // = REF - UNITS + 3
  const hyb = Buffer.alloc(CW * CH * 4, 0);
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      const kc = (x - X0) / STEP_X;
      let wr = 0; // Gewicht des ECHTEN Bildes
      if (kc > KC_START) wr = Math.min(1, (kc - KC_START) / RAMP);
      else if (kc < KC_END) wr = Math.min(1, (KC_END - kc) / RAMP);
      wr = smooth(wr);
      const o = (y * CW + x) * 4;
      const ra = cv.d[o + 3] / 255;
      const sa = syn[o + 3] / 255;
      const a = (1 - wr) * sa + wr * ra;
      hyb[o + 3] = Math.round(Math.max(0, Math.min(255, a * 255)));
      if (a > 0.002) {
        for (let c = 0; c < 3; c++) {
          const pm = (1 - wr) * syn[o + c] * sa + wr * cv.d[o + c] * ra;
          hyb[o + c] = Math.round(Math.max(0, Math.min(255, pm / a)));
        }
      }
    }
  }

  // ── Grade (LESSONS §2: Farbe kommt aus dem Grade, nicht aus dem Prompt) ──
  // Ein flux-Langbild trifft den Pegel des Modulkorpus nicht. Gemessen ueber
  // opake Pixel liegt der Korpus bei Luma 74-82 und B/R ~1.17
  // (large_storage ALT 80.6/1.174, basic_storage 81.8/1.183, solar_panel
  // 74.3/1.171); das rohe Lagerlangbild kam mit Luma 102 und B/R 0.73 zurueck,
  // also 25 % zu hell und deutlich zu warm. Ein Prompt trifft keinen Zielwert,
  // ein Grade trifft ihn.
  //
  // Die Gains werden EINMAL aus dem Mittelstueck-Kasten gezogen und auf die
  // GANZE Leinwand angewandt — nur so bleiben die drei Stuecke untereinander
  // (und das spaeter daraus geschnittene Einzelstueck) farbgleich.
  if (GRADE) {
    const [Lt, brT, grT] = GRADE;
    const mb = boxOf(REF);
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = mb.y; y < mb.y + AUTHOR; y++)
      for (let x = mb.x; x < mb.x + AUTHOR; x++) {
        const o = (y * CW + x) * 4;
        if (hyb[o + 3] < 200) continue;
        r += hyb[o];
        g += hyb[o + 1];
        b += hyb[o + 2];
        n++;
      }
    r /= n;
    g /= n;
    b /= n;
    const Rt = Lt / (0.2126 + 0.7152 * grT + 0.0722 * brT);
    const sc = [Rt / r, (Rt * grT) / g, (Rt * brT) / b];
    for (let i = 0; i < CW * CH; i++)
      for (let k = 0; k < 3; k++)
        hyb[i * 4 + k] = Math.max(0, Math.min(255, Math.round(hyb[i * 4 + k] * sc[k])));
    console.log(
      `  [grade ] mid war R${r.toFixed(1)} G${g.toFixed(1)} B${b.toFixed(1)} ` +
        `(Luma ${(0.2126 * r + 0.7152 * g + 0.0722 * b).toFixed(1)}, B/R ${(b / r).toFixed(3)})` +
        `  -> Ziel Luma ${Lt} B/R ${brT} G/R ${grT}, Gains ${sc.map(v => v.toFixed(3)).join(' ')}`,
    );
  }

  const hybBuf = await sharp(hyb, { raw: { width: CW, height: CH, channels: 4 } }).png().toBuffer();
  fs.writeFileSync(path.join(DBG_DIR, `${BASENAME}_row_hybrid.png`), hybBuf);

  // ── die drei Stücke ──────────────────────────────────────────────────────
  const cutFrom = (buf, i) => {
    const b = boxOf(i);
    return sharp(buf).extract({ left: b.x, top: b.y, width: AUTHOR, height: AUTHOR }).png().toBuffer();
  };
  const startBuf = await cutFrom(hybBuf, 0); // niedrigstes posY, rechts oben, zuerst gemalt
  const endBuf = await cutFrom(hybBuf, UNITS - 1); // höchstes posY, links unten, zuletzt gemalt
  const midBuf = await cutFrom(hybBuf, REF); // reine synthetische Periode

  // ── Beweis 1: Periodizität des Mittelstücks ──────────────────────────────
  {
    const m = await sharp(midBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let worst = 0;
    for (let y = STEP_Y; y < AUTHOR; y++)
      for (let x = 0; x < AUTHOR - STEP_X; x++) {
        const i = (y * AUTHOR + x) * 4;
        const j = ((y - STEP_Y) * AUTHOR + x + STEP_X) * 4;
        for (let c = 0; c < 4; c++) worst = Math.max(worst, Math.abs(m.data[i + c] - m.data[j + c]));
      }
    console.log(`  [beweis] max |mid(x,y) - mid(x+256,y-128)| = ${worst}  (0 = exakt periodisch)`);
  }

  // ── Beweis 2: Fugensprung im zusammengesetzten Bild ──────────────────────
  // An der rechten Boxkante trifft Spalte 511 der oberen Kachel auf Spalte 256
  // der unteren, um STEP_Y versetzt. Nur das VERHÄLTNIS zum mittleren
  // Spaltengradienten des Stücks ist aussagekräftig (LESSONS §5: ein
  // Absolutwert ohne Bezugsgröße ist keine Kennzahl).
  const seamOf = async (bufA, bufB, label) => {
    const A1 = await sharp(bufA).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const B1 = await sharp(bufB).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const lum = (b, i) => 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];
    let seam = 0,
      ns = 0,
      base = 0,
      nb = 0;
    // Die Fuge liegt an der RECHTEN Boxkante der später gemalten Kachel.
    // Links davon deren Spalte 511 in Zeile a, rechts davon Spalte 256 des
    // Vorgängers in Zeile a + STEP_Y (der Vorgänger sitzt STEP_Y höher).
    // bufA = spätere Kachel, bufB = Vorgänger.
    for (let a = 0; a < AUTHOR - STEP_Y; a++) {
      const i = (a * AUTHOR + AUTHOR - 1) * 4;
      const j = ((a + STEP_Y) * AUTHOR + STEP_X) * 4;
      if (A1.data[i + 3] > 250 && B1.data[j + 3] > 250) {
        seam += Math.abs(lum(A1.data, i) - lum(B1.data, j));
        ns++;
      }
    }
    for (let y = 0; y < AUTHOR; y++)
      for (let x = 1; x < AUTHOR; x++) {
        const i = (y * AUTHOR + x) * 4,
          k2 = (y * AUTHOR + x - 1) * 4;
        if (A1.data[i + 3] > 250 && A1.data[k2 + 3] > 250) {
          base += Math.abs(lum(A1.data, i) - lum(A1.data, k2));
          nb++;
        }
      }
    console.log(
      `  [beweis] Fuge ${label}: ${(seam / ns).toFixed(2)} Luma gegen mittleren ` +
        `Spaltengradienten ${(base / nb).toFixed(2)} -> Faktor ${(seam / ns / (base / nb)).toFixed(2)} (n=${ns})`,
    );
  };
  await seamOf(midBuf, midBuf, 'mid|mid  ');
  await seamOf(midBuf, startBuf, 'mid|start');
  await seamOf(endBuf, midBuf, 'end|mid  ');

  const write = (n, buf) => {
    const p = path.join(OUT_DIR, `${n}.png`);
    fs.writeFileSync(p, buf);
    console.log(`  [save  ] ${path.relative(ROOT, p)}`);
  };
  // Namensschema der Stufe danach: finalize-module-webp.ts erwartet
  // assets/final/<name>_0.png. Deshalb hier gleich mit _0 schreiben.
  write(`${BASENAME}_start_0`, startBuf);
  write(`${BASENAME}_mid_0`, midBuf);
  write(`${BASENAME}_end_0`, endBuf);
  for (const [n, buf] of [
    ['start', startBuf],
    ['mid', midBuf],
    ['end', endBuf],
  ]) {
    const mm = await sharp(buf).metadata();
    console.log(`           ${n}: ${mm.width}x${mm.height} alpha=${mm.hasAlpha}`);
  }
})();
