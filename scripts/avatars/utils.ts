/**
 * Shared utilities for avatar generation pipeline.
 *
 * Uses raw https/http modules — no external dependencies.
 * Follows the same patterns as other scripts/ generators.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// API keys / env parsing (scripts/.env)
// ---------------------------------------------------------------------------

const ENV_PATH = path.join(__dirname, '..', '.env');

/**
 * Strip one pair of wrapping quotes (single or double) from an env value.
 *
 * scripts/.env stores every secret quoted. The previous loader only ran
 * .trim(), so the leading quote character travelled straight into the
 * Authorization header — the request looked well-formed and failed with an
 * opaque 401.
 */
export function stripEnvQuotes(value: string): string {
  const v = value.trim();
  const quoted =
    v.length >= 2 &&
    ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")));
  return quoted ? v.slice(1, -1) : v;
}

/** Parse a dotenv-style file body into a plain map (values de-quoted). */
export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const value = stripEnvQuotes(line.slice(eq + 1));
    if (value) out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

/**
 * First non-empty value among `names`; process.env wins over the file so a
 * one-off shell override still works.
 *
 * Alternative names exist because the fal key is spelled FAL_AI_API_KEY in
 * scripts/.env but FAL_API_KEY in older shells — the loader used to look only
 * for the latter and bailed out on a file that had the key all along.
 */
export function pickEnvVar(vars: Record<string, string>, names: string[]): string | undefined {
  for (const name of names) {
    const fromProcess = process.env[name];
    if (fromProcess) {
      const cleaned = stripEnvQuotes(fromProcess);
      if (cleaned) return cleaned;
    }
    const fromFile = vars[name];
    if (fromFile) return fromFile;
  }
  return undefined;
}

function readEnvFile(): Record<string, string> {
  if (!fs.existsSync(ENV_PATH)) return {};
  return parseEnvFile(fs.readFileSync(ENV_PATH, 'utf-8'));
}

function requireEnvVar(names: string[], purpose: string): string {
  const value = pickEnvVar(readEnvFile(), names);
  if (value) return value;
  console.error(`${names.join(' / ')} not found in env or scripts/.env — ${purpose}`);
  process.exit(1);
}

export function loadApiKey(): string {
  return requireEnvVar(['FAL_AI_API_KEY', 'FAL_API_KEY'], 'required for fal.ai image calls');
}

export interface WanCredentials {
  apiKey: string;
  workspaceId: string;
}

/**
 * Alibaba requires key, workspace and model to belong to the SAME region, so
 * both halves are demanded up front rather than failing mid-render.
 */
export function loadWanCredentials(): WanCredentials {
  return {
    apiKey: requireEnvVar(['WAN_API_KEY'], 'required for Alibaba WAN video calls'),
    workspaceId: requireEnvVar(
      ['WAN_WORKSPACE_ID'],
      `required to build the ${WAN_REGION} WAN endpoint`,
    ),
  };
}

// ---------------------------------------------------------------------------
// Low-level HTTP helpers
// ---------------------------------------------------------------------------

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function httpsRequest(options: https.RequestOptions, body?: string | Buffer): Promise<string> {
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

export function httpsGet(url: string, headers: Record<string, string>): Promise<string> {
  const u = new URL(url);
  return httpsRequest({
    hostname: u.hostname,
    path: u.pathname + u.search,
    method: 'GET',
    headers,
  });
}

export function downloadBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const dl = (u: string): void => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers['location']) {
          dl(res.headers['location']);
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };
    dl(url);
  });
}

// ---------------------------------------------------------------------------
// fal.ai storage upload
// ---------------------------------------------------------------------------

export async function uploadToFal(
  apiKey: string,
  buffer: Buffer,
  fileName: string,
  contentType: string = 'image/png',
): Promise<string> {
  const initRaw = await httpsRequest({
    hostname: 'rest.alpha.fal.ai',
    path: '/storage/upload/initiate',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Key ${apiKey}`,
    },
  }, JSON.stringify({ content_type: contentType, file_name: fileName }));

  const init = JSON.parse(initRaw);
  if (!init.upload_url || !init.file_url) {
    throw new Error(`Storage initiate failed: ${initRaw}`);
  }

  const uploadUrl = new URL(init.upload_url);
  await new Promise<void>((resolve, reject) => {
    const req = https.request({
      hostname: uploadUrl.hostname,
      path: uploadUrl.pathname + uploadUrl.search,
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.length.toString(),
      },
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve());
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });

  return init.file_url as string;
}

// ---------------------------------------------------------------------------
// fal.ai queue submission + polling
// ---------------------------------------------------------------------------

export interface SubmitResult {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
}

export async function submitGeneration(
  apiKey: string,
  prompt: string,
  width: number,
  height: number,
  model: string = '/fal-ai/flux-pro/v1.1',
): Promise<SubmitResult> {
  const body = JSON.stringify({
    prompt,
    image_size: { width, height },
    num_inference_steps: 28,
    guidance_scale: 7.5,
    num_images: 1,
    enable_safety_checker: false,
    output_format: 'png',
  });

  const raw = await httpsRequest({
    hostname: 'queue.fal.run',
    path: model,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Key ${apiKey}`,
    },
  }, body);

  const parsed = JSON.parse(raw);
  if (!parsed.status_url) {
    throw new Error(`Submit failed: ${raw}`);
  }

  return {
    requestId: parsed.request_id as string,
    statusUrl: parsed.status_url as string,
    responseUrl: parsed.response_url as string,
  };
}

export async function pollResult(
  apiKey: string,
  submit: SubmitResult,
  maxAttempts: number = 120,
): Promise<unknown> {
  const headers = { 'Authorization': `Key ${apiKey}` };

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(2000);

    const data = await httpsGet(submit.statusUrl, headers);
    const parsed = JSON.parse(data);

    if (parsed.status === 'COMPLETED') {
      const result = await httpsGet(submit.responseUrl, headers);
      return JSON.parse(result);
    }

    if (parsed.status === 'FAILED') {
      throw new Error(`Generation failed: ${JSON.stringify(parsed)}`);
    }

    process.stdout.write('.');
  }

  throw new Error('Timeout waiting for result');
}

// ---------------------------------------------------------------------------
// Image generation (Flux Pro v1.1)
// ---------------------------------------------------------------------------

export async function generateImage(
  apiKey: string,
  prompt: string,
  width: number,
  height: number,
): Promise<string> {
  const submit = await submitGeneration(apiKey, prompt, width, height, '/fal-ai/flux-pro/v1.1');
  process.stdout.write('  waiting');
  const result = await pollResult(apiKey, submit) as { images: Array<{ url: string }> };
  console.log(' done');
  return result.images[0].url;
}

// ---------------------------------------------------------------------------
// Upscale via creative-upscaler
// ---------------------------------------------------------------------------

export async function upscaleImage(
  apiKey: string,
  imageUrl: string,
  scale: number = 2,
): Promise<string> {
  const body = JSON.stringify({
    image_url: imageUrl,
    scale,
    creativity: 0.3,
    override_size_limits: true,
  });

  const raw = await httpsRequest({
    hostname: 'queue.fal.run',
    path: '/fal-ai/creative-upscaler',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Key ${apiKey}`,
    },
  }, body);

  const parsed = JSON.parse(raw);
  if (!parsed.status_url) {
    throw new Error(`Upscale submit failed: ${raw}`);
  }

  const submit: SubmitResult = {
    requestId: parsed.request_id as string,
    statusUrl: parsed.status_url as string,
    responseUrl: parsed.response_url as string,
  };

  process.stdout.write('  upscaling');
  const result = await pollResult(apiKey, submit) as Record<string, unknown>;
  console.log(' done');

  // creative-upscaler may return { image: { url } } or { images: [{ url }] }
  const imageObj = result.image as { url: string } | undefined;
  const imagesArr = result.images as Array<{ url: string }> | undefined;
  const url = imageObj?.url ?? imagesArr?.[0]?.url;
  if (!url) {
    throw new Error(`Upscale result has no image URL. Keys: ${Object.keys(result).join(', ')}. Full: ${JSON.stringify(result).slice(0, 500)}`);
  }
  return url;
}

// ---------------------------------------------------------------------------
// Background removal (birefnet with rembg fallback)
// ---------------------------------------------------------------------------

/**
 * Tuning parameters for the birefnet matting call.
 *
 * WARUM NICHT DIE DEFAULTS: birefnet fährt ohne diese Felder auf
 * model='General Use (Light)' (Salient-Object-Segmentierung statt
 * Portrait-Matting), operating_resolution='1024x1024' (die Matte wird auf
 * unseren 2048×2880-Quellen klein gerechnet und hochskaliert) und
 * refine_foreground=false (keine Farbtrennung an der Kante). Ergebnis waren
 * verwaschene Haarkanten: praktisch kein freistehender Strähnenpixel und ein
 * gleichmäßig weicher Saum von ~9 px. Mit den Werten unten bleibt die Figur
 * unverändert, die Kante wird bei voller Auflösung sauber.
 *
 * Werte per 422-Probe gegen die API verifiziert
 * (siehe scripts/avatars/probe-birefnet.cjs) — nicht raten:
 *   model:                'General Use (Light)' | 'General Use (Heavy)' | 'Portrait'
 *   operating_resolution: '1024x1024' | '2048x2048'
 * ENDPOINT: fal-ai/birefnet/v2 — derselbe, den scripts/avatars/uni-bg-cutout.cjs
 * für die freigegebenen Referenzbilder benutzt hat. Auf v2 existiert zusätzlich
 * '2304x2304', das aber nur für 'General Use (Dynamic)' gültig ist — in
 * Kombination mit 'Portrait' wirft es weiterhin einen Fehler.
 */
export interface BirefnetMattingOptions {
  model: string;
  operating_resolution: string;
  refine_foreground: boolean;
}

export const BIREFNET_PORTRAIT_MATTING: BirefnetMattingOptions = {
  model: 'Portrait',
  operating_resolution: '2048x2048',
  refine_foreground: true,
};

/**
 * Submit a raw background-removal request and poll for result.
 * Returns the URL of the resulting alpha-PNG.
 *
 * `params` are merged into the request body — birefnet-specific tuning fields
 * are NOT sent to the rembg fallback, das Modell kennt sie nicht.
 */
async function submitBgRemove(
  apiKey: string,
  modelPath: string,
  imageUrl: string,
  params: Record<string, unknown> = {},
): Promise<string> {
  const body = JSON.stringify({ image_url: imageUrl, ...params });

  const raw = await httpsRequest({
    hostname: 'queue.fal.run',
    path: modelPath,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Key ${apiKey}`,
    },
  }, body);

  const parsed = JSON.parse(raw);
  if (!parsed.status_url) {
    throw new Error(`BG-remove submit failed (${modelPath}): ${raw}`);
  }

  const submit: SubmitResult = {
    requestId: parsed.request_id as string,
    statusUrl: parsed.status_url as string,
    responseUrl: parsed.response_url as string,
  };

  const result = await pollResult(apiKey, submit) as Record<string, unknown>;

  // Various BG-remove endpoints return { image: { url } } or { images: [{ url }] }
  const imageObj = result.image as { url: string } | undefined;
  const imagesArr = result.images as Array<{ url: string }> | undefined;
  const url = imageObj?.url ?? imagesArr?.[0]?.url;
  if (!url) {
    throw new Error(
      `BG-remove result missing URL (${modelPath}). Keys: ${Object.keys(result).join(', ')}. ` +
      `Full: ${JSON.stringify(result).slice(0, 500)}`,
    );
  }
  return url;
}

/**
 * Remove background from an image. Tries birefnet first, falls back to rembg.
 *
 * Defaults auf BIREFNET_PORTRAIT_MATTING (Portrait @2048 + refine_foreground) —
 * für Avatare/Figuren die richtige Wahl. Aufrufer, die bewusst eine härtere
 * Kante brauchen, können den Satz überschreiben.
 */
export async function removeBackground(
  apiKey: string,
  imageUrl: string,
  matting: BirefnetMattingOptions = BIREFNET_PORTRAIT_MATTING,
): Promise<string> {
  process.stdout.write(`  removing background (birefnet, ${matting.model} @${matting.operating_resolution})`);
  try {
    const url = await submitBgRemove(apiKey, '/fal-ai/birefnet/v2', imageUrl, {
      model: matting.model,
      operating_resolution: matting.operating_resolution,
      refine_foreground: matting.refine_foreground,
    });
    console.log(' done');
    return url;
  } catch (err) {
    console.log(` failed: ${(err as Error).message.slice(0, 200)}`);
    process.stdout.write('  falling back to rembg');
    const url = await submitBgRemove(apiKey, '/fal-ai/imageutils/rembg', imageUrl);
    console.log(' done');
    return url;
  }
}

// ---------------------------------------------------------------------------
// Background generation (Flux Pro v1.1 Ultra, text-to-image, portrait 9:16)
// ---------------------------------------------------------------------------

/**
 * Portrait 9:16 background size for cutscene frames.
 *
 * flux wants both edges as multiples of 32: 720 / 32 = 22.5 does not divide,
 * 864 / 32 = 27 and 1536 / 32 = 48 do, and 864×1536 is exactly 9:16. 864 px is
 * wider than the 720 px WAN output, so the frame is never upscaled by the
 * video model.
 */
export const BG_WIDTH = 864;
export const BG_HEIGHT = 1536;

/**
 * Generate a setting-specific background image in portrait 9:16.
 * Returns the URL of the resulting PNG.
 *
 * Uses fal-ai/flux/dev with an explicit image_size. The previous
 * image_size='portrait_16_9' preset returned 576×1024 (the old comment
 * claiming 1024×1792 was wrong) — below the 720×1280 video target, so the
 * character was upscaled before it ever reached the video model.
 * output_format='png' avoids the JPEG-EXIF auto-orient trap that
 * flux-pro/v1.1-ultra caused.
 */
export async function generateBackground(apiKey: string, prompt: string): Promise<string> {
  const body = JSON.stringify({
    prompt,
    image_size: { width: BG_WIDTH, height: BG_HEIGHT },
    num_inference_steps: 28,
    guidance_scale: 7.5,
    num_images: 1,
    enable_safety_checker: false,
    output_format: 'png',
  });

  const raw = await httpsRequest({
    hostname: 'queue.fal.run',
    path: '/fal-ai/flux/dev',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Key ${apiKey}`,
    },
  }, body);

  const parsed = JSON.parse(raw);
  if (!parsed.status_url) {
    throw new Error(`BG-generate submit failed: ${raw}`);
  }

  const submit: SubmitResult = {
    requestId: parsed.request_id as string,
    statusUrl: parsed.status_url as string,
    responseUrl: parsed.response_url as string,
  };

  process.stdout.write('  generating background');
  const result = await pollResult(apiKey, submit) as Record<string, unknown>;
  console.log(' done');

  const imagesArr = result.images as Array<{ url: string }> | undefined;
  const url = imagesArr?.[0]?.url;
  if (!url) {
    throw new Error(
      `BG-generate result has no image URL. Keys: ${Object.keys(result).join(', ')}. ` +
      `Full: ${JSON.stringify(result).slice(0, 500)}`,
    );
  }
  return url;
}

// ---------------------------------------------------------------------------
// Composite character onto background (local sharp)
// ---------------------------------------------------------------------------

/**
 * Verify that a BG buffer is actually portrait-oriented (width < height).
 * Logs dimensions and ratio to stdout. Throws on landscape or invalid metadata.
 *
 * Uses failOn:'none' to avoid triggering on minor warnings and does NOT call
 * .rotate() — explicitly skipping EXIF auto-orientation so we see the
 * real pixel dimensions rather than the orientation-tagged view.
 */
export async function verifyPortraitBackground(bgBuffer: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(bgBuffer, { failOn: 'none' }).metadata();
  const w = meta.width;
  const h = meta.height;
  if (!w || !h) {
    throw new Error(`BG metadata missing dimensions (${JSON.stringify(meta)})`);
  }
  const ratio = w / h;
  console.log(`  BG dimensions: ${w}×${h} (ratio ${ratio.toFixed(3)})`);
  if (w >= h) {
    throw new Error(`Expected portrait BG but got ${w}×${h} (ratio ${ratio.toFixed(3)})`);
  }
  return { width: w, height: h };
}

/**
 * Composite a character (alpha-PNG) onto a background image.
 * - Character is scaled to full BG width (aspect ratio preserved)
 * - Horizontally aligned left=0 (full-width), bottom-aligned
 * Returns the resulting PNG buffer with the same dimensions as the BG.
 *
 * IMPORTANT: sharp is loaded with failOn:'none' and .rotate() is NOT invoked
 * (calling .rotate() without args applies EXIF auto-orientation which
 * previously mangled portrait BGs). Pre-flight verifyPortraitBackground
 * aborts loudly if the BG is landscape — better than silent-fail composites.
 */
export async function compositeCharacterOnBackground(
  characterBuffer: Buffer,
  bgBuffer: Buffer,
): Promise<Buffer> {
  const bgMeta = await sharp(bgBuffer, { failOn: 'none' }).metadata();
  const bgW = bgMeta.width;
  const bgH = bgMeta.height;
  if (!bgW || !bgH) {
    throw new Error(`Composite: BG metadata missing dimensions (${JSON.stringify(bgMeta)})`);
  }
  if (bgW >= bgH) {
    throw new Error(`Composite: BG image is not portrait: ${bgW}×${bgH}`);
  }

  const charMeta = await sharp(characterBuffer, { failOn: 'none' }).metadata();
  const charOrigW = charMeta.width;
  const charOrigH = charMeta.height;
  if (!charOrigW || !charOrigH) {
    throw new Error(`Composite: character metadata missing dimensions (${JSON.stringify(charMeta)})`);
  }

  // Ashford füllt volle BG-Breite; Höhe folgt aspect ratio.
  // Da Ashford-Ratio (charW/charH ≈ 0.711) > BG-Ratio (typisch 0.563 für 9:16),
  // bleibt die resultierende Höhe < bg.height → passt immer.
  let targetW = bgW;
  let targetH = Math.round(targetW * (charOrigH / charOrigW));

  // Defensive Guard: falls BG-Ratio jemals breiter wird und Höhe > bgH wäre,
  // fallback auf height-fit (bottom-aligned, center-x).
  if (targetH > bgH) {
    console.warn(
      `  ⚠ Composite: full-width scale would exceed BG height ` +
      `(${targetW}×${targetH} vs BG ${bgW}×${bgH}); falling back to height-fit.`,
    );
    targetH = bgH;
    targetW = Math.round(targetH * (charOrigW / charOrigH));
  }

  const resizedChar = await sharp(characterBuffer, { failOn: 'none' })
    .resize(targetW, targetH, { fit: 'fill' })
    .png()
    .toBuffer();

  const left = Math.max(0, Math.round((bgW - targetW) / 2));
  const top = Math.max(0, bgH - targetH);

  const out = await sharp(bgBuffer, { failOn: 'none' })
    .composite([{ input: resizedChar, left, top }])
    .png()
    .toBuffer();

  return out;
}

/**
 * Turn a composite frame into the exact buffer WAN receives: opaque JPEG.
 *
 * The composite is RGBA with hasAlpha=true — sharp's .composite(...).png()
 * promotes to RGBA even when the background is fully opaque, and WAN rejects
 * images carrying a transparent channel. JPEG cannot represent alpha by
 * construction, so flatten+jpeg satisfies the requirement structurally rather
 * than by promise. Side effect: the base64 body drops from ~4.7 MB to ~0.7 MB.
 */
export async function prepareFrameBuffer(compositeBuffer: Buffer): Promise<Buffer> {
  return sharp(compositeBuffer, { failOn: 'none' })
    .flatten({ background: '#000' })
    .jpeg({ quality: 92 })
    .toBuffer();
}

export interface FrameInfo {
  width: number;
  height: number;
  format: string;
  hasAlpha: boolean;
  bytes: number;
}

/** Describe a frame buffer for dry-run reporting. */
export async function describeFrameBuffer(buffer: Buffer): Promise<FrameInfo> {
  const meta = await sharp(buffer, { failOn: 'none' }).metadata();
  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    format: meta.format ?? 'unknown',
    hasAlpha: meta.hasAlpha === true,
    bytes: buffer.length,
  };
}

// ---------------------------------------------------------------------------
// Video compression for app bundle (ffmpeg-static)
// ---------------------------------------------------------------------------

/**
 * Compress a WAN-generated cutscene video (720×1280, 15 s) to bundle-friendly
 * size while keeping iOS-compatible H.264 main/L4.0, yuv420p, +faststart,
 * no audio.
 *
 * Quality-targeted (CRF 30) instead of the old fixed 1.2 Mbps bitrate: a 15 s
 * clip at a fixed rate triples the file for no visible gain. -b:v MUST stay
 * removed — with it present x264 switches to ABR and ignores CRF entirely.
 * CRF 28 is the documented fallback if 30 turns out too aggressive now that
 * the source is native 720p (no 1080p→720p downsample smoothing artefacts
 * away before the second lossy pass).
 *
 * scale=720:1280 stays as a guard: if WAN ever returns 704×1280 the filter
 * keeps the bundle format stable. At identical dimensions it is lossless and
 * practically free.
 *
 * Throws on ffmpeg failure (non-zero exit). Caller is responsible for any
 * tmp-file / atomic-rename logic.
 */
export function compressVideoForBundle(inputPath: string, outputPath: string): Promise<void> {
  // __dirname resolves to scripts/avatars/ — project root is two levels up.
  const ffmpegPath = path.resolve(__dirname, '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');

  if (!fs.existsSync(ffmpegPath)) {
    return Promise.reject(new Error(`ffmpeg-static binary not found at ${ffmpegPath}`));
  }

  const args = [
    '-i', inputPath,
    '-vf', 'scale=720:1280:flags=lanczos',
    '-c:v', 'libx264',
    '-profile:v', 'main',
    '-level', '4.0',
    '-pix_fmt', 'yuv420p',
    '-preset', 'slow',
    '-crf', '30',
    '-maxrate', '600k',
    '-bufsize', '1200k',
    '-movflags', '+faststart',
    '-an',
    '-y',
    outputPath,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg compression failed (exit ${code}): ${stderr.slice(-800)}`));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Video generation — Alibaba WAN 3.0 (DashScope async image-to-video)
// ---------------------------------------------------------------------------

/**
 * Region the workspace, the model and the API key all belong to. Alibaba
 * rejects any mix of the three across regions, so this is a single constant
 * rather than a per-call argument.
 */
export const WAN_REGION = 'ap-southeast-1';
export const WAN_MODEL = 'wan3.0-video';

/** Alibaba recommends a 15 s poll cadence; 80 attempts = 20 min ceiling. */
export const WAN_POLL_INTERVAL_MS = 15_000;
export const WAN_MAX_POLL_ATTEMPTS = 80;

/**
 * DashScope answers UNKNOWN for tasks it cannot find — a mistyped or expired
 * id. That is terminal in practice, so bail after 4 in a row (~1 min) instead
 * of polling an empty slot for the full 20 minutes, per cutscene.
 */
export const WAN_MAX_CONSECUTIVE_UNKNOWN = 4;

export interface WanVideoOptions {
  /** '720P' at 9:16 resolves to exactly 720×1280 — the bundle target format. */
  resolution: string;
  ratio: string;
  /** Seconds, integer. Kling took a string; that was a fal-side artefact. */
  duration: number;
  promptExtend: boolean;
  watermark: boolean;
}

/**
 * Cutscene defaults. audio stays off (see buildWanRequestBody) — the app
 * plays its own audio layer over the clip. prompt_extend and watermark are set
 * explicitly rather than inherited from the server-side defaults.
 */
export const WAN_CUTSCENE_OPTIONS: WanVideoOptions = {
  resolution: '720P',
  ratio: '9:16',
  duration: 15,
  promptExtend: true,
  watermark: false,
};

export interface WanEndpoints {
  create: string;
  task: (taskId: string) => string;
}

/** Compose both endpoints from workspace id + region. Never hard-wire a host. */
export function wanEndpoints(workspaceId: string, region: string = WAN_REGION): WanEndpoints {
  if (!workspaceId) {
    throw new Error('WAN workspace id missing — set WAN_WORKSPACE_ID in scripts/.env');
  }
  if (!region) {
    throw new Error('WAN region missing — expected e.g. ' + WAN_REGION);
  }
  const base = `https://${workspaceId}.${region}.maas.aliyuncs.com`;
  return {
    create: `${base}/api/v1/services/aigc/video-generation/video-synthesis`,
    task: (taskId: string) => `${base}/api/v1/tasks/${taskId}`,
  };
}

export interface WanRequestBody {
  model: string;
  input: {
    prompt: string;
    media: Array<{ type: string; url: string }>;
  };
  parameters: {
    resolution: string;
    ratio: string;
    duration: number;
    audio: boolean;
    prompt_extend: boolean;
    watermark: boolean;
  };
}

export function buildWanRequestBody(
  prompt: string,
  firstFrameUrl: string,
  opts: WanVideoOptions = WAN_CUTSCENE_OPTIONS,
): WanRequestBody {
  return {
    model: WAN_MODEL,
    input: {
      prompt,
      media: [{ type: 'first_frame', url: firstFrameUrl }],
    },
    parameters: {
      resolution: opts.resolution,
      ratio: opts.ratio,
      duration: opts.duration,
      audio: false,
      prompt_extend: opts.promptExtend,
      watermark: opts.watermark,
    },
  };
}

/** Inline the frame as a data URL — no OSS upload needed at ~0.7 MB JPEG. */
export function frameToDataUrl(frameBuffer: Buffer): string {
  return `data:image/jpeg;base64,${frameBuffer.toString('base64')}`;
}

export type WanTaskDecision =
  | { kind: 'done'; videoUrl: string }
  | { kind: 'pending'; status: string }
  | { kind: 'unknown' }
  | { kind: 'failed'; message: string };

/**
 * Classify one task-status response.
 *
 * SUCCEEDED without output.video_url is a FAILURE, not a success — the old
 * Kling path read result.video.url unchecked and would have thrown a
 * TypeError three frames deep instead of naming the problem.
 */
export function parseWanTaskResponse(raw: unknown): WanTaskDecision {
  const output = (raw as { output?: Record<string, unknown> } | null | undefined)?.output;
  if (!output) {
    return {
      kind: 'failed',
      message: `WAN task response carries no output object: ${JSON.stringify(raw).slice(0, 300)}`,
    };
  }

  const status = typeof output.task_status === 'string' ? output.task_status : '';

  if (status === 'SUCCEEDED') {
    const url = typeof output.video_url === 'string' ? output.video_url : '';
    if (!url) {
      return {
        kind: 'failed',
        message:
          'WAN task reported SUCCEEDED but output.video_url is missing: ' +
          JSON.stringify(output).slice(0, 300),
      };
    }
    return { kind: 'done', videoUrl: url };
  }

  if (status === 'FAILED' || status === 'CANCELED') {
    const code = output.code ? ` (${String(output.code)})` : '';
    const message = output.message
      ? String(output.message)
      : JSON.stringify(output).slice(0, 300);
    return { kind: 'failed', message: `WAN task ${status}${code}: ${message}` };
  }

  if (status === 'UNKNOWN') return { kind: 'unknown' };

  return { kind: 'pending', status: status || 'PENDING' };
}

export interface WanPollDeps {
  fetchTask: (taskId: string) => Promise<unknown>;
  sleep: (ms: number) => Promise<void>;
  onTick?: (status: string) => void;
}

export async function pollWanTask(
  taskId: string,
  deps: WanPollDeps,
  maxAttempts: number = WAN_MAX_POLL_ATTEMPTS,
  intervalMs: number = WAN_POLL_INTERVAL_MS,
): Promise<string> {
  let consecutiveUnknown = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await deps.sleep(intervalMs);
    const decision = parseWanTaskResponse(await deps.fetchTask(taskId));

    if (decision.kind === 'done') return decision.videoUrl;
    if (decision.kind === 'failed') throw new Error(decision.message);

    if (decision.kind === 'unknown') {
      consecutiveUnknown++;
      if (consecutiveUnknown >= WAN_MAX_CONSECUTIVE_UNKNOWN) {
        throw new Error(
          `WAN task ${taskId} returned UNKNOWN ${consecutiveUnknown}x in a row — ` +
            'treating as nonexistent or expired.',
        );
      }
      deps.onTick?.('UNKNOWN');
      continue;
    }

    consecutiveUnknown = 0;
    deps.onTick?.(decision.status);
  }

  const minutes = Math.round((maxAttempts * intervalMs) / 60_000);
  throw new Error(`WAN task ${taskId} unfinished after ${maxAttempts} polls (~${minutes} min).`);
}

/**
 * WAN-only HTTP helper: checks the status code and enforces a timeout.
 *
 * httpsRequest() above does neither — a WAN 401 or 429 would surface as a
 * JSON parse error with the real cause thrown away. That helper stays
 * untouched because the whole fal image path depends on its behaviour.
 * The API key never appears in an error message.
 */
function wanHttpJson(
  url: string,
  method: 'GET' | 'POST',
  apiKey: string,
  body?: string,
  timeoutMs: number = 60_000,
): Promise<unknown> {
  const u = new URL(url);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
  if (method === 'POST') {
    // Mandatory for the video-synthesis endpoint — without it WAN errors out.
    headers['X-DashScope-Async'] = 'enable';
    headers['Content-Length'] = Buffer.byteLength(body ?? '').toString();
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('error', reject);
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new Error(`WAN ${method} ${u.pathname}: HTTP ${status} — ${text.slice(0, 400)}`));
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch {
            reject(
              new Error(
                `WAN ${method} ${u.pathname}: non-JSON response (HTTP ${status}) — ` +
                  text.slice(0, 400),
              ),
            );
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`WAN ${method} ${u.pathname}: timed out after ${timeoutMs} ms`));
    });
    if (body) req.write(body);
    req.end();
  });
}

export function readWanTaskId(createResponse: unknown): string {
  const output = (createResponse as { output?: Record<string, unknown> } | null | undefined)?.output;
  const taskId = typeof output?.task_id === 'string' ? output.task_id : '';
  if (!taskId) {
    throw new Error(
      `WAN create response has no output.task_id: ${JSON.stringify(createResponse).slice(0, 400)}`,
    );
  }
  return taskId;
}

/** Default sink for the task-id journal. */
export const WAN_TASK_LOG = path.resolve(
  __dirname,
  '..',
  '..',
  'assets',
  'avatars',
  'videos',
  '_wan-tasks.jsonl',
);

/**
 * Append the task id to disk the moment it exists.
 *
 * A batch runs for hours; without this journal an interrupted run loses
 * paid-for, already-finished jobs because nothing remembers their ids.
 * Never throws — a failed journal write must not kill a running render.
 */
export function logWanTask(taskId: string, label: string, logPath: string = WAN_TASK_LOG): void {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const entry = { at: new Date().toISOString(), taskId, label: label.slice(0, 160) };
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf-8');
  } catch (err) {
    console.warn(`  [warn] could not journal WAN task id: ${(err as Error).message}`);
  }
}

/**
 * Submit one image-to-video job and return the finished MP4 as a Buffer.
 *
 * Returns a Buffer, never a URL: WAN's video_url is valid for 24 h only, so
 * the download belongs to task completion rather than to the caller's
 * discipline. base64 encoding, submit, polling and download all live here.
 */
export async function renderCutsceneVideo(
  apiKey: string,
  workspaceId: string,
  frameBuffer: Buffer,
  prompt: string,
  opts: WanVideoOptions = WAN_CUTSCENE_OPTIONS,
  taskLogPath: string = WAN_TASK_LOG,
): Promise<Buffer> {
  const endpoints = wanEndpoints(workspaceId);
  const body = JSON.stringify(buildWanRequestBody(prompt, frameToDataUrl(frameBuffer), opts));

  const created = await wanHttpJson(endpoints.create, 'POST', apiKey, body);
  const taskId = readWanTaskId(created);
  logWanTask(taskId, prompt, taskLogPath);

  process.stdout.write(`  WAN task ${taskId}, polling`);
  const videoUrl = await pollWanTask(taskId, {
    fetchTask: (id) => wanHttpJson(endpoints.task(id), 'GET', apiKey),
    sleep,
    onTick: () => process.stdout.write('.'),
  });
  console.log(' done');

  return downloadBuffer(videoUrl);
}
