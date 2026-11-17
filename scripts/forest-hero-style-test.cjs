/**
 * HERO STYLE-TEST: forest (EARTH_LIKE family) — dark/dirty/desaturated redesign.
 *
 * Produces 4 single-tile HERO candidates at graded darkness (mild / medium / dark /
 * dark_fern) so Rudi can pick ONE hero. This is a HERO test ONLY — one representative
 * tile per candidate. NOT the 4-slot build, NOT an integration into src/. Writes only
 * to assets/style-test/tiles/ + an HTML.
 *
 * IMPORTANT: this is the FOREST FLOOR tile. Trees are added LATER via a separate prop
 * layer — they are NOT part of this ground tile. So the concept is shaded woodland
 * GROUND (grass + moss + leaf litter + roots/twigs + low ferns), never tree trunks or
 * canopy.
 *
 * Concept — forest floor: shaded woodland ground — the grassy plains base + moss
 * patches, fallen leaf litter, small roots/twigs, a few low ferns / undergrowth clumps,
 * dappled shade. Reads clearly as forest floor (distinct from open plains), NOT as
 * trees. Muted greens + brown leaf-litter, matte, darker / shaded than open plains,
 * NOT neon green.
 *
 * EARTH_LIKE line (Rudi's rule): derive from a PLAINS asset. Base for EVERY candidate
 * is the finished redesigned plains tile src/assets/tiles/plains/plains_0.webp (grassy
 * plains). Each candidate is a fal-ai/flux-pro/kontext ADDITIVE instruction edit of
 * that base (mountain/tundra lesson: keep the existing grass, ADD forest-floor elements
 * — do not fully wipe the base), then a UNIFORM brightness multiply (pure .modulate,
 * no gradient) for its darkness grade, then re-diamond-mask.
 *
 * CRITICAL LESSON (from toxic_marsh): do NOT use divide-by-blur 2D equalization on
 * masked tiles — it creates a bright gold rim at the diamond edges (dark pre-mask
 * corners contaminate the edge blur). It is kept OFF here: just kontext + uniform
 * darkness multiply + re-mask, so edges fall off clean. An edge-band check verifies it.
 *
 * PROMPT RULE (asset conventions): NO negative prompts (they reproduce the unwanted
 * thing). All instructions are POSITIVE and ADDITIVE ("keep the grass, add moss and
 * fallen leaf litter", not "remove X").
 *
 * Outputs (style-test workspace ONLY):
 *   assets/style-test/tiles/forest_{mild,medium,dark,dark_fern}.png   512x256
 *   assets/style-test/tiles/forest_{...}_half.png                     256x128
 *   assets/style-test/tiles/forest_{...}_mosaic.png                   3x3 iso
 *   assets/style-test/tiles/forest-style-test.html                    side-by-side
 *
 * fal key in scripts/.env (FAL_AI_API_KEY / FAL_API_KEY) — never hardcode / commit.
 *
 * Usage:
 *   node scripts/forest-hero-style-test.cjs                 full run
 *   node scripts/forest-hero-style-test.cjs mild dark       re-roll only these (seed +1000)
 *   node scripts/forest-hero-style-test.cjs --html-only     rebuild HTML from existing PNGs
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

// Shared look language (POSITIVE only — no negatives). Shaded woodland FLOOR palette —
// muted greens + brown leaf-litter, matte, darker/shaded than open plains, NOT neon.
const MUTED = 'muted heavily desaturated dull woodland tones of dark moss-green and brown leaf litter, matte non-reflective surface, dim dappled shade lighting from the upper left, dark shaded forest floor look under a tree canopy, The Expanse sci-fi aesthetic';

// Core ADDITIVE instruction reused by every candidate (POSITIVE only). Keeps the
// existing grass of the plains base and ADDS forest-floor detail on top of it. This is
// the FOREST FLOOR (ground only) — explicitly no tree trunks or canopy in the tile.
const ADD = 'keep the existing grassy ground of this plains tile and turn it into a shaded forest floor by adding woodland ground detail on top of the grass: patches of dull green moss spreading over the grass, scattered fallen brown leaf litter and dead leaves, a few small twigs and thin surface roots crossing the ground, small low clumps of green ferns and low undergrowth, and soft dappled shade, keep it as flat woodland GROUND only with no tree trunks and no tree canopy';

// Tileability instruction (POSITIVE only — no negatives). Kept available for re-rolls.
const TILEABLE = 'seamless tileable ground texture that repeats without visible seams; keep the pattern even and uniform toward all edges so neighbouring tiles blend smoothly; all four edges similar in tone and detail; avoid any large distinct feature touching the border; small evenly-distributed detail only';

// Candidates. Graded darkness (uniform multiply) + graded forest-floor density (prompt).
// Every candidate derives from plains_0 (EARTH_LIKE = derived from PLAINS).
const CANDS = [
  {
    tag: 'mild', dark: 0.92, seed: 471001,
    baseBiome: 'plains', baseN: 0,
    label: 'MILD (grassy woodland edge)',
    desc: 'plains_0: grassy base kept, ADD some moss patches + scattered fallen leaf litter — lightest, closest to plains, just reads as shaded woodland edge',
    prompt:
      `${ADD}, keep most of the tile as the original grass with only a light woodland touch: a few patches of dull green moss and scattered fallen brown leaf litter over the grass with a couple of small twigs, mostly grassy and only lightly shaded, ${MUTED}`,
  },
  {
    tag: 'medium', dark: 0.82, seed: 472002,
    baseBiome: 'plains', baseN: 0,
    label: 'MEDIUM (mossy floor)',
    desc: 'plains_0: mossy forest floor over the grass — moss + leaf litter + a few roots/twigs + small ferns, medium shade',
    prompt:
      `${ADD}, balance the tile between the mossy grassy ground and the woodland detail: broad patches of dull green moss over the grass, an even scatter of fallen brown leaf litter, a few thin surface roots and small twigs crossing the ground, and a couple of small low green fern clumps, shaded woodland floor, ${MUTED}`,
  },
  {
    tag: 'dark', dark: 0.70, seed: 473003,
    baseBiome: 'plains', baseN: 0,
    label: 'DARK (deep shaded floor)',
    desc: 'plains_0: deep shaded forest floor — dense moss + heavy leaf litter + roots + undergrowth over the grass, darkest',
    prompt:
      `${ADD}, make it a deep shaded forest floor: dense dull green moss covering most of the grass, a heavy layer of fallen brown leaf litter and dead leaves, several thin surface roots and small twigs crossing the ground, small clumps of dark green ferns and low undergrowth, deep dappled shade, darker and damper woodland floor, ${MUTED}`,
  },
  {
    tag: 'dark_fern', dark: 0.72, seed: 474004,
    baseBiome: 'plains', baseN: 0,
    label: 'DARK (fern undergrowth)',
    desc: 'plains_0: fern-heavy shaded floor — grass + moss largely overgrown with low green ferns and undergrowth clumps + leaf litter + roots, dark',
    prompt:
      `${ADD}, make it a fern-heavy shaded forest floor: the grassy ground largely overgrown with many small low green fern clumps and leafy low undergrowth, patches of dull green moss between them, fallen brown leaf litter and a few thin surface roots and twigs filling the gaps, deep dappled shade, dark damp woodland floor, still flat GROUND with no tree trunks, ${MUTED}`,
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
  fs.writeFileSync(path.join(OUT, `forest_${cand.tag}.png`), masked);
  await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toFile(path.join(OUT, `forest_${cand.tag}_half.png`));
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
<title>forest — Hero Style-Test (forest FLOOR, EARTH_LIKE redesign)</title>
<style>
  :root { --w: 256; --h: 128; }
  body { margin: 0; background: #030712; color: #d6dae0; font-family: system-ui, sans-serif; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.note { margin: 0 0 24px; color: #8893a0; font-size: 13px; max-width: 880px; line-height: 1.5; }
  button { background: #2f5f34; color: #eafff0; border: 1px solid #4a8a52;
    border-radius: 6px; padding: 8px 16px; font-size: 14px; cursor: pointer; margin-bottom: 20px; }
  button:hover { background: #3a7a41; }
  .grid { display: flex; flex-wrap: wrap; gap: 32px; align-items: flex-start; }
  .card { background: #0b0f16; border: 1px solid #1a2230; border-radius: 8px; padding: 14px 14px 18px; }
  .card h2 { font-size: 15px; margin: 0 0 2px; color: #cfe0d2; }
  .card .file { font-size: 12px; color: #7f8b98; font-family: ui-monospace, monospace; margin-bottom: 2px; }
  .card .meta { font-size: 12px; color: #a9b; margin-bottom: 6px; }
  .card .cap { font-size: 12px; color: #9fb0c3; margin-bottom: 10px; max-width: 300px; }
  .single { margin-bottom: 12px; }
  .single img { width: calc(var(--w) * 1px); height: calc(var(--h) * 1px); display: block; }
  .mosaic { position: relative; }
  .mosaic img { position: absolute; width: calc(var(--w) * 1px); height: calc(var(--h) * 1px); image-rendering: auto; }
</style>
</head>
<body>
<h1>forest — Hero Style-Test (forest FLOOR)</h1>
<p class="note">
  ${CANDS.length} single-tile HERO candidates for the <b>forest</b> tile (EARTH_LIKE family) in the
  dark/dirty/desaturated redesign, at graded darkness. This is the <b>forest FLOOR</b> — shaded woodland
  GROUND (grass + moss + fallen leaf litter + small roots/twigs + low ferns). <b>Trees are added later via
  a separate prop layer</b>, they are NOT in this ground tile. Each candidate is an ADDITIVE
  <code>flux-pro/kontext</code> edit of the finished redesigned plains base (<b>plains_0</b> — EARTH_LIKE
  rule: derive from PLAINS). The grass is KEPT and forest-floor detail is added on top, then a uniform
  brightness multiply for its darkness grade, then diamond-masked. No divide-by-blur equalization (that
  caused the gold edge rim on toxic_marsh) — edges fall off clean. Top = the raw single tile; below = a
  small interlocking-iso mosaic (repeats the SAME tile, so you see pure tiling repetition — the 4
  slot-variants break that up later). This is a HERO test only; pick ONE, then the 4-slot build (+ trees
  later via the prop layer) is a separate step. Deterministic seed.
</p>
<button id="reshuffle">Reshuffle mosaics</button>
<div class="grid" id="cards"></div>
<script>
  const W = 256, H = 128, COLS = 4, ROWS = 6;
  const CANDS = [
${cardsJs}
  ];
  const half = (tag) => 'forest_' + tag + '_half.png';
  function mulberry32(seed){return function(){seed|=0;seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
  function makeMosaic(el, src){return function(seed){el.innerHTML='';const rand=mulberry32(seed);let mr=0,mb=0;const ps=[];for(let r=0;r<ROWS;r++){const odd=r%2===1;for(let c=0;c<COLS;c++){const x=c*W+(odd?W/2:0);const y=r*(H/2);ps.push([x,y]);if(x+W>mr)mr=x+W;if(y+H>mb)mb=y+H;}}el.style.width=mr+'px';el.style.height=mb+'px';for(const[x,y]of ps){const img=document.createElement('img');img.src=src;img.style.left=x+'px';img.style.top=y+'px';el.appendChild(img);}};}
  const cards=document.getElementById('cards');const builders=[];
  CANDS.forEach((cand,i)=>{
    const card=document.createElement('div');card.className='card';
    card.innerHTML='<h2>'+cand.label+'</h2>'+
      '<div class="file">forest_'+cand.tag+'.png</div>'+
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
  fs.writeFileSync(path.join(OUT, 'forest-style-test.html'), html);
  console.log('[html] forest-style-test.html');
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
      await mosaic(masked, path.join(OUT, `forest_${cand.tag}_mosaic.png`));
      const s = await stats(masked);
      const e = await edgeCheck(masked);
      const rim = e.delta > 6 ? ' ⚠ EDGE-RIM' : ' edges-clean';
      console.log(`  [done] forest_${cand.tag}  ${fmtC(s)}  edge${e.edge.toFixed(1)} interior${e.interior.toFixed(1)} Δ${e.delta.toFixed(1)}${rim}`);
    } catch (e) { console.error(`ERR ${cand.tag}: ${e.message}`); }
  }
  writeHtml();
  console.log('all done');
})();
