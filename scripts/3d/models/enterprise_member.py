"""The player modules that enterprise research unlocks for the members
(Backend-V2/docs/SPEC-enterprise-flaggschiff.md 6a): ordinary player items in the rough player
look, not the enterprise style. The keys are the spec's working titles:

  RESEARCH_NETWORK_NODE  (6a.2, 1x1 indoor)  links the labs of a structure
  OBSERVATION_UPLINK     (6a.3, 1x1 outdoor) feeds the telescopes into the enterprise network
  MINING_OPTIMIZER       (6a.4, 1x1 indoor)  sends EXTRACTION_FOCUS to the mines nearby

  blender --background --factory-startup --python scripts/3d/models/enterprise_member.py -- \
      --output-dir game/world/models [--only mining_optimizer]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import parts  # noqa: E402


def _rack(model, center, z: float, height: float, seed: int) -> None:
    """A server rack: a dark steel cabinet with rows of status lights on its front (-y)."""
    import random
    generator = random.Random(seed)
    x, y = center
    model.box((x, y, z + height / 2.0), (0.16, 0.14, height), "steel_dark")
    model.box((x, y, z + height + 0.01), (0.17, 0.15, 0.02), "steel")
    front = y - 0.07 - 0.0006
    model.plate((x, front, z + height / 2.0), (0.13, height - 0.04), "-y", "dark")
    for row in range(int((height - 0.06) / 0.04)):
        level = z + 0.04 + row * 0.04
        model.plate((x - 0.02, front - 0.0006, level), (0.08, 0.012), "-y", "steel_light")
        color = generator.choice(("glow_cyan", "glow_cyan", "glow_green", "glow_orange"))
        model.plate((x + 0.045, front - 0.0006, level), (0.014, 0.014), "-y", color)


def research_network_node():
    """Two server racks with antennas, joined by cable trays to a caged core of glowing purple
    (the link to the other labs), a yellow-black floor marking, a control box."""
    model = kit.Builder("te_research_network_node")
    top = parts.slab(model)
    _rack(model, (-0.24, 0.24), top, 0.40, seed=1)
    _rack(model, (-0.24, 0.02), top, 0.34, seed=2)
    for y, height in ((0.24, 0.40), (0.02, 0.34)):
        model.cylinder((-0.28, y, top + height + 0.02), (-0.28, y, top + height + 0.16), 0.006, "steel_light",
                       segments=5)
        parts.tip_light(model, (-0.28, y), top + height + 0.16)
    # The caged core.
    cx, cy = 0.12, 0.04
    parts.braced_frame(model, (cx, cy), 0.13, top, top + 0.40, leg=0.026)
    model.box((cx, cy, top + 0.02), (0.30, 0.30, 0.04), "steel")
    model.box((cx, cy, top + 0.41), (0.30, 0.30, 0.03), "steel_dark")
    model.cylinder((cx, cy, top + 0.04), (cx, cy, top + 0.12), 0.07, "steel_dark", segments=10)
    parts.ent_sphere(model, (cx, cy, top + 0.22), 0.085, "glow_purple", rings=6, segments=12)
    for z in (0.17, 0.27):
        parts.torus(model, (cx, cy, top + z), 0.095, 0.010, "yellow", segments=14, sides=5)
    model.cylinder((cx, cy, top + 0.31), (cx, cy, top + 0.395), 0.035, "steel", segments=8)
    # Cable trays from the racks to the core.
    for y in (0.24, 0.02):
        parts.pipe(model, [(-0.16, y, top + 0.30), (-0.02, y, top + 0.30), (-0.02, cy, top + 0.30),
                           (cx - 0.08, cy, top + 0.30)], radius=0.014, color="black_metal")
    parts.pipe(model, [(-0.16, 0.13, top + 0.06), (0.0, 0.13, top + 0.06), (0.0, cy, top + 0.08)], radius=0.016,
               color="rust_brown")
    parts.stripes(model, (0.10, -0.30), 5)
    parts.control_box(model, (0.30, -0.28))
    return model.finish()


def observation_uplink():
    """A tracking dish on a stout pedestal that sweeps the sky (moving part "dish"), an equipment
    cabinet with a vent and a cable to the pedestal, a lamp post."""
    model = kit.Builder("te_observation_uplink")
    top = parts.slab(model)
    model.box((0.0, 0.06, top + 0.04), (0.30, 0.30, 0.08), "concrete_dark")
    model.cylinder((0.0, 0.06, top + 0.08), (0.0, 0.06, top + 0.30), 0.07, "steel", segments=10)
    model.cylinder((0.0, 0.06, top + 0.12), (0.0, 0.06, top + 0.14), 0.075, "yellow", segments=10)
    with model.moving("dish", (0.0, 0.06, top + 0.30)):
        model.box((0.0, 0.06, top + 0.32), (0.16, 0.12, 0.04), "steel_dark")
        with model.placed((0.0, 0.06, top + 0.40), tilt=math.radians(30.0)):
            parts.dish(model, 0.24, 0.08, accent="glow_cyan", struts=4)
    # The cabinet at the front left.
    model.box((-0.24, -0.22, top + 0.11), (0.20, 0.16, 0.22), "blue")
    model.box((-0.24, -0.22, top + 0.23), (0.22, 0.18, 0.02), "blue_dark")
    parts.vent(model, (-0.24, -0.30 - 0.0006, top + 0.12), (0.12, 0.10), "-y")
    parts.lamp(model, (-0.16, -0.301, top + 0.20), (0.02, 0.006, 0.02), "glow_cyan")
    parts.pipe(model, [(-0.14, -0.20, top + 0.06), (-0.06, -0.06, top + 0.06), (-0.06, 0.06, top + 0.06)],
               radius=0.014, color="black_metal")
    parts.stripes(model, (0.14, -0.33), 5)
    parts.lamp_post(model, (0.33, -0.33), top, height=0.26)
    return model.finish()


def mining_optimizer():
    """A resonator on a heavy base: a column of copper coils between steel spacers, a warm glow at
    its heart, an emitter head with four arms turning on top (moving part "rotor") that sends the
    extraction focus to the mines; a gauge cabinet and feed pipes beside it."""
    model = kit.Builder("te_mining_optimizer")
    top = parts.slab(model)
    model.box((0.04, 0.04, top + 0.05), (0.50, 0.50, 0.10), "rust_brown")
    model.plate((0.04, 0.04 - 0.25 - 0.0006, top + 0.08), (0.50, 0.02), "-y", "yellow")
    model.plate((0.04 + 0.25 + 0.0006, 0.04, top + 0.08), (0.50, 0.02), "+x", "yellow")
    base = top + 0.10
    cx, cy = 0.04, 0.04
    model.cylinder((cx, cy, base), (cx, cy, base + 0.04), 0.16, "steel_dark", segments=12)
    for index in range(4):
        z = base + 0.05 + index * 0.075
        parts.torus(model, (cx, cy, z + 0.03), 0.105, 0.028, "copper", segments=14, sides=6)
        model.cylinder((cx, cy, z + 0.06), (cx, cy, z + 0.075), 0.12, "steel", segments=12)
    model.cylinder((cx, cy, base + 0.04), (cx, cy, base + 0.36), 0.07, "glow_orange", segments=10)
    for angle in (0.0, math.pi / 2.0, math.pi, -math.pi / 2.0):
        ux, uy = math.cos(angle + math.pi / 4.0), math.sin(angle + math.pi / 4.0)
        model.beam((cx + ux * 0.15, cy + uy * 0.15, base + 0.04), (cx + ux * 0.15, cy + uy * 0.15, base + 0.36), 0.022,
                   "steel_dark")
    head = base + 0.36
    model.cylinder((cx, cy, head), (cx, cy, head + 0.03), 0.17, "steel_dark", segments=12)
    with model.moving("rotor", (cx, cy, head + 0.03)):
        model.cylinder((cx, cy, head + 0.03), (cx, cy, head + 0.09), 0.06, "yellow", segments=10)
        for index in range(4):
            angle = index * math.pi / 2.0
            ux, uy = math.cos(angle), math.sin(angle)
            model.beam((cx + ux * 0.05, cy + uy * 0.05, head + 0.06), (cx + ux * 0.19, cy + uy * 0.19, head + 0.08),
                       0.024, "steel")
            model.cylinder((cx + ux * 0.19, cy + uy * 0.19, head + 0.05), (cx + ux * 0.19, cy + uy * 0.19, head + 0.11),
                           0.022, "glow_orange", segments=8)
        model.cylinder((cx, cy, head + 0.09), (cx, cy, head + 0.13), 0.02, "steel_light", segments=8)
    # Gauge cabinet and feed pipes.
    model.box((-0.30, -0.26, top + 0.12), (0.12, 0.12, 0.24), "steel")
    model.plate((-0.30, -0.32 - 0.0006, top + 0.17), (0.08, 0.06), "-y", "dark")
    model.plate((-0.30, -0.32 - 0.0012, top + 0.17), (0.05, 0.03), "-y", "glow_green")
    parts.lamp(model, (-0.30, -0.26, top + 0.255), (0.03, 0.03, 0.02), "glow_orange")
    parts.pipe(model, [(-0.24, -0.26, top + 0.20), (-0.12, -0.12, top + 0.20), (-0.06, -0.06, top + 0.20)],
               radius=0.016, color="steel_dark")
    parts.pipe(model, [(0.34, -0.30, top), (0.34, -0.30, top + 0.06), (0.22, -0.18, top + 0.06)], radius=0.018,
               color="rust")
    parts.valve(model, (0.34, -0.30))
    return model.finish()


ONE = (1, 1)
MODELS = {
    "research_network_node": (research_network_node, ONE),
    "observation_uplink": (observation_uplink, ONE),
    "mining_optimizer": (mining_optimizer, ONE),
}

if __name__ == "__main__":
    kit.run_many_from_command_line(MODELS)
