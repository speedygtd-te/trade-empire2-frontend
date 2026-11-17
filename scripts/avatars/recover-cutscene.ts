/**
 * One-shot recovery: take a previously-generated raw cutscene video from
 * assets/avatars/videos/ and run it through the bundle compression step,
 * mirroring to assets/cutscenes-final/ + public/cutscenes/.
 *
 * Use this when the batch script generated a valid WAN video but a transient
 * Windows ffprobe / ffmpeg error caused the script to discard the result.
 *
 * Usage:
 *   npx tsx scripts/avatars/recover-cutscene.ts \
 *     --id ashford_planet_colonized_ice \
 *     --source assets/avatars/videos/director_ashford_ashford_planet_colonized_ice_<ts>.mp4
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { compressVideoForBundle } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

interface Args {
  id: string;
  source: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let id = '';
  let source = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--id' && args[i + 1]) {
      id = args[i + 1];
      i++;
    } else if (args[i] === '--source' && args[i + 1]) {
      source = args[i + 1];
      i++;
    }
  }
  if (!id || !source) {
    console.error('Usage: recover-cutscene.ts --id <cutscene-id> --source <raw-mp4-path>');
    process.exit(1);
  }
  return { id, source };
}

async function main(): Promise<void> {
  const { id, source } = parseArgs();
  const resolvedSource = path.isAbsolute(source) ? source : path.resolve(ROOT, source);
  const finalPath = path.join(ROOT, 'assets/cutscenes-final', `${id}.mp4`);
  const publicPath = path.join(ROOT, 'public/cutscenes', `${id}.mp4`);

  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`Source not found: ${resolvedSource}`);
  }
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  fs.mkdirSync(path.dirname(publicPath), { recursive: true });

  const beforeBytes = fs.statSync(resolvedSource).size;
  console.log(`Compressing ${path.basename(resolvedSource)} (${(beforeBytes / (1024 * 1024)).toFixed(2)} MB)...`);

  // Retry compress up to 3 times for Windows STATUS_DLL_INIT_FAILED transients.
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await compressVideoForBundle(resolvedSource, finalPath);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      console.log(
        `  [warn] attempt ${attempt}/3 failed: ${(err as Error).message.slice(0, 120)}`,
      );
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (lastErr) throw lastErr;

  const afterBytes = fs.statSync(finalPath).size;
  const reduction = ((1 - afterBytes / beforeBytes) * 100).toFixed(1);
  console.log(`Compressed: ${(afterBytes / (1024 * 1024)).toFixed(2)} MB (-${reduction}%)`);
  console.log(`Staged: ${finalPath}`);

  fs.copyFileSync(finalPath, publicPath);
  console.log(`Mirrored: ${publicPath}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
