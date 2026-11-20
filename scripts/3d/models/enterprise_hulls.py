"""The enterprise hulls (Backend-V2/docs/SPEC-enterprise-flaggschiff.md, 5.1) in the clean
enterprise look (kit style "enterprise", hulls.enterprise_*): the open floors of all six, and the
three indoor ones seen from outside (hull_<type>_closed, like hulls_closed.py). File names follow
StructureLook.hull_model: "hull_" + the hull type in lower case.

  blender --background --factory-startup --python scripts/3d/models/enterprise_hulls.py -- --output-dir <folder> [--only hull_enterprise_dock]
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import hulls  # noqa: E402
import kit  # noqa: E402

ONE = (1, 1)

MODELS = {
    # Indoor: light tiles with fine seams, a cyan point where four cells meet.
    "hull_enterprise_hull_standard": (lambda: hulls.enterprise_floor(
        "te_hull_enterprise_hull_standard"), ONE),
    "hull_enterprise_hull_standard_closed": (lambda: hulls.enterprise_container(
        "te_hull_enterprise_hull_standard_closed"), ONE),
    # Indoor glass: a dark glass floor panel framed in cyan; outside all glass between white posts.
    "hull_enterprise_hull_glass": (lambda: hulls.enterprise_floor(
        "te_hull_enterprise_hull_glass", kind="glass"), ONE),
    "hull_enterprise_hull_glass_closed": (lambda: hulls.enterprise_container(
        "te_hull_enterprise_hull_glass_closed", kind="glass"), ONE),
    # Indoor armoured: grey armour plates in carbon; outside heavier grey panels, a slot window.
    "hull_enterprise_hull_armored": (lambda: hulls.enterprise_floor(
        "te_hull_enterprise_hull_armored", kind="armored"), ONE),
    "hull_enterprise_hull_armored_closed": (lambda: hulls.enterprise_container(
        "te_hull_enterprise_hull_armored_closed", kind="armored"), ONE),
    # Outdoor decks for thrusters, telescopes, weapons.
    "hull_enterprise_platform": (lambda: hulls.enterprise_platform("te_hull_enterprise_platform"), ONE),
    "hull_enterprise_platform_armored": (lambda: hulls.enterprise_platform(
        "te_hull_enterprise_platform_armored", armored=True), ONE),
    "hull_enterprise_dock": (lambda: hulls.enterprise_dock("te_hull_enterprise_dock"), ONE),
}

if __name__ == "__main__":
    kit.run_many_from_command_line(MODELS, footprint=1.0)
