/**
 * Style-test ONLY: follow-up round on Rudi's chosen fumarole HERO h1 (seed 815140).
 * 4 NEW variants of the SAME h1 prompt, each a BIT DARKER — NO integration, NO
 * commit, NO cap sync. Writes fumarole_h1dark_1..4 — leaves fumarole_new_h1.* (the
 * praised version) untouched.
 *
 * DARKENING METHOD (Rudi): do NOT darken via the prompt (prompt-darkening brings
 * back FLUX's vertical top-bright gradient). Instead keep the h1 generation flow and
 * darken UNIFORMLY in post with sharp .modulate({ brightness }) — a pure multiply,
 * so it introduces NO gradient. Moderate ("etwas"), not pitch black. Hue/saturation
 * untouched so the warm-golden sulfur stays visible, just dimmer (never muddy brown).
 *
 * A per-tile TOP-vs-BOTTOM interior-luma delta is printed as a gradient guard.
 *
 * Pipeline (verbatim h1 flow from style-test-tile-fumarole-fresh.cjs):
 *   flux-pro/v1.1 @512x512 top-down (SAME h1 prompt, 4 NEW seeds)
 *   -> resize 512x256 (fill = 2:1 iso squash)
 *   -> UNIFORM darken .modulate({ brightness: DARK })   <-- new step
 *   -> diamond mask (alpha)
 *   -> _half (256x128) + per-tile 3x3 interlocking mosaic
 * Then one combined side-by-side PNG (fumarole-h1dark-heroes.png).
 * Output: assets/style-test/tiles/fumarole_h1dark_<1..4>.png (+ _half + _mosaic)
 *
 * fal key in scripts/.env (FAL_API_KEY) — never hardcode / commit.
 * Usage: node scripts/style-test-tile-fumarole-h1dark.cjs [1 2 ...]
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
if (!FAL_API_KEY) { console.error('No fal key (FAL_API_KEY in scripts/.env)'); process.exit(1); }
const https = require('https');
const http = require('http');
const sharp = require('sharp');

const TILE_W = 512, TILE_H = 256, GEN_SIZE = 512;
const DARK = 0.85; // uniform brightness multiplier — moderate "etwas dunkler" (0.82..0.88 range)
const OUT = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');

// --- EXACT h1 prompt fragments (verbatim from style-test-tile-fumarole-fresh.cjs) ---
const PREFIX = 'top-down aerial photograph, terrain texture filling entire image edge to edge, no sky, no horizon, no borders, no vignette, The Expanse sci-fi aesthetic, realistic';
const LAYOUT = 'seamless tileable top-down ground texture, evenly distributed uniform texture across the whole image, the middle just as detailed as the edges, tiles placed edge-to-edge blend without visible seams or hotspots, no central feature, no large patches, no diagonal bands, no single bright element, uniform brightness across the tile';
const TONE = 'heavily desaturated, dark, dim cold lighting, muted grey-black volcanic palette, the vents are cold dark empty holes with cool dark interiors, the only colour on the rock is the dull chalky muted pale ochre greyish-yellow sulfur mineral dust, never bright yellow, never saturated, never neon, never glowing, never incandescent, no fire, no ember, no lava, no glow, no orange, cold dry sulfur powder not molten, soft light from upper left';
const H1_PROMPT = `${PREFIX}, dark cold volcanic fumarole ground seen from directly above, cold cracked near-black basalt and dark grey rock lightly and evenly stained and dusted all over with a dull muted desaturated pale ochre and greyish-yellow dry sulfur powder crust, the sulfur is a flat dry chalky surface stain spread thinly across the whole cold rock, only a few tiny dark cool specks as small cold gas vents, no crater, no hole, no pit rim, faint thin pale grey cold steam hugging the ground, very dark overall the dark rock dominates and the sulfur staining is sparse and subtle, ${LAYOUT}, ${TONE}`;

// 4 NEW seeds (distinct from h1's 815140), same prompt.
const CANDIDATES = {
  1: { seed: 771013, cap: 'h1dark_1 — same h1 look, uniformly darkened' },
  2: { seed: 882027, cap: 'h1dark_2 — same h1 look, uniformly darkened' },
  3: { seed: 913041, cap: 'h1dark_3 — same h1 look, uniformly darkened' },
  4: { seed: 604059, cap: 'h1dark_4 — same h1 look, uniformly darkened' },
};

const DIAMOND_MASK_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}">
    <polygon points="${TILE_W / 2},0 ${TILE_W},${TILE_H / 2} ${TILE_W / 2},${TILE_H} 0,${TILE_H / 2}" fill="white"/>
  </svg>`
);

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
        if (res.statusCode >= 400) { reject(new Error(`fal ${res.statusCode}: ${raw.slice(0, 400)}`)); return; }
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('bad json ' + raw.slice(0, 200))); }
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

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// Interior mean color/luma AND top-half vs bottom-half luma (alpha>8 only). The
// top/bottom delta is the vertical-gradient guard — should be small (< ~6).
async function stats(maskedBuf) {
  const { data, info } = await sharp(maskedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let r = 0, g = 0, b = 0, n = 0, top = 0, tn = 0, bot = 0, bn = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    if (data[i + 3] < 8) continue;
    const L = luma(data[i], data[i + 1], data[i + 2]);
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    if (y < height / 2) { top += L; tn++; } else { bot += L; bn++; }
  }
  return { r: r / n, g: g / n, b: b / n, luma: luma(r / n, g / n, b / n), topBot: (top / tn) - (bot / bn) };
}

async function mosaic(maskedBuf, outPath) {
  const HW = TILE_W / 2, HH = TILE_H / 2;
  const place = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) place.push({ cx: (c - r) * HW, cy: (c + r) * HH });
  const minX = Math.min(...place.map(p => p.cx));
  const maxX = Math.max(...place.map(p => p.cx));
  const maxY = Math.max(...place.map(p => p.cy));
  const canvasW = (maxX - minX) + TILE_W;
  const canvasH = maxY + TILE_H;
  const comp = place.map(p => ({ input: maskedBuf, left: p.cx - minX, top: p.cy }));
  const out = await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 } } })
    .composite(comp).png().toBuffer();
  fs.writeFileSync(outPath, out);
}

async function genLevel(level, cfg) {
  console.log(`[gen] h1dark_${level} seed ${cfg.seed} brightness ${DARK}`);
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/v1.1', {
    prompt: H1_PROMPT, image_size: { width: GEN_SIZE, height: GEN_SIZE },
    num_images: 1, enable_safety_checker: false, seed: cfg.seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no image url for ' + level + ': ' + JSON.stringify(r).slice(0, 200));
  const square = await download(url);
  // resize -> UNIFORM darken (pure multiply, no gradient) -> diamond mask
  const resized = await sharp(square).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha().png().toBuffer();
  const darkened = await sharp(resized).modulate({ brightness: DARK }).png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(darkened).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const full = path.join(OUT, `fumarole_h1dark_${level}.png`);
  fs.writeFileSync(full, masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `fumarole_h1dark_${level}_half.png`), half);
  await mosaic(masked, path.join(OUT, `fumarole_h1dark_${level}_mosaic.png`));
  const s = await stats(masked);
  console.log(`[save] ${full}  luma ${s.luma.toFixed(1)}  R${s.r.toFixed(0)} G${s.g.toFixed(0)} B${s.b.toFixed(0)}  top-bot ${s.topBot.toFixed(1)}${Math.abs(s.topBot) > 6 ? '  <-- GRADIENT WARN' : ''}`);
  return masked;
}

async function buildCombined(masks) {
  const pad = 24, gap = 20, n = masks.length;
  const cw = pad * 2 + n * TILE_W + (n - 1) * gap, ch = pad * 2 + TILE_H;
  const comp = masks.map((m, i) => ({ input: m, left: pad + i * (TILE_W + gap), top: pad }));
  const out = await sharp({ create: { width: cw, height: ch, channels: 4, background: { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 } } })
    .composite(comp).png().toBuffer();
  const p = path.join(OUT, 'fumarole-h1dark-heroes.png');
  fs.writeFileSync(p, out);
  console.log(`[combined] ${p}`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2);
  const masks = [];
  for (const [level, cfg] of Object.entries(CANDIDATES)) {
    if (only.length && !only.includes(level)) continue;
    try { masks.push(await genLevel(level, cfg)); } catch (e) { console.error(`ERR ${level}: ${e.message}`); }
  }
  if (masks.length === 4) { try { await buildCombined(masks); } catch (e) { console.error('ERR combined: ' + e.message); } }
  console.log('done');
})();
