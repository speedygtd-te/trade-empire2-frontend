/**
 * One-shot compression of the 9 Vasquez cutscene videos in public/cutscenes/.
 *
 * Mirrors the Ashford compression settings:
 *   720×1280 @ 1.2 Mbps, H.264 main profile, yuv420p, +faststart, no audio.
 *
 * Per file:
 *   - write to <name>.tmp.mp4, then rename atomically
 *   - on error: keep original, log and continue (no crash)
 *   - before/after size logged
 *
 * Usage:
 *   npx tsx scripts/avatars/compress-vasquez-batch.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { compressVideoForBundle } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '../..');
const PUBLIC_CUTSCENES = path.join(ROOT, 'public/cutscenes');

const VASQUEZ_FILES = [
  'vasquez_artifact_found_barren.mp4',
  'vasquez_artifact_found_desert.mp4',
  'vasquez_artifact_found_earth_like.mp4',
  'vasquez_artifact_found_gas_giant.mp4',
  'vasquez_artifact_found_ice.mp4',
  'vasquez_artifact_found_ice_giant.mp4',
  'vasquez_artifact_found_ocean.mp4',
  'vasquez_artifact_found_toxic.mp4',
  'vasquez_artifact_found_volcanic.mp4',
];

interface CompressionResult {
  file: string;
  beforeBytes: number;
  afterBytes: number;
  status: 'OK' | 'FAILED';
  error?: string;
}

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function main(): Promise<void> {
  console.log('=== Vasquez Cutscene Compression (720×1280 @ 1.2Mbps) ===\n');

  const results: CompressionResult[] = [];
  let totalBefore = 0;
  let totalAfter = 0;

  for (let i = 0; i < VASQUEZ_FILES.length; i++) {
    const file = VASQUEZ_FILES[i];
    const fullPath = path.join(PUBLIC_CUTSCENES, file);
    const tmpPath = fullPath.replace(/\.mp4$/, '.tmp.mp4');

    console.log(`[${i + 1}/${VASQUEZ_FILES.length}] ${file}`);

    if (!fs.existsSync(fullPath)) {
      console.log('  [skip] file not found');
      results.push({ file, beforeBytes: 0, afterBytes: 0, status: 'FAILED', error: 'file not found' });
      continue;
    }

    const beforeBytes = fs.statSync(fullPath).size;
    totalBefore += beforeBytes;
    console.log(`  Before: ${formatMb(beforeBytes)}`);

    try {
      await compressVideoForBundle(fullPath, tmpPath);

      // Atomic replace: delete original only after tmp is ready, then rename
      const afterBytes = fs.statSync(tmpPath).size;
      fs.unlinkSync(fullPath);
      fs.renameSync(tmpPath, fullPath);

      totalAfter += afterBytes;
      const reduction = ((1 - afterBytes / beforeBytes) * 100).toFixed(1);
      console.log(`  After:  ${formatMb(afterBytes)} (−${reduction}%)`);
      results.push({ file, beforeBytes, afterBytes, status: 'OK' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  [fail] ${msg.slice(0, 200)}`);
      // Cleanup tmp if it exists
      if (fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      }
      totalAfter += beforeBytes; // original kept
      results.push({ file, beforeBytes, afterBytes: beforeBytes, status: 'FAILED', error: msg });
    }
  }

  console.log('\n\n=== SUMMARY ===\n');
  console.log('| # | File | Before | After | Reduction | Status |');
  console.log('|---|---|---|---|---|---|');
  results.forEach((r, i) => {
    const reduction = r.beforeBytes > 0 ? ((1 - r.afterBytes / r.beforeBytes) * 100).toFixed(1) + '%' : '-';
    console.log(`| ${i + 1} | ${r.file} | ${formatMb(r.beforeBytes)} | ${formatMb(r.afterBytes)} | ${reduction} | ${r.status} |`);
  });

  const totalReduction = totalBefore > 0 ? ((1 - totalAfter / totalBefore) * 100).toFixed(1) : '0';
  console.log(`\nTotal: ${formatMb(totalBefore)} → ${formatMb(totalAfter)} (−${totalReduction}%)`);

  const failed = results.filter((r) => r.status === 'FAILED');
  if (failed.length > 0) {
    console.log(`\n${failed.length} file(s) failed:`);
    failed.forEach((r) => console.log(`  - ${r.file}: ${r.error}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
