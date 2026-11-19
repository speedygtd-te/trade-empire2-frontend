"""Arms plant (1x1x1): the factory's hall (factory.py) turned into a weapons works. A rocket
stands upright in an assembly frame, a second one lies on trestles at the front, a crate of
ammunition hangs from the crane; green ammunition boxes are stacked against the wall and
brass shells stand on a pallet. A red warning light on the back wall.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import factory  # noqa: E402
import kit  # noqa: E402
import parts  # noqa: E402


def rocket(model, length: float = 0.40, radius: float = 0.04, body: str = "white", tip: str = "red") -> None:
    """A rocket along +Z of the current frame, its nozzle at the origin: body, band, warhead,
    four fins."""
    model.cylinder((0.0, 0.0, -0.02), (0.0, 0.0, 0.0), radius * 0.6, "steel_dark", segments=8,
                   end_radius=radius * 0.8)
    shaft = length * 0.74
    model.cylinder((0.0, 0.0, 0.0), (0.0, 0.0, shaft), radius, body, segments=10)
    model.cylinder((0.0, 0.0, shaft * 0.74), (0.0, 0.0, shaft * 0.74 + 0.025), radius * 1.04, tip, segments=10)
    model.revolve((0.0, 0.0, shaft), [(radius, 0.0), (radius * 0.82, (length - shaft) * 0.45),
                                      (radius * 0.45, (length - shaft) * 0.82), (0.0, length - shaft)],
                  tip, segments=10)
    for fin in range(4):
        with model.placed((0.0, 0.0, 0.0), turn=fin * math.pi / 2.0):
            model.box((radius + 0.02, 0.0, 0.05), (0.045, 0.006, 0.09), "steel_dark")


def build():
    model = kit.Builder("te_arms_plant")
    top = factory.hall(model)
    # Upright rocket in an assembly frame at the back right.
    x, y = 0.22, 0.18
    model.box((x, y, top + 0.015), (0.16, 0.16, 0.03), "steel_dark")
    with model.placed((x, y, top + 0.05)):
        rocket(model, length=0.44)
    corners = ((0.08, 0.08), (0.08, -0.08), (-0.08, -0.08), (-0.08, 0.08))
    for index, (cx, cy) in enumerate(corners):
        model.beam((x + cx, y + cy, top + 0.03), (x + cx, y + cy, top + 0.40), 0.012, "yellow")
        nx, ny = corners[(index + 1) % 4]
        for height in (0.18, 0.38):
            model.beam((x + cx, y + cy, top + height), (x + nx, y + ny, top + height), 0.01, "yellow")
    # Lying rocket on two trestles at the front.
    for tx in (-0.16, 0.10):
        model.box((tx, -0.20, top + 0.03), (0.04, 0.10, 0.06), "steel_dark")
        model.box((tx, -0.20, top + 0.065), (0.05, 0.08, 0.01), "rust_brown")
    with model.placed((-0.27, -0.20, top + 0.11), turn=math.pi / 2.0, tilt=math.pi / 2.0):
        rocket(model, length=0.44, radius=0.042, body="steel_light")
    # Green ammunition boxes stacked against the back wall, on the left.
    for index, (bx, by, level) in enumerate(((-0.24, 0.25, 0), (-0.10, 0.25, 0), (-0.24, 0.12, 0),
                                              (-0.17, 0.25, 1), (-0.24, 0.18, 1))):
        z = top + level * 0.06
        model.box((bx, by, z + 0.03), (0.12, 0.10, 0.06), "olive")
        model.plate((bx, by - 0.05 - 0.0006, z + 0.03), (0.08, 0.012), "-y", "yellow")
    # Brass shells standing on a pallet at the front right.
    model.box((0.29, -0.28, top + 0.01), (0.16, 0.16, 0.02), "rust_brown")
    for sx in (-1, 0, 1):
        for sy in (-1, 0, 1):
            sx_, sy_ = 0.29 + sx * 0.045, -0.28 + sy * 0.045
            model.cylinder((sx_, sy_, top + 0.02), (sx_, sy_, top + 0.10), 0.017, "yellow", segments=6)
            model.cylinder((sx_, sy_, top + 0.10), (sx_, sy_, top + 0.135), 0.017, "steel_dark", segments=6,
                           end_radius=0.004)
    # An ammunition box hanging from the crane.
    factory.hoist(model, -0.02, top, top + 0.29)
    model.box((-0.02, 0.0, top + 0.24), (0.12, 0.08, 0.07), "olive")
    model.plate((-0.02, -0.04 - 0.0006, top + 0.24), (0.08, 0.012), "-y", "yellow")
    # Red warning light over the back wall: explosives.
    model.box((0.05, 0.345, top + 0.30), (0.05, 0.01, 0.04), "steel_dark")
    parts.lamp(model, (0.05, 0.335, top + 0.30), (0.035, 0.012, 0.025), parts.WARNING)
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build)
