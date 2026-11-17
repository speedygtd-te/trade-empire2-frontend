/**
 * Generate the MINIATURIZATION_FACTORY module asset.
 *
 * Pipeline (mirrors scripts/generate-module-gap-fill.ts for visual consistency):
 *   1. Flux Dev 512x512 generation with negative prompt
 *   2. fal.ai birefnet/v2 background removal
 *   3. sharp trim + pad to 2:1 wide canvas (1024x512)
 *   4. Save as .webp (Q92, effort 6) in src/assets/modules/miniaturization_factory/miniaturization_factory_0.webp
 *   5. Generate mipmap variants (@half 512x256, @quarter 256x128, @eighth 128x64) via generate-mipmaps.ts
 *
 * NOTE on dimensions: Rudi explicitly requested 1024x512 for this asset, overriding
 * the repo convention of 1:1 square module sprites. CLAUDE.md mentions 1024x512 as a
 * valid "breite Iso-Sprite" size. The validator below has been adjusted for this
 * specific script to allow non-square 2:1 output. Other module scripts retain their
 * square-only validator. Do NOT copy this relaxation back to the general module
 * generator unless explicitly approved.
 *
 * REUSE MODE: If MINI_FACTORY_REUSE_PIPELINE=1 (or no FAL_API_KEY is present), the
 * script skips the fal.ai generation + BG-removal steps and reuses the existing
 * assets/nobg/miniaturization_factory_nobg.png produced by an earlier run. This is
 * the default path when re-running for a dimension change so we don't burn API
 * credits on the same prompt.
 *
 * Usage: npx tsx scripts/generate-miniaturization-factory.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FAL_API_KEY = process.env['FAL_API_KEY']
  ?? (fs.existsSync(path.join(__dirname, '.env'))
    ? fs.readFileSync(path.join(__dirname, '.env'), 'utf-8')
      .split('\n').find((l) => l.startsWith('FAL_API_KEY='))?.replace('FAL_API_KEY=', '').trim() ?? ''
    : '');

// ── Output ──
const MODULES_DIR = path.resolve(__dirname, '../src/assets/modules');
const WORK_DIR = path.resolve(__dirname, '../assets');

// ── Target dimensions ──
const TARGET_WIDTH = 1024;
const TARGET_HEIGHT = 512;

// ── Style anchors (kept in sync with generate-module-gap-fill.ts) ──
const BASE_STYLE =
  'isometric game asset, single 3D building module, 30 degree camera angle from horizontal, ' +
  '2:1 isometric perspective, The Expanse sci-fi aesthetic, photorealistic textures, ' +
  'realistic worn industrial metal surfaces, transparent background, game sprite, centered, ' +
  'single object, no ground plane, no shadow, no walls, no enclosure, lit from upper-left';

const NEGATIVE_PROMPT =
  'cartoon, anime, fantasy, magical glow, bright neon colors, steampunk, dragons, runes, glyphs, ' +
  'text, logos, watermark, background, scene, landscape, ground, floor, human figures';

// ── Asset definition ──
interface ModuleAsset {
  id: string;
  prompt: string;
}

const ASSET: ModuleAsset = {
  id: 'miniaturization_factory',
  prompt:
    'miniaturization factory production module, compact precision assembly chamber, ' +
    'multiple delicate robotic arms with fine manipulators working on tiny components, ' +
    'holographic schematic displays projected above the workbench, magnification lenses, ' +
    'sleek dark gunmetal hull with subtle cyan accent lights, micro-scale fabrication core ' +
    'with visible miniature internal mechanisms, advanced late-game high-tech industrial aesthetic',
};

// ── fal.ai helpers (mirrored from generate-module-gap-fill.ts) ──

function httpsRequest(options: https.RequestOptions, body?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c: string) => { data += c; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function httpsGet(url: string, headers: Record<string, string>): Promise<string> {
  const u = new URL(url);
  return httpsRequest({
    hostname: u.hostname,
    path: u.pathname + u.search,
    method: 'GET',
    headers,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function downloadBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const dl = (u: string): void => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          dl(res.headers.location as string);
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    };
    dl(url);
  });
}

async function generateImage(prompt: string): Promise<Buffer> {
  const fullPrompt = `${prompt}, ${BASE_STYLE}`;
  const submitBody = JSON.stringify({
    prompt: fullPrompt,
    negative_prompt: NEGATIVE_PROMPT,
    image_size: { width: 512, height: 512 },
    num_inference_steps: 28,
    guidance_scale: 7.5,
    num_images: 1,
    enable_safety_checker: false,
    output_format: 'png',
  });

  const submitRaw = await httpsRequest(
    {
      hostname: 'queue.fal.run',
      path: '/fal-ai/flux/dev',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
    },
    submitBody,
  );

  const submit = JSON.parse(submitRaw);
  if (!submit.status_url) {
    throw new Error(`Submit failed: ${submitRaw}`);
  }

  process.stdout.write('    waiting');
  for (let i = 0; i < 120; i++) {
    await sleep(2000);
    const status = JSON.parse(
      await httpsGet(submit.status_url, { Authorization: `Key ${FAL_API_KEY}` }),
    );
    if (status.status === 'COMPLETED') {
      const result = JSON.parse(
        await httpsGet(submit.response_url, { Authorization: `Key ${FAL_API_KEY}` }),
      );
      console.log(' done');
      return downloadBuffer(result.images[0].url as string);
    }
    if (status.status === 'FAILED') {
      throw new Error(`Generation failed: ${JSON.stringify(status)}`);
    }
    process.stdout.write('.');
  }
  throw new Error('Timeout waiting for generation');
}

async function uploadToFal(buffer: Buffer, fileName: string): Promise<string> {
  const initRaw = await httpsRequest(
    {
      hostname: 'rest.alpha.fal.ai',
      path: '/storage/upload/initiate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
    },
    JSON.stringify({ content_type: 'image/png', file_name: fileName }),
  );
  const init = JSON.parse(initRaw);

  const uploadUrl = new URL(init.upload_url);
  await new Promise<void>((resolve, reject) => {
    const req = https.request(
      {
        hostname: uploadUrl.hostname,
        path: uploadUrl.pathname + uploadUrl.search,
        method: 'PUT',
        headers: { 'Content-Type': 'image/png', 'Content-Length': buffer.length.toString() },
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve());
      },
    );
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });

  return init.file_url as string;
}

async function removeBackground(imageUrl: string): Promise<Buffer> {
  const raw = await httpsRequest(
    {
      hostname: 'fal.run',
      path: '/fal-ai/birefnet/v2',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
    },
    JSON.stringify({ image_url: imageUrl }),
  );
  const result = JSON.parse(raw);
  if (!result?.image?.url) {
    throw new Error(`Background removal failed: ${raw}`);
  }
  return downloadBuffer(result.image.url as string);
}

/**
 * Trim transparent pixels, then pad to a 2:1 (1024x512) canvas centering the content.
 *
 * Strategy: after trimming we know the visible bounding box. We fit it into a
 * 1024x512 frame preserving aspect ratio (no stretching) by scaling so the larger
 * dimension matches the target axis ratio, then centering with transparent padding.
 */
async function trimAndPadWideWebp(inputBuffer: Buffer): Promise<Buffer> {
  const trimmedPng = await sharp(inputBuffer).trim().png().toBuffer();

  const meta = await sharp(trimmedPng).metadata();
  const trimmedW = meta.width ?? 1;
  const trimmedH = meta.height ?? 1;

  // Determine scale: fit trimmed content into TARGET_WIDTH x TARGET_HEIGHT
  // preserving aspect ratio.
  const scaleX = TARGET_WIDTH / trimmedW;
  const scaleY = TARGET_HEIGHT / trimmedH;
  const scale = Math.min(scaleX, scaleY);

  const scaledW = Math.max(1, Math.round(trimmedW * scale));
  const scaledH = Math.max(1, Math.round(trimmedH * scale));

  const resizedPng = await sharp(trimmedPng)
    .resize(scaledW, scaledH, { fit: 'fill' })
    .png()
    .toBuffer();

  const padLeft = Math.floor((TARGET_WIDTH - scaledW) / 2);
  const padTop = Math.floor((TARGET_HEIGHT - scaledH) / 2);

  return sharp(resizedPng)
    .extend({
      top: padTop,
      bottom: TARGET_HEIGHT - scaledH - padTop,
      left: padLeft,
      right: TARGET_WIDTH - scaledW - padLeft,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 92, effort: 6, smartSubsample: true })
    .toBuffer();
}

async function padWidePng(inputBuffer: Buffer): Promise<{ buffer: Buffer; width: number; height: number }> {
  const trimmedPng = await sharp(inputBuffer).trim().png().toBuffer();
  const meta = await sharp(trimmedPng).metadata();
  const trimmedW = meta.width ?? 1;
  const trimmedH = meta.height ?? 1;

  const scale = Math.min(TARGET_WIDTH / trimmedW, TARGET_HEIGHT / trimmedH);
  const scaledW = Math.max(1, Math.round(trimmedW * scale));
  const scaledH = Math.max(1, Math.round(trimmedH * scale));

  const resizedPng = await sharp(trimmedPng)
    .resize(scaledW, scaledH, { fit: 'fill' })
    .png()
    .toBuffer();

  const padLeft = Math.floor((TARGET_WIDTH - scaledW) / 2);
  const padTop = Math.floor((TARGET_HEIGHT - scaledH) / 2);

  const buffer = await sharp(resizedPng)
    .extend({
      top: padTop,
      bottom: TARGET_HEIGHT - scaledH - padTop,
      left: padLeft,
      right: TARGET_WIDTH - scaledW - padLeft,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return { buffer, width: TARGET_WIDTH, height: TARGET_HEIGHT };
}

function outPathFor(asset: ModuleAsset): string {
  return path.join(MODULES_DIR, asset.id, `${asset.id}_0.webp`);
}

interface PipelineArtifacts {
  raw: string;
  nobg: string;
  cropped: string;
  final: string;
}

function workPathsFor(asset: ModuleAsset): PipelineArtifacts {
  return {
    raw: path.join(WORK_DIR, 'raw', `${asset.id}_raw.png`),
    nobg: path.join(WORK_DIR, 'nobg', `${asset.id}_nobg.png`),
    cropped: path.join(WORK_DIR, 'cropped', `${asset.id}_cropped.png`),
    final: path.join(WORK_DIR, 'final', `${asset.id}.png`),
  };
}

function ensureDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/**
 * Decide whether we can reuse the existing nobg artifact and skip fal.ai roundtrips.
 * Reuse if either:
 *   - MINI_FACTORY_REUSE_PIPELINE=1 is set, or
 *   - The nobg file already exists AND no FAL_API_KEY is available.
 * Always reuse when the nobg artifact exists and is non-empty (saves API credits
 * for a pure dimension-change re-run).
 */
function shouldReuseNobg(asset: ModuleAsset): boolean {
  const nobgPath = workPathsFor(asset).nobg;
  if (!fs.existsSync(nobgPath)) return false;
  const stat = fs.statSync(nobgPath);
  if (stat.size < 1024) return false;

  // Honour explicit env var; otherwise default to reuse when nobg is present.
  if (process.env['MINI_FACTORY_REUSE_PIPELINE'] === '0') return false;
  return true;
}

async function processAssetOnce(asset: ModuleAsset): Promise<void> {
  const outFile = outPathFor(asset);
  ensureDir(outFile);

  const work = workPathsFor(asset);
  for (const p of Object.values(work)) ensureDir(p);

  let noBgBuffer: Buffer;

  if (shouldReuseNobg(asset)) {
    console.log('    [1-3/5] REUSE: reading existing nobg artifact (skipping fal.ai)');
    noBgBuffer = fs.readFileSync(work.nobg);
    console.log(`         loaded nobg <- ${path.relative(process.cwd(), work.nobg)} (${noBgBuffer.length} bytes)`);
  } else {
    if (!FAL_API_KEY) {
      throw new Error('FAL_API_KEY not found and no reusable nobg artifact present');
    }
    console.log('    [1/5] generating via fal.ai flux/dev (512x512)...');
    const rawBuffer = await generateImage(asset.prompt);
    fs.writeFileSync(work.raw, rawBuffer);
    console.log(`         saved raw -> ${path.relative(process.cwd(), work.raw)} (${rawBuffer.length} bytes)`);

    console.log('    [2/5] uploading for BG removal...');
    const falUrl = await uploadToFal(rawBuffer, `${asset.id}_raw.png`);

    console.log('    [3/5] removing background (birefnet/v2)...');
    noBgBuffer = await removeBackground(falUrl);
    fs.writeFileSync(work.nobg, noBgBuffer);
    console.log(`         saved nobg -> ${path.relative(process.cwd(), work.nobg)} (${noBgBuffer.length} bytes)`);
  }

  console.log('    [4/5] trim + pad to 2:1 wide canvas (PNG snapshots for pipeline traceability)...');
  const trimmedPng = await sharp(noBgBuffer).trim().png().toBuffer();
  fs.writeFileSync(work.cropped, trimmedPng);
  const cropMeta = await sharp(trimmedPng).metadata();
  console.log(`         cropped -> ${cropMeta.width}x${cropMeta.height} (${path.relative(process.cwd(), work.cropped)})`);

  // Final wide WebP for game use
  const finalWebp = await trimAndPadWideWebp(noBgBuffer);
  fs.writeFileSync(outFile, finalWebp);

  // Also keep a PNG snapshot in assets/final/ for parity with CLAUDE.md pipeline
  const { buffer: finalPng } = await padWidePng(noBgBuffer);
  fs.writeFileSync(work.final, finalPng);

  console.log('    [5/5] writing final game asset (WebP Q92)...');
  const finalMeta = await sharp(outFile).metadata();
  console.log(
    `         saved -> ${path.relative(process.cwd(), outFile)} ` +
    `(${finalMeta.width}x${finalMeta.height}, alpha=${finalMeta.hasAlpha}, ${finalWebp.length} bytes)`,
  );
}

async function processAssetWithRetry(
  asset: ModuleAsset,
  maxAttempts = 3,
): Promise<'generated' | 'failed'> {
  // NOTE: We deliberately do NOT skip-if-exists here. This script is invoked
  // specifically to (re)generate the asset at a new target size, so any existing
  // output file must be overwritten.
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`  ${asset.id} — attempt ${attempt}/${maxAttempts}`);
      await processAssetOnce(asset);
      return 'generated';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`    attempt ${attempt} FAILED: ${msg}`);
      if (attempt < maxAttempts) {
        console.log('    retrying after 3s...');
        await sleep(3000);
      }
    }
  }

  return 'failed';
}

interface ValidationIssue {
  field: string;
  detail: string;
}

async function validateAsset(asset: ModuleAsset): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const outFile = outPathFor(asset);

  if (!fs.existsSync(outFile)) {
    issues.push({ field: 'existence', detail: 'file missing' });
    return issues;
  }

  const stat = fs.statSync(outFile);
  if (stat.size < 5 * 1024) {
    issues.push({ field: 'size', detail: `file too small (${stat.size} bytes, expected > 5KB)` });
  }

  const meta = await sharp(outFile).metadata();
  if (meta.format !== 'webp') {
    issues.push({ field: 'format', detail: `wrong format ${meta.format} (expected webp)` });
  }
  if (!meta.hasAlpha) {
    issues.push({ field: 'alpha', detail: 'no alpha channel' });
  }
  // 2:1 wide asset (Rudi-specified): require exact 1024x512.
  if (meta.width !== TARGET_WIDTH || meta.height !== TARGET_HEIGHT) {
    issues.push({
      field: 'dimensions',
      detail: `wrong size ${meta.width}x${meta.height} (expected ${TARGET_WIDTH}x${TARGET_HEIGHT})`,
    });
  }

  return issues;
}

/**
 * Remove stale mipmap files so generate-mipmaps will regenerate them from the
 * new source. Necessary because generate-mipmaps skips outputs that are newer
 * than the source — but when we just rewrote the source, the existing mips at
 * the old dimensions would still satisfy that check on some filesystems.
 */
function clearStaleMipmaps(asset: ModuleAsset): void {
  const dir = path.dirname(outPathFor(asset));
  if (!fs.existsSync(dir)) return;
  const suffixes = ['@half', '@quarter', '@eighth'];
  for (const f of fs.readdirSync(dir)) {
    if (suffixes.some((s) => f.includes(s))) {
      const full = path.join(dir, f);
      fs.unlinkSync(full);
      console.log(`  removed stale mipmap: ${path.relative(process.cwd(), full)}`);
    }
  }
}

async function main(): Promise<void> {
  console.log('=== MINIATURIZATION_FACTORY Asset Generation (1024x512) ===');
  console.log(`Modules dir: ${MODULES_DIR}`);
  console.log(`Work dir:    ${WORK_DIR}`);
  console.log(`Target:      ${TARGET_WIDTH}x${TARGET_HEIGHT}`);
  console.log(`FAL key:     ${FAL_API_KEY ? 'present' : 'absent'}`);
  console.log(`Reuse nobg:  ${shouldReuseNobg(ASSET) ? 'YES (skip fal.ai)' : 'NO (will call fal.ai)'}`);
  console.log('');

  console.log(`[1/1] ${ASSET.id}`);
  const status = await processAssetWithRetry(ASSET);
  console.log('');

  if (status === 'failed') {
    console.error('=== GENERATION FAILED ===');
    process.exit(1);
  }

  console.log('=== Validation ===');
  const issues = await validateAsset(ASSET);
  if (issues.length === 0) {
    console.log(`  ${ASSET.id}: OK`);
  } else {
    console.log(`  ${ASSET.id}: ${issues.length} issue(s)`);
    for (const issue of issues) {
      console.log(`    - ${issue.field}: ${issue.detail}`);
    }
  }
  console.log('');

  console.log('=== Mipmap cleanup + generation ===');
  clearStaleMipmaps(ASSET);
  const { generateMipmapsForFile } = await import('./generate-mipmaps.js');
  const outFile = outPathFor(ASSET);
  const count = await generateMipmapsForFile(outFile);
  console.log(`  ${ASSET.id}: ${count} mipmap(s) generated/updated`);
  console.log('');

  console.log('=== Final files ===');
  const dir = path.dirname(outFile);
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(ASSET.id));
  for (const f of files) {
    const stat = fs.statSync(path.join(dir, f));
    const meta = await sharp(path.join(dir, f)).metadata();
    console.log(
      `  ${path.join(path.relative(process.cwd(), dir), f)}  ` +
      `(${meta.width}x${meta.height}, ${stat.size} bytes)`,
    );
  }
  console.log('');

  console.log('=== SUMMARY ===');
  console.log(`Status: ${status.toUpperCase()}`);
  console.log(`Validation issues: ${issues.length}`);
  console.log('\nDone!');
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('Fatal error:', msg);
  process.exit(1);
});
