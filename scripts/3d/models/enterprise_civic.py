"""The civic enterprise modules (Backend-V2/docs/SPEC-enterprise-flaggschiff.md 3.6, 5.2, 5.5,
6a.3-6a.5) in the clean enterprise look of enterprise.py: the administration, the mining
efficiency distributor, the cartography archive, the observation platform and the eight
population modules (the counterparts of the player's advanced school, university, elite academy,
medical centre, security centre, experience arena, luxury promenade and biosphere). Painted only
with the parts.ENT_* colours (plus plants and soil), built from the enterprise parts. File names
are the lower-case type keys (enterprise_administration.glb).

  blender --background --factory-startup --python scripts/3d/models/enterprise_civic.py -- \
      --output-dir game/world/models [--only enterprise_holodeck,cartography_archive]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

STYLE = "enterprise"
HALF_1 = 0.42
HALF_2 = 0.93
WHITE, SMOOTH, GREY = parts.ENT_WHITE, parts.ENT_SMOOTH, parts.ENT_GREY
CARBON, GRAPHITE, CHROME = parts.ENT_CARBON, parts.ENT_GRAPHITE, parts.ENT_CHROME
LIGHT, LAMP, SCREEN, ACCENT = parts.ENT_LIGHT, parts.ENT_LAMP, parts.ENT_SCREEN, parts.ENT_ACCENT
FABRIC = "ent_fabric"
# The inner faces of the two walls of parts.ent_room (wall thickness 0.05).
WALL = 0.05


def _ring(model, center, radius: float, tube: float, color: str = LIGHT, segments: int = 24) -> None:
    parts.torus(model, center, radius, tube, color, segments=segments, sides=4)


def _wire(model, points, closed: bool = True, thickness: float = 0.006, color: str = LIGHT) -> None:
    """Glowing lines through *points* (a hologram's wireframe)."""
    count = len(points)
    for index in range(count if closed else count - 1):
        model.beam(points[index], points[(index + 1) % count], thickness, color)


def _map_display(model, center, size, facing: str, seed: int) -> None:
    """A wall display showing a surface map: a grid of tiles, some revealed (lit), some still
    dark, a warm marker on one; for the archive."""
    import random
    generator = random.Random(seed)
    width, height = size
    parts.display(model, center, size, facing, seed=seed)
    # Cover the abstract interface with the map: a dark field, then the tiles.
    inner_w, inner_h = width * 0.84, height * 0.70
    lift = 0.0018
    columns, rows = 8, 4
    out = {"+x": (1, 0, 0), "-x": (-1, 0, 0), "+y": (0, 1, 0), "-y": (0, -1, 0)}[facing]
    across = (0, 1, 0) if facing in ("+x", "-x") else (1, 0, 0)

    def point(a: float, u: float, steps: int) -> tuple:
        return tuple(center[i] + across[i] * a + (u if i == 2 else 0.0) + out[i] * lift * steps for i in range(3))

    model.plate(point(0.0, -height * 0.06, 1), (inner_w, inner_h), facing, SCREEN)
    cell_w, cell_h = inner_w / columns, inner_h / rows
    marker = (generator.randrange(columns), generator.randrange(rows))
    for column in range(columns):
        for row in range(rows):
            a = -inner_w / 2.0 + (column + 0.5) * cell_w
            u = -height * 0.06 - inner_h / 2.0 + (row + 0.5) * cell_h
            lit = generator.random() < 0.55 or (column, row) == marker
            if not lit:
                continue
            color = ACCENT if (column, row) == marker else (LIGHT if generator.random() < 0.7 else LAMP)
            model.plate(point(a, u, 2), (cell_w * 0.80, cell_h * 0.78), facing, color)


# --- Enterprise Administration (2x2) ----------------------------------------------------------

def administration():
    """The offices of the enterprise: a briefing table with a hologram of the member network (a
    lit core with the members on a ring round it, turning slowly), workstations behind glass
    partitions along the back wall, a large display on the left wall, consoles at the front."""
    model = kit.Builder("te_enterprise_administration", style=STYLE)
    half = HALF_2
    top = parts.ent_room(model, half, height=0.44)
    back = half - WALL
    # Workstations along the back wall, glass partitions between them.
    for index, x in enumerate((-0.52, -0.02, 0.48)):
        parts.ent_desk(model, (x, back - 0.09), top, size=(0.28, 0.12), seed=70 + index)
        parts.ent_chair(model, (x, back - 0.24), top, turn=math.pi)
    for x in (-0.27, 0.23, 0.73):
        parts.glass_wall(model, (x, back), (x, back - 0.30), top, top + 0.18, sill=0.03, mullions=0, light=None)
    # A large display on the left wall, a cabinet beside it.
    parts.display(model, (-half + WALL + 0.001, -0.05, top + 0.12), (0.62, 0.17), "+x", seed=77)
    model.rounded_box((-half + WALL + 0.06, -0.62, top + 0.10), (0.12, 0.26, 0.20), 0.03, WHITE)
    parts.light_strip(model, (-half + WALL + 0.121, -0.72, top + 0.17), (-half + WALL + 0.121, -0.52, top + 0.17),
                      0.008)
    # The briefing table.
    cx, cy = 0.14, -0.16
    table = top + 0.12
    for x in (-0.20, 0.20):
        model.rounded_box((cx + x, cy, top + 0.06), (0.06, 0.16, 0.12), 0.02, CARBON)
    model.rounded_box((cx, cy, table), (0.78, 0.38, 0.018), 0.16, SMOOTH)
    model.rounded_box((cx, cy, table + 0.0095), (0.62, 0.24, 0.002), 0.10, SCREEN)
    model.rounded_box((cx, cy, table - 0.012), (0.70, 0.30, 0.006), 0.13, LIGHT)
    for x in (-0.22, 0.0, 0.22):
        for side in (-1, 1):
            parts.ent_chair(model, (cx + x, cy + side * 0.27), top, turn=0.0 if side > 0 else math.pi)
    for side in (-1, 1):
        parts.ent_chair(model, (cx + side * 0.48, cy), top, turn=-side * math.pi / 2.0)
    # The hologram of the member network.
    pad = parts.holo_pad(model, (cx, cy), table + 0.009, radius=0.05)
    middle = pad + 0.17
    model.cylinder((cx, cy, pad), (cx, cy, middle - 0.03), 0.004, LIGHT, segments=6)
    with model.moving("sensor", (cx, cy, pad)):
        parts.ent_sphere(model, (cx, cy, middle), 0.034, LAMP, rings=5, segments=10)
        _ring(model, (cx, cy, middle), 0.15, 0.003, segments=28)
        for index in range(7):
            angle = 2.0 * math.pi * index / 7.0
            node = (cx + math.cos(angle) * 0.15, cy + math.sin(angle) * 0.15, middle + (0.03 if index % 2 else -0.02))
            parts.ent_sphere(model, node, 0.016, LIGHT if index else ACCENT, rings=4, segments=8)
            model.beam((cx, cy, middle), node, 0.004, LIGHT)
    # Consoles at the front right, a plant in the front left.
    parts.console(model, (0.74, -0.78), top, width=0.22, turn=0.4, seed=78)
    parts.console(model, (0.74, -0.30), top, width=0.20, turn=1.2, seed=79)
    parts.ent_planter(model, (-0.74, -0.80), top, size=(0.14, 0.14), height=0.07, seed=3, tall=0.26)
    return model.finish()


# --- Mining Efficiency Distributor (2x2) ------------------------------------------------------

def distributor():
    """The host of the members' mining optimizers: a glass column with a glowing crystal (the
    extraction focus) inside a ring of six white emitter fins, a crown with lit nodes turning on
    top; lit spokes on a carbon disc run out to server cabinets and relay posts in the corners."""
    model = kit.Builder("te_mining_efficiency_distributor", style=STYLE)
    top = parts.plinth(model, (HALF_2, HALF_2), height=0.05, radius=0.22)
    model.cylinder((0.0, 0.0, top), (0.0, 0.0, top + 0.012), 0.62, CARBON, segments=36)
    _ring(model, (0.0, 0.0, top + 0.012), 0.60, 0.006, segments=36)
    for index in range(6):
        angle = math.pi / 6.0 + index * math.pi / 3.0
        with model.placed((0.0, 0.0, top + 0.0126), turn=angle):
            model.plate((0.47, 0.0, 0.0), (0.24, 0.012), "+z", LIGHT)
    # The column.
    model.cylinder((0.0, 0.0, top), (0.0, 0.0, top + 0.08), 0.30, SMOOTH, segments=28)
    model.cylinder((0.0, 0.0, top + 0.035), (0.0, 0.0, top + 0.047), 0.303, LIGHT, segments=28)
    base = top + 0.08
    head = base + 0.46
    model.cylinder((0.0, 0.0, base), (0.0, 0.0, base + 0.02), 0.22, CARBON, segments=24)
    model.cylinder((0.0, 0.0, base + 0.02), (0.0, 0.0, head), 0.17, kit.PANE, segments=24)
    model.cylinder((0.0, 0.0, base + 0.02), (0.0, 0.0, head), 0.012, CHROME, segments=8)
    model.lump((0.0, 0.0, (base + head) / 2.0), (0.19, 0.19, 0.34), LIGHT, seed=11, rough=0.18)
    model.lump((0.0, 0.0, (base + head) / 2.0 + 0.02), (0.10, 0.10, 0.38), LAMP, seed=12, rough=0.15)
    for level in (base + 0.09, head - 0.09):
        _ring(model, (0.0, 0.0, level), 0.16, 0.007, CHROME, segments=24)
    # Six emitter fins round the glass.
    for index in range(6):
        angle = index * math.pi / 3.0
        with model.placed((0.0, 0.0, base), turn=angle):
            model.rounded_box((0.235, 0.0, 0.20), (0.07, 0.035, 0.40), 0.015, WHITE)
            parts.light_strip(model, (0.271, 0.0, 0.05), (0.271, 0.0, 0.36), 0.010)
            model.box((0.20, 0.0, 0.39), (0.04, 0.02, 0.02), GRAPHITE)
    # The crown with its turning nodes.
    model.cylinder((0.0, 0.0, head), (0.0, 0.0, head + 0.05), 0.27, SMOOTH, segments=28)
    model.cylinder((0.0, 0.0, head + 0.018), (0.0, 0.0, head + 0.030), 0.273, LIGHT, segments=28)
    model.cylinder((0.0, 0.0, head + 0.05), (0.0, 0.0, head + 0.07), 0.12, CARBON, segments=20)
    with model.moving("sensor", (0.0, 0.0, head + 0.07)):
        _ring(model, (0.0, 0.0, head + 0.10), 0.20, 0.010, CHROME, segments=28)
        for index in range(4):
            angle = index * math.pi / 2.0
            ux, uy = math.cos(angle), math.sin(angle)
            model.beam((ux * 0.06, uy * 0.06, head + 0.075), (ux * 0.20, uy * 0.20, head + 0.10), 0.016, SMOOTH)
            model.rounded_box((ux * 0.20, uy * 0.20, head + 0.10), (0.05, 0.05, 0.05), 0.015, SMOOTH, turn=angle)
            parts.ent_sphere(model, (ux * 0.20, uy * 0.20, head + 0.14), 0.018, LIGHT, rings=4, segments=8)
        model.cylinder((0.0, 0.0, head + 0.07), (0.0, 0.0, head + 0.11), 0.06, CHROME, segments=14)
    # Server cabinets in the left and right corners (as the camera sees them: nothing tall stands
    # in the far corner behind the column), relay posts in the near and far ones, a console.
    for sx in (-1, 1):
        with model.placed((sx * 0.70, sx * 0.70, top), turn=math.pi / 4.0):
            model.rounded_box((0.0, 0.0, 0.17), (0.30, 0.16, 0.34), 0.04, WHITE)
            model.box((0.0, -0.081, 0.17), (0.24, 0.004, 0.28), GRAPHITE)
            for row in range(5):
                parts.light_strip(model, (-0.10, -0.084, 0.06 + row * 0.055), (0.02 + 0.02 * (row % 3), -0.084,
                                                                                0.06 + row * 0.055), 0.006)
                model.plate((0.09, -0.0845, 0.06 + row * 0.055), (0.012, 0.012), "-y", ACCENT if row == 2 else LAMP)
    for sx in (-1, 1):
        x, y = sx * 0.72, -sx * 0.72
        parts.corner_post(model, (x, y), top, top + 0.36, radius=0.045, color=SMOOTH, outward=(sx * 0.707, -sx * 0.707))
        parts.ent_sphere(model, (x, y, top + 0.39), 0.03, LAMP, rings=4, segments=10)
        model.cylinder((x, y, top + 0.355), (x, y, top + 0.37), 0.05, CARBON, segments=14)
    for ux, uy in ((-0.707, -0.707), (0.707, -0.707), (-0.707, 0.707), (0.707, 0.707)):
        near, far = 0.32, 0.68
        model.beam((ux * near, uy * near, top + 0.02), (ux * far, uy * far, top + 0.02), 0.04, CARBON)
        parts.light_strip(model, (ux * near, uy * near, top + 0.041), (ux * far, uy * far, top + 0.041), 0.007)
    parts.console(model, (-0.12, -0.80), top, width=0.22, seed=81)
    return model.finish()


# --- Cartography Archive (2x2) ----------------------------------------------------------------

def _galaxy(model, center, z: float, radius: float, seed: int) -> None:
    """A star map on a table screen: two lit spiral arms of dots round a bright centre."""
    import random
    generator = random.Random(seed)
    x, y = center
    model.cylinder((x, y, z), (x, y, z + 0.002), radius * 0.12, LAMP, segments=12)
    for arm in range(2):
        for step in range(14):
            share = step / 13.0
            angle = arm * math.pi + share * 3.4 + generator.uniform(-0.12, 0.12)
            reach = radius * (0.14 + 0.80 * share)
            size = 0.016 - 0.008 * share
            color = ACCENT if (arm, step) == (1, 9) else (LAMP if step % 4 == 0 else LIGHT)
            model.plate((x + math.cos(angle) * reach, y + math.sin(angle) * reach, z + 0.0012), (size, size), "+z",
                        color)


def archive():
    """The shared map room: a round star-map table with a turning planet hologram over it (lat
    rings, an orbit with a moon), a row of data cores along the back wall, two surface maps on the
    left wall, consoles at the front."""
    model = kit.Builder("te_cartography_archive", style=STYLE)
    half = HALF_2
    top = parts.ent_room(model, half, height=0.44)
    back = half - WALL
    # Data cores along the back wall on a white bench.
    model.rounded_box((0.06, back - 0.10, top + 0.02), (1.30, 0.16, 0.04), 0.04, SMOOTH)
    parts.light_strip(model, (-0.56, back - 0.181, top + 0.03), (0.68, back - 0.181, top + 0.03), 0.008)
    for index in range(6):
        x = -0.50 + index * 0.22
        parts.data_core(model, (x, back - 0.10), top + 0.04, height=0.26 + 0.04 * (index % 2), radius=0.055)
    # Surface maps on the left wall.
    parts.wall_panel(model, (-half + WALL, -0.10, top + 0.12), (0.80, 0.20), "+x", color=SMOOTH)
    _map_display(model, (-half + WALL + 0.015, 0.12, top + 0.12), (0.34, 0.16), "+x", seed=90)
    _map_display(model, (-half + WALL + 0.015, -0.30, top + 0.12), (0.34, 0.16), "+x", seed=91)
    # The star-map table.
    cx, cy = 0.16, -0.20
    model.cylinder((cx, cy, top), (cx, cy, top + 0.02), 0.20, CARBON, segments=28)
    model.cylinder((cx, cy, top + 0.02), (cx, cy, top + 0.10), 0.14, SMOOTH, segments=28)
    _ring(model, (cx, cy, top + 0.06), 0.142, 0.006, segments=28)
    model.cylinder((cx, cy, top + 0.10), (cx, cy, top + 0.125), 0.34, SMOOTH, segments=36)
    model.cylinder((cx, cy, top + 0.125), (cx, cy, top + 0.128), 0.31, SCREEN, segments=36)
    _ring(model, (cx, cy, top + 0.125), 0.325, 0.006, segments=36)
    _galaxy(model, (cx, cy), top + 0.128, 0.29, seed=5)
    # The planet hologram.
    middle = top + 0.36
    model.cylinder((cx, cy, top + 0.128), (cx, cy, middle - 0.11), 0.005, LIGHT, segments=6)
    parts.ent_sphere(model, (cx, cy, middle), 0.10, SCREEN, rings=8, segments=18)
    for height, radius in ((0.0, 0.103), (0.05, 0.090), (-0.05, 0.090), (0.085, 0.055), (-0.085, 0.055)):
        _ring(model, (cx, cy, middle + height), radius, 0.003, segments=24)
    with model.moving("sensor", (cx, cy, middle)):
        with model.placed((cx, cy, middle), tilt=0.45):
            _ring(model, (0.0, 0.0, 0.0), 0.17, 0.004, LAMP, segments=32)
            parts.ent_sphere(model, (0.17, 0.0, 0.0), 0.022, LIGHT, rings=4, segments=10)
            parts.ent_sphere(model, (-0.12, 0.12, 0.0), 0.012, ACCENT, rings=3, segments=8)
    parts.console(model, (0.74, -0.70), top, width=0.22, turn=0.6, seed=92)
    parts.console(model, (-0.44, -0.74), top, width=0.20, turn=-0.3, seed=93)
    parts.ent_chair(model, (0.62, -0.82), top, turn=0.6 + math.pi)
    return model.finish()


# --- Enterprise School (1x1, counterpart of ADVANCED_SCHOOL) ----------------------------------

def school():
    """A bright classroom: four student desks with screens facing a large display on the back
    wall, a lectern beside it."""
    model = kit.Builder("te_enterprise_school", style=STYLE)
    top = parts.ent_room(model, HALF_1, height=0.40)
    back = HALF_1 - WALL
    parts.display(model, (-0.02, back - 0.001, top + 0.15), (0.44, 0.17), "-y", seed=101)
    model.rounded_box((0.27, back - 0.08, top + 0.07), (0.08, 0.07, 0.14), 0.02, WHITE)
    with model.placed((0.27, back - 0.10, top + 0.145), tilt=0.5):
        model.box((0.0, 0.0, 0.0), (0.10, 0.07, 0.01), SMOOTH)
        parts.display(model, (0.0, 0.0, 0.009), (0.08, 0.05), "+z", seed=102, depth=0.004)
    for row, y in enumerate((0.02, -0.21)):
        for column, x in enumerate((-0.17, 0.12)):
            parts.ent_desk(model, (x, y), top, size=(0.20, 0.09), seed=103 + row * 2 + column, height=0.085)
            parts.ent_chair(model, (x, y - 0.10), top, turn=math.pi, size=0.06)
    return model.finish()


# --- Enterprise Academy (1x1, counterpart of UNIVERSITY) --------------------------------------

def academy():
    """A small lecture hall: three white tiers rising to the right with bench desks and seats,
    all facing a large display on the left wall and a molecule hologram in front of it."""
    model = kit.Builder("te_enterprise_academy", style=STYLE)
    top = parts.ent_room(model, HALF_1, height=0.40)
    left = -HALF_1 + WALL
    parts.display(model, (left + 0.001, 0.02, top + 0.15), (0.48, 0.17), "+x", seed=111)
    # The molecule hologram.
    pad = parts.holo_pad(model, (-0.20, -0.02), top, radius=0.06)
    center = (-0.20, -0.02, pad + 0.15)
    atoms = [(0.0, 0.0, 0.0, LAMP, 0.028)]
    for index in range(5):
        angle = 2.0 * math.pi * index / 5.0
        atoms.append((math.cos(angle) * 0.07, math.sin(angle) * 0.07, 0.04 if index % 2 else -0.04,
                      ACCENT if index == 2 else LIGHT, 0.016))
    with model.moving("sensor", (center[0], center[1], pad)):
        for ax, ay, az, color, radius in atoms:
            point = (center[0] + ax, center[1] + ay, center[2] + az)
            parts.ent_sphere(model, point, radius, color, rings=4, segments=10)
            if radius < 0.02:
                model.beam(center, point, 0.005, LIGHT)
    model.cylinder((-0.20, -0.02, pad), (-0.20, -0.02, center[2] - 0.05), 0.004, LIGHT, segments=6)
    # The tiers, rising to the right (+x).
    for step, (x0, x1) in enumerate(((-0.04, 0.12), (0.12, 0.27), (0.27, 0.42))):
        rise = 0.025 * (step + 1)
        model.box(((x0 + x1) / 2.0, -0.02, top + rise / 2.0), (x1 - x0, 0.74, rise), SMOOTH)
        model.plate((x0 - 0.0006, -0.02, top + rise - 0.006), (0.70, 0.005), "-x", LIGHT)
        z = top + rise
        model.rounded_box((x0 + 0.03, -0.02, z + 0.07), (0.035, 0.62, 0.012), 0.012, SMOOTH)
        model.box((x0 + 0.03, -0.02, z + 0.035), (0.012, 0.58, 0.07), CARBON)
        for y in (-0.24, -0.02, 0.20):
            parts.ent_chair(model, (x0 + 0.095, y), z, turn=-math.pi / 2.0, size=0.055)
    return model.finish()


# --- Enterprise Elite Academy (1x1, counterpart of ELITE_ACADEMY) ------------------------------

def elite_academy():
    """A seminar room for the best: a round glass-topped table with six chairs and a glowing
    crystal hologram over it, a wall of lit archive shelves, an honour wall of lamps."""
    model = kit.Builder("te_enterprise_elite_academy", style=STYLE)
    top = parts.ent_room(model, HALF_1, height=0.40)
    back, left = HALF_1 - WALL, -HALF_1 + WALL
    # Archive shelves along the back wall.
    model.rounded_box((0.06, back - 0.04, top + 0.13), (0.56, 0.08, 0.26), 0.02, WHITE)
    for level in range(3):
        z = top + 0.045 + level * 0.075
        model.box((0.06, back - 0.081, z), (0.50, 0.004, 0.05), GRAPHITE)
        for index in range(11):
            x = -0.18 + index * 0.044
            color = LAMP if (index + level) % 3 else LIGHT
            model.plate((x, back - 0.0835, z), (0.012, 0.040 - 0.006 * ((index * 7 + level) % 3)), "-y", color)
    # The honour wall on the left: a row of lit plaques.
    for index in range(4):
        y = 0.20 - index * 0.15
        parts.wall_panel(model, (left, y, top + 0.11), (0.10, 0.12), "+x", color=SMOOTH)
        model.plate((left + 0.0156, y, top + 0.13), (0.05, 0.035), "+x", LAMP if index != 1 else ACCENT)
        model.plate((left + 0.0156, y, top + 0.08), (0.07, 0.008), "+x", LIGHT)
    # The seminar table.
    cx, cy = 0.06, -0.10
    model.cylinder((cx, cy, top), (cx, cy, top + 0.015), 0.08, CARBON, segments=20)
    model.cylinder((cx, cy, top + 0.015), (cx, cy, top + 0.085), 0.03, CHROME, segments=12)
    model.cylinder((cx, cy, top + 0.085), (cx, cy, top + 0.095), 0.165, SMOOTH, segments=28)
    model.cylinder((cx, cy, top + 0.095), (cx, cy, top + 0.098), 0.145, SCREEN, segments=28)
    _ring(model, (cx, cy, top + 0.095), 0.155, 0.005, segments=28)
    for index in range(6):
        angle = 2.0 * math.pi * index / 6.0 + math.pi / 6.0
        parts.ent_chair(model, (cx + math.cos(angle) * 0.22, cy + math.sin(angle) * 0.22), top,
                        turn=angle - math.pi / 2.0, size=0.06, seat=FABRIC)
    middle = top + 0.27
    model.cylinder((cx, cy, top + 0.098), (cx, cy, middle - 0.06), 0.004, LIGHT, segments=6)
    with model.moving("sensor", (cx, cy, top + 0.098)):
        model.lump((cx, cy, middle), (0.07, 0.07, 0.10), LIGHT, seed=21, rough=0.05, detail=1)
        with model.placed((cx, cy, middle), tilt=0.35):
            _ring(model, (0.0, 0.0, 0.0), 0.09, 0.005, CHROME, segments=24)
        with model.placed((cx, cy, middle), tilt=-0.35, turn=1.2):
            _ring(model, (0.0, 0.0, 0.0), 0.075, 0.003, LAMP, segments=24)
    parts.ent_planter(model, (0.33, 0.12), top, size=(0.09, 0.09), height=0.06, seed=8, tall=0.22)
    return model.finish()


# --- Enterprise Medical Bay (1x1, counterpart of MEDICAL_CENTER) -------------------------------

def medical_bay():
    """Two treatment beds under glass canopies, a scanner arch sliding along the front one, a
    clean surgical arm, a cabinet with a lit cross on the left wall."""
    model = kit.Builder("te_enterprise_medical_bay", style=STYLE)
    top = parts.ent_room(model, HALF_1, height=0.40)
    left = -HALF_1 + WALL
    beds = (-0.10, 0.20)
    for index, x in enumerate(beds):
        y0, y1 = -0.10, 0.22
        middle = (y0 + y1) / 2.0
        model.rounded_box((x, middle, top + 0.035), (0.08, 0.20, 0.07), 0.02, CARBON)
        model.rounded_box((x, middle, top + 0.08), (0.14, y1 - y0, 0.025), 0.04, SMOOTH)
        model.rounded_box((x, middle + 0.02, top + 0.095), (0.11, 0.20, 0.008), 0.03, FABRIC)
        model.rounded_box((x, y1 - 0.04, top + 0.10), (0.08, 0.04, 0.012), 0.015, SMOOTH)
        parts.light_strip(model, (x - 0.071, y0 + 0.03, top + 0.075), (x - 0.071, y1 - 0.03, top + 0.075), 0.006)
        # The glass canopy over the head end of the second bed.
        if index == 1:
            model.cylinder((x, y1 - 0.18, top + 0.10), (x, y1 - 0.01, top + 0.10), 0.07, kit.PANE, segments=16)
    # The scanner arch over the first bed (it slides along the bed: moving part "rod" along y).
    x = beds[0]
    with model.moving("rod", (x, 0.06, top + 0.10), tilt=math.pi / 2.0):
        with model.placed((x, 0.06, top + 0.10), tilt=math.pi / 2.0):
            parts.torus(model, (0.0, 0.0, 0.0), 0.105, 0.016, SMOOTH, segments=24, sides=6)
            _ring(model, (0.0, 0.0, -0.012), 0.088, 0.004, segments=24)
    for sx in (-1, 1):
        model.rounded_box((x + sx * 0.105, 0.06, top + 0.012), (0.04, 0.05, 0.024), 0.01, CARBON)
    parts.robot_arm_clean(model, (0.35, 0.06), -math.pi / 2.0, top, reach=0.13)
    # The cabinet with a lit cross on the left wall, a display beside it.
    model.rounded_box((left + 0.05, -0.20, top + 0.11), (0.10, 0.16, 0.22), 0.03, WHITE)
    model.plate((left + 0.1006, -0.20, top + 0.16), (0.05, 0.016), "+x", LIGHT)
    model.plate((left + 0.1012, -0.20, top + 0.16), (0.016, 0.05), "+x", LIGHT)
    parts.display(model, (left + 0.001, 0.14, top + 0.15), (0.26, 0.12), "+x", seed=121)
    parts.console(model, (0.20, -0.30), top, width=0.16, turn=0.3, seed=122)
    return model.finish()


# --- Enterprise Security HQ (1x1, counterpart of SECURITY_CENTER) -----------------------------

def security_hq():
    """The watch room: a curved command desk facing a wall of three displays, two operator
    chairs, a tactical hologram (the structure as a wireframe with warm marks) on a pad at the
    front, graphite lockers with lit locks on the left wall."""
    model = kit.Builder("te_enterprise_security_hq", style=STYLE)
    top = parts.ent_room(model, HALF_1, height=0.40)
    back, left = HALF_1 - WALL, -HALF_1 + WALL
    for index, x in enumerate((-0.18, 0.02, 0.22)):
        parts.display(model, (x, back - 0.001, top + 0.15), (0.19, 0.12), "-y", seed=131 + index)
    # The curved command desk.
    cx, cy = 0.04, 0.42
    for index in range(5):
        angle = -math.pi / 2.0 + (index - 2) * 0.28
        x, y = cx + math.cos(angle) * 0.36, cy + math.sin(angle) * 0.36
        with model.placed((x, y, top), turn=angle + math.pi / 2.0):
            model.rounded_box((0.0, 0.0, 0.045), (0.105, 0.07, 0.09), 0.015, SMOOTH)
            model.box((0.0, 0.0, 0.095), (0.11, 0.08, 0.01), CARBON)
            parts.light_strip(model, (-0.045, -0.036, 0.02), (0.045, -0.036, 0.02), 0.006)
            with model.placed((0.0, 0.01, 0.10), tilt=0.6):
                parts.display(model, (0.0, 0.0, 0.008), (0.09, 0.04), "+z", seed=140 + index, depth=0.004)
    for x in (-0.06, 0.14):
        parts.ent_chair(model, (x, -0.06), top, turn=math.pi, size=0.065)
    # Lockers on the left wall.
    for index in range(3):
        y = 0.16 - index * 0.13
        model.rounded_box((left + 0.045, y, top + 0.12), (0.09, 0.12, 0.24), 0.015, GRAPHITE)
        parts.light_strip(model, (left + 0.091, y + 0.035, top + 0.06), (left + 0.091, y + 0.035, top + 0.18), 0.006)
        model.plate((left + 0.0906, y - 0.02, top + 0.20), (0.016, 0.016), "+x", ACCENT)
    # The tactical hologram.
    hx, hy = 0.20, -0.26
    pad = parts.holo_pad(model, (hx, hy), top, radius=0.09)
    with model.placed((hx, hy, pad + 0.07)):
        for z in (0.0, 0.05):
            _wire(model, [(-0.06, -0.04, z), (0.06, -0.04, z), (0.06, 0.04, z), (-0.06, 0.04, z)], thickness=0.004)
        for x, y in ((-0.06, -0.04), (0.06, -0.04), (0.06, 0.04), (-0.06, 0.04)):
            model.beam((x, y, 0.0), (x, y, 0.05), 0.004, LIGHT)
        _wire(model, [(-0.02, -0.04, 0.05), (0.02, -0.04, 0.05), (0.02, -0.04, 0.09), (-0.02, -0.04, 0.09)],
              thickness=0.004)
        parts.ent_sphere(model, (0.04, 0.02, 0.025), 0.012, ACCENT, rings=3, segments=8)
        parts.ent_sphere(model, (-0.03, -0.01, 0.065), 0.010, ACCENT, rings=3, segments=8)
    return model.finish()


# --- Enterprise Holodeck (1x1, counterpart of EXPERIENCE_ARENA) -------------------------------

def holodeck():
    """A holo room of our own: a graphite floor and two graphite walls covered by a hex lattice of
    emitter dots (bright round the scene, dim further out), an emitter ring under the ceiling, and
    a scene projected in the middle: wireframe mountains, glowing trees and a turning wireframe
    moon."""
    model = kit.Builder("te_enterprise_holodeck", style=STYLE)
    half = HALF_1
    floor_top = 0.06
    model.box((0.0, 0.0, floor_top * 0.3), (2.0 * half, 2.0 * half, floor_top * 0.6), CARBON)
    model.box((0.0, 0.0, floor_top * 0.8), (2.0 * half, 2.0 * half, floor_top * 0.4), GRAPHITE)
    parts.light_strip(model, (-half + 0.03, -half, floor_top * 0.3), (half - 0.03, -half, floor_top * 0.3), 0.008)
    parts.light_strip(model, (half, -half + 0.03, floor_top * 0.3), (half, half - 0.03, floor_top * 0.3), 0.008)
    height = 0.40
    top = floor_top + height
    back, left = half - WALL, -half + WALL
    model.box((WALL / 2.0, half - WALL / 2.0, floor_top + height / 2.0), (2.0 * half - WALL, WALL, height), GRAPHITE)
    model.box((-half + WALL / 2.0, -WALL / 2.0, floor_top + height / 2.0), (WALL, 2.0 * half - WALL, height),
              GRAPHITE)
    # The outer faces and the head stay white, as every enterprise room.
    model.plate((WALL / 2.0, half + 0.0006, floor_top + height / 2.0), (2.0 * half - WALL, height), "+y", WHITE)
    model.plate((-half - 0.0006, -WALL / 2.0, floor_top + height / 2.0), (2.0 * half - WALL, height), "-x", WHITE)
    model.box((WALL / 2.0, half - WALL / 2.0, top + 0.01), (2.0 * half - WALL, WALL + 0.01, 0.02), SMOOTH)
    model.box((-half + WALL / 2.0, -WALL / 2.0, top + 0.01), (WALL + 0.01, 2.0 * half - WALL, 0.02), SMOOTH)
    parts.corner_post(model, (-half + 0.04, half - 0.04), floor_top, top + 0.02, radius=0.04)
    # The projection field: a hex lattice of emitter dots on floor and walls, bright round the
    # scene in the middle, dim (screen teal) further out.
    spacing = 0.05
    dot = 0.011
    centre = (0.02, 0.0, floor_top + 0.12)

    def shade(point) -> str:
        reach = math.dist(point, centre)
        return LIGHT if reach < 0.26 else (SCREEN if reach > 0.40 else LAMP if reach < 0.30 else LIGHT)

    rows = int((back + half) / (spacing * 0.866))
    for row in range(rows):
        y = -half + 0.025 + row * spacing * 0.866
        for column in range(20):
            x = left + 0.02 + column * spacing + (spacing / 2.0 if row % 2 else 0.0)
            if x < half - 0.015 and y < back - 0.015:
                model.plate((x, y, floor_top + 0.0006), (dot, dot), "+z", shade((x, y, floor_top)))
    for row in range(int((height - 0.03) / (spacing * 0.866))):
        z = floor_top + 0.03 + row * spacing * 0.866
        for column in range(20):
            shift = spacing / 2.0 if row % 2 else 0.0
            x = left + 0.03 + column * spacing + shift
            if x < half - 0.015:
                model.plate((x, back - 0.0006, z), (dot, dot), "-y", shade((x, back, z)))
            y = back - 0.03 - column * spacing - shift
            if y > -half + 0.015:
                model.plate((left + 0.0006, y, z), (dot, dot), "+x", shade((left, y, z)))
    # The emitter ring under the ceiling, held from the corner post, six lenses looking down.
    ring = (0.02, 0.0, top + 0.005)
    parts.torus(model, ring, 0.22, 0.016, SMOOTH, segments=32, sides=6)
    _ring(model, (ring[0], ring[1], ring[2] - 0.014), 0.22, 0.005, segments=32)
    model.beam((-half + 0.06, half - 0.06, top + 0.012), (ring[0] - 0.15, ring[1] + 0.15, ring[2] + 0.006), 0.022,
               SMOOTH)
    for index in range(6):
        angle = math.pi / 6.0 + index * math.pi / 3.0
        point = (ring[0] + math.cos(angle) * 0.22, ring[1] + math.sin(angle) * 0.22, ring[2] - 0.022)
        parts.ent_sphere(model, point, 0.014, LAMP, rings=4, segments=8)
    # The projected scene.
    base = floor_top
    for (mx, my), size, peak in (((0.02, 0.10), 0.20, 0.20), ((0.20, -0.04), 0.14, 0.13), ((-0.18, -0.12), 0.12, 0.10)):
        corners = [(mx - size / 2.0, my - size / 2.0, base), (mx + size / 2.0, my - size / 2.0, base),
                   (mx + size / 2.0, my + size / 2.0, base), (mx - size / 2.0, my + size / 2.0, base)]
        tip = (mx, my, base + peak)
        for corner in corners:
            model.beam(corner, tip, 0.006, LIGHT)
        _wire(model, corners, thickness=0.006)
        middle = [(c[0] * 0.5 + tip[0] * 0.5, c[1] * 0.5 + tip[1] * 0.5, base + peak / 2.0) for c in corners]
        _wire(model, middle, thickness=0.004)
    for tx, ty, tall in ((-0.10, -0.28, 0.12), (0.30, 0.22, 0.10), (0.14, -0.28, 0.08)):
        model.cylinder((tx, ty, base), (tx, ty, base + tall * 0.3), 0.006, LIGHT, segments=6)
        model.cylinder((tx, ty, base + tall * 0.3), (tx, ty, base + tall), 0.035, LIGHT, segments=8, end_radius=0.0)
    moon = (0.18, 0.18, base + 0.30)
    with model.moving("sensor", (moon[0], moon[1], base)):
        _ring(model, moon, 0.06, 0.004, segments=20)
        with model.placed(moon, tilt=math.pi / 2.0):
            _ring(model, (0.0, 0.0, 0.0), 0.06, 0.004, segments=20)
        with model.placed(moon, turn=math.pi / 2.0, tilt=math.pi / 2.0):
            _ring(model, (0.0, 0.0, 0.0), 0.06, 0.004, segments=20)
    return model.finish()


# --- Enterprise Promenade (1x1, counterpart of LUXURY_PROMENADE) -------------------------------

def promenade():
    """A lounge behind big windows: a lit walkway, a tree and shrubs in white planters, a curved
    sofa round a low table, a small bar with stools."""
    model = kit.Builder("te_enterprise_promenade", style=STYLE)
    top = parts.ent_room(model, HALF_1, height=0.40)
    back, left = HALF_1 - WALL, -HALF_1 + WALL
    # The walkway diagonal through the room.
    with model.placed((0.08, -0.06, top), turn=math.pi / 4.0):
        model.plate((0.0, 0.0, 0.0008), (0.86, 0.14), "+z", SMOOTH)
        for side in (-1, 1):
            model.plate((0.0, side * 0.072, 0.0014), (0.86, 0.006), "+z", LIGHT)
    parts.ent_planter(model, (left + 0.09, back - 0.09), top, size=(0.15, 0.15), height=0.07, seed=31, tall=0.34)
    parts.ent_planter(model, (0.30, back - 0.06), top, size=(0.18, 0.08), height=0.05, seed=32, tall=0.08)
    parts.ent_planter(model, (left + 0.05, -0.28), top, size=(0.08, 0.16), height=0.05, seed=33, tall=0.08)
    # The curved sofa round a low table.
    cx, cy = -0.14, -0.04
    for index in range(4):
        angle = math.pi * 0.55 + index * 0.42
        x, y = cx + math.cos(angle) * 0.13, cy + math.sin(angle) * 0.13
        with model.placed((x, y, top), turn=angle - math.pi / 2.0):
            model.rounded_box((0.0, 0.0, 0.025), (0.07, 0.07, 0.03), 0.02, GRAPHITE)
            model.rounded_box((0.0, -0.004, 0.045), (0.065, 0.06, 0.014), 0.02, FABRIC)
            model.rounded_box((0.0, -0.035, 0.07), (0.07, 0.018, 0.05), 0.008, FABRIC)
    model.cylinder((cx, cy, top), (cx, cy, top + 0.035), 0.012, CHROME, segments=8)
    model.cylinder((cx, cy, top + 0.035), (cx, cy, top + 0.045), 0.065, SMOOTH, segments=20)
    model.cylinder((cx, cy, top + 0.045), (cx, cy, top + 0.047), 0.05, SCREEN, segments=20)
    # The bar along the right side.
    bx = 0.30
    model.rounded_box((bx, 0.00, top + 0.06), (0.07, 0.30, 0.12), 0.03, WHITE)
    model.rounded_box((bx - 0.005, 0.00, top + 0.125), (0.09, 0.32, 0.012), 0.03, CARBON)
    parts.light_strip(model, (bx - 0.036, -0.13, top + 0.02), (bx - 0.036, 0.13, top + 0.02), 0.006)
    for index, y in enumerate((-0.10, 0.0, 0.10)):
        model.cylinder((bx - 0.03 + 0.01 * index, y, top + 0.131), (bx - 0.03 + 0.01 * index, y, top + 0.16), 0.009,
                       LAMP if index != 1 else ACCENT, segments=8)
    for y in (-0.10, 0.05):
        sx = bx - 0.10
        model.cylinder((sx, y, top), (sx, y, top + 0.004), 0.022, CARBON, segments=10)
        model.cylinder((sx, y, top + 0.004), (sx, y, top + 0.08), 0.006, CHROME, segments=6)
        model.cylinder((sx, y, top + 0.08), (sx, y, top + 0.092), 0.026, FABRIC, segments=12)
    # Hanging lamps.
    for x, y in ((-0.14, -0.04), (0.12, 0.18)):
        model.cylinder((x, y, top + 0.40), (x, y, top + 0.30), 0.002, GRAPHITE, segments=4)
        model.cylinder((x, y, top + 0.30), (x, y, top + 0.28), 0.03, SMOOTH, segments=12, end_radius=0.04)
        model.cylinder((x, y, top + 0.279), (x, y, top + 0.281), 0.036, LAMP, segments=12)
    return model.finish()


# --- Enterprise Biodome (1x1, counterpart of BIOSPHERE) ---------------------------------------

def biodome():
    """A glass dome garden: on a round white base with a cyan ring, trees, shrubs, a pond and a
    lit path under a glass dome with slim white ribs and a white crown."""
    model = kit.Builder("te_enterprise_biodome", style=STYLE)
    top = parts.plinth(model, HALF_1, height=0.04, radius=0.10)
    radius = 0.40
    model.cylinder((0.0, 0.0, top), (0.0, 0.0, top + 0.07), radius + 0.01, SMOOTH, segments=36)
    model.cylinder((0.0, 0.0, top + 0.02), (0.0, 0.0, top + 0.032), radius + 0.013, LIGHT, segments=36)
    model.cylinder((0.0, 0.0, top + 0.07), (0.0, 0.0, top + 0.08), radius + 0.012, CARBON, segments=36)
    ground = top + 0.08
    model.cylinder((0.0, 0.0, ground - 0.004), (0.0, 0.0, ground), radius - 0.005, "soil", segments=36)
    # A lit path round a pond.
    _ring(model, (0.0, 0.0, ground), 0.20, 0.010, SMOOTH, segments=32)
    _ring(model, (0.0, 0.0, ground + 0.006), 0.20, 0.003, LIGHT, segments=32)
    model.cylinder((0.07, -0.06, ground - 0.002), (0.07, -0.06, ground + 0.002), 0.09, "water_blue", segments=20)
    model.cylinder((0.07, -0.06, ground), (0.07, -0.06, ground + 0.006), 0.095, SMOOTH, segments=20)
    model.cylinder((0.07, -0.06, ground + 0.0061), (0.07, -0.06, ground + 0.0065), 0.09, "water_blue", segments=20)
    # Trees and shrubs.
    for (x, y), tall, seed in (((-0.12, 0.14), 0.30, 41), ((0.16, 0.18), 0.22, 42), ((-0.22, -0.10), 0.18, 43)):
        model.cylinder((x, y, ground), (x, y, ground + tall * 0.55), 0.012, "wood", segments=6)
        model.lump((x, y, ground + tall * 0.72), (tall * 0.55, tall * 0.55, tall * 0.50), "plant", seed=seed,
                   rough=0.22)
    for (x, y), seed in (((0.28, -0.10), 51), ((-0.05, -0.26), 52), ((0.02, 0.30), 53), ((-0.30, 0.08), 54),
                         ((0.24, 0.05), 55)):
        model.lump((x, y, ground + 0.025), (0.08, 0.08, 0.06), "plant", seed=seed, rough=0.3)
    # The dome: glass, ribs, rings, crown.
    tall = 0.46
    rings = 8
    profile = [(radius * math.cos(math.pi / 2.0 * k / rings), tall * math.sin(math.pi / 2.0 * k / rings))
               for k in range(rings)] + [(0.0, tall)]
    model.revolve((0.0, 0.0, ground), profile, kit.PANE, segments=32)
    for index in range(8):
        angle = index * math.pi / 4.0
        ux, uy = math.cos(angle), math.sin(angle)
        points = [(ux * (radius + 0.004) * math.cos(math.pi / 2.0 * k / 6),
                   uy * (radius + 0.004) * math.cos(math.pi / 2.0 * k / 6),
                   ground + (tall + 0.004) * math.sin(math.pi / 2.0 * k / 6)) for k in range(6)]
        _wire(model, points, closed=False, thickness=0.012, color=SMOOTH)
    for share, color in ((0.40, SMOOTH), (0.72, SMOOTH)):
        angle = math.asin(share)
        _ring(model, (0.0, 0.0, ground + tall * share), (radius + 0.005) * math.cos(angle), 0.006, color,
              segments=32)
    crown = ground + tall
    model.cylinder((0.0, 0.0, crown - 0.03), (0.0, 0.0, crown + 0.02), 0.08, SMOOTH, segments=20)
    model.cylinder((0.0, 0.0, crown - 0.004), (0.0, 0.0, crown + 0.006), 0.083, LIGHT, segments=20)
    parts.ent_sphere(model, (0.0, 0.0, crown + 0.035), 0.02, LAMP, rings=4, segments=10)
    # The door: a white frame at the front.
    with model.placed((0.0, -radius, ground)):
        model.rounded_box((0.0, 0.0, 0.09), (0.16, 0.06, 0.18), 0.02, WHITE)
        model.box((0.0, -0.031, 0.08), (0.10, 0.004, 0.15), GRAPHITE)
        parts.light_strip(model, (-0.05, -0.034, 0.158), (0.05, -0.034, 0.158), 0.006)
    return model.finish()


# --- Observation Platform (1x1, outdoor; node of the telescope network) ----------------------

def observation_platform():
    """A sleek white telescope on a fork mount that pans slowly (moving part "scope"): a white tube
    with chrome rings and a cyan ring at its dark aperture, on a round base with a display."""
    model = kit.Builder("te_observation_platform", style=STYLE)
    top = parts.plinth(model, 0.40, height=0.05, radius=0.08)
    model.cylinder((0.0, 0.0, top), (0.0, 0.0, top + 0.10), 0.24, WHITE, segments=28)
    model.cylinder((0.0, 0.0, top + 0.06), (0.0, 0.0, top + 0.072), 0.243, LIGHT, segments=28)
    model.cylinder((0.0, 0.0, top + 0.10), (0.0, 0.0, top + 0.12), 0.20, CARBON, segments=28)
    parts.display(model, (0.0, -0.236, top + 0.035), (0.14, 0.05), "-y", seed=151, depth=0.006)
    for x, y in ((0.30, -0.30), (-0.30, -0.30), (0.30, 0.30)):
        parts.corner_post(model, (x, y), top, top + 0.10, radius=0.03, color=SMOOTH)
        parts.ent_sphere(model, (x, y, top + 0.115), 0.018, LAMP, rings=4, segments=8)
    mount = top + 0.12
    with model.moving("scope", (0.0, 0.0, mount)):
        model.cylinder((0.0, 0.0, mount), (0.0, 0.0, mount + 0.04), 0.15, SMOOTH, segments=24)
        for side in (-1, 1):
            model.rounded_box((side * 0.13, 0.0, mount + 0.16), (0.04, 0.10, 0.26), 0.02, WHITE)
            model.cylinder((side * 0.11, 0.0, mount + 0.24), (side * 0.15, 0.0, mount + 0.24), 0.04, CARBON,
                           segments=14)
        axis = mount + 0.24
        with model.placed((0.0, 0.0, axis), tilt=math.radians(-40.0)):
            model.cylinder((0.0, 0.0, -0.14), (0.0, 0.0, 0.24), 0.095, SMOOTH, segments=24)
            model.cylinder((0.0, 0.0, 0.24), (0.0, 0.0, 0.30), 0.105, WHITE, segments=24)
            model.cylinder((0.0, 0.0, 0.30), (0.0, 0.0, 0.301), 0.09, parts.ENT_WINDOW, segments=24)
            _ring(model, (0.0, 0.0, 0.302), 0.098, 0.006, segments=24)
            for z in (-0.06, 0.12):
                _ring(model, (0.0, 0.0, z), 0.097, 0.007, CHROME, segments=24)
            model.cylinder((0.0, 0.0, -0.14), (0.0, 0.0, -0.17), 0.07, CARBON, segments=16)
            parts.light_strip(model, (0.0, 0.096, -0.10), (0.0, 0.096, 0.22), 0.008)
    return model.finish()


ONE = (1, 1)
TWO = (2, 2)
MODELS = {
    "enterprise_administration": (administration, TWO),
    "mining_efficiency_distributor": (distributor, TWO),
    "cartography_archive": (archive, TWO),
    "observation_platform": (observation_platform, ONE),
    "enterprise_school": (school, ONE),
    "enterprise_academy": (academy, ONE),
    "enterprise_elite_academy": (elite_academy, ONE),
    "enterprise_medical_bay": (medical_bay, ONE),
    "enterprise_security_hq": (security_hq, ONE),
    "enterprise_holodeck": (holodeck, ONE),
    "enterprise_promenade": (promenade, ONE),
    "enterprise_biodome": (biodome, ONE),
}

if __name__ == "__main__":
    kit.run_many_from_command_line(MODELS)
