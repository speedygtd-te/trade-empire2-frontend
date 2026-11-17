/**
 * Cloud asset finalization pipeline.
 * Steps per file:
 *   1. Tight crop to visible pixels (alpha > 0)
 *   2. Scale to exactly 1024×512 preserving aspect ratio, padding with transparency
 *   3. Convert to lossless WebP with alpha channel
 * Output: src/assets/clouds/<name>.webp
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const SRC_DIR = path.join(ROOT, 'assets', 'style-test', 'clouds');
const DST_DIR = path.join(ROOT, 'src', 'assets', 'clouds');

const TARGET_W = 1024;
const TARGET_H = 512;

const THEMES = ['temperate', 'toxic', 'ash'];
const INDICES = [1, 2, 3, 4];

const FILES = THEMES.flatMap(t => INDICES.map(i => `cloud_${t}_${i}`));

async function getBBox(data, width, height, channels) {
  let minX = width, maxX = -1, minY = height, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * channels + (channels - 1)];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; // fully transparent
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function processFile(name) {
  const src = path.join(SRC_DIR, `${name}.png`);
  const dst = path.join(DST_DIR, `${name}.webp`);

  // -- Step 1: Tight crop --
  const { data, info } = await sharp(src)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bbox = await getBBox(data, info.width, info.height, info.channels);
  if (!bbox) throw new Error(`${name}: image is fully transparent`);

  // Crop to bounding box
  const cropped = sharp(src).extract({
    left: bbox.left,
    top: bbox.top,
    width: bbox.width,
    height: bbox.height,
  });

  // -- Step 2: Scale to 1024×512 preserving aspect ratio, pad with transparency --
  const scaled = cropped.resize(TARGET_W, TARGET_H, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    withoutEnlargement: false,
  });

  // -- Step 3: Convert to lossless WebP with alpha --
  const buf = await scaled
    .webp({ lossless: true, effort: 4 })
    .toBuffer();

  // Validate output dimensions before writing
  const meta = await sharp(buf).metadata();
  if (meta.width !== TARGET_W || meta.height !== TARGET_H) {
    throw new Error(`${name}: output is ${meta.width}x${meta.height}, expected ${TARGET_W}x${TARGET_H}`);
  }
  if (!meta.hasAlpha) {
    throw new Error(`${name}: output has no alpha channel`);
  }

  fs.writeFileSync(dst, buf);

  return {
    name,
    bbox: `${bbox.left},${bbox.top} ${bbox.width}x${bbox.height}`,
    output: `${meta.width}x${meta.height}`,
    hasAlpha: meta.hasAlpha,
    bytes: buf.length,
  };
}

async function main() {
  fs.mkdirSync(DST_DIR, { recursive: true });

  console.log(`Processing ${FILES.length} cloud assets → ${DST_DIR}`);
  const results = [];
  for (const name of FILES) {
    try {
      const r = await processFile(name);
      results.push({ ...r, ok: true });
      console.log(`  ✓ ${name}: crop ${r.bbox} → ${r.output} alpha=${r.hasAlpha} (${(r.bytes/1024).toFixed(1)} KB)`);
    } catch (err) {
      results.push({ name, ok: false, error: err.message });
      console.error(`  ✗ ${name}: ${err.message}`);
    }
  }

  const ok = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);
  console.log(`\nDone: ${ok}/${FILES.length} OK`);
  if (failed.length > 0) {
    console.error('FAILED:');
    failed.forEach(f => console.error(`  ${f.name}: ${f.error}`));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
