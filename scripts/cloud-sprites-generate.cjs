/**
 * Style-test ONLY: transparent CLOUD sprites for a planet-surface cloud overlay.
 * HERO/style test — NO src/ integration, NO git.
 *
 * Goal: 4 soft, wispy, semi-transparent base cloud shapes (white/light-grey),
 * background removed (real alpha, soft fraying edges). From those, bake 3 tinted
 * theme sets (deterministic, sharp only — no extra fal calls):
 *   temperate = white (unchanged)   -> EARTH_LIKE / OCEAN
 *   toxic     = sickly green/brown  -> TOXIC
 *   ash       = dark smoky desat.   -> VOLCANIC
 * => 4 shapes x 3 themes = 12 final PNGs + 4 base = 16 PNGs.
 *
 * Pipeline (per shape):
 *   flux-pro v1.1 @1024x512, flat pure-black bg, fixed seed
 *   -> LUMINANCE KEY: alpha = brightness of the (black-bg) image, RGB lifted to
 *      near-white. Because the cloud is bright vapour on pure black, luminance
 *      IS the cloud mask — this yields naturally soft, frayed, semi-transparent
 *      edges (exactly what clouds need) and never deletes the subject.
 *      (birefnet subject-segmentation was tried first but keyed out soft cumulus
 *       puffs entirely — see report; luminance keying is strictly better here.)
 *   -> soft alpha feather (slight blur on alpha channel; keeps frayed edges)
 *   -> tight crop (alpha>0)
 *   -> scale to 1024x512 (contain, transparent pad, keep aspect)
 *   -> bake 3 themes
 * Output: assets/style-test/clouds/cloud_baseN.png + cloud_<theme>_N.png
 *
 * Usage: node scripts/cloud-sprites-generate.cjs [onlyShape 1..4]
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
if (!FAL_API_KEY) { console.error('No fal key (FAL_AI_API_KEY)'); process.exit(1); }
const https = require('https');
const http = require('http');
const sharp = require('sharp');

const GEN_W = 1024, GEN_H = 512;
const OUT_W = 1024, OUT_H = 512;
const OUT = path.join(__dirname, '..', 'assets', 'style-test', 'clouds');

// TOP-DOWN VEIL look: the in-game camera looks steeply DOWN onto the surface
// (isometric / aerial). Clouds must read as flat, spread-out haze drifting over
// the ground — NOT a side-on cumulus silhouette with a lit top and shadowed
// underside. So: aerial top-down, thin diffuse stratus/cirrus veil, feathered
// tendrils spread horizontally across the plane, no 3D volume, no horizon.
const PREFIX = 'aerial top-down view looking straight DOWN at thin wispy cloud veil and mist drifting over the ground, flat diffuse stratus and cirrus haze seen from directly above, soft feathered semi-transparent tendrils spread out horizontally across the plane, no side profile, no horizon, no 3D volume, no shadowed underside, no lit top, isolated on a flat pure black background, no landscape, no sky, no ground texture, no stars, sci-fi atmospheric, soft diffuse pale vapour, high detail';
const NEG = 'no side view, no horizon, no cumulus silhouette, no 3D puff, no shadowed underside, no volumetric ball, no sky, no blue, no landscape, no terrain, no border, no frame, no text, no hard edges, no solid fill, flat black background only';

// 4 distinct shapes, NEW fixed seeds (changed so the result truly differs).
const SHAPES = {
  1: {
    seed: 73211,
    prompt: `${PREFIX}, a very thin long-drawn-out veil of haze, faint gossamer streaks smeared horizontally across the frame, barely-there translucent mist seen from above. ${NEG}`,
  },
  2: {
    seed: 73229,
    prompt: `${PREFIX}, a flaky shredded patch of haze, irregular torn tufts and ragged wisps of mist scattered flat across the plane, frayed semi-transparent fog field viewed from straight above. ${NEG}`,
  },
  3: {
    seed: 51803,
    // Form 3 must sit COMPACT and CENTERED with a generous empty black margin on
    // every side so the final sprite never touches the frame edge.
    prompt: `${PREFIX}, a small isolated wispy cloud veil centered in the frame with a generous empty black margin on all sides, the cloud does NOT touch the edges, plenty of empty space around it, delicate thin feathered cirrus filaments and faint frayed tendrils gathered compactly in the middle, seen from directly overhead. ${NEG}`,
  },
  4: {
    seed: 73289,
    prompt: `${PREFIX}, a very low flat thin sheet of ground fog, faint translucent mist lying flat and spread unevenly in patches across the plane, almost no density, paper-thin haze seen from straight overhead, no billowing, no puffs, no rounded lumps, gently fading feathered patchy edges. ${NEG}`,
  },
};

const THEMES = ['temperate', 'toxic', 'ash'];

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
        if (res.statusCode >= 400) { reject(new Error(`fal ${res.statusCode}: ${raw.slice(0, 500)}`)); return; }
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

// Luminance key: derive alpha from image brightness (cloud = bright on black),
// and lift RGB to near-white so the cloud reads as light vapour regardless of
// the original grey value. Gamma-curves the alpha slightly so faint wisps stay
// visible while the black background goes fully transparent.
async function luminanceKey(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const px = width * height;
  const alpha = Buffer.alloc(px);
  const rgb = Buffer.alloc(px * 3);
  for (let i = 0; i < px; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    // Rec.601 luma as the cloud mask.
    let lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    // Lift faint wisps: gamma < 1 brightens low alpha so thin tendrils survive.
    let a = Math.pow(lum, 0.85);
    alpha[i] = Math.round(Math.min(1, a) * 255);
    // RGB: render the cloud as soft white vapour (keep a hint of the original
    // tone so internal structure is not flat). Mix original toward white.
    const mix = 0.55;
    rgb[i * 3] = Math.round(r + (255 - r) * mix);
    rgb[i * 3 + 1] = Math.round(g + (255 - g) * mix);
    rgb[i * 3 + 2] = Math.round(b + (255 - b) * mix);
  }
  return sharp(rgb, { raw: { width, height, channels: 3 } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png().toBuffer();
}

// Apply a slight blur to the ALPHA channel only, so the keyed-out edges fray
// softly instead of a hard cutout. RGB stays sharp.
async function featherAlpha(buf) {
  const img = sharp(buf).ensureAlpha();
  const { width, height } = await img.metadata();
  const raw = await sharp(buf).ensureAlpha().raw().toBuffer(); // RGBA
  // Extract alpha as single-channel, blur it, re-join.
  const alpha = await sharp(raw, { raw: { width, height, channels: 4 } })
    .extractChannel(3).blur(2.2).toBuffer();
  const rgb = await sharp(raw, { raw: { width, height, channels: 4 } })
    .removeAlpha().toBuffer(); // RGB raw
  return sharp(rgb, { raw: { width, height, channels: 3 } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png().toBuffer();
}

// Tight crop on visible (alpha>0) pixels.
async function tightCrop(buf) {
  const meta = await sharp(buf).metadata();
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  const THRESH = 8; // alpha above this counts as visible
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * channels + 3];
      if (a > THRESH) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) { return buf; } // nothing visible — leave as is
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  return sharp(buf).extract({ left: minX, top: minY, width: cw, height: ch }).png().toBuffer();
}

// Scale to OUT_W x OUT_H, contain (keep aspect), transparent pad.
// `innerFrac` (0<frac<=1) constrains the cloud to an inner box that fraction of
// the canvas, then centers it on a full transparent OUT_W x OUT_H canvas, so the
// sprite has a guaranteed transparent margin on ALL sides (never edge-flush).
async function scaleContain(buf, innerFrac = 1) {
  if (innerFrac >= 1) {
    return sharp(buf)
      .resize(OUT_W, OUT_H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toBuffer();
  }
  const innerW = Math.round(OUT_W * innerFrac);
  const innerH = Math.round(OUT_H * innerFrac);
  // Fit the cloud (tight-cropped) into the inner box, keep aspect, transparent.
  const inner = await sharp(buf)
    .resize(innerW, innerH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  // Center the inner box on a full transparent canvas -> transparent margins.
  return sharp({
    create: { width: OUT_W, height: OUT_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: inner, gravity: 'center' }])
    .png().toBuffer();
}

async function bakeThemes(baseBuf, n) {
  // temperate: unchanged
  fs.writeFileSync(path.join(OUT, `cloud_temperate_${n}.png`), baseBuf);

  // toxic: sickly green/brown — pull saturation down a touch then tint towards
  // a dull olive-green. Keep alpha (tint affects RGB only).
  const toxic = await sharp(baseBuf)
    .modulate({ saturation: 0.7, brightness: 0.95 })
    .tint({ r: 150, g: 168, b: 120 })
    .png().toBuffer();
  fs.writeFileSync(path.join(OUT, `cloud_toxic_${n}.png`), toxic);

  // ash: dark smoky grey — darken + desaturate, slight neutral-grey tint.
  const ash = await sharp(baseBuf)
    .modulate({ brightness: 0.5, saturation: 0.35 })
    .tint({ r: 120, g: 122, b: 128 })
    .png().toBuffer();
  fs.writeFileSync(path.join(OUT, `cloud_ash_${n}.png`), ash);

  return ['temperate', 'toxic', 'ash'];
}

const report = [];

async function genShape(n, cfg) {
  const row = { shape: n, seed: cfg.seed, gen: '❌', bg: '❌', themes: '' };
  try {
    console.log(`[gen] shape ${n} (seed ${cfg.seed})`);
    const r = await fetchJson('https://fal.run/fal-ai/flux-pro/v1.1', {
      prompt: cfg.prompt, image_size: { width: GEN_W, height: GEN_H },
      num_images: 1, enable_safety_checker: false, seed: cfg.seed,
    });
    const url = r.images && r.images[0] && r.images[0].url;
    if (!url) throw new Error('no image url');
    const rawBuf = await download(url);
    row.gen = '✅';

    // BG removal via luminance key (cloud = bright vapour on pure black bg).
    console.log(`[bg] shape ${n} via luminance key`);
    let keyed;
    try {
      keyed = await luminanceKey(rawBuf);
      row.bg = '✅ luminance-key';
    } catch (e) {
      row.bg = '❌ ' + e.message;
      throw e;
    }

    // Soft alpha feather -> tight crop -> scale contain.
    const feathered = await featherAlpha(keyed);
    const cropped = await tightCrop(feathered);
    // Edge-flush shapes get padded into an inner box so the final sprite keeps a
    // transparent margin on all sides and never touches the frame. Seeds are
    // UNCHANGED for 1/2/4 — only innerFrac shrinks the same shape inward.
    const INNER_FRAC = { 1: 0.85, 2: 0.85, 3: 0.85, 4: 0.85 };
    const base = await scaleContain(cropped, INNER_FRAC[n] || 1);

    fs.writeFileSync(path.join(OUT, `cloud_base${n}.png`), base);
    const themes = await bakeThemes(base, n);
    row.themes = themes.join(', ');
    console.log(`[save] cloud_base${n}.png + ${themes.length} themes`);
  } catch (e) {
    console.error(`ERR shape ${n}: ${e.message}`);
  }
  report.push(row);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv[2] ? Number(process.argv[2]) : null;
  for (const [n, cfg] of Object.entries(SHAPES)) {
    if (only && only !== Number(n)) continue;
    await genShape(Number(n), cfg);
  }
  console.log('\n=== REPORT ===');
  console.log('Shape | Seed  | Gen | BG | Themes');
  for (const r of report) {
    console.log(`${r.shape}     | ${r.seed} | ${r.gen}  | ${r.bg} | ${r.themes}`);
  }
  console.log('done');
})();
