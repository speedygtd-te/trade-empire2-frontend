/**
 * Generate module assets via fal.ai image generation API.
 *
 * Usage: npx ts-node scripts/generate-module-assets.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FAL_API_KEY = process.env['FAL_API_KEY'] ?? fs.readFileSync(path.join(__dirname, '.env'), 'utf-8')
  .split('\n').find((l) => l.startsWith('FAL_API_KEY='))?.replace('FAL_API_KEY=', '').trim() ?? '';

if (!FAL_API_KEY) {
  console.error('FAL_API_KEY not found');
  process.exit(1);
}

const OUTPUT_DIR = path.resolve(__dirname, '../src/assets/modules');

const BASE_STYLE = 'isometric game asset, single 3D building module, 30 degree camera angle from horizontal, 2:1 isometric perspective, The Expanse sci-fi aesthetic, realism, transparent background, game sprite, centered, single object, no ground plane, no shadow, no walls, no enclosure, open machinery';

interface ModulePrompt {
  name: string;
  dir: string;
  prompt: string;
}

const MODULES: ModulePrompt[] = [
  {
    name: 'MINE',
    dir: 'mine',
    prompt: `${BASE_STYLE}, mining drill rig module, heavy rotating drill head pointing downward into the ground, ore conveyor belt, rock crusher mechanism, pile of raw ore chunks, rugged steel frame, yellow warning lights, dark gray and yellow hazard stripes`,
  },
  {
    name: 'PUMP',
    dir: 'pump',
    prompt: `${BASE_STYLE}, liquid extraction pump module, large cylindrical pump with industrial pipes, fluid tanks with glass viewing windows showing blue liquid, pressure gauges, connected hoses and valves, teal and silver metallic finish`,
  },
  {
    name: 'COLLECTOR',
    dir: 'collector',
    prompt: `${BASE_STYLE}, atmospheric gas collector module, large funnel-shaped intake on top, spinning turbine fan visible, condensation coils, pressurized gas canisters connected by tubes, glowing cyan vents, light gray and blue accent color scheme`,
  },
  {
    name: 'DEEP_DRILL',
    dir: 'deep_drill',
    prompt: `${BASE_STYLE}, deep core drilling module, massive vertical drill assembly, heavy reinforced frame with structural bracing, diamond-tipped drill bit, cooling system with radiator fins, seismic sensor array, dark steel with orange accent lights, heavy duty industrial`,
  },
  {
    name: 'SMELTER',
    dir: 'smelter',
    prompt: `${BASE_STYLE}, ore smelting furnace module, open-top blast furnace with glowing molten metal visible inside, orange ember glow, ingot casting molds, slag channel, heat radiator panels on sides, dark iron with glowing orange interior`,
  },
  {
    name: 'REFINERY',
    dir: 'refinery',
    prompt: `${BASE_STYLE}, chemical refinery module, distillation columns of varying height, connected pipes and valves, small cylindrical storage tanks, pressure relief valves, clean stainless steel look, silver and white with blue accent pipes`,
  },
  {
    name: 'CHEMICAL_PLANT',
    dir: 'chemical_plant',
    prompt: `${BASE_STYLE}, chemical processing plant module, reaction vessels with bubbling green liquid visible through glass, mixing arms, centrifuge unit, hazard warning stripes, connected tubes and hoses, green tinted glass and dark gray metal`,
  },
  {
    name: 'ASSEMBLER',
    dir: 'assembler',
    prompt: `${BASE_STYLE}, robotic assembly module, articulated robot arms with precision tools, component trays with small electronic parts, workbench surface, spot welding sparks, circuit boards being assembled, blue LED indicators, gunmetal and blue color scheme`,
  },
  {
    name: 'FACTORY',
    dir: 'factory',
    prompt: `${BASE_STYLE}, heavy manufacturing factory module, large hydraulic press machine, conveyor belt with metal plates, stamping mechanism, heavy-duty robotic arm, finished hull plates on output tray, industrial yellow hazard markings, dark steel, largest and most complex module`,
  },
  {
    name: 'STAIRCASE_BOTTOM',
    dir: 'staircase_bottom',
    prompt: `${BASE_STYLE}, lower staircase module viewed from above in isometric perspective, metal industrial staircase going upward through a ceiling hatch opening, steel handrails, grated metal steps with anti-slip treading, the stairs ascend and disappear through a rectangular opening in the ceiling, overhead lighting, dark gunmetal gray with safety yellow handrail stripes`,
  },
  {
    name: 'STAIRCASE_TOP',
    dir: 'staircase_top',
    prompt: `${BASE_STYLE}, upper staircase module viewed from above in isometric perspective, metal industrial staircase emerging from a floor hatch opening, steel handrails, grated metal steps with anti-slip treading, the stairs come up from a rectangular opening in the floor, floor-level railing around the opening, dark gunmetal gray with safety yellow handrail stripes`,
  },
  {
    name: 'ELEVATOR_BOTTOM',
    dir: 'elevator_bottom',
    prompt: `${BASE_STYLE}, lower elevator shaft module viewed from above in isometric perspective, industrial cargo elevator platform at ground level, heavy duty hydraulic pistons and guide rails going upward, open elevator cage with metal mesh walls, control panel with buttons, the shaft extends upward through a ceiling opening, dark steel with orange warning lights`,
  },
  {
    name: 'ELEVATOR_TOP',
    dir: 'elevator_top',
    prompt: `${BASE_STYLE}, upper elevator shaft module viewed from above in isometric perspective, industrial cargo elevator arriving at top level, heavy duty hydraulic mechanism and pulley system on top, open elevator cage with metal mesh walls, the shaft comes from a floor opening below, motor housing and cable drum visible, dark steel with orange warning lights`,
  },
  {
    name: 'ATMOSPHERIC_PROCESSOR',
    dir: 'atmospheric_processor',
    prompt: `${BASE_STYLE}, atmospheric processing unit module, large intake vents with spinning fan blades on top, gas separation columns, condensation coils and heat exchangers, exhaust vents with visible vapor, weather-resistant outdoor housing, brushed aluminum and teal accent panels`,
  },
  {
    name: 'WATER_SYNTHESIZER',
    dir: 'water_synthesizer',
    prompt: `${BASE_STYLE}, water synthesis reactor module, chemical reaction chamber with transparent viewing ports showing water condensation, hydrogen and oxygen input manifolds, water collection basin, distillation column, clean white and blue laboratory-grade equipment, condensation droplets visible`,
  },
  {
    name: 'GREENHOUSE',
    dir: 'greenhouse',
    prompt: `${BASE_STYLE}, greenhouse module, transparent dome structure with green plants visible inside, metal frame supports, glass panels, grow lights, dark hull material base`,
  },
  {
    name: 'BOTANICAL_GARDEN',
    dir: 'botanical_garden',
    prompt: `${BASE_STYLE}, botanical garden module, lush vegetation dome with trees and flowers visible through glass, observation deck on top, biodiversity enclosure, dark hull material base`,
  },
  {
    name: 'DOCK_SMALL',
    dir: 'dock_small',
    prompt: `${BASE_STYLE}, small docking port module, compact airlock with guide lights, docking clamps, magnetic coupling rings, navigation beacon, dark hull material`,
  },
  {
    name: 'DOCK_MEDIUM',
    dir: 'dock_medium',
    prompt: `${BASE_STYLE}, medium docking bay module, wider bay with loading arm, amber guide lights, retractable docking bridge, cargo transfer rails, dark hull material`,
  },
  {
    name: 'DOCK_LARGE',
    dir: 'dock_large',
    prompt: `${BASE_STYLE}, large docking hangar module, spacious hangar bay with multiple guide rails, large sliding doors, heavy duty mooring clamps, flight control antenna, dark hull material`,
  },
  {
    name: 'COLONY_MODULE',
    dir: 'colony_module',
    prompt: `${BASE_STYLE}, colony habitat module, compact habitat with cryogenic pods visible through windows, supplies storage containers, emergency beacon on top, life support vents, dark hull material`,
  },
  {
    name: 'HYDROPONIC_BAY',
    dir: 'hydroponic_bay',
    prompt: `${BASE_STYLE}, hydroponic bay module, stacked growing racks with LED grow lights, nutrient tubes, plants growing in water trays, purple and blue grow light glow, dark hull material`,
  },
  {
    name: 'GREENHOUSE_FARM',
    dir: 'greenhouse_farm',
    prompt: `${BASE_STYLE}, greenhouse farm module, large agricultural dome with crop rows visible, irrigation system pipes, warm interior glow, ventilation fans, dark hull material base`,
  },
  {
    name: 'CATTLE_FARM',
    dir: 'cattle_farm',
    prompt: `${BASE_STYLE}, cattle farm module, enclosed bio-dome with pasture area visible, automated feeding systems, monitoring screens, climate control vents, dark hull material base`,
  },
];

interface SubmitResult {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
}

function httpsGet(url: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers,
    }, (res) => {
      let body = '';
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.end();
  });
}

async function submitRequest(prompt: string): Promise<SubmitResult> {
  const body = JSON.stringify({
    prompt,
    image_size: { width: 512, height: 512 },
    num_inference_steps: 28,
    guidance_scale: 7.5,
    num_images: 1,
    enable_safety_checker: false,
    output_format: 'png',
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'queue.fal.run',
      path: '/fal-ai/flux/dev',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${FAL_API_KEY}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Submit failed (${res.statusCode}): ${data}`));
          return;
        }
        const parsed = JSON.parse(data);
        resolve({
          requestId: parsed.request_id as string,
          statusUrl: parsed.status_url as string,
          responseUrl: parsed.response_url as string,
        });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function pollResult(submit: SubmitResult): Promise<string> {
  const headers = { 'Authorization': `Key ${FAL_API_KEY}` };
  const maxAttempts = 120;

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(2000);

    const data = await httpsGet(submit.statusUrl, headers);
    const parsed = JSON.parse(data);

    if (parsed.status === 'COMPLETED') {
      const result = await httpsGet(submit.responseUrl, headers);
      const resultParsed = JSON.parse(result);
      return resultParsed.images[0].url as string;
    }

    if (parsed.status === 'FAILED') {
      throw new Error(`Generation failed: ${JSON.stringify(parsed)}`);
    }

    process.stdout.write('.');
  }
  throw new Error('Timeout waiting for result');
}

async function downloadImage(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const makeRequest = (targetUrl: string): void => {
      const mod = targetUrl.startsWith('https') ? https : http;
      mod.get(targetUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          makeRequest(res.headers.location as string);
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          fs.writeFileSync(outputPath, Buffer.concat(chunks));
          resolve();
        });
      }).on('error', reject);
    };
    makeRequest(url);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  console.log('Generating module assets via fal.ai');
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log('');

  for (const mod of MODULES) {
    const outDir = path.join(OUTPUT_DIR, mod.dir);
    const outFile = path.join(outDir, `${mod.dir}_0.png`);

    if (fs.existsSync(outFile)) {
      console.log(`skip ${mod.name} — already exists`);
      continue;
    }

    console.log(`${mod.name} — submitting...`);
    const submit = await submitRequest(mod.prompt);
    process.stdout.write(`  waiting`);

    const imageUrl = await pollResult(submit);
    console.log(` done`);

    await downloadImage(imageUrl, outFile);
    console.log(`  saved: ${outFile}`);

    // Generate mipmaps for the new asset
    const { generateMipmapsForFile } = await import('./generate-mipmaps.js');
    const mipCount = await generateMipmapsForFile(outFile);
    console.log(`  mipmaps: ${mipCount} generated`);
    console.log('');
  }

  console.log('All done!');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
