"""Outdoor platform (1x1, OUTDOOR slot): an open steel grating in a frame, for modules that
work in the open (solar panels, pumps, collectors).

  blender --background --factory-startup --python scripts/3d/models/hull_platform_outdoor.py -- --output <file.glb>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hulls  # noqa: E402
import kit  # noqa: E402
import parts  # noqa: E402


def build():
    model = hulls.grating_hull("te_hull_platform_outdoor", frame="steel", bars="steel_light")
    # Yellow corner marks, so a platform reads differently from a closed floor.
    for sx in (-1, 1):
        for sy in (-1, 1):
            model.plate((sx * 0.44, sy * 0.44, hulls.FLOOR_HEIGHT + 0.0006), (0.06, 0.06), "+z", "yellow")
    # Lamps set into the frame, two per side.
    parts.edge_lamps(model, 0.5, hulls.FLOOR_HEIGHT, count=2, size=(0.04, 0.016), margin=0.2, face=False)
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build, footprint=1.0)
