"""What encloses a large base on the surface (core/base_grounds.gd decides where it runs): a
chain-link fence and, for the largest bases, a concrete wall with barbed wire. Writes <name>.glb
for each piece; the game puts them together cell by cell (game/world/base_grounds_layer.gd):

- *_post stands in the middle of every cell of the line, *_gate instead where the line ends at a
  gap (before a dock, at another structure).
- *_half runs from the middle of the cell to its edge, towards -Y (the model's front); the game
  turns one towards every neighbour the line runs on to, so straight runs, corners and T-joints
  all come from the same piece.

The chain link itself is a see-through face (kit.PANE); the game draws it with a shader of its own
(base_fence_mesh.gdshader) that draws the diamond wire pattern, so it costs no triangles. Fences
and walls are industrial: old, dirty, a little rusty (high wear).
  blender --background --factory-startup --python scripts/3d/models/grounds.py -- \
      --output-dir game/world/models/grounds [--only fence_half,wall_post]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

kit.TEXTURE_PIXELS = 256
kit.BAKE_SAMPLES = 16
kit.SURFACE_REPEATS = 4.0

FENCE_WEAR = 0.85
WALL_WEAR = 1.0
MAX_HEIGHT = 0.7
# Half a cell: a half piece runs from the cell's middle to its edge.
HALF = 0.5
# Chain-link fence: height of the top rail, the posts' thickness, the barbed strands above.
FENCE_HEIGHT = 0.30
POST = 0.026
STRANDS = (0.035, 0.065)
# Concrete wall: height, thickness, the coil of barbed wire on its top.
WALL_HEIGHT = 0.40
WALL_THICK = 0.10
COIL_RADIUS = 0.032
COIL_LOOPS = 3
RED = "glow_red"


def footing(model, half: float, height: float) -> float:
    """A small concrete foundation. Returns the height of its top."""
    model.box((0.0, 0.0, height / 2.0), (half * 2.0, half * 2.0, height), "concrete_dark")
    return height


def hazard_bands(model, half: float, bottom: float, top: float, count: int) -> None:
    """Yellow and black bands around a square post, a hair wider than the post."""
    step = (top - bottom) / count
    for index in range(count):
        color = "yellow" if index % 2 == 0 else "dark"
        z = bottom + (index + 0.5) * step
        model.box((0.0, 0.0, z), (half * 2.0 + 0.004, half * 2.0 + 0.004, step), color)


def warning_light(model, z: float, radius: float = 0.016) -> None:
    """A small red light on top of a gate post."""
    model.cylinder((0.0, 0.0, z), (0.0, 0.0, z + 0.012), radius * 1.3, "steel_dark", segments=6)
    model.cylinder((0.0, 0.0, z + 0.012), (0.0, 0.0, z + 0.04), radius, RED, segments=6,
                   end_radius=radius * 0.5)


def fence_post(name):
    """A steel post with a cap, standing in the middle of a fence cell."""
    model = kit.Builder(name, wear=FENCE_WEAR)
    top = footing(model, 0.035, 0.02)
    height = FENCE_HEIGHT + STRANDS[-1] + 0.01
    model.box((0.0, 0.0, (top + height) / 2.0), (POST, POST, height - top), "steel")
    model.box((0.0, 0.0, height + 0.006), (POST + 0.01, POST + 0.01, 0.012), "steel_dark")
    return model.finish()


def fence_half(name):
    """Half a cell of fence: rails, tension wire, two barbed strands and the chain link."""
    model = kit.Builder(name, wear=FENCE_WEAR)
    model.beam((0.0, 0.0, FENCE_HEIGHT), (0.0, -HALF, FENCE_HEIGHT), 0.014, "steel")
    model.beam((0.0, 0.0, 0.03), (0.0, -HALF, 0.03), 0.008, "steel_dark")
    for height in STRANDS:
        model.beam((0.0, 0.0, FENCE_HEIGHT + height), (0.0, -HALF, FENCE_HEIGHT + height), 0.006,
                   "steel_dark")
    bottom = 0.0
    model.plate((0.0, -HALF / 2.0, (bottom + FENCE_HEIGHT) / 2.0), (HALF, FENCE_HEIGHT - bottom), "+x",
                kit.PANE)
    return model.finish()


def fence_gate(name):
    """The heavier post where the fence ends at a gap: striped, braced, with a red light."""
    model = kit.Builder(name, wear=FENCE_WEAR)
    top = footing(model, 0.06, 0.03)
    half = 0.024
    height = FENCE_HEIGHT + 0.12
    model.box((0.0, 0.0, (top + height) / 2.0), (half * 2.0, half * 2.0, height - top), "steel_dark")
    hazard_bands(model, half, top + 0.02, top + 0.20, 4)
    model.box((0.0, 0.0, height + 0.006), (half * 2.0 + 0.012, half * 2.0 + 0.012, 0.012), "steel")
    warning_light(model, height + 0.012)
    return model.finish()


def coil(model, start_y: float, end_y: float, z: float, loops: int) -> None:
    """Concertina wire seen from afar: a zigzag over and under an axis along Y at height *z*,
    *loops* times, with a straight wire along each side."""
    points = []
    steps = loops * 4
    for index in range(steps + 1):
        angle = index / steps * loops * 2.0 * math.pi
        y = start_y + (end_y - start_y) * index / steps
        points.append((math.sin(angle) * COIL_RADIUS * 0.8, y, z + math.cos(angle) * COIL_RADIUS))
    for first, second in zip(points, points[1:]):
        model.cylinder(first, second, 0.004, "steel", segments=3)
    for x in (-COIL_RADIUS * 0.8, COIL_RADIUS * 0.8):
        model.beam((x, start_y, z - COIL_RADIUS * 0.6), (x, end_y, z - COIL_RADIUS * 0.6), 0.005,
                   "steel_dark")


def wall_half(name):
    """Half a cell of precast concrete wall with a coping and a coil of barbed wire on top.
    It reaches a little past the cell's middle, under the pillar there."""
    model = kit.Builder(name, wear=WALL_WEAR)
    start = WALL_THICK / 2.0
    length = HALF + start
    centre = (start - HALF) / 2.0
    model.box((0.0, centre, 0.02), (WALL_THICK + 0.03, length, 0.04), "concrete_dark")
    model.box((0.0, centre, WALL_HEIGHT / 2.0), (WALL_THICK, length, WALL_HEIGHT), "concrete")
    model.box((0.0, centre, WALL_HEIGHT + 0.0125), (WALL_THICK + 0.024, length, 0.025), "concrete_dark")
    # The joint between two precast panels, on both faces.
    for side, facing in ((-1.0, "-x"), (1.0, "+x")):
        model.plate((side * (WALL_THICK / 2.0 + 0.0006), -HALF / 2.0, WALL_HEIGHT / 2.0),
                    (0.008, WALL_HEIGHT - 0.04), facing, "concrete_dark")
    # A bracket holding the coil, then the coil.
    top = WALL_HEIGHT + 0.025
    model.beam((0.0, -HALF / 2.0, top), (0.0, -HALF / 2.0, top + COIL_RADIUS * 1.6), 0.01, "steel_dark")
    # The coil stops a hair short of the cell's edge: its wire is thicker than nothing.
    coil(model, 0.0, -HALF + 0.006, top + COIL_RADIUS, COIL_LOOPS)
    return model.finish()


def wall_post(name):
    """The pillar in the middle of every wall cell."""
    model = kit.Builder(name, wear=WALL_WEAR)
    half = 0.08
    model.box((0.0, 0.0, 0.02), (half * 2.0 + 0.03, half * 2.0 + 0.03, 0.04), "concrete_dark")
    model.box((0.0, 0.0, (WALL_HEIGHT + 0.04) / 2.0), (half * 2.0, half * 2.0, WALL_HEIGHT + 0.04), "concrete")
    model.box((0.0, 0.0, WALL_HEIGHT + 0.055), (half * 2.0 + 0.02, half * 2.0 + 0.02, 0.03), "concrete_dark")
    return model.finish()


def wall_gate(name):
    """The heavier pillar where the wall ends at a gap: striped, with a red light."""
    model = kit.Builder(name, wear=WALL_WEAR)
    half = 0.10
    height = WALL_HEIGHT + 0.12
    model.box((0.0, 0.0, 0.025), (half * 2.0 + 0.04, half * 2.0 + 0.04, 0.05), "concrete_dark")
    model.box((0.0, 0.0, height / 2.0), (half * 2.0, half * 2.0, height), "concrete")
    hazard_bands(model, half, 0.06, 0.26, 4)
    model.box((0.0, 0.0, height + 0.015), (half * 2.0 + 0.02, half * 2.0 + 0.02, 0.03), "concrete_dark")
    warning_light(model, height + 0.03, 0.022)
    return model.finish()


ONE = (1, 1)
MODELS = {
    "fence_post": (lambda: fence_post("te_grounds_fence_post"), ONE),
    "fence_half": (lambda: fence_half("te_grounds_fence_half"), ONE),
    "fence_gate": (lambda: fence_gate("te_grounds_fence_gate"), ONE),
    "wall_half": (lambda: wall_half("te_grounds_wall_half"), ONE),
    "wall_post": (lambda: wall_post("te_grounds_wall_post"), ONE),
    "wall_gate": (lambda: wall_gate("te_grounds_wall_gate"), ONE),
}

if __name__ == "__main__":
    # Halves reach the cell's edge: they are checked against the whole cell.
    kit.run_many_from_command_line(MODELS, footprint=1.0, max_height=MAX_HEIGHT)
