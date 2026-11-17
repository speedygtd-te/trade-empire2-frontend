/**
 * Diagnose bestehender Freistellungen (Alphakanal-Forensik).
 *
 * Beantwortet fuer eine freigestellte PNG-Datei:
 *   - Ist der Alphakanal BINAER (harte 0/255 Segmentierung) oder WEICH (Matting)?
 *     -> Alpha-Histogramm: Anteil der Pixel in den Zwischenstufen 8..247.
 *   - Gibt es einen hellen/dunklen Saum an den Haaren? (Luminanz der teil-
 *     transparenten Pixel gegen die der angrenzenden opaken Pixel)
 *   - Welche FARBE hat der Saum? (mittleres RGB der teiltransparenten Pixel)
 *   - Sind Straehnen verklumpt? (Kantenlaenge / weiche Pixel pro Kantenpixel)
 *   - Matte-Bleeding: liegt unter transparenten Pixeln noch BG-Farbe?
 *
 * Ordnet die Datei ausserdem einem Charakter zu, indem sie gegen die drei
 * Originale unter assets/avatars/base/ korreliert wird (Downscale + mittlere
 * absolute Differenz innerhalb der Alpha-Maske).
 *
 * Usage: node scripts/avatars/analyze-cutout.cjs <file.png> [<file2.png> ...]
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const REPO = path.resolve(__dirname, '..', '..');
const BASE_DIR = path.join(REPO, 'assets/avatars/base');
const CHARACTERS = ['director_ashford', 'dr_vasquez', 'captain_bredvik'];

async function rawRGBA(buf, width) {
  let p = sharp(buf).ensureAlpha();
  if (width) p = p.resize(width, null, { fit: 'inside' });
  return p.raw().toBuffer({ resolveWithObject: true });
}

function bboxOf(r, t = 16) {
  const { data, info } = r;
  const { width, height, channels } = info;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] > t) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return { left, top, right, bottom, w: right - left + 1, h: bottom - top + 1, canvasW: width, canvasH: height };
}

/** Alpha-Histogramm in 8 Buckets + Kernkennzahl "Anteil weicher Pixel". */
function alphaHistogram(r) {
  const { data, info } = r;
  const c = info.channels;
  const px = info.width * info.height;
  const buckets = new Array(8).fill(0);
  let zero = 0, full = 0, soft = 0;
  for (let i = 0; i < px; i++) {
    const a = data[i * c + 3];
    buckets[Math.min(7, a >> 5)]++;
    if (a === 0) zero++;
    else if (a === 255) full++;
    if (a > 8 && a < 247) soft++;
  }
  return {
    totalPx: px,
    alpha0Pct: +(100 * zero / px).toFixed(2),
    alpha255Pct: +(100 * full / px).toFixed(2),
    softPx: soft,
    softPct: +(100 * soft / px).toFixed(4),
    buckets,
  };
}

/**
 * Kantenanalyse in der HAARPARTIE (oberste 35% der Alpha-BBox).
 * softPerEdge < ~1.5 = praktisch binaere Kante (Segmentierung).
 * Echtes Matting liegt bei Haaren typisch deutlich hoeher.
 */
function hairEdge(r, bbox) {
  const { data, info } = r;
  const { width, channels } = info;
  const y1 = bbox.top + Math.round(bbox.h * 0.35);
  let soft = 0, hardEdge = 0;
  let sSemi = [0, 0, 0], nSemi = 0, sOp = [0, 0, 0], nOp = 0;
  for (let y = bbox.top + 1; y < y1 - 1; y++) {
    for (let x = bbox.left + 1; x < bbox.right - 1; x++) {
      const o = (y * width + x) * channels;
      const a = data[o + 3];
      if (a > 8 && a < 247) soft++;
      if (a > 24 && a < 200) {
        sSemi[0] += data[o]; sSemi[1] += data[o + 1]; sSemi[2] += data[o + 2]; nSemi++;
      }
      if (a >= 247) {
        const n = [
          data[(y * width + x - 1) * channels + 3],
          data[(y * width + x + 1) * channels + 3],
          data[((y - 1) * width + x) * channels + 3],
          data[((y + 1) * width + x) * channels + 3],
        ];
        if (n.some((v) => v < 247)) {
          hardEdge++;
          sOp[0] += data[o]; sOp[1] += data[o + 1]; sOp[2] += data[o + 2]; nOp++;
        }
      }
    }
  }
  const semiRGB = nSemi ? sSemi.map((v) => Math.round(v / nSemi)) : null;
  const opRGB = nOp ? sOp.map((v) => Math.round(v / nOp)) : null;
  const lum = (c) => c ? +(0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]).toFixed(1) : null;
  return {
    softPx: soft,
    edgePx: hardEdge,
    softPerEdge: hardEdge ? +(soft / hardEdge).toFixed(3) : null,
    semiRGB, semiLum: lum(semiRGB),
    edgeOpaqueRGB: opRGB, edgeOpaqueLum: lum(opRGB),
    haloDelta: (semiRGB && opRGB) ? +(lum(semiRGB) - lum(opRGB)).toFixed(1) : null,
  };
}

/** Matte-Bleeding: welche RGB-Werte stehen unter voll transparenten Pixeln? */
function bleedUnderTransparent(r, bbox) {
  const { data, info } = r;
  const { width, channels } = info;
  let s = [0, 0, 0], n = 0, nonBlack = 0;
  const y1 = bbox.top + Math.round(bbox.h * 0.35);
  for (let y = bbox.top; y < y1; y++) {
    for (let x = bbox.left; x <= bbox.right; x++) {
      const o = (y * width + x) * channels;
      if (data[o + 3] !== 0) continue;
      s[0] += data[o]; s[1] += data[o + 1]; s[2] += data[o + 2]; n++;
      if (data[o] + data[o + 1] + data[o + 2] > 24) nonBlack++;
    }
  }
  return n ? { meanRGB: s.map((v) => Math.round(v / n)), nonBlackPct: +(100 * nonBlack / n).toFixed(1), samples: n } : null;
}

/**
 * Effektive Matte-Aufloesung. Der Alphakanal des Haarbereichs wird um Faktor k
 * heruntergerechnet und wieder hochgerechnet; bleibt der Fehler nahe 0, traegt
 * die Matte unterhalb dieser Skala KEINE Information — sie wurde also klein
 * berechnet und hochskaliert. Genau das erzeugt eine weiche, aber straehnenlose
 * Kante: der Umriss franst nicht aus, er ist nur verwaschen ("aufgesetzt").
 */
async function effectiveMatteResolution(buf, bbox) {
  const region = {
    left: bbox.left, top: bbox.top,
    width: Math.min(bbox.w, 1400), height: Math.min(Math.round(bbox.h * 0.35), 1400),
  };
  const a = await sharp(buf).ensureAlpha().extractChannel(3).extract(region)
    .raw().toBuffer({ resolveWithObject: true });
  const W = a.info.width, H = a.info.height;
  const rmse = [];
  for (const k of [2, 4, 8, 16, 32]) {
    // WICHTIG: zwei getrennte sharp-Pipelines — zwei .resize() in einer Kette
    // werden von sharp zusammengefasst (nur das letzte wirkt).
    const down = await sharp(Buffer.from(a.data), { raw: { width: W, height: H, channels: 1 } })
      .resize(Math.max(1, Math.round(W / k)), Math.max(1, Math.round(H / k)), { fit: 'fill', kernel: 'lanczos3' })
      .toColourspace('b-w').raw().toBuffer({ resolveWithObject: true });
    const small = await sharp(down.data, { raw: { width: down.info.width, height: down.info.height, channels: 1 } })
      .resize(W, H, { fit: 'fill', kernel: 'lanczos3' })
      .toColourspace('b-w').raw().toBuffer();
    let s = 0;
    for (let i = 0; i < W * H; i++) { const d = a.data[i] - small[i]; s += d * d; }
    rmse.push({ k, rmse: +Math.sqrt(s / (W * H)).toFixed(2) });
  }
  return { region: `${W}x${H}`, rmse };
}

/**
 * Straehnigkeit: Anteil der teiltransparenten Pixel, die NICHT Teil eines
 * monotonen Randverlaufs sind, sondern isoliert im transparenten Bereich liegen
 * (mind. 2 voll transparente Nachbarn). Echte Haarstraehnen erzeugen viele
 * solcher Pixel; eine verwaschene Blob-Kante fast keine.
 */
function strandiness(r, bbox) {
  const { data, info } = r;
  const { width, channels } = info;
  const y1 = bbox.top + Math.round(bbox.h * 0.35);
  let semi = 0, filament = 0;
  for (let y = bbox.top + 1; y < y1 - 1; y++) {
    for (let x = bbox.left + 1; x < bbox.right - 1; x++) {
      const a = data[(y * width + x) * channels + 3];
      if (a <= 24 || a >= 200) continue;
      semi++;
      const n = [
        data[(y * width + x - 1) * channels + 3],
        data[(y * width + x + 1) * channels + 3],
        data[((y - 1) * width + x) * channels + 3],
        data[((y + 1) * width + x) * channels + 3],
      ];
      if (n.filter((v) => v <= 8).length >= 2) filament++;
    }
  }
  return { semiPx: semi, filamentPx: filament, filamentPct: semi ? +(100 * filament / semi).toFixed(2) : null };
}

/** Zuordnung zu einem Charakter: mittlere abs. Differenz innerhalb der Maske. */
async function matchCharacter(buf) {
  const W = 192;
  const cut = await rawRGBA(buf, W);
  const scores = [];
  for (const id of CHARACTERS) {
    const p = path.join(BASE_DIR, `${id}.png`);
    if (!fs.existsSync(p)) continue;
    const orig = await rawRGBA(fs.readFileSync(p), W);
    const h = Math.min(cut.info.height, orig.info.height);
    let sum = 0, cnt = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const oc = i * cut.info.channels, oo = i * orig.info.channels;
        if (cut.data[oc + 3] < 250) continue;
        sum += (Math.abs(cut.data[oc] - orig.data[oo])
          + Math.abs(cut.data[oc + 1] - orig.data[oo + 1])
          + Math.abs(cut.data[oc + 2] - orig.data[oo + 2])) / 3;
        cnt++;
      }
    }
    scores.push({ id, meanAbsDiff: cnt ? +(sum / cnt).toFixed(2) : 999, px: cnt });
  }
  scores.sort((a, b) => a.meanAbsDiff - b.meanAbsDiff);
  return scores;
}

/** Vollstaendiger Kanten-Befund fuer einen freigestellten PNG-Buffer. */
async function analyseBuffer(buf, label) {
  const meta = await sharp(buf).metadata();
  const r = await rawRGBA(buf);
  const bbox = bboxOf(r);
  return {
    label,
    size: `${meta.width}x${meta.height}`,
    hasAlpha: !!meta.hasAlpha,
    bbox: { left: bbox.left, top: bbox.top, w: bbox.w, h: bbox.h },
    alpha: alphaHistogram(r),
    hairEdge: hairEdge(r, bbox),
    strandiness: strandiness(r, bbox),
    matteResolution: await effectiveMatteResolution(buf, bbox),
    bleed: bleedUnderTransparent(r, bbox),
  };
}

module.exports = {
  rawRGBA, bboxOf, alphaHistogram, hairEdge, strandiness,
  effectiveMatteResolution, bleedUnderTransparent, matchCharacter, analyseBuffer,
};

if (require.main === module) {
  (async () => {
    const files = process.argv.slice(2);
    const out = [];
    for (const f of files) {
      const p = path.resolve(REPO, f);
      const buf = fs.readFileSync(p);
      const res = await analyseBuffer(buf, path.relative(REPO, p));
      res.file = path.relative(REPO, p);
      res.match = await matchCharacter(buf);
      out.push(res);
      console.log(JSON.stringify(res, null, 2));
    }
    fs.writeFileSync(path.join(REPO, 'assets/avatars/transparent/diagnosis.json'), JSON.stringify(out, null, 2));
  })();
}
