/**
 * Regenerate the 23 module sprites Rudi deleted after review.
 *
 * Mirrors scripts/regenerate-37-modules.ts exactly (the proven flow):
 * flux/dev 512x512 PNG -> birefnet/v2 bg removal -> tight crop ->
 * pad to centered 1:1 square -> assets/final/<name>_0.png.
 *
 * Canonical style (per Rudi, NOT to be changed): navy-blue painted steel with
 * yellow safety stripes, weathered metal surfaces, isometric 2.5D, lit from
 * upper left, no background.
 *
 * IMPORTANT: most of these are repeat offenders that Rudi rejected in the last
 * 1-2 runs. The prompt bodies here are DELIBERATELY different compositions from
 * the standard regenerate-37 defs — varied machine layouts / room arrangements,
 * not a 1:1 repeat. wind_turbine forces a visible rotor+blades; ship_yard uses a
 * fresh "yard platform with partial ship skeleton" composition.
 *
 * INDOOR modules get a mandatory factory-section suffix (no standalone building, no roof).
 * EXTERIOR modules are free-standing objects.
 *
 * Usage:
 *   npx tsx scripts/regenerate-23-modules.ts --asset assembler [--variant 1]
 *   npx tsx scripts/regenerate-23-modules.ts --list
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
  variants: string[]; // up to 3 prompt bodies — deliberately varied compositions
}

const ASSET_DEFS: AssetDef[] = [
  // ── INDOOR ──────────────────────────────────────────────────────────────
  {
    name: 'assembler',
    indoor: true,
    variants: [
      // varied: single big central rotary cell instead of a long conveyor line
      'robotic assembly cell, one large rotary fixture table at the centre surrounded by three articulated yellow robot arms, ' +
        'tool changers on a side rack, a compact parts buffer, glowing status pillars',
      'automated assembler bay, an overhead gantry robot lowering a part onto a jig, side conveyors feeding small components, ' +
        'control desk with screens, cable trunking along the deck',
      'manufacturing assembler section, paired robotic arms working a shared workbench, a vertical parts carousel, ' +
        'pneumatic lines, blinking diagnostic panels',
    ],
  },
  {
    name: 'big_pump',
    indoor: true,
    variants: [
      // varied: vertical inline pump tower instead of horizontal skid
      'large vertical inline industrial pump, a tall pump column with a top-mounted electric motor, big flanged inlet and outlet pipes ' +
        'curving down to the deck, pressure gauges and valve wheels, mounted on a heavy steel base frame',
      'heavy duplex pump station, two large pump bodies side by side sharing a thick manifold header, pressure dials, ' +
        'isolation valves, riveted dark steel housing on a skid',
      'oversized centrifugal pump module, a single massive volute casing with a long drive shaft and motor, bolted suction and discharge ' +
        'nozzles, gauge cluster, support feet',
    ],
  },
  {
    name: 'cattle_farm',
    indoor: true,
    variants: [
      'livestock husbandry section, rows of clean metal cattle pens with railings, automated feeding troughs and water lines, ' +
        'a few stylised cattle standing in the stalls, hay bales, overhead light strips, agricultural deck section',
      'indoor cattle ranch section, fenced animal stalls in two rows with a central walkway, automated feed dispensers, ' +
        'straw bedding, livestock in the pens, utilitarian farm interior',
      'cattle farming module, sturdy steel-railed pens holding cattle, a feed silo with conveyor troughs, water tanks, ' +
        'muck channels, hay storage, working livestock section',
    ],
  },
  {
    name: 'electronics_lab',
    indoor: true,
    variants: [
      // varied: central probe-station island vs row of benches
      'electronics R&D lab section, a central probe-station island with a microscope and oscilloscope, surrounded by component bins ' +
        'and breadboards, signal analysers on a side rack, glowing test rigs',
      'electronics laboratory module, an L-shaped bench with soldering stations and PCB prototypes, a wall of measurement instruments, ' +
        'cable spools, diagnostic screens',
      'electronics test lab section, an anechoic test booth beside a workbench with probes and analysers, parts drawers, ' +
        'monitor stacks showing waveforms',
    ],
  },
  {
    name: 'engineering_lab',
    indoor: true,
    variants: [
      'engineering laboratory section, mechanical test rigs and a stress-test press, a CAD workstation with large holographic 3D model, ' +
        'tool racks, partly disassembled machinery on a bench, measurement jigs, engineering deck section',
      'mechanical engineering lab module, a structural load-test frame, robotic arm prototype on a stand, blueprints on screens, ' +
        'calibration instruments, parts trolleys',
      'engineering R&D section, a workbench with a half-built mechanism, a 3D printer and a milling jig, holographic schematic display, ' +
        'tool boards, prototype components',
    ],
  },
  {
    name: 'experience_arena',
    indoor: true,
    variants: [
      'immersive VR experience arena section, a circular open play floor ringed by glowing tracking pylons, players in VR rigs, ' +
        'a holographic dome projection overhead, neon accent lighting, tiered spectator benches, leisure deck section',
      'futuristic entertainment arena module, a central holographic combat ring with energy floor markings, VR pods around the edge, ' +
        'large score screens, dramatic coloured lighting, recreation floor section',
      'VR experience hall section, motion-capture play platforms with glowing boundary rings, suspended sensor arrays, ' +
        'lounge seating clusters, vivid neon ambience',
    ],
  },
  {
    name: 'gallery',
    indoor: true,
    variants: [
      // varied: a central sculpture rotunda vs a plain wall-hung gallery
      'art gallery section, a circular plinth at the centre displaying a lit sculpture, framed artworks on the surrounding partition walls, ' +
        'soft directional spotlights, a viewing bench, polished refined floor',
      'museum gallery module, freestanding glass display cases with artefacts down the middle, paintings on the walls, ' +
        'accent track lighting, minimalist elegant interior',
      'gallery exhibition section, sculptures on staggered pedestals, large framed canvases, gentle spot lighting, ' +
        'a quiet seating nook, refined gallery floor',
    ],
  },
  {
    name: 'greenhouse',
    indoor: true,
    variants: [
      'glazed greenhouse cultivation section, steel-framed glass walls over rows of raised hydroponic plant beds, lush green crops, ' +
        'misting pipes and grow-light strips overhead, irrigation channels, plant-nursery deck section',
      'indoor greenhouse module, tiered planting racks of leafy vegetables under purple-pink LED grow lights, glass-panel framing, ' +
        'water troughs, nutrient tanks, verdant agricultural section',
      'hydroponic greenhouse section, transparent panelled enclosure with dense potted plants and climbing vines on trellises, ' +
        'sprinkler lines, warm grow lighting, steel-and-glass conservatory frame',
    ],
  },
  {
    name: 'luxury_promenade',
    indoor: true,
    variants: [
      // varied: a curved central fountain plaza vs a straight shopping arcade
      'luxury promenade section, a curved boulevard around a central illuminated fountain plaza, boutique storefronts with glowing signage, ' +
        'trees in planters, elegant benches, polished marble-look floor, refined leisure section',
      'upscale promenade module, a two-level shopping arcade with glass balustrades, café terraces, decorative greenery, ' +
        'warm ambient lighting, sophisticated interior',
      'high-end promenade section, an indoor avenue lined with luxury shop fronts and a small park island, ' +
        'ornamental lamps, seating, lush planters, polished floors',
    ],
  },
  {
    name: 'medical_center',
    indoor: true,
    variants: [
      // varied: central surgical theatre vs a row of scan pods
      'advanced medical center section, a central surgical theatre with a robotic surgery arm over an operating table, ' +
        'a holographic patient diagnostic above it, glass partitions, sterile white-and-blue equipment, medical deck section',
      'high-tech medical center module, a row of glowing diagnostic scan pods along one wall, a robotic pharmacy dispenser, ' +
        'monitoring consoles, clean clinical interior',
      'medical center section, paired treatment bays with regeneration pods, an automated nurse station, holographic vitals displays, ' +
        'medical robotic arms, premium sterile equipment',
    ],
  },
  {
    name: 'miniaturization_factory',
    indoor: true,
    variants: [
      'high-tech miniaturization factory section, a sealed glass cleanroom cell with ultra-precise micro-fabrication robotics, ' +
        'tiny components under inspection microscopes, glowing nanofabrication chambers, blue laser etching beams, dense control panels, ' +
        'advanced precision manufacturing deck section',
      'precision nanofabrication module, a vacuum micro-assembly chamber with delicate articulated micro-manipulators, ' +
        'wafer handling robots, holographic magnified view screens, immaculate cleanroom interior',
      'miniaturization workshop section, a row of sealed precision-fab pods with glowing interiors, micro-component trays, ' +
        'laser micromachining heads, calibration instruments, hightech clean deck section',
    ],
  },
  {
    name: 'physics_lab',
    indoor: true,
    variants: [
      // varied: central spherical reaction chamber vs accelerator ring segment
      'physics laboratory section, a large central spherical experiment chamber with a glowing blue core and radial cabling, ' +
        'instrument towers around it, monitoring consoles with waveforms, dense technical deck section',
      'experimental physics module, a vacuum chamber flanked by tall electromagnet coils, sensor arrays on gantries, ' +
        'control desks, faint blue energy glow, research interior',
      'physics research lab section, a particle-beam test bench with a target chamber, diagnostic racks, data screens, ' +
        'shielding panels, cabling bundles',
    ],
  },
  {
    name: 'refinery',
    indoor: true,
    variants: [
      // varied: vertical pour-and-mould line vs a single furnace
      'ore refinery section, a tilting smelting ladle pouring glowing molten metal into ingot moulds on a conveyor, ' +
        'a furnace with orange glow behind, cooling pipes, slag chute, exhaust ducting, heavy grimy machinery deck section',
      'metal refinery module, a tall electric arc furnace with a charging hopper, glowing tap hole, ladle car, ' +
        'thick water-cooled cabling, gantry crane, exposed plant equipment',
      'refinery processing section, stacked electrolysis cells with busbars beside a melting furnace, piping, pumps, ' +
        'molten-metal glow, soot-stained steel',
    ],
  },
  {
    name: 'sanitation_station',
    indoor: true,
    variants: [
      // varied: clarifier basin layout vs stacked filter columns
      'sanitation processing section, a circular water-clarifier basin with a rotating skimmer arm, surrounding filtration tanks ' +
        'and pumps, valve manifolds, control gauges, utilitarian grimy plant deck section',
      'water recycling module, banks of tall cylindrical filtration columns with interconnecting pipework, recirculation pumps, ' +
        'monitoring panel, hazard striping, treatment machinery section',
      'sanitation station section, settling tanks and membrane filter units, ducting, valve wheels, sludge pumps, ' +
        'exposed waste-treatment plant equipment',
    ],
  },
  {
    name: 'university',
    indoor: true,
    variants: [
      'grand university lecture section, a large tiered amphitheatre lecture hall with curved rows of seating facing a wide ' +
        'interactive display wall and a lecturer dais, holographic charts, refined panelling and warm lighting, prestigious education deck section',
      'university teaching module, a spacious double-height learning atrium with study mezzanines, banks of data terminals, ' +
        'a central holographic globe display, elegant materials, upscale academic interior',
      'university hall section, a broad lecture theatre with tiered desks, large presentation screens, side study alcoves with shelving, ' +
        'sophisticated lighting, gold-trim accents, distinguished learning space',
    ],
  },
  {
    name: 'water_synthesizer',
    indoor: true,
    variants: [
      'water synthesis plant section, a cluster of large cylindrical water tanks linked by thick pipework to a central condenser unit, ' +
        'glowing process indicators, valve manifolds, pumps, droplet condensation on chilled coils, fluid-processing deck section',
      'atmospheric water synthesizer module, tall gas-to-water reactor columns feeding a row of storage tanks, ' +
        'spiral cooling pipes, pressure gauges, control panel, exposed plumbing machinery section',
      'water generation section, a domed reaction vessel with intake ducts and outlet pipes filling buffer tanks, ' +
        'pumps and valves, glowing readouts, condensation, industrial fluid plant section',
    ],
  },

  // ── EXTERIOR ────────────────────────────────────────────────────────────
  {
    name: 'ship_yard',
    indoor: false,
    variants: [
      // NEW composition: open yard platform with a partial ship skeleton in cradle, not a fuselage in a portal
      'spacecraft construction yard platform, a partly-built starship skeleton of exposed ribs and spine resting in open steel ' +
        'support cradles, tall gantry cranes and scaffolding towers alongside, work lifts and welding rigs, The Expanse hard sci-fi style, ' +
        'free-standing industrial structure, no boats, no yachts, no water, no maritime vessels, no sea',
      'open starship building slip, a bare spacecraft frame held in tiered keel blocks and side cradles, surrounded by access ' +
        'scaffolding, jib cranes and cabling, crew work platforms, hard sci-fi The Expanse aesthetic, isolated yard structure, ' +
        'no boats, no yachts, no water, no sea, no maritime',
      'spacecraft shipyard module, a half-assembled hull section in a girder cradle with overhead gantry crane and surrounding ' +
        'scaffold towers, sparks from welding, exposed ship ribs, hard sci-fi industrial, single free-standing object, ' +
        'no boats, no yachts, no water, no maritime vessels',
    ],
  },
  {
    name: 'wind_turbine',
    indoor: false,
    variants: [
      // RULE: rotor + blades MUST be clearly visible and prominent
      'futuristic wind turbine with a large prominent three-blade horizontal-axis rotor clearly visible at the top of a tapered tower, ' +
        'long sleek blades, a streamlined nacelle, subtle glowing power ring at the base, dark alloy and navy-blue steel, ' +
        'clean-energy generator, the rotor and blades are the main feature, not just a tower, no plain pillar, no antenna mast, no smokestack',
      'advanced wind turbine, a giant vertical helical Darrieus rotor with three twisting curved blades wrapping a central column, ' +
        'the helix rotor is the dominant prominent element, glowing energy hub at the base, weathered navy steel, ' +
        'futuristic clean power unit, clearly a bladed turbine, not just a tower, no plain pillar, no antenna mast, no smokestack',
      'sci-fi wind generator, a tall mast topped by a large clearly visible multi-blade rotor turning in the wind, prominent long blades, ' +
        'nacelle housing, faint blue energy glow, dark metal and yellow safety stripes, the rotor with blades is unmistakable, ' +
        'not just a tower, no plain pillar, no antenna mast, no smokestack',
    ],
  },
  {
    name: 'geothermal_plant',
    indoor: false,
    variants: [
      'geothermal power plant, a capped wellhead with thick insulated steam pipes curving up into a turbine generator housing, ' +
        'a cooling stack venting faint steam, pressure valves and gauges, navy-blue steel with yellow stripes, free-standing power unit',
      'geothermal energy module, a borehole rig with twin steam separators feeding curved pipework into a generator block, ' +
        'venting vapour, control cabinet, weathered metal, compact isolated power station',
      'geothermal plant module, clustered insulated steam pipes and a turbine over a drilled wellhead, a small cooling tower, ' +
        'valve wheels, gauges, single free-standing object',
    ],
  },
  {
    name: 'rtg',
    indoor: false,
    variants: [
      'radioisotope thermoelectric generator, a stout cylindrical RTG unit with prominent radial heat-dissipation fins running its length, ' +
        'a central sealed radioactive core housing, yellow-and-black radiation trefoil markings, sturdy bolted base, compact free-standing power unit',
      'RTG nuclear battery module, a finned cylindrical generator standing upright with stacked radiator vanes, a glowing core port, ' +
        'hazard striping, navy steel and warning labels, isolated compact unit',
      'radioisotope generator, a ribbed heat-fin barrel on a tripod base, sealed core canister, faint warm glow, ' +
        'radiation trefoil markings, single compact object',
    ],
  },
  {
    name: 'heavy_wheel',
    indoor: false,
    variants: [
      // match wheel_0 / tracks_0: weathered black rubber + gunmetal hub, yellow label
      'heavy vehicle drive module, a single massive heavy-duty off-road wheel with chunky deep-tread black rubber tyre, ' +
        'a riveted dark gunmetal steel hub block bearing a worn yellow warning label, drive-motor housing and a suspension arm, ' +
        'mud and grime, ground-vehicle running gear, matching the wheel and tracks asset style',
      'heavy wheel drive unit, one oversized treaded tyre on a reinforced steel rim, a heavy bolted axle hub with an electric drive-motor pod, ' +
        'worn black rubber and weathered gunmetal, yellow hazard label, isolated running gear',
      'heavy-duty rover wheel module, a single large deep-tread wheel with a boxy steel hub housing, a suspension strut and sealed motor, ' +
        'yellow warning sticker, scuffed rubber, weathered gunmetal steel, ground propulsion part',
    ],
  },
  {
    name: 'loading_dock',
    indoor: false,
    variants: [
      'loading dock module, a freight bay at the edge of a facility facade with a large roll-up cargo door and a fold-down loading ramp, ' +
        'yellow safety striping on the ramp edges, dock bumper guards, a control panel, weathered navy steel, free-standing dock section',
      'cargo loading dock, an industrial dock gate with an extended ramp and a raised lift platform, dock bumpers and bollards, ' +
        'hazard stripes, a small control booth, structure-edge facade section',
      'loading dock module, a wide bay door with a sloped truck ramp and yellow guide markings, a dock leveller, ' +
        'bollards and a railing, weathered facade edge, free-standing dock',
    ],
  },
  {
    name: 'dock_large',
    indoor: false,
    variants: [
      // distinctly LARGER / more massive than loading_dock — a ship docking bay
      'large spacecraft docking bay, a massive cavernous open dock structure with a huge clamshell bay door, extending docking arms ' +
        'and gantry walkways, heavy clamp arms to grip a ship, bright bay floodlights, towering navy-blue steel walls with yellow ' +
        'hazard chevrons, monumental free-standing dock, much bigger and more massive than a small loading dock',
      'big ship dock module, an enormous berth with a wide open mouth, telescoping boarding gantries, fuelling booms and crane arms, ' +
        'illuminated approach guide lights, reinforced colossal steel framing with yellow striping, imposing free-standing docking structure',
      'large vessel docking bay, a grand hangar-scale dock with retractable doors, multiple docking clamps and service gantries, ' +
        'floodlit interior, vast navy steel hull with hazard markings, monumental isolated dock structure, clearly oversized',
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
