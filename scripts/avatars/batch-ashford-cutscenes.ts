/**
 * Batch generator for Ashford cutscene videos (composite flow, April 2026).
 *
 * Each cutscene carries TWO prompts:
 *   - bgPrompt:    pure environment description for Flux BG-gen (no figure)
 *   - videoPrompt: motion-only description for WAN image-to-video
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
 *   npx tsx scripts/avatars/batch-ashford-cutscenes.ts
 *   npx tsx scripts/avatars/batch-ashford-cutscenes.ts --only ashford_food_empty
 *   npx tsx scripts/avatars/batch-ashford-cutscenes.ts --skip ashford_food_empty
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
const PUBLIC_DIR = path.join(ROOT, 'public/cutscenes');

const FFMPEG = path.join(ROOT, 'node_modules/ffmpeg-static/ffmpeg.exe');
const FFPROBE = path.join(ROOT, 'node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe');

const CHARACTER_ID = 'director_ashford';
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
    id: 'ashford_food_empty',
    bgPrompt:
      'empty dark sci-fi colony office interior, unoccupied workspace, vacant desk chair visible, glowing red holographic food-storage warning indicator hovering above empty desk, large viewport window showing alien planet surface at night, cinematic Expanse aesthetic, dramatic moody environmental lighting, deserted vacant room, wide interior establishing shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_colony_founded_earth_like',
    bgPrompt:
      'empty orbital viewing lounge interior, unoccupied observation deck, vacant chair visible, large panoramic viewport showing earth-like green-blue planet surface at sunrise, newly built first colony buildings visible below, cinematic Expanse aesthetic, warm golden rim lighting, deserted lounge, wide establishing interior shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_planet_colonized_earth_like',
    bgPrompt:
      'empty orbital command bridge interior, unoccupied control station, vacant captain chair visible, large panoramic viewport showing newly claimed earth-like green-blue planet at golden hour, untouched virgin planet surface awaiting first colony hull, faint orbital construction ship silhouette in foreground glass, cinematic Expanse aesthetic, warm hopeful golden rim lighting, deserted command bridge, wide establishing interior shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_colony_founded_desert',
    bgPrompt:
      'empty colony observation room interior, unoccupied viewing area, large viewport overlooking dusty reddish-orange desert horizon, sand winds outside, newly built sealed industrial structure visible in distance, harsh afternoon sunlight streaming through viewport, cinematic Expanse aesthetic, deserted vacant interior, wide establishing shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_colony_founded_ice',
    bgPrompt:
      'empty arctic base interior observation room, unoccupied viewing area, vacant seating, large reinforced viewport overlooking frozen tundra landscape under aurora in night sky, ice-covered newly built structure visible outside, cold bluish environmental lighting, subtle breath steam in cold air, deserted vacant room, wide establishing interior shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_colony_founded_ocean',
    bgPrompt:
      'empty underwater station interior, unoccupied observation deck, vacant chair, large panoramic submerged viewport showing kelp forest and bioluminescent sealife drifting outside, newly built aquatic domed structure visible in distance, cool turquoise underwater environmental lighting, deserted station interior, wide establishing shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_colony_founded_volcanic',
    bgPrompt:
      'empty heat-shielded observation bunker interior, unoccupied viewing area, vacant seating, large reinforced viewport overlooking glowing orange lava fields at night, newly built heat-shielded industrial structure visible in distance, dramatic red-orange environmental lighting, volcanic ash haze outside, deserted bunker interior, wide establishing shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_colony_founded_gas_giant',
    bgPrompt:
      'empty orbital aerostat observation cabin interior, unoccupied deck, vacant chair, large reinforced curved viewport showing thick swirling cloud bands and newly built floating structure visible through atmospheric haze, warm amber cabin lighting, deserted cabin interior, wide establishing aerial shot interior, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_colony_founded_ice_giant',
    bgPrompt:
      'empty remote orbital station interior, unoccupied observation deck, vacant seating, large reinforced viewport showing pale blue methane atmosphere outside, distant newly built floating structure visible, cold pale cyan environmental lighting, remote frontier feel, deserted station interior, wide establishing shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_colony_founded_barren',
    bgPrompt:
      'empty mining base observation room interior, unoccupied viewing area, vacant chair, large viewport overlooking grey cratered lunar-like landscape with dust, newly built industrial mining structure visible on rocky plain, stark shadow contrast lighting, deserted base interior, wide establishing shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_colony_founded_toxic',
    bgPrompt:
      'empty hazmat observation bunker interior, unoccupied viewing area, vacant seating, large heavy-shielded viewport overlooking sickly greenish-yellow toxic atmosphere and corroded terrain, newly built heavily-shielded sealed structure visible, ominous environmental lighting, deserted bunker interior, wide establishing shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  // ─────────────────────────────────────────────────────────────────────────
  // Push-getriebene Kolonisierung: Planet-Colonized-Cutscenes (April 2026)
  // Selbe BG-Struktur wie ashford_planet_colonized_earth_like — leere
  // Kommandobrücke mit panoramischem Viewport, vakant, Iso-Standard cinematic.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'ashford_planet_colonized_desert',
    bgPrompt:
      'empty orbital command bridge interior, unoccupied control station, vacant captain chair visible, large panoramic viewport showing newly claimed red-brown desert dune planet with thin dusty atmosphere and sandstorms on the horizon, untouched virgin desert surface awaiting first colony hull, faint orbital construction ship silhouette in foreground glass, cinematic Expanse aesthetic, harsh golden-orange sunlight rim lighting, deserted command bridge, wide establishing interior shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_planet_colonized_ice',
    bgPrompt:
      'empty orbital command bridge interior, unoccupied control station, vacant captain chair visible, large panoramic viewport showing newly claimed white-blue ice planet with frosty surface reflections and frozen polar caps, untouched virgin ice surface awaiting first colony hull, faint orbital construction ship silhouette in foreground glass, cinematic Expanse aesthetic, cold cyan-white rim lighting, deserted command bridge, wide establishing interior shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_planet_colonized_ocean',
    bgPrompt:
      'empty orbital command bridge interior, unoccupied control station, vacant captain chair visible, large panoramic viewport showing newly claimed deep-blue ocean water world with white cloud swirls and vast seas, untouched virgin ocean surface awaiting first colony hull, faint orbital construction ship silhouette in foreground glass, cinematic Expanse aesthetic, turquoise-blue rim lighting, deserted command bridge, wide establishing interior shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_planet_colonized_volcanic',
    bgPrompt:
      'empty orbital command bridge interior, unoccupied control station, vacant captain chair visible, large panoramic viewport showing newly claimed dark volcanic planet with glowing molten lava veins across black crust, dramatic red-orange surface glow, untouched virgin volcanic surface awaiting first colony hull, faint orbital construction ship silhouette in foreground glass, cinematic Expanse aesthetic, dramatic red-orange rim lighting, deserted command bridge, wide establishing interior shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_planet_colonized_gas_giant',
    bgPrompt:
      'empty orbital command bridge interior, unoccupied control station, vacant captain chair visible, large panoramic viewport showing newly claimed Jupiter-like gas giant with yellow-brown-white swirling cloud bands, untouched virgin gas giant atmosphere awaiting first aerostat hull, faint orbital construction ship silhouette in foreground glass, cinematic Expanse aesthetic, soft warm golden rim lighting, deserted command bridge, wide establishing interior shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_planet_colonized_ice_giant',
    bgPrompt:
      'empty orbital command bridge interior, unoccupied control station, vacant captain chair visible, large panoramic viewport showing newly claimed Neptune-like ice giant with deep blue methane atmosphere, distant cold sun, lonely outpost feel, untouched virgin ice giant awaiting first colony hull, faint orbital construction ship silhouette in foreground glass, cinematic Expanse aesthetic, pale cold blue rim lighting, deserted command bridge, wide establishing interior shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_planet_colonized_barren',
    bgPrompt:
      'empty orbital command bridge interior, unoccupied control station, vacant captain chair visible, large panoramic viewport showing newly claimed grey moon-like barren planet with craters and lifeless rocky surface, untouched virgin barren surface awaiting first colony hull, faint orbital construction ship silhouette in foreground glass, cinematic Expanse aesthetic, neutral grey stark contrast lighting, deserted command bridge, wide establishing interior shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_planet_colonized_toxic',
    bgPrompt:
      'empty orbital command bridge interior, unoccupied control station, vacant captain chair visible, large panoramic viewport showing newly claimed toxic planet with yellow-green acidic atmosphere and orange swirling sulfur clouds, untouched virgin toxic surface awaiting first colony hull, faint orbital construction ship silhouette in foreground glass, cinematic Expanse aesthetic, dramatic sulfur-yellow rim lighting, deserted command bridge, wide establishing interior shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_planet_colonized_asteroid_m',
    bgPrompt:
      'empty orbital command bridge interior, unoccupied control station, vacant captain chair visible, large panoramic viewport close-up showing newly claimed metallic-grey M-type asteroid with clearly visible ore veins on its surface, starfield behind it, untouched virgin asteroid awaiting first colony hull, faint orbital construction ship silhouette in foreground glass, cinematic Expanse aesthetic, cool industrial silver rim lighting, deserted command bridge, wide establishing interior shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_planet_colonized_asteroid_c',
    bgPrompt:
      'empty orbital command bridge interior, unoccupied control station, vacant captain chair visible, large panoramic viewport close-up showing newly claimed coal-black matte C-type carbonaceous asteroid, very dark and absorbing, distant stars in background, untouched virgin asteroid awaiting first colony hull, faint orbital construction ship silhouette in foreground glass, cinematic Expanse aesthetic, faint ship-only ambient lighting, deserted command bridge, wide establishing interior shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_planet_colonized_asteroid_s',
    bgPrompt:
      'empty orbital command bridge interior, unoccupied control station, vacant captain chair visible, large panoramic viewport close-up showing newly claimed light-grey mineral-rich S-type silicate asteroid with crystalline surface structures, starfield behind it, untouched virgin asteroid awaiting first colony hull, faint orbital construction ship silhouette in foreground glass, cinematic Expanse aesthetic, cool white rim lighting, deserted command bridge, wide establishing interior shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_planet_colonized_moon_rocky',
    bgPrompt:
      'empty orbital command bridge interior, unoccupied control station, vacant captain chair visible, large panoramic viewport showing newly claimed grey rocky moon with prominent craters in foreground and an earth-like green-blue mother planet visible behind it, untouched virgin rocky moon surface awaiting first colony hull, faint orbital construction ship silhouette in foreground glass, cinematic Expanse aesthetic, neutral balanced rim lighting, deserted command bridge, wide establishing interior shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_planet_colonized_moon_icy',
    bgPrompt:
      'empty orbital command bridge interior, unoccupied control station, vacant captain chair visible, large panoramic viewport showing newly claimed white-blue icy moon with ice-crystal reflections in foreground and a banded gas giant mother planet visible behind it, untouched virgin icy moon surface awaiting first colony hull, faint orbital construction ship silhouette in foreground glass, cinematic Expanse aesthetic, cool cyan rim lighting, deserted command bridge, wide establishing interior shot, environment only, no figure',
    videoPrompt: DEFAULT_VIDEO_PROMPT,
  },
  {
    id: 'ashford_planet_colonized_moon_volcanic',
    bgPrompt:
      'empty orbital command bridge interior, unoccupied control station, vacant captain chair visible, large panoramic viewport showing newly claimed Io-like volcanic moon with yellow-orange-black sulfurous surface in foreground and a banded gas giant mother planet visible behind it, untouched virgin volcanic moon surface awaiting first colony hull, faint orbital construction ship silhouette in foreground glass, cinematic Expanse aesthetic, dramatic orange-red rim lighting, deserted command bridge, wide establishing interior shot, environment only, no figure',
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
  status: 'OK' | 'FAILED' | 'DEFERRED_COMPRESS';
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

function runStreamProbe(file: string): {
  codec: string;
  profile: string;
  pixFmt: string;
  duration: string;
} {
  // ffprobe on Windows occasionally returns non-zero status with empty
  // stderr/stdout (suspected transient spawnSync race). We retry up to 3 times
  // with a short delay before giving up.
  let lastDiag = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const out = spawnSync(
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
      { encoding: 'utf-8', maxBuffer: 4 * 1024 * 1024, windowsHide: true },
    );
    const stdout = out.stdout ?? '';
    const stderr = out.stderr ?? '';
    if (out.status === 0 && stdout.trim().length > 0) {
      try {
        const json = JSON.parse(stdout) as {
          streams: Array<{
            codec_name: string;
            profile: string;
            pix_fmt: string;
            duration: string;
          }>;
        };
        const s = json.streams[0];
        if (s) return s;
        lastDiag = `attempt ${attempt}: no streams in json`;
      } catch (err) {
        lastDiag = `attempt ${attempt}: json parse failed (${(err as Error).message.slice(0, 80)})`;
      }
    } else {
      lastDiag = `attempt ${attempt}: status=${out.status} signal=${out.signal} stderr="${stderr.slice(0, 200)}" stdout="${stdout.slice(0, 200)}"`;
    }
    // brief sleep before retry
    spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},500)'], { encoding: 'utf-8' });
  }
  throw new Error(`ffprobe stream failed (3 attempts): ${lastDiag}`);
}

function probeVideo(file: string): ProbeResult {
  const s = runStreamProbe(file);

  // Faststart check: inspect moov atom offset.
  // Wrapped in try/catch — on Windows the verbose trace can blow past the
  // 20MB stderr buffer or otherwise non-zero exit. If we cannot determine
  // moov position we conservatively assume not-early; needsReEncode() will
  // then trigger the re-encode pass which always emits +faststart anyway.
  let moovEarly = false;
  try {
    const traceOut = spawnSync(FFPROBE, ['-v', 'trace', '-i', file], {
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    const trace = traceOut.stderr ?? '';
    const firstMb = trace.slice(0, 200_000);
    const moovMatch = firstMb.match(/type:'moov' parent:'root' sz: \d+ (\d+)/);
    const mdatMatch = firstMb.match(/type:'mdat' parent:'root' sz: \d+ (\d+)/);
    if (moovMatch && mdatMatch) {
      const moovOffset = parseInt(moovMatch[1], 10);
      const mdatOffset = parseInt(mdatMatch[1], 10);
      moovEarly = moovOffset < mdatOffset;
    } else if (moovMatch && !mdatMatch) {
      moovEarly = true;
    }
  } catch (err) {
    console.warn(
      `  [warn] faststart trace probe threw (${(err as Error).message.slice(0, 120)}); assuming moovEarly=false`,
    );
    moovEarly = false;
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
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });

  const { only, skip } = parseArgs();
  const list = CUTSCENES.filter((cs) => {
    if (only.length > 0) return only.includes(cs.id);
    if (skip.includes(cs.id)) return false;
    return true;
  });

  console.log(`=== Batch Ashford Cutscenes (composite flow) ===`);
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
        //
        // IMPORTANT: We spawn a fresh Node subprocess (recover-cutscene.ts)
        // for the compression step. Calling ffmpeg-static directly from this
        // long-lived batch process produces sporadic STATUS_DLL_INIT_FAILED
        // (Windows 0xC0000142) once sharp + other native modules have been
        // loaded. A clean subprocess sidesteps that loader collision and is
        // proven to work reliably in the recover-cutscene.ts standalone path.
        const beforeBytes = fs.statSync(finalSource).size;
        console.log(`  Compressing for bundle (before: ${(beforeBytes / (1024 * 1024)).toFixed(2)} MB)...`);

        const recoverScript = path.join(__dirname, 'recover-cutscene.ts');
        // Strip NODE_OPTIONS / TSX-loader env so the subprocess starts with a
        // clean Node loader state. Use cmd.exe /c to ensure proper PATHEXT
        // resolution of npx.cmd on Windows. Without this combo the subprocess
        // either fails to spawn (status=null) or hits STATUS_DLL_INIT_FAILED
        // (exit 0xC0000142) when ffmpeg-static loads inside it.
        const cleanEnv: NodeJS.ProcessEnv = { ...process.env };
        delete cleanEnv.NODE_OPTIONS;
        delete cleanEnv.TSX_TSCONFIG_PATH;
        const cmdExe = process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe';
        const subRes = spawnSync(
          cmdExe,
          [
            '/c',
            'npx',
            'tsx',
            recoverScript,
            '--id',
            cs.id,
            '--source',
            finalSource,
          ],
          {
            cwd: ROOT,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: false,
            maxBuffer: 16 * 1024 * 1024,
            env: cleanEnv,
          },
        );
        if (subRes.status !== 0) {
          // Compress failed (Windows STATUS_DLL_INIT_FAILED in long-lived
          // batch process). DON'T retry generation — the raw video is fine.
          // Mark this slot as deferred, write its raw path so an external
          // shell can compress it post-batch via recover-cutscene.ts.
          console.log(
            `  [warn] compress subprocess failed (exit ${subRes.status}). ` +
              `Raw video preserved — defer compress to post-batch.`,
          );
          results.push({
            id: cs.id,
            status: 'DEFERRED_COMPRESS',
            duration: probe.duration.toFixed(2) + 's',
            codec: probe.codec,
            pixFmt: probe.pixFmt,
            faststart: probe.moovEarly ? 'Y' : 'N',
            reEncoded,
            error: `compress subprocess failed (exit ${subRes.status})`,
            bgPath: artifacts.bgPath,
            framePath: artifacts.framePath,
            sourcePath: artifacts.videoPath,
            attempts: attempt,
          });
          success = true; // raw is fine, don't burn another generation
          break;
        }
        // recover-cutscene.ts already mirrors to public/cutscenes/. Re-emit
        // a short summary so this script's log stays informative.
        const afterBytes = fs.statSync(finalPath).size;
        const reduction = ((1 - afterBytes / beforeBytes) * 100).toFixed(1);
        console.log(
          `  Compressed: ${(afterBytes / (1024 * 1024)).toFixed(2)} MB (−${reduction}%)`,
        );
        console.log(`  Staged: ${finalPath}`);

        const publicPath = path.join(PUBLIC_DIR, `${cs.id}.mp4`);
        if (!fs.existsSync(publicPath)) {
          fs.copyFileSync(finalPath, publicPath);
        }
        console.log(`  Mirrored to public: ${publicPath}`);

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

  const deferred = results.filter((r) => r.status === 'DEFERRED_COMPRESS');
  if (deferred.length > 0) {
    console.log('\n=== Deferred Compress (run recover-cutscene.ts externally) ===');
    deferred.forEach((r) => {
      console.log(`  npx tsx scripts/avatars/recover-cutscene.ts --id ${r.id} --source "${r.sourcePath}"`);
    });
    // Write a manifest so the parent shell can iterate.
    const manifestPath = path.join(FINAL_DIR, '_deferred-compress.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        deferred.map((r) => ({ id: r.id, source: r.sourcePath })),
        null,
        2,
      ),
    );
    console.log(`Manifest: ${manifestPath}`);
  }

  const reportPath = path.join(FINAL_DIR, '_batch-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nReport: ${reportPath}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
