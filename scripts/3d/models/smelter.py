"""Smelter (1x1x1): a blue furnace block with a glowing crucible on a steel base, a robot arm
and a chimney. Modelled after src/assets/modules/smelter/smelter_0.webp.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402


def build():
    model = kit.Builder("te_smelter")
    base = 0.05
    model.box((0.0, 0.0, base / 2.0), (0.84, 0.84, base), "steel_dark")
    parts.stripes(model, (-0.40, -0.385), 4, z=base)
    # Furnace tower at the back, lower crucible block in front of it.
    model.box((0.06, 0.14, base + 0.27), (0.42, 0.40, 0.54), "blue")
    model.box((0.06, 0.14, base + 0.555), (0.46, 0.44, 0.03), "blue_dark")
    model.box((0.08, 0.17, base + 0.60), (0.22, 0.18, 0.06), "blue_dark")
    model.plate((0.08, 0.17, base + 0.6306), (0.14, 0.10), "+z", "dark")
    model.box((0.10, -0.16, base + 0.12), (0.40, 0.26, 0.24), "blue")
    model.plate((0.10, -0.16, base + 0.2406), (0.30, 0.17), "+z", "glow_orange")
    model.box((0.10, -0.16, base + 0.245), (0.40, 0.26, 0.01), "blue_dark")
    model.plate((0.10, -0.16, base + 0.2512), (0.30, 0.17), "+z", "glow_orange")
    # Doors and a vent on the furnace, a pipe up the side.
    parts.window(model, (0.10, -0.29, base + 0.12), (0.16, 0.12), "-y", frame="blue_dark", pane="window")
    parts.vent(model, (0.27, 0.14, base + 0.40), (0.16, 0.10), "+x", slats=4)
    parts.pipe(model, [(0.28, -0.04, base), (0.28, -0.04, base + 0.45), (0.28, 0.10, base + 0.45)],
               radius=0.016, color="steel")
    # Robot arm on the left.
    model.cylinder((-0.28, -0.12, base), (-0.28, -0.12, base + 0.06), 0.06, "steel_dark")
    with model.placed((-0.28, -0.12, base + 0.06), turn=math.radians(-30.0)):
        model.beam((0.0, 0.0, 0.0), (0.0, 0.0, 0.22), 0.04, "steel_light")
        model.beam((0.0, 0.0, 0.22), (0.0, -0.14, 0.32), 0.035, "steel_light")
        model.beam((0.0, -0.14, 0.32), (0.0, -0.20, 0.26), 0.025, "steel_dark")
        model.cylinder((-0.03, 0.0, 0.22), (0.03, 0.0, 0.22), 0.03, "yellow", segments=8)
    parts.control_box(model, (-0.27, 0.26), z=base)
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build)
