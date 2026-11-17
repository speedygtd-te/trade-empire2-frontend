/**
 * PRODUCTION: integrate the ramp0 rung of the dust_plain build into
 * src/assets/tiles/dust_plain/, replacing the shipped set in place.
 *
 * WHAT CHANGED, and why -- the four steps of the brief, nothing else.
 *
 *  1. SLOT 0 DE-YELLOWED. B/R 0.706 -> 0.820, saturation 29.6% -> 18.2%. A
 *     three-rung ladder (0.75 / 0.79 / 0.82) was built and sheeted; 0.75 and
 *     0.79 still read warmer than slot 1 side by side, 0.82 sits on slot 1
 *     (0.805) and slot 2 (0.825) and is inside the brief's 0.80-0.83 band.
 *     It is a grade, not a regeneration -- the tile stays warm beige, blue is
 *     still 18% under red.
 *
 *  2. SLOT 1 CONTENT UNTOUCHED. Only its light plane is normalised with the
 *     others, and its hue moves 0.805 -> 0.822, which is inside its own noise.
 *
 *  3. SLOTS 2 AND 3 REBUILT, one out of each good slot, so Rudi's spread
 *     survives: slot 2 comes out of slot 0 (grainy, sd 12.3, micro8 3.3),
 *     slot 3 out of slot 1 (smooth, sd 4.2, micro8 1.3). The old slot 2 (the
 *     steepest vertical ramp in the set, -31.5) and old slot 3 (the only one
 *     with a strong LATERAL ramp, -24.6, which alternates under the flop and
 *     reads as a quilt) are gone.
 *
 *     THE ROUTE IS WINDOW OFFSET, NOT flux -- the brief said to try it first
 *     and it held. A 512x256 diamond tiles the plane on the lattice (512,0) /
 *     (256,128), so the tile's content already is a plate, wrapped on a torus;
 *     rolling it by (256,0) is an offset window in exactly the frozen_lake
 *     sense, with no resampling, no mirror symmetry and no invented pixels.
 *     Inter-slot |NCC| over all pairs AND all four orientations: 0.017 max.
 *     No flux call was made, so none of its failure modes could apply.
 *
 *  4. ONE LIGHT PLANE OVER ALL FOUR. tiltX 0 everywhere (it costs nothing and
 *     it is what makes a flopped pair read as a quilt) and tiltY 0 as well.
 *
 * WHY RAMP 0 AND NOT 3 OR 6 -- measured, not assumed. Three full sets were
 * built at the corpus tiltY unit 0 / 3 / 6 (gy 0 / -4.5 / -9.0):
 *
 *     ramp   grid_play   coh    seam step/rough   ratio
 *      0        2.61     0.60      7.69/6.76      1.14
 *      3        2.83     1.71      9.13/6.79      1.35
 *      6        3.88     3.31     11.78/6.76      1.74
 *
 *   coh is the coherent stamp -- the part that is the SAME shape in every tile
 *   and therefore the part the eye reads as a grid. It triples from ramp 0 to
 *   ramp 3 and multiplies by 5.5 to ramp 6, while the tile's own roughness
 *   does not move at all (6.76 -> 6.76). Two of the four slots have sd 4.2, so
 *   for half the set the ramp IS most of the seam, exactly the frozen_lake
 *   case; and dust_plain gets almost no props (PLAN 5.4: "kaum welche -- die
 *   Leere ist der Charakter"), so there is nothing above the tile that needs a
 *   ground shading to sit in. At play scale the ramp-3 set visibly shades each
 *   rhombus light-top / dark-bottom, the way shipped tundra does (coh 2.43);
 *   ramp 0 does not. Reference points measured in the same harness:
 *   frozen_lake coh 0.25, tundra 2.43, shipped dust_plain 9.54.
 *
 * HOW EACH SLOT IS MADE, in order:
 *   edgeRepair(3)     the outer ring carries libwebp's edge artefact; a roll
 *                     would drag that hairline into the middle of the tile
 *   flattenRadial     divides out the diamond-radial bowl -- this is the rim
 *                     seam, -8.1 / -3.9 on the two sources, +0.1 / -0.1 after
 *   flattenPoly(5)    divides out the broad blobs and the tile's own ramp
 *   latticeRoll       slots 2 and 3 only, (256,0)
 *   solveTile         p70 161.5 / B/R 0.820 / G/R = 1 + 0.50*(B/R-1),
 *                     gx 0, gy 0, solved on the WRITTEN webp over 9 passes
 *   flop              slots 2 and 3, per the corpus convention
 *
 * MIRROR CONVENTION, read off the shipped corpus and not assumed. Over the 48
 * finished biomes in src/assets/tiles/ the best-|NCC| orientation of slot2 vs
 * slot0 and slot3 vs slot1 is flop 40 times, id 6, flip 1, r180 1. So slots
 * 2/3 are flopped, never flipped -- a flip inverts the upper-left lighting.
 * dust_plain itself carried no mirror relation at all (four independent
 * slots), which is why the convention had to come from the corpus. At tiltX 0
 * the ramp sign proves nothing, so the mirroring is proven by NCC of each
 * written slot against its own pre-mirror buffer: slots 0/1 id 1.000, slots
 * 2/3 flop 0.988 / 0.971, every other orientation <= 0.019.
 *
 * K = 0.50, not the ICE corpus 0.60. The ICE k-curve was fitted on tiles above
 * B/R 1. Measured here over the finished WARM biomes (B/R 0.60..0.97) the
 * median k is 0.456; dust_plain's own four slots measure 0.414 / 0.504 /
 * 0.530 / 0.476, and tundra / permafrost / mountain all sit at 0.50.
 *
 * Sources: assets/style-test/tiles/dust_plain/build/ramp0/dust_plain_<n>.png,
 * already 512x256 diamond-masked RGBA with the flop baked in. Integrated
 * AS-IS. The old tiles are recoverable from git.
 *
 * Per tile, matching every other biome in src/assets/tiles/ (full size in webp
 * only, the three mips in webp AND png; the mip PNGs are deliberately
 * untracked, .gitignore:22-24):
 *   dust_plain_<n>.webp                full 512x256
 *   dust_plain_<n>@half.{webp,png}     256x128
 *   dust_plain_<n>@quarter.{webp,png}  128x64
 *   dust_plain_<n>@eighth.{webp,png}   64x32
 *
 * WebP: quality 90, effort 4, smartSubsample -- as the rest of the corpus.
 *
 * Usage: node scripts/dust-plain-integrate-prod.cjs
 *   then: node scripts/dust-plain-verify.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
sharp.cache(false);

const ROOT = path.join(__dirname, '..');
const WORK = path.join(ROOT, 'assets', 'style-test', 'tiles', 'dust_plain');
const SRC = path.join(WORK, 'build', 'ramp0');
const DST = path.join(ROOT, 'src', 'assets', 'tiles', 'dust_plain');

const MIPS = [
  { suffix: '@half', w: 256, h: 128 },
  { suffix: '@quarter', w: 128, h: 64 },
  { suffix: '@eighth', w: 64, h: 32 },
];
const WEBP = { quality: 90, effort: 4, smartSubsample: true };
const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');

(async () => {
  // the two source slots must not have moved since the build read them
  for (const n of [0, 1]) {
    const frozen = path.join(WORK, 'src', 'dust_plain_' + n + '_src.webp');
    if (!fs.readFileSync(frozen).equals(fs.readFileSync(path.join(DST, 'dust_plain_' + n + '.webp')))) {
      throw new Error('dust_plain_' + n + ' has moved since the build -- re-run scripts/tiles-dust-plain-build.cjs');
    }
  }
  console.log('[freeze] both source slots are byte-identical to the ones the build read');

  // no other biome directory may be touched
  const TILES = path.join(ROOT, 'src', 'assets', 'tiles');
  const others = fs.readdirSync(TILES).filter((d) => d !== 'dust_plain' && fs.statSync(path.join(TILES, d)).isDirectory());
  const snap = others.map((d) => d + ':' + fs.readdirSync(path.join(TILES, d)).sort().map((f) => md5(path.join(TILES, d, f))).join(''));

  for (let n = 0; n < 4; n++) {
    const src = path.join(SRC, 'dust_plain_' + n + '.png');
    const buf = fs.readFileSync(src);
    const meta = await sharp(buf).metadata();
    if (meta.width !== 512 || meta.height !== 256) throw new Error('dust_plain_' + n + '.png is not 512x256');
    if (!meta.hasAlpha) throw new Error('dust_plain_' + n + '.png has no alpha');

    await sharp(buf).webp(WEBP).toFile(path.join(DST, 'dust_plain_' + n + '.webp'));
    for (const m of MIPS) {
      const r = () => sharp(buf).resize(m.w, m.h, { fit: 'fill' });
      await r().webp(WEBP).toFile(path.join(DST, 'dust_plain_' + n + m.suffix + '.webp'));
      await r().png().toFile(path.join(DST, 'dust_plain_' + n + m.suffix + '.png'));
    }
    console.log('[done] dust_plain_' + n + ' <- build/ramp0/dust_plain_' + n + '.png (AS-IS, ' +
      (n < 2 ? 'as cut' : 'rolled + flop already baked in') + ')');
  }

  const want = [];
  for (let n = 0; n < 4; n++) {
    want.push('dust_plain_' + n + '.webp');
    for (const m of MIPS) { want.push('dust_plain_' + n + m.suffix + '.webp'); want.push('dust_plain_' + n + m.suffix + '.png'); }
  }
  const have = fs.readdirSync(DST);
  const missing = want.filter((f) => !have.includes(f));
  const extra = have.filter((f) => !want.includes(f));
  if (missing.length) throw new Error('missing after integration: ' + missing.join(', '));
  console.log('[verify] ' + want.length + ' files present' + (extra.length ? ', unexpected extras: ' + extra.join(', ') : ', no extras'));

  const snap2 = others.map((d) => d + ':' + fs.readdirSync(path.join(TILES, d)).sort().map((f) => md5(path.join(TILES, d, f))).join(''));
  if (snap.join('|') !== snap2.join('|')) throw new Error('another biome directory CHANGED -- aborting');
  console.log('[verify] the other ' + others.length + ' biome directories are untouched (md5 identical)');
  console.log('integration complete -- next: node scripts/dust-plain-verify.cjs');
})();
