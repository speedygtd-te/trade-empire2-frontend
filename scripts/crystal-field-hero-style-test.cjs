/**
 * HERO STYLE-TEST: crystal_field (TOXIC family) — dark/dirty/desaturated redesign.
 *
 * Produces 3-4 single-tile HERO candidates at graded darkness/dirtiness
 * (mild / medium / dark / + palette alt) so Rudi can pick ONE hero. This is a HERO
 * test ONLY — one representative tile per candidate. NOT the 4-slot build, NOT an
 * integration into src/. Writes only to assets/style-test/tiles/ + an HTML.
 *
 * Concept: a TOXIC CRYSTAL FIELD ground tile — dark corroded/toxic ground studded
 * with clusters of angular crystalline mineral formations (jagged shards / geode
 * clusters). The crystals read as DULL / MATTE mineral formations (chalky, opaque,
 * light-absorbing), NOT bright glowing gems. Muted heavily desaturated palette:
 * a dull toxic teal-green (main candidates) or a sickly amber (palette alt).
 * Matte, dim upper-left lighting, darker than the bright Batch-1 tiles. Consistent
 * with the finished TOXIC tiles (acid_lake, corroded_plain, chemical_vent, toxic_marsh).
 *
 * RECYCLING (preferred over from-scratch, cheaper + consistent):
 *   Bases are the FINISHED tiles on disk (512x256 diamond-masked webp):
 *     src/assets/tiles/corroded_plain/corroded_plain_{0,1,2}.webp  (dark corroded ground)
 *     src/assets/tiles/acid_lake/acid_lake_2.webp                  (toxic pool source)
 *   crystal_field is the hardest TOXIC tile to recycle — each candidate is a
 *   fal-ai/flux-pro/kontext instruction edit that GROWS crystal clusters onto the
 *   corroded/toxic ground base (same endpoint the approved chemical_vent / toxic_marsh
 *   reworks used), then a UNIFORM brightness multiply (pure .modulate, no gradient)
 *   for its darkness grade, then re-diamond-mask.
 *
 * EDGE LESSON (from toxic_marsh): the divide-by-blur 2D equalization creates a gold
 * edge-rim on masked tiles (dark pre-mask corners contaminate the edge blur). So this
 * hero test does NOT equalize — just kontext + uniform darkness multiply + re-mask.
 * Edges stay clean.
 *
 * PROMPT RULE (asset conventions): NO negative prompts (they reproduce the unwanted
 * thing). All instructions are POSITIVE replacements ("dull opaque matte chalky
 * crystals", "growing up from the corroded ground"). To keep crystals from glowing we
 * use POSITIVE replacement language ("dull opaque matte light-absorbing"), never
 * "not glowing / no glow".
 *
 * Outputs (style-test workspace ONLY):
 *   assets/style-test/tiles/crystal_field_{mild,medium,dark,dark_amber}.png   512x256
 *   assets/style-test/tiles/crystal_field_{...}_half.png                      256x128
 *   assets/style-test/tiles/crystal_field_{...}_mosaic.png                    3x3 iso
 *   assets/style-test/tiles/crystal_field-style-test.html                     side-by-side
 *
 * fal key in scripts/.env (FAL_AI_API_KEY / FAL_API_KEY) — never hardcode / commit.
 *
 * Usage:
 *   node scripts/crystal-field-hero-style-test.cjs                 full run
 *   node scripts/crystal-field-hero-style-test.cjs mild dark       re-roll only these (seed +1000)
 *   node scripts/crystal-field-hero-style-test.cjs --html-only     rebuild HTML from existing PNGs
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
const MUTED = 'muted heavily desaturated dull toxic tones, matte non-reflective surface, dim somber lighting from the upper left, dark grimy toxic wasteland look, The Expanse sci-fi aesthetic';

// Crystal look language. POSITIVE-only phrasing that forces DULL / MATTE minerals
// (chalky, opaque, light-absorbing) instead of bright glowing gems. Teal-green tone.
const CRYSTAL_TEAL = 'clusters of angular jagged crystalline mineral shards and small geode formations growing up out of the corroded ground, dull opaque matte chalky crystals with rough grainy non-reflective faces, dim light-absorbing mineral surface, muted desaturated dull toxic teal-green crystal colour with olive and grey grime staining the crystal bases';

// Sickly amber palette alternative (same dull matte discipline).
const CRYSTAL_AMBER = 'clusters of angular jagged crystalline mineral shards and small geode formations growing up out of the corroded ground, dull opaque matte chalky crystals with rough grainy non-reflective faces, dim light-absorbing mineral surface, muted desaturated sickly amber-ochre crystal colour with olive-brown and grey grime staining the crystal bases';

// Tileability instruction (POSITIVE only — no negatives). Not used on the hero
// candidates below (kept for parity with the precedents / future 4-slot build).
const TILEABLE = 'seamless tileable ground texture that repeats without visible seams; keep the pattern even and uniform toward all edges so neighbouring tiles blend smoothly; all four edges similar in tone and detail; avoid any large distinct feature touching the border; small evenly-distributed detail only';

// Candidates. Graded darkness (uniform multiply) + graded crystal density (prompt).
const CANDS = [
  {
    tag: 'mild', dark: 0.90, seed: 431001,
    baseBiome: 'corroded_plain', baseN: 0,
    label: 'MILD (sparse teal)',
    desc: 'corroded_plain_0: mostly corroded ground with a few small scattered clusters of dull matte teal-green crystal shards, only mild darken',
    prompt:
      `Turn this corroded dirty ground into a mild toxic crystal field: keep most of the cracked grimy dark corroded soil, add just a few small scattered ${CRYSTAL_TEAL}, ${MUTED}`,
  },
  {
    tag: 'medium', dark: 0.80, seed: 432002,
    baseBiome: 'corroded_plain', baseN: 2,
    label: 'MEDIUM (balanced teal)',
    desc: 'corroded_plain_2: several clusters of angular teal-green crystal shards spread across the corroded ground, medium darken',
    prompt:
      `Turn this corroded dirty ground into a balanced toxic crystal field: keep the cracked grimy dark corroded soil between the crystals, scatter several ${CRYSTAL_TEAL}, ${MUTED}`,
  },
  {
    tag: 'dark', dark: 0.68, seed: 433003,
    baseBiome: 'corroded_plain', baseN: 1,
    label: 'DARK (dense teal)',
    desc: 'corroded_plain_1: dense dark crystal field, larger jagged geode clusters growing from grimy stained soil, dark darken',
    prompt:
      `Turn this corroded dirty ground into a dense dark toxic crystal field: darkened cracked grimy corroded soil stained with grime between the crystals, densely studded with larger ${CRYSTAL_TEAL}, darker grimier soil, ${MUTED}`,
  },
  {
    tag: 'dark_amber', dark: 0.70, seed: 434004,
    baseBiome: 'acid_lake', baseN: 2,
    label: 'DARK (amber palette alt)',
    desc: 'acid_lake_2 reworked to crystal ground: sickly amber crystal clusters growing from a drained corroded toxic bed, palette alternative, dark',
    prompt:
      `Turn this toxic pool into a dark toxic crystal field ground tile: drain most of the open liquid into cracked dark corroded grimy soil and a few small shallow residual toxic puddles, and grow across it several ${CRYSTAL_AMBER}, ${MUTED}`,
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
  fs.writeFileSync(path.join(OUT, `crystal_field_${cand.tag}.png`), masked);
  await sharp(masked).resize(256, 128, { fit: 'fill' }).png().toFile(path.join(OUT, `crystal_field_${cand.tag}_half.png`));
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
<title>crystal_field — Hero Style-Test (graded darkness, TOXIC redesign)</title>
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
<h1>crystal_field — Hero Style-Test</h1>
<p class="note">
  ${CANDS.length} single-tile HERO candidates for the <b>crystal_field</b> tile (TOXIC family) in the
  dark/dirty/desaturated redesign, at graded darkness. Each is a <code>flux-pro/kontext</code> instruction
  edit of a finished recycled base (corroded_plain = corroded dark ground, acid_lake = toxic pool), growing
  clusters of DULL MATTE angular crystal shards onto the ground, then a uniform brightness multiply for its
  darkness grade, then diamond-masked (no divide-by-blur equalization, so edges stay clean — no gold rim).
  Crystals read as dull chalky mineral, not glowing gems. Top = the raw single tile; below = a small
  interlocking-iso mosaic (repeats the SAME tile, so you see pure tiling repetition — the 4 slot-variants
  break that up later). This is a HERO test only; pick ONE, then the 4-slot build + integration is a
  separate step. Deterministic seed.
</p>
<button id="reshuffle">Reshuffle mosaics</button>
<div class="grid" id="cards"></div>
<script>
  const W = 256, H = 128, COLS = 4, ROWS = 6;
  const CANDS = [
${cardsJs}
  ];
  const half = (tag) => 'crystal_field_' + tag + '_half.png';
  function mulberry32(seed){return function(){seed|=0;seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
  function makeMosaic(el, src){return function(seed){el.innerHTML='';const rand=mulberry32(seed);let mr=0,mb=0;const ps=[];for(let r=0;r<ROWS;r++){const odd=r%2===1;for(let c=0;c<COLS;c++){const x=c*W+(odd?W/2:0);const y=r*(H/2);ps.push([x,y]);if(x+W>mr)mr=x+W;if(y+H>mb)mb=y+H;}}el.style.width=mr+'px';el.style.height=mb+'px';for(const[x,y]of ps){const img=document.createElement('img');img.src=src;img.style.left=x+'px';img.style.top=y+'px';el.appendChild(img);}};}
  const cards=document.getElementById('cards');const builders=[];
  CANDS.forEach((cand,i)=>{
    const card=document.createElement('div');card.className='card';
    card.innerHTML='<h2>'+cand.label+'</h2>'+
      '<div class="file">crystal_field_'+cand.tag+'.png</div>'+
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
  fs.writeFileSync(path.join(OUT, 'crystal_field-style-test.html'), html);
  console.log('[html] crystal_field-style-test.html');
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
      await mosaic(masked, path.join(OUT, `crystal_field_${cand.tag}_mosaic.png`));
      const s = await stats(masked);
      console.log(`  [done] crystal_field_${cand.tag}  ${fmtC(s)}`);
    } catch (e) { console.error(`ERR ${cand.tag}: ${e.message}`); }
  }
  writeHtml();
  console.log('all done');
})();
