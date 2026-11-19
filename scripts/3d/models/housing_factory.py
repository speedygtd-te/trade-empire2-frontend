"""Housing factory (1x1x1): the factory's hall (factory.py) where prefabricated homes are made.
A blue wall panel with a window opening hangs from the crane while a robot arm fits it, more
panels lie stacked on the floor, finished windows lean on an A-frame rack at the back right; an
exhaust fan turns in the back wall (moving part "fan_1").
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import factory  # noqa: E402
import kit  # noqa: E402
import parts  # noqa: E402

PANEL = "blue_paint"


def wall_panel(model, size, thickness: float = 0.02) -> None:
    """A wall panel standing in the XZ plane of the current frame, its bottom edge at the
    origin: a light slab with a dark window opening and a yellow edge strip on its front (-y)."""
    width, height = size
    model.box((0.0, 0.0, height / 2.0), (width, thickness, height), PANEL)
    front = -thickness / 2.0 - 0.0006
    model.plate((-width * 0.18, front, height * 0.55), (width * 0.32, height * 0.40), "-y", "dark")
    model.plate((0.0, front, height * 0.08), (width, 0.012), "-y", "yellow")


def window_frame(model, size) -> None:
    """A finished window in the XZ plane of the current frame, its bottom edge at the origin:
    a frame, the pane and a cross bar, seen from the front (-y)."""
    width, height = size
    model.box((0.0, 0.0, height / 2.0), (width, 0.014, height), "steel_light")
    model.plate((0.0, -0.0076, height / 2.0), (width * 0.82, height * 0.82), "-y", "glass")
    model.plate((0.0, -0.0082, height / 2.0), (width * 0.82, 0.008), "-y", "steel_light")


def build():
    model = kit.Builder("te_housing_factory")
    top = factory.hall(model)
    # A wall panel hanging from the crane, on two slings from the hook.
    factory.hoist(model, 0.06, top, top + 0.38)
    for side in (-1, 1):
        model.beam((0.06, 0.0, top + 0.38), (0.06 + side * 0.10, 0.0, top + 0.34), 0.005, "steel_dark")
    with model.placed((0.06, 0.0, top + 0.11)):
        wall_panel(model, (0.24, 0.23))
    # A robot arm at the front right fits the panel.
    parts.robot_arm(model, (0.30, -0.12), math.radians(-90.0), top)
    parts.crate(model, (0.30, -0.32), top, (0.12, 0.10, 0.06), "rust_brown", turn=0.2)
    # Panels lying stacked on the floor at the left.
    for level in range(3):
        with model.placed((-0.18, -0.32 + level * 0.006, top + 0.022 + level * 0.022), tilt=-math.pi / 2.0):
            wall_panel(model, (0.24, 0.20))
    model.box((-0.18, -0.30, top + 0.006), (0.26, 0.03, 0.012), "rust_brown")
    model.box((-0.18, -0.14, top + 0.006), (0.26, 0.03, 0.012), "rust_brown")
    # Finished windows leaning on an A-frame rack at the back right.
    x, y = 0.24, 0.16
    for side in (-1, 1):
        model.beam((x + side * 0.12, y - 0.05, top), (x + side * 0.12, y, top + 0.18), 0.012, "steel_dark")
        model.beam((x + side * 0.12, y + 0.05, top), (x + side * 0.12, y, top + 0.18), 0.012, "steel_dark")
    model.beam((x - 0.12, y, top + 0.18), (x + 0.12, y, top + 0.18), 0.012, "steel_dark")
    model.box((x, y, top + 0.006), (0.26, 0.14, 0.012), "steel")
    for index in range(3):
        with model.placed((x, y - 0.03 - index * 0.016, top + 0.012), tilt=math.radians(-16.0)):
            window_frame(model, (0.18, 0.15))
    with model.placed((x, y + 0.03, top + 0.012), tilt=math.radians(-16.0), turn=math.pi):
        window_frame(model, (0.18, 0.15))
    # Exhaust fan in the back wall.
    parts.wall_fan(model, (-0.02, 0.35, top + 0.25), "fan_1", radius=0.07)
    parts.lamp(model, (-0.02, 0.345, top + 0.36), (0.05, 0.012, 0.016), parts.STATUS)
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build)
