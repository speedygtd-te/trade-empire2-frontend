"""Factory (1x1x1): an open hall with a gantry crane, a large turbine-like machine hanging from
it, a table with solar cells and a pallet; a yellow-black edge. Modelled after
src/assets/modules/factory/factory_0.webp.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402


def gantry(model, top: float) -> None:
    """A crane bridge on two posts along the left wall, shared with the hull forge."""
    for y in (-0.30, 0.30):
        model.box((-0.30, y, top + 0.24), (0.07, 0.07, 0.48), "blue")
    model.box((-0.30, 0.0, top + 0.50), (0.08, 0.70, 0.07), "blue")
    model.box((-0.30, 0.0, top + 0.545), (0.10, 0.72, 0.02), "blue_dark")
    model.box((0.02, 0.0, top + 0.50), (0.60, 0.05, 0.04), "blue_dark")


def build():
    model = kit.Builder("te_factory")
    top = parts.room(model, height=0.34)
    parts.stripes(model, (-0.42, -0.43), 21, z=0.0, width=0.02)
    gantry(model, top)
    # Hanging machine: a drum turned towards the camera.
    model.beam((0.18, 0.0, top + 0.48), (0.18, 0.0, top + 0.34), 0.008, "steel_dark")
    model.cylinder((0.18, 0.06, top + 0.20), (0.18, -0.08, top + 0.20), 0.13, "blue")
    model.cylinder((0.18, -0.08, top + 0.20), (0.18, -0.10, top + 0.20), 0.09, "steel_dark")
    model.box((0.18, 0.0, top + 0.05), (0.20, 0.16, 0.10), "steel_dark")
    # Table with solar cells and a pallet at the front.
    model.box((-0.14, -0.14, top + 0.10), (0.30, 0.24, 0.02), "steel")
    model.plate((-0.14, -0.14, top + 0.1106), (0.26, 0.20), "+z", "solar")
    for x in (-0.27, -0.01):
        for y in (-0.24, -0.04):
            model.beam((x, y, top), (x, y, top + 0.10), 0.014, "steel_dark")
    parts.crate(model, (0.22, -0.30), top, (0.12, 0.10, 0.04), "rust_brown")
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build)
