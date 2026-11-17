/**
 * BEACH FINAL — deterministische 4-Slot-Belegung + Integration in src/.
 *
 * KEIN i2i. Hero = beach_warm_sharp_m (= beach_even_t1 + sharp-Warm "m", von Rudi
 * abgenommen). Wir wenden den IDENTISCHEN warm_m-Tweak auf alle 4 even-Quellen an
 * (gleiche Farbe/Helligkeit garantiert, da gleicher multiplikativer Tweak), und
 * flippen Slot 2,3 horizontal fuer Varianz ohne Drift.
 *
 * warm_m (aus scripts/beach-warm-variants.cjs, SHARP_STEPS sfx 'm'):
 *   bright 1.20, sat 1.25, rMul 1.11, gMul 1.05, bMul 0.89
 *
 * Slot-Belegung:
 *   beach_0 = beach_even_t1    + warm_m            (= abgenommener Hero, original)
 *   beach_1 = beach_even_t2    + warm_m            (original)
 *   beach_2 = beach_even_t3    + warm_m, dann flop (L<->R)
 *   beach_3 = beach_even_basis + warm_m, dann flop (L<->R)
 *
 * Maske: die even-Quellen haben die Diamond-Alpha bereits gebacken. Wir splitten
 * die RGB raus, faerben sie warm und joinen die ORIGINAL-Alpha wieder dran ->
 * Maske bleibt exakt erhalten. flop dreht RGB+Alpha gemeinsam (Diamond ist
 * spiegelsymmetrisch, bleibt also intakt).
 *
 * Integration je Slot (exakt wie der Bestand beach_0):
 *   beach_<n>.webp              512x256  (full res: webp only)
 *   beach_<n>@half.webp/.png    256x128
 *   beach_<n>@quarter.webp/.png 128x64
 *   beach_<n>@eighth.webp/.png  64x32
 * WebP: quality 90, alphaQuality 100.
 *
 * Ausserdem: 10x10 interlocking-Iso-Mosaik der 4 finalen Slots (regulaer +
 * reshuffle) + Einzel-Varianten -> beach-style-test.html.
 *
 * KEIN cap sync, KEIN build, KEIN git (macht der Agent separat).
 *
 * Usage: node scripts/beach-final-integrate.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const TILE_W = 512, TILE_H = 256;
const ROOT = path.resolve(__dirname, '..');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const OUT = path.join(ROOT, 'src', 'assets', 'tiles', 'beach');

// Identischer warm_m-Tweak (SHARP_STEPS 'm' aus beach-warm-variants.cjs).
const WARM_M = { bright: 1.20, sat: 1.25, rMul: 1.11, gMul: 1.05, bMul: 0.89 };

// Slot -> {Quelle, flop?}
const SLOTS = [
  { slot: 0, src: 'beach_even_t1', flop: false },
  { slot: 1, src: 'beach_even_t2', flop: false },
  { slot: 2, src: 'beach_even_t3', flop: true },
  { slot: 3, src: 'beach_even_basis', flop: true },
];

const MIPS = [
  { suffix: '@half', w: 256, h: 128 },
  { suffix: '@quarter', w: 128, h: 64 },
  { suffix: '@eighth', w: 64, h: 32 },
];

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// Wende warm_m an, Original-Diamond-Alpha bleibt erhalten. Optional horizontaler flop.
async function warmTile(srcPath, flop) {
  const srcAlpha = await sharp(srcPath).ensureAlpha().extractChannel('alpha')
    .toColourspace('b-w').png().toBuffer();
  const { data, info } = await sharp(srcPath).removeAlpha()
    .modulate({ brightness: WARM_M.bright, saturation: WARM_M.sat })
    .raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const out = Buffer.from(data);
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i] * WARM_M.rMul;
    const g = data[i + 1] * WARM_M.gMul;
    const b = data[i + 2] * WARM_M.bMul;
    out[i] = r > 255 ? 255 : r;
    out[i + 1] = g > 255 ? 255 : g;
    out[i + 2] = b > 255 ? 255 : b;
  }
  const warmedRgb = await sharp(out, { raw: { width, height, channels } }).png().toBuffer();
  let masked = await sharp(warmedRgb).ensureAlpha().joinChannel(srcAlpha).png().toBuffer();
  if (flop) masked = await sharp(masked).flop().png().toBuffer();
  return masked; // 512x256 RGBA
}

// Mean R/G/B + luma ueber Diamond-sichtbare Pixel (Konsistenz-Check).
async function colorStats(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    if (data[i + 3] < 8) continue;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  r /= n; g /= n; b /= n;
  return { r, g, b, luma: luma(r, g, b), warmth: r - b };
}

// Uniformitaet ueber Diamond-sichtbare Pixel (Verlauf-Check).
async function uniformityStats(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let L = 0, R = 0, T = 0, B = 0, nL = 0, nR = 0, nT = 0, nB = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    if (data[i + 3] < 8) continue;
    const l = luma(data[i], data[i + 1], data[i + 2]);
    if (x < width / 2) { L += l; nL++; } else { R += l; nR++; }
    if (y < height / 2) { T += l; nT++; } else { B += l; nB++; }
  }
  return { lr: Math.abs(L / nL - R / nR), tb: Math.abs(T / nT - B / nB) };
}

// Schreibe full webp + 3 Mips (webp + png) fuer einen Slot.
async function integrate(buf, slot) {
  fs.mkdirSync(OUT, { recursive: true });
  const base = `beach_${slot}`;
  const full = await sharp(buf).resize(TILE_W, TILE_H, { fit: 'fill' }).ensureAlpha().png().toBuffer();
  fs.writeFileSync(path.join(OUT, `${base}.webp`),
    await sharp(full).webp({ quality: 90, alphaQuality: 100 }).toBuffer());
  for (const m of MIPS) {
    const mip = await sharp(full).resize(m.w, m.h, { fit: 'fill' }).ensureAlpha().png().toBuffer();
    fs.writeFileSync(path.join(OUT, `${base}${m.suffix}.webp`),
      await sharp(mip).webp({ quality: 90, alphaQuality: 100 }).toBuffer());
    fs.writeFileSync(path.join(OUT, `${base}${m.suffix}.png`), mip);
  }
}

// N x N interlocking diamond mosaic. tilesByCell(r,c) -> RGBA buffer.
async function mosaicGrid(N, tilesByCell, outPath) {
  const HW = TILE_W / 2, HH = TILE_H / 2;
  const place = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++)
    place.push({ r, c, cx: (c - r) * HW, cy: (c + r) * HH });
  const minX = Math.min(...place.map(p => p.cx));
  const maxX = Math.max(...place.map(p => p.cx));
  const maxY = Math.max(...place.map(p => p.cy));
  const canvasW = (maxX - minX) + TILE_W;
  const canvasH = maxY + TILE_H;
  // Draw back-to-front (row+col ascending) for correct iso overlap.
  const ordered = place.slice().sort((a, b) => (a.r + a.c) - (b.r + b.c));
  const comp = ordered.map(p => ({ input: tilesByCell(p.r, p.c), left: p.cx - minX, top: p.cy }));
  const out = await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 } } })
    .composite(comp).png().toBuffer();
  fs.writeFileSync(outPath, out);
}

(async () => {
  for (const s of SLOTS) {
    const srcPath = path.join(ST, `${s.src}.png`);
    if (!fs.existsSync(srcPath)) throw new Error('missing source: ' + srcPath);
  }

  const finals = [];
  console.log('=== warm_m apply + flop ===');
  for (const s of SLOTS) {
    const buf = await warmTile(path.join(ST, `${s.src}.png`), s.flop);
    finals[s.slot] = buf;
    const c = await colorStats(buf);
    const u = await uniformityStats(buf);
    console.log(`beach_${s.slot} <- ${s.src}${s.flop ? ' (flop)' : ''}: R${c.r.toFixed(0)} G${c.g.toFixed(0)} B${c.b.toFixed(0)} luma${c.luma.toFixed(1)} warmth${c.warmth.toFixed(1)} | even L/R${u.lr.toFixed(1)} T/B${u.tb.toFixed(1)}`);
  }

  console.log('=== integrate to src ===');
  for (const s of SLOTS) {
    await integrate(finals[s.slot], s.slot);
    console.log(`[ok] src/assets/tiles/beach/beach_${s.slot}.webp (+3 mips webp/png)`);
  }

  // Style-test mosaics for visual check.
  console.log('=== style-test mosaics + HTML ===');
  const pick = (i) => finals[((i % 4) + 4) % 4];
  // Regular 10x10: deterministic cycling so all 4 appear repeatedly + tile.
  await mosaicGrid(10, (r, c) => pick((r * 3 + c * 7)), path.join(ST, 'beach-final-mosaic-10.png'));
  // Reshuffle: different cell->slot mapping.
  await mosaicGrid(10, (r, c) => pick((r * 5 + c * 2 + 1)), path.join(ST, 'beach-final-mosaic-10-reshuffle.png'));
  // Single half thumbnails per slot.
  for (const s of SLOTS) {
    const half = await sharp(finals[s.slot]).resize(256, 128, { fit: 'fill' }).png().toBuffer();
    fs.writeFileSync(path.join(ST, `beach_final_${s.slot}_half.png`), half);
  }
  writeHtml();
  console.log('done.');
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });

function writeHtml() {
  const singles = SLOTS.map(s => {
    const src = SLOTS[s.slot].src + (s.flop ? ' + flop' : '');
    return `    <div class="single"><div class="caption">beach_${s.slot} <span class="src">(${src} + warm_m)</span></div><img src="beach_final_${s.slot}_half.png" alt="beach_${s.slot}"></div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Beach FINAL — 4 Slots (warm_m, deterministisch) — 10x10 Iso-Mosaik</title>
<style>
  body { margin: 0; background: #030712; color: #d6dae0; font-family: system-ui, sans-serif; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 0 0 8px; color: #9fb0c3; }
  p.note { margin: 0 0 20px; color: #8893a0; font-size: 13px; max-width: 880px; }
  section { margin-bottom: 40px; padding-bottom: 24px; border-bottom: 1px solid #1a2230; }
  .caption { font-size: 12px; color: #8893a0; margin-bottom: 6px; }
  .caption .src { color: #5f6b78; }
  .mosaic img { display: block; image-rendering: auto; max-width: 100%; }
  .singles { display: flex; gap: 32px; flex-wrap: wrap; }
  .single img { width: 256px; height: 128px; display: block; }
</style>
</head>
<body>
<h1>Beach FINAL — 4 Slots, warm_m (deterministisch, kein i2i)</h1>
<p class="note">
  Alle 4 Slots = even-Quelle + IDENTISCHER sharp-Warm-Tweak "m"
  (bright 1.20, sat 1.25, rMul 1.11, gMul 1.05, bMul 0.89) -> gleiche Farbe/Helligkeit
  wie der von Rudi abgenommene Hero (beach_warm_sharp_m). Slot 2,3 zusaetzlich horizontal
  geflippt fuer Korn-Varianz ohne Drift. beach_0 = der abgenommene Hero.
</p>

<section>
  <h2>10×10 interlocking Iso-Mosaik (Naht- + Verlauf-Check)</h2>
  <div class="mosaic"><img src="beach-final-mosaic-10.png" alt="10x10 Mosaik"></div>
</section>

<section>
  <h2>10×10 Reshuffle (andere Slot-Verteilung — Tiling-Robustheit)</h2>
  <div class="mosaic"><img src="beach-final-mosaic-10-reshuffle.png" alt="10x10 Reshuffle Mosaik"></div>
</section>

<section>
  <h2>Einzel-Varianten (je Slot)</h2>
  <div class="singles">
${singles}
  </div>
</section>
</body>
</html>`;
  fs.writeFileSync(path.join(ST, 'beach-style-test.html'), html);
  console.log('[html] assets/style-test/tiles/beach-style-test.html');
}
