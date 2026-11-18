"""Collector (1x1x1): a blue machine block on four legs over a yellow intake floor, with a
gateway at the front, yellow trim along the roof edge, an intake duct on the roof and two
motors beside it, on a steel platform.

Modelled after the V1 sprite src/assets/modules/collector/collector_0.webp.

  blender --background --factory-startup --python scripts/3d/models/collector.py -- --output <file.glb>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

NAME = "te_collector"

BASE = 0.05
HALF = 0.31
LEGS_TOP = 0.24
BODY_TOP = 0.62


def build():
    model = kit.Builder(NAME)
    model.box((0.0, 0.0, BASE / 2.0), (0.84, 0.84, BASE), "floor")
    for sx in (-1, 1):
        for sy in (-1, 1):
            model.cylinder((sx * 0.37, sy * 0.37, BASE), (sx * 0.37, sy * 0.37, BASE + 0.008), 0.022,
                           "steel_dark", segments=8)
    model.plate((0.0, 0.0, BASE + 0.0006), (0.50, 0.50), "+z", "yellow")

    for sx in (-1, 1):
        for sy in (-1, 1):
            model.box((sx * (HALF - 0.06), sy * (HALF - 0.06), (BASE + LEGS_TOP) / 2.0),
                      (0.12, 0.12, LEGS_TOP - BASE), "blue")
    model.box((0.0, 0.0, (LEGS_TOP + BODY_TOP) / 2.0), (HALF * 2.0, HALF * 2.0, BODY_TOP - LEGS_TOP),
              "blue")
    # Gateway at the front left, window at the right.
    model.plate((-0.08, -HALF - 0.0006, LEGS_TOP + 0.09), (0.26, 0.18), "-y", "dark")
    parts.window(model, (HALF, -0.06, LEGS_TOP + 0.20), (0.10, 0.12), "+x")
    parts.vent(model, (0.16, -HALF, LEGS_TOP + 0.22), (0.12, 0.07), "-y")
    # Yellow trim: a band below the roof edge on the two walls the camera sees, squares on the roof.
    model.plate((0.0, -HALF - 0.0006, BODY_TOP - 0.03), (HALF * 2.0 - 0.04, 0.025), "-y", "yellow")
    model.plate((HALF + 0.0006, 0.0, BODY_TOP - 0.03), (HALF * 2.0 - 0.04, 0.025), "+x", "yellow")
    for index in range(4):
        offset = -0.21 + index * 0.14
        for position in ((offset, -HALF + 0.035), (offset, HALF - 0.035), (-HALF + 0.035, offset),
                         (HALF - 0.035, offset)):
            model.plate((*position, BODY_TOP + 0.0006), (0.035, 0.035), "+z", "yellow")

    # Roof: intake duct from a housing at the back right to its mouth at the front left.
    model.box((0.02, 0.02, BODY_TOP + 0.01), (0.26, 0.22, 0.02), "blue_dark")
    model.box((0.15, 0.14, BODY_TOP + 0.085), (0.20, 0.18, 0.13), "blue")
    model.box((0.15, 0.14, BODY_TOP + 0.16), (0.22, 0.20, 0.02), "blue_dark")
    model.cylinder((0.08, 0.08, BODY_TOP + 0.08), (-0.16, -0.10, BODY_TOP + 0.08), 0.05, "blue")
    model.cylinder((-0.16, -0.10, BODY_TOP + 0.08), (-0.19, -0.125, BODY_TOP + 0.08), 0.058,
                   "steel_dark")

    # Two motors on the platform, in front of and left of the block.
    parts.drum(model, (-0.36, -0.02, BASE + 0.065), (-0.36, -0.16, BASE + 0.065), 0.06)
    parts.drum(model, (0.05, -0.37, BASE + 0.065), (0.19, -0.37, BASE + 0.065), 0.06)
    parts.pipe(model, [(-0.36, 0.04, BASE + 0.065), (-0.36, 0.14, BASE + 0.065),
                       (-0.30, 0.14, BASE + 0.065)], radius=0.015)
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build)
