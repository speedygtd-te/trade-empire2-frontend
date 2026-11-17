/**
 * One-shot recovery script:
 * Take the already-generated desert raw video and run it through the bundle
 * compression step + mirror to assets/cutscenes-final/ + public/cutscenes/.
 *
 * The original batch run produced two valid desert MP4s but a transient
 * Windows ffprobe spawnSync race made the script reject them and retry
 * generation. This script bypasses that issue by skipping ffprobe-based
 * validation and using ffmpeg directly.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { compressVideoForBundle } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

async function main(): Promise<void> {
  const id = 'ashford_planet_colonized_desert';
  // newer of the two, slot 12 attempt 2
  const source = path.join(
    ROOT,
    'assets/avatars/videos/director_ashford_ashford_planet_colonized_desert_1777205860629.mp4',
  );
  const finalPath = path.join(ROOT, 'assets/cutscenes-final', `${id}.mp4`);
  const publicPath = path.join(ROOT, 'public/cutscenes', `${id}.mp4`);

  if (!fs.existsSync(source)) {
    throw new Error(`Source not found: ${source}`);
  }

  const beforeBytes = fs.statSync(source).size;
  console.log(`Compressing ${path.basename(source)} (${(beforeBytes / (1024 * 1024)).toFixed(2)} MB)...`);

  await compressVideoForBundle(source, finalPath);

  const afterBytes = fs.statSync(finalPath).size;
  const reduction = ((1 - afterBytes / beforeBytes) * 100).toFixed(1);
  console.log(
    `Compressed: ${(afterBytes / (1024 * 1024)).toFixed(2)} MB (-${reduction}%)`,
  );
  console.log(`Staged: ${finalPath}`);

  fs.copyFileSync(finalPath, publicPath);
  console.log(`Mirrored: ${publicPath}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
