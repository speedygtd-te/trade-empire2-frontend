/**
 * Regenerate the 37 deleted module sprites via fal.ai.
 *
 * Mirrors scripts/regenerate-17-modules.ts exactly (the proven flow):
 * flux/dev 512x512 PNG -> birefnet/v2 bg removal -> tight crop ->
 * pad to centered 1:1 square -> assets/final/<name>_0.png.
 *
 * Canonical style (per Rudi): navy-blue painted steel with yellow safety stripes,
 * weathered metal surfaces, isometric 2.5D, lit from upper left, no background.
 *
 * INDOOR modules get a mandatory factory-section suffix (no standalone building, no roof).
 * EXTERIOR modules are free-standing objects.
 *
 * Usage:
 *   npx tsx scripts/regenerate-37-modules.ts --asset assembler [--variant 1]
 *   npx tsx scripts/regenerate-37-modules.ts --list
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

interface AssetDef {
  name: string;
  indoor: boolean;
  variants: string[]; // up to 3 prompt bodies
}

const ASSET_DEFS: AssetDef[] = [
  // ── INDOOR: education ────────────────────────────────────────────────────
  {
    name: 'academy',
    indoor: true,
    variants: [
      'training academy section, rows of desks with holographic study terminals, a teaching display wall, ' +
        'seated learning area, instructor podium',
      'crew academy room, student workstations facing a large presentation panel, supply shelving, simple functional interior',
      'education academy module, classroom with desks and learning screens, wall charts, ceiling light strips',
    ],
  },
  {
    name: 'advanced_school',
    indoor: true,
    variants: [
      'advanced school section, modern lecture area with tiered seating and large interactive displays, ' +
        'data terminals, refined lighting, well-equipped learning space',
      'higher education classroom, advanced study pods with multiple screens, holographic charts, sleek interior',
      'advanced training room, equipped lecture hall with terminals and a teaching dais, polished panels',
    ],
  },
  {
    name: 'elite_academy',
    indoor: true,
    variants: [
      'elite academy section, luxurious lecture hall with premium curved seating, large holographic projection dome, ' +
        'gold-trimmed panels, advanced simulation pods, prestigious learning space',
      'elite training institute room, high-end study suites with multiple large displays, ambient lighting, refined materials',
      'prestigious academy module, premium classroom with holographic instructor podium, sophisticated equipment, polished interior',
    ],
  },
  // ── INDOOR: industry ───────────────────────────────────────────────────────
  {
    name: 'assembler',
    indoor: true,
    variants: [
      'robotic assembly line module, multiple articulated robot arms over a conveyor belt, ' +
        'half-assembled machine parts on the line, control panels with glowing indicators, overhead gantry',
      'automated assembler station, row of yellow robotic welding arms on a fabrication bench, parts conveyor, cable bundles, status screens',
      'manufacturing assembler cell, robotic arms and a rotating work table, tool racks, pneumatic actuators, blinking terminals',
    ],
  },
  {
    name: 'chemical_plant',
    indoor: true,
    variants: [
      'chemical processing plant section, tall reaction vessels and distillation columns with thick pipework, ' +
        'valve manifolds, pressure gauges, catwalks, glowing process indicators',
      'chemical plant module, clustered storage tanks and reactor towers, intricate piping, control valves, hazard striping',
      'industrial chemistry plant section, process reactors with coiled pipes, pumps, gauges, exposed plant machinery',
    ],
  },
  {
    name: 'electronics_factory',
    indoor: true,
    variants: [
      'electronics factory module, clean assembly line producing circuit boards, pick-and-place robotic arms, ' +
        'conveyor with PCB trays, glowing test stations, monitor screens',
      'electronics manufacturing section, SMT assembly machines, reels of components, robotic placement heads, control terminals',
      'circuit board factory module, automated electronics line with inspection cameras, racks of finished boards, status displays',
    ],
  },
  {
    name: 'refinery',
    indoor: true,
    variants: [
      'ore refinery module, large smelting furnace with glowing molten metal, ladles and crucibles, ' +
        'thick exhaust ducting, slag chutes, heavy industrial machinery section',
      'metal refinery section, blast furnace with orange glow, conveyor of ore, cooling pipes, pouring channels, grimy steel',
      'refinery processing module, furnace and electrolysis cells, piping, gantry crane, molten metal glow, exposed plant equipment',
    ],
  },
  {
    name: 'fusion_reactor',
    indoor: true,
    variants: [
      'fusion reactor module, a large toroidal tokamak chamber with magnetic coils, glowing blue plasma core, ' +
        'cooling pipes, control consoles, thick cabling, exposed reactor section',
      'nuclear fusion reactor section, spherical containment vessel with intense blue glow, superconducting coil rings, diagnostic ports',
      'fusion power core module, tokamak ring with energy glow, heavy shielding panels, coolant manifolds, monitoring terminals',
    ],
  },
  // ── INDOOR: labs ───────────────────────────────────────────────────────────
  {
    name: 'chemistry_lab',
    indoor: true,
    variants: [
      'chemistry laboratory module, lab benches with glassware, fume hoods, beakers and flasks, ' +
        'reagent shelving, analysis instruments, monitor screens, lab floor section',
      'chemistry lab section, workbenches with distillation apparatus and sample racks, centrifuges, control terminals',
      'analytical chemistry lab module, fume cabinet, flasks and pipettes, spectrometer, glowing readouts, clean interior',
    ],
  },
  {
    name: 'electronics_lab',
    indoor: true,
    variants: [
      'electronics laboratory module, workbenches with oscilloscopes and soldering stations, circuit prototypes, ' +
        'component bins, diagnostic screens, lab floor section',
      'electronics R&D lab section, test benches with PCB prototypes, probe stations, measurement instruments, cable spools',
      'electronics lab module, microscope inspection station, signal analyzers, breadboards, glowing test rigs',
    ],
  },
  {
    name: 'physics_lab',
    indoor: true,
    variants: [
      'physics laboratory module, a particle accelerator ring segment and instrument racks, glowing experiment chamber, ' +
        'monitoring consoles, cabling, lab floor section',
      'physics research lab section, a large cylindrical reactor-test apparatus, sensor arrays, data screens with waveforms, control desks',
      'experimental physics module, vacuum chamber with electromagnets, instrument towers, blue energy glow, monitoring terminals',
    ],
  },
  {
    name: 'planetology_lab',
    indoor: true,
    variants: [
      'planetology laboratory module, geology workbenches with rock and mineral samples, a holographic planet globe display, ' +
        'soil analysis instruments, sample drawers, lab floor section',
      'planetary science lab section, core sample racks, spectrometers, a glowing 3D terrain hologram, research terminals',
      'planetology lab module, mineral analysis stations, sample containers, holographic geological surveys, science equipment',
    ],
  },
  {
    name: 'research_institute',
    indoor: true,
    variants: [
      'research institute module, a large multi-discipline research floor with banks of supercomputers, ' +
        'holographic data walls, collaborative workstations, glowing server racks, advanced lab section',
      'science institute section, rows of computation servers, holographic projection tables, research desks, sophisticated equipment',
      'research institute module, integrated lab floor with server towers, data visualization screens, instrument clusters',
    ],
  },
  // ── INDOOR: storage / pump ─────────────────────────────────────────────────
  {
    name: 'basic_storage',
    indoor: true,
    variants: [
      'basic storage module, steel shelving racks stacked with cargo crates and containers, ' +
        'pallets on the deck, simple warehouse floor section, utilitarian metal',
      'warehouse storage section, rows of metal storage racks with boxes and barrels, forklift lane markings, plain interior',
      'cargo storage module, shelving units with crates, stacked containers, yellow floor stripes, storage hall section',
    ],
  },
  {
    name: 'large_storage',
    indoor: true,
    variants: [
      'large storage module, tall multi-level cargo racking filled with containers and crates, ' +
        'an automated stacker crane, wide aisles, expansive warehouse floor section',
      'high-capacity storage section, towering shelving columns packed with goods, gantry retrieval system, freight pallets',
      'large warehouse module, dense rows of high storage racks, robotic crane, stacked cargo, big storage hall floor section',
    ],
  },
  {
    name: 'big_pump',
    indoor: true,
    variants: [
      'large industrial pump module, massive centrifugal pump with thick pipes and pressure gauges, ' +
        'valve wheels, electric motor coupling, mounted on a steel skid',
      'heavy fluid pump station section, big pump housing with inlet and outlet manifolds, gauges, control valves, riveted dark steel',
      'oversized process pump module, twin pump bodies with large bore piping, pressure dials, motor drive, support frame',
    ],
  },
  // ── INDOOR: habitat (tiered) ───────────────────────────────────────────────
  {
    name: 'habitat',
    indoor: true,
    variants: [
      'basic crew habitat module, simple living quarters with bunk beds and lockers, a small common table, ' +
        'wall storage, modest utilitarian cabin floor section',
      'basic habitation section, stacked sleeping berths, personal lockers, narrow walkway, plain paneling, functional living deck',
      'simple crew quarters module, dormitory bunks and storage units, ceiling light strips, a seating nook, basic living-space section',
    ],
  },
  {
    name: 'habitat_t4',
    indoor: true,
    variants: [
      'tier 4 comfortable crew habitat module, private sleeping pods, a lounge with soft couches, a kitchenette, ' +
        'plants and warm lighting, comfortable cabin floor section',
      'comfortable habitation section, individual cabin units, a shared lounge with seating and wall screens, decorative paneling, upscale living deck',
      'tier 4 crew quarters module, partitioned private rooms, a social space with table and seats, ambient lighting, refined interior',
    ],
  },
  {
    name: 'habitat_t5',
    indoor: true,
    variants: [
      'tier 5 luxurious crew habitat module, spacious private suites with large viewports, an elegant lounge with premium furniture, ' +
        'lush greenery, gold-trim accents, warm sophisticated lighting, luxury living section',
      'luxury habitation section, opulent cabin suites, a refined common salon with fine seating and art, mood lighting, premium materials',
      'tier 5 deluxe quarters module, lavish living spaces, plush furnishings, decorative plants, ambient glow, high-end interior section',
    ],
  },
  // ── INDOOR: leisure ────────────────────────────────────────────────────────
  {
    name: 'luxury_promenade',
    indoor: true,
    variants: [
      'luxury promenade module, an upscale indoor shopping arcade with storefronts, glowing signage, ' +
        'planters with trees, a central walkway with benches, elegant lighting, leisure floor section',
      'luxury promenade section, refined boulevard with boutique fronts, fountains, seating areas, decorative greenery, polished floors',
      'high-end promenade module, indoor leisure avenue with shops and cafes, ambient lighting, trees in planters, sophisticated interior',
    ],
  },
  {
    name: 'entertainment_center',
    indoor: true,
    variants: [
      'entertainment center module, an indoor leisure hall with arcade machines, a holographic stage, ' +
        'lounge seating, neon lighting, a small bar counter, leisure floor section',
      'entertainment complex section, game stations, a performance stage with screens, colorful lighting, seating clusters',
      'entertainment center module, recreation hall with holographic displays, arcade cabinets, bar area, vibrant interior',
    ],
  },
  {
    name: 'gallery',
    indoor: true,
    variants: [
      'art gallery module, an elegant exhibition hall with framed artworks and sculptures on plinths, ' +
        'soft directional spotlights, benches, refined minimalist interior, leisure floor section',
      'museum gallery section, display cases with artifacts, mounted paintings, accent lighting, polished floor, quiet refined space',
      'gallery module, exhibition room with art on walls and pedestal sculptures, gentle lighting, viewing benches',
    ],
  },
  // ── INDOOR: medical / technical ────────────────────────────────────────────
  {
    name: 'hospital',
    indoor: true,
    variants: [
      'hospital module, a medical ward with patient beds, monitoring equipment, IV stands, ' +
        'a nurse station, medical cabinets, clean white-and-blue interior, medical floor section',
      'hospital ward section, rows of treatment beds with vitals monitors, medical carts, supply cabinets, sterile interior',
      'hospital module, patient care bay with beds and diagnostic machines, glowing monitors, medical staff station',
    ],
  },
  {
    name: 'medical_center',
    indoor: true,
    variants: [
      'advanced medical center module, a high-tech treatment bay with surgical robots, scanning pods, ' +
        'holographic patient diagnostics, sterile equipment, sophisticated medical floor section',
      'medical center section, automated surgery suite, body scanners, medical robotic arms, glowing diagnostic screens, clean interior',
      'advanced medical module, regeneration pods, robotic surgical stations, holographic vitals displays, premium medical equipment',
    ],
  },
  {
    name: 'sanitation_station',
    indoor: true,
    variants: [
      'sanitation station module, water recycling and filtration tanks with pipework, pumps, ' +
        'cleaning machinery, filter banks, control gauges, utilitarian industrial floor section',
      'sanitation processing section, waste-treatment vats, filtration columns, pipes and valves, monitoring panel, grimy steel',
      'sanitation module, recycling tanks and purification units, pumps, ducting, hazard striping, plant machinery section',
    ],
  },
  {
    name: 'life_support',
    indoor: true,
    variants: [
      'life support module, air-recycling machinery with oxygen scrubber columns, ducting, ' +
        'pumps, pressure tanks, glowing status panels, dense technical equipment floor section',
      'life support systems section, atmosphere processors, gas tanks, fan units, piping, control terminals, exposed machinery',
      'life support module, oxygen generation units with filters and ducts, coolant pipes, monitoring screens, technical section',
    ],
  },
  {
    name: 'guard_post',
    indoor: true,
    variants: [
      'security guard post module, a small interior control room with monitoring screens, a desk console, ' +
        'a weapons rack, reinforced door, lockers, security floor section',
      'guard station section, surveillance monitor wall, control desk, equipment lockers, armored panels, compact security room',
      'security post module, watch station with camera feeds, a duty desk, gear racks, reinforced interior',
    ],
  },
  // ── INDOOR: special structural sections ────────────────────────────────────
  {
    name: 'atmospheric_processor',
    indoor: true,
    variants: [
      'large atmospheric processor module, a massive air-processing machine with huge intake fans, ' +
        'tall gas-exchange columns, thick ducting and condensers, glowing vents, towering industrial machinery section',
      'atmospheric processing section, enormous turbine fans and scrubber towers, heat exchangers, vast ductwork, control catwalks',
      'atmosphere processor module, giant air-handling machine with rotating intake blades, tall reactor columns, piping, big machinery section',
    ],
  },
  {
    name: 'biosphere',
    indoor: true,
    variants: [
      'biosphere module, a glassed-in ecosystem section with lush vegetation, trees and ferns inside a steel-framed conservatory, ' +
        'misting systems, grow lights, a small pond, glazed greenhouse section integral to the structure',
      'enclosed biosphere section, glass-walled garden with dense plants and trees, irrigation pipes, warm grow lighting, framed glazing',
      'biosphere conservatory module, transparent dome section over verdant vegetation, hanging plants, water feature, steel-and-glass frame',
    ],
  },
  // ── EXTERIOR ───────────────────────────────────────────────────────────────
  {
    name: 'ship_yard',
    indoor: false,
    variants: [
      'spacecraft construction yard, a starship hull cradle with scaffolding and gantry cranes around a partly-built ' +
        'starship fuselage, The Expanse-style hard sci-fi, work platforms, welding rigs, free-standing industrial structure, ' +
        'no boats, no yachts, no water, no maritime vessels, no sea',
      'starship assembly yard, a large spacecraft hull held in a steel construction cradle, surrounding gantry cranes and ' +
        'scaffolding towers, hard sci-fi The Expanse aesthetic, work lifts, free-standing yard, no boats, no yachts, no water, no sea, no maritime',
      'spacecraft shipyard module, a starship under construction in a hull cradle with gantry cranes, scaffolding, ' +
        'crew platforms, exposed ship frame, hard sci-fi industrial, isolated structure, no boats, no yachts, no water, no maritime vessels',
    ],
  },
  {
    name: 'wind_turbine',
    indoor: false,
    variants: [
      'futuristic sci-fi vertical-axis wind turbine module, sleek curved vertical helical turbine blades around a central column, ' +
        'glowing energy ring, dark metal base, advanced clean-energy generator, NOT a conventional three-blade windmill',
      'advanced sci-fi wind energy module, a bladeless toroidal wind harvester ring on a pylon, subtle blue energy glow, ' +
        'futuristic dark alloy housing, compact free-standing power unit, NOT a traditional propeller windmill',
      'high-tech vertical wind turbine module, vertical twisting turbine fins on a sturdy column, glowing power coupling at the base, ' +
        'sci-fi industrial design, isolated energy generator, NOT a classic horizontal-axis wind turbine',
    ],
  },
  {
    name: 'geothermal_plant',
    indoor: false,
    variants: [
      'geothermal power plant module, a wellhead with thick insulated steam pipes rising into a turbine housing, ' +
        'cooling stacks venting faint steam, pressure valves, free-standing unit',
      'geothermal energy module, a borehole rig with steam separators and curved pipework into a generator block, ' +
        'venting vapor, gauges, compact isolated power station',
      'geothermal plant module, clustered steam pipes and a turbine generator over a drilled wellhead, cooling tower, control cabinet, single object',
    ],
  },
  {
    name: 'tidal_generator',
    indoor: false,
    variants: [
      'tidal power generator module, a submerged-style turbine housing on a sturdy steel platform with large turbine intakes, ' +
        'flow ducts, power conduits, weathered marine-grade metal, free-standing power unit',
      'tidal energy generator module, a turbine pod on a braced support frame with curved water-flow channels, generator housing, ' +
        'cabling, compact isolated unit',
      'tidal turbine module, a horizontal-axis water turbine in a tubular duct on a platform base, power coupling, struts, single object',
    ],
  },
  {
    name: 'rtg',
    indoor: false,
    variants: [
      'radioisotope thermoelectric generator module, a cylindrical RTG unit with prominent heat-dissipation fins, ' +
        'a central radioactive core housing, warning trefoil markings, sturdy base, compact free-standing power unit',
      'RTG nuclear battery module, a finned cylindrical generator with radiator vanes, sealed core canister, hazard striping, isolated unit',
      'radioisotope generator module, a ribbed heat-fin cylinder on a base, glowing core port, radiation markings, single compact object',
    ],
  },
  {
    name: 'collector',
    indoor: false,
    variants: [
      'resource collector module, a wide funnel-shaped intake collector on a steel frame with conveyor outlet, ' +
        'hoppers, sorting bins, mechanical scoops, compact free-standing harvesting unit',
      'resource collection module, a large intake hopper with rotating gathering arms, conveyor belt, support legs, weathered industrial metal',
      'collector module, a scoop intake feeding into a storage hopper, conveyor outlet, motor housing, isolated free-standing object',
    ],
  },
  {
    name: 'heavy_wheel',
    indoor: false,
    variants: [
      'heavy vehicle drive module, a single massive heavy-duty off-road wheel with chunky deep-tread tire, ' +
        'a riveted dark steel hub block with yellow warning label, drive motor housing and suspension arm, ' +
        'worn black rubber and weathered gunmetal steel, ground vehicle running gear, matches wheel and tracks style',
      'heavy wheel drive unit module, one oversized treaded tire on a reinforced steel rim, heavy axle hub with bolts, ' +
        'electric drive motor pod, mud and grime, dark steel and black rubber, isolated running gear',
      'heavy-duty rover wheel module, a single large deep-tread wheel with a steel hub housing, yellow hazard label, ' +
        'suspension strut, sealed motor, worn rubber, weathered gunmetal, ground propulsion part',
    ],
  },
  {
    name: 'loading_dock',
    indoor: false,
    variants: [
      'loading dock module, a docking and loading bay at the edge of a factory facade with a large roll-up cargo door, ' +
        'a fold-down loading ramp, yellow safety striping, bumper guards, part of a structure facade, free-standing dock section',
      'cargo loading dock module, a freight bay door with an extended loading ramp, dock bumpers, hazard stripes, ' +
        'a small control panel, weathered steel facade edge section',
      'loading dock module, an industrial dock gate with ramp and bay door on a structure edge, yellow markings, ' +
        'lift platform, bollards, free-standing facade dock',
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
