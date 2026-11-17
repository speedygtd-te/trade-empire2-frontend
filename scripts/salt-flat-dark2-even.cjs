/**
 * STYLE-TEST ONLY (NO integration, NO writes to src/, NO cap sync, NO git):
 * Regenerate the salt_flat base in the approved salt_flat_dark LOOK, but with the
 * annoying VERTICAL brightness gradient removed.
 *
 * Rudi's complaint about the current salt_flat_dark.png: the colours/crack look are
 * right (dark dirty weathered grey, grimy-greyish salt pan, polygonal dried-crust
 * cracks, desaturated, NOT brilliant white, no blue) but flux baked in a vertical
 * light-top/dark-bottom (or vice-versa) gradient that has to go.
 *
 * Two layers of anti-gradient:
 *   (1) prompt-side anti-gradient wording (verbatim COMMON from
 *       style-test-tile-salt-flat.cjs dark level);
 *   (2) POST-GEN vertical equalization: measure mean luma PER ROW over the 512x512
 *       SQUARE (pre-mask, so transparent diamond corners don't poison the means),
 *       additively pull every row's mean to the global mean (smoothed row-deficit
 *       curve). This is the row-wise vertical-gradient correction (the v3 gradient
 *       fix / beach floor-variant pattern), 1D vertical only.
 *
 * Pipeline (verbatim resize/mask from style-test-tile-salt-flat.cjs):
 *   flux-pro v1.1 @512x512 top-down (3 seeds, dark prompt) -> vertical equalize on
 *   square -> resize 512x256 (fill, iso squish) -> diamond mask (alpha)
 *   BEST = smallest top-half-vs-bottom-half luma diff after equalization (target <5).
 *
 * Outputs (assets/style-test/tiles/ ONLY):
 *   salt_flat_dark2.png   (+ _half, _mosaic)  = recommended best
 *   salt_flat_dark2_b.png (+ _half, _mosaic)  = 2nd candidate
 *   salt_flat_dark2_c.png (+ _half, _mosaic)  = 3rd candidate
 *   salt-flat-dark2-style-test.html
 *   salt-flat-dark2-metrics.json
 *
 * Usage: node scripts/salt-flat-dark2-even.cjs
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
if (!FAL_API_KEY) { console.error('No fal key'); process.exit(1); }
const https = require('https');
const http = require('http');
const sharp = require('sharp');

const TILE_W = 512, TILE_H = 256, GEN_SIZE = 512;
const OUT = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');

// --- Prompt: verbatim from style-test-tile-salt-flat.cjs (dark level) ---
const PREFIX = 'top-down aerial photograph, terrain texture filling entire image edge to edge, no sky, no horizon, no borders, no vignette, The Expanse sci-fi aesthetic, realistic';
const COMMON = 'seamless tileable, edge-to-edge, evenly distributed polygonal salt crust crack pattern across the ENTIRE surface including the center, dried mud-crack polygons of fairly uniform size covering the whole image, the middle is just as cracked as the edges, no large central crack, no dominant central crack, no central feature, no ring of cracks at the edges, no diagonal bands, no diagonal crack lines, no visible seams or hotspots, fairly flat top-down ground, not deep 3D relief, no deep shadows, shallow surface cracks only, uniform overall brightness, perfectly even uniform lighting, no light side, no dark side, no gradient, no vertical gradient, no horizontal gradient, no single bright patch, no bright highlight blob, NOT brilliant white, no pure white, no vivid blue, no bright blue cracks, no water, no sand dunes, no grass, no plants, heavily desaturated, dirty, grimy, dim, muted greyish-beige dirty salt palette';
const PROMPT = `${PREFIX}, dark dirty grey salt flat crust from directly above, muddy stained dried polygons densely and evenly filling the entire frame including the center, grimy ominous dim, heavily desaturated weathered, fairly flat ground, ${COMMON}`;

// 3 fresh seeds (kept clear of the style-test seed 61902 and its +137 re-roll).
const SEEDS = [33107, 44218, 55329];

const DIAMOND_MASK_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}">
    <polygon points="${TILE_W / 2},0 ${TILE_W},${TILE_H / 2} ${TILE_W / 2},${TILE_H} 0,${TILE_H / 2}" fill="white"/>
  </svg>`
);

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

// Per-row mean luma over a SQUARE RGB buffer + global mean.
function rowMeans(data, width, height, channels) {
  const means = new Float64Array(height);
  let gsum = 0;
  for (let y = 0; y < height; y++) {
    let s = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      s += luma(data[i], data[i + 1], data[i + 2]);
    }
    means[y] = s / width;
    gsum += means[y];
  }
  return { means, global: gsum / height };
}

// Vertical (row-wise) equalization on a SQUARE buffer. Compute per-row deficit
// (global - rowMean), smooth it with a moving average so we only kill the broad
// vertical gradient (not legit per-row texture), then add the row deficit to every
// pixel in that row across all channels. 1D vertical generalization of the 2D
// beach equalizer.
async function equalizeVertical(squareBuf, smoothRadius = 12) {
  const { data, info } = await sharp(squareBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const { means, global } = rowMeans(data, width, height, channels);
  const rawDeficit = new Float64Array(height);
  for (let y = 0; y < height; y++) rawDeficit[y] = global - means[y];
  // moving-average smooth of the deficit curve
  const deficit = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    let s = 0, n = 0;
    for (let k = -smoothRadius; k <= smoothRadius; k++) {
      const yy = y + k;
      if (yy < 0 || yy >= height) continue;
      s += rawDeficit[yy]; n++;
    }
    deficit[y] = s / n;
  }
  const out = Buffer.from(data);
  for (let y = 0; y < height; y++) {
    const d = deficit[y];
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      for (let c = 0; c < channels; c++) {
        const v = data[i + c] + d;
        out[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
  return sharp(out, { raw: { width, height, channels } }).png().toBuffer();
}

// Vertical-gradient stats on a SQUARE buffer (pre-mask): top-half vs bottom-half
// mean luma diff (the metric Rudi cares about), plus 4-band vertical spread.
async function vstats(squareBuf) {
  const { data, info } = await sharp(squareBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let T = 0, B = 0, nT = 0, nB = 0;
  const band = [0, 0, 0, 0], nb = [0, 0, 0, 0];
  for (let y = 0; y < height; y++) {
    const bi = Math.min(3, Math.floor((y / height) * 4));
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const l = luma(data[i], data[i + 1], data[i + 2]);
      if (y < height / 2) { T += l; nT++; } else { B += l; nB++; }
      band[bi] += l; nb[bi]++;
    }
  }
  const th = T / nT, bh = B / nB;
  const bands = band.map((s, k) => s / nb[k]);
  return {
    topBottom: Math.abs(th - bh),
    bandSpread: Math.max(...bands) - Math.min(...bands),
    detail: { topHalf: th, bottomHalf: bh, bands },
  };
}

// Square -> resize 512x256 -> diamond mask. Writes full + half + mosaic.
async function finalize(squareBuf, name) {
  const resized = await sharp(squareBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `${name}.png`), masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `${name}_half.png`), half);
  await mosaic(masked, path.join(OUT, `${name}_mosaic.png`));
  console.log(`[save] ${name}.png (+ _half, _mosaic)`);
}

// 3x3 overlap-packed interlocking diamond mosaic (seam + light/dark inspection).
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

async function genFluxPro(seed) {
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/v1.1', {
    prompt: PROMPT, image_size: { width: GEN_SIZE, height: GEN_SIZE },
    num_images: 1, enable_safety_checker: false, seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no image url for seed ' + seed);
  return download(url);
}

const fmt = (s) => `top/bottom ${s.topBottom.toFixed(1)}  4-band spread ${s.bandSpread.toFixed(1)}`;
const report = [];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  console.log('=== SALT_FLAT dark2 — generate 3 seeds, vertical-equalize, rank ===');
  const cands = [];
  for (const seed of SEEDS) {
    try {
      console.log(`[gen] seed ${seed}`);
      const raw = await genFluxPro(seed);
      const square = await sharp(raw).resize(GEN_SIZE, GEN_SIZE, { fit: 'fill' }).removeAlpha().png().toBuffer();
      const before = await vstats(square);
      const eq = await equalizeVertical(square, 12);
      const after = await vstats(eq);
      console.log(`   seed ${seed}: before [${fmt(before)}]  ->  after [${fmt(after)}]`);
      cands.push({ seed, squareEq: eq, before, after });
      report.push({ kind: 'candidate', seed, before, after });
    } catch (e) { console.error(`ERR seed ${seed}: ${e.message}`); }
  }
  if (!cands.length) { console.error('No candidate succeeded'); process.exit(1); }

  // Rank by smallest top/bottom diff after equalization (Rudi's target <~5).
  cands.sort((a, b) => a.after.topBottom - b.after.topBottom);
  // After equalization ALL candidates are essentially flat (<1), so the vertical
  // gradient is no longer the discriminator. The visual pick (even polygonal crack
  // distribution, no dominant central crack, dark cracks NOT bright white) is best
  // on seed 55329 — promote it to the primary slot if present. Override via
  // BEST_SEED env if a different visual pick is wanted.
  const bestSeed = Number(process.env.BEST_SEED || 55329);
  cands.sort((a, b) => (b.seed === bestSeed ? 1 : 0) - (a.seed === bestSeed ? 1 : 0));
  const names = ['salt_flat_dark2', 'salt_flat_dark2_b', 'salt_flat_dark2_c'];
  for (let i = 0; i < cands.length; i++) {
    await finalize(cands[i].squareEq, names[i]);
    report.push({ kind: names[i], seed: cands[i].seed, before: cands[i].before, after: cands[i].after });
  }
  console.log(`>>> RECOMMENDED = seed ${cands[0].seed} (top/bottom ${cands[0].after.topBottom.toFixed(1)} after eq) -> salt_flat_dark2`);

  writeHtml(cands, names);
  fs.writeFileSync(path.join(OUT, 'salt-flat-dark2-metrics.json'), JSON.stringify(report, null, 2));
  console.log('\n=== METRICS SUMMARY (top-vs-bottom luma diff, lower = flatter) ===');
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    console.log(`  ${names[i]} (seed ${c.seed}): before [${fmt(c.before)}] -> after [${fmt(c.after)}]`);
  }
  console.log('done');
})();

function writeHtml(cands, names) {
  const labels = cands.map((c, i) => ({
    name: names[i], seed: c.seed,
    before: c.before, after: c.after,
    rec: i === 0,
  }));
  const candSection = (l) => `
<section>
  <h2>${l.rec ? 'EMPFOHLEN — ' : ''}${l.name} (seed ${l.seed})</h2>
  <p class="metric">
    vertikaler Verlauf (oben/unten Luminanz-Differenz):
    <b>vorher ${l.before.topBottom.toFixed(1)}</b> → <b>nachher ${l.after.topBottom.toFixed(1)}</b>
    &nbsp;|&nbsp; 4-Band-Spread: vorher ${l.before.bandSpread.toFixed(1)} → nachher ${l.after.bandSpread.toFixed(1)}
    &nbsp;|&nbsp; obere Hälfte ${l.after.detail.topHalf.toFixed(1)} / untere Hälfte ${l.after.detail.bottomHalf.toFixed(1)}
  </p>
  <div class="row">
    <div class="mosaic">
      <div class="caption">3×3 Iso-Mosaik (Naht + Verlauf/Hell-Dunkel-Check)</div>
      <img src="${l.name}_mosaic.png" alt="${l.name} Mosaik">
    </div>
    <div class="single">
      <div class="caption">Einzel-Raute</div>
      <img src="${l.name}_half.png" alt="${l.name} Einzel">
    </div>
  </div>
</section>`;

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>salt_flat dark2 — Verlauf entfernt (salt_flat_dark-Look)</title>
<style>
  :root { --w: 256; --h: 128; }
  body { margin: 0; background: #030712; color: #d6dae0; font-family: system-ui, sans-serif; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 0 0 8px; color: #9fb0c3; }
  p.note { margin: 0 0 20px; color: #8893a0; font-size: 13px; max-width: 880px; }
  p.metric { margin: 0 0 10px; color: #b7c2cf; font-size: 13px; }
  p.metric b { color: #e8edf3; }
  section { margin-bottom: 40px; padding-bottom: 24px; border-bottom: 1px solid #1a2230; }
  .row { display: flex; gap: 48px; align-items: flex-start; flex-wrap: wrap; }
  .caption { font-size: 12px; color: #8893a0; margin-bottom: 6px; text-align: left; }
  .mosaic img { display: block; image-rendering: auto; max-width: 100%; }
  .single img, .ref img { width: calc(var(--w) * 1px); height: calc(var(--h) * 1px); display: block; }
</style>
</head>
<body>
<h1>salt_flat dark2 — vertikaler Verlauf entfernt</h1>
<p class="note">
  Gleicher Look wie das bestehende salt_flat_dark (mittel-dunkles verwittertes Grau, schmutzig-gräuliche
  Salzpfanne, polygonale Trockenriss-Krusten, entsättigt, NICHT strahlend weiß, kein Blau), aber NEU mit
  deutlich reduziertem vertikalem Hell-Dunkel-Verlauf. flux baut den Verlauf oft trotzdem ein, daher eine
  zusätzliche zeilenweise vertikale Helligkeits-Egalisierung NACH der Generierung (per-Row-Luminanz auf den
  Gesamt-Mittelwert ziehen, additiv, geglättet — gemessen auf dem 512×512-Quadrat VOR der Diamond-Maske).
  Oben das alte salt_flat_dark zum Vergleich (mit sichtbarem Verlauf), darunter die neuen Kandidaten je als
  3×3-Iso-Mosaik + Einzel-Raute mit Luminanz-Messwerten. KEINE Integration in src/.
</p>

<section>
  <h2>Referenz — altes salt_flat_dark (Look ok, aber vertikaler Verlauf)</h2>
  <div class="row">
    <div class="ref">
      <div class="caption">salt_flat_dark_half.png</div>
      <img src="salt_flat_dark_half.png" alt="salt_flat_dark Referenz">
    </div>
    <div class="mosaic">
      <div class="caption">salt_flat_dark 3×3 Iso-Mosaik</div>
      <img src="salt_flat_dark_mosaic.png" alt="salt_flat_dark Mosaik">
    </div>
  </div>
</section>

${labels.map(candSection).join('\n')}
</body>
</html>`;
  fs.writeFileSync(path.join(OUT, 'salt-flat-dark2-style-test.html'), html);
  console.log('[html] salt-flat-dark2-style-test.html');
}
