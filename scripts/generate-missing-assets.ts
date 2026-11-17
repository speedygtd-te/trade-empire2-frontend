/**
 * Generate missing module + hull platform assets via fal.ai.
 * Generates image, removes background, trims + pads to 1:1.
 *
 * Usage: npx ts-node scripts/generate-missing-assets.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import sharp from 'sharp';

const FAL_API_KEY = fs.readFileSync(path.join(__dirname, '../.env'), 'utf-8')
  .split('\n').find((l) => l.startsWith('FAL_API_KEY='))?.replace('FAL_API_KEY=', '').trim() ?? '';

const MODULES_DIR = path.resolve(__dirname, '../../Frontend/src/assets/modules');
const HULLS_DIR = path.resolve(__dirname, '../../Frontend/src/assets/hulls');

const BASE_STYLE = 'isometric game asset, single 3D building module, 30 degree camera angle from horizontal, 2:1 isometric perspective, The Expanse sci-fi aesthetic, photorealistic textures, realistic worn and dirty metal surfaces, rust stains, oil residue, scratched paint, grime buildup, used industrial equipment, transparent background, game sprite, centered, single object, no ground plane, no shadow, no walls, no enclosure, open machinery';

const HULL_STYLE = 'isometric game asset, single 3D building module, 30 degree camera angle from horizontal, 2:1 isometric perspective, The Expanse sci-fi aesthetic, realism, transparent background, game sprite, centered, single object, no ground plane, no shadow';

interface AssetDef {
  name: string;
  dir: string;
  outputDir: string;
  prompt: string;
}

const ASSETS: AssetDef[] = [
  // --- MODULES ---
  { name: 'ELECTRONICS_FACTORY', dir: 'electronics_factory', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, electronics manufacturing facility, clean room with glass panels, circuit board printing press, robotic pick-and-place machines, microscope inspection station, anti-static mats, blue LED clean room lighting, white and blue color scheme with dust-free surfaces` },
  { name: 'SOLAR_PANEL', dir: 'solar_panel', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, deployable solar panel array, large angled photovoltaic panels with blue-black crystalline surface, adjustable mounting brackets, sun-tracking servos, power junction box with cables, weathered aluminum frame, some panels cracked and dusty` },
  { name: 'FUSION_REACTOR', dir: 'fusion_reactor', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, compact fusion reactor module, large toroidal containment vessel with glowing blue plasma visible through viewport, heavy magnetic coils, cooling pipes with frost, radiation warning symbols, massive power conduits, dark steel and glowing blue, very heavy industrial` },
  { name: 'GEOTHERMAL_PLANT', dir: 'geothermal_plant', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, geothermal power plant module, deep bore pipe going into ground, steam turbine with exhaust vents, heat exchangers with copper piping, condensation dripping, mineral deposits on pipes, weathered steel with rust and mineral stains` },
  { name: 'RTG', dir: 'rtg', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, radioisotope thermoelectric generator, small compact cylindrical unit with radiation fins, heavy lead shielding, radiation warning trefoil symbol, thick power cables, red warning lights, dark gray with yellow hazard markings, compact and dense` },
  { name: 'WIND_TURBINE', dir: 'wind_turbine', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, industrial wind turbine module, vertical axis wind turbine with curved blades, generator housing, guy wires, anemometer on top, weathered white paint peeling, rust at bolt joints, power cable running down` },
  { name: 'TIDAL_GENERATOR', dir: 'tidal_generator', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, underwater tidal power generator, horizontal turbine with barnacle-covered blades, waterproof sealed housing, anchor chains, bioluminescent algae growing on frame, corroded green-tinted metal, underwater cables, teal and dark green color scheme` },
  { name: 'BASIC_STORAGE', dir: 'basic_storage', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, basic storage container module, stack of industrial cargo containers, heavy duty shelving racks with crates, forklift-accessible pallets, inventory labels, dented metal walls, gray and orange industrial color scheme` },
  { name: 'LARGE_STORAGE', dir: 'large_storage', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, large warehouse storage module, massive reinforced storage silo with automated retrieval system, conveyor belt loading dock, heavy blast doors, industrial crane arm, much larger than basic storage, gray steel with yellow caution stripes` },
  { name: 'HABITAT', dir: 'habitat', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, crew habitat living quarters module, bunk beds visible through windows, life support ventilation ducts, warm interior lighting, personal lockers, small kitchenette, lived-in appearance with personal items, beige and warm gray interior tones` },
  { name: 'LIFE_SUPPORT', dir: 'life_support', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, life support system module, large air recycler with HEPA filters, water purification tanks, oxygen generator electrolysis unit, CO2 scrubber canisters, status indicator lights green, medical white and clinical blue color scheme` },
  { name: 'RESEARCH_LAB', dir: 'research_lab', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, general research laboratory module, lab benches with microscopes and test tubes, computer terminals with data displays, whiteboard with equations, sample storage refrigerator, clean but cluttered workspace, white and stainless steel` },
  { name: 'PHYSICS_LAB', dir: 'physics_lab', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, physics research laboratory, particle accelerator ring segment, laser optics table, oscilloscope and wave generators, magnetic field coils, plasma containment experiment, purple and blue glow from experiments, dark lab with instrument lighting` },
  { name: 'CHEMISTRY_LAB', dir: 'chemistry_lab', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, chemistry research laboratory, fume hoods with glassware, distillation columns, bubbling colorful liquids in flasks, periodic table poster, chemical storage cabinet with hazard labels, green and amber liquid tones` },
  { name: 'BIOLOGY_LAB', dir: 'biology_lab', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, biology research laboratory, growth chambers with plants under UV lights, DNA sequencer, petri dishes, bioreactor vessel with green culture medium, sterile workspace, green bio-luminescent accent lighting` },
  { name: 'ELECTRONICS_LAB', dir: 'electronics_lab', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, electronics research laboratory, workbench with soldering station, circuit boards under magnification, signal analyzers with waveform displays, component bins, wire spools, blue LED task lighting, organized chaos of prototypes` },
  { name: 'ENGINEERING_LAB', dir: 'engineering_lab', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, engineering research laboratory, 3D printer prototyping machine, CAD terminal with structural models, material testing press, tensile strength machine, metal sample racks, blueprint pinned to wall, industrial gray and orange` },
  { name: 'PLANETOLOGY_LAB', dir: 'planetology_lab', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, planetology research laboratory, geological sample display cases with rock cores, seismograph, terrain mapping hologram table, mineral analysis spectrometer, soil samples in labeled jars, earth tones brown and tan` },
  { name: 'WHEEL', dir: 'wheel', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, vehicle wheel drive module, large heavy-duty all-terrain wheel with chunky treads, electric motor housing, suspension spring and shock absorber, axle mount bracket, mud-caked rubber, dark steel and black rubber` },
  { name: 'HEAVY_WHEEL', dir: 'heavy_wheel', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, heavy duty vehicle wheel module, massive reinforced wheel twice the size of normal, tank-like treads, dual motor housing, heavy suspension with hydraulic dampeners, armored hub cap, industrial yellow and black` },
  { name: 'LOADING_DOCK', dir: 'loading_dock', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, vehicle loading dock module, hydraulic lift platform, cargo crane arm, guide rails for vehicle approach, heavy duty bumpers, flashing amber warning lights, oil-stained concrete pad, industrial gray and yellow safety markings` },
  { name: 'CHEMICAL_THRUSTER', dir: 'chemical_thruster', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, chemical rocket thruster module, bell-shaped rocket nozzle with heat-scorched interior, fuel injector ring, propellant feed lines, gimbal mount for thrust vectoring, heat-blackened exhaust cone, silver and charred black` },
  { name: 'ION_DRIVE', dir: 'ion_drive', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, ion drive propulsion module, circular gridded ion accelerator with blue glow, xenon gas feed system, high voltage power supply, electromagnetic coils, sleek futuristic design, silver and electric blue glow` },
  { name: 'EPSTEIN_DRIVE', dir: 'epstein_drive', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, Epstein fusion drive module, large cylindrical drive housing, magnetic nozzle with intense blue-white exhaust glow, massive radiator panels, heavy structural mounting frame, the most advanced and largest drive, dark titanium with intense blue-white glow` },
  { name: 'SHIP_YARD', dir: 'ship_yard', outputDir: MODULES_DIR,
    prompt: `${BASE_STYLE}, ship construction yard module, large gantry crane framework, hull welding stations with sparks, scaffolding around partially assembled ship frame, heavy tool racks, overhead crane rails, very large industrial complex, dark steel with welding sparks orange glow` },

  // --- HULL PLATFORMS ---
  { name: 'PLATFORM_OUTDOOR', dir: 'platform_outdoor', outputDir: HULLS_DIR,
    prompt: `${HULL_STYLE}, outdoor platform module, flat open-air metal grating platform with railings, exposed to elements, landing pad style, antenna mounts, weathered non-slip surface with drain holes, simple sturdy construction, gunmetal gray with rust and weather wear` },
  { name: 'PLATFORM_UNDERWATER', dir: 'platform_underwater', outputDir: HULLS_DIR,
    prompt: `${HULL_STYLE}, underwater platform module, sealed pressurized base platform, ballast tanks on sides, barnacle-covered anchor points, waterproof cable conduits, anti-corrosion coating peeling, green-tinted corroded metal, diving bell style construction, teal and dark green` },
];

// --- fal.ai helpers ---

function httpsRequest(options: https.RequestOptions, body?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c: string) => { data += c; });
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
  const submitRaw = await httpsRequest({
    hostname: 'queue.fal.run', path: '/fal-ai/flux/dev', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${FAL_API_KEY}` },
  }, JSON.stringify({
    prompt, image_size: { width: 512, height: 512 },
    num_inference_steps: 28, guidance_scale: 7.5, num_images: 1,
    enable_safety_checker: false, output_format: 'png',
  }));
  const submit = JSON.parse(submitRaw);

  for (let i = 0; i < 120; i++) {
    await sleep(2000);
    const status = JSON.parse(await httpsGet(submit.status_url, { 'Authorization': `Key ${FAL_API_KEY}` }));
    if (status.status === 'COMPLETED') {
      const result = JSON.parse(await httpsGet(submit.response_url, { 'Authorization': `Key ${FAL_API_KEY}` }));
      return downloadBuffer(result.images[0].url as string);
    }
    if (status.status === 'FAILED') throw new Error('Generation failed');
    process.stdout.write('.');
  }
  throw new Error('Timeout');
}

async function uploadToFal(buf: Buffer, name: string): Promise<string> {
  const initRaw = await httpsRequest({
    hostname: 'rest.alpha.fal.ai', path: '/storage/upload/initiate', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${FAL_API_KEY}` },
  }, JSON.stringify({ content_type: 'image/png', file_name: name }));
  const init = JSON.parse(initRaw);
  const u = new URL(init.upload_url);
  await new Promise<void>((resolve, reject) => {
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'PUT',
      headers: { 'Content-Type': 'image/png', 'Content-Length': buf.length.toString() },
    }, (res) => { res.on('data', () => {}); res.on('end', () => resolve()); });
    req.on('error', reject); req.write(buf); req.end();
  });
  return init.file_url as string;
}

async function removeBackground(imageUrl: string): Promise<Buffer> {
  const raw = await httpsRequest({
    hostname: 'fal.run', path: '/fal-ai/birefnet/v2', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${FAL_API_KEY}` },
  }, JSON.stringify({ image_url: imageUrl }));
  const result = JSON.parse(raw);
  return downloadBuffer(result.image.url as string);
}

async function trimAndPadSquare(inputBuffer: Buffer): Promise<Buffer> {
  const trimmedPng = await sharp(inputBuffer).trim().png().toBuffer();
  const meta = await sharp(trimmedPng).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const size = Math.max(w, h);
  const padLeft = Math.floor((size - w) / 2);
  const padTop = Math.floor((size - h) / 2);
  return sharp(trimmedPng).extend({
    top: padTop, bottom: size - h - padTop,
    left: padLeft, right: size - w - padLeft,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).png().toBuffer();
}

async function downloadBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const dl = (u: string): void => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) { dl(res.headers.location as string); return; }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    };
    dl(url);
  });
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

async function main(): Promise<void> {
  console.log(`Generating ${ASSETS.length} assets via fal.ai\n`);

  for (const asset of ASSETS) {
    const outDir = path.join(asset.outputDir, asset.dir);
    const outFile = path.join(outDir, `${asset.dir}_0.png`);

    if (fs.existsSync(outFile)) {
      console.log(`skip ${asset.name} — exists`);
      continue;
    }

    fs.mkdirSync(outDir, { recursive: true });

    process.stdout.write(`${asset.name} — generating`);
    const rawBuf = await generateImage(asset.prompt);
    console.log(' done');

    process.stdout.write('  bg removal');
    const falUrl = await uploadToFal(rawBuf, `${asset.dir}.png`);
    const noBgBuf = await removeBackground(falUrl);
    console.log(' done');

    process.stdout.write('  trim+pad');
    const finalBuf = await trimAndPadSquare(noBgBuf);
    fs.writeFileSync(outFile, finalBuf);
    console.log(` done — ${outFile}\n`);
  }

  console.log('All done!');
}

main().catch((e) => { console.error('Failed:', e); process.exit(1); });
