/**
 * HULL VARIANTS — CALIBRATION (Schritt 1).
 *
 * Probiert auf EINEM Typ (standard) beide Varianten-Methoden, damit Rudi
 * (per Vergleichs-HTML + gemessenem Objekt-Aspect) die beste wählen kann:
 *
 *   (A) i2i  fal-ai/flux/dev/image-to-image  strength 0.35 und 0.45
 *   (B) Kontext Einzel-Edit  fal-ai/flux-pro/kontext  (panel-detail variation
 *       + Kamera-Lock-Text aus style-test-hull-batch.cjs)
 *
 * Quelle: src/assets/hulls/standard/standard_0.webp (Variante 0, NICHT ändern).
 *
 * Pipeline je Kandidat:
 *   gen -> birefnet bg-remove (falls opak) -> tight-crop ->
 *   ASPECT-ERHALTENDER footprint-fit auf die EXAKTE bbox+offset der Basis
 *   (Math.min-Scale: kein Squash, keine Drehung) in 512x512.
 *
 * Objekt-Aspect (bw/bh der bbox) wird je Kandidat gegen die Basis gemessen.
 *
 * Output: assets/style-test/hull-variants/_calib/  + calib.html
 * KEINE src-writes, KEIN cap sync, KEIN git.
 *
 * Usage: node scripts/hull-variants-calib.cjs
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
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const BASE = path.join(ROOT, 'src', 'assets', 'hulls', 'standard', 'standard_0.webp');
const OUT = path.join(ROOT, 'assets', 'style-test', 'hull-variants', '_calib');

// Camera-lock text (from style-test-hull-batch.cjs) — kept for the Kontext edit.
const CAMERA =
  'isometric three-quarter view, camera at 45 degree azimuth and ' +
  'approximately 30 degree elevation, EXACTLY matching the perspective, ' +
  'orientation and proportions of the input image - front-left and ' +
  'front-right facades at equal symmetric angles, no rotation, not tilted, ' +
  'not compressed, preserve the exact aspect ratio and cube proportions of ' +
  'the input image.';

// (B) Kontext single-edit: vary panel details only, lock everything structural.
const KONTEXT_PROMPT =
  'Create a variation of this object: rearrange the panel details, vents, ' +
  'seams and small surface elements into a different but equally plausible ' +
  'layout. Keep the exact geometry, perspective, proportions, silhouette, ' +
  'material, colors and lighting identical. Do not rotate, do not tilt, do ' +
  'not resize, do not change the cube shape. ' + CAMERA +
  ' Isolated single object, same plain background. No yellow.';

// (A) i2i prompt: light restyle keeping the standard look + panel variation.
const I2I_PROMPT =
  'isometric sci-fi cubic hull module, dark charcoal graphite metal panels ' +
  'with subtle cyan glowing edge lines, rearranged panel detail layout, vents ' +
  'and seams in a slightly different arrangement, same cube geometry and same ' +
  'three-quarter isometric perspective, isolated single object on a plain flat ' +
  'neutral grey background, no yellow';

function dataUri(buf) { return `data:image/png;base64,${buf.toString('base64')}`; }
function fetchJson(model, body) {
  return new Promise((resolve, reject) => {
    const u = new URL('https://fal.run/' + model);
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { Authorization: `Key ${FAL_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      const c = [];
      res.on('data', (d) => c.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(c).toString();
        if (res.statusCode >= 400) return reject(new Error(`fal ${model} ${res.statusCode}: ${raw.slice(0, 400)}`));
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('bad json ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject); req.write(payload); req.end();
  });
}
function download(url) {
  return new Promise((resolve, reject) => {
    const go = (u) => https.get(u, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) return go(res.headers.location);
      const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => resolve(Buffer.concat(c))); res.on('error', reject);
    }).on('error', reject);
    go(url);
  });
}
async function removeBg(buf) {
  const r = await fetchJson('fal-ai/birefnet', { image_url: dataUri(buf) });
  const url = (r.image && r.image.url) || (r.images && r.images[0] && r.images[0].url);
  if (!url) throw new Error('no bg url');
  return download(url);
}
async function bbox(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * C + 3] > 16) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) throw new Error('fully transparent');
  return { W, H, minX, minY, bw: maxX - minX + 1, bh: maxY - minY + 1 };
}
async function tightCrop(buf, box) {
  const b = box || (await bbox(buf));
  return sharp(buf).extract({ left: b.minX, top: b.minY, width: b.bw, height: b.bh }).png().toBuffer();
}
// aspect-preserving fit onto the BASE bbox+offset (no squash, no rotation)
async function fitToBase(croppedBuf, baseBox) {
  const o = baseBox;
  const meta = await sharp(croppedBuf).metadata();
  const scale = Math.min(o.bw / meta.width, o.bh / meta.height);
  const nw = Math.max(1, Math.round(meta.width * scale));
  const nh = Math.max(1, Math.round(meta.height * scale));
  const resized = await sharp(croppedBuf).resize(nw, nh, { fit: 'fill' }).png().toBuffer();
  const left = o.minX + Math.round((o.bw - nw) / 2);
  const top = o.minY + Math.round((o.bh - nh) / 2);
  return sharp({ create: { width: o.W, height: o.H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, left, top }]).png().toBuffer();
}

async function pipe(genBuf, baseBox, outPath) {
  let nobg;
  try { nobg = await removeBg(genBuf); } catch { nobg = genBuf; }
  const cropBox = await bbox(nobg);
  const cropped = await tightCrop(nobg, cropBox);
  const fitted = await fitToBase(cropped, baseBox);
  fs.writeFileSync(outPath, fitted);
  // measured object aspect = bbox of the cropped gen (pre-fit), what the model produced
  return { aspect: cropBox.bw / cropBox.bh, fittedAspect: baseBox.bw / baseBox.bh };
}

async function i2i(baseUri, prompt, seed, strength) {
  const r = await fetchJson('fal-ai/flux/dev/image-to-image', {
    image_url: baseUri, prompt, strength,
    image_size: { width: 512, height: 512 },
    num_inference_steps: 40, guidance_scale: 3.5, num_images: 1,
    enable_safety_checker: false, seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no i2i url');
  return download(url);
}
async function kontext(baseUri, prompt, seed) {
  const r = await fetchJson('fal-ai/flux-pro/kontext', {
    prompt, image_url: baseUri, seed, guidance_scale: 4.0, num_images: 1,
    safety_tolerance: '5', output_format: 'png',
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no kontext url');
  return download(url);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const baseBuf = await sharp(fs.readFileSync(BASE)).png().toBuffer();
  const baseBox = await bbox(baseBuf);
  const baseAspect = baseBox.bw / baseBox.bh;
  console.log(`[base] standard bbox ${baseBox.bw}x${baseBox.bh} aspect=${baseAspect.toFixed(4)} off=(${baseBox.minX},${baseBox.minY})`);
  fs.writeFileSync(path.join(OUT, 'base_standard.png'), baseBuf);
  const baseUri = dataUri(baseBuf);

  const candidates = [
    { id: 'A_i2i_s035', label: 'A: i2i strength 0.35', fn: () => i2i(baseUri, I2I_PROMPT, 880101, 0.35) },
    { id: 'A_i2i_s045', label: 'A: i2i strength 0.45', fn: () => i2i(baseUri, I2I_PROMPT, 880102, 0.45) },
    { id: 'B_kontext', label: 'B: Kontext single-edit', fn: () => kontext(baseUri, KONTEXT_PROMPT, 880103) },
  ];

  const rows = [];
  for (const c of candidates) {
    try {
      console.log(`[gen] ${c.id} ...`);
      const gen = await c.fn();
      fs.writeFileSync(path.join(OUT, `${c.id}_gen.png`), gen);
      const m = await pipe(gen, baseBox, path.join(OUT, `${c.id}.png`));
      const dev = ((m.aspect - baseAspect) / baseAspect) * 100;
      rows.push({ ...c, aspect: m.aspect, dev });
      console.log(`[done] ${c.id} objAspect=${m.aspect.toFixed(4)} dev=${dev.toFixed(1)}%`);
    } catch (e) { console.error(`ERR ${c.id}: ${e.message}`); rows.push({ ...c, aspect: NaN, dev: NaN, err: e.message }); }
  }

  // comparison HTML: base + each candidate, with measured object-aspect deviation
  const cell = (id, label, sub) =>
    `<figure><img src="${id}.png"><figcaption><b>${label}</b><br>${sub}</figcaption></figure>`;
  const html = `<!doctype html><meta charset=utf8><title>Hull variant calibration — standard</title>
<style>body{background:#222;color:#eee;font-family:system-ui;margin:16px}
.row{display:flex;gap:16px;flex-wrap:wrap}
figure{margin:0}img{width:320px;height:320px;background:repeating-conic-gradient(#444 0 25%,#333 0 50%) 0 0/24px 24px;image-rendering:auto;border:1px solid #555}
figcaption{font-size:13px;margin-top:6px;line-height:1.4}</style>
<h2>Hull-Varianten Kalibrierung — standard</h2>
<p>Basis objAspect (bw/bh) = <b>${baseAspect.toFixed(4)}</b> (${baseBox.bw}x${baseBox.bh}). Kandidaten zeigen den gemessenen Objekt-Aspect der Roh-Generierung (vor footprint-fit) und die Abweichung zur Basis. Kleiner = geometrisch treuer.</p>
<div class=row>
${cell('base_standard', 'BASIS (Variante 0)', `aspect ${baseAspect.toFixed(4)}`)}
${rows.map((r) => cell(r.id, r.label, isNaN(r.aspect) ? `ERR: ${r.err || ''}` : `objAspect ${r.aspect.toFixed(4)} · dev ${r.dev.toFixed(1)}%`)).join('\n')}
</div>`;
  fs.writeFileSync(path.join(OUT, 'calib.html'), html);
  console.log('\nSUMMARY:');
  console.log(`base aspect ${baseAspect.toFixed(4)}`);
  for (const r of rows) console.log(`  ${r.id.padEnd(14)} ${isNaN(r.aspect) ? 'ERR ' + r.err : 'aspect ' + r.aspect.toFixed(4) + ' dev ' + r.dev.toFixed(1) + '%'}`);
  console.log(`HTML: ${path.join(OUT, 'calib.html')}`);
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
