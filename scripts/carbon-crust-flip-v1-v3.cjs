// carbon-crust-flip-v1-v3.cjs
// Spiegelt (horizontal / flop, links-rechts) die fertigen carbon_crust se_v1 + se_v3
// Edit-Varianten in-place. Diamond-Geometrie ist links-rechts-symmetrisch, daher
// bleibt die Alpha-Maske nach .flop() korrekt — kein Neu-Maskieren noetig.
//
// In-place sicher: erst komplett in Buffer rendern, dann zurueckschreiben.
// Reproduzierbar, keine Zufallswerte.
//
// Working Dir = Repo-Root. Aufruf: node scripts/carbon-crust-flip-v1-v3.cjs

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const TILES_DIR = path.join(__dirname, '..', 'assets', 'style-test', 'tiles');

const FILES = [
  'carbon_crust_se_v1.png',
  'carbon_crust_se_v1_half.png',
  'carbon_crust_se_v1_mosaic.png',
  'carbon_crust_se_v3.png',
  'carbon_crust_se_v3_half.png',
  'carbon_crust_se_v3_mosaic.png',
];

async function flipOne(file) {
  const full = path.join(TILES_DIR, file);
  if (!fs.existsSync(full)) {
    throw new Error(`Datei fehlt: ${full}`);
  }

  const beforeBuf = fs.readFileSync(full);
  const beforeMeta = await sharp(beforeBuf).metadata();

  // Eckpixel vorher (oben-links vs oben-rechts) als Flip-Nachweis
  const before = await sharp(beforeBuf).raw().toBuffer({ resolveWithObject: true });
  const cornersBefore = sampleCorners(before);

  // Flop -> RGBA erzwingen -> PNG -> Buffer (vollstaendig rendern vor Rueckschrieb)
  const outBuf = await sharp(beforeBuf).flop().ensureAlpha().png().toBuffer();
  fs.writeFileSync(full, outBuf);

  const afterBuf = fs.readFileSync(full);
  const afterMeta = await sharp(afterBuf).metadata();
  const after = await sharp(afterBuf).raw().toBuffer({ resolveWithObject: true });
  const cornersAfter = sampleCorners(after);

  return {
    file,
    before: `${beforeMeta.width}x${beforeMeta.height} ch=${beforeMeta.channels} alpha=${beforeMeta.hasAlpha}`,
    after: `${afterMeta.width}x${afterMeta.height} ch=${afterMeta.channels} alpha=${afterMeta.hasAlpha}`,
    dimsOk: beforeMeta.width === afterMeta.width && beforeMeta.height === afterMeta.height,
    alphaOk: afterMeta.hasAlpha === true && afterMeta.channels === 4,
    // Nachweis: linke obere Ecke vorher == rechte obere Ecke nachher
    flipProven:
      cornersBefore.topLeft === cornersAfter.topRight &&
      cornersBefore.topRight === cornersAfter.topLeft,
    cornersBefore,
    cornersAfter,
  };
}

function sampleCorners(rawObj) {
  const { data, info } = rawObj;
  const { width, height, channels } = info;
  const px = (x, y) => {
    const i = (y * width + x) * channels;
    return Array.from(data.slice(i, i + channels)).join(',');
  };
  return {
    topLeft: px(0, 0),
    topRight: px(width - 1, 0),
    bottomLeft: px(0, height - 1),
    bottomRight: px(width - 1, height - 1),
  };
}

(async () => {
  const results = [];
  for (const f of FILES) {
    results.push(await flipOne(f));
  }
  for (const r of results) {
    console.log(`\n[${r.file}]`);
    console.log(`  vorher: ${r.before}`);
    console.log(`  nachher: ${r.after}`);
    console.log(`  dims unveraendert: ${r.dimsOk}`);
    console.log(`  RGBA/alpha ok: ${r.alphaOk}`);
    console.log(`  flip nachgewiesen (TL<->TR getauscht): ${r.flipProven}`);
    console.log(`  ecken vorher : TL=${r.cornersBefore.topLeft} | TR=${r.cornersBefore.topRight}`);
    console.log(`  ecken nachher: TL=${r.cornersAfter.topLeft} | TR=${r.cornersAfter.topRight}`);
  }

  const allOk = results.every((r) => r.dimsOk && r.alphaOk && r.flipProven);
  console.log(`\n=== ${results.length} Dateien gespiegelt. Alle Checks ok: ${allOk} ===`);
  if (!allOk) process.exit(1);
})().catch((e) => {
  console.error('FEHLER:', e.message);
  process.exit(1);
});
