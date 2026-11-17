/**
 * HERO STYLE-TEST: tundra (EARTH_LIKE family) — cold recolour derived from a plains base.
 *
 * Produces 4 single-tile HERO candidates at graded coldness/darkness (mild / medium /
 * dark / snow) so Rudi can pick ONE hero. This is a HERO test ONLY — one representative
 * tile per candidate. NOT the 4-slot build, NOT an integration into src/. Writes only
 * to assets/style-test/tiles/ + an HTML.
 *
 * EARTH_LIKE rule: tundra is ALWAYS derived FROM a plains asset. The chosen base is the
 * finished plains tile Rudi picked:
 *     assets/style-test/tiles/plains_dirty_mix2_s0.png
 *   (512x256 diamond-masked — dark dirty soil with sparse dry grass tufts + gravel;
 *    sibling of the swamp base). ALL candidates derive from this SAME base.
 *
 * Concept: a cold TUNDRA ground tile — dark frozen dirty soil, patches of thin frost /
 * light snow, pale dead / frost-bleached dry grass, hardy grey-green lichen / moss,
 * gravel. Muted, heavily desaturated, COLD palette (cold greys, pale frost, desaturated
 * brown), matte, dark — clearly COLDER than plains. GROUND ONLY — no shrubs/bushes
 * (those come later as a separate prop layer).
 *
 * CRITICAL LESSON (from mountain): PRESERVE THE BASE CHARACTER. The prompt RECOLOURS
 * rather than regenerates — it explicitly keeps the existing dry grass tufts, gravel and
 * soil layout and just makes them cold/frozen/dead. Do NOT erase the grass or gravel.
 *
 * CRITICAL LESSON (from toxic_marsh): do NOT use divide-by-blur 2D equalization on masked
 * tiles — it creates a bright gold rim at the diamond edges. It is kept OFF here: just
 * kontext + uniform darkness multiply + re-mask, so edges fall off clean. An edge-band
 * check verifies it.
 *
 * PROMPT RULE (asset conventions): NO negative prompts (they reproduce the unwanted
 * thing). All instructions are POSITIVE replacements ("recolour to a cold frozen tundra",
 * "keep the dry grass tufts and gravel, just make them frozen and dead").
 *
 * Method: kontext recolour -> uniform darkness multiply (pure .modulate) -> re-diamond-mask.
 *
 * Outputs (style-test workspace ONLY):
 *   assets/style-test/tiles/tundra_{mild,medium,dark,snow}.png   512x256
 *   assets/style-test/tiles/tundra_{...}_half.png                256x128
 *   assets/style-test/tiles/tundra_{...}_mosaic.png              3x3 iso
 *   assets/style-test/tiles/tundra-style-test.html               side-by-side
 *
 * fal key in scripts/.env (FAL_AI_API_KEY / FAL_API_KEY) — never hardcode / commit.
 *
 * Usage:
 *   node scripts/tundra-hero-style-test.cjs                 full run
 *   node scripts/tundra-hero-style-test.cjs mild dark       re-roll only these (seed +1000)
 *   node scripts/tundra-hero-style-test.cjs --html-only     rebuild HTML from existing PNGs
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
const https = require('https');
const http = require('http');
const sharp = require('sharp');

const TILE_W = 512, TILE_H = 256;
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'style-test', 'tiles');
const BG = { r: 0x14, g: 0x17, b: 0x1c };

// Single shared base for ALL candidates (EARTH_LIKE = derive from a plains asset).
const BASE_FILE = path.join(OUT, 'plains_dirty_mix2_s0.png');

// Shared look language (POSITIVE only — no negatives). COLD frozen tundra palette — the
// key ask is to move OFF the warm dirty-brown plains onto cold desaturated frozen tones.
const MUTED = 'muted heavily desaturated cold palette of cold grey, pale frost-white and desaturated frozen brown, matte non-reflective surface, dim somber lighting from the upper left, dark cold frozen tundra look, clearly colder than temperate plains, The Expanse sci-fi aesthetic';

// Core recolour instruction reused by every candidate (POSITIVE only). RECOLOURS the
// plains base to a cold frozen tundra while explicitly KEEPING the grass/gravel/soil.
const RECOLOUR = 'keep the existing dry grass tufts, gravel and soil layout exactly where they are; recolour the whole tile to a cold frozen tundra: turn the soil into frozen dark cold-grey dirt, turn the dry grass tufts into pale frost-bleached dead frozen grass, add hardy grey-green lichen and moss between them, and dust thin frost and light snow over the ground; do not remove the grass or gravel, just make it cold, frozen and dead';

// Candidates. Graded coldness/frost (prompt) + graded darkness (uniform multiply).
const CANDS = [
  {
    tag: 'mild', dark: 0.90, seed: 471001,
    label: 'MILD (frozen soil)',
    desc: 'plains base recoloured to a cold tundra: mostly frozen dark cold-grey soil with pale frost-bleached dead grass tufts and gravel, only a light dusting of frost, a little grey-green lichen — mild darken',
    prompt:
      `${RECOLOUR}, keep most of the tile as frozen dark cold-grey dirt and gravel with pale frost-bleached dead dry grass tufts scattered across it and a little hardy grey-green lichen, only a light dusting of thin frost, ${MUTED}`,
  },
  {
    tag: 'medium', dark: 0.80, seed: 472002,
    label: 'MEDIUM (frost + lichen)',
    desc: 'plains base recoloured to a cold tundra: frozen soil with more thin frost and patchy thin snow between the pale dead grass tufts, hardy grey-green lichen and moss on the gravel — medium darken',
    prompt:
      `${RECOLOUR}, balance the tile between frozen dark cold-grey soil and patches of thin frost and light patchy snow settling between the pale frost-bleached dead grass tufts, spread more hardy grey-green lichen and moss over the gravel and frozen dirt, ${MUTED}`,
  },
  {
    tag: 'dark', dark: 0.66, seed: 473003,
    label: 'DARK (deep-frozen)',
    desc: 'plains base recoloured to a deep-frozen tundra: darker cold-grey frozen ground, brittle pale dead grass, grey-green lichen, thin frost in the hollows — heavy dark darken',
    prompt:
      `${RECOLOUR}, make it a deep-frozen dark tundra: darker cold-grey frozen hard-packed dirt and gravel with brittle pale frost-bleached dead grass tufts, hardy dull grey-green lichen and moss clinging to the frozen ground, thin frost gathered in the shaded hollows, darker grimier frozen soil, ${MUTED}`,
  },
  {
    tag: 'snow', dark: 0.82, seed: 474004,
    label: 'SNOW (patchy snow cover)',
    desc: 'plains base recoloured to a snow-dusted tundra: patchy thin snow and frost covering much of the frozen soil, pale dead grass and grey-green lichen poking through the snow, gravel showing in wind-scoured patches — clearly the coldest, snowy look',
    prompt:
      `${RECOLOUR}, cover much of the tile with patchy thin snow and hard frost over the frozen cold-grey soil, let the pale frost-bleached dead grass tufts and hardy grey-green lichen poke up through the snow, leave wind-scoured patches where frozen gravel and dark dirt show through, ${MUTED}`,
  },
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
async function stats(maskedBuf) {
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
const fmtC = (c) => `R${c.r.toFixed(0)} G${c.g.toFixed(0)} B${c.b.toFixed(0)} luma${c.luma.toFixed(1)}`;

// Edge-band luma check: confirms NO bright gold rim at the diamond edges (the toxic_marsh
// lesson). Samples pixels within `band` px of the diamond outline and compares their mean
// luma to the interior mean. A clean tile has edge<=interior.
async function edgeCheck(maskedBuf, band = 10) {
  const { data, info } = await sharp(maskedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const cx = width / 2, cy = height / 2;
  let eL = 0, eN = 0, iL = 0, iN = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    if (data[i + 3] < 8) continue;
    const d = Math.abs(x - cx) / cx + Math.abs(y - cy) / cy; // 0 center .. 1 edge
    const L = luma(data[i], data[i + 1], data[i + 2]);
    const edgeFrac = 1 - band / Math.min(cx, cy);
    if (d >= edgeFrac) { eL += L; eN++; } else { iL += L; iN++; }
  }
  const edge = eN ? eL / eN : 0, interior = iN ? iL / iN : 0;
  return { edge, interior, delta: edge - interior };
}

// kontext result -> 512x256 fill -> UNIFORM darken (pure multiply, no gradient) -> diamond mask.
async function postProcess(rawBuf, cand) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha().png().toBuffer();
  const darkened = await sharp(resized).modulate({ brightness: cand.dark }).png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(darkened).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `tundra_${cand.tag}.png`), masked);
  await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toFile(path.join(OUT, `tundra_${cand.tag}_half.png`));
  return masked;
}

async function kontext(baseBuf, cand) {
  // Flatten onto opaque bg so transparent diamond corners don't bleed into the edit.
  const flat = await sharp(baseBuf).flatten({ background: BG }).png().toBuffer();
  const dataUri = `data:image/png;base64,${flat.toString('base64')}`;
  console.log(`[kontext] ${cand.tag} base=plains_dirty_mix2_s0 seed=${cand.seed} dark=${cand.dark}`);
  const r = await fetchJson('https://fal.run/fal-ai/flux-pro/kontext', {
    image_url: dataUri,
    prompt: cand.prompt,
    num_images: 1,
    safety_tolerance: '5',
    seed: cand.seed,
  });
  const url = r.images && r.images[0] && r.images[0].url;
  if (!url) throw new Error('no kontext url for ' + cand.tag + ': ' + JSON.stringify(r).slice(0, 200));
  return download(url);
}

// interlocking iso 3x3 mosaic (acid-lake technique).
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
  const out = await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: { ...BG, alpha: 1 } } })
    .composite(comp).png().toBuffer();
  fs.writeFileSync(outPath, out);
}

function writeHtml() {
  const cardsJs = CANDS.map(c => `    { tag: '${c.tag}', label: ${JSON.stringify(c.label)}, dark: ${c.dark},
      desc: ${JSON.stringify(c.desc)} }`).join(',\n');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>tundra — Hero Style-Test (cold recolour from plains, EARTH_LIKE)</title>
<style>
  :root { --w: 256; --h: 128; }
  body { margin: 0; background: #030712; color: #d6dae0; font-family: system-ui, sans-serif; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.note { margin: 0 0 24px; color: #8893a0; font-size: 13px; max-width: 880px; line-height: 1.5; }
  button { background: #3a5566; color: #eaf3f7; border: 1px solid #5c8199;
    border-radius: 6px; padding: 8px 16px; font-size: 14px; cursor: pointer; margin-bottom: 20px; }
  button:hover { background: #486678; }
  .grid { display: flex; flex-wrap: wrap; gap: 32px; align-items: flex-start; }
  .card { background: #0b0f16; border: 1px solid #1a2230; border-radius: 8px; padding: 14px 14px 18px; }
  .card h2 { font-size: 15px; margin: 0 0 2px; color: #cfe0e6; }
  .card .file { font-size: 12px; color: #7f8b98; font-family: ui-monospace, monospace; margin-bottom: 2px; }
  .card .meta { font-size: 12px; color: #89a; margin-bottom: 6px; }
  .card .cap { font-size: 12px; color: #9fb0c3; margin-bottom: 10px; max-width: 300px; }
  .single { margin-bottom: 12px; }
  .single img { width: calc(var(--w) * 1px); height: calc(var(--h) * 1px); display: block; }
  .mosaic { position: relative; }
  .mosaic img { position: absolute; width: calc(var(--w) * 1px); height: calc(var(--h) * 1px); image-rendering: auto; }
  .baserow { display: flex; gap: 16px; align-items: center; margin: 0 0 20px; }
  .baserow img { width: 192px; height: 96px; display: block; border: 1px solid #1a2230; border-radius: 4px; }
  .baserow div { font-size: 12px; color: #8893a0; }
</style>
</head>
<body>
<h1>tundra — Hero Style-Test</h1>
<p class="note">
  ${CANDS.length} single-tile HERO candidates for the <b>tundra</b> tile (EARTH_LIKE family). Tundra is
  ALWAYS derived FROM a plains asset — every candidate is a <code>flux-pro/kontext</code> COLD recolour of
  the SAME finished plains base (<b>plains_dirty_mix2_s0</b>), which RECOLOURS rather than regenerates: it
  keeps the existing dry grass tufts, gravel and soil layout and just makes them frozen/dead/cold (frozen
  dark soil, pale frost-bleached dead grass, hardy grey-green lichen, thin frost/snow). Then a uniform
  brightness multiply for its darkness grade, then diamond-masked. No divide-by-blur equalization (that
  caused the gold edge rim on toxic_marsh) — edges fall off clean. GROUND ONLY — shrubs/bushes come later as
  a separate prop layer. Top = the raw single tile; below = a small interlocking-iso mosaic (repeats the SAME
  tile). This is a HERO test only; pick ONE, then the 4-slot build (+ shrubs prop layer) is a separate step.
  Deterministic seed.
</p>
<div class="baserow">
  <img src="plains_dirty_mix2_s0_half.png" alt="plains base">
  <div>Base: <code>plains_dirty_mix2_s0.png</code><br>dark dirty soil + sparse dry grass tufts + gravel<br>(all candidates derive from this)</div>
</div>
<button id="reshuffle">Reshuffle mosaics</button>
<div class="grid" id="cards"></div>
<script>
  const W = 256, H = 128, COLS = 4, ROWS = 6;
  const CANDS = [
${cardsJs}
  ];
  const half = (tag) => 'tundra_' + tag + '_half.png';
  function mulberry32(seed){return function(){seed|=0;seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
  function makeMosaic(el, src){return function(seed){el.innerHTML='';const rand=mulberry32(seed);let mr=0,mb=0;const ps=[];for(let r=0;r<ROWS;r++){const odd=r%2===1;for(let c=0;c<COLS;c++){const x=c*W+(odd?W/2:0);const y=r*(H/2);ps.push([x,y]);if(x+W>mr)mr=x+W;if(y+H>mb)mb=y+H;}}el.style.width=mr+'px';el.style.height=mb+'px';for(const[x,y]of ps){const img=document.createElement('img');img.src=src;img.style.left=x+'px';img.style.top=y+'px';el.appendChild(img);}};}
  const cards=document.getElementById('cards');const builders=[];
  CANDS.forEach((cand,i)=>{
    const card=document.createElement('div');card.className='card';
    card.innerHTML='<h2>'+cand.label+'</h2>'+
      '<div class="file">tundra_'+cand.tag+'.png</div>'+
      '<div class="meta">darken x'+cand.dark+' · base plains_dirty_mix2_s0</div>'+
      '<div class="cap">'+cand.desc+'</div>'+
      '<div class="single"><img src="'+half(cand.tag)+'" alt="'+cand.tag+'"></div>';
    const mos=document.createElement('div');mos.className='mosaic';card.appendChild(mos);
    cards.appendChild(card);
    const build=makeMosaic(mos, half(cand.tag));build((0x1000+i*2654435761)>>>0);builders.push(build);
  });
  document.getElementById('reshuffle').addEventListener('click',()=>{builders.forEach(b=>b((Math.random()*0xffffffff)>>>0));});
</script>
</body>
</html>
`;
  fs.writeFileSync(path.join(OUT, 'tundra-style-test.html'), html);
  console.log('[html] tundra-style-test.html');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const args = process.argv.slice(2);
  if (args.includes('--html-only')) { writeHtml(); return; }
  if (!FAL_API_KEY) { console.error('No fal key (FAL_AI_API_KEY in scripts/.env)'); process.exit(1); }
  const reroll = args.filter(a => !a.startsWith('--'));

  const baseBuf = fs.readFileSync(BASE_FILE);
  for (const cand of CANDS) {
    if (reroll.length && !reroll.includes(cand.tag)) continue;
    const seed = reroll.includes(cand.tag) ? cand.seed + 1000 : cand.seed;
    try {
      const raw = await kontext(baseBuf, { ...cand, seed });
      const masked = await postProcess(raw, cand);
      await mosaic(masked, path.join(OUT, `tundra_${cand.tag}_mosaic.png`));
      const s = await stats(masked);
      const e = await edgeCheck(masked);
      const rim = e.delta > 6 ? ' ⚠ EDGE-RIM' : ' edges-clean';
      console.log(`  [done] tundra_${cand.tag}  ${fmtC(s)}  edge${e.edge.toFixed(1)} interior${e.interior.toFixed(1)} Δ${e.delta.toFixed(1)}${rim}`);
    } catch (e) { console.error(`ERR ${cand.tag}: ${e.message}`); }
  }
  writeHtml();
  console.log('all done');
})();
