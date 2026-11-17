/**
 * Generate a video from a frame image via Alibaba WAN 3.0.
 *
 * Usage: npx ts-node scripts/avatars/generate-video.ts --frame <path> --prompt "<motion>"
 *
 * Example:
 *   npx ts-node scripts/avatars/generate-video.ts \
 *     --frame assets/avatars/frames/dr_vasquez_1713200000000.png \
 *     --prompt "she turns her head slowly and looks directly at the camera"
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  loadWanCredentials,
  prepareFrameBuffer,
  renderCutsceneVideo,
} from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VIDEOS_DIR = path.resolve(__dirname, '../../assets/avatars/videos');

function parseArgs(): { framePath: string; prompt: string } {
  const args = process.argv.slice(2);
  let framePath = '';
  let prompt = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--frame' && args[i + 1]) {
      framePath = args[i + 1];
      i++;
    } else if (args[i] === '--prompt' && args[i + 1]) {
      prompt = args[i + 1];
      i++;
    }
  }

  if (!framePath || !prompt) {
    console.error('Usage: npx ts-node scripts/avatars/generate-video.ts --frame <path> --prompt "<motion>"');
    process.exit(1);
  }

  return { framePath, prompt };
}

async function main(): Promise<void> {
  const { framePath, prompt } = parseArgs();
  const wan = loadWanCredentials();

  const resolvedPath = path.resolve(framePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Frame not found: ${resolvedPath}`);
    process.exit(1);
  }

  fs.mkdirSync(VIDEOS_DIR, { recursive: true });

  console.log('=== Video Generation ===');
  console.log(`Frame:  ${resolvedPath}`);
  console.log(`Prompt: ${prompt}`);
  console.log('');

  // Step 1: Flatten the frame to the opaque JPEG WAN accepts
  console.log('Step 1: Preparing frame (flatten to opaque JPEG)...');
  const frameBuffer = await prepareFrameBuffer(fs.readFileSync(resolvedPath));
  console.log(`  Frame payload: ${Math.round(frameBuffer.length / 1024)}KB`);

  // Step 2: Generate video via WAN 3.0 (submit + poll + download inside)
  console.log('Step 2: Generating 15s video via Alibaba WAN 3.0...');
  const videoBuffer = await renderCutsceneVideo(
    wan.apiKey,
    wan.workspaceId,
    frameBuffer,
    prompt,
  );

  const basename = path.basename(resolvedPath, path.extname(resolvedPath));
  const timestamp = Date.now();
  const outFile = path.join(VIDEOS_DIR, `${basename}_${timestamp}.mp4`);
  fs.writeFileSync(outFile, videoBuffer);
  console.log(`  Saved: ${outFile} (${Math.round(videoBuffer.length / 1024)}KB)`);

  console.log('');
  console.log(`Output: ${outFile}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
