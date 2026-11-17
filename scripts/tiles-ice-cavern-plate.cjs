/**
 * ICE_CAVERN, SLOT 2 UND 3 -- DIE RANDLOSE PLATTE UND DREI SAETZE.
 *
 * WARUM UEBERHAUPT flux
 *   crystal_field hat nur ZWEI eigenstaendige Anordnungen: {0,2,3} teilen sich
 *   Rissgrund und Kristallpositionen (ein Drilling, sie unterscheiden sich fast
 *   nur in der Kristallfarbe), {1} ist der Einzelgaenger. Slot 0 und 1 von
 *   ice_cavern kommen daher per Gitterversatz aus diesen beiden. Fuer Slot 2
 *   und 3 gibt es nichts mehr zu verschieben, was nicht schon dieselbe
 *   Anordnung waere -- die muessen aus einer neuen Quelle kommen.
 *
 * WARUM EINE PLATTE UND NICHT DIE KACHEL (LESSONS 3)
 *   flux liest die Rautenmaske als BILDRAHMEN und heftet Formen daran; im
 *   crevasse-Durchlauf kamen zwei Slots als radiale Mandalas zurueck und der
 *   Randanteil stieg von 3.2 % auf 11-25 %. Also sieht flux die Raute nie:
 *   crystal_field wird ins luekenlose Iso-Gitter gelegt, daraus ein RANDLOSES
 *   Quadrat gebombt, flux zeichnet dort hinein, und erst danach wird die Kachel
 *   ausgeschnitten und maskiert.
 *
 * WARUM DIE ZELLEN VORHER GEFLATTET WERDEN (LESSONS 3, regolith)
 *   Texture-Bombing begraebt kein Raster, dessen Zellen eine eigene
 *   Helligkeitsrampe tragen -- jeder Flicken traegt ein Stueck derselben Rampe,
 *   sie mitteln sich nicht weg, und flux quantisiert dann auf das durchkommende
 *   Schachbrett. Kennzahl: Tiefpassanteil der Platte (sd der 32-px-Blockmittel
 *   durch die Gesamt-sd). frozen_lake (funktionierte) 0.415, regolith Runde 1
 *   (scheiterte) 0.675. Wird unten gemessen und ausgewiesen.
 *
 * WARUM 768x512
 *   Das Kachelfenster ist 512x256 = ein DRITTEL der Plattenflaeche. Bei
 *   crevasse Runde 3 war es ein Achtel, und die Formen kamen zu klein an und
 *   das Korn ging verloren. Kein Hochskalieren der Rueckgabe -- nur herunter.
 *
 * DIE SAETZE FRAGEN NUR NACH GEOMETRIE
 *   Kein Farb- und kein Lichtwort: die Farbe wird ohnehin ersetzt (die
 *   Blaugrau-Leiter macht sie), und Farbwoerter haben in diesem Korpus jedes
 *   Mal den Schaden angerichtet -- "pale bluish white ice" ergab weisses
 *   Papier, "dark blue grey, dim, unlit, matte" einen Studio-Sweep. Keine
 *   Negationen: eine Negation reproduziert, was sie nennt. Jeder Satz ist eine
 *   SKOPIERTE Ersetzung -- er benennt, was bleibt, und aendert nur die
 *   Anordnung der spitzen Formen.
 *
 * Schreibt NUR nach assets/style-test/tiles/ice_cavern_fix/.
 * Usage: node scripts/tiles-ice-cavern-plate.cjs [ID ...]      FORCE=1 ueberschreibt
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const M = require('./lib-tile-metrics.cjs');
const sharp = M.sharp;
sharp.cache(false);

try {
  const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* .env optional */ }
const FAL_API_KEY = process.env.FAL_AI_API_KEY || process.env.FAL_API_KEY;
if (!FAL_API_KEY) { console.error('kein fal-Key in scripts/.env'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
const WORK = path.join(ROOT, 'assets', 'style-test', 'tiles', 'ice_cavern_fix');

const TILE_W = 512, TILE_H = 256;
const PW = 768, PH = 512;
const SEED = 20260905;
const BOMB_SEED = 4471903;

const KEEP =
  'keep this photograph as it is: the same dry cracked ground, the same fine grit and '
  + 'speckle scattered over it, the same brightness, the same lighting, the same '
  + 'straight-down aerial framing, and the ground running right out past all four edges. '
  + 'Only where a pointed cone stands up out of the ground, ';
const TAIL = ' The same aerial photograph as before, unchanged except in those pointed shapes.';

const CANDS = [
  { id: 'SHARD', label: 'shard -- jeder Kegel wird ein Buendel schmaler Splitter',
    body: 'break it into a tight bundle of several narrow slivers standing close together and '
        + 'leaning at different angles, each one about as tall as the cone was,' },
  { id: 'SLAB', label: 'slab -- jeder Kegel wird eine halb eingegrabene Platte',
    body: 'lay it down as a flat angular slab half buried in the ground, one edge lifted a '
        + 'little and the rest sunk into the surface,' },
  { id: 'HEAP', label: 'heap -- jeder Kegel wird ein niedriger Haufen kantiger Bruchstuecke',
    body: 'replace it with a low heap of angular broken pieces packed against each other, no '
        + 'taller than a fist and spread a little wider than the cone stood,' },
];
for (const c of CANDS) c.prompt = KEEP + c.body + TAIL;

// ------------------------------------------------- fal, nur die Queue-API ---
// fal.run ist von dieser Maschine aus tot (TLS-Abbruch vor dem ersten Byte),
// queue.fal.run antwortet normal: submit -> poll status -> fetch response.
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
async function runModel(model, body, tries) {
  let last = null;
  for (let k = 0; k < (tries || 3); k++) {
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

/**
 * crystal_field_0 und _1, jeweils deg-5 geflattet, as-is und geflopt, ins
 * Iso-Gitter gelegt. KEINE vertikale Spiegelung -- sie wuerde die eingebackene
 * Schattierung kippen und die Kegel zu Trichtern machen (LESSONS 4).
 * Der Hintergrund ist das EIGENMITTEL der Kacheln, nicht BGA: die Raute ist
 * gefiedert, und ueber dunklem Grund zeichnet sonst jede Kachelgrenze eine
 * dunkle Linie in die Platte.
 */
async function crystalField(rows, cols) {
  const bufs = []; let rs = 0, gs = 0, bs = 0, n = 0;
  for (const s of ['0', '1']) {
    const f = path.join(TILES, 'crystal_field', 'crystal_field_' + s + '.webp');
    const st = await M.statsOf(f);
    const r = await sharp(fs.readFileSync(f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const F = M.flatten(r.data, r.info.channels, r.info.width, r.info.height, 5, 0.45);
    const f2 = M.statsRaw(F, r.info.channels, r.info.width, r.info.height);
    rs += f2.rgb[0]; gs += f2.rgb[1]; bs += f2.rgb[2]; n++;
    console.log('[flat] crystal_field_' + s + '  tiltX ' + st.tiltX.toFixed(1) + ' -> ' + f2.tiltX.toFixed(1)
      + '   tiltY ' + st.tiltY.toFixed(1) + ' -> ' + f2.tiltY.toFixed(1)
      + '   sd ' + st.sd.toFixed(1) + ' -> ' + f2.sd.toFixed(1));
    const png = await sharp(F, { raw: { width: r.info.width, height: r.info.height, channels: r.info.channels } })
      .png().toBuffer();
    bufs.push(png, await sharp(png).flop().png().toBuffer());
  }
  const bg = { r: Math.round(rs / n), g: Math.round(gs / n), b: Math.round(bs / n), alpha: 1 };
  const rnd = M.mulberry32(77213);
  const cells = []; let mr = 0, mb = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * TILE_W + (r % 2 ? TILE_W / 2 : 0), y = (r * TILE_H) / 2;
    cells.push({ input: bufs[Math.floor(rnd() * bufs.length)], left: x, top: y });
    mr = Math.max(mr, x + TILE_W); mb = Math.max(mb, y + TILE_H);
  }
  const png = await sharp({ create: { width: mr, height: mb, channels: 4, background: bg } })
    .composite(cells).png().toBuffer();
  return { png, w: mr, h: mb, bg };
}

/**
 * Rundflicken-Bombing bei 1:1. Beide Fehler, die die crevasse-Runde-3-Platte
 * ruiniert haben, sind vermieden: die Federmaske ist RGBA (eine Einkanal-PNG
 * wird ohne Alpha kodiert, und jeder Flicken landet als hartes Rechteck), und
 * die Ebenen werden auf die Leinwand GEKLEMMT (sharp verwirft eine Ebene
 * ausserhalb statt zu clippen, das gibt Loecher). Vier opake Vollflaechen
 * zuerst, damit ein Loch arithmetisch unmoeglich ist.
 */
async function bombPlate(field, seed, W, H) {
  const rnd = M.mulberry32(seed);
  const PATCH = 460, FEATH = 70, MX = 900, MY = 620;
  const CW = W + 2 * PATCH, CH = H + 2 * PATCH;
  const BG = field.bg;
  const mask = Buffer.alloc(PATCH * PATCH * 4), R = PATCH / 2;
  for (let y = 0; y < PATCH; y++) for (let x = 0; x < PATCH; x++) {
    const d = Math.hypot(x - (PATCH - 1) / 2, y - (PATCH - 1) / 2);
    const k = Math.min(1, Math.max(0, (R - d) / FEATH));
    const i = (y * PATCH + x) * 4;
    mask[i] = 255; mask[i + 1] = 255; mask[i + 2] = 255;
    mask[i + 3] = Math.round(255 * (k * k * (3 - 2 * k)));
  }
  const maskPng = await sharp(mask, { raw: { width: PATCH, height: PATCH, channels: 4 } }).png().toBuffer();
  const layers = [];
  for (let k = 0; k < 4; k++) {
    const sx = MX + Math.floor(rnd() * (field.w - CW - 2 * MX));
    const sy = MY + Math.floor(rnd() * (field.h - CH - 2 * MY));
    let s = sharp(field.png).extract({ left: sx, top: sy, width: CW, height: CH });
    if (rnd() < 0.5) s = s.flop();
    layers.push({ input: await s.png().toBuffer(), left: 0, top: 0 });
  }
  let dropped = 0;
  for (const pass of [{ step: 112, jit: 63 }, { step: 131, jit: 74 }, { step: 154, jit: 86 }, { step: 180, jit: 101 }]) {
    for (let gy = -2; gy * pass.step < H + PATCH; gy++) for (let gx = -2; gx * pass.step < W + PATCH; gx++) {
      const sx = MX + Math.floor(rnd() * (field.w - PATCH - 2 * MX));
      const sy = MY + Math.floor(rnd() * (field.h - PATCH - 2 * MY));
      let s = sharp(field.png).extract({ left: sx, top: sy, width: PATCH, height: PATCH });
      if (rnd() < 0.5) s = s.flop();
      const patch = await s.ensureAlpha().composite([{ input: maskPng, blend: 'dest-in' }]).png().toBuffer();
      const L = Math.round(gx * pass.step + (rnd() - 0.5) * 2 * pass.jit) + PATCH;
      const T = Math.round(gy * pass.step + (rnd() - 0.5) * 2 * pass.jit) + PATCH;
      if (L + PATCH <= 0 || T + PATCH <= 0 || L >= CW || T >= CH) { dropped++; continue; }
      layers.push({ input: patch, left: Math.max(0, Math.min(CW - PATCH, L)), top: Math.max(0, Math.min(CH - PATCH, T)) });
    }
  }
  const big = await sharp({ create: { width: CW, height: CH, channels: 4, background: BG } })
    .composite(layers).png().toBuffer();
  const cut = await sharp(big).extract({ left: PATCH, top: PATCH, width: W, height: H }).png().toBuffer();
  const r = await sharp(cut).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let holes = 0;
  for (let p = 0; p < W * H; p++) if (r.data[p * r.info.channels + 3] < 250) holes++;
  console.log('[bomb] ' + layers.length + ' Ebenen (' + dropped + ' ausserhalb), Loecher ' + holes + ' px'
    + (holes ? '   <== NICHT VOLL BEDECKT' : '   (voll bedeckt)'));
  return sharp(cut).flatten({ background: BG }).png().toBuffer();
}

/** Tiefpassanteil: sd der 32-px-Blockmittel durch die Gesamt-sd */
async function lowFreq(file) {
  const r = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = r.info.channels, w = r.info.width, h = r.info.height;
  const L = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = M.L709(r.data[i * ch], r.data[i * ch + 1], r.data[i * ch + 2]);
  let m = 0; for (let i = 0; i < w * h; i++) m += L[i]; m /= w * h;
  let v = 0; for (let i = 0; i < w * h; i++) v += (L[i] - m) * (L[i] - m); v = Math.sqrt(v / (w * h));
  const B = 32, bw = Math.floor(w / B), bh = Math.floor(h / B), bm = [];
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let s = 0;
    for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) s += L[(by * B + y) * w + bx * B + x];
    bm.push(s / (B * B));
  }
  const bmm = bm.reduce((a, b) => a + b, 0) / bm.length;
  const bv = Math.sqrt(bm.reduce((a, b) => a + (b - bmm) * (b - bmm), 0) / bm.length);
  return { mean: m, sd: v, low: bv, ratio: bv / v };
}

(async () => {
  fs.mkdirSync(WORK, { recursive: true });
  const want = process.argv.slice(2);
  const FORCE = process.env.FORCE === '1';
  const plateF = path.join(WORK, 'plate.png');
  if (!fs.existsSync(plateF) || FORCE) {
    const F = await crystalField(40, 16);
    console.log('[field] crystal_field_0/_1 Iso-Gitter ' + F.w + 'x' + F.h + ' (as-is + flop, keine vertikale Spiegelung)');
    fs.writeFileSync(plateF, await bombPlate(F, BOMB_SEED, PW, PH));
    console.log('[plate] plate.png gebombt 1:1, kein Rescale  ' + PW + 'x' + PH
      + '   Fenster ' + TILE_W + 'x' + TILE_H + ' = ' + (100 * (TILE_W * TILE_H) / (PW * PH)).toFixed(0) + '% der Flaeche');
  } else console.log('[plate] plate.png vorhanden, behalten');
  const q = await lowFreq(plateF);
  console.log('       plate.png  mean ' + q.mean.toFixed(1) + '  sd ' + q.sd.toFixed(1)
    + '  Tiefpass-sd ' + q.low.toFixed(2) + '  ANTEIL ' + q.ratio.toFixed(3)
    + '   (frozen_lake, die gute: 0.415 -- regolith R1, die gescheiterte: 0.675)\n');

  const plate = fs.readFileSync(plateF);
  for (const C of CANDS) {
    if (want.length && !want.includes(C.id)) continue;
    fs.writeFileSync(path.join(WORK, C.id + '_prompt.txt'), C.prompt + '\n');
    const out = path.join(WORK, C.id + '_kraw.png');
    if (fs.existsSync(out) && !FORCE) { console.log('== ' + C.id + ' == vorhanden, uebersprungen'); continue; }
    console.log('== ' + C.id + ' ==  ' + C.label);
    const r = await runModel('fal-ai/flux-pro/kontext', {
      image_url: 'data:image/png;base64,' + plate.toString('base64'),
      prompt: C.prompt, num_images: 1, safety_tolerance: '5', seed: SEED,
    });
    const url = r.images && r.images[0] && r.images[0].url;
    if (!url) throw new Error('keine Bild-URL ' + C.id + ': ' + JSON.stringify(r).slice(0, 300));
    fs.writeFileSync(out, await download(url));
    const md = await sharp(fs.readFileSync(out)).metadata();
    console.log('   -> ' + C.id + '_kraw.png  ' + md.width + 'x' + md.height
      + (md.width !== PW || md.height !== PH ? '   (Schritt 2 skaliert HERUNTER auf ' + PW + 'x' + PH + ')' : '') + '\n');
  }
  console.log('weiter: node scripts/tiles-ice-cavern-derive.cjs');
})();
