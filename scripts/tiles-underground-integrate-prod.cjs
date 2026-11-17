/**
 * PRODUKTION: die vier UNDERGROUND-Biome nach src/assets/tiles/.
 *
 * Rudi hat den Bogen abgenommen ("passt fuer mich"): die Erzstaerke bleibt wie
 * gebaut (nicht die o1-Sprosse der Leiter), die Trennung rock_layer x
 * mineral_vein auf Spielskala ist akzeptiert, und bei ice_cavern gilt der
 * Vorschlagssatz p56L1-b1. Damit ist UNDERGROUND geschlossen und der Korpus
 * vollstaendig -- 55 von 55.
 *
 * QUELLEN (alle aus assets/style-test/tiles/, nichts wird hier neu berechnet)
 *   rock_layer     _underground_rock_layer_s{0..3}.webp
 *   deep_stone     _underground_deep_stone_s{0..3}.webp
 *   mineral_vein   _underground_mineral_vein_s{0..3}.webp
 *   ice_cavern     _underground_icset-p56L1-b1_s{0..3}.webp
 *
 * DIE VOLLE KACHEL WIRD BYTEWEISE KOPIERT, NICHT NEU KODIERT.
 *   Die Quelle IST schon eine webp aus derselben Kette (quality 90, effort 4,
 *   smartSubsample). Ein zweiter Encode waere eine dritte Generation auf
 *   Kacheln, deren Zahlen alle an der GESCHRIEBENEN Datei gemessen wurden --
 *   und genau diese Zahlen sollen gelten. Die Kopie wird per md5 belegt.
 *   Die drei Mips entstehen aus der DEKODIERTEN vollen Kachel, wie im ganzen
 *   uebrigen Korpus.
 *
 * KEIN FLOP AUF SLOT 2/3, und das ist eine Abweichung von der Korpuskonvention.
 *   Die Konvention (40 von 48 Biomen: Slot 2/3 sind der horizontale Flop von
 *   Slot 0/1) existiert, um einen ABGELEITETEN Slot vom Original zu trennen.
 *   Hier ist jeder Slot eigenstaendig -- eigener Rauschseed fuer das Steinfeld
 *   auf einer eigens gerollten Basis, max|NCC| unter den vier Slots 0.025 bis
 *   0.090. Es gibt nichts zu trennen. Und ein horizontaler Flop wuerde das
 *   Licht von oben-LINKS nach oben-RECHTS kippen, also genau die Konsistenz
 *   brechen, die die Spiegellichter der nassen Basis und die Steinschattierung
 *   gemeinsam tragen. dust_plain ist der dokumentierte Praezedenzfall: vier
 *   unabhaengige Slots, kein Spiegelverhaeltnis im Satz.
 *
 * DIE MIPS WERDEN ZURUECKGELESEN.
 *   Bei boulder_field und crater war das der Schritt, der bewiesen hat, dass
 *   der Zoom nicht die alte Fassung zeigt: die ausgelieferten @half/@quarter/
 *   @eighth sind eigene Dateien, und wer nur die volle Kachel ersetzt, hat im
 *   Spiel auf jeder Zoomstufe ausser der obersten noch das alte Bild. Geprueft
 *   wird jede geschriebene Mip gegen (a) eine frische Verkleinerung der NEUEN
 *   Kachel -- muss ~1.000 sein -- und (b) gegen dieselbe Verkleinerung der
 *   ALTEN Kachel aus git HEAD -- muss deutlich darunter liegen. Beides wird
 *   ausgewiesen, webp und png getrennt.
 *
 * Schreibt NUR in die vier Zielordner. Kein Build, kein cap sync, kein Commit.
 * Usage: node scripts/tiles-underground-integrate-prod.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const ST = path.join(ROOT, 'assets', 'style-test', 'tiles');
const TILES = path.join(ROOT, 'src', 'assets', 'tiles');

const SRC = {
  rock_layer: (i) => path.join(ST, '_underground_rock_layer_s' + i + '.webp'),
  deep_stone: (i) => path.join(ST, '_underground_deep_stone_s' + i + '.webp'),
  mineral_vein: (i) => path.join(ST, '_underground_mineral_vein_s' + i + '.webp'),
  ice_cavern: (i) => path.join(ST, '_underground_icset-p56L1-b1_s' + i + '.webp'),
};
const BIOMES = Object.keys(SRC);
const MIPS = [
  { suffix: '@half', w: 256, h: 128 },
  { suffix: '@quarter', w: 128, h: 64 },
  { suffix: '@eighth', w: 64, h: 32 },
];
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : 'NaN');

/** normierte Kreuzkorrelation zweier gleich grosser Bilder, nur opake Pixel */
async function ncc(a, b) {
  const ra = await sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rb = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (ra.info.width !== rb.info.width || ra.info.height !== rb.info.height) return NaN;
  const n = ra.info.width * ra.info.height, ca = ra.info.channels, cb = rb.info.channels;
  const L = (d, c, p) => 0.2126 * d[p * c] + 0.7152 * d[p * c + 1] + 0.0722 * d[p * c + 2];
  let sa = 0, sb = 0, k = 0;
  for (let p = 0; p < n; p++) {
    if (ra.data[p * ca + 3] < 250 || rb.data[p * cb + 3] < 250) continue;
    sa += L(ra.data, ca, p); sb += L(rb.data, cb, p); k++;
  }
  if (!k) return NaN;
  sa /= k; sb /= k;
  let num = 0, da = 0, db = 0;
  for (let p = 0; p < n; p++) {
    if (ra.data[p * ca + 3] < 250 || rb.data[p * cb + 3] < 250) continue;
    const x = L(ra.data, ca, p) - sa, y = L(rb.data, cb, p) - sb;
    num += x * y; da += x * x; db += y * y;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : NaN;
}

(async () => {
  // ---- die ALTEN vollen Kacheln aus git HEAD holen, bevor irgendwas faellt
  const old = {};
  for (const b of BIOMES) {
    old[b] = [];
    for (let i = 0; i < 4; i++) {
      const rel = 'src/assets/tiles/' + b + '/' + b + '_' + i + '.webp';
      old[b].push(execFileSync('git', ['show', 'HEAD:' + rel], { cwd: ROOT, maxBuffer: 1 << 26 }));
    }
  }
  console.log('[git] die 16 alten Kacheln aus HEAD gelesen (Referenz fuer den Mip-Beweis)');

  // ---- kein anderer Biomordner darf sich bewegen
  const others = fs.readdirSync(TILES)
    .filter((d) => !BIOMES.includes(d) && fs.statSync(path.join(TILES, d)).isDirectory());
  const snapOf = () => others.map((d) => d + ':'
    + fs.readdirSync(path.join(TILES, d)).sort().map((f) => md5(path.join(TILES, d, f))).join(''));
  const snap = snapOf();

  const report = [];
  for (const b of BIOMES) {
    const dst = path.join(TILES, b);
    for (let i = 0; i < 4; i++) {
      const src = SRC[b](i);
      if (!fs.existsSync(src)) throw new Error('Quelle fehlt: ' + src);
      const buf = fs.readFileSync(src);
      const meta = await sharp(buf).metadata();
      if (meta.width !== 512 || meta.height !== 256) throw new Error(src + ' ist nicht 512x256');
      if (!meta.hasAlpha) throw new Error(src + ' hat keinen Alphakanal');

      const full = path.join(dst, b + '_' + i + '.webp');
      fs.copyFileSync(src, full);
      if (md5(full) !== md5(src)) throw new Error('Kopie nicht bytegleich: ' + full);

      for (const m of MIPS) {
        const r = () => sharp(buf).resize(m.w, m.h, { fit: 'fill' });
        await r().webp(WEBP).toFile(path.join(dst, b + '_' + i + m.suffix + '.webp'));
        await r().png().toFile(path.join(dst, b + '_' + i + m.suffix + '.png'));
      }
      report.push({ b, i, src: path.basename(src) });
    }
    console.log('[done] ' + b + ' <- ' + path.basename(SRC[b](0)).replace('_s0', '_s0..3')
      + '  (volle Kachel bytegleich kopiert, 3 Mips je webp+png neu)');
  }

  // ---- Vollstaendigkeit
  for (const b of BIOMES) {
    const want = [];
    for (let i = 0; i < 4; i++) {
      want.push(b + '_' + i + '.webp');
      for (const m of MIPS) { want.push(b + '_' + i + m.suffix + '.webp'); want.push(b + '_' + i + m.suffix + '.png'); }
    }
    const have = fs.readdirSync(path.join(TILES, b));
    const missing = want.filter((f) => !have.includes(f));
    const extra = have.filter((f) => !want.includes(f));
    if (missing.length) throw new Error(b + ': fehlt nach der Integration: ' + missing.join(', '));
    console.log('[verify] ' + b + ': ' + want.length + ' Dateien vorhanden'
      + (extra.length ? ', unerwartete Extras: ' + extra.join(', ') : ', keine Extras'));
  }
  if (snap.join('|') !== snapOf().join('|')) throw new Error('ein anderer Biomordner hat sich GEAENDERT -- Abbruch');
  console.log('[verify] die anderen ' + others.length + ' Biomordner sind unberuehrt (md5 identisch)');

  // ---- DER MIP-BEWEIS
  console.log('\n=== MIP-RUECKLESUNG: zeigt der Zoom die NEUE Fassung? ===');
  console.log('Biom            Slot  Mip        NCC gegen NEU   NCC gegen ALT   Urteil');
  let worstNew = 1, bestOld = 0;
  for (const b of BIOMES) {
    for (let i = 0; i < 4; i++) {
      const full = fs.readFileSync(path.join(TILES, b, b + '_' + i + '.webp'));
      for (const m of MIPS) {
        // Die Referenz muss durch DENSELBEN Encoder wie die Datei, sonst misst
        // man den Encoder statt den Inhalt: eine 64x32-webp gegen ihre eigene
        // PNG-Verkleinerung liegt bei 0.96, ohne dass etwas falsch waere.
        for (const ext of ['webp', 'png']) {
          const enc = (s) => (ext === 'webp' ? s.webp(WEBP) : s.png()).toBuffer();
          const refNew = await enc(sharp(full).resize(m.w, m.h, { fit: 'fill' }));
          const refOld = await enc(sharp(old[b][i]).resize(m.w, m.h, { fit: 'fill' }));
          const file = fs.readFileSync(path.join(TILES, b, b + '_' + i + m.suffix + '.' + ext));
          const nNew = await ncc(file, refNew), nOld = await ncc(file, refOld);
          worstNew = Math.min(worstNew, nNew); bestOld = Math.max(bestOld, Math.abs(nOld));
          console.log('  ' + b.padEnd(14) + i + '   ' + (m.suffix + '.' + ext).padEnd(14)
            + f3(nNew).padStart(9) + f3(nOld).padStart(16)
            + '   ' + (nNew > 0.999 && Math.abs(nOld) < 0.6 ? 'NEU' : '*** PRUEFEN ***'));
        }
      }
    }
  }
  console.log('\nschlechtestes NCC gegen die neue Kachel: ' + f3(worstNew)
    + '   bestes NCC gegen die ALTE: ' + f3(bestOld));
  if (worstNew <= 0.999) throw new Error('eine Mip passt nicht zur neuen Kachel');
  if (bestOld >= 0.6) throw new Error('eine Mip korreliert noch stark mit der alten Kachel');
  console.log('-> alle 96 Mip-Dateien tragen die neue Fassung.');
})();
