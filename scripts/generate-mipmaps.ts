/**
 * Generate mipmap variants (@half, @quarter, @eighth) for all asset sprites.
 *
 * Scans: src/assets/tiles/, src/assets/hulls/, src/assets/hull_floors/, src/assets/modules/
 * Source files are WebP. Mipmap outputs are WebP (Q90) alongside the source.
 * Skips files that already exist and are newer than the source.
 *
 * Usage: npx ts-node scripts/generate-mipmaps.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSET_ROOT = path.resolve(__dirname, '../src/assets');

const ASSET_DIRS = ['tiles', 'hulls', 'hull_floors', 'modules'];

const MIP_LEVELS = [
  { suffix: '@half', scale: 0.5 },
  { suffix: '@quarter', scale: 0.25 },
  { suffix: '@eighth', scale: 0.125 },
] as const;

const CONCURRENCY = 20;

/** Check if a file is a source WebP (not a generated mipmap). */
function isSourceSprite(filePath: string): boolean {
  if (!filePath.endsWith('.webp')) return false;
  const base = path.basename(filePath, '.webp');
  return !base.includes('@half') && !base.includes('@quarter') && !base.includes('@eighth');
}

/** Collect all source WebP sprites recursively from a directory. */
function collectSourceSprites(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceSprites(full));
    } else if (isSourceSprite(full)) {
      results.push(full);
    }
  }
  return results;
}

interface MipTask {
  source: string;
  output: string;
  scale: number;
}

/** Generate mipmap for a single source file at a given scale. */
async function generateMip(task: MipTask): Promise<boolean> {
  const { source, output, scale } = task;

  // Skip if output exists and is newer than source
  if (fs.existsSync(output)) {
    const srcStat = fs.statSync(source);
    const outStat = fs.statSync(output);
    if (outStat.mtimeMs >= srcStat.mtimeMs) {
      return false; // already up to date
    }
  }

  const metadata = await sharp(source).metadata();
  const w = metadata.width ?? 512;
  const h = metadata.height ?? 512;
  const newW = Math.max(1, Math.round(w * scale));
  const newH = Math.max(1, Math.round(h * scale));

  await sharp(source)
    .resize(newW, newH, { fit: 'fill' })
    .webp({ quality: 90, effort: 4, smartSubsample: true })
    .toFile(output);

  return true; // generated
}

/** Generate mipmaps for a single source file. Returns count of generated files. */
export async function generateMipmapsForFile(sourcePath: string): Promise<number> {
  const dir = path.dirname(sourcePath);
  const ext = path.extname(sourcePath);
  const base = path.basename(sourcePath, ext);
  let count = 0;

  for (const level of MIP_LEVELS) {
    const output = path.join(dir, `${base}${level.suffix}${ext}`);
    const generated = await generateMip({ source: sourcePath, output, scale: level.scale });
    if (generated) count++;
  }

  return count;
}

/** Process tasks with concurrency limit. */
async function processInBatches(tasks: MipTask[], concurrency: number): Promise<number> {
  let generated = 0;
  let idx = 0;

  async function worker(): Promise<void> {
    while (idx < tasks.length) {
      const current = idx++;
      const task = tasks[current];
      if (!task) break;
      try {
        const didGenerate = await generateMip(task);
        if (didGenerate) generated++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ERROR: ${task.output} — ${msg}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()),
  );

  return generated;
}

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log('Generating mipmaps for asset sprites (WebP)...');

  // Collect all source sprites
  const sources: string[] = [];
  for (const dir of ASSET_DIRS) {
    const full = path.join(ASSET_ROOT, dir);
    const found = collectSourceSprites(full);
    sources.push(...found);
    console.log(`  ${dir}: ${found.length} source files`);
  }

  console.log(`  Total: ${sources.length} source files`);

  // Build task list
  const tasks: MipTask[] = [];
  for (const source of sources) {
    const dir = path.dirname(source);
    const ext = path.extname(source);
    const base = path.basename(source, ext);
    for (const level of MIP_LEVELS) {
      tasks.push({
        source,
        output: path.join(dir, `${base}${level.suffix}${ext}`),
        scale: level.scale,
      });
    }
  }

  console.log(`  Tasks: ${tasks.length} mipmap files to check`);

  const generated = await processInBatches(tasks, CONCURRENCY);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone! Generated ${generated} mipmap files in ${elapsed}s`);
  console.log(`  (${tasks.length - generated} already up to date)`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
