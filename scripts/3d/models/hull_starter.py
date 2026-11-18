"""Starter hull (1x1, INDOOR slot): a dirty concrete floor plate filling the whole cell, with a
raised rim and corner posts. A module sits on top of it; neighbouring hulls join seamlessly.

The V1 sprite (src/assets/hulls/starter/starter_0.webp) is a closed rusty container; in 3D the
hull is the floor of the cell, so the module on it stays visible.

  blender --background --factory-startup --python scripts/3d/models/hull_starter.py -- --output <file.glb>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hulls  # noqa: E402
import kit  # noqa: E402


def build():
    return hulls.floor_hull("te_hull_starter", plate="floor", rim="concrete_dark",
                            accent="steel_dark", posts=True)


if __name__ == "__main__":
    kit.run_from_command_line(build, footprint=1.0)
