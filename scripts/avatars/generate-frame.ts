/**
 * Generate a context-specific frame from a character's base avatar.
 *
 * Uses image-to-image to maintain character likeness while changing scene/context.
 *
 * Usage: npx ts-node scripts/avatars/generate-frame.ts --character <id> --prompt "<context>"
 *
 * Example:
 *   npx ts-node scripts/avatars/generate-frame.ts \
 *     --character dr_vasquez \
 *     --prompt "analyzing alien artifact in dark laboratory, dramatic blue lighting"
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { CHARACTERS } from './characters.js';
import {
  loadApiKey,
  uploadToFal,
  generateFrame,
  downloadBuffer,
} from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DIR = path.resolve(__dirname, '../../assets/avatars/base');
const FRAMES_DIR = path.resolve(__dirname, '../../assets/avatars/frames');

function parseArgs(): { characterId: string; prompt: string } {
  const args = process.argv.slice(2);
  let characterId = '';
  let prompt = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--character' && args[i + 1]) {
      characterId = args[i + 1];
      i++;
    } else if (args[i] === '--prompt' && args[i + 1]) {
      prompt = args[i + 1];
      i++;
    }
  }

  if (!characterId || !prompt) {
    console.error('Usage: npx ts-node scripts/avatars/generate-frame.ts --character <id> --prompt "<context>"');
    console.error('');
    console.error('Available characters:');
    for (const c of CHARACTERS) {
      console.error(`  ${c.id} — ${c.name} (${c.role})`);
    }
    process.exit(1);
  }

  return { characterId, prompt };
}

async function main(): Promise<void> {
  const { characterId, prompt } = parseArgs();
  const apiKey = loadApiKey();

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

  console.log(`=== Frame Generation ===`);
  console.log(`Character: ${character.name} (${character.id})`);
  console.log(`Prompt:    ${prompt}`);
  console.log('');

  // Step 1: Upload base avatar to fal storage
  console.log('Step 1: Uploading base avatar to fal storage...');
  const baseBuffer = fs.readFileSync(basePath);
  const falUrl = await uploadToFal(apiKey, baseBuffer, `${character.id}_base.png`);
  console.log(`  Storage URL: ${falUrl.slice(0, 80)}...`);

  // Step 2: Generate frame with character prefix + user prompt
  const fullPrompt = `${character.framePrefix} ${prompt}`;
  console.log(`Step 2: Generating frame...`);
  console.log(`  Full prompt: ${fullPrompt.slice(0, 120)}...`);
  const frameUrl = await generateFrame(apiKey, falUrl, fullPrompt);

  // Step 3: Download and save
  const timestamp = Date.now();
  const outFile = path.join(FRAMES_DIR, `${character.id}_${timestamp}.png`);
  console.log('Step 3: Downloading frame...');
  const frameBuffer = await downloadBuffer(frameUrl);
  fs.writeFileSync(outFile, frameBuffer);
  console.log(`  Saved: ${outFile} (${Math.round(frameBuffer.length / 1024)}KB)`);

  console.log('');
  console.log(`Output: ${outFile}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
