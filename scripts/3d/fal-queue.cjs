// Shared access to fal.ai for the scripts in this folder: submit a request to the queue, wait
// for it, download files. The queue API is used on purpose: fal.run answers nothing from this
// machine (Docs/LESSONS-asset-pipeline.md, section 3).
// The API key is read from scripts/.env (FAL_API_KEY=...) and never printed.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function readKey() {
  const envPath = path.join(ROOT, 'scripts', '.env');
  const line = fs.readFileSync(envPath, 'utf8').split('\n').find((l) => l.startsWith('FAL_API_KEY='));
  const key = line ? line.replace('FAL_API_KEY=', '').trim() : '';
  if (!key) throw new Error('FAL_API_KEY missing in scripts/.env');
  return key;
}

// Runs one request and returns the response body. Waits up to 15 minutes.
async function runQueued(endpoint, body) {
  const headers = { Authorization: `Key ${readKey()}`, 'Content-Type': 'application/json' };
  const submit = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const submitted = await submit.json();
  if (!submit.ok || !submitted.status_url) {
    throw new Error(`submit failed (HTTP ${submit.status}): ${JSON.stringify(submitted).slice(0, 400)}`);
  }
  for (let attempt = 0; attempt < 180; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, attempt < 10 ? 2000 : 5000));
    const status = await (await fetch(submitted.status_url, { headers })).json();
    if (status.status === 'COMPLETED') {
      const response = await fetch(submitted.response_url, { headers });
      const result = await response.json();
      if (!response.ok) throw new Error(`result failed (HTTP ${response.status}): ${JSON.stringify(result).slice(0, 400)}`);
      return result;
    }
    if (status.status !== 'IN_QUEUE' && status.status !== 'IN_PROGRESS') {
      throw new Error(`unexpected status: ${JSON.stringify(status).slice(0, 400)}`);
    }
  }
  throw new Error('timed out after 15 minutes');
}

// Saves the file behind url to target and returns its size in bytes.
async function download(url, target) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed (HTTP ${response.status}): ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(target, bytes);
  return bytes.length;
}

module.exports = { ROOT, runQueued, download };
