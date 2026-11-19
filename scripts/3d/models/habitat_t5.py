"""Habitat, tier 5 (1x1x1): an upscale apartment in an open room (white walls, wooden floor,
purple light trim). A double bed with a headboard and a night stand with a lamp, a desk with
three screens on the wall above it, an armchair with a floor lamp facing a large screen on
the left wall, a rug and a potted plant. Housing: a clean look (low wear).
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

ACCENT = "glow_purple"
SCREEN = "glow_cyan"
WEAR = 0.2
# Inside faces of the back wall (y) and the left wall (x).
BACK = 0.35
LEFT = -0.35


def build():
    model = kit.Builder("te_habitat_t5", wear=WEAR)
    top = parts.room(model, floor="wood", wall="white", cap="paint_grey", trim=ACCENT)
    model.plate((0.02, -0.06, top + 0.0006), (0.36, 0.26), "+z", "navy")
    model.plate((0.02, -0.06, top + 0.0012), (0.30, 0.20), "+z", "blue_paint")
    _bed(model, top)
    _desk(model, top)
    _lounge(model, top)
    # A potted plant in the front right corner.
    model.cylinder((0.33, -0.33, top), (0.33, -0.33, top + 0.07), 0.035, "white", segments=8, end_radius=0.045)
    model.lump((0.33, -0.33, top + 0.12), (0.10, 0.10, 0.10), "plant", seed=3, rough=0.2)
    return model.finish()


def _bed(model, top: float) -> None:
    x, y = -0.15, 0.19
    model.box((x, y, top + 0.025), (0.30, 0.30, 0.05), "wood")
    model.box((x, y, top + 0.07), (0.28, 0.28, 0.04), "white")
    model.box((x, y - 0.045, top + 0.085), (0.29, 0.19, 0.022), "fabric")
    for side in (-1, 1):
        model.box((x + side * 0.07, y + 0.10, top + 0.10), (0.11, 0.06, 0.03), "white")
    model.box((x, BACK - 0.015, top + 0.09), (0.32, 0.03, 0.18), "wood")
    model.plate((x, BACK - 0.03 - 0.0006, top + 0.15), (0.26, 0.012), "-y", ACCENT)
    # Night stand with a lamp.
    model.box((0.06, 0.29, top + 0.04), (0.08, 0.08, 0.08), "wood")
    model.cylinder((0.06, 0.29, top + 0.08), (0.06, 0.29, top + 0.12), 0.008, "steel_dark", segments=6)
    model.cylinder((0.06, 0.29, top + 0.12), (0.06, 0.29, top + 0.16), 0.03, parts.LAMP, segments=8,
                   end_radius=0.02)


def _desk(model, top: float) -> None:
    x, y = 0.27, 0.28
    model.box((x, y, top + 0.11), (0.24, 0.12, 0.02), "wood")
    for side in (-1, 1):
        model.box((x + side * 0.11, y, top + 0.05), (0.02, 0.11, 0.10), "wood")
    model.box((x - 0.04, y + 0.01, top + 0.125), (0.08, 0.04, 0.01), "black_metal")
    # Three screens on the wall over the desk.
    for offset, width in ((-0.10, 0.08), (0.0, 0.10), (0.10, 0.08)):
        model.box((x + offset, BACK - 0.006, top + 0.24), (width, 0.012, 0.07), "black_metal")
        model.plate((x + offset, BACK - 0.012 - 0.0006, top + 0.24), (width - 0.012, 0.058), "-y", SCREEN)
    # Office chair in front of the desk.
    model.cylinder((x, y - 0.13, top), (x, y - 0.13, top + 0.06), 0.008, "steel_dark", segments=6)
    model.cylinder((x, y - 0.13, top), (x, y - 0.13, top + 0.008), 0.04, "steel_dark", segments=6)
    model.box((x, y - 0.13, top + 0.07), (0.08, 0.08, 0.02), "fabric")
    model.box((x, y - 0.175, top + 0.12), (0.08, 0.015, 0.09), "fabric")


def _lounge(model, top: float) -> None:
    """An armchair facing the big screen on the left wall, a floor lamp and a side table."""
    # The screen.
    model.box((LEFT + 0.006, -0.10, top + 0.22), (0.012, 0.28, 0.16), "black_metal")
    model.plate((LEFT + 0.012 + 0.0006, -0.10, top + 0.22), (0.26, 0.14), "+x", ACCENT)
    model.box((LEFT + 0.04, -0.10, top + 0.04), (0.06, 0.22, 0.08), "wood")
    # The armchair, looking to the left.
    with model.placed((0.08, -0.14, top), turn=math.pi):
        model.box((0.0, 0.0, 0.05), (0.13, 0.14, 0.05), "fabric")
        model.box((-0.055, 0.0, 0.11), (0.03, 0.14, 0.13), "fabric")
        for side in (-1, 1):
            model.box((0.0, side * 0.075, 0.07), (0.13, 0.025, 0.07), "fabric")
        for sx in (-1, 1):
            for sy in (-1, 1):
                model.beam((sx * 0.05, sy * 0.055, 0.0), (sx * 0.05, sy * 0.055, 0.03), 0.012, "wood")
    # Floor lamp and side table beside the armchair.
    model.cylinder((0.16, -0.30, top), (0.16, -0.30, top + 0.01), 0.03, "black_metal", segments=8)
    model.cylinder((0.16, -0.30, top + 0.01), (0.16, -0.30, top + 0.26), 0.007, "black_metal", segments=6)
    model.cylinder((0.16, -0.30, top + 0.24), (0.16, -0.30, top + 0.30), 0.045, parts.LAMP, segments=10,
                   end_radius=0.03)
    model.cylinder((0.18, 0.02, top), (0.18, 0.02, top + 0.08), 0.008, "black_metal", segments=6)
    model.cylinder((0.18, 0.02, top + 0.08), (0.18, 0.02, top + 0.09), 0.05, "wood", segments=10)


if __name__ == "__main__":
    kit.run_from_command_line(build)
