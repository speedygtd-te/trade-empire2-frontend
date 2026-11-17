/**
 * STYLE-TEST ONLY (NO integration, NO writes to src/, NO cap sync, NO git):
 * beach-Tile FARB-TWEAK auf dem Hero beach_even_t1.png.
 *
 * Rudi hat beach_even_t1.png gewählt (dunkler, gleichmäßiger nasser Strand-Sand,
 * KEIN Hell/Dunkel-Verlauf), will ihn aber ETWAS HELLER, GELBER, BRÄUNLICHER
 * (mehr Sandfarbe rein) — aber NICHT knallig-orange, sondern entsättigt-erdiger
 * Sand. Die Helligkeits-GLEICHMÄSSIGKEIT (kein Hell/Dunkel-Verlauf) MUSS bleiben.
 *
 * Quelle: assets/style-test/tiles/beach_even_t1.png  (512x256, RGBA, Diamond-Maske
 *   bereits gebacken). WIRD NICHT ÜBERSCHRIEBEN — alle Outputs in NEUE Dateien.
 *
 * Weg A — sharp Farbtweak (deterministisch, behält Textur exakt):
 *   3 Stärken (leicht / mittel / stärker) heller+wärmer per .modulate() +
 *   warmer Sandbraun-Tönung via linear-Recombination (R/G dezent anheben,
 *   B leicht absenken) statt knallendem .tint(). Diamond-Alpha bleibt erhalten.
 *   Output: beach_warm_sharp_l/_m/_s.png (+ _half, _mosaic).
 *
 * Weg B — FLUX Kontext Edit (fal-ai/flux-pro/kontext) auf beach_even_t1.png:
 *   "make the sand lighter and warmer, a more yellow-brown sandy beach tone,
 *    keep the texture / pebbles / composition identical, keep perfectly even
 *    flat brightness with NO light/dark gradient".  2 Stärken (subtil / stärker
 *    via guidance + Prompt-Wortwahl). Nach dem Edit: 2D-Helligkeits-Egalisierung
 *    (8x8-Zonen, identisch zu beach-even-variants.cjs) — falls FLUX einen Verlauf
 *    einführt, raus damit. Danach Diamond-Maske neu.
 *   Output: beach_warm_flux_1/_2.png (+ _half, _mosaic).
 *
 * HTML: beach-warm-style-test.html — oben beach_even_t1 als Referenz, dann die
 *   3 sharp-Stärken + 2 flux-Versionen je als 3x3-Mosaik + Einzelbild.
 *
 * Usage: node scripts/beach-warm-variants.cjs
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
const FAL_API_KEY = process.env.FAL_AI_API_KEY || process.env.FAL_API_KEY;
const https = require('https');
const http = require('http');
const sharp = require('sharp');

const TILE_W = 512, TILE_H = 256;
const OUT = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');
const SRC = path.join(OUT, 'beach_even_t1.png');

const DIAMOND_MASK_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}">
    <polygon points="${TILE_W / 2},0 ${TILE_W},${TILE_H / 2} ${TILE_W / 2},${TILE_H} 0,${TILE_H / 2}" fill="white"/>
  </svg>`
);

// ---------------- net helpers (verbatim from beach-even-variants.cjs) ----------------
function fetchJson(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = JSON.stringify(body);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: parsed.hostname, port: parsed.port,
      path: parsed.pathname + parsed.search, method: 'POST',
      headers: { 'Authorization': `Key ${FAL_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        if (res.statusCode >= 400) { reject(new Error(`fal ${res.statusCode}: ${raw.slice(0, 400)}`)); return; }
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('bad json ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject); req.write(payload); req.end();
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

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// 2D zone equalization (verbatim logic from beach-even-variants.cjs). Operates on
// a SQUARE-or-rect RGB buffer; pulls every zone to the global mean. We run it on
// the RGB of the FLUX edit (alpha-stripped) before re-masking, so a sneaked-in
// gradient gets flattened. Diamond corners are NOT yet transparent at this point
// (we feed the full rectangle), which is acceptable here because the tile content
// fills the whole rect (kontext edits the whole image edge-to-edge).
async function equalize2D(buf, G = 8) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const sum = new Float64Array(G * G), cnt = new Float64Array(G * G);
  for (let y = 0; y < height; y++) {
    const gy = Math.min(G - 1, Math.floor((y / height) * G));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(G - 1, Math.floor((x / width) * G));
      const i = (y * width + x) * channels, zi = gy * G + gx;
      sum[zi] += luma(data[i], data[i + 1], data[i + 2]); cnt[zi] += 1;
    }
  }
  const means = new Float64Array(G * G); let gsum = 0;
  for (let z = 0; z < G * G; z++) { means[z] = cnt[z] ? sum[z] / cnt[z] : 0; gsum += means[z]; }
  const global = gsum / (G * G);
  const deficit = new Float64Array(G * G);
  for (let z = 0; z < G * G; z++) deficit[z] = global - means[z];
  const cellW = width / G, cellH = height / G;
  const out = Buffer.from(data);
  for (let y = 0; y < height; y++) {
    const fy = (y + 0.5) / cellH - 0.5;
    const y0 = Math.max(0, Math.min(G - 1, Math.floor(fy)));
    const y1 = Math.max(0, Math.min(G - 1, y0 + 1));
    const ty = Math.max(0, Math.min(1, fy - y0));
    for (let x = 0; x < width; x++) {
      const fx = (x + 0.5) / cellW - 0.5;
      const x0 = Math.max(0, Math.min(G - 1, Math.floor(fx)));
      const x1 = Math.max(0, Math.min(G - 1, x0 + 1));
      const tx = Math.max(0, Math.min(1, fx - x0));
      const d00 = deficit[y0 * G + x0], d01 = deficit[y0 * G + x1];
      const d10 = deficit[y1 * G + x0], d11 = deficit[y1 * G + x1];
      const dTop = d00 + (d01 - d00) * tx;
      const dBot = d10 + (d11 - d10) * tx;
      const delta = dTop + (dBot - dTop) * ty;
      const i = (y * width + x) * channels;
      for (let c = 0; c < channels; c++) {
        const v = data[i + c] + delta;
        out[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
  return sharp(out, { raw: { width, height, channels } }).png().toBuffer();
}

// Uniformity stats over the DIAMOND-VISIBLE pixels only (alpha > 0), so the
// transparent corners don't poison the means. Reports L/R, T/B, corner spread.
async function uniformityStats(maskedBuf) {
  const { data, info } = await sharp(maskedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let L = 0, R = 0, T = 0, B = 0, nL = 0, nR = 0, nT = 0, nB = 0;
  const q = [0, 0, 0, 0], nq = [0, 0, 0, 0];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (channels === 4 && data[i + 3] < 8) continue; // skip transparent corner
      const l = luma(data[i], data[i + 1], data[i + 2]);
      if (x < width / 2) { L += l; nL++; } else { R += l; nR++; }
      if (y < height / 2) { T += l; nT++; } else { B += l; nB++; }
      const qi = (y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1);
      q[qi] += l; nq[qi]++;
    }
  }
  const lh = L / nL, rh = R / nR, th = T / nT, bh = B / nB;
  const qm = q.map((s, k) => s / nq[k]);
  const cornerSpread = Math.max(...qm) - Math.min(...qm);
  return {
    lr: Math.abs(lh - rh), tb: Math.abs(th - bh), cornerSpread,
    worst: Math.max(Math.abs(lh - rh), Math.abs(th - bh), cornerSpread),
  };
}

// Mean R/G/B + luma over diamond-visible pixels (warmth / brightness comparison).
async function colorStats(maskedBuf) {
  const { data, info } = await sharp(maskedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (data[i + 3] < 8) continue;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  r /= n; g /= n; b /= n;
  return { r, g, b, luma: luma(r, g, b), warmth: r - b };
}

// 3x3 overlap-packed interlocking diamond mosaic (verbatim from beach-even-variants).
async function mosaic(maskedBuf, outPath) {
  const HW = TILE_W / 2, HH = TILE_H / 2;
  const place = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) place.push({ cx: (c - r) * HW, cy: (c + r) * HH });
  const minX = Math.min(...place.map(p => p.cx));
  const maxX = Math.max(...place.map(p => p.cx));
  const maxY = Math.max(...place.map(p => p.cy));
  const canvasW = (maxX - minX) + TILE_W;
  const canvasH = maxY + TILE_H;
  const comp = place.map(p => ({ input: maskedBuf, left: p.cx - minX, top: p.cy }));
  const out = await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 } } })
    .composite(comp).png().toBuffer();
  fs.writeFileSync(outPath, out);
}

// Write masked tile + half + mosaic.
async function saveAll(maskedBuf, name) {
  fs.writeFileSync(path.join(OUT, `${name}.png`), maskedBuf);
  const half = await sharp(maskedBuf).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `${name}_half.png`), half);
  await mosaic(maskedBuf, path.join(OUT, `${name}_mosaic.png`));
  console.log(`[save] ${name}.png (+ _half, _mosaic)`);
}

// Re-apply the diamond alpha mask to an RGB(A) rectangle.
async function applyDiamond(rgbBuf) {
  const resized = await sharp(rgbBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha().png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  return sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

// ---------------- Weg A: sharp deterministic warm tweak ----------------
// We keep the existing diamond alpha, only re-colour the RGB. The warm shift is
// done with .modulate (brightness + saturation) followed by a per-channel linear
// recombination that lifts R & G a touch and trims B (yellow-brown), so it reads
// as warmer/sandier WITHOUT a flat orange .tint() overlay (which would kill the
// grain and look knallig). Brightness scaling is multiplicative & uniform across
// the tile, so the even-brightness property is preserved exactly.
const SHARP_STEPS = [
  { sfx: 'l', title: 'Weg A — sharp leicht (heller+wärmer)',   bright: 1.12, sat: 1.15, rMul: 1.07, gMul: 1.03, bMul: 0.93 },
  { sfx: 'm', title: 'Weg A — sharp mittel (heller+wärmer)',   bright: 1.20, sat: 1.25, rMul: 1.11, gMul: 1.05, bMul: 0.89 },
  { sfx: 's', title: 'Weg A — sharp stärker (heller+wärmer)',  bright: 1.28, sat: 1.35, rMul: 1.16, gMul: 1.07, bMul: 0.85 },
];

async function sharpWarm(step) {
  // Split RGB from the original diamond alpha so the mask is untouched.
  const srcAlpha = await sharp(SRC).ensureAlpha().extractChannel('alpha').toColourspace('b-w').png().toBuffer();
  // modulate brightness + saturation (uniform multiplicative -> keeps even brightness)
  let rgb = await sharp(SRC).removeAlpha()
    .modulate({ brightness: step.bright, saturation: step.sat })
    .raw().toBuffer({ resolveWithObject: true });
  const { data, info } = rgb;
  const { width, height, channels } = info;
  const out = Buffer.from(data);
  for (let i = 0; i < data.length; i += channels) {
    let r = data[i] * step.rMul;
    let g = data[i + 1] * step.gMul;
    let b = data[i + 2] * step.bMul;
    out[i] = r > 255 ? 255 : r;
    out[i + 1] = g > 255 ? 255 : g;
    out[i + 2] = b > 255 ? 255 : b;
  }
  const warmedRgb = await sharp(out, { raw: { width, height, channels } }).png().toBuffer();
  // re-attach the original diamond alpha (no re-mask -> identical mask edges)
  const masked = await sharp(warmedRgb).ensureAlpha()
    .joinChannel(srcAlpha).png().toBuffer();
  return masked;
}

// ---------------- Weg B: FLUX Kontext edit ----------------
const KONTEXT_BASE = 'make the sand lighter and warmer, a more yellow-brown sandy beach tone, keep the texture, pebbles and composition identical, keep perfectly even flat brightness with NO light/dark gradient, no orange neon, keep it an earthy desaturated natural sandy beach, no people, no plants, no water';
const KONTEXT_STEPS = [
  { sfx: '1', title: 'Weg B — FLUX Kontext subtil', prompt: `subtly ${KONTEXT_BASE}`, guidance: 2.5, seed: 90110 },
  { sfx: '2', title: 'Weg B — FLUX Kontext stärker', prompt: `clearly noticeably ${KONTEXT_BASE}`, guidance: 4.0, seed: 91230 },
];

async function fluxKontext(step) {
  // feed the masked tile as a data URI; kontext sees the diamond (corners are
  // transparent->rendered as is). We edit, then equalize the RGB, then re-mask.
  const srcBuf = fs.readFileSync(SRC);
  const dataUri = `data:image/png;base64,${srcBuf.toString('base64')}`;
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/kontext', {
    image_url: dataUri,
    prompt: step.prompt,
    guidance_scale: step.guidance,
    num_images: 1,
    safety_tolerance: '5',
    seed: step.seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no kontext image url: ' + JSON.stringify(r).slice(0, 200));
  const raw = await download(url);
  // equalize on the full edited rectangle (alpha stripped), then re-mask diamond
  const rect = await sharp(raw).resize(TILE_W, TILE_H, { fit: 'fill' }).png().toBuffer();
  const eq = await equalize2D(rect, 8);
  return applyDiamond(eq);
}

const fmtU = (s) => `L/R ${s.lr.toFixed(1)} T/B ${s.tb.toFixed(1)} corners ${s.cornerSpread.toFixed(1)} worst ${s.worst.toFixed(1)}`;
const fmtC = (c) => `R${c.r.toFixed(0)} G${c.g.toFixed(0)} B${c.b.toFixed(0)} luma${c.luma.toFixed(1)} warmth(R-B)${c.warmth.toFixed(1)}`;
const report = [];

(async () => {
  if (!fs.existsSync(SRC)) { console.error('source missing: ' + SRC); process.exit(1); }
  // reference stats
  const refU = await uniformityStats(SRC);
  const refC = await colorStats(SRC);
  console.log(`REF beach_even_t1:  uniform[${fmtU(refU)}]  color[${fmtC(refC)}]`);
  report.push({ name: 'beach_even_t1 (REF)', uniform: refU, color: refC });

  // ---- Weg A: sharp ----
  console.log('=== Weg A: sharp deterministic warm tweak ===');
  for (const step of SHARP_STEPS) {
    const name = `beach_warm_sharp_${step.sfx}`;
    const masked = await sharpWarm(step);
    await saveAll(masked, name);
    const u = await uniformityStats(masked);
    const c = await colorStats(masked);
    console.log(`   ${name}: uniform[${fmtU(u)}]  color[${fmtC(c)}]`);
    report.push({ name, title: step.title, uniform: u, color: c });
  }

  // ---- Weg B: FLUX Kontext ----
  if (!FAL_API_KEY) {
    console.error('No fal key — skipping Weg B (FLUX Kontext).');
  } else {
    console.log('=== Weg B: FLUX Kontext edit ===');
    for (const step of KONTEXT_STEPS) {
      const name = `beach_warm_flux_${step.sfx}`;
      try {
        const masked = await fluxKontext(step);
        await saveAll(masked, name);
        const u = await uniformityStats(masked);
        const c = await colorStats(masked);
        console.log(`   ${name}: uniform[${fmtU(u)}]  color[${fmtC(c)}]`);
        report.push({ name, title: step.title, uniform: u, color: c });
      } catch (e) { console.error(`ERR ${name}: ${e.message}`); report.push({ name, title: step.title, error: e.message }); }
    }
  }

  writeHtml();
  fs.writeFileSync(path.join(OUT, 'beach-warm-metrics.json'), JSON.stringify(report, null, 2));
  console.log('\n=== SUMMARY ===');
  for (const r of report) {
    if (r.error) { console.log(`  ${r.name}: ERROR ${r.error}`); continue; }
    console.log(`  ${r.name}: warmth(R-B) ${r.color.warmth.toFixed(1)} luma ${r.color.luma.toFixed(1)} | even worst ${r.uniform.worst.toFixed(1)}`);
  }
  console.log('done');
})();

function writeHtml() {
  const section = (name, title) => `
<section>
  <h2>${title}</h2>
  <div class="row">
    <div class="mosaic">
      <div class="caption">3×3 Iso-Mosaik (Naht + Hell/Dunkel-Check)</div>
      <img src="${name}_mosaic.png" alt="${name} Mosaik">
    </div>
    <div class="single">
      <div class="caption">Einzel-Raute</div>
      <img src="${name}_half.png" alt="${name} Einzel">
    </div>
  </div>
</section>`;

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Beach WARM Style-Test — heller / gelber / bräunlicher (auf beach_even_t1)</title>
<style>
  :root { --w: 256; --h: 128; }
  body { margin: 0; background: #030712; color: #d6dae0; font-family: system-ui, sans-serif; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 0 0 8px; color: #9fb0c3; }
  p.note { margin: 0 0 20px; color: #8893a0; font-size: 13px; max-width: 880px; }
  section { margin-bottom: 40px; padding-bottom: 24px; border-bottom: 1px solid #1a2230; }
  section.ref-sec { border-bottom: 2px solid #2a3a4f; }
  .row { display: flex; gap: 48px; align-items: flex-start; flex-wrap: wrap; }
  .caption { font-size: 12px; color: #8893a0; margin-bottom: 6px; text-align: left; }
  .mosaic img { display: block; image-rendering: auto; max-width: 100%; }
  .single img, .ref img { width: calc(var(--w) * 1px); height: calc(var(--h) * 1px); display: block; }
</style>
</head>
<body>
<h1>Beach WARM Style-Test — etwas heller, gelber, bräunlicher</h1>
<p class="note">
  Ausgangspunkt ist der von Rudi gewählte Hero <b>beach_even_t1</b> (dunkler, gleichmäßiger nasser
  Strand-Sand, kein Hell/Dunkel-Verlauf). Ziel: etwas heller, gelber, bräunlicher — mehr Sandfarbe rein,
  aber NICHT knallig-orange, sondern entsättigt-erdig. Die gleichmäßige Helligkeit (kein Verlauf) muss
  erhalten bleiben. <b>Weg A</b> = deterministischer sharp-Farbtweak (Textur exakt erhalten), 3 Stärken.
  <b>Weg B</b> = FLUX-Kontext-Edit + 2D-Helligkeits-Egalisierung danach, 2 Stärken. KEINE Integration in src/.
</p>

<section class="ref-sec">
  <h2>Referenz — beach_even_t1 (Ausgangspunkt, unverändert)</h2>
  <div class="row">
    <div class="ref">
      <div class="caption">beach_even_t1_half.png</div>
      <img src="beach_even_t1_half.png" alt="beach_even_t1 Referenz">
    </div>
    <div class="mosaic">
      <div class="caption">beach_even_t1 3×3 Iso-Mosaik</div>
      <img src="beach_even_t1_mosaic.png" alt="beach_even_t1 Mosaik">
    </div>
  </div>
</section>

${section('beach_warm_sharp_l', 'Weg A — sharp leicht (heller + wärmer)')}
${section('beach_warm_sharp_m', 'Weg A — sharp mittel (heller + wärmer)')}
${section('beach_warm_sharp_s', 'Weg A — sharp stärker (heller + wärmer)')}
${section('beach_warm_flux_1', 'Weg B — FLUX Kontext subtil (egalisiert)')}
${section('beach_warm_flux_2', 'Weg B — FLUX Kontext stärker (egalisiert)')}
</body>
</html>`;
  fs.writeFileSync(path.join(OUT, 'beach-warm-style-test.html'), html);
  console.log('[html] beach-warm-style-test.html');
}
