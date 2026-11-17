/**
 * STYLE-TEST ONLY (NO src/ writes, NO cap sync, NO git):
 * rocky_desert tile derived from sand_dunes — Rudi's idea: take the flat
 * sand_dunes sand floor and ADD scattered rocks/stones via FLUX PRO KONTEXT
 * edit, so rocky_desert reads like "sand_dunes with rubble" (one coherent
 * DESERT family).
 *
 * PROVEN METHOD (sand_dunes lesson): flux-pro/kontext (flux pro edit) with
 * SIMPLE, ADDITIVE prompts. NO long anti-relief / negative prompts — those
 * negative tokens INTRODUCE the concepts and make flux render relief anyway.
 *
 * Step 1 — basis: edit sand_dunes_2.webp (flat sand) with a short additive
 *   rock prompt -> rocky_desert_sd_0 (the sand floor stays, evenly scattered
 *   rocks come on top).
 * Step 2 — 3 variants from rocky_desert_sd_0 (proven sand_dunes prompt
 *   "create a slightly different pattern" -> coherent + flat). Slots 2 & 3
 *   are .flop (L<->R) at integrate time; this script just produces 4 masked
 *   PNG candidates.
 *
 * Model: fal-ai/flux-pro/kontext (image + prompt).
 * Input: src/assets/tiles/sand_dunes/sand_dunes_2.webp (512x256 diamond-masked
 *        RGBA), flattened onto the iso bg as the kontext init.
 *
 * Outputs (style-test workspace only):
 *   assets/style-test/tiles/rocky_desert_sd_{0,1,2,3}.png       (512x256 masked)
 *   assets/style-test/tiles/rocky_desert_sd_{0,1,2,3}_half.png  (256x128)
 *   assets/style-test/tiles/rocky_desert_sd_{0,1,2,3}_mosaic.png(3x3 iso ref)
 *
 * Usage:
 *   node scripts/rocky-desert-sd-derive.cjs              -> all 4 (0 basis + v1..v3)
 *   node scripts/rocky-desert-sd-derive.cjs 0            -> re-roll basis (seed +1000)
 *   node scripts/rocky-desert-sd-derive.cjs v1 v2        -> re-roll variants
 *   node scripts/rocky-desert-sd-derive.cjs 0=12345      -> explicit seed
 * Basis re-roll may also tweak the rock prompt: 0#"add many small scattered rocks ..."
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

const TILE_W = 512, TILE_H = 256;
const ISO_BG = { r: 0x14, g: 0x17, b: 0x1c };
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'style-test', 'tiles');
const SAND_WEBP = path.join(ROOT, 'src', 'assets', 'tiles', 'sand_dunes', 'sand_dunes_2.webp');

// Step 1: simple ADDITIVE rock prompt (no negatives).
const ROCK_PROMPT = 'add scattered rocks and stones of varying sizes spread evenly across the sand';
// Step 2: proven sand_dunes variation prompt (keeps coherent + flat).
const VAR_PROMPT = 'create a slightly different pattern';

// Slot 0 = basis (sand_dunes_2 + rocks). v1..v3: ATTEMPT 2 — derive each
// directly from the SAND (not from the basis) with the SAME additive rock
// prompt but a different seed. The "create a slightly different pattern"
// variation prompt proved unstable for rock density (stripped most rocks,
// emptied the center). Re-running the rock prompt with new seeds keeps rocks
// present, varied and even in every slot while still differing in arrangement.
const SLOTS = [
  { tag: '0',  from: 'sand', prompt: ROCK_PROMPT, seed: 70011 },
  { tag: 'v1', from: 'sand', prompt: ROCK_PROMPT, seed: 81021 },
  { tag: 'v2', from: 'sand', prompt: ROCK_PROMPT, seed: 82037 },
  { tag: 'v3', from: 'sand', prompt: ROCK_PROMPT, seed: 83049 },
];

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
// dark = rock/shadow fraction, std = texture contrast. Center-vs-edge density:
// split the diamond into a central diamond (inner 50%) and the outer ring,
// compare dark% to flag empty-center / edge-cluster.
async function reliefStats(maskedBuf) {
  const { data, info } = await sharp(maskedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const cx = width / 2, cy = height / 2;
  let mean = 0, n = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    if (data[i + 3] < 8) continue;
    mean += luma(data[i], data[i + 1], data[i + 2]); n++;
  }
  mean /= n;
  let dark = 0, bright = 0, sd = 0;
  let cDark = 0, cN = 0, oDark = 0, oN = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    if (data[i + 3] < 8) continue;
    const l = luma(data[i], data[i + 1], data[i + 2]);
    sd += (l - mean) * (l - mean);
    const isDark = l < mean - 25;
    if (isDark) dark++;
    if (l > mean + 40) bright++;
    // normalized diamond distance: |dx|/(W/2)+|dy|/(H/2) <=1 inside diamond
    const dd = Math.abs(x - cx) / cx + Math.abs(y - cy) / cy;
    if (dd < 0.5) { cN++; if (isDark) cDark++; }
    else { oN++; if (isDark) oDark++; }
  }
  return {
    darkPct: (dark / n) * 100,
    brightPct: (bright / n) * 100,
    std: Math.sqrt(sd / n),
    centerDark: cN ? (cDark / cN) * 100 : 0,
    edgeDark: oN ? (oDark / oN) * 100 : 0,
  };
}

async function postProcess(rawBuf, tag) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha().png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `rocky_desert_sd_${tag}.png`), masked);
  const half = await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `rocky_desert_sd_${tag}_half.png`), half);
  return masked;
}

async function kontext(initPng, cfg) {
  // Flatten onto opaque iso bg so transparent diamond corners don't bleed in.
  const flat = await sharp(initPng).flatten({ background: ISO_BG }).png().toBuffer();
  const dataUri = `data:image/png;base64,${flat.toString('base64')}`;
  console.log(`[kontext] slot ${cfg.tag} from=${cfg.from} seed ${cfg.seed} prompt="${cfg.prompt}"`);
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/kontext', {
    image_url: dataUri,
    prompt: cfg.prompt,
    num_images: 1,
    safety_tolerance: '5',
    seed: cfg.seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no kontext url for ' + cfg.tag + ': ' + JSON.stringify(r).slice(0, 200));
  const out = await download(url);
  return postProcess(out, cfg.tag);
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
  const out = await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: { ...ISO_BG, alpha: 1 } } })
    .composite(comp).png().toBuffer();
  fs.writeFileSync(outPath, out);
}

const fmtC = (c) => `R${c.r.toFixed(0)} G${c.g.toFixed(0)} B${c.b.toFixed(0)} luma${c.luma.toFixed(1)}`;
const fmtR = (r) => `dark%${r.darkPct.toFixed(2)} std${r.std.toFixed(1)} ctrDark%${r.centerDark.toFixed(2)} edgeDark%${r.edgeDark.toFixed(2)}`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const sandPng = await sharp(fs.readFileSync(SAND_WEBP)).png().toBuffer();
  const meta = await sharp(sandPng).metadata();
  console.log(`[sand input] ${SAND_WEBP} -> ${meta.width}x${meta.height} png`);
  const sandC = await colorStats(sandPng), sandR = await reliefStats(sandPng);
  console.log(`SAND_DUNES_2 color[${fmtC(sandC)}] relief[${fmtR(sandR)}]`);
  // reference mosaic of the sand input for family-consistency comparison
  await mosaic(sandPng, path.join(OUT, 'rocky_desert_sd_sandref_mosaic.png'));

  // arg parse: "0", "v1", "0=12345" (seed), "0#prompt text" (basis prompt override)
  const args = process.argv.slice(2);
  const reroll = args.map(a => a.split(/[=#]/)[0]);
  const seedOverride = {};
  const promptOverride = {};
  for (const a of args) {
    const tag = a.split(/[=#]/)[0];
    const sMatch = a.match(/=(\d+)/);
    const pMatch = a.match(/#(.+)$/);
    if (sMatch) seedOverride[tag] = parseInt(sMatch[1], 10);
    if (pMatch) promptOverride[tag] = pMatch[1];
  }

  // Slot 0 must run (and be on disk) before v1..v3 derive from it.
  const runList = reroll.length ? SLOTS.filter(s => reroll.includes(s.tag)) : SLOTS;
  const willRunBasis = runList.some(s => s.tag === '0');
  const basisPath = path.join(OUT, 'rocky_desert_sd_0.png');

  let basisMasked = null;
  for (const cfg of SLOTS) {
    if (reroll.length && !reroll.includes(cfg.tag)) continue;
    const seed = seedOverride[cfg.tag] || (reroll.includes(cfg.tag) ? cfg.seed + 1000 : cfg.seed);
    const prompt = promptOverride[cfg.tag] || cfg.prompt;
    try {
      let init;
      if (cfg.from === 'sand') init = sandPng;
      else {
        // derive from basis: prefer freshly-made basisMasked, else read from disk
        if (basisMasked) init = basisMasked;
        else if (fs.existsSync(basisPath)) init = fs.readFileSync(basisPath);
        else throw new Error('basis rocky_desert_sd_0.png missing; run slot 0 first');
      }
      const masked = await kontext(init, { ...cfg, seed, prompt });
      if (cfg.tag === '0') basisMasked = masked;
      await mosaic(masked, path.join(OUT, `rocky_desert_sd_${cfg.tag}_mosaic.png`));
      const c = await colorStats(masked), rl = await reliefStats(masked);
      console.log(`  ${cfg.tag}: color[${fmtC(c)}] relief[${fmtR(rl)}] dLuma ${(c.luma - sandC.luma).toFixed(1)}`);
    } catch (e) { console.error(`ERR ${cfg.tag}: ${e.message}`); }
  }
  console.log('done');
})();
