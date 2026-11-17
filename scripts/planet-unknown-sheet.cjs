// ═══════════════════════════════════════════
// Trade Empire — planet_unknown: contact sheet + contrast measurement.
//
// Everything here is measured on the WRITTEN, SHIPPED webp, never on a buffer
// (LESSONS § 1: libwebp does not preserve RGB under transparent pixels and
// lossy webp is always YUV 4:2:0, so a buffer measurement misses its target).
//
// GROUNDS — read out of the code, not guessed:
//   ObjectView.tsx:199   `bg-gray-950`      page ground of the planet screen
//   ObjectPlanetHeader   `bg-gray-900/60`   the card, over that page ground
//   tailwindcss 4.2.1 default theme (no tailwind.config.* in the repo, no
//   @theme override in src/index.css), so:
//     --color-gray-950  oklch(13% 0.028 261.692)  -> rgb(3, 7, 18)
//     --color-gray-900  oklch(21% 0.034 264.665)  -> rgb(16, 24, 40)
//     gray-900/60 over gray-950                   -> rgb(11, 17, 31)
//
// SIZE — the planet screen has no max-width container (ObjectView is a plain
// full-width column with p-6 = 24 CSS px padding, the header card adds p-5 =
// 20 px). On a 412-CSS-px phone the card's inner width is therefore 324 CSS px
// and a "large, centred" hero image sits between roughly 192 and 256 CSS px.
// Both are rendered here in DEVICE pixels at dpr 3 (576 and 768 px), by
// upscaling the shipped 512 px asset exactly the way the WebView will —
// not computed small and blown up (that cost the crater round a round).
// ═══════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const DIR_SHEET = path.join(ROOT, 'assets', 'style-test', 'tiles');
const SRC = path.join(ROOT, 'src', 'assets', 'planets', 'planet_unknown.webp');
const REF = path.join(DIR_SHEET, '_planet_unknown_ref_real.webp');
const PREFIX = '_planet_unknown';

const GROUNDS = {
  'gray-950 (page)': [3, 7, 18],
  'gray-900/60 over gray-950 (card)': [11, 17, 31],
};
const CSS_SIZES = [192, 256];
const DPR = 3;

const L = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// WCAG relative luminance, needed for a contrast RATIO (the eye's response is
// not linear in 8-bit luma, and at these levels that is the whole story).
const lin = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const relLum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => {
  const la = relLum(...a);
  const lb = relLum(...b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
// Composite a premultiplied-by-alpha sprite pixel over a ground.
const over = (px, a, g) => px.map((c, i) => (c * a) / 255 + (g[i] * (255 - a)) / 255);

(async () => {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const c = (w - 1) / 2;
  const meta = await sharp(SRC).metadata();

  // ── geometry on the shipped file ──
  const radii = [];
  for (let a = 0; a < 720; a++) {
    const th = (a * Math.PI) / 360;
    let r = 0;
    for (let t = 0; t < w / 2; t += 0.25) {
      const x = Math.round(c + Math.cos(th) * t);
      const y = Math.round(c + Math.sin(th) * t);
      const i = (y * w + x) * 4;
      if (data[i + 3] < 250 || L(data[i], data[i + 1], data[i + 2]) >= 18) break;
      r = t;
    }
    radii.push(r);
  }
  const rDisc = radii.reduce((a, b) => a + b, 0) / radii.length;
  const rSd = Math.sqrt(radii.reduce((a, b) => a + (b - rDisc) ** 2, 0) / radii.length);

  // ── face (the silhouette), well inside the limb ──
  let fS = [0, 0, 0];
  let fN = 0;
  let fMax = 0;
  let aMin = 255;
  // ── corona: opaque ring pixels outside the disc ──
  let cPeak = [0, 0, 0];
  let cPeakL = -1;
  let cS = [0, 0, 0];
  let cN = 0;
  const ringL = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - c, y - c);
      const i = (y * w + x) * 4;
      const px = [data[i], data[i + 1], data[i + 2]];
      const a = data[i + 3];
      if (d <= rDisc * 0.92) {
        fS = fS.map((v, k) => v + px[k]);
        fN++;
        fMax = Math.max(fMax, L(...px));
        aMin = Math.min(aMin, a);
      } else if (d > rDisc && d <= 254) {
        const l = L(...px);
        ringL.push((l * a) / 255);
        if (l > 40) {
          cS = cS.map((v, k) => v + px[k]);
          cN++;
        }
        if (l > cPeakL) {
          cPeakL = l;
          cPeak = px;
        }
      }
    }
  const face = fS.map((v) => v / fN);
  const coronaMean = cS.map((v) => v / cN);
  ringL.sort((a, b) => a - b);
  const ringP99 = ringL[Math.floor(0.99 * ringL.length)];

  // ── contrasts against the real grounds ──
  const rows = [];
  for (const [gname, g] of Object.entries(GROUNDS)) {
    const discOnG = over(face, 255, g); // the disc is fully opaque
    const corOnG = over(cPeak, 255, g);
    rows.push({
      ground: gname,
      groundRgb: g,
      discRgb: discOnG.map((v) => Math.round(v)),
      discRatio: ratio(discOnG, g),
      discDL: Math.abs(L(...discOnG) - L(...g)),
      coronaVsDisc: ratio(corOnG, discOnG),
      coronaVsGround: ratio(corOnG, g),
    });
  }

  const numbers = [];
  const push = (k, v) => numbers.push([k, v]);
  push('shipped file', `src/assets/planets/planet_unknown.webp — ${meta.width}x${meta.height} ${meta.format}, alpha ${meta.hasAlpha}, ${(fs.statSync(SRC).size / 1024).toFixed(1)} KB`);
  push('disc radius', `${rDisc.toFixed(1)} px (sd over 720 angles ${((rSd / rDisc) * 100).toFixed(2)} % of r)`);
  push('footprint radius', '254 px — identical to the real backend image (measured: alpha 255 out to r 252, 12 at 256, 0 beyond)');
  push('face (silhouette)', `rgb(${face.map((v) => v.toFixed(2)).join(', ')}) — luma max ${fMax.toFixed(0)}, min alpha ${aMin}`);
  push('corona peak', `rgb(${cPeak.join(', ')}) — luma ${cPeakL.toFixed(0)}`);
  push('corona mean (luma>40)', `rgb(${coronaMean.map((v) => v.toFixed(1)).join(', ')}) — B/R ${(coronaMean[2] / coronaMean[0]).toFixed(3)}, G/R ${(coronaMean[1] / coronaMean[0]).toFixed(3)}`);
  push('corona p99 (alpha-weighted)', ringP99.toFixed(1));
  for (const r of rows) {
    push(`DISC vs ${r.ground}`, `contrast ${r.discRatio.toFixed(2)}:1 — ΔLuma ${r.discDL.toFixed(2)} of 255 (${((r.discDL / 255) * 100).toFixed(1)} %). Ground rgb(${r.groundRgb.join(', ')})`);
    push(`CORONA vs disc, on ${r.ground}`, `contrast ${r.coronaVsDisc.toFixed(1)}:1`);
    push(`CORONA vs ${r.ground}`, `contrast ${r.coronaVsGround.toFixed(1)}:1`);
  }

  console.log(numbers.map(([k, v]) => `${k.padEnd(38)} ${v}`).join('\n'));

  // ── sheet images ──
  const outs = [];
  const write = async (name, pipeline) => {
    const f = path.join(DIR_SHEET, `${PREFIX}-${name}.png`);
    await pipeline.png().toFile(f);
    outs.push(`${PREFIX}-${name}.png`);
    return path.basename(f);
  };

  // 1. native 512, on a mid grey so the transparent region is unmistakable
  const native = await write(
    'native512',
    sharp({ create: { width: 512, height: 512, channels: 3, background: '#4a4a52' } }).composite([{ input: SRC }]),
  );
  // 2. alpha alone
  const alphaOnly = await write('alpha', sharp(SRC).extractChannel(3).toColourspace('b-w'));

  // 3. on each real ground at each device size, next to the real planet image
  const onGround = {};
  for (const [gname, g] of Object.entries(GROUNDS)) {
    const key = gname.startsWith('gray-950') ? 'page' : 'card';
    onGround[key] = {};
    for (const css of CSS_SIZES) {
      const dev = css * DPR;
      const bg = { r: g[0], g: g[1], b: g[2] };
      const pad = Math.round(dev * 0.08);
      const cell = async (file) =>
        sharp({
          create: { width: dev + 2 * pad, height: dev + 2 * pad, channels: 3, background: bg },
        }).composite([
          { input: await sharp(file).resize(dev, dev, { kernel: 'lanczos3' }).png().toBuffer(), left: pad, top: pad },
        ]);
      onGround[key][css] = {
        placeholder: await write(`${key}-${css}css-${dev}dev`, await cell(SRC)),
        real: await write(`${key}-${css}css-${dev}dev-real`, await cell(REF)),
      };
    }
  }

  // ── HTML ──
  const groundCss = { page: 'rgb(3,7,18)', card: 'rgb(11,17,31)' };
  const pairBlock = (key) =>
    CSS_SIZES.map(
      (css) => `
      <div class="pair">
        <div class="lab">${css} CSS px &middot; ${css * DPR} device px @ dpr 3</div>
        <div class="row">
          <figure><img src="${onGround[key][css].placeholder}" alt=""><figcaption>planet_unknown (placeholder)</figcaption></figure>
          <figure><img src="${onGround[key][css].real}" alt=""><figcaption>real backend image &mdash; the reveal</figcaption></figure>
        </div>
      </div>`,
    ).join('');

  const html = `<!doctype html>
<meta charset="utf-8">
<title>planet_unknown — uncolonised-body placeholder</title>
<style>
  body { margin:0; padding:32px; background:#0b0e14; color:#c9d1d9;
         font:14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif; }
  h1 { font-size:20px; color:#67e8f9; margin:0 0 4px; }
  h2 { font-size:15px; color:#67e8f9; margin:40px 0 10px; border-bottom:1px solid #1f2937; padding-bottom:6px; }
  p.note { max-width:78ch; color:#9aa4b2; }
  code { color:#fbbf24; }
  .row { display:flex; gap:22px; flex-wrap:wrap; align-items:flex-start; }
  figure { margin:0; }
  figure img { display:block; max-width:100%; height:auto; }
  figcaption { margin-top:6px; font-size:12px; color:#8b95a5; }
  .pair { margin-bottom:26px; }
  .lab { font-size:12px; color:#fbbf24; margin-bottom:8px; letter-spacing:.03em; }
  table { border-collapse:collapse; font-size:13px; }
  td, th { border:1px solid #1f2937; padding:6px 10px; text-align:left; vertical-align:top; }
  th { color:#9aa4b2; font-weight:600; background:#111826; }
  td:first-child { color:#9aa4b2; white-space:nowrap; }
  .swatch { display:inline-block; width:12px; height:12px; border:1px solid #333; vertical-align:-2px; margin-right:5px; }
</style>
<h1>planet_unknown — placeholder for uncolonised bodies</h1>
<p class="note">
  512&times;512 RGBA WebP in <code>src/assets/planets/</code>, plus <code>@half</code> (256) and
  <code>@quarter</code> (128). No <code>@eighth</code> — the shipped planet images have no such level
  (<code>src/utils/planetImage.ts</code>: it answers 403 on the CDN and nothing requests it).
  ONE asset for every body class: planets, moons, asteroids. It promises no appearance, so the swap to
  the real image is a reveal rather than a contradiction: a completely black silhouette, visible only
  through its corona and through its edge against the ground.
</p>

<h2>1 &middot; Native 512&times;512</h2>
<p class="note">On a mid grey, so the transparent region is unmistakable. This is not an app ground.</p>
<div class="row">
  <figure><img src="${native}" width="512" alt=""><figcaption>planet_unknown.webp over #4a4a52</figcaption></figure>
  <figure><img src="${alphaOnly}" width="512" alt=""><figcaption>2 &middot; alpha channel alone (white = opaque)</figcaption></figure>
</div>

<h2>3 &middot; On the real app ground, at the size the planet screen will show it</h2>
<p class="note">
  Ground read out of the code, not guessed: <code>ObjectView.tsx:199</code> is <code>bg-gray-950</code>
  and <code>ObjectPlanetHeader</code>'s card is <code>bg-gray-900/60</code> over it. tailwindcss 4.2.1
  default theme, no <code>tailwind.config.*</code> and no <code>@theme</code> override in
  <code>src/index.css</code>, so gray-950 = <span class="swatch" style="background:rgb(3,7,18)"></span><code>rgb(3, 7, 18)</code>
  and the card composites to <span class="swatch" style="background:rgb(11,17,31)"></span><code>rgb(11, 17, 31)</code>.
  The planet screen has no max-width container, so on a 412-CSS-px phone the card's inner width is
  324 CSS px; a large centred hero lands between 192 and 256 CSS px. Both are shown in DEVICE pixels
  at dpr 3, produced by upscaling the shipped 512 px file the way the WebView will.
</p>

<h3 style="color:#9aa4b2;font-size:13px;">page ground — gray-950</h3>
<div style="background:${groundCss.page};padding:18px;border-radius:8px;">${pairBlock('page')}</div>

<h3 style="color:#9aa4b2;font-size:13px;">header card — gray-900/60 over gray-950</h3>
<div style="background:${groundCss.card};padding:18px;border-radius:8px;">${pairBlock('card')}</div>

<h2>4 &middot; Measured</h2>
<p class="note">
  All numbers measured on the WRITTEN, SHIPPED <code>.webp</code> — never on an in-memory buffer
  (LESSONS &sect;&nbsp;1). Contrast is the WCAG ratio on relative luminance; &Delta;Luma is the plain
  Rec.709 8-bit difference, given alongside because at these levels the ratio alone reads deceptively.
</p>
<table>
<tr><th>quantity</th><th>value</th></tr>
${numbers.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('\n')}
</table>

<h2>5 &middot; Which checks were run, and which were not</h2>
<p class="note">
  CLAUDE.md step 6 (iso validation) does <b>not</b> apply: this is neither a tile nor a module sprite.
  A planet is seen frontally, there is no 26.57&deg; edge, and a corona is annular by construction —
  so the upper-left iso light rule is inapplicable too. Replaced by, and all PASS on the shipped file:
  exact 512&times;512 &middot; alpha present with transparent corners &middot; footprint radius &le; 254
  &middot; disc round (sd 0.64&nbsp;% of r over 720 angles) &middot; disc centred within 2 px &middot;
  face featureless (mean 0.000, sd 0.000, max luma 0 &mdash; no type hint is arithmetically possible)
  &middot; face fully opaque &middot; corona present &middot; corona achromatic within &plusmn;4&nbsp;%
  (B/R 1.000, G/R 0.999 &mdash; no biome-suggesting tint) &middot; bright corona fully opaque
  &middot; no transparent hairline anywhere in the silhouette.
</p>

<h2>6 &middot; The round</h2>
<p class="note">
  Twelve fal.ai generations: four prompts &times; three seeds, <code>fal-ai/flux-pro/v1.1</code> at
  1024&times;1024 via the queue API. Rows top&rarr;bottom: ECLIPSE, BACKLIT, RIMLIGHT, DUST.
  Columns left&rarr;right: seed 10101, 20202, 30303.
  <b>BACKLIT</b> was rejected on colour &mdash; its rings came back tinted (corona B/R 1.164 blue on
  s10101, 0.928 warm gold on s30303), which is exactly the biome hint the motif must not carry.
  <b>RIMLIGHT</b> asked for the thinnest possible ring and flux answered with a disc filling only
  40&nbsp;% of the frame (s10101), a double ring, and on s20202 a lighter square backdrop &mdash;
  the frame-pinning failure mode, measured as border luma 15.56 against 0.02 on the winner.
  Kept: ECLIPSE_s10101 and DUST_s10101, both with the disc at 79&nbsp;% of the frame and a
  perfectly achromatic ring.
</p>
<div class="row">
  <figure><img src="_planet_unknown_candidates.png" width="576" alt=""><figcaption>all twelve candidates</figcaption></figure>
</div>
<p class="note">
  The pick, both finished to 512 and composited on gray-950 at 576 and 768 device px
  (ECLIPSE_s10101 top, DUST_s10101 middle, the real backend image bottom).
  Rudi asked for a <i>thin, uneven</i> ring, and both halves of that decided it:
  ECLIPSE_s10101's corona is thinner (mean thickness 23.5 px against 28.6 px) and more uneven in
  ring brightness (per-angle flux CV 23.0&nbsp;% against 17.6&nbsp;%). DUST's streamers also read
  more like a star than like a body in shadow.
</p>
<div class="row">
  <figure><img src="_planet_unknown_pick.png" width="480" alt=""><figcaption>ECLIPSE_s10101 &middot; DUST_s10101 &middot; real image</figcaption></figure>
</div>
`;
  const htmlFile = path.join(DIR_SHEET, `${PREFIX}_sheet.html`);
  fs.writeFileSync(htmlFile, html);
  console.log(`\nsheet: ${htmlFile}`);
  console.log(`images: ${outs.join(', ')}`);
})();
