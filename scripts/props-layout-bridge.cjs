/**
 * Load the REAL src/views/grid/propLayout.ts into a .cjs pipeline script.
 *
 * ── WHY, AND IT IS THE WHOLE POINT
 *
 * The first frost review sheet laid out its field panels by hand: one prop per
 * tile, on the tile's south vertex, at unit size. The shipped layer does none of
 * those three things, and Rudi caught it —
 *   "wichtig ist nur die position auf einem tile. aktuell sind alle auf der
 *    unteren spitze positioniert. der prop layer arbeitet so aber aktuell nicht.
 *    oft sind auf einem tile mehrere props positioniert. dafuer sind die props
 *    selbst dann etwas kleiner"
 * — and the height-factor recommendation that came off those panels was derived
 * from a model that was wrong in three places at once.
 *
 * A re-implementation would drift again, so this bridge runs the actual module.
 * `propLayout(x, y, biome, g)` is imported and called; the count, the per-
 * instance dx/dy, the per-instance scale, the variant draw and the key hash are
 * therefore not mirrored constants but the shipped code.
 *
 * ── HOW
 *
 * TypeScript's compiler API is in node_modules (no esbuild in this project), so
 * `ts.transpileModule` to CommonJS behind a `require.extensions['.ts']` hook is
 * enough — these three modules are plain TS with no JSX and no path aliases.
 *
 * Two modules cannot be loaded as they are, and both substitutions are narrow:
 *
 *   spriteCache   uses `import.meta.glob`, which only exists inside Vite. It is
 *                 replaced by a stub whose ONLY job is propVariantCount — the
 *                 single thing propLayout reads from it, and read-only (see the
 *                 header of propLayout: "that is the single coupling to the
 *                 sprite cache"). The stub returns the shipped variant counts.
 *
 *   propThemes    is loaded FOR REAL and then WRAPPED. It has no entries for
 *                 glacier / permafrost / tundra yet — wiring them is the next
 *                 task and this round writes nothing under src/ — so the wrapper
 *                 answers for exactly those three biomes from the PROPOSED
 *                 config passed in here, and delegates every other biome to the
 *                 real module untouched.
 *
 * So: real layout mathematics, proposed configuration. That split is deliberate
 * and it is what the sheet is for — the configuration is the thing being asked
 * about, and it is the only thing a reader has to take on trust.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const SRC = path.join(__dirname, '..', 'src', 'views', 'grid');
const P_LAYOUT = path.join(SRC, 'propLayout.ts');
const P_THEMES = path.join(SRC, 'propThemes.ts');
const P_SPRITE = path.join(SRC, 'spriteCache.ts');

// ── .ts require hook ──
if (!require.extensions['.ts']) {
  require.extensions['.ts'] = function (mod, filename) {
    const src = fs.readFileSync(filename, 'utf8');
    const out = ts.transpileModule(src, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
        isolatedModules: true,
      },
      fileName: filename,
    });
    mod._compile(out.outputText, filename);
  };
}

/**
 * @param {Record<string, {keys: (string|null)[], minCount: number, maxCount: number, minG?: number}>} proposed
 *        biome (lowercase) -> the config being proposed for it
 * @param {Record<string, number>} variantCounts  prop key -> shipped sprite count
 * @param {Record<string, number>} heightFactors  prop key -> proposed height factor
 */
function loadPropLayout(proposed, variantCounts, heightFactors) {
  // 1 — stub spriteCache BEFORE anything can require it
  const spriteStub = new Module(P_SPRITE, null);
  spriteStub.filename = P_SPRITE;
  spriteStub.loaded = true;
  spriteStub.exports = {
    propVariantCount: (name) => variantCounts[name] ?? 0,
  };
  require.cache[P_SPRITE] = spriteStub;

  // 2 — load the real propThemes, then wrap it
  const real = require(P_THEMES);
  const lc = (b) => String(b).toLowerCase();
  const wrapped = {
    ...real,
    propKeysForBiome: (b) =>
      proposed[lc(b)] ? proposed[lc(b)].keys : real.propKeysForBiome(b),
    propDensityForBiome: (b) =>
      proposed[lc(b)]
        ? { minCount: proposed[lc(b)].minCount, maxCount: proposed[lc(b)].maxCount }
        : real.propDensityForBiome(b),
    propMinGForBiome: (b) =>
      proposed[lc(b)] ? (proposed[lc(b)].minG ?? 1) : real.propMinGForBiome(b),
    // A proposed config may carry its OWN per-key variant subset — the
    // crater_decal strength ladder needs one on every ground it is wired to,
    // and on the frost grounds the rungs differ per biome (glacier [0,1],
    // crevasse [1,2], permafrost/tundra [2,3]). Without this the sheet would
    // draw the whole ladder uniformly and show a decal strength no biome will
    // ever get. Same normalisation as the real propVariantSubset: an empty
    // array means "the whole shipped set", not "nothing".
    propVariantSubset: (b, k) => {
      const p = proposed[lc(b)];
      if (!p) return real.propVariantSubset(b, k);
      const sub = p.variants?.[k];
      return sub && sub.length > 0 ? sub : undefined;
    },
    propHeightFactor: (key, variant) =>
      key in heightFactors ? heightFactors[key] : real.propHeightFactor(key, variant),
  };
  const themeStub = new Module(P_THEMES, null);
  themeStub.filename = P_THEMES;
  themeStub.loaded = true;
  themeStub.exports = wrapped;
  require.cache[P_THEMES] = themeStub;

  // 3 — the real thing
  const layout = require(P_LAYOUT);
  return {
    propLayout: layout.propLayout,
    propCountForBiomeG: layout.propCountForBiomeG,
    MAX_G: layout.MAX_G,
    PROP_SCALE_MIN: layout.PROP_SCALE_MIN,
    PROP_SCALE_MAX: layout.PROP_SCALE_MAX,
    JITTER: layout.JITTER_FOR_TEST,
    // The renderer reads this per prop KEY when it places the ground point
    // (PlanetSurface's prop branch). A sheet that reproduces the draw geometry
    // needs it, and reading it here keeps the value out of the sheet script —
    // propThemes stays the single source.
    propGroundInset: wrapped.propGroundInset,
  };
}

module.exports = { loadPropLayout };
