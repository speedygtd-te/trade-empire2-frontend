"""Monument (1x1x1): an open plaza without walls with a huge stone statue on a two-tier plinth:
a bearded man with long hair in a long robe, one hand raised, a book held to his chest. Four
uplights on the plinth, two benches. No names, no text.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402

WEAR = 0.4
STATUE = "stone"
PLINTH = "stone_dark"
# The statue is drawn 0.72 tall and scaled to its height on the plinth.
DRAWN = 0.72
HEIGHT = 0.78


def build():
    model = kit.Builder("te_monument", wear=WEAR)
    top = parts.slab(model, size=0.84)
    model.plate((0.0, 0.0, top + 0.0006), (0.60, 0.60), "+z", "concrete_dark")
    model.box((0.0, 0.02, top + 0.02), (0.46, 0.46, 0.04), PLINTH)
    model.box((0.0, 0.02, top + 0.075), (0.34, 0.34, 0.07), PLINTH)
    model.box((0.0, 0.02, top + 0.1125), (0.36, 0.36, 0.005), STATUE)
    plinth = top + 0.115
    # A blank brass plaque on the plinth's front.
    model.plate((0.0, 0.02 - 0.17 - 0.0006, top + 0.075), (0.14, 0.04), "-y", "yellow")
    _statue(model, (0.0, 0.04, plinth), HEIGHT / DRAWN)
    # Uplights at the corners of the lower tier, benches left and right.
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.floodlight(model, (sx * 0.20, 0.02 + sy * 0.20, top + 0.05), "+z", size=(0.04, 0.04), depth=0.02)
    for x in (-0.33, 0.33):
        model.box((x, -0.02, top + 0.05), (0.08, 0.26, 0.02), "wood")
        for y in (-0.12, 0.08):
            model.box((x, y, top + 0.02), (0.06, 0.02, 0.04), "steel_dark")
    return model.finish()


def _statue(model, base, scale: float) -> None:
    """A robed, bearded man with long hair, facing the front (-y), drawn DRAWN tall."""
    def at(x, y, z):
        return (base[0] + x * scale, base[1] + y * scale, base[2] + z * scale)

    def revolve(center, profile, segments=12, oval=(1.0, 1.0)):
        model.revolve(at(*center), [(r * scale, z * scale) for r, z in profile], STATUE, segments=segments,
                      scale=oval, sharp=60.0)

    # The robe, from its hem to the shoulders.
    revolve((0.0, 0.0, 0.0), [(0.125, 0.0), (0.12, 0.03), (0.10, 0.20), (0.084, 0.40), (0.09, 0.50),
                              (0.098, 0.56), (0.07, 0.605), (0.03, 0.62), (0.0, 0.625)], segments=14,
            oval=(1.0, 0.72))
    # Folds down the front of the robe.
    for x in (-0.035, 0.035):
        model.cylinder(at(x, -0.075, 0.02), at(x * 0.7, -0.058, 0.38), 0.012 * scale, STATUE, segments=5)
    # A belt.
    revolve((0.0, 0.0, 0.40), [(0.088, 0.0), (0.088, 0.025), (0.0, 0.025)], segments=14, oval=(1.0, 0.72))
    # Neck and head.
    model.cylinder(at(0.0, 0.0, 0.60), at(0.0, 0.0, 0.645), 0.024 * scale, STATUE, segments=8)
    revolve((0.0, -0.004, 0.675), [(0.0, -0.045), (0.032, -0.036), (0.045, -0.01), (0.044, 0.016),
                                  (0.03, 0.038), (0.0, 0.046)], segments=10, oval=(0.88, 1.0))
    model.box(at(0.0, -0.046, 0.68), (0.012 * scale, 0.016 * scale, 0.022 * scale), STATUE)
    # Long hair: a cap over the head and a fall down the back to the shoulders.
    revolve((0.0, 0.016, 0.682), [(0.047, 0.0), (0.045, 0.022), (0.03, 0.04), (0.0, 0.047)], segments=10,
            oval=(0.95, 1.0))
    for side in (-1, 1):
        model.cylinder(at(side * 0.04, 0.0, 0.69), at(side * 0.05, 0.012, 0.585), 0.016 * scale, STATUE,
                       segments=6, end_radius=0.012 * scale)
    revolve((0.0, 0.04, 0.55), [(0.0, 0.0), (0.052, 0.02), (0.056, 0.08), (0.05, 0.13), (0.0, 0.14)],
            segments=10, oval=(1.0, 0.55))
    # A full beard down to the chest.
    revolve((0.0, -0.058, 0.49), [(0.0, 0.0), (0.02, 0.03), (0.038, 0.09), (0.042, 0.14), (0.032, 0.165),
                                  (0.0, 0.172)], segments=10, oval=(1.0, 0.6))
    # The right arm raised beside the head, the left one holding a book to the chest.
    model.cylinder(at(0.085, 0.0, 0.555), at(0.14, -0.015, 0.625), 0.034 * scale, STATUE, segments=8,
                   end_radius=0.028 * scale)
    model.cylinder(at(0.14, -0.015, 0.625), at(0.15, -0.03, 0.69), 0.03 * scale, STATUE, segments=8,
                   end_radius=0.024 * scale)
    model.lump(at(0.152, -0.032, 0.712), (0.034 * scale, 0.026 * scale, 0.042 * scale), STATUE, seed=5,
               rough=0.1)
    model.cylinder(at(-0.085, 0.0, 0.555), at(-0.115, -0.025, 0.44), 0.034 * scale, STATUE, segments=8,
                   end_radius=0.028 * scale)
    model.cylinder(at(-0.115, -0.025, 0.44), at(-0.04, -0.07, 0.47), 0.028 * scale, STATUE, segments=8,
                   end_radius=0.022 * scale)
    model.box(at(-0.03, -0.085, 0.47), (0.08 * scale, 0.022 * scale, 0.10 * scale), STATUE)


if __name__ == "__main__":
    kit.run_from_command_line(build)
