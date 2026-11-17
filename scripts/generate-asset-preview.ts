/**
 * Asset Preview Generator (Dev-Tool, NOT part of the app build).
 *
 * Scans the on-disk tile, flat-tile and hull-floor asset folders and emits a
 * single self-contained HTML file (`scripts/asset-preview.html`) that Rudi can
 * open straight from disk (file://) — no server, no build step, no fetch.
 *
 * The page shows, per asset type:
 *   (a) a "variant strip": the 4 variants (0..3) side by side, labelled,
 *   (b) an "iso-grid preview": an 8x8 isometric diamond grid with the variants
 *       mixed across cells, rendered with the EXACT same geometry the game uses
 *       (TW=48, TH=24, 2:1 diamond, sprite squashed into the diamond bbox and
 *       clipped to the diamond shape — see src/views/grid/isoConstants.ts and
 *       StructureCanvasRenderer / PlanetSurface drawGroundTile).
 *
 * A "Reshuffle" button (global + per grid) re-randomises the variant mix so
 * palette/edge jumps between variants become visible.
 *
 * Geometry source of truth (kept in sync manually with isoConstants.ts):
 *   TW = 48, TH = 24  → tile diamond bounding box, drawn at (cx-TW/2, cy-TH/2)
 *   worldToScreen(wx,wy) = { sx:(wx-wy)*TW/2 , sy:(wx+wy)*TH/2 }
 *   In-game default variant per cell: floorVariant(x,y,count) (Math.imul hash).
 *
 * Re-run any time assets are added/removed:
 *   npx tsx scripts/generate-asset-preview.ts
 *
 * Optional flags:
 *   --out <file>   Override output path (default scripts/asset-preview.html)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPTS_DIR = __dirname;
const REPO_ROOT = path.resolve(SCRIPTS_DIR, '..');
const ASSETS_DIR = path.join(REPO_ROOT, 'src', 'assets');

const TILES_DIR = path.join(ASSETS_DIR, 'tiles');
const TILES_FLAT_DIR = path.join(ASSETS_DIR, 'tiles-flat');
const HULL_FLOORS_DIR = path.join(ASSETS_DIR, 'hull_floors');

// Mip suffix the preview displays. The source @half PNGs are the human-facing
// art layer; the game ships @half/@quarter/@eighth webp mips derived from these.
const MIP = '@half';

// ── Geometry (mirrors src/views/grid/isoConstants.ts) ────────────────────────
const TW = 48;
const TH = 24;

// ── CLI ──────────────────────────────────────────────────────────────────────
function parseOut(argv: string[]): string {
  const i = argv.indexOf('--out');
  if (i >= 0 && argv[i + 1]) return path.resolve(argv[i + 1]);
  return path.join(SCRIPTS_DIR, 'asset-preview.html');
}

// ── Manifest types ─────────────────────────────────────────────────────────
interface AssetEntry {
  /** Display key (biome name or hull type). */
  key: string;
  /** Per-variant relative href from scripts/ (or null when the file is missing). */
  variants: (string | null)[];
  /** Variant indices that are missing on disk. */
  missing: number[];
}

interface Section {
  id: string;
  title: string;
  subtitle: string;
  entries: AssetEntry[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** POSIX-style relative href from the scripts/ dir to an asset file. */
function relHref(absFile: string): string {
  return path.relative(SCRIPTS_DIR, absFile).split(path.sep).join('/');
}

function listDirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/**
 * Build an entry for an asset with 4 expected variants. `fileFor(variant)`
 * returns the absolute path the variant SHOULD live at; missing files become
 * null + recorded in `missing`.
 */
function buildEntry(key: string, fileFor: (v: number) => string): AssetEntry {
  const variants: (string | null)[] = [];
  const missing: number[] = [];
  for (let v = 0; v < 4; v++) {
    const abs = fileFor(v);
    if (fs.existsSync(abs)) {
      variants.push(relHref(abs));
    } else {
      variants.push(null);
      missing.push(v);
    }
  }
  return { key, variants, missing };
}

// ── Scanners ─────────────────────────────────────────────────────────────────

function scanTiles(): AssetEntry[] {
  return listDirs(TILES_DIR).map((biome) =>
    buildEntry(biome, (v) => path.join(TILES_DIR, biome, `${biome}_${v}${MIP}.png`)),
  );
}

function scanTilesFlat(): AssetEntry[] {
  if (!fs.existsSync(TILES_FLAT_DIR)) return [];
  // Flat tiles are stored as loose files: <biome>_<v>@half.png. Derive the
  // biome set from the @half files present.
  const biomes = new Set<string>();
  for (const f of fs.readdirSync(TILES_FLAT_DIR)) {
    const m = f.match(/^(.+)_\d+@half\.png$/);
    if (m) biomes.add(m[1]);
  }
  return [...biomes]
    .sort()
    .map((biome) =>
      buildEntry(biome, (v) => path.join(TILES_FLAT_DIR, `${biome}_${v}${MIP}.png`)),
    );
}

function scanHullFloors(): AssetEntry[] {
  return listDirs(HULL_FLOORS_DIR).map((hullType) =>
    buildEntry(hullType, (v) =>
      path.join(HULL_FLOORS_DIR, hullType, `${hullType}_floor_${v}${MIP}.png`),
    ),
  );
}

// ── HTML generation ───────────────────────────────────────────────────────────

function buildSections(): Section[] {
  const sections: Section[] = [
    {
      id: 'tiles',
      title: 'Surface Tiles',
      subtitle: 'src/assets/tiles/<biome>/ — die im Spiel (PlanetSurface) verwendeten Boden-Tiles.',
      entries: scanTiles(),
    },
    {
      id: 'hull-floors',
      title: 'Hull Floors',
      subtitle: 'src/assets/hull_floors/<hullType>/ — Hüllen-Böden (StructureView).',
      entries: scanHullFloors(),
    },
  ];
  const flat = scanTilesFlat();
  if (flat.length) {
    sections.push({
      id: 'tiles-flat',
      title: 'Surface Tiles (flat)',
      subtitle: 'src/assets/tiles-flat/ — flache Variante ohne Höhenkante (Vergleich).',
      entries: flat,
    });
  }
  return sections;
}

function renderHtml(sections: Section[]): string {
  const manifest = JSON.stringify(sections);
  const totalAssets = sections.reduce((n, s) => n + s.entries.length, 0);

  return `<!DOCTYPE html>
<html lang="de" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Trade Empire — Asset Preview</title>
<style>
  :root {
    --bg: #030712; --panel: #0b1220; --panel2: #111a2e; --border: #1f2c44;
    --text: #e5edf7; --muted: #8aa0bd; --accent: #22d3ee;
  }
  html[data-theme="light"] {
    --bg: #eef2f7; --panel: #ffffff; --panel2: #f4f7fb; --border: #cdd7e4;
    --text: #16202e; --muted: #5b6b80; --accent: #0e7490;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  header { position: sticky; top: 0; z-index: 10; background: var(--panel);
    border-bottom: 1px solid var(--border); padding: 12px 18px;
    display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
  header h1 { font-size: 17px; margin: 0; }
  header .meta { color: var(--muted); font-size: 12px; }
  .toc { display: flex; flex-wrap: wrap; gap: 8px; }
  .toc a { color: var(--accent); text-decoration: none; font-size: 13px;
    border: 1px solid var(--border); padding: 4px 9px; border-radius: 6px; }
  .toc a:hover { background: var(--panel2); }
  button { cursor: pointer; background: var(--panel2); color: var(--text);
    border: 1px solid var(--border); border-radius: 6px; padding: 6px 12px;
    font-size: 13px; }
  button:hover { border-color: var(--accent); }
  .spacer { flex: 1; }
  main { padding: 18px; max-width: 1400px; margin: 0 auto; }
  section { margin-bottom: 40px; }
  section > h2 { font-size: 20px; margin: 0 0 2px; }
  section > .sub { color: var(--muted); font-size: 13px; margin-bottom: 14px; }
  .asset { background: var(--panel); border: 1px solid var(--border);
    border-radius: 10px; padding: 14px; margin-bottom: 16px; }
  .asset-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .asset-head h3 { font-size: 15px; margin: 0; }
  .badge { font-size: 11px; padding: 2px 7px; border-radius: 5px;
    background: #7f1d1d; color: #fecaca; }
  .row { display: flex; gap: 22px; flex-wrap: wrap; align-items: flex-start; }
  .strip { display: flex; gap: 10px; }
  .variant { text-align: center; }
  .variant .frame { width: 96px; height: 96px; display: flex; align-items: center;
    justify-content: center; background:
      repeating-conic-gradient(#222b3d 0% 25%, #1a2334 0% 50%) 50% / 18px 18px;
    border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  html[data-theme="light"] .variant .frame { background:
      repeating-conic-gradient(#dfe6ef 0% 25%, #eef2f7 0% 50%) 50% / 18px 18px; }
  .variant img { max-width: 92px; max-height: 92px; image-rendering: auto; }
  .variant .lbl { font-size: 12px; color: var(--muted); margin-top: 4px; }
  .variant.missing .frame { border-style: dashed; border-color: #7f1d1d; }
  .variant.missing .frame::after { content: "fehlt"; color: #fca5a5; font-size: 12px; }
  .grid-wrap { display: flex; flex-direction: column; gap: 6px; }
  .grid-wrap canvas { background: var(--bg); border: 1px solid var(--border);
    border-radius: 6px; }
  .grid-wrap .cap { font-size: 12px; color: var(--muted); }
  .col-title { font-size: 12px; color: var(--muted); text-transform: uppercase;
    letter-spacing: .06em; margin: 0 0 8px; }
</style>
</head>
<body>
<header>
  <h1>Asset Preview</h1>
  <span class="meta" id="meta"></span>
  <nav class="toc" id="toc"></nav>
  <span class="spacer"></span>
  <button id="reshuffle-all">Alle neu mischen</button>
  <button id="theme-toggle">Hell / Dunkel</button>
</header>
<main id="main"></main>

<script>
"use strict";
// ── Embedded manifest (no fetch — works from file://) ──
const SECTIONS = ${manifest};

// ── Geometry, mirrors src/views/grid/isoConstants.ts ──
const TW = ${TW};
const TH = ${TH};

// Deterministic in-game variant for cell (x,y) — exact copy of floorVariant().
function floorVariant(x, y, count) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return Math.abs(h) % count;
}

// Image cache so the grids don't reload the same PNG per cell.
const imgCache = new Map();
function loadImg(src) {
  let img = imgCache.get(src);
  if (img) return img;
  img = new Image();
  img.src = src;
  imgCache.set(src, img);
  return img;
}

// Draw a single diamond cell: squash sprite into TW x TH bbox at (cx,cy),
// clipped to the diamond — identical to drawGroundTile() in the app.
function drawCell(ctx, cx, cy, img) {
  const hw = TW / 2, hh = TH / 2;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.clip();
    ctx.drawImage(img, cx - hw, cy - hh, TW, TH);
  } else {
    ctx.fillStyle = "rgba(40,52,74,0.6)";
    ctx.fill();
  }
  ctx.restore();
  // faint edge like the game
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
  ctx.stroke();
}

const GRID_N = 8;     // 8x8 grid
const SCALE = 2;      // upscale so seams are easy to inspect

// Render an iso grid for one asset entry into its canvas.
// mode: "hash" = deterministic in-game distribution, "random" = reshuffled.
function renderGrid(canvas, entry, mode, seed) {
  const have = entry.variants.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Iso bounding box for an NxN grid. xRange spans (wx-wy) over [-N+1 .. N-1].
  const halfW = (GRID_N - 1) * (TW / 2) + TW / 2;       // max |sx| + half tile
  const originX = halfW;
  const originY = TH / 2 + 2;

  // Draw back-to-front (painter's order): increasing wx+wy.
  for (let wy = 0; wy < GRID_N; wy++) {
    for (let wx = 0; wx < GRID_N; wx++) {
      const sx = (wx - wy) * (TW / 2) + originX;
      const sy = (wx + wy) * (TH / 2) + originY;
      let variant;
      if (have.length === 0) { drawCell(ctx, sx, sy, null); continue; }
      if (mode === "hash") {
        variant = have[floorVariant(wx, wy, have.length)];
      } else {
        // seeded PRNG so a reshuffle is stable until the next reshuffle
        const r = pseudo(wx, wy, seed);
        variant = have[Math.floor(r * have.length) % have.length];
      }
      drawCell(ctx, sx, sy, loadImg(entry.variants[variant]));
    }
  }
}

function pseudo(x, y, seed) {
  let h = (Math.imul(x + 1, 374761393) + Math.imul(y + 1, 668265263) + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 15), 2654435761);
  h ^= h >>> 13;
  return ((h >>> 0) % 100000) / 100000;
}

// Track grids so we can redraw on image load + reshuffle.
const grids = []; // { canvas, entry, mode, seed }

function reshuffle(g) {
  g.mode = "random";
  g.seed = (Math.random() * 1e9) | 0;
  renderGrid(g.canvas, g.entry, g.mode, g.seed);
}

function buildVariantStrip(entry) {
  const strip = document.createElement("div");
  strip.className = "strip";
  entry.variants.forEach((href, i) => {
    const cell = document.createElement("div");
    cell.className = "variant" + (href ? "" : " missing");
    const frame = document.createElement("div");
    frame.className = "frame";
    if (href) {
      const img = loadImg(href);
      const el = document.createElement("img");
      el.src = href;
      frame.appendChild(el);
    }
    const lbl = document.createElement("div");
    lbl.className = "lbl";
    lbl.textContent = String(i);
    cell.appendChild(frame);
    cell.appendChild(lbl);
    strip.appendChild(cell);
  });
  return strip;
}

function buildAsset(entry) {
  const wrap = document.createElement("div");
  wrap.className = "asset";

  const head = document.createElement("div");
  head.className = "asset-head";
  const h3 = document.createElement("h3");
  h3.textContent = entry.key;
  head.appendChild(h3);
  if (entry.missing.length) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "fehlende Varianten: " + entry.missing.join(", ");
    head.appendChild(badge);
  }
  wrap.appendChild(head);

  const row = document.createElement("div");
  row.className = "row";

  // (a) variant strip
  const stripCol = document.createElement("div");
  const stripTitle = document.createElement("p");
  stripTitle.className = "col-title";
  stripTitle.textContent = "Varianten 0–3";
  stripCol.appendChild(stripTitle);
  stripCol.appendChild(buildVariantStrip(entry));
  row.appendChild(stripCol);

  // (b) iso grid
  const gridCol = document.createElement("div");
  const gridTitle = document.createElement("p");
  gridTitle.className = "col-title";
  gridTitle.textContent = "Iso-Grid 8×8 (Naht-Check)";
  gridCol.appendChild(gridTitle);

  const gw = document.createElement("div");
  gw.className = "grid-wrap";
  const canvas = document.createElement("canvas");
  const pxW = ((GRID_N - 1) * TW + TW) ;
  const pxH = ((GRID_N - 1) * TH + TH) + 4;
  canvas.width = pxW * SCALE;
  canvas.height = pxH * SCALE;
  canvas.style.width = pxW + "px";
  canvas.style.height = pxH + "px";
  gw.appendChild(canvas);

  const g = { canvas, entry, mode: "hash", seed: 0 };
  grids.push(g);

  const bar = document.createElement("div");
  bar.style.display = "flex";
  bar.style.gap = "8px";
  bar.style.alignItems = "center";
  const btn = document.createElement("button");
  btn.textContent = "Reshuffle";
  btn.addEventListener("click", () => reshuffle(g));
  const cap = document.createElement("span");
  cap.className = "cap";
  cap.textContent = "Start: spiel-deterministisch (floorVariant)";
  bar.appendChild(btn);
  bar.appendChild(cap);
  gw.appendChild(bar);

  gridCol.appendChild(gw);
  row.appendChild(gridCol);

  wrap.appendChild(row);
  return wrap;
}

function build() {
  const main = document.getElementById("main");
  const toc = document.getElementById("toc");
  let assetCount = 0;
  for (const sec of SECTIONS) {
    assetCount += sec.entries.length;
    const a = document.createElement("a");
    a.href = "#" + sec.id;
    a.textContent = sec.title + " (" + sec.entries.length + ")";
    toc.appendChild(a);

    const section = document.createElement("section");
    section.id = sec.id;
    const h2 = document.createElement("h2");
    h2.textContent = sec.title;
    const sub = document.createElement("p");
    sub.className = "sub";
    sub.textContent = sec.subtitle;
    section.appendChild(h2);
    section.appendChild(sub);
    for (const entry of sec.entries) section.appendChild(buildAsset(entry));
    main.appendChild(section);
  }
  document.getElementById("meta").textContent =
    assetCount + " Assets in " + SECTIONS.length + " Sektionen";

  // Initial render of all grids (hash mode).
  for (const g of grids) renderGrid(g.canvas, g.entry, g.mode, g.seed);
}

// Redraw grids as images finish loading so cells aren't blank.
let redrawTimer = null;
function scheduleRedraw() {
  if (redrawTimer) return;
  redrawTimer = setTimeout(() => {
    redrawTimer = null;
    for (const g of grids) renderGrid(g.canvas, g.entry, g.mode, g.seed);
  }, 80);
}

document.getElementById("reshuffle-all").addEventListener("click", () => {
  for (const g of grids) reshuffle(g);
});
document.getElementById("theme-toggle").addEventListener("click", () => {
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
});

build();

// One delegated load listener: every cached Image redraw-schedules on load.
for (const img of imgCache.values()) {
  if (!img.complete) img.addEventListener("load", scheduleRedraw);
}
// Also catch images created after build (variant strip <img> are separate els
// but grids reuse the cache, so this covers grid cells).
window.addEventListener("load", scheduleRedraw);
</script>
</body>
</html>
`;
}

// ── Main ───────────────────────────────────────────────────────────────────
function main(): void {
  const outFile = parseOut(process.argv.slice(2));
  const sections = buildSections();
  const html = renderHtml(sections);
  fs.writeFileSync(outFile, html, 'utf8');

  // Report
  const total = sections.reduce((n, s) => n + s.entries.length, 0);
  console.log(`Asset preview generated: ${outFile}`);
  for (const s of sections) {
    const missing = s.entries.filter((e) => e.missing.length);
    console.log(`  ${s.title}: ${s.entries.length} entries` +
      (missing.length ? `, ${missing.length} with missing variants` : ''));
    for (const e of missing) {
      console.log(`    - ${e.key}: missing variant(s) ${e.missing.join(', ')}`);
    }
  }
  console.log(`Total: ${total} assets across ${sections.length} sections.`);
}

main();
