/**
 * Asset-Pipeline: surface PROP sprites — DRIFTWOOD (beach biome).
 *
 *   driftwood_0..3   sea-bleached, salt-weathered wood lying flat on the ground
 *
 * Structurally a sibling of scripts/props-rock-generate.cjs (same pipeline
 * building blocks: flux-pro/v1.1 -> birefnet -> alpha levels -> speck removal ->
 * tight crop -> uniform tone multiply -> scale -> validate -> integrate), but
 * with its OWN prompts, its OWN tone target and its OWN aspect band. The rock
 * script is left untouched.
 *
 * ── WHY THE ASPECT BAND IS DIFFERENT ─────────────────────────────────────────
 * The rock validator caps aspect at 1.75 because PlanetSurface draws every prop
 * at drawH = PROP_BASE_HEIGHT (28) * scale and derives the width from the sprite
 * aspect (PlanetSurface.tsx:852) — at 1.75 a prop is 49px wide, i.e. exactly one
 * tile (TW = 48).
 *
 * Real driftwood is 3:1..6:1. Forcing it under 1.75 yields a wood BLOCK, not
 * driftwood. The renderer is therefore getting a per-key `heightFactor` (built by
 * a separate implementation agent) so a 3:1 sprite can be drawn at 28*0.5 = 14px
 * high / 42px wide — reads as a log lying in the tile.
 *
 * So: this set targets aspect ~2.5..3.5 and the validator enforces that band.
 * The band is deliberately NARROW across all four variants, because a single
 * heightFactor has to work for the whole set.
 *
 * ── TONE ─────────────────────────────────────────────────────────────────────
 * Measured targets (mean luminance of opaque pixels):
 *   beach ground tile      44.9   (dark, NOT bright sand)
 *   rock_arid (same biome) 56.5
 *   driftwood  -> 64       clearly readable against the ground, a step above the
 *                          stone, nowhere near white.
 * As with the rocks this is a UNIFORM per-channel multiply — no gradient, no local
 * edit. Unlike the rocks it pins the whole mean COLOUR (TONE_TARGET_RGB), not just
 * luminance: a luminance-only pin left variants 2 and 3 at ~38% saturation against
 * 19-25% for 0 and 1, i.e. one material in four colours. See TONE_TARGET_RGB.
 *
 * NO MOSS CHECK — the rock script's green classifier is rock-family specific and
 * has no meaning here. Green is measured and REPORTED (a driftwood log with
 * algae on it would be a generation failure) but only gated loosely.
 *
 * MODEL: fal-ai/flux-pro/v1.1. flux/dev reproducibly returns cel-shaded low-poly
 * assets with a painted-on ground — see the rock script header. flux-pro/v1.1 has
 * no negative_prompt input, so the negatives are plain text in the prompt.
 *
 * PROP SIZE CONVENTION: tight-cropped, aspect preserved, no fixed canvas, no
 * transparent padding, RGBA webp, max(w,h) = 400, mips @half/@quarter/@eighth at
 * Math.round(dim * 0.5 / 0.25 / 0.125), webp { quality: 90, effort: 4,
 * smartSubsample: true }.
 *
 * FILE NAMING: spriteCache matches /\/props\/([^/]+)\/\1_(\d+)\.webp$/ — the file
 * name must start with the folder name, hence driftwood/driftwood_N.webp.
 *
 * fal key from scripts/.env (FAL_AI_API_KEY) — never hardcode, never log, never commit.
 *
 * Usage:
 *   node scripts/props-driftwood-generate.cjs gen
 *   node scripts/props-driftwood-generate.cjs gen 1 3
 *   node scripts/props-driftwood-generate.cjs gen 2 --seed 991234
 *   node scripts/props-driftwood-generate.cjs gen 0 --reuse-raw   re-run post-processing only
 *   node scripts/props-driftwood-generate.cjs validate
 *   node scripts/props-driftwood-generate.cjs sheet
 *   node scripts/props-driftwood-generate.cjs integrate
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

const FAMILY = 'driftwood';
const TARGET_MAX = 400;
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const MIPS = [
  { suffix: '@half', scale: 0.5 },
  { suffix: '@quarter', scale: 0.25 },
  { suffix: '@eighth', scale: 0.125 },
];

// ══════════════════════════════════════
// PROMPTS
// ══════════════════════════════════════

// Shared style anchor — identical for all 4 variants so the set reads as ONE
// material. Three things are stated redundantly on purpose:
//   - LYING FLAT (the failure mode for wood is a standing trunk/stump)
//   - NOTHING UNDERNEATH (a baked-in sand base or drop shadow is unusable on a
//     tile whose neighbours vary)
//   - DIM / DARK VALUE (bleached wood renders near-white by default; the tone
//     multiply can pull it down, but a x0.4 multiply muddies the grain, so the
//     generation itself must land dark-ish)
// v2 (run 1 -> run 2): run 1 seed 930101 produced a perfect silhouette but two
// hard failures, both traceable to single words in v1:
//   a) "sun-bleached" / "bleached" is an overwhelming WHITE attractor — the log
//      came back bone-white chalk (meanLum 151, would have needed a x0.42
//      multiply, i.e. below the TONE_MIN_FACTOR guard). Every occurrence of
//      "bleach*" is gone from the anchor AND the shape forms; the material is now
//      described as "storm-greyed / ashen / weathered timber" and the dark value
//      is asserted three times.
//   b) "seen from a three-quarter angle slightly above" (lifted from the rock
//      anchor) is not strong enough for a long horizontal object — flux returned
//      a flat eye-level side elevation with no visible top face, which cannot sit
//      on an iso tile. Now an explicit high 45-degree downward camera.
const ANCHOR =
  'photorealistic photograph of one single piece of sea-worn driftwood LYING FLAT AND HORIZONTAL on its side, ' +
  'the driftwood is isolated and cut out, floating against a plain flat uniform mid-grey seamless backdrop, ' +
  'NOTHING underneath the wood: no ground, no sand, no beach, no soil, no floor, no pedestal, no base plate, no cast shadow, ' +
  'HIGH CAMERA ANGLE looking DOWN onto the wood from about 45 degrees above, elevated three-quarter viewpoint, ' +
  'the upper surface of the wood is clearly visible from above, isometric-like raised viewpoint, ' +
  'the piece lies at a DIAGONAL on the ground plane, one end nearer the camera at the lower left and the other end ' +
  'receding away into the distance toward the upper right, foreshortened by perspective, ' +
  'exactly like a prop object in an isometric video game, ' +
  'the wood is salt-weathered and storm-greyed: dull ashen grey-brown driftwood with warm taupe undertones, ' +
  'old weathered timber, dirty grey, dusty and muted, a DARK mid-grey value, deeply shadowed, ' +
  'the bark is completely gone, the bare wood is eroded down to its grain: long parallel ridges and grooves, ' +
  'deep lengthwise checking cracks, split fibrous ends, worn rounded sand-polished surfaces, small boreholes and pits, ' +
  'soft directional light from the upper left, deep dark shadows on the lower-right faces, ' +
  'matte non-reflective bone-dry wood, dim moody low-key lighting, slightly underexposed, muted desaturated colours, ' +
  'high detail, sharp focus, crisp clean silhouette, ' +
  'a low object resting on its side, wider than it is tall, ' +
  'centered in a wide frame with a generous empty margin on all sides';

// Folded into the prompt (flux-pro/v1.1 has no negative_prompt input).
// The "not standing" block is long on purpose: "driftwood" alone pulls the model
// towards beach photographs with sand, and "stump/root" pulls it upright.
const NEGATIVE =
  'No ground, no sand, no beach, no dune, no soil, no floor, no paving, no pebbles underneath, ' +
  'no pedestal, no platform, no base, no cast shadow, no shadow on the ground. ' +
  'No terrain, no landscape, no scenery, no horizon, no sky, no sea, no ocean, no water, no waves, no foam. ' +
  'The wood is NOT upright, NOT standing, NOT vertical, NOT tilted up, NOT leaning, NOT propped up, ' +
  'no standing tree, no standing trunk, no upright stump, no post, no pole, no stake, no totem, no sculpture, ' +
  'no portrait composition, no tall composition. ' +
  'Not white, not bone white, not chalk white, not ivory, not cream, not beige, not pale, not bright, not light coloured, ' +
  'not high key, not overexposed, not brightly lit, no bright white studio lighting, not a clean glossy product photo. ' +
  'No eye level camera, no flat side elevation, no straight-on side view, no profile view, no low camera angle. ' +
  'Not fresh wood, no bark, not brown, not reddish, not wet, not glossy, not varnished, not painted, not charred, not burnt. ' +
  'No leaves, no foliage, no twigs with leaves, no green, no moss, no algae, no lichen, no grass, no vegetation, no flowers. ' +
  'No sawn lumber, no planks, no boards, no beams, no plywood, no firewood, no woodpile, no logs stacked, no bundle, ' +
  'no rope, no net, no shells, no starfish, no birds, no people, no hands, no tools. ' +
  'Not a cartoon, not cel shaded, no outlines, no flat colour blocks, not low-poly, not faceted, not plastic, not CGI render. ' +
  'No grid, no collage, no multiple pieces in a row, no border, no frame, no text, no watermark.';

// Four distinct silhouettes, one material.
//
// The generation canvas aspect is set per shape: flux fills the frame, and on the
// rock set a square canvas silently turned every "wide slab" back into a round
// boulder. For driftwood the canvas is the primary aspect lever — the archetype
// is already elongated, so canvas + one "lying flat, N times as wide" sentence
// FIRST in the prompt is enough. Measured on the rocks: cropped aspect lands at
// roughly 1.2..1.3x the canvas aspect, so a 2.4:1 canvas targets ~3.0:1 output.
// Per-shape negative for the two RE-ROLLED variants (2, 3) — see their aspect
// histories. Lists every thin-object noun flux fell back to, so a re-roll cannot
// drift back into stick territory.
const THIN_NEGATIVE =
  'The wood is NOT thin, NOT slender, NOT skinny, NOT narrow. ' +
  'It is not a stick, not a twig, not a rod, not a pole, not a staff, not a cane, not a wand, not a spear, ' +
  'not a beam, not a plank, not a board, not a batten, not a broom handle, not a walking stick, not a driftwood shard. ' +
  'It is no more than four times as long as it is thick. ' +
  'No extremely elongated panorama composition, no hairline object, no thin horizontal line across the frame.';

const SHAPES = [
  {
    // Smooth bleached log — the plain, readable "reference" piece of the set.
    seed: 930101,
    gen: { w: 1280, h: 704 }, // 1.82:1
    form:
      'One single SHORT STOUT THICK storm-greyed driftwood log lying flat on its side on nothing, ' +
      'its bark completely worn away, the bare trunk polished by sand and surf into soft flowing ridges ' +
      'that run along its length, one end worn down to a blunt rounded stub, the other end broken open with ' +
      'cracked checked end grain, a slight natural bend along its length. ' +
      'A thick heavy log, as thick around as a barrel, only about three times as long as it is thick, NOT a thin stick, NOT a plank.',
  },
  {
    // Gnarled root ball — the most complex silhouette. Widest canvas of the set,
    // because a root mass is the shape most likely to bunch up into a square blob.
    seed: 930203,
    gen: { w: 1280, h: 704 }, // 1.82:1
    form:
      'One single gnarled driftwood root stump lying TIPPED OVER on its side on nothing, ' +
      'a knotted twisted tangle of thick grey weathered roots at the left end, several stubby broken root arms ' +
      'reaching out low and sideways along the ground, the mass tapering to the right into a worn smooth ' +
      'grey shaft with a snapped-off end. ' +
      'A low sprawling tangle, compact and chunky, only about three times as long as it is thick, it does NOT stand up.',
  },
  {
    // Splintered branch / forked limb — the most linear piece of the set.
    //
    // Aspect history (target band 2.3..3.8, ideally ~3.0 so ONE heightFactor
    // serves all four):
    //   r3 seed 930307, canvas 1216x704, "branch ... two thin bare side-twigs
    //      lying ALONGSIDE it" -> 400x91 aspect 4.40. Two failure contributions:
    //      "branch" is a thin archetype, and side-twigs laid ALONGSIDE the shaft
    //      extend the bbox WIDTH without adding any height. Both fixed below —
    //      "branch" becomes "forked limb", the fork now spreads towards the
    //      camera and upward, which adds height instead of width.
    //   r4 seed 930319, canvas 1152x768, "heavy forked LIMB, thick main SHAFT as
    //      thick as a thigh" -> 400x83 aspect 4.82, WORSE — and the camera dropped
    //      back to eye level, losing the top face.
    //
    // Root cause for r3+r4, read against the two variants that DID land (0 = "log"
    // 3.10, 1 = "root stump" 2.96): the HEAD NOUN sets the aspect and nothing else
    // does. "branch", "limb", "shaft", "beam" are intrinsically slender archetypes;
    // "thick as a thigh" and canvas reshaping do not bend them — narrowing the
    // canvas 1.73 -> 1.50 made the result THINNER, the opposite of the intent.
    // r5 therefore keeps "LOG" as the head noun (the one proven chunky word),
    // demotes the fork to a modifier, mirrors variant 0's sentence structure, and
    // runs on variant 0's exact canvas. THIN_NEGATIVE blocks the fallback nouns.
    seed: 930331,
    gen: { w: 1280, h: 704 }, // 1.82:1 — identical to the two variants that landed
    form:
      'One single SHORT STOUT THICK forked driftwood log lying flat on its side on nothing, ' +
      'the heavy trunk splitting into a Y near its right end into two short thick stubby arms that spread ' +
      'towards the camera, both snapped off into sharp fibrous splinters and frayed fibres, ' +
      'the whole log shattered along its length into long raised splinters, one patch hollowed out by rot. ' +
      'A thick heavy log, as thick around as a bucket, only about three times as long as it is thick, ' +
      'NOT a thin stick, NOT a branch.',
    negExtra: THIN_NEGATIVE,
  },
  {
    // Broken trunk section — the heaviest, chunkiest silhouette, so the set has
    // one piece with real volume. "Settled into the ground" gives the flattened
    // lower profile of a half-buried piece WITHOUT drawing any sand.
    // Aspect history:
    //   r3 seed 930411, canvas 1216x768, "only about two and a half times as long
    //      as it is thick" -> 400x185 aspect 2.16, i.e. UNDER the band. This is
    //      the mirror image of variant 2: here the stated ratio was the lowest of
    //      the set AND the canvas the squarest, and the two compounded.
    //   r4 seed 930423, canvas 1280x672, "LONG broken SECTION of a trunk ... a long
    //      low chunky BEAM of wood, about three and a half times as long" ->
    //      400x60 aspect 6.67. A 2.16 -> 6.67 swing off a 1.58 -> 1.90 canvas nudge
    //      is not the canvas: "long", "section", "beam" all landed at once and the
    //      thin archetype took over. Same lesson as variant 2 — the stated ratio is
    //      inert, the nouns are not.
    //   r5: head noun back to "LOG", "long"/"section"/"beam" struck out, structured
    //      like variant 0, on variant 0's canvas, with THIN_NEGATIVE. The
    //      distinguishing silhouette is the sheared flat face and the settled
    //      underside, NOT the aspect ratio.
    seed: 930437,
    gen: { w: 1280, h: 704 }, // 1.82:1 — identical to the two variants that landed
    form:
      'One single SHORT THICK broken chunk of a weathered driftwood log lying flat on its side on nothing, ' +
      'one whole flank sheared clean away to expose a wide flat wind-scoured face full of deep parallel ' +
      'checking cracks, its underside worn flat as if it had settled and sunk into the ground, ' +
      'a jagged torn break at the right end showing a dark rotted hollow core. ' +
      'A thick heavy log chunk, as thick around as a barrel, only about three times as long as it is thick, ' +
      'NOT a thin plank, NOT a board.',
    negExtra: THIN_NEGATIVE,
  },
];

// ══════════════════════════════════════
// HTTP helpers
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
function get(url, headers) {
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
// Step 1 — generate
// ══════════════════════════════════════

async function generate(shape, seed) {
  const submit = JSON.parse(
    await post('queue.fal.run', '/fal-ai/flux-pro/v1.1', {
      // Form FIRST: appended to the end of a long anchor it gets ignored.
      prompt: `${shape.form} ${ANCHOR}. ${NEGATIVE}${shape.negExtra ? ` ${shape.negExtra}` : ''}`,
      image_size: { width: shape.gen.w, height: shape.gen.h },
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
    const st = JSON.parse(await get(submit.status_url, { Authorization: `Key ${FAL_API_KEY}` }));
    if (st.status === 'COMPLETED') {
      const r = JSON.parse(await get(submit.response_url, { Authorization: `Key ${FAL_API_KEY}` }));
      process.stdout.write(' ok\n');
      return download(r.images[0].url);
    }
    if (st.status === 'FAILED') throw new Error(`generation failed: ${JSON.stringify(st).slice(0, 200)}`);
    process.stdout.write('.');
  }
  throw new Error('generation timeout');
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

/**
 * Drop opaque connected components smaller than `minFrac` of the largest one.
 *
 * NOTE vs the rock script: minFrac is 0.006 here, not 0.02. Driftwood variants
 * legitimately have thin detached-looking parts (split twigs, splinter tips)
 * whose component can be a few percent of the main body; 0.02 would amputate
 * them. 0.006 still kills birefnet's stray specks, which are orders of magnitude
 * smaller.
 */
function removeSpecks(data, w, h, minFrac = 0.006) {
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
// Step 4 — tone normalisation + scale
// ══════════════════════════════════════

// Target MEAN COLOUR of the opaque wood, not just a target luminance.
//
// The rock script pins luminance and then applies a FIXED warm multiply. That is
// enough for rocks because kontext-derived rocks already share a hue. It is not
// enough here: with a luminance-only pin the four driftwood variants measured
//   dw0 rgb 72.7/63.1/54.2  R-B 18.4  sat 25.4%
//   dw1 rgb 69.7/63.7/56.4  R-B 13.3  sat 19.0%
//   dw2 rgb 77.0/62.5/48.5  R-B 28.4  sat 37.0%
//   dw3 rgb 78.6/62.0/48.1  R-B 30.4  sat 38.7%
// — identical brightness, but 2 and 3 read distinctly orange-tan next to 0 and 1,
// and twice as saturated as everything they lie beside (rock_arid 18.2%,
// beach ground 20.8%). One material, four colours: not a set.
//
// So the per-channel factors are DERIVED PER VARIANT to land the mean on one
// shared target instead of being a constant. Still a uniform per-channel multiply
// — deterministic, no gradient, no local edit — just calibrated rather than fixed.
//
// The target is rock_arid's own mean (60.8/56.0/49.7) scaled up to luminance ~64,
// nudged a shade less warm: driftwood should sit a step brighter than the stone it
// lies next to and read silvery rather than earthy, without going blue-grey.
// Resulting values: lum 64.4, R-B 14, saturation ~20% — inside the family band.
const TONE_TARGET_RGB = [70, 63.5, 56];
// Guard: a generation needing a stronger multiply than this is genuinely blown
// out and gets REGENERATED, not rescued — a hard multiply flattens the grain.
//
// Set to 0.40, LOWER than the rocks' 0.62. Measured: driftwood generations land
// at meanLum 130..155 no matter how hard the prompt asserts a dark value — the
// word "driftwood" itself carries the bleached-white prior. The run-2 sample
// (meanLum 137.6 -> x0.465) came out as a clean warm weathered grey with the
// grain fully intact, so the multiply is NOT muddying this material the way it
// would a rock. The guard is kept only to catch a truly blown-out white frame.
const TONE_MIN_FACTOR = 0.4;
// Second guard, on the SPREAD of the three factors. A healthy grey-brown log needs
// only a mild rebalance (measured 1.01x..1.31x spread). A generation that would
// need a much harder per-channel correction is not a driftwood colour at all —
// a green, blue or fully saturated orange frame — and must be regenerated, because
// forcing its mean onto the target would wreck its internal colour relations.
const TONE_MAX_SPREAD = 1.6;

async function toneNormalise(png, name) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    sum[0] += data[i];
    sum[1] += data[i + 1];
    sum[2] += data[i + 2];
    n++;
  }
  const mean = sum.map((s) => s / n);
  const meanLum = 0.2126 * mean[0] + 0.7152 * mean[1] + 0.0722 * mean[2];
  const factors = mean.map((m, c) => TONE_TARGET_RGB[c] / m);
  const lo = Math.min(...factors);
  const spread = Math.max(...factors) / lo;
  if (lo < TONE_MIN_FACTOR)
    throw new Error(
      `${name}: generation too bright (meanLum ${meanLum.toFixed(1)}, would need x${lo.toFixed(2)} < ${TONE_MIN_FACTOR}) — regenerate with a new seed / darker prompt`,
    );
  if (spread > TONE_MAX_SPREAD)
    throw new Error(
      `${name}: generation is the wrong colour (mean rgb ${mean.map((m) => m.toFixed(0)).join('/')}, per-channel spread ${spread.toFixed(2)} > ${TONE_MAX_SPREAD}) — regenerate with a new seed`,
    );
  console.log(
    `    tone: mean rgb ${mean.map((m) => m.toFixed(1)).join('/')} (lum ${meanLum.toFixed(1)}) -> x${factors.map((f) => f.toFixed(3)).join('/')}`,
  );
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) {
      data[i + c] = Math.min(255, Math.round(data[i + c] * factors[c]));
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

// Aspect band. NOT the rock band (0.40..1.75, derived from the uncorrected
// TW/PROP_BASE_HEIGHT = 1.71 cap): driftwood is drawn with a per-key heightFactor,
// so the cap moves to 1.71 / heightFactor. The band below is the SHAPE
// requirement — real driftwood reads as driftwood from about 2.3:1 up, and past
// ~3.8:1 the @eighth mip becomes a hairline. Kept narrow so one heightFactor
// serves all four.
const ASPECT_MIN = 2.3;
const ASPECT_MAX = 3.8;
// Luminance band around TONE_TARGET_LUM. The tone step pins the mean, so this is
// really a guard against a piece that the multiply could not reach (too bright,
// caught earlier) or one generated near-black.
const LUM_MIN = 52;
const LUM_MAX = 76;
// Loose green gate: NOT the rock moss classifier, just a sanity check that no
// algae / grass came along. Bare bleached wood measures ~0%.
const GREEN_MAX_PCT = 2.0;

function isGreen(r, g, b) {
  return g - b > 18 && g >= r - 6;
}

async function measure(pngPath) {
  const { data, info } = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let n = 0,
    lum = 0,
    green = 0;
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    lum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum[0] += r;
    sum[1] += g;
    sum[2] += b;
    if (isGreen(r, g, b)) green++;
    n++;
  }
  const mean = sum.map((v) => v / n);
  // Saturation of the mean colour. Reported so a drift away from the family band
  // (rock_arid 18.2%, beach ground 20.8%) is visible in the validate output.
  const sat = (100 * (Math.max(...mean) - Math.min(...mean))) / Math.max(...mean);
  const bbox = await alphaBBox(pngPath);
  return {
    w,
    h,
    aspect: w / h,
    meanLum: lum / n,
    mean,
    sat,
    greenPct: (100 * green) / n,
    tight: bbox.minX === 0 && bbox.minY === 0 && bbox.maxX === w - 1 && bbox.maxY === h - 1,
  };
}

async function validate(idx) {
  const name = `${FAMILY}_${idx}`;
  const p = path.join(DIR_FINAL, `${name}.png`);
  if (!fs.existsSync(p)) return { name, ok: false, problems: ['missing'], m: null };
  const m = await measure(p);
  const problems = [];
  if (Math.max(m.w, m.h) !== TARGET_MAX) problems.push(`max side ${Math.max(m.w, m.h)} != ${TARGET_MAX}`);
  if (m.aspect < ASPECT_MIN || m.aspect > ASPECT_MAX)
    problems.push(`aspect ${m.aspect.toFixed(2)} outside ${ASPECT_MIN}..${ASPECT_MAX}`);
  if (!m.tight) problems.push('not tight-cropped (transparent border)');
  if (m.meanLum > LUM_MAX) problems.push(`too light (meanLum ${m.meanLum.toFixed(1)} > ${LUM_MAX})`);
  if (m.meanLum < LUM_MIN) problems.push(`too dark (meanLum ${m.meanLum.toFixed(1)} < ${LUM_MIN})`);
  if (m.greenPct > GREEN_MAX_PCT) problems.push(`vegetation on the wood (green ${m.greenPct.toFixed(2)}%)`);
  return { name, ok: problems.length === 0, problems, m };
}

// ══════════════════════════════════════
// Per-variant run
// ══════════════════════════════════════

async function runVariant(idx, seedOverride, reuseRaw) {
  const name = `${FAMILY}_${idx}`;
  const shape = SHAPES[idx];
  const seed = seedOverride ?? shape.seed;
  console.log(`\n[${name}] seed ${seed}  canvas ${shape.gen.w}x${shape.gen.h}`);

  const rawPath = path.join(DIR_RAW, `${name}_raw.png`);
  let raw;
  if (reuseRaw && fs.existsSync(rawPath)) {
    raw = fs.readFileSync(rawPath);
    console.log('    raw: reused');
  } else {
    raw = await generate(shape, seed);
    fs.writeFileSync(rawPath, raw);
  }

  const nobg = await cleanAlpha(await removeBackground(raw));
  fs.writeFileSync(path.join(DIR_NOBG, `${name}_nobg.png`), nobg);

  const cropped = await toneNormalise(await tightCrop(nobg), name);
  fs.writeFileSync(path.join(DIR_CROP, `${name}_cropped.png`), cropped);

  const final = await scaleToConvention(cropped);
  fs.writeFileSync(path.join(DIR_FINAL, `${name}.png`), final);

  const v = await validate(idx);
  console.log(
    `    -> ${v.m.w}x${v.m.h} aspect ${v.m.aspect.toFixed(2)} lum ${v.m.meanLum.toFixed(1)} green ${v.m.greenPct.toFixed(2)}% ${v.ok ? 'PASS' : 'FAIL: ' + v.problems.join('; ')}`,
  );
  return v;
}

// ══════════════════════════════════════
// Review sheets
// ══════════════════════════════════════

const BEACH_BG = { r: 47, g: 45, b: 38, alpha: 1 }; // measured mean of beach_0

async function contactSheet() {
  const files = [];
  for (let i = 0; i < SHAPES.length; i++) {
    const p = path.join(DIR_FINAL, `${FAMILY}_${i}.png`);
    if (fs.existsSync(p)) files.push(p);
  }
  if (!files.length) return;
  const CW = 460,
    CH = 260,
    COLS = 2;
  const rows = Math.ceil(files.length / COLS);
  const comp = [];
  for (let i = 0; i < files.length; i++) {
    comp.push({
      input: await sharp(files[i])
        .resize(CW - 20, CH - 20, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer(),
      left: (i % COLS) * CW + 10,
      top: Math.floor(i / COLS) * CH + 10,
    });
  }
  const out = path.join(DIR_REVIEW, `${FAMILY}_sheet.png`);
  await sharp({ create: { width: COLS * CW, height: rows * CH, channels: 4, background: BEACH_BG } })
    .composite(comp)
    .png()
    .toFile(out);
  console.log(`[sheet] ${out}`);
}

// Renderer constants (src/views/grid/isoConstants.ts, propLayout.ts).
const TW = 48,
  TH = 24,
  PROP_BASE_HEIGHT = 28;
// The heightFactor this set is designed for. drawH = 28 * scale * HEIGHT_FACTOR.
const HEIGHT_FACTOR = 0.5;

/**
 * Beach-ground scene: real beach tiles laid out as an iso field with driftwood,
 * rock_arid and palm drawn on top exactly the way PlanetSurface draws them
 * (bottom-centre anchor, drawH = PROP_BASE_HEIGHT * scale [* heightFactor],
 * drawW from the sprite aspect). Rendered at 1x and again at 4x nearest-neighbour
 * so the actual on-screen pixel footprint is judgeable.
 */
async function beachScene() {
  const COLS = 9,
    ROWS = 9,
    ZOOM = 4;
  const W = (COLS + ROWS) * (TW / 2) + TW;
  const H = (COLS + ROWS) * (TH / 2) + 140;
  const ox = ROWS * (TW / 2),
    oy = 90;

  const tiles = [];
  for (let i = 0; i < 4; i++)
    tiles.push(
      await sharp(path.join(ROOT, 'src/assets/tiles/beach', `beach_${i}.webp`))
        .resize(TW, TH, { fit: 'fill' }) // tiles are 512x256, i.e. exactly TW:TH
        .png()
        .toBuffer(),
    );

  // Props: [file, heightFactor]
  const load = async (rel) => {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    const m = await sharp(buf).metadata();
    return { buf, aspect: m.width / m.height };
  };
  const drift = [];
  for (let i = 0; i < SHAPES.length; i++) {
    const p = path.join(DIR_FINAL, `${FAMILY}_${i}.png`);
    if (fs.existsSync(p)) drift.push({ ...(await load(path.relative(ROOT, p))), hf: HEIGHT_FACTOR, tag: `dw${i}` });
  }
  const rocks = [];
  for (let i = 0; i < 6; i++)
    rocks.push({ ...(await load(`src/assets/props/rock_arid/rock_arid_${i}.webp`)), hf: 1, tag: `rk${i}` });
  const palms = [];
  for (let i = 0; i < 6; i++)
    palms.push({ ...(await load(`src/assets/props/palm/palm_${i}.webp`)), hf: 1, tag: `pl${i}` });

  const comp = [];
  const items = [];
  let rnd = 12345;
  const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const sx = ox + (x - y) * (TW / 2);
      const sy = oy + (x + y) * (TH / 2);
      comp.push({ input: tiles[(x * 3 + y * 5) % 4], left: Math.round(sx - TW / 2), top: Math.round(sy) });
      // one prop on roughly every other tile, cycling the three families
      const r = rand();
      if (r < 0.42) {
        const pool = r < 0.2 ? drift : r < 0.33 ? rocks : palms;
        if (!pool.length) continue;
        const p = pool[Math.floor(rand() * pool.length) % pool.length];
        const scale = 0.85 + rand() * 0.3;
        items.push({ p, scale, sx: sx + (rand() - 0.5) * 0.5 * TW, sy: sy + TH / 2 + (rand() - 0.5) * 0.5 * TH, k: x + y });
      }
    }
  }
  items.sort((a, b) => a.k - b.k || a.sy - b.sy);
  for (const it of items) {
    const drawH = Math.max(2, Math.round(PROP_BASE_HEIGHT * it.scale * it.p.hf));
    const drawW = Math.max(2, Math.round(drawH * it.p.aspect));
    comp.push({
      input: await sharp(it.p.buf).resize(drawW, drawH, { fit: 'fill' }).png().toBuffer(),
      left: Math.round(it.sx - drawW / 2),
      top: Math.round(it.sy - drawH),
    });
  }

  const base = await sharp({ create: { width: Math.round(W), height: Math.round(H), channels: 4, background: { r: 12, g: 12, b: 14, alpha: 1 } } })
    .composite(comp)
    .png()
    .toBuffer();
  const out1 = path.join(DIR_REVIEW, `${FAMILY}_on_beach.png`);
  fs.writeFileSync(out1, base);
  const out2 = path.join(DIR_REVIEW, `${FAMILY}_on_beach_${ZOOM}x.png`);
  await sharp(base)
    .resize(Math.round(W * ZOOM), Math.round(H * ZOOM), { kernel: 'nearest' })
    .png()
    .toFile(out2);
  console.log(`[sheet] ${out1}\n[sheet] ${out2}`);
}

/**
 * Game-size strip: each driftwood variant drawn at the renderer's real pixel
 * size, once WITHOUT heightFactor (what it would look like today: a wood block
 * spanning 1.5..2 tiles) and once WITH it, next to a rock_arid for scale.
 * Magnified 6x nearest-neighbour.
 */
async function gameSizeSheet() {
  const Z = 6;
  const rows = [];
  const rock = fs.readFileSync(path.join(ROOT, 'src/assets/props/rock_arid/rock_arid_0.webp'));
  const rockM = await sharp(rock).metadata();

  const entries = [];
  for (let i = 0; i < SHAPES.length; i++) {
    const p = path.join(DIR_FINAL, `${FAMILY}_${i}.png`);
    if (!fs.existsSync(p)) continue;
    const m = await sharp(p).metadata();
    entries.push({ buf: fs.readFileSync(p), aspect: m.width / m.height, label: `${FAMILY}_${i}` });
  }
  if (!entries.length) return;

  const CELLW = 130,
    CELLH = 46;
  const cols = 3; // hf=1.0 | hf=HEIGHT_FACTOR | rock reference
  const comp = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const variants = [
      { hf: 1, aspect: e.aspect, buf: e.buf },
      { hf: HEIGHT_FACTOR, aspect: e.aspect, buf: e.buf },
      { hf: 1, aspect: rockM.width / rockM.height, buf: rock },
    ];
    for (let c = 0; c < cols; c++) {
      const v = variants[c];
      const dh = Math.max(2, Math.round(PROP_BASE_HEIGHT * v.hf));
      const dw = Math.max(2, Math.round(dh * v.aspect));
      comp.push({
        input: await sharp(v.buf).resize(dw, dh, { fit: 'fill' }).png().toBuffer(),
        left: c * CELLW + Math.round((CELLW - dw) / 2),
        top: i * CELLH + (CELLH - 6 - dh),
      });
    }
    // one-tile reference bar (TW = 48) under each row
    comp.push({
      input: await sharp({ create: { width: TW, height: 2, channels: 4, background: { r: 200, g: 90, b: 60, alpha: 1 } } })
        .png()
        .toBuffer(),
      left: CELLW + Math.round((CELLW - TW) / 2),
      top: i * CELLH + CELLH - 4,
    });
  }
  const base = await sharp({
    create: { width: cols * CELLW, height: entries.length * CELLH, channels: 4, background: BEACH_BG },
  })
    .composite(comp)
    .png()
    .toBuffer();
  const out = path.join(DIR_REVIEW, `${FAMILY}_at_gamesize.png`);
  await sharp(base)
    .resize(cols * CELLW * Z, entries.length * CELLH * Z, { kernel: 'nearest' })
    .png()
    .toFile(out);
  console.log(`[sheet] ${out}   (col1 heightFactor 1.0 | col2 heightFactor ${HEIGHT_FACTOR} | col3 rock_arid_0; red bar = one tile, 48px)`);
}

async function sheets() {
  fs.mkdirSync(DIR_REVIEW, { recursive: true });
  await contactSheet();
  await beachScene();
  await gameSizeSheet();
}

// ══════════════════════════════════════
// Integrate
// ══════════════════════════════════════

async function integrate(indices = SHAPES.map((_, i) => i)) {
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
  const indices = idxArgs.length ? idxArgs : SHAPES.map((_, i) => i);

  for (const d of [DIR_RAW, DIR_NOBG, DIR_CROP, DIR_FINAL]) fs.mkdirSync(d, { recursive: true });

  if (cmd === 'sheet') return sheets();
  if (cmd === 'integrate') return integrate(indices);
  if (cmd === 'validate') {
    for (const i of indices) {
      const v = await validate(i);
      console.log(
        v.m
          ? `${v.name.padEnd(14)} ${v.m.w}x${v.m.h} aspect ${v.m.aspect.toFixed(2)} lum ${v.m.meanLum.toFixed(1)} green ${v.m.greenPct.toFixed(2)}% tight=${v.m.tight} ${v.ok ? 'PASS' : 'FAIL: ' + v.problems.join('; ')}`
          : `${v.name.padEnd(14)} MISSING`,
      );
    }
    return;
  }

  if (!FAL_API_KEY) {
    console.error('No fal key (FAL_AI_API_KEY) in scripts/.env');
    process.exit(1);
  }

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
