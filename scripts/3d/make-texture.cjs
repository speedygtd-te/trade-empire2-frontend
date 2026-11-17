// Generates one square material texture on fal.ai. The textures give the hand-made models
// (scripts/3d/models) their surface: kit.py reads only their brightness and rust and tints
// them with the palette colours, so colour words in the prompts do not matter.
//
//   node scripts/3d/make-texture.cjs --preset metal [--model grok|flux] [--seed 7] [--out scripts/3d/textures]
//
// Presets: metal, concrete. Output: <out>/<preset>.jpg (1024 x 1024). Every run costs credits.
// grok is the default: in the comparison of 2026-11-17 it filled the whole image evenly, while
// flux left a rim, a vignette and a nearly empty middle.
// The prompts follow Docs/LESSONS-asset-pipeline.md, section 3: no negative prompts, describe
// the surface and its geometry, name nothing the surface could lie on.
'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, runQueued, download } = require('./fal-queue.cjs');

// List prices per image (2026-11): flux $0.04, grok $0.02. Grok takes no seed.
const MODELS = {
  flux: {
    endpoint: 'fal-ai/flux-pro/v1.1',
    body: (prompt, seed) => ({
      prompt, image_size: { width: 1024, height: 1024 }, num_images: 1, output_format: 'jpeg',
      enable_safety_checker: false, seed,
    }),
  },
  grok: {
    endpoint: 'xai/grok-imagine-image',
    body: (prompt) => ({ prompt, aspect_ratio: '1:1', resolution: '1k', num_images: 1, output_format: 'jpeg' }),
  },
};
const PRESETS = {
  // Never name a plate, slab or panel: flux then draws an object with a rim, bolts and studio
  // light and leaves the middle empty (tried 2026-11-17). Describe a close-up of something
  // much larger than the image instead.
  metal:
    'Extreme close-up of the side of an old steel ship hull, flat frontal view, the painted steel continues far beyond the image on all sides. ' +
    'Worn matte grey paint, many fine scratches, flaking paint chips, rust streaks running down and scattered rust patches, evenly spread across the whole image. ' +
    'Texture for a video game.',
  concrete:
    'Extreme close-up of an old concrete floor seen from directly above, the concrete continues far beyond the image on all sides. ' +
    'Pores, hairline cracks, stains and mottling, evenly spread across the whole image. ' +
    'Texture for a video game.',
};

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const preset = arg('preset', '');
  const model = MODELS[arg('model', 'grok')];
  if (!PRESETS[preset] || !model) {
    console.error(`usage: node scripts/3d/make-texture.cjs --preset <${Object.keys(PRESETS).join('|')}> [--model <${Object.keys(MODELS).join('|')}>] [--seed n] [--out dir]`);
    process.exit(2);
  }
  const outDir = path.resolve(ROOT, arg('out', 'scripts/3d/textures'));
  fs.mkdirSync(outDir, { recursive: true });
  const started = Date.now();
  const result = await runQueued(model.endpoint, model.body(PRESETS[preset], Number(arg('seed', '7'))));
  const url = result?.images?.[0]?.url;
  if (!url) throw new Error(`no image in the response: ${JSON.stringify(result).slice(0, 400)}`);
  const target = path.join(outDir, `${preset}.jpg`);
  const bytes = await download(url, target);
  console.log(`${preset}: saved ${path.relative(ROOT, target)} (${Math.round(bytes / 1024)} KB) in ${Math.round((Date.now() - started) / 1000)} s`);
}

main().catch((error) => {
  console.error(`${arg('preset', '?')}: FAILED - ${error.message}`);
  process.exit(1);
});
