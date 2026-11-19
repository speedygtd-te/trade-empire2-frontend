"""Park module (1x1x1): a small park in the open, without walls. A lawn with a paved path, three
trees, bushes and a flower bed, a pond with a stone rim, a bench and two lamp posts.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

WEAR = 0.4


def build():
    model = kit.Builder("te_park_module", wear=WEAR)
    top = parts.slab(model, size=0.84, top="moss")
    # A paved path from the front to the right side, past the pond.
    model.plate((0.06, -0.26, top + 0.0006), (0.12, 0.32), "+z", "concrete")
    model.plate((0.20, -0.04, top + 0.0006), (0.40, 0.12), "+z", "concrete")
    # The pond at the back right with a stone rim.
    model.revolve((0.20, 0.22, top), [(0.15, 0.0), (0.15, 0.025), (0.13, 0.03), (0.13, 0.012, "glass"),
                                      (0.0, 0.012)], "stone", segments=14, sharp=30.0)
    for index, (x, y) in enumerate(((0.06, 0.30), (0.33, 0.18), (0.30, 0.31))):
        model.lump((x, y, top), (0.06, 0.05, 0.04), "stone", seed=index, rough=0.2)
    # Trees, bushes and a flower bed.
    parts.tree(model, (-0.24, 0.22), top, height=0.42, seed=1)
    parts.tree(model, (-0.06, 0.30), top, height=0.32, seed=4)
    parts.tree(model, (-0.27, -0.12), top, height=0.36, seed=7)
    for index, (x, y) in enumerate(((-0.12, 0.10), (0.33, -0.20), (-0.33, 0.05))):
        model.lump((x, y, top), (0.09, 0.08, 0.08), "moss", seed=20 + index, rough=0.25)
    model.box((-0.17, -0.30, top + 0.02), (0.20, 0.12, 0.04), "stone_dark")
    model.plate((-0.17, -0.30, top + 0.0406), (0.17, 0.09), "+z", "soil")
    for index, (x, color) in enumerate(((-0.24, "red"), (-0.19, "yellow"), (-0.14, "white"), (-0.09, "red"))):
        model.lump((x, -0.30 + (index % 2) * 0.03 - 0.015, top + 0.04), (0.035, 0.035, 0.035), color,
                   seed=30 + index, rough=0.2)
    # A bench by the path, looking at the pond.
    model.box((0.30, -0.18, top + 0.05), (0.18, 0.06, 0.015), "wood")
    model.box((0.30, -0.21, top + 0.085), (0.18, 0.012, 0.05), "wood")
    for x in (0.23, 0.37):
        model.box((x, -0.18, top + 0.025), (0.015, 0.05, 0.05), "black_metal")
    parts.lamp_post(model, (0.35, -0.35), top, height=0.30)
    parts.lamp_post(model, (0.36, 0.03), top, height=0.30, facing="+x")
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build)
