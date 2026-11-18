"""Basic storage (1x1x1): an open store on a blue platform with a yellow edge: two walls
meeting at the back left corner, shelves with crates on the left wall, more crates on the
floor.

Modelled after the V1 sprite src/assets/modules/basic_storage/basic_storage_0.webp.

  blender --background --factory-startup --python scripts/3d/models/basic_storage.py -- --output <file.glb>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

NAME = "te_basic_storage"

FLOOR = 0.06
WALL = 0.42
HALF = 0.42


def build():
    model = kit.Builder(NAME)
    model.box((0.0, 0.0, FLOOR / 2.0), (HALF * 2.0, HALF * 2.0, FLOOR), "floor")
    model.plate((0.0, -HALF - 0.0006, FLOOR - 0.012), (HALF * 2.0, 0.012), "-y", "yellow")
    model.plate((HALF + 0.0006, 0.0, FLOOR - 0.012), (HALF * 2.0, 0.012), "+x", "yellow")

    # Back wall and left wall, each with a cap and yellow joints on top.
    top = FLOOR + WALL
    model.box((0.03, 0.36, FLOOR + WALL / 2.0), (0.74, 0.08, WALL), "blue")
    model.box((-0.36, 0.01, FLOOR + WALL / 2.0), (0.08, 0.62, WALL), "blue")
    model.box((0.03, 0.36, top + 0.01), (0.76, 0.10, 0.02), "blue_dark")
    model.box((-0.36, 0.01, top + 0.01), (0.10, 0.64, 0.02), "blue_dark")
    model.box((-0.36, 0.36, FLOOR + WALL / 2.0 + 0.01), (0.10, 0.10, WALL + 0.02), "blue_dark")
    for x in (-0.10, 0.18):
        model.plate((x, 0.36, top + 0.0206), (0.012, 0.10), "+z", "yellow")
    for y in (-0.12, 0.12):
        model.plate((-0.36, y, top + 0.0206), (0.10, 0.012), "+z", "yellow")

    # Shelves on the left wall, with crates.
    for height in (0.16, 0.30):
        model.box((-0.26, 0.02, FLOOR + height), (0.12, 0.52, 0.015), "steel")
    for y in (-0.23, 0.27):
        model.beam((-0.205, y, FLOOR), (-0.205, y, FLOOR + 0.38), 0.015, "steel_dark")
    shelf_crates = ((0.16, -0.14, "yellow"), (0.16, 0.02, "dark"), (0.16, 0.17, "yellow"),
                    (0.30, -0.08, "red"), (0.30, 0.10, "yellow"))
    for height, y, color in shelf_crates:
        parts.crate(model, (-0.26, y), FLOOR + height + 0.0075, (0.09, 0.11, 0.075), color)

    # Crates on the floor: one on a stand, flat ones in front, a red one at the edge.
    for sx in (-1, 1):
        for sy in (-1, 1):
            model.beam((0.24 + sx * 0.045, 0.12 + sy * 0.045, FLOOR),
                       (0.24 + sx * 0.045, 0.12 + sy * 0.045, FLOOR + 0.07), 0.012, "steel_dark")
    parts.crate(model, (0.24, 0.12), FLOOR + 0.07, (0.13, 0.13, 0.10), "yellow")
    parts.crate(model, (0.04, -0.06), FLOOR, (0.14, 0.12, 0.06), "yellow", turn=0.25)
    parts.crate(model, (0.16, -0.26), FLOOR, (0.13, 0.11, 0.045), "yellow", turn=-0.2)
    parts.crate(model, (-0.12, -0.30), FLOOR, (0.10, 0.08, 0.07), "red", turn=0.5)
    model.box((-0.24, -0.33, FLOOR + 0.0175), (0.035, 0.035, 0.035), "steel_light", turn=0.3)
    model.box((-0.19, -0.37, FLOOR + 0.015), (0.03, 0.03, 0.03), "steel_light", turn=0.9)
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build)
