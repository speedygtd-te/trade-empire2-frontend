"""Space platform (1x1, OUTDOOR slot in orbit, space and on asteroids): an open grating in a light
station-white frame with blue corner marks and tie-down eyes, so it reads apart from the steel
surface platform (hull_platform_outdoor) and the armoured composite one.

  blender --background --factory-startup --python scripts/3d/models/hull_platform_space.py -- --output <file.glb>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hulls  # noqa: E402
import kit  # noqa: E402
import parts  # noqa: E402


def build():
    model = hulls.grating_hull("te_hull_platform_space", frame="white", bars="steel", count=7)
    top = hulls.FLOOR_HEIGHT + 0.0006
    for sx in (-1, 1):
        for sy in (-1, 1):
            model.plate((sx * 0.44, sy * 0.44, top), (0.06, 0.06), "+z", "blue_paint")
            # Tie-down eyes for cargo and mounts, a little in from the corners.
            model.cylinder((sx * 0.36, sy * 0.36, hulls.FLOOR_HEIGHT),
                           (sx * 0.36, sy * 0.36, hulls.FLOOR_HEIGHT + 0.018), 0.022, "steel_dark", segments=8)
    parts.edge_lamps(model, 0.5, hulls.FLOOR_HEIGHT, count=2, size=(0.04, 0.016), margin=0.2, face=False)
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build, footprint=1.0)
