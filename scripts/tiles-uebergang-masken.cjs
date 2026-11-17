/**
 * BACKSKRIPT: der biomunabhaengige Uebergangs-Maskensatz.
 *
 * Erzeugt drei Alphablaetter (sw / se / both) fuer die verrauschte Alphablende
 * an Biomgrenzen auf der Planetenoberflaeche. Die Blaetter gehen als Assets ins
 * Bundle; zur LAUFZEIT wird nichts gerechnet (PLAN_uebergaenge_umsetzung 3.4).
 *
 *   node scripts/tiles-uebergang-masken.cjs            # backen + messen
 *   node scripts/tiles-uebergang-masken.cjs --measure  # nur messen, nichts schreiben
 *
 * -- Die Geometrie, und warum das Blatt so geschnitten ist -------------------
 *
 * Zellmittelpunkte liegen auf dem Iso-Gitter  u = (hw, hh)  [gx+1]
 *                                             v = (-hw, hh) [gy+1].
 * Die Bounding-Box einer Zelle (gx,gy) liegt in Bildschirmkoordinaten bei
 *   X = (gx - gy - 1) * cw/2 ,  Y = (gx + gy - 1) * ch/2
 * (cw/ch = Zellaufloesung des Blattes). Beide Indizes laufen also in HALBEN
 * Zellen, und sie haben immer dieselbe Paritaet.
 *
 * Damit die Alphakurve ueber die Kachelgrenze STETIG ist, muss das Fenster
 * einer Zelle genau dort im Blatt liegen, wo die Zelle in der Welt liegt --
 * also bei (X mod Wp, Y mod Hp). Ein Schnitt in ganze cw x ch Fenster
 * ("Zelle (gx,gy) zieht Fenster (gx mod P, gy mod P)") waere um eine halbe
 * Zelle daneben und risse die Kurve an JEDER Zellkante auf. Die Feststellung
 * dahinter -- kohaerentes Modulo statt Hash -- bleibt; nur der Versatz ist ein
 * halber Schritt, nicht ein ganzer.
 *
 * Das Rauschfeld ist periodisch auf dem Gitter, das torusNoise(Wp,Hp) von sich
 * aus liefert:  g1 = (Wp, 0)  und  g2 = (Wp/2, Hp)  mit  Wp = P*cw, Hp = P*ch.
 * Das ist ein VERSETZTES Gitter ("Backstein"), kein Rechteck -- und genau
 * deshalb ist es das bessere: entlang einer Grenzkette laeuft die Zelle je
 * Schritt um (cw/2, ch/2), und der kleinste k mit k*(cw/2,ch/2) im Gitter ist
 * k = 4P = 32 Zellen. Mit einer rein rechteckigen Periode (Wp,0),(0,Hp) waeren
 * es 2P = 16, und mit dem naheliegenden "Fenster (gx mod P, gy mod P)" nur P.
 * Gleiche Bytes, viermal so weit bis zur Wiederholung. Preis: der Index muss
 * beim Ueberlauf in y um Wp/2 in x mitwandern (eine Zeile Arithmetik).
 *
 * Rechts und unten kommt ein halbes Zellfenster Rand dazu (padX/padY): der
 * Fensterursprung laeuft in Schritten von cw/2, das letzte Fenster jeder Achse
 * liefe sonst ueber den Blattrand hinaus und muesste zur Laufzeit in zwei
 * drawImage-Aufrufe zerfallen.
 *
 * -- Und was hier NICHT variiert --------------------------------------------
 * Alle drei Blaetter benutzen DASSELBE Rauschen. Nur die Rampe unterscheidet
 * sie. Sonst risse die Kurve an jedem Wechsel der Kantenkonfiguration auf --
 * eine Ecke der Biomgrenze ist genau so eine Stelle.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);
const { torusNoise } = require('./lib-corrode.cjs');

// -- Parameter --------------------------------------------------------------
const P = 8; // Periode in Zellen je Achse (PLAN 3.4: P <= 8, Flaeche ~ P^2)
const CW = 128; // Zellaufloesung, gedeckelt (PLAN 3.4: 512x256 waeren 96 MB)
const CH = 64;
const RAMP = 0.95; // Rampenbreite, Anteil der halben Rautenbreite
const AMP = 1.3; // Rauschamplitude -- beide Werte aus dem Vergleichsbogen
const SEED = 4242;
const CFGS = ['sw', 'se', 'both'];
const OUT_DIR = path.join(__dirname, '..', 'src', 'assets', 'masks');

const Wp = P * CW;
const Hp = P * CH;
const padX = CW / 2;
const padY = CH / 2;
const SHEET_W = Wp + padX;
const SHEET_H = Hp + padY;

// -- Blattindex: Weltposition -> Blattpixel ---------------------------------
const mod = (v, m) => ((v % m) + m) % m;

/**
 * Reduktion einer Weltposition (in Blattpixeln) auf das Gitter g1 = (Wp,0),
 * g2 = (Wp/2, Hp). DIESELBE Arithmetik steht zur Laufzeit in
 * src/views/grid/biomeTransition.ts -- wer eine aendert, muss die andere
 * mitziehen, sonst zeigt das Blatt an der falschen Stelle hin.
 */
function reduceToSheet(X, Y) {
  const b = Math.floor(Y / Hp);
  return { sx: mod(X - (Wp / 2) * b, Wp), sy: Y - b * Hp };
}

// -- Rauschfeld -------------------------------------------------------------
/** Ein Wellenlaengenband als Feld ueber das gepolsterte Blatt. */
function bandField(lamMin, lamMax, nWaves, seed) {
  const base = torusNoise(Wp, Hp, lamMin, lamMax, nWaves, seed);
  const out = new Float32Array(SHEET_W * SHEET_H);
  for (let y = 0; y < SHEET_H; y++) {
    const o = y * SHEET_W;
    for (let x = 0; x < SHEET_W; x++) {
      const { sx, sy } = reduceToSheet(x, y);
      out[o + x] = base[sy * Wp + sx];
    }
  }
  return out;
}

// 4x4 Bayer. Die Periode 4 teilt cw/2 und ch/2 -- die Dither-Phase ist damit
// ueber Zellgrenzen hinweg dieselbe und erzeugt selbst keine Naht.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Rampenkoordinate, in das Band (-1,1] der ENTHALTENDEN Zelle gefaltet. */
function fold(v) {
  return ((((v + 1) % 2) + 2) % 2) - 1;
}

/** Ein Blatt: RGB = 255 (LESSONS 3 -- destination-in liest NUR Alpha). */
function buildSheet(cfg, n1, n2) {
  const buf = Buffer.alloc(SHEET_W * SHEET_H * 4, 255);
  const hw = CW / 2;
  const hh = CH / 2;
  for (let y = 0; y < SHEET_H; y++) {
    for (let x = 0; x < SHEET_W; x++) {
      // Beide Rampenkoordinaten sind GLOBALE affine Funktionen des Orts:
      //   u = -(x-Cx)/hw + (y-Cy)/hh  =  -x/hw + y/hh - 2n
      //   w =  (x-Cx)/hw + (y-Cy)/hh  =   x/hw + y/hh - 2m
      // Der Zellindex steckt nur als GERADER Versatz drin. Wer u statt dessen
      // aus (x % CW, y % CH) rechnet, bekommt denselben Wert modulo 2 -- aber
      // nicht in (-1,1] gefaltet, und die Rampe saettigt ausserhalb: 1.4 laese
      // sich als "voll uebergeblendet", wo -0.6 "gar nicht" heisst. Genau eine
      // der bis zu vier Zellen, deren Bounding-Box ein Pixel ueberdeckt, hat
      // es in ihrer RAUTE, und die Faltung waehlt sie.
      const u = fold(-(x + 0.5) / hw + (y + 0.5) / hh);
      const w = fold((x + 0.5) / hw + (y + 0.5) / hh);
      // NACH UNTEN NICHT GEKLEMMT. Jenseits des Rampenfusses (u < 1 - RAMP)
      // waere ein geklemmtes r exakt 0 -- und damit ohne jede Reserve gegen das
      // additive Rauschen: torusNoise ist auf sd = 1 normiert, aber UNBESCHRAENKT,
      // und ein Ausreisser von 2-3 sd trug die Blende bis an die GEGENUEBER-
      // liegende Rautenkante. Dort mischt die Nachbarzelle nicht -> harter
      // Schnitt exakt auf der Zellkante (gemessen: Alpha-Mittel 32.5 auf der
      // NE-Kante, 31 % der Kantenpixel ueber 32, Spitze 254).
      // Negativ zugelassen betraegt r an der NE-Kante -1.105; das Rauschen
      // muesste 3.4 sd erreichen, um durchzubrechen. Innerhalb der Rampe
      // (r > 0) ist der Wert unveraendert -- es faellt nur der Ueberlauf weg.
      // v wird unten ohnehin auf [0,1] geklemmt.
      const rSW = Math.min(1, 1 - (1 - u) / RAMP);
      const rSE = Math.min(1, 1 - (1 - w) / RAMP);
      const r = cfg === 'sw' ? rSW : cfg === 'se' ? rSE : Math.max(rSW, rSE);
      const p = y * SHEET_W + x;
      const n = Math.max(n1[p] * 0.5, n2[p] * 0.28); // MAXIMUM, nicht Summe
      const v = Math.max(0, Math.min(1, r + AMP * n * 0.5));
      const s = v * v * (3 - 2 * v); // S-Kurve
      // Alpha-Dither +/-1 Stufe gegen Baenderung beim Hochskalieren (PLAN 3.4)
      const d = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;
      buf[p * 4 + 3] = Math.max(0, Math.min(255, Math.round(255 * s + d)));
    }
  }
  return buf;
}

// -- Messung: Autokorrelation der Grenzlinie --------------------------------
/**
 * Tiefe der Alpha-0.5-Kontur entlang einer SW-Grenzkette, in Zellschritten
 * abgetastet, dann Autokorrelation ueber den Versatz in Zellen. Die
 * Zellgleichheit taugt hier nicht (PLAN 3.4: von der Rampengeometrie
 * gesaettigt) -- die Wiederholung zeigt sich in DIESER Kurve.
 */
function contourAutocorr(alpha, samplesPerCell, cells, maxLag) {
  const at = (x, y) => {
    const { sx, sy } = reduceToSheet(Math.round(x), Math.round(y));
    return alpha[sy * SHEET_W + sx] / 255;
  };
  // SW-Kante der Zelle (m,0): Richtung (cw/2, ch/2) je Zelle. Einwaerts
  // (u faellt) laeuft (1/hw, -1/hh), normiert.
  const hw = CW / 2;
  const hh = CH / 2;
  const gl = Math.hypot(1 / hw, 1 / hh);
  const inx = 1 / hw / gl;
  const iny = -1 / hh / gl;
  const depth = new Float64Array(cells * samplesPerCell);
  for (let i = 0; i < depth.length; i++) {
    const t = i / samplesPerCell; // Position entlang der Kette, in Zellen
    // Kantenlinie u = 1 fuer n = 0:  y = hh + x/2
    const bx = t * hw;
    const by = hh + t * hh;
    // Erst ab 1 px einwaerts: der Punkt AUF der Linie u = 1 gehoert bereits
    // zur Nachbarzelle (die Faltung schlaegt dort auf -1 um).
    let d = 1;
    for (let step = 2; step < 200; step++) {
      const dist = step * 0.5;
      d = dist;
      if (at(bx + inx * dist, by + iny * dist) < 0.5) break;
    }
    depth[i] = d;
  }
  let mu = 0;
  for (const v of depth) mu += v;
  mu /= depth.length;
  const dev = Float64Array.from(depth, v => v - mu);
  let v0 = 0;
  for (const v of dev) v0 += v * v;
  const acf = [];
  for (let lag = 1; lag <= maxLag; lag++) {
    const k = lag * samplesPerCell;
    let s = 0;
    for (let i = 0; i + k < dev.length; i++) s += dev[i] * dev[i + k];
    acf.push(s / (v0 * (1 - k / dev.length)));
  }
  return { acf, sd: Math.sqrt(v0 / dev.length), mean: mu };
}

/**
 * DER Selbsttest fuer den Index. Die Bounding-Boxen benachbarter Zellen
 * ueberlappen sich zu einem Viertel. Genau dort muss dasselbe Blattpixel
 * herauskommen -- sonst ist das Feld nicht global, und die Alphakurve springt
 * an der Zellkante. Prueft SE- und SW-Nachbarn, ueber einen Bereich, der die
 * Gitterreduktion mehrfach umlaeuft (negative Koordinaten eingeschlossen).
 */
function overlapCheck(alpha) {
  const hwS = CW / 2;
  const hhS = CH / 2;
  const win = (gx, gy) =>
    reduceToSheet((gx - gy - 1) * hwS, (gx + gy - 1) * hhS);
  const px = (w, ox, oy) => alpha[(w.sy + oy) * SHEET_W + (w.sx + ox)];
  let worst = 0;
  let checked = 0;
  for (let gy = -37; gy <= 37; gy++) {
    for (let gx = -37; gx <= 37; gx++) {
      const a = win(gx, gy);
      // SE-Nachbar (gx+1, gy): A unten-rechts == B oben-links
      const se = win(gx + 1, gy);
      // SW-Nachbar (gx, gy+1): A unten-links == C oben-rechts
      const sw = win(gx, gy + 1);
      for (let oy = 0; oy < hhS; oy += 7) {
        for (let ox = 0; ox < hwS; ox += 7) {
          worst = Math.max(
            worst,
            Math.abs(px(a, hwS + ox, hhS + oy) - px(se, ox, oy)),
            Math.abs(px(a, ox, hhS + oy) - px(sw, hwS + ox, oy)),
          );
          checked += 2;
        }
      }
    }
  }
  return { worst, checked };
}

/**
 * Stetigkeit an den beiden Umlaufkanten des Blattes, gegen den gewoehnlichen
 * Gradienten gehalten. Der Rand wird ueber reduceToSheet erzeugt, also prueft
 * das direkt, ob torusNoise auf g1/g2 wirklich periodisch ist.
 */
function seamCheck(field) {
  const diffs = [];
  let seamY = 0;
  let seamX = 0;
  for (let x = 0; x < Wp; x++) {
    seamY = Math.max(
      seamY,
      Math.abs(field[Hp * SHEET_W + x] - field[(Hp - 1) * SHEET_W + x]),
    );
  }
  for (let y = 0; y < Hp; y++) {
    seamX = Math.max(
      seamX,
      Math.abs(field[y * SHEET_W + Wp] - field[y * SHEET_W + Wp - 1]),
    );
  }
  for (let y = 0; y < Hp; y += 7) {
    for (let x = 1; x < Wp; x++) {
      diffs.push(Math.abs(field[y * SHEET_W + x] - field[y * SHEET_W + x - 1]));
    }
  }
  diffs.sort((a, b) => a - b);
  return { seamY, seamX, p999: diffs[Math.floor(diffs.length * 0.999)] };
}

async function main() {
  const measureOnly = process.argv.includes('--measure');
  console.log(
    `Maskensatz: P=${P}, Zelle ${CW}x${CH}, Blatt ${SHEET_W}x${SHEET_H} ` +
      `(${Wp}x${Hp} + ${padX}/${padY} Rand)`,
  );

  const n1 = bandField(CW * 0.55, CW * 1.6, 24, SEED);
  const n2 = bandField(CW * 0.18, CW * 0.5, 24, SEED + 977);
  const sc = seamCheck(n1);
  console.log(
    `Naht-Selbsttest (n1): Sprung am y-Umlauf ${sc.seamY.toFixed(4)}, ` +
      `x-Wrap ${sc.seamX.toFixed(4)}, p99.9 des normalen Gradienten ${sc.p999.toFixed(4)}`,
  );

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  let total = 0;
  for (const cfg of CFGS) {
    const buf = buildSheet(cfg, n1, n2);
    const img = sharp(buf, {
      raw: { width: SHEET_W, height: SHEET_H, channels: 4 },
    });
    const webp = await img
      .clone()
      // alphaQuality 100 = verlustfreier Alphakanal; RGB darf ruhig verlustbehaftet
      // sein, es ist konstant 255 und destination-in liest es nie. Spart ~12 %
      // gegen lossless, bei bewiesen unveraendertem Alpha (maxErr unten).
      .webp({ quality: 1, alphaQuality: 100, effort: 6 })
      .toBuffer();
    total += webp.length;
    const file = path.join(OUT_DIR, `transition_${cfg}.webp`);
    if (measureOnly) {
      console.log(
        `  transition_${cfg}  ${(webp.length / 1024).toFixed(0)} KB (nicht geschrieben)`,
      );
    } else {
      fs.writeFileSync(file, webp);
      // An der GESCHRIEBENEN Datei messen (LESSONS 1): Alpha muss exakt
      // zurueckkommen, sonst schneidet destination-in etwas anderes weg.
      const back = await sharp(file).ensureAlpha().raw().toBuffer();
      let maxErr = 0;
      for (let p = 0; p < SHEET_W * SHEET_H; p++) {
        maxErr = Math.max(maxErr, Math.abs(back[p * 4 + 3] - buf[p * 4 + 3]));
      }
      console.log(
        `  transition_${cfg}.webp  ${(webp.length / 1024).toFixed(0)} KB  ` +
          `Alpha-Rundlauf maxErr=${maxErr}`,
      );
    }
    if (cfg === 'sw') {
      const alpha = new Uint8Array(SHEET_W * SHEET_H);
      for (let p = 0; p < SHEET_W * SHEET_H; p++) alpha[p] = buf[p * 4 + 3];
      const oc = overlapCheck(alpha);
      console.log(
        `  Index-Selbsttest: groesste Abweichung in der Nachbarueberlappung ` +
          `${oc.worst} Alphastufen (${oc.checked} Proben)`,
      );
      const { acf, sd, mean } = contourAutocorr(alpha, 16, 240, 4 * P + 2);
      console.log(
        `  Konturtiefe entlang der Grenze: Mittel ${mean.toFixed(1)} px, sd ${sd.toFixed(1)} px`,
      );
      const peaks = acf
        .map((v, i) => ({ lag: i + 1, v }))
        .filter(e => e.v > 0.3)
        .map(e => `${e.lag}:${e.v.toFixed(2)}`);
      console.log(
        `  Autokorrelation: Maximum ausserhalb der Spitzen ` +
          `${Math.max(...acf.filter((v, i) => (i + 1) % (4 * P) !== 0)).toFixed(2)}; ` +
          `Spitzen (>0.30) bei ${peaks.length ? peaks.join(', ') : '(keine)'}`,
      );
    }
  }
  const ram = SHEET_W * SHEET_H * 4 * CFGS.length;
  console.log(
    `\nSumme Bundle ${(total / 1024).toFixed(0)} KB, ` +
      `dekodiert im RAM ${(ram / 1048576).toFixed(2)} MB`,
  );
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
