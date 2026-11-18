"""Pump (1x1x1): a steel lattice tower over a riser pipe on a concrete slab, with an outlet
pipe, a valve, a control box and a short fence. The pump rod in the tower moves (part "rod").

Modelled after the V1 sprite src/assets/modules/pump/pump_0.webp. The tower is squatter than
in the sprite: in 3D a 1x1x1 module has to stay inside its cell in height as well.

  blender --background --factory-startup --python scripts/3d/models/pump.py -- --output <file.glb>
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

NAME = "te_pump"

# Centre of the tower on the slab; the valve and the fence take the right-hand side.
TOWER = (-0.06, 0.06)
FRAME_TOP = 0.30
MAST_TOP = 0.83
VALVE = (0.27, -0.14)
# The riser pipe ends here; the pump rod above it strokes up and down.
ROD_BOTTOM = 0.46
ROD_TOP = 0.74


def build():
    model = kit.Builder(NAME)
    top = parts.slab(model)
    parts.steps(model, -0.22)

    parts.braced_frame(model, TOWER, 0.17, top, FRAME_TOP)
    model.box((TOWER[0], TOWER[1], FRAME_TOP + 0.0125), (0.40, 0.40, 0.025), "steel_dark")
    parts.lattice_mast(model, TOWER, FRAME_TOP + 0.025, MAST_TOP, 0.12, 0.085)
    _head(model)
    _piping(model, top)

    parts.control_box(model, (-0.27, -0.27))
    parts.stripes(model, (-0.08, -0.35), 10)
    parts.fence(model, (0.35, -0.34), (0.35, 0.0))
    return model.finish()


def _head(model) -> None:
    """Platform, motor and antenna on top of the mast."""
    x, y = TOWER
    model.box((x, y, MAST_TOP + 0.015), (0.24, 0.24, 0.03), "steel_dark")
    model.cylinder((x, y, MAST_TOP + 0.03), (x, y, MAST_TOP + 0.09), 0.05, "rust")
    model.box((x, y, MAST_TOP + 0.10), (0.05, 0.05, 0.02), "steel_dark")
    model.beam((x + 0.09, y + 0.09, MAST_TOP + 0.03), (x + 0.09, y + 0.09, 0.97), 0.008,
               "steel_light")


def _piping(model, top: float) -> None:
    """Riser pipe inside the tower, outlet pipe along the slab to the valve."""
    x, y = TOWER
    model.cylinder((x, y, top), (x, y, top + 0.03), 0.055, "steel_dark")
    model.cylinder((x, y, top + 0.03), (x, y, ROD_BOTTOM), 0.03, "steel_light", segments=8)
    model.cylinder((x, y, ROD_BOTTOM - 0.01), (x, y, ROD_BOTTOM), 0.036, "steel_dark", segments=8)
    # The polished rod with its crosshead goes up and down (moving part "rod").
    with model.moving("rod", (x, y, ROD_BOTTOM)):
        model.cylinder((x, y, ROD_BOTTOM - 0.05), (x, y, ROD_TOP), 0.014, "steel_light", segments=6)
        model.box((x, y, ROD_TOP - 0.015), (0.07, 0.03, 0.03), "yellow")
    height = top + 0.055
    parts.pipe(model, [(x, y, height), (VALVE[0], y, height), (VALVE[0], VALVE[1], height)])
    parts.valve(model, VALVE)


if __name__ == "__main__":
    kit.run_from_command_line(build)
