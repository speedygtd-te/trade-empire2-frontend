"""Fusion reactor (1x1x1): a glowing plasma torus held by dark magnet coils around a central
column, on four supports over a round pedestal. Four laser emitters on posts at the corners aim
thin glowing beams at the torus.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

PLASMA = "glow_purple"
LASER = "glow_cyan"
RING = 0.22
TUBE = 0.065
CENTER_Z = 0.30
POST = 0.33
POST_TOP = 0.56


def build():
    model = kit.Builder("te_fusion_reactor")
    base = 0.05
    model.box((0.0, 0.0, base / 2.0), (0.84, 0.84, base), "steel_dark")
    parts.stripes(model, (-0.40, -0.385), 4, z=base)
    model.cylinder((0.0, 0.0, base), (0.0, 0.0, base + 0.06), 0.34, "steel", segments=20)
    model.cylinder((0.0, 0.0, base + 0.03), (0.0, 0.0, base + 0.05), 0.345, "yellow", segments=20)
    model.cylinder((0.0, 0.0, base + 0.06), (0.0, 0.0, base + 0.075), 0.35, "steel_dark", segments=20)
    model.cylinder((0.0, 0.0, base + 0.075), (0.0, 0.0, base + 0.08), 0.30, "steel", segments=20)
    floor = base + 0.075
    # The plasma torus with its magnet coils.
    parts.torus(model, (0.0, 0.0, CENTER_Z), RING, TUBE, PLASMA, segments=24, sides=8)
    for index in range(8):
        angle = 2.0 * math.pi * (index + 0.5) / 8.0
        point = (math.cos(angle) * RING, math.sin(angle) * RING, CENTER_Z)
        tangent = (-math.sin(angle) * 0.02, math.cos(angle) * 0.02, 0.0)
        model.cylinder(tuple(point[axis] - tangent[axis] for axis in range(3)),
                       tuple(point[axis] + tangent[axis] for axis in range(3)), TUBE + 0.016, "steel_dark",
                       segments=8)
        support = (math.cos(angle) * RING, math.sin(angle) * RING)
        if index % 2 == 0:
            model.beam((*support, floor), (*support, CENTER_Z - TUBE - 0.01), 0.04, "steel_dark")
    # The central column with glowing bands.
    model.cylinder((0.0, 0.0, floor), (0.0, 0.0, CENTER_Z + 0.16), 0.075, "steel", segments=12)
    for height in (CENTER_Z - 0.06, CENTER_Z + 0.02, CENTER_Z + 0.10):
        model.cylinder((0.0, 0.0, height), (0.0, 0.0, height + 0.018), 0.078, PLASMA, segments=12)
    model.cylinder((0.0, 0.0, CENTER_Z + 0.16), (0.0, 0.0, CENTER_Z + 0.19), 0.10, "steel_dark", segments=12)
    # Laser emitters on posts at the corners, their beams on the torus.
    for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        foot = (sx * POST, sy * POST)
        model.box((*foot, base + 0.02), (0.08, 0.08, 0.04), "steel_dark")
        model.beam((*foot, base), (*foot, POST_TOP), 0.035, "steel")
        angle = math.atan2(sy, sx)
        target = (math.cos(angle) * RING, math.sin(angle) * RING, CENTER_Z + TUBE * 0.7)
        head = (foot[0], foot[1], POST_TOP)
        direction = [target[axis] - head[axis] for axis in range(3)]
        length = math.sqrt(sum(value * value for value in direction))
        unit = [value / length for value in direction]
        nose = tuple(head[axis] + unit[axis] * 0.09 for axis in range(3))
        model.cylinder(tuple(head[axis] - unit[axis] * 0.03 for axis in range(3)), nose, 0.03, "white", segments=8,
                       end_radius=0.02)
        tip = tuple(nose[axis] + unit[axis] * 0.012 for axis in range(3))
        model.cylinder(nose, tip, 0.016, LASER, segments=8)
        model.beam(tip, target, 0.008, LASER)
        parts.tip_light(model, foot, POST_TOP + 0.03, color=parts.STATUS, radius=0.012)
    # A console at the front.
    model.box((0.10, -0.375, base + 0.05), (0.16, 0.05, 0.10), "steel_light")
    model.plate((0.10, -0.40 - 0.0006, base + 0.065), (0.12, 0.05), "-y", LASER)
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build)
