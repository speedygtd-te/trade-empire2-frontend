"""The decoration around a base on the surface (core/perimeter.gd decides which free cell carries
what): a lamp mast with a floodlight, a rotating radar on a pedestal, an antenna mast and a small
beacon with a red light. Writes <name>.glb for each, the radar in two parts: the pedestal
(radar_base) and the turning reflector (radar_dish, its turning axis is the model's up axis
through the origin; the game puts it on top of the pedestal at ColonyView/PerimeterLayer
RADAR_PIVOT and turns it).

The front of every model is -Y (the floodlight shines that way; the game turns it to face away
from the base). Masts may be taller than a module (MAX_HEIGHT): they tower over the base like
real perimeter masts. Many of them stand around a base, so they keep few triangles and small
textures; the recipe ages them moderately.
  blender --background --factory-startup --python scripts/3d/models/perimeter.py -- \
      --output-dir game/world/models/perimeter [--only lamp_mast,radar_dish]

Numbers the game needs (keep game/world/perimeter_layer.gd in step): the floodlight's lens
centre LENS, the radar's turning height PIVOT.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

kit.TEXTURE_PIXELS = 256
kit.BAKE_SAMPLES = 16
# Thin parts: the surface textures repeat more often than on a module.
kit.SURFACE_REPEATS = 4.0

WEAR = 0.6
MAX_HEIGHT = 1.6
# Floodlight: height of its pivot, how far it leans down (degrees), and the lens centre that
# follows from them (x, y, z in Blender; in Godot (x, z, -y)).
HEAD_HEIGHT = 1.12
HEAD_TILT = 38.0
PIVOT = 0.46
LAMP = "glow_lamp"
RED = "glow_red"


def footing(model, half: float = 0.11, height: float = 0.05, color: str = "concrete") -> float:
    """A small concrete foundation with a steel bolt plate. Returns the height of its top."""
    model.box((0.0, 0.0, height / 2.0), (half * 2.0, half * 2.0, height), color)
    model.box((0.0, 0.0, height + 0.008), (half * 1.3, half * 1.3, 0.016), "steel_dark")
    return height + 0.016


def lamp_mast(name):
    """A tapering pole with a hazard band, a switch box and a floodlight on a short arm."""
    model = kit.Builder(name, wear=WEAR)
    top = footing(model)
    model.cylinder((0.0, 0.0, top), (0.0, 0.0, HEAD_HEIGHT), 0.028, "steel", segments=8,
                   end_radius=0.018)
    model.cylinder((0.0, 0.0, top), (0.0, 0.0, top + 0.10), 0.032, "yellow", segments=8)
    model.cylinder((0.0, 0.0, top + 0.035), (0.0, 0.0, top + 0.065), 0.034, "dark", segments=8)
    model.box((0.0, 0.045, 0.30), (0.07, 0.04, 0.10), "steel_light")
    model.plate((0.0, 0.0244, 0.30), (0.04, 0.05), "-y", "yellow")
    # Arm and bracket holding the floodlight in front of the pole.
    model.beam((0.0, 0.0, HEAD_HEIGHT), (0.0, -0.06, HEAD_HEIGHT), 0.022, "steel_dark")
    model.beam((-0.09, -0.06, HEAD_HEIGHT), (0.09, -0.06, HEAD_HEIGHT), 0.016, "steel_dark")
    with model.placed((0.0, -0.06, HEAD_HEIGHT), tilt=math.radians(HEAD_TILT)):
        model.box((0.0, -0.035, 0.0), (0.20, 0.07, 0.085), "steel_dark")
        model.box((0.0, -0.075, 0.048), (0.21, 0.03, 0.012), "steel")
        for x in (-0.05, 0.05):
            model.plate((x, -0.0706, 0.0), (0.085, 0.06), "-y", LAMP)
        # Cooling fins at the back.
        for x in (-0.06, 0.0, 0.06):
            model.box((x, 0.006, 0.0), (0.008, 0.012, 0.07), "steel")
    # A small red marker on top of the pole.
    model.cylinder((0.0, 0.0, HEAD_HEIGHT), (0.0, 0.0, HEAD_HEIGHT + 0.03), 0.016, "steel_dark", segments=6)
    model.cylinder((0.0, 0.0, HEAD_HEIGHT + 0.03), (0.0, 0.0, HEAD_HEIGHT + 0.05), 0.014, RED, segments=6,
                   end_radius=0.006)
    return model.finish()


def lens_centre() -> tuple:
    """Where the floodlight's lens sits (Blender coordinates), from the numbers above."""
    tilt = math.radians(HEAD_TILT)
    y, z = -0.0706, 0.0
    return (0.0, -0.06 + y * math.cos(tilt) - z * math.sin(tilt), HEAD_HEIGHT + y * math.sin(tilt) + z * math.cos(tilt))


def radar_base(name):
    """A pedestal on a concrete pad with an equipment cabinet; the reflector turns on its top."""
    model = kit.Builder(name, wear=WEAR)
    model.box((0.0, 0.0, 0.025), (0.50, 0.50, 0.05), "concrete")
    model.box((0.0, 0.0, 0.058), (0.24, 0.24, 0.016), "steel_dark")
    model.cylinder((0.0, 0.0, 0.066), (0.0, 0.0, PIVOT - 0.04), 0.075, "white", segments=10,
                   end_radius=0.055)
    model.cylinder((0.0, 0.0, PIVOT - 0.04), (0.0, 0.0, PIVOT), 0.085, "yellow", segments=10)
    model.box((0.0, -0.077, 0.20), (0.05, 0.01, 0.14), "steel_dark")
    # Cabinet with a door and a vent.
    model.box((-0.15, 0.14, 0.13), (0.14, 0.12, 0.16), "steel_light")
    model.box((-0.15, 0.14, 0.215), (0.16, 0.14, 0.012), "steel_dark")
    model.plate((-0.15, 0.0794, 0.12), (0.08, 0.12), "-y", "steel")
    model.plate((-0.0794, 0.14, 0.13), (0.06, 0.05), "+x", "dark")
    parts.pipe(model, [(-0.08, 0.12, 0.08), (-0.03, 0.06, 0.08), (-0.03, 0.06, 0.12)], radius=0.012)
    parts.stripes(model, (0.08, -0.235), 4, z=0.05, width=0.025, length=0.035)
    return model.finish()


def radar_dish(name):
    """The turning part: a turntable, a yoke and a curved rectangular reflector leaning back,
    with the feed horn in front of it (facing -Y)."""
    model = kit.Builder(name, wear=WEAR * 0.7)
    model.cylinder((0.0, 0.0, 0.0), (0.0, 0.0, 0.04), 0.07, "steel_dark", segments=10)
    model.box((0.0, 0.0, 0.07), (0.10, 0.08, 0.06), "steel")
    model.beam((0.0, 0.0, 0.10), (0.0, 0.03, 0.17), 0.03, "steel_dark")
    # The reflector: segments on an arc, leaning back by 15 degrees.
    with model.placed((0.0, 0.04, 0.19), tilt=math.radians(-15.0)):
        arc = 0.42
        pieces = 7
        width = 0.56
        for index in range(pieces):
            share = (index + 0.5) / pieces - 0.5
            angle = share * width / arc
            x = math.sin(angle) * arc
            y = arc - math.cos(angle) * arc
            model.box((x, y, 0.0), (width / pieces + 0.004, 0.012, 0.15), "white", turn=angle)
            model.box((x, y + 0.010, 0.0), (width / pieces * 0.4, 0.008, 0.15), "steel_dark", turn=angle)
        model.beam((-width / 2.0, 0.09, 0.0), (width / 2.0, 0.09, 0.0), 0.012, "steel_dark")
        # Feed horn on an arm in front of the reflector.
        model.beam((0.0, 0.0, -0.06), (0.0, -0.16, -0.03), 0.014, "steel_dark")
        model.box((0.0, -0.17, -0.03), (0.06, 0.03, 0.03), "steel_light")
        model.plate((0.0, -0.1856, -0.03), (0.04, 0.018), "-y", "dark")
    return model.finish()


def antenna(name):
    """A slim lattice mast with dipole arms, a microwave drum, guy wires and a red light on top."""
    model = kit.Builder(name, wear=WEAR)
    top = footing(model, half=0.10)
    height = 1.36
    parts.lattice_mast(model, (0.0, 0.0), top, height, 0.06, 0.025, bays=3, leg=0.016)
    for z, reach in ((1.02, 0.15), (1.22, 0.11)):
        model.beam((-reach, 0.0, z), (reach, 0.0, z), 0.012, "steel_dark")
        for x in (-reach, reach):
            model.beam((x, 0.0, z - 0.07), (x, 0.0, z + 0.07), 0.008, "white")
    # A microwave drum looking out to the front.
    model.cylinder((0.0, -0.035, 0.80), (0.0, -0.08, 0.80), 0.06, "white", segments=10)
    model.cylinder((0.0, -0.08, 0.80), (0.0, -0.085, 0.80), 0.045, "steel_light", segments=10)
    # Whip with the red light.
    model.cylinder((0.0, 0.0, height), (0.0, 0.0, height + 0.16), 0.008, "steel_dark", segments=6)
    model.cylinder((0.0, 0.0, height + 0.02), (0.0, 0.0, height + 0.05), 0.02, RED, segments=8)
    # Guy wires to three anchors.
    for index in range(3):
        angle = math.radians(90.0 + index * 120.0)
        anchor = (math.cos(angle) * 0.40, math.sin(angle) * 0.40, 0.0)
        model.box((anchor[0], anchor[1], 0.012), (0.05, 0.05, 0.024), "concrete_dark")
        model.beam((anchor[0], anchor[1], 0.024), (0.0, 0.0, 0.95), 0.004, "steel_dark")
    return model.finish()


def beacon(name):
    """A striped post with a red warning light, marking the base's edge."""
    model = kit.Builder(name, wear=WEAR)
    top = footing(model, half=0.06, height=0.03)
    model.cylinder((0.0, 0.0, top), (0.0, 0.0, 0.30), 0.022, "yellow", segments=8)
    for z in (top + 0.04, top + 0.14):
        model.cylinder((0.0, 0.0, z), (0.0, 0.0, z + 0.05), 0.0235, "dark", segments=8)
    model.cylinder((0.0, 0.0, 0.30), (0.0, 0.0, 0.315), 0.032, "steel_dark", segments=8)
    model.cylinder((0.0, 0.0, 0.315), (0.0, 0.0, 0.37), 0.028, RED, segments=8, end_radius=0.012)
    return model.finish()


ONE = (1, 1)
MODELS = {
    "lamp_mast": (lambda: lamp_mast("te_perimeter_lamp_mast"), ONE),
    "radar_base": (lambda: radar_base("te_perimeter_radar_base"), ONE),
    "radar_dish": (lambda: radar_dish("te_perimeter_radar_dish"), ONE),
    "antenna": (lambda: antenna("te_perimeter_antenna"), ONE),
    "beacon": (lambda: beacon("te_perimeter_beacon"), ONE),
}

if __name__ == "__main__":
    print("LENS %.4f %.4f %.4f" % lens_centre())
    kit.run_many_from_command_line(MODELS, max_height=MAX_HEIGHT)
