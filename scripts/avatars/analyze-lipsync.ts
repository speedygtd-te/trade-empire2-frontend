/**
 * EXPERIMENT HELPER — objective lip-sync check.
 *
 * Companion to wan-story-2seg.ts. Not part of any pipeline.
 *
 * An agent cannot watch a video and hear it at the same time, so "is it
 * lip-synced?" is otherwise unanswerable. This measures it instead:
 *
 *   mouth motion envelope  = frame-to-frame pixel difference inside a crop
 *                            around the speaker's mouth, sampled at FPS_S
 *   audio energy envelope  = RMS of the audio over the same time grid
 *   Pearson correlation    = do they rise and fall together?
 *
 * Interpretation (empirical, for a static camera + single speaker):
 *   r > 0.5   mouth clearly driven by the speech
 *   0.3-0.5   sync present but loose
 *   < 0.15    mouth motion unrelated to audio — no real lip-sync
 *
 * A cross-correlation over +/- LAG_MAX steps also reports the offset at which
 * correlation peaks, which catches audio that is synced but time-shifted.
 *
 * Usage: npx tsx scripts/avatars/analyze-lipsync.ts <video.mp4> [--crop w:h:x:y]
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const FFMPEG = path.join(ROOT, 'node_modules/ffmpeg-static/ffmpeg.exe');

const FPS_S = 12.5;          // sampling rate of both envelopes, Hz
const SR = 16_000;           // audio sample rate for the RMS envelope
const LAG_MAX = 8;           // +/- 8 steps = +/- 0.64 s
/** Mouth crop for a 720x1280 WAN portrait, medium close-up. w:h:x:y */
const DEFAULT_CROP = '200:150:270:660';
/** Downscaled grey size the crop is reduced to before differencing. */
const GW = 48;
const GH = 36;

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (c: Buffer) => (err += c.toString()));
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`exit ${c}: ${err.slice(-500)}`))));
  });
}

/** Mean absolute difference between consecutive greyscale mouth crops. */
function mouthMotion(raw: Buffer): number[] {
  const frameSize = GW * GH;
  const n = Math.floor(raw.length / frameSize);
  const out: number[] = [];
  for (let f = 1; f < n; f++) {
    let sum = 0;
    const a = f * frameSize;
    const b = (f - 1) * frameSize;
    for (let i = 0; i < frameSize; i++) sum += Math.abs(raw[a + i] - raw[b + i]);
    out.push(sum / frameSize);
  }
  return out;
}

function audioEnvelope(pcm: Buffer): number[] {
  const per = Math.round(SR / FPS_S);
  const n = Math.floor(pcm.length / 2 / per);
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    let acc = 0;
    for (let i = 0; i < per; i++) {
      const s = pcm.readInt16LE((k * per + i) * 2) / 32768;
      acc += s * s;
    }
    out.push(Math.sqrt(acc / per));
  }
  return out;
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 4) return NaN;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : NaN;
}

/** Correlation at integer lags; positive lag = video trails audio. */
function bestLag(video: number[], audio: number[]): { lag: number; r: number } {
  let best = { lag: 0, r: -2 };
  for (let lag = -LAG_MAX; lag <= LAG_MAX; lag++) {
    const v: number[] = [];
    const a: number[] = [];
    for (let i = 0; i < video.length; i++) {
      const j = i - lag;
      if (j >= 0 && j < audio.length) {
        v.push(video[i]);
        a.push(audio[j]);
      }
    }
    const r = pearson(v, a);
    if (!Number.isNaN(r) && r > best.r) best = { lag, r };
  }
  return best;
}

async function main(): Promise<void> {
  const videoPath = path.resolve(ROOT, process.argv[2] ?? '');
  const cropIdx = process.argv.indexOf('--crop');
  const crop = cropIdx > 0 ? process.argv[cropIdx + 1] : DEFAULT_CROP;
  if (!process.argv[2] || !fs.existsSync(videoPath)) {
    console.error('Usage: npx tsx scripts/avatars/analyze-lipsync.ts <video.mp4> [--crop w:h:x:y]');
    process.exit(1);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lipsync-'));
  const grayPath = path.join(tmp, 'mouth.gray');
  const pcmPath = path.join(tmp, 'audio.pcm');

  await run(FFMPEG, [
    '-i', videoPath,
    '-vf', `crop=${crop},scale=${GW}:${GH},format=gray,fps=${FPS_S}`,
    '-f', 'rawvideo', '-pix_fmt', 'gray', '-y', grayPath,
  ]);
  await run(FFMPEG, [
    '-i', videoPath, '-vn', '-ac', '1', '-ar', String(SR),
    '-f', 's16le', '-acodec', 'pcm_s16le', '-y', pcmPath,
  ]);

  const motion = mouthMotion(fs.readFileSync(grayPath));
  const envelope = audioEnvelope(fs.readFileSync(pcmPath));
  // motion[i] is the change INTO sample i+1, so drop the audio's first step
  const audioAligned = envelope.slice(1);

  const r0 = pearson(motion, audioAligned);
  const best = bestLag(motion, audioAligned);

  console.log(`=== ${path.basename(videoPath)} ===`);
  console.log(`  crop:                ${crop}  (w:h:x:y in 720x1280)`);
  console.log(`  samples:             ${motion.length} video / ${audioAligned.length} audio @ ${FPS_S} Hz`);
  console.log(`  correlation (lag 0): r = ${r0.toFixed(3)}`);
  console.log(`  best correlation:    r = ${best.r.toFixed(3)} at lag ${best.lag} (${(best.lag / FPS_S).toFixed(2)} s)`);
  console.log(`  verdict:             ${best.r > 0.5 ? 'lip-sync clearly present' : best.r > 0.3 ? 'lip-sync present but loose' : best.r > 0.15 ? 'weak / ambiguous' : 'no lip-sync detectable'}`);

  fs.rmSync(tmp, { recursive: true, force: true });
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
