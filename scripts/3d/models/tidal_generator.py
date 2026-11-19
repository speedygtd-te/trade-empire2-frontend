"""Tidal generator (1x1x1): a large water turbine in a duct on two concrete pylons. The duct
opens into a big intake at the front and narrows to a smaller outlet at the back; the rotor in
its throat turns (moving part "rotor"). A generator pod on top with marker lights, a cable down
to a junction box.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

ACCENT = "glow_cyan"
AXIS_Z = 0.36
BACK_Y = 0.37
# Along the duct, from its outlet (0) to its intake: the throat with the rotor.
THROAT = 0.54
LENGTH = 0.74


def build():
    model = kit.Builder("te_tidal_generator")
    base = 0.06
    model.box((0.0, 0.0, base / 2.0), (0.84, 0.84, base), "concrete_dark")
    model.box((0.0, 0.0, base + 0.015), (0.60, 0.70, 0.03), "concrete")
    # Two pylons with saddles just below the duct.
    saddle = 0.195
    for y in (0.22, -0.02):
        model.box((0.0, y, (base + saddle) / 2.0), (0.12, 0.10, saddle - base), "concrete")
        model.box((0.0, y, saddle - 0.015), (0.30, 0.10, 0.03), "concrete")
    # The duct: its axis runs to the front (-y); tilted by 90 degrees, local +Z points there.
    with model.placed((0.0, BACK_Y, AXIS_Z), tilt=math.pi / 2.0):
        model.revolve((0.0, 0.0, 0.0), [
            (0.10, 0.0, "steel"), (0.13, 0.10), (0.16, 0.30), (0.175, 0.52), (0.20, 0.62), (0.27, LENGTH, "yellow"),
            (0.25, LENGTH + 0.012, "steel"), (0.18, 0.62, "steel"), (0.155, THROAT, "steel_dark"),
            (0.15, 0.30, "steel_dark"), (0.12, 0.10, "steel_dark"), (0.085, 0.0, "yellow"),
        ], "steel", segments=20, closed=True, sharp=50.0)
        # Stiffening rings round the duct.
        for along, radius in ((0.20, 0.15), (0.42, 0.172)):
            model.cylinder((0.0, 0.0, along), (0.0, 0.0, along + 0.025), radius + 0.008, "yellow", segments=20)
        # The generator in the middle, held by three struts behind the rotor.
        model.cylinder((0.0, 0.0, 0.05), (0.0, 0.0, THROAT - 0.03), 0.045, "steel_dark", segments=10)
        model.cylinder((0.0, 0.0, 0.02), (0.0, 0.0, 0.05), 0.02, "steel_dark", segments=8, end_radius=0.045)
        for index in range(3):
            angle = 2.0 * math.pi * index / 3.0 + math.pi / 2.0
            model.beam((0.0, 0.0, 0.40), (math.cos(angle) * 0.155, math.sin(angle) * 0.155, 0.40), 0.016,
                       "steel_dark")
        with model.moving("rotor", (0.0, 0.0, THROAT)):
            model.revolve((0.0, 0.0, THROAT), [(0.046, -0.03), (0.046, 0.02), (0.03, 0.05), (0.0, 0.07)],
                          "yellow", segments=10)
            for blade in range(5):
                with model.placed((0.0, 0.0, THROAT), turn=blade * 2.0 * math.pi / 5.0):
                    with model.placed((0.095, 0.0, 0.0), tilt=math.radians(35.0)):
                        model.box((0.0, 0.0, 0.0), (0.10, 0.06, 0.008), "white")
    # Generator pod on top of the duct, with marker lights, a cable down to a junction box.
    model.box((0.0, 0.14, AXIS_Z + 0.17), (0.12, 0.20, 0.06), "steel_dark")
    model.box((0.0, 0.14, AXIS_Z + 0.21), (0.012, 0.14, 0.03), "yellow")
    for y in (0.06, 0.22):
        parts.lamp(model, (0.05, y, AXIS_Z + 0.209), (0.022, 0.022, 0.018), ACCENT)
    parts.tip_light(model, (-0.04, 0.22), AXIS_Z + 0.20, color=parts.STATUS, radius=0.012)
    parts.pipe(model, [(0.06, 0.20, AXIS_Z + 0.16), (0.24, 0.20, AXIS_Z + 0.16), (0.24, 0.20, base + 0.03),
                       (0.30, 0.20, base + 0.03)], radius=0.012, color="dark")
    model.box((0.34, 0.20, base + 0.07), (0.08, 0.10, 0.14), "yellow")
    model.plate((0.38 + 0.0006, 0.20, base + 0.09), (0.06, 0.04), "+x", "dark")
    # Floodlights on the pylons, looking at the intake and to the right.
    parts.floodlight(model, (0.0, -0.07 - 0.0175, base + 0.09), "-y", size=(0.06, 0.03))
    parts.floodlight(model, (0.06 + 0.0175, 0.22, base + 0.09), "+x", size=(0.06, 0.03))
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build)
