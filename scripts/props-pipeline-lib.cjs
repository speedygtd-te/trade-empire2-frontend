/**
 * Shared asset-pipeline plumbing for the surface PROP sprite families.
 *
 * ── WHY THIS FILE EXISTS
 *
 * Round 1 shipped one self-contained generator per family (props-rock-generate,
 * props-rock-snow-generate, props-bush-generate, …). Each of them re-implements
 * the same ~600 lines: fal HTTP, birefnet cut-out, alpha levels, speck removal,
 * tight crop, tone normalise, scale-to-400, contact/floor/density sheets and the
 * webp+mip integration. Round 2 adds SEVEN more families at once. Copying that
 * body seven more times is exactly the case CLAUDE.md names ("Abstraktion wenn
 * 3+ Stellen denselben Code hätten").
 *
 * What is NOT centralised is the per-family PROMPT, SEEDS, TONE TARGET and
 * VALIDATION BAND — those stay in one script per family, together with the
 * prompt history that explains why they read the way they do. That preserves the
 * property props-rock-snow-generate.cjs:16-30 argued for: a family script can
 * only ever write its own files, so re-running one family can never re-derive or
 * re-integrate a signed-off different family.
 *
 * The Round-1 scripts are deliberately NOT refactored onto this lib. They
 * produced signed-off assets; touching them would put those at risk for no gain.
 *
 * ── PIPELINE (CLAUDE.md Phase 2b, steps 2-6)
 *   1. generate  fal-ai/flux-pro/v1.1 (text→image, per-shape canvas)
 *      or derive  fal-ai/flux-pro/kontext (image→image, silhouette-preserving)
 *                                              -> assets/raw/<name>_raw.png
 *   2. fal-ai/birefnet/v2 background removal   -> assets/nobg/<name>_nobg.png
 *      + alpha levels curve (kills the grey fringe halo) + speck removal
 *   3. tight crop on alpha (first/last visible pixel, all four sides)
 *   4. tone normalise: uniform multiply pinning the BASE-MATERIAL luminance to
 *      the family target, with an optional OVERLAY channel (snow / glow / sulfur
 *      crust) that is excluded from the measurement and graded separately
 *                                              -> assets/cropped/<name>_cropped.png
 *   5. scale so max(w, h) = 400 px, aspect preserved, NO padding
 *                                              -> assets/final/<name>.png
 *   6. validate: dimensions, tight crop, aspect band, base tone, overlay
 *      coverage + overlay brightness, optional silhouette-IoU drift check
 *   integrate (scripts/props-integrate.cjs): PNG -> webp q90 + @half/@quarter/@eighth
 *
 * ── THE OVERLAY MASK IS COMPUTED ONCE AND PERSISTED
 *
 * Inherited verbatim from props-rock-snow-generate.cjs, where it was the single
 * most expensive lesson: the tone step CHANGES the pixels, so re-running the
 * classifier on the OUTPUT reclassifies graded overlay pixels as base material
 * and the validator then reports numbers irreconcilable with the tone step's own
 * (measured there: 50.5 % vs 11.3 % snow on the same file, and a spurious FAIL).
 * The mask is therefore computed on the PRE-tone image, written to
 * assets/cropped/<name>_mask.png, and read back by both the tone step and the
 * validator. It is a PNG rather than in-memory state so a wrong classifier is
 * obvious the moment the file is opened.
 *
 * `toColourspace('b-w')` on the read-back is load-bearing: sharp does NOT
 * guarantee a 1-channel raw buffer for a grayscale PNG (it returned 3 here), and
 * indexing a 3-channel buffer per pixel silently reads the mask at 1/3 scale.
 * The stride is asserted, never assumed.
 *
 * ── GLOW IS GRADED TO A TARGET, NOT HOPED FOR
 *
 * For the volcanic glow families the overlay is not merely excluded from the
 * base measurement, it gets its OWN uniform multiply onto `overlay.targetLum`.
 * The reason is the glow BUDGET (charred_tree_ember loudest, lava_puddle medium,
 * lava_crust faintest): a prompt cannot hit a brightness ratio between three
 * separately generated families, a measured multiply can. It also makes the
 * budget auditable — `validate` prints the number the renderer will actually
 * see.
 *
 * ── PROMPT LENGTH
 *
 * fal-ai/flux-pro/v1.1 encodes roughly the first ~1200 characters; text past
 * that is silently dead (proven on the bush set: a change at char 1364 returned
 * a byte-identical image on the same seed). `assertPromptFits` throws BEFORE the
 * API call so that failure mode cannot recur. Kontext was measured (`probe` in
 * props-rock-snow-generate.cjs) to reach past 1250, but the same budget is kept
 * because kontext edits degrade with long prompts.
 *
 * ── PROP SIZE CONVENTION
 *   tight-cropped, aspect preserved, no padding, RGBA webp, max side 400 px,
 *   mips @half/@quarter/@eighth = round(dim * 0.5/0.25/0.125),
 *   webp { quality: 90, effort: 4, smartSubsample: true }.
 *   On-screen size does NOT follow the pixel size: PlanetSurface draws every
 *   prop at PROP_BASE_HEIGHT (28 px) * propHeightFactor(key) and derives the
 *   WIDTH from the sprite aspect. Pixel dimensions only set the resolution
 *   budget; the ASPECT is what governs on-screen width.
 *
 * fal key from scripts/.env (FAL_AI_API_KEY) — never hardcode, never log, never commit.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');

// ── fal key from scripts/.env ──
try {
  const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const FAL_API_KEY = process.env.FAL_AI_API_KEY || process.env.FAL_API_KEY;

const ROOT = path.join(__dirname, '..');
const DIR_RAW = path.join(ROOT, 'assets', 'raw');
const DIR_NOBG = path.join(ROOT, 'assets', 'nobg');
const DIR_CROP = path.join(ROOT, 'assets', 'cropped');
const DIR_FINAL = path.join(ROOT, 'assets', 'final');
const DIR_REVIEW = path.join(ROOT, 'assets', 'style-test', 'props');
const SRC_PROPS = path.join(ROOT, 'src', 'assets', 'props');
const DIR_TILES = path.join(ROOT, 'src', 'assets', 'tiles');

const TARGET_MAX = 400;
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const MIPS = [
  { suffix: '@half', scale: 0.5 },
  { suffix: '@quarter', scale: 0.25 },
  { suffix: '@eighth', scale: 0.125 },
];

// Renderer geometry (PlanetSurface / isoConstants) — used by the review sheets
// so a sheet shows the true in-game size instead of a flattering one.
const TW = 48;
const TH = 24;
const PROP_BASE_HEIGHT = 28;

const PROMPT_MAX = 1100;
function assertPromptFits(p, label) {
  if (p.length > PROMPT_MAX)
    throw new Error(
      `${label}: prompt is ${p.length} chars, over the ${PROMPT_MAX} budget — ` +
        `text past the encoder limit is silently ignored, shorten it instead of paying for a dead run`,
    );
  return p;
}

// ══════════════════════════════════════
// HTTP
// ══════════════════════════════════════

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        if (res.statusCode >= 400) {
          reject(new Error(`fal ${res.statusCode}: ${raw.slice(0, 400)}`));
          return;
        }
        resolve(raw);
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
function httpGet(url, headers) {
  const u = new URL(url);
  return request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers });
}
function post(host, p, body) {
  return request(
    {
      hostname: host,
      path: p,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
    },
    JSON.stringify(body),
  );
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function download(url) {
  return new Promise((resolve, reject) => {
    const go = (u) => {
      const mod = u.startsWith('https') ? https : http;
      mod
        .get(u, (res) => {
          if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
            go(res.headers.location);
            return;
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        })
        .on('error', reject);
    };
    go(url);
  });
}

// ══════════════════════════════════════
// Step 1 — generate / derive
// ══════════════════════════════════════

/**
 * flux-pro/v1.1 renders the semi-realistic, matte, muted look the shipped prop
 * families have. flux/dev was tried in round 1 and reliably produced cel-shaded
 * low-poly "game asset" geometry with painted-on detail. v1.1 has no
 * negative_prompt input; the families here phrase everything positively anyway
 * (see the prompt notes in each family script).
 */
async function genFluxPro(prompt, size, seed) {
  const submit = JSON.parse(
    await post('queue.fal.run', '/fal-ai/flux-pro/v1.1', {
      prompt,
      image_size: { width: size.w, height: size.h },
      num_images: 1,
      enable_safety_checker: false,
      safety_tolerance: '5',
      output_format: 'png',
      seed,
    }),
  );
  if (!submit.status_url) throw new Error('submit failed');
  process.stdout.write('    gen');
  for (let i = 0; i < 150; i++) {
    await sleep(2000);
    const st = JSON.parse(await httpGet(submit.status_url, { Authorization: `Key ${FAL_API_KEY}` }));
    if (st.status === 'COMPLETED') {
      const r = JSON.parse(await httpGet(submit.response_url, { Authorization: `Key ${FAL_API_KEY}` }));
      process.stdout.write(' ok\n');
      return download(r.images[0].url);
    }
    if (st.status === 'FAILED') throw new Error(`generation failed: ${JSON.stringify(st).slice(0, 200)}`);
    process.stdout.write('.');
  }
  throw new Error('generation timeout');
}

/** flux-pro/kontext image edit — the silhouette-preserving derive path. */
async function deriveKontext(basePng, prompt, seed) {
  process.stdout.write('    kontext');
  const r = JSON.parse(
    await post('fal.run', '/fal-ai/flux-pro/kontext', {
      image_url: `data:image/png;base64,${basePng.toString('base64')}`,
      prompt,
      num_images: 1,
      safety_tolerance: '5',
      seed,
    }),
  );
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('kontext returned no image');
  process.stdout.write(' ok\n');
  return download(url);
}

// ══════════════════════════════════════
// Step 2 — background removal + alpha cleanup
// ══════════════════════════════════════

async function removeBackground(png) {
  process.stdout.write('    birefnet');
  const r = JSON.parse(
    await post('fal.run', '/fal-ai/birefnet/v2', {
      image_url: `data:image/png;base64,${png.toString('base64')}`,
    }),
  );
  if (!r?.image?.url) throw new Error('birefnet returned no image');
  process.stdout.write(' ok\n');
  return download(r.image.url);
}

/**
 * Alpha levels curve: remaps a in [LO..HI] to [0..255] and clamps outside.
 * Removes the faint semi-transparent halo birefnet leaves around the subject
 * (which would otherwise carry backdrop grey into the sprite) while keeping the
 * real anti-aliasing on the silhouette.
 */
const ALPHA_LO = 40;
const ALPHA_HI = 205;
function alphaLevels(data) {
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a <= ALPHA_LO) data[i] = 0;
    else if (a >= ALPHA_HI) data[i] = 255;
    else data[i] = Math.round(((a - ALPHA_LO) / (ALPHA_HI - ALPHA_LO)) * 255);
  }
}

/**
 * Drop opaque connected components smaller than `minFrac` of the largest one.
 * birefnet occasionally leaves stray pixels which would wreck the tight crop
 * (the bbox would include a speck far from the subject).
 *
 * `minFrac` is a per-family knob: a single boulder can drop everything under
 * 2 % of the main blob, but a rubble cluster or a group of tree trunks has
 * legitimate small components and needs a much lower threshold.
 */
function removeSpecks(data, w, h, minFrac = 0.02) {
  const n = w * h;
  const label = new Int32Array(n).fill(-1);
  const sizes = [];
  const stack = new Int32Array(n);
  let next = 0;
  for (let s = 0; s < n; s++) {
    if (data[s * 4 + 3] === 0 || label[s] !== -1) continue;
    let sp = 0;
    stack[sp++] = s;
    label[s] = next;
    let size = 0;
    while (sp > 0) {
      const p = stack[--sp];
      size++;
      const px = p % w;
      const py = (p - px) / w;
      for (const [ox, oy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = px + ox;
        const ny = py + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (label[q] !== -1 || data[q * 4 + 3] === 0) continue;
        label[q] = next;
        stack[sp++] = q;
      }
    }
    sizes.push(size);
    next++;
  }
  if (sizes.length <= 1) return 0;
  const biggest = Math.max(...sizes);
  let dropped = 0;
  for (let p = 0; p < n; p++) {
    const l = label[p];
    if (l >= 0 && sizes[l] < biggest * minFrac) {
      data[p * 4 + 3] = 0;
      dropped++;
    }
  }
  return dropped;
}

async function cleanAlpha(nobgPng, minFrac) {
  const { data, info } = await sharp(nobgPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  alphaLevels(data);
  const dropped = removeSpecks(data, info.width, info.height, minFrac);
  if (dropped > 0) console.log(`    specks removed: ${dropped}px`);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

// ══════════════════════════════════════
// Step 3 — tight crop
// ══════════════════════════════════════

async function alphaBBox(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('image is fully transparent');
  return { minX, minY, maxX, maxY, w, h };
}

async function tightCrop(png) {
  const b = await alphaBBox(png);
  return sharp(png)
    .extract({ left: b.minX, top: b.minY, width: b.maxX - b.minX + 1, height: b.maxY - b.minY + 1 })
    .png()
    .toBuffer();
}

// ══════════════════════════════════════
// Step 4 — overlay mask + tone normalise
// ══════════════════════════════════════

function lum(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function ramp(v, lo, hi) {
  return clamp01((v - lo) / (hi - lo));
}

/**
 * GLOW classifier — molten / ember pixels.
 *
 * Defined by WARMTH (R far above B) AND brightness together. Warmth alone would
 * also catch the warm dark stone the volcanic families are made of (rock_arid
 * ships at R/B 1.23); brightness alone would catch a sunlit top facet. Soft on
 * both axes so a graded glow has no hard seam at its edge — a hard mask leaves a
 * 1-px rim that reads as an outline at 28 px.
 */
function glowWeight(r, g, b) {
  return ramp(r, 80, 145) * ramp(r - b, 35, 95);
}

/**
 * SULFUR classifier — yellow crust / deposits. Yellow = R and G both high with B
 * clearly below them, which separates it from both the grey rock and from the
 * orange-red glow (glow has R >> G, sulfur has R ≈ G).
 */
function sulfurWeight(r, g, b) {
  const y = Math.min(r, g);
  return ramp(y, 85, 150) * ramp(y - b, 25, 75) * ramp(1 - Math.abs(r - g) / 90, 0.35, 0.75);
}

function maskPath(name) {
  return path.join(DIR_CROP, `${name}_mask.png`);
}

/** Compute the overlay mask on the PRE-tone image and persist it (see header). */
async function writeMask(prePng, name, weightFn) {
  const { data, info } = await sharp(prePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const m = Buffer.alloc(info.width * info.height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    m[p] = data[i + 3] === 0 ? 0 : Math.round(255 * weightFn(data[i], data[i + 1], data[i + 2]));
  }
  await sharp(m, { raw: { width: info.width, height: info.height, channels: 1 } })
    .png()
    .toFile(maskPath(name));
  return m;
}

async function loadMask(name, w, h) {
  const p = maskPath(name);
  if (!fs.existsSync(p)) return null;
  const { data, info } = await sharp(p)
    .resize(w, h, { fit: 'fill', kernel: 'nearest' })
    .toColourspace('b-w')
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 1) throw new Error(`mask for ${name} has ${info.channels} channels, expected 1`);
  return data;
}

/**
 * Uniform multiply pinning the BASE material to `tone.targetLum`, with an
 * optional overlay channel graded to its own `tone.overlay.targetLum`.
 *
 * The base factor is bounded on BOTH sides. Round 1 clamped it at 1.0 (only ever
 * darkening) because flux-pro reliably returned rocks that were too bright; the
 * kontext derives went the other way just as often and the clamp made one of
 * them unfixable. Brightening is the same uniform multiply, so it is allowed —
 * with its own guard, past which the source is underexposed mud and scaling it
 * up only amplifies noise.
 *
 * @param tone.targetLum  base-material mean luminance to pin
 * @param tone.tint       per-channel vector applied to base pixels
 * @param tone.minFactor / tone.maxFactor  guards; outside them: regenerate
 * @param tone.minBaseFrac  below this fraction of opaque pixels classified as
 *                          base material the measurement is meaningless
 * @param tone.overlay    { targetLum, tint } — optional
 */
async function toneNormalise(png, name, mask, tone) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let baseN = 0,
    baseSum = 0,
    ovN = 0,
    ovSum = 0,
    opaque = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] < 200) continue;
    opaque++;
    const l = lum(data[i], data[i + 1], data[i + 2]);
    if (mask && mask[p] > 127) {
      ovN++;
      ovSum += l;
      continue;
    }
    baseSum += l;
    baseN++;
  }
  const minBaseFrac = tone.minBaseFrac ?? 0.15;
  if (baseN < opaque * minBaseFrac)
    throw new Error(
      `${name}: almost no base material left (${((100 * baseN) / opaque).toFixed(1)}% < ${(100 * minBaseFrac).toFixed(0)}%) — regenerate`,
    );
  const mean = baseSum / baseN;
  const factor = tone.targetLum / mean;
  if (factor < tone.minFactor)
    throw new Error(
      `${name}: base too bright (meanLum ${mean.toFixed(1)}, would need x${factor.toFixed(2)} < ${tone.minFactor}) — regenerate with a new seed`,
    );
  if (factor > tone.maxFactor)
    throw new Error(
      `${name}: base too dark (meanLum ${mean.toFixed(1)}, would need x${factor.toFixed(2)} > ${tone.maxFactor}) — regenerate with a new seed`,
    );

  // Overlay gets its OWN multiply so the cross-family budget is measured, not
  // hoped for (see "GLOW IS GRADED TO A TARGET" in the header). With no overlay
  // pixels at all the factor is irrelevant — 1 keeps the maths finite.
  //
  // ── THE FACTOR IS SOLVED, NOT DIVIDED ──
  // The naive `target / measuredOverlayMean` undershoots, and the first ember
  // run showed it: targets of 150 came out at 115–139. Two reasons, both from
  // the SOFTNESS of the mask. The grade applies
  //     f(w) = baseFactor·(1−w) + k·w      and    tint T_c(w) = base_c·(1−w) + ov_c·w
  // so a pixel that the validator counts as overlay (w > 0.5) but which sits at
  // w = 0.6 receives only 60 % of k — while the naive division assumed it got
  // all of it. On top of that the glow TINT is not luminance-neutral
  // (e.g. [1.12, 0.90, 0.72] carries a Rec.709 weight of 0.934), costing
  // another ~7 %.
  //
  // Both effects are linear in k, so k has a closed form. For each pixel that
  // the validator will count (w > 0.5) let
  //     S = Σ_c lw_c · v_c · T_c(w)          (its luminance per unit of factor)
  // then its output luminance is  baseFactor·(1−w)·S + k·w·S, and
  //     k = (target − mean[baseFactor·(1−w)·S]) / mean[w·S].
  // Exact up to the 255 clamp, and it makes the printed glow number the number
  // the renderer actually receives.
  let ovFactor = 1;
  if (tone.overlay && ovN > 0) {
    const bT = tone.tint;
    const oT = tone.overlay.tint;
    const LW = [0.2126, 0.7152, 0.0722];
    let sumConst = 0,
      sumK = 0,
      cnt = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      if (data[i + 3] < 200 || mask[p] <= 127) continue;
      const w = mask[p] / 255;
      let S = 0;
      for (let c = 0; c < 3; c++) S += LW[c] * data[i + c] * (bT[c] * (1 - w) + oT[c] * w);
      sumConst += factor * (1 - w) * S;
      sumK += w * S;
      cnt++;
    }
    ovFactor = sumK > 0 ? (tone.overlay.targetLum * cnt - sumConst) / sumK : 1;
    ovFactor = Math.min(tone.overlay.maxFactor ?? 3.0, Math.max(tone.overlay.minFactor ?? 0.3, ovFactor));
  }
  console.log(
    `    tone: base meanLum ${mean.toFixed(1)} -> x${factor.toFixed(3)}` +
      (mask
        ? `, overlay ${((100 * ovN) / opaque).toFixed(1)}% of opaque` +
          (tone.overlay ? ` meanLum ${(ovSum / Math.max(1, ovN)).toFixed(1)} -> x${ovFactor.toFixed(3)}` : '')
        : ''),
  );

  const baseTint = tone.tint;
  const ovTint = tone.overlay ? tone.overlay.tint : baseTint;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] === 0) continue;
    const w = mask ? mask[p] / 255 : 0;
    const f = factor * (1 - w) + ovFactor * w;
    for (let c = 0; c < 3; c++) {
      const t = baseTint[c] * (1 - w) + ovTint[c] * w;
      data[i + c] = Math.min(255, Math.round(data[i + c] * f * t));
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

// ══════════════════════════════════════
// Step 4b — glow transfer (paired families only)
// ══════════════════════════════════════

/**
 * Paint the derived image's OVERLAY onto the BASE sprite's own pixels and alpha,
 * so the derived family is the base family plus an overlay and nothing else.
 *
 * ── WHY THIS EXISTS
 *
 * `charred_tree_ember` has to keep `charred_tree`'s silhouette at IoU >= 0.95,
 * because they are the same five trunks in two states and propThemes swaps
 * between them per biome. The first derive run measured (height-normalised,
 * renderer-aligned):
 *
 *   variant 0  0.985     variant 3  0.981        <- compact shapes, fine
 *   variant 1  0.805     variant 2  0.768        <- thin trunks
 *   variant 4  0.862
 *
 * The three failures are not a bad repaint: their AREA differs from the base by
 * only 3–7 %. They are a THINNESS problem. kontext splayed the V of variant 2 by
 * a few percent, and on a pole ~15 px wide at measurement scale a 6 px lateral
 * shift removes 40 % of the overlap. Re-rolling seeds cannot fix a geometric
 * sensitivity — it can only get lucky, and 3 of 5 variants failed, so it is the
 * shape class that is at fault, not the sampling.
 *
 * Transferring the glow instead makes the constraint STRUCTURAL: the output IS
 * the base sprite, pixel for pixel, with the glow blended in by the overlay
 * weight. IoU becomes 1.000 by construction rather than by luck, and the two
 * families are guaranteed interchangeable forever, including after any future
 * re-roll of either side.
 *
 * This is a deterministic, scripted pipeline step in the same class as the tone
 * normalise and the alpha levels curve — NOT hand retouching of a failed
 * generation, which CLAUDE.md rules out. Nothing is painted by hand and nothing
 * is repaired case by case: every variant goes through the identical transform.
 *
 * The derived image is resized to the base's exact box first. The residual
 * mismatch is the same 3–7 % that made the IoU fail, so a glow lands within a
 * few source pixels of the crack it was generated for — sub-pixel once the sprite
 * is drawn at 28 px.
 *
 * @param derivedPng  tight-cropped derive output
 * @param basePng     path to the base family's FINAL png of the same index
 * @param weightFn    overlay classifier (glowWeight / sulfurWeight)
 */
async function transferOverlay(derivedPng, basePath, weightFn) {
  const baseMeta = await sharp(basePath).metadata();
  const { data: bd } = await sharp(basePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data: dd } = await sharp(derivedPng)
    .ensureAlpha()
    .resize(baseMeta.width, baseMeta.height, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(bd.length);
  let moved = 0;
  for (let i = 0; i < bd.length; i += 4) {
    const w = dd[i + 3] === 0 ? 0 : weightFn(dd[i], dd[i + 1], dd[i + 2]);
    if (w > 0.5) moved++;
    for (let c = 0; c < 3; c++) out[i + c] = Math.round(bd[i + c] * (1 - w) + dd[i + c] * w);
    out[i + 3] = bd[i + 3]; // ALPHA IS THE BASE'S — this is what pins the silhouette
  }
  console.log(`    glow transfer onto ${path.basename(basePath)}: ${moved}px carried over`);
  return sharp(out, { raw: { width: baseMeta.width, height: baseMeta.height, channels: 4 } })
    .png()
    .toBuffer();
}

// ══════════════════════════════════════
// Step 5 — scale
// ══════════════════════════════════════

async function scaleToConvention(croppedPng, targetMax = TARGET_MAX) {
  const m = await sharp(croppedPng).metadata();
  const f = targetMax / Math.max(m.width, m.height);
  const w = Math.max(1, Math.round(m.width * f));
  const h = Math.max(1, Math.round(m.height * f));
  return sharp(croppedPng).resize(w, h, { fit: 'fill' }).png().toBuffer();
}

// ══════════════════════════════════════
// Step 6 — measurement + silhouette IoU
// ══════════════════════════════════════

/**
 * Alpha silhouette of a sprite rendered THE WAY THE RENDERER RENDERS IT: scaled
 * to a fixed HEIGHT with the aspect preserved, then bottom-centre anchored on a
 * common canvas.
 *
 * ── WHY NOT JUST STRETCH BOTH INTO A 256² BOX
 *
 * That is what props-rock-snow-generate.cjs did, and on compact boulders it was
 * fine (0.980–0.997). On the charred trees it produced a badly misleading
 * number. Measured on the first ember run:
 *
 *   variant   bbox base -> ember      area ratio   fill-IoU
 *   0         227x400 -> 227x400        0.995       0.989
 *   3         400x267 -> 400x264        1.000       0.990
 *   1         281x400 -> 269x400        1.037       0.842
 *   2         258x400 -> 278x400        1.043       0.867
 *   4         400x368 -> 400x378        1.067       0.867
 *
 * The three "failures" differ from their base by 3–7 % in AREA — i.e. the tree
 * is the same tree — but their tight-crop BBOX aspect moved by 2–8 %, because
 * the ember glow bleeds a few pixels of lit haze into birefnet's cut at one
 * extremity. Stretching each sprite independently into a square then SHEARS one
 * silhouette relative to the other, and the shear, not the repaint, is what the
 * number was reporting. The two variants whose bbox happened to land identical
 * scored 0.99; the three that moved a few pixels scored 0.85. That is an
 * artefact of the metric.
 *
 * Height-normalised, aspect-preserving, bottom-centre alignment is not a laxer
 * test — it is the test that asks the question the acceptance criterion actually
 * means: drawn into the same slot on the same tile, are these the same
 * silhouette? PlanetSurface sizes a prop by height and anchors it bottom-centre,
 * so this is literally what the player compares.
 */
async function silhouetteAt(file, h = 256) {
  const m = await sharp(file).metadata();
  const w = Math.max(1, Math.round(h * (m.width / m.height)));
  const { data } = await sharp(file)
    .ensureAlpha()
    .resize(w, h, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) mask[p] = data[i + 3] >= 128 ? 1 : 0;
  return { mask, w, h };
}

/**
 * Silhouette IoU of two sprites as the renderer would draw them (see
 * silhouetteAt). This is the check that catches kontext RE-SCULPTING the subject
 * instead of only repainting it.
 */
async function silhouetteIoU(aFile, bFile) {
  if (!fs.existsSync(aFile) || !fs.existsSync(bFile)) return null;
  const A = await silhouetteAt(aFile);
  const B = await silhouetteAt(bFile);
  const W = Math.max(A.w, B.w);
  const H = A.h;
  const offA = Math.round((W - A.w) / 2);
  const offB = Math.round((W - B.w) / 2);
  let inter = 0,
    uni = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const xa = x - offA;
      const xb = x - offB;
      const a = xa >= 0 && xa < A.w ? A.mask[y * A.w + xa] : 0;
      const b = xb >= 0 && xb < B.w ? B.mask[y * B.w + xb] : 0;
      if (a | b) uni++;
      if (a & b) inter++;
    }
  }
  return uni === 0 ? 0 : inter / uni;
}

/** Base/overlay statistics of a FINAL png, read through its persisted mask. */
async function measure(pngPath, name) {
  const { data, info } = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const mask = await loadMask(name, w, h);
  let n = 0,
    ov = 0,
    ovLum = 0,
    ovVal = 0,
    baseN = 0,
    baseLum = 0,
    baseR = 0,
    baseB = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] < 200) continue;
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    n++;
    if (mask && mask[p] > 127) {
      ov++;
      ovLum += lum(r, g, b);
      // Rec.709 luminance badly understates a saturated orange: rgb(200,60,30)
      // scores 88 while reading as a bright ember. `ovVal` is the mean of the
      // max channel — the peak the eye actually judges a saturated colour by —
      // and is reported alongside so the glow budget can be sanity-checked in
      // the terms a player perceives, not only in the terms the grade controls.
      ovVal += Math.max(r, g, b);
    } else {
      baseLum += lum(r, g, b);
      baseR += r;
      baseB += b;
      baseN++;
    }
  }
  const bbox = await alphaBBox(pngPath);
  return {
    w,
    h,
    aspect: w / h,
    fill: n / (w * h),
    overlayPct: (100 * ov) / n,
    overlayLum: ov > 0 ? ovLum / ov : 0,
    overlayVal: ov > 0 ? ovVal / ov : 0,
    baseLum: baseN > 0 ? baseLum / baseN : 0,
    baseRB: baseB > 0 ? baseR / baseB : 0,
    tight: bbox.minX === 0 && bbox.minY === 0 && bbox.maxX === w - 1 && bbox.maxY === h - 1,
  };
}

// ══════════════════════════════════════
// Review sheets
// ══════════════════════════════════════

const BG = { r: 122, g: 116, b: 104, alpha: 1 };

async function contactSheet(family, n) {
  const files = [];
  for (let i = 0; i < n; i++) {
    const p = path.join(DIR_FINAL, `${family}_${i}.png`);
    if (fs.existsSync(p)) files.push(p);
  }
  if (!files.length) return;
  const CELL = 260,
    COLS = Math.min(3, files.length);
  const rows = Math.ceil(files.length / COLS);
  const comp = [];
  for (let i = 0; i < files.length; i++) {
    comp.push({
      input: await sharp(files[i])
        .resize(CELL - 16, CELL - 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer(),
      left: (i % COLS) * CELL + 8,
      top: Math.floor(i / COLS) * CELL + 8,
    });
  }
  const out = path.join(DIR_REVIEW, `${family}_sheet.png`);
  await sharp({ create: { width: COLS * CELL, height: rows * CELL, channels: 4, background: BG } })
    .composite(comp)
    .png()
    .toFile(out);
  console.log(`[sheet] ${out}`);
}

/**
 * On-floor sheet: the props composited on their real biome tiles exactly the way
 * PlanetSurface draws them (drawH = PROP_BASE_HEIGHT * heightFactor, drawW from
 * the sprite aspect). Rendered at 1:1 AND at 4x nearest, because a prop that
 * looks great at 400 px can be mush at 28 px and only the 1:1 strip shows that.
 */
async function floorSheet(family, n, biome, heightFactor = 1) {
  const dir = path.join(DIR_TILES, biome);
  const tiles = [];
  if (fs.existsSync(dir))
    for (let i = 0; i < 4; i++) {
      const p = path.join(dir, `${biome}_${i}.webp`);
      if (fs.existsSync(p)) tiles.push(p);
    }
  if (!tiles.length) {
    console.log(`[sheet] no ${biome} tiles — skipping floor sheet`);
    return;
  }
  const CW = TW * 2,
    CH = 90;
  const comp = [];
  for (let i = 0; i < n; i++) {
    const f = path.join(DIR_FINAL, `${family}_${i}.png`);
    if (!fs.existsSync(f)) continue;
    const tile = await sharp(tiles[i % tiles.length]).resize(TW, TH, { fit: 'fill' }).png().toBuffer();
    const m = await sharp(f).metadata();
    const drawH = Math.max(1, Math.round(PROP_BASE_HEIGHT * heightFactor));
    const drawW = Math.max(1, Math.round(drawH * (m.width / m.height)));
    const prop = await sharp(f).resize(drawW, drawH, { fit: 'fill' }).png().toBuffer();
    const cx = i * CW + Math.round((CW - TW) / 2);
    const groundY = CH - 26;
    comp.push({ input: tile, left: cx, top: groundY - Math.round(TH / 2) });
    comp.push({ input: prop, left: cx + Math.round((TW - drawW) / 2), top: groundY - drawH });
  }
  const strip = await sharp({ create: { width: n * CW, height: CH, channels: 4, background: BG } })
    .composite(comp)
    .png()
    .toBuffer();
  const out1 = path.join(DIR_REVIEW, `${family}_on_${biome}_1x.png`);
  const out4 = path.join(DIR_REVIEW, `${family}_on_${biome}_4x.png`);
  await sharp(strip).toFile(out1);
  await sharp(strip)
    .resize(n * CW * 4, CH * 4, { fit: 'fill', kernel: 'nearest' })
    .toFile(out4);
  console.log(`[sheet] ${out1}`);
  console.log(`[sheet] ${out4}`);
}

/**
 * A/B sheet against a reference family — the drift check made visual. Used for
 * charred_tree_ember vs charred_tree and for the recoloured families vs their
 * rock_arid source.
 */
async function abSheet(family, refFamily, n, label) {
  const CELL = 230;
  const comp = [];
  let cols = 0;
  for (let i = 0; i < n; i++) {
    const a = path.join(SRC_PROPS, refFamily, `${refFamily}_${i}.webp`);
    const s = path.join(DIR_FINAL, `${family}_${i}.png`);
    if (!fs.existsSync(a) || !fs.existsSync(s)) continue;
    for (const [row, f] of [
      [0, a],
      [1, s],
    ]) {
      comp.push({
        input: await sharp(f)
          .resize(CELL - 14, CELL - 14, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer(),
        left: cols * CELL + 7,
        top: row * CELL + 7,
      });
    }
    cols++;
  }
  if (!cols) return;
  const out = path.join(DIR_REVIEW, `${family}_ab_vs_${label || refFamily}.png`);
  await sharp({ create: { width: cols * CELL, height: 2 * CELL, channels: 4, background: BG } })
    .composite(comp)
    .png()
    .toFile(out);
  console.log(`[sheet] ${out}`);
}

/**
 * Density preview: 4x4 iso patches, one panel per candidate count.
 *
 * `coverage` is the fraction of tiles that get props at all, and it is not
 * decoration: propLayout maps g = 0 to ZERO props, and every VOLCANIC biome
 * measures g ≈ 0.73 (50.5 % of tiles at g = 0). A panel that puts props on every
 * tile shows a case that essentially never occurs — the leftmost panel is the
 * realistic one, the rest are the worst case at that count.
 */
async function densitySheet(family, n, biome, heightFactor = 1, panelSpecs) {
  const specs = panelSpecs || [
    { count: 1, coverage: 0.35 },
    { count: 1, coverage: 1 },
    { count: 2, coverage: 1 },
    { count: 3, coverage: 1 },
  ];
  const dir = path.join(DIR_TILES, biome);
  const tiles = [];
  if (fs.existsSync(dir))
    for (let i = 0; i < 4; i++) {
      const p = path.join(dir, `${biome}_${i}.webp`);
      if (fs.existsSync(p)) tiles.push(await sharp(p).resize(TW, TH, { fit: 'fill' }).png().toBuffer());
    }
  const props = [];
  for (let i = 0; i < n; i++) {
    const f = path.join(DIR_FINAL, `${family}_${i}.png`);
    if (fs.existsSync(f)) {
      const m = await sharp(f).metadata();
      const drawH = Math.max(1, Math.round(PROP_BASE_HEIGHT * heightFactor));
      const drawW = Math.max(1, Math.round(drawH * (m.width / m.height)));
      props.push({ buf: await sharp(f).resize(drawW, drawH, { fit: 'fill' }).png().toBuffer(), w: drawW, h: drawH });
    }
  }
  if (!tiles.length || !props.length) return;
  const R = 4,
    C = 4;
  const panelW = (R + C) * (TW / 2) + TW;
  const panelH = (R + C) * (TH / 2) + 60;
  let rnd = 12345;
  const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const panels = [];
  for (const { count, coverage } of specs) {
    const comp = [];
    const items = [];
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C; c++) {
        const sx = Math.round((c - r) * (TW / 2) + panelW / 2 - TW / 2);
        const sy = Math.round((c + r) * (TH / 2) + 10);
        comp.push({ input: tiles[(r * C + c) % tiles.length], left: sx, top: sy });
        if (rand() > coverage) continue;
        for (let k = 0; k < count; k++) {
          const p = props[Math.floor(rand() * props.length)];
          const dx = (rand() - 0.5) * 0.7,
            dy = (rand() - 0.5) * 0.7;
          items.push({
            input: p.buf,
            left: Math.round(sx + TW / 2 + dx * (TW / 2) - p.w / 2),
            top: Math.round(sy + TH / 2 + dy * (TH / 2) - p.h),
            order: sy + dy * (TH / 2),
          });
        }
      }
    items.sort((a, b) => a.order - b.order);
    for (const it of items) comp.push({ input: it.input, left: it.left, top: it.top });
    panels.push(
      await sharp({ create: { width: panelW, height: panelH, channels: 4, background: BG } })
        .composite(comp)
        .png()
        .toBuffer(),
    );
  }
  const out = path.join(DIR_REVIEW, `${family}_density.png`);
  await sharp({ create: { width: panelW * panels.length, height: panelH, channels: 4, background: BG } })
    .composite(panels.map((b, i) => ({ input: b, left: i * panelW, top: 0 })))
    .png()
    .toFile(out);
  console.log(`[sheet] ${out}`);
}

module.exports = {
  // paths / constants
  ROOT,
  DIR_RAW,
  DIR_NOBG,
  DIR_CROP,
  DIR_FINAL,
  DIR_REVIEW,
  SRC_PROPS,
  DIR_TILES,
  TARGET_MAX,
  WEBP,
  MIPS,
  TW,
  TH,
  PROP_BASE_HEIGHT,
  FAL_API_KEY,
  PROMPT_MAX,
  // prompt
  assertPromptFits,
  // steps
  genFluxPro,
  deriveKontext,
  removeBackground,
  cleanAlpha,
  tightCrop,
  alphaBBox,
  toneNormalise,
  transferOverlay,
  scaleToConvention,
  writeMask,
  loadMask,
  maskPath,
  measure,
  silhouetteIoU,
  // classifiers
  glowWeight,
  sulfurWeight,
  lum,
  ramp,
  clamp01,
  // sheets
  contactSheet,
  floorSheet,
  abSheet,
  densitySheet,
  ensureDirs: () => {
    for (const d of [DIR_RAW, DIR_NOBG, DIR_CROP, DIR_FINAL, DIR_REVIEW]) fs.mkdirSync(d, { recursive: true });
  },
};
