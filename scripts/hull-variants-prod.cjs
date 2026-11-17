/**
 * HULL VARIANTS — PRODUCTION (Schritt 2).
 *
 * Je Hull-Typ 3 Varianten (_1.._3) aus der abgenommenen Basis (Variante 0)
 * ableiten. Sieger-Methode aus der Kalibrierung:
 *   fal-ai/flux/dev/image-to-image  strength 0.45.
 * (Kontext war zu kopie-nah, 0.35 zu subtil; 0.45 = sichtbar variiert,
 *  Objekt-Aspect-Abweichung ~0.4%, kein Squash/keine Drehung.)
 *
 * Quelle je Typ: src/assets/hulls/<typ>/<typ>_0.webp (NICHT verändern).
 *
 * Pipeline je Variante:
 *   i2i (strength 0.45, 512x512) -> birefnet bg-remove (falls opak) ->
 *   tight-crop -> ASPECT-ERHALTENDER footprint-fit auf bbox+offset der Basis
 *   (Math.min-Scale, kein Squash) -> 512x512 RGBA PNG.
 *
 * Sichtprüfung erfolgt per Read am Output + Aspect-Messung im Log/HTML.
 * Re-roll einer einzelnen Variante: `<typ> <n> <seed>`.
 *
 * Output: assets/style-test/hull-variants/<typ>_<n>.png  (+ je-Typ HTML)
 * KEINE src-writes, KEIN cap sync, KEIN git.
 *
 * Usage:
 *   node scripts/hull-variants-prod.cjs                 # alle Typen, v1..3
 *   node scripts/hull-variants-prod.cjs reinforced      # ein Typ
 *   node scripts/hull-variants-prod.cjs reinforced 2 99123   # reroll eine Variante
 *   node scripts/hull-variants-prod.cjs --html          # nur HTMLs neu bauen
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

const STRENGTH = 0.45, GEN = 512;
const ROOT = path.join(__dirname, '..');
const HULLS = path.join(ROOT, 'src', 'assets', 'hulls');
const OUT = path.join(ROOT, 'assets', 'style-test', 'hull-variants');

const TYPES = ['standard', 'starter', 'reinforced', 'airtight', 'pressurized',
  'platform_outdoor', 'platform_space', 'platform_underwater',
  // Runde 3 (2026-09): Basis liegt noch im Staging (assets/hulls/<t>/<t>_0.png),
  // nicht in src — basePath() faellt darauf zurueck.
  'composite', 'composite_platform_space', 'glass_carbon'];

// Geometry guard shared by all i2i prompts. strength 0.45 keeps structure;
// the text reinforces "same geometry / no rotation / panel-layout variation".
const GEO = 'same cube geometry and same three-quarter isometric perspective, ' +
  'not rotated, not tilted, not compressed, panel details / vents / seams / ' +
  'doors rearranged into a slightly different layout, isolated single object ' +
  'on a plain flat neutral grey background, no yellow';
const GEO_PLATFORM = 'same flat open platform geometry with railings and a ' +
  'machinery base, same three-quarter isometric perspective, not rotated, not ' +
  'tilted, not compressed, deck panel details / grating / railing segments ' +
  'rearranged into a slightly different layout, stays an open flat platform ' +
  '(not a closed box), isolated single object on a plain flat neutral grey ' +
  'background, no yellow';

// Per-type family/material description (matches the accepted base look).
const FAMILY = {
  standard: 'isometric sci-fi cubic hull module, dark charcoal graphite metal panels with subtle cyan glowing edge lines',
  starter: 'isometric sci-fi cubic hull module, rusty weathered scratched corroded metal panels with reddish-brown oxidation',
  reinforced: 'isometric sci-fi cubic hull module, heavily armored dark graphite panels with bolted-on armor plates, chunky rivets and copper-toned metal accents',
  airtight: 'isometric sci-fi cubic hull module, very dark near-black graphite panels with rubber gasket seal seams along the edges, small green accent lights and sealed mirror windows',
  pressurized: 'isometric sci-fi cubic hull module, dark graphite panels with navy-blue steel reinforcement beam elements across the faces and copper-toned bolt accents',
  platform_outdoor: 'isometric sci-fi open platform with safety railings and a machinery base, weathered dark graphite metal with perforated metal grating',
  platform_space: 'isometric sci-fi open platform with safety railings and a machinery base, void-black near-black metal with faint cool starlight glints across the surface',
  platform_underwater: 'isometric sci-fi open platform with safety railings and a machinery base, dark graphite metal with glowing teal accent strips and a wet glistening water-slicked look',
  // Runde 3 — Material laut abgenommener Basis (navy-Lack gegen Karbon + Gelbbaender).
  composite: 'isometric sci-fi cubic hull module, deep dark naval navy blue lacquered armor plates with a satin sheen, matt anthracite woven carbon fibre corner posts and edge frame rails, wide bold yellow warning bands with big black diagonal chevron stripes running along the corner posts and the top edge rails, small warm amber indicator lights, bolted plate fittings',
  composite_platform_space: 'isometric sci-fi open platform with safety railings and a machinery base, deep dark naval navy blue lacquered armored deck plating, matt anthracite woven carbon fibre railings and edge beams, a wide bold yellow warning band with big black diagonal chevron stripes running around the machinery base skirt, dim warm white running lights',
  glass_carbon: 'isometric sci-fi cubic hull module, dark tinted full-height glass panes set into a matt anthracite woven carbon fibre chassis with heavy corner posts, bolted edge frame rails and a flat top slab with a central hatch, bright glowing cyan edge light strips, the glass panes stay solid and opaque',
};

const PLATFORM = new Set(['platform_outdoor', 'platform_space', 'platform_underwater',
  'composite_platform_space']);
// Massive Koerper: innenliegende Transparenz (birefnet schneidet Glas / dunkle
// Flaechen heraus) wird versiegelt. Die Plattformen sind offene Gestelle —
// dort ist Durchsicht Familienkonvention und darf NICHT versiegelt werden.
const SEAL = new Set(['composite', 'glass_carbon']);
const SEED_BASE = { standard: 881000, starter: 882000, reinforced: 883000, airtight: 884000,
  pressurized: 885000, platform_outdoor: 886000, platform_space: 887000, platform_underwater: 888000,
  composite: 1271100, composite_platform_space: 1233100, glass_carbon: 1452100 };

// "no yellow" war gegen den Gelbstich der ersten Runde gerichtet — bei den
// composite-Huellen IST Gelb aber ein abgenommenes Merkmal (Warnbaender), dort
// muss der Satzteil raus, sonst arbeitet der Prompt gegen die Familie.
const KEEP_YELLOW = new Set(['composite', 'composite_platform_space']);
const promptFor = (t) => {
  const geo = PLATFORM.has(t) ? GEO_PLATFORM : GEO;
  return `${FAMILY[t]}, ${KEEP_YELLOW.has(t) ? geo.replace(', no yellow', '') : geo}`;
};
// Basis: bevorzugt der integrierte Bestand, sonst das Abnahme-Staging.
function basePath(t) {
  const inSrc = path.join(HULLS, t, `${t}_0.webp`);
  if (fs.existsSync(inSrc)) return inSrc;
  const staged = path.join(ROOT, 'assets', 'hulls', t, `${t}_0.png`);
  if (fs.existsSync(staged)) return staged;
  throw new Error(`keine Basis fuer ${t} (weder ${inSrc} noch ${staged})`);
}

function dataUri(buf) { return `data:image/png;base64,${buf.toString('base64')}`; }
function fetchJson(model, body) {
  return new Promise((resolve, reject) => {
    const u = new URL('https://fal.run/' + model);
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { Authorization: `Key ${FAL_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      const c = []; res.on('data', (d) => c.push(d));
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
async function fitToBase(croppedBuf, o) {
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
/** Innenliegende (vom Rand nicht erreichbare) Transparenz auf Alpha 255 setzen.
 *  RGB kommt aus der GENERIERUNG vor der Hintergrundentfernung — birefnet nullt
 *  die Farbe unter dem entfernten Alpha, ein Versiegeln auf dessen Puffer
 *  liefert sonst schwarze Loecher in den Scheiben (LESSONS / hull-new3-kontext). */
async function sealAlpha(buf, genBuf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, C = info.channels;
  let src = null;
  if (genBuf) {
    const g = await sharp(genBuf).ensureAlpha().resize(w, h, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    if (g.info.channels === C) src = g.data;
  }
  const outside = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => { const p = y * w + x; if (!outside[p] && data[p * C + 3] < 250) { outside[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const p = stack.pop(), x = p % w, y = (p - x) / w;
    if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1);
  }
  let sealed = 0;
  const out = Buffer.from(data);
  for (let p = 0; p < w * h; p++) {
    if (!outside[p] && data[p * C + 3] < 250) {
      if (src) { out[p * C] = src[p * C]; out[p * C + 1] = src[p * C + 1]; out[p * C + 2] = src[p * C + 2]; }
      out[p * C + 3] = 255; sealed++;
    }
  }
  return { buf: await sharp(out, { raw: { width: w, height: h, channels: C } }).png().toBuffer(), sealed };
}

async function i2i(baseUri, prompt, seed) {
  const r = await fetchJson('fal-ai/flux/dev/image-to-image', {
    image_url: baseUri, prompt, strength: STRENGTH,
    image_size: { width: GEN, height: GEN }, num_inference_steps: 40,
    guidance_scale: 3.5, num_images: 1, enable_safety_checker: false, seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no i2i url');
  return download(url);
}

async function genVariant(t, n, seedOverride) {
  const baseBuf = await sharp(fs.readFileSync(basePath(t))).png().toBuffer();
  const o = await bbox(baseBuf);
  const baseAspect = o.bw / o.bh;
  const seed = seedOverride != null ? seedOverride : SEED_BASE[t] + n;
  console.log(`[i2i] ${t} v${n} s${STRENGTH} seed ${seed}`);
  const gen = await i2i(dataUri(baseBuf), promptFor(t), seed);
  fs.writeFileSync(path.join(OUT, `${t}_${n}_gen.png`), gen);
  let nobg; try { nobg = await removeBg(gen); } catch { nobg = gen; }
  let sealed = 0;
  if (SEAL.has(t)) {
    const s = await sealAlpha(nobg, gen);
    nobg = s.buf; sealed = s.sealed;
    console.log(`  [seal] ${sealed} innenliegende transparente Pixel auf Alpha 255`);
  }
  const cb = await bbox(nobg);
  const cropped = await sharp(nobg).extract({ left: cb.minX, top: cb.minY, width: cb.bw, height: cb.bh }).png().toBuffer();
  const objAspect = cb.bw / cb.bh;
  const fitted = await fitToBase(cropped, o);
  fs.writeFileSync(path.join(OUT, `${t}_${n}.png`), fitted);
  const dev = ((objAspect - baseAspect) / baseAspect) * 100;
  console.log(`  -> ${t}_${n}.png objAspect ${objAspect.toFixed(4)} (base ${baseAspect.toFixed(4)}, dev ${dev.toFixed(2)}%)`);
  return { t, n, objAspect, baseAspect, dev, sealed, bbox: cb, baseBBox: o };
}

async function buildHtml(t) {
  const baseBuf = await sharp(fs.readFileSync(basePath(t))).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `${t}_0_ref.png`), baseBuf);
  const cell = (src, cap) => `<figure><img src="${src}"><figcaption>${cap}</figcaption></figure>`;
  const cells = [cell(`${t}_0_ref.png`, '<b>Variante 0 (Basis)</b>')];
  for (let n = 1; n <= 3; n++) if (fs.existsSync(path.join(OUT, `${t}_${n}.png`))) cells.push(cell(`${t}_${n}.png`, `<b>Variante ${n}</b>`));
  const html = `<!doctype html><meta charset=utf8><title>${t} — Hull variants</title>
<style>body{background:#222;color:#eee;font-family:system-ui;margin:16px}
.row{display:flex;gap:14px;flex-wrap:wrap}figure{margin:0}
img{width:300px;height:300px;background:repeating-conic-gradient(#444 0 25%,#333 0 50%) 0 0/24px 24px;border:1px solid #555}
figcaption{font-size:13px;margin-top:6px}</style>
<h2>${t} — Basis + 3 Varianten</h2><div class=row>${cells.join('\n')}</div>`;
  fs.writeFileSync(path.join(OUT, `${t}.html`), html);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const htmlOnly = process.argv.includes('--html');
  const only = args[0];
  const oneN = args[1] ? parseInt(args[1], 10) : null;
  const oneSeed = args[2] ? parseInt(args[2], 10) : null;
  const list = only ? [only] : TYPES;

  if (!htmlOnly) {
    for (const t of list) {
      if (oneN) { try { await genVariant(t, oneN, oneSeed); } catch (e) { console.error(`ERR ${t} v${oneN}: ${e.message}`); } continue; }
      for (let n = 1; n <= 3; n++) { try { await genVariant(t, n); } catch (e) { console.error(`ERR ${t} v${n}: ${e.message}`); } }
    }
  }
  for (const t of list) await buildHtml(t);
  console.log('done. staging:', OUT);
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
