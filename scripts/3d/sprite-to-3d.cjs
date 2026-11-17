// Turns one sprite into a 3D model with an image-to-3D model on fal.ai and saves the GLB.
//
//   node scripts/3d/sprite-to-3d.cjs --model hunyuan-lowpoly --input assets/final/mine_0.png
//   node scripts/3d/sprite-to-3d.cjs --model trellis --input assets/final/mine_0.png --out assets/3d-test
//
// Models and list prices per run (2026-11): hunyuan-lowpoly $0.45, hunyuan-normal $0.375
// (fal-ai/hunyuan3d-v3/image-to-3d), hunyuan-rapid $0.225 (fal-ai/hunyuan-3d/v3.1/rapid/image-to-3d),
// trellis about $0.02 (fal-ai/trellis).
// Output: <out>/<name>__<model>.glb and <name>__<model>.json (the response without the key);
// a model that does not arrive as GLB lands in the folder <out>/<name>__<model>/.
// The API key is read from scripts/.env (FAL_API_KEY=...) and never printed. Every run costs
// credits. No dependencies: Node 18+ only.
'use strict';

const fs = require('fs');
const path = require('path');

const { ROOT, runQueued, download } = require('./fal-queue.cjs');

const MODELS = {
  'hunyuan-lowpoly': {
    endpoint: 'fal-ai/hunyuan3d-v3/image-to-3d',
    body: (image) => ({ input_image_url: image, generate_type: 'LowPoly', enable_pbr: false }),
    glbUrl: (r) => r?.model_glb?.url || r?.model_urls?.glb?.url,
  },
  // No face_count on purpose: a custom face count is a paid extra, and the triangles are
  // reduced afterwards anyway (scripts/3d/postprocess.py).
  'hunyuan-normal': {
    endpoint: 'fal-ai/hunyuan3d-v3/image-to-3d',
    body: (image) => ({ input_image_url: image, generate_type: 'Normal', enable_pbr: false }),
    glbUrl: (r) => r?.model_glb?.url || r?.model_urls?.glb?.url,
  },
  // May answer with an OBJ instead of a GLB; then the material file and the texture come along.
  'hunyuan-rapid': {
    endpoint: 'fal-ai/hunyuan-3d/v3.1/rapid/image-to-3d',
    body: (image) => ({ input_image_url: image, enable_pbr: false }),
    glbUrl: (r) => r?.model_glb?.url || r?.model_urls?.obj?.url,
    extras: (r) => [r?.model_glb, r?.model_urls?.obj, r?.model_urls?.mtl, r?.model_urls?.texture, r?.material_mtl, r?.texture],
  },
  trellis: {
    endpoint: 'fal-ai/trellis',
    body: (image) => ({ image_url: image, texture_size: 1024, mesh_simplify: 0.95 }),
    glbUrl: (r) => r?.model_mesh?.url,
  },
};

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const modelName = arg('model', '');
  const model = MODELS[modelName];
  const input = arg('input', '');
  if (!model || !input) {
    console.error(`usage: node scripts/3d/sprite-to-3d.cjs --model <${Object.keys(MODELS).join('|')}> --input <png> [--out dir] [--name name]`);
    process.exit(2);
  }
  const inputPath = path.resolve(ROOT, input);
  const outDir = path.resolve(ROOT, arg('out', 'assets/3d-test'));
  const name = arg('name', path.basename(inputPath).replace(/\.[^.]+$/, ''));
  fs.mkdirSync(outDir, { recursive: true });

  const mime = inputPath.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/png';
  const image = `data:${mime};base64,${fs.readFileSync(inputPath).toString('base64')}`;

  const started = Date.now();
  const result = await runQueued(model.endpoint, model.body(image));

  const mainUrl = model.glbUrl(result);
  if (!mainUrl) throw new Error(`no model in the response: ${JSON.stringify(result).slice(0, 600)}`);
  const base = path.join(outDir, `${name}__${modelName}`);
  fs.writeFileSync(base + '.json', JSON.stringify(result, null, 2));
  const extension = (path.extname(new URL(mainUrl).pathname) || '.glb').toLowerCase();
  const seconds = () => Math.round((Date.now() - started) / 1000);
  if (extension === '.glb') {
    const bytes = await download(mainUrl, base + '.glb');
    console.log(`${modelName}: saved ${path.relative(ROOT, base + '.glb')} (${(bytes / 1048576).toFixed(1)} MB) in ${seconds()} s`);
    return;
  }
  // Not a GLB: keep the files in one folder under the names the response gives them (not the
  // names in the URLs), because the model file refers to its material file and texture by name.
  fs.mkdirSync(base, { recursive: true });
  const names = new Map([[mainUrl, path.basename(new URL(mainUrl).pathname)]]);
  for (const file of model.extras ? model.extras(result) : []) {
    if (file?.url) names.set(file.url, path.basename(file.file_name || new URL(file.url).pathname));
  }
  let total = 0;
  for (const [url, fileName] of names) total += await download(url, path.join(base, fileName));
  console.log(`${modelName}: saved ${names.size} files to ${path.relative(ROOT, base)} (${(total / 1048576).toFixed(1)} MB, main file ${extension}) in ${seconds()} s`);
}

main().catch((error) => {
  console.error(`${arg('model', '?')}: FAILED - ${error.message}`);
  process.exit(1);
});
