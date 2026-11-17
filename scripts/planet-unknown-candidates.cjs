// ═══════════════════════════════════════════
// Trade Empire — planet_unknown: candidate generation (CLAUDE.md Phase 2b, step 2)
//
// ONE asset: the placeholder shown large and centred on the planet screen where
// a colonised body shows its real 512x512 backend image. Rudi 2026-09-08:
// "ein schwarzer planet der im schatten liegt, im prinzip wie die corona bei
// einer sonnenfinsternis".
//
// WHY THE MOTIF MUST PROMISE NOTHING
// Rudi rejected per-type default images (2026-09-05) because a planet would
// then change appearance on colonisation. A shadowed disc promises no
// appearance at all — so the prompts must not produce a surface, clouds, ice
// caps, continents or a biome-suggesting colour.
//
// PROMPT RULES (LESSONS § 3)
//   · No negative prompts. "no surface visible" reproduces a surface; the
//     positive replacement is "a perfectly black silhouette".
//   · Colour and level come from the grade, not the prompt — so the prompts ask
//     for GEOMETRY (round, centred, ring) and leave brightness to the finisher.
//   · flux reads a frame and pins shapes to it. Here the frame IS the motif
//     (a centred disc in empty space), so a square canvas is correct; the
//     candidates are checked for edge-pinned artefacts instead.
//
// LIGHTING: the corona is annular by definition. CLAUDE.md's upper-left iso
// light rule does not apply — it is an iso-sprite rule, and a planet is seen
// frontally, not isometrically.
//
// fal key from scripts/.env — never hardcode, never log, never commit.
// ═══════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');
sharp.cache(false);

try {
  const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const FAL_API_KEY = process.env.FAL_AI_API_KEY || process.env.FAL_API_KEY;
if (!FAL_API_KEY) throw new Error('no fal key in scripts/.env');

const ROOT = path.join(__dirname, '..');
const DIR_RAW = path.join(ROOT, 'assets', 'raw');
const DIR_SHEET = path.join(ROOT, 'assets', 'style-test', 'tiles');
for (const d of [DIR_RAW, DIR_SHEET]) fs.mkdirSync(d, { recursive: true });

const PROMPT_MAX = 1100;

// ── HTTP (queue API only: fal.run is dead from this machine, LESSONS § 3) ──
function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        if (res.statusCode >= 400) return reject(new Error('fal ' + res.statusCode + ': ' + raw.slice(0, 400)));
        resolve(raw);
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
const httpGet = (url, headers) => {
  const u = new URL(url);
  return request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers });
};
const post = (host, p, body) =>
  request(
    {
      hostname: host,
      path: p,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Key ' + FAL_API_KEY },
    },
    JSON.stringify(body),
  );
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function download(url) {
  return new Promise((resolve, reject) => {
    const go = (u) => {
      (u.startsWith('https') ? https : http)
        .get(u, (res) => {
          if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) return go(res.headers.location);
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

async function genFluxPro(prompt, size, seed) {
  if (prompt.length > PROMPT_MAX) throw new Error('prompt ' + prompt.length + ' > ' + PROMPT_MAX);
  const submit = JSON.parse(
    await post('queue.fal.run', '/fal-ai/flux-pro/v1.1', {
      prompt,
      image_size: { width: size, height: size },
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
    const st = JSON.parse(await httpGet(submit.status_url, { Authorization: 'Key ' + FAL_API_KEY }));
    if (st.status === 'COMPLETED') {
      const r = JSON.parse(await httpGet(submit.response_url, { Authorization: 'Key ' + FAL_API_KEY }));
      process.stdout.write(' ok\n');
      return download(r.images[0].url);
    }
    if (st.status === 'FAILED') throw new Error('failed: ' + JSON.stringify(st).slice(0, 200));
    process.stdout.write('.');
  }
  throw new Error('timeout');
}

// ── PROMPTS ──
// Every one describes only what IS there: a black silhouette, a ring of light,
// empty space. Differences between them are deliberate probes:
//   ECLIPSE  the literal reference Rudi named
//   BACKLIT  the same geometry read as a planet against a hidden star
//   RIMLIGHT the thinnest possible ring, to test whether flux keeps the face black
//   DUST     an uneven ring with streamers, to test structure in the corona
const PROMPTS = {
  ECLIPSE:
    'Total solar eclipse photographed through a long telescope, the disc filling the centre of the square frame. ' +
    'A perfectly black circular silhouette, flat void black across its whole face, edge to edge featureless. ' +
    'Around it a thin ragged ring of pale white corona light, uneven in thickness, with faint wispy streamers ' +
    'radiating a short way outward and dissolving into empty black sky. Perfectly circular, centred, symmetrical. ' +
    'Monochrome astrophotography, extreme contrast, empty black surroundings.',
  BACKLIT:
    'A large planet seen from deep space with its star directly behind it, the planet filling the centre of the ' +
    'square frame. The planet is a perfectly black circular silhouette, uniform void black across its entire face. ' +
    'A narrow ring of white light wraps the whole circumference, brighter in a few places, thinner in others, ' +
    'bleeding a short soft halo outward into empty black space. Perfectly circular, centred. ' +
    'Photographic, extreme contrast, empty black surroundings.',
  RIMLIGHT:
    'A perfectly black circle centred in a square frame of empty black space, its face flat featureless void black. ' +
    'A single hairline ring of cold white light traces its exact circumference, varying slightly in brightness ' +
    'around the ring, with a very faint short glow just outside it. Nothing else in the frame. ' +
    'Minimal high-contrast astrophotography, monochrome.',
  DUST:
    'Total eclipse corona through a telescope: the centre of the square frame is a perfectly black circular ' +
    'silhouette, flat void black over its whole face. Around its edge a bright uneven corona of long thin ' +
    'silver-white streamers fans outward in irregular directions, dense near the rim and thinning to nothing ' +
    'against empty black sky. Perfectly circular, centred, symmetrical silhouette. ' +
    'Monochrome astrophotography, extreme contrast.',
};

const SEEDS = [10101, 20202, 30303];
const SIZE = 1024;

(async () => {
  const tags = Object.keys(PROMPTS);
  const jobs = [];
  for (const tag of tags) for (const seed of SEEDS) jobs.push({ tag, prompt: PROMPTS[tag], seed });

  const made = [];
  for (const j of jobs) {
    const name = 'planet_unknown_' + j.tag + '_s' + j.seed;
    const out = path.join(DIR_RAW, name + '_raw.png');
    if (fs.existsSync(out)) {
      console.log('  ' + name + ': cached');
      made.push({ ...j, name, out });
      continue;
    }
    console.log('  ' + name);
    try {
      const png = await genFluxPro(j.prompt, SIZE, j.seed);
      fs.writeFileSync(out, png);
      made.push({ ...j, name, out });
    } catch (e) {
      console.log('    FAILED: ' + e.message);
    }
  }

  // Montage for visual judgement: rows = prompt, cols = seed, 256 px cells.
  const CELL = 256;
  const layers = [];
  for (const m of made) {
    layers.push({
      input: await sharp(m.out).resize(CELL, CELL, { fit: 'fill' }).png().toBuffer(),
      left: SEEDS.indexOf(m.seed) * CELL,
      top: tags.indexOf(m.tag) * CELL,
    });
  }
  const montage = path.join(DIR_SHEET, '_planet_unknown_candidates.png');
  await sharp({
    create: { width: SEEDS.length * CELL, height: tags.length * CELL, channels: 3, background: '#202020' },
  })
    .composite(layers)
    .png()
    .toFile(montage);
  console.log('\nrows (top->bottom): ' + tags.join(', '));
  console.log('cols (left->right): ' + SEEDS.join(', '));
  console.log('montage: ' + montage);
})();
