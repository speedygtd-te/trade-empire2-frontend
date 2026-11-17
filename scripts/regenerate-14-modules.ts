/**
 * Regenerate the 14 module sprites Rudi deleted after review.
 *
 * Mirrors scripts/regenerate-23-modules.ts exactly (the proven flow):
 * flux/dev 512x512 PNG -> birefnet/v2 bg removal -> tight crop ->
 * pad to centered 1:1 square -> assets/final/<name>_0.png.
 *
 * Canonical style (per Rudi, NOT to be changed): navy-blue painted steel with
 * yellow safety stripes, weathered metal surfaces, isometric 2.5D, lit from
 * upper left, no background.
 *
 * INDOOR modules get a mandatory factory-section suffix (no standalone building, no roof).
 * EXTERIOR modules are free-standing objects.
 *
 * Usage:
 *   npx tsx scripts/regenerate-14-modules.ts --asset mine [--variant 1]
 *   npx tsx scripts/regenerate-14-modules.ts --list
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FAL_API_KEY =
  process.env['FAL_API_KEY'] ??
  fs
    .readFileSync(path.join(__dirname, '.env'), 'utf-8')
    .split('\n')
    .find((l) => l.startsWith('FAL_API_KEY='))
    ?.replace('FAL_API_KEY=', '')
    .trim() ??
  '';

if (!FAL_API_KEY) {
  console.error('FAL_API_KEY not found in scripts/.env');
  process.exit(1);
}

const REPO_ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(REPO_ROOT, 'assets');

// Canonical style — navy-blue painted steel, yellow safety stripes, weathered metal.
const BASE_STYLE =
  'isometric game asset, isometric 2.5D perspective, 30 degree camera angle from horizontal, ' +
  '2:1 isometric perspective, The Expanse hard sci-fi aesthetic, ' +
  'navy-blue painted steel with yellow safety stripes, weathered metal surfaces, ' +
  'photorealistic textures, scratched paint, grime and oil residue, ' +
  'lit from upper left, soft top-left key light, no background, isolated object, ' +
  'game sprite, centered, single object, no ground plane, no shadow';

// Mandatory suffix for INDOOR modules: ONE SECTION of a larger factory floor.
const INDOOR_SUFFIX =
  ', industrial module installed inside a factory hall, integral part of a larger factory floor, ' +
  'open cutaway view, no standalone building, no exterior walls or roof, exposed machinery section on a deck plate';

// Anti-maritime negatives for the docking modules.
const NO_MARITIME =
  ', no boats, no yachts, no sailing ships, no water, no maritime vessels, no sea, no masts, no sails';

interface AssetDef {
  name: string;
  indoor: boolean;
  variants: string[]; // up to 3 prompt bodies — deliberately varied compositions
}

const ASSET_DEFS: AssetDef[] = [
  // ── INDOOR ──────────────────────────────────────────────────────────────
  {
    name: 'basic_school',
    indoor: true,
    variants: [
      'simple basic school classroom section, a few plain rows of desks and benches facing a single wall-mounted teaching screen, ' +
        'a modest instructor desk, basic shelving, utilitarian and unadorned, much simpler and plainer than a grand university or academy, education deck section',
      'humble primary school section, a small plain classroom with rows of simple desks, a basic chalk-style display board, ' +
        'storage lockers along one wall, no luxury, spartan learning room, modest education section',
      'basic school teaching section, a compact no-frills classroom with plain desks and stools, one teaching screen, ' +
        'a small supply cabinet, austere utilitarian interior, simple education deck section',
    ],
  },
  {
    name: 'cattle_farm',
    indoor: true,
    variants: [
      // emphasise clearly visible cattle — last version animals barely readable
      'livestock cattle section, two rows of metal-railed cattle stalls with a central walkway, several large clearly visible cattle ' +
        'standing in the pens, automated feed troughs full of hay, water lines, the cattle animals are the obvious main feature, agricultural deck section',
      'indoor cattle ranch section, fenced animal pens packed with distinctly recognisable cattle, a central feeding aisle with hay racks, ' +
        'straw bedding, automated feed dispensers, the cows are prominent and unmistakable, farm interior section',
      'cattle farming module, sturdy steel pens each holding a clearly drawn cow, a hay silo with conveyor troughs, water tanks, ' +
        'muck channels, the livestock animals are large and obvious, working cattle section',
    ],
  },
  {
    name: 'engineering_lab',
    indoor: true,
    variants: [
      // fresh composition vs last run
      'engineering laboratory section, a big central structural stress-test press squeezing a metal beam, a CAD workstation with a large ' +
        'holographic 3D machine model floating above, surrounding tool racks and measurement jigs, partly disassembled machinery on a bench, engineering deck section',
      'mechanical engineering lab module, a robotic prototype arm on a calibration stand at the centre, a load-test frame to one side, ' +
        'blueprints and schematics on wall screens, parts trolleys, instrument cabinets, technical workshop section',
      'engineering R&D section, a workbench dominated by a half-built mechanism, a 3D printer and a milling jig nearby, holographic exploded ' +
        'schematic display overhead, tool boards, prototype components in trays, engineering floor section',
    ],
  },
  {
    name: 'research_institute',
    indoor: true,
    variants: [
      // fresh composition vs last run
      'research institute section, a spacious science lab with a central data-analysis hub of curved console banks and a large holographic ' +
        'projection of molecular structures, glass-walled side study offices, researchers at terminals, refined high-tech research deck section',
      'advanced research institute module, paired clean lab benches with analytical instruments flanking a central holographic globe of data, ' +
        'a glass meeting pod, shelves of sample containers, sleek prestigious science interior, research floor section',
      'scientific research institute section, a ring of workstations around a central illuminated experiment column, wall screens of charts, ' +
        'specimen storage racks, a glass partition office, sophisticated research deck section',
    ],
  },
  {
    name: 'university',
    indoor: true,
    variants: [
      // fresh composition vs last run
      'grand university lecture section, a large tiered amphitheatre lecture hall with curved rows of seating facing a wide interactive display ' +
        'wall and a lecturer dais, holographic charts, refined wood-and-steel panelling, warm prestigious lighting, distinguished education deck section',
      'university teaching module, a double-height learning atrium with study mezzanines and balconies, banks of data terminals, ' +
        'a central holographic globe display, gold-trim accents, elegant materials, upscale academic interior section',
      'university hall section, a broad lecture theatre with tiered desks and a large curved presentation screen, side study alcoves with shelves of books, ' +
        'sophisticated ambient lighting, columns with gold trim, prestigious learning space section',
    ],
  },
  {
    name: 'experience_arena',
    indoor: true,
    variants: [
      'immersive VR experience arena section, a circular open play floor ringed by glowing tracking pylons, players in VR rigs, ' +
        'a holographic dome projection overhead, neon accent lighting, tiered spectator benches, leisure deck section',
      'futuristic entertainment arena module, a central holographic combat ring with glowing energy floor markings, VR pods around the edge, ' +
        'large suspended score screens, dramatic coloured lighting, recreation floor section',
      'VR experience hall section, motion-capture play platforms with glowing boundary rings, suspended sensor arrays overhead, ' +
        'lounge seating clusters, vivid neon ambience, leisure deck section',
    ],
  },
  {
    name: 'greenhouse_farm',
    indoor: true,
    variants: [
      // larger / more agricultural than greenhouse
      'large agricultural greenhouse farm section, expansive rows of raised crop beds packed with lush tall green plants and vegetables, ' +
        'overhead grow-light gantries and misting pipes, irrigation channels, a tractor-path aisle, far bigger and more farm-like than a small greenhouse, agricultural deck section',
      'big indoor farm cultivation section, sprawling tiered planting racks heavy with leafy crops and climbing vines under warm grow lights, ' +
        'water troughs and nutrient tanks, harvesting trolleys, a verdant productive farm interior, large agricultural section',
      'industrial greenhouse farm module, broad fields of dense crops in long planter rows under a steel-and-glass canopy, ' +
        'sprinkler lines, fertiliser tanks, a wide central work aisle, abundant lush farmland, large cultivation deck section',
    ],
  },
  {
    name: 'habitat_t2',
    indoor: true,
    variants: [
      // very simple / spartan living section, plainer than habitat
      'very simple spartan crew quarters section, two plain bunk beds against bare navy-steel walls, a small folding table and stools, ' +
        'a basic storage locker, utilitarian and minimal, much plainer than a comfortable habitat, basic living deck section',
      'basic tier-2 habitat section, a cramped austere living cabin with a single bunk, a tiny kitchenette nook, a plain locker, ' +
        'exposed pipework, no comforts, spartan crew quarters section',
      'humble crew berth section, simple stacked bunks, a narrow bench seat, a basic supply cabinet, bare riveted steel walls, ' +
        'minimal furnishings, austere living deck section',
    ],
  },
  {
    name: 'mine',
    indoor: true,
    variants: [
      // Rudi liked the old one — keep the shaft/conveyor idea, align to navy-steel
      'mining extraction section, a dark sloping mine shaft descending into the deck plate with a conveyor belt hauling ore chunks up out of it, ' +
        'a head-frame winch with cabling, rock rubble and ore piles, dust, navy-blue steel framing with yellow hazard stripes, underground extraction deck section',
      'ore mining module, an open mine shaft mouth in the floor with a powered conveyor lifting rock out, a winch tower and ore hopper beside it, ' +
        'scattered ore boulders and dust, weathered steel with yellow striping, mining deck section',
      'mine shaft section, a descending excavation pit with rail tracks and an ore cart, a conveyor feeding a crusher, support beams, ' +
        'rubble and dust, navy steel and hazard stripes, raw extraction deck section',
    ],
  },
  {
    name: 'deep_drill',
    indoor: true,
    variants: [
      // massive / heavier than mine
      'massive deep boring drill rig, a colossal vertical drilling tower with a huge rotating drill string plunging into the deck, ' +
        'enormous hydraulic clamps and a heavy gearbox head, thick mud hoses, towering derrick framing, far bigger and heavier than a simple mine, ' +
        'navy-blue steel with yellow hazard stripes, heavy deep-drilling deck section',
      'gigantic deep-drill module, an oversized rotary drilling assembly with a thick segmented drill pipe driven by a giant top-drive motor, ' +
        'massive support legs, hydraulic rams, cooling and mud lines, monumental industrial scale, deep extraction deck section',
      'heavy deep boring machine, a towering drill mast over a reinforced wellhead with a huge auger bit, large winches and pipe racks, ' +
        'thick cabling and pressure lines, weathered navy steel, imposing deep-drilling deck section',
    ],
  },
  {
    name: 'smelter',
    indoor: true,
    variants: [
      // Rudi liked the old one — furnace, glow, casting moulds, align to navy-steel
      'metal smelter section, a large furnace glowing bright orange inside, a tilting ladle pouring molten metal into a row of ingot casting moulds, ' +
        'cooling pipes and slag chute, exhaust ducting, heavy grimy navy-steel machinery with yellow hazard stripes, smelting deck section',
      'smelting furnace module, a tall electric arc furnace with a charging hopper and a glowing tap hole, a ladle car carrying molten metal to moulds, ' +
        'water-cooled cabling, soot-stained navy steel, gantry crane, smelting deck section',
      'ore smelter section, a glowing crucible furnace with molten metal pour into casting moulds on a conveyor, slag runners, cooling coils, ' +
        'exhaust hoods, grimy weathered steel with yellow stripes, hot smelting deck section',
    ],
  },

  // ── EXTERIOR ────────────────────────────────────────────────────────────
  {
    name: 'dock_large',
    indoor: false,
    variants: [
      // CRITICAL: spacecraft docking bay, NOT a sailing ship / boat / water
      'large spacecraft docking bay, a massive cavernous open dock structure with a huge clamshell bay door, extending docking arms ' +
        'and gantry walkways, heavy clamp arms to grip a starship, bright bay floodlights, towering navy-blue steel walls with yellow hazard chevrons, ' +
        'starship berth, The Expanse-style hard sci-fi, monumental free-standing dock' +
        NO_MARITIME,
      'big spacecraft dock module, an enormous starship berth with a wide open mouth, telescoping boarding gantries, fuelling booms and crane arms, ' +
        'illuminated approach guide lights, reinforced colossal navy steel framing with yellow striping, imposing free-standing space docking structure, ' +
        'The Expanse hard sci-fi spaceport' +
        NO_MARITIME,
      'large starship docking bay, a grand hangar-scale space dock with retractable doors, multiple docking clamps and service gantries, ' +
        'floodlit interior, vast navy steel hull with hazard markings, monumental isolated spacecraft dock structure, ' +
        'hard sci-fi orbital berth, The Expanse aesthetic' +
        NO_MARITIME,
    ],
  },
  {
    name: 'loading_dock',
    indoor: false,
    variants: [
      'loading dock module, a freight bay at the edge of a facility facade with a large roll-up cargo door and a fold-down loading ramp, ' +
        'yellow safety striping on the ramp edges, dock bumper guards, a control panel, weathered navy steel, free-standing dock section' +
        NO_MARITIME,
      'cargo loading dock, an industrial dock gate with an extended ramp and a raised lift platform, dock bumpers and bollards, ' +
        'hazard stripes, a small control booth, structure-edge facade section, weathered navy steel' +
        NO_MARITIME,
      'small loading dock module, a wide bay door with a sloped truck ramp and yellow guide markings, a dock leveller, ' +
        'bollards and a railing, weathered navy-steel facade edge, free-standing dock' +
        NO_MARITIME,
    ],
  },
  {
    name: 'rtg',
    indoor: false,
    variants: [
      // emphasise cooling fins — last run lost them
      'radioisotope thermoelectric generator, a stout cylindrical RTG with prominent radial cooling fins radiating from the central core all along its length, ' +
        'a finned heat-sink cylinder, a sealed glowing radioactive core, yellow-and-black radiation trefoil markings, sturdy bolted base, ' +
        'the radial fins are the dominant feature, compact free-standing power unit',
      'RTG nuclear battery, an upright finned cylinder with many prominent radial cooling fins stacked like a heat sink around the core column, ' +
        'a sealed core port with a faint warm glow, hazard striping and warning labels, navy steel base, ' +
        'the finned heat sink is unmistakable, isolated compact unit',
      'radioisotope generator with a finned heat-sink barrel, a central sealed core surrounded by prominent radial cooling fins, ' +
        'radiation trefoil markings, a simple sturdy base, faint warm glow, the cooling fins clearly radiate outward, single compact object, simple composition',
    ],
  },
];

interface FalSubmit {
  status_url: string;
  response_url: string;
}

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
  return httpsRequest({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers });
}

async function generateImage(prompt: string): Promise<Buffer> {
  const submitRaw = await httpsRequest(
    {
      hostname: 'queue.fal.run',
      path: '/fal-ai/flux/dev',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
    },
    JSON.stringify({
      prompt,
      image_size: { width: 512, height: 512 },
      num_inference_steps: 28,
      guidance_scale: 7.5,
      num_images: 1,
      enable_safety_checker: false,
      output_format: 'png',
    }),
  );
  const submit = JSON.parse(submitRaw) as FalSubmit;

  for (let i = 0; i < 120; i++) {
    await sleep(2000);
    const status = JSON.parse(await httpsGet(submit.status_url, { Authorization: `Key ${FAL_API_KEY}` }));
    if (status.status === 'COMPLETED') {
      const result = JSON.parse(await httpsGet(submit.response_url, { Authorization: `Key ${FAL_API_KEY}` }));
      return downloadBuffer(result.images[0].url as string);
    }
    if (status.status === 'FAILED') throw new Error('Generation failed');
    process.stdout.write('.');
  }
  throw new Error('Timeout');
}

async function uploadToFal(buf: Buffer, name: string): Promise<string> {
  const initRaw = await httpsRequest(
    {
      hostname: 'rest.alpha.fal.ai',
      path: '/storage/upload/initiate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${FAL_API_KEY}` },
    },
    JSON.stringify({ content_type: 'image/png', file_name: name }),
  );
  const init = JSON.parse(initRaw) as { upload_url: string; file_url: string };
  const u = new URL(init.upload_url);
  await new Promise<void>((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'PUT',
        headers: { 'Content-Type': 'image/png', 'Content-Length': buf.length.toString() },
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve());
      },
    );
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
  return init.file_url;
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
  const result = JSON.parse(raw) as { image: { url: string } };
  return downloadBuffer(result.image.url);
}

async function tightCrop(inputBuffer: Buffer): Promise<Buffer> {
  return sharp(inputBuffer).trim().png().toBuffer();
}

async function padSquare(croppedBuffer: Buffer): Promise<Buffer> {
  const meta = await sharp(croppedBuffer).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const size = Math.max(w, h);
  const padLeft = Math.floor((size - w) / 2);
  const padTop = Math.floor((size - h) / 2);
  return sharp(croppedBuffer)
    .extend({
      top: padTop,
      bottom: size - h - padTop,
      left: padLeft,
      right: size - w - padLeft,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function downloadBuffer(url: string): Promise<Buffer> {
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function buildPrompt(def: AssetDef, variant: number): string {
  const body = def.variants[variant] ?? def.variants[0];
  return def.indoor ? `${BASE_STYLE}, ${body}${INDOOR_SUFFIX}` : `${BASE_STYLE}, ${body}`;
}

async function main(): Promise<void> {
  if (process.argv.includes('--list')) {
    for (const d of ASSET_DEFS) console.log(`${d.indoor ? 'INDOOR' : 'EXT   '}  ${d.name}`);
    console.log(`\nTotal: ${ASSET_DEFS.length}`);
    return;
  }

  const assetIdx = process.argv.indexOf('--asset');
  const variantIdx = process.argv.indexOf('--variant');
  const assetName = assetIdx >= 0 ? process.argv[assetIdx + 1] : '';
  const variant = variantIdx >= 0 ? parseInt(process.argv[variantIdx + 1] ?? '0', 10) : 0;

  const def = ASSET_DEFS.find((d) => d.name === assetName);
  if (!def) {
    console.error(`Unknown --asset "${assetName}". Use --list to see names.`);
    process.exit(1);
  }

  const RAW = path.join(ASSETS, 'raw', `module_${def.name}_raw.png`);
  const NOBG = path.join(ASSETS, 'nobg', `module_${def.name}_nobg.png`);
  const CROPPED = path.join(ASSETS, 'cropped', `module_${def.name}_cropped.png`);
  const FINAL = path.join(ASSETS, 'final', `${def.name}_0.png`);
  for (const p of [RAW, NOBG, CROPPED, FINAL]) fs.mkdirSync(path.dirname(p), { recursive: true });

  const prompt = buildPrompt(def, variant);
  console.log(`${def.name} (${def.indoor ? 'INDOOR' : 'EXTERIOR'}) — variant ${variant}`);
  process.stdout.write('  generating');
  const rawBuf = await generateImage(prompt);
  fs.writeFileSync(RAW, rawBuf);
  console.log(` done`);

  process.stdout.write('  bg removal');
  const falUrl = await uploadToFal(rawBuf, `module_${def.name}.png`);
  const noBgBuf = await removeBackground(falUrl);
  fs.writeFileSync(NOBG, noBgBuf);
  console.log(` done`);

  process.stdout.write('  tight crop');
  const croppedBuf = await tightCrop(noBgBuf);
  fs.writeFileSync(CROPPED, croppedBuf);
  const cm = await sharp(croppedBuf).metadata();
  console.log(` done (${cm.width}x${cm.height})`);

  process.stdout.write('  pad to square');
  const finalBuf = await padSquare(croppedBuf);
  fs.writeFileSync(FINAL, finalBuf);
  const fm = await sharp(finalBuf).metadata();
  console.log(` done (${fm.width}x${fm.height}) -> ${path.relative(REPO_ROOT, FINAL)}`);
}

main().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});
