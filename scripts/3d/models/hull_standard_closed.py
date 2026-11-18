"""Standard hull seen from outside (closed structure): a dark blue painted container. Fills its
cell; neighbours join into one block. Also stands in for every indoor hull without a closed
model of its own. Open, it shows the floor of hull_starter.py (no own model yet).
  blender --background --factory-startup --python scripts/3d/models/hull_standard_closed.py -- --output <file.glb>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import hulls  # noqa: E402
import kit  # noqa: E402


def build():
    return hulls.closed_hull("te_hull_standard_closed", wall="blue", roof="blue_dark", rib="steel_dark",
                             trim="yellow", roof_detail="steel")


if __name__ == "__main__":
    kit.run_from_command_line(build, footprint=1.0)
