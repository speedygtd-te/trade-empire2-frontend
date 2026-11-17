/**
 * Additive single-image detail pass on the ACCEPTED hull sprites (v4 stand).
 * Model: fal-ai/flux-pro/kontext (single image + instruction).
 * Purely additive: geometry / material / colors / lighting stay identical,
 * only the new detail is added on top.
 *
 * Pipeline per type: kontext edit -> (birefnet bg-remove if bg introduced)
 * -> tight-crop -> uniform footprint-fit back onto original 512x512.
 *
 * NO src writes, NO cap sync, NO git. Outputs to assets/style-test/hull-batch/attempts/.
 *
 * Usage: node scripts/hull-detail-additive.cjs <airtight|reinforced> [attemptN] [guidance]
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

const PROMPTS = {
  // attempt 1
  airtight:
    'Add three large round porthole windows with thick metal frames to the two ' +
    'visible side facades of this box (two portholes on the left facade, one on the ' +
    'right facade), each with glowing warm interior light behind thick glass. The ' +
    'portholes must be large and clearly visible. Change nothing else: keep the exact ' +
    'same isometric cube geometry, the same very dark graphite material, the same ' +
    'green seam accents, the same darkness and lighting, the same background. Keep ' +
    'everything else identical.',
  reinforced:
    'Bolt four large rectangular armor plates onto the visible facades of this box, ' +
    'each overlapping plate slightly raised in 3D with a clearly visible grid of ' +
    'chunky rivets running along all its edges. The armor plates and rivets must be ' +
    'large and clearly visible. Change nothing else: keep the exact same isometric ' +
    'cube geometry, the same dark metal material, the same copper accent lines, the ' +
    'same darkness and lighting, the same background. Keep everything else identical.',
  // attempt 2 (escalated)
  airtight2:
    'Add three large round porthole windows, evenly spaced, to the visible side ' +
    'facades of this box: TWO big round portholes on the left-facing facade AND ONE ' +
    'big round porthole on the right-facing facade. Every porthole has a thick ' +
    'protruding metal ring frame and bright glowing warm-yellow interior light behind ' +
    'thick glass. Make all three portholes large, round and unmistakable. The right ' +
    'facade MUST also get its porthole. Change nothing else: keep the exact same ' +
    'isometric cube geometry, the same very dark graphite material, the same green ' +
    'seam accents, the same darkness, lighting and background. Keep everything else ' +
    'identical.',
  reinforced2:
    'Cover the two visible side facades of this box with heavy bolted-on armor: thick ' +
    'rectangular steel plates that visibly protrude in 3D from the surface, casting ' +
    'small shadows, and along every edge of every plate a dense row of big round ' +
    'protruding rivet heads / bolt studs, like riveted battleship armor. The rivets ' +
    'and the raised plate edges must be the most prominent feature, large and ' +
    'unmistakable. Keep the same overall isometric cube geometry, the same dark metal ' +
    'tone, the same copper accent lines, the same darkness and lighting and ' +
    'background. Only add the bolted armor plating on top.',
  // attempt 3 (further escalated)
  airtight3:
    'This dark sci-fi cargo box has a left-facing side and a right-facing side. Put ' +
    'TWO large glowing round portholes on the LEFT side and ONE large glowing round ' +
    'round porthole on the RIGHT side. Three portholes total, one of them clearly on ' +
    'the right-facing facade. Thick metal ring frames, bright warm interior glow ' +
    'through glass. Do not omit the right-side porthole. Everything else stays exactly ' +
    'as it is: dark graphite material, green seams, geometry, lighting, background.',
  reinforced3:
    'Heavily up-armor this dark sci-fi box. On both visible side facades add thick ' +
    'protruding rectangular metal armor plates and surround each plate edge with a ' +
    'continuous line of large hemispherical rivet bolt heads. Exaggerate the rivets ' +
    'so they are big and obvious, like a riveted iron battleship hull or a riveted ' +
    'bank vault door. The plates clearly stand proud of the surface with cast shadow. ' +
    'Keep the cube geometry, dark metal tone, copper accents, lighting and background ' +
    'unchanged — only add the chunky riveted armor plating.',
  // airtight CORRECTION round (Rudi spec): silver mirror windows, NO yellow/glow
  airtight4:
    'Add exactly one large rectangular window to each of the two visible side ' +
    'facades of this box — one window on the left-facing facade and one window on ' +
    'the right-facing facade. The windows are flush mounted, made of mirror-like ' +
    'reflective silver glass like polished chrome, showing a cold neutral reflection, ' +
    'with a thick dark metal frame. NO warm light, NO yellow, NO glow, no round ' +
    'portholes. Change nothing else: keep the exact same isometric cube geometry, ' +
    'the same very dark graphite material, the same green seam accents, the same ' +
    'darkness, lighting and background. Keep everything else identical.',
  // reinforced BULK rebuild (Rudi spec): form, not detail — struct edit on current reinforced
  reinforced_bulk:
    'Make the entire structure visibly bulkier and more massive: thicken all walls ' +
    'and edges, add heavy protruding armor blocks on the facades and oversized corner ' +
    'reinforcements, give it a fortress-like silhouette. Keep the dark graphite ' +
    'material, the copper accents, the isometric perspective and the overall ' +
    'proportions of the base box.',
  reinforced_bulk2:
    'Drastically beef up this box into a heavy fortress block: make the walls MUCH ' +
    'thicker so each facade reads as a slab of solid armor, add large protruding ' +
    'armor blocks bolted across every facade, and replace the corners with massive ' +
    'oversized corner reinforcement pillars that bulge outward. The silhouette must ' +
    'look heavy, chunky and bunker-like — clearly far more massive than before. Keep ' +
    'the dark graphite material and the copper / warm-metal accent lines clearly ' +
    'visible, keep the isometric 3/4 camera angle and the upright symmetric framing.',
};

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

// tight-crop on alpha, then fit (contain) into a transparent SIZE x SIZE canvas.
async function fitFootprint(buf, size) {
  const trimmed = await sharp(buf).trim({ threshold: 10 }).toBuffer();
  return sharp(trimmed)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .png()
    .toBuffer();
}

(async () => {
  const typ = (process.argv[2] || '').toLowerCase();
  if (!PROMPTS[typ]) { console.error('type must be airtight|reinforced'); process.exit(1); }
  const attempt = parseInt(process.argv[3] || '1', 10);
  const guidance = parseFloat(process.argv[4] || '4.5');
  // optional: explicit prompt key (e.g. airtight4, reinforced_bulk) + input override
  const promptOverride = process.argv[5];
  const inputOverride = process.argv[6]; // path relative to ROOT
  // escalate prompt by attempt: a1 -> base, a2 -> <typ>2, a3 -> <typ>3
  const promptKey = promptOverride && PROMPTS[promptOverride]
    ? promptOverride
    : (attempt >= 2 && PROMPTS[`${typ}${attempt}`] ? `${typ}${attempt}` : typ);
  const prompt = PROMPTS[promptKey];
  fs.mkdirSync(OUT, { recursive: true });

  const inputPath = inputOverride
    ? path.join(ROOT, inputOverride)
    : path.join(BATCH, `hull_${typ}.png`);
  const meta = await sharp(inputPath).metadata();
  const SIZE = meta.width; // match original footprint exactly (512)
  const inBuf = await sharp(fs.readFileSync(inputPath)).png().toBuffer();
  console.log(`[input] ${typ} ${meta.width}x${meta.height} guidance=${guidance} seed=${77100 + attempt} promptKey=${promptKey}`);

  const r = await fetchJson('fal-ai/flux-pro/kontext', {
    prompt, image_url: dataUri(inBuf, 'image/png'),
    seed: 77100 + attempt, guidance_scale: guidance, num_images: 1,
    safety_tolerance: '5', output_format: 'png',
  });
  const genUrl = r.images && r.images[0] && r.images[0].url;
  if (!genUrl) throw new Error('no gen url: ' + JSON.stringify(r).slice(0, 200));
  const gen = await download(genUrl);
  const genPath = path.join(OUT, `hull_${typ}_a${attempt}_gen.png`);
  fs.writeFileSync(genPath, gen);
  console.log(`[gen] ${genPath} (${Math.round(gen.length / 1024)}KB)`);

  // bg-remove (Kontext often returns opaque bg) -> footprint fit
  let nobg;
  try { nobg = await removeBg(gen); }
  catch (e) { console.error('[bg] ' + e.message + ' — using gen as-is'); nobg = gen; }
  const fitted = await fitFootprint(nobg, SIZE);
  const finalPath = path.join(OUT, `hull_${typ}_a${attempt}.png`);
  fs.writeFileSync(finalPath, fitted);
  const fm = await sharp(fitted).metadata();
  console.log(`[final] ${finalPath} ${fm.width}x${fm.height} alpha=${fm.hasAlpha}`);
  console.log('done');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
