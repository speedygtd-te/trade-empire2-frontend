"""Trade host (3x3x1): the marketplace where foreign ships dock to trade. An oval trading hall
at the back with a lit window band and a glass dome over the trading floor (a ring counter round a
column of price boards), an entrance hall at its front with a price board on its canopy. Two
conveyor lanes and a vehicle lane bring cargo through scanner gates with weighing plates; a
container yard with a gantry crane at the front right, a standing price board on the right and a
lattice mast with a turning sensor array at the back right (moving part "sensor"). Commerce, not
industry: clean paint, little wear.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

WEAR = 0.3
HALF = 1.40
WALL = "paint_grey"
TRIM = "blue_paint"
# The trading hall: centre, radius across (x), oval share along y, wall height.
HALL = (-0.20, 0.46)
HALL_RADIUS = 0.80
HALL_OVAL = 0.76
HALL_WALL = 0.34
DOME_RISE = 0.30
# The entrance hall in front of the trading hall, from FRONT_Y to the hall's wall.
ENTRANCE_X = (-0.62, 0.22)
FRONT_Y = -0.34
ENTRANCE_HEIGHT = 0.28
# Lanes along y from the front edge to the entrance; gates across them at GATE_Y.
BELTS = (-0.42, 0.02)
VEHICLE_LANE = -1.00
GATE_Y = -0.86
MAST = (1.06, 0.98)


def build():
    model = kit.Builder("te_trade_host", wear=WEAR)
    top = parts.slab(model, size=HALF * 2.0)
    _hall(model, top)
    _entrance(model, top)
    _lanes(model, top)
    _yard(model, top)
    _side_board(model, top)
    _mast(model, top)
    # Supply at the back left: a transformer cabinet with vents and a cable duct to the hall.
    model.box((-1.18, 1.16, top + 0.09), (0.30, 0.20, 0.18), "navy")
    model.box((-1.18, 1.16, top + 0.185), (0.32, 0.22, 0.01), TRIM)
    parts.vent(model, (-1.18, 1.06, top + 0.09), (0.20, 0.10), "-y", slats=3)
    parts.vent(model, (-1.03, 1.16, top + 0.09), (0.12, 0.10), "+x", slats=3)
    parts.pipe(model, [(-1.03, 1.10, top + 0.03), (-0.90, 1.00, top + 0.03)], radius=0.016, color="dark")
    parts.control_box(model, (-1.24, 0.70), top)
    parts.lamp_post(model, (-HALF + 0.07, -HALF + 0.07), top, height=0.36)
    parts.lamp_post(model, (0.36, -HALF + 0.07), top, height=0.36)
    parts.lamp_post(model, (HALF - 0.07, 0.72), top, height=0.36, facing="+x")
    return model.finish()


def _hall(model, top: float) -> None:
    """The oval trading hall: a wall with a lit window band, the glass dome, and inside a ring
    counter round a column carrying four price boards."""
    x, y = HALL
    wall = HALL_RADIUS
    model.revolve((x, y, top), [(wall, 0.0), (wall, 0.13, "window"), (wall, 0.22), (wall, 0.29, TRIM),
                                (wall, 0.32, "navy"), (wall, HALL_WALL), (wall - 0.05, HALL_WALL),
                                (wall - 0.05, 0.0)], WALL, segments=24, scale=(1.0, HALL_OVAL), sharp=30.0)
    roof = top + HALL_WALL
    parts.glass_dome(model, (x, y, roof), wall - 0.03, DOME_RISE, ribs=8, oval=HALL_OVAL, segments=24)
    # The trading floor: a darker oval, a ring counter, stalls along the wall.
    model.revolve((x, y, top), [(wall - 0.05, 0.004), (0.0, 0.004)], "floor", segments=24,
                  scale=(1.0, HALL_OVAL))
    model.revolve((x, y, top), [(0.36, 0.0, "navy"), (0.36, 0.075, "glow_cyan"), (0.36, 0.09), (0.28, 0.09),
                                (0.28, 0.0)], WALL, segments=20, sharp=30.0)
    for index in range(8):
        turn = 2.0 * math.pi * (index + 0.5) / 8
        sx, sy = x + math.cos(turn) * 0.58, y + math.sin(turn) * 0.58 * HALL_OVAL
        model.box((sx, sy, top + 0.04), (0.12, 0.08, 0.08), TRIM if index % 2 else "white", turn=turn + math.pi / 2)
        model.box((sx, sy, top + 0.085), (0.13, 0.09, 0.01), "steel_light", turn=turn + math.pi / 2)
    model.cylinder((x, y, top), (x, y, top + 0.56), 0.03, "steel_light", segments=8)
    model.box((x, y, top + 0.46), (0.12, 0.12, 0.20), "steel_dark")
    for index, facing in enumerate(("-y", "+x", "+y", "-x")):
        out = {"-y": (0.0, -1.0), "+x": (1.0, 0.0), "+y": (0.0, 1.0), "-x": (-1.0, 0.0)}[facing]
        parts.price_board(model, (x + out[0] * 0.07, y + out[1] * 0.07, top + 0.46), (0.18, 0.13), facing,
                          seed=index, rows=3, depth=0.01)


def _entrance(model, top: float) -> None:
    """The entrance hall: pillars, a low wall with two cargo hatches where the belts end, a glass
    front above it, a canopy with a cyan edge and the big price board on it."""
    left, right = ENTRANCE_X
    middle = (left + right) / 2.0
    width = right - left
    back = HALL[1] - HALL_RADIUS * HALL_OVAL + 0.12
    depth = back - FRONT_Y
    centre_y = (FRONT_Y + back) / 2.0
    height = ENTRANCE_HEIGHT
    # Side walls, the low front wall and the glass above it.
    for side_x in (left + 0.03, right - 0.03):
        model.box((side_x, centre_y, top + height / 2.0), (0.06, depth, height), WALL)
    model.box((middle, FRONT_Y + 0.03, top + 0.055), (width - 0.06, 0.05, 0.11), WALL)
    model.plate((middle, FRONT_Y + 0.005 - 0.0006, top + 0.10), (width - 0.06, 0.012), "-y", TRIM)
    for belt in BELTS:
        model.plate((belt, FRONT_Y + 0.005 - 0.0012, top + 0.06), (0.14, 0.08), "-y", "dark")
    model.box((middle, FRONT_Y + 0.03, top + 0.11 + (height - 0.11) / 2.0), (width - 0.06, 0.008, height - 0.11),
              kit.PANE)
    for mullion in (left + width / 3.0, left + width * 2.0 / 3.0):
        model.box((mullion, FRONT_Y + 0.03, top + 0.11 + (height - 0.11) / 2.0), (0.014, 0.016, height - 0.11),
                  "navy")
    # Floor inside, lit by the glass front.
    model.box((middle, centre_y, top + 0.004), (width - 0.10, depth - 0.06, 0.008), "floor")
    # The canopy reaches a little over the front, with a cyan strip and the price board on it.
    canopy = top + height
    model.box((middle, centre_y - 0.04, canopy + 0.02), (width + 0.04, depth + 0.10, 0.04), "navy")
    model.box((middle, FRONT_Y - 0.09, canopy + 0.0), (width + 0.04, 0.01, 0.012), "glow_cyan")
    for corner_x in (left - 0.005, right + 0.005):
        model.beam((corner_x, FRONT_Y - 0.08, top), (corner_x, FRONT_Y - 0.08, canopy), 0.03, "white")
    parts.price_board(model, (middle, FRONT_Y + 0.02, canopy + 0.04 + 0.10), (width - 0.12, 0.20), "-y", seed=7)
    for post_x in (middle - width * 0.3, middle + width * 0.3):
        model.beam((post_x, FRONT_Y + 0.05, canopy + 0.04), (post_x, FRONT_Y + 0.05, canopy + 0.08), 0.02, "steel_dark")


def _lanes(model, top: float) -> None:
    """Two conveyors with crates and a vehicle lane with a cart, each through a scanner gate
    with a weighing plate, and lane markings on the plaza."""
    for index, belt in enumerate(BELTS):
        parts.conveyor(model, (belt, -HALF + 0.08), (belt, FRONT_Y - 0.02), top + 0.08, width=0.12, legs=4,
                       ground=top)
        parts.scanner_gate(model, (belt, GATE_Y), 0.24, 0.20, z=top + 0.0, weigh=False)
        colors = ("orange_paint", "blue_paint", "green") if index == 0 else ("white", "red", "orange_paint")
        for step, crate_y in enumerate((-1.18, -0.62, -0.45)):
            parts.crate(model, (belt, crate_y), top + 0.08, (0.08, 0.07, 0.06), colors[step])
    # The vehicle lane: a wide gate with a weighing plate and a cargo cart on it.
    lane = VEHICLE_LANE
    parts.scanner_gate(model, (lane, GATE_Y), 0.36, 0.26, z=top, weigh=True)
    for edge in (lane - 0.22, lane + 0.22):
        parts.stripes(model, (edge - 0.01, -HALF + 0.06), 18, along="y", z=top, width=0.02, length=0.05)
    _cart(model, (lane, GATE_Y - 0.01), top + 0.01)
    model.box((lane, FRONT_Y - 0.02, top + 0.10), (0.30, 0.05, 0.20), WALL)
    model.plate((lane, FRONT_Y - 0.045 - 0.0006, top + 0.09), (0.22, 0.16), "-y", "dark")
    model.plate((lane, FRONT_Y - 0.045 - 0.0012, top + 0.19), (0.22, 0.014), "-y", "glow_yellow")
    # A walkway crossing in front of the gates.
    for index in range(7):
        model.plate((-0.84 + index * 0.13, -1.12, top + 0.0006), (0.07, 0.10), "+z", "white")


def _cart(model, position, z: float) -> None:
    """A small electric cargo cart looking to the front (-y): a cab and a bed with two crates."""
    x, y = position
    model.box((x, y, z + 0.05), (0.16, 0.28, 0.04), "steel_dark")
    model.box((x, y - 0.09, z + 0.11), (0.15, 0.09, 0.09), "orange_paint")
    parts.window(model, (x, y - 0.135, z + 0.12), (0.12, 0.05), "-y", frame="orange_paint")
    model.plate((x, y - 0.1356, z + 0.075), (0.12, 0.012), "-y", "glow_lamp")
    for wheel_y in (y - 0.09, y + 0.09):
        model.cylinder((x - 0.09, wheel_y, z + 0.03), (x + 0.09, wheel_y, z + 0.03), 0.03, "dark", segments=8)
    parts.crate(model, (x, y + 0.03), z + 0.07, (0.11, 0.08, 0.07), "blue_paint")
    parts.crate(model, (x, y + 0.10), z + 0.07, (0.11, 0.05, 0.05), "white")


def _yard(model, top: float) -> None:
    """The container yard at the front right: two stacks of containers and a gantry crane over
    them with one container on its hook."""
    containers = [
        ((0.66, -1.22), 0, "blue_paint"), ((0.66, -1.22), 1, "orange_paint"), ((0.66, -1.04), 0, "red"),
        ((1.10, -1.22), 0, "white"), ((1.10, -1.04), 0, "green"), ((1.10, -1.04), 1, "blue_paint"),
        ((0.66, -0.58), 0, "orange_paint"), ((1.10, -0.58), 0, "blue_paint"), ((1.10, -0.58), 1, "white"),
    ]
    for (cx, cy), level, color in containers:
        _container(model, (cx, cy), top + level * 0.12, color)
    # The gantry: two frames across the yard, a girder on top, a trolley with a hoist.
    girder = top + 0.44
    for leg_y in (-1.32, -0.46):
        for leg_x in (0.44, 1.32):
            model.beam((leg_x, leg_y, top), (leg_x, leg_y, girder), 0.035, "yellow")
        model.beam((0.44, leg_y, girder - 0.26), (1.32, leg_y, girder - 0.26), 0.02, "yellow")
    for leg_x in (0.44, 1.32):
        model.box((leg_x, -0.89, girder + 0.02), (0.06, 0.92, 0.05), "yellow")
        model.box((leg_x, -0.89, top + 0.015), (0.07, 0.92, 0.03), "steel_dark")
    trolley_y = -0.82
    model.box((0.88, trolley_y, girder + 0.02), (0.96, 0.08, 0.05), "yellow")
    model.box((0.88, trolley_y, girder + 0.06), (0.14, 0.12, 0.06), "steel_dark")
    model.plate((0.88, trolley_y - 0.0606, girder + 0.06), (0.10, 0.02), "-y", "glow_yellow")
    hook = top + 0.25
    for side in (-0.05, 0.05):
        model.beam((0.88 + side, trolley_y, girder - 0.005), (0.88 + side, trolley_y, hook + 0.11), 0.006, "dark")
    model.box((0.88, trolley_y, hook + 0.115), (0.24, 0.06, 0.012), "steel_dark")
    _container(model, (0.88, trolley_y), hook, "red")


def _container(model, position, z: float, color: str) -> None:
    """A shipping container along x with ribbed sides and doors at its +x end."""
    x, y = position
    length, width, height = 0.34, 0.15, 0.11
    model.box((x, y, z + height / 2.0), (length, width, height), color)
    for index in range(5):
        rib_x = x - length / 2.0 + length * (index + 0.5) / 5
        for face, side in (("-y", -1), ("+y", 1)):
            model.plate((rib_x, y + side * (width / 2.0 + 0.0006), z + height / 2.0), (0.012, height - 0.02), face,
                        "steel_dark")
    model.plate((x + length / 2.0 + 0.0006, y, z + height / 2.0), (width - 0.02, height - 0.02), "+x", "steel_dark")
    model.plate((x + length / 2.0 + 0.0012, y, z + height / 2.0), (0.008, height - 0.02), "+x", color)


def _side_board(model, top: float) -> None:
    """A standing price board on the right, looking out to the right (+x) on two legs."""
    x, y = 1.30, 0.30
    bottom = top + 0.26
    for leg_y in (y - 0.22, y + 0.22):
        model.beam((x - 0.03, leg_y, top), (x - 0.03, leg_y, bottom), 0.03, "steel_dark")
        model.box((x - 0.03, leg_y, top + 0.01), (0.08, 0.08, 0.02), "concrete_dark")
    parts.price_board(model, (x, y, bottom + 0.14), (0.62, 0.28), "+x", seed=3, rows=5, depth=0.04)
    model.box((x - 0.04, y, bottom + 0.29), (0.06, 0.62, 0.02), TRIM)


def _mast(model, top: float) -> None:
    """The lattice mast at the back right and its sensor array that turns slowly (role sensor)."""
    x, y = MAST
    head = top + 0.68
    model.box((x, y, top + 0.02), (0.26, 0.26, 0.04), "concrete")
    parts.lattice_mast(model, (x, y), top + 0.04, head, 0.10, 0.04, bays=3, color="white", brace="steel_light")
    model.box((x, y, head + 0.01), (0.12, 0.12, 0.02), "steel_dark")
    with model.moving("sensor", (x, y, head + 0.02)):
        model.cylinder((x, y, head + 0.02), (x, y, head + 0.06), 0.045, "steel", segments=10)
        model.box((x, y, head + 0.11), (0.36, 0.05, 0.09), "white")
        model.plate((x, y - 0.0256, head + 0.11), (0.32, 0.06), "-y", "dark")
        for index in range(4):
            model.plate((x - 0.12 + index * 0.08, y - 0.0262, head + 0.11), (0.05, 0.04), "-y", "glow_cyan")
        model.box((x, y + 0.05, head + 0.10), (0.10, 0.06, 0.06), "steel_dark")
        parts.tip_light(model, (x, y), head + 0.155, radius=0.014)


if __name__ == "__main__":
    kit.run_from_command_line(build, cells=(3, 3))
