/**
 * Proof-of-Concept: "Lit-Variante" eines bestehenden Modul-Sprites erzeugen.
 *
 * Ziel: Asset EXAKT beibehalten (Silhouette, Perspektive, Stil, Details), aber
 * insgesamt leicht abgedunkelt + kleine warm leuchtende Arbeitslampen/Lichter an
 * physisch plausiblen Stellen (Konsole, Status-LEDs, Punktlampen). Einsatz:
 * Sprite-Swap auf atmosphärenlosen, stark abgedunkelten Welten.
 *
 * Pipeline (KEIN Tight-Crop — Canvas-Maße + Objekt-Position des Originals bleiben):
 *   1. Original (webp, Alpha) auf neutralen HELLGRAUEN BG flatten -> PNG data URI.
 *      (Hellgrau, NICHT dunkel: birefnet frisst sonst dunkle Objektteile — die
 *      Steinplattform der Pumpe wurde bei dunklem BG komplett als BG entfernt.)
 *   2. flux-pro/kontext Image-to-Image (fal.run, fixe Seed, positive Preservation-
 *      Prompt) — gleiche Konvention wie style-test-tile-*.cjs
 *   3. Output auf Original-Canvas-Größe resizen
 *   4. BG-Removal via fal-ai/birefnet/v2 (Upload in fal-Storage wie
 *      process-module-assets.ts)
 *   5. Alignment: Ergebnis-BBox auf Original-BBox setzen (Translate; Resize nur
 *      wenn BBox-Größe >1px abweicht) — skalieren/padden, NIE neu croppen.
 *   6. Verifikation NACH Alignment: Alpha-BBox-Abweichung <= 3% der Canvas-Größe
 *      UND Alpha-IoU >= 92% (IoU-Gate fängt den Fall "BG-Removal hat Objektteile
 *      gefressen / Proportionen verschoben", den die reine BBox nicht sieht).
 *      Bei Fail: neuer Versuch mit verschärftem Prompt + neuer fixer Seed (max 3).
 *   7. Finale: Original-Alpha als Maske (dest-in) -> exakt identische Silhouette.
 *      Output: <out>.png + <out>.webp (Q90/smartSubsample wie finalize-module-webp)
 *      + Vergleichs-HTML assets/lit-poc/compare.html + lit-poc-report.json
 *
 * fal key in scripts/.env (FAL_API_KEY) — niemals hardcoden / committen.
 * Schreibt NUR nach assets/lit-poc/ (bzw. --output-Ordner) — nichts in src/.
 *
 * Usage:
 *   node scripts/generate-lit-variant.cjs \
 *     [--input src/assets/modules/pump/pump_0.webp] \
 *     [--output assets/lit-poc/pump_0_lit.png] \
 *     [--type machine|hull]                        (Prompt-Preset, Default: machine) \
 *     [--compare-html compare.html]                (HTML-Dateiname im Output-Ordner) \
 *     [--report-json lit-poc-report.json]          (Report-Dateiname im Output-Ordner) \
 *     [--prompt-suffix "..."] [--bg "#c9ced6"] [--max-attempts 3] \
 *     [--min-luminance 0.60]  Luminanz-Gate: mittlere Luminanz des Lit-Ergebnisses
 *                             INNERHALB der Original-Alpha-Maske muss >= 60% der
 *                             Original-Luminanz sein. Bei Verletzung: Re-Roll in der
 *                             bestehenden Versuchs-Schleife mit hellerer Formulierung
 *                             ("very slightly darker" statt "slightly darker"). Wenn
 *                             nach allen Versuchen weiterhin zu dunkel: deterministisch
 *                             per sharp modulate auf das Gate anheben — Report/Status:
 *                             POST_BRIGHTENED (Konsistenz vor Puritaet). \
 *     [--reuse-check]         Wenn die Output-Datei existiert und ALLE Gates (BBox,
 *                             IoU, Luminanz) erfuellt: skip ohne fal-Call — Status:
 *                             REUSED (idempotenter Batch-Rerun).
 */
const fs = require('fs');
const path = require('path');
try {
  const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const FAL_API_KEY = process.env.FAL_API_KEY || process.env.FAL_AI_API_KEY;
if (!FAL_API_KEY) { console.error('No fal key (FAL_API_KEY in scripts/.env)'); process.exit(1); }
const https = require('https');
const http = require('http');
const sharp = require('sharp');

const REPO = path.resolve(__dirname, '..');

// ── args ──
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const INPUT = path.resolve(REPO, arg('input', 'src/assets/modules/pump/pump_0.webp'));
const OUTPUT = path.resolve(REPO, arg('output', 'assets/lit-poc/pump_0_lit.png'));
const PROMPT_SUFFIX = arg('prompt-suffix', '');
const BG_HEX = arg('bg', '#ffffff');
const MAX_ATTEMPTS = parseInt(arg('max-attempts', '3'), 10);
const TYPE = arg('type', 'machine'); // Prompt-Preset: 'machine' (Module) | 'hull' (Hüllen)
const COMPARE_HTML = arg('compare-html', 'compare.html');
const REPORT_JSON = arg('report-json', 'lit-poc-report.json');
const MAX_DEV_PCT = 3.0; // max BBox-Kanten-Abweichung (nach Alignment) in % Canvas
const IOU_MIN = 0.92; // min Alpha-IoU (nach Alignment) — Preservation-Gate
const ALPHA_T = 16; // Alpha-Schwelle für BBox/IoU (Halo-Rauschen ignorieren)
// Luminanz-Gate: mittlere Luminanz des Lit-Ergebnisses innerhalb der Original-
// Alpha-Maske >= MIN_LUMINANCE * Original-Luminanz (Default 0.60).
const MIN_LUMINANCE = parseFloat(arg('min-luminance', '0.60'));
// --reuse-check: Output existiert + alle Gates erfuellt → skip (idempotenter Batch-Rerun).
const REUSE_CHECK = process.argv.includes('--reuse-check');

const OUT_DIR = path.dirname(OUTPUT);
const OUT_BASE = path.basename(OUTPUT).replace(/\.(png|webp)$/i, '');

// BG-Helligkeit -> Farbwort im Prompt (Modell soll den BG plain lassen).
function bgWord(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l > 200 ? 'white' : l > 128 ? 'light grey' : 'dark grey';
}

// ── Prompts: Preservation zuerst, Edit klein halten, positiv formuliert ──
// WICHTIG: KEINE "dark world"-Szenen-Sprache — die macht den ganzen Output
// (inkl. Background) dunkel und birefnet frisst dann dunkle Objektteile
// (Plattform). Nur das Objekt mild dimmen + Lichter AN; die starke
// Welt-Abdunkelung passiert im Spiel / ggf. deterministisch im Post.
// Presets pro Asset-Typ — 'machine' = unverändertes Pumpen-PoC-Verhalten.
const PRESETS = {
  machine: {
    noun: 'machine',
    lightsWord: 'work lights',
    preserve:
      'this is the exact same machine, unchanged: same isometric perspective, same silhouette, ' +
      'same proportions, same size and position in the frame, same colors, same materials, ' +
      'same pipes and tanks and every detail identical, nothing added, nothing removed, nothing moved',
    lighting:
      'only change the lighting on the machine itself: its metal surfaces are slightly darker and ' +
      'dimmer than before, and a few small warm work lights on the machine are switched on and glow ' +
      'in warm amber — a small glowing control console screen, a few tiny warm amber status indicator ' +
      'LEDs, and one or two small warm point work lamps at physically plausible spots on the equipment, ' +
      'each casting a soft subtle warm orange glow onto the nearby metal surfaces',
  },
  // Hüllen: KEINE neuen Fenster/Öffnungen erfinden — nur vorhandene Details
  // (Tür/Schleuse, Wand-Panel, Fugen) beleuchten. Vorhandene Leucht-Strips
  // explizit als "bleibt" nennen, sonst dimmt/ändert kontext sie mit.
  hull: {
    noun: 'building',
    lightsWord: 'warm lights',
    preserve:
      'this is the exact same building, unchanged: same isometric perspective, same silhouette, ' +
      'same proportions, same size and position in the frame, same colors, same materials, ' +
      'same wall panels, same doors, same vents, same glowing light strips and every detail ' +
      'identical, nothing added, nothing removed, nothing moved',
    lighting:
      'only change the lighting on the building itself: its exterior surfaces are slightly darker ' +
      'and dimmer than before, and a few small warm lights on the building are switched on and glow ' +
      'in warm amber — a small subtle warm light at the existing entrance door, a few tiny warm ' +
      'amber status indicator lights on the existing small wall control panel, and a faint warm glow ' +
      'in one or two existing panel seams, each casting a soft subtle warm orange glow onto the ' +
      'nearby hull surface, only existing openings and details are lit, no new windows, no new openings',
  },
};
const PRESET = PRESETS[TYPE];
if (!PRESET) { console.error(`Unknown --type "${TYPE}" (known: ${Object.keys(PRESETS).join(', ')})`); process.exit(1); }
const PRESERVE = PRESET.preserve;
const LIGHTING = PRESET.lighting;
const ISOLATION =
  `isolated single object on a plain uniform ${bgWord(BG_HEX)} background, the background stays ` +
  `${bgWord(BG_HEX)} and bright and empty and unchanged, no new objects, no added structures, ` +
  'no ground plane, no text';

// Hellere Dimm-Formulierung für Luminanz-Re-Rolls: "very slightly darker" statt
// "slightly darker". Wird NUR nach einem Luminanz-Gate-Fail verwendet — ohne
// Luminanz-Fail bleiben die Prompts byte-identisch zum bisherigen Verhalten.
const LIGHTING_BRIGHT = LIGHTING.replace('slightly darker', 'very slightly darker');

// Eskalation pro Versuch: fixe Seeds (kein Math.random), Prompt wird strenger.
// lighting wird pro Versuch injiziert (Standard oder helle Luminanz-Re-Roll-Variante).
const ATTEMPT_BUILDERS = [
  (lighting) => ({
    seed: 771001,
    prompt: `${PRESERVE}, ${lighting}, ${ISOLATION}`,
    note: 'a1 — Basis-Preservation-Prompt',
  }),
  (lighting) => ({
    seed: 771138,
    prompt:
      `${PRESERVE}, keep the object exactly where it is, do not zoom, do not crop, do not rescale, ` +
      `identical framing and composition, ${lighting}, ${ISOLATION}`,
    note: 'a2 — + explizites Framing-Lock (no zoom/crop/rescale)',
  }),
  (lighting) => ({
    seed: 771275,
    prompt:
      `${PRESERVE}, change nothing except the lights: only add the small glowing ${PRESET.lightsWord} and ` +
      `dim the ${PRESET.noun} slightly, every part of the ${PRESET.noun} stays in the same place, ` +
      `${lighting}, ${ISOLATION}`,
    note: 'a3 — minimaler Edit-Scope (nur Lichter, alles andere fest)',
  }),
];

// ── HTTP helpers (Konvention aus style-test-tile-*.cjs / process-module-assets.ts) ──
function fetchJson(url, body, method = 'POST') {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = body ? JSON.stringify(body) : undefined;
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: parsed.hostname, port: parsed.port,
      path: parsed.pathname + parsed.search, method,
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        if (res.statusCode >= 400) { reject(new Error(`fal ${res.statusCode}: ${raw.slice(0, 400)}`)); return; }
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('bad json ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function download(url) {
  return new Promise((resolve, reject) => {
    const go = (u) => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) { go(res.headers.location); return; }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };
    go(url);
  });
}

// Upload eines PNG-Buffers in die fal-Storage (wie process-module-assets.ts) —
// birefnet bekommt eine echte URL statt einer großen data URI.
async function uploadPng(buf, fileName) {
  const init = await fetchJson('https://rest.alpha.fal.ai/storage/upload/initiate', {
    content_type: 'image/png', file_name: fileName,
  });
  const u = new URL(init.upload_url);
  await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'PUT',
      headers: { 'Content-Type': 'image/png', 'Content-Length': buf.length },
    }, (res) => { res.on('data', () => {}); res.on('end', resolve); });
    req.on('error', reject); req.write(buf); req.end();
  });
  return init.file_url;
}

// ── Alpha-Analyse ──
async function alphaBBox(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] > ALPHA_T) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) throw new Error('empty alpha — no visible pixels');
  return { left, top, right, bottom, w: right - left + 1, h: bottom - top + 1, canvasW: width, canvasH: height };
}

// Kanten-Abweichung zweier BBoxen in % der Canvas-Größe (max über 4 Kanten).
function bboxDeviation(orig, cand) {
  const devs = {
    left: Math.abs(cand.left - orig.left) / orig.canvasW * 100,
    top: Math.abs(cand.top - orig.top) / orig.canvasH * 100,
    right: Math.abs(cand.right - orig.right) / orig.canvasW * 100,
    bottom: Math.abs(cand.bottom - orig.bottom) / orig.canvasH * 100,
  };
  return { ...devs, max: Math.max(devs.left, devs.top, devs.right, devs.bottom) };
}

// Alpha-Masken-IoU (Schwelle ALPHA_T) — ehrliche Silhouetten-Preservation-Metrik.
async function alphaIoU(bufA, bufB) {
  const a = await sharp(bufA).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(bufB).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) return 0;
  let inter = 0, union = 0;
  const ca = a.info.channels, cb = b.info.channels;
  const px = a.info.width * a.info.height;
  for (let i = 0; i < px; i++) {
    const va = a.data[i * ca + 3] > ALPHA_T, vb = b.data[i * cb + 3] > ALPHA_T;
    if (va && vb) inter++;
    if (va || vb) union++;
  }
  return union ? inter / union : 0;
}

// Mittlere Luminanz (0-255, Rec.601) der Pixel eines Buffers an den Positionen,
// an denen die ORIGINAL-Alpha-Maske opak ist (Alpha > ALPHA_T). maskRaw ist das
// raw()-Ergebnis des Originals ({ data, info }).
async function luminanceInMask(buf, maskRaw) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== maskRaw.info.width || info.height !== maskRaw.info.height) {
    throw new Error(`luminance: size mismatch ${info.width}x${info.height} vs ${maskRaw.info.width}x${maskRaw.info.height}`);
  }
  const c = info.channels, mc = maskRaw.info.channels;
  let sum = 0, n = 0;
  const px = info.width * info.height;
  for (let i = 0; i < px; i++) {
    if (maskRaw.data[i * mc + 3] > ALPHA_T) {
      const o = i * c;
      sum += 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
      n++;
    }
  }
  return n ? sum / n : 0;
}

// Deterministisches Anheben auf das Luminanz-Gate (kein fal-Call): sharp modulate
// iterativ, bis die Luminanz in der Original-Maske >= MIN_LUMINANCE * origLum ist.
// modulate(brightness) wirkt auf Lightness (nicht linear auf Rec.601-Luma), daher
// Iteration mit leichtem Overshoot statt Einmal-Faktor.
async function brightenToGate(alignedBuf, origRaw, origLum) {
  const target = MIN_LUMINANCE * origLum;
  let buf = alignedBuf;
  let lum = await luminanceInMask(buf, origRaw);
  let totalFactor = 1;
  for (let iter = 0; iter < 6 && lum < target; iter++) {
    const f = Math.min(3, (target / Math.max(lum, 1)) * 1.01);
    buf = await sharp(buf).modulate({ brightness: f }).png().toBuffer();
    totalFactor *= f;
    lum = await luminanceInMask(buf, origRaw);
  }
  return { buf, lum, factor: totalFactor };
}

// ── Alignment: Ergebnis-BBox deckungsgleich auf Original-BBox setzen ──
async function alignToOriginal(nobgBuf, origBBox, candBBox, W, H) {
  let content = await sharp(nobgBuf)
    .extract({ left: candBBox.left, top: candBBox.top, width: candBBox.w, height: candBBox.h })
    .png().toBuffer();
  // Resize nur wenn die BBox-Größe wirklich abweicht (>1px) — sonst nur Translate.
  if (Math.abs(candBBox.w - origBBox.w) > 1 || Math.abs(candBBox.h - origBBox.h) > 1) {
    content = await sharp(content).resize(origBBox.w, origBBox.h, { fit: 'fill' }).png().toBuffer();
  }
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: content, left: origBBox.left, top: origBBox.top }])
    .png().toBuffer();
}

// ── Vergleichs-HTML (Vorbild: assets/style-test/*-style-test.html) ──
function writeCompareHtml(ctx) {
  const attemptCards = ctx.attempts.map((a) => `
    <div class="card">
      <h3>Versuch ${a.attempt} — Seed ${a.seed} ${a.pass ? '<span class="pick">PASS</span>' : '<span class="fail">FAIL</span>'}</h3>
      <p class="cap">${a.note}${a.error ? ` — ERROR: ${a.error}` : ` — nach Alignment: BBox-Abweichung max ${a.devMax.toFixed(2)}% (Limit ${MAX_DEV_PCT}%), Alpha-IoU ${(a.iou * 100).toFixed(1)}% (Min ${IOU_MIN * 100}%)${typeof a.lumRatio === 'number' ? `, Luminanz ${(a.lumRatio * 100).toFixed(1)}% vom Original (Min ${MIN_LUMINANCE * 100}%)` : ''}; roh (vor Alignment): BBox-Abweichung ${a.devRawMax.toFixed(2)}%, IoU ${(a.iouRaw * 100).toFixed(1)}%`}</p>
      ${a.error ? '' : `<div class="pair">
        <figure><img class="single" src="${a.rawFile}" alt="raw a${a.attempt}"><figcaption>kontext-Output (roh, resized)</figcaption></figure>
        <figure><img class="single checker" src="${a.nobgFile}" alt="nobg a${a.attempt}"><figcaption>nach BG-Removal (vor Alignment)</figcaption></figure>
        <figure><img class="single checker" src="${a.alignedFile}" alt="aligned a${a.attempt}"><figcaption>nach Alignment (vor Original-Maske)</figcaption></figure>
      </div>`}
    </div>`).join('\n');

  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Lit-Variante PoC — ${OUT_BASE}</title>
  <style>
    body { margin: 0; background: #0a0f1a; color: #d8dde3; font-family: system-ui, sans-serif; padding: 24px; }
    h1 { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
    h2 { font-size: 15px; font-weight: 600; margin: 28px 0 10px; color: #9aa3ad; letter-spacing: .04em; text-transform: uppercase; }
    p.lead { color: #9aa3ad; margin: 0 0 20px; max-width: 860px; line-height: 1.5; }
    .meta { border: 1px solid #232a38; border-radius: 10px; padding: 14px 16px; background: #0e1524; font-size: 13px; line-height: 1.6; max-width: 860px; margin-bottom: 8px; }
    .meta code { color: #8fb8d6; word-break: break-all; }
    .row { display: flex; gap: 28px; flex-wrap: wrap; align-items: flex-start; }
    figure { margin: 0; }
    figcaption { font-size: 12px; color: #9aa3ad; margin-top: 8px; max-width: ${ctx.W}px; }
    .sprite { width: ${ctx.W}px; height: auto; display: block; border-radius: 4px; }
    .stage { background: #0a0f1a; border: 1px solid #1a2233; border-radius: 8px; padding: 12px; }
    .overlay { position: relative; width: ${ctx.W}px; height: ${ctx.H}px; }
    .overlay img { position: absolute; inset: 0; width: ${ctx.W}px; height: ${ctx.H}px; }
    .overlay img.top50 { opacity: .5; }
    .overlay img.diff { mix-blend-mode: difference; }
    .dimmed img.sprite { filter: brightness(.45); }
    .card { border: 1px solid #232a38; border-radius: 10px; padding: 16px; background: #0e1524; margin-bottom: 16px; max-width: 1140px; }
    .card h3 { font-size: 14px; font-weight: 600; margin: 0 0 4px; }
    .card .cap { color: #9aa3ad; font-size: 12px; margin: 0 0 12px; line-height: 1.45; }
    .pair { display: flex; gap: 20px; flex-wrap: wrap; }
    .pair img.single { width: 320px; height: auto; display: block; border-radius: 4px; }
    .checker { background: repeating-conic-gradient(#1a2233 0% 25%, #0e1524 0% 50%) 0 0 / 24px 24px; }
    .pick { color: #8fd6a0; } .fail { color: #e08a8a; }
  </style>
</head>
<body>
  <h1>Lit-Variante PoC — ${OUT_BASE}</h1>
  <p class="lead">
    Sprite-Swap-Kandidat für atmosphärenlose, stark abgedunkelte Welten: gleiches Asset,
    insgesamt leicht dunkler, mit kleinen warmen Arbeitslichtern. Hintergrund dieser Seite
    (#0a0f1a) simuliert die abgedunkelte Welt.
  </p>
  <div class="meta">
    <strong>Modell:</strong> <code>${ctx.model}</code> · <strong>Versuche:</strong> ${ctx.attempts.length}/${MAX_ATTEMPTS}
    · <strong>Status:</strong> ${ctx.status}<br>
    <strong>Finaler Versuch:</strong> #${ctx.finalAttempt} (Seed ${ctx.finalSeed}) —
    nach Alignment: BBox-Abweichung max <strong>${ctx.finalDevMax.toFixed(2)}%</strong> (Limit ${MAX_DEV_PCT}%),
    Alpha-IoU <strong>${(ctx.finalIou * 100).toFixed(1)}%</strong> (Min ${IOU_MIN * 100}%) ·
    roh vor Alignment: BBox <strong>${ctx.finalDevRawMax.toFixed(2)}%</strong>, IoU <strong>${(ctx.finalIouRaw * 100).toFixed(1)}%</strong><br>
    <strong>Luminanz (in Orig-Alpha-Maske):</strong> ${(ctx.finalLumRatio * 100).toFixed(1)}% vom Original (Min ${MIN_LUMINANCE * 100}%)${ctx.postBrightened ? ` — <strong>POST_BRIGHTENED</strong> (sharp modulate ×${ctx.postBrightened.factor.toFixed(3)}: ${(ctx.postBrightened.lumRatioBefore * 100).toFixed(1)}% → ${(ctx.postBrightened.lumRatioAfter * 100).toFixed(1)}%)` : ''}<br>
    Final zusätzlich mit Original-Alpha maskiert → Sprite-Silhouette exakt identisch zum Original.<br>
    <strong>Prompt:</strong> <code>${ctx.finalPrompt}</code>
  </div>

  <h2>Nebeneinander (dunkle Welt)</h2>
  <div class="row">
    <figure class="stage"><img class="sprite" src="${ctx.origFile}" alt="Original"><figcaption>Original — ${OUT_BASE.replace(/_lit$/, '')}</figcaption></figure>
    <figure class="stage"><img class="sprite" src="${ctx.litFile}" alt="Lit"><figcaption>Lit-Variante (final, aligned + maskiert)</figcaption></figure>
  </div>

  <h2>Simulierte Welt-Abdunkelung (CSS brightness .45 auf beiden)</h2>
  <div class="row dimmed">
    <figure class="stage"><img class="sprite" src="${ctx.origFile}" alt="Original abgedunkelt"><figcaption>Original abgedunkelt — Lichter fehlen</figcaption></figure>
    <figure class="stage"><img class="sprite" src="${ctx.litFile}" alt="Lit abgedunkelt"><figcaption>Lit abgedunkelt — Arbeitslichter müssen lesbar bleiben</figcaption></figure>
  </div>

  <h2>Overlay — Deckungsgleichheit (Lit 50% über Original)</h2>
  <div class="row">
    <figure class="stage">
      <div class="overlay"><img src="${ctx.origFile}" alt="orig"><img class="top50" src="${ctx.litFile}" alt="lit 50%"></div>
      <figcaption>Doppelkonturen = Versatz. Eine saubere Kontur = deckungsgleich.</figcaption>
    </figure>
    <figure class="stage">
      <div class="overlay"><img src="${ctx.origFile}" alt="orig"><img class="diff" src="${ctx.litFile}" alt="difference"></div>
      <figcaption>Difference-Blend: dunkel = identisch, hell = Abweichung (Lichter erwartbar hell).</figcaption>
    </figure>
  </div>

  <h2>Versuche</h2>
  ${attemptCards}
</body>
</html>
`;
  const outPath = path.join(OUT_DIR, COMPARE_HTML);
  fs.writeFileSync(outPath, html);
  console.log(`[save] ${outPath}`);
}

// ── main ──
(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (!fs.existsSync(INPUT)) { console.error('Missing input: ' + INPUT); process.exit(1); }

  const origBuf = await sharp(fs.readFileSync(INPUT)).ensureAlpha().png().toBuffer();
  const meta = await sharp(origBuf).metadata();
  const W = meta.width, H = meta.height;
  const origBBox = await alphaBBox(origBuf);
  const origRaw = await sharp(origBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const origLum = await luminanceInMask(origBuf, origRaw);
  console.log(`[input] ${path.relative(REPO, INPUT)} ${W}x${H}, alpha-bbox ${origBBox.w}x${origBBox.h} @ ${origBBox.left},${origBBox.top}`);
  console.log(`[input] Luminanz in Alpha-Maske: ${origLum.toFixed(1)} — Gate: >= ${(MIN_LUMINANCE * 100).toFixed(0)}% davon (${(MIN_LUMINANCE * origLum).toFixed(1)})`);

  // ── --reuse-check: Output existiert + alle Gates erfuellt → skip ohne fal-Call ──
  if (REUSE_CHECK && fs.existsSync(OUTPUT)) {
    try {
      const exBuf = await sharp(fs.readFileSync(OUTPUT)).ensureAlpha().png().toBuffer();
      const exMeta = await sharp(exBuf).metadata();
      if (exMeta.width !== W || exMeta.height !== H) {
        throw new Error(`canvas ${exMeta.width}x${exMeta.height} != ${W}x${H}`);
      }
      const exBBox = await alphaBBox(exBuf);
      const exDev = bboxDeviation(origBBox, exBBox);
      const exIou = await alphaIoU(origBuf, exBuf);
      const exLum = await luminanceInMask(exBuf, origRaw);
      const exLumRatio = origLum > 0 ? exLum / origLum : 1;
      const ok = exDev.max <= MAX_DEV_PCT && exIou >= IOU_MIN && exLumRatio >= MIN_LUMINANCE;
      console.log(
        `[reuse-check] ${path.relative(REPO, OUTPUT)}: BBox-Abweichung ${exDev.max.toFixed(2)}% (Limit ${MAX_DEV_PCT}%), ` +
        `IoU ${(exIou * 100).toFixed(1)}% (Min ${IOU_MIN * 100}%), Luminanz ${(exLumRatio * 100).toFixed(1)}% ` +
        `(Min ${(MIN_LUMINANCE * 100).toFixed(0)}%) — ${ok ? 'alle Gates PASS' : 'Gate-Verletzung'}`
      );
      if (ok) {
        const webpOut = OUTPUT.replace(/\.png$/i, '.webp');
        if (!fs.existsSync(webpOut)) {
          await sharp(exBuf).webp({ quality: 90, effort: 4, smartSubsample: true }).toFile(webpOut);
          console.log(`[reuse-check] fehlendes WebP nachgeschrieben: ${path.relative(REPO, webpOut)}`);
        }
        console.log('\nStatus: REUSED');
        return;
      }
      console.log('[reuse-check] Output erfuellt Gates nicht — regeneriere.');
    } catch (e) {
      console.warn(`[reuse-check] Pruefung fehlgeschlagen (${e.message}) — regeneriere.`);
    }
  }

  // Original als PNG neben die Ergebnisse legen (compare.html ist damit self-contained).
  const origFile = `${OUT_BASE.replace(/_lit$/, '')}_orig.png`;
  fs.writeFileSync(path.join(OUT_DIR, origFile), origBuf);

  // Kontext-Basis: Alpha auf neutralen hellgrauen BG flatten (birefnet-freundlich).
  const flatPng = await sharp(origBuf).flatten({ background: BG_HEX }).png().toBuffer();
  const dataUri = `data:image/png;base64,${flatPng.toString('base64')}`;
  const model = 'fal-ai/flux-pro/kontext';

  const attempts = [];
  let winner = null;
  // Nach einem Luminanz-Gate-Fail: alle Folge-Versuche mit hellerer Formulierung
  // ("very slightly darker") re-rollen — Seeds/Eskalation bleiben unverändert.
  let brighterLighting = false;

  for (let i = 0; i < Math.min(MAX_ATTEMPTS, ATTEMPT_BUILDERS.length); i++) {
    const cfg = ATTEMPT_BUILDERS[i](brighterLighting ? LIGHTING_BRIGHT : LIGHTING);
    if (brighterLighting) cfg.note += ' + hellere Dimm-Formulierung ("very slightly darker", Luminanz-Re-Roll)';
    const prompt = PROMPT_SUFFIX ? `${cfg.prompt}, ${PROMPT_SUFFIX}` : cfg.prompt;
    console.log(`\n[kontext] attempt ${i + 1}/${MAX_ATTEMPTS} seed ${cfg.seed} (${cfg.note})`);
    console.log(`  prompt="${prompt}"`);
    try {
      const r = await fetchJson(`https://fal.run/${model}`, {
        image_url: dataUri,
        prompt,
        num_images: 1,
        safety_tolerance: '5',
        output_format: 'png',
        seed: cfg.seed,
      });
      const url = r.images && r.images[0] && r.images[0].url;
      if (!url) throw new Error('no kontext url: ' + JSON.stringify(r).slice(0, 200));

      // Auf Original-Canvas-Größe bringen (1:1 bleibt 1:1 — kein Crop).
      const raw = await sharp(await download(url)).resize(W, H, { fit: 'fill' }).png().toBuffer();
      const rawFile = `${OUT_BASE}_raw_a${i + 1}.png`;
      fs.writeFileSync(path.join(OUT_DIR, rawFile), raw);

      console.log('  [birefnet] removing background...');
      const falUrl = await uploadPng(raw, `${OUT_BASE}_a${i + 1}.png`);
      const br = await fetchJson('https://fal.run/fal-ai/birefnet/v2', { image_url: falUrl });
      const nobg = await sharp(await download(br.image.url)).resize(W, H, { fit: 'fill' }).ensureAlpha().png().toBuffer();
      const nobgFile = `${OUT_BASE}_nobg_a${i + 1}.png`;
      fs.writeFileSync(path.join(OUT_DIR, nobgFile), nobg);

      // Roh-Metriken (Diagnose) + Alignment + Metriken NACH Alignment (Gate).
      const candBBox = await alphaBBox(nobg);
      const devRaw = bboxDeviation(origBBox, candBBox);
      const iouRaw = await alphaIoU(origBuf, nobg);

      const aligned = await alignToOriginal(nobg, origBBox, candBBox, W, H);
      const alignedFile = `${OUT_BASE}_aligned_a${i + 1}.png`;
      fs.writeFileSync(path.join(OUT_DIR, alignedFile), aligned);
      const alignedBBox = await alphaBBox(aligned);
      const dev = bboxDeviation(origBBox, alignedBBox);
      const iou = await alphaIoU(origBuf, aligned);
      const lumLit = await luminanceInMask(aligned, origRaw);
      const lumRatio = origLum > 0 ? lumLit / origLum : 1;
      const lumPass = lumRatio >= MIN_LUMINANCE;
      const silhouettePass = dev.max <= MAX_DEV_PCT && iou >= IOU_MIN;
      const pass = silhouettePass && lumPass;
      console.log(`  raw: bbox ${candBBox.w}x${candBBox.h} @ ${candBBox.left},${candBBox.top} dev ${devRaw.max.toFixed(2)}% IoU ${(iouRaw * 100).toFixed(1)}%`);
      console.log(`  aligned: dev ${dev.max.toFixed(2)}% (limit ${MAX_DEV_PCT}%) IoU ${(iou * 100).toFixed(1)}% (min ${IOU_MIN * 100}%) — ${silhouettePass ? 'PASS' : 'FAIL'}`);
      console.log(`  luminance: ${lumLit.toFixed(1)} = ${(lumRatio * 100).toFixed(1)}% vom Original (min ${(MIN_LUMINANCE * 100).toFixed(0)}%) — ${lumPass ? 'PASS' : 'FAIL'}`);

      const rec = {
        attempt: i + 1, seed: cfg.seed, note: cfg.note, prompt,
        rawFile, nobgFile, alignedFile,
        devRawMax: devRaw.max, iouRaw, dev, devMax: dev.max, iou,
        lumOrig: origLum, lumLit, lumRatio, lumPass, silhouettePass, pass,
      };
      attempts.push(rec);
      if (!lumPass) brighterLighting = true;
      if (pass) { winner = { ...rec, aligned }; break; }
    } catch (e) {
      console.error(`  ERR attempt ${i + 1}: ${e.message}`);
      attempts.push({ attempt: i + 1, seed: cfg.seed, note: cfg.note, prompt, error: e.message, devRawMax: 99, iouRaw: 0, devMax: 99, iou: 0, lumRatio: 0, lumPass: false, silhouettePass: false, pass: false });
    }
  }

  // Kein PASS: Fallback-Reihenfolge —
  //  (a) Silhouette-Gates ok, nur Luminanz zu dunkel → hellsten Kandidaten nehmen,
  //      deterministisch auf das Gate anheben (POST_BRIGHTENED, Konsistenz vor Puritaet).
  //  (b) Silhouette nirgends ok → besten Versuch (höchste IoU) als Befund finalisieren.
  let status = 'PASSED';
  let postBrightened = null;
  if (!winner) {
    const silhouetteOk = attempts.filter((a) => !a.error && a.silhouettePass);
    if (silhouetteOk.length) {
      const best = silhouetteOk.sort((a, b) => b.lumRatio - a.lumRatio)[0];
      console.warn(`\nNo attempt passed luminance gate — post-brightening best attempt #${best.attempt} (Luminanz ${(best.lumRatio * 100).toFixed(1)}% < ${(MIN_LUMINANCE * 100).toFixed(0)}%).`);
      winner = { ...best, aligned: fs.readFileSync(path.join(OUT_DIR, best.alignedFile)) };
      status = 'POST_BRIGHTENED';
    } else {
      status = 'FAILED_ALIGNMENT';
      const best = attempts.filter((a) => !a.error).sort((a, b) => b.iou - a.iou)[0];
      if (!best) { console.error('\nAll attempts errored — no output.'); process.exit(1); }
      console.warn(`\nNo attempt passed — finalizing best attempt #${best.attempt} (IoU ${(best.iou * 100).toFixed(1)}%, dev ${best.devMax.toFixed(2)}%) als Befund.`);
      winner = { ...best, aligned: fs.readFileSync(path.join(OUT_DIR, best.alignedFile)) };
    }
  }

  // Luminanz-Gate final durchsetzen — deterministisch per sharp modulate, kein fal-Call.
  if (typeof winner.lumRatio === 'number' && winner.lumRatio < MIN_LUMINANCE) {
    const res = await brightenToGate(winner.aligned, origRaw, origLum);
    postBrightened = {
      factor: res.factor,
      lumBefore: winner.lumLit, lumAfter: res.lum,
      lumRatioBefore: winner.lumRatio,
      lumRatioAfter: origLum > 0 ? res.lum / origLum : 1,
    };
    winner = { ...winner, aligned: res.buf, lumLit: res.lum, lumRatio: postBrightened.lumRatioAfter };
    console.log(`[post-brighten] sharp modulate ×${res.factor.toFixed(3)}: Luminanz ${(postBrightened.lumRatioBefore * 100).toFixed(1)}% → ${(postBrightened.lumRatioAfter * 100).toFixed(1)}% vom Original`);
  }

  // Finale: Original-Alpha als Maske → Silhouette exakt wie Original.
  const finalBuf = await sharp(winner.aligned).composite([{ input: origBuf, blend: 'dest-in' }]).png().toBuffer();
  fs.writeFileSync(OUTPUT, finalBuf);
  console.log(`\n[save] ${path.relative(REPO, OUTPUT)} (${W}x${H}, aligned + original-alpha-masked)`);

  const webpOut = OUTPUT.replace(/\.png$/i, '.webp');
  await sharp(finalBuf).webp({ quality: 90, effort: 4, smartSubsample: true }).toFile(webpOut);
  console.log(`[save] ${path.relative(REPO, webpOut)} (Q90, wie Modul-Konvention)`);

  const report = {
    input: path.relative(REPO, INPUT), output: path.relative(REPO, OUTPUT), model, bg: BG_HEX, type: TYPE,
    canvas: { W, H }, origBBox, status,
    gates: { maxDevPct: MAX_DEV_PCT, iouMin: IOU_MIN, minLuminance: MIN_LUMINANCE },
    luminance: {
      note: 'Mittlere Luminanz (Rec.601, 0-255) der Pixel innerhalb der Original-Alpha-Maske (Alpha > 16)',
      orig: origLum, lit: winner.lumLit, ratio: winner.lumRatio,
    },
    postBrightened,
    finalAttempt: winner.attempt,
    attempts,
  };
  fs.writeFileSync(path.join(OUT_DIR, REPORT_JSON), JSON.stringify(report, null, 2));

  writeCompareHtml({
    model, status, W, H, attempts,
    origFile, litFile: path.basename(OUTPUT),
    finalAttempt: winner.attempt, finalSeed: winner.seed, finalPrompt: winner.prompt,
    finalDevMax: winner.devMax, finalIou: winner.iou,
    finalDevRawMax: winner.devRawMax, finalIouRaw: winner.iouRaw,
    finalLumRatio: winner.lumRatio, postBrightened,
  });

  console.log(`\nStatus: ${status}`);
})();
