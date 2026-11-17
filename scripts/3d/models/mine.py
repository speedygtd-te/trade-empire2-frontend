"""Mine (1x1x1): a concrete pit lined with sheet piling, a conveyor leading down into it, a
yellow winch cabin with machinery on the back wall, drums and rubble.

Modelled after the V1 sprite src/assets/modules/mine/mine_0.webp. The pit is not really deep
(a module stands on the ground of its cell): a dark floor and the lining make it read as one.

  blender --background --factory-startup --python scripts/3d/models/mine.py -- --output <file.glb>
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

NAME = "te_mine"

BASE = 0.05
WALL_TOP = 0.37
# The pit opening: x from PIT_LEFT to PIT_RIGHT, y from PIT_FRONT to PIT_BACK.
PIT_LEFT, PIT_RIGHT = -0.18, 0.26
PIT_FRONT, PIT_BACK = -0.32, 0.14
CABIN = (-0.24, 0.27)


def build():
    model = kit.Builder(NAME)
    model.box((0.0, 0.0, BASE / 2.0), (0.84, 0.84, BASE), "concrete_dark")
    _walls(model)
    _pit(model)
    _conveyor(model)
    _cabin(model)
    parts.barrel(model, (0.10, 0.31), WALL_TOP)
    parts.barrel(model, (0.20, 0.29), WALL_TOP)
    model.cylinder((0.33, 0.20, WALL_TOP), (0.33, 0.20, WALL_TOP + 0.05), 0.045, "yellow")
    model.cylinder((0.33, 0.20, WALL_TOP + 0.05), (0.33, 0.20, WALL_TOP + 0.07), 0.03, "steel_dark",
                   segments=8)
    for x, y, size, turn in ((0.36, -0.38, 0.05, 0.4), (0.30, -0.39, 0.035, 1.1),
                             (-0.39, -0.33, 0.045, 0.8), (-0.37, -0.39, 0.03, 0.2)):
        model.box((x, y, BASE + size * 0.35), (size, size * 0.8, size * 0.7), "rock", turn=turn)
    return model.finish()


def _walls(model) -> None:
    """Thick walls behind and left of the pit, a thinner one on the right, a kerb in front."""
    height = WALL_TOP - BASE
    middle = BASE + height / 2.0
    model.box((0.0, 0.27, middle), (0.80, 0.26, height), "concrete")
    model.box((-0.29, -0.13, middle), (0.22, 0.54, height), "concrete")
    model.box((0.33, -0.13, middle), (0.14, 0.54, height), "concrete")
    model.box((0.04, -0.36, BASE + 0.05), (0.44, 0.08, 0.10), "concrete")
    # Buttresses against the front of the side walls.
    model.box((-0.29, -0.41, BASE + 0.09), (0.16, 0.02, 0.18), "concrete_dark")
    model.box((0.33, -0.41, BASE + 0.09), (0.10, 0.02, 0.18), "concrete_dark")


def _pit(model) -> None:
    """Dark floor and steel lining on the three inner walls, with upright ribs."""
    width, depth = PIT_RIGHT - PIT_LEFT, PIT_BACK - PIT_FRONT
    center_x, center_y = (PIT_LEFT + PIT_RIGHT) / 2.0, (PIT_FRONT + PIT_BACK) / 2.0
    lining_height = WALL_TOP - BASE - 0.03
    middle = BASE + lining_height / 2.0
    model.plate((center_x, center_y, BASE + 0.0006), (width, depth), "+z", "dark")
    model.plate((center_x, PIT_BACK - 0.0006, middle), (width, lining_height), "-y", "blue_dark")
    model.plate((PIT_LEFT + 0.0006, center_y, middle), (depth, lining_height), "+x", "blue_dark")
    model.plate((PIT_RIGHT - 0.0006, center_y, middle), (depth, lining_height), "-x", "blue_dark")
    for index in range(5):
        x = PIT_LEFT + width * (index + 0.5) / 5.0
        model.plate((x, PIT_BACK - 0.0012, middle), (0.012, lining_height), "-y", "steel")
    for index in range(5):
        y = PIT_FRONT + depth * (index + 0.5) / 5.0
        model.plate((PIT_LEFT + 0.0012, y, middle), (0.012, lining_height), "+x", "steel")
        model.plate((PIT_RIGHT - 0.0012, y, middle), (0.012, lining_height), "-x", "steel")


def _conveyor(model) -> None:
    """A belt from the back wall down to the pit floor, with yellow side rails."""
    top = (-0.04, 0.16, WALL_TOP + 0.01)
    bottom = (0.14, -0.24, BASE + 0.03)
    model.beam(top, bottom, 0.07, "steel_dark")
    length = math.hypot(bottom[0] - top[0], bottom[1] - top[1])
    side = ((bottom[1] - top[1]) / length * 0.042, -(bottom[0] - top[0]) / length * 0.042)
    for sign in (-1, 1):
        offset = (side[0] * sign, side[1] * sign, 0.03)
        model.beam(tuple(top[axis] + offset[axis] for axis in range(3)),
                   tuple(bottom[axis] + offset[axis] for axis in range(3)), 0.012, "yellow")


def _cabin(model) -> None:
    """Winch cabin on the back wall: yellow body with a sign and a window, a dark roof with
    a railing, the winch motor, an exhaust and an antenna."""
    x, y = CABIN
    model.box((x, y, WALL_TOP + 0.07), (0.26, 0.22, 0.14), "yellow")
    parts.window(model, (x + 0.02, y - 0.11, WALL_TOP + 0.075), (0.16, 0.07), "-y",
                 frame="steel_dark", pane="yellow")
    parts.window(model, (x + 0.13, y - 0.02, WALL_TOP + 0.08), (0.08, 0.07), "+x",
                 frame="steel_dark", pane="dark")
    roof = WALL_TOP + 0.14
    model.box((x, y, roof + 0.0075), (0.28, 0.24, 0.015), "steel_dark")
    roof += 0.015
    parts.railing(model, (x, y), (0.26, 0.22), roof)
    model.cylinder((x - 0.03, y, roof), (x - 0.03, y, roof + 0.07), 0.055, "steel_dark")
    model.cylinder((x - 0.03, y, roof + 0.07), (x - 0.03, y, roof + 0.09), 0.035, "steel")
    model.box((x + 0.07, y + 0.04, roof + 0.03), (0.06, 0.08, 0.06), "steel")
    model.cylinder((x - 0.09, y + 0.07, roof), (x - 0.09, y + 0.07, roof + 0.22), 0.012,
                   "steel_dark", segments=6)
    model.beam((x + 0.10, y - 0.08, roof), (x + 0.10, y - 0.08, roof + 0.17), 0.006, "steel_light")


if __name__ == "__main__":
    kit.run_from_command_line(build)
