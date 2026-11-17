/**
 * Schliesst die OFFENE Kante eines Iso-Reihenstuecks zu einem EINZELSTUECK.
 *
 *   node scripts/close-iso-end.cjs --name large_storage --clip --clip-only
 *   node scripts/close-iso-end.cjs --name large_storage --clip --poly "..." --prompt "..."
 *   node scripts/close-iso-end.cjs --clip --try 4 --variant c  # Solarpanel, so entstanden
 *   node scripts/close-iso-end.cjs --name large_storage \
 *        --splice assets/final/large_storage_start_0.png --splice-at 300
 *
 * Argumente: --name <basename> (Vorgabe solar_panel; leitet --input, --output
 * und die Debug-Namen ab), --input/--output, --poly "x,y x,y ...",
 * --clip, --band <px>, --band-ymin <y>, --prompt <text> | --variant a|b|c,
 * --grow/--shrink/--feather, --try, --seed, --endpoint, --upscale,
 * --mask-only/--clip-only/--no-fill,
 * --splice <png> / --splice-offset dx,dy / --splice-at <x> / --splice-ramp <px>.
 *
 * ACHTUNG: --poly und --band-ymin sind an EINEM Sprite gemessen. Fuer einen
 * neuen Modultyp neu messen (Alpha-Bbox + Zoom-Raster), nie uebernehmen.
 *
 * ══ --splice: den zweiten Abschluss aus dem ANFANGSSTUECK holen ════════════
 *
 * Der dritte Weg, und fuer offene Motive (Regalreihen, Masten, Gerueste) der
 * beste: das Reihenende traegt SCHON einen fertigen Abschluss — nur eben den
 * anderen.  `<name>_end_0.png` schliesst unten links ab, `<name>_start_0.png`
 * oben rechts.  Beide sind Boxen aus demselben ausgerichteten Langbild, liegen
 * also auf demselben Motivraster und tragen denselben Grade.  Das Einzelstueck
 * ist damit reine Geometrie: linke Haelfte aus dem Endstueck, rechte Haelfte
 * aus dem Anfangsstueck, ueber eine schmale senkrechte Rampe verblendet.
 * Kein Modellaufruf, und Massstab, Fusspunkt, Farbe und Hoehe sind per
 * Konstruktion die der Familie.
 *
 * Der Versatz --splice-offset ist KEIN freier Parameter: er muss ein Vektor des
 * MOTIVRASTERS sein, sonst springt die Phase (Regalstiele stehen dann nicht
 * mehr im Takt).  Gleichzeitig muss er die Ankerlinie y + 0.5x = const in sich
 * ueberfuehren, sonst wandert der Fusspunkt.  Beides erfuellt jeder Vektor
 * (2k, -k): beim grossen Lager liegt das Regalfeld auf der HALBEN Kachelperiode,
 * also ist (128,-64) der kleinste brauchbare Versatz.  Er schiebt den oberen
 * Abschluss um ein Regalfeld nach rechts und haelt so die Zeichenbox in der
 * Breite gefuellt (ohne Versatz endet die Alpha-Bbox bei x=359 statt 487).
 *
 * ══ Was getragen hat ═══════════════════════════════════════════════════════
 *
 * NICHT: eine Maske ueber den ganzen Nachbarbereich (13,6 % des Bildes).
 * FLUX Fill baut in eine so grosse Luecke zuverlaessig etwas Neues hinein —
 * Versuch a einen zweiten Panelblock, Versuch b einen Schuppen. Kein Prompt
 * hat das abgestellt; "nichts dahinter" ist fuer ein Diffusionsmodell keine
 * Bildaussage.
 *
 * SONDERN: --clip schneidet den Nachbarn GEOMETRISCH weg (das ist Rechnen,
 * kein Raten), und das Modell bekommt nur noch ein 26-px-Band entlang der
 * frischen Schnittkante, um sie zu einem Abschluss zu verputzen. 3,8 % des
 * Bildes, davon 11 398 px im Ergebnis — der Rest ist pixelgleich zum Original.
 *
 * ══ Warum Inpainting und nicht neu generieren ══════════════════════════════
 *
 * `assets/final/solar_panel_end_0.png` ist das Stueck UNTEN LINKS der Reihe: es
 * traegt den Schaltschrank als sauberen Abschluss und hat seine OFFENE Seite
 * OBEN RECHTS, wo im Verbund das Mittelstueck anschliesst.  Ein neu generiertes
 * Einzelstueck haette einen anderen Massstab, eine andere Farbe und einen
 * anderen Fusspunkt.  Also wird nur die offene Kante neu erzeugt; alles
 * ausserhalb der Maske wird PIXELGENAU aus dem Original zurueckkopiert.
 *
 * ══ Geometrie der Maske ════════════════════════════════════════════════════
 *
 * Konstanten wie in scripts/cut-iso-row.cjs:
 *     AUTHOR = 512   STEP_X = 256   STEP_Y = 128
 * Anker = UNTERE MITTE der Zeichenbox = Suedspitze der Bodenraute = (256,512).
 * Nachbar posY-1 (oben rechts) liegt bei (+256,-128).
 *
 * Eine Schnittebene bei konstantem worldY bildet sich NICHT auf eine einzige
 * Bildgerade ab — gemessen an der Projektion
 *     x = (wx-wy)*256 + 256 ,  y = (wx+wy)*128 - wz*341.33 + 512
 * ist  f(x,y) = (x-256) - 2*(y-512) = -512*wy + 341.33*wz.
 * Die Hoehe wz verschiebt f also mit.  Deshalb ist die Maske KEINE Halbebene:
 *
 *   - Deck (bekannte Hoehe): Schnittkante laeuft in Bildrichtung (2,1).
 *   - Vorderflaeche des Decks: darunter senkrecht nach unten (die Schnittflaeche
 *     eines Quaders ist ein senkrechtes Parallelogramm).
 *   - Das EIGENE Panel steht hoch und ragt weit nach oben rechts; es liegt
 *     damit auf derselben Seite wie der Nachbar und muss per Hand ausgespart
 *     werden.  Die Maskenkante folgt seiner rechten Kante mit Sicherheitsrand.
 *
 * Die Zahlen unten sind an solar_panel_end.png GEMESSEN (Alpha-Bbox, Navy-Bands
 * je 16-px-Zeile, Zoom-Raster), nicht geraten.
 *
 * ══ Zwei Masken, nicht eine ════════════════════════════════════════════════
 *
 *   maskModel = Polygon + GROW px   -> was das Modell neu malen darf
 *   maskBlend = Polygon - SHRINK px, weichgezeichnet -> womit eingeblendet wird
 *
 * So bekommt das Modell Kontext ueber die Kante hinaus, waehrend der uebernommene
 * Bereich strikt innerhalb des Polygons bleibt.  Ausserhalb: Originalpixel.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');
sharp.cache(false);

// ── fal-Key aus scripts/.env (nie hardcoden, nie loggen) ──
try {
  const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const FAL_API_KEY = process.env.FAL_API_KEY || process.env.FAL_AI_API_KEY;

const ROOT = path.join(__dirname, '..');
const DIR_FINAL = path.join(ROOT, 'assets', 'final');
const DIR_PREV = path.join(ROOT, 'assets', 'prev');
const DIR_RAW = path.join(ROOT, 'assets', 'raw');
for (const d of [DIR_FINAL, DIR_PREV, DIR_RAW]) fs.mkdirSync(d, { recursive: true });

const AUTHOR = 512;
const argOf = (n, d) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};
const has = n => process.argv.includes(n);

/** Modul-Basisname; bestimmt Ein-/Ausgabe und alle Debug-Dateinamen. */
const NAME = argOf('--name', 'solar_panel');
const INPUT = argOf('--input', path.join(DIR_FINAL, `${NAME}_end_0.png`));
const OUTPUT = argOf('--output', path.join(DIR_FINAL, `${NAME}_0.png`));
/** Praefix der Debug-Bilder unter assets/prev/. */
const DBG = `${NAME}_single`;
const TRY = Number(argOf('--try', '1'));
const SEED = Number(argOf('--seed', '515101'));
const ENDPOINT = argOf('--endpoint', 'fal-ai/flux-pro/v1/fill');
const GROW = Number(argOf('--grow', '8')); // Kontextrand fuer das Modell
const SHRINK = Number(argOf('--shrink', '2')); // Sicherheitsrand fuer die Uebernahme
const FEATHER = Number(argOf('--feather', '3')); // Weichzeichnung der Blendkante
const UPSCALE = Number(argOf('--upscale', '2')); // 512 -> 1024 fuer den API-Call

/**
 * Maskenpolygon in 512er-Autorenkoordinaten: der Bereich OBEN RECHTS, der im
 * Verbund vom Mittelstueck belegt wird, plus die Deck-Schnittflaeche.
 *   (426,  0)         obere Bildkante rechts der eigenen Panelspitze
 *   (342, 92)         Sicherheitsrand rechts der eigenen Panelspitze (325,102)
 *   (417,252)         Sicherheitsrand rechts der eigenen Panelecke   (400,257)
 *   (489,288)         Schnittkante des Decks, Bildrichtung (2,1)
 *   (489,360)         senkrecht runter durch die Deck-Vorderflaeche
 *   (512,360)/(512,0) rechter Bildrand
 */
const POLY = (argOf('--poly', '426,0 342,92 417,252 489,288 489,360 512,360 512,0') || '')
  .trim()
  .split(/\s+/)
  .map(p => p.split(',').map(Number));

// Kurz halten: fal schneidet bei ~1200 Zeichen ab, Wichtiges nach vorn.
const PROMPTS = {
  // Versuch 1: beschreibt den Abschluss. Ergebnis: das Modell BAUT weiter
  //            (Hochplattform + Maschinenkasten) statt abzuschliessen.
  a: [
    'isometric 2.5D game sprite, one single small solar power unit standing alone.',
    'Close the open right end of the grey concrete deck with a clean finished edge:',
    'a short blunt end block of the same weathered grey concrete, same thickness,',
    'flat top, crisp 2:1 isometric edges. Nothing sticks out beyond it.',
    'Same muted palette and grain as the deck on the left, lit from upper left,',
    'plain flat white backdrop, no background, no second panel, no extra machinery.',
  ].join(' '),
  // Versuch 2: das Ende ZUERST, das Nichts dahinter ausdruecklich.
  //            Ergebnis: das Modell setzt einen Schuppen in die Luecke.
  b: [
    'The grey concrete deck ENDS here and nothing follows it.',
    'Draw one short blunt end wall closing the deck: same weathered grey concrete,',
    'same thickness, flat top, crisp 2:1 isometric edges.',
    'Behind and above that end wall: empty plain white background, nothing at all.',
    'No second solar panel, no machinery, no crates, no railing, no deck continuation.',
    'Isometric 2.5D game sprite, muted grey palette, lit from upper left.',
  ].join(' '),
  // Versuch 3: --clip erledigt das Entfernen geometrisch, das Modell bekommt nur
  //            noch ein SCHMALES Band an der frischen Schnittkante.
  c: [
    'Finish this sliced concrete edge into a solid end wall.',
    'Same weathered grey concrete, flat top, one crisp isometric corner,',
    'the end face slightly darker than the top. Nothing else, plain white around it.',
  ].join(' '),
};
const PROMPT = argOf('--prompt', null) || PROMPTS[argOf('--variant', 'b')] || PROMPTS.b;

// ───────────────────────────────────────────────────────── HTTP ──
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => {
        data += c;
      });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
const httpsGet = (url, headers) => {
  const u = new URL(url);
  return httpsRequest({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers });
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const dl = u => {
      const mod = u.startsWith('https') ? https : http;
      mod
        .get(u, res => {
          if (res.statusCode === 301 || res.statusCode === 302) return dl(res.headers.location);
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        })
        .on('error', reject);
    };
    dl(url);
  });
}
async function uploadToFal(buffer, fileName) {
  const init = JSON.parse(
    (
      await httpsRequest(
        {
          hostname: 'rest.alpha.fal.ai',
          path: '/storage/upload/initiate',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
        },
        JSON.stringify({ content_type: 'image/png', file_name: fileName }),
      )
    ).body,
  );
  const u = new URL(init.upload_url);
  await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'PUT',
        headers: { 'Content-Type': 'image/png', 'Content-Length': buffer.length.toString() },
      },
      res => {
        res.on('data', () => {});
        res.on('end', resolve);
      },
    );
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
  return init.file_url;
}
async function runQueue(endpoint, payload, label) {
  const r = await httpsRequest(
    {
      hostname: 'queue.fal.run',
      path: '/' + endpoint,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
    },
    JSON.stringify(payload),
  );
  let submit;
  try {
    submit = JSON.parse(r.body);
  } catch {
    throw new Error(`${label}: HTTP ${r.status} ${r.body.slice(0, 300)}`);
  }
  if (!submit.status_url) throw new Error(`${label}: HTTP ${r.status} ${r.body.slice(0, 400)}`);
  process.stdout.write(`    ${label} waiting`);
  for (let i = 0; i < 150; i++) {
    await sleep(2000);
    const st = JSON.parse((await httpsGet(submit.status_url, { Authorization: `Key ${FAL_API_KEY}` })).body);
    if (st.status === 'COMPLETED') {
      process.stdout.write(' done\n');
      return JSON.parse((await httpsGet(submit.response_url, { Authorization: `Key ${FAL_API_KEY}` })).body);
    }
    if (st.status === 'FAILED') throw new Error(`${label} failed: ${JSON.stringify(st).slice(0, 300)}`);
    process.stdout.write('.');
  }
  throw new Error(`${label}: timeout`);
}

// ─────────────────────────────────────────────────────── Bilder ──
const loadRGBA = async src => {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { d: data, W: info.width, H: info.height };
};
function bbox({ d, W, H }) {
  let x0 = 1e9,
    y0 = 1e9,
    x1 = -1,
    y1 = -1,
    n = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        n++;
      }
    }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, n };
}
/** Punkt-in-Polygon (even-odd). */
function inPoly(px, py, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** Chebyshev-Distanztransform (zwei Durchlaeufe) auf einer 0/1-Maske. */
function distOutside(mask, W, H) {
  const BIG = 1e6;
  const D = new Float32Array(W * H).fill(BIG);
  for (let i = 0; i < W * H; i++) if (mask[i]) D[i] = 0;
  const rel = (x, y, v) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return v;
    return Math.min(v, D[y * W + x] + 1);
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = D[y * W + x];
      v = rel(x - 1, y, v);
      v = rel(x, y - 1, v);
      v = rel(x - 1, y - 1, v);
      v = rel(x + 1, y - 1, v);
      D[y * W + x] = v;
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      let v = D[y * W + x];
      v = rel(x + 1, y, v);
      v = rel(x, y + 1, v);
      v = rel(x + 1, y + 1, v);
      v = rel(x - 1, y + 1, v);
      D[y * W + x] = v;
    }
  return D;
}
function blurF(src, W, H, r) {
  if (r <= 0) return src;
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

// ────────────────────────────────────────────────────────── Lauf ──
(async () => {
  if (!fs.existsSync(INPUT)) {
    console.error(`Quelle fehlt: ${INPUT}`);
    process.exit(1);
  }
  const src = await loadRGBA(INPUT);
  const W = src.W,
    H = src.H;
  console.log(`[close-iso-end] ${path.relative(ROOT, INPUT)}  ${W}x${H}`);
  console.log(`  [bbox  ] Original ${JSON.stringify(bbox(src))}`);

  // ── --splice: rechte Haelfte aus dem Anfangsstueck (siehe Kopf) ─────────
  const SPLICE = argOf('--splice', null);
  if (SPLICE) {
    const spliceFile = path.isAbsolute(SPLICE) ? SPLICE : path.join(ROOT, SPLICE);
    if (!fs.existsSync(spliceFile)) {
      console.error(`Splice-Quelle fehlt: ${spliceFile}`);
      process.exit(1);
    }
    const oth = await loadRGBA(spliceFile);
    if (oth.W !== W || oth.H !== H) {
      console.error(`Splice-Quelle ${oth.W}x${oth.H} passt nicht zu ${W}x${H}`);
      process.exit(1);
    }
    const [sdx, sdy] = (argOf('--splice-offset', '128,-64') || '').split(',').map(Number);
    if (sdx !== -2 * sdy) {
      console.error(
        `--splice-offset ${sdx},${sdy} liegt nicht auf der Iso-Achse (dx = -2*dy) ` +
          `-> Fusspunkt und Motivphase wuerden wandern.`,
      );
      process.exit(1);
    }
    const at = Number(argOf('--splice-at', String(Math.round(W / 2))));
    const ramp = Math.max(1, Number(argOf('--splice-ramp', '48')));
    const sm = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    const out = Buffer.alloc(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        const w = sm((x - (at - ramp / 2)) / ramp);
        const sx = x - sdx,
          sy = y - sdy;
        const hasO = sx >= 0 && sy >= 0 && sx < W && sy < H;
        const po = hasO ? (sy * W + sx) * 4 : -1;
        const a0 = src.d[o + 3] / 255;
        const a1 = hasO ? oth.d[po + 3] / 255 : 0;
        const a = (1 - w) * a0 + w * a1;
        out[o + 3] = Math.round(Math.max(0, Math.min(255, a * 255)));
        if (a > 0.002) {
          for (let c = 0; c < 3; c++) {
            const pm = (1 - w) * src.d[o + c] * a0 + w * (hasO ? oth.d[po + c] : 0) * a1;
            out[o + c] = Math.round(Math.max(0, Math.min(255, pm / a)));
          }
        }
      }
    }
    const outBuf = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    fs.writeFileSync(OUTPUT, outBuf);
    console.log(
      `  [splice] ${path.relative(ROOT, spliceFile)} um (${sdx},${sdy}) versetzt, ` +
        `Rampe bei x=${at} +-${ramp / 2}`,
    );
    console.log(`  [save  ] ${path.relative(ROOT, OUTPUT)}`);
    console.log(`  [bbox  ] Ergebnis ${JSON.stringify(bbox(await loadRGBA(outBuf)))}`);
    return;
  }

  // ── Masken bauen ────────────────────────────────────────────────────────
  const inside = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inPoly(x + 0.5, y + 0.5, POLY)) inside[y * W + x] = 1;
  const dOut = distOutside(inside, W, H); // 0 innerhalb, >0 ausserhalb
  const invert = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) invert[i] = inside[i] ? 0 : 1;
  const dIn = distOutside(invert, W, H); // 0 ausserhalb, >0 innerhalb

  // ── CLIP-Modus ──────────────────────────────────────────────────────────
  // Zuerst wird der Nachbar GEOMETRISCH weggeschnitten (kein Modell noetig),
  // dann bekommt das Modell nur ein schmales Band an der frischen Schnittkante.
  // Grund: bei einer 14-%-Luecke baut FLUX Fill zuverlaessig neue Bauwerke
  // hinein (Versuch 1 und 2) — ein Band von ~26 px laesst dafuer keinen Platz.
  const CLIP = has('--clip');
  let work = src; // Bild, das ins Modell geht und als Basis dient
  if (CLIP) {
    const cd = Buffer.from(src.d);
    for (let i = 0; i < W * H; i++) if (inside[i]) cd[i * 4 + 3] = 0;
    work = { d: cd, W, H };
    const clippedPng = await sharp(cd, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    fs.writeFileSync(path.join(DIR_PREV, `${DBG}_clipped.png`), clippedPng);
    console.log(`  [clip  ] assets/prev/${DBG}_clipped.png  bbox ${JSON.stringify(bbox(work))}`);
  }

  const BAND = Number(argOf('--band', '26'));
  const BAND_YMIN = Number(argOf('--band-ymin', '238'));
  const modelMask = Buffer.alloc(W * H * 3, 0); // weiss = neu malen
  const blendRaw = new Float32Array(W * H);
  if (CLIP) {
    // Band um die Schnittkante, aber nur dort, wo nach dem Clip noch Material
    // in der Naehe liegt — sonst malt das Modell in die leere Luft.
    const solid = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) solid[i] = work.d[i * 4 + 3] > 8 ? 1 : 0;
    const dSolid = distOutside(solid, W, H);
    for (let i = 0; i < W * H; i++) {
      // Genau eines von beiden ist 0 (innen bzw. aussen), die Summe ist also
      // der Abstand zur Polygonkante.
      const dEdge = dOut[i] + dIn[i];
      // Nur die DECK-Schnittkante wird nachgearbeitet. Oberhalb davon laeuft
      // die Polygonkante an der rechten Panelkante entlang — die ist bereits
      // ein fertiger Rand und darf nicht angefasst werden.
      const y = (i / W) | 0;
      const near = y >= BAND_YMIN && dEdge <= BAND && dSolid[i] <= BAND;
      if (near) {
        modelMask[i * 3] = 255;
        modelMask[i * 3 + 1] = 255;
        modelMask[i * 3 + 2] = 255;
      }
      blendRaw[i] = near && dEdge <= BAND - SHRINK && dSolid[i] <= BAND - SHRINK && y >= BAND_YMIN + SHRINK ? 1 : 0;
    }
  } else {
    for (let i = 0; i < W * H; i++) {
      if (dOut[i] <= GROW) {
        modelMask[i * 3] = 255;
        modelMask[i * 3 + 1] = 255;
        modelMask[i * 3 + 2] = 255;
      }
      blendRaw[i] = dIn[i] > SHRINK ? 1 : 0;
    }
  }
  const blend = blurF(blendRaw, W, H, FEATHER);
  const maskCount = blendRaw.reduce((a, b) => a + b, 0);
  console.log(
    `  [maske ] Polygon ${POLY.map(p => p.join(',')).join(' ')}` +
      `\n           grow=${GROW} shrink=${SHRINK} feather=${FEATHER}` +
      `  -> ${maskCount} von ${W * H} px (${((100 * maskCount) / (W * H)).toFixed(1)} %)`,
  );

  const modelMaskPng = await sharp(modelMask, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  fs.writeFileSync(path.join(DIR_PREV, `${DBG}_mask.png`), modelMaskPng);

  // Vorschau: Maske rot ueber dem Original
  {
    const ov = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const w = modelMask[i * 3] ? 0.55 : 0;
      for (let c = 0; c < 3; c++) ov[i * 4 + c] = Math.round((1 - w) * work.d[i * 4 + c] + w * (c === 0 ? 255 : 30));
      ov[i * 4 + 3] = Math.max(work.d[i * 4 + 3], Math.round(w * 200));
    }
    fs.writeFileSync(
      path.join(DIR_PREV, `${DBG}_maskpreview.png`),
      await sharp({ create: { width: W, height: H, channels: 4, background: { r: 20, g: 24, b: 32, alpha: 255 } } })
        .composite([{ input: await sharp(ov, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer() }])
        .png()
        .toBuffer(),
    );
    console.log(`  [maske ] assets/prev/${DBG}_mask.png + _maskpreview.png`);
  }
  if (has('--mask-only') || has('--clip-only')) return;

  // ── --no-fill: nur der geometrische Schnitt, kein Modell ────────────────
  // Beim Solarpanel lief der Schnitt durch ein DECK, also durch eine
  // waagerechte Platte — dort entsteht eine echte Schnittflaeche, die
  // verputzt werden muss. Geht der Schnitt dagegen durch einen AUFRECHTEN
  // Koerper (Regal, Mast, Wand), entsteht gar keine Flaeche: das Objekt hoert
  // einfach auf. Gemessen am grossen Lager hat FLUX Fill in dieses Band
  // schwebende Bretter und Traeger gemalt und war auf Spielskala deutlich
  // schlechter als der nackte Schnitt. Dann ist --no-fill die richtige Wahl.
  if (has('--no-fill')) {
    const outBuf = await sharp(work.d, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    fs.writeFileSync(OUTPUT, outBuf);
    console.log(`  [save  ] ${path.relative(ROOT, OUTPUT)}  (nur Schnitt, kein Modell)`);
    console.log(`  [bbox  ] Ergebnis ${JSON.stringify(bbox(await loadRGBA(outBuf)))}`);
    return;
  }
  if (!FAL_API_KEY) {
    console.error('Kein fal-Key in scripts/.env');
    process.exit(1);
  }

  // ── Eingabebild: auf Weiss legen, hochskalieren ─────────────────────────
  // ACHTUNG: sharp wendet .resize() VOR .composite() an. Erst flach machen,
  // Buffer ziehen, DANN in einem zweiten Durchlauf skalieren — sonst sitzt das
  // 512er Sprite unskaliert in einer 1024er Leinwand und die Maske passt nicht.
  const U = UPSCALE;
  const flat512 = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } },
  })
    .composite([{ input: await sharp(work.d, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer() }])
    .png()
    .toBuffer();
  const flatPng = await sharp(flat512).resize(W * U, H * U, { kernel: 'lanczos3' }).png().toBuffer();
  fs.writeFileSync(path.join(DIR_PREV, `${DBG}_apiinput.png`), flatPng);
  const maskUp = await sharp(modelMaskPng).resize(W * U, H * U, { kernel: 'nearest' }).png().toBuffer();

  const tag = `${DBG}_t${TRY}`;
  const imgUrl = await uploadToFal(flatPng, `${tag}_in.png`);
  const mskUrl = await uploadToFal(maskUp, `${tag}_mask.png`);

  console.log(`  [gen   ] ${ENDPOINT}  seed=${SEED}  prompt ${PROMPT.length} Zeichen`);
  const res = await runQueue(
    ENDPOINT,
    {
      image_url: imgUrl,
      mask_url: mskUrl,
      prompt: PROMPT,
      num_images: 1,
      output_format: 'png',
      safety_tolerance: '6',
      seed: SEED,
    },
    'fill',
  );
  const genUrl = (res.images && res.images[0] && res.images[0].url) || (res.image && res.image.url);
  if (!genUrl) throw new Error('keine Bild-URL: ' + JSON.stringify(res).slice(0, 300));
  const genRaw = await downloadBuffer(genUrl);
  fs.writeFileSync(path.join(DIR_RAW, `${tag}_raw.png`), genRaw);
  console.log(`  [raw   ] assets/raw/${tag}_raw.png`);

  // ── Hintergrund entfernen (Alpha fuer den NEUEN Bereich) ────────────────
  const genUp = await uploadToFal(genRaw, `${tag}_gen.png`);
  const nobg = await runQueue('fal-ai/birefnet/v2', { image_url: genUp }, 'birefnet');
  const nobgBuf = await downloadBuffer(nobg.image.url);
  const gen = await loadRGBA(await sharp(nobgBuf).resize(W, H, { kernel: 'lanczos3' }).png().toBuffer());
  if (gen.W !== W || gen.H !== H) throw new Error(`Groesse ${gen.W}x${gen.H}`);

  // ── Zusammensetzen: ausserhalb der Maske PIXELGENAU das Original ────────
  const out = Buffer.alloc(W * H * 4);
  let changed = 0;
  for (let i = 0; i < W * H; i++) {
    const w = Math.max(0, Math.min(1, blend[i]));
    const ao = work.d[i * 4 + 3] / 255;
    const an = gen.d[i * 4 + 3] / 255;
    const a = (1 - w) * ao + w * an;
    out[i * 4 + 3] = Math.round(a * 255);
    if (a > 0.002) {
      for (let c = 0; c < 3; c++) {
        const pm = (1 - w) * work.d[i * 4 + c] * ao + w * gen.d[i * 4 + c] * an;
        out[i * 4 + c] = Math.round(Math.max(0, Math.min(255, pm / a)));
      }
    }
    if (w > 0.001) changed++;
  }
  const outBuf = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  fs.writeFileSync(OUTPUT, outBuf);
  console.log(`  [save  ] ${path.relative(ROOT, OUTPUT)}  (${changed} px aus der Generierung)`);
  console.log(`  [bbox  ] Ergebnis ${JSON.stringify(bbox(await loadRGBA(outBuf)))}`);
})().catch(e => {
  console.error(String(e));
  process.exit(1);
});
