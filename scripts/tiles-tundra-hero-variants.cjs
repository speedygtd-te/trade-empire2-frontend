/**
 * TUNDRA ITERATION 2, STEP 3 -- BUILD THE FOUR-SLOT SET FROM THE W082 HERO.
 *
 * STYLE-TEST ONLY. Writes into assets/style-test/tiles/tundra_iter2/ only.
 * Nothing goes to src/assets/tiles/ here -- integration is a separate script
 * that only runs once the two checks below pass. No cap sync, no git.
 *
 * WHAT RUDI DECIDED
 *   W082 (the de-vegetated tile with the warm cast graded back to B/R 0.82) is
 *   the HERO. Three further variants are derived FROM IT, so the whole set has
 *   one origin instead of the two captures the shipped set had.
 *
 * THE TWO THINGS THE PREVIOUS RUN GOT WRONG AND THIS ONE HAS TO FIX
 *   (1) LIGHTING DIRECTION. Shipped tundra carries a clean top-light on all four
 *       slots (tiltX +4.1/+2.3/-4.1/-2.4, tiltY +11.0..+11.9 -- the x sign flip
 *       is just the flop of slots 2/3). The flux round produced tiltY 0.3/10.9/
 *       4.8/11.1: slot 0 lost the top-light completely. Slots are drawn at random
 *       next to each other, so a per-slot light direction IS the tile grid made
 *       visible. Every slot is therefore corrected to the SHIPPED gradient with a
 *       UNIFORM LUMA PLANE -- a single multiplicative ramp g(x,y)=G*(1+p*nx+q*ny)
 *       applied to R, G and B alike.
 *       NOT a divide-by-blur equalization: on a diamond-masked tile that lifts the
 *       thin rim against its own blurred neighbourhood and leaves a bright yellow
 *       edge (feedback in project_biome_redesign_progress). A global plane has no
 *       local term and cannot treat the rim differently from the middle.
 *       Because the plane is the SAME multiplier on all three channels it does not
 *       move per-pixel hue; only the interior mean reweights slightly, which the
 *       outer solve loop below re-corrects.
 *   (2) EDGES ARE JUDGED ON THE TESSELLATION, NOT ON A GALLERY GRID. The panels
 *       written here lay the tiles out the way PlanetSurface does -- rows offset
 *       by half a tile, stepping h/2 -- so the diamond edges actually meet and a
 *       seam, a halo or a slot-patchwork is visible. A 2x2 with gaps between the
 *       cells cannot show any of that.
 *
 * PROMPT DISCIPLINE
 *   The variant prompt is the corpus simple-edit, verbatim: "create a slightly
 *   different pattern". No negatives (they reproduce the unwanted concept), no
 *   colour words -- kontext greys and lifts on its own (30.8 -> 42.4, B/R 0.63 ->
 *   0.97 on the de-vegetation round) and colour is taken back by a measured grade,
 *   never by the prompt. Every variant is re-solved to the HERO's numbers.
 *
 * THE HERO IS FROZEN BEFORE ANYTHING IS GRADED
 *   hero/tundra_hero_src.webp is copied once from the ladder and then only read.
 *   The kelp_forest run once fed its own output back in as the hero; the freeze
 *   guard below makes that impossible.
 *
 * STRUCTURE IS LOW ON PURPOSE
 *   micro8 is ~3.3 instead of the shipped 8.7 -- the tufts were carrying it and
 *   the tufts are gone. Accepted: plasticity for ICE comes from the prop layer
 *   (ice boulders on the ground), not from the tile. No attempt to win it back.
 *
 * MEASURED ON THE WRITTEN .webp, NEVER ON THE BUFFER
 *   libwebp does not preserve RGB under alpha 0 and the diamond corners are ~50%
 *   of the canvas, so a buffer-side number drifts about +1.5 luma.
 *
 * Output (all under assets/style-test/tiles/)
 *   tundra_iter2/hero/tundra_hero_src.webp   the frozen hero
 *   tundra_iter2/var/tundra_v<n>_kraw.png    raw kontext return, judge collateral
 *   tundra_iter2/final/tundra_<n>.webp       the four finished slots (2/3 flopped)
 *   tundra_iter2/final/tundra_<n>.png        512x256 RGBA, the integration source
 *   _tundra_hero4_sheet.png                  numbers + slots
 *   _tundra_hero4_seam.png                   full-res interlocking field, EDGES
 *   _tundra_hero4_mosaic.png                 play-scale random field, PATCHWORK
 *   _tundra_hero4_numbers.txt
 *
 * Usage: node scripts/tiles-tundra-hero-variants.cjs [--regen] [<1|2|3>=<seed>]
 *        --regen  re-run kontext for the three variants (otherwise reuse kraw)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');
// the solve loop rewrites the SAME path several times; on Windows sharp's file
// cache turns the second write into EINVAL.
sharp.cache(false);

try {
  const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const FAL_API_KEY = process.env.FAL_AI_API_KEY || process.env.FAL_API_KEY;

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const WORK = path.join(ST, 'tundra_iter2');
const SRCD = path.join(WORK, 'src');
const LADDER = path.join(WORK, 'ladder');
const HEROD = path.join(WORK, 'hero');
const VARD = path.join(WORK, 'var');
const FIN = path.join(WORK, 'final');

const TILE_W = 512, TILE_H = 256;
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };
const L709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// ---- the targets -----------------------------------------------------------
// hue / level: the W082 rung Rudi picked
const HOLD_LUM = 30.8, BR_T = 0.82;
const K_TUNDRA = 0.467, BR_TUNDRA = 0.55, K_CORPUS = 0.60, BR_CORPUS = 1.18;
const kFor = (br) => K_TUNDRA + (K_CORPUS - K_TUNDRA) * ((br - BR_TUNDRA) / (BR_CORPUS - BR_TUNDRA));
const GR_T = 1 + kFor(BR_T) * (BR_T - 1);
// gradient: the SHIPPED tundra top-light, measured off the frozen sources.
// Solved PRE-flop, so slots 2/3 land on -TILT_X exactly like the shipped set.
const TILT_X_T = 4.1, TILT_Y_T = 11.0;
const SOLVE_PASSES = 6;

const PROMPT = 'create a slightly different pattern';
const VARIANTS = [
  { id: 1, seed: 72011 },
  { id: 2, seed: 72022 },
  { id: 3, seed: 72033 },
];

const DIAMOND = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + TILE_W + '" height="' + TILE_H + '">' +
  '<polygon points="' + TILE_W / 2 + ',0 ' + TILE_W + ',' + TILE_H / 2 + ' ' +
  TILE_W / 2 + ',' + TILE_H + ' 0,' + TILE_H / 2 + '" fill="white"/></svg>');

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), payload = JSON.stringify(body);
    const req = (u.protocol === 'https:' ? https : http).request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'POST',
      headers: {
        Authorization: 'Key ' + FAL_API_KEY, 'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      const c = [];
      res.on('data', (d) => c.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(c).toString();
        if (res.statusCode >= 400) return reject(new Error('fal ' + res.statusCode + ': ' + raw.slice(0, 400)));
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('bad json ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject); req.write(payload); req.end();
  });
}
function download(url) {
  return new Promise((resolve, reject) => {
    const go = (u) => (u.startsWith('https') ? https : http).get(u, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) return go(res.headers.location);
      const c = [];
      res.on('data', (d) => c.push(d));
      res.on('end', () => resolve(Buffer.concat(c)));
      res.on('error', reject);
    }).on('error', reject);
    go(url);
  });
}

// ---- measurement, always on the written file -------------------------------
function statsRaw(data, ch, w, h) {
  const N = data.length / ch;
  const s = [0, 0, 0], is = [0, 0, 0], iq = [0, 0, 0];
  let ni = 0, sat = 0;
  const half = { l: 0, r: 0, t: 0, b: 0 }, hn = { l: 0, r: 0, t: 0, b: 0 };
  const lv = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    for (let c = 0; c < 3; c++) s[c] += data[i + c];
    if (data[i + 3] < 8) continue;
    for (let c = 0; c < 3; c++) { is[c] += data[i + c]; iq[c] += data[i + c] * data[i + c]; }
    const mx = Math.max(data[i], data[i + 1], data[i + 2]);
    const mn = Math.min(data[i], data[i + 1], data[i + 2]);
    if (mx > 0) sat += (mx - mn) / mx;
    ni++;
    const L = L709(data[i], data[i + 1], data[i + 2]);
    if (data[i + 3] >= 250) lv.push(L);
    const kx = x < w / 2 ? 'l' : 'r', ky = y < h / 2 ? 't' : 'b';
    half[kx] += L; hn[kx]++; half[ky] += L; hn[ky]++;
  }
  lv.sort((a, b) => a - b);
  const m = s.map((x) => x / N), im = is.map((x) => x / ni);
  const isd = iq.map((x, k) => Math.sqrt(Math.max(0, x / ni - im[k] * im[k])));
  return {
    lum: L709(m[0], m[1], m[2]), intLum: L709(im[0], im[1], im[2]), rgb: im,
    br: im[2] / im[0], gr: im[1] / im[0],
    sd: (isd[0] + isd[1] + isd[2]) / 3, sat: sat / ni,
    blow: lv.length ? lv.filter((v) => v >= 200).length / lv.length : 0,
    p99: lv.length ? lv[Math.floor(0.99 * lv.length)] : 0,
    tiltX: half.l / hn.l - half.r / hn.r, tiltY: half.t / hn.t - half.b / hn.b,
  };
}
async function statsOf(file) {
  const { data, info } = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return statsRaw(data, info.channels, info.width, info.height);
}
async function microContrast(file) {
  if (!fs.existsSync(file)) return 0;
  const { data, info } = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, w = info.width, h = info.height;
  const L = new Float32Array(w * h), A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    L[p] = L709(data[p * ch], data[p * ch + 1], data[p * ch + 2]);
    A[p] = data[p * ch + 3];
  }
  let s = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) {
    const p = y * w + x; if (A[p] < 200 || A[p + 1] < 200) continue;
    s += Math.abs(L[p] - L[p + 1]); n++;
  }
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x; if (A[p] < 200 || A[p + w] < 200) continue;
    s += Math.abs(L[p] - L[p + w]); n++;
  }
  return n ? s / n : 0;
}

// ---- the grade: hue gains x level gain x uniform luma plane -----------------
// gain(x,y) = G * (1 + p*nx + q*ny), nx/ny in [-1,1] across the canvas.
// One multiplier for all three channels => per-pixel hue untouched, and no local
// term => the diamond rim is treated exactly like the middle of the tile.
function grade(src, ch, w, h, tint, G, p, q) {
  const out = Buffer.from(src);
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    const ny = (y - cy) / cy;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      if (out[i + 3] < 1) continue;
      const nx = (x - cx) / cx;
      const g = G * (1 + p * nx + q * ny);
      for (let c = 0; c < 3; c++) {
        const v = src[i + c] * tint[c] * g;
        out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
      }
    }
  }
  return out;
}

const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2);

/** solve one tile to (HOLD_LUM, BR_T, GR_T, TILT_X_T, TILT_Y_T), file-measured */
async function solveTile(baseFile, outFile) {
  const raw = await sharp(fs.readFileSync(baseFile)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const S = raw.data, CH = raw.info.channels, W = raw.info.width, H = raw.info.height;
  const b0 = statsRaw(S, CH, W, H);
  // closed form for the hue: after a per-channel gain the interior mean of
  // channel c is m_c * gain_c, so the two ratios pin the gains up to a factor.
  const tint = [1, (GR_T * b0.rgb[0]) / b0.rgb[1], (BR_T * b0.rgb[0]) / b0.rgb[2]];
  let G = HOLD_LUM / b0.lum, p = 0, q = 0;

  // sensitivity of the two tilts to p and q, by finite difference
  const t00 = statsRaw(grade(S, CH, W, H, tint, G, 0, 0), CH, W, H);
  const tP = statsRaw(grade(S, CH, W, H, tint, G, 0.2, 0), CH, W, H);
  const tQ = statsRaw(grade(S, CH, W, H, tint, G, 0, 0.2), CH, W, H);
  const Kx = (tP.tiltX - t00.tiltX) / 0.2, Ky = (tQ.tiltY - t00.tiltY) / 0.2;

  let m = null;
  const eighth = outFile.replace(/\.webp$/, '@eighth.webp');
  for (let pass = 0; pass < SOLVE_PASSES; pass++) {
    const buf = grade(S, CH, W, H, tint, G, p, q);
    const png = await sharp(buf, { raw: { width: W, height: H, channels: CH } }).png().toBuffer();
    await sharp(png).webp(WEBP).toFile(outFile);
    await sharp(png).resize(64, 32, { fit: 'fill' }).webp(WEBP).toFile(eighth);
    m = await statsOf(outFile);
    if (pass === SOLVE_PASSES - 1) { m.png = png; m.plane = { p, q, G }; break; }
    G *= HOLD_LUM / m.lum;
    tint[2] *= BR_T / m.br;
    tint[1] *= GR_T / m.gr;
    p += (TILT_X_T - m.tiltX) / Kx;
    q += (TILT_Y_T - m.tiltY) / Ky;
  }
  return m;
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** the layout PlanetSurface uses: rows offset by half a tile, stepping h/2 */
async function isoField(tiles, w, h, rows, cols, pick, kernel) {
  const bufs = [];
  for (const f of tiles) {
    bufs.push(await sharp(typeof f === 'string' ? fs.readFileSync(f) : f)
      .resize(w, h, { fit: 'fill', kernel: kernel || 'lanczos3' }).png().toBuffer());
  }
  const cells = [];
  let mr = 0, mb = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * w + (r % 2 ? w / 2 : 0), y = (r * h) / 2;
    cells.push({ input: bufs[pick(r, c)], left: x, top: y });
    mr = Math.max(mr, x + w); mb = Math.max(mb, y + h);
  }
  return sharp({ create: { width: mr, height: mb, channels: 4, background: BGA } })
    .composite(cells).png().toBuffer();
}

function label(t, w, size, fill) {
  size = size || 13; fill = fill || '#c9d1d9';
  const esc = String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + (size + 7) + '">' +
    '<text xml:space="preserve" x="4" y="' + (size + 1) + '" font-family="monospace" font-size="' +
    size + '" fill="' + fill + '">' + esc + '</text></svg>');
}

(async () => {
  for (const d of [HEROD, VARD, FIN]) fs.mkdirSync(d, { recursive: true });
  const args = process.argv.slice(2);
  const REGEN = args.includes('--regen');
  const seedOv = {};
  for (const a of args) { const m = a.match(/^([123])=(\d+)$/); if (m) seedOv[m[1]] = parseInt(m[2], 10); }

  // ---- freeze the hero ----------------------------------------------------
  const heroOrigin = path.join(LADDER, 'tundra_W082_0.webp');
  const heroFrozen = path.join(HEROD, 'tundra_hero_src.webp');
  if (!fs.existsSync(heroFrozen)) {
    fs.copyFileSync(heroOrigin, heroFrozen);
    console.log('[freeze] hero created from ladder/tundra_W082_0.webp');
  }
  const heroSame = fs.readFileSync(heroFrozen).equals(fs.readFileSync(heroOrigin));
  console.log('[freeze] hero ' + (heroSame ? 'MATCHES' : 'DIFFERS FROM') + ' ladder/tundra_W082_0.webp');
  const heroStats = await statsOf(heroFrozen);
  console.log('[hero]   L ' + f1(heroStats.lum) + '  B/R ' + f2(heroStats.br) + '  G/R ' + f2(heroStats.gr) +
    '  sat ' + (heroStats.sat * 100).toFixed(0) + '%  tiltX ' + f1(heroStats.tiltX) + '  tiltY ' + f1(heroStats.tiltY));
  console.log('[target] L ' + f1(HOLD_LUM) + '  B/R ' + f2(BR_T) + '  G/R ' + f2(GR_T) +
    '  tiltX ' + f1(TILT_X_T) + '  tiltY ' + f1(TILT_Y_T) + '  (the shipped top-light)');

  // ---- three variants from the hero ---------------------------------------
  console.log('\n[prompt] ' + PROMPT);
  const mask = await sharp(DIAMOND).resize(TILE_W, TILE_H).greyscale().png().toBuffer();
  for (const v of VARIANTS) {
    const kraw = path.join(VARD, 'tundra_v' + v.id + '_kraw.png');
    const vfile = path.join(VARD, 'tundra_v' + v.id + '.webp');
    if (!REGEN && fs.existsSync(kraw) && fs.existsSync(vfile)) { console.log('[kontext] v' + v.id + ' reused'); continue; }
    if (!FAL_API_KEY) { console.error('no fal key in scripts/.env'); process.exit(1); }
    const flat = await sharp(fs.readFileSync(heroFrozen))
      .flatten({ background: { r: 0x14, g: 0x17, b: 0x1c } }).png().toBuffer();
    const seed = seedOv[String(v.id)] || v.seed;
    console.log('[kontext] v' + v.id + ' seed ' + seed);
    const r = await postJson('https://fal.run/fal-ai/flux-pro/kontext', {
      image_url: 'data:image/png;base64,' + flat.toString('base64'),
      prompt: PROMPT, num_images: 1, safety_tolerance: '5', seed,
    });
    const url = r.images && r.images[0] && r.images[0].url;
    if (!url) throw new Error('no image url for v' + v.id + ': ' + JSON.stringify(r).slice(0, 300));
    const buf = await download(url);
    fs.writeFileSync(kraw, buf);
    const resized = await sharp(buf).resize(TILE_W, TILE_H, { fit: 'fill' }).removeAlpha().png().toBuffer();
    const masked = await sharp(resized).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    await sharp(masked).webp(WEBP).toFile(vfile);
    const s = await statsOf(vfile);
    console.log('   raw kontext  L ' + f1(s.lum) + '  B/R ' + f2(s.br) + '  G/R ' + f2(s.gr) +
      '  sd ' + f1(s.sd) + '  sat ' + (s.sat * 100).toFixed(0) + '%  tiltX ' + f1(s.tiltX) + '  tiltY ' + f1(s.tiltY));
  }

  // ---- solve all four, then flop 2/3 --------------------------------------
  const BASES = [
    heroFrozen,
    path.join(VARD, 'tundra_v1.webp'),
    path.join(VARD, 'tundra_v2.webp'),
    path.join(VARD, 'tundra_v3.webp'),
  ];
  const before = [], final = [], finalBuf = [], planes = [];
  console.log('');
  for (let n = 0; n < 4; n++) {
    const b = await statsOf(BASES[n]);
    before.push(b);
    const solved = path.join(FIN, 'tundra_' + n + '.webp');
    const m = await solveTile(BASES[n], solved);
    planes.push(m.plane);
    // slots 2 and 3 are flopped, exactly as the shipped set is -- tiltX flips
    // sign with them and lands on -TILT_X_T, which IS the shipped pattern.
    let png = m.png;
    if (n >= 2) {
      png = await sharp(png).flop().png().toBuffer();
      await sharp(png).webp(WEBP).toFile(solved);
      await sharp(png).resize(64, 32, { fit: 'fill' }).webp(WEBP).toFile(solved.replace(/\.webp$/, '@eighth.webp'));
    }
    fs.writeFileSync(path.join(FIN, 'tundra_' + n + '.png'), png);
    finalBuf.push(png);
    const a = await statsOf(solved);
    a.micro = await microContrast(solved.replace(/\.webp$/, '@eighth.webp'));
    a.microFull = await microContrast(solved);
    a.src = (n === 0 ? 'W082 hero' : 'kontext v' + n) + (n >= 2 ? ' + flop' : '');
    final.push(a);
    console.log('[slot ' + n + '] ' + a.src.padEnd(18) +
      ' before L ' + f1(b.lum).padStart(5) + ' B/R ' + f2(b.br) + ' tX ' + f1(b.tiltX).padStart(6) + ' tY ' + f1(b.tiltY).padStart(6) +
      '  ->  after L ' + f1(a.lum) + ' B/R ' + f2(a.br) + ' G/R ' + f2(a.gr) +
      ' tX ' + f1(a.tiltX).padStart(6) + ' tY ' + f1(a.tiltY).padStart(6) +
      ' sd ' + f1(a.sd) + ' m8 ' + f2(a.micro) + ' blow ' + (a.blow * 100).toFixed(2) + '%');
  }

  // ---- the two edge panels ------------------------------------------------
  // full res, fixed order, tiles actually touching: a seam or halo shows here
  const seamField = await isoField(finalBuf, TILE_W, TILE_H, 6, 4, (r, c) => (r * 2 + c) % 4);
  const seamMeta = await sharp(seamField).metadata();
  const seamPanel = await sharp({ create: { width: seamMeta.width + 36, height: seamMeta.height + 60, channels: 4, background: BGA } })
    .composite([
      { input: label('NEW tundra, FULL RES, tiles interlocking the way PlanetSurface lays them out -- look for seam lines, halo at the diamond rim, slot patchwork', seamMeta.width, 15, '#7ee787'), left: 18, top: 12 },
      { input: label('slot order per row: 0 1 2 3 / 2 3 0 1 / ... so every slot borders every other slot', seamMeta.width, 13, '#8b949e'), left: 18, top: 32 },
      { input: seamField, left: 18, top: 52 },
    ]).png().toBuffer();
  fs.writeFileSync(path.join(ST, '_tundra_hero4_seam.png'), seamPanel);

  // play scale, random draw: the patchwork check -- the way the map really looks
  const shippedFiles = [0, 1, 2, 3].map((n) => path.join(SRCD, 'tundra_' + n + '_src.webp'));
  const rnd = mulberry32(90210);
  const mosNew = await isoField(finalBuf, 64, 32, 26, 16, () => Math.floor(rnd() * 4), 'nearest');
  const rnd2 = mulberry32(90210);
  const mosOld = await isoField(shippedFiles, 64, 32, 26, 16, () => Math.floor(rnd2() * 4), 'nearest');
  const mm = await sharp(mosNew).metadata();
  const mosPanel = await sharp({ create: { width: mm.width * 2 + 60, height: mm.height + 44, channels: 4, background: BGA } })
    .composite([
      { input: label('SHIPPED tundra @eighth, random draw', mm.width, 15, '#ff7b72'), left: 20, top: 10 },
      { input: mosOld, left: 20, top: 36 },
      { input: label('NEW hero4 @eighth, same draw -- patchwork check', mm.width, 15, '#7ee787'), left: mm.width + 40, top: 10 },
      { input: mosNew, left: mm.width + 40, top: 36 },
    ]).png().toBuffer();
  fs.writeFileSync(path.join(ST, '_tundra_hero4_mosaic.png'), mosPanel);
  console.log('\n[panel] _tundra_hero4_seam.png    full-res interlocking 4x6 field');
  console.log('[panel] _tundra_hero4_mosaic.png  play-scale random field, old vs new');

  // ---- neighbours ---------------------------------------------------------
  const NEIGH = [
    { id: 'ice_shelf', file: path.join(TILES, 'ice_shelf', 'ice_shelf_0.webp') },
    { id: 'glacier(L40)', file: path.join(ST, 'glacier_ladder', 'glacier_L40.webp') },
    { id: 'permafrost', file: path.join(TILES, 'permafrost', 'permafrost_0.webp') },
    { id: 'frozen_lake', file: path.join(TILES, 'frozen_lake', 'frozen_lake_0.webp') },
    { id: 'crevasse', file: path.join(TILES, 'crevasse', 'crevasse_0.webp') },
    { id: 'snow_peak', file: path.join(TILES, 'snow_peak', 'snow_peak_0.webp') },
  ].filter((n) => fs.existsSync(n.file));
  for (const nb of NEIGH) {
    nb.stats = await statsOf(nb.file);
    nb.stats.micro = await microContrast(nb.file.replace(/\.webp$/, '@eighth.webp'));
    nb.stats.microFull = await microContrast(nb.file);
  }
  const shippedStats = [];
  for (let n = 0; n < 4; n++) {
    const s = await statsOf(shippedFiles[n]);
    s.micro = await microContrast(path.join(TILES, 'tundra', 'tundra_' + n + '@eighth.webp'));
    s.microFull = await microContrast(shippedFiles[n]);
    shippedStats.push(s);
  }
  const avg = (a, f) => a.reduce((s, x) => s + f(x), 0) / a.length;
  const aggOf = (set) => ({
    lum: avg(set, (x) => x.lum), intLum: avg(set, (x) => x.intLum), br: avg(set, (x) => x.br),
    gr: avg(set, (x) => x.gr), sd: avg(set, (x) => x.sd), micro: avg(set, (x) => x.micro),
    microFull: avg(set, (x) => x.microFull), sat: avg(set, (x) => x.sat),
    tiltX: avg(set, (x) => Math.abs(x.tiltX)), tiltY: avg(set, (x) => x.tiltY), blow: avg(set, (x) => x.blow),
  });

  // ---- sheet + numbers ----------------------------------------------------
  const PAD = 18, width = 1580;
  const comp = [], txt = [];
  let y = PAD;
  const line = (t, size, fill) => {
    size = size || 13;
    comp.push({ input: label(t, width - PAD * 2, size, fill || '#c9d1d9'), left: PAD, top: y });
    y += size + 7; txt.push(t);
  };
  const HEAD = '   set / slot          canvasL    intL    B/R    G/R     sd  micro8  microF  sat%   tiltX   tiltY   BLOW%';
  const rowOf = (id, s) => '   ' + id.padEnd(18) + f1(s.lum).padStart(7) + f1(s.intLum).padStart(8) +
    f2(s.br).padStart(7) + f2(s.gr).padStart(7) + f1(s.sd).padStart(7) + f2(s.micro).padStart(8) +
    f2(s.microFull).padStart(8) + (s.sat * 100).toFixed(0).padStart(6) + f1(s.tiltX).padStart(8) +
    f1(s.tiltY).padStart(8) + (s.blow * 100).toFixed(2).padStart(8);

  line('TUNDRA -- THE FOUR-SLOT SET BUILT FROM THE W082 HERO.  STYLE TEST, nothing written to src/assets/tiles/ by this script.', 17, '#e6edf3');
  line('all numbers measured on the WRITTEN .webp, ' + new Date().toISOString().slice(0, 16) +
    '.  Hero = ladder/tundra_W082_0.webp (frozen). Variants 1-3 = flux-pro/kontext "' + PROMPT + '", no negatives.', 13, '#8b949e');
  line('Slots 2/3 flopped as in the shipped set, so their tiltX sign flips -- the light stays in the same place, the pattern mirrors.', 13, '#8b949e');
  y += 6;
  line('CHECK 1 -- LIGHTING DIRECTION ACROSS THE SLOTS.  The slots are drawn at random next to each other, so an unequal light direction IS the tile grid made visible.', 13, '#ffa657');
  line('   flux left the set at tiltY 0.3 / 10.9 / 4.8 / 11.1 with slot 0 having NO top-light at all. Every slot is put back on the shipped gradient with a', 13, '#ffa657');
  line('   UNIFORM LUMA PLANE  g(x,y) = G*(1+p*nx+q*ny)  applied identically to R, G and B -- so per-pixel hue does not move and there is no local term.', 13, '#ffa657');
  line('   NOT divide-by-blur equalization: on a diamond-masked tile that lifts the thin rim against its own blurred surroundings and yellows the edge.', 13, '#ffa657');
  line('   solved plane per slot (p / q):  ' + planes.map((pl, i) => 'slot' + i + ' ' + pl.p.toFixed(3) + ' / ' + pl.q.toFixed(3)).join('   '), 13, '#8b949e');
  y += 6;
  line(HEAD, 13, '#8b949e');
  for (let n = 0; n < 4; n++) line(rowOf('SHIPPED slot ' + n, shippedStats[n]), 13, '#ff7b72');
  line(rowOf('SHIPPED |mean|', aggOf(shippedStats)), 13, '#ff7b72');
  y += 4;
  for (let n = 0; n < 4; n++) {
    line(rowOf('W082 rung slot ' + n, Object.assign({ micro: 0, microFull: 0 }, before[n])), 13, '#6e7681');
  }
  y += 4;
  for (let n = 0; n < 4; n++) line(rowOf('NEW slot ' + n + ' (' + final[n].src + ')', final[n]), 13, '#7ee787');
  line(rowOf('NEW |mean|', aggOf(final)), 13, '#7ee787');
  y += 4;
  line('   the "W082 rung" rows are the INPUT of this script (hero + the three raw kontext returns), so their tilt is the defect being corrected.', 13, '#6e7681');
  y += 6;
  line('   -- ICE neighbours, measured the same way --', 13, '#8b949e');
  for (const nb of NEIGH) line(rowOf(nb.id, nb.stats), 13, '#8b949e');
  y += 6;
  line('CHECK 2 -- EDGES.  _tundra_hero4_seam.png lays the four slots out interlocking at FULL RES; _tundra_hero4_mosaic.png does it at play scale, randomly.', 13, '#ffa657');
  line('   An interior measurement cannot see the rim, so those two panels are the actual verdict on seams, halo and patchwork.', 13, '#ffa657');
  y += 6;
  line('SEPARATION from every ICE neighbour.  A pair needs max(dB/R, dG/R) >= 0.30 for the HUE leg to carry it; dL is what is left when the hue leg goes.', 13, '#8b949e');
  const nm = aggOf(final);
  line('   neighbour         dB/R    dG/R      dL  dmicro8   hue leg', 13, '#8b949e');
  for (const nb of NEIGH) {
    const dbr = Math.abs(nm.br - nb.stats.br), dgr = Math.abs(nm.gr - nb.stats.gr);
    const dl = Math.abs(nm.lum - nb.stats.lum), dm = Math.abs(nm.micro - nb.stats.micro);
    const ok = Math.max(dbr, dgr) >= 0.30;
    line('   ' + nb.id.padEnd(16) + f2(dbr).padStart(6) + f2(dgr).padStart(8) + f1(dl).padStart(8) +
      f2(dm).padStart(9) + '   ' + (ok ? 'HOLDS' : '!! GONE -- the pair stands on level and structure alone'),
      13, ok ? '#7ee787' : '#ff7b72');
  }
  y += 6;
  line('MICRO-CONTRAST IS LOW ON PURPOSE. The tufts carried it and the tufts are gone (shipped micro8 ' + f2(aggOf(shippedStats).micro) +
    ' -> ' + f2(nm.micro) + '). ICE plasticity is to come from the prop layer, not the tile.', 13, '#8b949e');
  line('   ice_shelf is flat too (micro8 ' + f2((NEIGH.find((n) => n.id === 'ice_shelf') || { stats: { micro: 0 } }).stats.micro) +
    '), so the tundra/ice_shelf pair is carried by hue and level, not by structure -- see the separation table above.', 13, '#8b949e');
  y += 10;

  const TW = 370, TH = 185, GAP = 12, rowY = y;
  for (let n = 0; n < 4; n++) {
    const cx = PAD + n * (TW + GAP);
    comp.push({ input: label('slot ' + n + '   ' + final[n].src, TW, 14, '#c9d1d9'), left: cx, top: rowY });
    comp.push({ input: await sharp(finalBuf[n]).resize(TW, TH, { fit: 'fill' }).png().toBuffer(), left: cx, top: rowY + 22 });
    comp.push({
      input: label('L ' + f1(final[n].lum) + '  B/R ' + f2(final[n].br) + '  G/R ' + f2(final[n].gr) +
        '  tX ' + f1(final[n].tiltX) + '  tY ' + f1(final[n].tiltY), TW, 13, '#8b949e'),
      left: cx, top: rowY + 22 + TH,
    });
  }
  y = rowY + 22 + TH + 28;
  const sheet = await sharp({ create: { width, height: y + PAD, channels: 4, background: BGA } })
    .composite(comp).png().toBuffer();
  fs.writeFileSync(path.join(ST, '_tundra_hero4_sheet.png'), sheet);
  fs.writeFileSync(path.join(ST, '_tundra_hero4_numbers.txt'), txt.join('\n') + '\n');
  fs.writeFileSync(path.join(WORK, 'final_stats.json'), JSON.stringify({
    hero: heroStats, before, planes,
    final: final.map(({ png, plane, ...r }) => r),
    shipped: shippedStats, neighbours: NEIGH.map((n) => ({ id: n.id, stats: n.stats })),
  }, null, 1));
  console.log('[sheet] _tundra_hero4_sheet.png / _tundra_hero4_numbers.txt');
  console.log('\ndone -- judge the seam and mosaic panels before integrating');
})();
