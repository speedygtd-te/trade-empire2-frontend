"""The enterprise modules (Backend-V2/docs/SPEC-enterprise-flaggschiff.md, 3.2 and 5.2-5.3) in the
clean enterprise look: kit style "enterprise", painted only with the parts.ENT_* colours and built
from the enterprise parts (parts.ent_room, plinth, display, console, glass_wall ...). White
panels, carbon, glass and cyan light instead of the rough steel, rust and grime of the player
modules. File names are the lower-case type keys (enterprise_factory.glb).

  blender --background --factory-startup --python scripts/3d/models/enterprise.py -- \
      --output-dir game/world/models [--only enterprise_lab,enterprise_generator]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

STYLE = "enterprise"
# Half extents of modules of two and three cells (they stay inside FOOTPRINT of their last cell).
HALF_2 = 0.93
HALF_3 = 1.42
WHITE, SMOOTH, GREY = parts.ENT_WHITE, parts.ENT_SMOOTH, parts.ENT_GREY
CARBON, GRAPHITE, CHROME = parts.ENT_CARBON, parts.ENT_GRAPHITE, parts.ENT_CHROME
LIGHT, LAMP = parts.ENT_LIGHT, parts.ENT_LAMP


def _ring(model, center, radius: float, tube: float, color: str = LIGHT, segments: int = 24) -> None:
    parts.torus(model, center, radius, tube, color, segments=segments, sides=4)


def _sphere(model, center, radius: float, color: str, rings: int = 6, segments: int = 12) -> None:
    profile = [(radius * math.sin(math.pi * k / rings), -radius * math.cos(math.pi * k / rings))
               for k in range(rings + 1)]
    model.revolve(center, profile, color, segments=segments)


def _pod(model, center, size, stripe: str = LIGHT) -> None:
    """A finished white crate with soft corners and a cyan band (what the factory makes)."""
    x, y, z = center
    model.rounded_box((x, y, z + size[2] / 2.0), size, min(size[0], size[1]) * 0.2, SMOOTH)
    model.rounded_box((x, y, z + size[2] * 0.62), (size[0] + 0.004, size[1] + 0.004, size[2] * 0.12),
                      min(size[0], size[1]) * 0.2, stripe)


# --- Enterprise Factory (3x3, unique) ---------------------------------------------------------

def _fabricator(model, z: float, radius: float = 0.26) -> None:
    """The fabrication core: a round white base, a glass drum, a part hovering in a cyan beam
    under the emitter ring, four slim pylons with light lines."""
    model.cylinder((0.0, 0.0, z), (0.0, 0.0, z + 0.03), radius + 0.10, CARBON, segments=24)
    model.cylinder((0.0, 0.0, z + 0.03), (0.0, 0.0, z + 0.08), radius + 0.08, SMOOTH, segments=24)
    _ring(model, (0.0, 0.0, z + 0.03), radius + 0.10, 0.006)
    base = z + 0.08
    head = base + 0.42
    model.cylinder((0.0, 0.0, base), (0.0, 0.0, head), radius, kit.PANE, segments=24)
    model.cylinder((0.0, 0.0, base), (0.0, 0.0, base + 0.015), radius * 0.5, CHROME, segments=20)
    _ring(model, (0.0, 0.0, base + 0.016), radius * 0.5, 0.005)
    _pod(model, (0.0, 0.0, base + 0.13), (0.13, 0.13, 0.10))
    model.cylinder((0.0, 0.0, base + 0.015), (0.0, 0.0, base + 0.13), 0.012, LIGHT, segments=8)
    model.cylinder((0.0, 0.0, base + 0.23), (0.0, 0.0, head), 0.016, LIGHT, segments=8)
    model.cylinder((0.0, 0.0, head), (0.0, 0.0, head + 0.06), radius + 0.04, SMOOTH, segments=24)
    model.cylinder((0.0, 0.0, head + 0.02), (0.0, 0.0, head + 0.035), radius + 0.043, LIGHT, segments=24)
    model.cylinder((0.0, 0.0, head + 0.06), (0.0, 0.0, head + 0.085), radius * 0.6, CARBON, segments=20)
    model.cylinder((0.0, 0.0, head + 0.085), (0.0, 0.0, head + 0.10), radius * 0.25, CHROME, segments=12)
    for index in range(4):
        angle = math.pi / 4.0 + index * math.pi / 2.0
        reach = radius + 0.045
        parts.corner_post(model, (math.cos(angle) * reach, math.sin(angle) * reach), base, head, radius=0.028,
                          color=SMOOTH, outward=(math.cos(angle), math.sin(angle)))


def _line(model, z: float, turn: float, start: float, end: float, seed: int) -> None:
    """One of the four production lines, running out from the core along +x of *turn*: a carbon
    belt between white rails with cyan lines, a sleek arm beside it, finished crates on the belt
    and a delivery bay with crates at its end."""
    with model.placed((0.0, 0.0, 0.0), turn=turn):
        length = end - start
        middle = (start + end) / 2.0
        belt = z + 0.07
        model.rounded_box((middle, 0.0, z + 0.03), (length, 0.16, 0.06), 0.02, SMOOTH)
        model.box((middle, 0.0, belt - 0.004), (length, 0.11, 0.008), CARBON)
        for side in (-1, 1):
            model.box((middle, side * 0.065, belt), (length, 0.018, 0.02), SMOOTH)
            parts.light_strip(model, (start + 0.02, side * 0.075, belt + 0.004), (end - 0.02, side * 0.075, belt + 0.004),
                              0.006)
        for share in (0.30, 0.68):
            _pod(model, (start + length * share, 0.0, belt), (0.075, 0.075, 0.055))
        parts.robot_arm_clean(model, (start + length * 0.48, 0.17), 0.0, z, reach=0.17)
        # The delivery bay: a graphite pad outlined in cyan, two crates waiting.
        bay = end + 0.17
        model.plate((bay, 0.0, z + 0.0012), (0.28, 0.34), "+z", LIGHT)
        model.plate((bay, 0.0, z + 0.0024), (0.26, 0.32), "+z", GRAPHITE)
        _pod(model, (bay - 0.04, -0.07, z), (0.11, 0.11, 0.09))
        _pod(model, (bay + 0.05, 0.08, z), (0.09, 0.09, 0.07))


def factory():
    model = kit.Builder("te_enterprise_factory", style=STYLE)
    top = parts.ent_room(model, HALF_3, height=0.46)
    with model.placed((0.08, -0.08, 0.0)):
        # Guide lines on the floor round the core.
        for sign in (-1, 1):
            model.plate((0.0, sign * 0.52, top + 0.0012), (1.04, 0.008), "+z", LIGHT)
            model.plate((sign * 0.52, 0.0, top + 0.0012), (0.008, 1.04), "+z", LIGHT)
        _fabricator(model, top)
        for index, turn in enumerate((0.0, math.pi / 2.0, math.pi, -math.pi / 2.0)):
            reach = 0.86 if index in (1, 2) else 0.92
            _line(model, top, turn, 0.40, reach, seed=index)
    # Displays along the lower back and left walls, consoles of the control post at the front right.
    for index, x in enumerate((-0.80, -0.20, 0.40, 1.00)):
        parts.display(model, (x, HALF_3 - 0.05 - 0.001, top + 0.125), (0.36, 0.12), "-y", seed=10 + index)
    for index, y in enumerate((0.85, 0.25, -0.45, -1.05)):
        parts.display(model, (-HALF_3 + 0.05 + 0.001, y, top + 0.125), (0.36, 0.12), "+x", seed=20 + index)
    parts.console(model, (1.10, -1.18), top, width=0.24, seed=31)
    parts.console(model, (0.78, -1.18), top, width=0.24, seed=32)
    # Racks of finished crates in the back left corner.
    for x in (-1.20, -1.02):
        for y in (1.20, 1.02):
            _pod(model, (x, y, top), (0.14, 0.14, 0.12))
            _pod(model, (x, y, top + 0.12), (0.12, 0.12, 0.10))
    return model.finish()


# --- Enterprise Lab (2x2, unique) -------------------------------------------------------------

def _holo_table(model, center, z: float) -> None:
    """A round table with a glowing top and a hologram above it: a gyroscope of three thin rings
    round a lit core."""
    x, y = center
    model.cylinder((x, y, z), (x, y, z + 0.02), 0.12, CARBON, segments=20)
    model.cylinder((x, y, z + 0.02), (x, y, z + 0.11), 0.07, SMOOTH, segments=16)
    model.cylinder((x, y, z + 0.11), (x, y, z + 0.13), 0.23, SMOOTH, segments=28)
    model.cylinder((x, y, z + 0.13), (x, y, z + 0.134), 0.20, parts.ENT_SCREEN, segments=28)
    _ring(model, (x, y, z + 0.13), 0.215, 0.006, segments=28)
    middle = z + 0.32
    for tilt, turn in ((0.0, 0.0), (1.1, 0.3), (1.1, 2.4)):
        with model.placed((x, y, middle), turn=turn, tilt=tilt):
            _ring(model, (0.0, 0.0, 0.0), 0.13, 0.004, LIGHT, segments=24)
    _sphere(model, (x, y, middle), 0.035, LAMP, rings=5, segments=10)
    model.cylinder((x, y, z + 0.134), (x, y, middle - 0.03), 0.006, LIGHT, segments=6)


def _sample_column(model, position, z: float, height: float = 0.16) -> None:
    """A glass column half full of a glowing sample, white caps top and bottom."""
    x, y = position
    model.cylinder((x, y, z), (x, y, z + 0.025), 0.045, SMOOTH, segments=12)
    model.cylinder((x, y, z + 0.025), (x, y, z + height - 0.02), 0.036, kit.PANE, segments=12)
    model.cylinder((x, y, z + 0.025), (x, y, z + 0.025 + (height - 0.045) * 0.55), 0.030, LIGHT, segments=12)
    model.cylinder((x, y, z + height - 0.02), (x, y, z + height), 0.045, SMOOTH, segments=12)
    model.cylinder((x, y, z + height), (x, y, z + height + 0.006), 0.02, CHROME, segments=10)


def lab():
    model = kit.Builder("te_enterprise_lab", style=STYLE)
    half = HALF_2
    top = parts.ent_room(model, half, height=0.44)
    _holo_table(model, (0.14, -0.14), top)
    # A long bench along the back wall with sample columns and a display.
    model.rounded_box((0.10, half - 0.15, top + 0.07), (1.10, 0.15, 0.14), 0.03, SMOOTH)
    model.box((0.10, half - 0.15, top + 0.145), (1.12, 0.17, 0.014), CARBON)
    parts.light_strip(model, (-0.42, half - 0.226, top + 0.02), (0.62, half - 0.226, top + 0.02), 0.008)
    for index, x in enumerate((-0.36, -0.24, -0.12)):
        _sample_column(model, (x, half - 0.15), top + 0.152, height=0.15 + 0.02 * (index % 2))
    parts.display(model, (0.30, half - 0.09, top + 0.235), (0.34, 0.15), "-y", seed=41)
    parts.display(model, (0.52, half - 0.17, top + 0.152 + 0.004), (0.12, 0.08), "+z", seed=42, depth=0.006)
    # An analysis tower in the back right corner.
    model.rounded_box((half - 0.12, half - 0.14, top + 0.17), (0.14, 0.14, 0.34), 0.04, WHITE)
    parts.light_strip(model, (half - 0.12, half - 0.211, top + 0.06), (half - 0.12, half - 0.211, top + 0.30), 0.012)
    model.cylinder((half - 0.12, half - 0.14, top + 0.34), (half - 0.12, half - 0.14, top + 0.37), 0.05, CHROME,
                   segments=14)
    # Displays on the left wall, two consoles at the front.
    parts.display(model, (-half + 0.05 + 0.001, 0.05, top + 0.11), (0.42, 0.13), "+x", seed=43)
    parts.display(model, (-half + 0.05 + 0.001, -0.52, top + 0.11), (0.26, 0.13), "+x", seed=44)
    parts.console(model, (-0.42, -0.70), top, width=0.22, seed=45)
    parts.console(model, (0.62, -0.62), top, width=0.20, turn=0.5, seed=46)
    return model.finish()


# --- Enterprise Supply Hub (2x2, unique, symbolic) ---------------------------------------------

def supply_hub():
    """The symbol of the central supply: a glass column with a stack of glowing supply crates under
    a ringed cap, linked by lit conduits to four white nodes in the corners."""
    model = kit.Builder("te_enterprise_supply_hub", style=STYLE)
    top = parts.plinth(model, (HALF_2, HALF_2), height=0.05, radius=0.22)
    _ring(model, (0.0, 0.0, top + 0.001), 0.52, 0.006, segments=32)
    _ring(model, (0.0, 0.0, top + 0.001), 0.40, 0.004, segments=32)
    # The column.
    model.cylinder((0.0, 0.0, top), (0.0, 0.0, top + 0.03), 0.34, CARBON, segments=28)
    model.cylinder((0.0, 0.0, top + 0.03), (0.0, 0.0, top + 0.07), 0.31, SMOOTH, segments=28)
    _ring(model, (0.0, 0.0, top + 0.03), 0.34, 0.006, segments=28)
    base = top + 0.07
    head = base + 0.56
    model.cylinder((0.0, 0.0, base), (0.0, 0.0, head), 0.22, kit.PANE, segments=24)
    model.cylinder((0.0, 0.0, base), (0.0, 0.0, head), 0.03, CARBON, segments=10)
    for level in range(4):
        z = base + 0.03 + level * 0.13
        with model.placed((0.0, 0.0, z), turn=level * math.pi / 8.0):
            model.rounded_box((0.0, 0.0, 0.05), (0.15, 0.15, 0.10), 0.03, SMOOTH)
            model.rounded_box((0.0, 0.0, 0.05), (0.154, 0.154, 0.016), 0.03, LIGHT)
    model.cylinder((0.0, 0.0, head), (0.0, 0.0, head + 0.05), 0.26, SMOOTH, segments=28)
    model.cylinder((0.0, 0.0, head + 0.015), (0.0, 0.0, head + 0.03), 0.263, LIGHT, segments=28)
    model.cylinder((0.0, 0.0, head + 0.05), (0.0, 0.0, head + 0.07), 0.17, CARBON, segments=24)
    model.cylinder((0.0, 0.0, head + 0.07), (0.0, 0.0, head + 0.09), 0.08, CHROME, segments=16)
    _sphere(model, (0.0, 0.0, head + 0.11), 0.026, LAMP, rings=4, segments=10)
    for index in range(4):
        angle = math.pi / 4.0 + index * math.pi / 2.0
        ux, uy = math.cos(angle), math.sin(angle)
        # The conduit: a carbon pipe with a cyan line along its top.
        near, far = 0.33, 0.72
        model.cylinder((ux * near, uy * near, top + 0.035), (ux * far, uy * far, top + 0.035), 0.03, CARBON,
                       segments=10)
        parts.light_strip(model, (ux * near, uy * near, top + 0.064), (ux * far, uy * far, top + 0.064), 0.008)
        # The node in the corner.
        node = 0.85
        with model.placed((ux * node, uy * node, top), turn=angle - math.pi / 4.0):
            model.rounded_box((0.0, 0.0, 0.09), (0.22, 0.22, 0.18), 0.06, WHITE)
            model.rounded_box((0.0, 0.0, 0.185), (0.16, 0.16, 0.012), 0.045, GRAPHITE)
            model.plate((0.0, 0.0, 0.1912), (0.10, 0.012), "+z", LIGHT)
            model.plate((0.0, 0.0, 0.1912), (0.012, 0.10), "+z", LIGHT)
            model.rounded_box((0.0, 0.0, 0.03), (0.226, 0.226, 0.012), 0.06, CARBON)
    return model.finish()


# --- Enterprise Generator (1x1) ---------------------------------------------------------------

def generator():
    """A glass reactor chamber with a lit core held by two chrome rings, on a soft white body;
    four slim pylons with light lines carry the cap. Cool and calm next to the purple fusion
    reactor of the players."""
    model = kit.Builder("te_enterprise_generator", style=STYLE)
    top = parts.plinth(model, 0.42, height=0.05, radius=0.08)
    model.rounded_box((0.0, 0.0, top + 0.06), (0.56, 0.56, 0.12), 0.08, WHITE)
    model.rounded_box((0.0, 0.0, top + 0.005), (0.57, 0.57, 0.01), 0.08, CARBON)
    parts.light_strip(model, (-0.20, -0.283, top + 0.10), (0.20, -0.283, top + 0.10), 0.008)
    parts.light_strip(model, (0.283, -0.20, top + 0.10), (0.283, 0.20, top + 0.10), 0.008)
    parts.display(model, (0.0, -0.281, top + 0.055), (0.22, 0.07), "-y", seed=51, depth=0.006)
    base = top + 0.12
    head = base + 0.40
    radius = 0.15
    model.cylinder((0.0, 0.0, base), (0.0, 0.0, base + 0.02), radius + 0.03, CARBON, segments=24)
    model.cylinder((0.0, 0.0, base + 0.02), (0.0, 0.0, head), radius, kit.PANE, segments=24)
    middle = (base + head) / 2.0 + 0.01
    model.cylinder((0.0, 0.0, base + 0.02), (0.0, 0.0, head), 0.010, LIGHT, segments=8)
    _sphere(model, (0.0, 0.0, middle), 0.088, LIGHT, rings=6, segments=14)
    _sphere(model, (0.0, 0.0, middle), 0.060, LAMP, rings=5, segments=12)
    # Light rings where the glass meets its base and its cap.
    _ring(model, (0.0, 0.0, base + 0.026), radius - 0.006, 0.007)
    _ring(model, (0.0, 0.0, head - 0.006), radius - 0.006, 0.007)
    for tilt, turn in ((0.5, 0.0), (0.5, math.pi)):
        with model.placed((0.0, 0.0, middle), turn=turn, tilt=tilt):
            _ring(model, (0.0, 0.0, 0.0), 0.11, 0.008, CHROME, segments=24)
    model.cylinder((0.0, 0.0, head), (0.0, 0.0, head + 0.06), radius + 0.04, SMOOTH, segments=24)
    model.cylinder((0.0, 0.0, head + 0.02), (0.0, 0.0, head + 0.032), radius + 0.043, LIGHT, segments=24)
    model.cylinder((0.0, 0.0, head + 0.06), (0.0, 0.0, head + 0.085), radius, CARBON, segments=20)
    model.cylinder((0.0, 0.0, head + 0.085), (0.0, 0.0, head + 0.10), 0.05, CHROME, segments=12)
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.corner_post(model, (sx * 0.14, sy * 0.14), base, head, radius=0.025, color=SMOOTH,
                              outward=(sx * 0.707, sy * 0.707))
    return model.finish()


# --- Enterprise Habitat T3 (1x1) --------------------------------------------------------------

def habitat_t3():
    """A bright crew cabin: a white bed with a blue-grey blanket, a desk with a display, a lounge
    chair by a round table, a plant; white panels below glass, a cyan cove light."""
    model = kit.Builder("te_enterprise_habitat_t3", style=STYLE)
    top = parts.ent_room(model, 0.42, height=0.40)
    # The bed against the back wall.
    model.rounded_box((-0.12, 0.21, top + 0.03), (0.32, 0.20, 0.06), 0.03, SMOOTH)
    model.rounded_box((-0.12, 0.21, top + 0.005), (0.30, 0.18, 0.01), 0.03, CARBON)
    model.rounded_box((-0.12, 0.21, top + 0.07), (0.30, 0.18, 0.025), 0.03, SMOOTH)
    model.rounded_box((-0.06, 0.21, top + 0.087), (0.19, 0.185, 0.012), 0.02, "ent_fabric")
    model.rounded_box((-0.235, 0.21, top + 0.092), (0.05, 0.13, 0.02), 0.015, SMOOTH)
    parts.light_strip(model, (-0.26, 0.105, top + 0.012), (0.02, 0.105, top + 0.012), 0.006)
    # A floating desk with a display on the back wall at the right.
    model.rounded_box((0.22, 0.27, top + 0.12), (0.22, 0.10, 0.014), 0.02, SMOOTH)
    model.box((0.22, 0.32, top + 0.06), (0.012, 0.01, 0.12), GRAPHITE)
    parts.display(model, (0.22, 0.29, top + 0.17), (0.16, 0.08), "-y", seed=61, depth=0.008)
    # Lounge chair and a round side table at the front.
    with model.placed((-0.16, -0.17, top), turn=0.5):
        model.rounded_box((0.0, 0.0, 0.035), (0.11, 0.11, 0.03), 0.03, GRAPHITE)
        model.rounded_box((0.0, 0.045, 0.075), (0.11, 0.025, 0.09), 0.012, GRAPHITE)
        model.cylinder((0.0, 0.0, 0.0), (0.0, 0.0, 0.02), 0.03, CHROME, segments=10)
    model.cylinder((0.02, -0.22, top), (0.02, -0.22, top + 0.06), 0.008, CHROME, segments=8)
    model.cylinder((0.02, -0.22, top + 0.06), (0.02, -0.22, top + 0.07), 0.055, SMOOTH, segments=16)
    # A plant in a white pot.
    model.cylinder((0.28, -0.26, top), (0.28, -0.26, top + 0.07), 0.045, SMOOTH, segments=12)
    model.cylinder((0.28, -0.26, top + 0.02), (0.28, -0.26, top + 0.028), 0.047, LIGHT, segments=12)
    model.lump((0.28, -0.26, top + 0.12), (0.12, 0.12, 0.13), "plant", seed=7, rough=0.2)
    return model.finish()


# --- Enterprise Sublight Thruster (1x1, outdoor) ----------------------------------------------

def sublight_thruster():
    """A sleek white nacelle on a carbon pylon, its nozzle to the front with a glowing cyan
    throat; a chrome containment ring with four lit nodes turns round it (moving part rotor)."""
    model = kit.Builder("te_enterprise_sublight_thruster", style=STYLE)
    top = parts.plinth(model, 0.40, height=0.05, radius=0.08)
    axis = 0.31
    # The pylon.
    model.rounded_box((0.0, 0.08, top + 0.06), (0.14, 0.30, 0.12), 0.04, CARBON)
    model.rounded_box((0.0, 0.08, top + 0.125), (0.10, 0.26, 0.03), 0.03, SMOOTH)
    # The nacelle along -y (the nozzle looks to the front); heights of the profile run to -y.
    profile = [
        (0.0, -0.385, GRAPHITE), (0.10, -0.385), (0.13, -0.37, SMOOTH), (0.165, -0.30), (0.185, -0.17),
        (0.19, -0.02, CARBON), (0.19, 0.04, SMOOTH), (0.18, 0.14), (0.16, 0.22, GRAPHITE), (0.13, 0.26, GRAPHITE),
        (0.15, 0.33, GRAPHITE), (0.168, 0.385, GRAPHITE), (0.14, 0.385, LIGHT), (0.08, 0.34, LAMP), (0.0, 0.31),
    ]
    with model.placed((0.0, 0.0, axis), tilt=math.pi / 2.0):
        model.revolve((0.0, 0.0, 0.0), profile, SMOOTH, segments=20, sharp=35.0)
        # Intake grille at the back and a dorsal fin.
    model.plate((0.0, 0.386, axis), (0.14, 0.14), "+y", GRAPHITE)
    model.rounded_box((0.0, 0.04, axis + 0.21), (0.022, 0.26, 0.06), 0.01, WHITE)
    parts.light_strip(model, (0.0, -0.06, axis + 0.24), (0.0, 0.15, axis + 0.24), 0.008)
    for side in (-1, 1):
        parts.light_strip(model, (side * 0.19, -0.22, axis), (side * 0.19, 0.10, axis), 0.008)
    # The turning containment ring.
    ring_y = -0.12
    with model.moving("rotor", (0.0, ring_y, axis), tilt=math.pi / 2.0):
        with model.placed((0.0, ring_y, axis), tilt=math.pi / 2.0):
            _ring(model, (0.0, 0.0, 0.0), 0.225, 0.014, CHROME, segments=28)
            for index in range(4):
                angle = index * math.pi / 2.0 + math.pi / 4.0
                model.box((math.cos(angle) * 0.225, math.sin(angle) * 0.225, 0.0), (0.035, 0.035, 0.035), LIGHT,
                          turn=angle)
    return model.finish()


ONE = (1, 1)
MODELS = {
    "enterprise_factory": (factory, (3, 3)),
    "enterprise_lab": (lab, (2, 2)),
    "enterprise_supply_hub": (supply_hub, (2, 2)),
    "enterprise_generator": (generator, ONE),
    "enterprise_habitat_t3": (habitat_t3, ONE),
    "enterprise_sublight_thruster": (sublight_thruster, ONE),
}

if __name__ == "__main__":
    kit.run_many_from_command_line(MODELS)
