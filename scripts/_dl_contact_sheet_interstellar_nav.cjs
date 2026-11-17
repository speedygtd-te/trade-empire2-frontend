/**
 * Kontaktbogen fuer INTERSTELLAR_NAVIGATION-Kandidaten: jede Kandidatengroesse
 * gross, dazu eine Spielgroesse-Reihe (48px Kachelbreite, TW aus isoConstants.ts)
 * neben einem Forschungslabor-Referenzmodul, damit sich Familienzugehoerigkeit
 * und Lesbarkeit auf Spielskala beurteilen lassen.
 *
 * Style-Test only. Output: assets/style-test/modules/interstellar_navigation_contact_sheet.png
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const OUT_DIR = path.join(__dirname, '..', 'assets', 'style-test', 'modules');
const CANDS = [1, 2, 3, 4, 5].map((n) => path.join(OUT_DIR, `interstellar_navigation_c${n}.png`));
const REF = path.join(OUT_DIR, '_ref_physics_lab.png');
const REF2 = path.join(OUT_DIR, '_ref_electronics_lab.png');

const BIG = 340; // large preview size
const GAME = 48; // TW from isoConstants.ts, ~ on-screen tile width
const GAME_DISPLAY = 144; // upscaled x3 for visibility (nearest-neighbour) alongside a label
const PAD = 20;
const LABEL_H = 26;

async function cellBig(file) {
  const buf = await sharp(file).resize(BIG, BIG, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return buf;
}

async function cellGame(file) {
  // Render at true 48px, then upscale x3 with nearest-neighbour so it's inspectable
  // while still showing exactly what 48px legibility looks like (via the small tile below).
  const small = await sharp(file).resize(GAME, GAME, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const big = await sharp(small).resize(GAME_DISPLAY, GAME_DISPLAY, { kernel: 'nearest' }).png().toBuffer();
  return { small, big };
}

(async () => {
  const rowW = PAD + BIG + PAD + GAME_DISPLAY + PAD + GAME_DISPLAY + PAD + GAME_DISPLAY + PAD;
  const rowH = LABEL_H + Math.max(BIG, GAME_DISPLAY) + PAD;
  const rows = CANDS.length + 1; // +1 header/reference row
  const W = rowW;
  const H = rowH * rows + PAD;

  const composites = [];
  const bg = { r: 10, g: 14, b: 20, alpha: 255 };

  // Reference row: physics_lab + electronics_lab at 48px game scale, for comparison.
  let y = PAD;
  {
    const refBig = await cellBig(REF);
    const ref1 = await cellGame(REF);
    const ref2 = await cellGame(REF2);
    composites.push({ input: refBig, left: PAD, top: y + LABEL_H });
    composites.push({ input: ref1.big, left: PAD + BIG + PAD, top: y + LABEL_H });
    composites.push({ input: ref2.big, left: PAD + BIG + PAD + GAME_DISPLAY + PAD, top: y + LABEL_H });
    const label = svgLabel('REFERENCE  physics_lab (full) | physics_lab @48px x3 | electronics_lab @48px x3', W - 2 * PAD);
    composites.push({ input: label, left: PAD, top: y });
    y += rowH;
  }

  for (let i = 0; i < CANDS.length; i++) {
    const file = CANDS[i];
    if (!fs.existsSync(file)) { console.error(`Fehlt: ${file}`); continue; }
    const big = await cellBig(file);
    const game = await cellGame(file);
    composites.push({ input: big, left: PAD, top: y + LABEL_H });
    composites.push({ input: game.big, left: PAD + BIG + PAD, top: y + LABEL_H });
    const label = svgLabel(`c${i + 1}  (seed 81010${i + 1})  —  full size | @48px x3 nearest`, W - 2 * PAD);
    composites.push({ input: label, left: PAD, top: y });
    y += rowH;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, 'interstellar_navigation_contact_sheet.png');
  await sharp({ create: { width: W, height: H, channels: 4, background: bg } })
    .composite(composites)
    .png()
    .toFile(outFile);
  console.log(`[contact-sheet] ${outFile} (${W}x${H})`);
})().catch((e) => { console.error(String(e)); process.exit(1); });

function svgLabel(text, width) {
  const svg = `<svg width="${width}" height="${LABEL_H}" xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="18" font-family="monospace" font-size="16" fill="#e5e5e5">${escapeXml(text)}</text>
  </svg>`;
  return Buffer.from(svg);
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
