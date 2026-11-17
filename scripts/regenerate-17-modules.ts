/**
 * Regenerate the 17 deleted module sprites via fal.ai.
 *
 * Mirrors scripts/generate-tracks-asset.ts exactly (the flow that passed iso-validation
 * on the first try): flux/dev 512x512 PNG -> birefnet/v2 bg removal -> tight crop ->
 * pad to centered 1:1 square -> assets/final/<name>_0.png.
 *
 * INDOOR modules get a mandatory factory-section suffix (no standalone building, no roof).
 * EXTERIOR modules are free-standing objects matching the existing fleet/power style.
 *
 * Usage:
 *   npx tsx scripts/regenerate-17-modules.ts --asset assembler [--variant 1]
 *   npx tsx scripts/regenerate-17-modules.ts --list
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

// Base style shared by ALL modules — matches the existing dark navy-gunmetal / yellow-accent
// factory aesthetic (factory_0, mine_0) and the weathered Expanse fleet parts.
const BASE_STYLE =
  'isometric game asset, 30 degree camera angle from horizontal, 2:1 isometric perspective, ' +
  'The Expanse hard sci-fi aesthetic, dark gunmetal and navy-blue painted steel with yellow safety-stripe accents, ' +
  'photorealistic textures, realistic worn and dirty metal surfaces, scratched paint, grime and oil residue, ' +
  'lit from upper left, soft top-left key light, transparent background, no background, isolated object, ' +
  'game sprite, centered, single object, no ground plane, no shadow';

// Mandatory suffix for INDOOR modules (per Rudi): looks like ONE SECTION of a larger factory
// floor — not a standalone building, no exterior facade or roof.
const INDOOR_SUFFIX =
  ', industrial module installed inside a factory hall, integral part of a larger factory floor, ' +
  'open machinery section on an industrial deck plate, exposed equipment, ' +
  'no standalone building, no exterior walls, no roof, no rooftop, no enclosure, open machinery, cutaway interior section';

interface AssetDef {
  name: string;
  indoor: boolean;
  variants: string[]; // up to 3 prompt bodies (without BASE_STYLE / suffix)
}

const ASSET_DEFS: AssetDef[] = [
  // ── INDOOR ───────────────────────────────────────────────────────────────
  {
    name: 'assembler',
    indoor: true,
    variants: [
      'robotic assembly line module, multiple articulated robot arms over a conveyor belt, ' +
        'half-assembled machine parts on the line, control panels with glowing indicators, overhead gantry',
      'automated assembler station, row of orange robotic welding arms on a fabrication bench, ' +
        'parts conveyor, cable bundles, status screens, dark steel framework',
      'manufacturing assembler cell, robotic arms and a rotating work table, tool racks, ' +
        'pneumatic actuators, blinking control terminals, industrial floor section',
    ],
  },
  {
    name: 'basic_school',
    indoor: true,
    variants: [
      'classroom education module, rows of desks with small holographic learning terminals, ' +
        'a teaching display board on the wall, seated study area, interior school floor section',
      'basic school room module, simple desks and chairs, a large wall-mounted teaching screen, ' +
        'shelving with supplies, plain functional interior deck',
      'training classroom module, several student workstations facing a presentation panel, ' +
        'utilitarian furniture, ceiling light strips, factory-deck classroom section',
    ],
  },
  {
    name: 'big_pump',
    indoor: true,
    variants: [
      'large industrial pump module, massive centrifugal pump with thick pipes and pressure gauges, ' +
        'valve wheels, electric motor coupling, mounted on a steel skid on a factory deck',
      'heavy fluid pump station module, big pump housing with inlet and outlet manifolds, ' +
        'gauges, control valves, riveted dark steel, machinery section of a plant floor',
      'oversized process pump module, twin pump bodies with large bore piping, pressure dials, ' +
        'motor drive, support frame, exposed industrial equipment section',
    ],
  },
  {
    name: 'cattle_farm',
    indoor: true,
    variants: [
      'indoor livestock module, rows of metal cattle pens with feeding troughs and railings, ' +
        'a few cattle inside, automated feed lines overhead, barn floor section inside a facility',
      'enclosed cattle farming module, fenced animal stalls on a steel deck, feed dispensers, ' +
        'water lines, hay bales, industrial agriculture floor section, no outdoor field',
      'interior cattle ranch module, partitioned pens with livestock, automated feeder rails, ' +
        'drainage grates, utilitarian metal railings, farm hall floor section',
    ],
  },
  {
    name: 'engineering_lab',
    indoor: true,
    variants: [
      'engineering laboratory module, workbenches with mechanical prototypes and tools, ' +
        '3D printers, a robotic test rig, oscilloscopes and screens, lab floor section inside a facility',
      'engineering research lab module, test benches with engine and machine components, ' +
        'CAD display screens, tool walls, measurement instruments, interior lab deck section',
      'mechanical engineering lab module, prototyping station with a clamped assembly, ' +
        'diagnostic terminals, parts bins, overhead crane rail, factory lab floor section',
    ],
  },
  {
    name: 'physics_lab',
    indoor: true,
    variants: [
      'physics laboratory module, a particle accelerator ring segment and instrument racks, ' +
        'glowing experiment chamber, monitoring consoles, cabling, lab floor section inside a facility',
      'physics research lab module, a large cylindrical reactor-test apparatus, ' +
        'sensor arrays, data screens with waveforms, control desks, interior lab deck',
      'experimental physics module, vacuum chamber with electromagnets, instrument towers, ' +
        'blue energy glow, monitoring terminals, scientific equipment floor section',
    ],
  },
  {
    name: 'habitat_t2',
    indoor: true,
    variants: [
      'tier 2 crew habitat module, compact living quarters with bunk beds and lockers, ' +
        'a small common table, wall storage, modest interior cabin floor section inside a facility',
      'basic habitation module interior, stacked sleeping berths, personal lockers, ' +
        'narrow walkway, utility paneling, functional living deck section, no exterior',
      'crew quarters module tier 2, simple dormitory bunks and storage units, ' +
        'ceiling light strips, a seating nook, industrial living-space floor section',
    ],
  },
  {
    name: 'habitat_t3',
    indoor: true,
    variants: [
      'tier 3 crew habitat module, improved living quarters with private sleeping pods, ' +
        'a lounge couch, a kitchenette, plants and warmer lighting, interior cabin floor section',
      'comfortable habitation module interior, individual cabin units, a common lounge area, ' +
        'soft seating, wall screens, decorative paneling, upscale living deck section, no exterior',
      'crew quarters module tier 3, partitioned private rooms, a shared social space with table and seats, ' +
        'ambient lighting, refined interior living floor section',
    ],
  },
  {
    name: 'housing_factory',
    indoor: true,
    variants: [
      'prefab housing factory module, an assembly line producing modular living-pod units, ' +
        'robotic cranes lifting wall panels, partly built habitat modules on rails, factory floor section',
      'housing production module, fabrication line building prefabricated room cubes, ' +
        'gantry crane, stacks of wall panels, robotic arms, industrial manufacturing deck section',
      'modular home factory module, conveyor with half-assembled living pods, ' +
        'overhead crane moving a finished module, parts racks, factory floor machinery section',
    ],
  },
  {
    name: 'trade_module',
    indoor: true,
    variants: [
      'interior trade and market module, a goods exchange floor with stacked cargo crates and pallets, ' +
        'a trading counter with holographic price boards, freight scanners, warehouse floor section',
      'commerce trade module, a market hall section with shelving of trade goods, ' +
        'a transaction terminal, crates on a loading area, glowing market display screens, interior deck',
      'trading post module interior, cargo containers, a merchant counter with screens, ' +
        'sorting conveyor, price holograms, busy commerce floor section, no exterior building',
    ],
  },
  {
    name: 'vehicle_factory',
    indoor: true,
    variants: [
      'vehicle factory module, an assembly line building rovers and ground vehicles, ' +
        'a partly assembled wheeled vehicle on the line, robotic arms, tool gantries, factory floor section',
      'ground vehicle manufacturing module, fabrication bay with a chassis on a lift, ' +
        'robotic welders, racks of wheels and parts, overhead crane, industrial deck section',
      'rover assembly module, a vehicle frame under construction with mounted wheels, ' +
        'assembly robots, parts conveyors, control panels, factory floor machinery section',
    ],
  },
  // ── EXTERIOR ─────────────────────────────────────────────────────────────
  {
    name: 'solar_panel',
    indoor: false,
    variants: [
      'solar power array module, a tilted photovoltaic panel array on a steel support frame, ' +
        'dark blue glossy solar cells with grid lines, junction box and cabling, free-standing unit',
      'photovoltaic panel module, angled array of dark silicon solar panels on a braced mount, ' +
        'reflective cell surface, wiring conduit, weathered metal frame, single isolated object',
      'solar collector module, a rectangular tilted solar panel field on a tracking mount, ' +
        'deep-blue cells, support struts, power cabling, compact ground unit',
    ],
  },
  {
    name: 'wind_turbine',
    indoor: false,
    variants: [
      'futuristic sci-fi vertical-axis wind turbine module, sleek curved vertical helical turbine blades ' +
        'around a central column, glowing energy ring, dark metal base, advanced clean-energy generator, ' +
        'NOT a conventional three-blade windmill',
      'advanced sci-fi wind energy module, a bladeless toroidal wind harvester ring on a pylon, ' +
        'subtle blue energy glow, futuristic dark alloy housing, compact free-standing power unit, ' +
        'NOT a traditional propeller windmill',
      'high-tech vertical wind turbine module, vertical twisting turbine fins on a sturdy column, ' +
        'glowing power coupling at the base, sci-fi industrial design, isolated energy generator, ' +
        'NOT a classic horizontal-axis wind turbine',
    ],
  },
  {
    name: 'geothermal_plant',
    indoor: false,
    variants: [
      'geothermal power plant module, a wellhead with thick insulated steam pipes rising into a turbine housing, ' +
        'cooling stacks venting faint steam, pressure valves, dark industrial metal, free-standing unit',
      'geothermal energy module, a borehole rig with steam separators and curved pipework into a generator block, ' +
        'venting vapor, gauges, weathered steel, compact isolated power station',
      'geothermal plant module, clustered steam pipes and a turbine generator over a drilled wellhead, ' +
        'cooling tower, control cabinet, rust and grime, single free-standing object',
    ],
  },
  {
    name: 'chemical_thruster',
    indoor: false,
    variants: [
      'spacecraft chemical rocket thruster module, a large bell-shaped rocket engine nozzle with cooling channels, ' +
        'turbopump and fuel lines, mounting gimbal, scorched metal nozzle, free-standing engine, matches sci-fi ship drives',
      'chemical rocket engine module, conical thruster bell with regenerative cooling ribs, ' +
        'propellant feed pipes, combustion chamber, gimbal mount, weathered alloy, isolated spacecraft engine',
      'rocket thruster module, a heavy chemical engine nozzle with exhaust scorching, ' +
        'fuel turbopump assembly, plumbing, structural mount bracket, single sci-fi propulsion object',
    ],
  },
  {
    name: 'wheel',
    indoor: false,
    variants: [
      'wheel drive module, a single large heavy-duty off-road vehicle wheel with chunky treaded tire, ' +
        'metal hub with bolts, suspension arm and drive motor housing, worn black rubber and dark gunmetal steel, ' +
        'ground vehicle running gear, matches heavy_wheel and tracks style',
      'vehicle wheel module, one rugged treaded tire on a reinforced rim, axle hub, ' +
        'shock absorber strut, electric drive motor pod, mud and grime, dark steel and black rubber, isolated running gear',
      'rover wheel drive unit module, a single deep-tread wheel with a metal rim and central hub, ' +
        'suspension torsion arm, sealed motor, worn rubber, gunmetal steel, ground propulsion part',
    ],
  },
  {
    name: 'colony_module',
    indoor: false,
    variants: [
      'spacecraft colony module, a cylindrical habitation pod section of a colony ship, ' +
        'docking ring at one end, hull plating with portholes, antennae and radiators, dark metal, free-standing ship module',
      'colony ship module, a detachable cylindrical living section with a docking collar, ' +
        'ribbed hull armor, small windows, mounting struts, weathered alloy, isolated spacecraft component',
      'colonist transport module, a capsule-shaped spacecraft section with a hatch and docking port, ' +
        'external piping and panels, hull plating, antennae, single free-standing sci-fi ship module',
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
