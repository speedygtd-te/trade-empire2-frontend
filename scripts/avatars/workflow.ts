/**
 * Full avatar workflow: base avatar -> BG-remove + BG-generate + composite -> video.
 *
 * New approach (April 2026):
 *   1. Upload base avatar to fal storage
 *   2. Background-remove the avatar (birefnet, rembg fallback) -> alpha PNG
 *   3. Generate a setting-specific background (flux dev, portrait 9:16)
 *   4. Locally composite the alpha character onto the new background via sharp
 *      (char scaled to 65% of BG height, centered, bottom-aligned)
 *   5. Flatten the composite to an opaque JPEG (WAN rejects alpha)
 *   6. Alibaba WAN 3.0 image-to-video -> 15s portrait video (720x1280)
 *
 * Prompt separation (April 2026 bugfix):
 *   --bg-prompt  -> goes ONLY to flux BG-gen (environment description, no figure)
 *   --prompt     -> goes ONLY to the WAN video (camera motion, ambient movement)
 *   If --bg-prompt is omitted, falls back to --prompt (backwards compatible,
 *   but will likely render a person in the BG — use separated prompts instead).
 *
 * Usage: npx tsx scripts/avatars/workflow.ts --character <id> \
 *          --bg-prompt "<bg prompt>" --prompt "<video prompt>" [--out <final-path>]
 *          [--dry-run]
 *
 * --dry-run builds the background, the composite frame and the WAN request
 * body, reports frame dimensions / alpha, body size and the target endpoint,
 * and stops before anything is sent to WAN.
 *
 * Example:
 *   npx tsx scripts/avatars/workflow.ts \
 *     --character director_ashford \
 *     --bg-prompt "empty dark sci-fi colony office interior, ..." \
 *     --prompt "subtle camera motion, ambient scene" \
 *     --out "assets/cutscenes-final/ashford_food_empty.mp4"
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { CHARACTERS } from './characters.js';
import {
  loadApiKey,
  uploadToFal,
  buildWanRequestBody,
  describeFrameBuffer,
  frameToDataUrl,
  wanEndpoints,
  removeBackground,
  generateBackground,
  compositeCharacterOnBackground,
  prepareFrameBuffer,
  renderCutsceneVideo,
  loadWanCredentials,
  downloadBuffer,
  verifyPortraitBackground,
} from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '../..');
const BASE_DIR = path.join(ROOT, 'assets/avatars/base');
const FRAMES_DIR = path.join(ROOT, 'assets/avatars/frames');
const BG_DIR = path.join(ROOT, 'assets/avatars/backgrounds');
const VIDEOS_DIR = path.join(ROOT, 'assets/avatars/videos');

interface Args {
  characterId: string;
  bgPrompt: string;
  videoPrompt: string;
  outPath: string | null;
  dryRun: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let characterId = '';
  let bgPrompt = '';
  let videoPrompt = '';
  let outPath: string | null = null;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--character' && args[i + 1]) {
      characterId = args[i + 1];
      i++;
    } else if ((args[i] === '--bg-prompt' || args[i] === '--bg') && args[i + 1]) {
      bgPrompt = args[i + 1];
      i++;
    } else if ((args[i] === '--prompt' || args[i] === '--video-prompt') && args[i + 1]) {
      videoPrompt = args[i + 1];
      i++;
    } else if (args[i] === '--out' && args[i + 1]) {
      outPath = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  // Fallback: if --bg-prompt was not given, reuse --prompt for the BG gen.
  // This keeps older call-sites working but WILL likely render a figure into
  // the BG — callers should pass both prompts separately.
  if (!bgPrompt && videoPrompt) {
    bgPrompt = videoPrompt;
    console.warn('[workflow] No --bg-prompt given; falling back to --prompt for BG generation.');
    console.warn('[workflow] This may render a person into the BG. Prefer separated prompts.');
  }

  if (!characterId || !bgPrompt || !videoPrompt) {
    console.error('Usage: npx tsx scripts/avatars/workflow.ts --character <id> \\');
    console.error('         --bg-prompt "<bg prompt>" --prompt "<video prompt>" [--out <final-path>]');
    console.error('');
    console.error('Available characters:');
    for (const c of CHARACTERS) {
      console.error(`  ${c.id} — ${c.name} (${c.role})`);
    }
    process.exit(1);
  }

  return { characterId, bgPrompt, videoPrompt, outPath, dryRun };
}

async function main(): Promise<void> {
  const { characterId, bgPrompt, videoPrompt, outPath, dryRun } = parseArgs();
  const apiKey = loadApiKey();
  const wan = loadWanCredentials();

  const character = CHARACTERS.find((c) => c.id === characterId);
  if (!character) {
    console.error(`Character not found: ${characterId}`);
    console.error('Available:', CHARACTERS.map((c) => c.id).join(', '));
    process.exit(1);
  }

  const basePath = path.join(BASE_DIR, `${character.id}.png`);
  if (!fs.existsSync(basePath)) {
    console.error(`Base avatar not found: ${basePath}`);
    console.error('Run generate-avatars.ts first.');
    process.exit(1);
  }

  fs.mkdirSync(FRAMES_DIR, { recursive: true });
  fs.mkdirSync(BG_DIR, { recursive: true });
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  if (outPath) {
    fs.mkdirSync(path.dirname(path.resolve(ROOT, outPath)), { recursive: true });
  }

  const timestamp = Date.now();

  console.log('=== Avatar Workflow (composite flow) ===');
  console.log(`Character:    ${character.name} (${character.id})`);
  console.log(`BG prompt:    ${bgPrompt.slice(0, 120)}...`);
  console.log(`Video prompt: ${videoPrompt}`);
  console.log('');

  // ── Step 1: Upload base avatar ──
  console.log('Step 1: Uploading base avatar to fal storage...');
  const baseBuffer = fs.readFileSync(basePath);
  const baseFalUrl = await uploadToFal(apiKey, baseBuffer, `${character.id}_base.png`);
  console.log(`  Storage URL: ${baseFalUrl.slice(0, 80)}...`);
  console.log('');

  // ── Step 2: Background-remove the avatar ──
  console.log('Step 2: Background-removing base avatar...');
  const alphaUrl = await removeBackground(apiKey, baseFalUrl);
  console.log(`  Alpha URL: ${alphaUrl.slice(0, 80)}...`);
  console.log('');

  // ── Step 3: Generate scene background ──
  console.log('Step 3: Generating scene background (portrait 9:16)...');
  const bgUrl = await generateBackground(apiKey, bgPrompt);
  console.log(`  BG URL: ${bgUrl.slice(0, 80)}...`);
  console.log('');

  // ── Step 4: Download both buffers ──
  console.log('Step 4: Downloading alpha character + background...');
  const [alphaBuffer, bgBuffer] = await Promise.all([
    downloadBuffer(alphaUrl),
    downloadBuffer(bgUrl),
  ]);
  console.log(`  Alpha: ${Math.round(alphaBuffer.length / 1024)}KB`);
  console.log(`  BG:    ${Math.round(bgBuffer.length / 1024)}KB`);

  // Verify BG is portrait before anything else — abort loudly otherwise.
  await verifyPortraitBackground(bgBuffer);

  // Save BG-only for visual check
  const bgOnlyPath = path.join(BG_DIR, `${character.id}_${timestamp}_bg.png`);
  fs.writeFileSync(bgOnlyPath, bgBuffer);
  console.log(`  Saved BG-only: ${bgOnlyPath}`);
  console.log('');

  // ── Step 5: Composite locally via sharp, flatten to opaque JPEG ──
  console.log('Step 5: Compositing character onto background...');
  const composite = await compositeCharacterOnBackground(alphaBuffer, bgBuffer);
  const frameBuffer = await prepareFrameBuffer(composite);
  const framePath = path.join(FRAMES_DIR, `${character.id}_${timestamp}.jpg`);
  fs.writeFileSync(framePath, frameBuffer);
  console.log(`  Saved frame: ${framePath} (${Math.round(frameBuffer.length / 1024)}KB)`);
  console.log('');

  if (dryRun) {
    const info = await describeFrameBuffer(frameBuffer);
    const endpoints = wanEndpoints(wan.workspaceId);
    const request = buildWanRequestBody(videoPrompt, frameToDataUrl(frameBuffer));
    const bodyBytes = Buffer.byteLength(JSON.stringify(request));
    console.log('=== DRY RUN — nothing sent to WAN ===');
    console.log(`  Frame:      ${info.width}x${info.height} ${info.format} ` +
      `hasAlpha=${info.hasAlpha} (${Math.round(info.bytes / 1024)} KB)`);
    console.log(`  Body size:  ${(bodyBytes / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`  Endpoint:   ${endpoints.create}`);
    console.log(`  Model:      ${request.model}`);
    console.log(`  Parameters: ${JSON.stringify(request.parameters)}`);
    console.log(`  Media type: ${request.input.media[0].type}`);
    console.log(`  BG-only:    ${bgOnlyPath}`);
    console.log(`  Frame:      ${framePath}`);
    return;
  }

  // ── Step 6: Generate video (submit + poll + download happen inside) ──
  console.log('Step 6: Generating 15s video via Alibaba WAN 3.0...');
  const videoBuffer = await renderCutsceneVideo(
    wan.apiKey,
    wan.workspaceId,
    frameBuffer,
    videoPrompt,
  );

  const defaultVideoPath = path.join(VIDEOS_DIR, `${character.id}_${timestamp}.mp4`);
  fs.writeFileSync(defaultVideoPath, videoBuffer);
  console.log(`  Saved video: ${defaultVideoPath} (${Math.round(videoBuffer.length / 1024)}KB)`);

  let finalPath = defaultVideoPath;
  if (outPath) {
    const resolvedOut = path.isAbsolute(outPath) ? outPath : path.resolve(ROOT, outPath);
    fs.copyFileSync(defaultVideoPath, resolvedOut);
    finalPath = resolvedOut;
    console.log(`  Copied final: ${finalPath}`);
  }
  console.log('');

  // ── Summary ──
  console.log('=== COMPLETE ===');
  console.log(`BG-only:    ${bgOnlyPath}`);
  console.log(`Frame:      ${framePath}`);
  console.log(`Video:      ${finalPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
