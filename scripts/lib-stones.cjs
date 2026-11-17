/**
 * DAS STEINFELD -- prozedurale Kiesel, Kopfsteine und Erzbrocken auf dem
 * DUALEN GITTER DES ISO-TORUS, also nahtlos PER KONSTRUKTION.
 *
 * WARUM PROZEDURAL UND NICHT flux
 *   LESSONS 3/5: kontext gibt weniger Relief zurueck als die Quelle, es
 *   regeneriert statt zu addieren, und eine flux-Rueckgabe muesste ihre
 *   Kachelung erst wieder hergestellt bekommen. Bei metallic_surface hat der
 *   prozedurale Weg die Kachelung MESSBAR NICHTS gekostet (Raster 8.23 -> 8.18).
 *
 * WARUM DAS RECHTECK EXAKT PERIODISCH IST
 *   lib-corrode.torusNoise summiert Kosinusse auf dem dualen Gitter von
 *   a1 = (512,0), a2 = (256,128). Beide (512,0) und (0,256) = 2*a2 - a1 sind
 *   Gittervektoren, also ist das Feld auf dem 512x256-RECHTECK sowohl in x als
 *   auch in y periodisch. Ableitungen und Blurs duerfen daher mit einfachem
 *   Modulo-Wrap gerechnet werden -- kein Rand, kein Abschneiden.
 *
 * DIE VIER SCHRITTE
 *   1. RAUSCHEN im gewuenschten Lambda-Band, zwei Oktaven (Hauptband + ein
 *      Drittel davon, damit die Steinumrisse nicht zu Kugelblasen werden).
 *   2. EBENE HERAUSRECHNEN -- und zwar aus dem RAUSCHFELD, vor der Schwelle.
 *      LESSONS 5: bei metallic_surface legte das Korrosionsfeld eine angepasste
 *      Ebene zurueck ins Farbfeld (cbPP 0.007 -> 0.164). Die Ebene wird ueber
 *      den OPAKEN Rautenpixeln gefittet, weil genau dort gemessen wird.
 *   3. SCHWELLE auf die geforderte Deckung (Quantil), Smoothstep -> Maske M.
 *   4. HOEHENFELD H = amp * M^0.55, leicht geglaettet: steil an der Flanke,
 *      flach obendrauf -- die Form eines eingebetteten Kopfsteins.
 *
 * SCHATTIERUNG AUS DER EIGENEN ABLEITUNG, LICHT VON OBEN-LINKS
 *   Dieselbe Richtung wie die Spiegellichter der nassen Erd-Basis
 *   (lib/tiles-earth-basis-wet). Der Gewinn ist normiert, damit flacher Grund
 *   exakt 1.0 bekommt: nur die Steine bewegen sich, der Grund bleibt stehen.
 *   Dazu eine Kontaktverschattung (Blur(H) - H) in den Fugen zwischen den
 *   Steinen -- ohne sie schweben die Steine auf der Flaeche.
 *
 * DER GEWINN IST EIN SKALAR PRO PIXEL. Farbton, cbPP und cbSd bleiben
 * unberuehrt -- die Farbe kommt, wo sie gebraucht wird, aus lib-corrode.corrode.
 */
const S = require('./lib-tile-metrics.cjs');
const CO = require('./lib-corrode.cjs');
const G = require('./lib-grain.cjs');

/** exakt periodischer Box-Blur auf dem 512x256-Rechteck (Modulo-Wrap) */
function wrapBlur(F, w, h, r) {
  const T = new Float32Array(w * h), O = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += F[y * w + ((k % w) + w) % w];
    for (let x = 0; x < w; x++) {
      T[y * w + x] = s / n;
      s -= F[y * w + (((x - r) % w) + w) % w];
      s += F[y * w + (((x + r + 1) % w) + w) % w];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += T[((((k % h) + h) % h)) * w + x];
    for (let y = 0; y < h; y++) {
      O[y * w + x] = s / n;
      s -= T[(((y - r) % h + h) % h) * w + x];
      s += T[(((y + r + 1) % h + h) % h) * w + x];
    }
  }
  return O;
}

/**
 * Die angepasste Ebene ueber den OPAKEN Pixeln herausrechnen.
 * Gibt {F, gx, gy} zurueck -- gx/gy sind die Amplituden ueber die halbe Kachel,
 * also genau die Groessen, die spaeter als cbPP wieder auftauchen wuerden.
 */
function deplane(F, A, w, h) {
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  let n = 0, sf = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sfx = 0, sfy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (!A[p]) continue;
    const nx = (x - cx) / cx, ny = (y - cy) / cy, f = F[p];
    n++; sf += f; sx += nx; sy += ny; sxx += nx * nx; syy += ny * ny; sxy += nx * ny;
    sfx += f * nx; sfy += f * ny;
  }
  const A3 = [[n, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]];
  const b3 = [sf, sfx, sfy];
  let c;
  try { c = solve3(A3, b3); } catch { c = [0, 0, 0]; }
  const O = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    O[p] = F[p] - (c[1] * ((x - cx) / cx) + c[2] * ((y - cy) / cy));
  }
  return { F: O, gx: c[1], gy: c[2] };
}
function solve3(A, b) {
  const M = A.map((r, i) => r.concat([b[i]]));
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    const t = M[i]; M[i] = M[p]; M[p] = t;
    if (Math.abs(M[i][i]) < 1e-12) M[i][i] = 1e-12;
    for (let r = i + 1; r < 3; r++) {
      const f = M[r][i] / M[i][i];
      for (let k = i; k <= 3; k++) M[r][k] -= f * M[i][k];
    }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let s = M[i][3];
    for (let k = i + 1; k < 3; k++) s -= M[i][k] * x[k];
    x[i] = s / M[i][i];
  }
  return x;
}

/**
 * EIN SCHMALBANDIGES BLOB-FELD -- eine Groessenklasse Steine.
 * Ein breites Band, an einer Schwelle abgeschnitten, ergibt bei hoher Deckung
 * ein zusammenhaengendes LABYRINTH und keine Steine; das war der erste Versuch
 * dieser Runde und es sah aus wie Schlamm. Ein SCHMALES Band (+-30 % um lam)
 * bei NIEDRIGER Deckung ergibt runde Inseln -- einzelne Kiesel.
 */
function blobLayer(A, w, h, lam, cover, seed, spread) {
  const N = CO.torusNoise(w, h, lam * 0.72, lam * 1.34, 120, seed);
  const dp = deplane(N, A, w, h);
  const v = [];
  for (let p = 0; p < w * h; p++) if (A[p]) v.push(dp.F[p]);
  v.sort((a, b) => a - b);
  const mu = v.reduce((a, b) => a + b, 0) / v.length;
  let q = 0; for (const x of v) q += (x - mu) * (x - mu);
  const sd = Math.sqrt(q / v.length) || 1;
  const thr = v[Math.min(v.length - 1, Math.floor(v.length * (1 - cover)))];
  const m = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) m[p] = CO.smooth((dp.F[p] - thr) / (spread * sd) + 0.5);
  return { m, gx: dp.gx, gy: dp.gy };
}

/**
 * DAS STEINFELD als MAXIMUM ueber mehrere Groessenklassen.
 *
 * Warum max und nicht Summe: eine Summe verschmilzt zwei benachbarte Steine zu
 * einem Huegel, ein Maximum laesst zwischen ihnen eine Kerbe stehen -- und
 * genau diese Kerbe ist es, die ein Kopfsteinpflaster als EINZELNE Steine
 * lesbar macht. Grosse Steine sind hoeher als kleine (ampK ~ lam^0.6), sonst
 * liest das Feld als eine Ebene aus Punkten gleicher Hoehe.
 *
 * Die Deckung wird auf den Zielwert nachgeregelt (die Schichten ueberlappen,
 * 1-(1-c)^K trifft daher nicht).
 */
function stoneMask(A, w, h, lamMin, lamMax, cover, seed, opt) {
  const o = opt || {};
  const K = o.layers || 4;
  const spread = o.spread === undefined ? 0.38 : o.spread;
  const lams = [];
  for (let k = 0; k < K; k++) lams.push(lamMin * Math.pow(lamMax / lamMin, K === 1 ? 0 : k / (K - 1)));
  const amps = lams.map((l) => Math.pow(l / lams[K - 1], 0.6));

  let c1 = 1 - Math.pow(1 - cover, 1 / K);
  let M = null, Hn = null, cov = 0, gx = 0, gy = 0;
  let nA = 0;
  for (let p = 0; p < w * h; p++) if (A[p]) nA++;
  for (let it = 0; it < 6; it++) {
    M = new Float32Array(w * h);
    Hn = new Float32Array(w * h);
    gx = 0; gy = 0;
    for (let k = 0; k < K; k++) {
      const L = blobLayer(A, w, h, lams[k], Math.min(0.9, c1), seed + k * 9173, spread);
      gx += L.gx / K; gy += L.gy / K;
      const a = amps[k];
      for (let p = 0; p < w * h; p++) {
        if (L.m[p] > M[p]) M[p] = L.m[p];
        const hk = a * Math.pow(L.m[p], 0.55);
        if (hk > Hn[p]) Hn[p] = hk;
      }
    }
    cov = 0;
    for (let p = 0; p < w * h; p++) if (A[p] && M[p] > 0.5) cov++;
    cov /= nA;
    if (Math.abs(cov - cover) < 0.006 || it === 5) break;
    c1 *= Math.pow(cover / Math.max(1e-4, cov), 0.85);
  }
  // Restebene der MASKE messen -- LESSONS 5: bei metallic_surface legte genau
  // sie sich als cbPP 0.164 ins Farbfeld zurueck. Sie wird aus der MASKE
  // herausgerechnet, nicht aus dem Bild.
  const dm = deplane(M, A, w, h);
  let mgx = dm.gx, mgy = dm.gy;
  if (Math.abs(mgx) > 0.02 || Math.abs(mgy) > 0.02) {
    for (let p = 0; p < w * h; p++) M[p] = Math.min(1, Math.max(0, dm.F[p]));
    const d2 = deplane(M, A, w, h);
    mgx = d2.gx; mgy = d2.gy;
  }
  return { M, H: Hn, lams, cover: cov, noiseGx: gx, noiseGy: gy, maskGx: mgx, maskGy: mgy };
}

/**
 * Schattierung aus dem eigenen Hoehenfeld. Licht von OBEN-LINKS.
 * Rueckgabe: skalarer Gewinn pro Pixel, flacher Grund exakt 1.0.
 *   hAmp   Scheitelhoehe in px  (die AMPLITUDE -- LESSONS 5: bei crater kaufte
 *          der RADIUS das Relief, nicht die Tiefe. Hier ist der Radius durch
 *          das Lambda-Band gesetzt und die Amplitude ist der freie Parameter)
 *   shadeK Staerke des Lambert-Terms
 *   aoK    Kontaktverschattung in den Fugen
 */
function shadeStones(Hn, A, w, h, hAmp, shadeK, aoK, aoR) {
  const Hr = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) Hr[p] = hAmp * Hn[p];
  const H = wrapBlur(Hr, w, h, 2);
  const lv = [-1, -1, 1.4], ln = Math.hypot(lv[0], lv[1], lv[2]);
  const L = [lv[0] / ln, lv[1] / ln, lv[2] / ln];
  const amb = wrapBlur(H, w, h, aoR || 12);
  const G = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (!A[p]) { G[p] = 1; continue; }
    const xm = (x - 1 + w) % w, xp = (x + 1) % w, ym = (y - 1 + h) % h, yp = (y + 1) % h;
    const gx = (H[y * w + xp] - H[y * w + xm]) * 0.5;
    const gy = (H[yp * w + x] - H[ym * w + x]) * 0.5;
    const nz = 1 / Math.sqrt(gx * gx + gy * gy + 1);
    const nx = -gx * nz, ny = -gy * nz;
    const d = (nx * L[0] + ny * L[1] + nz * L[2]) / L[2];   // flacher Grund -> 1
    let g = 1 + shadeK * (d - 1);
    if (aoK > 0) {
      const occ = amb[p] - H[p];
      if (occ > 0) g *= 1 - aoK * Math.min(1, occ / Math.max(1e-6, hAmp * 0.5));
    }
    G[p] = g < 0.30 ? 0.30 : g > 2.0 ? 2.0 : g;
  }
  return { G, H };
}

/**
 * EIN STEIN IST NICHT NUR EINE BEULE.
 *
 * Der erste Anlauf hatte nur den Lambert-Term -- und ein Lambert-Term laesst die
 * OBERSEITE eines Steins exakt so aussehen wie den Grund daneben (dort ist die
 * Normale senkrecht, d = 1, Gewinn 1). Sichtbar waren dadurch nur Raender, und
 * die lasen als Loecher statt als Steine. Was fehlte, sind die beiden anderen
 * Unterschiede, die ein Stein gegen Erde wirklich hat:
 *
 *   ALBEDO   -- die Steinflaeche liegt auf einem anderen Pegel als der Grund.
 *               Mittelwertfrei angewandt (M minus Maskenmittel), damit p70 nicht
 *               wegdriftet und solveTile nichts nachraeumen muss.
 *   TEXTUR   -- eine Steinflaeche ist GLATT, Erde ist kruemelig. Innerhalb der
 *               Maske werden Meso- und Korn-Band der Basis gedaempft, ausserhalb
 *               bleiben sie voll stehen. Das ist derselbe Drei-Band-Split wie in
 *               lib-band.bandScale, nur ortsabhaengig.
 *
 * Beides sind SKALARE pro Pixel -- Farbton, cbPP und cbSd bleiben unberuehrt.
 */
function stoneSurface(src, ch, w, h, M, A, albK, smMeso, smFine) {
  const L = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) L[p] = S.L709(src[p * ch], src[p * ch + 1], src[p * ch + 2]);
  const b6 = G.blurOpaque(L, A, w, h, 6);
  const b16 = G.blurOpaque(L, A, w, h, 16);
  let mm = 0, n = 0;
  for (let p = 0; p < w * h; p++) if (A[p]) { mm += M[p]; n++; }
  mm /= Math.max(1, n);
  const out = Buffer.from(src);
  for (let p = 0; p < w * h; p++) {
    const i = p * ch;
    if (src[i + 3] < 1) continue;
    const m = M[p];
    const t = b16[p]
      + (b6[p] - b16[p]) * (1 - smMeso * m)
      + (L[p] - b6[p]) * (1 - smFine * m);
    const alb = 1 + albK * (m - mm);
    const k = L[p] > 1e-6 ? (t / L[p]) * alb : alb;
    for (let c = 0; c < 3; c++) {
      const v = src[i + c] * k;
      out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return out;
}

/**
 * METALLISCHER GLANZ auf den Erzbrocken -- Blinn-Phong aus dem Hoehenfeld der
 * Steine, additiv auf alle drei Kanaele (eine Spiegelung traegt die Farbe des
 * LICHTS, nicht die des Materials -- dieselbe Begruendung wie bei der nassen
 * Erd-Basis, wo ein skalarer Gewinn als oranger Punkt zurueckkam).
 * Knie auf den obersten `top` Prozent der Haenge INNERHALB der Maske, damit die
 * Lichter klein bleiben und spec1.6 nicht davonlaeuft.
 */
function oreGlint(src, ch, w, h, Hn, M, A, hAmp, strength, top, p70) {
  const Hr = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) Hr[p] = hAmp * Hn[p];
  const H = wrapBlur(Hr, w, h, 2);
  const lv = [-1, -1, 1.4], ln = Math.hypot(lv[0], lv[1], lv[2]);
  const hv = [lv[0] / ln, lv[1] / ln, lv[2] / ln + 1];
  const hn = Math.hypot(hv[0], hv[1], hv[2]);
  hv[0] /= hn; hv[1] /= hn; hv[2] /= hn;
  const SHINE = 30;
  const raw = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (!A[p] || M[p] < 0.25) continue;
    const xm = (x - 1 + w) % w, xp = (x + 1) % w, ym = (y - 1 + h) % h, yp = (y + 1) % h;
    const gx = (H[y * w + xp] - H[y * w + xm]) * 0.5;
    const gy = (H[yp * w + x] - H[ym * w + x]) * 0.5;
    const nz = 1 / Math.sqrt(gx * gx + gy * gy + 1);
    const d = (-gx * nz) * hv[0] + (-gy * nz) * hv[1] + nz * hv[2];
    raw[p] = d > 0 ? Math.pow(d, SHINE) : 0;
  }
  const v = [];
  for (let p = 0; p < w * h; p++) if (A[p] && M[p] >= 0.25) v.push(raw[p]);
  if (!v.length) return { buf: Buffer.from(src), lit: 0 };
  v.sort((a, b) => a - b);
  const knee = v[Math.min(v.length - 1, Math.floor(v.length * (1 - top)))];
  const hiq = v[Math.min(v.length - 1, Math.floor(v.length * 0.995))];
  const span = Math.max(1e-6, hiq - knee);
  const out = Buffer.from(src);
  let lit = 0;
  for (let p = 0; p < w * h; p++) {
    const i = p * ch;
    if (src[i + 3] < 1 || raw[p] <= knee) continue;
    const s = Math.min(1, (raw[p] - knee) / span) * Math.min(1, M[p]);
    if (s <= 0) continue;
    lit++;
    const add = strength * p70 * s;
    for (let c = 0; c < 3; c++) {
      const val = src[i + c] + add;
      out[i + c] = val > 255 ? 255 : Math.round(val);
    }
  }
  return { buf: out, lit: 100 * lit / (w * h) };
}

/** den skalaren Gewinn anwenden -- Farbton bleibt per Konstruktion unberuehrt */
function applyGain(src, ch, w, h, G) {
  const out = Buffer.from(src);
  for (let p = 0; p < w * h; p++) {
    const i = p * ch;
    if (src[i + 3] < 1) continue;
    for (let c = 0; c < 3; c++) {
      const v = src[i + c] * G[p];
      out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return out;
}

/** Alpha-Zensus als 0/1-Feld */
function opaqueOf(src, ch, w, h) {
  const A = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) A[p] = src[p * ch + 3] >= 250 ? 1 : 0;
  return A;
}

/** mittleres B/R und G/R getrennt fuer Maske (>0.6) und Grund (<0.4) */
function twoToneRatios(src, ch, w, h, M, A) {
  const acc = [[0, 0, 0, 0], [0, 0, 0, 0]];
  for (let p = 0; p < w * h; p++) {
    if (!A[p]) continue;
    const k = M[p] > 0.6 ? 1 : M[p] < 0.4 ? 0 : -1;
    if (k < 0) continue;
    acc[k][0] += src[p * ch]; acc[k][1] += src[p * ch + 1]; acc[k][2] += src[p * ch + 2]; acc[k][3]++;
  }
  const out = [];
  for (const a of acc) {
    out.push(a[3] ? { br: a[2] / a[0], gr: a[1] / a[0], luma: S.L709(a[0] / a[3], a[1] / a[3], a[2] / a[3]), n: a[3] } : null);
  }
  return { ground: out[0], stone: out[1] };
}

module.exports = { wrapBlur, deplane, stoneMask, shadeStones, stoneSurface, oreGlint, applyGain, opaqueOf, twoToneRatios };
