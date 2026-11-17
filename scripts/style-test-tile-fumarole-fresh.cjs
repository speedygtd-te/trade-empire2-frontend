/**
 * Style-test ONLY: 4 FRESH text-to-image HERO candidates (h1..h4) for the VOLCANIC
 * surface tile FUMAROLE. NO integration into src/, NO cap sync, NO commit.
 * Writes fumarole_new_h1..h4 — leaves the old f/g/h candidates untouched.
 *
 * METHOD (Rudi's explicit new direction): pure TEXT-TO-IMAGE from scratch — NO
 * ash_field / basalt_plain kontext base recycling (that was the failed path: the
 * recycled-base + yellow-sulfur-hole edits all read as too bright / uncontrolled
 * yellow). This time flux-pro/v1.1 generates a fresh flat top-down fumarole ground,
 * with MUTED desaturated ochre-grey sulfur only.
 *
 * Pipeline (verbatim T2I flow from scripts/basalt-plain-new-basis.cjs):
 *   flux-pro/v1.1 @512x512 top-down (FAL_API_KEY in scripts/.env)
 *   -> resize 512x256 (fill = 2:1 vertical isometric squash)
 *   -> diamond mask (alpha)  => real 512x256 iso tile
 *   -> _half (256x128) + per-hero 3x3 interlocking mosaic PNG
 * Then one combined side-by-side PNG of the 4 single diamonds for quick sharing.
 * Output: assets/style-test/tiles/fumarole_new_h<1..4>.png (+ _half + _mosaic)
 *         assets/style-test/tiles/fumarole-fresh-heroes.png (combined)
 *
 * Prompts are POSITIVE-framed (muted / desaturated / ochre-grey) — NOT a chain of
 * "no bright yellow" negatives (those reintroduce the thing). Fumarole = steam/gas
 * vents, NOT lava: no glow, no molten, no orange.
 *
 * fal key in scripts/.env (FAL_API_KEY) — never hardcode / commit.
 *
 * Usage: node scripts/style-test-tile-fumarole-fresh.cjs [h1 h2 ...]
 *   optional level list -> re-roll only those (seed += 137)
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
const OUT = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');

// Shared positive-only fragments.
//   PREFIX — flat top-down aerial framing, full-bleed texture (verbatim family style).
//   GROUND — the fumarole identity: dark cracked basalt + scattered small gas VENT
//            HOLES, each ringed by DULL MUTED desaturated pale-ochre / greyish-yellow
//            sulfur crust (NOT bright, NOT saturated). Faint low pale steam wisps.
//   LAYOUT — the mandatory seamless / anti-hotspot tiling language.
//   TONE   — dark, desaturated, matte, somber; sulfur stays chalky muted ochre-grey,
//            never neon, never glowing; NO lava, NO glow (steam/gas, not molten).
const PREFIX = 'top-down aerial photograph, terrain texture filling entire image edge to edge, no sky, no horizon, no borders, no vignette, The Expanse sci-fi aesthetic, realistic';
// COLD / EXTINCT framing: the previous batch rendered glowing orange lava rims on
// the vents. Fumarole = cold steam/gas, NOT lava. Positively assert cold, dormant,
// dark cool vent interiors so FLUX does not add incandescent crater rims.
const GROUND = 'dark cold volcanic fumarole ground seen from directly above, cracked near-black basalt and cold dark grey volcanic rock, MANY small shallow cold dormant gas vent pits all of similar small size scattered evenly, each pit dark and cool and empty inside, no single large crater and no big central vent, the cold rock around the pits lightly stained and dusted with a dull muted desaturated pale ochre and greyish-yellow sulfur mineral crust like dried sulphur powder, faint thin wisps of pale grey cold steam hugging the ground, grimy matte and desaturated, somber cold dark mood, everything cold and extinct and dormant';
const LAYOUT = 'seamless tileable top-down ground texture, evenly distributed uniform texture across the whole image, the middle just as detailed as the edges, tiles placed edge-to-edge blend without visible seams or hotspots, no central feature, no large patches, no diagonal bands, no single bright element, uniform brightness across the tile';
const TONE = 'heavily desaturated, dark, dim cold lighting, muted grey-black volcanic palette, the vents are cold dark empty holes with cool dark interiors, the only colour on the rock is the dull chalky muted pale ochre greyish-yellow sulfur mineral dust, never bright yellow, never saturated, never neon, never glowing, never incandescent, no fire, no ember, no lava, no glow, no orange, cold dry sulfur powder not molten, soft light from upper left';

// 4 fresh candidates. Distinct fixed 6-digit seeds (NO Math.random). Same base look,
// small additive variation per hero (vent density / sulfur amount / haze / ashiness).
const CANDIDATES = {
  // h1 — very dark, few vents, minimal sulfur; the darkest / most restrained.
  // h1 — SULFUR-STAINING-FORWARD (h4-style that avoided glow): flat dry ochre-grey
  // sulfur dusting spread over cold cracked rock, vents only as tiny dark specks.
  h1: {
    seed: 815003,
    prompt: `${PREFIX}, dark cold volcanic fumarole ground seen from directly above, cold cracked near-black basalt and dark grey rock lightly and evenly stained and dusted all over with a dull muted desaturated pale ochre and greyish-yellow dry sulfur powder crust, the sulfur is a flat dry chalky surface stain spread thinly across the whole cold rock, only a few tiny dark cool specks as small cold gas vents, no crater, no hole, no pit rim, faint thin pale grey cold steam hugging the ground, very dark overall the dark rock dominates and the sulfur staining is sparse and subtle, ${LAYOUT}, ${TONE}`,
    cap: 'h1 — dark, sparse flat muted sulfur staining, tiny specks only (most restrained)',
  },
  // h2 — moderate vents with muted sulfur rings (likely sweet spot).
  // h2 — SULFUR-STAINING-FORWARD, moderate coverage (likely sweet spot).
  h2: {
    seed: 926115,
    prompt: `${PREFIX}, dark cold volcanic fumarole ground seen from directly above, cold cracked near-black basalt and dark grey rock stained and dusted with a moderate even spread of dull muted desaturated pale ochre and greyish-yellow dry sulfur powder crust, the sulfur is a flat dry chalky surface stain distributed evenly in many small patches across the whole cold rock, only a few tiny dark cool specks as small cold gas vents, no crater, no hole, no pit rim, faint low pale grey cold steam wisps here and there, the dark basalt still dominates between the muted sulfur patches, ${LAYOUT}, ${TONE}`,
    cap: 'h2 — moderate flat muted sulfur staining, tiny specks only (likely sweet spot)',
  },
  // h3 — cracked ground + sulfur crust patches + a bit more steam.
  h3: {
    seed: 137742,
    prompt: `${PREFIX}, ${GROUND}, deeply cracked cold dark basalt with scattered cold dark vents and a few larger dull ochre-grey sulfur crust patches and dry stains dusting the cold rock, slightly more faint pale cold steam drifting low over the surface but still thin and flat, the dark rock still dominates, ${LAYOUT}, ${TONE}`,
    cap: 'h3 — cracked ground + muted sulfur crust patches + a little more low steam',
  },
  // h4 — ashier grey base with vent holes, sulfur present but subdued.
  h4: {
    seed: 348926,
    prompt: `${PREFIX}, ${GROUND}, the ground a bit more ashy dark grey and dusty, scattered small cold dark gas vents each with a faint dull ochre-grey sulfur dusting, a thin even ashen dusting over the cold rock, only the faintest low cold steam, ${LAYOUT}, ${TONE}`,
    cap: 'h4 — ashier grey base with cold vents, subdued muted sulfur',
  },
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

// Interior color / luma stats (alpha>8 only) — visual guard.
async function colorStats(maskedBuf) {
  const { data, info } = await sharp(maskedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    if (data[i + 3] < 8) continue;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  return { r: r / n, g: g / n, b: b / n, luma: luma(r / n, g / n, b / n) };
}
const fmtC = (c) => `R${c.r.toFixed(0)} G${c.g.toFixed(0)} B${c.b.toFixed(0)} luma${c.luma.toFixed(1)}`;

// Per-hero 3x3 interlocking diamond mosaic from the masked full tile
// (same geometry family as basalt-plain-new-basis.cjs mosaic).
async function mosaic(maskedBuf, outPath) {
  const HW = TILE_W / 2, HH = TILE_H / 2;
  const cols = 3, rows = 3;
  const place = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) place.push({ cx: (c - r) * HW, cy: (c + r) * HH });
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
  console.log(`[gen] ${level} seed ${cfg.seed}`);
  console.log(`  prompt="${cfg.prompt}"`);
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/v1.1', {
    prompt: cfg.prompt, image_size: { width: GEN_SIZE, height: GEN_SIZE },
    num_images: 1, enable_safety_checker: false, seed: cfg.seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no image url for ' + level + ': ' + JSON.stringify(r).slice(0, 200));
  const square = await download(url);
  const resized = await sharp(square).resize(TILE_W, TILE_H, { fit: 'fill' }).png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const full = path.join(OUT, `fumarole_new_${level}.png`);
  fs.writeFileSync(full, masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `fumarole_new_${level}_half.png`), half);
  await mosaic(masked, path.join(OUT, `fumarole_new_${level}_mosaic.png`));
  const c = await colorStats(masked);
  console.log(`[save] ${full} (+ _half, _mosaic)  cand[${fmtC(c)}]`);
  return masked;
}

// Combined side-by-side PNG of the 4 single diamonds on the dark grid bg.
async function buildCombined(masks) {
  const pad = 24, gap = 20;
  const n = masks.length;
  const canvasW = pad * 2 + n * TILE_W + (n - 1) * gap;
  const canvasH = pad * 2 + TILE_H;
  const comp = masks.map((m, i) => ({ input: m, left: pad + i * (TILE_W + gap), top: pad }));
  const out = await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 } } })
    .composite(comp).png().toBuffer();
  const p = path.join(OUT, 'fumarole-fresh-heroes.png');
  fs.writeFileSync(p, out);
  console.log(`[combined] ${p}`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2);
  const masks = [];
  for (const [level, cfg] of Object.entries(CANDIDATES)) {
    if (only.length && !only.includes(level)) continue;
    if (only.includes(level)) cfg.seed += 137;
    try { masks.push(await genLevel(level, cfg)); } catch (e) { console.error(`ERR ${level}: ${e.message}`); }
  }
  if (masks.length) { try { await buildCombined(masks); } catch (e) { console.error('ERR combined: ' + e.message); } }
  console.log('done');
})();
