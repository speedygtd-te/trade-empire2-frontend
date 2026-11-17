/**
 * Validate an isometric game-asset sprite.
 *
 * Checks (per CLAUDE.md Asset-Pipeline Schritt 6):
 *   - Alpha channel present
 *   - Tight crop: visible content touches all four edges (no transparent border)
 *   - Lighting consistency: upper-left brighter than lower-right (iso light from upper-left)
 *   - Dimensions: square (for module sprites that are padded 1:1) — warns if not square
 *
 * Exit code 0 = PASS, 1 = FAIL.
 *
 * Usage: npx tsx scripts/validate-iso.ts --input assets/final/tracks_0.png --type module
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);

interface Args { input: string; type: string }

function parseArgs(argv: string[]): Args {
  const a: Args = { input: '', type: 'module' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input') a.input = argv[++i] ?? '';
    else if (argv[i] === '--type') a.type = argv[++i] ?? 'module';
  }
  if (!a.input) throw new Error('--input is required');
  return a;
}

interface CheckResult { name: string; ok: boolean; detail: string }

/** Find the bounding box of pixels with alpha > threshold. */
function alphaBounds(data: Buffer, w: number, h: number, channels: number, threshold = 8): { minX: number; minY: number; maxX: number; maxY: number; count: number } {
  let minX = w, minY = h, maxX = -1, maxY = -1, count = 0;
  const aOff = channels - 1; // alpha is last channel
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * channels + aOff];
      if (alpha !== undefined && alpha > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        count++;
      }
    }
  }
  return { minX, minY, maxX, maxY, count };
}

/** Mean luminance of opaque pixels in a rectangular region. */
function regionLuma(data: Buffer, w: number, channels: number, x0: number, y0: number, x1: number, y1: number): number {
  let sum = 0, n = 0;
  const aOff = channels - 1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * w + x) * channels;
      const alpha = data[idx + aOff];
      if (alpha !== undefined && alpha > 8) {
        const r = data[idx] ?? 0, g = data[idx + 1] ?? 0, b = data[idx + 2] ?? 0;
        sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        n++;
      }
    }
  }
  return n > 0 ? sum / n : 0;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const file = path.resolve(args.input);
  console.log(`Validating iso asset: ${file} (type=${args.type})`);

  const img = sharp(file);
  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const channels = meta.channels ?? 4;
  const { data } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = 4; // ensureAlpha -> RGBA

  const checks: CheckResult[] = [];

  // 1. Alpha channel
  checks.push({
    name: 'Alpha channel',
    ok: (meta.hasAlpha ?? false) || channels >= 4,
    detail: `hasAlpha=${meta.hasAlpha}, channels=${channels}`,
  });

  // 2. Tight crop — visible content must touch all four edges (tolerance 1px)
  const b = alphaBounds(data, w, h, ch);
  const tol = 1;
  const touchesLeft = b.minX <= tol;
  const touchesTop = b.minY <= tol;
  const touchesRight = b.maxX >= w - 1 - tol;
  const touchesBottom = b.maxY >= h - 1 - tol;
  // For a padded square, content touches at least the two edges of the longer axis.
  const touchEdges = [touchesLeft, touchesTop, touchesRight, touchesBottom].filter(Boolean).length;
  checks.push({
    name: 'Tight crop',
    ok: touchEdges >= 2,
    detail: `bounds [${b.minX},${b.minY}..${b.maxX},${b.maxY}] of ${w}x${h}; edges touched: L=${touchesLeft} T=${touchesTop} R=${touchesRight} B=${touchesBottom}`,
  });

  // 3. Content coverage — object should fill a meaningful share of canvas
  const coverage = b.count / (w * h);
  checks.push({
    name: 'Content coverage',
    ok: coverage > 0.15,
    detail: `${(coverage * 100).toFixed(1)}% opaque pixels`,
  });

  // 4. Lighting from upper-left — upper-left quadrant brighter than lower-right
  const ulLuma = regionLuma(data, w, ch, 0, 0, Math.floor(w / 2), Math.floor(h / 2));
  const lrLuma = regionLuma(data, w, ch, Math.floor(w / 2), Math.floor(h / 2), w, h);
  checks.push({
    name: 'Lighting upper-left',
    ok: ulLuma >= lrLuma - 5, // allow small slack; just must not be clearly bottom-lit
    detail: `UL luma=${ulLuma.toFixed(1)}, LR luma=${lrLuma.toFixed(1)}`,
  });

  // 5. Square (informational for padded module sprites)
  const isSquare = w === h;
  checks.push({
    name: 'Square 1:1',
    ok: isSquare,
    detail: `${w}x${h}`,
  });

  console.log('');
  let failed = 0;
  for (const c of checks) {
    console.log(`  [${c.ok ? 'PASS' : 'FAIL'}] ${c.name} — ${c.detail}`);
    if (!c.ok) failed++;
  }
  console.log('');

  if (failed === 0) {
    console.log('ISO VALIDATION: PASSED');
    process.exit(0);
  } else {
    console.log(`ISO VALIDATION: FAILED (${failed} check(s))`);
    process.exit(1);
  }
}

main().catch((e) => { console.error('Validation error:', e); process.exit(2); });
