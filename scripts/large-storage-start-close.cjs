/**
 * Kandidaten-Generierung: schliesst die offene rechte (obere) Kante von
 * large_storage_start_0.png mit einem Abschluss analog zum Post/Schaltschrank
 * von large_storage_end_0.png. NICHT integriert, NICHT committed -- reine
 * Kandidaten fuer den Kontaktbogen.
 *
 * Verfahren: fal-ai/flux-pro/kontext/max/multi bekommt image 1 (start, zu
 * editieren) + image 2 (end, Stilreferenz fuer Post/Panel) und soll NUR den
 * offenen rechten Bereich schliessen. Da kontext laut LESSONS-asset-pipeline.md
 * §3 "nie additiv" ist und die ganze Leinwand neu zeichnet, wird dem Ergebnis
 * NICHT vertraut: nach BG-Removal wird es gegen das ORIGINAL ausgerichtet
 * (Ganzzahl-Verschiebung, per NCC auf der LINKEN/erhaltenen Zone gefunden) und
 * nur der RECHTE, neue Anteil per Rampen-Blend uebernommen. Die linke Haelfte
 * bleibt so pixel-exakt das Original -- Fusspunkt, Massstab und Periodizitaet
 * zur Mitte bleiben unangetastet.
 *
 *   node scripts/large-storage-start-close.cjs --seeds 8
 */
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
const FAL_API_KEY = process.env.FAL_API_KEY || process.env.FAL_AI_API_KEY;
if (!FAL_API_KEY) {
  console.error('No FAL_API_KEY in scripts/.env');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const DIR_FINAL = path.join(ROOT, 'assets', 'final');
const DIR_RAW = path.join(ROOT, 'assets', 'raw');
const DIR_ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
for (const d of [DIR_RAW, DIR_ST]) fs.mkdirSync(d, { recursive: true });

const argOf = (n, d) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};
const SEEDS = Number(argOf('--seeds', '8'));
const SEED_BASE = Number(argOf('--seed-base', '740001'));

const START = path.join(DIR_FINAL, 'large_storage_start_0.png');
const END = path.join(DIR_FINAL, 'large_storage_end_0.png');

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
const httpsGet = (url, headers) => {
  const u = new URL(url);
  return httpsRequest({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers });
};
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
async function uploadToFal(buffer, fileName) {
  const init = JSON.parse(
    (
      await httpsRequest(
        {
          hostname: 'rest.alpha.fal.ai',
          path: '/storage/upload/initiate',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
        },
        JSON.stringify({ content_type: 'image/png', file_name: fileName }),
      )
    ).body,
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
async function runQueue(endpoint, payload, label) {
  const r = await httpsRequest(
    {
      hostname: 'queue.fal.run',
      path: '/' + endpoint,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
    },
    JSON.stringify(payload),
  );
  let submit;
  try {
    submit = JSON.parse(r.body);
  } catch {
    throw new Error(`${label}: HTTP ${r.status} ${r.body.slice(0, 300)}`);
  }
  if (!submit.status_url) throw new Error(`${label}: HTTP ${r.status} ${r.body.slice(0, 400)}`);
  process.stdout.write(`    ${label} waiting`);
  for (let i = 0; i < 150; i++) {
    await sleep(2000);
    const st = JSON.parse((await httpsGet(submit.status_url, { Authorization: `Key ${FAL_API_KEY}` })).body);
    if (st.status === 'COMPLETED') {
      process.stdout.write(' done\n');
      return JSON.parse((await httpsGet(submit.response_url, { Authorization: `Key ${FAL_API_KEY}` })).body);
    }
    if (st.status === 'FAILED') throw new Error(`${label} failed: ${JSON.stringify(st).slice(0, 300)}`);
    process.stdout.write('.');
  }
  throw new Error(`${label}: timeout`);
}
async function removeBackground(imageUrl) {
  const res = await runQueue('fal-ai/birefnet/v2', { image_url: imageUrl }, 'birefnet');
  return downloadBuffer(res.image.url);
}
async function flattenForEdit(file) {
  return sharp(file).flatten({ background: { r: 128, g: 130, b: 134 } }).png().toBuffer();
}

const PROMPT = [
  'Image 1 shows an isometric sci-fi high-bay warehouse module: a yellow overhead crane rail on',
  'posts, blue steel shelf racks with wooden crates, and a light blue-grey floor deck. It is CUT',
  'OFF on its right side -- the crane rail, the top shelf and the deck simply fade into empty',
  'space there, unfinished. Image 2 shows the SAME warehouse family finished at its other end with',
  'a vertical yellow support column carrying the crane rail and a small dark control box with a',
  'red button at its base, and the deck rounding off to a finished corner.',
  'Close the open right side of image 1 with a matching finished end, built the same way as the',
  'end in image 2: a vertical yellow support column holding up the crane rail, the deck plate',
  'rounding off to a finished square corner. Keep the LEFT two thirds of image 1 -- its existing',
  'shelf racks, crates, crane beam and floor -- exactly as they are, same position, same scale,',
  'same lighting, do not redraw them. Only add the missing structure in the empty right area.',
  'Same isometric 2.5D perspective, 2:1 isometric, lit from upper left, weathered navy-blue steel',
  'and yellow safety paint, photorealistic game-asset textures, no background, no ground shadow,',
  'nothing cropped at the frame edges, not rotated, not tilted.',
].join(' ');

async function generateOne(seed) {
  const startUrl = await uploadToFal(await flattenForEdit(START), 'large_storage_start_in.png');
  const endUrl = await uploadToFal(await flattenForEdit(END), 'large_storage_end_ref.png');
  const res = await runQueue(
    'fal-ai/flux-pro/kontext/max/multi',
    {
      prompt: PROMPT,
      image_urls: [startUrl, endUrl],
      seed,
      guidance_scale: 3.5,
      num_images: 1,
      safety_tolerance: '5',
      output_format: 'png',
      aspect_ratio: '1:1',
    },
    `kontext seed=${seed}`,
  );
  const url = res?.images?.[0]?.url;
  if (!url) throw new Error(`no image: ${JSON.stringify(res).slice(0, 300)}`);
  const raw = await downloadBuffer(url);
  fs.writeFileSync(path.join(DIR_RAW, `large_storage_start_close_s${seed}_raw.png`), raw);

  const genUrl = await uploadToFal(raw, `s${seed}_gen.png`);
  const nobg = await removeBackground(genUrl);
  fs.writeFileSync(path.join(DIR_RAW, `large_storage_start_close_s${seed}_nobg.png`), nobg);
  return nobg;
}

// ── Registrierung + Rampen-Blend gegen das Original ─────────────────────────
async function loadRGBA(fileOrBuf) {
  const { data, info } = await sharp(fileOrBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { d: data, W: info.width, H: info.height };
}
function alphaNccShift(A, B, W, H, dx, dy) {
  let inter = 0,
    uni = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const x2 = x + dx,
        y2 = y + dy;
      const a = A[y * W + x] > 0.5;
      let b = false;
      if (x2 >= 0 && y2 >= 0 && x2 < W && y2 < H) b = B[y2 * W + x2] > 0.5;
      if (a && b) inter++;
      if (a || b) uni++;
    }
  }
  return uni > 0 ? inter / uni : 0;
}
const smooth = t => t * t * (3 - 2 * t);

async function alignAndBlend(origPath, candBuf, seamX) {
  const orig = await loadRGBA(origPath);
  const { W, H } = orig;
  // Kandidat auf dieselbe Leinwandgroesse bringen (aspect_ratio 1:1 angefragt).
  const candResized = await sharp(candBuf).resize(W, H, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cand = { d: candResized.data, W, H };

  const oA = new Float32Array(W * H);
  const cA = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    oA[i] = orig.d[i * 4 + 3] / 255;
    cA[i] = cand.d[i * 4 + 3] / 255;
  }
  // Nur die LINKE (erhaltene) Zone fuer die Registrierung nutzen.
  const zoneMaskO = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W && x < seamX; x++) zoneMaskO[y * W + x] = oA[y * W + x];

  let best = { v: -1, dx: 0, dy: 0 };
  for (let dx = -40; dx <= 40; dx += 2) {
    for (let dy = -40; dy <= 40; dy += 2) {
      const v = alphaNccShift(zoneMaskO, cA, W, H, dx, dy);
      if (v > best.v) best = { v, dx, dy };
    }
  }
  // Verfeinern.
  for (let dx = best.dx - 2; dx <= best.dx + 2; dx++) {
    for (let dy = best.dy - 2; dy <= best.dy + 2; dy++) {
      const v = alphaNccShift(zoneMaskO, cA, W, H, dx, dy);
      if (v > best.v) best = { v, dx, dy };
    }
  }

  const out = Buffer.alloc(W * H * 4);
  const RAMP = 48;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const w = smooth(Math.max(0, Math.min(1, (x - (seamX - RAMP / 2)) / RAMP)));
      const cx = x - best.dx,
        cy = y - best.dy;
      const hasC = cx >= 0 && cy >= 0 && cx < W && cy < H;
      const co = hasC ? (cy * W + cx) * 4 : -1;
      const ao = orig.d[o + 3] / 255;
      const ac = hasC ? cand.d[co + 3] / 255 : 0;
      const a = (1 - w) * ao + w * ac;
      out[o + 3] = Math.round(Math.max(0, Math.min(255, a * 255)));
      if (a > 0.002) {
        for (let c = 0; c < 3; c++) {
          const pm = (1 - w) * orig.d[o + c] * ao + w * (hasC ? cand.d[co + c] : 0) * ac;
          out[o + c] = Math.round(Math.max(0, Math.min(255, pm / a)));
        }
      }
    }
  }
  return { buf: await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer(), reg: best };
}

(async () => {
  console.log(`[large-storage-start-close] ${SEEDS} seeds ab ${SEED_BASE}`);
  const results = [];
  for (let i = 0; i < SEEDS; i++) {
    const seed = SEED_BASE + i * 37;
    console.log(`\n== seed ${seed} (${i + 1}/${SEEDS}) ==`);
    try {
      const nobg = await generateOne(seed);
      const { buf, reg } = await alignAndBlend(START, nobg, 300);
      const outPath = path.join(DIR_ST, `large_storage_start_closed_s${seed}.png`);
      fs.writeFileSync(outPath, buf);
      console.log(`  [align ] Verschiebung (${reg.dx},${reg.dy}) ncc=${reg.v.toFixed(3)}`);
      console.log(`  [save  ] ${path.relative(ROOT, outPath)}`);
      results.push({ seed, path: outPath, reg });
    } catch (e) {
      console.error(`  FEHLER seed ${seed}: ${String(e)}`);
      results.push({ seed, error: String(e) });
    }
  }
  fs.writeFileSync(
    path.join(DIR_ST, 'large_storage_start_closed_results.json'),
    JSON.stringify(results.map(r => ({ ...r, path: r.path ? path.relative(ROOT, r.path) : undefined })), null, 2),
  );
  console.log('\nfertig.');
})().catch(e => {
  console.error(String(e));
  process.exit(1);
});
