"""Hydroponic bay (1x1x1): a dark machine block at the back, a rack of plant trays under purple
grow lights in front of it, a planter box at the front. Modelled after
src/assets/modules/hydroponic_bay/hydroponic_bay_0.webp.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402


def build():
    model = kit.Builder("te_hydroponic_bay")
    base = 0.06
    model.box((0.0, 0.0, base / 2.0), (0.84, 0.84, base), "floor")
    # Machine block at the back right with light strips.
    model.box((0.17, 0.24, base + 0.30), (0.40, 0.30, 0.60), "blue_dark")
    model.box((0.17, 0.24, base + 0.61), (0.42, 0.32, 0.02), "steel_dark")
    for x in (0.08, 0.26):
        model.plate((x, 0.09 - 0.0006, base + 0.32), (0.05, 0.36), "-y", "glow_purple")
    model.plate((0.37 + 0.0006, 0.24, base + 0.40), (0.04, 0.30), "+x", "glow_purple")
    model.box((0.10, 0.28, base + 0.64), (0.10, 0.10, 0.04), "steel")
    model.box((0.25, 0.28, base + 0.64), (0.10, 0.10, 0.04), "steel")
    # Tray rack on the left: three shelves with plants and lights.
    for corner in ((-0.36, -0.10), (-0.06, -0.10), (-0.36, 0.30), (-0.06, 0.30)):
        model.beam((corner[0], corner[1], base), (corner[0], corner[1], base + 0.48), 0.018, "steel_light")
    for level, z in enumerate((0.10, 0.26, 0.42)):
        model.box((-0.21, 0.10, base + z), (0.32, 0.42, 0.02), "steel")
        model.plate((-0.21, 0.10, base + z + 0.0106), (0.28, 0.36), "+z", "soil" if level else "glow_purple")
        for x in (-0.31, -0.21, -0.11):
            for y in (-0.02, 0.10, 0.22):
                model.cylinder((x, y, base + z + 0.01), (x, y, base + z + 0.07), 0.028, "plant",
                               segments=5, end_radius=0.01)
        model.plate((-0.21, 0.10, base + z + 0.14), (0.28, 0.36), "+z", "glow_purple")
    model.box((-0.21, 0.10, base + 0.50), (0.34, 0.44, 0.03), "steel_dark")
    # Planter box at the front right.
    model.box((0.20, -0.22, base + 0.07), (0.32, 0.18, 0.14), "blue")
    model.plate((0.20, -0.31 - 0.0006, base + 0.07), (0.24, 0.06), "-y", "glow_purple")
    for x in (0.10, 0.20, 0.30):
        model.cylinder((x, -0.22, base + 0.14), (x, -0.22, base + 0.21), 0.035, "plant", segments=5, end_radius=0.01)
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build)
