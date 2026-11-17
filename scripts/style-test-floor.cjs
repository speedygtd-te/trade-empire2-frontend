/**
 * Style-test ONLY: generate standard_floor in 3 design directions.
 * Mirrors generate-hull-floor-assets.ts pipeline exactly:
 *   flux-pro v1.1 @ 512x512 -> resize 512x256 (fill) -> diamond mask (alpha).
 * Output: assets/style-test/floor_<dir>.png  (+ _half.png 256x128 for preview)
 * NO writes to src/assets.
 */
const fs = require('fs');
const path = require('path');
// Minimal .env loader (no dotenv dep)
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
const OUT = path.join(__dirname, '..', 'assets', 'style-test');

const DIAMOND_MASK_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}">
    <polygon points="${TILE_W / 2},0 ${TILE_W},${TILE_H / 2} ${TILE_W / 2},${TILE_H} 0,${TILE_H / 2}" fill="white"/>
  </svg>`
);

// Same framing as existing STANDARD floor prompt: top-down, fills frame, no walls/sky.
const BASE = 'top-down aerial photograph, interior floor texture filling entire image edge to edge, no sky, no walls, no borders, no vignette, sci-fi industrial aesthetic, realistic, seamless tileable floor section';

const DIRECTIONS = {
  warm_deck: {
    seed: 71000,
    prompt: `${BASE}, light desaturated warm grey industrial deck plating from directly above, uniform repeating square floor panels, thin subtle copper seam lines, weathered concrete-steel surface, even flat lighting, mid-tone neutral, calm uniform low-contrast detail, NO yellow paint, NO orange hazard stripes, NO chevron markings, NO central focal point`,
  },
  clean_station: {
    seed: 72000,
    prompt: `${BASE}, clean off-white aluminum floor panels from directly above, uniform repeating grid of identical square panels, fine recessed panel seams, sterile sci-fi station deck, even flat diffuse lighting, no bright hotspot, minimal subtle wear, bright neutral mid-tone, calm uniform low-contrast detail, NO yellow markings, NO central console, NO radial pattern, NO central focal point`,
  },
  dark_graphite: {
    seed: 73000,
    prompt: `${BASE}, dark graphite anthracite deck plating from directly above, thin copper accent seam lines, industrial sci-fi floor panels, mid-dark neutral surface, calm low-contrast detail, NO yellow hazard stripes`,
  },
};

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
        if (res.statusCode >= 400) { reject(new Error(`fal ${res.statusCode}: ${raw.slice(0,300)}`)); return; }
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('bad json ' + raw.slice(0,200))); }
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
async function diamond(buf) {
  const resized = await sharp(buf).resize(TILE_W, TILE_H, { fit: 'fill' }).png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  return sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

async function gen(name, cfg) {
  console.log(`[gen] ${name}`);
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/v1.1', {
    prompt: cfg.prompt, image_size: { width: GEN_SIZE, height: GEN_SIZE },
    num_images: 1, enable_safety_checker: false, seed: cfg.seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no image url for ' + name);
  const raw = await download(url);
  const masked = await diamond(raw);
  const full = path.join(OUT, `floor_${name}.png`);
  fs.writeFileSync(full, masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `floor_${name}_half.png`), half);
  console.log(`[save] ${full} (${Math.round(masked.length/1024)}KB)`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv[2]; // optional: re-roll a single direction
  for (const [name, cfg] of Object.entries(DIRECTIONS)) {
    if (only && only !== name) continue;
    if (only === name) cfg.seed += 137; // re-roll variation
    try { await gen(name, cfg); } catch (e) { console.error(`ERR ${name}: ${e.message}`); }
  }
  console.log('done');
})();
