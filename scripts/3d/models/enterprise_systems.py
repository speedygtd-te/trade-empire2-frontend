"""The enterprise habitats, drives, weapons, protection and running gear
(Backend-V2/docs/SPEC-enterprise-flaggschiff.md 5.2) in the clean enterprise look of enterprise.py:
kit style "enterprise", only the parts.ENT_* colours, the enterprise parts of parts.py. Each one
does what its player counterpart does and reads the same at a glance (a bunk room, a turret with
an emitter, a launcher, a shield emitter, hex armour, wheels, tracks), but white, carbon, glass
and cyan light instead of steel, rust and grime. The habitats rise from a plain bunk room (T1) to
a glass penthouse with a pool (T5); T3 is in enterprise.py. File names are the lower-case type
keys (enterprise_warp_drive.glb).

  blender --background --factory-startup --python scripts/3d/models/enterprise_systems.py -- \
      --output-dir game/world/models [--only enterprise_laser,enterprise_armor]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

STYLE = "enterprise"
HALF_2 = 0.93
WHITE, SMOOTH, GREY = parts.ENT_WHITE, parts.ENT_SMOOTH, parts.ENT_GREY
CARBON, GRAPHITE, CHROME = parts.ENT_CARBON, parts.ENT_GRAPHITE, parts.ENT_CHROME
LIGHT, LAMP, SCREEN = parts.ENT_LIGHT, parts.ENT_LAMP, parts.ENT_SCREEN
FABRIC = "ent_fabric"


def _ring(model, center, radius: float, tube: float, color: str = LIGHT, segments: int = 24) -> None:
    parts.torus(model, center, radius, tube, color, segments=segments, sides=4)


def _sphere(model, center, radius: float, color: str, rings: int = 6, segments: int = 12) -> None:
    profile = [(radius * math.sin(math.pi * k / rings), -radius * math.cos(math.pi * k / rings))
               for k in range(rings + 1)]
    model.revolve(center, profile, color, segments=segments)


def _prism(model, center, radius: float, height: float, color: str, sides: int = 6, turn: float = 0.0) -> None:
    """An upright prism of *sides* (a hexagon stays a hexagon in the high-detail build, unlike a
    cylinder), standing on *center*."""
    with model.placed(center, turn=turn):
        model.revolve((0.0, 0.0, 0.0), [(0.0, 0.0), (radius, 0.0), (radius, height), (0.0, height)], color,
                      segments=sides, sharp=20.0)


# --- Habitats -------------------------------------------------------------------------------

def _bed(model, center, z: float, width: float, length: float, blanket: str = FABRIC, turn: float = 0.0,
         pillows: int = 1, frame: str = SMOOTH) -> None:
    """A bed whose head is at +y of *turn*: a carbon foot, a white frame, a mattress, a blanket
    over the lower part and *pillows* at the head."""
    with model.placed((center[0], center[1], z), turn=turn):
        model.rounded_box((0.0, 0.0, 0.005), (width - 0.02, length - 0.02, 0.01), 0.02, CARBON)
        model.rounded_box((0.0, 0.0, 0.035), (width, length, 0.05), 0.025, frame)
        model.rounded_box((0.0, 0.0, 0.07), (width - 0.02, length - 0.02, 0.025), 0.025, SMOOTH)
        model.rounded_box((0.0, -length * 0.13, 0.087), (width - 0.012, length * 0.72, 0.012), 0.02, blanket)
        for index in range(pillows):
            x = (index - (pillows - 1) / 2.0) * (width / pillows)
            model.rounded_box((x, length / 2.0 - 0.045, 0.092), (width / pillows - 0.03, 0.05, 0.02), 0.015,
                              SMOOTH)


def _bunk(model, center, z: float, width: float, length: float, turn: float, blanket: str) -> None:
    """Two beds one above the other between four graphite posts, a cyan reading light under the
    upper one and a ladder at its foot."""
    _bed(model, center, z, width, length, blanket, turn)
    _bed(model, center, z + 0.15, width, length, blanket, turn)
    with model.placed((center[0], center[1], z), turn=turn):
        for sx in (-1, 1):
            for sy in (-1, 1):
                model.box((sx * (width / 2.0 - 0.009), sy * (length / 2.0 - 0.009), 0.135), (0.016, 0.016, 0.27),
                          GRAPHITE)
        parts.light_strip(model, (-width / 2.0 + 0.02, length / 2.0 - 0.07, 0.143),
                          (width / 2.0 - 0.02, length / 2.0 - 0.07, 0.143), 0.008)
        for rung in range(3):
            model.box((width / 2.0 - 0.009, -length / 2.0 + 0.06, 0.08 + rung * 0.06), (0.012, 0.09, 0.008), CHROME)


def _plant(model, position, z: float, height: float = 0.12, seed: int = 7, pot: float = 0.045) -> None:
    """A plant in a white pot with a cyan ring."""
    x, y = position
    model.cylinder((x, y, z), (x, y, z + 0.07), pot, SMOOTH, segments=12, end_radius=pot * 0.85)
    model.cylinder((x, y, z + 0.02), (x, y, z + 0.028), pot * 1.02, LIGHT, segments=12)
    model.lump((x, y, z + 0.06 + height / 2.0), (height * 0.9, height * 0.9, height), "plant", seed=seed, rough=0.2)


def _round_table(model, position, z: float, radius: float = 0.06, height: float = 0.07,
                 top: str = SMOOTH) -> None:
    x, y = position
    model.cylinder((x, y, z), (x, y, z + 0.008), radius * 0.6, CARBON, segments=12)
    model.cylinder((x, y, z), (x, y, z + height), 0.008, CHROME, segments=8)
    model.cylinder((x, y, z + height), (x, y, z + height + 0.01), radius, top, segments=16)


def _chair(model, position, z: float, turn: float = 0.0, color: str = GRAPHITE) -> None:
    """A small chair facing -y of *turn*."""
    with model.placed((position[0], position[1], z), turn=turn):
        model.cylinder((0.0, 0.0, 0.0), (0.0, 0.0, 0.035), 0.008, CHROME, segments=6)
        model.rounded_box((0.0, 0.0, 0.042), (0.06, 0.06, 0.016), 0.015, color)
        model.rounded_box((0.0, 0.026, 0.075), (0.06, 0.012, 0.055), 0.006, color)


def habitat_t1():
    """The crew dormitory: closed white walls without glass, two bunk beds with grey blankets,
    a pair of lockers and a small table with two stools. Plain, but clean and lit."""
    model = kit.Builder("te_enterprise_habitat_t1", style=STYLE)
    top = parts.ent_room(model, 0.42, height=0.40, glass=False)
    _bunk(model, (-0.10, 0.255), top, 0.16, 0.34, math.pi / 2.0, GREY)
    _bunk(model, (-0.275, -0.10), top, 0.16, 0.34, 0.0, GREY)
    for x in (0.215, 0.315):
        model.rounded_box((x, 0.31, top + 0.15), (0.092, 0.10, 0.30), 0.02, WHITE)
        model.box((x, 0.259, top + 0.22), (0.05, 0.004, 0.008), GRAPHITE)
        parts.light_strip(model, (x - 0.035, 0.259, top + 0.02), (x + 0.035, 0.259, top + 0.02), 0.006)
    parts.display(model, (0.265, 0.258, top + 0.11), (0.14, 0.06), "-y", seed=71, depth=0.004)
    _round_table(model, (0.16, -0.17), top, radius=0.07, height=0.07)
    for dx in (-1, 1):
        x = 0.16 + dx * 0.115
        model.cylinder((x, -0.17, top), (x, -0.17, top + 0.04), 0.03, GRAPHITE, segments=12)
        model.cylinder((x, -0.17, top + 0.04), (x, -0.17, top + 0.05), 0.033, SMOOTH, segments=12)
    parts.display(model, (-0.42 + 0.05 + 0.001, -0.10, top + 0.33), (0.18, 0.06), "+x", seed=72, depth=0.006)
    return model.finish()


def habitat_t2():
    """A twin cabin: glass above the white walls now, two single beds with blue-grey blankets
    and a nightstand with a lamp between them, a shelf, a table for two, a wall display."""
    model = kit.Builder("te_enterprise_habitat_t2", style=STYLE)
    top = parts.ent_room(model, 0.42, height=0.40)
    for x in (-0.23, 0.08):
        _bed(model, (x, 0.19), top, 0.15, 0.30, FABRIC)
    model.rounded_box((-0.075, 0.30, top + 0.04), (0.08, 0.07, 0.08), 0.015, SMOOTH)
    model.cylinder((-0.075, 0.30, top + 0.08), (-0.075, 0.30, top + 0.12), 0.015, LAMP, segments=10)
    model.rounded_box((0.31, 0.29, top + 0.13), (0.11, 0.14, 0.26), 0.02, GREY)
    for z in (0.09, 0.18):
        model.box((0.31, 0.218, top + z), (0.09, 0.004, 0.006), LIGHT)
    _round_table(model, (0.10, -0.20), top, radius=0.07)
    _chair(model, (0.10 - 0.13, -0.20), top, turn=math.pi / 2.0)
    _chair(model, (0.10 + 0.13, -0.20), top, turn=-math.pi / 2.0)
    parts.display(model, (-0.42 + 0.05 + 0.001, -0.15, top + 0.11), (0.22, 0.09), "+x", seed=73)
    _plant(model, (-0.30, -0.32), top, height=0.10, seed=3, pot=0.035)
    return model.finish()


def habitat_t4():
    """A suite: a double bed under a carbon headboard with a light line, a media wall over a
    white sideboard, an L-shaped sofa round a glass coffee table on a rug, two plants."""
    model = kit.Builder("te_enterprise_habitat_t4", style=STYLE)
    top = parts.ent_room(model, 0.42, height=0.42)
    _bed(model, (-0.15, 0.19), top, 0.26, 0.30, FABRIC, pillows=2)
    model.rounded_box((-0.15, 0.355, top + 0.10), (0.30, 0.025, 0.14), 0.01, CARBON)
    parts.light_strip(model, (-0.29, 0.345, top + 0.172), (-0.01, 0.345, top + 0.172), 0.008)
    model.rounded_box((0.21, 0.32, top + 0.05), (0.26, 0.09, 0.10), 0.02, WHITE)
    parts.light_strip(model, (0.09, 0.274, top + 0.012), (0.33, 0.274, top + 0.012), 0.006)
    parts.display(model, (0.21, 0.369, top + 0.21), (0.28, 0.12), "-y", seed=74)
    # The rug, the sofa (back to the front, arm along the right) and the coffee table.
    model.plate((0.04, -0.13, top + 0.0012), (0.40, 0.26), "+z", GREY)
    model.rounded_box((0.02, -0.29, top + 0.035), (0.34, 0.11, 0.05), 0.03, GRAPHITE)
    model.rounded_box((0.02, -0.335, top + 0.085), (0.34, 0.03, 0.07), 0.012, GRAPHITE)
    model.rounded_box((0.235, -0.18, top + 0.035), (0.11, 0.33, 0.05), 0.03, GRAPHITE)
    model.rounded_box((0.28, -0.18, top + 0.085), (0.03, 0.33, 0.07), 0.012, GRAPHITE)
    for x in (-0.06, 0.08):
        model.rounded_box((x, -0.30, top + 0.07), (0.11, 0.07, 0.02), 0.02, FABRIC)
    for sx in (-1, 1):
        for sy in (-1, 1):
            model.cylinder((0.02 + sx * 0.07, -0.13 + sy * 0.04, top), (0.02 + sx * 0.07, -0.13 + sy * 0.04, top + 0.05),
                           0.006, CHROME, segments=6)
    model.box((0.02, -0.13, top + 0.054), (0.17, 0.10, 0.008), kit.PANE)
    model.box((0.02, -0.13, top + 0.02), (0.15, 0.08, 0.006), CARBON)
    _plant(model, (-0.31, -0.32), top, height=0.15, seed=11)
    _plant(model, (0.34, 0.06), top, height=0.11, seed=5, pot=0.035)
    return model.finish()


def _penthouse_room(model, half: float = 0.42, height: float = 0.46, floor_top: float = 0.06) -> float:
    """The room of the top habitat: like parts.ent_room, but glass from a low sill to the head
    all along both walls. Returns the floor's top."""
    hx = hy = half
    model.box((0.0, 0.0, floor_top * 0.3), (2.0 * hx, 2.0 * hy, floor_top * 0.6), CARBON)
    model.box((0.0, 0.0, floor_top * 0.8), (2.0 * hx, 2.0 * hy, floor_top * 0.4), parts.ENT_FLOOR)
    parts.light_strip(model, (-hx + 0.03, -hy, floor_top * 0.3), (hx - 0.03, -hy, floor_top * 0.3), 0.008)
    parts.light_strip(model, (hx, -hy + 0.03, floor_top * 0.3), (hx, hy - 0.03, floor_top * 0.3), 0.008)
    thick = 0.05
    top = floor_top + height
    back_y, left_x = hy - thick / 2.0, -hx + thick / 2.0
    parts.glass_wall(model, (-hx + thick, back_y), (hx, back_y), floor_top, top - 0.04, sill=0.04, mullions=2)
    parts.glass_wall(model, (left_x, -hy), (left_x, hy - thick), floor_top, top - 0.04, sill=0.04, mullions=2)
    model.box((thick / 2.0, back_y, top - 0.02), (2.0 * hx - thick, thick + 0.01, 0.04), SMOOTH)
    model.box((left_x, -thick / 2.0, top - 0.02), (thick + 0.01, 2.0 * hy - thick, 0.04), SMOOTH)
    parts.light_strip(model, (-hx + thick + 0.01, back_y - thick / 2.0 - 0.006, top - 0.034),
                      (hx - 0.01, back_y - thick / 2.0 - 0.006, top - 0.034), 0.01)
    parts.light_strip(model, (left_x + thick / 2.0 + 0.006, -hy + 0.01, top - 0.034),
                      (left_x + thick / 2.0 + 0.006, hy - thick - 0.01, top - 0.034), 0.01)
    parts.corner_post(model, (-hx + 0.04, hy - 0.04), floor_top, top + 0.012, radius=0.04)
    return floor_top


def habitat_t5():
    """The penthouse: glass all along both walls, a raised white platform with a wide double bed
    and a light sculpture, a plunge pool with a cyan rim, a curved lounge round a table, plants."""
    model = kit.Builder("te_enterprise_habitat_t5", style=STYLE)
    top = _penthouse_room(model)
    # The platform at the back with the bed and the sculpture.
    model.rounded_box((0.0, 0.17, top + 0.02), (0.74, 0.36, 0.04), 0.03, SMOOTH)
    parts.light_strip(model, (-0.34, -0.012, top + 0.02), (0.34, -0.012, top + 0.02), 0.008)
    stage = top + 0.04
    _bed(model, (-0.13, 0.19), stage, 0.30, 0.29, FABRIC, pillows=2)
    model.rounded_box((-0.13, 0.345, stage + 0.08), (0.34, 0.02, 0.16), 0.01, CARBON)
    parts.light_strip(model, (-0.29, 0.333, stage + 0.155), (0.03, 0.333, stage + 0.155), 0.008)
    for x in (-0.31, 0.05):
        model.rounded_box((x, 0.30, stage + 0.03), (0.05, 0.06, 0.06), 0.012, SMOOTH)
        model.cylinder((x, 0.30, stage + 0.06), (x, 0.30, stage + 0.085), 0.012, LAMP, segments=8)
    sculpture = (0.22, 0.20)
    model.cylinder((*sculpture, stage), (*sculpture, stage + 0.02), 0.05, CARBON, segments=14)
    model.cylinder((*sculpture, stage + 0.02), (*sculpture, stage + 0.20), 0.007, CHROME, segments=6)
    for tilt, turn in ((0.9, 0.0), (0.9, 2.1)):
        with model.placed((*sculpture, stage + 0.22), turn=turn, tilt=tilt):
            _ring(model, (0.0, 0.0, 0.0), 0.06, 0.005, LIGHT, segments=20)
    _sphere(model, (*sculpture, stage + 0.22), 0.022, LAMP, rings=4, segments=10)
    # The plunge pool at the front right.
    pool = (0.20, -0.21)
    model.rounded_box((*pool, top + 0.025), (0.32, 0.27, 0.05), 0.04, SMOOTH)
    model.rounded_box((*pool, top + 0.0505), (0.27, 0.22, 0.002), 0.025, LIGHT)
    model.plate((pool[0], pool[1], top + 0.0522), (0.25, 0.20), "+z", "water_blue")
    model.box((pool[0] + 0.105, pool[1] - 0.06, top + 0.06), (0.03, 0.05, 0.02), CHROME)
    # The lounge: a curved sofa behind a round table at the front left.
    lounge = (-0.21, -0.21)
    for step in range(5):
        angle = math.radians(40.0 + step * 36.0)
        x, y = lounge[0] + math.cos(angle) * 0.14, lounge[1] + math.sin(angle) * 0.14
        with model.placed((x, y, top), turn=angle - math.pi / 2.0):
            model.rounded_box((0.0, 0.0, 0.03), (0.085, 0.08, 0.04), 0.02, GRAPHITE)
            model.rounded_box((0.0, 0.045, 0.07), (0.085, 0.02, 0.07), 0.008, GRAPHITE)
            model.rounded_box((0.0, 0.0, 0.054), (0.07, 0.065, 0.01), 0.018, FABRIC)
    _round_table(model, lounge, top, radius=0.055, height=0.06, top=GREY)
    _sphere(model, (lounge[0], lounge[1], top + 0.085), 0.015, LIGHT, rings=4, segments=8)
    _plant(model, (-0.34, -0.36), top, height=0.18, seed=13, pot=0.04)
    _plant(model, (0.35, 0.05), top, height=0.12, seed=17, pot=0.035)
    return model.finish()


# --- Enterprise Warp Drive (1x1, outdoor) -------------------------------------------------------

def warp_drive():
    """A toroidal accelerator stack in a carbon frame over a white engine block: four field coils
    round a glass column with a lit plasma core turn as one (moving part rotor); the block pushes
    through a row of three heat-ringed thrust bells at its front. Taller and heavier than the
    sublight thruster; deliberately no pods or glowing domes (Rudi 2026-11-20: our own design)."""
    model = kit.Builder("te_enterprise_warp_drive", style=STYLE)
    top = parts.plinth(model, 0.42, height=0.05, radius=0.08)
    # The engine block with its bells to the front.
    model.rounded_box((0.0, 0.02, top + 0.09), (0.70, 0.60, 0.18), 0.07, WHITE)
    model.rounded_box((0.0, 0.02, top + 0.02), (0.704, 0.604, 0.04), 0.07, CARBON)
    block = top + 0.18
    model.rounded_box((0.0, 0.02, block + 0.008), (0.62, 0.52, 0.016), 0.06, CARBON)
    parts.light_strip(model, (0.351, -0.20, top + 0.12), (0.351, 0.22, top + 0.12), 0.010)
    parts.display(model, (0.351, 0.10, top + 0.075), (0.16, 0.05), "+x", seed=141, depth=0.004)
    for x in (-0.20, 0.0, 0.20):
        model.cylinder((x, -0.26, top + 0.09), (x, -0.30, top + 0.09), 0.075, CHROME, segments=16)
        parts.ent_nozzle(model, (x, -0.30, top + 0.09), (x, -0.42, top + 0.09), 0.045, 0.068)
    # The frame: four posts with light lines, a carbon head ring, an emitter cap.
    base, head = block + 0.016, block + 0.56
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.corner_post(model, (sx * 0.27, 0.02 + sy * 0.22), base, head, radius=0.03, color=SMOOTH,
                              outward=(sx * 0.707, sy * 0.707))
    for sign in (-1, 1):
        model.box((0.0, 0.02 + sign * 0.22, head + 0.015), (0.58, 0.05, 0.03), CARBON)
        model.box((sign * 0.27, 0.02, head + 0.015), (0.05, 0.48, 0.03), CARBON)
    model.cylinder((0.0, 0.02, head), (0.0, 0.02, head + 0.04), 0.13, SMOOTH, segments=20)
    model.cylinder((0.0, 0.02, head + 0.04), (0.0, 0.02, head + 0.055), 0.08, CHROME, segments=16)
    _ring(model, (0.0, 0.02, head + 0.04), 0.13, 0.006)
    for sign in (-1, 1):
        model.box((0.0, 0.02 + sign * 0.11, head + 0.02), (0.04, 0.12, 0.02), CARBON)
    # The column with the plasma core.
    model.cylinder((0.0, 0.02, base), (0.0, 0.02, base + 0.04), 0.12, SMOOTH, segments=20)
    model.cylinder((0.0, 0.02, base + 0.04), (0.0, 0.02, head), 0.075, kit.PANE, segments=20)
    model.cylinder((0.0, 0.02, base + 0.04), (0.0, 0.02, head), 0.03, LIGHT, segments=10)
    for z in (0.14, 0.27, 0.40):
        _sphere(model, (0.0, 0.02, base + z), 0.045, LAMP, rings=4, segments=10)
    # The coil stack.
    with model.moving("rotor", (0.0, 0.02, base)):
        for index in range(4):
            z = base + 0.10 + index * 0.115
            _ring(model, (0.0, 0.02, z), 0.19, 0.03, WHITE if index % 2 else CHROME, segments=28)
            _ring(model, (0.0, 0.02, z), 0.155, 0.008, LIGHT, segments=24)
            for node in range(3):
                angle = node * 2.0 * math.pi / 3.0 + index * 0.5
                model.box((math.cos(angle) * 0.19, 0.02 + math.sin(angle) * 0.19, z), (0.05, 0.05, 0.07), CARBON,
                          turn=angle)
                model.box((math.cos(angle) * 0.215, 0.02 + math.sin(angle) * 0.215, z), (0.006, 0.03, 0.04), LIGHT,
                          turn=angle)
    return model.finish()


# --- Enterprise Laser (1x1, outdoor) ----------------------------------------------------------

def laser():
    """A white turret on a carbon ring that pans to and fro (moving part scope): a soft housing
    between carbon cheeks, a long emitter under glass with three glowing focus coils and a
    lens at its muzzle, heat sink fins at the back. The player beam laser is a cone on a bunker."""
    model = kit.Builder("te_enterprise_laser", style=STYLE)
    top = parts.plinth(model, 0.42, height=0.05, radius=0.08)
    model.cylinder((0.0, 0.0, top), (0.0, 0.0, top + 0.03), 0.33, CARBON, segments=28)
    _ring(model, (0.0, 0.0, top + 0.03), 0.33, 0.006, segments=28)
    model.cylinder((0.0, 0.0, top + 0.03), (0.0, 0.0, top + 0.12), 0.27, SMOOTH, segments=28, end_radius=0.23)
    model.cylinder((0.0, 0.0, top + 0.12), (0.0, 0.0, top + 0.14), 0.21, GRAPHITE, segments=24)
    _ring(model, (0.0, 0.0, top + 0.14), 0.212, 0.006, segments=24)
    parts.display(model, (0.0, -0.215, top + 0.07), (0.16, 0.05), "-y", seed=81, depth=0.004)
    pivot = top + 0.14
    with model.moving("scope", (0.0, 0.0, pivot)):
        model.cylinder((0.0, 0.0, pivot), (0.0, 0.0, pivot + 0.04), 0.17, CARBON, segments=20)
        model.rounded_box((0.0, 0.03, pivot + 0.12), (0.24, 0.26, 0.16), 0.07, WHITE)
        parts.light_strip(model, (0.0, -0.06, pivot + 0.201), (0.0, 0.14, pivot + 0.201), 0.010)
        model.cylinder((0.0, 0.08, pivot + 0.20), (0.0, 0.08, pivot + 0.23), 0.03, CHROME, segments=10)
        _sphere(model, (0.0, 0.08, pivot + 0.235), 0.016, LIGHT, rings=4, segments=8)
        for side in (-1, 1):
            model.rounded_box((side * 0.135, 0.0, pivot + 0.13), (0.035, 0.22, 0.13), 0.012, CARBON)
            parts.light_strip(model, (side * 0.153, -0.09, pivot + 0.13), (side * 0.153, 0.08, pivot + 0.13), 0.008)
        for index in range(4):
            y = 0.17 + index * 0.022
            model.box((0.0, y, pivot + 0.12), (0.18, 0.008, 0.11), CARBON)
        # The emitter, pointing to the front and a little up.
        with model.placed((0.0, -0.08, pivot + 0.13), tilt=-0.22):
            model.cylinder((0.0, 0.0, 0.0), (0.0, -0.15, 0.0), 0.055, CARBON, segments=14)
            model.cylinder((0.0, -0.15, 0.0), (0.0, -0.17, 0.0), 0.062, CHROME, segments=16)
            model.cylinder((0.0, -0.17, 0.0), (0.0, -0.33, 0.0), 0.03, GRAPHITE, segments=12)
            for y in (-0.195, -0.245, -0.295):
                model.cylinder((0.0, y, 0.0), (0.0, y - 0.014, 0.0), 0.05, LIGHT, segments=16)
            model.cylinder((0.0, -0.172, 0.0), (0.0, -0.318, 0.0), 0.058, kit.PANE, segments=16)
            model.cylinder((0.0, -0.318, 0.0), (0.0, -0.345, 0.0), 0.06, SMOOTH, segments=16, end_radius=0.045)
            model.cylinder((0.0, -0.345, 0.0), (0.0, -0.35, 0.0), 0.034, LAMP, segments=14)
    return model.finish()


# --- Enterprise Rocket Launcher (2x2, indoor) ---------------------------------------------------

def rocket_launcher():
    """A launcher turret on a ring that pans to and fro (moving part scope): a white box between
    two towers, six tubes with the white noses of enterprise rockets and cyan rims; behind it a
    magazine rack of rockets, a feed belt with one on its way, a loading arm and two consoles."""
    model = kit.Builder("te_enterprise_rocket_launcher", style=STYLE)
    top = parts.plinth(model, (HALF_2, HALF_2), height=0.05, radius=0.20)
    cx, cy = 0.18, -0.12
    model.cylinder((cx, cy, top), (cx, cy, top + 0.03), 0.50, CARBON, segments=32)
    _ring(model, (cx, cy, top + 0.03), 0.50, 0.007, segments=32)
    _ring(model, (cx, cy, top + 0.001), 0.62, 0.005, segments=36)
    model.cylinder((cx, cy, top + 0.03), (cx, cy, top + 0.12), 0.44, SMOOTH, segments=32, end_radius=0.40)
    model.cylinder((cx, cy, top + 0.12), (cx, cy, top + 0.14), 0.38, GRAPHITE, segments=28)
    _ring(model, (cx, cy, top + 0.14), 0.382, 0.006, segments=28)
    pivot = top + 0.14
    with model.moving("scope", (cx, cy, pivot)):
        with model.placed((cx, cy, pivot)):
            model.cylinder((0.0, 0.0, 0.0), (0.0, 0.0, 0.05), 0.30, CARBON, segments=24)
            for side in (-1, 1):
                model.rounded_box((side * 0.31, 0.05, 0.17), (0.09, 0.34, 0.28), 0.035, WHITE)
                parts.light_strip(model, (side * 0.356, -0.06, 0.10), (side * 0.356, 0.16, 0.10), 0.010)
                model.cylinder((side * 0.27, 0.0, 0.24), (side * 0.355, 0.0, 0.24), 0.05, CHROME, segments=14)
            parts.display(model, (0.357, 0.11, 0.21), (0.12, 0.07), "+x", seed=91, depth=0.004)
            with model.placed((0.0, 0.0, 0.24), tilt=-0.35):
                model.rounded_box((0.0, 0.0, 0.0), (0.50, 0.46, 0.30), 0.06, WHITE)
                model.rounded_box((0.0, 0.0, 0.0), (0.506, 0.466, 0.05), 0.06, CARBON)
                model.rounded_box((0.0, 0.0, 0.03), (0.508, 0.468, 0.008), 0.06, LIGHT)
                model.plate((0.0, -0.2306, 0.0), (0.44, 0.27), "-y", GRAPHITE)
                for x in (-0.14, 0.0, 0.14):
                    for z in (-0.065, 0.065):
                        model.cylinder((x, -0.20, z), (x, -0.236, z), 0.058, GRAPHITE, segments=14)
                        model.cylinder((x, -0.236, z), (x, -0.240, z), 0.058, LIGHT, segments=14)
                        model.cylinder((x, -0.240, z), (x, -0.237, z), 0.046, CARBON, segments=14)
                        model.cylinder((x, -0.20, z), (x, -0.255, z), 0.036, SMOOTH, segments=12, end_radius=0.010)
                        model.cylinder((x, -0.255, z), (x, -0.262, z), 0.010, LIGHT, segments=8, end_radius=0.0)
                parts.light_strip(model, (-0.18, -0.10, 0.151), (-0.18, 0.18, 0.151), 0.010)
                parts.light_strip(model, (0.18, -0.10, 0.151), (0.18, 0.18, 0.151), 0.010)
    # The magazine rack at the back left: two white stands, carbon cradles, two layers of rockets.
    rack_x, rack_y = -0.48, 0.52
    for side in (-1, 1):
        x = rack_x + side * 0.24
        model.rounded_box((x, rack_y, top + 0.15), (0.06, 0.34, 0.30), 0.02, WHITE)
        parts.light_strip(model, (x, rack_y - 0.171, top + 0.03), (x, rack_y - 0.171, top + 0.27), 0.008)
    for z in (0.09, 0.21):
        for y in (rack_y - 0.10, rack_y + 0.10):
            model.box((rack_x, y, top + z - 0.045), (0.46, 0.02, 0.012), CARBON)
        for y in (rack_y - 0.10, rack_y, rack_y + 0.10):
            with model.placed((rack_x - 0.21, y, top + z)):
                parts.ent_rocket(model, 0.42, 0.036)
    # The feed belt to the turret with a rocket on it, the loading arm, two consoles.
    model.rounded_box((-0.06, 0.44, top + 0.03), (0.40, 0.12, 0.06), 0.03, SMOOTH)
    model.box((-0.06, 0.44, top + 0.062), (0.38, 0.08, 0.006), CARBON)
    parts.light_strip(model, (-0.24, 0.379, top + 0.045), (0.12, 0.379, top + 0.045), 0.008)
    with model.placed((-0.24, 0.44, top + 0.105)):
        parts.ent_rocket(model, 0.36, 0.032)
    parts.robot_arm_clean(model, (-0.44, 0.10), math.pi / 2.0, top, reach=0.20)
    parts.console(model, (-0.62, -0.62), top, width=0.22, seed=92)
    parts.console(model, (-0.36, -0.72), top, width=0.20, turn=0.3, seed=93)
    return model.finish()


# --- Enterprise Shield Generator (1x1, indoor) --------------------------------------------------

def shield_generator():
    """A hexagonal white pedestal with a glowing orb on a chrome spindle, held by three curved
    white prongs with lit tips; a chrome ring with six lit nodes turns round the spindle (moving
    part rotor). The player shield generator is a glowing dome among pylons."""
    model = kit.Builder("te_enterprise_shield_generator", style=STYLE)
    top = parts.plinth(model, 0.40, height=0.05, radius=0.08)
    _prism(model, (0.0, 0.0, top), 0.33, 0.03, CARBON)
    _prism(model, (0.0, 0.0, top + 0.03), 0.30, 0.06, WHITE)
    _prism(model, (0.0, 0.0, top + 0.09), 0.24, 0.012, LIGHT)
    _prism(model, (0.0, 0.0, top + 0.09), 0.22, 0.02, GRAPHITE)
    parts.display(model, (0.0, -0.262, top + 0.06), (0.14, 0.04), "-y", seed=101, depth=0.004)
    base = top + 0.11
    model.cylinder((0.0, 0.0, base), (0.0, 0.0, base + 0.04), 0.08, SMOOTH, segments=16, end_radius=0.05)
    model.cylinder((0.0, 0.0, base + 0.04), (0.0, 0.0, base + 0.36), 0.03, CHROME, segments=12)
    orb = base + 0.40
    model.cylinder((0.0, 0.0, orb - 0.09), (0.0, 0.0, orb - 0.05), 0.03, CHROME, segments=12, end_radius=0.05)
    _sphere(model, (0.0, 0.0, orb), 0.062, LIGHT, rings=6, segments=14)
    with model.placed((0.0, 0.0, orb), tilt=0.5):
        _ring(model, (0.0, 0.0, 0.0), 0.09, 0.005, CHROME, segments=24)
    # The prongs.
    steps = 6
    for index in range(3):
        angle = math.pi / 2.0 + index * 2.0 * math.pi / 3.0 + math.pi / 6.0
        ux, uy = math.cos(angle), math.sin(angle)
        points = []
        for step in range(steps + 1):
            share = step / steps
            reach = 0.25 - 0.14 * share * share
            points.append((ux * reach, uy * reach, base - 0.01 + share * 0.43))
        model.rounded_box((ux * 0.25, uy * 0.25, base + 0.01), (0.08, 0.08, 0.04), 0.03, CARBON)
        for start, end in zip(points, points[1:]):
            model.beam(start, end, 0.04, SMOOTH)
        for share in (0.35, 0.65):
            point = points[int(round(share * steps))]
            model.box((point[0] - ux * 0.02, point[1] - uy * 0.02, point[2]), (0.02, 0.02, 0.03), LIGHT, turn=angle)
        tip = points[-1]
        model.cylinder(tip, (tip[0], tip[1], tip[2] + 0.03), 0.02, CHROME, segments=10)
        _sphere(model, (tip[0], tip[1], tip[2] + 0.045), 0.017, LIGHT, rings=4, segments=8)
    # The turning ring.
    ring_z = base + 0.24
    with model.moving("rotor", (0.0, 0.0, ring_z)):
        _ring(model, (0.0, 0.0, ring_z), 0.15, 0.012, CHROME, segments=28)
        for node in range(6):
            angle = node * math.pi / 3.0
            model.box((math.cos(angle) * 0.15, math.sin(angle) * 0.15, ring_z), (0.03, 0.03, 0.03), LIGHT, turn=angle)
        for spoke in range(3):
            angle = spoke * 2.0 * math.pi / 3.0 + math.pi / 6.0
            model.beam((math.cos(angle) * 0.03, math.sin(angle) * 0.03, ring_z),
                       (math.cos(angle) * 0.14, math.sin(angle) * 0.14, ring_z), 0.01, CHROME)
    return model.finish()


# --- Enterprise Armor (1x1, indoor) ---------------------------------------------------------------

def armor():
    """A block of layered composite armour: grey and white panels with a carbon core layer showing
    at the sides and cyan seams, its top covered in raised white hexagons in graphite joints;
    a status display at the front. The player armour is riveted steel plates."""
    model = kit.Builder("te_enterprise_armor", style=STYLE)
    model.rounded_box((0.0, 0.0, 0.02), (0.82, 0.82, 0.04), 0.06, CARBON)
    model.rounded_box((0.0, 0.0, 0.09), (0.80, 0.80, 0.10), 0.06, GREY)
    model.rounded_box((0.0, 0.0, 0.155), (0.804, 0.804, 0.03), 0.06, CARBON)
    model.rounded_box((0.0, 0.0, 0.20), (0.80, 0.80, 0.06), 0.06, WHITE)
    for sign in (-1, 1):
        parts.light_strip(model, (-0.33, sign * 0.402, 0.155), (0.33, sign * 0.402, 0.155), 0.008)
        parts.light_strip(model, (sign * 0.402, -0.33, 0.155), (sign * 0.402, 0.33, 0.155), 0.008)
    model.rounded_box((0.0, 0.0, 0.232), (0.76, 0.76, 0.004), 0.05, GRAPHITE)
    radius = 0.078
    for row in range(-3, 4):
        y = row * 0.118
        offset = 0.068 if row % 2 else 0.0
        for column in range(-3, 4):
            x = column * 0.136 + offset
            if abs(x) > 0.31 or abs(y) > 0.31:
                continue
            _prism(model, (x, y, 0.234), radius, 0.026, SMOOTH, turn=math.pi / 6.0)
    parts.display(model, (0.18, -0.401, 0.09), (0.18, 0.06), "-y", seed=111, depth=0.004)
    parts.display(model, (0.401, 0.16, 0.09), (0.14, 0.06), "+x", seed=112, depth=0.004)
    return model.finish()


# --- Enterprise Wheel and Tracks (1x1, indoor) ---------------------------------------------------

def _wheel(model, center, radius: float, width: float) -> None:
    """A wheel turning round x: a graphite tyre, a white rim with a cyan ring, a chrome hub."""
    x, y, z = center
    model.cylinder((x - width / 2.0, y, z), (x + width / 2.0, y, z), radius, GRAPHITE, segments=20)
    outer = 1.0 if x > 0.0 else -1.0
    face = x + outer * width / 2.0
    model.cylinder((face - outer * 0.01, y, z), (face + outer * 0.006, y, z), radius * 0.68, SMOOTH, segments=18)
    with model.placed((face + outer * 0.006, y, z), turn=math.pi / 2.0, tilt=math.pi / 2.0):
        _ring(model, (0.0, 0.0, 0.0), radius * 0.58, 0.007, LIGHT, segments=20)
    model.cylinder((face, y, z), (face + outer * 0.02, y, z), radius * 0.25, CHROME, segments=12)
    for spoke in range(5):
        angle = spoke * 2.0 * math.pi / 5.0
        model.beam((face + outer * 0.008, y + math.cos(angle) * radius * 0.25, z + math.sin(angle) * radius * 0.25),
                   (face + outer * 0.008, y + math.cos(angle) * radius * 0.55, z + math.sin(angle) * radius * 0.55),
                   0.018, CARBON)


def wheel():
    """Four large wheels with white rims and cyan rings under a soft white fairing on a carbon
    chassis, with mudguards over the wheels and a light line round the body."""
    model = kit.Builder("te_enterprise_wheel", style=STYLE)
    radius = 0.15
    for sx in (-1, 1):
        for sy in (-1, 1):
            _wheel(model, (sx * 0.33, sy * 0.21, radius), radius, 0.10)
    model.rounded_box((0.0, 0.0, 0.17), (0.52, 0.70, 0.12), 0.05, CARBON)
    model.cylinder((-0.28, 0.21, radius), (0.28, 0.21, radius), 0.03, CHROME, segments=10)
    model.cylinder((-0.28, -0.21, radius), (0.28, -0.21, radius), 0.03, CHROME, segments=10)
    model.rounded_box((0.0, 0.0, 0.265), (0.54, 0.74, 0.07), 0.08, WHITE)
    model.rounded_box((0.0, 0.0, 0.232), (0.546, 0.746, 0.012), 0.08, LIGHT)
    for sx in (-1, 1):
        for sy in (-1, 1):
            model.rounded_box((sx * 0.33, sy * 0.21, 0.31), (0.12, 0.34, 0.025), 0.03, SMOOTH)
    model.rounded_box((0.0, 0.0, 0.31), (0.30, 0.42, 0.024), 0.05, CARBON)
    parts.display(model, (0.0, -0.08, 0.3221), (0.18, 0.12), "+z", seed=121, depth=0.004)
    parts.light_strip(model, (-0.12, 0.12, 0.322), (0.12, 0.12, 0.322), 0.010)
    return model.finish()


def tracks():
    """Two track units with carbon belts and graphite cleats, chrome road wheels under white side
    covers with light lines, joined by a white body with a carbon deck and a display."""
    model = kit.Builder("te_enterprise_tracks", style=STYLE)
    radius = 0.12
    reach = 0.27
    for side in (-1, 1):
        x = side * 0.27
        model.box((x, 0.0, radius), (0.15, 2.0 * reach, 2.0 * radius), CARBON)
        for y in (-reach, reach):
            model.cylinder((x - 0.075, y, radius), (x + 0.075, y, radius), radius, CARBON, segments=16)
        for step in range(9):
            y = -reach + step * (2.0 * reach / 8.0)
            model.box((x, y, 2.0 * radius + 0.004), (0.155, 0.022, 0.012), GRAPHITE)
            model.box((x, y, 0.006), (0.155, 0.022, 0.012), GRAPHITE)
        outer = x + side * 0.078
        for y in (-0.18, -0.06, 0.06, 0.18):
            model.cylinder((outer - side * 0.004, y, 0.07), (outer + side * 0.012, y, 0.07), 0.045, CHROME, segments=12)
        for y in (-reach, reach):
            model.cylinder((outer - side * 0.004, y, radius), (outer + side * 0.014, y, radius), 0.07, SMOOTH,
                           segments=16)
            model.cylinder((outer + side * 0.014, y, radius), (outer + side * 0.02, y, radius), 0.03, LIGHT, segments=12)
        model.rounded_box((outer + side * 0.006, 0.0, 0.18), (0.016, 0.50, 0.10), 0.006, WHITE)
        parts.light_strip(model, (outer + side * 0.014, -0.22, 0.20), (outer + side * 0.014, 0.22, 0.20), 0.008)
    model.rounded_box((0.0, 0.0, 0.17), (0.40, 0.52, 0.16), 0.05, WHITE)
    model.rounded_box((0.0, 0.0, 0.255), (0.36, 0.48, 0.016), 0.04, CARBON)
    parts.light_strip(model, (-0.15, -0.261, 0.15), (0.15, -0.261, 0.15), 0.008)
    parts.display(model, (0.0, -0.06, 0.2633), (0.16, 0.12), "+z", seed=131, depth=0.004)
    model.cylinder((0.0, 0.13, 0.263), (0.0, 0.13, 0.28), 0.04, CHROME, segments=12)
    _sphere(model, (0.0, 0.13, 0.285), 0.018, LIGHT, rings=4, segments=8)
    return model.finish()


ONE = (1, 1)
MODELS = {
    "enterprise_habitat_t1": (habitat_t1, ONE),
    "enterprise_habitat_t2": (habitat_t2, ONE),
    "enterprise_habitat_t4": (habitat_t4, ONE),
    "enterprise_habitat_t5": (habitat_t5, ONE),
    "enterprise_warp_drive": (warp_drive, ONE),
    "enterprise_laser": (laser, ONE),
    "enterprise_rocket_launcher": (rocket_launcher, (2, 2)),
    "enterprise_shield_generator": (shield_generator, ONE),
    "enterprise_armor": (armor, ONE),
    "enterprise_wheel": (wheel, ONE),
    "enterprise_tracks": (tracks, ONE),
}

if __name__ == "__main__":
    kit.run_many_from_command_line(MODELS)
