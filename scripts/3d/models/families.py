"""Models for the module types without a model of their own, built from family templates: an
open room, a machine block, a mast with a dish, a turret, a drive, a field and so on. Each
type gets its own accent colour and fittings, so neighbours stay distinguishable.

Types with a hand-made script (pump.py, smelter.py …) are not built here.

  blender --background --factory-startup --python scripts/3d/models/families.py -- \
      --output-dir game/world/models [--only ACADEMY,FUSION_REACTOR]

File names are the lower-case type keys (academy.glb), like the hand-made models.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

BIG = 0.86  # half extent of a 2x2 model


# --- Templates ---------------------------------------------------------------------------------

def room(name, accent="yellow", wall="blue", floor="floor", fittings=None):
    """An open room (two walls) with fittings: desks, beds, beds-with-cross, benches …"""
    model = kit.Builder(name)
    cap = "concrete_dark" if wall == "concrete" else ("rust_brown_dark" if wall == "rust_brown" else "blue_dark")
    top = parts.room(model, floor=floor, wall=wall, cap=cap, trim=accent)
    for fitting in fittings or []:
        fitting(model, top, accent)
    return model.finish()


def desks(model, top, accent):
    """Two rows of desks with glowing screens."""
    for y in (-0.16, 0.10):
        for x in (-0.12, 0.14):
            model.box((x, y, top + 0.07), (0.18, 0.10, 0.02), "steel_light")
            model.beam((x - 0.07, y, top), (x - 0.07, y, top + 0.07), 0.012, "steel_dark")
            model.beam((x + 0.07, y, top), (x + 0.07, y, top + 0.07), 0.012, "steel_dark")
            model.box((x, y + 0.03, top + 0.12), (0.10, 0.012, 0.07), "steel_dark")
            model.plate((x, y + 0.023, top + 0.12), (0.08, 0.05), "-y", "glow_cyan")
    model.box((0.08, 0.33, top + 0.24), (0.36, 0.02, 0.18), "white")


def lab_bench(model, top, accent):
    """A long bench with instruments along the back wall and a glowing cabinet."""
    model.box((0.04, 0.24, top + 0.08), (0.56, 0.14, 0.16), "white")
    model.box((0.04, 0.24, top + 0.165), (0.58, 0.16, 0.01), "steel_dark")
    for x in (-0.14, 0.02, 0.18):
        model.cylinder((x, 0.24, top + 0.17), (x, 0.24, top + 0.24), 0.025, "glass", segments=8)
        model.cylinder((x, 0.24, top + 0.24), (x, 0.24, top + 0.255), 0.03, accent, segments=8)
    model.box((-0.28, -0.10, top + 0.16), (0.10, 0.14, 0.32), "steel_light")
    model.plate((-0.23 + 0.0006, -0.10, top + 0.20), (0.10, 0.12), "+x", accent)
    model.box((0.18, -0.12, top + 0.06), (0.18, 0.18, 0.12), "steel")
    model.cylinder((0.18, -0.12, top + 0.12), (0.18, -0.12, top + 0.20), 0.05, accent, segments=10)


def beds(model, top, accent):
    """Bunks and lockers."""
    for x in (-0.18, 0.10):
        model.box((x, 0.18, top + 0.05), (0.22, 0.16, 0.06), "steel")
        model.box((x, 0.18, top + 0.085), (0.20, 0.14, 0.02), "white")
        model.box((x, 0.18, top + 0.20), (0.22, 0.16, 0.02), "steel")
        model.box((x, 0.18, top + 0.215), (0.20, 0.14, 0.015), "white")
        for corner in (-0.1, 0.1):
            model.beam((x + corner, 0.11, top), (x + corner, 0.11, top + 0.22), 0.012, "steel_dark")
    model.box((0.28, -0.20, top + 0.13), (0.08, 0.08, 0.26), accent)
    model.box((-0.10, -0.16, top + 0.08), (0.20, 0.12, 0.02), "steel_light")


def medical(model, top, accent):
    """Two beds, a screen and a red cross."""
    for x in (-0.16, 0.14):
        model.box((x, 0.10, top + 0.07), (0.16, 0.26, 0.04), "white")
        model.beam((x, -0.02, top), (x, -0.02, top + 0.07), 0.015, "steel_dark")
        model.beam((x, 0.22, top), (x, 0.22, top + 0.07), 0.015, "steel_dark")
    model.plate((0.06, 0.35 - 0.0006, top + 0.26), (0.12, 0.04), "-y", "red")
    model.plate((0.06, 0.35 - 0.0012, top + 0.26), (0.04, 0.12), "-y", "red")
    model.box((-0.28, -0.20, top + 0.14), (0.06, 0.06, 0.28), "steel_light")
    model.plate((-0.25 + 0.0006, -0.20, top + 0.20), (0.05, 0.08), "+x", "glow_cyan")


def stage(model, top, accent):
    """A stage with lights, seats and a big screen."""
    model.box((0.04, 0.22, top + 0.03), (0.50, 0.18, 0.06), "rust_brown")
    model.box((0.04, 0.33, top + 0.25), (0.40, 0.02, 0.20), "steel_dark")
    model.plate((0.04, 0.32 - 0.0006, top + 0.25), (0.36, 0.16), "-y", accent)
    for x in (-0.20, -0.02, 0.16):
        for y in (-0.10, -0.24):
            model.cylinder((x, y, top), (x, y, top + 0.05), 0.012, "steel_dark", segments=6)
            model.cylinder((x, y, top + 0.05), (x, y, top + 0.065), 0.04, "red", segments=8)
    for x in (-0.18, 0.04, 0.26):
        model.cylinder((x, 0.10, top + 0.40), (x, 0.10, top + 0.36), 0.02, "glow_orange", segments=8)


def monument(model, top, accent):
    """A plinth with a statue-like column and lights."""
    model.box((0.04, 0.0, top + 0.04), (0.30, 0.30, 0.08), "concrete")
    model.cylinder((0.04, 0.0, top + 0.08), (0.04, 0.0, top + 0.34), 0.06, "white", segments=10, end_radius=0.03)
    model.cylinder((0.04, 0.0, top + 0.34), (0.04, 0.0, top + 0.40), 0.05, accent, segments=10)
    for x, y in ((-0.18, -0.20), (0.26, -0.20), (-0.18, 0.20), (0.26, 0.20)):
        model.cylinder((x, y, top), (x, y, top + 0.06), 0.02, "glow_orange", segments=6)


def guard(model, top, accent):
    """A counter with screens, a weapon rack and a warning light."""
    model.box((0.06, -0.08, top + 0.07), (0.44, 0.10, 0.14), "steel")
    for x in (-0.08, 0.10, 0.24):
        model.box((x, -0.06, top + 0.18), (0.10, 0.02, 0.07), "steel_dark")
        model.plate((x, -0.071, top + 0.18), (0.08, 0.05), "-y", "glow_cyan")
    model.box((-0.24, 0.20, top + 0.13), (0.12, 0.08, 0.26), "steel_dark")
    model.cylinder((0.30, 0.30, top + 0.40), (0.30, 0.30, top + 0.46), 0.03, "red", segments=8)


def garden(model, top, accent):
    """Planting beds and small trees."""
    for x, y in ((-0.14, 0.14), (0.16, 0.14), (-0.14, -0.16), (0.16, -0.16)):
        model.box((x, y, top + 0.03), (0.22, 0.22, 0.06), "rust_brown")
        model.plate((x, y, top + 0.0606), (0.18, 0.18), "+z", "soil")
        model.cylinder((x, y, top + 0.06), (x, y, top + 0.14), 0.012, "rust_brown", segments=5)
        model.cylinder((x, y, top + 0.12), (x, y, top + 0.26), 0.08, "plant", segments=7, end_radius=0.02)


def lamp_posts(model, top, accent):
    """Two lamp posts along the open front of a room (parks)."""
    parts.lamp_post(model, (0.35, -0.35), top, height=0.30)
    parts.lamp_post(model, (0.35, 0.30), top, height=0.30, facing="+x")


def block(name, accent="yellow", body="blue", height=0.46, cells=(1, 1), roof=None, front=None, base_color="steel_dark",
          lamps=False):
    """A closed machine block on a base plate, with an accent band, roof equipment and fittings
    in front."""
    model = kit.Builder(name)
    half_x = 0.42 if cells[0] == 1 else BIG
    half_y = 0.42 if cells[1] == 1 else BIG
    base = 0.05
    model.box((0.0, 0.0, base / 2.0), (half_x * 2.0, half_y * 2.0, base), base_color)
    body_half = (half_x - 0.06, half_y - 0.08)
    model.box((0.0, 0.04, base + height / 2.0), (body_half[0] * 2.0, body_half[1] * 2.0, height), body)
    top = base + height
    model.box((0.0, 0.04, top + 0.01), (body_half[0] * 2.0 + 0.02, body_half[1] * 2.0 + 0.02, 0.02), "steel_dark")
    front_y = 0.04 - body_half[1]
    right_x = body_half[0]
    model.plate((0.0, front_y - 0.0006, top - 0.05), (body_half[0] * 2.0, 0.025), "-y", accent)
    model.plate((right_x + 0.0006, 0.04, top - 0.05), (body_half[1] * 2.0, 0.025), "+x", accent)
    parts.vent(model, (right_x, 0.04, base + height * 0.45), (0.14, 0.10), "+x")
    parts.window(model, (-body_half[0] * 0.45, front_y, base + height * 0.42), (0.14, height * 0.45), "-y",
                 frame=accent, pane="window")
    for fitting in roof or []:
        fitting(model, top + 0.02, accent, body_half)
    for fitting in front or []:
        fitting(model, base, accent, (front_y, right_x))
    if lamps:
        # Works in the open: floodlights over the front and the right side, lamps along the roof.
        parts.floodlight(model, (body_half[0] * 0.45, front_y - 0.0175, top - 0.12), "-y")
        parts.floodlight(model, (right_x + 0.0175, 0.04 - body_half[1] * 0.5, top - 0.12), "+x")
        with model.placed((0.0, 0.04, 0.0)):
            parts.edge_lamps(model, (body_half[0] + 0.01, body_half[1] + 0.01), top + 0.02, count=2,
                             size=(0.05, 0.016), margin=0.15)
    return model.finish()


def core_module(name):
    """The core module (CORE_MODULE): the heart of the home colony that shields it. A reactor
    core of glowing cyan rings inside a frame of four struts, on a heavy round pedestal."""
    model = kit.Builder(name)
    base = 0.05
    model.box((0.0, 0.0, base / 2.0), (0.84, 0.84, base), "steel_dark")
    model.cylinder((0.0, 0.0, base), (0.0, 0.0, base + 0.10), 0.34, "steel", segments=16)
    model.cylinder((0.0, 0.0, base + 0.10), (0.0, 0.0, base + 0.12), 0.36, "yellow", segments=16)
    top = base + 0.12
    # The core: a glowing column with rings around it.
    model.cylinder((0.0, 0.0, top), (0.0, 0.0, top + 0.46), 0.12, "glow_cyan", segments=12)
    for height in (0.10, 0.23, 0.36):
        model.cylinder((0.0, 0.0, top + height - 0.015), (0.0, 0.0, top + height + 0.015), 0.20,
                       "steel_dark", segments=16)
        model.cylinder((0.0, 0.0, top + height - 0.006), (0.0, 0.0, top + height + 0.006), 0.205,
                       "glow_cyan", segments=16)
    model.cylinder((0.0, 0.0, top + 0.46), (0.0, 0.0, top + 0.52), 0.18, "steel", segments=16)
    # Four struts hold the cap.
    for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        model.beam((sx * 0.26, sy * 0.26, top), (sx * 0.15, sy * 0.15, top + 0.50), 0.035, "steel_dark")
    model.cylinder((0.0, 0.0, top + 0.52), (0.0, 0.0, top + 0.60), 0.05, "red", segments=8)
    return model.finish()


def chimneys(model, top, accent, half):
    for x in (-half[0] * 0.5, half[0] * 0.1):
        model.cylinder((x, 0.18, top), (x, 0.18, top + 0.22), 0.04, "steel_dark", segments=8)
        model.cylinder((x, 0.18, top + 0.18), (x, 0.18, top + 0.20), 0.05, accent, segments=8)
        # A red light on a bracket at the top: chimneys are the tallest thing around.
        model.beam((x + 0.04, 0.18, top + 0.21), (x + 0.07, 0.18, top + 0.21), 0.01, "steel_dark")
        parts.tip_light(model, (x + 0.07, 0.18), top + 0.21, radius=0.014)


def tanks(model, top, accent, half):
    for x in (-half[0] * 0.5, half[0] * 0.45):
        model.cylinder((x, 0.12, top), (x, 0.12, top + 0.10), 0.09, "steel_light", segments=10)
        model.cylinder((x, 0.12, top + 0.10), (x, 0.12, top + 0.13), 0.06, accent, segments=10)
    parts.pipe(model, [(-half[0] * 0.5, 0.12, top + 0.06), (half[0] * 0.45, 0.12, top + 0.06)], radius=0.015)


def core(model, top, accent, half):
    """A glowing reactor dome on the roof."""
    model.cylinder((0.0, 0.06, top), (0.0, 0.06, top + 0.05), 0.16, "steel_dark", segments=12)
    model.cylinder((0.0, 0.06, top + 0.05), (0.0, 0.06, top + 0.14), 0.13, accent, segments=12, end_radius=0.06)
    for angle in range(0, 360, 90):
        x = math.cos(math.radians(angle)) * 0.20
        y = 0.06 + math.sin(math.radians(angle)) * 0.20
        model.beam((x, y, top), (x * 0.5, 0.06 + (y - 0.06) * 0.5, top + 0.12), 0.02, "steel")


def fans(model, top, accent, half):
    """Two roof fans; their blades turn (moving parts "fan_1", "fan_2")."""
    for number, x in enumerate((-half[0] * 0.45, half[0] * 0.45), start=1):
        model.cylinder((x, 0.04, top), (x, 0.04, top + 0.04), 0.10, "steel", segments=10)
        model.plate((x, 0.04, top + 0.0403), (0.17, 0.17), "+z", "dark")
        with model.moving("fan_%d" % number, (x, 0.04, top + 0.04)):
            for turn in (0.0, math.pi / 2.0):
                model.box((x, 0.04, top + 0.046), (0.17, 0.028, 0.008), "steel_light", turn=turn)
            model.cylinder((x, 0.04, top + 0.04), (x, 0.04, top + 0.056), 0.02, accent, segments=6)


def dish_small(model, top, accent, half):
    """A small dish on a post that sweeps the sky (moving part "dish")."""
    model.cylinder((0.12, 0.10, top), (0.12, 0.10, top + 0.10), 0.015, "steel_dark", segments=6)
    with model.moving("dish", (0.12, 0.10, top + 0.10)):
        with model.placed((0.12, 0.10, top + 0.12), tilt=math.radians(40.0)):
            model.cylinder((0.0, 0.0, 0.0), (0.0, 0.0, 0.03), 0.10, "white", segments=12, end_radius=0.04)


def crates_front(model, base, accent, edge):
    front_y, right_x = edge
    parts.crate(model, (-0.24, front_y - 0.07), base, (0.10, 0.08, 0.06), accent)
    parts.crate(model, (-0.10, front_y - 0.07), base, (0.08, 0.08, 0.05), "rust_brown", turn=0.3)


def barrels_front(model, base, accent, edge):
    front_y, right_x = edge
    parts.barrel(model, (0.20, front_y - 0.07), base, radius=0.035, height=0.08)
    parts.barrel(model, (0.30, front_y - 0.07), base, radius=0.035, height=0.08, color=accent)


def mast(name, accent="yellow", head=None, height=0.80, base="concrete"):
    """A slim lattice mast on a slab with something on top (dish, rotor, sensor head)."""
    model = kit.Builder(name)
    top = parts.slab(model, top=base)
    parts.braced_frame(model, (0.0, 0.0), 0.12, top, top + 0.16, leg=0.03)
    parts.lattice_mast(model, (0.0, 0.0), top + 0.16, height, 0.09, 0.05, bays=3, leg=0.022)
    parts.control_box(model, (-0.27, -0.27))
    parts.stripes(model, (0.06, -0.35), 7)
    if head:
        head(model, height, accent)
    _mast_lights(model, top, height)
    return model.finish()


def _mast_lights(model, slab_top, height):
    """Red lights on brackets left and right below the head, two floodlights on the lattice
    looking to the front and to the right, and a lamp post at the front corner of the slab."""
    bottom = slab_top + 0.16

    def lattice_half(z):
        # The mast tapers from 0.09 at its foot to 0.05 at its top (mast()).
        return 0.09 - 0.04 * (z - bottom) / (height - bottom)

    bracket = height - 0.12
    for sign in (-1, 1):
        model.beam((sign * (lattice_half(bracket) - 0.01), 0.0, bracket), (sign * 0.10, 0.0, bracket),
                   0.012, "steel_dark")
        parts.tip_light(model, (sign * 0.10, 0.0), bracket + 0.006)
    flood = bottom + (height - bottom) * 0.3
    model.beam((0.0, -lattice_half(flood) + 0.01, flood), (0.0, -0.10, flood), 0.012, "steel_dark")
    parts.floodlight(model, (0.0, -0.11, flood), "-y")
    model.beam((lattice_half(flood + 0.05) - 0.01, 0.0, flood + 0.05), (0.10, 0.0, flood + 0.05), 0.012,
               "steel_dark")
    parts.floodlight(model, (0.11, 0.0, flood + 0.05), "+x")
    parts.lamp_post(model, (0.33, -0.33), slab_top, height=0.26)


def dish_head(model, z, accent):
    """A dish that sweeps the sky (moving part "dish", turning on the mast's axis)."""
    model.box((0.0, 0.0, z + 0.02), (0.14, 0.14, 0.04), "steel_dark")
    with model.moving("dish", (0.0, 0.0, z + 0.04)):
        model.cylinder((0.0, 0.0, z + 0.04), (0.0, 0.0, z + 0.08), 0.04, "steel", segments=8)
        with model.placed((0.0, -0.02, z + 0.14), tilt=math.radians(35.0)):
            model.cylinder((0.0, 0.0, -0.02), (0.0, 0.0, 0.04), 0.24, "white", segments=16, end_radius=0.10)
            model.beam((0.0, 0.0, 0.04), (0.0, 0.0, 0.16), 0.012, "steel_dark")
            model.cylinder((0.0, 0.0, 0.16), (0.0, 0.0, 0.18), 0.025, accent, segments=8)


def scope_head(model, z, accent):
    """A telescope tube that pans slowly (moving part "scope")."""
    model.box((0.0, 0.0, z + 0.02), (0.16, 0.16, 0.04), "steel_dark")
    with model.moving("scope", (0.0, 0.0, z + 0.04)):
        model.box((0.0, 0.0, z + 0.05), (0.13, 0.13, 0.02), "steel")
        with model.placed((0.0, 0.0, z + 0.08), tilt=math.radians(50.0)):
            model.cylinder((0.0, 0.0, -0.06), (0.0, 0.0, 0.18), 0.06, "white", segments=12)
            model.cylinder((0.0, 0.0, 0.18), (0.0, 0.0, 0.20), 0.065, accent, segments=12)


def sensor_head(model, z, accent):
    """A sensor dome that turns (moving part "sensor"); the fin on its side shows the turn."""
    model.cylinder((0.0, 0.0, z), (0.0, 0.0, z + 0.05), 0.06, "steel_dark", segments=10)
    with model.moving("sensor", (0.0, 0.0, z + 0.05)):
        model.cylinder((0.0, 0.0, z + 0.05), (0.0, 0.0, z + 0.12), 0.08, "white", segments=12, end_radius=0.02)
        model.cylinder((0.0, 0.0, z + 0.12), (0.0, 0.0, z + 0.14), 0.02, accent, segments=8)
        model.box((0.075, 0.0, z + 0.075), (0.05, 0.012, 0.035), accent)


def rotor_head(model, z, accent):
    """Nacelle and a three-bladed rotor (moving part "rotor", turning on the hub axis)."""
    model.cylinder((0.0, 0.04, z), (0.0, -0.10, z), 0.04, "white", segments=10)
    # Tilted by 90 degrees, the part's own Z axis runs along the hub towards -Y.
    with model.moving("rotor", (0.0, -0.11, z), tilt=math.radians(90.0)):
        model.cylinder((0.0, -0.10, z), (0.0, -0.14, z), 0.03, accent, segments=8, end_radius=0.01)
        for angle in (90, 210, 330):
            x = math.cos(math.radians(angle)) * 0.12
            zz = z + math.sin(math.radians(angle)) * 0.12
            model.beam((0.0, -0.11, z), (x * 2.2, -0.11, z + (zz - z) * 2.2), 0.02, "white")


def drill_head(model, z, accent):
    """A drill string down the middle of the mast, turned by a rotary table on the slab (moving
    part "drill"); a swivel hangs from a crown block at the top."""
    model.box((0.0, 0.0, z + 0.015), (0.14, 0.14, 0.03), "steel_dark")
    model.box((0.0, 0.0, z - 0.06), (0.05, 0.05, 0.06), accent)
    slab = parts.SLAB_TOP
    model.cylinder((0.0, 0.0, slab), (0.0, 0.0, slab + 0.03), 0.09, "steel_dark", segments=10)
    with model.moving("drill", (0.0, 0.0, slab + 0.03)):
        model.cylinder((0.0, 0.0, slab + 0.03), (0.0, 0.0, slab + 0.055), 0.075, accent, segments=6)
        model.box((0.055, 0.0, slab + 0.065), (0.04, 0.025, 0.02), "steel_dark")
        model.box((-0.055, 0.0, slab + 0.065), (0.04, 0.025, 0.02), "steel_dark")
        model.cylinder((0.0, 0.0, slab + 0.055), (0.0, 0.0, z - 0.09), 0.016, "steel_light", segments=6)


def turret(name, accent="red", barrels=1, kind="cannon", cells=(1, 1)):
    """A turret on a fortified base: cannons with barrels, lasers with an emitter, missiles
    with a box launcher."""
    model = kit.Builder(name)
    big = cells != (1, 1)
    half = BIG if big else 0.42
    scale = 1.7 if big else 1.0
    model.box((0.0, 0.0, 0.04), (half * 2.0, half * 2.0, 0.08), "concrete_dark")
    model.box((0.0, 0.0, 0.10), (half * 1.6, half * 1.6, 0.04), "steel_dark")
    for sx in (-1, 1):
        for sy in (-1, 1):
            model.plate((sx * half * 0.8, sy * half * 0.8, 0.1206), (0.06 * scale, 0.06 * scale), "+z", "yellow")
            parts.lamp(model, (sx * half * 0.8, sy * half * 0.8, 0.1206 + 0.009), (0.025, 0.025, 0.018), parts.STATUS)
    model.cylinder((0.0, 0.0, 0.12), (0.0, 0.0, 0.20 * scale), 0.16 * scale, "steel", segments=14)
    with model.placed((0.0, 0.0, 0.20 * scale), turn=math.radians(-35.0)):
        model.box((0.0, 0.0, 0.08 * scale), (0.26 * scale, 0.30 * scale, 0.16 * scale), "steel_dark")
        model.plate((0.0, -0.15 * scale - 0.0006, 0.10 * scale), (0.20 * scale, 0.03 * scale), "-y", accent)
        parts.tip_light(model, (0.08 * scale, 0.10 * scale), 0.16 * scale)
        parts.floodlight(model, (0.10 * scale, -0.15 * scale - 0.018, 0.045 * scale), "-y", size=(0.05, 0.03))
        if kind == "cannon":
            for index in range(barrels):
                x = (index - (barrels - 1) / 2.0) * 0.08 * scale
                model.cylinder((x, -0.14 * scale, 0.09 * scale), (x, -0.42 * scale, 0.11 * scale), 0.022 * scale, "steel_dark", segments=8)
                model.cylinder((x, -0.40 * scale, 0.11 * scale), (x, -0.44 * scale, 0.11 * scale), 0.03 * scale, "dark", segments=8)
        elif kind == "laser":
            model.cylinder((0.0, -0.14 * scale, 0.09 * scale), (0.0, -0.36 * scale, 0.09 * scale), 0.04 * scale, "white", segments=10, end_radius=0.02 * scale)
            model.cylinder((0.0, -0.36 * scale, 0.09 * scale), (0.0, -0.38 * scale, 0.09 * scale), 0.025 * scale, accent, segments=8)
        else:
            model.box((0.0, -0.05 * scale, 0.22 * scale), (0.30 * scale, 0.20 * scale, 0.14 * scale), "steel")
            for x in (-0.08, 0.0, 0.08):
                for z in (0.19, 0.25):
                    model.plate((x * scale, -0.15 * scale - 0.0006, z * scale), (0.05 * scale, 0.04 * scale), "-y", "dark")
    return model.finish()


def dome(name, accent="glow_cyan"):
    """A shield generator: a ring of pylons around a glowing dome."""
    model = kit.Builder(name)
    top = parts.slab(model, top="concrete_dark")
    model.cylinder((0.0, 0.0, top), (0.0, 0.0, top + 0.06), 0.30, "steel_dark", segments=16)
    model.cylinder((0.0, 0.0, top + 0.06), (0.0, 0.0, top + 0.30), 0.24, accent, segments=16, end_radius=0.08)
    for angle in range(45, 405, 90):
        x = math.cos(math.radians(angle)) * 0.33
        y = math.sin(math.radians(angle)) * 0.33
        model.beam((x, y, top), (x, y, top + 0.36), 0.04, "steel")
        model.cylinder((x, y, top + 0.36), (x, y, top + 0.40), 0.03, accent, segments=8)
    return model.finish()


def armor(name, accent="yellow"):
    model = kit.Builder(name)
    model.box((0.0, 0.0, 0.10), (0.84, 0.84, 0.20), "steel_dark")
    for x in (-0.21, 0.21):
        for y in (-0.21, 0.21):
            model.box((x, y, 0.22), (0.38, 0.38, 0.04), "steel")
            for sx in (-1, 1):
                for sy in (-1, 1):
                    model.cylinder((x + sx * 0.15, y + sy * 0.15, 0.24), (x + sx * 0.15, y + sy * 0.15, 0.255), 0.015, "steel_light", segments=6)
    parts.stripes(model, (-0.42, -0.4206), 21, z=0.0, width=0.02)
    return model.finish()


def thruster(name, accent="glow_orange", nozzles=1, size=1.0):
    """A space drive: a fuel block with one or more engine bells pointing down and back."""
    model = kit.Builder(name)
    model.box((0.0, 0.0, 0.03), (0.84, 0.84, 0.06), "steel_dark")
    model.box((0.0, 0.10, 0.06 + 0.17 * size), (0.56, 0.44, 0.34 * size), "steel_light")
    model.plate((0.0, -0.12 - 0.0006, 0.06 + 0.24 * size), (0.56, 0.03), "-y", "yellow")
    for index in range(nozzles):
        x = (index - (nozzles - 1) / 2.0) * (0.50 / max(nozzles, 1))
        r = 0.18 / max(nozzles, 1) ** 0.5 * size
        model.cylinder((x, -0.12, 0.06 + 0.14 * size), (x, -0.36, 0.06 + 0.14 * size), r * 0.6, "steel_dark", segments=12, end_radius=r)
        model.cylinder((x, -0.355, 0.06 + 0.14 * size), (x, -0.365, 0.06 + 0.14 * size), r * 0.85, accent, segments=12)
    parts.pipe(model, [(-0.24, 0.30, 0.06), (-0.24, 0.30, 0.06 + 0.40 * size)], radius=0.02)
    parts.tip_light(model, (-0.24, 0.30), 0.06 + 0.40 * size, radius=0.016)
    model.plate((0.28 + 0.0006, 0.10, 0.06 + 0.27 * size), (0.36, 0.02), "+x", parts.LAMP)
    for x in (-0.20, 0.20):
        parts.lamp(model, (x, 0.10, 0.06 + 0.34 * size + 0.009), (0.025, 0.025, 0.018), parts.STATUS)
    return model.finish()


def wheels(name, accent="yellow", kind="wheel"):
    model = kit.Builder(name)
    model.box((0.0, 0.0, 0.18), (0.70, 0.60, 0.12), "steel_dark")
    model.plate((0.0, -0.30 - 0.0006, 0.18), (0.70, 0.03), "-y", accent)
    if kind == "tracks":
        for x in (-0.30, 0.30):
            model.box((x, 0.0, 0.10), (0.14, 0.78, 0.20), "dark")
            for y in (-0.28, -0.09, 0.09, 0.28):
                model.cylinder((x - 0.08, y, 0.12), (x + 0.08, y, 0.12), 0.07, "steel", segments=10)
    else:
        radius = 0.17 if kind == "heavy" else 0.13
        for x in (-0.36, 0.36):
            for y in (-0.22, 0.22):
                model.cylinder((x - 0.06, y, radius), (x + 0.06, y, radius), radius, "dark", segments=14)
                model.cylinder((x - 0.065, y, radius), (x + 0.065, y, radius), radius * 0.5, "steel_light", segments=10)
    return model.finish()


def field(name, cells=(2, 2), crop="plant", water=False, barn=True, accent="yellow"):
    """A fenced field (cattle farm, water farm) with a barn at the back."""
    model = kit.Builder(name)
    half = BIG
    model.box((0.0, 0.0, 0.02), (half * 2.0, half * 2.0, 0.04), "concrete_dark")
    model.plate((0.0, -0.05, 0.0406), (half * 2.0 - 0.1, half * 1.4), "+z", "glass" if water else "green")
    if water:
        for y in (-0.45, -0.05, 0.35):
            model.box((0.0, y, 0.05), (half * 1.8, 0.03, 0.02), "steel_light")
            for x in (-0.6, -0.2, 0.2, 0.6):
                model.cylinder((x, y, 0.04), (x, y, 0.08), 0.03, "yellow", segments=8)
    else:
        for x, y in ((-0.5, -0.4), (-0.1, -0.2), (0.3, -0.5), (0.5, 0.0), (-0.4, 0.1)):
            model.box((x, y, 0.09), (0.16, 0.08, 0.08), "white")
            model.box((x + 0.09, y, 0.12), (0.06, 0.06, 0.05), "white")
            for dx in (-0.05, 0.05):
                model.beam((x + dx, y, 0.04), (x + dx, y, 0.06), 0.02, "dark")
    parts.fence(model, (-half + 0.02, -half + 0.02), (half - 0.02, -half + 0.02), z=0.04, posts=6)
    parts.fence(model, (half - 0.02, -half + 0.02), (half - 0.02, half * 0.4), z=0.04, posts=5)
    if barn:
        model.box((0.0, half - 0.20, 0.04 + 0.16), (half * 1.4, 0.34, 0.32), "rust_brown")
        model.box((0.0, half - 0.20, 0.04 + 0.34), (half * 1.45, 0.38, 0.04), "rust_brown_dark")
        model.plate((0.0, half - 0.37 - 0.0006, 0.18), (0.28, 0.24), "-y", "dark")
    return model.finish()


def storage_stack(name, accent="yellow", rows=2):
    """Stacked containers in a frame."""
    model = kit.Builder(name)
    top = parts.slab(model, size=0.84, top="concrete")
    colors = ("blue", "rust_brown", accent, "steel")
    for level in range(rows):
        for index, x in enumerate((-0.18, 0.18)):
            color = colors[(level * 2 + index) % len(colors)]
            model.box((x, 0.04, top + 0.10 + level * 0.20), (0.32, 0.62, 0.18), color)
            model.plate((x, -0.27 - 0.0006, top + 0.10 + level * 0.20), (0.24, 0.12), "-y", "dark")
    for x in (-0.38, 0.38):
        for y in (-0.30, 0.38):
            model.beam((x, y, top), (x, y, top + rows * 0.20 + 0.04), 0.03, "steel_dark")
    return model.finish()


def robot_pad(name, cells=(1, 1), accent="yellow"):
    """An open pad with charging posts and small robots."""
    model = kit.Builder(name)
    half = BIG if cells != (1, 1) else 0.42
    model.box((0.0, 0.0, 0.03), (half * 2.0, half * 2.0, 0.06), "steel")
    count = 3 if cells != (1, 1) else 2
    for ix in range(count):
        for iy in range(count):
            x = -half + (ix + 0.5) * half * 2.0 / count
            y = -half + (iy + 0.5) * half * 2.0 / count
            model.plate((x, y, 0.0606), (0.20, 0.20), "+z", accent)
            model.plate((x, y, 0.0612), (0.16, 0.16), "+z", "steel_dark")
            model.box((x, y, 0.10), (0.10, 0.12, 0.08), "white")
            model.cylinder((x, y + 0.02, 0.14), (x, y + 0.02, 0.17), 0.025, "glow_cyan", segments=8)
    parts.edge_lamps(model, half, 0.06, count=count, size=(0.04, 0.016), color=parts.STATUS, margin=0.1)
    parts.lamp_post(model, (half - 0.05, half - 0.05), 0.06, height=0.30)
    return model.finish()


def gate(name, accent="glow_purple"):
    """A ring gate (2x2) on a platform."""
    model = kit.Builder(name)
    model.box((0.0, 0.0, 0.04), (BIG * 2.0, BIG * 2.0, 0.08), "steel_dark")
    centre_z = 0.50
    segments = 16
    radius = 0.44
    for index in range(segments):
        a = 2.0 * math.pi * index / segments
        b = 2.0 * math.pi * (index + 1) / segments
        start = (math.cos(a) * radius, 0.0, centre_z + math.sin(a) * radius)
        end = (math.cos(b) * radius, 0.0, centre_z + math.sin(b) * radius)
        model.beam(start, end, 0.10, "steel")
    model.plate((0.0, 0.0006, centre_z), (0.68, 0.68), "-y", accent)
    for x in (-0.40, 0.40):
        model.box((x, 0.0, 0.18), (0.16, 0.24, 0.20), "steel_dark")
    return model.finish()


def shaft(name, accent="yellow", glass=False):
    """Elevator or staircase: a framed shaft with a door."""
    model = kit.Builder(name)
    top = parts.slab(model, size=0.70, top="steel")
    for x in (-0.28, 0.28):
        for y in (-0.28, 0.28):
            model.beam((x, y, top), (x, y, 0.96), 0.04, "steel_dark")
    for z in (0.40, 0.95):
        parts.railing(model, (0.0, 0.0), (0.56, 0.56), z - 0.02, height=0.02, color=accent)
    for x in (-0.28, 0.28):
        for y in (-0.28, 0.28):
            parts.lamp(model, (x, y, 0.97), (0.035, 0.035, 0.02))
    if glass:
        model.box((0.0, 0.0, 0.50), (0.40, 0.40, 0.84), "glass")
    else:
        for step in range(8):
            z = top + step * 0.11
            model.box((-0.12 + (step % 2) * 0.24, 0.0, z + 0.02), (0.22, 0.40, 0.03), "steel")
    return model.finish()


def towers(name, accent="glow_cyan", count=3, color="steel_light"):
    """Processing towers (atmospheric processor, water synthesizer, geothermal)."""
    model = kit.Builder(name)
    top = parts.slab(model, top="concrete")
    for index in range(count):
        x = -0.22 + index * 0.22
        height = 0.40 + (index % 2) * 0.14
        model.cylinder((x, 0.10, top), (x, 0.10, top + height), 0.08, color, segments=12)
        model.cylinder((x, 0.10, top + height), (x, 0.10, top + height + 0.03), 0.09, accent, segments=12)
        model.plate((x, 0.02 - 0.0006, top + height * 0.5), (0.05, height * 0.6), "-y", "yellow")
        parts.tip_light(model, (x, 0.10), top + height + 0.03, radius=0.016)
        # A ring of small lamps round the tower below its cap.
        for angle in (-90, 0):
            ax, ay = math.cos(math.radians(angle)) * 0.081, math.sin(math.radians(angle)) * 0.081
            parts.lamp(model, (x + ax, 0.10 + ay, top + height - 0.05), (0.025, 0.025, 0.018))
    parts.pipe(model, [(-0.22, -0.10, top + 0.06), (0.22, -0.10, top + 0.06)], radius=0.02)
    parts.control_box(model, (0.28, -0.28))
    parts.lamp_post(model, (-0.33, -0.31), top, height=0.26)
    return model.finish()


# --- The types ---------------------------------------------------------------------------------

ONE = (1, 1)
TWO = (2, 2)

MODELS = {
    # Colony: education and research.
    "basic_school": (lambda: room("te_basic_school", "yellow", fittings=[desks]), ONE),
    "advanced_school": (lambda: room("te_advanced_school", "glow_cyan", fittings=[desks]), ONE),
    "academy": (lambda: room("te_academy", "white", wall="concrete", floor="floor", fittings=[desks]), ONE),
    "elite_academy": (lambda: room("te_elite_academy", "glow_purple", wall="concrete", floor="floor", fittings=[desks, monument]), ONE),
    "university": (lambda: room("te_university", "glow_orange", wall="concrete", floor="floor", fittings=[desks]), ONE),
    "research_institute": (lambda: room("te_research_institute", "glow_cyan", wall="concrete", floor="floor", fittings=[lab_bench]), ONE),
    "research_lab": (lambda: room("te_research_lab", "glow_cyan", fittings=[lab_bench]), ONE),
    "biology_lab": (lambda: room("te_biology_lab", "plant", fittings=[lab_bench]), ONE),
    "chemistry_lab": (lambda: room("te_chemistry_lab", "glow_orange", fittings=[lab_bench]), ONE),
    "electronics_lab": (lambda: room("te_electronics_lab", "glow_cyan", wall="steel", floor="steel", fittings=[lab_bench]), ONE),
    "engineering_lab": (lambda: room("te_engineering_lab", "yellow", wall="steel", floor="steel", fittings=[lab_bench]), ONE),
    "physics_lab": (lambda: room("te_physics_lab", "glow_purple", fittings=[lab_bench]), ONE),
    "planetology_lab": (lambda: room("te_planetology_lab", "rust_brown", fittings=[lab_bench]), ONE),
    # Colony: health, housing, leisure, nature.
    "guard_post": (lambda: room("te_guard_post", "red", wall="steel", floor="steel", fittings=[guard]), ONE),
    "security_center": (lambda: room("te_security_center", "red", wall="concrete", floor="floor", fittings=[guard]), ONE),
    "hospital": (lambda: room("te_hospital", "red", wall="white", floor="white", fittings=[medical]), ONE),
    "medical_center": (lambda: room("te_medical_center", "glow_cyan", wall="white", floor="white", fittings=[medical]), ONE),
    "sanitation_station": (lambda: block("te_sanitation_station", "plant", body="steel", height=0.36, roof=[tanks]), ONE),
    "habitat_t2": (lambda: room("te_habitat_t2", "yellow", fittings=[beds]), ONE),
    "habitat_t3": (lambda: room("te_habitat_t3", "glow_cyan", wall="steel", floor="steel", fittings=[beds]), ONE),
    "habitat_t4": (lambda: room("te_habitat_t4", "glow_orange", wall="concrete", floor="floor", fittings=[beds]), ONE),
    "habitat_t5": (lambda: room("te_habitat_t5", "glow_purple", wall="white", floor="white", fittings=[beds, garden]), ONE),
    "entertainment_center": (lambda: room("te_entertainment_center", "glow_purple", wall="concrete", floor="floor", fittings=[stage]), ONE),
    "experience_arena": (lambda: room("te_experience_arena", "glow_cyan", wall="steel", floor="steel", fittings=[stage]), ONE),
    "gallery": (lambda: room("te_gallery", "glow_orange", wall="white", floor="floor", fittings=[monument]), ONE),
    "luxury_promenade": (lambda: room("te_luxury_promenade", "glow_orange", wall="white", floor="white", fittings=[garden]), ONE),
    "monument": (lambda: room("te_monument", "yellow", wall="concrete", floor="floor", fittings=[monument]), ONE),
    "biosphere": (lambda: room("te_biosphere", "plant", wall="glass", floor="soil", fittings=[garden]), ONE),
    "botanical_garden": (lambda: room("te_botanical_garden", "plant", wall="white", floor="soil", fittings=[garden]), ONE),
    "park_module": (lambda: room("te_park_module", "plant", wall="green", floor="green", fittings=[garden, lamp_posts]), ONE),
    # Logistics.
    "elevator": (lambda: shaft("te_elevator", glass=True), ONE),
    "staircase": (lambda: shaft("te_staircase"), ONE),
    "deep_space_sensor": (lambda: mast("te_deep_space_sensor", "glow_cyan", head=dish_head, height=0.68), TWO),
    "planetary_sensor": (lambda: mast("te_planetary_sensor", "yellow", head=sensor_head), ONE),
    "sensor_post": (lambda: mast("te_sensor_post", "red", head=sensor_head, height=0.60), ONE),
    "space_telescope_module": (lambda: mast("te_space_telescope_module", "glow_purple", head=scope_head, height=0.72), ONE),
    "telescope_module": (lambda: mast("te_telescope_module", "yellow", head=scope_head, height=0.70), ONE),
    "large_storage": (lambda: storage_stack("te_large_storage", "yellow", rows=3), ONE),
    "robot_bay": (lambda: robot_pad("te_robot_bay"), ONE),
    "robot_bay_large": (lambda: robot_pad("te_robot_bay_large", TWO), TWO),
    "trade_module": (lambda: block("te_trade_module", "glow_orange", body="rust_brown", height=0.36, front=[crates_front], roof=[dish_small]), ONE),
    "wormhole_module": (lambda: gate("te_wormhole_module"), TWO),
    # Military.
    "armor_plating": (lambda: armor("te_armor_plating"), ONE),
    "beam_laser": (lambda: turret("te_beam_laser", "glow_cyan", kind="laser"), ONE),
    "pulse_laser": (lambda: turret("te_pulse_laser", "glow_purple", kind="laser"), ONE),
    "shield_generator": (lambda: dome("te_shield_generator"), ONE),
    "spinal_laser": (lambda: turret("te_spinal_laser", "glow_cyan", kind="laser", cells=TWO), TWO),
    "autocannon": (lambda: turret("te_autocannon", "yellow", barrels=2), ONE),
    "medium_cannon": (lambda: turret("te_medium_cannon", "red", barrels=1), ONE),
    "heavy_cannon": (lambda: turret("te_heavy_cannon", "red", barrels=2, cells=TWO), TWO),
    "missile_launcher": (lambda: turret("te_missile_launcher", "red", kind="missile", cells=TWO), TWO),
    # Production.
    "atmospheric_processor": (lambda: towers("te_atmospheric_processor", "glow_cyan", 3), ONE),
    "greenhouse": (lambda: room("te_greenhouse", "plant", wall="glass", floor="soil", fittings=[garden]), ONE),
    "water_synthesizer": (lambda: towers("te_water_synthesizer", "glass", 2, color="white"), ONE),
    "big_pump": (lambda: block("te_big_pump", "red", body="steel", height=0.40, cells=TWO, roof=[tanks, chimneys], front=[barrels_front], lamps=True), TWO),
    "deep_drill": (lambda: mast("te_deep_drill", "yellow", head=drill_head, height=0.85, base="concrete_dark"), ONE),
    "orbital_collector": (lambda: mast("te_orbital_collector", "glow_cyan", head=dish_head, height=0.64), ONE),
    "drive_works": (lambda: block("te_drive_works", "glow_orange", height=0.50, roof=[fans], front=[barrels_front]), ONE),
    "miniaturization_factory": (lambda: block("te_miniaturization_factory", "glow_purple", height=0.50, cells=TWO, roof=[fans, dish_small], front=[crates_front]), TWO),
    "cattle_farm": (lambda: field("te_cattle_farm"), TWO),
    "water_farm": (lambda: field("te_water_farm", water=True, barn=False), TWO),
    "arms_plant": (lambda: block("te_arms_plant", "red", height=0.48, roof=[chimneys], front=[crates_front]), ONE),
    "electronics_factory": (lambda: block("te_electronics_factory", "glow_cyan", height=0.46, roof=[fans], front=[crates_front]), ONE),
    "housing_factory": (lambda: block("te_housing_factory", "yellow", height=0.48, roof=[fans], front=[crates_front]), ONE),
    "fusion_reactor": (lambda: block("te_fusion_reactor", "glow_purple", body="white", height=0.40, roof=[core]), ONE),
    "geothermal_plant": (lambda: towers("te_geothermal_plant", "glow_orange", 2, color="concrete"), ONE),
    "rtg": (lambda: block("te_rtg", "glow_orange", body="steel_dark", height=0.30, roof=[fans]), ONE),
    "core_module": (lambda: core_module("te_core_module"), ONE),
    "tidal_generator": (lambda: block("te_tidal_generator", "glow_cyan", body="white", height=0.30, roof=[fans]), ONE),
    "wind_turbine": (lambda: mast("te_wind_turbine", "red", head=rotor_head, height=0.70), ONE),
    "chemical_plant": (lambda: block("te_chemical_plant", "plant", body="steel", height=0.42, roof=[tanks, chimneys], front=[barrels_front]), ONE),
    "refinery": (lambda: block("te_refinery", "glow_orange", body="steel", height=0.44, roof=[chimneys, tanks], front=[barrels_front]), ONE),
    # Transport.
    "wheel": (lambda: wheels("te_wheel"), ONE),
    "heavy_wheel": (lambda: wheels("te_heavy_wheel", kind="heavy"), ONE),
    "tracks": (lambda: wheels("te_tracks", kind="tracks"), ONE),
    "chemical_thruster": (lambda: thruster("te_chemical_thruster", "glow_orange", 1), ONE),
    "ion_drive": (lambda: thruster("te_ion_drive", "glow_cyan", 2), ONE),
    "fusion_drive": (lambda: thruster("te_fusion_drive", "glow_purple", 1, size=1.3), ONE),
    "epstein_drive": (lambda: thruster("te_epstein_drive", "glow_cyan", 3, size=1.4), ONE),
    "interstellar_navigation": (lambda: room("te_interstellar_navigation", "glow_cyan", wall="steel", floor="steel", fittings=[desks]), ONE),
}


if __name__ == "__main__":
    kit.run_many_from_command_line(MODELS)
