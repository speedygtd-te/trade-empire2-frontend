"""Drive works (1x1x1): the factory's hall (factory.py) where wheels and tracks are made. Tyres
lie stacked against the wall, a wheel stands at the front, a finished track unit and a loose
track belt lie on the floor, a wheel hangs from the crane; an exhaust fan turns in the back
wall (moving part "fan_1").
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import factory  # noqa: E402
import kit  # noqa: E402
import parts  # noqa: E402

ACCENT = "glow_orange"


def wheel(model, radius: float = 0.08, width: float = 0.05) -> None:
    """A wheel around the Z axis of the current frame, lying on its side at the origin: a dark
    tyre with treads, a light rim, a hub cap."""
    model.cylinder((0.0, 0.0, 0.0), (0.0, 0.0, width), radius, "dark", segments=12)
    model.cylinder((0.0, 0.0, -0.002), (0.0, 0.0, width + 0.002), radius * 0.55, "steel_light", segments=10)
    model.cylinder((0.0, 0.0, width), (0.0, 0.0, width + 0.008), radius * 0.2, "yellow", segments=6)


def track_belt(model, length: float, width: float, z: float, links: int) -> None:
    """A flat track belt along x at the origin of the current frame: a dark band with steel
    cleats across it."""
    model.box((0.0, 0.0, z + 0.006), (length, width, 0.012), "dark")
    for index in range(links):
        x = -length / 2.0 + (index + 0.5) * length / links
        model.box((x, 0.0, z + 0.016), (0.014, width + 0.01, 0.008), "steel")


def build():
    model = kit.Builder("te_drive_works")
    top = factory.hall(model)
    # Tyres stacked against the back wall on the left.
    for level in range(3):
        with model.placed((-0.22, 0.22, top + level * 0.052)):
            wheel(model, radius=0.085, width=0.05)
    with model.placed((-0.22, 0.05, top)):
        wheel(model, radius=0.085, width=0.05)
    # A wheel standing at the front, its face to the right.
    with model.placed((0.24, -0.26, top + 0.085), turn=-math.pi / 2.0, tilt=math.pi / 2.0):
        wheel(model, radius=0.085, width=0.05)
    # A finished track unit at the back right: road wheels inside a belt loop.
    with model.placed((0.16, 0.20, top)):
        model.box((0.0, 0.0, 0.065), (0.30, 0.08, 0.09), "steel_dark")
        for x in (-0.10, 0.0, 0.10):
            model.cylinder((x, -0.045, 0.06), (x, 0.045, 0.06), 0.04, "steel", segments=10)
        model.cylinder((-0.16, -0.045, 0.07), (-0.16, 0.045, 0.07), 0.05, "rust",
                       segments=10)
        model.cylinder((0.16, -0.045, 0.07), (0.16, 0.045, 0.07), 0.05, "rust", segments=10)
        track_belt(model, 0.34, 0.09, 0.0, 9)
        track_belt(model, 0.34, 0.09, 0.115, 9)
        model.plate((0.0, -0.0406, 0.065), (0.16, 0.02), "-y", "yellow")
    # A loose track belt lying on the floor at the front.
    with model.placed((-0.05, -0.22, top), turn=math.radians(12.0)):
        track_belt(model, 0.34, 0.10, 0.0, 10)
    # A wheel hanging from the crane.
    factory.hoist(model, 0.04, top, top + 0.30)
    with model.placed((0.04, 0.025, top + 0.21), tilt=math.pi / 2.0):
        wheel(model, radius=0.075, width=0.05)
    # Exhaust fan in the back wall and a workbench under it.
    parts.wall_fan(model, (0.20, 0.35, top + 0.25), "fan_1", radius=0.07, accent=ACCENT)
    parts.lamp(model, (0.20, 0.345, top + 0.36), (0.05, 0.012, 0.016), parts.STATUS)
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build)
