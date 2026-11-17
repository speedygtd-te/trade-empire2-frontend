/**
 * HERO STYLE-TEST: swamp (EARTH_LIKE family) — dark/dirty/desaturated redesign.
 *
 * Produces 4 single-tile HERO candidates at graded darkness (mild / medium / dark /
 * dark_pool) so Rudi can pick ONE hero. This is a HERO test ONLY — one representative
 * tile per candidate. NOT the 4-slot build, NOT an integration into src/. Writes only
 * to assets/style-test/tiles/ + an HTML.
 *
 * Concept: a NATURAL swamp / wetland ground tile — dark murky brown-green stagnant
 * water between muddy hummocks, patches of moss / reeds / dead vegetation, rotting
 * logs, mud. Muted NATURAL earth palette (murky brown, dull moss-green) — explicitly
 * NOT the sickly toxic green of toxic_marsh, NOT bright / neon. Matte, dim upper-left
 * lighting, darker than the bright Batch-1 tiles.
 *
 * RECYCLING (preferred over from-scratch, cheaper + consistent):
 *   Bases are the FINISHED toxic_marsh tiles on disk (512x256 diamond-masked webp) —
 *   they already have the exact boggy STRUCTURE we want (muddy hummocks + water
 *   between them + bubble/ring detail); we only recolour the TOXIC green to a NATURAL
 *   murky brown-green swamp via kontext:
 *     src/assets/tiles/toxic_marsh/toxic_marsh_1.webp  (banks/hummocks-heavy) -> mild
 *     src/assets/tiles/toxic_marsh/toxic_marsh_0.webp  (balanced bog)         -> medium
 *     src/assets/tiles/toxic_marsh/toxic_marsh_2.webp  (mud flat + water)     -> dark
 *     src/assets/tiles/toxic_marsh/toxic_marsh_3.webp  (pool-heavy)           -> dark_pool
 *   Each candidate is a fal-ai/flux-pro/kontext instruction edit of one base (same
 *   endpoint the toxic_marsh / chemical_vent rework used), then a UNIFORM brightness
 *   multiply (pure .modulate, no gradient) for its darkness grade, then re-diamond-mask.
 *
 * CRITICAL LESSON (from toxic_marsh): do NOT use divide-by-blur 2D equalization on
 * masked tiles — it creates a bright gold rim at the diamond edges (dark pre-mask
 * corners contaminate the edge blur). It is kept OFF here: just kontext + uniform
 * darkness multiply + re-mask, so edges fall off clean like the hero.
 *
 * PROMPT RULE (asset conventions): NO negative prompts (they reproduce the unwanted
 * thing). All instructions are POSITIVE replacements ("recolour to a natural murky
 * brown-green swamp", "muddy water and mossy banks").
 *
 * Outputs (style-test workspace ONLY):
 *   assets/style-test/tiles/swamp_{mild,medium,dark,dark_pool}.png   512x256
 *   assets/style-test/tiles/swamp_{...}_half.png                     256x128
 *   assets/style-test/tiles/swamp_{...}_mosaic.png                   3x3 iso
 *   assets/style-test/tiles/swamp-style-test.html                    side-by-side
 *
 * fal key in scripts/.env (FAL_AI_API_KEY / FAL_API_KEY) — never hardcode / commit.
 *
 * Usage:
 *   node scripts/swamp-hero-style-test.cjs                 full run
 *   node scripts/swamp-hero-style-test.cjs mild dark       re-roll only these (seed +1000)
 *   node scripts/swamp-hero-style-test.cjs --html-only     rebuild HTML from existing PNGs
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

// Shared look language (POSITIVE only — no negatives). NATURAL earth palette — the
// key ask is to move OFF the sickly toxic green onto murky brown / dull moss-green.
const MUTED = 'muted heavily desaturated dull natural earth tones of murky brown and dull moss-green, matte non-reflective surface, dim somber lighting from the upper left, dark damp overgrown wetland look, The Expanse sci-fi aesthetic';

// Core recolour instruction reused by every candidate (POSITIVE only). Moves the
// TOXIC green of the base to a NATURAL murky swamp while keeping the bog layout.
const RECOLOUR = 'recolour this into a natural murky brown-green swamp: turn the water into dark murky stagnant brown-green swamp water, turn the mounds into wet muddy hummocks with patches of dull moss and reeds and dead brown vegetation, keep the boggy hummock-and-water layout intact, remove any sickly toxic acid green and replace it with natural muddy brown and dull moss-green';

// Tileability instruction (POSITIVE only — no negatives). Kept available for re-rolls.
const TILEABLE = 'seamless tileable ground texture that repeats without visible seams; keep the pattern even and uniform toward all edges so neighbouring tiles blend smoothly; all four edges similar in tone and detail; avoid any large distinct feature touching the border; small evenly-distributed detail only';

// Candidates. Graded darkness (uniform multiply) + graded wetness (prompt + base).
const CANDS = [
  {
    tag: 'mild', dark: 0.90, seed: 431001,
    baseBiome: 'toxic_marsh', baseN: 1,
    label: 'MILD (mossy banks)',
    desc: 'toxic_marsh_1: hummock/bank-heavy — recoloured to muddy hummocks with mossy reedy banks + a little murky swamp water, only mild darken',
    prompt:
      `${RECOLOUR}, keep most of the tile as raised muddy hummocks covered in dull green moss reeds and dead brown vegetation with just a little dark murky brown-green swamp water pooling between them, add a few small rotting logs and mud patches, ${MUTED}`,
  },
  {
    tag: 'medium', dark: 0.80, seed: 432002,
    baseBiome: 'toxic_marsh', baseN: 0,
    label: 'MEDIUM (balanced bog)',
    desc: 'toxic_marsh_0: balanced bog — murky brown-green swamp water winding between muddy hummocks + mossy patches + reeds, medium darken',
    prompt:
      `${RECOLOUR}, balance the tile between dark murky stagnant brown-green swamp water and boggy muddy hummocks, cover the hummocks with patches of dull moss reeds and dead brown vegetation, float a few mats of dead leaves and a rotting log on the water, ${MUTED}`,
  },
  {
    tag: 'dark', dark: 0.68, seed: 433003,
    baseBiome: 'toxic_marsh', baseN: 2,
    label: 'DARK (muddy bog)',
    desc: 'toxic_marsh_2: darker muddier bog — mud flat + deep murky swamp water + heavy dead vegetation, dark darken',
    prompt:
      `${RECOLOUR}, make it a heavy dark muddy swamp: deep dark murky stagnant brown-green swamp water over a grimy mud flat with a boggy muddy hummock, thick patches of dull dark moss dead brown reeds and rotting vegetation, floating scum of dead leaves and a rotting log, darker murkier water, ${MUTED}`,
  },
  {
    tag: 'dark_pool', dark: 0.68, seed: 434004,
    baseBiome: 'toxic_marsh', baseN: 3,
    label: 'DARK (water-heavy)',
    desc: 'toxic_marsh_3: water-heavy swamp — mostly deep murky brown-green swamp water with small muddy mossy islets, dark',
    prompt:
      `${RECOLOUR}, make it a water-heavy swamp tile: mostly deep dark murky stagnant brown-green swamp water dotted with a few small boggy muddy islets and hummocks covered in dull moss and dead brown reeds, floating mats of dead leaves and a half-submerged rotting log on the surface, ${MUTED}`,
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
  fs.writeFileSync(path.join(OUT, `swamp_${cand.tag}.png`), masked);
  await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toFile(path.join(OUT, `swamp_${cand.tag}_half.png`));
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
<title>swamp — Hero Style-Test (graded darkness, EARTH_LIKE redesign)</title>
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
<h1>swamp — Hero Style-Test</h1>
<p class="note">
  ${CANDS.length} single-tile HERO candidates for the <b>swamp</b> tile (EARTH_LIKE family) in the
  dark/dirty/desaturated redesign, at graded darkness. Each is a <code>flux-pro/kontext</code> recolour
  edit of a finished recycled base (<b>toxic_marsh</b> — same boggy hummock-and-water STRUCTURE, but its
  toxic acid-green is recoloured to a NATURAL murky brown-green swamp), then a uniform brightness multiply
  for its darkness grade, then diamond-masked. No divide-by-blur equalization (that caused the gold edge
  rim on toxic_marsh) — edges fall off clean. Top = the raw single tile; below = a small interlocking-iso
  mosaic (repeats the SAME tile, so you see pure tiling repetition — the 4 slot-variants break that up
  later). This is a HERO test only; pick ONE, then the 4-slot build + integration is a separate step.
  Deterministic seed.
</p>
<button id="reshuffle">Reshuffle mosaics</button>
<div class="grid" id="cards"></div>
<script>
  const W = 256, H = 128, COLS = 4, ROWS = 6;
  const CANDS = [
${cardsJs}
  ];
  const half = (tag) => 'swamp_' + tag + '_half.png';
  function mulberry32(seed){return function(){seed|=0;seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
  function makeMosaic(el, src){return function(seed){el.innerHTML='';const rand=mulberry32(seed);let mr=0,mb=0;const ps=[];for(let r=0;r<ROWS;r++){const odd=r%2===1;for(let c=0;c<COLS;c++){const x=c*W+(odd?W/2:0);const y=r*(H/2);ps.push([x,y]);if(x+W>mr)mr=x+W;if(y+H>mb)mb=y+H;}}el.style.width=mr+'px';el.style.height=mb+'px';for(const[x,y]of ps){const img=document.createElement('img');img.src=src;img.style.left=x+'px';img.style.top=y+'px';el.appendChild(img);}};}
  const cards=document.getElementById('cards');const builders=[];
  CANDS.forEach((cand,i)=>{
    const card=document.createElement('div');card.className='card';
    card.innerHTML='<h2>'+cand.label+'</h2>'+
      '<div class="file">swamp_'+cand.tag+'.png</div>'+
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
  fs.writeFileSync(path.join(OUT, 'swamp-style-test.html'), html);
  console.log('[html] swamp-style-test.html');
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
      await mosaic(masked, path.join(OUT, `swamp_${cand.tag}_mosaic.png`));
      const s = await stats(masked);
      const e = await edgeCheck(masked);
      const rim = e.delta > 6 ? ' ⚠ EDGE-RIM' : ' edges-clean';
      console.log(`  [done] swamp_${cand.tag}  ${fmtC(s)}  edge${e.edge.toFixed(1)} interior${e.interior.toFixed(1)} Δ${e.delta.toFixed(1)}${rim}`);
    } catch (e) { console.error(`ERR ${cand.tag}: ${e.message}`); }
  }
  writeHtml();
  console.log('all done');
})();
