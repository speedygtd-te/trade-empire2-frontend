/**
 * Weg A — reinforced BULK rebuild via multi-image kontext.
 * Inputs: [old standard hull (geometry/camera ref), reinforced floor square (material ref)].
 * Goal (Rudi): a MUCH bulkier, fortress-like reinforced hull — form theme, not detail.
 * CAMERA-LOCK is mandatory so geometry/aspect stay isometric & symmetric.
 *
 * Pipeline: kontext/max/multi -> birefnet bg-remove -> tight-crop -> footprint-fit 512x512.
 * NO src writes, NO cap sync, NO git. Output: assets/style-test/hull-batch/attempts/.
 *
 * Usage: node scripts/hull-reinforced-bulk-multi.cjs [attemptN]
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
const BATCH = path.join(ROOT, 'assets', 'style-test', 'hull-batch');
const OUT = path.join(BATCH, 'attempts');
const HULL = path.join(BATCH, 'hull_standard.png'); // geometry + camera reference
const FLOOR = path.join(ROOT, 'assets', 'hull_floors', 'reinforced', 'reinforced_floor_0.png'); // material ref

const PROMPT =
  'Using the first image (a dark isometric sci-fi cargo-container box) as the strict ' +
  'geometry and material reference, rebuild it as a MUCH BULKIER fortified version: ' +
  'visibly thicker walls, heavy protruding armor segments on all facades, massive ' +
  'chunky proportions, fortress-like, oversized corner reinforcements. Use the dark ' +
  'graphite material with clearly visible copper / warm-metal accent lines along the ' +
  'edges and seams, like in the second image — the copper accents must remain visible. ' +
  // CAMERA-LOCK (mandatory):
  'CAMERA LOCK: keep the EXACT same isometric 3/4 camera angle, the same 2:1 ' +
  'isometric projection, the same symmetric framing and the same upright orientation ' +
  'as the first image. Do not rotate, do not change the perspective, do not tilt. ' +
  'A single isolated object on a plain flat neutral grey background, soft lighting ' +
  'from the upper left. No yellow glow, no windows.';

function dataUri(buf, mime) { return `data:${mime};base64,${buf.toString('base64')}`; }
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
  const r = await fetchJson('fal-ai/birefnet', { image_url: dataUri(buf, 'image/png') });
  const url = (r.image && r.image.url) || (r.images && r.images[0] && r.images[0].url);
  if (!url) throw new Error('no bg-removed url: ' + JSON.stringify(r).slice(0, 200));
  return download(url);
}
async function fitFootprint(buf, size) {
  const trimmed = await sharp(buf).trim({ threshold: 10 }).toBuffer();
  return sharp(trimmed)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha().png().toBuffer();
}

(async () => {
  const attempt = parseInt(process.argv[2] || '1', 10);
  fs.mkdirSync(OUT, { recursive: true });
  const SIZE = (await sharp(path.join(BATCH, 'hull_reinforced.png')).metadata()).width; // 512
  const hullBuf = await sharp(fs.readFileSync(HULL)).png().toBuffer();
  const floorBuf = await sharp(fs.readFileSync(FLOOR)).png().toBuffer();
  console.log(`[input] standard-hull + reinforced-floor  seed=${78200 + attempt}`);

  const r = await fetchJson('fal-ai/flux-pro/kontext/max/multi', {
    prompt: PROMPT,
    image_urls: [dataUri(hullBuf, 'image/png'), dataUri(floorBuf, 'image/png')],
    seed: 78200 + attempt, guidance_scale: 3.5, num_images: 1,
    safety_tolerance: '5', output_format: 'png',
  });
  const genUrl = r.images && r.images[0] && r.images[0].url;
  if (!genUrl) throw new Error('no gen url: ' + JSON.stringify(r).slice(0, 200));
  const gen = await download(genUrl);
  fs.writeFileSync(path.join(OUT, `hull_reinforced_wegA${attempt}_gen.png`), gen);
  console.log(`[gen] hull_reinforced_wegA${attempt}_gen.png (${Math.round(gen.length / 1024)}KB)`);

  let nobg;
  try { nobg = await removeBg(gen); }
  catch (e) { console.error('[bg] ' + e.message + ' — using gen as-is'); nobg = gen; }
  const fitted = await fitFootprint(nobg, SIZE);
  const finalPath = path.join(OUT, `hull_reinforced_wegA${attempt}.png`);
  fs.writeFileSync(finalPath, fitted);
  const fm = await sharp(fitted).metadata();
  console.log(`[final] ${finalPath} ${fm.width}x${fm.height} alpha=${fm.hasAlpha}`);
  console.log('done');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
