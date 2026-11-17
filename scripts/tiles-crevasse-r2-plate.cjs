/**
 * CREVASSE ROUND 2, WEG A -- SHOW FLUX A SQUARE, NEVER THE DIAMOND.
 *
 * STYLE TEST. Writes only into assets/style-test/tiles/crevasse2/. NOTHING is
 * written to src/assets/tiles/. No cap sync, no build, no git.
 *
 * WHY THIS EXISTS
 *   Round 1 sent flux the diamond-masked tile. flux read the diamond edge as the
 *   picture frame and pinned the fissures to it: rimFis 11-25% against glacier's
 *   3.2%, two slots came back as radial mandalas, two came back unchanged, and
 *   the fold map showed black lobes at fixed positions -- a stamp. grid_play
 *   landed 12.8-26.0 against glacier's 5.79.
 *
 * WHAT CHANGES
 *   The four frozen glacier tiles are laid out in the ISO LATTICE at full res --
 *   which tiles the plane with no gaps -- and a big SQUARE is cut out of the
 *   middle of that field. There is no rim anywhere in it. flux gets that square,
 *   draws its fissures into an edge-to-edge surface, and has nothing to pin them
 *   to. The plate comes back OVERSIZE on purpose: the ladder then cuts each of
 *   the four slots a differently-offset 512x256 window out of it, so the fissures
 *   do not sit at the same place on every slot.
 *
 *   Only the plate's SHADOW is ever used downstream (luma / own p70, knee at
 *   0.72), multiplied onto the real glacier tile -- the round-1 COMPOSITE lesson.
 *   The plate's own ground is thrown away, so the crop offset costs nothing.
 *
 * Output (assets/style-test/tiles/crevasse2/)
 *   plate/glacier_plate_src.png     the square cut from the glacier iso field
 *   plate/plate_<k>_kraw.png        the raw flux return per seed
 *
 * Usage: node scripts/tiles-crevasse-r2-plate.cjs        (skips plates that exist)
 *        FORCE=1 node scripts/tiles-crevasse-r2-plate.cjs
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
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const SRCD = path.join(ST, 'crevasse', 'src');          // the round-1 frozen glacier
const WORK = path.join(ST, 'crevasse2');
const PLATE = path.join(WORK, 'plate');
const TILE_W = 512, TILE_H = 256;
const PLATE_N = 1024;                                    // the square flux sees
const BGA = { r: 0x14, g: 0x17, b: 0x1c, alpha: 1 };

const KEEP =
  'keep ALL of the existing dusty grey ice surface exactly as it is, do not regenerate ' +
  'and do not recolour the ground, keep every grain of dust, every speckle and every small ' +
  'stone that is already there, and keep the same overall brightness. ONLY ADD ';
const TAIL =
  'straight-down aerial view of a dusty grey glacier surface filling the whole frame, ' +
  'even flat lighting, matte, no vignette, no border, no frame';

/**
 * TWO PLATE SETS, and the second one exists because of what the first one showed.
 *
 * SET "wide" (scale 1) -- the square is cut 1:1 out of the glacier field, so the
 *   1024 frame is exactly two tile widths. flux answered with ONE OR TWO enormous
 *   gashes ~120 px across. 120 px on a 512 px tile is a quarter of the tile, and
 *   at play scale that is 11 screen px, not the ~2 px the brief asks for. It is
 *   kept in the ladder because it is the honest picture of what flux hands back
 *   when its frame is one tile wide: flux composes for ITS frame, always.
 *
 * SET "field" (scale 3) -- the square is cut 3072x3072 out of the glacier field
 *   and DOWNSCALED to 1024 before flux sees it, so flux's frame is six tile widths.
 *   The prompt asks for a whole field of fissures, so flux still draws at its own
 *   comfortable 40-80 px and each of those lands at 13-27 px once the shadow is
 *   scaled back up -- the width the tile actually wants. The price is that the
 *   shadow mask is upscaled 3x, so its lips are soft over ~3 px; that is a real
 *   cost of Weg A and it is visible on the sheet.
 */
const PLATE_SETS = [
  {
    id: 'wide', scale: 1, seeds: [51001, 51002, 51003],
    prompt: KEEP +
      'a few broad open crevasse fissures across this surface, roughly parallel, all slanting ' +
      'the same way, set widely apart from each other with large untouched stretches of plain ' +
      'ground between them, each fissure a wide gaping gash many times wider than a hairline ' +
      'crack, wide enough to look down into, with ragged broken lips, and the inside of every ' +
      'gash is deep flat black shadow with no colour at all. ' + TAIL,
  },
  {
    id: 'field', scale: 3, seeds: [52001, 52002, 52003],
    prompt: KEEP +
      'a whole field of long open crevasse fissures spread evenly over the entire frame from ' +
      'edge to edge, twenty or more of them, roughly parallel, all slanting the same way, in ' +
      'several offset ranks with plain untouched ground between the ranks, each fissure a long ' +
      'narrow gaping gash with ragged broken lips, and the inside of every gash is deep flat ' +
      'black shadow with no colour at all. ' + TAIL,
  },
];

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
        try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('bad json ' + raw.slice(0, 200))); }
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

/** the four frozen glacier tiles laid in the iso lattice -> a gapless plane */
async function glacierField(rows, cols) {
  const bufs = [];
  for (let n = 0; n < 4; n++) bufs.push(await sharp(fs.readFileSync(path.join(SRCD, 'glacier_' + n + '_src.webp'))).png().toBuffer());
  let seed = 20260903;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const cells = [];
  let mr = 0, mb = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * TILE_W + (r % 2 ? TILE_W / 2 : 0), y = (r * TILE_H) / 2;
    cells.push({ input: bufs[Math.floor(rnd() * 4)], left: x, top: y });
    mr = Math.max(mr, x + TILE_W); mb = Math.max(mb, y + TILE_H);
  }
  const png = await sharp({ create: { width: mr, height: mb, channels: 4, background: BGA } }).composite(cells).png().toBuffer();
  return { png: png, w: mr, h: mb };
}

(async () => {
  fs.mkdirSync(PLATE, { recursive: true });
  for (let n = 0; n < 4; n++) {
    const origin = path.join(TILES, 'glacier', 'glacier_' + n + '.webp');
    const frozen = path.join(SRCD, 'glacier_' + n + '_src.webp');
    if (!fs.existsSync(frozen)) throw new Error('round-1 frozen glacier missing: ' + frozen);
    console.log('[freeze] glacier_' + n + '  frozen copy ' +
      (fs.readFileSync(frozen).equals(fs.readFileSync(origin)) ? 'MATCHES' : 'DIFFERS FROM') + ' src/assets/tiles/glacier/');
  }

  const FIELD = await glacierField(40, 16);
  console.log('[field] glacier iso field ' + FIELD.w + 'x' + FIELD.h + '\n');

  for (const S of PLATE_SETS) {
    const region = PLATE_N * S.scale;
    const srcFile = path.join(PLATE, S.id + '_src.png');
    if (!fs.existsSync(srcFile) || process.env.FORCE === '1') {
      // cut the square out of the MIDDLE: no lattice rim anywhere inside it
      const left = Math.round(FIELD.w / 2 - region / 2), top = Math.round(FIELD.h / 2 - region / 2);
      const sq = await sharp(FIELD.png).extract({ left: left, top: top, width: region, height: region })
        .resize(PLATE_N, PLATE_N, { fit: 'fill', kernel: 'lanczos3' })
        .flatten({ background: { r: 0x14, g: 0x17, b: 0x1c } }).png().toBuffer();
      fs.writeFileSync(srcFile, sq);
      console.log('[' + S.id + '] src ' + region + 'x' + region + ' of tile pixels -> ' + PLATE_N + 'x' + PLATE_N +
        '  (flux frame = ' + (region / TILE_W).toFixed(1) + ' tile widths)');
    } else {
      console.log('[' + S.id + '] src exists, kept');
    }
    const sq = fs.readFileSync(srcFile);
    fs.writeFileSync(path.join(PLATE, S.id + '_prompt.txt'), S.prompt + '\n');
    console.log('   ' + S.prompt);
    for (let k = 0; k < S.seeds.length; k++) {
      const out = path.join(PLATE, S.id + '_' + k + '_kraw.png');
      if (fs.existsSync(out) && process.env.FORCE !== '1') { console.log('   [' + k + '] exists, skipped'); continue; }
      const r = await postJson('https://fal.run/fal-ai/flux-pro/kontext', {
        image_url: 'data:image/png;base64,' + sq.toString('base64'),
        prompt: S.prompt, num_images: 1, safety_tolerance: '5', seed: S.seeds[k],
      });
      const url = r.images && r.images[0] && r.images[0].url;
      if (!url) throw new Error('no image url, ' + S.id + ' ' + k + ': ' + JSON.stringify(r).slice(0, 300));
      fs.writeFileSync(out, await download(url));
      const md = await sharp(fs.readFileSync(out)).metadata();
      console.log('   [' + k + '] seed ' + S.seeds[k] + '  -> ' + path.basename(out) + '  ' + md.width + 'x' + md.height);
    }
    console.log('');
  }
  console.log('done -- plates in ' + PLATE);
})();
