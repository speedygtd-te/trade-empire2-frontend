"""Shared shapes of the hull models. A hull is the floor of one grid cell: it fills the whole
cell (1 x 1), so neighbouring hulls join without gaps, and is FLOOR_HEIGHT high; a module
stands on top of it. Not a model script itself (tools/build-models.ps1 skips it).
"""

import kit

# Must match HULL_FLOOR_HEIGHT in game/world/colony_view.gd.
FLOOR_HEIGHT = 0.06
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
