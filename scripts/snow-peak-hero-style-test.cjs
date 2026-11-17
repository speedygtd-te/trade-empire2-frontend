/**
 * HERO STYLE-TEST: snow_peak (EARTH_LIKE family) — dark/dirty/desaturated redesign.
 *
 * Produces 4 single-tile HERO candidates at graded snow-vs-rock / darkness
 * (mild / medium / dark / dark_drift) so Rudi can pick ONE hero. This is a HERO test
 * ONLY — one representative tile per candidate. NOT the 4-slot build, NOT an integration
 * into src/. Writes only to assets/style-test/tiles/ + an HTML.
 *
 * Concept: a snowy mountain PEAK ground tile — DIRTY pale grey-white snow over dark
 * exposed rock. Patches of dark rock ridges / scree poking through the grimy snow,
 * wind-scoured, matte, desaturated cold-neutral (a touch cold but NOT bright blue/white
 * — GRIMY snow). Reads as a cold snowy mountain peak surface. Explicitly NOT the bright
 * postcard blue-white of the Batch-1 snow_peak tiles — this is the dark redesign:
 * DIRTY GREYISH snow, NOT pure bright white.
 *
 * RECYCLING (preferred over from-scratch, cheaper + consistent):
 *   Bases are FINISHED terrain tiles on disk (512x256 diamond-masked webp). Three
 *   candidates recycle the finished redesigned MOUNTAIN tiles (dark grey rock) and add
 *   dirty snow OVER the rock via kontext; one candidate recycles the Batch-1 snow_peak
 *   tile and recolours its neon blue-white snow into grimy grey:
 *     src/assets/tiles/mountain/mountain_0.webp   (scattered rock + gravel) -> mild  (most rock)
 *     src/assets/tiles/mountain/mountain_1.webp   (boulder cluster)         -> medium(balanced)
 *     src/assets/tiles/snow_peak/snow_peak_0.webp (batch-1 snowy outcrops)  -> dark  (recolour neon->grimy)
 *     src/assets/tiles/mountain/mountain_3.webp   (dense broken rock)       -> dark_drift (heavy snow in gaps)
 *   Each candidate is a fal-ai/flux-pro/kontext instruction edit of one base (same
 *   endpoint the mountain / swamp reworks used), then a UNIFORM brightness multiply
 *   (pure .modulate, no gradient) for its darkness grade, then re-diamond-mask.
 *
 * CRITICAL LESSON (from toxic_marsh): do NOT use divide-by-blur 2D equalization on
 * masked tiles — it creates a bright gold rim at the diamond edges (dark pre-mask
 * corners contaminate the edge blur). It is kept OFF here: just kontext + uniform
 * darkness multiply + re-mask, so edges fall off clean. An edge-band check verifies it.
 *
 * PROMPT RULE (asset conventions): NO negative prompts (they reproduce the unwanted
 * thing). All instructions are POSITIVE replacements ("cover with dirty grey snow",
 * "leave dark exposed rock poking through").
 *
 * Outputs (style-test workspace ONLY):
 *   assets/style-test/tiles/snow_peak_{mild,medium,dark,dark_drift}.png   512x256
 *   assets/style-test/tiles/snow_peak_{...}_half.png                      256x128
 *   assets/style-test/tiles/snow_peak_{...}_mosaic.png                    3x3 iso
 *   assets/style-test/tiles/snow_peak-style-test.html                     side-by-side
 *
 * fal key in scripts/.env (FAL_AI_API_KEY / FAL_API_KEY) — never hardcode / commit.
 *
 * Usage:
 *   node scripts/snow-peak-hero-style-test.cjs                 full run
 *   node scripts/snow-peak-hero-style-test.cjs mild dark       re-roll only these (seed +1000)
 *   node scripts/snow-peak-hero-style-test.cjs --html-only     rebuild HTML from existing PNGs
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

// Shared look language (POSITIVE only — no negatives). GRIMY cold snow palette — the key
// ask is DIRTY greyish snow, NOT the bright blue-white postcard of the Batch-1 tiles.
const MUTED = 'muted heavily desaturated cold neutral dirty grey-white grimy snow over dark grey mountain rock, matte non-reflective surface, dim somber lighting from the upper left, dark cold high-altitude snowy mountain peak look, dirty greyish snow not pure bright white and not bright blue, The Expanse sci-fi aesthetic';

// Core snow-over-rock instruction reused by the mountain-based candidates (POSITIVE
// only). Adds dirty snow while keeping the dark rock layout showing through.
const SNOW_OVER_ROCK = 'cover this dark rocky mountain ground with a layer of dirty pale grey-white snow: fill the hollows and gaps between the rocks with grimy wind-scoured snow while leaving dark exposed rock ridges scree and stones poking through, the snow is dirty greyish off-white and matte not pure bright white and not blue, wind-scoured cold snowy mountain peak surface, keep the rocky layout intact';

// Tileability instruction (POSITIVE only — no negatives). Kept available for re-rolls.
const TILEABLE = 'seamless tileable ground texture that repeats without visible seams; keep the pattern even and uniform toward all edges so neighbouring tiles blend smoothly; all four edges similar in tone and detail; avoid any large distinct feature touching the border; small evenly-distributed detail only';

// Candidates. Graded snow-vs-rock (prompt + base) + graded darkness (uniform multiply).
const CANDS = [
  {
    tag: 'mild', dark: 0.90, seed: 471001,
    baseBiome: 'mountain', baseN: 0,
    label: 'MILD (thin snow, rock showing)',
    desc: 'mountain_0: dark rock ground given a THIN patchy dirty grey snow dusting — MOST of the dark exposed mountain rock and scree still shows through, only mild darken',
    prompt:
      `${SNOW_OVER_ROCK}, dust only a THIN patchy layer of grimy pale grey snow into the hollows and between the stones and leave MOST of the dark exposed mountain rock scree and loose stones showing through, more rock than snow, ${MUTED}`,
  },
  {
    tag: 'medium', dark: 0.82, seed: 472002,
    baseBiome: 'mountain', baseN: 1,
    label: 'MEDIUM (balanced snow + rock)',
    desc: 'mountain_1: boulder-cluster rock with a BALANCED grimy grey snow cover — snow drifts against the boulders while dark rock outcrops and scree still poke through, medium darken',
    prompt:
      `${SNOW_OVER_ROCK}, settle a BALANCED cover of grimy pale grey snow across the ground and drifting against the boulders while dark exposed rock outcrops ridges and scree still poke through, roughly half snow half rock, ${MUTED}`,
  },
  {
    tag: 'dark', dark: 0.80, seed: 473003,
    baseBiome: 'snow_peak', baseN: 0,
    label: 'DARK (heavy grimy snow)',
    desc: 'snow_peak_0 (Batch-1): its bright blue-white snow recoloured into HEAVY grimy grey snow with only a little dark rock poking through, darker/dirtier',
    prompt:
      `recolour this bright blue-white snow into HEAVY dirty grimy pale grey snow covering the mountain peak: turn the clean bright snow into thick wind-scoured grimy greyish snow with only a little dark exposed rock and scree poking through, replace all the bright blue and pure white with dirty desaturated grey snow, darker grimier colder snow, matte, ${MUTED}`,
  },
  {
    tag: 'dark_drift', dark: 0.72, seed: 474004,
    baseBiome: 'mountain', baseN: 3,
    label: 'DARK (snow-packed broken rock)',
    desc: 'mountain_3: dense broken angular rock with HEAVY grimy grey snow packed into the gaps and drifts — mostly snow, a few dark rock edges poking through, darker/dirtier',
    prompt:
      `${SNOW_OVER_ROCK}, pack a HEAVY layer of grimy pale grey snow into the gaps and drifts between the broken angular rock so mostly snow shows with only a few dark rock edges and scree poking through, darker grimier colder snow, wind-scoured drifts, ${MUTED}`,
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
  fs.writeFileSync(path.join(OUT, `snow_peak_${cand.tag}.png`), masked);
  await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toFile(path.join(OUT, `snow_peak_${cand.tag}_half.png`));
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
<title>snow_peak — Hero Style-Test (graded snow/rock, EARTH_LIKE redesign)</title>
<style>
  :root { --w: 256; --h: 128; }
  body { margin: 0; background: #030712; color: #d6dae0; font-family: system-ui, sans-serif; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.note { margin: 0 0 24px; color: #8893a0; font-size: 13px; max-width: 860px; line-height: 1.5; }
  button { background: #45505f; color: #eef2f7; border: 1px solid #6b7887;
    border-radius: 6px; padding: 8px 16px; font-size: 14px; cursor: pointer; margin-bottom: 20px; }
  button:hover { background: #55616f; }
  .grid { display: flex; flex-wrap: wrap; gap: 32px; align-items: flex-start; }
  .card { background: #0b0f16; border: 1px solid #1a2230; border-radius: 8px; padding: 14px 14px 18px; }
  .card h2 { font-size: 15px; margin: 0 0 2px; color: #cfd6df; }
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
<h1>snow_peak — Hero Style-Test</h1>
<p class="note">
  ${CANDS.length} single-tile HERO candidates for the <b>snow_peak</b> tile (EARTH_LIKE family) in the
  dark/dirty/desaturated redesign, graded by snow-vs-rock and darkness. Each is a <code>flux-pro/kontext</code>
  edit of a finished recycled base. Three recycle the redesigned <b>mountain</b> tiles (dark grey rock) and add
  DIRTY grey-white snow OVER the rock; the DARK candidate recolours the Batch-1 <b>snow_peak</b> tile's neon
  blue-white snow into grimy grey. Then a uniform brightness multiply for its darkness grade, then diamond-masked.
  No divide-by-blur equalization (that caused the gold edge rim on toxic_marsh) — edges fall off clean. The snow
  is intentionally DIRTY greyish and matte — NOT the bright blue-white postcard of the old tiles. Top = the raw
  single tile; below = a small interlocking-iso mosaic (repeats the SAME tile, so you see pure tiling repetition —
  the 4 slot-variants break that up later). This is a HERO test only; pick ONE, then the 4-slot build + integration
  is a separate step. Deterministic seed.
</p>
<button id="reshuffle">Reshuffle mosaics</button>
<div class="grid" id="cards"></div>
<script>
  const W = 256, H = 128, COLS = 4, ROWS = 6;
  const CANDS = [
${cardsJs}
  ];
  const half = (tag) => 'snow_peak_' + tag + '_half.png';
  function mulberry32(seed){return function(){seed|=0;seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
  function makeMosaic(el, src){return function(seed){el.innerHTML='';const rand=mulberry32(seed);let mr=0,mb=0;const ps=[];for(let r=0;r<ROWS;r++){const odd=r%2===1;for(let c=0;c<COLS;c++){const x=c*W+(odd?W/2:0);const y=r*(H/2);ps.push([x,y]);if(x+W>mr)mr=x+W;if(y+H>mb)mb=y+H;}}el.style.width=mr+'px';el.style.height=mb+'px';for(const[x,y]of ps){const img=document.createElement('img');img.src=src;img.style.left=x+'px';img.style.top=y+'px';el.appendChild(img);}};}
  const cards=document.getElementById('cards');const builders=[];
  CANDS.forEach((cand,i)=>{
    const card=document.createElement('div');card.className='card';
    card.innerHTML='<h2>'+cand.label+'</h2>'+
      '<div class="file">snow_peak_'+cand.tag+'.png</div>'+
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
  fs.writeFileSync(path.join(OUT, 'snow_peak-style-test.html'), html);
  console.log('[html] snow_peak-style-test.html');
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
      await mosaic(masked, path.join(OUT, `snow_peak_${cand.tag}_mosaic.png`));
      const s = await stats(masked);
      const e = await edgeCheck(masked);
      const rim = e.delta > 6 ? ' ⚠ EDGE-RIM' : ' edges-clean';
      console.log(`  [done] snow_peak_${cand.tag}  ${fmtC(s)}  edge${e.edge.toFixed(1)} interior${e.interior.toFixed(1)} Δ${e.delta.toFixed(1)}${rim}`);
    } catch (e) { console.error(`ERR ${cand.tag}: ${e.message}`); }
  }
  writeHtml();
  console.log('all done');
})();
