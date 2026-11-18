"""Recreation corner (1x1x1): an open concrete room with a big screen on the back wall, an
arcade cabinet, a table with stools and hanging lamps. Modelled after
src/assets/modules/recreation_corner/recreation_corner_0.webp.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402


def build():
    model = kit.Builder("te_recreation_corner")
    top = parts.room(model, floor="concrete", wall="concrete", cap="concrete_dark", trim="glow_orange")
    # Screen on the back wall, a picture on the left wall.
    model.box((0.08, 0.33, top + 0.26), (0.30, 0.03, 0.18), "steel_dark")
    model.plate((0.08, 0.315 - 0.0006, top + 0.26), (0.26, 0.14), "-y", "glow_cyan")
    model.plate((-0.35 + 0.0006, 0.02, top + 0.24), (0.16, 0.12), "+x", "glow_orange")
    # Arcade cabinet in the corner.
    model.box((-0.24, 0.22, top + 0.13), (0.12, 0.12, 0.26), "rust_brown")
    model.plate((-0.24, 0.16 - 0.0006, top + 0.19), (0.08, 0.06), "-y", "glow_cyan")
    # Table with a glowing top and two stools.
    model.cylinder((0.12, -0.06, top), (0.12, -0.06, top + 0.10), 0.015, "steel_dark", segments=6)
    model.box((0.12, -0.06, top + 0.105), (0.24, 0.14, 0.015), "steel_light")
    model.plate((0.12, -0.06, top + 0.1131), (0.20, 0.10), "+z", "glow_cyan")
    for x, y in ((-0.05, -0.08), (0.12, -0.22)):
        model.cylinder((x, y, top), (x, y, top + 0.07), 0.01, "steel_dark", segments=6)
        model.cylinder((x, y, top + 0.07), (x, y, top + 0.085), 0.035, "red", segments=8)
    # Hanging lamps.
    for x in (0.18, 0.26):
        model.beam((x, 0.12, top + 0.40), (x, 0.12, top + 0.30), 0.006, "steel_dark")
        model.cylinder((x, 0.12, top + 0.30), (x, 0.12, top + 0.27), 0.025, "glow_orange", segments=8,
                       end_radius=0.01)
    parts.barrel(model, (-0.26, -0.26), top, radius=0.035, height=0.09, color="rust_brown")
    return model.finish()


if __name__ == "__main__":
    kit.run_from_command_line(build)
