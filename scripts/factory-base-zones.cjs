/**
 * Markiert in jedem Fabrik-Basis-Kandidaten die FREIE FERTIGUNGSFLAECHE.
 *
 * Stufe 4 der Basis+Montage-Pipeline setzt dort ein zweites Asset ein. Rudi
 * waehlt die Basis danach aus, wie gut sich dort etwas einsetzen laesst — also
 * braucht der Kontaktbogen neben jedem Kandidaten ein zweites Bild, in dem die
 * Flaeche eingezeichnet ist.
 *
 * Die Vierecke sind PER AUGE gesetzt (normalisiert 0..1, Reihenfolge
 * links / oben / rechts / unten der Iso-Raute) und mit dem gerenderten Ergebnis
 * gegengeprueft. Kein Bildeingriff am Asset selbst: geschrieben wird eine
 * SEPARATE Datei *_zone.png, das Original bleibt unberuehrt.
 *
 * Usage: node scripts/factory-base-zones.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const DIR_ST = path.join(ROOT, 'assets', 'style-test', 'modules');

// normalisierte Iso-Raute der freien Flaeche: [links, oben, rechts, unten]
const ZONES = {
  b1: [[0.16, 0.66], [0.55, 0.47], [0.88, 0.6], [0.5, 0.8]],
  b2: [[0.3, 0.62], [0.6, 0.43], [0.86, 0.56], [0.56, 0.76]],
  b3: [[0.1, 0.73], [0.3, 0.62], [0.55, 0.8], [0.33, 0.9]],
  b4: [[0.3, 0.76], [0.6, 0.61], [0.9, 0.75], [0.6, 0.9]],
  b5: [[0.22, 0.6], [0.52, 0.44], [0.82, 0.6], [0.52, 0.76]],
  b6: [[0.2, 0.68], [0.46, 0.54], [0.72, 0.68], [0.46, 0.82]],
  b7: [[0.22, 0.8], [0.47, 0.68], [0.72, 0.8], [0.47, 0.92]],
  b8: [[0.1, 0.55], [0.55, 0.28], [0.85, 0.45], [0.4, 0.72]],
  b9: [[0.18, 0.66], [0.5, 0.5], [0.8, 0.66], [0.5, 0.82]],
  b10: [[0.13, 0.63], [0.5, 0.42], [0.9, 0.58], [0.52, 0.8]],
  b11: [[0.24, 0.79], [0.54, 0.65], [0.84, 0.78], [0.55, 0.92]],
  b12: [[0.26, 0.77], [0.54, 0.62], [0.84, 0.75], [0.56, 0.9]],
  b13: [[0.09, 0.79], [0.28, 0.69], [0.55, 0.85], [0.35, 0.94]],
  b14: [[0.14, 0.58], [0.45, 0.43], [0.74, 0.53], [0.44, 0.68]],
  b15: [[0.25, 0.56], [0.47, 0.45], [0.7, 0.55], [0.48, 0.66]],
  b16: [[0.34, 0.82], [0.6, 0.68], [0.88, 0.78], [0.62, 0.92]],
};

(async () => {
  const out = [];
  for (const [tag, quad] of Object.entries(ZONES)) {
    const file = path.join(DIR_ST, `factory_base_${tag}.png`);
    if (!fs.existsSync(file)) {
      console.error(`missing ${file}`);
      continue;
    }
    const meta = await sharp(file).metadata();
    const w = meta.width;
    const h = meta.height;
    const pts = quad.map(([x, y]) => `${(x * w).toFixed(1)},${(y * h).toFixed(1)}`).join(' ');
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
        `<polygon points="${pts}" fill="#00e5ff" fill-opacity="0.22" ` +
        `stroke="#00e5ff" stroke-width="3" stroke-dasharray="10 7"/></svg>`,
    );
    const dst = path.join(DIR_ST, `factory_base_${tag}_zone.png`);
    await sharp(file).composite([{ input: svg, left: 0, top: 0 }]).png().toFile(dst);
    out.push({ tag, size: `${w}x${h}`, file: path.relative(ROOT, dst) });
    console.log(`[zone] ${tag} ${w}x${h} -> ${path.relative(ROOT, dst)}`);
  }
  fs.writeFileSync(
    path.join(DIR_ST, 'factory_base_zones.json'),
    JSON.stringify({ note: 'freie Fertigungsflaeche, normalisiert [l,o,r,u]', zones: ZONES, files: out }, null, 2),
  );
})();
