"""Props on the surface as low-poly models: trees, palms, burnt trunks, stones, lava rock, basalt
columns, ice blocks, sulfur vents and the vent covers over underground hulls (after the V1 prop
sprites, src/assets/props in V1). Which cell carries which prop is decided by core/prop_rules.gd;
small and flat props (grass, bushes, reeds, puddles, craters, floes) stay sprites
(game/world/props). Writes <family>_<n>.glb for every variant; tree_leafy reuses five trees.

Sizes are in cells: a tree is about half a module high. Props appear by the thousands, so they
keep few triangles and small textures, and the recipe ages them gently (nature, not industry).
  blender --background --factory-startup --python scripts/3d/models/props.py -- \
      --output-dir game/world/models/props [--only tree_0,rock_snow_2]
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

# Many props share one screen and each is a few dozen pixels: small textures, few samples.
kit.TEXTURE_PIXELS = 128
kit.BAKE_SAMPLES = 12

# How old and dirty the recipe makes them (kit.Builder wear).
PLANT = 0.3
STONE = 0.6
ICE = 0.12
INDUSTRY = 1.0

GLOW = "glow_orange"


# --- Trees ---------------------------------------------------------------------------------------

def _trunk(model, top, radius, color="bark", bend=(0.0, 0.0), segments=5, base=0.0):
    """A tapering trunk from the ground to *top* (a height, or a point when bent)."""
    model.cylinder((0.0, 0.0, base), (bend[0], bend[1], top), radius, color, segments=segments,
                   end_radius=radius * 0.6)


def conifer(name, height, radius, tiers=3, leaf="leaf_dark"):
    """Stacked cones on a short trunk."""
    model = kit.Builder(name, wear=PLANT)
    trunk = height * 0.2
    _trunk(model, trunk + 0.03, radius * 0.16)
    span = height - trunk
    for tier in range(tiers):
        share = tier / tiers
        base = trunk + span * share * 0.72
        top = height if tier == tiers - 1 else base + span * 0.5
        model.cylinder((0.0, 0.0, base), (0.0, 0.0, top), radius * (1.0 - share * 0.5), leaf,
                       segments=6, end_radius=0.0)
    return model.finish()


def broadleaf(name, height, crown, leaf="leaf", second="leaf_dark", clumps=2, bend=0.0, seed=1):
    """A trunk with a faceted crown of one or more clumps."""
    model = kit.Builder(name, wear=PLANT)
    centre = height - crown[2] / 2.0
    if bend:
        # A bent trunk's tilted base would cut into the ground: it starts on a root collar.
        model.lump((0.0, 0.0, 0.0), (0.06, 0.06, 0.035), "bark", seed=seed, rough=0.15)
    _trunk(model, centre, 0.024, bend=(bend, 0.0), base=0.004 if bend else 0.0)
    model.lump((bend, 0.0, centre), crown, leaf, seed=seed, rough=0.18)
    generator = random.Random(seed)
    for clump in range(clumps - 1):
        angle = generator.uniform(0.0, math.tau)
        distance = crown[0] * 0.32
        model.lump((bend + math.cos(angle) * distance, math.sin(angle) * distance, centre - crown[2] * 0.22),
                   (crown[0] * 0.7, crown[1] * 0.7, crown[2] * 0.62),
                   second if clump % 2 == 0 else leaf, seed=seed + clump + 1, rough=0.2)
    return model.finish()


def dead_tree(name, height, seed=4):
    """A bare tree: a trunk and a few thin branches."""
    model = kit.Builder(name, wear=PLANT)
    model.cylinder((0.0, 0.0, 0.0), (0.0, 0.0, height * 0.72), 0.022, "bark", segments=5,
                   end_radius=0.012)
    generator = random.Random(seed)
    for branch in range(5):
        z = height * (0.32 + 0.09 * branch)
        angle = branch * 2.4 + generator.uniform(-0.3, 0.3)
        length = 0.09 + generator.uniform(0.0, 0.05)
        end = (math.cos(angle) * length, math.sin(angle) * length, min(height, z + 0.08 + length * 0.6))
        model.cylinder((0.0, 0.0, z), end, 0.010, "bark", segments=3, end_radius=0.003)
    return model.finish()


def palm(name, height, lean=0.06, fronds=7, seed=2):
    """A bent trunk in three pieces and a crown of drooping fronds."""
    model = kit.Builder(name, wear=PLANT)
    # The bent trunk starts a little above the ground (its tilted base would cut into it) on a
    # root collar.
    points = [(lean * (step / 3.0) ** 2, 0.0, 0.004 + (height - 0.004) * step / 3.0) for step in range(4)]
    model.lump((0.0, 0.0, 0.0), (0.06, 0.06, 0.04), "bark", seed=seed, rough=0.15)
    for step in range(3):
        model.cylinder(points[step], points[step + 1], 0.022 - 0.003 * step, "bark_light", segments=5)
    top = points[3]
    generator = random.Random(seed)
    for frond in range(fronds):
        turn = math.tau * frond / fronds + generator.uniform(-0.2, 0.2)
        inner, outer = 0.09, 0.12
        # Rising near the crown, then arching down: wide enough to read from above.
        with model.placed(top, turn=turn, tilt=-0.3):
            model.plate((0.0, -inner / 2.0, 0.0), (0.062, inner), "+z", "leaf_palm")
            with model.placed((0.0, -inner, 0.0), tilt=0.55 + generator.uniform(0.0, 0.25)):
                model.plate((0.0, -outer / 2.0, 0.0), (0.05, outer), "+z", "leaf_palm")
    model.lump((top[0], 0.0, top[2] - 0.015), (0.05, 0.05, 0.04), "bark", seed=seed, rough=0.1)
    return model.finish()


def charred(name, shape, ember=False):
    """Burnt trees (V1 charred_tree): three standing trunks, a hollow stump and a snapped,
    leaning trunk; *ember* adds glowing cracks (V1 charred_tree_ember, same silhouettes)."""
    model = kit.Builder(name, wear=PLANT)

    def crack(base, top, radius, angle):
        if ember:
            point = (math.cos(angle) * radius, math.sin(angle) * radius)
            model.beam((point[0], point[1], base), (point[0] * 0.8, point[1] * 0.8, top), 0.009, GLOW)

    if shape == 0:  # thick, two branches
        model.cylinder((0, 0, 0), (0, 0, 0.26), 0.032, "charcoal", segments=6, end_radius=0.018)
        model.cylinder((0, 0, 0.15), (0.07, -0.02, 0.24), 0.012, "charcoal", segments=3, end_radius=0.004)
        model.cylinder((0, 0, 0.11), (-0.05, 0.03, 0.19), 0.011, "charcoal", segments=3, end_radius=0.004)
        crack(0.03, 0.14, 0.031, -1.2)
        crack(0.08, 0.19, 0.027, -0.4)
    elif shape == 1:  # slim
        model.lump((0, 0, 0.0), (0.06, 0.05, 0.04), "charcoal", seed=8, rough=0.15)
        model.cylinder((0, 0, 0.003), (0.01, 0, 0.24), 0.022, "charcoal", segments=5, end_radius=0.012)
        model.cylinder((0.004, 0, 0.14), (-0.05, -0.02, 0.21), 0.009, "charcoal", segments=3, end_radius=0.003)
        crack(0.04, 0.15, 0.021, -0.8)
    elif shape == 2:  # forked double stem
        model.lump((0, 0, 0.0), (0.08, 0.07, 0.05), "charcoal", seed=7, rough=0.15)
        model.cylinder((0, 0, 0.01), (-0.05, 0.0, 0.25), 0.02, "charcoal", segments=5, end_radius=0.011)
        model.cylinder((0, 0, 0.01), (0.05, -0.01, 0.23), 0.02, "charcoal", segments=5, end_radius=0.011)
        crack(0.02, 0.12, 0.024, -1.0)
    elif shape == 3:  # wide hollow stump
        model.cylinder((0, 0, 0), (0, 0, 0.055), 0.075, "charcoal", segments=8, end_radius=0.062)
        model.cylinder((0, 0, 0.05), (0, 0, 0.0565), 0.045, GLOW if ember else "dark", segments=8)
        crack(0.005, 0.045, 0.074, -1.1)
    else:  # snapped trunk leaning on a root collar
        model.lump((0, 0, 0.0), (0.09, 0.08, 0.05), "charcoal", seed=9, rough=0.15)
        with model.placed((0.0, 0.0, 0.02), turn=0.6, tilt=-0.65):
            model.cylinder((0, 0, 0), (0, 0, 0.17), 0.03, "charcoal", segments=6, end_radius=0.026)
            if ember:
                model.cylinder((0, 0, 0.168), (0, 0, 0.172), 0.018, GLOW, segments=6)
                model.beam((0.0, -0.029, 0.03), (0.0, -0.025, 0.14), 0.009, GLOW)
    return model.finish()


# --- Stones --------------------------------------------------------------------------------------

def stone(name, shape, color, cap=None, scale=1.0, seed=0, rough=0.22):
    """Three stone shapes shared by the stone families (as in V1, one silhouette set in several
    colours): a boulder, a boulder with pebbles, a flat slab. *cap* lays moss or snow on top."""
    model = kit.Builder(name, wear=STONE)
    s = scale

    def boulder(x, y, size, seed_offset):
        z = size[2] * 0.36
        model.lump((x * s, y * s, z * s), [v * s for v in size], color, seed=seed + seed_offset, rough=rough)
        if cap is not None:
            top = z + size[2] * 0.5
            model.lump((x * s, y * s, (top - size[2] * 0.14) * s),
                       (size[0] * 0.7 * s, size[1] * 0.7 * s, size[2] * 0.3 * s), cap,
                       seed=seed + seed_offset + 50, rough=0.15)

    if shape == 0:
        boulder(0.0, 0.0, (0.21, 0.17, 0.15), 0)
    elif shape == 1:
        boulder(-0.02, 0.015, (0.16, 0.14, 0.13), 1)
        model.lump((0.09 * s, -0.05 * s, 0.012 * s), (0.06 * s, 0.05 * s, 0.045 * s), color, seed=seed + 2, rough=0.2)
        model.lump((0.06 * s, 0.08 * s, 0.01 * s), (0.05 * s, 0.045 * s, 0.04 * s), color, seed=seed + 3, rough=0.2)
    else:
        boulder(0.0, 0.0, (0.24, 0.16, 0.085), 4)
        model.lump((-0.08 * s, -0.07 * s, 0.015 * s), (0.07 * s, 0.06 * s, 0.06 * s), color, seed=seed + 5, rough=0.2)
    return model.finish()


def lava_rock(name, shape):
    """Black, glossy, sharp-edged chunks (V1 lava_rock)."""
    model = kit.Builder(name, wear=STONE)
    if shape == 0:
        model.lump((0, 0, 0.07), (0.2, 0.17, 0.19), "obsidian", seed=11, rough=0.3)
    elif shape == 1:
        model.lump((-0.02, 0.01, 0.05), (0.16, 0.14, 0.15), "obsidian", seed=12, rough=0.32)
        for index, (x, y) in enumerate(((0.09, -0.06), (0.11, 0.04), (-0.03, -0.1))):
            model.lump((x, y, 0.008), (0.045, 0.04, 0.035), "obsidian", seed=13 + index, rough=0.3)
    else:
        model.lump((0, 0, 0.09), (0.15, 0.14, 0.24), "obsidian", seed=17, rough=0.28)
        model.lump((0.07, -0.05, 0.02), (0.07, 0.06, 0.07), "basalt", seed=18, rough=0.25)
    return model.finish()


def basalt(name, shape):
    """Hexagonal basalt columns (V1 basalt_column)."""
    model = kit.Builder(name, wear=STONE)

    def column(x, y, height, radius=0.045):
        model.cylinder((x, y, 0.0), (x, y, height), radius, "basalt", segments=6)

    if shape == 0:
        column(0.0, 0.0, 0.30, 0.05)
        model.lump((0.07, -0.05, 0.005), (0.06, 0.05, 0.04), "stone_dark", seed=21, rough=0.25)
        model.lump((-0.06, -0.06, 0.004), (0.05, 0.04, 0.035), "basalt", seed=22, rough=0.25)
    elif shape == 1:
        column(-0.05, 0.03, 0.28)
        column(0.04, 0.035, 0.20)
        column(-0.005, -0.045, 0.14)
        column(0.08, -0.06, 0.08, 0.04)
    else:
        model.lump((-0.03, 0.02, 0.0), (0.1, 0.09, 0.05), "stone_dark", seed=23, rough=0.2)
        with model.placed((-0.03, 0.02, 0.03), turn=0.5, tilt=0.35):
            model.cylinder((0, 0, 0), (0, 0, 0.24), 0.045, "basalt", segments=6)
        model.box((0.08, -0.07, 0.025), (0.12, 0.06, 0.05), "basalt", turn=0.4)
    return model.finish()


def ice_block(name, shape):
    """SÃ©racs: faceted blocks of pale ice (V1 ice_block)."""
    model = kit.Builder(name, wear=ICE)
    if shape == 0:
        model.lump((0, 0, 0.09), (0.15, 0.13, 0.26), "ice", seed=31, rough=0.28)
        model.lump((0.03, -0.03, 0.05), (0.09, 0.08, 0.14), "ice_deep", seed=32, rough=0.25)
    elif shape == 1:
        model.lump((-0.03, 0.02, 0.07), (0.14, 0.12, 0.2), "ice", seed=33, rough=0.28)
        model.lump((0.07, -0.04, 0.04), (0.1, 0.09, 0.13), "ice_deep", seed=34, rough=0.28)
    else:
        model.lump((0, 0, 0.06), (0.2, 0.12, 0.17), "ice", seed=35, rough=0.3)
        model.lump((0.09, -0.07, 0.008), (0.04, 0.035, 0.03), "ice", seed=36, rough=0.3)
        model.lump((-0.1, -0.05, 0.006), (0.035, 0.03, 0.025), "ice_deep", seed=37, rough=0.3)
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
        model.lump((0.1, -0.08, 0.004), (0.08, 0.06, 0.03), "sulfur", seed=41, rough=0.2)
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
                       seed=42 + index, rough=0.2)
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
    models = {
        "tree_0": (lambda: conifer("te_prop_tree_0", 0.55, 0.11, tiers=3), one),
        "tree_1": (lambda: broadleaf("te_prop_tree_1", 0.46, (0.26, 0.24, 0.25), clumps=3, seed=1), one),
        "tree_2": (lambda: broadleaf("te_prop_tree_2", 0.38, (0.2, 0.19, 0.2), leaf="leaf_yellow",
                                     second="leaf", clumps=1, seed=2), one),
        "tree_3": (lambda: broadleaf("te_prop_tree_3", 0.44, (0.23, 0.21, 0.21), clumps=2, bend=0.04, seed=3), one),
        "tree_4": (lambda: dead_tree("te_prop_tree_4", 0.42), one),
        "tree_5": (lambda: broadleaf("te_prop_tree_5", 0.42, (0.15, 0.15, 0.27), leaf="leaf_yellow",
                                     second="leaf_yellow", clumps=1, seed=5), one),
        "tree_6": (lambda: conifer("te_prop_tree_6", 0.5, 0.1, tiers=4), one),
        "tree_7": (lambda: broadleaf("te_prop_tree_7", 0.5, (0.29, 0.27, 0.27), clumps=3, seed=7), one),
        "palm_0": (lambda: palm("te_prop_palm_0", 0.5, lean=0.07, seed=2), one),
        "palm_1": (lambda: palm("te_prop_palm_1", 0.44, lean=0.02, fronds=6, seed=3), one),
        "palm_2": (lambda: palm("te_prop_palm_2", 0.52, lean=0.1, fronds=8, seed=4), one),
        "palm_3": (lambda: palm("te_prop_palm_3", 0.36, lean=0.04, fronds=6, seed=5), one),
    }
    for shape in range(5):
        models["charred_tree_%d" % shape] = (lambda s=shape: charred("te_prop_charred_tree_%d" % s, s), one)
        models["charred_tree_ember_%d" % shape] = (
            lambda s=shape: charred("te_prop_charred_tree_ember_%d" % s, s, ember=True), one)
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
