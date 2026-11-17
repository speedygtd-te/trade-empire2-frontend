/**
 * Erweitert dock_large_start_0.png NACH SUEDWESTEN (outpainting) um ein
 * weiteres Stueck Stellflaeche -- direkte Fortsetzung DESSELBEN Bildes statt
 * einer neuen Komposition, damit Deck-Material, Fugenlinie und Warnstreifen
 * garantiert weiterlaufen. Analog close-iso-end.cjs, aber OUTPAINT statt CLIP:
 * die neue Leinwand ist groesser, das Original liegt darin, der Rest ist die
 * Maske fuers Modell.
 *
 * Usage: node scripts/_dl_extend_gen.cjs --tag ship_a1 --seed 5001 \
 *   --margin-left 260 --margin-bottom 150 --prompt "..." [--mask-only]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');
sharp.cache(false);

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

const argOf = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const has = n => process.argv.includes(n);
const INPUT = argOf('--input', path.join(DIR_FINAL, 'dock_large_start_0.png'));
const TAG = argOf('--tag', 'ship_a1');
const OUTPUT = argOf('--output', path.join(DIR_PREV, `dock_large_extend_${TAG}.png`));
const SEED = Number(argOf('--seed', '5001'));
const MARGIN_LEFT = Number(argOf('--margin-left', '260'));
const MARGIN_BOTTOM = Number(argOf('--margin-bottom', '150'));
const GROW = Number(argOf('--grow', '6'));
const UPSCALE = Number(argOf('--upscale', '1.5'));
const ENDPOINT = 'fal-ai/flux-pro/v1/fill';

const PROMPT = argOf('--prompt', 'placeholder');

// Parallelogramm der NEUEN Kachel in NEUEN Leinwandkoordinaten (nach der
// Verschiebung des Originals um (MARGIN_LEFT,0)). old-west/old-south sind die
// beiden Ecken der bereits geoeffneten SW-Kante von dock_large_start_0.png,
// V ist der Versatz zur naechsten Kachel entlang der Fahrtrichtung.
const POLY_ARG = argOf('--poly', null);
function defaultPoly() {
  const oldWest = [MARGIN_LEFT + 0, 340];
  const oldSouth = [MARGIN_LEFT + 270, 494];
  const V = [-140, 90];
  const newSouth = [oldSouth[0] + V[0], oldSouth[1] + V[1]];
  const newWest = [oldWest[0] + V[0], oldWest[1] + V[1]];
  return [oldWest, oldSouth, newSouth, newWest];
}
const POLY = POLY_ARG
  ? POLY_ARG.trim().split(/\s+/).map(p => p.split(',').map(Number))
  : defaultPoly();
function inPoly(px, py, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => { let data = ''; res.on('data', c => data += c); res.on('end', () => resolve({ status: res.statusCode, body: data })); });
    req.on('error', reject); if (body) req.write(body); req.end();
  });
}
const httpsGet = (url, headers) => { const u = new URL(url); return httpsRequest({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers }); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const dl = u => { const mod = u.startsWith('https') ? https : http; mod.get(u, res => {
      if (res.statusCode === 301 || res.statusCode === 302) return dl(res.headers.location);
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject); };
    dl(url);
  });
}
async function uploadToFal(buffer, fileName) {
  const init = JSON.parse((await httpsRequest({ hostname: 'rest.alpha.fal.ai', path: '/storage/upload/initiate', method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` } }, JSON.stringify({ content_type: 'image/png', file_name: fileName }))).body);
  const u = new URL(init.upload_url);
  await new Promise((resolve, reject) => { const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'PUT', headers: { 'Content-Type': 'image/png', 'Content-Length': buffer.length.toString() } }, res => { res.on('data', () => {}); res.on('end', resolve); }); req.on('error', reject); req.write(buffer); req.end(); });
  return init.file_url;
}
async function runQueue(endpoint, payload, label) {
  const r = await httpsRequest({ hostname: 'queue.fal.run', path: '/' + endpoint, method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` } }, JSON.stringify(payload));
  let submit; try { submit = JSON.parse(r.body); } catch { throw new Error(`${label}: HTTP ${r.status} ${r.body.slice(0,300)}`); }
  if (!submit.status_url) throw new Error(`${label}: HTTP ${r.status} ${r.body.slice(0,400)}`);
  process.stdout.write(`    ${label} waiting`);
  for (let i = 0; i < 150; i++) {
    await sleep(2000);
    const st = JSON.parse((await httpsGet(submit.status_url, { Authorization: `Key ${FAL_API_KEY}` })).body);
    if (st.status === 'COMPLETED') { process.stdout.write(' done\n'); return JSON.parse((await httpsGet(submit.response_url, { Authorization: `Key ${FAL_API_KEY}` })).body); }
    if (st.status === 'FAILED') throw new Error(`${label} failed: ${JSON.stringify(st).slice(0,300)}`);
    process.stdout.write('.');
  }
  throw new Error(`${label}: timeout`);
}
const loadRGBA = async src => { const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { d: data, W: info.width, H: info.height }; };

(async () => {
  const src = await loadRGBA(INPUT);
  const SW = src.W, SH = src.H;
  const W = SW + MARGIN_LEFT, H = SH + MARGIN_BOTTOM;
  console.log(`[dl-extend] canvas ${W}x${H}, original ${SW}x${SH} placed at (${MARGIN_LEFT},0)`);

  // Neue Leinwand: Original rechtsbuendig oben, Rest transparent.
  const canvas = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: INPUT, left: MARGIN_LEFT, top: 0 }])
    .png().toBuffer();
  const canvasRGBA = await loadRGBA(canvas);

  // Maske: alles was NEU ist (der Rand links/unten) PLUS ein GROW-Saum in
  // das Original hinein fuer Kontext-Ueberlappung. Modellmaske = weiss.
  const modelMask = Buffer.alloc(W * H * 3, 0);
  const isNew = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (inPoly(x + 0.5, y + 0.5, POLY)) isNew[y * W + x] = 1;
  }
  // GROW: Distanz von "neu" nach innen wachsen lassen (einfacher Box-Ansatz)
  const grown = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = isNew[y * W + x];
    if (!v) {
      outer: for (let dy = -GROW; dy <= GROW; dy++) for (let dx = -GROW; dx <= GROW; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (isNew[yy * W + xx]) { v = 1; break outer; }
      }
    }
    grown[y * W + x] = v;
  }
  let maskPx = 0;
  for (let i = 0; i < W * H; i++) if (grown[i]) { modelMask[i * 3] = modelMask[i * 3 + 1] = modelMask[i * 3 + 2] = 255; maskPx++; }
  console.log(`  [maske] ${maskPx} von ${W * H} px (${((100 * maskPx) / (W * H)).toFixed(2)} %) grow=${GROW}`);
  const modelMaskPng = await sharp(modelMask, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  fs.writeFileSync(path.join(DIR_PREV, `dock_large_extend_${TAG}_mask.png`), modelMaskPng);

  // Vorschau
  const ov = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const w = grown[i] ? 0.5 : 0;
    for (let c = 0; c < 3; c++) ov[i * 4 + c] = Math.round((1 - w) * canvasRGBA.d[i * 4 + c] + w * (c === 0 ? 255 : 30));
    ov[i * 4 + 3] = Math.max(canvasRGBA.d[i * 4 + 3], Math.round(w * 220));
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 20, g: 24, b: 32, alpha: 255 } } })
    .composite([{ input: await sharp(ov, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer() }])
    .png().toFile(path.join(DIR_PREV, `dock_large_extend_${TAG}_maskpreview.png`));
  console.log(`  [preview] assets/prev/dock_large_extend_${TAG}_maskpreview.png`);
  if (has('--mask-only')) return;
  if (!FAL_API_KEY) { console.error('No fal key'); process.exit(1); }

  const U = UPSCALE;
  const flat = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } } })
    .composite([{ input: canvas }]).png().toBuffer();
  const flatUp = await sharp(flat).resize(Math.round(W * U), Math.round(H * U), { kernel: 'lanczos3' }).png().toBuffer();
  const maskUp = await sharp(modelMaskPng).resize(Math.round(W * U), Math.round(H * U), { kernel: 'nearest' }).png().toBuffer();
  fs.writeFileSync(path.join(DIR_PREV, `dock_large_extend_${TAG}_apiinput.png`), flatUp);

  const imgUrl = await uploadToFal(flatUp, `dl_ext_${TAG}_in.png`);
  const mskUrl = await uploadToFal(maskUp, `dl_ext_${TAG}_mask.png`);
  console.log(`  [gen] ${ENDPOINT} seed=${SEED} prompt ${PROMPT.length} chars`);
  const res = await runQueue(ENDPOINT, { image_url: imgUrl, mask_url: mskUrl, prompt: PROMPT, num_images: 1, output_format: 'png', safety_tolerance: '6', seed: SEED }, 'fill');
  const genUrl = (res.images && res.images[0] && res.images[0].url) || (res.image && res.image.url);
  if (!genUrl) throw new Error('no image url: ' + JSON.stringify(res).slice(0,300));
  const genRaw = await downloadBuffer(genUrl);
  fs.writeFileSync(path.join(DIR_RAW, `dl_ext_${TAG}_raw.png`), genRaw);

  const genUp = await uploadToFal(genRaw, `dl_ext_${TAG}_gen.png`);
  const nobg = await runQueue('fal-ai/birefnet/v2', { image_url: genUp }, 'birefnet');
  const nobgBuf = await downloadBuffer(nobg.image.url);
  const gen = await loadRGBA(await sharp(nobgBuf).resize(W, H, { kernel: 'lanczos3' }).png().toBuffer());

  // Zusammensetzen: ausserhalb der Maske PIXELGENAU das Original, innerhalb das Neue.
  const blend = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) blend[i] = grown[i] ? 1 : 0;
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const w = blend[i];
    const ao = canvasRGBA.d[i * 4 + 3] / 255, an = gen.d[i * 4 + 3] / 255;
    const a = (1 - w) * ao + w * an;
    out[i * 4 + 3] = Math.round(a * 255);
    if (a > 0.002) for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(Math.max(0, Math.min(255, ((1 - w) * canvasRGBA.d[i * 4 + c] * ao + w * gen.d[i * 4 + c] * an) / a)));
  }
  const outBuf = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  fs.writeFileSync(OUTPUT, outBuf);
  console.log(`  [save] ${path.relative(ROOT, OUTPUT)}`);
})().catch(e => { console.error(String(e)); process.exit(1); });
