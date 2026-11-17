import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';

import {
  parseArgs,
  collectPngFiles,
  buildTask,
  isExcluded,
  runConversion,
  aggregateByFolder,
} from './convert-png-to-webp';

let tmpRoot: string;

function makePng(dst: string, w = 32, h = 32): Promise<void> {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: 10, g: 200, b: 120, alpha: 1 },
    },
  })
    .png()
    .toFile(dst)
    .then(() => undefined);
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'webp-test-'));
});

afterEach(() => {
  if (tmpRoot && fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

describe('parseArgs', () => {
  it('parses inputs, excludes, quality, and flags', () => {
    const opts = parseArgs([
      '--input', 'src/assets',
      '--exclude', 'src/assets/old',
      '--quality', '85',
      '--delete-originals',
      '--concurrency', '8',
    ]);
    expect(opts.inputs).toHaveLength(1);
    expect(opts.inputs[0]).toContain('assets');
    expect(opts.excludes).toHaveLength(1);
    expect(opts.quality).toBe(85);
    expect(opts.deleteOriginals).toBe(true);
    expect(opts.concurrency).toBe(8);
    expect(opts.lossless).toBe(false);
  });

  it('throws when --input is missing', () => {
    expect(() => parseArgs(['--quality', '80'])).toThrow(/--input/);
  });

  it('validates --quality range', () => {
    expect(() => parseArgs(['--input', '.', '--quality', '150'])).toThrow(/quality/);
  });
});

describe('isExcluded', () => {
  it('detects child paths of an excluded directory', () => {
    const base = path.join(tmpRoot, 'assets');
    const excluded = path.join(base, 'old');
    fs.mkdirSync(excluded, { recursive: true });
    const inside = path.join(excluded, 'sub', 'foo.png');
    expect(isExcluded(inside, [excluded])).toBe(true);
    expect(isExcluded(path.join(base, 'hulls', 'x.png'), [excluded])).toBe(false);
  });
});

describe('collectPngFiles', () => {
  it('finds PNGs recursively and skips excluded subtree', async () => {
    const input = path.join(tmpRoot, 'assets');
    await makePng(path.join(input, 'modules', 'a', 'a.png'));
    await makePng(path.join(input, 'modules', 'a', 'a@half.png'));
    await makePng(path.join(input, 'hulls', 'b.png'));
    await makePng(path.join(input, 'old', 'skip_me.png'));

    const found = collectPngFiles(input, [path.join(input, 'old')]);
    const rels = found.map((p) => path.relative(input, p).replace(/\\/g, '/')).sort();
    expect(rels).toEqual([
      'hulls/b.png',
      'modules/a/a.png',
      'modules/a/a@half.png',
    ]);
    expect(rels.some((r) => r.includes('old/'))).toBe(false);
  });

  it('returns [] for non-existent root', () => {
    expect(collectPngFiles(path.join(tmpRoot, 'missing'), [])).toEqual([]);
  });
});

describe('buildTask', () => {
  it('preserves mipmap naming convention', () => {
    const t1 = buildTask('/x/y/foo.png');
    expect(t1.dst.replace(/\\/g, '/')).toBe('/x/y/foo.webp');

    const t2 = buildTask('/x/y/foo@half.png');
    expect(t2.dst.replace(/\\/g, '/')).toBe('/x/y/foo@half.webp');

    const t3 = buildTask('/x/y/foo@eighth.png');
    expect(t3.dst.replace(/\\/g, '/')).toBe('/x/y/foo@eighth.webp');
  });
});

describe('runConversion', () => {
  it('converts PNG → WebP and keeps original without --delete-originals', async () => {
    const input = path.join(tmpRoot, 'assets');
    await makePng(path.join(input, 'a.png'));
    await makePng(path.join(input, 'b@half.png'));

    const tasks = collectPngFiles(input, []).map(buildTask);
    const results = await runConversion(tasks, {
      quality: 80,
      lossless: false,
      deleteOriginals: false,
      concurrency: 2,
      dryRun: false,
    });

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(fs.existsSync(path.join(input, 'a.webp'))).toBe(true);
    expect(fs.existsSync(path.join(input, 'b@half.webp'))).toBe(true);
    // originals kept
    expect(fs.existsSync(path.join(input, 'a.png'))).toBe(true);
    expect(fs.existsSync(path.join(input, 'b@half.png'))).toBe(true);
  });

  it('removes original when --delete-originals is set', async () => {
    const input = path.join(tmpRoot, 'assets');
    await makePng(path.join(input, 'keep.png'));

    const tasks = collectPngFiles(input, []).map(buildTask);
    const results = await runConversion(tasks, {
      quality: 80,
      lossless: false,
      deleteOriginals: true,
      concurrency: 1,
      dryRun: false,
    });
    expect(results[0].ok).toBe(true);
    expect(fs.existsSync(path.join(input, 'keep.webp'))).toBe(true);
    expect(fs.existsSync(path.join(input, 'keep.png'))).toBe(false);
  });

  it('does not touch files inside excluded directory', async () => {
    const input = path.join(tmpRoot, 'assets');
    const excluded = path.join(input, 'old');
    await makePng(path.join(input, 'ok.png'));
    await makePng(path.join(excluded, 'skip.png'));

    const tasks = collectPngFiles(input, [excluded]).map(buildTask);
    await runConversion(tasks, {
      quality: 80,
      lossless: false,
      deleteOriginals: true,
      concurrency: 2,
      dryRun: false,
    });

    expect(fs.existsSync(path.join(input, 'ok.webp'))).toBe(true);
    expect(fs.existsSync(path.join(input, 'ok.png'))).toBe(false);
    // excluded file untouched (still PNG, no webp)
    expect(fs.existsSync(path.join(excluded, 'skip.png'))).toBe(true);
    expect(fs.existsSync(path.join(excluded, 'skip.webp'))).toBe(false);
  });

  it('aggregateByFolder groups by first-level subfolder', async () => {
    const input = path.join(tmpRoot, 'assets');
    await makePng(path.join(input, 'modules', 'm1.png'));
    await makePng(path.join(input, 'modules', 'sub', 'm2.png'));
    await makePng(path.join(input, 'hulls', 'h1.png'));

    const tasks = collectPngFiles(input, []).map(buildTask);
    const results = await runConversion(tasks, {
      quality: 80,
      lossless: false,
      deleteOriginals: false,
      concurrency: 2,
      dryRun: false,
    });

    const stats = aggregateByFolder(results, [input]);
    const byName = new Map(stats.map((s) => [s.folder.split(path.sep).pop()!, s]));
    expect(byName.get('modules')?.fileCount).toBe(2);
    expect(byName.get('hulls')?.fileCount).toBe(1);
  });
});
