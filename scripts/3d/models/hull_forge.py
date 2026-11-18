"""Hull forge (1x1x1): the factory's hall with a gantry crane, a welding press with a glowing
cube, sawhorses and barrels. Modelled after src/assets/modules/hull_forge/hull_forge_0.webp.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import factory  # noqa: E402
import kit  # noqa: E402
import parts  # noqa: E402


def build():
    model = kit.Builder("te_hull_forge")
    top = parts.room(model, height=0.34)
    parts.stripes(model, (-0.42, -0.43), 21, z=0.0, width=0.02)
    factory.gantry(model, top)
    # Press plate with a hull block being welded.
    model.box((0.16, 0.04, top + 0.015), (0.30, 0.30, 0.03), "steel_light")
    model.box((0.18, 0.08, top + 0.10), (0.14, 0.14, 0.14), "steel_dark")
    model.plate((0.11 - 0.0006, 0.08, top + 0.10), (0.10, 0.10), "-x", "glow_cyan")
    model.plate((0.18, 0.01 - 0.0006, top + 0.10), (0.10, 0.10), "-y", "glow_cyan")
    # Sawhorses and barrels at the front left.
    for x in (-0.18, -0.06):
        model.beam((x, -0.30, top), (x, -0.22, top + 0.10), 0.012, "steel_dark")
        model.beam((x, -0.14, top), (x, -0.22, top + 0.10), 0.012, "steel_dark")
    model.beam((-0.20, -0.22, top + 0.10), (-0.04, -0.22, top + 0.10), 0.014, "steel")
    parts.barrel(model, (0.28, -0.28), top, radius=0.035, height=0.08)
    parts.barrel(model, (0.30, -0.18), top, radius=0.035, height=0.08)
    parts.control_box(model, (-0.24, 0.24), z=top)
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build)
