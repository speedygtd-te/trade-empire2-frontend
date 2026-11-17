/**
 * Generate 512x512 artifact and civilization emblem icons via fal.ai image generation API.
 * Includes background removal (birefnet/v2) and trim+pad to 512x512.
 *
 * Phasing:
 *   --phase 1  -> 6 civilization emblems + 6 Kaelith (Architects) artifact icons (12 assets)
 *   --phase 2  -> remaining 30 artifact icons (Pyrathi, Mycelith, Lithon, Cognithari, Voidthar)
 *
 * Usage: npx tsx scripts/generate-artifact-assets.ts --phase 1
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FAL_API_KEY = process.env['FAL_API_KEY'] ?? fs.readFileSync(path.join(__dirname, '.env'), 'utf-8')
  .split('\n').find((l) => l.startsWith('FAL_API_KEY='))?.replace('FAL_API_KEY=', '').trim() ?? '';

if (!FAL_API_KEY) {
  console.error('FAL_API_KEY not found');
  process.exit(1);
}

// ── Parse CLI args ──
function parsePhase(): number {
  const idx = process.argv.indexOf('--phase');
  if (idx === -1) {
    console.error('Missing --phase flag. Use --phase 1 or --phase 2');
    process.exit(1);
  }
  const val = parseInt(process.argv[idx + 1] ?? '', 10);
  if (val !== 1 && val !== 2) {
    console.error('--phase must be 1 or 2');
    process.exit(1);
  }
  return val;
}

const PHASE = parsePhase();

// ── Output paths ──
const BASE_OUT = path.resolve(__dirname, '../src/assets/artifacts/icons');
const CIV_DIR = path.join(BASE_OUT, 'civilizations');
const ART_DIR = path.join(BASE_OUT, 'artifacts');

// ── Style anchors ──
const BASE_STYLE =
  'isometric 2.5D perspective, viewed from upper-left 45 degrees, transparent background, no background, ' +
  'isolated centered object, sci-fi hard aesthetic, ancient alien technology weathered 400 million years old, ' +
  'geometric precision mixed with age and corrosion, game UI icon quality, clean silhouette, lit from upper-left';

const NEGATIVE_PROMPT =
  'cartoon, anime, fantasy, magical glow, bright neon colors, human design, steampunk, cyberpunk, ' +
  'dragons, runes, glyphs, text, logos, watermark, modern tech, green slime, purple nebulae, lens flares, ' +
  'excessive particles, background, scene, landscape, ground, floor';

// ── Asset definitions ──

interface AssetDef {
  id: string;              // filename stem, e.g. "civ_kae"
  category: 'civ' | 'art'; // determines output dir
  prompt: string;          // specific prompt (BASE_STYLE appended automatically)
}

const CIVILIZATIONS: AssetDef[] = [
  {
    id: 'civ_kae',
    category: 'civ',
    prompt:
      'abstract heraldic emblem badge, hexagonal lattice with crystalline core at center, ' +
      'ice-blue silicate tones (#A8C5E0), geometric facets radiating outward, architect civilization symbol',
  },
  {
    id: 'civ_pyr',
    category: 'civ',
    prompt:
      'abstract heraldic emblem badge, pyramidal smelting core with radiating heat rays, ' +
      'obsidian black with magma orange core (#D94A1F), pulsing molten energy, smelter civilization symbol',
  },
  {
    id: 'civ_myc',
    category: 'civ',
    prompt:
      'abstract heraldic emblem badge, fractal mycelium network symbol, ' +
      'bio-green with purple bioluminescent undertones (#6BAE5E), organic branching pattern, weaver civilization symbol',
  },
  {
    id: 'civ_lit',
    category: 'civ',
    prompt:
      'abstract heraldic emblem badge, concentric geological strata with central bore-core symbol, ' +
      'bronze and anthracite tones (#8B5E3C), industrial cross-section style, miner civilization symbol',
  },
  {
    id: 'civ_cog',
    category: 'civ',
    prompt:
      'abstract heraldic emblem badge, quartz lattice with internal data-flow patterns, ' +
      'lavender and white tones (#B89EE8), embedded circuit motifs, thinker civilization symbol',
  },
  {
    id: 'civ_voi',
    category: 'civ',
    prompt:
      'abstract heraldic emblem badge, drift lines with navigation anchors between stars, ' +
      'void-blue with silver highlights (#2A3F5C), stellar navigation motif, wanderer civilization symbol',
  },
];

const ARTIFACTS_KAE: AssetDef[] = [
  {
    id: 'art_kae_01_crystalline_foundation',
    category: 'art',
    prompt:
      'crystalline foundation artifact fragment, hexagonal geometric pattern, ice-blue silicate crystal, ' +
      'weathered surface with rock embedded, common rarity fragmentary form',
  },
  {
    id: 'art_kae_02_resonance_lattice',
    category: 'art',
    prompt:
      'resonance lattice artifact, blue crystalline hexagonal lattice structure, glowing edges, ' +
      'common rarity partial form',
  },
  {
    id: 'art_kae_03_stabilization_matrix',
    category: 'art',
    prompt:
      'stabilization matrix artifact, complex interlocking crystalline matrix, blue-white inner glow, ' +
      'uncommon rarity sophisticated geometry',
  },
  {
    id: 'art_kae_04_molecular_reformer',
    category: 'art',
    prompt:
      'molecular reformer artifact, blue crystal with internal transmutation circuitry pattern, ' +
      'alchemical geometry, uncommon rarity transmuter device',
  },
  {
    id: 'art_kae_05_architect_core',
    category: 'art',
    prompt:
      'architect core artifact, monumental central crystal with perfect geometric symmetry, ' +
      'intense blue-white luminescence, rare rarity powerful inner glow edges',
  },
  {
    id: 'art_kae_06_crystal_nexus',
    category: 'art',
    prompt:
      'crystal nexus legendary artifact, towering crystalline structure with massive central core, ' +
      'overwhelming geometric perfection, brilliant sapphire glow, legendary rarity monumental scale overwhelming presence',
  },
];

// Phase 2 — 30 artifact icons for Pyrathi, Mycelith, Lithon, Cognithari, Voidthar (6 each)
const ARTIFACTS_PHASE_2: AssetDef[] = [
  // ── Pyrathi Kollektiv (Schmelzer) ──
  {
    id: 'art_pyr_01_thermal_vein',
    category: 'art',
    prompt:
      'thermal vein artifact, obsidian-black pipe structure with glowing orange vein, heat-warped glass, ' +
      'molten metal flow patterns, common rarity fragmentary form partially embedded in rock',
  },
  {
    id: 'art_pyr_02_heat_condenser',
    category: 'art',
    prompt:
      'heat condenser artifact, cylindrical black crucible with orange plasma core, ' +
      'condensed thermal energy, weathered metal surface, common rarity partial form',
  },
  {
    id: 'art_pyr_03_plasma_crystal',
    category: 'art',
    prompt:
      'plasma crystal artifact, glowing crystal with internal magma cores, orange-red light emission, ' +
      'dangerous power source, uncommon rarity sophisticated geometry',
  },
  {
    id: 'art_pyr_04_transmutation_crucible',
    category: 'art',
    prompt:
      'transmutation crucible artifact, dark smelting vessel with glowing molten interior, ' +
      'metal transmutation device, uncommon rarity transmuter',
  },
  {
    id: 'art_pyr_05_pyrathi_crucible',
    category: 'art',
    prompt:
      'pyrathi crucible rare artifact, monumental smelting chamber, obsidian-black with glowing orange veins, ' +
      'molten appearance, rare rarity powerful inner glow edges',
  },
  {
    id: 'art_pyr_06_sunheart',
    category: 'art',
    prompt:
      'sunheart legendary artifact, pulsing plasma core in black obsidian sphere, ' +
      'intense orange-white luminescence, stellar energy source, legendary rarity monumental scale overwhelming presence',
  },

  // ── Mycelith Schwarm (Weber) ──
  {
    id: 'art_myc_01_mycel_fragment',
    category: 'art',
    prompt:
      'mycel fragment artifact, fossilized organic fiber structure, green-brown mycelium network, ' +
      'partially mineralized, bioluminescent accents, common rarity fragmentary form',
  },
  {
    id: 'art_myc_02_lifeline',
    category: 'art',
    prompt:
      'lifeline artifact, organic vein-like structure, green glowing neural tissue, ' +
      'fossilized nerve network, life-sustaining form, common rarity partial form',
  },
  {
    id: 'art_myc_03_symbiont_colony',
    category: 'art',
    prompt:
      'symbiont colony artifact, interconnected organic forms, green and purple bioluminescence, ' +
      'living colony structure, uncommon rarity sophisticated biology',
  },
  {
    id: 'art_myc_04_bio_transmuter',
    category: 'art',
    prompt:
      'bio-transmuter artifact, organic transformation chamber, mycelial network with glowing growth chambers, ' +
      'uncommon rarity biological crafting transmuter',
  },
  {
    id: 'art_myc_05_bio_resonance_chamber',
    category: 'art',
    prompt:
      'bio-resonance chamber rare artifact, monumental organic chamber pulsing with green bioluminescence, ' +
      'interconnected nerve-tissue structure, rare rarity vital inner glow',
  },
  {
    id: 'art_myc_06_mycelith_heart',
    category: 'art',
    prompt:
      'mycelith heart legendary artifact, colossal pulsing biological core like a living heart, ' +
      'vast mycelial network surrounding, intense green bioluminescence, legendary rarity monumental life-force',
  },

  // ── Lithon Konfluenz (Schürfer) ──
  {
    id: 'art_lit_01_enriched_stratum',
    category: 'art',
    prompt:
      'enriched stratum artifact, compressed mineral layer, bronze and gold ore veins, ' +
      'geological cross-section, mining fragment, common rarity partially embedded',
  },
  {
    id: 'art_lit_02_lithon_drill_remnant',
    category: 'art',
    prompt:
      'lithon drill remnant artifact, ancient boring tool, metal and crystalline drill-head, ' +
      'industrial mining equipment weathered, common rarity',
  },
  {
    id: 'art_lit_03_compressor_node',
    category: 'art',
    prompt:
      'compressor node artifact, cylindrical metal compression device, ' +
      'bronze-colored metallic node with carved strata, uncommon rarity mining intensifier',
  },
  {
    id: 'art_lit_04_compaction_chamber',
    category: 'art',
    prompt:
      'compaction chamber artifact, heavy pressurized vessel, bronze and anthracite tones, ' +
      'material transformation device, uncommon rarity alchemy of stone',
  },
  {
    id: 'art_lit_05_resonance_bore',
    category: 'art',
    prompt:
      'resonance bore rare artifact, massive drilling mechanism, polished metallic surfaces with deep resonance patterns, ' +
      'industrial scale mining artifact, rare rarity inner glow edges',
  },
  {
    id: 'art_lit_06_lithon_core',
    category: 'art',
    prompt:
      'lithon core legendary artifact, monumental geometric ore formation with impossible compression symmetry, ' +
      'legendary rarity extraction power overwhelming presence',
  },

  // ── Cognithari Assemblee (Denker) ──
  {
    id: 'art_cog_01_data_fragment',
    category: 'art',
    prompt:
      'data fragment artifact, crystal lattice with embedded information patterns, ' +
      'lavender and white tones, quartz information carrier, common rarity archaeological data fragment',
  },
  {
    id: 'art_cog_02_pattern_crystal',
    category: 'art',
    prompt:
      'pattern crystal artifact, geometric quartz formation with circuit-like patterns, ' +
      'purple-white crystal structure, data-encoded mineral, common rarity',
  },
  {
    id: 'art_cog_03_cognition_interface',
    category: 'art',
    prompt:
      'cognition interface artifact, crystalline data matrix, complex embedded patterns, ' +
      'lavender glow, uncommon rarity mind-machine interface',
  },
  {
    id: 'art_cog_04_data_crystallizer',
    category: 'art',
    prompt:
      'data crystallizer artifact, transformation chamber filled with quartz formations, ' +
      'lavender crystalline structures, uncommon rarity data compression transmuter',
  },
  {
    id: 'art_cog_05_assemblee_archive',
    category: 'art',
    prompt:
      'assemblee archive rare artifact, vast crystalline library structure, ' +
      'layered quartz strata with information patterns, rare rarity enormous knowledge artifact inner glow',
  },
  {
    id: 'art_cog_06_cognithari_monolith',
    category: 'art',
    prompt:
      'cognithari monolith legendary artifact, towering featureless quartz monolith with internal data-streams visible, ' +
      'pure geometric perfection, legendary rarity alien intelligence presence',
  },

  // ── Voidthar Drift (Wanderer) ──
  {
    id: 'art_voi_01_anchor_fragment',
    category: 'art',
    prompt:
      'anchor fragment artifact, metallic anchor-point structure, deep-space blue-grey alloy, ' +
      'navigation equipment, void-dark base with silver highlights, common rarity fragment',
  },
  {
    id: 'art_voi_02_drift_resonator',
    category: 'art',
    prompt:
      'drift resonator artifact, resonant transmission device, metallic void-blue tones with silver shimmer, ' +
      'propulsion tuning artifact, common rarity partial form',
  },
  {
    id: 'art_voi_03_navigation_relic',
    category: 'art',
    prompt:
      'navigation relic artifact, ancient star-chart device, geometric navigation patterns, ' +
      'deep blue metallic structure, uncommon rarity stellar navigation',
  },
  {
    id: 'art_voi_04_void_synthesizer',
    category: 'art',
    prompt:
      'void synthesizer artifact, hydrogen processing transmutation device, ' +
      'deep-space blue with silver inlays, uncommon rarity fuel-crafting transmuter stellar alchemy',
  },
  {
    id: 'art_voi_05_void_forge',
    category: 'art',
    prompt:
      'void forge rare artifact, monumental stellar manufacturing facility, dark metallic with impossible geometry, ' +
      'ship-building power, rare rarity aerospace capability inner glow',
  },
  {
    id: 'art_voi_06_voidthar_gate',
    category: 'art',
    prompt:
      'voidthar gate legendary artifact, colossal ring structure in void-dark metal, ' +
      'stellar-scale navigation portal, impossible alien engineering, legendary rarity interstellar gateway overwhelming scale',
  },
];

// ── Phase selection ──
const PHASE_1_ASSETS: AssetDef[] = [...CIVILIZATIONS, ...ARTIFACTS_KAE];
const PHASE_2_ASSETS: AssetDef[] = ARTIFACTS_PHASE_2;

const ASSETS: AssetDef[] = PHASE === 1 ? PHASE_1_ASSETS : PHASE_2_ASSETS;

// ── fal.ai helpers ──

function httpsRequest(options: https.RequestOptions, body?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c: string) => {
        data += c;
      });
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
      mod
        .get(u, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            dl(res.headers.location as string);
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        })
        .on('error', reject);
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
    if (status.status === 'FAILED') throw new Error(`Generation failed: ${JSON.stringify(status)}`);
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

async function trimAndPad512(inputBuffer: Buffer): Promise<Buffer> {
  const trimmedPng = await sharp(inputBuffer).trim().png().toBuffer();

  const meta = await sharp(trimmedPng).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;

  const scale = Math.min(512 / width, 512 / height);
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);

  const resized = await sharp(trimmedPng)
    .resize(newWidth, newHeight, { fit: 'inside' })
    .png()
    .toBuffer();

  const resizedMeta = await sharp(resized).metadata();
  const rw = resizedMeta.width ?? newWidth;
  const rh = resizedMeta.height ?? newHeight;

  const padLeft = Math.floor((512 - rw) / 2);
  const padTop = Math.floor((512 - rh) / 2);

  return sharp(resized)
    .extend({
      top: padTop,
      bottom: 512 - rh - padTop,
      left: padLeft,
      right: 512 - rw - padLeft,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

function outPathFor(asset: AssetDef): string {
  const dir = asset.category === 'civ' ? CIV_DIR : ART_DIR;
  return path.join(dir, `${asset.id}.png`);
}

async function processAssetOnce(asset: AssetDef): Promise<void> {
  const outFile = outPathFor(asset);

  console.log(`    generating...`);
  const rawBuffer = await generateImage(asset.prompt);
  console.log(`    generated (${rawBuffer.length} bytes)`);

  console.log('    uploading for BG removal...');
  const falUrl = await uploadToFal(rawBuffer, `${asset.id}_raw.png`);

  console.log('    removing background...');
  const noBgBuffer = await removeBackground(falUrl);
  console.log(`    BG removed (${noBgBuffer.length} bytes)`);

  console.log('    trimming + padding to 512x512...');
  const finalBuffer = await trimAndPad512(noBgBuffer);

  fs.writeFileSync(outFile, finalBuffer);
  console.log(`    saved: ${outFile}`);
}

async function processAssetWithRetry(
  asset: AssetDef,
  maxAttempts = 3,
): Promise<'generated' | 'skipped' | 'failed'> {
  const outFile = outPathFor(asset);

  if (fs.existsSync(outFile)) {
    console.log(`  SKIP ${asset.id} — already exists`);
    return 'skipped';
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`  ${asset.id} — attempt ${attempt}/${maxAttempts}`);
      await processAssetOnce(asset);
      return 'generated';
    } catch (err) {
      console.error(`    attempt ${attempt} FAILED: ${err}`);
      if (attempt < maxAttempts) {
        console.log('    retrying after 3s...');
        await sleep(3000);
      }
    }
  }

  return 'failed';
}

async function validateAsset(asset: AssetDef): Promise<string | null> {
  const outFile = outPathFor(asset);
  if (!fs.existsSync(outFile)) return 'file missing';

  const stat = fs.statSync(outFile);
  if (stat.size < 10 * 1024) return `file too small (${stat.size} bytes, expected > 10KB)`;

  const meta = await sharp(outFile).metadata();
  if (meta.width !== 512 || meta.height !== 512) {
    return `wrong size ${meta.width}x${meta.height} (expected 512x512)`;
  }
  if (!meta.hasAlpha) return 'no alpha channel';

  return null;
}

async function main(): Promise<void> {
  console.log('=== Artifact Asset Generation ===');
  console.log(`Phase: ${PHASE}`);
  console.log(`Civilizations dir: ${CIV_DIR}`);
  console.log(`Artifacts dir: ${ART_DIR}`);
  console.log(`Assets this phase: ${ASSETS.length}`);
  console.log('');

  if (ASSETS.length === 0) {
    console.log('No assets configured for this phase. Exiting.');
    return;
  }

  fs.mkdirSync(CIV_DIR, { recursive: true });
  fs.mkdirSync(ART_DIR, { recursive: true });

  const results: { asset: AssetDef; status: 'generated' | 'skipped' | 'failed' }[] = [];
  let consecutiveApiFailures = 0;

  for (let i = 0; i < ASSETS.length; i++) {
    const asset = ASSETS[i];
    console.log(`[${i + 1}/${ASSETS.length}] ${asset.id}`);

    const status = await processAssetWithRetry(asset);
    results.push({ asset, status });

    if (status === 'failed') {
      consecutiveApiFailures++;
      if (consecutiveApiFailures >= 5) {
        console.error(`\nAborting: ${consecutiveApiFailures} consecutive failures — possible API outage.`);
        break;
      }
    } else {
      consecutiveApiFailures = 0;
    }

    console.log('');
  }

  // Validation pass
  console.log('=== Validation ===');
  const validationIssues: { id: string; issue: string }[] = [];
  for (const { asset, status } of results) {
    if (status === 'failed') continue;
    const issue = await validateAsset(asset);
    if (issue) {
      validationIssues.push({ id: asset.id, issue });
      console.log(`  ${asset.id}: ${issue}`);
    } else {
      console.log(`  ${asset.id}: OK`);
    }
  }
  console.log('');

  // Summary
  const generated = results.filter((r) => r.status === 'generated').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  console.log('=== SUMMARY ===');
  console.log(`Generated: ${generated}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Failed:    ${failed}`);
  console.log(`Validation issues: ${validationIssues.length}`);
  console.log('');

  if (failed > 0) {
    console.log('Failed assets:');
    for (const r of results) {
      if (r.status === 'failed') console.log(`  - ${r.asset.id}`);
    }
  }
  if (validationIssues.length > 0) {
    console.log('Validation issues:');
    for (const v of validationIssues) console.log(`  - ${v.id}: ${v.issue}`);
  }

  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
