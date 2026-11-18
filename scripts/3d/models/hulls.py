"""Shared shapes of the hull models. A hull is the floor of one grid cell: it fills the whole
cell (1 x 1), so neighbouring hulls join without gaps, and is FLOOR_HEIGHT high; a module
stands on top of it. Not a model script itself (tools/build-models.ps1 skips it).
"""

import kit

# Must match HULL_FLOOR_HEIGHT in game/world/colony_view.gd.
FLOOR_HEIGHT = 0.06
# Height of a shut hull seen from outside; must match HULL_CLOSED_HEIGHT in colony_view.gd.
CLOSED_HEIGHT = 0.72
_HALF = 0.5


def floor_hull(name: str, plate: str, rim: str, accent: str, posts: bool = False):
    """A closed floor plate with a raised rim and, optionally, short posts at the corners."""
    model = kit.Builder(name)
    model.box((0.0, 0.0, FLOOR_HEIGHT * 0.5), (1.0, 1.0, FLOOR_HEIGHT), plate)
    rim_width = 0.05
    for sign in (-1, 1):
        model.box((0.0, sign * (_HALF - rim_width / 2.0), FLOOR_HEIGHT + 0.006),
                  (1.0, rim_width, 0.012), rim)
        model.box((sign * (_HALF - rim_width / 2.0), 0.0, FLOOR_HEIGHT + 0.006),
                  (rim_width, 1.0 - 2.0 * rim_width, 0.012), rim)
    # Weld seams across the plate.
    for offset in (-0.2, 0.2):
        model.plate((offset, 0.0, FLOOR_HEIGHT + 0.0006), (0.008, 0.9), "+z", accent)
    if posts:
        for sx in (-1, 1):
            for sy in (-1, 1):
                model.box((sx * (_HALF - 0.035), sy * (_HALF - 0.035), FLOOR_HEIGHT + 0.03),
                          (0.07, 0.07, 0.06), accent)
    return model.finish()


def container(name: str, wall: str, frame: str, roof: str, *, wear: float = 0.2,
              door: str = "steel_dark", lamp: str = "window", roof_strip: str | None = None,
              post_strip: str | None = None, hazard: bool = False, braces: str | None = None,
              windows: bool = False, glass: bool = False, dots: str | None = None):
    """The hull seen from outside (closed structure), after the V1 hull sprites: a cube with
    heavy corner posts and a frame along its edges, walls set back between them, a roof plate
    with a hatch, a door on one side and a vent on another. Neighbours stand side by side like
    stacked containers; nothing reaches beyond the cell. Hulls are cleaner than industry
    (low *wear*, Rudi 2026-11-18).

    Options: light strips on the roof frame (*roof_strip*) and up the posts (*post_strip*),
    yellow-black hazard stripes on the frame, star-shaped *braces* on the walls, a large
    window per side (*windows*) or walls and roof all of glass (*glass*), small lamps (*dots*).
    Behind glass stand fixed props, never the modules."""
    model = kit.Builder(name, wear=wear)
    top = CLOSED_HEIGHT
    bottom = FLOOR_HEIGHT
    post = _POST
    beam = _BEAM
    span = 1.0 - 4.0 * post  # wall length between the posts
    model.box((0.0, 0.0, bottom / 2.0), (1.0, 1.0, bottom), "floor")
    for sx in (-1, 1):
        for sy in (-1, 1):
            model.box((sx * (_EDGE - post), sy * (_EDGE - post), (bottom + top) / 2.0),
                      (2.0 * post, 2.0 * post, top - bottom), frame)
    for level in (bottom + beam / 2.0, top - beam / 2.0):
        for sign in (-1, 1):
            model.box((0.0, sign * (_EDGE - beam / 2.0), level), (span, beam, beam), frame)
            model.box((sign * (_EDGE - beam / 2.0), 0.0, level), (beam, span, beam), frame)

    see_through = windows or glass
    for side in _SIDES:
        if glass:
            _wall(model, side, wall, opening=(2.0 * (_HALF - 2.0 * post), top - bottom - 2.0 * beam), pane=True)
            _mullion(model, side, frame)
        elif windows:
            _wall(model, side, wall, opening=(0.40, 0.26), pane=True)
        else:
            _wall(model, side, wall)
        if braces and not see_through:
            _braces(model, side, braces)
    # Doors and vents only on plain walls (as in V1: none on braced, windowed or glass hulls).
    if not see_through and not braces:
        _door(model, "-y", door, lamp)
        _vent(model, "+x")
    # Roof: glass between the frame beams, or a plate with an inset panel and a hatch.
    inner = _HALF - beam
    if glass:
        model.plate((0.0, 0.0, top - 0.012), (2.0 * inner, 2.0 * inner), "+z", kit.PANE)
        model.box((0.0, 0.0, top - beam / 2.0), (2.0 * inner, 0.035, beam * 0.7), frame)
        model.box((0.0, 0.0, top - beam / 2.0), (0.035, 2.0 * inner, beam * 0.7), frame)
    else:
        model.box((0.0, 0.0, top - 0.02), (2.0 * inner, 2.0 * inner, 0.04), roof)
        model.plate((0.0, 0.0, top + 0.0006), (0.52, 0.52), "+z", frame)
        model.plate((0.0, 0.0, top + 0.0012), (0.48, 0.48), "+z", roof)
        model.box((0.0, 0.0, top + 0.012), (0.16, 0.16, 0.024), frame)
        model.plate((0.0, 0.0, top + 0.0246), (0.10, 0.10), "+z", roof)
    if roof_strip:
        for sign in (-1, 1):
            model.plate((0.0, sign * (_EDGE - beam / 2.0), top + 0.0006), (span * 0.8, 0.012), "+z", roof_strip)
            model.plate((sign * (_EDGE - beam / 2.0), 0.0, top + 0.0006), (0.012, span * 0.8), "+z", roof_strip)
    if post_strip:
        for side in _SIDES:
            for along in (-1, 1):
                center = _on_side(side, along * (_EDGE - post), (bottom + top) / 2.0, _EDGE + _HAIR)
                model.plate(center, (0.014, (top - bottom) * 0.55), side, post_strip)
    if hazard:
        _hazard(model, top, bottom)
    if dots:
        for side in _SIDES:
            for along in (-0.30, 0.30):
                model.plate(_on_side(side, along, top - beam - 0.03, _WALL + 2.0 * _HAIR), (0.025, 0.012),
                            side, dots)
    if see_through:
        _props(model, glass)
    return model.finish()


# Sides of a cell, looking outwards.
_SIDES = ("+x", "-x", "+y", "-y")
_POST = 0.045       # half width of a corner post
_BEAM = 0.06        # thickness of the frame beams
_WALL = 0.47        # outer surface of the walls (set back behind posts and frame)
_THICK = 0.03       # wall thickness
_HAIR = 0.0006
_EDGE = 0.497       # outer surface of posts and frame, a little inside the cell


def _on_side(side: str, along: float, z: float, out: float) -> tuple:
    """A point on a side of the cell: *along* the side, at height *z*, *out* from the middle."""
    return {"+x": (out, along, z), "-x": (-out, -along, z),
            "+y": (-along, out, z), "-y": (along, -out, z)}[side]


def _slab(model, side: str, along: tuple, height: tuple, color: str, depth: float = _THICK,
          out: float = _WALL) -> None:
    """A wall piece on a side: from along[0] to along[1], from height[0] to height[1]."""
    middle = _on_side(side, (along[0] + along[1]) / 2.0, (height[0] + height[1]) / 2.0, out - depth / 2.0)
    length, tall = abs(along[1] - along[0]), height[1] - height[0]
    size = (depth, length, tall) if side in ("+x", "-x") else (length, depth, tall)
    model.box(middle, size, color)


def _wall(model, side: str, color: str, opening=None, pane: bool = False) -> None:
    """The wall of a side between the posts; *opening* (width, height) leaves a hole in its
    middle, filled with glass when *pane*."""
    half = _HALF - 2.0 * _POST
    bottom, top = FLOOR_HEIGHT, CLOSED_HEIGHT
    if opening is None:
        _slab(model, side, (-half, half), (bottom, top), color)
        return
    width, tall = opening
    middle = (bottom + top) / 2.0
    low, high = middle - tall / 2.0, middle + tall / 2.0
    if width < 2.0 * half - 1e-6:
        _slab(model, side, (-half, -width / 2.0), (bottom, top), color)
        _slab(model, side, (width / 2.0, half), (bottom, top), color)
    if low > bottom + 1e-6:
        _slab(model, side, (-width / 2.0, width / 2.0), (bottom, low), color)
        _slab(model, side, (-width / 2.0, width / 2.0), (high, top), color)
    if pane:
        model.plate(_on_side(side, 0.0, middle, _WALL - _THICK / 2.0), (width, tall), side, kit.PANE)
        if width < 2.0 * half - 1e-6:
            # A frame around the window.
            for z in (low, high):
                _slab(model, side, (-width / 2.0 - 0.015, width / 2.0 + 0.015), (z - 0.015, z + 0.015),
                      "steel_dark", depth=0.012, out=_WALL + 0.012)
            for edge in (-width / 2.0, width / 2.0):
                _slab(model, side, (edge - 0.015, edge + 0.015), (low, high), "steel_dark", depth=0.012,
                      out=_WALL + 0.012)


def _mullion(model, side: str, color: str) -> None:
    """Two upright bars in a glass wall."""
    for along in (-0.14, 0.14):
        _slab(model, side, (along - 0.018, along + 0.018), (FLOOR_HEIGHT, CLOSED_HEIGHT), color,
              depth=0.035, out=_WALL + 0.005)


def _door(model, side: str, color: str, lamp: str) -> None:
    """A double door with a lamp above it."""
    width, tall = 0.30, 0.40
    bottom = FLOOR_HEIGHT + 0.01
    out = _WALL + _HAIR
    for leaf in (-1, 1):
        model.plate(_on_side(side, leaf * (width / 4.0 + 0.004), bottom + tall / 2.0, out),
                    (width / 2.0 - 0.008, tall), side, color)
    model.plate(_on_side(side, 0.0, bottom + tall / 2.0, out + _HAIR), (0.012, 0.05), side, "steel_light")
    model.plate(_on_side(side, 0.0, bottom + tall + 0.035, out), (0.07, 0.025), side, lamp)


def _vent(model, side: str) -> None:
    """A vent grille and a small sign panel."""
    out = _WALL + _HAIR
    model.plate(_on_side(side, -0.14, 0.42, out), (0.18, 0.12), side, "dark")
    for index in range(4):
        model.plate(_on_side(side, -0.14, 0.375 + index * 0.03, out + _HAIR), (0.17, 0.008), side, "steel_dark")
    model.plate(_on_side(side, 0.17, 0.30, out), (0.12, 0.08), side, "steel_light")


def _braces(model, side: str, color: str) -> None:
    """A star of bars on a wall (pressurized hull)."""
    half = _HALF - 2.0 * _POST - 0.03
    middle = (FLOOR_HEIGHT + CLOSED_HEIGHT) / 2.0
    reach = (CLOSED_HEIGHT - FLOOR_HEIGHT) / 2.0 - 0.07
    out = _WALL + 0.008
    for start, end in (((-half, -reach), (half, reach)), ((-half, reach), (half, -reach)),
                       ((0.0, -reach), (0.0, reach)), ((-half, 0.0), (half, 0.0))):
        model.beam(_on_side(side, start[0], middle + start[1], out),
                   _on_side(side, end[0], middle + end[1], out), 0.022, color)
    model.cylinder(_on_side(side, 0.0, middle, _WALL), _on_side(side, 0.0, middle, out + 0.012), 0.035,
                   color, segments=8)


def _hazard(model, top: float, bottom: float) -> None:
    """Yellow and black stripes along the top frame and up the posts (composite hull)."""
    count = 7
    span = 1.0 - 4.0 * _POST
    for side in _SIDES:
        for index in range(0, count, 2):
            along = -span / 2.0 + (index + 0.5) * span / count
            model.plate(_on_side(side, along, top - _BEAM / 2.0, _EDGE + _HAIR), (span / count, _BEAM * 0.8),
                        side, "yellow")
        for index in range(0, 5, 2):
            z = bottom + (index + 0.5) * (top - bottom) / 5.0
            for along in (-1, 1):
                model.plate(_on_side(side, along * (_EDGE - _POST), z, _EDGE + _HAIR),
                            (2.0 * _POST * 0.8, (top - bottom) / 5.0), side, "yellow")


def _props(model, glass: bool) -> None:
    """Fixed props seen through the glass (never the modules): a shelf with crates, a barrel,
    a box, plants in pots and a ceiling lamp."""
    floor = FLOOR_HEIGHT
    model.box((-0.22, 0.24, floor + 0.17), (0.34, 0.12, 0.34), "steel_dark")
    for z in (floor + 0.06, floor + 0.18, floor + 0.30):
        model.box((-0.22, 0.24, z), (0.34, 0.13, 0.012), "steel")
    model.box((-0.30, 0.22, floor + 0.10), (0.10, 0.08, 0.07), "yellow")
    model.box((-0.16, 0.23, floor + 0.22), (0.09, 0.08, 0.07), "red")
    model.cylinder((0.24, 0.20, floor), (0.24, 0.20, floor + 0.14), 0.05, "steel", segments=8)
    model.box((0.10, -0.18, floor + 0.05), (0.14, 0.12, 0.10), "yellow")
    pots = ((-0.22, -0.20), (0.26, -0.22)) if glass else ((0.26, -0.22),)
    for x, y in pots:
        model.cylinder((x, y, floor), (x, y, floor + 0.07), 0.045, "concrete_dark", segments=8)
        model.cylinder((x, y, floor + 0.07), (x, y, floor + 0.24), 0.07, "plant", segments=6, end_radius=0.0)
    model.plate((0.0, 0.0, CLOSED_HEIGHT - 0.045), (0.20, 0.05), "-z", "window")


def grating_hull(name: str, frame: str, bars: str, count: int = 9):
    """An open platform: a frame around the cell and a grating of bars on supports."""
    model = kit.Builder(name)
    frame_width = 0.06
    for sign in (-1, 1):
        model.box((0.0, sign * (_HALF - frame_width / 2.0), FLOOR_HEIGHT * 0.5),
                  (1.0, frame_width, FLOOR_HEIGHT), frame)
        model.box((sign * (_HALF - frame_width / 2.0), 0.0, FLOOR_HEIGHT * 0.5),
                  (frame_width, 1.0 - 2.0 * frame_width, FLOOR_HEIGHT), frame)
    model.box((0.0, 0.0, FLOOR_HEIGHT * 0.25), (1.0 - 2.0 * frame_width, 1.0 - 2.0 * frame_width,
              FLOOR_HEIGHT * 0.5), "dark")
    inner = 1.0 - 2.0 * frame_width
    for index in range(count):
        x = -inner / 2.0 + (index + 0.5) * inner / count
        model.box((x, 0.0, FLOOR_HEIGHT * 0.75), (inner / count * 0.55, inner, FLOOR_HEIGHT * 0.5), bars)
    return model
