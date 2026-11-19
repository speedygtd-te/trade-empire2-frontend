"""Probe launcher (1x1x1): an outdoor launch pad for exploration probes. An octagonal concrete
pad with amber marker lamps carries a turntable with a tilted launch rail and a small probe on
it; turntable, rail and probe slowly swing to aim (moving part "scope"). Behind the pad a
service mast with a small tracking radar on top (moving part "sensor"), red lights and a
floodlight; gas bottles for the probes' propellant on the left, a crate of spare probes on the
right, a switch cabinet and a lamp post at the front.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

ACCENT = "glow_cyan"
# Space hardware outside: dirtier than a hull, cleaner than a refinery (deep_space_sensor.py).
WEAR = 0.7
PAD_RADIUS = 0.27
PAD_HEIGHT = 0.045
# The rail leans back and to the right at rest (towards +x and +y): from the game camera, which
# looks from the front right, it is seen from the side.
REST_TURN = math.radians(-45.0)
TILT = math.radians(32.0)
# The rail's hinge on the turntable (turntable coordinates) and the rail's length.
HINGE = (-0.08, 0.12)
RAIL = 0.62
PROBE_START = 0.26
PROBE_LENGTH = 0.42
PROBE_RADIUS = 0.03
MAST = (-0.30, 0.30)
MAST_TOP = 0.76


def build():
    model = kit.Builder("te_probe_launcher", wear=WEAR)
    top = parts.slab(model, size=0.84)
    pad = _pad(model, top)
    _launcher(model, pad)
    _mast(model, top)
    _bottles(model, top)
    # Spare probes in a long transport crate and a small one at the back right.
    parts.crate(model, (0.33, 0.27), top, (0.08, 0.20, 0.07), "yellow")
    parts.crate(model, (0.22, 0.35), top, (0.07, 0.06, 0.05), "rust_brown", turn=0.3)
    parts.stripes(model, (-0.10, -0.385), 6)
    parts.control_box(model, (0.30, -0.31))
    parts.lamp_post(model, (-0.36, -0.36), top, height=0.26)
    return model.finish()


def _pad(model, top: float) -> float:
    """The launch pad: an octagonal concrete block with a yellow band round its foot and four
    amber marker lamps on its top. Returns the height of its top."""
    model.revolve((0.0, 0.0, top), [(PAD_RADIUS, 0.0), (PAD_RADIUS, PAD_HEIGHT - 0.012),
                                    (PAD_RADIUS - 0.015, PAD_HEIGHT), (0.0, PAD_HEIGHT)],
                  "concrete", segments=8, sharp=30.0)
    model.cylinder((0.0, 0.0, top + 0.008), (0.0, 0.0, top + 0.02), PAD_RADIUS + 0.004, "yellow", segments=8)
    pad = top + PAD_HEIGHT
    for index in range(4):
        angle = math.radians(22.5 + 90.0 * index)
        x, y = math.cos(angle) * 0.215, math.sin(angle) * 0.215
        model.plate((x, y, pad + 0.0006), (0.05, 0.05), "+z", "dark")
        parts.lamp(model, (x, y, pad + 0.009), (0.026, 0.026, 0.018), parts.STATUS)
    return pad


def _rail_point(along: float, below: float) -> tuple:
    """A point of the rail in turntable coordinates: *along* the rail from its hinge, *below*
    it (towards the ground side of the rail)."""
    return (0.0, HINGE[0] + along * math.sin(TILT) + below * math.cos(TILT),
            HINGE[1] + along * math.cos(TILT) - below * math.sin(TILT))


def _launcher(model, pad: float) -> None:
    """Turntable, yoke, drive box, hydraulic strut, the rail and the probe on it."""
    with model.moving("scope", (0.0, 0.0, pad)), model.placed((0.0, 0.0, pad), turn=REST_TURN):
        model.cylinder((0.0, 0.0, 0.0), (0.0, 0.0, 0.03), 0.16, "steel_dark", segments=14)
        model.cylinder((0.0, 0.0, 0.03), (0.0, 0.0, 0.04), 0.14, "yellow", segments=14)
        # The yoke holding the rail's hinge, the drive box under the rail.
        hinge_y, hinge_z = HINGE
        for side in (-1, 1):
            model.box((side * 0.05, hinge_y, (0.04 + hinge_z + 0.02) / 2.0), (0.022, 0.07, hinge_z - 0.02), "steel")
        model.cylinder((-0.07, hinge_y, hinge_z), (0.07, hinge_y, hinge_z), 0.022, "steel_dark", segments=8)
        model.box((0.0, 0.07, 0.075), (0.13, 0.11, 0.07), "steel")
        parts.vent(model, (0.065, 0.07, 0.075), (0.08, 0.04), "+x", slats=3)
        model.plate((0.0, 0.07 - 0.0556, 0.095), (0.11, 0.014), "-y", "yellow")
        # Hydraulic strut from the drive box up to the rail's underside.
        foot = (0.0, 0.05, 0.11)
        head = _rail_point(0.22, 0.02)
        middle = tuple((foot[axis] + head[axis]) / 2.0 for axis in range(3))
        model.cylinder(foot, middle, 0.018, "steel_dark", segments=8)
        model.cylinder(middle, head, 0.010, "steel_light", segments=6)
        # A cable from the drive box to the probe.
        parts.pipe(model, [(-0.04, 0.10, 0.11), (-0.04, 0.10, 0.16), _offset(_rail_point(0.34, -0.02), -0.04)],
                   radius=0.007, color="dark")
        with model.placed((0.0, hinge_y, hinge_z), tilt=-TILT):
            _rail(model)
            with model.placed((0.0, -0.055, PROBE_START)):
                parts.probe(model, PROBE_LENGTH, PROBE_RADIUS, accent=ACCENT)


def _offset(point, dx: float) -> tuple:
    return (point[0] + dx, point[1], point[2])


def _rail(model) -> None:
    """The launch rail along +Z of its frame, its top (where the probe rides) towards -Y: a
    girder with yellow sides, two light rails, ribs below, cradle shoes and an end stop."""
    model.box((0.0, 0.0, RAIL / 2.0), (0.05, 0.03, RAIL), "steel")
    for x in (-0.018, 0.018):
        model.beam((x, -0.019, 0.0), (x, -0.019, RAIL), 0.011, "steel_light")
    for side in ("+x", "-x"):
        sign = 1.0 if side == "+x" else -1.0
        model.plate((sign * 0.0256, 0.0, RAIL * 0.25), (0.024, RAIL * 0.30), side, "yellow")
        model.plate((sign * 0.0262, 0.0, RAIL * 0.25), (0.024, RAIL * 0.06), side, "dark")
    for index in range(4):
        z = 0.06 + index * (RAIL - 0.10) / 3.0
        model.box((0.0, 0.022, z), (0.06, 0.016, 0.02), "steel_dark")
    for z in (PROBE_START + 0.05, PROBE_START + 0.22):
        model.box((0.0, -0.034, z), (0.03, 0.025, 0.025), "steel_dark")
    model.box((0.0, 0.01, RAIL + 0.008), (0.06, 0.04, 0.016), "steel_dark")
    # A red light at the rail's tip: it is the highest point of the pad.
    parts.tip_light(model, (0.0, 0.012), RAIL + 0.016, radius=0.011)


def _mast(model, top: float) -> None:
    """The service mast behind the pad: a lattice on a footing, a tracking radar on top that
    turns (moving part "sensor"), red lights on brackets, a floodlight looking at the pad and a
    cable down to the pad."""
    x, y = MAST
    model.box((x, y, top + 0.02), (0.16, 0.16, 0.04), "concrete_dark")
    parts.lattice_mast(model, (x, y), top + 0.04, MAST_TOP, 0.06, 0.035, bays=4, leg=0.018)
    model.box((x, y, MAST_TOP + 0.012), (0.09, 0.09, 0.024), "steel_dark")
    pivot = (x, y, MAST_TOP + 0.024)
    with model.moving("sensor", pivot):
        model.cylinder(pivot, (x, y, MAST_TOP + 0.05), 0.03, "steel", segments=8)
        with model.placed((x, y, MAST_TOP + 0.09), tilt=math.radians(-15.0)):
            model.box((0.0, 0.0, 0.0), (0.18, 0.014, 0.07), "white")
            model.box((0.0, 0.012, 0.0), (0.06, 0.012, 0.07), "steel_dark")
            model.beam((0.0, 0.0, -0.035), (0.0, -0.07, -0.02), 0.01, "steel_dark")
            model.box((0.0, -0.075, -0.02), (0.03, 0.018, 0.018), ACCENT)
    bracket = MAST_TOP - 0.10
    for sign in (-1, 1):
        model.beam((x + sign * 0.03, y, bracket), (x + sign * 0.08, y, bracket), 0.01, "steel_dark")
        parts.tip_light(model, (x + sign * 0.08, y), bracket + 0.005, radius=0.011)
    flood = top + 0.36
    model.beam((x + 0.04, y - 0.04, flood), (x + 0.08, y - 0.08, flood), 0.012, "steel_dark")
    parts.floodlight(model, (x + 0.09, y - 0.09, flood), "-y", size=(0.05, 0.03))
    model.box((x, y - 0.08, top + 0.14), (0.07, 0.05, 0.09), "steel_light")
    model.plate((x, y - 0.1056, top + 0.15), (0.04, 0.04), "-y", "yellow")
    parts.pipe(model, [(x + 0.02, y - 0.10, top + 0.10), (x + 0.02, y - 0.10, top + 0.015),
                       (-0.17, 0.16, top + 0.015)], radius=0.009, color="dark")


def _bottles(model, top: float) -> None:
    """Two gas bottles for the probes' propellant (hydrogen, nitrogen) with a manifold to the pad."""
    x = -0.345
    for y, color, band in ((0.05, "white", "red"), (-0.09, "steel_light", "blue")):
        parts.tank(model, (x, y), top, 0.045, 0.20, color=color, band=band, segments=10)
    parts.pipe(model, [(x + 0.04, 0.05, top + 0.05), (x + 0.058, 0.05, top + 0.05), (x + 0.058, -0.09, top + 0.05),
                       (x + 0.04, -0.09, top + 0.05)], radius=0.009, color="steel_dark")
    parts.pipe(model, [(x + 0.058, -0.02, top + 0.05), (-0.245, -0.02, top + 0.03)], radius=0.009, color="steel_dark")
    parts.valve(model, (x + 0.02, -0.20), top)


if __name__ == "__main__":
    kit.run_from_command_line(build)
