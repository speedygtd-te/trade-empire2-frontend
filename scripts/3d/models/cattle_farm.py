"""Cattle farm (2x2x1): a classic red barn with a gable roof across the back, closed on two
sides (back and left) and open to the pens and to the right, hay and a milk tank inside. In
front of it six pens separated by wooden fences, each with a trough and a cow or two.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

HALF = 0.86
GROUND = 0.04
# The barn: from its open front (y) to the back, wall height, roof pitch 45 degrees.
BARN_FRONT = 0.28
BARN_BACK = 0.84
WALL = 0.40
WALL_THICKNESS = 0.06
ROOF = "rust_brown_dark"
# The pens: fence lines along x and along y.
PEN_X = (-0.82, -0.28, 0.28, 0.82)
PEN_Y = (-0.82, -0.30, 0.24)
COWS = ((1, 0.3), (2, -0.4), (1, 2.6), (1, -2.2), (2, 1.2), (1, 3.4))


def build():
    model = kit.Builder("te_cattle_farm")
    model.box((0.0, 0.0, GROUND / 2.0), (HALF * 2.0, HALF * 2.0, GROUND), "concrete_dark")
    _barn(model)
    _pens(model)
    return model.finish()


def _barn(model) -> None:
    depth = BARN_BACK - BARN_FRONT
    middle = (BARN_FRONT + BARN_BACK) / 2.0
    eave = GROUND + WALL
    rise = depth / 2.0
    model.box((0.0, middle, GROUND + 0.005), (HALF * 2.0 - 0.04, depth, 0.01), "floor")
    # Back wall and left wall, red with white trim.
    back_y = BARN_BACK - WALL_THICKNESS / 2.0
    left_x = -HALF + 0.02 + WALL_THICKNESS / 2.0
    model.box((0.0, back_y, GROUND + WALL / 2.0), (HALF * 2.0 - 0.04, WALL_THICKNESS, WALL), "red")
    model.box((left_x, middle, GROUND + WALL / 2.0), (WALL_THICKNESS, depth, WALL), "red")
    # The gable over the left wall: a square turned by 45 degrees, its lower half in the wall.
    side = depth / math.sqrt(2.0)
    with model.placed((left_x, middle, eave), tilt=math.radians(45.0)):
        model.box((0.0, 0.0, 0.0), (WALL_THICKNESS - 0.01, side * 0.97, side * 0.97), "red")
    inner_back = BARN_BACK - WALL_THICKNESS - 0.0006
    inner_left = left_x + WALL_THICKNESS / 2.0 + 0.0006
    for height in (0.06, WALL - 0.03):
        model.plate((0.0, inner_back, GROUND + height), (HALF * 2.0 - 0.1, 0.016), "-y", "white")
        model.plate((inner_left, middle, GROUND + height), (depth - 0.08, 0.016), "+x", "white")
    # Posts and a header beam along the open front, a gable truss at the open right end.
    for x in (-0.28, 0.28, HALF - 0.05):
        model.box((x, BARN_FRONT + 0.03, GROUND + WALL / 2.0), (0.05, 0.05, WALL), "white")
    model.box((0.0, BARN_FRONT + 0.03, eave - 0.02), (HALF * 2.0 - 0.04, 0.05, 0.04), "white")
    model.box((HALF - 0.05, middle, eave - 0.02), (0.05, depth, 0.04), "white")
    model.box((HALF - 0.05, BARN_BACK - 0.05, GROUND + WALL / 2.0), (0.05, 0.05, WALL), "white")
    for start in (BARN_FRONT + 0.03, BARN_BACK - 0.05):
        model.beam((HALF - 0.05, start, eave), (HALF - 0.05, middle, eave + rise - 0.03), 0.04, "white")
    # The roof: two slopes and a ridge.
    overhang = 0.05
    length = depth / 2.0 * math.sqrt(2.0) + overhang
    lift = 0.0125
    for sign, tilt in ((-1, 45.0), (1, -45.0)):
        along = length / 2.0
        y = middle + sign * (rise - along * math.cos(math.radians(45.0)))
        z = eave + rise - along * math.sin(math.radians(45.0))
        with model.placed((0.0, y + sign * lift * 0.707, z + lift * 0.707), tilt=math.radians(tilt)):
            model.box((0.0, 0.0, 0.0), (HALF * 2.0 + 0.02, length, 0.025), ROOF)
    model.box((0.0, middle, eave + rise + 0.02), (HALF * 2.0 + 0.04, 0.04, 0.03), "white")
    # Inside: hay bales on the left, a milk tank on the right, two hanging lamps.
    for index, (x, y, level) in enumerate(((-0.70, 0.66, 0), (-0.55, 0.66, 0), (-0.70, 0.48, 0), (-0.62, 0.66, 1),
                                            (-0.40, 0.68, 0))):
        model.box((x, y, GROUND + 0.05 + level * 0.09), (0.14, 0.10, 0.09), "hay")
    parts.tank(model, (0.55, 0.62), GROUND + 0.01, 0.09, 0.18, color="white", band="steel")
    model.box((0.30, 0.66, GROUND + 0.09), (0.16, 0.10, 0.18), "steel_light")
    for x in (-0.30, 0.30):
        model.beam((x, middle, eave + rise - 0.02), (x, middle, eave - 0.02), 0.006, "steel_dark")
        model.cylinder((x, middle, eave - 0.02), (x, middle, eave - 0.05), 0.03, "steel_dark", segments=8,
                       end_radius=0.04)
        model.plate((x, middle, eave - 0.05 - 0.0006), (0.05, 0.05), "-z", parts.LAMP)
    # Floodlights on the header, over the pens.
    for x in (-0.56, 0.0, 0.56):
        parts.floodlight(model, (x, BARN_FRONT - 0.0175 + 0.005, eave - 0.02), "-y", size=(0.06, 0.03))


def _pens(model) -> None:
    z = GROUND
    for y in PEN_Y:
        parts.fence(model, (PEN_X[0], y), (PEN_X[-1], y), z=z, height=0.10, posts=7, color="wood")
    for x in PEN_X:
        parts.fence(model, (x, PEN_Y[0]), (x, PEN_Y[-1]), z=z, height=0.10, posts=5, color="wood")
    number = 0
    for row in range(2):
        for column in range(3):
            x = (PEN_X[column] + PEN_X[column + 1]) / 2.0
            y = (PEN_Y[row] + PEN_Y[row + 1]) / 2.0
            width = PEN_X[column + 1] - PEN_X[column] - 0.04
            depth = PEN_Y[row + 1] - PEN_Y[row] - 0.04
            model.plate((x, y, z + 0.0006), (width, depth), "+z", "soil")
            model.plate((x - width * 0.22, y + depth * 0.18, z + 0.0012), (width * 0.4, depth * 0.35), "+z", "hay")
            # A trough along the back fence.
            trough_y = PEN_Y[row + 1] - 0.06
            model.box((x + 0.08, trough_y, z + 0.025), (0.20, 0.06, 0.05), "steel")
            model.plate((x + 0.08, trough_y, z + 0.0506), (0.17, 0.04), "+z", "glass")
            count, turn = COWS[number]
            for index in range(count):
                offset = (index - (count - 1) / 2.0) * 0.16
                parts.cow(model, (x - 0.02 + offset * 0.5, y - 0.04 + offset), z, turn=turn + index * 0.7)
            number += 1


if __name__ == "__main__":
    kit.run_from_command_line(build, cells=(2, 2))
