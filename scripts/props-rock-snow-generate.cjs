/**
 * Asset-Pipeline: surface PROP sprites — SNOW-CAPPED variant of the dark cracked
 * rock family.
 *
 *   rock_snow_0..5   snow-capped  -> biome snow_peak (EARTH_LIKE)
 *
 * THIRD SET OF THE SAME ROCK. Like the mossy `rock` set, this one is DERIVED
 * with fal-ai/flux-pro/kontext from the IDENTICAL arid raws
 * (assets/raw/rock_arid_<i>_raw.png). Geometry, cracks and silhouette are
 * therefore the same stone across all three sets — only the overlay differs:
 *
 *   rock_arid  bare
 *   rock       + moss / lichen
 *   rock_snow  + snow
 *
 * ── WHY A SEPARATE SCRIPT (and not a `--snow` mode in props-rock-generate.cjs)
 *
 * props-rock-generate.cjs is built around a two-set BOOLEAN (`set.moss`): the
 * tone step, the classifier (`isMoss`), the WARM tint and three validator
 * branches (MOSS_MIN/MAX_PCT, ARID_MAX_PCT) all key off it. Folding in a third
 * set means turning that boolean into a mode enum and editing the tone and
 * validate paths that the SIGNED-OFF rock_arid / rock sets run through — i.e.
 * putting shipped assets at risk for a set they have nothing to do with. Worse,
 * its `gen` default runs BOTH sets, so a mistake re-derives and re-integrates
 * the accepted rocks.
 *
 * This script therefore only ever READS assets/raw/rock_arid_*_raw.png and only
 * ever WRITES rock_snow_* files. props-rock-generate.cjs is untouched, and its
 * documented invariant ("arid and mossy are the same stone, differing only by
 * the moss") is extended rather than broken: all three sets share one source raw.
 *
 * ── PIPELINE (per variant, per CLAUDE.md Phase 2b)
 *   1. fal-ai/flux-pro/kontext snow edit on the ARID raw of the same index
 *                                                    -> assets/raw/rock_snow_<i>_raw.png
 *   2. fal-ai/birefnet/v2 background removal         -> assets/nobg/rock_snow_<i>_nobg.png
 *      + alpha levels curve (kills the mid-grey fringe halo) + speck removal
 *   3. tight crop on alpha (first/last visible pixel, all 4 sides)
 *   4. tone normalise: uniform multiply pinning the BARE-STONE luminance to the
 *      rock_arid value, with a snow-aware tint split (see TONE below)
 *                                                    -> assets/cropped/rock_snow_<i>_cropped.png
 *   5. scale so max(w, h) = 400 px, aspect preserved, NO padding
 *                                                    -> assets/final/rock_snow_<i>.png
 *   6. validate: dimensions, tight crop, aspect band, bare-stone tone, snow
 *      coverage, and a SILHOUETTE-IOU drift check against the shipped
 *      rock_arid_<i>.webp (kontext must not have re-sculpted the rock)
 *   integrate: PNG -> webp q90 + @half/@quarter/@eighth
 *                                                    -> src/assets/props/rock_snow/
 *
 * ── TONE (the critical step)
 *
 * The arid/mossy tone step pins the mean luminance of the BARE STONE, measured
 * with the overlay pixels excluded. Snow is far brighter than moss, so including
 * it would pull the mean way up and the darkening multiply would crush the rock
 * to near-black. Same fix, new classifier: `isSnow` (high luminance + low
 * saturation) is excluded from the measurement, and the multiply pins the bare
 * stone to TONE_TARGET_LUM — the value measured on the shipped rock_arid set
 * (56.5, R/B 1.23), so all three sets stay one family.
 *
 * The TINT is split, unlike the arid/mossy step. rock_arid applies a single warm
 * vector [1.08, 1.0, 0.88] to every pixel. Applied to snow that yields CREAM,
 * which is wrong on the snow_peak floor (measured: cool blue-grey, R/B 0.756).
 * So the warm vector is blended per pixel against a faintly cool snow vector
 * using a SOFT snow weight — hard-masking would leave a visible tint seam along
 * the snow line. Bare stone therefore lands on exactly the arid family tone; the
 * snow stays neutral-to-cool.
 *
 * ── PROMPT LENGTH
 *
 * fal-ai/flux-pro/v1.1 only encodes roughly the first ~1200 characters; anything
 * past that is dead text (proven on the bush set: a change at char 1364 returned
 * a byte-identical image on the same seed). `assertPromptFits` throws BEFORE the
 * API call so that failure mode cannot recur silently.
 *
 * MEASURED FOR KONTEXT (`probe` subcommand, 2 pairs of same-seed calls differing
 * only after a split point):
 *     split  700  -> outputs DIFFER  (d6f56231 vs 61b07eee)
 *     split 1250  -> outputs DIFFER  (9a0e7c14 vs 1a6532ec)
 * A difference proves the tail reached the encoder, so flux-pro/kontext does NOT
 * share the v1.1 ~1200-char cutoff — its window extends past 1250 at least. The
 * 1100-char budget is kept anyway: kontext edits are documented to degrade with
 * long prompts, and every prompt here is under 600.
 *
 * ── PROP SIZE CONVENTION (same as props-rock-generate.cjs)
 *   tight-cropped, aspect preserved, no padding, RGBA webp, max side 400 px,
 *   mips @half/@quarter/@eighth = round(dim * 0.5/0.25/0.125),
 *   webp { quality: 90, effort: 4, smartSubsample: true }.
 *
 * fal key from scripts/.env (FAL_AI_API_KEY) — never hardcode, never log, never commit.
 *
 * Usage:
 *   node scripts/props-rock-snow-generate.cjs gen               all 6
 *   node scripts/props-rock-snow-generate.cjs gen 2 5           only those indices
 *   node scripts/props-rock-snow-generate.cjs gen 2 --seed 9912 re-roll variant 2
 *   node scripts/props-rock-snow-generate.cjs gen --reuse-raw   re-run steps 2..6 only
 *   node scripts/props-rock-snow-generate.cjs validate
 *   node scripts/props-rock-snow-generate.cjs sheet             review sheets
 *   node scripts/props-rock-snow-generate.cjs integrate [i...]
 *   node scripts/props-rock-snow-generate.cjs probe             kontext prompt-length test
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
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

const FAMILY = 'rock_snow';
const N = 6;
const TARGET_MAX = 400;
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const MIPS = [
  { suffix: '@half', scale: 0.5 },
  { suffix: '@quarter', scale: 0.25 },
  { suffix: '@eighth', scale: 0.125 },
];

// ══════════════════════════════════════
// PROMPT
// ══════════════════════════════════════

// flux-pro/v1.1 encodes ~1200 chars. Kontext is measured by `probe`; until that
// says otherwise the same budget is enforced, with headroom.
const PROMPT_MAX = 1100;
function assertPromptFits(p, label) {
  if (p.length > PROMPT_MAX)
    throw new Error(
      `${label}: prompt is ${p.length} chars, over the ${PROMPT_MAX} budget — ` +
        `text past the encoder limit is silently ignored, shorten it instead of paying for a dead run`,
    );
  return p;
}

// Snow derive (flux-pro/kontext). Same STRUCTURE as MOSS_PROMPT in
// props-rock-generate.cjs: name the overlay, name WHERE it goes, state how much
// stone stays bare, then pin shape / colour / background as unchanged.
//
// PHRASED POSITIVELY THROUGHOUT. The moss run proved that naming an unwanted
// artefact ("do not add holes, pits, round cavities") makes kontext paint it in.
// So there is no "not fully covered", no "no snowman", no "no ground shadow" —
// instead: where the snow sits, what stays bare, what is unchanged.
//
// The two clauses that carry the brief ("snow on tops and in the cracks",
// "flanks and fresh breaks stay bare stone") are FIRST, because position is the
// strongest lever in this encoder.
// ATTEMPT 1 (seed 810108, 577 chars) — REJECTED on visual review.
//   'Add a layer of fresh white snow lying on this rock. The snow settles on the
//    upward-facing top surfaces and packs into the cracks and crevices, with small
//    drifts caught on the flat ledges and in the notches between the broken facets.
//    The steep side flanks and the freshly broken facets stay bare dark stone, so
//    the sharp silhouette and every crack still read clearly. About half of the rock
//    is still bare stone. The snow is clean cold white, slightly blue in its own
//    shadows. Keep the rock shape, the dark stone colour, the cracks and the plain
//    grey background exactly the same.'
//   Two failures:
//   a) "a layer of snow LYING ON this rock" was read as WHITEWASH: a thin even
//      rime over every face including the near-vertical ones, cracks showing
//      through as dark lines. Not snow that accumulated — snow that was painted on.
//   b) it invented a snow GROUND under the rock (birefnet cuts it, but the added
//      floor changes the exposure of the whole frame).
//   Both are addressed below by copying the MOSS_PROMPT structure more literally:
//   the word "only" for the placement, an explicit majority-bare sentence, and the
//   backdrop restated as a place the rock FLOATS against (positive phrasing —
//   naming an unwanted floor would paint one in, the lesson from the moss run).
const SNOW_PROMPT =
  'Add patches of thick fresh white snow to this rock. ' +
  'Snow only on the flat upward-facing top surfaces and packed into the cracks and crevices, ' +
  'in small rounded drifts with soft edges. ' +
  'Most of the dark stone stays bare: the steep sides, the front face and the freshly broken ' +
  'facets are clear dark rock. ' +
  'Keep the rock shape, the dark stone colour and the cracks exactly the same, ' +
  'and the rock still floats against the same plain flat grey backdrop.';

// ── VARIANT 1 HAS NO PER-SHAPE PROMPT, AND THAT IS A RESULT, NOT AN OMISSION ──
//
// Variant 1 is the "broad LOW WIDE boulder with a rounded eroded dome top" — the
// only shape in the set with no crevices on its upper side. It comes back at
// ~42 % snow against a set mean of 23 %: a continuous white cap over the whole
// dome, cracks showing through as black lines, rather than the patchy snow the
// other five get. The moss set solved its analogous outlier with a per-shape
// MOSS_PROMPT_SPARSE, so that was tried here too. It does not work:
//
//   a2  810210  default prompt                                  42.0 %  white cap
//   a3  810219  default prompt, new seed                        42.5 %  white cap
//                 -> coverage is driven by the SHAPE, not the sampling
//   a4  810231  '...small soft mounds of snow with rounded edges,
//                each mound clearly raised above the stone surface...'
//                                                                9.0 %  REJECTED
//                 -> "raised above the surface" is read as an OBJECT: six discrete
//                    white egg-shaped blobs sitting on bare rock. Volume language
//                    does not describe a surface property to this model.
//   a5  810237  '...thin uneven drifts with soft edges that follow
//                the stone surface...'                          42.2 %  white cap
//                 -> removed the blobs, coverage snapped back to the full cap
//   a6  810243  '...partly melted away, uneven mottled pattern of
//                white patches with dark stone showing through...'
//                                                               40.8 %  white cap
//                 -> changing the ARCHETYPE rather than the quantity does not
//                    move it either
//
// Four prompts and five seeds give exactly two outcomes on this shape, ~41 % or
// ~9 %, with nothing in between. The dome is a bimodal attractor and no wording
// found here reaches the middle. ACCEPTED at the default prompt (a2, seed 810210)
// because the outcome is defensible on its own terms: a smooth dome is physically
// the surface that holds an even snow cap, while fractured rock holds patchy
// snow, so the spread across the set reads as variety rather than inconsistency.
// The brief's actual constraint still holds — the lower half is bare dark stone
// and the silhouette and cracks are fully preserved — and at the 28 px draw size
// this is the most legible sprite of the six. Set coherence comes from the pinned
// bare-stone tone, not from an equal snow percentage.
//
// A future attempt should change the INPUT, not the prompt: pre-masking the dome
// so kontext only sees crevice regions, or re-rolling the arid shape 1 itself to
// something less smooth. Both are out of scope here (shape 1 is signed off).

// One arid raw per index (never regenerated here — read only).
const ARID_RAW = (i) => path.join(DIR_RAW, `rock_arid_${i}_raw.png`);

// Kontext derive seeds. Explicit (not `aridSeed + k`) so a per-variant re-roll is
// visible in the diff and reproducible. Base = the arid seed of the same index
// with a +7 offset; overridden entries record their re-roll below.
const SNOW_SEEDS = [810108, 810210, 820260, 810418, 810520, 820530];

// ══════════════════════════════════════
// HTTP helpers (same shape as props-rock-generate.cjs)
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
// Step 1 — derive snow
// ══════════════════════════════════════

async function deriveSnow(basePng, seed, prompt = SNOW_PROMPT) {
  assertPromptFits(prompt, 'snow derive');
  process.stdout.write('    snow-kontext');
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

async function cleanAlpha(nobgPng) {
  const { data, info } = await sharp(nobgPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  alphaLevels(data);
  const dropped = removeSpecks(data, info.width, info.height);
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
// Step 4 — tone normalise (snow-aware)
// ══════════════════════════════════════

/**
 * Soft snow weight in [0..1] — 1 = certainly snow, 0 = certainly stone.
 *
 * Snow is defined by BRIGHTNESS + LOW SATURATION together; brightness alone
 * would also catch the sunlit top facets of bare stone. The weight is soft on
 * both axes so the tint blend has no visible seam along the snow line
 * (a hard mask leaves a 1-px cream/blue fringe that reads as a rim light).
 *
 * Thresholds are set against the source material: the kontext output is an
 * un-normalised photo whose bare stone runs ~40..130 luminance with the
 * brightest lit facets near 150, while the snow sits at 175..250 and is almost
 * neutral. LUM_LO 150 / LUM_HI 200 and SAT_HI 0.20 / SAT_LO 0.10 straddle that
 * gap; `snowStats` prints the resulting coverage so a drift can be seen.
 */
const SNOW_LUM_LO = 150;
const SNOW_LUM_HI = 200;
const SNOW_SAT_LO = 0.1;
const SNOW_SAT_HI = 0.2;
function snowWeight(r, g, b) {
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const sat = mx === 0 ? 0 : (mx - mn) / mx;
  const wl = Math.min(1, Math.max(0, (lum - SNOW_LUM_LO) / (SNOW_LUM_HI - SNOW_LUM_LO)));
  const ws = Math.min(1, Math.max(0, (SNOW_SAT_HI - sat) / (SNOW_SAT_HI - SNOW_SAT_LO)));
  return wl * ws;
}

// Measured on the shipped rock_arid set (all six sit at 56.5/56.6, R/B 1.222..1.251).
// Pinning the BARE STONE of rock_snow to the same number is what keeps the three
// sets one family.
const TONE_TARGET_LUM = 56.5;
const TONE_MIN_FACTOR = 0.35; // kontext raises overall exposure; a snow rock legitimately needs a
// stronger multiply than the 0.62 guard the bare arid rock uses. Still a guard:
// below this the source is a washed-out white blob with no stone left to darken.
//
// UNLIKE the arid/mossy script the factor is NOT clamped at 1.0. That script
// only ever darkens because flux-pro/v1.1 reliably returns rocks that are too
// bright. A snow derive goes the other way just as often: kontext dims the stone
// so the snow pops, and rock_snow_1 came back at bare-stone 48.9 — below the
// family value, with the clamp making it unfixable (measured: factor pinned to
// 1.000, validator FAIL). Brightening is the same uniform multiply, so it is
// allowed, with its own guard: past this the source is underexposed mud and
// scaling it up only amplifies noise.
const TONE_MAX_FACTOR = 1.3;
const WARM = [1.08, 1.0, 0.88]; // identical to rock_arid — the family tone
const SNOW_TINT = [0.97, 1.0, 1.06]; // faintly cool, so snow does not go cream on the
// blue-grey snow_peak floor (measured R/B 0.756)

/**
 * The snow mask is computed ONCE, on the PRE-tone image, and persisted as a
 * grayscale sidecar (assets/cropped/<name>_snowmask.png).
 *
 * It has to be, because the tone step darkens the image: re-running snowWeight
 * on the OUTPUT reclassifies dimmed snow as stone. Measured on attempt 1: the
 * tone step saw 50.5 % snow and pinned the bare stone to 56.5, then the
 * validator re-measured the same file and reported 11.3 % snow / bare-stone
 * luminance 104 — the same picture, two irreconcilable numbers, and a spurious
 * FAIL. One mask, computed once, keeps tone and validation talking about the
 * same pixels. It is a PNG rather than in-memory state so it can be eyeballed:
 * a wrong classifier is obvious the moment the mask is opened.
 */
function maskPath(name) {
  return path.join(DIR_CROP, `${name}_snowmask.png`);
}

async function writeSnowMask(prePng, name) {
  const { data, info } = await sharp(prePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const m = Buffer.alloc(info.width * info.height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    m[p] = data[i + 3] === 0 ? 0 : Math.round(255 * snowWeight(data[i], data[i + 1], data[i + 2]));
  }
  await sharp(m, { raw: { width: info.width, height: info.height, channels: 1 } })
    .png()
    .toFile(maskPath(name));
  return m;
}

/**
 * Load the sidecar mask resampled to w x h (nearest, so weights stay crisp).
 *
 * `toColourspace('b-w')` is load-bearing: sharp does NOT guarantee a 1-channel
 * raw buffer just because the PNG is grayscale — it handed back 3 channels here,
 * so indexing it by pixel silently read the mask at 1/3 scale. Symptom was a
 * tone step and a validator disagreeing about the same file (snow 28.7 % vs
 * 20.6 %, bare stone pinned to 56.5 but re-measured at 98.0). The stride is
 * asserted rather than assumed.
 */
async function loadSnowMask(name, w, h) {
  const p = maskPath(name);
  if (!fs.existsSync(p)) return null;
  const { data, info } = await sharp(p)
    .resize(w, h, { fit: 'fill', kernel: 'nearest' })
    .toColourspace('b-w')
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 1) throw new Error(`snow mask has ${info.channels} channels, expected 1`);
  return data;
}

async function toneNormalise(png, name, mask) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0,
    sum = 0,
    snowPx = 0,
    opaque = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] < 200) continue;
    opaque++;
    if (mask[p] > 127) {
      snowPx++;
      continue; // exclude snow from the measurement — same principle as isMoss
    }
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    n++;
  }
  if (n < opaque * 0.15)
    throw new Error(`${name}: almost no bare stone left (${((100 * n) / opaque).toFixed(1)}%) — regenerate`);
  const mean = sum / n;
  const factor = TONE_TARGET_LUM / mean;
  if (factor < TONE_MIN_FACTOR)
    throw new Error(
      `${name}: bare stone too bright (meanLum ${mean.toFixed(1)}, would need x${factor.toFixed(2)} < ${TONE_MIN_FACTOR}) — regenerate with a new seed`,
    );
  if (factor > TONE_MAX_FACTOR)
    throw new Error(
      `${name}: bare stone too dark (meanLum ${mean.toFixed(1)}, would need x${factor.toFixed(2)} > ${TONE_MAX_FACTOR}) — regenerate with a new seed`,
    );
  console.log(
    `    tone: bare-stone meanLum ${mean.toFixed(1)} -> x${factor.toFixed(3)}, snow ${((100 * snowPx) / opaque).toFixed(1)}% of opaque`,
  );
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] === 0) continue;
    const w = mask[p] / 255;
    for (let c = 0; c < 3; c++) {
      const tint = WARM[c] * (1 - w) + SNOW_TINT[c] * w;
      data[i + c] = Math.min(255, Math.round(data[i + c] * factor * tint));
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

async function scaleToConvention(croppedPng) {
  const m = await sharp(croppedPng).metadata();
  const f = TARGET_MAX / Math.max(m.width, m.height);
  const w = Math.max(1, Math.round(m.width * f));
  const h = Math.max(1, Math.round(m.height * f));
  return sharp(croppedPng).resize(w, h, { fit: 'fill' }).png().toBuffer();
}

// ══════════════════════════════════════
// Step 5 — validation
// ══════════════════════════════════════

const ASPECT_MIN = 0.4;
const ASPECT_MAX = 1.75; // renderer cap: TW / PROP_BASE_HEIGHT = 48 / 28 = 1.71, rounded
const BARE_LUM_TOL = 2.5; // bare stone must land on the rock_arid family value
const SNOW_MIN_PCT = 12.0; // below this the rock does not read as snow-capped at 28 px
const SNOW_MAX_PCT = 55.0; // above this the silhouette turns into a white blob
// Silhouette drift: kontext must not re-sculpt the rock. IoU of the alpha mask
// against the shipped rock_arid_<i>.webp, both normalised to a common box.
const IOU_MIN = 0.85;
const ASPECT_DRIFT_MAX = 0.2;

async function alphaMask(file, size = 256) {
  const { data } = await sharp(file)
    .ensureAlpha()
    .resize(size, size, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const m = new Uint8Array(size * size);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) m[p] = data[i + 3] >= 128 ? 1 : 0;
  return m;
}

async function silhouetteIoU(snowPng, aridWebp) {
  if (!fs.existsSync(aridWebp)) return null;
  const a = await alphaMask(snowPng);
  const b = await alphaMask(aridWebp);
  let inter = 0,
    uni = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] | b[i]) uni++;
    if (a[i] & b[i]) inter++;
  }
  return uni === 0 ? 0 : inter / uni;
}

async function measure(pngPath, name) {
  const { data, info } = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  // Same mask the tone step used (see writeSnowMask) — never re-classify the
  // tone-normalised pixels, they no longer sit in the source exposure range.
  const mask = await loadSnowMask(name, w, h);
  if (!mask) throw new Error(`${name}: snow mask missing — re-run with --reuse-raw`);
  let n = 0,
    snow = 0,
    bareN = 0,
    bareLum = 0,
    bareR = 0,
    bareB = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] < 200) continue;
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    n++;
    if (mask[p] > 127) {
      snow++;
    } else {
      bareLum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      bareR += r;
      bareB += b;
      bareN++;
    }
  }
  const bbox = await alphaBBox(pngPath);
  return {
    w,
    h,
    aspect: w / h,
    snowPct: (100 * snow) / n,
    bareLum: bareLum / bareN,
    bareRB: bareR / bareB,
    tight: bbox.minX === 0 && bbox.minY === 0 && bbox.maxX === w - 1 && bbox.maxY === h - 1,
  };
}

async function validate(i) {
  const name = `${FAMILY}_${i}`;
  const p = path.join(DIR_FINAL, `${name}.png`);
  if (!fs.existsSync(p)) return { name, ok: false, problems: ['missing'], m: null };
  const m = await measure(p, name);
  const arid = path.join(SRC_PROPS, 'rock_arid', `rock_arid_${i}.webp`);
  const iou = await silhouetteIoU(p, arid);
  let aridAspect = null;
  if (fs.existsSync(arid)) {
    const am = await sharp(arid).metadata();
    aridAspect = am.width / am.height;
  }
  const problems = [];
  if (Math.max(m.w, m.h) !== TARGET_MAX) problems.push(`max side ${Math.max(m.w, m.h)} != ${TARGET_MAX}`);
  if (m.aspect < ASPECT_MIN || m.aspect > ASPECT_MAX)
    problems.push(`aspect ${m.aspect.toFixed(2)} outside ${ASPECT_MIN}..${ASPECT_MAX}`);
  if (!m.tight) problems.push('not tight-cropped (transparent border)');
  if (Math.abs(m.bareLum - TONE_TARGET_LUM) > BARE_LUM_TOL)
    problems.push(`bare-stone lum ${m.bareLum.toFixed(1)} off family target ${TONE_TARGET_LUM}`);
  if (m.snowPct < SNOW_MIN_PCT) problems.push(`too little snow (${m.snowPct.toFixed(1)}% < ${SNOW_MIN_PCT}%)`);
  if (m.snowPct > SNOW_MAX_PCT) problems.push(`snow too dominant (${m.snowPct.toFixed(1)}% > ${SNOW_MAX_PCT}%)`);
  if (iou !== null && iou < IOU_MIN)
    problems.push(`silhouette drift vs rock_arid_${i} (IoU ${iou.toFixed(3)} < ${IOU_MIN}) — kontext re-sculpted the rock`);
  if (aridAspect !== null && Math.abs(m.aspect - aridAspect) > ASPECT_DRIFT_MAX)
    problems.push(`aspect drift ${m.aspect.toFixed(2)} vs arid ${aridAspect.toFixed(2)}`);
  return { name, ok: problems.length === 0, problems, m, iou, aridAspect };
}

// ══════════════════════════════════════
// Per-variant run
// ══════════════════════════════════════

async function runVariant(i, seedOverride, reuseRaw) {
  const name = `${FAMILY}_${i}`;
  const seed = seedOverride ?? SNOW_SEEDS[i];
  console.log(`\n[${name}] snow derive from rock_arid_${i}_raw, seed ${seed}`);

  const rawPath = path.join(DIR_RAW, `${name}_raw.png`);
  let raw;
  if (reuseRaw && fs.existsSync(rawPath)) {
    raw = fs.readFileSync(rawPath);
    console.log('    raw: reused');
  } else {
    const base = ARID_RAW(i);
    if (!fs.existsSync(base)) throw new Error(`arid base missing: ${base}`);
    raw = await deriveSnow(fs.readFileSync(base), seed);
    fs.writeFileSync(rawPath, raw);
  }

  // --reuse-raw also reuses the cut-out: iterating on the TONE step alone must
  // not re-bill a birefnet call per attempt.
  const nobgPath = path.join(DIR_NOBG, `${name}_nobg.png`);
  let nobg;
  if (reuseRaw && fs.existsSync(nobgPath)) {
    nobg = fs.readFileSync(nobgPath);
    console.log('    nobg: reused');
  } else {
    nobg = await cleanAlpha(await removeBackground(raw));
    fs.writeFileSync(nobgPath, nobg);
  }

  const pre = await tightCrop(nobg);
  const mask = await writeSnowMask(pre, name);
  const cropped = await toneNormalise(pre, name, mask);
  fs.writeFileSync(path.join(DIR_CROP, `${name}_cropped.png`), cropped);

  const final = await scaleToConvention(cropped);
  fs.writeFileSync(path.join(DIR_FINAL, `${name}.png`), final);

  const v = await validate(i);
  console.log(
    `    -> ${v.m.w}x${v.m.h} aspect ${v.m.aspect.toFixed(2)} bareLum ${v.m.bareLum.toFixed(1)} ` +
      `bareR/B ${v.m.bareRB.toFixed(3)} snow ${v.m.snowPct.toFixed(1)}% IoU ${v.iou === null ? 'n/a' : v.iou.toFixed(3)} ` +
      `${v.ok ? 'PASS' : 'FAIL: ' + v.problems.join('; ')}`,
  );
  return v;
}

// ══════════════════════════════════════
// Review sheets
// ══════════════════════════════════════

const BG = { r: 122, g: 116, b: 104, alpha: 1 };

async function contactSheet() {
  const files = [];
  for (let i = 0; i < N; i++) {
    const p = path.join(DIR_FINAL, `${FAMILY}_${i}.png`);
    if (fs.existsSync(p)) files.push(p);
  }
  if (!files.length) return;
  const CELL = 260,
    COLS = 3;
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
  const out = path.join(DIR_REVIEW, `${FAMILY}_sheet.png`);
  await sharp({ create: { width: COLS * CELL, height: rows * CELL, channels: 4, background: BG } })
    .composite(comp)
    .png()
    .toFile(out);
  console.log(`[sheet] ${out}`);
}

/**
 * A/B contact sheet: shipped rock_arid on the top row of each pair, the new
 * rock_snow directly beneath it, so the amount of snow added is readable at a
 * glance and any silhouette drift jumps out.
 */
async function abSheet() {
  const CELL = 230;
  const comp = [];
  for (let i = 0; i < N; i++) {
    const a = path.join(SRC_PROPS, 'rock_arid', `rock_arid_${i}.webp`);
    const s = path.join(DIR_FINAL, `${FAMILY}_${i}.png`);
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
        left: i * CELL + 7,
        top: row * CELL + 7,
      });
    }
  }
  const out = path.join(DIR_REVIEW, `${FAMILY}_ab_vs_arid.png`);
  await sharp({ create: { width: N * CELL, height: 2 * CELL, channels: 4, background: BG } })
    .composite(comp)
    .png()
    .toFile(out);
  console.log(`[sheet] ${out}`);
}

/**
 * On-floor sheet: the props composited on the real snow_peak tiles, bottom-centre
 * anchored exactly like PlanetSurface draws them
 * (drawH = PROP_BASE_HEIGHT * scale, drawW = drawH * aspect, ground point at the
 * tile's vertical centre). Rendered twice:
 *   - a 1:1 strip at the true in-game 28 px height
 *   - the same strip scaled up 4x (nearest) so the pixels can be judged
 */
const TW = 48,
  TH = 24,
  PROP_BASE_HEIGHT = 28;

async function floorSheet() {
  const tiles = [];
  for (let i = 0; i < 4; i++) {
    const p = path.join(DIR_TILES, 'snow_peak', `snow_peak_${i}.webp`);
    if (fs.existsSync(p)) tiles.push(p);
  }
  if (!tiles.length) {
    console.log('[sheet] no snow_peak tiles — skipping floor sheet');
    return;
  }
  const COLS = 6,
    CW = TW * 2,
    CH = 90;
  const comp = [];
  for (let i = 0; i < N; i++) {
    const f = path.join(DIR_FINAL, `${FAMILY}_${i}.png`);
    if (!fs.existsSync(f)) continue;
    const tile = await sharp(tiles[i % tiles.length]).resize(TW, TH, { fit: 'fill' }).png().toBuffer();
    const m = await sharp(f).metadata();
    const drawH = PROP_BASE_HEIGHT;
    const drawW = Math.max(1, Math.round(drawH * (m.width / m.height)));
    const prop = await sharp(f).resize(drawW, drawH, { fit: 'fill' }).png().toBuffer();
    const cx = i * CW + Math.round((CW - TW) / 2);
    const groundY = CH - 26; // baseline inside the cell
    comp.push({ input: tile, left: cx, top: groundY - Math.round(TH / 2) });
    comp.push({ input: prop, left: cx + Math.round((TW - drawW) / 2), top: groundY - drawH });
  }
  const strip = await sharp({ create: { width: COLS * CW, height: CH, channels: 4, background: BG } })
    .composite(comp)
    .png()
    .toBuffer();
  const out1 = path.join(DIR_REVIEW, `${FAMILY}_on_snow_peak_1x.png`);
  const out4 = path.join(DIR_REVIEW, `${FAMILY}_on_snow_peak_4x.png`);
  await sharp(strip).toFile(out1);
  await sharp(strip)
    .resize(COLS * CW * 4, CH * 4, { fit: 'fill', kernel: 'nearest' })
    .toFile(out4);
  console.log(`[sheet] ${out1}`);
  console.log(`[sheet] ${out4}`);
}

/**
 * Density preview: 4x4 patches of snow_peak tiles, one panel per candidate
 * density. Answers "how many rocks per tile is right" visually rather than by
 * argument.
 *
 * `coverage` is the fraction of tiles that get props at all, and it is not
 * decoration: propLayout maps g = 0 to ZERO props, and the rocky biomes measure
 * g ~= 0.73 in live data (mostly 0, occasionally 1). A panel that puts props on
 * every tile therefore shows a case that essentially never occurs and reads as a
 * solid boulder field — which is exactly how the first version of this sheet
 * misled. The realistic panel is the leftmost one, at coverage ~0.35; the
 * full-coverage panels to its right are the worst case at that count.
 */
async function densitySheet(
  panelSpecs = [
    { count: 1, coverage: 0.35 }, // g = 1 at the live rocky-biome g distribution
    { count: 1, coverage: 1 },
    { count: 2, coverage: 1 },
    { count: 3, coverage: 1 },
  ],
) {
  const tiles = [];
  for (let i = 0; i < 4; i++) {
    const p = path.join(DIR_TILES, 'snow_peak', `snow_peak_${i}.webp`);
    if (fs.existsSync(p)) tiles.push(await sharp(p).resize(TW, TH, { fit: 'fill' }).png().toBuffer());
  }
  const props = [];
  for (let i = 0; i < N; i++) {
    const f = path.join(DIR_FINAL, `${FAMILY}_${i}.png`);
    if (fs.existsSync(f)) {
      const m = await sharp(f).metadata();
      const drawH = PROP_BASE_HEIGHT;
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
  for (const { count, coverage } of panelSpecs) {
    const comp = [];
    const items = [];
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C; c++) {
        const sx = Math.round((c - r) * (TW / 2) + panelW / 2 - TW / 2);
        const sy = Math.round((c + r) * (TH / 2) + 10);
        comp.push({ input: tiles[(r * C + c) % tiles.length], left: sx, top: sy });
        if (rand() > coverage) continue; // this tile's g is 0 -> no props at all
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
  const out = path.join(DIR_REVIEW, `${FAMILY}_density.png`);
  await sharp({
    create: { width: panelW * panels.length, height: panelH, channels: 4, background: BG },
  })
    .composite(panels.map((b, i) => ({ input: b, left: i * panelW, top: 0 })))
    .png()
    .toFile(out);
  console.log(
    `[sheet] ${out}  (left to right: ${panelSpecs.map((s) => `${s.count}/tile @ ${Math.round(s.coverage * 100)}% of tiles`).join(', ')})`,
  );
}

async function sheets() {
  fs.mkdirSync(DIR_REVIEW, { recursive: true });
  await contactSheet();
  await abSheet();
  await floorSheet();
  await densitySheet();
}

// ══════════════════════════════════════
// Prompt-length probe for flux-pro/kontext
// ══════════════════════════════════════

/**
 * Does kontext truncate the prompt like flux-pro/v1.1 (~1200 chars)?
 *
 * Two calls per split point, same seed, same image, prompts IDENTICAL up to the
 * split and different after it. Byte-identical PNGs => the encoder never saw the
 * tail. The control at a low split proves the method can detect a difference at
 * all (otherwise "identical" could just mean "kontext ignores colour words").
 */
async function probe() {
  const base = fs.readFileSync(ARID_RAW(0));
  const seed = 424242;
  const pad = (n) => 'The rock rests in the middle of the frame. '.repeat(40).slice(0, n);
  const tails = [' Make the snow bright pink.', ' Make the snow deep black.'];

  for (const split of [700, 1250]) {
    const hashes = [];
    for (const tail of tails) {
      const head = (SNOW_PROMPT + ' ' + pad(2000)).slice(0, split);
      const p = head + tail;
      process.stdout.write(`  split ${split} len ${p.length}`);
      const r = JSON.parse(
        await post('fal.run', '/fal-ai/flux-pro/kontext', {
          image_url: `data:image/png;base64,${base.toString('base64')}`,
          prompt: p,
          num_images: 1,
          safety_tolerance: '5',
          seed,
        }),
      );
      const buf = await download(r.images[0].url);
      const h = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
      fs.writeFileSync(path.join(DIR_RAW, `_probe_${split}_${tails.indexOf(tail)}.png`), buf);
      console.log(`  sha ${h}`);
      hashes.push(h);
    }
    console.log(
      `  => split ${split}: ${hashes[0] === hashes[1] ? 'IDENTICAL — tail ignored (truncated)' : 'DIFFERENT — tail was encoded'}`,
    );
  }
}

// ══════════════════════════════════════
// Integrate
// ══════════════════════════════════════

async function integrate(indices) {
  const dir = path.join(SRC_PROPS, FAMILY);
  fs.mkdirSync(dir, { recursive: true });
  for (const i of indices) {
    const name = `${FAMILY}_${i}`;
    const src = path.join(DIR_FINAL, `${name}.png`);
    if (!fs.existsSync(src)) {
      console.log(`  SKIP ${name} (no final png)`);
      continue;
    }
    const v = await validate(i);
    if (!v.ok) throw new Error(`refusing to integrate ${name}: ${v.problems.join('; ')}`);
    await sharp(src).webp(WEBP).toFile(path.join(dir, `${name}.webp`));
    const m = await sharp(src).metadata();
    for (const mip of MIPS) {
      await sharp(src)
        .resize(Math.max(1, Math.round(m.width * mip.scale)), Math.max(1, Math.round(m.height * mip.scale)), {
          fit: 'fill',
        })
        .webp(WEBP)
        .toFile(path.join(dir, `${name}${mip.suffix}.webp`));
    }
    console.log(`  ${FAMILY}/${name}.webp  ${m.width}x${m.height} (+3 mips)`);
  }
}

// ══════════════════════════════════════
// main
// ══════════════════════════════════════

(async () => {
  const argv = process.argv.slice(2);
  const cmd = argv[0] || 'gen';
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const seedIdx = argv.indexOf('--seed');
  const seedOverride = seedIdx >= 0 ? parseInt(argv[seedIdx + 1], 10) : null;
  const idxArgs = argv
    .slice(1)
    .filter((a) => /^\d+$/.test(a))
    .map(Number)
    .filter((n) => n !== seedOverride);
  const indices = idxArgs.length ? idxArgs : Array.from({ length: N }, (_, i) => i);

  for (const d of [DIR_RAW, DIR_NOBG, DIR_CROP, DIR_FINAL, DIR_REVIEW]) fs.mkdirSync(d, { recursive: true });

  if (cmd === 'sheet') return sheets();
  if (cmd === 'integrate') return integrate(indices);
  if (cmd === 'validate') {
    for (const i of indices) {
      const v = await validate(i);
      console.log(
        v.m
          ? `${v.name.padEnd(13)} ${v.m.w}x${v.m.h} aspect ${v.m.aspect.toFixed(2)} bareLum ${v.m.bareLum.toFixed(1)} ` +
              `bareR/B ${v.m.bareRB.toFixed(3)} snow ${v.m.snowPct.toFixed(1)}% IoU ${v.iou === null ? 'n/a' : v.iou.toFixed(3)} ` +
              `tight=${v.m.tight} ${v.ok ? 'PASS' : 'FAIL: ' + v.problems.join('; ')}`
          : `${v.name.padEnd(13)} MISSING`,
      );
    }
    return;
  }

  if (!FAL_API_KEY) {
    console.error('No fal key (FAL_AI_API_KEY) in scripts/.env');
    process.exit(1);
  }

  if (cmd === 'probe') return probe();

  console.log(`prompt length: ${SNOW_PROMPT.length} / ${PROMPT_MAX}`);
  assertPromptFits(SNOW_PROMPT, 'SNOW_PROMPT');

  const reuseRaw = flags.has('--reuse-raw');
  const results = [];
  for (const i of indices) results.push(await runVariant(i, seedOverride, reuseRaw));

  console.log('\n── summary ──');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.problems.join('; ')}`);
  await sheets();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
