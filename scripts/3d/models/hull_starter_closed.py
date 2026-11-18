"""Starter hull seen from outside (closed structure): a rusty steel container, as the V1 sprite. Fills its cell; neighbours join into
one block. The open hull (the floor the modules stand on) is hull_starter.py.
  blender --background --factory-startup --python scripts/3d/models/hull_starter_closed.py -- --output <file.glb>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import hulls  # noqa: E402
import kit  # noqa: E402


def build():
    return hulls.closed_hull("te_hull_starter_closed", wall="rust_brown", roof="rust_brown_dark", rib="rust",
                             trim="yellow", roof_detail="steel_dark")


if __name__ == "__main__":
    kit.run_from_command_line(build, footprint=1.0)
