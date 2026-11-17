/**
 * STYLE-TEST ONLY (NO integration, NO writes to src/, NO cap sync, NO git):
 * A new "even beach" base in the approved beach_dark COLOUR look, but with
 * PERFECTLY UNIFORM brightness across the whole tile (Rudi's complaint about
 * beach_dark: same dark wet muddy colours are good, but the brightness has a
 * "one side light / one side dark" diagonal gradient — that has to go).
 *
 * COLOUR (keep, from beach_dark): dark wet desaturated grey-brown muddy beach
 *   sand, grimy silt, scattered small dark pebbles, near-black damp shore, low
 *   saturation.
 * BRIGHTNESS (the whole point): perfectly uniform even brightness across the
 *   ENTIRE tile, NO light side and dark side, no gradient, no diagonal banding,
 *   no bright corner, low overall variance, consistent dark tone corner to
 *   corner.
 *
 * Anti-gradient is done in TWO layers:
 *   (1) prompt-side anti-gradient / anti-hotspot wording, multiple seeds;
 *   (2) POST-GEN 2D zone equalization — flux keeps sneaking a gradient in, so
 *       after generation we measure mean luma in an NxN grid over the SQUARE
 *       (pre-mask, so transparent diamond corners don't poison the means),
 *       build a smooth bilinear correction surface that pulls every zone to the
 *       global mean, and add it back. This is the 2D generalization of the
 *       row-wise vertical-gradient correction used by the floor variants.
 *
 * Pipeline (verbatim resize/mask from style-test-tile-beach.cjs):
 *   flux-pro v1.1 @512x512 top-down (multiple seeds)  -> 2D equalize on square
 *   -> resize 512x256 (fill, iso squish) -> diamond mask (alpha)
 *   BASIS = most-uniform seed after equalization.
 *   3 TWEAKS = fal-ai/flux/dev/image-to-image strength 0.35 off the basis SQUARE,
 *              each re-equalized (no new gradient).
 *
 * Outputs (assets/style-test/tiles/ ONLY):
 *   beach_even_basis.png (+ _half, _mosaic)
 *   beach_even_t1.png / _t2.png / _t3.png (+ _half, _mosaic each)
 *   beach-even-style-test.html
 *
 * Usage: node scripts/beach-even-variants.cjs
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

// Prefix verbatim from style-test-tile-beach.cjs so the style matches the
// inventory/biome pipeline.
const PREFIX = 'top-down aerial photograph, terrain texture filling entire image edge to edge, no sky, no horizon, no borders, no vignette, The Expanse sci-fi aesthetic, realistic';
// COLOUR look copied from beach_dark (level "dark").
const LOOK = 'dark wet desaturated grey-brown muddy beach sand, grimy silt, scattered small dark pebbles, near-black damp shore, very low saturation, ominous dim, muted grey-brown sand palette, no orange or gold tint, no grass, no plants, no water';
// HARD anti-gradient / anti-hotspot uniformity wording. Brightness uniformity
// is the priority here.
const UNIFORM = 'perfectly uniform even brightness across the ENTIRE tile, NO light side and dark side, no gradient, no diagonal banding, no bright corner, low overall variance, consistent dark tone corner to corner, homogeneous fine sand grain everywhere, evenly distributed, no central feature, no hotspot, no single bright element, no bright rock or shell, no highlight blob, no bright top edge, no visible seams, seamless tileable edge to edge, perfectly even flat ambient lighting';
const PROMPT = `${PREFIX}, dark wet muddy beach sand from directly above, ${LOOK}, ${UNIFORM}`;

// i2i tweak prompt: keep the exact even dark muddy beach look, only lightly vary
// the grain/pebble placement. Strength 0.35 (Rudi's word) keeps it a light tweak.
const TWEAK_PROMPT = `${PREFIX}, dark wet muddy beach sand from directly above, ${LOOK}, slightly different pebble and grit arrangement, ${UNIFORM}`;

// Candidate seeds for the basis search (kept far from the style-test seeds 21450/21600/21750).
const BASIS_SEEDS = [70110, 71230, 72470, 73690, 74810, 75930];
// i2i tweak seeds.
const TWEAK_SEEDS = [80110, 81230, 82470];
const TWEAK_STRENGTH = 0.35;

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

// Measure mean luma in a GxG grid over a raw RGB(A) buffer. Returns the grid of
// zone means (Float64Array length G*G) + global mean.
function zoneMeans(data, width, height, channels, G) {
  const sum = new Float64Array(G * G);
  const cnt = new Float64Array(G * G);
  for (let y = 0; y < height; y++) {
    const gy = Math.min(G - 1, Math.floor((y / height) * G));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(G - 1, Math.floor((x / width) * G));
      const i = (y * width + x) * channels;
      const zi = gy * G + gx;
      sum[zi] += luma(data[i], data[i + 1], data[i + 2]);
      cnt[zi] += 1;
    }
  }
  const means = new Float64Array(G * G);
  let gsum = 0;
  for (let z = 0; z < G * G; z++) { means[z] = cnt[z] ? sum[z] / cnt[z] : 0; gsum += means[z]; }
  return { means, global: gsum / (G * G), G };
}

// 2D zone equalization on a SQUARE RGB buffer. For each zone compute the deficit
// (global - zoneMean), then for every pixel bilinearly interpolate the deficit
// from the 4 surrounding zone-centers and add it to all channels. Pulls the whole
// tile to a flat brightness corner-to-corner without quantization seams.
async function equalize2D(squareBuf, G = 8) {
  const { data, info } = await sharp(squareBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const { means, global } = zoneMeans(data, width, height, channels, G);
  // deficit per zone
  const deficit = new Float64Array(G * G);
  for (let z = 0; z < G * G; z++) deficit[z] = global - means[z];
  // zone centers in pixel space
  const cellW = width / G, cellH = height / G;
  const out = Buffer.from(data);
  for (let y = 0; y < height; y++) {
    // fractional zone-center row coordinate
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
        let v = data[i + c] + delta;
        out[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
  return sharp(out, { raw: { width, height, channels } }).png().toBuffer();
}

// Uniformity metrics measured on a SQUARE buffer (pre-mask). Reports the
// brightness imbalance the way Rudi describes it: left-vs-right half, top-vs-bottom
// half, and the spread across the 4 corner quadrants. Lower = more uniform.
async function uniformityStats(squareBuf) {
  const { data, info } = await sharp(squareBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let L = 0, R = 0, T = 0, B = 0, nL = 0, nR = 0, nT = 0, nB = 0;
  const q = [0, 0, 0, 0], nq = [0, 0, 0, 0]; // TL, TR, BL, BR
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
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
    lr: Math.abs(lh - rh),
    tb: Math.abs(th - bh),
    cornerSpread,
    // single scalar to rank seeds: worst of the three imbalances
    worst: Math.max(Math.abs(lh - rh), Math.abs(th - bh), cornerSpread),
    detail: { lh, rh, th, bh, qm },
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

async function i2i(squareDataUri, seed) {
  const r = await fetchJson('https://fal.run/fal-ai/flux/dev/image-to-image', {
    image_url: squareDataUri,
    prompt: TWEAK_PROMPT,
    strength: TWEAK_STRENGTH,
    image_size: { width: GEN_SIZE, height: GEN_SIZE },
    num_inference_steps: 40,
    guidance_scale: 3.5,
    num_images: 1,
    enable_safety_checker: false,
    seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no i2i image url for seed ' + seed);
  return download(url);
}

const fmt = (s) => `L/R ${s.lr.toFixed(1)}  T/B ${s.tb.toFixed(1)}  corners ${s.cornerSpread.toFixed(1)}  worst ${s.worst.toFixed(1)}`;
const report = [];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // ---- 1) Basis search: generate each seed, equalize, measure, keep best ----
  console.log('=== BASIS SEARCH ===');
  let best = null;
  for (const seed of BASIS_SEEDS) {
    try {
      console.log(`[gen basis] seed ${seed}`);
      const raw = await genFluxPro(seed);
      const square = await sharp(raw).resize(GEN_SIZE, GEN_SIZE, { fit: 'fill' }).removeAlpha().png().toBuffer();
      const before = await uniformityStats(square);
      const eq = await equalize2D(square, 8);
      const after = await uniformityStats(eq);
      console.log(`   seed ${seed}: before [${fmt(before)}]  ->  after [${fmt(after)}]`);
      report.push({ kind: 'basis-candidate', seed, before, after });
      if (!best || after.worst < best.after.worst) best = { seed, squareEq: eq, before, after };
    } catch (e) { console.error(`ERR basis seed ${seed}: ${e.message}`); }
  }
  if (!best) { console.error('No basis candidate succeeded'); process.exit(1); }
  console.log(`>>> BASIS = seed ${best.seed} (worst ${best.after.worst.toFixed(1)} after eq)`);
  await finalize(best.squareEq, 'beach_even_basis');
  report.push({ kind: 'BASIS', seed: best.seed, before: best.before, after: best.after });

  // ---- 2) 3 tweaks: i2i strength 0.35 off the equalized basis square, re-equalize ----
  console.log('=== TWEAKS (i2i flux/dev strength 0.35) ===');
  const basisDataUri = `data:image/png;base64,${best.squareEq.toString('base64')}`;
  for (let k = 0; k < 3; k++) {
    const seed = TWEAK_SEEDS[k];
    const name = `beach_even_t${k + 1}`;
    try {
      console.log(`[i2i ${name}] seed ${seed} strength ${TWEAK_STRENGTH}`);
      const raw = await i2i(basisDataUri, seed);
      const square = await sharp(raw).resize(GEN_SIZE, GEN_SIZE, { fit: 'fill' }).removeAlpha().png().toBuffer();
      const before = await uniformityStats(square);
      const eq = await equalize2D(square, 8);
      const after = await uniformityStats(eq);
      console.log(`   ${name}: before [${fmt(before)}]  ->  after [${fmt(after)}]`);
      await finalize(eq, name);
      report.push({ kind: name, seed, before, after });
    } catch (e) { console.error(`ERR ${name}: ${e.message}`); }
  }

  // ---- 3) HTML comparison ----
  writeHtml();

  // ---- 4) machine-readable metrics dump for the agent report ----
  fs.writeFileSync(path.join(OUT, 'beach-even-metrics.json'), JSON.stringify(report, null, 2));
  console.log('\n=== METRICS SUMMARY (luma imbalance, lower = more even) ===');
  for (const r of report) {
    if (r.kind === 'basis-candidate') console.log(`  cand seed ${r.seed}: before worst ${r.before.worst.toFixed(1)} -> after worst ${r.after.worst.toFixed(1)}`);
  }
  for (const r of report) {
    if (r.kind !== 'basis-candidate') console.log(`  ${r.kind} (seed ${r.seed}): before [${fmt(r.before)}] -> after [${fmt(r.after)}]`);
  }
  console.log('done');
})();

function writeHtml() {
  const tweakSection = (name, title) => `
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
<title>Beach EVEN Style-Test — gleichmäßige Helligkeit (beach_dark-Look)</title>
<style>
  :root { --w: 256; --h: 128; }
  body { margin: 0; background: #030712; color: #d6dae0; font-family: system-ui, sans-serif; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 0 0 8px; color: #9fb0c3; }
  p.note { margin: 0 0 20px; color: #8893a0; font-size: 13px; max-width: 860px; }
  section { margin-bottom: 40px; padding-bottom: 24px; border-bottom: 1px solid #1a2230; }
  .row { display: flex; gap: 48px; align-items: flex-start; flex-wrap: wrap; }
  .caption { font-size: 12px; color: #8893a0; margin-bottom: 6px; }
  .mosaic img { display: block; image-rendering: auto; max-width: 100%; }
  .single img { width: calc(var(--w) * 1px); height: calc(var(--h) * 1px); display: block; }
  .single .caption, .mosaic .caption, .ref .caption { text-align: left; }
  .ref img { width: calc(var(--w) * 1px); height: calc(var(--h) * 1px); display: block; }
</style>
</head>
<body>
<h1>Beach EVEN Style-Test — gleichmäßige Helligkeit</h1>
<p class="note">
  Gleicher dunkler Farb-Look wie beach_dark (dunkler nasser schlammiger Strand, near-black, entsättigt),
  ABER gleichmäßige Helligkeit über die ganze Raute — kein Hell/Dunkel-Split, kein Verlauf, kein
  diagonales Banding, keine helle Ecke. flux baut den Verlauf oft trotzdem ein, daher zusätzlich eine
  2D-Zonen-Egalisierung NACH der Generierung (8×8-Gitter → bilineares Korrektur-Feld → jede Zone auf
  den Gesamt-Mittelwert ziehen). Oben das alte beach_dark zum Vergleich (sichtbarer Hell/Dunkel-Split),
  darunter die gleichmäßige Basis + 3 leichte Tweaks (i2i flux/dev strength 0.35). Jede als 3×3-Iso-Mosaik
  (Naht + Hell/Dunkel-Check) + Einzel-Raute. KEINE Integration in src/.
</p>

<section>
  <h2>Referenz — altes beach_dark (Farben ok, aber Hell/Dunkel-Split)</h2>
  <div class="row">
    <div class="ref">
      <div class="caption">beach_dark_half.png</div>
      <img src="beach_dark_half.png" alt="beach_dark Referenz">
    </div>
    <div class="mosaic">
      <div class="caption">beach_dark 3×3 Iso-Mosaik</div>
      <img src="beach_dark_mosaic.png" alt="beach_dark Mosaik">
    </div>
  </div>
</section>

${tweakSection('beach_even_basis', 'BASIS — gleichmäßigster Seed nach Egalisierung')}
${tweakSection('beach_even_t1', 'Tweak 1 — i2i strength 0.35 (egalisiert)')}
${tweakSection('beach_even_t2', 'Tweak 2 — i2i strength 0.35 (egalisiert)')}
${tweakSection('beach_even_t3', 'Tweak 3 — i2i strength 0.35 (egalisiert)')}
</body>
</html>`;
  fs.writeFileSync(path.join(OUT, 'beach-even-style-test.html'), html);
  console.log('[html] beach-even-style-test.html');
}
