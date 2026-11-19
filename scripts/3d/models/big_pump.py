"""Big pump (2x2x1): a pump station in the open, without walls. Two lattice derricks over their
wells, whose pump rods stroke (moving parts "rod_1", "rod_2"), two storage tanks, a skid with
two pump motors, pipes between them on a rack, valves and a control box. Floodlights on the
derricks, red lights on their tips, lamp posts at the front corners.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

ACCENT = "red"
HALF = 0.86
# Derricks: centre, height of the frame's top, height of the mast's top.
DERRICKS = (((-0.42, 0.40), 0.30, 0.86), ((0.22, 0.52), 0.26, 0.74))
TANK = (-0.46, -0.40)
SKID = (0.42, -0.16)


def build():
    model = kit.Builder("te_big_pump", wear=1.0)
    top = parts.slab(model, size=HALF * 2.0)
    parts.steps(model, -0.20, edge=-HALF)
    parts.steps(model, 0.40, edge=-HALF)
    parts.stripes(model, (-0.10, -0.80), 14)
    for number, (center, frame_top, mast_top) in enumerate(DERRICKS, start=1):
        _derrick(model, top, center, frame_top, mast_top, "rod_%d" % number)
    # Storage tanks.
    parts.tank(model, TANK, top, 0.25, 0.30, color="steel_light", band=ACCENT, ladder=True, segments=16)
    parts.tank(model, (0.62, 0.40), top, 0.17, 0.24, color="steel", band=ACCENT, roof="steel_light")
    _skid(model, top)
    # Pipes: from the wells to a rack, along it to the motors and on to the tanks.
    low = top + 0.05
    rack = top + 0.22
    parts.pipe_rack(model, (-0.20, 0.08), (0.50, 0.08), rack, pipes=("steel", "rust", "steel_dark"), posts=3,
                    ground=top)
    (left, _, _), (right, _, _) = DERRICKS
    parts.pipe(model, [(left[0] + 0.05, left[1], low), (-0.20, left[1], low), (-0.20, 0.08, low),
                       (-0.20, 0.08, rack + 0.018)], radius=0.022)
    parts.pipe(model, [(right[0], right[1] - 0.05, low), (right[0], 0.20, low), (0.22, 0.115, low),
                       (0.22, 0.115, rack + 0.018)], radius=0.02, color="rust")
    parts.pipe(model, [(0.50, 0.045, rack + 0.018), (SKID[0], 0.045, rack + 0.018), (SKID[0], 0.045, low),
                       (SKID[0], SKID[1] + 0.10, low)], radius=0.02, color="steel_dark")
    parts.pipe(model, [(SKID[0] - 0.16, SKID[1], low), (-0.12, SKID[1], low), (-0.12, TANK[1], low),
                       (TANK[0] + 0.24, TANK[1], low)], radius=0.024, color="steel")
    parts.pipe(model, [(0.50, 0.08, rack + 0.018), (0.62, 0.08, rack + 0.018), (0.62, 0.08, top + 0.20),
                       (0.62, 0.22, top + 0.20)], radius=0.018, color="rust")
    for position in ((-0.12, -0.24), (0.10, -0.16)):
        parts.valve(model, position)
    parts.control_box(model, (-0.12, 0.62))
    parts.control_box(model, (0.70, -0.62))
    parts.fence(model, (HALF - 0.04, -HALF + 0.04), (HALF - 0.04, -0.30), posts=4)
    parts.lamp_post(model, (HALF - 0.08, -HALF + 0.08), top, height=0.34)
    parts.lamp_post(model, (-HALF + 0.08, -HALF + 0.30), top, height=0.34)
    return model.finish()


def _derrick(model, top: float, center, frame_top: float, mast_top: float, rod: str) -> None:
    """A lattice derrick over a well like the pump's (pump.py), with a stroking pump rod, a
    platform with a motor at its top, a red light and two floodlights."""
    x, y = center
    parts.braced_frame(model, center, 0.17, top, frame_top)
    model.box((x, y, frame_top + 0.0125), (0.40, 0.40, 0.025), "steel_dark")
    parts.lattice_mast(model, center, frame_top + 0.025, mast_top, 0.12, 0.08)
    model.box((x, y, mast_top + 0.015), (0.22, 0.22, 0.03), "steel_dark")
    model.cylinder((x, y, mast_top + 0.03), (x, y, mast_top + 0.085), 0.05, "rust")
    parts.tip_light(model, (x + 0.08, y + 0.08), mast_top + 0.03, radius=0.016)
    for corner in ((x + 0.09, y - 0.09), (x - 0.09, y - 0.09)):
        parts.lamp(model, (*corner, mast_top + 0.039), (0.022, 0.022, 0.018), parts.STATUS)
    # The well: a wellhead and a riser, the rod above it strokes.
    model.cylinder((x, y, top), (x, y, top + 0.04), 0.07, "steel_dark")
    rod_bottom = frame_top + 0.14
    rod_top = mast_top - 0.10
    model.cylinder((x, y, top + 0.04), (x, y, rod_bottom), 0.035, "steel_light", segments=8)
    model.cylinder((x, y, rod_bottom - 0.012), (x, y, rod_bottom), 0.042, "steel_dark", segments=8)
    with model.moving(rod, (x, y, rod_bottom)):
        model.cylinder((x, y, rod_bottom - 0.05), (x, y, rod_top), 0.016, "steel_light", segments=6)
        model.box((x, y, rod_top - 0.015), (0.08, 0.035, 0.03), "yellow")
    flood = frame_top + 0.18
    model.beam((x, y - 0.09, flood), (x, y - 0.13, flood), 0.012, "steel_dark")
    parts.floodlight(model, (x, y - 0.14, flood), "-y")
    model.beam((x + 0.09, y, flood + 0.06), (x + 0.13, y, flood + 0.06), 0.012, "steel_dark")
    parts.floodlight(model, (x + 0.14, y, flood + 0.06), "+x")


def _skid(model, top: float) -> None:
    """A steel skid with two big pump motors and their red pump casings."""
    x, y = SKID
    model.box((x, y, top + 0.02), (0.36, 0.30, 0.04), "steel_dark")
    parts.stripes(model, (x - 0.18, y - 0.155), 9, z=top + 0.04, width=0.015)
    for offset in (-0.07, 0.07):
        z = top + 0.04 + 0.075
        parts.drum(model, (x - 0.14, y + offset, z), (x + 0.02, y + offset, z), 0.065, color="blue")
        model.cylinder((x + 0.02, y + offset, z), (x + 0.10, y + offset, z), 0.07, ACCENT, segments=10)
        model.box((x - 0.06, y + offset, top + 0.05), (0.18, 0.08, 0.02), "steel")
    parts.lamp(model, (x + 0.16, y + 0.13, top + 0.05), (0.022, 0.022, 0.018), "glow_green")


if __name__ == "__main__":
    kit.run_from_command_line(build, cells=(2, 2))
