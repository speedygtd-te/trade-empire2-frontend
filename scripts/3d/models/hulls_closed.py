"""The indoor hulls seen from outside (closed structure), after the V1 hull sprites
(src/assets/hulls in V1): one container per cell, cleaner than industry (low wear), except the
rusty starter hull. Writes hull_<type>_closed.glb for every type; a type missing here is drawn
with hull_standard_closed. Opened, a structure shows the hull floors instead (hull_*.py).
  blender --background --factory-startup --python scripts/3d/models/hulls_closed.py -- --output-dir <folder> [--only hull_starter_closed]
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import hulls  # noqa: E402
import kit  # noqa: E402

ONE = (1, 1)

MODELS = {
    # Rusty brown container with double doors and a warm lamp.
    "hull_starter_closed": (lambda: hulls.container(
        "te_hull_starter_closed", wall="rust_brown", frame="rust_brown_dark", roof="rust_brown",
        door="rust_brown_dark", wear=0.85), ONE),
    # Light grey panels, cyan light strips on the roof frame and the posts.
    "hull_standard_closed": (lambda: hulls.container(
        "te_hull_standard_closed", wall="paint_grey", frame="steel", roof="paint_grey",
        roof_strip="glow_cyan", post_strip="glow_cyan"), ONE),
    # Dark navy armour, orange lamps up the posts.
    "hull_reinforced_closed": (lambda: hulls.container(
        "te_hull_reinforced_closed", wall="navy", frame="steel_dark", roof="navy",
        post_strip="glow_orange", wear=0.3), ONE),
    # Black, a large window per side, green lamps; props behind the glass.
    "hull_airtight_closed": (lambda: hulls.container(
        "te_hull_airtight_closed", wall="black_metal", frame="steel_dark", roof="black_metal",
        windows=True, dots="glow_green"), ONE),
    # Light grey with blue star braces on the walls.
    "hull_pressurized_closed": (lambda: hulls.container(
        "te_hull_pressurized_closed", wall="paint_grey", frame="steel", roof="paint_grey",
        braces="blue_paint", lamp="glow_orange"), ONE),
    # Navy panels, yellow and black hazard stripes on the frame.
    "hull_composite_closed": (lambda: hulls.container(
        "te_hull_composite_closed", wall="navy", frame="black_metal", roof="navy", hazard=True,
        wear=0.3), ONE),
    # Carbon frame, walls and roof of glass, cyan strips; props and plants behind the glass.
    "hull_glass_carbon_closed": (lambda: hulls.container(
        "te_hull_glass_carbon_closed", wall="black_metal", frame="black_metal", roof="black_metal",
        glass=True, roof_strip="glow_cyan", post_strip="glow_cyan", wear=0.15), ONE),
}

if __name__ == "__main__":
    kit.run_many_from_command_line(MODELS, footprint=1.0)
