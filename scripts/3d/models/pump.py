"""Pump (1x1x1): a steel lattice tower over a riser pipe on a concrete slab, with an outlet
pipe, a valve, a control box and a short fence.

Modelled after the V1 sprite src/assets/modules/pump/pump_0.webp. The tower is squatter than
in the sprite: in 3D a 1x1x1 module has to stay inside its cell in height as well.

  blender --background --factory-startup --python scripts/3d/models/pump.py -- --output <file.glb>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

NAME = "te_pump"

SLAB_TOP = 0.07
# Centre of the tower on the slab; the valve and the fence take the right-hand side.
TOWER = (-0.06, 0.06)
FRAME_HALF = 0.17
FRAME_TOP = 0.30
MAST_BOTTOM = 0.325
MAST_TOP = 0.83
MAST_HALF_BOTTOM = 0.12
MAST_HALF_TOP = 0.085
MAST_BAYS = 3
VALVE = (0.27, -0.14)
CORNERS = ((-1, -1), (1, -1), (1, 1), (-1, 1))


def build():
    parts = kit.Builder(NAME)
    _slab(parts)
    _frame(parts)
    _mast(parts)
    _head(parts)
    _piping(parts)
    _extras(parts)
    return parts.finish()


def _at(half: float, corner, z: float):
    return (TOWER[0] + corner[0] * half, TOWER[1] + corner[1] * half, z)


def _slab(parts) -> None:
    parts.box((0.0, 0.0, 0.025), (0.80, 0.80, 0.05), "concrete_dark")
    parts.box((0.0, 0.0, 0.06), (0.76, 0.76, 0.02), "concrete")
    # Two steps up to the slab at the front.
    parts.box((-0.22, -0.4125, 0.0235), (0.12, 0.025, 0.047), "concrete")
    parts.box((-0.22, -0.4375, 0.0115), (0.12, 0.025, 0.023), "concrete")


def _frame(parts) -> None:
    """The cube-shaped base of the tower: four legs, a cross on every side, a collar on top."""
    for corner in CORNERS:
        parts.beam(_at(FRAME_HALF, corner, SLAB_TOP), _at(FRAME_HALF, corner, FRAME_TOP),
                   0.035, "steel")
    for index, corner in enumerate(CORNERS):
        following = CORNERS[(index + 1) % 4]
        parts.beam(_at(FRAME_HALF, corner, SLAB_TOP + 0.01),
                   _at(FRAME_HALF, following, FRAME_TOP - 0.01), 0.02, "steel_dark")
        parts.beam(_at(FRAME_HALF, following, SLAB_TOP + 0.01),
                   _at(FRAME_HALF, corner, FRAME_TOP - 0.01), 0.02, "steel_dark")
    parts.box((TOWER[0], TOWER[1], FRAME_TOP + 0.0125), (0.40, 0.40, 0.025), "steel_dark")


def _mast(parts) -> None:
    """The tapering lattice mast: four legs, rings between the bays, a cross per bay and side."""
    def half(level: int) -> float:
        return MAST_HALF_BOTTOM + (MAST_HALF_TOP - MAST_HALF_BOTTOM) * level / MAST_BAYS

    def height(level: int) -> float:
        return MAST_BOTTOM + (MAST_TOP - MAST_BOTTOM) * level / MAST_BAYS

    for corner in CORNERS:
        parts.beam(_at(MAST_HALF_BOTTOM, corner, MAST_BOTTOM), _at(MAST_HALF_TOP, corner, MAST_TOP),
                   0.028, "steel")
    for level in range(MAST_BAYS):
        for index, corner in enumerate(CORNERS):
            following = CORNERS[(index + 1) % 4]
            if level > 0:
                parts.beam(_at(half(level), corner, height(level)),
                           _at(half(level), following, height(level)), 0.018, "steel")
            parts.beam(_at(half(level), corner, height(level)),
                       _at(half(level + 1), following, height(level + 1)), 0.014, "steel_dark")
            parts.beam(_at(half(level), following, height(level)),
                       _at(half(level + 1), corner, height(level + 1)), 0.014, "steel_dark")


def _head(parts) -> None:
    """Platform, motor and antenna on top of the mast."""
    x, y = TOWER
    parts.box((x, y, MAST_TOP + 0.015), (0.24, 0.24, 0.03), "steel_dark")
    parts.cylinder((x, y, MAST_TOP + 0.03), (x, y, MAST_TOP + 0.09), 0.05, "rust")
    parts.box((x, y, MAST_TOP + 0.10), (0.05, 0.05, 0.02), "steel_dark")
    parts.beam((x + 0.09, y + 0.09, MAST_TOP + 0.03), (x + 0.09, y + 0.09, 0.97), 0.008,
               "steel_light")


def _piping(parts) -> None:
    """Riser pipe inside the tower, outlet pipe along the slab, valve with a hand wheel."""
    x, y = TOWER
    parts.cylinder((x, y, SLAB_TOP), (x, y, SLAB_TOP + 0.03), 0.055, "steel_dark")
    parts.cylinder((x, y, SLAB_TOP + 0.03), (x, y, MAST_TOP), 0.03, "steel_light", segments=8)
    pipe_height = 0.125
    parts.cylinder((x, y, pipe_height), (VALVE[0], y, pipe_height), 0.018, "steel_dark", segments=6)
    parts.box((VALVE[0], y, pipe_height), (0.045, 0.045, 0.045), "steel_dark")
    parts.cylinder((VALVE[0], y, pipe_height), (VALVE[0], VALVE[1], pipe_height), 0.018,
                   "steel_dark", segments=6)
    parts.cylinder((VALVE[0], VALVE[1], SLAB_TOP), (VALVE[0], VALVE[1], 0.19), 0.03, "red",
                   segments=8)
    parts.cylinder((VALVE[0], VALVE[1], 0.19), (VALVE[0], VALVE[1], 0.205), 0.038, "steel_dark",
                   segments=8)
    parts.cylinder((VALVE[0], VALVE[1], 0.205), (VALVE[0], VALVE[1], 0.225), 0.008, "steel_dark",
                   segments=6)
    parts.cylinder((VALVE[0], VALVE[1], 0.225), (VALVE[0], VALVE[1], 0.235), 0.045, "yellow",
                   segments=8)


def _extras(parts) -> None:
    """Control box with a sign at the front left, warning stripes along the front edge, a
    short fence along the right edge."""
    parts.box((-0.27, -0.27, SLAB_TOP + 0.035), (0.09, 0.06, 0.07), "steel_light")
    parts.box((-0.27, -0.27, SLAB_TOP + 0.075), (0.10, 0.07, 0.01), "yellow")
    parts.plate((-0.27, -0.3005, SLAB_TOP + 0.038), (0.06, 0.04), "-y", "yellow")
    parts.plate((-0.27, -0.301, SLAB_TOP + 0.038), (0.04, 0.012), "-y", "steel_dark")
    stripe = 0.04
    for index in range(10):
        parts.plate((-0.08 + index * stripe, -0.35, SLAB_TOP + 0.0006), (stripe, 0.03), "+z",
                    "yellow" if index % 2 == 0 else "steel_dark")
    fence_x = 0.35
    for y in (-0.34, -0.17, 0.0):
        parts.beam((fence_x, y, SLAB_TOP), (fence_x, y, SLAB_TOP + 0.10), 0.012, "steel_dark")
    for z in (SLAB_TOP + 0.05, SLAB_TOP + 0.095):
        parts.beam((fence_x, -0.34, z), (fence_x, 0.0, z), 0.008, "steel_dark")


if __name__ == "__main__":
    kit.run_from_command_line(build)
