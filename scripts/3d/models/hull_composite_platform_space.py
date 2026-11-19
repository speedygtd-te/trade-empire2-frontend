"""Composite space platform (1x1, OUTDOOR slot on warships): a closed armour plate in the navy of
the composite hull, with the same yellow and black hazard stripes along its edges.

  blender --background --factory-startup --python scripts/3d/models/hull_composite_platform_space.py -- --output <file.glb>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hulls  # noqa: E402
import kit  # noqa: E402

_HALF = 0.5
_RIM = 0.06
_STRIPES = 6


def build():
    model = kit.Builder("te_hull_composite_platform_space", wear=0.3)
    height = hulls.FLOOR_HEIGHT
    model.box((0.0, 0.0, height * 0.5), (1.0, 1.0, height), "navy")
    # A black rim with diagonal yellow stripes on every side.
    for sign in (-1, 1):
        model.box((0.0, sign * (_HALF - _RIM / 2.0), height + 0.006), (1.0, _RIM, 0.012), "black_metal")
        model.box((sign * (_HALF - _RIM / 2.0), 0.0, height + 0.006), (_RIM, 1.0 - 2.0 * _RIM, 0.012),
                  "black_metal")
        for index in range(_STRIPES):
            along = -0.4 + index * 0.8 / (_STRIPES - 1)
            model.box((along, sign * (_HALF - _RIM / 2.0), height + 0.0125), (0.05, _RIM * 0.5, 0.002),
                      "yellow", turn=0.6)
            model.box((sign * (_HALF - _RIM / 2.0), along, height + 0.0125), (_RIM * 0.5, 0.05, 0.002),
                      "yellow", turn=0.6)
    # Armour seams across the plate.
    for offset in (-0.15, 0.15):
        model.plate((offset, 0.0, height + 0.0006), (0.01, 0.86), "+z", "steel_dark")
        model.plate((0.0, offset, height + 0.0006), (0.86, 0.01), "+z", "steel_dark")
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build, footprint=1.0)
