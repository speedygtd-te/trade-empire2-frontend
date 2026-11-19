"""RTG (1x1x1): a small power plant like a nuclear one. A concrete containment dome with an
orange-lit hatch, a cooling tower behind it, a cooler block with two fans (moving parts
"fan_1", "fan_2") and pipes between them.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

ACCENT = "glow_orange"
DOME = (-0.12, -0.02)
TOWER = (0.20, 0.20)
COOLER = (0.20, -0.20)


def build():
    model = kit.Builder("te_rtg")
    top = parts.slab(model, size=0.84)
    parts.stripes(model, (-0.40, -0.385), 5)
    _dome(model, top)
    _tower(model, top)
    _cooler(model, top)
    # Pipes from the dome to the cooler and to the tower.
    height = top + 0.07
    parts.pipe(model, [(0.04, -0.10, height), (0.04, -0.20, height), (COOLER[0] - 0.11, -0.20, height)],
               radius=0.018, color="steel")
    parts.pipe(model, [(-0.02, 0.13, height + 0.04), (-0.02, 0.25, height + 0.04), (0.07, 0.25, height + 0.04)],
               radius=0.016, color="rust")
    parts.valve(model, (0.02, -0.33), top)
    parts.lamp_post(model, (-0.35, -0.35), top, height=0.24)
    return model.finish()


def _dome(model, top: float) -> None:
    """The containment: a round wall with a dome, a hatch glowing orange under a floodlight,
    a red light on top."""
    x, y = DOME
    radius = 0.19
    wall = 0.16
    model.revolve((x, y, top), [(radius + 0.02, 0.0), (radius + 0.02, 0.03), (radius, 0.03), (radius, wall),
                                (radius * 0.92, wall + radius * 0.38), (radius * 0.70, wall + radius * 0.70),
                                (radius * 0.38, wall + radius * 0.92), (0.0, wall + radius)],
                  "concrete", segments=16, sharp=30.0)
    model.cylinder((x, y, top + wall - 0.012), (x, y, top + wall + 0.004), radius + 0.006, "yellow", segments=16)
    # The hatch on the front, lit from inside.
    model.box((x - 0.02, y - radius + 0.01, top + 0.075), (0.10, 0.04, 0.09), "steel_dark")
    model.plate((x - 0.02, y - radius - 0.0106, top + 0.07), (0.07, 0.065), "-y", ACCENT)
    parts.floodlight(model, (x - 0.02, y - radius - 0.002, top + 0.145), "-y", size=(0.06, 0.025))
    parts.tip_light(model, (x, y), top + wall + radius - 0.004, color=parts.WARNING, radius=0.016)


def _tower(model, top: float) -> None:
    """A cooling tower: a waisted concrete shell on a dark ring of air inlets, open at the top
    with a dark inside."""
    x, y = TOWER
    height = 0.50
    model.revolve((x, y, top), [(0.15, 0.0, "dark"), (0.147, 0.035), (0.12, height * 0.35), (0.105, height * 0.70), (0.115, height),
                                (0.098, height, "dark"), (0.09, height * 0.82, "dark"), (0.0, height * 0.82)],
                  "concrete", segments=14, sharp=50.0)
    model.plate((x, y - 0.122 - 0.0006, top + height * 0.36), (0.05, 0.06), "-y", "yellow")
    parts.tip_light(model, (x + 0.08, y - 0.08), top + height - 0.012, radius=0.012)


def _cooler(model, top: float) -> None:
    """A cooler block with two fans on top."""
    x, y = COOLER
    model.box((x, y, top + 0.08), (0.24, 0.16, 0.16), "steel_dark")
    parts.vent(model, (x + 0.12, y, top + 0.08), (0.12, 0.10), "+x", slats=5)
    parts.vent(model, (x, y - 0.08, top + 0.08), (0.18, 0.10), "-y", slats=5)
    model.plate((x, y - 0.08 - 0.0006, top + 0.15), (0.24, 0.016), "-y", ACCENT)
    for number, fx in enumerate((x - 0.06, x + 0.06), start=1):
        parts.roof_fan(model, (fx, y), top + 0.16, "fan_%d" % number, accent=ACCENT, radius=0.055)


if __name__ == "__main__":
    kit.run_from_command_line(build)
