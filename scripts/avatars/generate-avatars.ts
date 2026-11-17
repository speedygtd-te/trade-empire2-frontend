/**
 * Generate base avatars for all characters.
 *
 * Pipeline per character:
 *   1. Generate 1024x2048 via Flux Pro v1.1
 *   2. Upload to fal storage
 *   3. Upscale 2x to 2048x4096 via creative-upscaler
 *   4. Download and save to assets/avatars/base/{id}.png
 *
 * Idempotent: skips characters whose base avatar already exists.
 *
 * Usage: npx ts-node scripts/avatars/generate-avatars.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { CHARACTERS } from './characters.js';
import {
  loadApiKey,
  generateImage,
  uploadToFal,
  upscaleImage,
  downloadBuffer,
} from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DIR = path.resolve(__dirname, '../../assets/avatars/base');

async function main(): Promise<void> {
  const apiKey = loadApiKey();

  console.log('=== Avatar Generation ===');
  console.log(`Characters: ${CHARACTERS.length}`);
  console.log(`Output:     ${BASE_DIR}`);
  console.log('');

  fs.mkdirSync(BASE_DIR, { recursive: true });

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < CHARACTERS.length; i++) {
    const char = CHARACTERS[i];
    const outFile = path.join(BASE_DIR, `${char.id}.png`);

    console.log(`[${i + 1}/${CHARACTERS.length}] ${char.name} (${char.role})`);

    if (fs.existsSync(outFile)) {
      console.log('  SKIP — already exists');
      skipped++;
      console.log('');
      continue;
    }

    try {
      // Step 1: Generate base image at 1024x2048
      console.log('  Step 1: Generating 1024x2048 via Flux Pro v1.1...');
      const imageUrl = await generateImage(apiKey, char.basePrompt, 1024, 2048);
      console.log(`  Image URL: ${imageUrl.slice(0, 80)}...`);

      // Step 2: Upload to fal storage for upscaling
      console.log('  Step 2: Uploading to fal storage...');
      const rawBuffer = await downloadBuffer(imageUrl);
      const falUrl = await uploadToFal(apiKey, rawBuffer, `${char.id}_raw.png`);
      console.log(`  Storage URL: ${falUrl.slice(0, 80)}...`);

      // Step 3: Upscale 2x to 2048x4096
      console.log('  Step 3: Upscaling 2x via creative-upscaler...');
      const upscaledUrl = await upscaleImage(apiKey, falUrl, 2);
      console.log(`  Upscaled URL: ${upscaledUrl.slice(0, 80)}...`);

      // Step 4: Download final and save
      console.log('  Step 4: Downloading final image...');
      const finalBuffer = await downloadBuffer(upscaledUrl);
      fs.writeFileSync(outFile, finalBuffer);
      console.log(`  Saved: ${outFile} (${Math.round(finalBuffer.length / 1024)}KB)`);

      generated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  FAILED: ${msg}`);
      failed++;
    }

    console.log('');
  }

  // Summary
  console.log('=== SUMMARY ===');
  console.log(`Generated: ${generated}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Failed:    ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }

  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
