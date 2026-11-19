"""The goods of the game as small low-poly models: every NATURAL and PRODUCED resource of
/v2/definitions (plus the coming PROBE). They are screenshotted into the icons of the game
(smoke/resource_icons.tscn -> game/ui/resource_icons) and may later turn on a details page.

Families share one builder each, so a family looks alike and only its colours and fittings
change: an ore pile (raw ores, one stone colour and one glint each), a crystal cluster, gas
bottles with a colour per gas, a stack of plates with a coloured tag per metal, circuit boards,
a robot whose build grows with its tier, and single pieces for the rest.

Every model stands on the ground (z = 0) centred on the origin, so it can turn around its own
up axis; it is built to look right from all sides, its best side towards the game camera (-Y
and +X). Sizes are in cells (about half a cell each); the icon renderer fits them by their
bounding box. Readable at 48 px: a strong silhouette, one colour identity, no fine detail.
Goods are cleaner than industry (low wear); ores are stone (STONE wear) like the props.
Writes <key_lower>.glb.
  blender --background --factory-startup --python scripts/3d/models/resources.py -- \
      --output-dir game/world/models/resources [--only iron,robot_t3]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

# Shown as icons of 128 px at most: small textures and few samples are enough.
kit.TEXTURE_PIXELS = 256
kit.BAKE_SAMPLES = 12
# Goods are a fraction of a cell: textures repeat more often than on modules.
kit.SURFACE_REPEATS = 5.0
SMOOTH = 50.0

STONE = 0.6
GOODS = 0.25
CLEAN = 0.1


# --- Ores and crystals ---------------------------------------------------------------------------

# Chunks around the foot of a pile: (angle in degrees, distance, size).
_CHUNKS = ((-100, 0.25, 0.10), (-55, 0.27, 0.08), (-20, 0.24, 0.11), (20, 0.26, 0.07),
           (70, 0.25, 0.09), (130, 0.24, 0.10), (180, 0.26, 0.08), (230, 0.25, 0.09))
# Glints on the surface of a pile, most of them on the sides the camera sees: (x, y, z, size).
_GLINTS = ((0.10, -0.15, 0.13, 0.095), (-0.10, -0.16, 0.08, 0.08), (0.17, 0.01, 0.14, 0.085),
           (0.01, -0.06, 0.29, 0.09), (0.23, -0.13, 0.03, 0.07), (-0.17, 0.07, 0.13, 0.08),
           (0.03, 0.16, 0.16, 0.08), (-0.04, -0.24, 0.025, 0.065))


def _crystal(model, base, length, radius, color, turn=0.0, tilt=0.0, tip=0.4):
    """A six-sided crystal standing at *base*, leaning by *tilt* towards *turn*: a prism with a
    pointed tip *tip* of its length long."""
    with model.placed(base, turn=turn, tilt=tilt):
        model.cylinder((0, 0, -radius * 0.5), (0, 0, length * (1.0 - tip)), radius, color, segments=6)
        model.cylinder((0, 0, length * (1.0 - tip)), (0, 0, length), radius, color, segments=6, end_radius=0.0)


def ore_pile(name, stone, glints, glint_kind="nugget", seed=0, glint_count=6, extra=None):
    """A heap of ore: a mound, a cap, loose chunks around its foot, and glints in a second colour
    on the camera side. *glints* is one colour or a list cycled through; *glint_kind*: "nugget"
    (round lumps), "crystal" (small pointed crystals) or "vein" (flat flakes in the surface)."""
    model = kit.Builder(name, wear=STONE)
    colors = glints if isinstance(glints, (list, tuple)) else [glints]
    model.lump((0, 0, 0.04), (0.52, 0.46, 0.40), stone, seed=seed, rough=0.2, detail=2, smooth=SMOOTH)
    model.lump((0.02, 0.01, 0.20), (0.30, 0.27, 0.26), stone, seed=seed + 1, rough=0.25, detail=1, smooth=SMOOTH)
    for index, (angle, distance, size) in enumerate(_CHUNKS):
        x = math.cos(math.radians(angle)) * distance
        y = math.sin(math.radians(angle)) * distance
        model.lump((x, y, size * 0.3), (size, size * 0.85, size * 0.8), stone, seed=seed + 10 + index,
                   rough=0.3, smooth=SMOOTH)
    for index, (x, y, z, size) in enumerate(_GLINTS[:glint_count]):
        color = colors[index % len(colors)]
        if glint_kind == "crystal":
            angle = math.atan2(y, x)
            _crystal(model, (x, y, z), size * 1.6, size * 0.32, color, turn=angle + math.pi / 2.0, tilt=-0.5)
        elif glint_kind == "vein":
            model.lump((x * 1.04, y * 1.04, z), (size * 1.1, size * 1.1, size * 0.55), color, seed=seed + 40 + index,
                       rough=0.25, smooth=SMOOTH)
        else:
            model.lump((x, y, z), (size, size * 0.9, size * 0.8), color, seed=seed + 40 + index, rough=0.25,
                       smooth=SMOOTH)
    if extra is not None:
        extra(model)
    return model.finish()


def crystal_cluster(name, color, second, stone="ore_pale"):
    """Silicon: a cluster of clear quartz crystals growing out of a stone."""
    model = kit.Builder(name, wear=STONE)
    model.lump((0, 0, 0.03), (0.44, 0.38, 0.16), stone, seed=3, rough=0.2, detail=2, smooth=SMOOTH)
    model.lump((0.17, -0.12, 0.01), (0.12, 0.10, 0.08), stone, seed=4, rough=0.3, smooth=SMOOTH)
    # (x, y, length, radius, lean towards, lean, colour)
    for x, y, length, radius, toward, lean, tone in (
            (0.0, 0.02, 0.50, 0.07, 0.0, 0.0, color),
            (-0.10, 0.06, 0.36, 0.055, 2.4, 0.45, color),
            (0.09, 0.05, 0.38, 0.06, 0.8, 0.40, second),
            (0.06, -0.08, 0.28, 0.05, -0.6, 0.55, color),
            (-0.08, -0.07, 0.30, 0.05, -2.2, 0.5, second),
            (0.15, -0.02, 0.20, 0.04, 0.2, 0.75, color),
            (-0.15, -0.01, 0.20, 0.04, 3.2, 0.7, color)):
        _crystal(model, (x, y, 0.06), length, radius, tone, turn=toward + math.pi / 2.0, tilt=-lean, tip=0.3)
    return model.finish()


def _uranium_extra(model):
    """A few chunks of yellowcake around the foot of the glowing pile."""
    for index, (x, y, size) in enumerate(((0.21, -0.20, 0.08), (-0.05, -0.27, 0.07), (0.27, 0.02, 0.06))):
        model.lump((x, y, size * 0.3), (size, size * 0.9, size * 0.8), "yellowcake", seed=70 + index, rough=0.3,
                   smooth=SMOOTH)


def null_g(name):
    """Null-g material: a violet crystal floating above a dark pad with a glowing ring."""
    model = kit.Builder(name, wear=CLEAN)
    model.cylinder((0, 0, 0), (0, 0, 0.04), 0.24, "black_metal", segments=6, end_radius=0.21)
    model.cylinder((0, 0, 0.04), (0, 0, 0.05), 0.15, "glow_cyan", segments=12)
    model.cylinder((0, 0, 0.05), (0, 0, 0.056), 0.10, "black_metal", segments=12)
    # The crystal: a long double point, a little tilted, hovering.
    with model.placed((0.0, 0.0, 0.34), turn=0.4, tilt=0.18):
        model.cylinder((0, 0, -0.04), (0, 0, 0.08), 0.09, "glow_purple", segments=6)
        model.cylinder((0, 0, 0.08), (0, 0, 0.26), 0.09, "glow_purple", segments=6, end_radius=0.0)
        model.cylinder((0, 0, -0.04), (0, 0, -0.20), 0.09, "null_crystal", segments=6, end_radius=0.0)
    # Two small shards orbiting it.
    _crystal(model, (0.17, -0.10, 0.20), 0.10, 0.03, "null_crystal", turn=1.0, tilt=0.8, tip=0.5)
    _crystal(model, (-0.16, 0.05, 0.40), 0.09, 0.028, "glow_purple", turn=-2.0, tilt=0.9, tip=0.5)
    return model.finish()


# --- Gases, fluids --------------------------------------------------------------------------------

def _bottle(model, x, y, radius, height, body, shoulder, band=None):
    """An upright gas bottle: rounded shoulder in its own colour, neck, valve and a cap ring."""
    profile = [(0.0, 0.0), (radius * 0.92, 0.0), (radius, radius * 0.12), (radius, height * 0.72, shoulder),
               (radius * 0.92, height * 0.82, shoulder), (radius * 0.62, height * 0.90, shoulder),
               (radius * 0.28, height * 0.94, shoulder), (radius * 0.28, height * 0.96), (0.0, height * 0.96)]
    model.revolve((x, y, 0.0), profile, body, segments=14)
    if band:
        model.cylinder((x, y, height * 0.40), (x, y, height * 0.48), radius * 1.02, band, segments=14)
    model.cylinder((x, y, height * 0.96), (x, y, height * 1.02), radius * 0.2, "brass", segments=8)
    model.cylinder((x, y, height * 1.02), (x, y, height * 1.05), radius * 0.42, "steel_dark", segments=8)
    model.beam((x - radius * 0.2, y - radius * 0.05, height * 0.99), (x - radius * 0.2, y - radius * 0.42, height * 0.99),
               radius * 0.14, "brass")


def gas(name, body, shoulder, band=None):
    """Two gas bottles of one gas side by side as the camera sees them (it looks along +x-y): a
    tall one on the left, a shorter one a little in front on the right, on a pallet."""
    model = kit.Builder(name, wear=GOODS)
    _bottle(model, -0.12, -0.08, 0.12, 0.60, body, shoulder, band)
    _bottle(model, 0.12, 0.06, 0.12, 0.48, body, shoulder, band)
    model.box((0.0, -0.01, 0.025), (0.56, 0.30, 0.05), "steel_dark", turn=math.pi / 4.0)
    return model.finish()


def helium3(name):
    """Helium-3: a white fusion-grade pressure sphere on a ring stand with a glowing band."""
    model = kit.Builder(name, wear=CLEAN)
    radius = 0.21
    middle = 0.27
    profile = [(radius * math.sin(math.radians(angle)), -radius * math.cos(math.radians(angle)))
               for angle in range(0, 181, 20)]
    model.revolve((0, 0, middle), profile, "white", segments=16)
    model.cylinder((0, 0, middle - 0.018), (0, 0, middle + 0.018), radius * 1.03, "glow_cyan", segments=16)
    model.cylinder((0, 0, 0), (0, 0, 0.05), 0.17, "steel_dark", segments=12, end_radius=0.13)
    model.cylinder((0, 0, 0.05), (0, 0, middle - radius + 0.02), 0.08, "steel", segments=10)
    model.cylinder((0, 0, middle + radius - 0.01), (0, 0, middle + radius + 0.04), 0.035, "brass", segments=8)
    model.cylinder((0, 0, middle + radius + 0.04), (0, 0, middle + radius + 0.06), 0.06, "steel_dark", segments=8)
    return model.finish()


def dewar(name):
    """Cryogenic fluids: a squat steel dewar with a frosted neck, blue band and cold vapour."""
    model = kit.Builder(name, wear=GOODS)
    radius, height = 0.20, 0.36
    profile = [(0.0, 0.0), (radius * 0.9, 0.0), (radius, 0.03), (radius, height * 0.78),
               (radius * 0.86, height * 0.92), (radius * 0.5, height, "frost"), (radius * 0.32, height + 0.01, "frost"),
               (radius * 0.32, height + 0.06), (0.0, height + 0.06)]
    model.revolve((0, 0, 0), profile, "steel_light", segments=16)
    model.cylinder((0, 0, height * 0.52), (0, 0, height * 0.62), radius * 1.02, "glow_blue", segments=16)
    model.cylinder((0, 0, height + 0.06), (0, 0, height + 0.09), 0.085, "steel_dark", segments=10)
    for side in (-1, 1):
        model.beam((side * radius * 0.72, 0, height * 0.88), (side * radius * 0.72, 0, height + 0.07), 0.02, "steel_dark")
    model.beam((-radius * 0.72, 0, height + 0.07), (radius * 0.72, 0, height + 0.07), 0.02, "steel_dark")
    # Frost on the shoulder and a puff of cold vapour.
    for index, (x, y, z, size) in enumerate(((0.06, -0.11, height * 0.92, 0.08), (-0.10, -0.06, height * 0.9, 0.07),
                                             (0.12, 0.05, height * 0.9, 0.06), (0.03, -0.05, height + 0.13, 0.09),
                                             (-0.05, 0.03, height + 0.18, 0.07))):
        model.lump((x, y, z), (size, size, size * 0.7), "frost", seed=80 + index, rough=0.25, smooth=70.0)
    return model.finish()


def water(name):
    """Water: a ribbed blue barrel with a white cap and a big water drop in front of it."""
    model = kit.Builder(name, wear=GOODS)
    radius, height = 0.17, 0.48
    profile = [(0.0, 0.0), (radius * 0.9, 0.0), (radius, 0.03)]
    for rib in (0.16, 0.32):
        profile += [(radius, height * rib - 0.02), (radius * 1.06, height * rib), (radius, height * rib + 0.02)]
    profile += [(radius, height - 0.03), (radius * 0.9, height), (0.0, height)]
    x, y = -0.10, -0.04
    model.revolve((x, y, 0.0), profile, "water_blue", segments=16)
    model.cylinder((x + 0.07, y - 0.04, height), (x + 0.07, y - 0.04, height + 0.03), 0.035, "plastic_white",
                   segments=8)
    # A drop on the right as the camera sees it: round below, drawn out to a point above.
    drop = 0.12
    profile = [(0.0, 0.0)]
    for angle in range(15, 121, 15):
        rad = math.radians(angle)
        profile.append((drop * math.sin(rad), drop * (1.0 - math.cos(rad))))
    profile += [(drop * 0.58, drop * 1.75), (drop * 0.26, drop * 2.2), (0.0, drop * 2.5)]
    model.revolve((0.16, 0.0, 0.0), profile, "water_blue", segments=14, sharp=70.0)
    return model.finish()


# --- Metals and materials -----------------------------------------------------------------------

def plates(name, metal, tag, count=4):
    """A stack of metal plates on two bearers, a coloured tag on the front of the top plate."""
    model = kit.Builder(name, wear=GOODS)
    for side in (-0.13, 0.13):
        model.box((side, 0, 0.02), (0.05, 0.40, 0.04), "wood")
    z = 0.04
    for index in range(count):
        turn = (-0.06, 0.04, -0.02, 0.07, 0.0)[index % 5]
        model.box((0.0, 0.0, z + 0.02), (0.50, 0.36, 0.04), metal, turn=turn)
        z += 0.042
    model.plate((0.08, -0.1806, z - 0.022), (0.10, 0.028), "-y", tag)
    model.plate((0.2506, -0.05, z - 0.022), (0.08, 0.028), "+x", tag)
    for x in (-0.13, 0.13):
        model.box((x, 0, z / 2.0 + 0.01), (0.03, 0.372, z + 0.02), "steel_dark")
    return model.finish()


def wire_spool(name):
    """Copper wire: a spool lying on its side, wound with copper, a loose end hanging down."""
    model = kit.Builder(name, wear=GOODS)
    radius = 0.22
    z = radius
    model.cylinder((-0.20, 0, z), (-0.17, 0, z), radius, "black_metal", segments=16)
    model.cylinder((0.17, 0, z), (0.20, 0, z), radius, "black_metal", segments=16)
    model.cylinder((-0.17, 0, z), (0.17, 0, z), radius * 0.78, "copper", segments=16)
    model.cylinder((-0.21, 0, z), (0.21, 0, z), 0.04, "steel_light", segments=8)
    for index in range(4):
        x = -0.12 + index * 0.08
        model.cylinder((x, 0, z), (x + 0.012, 0, z), radius * 0.785, "brass", segments=16)
    model.beam((0.08, -radius * 0.74, z + 0.02), (0.14, -radius * 0.9, 0.012), 0.016, "copper")
    model.beam((0.14, -radius * 0.9, 0.012), (0.24, -0.28, 0.012), 0.016, "copper")
    return model.finish()


def carbon_roll(name):
    """Carbon fibre: a black glossy roll on its side, a length of it unrolled in front."""
    model = kit.Builder(name, wear=GOODS)
    radius = 0.13
    z = radius * 1.01
    model.cylinder((-0.22, 0.05, z), (0.22, 0.05, z), radius, "carbon_weave", segments=16)
    model.cylinder((-0.25, 0.05, z), (0.25, 0.05, z), 0.04, "steel_light", segments=8)
    for x in (-0.12, 0.12):
        model.cylinder((x, 0.05, z), (x + 0.025, 0.05, z), radius * 1.01, "white", segments=16)
    # The unrolled sheet in front, with a slight wave.
    model.box((0, -0.12, 0.006), (0.44, 0.22, 0.012), "carbon_weave")
    model.box((0, -0.24, 0.012), (0.44, 0.05, 0.024), "carbon_weave")
    for x in (-0.12, 0.12):
        model.box((x + 0.0125, -0.13, 0.0125), (0.025, 0.2, 0.001), "white")
    return model.finish()


def glass(name):
    """Glass: three panes standing in an A-frame rack."""
    model = kit.Builder(name, wear=GOODS)
    model.box((0, 0, 0.02), (0.50, 0.30, 0.04), "steel_dark")
    for side in (-1, 1):
        model.beam((side * 0.22, -0.12, 0.04), (side * 0.22, 0.0, 0.42), 0.025, "steel_dark")
        model.beam((side * 0.22, 0.12, 0.04), (side * 0.22, 0.0, 0.42), 0.025, "steel_dark")
    model.beam((-0.24, 0.0, 0.42), (0.24, 0.0, 0.42), 0.025, "steel_dark")
    for index, y in enumerate((-0.03, -0.065, -0.10)):
        with model.placed((0.0, y, 0.05), tilt=0.30):
            model.box((0, 0, 0.17), (0.40 - index * 0.04, 0.012, 0.34 - index * 0.05), "glass")
            model.box((0, -0.007, 0.17 + 0.07), (0.30 - index * 0.04, 0.002, 0.018), "white")
    return model.finish()


def plastic(name):
    """Plastic: a white sack of granulate with a blue band, blue pellets spilled in front."""
    model = kit.Builder(name, wear=GOODS)
    model.lump((0.0, 0.06, 0.0), (0.34, 0.24, 0.56), "plastic_white", seed=5, rough=0.06, detail=2, smooth=70.0)
    model.cylinder((0.0, 0.06, 0.25), (0.0, 0.06, 0.32), 0.045, "plastic_white", segments=8, end_radius=0.07)
    model.cylinder((0.0, 0.06, 0.235), (0.0, 0.06, 0.255), 0.05, "steel_dark", segments=8)
    model.plate((0.0, -0.0705, 0.12), (0.22, 0.07), "-y", "pellet")
    for index in range(14):
        angle = index * 2.4
        distance = 0.06 + (index % 5) * 0.025
        x = 0.06 + math.cos(angle) * distance
        y = -0.15 + math.sin(angle) * distance * 0.7
        model.lump((x, y, 0.012 + (0.02 if index < 4 else 0.0)), (0.035, 0.035, 0.03), "pellet", seed=90 + index,
                   rough=0.1, smooth=70.0)
    model.lump((0.06, -0.15, 0.0), (0.16, 0.12, 0.08), "pellet", seed=88, rough=0.15, smooth=70.0)
    return model.finish()


# --- Electronics ----------------------------------------------------------------------------------

def _board(model, board, chips):
    """A circuit board leaning back on a foot; *chips* adds what sits on its front (-y) face,
    in the board's own frame: x across, z up the board, the face at y = -0.011."""
    model.box((0, 0.04, 0.015), (0.44, 0.20, 0.03), "steel_dark")
    with model.placed((0.0, 0.0, 0.03), tilt=-0.42):
        model.box((0, 0, 0.19), (0.44, 0.022, 0.36), board)
        model.box((0, 0, 0.01), (0.36, 0.024, 0.03), "gold")
        chips(model)


def _electronics_chips(model):
    model.box((-0.06, -0.022, 0.20), (0.13, 0.024, 0.13), "black_metal")
    model.plate((-0.06, -0.0346, 0.20), (0.05, 0.05), "-y", "steel_light")
    model.box((0.12, -0.02, 0.25), (0.08, 0.02, 0.06), "black_metal")
    model.box((0.12, -0.02, 0.13), (0.08, 0.02, 0.06), "black_metal")
    for x in (-0.16, -0.13):
        model.cylinder((x, -0.011, 0.30), (x, -0.05, 0.30), 0.016, "blue_paint", segments=8)
    for z in (0.08, 0.31):
        model.plate((0.02, -0.0116, z), (0.30, 0.008), "-y", "gold")
    model.plate((-0.06, -0.0116, 0.105), (0.008, 0.06), "-y", "gold")


def electronics(name):
    """Electronics: a green circuit board with chips, capacitors and gold contacts."""
    model = kit.Builder(name, wear=GOODS)
    _board(model, "pcb_green", _electronics_chips)
    return model.finish()


def _advanced_chips(model):
    model.box((-0.05, -0.02, 0.20), (0.18, 0.02, 0.18), "gold")
    # A heat sink with fins on the processor.
    for index in range(5):
        x = -0.13 + index * 0.04
        model.box((x, -0.055, 0.20), (0.018, 0.05, 0.16), "steel_light")
    for index in range(4):
        model.box((0.14, -0.02, 0.10 + index * 0.06), (0.07, 0.02, 0.04), "black_metal")
    for index in range(4):
        model.plate((-0.17 + index * 0.05, -0.0116, 0.33), (0.025, 0.014), "-y", "glow_cyan")


def advanced_electronics(name):
    """Advanced electronics: a blue board with a gold processor under a heat sink, memory chips
    and glowing status lights."""
    model = kit.Builder(name, wear=CLEAN)
    _board(model, "pcb_blue", _advanced_chips)
    return model.finish()


def silicon_wafer(name):
    """Silicon wafers: shining discs patterned with dies, standing in a slotted holder."""
    model = kit.Builder(name, wear=CLEAN)
    model.box((0, 0.02, 0.025), (0.46, 0.24, 0.05), "white")
    radius = 0.22
    for index, y in enumerate((0.08, 0.02, -0.04)):
        z = radius + 0.03
        model.cylinder((0, y + 0.006, z), (0, y - 0.006, z), radius, "wafer", segments=20)
        if index == 2:
            step = 0.06
            for column in range(-3, 4):
                for row in range(-3, 4):
                    cx, cz = column * step, row * step
                    if math.hypot(abs(cx) + step * 0.5, abs(cz) + step * 0.5) < radius * 0.98:
                        model.plate((cx, y - 0.0066, z + cz), (step * 0.82, step * 0.82), "-y", "wafer_die")
    model.box((0, -0.075, 0.06), (0.46, 0.03, 0.04), "white")
    return model.finish()


def sensor_array(name):
    """Sensor array: a white dish and a flat antenna panel on a small mount."""
    model = kit.Builder(name, wear=CLEAN)
    model.box((0, 0, 0.03), (0.30, 0.30, 0.06), "steel_dark")
    model.cylinder((0, 0.02, 0.06), (0, 0.02, 0.16), 0.04, "steel", segments=8)
    with model.placed((0.0, 0.02, 0.20), turn=0.35, tilt=0.65):
        parts.dish(model, 0.22, 0.08, inner="white", outer="steel_light", accent="glow_cyan")
    model.beam((0.13, 0.10, 0.06), (0.17, 0.12, 0.30), 0.02, "steel")
    with model.placed((0.17, 0.12, 0.34), turn=0.9):
        model.box((0, 0, 0), (0.16, 0.02, 0.12), "steel_light")
        for column in range(3):
            for row in range(2):
                model.plate((-0.05 + column * 0.05, -0.0106, -0.027 + row * 0.054), (0.04, 0.04), "-y", "blue_dark")
    return model.finish()


def shield_emitter(name):
    """Shield emitter: three prongs around a glowing blue orb and ring on a hexagonal base."""
    model = kit.Builder(name, wear=CLEAN)
    model.cylinder((0, 0, 0), (0, 0, 0.08), 0.25, "steel_dark", segments=6, end_radius=0.22)
    model.cylinder((0, 0, 0.08), (0, 0, 0.10), 0.16, "white", segments=12)
    model.lump((0, 0, 0.22), (0.18, 0.18, 0.18), "glow_blue", seed=1, rough=0.0, detail=2, smooth=80.0)
    parts.torus(model, (0, 0, 0.24), 0.17, 0.016, "glow_blue", segments=20, sides=6)
    for index in range(3):
        angle = 2.0 * math.pi * index / 3.0 - math.pi / 2.0 + 0.5
        foot = (math.cos(angle) * 0.19, math.sin(angle) * 0.19)
        top = (math.cos(angle) * 0.12, math.sin(angle) * 0.12)
        model.beam((foot[0], foot[1], 0.08), (foot[0] * 1.1, foot[1] * 1.1, 0.30), 0.04, "white")
        model.beam((foot[0] * 1.1, foot[1] * 1.1, 0.30), (top[0], top[1], 0.42), 0.032, "white")
        model.box((top[0], top[1], 0.43), (0.035, 0.035, 0.035), "glow_blue")
    return model.finish()


# --- Machines and military --------------------------------------------------------------------

def motor(name):
    """Motor: an electric motor lying on its feet, cooling fins, a shaft and a terminal box."""
    model = kit.Builder(name, wear=GOODS)
    radius = 0.14
    z = 0.18
    model.box((0, 0, 0.02), (0.36, 0.30, 0.04), "steel_dark")
    for x in (-0.11, 0.11):
        model.box((x, 0, 0.07), (0.06, 0.22, 0.08), "blue_paint")
    model.cylinder((-0.18, 0, z), (0.16, 0, z), radius, "blue_paint", segments=16)
    for index in range(6):
        x = -0.13 + index * 0.05
        model.cylinder((x, 0, z), (x + 0.018, 0, z), radius * 1.10, "blue_dark", segments=16)
    model.cylinder((0.16, 0, z), (0.20, 0, z), radius * 0.9, "steel_light", segments=16)
    model.cylinder((-0.22, 0, z), (-0.18, 0, z), radius * 0.95, "steel", segments=16, end_radius=radius * 0.7)
    model.cylinder((0.20, 0, z), (0.30, 0, z), 0.03, "steel_light", segments=8)
    model.box((0.0, 0, z + radius + 0.035), (0.11, 0.10, 0.07), "blue_dark")
    model.plate((0.0, -0.0506, z + radius + 0.035), (0.07, 0.03), "-y", "yellow")
    return model.finish()


def structural_frame(name):
    """Structural frame: a short square truss section with end plates, in safety yellow."""
    model = kit.Builder(name, wear=GOODS)
    half, length, chord = 0.12, 0.25, 0.04
    z0 = half + 0.04
    corners = [(-half, -half), (half, -half), (half, half), (-half, half)]
    for y, z in corners:
        model.beam((-length, y, z0 + z), (length, y, z0 + z), chord, "yellow")
    for x in (-length, length):
        model.box((x, 0, z0), (0.03, half * 2 + 0.08, half * 2 + 0.08), "steel_dark")
    # Diagonals on every side, alternating.
    for side in range(4):
        a, b = corners[side], corners[(side + 1) % 4]
        for bay in range(2):
            x0 = -length + bay * length
            x1 = x0 + length
            start, end = (a, b) if bay % 2 == 0 else (b, a)
            model.beam((x0, start[0], z0 + start[1]), (x1, end[0], z0 + end[1]), 0.026, "yellow")
    return model.finish()


def composite_armor(name):
    """Composite armour: a thick layered plate leaning on a foot, its face covered in hexagonal
    tiles, the layers (ceramic, aramid, steel) visible along its edges."""
    model = kit.Builder(name, wear=GOODS)
    model.box((0, 0.10, 0.025), (0.44, 0.14, 0.05), "steel_dark")
    with model.placed((0.0, 0.0, 0.02), tilt=-0.28):
        model.box((0, 0.025, 0.25), (0.46, 0.03, 0.48), "steel_dark")
        model.box((0, -0.005, 0.25), (0.46, 0.03, 0.48), "aramid")
        model.box((0, -0.035, 0.25), (0.46, 0.03, 0.48), "armor")
        step = 0.10
        for row in range(5):
            for column in range(-2, 3):
                x = column * step + (step * 0.5 if row % 2 else 0.0)
                if abs(x) > 0.20:
                    continue
                z = 0.06 + row * step * 0.87
                model.cylinder((x, -0.05, z), (x, -0.07, z), 0.046, "armor_dark", segments=6)
    return model.finish()


def ammunition(name):
    """Ammunition: an open olive crate full of brass shells with copper tips."""
    model = kit.Builder(name, wear=GOODS)
    w, d, h = 0.46, 0.32, 0.18
    model.box((0, 0, 0.015), (w, d, 0.03), "olive")
    for side in (-1, 1):
        model.box((0, side * (d / 2 - 0.012), h / 2), (w, 0.024, h), "olive")
        model.box((side * (w / 2 - 0.012), 0, h / 2), (0.024, d, h), "olive")
    model.plate((0, -d / 2 - 0.0006, h * 0.55), (w * 0.8, 0.035), "-y", "yellow")
    model.plate((w / 2 + 0.0006, 0, h * 0.55), (d * 0.7, 0.035), "+x", "yellow")
    for row in range(2):
        for column in range(4):
            x = -0.15 + column * 0.10
            y = -0.06 + row * 0.12
            model.cylinder((x, y, 0.03), (x, y, 0.24), 0.04, "brass", segments=10)
            model.cylinder((x, y, 0.24), (x, y, 0.33), 0.04, "copper", segments=10, end_radius=0.008)
    return model.finish()


def missile(name):
    """Missile: a white missile with a red nose and fins on a two-saddle cradle."""
    model = kit.Builder(name, wear=GOODS)
    radius = 0.075
    z = 0.16
    with model.placed((0.0, 0.0, z), turn=0.0):
        model.cylinder((-0.26, 0, 0), (0.18, 0, 0), radius, "white", segments=12)
        model.cylinder((0.18, 0, 0), (0.32, 0, 0), radius, "red", segments=12, end_radius=0.0)
        model.cylinder((-0.30, 0, 0), (-0.26, 0, 0), radius * 0.7, "steel_dark", segments=10, end_radius=radius)
        model.cylinder((0.0, 0, 0), (0.03, 0, 0), radius * 1.02, "red", segments=12)
        for index in range(4):
            angle = math.pi / 4.0 + index * math.pi / 2.0
            direction = (0.0, math.cos(angle), math.sin(angle))
            for x0, x1, reach, color in ((-0.26, -0.16, 0.11, "red"), (0.04, 0.10, 0.05, "white")):
                tip = tuple(component * (radius + reach) for component in direction)
                root = tuple(component * radius * 0.9 for component in direction)
                model.beam((x0, root[1], root[2]), (x1, tip[1], tip[2]), 0.012, color)
                model.beam((x0, root[1], root[2]), (x0 + 0.02, tip[1], tip[2]), 0.012, color)
    for x in (-0.14, 0.10):
        model.box((x, 0, 0.03), (0.05, 0.20, 0.06), "steel_dark")
        model.box((x, 0, 0.07), (0.05, 0.10, 0.03), "steel_dark")
    return model.finish()


def weapon_component(name):
    """Weapon component: a cannon breech with its barrel, muzzle brake and recoil cylinders on a
    mount."""
    model = kit.Builder(name, wear=GOODS)
    z = 0.20
    model.box((-0.08, 0, 0.03), (0.30, 0.26, 0.06), "olive")
    model.box((-0.08, 0, 0.10), (0.12, 0.10, 0.08), "steel_dark")
    model.box((-0.12, 0, z), (0.22, 0.17, 0.15), "gunmetal")
    model.box((-0.12, 0, z + 0.085), (0.18, 0.13, 0.02), "olive")
    model.cylinder((-0.01, 0, z), (0.30, 0, z), 0.035, "gunmetal", segments=10)
    model.box((0.30, 0, z), (0.06, 0.09, 0.06), "black_metal")
    for side in (-1, 1):
        model.cylinder((-0.01, side * 0.05, z - 0.05), (0.14, side * 0.05, z - 0.05), 0.022, "steel_light", segments=8)
    model.cylinder((-0.235, 0, z), (-0.26, 0, z), 0.05, "red", segments=10)
    return model.finish()


# --- Energy -------------------------------------------------------------------------------------

def fusion_fuel(name):
    """Fusion fuel: a cell with a glowing cyan core column between heavy end caps and bars."""
    model = kit.Builder(name, wear=CLEAN)
    model.cylinder((0, 0, 0), (0, 0, 0.08), 0.16, "steel_dark", segments=12, end_radius=0.15)
    model.cylinder((0, 0, 0.08), (0, 0, 0.10), 0.13, "yellow", segments=12)
    model.cylinder((0, 0, 0.10), (0, 0, 0.42), 0.085, "glow_cyan", segments=12)
    model.cylinder((0, 0, 0.42), (0, 0, 0.44), 0.13, "yellow", segments=12)
    model.cylinder((0, 0, 0.44), (0, 0, 0.52), 0.15, "steel_dark", segments=12, end_radius=0.12)
    model.cylinder((0, 0, 0.52), (0, 0, 0.55), 0.05, "steel_light", segments=8)
    for index in range(4):
        angle = math.pi / 4.0 + index * math.pi / 2.0
        x, y = math.cos(angle) * 0.125, math.sin(angle) * 0.125
        model.cylinder((x, y, 0.08), (x, y, 0.44), 0.02, "white", segments=6)
    for z in (0.20, 0.32):
        parts.torus(model, (0, 0, z), 0.125, 0.012, "steel_light", segments=16, sides=4)
    return model.finish()


def energy(name):
    """Energy: a power cell with red and black terminals and glowing yellow charge bars."""
    model = kit.Builder(name, wear=GOODS)
    w, d, h = 0.40, 0.26, 0.34
    model.box((0, 0, h / 2), (w, d, h), "black_metal")
    model.box((0, 0, h + 0.01), (w - 0.02, d - 0.02, 0.02), "steel_dark")
    for x, color in ((-0.11, "red"), (0.11, "steel_light")):
        model.cylinder((x, 0, h + 0.02), (x, 0, h + 0.07), 0.035, color, segments=10)
    model.box((-0.11, 0, h + 0.075), (0.04, 0.012, 0.012), "white")
    model.box((-0.11, 0, h + 0.075), (0.012, 0.04, 0.012), "white")
    model.box((0.11, 0, h + 0.075), (0.04, 0.012, 0.012), "black_metal")
    for index in range(4):
        z = 0.06 + index * 0.065
        model.plate((0.0, -d / 2 - 0.0006, z), (w * 0.62, 0.045), "-y", "glow_yellow")
        model.plate((w / 2 + 0.0006, 0.0, z), (d * 0.6, 0.045), "+x", "glow_yellow")
    return model.finish()


# --- Food -----------------------------------------------------------------------------------------

def food(name):
    """Food: a wooden crate heaped with red, orange and green produce."""
    model = kit.Builder(name, wear=GOODS)
    w, d, h = 0.46, 0.34, 0.16
    model.box((0, 0, 0.012), (w, d, 0.024), "wood")
    for side in (-1, 1):
        for z in (0.04, 0.11):
            model.box((0, side * (d / 2 - 0.01), z), (w, 0.02, 0.05), "wood")
            model.box((side * (w / 2 - 0.01), 0, z), (0.02, d, 0.05), "wood")
    for side in (-1, 1):
        for other in (-1, 1):
            model.box((side * (w / 2 - 0.012), other * (d / 2 - 0.012), h / 2), (0.03, 0.03, h), "rust_brown")
    colors = ("food_red", "food_orange", "plant", "food_red", "food_orange", "food_red", "plant", "food_orange",
              "food_red", "plant")
    for index in range(10):
        column, row = index % 4, index // 4
        x = -0.15 + column * 0.10 + (0.05 if row % 2 else 0.0)
        y = -0.09 + row * 0.09
        if row == 2:
            x = -0.08 + column * 0.10
        size = 0.10 if colors[index] != "plant" else 0.12
        model.lump((x, y, 0.15 + (0.03 if row == 1 else 0.0)), (size, size, size * 0.9), colors[index],
                   seed=100 + index, rough=0.08, detail=1, smooth=70.0)
    return model.finish()


def protein(name):
    """Protein: a stack of vacuum packs with white labels and a tub with a lid beside it."""
    model = kit.Builder(name, wear=GOODS)
    for index, (z, turn) in enumerate(((0.0, 0.0), (0.075, 0.12), (0.15, -0.08))):
        with model.placed((-0.06, 0.02, z), turn=turn):
            model.box((0, 0, 0.035), (0.30, 0.20, 0.07), "protein")
            model.box((0, 0, 0.035), (0.31, 0.12, 0.05), "protein")
            model.plate((0.0, -0.1006, 0.035), (0.14, 0.04), "-y", "white")
    model.revolve((0.15, -0.10, 0.0), [(0.0, 0.0), (0.075, 0.0), (0.085, 0.20), (0.0, 0.20)], "white", segments=12)
    model.cylinder((0.15, -0.10, 0.20), (0.15, -0.10, 0.235), 0.09, "protein", segments=12)
    model.cylinder((0.15, -0.10, 0.07), (0.15, -0.10, 0.13), 0.082, "protein", segments=12)
    return model.finish()


def algae(name):
    """Algae: a glass culture jar full of green algae with a steel lid, base and air line."""
    model = kit.Builder(name, wear=GOODS)
    radius, height = 0.17, 0.44
    model.cylinder((0, 0, 0), (0, 0, 0.05), radius + 0.02, "steel", segments=16)
    model.revolve((0, 0, 0.05), [(0.0, 0.0), (radius, 0.0), (radius, height - 0.06), (radius * 0.9, height - 0.03),
                                 (0.0, height - 0.03)], "algae", segments=16)
    model.cylinder((0, 0, 0.05 + height * 0.45), (0, 0, 0.05 + height * 0.47), radius * 1.02, "steel_light",
                   segments=16)
    model.cylinder((0, 0, height + 0.02), (0, 0, height + 0.07), radius * 0.95, "steel", segments=16)
    model.cylinder((0, 0, height + 0.07), (0, 0, height + 0.09), 0.04, "steel_dark", segments=8)
    for index, (x, y, z) in enumerate(((0.06, -0.15, 0.16), (-0.04, -0.16, 0.26), (0.10, -0.12, 0.33),
                                       (0.15, -0.04, 0.22))):
        model.lump((x, y, z), (0.03, 0.03, 0.03), "frost", seed=120 + index, rough=0.0)
    parts.pipe(model, [(0.04, 0.0, height + 0.09), (0.04, 0.0, height + 0.14), (0.20, 0.0, height + 0.14),
                       (0.20, 0.0, 0.0)], radius=0.012, color="steel_dark")
    model.box((0.0, -radius - 0.012, 0.03), (0.08, 0.02, 0.03), "glow_green")
    return model.finish()


# --- Robots ---------------------------------------------------------------------------------------

# Per tier: (body colour, trim colour, eye colour, body width, height scale).
_ROBOT_TIERS = {
    1: ("yellow", "steel_dark", "glow_red", 0.30, 0.85),
    2: ("orange_paint", "steel_dark", "glow_orange", 0.28, 0.92),
    3: ("steel_light", "blue_paint", "glow_cyan", 0.26, 1.0),
    4: ("white", "blue_paint", "glow_cyan", 0.24, 1.06),
    5: ("white", "black_metal", "glow_purple", 0.22, 1.12),
}


def robot(name, tier):
    """A worker robot that grows more advanced with *tier*: T1 a box on tracks with one arm, T2
    on wheels with two arms, T3 a sturdy walker, T4 a humanoid, T5 a sleek humanoid with a
    glowing core and a crest."""
    body, trim, eye, width, scale = _ROBOT_TIERS[tier]
    model = kit.Builder(name, wear=max(0.05, 0.7 - tier * 0.15))
    s = scale
    if tier == 1:
        for side in (-1, 1):
            model.box((side * 0.13, 0, 0.05), (0.08, 0.30, 0.10), "black_metal")
            for y in (-0.10, 0.0, 0.10):
                model.cylinder((side * 0.175, y, 0.05), (side * 0.18, y, 0.05), 0.03, "steel", segments=8)
        hip = 0.10
    elif tier == 2:
        model.box((0, 0, 0.08), (0.22, 0.26, 0.06), trim)
        for side in (-1, 1):
            for y in (-0.10, 0.10):
                model.cylinder((side * 0.12, y, 0.07), (side * 0.16, y, 0.07), 0.07, "black_metal", segments=12)
                model.cylinder((side * 0.16, y, 0.07), (side * 0.165, y, 0.07), 0.035, "steel_light", segments=8)
        hip = 0.11
    else:
        leg = 0.045 if tier == 3 else 0.035
        hip = 0.22 * s
        for side in (-1, 1):
            x = side * (0.07 if tier == 3 else 0.06)
            model.box((x, -0.015, 0.02), (0.08 if tier == 3 else 0.065, 0.12, 0.04), trim)
            model.beam((x, 0, 0.04), (x, 0, hip * 0.55), leg, body if tier > 3 else trim)
            model.box((x, -0.005, hip * 0.55), (leg * 1.3, leg * 1.3, leg * 1.1), trim)
            model.beam((x, 0, hip * 0.55), (x, 0, hip), leg * 1.1, body)
    # Torso.
    torso = 0.20 * s if tier < 3 else 0.17 * s
    if tier <= 2:
        model.box((0, 0, hip + torso / 2), (width, 0.22, torso), body)
        model.plate((0, -0.1106, hip + torso * 0.45), (width * 0.6, 0.03), "-y", trim)
    else:
        model.box((0, 0, hip + torso * 0.35), (width * 0.62, 0.13, torso * 0.7), trim)
        model.box((0, 0, hip + torso * 0.72), (width, 0.15, torso * 0.56), body)
        if tier >= 4:
            model.cylinder((0, -0.075, hip + torso * 0.72), (0, -0.09, hip + torso * 0.72), 0.03,
                           eye if tier == 5 else "glow_cyan", segments=10)
    shoulder = hip + torso * (0.85 if tier >= 3 else 0.8)
    # Arms.
    arms = (1,) if tier == 1 else (-1, 1)
    for side in arms:
        x = side * (width / 2 + 0.025)
        if tier <= 2:
            model.cylinder((x - side * 0.02, 0, shoulder), (x + side * 0.02, 0, shoulder), 0.035, trim, segments=8)
            model.beam((x + side * 0.01, 0, shoulder), (x + side * 0.06, -0.12, shoulder + 0.02), 0.035, body)
            model.beam((x + side * 0.06, -0.12, shoulder + 0.02), (x + side * 0.06, -0.20, shoulder - 0.06), 0.028, trim)
            for finger in (-1, 1):
                model.beam((x + side * 0.06 + finger * 0.015, -0.20, shoulder - 0.06),
                           (x + side * 0.06 + finger * 0.025, -0.23, shoulder - 0.10), 0.012, "steel_light")
        else:
            model.box((x, 0, shoulder), (0.06 if tier < 5 else 0.05, 0.08, 0.06), trim if tier < 5 else body)
            elbow = (x + side * 0.02, -0.02, shoulder - 0.14 * s)
            model.beam((x, 0, shoulder - 0.02), elbow, 0.04 if tier == 3 else 0.032, body)
            hand = (x + side * 0.02, -0.09, shoulder - 0.20 * s)
            model.beam(elbow, hand, 0.034 if tier == 3 else 0.028, trim if tier != 4 else body)
            model.box(hand, (0.04, 0.035, 0.04), trim)
    # Head.
    neck = hip + torso
    if tier == 1:
        model.box((0.0, -0.02, neck + 0.05), (0.12, 0.10, 0.08), body)
        model.box((0.0, -0.075, neck + 0.05), (0.08, 0.012, 0.03), eye)
        model.beam((0.04, 0.0, neck + 0.09), (0.05, 0.02, neck + 0.18), 0.008, "steel_dark")
        model.box((0.05, 0.02, neck + 0.185), (0.02, 0.02, 0.02), eye)
    elif tier == 2:
        model.cylinder((0, 0, neck), (0, 0, neck + 0.03), 0.03, trim, segments=8)
        model.box((0, -0.01, neck + 0.08), (0.14, 0.12, 0.10), body)
        for side in (-1, 1):
            model.cylinder((side * 0.035, -0.07, neck + 0.085), (side * 0.035, -0.08, neck + 0.085), 0.022, eye,
                           segments=8)
    else:
        model.beam((0, 0, neck), (0, 0, neck + 0.025), 0.035, trim)
        head = 0.11 if tier == 3 else 0.10
        model.box((0, 0, neck + 0.025 + head / 2), (head, head, head), body)
        model.box((0, -head / 2 - 0.002, neck + 0.025 + head * 0.55), (head * 0.8, 0.012, head * 0.25), eye)
        if tier == 3:
            for side in (-1, 1):
                model.cylinder((side * head / 2, 0, neck + 0.08), (side * (head / 2 + 0.02), 0, neck + 0.08), 0.025,
                               trim, segments=8)
        if tier == 5:
            model.box((0, 0.01, neck + 0.025 + head + 0.02), (0.02, head * 1.1, 0.04), "black_metal")
            for side in (-1, 1):
                model.beam((side * head / 2, 0.02, neck + 0.09), (side * (head / 2 + 0.03), 0.05, neck + 0.17), 0.012,
                           eye)
    if tier == 5:
        # A glowing seam down the chest and a backpack with fins.
        model.plate((0, -0.0756, hip + torso * 0.45), (0.012, torso * 0.4), "-y", eye)
        model.box((0, 0.10, hip + torso * 0.7), (0.12, 0.06, torso * 0.6), "black_metal")
    elif tier >= 3:
        model.box((0, 0.095, hip + torso * 0.7), (0.12, 0.05, torso * 0.5), trim)
    return model.finish()


# --- Housing, probe -------------------------------------------------------------------------------

def housing(name):
    """Housing: a small prefab home with a blue pitched roof, lit windows and a door."""
    model = kit.Builder(name, wear=CLEAN)
    w, d, h = 0.40, 0.32, 0.24
    model.box((0, 0, 0.02), (w + 0.06, d + 0.06, 0.04), "concrete")
    model.box((0, 0, 0.04 + h / 2), (w, d, h), "paint_grey")
    top = 0.04 + h
    # The gables: a square bar turned by 45 degrees, its lower half hidden in the walls.
    with model.placed((0, 0, top), tilt=math.pi / 4.0):
        model.box((0, 0, 0), (w, d / math.sqrt(2.0), d / math.sqrt(2.0)), "paint_grey")
    # Two roof slabs at 45 degrees, overhanging a little.
    thick = 0.03
    lift = thick / 2.0 * math.sqrt(0.5)
    for side in (-1, 1):
        with model.placed((0, side * (d / 4 + lift), top + d / 4 + lift), tilt=-side * math.pi / 4.0):
            model.box((0, 0, 0), (w + 0.06, d / 2 * math.sqrt(2.0) + 0.06, thick), "blue_paint")
    parts.window(model, (-0.10, -d / 2, 0.04 + h * 0.55), (0.10, 0.09), "-y", frame="white")
    model.plate((0.08, -d / 2 - 0.0006, 0.04 + h * 0.4), (0.08, h * 0.8), "-y", "blue_dark")
    model.plate((0.08, -d / 2 - 0.0012, 0.04 + h * 0.4), (0.06, h * 0.7), "-y", "blue_paint")
    parts.window(model, (w / 2, 0.0, 0.04 + h * 0.55), (0.12, 0.09), "+x", frame="white")
    model.box((0.10, 0.07, top + 0.13), (0.05, 0.05, 0.12), "steel_dark")
    return model.finish()


def probe(name):
    """Probe: a slim gold-foil body on a small engine bell, a dish and a whip antenna on top, two
    solar fins on a boom."""
    model = kit.Builder(name, wear=CLEAN)
    model.cylinder((0, 0, 0), (0, 0, 0.06), 0.05, "steel_dark", segments=10, end_radius=0.025)
    model.cylinder((0, 0, 0.06), (0, 0, 0.34), 0.07, "gold", segments=8)
    model.cylinder((0, 0, 0.34), (0, 0, 0.37), 0.075, "steel_light", segments=8)
    model.cylinder((0, 0, 0.18), (0, 0, 0.20), 0.074, "white", segments=8)
    with model.placed((0.0, 0.0, 0.38), tilt=0.5):
        parts.dish(model, 0.09, 0.03, inner="white", outer="steel_light", accent="glow_cyan", struts=3)
    model.beam((0.03, 0.03, 0.37), (0.06, 0.06, 0.58), 0.008, "steel_dark")
    model.box((0.06, 0.06, 0.585), (0.016, 0.016, 0.016), "glow_red")
    model.beam((-0.36, 0, 0.25), (0.36, 0, 0.25), 0.02, "steel")
    for side in (-1, 1):
        with model.placed((side * 0.23, 0, 0.25), turn=0.0, tilt=-0.5):
            model.box((0, 0, 0), (0.23, 0.01, 0.15), "solar")
            model.box((0, 0.006, 0), (0.24, 0.004, 0.16), "steel_light")
            model.box((0, -0.0055, 0), (0.003, 0.002, 0.15), "steel_light")
    return model.finish()


# --- The list -------------------------------------------------------------------------------------

def _models() -> dict:
    one = (1, 1)
    ores = {
        # key: (stone, glints, kind, seed, count)
        "iron": ("ore_iron", ["hematite", "rust"], "nugget", 0, 6),
        "copper": ("ore_copper", "copper", "nugget", 7, 7),
        "aluminum": ("bauxite", "bauxite_light", "nugget", 13, 8),
        "titanium": ("ore_titanium", "titanium_glint", "crystal", 19, 7),
        "platinum_group": ("ore_pale", "platinum", "nugget", 23, 8),
        "rare_earths": ("ore_rare", ["rare_crystal", "rare_teal"], "crystal", 29, 8),
        "uranium": ("ore_uranium", "glow_green", "vein", 31, 7),
        "sulfur": ("sulfur", "sulfur_bright", "crystal", 37, 8),
        "carbon": ("coal", "coal", "nugget", 41, 6),
    }
    models = {}
    for key, (stone, glints, kind, seed, count) in ores.items():
        extra = _uranium_extra if key == "uranium" else None
        models[key] = (lambda k=key, st=stone, g=glints, kd=kind, sd=seed, c=count, e=extra: ore_pile(
            "te_res_" + k, st, g, kd, sd, c, e), one)
    gases = {
        # key: (body, shoulder, band)
        "hydrogen": ("red", "red", "white"),
        "oxygen": ("blue_paint", "white", None),
        "nitrogen": ("black_metal", "white", None),
        "methane": ("orange_paint", "orange_paint", None),
        "ammonia": ("yellow", "yellow", "black_metal"),
    }
    for key, (body, shoulder, band) in gases.items():
        models[key] = (lambda k=key, b=body, s=shoulder, n=band: gas("te_res_" + k, b, s, n), one)
    singles = {
        "silicon": lambda: crystal_cluster("te_res_silicon", "quartz", "quartz_smoky"),
        "helium_3": lambda: helium3("te_res_helium_3"),
        "cryogenic_fluids": lambda: dewar("te_res_cryogenic_fluids"),
        "water": lambda: water("te_res_water"),
        "null_g_materials": lambda: null_g("te_res_null_g_materials"),
        "iron_plate": lambda: plates("te_res_iron_plate", "iron_plate", "red"),
        "aluminum_plate": lambda: plates("te_res_aluminum_plate", "aluminum", "blue_paint"),
        "titanium_plate": lambda: plates("te_res_titanium_plate", "titanium", "glow_purple"),
        "copper_wire": lambda: wire_spool("te_res_copper_wire"),
        "carbon_fiber": lambda: carbon_roll("te_res_carbon_fiber"),
        "glass": lambda: glass("te_res_glass"),
        "plastic": lambda: plastic("te_res_plastic"),
        "electronics": lambda: electronics("te_res_electronics"),
        "advanced_electronics": lambda: advanced_electronics("te_res_advanced_electronics"),
        "silicon_wafer": lambda: silicon_wafer("te_res_silicon_wafer"),
        "sensor_array": lambda: sensor_array("te_res_sensor_array"),
        "shield_emitter": lambda: shield_emitter("te_res_shield_emitter"),
        "motor": lambda: motor("te_res_motor"),
        "structural_frame": lambda: structural_frame("te_res_structural_frame"),
        "composite_armor": lambda: composite_armor("te_res_composite_armor"),
        "ammunition": lambda: ammunition("te_res_ammunition"),
        "missile": lambda: missile("te_res_missile"),
        "weapon_component": lambda: weapon_component("te_res_weapon_component"),
        "fusion_fuel": lambda: fusion_fuel("te_res_fusion_fuel"),
        "energy": lambda: energy("te_res_energy"),
        "food": lambda: food("te_res_food"),
        "protein": lambda: protein("te_res_protein"),
        "algae": lambda: algae("te_res_algae"),
        "housing": lambda: housing("te_res_housing"),
        "probe": lambda: probe("te_res_probe"),
    }
    for key, build in singles.items():
        models[key] = (build, one)
    for tier in range(1, 6):
        models["robot_t%d" % tier] = (lambda t=tier: robot("te_res_robot_t%d" % t, t), one)
    return dict(sorted(models.items()))


MODELS = _models()

if __name__ == "__main__":
    kit.run_many_from_command_line(MODELS)
