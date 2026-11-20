"""Shared shapes of the hull models. A hull is the floor of one grid cell: it fills the whole
cell (1 x 1), so neighbouring hulls join without gaps, and is FLOOR_HEIGHT high; a module
stands on top of it. Not a model script itself (tools/build-models.ps1 skips it).
"""

import math

import kit
import parts

# Must match HULL_FLOOR_HEIGHT in game/world/colony_view.gd.
FLOOR_HEIGHT = 0.06
# Height of a shut hull seen from outside; must match HULL_CLOSED_HEIGHT in colony_view.gd.
CLOSED_HEIGHT = 0.72
# Lamps per top edge of a shut container.
EDGE_LAMPS = 3
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
                # A lamp set into the top of every post.
                model.plate((sx * (_HALF - 0.035), sy * (_HALF - 0.035), FLOOR_HEIGHT + 0.06 + _HAIR),
                            (0.036, 0.036), "+z", parts.LAMP)
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
    # Small warm lamps along the top edges, the same on every container (Rudi 2026-11-19: hulls
    # were too dark at night).
    parts.edge_lamps(model, _EDGE, top, count=EDGE_LAMPS, size=(0.05, 0.016))
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


# --- Enterprise hulls ---------------------------------------------------------------------------
# The clean enterprise look (kit style "enterprise", parts.ENT_*): white, light grey, carbon and
# glass with cyan light. Floors meet their neighbours in a fine graphite seam with a cyan point
# where four cells meet; containers have round white corner posts.

def _corner_dots(model, z: float, color: str = parts.ENT_LIGHT, size: float = 0.014) -> None:
    """A quarter of a glowing point in every corner of the cell: four neighbours make one."""
    for sx in (-1, 1):
        for sy in (-1, 1):
            model.plate((sx * (_HALF - size / 2.0), sy * (_HALF - size / 2.0), z + 2.0 * _HAIR), (size, size), "+z",
                        color)


def _seams(model, z: float, width: float = 0.006, color: str = parts.ENT_GRAPHITE) -> None:
    """A thin seam along the four edges of the cell's top at *z* (two neighbours make one)."""
    for sign in (-1, 1):
        model.plate((0.0, sign * (_HALF - width / 2.0), z + _HAIR), (1.0, width), "+z", color)
        model.plate((sign * (_HALF - width / 2.0), 0.0, z + _HAIR), (width, 1.0), "+z", color)


def enterprise_floor(name: str, kind: str = "standard"):
    """The open floor of an enterprise hull, FLOOR_HEIGHT high on a carbon edge: light tiles
    (standard), tiles round a dark glass panel framed in cyan (glass), light grey armour plates
    in a carbon border with white corner blocks (armored)."""
    model = kit.Builder(name, style="enterprise")
    height = FLOOR_HEIGHT
    model.box((0.0, 0.0, height * 0.3), (1.0, 1.0, height * 0.6), parts.ENT_CARBON)
    top = height
    if kind == "armored":
        model.box((0.0, 0.0, height * 0.8), (1.0, 1.0, height * 0.4), parts.ENT_CARBON)
        model.rounded_box((0.0, 0.0, height * 0.8 + 0.004), (0.90, 0.90, height * 0.4 + 0.008), 0.03,
                          parts.ENT_GREY)
        top = height + 0.008
        for sx in (-1, 1):
            for sy in (-1, 1):
                model.rounded_box((sx * 0.462, sy * 0.462, height + 0.01), (0.065, 0.065, 0.012), 0.02,
                                  parts.ENT_SMOOTH)
        for sign in (-1, 1):
            model.plate((0.0, sign * 0.43, top + _HAIR), (0.5, 0.008), "+z", parts.ENT_LIGHT)
            model.plate((sign * 0.43, 0.0, top + _HAIR), (0.008, 0.5), "+z", parts.ENT_LIGHT)
        _corner_dots(model, height + 0.016)
        return model.finish()
    model.box((0.0, 0.0, height * 0.8), (1.0, 1.0, height * 0.4), parts.ENT_FLOOR)
    _seams(model, top)
    if kind == "glass":
        model.plate((0.0, 0.0, top + 2.0 * _HAIR), (0.62, 0.62), "+z", "ent_glassfloor")
        for sign in (-1, 1):
            model.plate((0.0, sign * 0.315, top + 3.0 * _HAIR), (0.64, 0.010), "+z", parts.ENT_LIGHT)
            model.plate((sign * 0.315, 0.0, top + 3.0 * _HAIR), (0.010, 0.64), "+z", parts.ENT_LIGHT)
    _corner_dots(model, top)
    return model.finish()


def enterprise_platform(name: str, armored: bool = False):
    """An open enterprise deck for outdoor modules: a white frame round carbon slats over a dark
    gap (armored: a heavier light grey frame round four grey armour plates on carbon), cyan
    marks and chrome tie-down points."""
    model = kit.Builder(name, style="enterprise")
    height = FLOOR_HEIGHT
    rim = 0.075 if armored else 0.05
    frame = parts.ENT_GREY if armored else parts.ENT_SMOOTH
    for sign in (-1, 1):
        model.box((0.0, sign * (_HALF - rim / 2.0), height / 2.0), (1.0, rim, height), frame)
        model.box((sign * (_HALF - rim / 2.0), 0.0, height / 2.0), (rim, 1.0 - 2.0 * rim, height), frame)
    inner = 1.0 - 2.0 * rim
    model.box((0.0, 0.0, height * 0.25), (inner, inner, height * 0.5), parts.ENT_GRAPHITE)
    if armored:
        model.box((0.0, 0.0, height * 0.6), (inner, inner, height * 0.2), parts.ENT_CARBON)
        tile = inner / 2.0 - 0.02
        for sx in (-1, 1):
            for sy in (-1, 1):
                model.rounded_box((sx * inner / 4.0, sy * inner / 4.0, height * 0.85), (tile, tile, height * 0.3),
                                  0.03, parts.ENT_GREY)
        model.plate((0.0, 0.0, height * 0.7 + _HAIR), (inner, 0.012), "+z", parts.ENT_LIGHT)
        model.plate((0.0, 0.0, height * 0.7 + _HAIR), (0.012, inner), "+z", parts.ENT_LIGHT)
    else:
        count = 7
        for index in range(count):
            x = -inner / 2.0 + (index + 0.5) * inner / count
            model.box((x, 0.0, height * 0.75), (inner / count * 0.7, inner, height * 0.5), parts.ENT_CARBON)
    for sx in (-1, 1):
        for sy in (-1, 1):
            corner = _HALF - rim / 2.0
            model.plate((sx * corner, sy * corner, height + _HAIR), (rim * 0.5, rim * 0.5), "+z", parts.ENT_LIGHT)
            eye = _HALF - rim - 0.05
            model.cylinder((sx * eye, sy * eye, height * (0.9 if armored else 1.0)),
                           (sx * eye, sy * eye, height + 0.014), 0.016, parts.ENT_CHROME, segments=8)
    for sign in (-1, 1):
        model.plate((0.0, sign * (_HALF - rim / 2.0), height + _HAIR), (0.30, 0.008), "+z", parts.ENT_LIGHT)
        model.plate((sign * (_HALF - rim / 2.0), 0.0, height + _HAIR), (0.008, 0.30), "+z", parts.ENT_LIGHT)
    return model.finish()


def enterprise_dock(name: str):
    """The enterprise dock: a white pad on a carbon edge with a glowing cyan landing ring, four
    chevrons pointing in, cyan landing lights along its edges."""
    model = kit.Builder(name, style="enterprise")
    height = FLOOR_HEIGHT
    model.box((0.0, 0.0, height * 0.3), (1.0, 1.0, height * 0.6), parts.ENT_CARBON)
    model.box((0.0, 0.0, height * 0.8), (1.0, 1.0, height * 0.4), parts.ENT_GREY)
    top = height
    _seams(model, top, width=0.012)
    parts.torus(model, (0.0, 0.0, top + 0.001), 0.30, 0.008, parts.ENT_LIGHT, segments=32, sides=4)
    model.cylinder((0.0, 0.0, top - 0.002), (0.0, 0.0, top + 0.002), 0.27, parts.ENT_GREY, segments=32)
    model.cylinder((0.0, 0.0, top), (0.0, 0.0, top + 0.004), 0.05, parts.ENT_GRAPHITE, segments=16)
    for quarter in range(4):
        with model.placed((0.0, 0.0, top + _HAIR), turn=quarter * math.pi / 2.0):
            for side in (-1, 1):
                model.box((side * 0.03, -0.40, 0.0015), (0.07, 0.014, 0.003), parts.ENT_LIGHT, turn=side * 0.7)
    parts.edge_lamps(model, 0.5, height, count=3, size=(0.035, 0.014), margin=0.1, face=False,
                     color=parts.ENT_LAMP)
    return model.finish()


def enterprise_container(name: str, kind: str = "standard"):
    """An enterprise hull seen from outside (closed structure): round white corner posts and a
    white top frame with a cyan line, on a carbon foot.
    standard: white panelled walls with a dark ribbon window (lit at night) over a cyan line,
    a sliding door, a roof with a soft-cornered service module.
    glass: walls and roof of glass between slim white posts, sills with cyan lines; clean props
    behind the glass (never the modules).
    armored: heavier light grey posts and armour panels on carbon, a narrow slot window, no
    door; still clean."""
    model = kit.Builder(name, style="enterprise")
    top, bottom = CLOSED_HEIGHT, FLOOR_HEIGHT
    armored = kind == "armored"
    glass = kind == "glass"
    post = 0.06 if armored else 0.05
    shell = parts.ENT_GREY if armored else parts.ENT_WHITE
    model.box((0.0, 0.0, bottom / 2.0), (1.0, 1.0, bottom), parts.ENT_CARBON)
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.corner_post(model, (sx * (_EDGE - post), sy * (_EDGE - post)), bottom, top, radius=post, segments=2,
                              outward=None if armored else (sx, sy), color=parts.ENT_SMOOTH if glass else shell)
    beam = 0.05
    span = 2.0 * (_EDGE - 2.0 * post)
    for sign in (-1, 1):
        model.box((0.0, sign * (_EDGE - beam / 2.0), top - beam / 2.0), (span, beam, beam), parts.ENT_SMOOTH)
        model.box((sign * (_EDGE - beam / 2.0), 0.0, top - beam / 2.0), (beam, span, beam), parts.ENT_SMOOTH)
        model.box((0.0, sign * (_EDGE - 0.02), bottom + 0.02), (span, 0.04, 0.04), parts.ENT_CARBON)
        model.box((sign * (_EDGE - 0.02), 0.0, bottom + 0.02), (0.04, span, 0.04), parts.ENT_CARBON)
        # The cyan line along the top frame, seen from the side and from above.
        model.plate((0.0, sign * (_EDGE - beam / 2.0), top + _HAIR), (span * 0.9, 0.018), "+z", parts.ENT_LIGHT)
        model.plate((sign * (_EDGE - beam / 2.0), 0.0, top + _HAIR), (0.018, span * 0.9), "+z", parts.ENT_LIGHT)
    low, high = bottom + 0.04, top - beam
    half = span / 2.0
    for side in _SIDES:
        if glass:
            model.plate(_on_side(side, 0.0, (low + high) / 2.0, _WALL - 0.01), (span, high - low), side, kit.PANE)
            _slab(model, side, (-half, half), (low, low + 0.035), parts.ENT_SMOOTH, depth=0.05, out=_EDGE)
            model.plate(_on_side(side, 0.0, low + 0.024, _EDGE + _HAIR), (span * 0.9, 0.008), side, parts.ENT_LIGHT)
            _slab(model, side, (-0.012, 0.012), (low + 0.035, high), parts.ENT_GRAPHITE, depth=0.02, out=_WALL)
        elif armored:
            _slab(model, side, (-half, half), (low, high), parts.ENT_CARBON)
            for z0, z1 in ((low + 0.02, 0.40), (0.47, high - 0.02)):
                for a0, a1 in ((-half + 0.02, -0.01), (0.01, half - 0.02)):
                    _slab(model, side, (a0, a1), (z0, z1), parts.ENT_GREY, depth=0.016, out=_WALL + 0.016)
            model.plate(_on_side(side, 0.0, 0.435, _WALL + _HAIR), (span * 0.7, 0.03), side, parts.ENT_WINDOW)
            model.plate(_on_side(side, 0.0, 0.412, _WALL + 2.0 * _HAIR), (span * 0.7, 0.008), side,
                        parts.ENT_LIGHT)
        else:
            _slab(model, side, (-half, half), (low, 0.40), shell)
            _slab(model, side, (-half, half), (0.40, 0.54), parts.ENT_WINDOW, depth=0.02, out=_WALL - 0.01)
            _slab(model, side, (-half, half), (0.54, high), shell)
            model.plate(_on_side(side, 0.0, 0.393, _WALL + _HAIR), (span, 0.010), side, parts.ENT_LIGHT)
    if not glass and not armored:
        # A sliding door: a graphite leaf pair outlined in cyan.
        out = _WALL + _HAIR
        model.plate(_on_side("-y", 0.0, low + 0.15, out), (0.24, 0.30), "-y", parts.ENT_LIGHT)
        model.plate(_on_side("-y", 0.0, low + 0.145, out + _HAIR), (0.22, 0.29), "-y", parts.ENT_GRAPHITE)
        model.plate(_on_side("-y", 0.0, low + 0.145, out + 2.0 * _HAIR), (0.006, 0.29), "-y", parts.ENT_CARBON)
    inner = _EDGE - beam
    if glass:
        model.plate((0.0, 0.0, top - 0.012), (2.0 * inner, 2.0 * inner), "+z", kit.PANE)
        model.box((0.0, 0.0, top - beam / 2.0), (2.0 * inner, 0.03, beam * 0.5), parts.ENT_SMOOTH)
        model.box((0.0, 0.0, top - beam / 2.0), (0.03, 2.0 * inner, beam * 0.5), parts.ENT_SMOOTH)
        _enterprise_props(model)
    else:
        model.box((0.0, 0.0, top - 0.02), (2.0 * inner, 2.0 * inner, 0.04), parts.ENT_GREY)
        if armored:
            model.rounded_box((0.0, 0.0, top + 0.012), (0.44, 0.44, 0.024), 0.06, parts.ENT_CARBON, segments=2)
            model.rounded_box((0.0, 0.0, top + 0.03), (0.30, 0.30, 0.012), 0.05, parts.ENT_GREY, segments=2)
        else:
            model.rounded_box((0.0, 0.0, top + 0.014), (0.36, 0.36, 0.028), 0.07, parts.ENT_SMOOTH, segments=2)
            model.rounded_box((0.0, 0.0, top + 0.03), (0.22, 0.22, 0.006), 0.05, parts.ENT_GRAPHITE, segments=2)
            model.plate((0.0, 0.0, top + 0.033 + _HAIR), (0.12, 0.012), "+z", parts.ENT_LIGHT)
    parts.edge_lamps(model, _EDGE, top, count=2, size=(0.05, 0.014), color=parts.ENT_LAMP, top=False)
    return model.finish()


def _enterprise_props(model) -> None:
    """Fixed props seen through an enterprise glass hull (never the modules): a white bench, a
    round table, two planters, a display on a stand and a ring lamp under the roof."""
    floor = FLOOR_HEIGHT
    model.box((0.0, 0.0, floor + 0.002), (0.86, 0.86, 0.004), parts.ENT_FLOOR)
    floor += 0.004
    model.rounded_box((-0.20, 0.27, floor + 0.04), (0.34, 0.10, 0.03), 0.03, parts.ENT_SMOOTH)
    model.rounded_box((-0.20, 0.27, floor + 0.015), (0.30, 0.06, 0.03), 0.02, parts.ENT_CARBON)
    model.cylinder((0.12, -0.05, floor), (0.12, -0.05, floor + 0.09), 0.015, parts.ENT_CHROME, segments=8)
    model.cylinder((0.12, -0.05, floor + 0.09), (0.12, -0.05, floor + 0.10), 0.09, parts.ENT_SMOOTH, segments=16)
    for x, y in ((0.27, 0.27), (-0.27, -0.25)):
        model.cylinder((x, y, floor), (x, y, floor + 0.08), 0.055, parts.ENT_SMOOTH, segments=12)
        model.lump((x, y, floor + 0.13), (0.13, 0.13, 0.14), "plant", seed=int(x * 100), rough=0.2)
    model.box((-0.24, -0.02, floor + 0.10), (0.012, 0.012, 0.20), parts.ENT_GRAPHITE)
    parts.display(model, (-0.24, -0.026, floor + 0.20), (0.16, 0.10), "-y", seed=3, depth=0.008)
    parts.torus(model, (0.0, 0.0, CLOSED_HEIGHT - 0.06), 0.12, 0.008, parts.ENT_LAMP, segments=16, sides=4)
