/**
 * Batch generator for research-completion cutscene videos (April 2026).
 *
 * Identische Pipeline wie batch-vasquez-cutscenes.ts (Composite-Flow mit
 * Dr. Elena Vasquez als Research Director), nur mit research-spezifischen
 * BG-Prompts. Jede Cutscene wird einmal getriggert, wenn die Forschung
 * der jeweiligen Kategorie abgeschlossen wird.
 *
 * Per cutscene:
 *   1. Upload base avatar, BG-remove → alpha PNG
 *   2. Flux BG-gen with bgPrompt → scene background (portrait 9:16)
 *   3. Local sharp composite: character onto BG
 *   4. Alibaba WAN 3.0 image-to-video with videoPrompt → 15s portrait MP4
 *   5. ffprobe validate, ffmpeg re-encode for iOS if needed
 *   6. Compress for bundle (720×1280 @ CRF 30)
 *   7. Stage under assets/cutscenes-final/<cutscene-id>.mp4
 *
 * Usage:
 *   npx tsx scripts/avatars/batch-research-cutscenes.ts
 *   npx tsx scripts/avatars/batch-research-cutscenes.ts --only research_complete_energy
 *   npx tsx scripts/avatars/batch-research-cutscenes.ts --skip research_complete_food
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


// Phase 2: alle 10 TechCategory-Research-Completion-Cutscenes.
// Energy ist bereits final gestaged und wird vom Script automatisch übersprungen
// (Skip-Check in main() auf existierende finalPath).
const CUTSCENES: Cutscene[] = [
  {
    id: 'research_complete_energy',
    bgPrompt:
      'cluttered futuristic sci-fi research laboratory specialized in experimental energy physics, arcing electric bolts of blue-white plasma crackling between two test electrodes at center-right, instrument banks displaying live oscilloscope graphs and waveform readouts on multiple glowing CRT-style screens, thick corrugated cables and translucent coolant hoses hanging from an overhead rigging grid, dense web of wiring running across ceiling, analog dial gauges mixed with holographic data panels, test apparatus with exposed copper coils, volumetric haze catching the electrical glow, cinematic Expanse aesthetic, wide establishing shot, no figure, triumphant scientific breakthrough moment',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'research_complete_habitation',
    bgPrompt:
      'cluttered futuristic sci-fi research laboratory for habitat systems engineering, pressurized test chamber at center with transparent dome showing a miniature living quarters mockup with lit interior, atmospheric composition gauges reading green on wall panels, life support rig with circulating tubes of air pumping gently, oxygen and CO2 graphs on oscilloscope screens, mannequin torso in exoskeleton jig at side for ergonomics testing, holographic habitat section schematic rotating slowly in midair, cables and hoses hanging from overhead rigging, soft amber interior glow contrasting with cold lab fluorescents, cinematic Expanse aesthetic, wide establishing shot, no figure, triumphant scientific breakthrough moment',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'research_complete_food',
    bgPrompt:
      'cluttered futuristic sci-fi hydroponic research greenhouse laboratory, rows of vertical glass nutrient tubes glowing violet from UV grow lamps filled with tiny sprouting plants, robotic pipette arm center-right carefully dropping liquid into a culture tray, rack of petri dishes with bioluminescent green algae samples, plant growth curves on multiple monitors, misting nozzles releasing a subtle water vapor, thick coolant hoses from ceiling, leafy vines climbing a trellis in background, warm purple-pink bio-growth lighting, cinematic Expanse aesthetic, wide establishing shot, no figure, triumphant scientific breakthrough moment',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'research_complete_extraction',
    bgPrompt:
      'cluttered futuristic sci-fi mining and extraction research laboratory, transparent pressure chamber at center with a miniature drill-head prototype actively boring into a sample rock core, ore samples in backlit glass tubes lined up on shelves, mass spectrometer scanning a mineral fragment, geological stratum maps on multiple large displays, dust extraction hood over workbench catching fine particles, exposed drill-bit rack on wall, core-sample crates, copper ore fragments on desk, industrial amber task lighting, cinematic Expanse aesthetic, wide establishing shot, no figure, triumphant scientific breakthrough moment',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'research_complete_production',
    bgPrompt:
      'cluttered futuristic sci-fi materials and refining research laboratory, tensile stress test machine at center bending a glowing metal bar to breaking point, molten smelting crucible behind thick shielded glass emitting orange glow, microscopy station with enlarged crystal lattice structure visible on huge wall display, alloy sample rack with labeled specimens, spectral analysis graphs on monitors, industrial fume extraction hoses from ceiling, tool wall with calipers and clamps, heat-shimmer haze around crucible, cinematic Expanse aesthetic, wide establishing shot, no figure, triumphant scientific breakthrough moment',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'research_complete_manufacturing',
    bgPrompt:
      'cluttered futuristic sci-fi fabrication prototyping laboratory, half-assembled robotic arm lying on central workbench mid-disassembly, 3D printer at side materializing a gear part in layered light, CAD hologram of an engine block rotating in midair, calibration jigs arranged on pegboard, loose gears and bolts scattered on bench, several mini-proof-of-concept assembly cells running in background with tiny components being picked and placed, tool wall, soldering iron at rest, cool white task lighting with warm accent pools, cinematic Expanse aesthetic, wide establishing shot, no figure, triumphant scientific breakthrough moment',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'research_complete_transportation',
    bgPrompt:
      'cluttered futuristic sci-fi propulsion test laboratory, miniature ion thruster prototype on gimbal mount center-right emitting an intense blue plasma beam behind thick shielded glass, thrust measurement instruments with live force-graphs, coolant pipes venting subtle steam, cables and hoses hanging from overhead rig, orbital trajectory visualizations on multiple monitors, test stand cage surrounding the test article, heat-warped metal samples on shelf, exposed copper coils, volumetric haze from plasma glow, cinematic Expanse aesthetic, wide establishing shot, no figure, triumphant scientific breakthrough moment',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'research_complete_communication',
    bgPrompt:
      'cluttered futuristic sci-fi communications research laboratory, small parabolic dish antenna on precision alignment platform at center slowly rotating, bank of signal waveform displays showing oscillating carrier patterns, holographic quantum entanglement experiment with two tiny photon particles glowing in suspension between paired emitters, galaxy transmission heatmap on large wall display, code-breaker workstation with scrolling data streams, coaxial cables and fiber optics coiled on bench and hanging from ceiling, cyan-tinted indicator lights, cinematic Expanse aesthetic, wide establishing shot, no figure, triumphant scientific breakthrough moment',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'research_complete_security',
    bgPrompt:
      'cluttered futuristic sci-fi weapons and defense research laboratory, railgun prototype on test stand at center-right pointing at an armored plate target wall, muzzle flash frozen mid-discharge with electromagnetic coil glow, high-speed camera rigs pointing at the target, ballistic trajectory graph on monitor, shattered armor sample fragments displayed in a case, bullet impact analysis workstation with magnified crater shots on screen, hanging coolant hoses from rail system on ceiling, cable bundles, warning stripes on floor, red-orange emergency strip lighting mixed with cold tactical fluorescents, cinematic Expanse aesthetic, wide establishing shot, no figure, triumphant scientific breakthrough moment',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'research_complete_satisfaction',
    bgPrompt:
      'cluttered futuristic sci-fi human wellbeing research laboratory, VR entertainment simulator chair at center with a live holographic park environment projected around it showing trees and soft sunlight, biometric monitors displaying heart rate and relaxation curves as gentle green waves, comfortable test lounge furniture wired with sensors at side, color mood-light experiments with shifting pastel panels on back wall, olfactory-stimulation vials in rack, colorful interactive touch-screen test station, hanging decorative plant tendrils mixed with sensor cables from the ceiling, warm inviting glow contrasting with cold clinical instruments, cinematic Expanse aesthetic, wide establishing shot, no figure, triumphant scientific breakthrough moment',
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

  console.log(`=== Batch Research Cutscenes (composite flow) ===`);
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

  const reportPath = path.join(FINAL_DIR, '_batch-research-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nReport: ${reportPath}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
