/**
 * Einmal-Probe: gueltige Parameterwerte von fal-ai/birefnet/v2 ermitteln.
 * fal validiert strikt und listet im 422 die erlaubten Enum-Werte auf —
 * billiger als raten. Kein Bildmaterial noetig, der Call schlaegt absichtlich
 * in der Validierung fehl.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const envRaw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const K = process.env.FAL_AI_API_KEY || process.env.FAL_API_KEY;
if (!K) { console.error('no key'); process.exit(1); }

const body = JSON.stringify({
  image_url: 'https://fal.media/files/does-not-exist.png',
  model: '__probe__',
  operating_resolution: '__probe__',
  refine_foreground: true,
  output_mask: true,
  output_format: '__probe__',
});

const req = https.request({
  hostname: 'fal.run', path: '/fal-ai/birefnet/v2', method: 'POST',
  headers: { 'Authorization': `Key ${K}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
}, (res) => {
  let d = '';
  res.on('data', (c) => { d += c; });
  res.on('end', () => { console.log('status', res.statusCode); console.log(d.slice(0, 4000)); });
});
req.on('error', (e) => console.error(e.message));
req.write(body);
req.end();
