/**
 * EXPERIMENT — two-segment story video with WAN 3.0 native speech.
 *
 * Not part of the cutscene pipeline. Nothing here is imported by src/ or by
 * the batch runners; utils.ts is read-only from this file's point of view.
 *
 * Why it does not simply call renderCutsceneVideo():
 *   buildWanRequestBody() in utils.ts hard-codes `audio: false` and emits a
 *   single `first_frame` media entry. Both are correct for cutscenes (the app
 *   plays its own audio layer) and wrong for this experiment, whose entire
 *   point is the model-generated voice. Rather than widen the shared cutscene
 *   builder for a throwaway test, this script owns its own request body and
 *   its own HTTP helper (wanHttpJson is module-private in utils.ts) and reuses
 *   everything else — credentials, endpoints, polling, download, task journal.
 *
 * Three assumptions under test:
 *   A1  Does WAN 3.0 speak the quoted line at all, and lip-sync it?
 *   A2  Does the voice survive a segment boundary when only the prompt
 *       description anchors it? (reference_audio is not combinable with
 *       first_frame — see MEDIA EXCLUSION below.)
 *   A3  Does last-frame -> first-frame chaining hide the cut?
 *
 * MEDIA EXCLUSION (from the Wan3.0 API reference):
 *   "The reference_xx/file/link types and first_frame/last_frame types are
 *    mutually exclusive and cannot be used together in the same request."
 *   reference_audio is a reference_xx type, so voice-by-reference and
 *   frame chaining cannot be combined. This script therefore chains frames
 *   and anchors the voice by prompt text only.
 *
 * Usage:
 *   npx tsx scripts/avatars/wan-story-2seg.ts --frame <path-to-start-frame.jpg>
 *   npx tsx scripts/avatars/wan-story-2seg.ts --frame <path> --dry-run
 */

import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import {
  loadWanCredentials,
  wanEndpoints,
  frameToDataUrl,
  prepareFrameBuffer,
  readWanTaskId,
  pollWanTask,
  downloadBuffer,
  logWanTask,
  sleep,
} from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(ROOT, 'assets/avatars/wan-test/story-2seg');

const FFMPEG = path.join(ROOT, 'node_modules/ffmpeg-static/ffmpeg.exe');
const FFPROBE = path.join(ROOT, 'node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe');

// ---------------------------------------------------------------------------
// Script — the regie rule under test: no sentence crosses the segment border.
// Segment 1 ends on a finished sentence, segment 2 opens a new one.
// ---------------------------------------------------------------------------

/**
 * Identical in both prompts, verbatim. This string is the ONLY thing holding
 * the voice together across the cut, so it is a constant rather than two
 * hand-copied fragments that could silently drift apart.
 */
const VOICE =
  'Voice: male, mid-fifties, deep warm baritone, gravelly low register, ' +
  'calm measured unhurried delivery, British Received Pronunciation accent.';

const SPEECH_1 =
  'Welcome to Kepler Station, Administrator. Six months ago this rock held ' +
  'nothing but ice and silence. Today we move eleven thousand tonnes of ore ' +
  'through these docks every cycle. That did not happen by accident.';

const SPEECH_2 =
  'Now the Consortium wants a share of our trade lanes. I have read their ' +
  'terms. They are generous, and that is precisely what worries me. Think ' +
  'carefully before you sign anything, Administrator.';

/** Speaker named up front, quoted line early, voice spec next, scene last. */
function storyPrompt(speech: string, action: string): string {
  return (
    `Director Marcus Ashford, a man in his fifties, speaks directly to the ` +
    `camera. He says: "${speech}" ${VOICE} ${action} Static camera, medium ` +
    `close-up, dark sci-fi colony office, low ambient station hum.`
  );
}

interface Segment {
  name: string;
  prompt: string;
}

const SEGMENTS: Segment[] = [
  {
    name: 'seg1',
    prompt: storyPrompt(SPEECH_1, 'He gestures once with his right hand.'),
  },
  {
    name: 'seg2',
    prompt: storyPrompt(SPEECH_2, 'He leans slightly forward, hands still.'),
  },
];

// ---------------------------------------------------------------------------
// WAN request — audio ON, prompt_extend OFF
// ---------------------------------------------------------------------------

/**
 * prompt_extend is deliberately false, against the WAN_CUTSCENE_OPTIONS
 * default of true. It rewrites the prompt through an LLM before use, which
 * would (a) risk paraphrasing the quoted dialogue that A1 is trying to verify
 * and (b) rewrite the voice description independently per segment — two
 * independent rewrites are exactly the drift A2 is measuring. Turning it off
 * makes both segments carry byte-identical voice wording.
 */
const STORY_PARAMS = {
  resolution: '720P',
  ratio: '9:16',
  duration: 30,
  audio: true,
  prompt_extend: false,
  watermark: false,
} as const;

function buildStoryBody(prompt: string, firstFrameUrl: string): string {
  return JSON.stringify({
    model: 'wan3.0-video',
    input: {
      prompt,
      media: [{ type: 'first_frame', url: firstFrameUrl }],
    },
    parameters: STORY_PARAMS,
  });
}

/** Local twin of the module-private wanHttpJson in utils.ts. Never logs the key. */
function wanHttpJson(
  url: string,
  method: 'GET' | 'POST',
  apiKey: string,
  body?: string,
  timeoutMs = 120_000,
): Promise<unknown> {
  const u = new URL(url);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (method === 'POST') {
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
            reject(new Error(`WAN ${method} ${u.pathname}: non-JSON (HTTP ${status}) — ${text.slice(0, 400)}`));
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

/** Submit + poll + download one 30 s segment. */
async function renderSegment(
  apiKey: string,
  workspaceId: string,
  frameBuffer: Buffer,
  prompt: string,
  label: string,
): Promise<Buffer> {
  const endpoints = wanEndpoints(workspaceId);
  const body = buildStoryBody(prompt, frameToDataUrl(frameBuffer));

  const created = await wanHttpJson(endpoints.create, 'POST', apiKey, body);
  const taskId = readWanTaskId(created);
  logWanTask(taskId, label);

  process.stdout.write(`  WAN task ${taskId}, polling`);
  const videoUrl = await pollWanTask(taskId, {
    fetchTask: (id) => wanHttpJson(endpoints.task(id), 'GET', apiKey),
    sleep,
    onTick: () => process.stdout.write('.'),
  });
  console.log(' done');
  return downloadBuffer(videoUrl);
}

/** One retry per segment, hard stop after that — this experiment has a budget. */
async function renderSegmentWithRetry(
  apiKey: string,
  workspaceId: string,
  frameBuffer: Buffer,
  prompt: string,
  label: string,
): Promise<Buffer> {
  try {
    return await renderSegment(apiKey, workspaceId, frameBuffer, prompt, label);
  } catch (err) {
    console.warn(`  [attempt 1 failed] ${(err as Error).message}`);
    console.warn('  Retrying once (budget cap: 1 retry per segment)...');
    return renderSegment(apiKey, workspaceId, frameBuffer, prompt, `${label} (retry)`);
  }
}

// ---------------------------------------------------------------------------
// ffmpeg / ffprobe helpers
// ---------------------------------------------------------------------------

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(bin)) {
      reject(new Error(`binary not found: ${bin}`));
      return;
    }
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout.on('data', (c: Buffer) => (out += c.toString()));
    proc.stderr.on('data', (c: Buffer) => (err += c.toString()));
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`${path.basename(bin)} exit ${code}: ${err.slice(-800)}`)),
    );
  });
}

/** Grab the very last decoded frame: seek to end-of-file, keep overwriting. */
async function extractLastFrame(videoPath: string, outPath: string): Promise<void> {
  await run(FFMPEG, [
    '-sseof', '-0.5',
    '-i', videoPath,
    '-update', '1',
    '-q:v', '2',
    '-y', outPath,
  ]);
}

async function probe(videoPath: string): Promise<string> {
  return run(FFPROBE, [
    '-v', 'error',
    '-show_entries',
    'stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels,bit_rate,duration:format=duration,size,bit_rate',
    '-of', 'json',
    videoPath,
  ]);
}

/** Concat demuxer, stream copy. Falls back to a re-encode if copy is refused. */
async function concat(parts: string[], outPath: string): Promise<'copy' | 'reencode'> {
  const listPath = path.join(OUT_DIR, '_concat.txt');
  fs.writeFileSync(listPath, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'), 'utf-8');

  try {
    await run(FFMPEG, [
      '-f', 'concat', '-safe', '0', '-i', listPath,
      '-c', 'copy', '-movflags', '+faststart', '-y', outPath,
    ]);
    return 'copy';
  } catch (err) {
    console.warn(`  [concat copy failed] ${(err as Error).message}`);
    console.warn('  Falling back to re-encode...');
    await run(FFMPEG, [
      '-f', 'concat', '-safe', '0', '-i', listPath,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart', '-y', outPath,
    ]);
    return 'reencode';
  }
}

// ---------------------------------------------------------------------------

function parseArgs(): { framePath: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  let framePath = '';
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--frame' && args[i + 1]) framePath = args[++i];
    else if (args[i] === '--dry-run') dryRun = true;
  }
  if (!framePath) {
    console.error('Usage: npx tsx scripts/avatars/wan-story-2seg.ts --frame <path> [--dry-run]');
    process.exit(1);
  }
  return { framePath, dryRun };
}

async function main(): Promise<void> {
  const { framePath, dryRun } = parseArgs();
  const wan = loadWanCredentials();

  const resolved = path.resolve(ROOT, framePath);
  if (!fs.existsSync(resolved)) {
    console.error(`Frame not found: ${resolved}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('=== WAN 3.0 two-segment story experiment ===');
  console.log(`Start frame: ${resolved}`);
  console.log(`Parameters:  ${JSON.stringify(STORY_PARAMS)}`);
  for (const s of SEGMENTS) {
    console.log(`\n[${s.name}] (${s.prompt.length} chars)\n${s.prompt}`);
  }
  console.log('');

  const startFrame = await prepareFrameBuffer(fs.readFileSync(resolved));
  fs.writeFileSync(path.join(OUT_DIR, 'frame_seg1.jpg'), startFrame);
  console.log(`Start frame payload: ${Math.round(startFrame.length / 1024)}KB`);

  if (dryRun) {
    console.log('\n=== DRY RUN — nothing sent to WAN ===');
    console.log(`Endpoint: ${wanEndpoints(wan.workspaceId).create}`);
    const body = buildStoryBody(SEGMENTS[0].prompt, frameToDataUrl(startFrame));
    console.log(`Body size: ${(Buffer.byteLength(body) / 1024 / 1024).toFixed(2)} MB`);
    return;
  }

  // ── Segment 1 ──
  console.log('\nSegment 1/2 — 30s, audio on...');
  const seg1Path = path.join(OUT_DIR, 'seg1.mp4');
  fs.writeFileSync(
    seg1Path,
    await renderSegmentWithRetry(wan.apiKey, wan.workspaceId, startFrame, SEGMENTS[0].prompt, 'story-2seg seg1'),
  );
  console.log(`  Saved: ${seg1Path} (${Math.round(fs.statSync(seg1Path).size / 1024)}KB)`);

  // ── Bridge frame: last frame of seg1 becomes first frame of seg2 ──
  console.log('\nExtracting last frame of segment 1...');
  const bridgeRaw = path.join(OUT_DIR, '_bridge_raw.jpg');
  await extractLastFrame(seg1Path, bridgeRaw);
  const bridgeFrame = await prepareFrameBuffer(fs.readFileSync(bridgeRaw));
  const bridgePath = path.join(OUT_DIR, 'frame_seg2.jpg');
  fs.writeFileSync(bridgePath, bridgeFrame);
  console.log(`  Bridge frame: ${bridgePath} (${Math.round(bridgeFrame.length / 1024)}KB)`);

  // ── Segment 2 ──
  console.log('\nSegment 2/2 — 30s, audio on, chained from bridge frame...');
  const seg2Path = path.join(OUT_DIR, 'seg2.mp4');
  fs.writeFileSync(
    seg2Path,
    await renderSegmentWithRetry(wan.apiKey, wan.workspaceId, bridgeFrame, SEGMENTS[1].prompt, 'story-2seg seg2'),
  );
  console.log(`  Saved: ${seg2Path} (${Math.round(fs.statSync(seg2Path).size / 1024)}KB)`);

  // ── Join ──
  console.log('\nConcatenating...');
  const joinedPath = path.join(OUT_DIR, 'story_2seg.mp4');
  const mode = await concat([seg1Path, seg2Path], joinedPath);
  console.log(`  Mode: ${mode}`);
  console.log(`  Saved: ${joinedPath} (${Math.round(fs.statSync(joinedPath).size / 1024)}KB)`);

  // ── Measurements ──
  console.log('\n=== ffprobe ===');
  for (const [label, p] of [['seg1', seg1Path], ['seg2', seg2Path], ['joined', joinedPath]] as const) {
    console.log(`\n--- ${label} ---`);
    console.log(await probe(p));
  }

  console.log('\n=== COMPLETE ===');
  console.log(`Output dir: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
