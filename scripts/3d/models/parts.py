"""Reusable parts for the models in this folder. Every function adds geometry to a kit.Builder.

Sizes are in grid cells, up is Z, the front of a module is -Y (the side the game camera looks
at, together with +X). A change here changes every model that uses the part.
"""

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
