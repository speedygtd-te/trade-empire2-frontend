/**
 * FROZEN_LAKE -- STEP 3a: THREE DERIVATIONS FROM THE FROZEN HERO PLATE.
 *
 * Rudi picked R3-GRAIN. This asks the one question the brief poses: does flux
 * hand back USABLE VARIANTS of a motif that has no forms in it?
 *
 * THE TWO ROUTES, BOTH BUILT, BOTH MEASURED (step 3b picks)
 *   FLUX  -- the same frozen 768x512 bombed plate, the same frozen R3-GRAIN
 *            sentence, three NEW seeds. Plate technique unchanged: flux never
 *            sees the diamond, the plate is small enough that the window is a
 *            third of it by area, and the 1248x832 return is resized BACK DOWN
 *            to 768x512 -- never up.
 *   OFFSET -- four 512x256 windows cut at four offsets out of the ONE hero
 *            return. Legitimate for a pure grain: there are no forms to vary,
 *            only grain to re-scatter.
 *
 * Nothing here is written to src/assets/tiles/.
 *
 * Usage: node scripts/tiles-frozen-lake-derive.cjs           (fetch if missing)
 *        FORCE=1 node scripts/tiles-frozen-lake-derive.cjs   (re-fetch)
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
const FAL_API_KEY = process.env.FAL_AI_API_KEY || process.env.FAL_API_KEY;
if (!FAL_API_KEY) { console.error('no fal key in scripts/.env'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const WORK = path.join(ROOT, 'assets', 'style-test', 'tiles', 'frozen_lake');
const HERO = path.join(WORK, 'hero');
const PW = 768, PH = 512;

// the frozen inputs -- neither is ever rewritten by this script
const PLATE_FILE = path.join(HERO, 'HERO_plate_FROZEN.png');
const PROMPT_FILE = path.join(HERO, 'HERO_R3-GRAIN_prompt_FROZEN.txt');

const DERIVE = [
  { tag: 'D1', seed: 314159 },
  { tag: 'D2', seed: 707113 },
  { tag: 'D3', seed: 951413 },
];

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), payload = JSON.stringify(body);
    const req = (u.protocol === 'https:' ? https : http).request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'POST',
      headers: { Authorization: 'Key ' + FAL_API_KEY, 'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      const c = []; res.on('data', (d) => c.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(c).toString();
        if (res.statusCode >= 400) return reject(new Error('fal ' + res.statusCode + ': ' + raw.slice(0, 400)));
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('bad json ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject); req.write(payload); req.end();
  });
}
function getJson(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    (u.protocol === 'https:' ? https : http).get({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: { Authorization: 'Key ' + FAL_API_KEY },
    }, (res) => {
      const c = []; res.on('data', (d) => c.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(c).toString();
        if (res.statusCode >= 400) return reject(new Error('fal ' + res.statusCode + ': ' + raw.slice(0, 300)));
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('bad json ' + raw.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}
/** queue API only -- fal.run's TLS handshake is reset from this machine */
async function runModel(model, body, tries) {
  let last = null;
  for (let k = 0; k < (tries || 4); k++) {
    try {
      const sub = await postJson('https://queue.fal.run/' + model, body);
      const statusUrl = sub.status_url || ('https://queue.fal.run/' + model + '/requests/' + sub.request_id + '/status');
      const respUrl = sub.response_url || ('https://queue.fal.run/' + model + '/requests/' + sub.request_id);
      for (let t = 0; t < 240; t++) {
        await new Promise((r) => setTimeout(r, 2500));
        const st = await getJson(statusUrl);
        if (st.status === 'COMPLETED') return await getJson(respUrl);
        if (st.status === 'ERROR' || st.status === 'FAILED') throw new Error('queue ' + st.status);
      }
      throw new Error('queue timeout');
    } catch (e) {
      last = e;
      console.log('   [retry ' + (k + 1) + '] ' + String(e.message).slice(0, 140));
      await new Promise((r) => setTimeout(r, 4000 * (k + 1)));
    }
  }
  throw last;
}
function download(url) {
  return new Promise((resolve, reject) => {
    const go = (u) => (u.startsWith('https') ? https : http).get(u, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) return go(res.headers.location);
      const c = []; res.on('data', (d) => c.push(d));
      res.on('end', () => resolve(Buffer.concat(c))); res.on('error', reject);
    }).on('error', reject);
    go(url);
  });
}

(async () => {
  const plate = fs.readFileSync(PLATE_FILE);
  const prompt = fs.readFileSync(PROMPT_FILE, 'utf8').trim();
  const pmd = await sharp(plate).metadata();
  console.log('[frozen] plate ' + pmd.width + 'x' + pmd.height + '   md5 ' +
    require('crypto').createHash('md5').update(plate).digest('hex'));
  console.log('[frozen] prompt: ' + prompt.slice(0, 150) + ' ...\n');

  const FORCE = process.env.FORCE === '1';
  for (const D of DERIVE) {
    const out = path.join(HERO, D.tag + '_kraw.png');
    if (fs.existsSync(out) && !FORCE) { console.log('== ' + D.tag + ' == exists, kept'); continue; }
    console.log('== ' + D.tag + ' ==  seed ' + D.seed + '  (hero seed was 88011)');
    const r = await runModel('fal-ai/flux-pro/kontext', {
      image_url: 'data:image/png;base64,' + plate.toString('base64'),
      prompt: prompt, num_images: 1, safety_tolerance: '5', seed: D.seed,
    });
    const url = r.images && r.images[0] && r.images[0].url;
    if (!url) throw new Error('no image url ' + D.tag);
    fs.writeFileSync(out, await download(url));
    const md = await sharp(fs.readFileSync(out)).metadata();
    console.log('   -> ' + D.tag + '_kraw.png  ' + md.width + 'x' + md.height +
      (md.width !== PW || md.height !== PH ? '   (flux upscaled; step 3b resizes BACK DOWN to ' + PW + 'x' + PH + ')' : ''));
  }
  console.log('\ndone -- next: node scripts/tiles-frozen-lake-ladder.cjs');
})();
