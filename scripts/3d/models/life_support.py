"""Life support (1x1x1): a blue machine house with yellow corner caps and a roof hatch, an
air unit and a compressor at the front, cabinets on the right wall and pipes around its foot,
on a concrete slab with warning markings.

Modelled after the V1 sprite src/assets/modules/life_support/life_support_0.webp.

  blender --background --factory-startup --python scripts/3d/models/life_support.py -- --output <file.glb>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

NAME = "te_life_support"

HOUSE = (0.0, 0.04)
SIZE = (0.60, 0.50, 0.46)


def build():
    model = kit.Builder(NAME)
    top = parts.slab(model, size=0.84)
    for x, y, along in ((-0.39, -0.38, "x"), (0.23, -0.38, "x"), (0.38, -0.12, "y")):
        parts.stripes(model, (x, y), 4, along=along)

    x, y = HOUSE
    roof = top + SIZE[2]
    front, right = y - SIZE[1] / 2.0, x + SIZE[0] / 2.0
    model.box((x, y, top + SIZE[2] / 2.0), SIZE, "blue")
    model.box((x, y, roof + 0.01), (SIZE[0] + 0.02, SIZE[1] + 0.02, 0.02), "blue_dark")
    roof += 0.02
    for sx in (-1, 1):
        for sy in (-1, 1):
            model.box((x + sx * SIZE[0] / 2.0, y + sy * SIZE[1] / 2.0, roof - 0.005),
                      (0.07, 0.07, 0.05), "yellow")
    model.plate((x, y - 0.10, roof + 0.0006), (SIZE[0] - 0.08, 0.014), "+z", "yellow")
    # Roof hatch with a glass pane.
    model.box((x - 0.08, y + 0.08, roof + 0.02), (0.18, 0.15, 0.04), "steel_dark")
    model.plate((x - 0.08, y + 0.08, roof + 0.0406), (0.13, 0.10), "+z", "glass")
    model.cylinder((x + 0.19, y + 0.14, roof), (x + 0.19, y + 0.14, roof + 0.05), 0.025, "steel_dark",
                   segments=8)

    # Front: air unit on the left, compressor in the middle, a door plate on the right.
    model.box((x - 0.18, front - 0.035, top + 0.10), (0.20, 0.07, 0.20), "yellow")
    parts.vent(model, (x - 0.18, front - 0.07, top + 0.10), (0.15, 0.14), "-y", slats=5)
    model.box((x + 0.06, front - 0.03, top + 0.11), (0.14, 0.06, 0.18), "steel_dark")
    for offset in (-0.035, 0.035):
        model.cylinder((x + 0.06 + offset, front - 0.065, top + 0.05),
                       (x + 0.06 + offset, front - 0.065, top + 0.17), 0.018, "steel", segments=6)
    parts.window(model, (x + 0.21, front, top + 0.30), (0.10, 0.12), "-y")
    # Right wall: two yellow cabinets and a window.
    for offset in (-0.12, 0.08):
        model.box((right + 0.02, y + offset, top + 0.24), (0.04, 0.11, 0.15), "yellow")
    parts.vent(model, (right, y - 0.02, top + 0.36), (0.07, 0.05), "+x", slats=3)

    # Pipes around the foot of the house, with risers at the corners.
    low = top + 0.045
    parts.pipe(model, [(x - 0.34, front - 0.06, low), (x - 0.34, front - 0.11, low),
                       (right + 0.07, front - 0.11, low), (right + 0.07, y + 0.20, low),
                       (right + 0.07, y + 0.20, top + 0.40)], radius=0.02, color="steel")
    model.cylinder((right + 0.07, front - 0.11, low), (right + 0.07, front - 0.11, top + 0.30), 0.016,
                   "steel", segments=6)
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build)
