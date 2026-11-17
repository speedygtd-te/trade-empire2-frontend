/**
 * HERO STYLE-TEST: toxic_marsh (TOXIC family) — dark/dirty/desaturated redesign.
 *
 * Produces 3-4 single-tile HERO candidates at graded darkness/dirtiness
 * (mild / medium / dark / dark-pool) so Rudi can pick ONE hero. This is a HERO
 * test ONLY — one representative tile per candidate. NOT the 4-slot build, NOT an
 * integration into src/. Writes only to assets/style-test/tiles/ + an HTML.
 *
 * Concept (REV 2 — swampier + bubbles): a BOGGY STAGNANT TOXIC SWAMP ground tile —
 * thick murky sickly green-brown sludge-water between muddy hummocks, mats of dead
 * scummy vegetation, and CLUSTERS OF SMALL ROUND GAS BUBBLES bubbling up on the
 * sludge surface (the key ask). Muted heavily desaturated (NOT bright, NOT neon),
 * matte, dim upper-left lighting, dark and dirty.
 * Consistent with the finished TOXIC tiles (acid_lake, corroded_plain, chemical_vent).
 *
 * RECYCLING (preferred over from-scratch, cheaper + consistent):
 *   Bases are the FINISHED tiles on disk (512x256 diamond-masked webp):
 *     src/assets/tiles/acid_lake/acid_lake_{0,2,3}.webp        (toxic liquid pools)
 *     src/assets/tiles/corroded_plain/corroded_plain_1.webp    (muddy corroded banks)
 *   Each candidate is a fal-ai/flux-pro/kontext instruction edit of one base
 *   (same endpoint the approved fumarole/chemical_vent rework used), then a UNIFORM
 *   brightness multiply (pure .modulate, no gradient) for its darkness grade, then
 *   re-diamond-mask.
 *
 * PROMPT RULE (asset conventions): NO negative prompts (they reproduce the unwanted
 * thing). All instructions are POSITIVE replacements ("muted dull desaturated
 * sickly green-brown", "stagnant sludge pools with muddy banks").
 *
 * Outputs (style-test workspace ONLY):
 *   assets/style-test/tiles/toxic_marsh_{mild,medium,dark,dark_pool}.png   512x256
 *   assets/style-test/tiles/toxic_marsh_{...}_half.png                     256x128
 *   assets/style-test/tiles/toxic_marsh_{...}_mosaic.png                   3x3 iso
 *   assets/style-test/tiles/toxic_marsh-style-test.html                    side-by-side
 *
 * fal key in scripts/.env (FAL_AI_API_KEY / FAL_API_KEY) — never hardcode / commit.
 *
 * Usage:
 *   node scripts/toxic-marsh-hero-style-test.cjs                 full run
 *   node scripts/toxic-marsh-hero-style-test.cjs mild dark       re-roll only these (seed +1000)
 *   node scripts/toxic-marsh-hero-style-test.cjs --html-only     rebuild HTML from existing PNGs
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

// Shared look language (POSITIVE only — no negatives).
const MUTED = 'muted heavily desaturated dull sickly green-brown and olive swamp tones, matte non-reflective surface, dim somber lighting from the upper left, dark grimy toxic wasteland look, The Expanse sci-fi aesthetic';

// KEY ASK (REV 2): bubbling toxic bog. Emphasise clusters of small round gas
// bubbles / foam rising on the sludge surface. POSITIVE phrasing only.
const BUBBLES = 'prominent clusters of many small round gas bubbles bubbling up and foaming on the stagnant sludge surface, little rings of froth and scum around the bubbles, the swamp gently bubbles and off-gasses';

// Tileability instruction (POSITIVE only — no negatives). Keeps the marsh look
// repeating seamlessly with consistent edges.
const TILEABLE = 'seamless tileable ground texture that repeats without visible seams; keep the pattern even and uniform toward all edges so neighbouring tiles blend smoothly; all four edges similar in tone and detail; avoid any large distinct feature touching the border; small evenly-distributed detail only';

// Candidates. Graded darkness (uniform multiply) + graded wetness/dirtiness (prompt).
const CANDS = [
  {
    tag: 'mild', dark: 0.90, seed: 421001,
    baseBiome: 'corroded_plain', baseN: 1,
    label: 'MILD (boggy banks)',
    desc: 'corroded_plain_1: boggy muddy hummocks + a few small bubbling sludge pools + dead scummy growth, only mild darken',
    prompt:
      `Turn this corroded dirty ground into a boggy toxic swamp: turn most of the muddy cracked soil into wet boggy muddy hummocks, sink a few shallow pools of thick murky sickly green-brown toxic sludge-water between them, cover them with mats of dead scummy olive vegetation, ${BUBBLES}, ${MUTED}`,
  },
  {
    tag: 'medium', dark: 0.80, seed: 422002,
    baseBiome: 'acid_lake', baseN: 0,
    label: 'MEDIUM (balanced bog)',
    desc: 'acid_lake_0: balanced bubbling swamp — murky sludge-water winding between muddy hummocks + scummy mats + bubble clusters, medium darken',
    prompt:
      `Turn this toxic pool into a balanced bubbling toxic swamp: thick murky stagnant sickly green-brown sludge-water broken up by winding boggy muddy hummocks and mud flats, mats of dead scummy olive vegetation floating on the sludge, ${BUBBLES}, ${MUTED}`,
  },
  {
    tag: 'dark', dark: 0.68, seed: 423003,
    baseBiome: 'acid_lake', baseN: 2,
    label: 'DARK (sludgy bog)',
    desc: 'acid_lake_2: darker sludgier stagnant bog, thick bubbling sludge + grimy hummocks + heavy scum, dark darken',
    prompt:
      `Turn this toxic pool into a heavy dark bubbling toxic bog: deep stagnant thick dull sickly green-brown toxic sludge and murky water, grimy dark boggy muddy hummocks stained with grime winding between them, thick mats of dead scummy olive vegetation and floating scum, ${BUBBLES}, darker murkier sludge, ${MUTED}`,
  },
  {
    tag: 'dark_pool', dark: 0.68, seed: 424004,
    baseBiome: 'acid_lake', baseN: 3,
    label: 'DARK (pool-heavy bog)',
    desc: 'acid_lake_3: pool-heavy stagnant bog — mostly deep bubbling sludge-water with small muddy islets + floating scum, dark',
    prompt:
      `Turn this toxic pool into a pool-heavy bubbling toxic bog tile: mostly deep stagnant thick murky sickly green-brown toxic sludge-water, dotted with a few small boggy muddy islets and hummocks, floating mats of dead scummy olive vegetation and scum on the surface, ${BUBBLES}, ${MUTED}`,
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

// kontext result -> 512x256 fill -> UNIFORM darken (pure multiply, no gradient) -> diamond mask.
async function postProcess(rawBuf, cand) {
  const resized = await sharp(rawBuf).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha().png().toBuffer();
  const darkened = await sharp(resized).modulate({ brightness: cand.dark }).png().toBuffer();
  const mask = await sharp(DIAMOND_MASK_SVG).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  const masked = await sharp(darkened).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `toxic_marsh_${cand.tag}.png`), masked);
  await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toFile(path.join(OUT, `toxic_marsh_${cand.tag}_half.png`));
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
<title>toxic_marsh — Hero Style-Test (graded darkness, TOXIC redesign)</title>
<style>
  :root { --w: 256; --h: 128; }
  body { margin: 0; background: #030712; color: #d6dae0; font-family: system-ui, sans-serif; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.note { margin: 0 0 24px; color: #8893a0; font-size: 13px; max-width: 860px; line-height: 1.5; }
  button { background: #1f6f4a; color: #eafff3; border: 1px solid #2fae73;
    border-radius: 6px; padding: 8px 16px; font-size: 14px; cursor: pointer; margin-bottom: 20px; }
  button:hover { background: #2a8a5d; }
  .grid { display: flex; flex-wrap: wrap; gap: 32px; align-items: flex-start; }
  .card { background: #0b0f16; border: 1px solid #1a2230; border-radius: 8px; padding: 14px 14px 18px; }
  .card h2 { font-size: 15px; margin: 0 0 2px; color: #cfe6d8; }
  .card .file { font-size: 12px; color: #7f8b98; font-family: ui-monospace, monospace; margin-bottom: 2px; }
  .card .meta { font-size: 12px; color: #b98; margin-bottom: 6px; }
  .card .cap { font-size: 12px; color: #9fb0c3; margin-bottom: 10px; max-width: 300px; }
  .single { margin-bottom: 12px; }
  .single img { width: calc(var(--w) * 1px); height: calc(var(--h) * 1px); display: block; }
  .mosaic { position: relative; }
  .mosaic img { position: absolute; width: calc(var(--w) * 1px); height: calc(var(--h) * 1px); image-rendering: auto; }
</style>
</head>
<body>
<h1>toxic_marsh — Hero Style-Test</h1>
<p class="note">
  ${CANDS.length} single-tile HERO candidates for the <b>toxic_marsh</b> tile (TOXIC family) in the
  dark/dirty/desaturated redesign, at graded darkness. Each is a <code>flux-pro/kontext</code> instruction
  edit of a finished recycled base (acid_lake = toxic water pools, corroded_plain = muddy corroded banks),
  then a uniform brightness multiply for its darkness grade, then diamond-masked. Top = the raw single
  tile; below = a small interlocking-iso mosaic (repeats the SAME tile, so you see pure tiling repetition —
  the 4 slot-variants break that up later). This is a HERO test only; pick ONE, then the 4-slot build +
  integration is a separate step. Deterministic seed.
</p>
<button id="reshuffle">Reshuffle mosaics</button>
<div class="grid" id="cards"></div>
<script>
  const W = 256, H = 128, COLS = 4, ROWS = 6;
  const CANDS = [
${cardsJs}
  ];
  const half = (tag) => 'toxic_marsh_' + tag + '_half.png';
  function mulberry32(seed){return function(){seed|=0;seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
  function makeMosaic(el, src){return function(seed){el.innerHTML='';const rand=mulberry32(seed);let mr=0,mb=0;const ps=[];for(let r=0;r<ROWS;r++){const odd=r%2===1;for(let c=0;c<COLS;c++){const x=c*W+(odd?W/2:0);const y=r*(H/2);ps.push([x,y]);if(x+W>mr)mr=x+W;if(y+H>mb)mb=y+H;}}el.style.width=mr+'px';el.style.height=mb+'px';for(const[x,y]of ps){const img=document.createElement('img');img.src=src;img.style.left=x+'px';img.style.top=y+'px';el.appendChild(img);}};}
  const cards=document.getElementById('cards');const builders=[];
  CANDS.forEach((cand,i)=>{
    const card=document.createElement('div');card.className='card';
    card.innerHTML='<h2>'+cand.label+'</h2>'+
      '<div class="file">toxic_marsh_'+cand.tag+'.png</div>'+
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
  fs.writeFileSync(path.join(OUT, 'toxic_marsh-style-test.html'), html);
  console.log('[html] toxic_marsh-style-test.html');
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
      await mosaic(masked, path.join(OUT, `toxic_marsh_${cand.tag}_mosaic.png`));
      const s = await stats(masked);
      console.log(`  [done] toxic_marsh_${cand.tag}  ${fmtC(s)}`);
    } catch (e) { console.error(`ERR ${cand.tag}: ${e.message}`); }
  }
  writeHtml();
  console.log('all done');
})();
