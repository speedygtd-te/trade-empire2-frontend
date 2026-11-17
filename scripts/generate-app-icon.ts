/**
 * Generate app icon for Trade Empire via fal.ai image generation API.
 *
 * Usage: npx tsx scripts/generate-app-icon.ts
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

const OUTPUT_PATH = path.resolve(__dirname, '../src/assets/app-icon-raw.png');

const PROMPT = 'App icon for a sci-fi space strategy game called Trade Empire. Futuristic space station or planet with trade routes, dark background with stars, minimalist geometric design, clean edges suitable for app icon, vibrant cyan and purple accent colors on dark background, no text, no letters, square format';

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
    image_size: { width: 1024, height: 1024 },
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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

async function main(): Promise<void> {
  console.log('Generating Trade Empire app icon via fal.ai');
  console.log(`Output: ${OUTPUT_PATH}`);
  console.log('');

  console.log('Submitting generation request...');
  const submit = await submitRequest(PROMPT);
  process.stdout.write('Waiting for result');

  const imageUrl = await pollResult(submit);
  console.log(' done');

  await downloadImage(imageUrl, OUTPUT_PATH);
  console.log(`Saved: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
