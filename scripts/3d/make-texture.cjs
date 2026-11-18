// Generates one square material texture on fal.ai. The textures give the hand-made models
// (scripts/3d/models) their surface: kit.py reads only their brightness and rust and tints
// them with the palette colours, so colour words in the prompts do not matter.
//
//   node scripts/3d/make-texture.cjs --preset metal [--model grok|flux] [--seed 7] [--out scripts/3d/textures] [--name file]
//
// Presets: see PRESETS. Output: <out>/<name or preset>.jpg (1024 x 1024). Every run costs credits.
// In use since 2026-11-18: metal.jpg = metal_grimy, concrete.jpg = concrete_raw (darker, dirtier);
// the nature presets (granite … snow) under their own names, for the props.
// In a git worktree: set FAL_ENV_FILE to the main checkout's scripts/.env.
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
  // Dirtier, older variants (Rudi, 2026-11-18: "in V1 war das alles sehr dreckig, alt, dunkel").
  metal_dirty:
    'Extreme close-up of the side of a very old industrial machine on a mining colony, flat frontal view, the painted steel continues far beyond the image on all sides. ' +
    'Old worn paint covered in grime, soot and oil stains, dust settled in dents, many scratches, flaking paint, dark rust streaks running down and rust patches, evenly spread across the whole image. ' +
    'Texture for a video game.',
  metal_grimy:
    'Extreme close-up of the hull of a decades-old cargo hauler, flat frontal view, the steel continues far beyond the image on all sides. ' +
    'Heavily weathered dull paint, dark grease smears, soot, scuffs, chipped paint showing bare metal, brown rust bleeding from seams, uneven dirt, evenly spread across the whole image. ' +
    'Texture for a video game.',
  concrete_raw:
    'Extreme close-up of an old weathered exposed concrete wall, raw beton brut seen straight on, the concrete continues far beyond the image on all sides. ' +
    'Faint formwork board marks, small air pores, dark water stains and grime streaks running down, dust, hairline cracks, evenly spread across the whole image. ' +
    'Texture for a video game.',
  concrete_floor_dirty:
    'Extreme close-up of an old dirty industrial concrete floor seen from directly above, the floor continues far beyond the image on all sides. ' +
    'Raw grey concrete with oil stains, tyre and boot scuffs, dust, dark grime patches, small cracks and pores, evenly spread across the whole image. ' +
    'Texture for a video game.',
  // Nature on the surface (props.py, 2026-11-18): stones, volcanic rock, ice, sulfur, moss and
  // snow caps. kit.py tints them with the palette colours (PALETTE names the texture).
  // The first granite and sandstone (smooth stone, fine layers) were too even: the bake keeps only
  // the contrast of a texture, so they came out flat. These ask for coarse relief.
  granite:
    'Extreme close-up of a rough weathered grey rock face in the mountains, seen straight on, the rock continues far beyond the image on all sides. ' +
    'Coarse grainy granite with dark and light speckles, deep cracks, chipped edges, pits, small ledges and crumbly patches, evenly spread across the whole image. ' +
    'Texture for a video game.',
  sandstone:
    'Extreme close-up of a deeply eroded desert sandstone rock face, seen straight on, the rock continues far beyond the image on all sides. ' +
    'Wavy sediment bands of different hardness, wind-carved hollows and holes, crumbly sandy grain and cracks, evenly spread across the whole image. ' +
    'Texture for a video game.',
  tuff:
    'Extreme close-up of a large grey volcanic tuff rock face, seen straight on, the rock continues far beyond the image on all sides. ' +
    'Compacted ash with embedded small pebbles, crumbly pits and dusty patches, evenly spread across the whole image. ' +
    'Texture for a video game.',
  basalt:
    'Extreme close-up of the side of a dark basalt rock column, seen straight on, the rock continues far beyond the image on all sides. ' +
    'Dense fine-grained volcanic stone with tiny gas bubbles, sharp fractures and thin cracks, evenly spread across the whole image. ' +
    'Texture for a video game.',
  scoria:
    'Extreme close-up of a large field of cooled black volcanic scoria rock, seen from directly above, the rock continues far beyond the image on all sides. ' +
    'Porous rough surface full of gas holes, glassy sharp obsidian flakes and cracks, evenly spread across the whole image. ' +
    'Texture for a video game.',
  glacier_ice:
    'Extreme close-up of the surface of an old glacier, seen straight on, the ice continues far beyond the image on all sides. ' +
    'Compressed blue-white ice with trapped air bubbles, fine fractures, scratches and frosted patches, evenly spread across the whole image. ' +
    'Texture for a video game.',
  sulfur:
    'Extreme close-up of a thick crust of yellow sulfur crystals around a volcanic fumarole, seen from directly above, the crust continues far beyond the image on all sides. ' +
    'Crystalline grains, small lumps, cracks and powdery patches, evenly spread across the whole image. ' +
    'Texture for a video game.',
  moss:
    'Extreme close-up of a dense carpet of moss on a forest floor, seen from directly above, the moss continues far beyond the image on all sides. ' +
    'Tiny moss leaves, tufts and soft clumps, evenly spread across the whole image. ' +
    'Texture for a video game.',
  snow:
    'Extreme close-up of wind-packed old snow, seen from directly above, the snow continues far beyond the image on all sides. ' +
    'Granular crusty surface with small ripples, ice grains and shallow dents, evenly spread across the whole image. ' +
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
  const target = path.join(outDir, `${arg('name', preset)}.jpg`);
  const bytes = await download(url, target);
  console.log(`${preset}: saved ${path.relative(ROOT, target)} (${Math.round(bytes / 1024)} KB) in ${Math.round((Date.now() - started) / 1000)} s`);
}

main().catch((error) => {
  console.error(`${arg('preset', '?')}: FAILED - ${error.message}`);
  process.exit(1);
});
