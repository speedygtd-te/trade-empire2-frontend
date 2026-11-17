/**
 * Setzt ein Schiff auf eine KOPIE von dock_large_mid_empty_0.png. Maske
 * deckt nur den inneren Stellflaechen-Bereich ab (Rand/Ecken/Streifen
 * bleiben Pixel-exakt erhalten), damit alle Mid-Varianten dieselbe Kante
 * tragen und nur das Schiff sich unterscheidet.
 *
 * Usage: node scripts/_dl_mid_ship_gen.cjs --tag c1 --seed 9001 --prompt "..."
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
if (!FAL_API_KEY) { console.error('No fal key'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const DIR_FINAL = path.join(ROOT, 'assets', 'final');
const DIR_PREV = path.join(ROOT, 'assets', 'prev');
const DIR_RAW = path.join(ROOT, 'assets', 'raw');

const argOf = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const has = n => process.argv.includes(n);
const INPUT = argOf('--input', path.join(DIR_FINAL, 'dock_large_mid_empty_0.png'));
const TAG = argOf('--tag', 'c1');
const OUTPUT = argOf('--output', path.join(DIR_FINAL, `dock_large_mid_${TAG}_0.png`));
const SEED = Number(argOf('--seed', '9001'));
const ENDPOINT = 'fal-ai/flux-pro/v1/fill';
const UPSCALE = Number(argOf('--upscale', '2'));
const FEATHER = Number(argOf('--feather', '3'));

// Innerer Stellflaechen-Bereich (Polygon), Rand/Streifen/Ecken bleiben unberuehrt.
const POLY = (argOf('--poly', '160,150 400,270 260,420 60,300')).trim().split(/\s+/).map(p => p.split(',').map(Number));

const PROMPT = argOf('--prompt');
if (!PROMPT) { console.error('--prompt required'); process.exit(1); }

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
function inPoly(px, py, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function distOutside(mask, W, H) {
  const BIG = 1e6; const D = new Float32Array(W*H).fill(BIG);
  for (let i=0;i<W*H;i++) if (mask[i]) D[i]=0;
  const rel = (x,y,v) => { if (x<0||y<0||x>=W||y>=H) return v; return Math.min(v, D[y*W+x]+1); };
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) { let v=D[y*W+x]; v=rel(x-1,y,v); v=rel(x,y-1,v); v=rel(x-1,y-1,v); v=rel(x+1,y-1,v); D[y*W+x]=v; }
  for (let y=H-1;y>=0;y--) for (let x=W-1;x>=0;x--) { let v=D[y*W+x]; v=rel(x+1,y,v); v=rel(x,y+1,v); v=rel(x+1,y+1,v); v=rel(x-1,y+1,v); D[y*W+x]=v; }
  return D;
}

(async () => {
  const src = await loadRGBA(INPUT);
  const W = src.W, H = src.H;
  const inside = new Uint8Array(W*H);
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) if (inPoly(x+0.5,y+0.5,POLY)) inside[y*W+x]=1;
  const invert = new Uint8Array(W*H); for (let i=0;i<W*H;i++) invert[i]=inside[i]?0:1;
  const dIn = distOutside(invert, W, H);
  let maskPx = 0;
  const modelMask = Buffer.alloc(W*H*3,0);
  const blend = new Float32Array(W*H);
  for (let i=0;i<W*H;i++) {
    if (inside[i]) { modelMask[i*3]=modelMask[i*3+1]=modelMask[i*3+2]=255; maskPx++; }
    blend[i] = Math.max(0, Math.min(1, dIn[i] / FEATHER));
  }
  console.log(`  [maske] ${maskPx} von ${W*H} px (${((100*maskPx)/(W*H)).toFixed(2)} %)`);
  const modelMaskPng = await sharp(modelMask, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  fs.mkdirSync(DIR_PREV, { recursive: true });
  fs.writeFileSync(path.join(DIR_PREV, `dock_large_mid_${TAG}_mask.png`), modelMaskPng);

  const U = UPSCALE;
  const flat = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } } })
    .composite([{ input: await sharp(src.d, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer() }])
    .png().toBuffer();
  const flatUp = await sharp(flat).resize(W*U, H*U, { kernel: 'lanczos3' }).png().toBuffer();
  const maskUp = await sharp(modelMaskPng).resize(W*U, H*U, { kernel: 'nearest' }).png().toBuffer();

  const imgUrl = await uploadToFal(flatUp, `dl_mid_${TAG}_in.png`);
  const mskUrl = await uploadToFal(maskUp, `dl_mid_${TAG}_mask.png`);
  console.log(`  [gen] seed=${SEED} prompt ${PROMPT.length} chars`);
  const res = await runQueue(ENDPOINT, { image_url: imgUrl, mask_url: mskUrl, prompt: PROMPT, num_images: 1, output_format: 'png', safety_tolerance: '6', seed: SEED }, 'fill');
  const genUrl = (res.images && res.images[0] && res.images[0].url) || (res.image && res.image.url);
  if (!genUrl) throw new Error('no image url: ' + JSON.stringify(res).slice(0,300));
  const genRaw = await downloadBuffer(genUrl);
  fs.mkdirSync(DIR_RAW, { recursive: true });
  fs.writeFileSync(path.join(DIR_RAW, `dl_mid_${TAG}_raw.png`), genRaw);

  // KEIN birefnet hier: die Maske liegt vollstaendig INNERHALB der bereits
  // opaken Kachel-Innenflaeche, es gibt also nichts freizustellen. birefnet
  // wuerde das Schiff als Vordergrund lesen und das Deck drumherum als
  // "Hintergrund" entfernen (beobachtet: Loch statt Deck um das Schiff).
  // Direkt die generierten RGB-Pixel uebernehmen, Alpha im Maskenbereich fest
  // auf opak (die Originalkante liefert ohnehin die Transparenz aussen).
  const gen = await loadRGBA(await sharp(genRaw).resize(W, H, { kernel: 'lanczos3' }).png().toBuffer());

  const out = Buffer.alloc(W*H*4);
  for (let i=0;i<W*H;i++) {
    const w = blend[i];
    const ao = src.d[i*4+3]/255;
    const a = (1-w)*ao + w*1;
    out[i*4+3] = Math.round(a*255);
    if (a > 0.002) for (let c=0;c<3;c++) out[i*4+c] = Math.round(Math.max(0, Math.min(255, ((1-w)*src.d[i*4+c]*ao + w*gen.d[i*4+c]*1) / a)));
  }
  const outBuf = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  fs.mkdirSync(DIR_FINAL, { recursive: true });
  fs.writeFileSync(OUTPUT, outBuf);
  console.log(`  [save] ${path.relative(ROOT, OUTPUT)}`);
})().catch(e => { console.error(String(e)); process.exit(1); });
