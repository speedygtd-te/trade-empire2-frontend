/**
 * Regenerate specific module assets with dirty/realistic style.
 * Usage: npx ts-node scripts/regenerate-module-assets.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

const FAL_API_KEY = fs.readFileSync(path.join(__dirname, '../.env'), 'utf-8')
  .split('\n').find((l) => l.startsWith('FAL_API_KEY='))?.replace('FAL_API_KEY=', '').trim() ?? '';

const OUTPUT_DIR = path.resolve(__dirname, '../../Frontend/src/assets/modules');

const BASE_STYLE = 'isometric game asset, single 3D building module, 30 degree camera angle from horizontal, 2:1 isometric perspective, The Expanse sci-fi aesthetic, photorealistic textures, realistic worn and dirty metal surfaces, rust stains, oil residue, scratched paint, grime buildup, used industrial equipment, transparent background, game sprite, centered, single object, no ground plane, no shadow, no walls, no enclosure, open machinery';

interface ModulePrompt { name: string; dir: string; prompt: string }

const MODULES: ModulePrompt[] = [
  {
    name: 'PUMP',
    dir: 'pump',
    prompt: `${BASE_STYLE}, liquid extraction pump module, large cylindrical pump with heavy industrial pipes, fluid tanks with dirty glass viewing windows showing blue liquid, corroded pressure gauges, oil-stained hoses and leaking valves, teal and weathered silver metallic finish, water stains`,
  },
  {
    name: 'COLLECTOR',
    dir: 'collector',
    prompt: `${BASE_STYLE}, atmospheric gas collector module, large funnel-shaped intake on top with dust buildup, turbine fan with worn blades visible, corroded condensation coils, dented pressurized gas canisters connected by rusty tubes, flickering cyan vents, gray metal with dirt and oxidation`,
  },
  {
    name: 'DEEP_DRILL',
    dir: 'deep_drill',
    prompt: `${BASE_STYLE}, deep core drilling module, massive vertical drill assembly, heavy reinforced frame with welded structural bracing, worn diamond-tipped drill bit caked in rock dust, cooling system with grimy radiator fins, seismic sensor array, dark steel with chipped orange paint and rust streaks, heavy duty industrial, mud and rock debris`,
  },
  {
    name: 'SMELTER',
    dir: 'smelter',
    prompt: `${BASE_STYLE}, ore smelting furnace module, open-top blast furnace with glowing molten metal visible inside, orange ember glow, soot-covered ingot casting molds, blackened slag channel, heat-scorched radiator panels on sides, dark iron with glowing orange interior, heavy soot and char marks, heat-warped metal`,
  },
  {
    name: 'REFINERY',
    dir: 'refinery',
    prompt: `${BASE_STYLE}, chemical refinery module, distillation columns of varying height with pipe corrosion, connected pipes and valves with rust and chemical stains, small cylindrical storage tanks with dents, leaking pressure relief valves, weathered stainless steel, discolored welds, oil drips, silver and gray with chemical residue stains`,
  },
];

interface SubmitResult { requestId: string; statusUrl: string; responseUrl: string }

function httpsGet(url: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    https.request({ hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'GET', headers }, (res) => {
      let body = ''; res.on('data', (c: string) => { body += c; }); res.on('end', () => resolve(body));
    }).on('error', reject).end();
  });
}

async function submitRequest(prompt: string): Promise<SubmitResult> {
  const body = JSON.stringify({
    prompt, image_size: { width: 512, height: 512 },
    num_inference_steps: 28, guidance_scale: 7.5, num_images: 1,
    enable_safety_checker: false, output_format: 'png',
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'queue.fal.run', path: '/fal-ai/flux/dev', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${FAL_API_KEY}` },
    }, (res) => {
      let data = ''; res.on('data', (c: string) => { data += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) { reject(new Error(`Submit failed (${res.statusCode}): ${data}`)); return; }
        const p = JSON.parse(data);
        resolve({ requestId: p.request_id, statusUrl: p.status_url, responseUrl: p.response_url });
      });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

async function pollResult(submit: SubmitResult): Promise<string> {
  const headers = { 'Authorization': `Key ${FAL_API_KEY}` };
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const data = await httpsGet(submit.statusUrl, headers);
    const parsed = JSON.parse(data);
    if (parsed.status === 'COMPLETED') {
      const result = await httpsGet(submit.responseUrl, headers);
      return (JSON.parse(result)).images[0].url as string;
    }
    if (parsed.status === 'FAILED') throw new Error(`Failed: ${JSON.stringify(parsed)}`);
    process.stdout.write('.');
  }
  throw new Error('Timeout');
}

async function downloadImage(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dl = (u: string): void => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) { dl(res.headers.location as string); return; }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => { fs.writeFileSync(outputPath, Buffer.concat(chunks)); resolve(); });
      }).on('error', reject);
    };
    dl(url);
  });
}

async function main(): Promise<void> {
  console.log('Regenerating module assets (realistic + dirty)');
  for (const mod of MODULES) {
    const outFile = path.join(OUTPUT_DIR, mod.dir, `${mod.dir}_0.png`);
    console.log(`${mod.name} — submitting...`);
    const submit = await submitRequest(mod.prompt);
    process.stdout.write('  waiting');
    const imageUrl = await pollResult(submit);
    console.log(' done');
    await downloadImage(imageUrl, outFile);
    console.log(`  saved: ${outFile}\n`);
  }
  console.log('All done!');
}

main().catch((e) => { console.error('Failed:', e); process.exit(1); });
