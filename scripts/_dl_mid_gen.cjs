/**
 * Generiert EIN Tile fuer die dock_large-Reihe: eine offene Stellflaeche
 * (Deck, kein Hangar), diagonal ueber den Rahmen laufend, an beiden Enden
 * vom Bildrand gekappt (wie solar_panel_mid). Text2img (flux/dev), danach
 * BG-Removal. Farbe/Ausrichtung werden NACH diesem Schritt per Grade und
 * Zuschnitt an dock_large_start_0.png angeglichen -- dieses Script liefert
 * nur den rohen Kandidaten nach assets/raw/nobg/cropped.
 *
 * Usage: node scripts/_dl_mid_gen.cjs --tag empty_a1 --seed 4001 [--prompt "..."]
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
const DIR_RAW = path.join(ROOT, 'assets', 'raw');
const DIR_NOBG = path.join(ROOT, 'assets', 'nobg');
const DIR_CROP = path.join(ROOT, 'assets', 'cropped');
for (const d of [DIR_RAW, DIR_NOBG, DIR_CROP]) fs.mkdirSync(d, { recursive: true });

const argOf = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const TAG = argOf('--tag', 'empty_a1');
const SEED = Number(argOf('--seed', '4001'));
const W = Number(argOf('--width', '768'));
const H = Number(argOf('--height', '768'));

const DEFAULT_PROMPT = [
  'Isometric 2.5D sci-fi game asset, a single rectangular section of a spaceship landing apron deck,',
  'photographed from directly above at a 26 degree isometric angle so it reads as a diamond-shaped plank.',
  'Worn weathered steel blue-grey painted metal tarmac surface with scuffs, scratches and grime,',
  'a thin black rubber expansion joint groove running along both long edges,',
  'a yellow and black diagonal hazard taxi stripe running along both long edges near the border,',
  'small rivets and panel seams. The plank is cut flat at both narrow ends by the edge of the frame,',
  'as if it is a cropped photo of a much longer continuous platform: no walls, no building, no railing,',
  'no corner post, no beacon, no ID plate, completely empty flat deck, nothing standing on it.',
  'Lit from upper left, plain white background, no text, no logos.',
].join(' ');
const promptFile = argOf('--prompt-file', null);
const PROMPT = promptFile ? fs.readFileSync(promptFile, 'utf8').trim().replace(/\s+/g, ' ') : argOf('--prompt', DEFAULT_PROMPT);
const NEGATIVE = argOf('--negative', 'cartoon, anime, text, watermark, people, landscape, terrain, grass, sand, top-down flat view, front view, building, wall, hangar, ship, vehicle');

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => { let data = ''; res.on('data', c => data += c); res.on('end', () => resolve(data)); });
    req.on('error', reject); if (body) req.write(body); req.end();
  });
}
function httpsGet(url, headers) { const u = new URL(url); return httpsRequest({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers }); }
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
async function generate(seed) {
  const body = JSON.stringify({ prompt: PROMPT, negative_prompt: NEGATIVE, image_size: { width: W, height: H }, num_inference_steps: 32, guidance_scale: 7.0, num_images: 1, enable_safety_checker: false, output_format: 'png', seed });
  const submit = JSON.parse(await httpsRequest({ hostname: 'queue.fal.run', path: '/fal-ai/flux/dev', method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` } }, body));
  if (!submit.status_url) throw new Error('submit failed: ' + JSON.stringify(submit).slice(0,300));
  process.stdout.write('    waiting');
  for (let i = 0; i < 150; i++) {
    await sleep(2000);
    const st = JSON.parse(await httpsGet(submit.status_url, { Authorization: `Key ${FAL_API_KEY}` }));
    if (st.status === 'COMPLETED') { const res = JSON.parse(await httpsGet(submit.response_url, { Authorization: `Key ${FAL_API_KEY}` })); process.stdout.write(' done\n'); return downloadBuffer(res.images[0].url); }
    if (st.status === 'FAILED') throw new Error('generation failed: ' + JSON.stringify(st));
    process.stdout.write('.');
  }
  throw new Error('timeout');
}
async function uploadToFal(buffer, fileName) {
  const init = JSON.parse(await httpsRequest({ hostname: 'rest.alpha.fal.ai', path: '/storage/upload/initiate', method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` } }, JSON.stringify({ content_type: 'image/png', file_name: fileName })));
  const u = new URL(init.upload_url);
  await new Promise((resolve, reject) => { const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'PUT', headers: { 'Content-Type': 'image/png', 'Content-Length': buffer.length.toString() } }, res => { res.on('data', () => {}); res.on('end', resolve); }); req.on('error', reject); req.write(buffer); req.end(); });
  return init.file_url;
}
async function removeBackground(imageUrl) {
  const raw = await httpsRequest({ hostname: 'queue.fal.run', path: '/fal-ai/birefnet/v2', method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` } }, JSON.stringify({ image_url: imageUrl }));
  const submit = JSON.parse(raw);
  if (!submit.status_url) throw new Error('bg submit failed: ' + raw.slice(0,300));
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    const st = JSON.parse(await httpsGet(submit.status_url, { Authorization: `Key ${FAL_API_KEY}` }));
    if (st.status === 'COMPLETED') { const res = JSON.parse(await httpsGet(submit.response_url, { Authorization: `Key ${FAL_API_KEY}` })); return downloadBuffer(res.image.url); }
    if (st.status === 'FAILED') throw new Error('bg removal failed');
  }
  throw new Error('bg timeout');
}

(async () => {
  const name = `dock_large_mid_${TAG}`;
  console.log(`[dl-mid-gen] ${name} seed=${SEED} ${W}x${H}`);
  const raw = await generate(SEED);
  fs.writeFileSync(path.join(DIR_RAW, `${name}_raw.png`), raw);
  console.log(`  [raw ] assets/raw/${name}_raw.png`);
  const url = await uploadToFal(raw, `${name}_raw.png`);
  const nobg = await removeBackground(url);
  fs.writeFileSync(path.join(DIR_NOBG, `${name}_nobg.png`), nobg);
  console.log(`  [nobg] assets/nobg/${name}_nobg.png`);
  const cropped = await sharp(nobg).trim({ threshold: 1 }).png().toBuffer();
  fs.writeFileSync(path.join(DIR_CROP, `${name}_cropped.png`), cropped);
  const m = await sharp(cropped).metadata();
  console.log(`  [crop] assets/cropped/${name}_cropped.png ${m.width}x${m.height}`);
})().catch(e => { console.error(String(e)); process.exit(1); });
