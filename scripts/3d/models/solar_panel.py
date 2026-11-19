"""Solar panel (1x1x1): a tilted panel of four cells on a post, standing on a steel base
plate, with a battery cabinet at the front left and a cable up to the panel.

Modelled after the V1 sprite src/assets/modules/solar_panel/solar_panel_0.webp.

  blender --background --factory-startup --python scripts/3d/models/solar_panel.py -- --output <file.glb>
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

NAME = "te_solar_panel"

POST = (0.06, 0.08)
HEAD = 0.40
PANEL = (0.66, 0.54)
CABINET = (-0.25, -0.26)


def build():
    model = kit.Builder(NAME)
    model.box((0.0, 0.0, 0.02), (0.82, 0.82, 0.04), "steel_dark")
    model.box((0.06, 0.06, 0.0475), (0.50, 0.50, 0.015), "steel")
    parts.stripes(model, (0.0, -0.385), 9, z=0.04)

    model.box((POST[0], POST[1], 0.075), (0.12, 0.12, 0.04), "steel_dark")
    model.beam((POST[0], POST[1], 0.055), (POST[0], POST[1], HEAD), 0.05, "steel_dark")
    model.box((POST[0], POST[1], HEAD - 0.02), (0.07, 0.07, 0.04), "steel")
    # At rest the panel looks to the front and a little to the right, towards the game camera.
    # It is a moving part ("panel"): by day the game turns it towards the sun.
    head = (POST[0], POST[1], HEAD + 0.05)
    turn, tilt = math.radians(20.0), math.radians(38.0)
    with model.moving("panel", head, turn=turn, tilt=tilt):
        with model.placed(head, turn=turn, tilt=tilt):
            model.box((0.0, 0.0, 0.0), (PANEL[0], PANEL[1], 0.025), "steel_light")
            model.box((0.0, 0.0, -0.03), (0.06, 0.06, 0.04), "steel")
            cell = (PANEL[0] / 2.0 - 0.03, PANEL[1] / 2.0 - 0.03)
            for sx in (-1, 1):
                for sy in (-1, 1):
                    center = (sx * (cell[0] / 2.0 + 0.01), sy * (cell[1] / 2.0 + 0.01))
                    model.plate((*center, 0.0131), cell, "+z", "solar")
                    model.plate((*center, 0.0137), (0.005, cell[1]), "+z", "blue")

    _cabinet(model)
    parts.pipe(model, [(CABINET[0] + 0.06, CABINET[1] + 0.05, 0.26),
                       (CABINET[0] + 0.06, CABINET[1] + 0.05, 0.33),
                       (POST[0] - 0.02, POST[1] - 0.02, 0.33)], radius=0.012)
    return model.finish()


def _cabinet(model) -> None:
    """Battery cabinet: a steel box with a lid, a vent and a yellow sign."""
    x, y = CABINET
    model.box((x, y, 0.04 + 0.11), (0.24, 0.22, 0.22), "steel")
    model.box((x, y, 0.2675), (0.26, 0.24, 0.015), "steel_dark")
    parts.vent(model, (x + 0.04, y - 0.11, 0.20), (0.10, 0.05), "-y")
    parts.window(model, (x - 0.06, y - 0.11, 0.12), (0.06, 0.06), "-y")
    parts.vent(model, (x + 0.12, y, 0.14), (0.12, 0.08), "+x", slats=5)
    # Status lights on the lid, a lamp post at the front right of the plate.
    parts.lamp(model, (x - 0.07, y - 0.07, 0.2815), (0.024, 0.024, 0.014), "glow_green")
    parts.lamp(model, (x - 0.03, y - 0.07, 0.2815), (0.024, 0.024, 0.014), parts.STATUS)
    parts.lamp_post(model, (0.36, -0.34), 0.04, height=0.24)


if __name__ == "__main__":
    kit.run_from_command_line(build)
