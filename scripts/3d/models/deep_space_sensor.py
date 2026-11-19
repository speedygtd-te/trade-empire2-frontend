"""Deep space sensor (2x2x1): a large dish antenna on a concrete pedestal. The dish's hollow
side looks to the sky and the front; turntable, yoke and dish sweep the sky together (moving
part "dish"). A control house with roof lamps at the back right, lamp posts at the front
corners, a red light on the dish's feed.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

ACCENT = "glow_cyan"
HALF = 0.86
PEDESTAL = (-0.08, 0.02)
# Height of the elevation axle, the dish's tilt towards the front.
AXLE = 0.45
TILT = math.radians(40.0)
REST_TURN = math.radians(30.0)
RADIUS = 0.55
DEPTH = 0.15
HOUSE = (0.55, 0.58)


def build():
    model = kit.Builder("te_deep_space_sensor", wear=0.6)
    top = parts.slab(model, size=HALF * 2.0)
    parts.steps(model, 0.50, edge=-HALF)
    parts.stripes(model, (-0.70, -0.80), 10)
    _pedestal(model, top)
    _house(model, top)
    parts.pipe(model, [(PEDESTAL[0] + 0.20, PEDESTAL[1] + 0.10, top + 0.02), (HOUSE[0] - 0.18, PEDESTAL[1] + 0.10, top + 0.02),
                       (HOUSE[0] - 0.18, HOUSE[1] - 0.10, top + 0.02)], radius=0.016, color="dark")
    parts.control_box(model, (-0.62, 0.60))
    parts.lamp_post(model, (HALF - 0.08, -HALF + 0.08), top, height=0.34)
    parts.lamp_post(model, (-HALF + 0.08, -HALF + 0.08), top, height=0.34)
    return model.finish()


def _pedestal(model, top: float) -> None:
    x, y = PEDESTAL
    model.revolve((x, y, top), [(0.30, 0.0), (0.30, 0.04), (0.22, 0.20), (0.0, 0.20)], "concrete", segments=16,
                  sharp=30.0)
    model.cylinder((x, y, top + 0.20), (x, y, top + 0.22), 0.23, "yellow", segments=16)
    base = top + 0.22
    # At rest the dish looks to the front and a little to the right, towards the game camera.
    with model.moving("dish", (x, y, base)), model.placed((x, y, base), turn=REST_TURN):
        model.cylinder((0.0, 0.0, 0.0), (0.0, 0.0, 0.05), 0.21, "steel_dark", segments=16)
        model.box((0.0, 0.04, 0.09), (0.26, 0.18, 0.08), "steel")
        parts.vent(model, (0.13, 0.04, 0.09), (0.10, 0.05), "+x", slats=3)
        # The yoke: two arms up to the elevation axle.
        axle = AXLE - base
        for side in (-1, 1):
            model.box((side * 0.15, 0.04, (0.05 + axle + 0.03) / 2.0), (0.05, 0.10, axle + 0.03 - 0.05), "steel")
        model.cylinder((-0.18, 0.04, axle), (0.18, 0.04, axle), 0.035, "steel_dark", segments=8)
        # The dish sits on the axle by its hub, clear of it.
        with model.placed((0.0, 0.04, axle), tilt=TILT), model.placed((0.0, 0.0, 0.065)):
            parts.dish(model, RADIUS, DEPTH, inner="white", outer="steel", accent=ACCENT, struts=4, segments=20)
            focus = DEPTH + RADIUS * 0.45
            parts.tip_light(model, (0.0, 0.0), focus + 0.03, radius=0.014)


def _house(model, top: float) -> None:
    """The control house: a blue box with a door and a lit window, lamps on its roof edge."""
    x, y = HOUSE
    width, depth, height = 0.42, 0.30, 0.24
    model.box((x, y, top + height / 2.0), (width, depth, height), "blue")
    model.box((x, y, top + height + 0.01), (width + 0.02, depth + 0.02, 0.02), "blue_dark")
    front = y - depth / 2.0
    left = x - width / 2.0
    model.plate((x + 0.10, front - 0.0006, top + 0.08), (0.08, 0.16), "-y", "dark")
    parts.window(model, (x - 0.08, front, top + 0.13), (0.16, 0.08), "-y", frame="yellow")
    parts.window(model, (left, y, top + 0.13), (0.14, 0.08), "-x", frame="yellow")
    model.plate((x, front - 0.0012, top + height - 0.02), (width, 0.016), "-y", ACCENT)
    parts.floodlight(model, (x + 0.10, front - 0.018, top + 0.20), "-y", size=(0.06, 0.03))
    with model.placed((x, y, 0.0)):
        parts.edge_lamps(model, (width / 2.0 + 0.01, depth / 2.0 + 0.01), top + height + 0.02, count=2,
                         size=(0.045, 0.016), margin=0.08, face=False)
    # A small dish and an antenna on the roof.
    model.beam((x + 0.12, y + 0.06, top + height + 0.02), (x + 0.12, y + 0.06, top + height + 0.24), 0.01,
               "steel_light")
    parts.tip_light(model, (x + 0.12, y + 0.06), top + height + 0.24, radius=0.012)


if __name__ == "__main__":
    kit.run_from_command_line(build, cells=(2, 2))
