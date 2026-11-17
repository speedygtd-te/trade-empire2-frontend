/**
 * Baut einen Kontaktbogen fuer die dock_large-Reihe: setzt eine Sequenz von
 * Sprite-Dateien (494x494, gemeinsame Ankerkonvention) am renderer-exakten
 * Kachelversatz zusammen. Versatz aus isoConstants.ts: TW=48,TH=24, Nachbar
 * posY+1 -> Bildschirm (-24,+12). Skala dieser Assets: 494 Autoren-px / 48
 * Zeichen-px, also 1 Kachelschritt = (-24*494/48, 12*494/48) = (-247, 124)
 * Autoren-px. Reihenfolge: jedes weitere Stueck ueberdeckt (Painter's
 * Algorithm, posX+posY waechst die Reihe entlang).
 *
 * Usage: node scripts/_dl_contact_sheet.cjs --out assets/style-test/tiles/dock_large_2piece.png --seq start_0,end_0
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const DIR_FINAL = path.join(ROOT, 'assets', 'final');
const argOf = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = argOf('--out');
const SEQ = argOf('--seq').split(',');
const STEP = [-247, 124];
const CANVAS = 494;

(async () => {
  const n = SEQ.length;
  const W = CANVAS + Math.abs(STEP[0]) * (n - 1);
  const H = CANVAS + Math.abs(STEP[1]) * (n - 1);
  // Ursprung: erstes Stueck oben rechts (da Versatz nach unten links).
  const originX = Math.abs(STEP[0]) * (n - 1);
  const originY = 0;
  const composites = [];
  for (let i = 0; i < n; i++) {
    const file = path.join(DIR_FINAL, `dock_large_${SEQ[i]}.png`);
    if (!fs.existsSync(file)) { console.error(`Fehlt: ${file}`); process.exit(1); }
    const left = Math.round(originX + STEP[0] * i);
    const top = Math.round(originY + STEP[1] * i);
    composites.push({ input: file, left, top });
    console.log(`  [${i}] ${SEQ[i]} @ (${left},${top})`);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 12, g: 16, b: 24, alpha: 255 } } })
    .composite(composites)
    .png()
    .toFile(OUT);
  console.log(`[contact-sheet] ${OUT} (${W}x${H}, ${n} Stuecke)`);
})().catch(e => { console.error(String(e)); process.exit(1); });
