"""Underwater platform (1x1, UNDER_WATER slot): a sealed blue plate with a raised steel rim, bolted
corner posts with lamps and a round hatch, so it reads apart from the open surface platforms.

  blender --background --factory-startup --python scripts/3d/models/hull_platform_underwater.py -- --output <file.glb>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hulls  # noqa: E402
import kit  # noqa: E402
import parts  # noqa: E402

_HALF = 0.5
_RIM = 0.07


def build():
    model = kit.Builder("te_hull_platform_underwater", wear=0.35)
    height = hulls.FLOOR_HEIGHT
    model.box((0.0, 0.0, height * 0.5), (1.0, 1.0, height), "blue_paint")
    for sign in (-1, 1):
        model.box((0.0, sign * (_HALF - _RIM / 2.0), height + 0.008), (1.0, _RIM, 0.016), "steel_light")
        model.box((sign * (_HALF - _RIM / 2.0), 0.0, height + 0.008), (_RIM, 1.0 - 2.0 * _RIM, 0.016),
                  "steel_light")
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (_HALF - 0.04), sy * (_HALF - 0.04)
            model.cylinder((x, y, height), (x, y, height + 0.05), 0.032, "steel_dark", segments=10)
            model.plate((x, y, height + 0.05 + 0.0006), (0.03, 0.03), "+z", parts.LAMP)
    # A round hatch in one corner and seams across the plate.
    model.cylinder((0.24, -0.24, height), (0.24, -0.24, height + 0.008), 0.09, "steel_dark", segments=16)
    model.cylinder((0.24, -0.24, height + 0.008), (0.24, -0.24, height + 0.012), 0.05, "steel_light", segments=12)
    for offset in (-0.2, 0.2):
        model.plate((offset, 0.0, height + 0.0006), (0.008, 0.86), "+z", "blue_dark")
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build, footprint=1.0)
