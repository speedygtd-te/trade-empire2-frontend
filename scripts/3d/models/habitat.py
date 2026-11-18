"""Habitat (1x1x1): an open living room with a bed, a table, a chair, a locker and a yellow
air tank. Modelled after src/assets/modules/habitat/habitat_0.webp.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402


def build():
    model = kit.Builder("te_habitat")
    top = parts.room(model)
    # Door in the back wall, a window in the left wall.
    parts.window(model, (0.12, 0.35 - 0.0006, top + 0.17), (0.14, 0.26), "-y", frame="blue_dark", pane="steel_dark")
    parts.window(model, (-0.35 + 0.0006, 0.05, top + 0.22), (0.20, 0.10), "+x")
    # Bed against the back wall.
    model.box((-0.12, 0.20, top + 0.05), (0.30, 0.16, 0.06), "steel")
    model.box((-0.12, 0.20, top + 0.09), (0.28, 0.14, 0.03), "white")
    model.box((-0.24, 0.20, top + 0.115), (0.05, 0.12, 0.025), "white")
    # Table and chair.
    model.box((0.18, -0.02, top + 0.09), (0.22, 0.14, 0.02), "steel_light")
    for x in (0.09, 0.27):
        for y in (-0.07, 0.03):
            model.beam((x, y, top), (x, y, top + 0.08), 0.012, "steel_dark")
    model.box((-0.20, -0.16, top + 0.05), (0.09, 0.09, 0.02), "steel_light")
    model.box((-0.20, -0.12, top + 0.10), (0.09, 0.015, 0.10), "steel_light")
    for x in (-0.24, -0.16):
        for y in (-0.20, -0.12):
            model.beam((x, y, top), (x, y, top + 0.05), 0.01, "steel_dark")
    # Locker in the corner and an air tank at the front.
    model.box((-0.27, 0.26, top + 0.13), (0.08, 0.08, 0.26), "steel_light")
    parts.drum(model, (0.18, -0.28, top + 0.05), (0.30, -0.28, top + 0.05), 0.05, color="yellow", cap="steel_dark")
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build)
