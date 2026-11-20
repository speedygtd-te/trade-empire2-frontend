"""Reusable parts for the models in this folder. Every function adds geometry to a kit.Builder.

Sizes are in grid cells, up is Z, the front of a module is -Y (the side the game camera looks
at, together with +X). A change here changes every model that uses the part.
"""

import math
import random

SLAB_TOP = 0.07
_OUTWARD = {"+x": (1, 0, 0), "-x": (-1, 0, 0), "+y": (0, 1, 0), "-y": (0, -1, 0), "+z": (0, 0, 1)}
_CORNERS = ((-1, -1), (1, -1), (1, 1), (-1, 1))
# Distance by which markings float in front of the surface they sit on.
_HAIR = 0.0006


def _lifted(center, facing: str, steps: int = 1):
    out = _OUTWARD[facing]
    return tuple(center[axis] + out[axis] * _HAIR * steps for axis in range(3))


def slab(model, size: float = 0.80, top: str = "concrete", base: str = "concrete_dark") -> float:
    """The ground plate most modules stand on. Returns the height of its top."""
    model.box((0.0, 0.0, 0.025), (size, size, 0.05), base)
    model.box((0.0, 0.0, 0.06), (size - 0.04, size - 0.04, 0.02), top)
    return SLAB_TOP


def steps(model, x: float, edge: float = -0.40, color: str = "concrete") -> None:
    """Two steps up to a slab at its front; the slab ends at y = *edge*."""
    model.box((x, edge - 0.0125, 0.0235), (0.12, 0.025, 0.047), color)
    model.box((x, edge - 0.0375, 0.0115), (0.12, 0.025, 0.023), color)


def stripes(model, start, count: int, along: str = "x", z: float = SLAB_TOP,
            width: float = 0.03, length: float = 0.04) -> None:
    """Warning stripes lying on a surface, from *start* (x, y) along x or y."""
    for index in range(count):
        offset = (index + 0.5) * length
        x = start[0] + (offset if along == "x" else 0.0)
        y = start[1] + (offset if along == "y" else 0.0)
        size = (length, width) if along == "x" else (width, length)
        model.plate((x, y, z + _HAIR), size, "+z", "yellow" if index % 2 == 0 else "dark")


def control_box(model, position, z: float = SLAB_TOP) -> None:
    """A small switch cabinet with a sign on its front."""
    x, y = position
    model.box((x, y, z + 0.035), (0.09, 0.06, 0.07), "steel_light")
    model.box((x, y, z + 0.075), (0.10, 0.07, 0.01), "yellow")
    model.plate((x, y - 0.03 - _HAIR, z + 0.038), (0.06, 0.04), "-y", "yellow")
    model.plate((x, y - 0.03 - 2 * _HAIR, z + 0.038), (0.04, 0.012), "-y", "dark")
    # A status light on the lid.
    model.box((x + 0.03, y - 0.015, z + 0.086), (0.018, 0.018, 0.012), "glow_green")


def fence(model, start, end, z: float = SLAB_TOP, height: float = 0.10, posts: int = 3,
          color: str = "steel_dark") -> None:
    """Posts and two rails in a straight line from *start* to *end* (x, y)."""
    for index in range(posts):
        share = index / (posts - 1)
        x = start[0] + (end[0] - start[0]) * share
        y = start[1] + (end[1] - start[1]) * share
        model.beam((x, y, z), (x, y, z + height), 0.012, color)
    for share in (0.5, 0.95):
        model.beam((start[0], start[1], z + height * share), (end[0], end[1], z + height * share),
                   0.008, color)


def railing(model, center, size, z: float, height: float = 0.07, color: str = "yellow") -> None:
    """A railing around a rectangle (roofs, platforms)."""
    corners = [(center[0] + sx * size[0] / 2.0, center[1] + sy * size[1] / 2.0)
               for sx, sy in _CORNERS]
    for index, corner in enumerate(corners):
        following = corners[(index + 1) % 4]
        model.beam((*corner, z), (*corner, z + height), 0.01, color)
        model.beam((*corner, z + height), (*following, z + height), 0.008, color)
        model.beam((*corner, z + height * 0.5), (*following, z + height * 0.5), 0.006, color)


def pipe(model, points, radius: float = 0.018, color: str = "steel_dark", segments: int = 6) -> None:
    """A pipe through *points*, with a joint at every bend."""
    for start, end in zip(points, points[1:]):
        model.cylinder(start, end, radius, color, segments=segments)
    for point in points[1:-1]:
        model.box(point, (radius * 2.5, radius * 2.5, radius * 2.5), color)


def valve(model, position, z: float = SLAB_TOP) -> None:
    """A red standpipe with a yellow hand wheel."""
    x, y = position
    model.cylinder((x, y, z), (x, y, z + 0.12), 0.03, "red", segments=8)
    model.cylinder((x, y, z + 0.12), (x, y, z + 0.135), 0.038, "steel_dark", segments=8)
    model.cylinder((x, y, z + 0.135), (x, y, z + 0.155), 0.008, "steel_dark", segments=6)
    model.cylinder((x, y, z + 0.155), (x, y, z + 0.165), 0.045, "yellow", segments=8)


def barrel(model, position, z: float, radius: float = 0.04, height: float = 0.10,
           color: str = "steel_dark", band: str = "steel") -> None:
    """An upright drum with a band around its middle."""
    x, y = position
    model.cylinder((x, y, z), (x, y, z + height), radius, color)
    model.cylinder((x, y, z + height * 0.44), (x, y, z + height * 0.56), radius * 1.07, band)
    model.cylinder((x, y, z + height), (x, y, z + height + 0.012), radius * 0.55, band, segments=8)


def drum(model, start, end, radius: float = 0.06, color: str = "steel_dark",
         cap: str = "steel_light") -> None:
    """A lying drum or motor from *start* to *end*, with a lighter cap at its end."""
    model.cylinder(start, end, radius, color)
    tip = tuple(end[axis] + (end[axis] - start[axis]) * 0.12 for axis in range(3))
    model.cylinder(end, tip, radius * 0.6, cap, segments=8)


def crate(model, position, z: float, size, color: str = "yellow", turn: float = 0.0) -> None:
    """A box with a dark strap across its lid."""
    with model.placed((position[0], position[1], z), turn):
        model.box((0.0, 0.0, size[2] / 2.0), size, color)
        model.plate((0.0, 0.0, size[2] + _HAIR), (size[0], size[1] * 0.14), "+z", "dark")


def vent(model, center, size, facing: str, slats: int = 4) -> None:
    """A dark opening with light slats on a wall looking along *facing* (+x, -x, +y or -y).
    *size* is (across, up)."""
    model.plate(_lifted(center, facing), size, facing, "dark")
    for index in range(slats):
        height = center[2] + ((index + 0.5) / slats - 0.5) * size[1]
        lifted = _lifted((center[0], center[1], height), facing, 2)
        model.plate(lifted, (size[0] * 0.9, size[1] / slats * 0.35), facing, "steel_light")


def window(model, center, size, facing: str, frame: str = "yellow", pane: str = "window") -> None:
    """A framed pane on a wall or roof looking along *facing*. *size* is (across, up)."""
    model.plate(_lifted(center, facing), size, facing, frame)
    model.plate(_lifted(center, facing, 2), (size[0] * 0.66, size[1] * 0.66), facing, pane)


def braced_frame(model, center, half: float, bottom: float, top: float, leg: float = 0.035,
                 color: str = "steel", brace: str = "steel_dark") -> None:
    """Four legs with a cross on every side."""
    corners = [(center[0] + sx * half, center[1] + sy * half) for sx, sy in _CORNERS]
    for index, corner in enumerate(corners):
        following = corners[(index + 1) % 4]
        model.beam((*corner, bottom), (*corner, top), leg, color)
        model.beam((*corner, bottom + 0.01), (*following, top - 0.01), leg * 0.57, brace)
        model.beam((*following, bottom + 0.01), (*corner, top - 0.01), leg * 0.57, brace)


def room(model, floor: str = "floor", wall: str = "blue", cap: str = "blue_dark",
         height: float = 0.40, half: float = 0.42, trim: str = "yellow") -> float:
    """An open room: a floor plate and two walls meeting in the back left corner (+y, -x), the
    open sides towards the camera. Returns the height of the floor's top."""
    floor_top = 0.06
    model.box((0.0, 0.0, floor_top / 2.0), (half * 2.0, half * 2.0, floor_top), floor)
    model.plate((0.0, -half - _HAIR, floor_top - 0.012), (half * 2.0, 0.012), "-y", trim)
    model.plate((half + _HAIR, 0.0, floor_top - 0.012), (half * 2.0, 0.012), "+x", trim)
    thickness = 0.07
    middle = floor_top + height / 2.0
    model.box((thickness / 2.0, half - thickness / 2.0, middle), (half * 2.0 - thickness, thickness, height), wall)
    model.box((-half + thickness / 2.0, 0.0, middle), (thickness, half * 2.0, height), wall)
    top = floor_top + height
    model.box((thickness / 2.0, half - thickness / 2.0, top + 0.01), (half * 2.0 - thickness + 0.02, thickness + 0.02, 0.02), cap)
    model.box((-half + thickness / 2.0, 0.0, top + 0.01), (thickness + 0.02, half * 2.0 + 0.02, 0.02), cap)
    model.plate((0.05, half - thickness - _HAIR, top - 0.03), (half * 2.0 - thickness - 0.1, 0.014), "-y", trim)
    model.plate((-half + thickness + _HAIR, -0.04, top - 0.03), (half * 2.0 - 0.1, 0.014), "+x", trim)
    return floor_top


# --- Lamps --------------------------------------------------------------------------------------
# Everything here glows (kit.GLOWS): the game turns it up at dusk, at night and without air. Warm
# white (glow_lamp) is the rule; red marks the tip of anything tall, amber a warning or a status.
# A lamp is a few faces only: hulls are drawn by the hundred.

LAMP = "glow_lamp"
WARNING = "glow_red"
STATUS = "glow_orange"


def lamp(model, center, size=(0.03, 0.03, 0.03), color: str = LAMP) -> None:
    """A small glowing box (a bulb, a marker light)."""
    model.box(center, size, color)


def tip_light(model, position, z: float, color: str = WARNING, radius: float = 0.018) -> None:
    """A warning light on top of something tall: a short dark socket and a glowing cap whose
    bottom is at *z*."""
    x, y = position
    model.cylinder((x, y, z), (x, y, z + 0.012), radius * 1.15, "steel_dark", segments=6)
    model.cylinder((x, y, z + 0.012), (x, y, z + 0.012 + radius * 1.6), radius, color, segments=6)


def floodlight(model, center, facing: str, size=(0.07, 0.04), depth: float = 0.035,
               housing: str = "steel_dark") -> None:
    """A lamp housing with its glowing lens looking along *facing* (+x, -x, +y, -y or -z);
    *center* is the middle of the housing, *size* the lens (across, up)."""
    across, up = size
    if facing in ("+x", "-x"):
        box = (depth, across, up)
    elif facing in ("+y", "-y"):
        box = (across, depth, up)
    else:
        box = (across, up, depth)
    model.box(center, box, housing)
    out = _OUTWARD.get(facing, (0, 0, -1))
    lens = tuple(center[axis] + out[axis] * (box[axis] / 2.0 + _HAIR) for axis in range(3))
    model.plate(lens, (across * 0.84, up * 0.7), facing, LAMP)


def lamp_post(model, position, z: float, height: float = 0.30, facing: str = "-y",
              color: str = "steel_dark") -> None:
    """A thin post standing at *position* on *z*, with a floodlight at its top looking along
    *facing* and down."""
    x, y = position
    top = z + height
    model.beam((x, y, z), (x, y, top), 0.014, color)
    out = _OUTWARD[facing]
    head = (x + out[0] * 0.02, y + out[1] * 0.02, top - 0.01)
    model.box(head, (0.05, 0.05, 0.022), color)
    model.plate((head[0], head[1], head[2] - 0.011 - _HAIR), (0.04, 0.04), "-z", LAMP)
    model.plate(_lifted((head[0] + out[0] * 0.025, head[1] + out[1] * 0.025, head[2]), facing),
                (0.04, 0.016), facing, LAMP)


def edge_lamps(model, half: float, z: float, count: int = 3, size=(0.045, 0.016),
               color: str = LAMP, margin: float = 0.12, top: bool = True, face: bool = True) -> None:
    """Small lamps along the four top edges of a square block of half size *half* (centred on
    the model) whose top is at height *z*: each a plate on the outward *face* just below the edge
    and, with *top*, one lying on the top just inside it, so it shows from the side and from
    above. *count* per edge, evenly spread, *margin* from either corner. The same on every side:
    a model turned by a quarter looks the same. *size* is (along the edge, across it). *half* may
    also be (x, y) for a rectangle."""
    along_size, deep = size
    half_x, half_y = (half, half) if isinstance(half, (int, float)) else half
    out_by = 3.0 * _HAIR  # in front of stripes and strips that already lie on the face
    for side in ("+x", "-x", "+y", "-y"):
        out = _OUTWARD[side]
        span = 2.0 * ((half_y if side in ("+x", "-x") else half_x) - margin)
        for index in range(count):
            along = -span / 2.0 + span * (index + 0.5) / count
            if side in ("+x", "-x"):
                point = (out[0] * (half_x + out_by), along, z - deep / 2.0)
                lying = (out[0] * (half_x - deep / 2.0), along, z + out_by)
                flat = (deep, along_size)
            else:
                point = (along, out[1] * (half_y + out_by), z - deep / 2.0)
                lying = (along, out[1] * (half_y - deep / 2.0), z + out_by)
                flat = (along_size, deep)
            if face:
                model.plate(point, (along_size, deep), side, color)
            if top:
                model.plate(lying, flat, "+z", color)


def lattice_mast(model, center, bottom: float, top: float, half_bottom: float, half_top: float,
                 bays: int = 3, leg: float = 0.028, color: str = "steel",
                 brace: str = "steel_dark") -> None:
    """A tapering lattice mast: four legs, rings between the bays, a cross per bay and side."""
    def corner(level: int, sign) -> tuple:
        half = half_bottom + (half_top - half_bottom) * level / bays
        height = bottom + (top - bottom) * level / bays
        return (center[0] + sign[0] * half, center[1] + sign[1] * half, height)

    for sign in _CORNERS:
        model.beam(corner(0, sign), corner(bays, sign), leg, color)
    for level in range(bays):
        for index, sign in enumerate(_CORNERS):
            following = _CORNERS[(index + 1) % 4]
            if level > 0:
                model.beam(corner(level, sign), corner(level, following), leg * 0.64, color)
            model.beam(corner(level, sign), corner(level + 1, following), leg * 0.5, brace)
            model.beam(corner(level, following), corner(level + 1, sign), leg * 0.5, brace)


# --- Industry -----------------------------------------------------------------------------------
# Tanks, vessels, chimneys and the like for the plants without walls (refinery, chemical plant,
# big pump). Round things are made with kit.Builder.revolve.

def tank(model, position, z: float, radius: float, height: float, color: str = "steel_light",
         band: str | None = None, roof: str | None = None, ladder: bool = False,
         segments: int = 12) -> float:
    """An upright storage tank standing on *z* with a shallow domed roof, an optional coloured
    band below its roof and a ladder up its front (-y). Returns the height of its roof's top."""
    x, y = position
    top = z + height
    model.revolve((x, y, z), [(radius, 0.0), (radius, height, roof or color),
                              (radius * 0.72, height + radius * 0.22, roof or color),
                              (0.0, height + radius * 0.32)], color, segments=segments)
    if band:
        model.cylinder((x, y, top - 0.05), (x, y, top - 0.025), radius * 1.03, band, segments=segments)
    if ladder:
        ladder_up(model, (x + radius * 0.35, y - radius - 0.012), z, top)
    return top + radius * 0.32


def ladder_up(model, position, bottom: float, top: float, width: float = 0.05,
              color: str = "steel_dark", rungs: int = 4) -> None:
    """A ladder standing at *position*, its rails left and right along x."""
    x, y = position
    for side in (-width / 2.0, width / 2.0):
        model.beam((x + side, y, bottom), (x + side, y, top), 0.008, color)
    for index in range(rungs):
        height = bottom + (index + 0.5) * (top - bottom) / rungs
        model.beam((x - width / 2.0, y, height), (x + width / 2.0, y, height), 0.006, color)


def sphere_tank(model, position, z: float, radius: float, color: str = "white",
                legs: str = "steel_dark") -> float:
    """A pressure sphere on four legs, its bottom a little above *z*. Returns its top."""
    x, y = position
    middle = z + radius * 1.25
    profile = [(radius * math.sin(math.radians(angle)), -radius * math.cos(math.radians(angle)))
               for angle in range(0, 181, 30)]
    model.revolve((x, y, middle), profile, color, segments=12)
    model.cylinder((x, y, middle - 0.012), (x, y, middle + 0.012), radius * 1.02, "steel", segments=12)
    for sx, sy in _CORNERS:
        foot = (x + sx * radius * 0.74, y + sy * radius * 0.74)
        model.beam((*foot, z), (*foot, middle), 0.022, legs)
    return middle + radius


def pressure_vessel(model, center, length: float, radius: float, turn: float = 0.0,
                    color: str = "steel_light", saddle: str = "steel_dark") -> None:
    """A lying capsule on two saddles; *center* is the middle of its axis, *turn* (radians) its
    direction from the x axis."""
    x, y, z = center
    half = length / 2.0
    with model.placed((x, y, z), turn=turn + math.pi / 2.0, tilt=math.pi / 2.0):
        model.revolve((0.0, 0.0, 0.0), [(0.0, -half - radius * 0.55), (radius * 0.75, -half - radius * 0.4),
                                         (radius, -half), (radius, half), (radius * 0.75, half + radius * 0.4),
                                         (0.0, half + radius * 0.55)], color, segments=10)
    rest = z - radius * 0.5
    for share in (-0.3, 0.3):
        with model.placed((x + math.cos(turn) * length * share, y + math.sin(turn) * length * share, 0.0), turn=turn):
            model.box((0.0, 0.0, rest / 2.0), (0.03, radius * 1.5, rest), saddle)


def chimney(model, position, z: float, height: float, radius: float = 0.035, color: str = "steel_dark",
            band: str = "red", flare: bool = False) -> float:
    """A slightly tapering stack with two warning bands and a red light on a bracket below its
    top; with *flare* a burning gas flare on it instead of the open top. Returns its top."""
    x, y = position
    top = z + height
    model.cylinder((x, y, z), (x, y, top), radius, color, segments=8, end_radius=radius * 0.8)
    for share in (0.70, 0.86):
        model.cylinder((x, y, z + height * share), (x, y, z + height * share + 0.025),
                       radius * (1.0 - 0.2 * share) + 0.003, band, segments=8)
    if flare:
        model.cylinder((x, y, top), (x, y, top + 0.015), radius * 1.2, "steel_dark", segments=8)
        model.cylinder((x, y, top + 0.015), (x, y, top + 0.075), radius * 0.9, "glow_orange", segments=6,
                       end_radius=0.004)
    else:
        model.plate((x, y, top + _HAIR), (radius * 1.1, radius * 1.1), "+z", "dark")
    arm = radius * 0.8
    model.beam((x + arm, y, top - 0.03), (x + arm + 0.03, y, top - 0.03), 0.01, "steel_dark")
    tip_light(model, (x + arm + 0.03, y), top - 0.03, radius=0.012)
    return top


def pipe_rack(model, start, end, z: float, pipes=("steel", "rust", "steel_light"), posts: int = 2,
              color: str = "steel_dark", ground: float = 0.0) -> None:
    """Posts with cross beams carrying parallel pipes from *start* to *end* (x, y) at height *z*,
    standing on *ground*."""
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dy)
    across = (-dy / length, dx / length)
    width = 0.035 * len(pipes)
    for index in range(posts):
        share = index / (posts - 1) if posts > 1 else 0.5
        px, py = start[0] + dx * share, start[1] + dy * share
        for side in (-1, 1):
            foot = (px + across[0] * side * width / 2.0, py + across[1] * side * width / 2.0)
            model.beam((*foot, ground), (*foot, z), 0.014, color)
        model.beam((px - across[0] * width * 0.6, py - across[1] * width * 0.6, z),
                   (px + across[0] * width * 0.6, py + across[1] * width * 0.6, z), 0.014, color)
    for number, pipe_color in enumerate(pipes):
        offset = (number - (len(pipes) - 1) / 2.0) * 0.035
        ox, oy = across[0] * offset, across[1] * offset
        model.cylinder((start[0] + ox, start[1] + oy, z + 0.018), (end[0] + ox, end[1] + oy, z + 0.018), 0.011,
                       pipe_color, segments=6)


def conveyor(model, start, end, z: float, width: float = 0.10, color: str = "steel",
             belt: str = "dark", legs: int = 3, ground: float = 0.0) -> None:
    """A belt conveyor in a straight line from *start* to *end* (x, y), its belt at height *z*:
    side rails, rollers at its ends, legs down to *ground*."""
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dy)
    with model.placed(((start[0] + end[0]) / 2.0, (start[1] + end[1]) / 2.0, 0.0), turn=math.atan2(dy, dx)):
        model.box((0.0, 0.0, z - 0.012), (length, width, 0.024), belt)
        for side in (-1, 1):
            model.box((0.0, side * (width / 2.0 + 0.008), z - 0.006), (length + 0.02, 0.014, 0.03), color)
        for end_x in (-length / 2.0, length / 2.0):
            model.cylinder((end_x, -width / 2.0, z - 0.012), (end_x, width / 2.0, z - 0.012), 0.014,
                           "steel_dark", segments=8)
        for index in range(legs):
            leg_x = -length / 2.0 + 0.04 + (length - 0.08) * index / max(legs - 1, 1)
            for side in (-1, 1):
                model.beam((leg_x, side * width / 2.0, ground), (leg_x, side * width / 2.0, z - 0.024), 0.012,
                           "steel_dark")


def shelf(model, center, length: float, depth: float, levels, color: str = "steel_light",
          board: str = "steel", bottom: float = 0.0, posts: int = 3, top: float | None = None) -> None:
    """An open rack along x: *posts* pairs of posts up to *top* (a little above the highest
    board by default) and a board at every height in *levels* (the boards' tops), standing on
    *bottom*."""
    x, y = center
    top = levels[-1] + 0.05 if top is None else top
    for index in range(posts):
        px = x - length / 2.0 + length * index / (posts - 1)
        for py in (y - depth / 2.0, y + depth / 2.0):
            model.beam((px, py, bottom), (px, py, top), 0.016, color)
    for level in levels:
        model.box((x, y, level - 0.008), (length + 0.02, depth + 0.02, 0.016), board)


def roof_fan(model, center, z: float, name: str, accent: str = "yellow", radius: float = 0.10) -> None:
    """A fan lying on a roof or a box at height *z*: a ring with a dark opening and two blades
    that turn (moving part *name*, role fan)."""
    x, y = center
    model.cylinder((x, y, z), (x, y, z + 0.04), radius, "steel", segments=10)
    model.plate((x, y, z + 0.0403), (radius * 1.7, radius * 1.7), "+z", "dark")
    with model.moving(name, (x, y, z + 0.04)):
        for turn in (0.0, math.pi / 2.0):
            model.box((x, y, z + 0.046), (radius * 1.7, 0.028, 0.008), "steel_light", turn=turn)
        model.cylinder((x, y, z + 0.04), (x, y, z + 0.056), 0.02, accent, segments=6)


def wall_fan(model, center, name: str, radius: float = 0.08, accent: str = "yellow") -> None:
    """An exhaust fan on a back wall, looking to the front (-y): a square frame, a dark opening
    and three blades that turn around the wall's normal (moving part *name*, role fan).
    *center* is the middle of the frame's front face."""
    x, y, z = center
    model.box((x, y + 0.012, z), (radius * 2.4, 0.024, radius * 2.4), "steel_dark")
    model.plate((x, y - _HAIR, z), (radius * 2.0, radius * 2.0), "-y", "dark")
    # Tilted by 90 degrees, the part's own Z axis runs along the wall's normal (-y).
    with model.moving(name, (x, y - 0.012, z), tilt=math.pi / 2.0):
        with model.placed((x, y - 0.012, z), tilt=math.pi / 2.0):
            for blade in range(3):
                with model.placed((0.0, 0.0, 0.0), turn=blade * 2.0 * math.pi / 3.0):
                    model.box((radius * 0.5, 0.0, 0.0), (radius * 0.9, 0.035, 0.006), "steel_light")
            model.cylinder((0.0, 0.0, -0.004), (0.0, 0.0, 0.012), 0.018, accent, segments=6)


def robot_arm(model, position, turn: float, z: float, color: str = "yellow") -> None:
    """An industrial robot arm on a round foot, reaching to its front (-y of its *turn*)."""
    with model.placed((position[0], position[1], z), turn=turn):
        model.cylinder((0.0, 0.0, 0.0), (0.0, 0.0, 0.04), 0.045, "steel_dark")
        model.beam((0.0, 0.0, 0.04), (0.0, 0.0, 0.20), 0.04, color)
        model.cylinder((-0.03, 0.0, 0.20), (0.03, 0.0, 0.20), 0.03, "steel_dark", segments=8)
        model.beam((0.0, 0.0, 0.20), (0.0, -0.13, 0.26), 0.035, color)
        model.beam((0.0, -0.13, 0.26), (0.0, -0.17, 0.20), 0.022, "steel_dark")


def dish(model, radius: float, depth: float, inner: str = "white", outer: str = "steel",
         accent: str = "glow_cyan", struts: int = 3, segments: int = 16) -> None:
    """A parabolic dish opening along +Z of the current frame, its lowest point at the origin:
    the hollow side looks along +Z, the back is a shell of *outer* with a hub. A feed hangs in
    the focus on *struts* thin struts from the rim, with a lit tip pointing into the dish."""
    rings = 3
    thickness = max(radius * 0.05, 0.008)
    # Up the back from its middle to the rim, over the rim, down the inside to its bottom.
    profile = [(radius * k / rings, depth * (k / rings) ** 2 - thickness, outer) for k in range(rings + 1)]
    profile += [(radius * (1.0 - k / rings), depth * (1.0 - k / rings) ** 2, inner) for k in range(rings + 1)]
    model.revolve((0.0, 0.0, 0.0), profile, inner, segments=segments, sharp=60.0)
    model.cylinder((0.0, 0.0, -thickness - 0.03), (0.0, 0.0, -thickness + 0.002), radius * 0.22, "steel_dark",
                   segments=8)
    focus = depth + radius * 0.45
    for index in range(struts):
        angle = 2.0 * math.pi * (index + 0.25) / struts
        rim = (math.cos(angle) * radius * 0.9, math.sin(angle) * radius * 0.9, depth * 0.8)
        model.beam(rim, (0.0, 0.0, focus), 0.008 + radius * 0.01, "steel_dark")
    model.cylinder((0.0, 0.0, focus - 0.005), (0.0, 0.0, focus + 0.03), radius * 0.08 + 0.008, "steel_light",
                   segments=8)
    model.cylinder((0.0, 0.0, focus - 0.015), (0.0, 0.0, focus - 0.005), radius * 0.05 + 0.006, accent,
                   segments=8)


def probe(model, length: float, radius: float, accent: str = "glow_cyan", body: str = "white",
          panels: bool = True, antenna: bool = True) -> None:
    """A small exploration probe along +Z of the current frame, its nozzle at the origin: an
    engine bell, a slim body with a lit band and two folded solar panels (on +x and -x), four
    tail fins, a nose cone and a whip antenna. Without *panels* or *antenna* (a wreck adds its
    own, bent or broken off: probe_panel)."""
    bell = length * 0.10
    body_end = length * 0.70
    nose_end = length * 0.90
    model.cylinder((0.0, 0.0, 0.0), (0.0, 0.0, bell), radius * 0.85, "steel_dark", segments=8,
                   end_radius=radius * 0.45)
    model.cylinder((0.0, 0.0, bell), (0.0, 0.0, body_end), radius, body, segments=10)
    model.cylinder((0.0, 0.0, body_end * 0.62), (0.0, 0.0, body_end * 0.62 + length * 0.04), radius * 1.06,
                   accent, segments=10)
    model.cylinder((0.0, 0.0, bell + 0.004), (0.0, 0.0, bell + length * 0.05), radius * 1.06, "steel", segments=10)
    middle = (bell + body_end * 0.58) / 2.0 + length * 0.04
    for side in ((-1, 1) if panels else ()):
        model.box((side * (radius + 0.004), 0.0, middle), (0.006, radius * 1.5, length * 0.30), "solar")
        model.box((side * (radius + 0.002), 0.0, middle), (0.004, radius * 1.7, length * 0.32), "steel_light")
    for turn in (0.0, math.pi / 2.0):
        model.box((0.0, 0.0, bell + length * 0.06), (radius * 2.0 + length * 0.12, 0.006, length * 0.10),
                  "steel_dark", turn=turn)
    model.cylinder((0.0, 0.0, body_end), (0.0, 0.0, nose_end), radius, body, segments=10, end_radius=radius * 0.25)
    if antenna:
        model.cylinder((0.0, 0.0, nose_end), (0.0, 0.0, length), 0.004, "steel_dark", segments=4)


def probe_middle(length: float) -> float:
    """Where along a probe (parts.probe) the middle of its solar panels sits."""
    return (length * 0.10 + length * 0.70 * 0.58) / 2.0 + length * 0.04


def probe_panel(model, length: float, radius: float) -> None:
    """One solar panel of a probe (parts.probe) as a loose plate in the current frame: its long
    side along Y, its face looking up (+Z), its centre at the origin; a light frame below it."""
    model.box((0.0, 0.0, 0.004), (radius * 1.5, length * 0.30, 0.004), "solar")
    model.box((0.0, 0.0, 0.0015), (radius * 1.7, length * 0.32, 0.003), "steel_light")


def torus(model, center, major: float, minor: float, color: str, segments: int = 20,
          sides: int = 8) -> None:
    """A ring lying in the XY plane of the current frame around *center*."""
    profile = [(major + minor * math.cos(2.0 * math.pi * k / sides), minor * math.sin(2.0 * math.pi * k / sides))
               for k in range(sides)]
    model.revolve(center, profile, color, segments=segments, closed=True, sharp=80.0)


# --- Wreckage and impacts -----------------------------------------------------------------------

def fallen_box(model, position, size, color: str, turn: float = 0.0, tilt: float = 0.0,
               z: float = 0.0) -> None:
    """A box lying on the ground at *z* (a fragment, a plate broken off): turned by *turn*
    around Z, tilted by *tilt* around its own X and lifted so its lowest edge just touches *z*."""
    lift = size[1] / 2.0 * abs(math.sin(tilt)) + size[2] / 2.0 * math.cos(tilt)
    with model.placed((position[0], position[1], z + lift), turn=turn, tilt=tilt):
        model.box((0.0, 0.0, 0.0), size, color)


def fragments(model, center, radius: float, count: int, colors, seed: int = 0, size: float = 0.03) -> None:
    """*count* small pieces of wreckage scattered on the ground around *center* within
    *radius*: thin plates and chunks of *size* in the given colours, turned and tilted at
    random (the same for the same *seed*), all of them resting on the ground."""
    generator = random.Random(seed)
    for index in range(count):
        angle = 2.0 * math.pi * index / count + generator.uniform(-0.5, 0.5)
        distance = radius * generator.uniform(0.45, 1.0)
        piece = size * generator.uniform(0.6, 1.3)
        shape = (piece, piece * generator.uniform(0.4, 0.9), piece * generator.uniform(0.12, 0.45))
        fallen_box(model, (center[0] + math.cos(angle) * distance, center[1] + math.sin(angle) * distance), shape,
                   colors[index % len(colors)], turn=generator.uniform(0.0, math.pi),
                   tilt=generator.uniform(-0.5, 0.5))


def scorch(model, center, radius: float, color: str = "ash_stone", seed: int = 0, blotches: int = 5) -> None:
    """A burnt patch on the ground around *center*: a flat, ragged blotch of *radius* with
    smaller blotches round its edge, barely raised off the ground (a ring of soot round an
    impact or a fire)."""
    generator = random.Random(seed)
    x, y = center
    model.lump((x, y, 0.0), (radius * 1.7, radius * 1.6, 0.012), color, seed=seed, rough=0.25, detail=2)
    for index in range(blotches):
        angle = 2.0 * math.pi * index / blotches + generator.uniform(-0.4, 0.4)
        distance = radius * generator.uniform(0.55, 0.85)
        width = radius * generator.uniform(0.45, 0.75)
        model.lump((x + math.cos(angle) * distance, y + math.sin(angle) * distance, 0.0),
                   (width, width * generator.uniform(0.6, 1.0), 0.008), color, seed=seed + 1 + index, rough=0.3)


def impact_crater(model, center, radius: float, height: float, dirt: str = "rock", floor: str = "obsidian",
                  seed: int = 0, clods: int = 9) -> None:
    """A small fresh impact crater around *center*: a blackened floor and a ragged rim of
    thrown-up clods of *dirt* about *radius* out and up to *height* tall."""
    generator = random.Random(seed)
    x, y = center
    model.lump((x, y, 0.0), (radius * 1.7, radius * 1.7, 0.016), floor, seed=seed, rough=0.2, detail=2)
    for index in range(clods):
        angle = 2.0 * math.pi * index / clods + generator.uniform(-0.25, 0.25)
        distance = radius * generator.uniform(0.85, 1.05)
        across = radius * generator.uniform(0.55, 0.85)
        tall = height * generator.uniform(0.7, 1.3)
        model.lump((x + math.cos(angle) * distance, y + math.sin(angle) * distance, tall * 0.15),
                   (across, across * generator.uniform(0.7, 1.0), tall), dirt, seed=seed + 1 + index, rough=0.25,
                   detail=2, smooth=50.0)


# --- Nature and animals -------------------------------------------------------------------------

def tree(model, position, z: float, height: float = 0.30, crown: str = "plant",
         trunk: str = "rust_brown_dark", seed: int = 0) -> None:
    """A small low-poly tree standing on *z*: a trunk and a crown of two faceted lumps."""
    x, y = position
    model.cylinder((x, y, z), (x, y, z + height * 0.5), 0.016, trunk, segments=5)
    model.lump((x, y, z + height * 0.55), (height * 0.6, height * 0.6, height * 0.5), crown, seed=seed,
               rough=0.18)
    model.lump((x + height * 0.04, y - height * 0.03, z + height * 0.82), (height * 0.4, height * 0.4, height * 0.36),
               crown, seed=seed + 1, rough=0.18)


def cow(model, position, z: float, turn: float = 0.0, patch: str = "dark") -> None:
    """A low-poly cow standing on *z*, looking along +x of its *turn*: body, head, ears, legs,
    a tail and a dark patch on either flank."""
    with model.placed((position[0], position[1], z), turn=turn):
        model.box((0.0, 0.0, 0.075), (0.15, 0.07, 0.06), "hide")
        model.box((0.095, 0.0, 0.10), (0.05, 0.045, 0.045), "hide")
        model.box((0.122, 0.0, 0.092), (0.012, 0.035, 0.025), "rust_brown_dark")
        for side in (-1, 1):
            model.plate((-0.02, side * (0.035 + _HAIR), 0.08), (0.06, 0.035), "+y" if side > 0 else "-y", patch)
            model.box((0.085, side * 0.03, 0.125), (0.012, 0.02, 0.008), "hide")
            for along in (-0.055, 0.05):
                model.box((along, side * 0.022, 0.0225), (0.016, 0.016, 0.045), "hide")
        model.beam((-0.075, 0.0, 0.095), (-0.09, 0.0, 0.05), 0.008, "dark")


# --- Enterprise style ---------------------------------------------------------------------------
# The clean, modern look of the enterprise items (Rudi 2026-11-20): white satin panels with fine
# seams, exposed carbon fibre and graphite as accents, a little chrome, cyan light strips, sleek
# displays and much glass. Models build with kit.Builder(name, style="enterprise") (no rust, no
# grime) and paint only with these colours; the rough player parts above do not belong on them.
# Soft-rounded edges come from kit.Builder.rounded_box.

ENT_WHITE = "ent_white"            # wall and housing panels, with seams
ENT_SMOOTH = "ent_white_smooth"    # small white parts (no seams)
ENT_GREY = "ent_grey"              # secondary panels, armour
ENT_FLOOR = "ent_floor"            # floors: light tiles
ENT_GRAPHITE = "ent_graphite"      # trims, frames, bezels, shadow gaps
ENT_CARBON = "ent_carbon"          # exposed carbon fibre: plinths, bands, arms
ENT_CHROME = "ent_chrome"          # sparingly: rings, rails, caps
ENT_LIGHT = "ent_glow"             # cyan light strips and lamps
ENT_LAMP = "ent_lamp"              # cool white lamps
ENT_SCREEN = "ent_screen"          # a display's glowing screen
ENT_ACCENT = "ent_amber"           # a rare warm dot on a display
ENT_WINDOW = "ent_window"          # a closed ribbon window, lit from inside at night
_PANE = "pane"                     # kit.PANE: see-through glass

_ACROSS_UP = {
    "+x": ((0, 1, 0), (0, 0, 1)), "-x": ((0, 1, 0), (0, 0, 1)),
    "+y": ((1, 0, 0), (0, 0, 1)), "-y": ((1, 0, 0), (0, 0, 1)),
    "+z": ((1, 0, 0), (0, 1, 0)),
}


def _on_face(center, facing: str, across: float, up: float, out: float = 0.0) -> tuple:
    """A point on a face looking along *facing*: *across* and *up* from *center* as seen on the
    face (kit.Builder.plate's axes), *out* in front of it."""
    a, u = _ACROSS_UP[facing]
    o = _OUTWARD[facing]
    return tuple(center[axis] + a[axis] * across + u[axis] * up + o[axis] * out for axis in range(3))


def light_strip(model, start, end, thickness: float = 0.012, color: str = ENT_LIGHT) -> None:
    """A glowing strip from *start* to *end*, a square bar of *thickness*; set it half into the
    surface it runs along."""
    model.beam(start, end, thickness, color)


def display(model, center, size, facing: str, seed: int = 0, frame: str = ENT_GRAPHITE,
            depth: float = 0.012) -> None:
    """A slim display looking along *facing* (+x, -x, +y, -y or +z): a graphite bezel *depth*
    deep whose front is at *center*, a glowing screen and a simple abstract interface on it,
    different for every *seed*: a title bar, rows of lines, a bar chart or a ring of dots, a warm
    marker. *size* is (across, up) of the bezel."""
    generator = random.Random(seed)
    width, height = size
    if facing in ("+x", "-x"):
        box = (depth, width, height)
    elif facing in ("+y", "-y"):
        box = (width, depth, height)
    else:
        box = (width, height, depth)
    model.box(_on_face(center, facing, 0.0, 0.0, -depth / 2.0), box, frame)
    border = min(width, height) * 0.08
    inner_w, inner_h = width - 2.0 * border, height - 2.0 * border
    model.plate(_on_face(center, facing, 0.0, 0.0, _HAIR), (inner_w, inner_h), facing, ENT_SCREEN)

    def mark(across: float, up: float, mark_size, color: str = ENT_LIGHT) -> None:
        # *across*, *up*: shares of the screen from its lower left corner.
        point = _on_face(center, facing, (across - 0.5) * inner_w, (up - 0.5) * inner_h, 2.0 * _HAIR)
        model.plate(point, (mark_size[0] * inner_w, mark_size[1] * inner_h), facing, color)

    mark(0.5, 0.90, (0.92, 0.06))
    layout = generator.choice(("lines_chart", "ring_lines", "chart_wide"))
    if layout in ("lines_chart", "ring_lines"):
        for row in range(3 + generator.randint(0, 1)):
            length = generator.uniform(0.25, 0.42)
            mark(0.06 + length / 2.0, 0.70 - row * 0.16, (length, 0.05), ENT_LAMP if row == 0 else ENT_LIGHT)
    if layout == "lines_chart":
        for bar in range(5):
            tall = generator.uniform(0.15, 0.62)
            mark(0.60 + bar * 0.075, 0.10 + tall / 2.0, (0.045, tall))
    elif layout == "ring_lines":
        aspect = inner_h / inner_w
        for dot in range(10):
            angle = 2.0 * math.pi * dot / 10.0
            mark(0.74 + math.cos(angle) * 0.25 * aspect, 0.44 + math.sin(angle) * 0.25, (0.07 * aspect, 0.07),
                 ENT_LAMP if dot < 3 else ENT_LIGHT)
    else:
        for bar in range(9):
            tall = generator.uniform(0.12, 0.55)
            mark(0.08 + bar * 0.105, 0.10 + tall / 2.0, (0.06, tall))
        mark(0.30, 0.78, (0.40, 0.05), ENT_LAMP)
    mark(0.93, 0.08, (0.05, 0.06), ENT_ACCENT)


def wall_panel(model, center, size, facing: str, color: str = ENT_WHITE, gap: str = ENT_GRAPHITE,
               depth: float = 0.014) -> None:
    """A raised panel on a wall looking along *facing*, its back at *center*: a white slab with a
    thin graphite shadow gap around it. *size* is (across, up)."""
    width, height = size
    model.plate(_on_face(center, facing, 0.0, 0.0, _HAIR), (width + 0.012, height + 0.012), facing, gap)
    box = (depth, width, height) if facing in ("+x", "-x") else (width, depth, height)
    model.box(_on_face(center, facing, 0.0, 0.0, depth / 2.0), box, color)


def corner_post(model, position, bottom: float, top: float, radius: float = 0.035, segments: int = 3,
                outward=None, color: str = ENT_WHITE, strip: str | None = ENT_LIGHT) -> None:
    """A round-edged post at *position* from *bottom* to *top*; with *strip* and *outward*
    (sx, sy: the corner it faces) a glowing line up that corner."""
    x, y = position
    model.rounded_box((x, y, (bottom + top) / 2.0), (2.0 * radius, 2.0 * radius, top - bottom), radius * 0.9,
                      color, segments=segments)
    if strip and outward:
        reach = radius * 0.72
        length = top - bottom
        light_strip(model, (x + outward[0] * reach, y + outward[1] * reach, bottom + length * 0.15),
                    (x + outward[0] * reach, y + outward[1] * reach, top - length * 0.10), 0.012, strip)


def glass_wall(model, start, end, bottom: float, top: float, sill: float = 0.05,
               mullions: int = 2, frame: str = ENT_SMOOTH, light: str | None = ENT_LIGHT) -> None:
    """A glass bulkhead from *start* to *end* (x, y): a white sill with a cyan line along its
    front (the side to the right of the walk), a pane up to a slim graphite head rail, *mullions*
    slim graphite bars."""
    length = math.hypot(end[0] - start[0], end[1] - start[1])
    with model.placed(((start[0] + end[0]) / 2.0, (start[1] + end[1]) / 2.0, 0.0),
                      turn=math.atan2(end[1] - start[1], end[0] - start[0])):
        model.box((0.0, 0.0, bottom + sill / 2.0), (length, 0.05, sill), frame)
        if light:
            light_strip(model, (-length / 2.0 + 0.02, -0.025, bottom + sill - 0.006),
                        (length / 2.0 - 0.02, -0.025, bottom + sill - 0.006), 0.009, light)
        tall = top - bottom - sill
        model.box((0.0, 0.0, bottom + sill + tall / 2.0), (length, 0.006, tall), _PANE)
        model.box((0.0, 0.0, top - 0.008), (length, 0.03, 0.016), ENT_GRAPHITE)
        for index in range(mullions):
            along = -length / 2.0 + length * (index + 1) / (mullions + 1)
            model.box((along, 0.0, bottom + sill + tall / 2.0), (0.012, 0.016, tall), ENT_GRAPHITE)


def carbon_trim(model, start, end, height: float, depth: float = 0.02, z: float = 0.0) -> None:
    """A band of exposed carbon fibre from *start* to *end* (x, y), *height* tall from *z*."""
    length = math.hypot(end[0] - start[0], end[1] - start[1])
    with model.placed(((start[0] + end[0]) / 2.0, (start[1] + end[1]) / 2.0, 0.0),
                      turn=math.atan2(end[1] - start[1], end[0] - start[0])):
        model.box((0.0, 0.0, z + height / 2.0), (length, depth, height), ENT_CARBON)


def plinth(model, half, height: float = 0.05, radius: float = 0.06, light: bool = True) -> float:
    """The base enterprise machines stand on: a carbon skirt, a white top with soft corners and,
    with *light*, a cyan line round the skirt. *half* may be (x, y). Returns its top."""
    hx, hy = (half, half) if isinstance(half, (int, float)) else half
    skirt = height * 0.55
    model.rounded_box((0.0, 0.0, skirt / 2.0), (2.0 * hx - 0.02, 2.0 * hy - 0.02, skirt), radius, ENT_CARBON)
    model.rounded_box((0.0, 0.0, skirt + (height - skirt) / 2.0), (2.0 * hx, 2.0 * hy, height - skirt), radius,
                      ENT_SMOOTH)
    if light:
        line = skirt * 0.5
        for sign in (-1, 1):
            light_strip(model, (-(hx - radius), sign * (hy - 0.012), line), (hx - radius, sign * (hy - 0.012), line),
                        0.008)
            light_strip(model, (sign * (hx - 0.012), -(hy - radius), line), (sign * (hx - 0.012), hy - radius, line),
                        0.008)
    return height


def console(model, position, z: float, width: float = 0.20, turn: float = 0.0, seed: int = 0) -> None:
    """A free-standing console at *position* on *z*, its operator side to the front (-y of its
    *turn*): a soft white pedestal on a carbon foot, a slanted display and a cyan kick light."""
    with model.placed((position[0], position[1], z), turn=turn):
        model.rounded_box((0.0, 0.0, 0.008), (width, 0.10, 0.016), 0.03, ENT_CARBON)
        model.rounded_box((0.0, 0.01, 0.016 + 0.045), (width * 0.86, 0.07, 0.09), 0.025, ENT_SMOOTH)
        light_strip(model, (-width * 0.34, -0.026, 0.026), (width * 0.34, -0.026, 0.026), 0.008)
        with model.placed((0.0, -0.005, 0.115), tilt=0.85):
            model.box((0.0, 0.0, 0.0), (width, 0.10, 0.014), ENT_SMOOTH)
            display(model, (0.0, 0.0, 0.007 + 0.005), (width * 0.92, 0.088), "+z", seed=seed, depth=0.005)


def ent_room(model, half=0.42, height: float = 0.40, glass: bool = True, floor_top: float = 0.06) -> float:
    """The open room of an enterprise module (the counterpart of room): a tiled floor on a carbon
    edge with a cyan line along the open sides, two walls meeting in the back left corner (+y,
    -x) - white panels below, glass above (*glass*) under a white head with a cyan cove light -
    and a round post in that corner. *half* may be (x, y). Returns the floor's top."""
    hx, hy = (half, half) if isinstance(half, (int, float)) else half
    model.box((0.0, 0.0, floor_top * 0.3), (2.0 * hx, 2.0 * hy, floor_top * 0.6), ENT_CARBON)
    model.box((0.0, 0.0, floor_top * 0.8), (2.0 * hx, 2.0 * hy, floor_top * 0.4), ENT_FLOOR)
    light_strip(model, (-hx + 0.03, -hy, floor_top * 0.3), (hx - 0.03, -hy, floor_top * 0.3), 0.008)
    light_strip(model, (hx, -hy + 0.03, floor_top * 0.3), (hx, hy - 0.03, floor_top * 0.3), 0.008)
    thick = 0.05
    top = floor_top + height
    lower = floor_top + (height * 0.42 if glass else height - 0.04)
    back_y, left_x = hy - thick / 2.0, -hx + thick / 2.0
    model.box((thick / 2.0, back_y, (floor_top + lower) / 2.0), (2.0 * hx - thick, thick, lower - floor_top),
              ENT_WHITE)
    model.box((left_x, -thick / 2.0, (floor_top + lower) / 2.0), (thick, 2.0 * hy - thick, lower - floor_top),
              ENT_WHITE)
    carbon_trim(model, (-hx + thick, back_y - thick / 2.0 - 0.003), (hx, back_y - thick / 2.0 - 0.003), 0.03,
                depth=0.008, z=floor_top)
    carbon_trim(model, (left_x + thick / 2.0 + 0.003, -hy), (left_x + thick / 2.0 + 0.003, hy - thick), 0.03,
                depth=0.008, z=floor_top)
    if glass:
        glass_wall(model, (-hx + thick, back_y), (hx, back_y), lower, top - 0.04, sill=0.02,
                   mullions=max(1, int(round(hx * 2.0 / 0.4)) - 1))
        glass_wall(model, (left_x, -hy), (left_x, hy - thick), lower, top - 0.04, sill=0.02,
                   mullions=max(1, int(round(hy * 2.0 / 0.4)) - 1))
    # The head over the walls, a cyan cove light along its inner side.
    model.box((thick / 2.0, back_y, top - 0.02), (2.0 * hx - thick, thick + 0.01, 0.04), ENT_SMOOTH)
    model.box((left_x, -thick / 2.0, top - 0.02), (thick + 0.01, 2.0 * hy - thick, 0.04), ENT_SMOOTH)
    light_strip(model, (-hx + thick + 0.01, back_y - thick / 2.0 - 0.006, top - 0.034),
                (hx - 0.01, back_y - thick / 2.0 - 0.006, top - 0.034), 0.01)
    light_strip(model, (left_x + thick / 2.0 + 0.006, -hy + 0.01, top - 0.034),
                (left_x + thick / 2.0 + 0.006, hy - thick - 0.01, top - 0.034), 0.01)
    corner_post(model, (-hx + 0.04, hy - 0.04), floor_top, top + 0.012, radius=0.04)
    return floor_top


def robot_arm_clean(model, position, turn: float, z: float, reach: float = 0.22) -> None:
    """A sleek manipulator on a round carbon foot reaching to its front (-y of its *turn*): white
    round links, carbon joints, a cyan ring at its foot, a chrome tool head with a cyan tip."""
    with model.placed((position[0], position[1], z), turn=turn):
        model.cylinder((0.0, 0.0, 0.0), (0.0, 0.0, 0.03), 0.055, ENT_CARBON, segments=16)
        model.cylinder((0.0, 0.0, 0.03), (0.0, 0.0, 0.036), 0.05, ENT_LIGHT, segments=16)
        model.cylinder((0.0, 0.0, 0.036), (0.0, 0.0, 0.07), 0.042, ENT_SMOOTH, segments=16)
        shoulder = (0.0, 0.0, 0.07 + reach * 0.55)
        model.cylinder((0.0, 0.0, 0.07), shoulder, 0.026, ENT_SMOOTH, segments=12)
        model.cylinder((-0.03, 0.0, shoulder[2]), (0.03, 0.0, shoulder[2]), 0.03, ENT_CARBON, segments=12)
        elbow = (0.0, -reach * 0.62, shoulder[2] + reach * 0.22)
        model.cylinder(shoulder, elbow, 0.022, ENT_SMOOTH, segments=12)
        model.cylinder((-0.024, elbow[1], elbow[2]), (0.024, elbow[1], elbow[2]), 0.024, ENT_CARBON, segments=12)
        wrist = (0.0, -reach, shoulder[2] - reach * 0.12)
        model.cylinder(elbow, wrist, 0.016, ENT_SMOOTH, segments=10)
        model.cylinder(wrist, (wrist[0], wrist[1], wrist[2] - 0.04), 0.014, ENT_CHROME, segments=10)
        model.cylinder((wrist[0], wrist[1], wrist[2] - 0.04), (wrist[0], wrist[1], wrist[2] - 0.05), 0.009,
                       ENT_LIGHT, segments=8)


# --- Enterprise furniture and fittings (enterprise_civic.py) ------------------------------------
# Offices, classrooms, lounges and archives of the enterprise share these; all in the ENT_*
# colours, soft-cornered.

def ent_sphere(model, center, radius: float, color: str, rings: int = 6, segments: int = 12) -> None:
    """A ball (a lamp, a hologram's core, a planet)."""
    profile = [(radius * math.sin(math.pi * k / rings), -radius * math.cos(math.pi * k / rings))
               for k in range(rings + 1)]
    model.revolve(center, profile, color, segments=segments)


def ent_chair(model, position, z: float, turn: float = 0.0, seat: str = ENT_GRAPHITE, shell: str = ENT_SMOOTH,
              size: float = 0.07) -> None:
    """A swivel chair at *position* on *z*, facing -y of its *turn*: a chrome stem on a small
    carbon foot, a soft seat, a white shell as its back."""
    with model.placed((position[0], position[1], z), turn=turn):
        model.cylinder((0.0, 0.0, 0.0), (0.0, 0.0, 0.006), size * 0.45, ENT_CARBON, segments=10)
        model.cylinder((0.0, 0.0, 0.006), (0.0, 0.0, size * 0.55), size * 0.08, ENT_CHROME, segments=6)
        model.rounded_box((0.0, 0.0, size * 0.62), (size, size, size * 0.18), size * 0.3, seat)
        model.rounded_box((0.0, size * 0.46, size * 1.0), (size, size * 0.16, size * 0.70), size * 0.08, shell)


def ent_desk(model, center, z: float, size=(0.22, 0.10), turn: float = 0.0, seed: int = 0,
             screen: bool = True, height: float = 0.11) -> None:
    """A slim white desk at *center* on *z*, its user at -y of its *turn*: a carbon side panel at
    each end, a cyan line under its front edge and, with *screen*, a display at its back."""
    width, depth = size
    with model.placed((center[0], center[1], z), turn=turn):
        model.rounded_box((0.0, 0.0, height), (width, depth, 0.012), 0.012, ENT_SMOOTH)
        for side in (-1, 1):
            model.box((side * (width / 2.0 - 0.008), 0.0, height / 2.0), (0.012, depth * 0.8, height), ENT_CARBON)
        light_strip(model, (-width * 0.40, -depth / 2.0 + 0.004, height - 0.010),
                    (width * 0.40, -depth / 2.0 + 0.004, height - 0.010), 0.005)
        if screen:
            model.box((0.0, depth * 0.30, height + 0.03), (0.008, 0.008, 0.05), ENT_GRAPHITE)
            display(model, (0.0, depth * 0.30 - 0.004, height + 0.06), (width * 0.62, width * 0.34), "-y",
                    seed=seed, depth=0.006)


def holo_pad(model, position, z: float, radius: float = 0.08, beam: float | None = None) -> float:
    """A round projector set in the floor at *position* on *z*: a carbon ring, a glowing lens
    and, with *beam* (its height), a thin cyan beam up from it. Returns the pad's top."""
    x, y = position
    model.cylinder((x, y, z), (x, y, z + 0.012), radius, ENT_CARBON, segments=20)
    model.cylinder((x, y, z + 0.012), (x, y, z + 0.018), radius * 0.78, ENT_SMOOTH, segments=20)
    model.cylinder((x, y, z + 0.018), (x, y, z + 0.021), radius * 0.55, ENT_SCREEN, segments=20)
    torus(model, (x, y, z + 0.018), radius * 0.66, 0.004, ENT_LIGHT, segments=20, sides=4)
    if beam:
        model.cylinder((x, y, z + 0.021), (x, y, z + beam), 0.004, ENT_LIGHT, segments=6)
    return z + 0.021


def data_core(model, position, z: float, height: float = 0.26, radius: float = 0.05, discs: int = 5) -> None:
    """A data core at *position* on *z*: a glass tube between white caps, a stack of glowing
    discs on a chrome spindle inside."""
    x, y = position
    model.cylinder((x, y, z), (x, y, z + 0.03), radius + 0.012, ENT_SMOOTH, segments=14)
    model.cylinder((x, y, z + 0.004), (x, y, z + 0.010), radius + 0.014, ENT_LIGHT, segments=14)
    model.cylinder((x, y, z + 0.03), (x, y, z + height - 0.03), radius, _PANE, segments=14)
    model.cylinder((x, y, z + 0.03), (x, y, z + height - 0.03), 0.008, ENT_CHROME, segments=6)
    step = (height - 0.08) / max(1, discs - 1)
    for index in range(discs):
        level = z + 0.05 + index * step
        model.cylinder((x, y, level), (x, y, level + 0.008), radius * 0.78, ENT_LIGHT if index % 2 else ENT_LAMP,
                       segments=14)
    model.cylinder((x, y, z + height - 0.03), (x, y, z + height), radius + 0.012, ENT_SMOOTH, segments=14)
    model.cylinder((x, y, z + height), (x, y, z + height + 0.006), radius * 0.5, ENT_CARBON, segments=10)


def ent_planter(model, center, z: float, size=(0.14, 0.14), height: float = 0.06, seed: int = 0,
                tall: float = 0.14) -> None:
    """A white planter with soft corners and a cyan band, green crowns in it (a shrub, or a slim
    tree when *tall* is larger than the planter)."""
    x, y = center
    width, depth = size
    model.rounded_box((x, y, z + height / 2.0), (width, depth, height), min(width, depth) * 0.25, ENT_SMOOTH)
    model.rounded_box((x, y, z + height * 0.30), (width + 0.003, depth + 0.003, height * 0.12),
                      min(width, depth) * 0.25, ENT_LIGHT)
    model.plate((x, y, z + height + 0.0006), (width * 0.86, depth * 0.86), "+z", "soil")
    if tall > max(width, depth) * 1.3:
        model.cylinder((x, y, z + height), (x, y, z + height + tall * 0.55), 0.008, "wood", segments=5)
        model.lump((x, y, z + height + tall * 0.68), (tall * 0.55, tall * 0.55, tall * 0.55), "plant",
                   seed=seed, rough=0.22)
    else:
        model.lump((x, y, z + height + tall * 0.35), (width * 0.85, depth * 0.85, tall * 0.7), "plant",
                   seed=seed, rough=0.25)


def ent_rocket(model, length: float, radius: float) -> None:
    """An ENTERPRISE_ROCKET lying along +x of the current frame, its tail at x = 0, its nose at
    *length*, on the axis y = z = 0: a white body with a carbon band and a cyan ring, a white
    nose cone with a glowing seeker tip, a graphite nozzle with a cyan glow and four carbon fins
    (in the rocket launcher and as the resource model). The player MISSILE is white with red."""
    r = radius
    model.cylinder((-0.004, 0.0, 0.0), (0.0, 0.0, 0.0), r * 0.42, ENT_LIGHT, segments=10)
    model.cylinder((0.0, 0.0, 0.0), (0.08 * length, 0.0, 0.0), r * 0.55, ENT_GRAPHITE, segments=12, end_radius=r * 0.85)
    model.cylinder((0.08 * length, 0.0, 0.0), (0.74 * length, 0.0, 0.0), r, ENT_SMOOTH, segments=14)
    model.cylinder((0.20 * length, 0.0, 0.0), (0.30 * length, 0.0, 0.0), r * 1.03, ENT_CARBON, segments=14)
    model.cylinder((0.62 * length, 0.0, 0.0), (0.65 * length, 0.0, 0.0), r * 1.05, ENT_LIGHT, segments=14)
    model.cylinder((0.74 * length, 0.0, 0.0), (0.94 * length, 0.0, 0.0), r, ENT_SMOOTH, segments=14, end_radius=r * 0.3)
    model.cylinder((0.94 * length, 0.0, 0.0), (length, 0.0, 0.0), r * 0.3, ENT_LIGHT, segments=10, end_radius=0.0)
    for index in range(4):
        angle = math.pi / 4.0 + index * math.pi / 2.0
        uy, uz = math.cos(angle), math.sin(angle)
        root, tip = r * 0.9, r * 2.0
        model.beam((0.24 * length, uy * root, uz * root), (0.05 * length, uy * tip, uz * tip), r * 0.2, ENT_CARBON)
        model.beam((0.08 * length, uy * root, uz * root), (0.05 * length, uy * tip, uz * tip), r * 0.2, ENT_CARBON)


def ent_nozzle(model, start, end, throat: float, mouth: float, segments: int = 16) -> None:
    """A short enterprise thrust bell from *start* (its throat, set into a housing) to *end* (its
    mouth): a graphite bell flaring from *throat* to *mouth* radius, open, with a chrome heat ring
    round its lip and a cyan plasma glow deep inside. Clustered, they are the drives of the
    enterprise items (no long pods, no glowing front domes: our own look, not a franchise's)."""
    dx, dy, dz = (end[0] - start[0], end[1] - start[1], end[2] - start[2])
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    tilt = math.acos(max(-1.0, min(1.0, dz / length)))
    turn = math.atan2(dx, -dy) if abs(dx) + abs(dy) > 1e-9 else 0.0
    profile = [
        (0.0, 0.0, ENT_GRAPHITE), (throat, 0.0, ENT_GRAPHITE), (mouth * 0.96, length * 0.82, ENT_CHROME),
        (mouth * 1.06, length, ENT_CHROME), (mouth * 0.90, length, ENT_GRAPHITE),
        (throat + (mouth - throat) * 0.45, length * 0.55, ENT_LIGHT), (throat * 0.85, length * 0.25, ENT_LAMP),
        (0.0, length * 0.20),
    ]
    with model.placed(start, turn=turn, tilt=tilt):
        model.revolve((0.0, 0.0, 0.0), profile, ENT_GRAPHITE, segments=segments, sharp=30.0)
