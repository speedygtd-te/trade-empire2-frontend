"""Refinery (1x1x1): a small control house at the front left, a slim distillation column with
a ladder, two lying pressure vessels, a storage tank, a pipe rack and two chimneys at the back,
the taller one burning a gas flare. Floodlight over the door, lamps on the roof edge.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

ACCENT = "glow_orange"
HOUSE = (-0.21, -0.21)
HOUSE_SIZE = (0.30, 0.24, 0.20)
COLUMN = (0.04, 0.22)


def build():
    model = kit.Builder("te_refinery")
    top = parts.slab(model)
    parts.stripes(model, (0.06, -0.37), 6)
    _house(model, top)
    # Chimneys at the back left: a flare stack and a plain one.
    parts.chimney(model, (-0.30, 0.30), top, 0.80, radius=0.035, flare=True)
    parts.chimney(model, (-0.15, 0.31), top, 0.58, radius=0.03, band="yellow")
    # The column with a ladder, a tank at the back right.
    parts.tank(model, COLUMN, top, 0.06, 0.56, color="steel_light", band="red", ladder=True, segments=10)
    for height in (0.24, 0.44):
        model.cylinder((COLUMN[0], COLUMN[1], top + height), (COLUMN[0], COLUMN[1], top + height + 0.012), 0.10,
                       "steel_dark", segments=10)
    parts.tank(model, (0.26, 0.26), top, 0.11, 0.20, color="white", band="steel_dark", ladder=True)
    # Two lying pressure vessels on the right.
    parts.pressure_vessel(model, (0.28, -0.02, top + 0.09), 0.26, 0.065, turn=math.pi / 2.0)
    parts.pressure_vessel(model, (0.13, -0.24, top + 0.07), 0.20, 0.05, color="rust_brown")
    # A pipe rack from the house to the column and pipes to the vessels.
    rack = top + 0.24
    parts.pipe_rack(model, (-0.25, 0.04), (0.16, 0.04), rack, posts=3, ground=top)
    parts.pipe(model, [(COLUMN[0], COLUMN[1] - 0.06, top + 0.16), (COLUMN[0], 0.04, top + 0.16),
                       (COLUMN[0], 0.04, rack + 0.018)], radius=0.012, color="steel")
    parts.pipe(model, [(0.16, 0.075, rack + 0.018), (0.28, 0.075, rack + 0.018), (0.28, 0.075, top + 0.12)],
               radius=0.011, color="steel_light")
    parts.pipe(model, [(0.28, -0.15, top + 0.09), (0.28, -0.24, top + 0.09), (0.23, -0.24, top + 0.07)],
               radius=0.012, color="rust")
    parts.pipe(model, [(-0.30, 0.27, top + 0.08), (-0.30, 0.04, top + 0.08), (-0.25, 0.04, top + 0.08)],
               radius=0.012, color="rust")
    parts.valve(model, (0.02, -0.12))
    return model.finish()


def _house(model, top: float) -> None:
    """The control house: a blue box with a door, a lit window, a vent and roof lamps."""
    x, y = HOUSE
    width, depth, height = HOUSE_SIZE
    model.box((x, y, top + height / 2.0), (width, depth, height), "blue")
    model.box((x, y, top + height + 0.01), (width + 0.02, depth + 0.02, 0.02), "blue_dark")
    front = y - depth / 2.0
    right = x + width / 2.0
    model.plate((x + 0.07, front - 0.0006, top + 0.07), (0.07, 0.14), "-y", "dark")
    parts.window(model, (x - 0.07, front, top + 0.11), (0.10, 0.07), "-y", frame="yellow")
    parts.window(model, (right, y + 0.03, top + 0.11), (0.10, 0.07), "+x", frame="yellow")
    parts.vent(model, (right, y - 0.07, top + 0.06), (0.06, 0.06), "+x", slats=3)
    model.plate((x, front - 0.0012, top + height - 0.02), (width, 0.016), "-y", ACCENT)
    model.plate((right + 0.0012, y, top + height - 0.02), (depth, 0.016), "+x", ACCENT)
    parts.floodlight(model, (x + 0.07, front - 0.018, top + 0.17), "-y", size=(0.05, 0.025))
    with model.placed((x, y, 0.0)):
        parts.edge_lamps(model, (width / 2.0 + 0.01, depth / 2.0 + 0.01), top + height + 0.02, count=1,
                         size=(0.04, 0.014), color=parts.STATUS, margin=0.06, face=False)
    model.box((x - 0.06, y + 0.04, top + height + 0.05), (0.08, 0.06, 0.06), "steel")
    parts.vent(model, (x - 0.06, y + 0.01, top + height + 0.05), (0.06, 0.04), "-y", slats=2)


if __name__ == "__main__":
    kit.run_from_command_line(build)
