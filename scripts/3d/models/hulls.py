"""Shared shapes of the hull models. A hull is the floor of one grid cell: it fills the whole
cell (1 x 1), so neighbouring hulls join without gaps, and is FLOOR_HEIGHT high; a module
stands on top of it. Not a model script itself (tools/build-models.ps1 skips it).
"""

import kit

# Must match HULL_FLOOR_HEIGHT in game/world/colony_view.gd.
FLOOR_HEIGHT = 0.06
# Height of a shut hull seen from outside; must match HULL_CLOSED_HEIGHT in colony_view.gd.
CLOSED_HEIGHT = 0.56
_HALF = 0.5
_SEAM = 0.004
_ROOF_RIM = 0.025


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


def closed_hull(name: str, wall: str, roof: str, rib: str, trim: str, roof_detail: str):
    """The hull seen from outside (closed structure): a shut container filling its cell up to
    CLOSED_HEIGHT. Neighbouring cells join into one block; a thin seam between them shows the
    container grid. Ribs, a trim band and a roof rim give it its shape; nothing reaches beyond
    the cell, so the shared sides of neighbours stay hidden inside the block."""
    model = kit.Builder(name)
    inner = _HALF - _SEAM
    body = CLOSED_HEIGHT - _ROOF_RIM
    model.box((0.0, 0.0, FLOOR_HEIGHT * 0.5), (1.0, 1.0, FLOOR_HEIGHT), "floor")
    model.box((0.0, 0.0, FLOOR_HEIGHT + (body - FLOOR_HEIGHT) / 2.0),
              (inner * 2.0, inner * 2.0, body - FLOOR_HEIGHT), wall)
    # Vertical ribs on every side (corrugated container walls) and a trim band near the top.
    rib_height = body - FLOOR_HEIGHT - 0.02
    for facing, normal in (("+x", (1, 0)), ("-x", (-1, 0)), ("+y", (0, 1)), ("-y", (0, -1))):
        for offset in (-0.30, -0.10, 0.10, 0.30):
            along = (offset, 0.0) if normal[0] == 0 else (0.0, offset)
            center = (along[0] + normal[0] * (inner + 0.0006), along[1] + normal[1] * (inner + 0.0006),
                      FLOOR_HEIGHT + 0.01 + rib_height / 2.0)
            model.plate(center, (0.05, rib_height), facing, rib)
        band = (normal[0] * (inner + 0.0012), normal[1] * (inner + 0.0012), body - 0.05)
        model.plate(band, (inner * 2.0, 0.025), facing, trim)
    # Roof: a raised rim around each cell, a hatch and a vent box.
    rim = 0.04
    for sign in (-1, 1):
        model.box((0.0, sign * (inner - rim / 2.0), body + _ROOF_RIM / 2.0), (inner * 2.0, rim, _ROOF_RIM), roof)
        model.box((sign * (inner - rim / 2.0), 0.0, body + _ROOF_RIM / 2.0),
                  (rim, inner * 2.0 - 2.0 * rim, _ROOF_RIM), roof)
    model.box((-0.16, -0.12, body + 0.012), (0.28, 0.22, 0.024), roof_detail)
    model.box((0.20, 0.18, body + 0.035), (0.16, 0.16, 0.07), roof)
    model.plate((0.20, 0.18 - 0.08 - 0.0006, body + 0.035), (0.12, 0.04), "-y", "dark")
    return model.finish()


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
