"""Dock (1x1, no module slot): a concrete landing pad with yellow edge markings and a light
in one corner. Ships and vehicles are founded on docks.

  blender --background --factory-startup --python scripts/3d/models/hull_dock.py -- --output <file.glb>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hulls  # noqa: E402
import kit  # noqa: E402
import parts  # noqa: E402


def build():
    model = kit.Builder("te_hull_dock")
    height = hulls.FLOOR_HEIGHT
    model.box((0.0, 0.0, height * 0.5), (1.0, 1.0, height), "concrete")
    top = height + 0.0006
    for sign in (-1, 1):
        model.plate((0.0, sign * 0.46, top), (0.92, 0.025), "+z", "yellow")
        model.plate((sign * 0.46, 0.0, top), (0.025, 0.92), "+z", "yellow")
    # A chevron pointing into the pad.
    model.plate((0.0, 0.0, top), (0.30, 0.05), "+z", "yellow")
    model.plate((0.0, 0.08, top), (0.05, 0.16), "+z", "yellow")
    model.cylinder((0.42, 0.42, height), (0.42, 0.42, height + 0.04), 0.022, "steel_dark", segments=8)
    model.cylinder((0.42, 0.42, height + 0.04), (0.42, 0.42, height + 0.055), 0.018, parts.WARNING, segments=8)
    # Landing lights along the edges of the pad.
    parts.edge_lamps(model, 0.5, height, count=3, size=(0.035, 0.016), margin=0.1, face=False)
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build, footprint=1.0)
