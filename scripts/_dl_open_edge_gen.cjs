/**
 * Oeffnet die SW-Kante von dock_large_0.png: entfernt Eckpfosten-Leuchte +
 * haengendes ID-Schild an West- und Suedecke, verlaengert das Deck bis zum
 * Bildrand. Modelliert auf close-iso-end.cjs (Zwei-Masken-Prinzip: Modell-
 * maske mit GROW-Kontext, Blendmaske mit SHRINK+FEATHER fuer die Uebernahme),
 * aber INPAINT statt CLIP: die Maske deckt teils opake (Eckpfosten), teils
 * transparente (Verlaengerungszone) Pixel ab.
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
for (const d of [DIR_FINAL, DIR_PREV, DIR_RAW]) fs.mkdirSync(d, { recursive: true });

const argOf = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const INPUT = path.join(DIR_FINAL, 'dock_large_0.png');
const OUTPUT = argOf('--output', path.join(DIR_FINAL, 'dock_large_start_0.png'));
const TAG = argOf('--tag', 't1');
const SEED = Number(argOf('--seed', '881301'));
const GROW = Number(argOf('--grow', '10'));
const SHRINK = Number(argOf('--shrink', '3'));
const FEATHER = Number(argOf('--feather', '3'));
const UPSCALE = Number(argOf('--upscale', '2'));
const ENDPOINT = 'fal-ai/flux-pro/v1/fill';

const POLY = [
  [0, 292], [62, 300], [78, 345], [96, 360],
  [175, 400], [225, 425], [270, 420], [312, 445],
  [312, 494], [190, 494], [0, 360],
];

const PROMPT = argOf('--prompt', [
  'Isometric 2.5D sci-fi game asset, weathered steel-blue metal spaceship hangar landing apron.',
  'Extend the grey-blue concrete/metal tarmac deck all the way to the edge of frame,',
  'continuing the same worn scuffed surface, the same black rubber expansion joint groove,',
  'and the same yellow and black diagonal hazard taxi stripe running off the edge.',
  'Remove any corner post, beacon light, or hanging metal ID plate: the deck simply continues',
  'past the frame edge with a plain flat unfinished cut look, as if the platform keeps going.',
  'Same weathered blue-grey paint, same scratches and grime, same isometric perspective,',
  'lit from upper left, matching lighting and material of the rest of the platform,',
  'plain white background beyond the deck edge, no new structures, no text.',
].join(' '));

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
const httpsGet = (url, headers) => { const u = new URL(url); return httpsRequest({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers }); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const dl = u => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, res => {
        if (res.statusCode === 301 || res.statusCode === 302) return dl(res.headers.location);
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    };
    dl(url);
  });
}
async function uploadToFal(buffer, fileName) {
  const init = JSON.parse((await httpsRequest({
    hostname: 'rest.alpha.fal.ai', path: '/storage/upload/initiate', method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
  }, JSON.stringify({ content_type: 'image/png', file_name: fileName }))).body);
  const u = new URL(init.upload_url);
  await new Promise((resolve, reject) => {
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'PUT',
      headers: { 'Content-Type': 'image/png', 'Content-Length': buffer.length.toString() } }, res => { res.on('data', () => {}); res.on('end', resolve); });
    req.on('error', reject); req.write(buffer); req.end();
  });
  return init.file_url;
}
async function runQueue(endpoint, payload, label) {
  const r = await httpsRequest({ hostname: 'queue.fal.run', path: '/' + endpoint, method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` } }, JSON.stringify(payload));
  let submit;
  try { submit = JSON.parse(r.body); } catch { throw new Error(`${label}: HTTP ${r.status} ${r.body.slice(0,300)}`); }
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
function bbox({ d, W, H }) {
  let x0=1e9,y0=1e9,x1=-1,y1=-1,n=0;
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) if (d[(y*W+x)*4+3]>8) { if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; n++; }
  return { x0,y0,x1,y1,w:x1-x0+1,h:y1-y0+1,n };
}
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
function blurF(src, W, H, r) {
  if (r <= 0) return src;
  const t = new Float32Array(W*H); const o = new Float32Array(W*H); const cl = (v,m)=>Math.min(m-1,Math.max(0,v));
  for (let y=0;y<H;y++) { let s=0; for (let x=-r;x<=r;x++) s+=src[y*W+cl(x,W)]; for (let x=0;x<W;x++) { t[y*W+x]=s/(2*r+1); s-=src[y*W+cl(x-r,W)]; s+=src[y*W+cl(x+r+1,W)]; } }
  for (let x=0;x<W;x++) { let s=0; for (let y=-r;y<=r;y++) s+=t[cl(y,H)*W+x]; for (let y=0;y<H;y++) { o[y*W+x]=s/(2*r+1); s-=t[cl(y-r,H)*W+x]; s+=t[cl(y+r+1,H)*W+x]; } }
  return o;
}

(async () => {
  const src = await loadRGBA(INPUT);
  const W = src.W, H = src.H;
  console.log(`[dl-open] ${W}x${H}`);
  console.log(`  [bbox] original ${JSON.stringify(bbox(src))}`);

  const inside = new Uint8Array(W*H);
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) if (inPoly(x+0.5,y+0.5,POLY)) inside[y*W+x]=1;
  const dOut = distOutside(inside, W, H);
  const invert = new Uint8Array(W*H); for (let i=0;i<W*H;i++) invert[i]=inside[i]?0:1;
  const dIn = distOutside(invert, W, H);

  const modelMask = Buffer.alloc(W*H*3, 0);
  const blendRaw = new Float32Array(W*H);
  let maskPx = 0;
  for (let i=0;i<W*H;i++) {
    if (dOut[i] <= GROW) { modelMask[i*3]=255; modelMask[i*3+1]=255; modelMask[i*3+2]=255; maskPx++; }
    blendRaw[i] = dIn[i] > SHRINK ? 1 : 0;
  }
  const blend = blurF(blendRaw, W, H, FEATHER);
  console.log(`  [maske] ${maskPx} von ${W*H} px (${((100*maskPx)/(W*H)).toFixed(2)} %) grow=${GROW} shrink=${SHRINK} feather=${FEATHER}`);

  const modelMaskPng = await sharp(modelMask, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  fs.writeFileSync(path.join(DIR_PREV, `dock_large_open_${TAG}_mask.png`), modelMaskPng);

  const U = UPSCALE;
  const flat = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } } })
    .composite([{ input: await sharp(src.d, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer() }])
    .png().toBuffer();
  const flatUp = await sharp(flat).resize(W*U, H*U, { kernel: 'lanczos3' }).png().toBuffer();
  const maskUp = await sharp(modelMaskPng).resize(W*U, H*U, { kernel: 'nearest' }).png().toBuffer();
  fs.writeFileSync(path.join(DIR_PREV, `dock_large_open_${TAG}_apiinput.png`), flatUp);

  const imgUrl = await uploadToFal(flatUp, `dl_open_${TAG}_in.png`);
  const mskUrl = await uploadToFal(maskUp, `dl_open_${TAG}_mask.png`);
  console.log(`  [gen] ${ENDPOINT} seed=${SEED} prompt ${PROMPT.length} chars`);
  const res = await runQueue(ENDPOINT, { image_url: imgUrl, mask_url: mskUrl, prompt: PROMPT, num_images: 1, output_format: 'png', safety_tolerance: '6', seed: SEED }, 'fill');
  const genUrl = (res.images && res.images[0] && res.images[0].url) || (res.image && res.image.url);
  if (!genUrl) throw new Error('no image url: ' + JSON.stringify(res).slice(0,300));
  const genRaw = await downloadBuffer(genUrl);
  fs.writeFileSync(path.join(DIR_RAW, `dl_open_${TAG}_raw.png`), genRaw);

  const genUp = await uploadToFal(genRaw, `dl_open_${TAG}_gen.png`);
  const nobg = await runQueue('fal-ai/birefnet/v2', { image_url: genUp }, 'birefnet');
  const nobgBuf = await downloadBuffer(nobg.image.url);
  const gen = await loadRGBA(await sharp(nobgBuf).resize(W, H, { kernel: 'lanczos3' }).png().toBuffer());

  const out = Buffer.alloc(W*H*4);
  let changed = 0;
  for (let i=0;i<W*H;i++) {
    const w = Math.max(0, Math.min(1, blend[i]));
    const ao = src.d[i*4+3]/255, an = gen.d[i*4+3]/255;
    const a = (1-w)*ao + w*an;
    out[i*4+3] = Math.round(a*255);
    if (a > 0.002) for (let c=0;c<3;c++) out[i*4+c] = Math.round(Math.max(0, Math.min(255, ((1-w)*src.d[i*4+c]*ao + w*gen.d[i*4+c]*an) / a)));
    if (w > 0.001) changed++;
  }
  const outBuf = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  fs.writeFileSync(OUTPUT, outBuf);
  console.log(`  [save] ${path.relative(ROOT, OUTPUT)} (${changed} px changed)`);
  console.log(`  [bbox] result ${JSON.stringify(bbox(await loadRGBA(outBuf)))}`);
})().catch(e => { console.error(String(e)); process.exit(1); });
