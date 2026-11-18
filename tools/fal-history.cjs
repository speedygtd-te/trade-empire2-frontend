// Downloads the request history of fal.ai models (prompt, seed, result image URLs) into
// build/fal-history/<endpoint>.json, for finding images generated earlier (e.g. the square
// originals of the V1 biome tiles). Reads FAL_KEY / FAL_API_KEY from scripts/.env; never prints it.
//
//   node tools/fal-history.cjs [--since 2026-01-01] fal-ai/flux-pro/v1.1 [more endpoints …]
//
// The API answers at most 90 days per query; the tool walks from --since to now in windows.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function falKey() {
  const env = fs.readFileSync(path.join(ROOT, 'scripts', '.env'), 'utf8');
  const match = env.match(/^\s*FAL_(?:API_)?KEY\s*=\s*(.*)$/m);
  if (!match) throw new Error('no FAL_KEY in scripts/.env');
  return match[1].trim().replace(/^["']|["']$/g, '');
}

async function history(endpoint, key, since) {
  const items = [];
  const day = 24 * 3600 * 1000;
  for (let start = since.getTime(); start < Date.now(); start += 85 * day) {
    const end = Math.min(start + 85 * day, Date.now());
    items.push(...await window(endpoint, key, new Date(start).toISOString(), new Date(end).toISOString()));
  }
  return items;
}

async function window(endpoint, key, start, end) {
  const items = [];
  let cursor = '';
  for (;;) {
    const url = `https://api.fal.ai/v1/models/requests/by-endpoint?endpoint_id=${encodeURIComponent(endpoint)}&limit=100&expand=payloads&start=${start}&end=${end}${cursor ? `&cursor=${cursor}` : ''}`;
    const response = await fetch(url, { headers: { Authorization: `Key ${key}` } });
    if (response.status !== 200) throw new Error(`${endpoint}: ${response.status} ${(await response.text()).slice(0, 200)}`);
    const page = await response.json();
    for (const item of page.items || []) {
      const input = item.json_input || {};
      const output = item.json_output || {};
      items.push({
        id: item.request_id,
        at: item.started_at,
        prompt: input.prompt || '',
        seed: input.seed,
        input_image: input.image_url || '',
        images: (output.images || []).map((image) => image.url),
      });
    }
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return items;
}

async function main() {
  const key = falKey();
  const out = path.join(ROOT, 'build', 'fal-history');
  fs.mkdirSync(out, { recursive: true });
  const args = process.argv.slice(2);
  let since = new Date('2026-01-01T00:00:00Z');
  const at = args.indexOf('--since');
  if (at !== -1) since = new Date(args.splice(at, 2)[1]);
  for (const endpoint of args) {
    const items = await history(endpoint, key, since);
    const file = path.join(out, endpoint.replace(/[^a-z0-9.-]+/gi, '_') + '.json');
    fs.writeFileSync(file, JSON.stringify(items, null, 1));
    const first = items.length ? items.map((item) => item.at).sort()[0] : '-';
    console.log(`${endpoint}: ${items.length} requests since ${first} -> ${path.relative(ROOT, file)}`);
  }
}

main().catch((error) => { console.error('FAILED ' + error.message); process.exit(1); });
