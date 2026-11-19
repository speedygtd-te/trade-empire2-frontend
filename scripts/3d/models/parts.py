"""Reusable parts for the models in this folder. Every function adds geometry to a kit.Builder.

Sizes are in grid cells, up is Z, the front of a module is -Y (the side the game camera looks
at, together with +X). A change here changes every model that uses the part.
"""

import math

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


def torus(model, center, major: float, minor: float, color: str, segments: int = 20,
          sides: int = 8) -> None:
    """A ring lying in the XY plane of the current frame around *center*."""
    profile = [(major + minor * math.cos(2.0 * math.pi * k / sides), minor * math.sin(2.0 * math.pi * k / sides))
               for k in range(sides)]
    model.revolve(center, profile, color, segments=segments, closed=True, sharp=80.0)


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
