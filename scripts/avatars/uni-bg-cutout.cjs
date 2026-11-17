/**
 * Zweistufiges Freistellen der Cutscene-Avatare (Haarkanten-Fix).
 *
 * Problem: die Basis-Avatare liegen in einer detailreichen, dunklen Szene
 * (Labor / Bruecke / Buero). Ein Matting-Modell direkt darauf loszulassen
 * (heutiger Pfad in scripts/avatars/workflow.ts -> utils.removeBackground)
 * liefert eine weiche, aber straehnenlose Blob-Kante — die Figur wirkt in der
 * Cutscene "aufgesetzt".
 *
 * Pipeline pro Avatar (Rudis Auftrag, zweistufig):
 *   1. Original -> fal-Storage
 *   2. fal-ai/flux-pro/kontext Edit: Hintergrund durch einen gleichmaessigen,
 *      einfarbigen Backdrop ersetzen, Figur unveraendert
 *                                        -> flux-edit/<id>_<variant>.png
 *   3. fal-ai/birefnet/v2 auf das Edit-Ergebnis, mit model='Matting'|'Portrait',
 *      operating_resolution='2048x2048', refine_foreground=true. KEINE
 *      Alpha-Levels-Kurve wie in props-pipeline-lib.cjs — die killt genau die
 *      weichen Straehnen, die hier gebraucht werden. Auch KEINE manuelle
 *      Spill-Decontamination: F=(C-(1-a)B)/a setzt eine echte Deckungsgrad-
 *      Matte voraus; auf birefnets Soft-Segmentierung uebersteuert die Rechnung
 *      den Saum (gemessen -89 Luminanz). refine_foreground macht das modellseitig.
 *                                        -> transparent/<id>_<variant>.png
 *   4. Full-Res-Transfer: dieselbe Alphamaske auf das ORIGINAL in nativer
 *      Aufloesung (2048x2880). ACHTUNG: kontext aendert das Seitenverhaeltnis
 *      (880x1184 = 0.743 statt 0.711), die Maske sitzt daher versetzt — das
 *      Ergebnis ist unbrauchbar und dient nur der Dokumentation.
 *                                        -> transparent/<id>_<variant>_fullres.png
 *   B. Kontrollgruppe (--direct-only faehrt nur diese): direktes Matting auf dem
 *      unveraenderten Original. Behaelt 2048x2880 und laesst die Figur intakt.
 *                                        -> transparent/<id>_direct[_<model>].png
 *   6. Metriken (Straehnigkeit, Soft-Edge-Breite, Halo, effektive Matte-
 *      Aufloesung, Masken-IoU, Interior-Drift der Figur) -> report JSON
 *   7. Web-Previews + Haar-Zoom-Crops fuer die Vergleichs-HTML
 *
 * fal key aus scripts/.env (FAL_AI_API_KEY / FAL_API_KEY) — nie hardcoden.
 * Schreibt NUR nach assets/avatars/flux-edit|transparent. Die Originale unter
 * assets/avatars/base/ (inkl. der beiden bereits freigestellten Hash-Dateien)
 * werden NIE ueberschrieben.
 *
 * Usage:
 *   node scripts/avatars/uni-bg-cutout.cjs [--only <id>] [--variant light|contrast]
 *                                          [--attempt N] [--model Matting|Portrait]
 *                                          [--direct-only]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');
const A = require('./analyze-cutout.cjs');

// env
try {
  const envRaw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* .env optional wenn Key als env var gesetzt ist */ }
const FAL_API_KEY = process.env.FAL_AI_API_KEY || process.env.FAL_API_KEY;
if (!FAL_API_KEY) { console.error('No fal key (FAL_AI_API_KEY in scripts/.env)'); process.exit(1); }

const REPO = path.resolve(__dirname, '..', '..');
const BASE_DIR = path.join(REPO, 'assets/avatars/base');
const EDIT_DIR = path.join(REPO, 'assets/avatars/flux-edit');
const TRANS_DIR = path.join(REPO, 'assets/avatars/transparent');
for (const d of [EDIT_DIR, TRANS_DIR]) fs.mkdirSync(d, { recursive: true });

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const ONLY = arg('only', null);
const VARIANT = arg('variant', 'light');
const ATTEMPT = parseInt(arg('attempt', '1'), 10);
// birefnet-Checkpoint: 'Matting' (Default) | 'Portrait' | 'General Use (Heavy)' ...
const MODEL = arg('model', 'Matting');
// --direct-only: nur das direkte Matting aufs Original, kein kontext-Edit
// (guenstige Probe, um Matting-Checkpoints gegeneinander zu testen).
const DIRECT_ONLY = process.argv.includes('--direct-only');
const MODEL_SUFFIX = MODEL === 'Matting' ? '' : '_' + MODEL.toLowerCase().replace(/[^a-z0-9]+/g, '');

// ── Avatare + BG-Wahl ──────────────────────────────────────────────────────
// Der BG-Ton wird pro Figur gewaehlt: moeglichst grosser Abstand zu Haar- und
// Kleidungsfarbe. Dr. Vasquez hat weiss-platinblondes Haar und sehr blasse
// Haut — fuer sie ist ein heller BG der schlechteste Fall. Der Auftrag wird
// trotzdem ausgefuehrt (variant=light), zusaetzlich gibt es fuer sie eine
// kontrastierende Variante (variant=contrast) zum Vergleich.
const AVATARS = {
  director_ashford: {
    name: 'Director Marcus Ashford',
    hair: 'dunkles zurueckgekaemmtes Haar, silbergraue Schlaefen',
    currentCutout: 'e1HxFL9lYq9UwCqTi3tZa_39JGq3fQ.png',
    light: { hex: '#d9dde1', word: 'light neutral grey' },
    contrast: { hex: '#7d8fa0', word: 'medium cool grey-blue' },
  },
  dr_vasquez: {
    name: 'Dr. Elena Vasquez',
    hair: 'weiss-platinblondes Haar, sehr blasse Haut',
    currentCutout: 'NW6tNFF70LppOtjNEgnlR_ZjzJ8v2i.png',
    light: { hex: '#d9dde1', word: 'light neutral grey' },
    contrast: { hex: '#4a5a6b', word: 'medium slate blue-grey' },
  },
  captain_bredvik: {
    name: 'Captain Joern Bredvik',
    hair: 'graumelierter Vollbart, dunkle Uniform',
    currentCutout: null, // noch nicht in Verwendung — keine bisherige Freistellung
    light: { hex: '#d9dde1', word: 'light neutral grey' },
    contrast: { hex: '#cbb9a2', word: 'light warm sand beige' },
  },
};

// ── Prompt: kurz halten (fal schneidet ~1200 Zeichen ab), Wichtigstes zuerst ─
function buildPrompt(bgWord, attempt) {
  const base =
    `Replace only the background with a plain solid uniform ${bgWord} studio backdrop, ` +
    `completely flat and even, no objects, no gradient, no cast shadow. ` +
    `The person stays exactly the same: identical face, identical hair with every ` +
    `loose strand, identical clothing, identical pose, identical lighting on the person. ` +
    `Do not move, rescale or crop the person.`;
  if (attempt === 1) return base;
  if (attempt === 2) return base + ' Keep the hair silhouette crisp and separated against the flat backdrop.';
  return base + ' This is a studio cutout shot; only the backdrop changes, nothing else.';
}

// ── HTTP (Konvention aus generate-lit-variant.cjs) ─────────────────────────
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

/**
 * Matting via fal-ai/birefnet/v2 — MIT explizit gesetzten Parametern.
 *
 * Der bisherige Projekt-Aufruf (utils.removeBackground, props-pipeline-lib.cjs)
 * schickt NUR image_url und faehrt damit auf den fal-Defaults:
 *   model = 'General Use (Light)'   (Salient-Object-Segmentierung, kein Matting)
 *   operating_resolution = '1024x1024'  (Maske klein gerechnet, hochskaliert)
 *   refine_foreground = false           (keine Farb-Decontamination der Kante)
 * Genau diese Kombination erzeugt die weiche, aber straehnenlose Blob-Kante.
 *
 * Gueltige Werte (per 422-Probe ermittelt, scripts/avatars/probe-birefnet.cjs):
 *   model: 'General Use (Light)' | 'General Use (Light 2K)' | 'General Use (Heavy)'
 *        | 'Matting' | 'Portrait' | 'General Use (Dynamic)'
 *   operating_resolution: '1024x1024' | '2048x2048' | '2304x2304'
 */
async function birefnet(falUrl, opts = {}) {
  const payload = {
    image_url: falUrl,
    model: opts.model || 'Matting',
    operating_resolution: opts.resolution || '2048x2048',
    refine_foreground: opts.refine !== false,
    output_format: 'png',
  };
  const r = await fetchJson('https://fal.run/fal-ai/birefnet/v2', payload);
  const url = r?.image?.url || r?.images?.[0]?.url;
  if (!url) throw new Error('birefnet returned no image: ' + JSON.stringify(r).slice(0, 200));
  return download(url);
}

async function kontextEdit(falUrl, prompt, seed) {
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/kontext', {
    image_url: falUrl,
    prompt,
    num_images: 1,
    safety_tolerance: '5',
    output_format: 'png',
    seed,
  });
  const url = r?.images?.[0]?.url;
  if (!url) throw new Error('kontext returned no image: ' + JSON.stringify(r).slice(0, 200));
  return download(url);
}

// ── Bildverarbeitung ───────────────────────────────────────────────────────

/** Alphakanal von alphaSrc auf dst (andere Aufloesung) uebertragen. */
async function transferAlpha(dstBuf, alphaSrcBuf) {
  const meta = await sharp(dstBuf).metadata();
  const alpha = await sharp(alphaSrcBuf).ensureAlpha().extractChannel(3)
    .resize(meta.width, meta.height, { fit: 'fill', kernel: 'lanczos3' })
    .toColourspace('b-w').toBuffer();
  return sharp(dstBuf).removeAlpha().ensureAlpha().joinChannel(alpha).png().toBuffer();
}

/** Masken-IoU zweier Freistellungen, auf gemeinsame Breite normalisiert. */
async function maskIoU(bufA, bufB) {
  const norm = async (b) => sharp(b).ensureAlpha().resize(384, null, { fit: 'inside' })
    .raw().toBuffer({ resolveWithObject: true });
  const a = await norm(bufA); const b = await norm(bufB);
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) return null;
  let inter = 0, union = 0;
  for (let i = 0; i < a.info.width * a.info.height; i++) {
    const va = a.data[i * a.info.channels + 3] > 127;
    const vb = b.data[i * b.info.channels + 3] > 127;
    if (va && vb) inter++;
    if (va || vb) union++;
  }
  return union ? +(inter / union).toFixed(4) : null;
}

/**
 * Interior-Drift: wie stark hat der kontext-Edit die FIGUR veraendert?
 * Beide Bilder auf 256px normalisieren, nur Pixel tief innerhalb der Maske
 * vergleichen. 0 = identisch, > ~12 = sichtbar veraendert (K.-o.-Kriterium).
 */
async function interiorDrift(origBuf, editBuf, maskBuf) {
  const W = 256;
  const n = async (b) => sharp(b).ensureAlpha().resize(W, null, { fit: 'inside' })
    .raw().toBuffer({ resolveWithObject: true });
  const a = await n(origBuf); const b = await n(editBuf); const m = await n(maskBuf);
  const h = Math.min(a.info.height, b.info.height, m.info.height);
  let sum = 0, cnt = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (m.data[i * m.info.channels + 3] < 250) continue;
      const oa = i * a.info.channels, ob = i * b.info.channels;
      sum += (Math.abs(a.data[oa] - b.data[ob])
        + Math.abs(a.data[oa + 1] - b.data[ob + 1])
        + Math.abs(a.data[oa + 2] - b.data[ob + 2])) / 3;
      cnt++;
    }
  }
  return cnt ? +(sum / cnt).toFixed(2) : null;
}

/** Haar-Zoom: quadratischer Ausschnitt um die Kopfpartie (normierte Koords). */
async function hairZoom(buf, z, outPath) {
  const meta = await sharp(buf).metadata();
  const W = meta.width, H = meta.height;
  const size = Math.max(64, Math.round(z.size * W));
  const left = Math.max(0, Math.min(W - size, Math.round(z.cx * W) - Math.round(size / 2)));
  const top = Math.max(0, Math.min(H - size, Math.round(z.top * H)));
  await sharp(buf)
    .extract({ left, top, width: Math.min(size, W - left), height: Math.min(size, H - top) })
    .resize(640, 640, { fit: 'inside' }).png().toFile(outPath);
}

async function webPreview(buf, outPath) {
  await sharp(buf).resize(520, null, { fit: 'inside' }).png({ compressionLevel: 9 }).toFile(outPath);
}

// ── Hauptlauf ──────────────────────────────────────────────────────────────
async function run(id) {
  const cfg = AVATARS[id];
  const bg = cfg[VARIANT];
  if (!bg) throw new Error(`unknown variant ${VARIANT} for ${id}`);
  // Versuch > 1 und abweichender Checkpoint bekommen eigene Dateinamen, damit
  // frühere Versuche zum Vergleich erhalten bleiben.
  const tag = VARIANT + (ATTEMPT > 1 ? `_a${ATTEMPT}` : '') + MODEL_SUFFIX;
  console.log(`\n=== ${id} (variant=${tag}, bg=${bg.hex} "${bg.word}", attempt ${ATTEMPT}) ===`);

  const origBuf = fs.readFileSync(path.join(BASE_DIR, `${id}.png`));
  const origMeta = await sharp(origBuf).metadata();
  console.log(`  original ${origMeta.width}x${origMeta.height}, alpha=${!!origMeta.hasAlpha}`);

  const result = {
    id, name: cfg.name, variant: tag, attempt: ATTEMPT,
    bg: bg.hex, bgWord: bg.word,
    original: { w: origMeta.width, h: origMeta.height, hasAlpha: !!origMeta.hasAlpha },
  };

  console.log('  upload original -> fal storage');
  const origUrl = await uploadPng(origBuf, `${id}_orig.png`);

  // Variante B (Kontrollgruppe): NUR die Matting-Parameter korrigiert, kein
  // kontext-Edit. Zeigt, wieviel der Uni-BG-Zwischenschritt ueberhaupt bringt —
  // und behaelt die native Aufloesung 2048x2880.
  const directPath = path.join(TRANS_DIR, `${id}_direct${MODEL_SUFFIX}.png`);
  let directBuf;
  if (fs.existsSync(directPath)) {
    directBuf = fs.readFileSync(directPath);
    console.log('  direct-matting bereits vorhanden — reuse');
  } else {
    console.log(`  direct matting auf dem Original (${MODEL} @2048, refine_foreground)...`);
    directBuf = await birefnet(origUrl, { model: MODEL });
    fs.writeFileSync(directPath, directBuf);
  }

  // --direct-only: guenstige Checkpoint-Probe ohne kontext-Edit.
  if (DIRECT_ONLY) {
    const d = await A.analyseBuffer(directBuf, `direct ${MODEL}`);
    const zr0 = await A.rawRGBA(directBuf);
    const zb0 = A.bboxOf(zr0);
    const z0 = {
      cx: +((zb0.left + zb0.w / 2) / zb0.canvasW).toFixed(4),
      top: +((zb0.top + zb0.h * 0.01) / zb0.canvasH).toFixed(4),
      size: +((zb0.w * 0.60) / zb0.canvasW).toFixed(4),
    };
    await webPreview(directBuf, path.join(TRANS_DIR, `${id}_direct${MODEL_SUFFIX}_web.png`));
    await hairZoom(directBuf, z0, path.join(TRANS_DIR, `${id}_direct${MODEL_SUFFIX}_zoom.png`));
    console.log(`  [${MODEL}] filamentPct=${d.strandiness.filamentPct} halo=${d.hairEdge.haloDelta} `
      + `softPerEdge=${d.hairEdge.softPerEdge} matteRes=${JSON.stringify(d.matteResolution.rmse.map((v) => v.rmse))}`);
    fs.writeFileSync(path.join(TRANS_DIR, `report_${id}_direct${MODEL_SUFFIX}.json`), JSON.stringify(d, null, 2));
    return d;
  }

  // Schritt 2: kontext Edit -> Uni-BG
  const prompt = buildPrompt(bg.word, ATTEMPT);
  const seed = 480100 + ATTEMPT * 137 + id.length;
  console.log(`  kontext edit (seed ${seed})...`);
  const editBuf = await kontextEdit(origUrl, prompt, seed);
  const editMeta = await sharp(editBuf).metadata();
  fs.writeFileSync(path.join(EDIT_DIR, `${id}_${tag}.png`), editBuf);
  console.log(`  edit ${editMeta.width}x${editMeta.height}`);
  result.edit = { w: editMeta.width, h: editMeta.height, seed, prompt };

  // Schritt 3: Matting auf dem Uni-BG.
  // KEINE manuelle Spill-Decontamination mehr: birefnets refine_foreground macht
  // die Farbtrennung modellseitig. Die manuelle Rechnung F=(C-(1-a)B)/a setzt
  // voraus, dass a eine echte Deckungsgrad-Matte ist — ist sie nicht, und der
  // erste Lauf hat den Saum dadurch um -89 Luminanz uebersteuert (dunkler Rand).
  console.log('  birefnet/v2 matting auf dem Uni-BG (Matting @2048, refine_foreground)...');
  const editUrl = await uploadPng(editBuf, `${id}_${tag}_edit.png`);
  const cleanBuf = await birefnet(editUrl, { model: MODEL });
  fs.writeFileSync(path.join(TRANS_DIR, `${id}_${tag}.png`), cleanBuf);

  // Schritt 5: Full-Res-Transfer auf das Original (kontext liefert kleiner)
  const fullBuf = await transferAlpha(origBuf, cleanBuf);
  fs.writeFileSync(path.join(TRANS_DIR, `${id}_${tag}_fullres.png`), fullBuf);

  // Schritt 6: Metriken
  console.log('  Metriken...');
  result.direct = await A.analyseBuffer(directBuf, 'neu B: direktes Matting aufs Original (2048x2880)');
  result.new = await A.analyseBuffer(cleanBuf, 'neu C: kontext Uni-BG + Matting');
  result.newFullres = await A.analyseBuffer(fullBuf, 'neu C-fullres: Maske aus C aufs Original');
  result.interiorDrift = await interiorDrift(origBuf, editBuf, cleanBuf);

  let zoomRef = cleanBuf;
  const curPath = cfg.currentCutout ? path.join(BASE_DIR, cfg.currentCutout) : null;
  if (curPath && fs.existsSync(curPath)) {
    const curBuf = fs.readFileSync(curPath);
    result.current = await A.analyseBuffer(curBuf, `bisherige Freistellung (${cfg.currentCutout})`);
    result.current.file = cfg.currentCutout;
    result.maskIoUvsCurrent = await maskIoU(curBuf, cleanBuf);
    zoomRef = curBuf;
  } else {
    result.current = null;
  }

  // Haar-Zoom-Fenster: aus der BBox der Referenz-Freistellung
  const zr = await A.rawRGBA(zoomRef);
  const zb = A.bboxOf(zr);
  const z = {
    cx: +((zb.left + zb.w / 2) / zb.canvasW).toFixed(4),
    top: +((zb.top + zb.h * 0.01) / zb.canvasH).toFixed(4),
    size: +((zb.w * 0.60) / zb.canvasW).toFixed(4),
  };
  result.zoom = z;

  // Schritt 7: Previews + Zooms
  await webPreview(origBuf, path.join(TRANS_DIR, `${id}_orig_web.png`));
  await webPreview(editBuf, path.join(EDIT_DIR, `${id}_${tag}_web.png`));
  await webPreview(directBuf, path.join(TRANS_DIR, `${id}_direct${MODEL_SUFFIX}_web.png`));
  await webPreview(cleanBuf, path.join(TRANS_DIR, `${id}_${tag}_web.png`));
  await webPreview(fullBuf, path.join(TRANS_DIR, `${id}_${tag}_fullres_web.png`));
  await hairZoom(origBuf, z, path.join(TRANS_DIR, `${id}_orig_zoom.png`));
  await hairZoom(editBuf, z, path.join(EDIT_DIR, `${id}_${tag}_zoom.png`));
  await hairZoom(directBuf, z, path.join(TRANS_DIR, `${id}_direct${MODEL_SUFFIX}_zoom.png`));
  await hairZoom(cleanBuf, z, path.join(TRANS_DIR, `${id}_${tag}_zoom.png`));
  await hairZoom(fullBuf, z, path.join(TRANS_DIR, `${id}_${tag}_fullres_zoom.png`));
  if (curPath && fs.existsSync(curPath)) {
    const curBuf = fs.readFileSync(curPath);
    await webPreview(curBuf, path.join(TRANS_DIR, `${id}_current_web.png`));
    await hairZoom(curBuf, z, path.join(TRANS_DIR, `${id}_current_zoom.png`));
  }

  const rs = (x) => x ? x.matteResolution.rmse.map((v) => v.rmse) : null;
  console.log('  filamentPct  current=' + (result.current?.strandiness.filamentPct ?? 'n/a')
    + '  direct=' + result.direct.strandiness.filamentPct
    + '  kontext=' + result.new.strandiness.filamentPct);
  console.log('  haloDelta    current=' + (result.current?.hairEdge.haloDelta ?? 'n/a')
    + '  direct=' + result.direct.hairEdge.haloDelta
    + '  kontext=' + result.new.hairEdge.haloDelta);
  console.log('  matteRes k=[2,4,8,16,32]  current=' + JSON.stringify(rs(result.current))
    + '  direct=' + JSON.stringify(rs(result.direct))
    + '  kontext=' + JSON.stringify(rs(result.new)));
  console.log('  iou(vs current)=' + result.maskIoUvsCurrent + '  interiorDrift(kontext)=' + result.interiorDrift);

  fs.writeFileSync(path.join(TRANS_DIR, `report_${id}_${tag}.json`), JSON.stringify(result, null, 2));
  return result;
}

(async () => {
  const ids = ONLY ? [ONLY] : Object.keys(AVATARS);
  for (const id of ids) {
    if (!AVATARS[id]) { console.error(`unknown avatar ${id}`); process.exit(1); }
    try { await run(id); }
    catch (e) { console.error(`  FAILED ${id}: ${e.message}`); process.exitCode = 1; }
  }
})();
