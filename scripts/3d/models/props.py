"""Props on the surface as low-poly models: stones, lava rock, basalt columns, ice blocks, sulfur
vents and the vent covers over underground hulls (after the V1 prop sprites, src/assets/props in
V1). Which cell carries which prop is decided by core/prop_rules.gd; trees, plants and flat props
(palms, burnt trunks, grass, bushes, reeds, puddles, craters, floes) are V1 sprites
(game/world/props) since 2026-11-18: as low-poly models the trees looked angular next to the
sprite grass (Rudi). Writes <family>_<n>.glb for every variant.

Sizes are in cells: a boulder is about a fifth of a cell. Props appear by the thousands, so they
keep few triangles and small textures, and the recipe ages them gently (nature, not industry).
Their colours name surface textures of their own (granite, tuff, scoria, glacier ice ... in
kit.PALETTE); stones are shaded round with crisp edges (kit.Builder.lump smooth).
  blender --background --factory-startup --python scripts/3d/models/props.py -- \
      --output-dir game/world/models/props [--only rock_0,rock_snow_2]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

# Many props share one screen and each is a few dozen pixels: small textures, few samples. 128
# pixels blurred the surface textures of the stones close up.
kit.TEXTURE_PIXELS = 256
kit.BAKE_SAMPLES = 12
# Props are a fraction of a cell: the surface textures repeat more often than on modules, so a
# boulder shows grain and cracks instead of a smooth gradient.
kit.SURFACE_REPEATS = 6.0
# Stones, lava rock, ice: round shading, edges sharper than this (degrees) stay crisp
# (kit.Builder.lump).
SMOOTH = 50.0

# How old and dirty the recipe makes them (kit.Builder wear).
STONE = 0.6
ICE = 0.12
INDUSTRY = 1.0

GLOW = "glow_orange"


# --- Stones --------------------------------------------------------------------------------------

def stone(name, shape, color, cap=None, scale=1.0, seed=0, rough=0.22):
    """Three stone shapes shared by the stone families (as in V1, one silhouette set in several
    colours): a boulder, a boulder with pebbles, a flat slab. *cap* lays moss or snow on top."""
    model = kit.Builder(name, wear=STONE)
    s = scale

    def boulder(x, y, size, seed_offset):
        z = size[2] * 0.36
        model.lump((x * s, y * s, z * s), [v * s for v in size], color, seed=seed + seed_offset, rough=rough,
                   detail=2, smooth=SMOOTH)
        if cap is not None:
            top = z + size[2] * 0.5
            model.lump((x * s, y * s, (top - size[2] * 0.14) * s),
                       (size[0] * 0.7 * s, size[1] * 0.7 * s, size[2] * 0.3 * s), cap,
                       seed=seed + seed_offset + 50, rough=0.15, smooth=70.0)

    def pebble(x, y, size, seed_offset):
        model.lump((x * s, y * s, size[2] * 0.25 * s), [v * s for v in size], color, seed=seed + seed_offset,
                   rough=0.2, smooth=SMOOTH)

    if shape == 0:
        boulder(0.0, 0.0, (0.21, 0.17, 0.15), 0)
    elif shape == 1:
        boulder(-0.02, 0.015, (0.16, 0.14, 0.13), 1)
        pebble(0.09, -0.05, (0.06, 0.05, 0.045), 2)
        pebble(0.06, 0.08, (0.05, 0.045, 0.04), 3)
    else:
        boulder(0.0, 0.0, (0.24, 0.16, 0.085), 4)
        pebble(-0.08, -0.07, (0.07, 0.06, 0.06), 5)
    return model.finish()


def lava_rock(name, shape):
    """Black, porous, sharp-edged chunks with glassy flakes (V1 lava_rock)."""
    model = kit.Builder(name, wear=STONE)
    if shape == 0:
        model.lump((0, 0, 0.07), (0.2, 0.17, 0.19), "obsidian", seed=11, rough=0.3, detail=2, smooth=SMOOTH)
    elif shape == 1:
        model.lump((-0.02, 0.01, 0.05), (0.16, 0.14, 0.15), "obsidian", seed=12, rough=0.32, detail=2,
                   smooth=SMOOTH)
        for index, (x, y) in enumerate(((0.09, -0.06), (0.11, 0.04), (-0.03, -0.1))):
            model.lump((x, y, 0.008), (0.045, 0.04, 0.035), "obsidian", seed=13 + index, rough=0.3, smooth=SMOOTH)
    else:
        model.lump((0, 0, 0.09), (0.15, 0.14, 0.24), "obsidian", seed=17, rough=0.28, detail=2, smooth=SMOOTH)
        model.lump((0.07, -0.05, 0.02), (0.07, 0.06, 0.07), "basalt", seed=18, rough=0.25, smooth=SMOOTH)
    return model.finish()


def basalt(name, shape):
    """Hexagonal basalt columns (V1 basalt_column)."""
    model = kit.Builder(name, wear=STONE)

    def column(x, y, height, radius=0.045):
        model.cylinder((x, y, 0.0), (x, y, height), radius, "basalt", segments=6)

    if shape == 0:
        column(0.0, 0.0, 0.30, 0.05)
        model.lump((0.07, -0.05, 0.005), (0.06, 0.05, 0.04), "stone_dark", seed=21, rough=0.25, smooth=SMOOTH)
        model.lump((-0.06, -0.06, 0.004), (0.05, 0.04, 0.035), "basalt", seed=22, rough=0.25, smooth=SMOOTH)
    elif shape == 1:
        column(-0.05, 0.03, 0.28)
        column(0.04, 0.035, 0.20)
        column(-0.005, -0.045, 0.14)
        column(0.08, -0.06, 0.08, 0.04)
    else:
        model.lump((-0.03, 0.02, 0.0), (0.1, 0.09, 0.05), "stone_dark", seed=23, rough=0.2, smooth=SMOOTH)
        with model.placed((-0.03, 0.02, 0.03), turn=0.5, tilt=0.35):
            model.cylinder((0, 0, 0), (0, 0, 0.24), 0.045, "basalt", segments=6)
        model.box((0.08, -0.07, 0.025), (0.12, 0.06, 0.05), "basalt", turn=0.4)
    return model.finish()


def ice_block(name, shape):
    """Seracs: blocks of pale ice with melted, rounded edges (V1 ice_block)."""
    model = kit.Builder(name, wear=ICE)
    if shape == 0:
        model.lump((0, 0, 0.09), (0.15, 0.13, 0.26), "ice", seed=31, rough=0.28, detail=2, smooth=SMOOTH)
        model.lump((0.03, -0.03, 0.05), (0.09, 0.08, 0.14), "ice_deep", seed=32, rough=0.25, smooth=SMOOTH)
    elif shape == 1:
        model.lump((-0.03, 0.02, 0.07), (0.14, 0.12, 0.2), "ice", seed=33, rough=0.28, detail=2, smooth=SMOOTH)
        model.lump((0.07, -0.04, 0.04), (0.1, 0.09, 0.13), "ice_deep", seed=34, rough=0.28, smooth=SMOOTH)
    else:
        model.lump((0, 0, 0.06), (0.2, 0.12, 0.17), "ice", seed=35, rough=0.3, detail=2, smooth=SMOOTH)
        model.lump((0.09, -0.07, 0.008), (0.04, 0.035, 0.03), "ice", seed=36, rough=0.3, smooth=SMOOTH)
        model.lump((-0.1, -0.05, 0.006), (0.035, 0.03, 0.025), "ice_deep", seed=37, rough=0.3, smooth=SMOOTH)
    return model.finish()


def sulfur_vent(name, shape):
    """A fumarole: an ash mound with a yellow sulfur rim and a glowing mouth (V1 sulfur_vent)."""
    model = kit.Builder(name, wear=STONE)

    def mound(x, y, height, radius, mouth):
        model.cylinder((x, y, 0.0), (x, y, height), radius, "ash_stone", segments=8, end_radius=mouth * 1.25)
        model.cylinder((x, y, height - 0.012), (x, y, height + 0.012), mouth * 1.35, "sulfur", segments=8,
                       end_radius=mouth)
        model.cylinder((x, y, height + 0.006), (x, y, height + 0.0125), mouth * 0.8, GLOW, segments=8)

    if shape == 0:
        mound(0.0, 0.0, 0.30, 0.17, 0.045)
        model.lump((0.1, -0.08, 0.004), (0.08, 0.06, 0.03), "sulfur", seed=41, rough=0.2, smooth=SMOOTH)
    elif shape == 1:
        mound(-0.04, 0.03, 0.28, 0.14, 0.04)
        mound(0.08, -0.06, 0.16, 0.1, 0.03)
    else:
        model.cylinder((0, 0, 0), (0, 0, 0.07), 0.19, "ash_stone", segments=8, end_radius=0.13)
        model.cylinder((0, 0, 0.06), (0, 0, 0.0715), 0.11, "dark", segments=8)
        model.cylinder((0, 0, 0.068), (0, 0, 0.0725), 0.06, GLOW, segments=8)
        for index in range(5):
            angle = index * 1.3
            model.lump((math.cos(angle) * 0.13, math.sin(angle) * 0.13, 0.05), (0.06, 0.05, 0.035), "sulfur",
                       seed=42 + index, rough=0.2, smooth=SMOOTH)
    return model.finish()


# --- Vent covers over underground hulls (V1 vent_*) ---------------------------------------------

def vent_fan(name):
    """A squat louvred box on a concrete plinth."""
    model = kit.Builder(name, wear=INDUSTRY)
    model.box((0, 0, 0.02), (0.26, 0.26, 0.04), "concrete")
    model.box((0, 0, 0.11), (0.18, 0.18, 0.14), "steel")
    for index in range(3):
        z = 0.07 + index * 0.035
        model.plate((0.0, -0.0906, z), (0.14, 0.014), "-y", "dark")
        model.plate((0.0906, 0.0, z), (0.14, 0.014), "+x", "dark")
    model.cylinder((0, 0, 0.18), (0, 0, 0.2), 0.06, "steel_dark", segments=10)
    model.plate((0, 0, 0.2006), (0.08, 0.08), "+z", "dark")
    return model.finish()


def vent_grate(name):
    """A wide, low hatch riser on a collar."""
    model = kit.Builder(name, wear=INDUSTRY)
    model.box((0, 0, 0.0175), (0.3, 0.3, 0.035), "concrete_dark")
    model.box((0, 0, 0.07), (0.2, 0.2, 0.07), "steel_dark")
    model.cylinder((0, 0, 0.105), (0, 0, 0.125), 0.055, "steel", segments=10)
    model.beam((-0.03, 0.0, 0.13), (0.03, 0.0, 0.13), 0.01, "yellow")
    model.plate((0.0, -0.1006, 0.07), (0.16, 0.02), "-y", "yellow")
    return model.finish()


def vent_pipe(name):
    """A bent pipe with a valve wheel on a base flange."""
    model = kit.Builder(name, wear=INDUSTRY)
    model.box((0, 0, 0.015), (0.16, 0.16, 0.03), "steel_dark")
    model.cylinder((0, 0, 0.03), (0, 0, 0.21), 0.035, "steel", segments=8)
    model.cylinder((0, 0.0, 0.21), (0, -0.09, 0.21), 0.035, "steel", segments=8)
    model.cylinder((0, -0.09, 0.21), (0, -0.105, 0.21), 0.045, "steel_dark", segments=8)
    model.cylinder((0.035, 0, 0.12), (0.06, 0, 0.12), 0.012, "steel_dark", segments=6)
    model.cylinder((0.06, 0, 0.12), (0.07, 0, 0.12), 0.045, "red", segments=10)
    return model.finish()


def vent_stack(name):
    """A tall, narrow exhaust stack with a mushroom cap."""
    model = kit.Builder(name, wear=INDUSTRY)
    model.box((0, 0, 0.015), (0.13, 0.13, 0.03), "steel_dark")
    model.cylinder((0, 0, 0.03), (0, 0, 0.36), 0.024, "steel_dark", segments=8)
    model.cylinder((0, 0, 0.2), (0, 0, 0.22), 0.03, "rust", segments=8)
    model.cylinder((0, 0, 0.36), (0, 0, 0.38), 0.075, "steel", segments=10, end_radius=0.02)
    return model.finish()


# --- The list ------------------------------------------------------------------------------------

STONES = {
    # family: (colour, cap, scale)
    "rock": ("stone", "moss", 1.0),
    "rock_arid": ("stone_dark", None, 1.0),
    "rock_sand": ("sandstone", None, 1.0),
    "rock_snow": ("stone", "snow", 1.0),
    "rock_ash": ("ash_stone", None, 1.0),
    "sulfur_chunk": ("sulfur", None, 0.85),
}


def _models() -> dict:
    one = (1, 1)
    models = {}
    for family, (color, cap, scale) in STONES.items():
        for shape in range(3):
            models["%s_%d" % (family, shape)] = (
                lambda f=family, s=shape, c=color, k=cap, z=scale: stone(
                    "te_prop_%s_%d" % (f, s), s, c, cap=k, scale=z, seed=s * 10), one)
    for shape in range(3):
        models["lava_rock_%d" % shape] = (lambda s=shape: lava_rock("te_prop_lava_rock_%d" % s, s), one)
        models["basalt_column_%d" % shape] = (lambda s=shape: basalt("te_prop_basalt_column_%d" % s, s), one)
        models["ice_block_%d" % shape] = (lambda s=shape: ice_block("te_prop_ice_block_%d" % s, s), one)
        models["sulfur_vent_%d" % shape] = (lambda s=shape: sulfur_vent("te_prop_sulfur_vent_%d" % s, s), one)
    models["vent_fan_0"] = (lambda: vent_fan("te_prop_vent_fan_0"), one)
    models["vent_grate_0"] = (lambda: vent_grate("te_prop_vent_grate_0"), one)
    models["vent_pipe_0"] = (lambda: vent_pipe("te_prop_vent_pipe_0"), one)
    models["vent_stack_0"] = (lambda: vent_stack("te_prop_vent_stack_0"), one)
    return models


MODELS = _models()

if __name__ == "__main__":
    kit.run_many_from_command_line(MODELS)
