"""Greenhouse farm (2x2x1): a long blue container with yellow trim and access ladders, planting
beds with crops on its roof. Modelled after src/assets/modules/greenhouse_farm/greenhouse_farm_0.webp.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402


def build():
    model = kit.Builder("te_greenhouse_farm")
    half = 0.86
    height = 0.42
    model.box((0.0, 0.0, 0.03), (half * 2.0 + 0.04, half * 2.0 + 0.04, 0.06), "steel_dark")
    model.box((0.0, 0.0, 0.06 + height / 2.0), (half * 2.0, half * 2.0 - 0.2, height), "blue")
    top = 0.06 + height
    model.box((0.0, 0.0, top + 0.01), (half * 2.0 + 0.02, half * 2.0 - 0.18, 0.02), "blue_dark")
    top += 0.02
    # Yellow trim and panel seams on the two visible walls.
    model.plate((0.0, -half + 0.1 - 0.0006, top - 0.05), (half * 2.0, 0.016), "-y", "yellow")
    model.plate((half + 0.0006, 0.0, top - 0.05), (half * 2.0 - 0.2, 0.016), "+x", "yellow")
    for x in (-0.55, 0.0, 0.55):
        model.plate((x, -half + 0.1 - 0.0012, 0.06 + height / 2.0), (0.012, height - 0.04), "-y", "blue_dark")
    parts.vent(model, (-0.30, -half + 0.1, 0.30), (0.16, 0.10), "-y")
    parts.window(model, (0.30, -half + 0.1, 0.28), (0.14, 0.16), "-y", frame="steel_light", pane="dark")
    parts.vent(model, (half, 0.30, 0.30), (0.16, 0.10), "+x")
    # Ladders at the front.
    for x in (0.62, -0.70):
        for side in (-0.04, 0.04):
            model.beam((x + side, -half + 0.06, 0.06), (x + side, -half + 0.06, top), 0.012, "yellow")
        for step in range(5):
            z = 0.12 + step * (top - 0.12) / 5.0
            model.beam((x - 0.04, -half + 0.06, z), (x + 0.04, -half + 0.06, z), 0.01, "yellow")
    # Planting beds: three rows of soil boxes with crops.
    for row, y in enumerate((-0.48, 0.0, 0.48)):
        model.box((0.0, y, top + 0.04), (half * 2.0 - 0.2, 0.30, 0.08), "rust_brown")
        model.plate((0.0, y, top + 0.0806), (half * 2.0 - 0.26, 0.24), "+z", "soil")
        for index in range(9):
            x = -0.68 + index * 0.17 + (0.05 if row % 2 else 0.0)
            model.cylinder((x, y, top + 0.08), (x, y, top + 0.16), 0.055, "plant", segments=6, end_radius=0.02)
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build, cells=(2, 2))
