"""Assembler (1x1x1): an open workshop with two yellow robot arms around a round work table,
a yellow cabinet with a light on the back wall and floor markings. Modelled after
src/assets/modules/assembler/assembler_0.webp.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402


def build():
    model = kit.Builder("te_assembler")
    top = parts.room(model)
    # Round work table in the middle.
    model.cylinder((0.06, -0.04, top), (0.06, -0.04, top + 0.03), 0.17, "steel_dark", segments=12)
    model.cylinder((0.06, -0.04, top + 0.03), (0.06, -0.04, top + 0.05), 0.12, "steel", segments=12)
    model.cylinder((0.06, -0.04, top + 0.05), (0.06, -0.04, top + 0.07), 0.05, "steel_light", segments=10)
    # Robot arms left and behind the table.
    parts.robot_arm(model, (-0.20, 0.06), math.radians(-60.0), top)
    parts.robot_arm(model, (0.12, 0.22), math.radians(10.0), top)
    # Cabinet with a lamp on the back wall, a terminal on the left wall.
    model.box((0.24, 0.28, top + 0.16), (0.14, 0.08, 0.30), "yellow")
    parts.vent(model, (0.24, 0.24, top + 0.12), (0.10, 0.10), "-y", slats=3)
    model.box((0.24, 0.30, top + 0.36), (0.10, 0.04, 0.03), "glow_orange")
    model.box((-0.30, -0.22, top + 0.10), (0.06, 0.10, 0.20), "steel_dark")
    model.plate((-0.27 + 0.0006, -0.22, top + 0.14), (0.07, 0.05), "+x", "glow_cyan")
    # Yellow floor markings around the table.
    for x, y in ((0.30, -0.30), (-0.16, -0.30), (0.30, 0.04)):
        model.plate((x, y, top + 0.0006), (0.08, 0.04), "+z", "yellow")
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build)
