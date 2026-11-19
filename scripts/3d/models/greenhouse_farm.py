"""Greenhouse farm (2x2x1): an open farm hall without walls. Three long shelf rows, each with
three levels of plant troughs under purple grow lights, a water tank with pipes along the
shelves, a control box and a cart at the front.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

HALF = 0.86
ROWS = (-0.50, 0.0, 0.50)
LENGTH = 1.30
DEPTH = 0.26
LEVELS = (0.20, 0.40, 0.60)
ROW_X = -0.12
# Height of the grow light over the top level.
TOP_LIGHT = 0.78


def build():
    model = kit.Builder("te_greenhouse_farm")
    model.box((0.0, 0.0, 0.03), (HALF * 2.0, HALF * 2.0, 0.06), "floor")
    floor = 0.06
    parts.stripes(model, (-HALF + 0.02, -HALF - 0.0006 + 0.012), 21, z=floor, width=0.02, length=0.08)
    for row, y in enumerate(ROWS):
        _row(model, y, floor, row)
    # Water tank at the right end of the aisles, a pipe along the top of every row.
    parts.tank(model, (0.70, 0.25), floor, 0.11, 0.36, color="white", band="glow_cyan", segments=12)
    parts.tank(model, (0.70, -0.25), floor, 0.09, 0.28, color="steel_light", band="plant", segments=12)
    for y in ROWS:
        pipe_z = LEVELS[-1] + 0.10
        tank_y, tank_top = (0.25, floor + 0.36) if y >= 0 else (-0.25, floor + 0.28)
        side = y + DEPTH / 2.0 - 0.02
        parts.pipe(model, [(ROW_X - LENGTH / 2.0, side, pipe_z), (0.56, side, pipe_z), (0.62, tank_y, pipe_z),
                           (0.62, tank_y, tank_top - 0.03)], radius=0.01, color="steel")
    parts.control_box(model, (0.70, -0.62), z=floor)
    # A cart with crates in the front aisle.
    model.box((0.40, -0.75, floor + 0.05), (0.18, 0.10, 0.02), "steel")
    for x in (0.33, 0.47):
        model.cylinder((x, -0.81, floor + 0.02), (x, -0.69, floor + 0.02), 0.02, "dark", segments=6)
    parts.crate(model, (0.36, -0.75), floor + 0.06, (0.07, 0.08, 0.05), "rust_brown")
    parts.crate(model, (0.44, -0.75), floor + 0.06, (0.07, 0.08, 0.05), "green")
    return model.finish()


def _row(model, y: float, floor: float, row: int) -> None:
    """One shelf row along x: three levels of soil troughs with crops, a grow light under each
    board above and on top."""
    parts.shelf(model, (ROW_X, y), LENGTH, DEPTH, LEVELS, color="steel_light", board="steel", bottom=floor,
                posts=4, top=TOP_LIGHT + 0.02)
    count = 9
    for level, height in enumerate(LEVELS):
        model.box((ROW_X, y, height + 0.02), (LENGTH - 0.04, DEPTH - 0.06, 0.04), "rust_brown")
        model.plate((ROW_X, y, height + 0.0406), (LENGTH - 0.08, DEPTH - 0.10), "+z", "soil")
        kind = (row + level) % 3
        for index in range(count):
            x = ROW_X - LENGTH / 2.0 + (index + 0.5) * LENGTH / count
            if kind == 0:
                model.cylinder((x, y, height + 0.04), (x, y, height + 0.14), 0.045, "plant", segments=5,
                               end_radius=0.012)
            elif kind == 1:
                model.lump((x, y, height + 0.07), (0.09, 0.08, 0.06), "plant", seed=index + row * 10, rough=0.15)
            else:
                model.cylinder((x, y, height + 0.04), (x, y, height + 0.10), 0.008, "plant", segments=4)
                model.lump((x, y, height + 0.12), (0.05, 0.05, 0.05), "red", seed=index, rough=0.1)
        # The grow light hangs under the board above (or over the top level on its own bar).
        if level + 1 < len(LEVELS):
            light, front = LEVELS[level + 1] - 0.016, y - DEPTH / 2.0 - 0.01
        else:
            light, front = TOP_LIGHT, y - 0.03
            model.box((ROW_X, y, light + 0.01), (LENGTH + 0.02, 0.06, 0.02), "steel_dark")
            for index in range(4):
                post_x = ROW_X - LENGTH / 2.0 + LENGTH * index / 3.0
                model.beam((post_x, y - DEPTH / 2.0, light + 0.01), (post_x, y + DEPTH / 2.0, light + 0.01), 0.014,
                           "steel_light")
        model.plate((ROW_X, y, light - 0.0006), (LENGTH - 0.06, 0.05), "-z", "glow_purple")
        model.plate((ROW_X, front - 0.0006, light + 0.004), (LENGTH - 0.06, 0.006), "-y", "glow_purple")


if __name__ == "__main__":
    kit.run_from_command_line(build, cells=(2, 2))
