/**
 * HERO STYLE-TEST: ocean (deep water) — dark/dirty/desaturated redesign.
 *
 * Produces 4 single-tile HERO candidates at graded darkness (mild / medium / dark /
 * dark_foam) so Rudi can pick ONE hero. This is a HERO test ONLY — one representative
 * tile per candidate. NOT the 4-slot build, NOT an integration into src/. Writes only
 * to assets/style-test/tiles/ + an HTML.
 *
 * Concept: an open DEEP OCEAN water surface — desaturated dark blue-grey / teal water,
 * subtle wave ripples and faint foam streaks / whitecaps, matte, murky, DARKER than the
 * bright Batch-1 originals. Reads as open deep water (NOT shallow / reef / tropical).
 *
 * RECYCLING (preferred over from-scratch, cheaper + consistent):
 *   ocean is NOT plains-derived (it is water). Bases are the FINISHED Batch-1 ocean
 *   tiles on disk (512x256 diamond-masked webp) — they already have the exact open-water
 *   STRUCTURE we want (even wave ripples + foam veins, no strong feature at edges), we
 *   only DESATURATE + darken the bright tropical blue toward a murky dark blue-grey/teal
 *   deep ocean via kontext:
 *     src/assets/tiles/ocean/ocean_2.webp  (calmest subtle ripples)   -> mild
 *     src/assets/tiles/ocean/ocean_0.webp  (even ripples, balanced)   -> medium
 *     src/assets/tiles/ocean/ocean_3.webp  (deep dark, subtle foam)   -> dark
 *     src/assets/tiles/ocean/ocean_1.webp  (foam-vein / whitecaps)    -> dark_foam
 *   Each candidate is a fal-ai/flux-pro/kontext instruction edit of one base (same
 *   endpoint the toxic_marsh / swamp / mountain reworks used), then a UNIFORM brightness
 *   multiply (pure .modulate, no gradient) for its darkness grade, then re-diamond-mask.
 *
 * CRITICAL LESSON (from toxic_marsh): do NOT use divide-by-blur 2D equalization on
 * masked tiles — it creates a bright gold rim at the diamond edges (dark pre-mask
 * corners contaminate the edge blur). It is kept OFF here: just kontext + uniform
 * darkness multiply + re-mask, so edges fall off clean. An edge-band check verifies it.
 *
 * SEAMLESS TILING is critical for water (uniform surface): the recolour prompt keeps the
 * even open-water coverage and asks for no strong feature at the edges. The 3x3 iso mosaic
 * lets you eyeball the repeat for seams.
 *
 * PROMPT RULE (asset conventions): NO negative prompts (they reproduce the unwanted
 * thing). All instructions are POSITIVE replacements ("desaturate to a dark murky
 * blue-grey deep ocean", "faint foam streaks").
 *
 * Outputs (style-test workspace ONLY):
 *   assets/style-test/tiles/ocean_{mild,medium,dark,dark_foam}.png   512x256
 *   assets/style-test/tiles/ocean_{...}_half.png                     256x128
 *   assets/style-test/tiles/ocean_{...}_mosaic.png                   3x3 iso
 *   assets/style-test/tiles/ocean-style-test.html                    side-by-side
 *
 * fal key in scripts/.env (FAL_AI_API_KEY / FAL_API_KEY) — never hardcode / commit.
 *
 * Usage:
 *   node scripts/ocean-hero-style-test.cjs                 full run
 *   node scripts/ocean-hero-style-test.cjs mild dark       re-roll only these (seed +1000)
 *   node scripts/ocean-hero-style-test.cjs --html-only     rebuild HTML from existing PNGs
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
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const OUT = path.join(ROOT, 'assets', 'style-test', 'tiles');
const BG = { r: 0x14, g: 0x17, b: 0x1c };

const base = (biome, n) => path.join(TILES, biome, `${biome}_${n}.webp`);

// Shared look language (POSITIVE only — no negatives). DESATURATED dark deep-ocean water
// palette — the key ask is to move OFF the bright saturated tropical blue onto a murky,
// matte, dark blue-grey / teal deep water.
const MUTED = 'muted heavily desaturated dark blue-grey and murky teal deep-ocean water tones, matte non-reflective water surface with no bright glare, dim somber overcast lighting from the upper left, cold deep open-ocean look, The Expanse sci-fi aesthetic';

// Core desaturate/darken instruction reused by every candidate (POSITIVE only). Moves the
// bright tropical blue of the base to a murky dark deep ocean while keeping the water layout.
const RECOLOUR = 'turn this into a dark murky deep open-ocean water surface: desaturate the bright blue water into a dark cold blue-grey and murky teal, keep the gentle wave ripples and the even open-water coverage across the whole tile, deepen the water so it reads as deep open ocean, make the surface matte with no bright sun glare, keep the ripple pattern even and uniform toward every edge so it tiles seamlessly';

// Tileability instruction (POSITIVE only — no negatives). Kept available for re-rolls.
const TILEABLE = 'seamless tileable water texture that repeats without visible seams; keep the ripple pattern even and uniform toward all edges so neighbouring tiles blend smoothly; all four edges similar in tone and detail; avoid any large distinct wave or foam feature touching the border; small evenly-distributed ripple detail only';

// Candidates. Graded darkness (uniform multiply) + graded ripple/foam (prompt + base).
const CANDS = [
  {
    tag: 'mild', dark: 0.90, seed: 471001,
    baseBiome: 'ocean', baseN: 2,
    label: 'MILD (calmer water)',
    desc: 'ocean_2: calmest subtle ripples — desaturated to a slightly lighter murky dark blue-grey deep water with gentle even ripples, only mild darken',
    prompt:
      `${RECOLOUR}, keep the water calmer with only gentle low ripples and a few very faint foam streaks, a slightly lighter but still murky dark blue-grey deep water, ${MUTED}`,
  },
  {
    tag: 'medium', dark: 0.80, seed: 472002,
    baseBiome: 'ocean', baseN: 0,
    label: 'MEDIUM (deeper ripple)',
    desc: 'ocean_0: even balanced ripples — desaturated to a deeper murky dark blue-grey/teal deep water with more wave ripple and faint foam streaks, medium darken',
    prompt:
      `${RECOLOUR}, give it deeper more pronounced wave ripples across the whole surface with faint scattered foam streaks and thin whitecaps, a deeper murky dark blue-grey teal deep water, ${MUTED}`,
  },
  {
    tag: 'dark', dark: 0.66, seed: 473003,
    baseBiome: 'ocean', baseN: 3,
    label: 'DARK (very deep)',
    desc: 'ocean_3: deep dark water — desaturated to a very deep dark murky blue-grey/teal open ocean, subtle ripples, sparse faint foam, heavy dark darken',
    prompt:
      `${RECOLOUR}, make it a very deep dark murky ocean: nearly black-blue deep water with low subtle ripples and only sparse very faint foam streaks, cold and heavy and dark, deep open ocean at dusk, ${MUTED}`,
  },
  {
    tag: 'dark_foam', dark: 0.70, seed: 474004,
    baseBiome: 'ocean', baseN: 1,
    label: 'DARK (foam streaks)',
    desc: 'ocean_1: whitecap/foam-vein base — desaturated to a dark murky blue-grey deep water with more pronounced but muted foam streaks and whitecaps woven across the ripples, dark',
    prompt:
      `${RECOLOUR}, weave more pronounced but muted grey-white foam streaks and thin whitecaps evenly across the choppy ripples of the whole surface, dark murky blue-grey teal deep water beneath the foam, keep the foam evenly distributed so it tiles, ${MUTED}`,
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

// Edge-band luma check: confirms NO bright gold rim at the diamond edges (the
// toxic_marsh lesson). Samples pixels within `band` px of the diamond outline and
// compares their mean luma to the interior mean. A clean tile has edge<=interior.
async function edgeCheck(maskedBuf, band = 10) {
  const { data, info } = await sharp(maskedBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const cx = width / 2, cy = height / 2;
  // Diamond: |x-cx|/cx + |y-cy|/cy <= 1 (inside). Distance to edge ~ (1 - that).
  let eL = 0, eN = 0, iL = 0, iN = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    if (data[i + 3] < 8) continue;
    const d = Math.abs(x - cx) / cx + Math.abs(y - cy) / cy; // 0 center .. 1 edge
    const L = luma(data[i], data[i + 1], data[i + 2]);
    // band px near the edge, expressed in normalized diamond units (approx)
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
  fs.writeFileSync(path.join(OUT, `ocean_${cand.tag}.png`), masked);
  await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toFile(path.join(OUT, `ocean_${cand.tag}_half.png`));
  return masked;
}

async function kontext(baseBuf, cand) {
  // Flatten onto opaque bg so transparent diamond corners don't bleed into the edit.
  const flat = await sharp(baseBuf).flatten({ background: BG }).png().toBuffer();
  const dataUri = `data:image/png;base64,${flat.toString('base64')}`;
  console.log(`[kontext] ${cand.tag} base=${cand.baseBiome}_${cand.baseN} seed=${cand.seed} dark=${cand.dark}`);
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
      base: '${c.baseBiome}_${c.baseN}', desc: ${JSON.stringify(c.desc)} }`).join(',\n');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ocean — Hero Style-Test (graded darkness, deep-water redesign)</title>
<style>
  :root { --w: 256; --h: 128; }
  body { margin: 0; background: #030712; color: #d6dae0; font-family: system-ui, sans-serif; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.note { margin: 0 0 24px; color: #8893a0; font-size: 13px; max-width: 860px; line-height: 1.5; }
  button { background: #1f4f6f; color: #eaf5ff; border: 1px solid #2f7dae;
    border-radius: 6px; padding: 8px 16px; font-size: 14px; cursor: pointer; margin-bottom: 20px; }
  button:hover { background: #2a6a8a; }
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
</style>
</head>
<body>
<h1>ocean — Hero Style-Test</h1>
<p class="note">
  ${CANDS.length} single-tile HERO candidates for the <b>ocean</b> tile (deep water) in the
  dark/dirty/desaturated redesign, at graded darkness. Each is a <code>flux-pro/kontext</code> desaturate
  edit of a finished recycled Batch-1 <b>ocean</b> base (same even open-water ripple STRUCTURE, but the
  bright tropical blue is desaturated + deepened to a murky dark blue-grey / teal deep ocean), then a uniform
  brightness multiply for its darkness grade, then diamond-masked. No divide-by-blur equalization (that caused
  the gold edge rim on toxic_marsh) — edges fall off clean. Top = the raw single tile; below = a small
  interlocking-iso mosaic (repeats the SAME tile, so you see pure tiling repetition — SEAMLESSNESS is key for
  water). This is a HERO test only; pick ONE, then the 4-slot build + integration is a separate step. Ocean
  could be animated later (out of scope here). Deterministic seed.
</p>
<button id="reshuffle">Reshuffle mosaics</button>
<div class="grid" id="cards"></div>
<script>
  const W = 256, H = 128, COLS = 4, ROWS = 6;
  const CANDS = [
${cardsJs}
  ];
  const half = (tag) => 'ocean_' + tag + '_half.png';
  function mulberry32(seed){return function(){seed|=0;seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
  function makeMosaic(el, src){return function(seed){el.innerHTML='';const rand=mulberry32(seed);let mr=0,mb=0;const ps=[];for(let r=0;r<ROWS;r++){const odd=r%2===1;for(let c=0;c<COLS;c++){const x=c*W+(odd?W/2:0);const y=r*(H/2);ps.push([x,y]);if(x+W>mr)mr=x+W;if(y+H>mb)mb=y+H;}}el.style.width=mr+'px';el.style.height=mb+'px';for(const[x,y]of ps){const img=document.createElement('img');img.src=src;img.style.left=x+'px';img.style.top=y+'px';el.appendChild(img);}};}
  const cards=document.getElementById('cards');const builders=[];
  CANDS.forEach((cand,i)=>{
    const card=document.createElement('div');card.className='card';
    card.innerHTML='<h2>'+cand.label+'</h2>'+
      '<div class="file">ocean_'+cand.tag+'.png</div>'+
      '<div class="meta">darken x'+cand.dark+' · base '+cand.base+'</div>'+
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
  fs.writeFileSync(path.join(OUT, 'ocean-style-test.html'), html);
  console.log('[html] ocean-style-test.html');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const args = process.argv.slice(2);
  if (args.includes('--html-only')) { writeHtml(); return; }
  if (!FAL_API_KEY) { console.error('No fal key (FAL_AI_API_KEY in scripts/.env)'); process.exit(1); }
  const reroll = args.filter(a => !a.startsWith('--'));

  for (const cand of CANDS) {
    if (reroll.length && !reroll.includes(cand.tag)) continue;
    const seed = reroll.includes(cand.tag) ? cand.seed + 1000 : cand.seed;
    try {
      const baseBuf = fs.readFileSync(base(cand.baseBiome, cand.baseN));
      const raw = await kontext(baseBuf, { ...cand, seed });
      const masked = await postProcess(raw, cand);
      await mosaic(masked, path.join(OUT, `ocean_${cand.tag}_mosaic.png`));
      const s = await stats(masked);
      const e = await edgeCheck(masked);
      const rim = e.delta > 6 ? ' ⚠ EDGE-RIM' : ' edges-clean';
      console.log(`  [done] ocean_${cand.tag}  ${fmtC(s)}  edge${e.edge.toFixed(1)} interior${e.interior.toFixed(1)} Δ${e.delta.toFixed(1)}${rim}`);
    } catch (e) { console.error(`ERR ${cand.tag}: ${e.message}`); }
  }
  writeHtml();
  console.log('all done');
})();
