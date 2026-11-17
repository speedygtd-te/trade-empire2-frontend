/**
 * Style-test ONLY: generate the 8 type-HERO floor tiles in the approved
 * "Dark Graphite v3" look. Heroes only — NO i2i variants, NO writes to src/.
 *
 * Pipeline (identical to style-test-floor-v3 / -i2i hero path):
 *   flux-pro v1.1 @512x512 top-down  (FAL_API_KEY in scripts/.env)
 *   -> resize 512x256 (fill)
 *   -> vertical gradient correction (per-row additive luma equalize)
 *   -> diamond mask (alpha)
 *   Output: assets/style-test/heroes/floor_hero_<typ>.png (+ _half.png)
 *
 * The 512x512 SOURCE SQUARE of each hero is cached to
 *   assets/raw/floor_hero_<typ>_square.png
 * (later reused as the i2i init image for the per-tile variants).
 *
 * "standard" is NOT regenerated: the existing v3 hero already IS the standard
 * hero. We copy floor_dark_graphite_v3.png -> heroes/floor_hero_standard.png
 * and floor_hero_v3_square.png -> floor_hero_standard_square.png.
 *
 * Usage: node scripts/style-test-floor-heroes.cjs [onlyType]
 *   onlyType optional -> re-roll just that type (seed += 137 per call)
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
const http = require('http');
const sharp = require('sharp');

const TILE_W = 512, TILE_H = 256, GEN_SIZE = 512;
const ST = path.join(__dirname, '..', 'assets', 'style-test');
const OUT = path.join(ST, 'heroes');
const RAW = path.join(__dirname, '..', 'assets', 'raw');

// ---- v3 base prompt (verbatim from style-test-floor-v3.cjs) ---------------
const BASE = 'top-down aerial photograph, interior floor texture filling entire image edge to edge, no sky, no walls, no borders, no vignette, sci-fi industrial aesthetic, realistic, seamless tileable floor section';
const EVEN = 'perfectly even uniform lighting across entire surface, flat ambient light, no vertical gradient, no bright top edge, no vignette, consistent brightness corner to corner';
// the dark-graphite "family" core (same as v3 hero), minus type specifics
const FAMILY = 'very dark charcoal near-black graphite deck plating from directly above, dim moody industrial lighting, dark sci-fi atmosphere, deep shadows, mid-dark to near-black neutral surface, calm low-contrast detail, NO yellow hazard stripes, NO bright glowing lines';
// copper accent (default for most types)
const COPPER = 'sparse faint dimmed copper accent seam lines, low-glow muted copper';

function p(typeExtra, accent) {
  return `${BASE}, ${EVEN}, ${typeExtra}, ${accent || COPPER}, ${FAMILY}`;
}

// 73500 = v3 hero seed; type seeds offset so each type is its own deterministic roll
const TYPES = {
  // standard handled separately (copy of v3 hero) — listed for ordering only
  starter: {
    seed: 73610,
    // Re-roll: "zu clean" -> deutlich rostiger/verwittert (bleibt simpel/duenn)
    prompt: p('simple thin deck panels, minimal detail, basic plating, sparse seams, heavily weathered rusty corroded surface, prominent reddish-brown rust patches everywhere, peeling oxidized metal, worn scratched grungy aged surface, distributed rust stains, no large central frame, no big concentric structure'),
  },
  reinforced: {
    seed: 81403,
    // Re-roll: "zu abstrakt" -> konkrete, klar lesbare Panzerung (kein Gelb!)
    prompt: p('heavy armored floor plates with visible thick bolted steel plates, clear rectangular armor panels in a repeating grid, chunky rivets, recognizable industrial plating, evenly tiled armor panels, no large central frame, no concentric structure, NO yellow, NO amber, NO orange, NO bright accent lines'),
  },
  airtight: {
    seed: 73630,
    prompt: p('sealed deck panels with gasket seams, airtight rubber seal lines between plates, pressure-sealed joints'),
  },
  pressurized: {
    seed: 73640,
    // Re-roll: zentrale Kupfer-Linie raus, Druck-Merkmale verteilt, keine grossen Rundelemente
    prompt: p('pressure-rated deck plating, no central conduit, no center line, many small relief valves and small round pressure ports scattered evenly across all panels, uniformly distributed small pressure features, no large central valve, no big round element, no dominant centerpiece, rounded panel corners'),
  },
  platform_outdoor: {
    seed: 90210,
    // Motiv-Wechsel: Lochblech statt walkway grating (grating erzeugte hartnaeckig zentralen Mittelsteg, 3x BLOCKED).
    // Endlos-Lochmuster, gleichmaessig, keine Mittelstruktur, keine grossen Segmente.
    prompt: p('industrial perforated metal sheet floor, one single continuous perforated sheet, uniform punched hole pattern, evenly spaced small round perforations repeating identically across the whole surface, continuous seamless texture, perfectly uniform perforations covering the entire image edge to edge, no panel seams, no dividing lines, no central walkway, no central spine, no vertical strip, no horizontal strip, no large distinct sections, no separate panels, no central panel, no big structural strip, no cropped structures at edges', 'no accent lines, no seam lines, only very sparse faint dimmed copper specks, low-glow muted copper, no bright copper, no orange glow'),
  },
  platform_space: {
    seed: 73660,
    prompt: p('extra dark void-black deck plating, faint starlight reflections, deep space platform'),
  },
  platform_underwater: {
    seed: 81902,
    // Re-roll: grosse Platten verkleinern/vergleichmaessigen, Teal-Akzent bleibt, kein Orange/Gelb
    // teal accent instead of copper
    prompt: p('dark graphite deck with small uniform sealed panels in a repeating grid, fine continuous plating pattern, evenly distributed teal-cyan accent seams, uniform small panels everywhere, no large slabs, no central structure, no concentric frame, no cropped elements at edges, sealed wet-environment plating, NO orange, NO amber, NO yellow, NO warm glow', 'sparse faint subtle teal-cyan accent seam lines only, low-glow muted teal, no warm colors'),
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

// --- vertical gradient correction (hero "40.5 -> ~0" fix) ------------------
async function correctVerticalGradient(buf) {
  const img = sharp(buf).removeAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const rowMean = new Float64Array(height);
  let globalMean = 0;
  for (let y = 0; y < height; y++) {
    let s = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      s += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    rowMean[y] = s / width;
    globalMean += rowMean[y];
  }
  globalMean /= height;
  const out = Buffer.from(data);
  for (let y = 0; y < height; y++) {
    const delta = globalMean - rowMean[y];
    if (delta === 0) continue;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      for (let c = 0; c < channels; c++) {
        let v = data[i + c] + delta;
        out[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
  return { buf: await sharp(out, { raw: { width, height, channels } }).png().toBuffer(), rowMean, globalMean, height };
}
function gradientStats(rowMean, height) {
  const topMean = (rowMean[0] + rowMean[1] + rowMean[2] + rowMean[3]) / 4;
  const botMean = (rowMean[height - 1] + rowMean[height - 2] + rowMean[height - 3] + rowMean[height - 4]) / 4;
  return Math.abs(topMean - botMean);
}

// resize square -> 512x256 -> vertical-gradient-correct -> diamond mask
async function postProcess(rawBuf, typ) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).png().toBuffer();
  const pre = await correctVerticalGradient(resized);
  const preDiff = gradientStats(pre.rowMean, pre.height);
  const post = await correctVerticalGradient(pre.buf);
  const postDiff = gradientStats(post.rowMean, post.height);
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(pre.buf).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const full = path.join(OUT, `floor_hero_${typ}.png`);
  fs.writeFileSync(full, masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `floor_hero_${typ}_half.png`), half);
  console.log(`[save] ${full} grad ${preDiff.toFixed(1)} -> ${postDiff.toFixed(1)}`);
}

async function genType(typ, cfg) {
  console.log(`[gen] ${typ} (seed ${cfg.seed})`);
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/v1.1', {
    prompt: cfg.prompt, image_size: { width: GEN_SIZE, height: GEN_SIZE },
    num_images: 1, enable_safety_checker: false, seed: cfg.seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no image url for ' + typ);
  const square = await download(url);
  // cache the 512x512 source square for later i2i
  fs.writeFileSync(path.join(RAW, `floor_hero_${typ}_square.png`), square);
  await postProcess(square, typ);
}

// standard = the already-approved v3 hero. Copy, do NOT regenerate.
function copyStandard() {
  const src = path.join(ST, 'floor_dark_graphite_v3.png');
  const srcHalf = path.join(ST, 'floor_dark_graphite_v3_half.png');
  const srcSquare = path.join(RAW, 'floor_hero_v3_square.png');
  fs.copyFileSync(src, path.join(OUT, 'floor_hero_standard.png'));
  if (fs.existsSync(srcHalf)) fs.copyFileSync(srcHalf, path.join(OUT, 'floor_hero_standard_half.png'));
  else {
    // derive half if missing
    sharp(src).resize(256, 128, { fit: 'fill' }).png().toFile(path.join(OUT, 'floor_hero_standard_half.png'));
  }
  fs.copyFileSync(srcSquare, path.join(RAW, 'floor_hero_standard_square.png'));
  console.log('[copy] standard <- v3 hero');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(RAW, { recursive: true });
  const only = process.argv[2];

  if (!only || only === 'standard') copyStandard();

  for (const [typ, cfg] of Object.entries(TYPES)) {
    if (only && only !== typ) continue;
    if (only === typ) cfg.seed += 137;
    try { await genType(typ, cfg); } catch (e) { console.error(`ERR ${typ}: ${e.message}`); }
  }
  console.log('done');
})();
