/**
 * EXPERIMENT HELPER — measurable comparison of two speech segments.
 *
 * Companion to wan-story-2seg.ts. Not part of any pipeline.
 *
 * An agent cannot listen. This script replaces "sounds like the same person"
 * with numbers that either support or contradict that claim:
 *
 *   F0 (fundamental frequency)  — the single strongest speaker cue. Two takes
 *                                 of one voice sit within a few Hz of median;
 *                                 a different voice typically moves 15 Hz+.
 *   F0 spread (IQR)             — intonation range / delivery style.
 *   Spectral centroid           — timbre brightness. Same larynx + same mic
 *                                 chain lands in the same band.
 *   Voiced ratio + pause count  — speaking rate and phrasing.
 *   Integrated loudness (LUFS)  — level match across the cut.
 *
 * Usage: npx tsx scripts/avatars/analyze-speech.ts <a.mp4> <b.mp4> ...
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const FFMPEG = path.join(ROOT, 'node_modules/ffmpeg-static/ffmpeg.exe');

const SAMPLE_RATE = 16_000;
const FRAME = 1024; // 64 ms
const HOP = 256; // 16 ms
const F0_MIN = Number(process.env.F0_MIN ?? 60);
const F0_MAX = Number(process.env.F0_MAX ?? 400);

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout.on('data', (c: Buffer) => (out += c.toString()));
    proc.stderr.on('data', (c: Buffer) => (err += c.toString()));
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve(out + err) : reject(new Error(`exit ${code}: ${err.slice(-600)}`)),
    );
  });
}

/** Decode to mono 16 kHz float samples via a headerless s16le pipe to disk. */
async function decodePcm(videoPath: string, tmpPath: string): Promise<Float32Array> {
  await run(FFMPEG, [
    '-i', videoPath,
    '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE),
    '-f', 's16le', '-acodec', 'pcm_s16le',
    '-y', tmpPath,
  ]);
  const buf = fs.readFileSync(tmpPath);
  const out = new Float32Array(buf.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(i * 2) / 32768;
  return out;
}

interface FrameStat {
  f0: number | null;
  rms: number;
  centroid: number;
}

/**
 * YIN pitch estimate (de Cheveigne & Kawahara 2002).
 *
 * Replaces a plain autocorrelation peak-picker that proved unusable here: its
 * reported median swung between 101 Hz and 219 Hz purely as a function of the
 * search ceiling, because octave errors dominated. YIN's cumulative mean
 * normalised difference function removes exactly that failure mode by
 * normalising each lag against the running mean of all shorter lags, so the
 * true period wins over its own multiples instead of competing with them.
 *
 * Steps: squared difference -> CMNDF -> first minimum below THRESHOLD ->
 * parabolic interpolation for sub-sample precision.
 * Returns null when no lag clears the threshold (unvoiced / noise).
 */
const YIN_THRESHOLD = Number(process.env.YIN_THRESHOLD ?? 0.15);

function estimateF0(frame: Float32Array): number | null {
  const n = frame.length;
  const minLag = Math.max(2, Math.floor(SAMPLE_RATE / F0_MAX));
  const maxLag = Math.min(Math.floor(SAMPLE_RATE / F0_MIN), Math.floor(n / 2) - 1);
  if (maxLag <= minLag) return null;

  // 1. squared difference function
  const d = new Float64Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let sum = 0;
    for (let i = 0; i < n - maxLag; i++) {
      const diff = frame[i] - frame[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // 2. cumulative mean normalised difference
  const cmnd = new Float64Array(maxLag + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxLag; tau++) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }

  // 3. first local minimum below the absolute threshold
  let tauBest = -1;
  for (let tau = minLag; tau <= maxLag; tau++) {
    if (cmnd[tau] < YIN_THRESHOLD) {
      while (tau + 1 <= maxLag && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauBest = tau;
      break;
    }
  }
  if (tauBest < 0) return null;

  // 4. parabolic interpolation around the minimum
  let refined = tauBest;
  if (tauBest > minLag && tauBest < maxLag) {
    const a = cmnd[tauBest - 1];
    const b = cmnd[tauBest];
    const c = cmnd[tauBest + 1];
    const denom = 2 * (2 * b - a - c);
    if (denom !== 0) refined = tauBest + (c - a) / denom;
  }
  return refined > 0 ? SAMPLE_RATE / refined : null;
}

/** In-place iterative radix-2 FFT (re/im), length must be a power of two. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Magnitude-weighted mean frequency (timbre brightness proxy), via real FFT. */
function spectralCentroid(frame: Float32Array): number {
  const n = frame.length; // 1024, power of two
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    // Hann window — without it, frame-edge discontinuities smear the spectrum
    re[i] = frame[i] * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  fft(re, im);

  let num = 0;
  let den = 0;
  for (let k = 1; k < n / 2; k++) {
    const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    num += ((k * SAMPLE_RATE) / n) * mag;
    den += mag;
  }
  return den > 0 ? num / den : 0;
}

/**
 * Two passes on purpose.
 *
 * Pass 1 measures RMS only, so a speech-energy threshold can be derived from
 * the clip itself. Pass 2 estimates F0 ONLY on frames above that threshold.
 *
 * Without the gate, the steady ambient hum WAN mixes under the dialogue is
 * periodic enough to pass the clarity test, so ~90% of frames register as
 * "voiced" in a clip that is only ~50% speech — and the reported F0 becomes a
 * blend of the speaker and the room tone. That contamination is what made a
 * first run of this script disagree with the spectrograms.
 */
function analyseFrames(pcm: Float32Array): { stats: FrameStat[]; threshold: number } {
  const raw: { frame: Float32Array; rms: number }[] = [];
  for (let start = 0; start + FRAME <= pcm.length; start += HOP) {
    const frame = pcm.subarray(start, start + FRAME);
    let rms = 0;
    for (let i = 0; i < frame.length; i++) rms += frame[i] * frame[i];
    raw.push({ frame, rms: Math.sqrt(rms / frame.length) });
  }

  const sortedRms = raw.map((r) => r.rms).sort((a, b) => a - b);
  const threshold = percentile(sortedRms, 60) * 0.5;

  const stats = raw.map(({ frame, rms }) => ({
    f0: rms >= threshold ? estimateF0(frame) : null,
    rms,
    centroid: rms >= threshold ? spectralCentroid(frame) : 0,
  }));
  return { stats, threshold };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

/** Count silence->speech transitions as a phrasing / pause proxy. */
function countPauses(stats: FrameStat[], threshold: number): number {
  let pauses = 0;
  let silentRun = 0;
  let wasSpeaking = false;
  for (const s of stats) {
    if (s.rms < threshold) {
      silentRun++;
    } else {
      // >=15 frames of hop 16 ms ≈ 240 ms gap counts as a real pause
      if (wasSpeaking && silentRun >= 15) pauses++;
      silentRun = 0;
      wasSpeaking = true;
    }
  }
  return pauses;
}

/**
 * Syllable-nucleus count from the energy envelope.
 *
 * The nearest thing to a content check available without an ASR model: a
 * spoken line has roughly one energy peak per syllable. Comparing the count
 * against the syllable count of the script says whether the model spoke
 * approximately the scripted amount of text, or improvised something
 * shorter/longer. It does NOT verify the actual words.
 *
 * Peaks must clear 25% of the median speech level and sit >=120 ms apart
 * (8 syl/s is the practical ceiling for human speech).
 */
function countSyllables(pcm: Float32Array): number {
  const per = Math.round(SAMPLE_RATE / 100); // 10 ms envelope
  const env: number[] = [];
  for (let k = 0; k + per <= pcm.length; k += per) {
    let acc = 0;
    for (let i = 0; i < per; i++) acc += pcm[k + i] * pcm[k + i];
    env.push(Math.sqrt(acc / per));
  }
  // 5-tap moving average removes glottal ripple that would double-count
  const sm = env.map((_, i) => {
    let a = 0;
    let n = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(env.length - 1, i + 2); j++) {
      a += env[j];
      n++;
    }
    return a / n;
  });
  const sorted = [...sm].sort((a, b) => a - b);
  const thresh = sorted[Math.floor(sorted.length * 0.5)] * 0.25;

  let count = 0;
  let lastPeak = -Infinity;
  for (let i = 1; i < sm.length - 1; i++) {
    if (sm[i] > thresh && sm[i] > sm[i - 1] && sm[i] >= sm[i + 1] && i - lastPeak >= 12) {
      count++;
      lastPeak = i;
    }
  }
  return count;
}

async function loudness(videoPath: string): Promise<string> {
  const out = await run(FFMPEG, [
    '-i', videoPath, '-af', 'ebur128=peak=true', '-f', 'null', '-',
  ]).catch((e) => String(e));
  const idx = out.lastIndexOf('Integrated loudness');
  if (idx < 0) return 'n/a';
  return out.slice(idx, idx + 220).split('\n').slice(0, 4).map((l) => l.trim()).join(' | ');
}

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('Usage: npx tsx scripts/avatars/analyze-speech.ts <a.mp4> [b.mp4 ...]');
    process.exit(1);
  }

  for (const f of files) {
    const resolved = path.resolve(ROOT, f);
    const label = path.basename(resolved);
    console.log(`\n=== ${label} ===`);
    if (!fs.existsSync(resolved)) {
      console.log('  MISSING');
      continue;
    }

    const tmp = path.join(path.dirname(resolved), `_${path.basename(resolved)}.pcm`);
    let pcm: Float32Array;
    try {
      pcm = await decodePcm(resolved, tmp);
    } catch (err) {
      console.log(`  no decodable audio stream: ${(err as Error).message.slice(0, 200)}`);
      continue;
    }
    if (pcm.length === 0) {
      console.log('  audio stream present but empty');
      continue;
    }

    const { stats, threshold: speechThreshold } = analyseFrames(pcm);
    const voiced = stats.filter((s) => s.f0 !== null);
    const f0s = voiced.map((s) => s.f0 as number).sort((a, b) => a - b);
    const centroids = stats.filter((s) => s.centroid > 0).map((s) => s.centroid).sort((a, b) => a - b);
    const speaking = stats.filter((s) => s.rms >= speechThreshold).length;

    console.log(`  duration:          ${(pcm.length / SAMPLE_RATE).toFixed(2)} s`);
    console.log(`  frames analysed:   ${stats.length}`);
    console.log(`  voiced frames:     ${voiced.length} (${((voiced.length / stats.length) * 100).toFixed(1)}% of all, speech-gated)`);
    console.log(`  F0 median:         ${percentile(f0s, 50).toFixed(1)} Hz`);
    console.log(`  F0 p25 / p75:      ${percentile(f0s, 25).toFixed(1)} / ${percentile(f0s, 75).toFixed(1)} Hz`);
    console.log(`  F0 p10 / p90:      ${percentile(f0s, 10).toFixed(1)} / ${percentile(f0s, 90).toFixed(1)} Hz`);
    console.log(`  spectral centroid: ${percentile(centroids, 50).toFixed(0)} Hz (median)`);
    console.log(`  speech activity:   ${((speaking / stats.length) * 100).toFixed(1)}%`);
    console.log(`  pauses (>240ms):   ${countPauses(stats, speechThreshold)}`);
    const syl = countSyllables(pcm);
    console.log(`  syllable nuclei:   ${syl} (~${(syl / (pcm.length / SAMPLE_RATE)).toFixed(1)}/s)`);
    let peak = 0;
    for (let i = 0; i < pcm.length; i++) {
      const a = Math.abs(pcm[i]);
      if (a > peak) peak = a;
    }
    console.log(`  peak sample:       ${peak.toFixed(3)}`);
    console.log(`  ${await loudness(resolved)}`);

    fs.unlinkSync(tmp);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
