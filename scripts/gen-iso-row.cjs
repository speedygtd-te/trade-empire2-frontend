/**
 * Generator: ein nahtloses LANGBILD einer Iso-Modulreihe (typunabhaengig).
 *
 * Erzeugt genau EIN Bild, das scripts/cut-iso-row.cjs in Anfang/Mitte/Ende
 * zerschneidet. Der Modultyp kommt ueber die Kommandozeile, nicht ueber
 * Konstanten im Kopf -- der Weg wird fuer jeden weiteren Reihentyp wieder
 * gegangen (Solarpanel war der erste, grosses Lager der zweite).
 *
 *   node scripts/gen-iso-row.cjs --name large_storage --prompt-file p.txt
 *   node scripts/gen-iso-row.cjs --name large_storage --prompt "..." --tag v2 --seed 771203
 *   node scripts/gen-solar-row.cjs            # Shim, Solarpanel-Parameter von damals
 *
 * ── Argumente ─────────────────────────────────────────────────────────────
 *   --name <basename>   Pflicht. Modul-Basisname, z.B. large_storage.
 *   --prompt <text>     Prompt direkt, ODER
 *   --prompt-file <p>   Prompt aus einer Datei (praktisch bei langen Texten).
 *   --negative <text>   Negativ-Prompt (Vorgabe: die generische Liste unten).
 *   --tag <v1>          Versuchskennung im Dateinamen.
 *   --seed <n>          flux-Seed.
 *   --width/--height    Leinwand (Vorgabe 1536x1024 = 5 Zeichenboxen).
 *   --no-bg-remove      Hintergrundentfernung ueberspringen.
 *
 * ── Warum diese Leinwandgröße ────────────────────────────────────────────
 * Zeichenbox eines Moduls  = 48x48 px (HULL_DRAW_W/H).
 * Autorenbox eines Sprites = 512x512 px (Korpus-Nennmaß).
 * Kachelversatz auf dem Schirm entlang -Y = (+24, -12) px
 *   -> in Autorenpixeln    = (+256, -128).
 * Fünf Zellen in einer Reihe belegen damit
 *   512 + 4*256 = 1536 breit,  512 + 4*128 = 1024 hoch.
 * Genau das ist die Leinwand: sie IST die Vereinigung der fünf Zeichenboxen.
 *
 * Die Reihe läuft im Bild von LINKS UNTEN nach RECHTS OBEN (Steigung -1:2,
 * also der Iso-Winkel 26.57°) — das ist die -Y-Richtung des Grids.
 *
 * LESSONS: fal.run ist von hier aus tot, alles über queue.fal.run.
 * Prompt kurz halten (Abschnitt ~1200 Zeichen), Wichtiges nach vorn.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');
sharp.cache(false);

// ── fal-Key aus scripts/.env (nie hardcoden, nie loggen) ──
try {
  const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const FAL_API_KEY = process.env.FAL_API_KEY || process.env.FAL_AI_API_KEY;
if (!FAL_API_KEY) {
  console.error('No fal key in scripts/.env');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const DIR_RAW = path.join(ROOT, 'assets', 'raw');
const DIR_NOBG = path.join(ROOT, 'assets', 'nobg');
const DIR_CROP = path.join(ROOT, 'assets', 'cropped');
for (const d of [DIR_RAW, DIR_NOBG, DIR_CROP]) fs.mkdirSync(d, { recursive: true });

const argOf = (n, d) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};
const has = n => process.argv.includes(n);

const NAME = argOf('--name', null);
if (!NAME) {
  console.error('--name <basename> erforderlich (z.B. --name large_storage)');
  process.exit(1);
}
const TAG = argOf('--tag', 'v1');
const SEED = Number(argOf('--seed', '515101'));
const CANVAS_W = Number(argOf('--width', '1536'));
const CANVAS_H = Number(argOf('--height', '1024'));

const promptFile = argOf('--prompt-file', null);
const PROMPT = promptFile
  ? fs.readFileSync(promptFile, 'utf8').trim().replace(/\s+/g, ' ')
  : argOf('--prompt', null);
if (!PROMPT) {
  console.error('--prompt <text> oder --prompt-file <pfad> erforderlich');
  process.exit(1);
}

// Generische Liste: was in JEDER Reihe stoert, unabhaengig vom Modultyp.
const NEGATIVE = argOf(
  '--negative',
  'cartoon, anime, text, watermark, people, landscape, terrain, grass, sand, ' +
    'separate scattered objects, gaps between units, perspective vanishing point, top-down view',
);

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => {
        data += c;
      });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
function httpsGet(url, headers) {
  const u = new URL(url);
  return httpsRequest({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const dl = u => {
      const mod = u.startsWith('https') ? https : http;
      mod
        .get(u, res => {
          if (res.statusCode === 301 || res.statusCode === 302) return dl(res.headers.location);
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        })
        .on('error', reject);
    };
    dl(url);
  });
}

async function generate(seed) {
  const body = JSON.stringify({
    prompt: PROMPT,
    negative_prompt: NEGATIVE,
    image_size: { width: CANVAS_W, height: CANVAS_H },
    num_inference_steps: 32,
    guidance_scale: 7.0,
    num_images: 1,
    enable_safety_checker: false,
    output_format: 'png',
    seed,
  });
  const submit = JSON.parse(
    await httpsRequest(
      {
        hostname: 'queue.fal.run',
        path: '/fal-ai/flux/dev',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
      },
      body,
    ),
  );
  if (!submit.status_url) throw new Error('submit failed');
  process.stdout.write('    waiting');
  for (let i = 0; i < 150; i++) {
    await sleep(2000);
    const st = JSON.parse(await httpsGet(submit.status_url, { Authorization: `Key ${FAL_API_KEY}` }));
    if (st.status === 'COMPLETED') {
      const res = JSON.parse(await httpsGet(submit.response_url, { Authorization: `Key ${FAL_API_KEY}` }));
      process.stdout.write(' done\n');
      return downloadBuffer(res.images[0].url);
    }
    if (st.status === 'FAILED') throw new Error('generation failed: ' + JSON.stringify(st));
    process.stdout.write('.');
  }
  throw new Error('timeout');
}

async function uploadToFal(buffer, fileName) {
  const init = JSON.parse(
    await httpsRequest(
      {
        hostname: 'rest.alpha.fal.ai',
        path: '/storage/upload/initiate',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
      },
      JSON.stringify({ content_type: 'image/png', file_name: fileName }),
    ),
  );
  const u = new URL(init.upload_url);
  await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'PUT',
        headers: { 'Content-Type': 'image/png', 'Content-Length': buffer.length.toString() },
      },
      res => {
        res.on('data', () => {});
        res.on('end', resolve);
      },
    );
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
  return init.file_url;
}

async function removeBackground(imageUrl) {
  const raw = await httpsRequest(
    {
      hostname: 'queue.fal.run',
      path: '/fal-ai/birefnet/v2',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
    },
    JSON.stringify({ image_url: imageUrl }),
  );
  const submit = JSON.parse(raw);
  if (!submit.status_url) throw new Error('bg submit failed: ' + raw.slice(0, 300));
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    const st = JSON.parse(await httpsGet(submit.status_url, { Authorization: `Key ${FAL_API_KEY}` }));
    if (st.status === 'COMPLETED') {
      const res = JSON.parse(await httpsGet(submit.response_url, { Authorization: `Key ${FAL_API_KEY}` }));
      return downloadBuffer(res.image.url);
    }
    if (st.status === 'FAILED') throw new Error('bg removal failed');
  }
  throw new Error('bg timeout');
}

(async () => {
  const name = `${NAME}_row_${TAG}`;
  console.log(`[gen-iso-row] ${name} seed=${SEED} ${CANVAS_W}x${CANVAS_H}`);
  console.log(`  prompt chars: ${PROMPT.length}`);

  const raw = await generate(SEED);
  fs.writeFileSync(path.join(DIR_RAW, `${name}_raw.png`), raw);
  console.log(`  [raw ] assets/raw/${name}_raw.png`);

  let nobg = raw;
  if (has('--no-bg-remove')) {
    console.log('  [nobg] uebersprungen (--no-bg-remove)');
  } else {
    const url = await uploadToFal(raw, `${name}_raw.png`);
    nobg = await removeBackground(url);
  }
  fs.writeFileSync(path.join(DIR_NOBG, `${name}_nobg.png`), nobg);
  console.log(`  [nobg] assets/nobg/${name}_nobg.png`);

  // Tight Crop — Crop-Regel aus CLAUDE.md: kein transparenter Rand.
  // KEINE Skalierung auf 512x512 hier: das Langbild ist nicht quadratisch,
  // eine quadratische Zielgröße würde es stauchen. Die Ausrichtung auf das
  // Kachelraster macht cut-iso-row.cjs, nachdem es die Periode GEMESSEN hat.
  const cropped = await sharp(nobg).trim({ threshold: 1 }).png().toBuffer();
  fs.writeFileSync(path.join(DIR_CROP, `${name}_cropped.png`), cropped);
  const m = await sharp(cropped).metadata();
  console.log(`  [crop] assets/cropped/${name}_cropped.png  ${m.width}x${m.height} alpha=${m.hasAlpha}`);
})().catch(e => {
  console.error(String(e));
  process.exit(1);
});
