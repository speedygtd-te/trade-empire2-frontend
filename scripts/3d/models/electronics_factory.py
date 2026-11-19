"""Electronics factory (1x1x1): the assembler's workshop (assembler.py) with a conveyor belt
carrying green circuit boards from a feeder past two robot arms into a bin. A screen on the
left wall, an exhaust fan in the back wall (moving part "fan_1").
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

ACCENT = "glow_cyan"
BELT_Y = -0.10
BELT = 0.12


def circuit_board(model, center, turn: float = 0.0) -> None:
    """A green circuit board lying on a surface: black chips, a golden contact strip."""
    with model.placed(center, turn=turn):
        model.box((0.0, 0.0, 0.003), (0.075, 0.06, 0.006), "green")
        model.box((-0.012, 0.006, 0.009), (0.024, 0.024, 0.006), "dark")
        model.box((0.02, -0.012, 0.008), (0.016, 0.012, 0.004), "dark")
        model.box((0.022, 0.014, 0.008), (0.012, 0.012, 0.004), "steel_light")
        model.plate((0.0, -0.026, 0.0066), (0.06, 0.008), "+z", "yellow")


def build():
    model = kit.Builder("te_electronics_factory")
    top = parts.room(model)
    belt = top + BELT
    parts.conveyor(model, (-0.24, BELT_Y), (0.30, BELT_Y), belt, width=0.10, ground=top)
    for index, x in enumerate((-0.16, -0.04, 0.08, 0.20)):
        circuit_board(model, (x, BELT_Y, belt), turn=math.radians((index % 2) * 6.0 - 3.0))
    # The feeder the boards come out of, with a screen and a status light.
    model.box((-0.30, BELT_Y, top + 0.11), (0.10, 0.16, 0.22), "steel_dark")
    model.plate((-0.30, BELT_Y - 0.08 - 0.0006, top + 0.16), (0.07, 0.05), "-y", ACCENT)
    model.plate((-0.25 + 0.0006, BELT_Y, belt + 0.02), (0.09, 0.03), "+x", "dark")
    parts.lamp(model, (-0.30, BELT_Y, top + 0.23), (0.03, 0.03, 0.016), "glow_green")
    # A bin of finished boards at the end of the belt.
    model.box((0.35, BELT_Y, top + 0.05), (0.10, 0.14, 0.10), "yellow")
    model.plate((0.35, BELT_Y, top + 0.1006), (0.08, 0.12), "+z", "dark")
    circuit_board(model, (0.35, BELT_Y - 0.02, top + 0.101), turn=0.4)
    # Two robot arms behind the belt, reaching over it.
    parts.robot_arm(model, (-0.10, 0.10), math.radians(-10.0), top)
    parts.robot_arm(model, (0.14, 0.10), math.radians(12.0), top, color="steel_light")
    # Screen on the left wall, exhaust fan and a cabinet on the back wall.
    model.box((-0.335, 0.10, top + 0.24), (0.02, 0.20, 0.12), "steel_dark")
    model.plate((-0.325 + 0.0006, 0.10, top + 0.24), (0.17, 0.09), "+x", ACCENT)
    parts.wall_fan(model, (-0.12, 0.35, top + 0.28), "fan_1", radius=0.06, accent=ACCENT)
    model.box((0.26, 0.29, top + 0.14), (0.12, 0.10, 0.28), "steel_light")
    parts.vent(model, (0.26, 0.24, top + 0.10), (0.08, 0.08), "-y", slats=3)
    parts.lamp(model, (0.26, 0.29, top + 0.29), (0.06, 0.04, 0.02), "glow_orange")
    # Yellow floor markings along the belt.
    for x in (-0.20, 0.0, 0.20):
        model.plate((x, -0.30, top + 0.0006), (0.10, 0.03), "+z", "yellow")
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build)
