"""Retaining walls where the ground beside a structure lies three quarters of a cell or more above or
below its floor (core/terrain_relief.gd decides where, core/retaining_walls.gd places the pieces,
game/world/retaining_layer.gd draws them). Writes <name>.glb for each piece into --output-dir.

A wall runs along cell edges; the game puts it together from these pieces, one per edge or corner:

- *panel*: the wall between two pilasters, one cell long minus a pilaster, built one cell tall
  and stretched to the wall's height (only vertical detail, so the stretch does not show) and
  sheared where its top follows a slope; centred on the edge, its face towards -Y (the model's
  front, the side the wall looks to).
- *cap*: the coping on a panel; *column* and *column_cap*: the pilaster on every corner along the
  wall (square, so the same piece closes straight runs, outer and inner corners).
- *footing*: the step at the foot of a foundation wall; *gutter*: the drainage channel at the
  foot of a wall holding back a slope; *drain*: two weep pipes with the stains below them;
  *rail*: the railing on top of a tall wall holding back a slope.

Over water a structure stands on a pier instead of a wall (core/piers.gd):

- *pier_pillar*: a round column, one cell tall and stretched from below the water up under the
  floor; *pier_head*: the square block on top of it, under the floor's edge; *pier_beam*: the
  edge beam from head to head under the floor (also a brace between tall pillars);
  *pier_collar*: the tide band where a pillar meets the water (COLLAR_WATERLINE above its foot),
  dark and overgrown below.
- *caisson*: a short round concrete foundation for a mast, lamp or fence post standing in the
  water: CAISSON_SINK below the waterline, CAISSON_SHOWS above it.

Every piece's origin is its foot (the build checks that); core/piers.gd places them.

Exposed concrete like the foundations and the base grounds, weathered (WEAR).
  blender --background --factory-startup --python scripts/3d/models/retaining.py -- \
      --output-dir game/world/models/retaining [--only panel,cap,pier_pillar]
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

kit.TEXTURE_PIXELS = 256
kit.BAKE_SAMPLES = 16
kit.SURFACE_REPEATS = 4.0

WEAR = 0.8
# Keep in step with core/retaining_walls.gd.
PILASTER = 0.16
THICK = 0.08
LENGTH = 1.0 - PILASTER
CAP_HEIGHT = 0.04
CAP_DEPTH = 0.11
COLUMN_CAP_HEIGHT = 0.055
FOOT_WIDTH = (PILASTER - THICK) / 2.0
FOOTING_DEPTH = 0.2
GUTTER_DEPTH = 0.06
RAIL_HEIGHT = 0.12
FRONT = -THICK / 2.0
# Pier and caisson (keep in step with core/piers.gd).
PIER_RADIUS = 0.065
PIER_HEAD = 0.17
PIER_HEAD_HEIGHT = 0.06
PIER_BEAM_WIDTH = 0.09
PIER_BEAM_HEIGHT = 0.055
PIER_BEAM_LENGTH = 1.0 - PIER_HEAD
CAISSON_RADIUS = 0.15
CAISSON_SHOWS = 0.06
CAISSON_SINK = 0.3
COLLAR_WATERLINE = 0.03


def panel(name):
    """One cell tall; the formwork joints run upright, so stretching it to any height shows nothing."""
    model = kit.Builder(name, wear=WEAR)
    model.box((0.0, 0.0, 0.5), (LENGTH, THICK, 1.0), "concrete")
    for x in (-LENGTH / 3.0, 0.0, LENGTH / 3.0):
        model.plate((x, FRONT - 0.0006, 0.5), (0.006, 1.0), "-y", "concrete_dark")
    return model.finish()


def cap(name):
    """The coping: a slab overhanging the panel on both faces, a narrower one on top."""
    model = kit.Builder(name, wear=WEAR)
    model.box((0.0, 0.0, 0.015), (LENGTH, CAP_DEPTH, 0.03), "concrete")
    model.box((0.0, 0.0, 0.035), (LENGTH, CAP_DEPTH - 0.03, 0.01), "concrete")
    return model.finish()


def column(name):
    """The pilaster, one cell tall like the panel, with a shadow joint on its face."""
    model = kit.Builder(name, wear=WEAR)
    model.box((0.0, 0.0, 0.5), (PILASTER, PILASTER, 1.0), "concrete")
    model.plate((0.0, -PILASTER / 2.0 - 0.0006, 0.5), (0.008, 1.0), "-y", "concrete_dark")
    return model.finish()


def column_cap(name):
    """A heavier coping on a pilaster, standing above the panels' copings."""
    model = kit.Builder(name, wear=WEAR)
    model.box((0.0, 0.0, 0.0175), (PILASTER + 0.03, PILASTER + 0.03, 0.035), "concrete")
    model.box((0.0, 0.0, 0.045), (PILASTER + 0.01, PILASTER + 0.01, 0.02), "concrete_dark")
    return model.finish()


def footing(name):
    """The step at the foot of a foundation wall; most of it reaches into the ground."""
    model = kit.Builder(name, wear=WEAR)
    model.box((0.0, FRONT - FOOT_WIDTH / 2.0, FOOTING_DEPTH / 2.0), (LENGTH, FOOT_WIDTH, FOOTING_DEPTH),
              "concrete_dark")
    return model.finish()


def gutter(name):
    """A concrete channel along the foot of a wall holding back a slope, with a steel grate."""
    model = kit.Builder(name, wear=WEAR)
    y = FRONT - FOOT_WIDTH / 2.0
    model.box((0.0, y, GUTTER_DEPTH / 2.0), (LENGTH, FOOT_WIDTH, GUTTER_DEPTH), "concrete_dark")
    model.plate((0.0, y, GUTTER_DEPTH + 0.0006), (LENGTH - 0.02, FOOT_WIDTH * 0.6), "+z", "dark")
    for index in range(7):
        x = (index - 3) * LENGTH / 7.0
        model.plate((x, y, GUTTER_DEPTH + 0.0012), (0.012, FOOT_WIDTH * 0.6), "+z", "steel_dark")
    return model.finish()


def drain(name):
    """Two weep pipes out of the wall's face, each over a dark streak where the water ran down."""
    model = kit.Builder(name, wear=WEAR)
    for x in (-LENGTH / 4.0, LENGTH / 4.0):
        model.plate((x, FRONT - 0.0008, 0.07), (0.035, 0.14), "-y", "concrete_dark")
        model.plate((x, FRONT - 0.0014, 0.09), (0.012, 0.10), "-y", "rust_brown_dark")
        model.beam((x, FRONT + 0.004, 0.15), (x, FRONT - 0.03, 0.15), 0.024, "steel_dark")
        model.plate((x, FRONT - 0.0306, 0.15), (0.014, 0.014), "-y", "dark")
    return model.finish()


def rail(name):
    """A railing along the top edge of the ground held back, one cell long (runs meet on the
    pilasters)."""
    model = kit.Builder(name, wear=WEAR)
    y = 0.02
    for x in (-0.25, 0.25):
        model.beam((x, y, 0.0), (x, y, RAIL_HEIGHT), 0.012, "yellow")
    model.beam((-0.5, y, RAIL_HEIGHT), (0.5, y, RAIL_HEIGHT), 0.012, "yellow")
    model.beam((-0.5, y, RAIL_HEIGHT * 0.55), (0.5, y, RAIL_HEIGHT * 0.55), 0.008, "steel_dark")
    return model.finish()


def pier_pillar(name):
    """A round column, one cell tall (stretched to the pier's height)."""
    model = kit.Builder(name, wear=WEAR)
    model.cylinder((0.0, 0.0, 0.0), (0.0, 0.0, 1.0), PIER_RADIUS, "concrete", segments=12)
    return model.finish()


def pier_head(name):
    """The block on a pillar under the floor's edge (PIER_HEAD_TOTAL tall), with a dark seat."""
    model = kit.Builder(name, wear=WEAR)
    model.box((0.0, 0.0, 0.008), (PIER_RADIUS * 2.4, PIER_RADIUS * 2.4, 0.016), "concrete_dark")
    model.box((0.0, 0.0, 0.016 + PIER_HEAD_HEIGHT / 2.0), (PIER_HEAD, PIER_HEAD, PIER_HEAD_HEIGHT), "concrete")
    return model.finish()


def pier_beam(name):
    """The edge beam between two heads (PIER_BEAM_HEIGHT tall); a drip joint along its face."""
    model = kit.Builder(name, wear=WEAR)
    model.box((0.0, 0.0, PIER_BEAM_HEIGHT / 2.0), (PIER_BEAM_LENGTH, PIER_BEAM_WIDTH, PIER_BEAM_HEIGHT),
              "concrete")
    model.plate((0.0, -PIER_BEAM_WIDTH / 2.0 - 0.0006, PIER_BEAM_HEIGHT * 0.3),
                (PIER_BEAM_LENGTH, 0.006), "-y", "concrete_dark")
    return model.finish()


def pier_collar(name):
    """The tide band around a pillar, the waterline COLLAR_WATERLINE above its foot: an overgrown
    band at the water and a little below, wet dark concrete above."""
    model = kit.Builder(name, wear=WEAR)
    radius = PIER_RADIUS + 0.008
    model.cylinder((0.0, 0.0, 0.0), (0.0, 0.0, COLLAR_WATERLINE + 0.012), radius + 0.004, "moss", segments=12)
    model.cylinder((0.0, 0.0, COLLAR_WATERLINE + 0.012), (0.0, 0.0, COLLAR_WATERLINE + 0.07), radius,
                   "concrete_dark", segments=12)
    return model.finish()


def caisson(name):
    """A round concrete foundation standing in the water for a mast or a post, CAISSON_SINK of it
    below the waterline and CAISSON_SHOWS above: a chamfered rim on top, a tide band at the water."""
    model = kit.Builder(name, wear=WEAR)
    water = CAISSON_SINK
    top = CAISSON_SINK + CAISSON_SHOWS
    model.cylinder((0.0, 0.0, 0.0), (0.0, 0.0, top - 0.015), CAISSON_RADIUS, "concrete", segments=14)
    model.cylinder((0.0, 0.0, top - 0.015), (0.0, 0.0, top), CAISSON_RADIUS, "concrete", segments=14,
                   end_radius=CAISSON_RADIUS - 0.012)
    model.cylinder((0.0, 0.0, water - 0.03), (0.0, 0.0, water + 0.014), CAISSON_RADIUS + 0.005, "moss",
                   segments=14)
    model.cylinder((0.0, 0.0, water + 0.014), (0.0, 0.0, water + 0.03), CAISSON_RADIUS + 0.002,
                   "concrete_dark", segments=14)
    return model.finish()


ONE = (1, 1)
MODELS = {
    "panel": (lambda: panel("te_retaining_panel"), ONE),
    "cap": (lambda: cap("te_retaining_cap"), ONE),
    "column": (lambda: column("te_retaining_column"), ONE),
    "column_cap": (lambda: column_cap("te_retaining_column_cap"), ONE),
    "footing": (lambda: footing("te_retaining_footing"), ONE),
    "gutter": (lambda: gutter("te_retaining_gutter"), ONE),
    "drain": (lambda: drain("te_retaining_drain"), ONE),
    "rail": (lambda: rail("te_retaining_rail"), ONE),
    "pier_pillar": (lambda: pier_pillar("te_pier_pillar"), ONE),
    "pier_head": (lambda: pier_head("te_pier_head"), ONE),
    "pier_beam": (lambda: pier_beam("te_pier_beam"), ONE),
    "pier_collar": (lambda: pier_collar("te_pier_collar"), ONE),
    "caisson": (lambda: caisson("te_caisson"), ONE),
}

if __name__ == "__main__":
    # The pieces reach the cell's edge (rails) and the panel is one cell tall.
    kit.run_many_from_command_line(MODELS, footprint=1.0, max_height=1.0)
