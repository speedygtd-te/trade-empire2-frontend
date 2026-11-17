/**
 * Batch generator for Vasquez cutscene videos (composite flow, April 2026).
 *
 * Analog zu batch-ashford-cutscenes.ts — Setting: Dr. Elena Vasquez (Research
 * Director) in einer Höhle mit planet-typ-spezifischem Hintergrund + leuchtendem
 * Artefakt. Jede Cutscene wird einmal getriggert, wenn ein Artefakt auf einem
 * Planeten des jeweiligen Typs entdeckt wird.
 *
 * Per cutscene:
 *   1. Upload base avatar, BG-remove → alpha PNG
 *   2. Flux BG-gen with bgPrompt → scene background (portrait 9:16)
 *   3. Local sharp composite: character onto BG
 *   4. Alibaba WAN 3.0 image-to-video with videoPrompt → 15s portrait MP4
 *   5. ffprobe validate, ffmpeg re-encode for iOS if needed
 *   6. Stage under assets/cutscenes-final/<cutscene-id>.mp4
 *
 * Usage:
 *   npx tsx scripts/avatars/batch-vasquez-cutscenes.ts
 *   npx tsx scripts/avatars/batch-vasquez-cutscenes.ts --only vasquez_artifact_found_earth_like
 *   npx tsx scripts/avatars/batch-vasquez-cutscenes.ts --skip vasquez_artifact_found_earth_like
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { CHARACTERS } from './characters.js';
import { DEFAULT_VIDEO_PROMPT } from './prompts.js';
import {
  loadApiKey,
  uploadToFal,
  removeBackground,
  generateBackground,
  compositeCharacterOnBackground,
  prepareFrameBuffer,
  renderCutsceneVideo,
  loadWanCredentials,
  downloadBuffer,
  verifyPortraitBackground,
  compressVideoForBundle,
} from './utils.js';
import type { WanCredentials } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '../..');
const BASE_DIR = path.join(ROOT, 'assets/avatars/base');
const FRAMES_DIR = path.join(ROOT, 'assets/avatars/frames');
const BG_DIR = path.join(ROOT, 'assets/avatars/backgrounds');
const VIDEOS_DIR = path.join(ROOT, 'assets/avatars/videos');
const FINAL_DIR = path.join(ROOT, 'assets/cutscenes-final');

const FFMPEG = path.join(ROOT, 'node_modules/ffmpeg-static/ffmpeg.exe');
const FFPROBE = path.join(ROOT, 'node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe');

const CHARACTER_ID = 'dr_vasquez';
const MAX_RETRIES = 2;

/** WAN renders 15 s clips; accept a one-second window around that. */
const MIN_DURATION_S = 14;
const MAX_DURATION_S = 16;

interface Cutscene {
  id: string;
  /** Environment-only prompt for Flux BG-gen. No figure/person wording. */
  bgPrompt: string;
  /** Motion-only prompt for the WAN video. No figure/person wording. */
  videoPrompt: string;
}


const CUTSCENES: Cutscene[] = [
  {
    id: 'vasquez_artifact_found_earth_like',
    bgPrompt:
      'natural underground limestone stalactite cave with moss and ferns on walls, sunlight beam piercing through hole in ceiling illuminating ancient alien artifact at center, dust particles floating in light beam, wet rock surfaces, warm earthy palette, cinematic Expanse aesthetic, wide establishing shot, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'vasquez_artifact_found_desert',
    bgPrompt:
      'natural sandstone cavern with layered red-orange rock strata, dry sun beams piercing through ceiling cracks, ancient alien artifact half-buried in sand at center, sand dust floating in air, warm amber palette, cinematic Expanse aesthetic, wide establishing shot, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'vasquez_artifact_found_ice',
    bgPrompt:
      'ice cave with crystalline blue frozen walls, ancient alien artifact embedded in ice among ancient humanoid skeletons frozen in the ice, the artifact glowing blue-white illuminating the skeletal remains, ice stalactites hanging from ceiling, cold atmospheric haze, cinematic Expanse aesthetic, wide establishing shot, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'vasquez_artifact_found_ocean',
    bgPrompt:
      'natural sea cave with underground stream flowing through stone floor, glowing bioluminescent algae on wet stone walls, ancient alien artifact sitting in shallow water at center, water reflections shimmering on ceiling, ambient turquoise and green light, cinematic Expanse aesthetic, wide establishing shot, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'vasquez_artifact_found_volcanic',
    bgPrompt:
      'natural volcanic lava cave with glowing molten lava flowing through a channel in the floor, ancient alien artifact on basalt pedestal above the lava stream, heat shimmer in air, dramatic orange-red illumination, rocky volcanic walls with black basalt formations, cinematic Expanse aesthetic, wide establishing shot, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'vasquez_artifact_found_gas_giant',
    bgPrompt:
      'natural rock cavern inside a floating aerostat island within gas giant atmosphere, thick swirling cloud bands visible through natural arch opening in cave wall, ancient alien artifact at center glowing on stone pedestal, warm amber light mixing with cloud-filtered sunlight, atmospheric haze, wide establishing shot, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'vasquez_artifact_found_ice_giant',
    bgPrompt:
      'natural ice cave on floating frozen platform above ice giant atmosphere, pale blue methane clouds visible through cracks in cave wall, ancient alien artifact at center glowing cold cyan, frozen mist in air, crystalline blue ice formations, cinematic Expanse aesthetic, wide establishing shot, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'vasquez_artifact_found_barren',
    bgPrompt:
      'natural rock cavern on barren moon-like planet, ancient alien artifact on natural stone pedestal at center, small opening in ceiling revealing grey cratered lunar landscape and stars above, dust motes drifting through thin atmosphere, stark shadow contrast, dim cold lighting, cinematic Expanse aesthetic, wide establishing shot, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'vasquez_artifact_found_toxic',
    bgPrompt:
      'natural rock cavern on toxic planet, sickly yellow-green atmospheric haze seeping through cracks in cave wall from outside, ancient alien artifact at center glowing in protective crystal formation, acidic corrosion stains on walls, ominous green-yellow lighting, cinematic Expanse aesthetic, wide establishing shot, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
];

interface ProbeResult {
  codec: string;
  profile: string;
  pixFmt: string;
  duration: number;
  moovEarly: boolean;
}

interface CutsceneResult {
  id: string;
  status: 'OK' | 'FAILED';
  duration: string;
  codec: string;
  pixFmt: string;
  faststart: string;
  reEncoded: boolean;
  error?: string;
  bgPath?: string;
  framePath?: string;
  sourcePath?: string;
  finalPath?: string;
  attempts: number;
}

function probeVideo(file: string): ProbeResult {
  const streamOut = spawnSync(
    FFPROBE,
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name,profile,pix_fmt,duration',
      '-of',
      'json',
      file,
    ],
    { encoding: 'utf-8' },
  );
  if (streamOut.status !== 0) {
    throw new Error(`ffprobe stream failed: ${streamOut.stderr}`);
  }
  const json = JSON.parse(streamOut.stdout) as {
    streams: Array<{ codec_name: string; profile: string; pix_fmt: string; duration: string }>;
  };
  const s = json.streams[0];
  if (!s) throw new Error('No video stream found');

  // Faststart check: inspect moov atom offset.
  const traceOut = spawnSync(FFPROBE, ['-v', 'trace', '-i', file], {
    encoding: 'utf-8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const trace = traceOut.stderr ?? '';
  const firstMb = trace.slice(0, 200_000);
  const moovMatch = firstMb.match(/type:'moov' parent:'root' sz: \d+ (\d+)/);
  const mdatMatch = firstMb.match(/type:'mdat' parent:'root' sz: \d+ (\d+)/);
  let moovEarly = false;
  if (moovMatch && mdatMatch) {
    const moovOffset = parseInt(moovMatch[1], 10);
    const mdatOffset = parseInt(mdatMatch[1], 10);
    moovEarly = moovOffset < mdatOffset;
  } else if (moovMatch && !mdatMatch) {
    moovEarly = true;
  }

  return {
    codec: s.codec_name,
    profile: s.profile,
    pixFmt: s.pix_fmt,
    duration: parseFloat(s.duration),
    moovEarly,
  };
}

function reEncode(input: string, output: string): void {
  const res = spawnSync(
    FFMPEG,
    [
      '-i',
      input,
      '-c:v',
      'libx264',
      '-profile:v',
      'main',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-an',
      '-y',
      output,
    ],
    { encoding: 'utf-8' },
  );
  if (res.status !== 0) {
    throw new Error(`ffmpeg re-encode failed: ${res.stderr}`);
  }
}

function needsReEncode(p: ProbeResult): boolean {
  if (p.codec !== 'h264') return true;
  if (p.pixFmt !== 'yuv420p') return true;
  if (p.duration < MIN_DURATION_S || p.duration > MAX_DURATION_S) {
    return false;
  }
  if (!p.moovEarly) return true;
  return false;
}

/**
 * The background-removed character is identical across every cutscene of a
 * run, but runOne used to re-upload and re-matte it on each of the up to 3
 * attempts. Cache it per character; only the scene background stays per-cutscene.
 */
const cutoutCache = new Map<string, Buffer>();

async function getCharacterCutout(apiKey: string, characterId: string): Promise<Buffer> {
  const cached = cutoutCache.get(characterId);
  if (cached) return cached;

  const basePath = path.join(BASE_DIR, `${characterId}.png`);
  const baseBuffer = fs.readFileSync(basePath);
  const baseFalUrl = await uploadToFal(apiKey, baseBuffer, `${characterId}_base.png`);
  const alphaUrl = await removeBackground(apiKey, baseFalUrl);
  const alphaBuffer = await downloadBuffer(alphaUrl);

  cutoutCache.set(characterId, alphaBuffer);
  return alphaBuffer;
}

interface RunArtifacts {
  videoPath: string;
  framePath: string;
  bgPath: string;
}

async function runOne(
  cs: Cutscene,
  apiKey: string,
  wan: WanCredentials,
  character: typeof CHARACTERS[0],
): Promise<RunArtifacts> {
  const timestamp = Date.now();

  // 1./2. Character cutout (cached — identical for every cutscene)
  const alphaBuffer = await getCharacterCutout(apiKey, character.id);

  // 3. Generate scene BG with bgPrompt (NO character wording)
  const bgUrl = await generateBackground(apiKey, cs.bgPrompt);
  const bgBuffer = await downloadBuffer(bgUrl);

  await verifyPortraitBackground(bgBuffer);

  const bgPath = path.join(BG_DIR, `${character.id}_${cs.id}_${timestamp}_bg.png`);
  fs.writeFileSync(bgPath, bgBuffer);

  // 4. Local sharp composite, then flatten to the opaque JPEG WAN receives
  const composite = await compositeCharacterOnBackground(alphaBuffer, bgBuffer);
  const frameBuffer = await prepareFrameBuffer(composite);
  const framePath = path.join(FRAMES_DIR, `${character.id}_${cs.id}_${timestamp}.jpg`);
  fs.writeFileSync(framePath, frameBuffer);

  // 5. WAN 3.0 image-to-video with videoPrompt (motion only). Returns the MP4
  //    itself because WAN's video_url expires after 24 h.
  const videoBuffer = await renderCutsceneVideo(
    wan.apiKey,
    wan.workspaceId,
    frameBuffer,
    cs.videoPrompt,
  );

  const videoPath = path.join(VIDEOS_DIR, `${character.id}_${cs.id}_${timestamp}.mp4`);
  fs.writeFileSync(videoPath, videoBuffer);

  return { videoPath, framePath, bgPath };
}

function parseArgs(): { only: string[]; skip: string[] } {
  const args = process.argv.slice(2);
  const only: string[] = [];
  const skip: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--only' && args[i + 1]) {
      only.push(args[i + 1]);
      i++;
    } else if (args[i] === '--skip' && args[i + 1]) {
      skip.push(args[i + 1]);
      i++;
    }
  }
  return { only, skip };
}

async function main(): Promise<void> {
  const apiKey = loadApiKey();
  const wan = loadWanCredentials();
  const character = CHARACTERS.find((c) => c.id === CHARACTER_ID);
  if (!character) throw new Error(`Character ${CHARACTER_ID} not found`);

  fs.mkdirSync(FRAMES_DIR, { recursive: true });
  fs.mkdirSync(BG_DIR, { recursive: true });
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  fs.mkdirSync(FINAL_DIR, { recursive: true });

  const { only, skip } = parseArgs();
  const list = CUTSCENES.filter((cs) => {
    if (only.length > 0) return only.includes(cs.id);
    if (skip.includes(cs.id)) return false;
    return true;
  });

  console.log(`=== Batch Vasquez Cutscenes (composite flow) ===`);
  console.log(`Queue: ${list.length} videos`);
  console.log('');

  const results: CutsceneResult[] = [];
  const startTime = Date.now();

  for (let idx = 0; idx < list.length; idx++) {
    const cs = list[idx];
    console.log(`\n[${idx + 1}/${list.length}] ${cs.id}`);
    console.log(`  BG prompt:    ${cs.bgPrompt.slice(0, 90)}...`);
    console.log(`  Video prompt: ${cs.videoPrompt.slice(0, 90)}`);

    const finalPath = path.join(FINAL_DIR, `${cs.id}.mp4`);
    if (fs.existsSync(finalPath)) {
      console.log(`  [skip] already staged at ${finalPath}`);
      try {
        const p = probeVideo(finalPath);
        results.push({
          id: cs.id,
          status: 'OK',
          duration: p.duration.toFixed(2) + 's',
          codec: p.codec,
          pixFmt: p.pixFmt,
          faststart: p.moovEarly ? 'Y' : 'N',
          reEncoded: false,
          finalPath,
          attempts: 0,
        });
      } catch {
        results.push({
          id: cs.id,
          status: 'OK',
          duration: '?',
          codec: '?',
          pixFmt: '?',
          faststart: '?',
          reEncoded: false,
          finalPath,
          attempts: 0,
        });
      }
      continue;
    }

    let attempt = 0;
    let success = false;
    let lastError = '';
    let lastArtifacts: RunArtifacts | null = null;
    while (attempt < MAX_RETRIES + 1 && !success) {
      attempt++;
      try {
        console.log(`  Attempt ${attempt}/${MAX_RETRIES + 1}...`);
        const artifacts = await runOne(cs, apiKey, wan, character);
        lastArtifacts = artifacts;
        console.log(`  Generated: ${path.basename(artifacts.videoPath)}`);

        const probe = probeVideo(artifacts.videoPath);
        console.log(
          `  Probe: codec=${probe.codec} pix_fmt=${probe.pixFmt} dur=${probe.duration.toFixed(2)}s faststart=${probe.moovEarly}`,
        );

        if (probe.duration < MIN_DURATION_S || probe.duration > MAX_DURATION_S) {
          lastError = `duration ${probe.duration.toFixed(2)}s out of [${MIN_DURATION_S}, ${MAX_DURATION_S}]`;
          console.log(`  [warn] ${lastError} — retry`);
          continue;
        }

        let reEncoded = false;
        let finalSource = artifacts.videoPath;
        if (needsReEncode(probe)) {
          console.log(`  Re-encoding for iOS compatibility...`);
          const reencodedPath = artifacts.videoPath.replace(/\.mp4$/, '_reenc.mp4');
          reEncode(artifacts.videoPath, reencodedPath);
          const p2 = probeVideo(reencodedPath);
          console.log(
            `  After re-encode: codec=${p2.codec} pix_fmt=${p2.pixFmt} dur=${p2.duration.toFixed(2)}s faststart=${p2.moovEarly}`,
          );
          reEncoded = true;
          finalSource = reencodedPath;
        }

        // Compress for app bundle (720×1280 @ CRF 30, keeps iOS-compat H.264).
        // WAN delivers 720×1280 natively; the scale filter stays as a guard.
        const beforeBytes = fs.statSync(finalSource).size;
        console.log(`  Compressing for bundle (before: ${(beforeBytes / (1024 * 1024)).toFixed(2)} MB)...`);
        await compressVideoForBundle(finalSource, finalPath);
        const afterBytes = fs.statSync(finalPath).size;
        const reduction = ((1 - afterBytes / beforeBytes) * 100).toFixed(1);
        console.log(
          `  Compressed: ${(afterBytes / (1024 * 1024)).toFixed(2)} MB (−${reduction}%)`,
        );
        console.log(`  Staged: ${finalPath}`);

        const finalProbe = probeVideo(finalPath);
        results.push({
          id: cs.id,
          status: 'OK',
          duration: finalProbe.duration.toFixed(2) + 's',
          codec: finalProbe.codec,
          pixFmt: finalProbe.pixFmt,
          faststart: finalProbe.moovEarly ? 'Y' : 'N',
          reEncoded,
          bgPath: artifacts.bgPath,
          framePath: artifacts.framePath,
          sourcePath: artifacts.videoPath,
          finalPath,
          attempts: attempt,
        });
        success = true;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.log(`  [fail] ${lastError}`);
      }
    }

    if (!success) {
      results.push({
        id: cs.id,
        status: 'FAILED',
        duration: '-',
        codec: '-',
        pixFmt: '-',
        faststart: '-',
        reEncoded: false,
        error: lastError,
        bgPath: lastArtifacts?.bgPath,
        framePath: lastArtifacts?.framePath,
        sourcePath: lastArtifacts?.videoPath,
        attempts: attempt,
      });
    }

    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`  [progress] ${idx + 1}/${list.length} done, elapsed ${elapsed.toFixed(0)}s`);
  }

  console.log('\n\n=== RESULT SUMMARY ===\n');
  console.log('| # | Cutscene-ID | Dauer | Codec | pix_fmt | Faststart | Re-Encode | Versuche | Status |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  results.forEach((r, i) => {
    console.log(
      `| ${i + 1} | ${r.id} | ${r.duration} | ${r.codec} | ${r.pixFmt} | ${r.faststart} | ${r.reEncoded ? 'Y' : 'N'} | ${r.attempts} | ${r.status} |`,
    );
  });

  const failed = results.filter((r) => r.status === 'FAILED');
  if (failed.length > 0) {
    console.log('\n=== Fehlgeschlagen ===');
    failed.forEach((r) => {
      console.log(`  - ${r.id}: ${r.error}`);
    });
  }

  const reportPath = path.join(FINAL_DIR, '_batch-vasquez-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nReport: ${reportPath}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
