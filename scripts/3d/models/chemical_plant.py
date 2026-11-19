"""Chemical plant (1x1x1): a plant in the open, without walls. A distillation column inside a
lattice frame, a white pressure sphere, two tanks with green bands, a lying reactor vessel, a
banded chimney, pipes between them on a rack; a lamp post and floodlights for the night.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

ACCENT = "plant"
COLUMN = (-0.22, 0.20)
SPHERE = (-0.21, -0.17)
CHIMNEY = (0.33, -0.04)


def build():
    model = kit.Builder("te_chemical_plant")
    top = parts.slab(model)
    parts.steps(model, 0.02)
    # The column in its lattice frame, with two platforms.
    x, y = COLUMN
    parts.tank(model, COLUMN, top, 0.065, 0.60, color="steel_light", band=ACCENT, segments=10)
    parts.lattice_mast(model, COLUMN, top, top + 0.56, 0.11, 0.095, bays=3, leg=0.02)
    for height in (0.22, 0.42):
        model.box((x, y, top + height), (0.22, 0.22, 0.012), "steel_dark")
    model.beam((x + 0.11, y - 0.11, top + 0.42), (x + 0.15, y - 0.15, top + 0.42), 0.012, "steel_dark")
    parts.floodlight(model, (x + 0.16, y - 0.16, top + 0.42), "-y", size=(0.05, 0.03))
    # Pressure sphere at the front left.
    parts.sphere_tank(model, SPHERE, top, 0.11)
    # Two tanks at the back right.
    parts.tank(model, (0.06, 0.25), top, 0.08, 0.24, band=ACCENT, ladder=True)
    parts.tank(model, (0.26, 0.22), top, 0.10, 0.32, color="steel", band=ACCENT, roof="steel_light")
    # A lying reactor vessel at the front right.
    parts.pressure_vessel(model, (0.10, -0.25, top + 0.10), 0.22, 0.06)
    # The chimney on the right.
    parts.chimney(model, CHIMNEY, top, 0.78, radius=0.04)
    # Pipes: a rack across the middle, risers to the column, the sphere and the tanks.
    rack = top + 0.20
    parts.pipe_rack(model, (-0.10, 0.02), (0.24, 0.02), rack, pipes=("steel", ACCENT), ground=top)
    parts.pipe(model, [(x + 0.06, y - 0.02, top + 0.12), (-0.10, y - 0.02, top + 0.12), (-0.10, 0.02, top + 0.12),
                       (-0.10, 0.02, rack + 0.018)], radius=0.014, color="steel")
    parts.pipe(model, [(0.24, 0.0, rack + 0.018), (0.24, 0.12, rack + 0.018), (0.24, 0.12, top + 0.14)],
                   radius=0.011, color=ACCENT)
    parts.pipe(model, [(SPHERE[0] + 0.10, SPHERE[1], top + 0.14), (0.0, SPHERE[1], top + 0.14),
                       (0.0, -0.25, top + 0.10)], radius=0.014, color="steel_light")
    parts.pipe(model, [(CHIMNEY[0], CHIMNEY[1] + 0.03, top + 0.10), (CHIMNEY[0], 0.12, top + 0.10)], radius=0.012)
    parts.valve(model, (0.30, -0.27))
    parts.control_box(model, (-0.03, -0.34))
    parts.lamp_post(model, (-0.37, -0.37), top, height=0.30, facing="-y")
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build)
