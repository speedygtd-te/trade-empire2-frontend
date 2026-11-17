/**
 * One-off review sheet for the underground-structure rooftop-fixture props
 * (vent_grille, exhaust_stack, hatch_riser, pipe_elbow — see
 * props-vent-grille-generate.cjs for the feature context).
 *
 * Not part of the per-family pipeline (props-family-runner.cjs only ever mixes
 * VARIANTS of one family on a tile grid). This script mixes the FOUR DIFFERENT
 * FAMILIES on one grid at the feature's real ~1-in-10 tile density, because
 * that combined, true-scale, scattered view is the one CLAUDE.md's asset-
 * pipeline task asks for and no existing script produces it.
 *
 * Reuses the exact grid geometry and true-scale draw formula from
 * props-pipeline-lib.cjs's densitySheet/floorSheet (TW/TH diamond tiling,
 * drawH = PROP_BASE_HEIGHT * heightFactor, drawW from the sprite aspect,
 * bottom-centre anchored, painter's-order by row) so this sheet is trustworthy
 * in the same way those are.
 *
 * Usage: node scripts/underground-fixtures-scatter-sheet.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const L = require('./props-pipeline-lib.cjs');

const FAMILIES = ['vent_grille', 'exhaust_stack', 'hatch_riser', 'pipe_elbow'];
const BIOME = 'plains';
const DENSITY = 0.1; // ~1 in 10 tiles, matches the feature spec
const GRID = 8; // 8x8 tiles -> 64 tiles, ~6 fixtures at 0.1 density
const SEED = 774411;

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  fs.mkdirSync(L.DIR_REVIEW, { recursive: true });
  const rand = mulberry32(SEED);

  const tileDir = path.join(L.DIR_TILES, BIOME);
  const tiles = [];
  for (let i = 0; i < 4; i++) {
    const p = path.join(tileDir, `${BIOME}_${i}.webp`);
    if (fs.existsSync(p)) tiles.push(await sharp(p).resize(L.TW, L.TH, { fit: 'fill' }).png().toBuffer());
  }
  if (!tiles.length) throw new Error(`no ${BIOME} tiles found under ${tileDir}`);

  const props = [];
  for (const fam of FAMILIES) {
    const p = path.join(L.DIR_FINAL, `${fam}_0.png`);
    if (!fs.existsSync(p)) throw new Error(`missing final png: ${p}`);
    const m = await sharp(p).metadata();
    const drawH = L.PROP_BASE_HEIGHT; // heightFactor 1 — no per-key factor decided yet
    const drawW = Math.max(1, Math.round(drawH * (m.width / m.height)));
    props.push({ name: fam, buf: await sharp(p).resize(drawW, drawH, { fit: 'fill' }).png().toBuffer(), w: drawW, h: drawH });
  }

  const panelW = (GRID + GRID) * (L.TW / 2) + L.TW;
  const panelH = (GRID + GRID) * (L.TH / 2) + 60;
  const comp = [];
  const items = [];
  const placed = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const sx = Math.round((c - r) * (L.TW / 2) + panelW / 2 - L.TW / 2);
      const sy = Math.round((c + r) * (L.TH / 2) + 10);
      comp.push({ input: tiles[(r * GRID + c) % tiles.length], left: sx, top: sy });
      if (rand() > DENSITY) continue;
      const p = props[Math.floor(rand() * props.length)];
      const dx = (rand() - 0.5) * 0.6;
      const dy = (rand() - 0.5) * 0.6;
      const left = Math.round(sx + L.TW / 2 + dx * (L.TW / 2) - p.w / 2);
      const top = Math.round(sy + L.TH / 2 + dy * (L.TH / 2) - p.h);
      items.push({ input: p.buf, left, top, order: sy + dy * (L.TH / 2) });
      placed.push(p.name);
    }
  }
  items.sort((a, b) => a.order - b.order);
  for (const it of items) comp.push({ input: it.input, left: it.left, top: it.top });

  const strip = await sharp({ create: { width: panelW, height: panelH, channels: 4, background: { r: 122, g: 116, b: 104, alpha: 1 } } })
    .composite(comp)
    .png()
    .toBuffer();

  const out1 = path.join(L.DIR_REVIEW, 'underground_fixtures_scatter_1x.png');
  const out4 = path.join(L.DIR_REVIEW, 'underground_fixtures_scatter_4x.png');
  await sharp(strip).toFile(out1);
  await sharp(strip)
    .resize(panelW * 4, panelH * 4, { fit: 'fill', kernel: 'nearest' })
    .toFile(out4);

  console.log(`placed ${placed.length}/${GRID * GRID} tiles (${((100 * placed.length) / (GRID * GRID)).toFixed(1)}%): ${placed.join(', ')}`);
  console.log(`[sheet] ${out1}`);
  console.log(`[sheet] ${out4}`);
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
