/**
 * PRODUCTION: integrate the H70L27M rung (L 27, B/R 0.700, Voronoi net 60 px cells /
 * 12 px furrows, depth 0.28, bright wall 1.30x) of the permafrost ladder into
 * src/assets/tiles/permafrost/, replacing the old set in place.
 *
 * WHY THIS RUNG (Rudi's pick from the ladder, 2026-09-04)
 *   Vorlage is PLUTO: tholin deposits ARE the dark terrain, so "darker and redder"
 *   is one statement and not two -- hence B/R 0.700 with G/R on tundra's own warm
 *   axis (0.5 + 0.5*B/R = 0.850) at canvas luma 27. Plus PATTERNED GROUND: polygonal
 *   frost cracks closing into a honeycomb, which is what permafrost looks like on
 *   Earth and on icy bodies alike (Sputnik Planitia). A procedural Voronoi cell net
 *   is the faithful AND the steerable form of that.
 *
 *   The net is only ever a MULTIPLIER (1-dark)(1+bright) on the FROZEN shipped
 *   tundra, so the ground stays tundra by construction -- gNCC is the guard, and it
 *   reads 0.86-0.93 fine / 0.80-0.87 blurred against tundra slot for slot.
 *
 *   Structure is the leg that carries the tundra pair: micro8 goes 3.54 -> 5.77
 *   (x1.63, bar 1.60). Hue alone does NOT fire (dB/R -0.12 against a 0.30 bar) and
 *   L 27 does not fire the level leg either (dL -3.8 against a 6.0 bar) -- Rudi
 *   asked for 26-28 and the whole band sits inside tundra's level bar. Both are
 *   accepted knowingly: at play scale the pair separates with d'_texture 13.3 and
 *   d'_JOINT 33.7, and permafrost next to tundra is unmistakable in the panel.
 *
 *   The net raises the lattice fold at play scale only to grid_play 2.91 (coh 2.51)
 *   -- tundra's own 2.60 (coh 2.43), far under glacier's 5.79 (coh 3.22) and nowhere
 *   near the rejected old tundra's 10.40. Light plane tiltY 3.0 / tiltX 0.0, the
 *   same normalisation as tundra and glacier, so the ICE family shows one raster
 *   character on one planet.
 *
 * SLOTS
 *   slot n IS tundra slot n with the net multiplied onto it, so the corpus mirror
 *   convention (the flop of slots 2/3) is inherited unchanged. With tiltX 0 that
 *   cannot be read off a ramp sign, so it is proven on the PATTERN instead: masked
 *   mean-centred NCC of each slot against its own tundra slot in all four
 *   orientations -- identity 0.86-0.93, every other orientation <= 0.022.
 *
 * src/assets/tiles/tundra/ IS NOT TOUCHED -- it is the source and it stays as it is.
 *
 * Sources (already final, 512x256 diamond-masked RGBA PNG, built and verified by
 * scripts/tiles-permafrost-ladder.cjs):
 *   assets/style-test/tiles/permafrost/H70L27M/permafrost_<n>.png
 * Integrated AS-IS. The old tiles are recoverable from git.
 *
 * Per tile, matching the layout of every other biome in src/assets/tiles/
 * (full size in webp only, the three mips in webp AND png; the mip PNGs are
 * deliberately untracked, .gitignore:22-24):
 *   permafrost_<n>.webp                full 512x256
 *   permafrost_<n>@half.{webp,png}     256x128
 *   permafrost_<n>@quarter.{webp,png}  128x64
 *   permafrost_<n>@eighth.{webp,png}   64x32
 *
 * WebP: quality 90, effort 4, smartSubsample -- as the rest of the corpus.
 *
 * Usage: node scripts/permafrost-net-integrate-prod.cjs
 *   then: SET=prod node scripts/permafrost-verify-prod.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'style-test', 'tiles', 'permafrost', 'H70L27M');
const DST = path.join(ROOT, 'src', 'assets', 'tiles', 'permafrost');
const TUNDRA = path.join(ROOT, 'src', 'assets', 'tiles', 'tundra');

const MIPS = [
  { suffix: '@half', w: 256, h: 128 },
  { suffix: '@quarter', w: 128, h: 64 },
  { suffix: '@eighth', w: 64, h: 32 },
];
const WEBP = { quality: 90, effort: 4, smartSubsample: true };

(async () => {
  // the source of this biome must be the set that actually ships as tundra
  for (let n = 0; n < 4; n++) {
    const frozen = path.join(ROOT, 'assets', 'style-test', 'tiles', 'permafrost', 'src', 'tundra_' + n + '_src.webp');
    if (!fs.readFileSync(frozen).equals(fs.readFileSync(path.join(TUNDRA, 'tundra_' + n + '.webp')))) {
      throw new Error('tundra_' + n + ' has moved since the ladder ran -- rebuild the ladder first');
    }
  }
  console.log('[freeze] all four frozen tundra sources are byte-identical to src/assets/tiles/tundra/');

  const tundraBefore = fs.readdirSync(TUNDRA).sort()
    .map((f) => f + ' ' + require('crypto').createHash('md5').update(fs.readFileSync(path.join(TUNDRA, f))).digest('hex'));

  fs.mkdirSync(DST, { recursive: true });
  for (let n = 0; n < 4; n++) {
    const src = path.join(SRC, 'permafrost_' + n + '.png');
    const buf = fs.readFileSync(src);
    const meta = await sharp(buf).metadata();
    if (meta.width !== 512 || meta.height !== 256) throw new Error('permafrost_' + n + '.png is not 512x256');
    if (!meta.hasAlpha) throw new Error('permafrost_' + n + '.png has no alpha');

    await sharp(buf).webp(WEBP).toFile(path.join(DST, 'permafrost_' + n + '.webp'));
    for (const m of MIPS) {
      const r = () => sharp(buf).resize(m.w, m.h, { fit: 'fill' });
      await r().webp(WEBP).toFile(path.join(DST, 'permafrost_' + n + m.suffix + '.webp'));
      await r().png().toFile(path.join(DST, 'permafrost_' + n + m.suffix + '.png'));
    }
    console.log('[done] permafrost_' + n + ' <- permafrost/H70L27M/permafrost_' + n + '.png (AS-IS, mirror inherited from tundra)');
  }

  const want = [];
  for (let n = 0; n < 4; n++) {
    want.push('permafrost_' + n + '.webp');
    for (const m of MIPS) { want.push('permafrost_' + n + m.suffix + '.webp'); want.push('permafrost_' + n + m.suffix + '.png'); }
  }
  const have = fs.readdirSync(DST);
  const missing = want.filter((f) => !have.includes(f));
  const extra = have.filter((f) => !want.includes(f));
  if (missing.length) throw new Error('missing after integration: ' + missing.join(', '));
  console.log('[verify] ' + want.length + ' files present' + (extra.length ? ', unexpected extras: ' + extra.join(', ') : ', no extras'));

  const tundraAfter = fs.readdirSync(TUNDRA).sort()
    .map((f) => f + ' ' + require('crypto').createHash('md5').update(fs.readFileSync(path.join(TUNDRA, f))).digest('hex'));
  if (tundraBefore.join('\n') !== tundraAfter.join('\n')) throw new Error('src/assets/tiles/tundra/ CHANGED -- aborting');
  console.log('[verify] src/assets/tiles/tundra/ untouched (' + tundraAfter.length + ' files, md5 identical)');
  console.log('integration complete');
})();
