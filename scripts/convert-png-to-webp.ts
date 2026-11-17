/**
 * Batch PNG → WebP converter via Sharp.
 *
 * Recursively walks an input directory, converts every PNG to WebP, and optionally
 * deletes the original PNG. Mipmap naming is preserved (`foo@half.png` → `foo@half.webp`).
 *
 * Usage:
 *   npx tsx scripts/convert-png-to-webp.ts \
 *     --input "src/assets" \
 *     --exclude "src/assets/old" \
 *     --quality 90 \
 *     --delete-originals
 *
 * Flags:
 *   --input <dir>         Input directory (required, can be repeated)
 *   --exclude <dir>       Directory to skip (can be repeated)
 *   --quality <n>         WebP quality 1-100 (default 90, ignored when --lossless)
 *   --lossless            Use lossless WebP encoding
 *   --delete-originals    Remove source PNG after successful conversion
 *   --concurrency <n>     Parallel conversions (default 4)
 *   --dry-run             Log actions without writing files
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

// ── CLI parsing ──────────────────────────────────────────────────────────────

export interface ConvertOptions {
  inputs: string[];
  excludes: string[];
  quality: number;
  lossless: boolean;
  deleteOriginals: boolean;
  concurrency: number;
  dryRun: boolean;
}

export function parseArgs(argv: string[]): ConvertOptions {
  const opts: ConvertOptions = {
    inputs: [],
    excludes: [],
    quality: 90,
    lossless: false,
    deleteOriginals: false,
    concurrency: 4,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      return v;
    };
    switch (arg) {
      case '--input':
        opts.inputs.push(path.resolve(next()));
        break;
      case '--exclude':
        opts.excludes.push(path.resolve(next()));
        break;
      case '--quality':
        opts.quality = parseInt(next(), 10);
        if (!Number.isFinite(opts.quality) || opts.quality < 1 || opts.quality > 100) {
          throw new Error(`--quality must be 1..100`);
        }
        break;
      case '--lossless':
        opts.lossless = true;
        break;
      case '--delete-originals':
        opts.deleteOriginals = true;
        break;
      case '--concurrency': {
        const n = parseInt(next(), 10);
        if (!Number.isFinite(n) || n < 1) throw new Error(`--concurrency must be >= 1`);
        opts.concurrency = n;
        break;
      }
      case '--dry-run':
        opts.dryRun = true;
        break;
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }
  if (opts.inputs.length === 0) {
    throw new Error('At least one --input is required');
  }
  return opts;
}

// ── Filesystem walk ──────────────────────────────────────────────────────────

export interface ConvertTask {
  src: string;
  dst: string;
}

/** Check if a path is inside any of the excluded directories. */
export function isExcluded(candidate: string, excludes: string[]): boolean {
  const norm = path.resolve(candidate);
  for (const ex of excludes) {
    const exNorm = path.resolve(ex);
    const rel = path.relative(exNorm, norm);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) return true;
  }
  return false;
}

/** Recursively collect PNG files, skipping excluded directories. */
export function collectPngFiles(root: string, excludes: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(root)) return results;

  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) break;
    if (isExcluded(dir, excludes)) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!isExcluded(full, excludes)) stack.push(full);
      } else if (entry.isFile() && full.toLowerCase().endsWith('.png')) {
        results.push(full);
      }
    }
  }
  return results;
}

/** Build a conversion task: derive destination webp path alongside source. */
export function buildTask(src: string): ConvertTask {
  const dir = path.dirname(src);
  const base = path.basename(src, path.extname(src));
  return { src, dst: path.join(dir, `${base}.webp`) };
}

// ── Conversion ───────────────────────────────────────────────────────────────

export interface ConvertResult {
  task: ConvertTask;
  ok: boolean;
  skipped: boolean;
  bytesBefore: number;
  bytesAfter: number;
  error?: string;
}

async function convertOne(
  task: ConvertTask,
  opts: Pick<ConvertOptions, 'quality' | 'lossless' | 'deleteOriginals' | 'dryRun'>,
): Promise<ConvertResult> {
  const result: ConvertResult = {
    task,
    ok: false,
    skipped: false,
    bytesBefore: 0,
    bytesAfter: 0,
  };

  try {
    const srcStat = fs.statSync(task.src);
    result.bytesBefore = srcStat.size;

    // Guard against unusual PNG variants (APNG, 16-bit) — detect via metadata.
    const meta = await sharp(task.src).metadata();
    if (meta.pages && meta.pages > 1) {
      result.skipped = true;
      result.error = `multi-page PNG (${meta.pages} frames) — skipping, original kept`;
      return result;
    }
    if (meta.depth && meta.depth !== 'uchar') {
      result.skipped = true;
      result.error = `non-8bit PNG (depth=${meta.depth}) — skipping, original kept`;
      return result;
    }

    if (opts.dryRun) {
      result.ok = true;
      result.bytesAfter = 0;
      return result;
    }

    const tmpDst = `${task.dst}.tmp`;
    const pipeline = sharp(task.src).webp(
      opts.lossless
        ? { lossless: true, effort: 4 }
        : { quality: opts.quality, effort: 4, smartSubsample: true },
    );
    await pipeline.toFile(tmpDst);

    // Atomic rename tmp → final
    fs.renameSync(tmpDst, task.dst);

    const dstStat = fs.statSync(task.dst);
    result.bytesAfter = dstStat.size;

    if (opts.deleteOriginals) {
      fs.unlinkSync(task.src);
    }

    result.ok = true;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

/** Run conversion tasks with a worker-pool style concurrency limit. */
export async function runConversion(
  tasks: ConvertTask[],
  opts: Pick<ConvertOptions, 'quality' | 'lossless' | 'deleteOriginals' | 'concurrency' | 'dryRun'>,
  onProgress?: (done: number, total: number, result: ConvertResult) => void,
): Promise<ConvertResult[]> {
  const results: ConvertResult[] = new Array(tasks.length);
  let idx = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (true) {
      const current = idx++;
      if (current >= tasks.length) break;
      const res = await convertOne(tasks[current], opts);
      results[current] = res;
      done++;
      onProgress?.(done, tasks.length, res);
    }
  }

  const workerCount = Math.min(Math.max(1, opts.concurrency), tasks.length || 1);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

// ── Reporting ────────────────────────────────────────────────────────────────

export interface FolderStats {
  folder: string;
  fileCount: number;
  bytesBefore: number;
  bytesAfter: number;
}

/** Aggregate results by the first-level sub-directory under each --input root. */
export function aggregateByFolder(results: ConvertResult[], inputs: string[]): FolderStats[] {
  const map = new Map<string, FolderStats>();
  for (const r of results) {
    if (!r.ok || r.skipped) continue;
    const rootInput = inputs.find((root) => {
      const rel = path.relative(root, r.task.src);
      return !rel.startsWith('..') && !path.isAbsolute(rel);
    });
    const folder = rootInput
      ? (() => {
          const rel = path.relative(rootInput, r.task.src);
          const first = rel.split(path.sep)[0];
          return path.join(path.basename(rootInput), first);
        })()
      : path.dirname(r.task.src);

    let stats = map.get(folder);
    if (!stats) {
      stats = { folder, fileCount: 0, bytesBefore: 0, bytesAfter: 0 };
      map.set(folder, stats);
    }
    stats.fileCount++;
    stats.bytesBefore += r.task.src ? r.bytesBefore : 0;
    stats.bytesAfter += r.bytesAfter;
  }
  return Array.from(map.values()).sort((a, b) => a.folder.localeCompare(b.folder));
}

function formatBytes(n: number): string {
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

// ── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  console.log('[webp] options:', {
    inputs: opts.inputs,
    excludes: opts.excludes,
    quality: opts.quality,
    lossless: opts.lossless,
    deleteOriginals: opts.deleteOriginals,
    concurrency: opts.concurrency,
    dryRun: opts.dryRun,
  });

  const allPngs: string[] = [];
  for (const input of opts.inputs) {
    const found = collectPngFiles(input, opts.excludes);
    console.log(`[webp] scan ${input}: ${found.length} PNGs`);
    allPngs.push(...found);
  }

  if (allPngs.length === 0) {
    console.log('[webp] nothing to convert');
    return;
  }

  const tasks = allPngs.map(buildTask);
  console.log(`[webp] starting ${tasks.length} conversions (concurrency=${opts.concurrency})`);

  const startTime = Date.now();
  let lastLog = 0;
  const results = await runConversion(tasks, opts, (done, total, res) => {
    const now = Date.now();
    if (!res.ok && !res.skipped) {
      console.error(`[webp] FAIL ${res.task.src}: ${res.error}`);
    } else if (res.skipped) {
      console.warn(`[webp] SKIP ${res.task.src}: ${res.error}`);
    }
    if (now - lastLog > 1500 || done === total) {
      lastLog = now;
      console.log(`[webp] progress ${done}/${total}`);
    }
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Folder-level stats
  const folderStats = aggregateByFolder(results, opts.inputs);
  let totalBefore = 0;
  let totalAfter = 0;
  for (const s of folderStats) {
    totalBefore += s.bytesBefore;
    totalAfter += s.bytesAfter;
  }
  const failed = results.filter((r) => !r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const ok = results.filter((r) => r.ok).length;

  console.log('\n[webp] ───────── REPORT ─────────');
  console.log(`  Time:       ${elapsed}s`);
  console.log(`  Converted:  ${ok}/${results.length}`);
  console.log(`  Skipped:    ${skipped}`);
  console.log(`  Failed:     ${failed}`);
  console.log(`  Total PNG:  ${formatBytes(totalBefore)}`);
  console.log(`  Total WebP: ${formatBytes(totalAfter)}`);
  if (totalBefore > 0) {
    const reduction = (1 - totalAfter / totalBefore) * 100;
    console.log(`  Reduction:  ${reduction.toFixed(1)} %`);
  }
  console.log('\n  Per-folder:');
  for (const s of folderStats) {
    const red = s.bytesBefore > 0 ? (1 - s.bytesAfter / s.bytesBefore) * 100 : 0;
    console.log(
      `    ${s.folder.padEnd(40)} ${String(s.fileCount).padStart(4)} files  ` +
        `${formatBytes(s.bytesBefore).padStart(10)} → ${formatBytes(s.bytesAfter).padStart(10)}  (-${red.toFixed(1)}%)`,
    );
  }
}

// Only run main when invoked as a script, not when imported by tests.
const __filename = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && path.resolve(__filename) === invokedPath) {
  main().catch((err) => {
    console.error('[webp] FATAL:', err);
    process.exit(1);
  });
}
