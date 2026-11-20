"""Building kit for hand-made low-poly models. Runs inside Blender (written against 5.3).

A model is one mesh, plus its moving parts (Builder.moving: a rotor, a fan, a dish), which
become child objects the game moves. Every face has a palette colour and a surface kind (metal or concrete).
For the game file the look is baked into one texture per model: the colour, broken up by a
generated surface texture (scripts/3d/textures, made by scripts/3d/make-texture.cjs), rust,
dirt in the corners and worn edges. Changing the palette, the surface textures or the recipe
below changes every model on its next build; no model has to be touched.

Sizes are in grid cells; up is Z. A 1x1x1 module has to stay within FOOTPRINT on the ground
and below MAX_HEIGHT.

The model scripts in this folder (pump.py) use it and run two ways:
  - without a window (builds, bakes and writes the game file):
      blender --background --factory-startup --python scripts/3d/models/pump.py -- --output <file.glb>
  - in a running Blender through the MCP server (tool execute_blender_code), to look at the
    shape while working on it: put this folder on sys.path, import and reload kit and the
    model module, call build() and show(). The model appears with flat colours in the scene
    STAGE_SCENE; scenes and objects of the user are left alone. Nothing is baked or exported
    there: see export_glb.
"""

import argparse
import math
import os
import random
import sys
from contextlib import contextmanager

import bmesh
import bpy
import numpy
from mathutils import Euler, Matrix, Vector

FOOTPRINT = 0.9
MAX_HEIGHT = 1.0
STAGE_SCENE = "Trade Empire"
# The surface textures; TE_TEXTURE_FOLDER points a build at another set, to compare sources.
TEXTURE_FOLDER = os.environ.get("TE_TEXTURE_FOLDER") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), os.pardir, "textures")

# Colour name -> (sRGB colour, surface kind, finish[, surface texture]). Kinds: "metal" (surface
# texture, rust), "concrete" (surface texture), "plain" (flat: glass, openings, rubber). The
# finish is (roughness, metalness), each 0..1: low roughness shines, high metalness mirrors the
# surroundings in the colour of the surface. The surface texture is the file in TEXTURE_FOLDER
# (without .jpg) that breaks up the colour; without one, metal.jpg or concrete.jpg after the
# kind. A colour naming its own texture should be of kind "concrete" (no rust).
_PAINT = (0.42, 0.35)
_MATTE = (0.90, 0.0)
PALETTE = {
    "steel": ((0.34, 0.44, 0.47), "metal", (0.45, 0.35)),
    "steel_dark": ((0.20, 0.27, 0.30), "metal", (0.50, 0.30)),
    "steel_light": ((0.55, 0.64, 0.66), "metal", (0.35, 0.60)),
    "concrete": ((0.54, 0.53, 0.50), "concrete", _MATTE),
    "concrete_dark": ((0.37, 0.36, 0.34), "concrete", _MATTE),
    "rust": ((0.60, 0.32, 0.17), "metal", (0.85, 0.10)),
    "red": ((0.74, 0.17, 0.12), "metal", _PAINT),
    "yellow": ((0.82, 0.62, 0.15), "metal", _PAINT),
    # Old, dark, matt paint (Rudi, 2026-11-18: dark even in strong sun). A metal mirrors the
    # surroundings in its own colour, so a dark colour turns almost black when it is made
    # metallic (tried 2026-11-17): the blues stay mostly paint, with little metalness.
    "blue": ((0.15, 0.24, 0.36), "metal", (0.62, 0.15)),
    "blue_dark": ((0.10, 0.16, 0.25), "metal", (0.66, 0.12)),
    # Floors and base plates: dirty exposed concrete.
    "floor": ((0.44, 0.43, 0.40), "concrete", _MATTE),
    "rock": ((0.41, 0.36, 0.31), "concrete", _MATTE),
    "solar": ((0.06, 0.10, 0.24), "plain", (0.10, 0.30)),
    "glass": ((0.52, 0.72, 0.80), "plain", (0.06, 0.0)),
    "dark": ((0.07, 0.08, 0.09), "plain", (0.60, 0.0)),
    "rust_brown": ((0.42, 0.24, 0.16), "metal", (0.70, 0.30)),
    "rust_brown_dark": ((0.28, 0.16, 0.11), "metal", (0.75, 0.25)),
    "green": ((0.30, 0.55, 0.25), "plain", (0.80, 0.0)),
    "white": ((0.74, 0.75, 0.73), "metal", _PAINT),
    # Lit things (molten metal, grow lights, screens) and windows: they glow, see GLOWS.
    "glow_orange": ((1.0, 0.55, 0.12), "plain", (0.40, 0.0)),
    "glow_purple": ((0.78, 0.35, 1.0), "plain", (0.40, 0.0)),
    "glow_cyan": ((0.35, 0.90, 0.90), "plain", (0.20, 0.0)),
    "window": ((0.08, 0.09, 0.10), "plain", (0.12, 0.0)),
    "glow_green": ((0.35, 0.95, 0.45), "plain", (0.30, 0.0)),
    # Floodlight lenses (pale glass by day) and red warning lights (perimeter.py).
    "glow_lamp": ((0.86, 0.84, 0.76), "plain", (0.15, 0.0)),
    "glow_red": ((0.85, 0.12, 0.08), "plain", (0.30, 0.0)),
    # See-through glass: these faces become a separate transparent surface (GLASS_*), not baked.
    "pane": ((0.45, 0.60, 0.65), "plain", (0.05, 0.0)),
    # Cleaner paints of hulls and housing (V1 hull sprites).
    "paint_grey": ((0.60, 0.63, 0.64), "metal", _PAINT),
    "navy": ((0.16, 0.22, 0.33), "metal", (0.45, 0.30)),
    "blue_paint": ((0.22, 0.42, 0.68), "metal", _PAINT),
    "black_metal": ((0.10, 0.10, 0.11), "metal", (0.50, 0.25)),
    "soil": ((0.36, 0.24, 0.16), "concrete", _MATTE),
    # Furniture of the better homes: wood and upholstery (flat, no rust).
    "wood": ((0.42, 0.28, 0.17), "plain", (0.65, 0.0)),
    "fabric": ((0.46, 0.16, 0.20), "plain", (0.92, 0.0)),
    # Military green (ammunition boxes).
    "olive": ((0.31, 0.35, 0.19), "metal", (0.70, 0.15)),
    # Farm animals and hay.
    "hide": ((0.86, 0.84, 0.80), "plain", (0.85, 0.0)),
    "hay": ((0.80, 0.68, 0.36), "plain", (0.95, 0.0)),
    "plant": ((0.24, 0.62, 0.22), "plain", (0.85, 0.0)),
    # Nature on the surface (props.py), after the V1 prop sprites: grey and sand stones, black
    # lava rock with glassy flakes, pale ice, each with a surface texture of its own (trees are
    # sprites since 2026-11-18).
    "stone": ((0.46, 0.45, 0.42), "concrete", _MATTE, "granite"),
    "stone_dark": ((0.30, 0.29, 0.28), "concrete", _MATTE, "granite"),
    "moss": ((0.36, 0.43, 0.20), "concrete", _MATTE, "moss"),
    "sandstone": ((0.78, 0.62, 0.45), "concrete", _MATTE, "sandstone"),
    "ash_stone": ((0.26, 0.26, 0.27), "concrete", _MATTE, "tuff"),
    "snow": ((0.88, 0.90, 0.93), "concrete", (0.75, 0.0), "snow"),
    "obsidian": ((0.09, 0.09, 0.10), "concrete", (0.55, 0.0), "scoria"),
    "basalt": ((0.23, 0.24, 0.26), "concrete", _MATTE, "basalt"),
    "ice": ((0.74, 0.84, 0.92), "concrete", (0.22, 0.0), "glacier_ice"),
    "ice_deep": ((0.47, 0.64, 0.80), "concrete", (0.18, 0.0), "glacier_ice"),
    "sulfur": ((0.78, 0.70, 0.30), "concrete", _MATTE, "sulfur"),
    # Goods (resources.py): one clear colour per resource, readable as an icon of 48 px. Ores
    # name the stone textures; their glints and the metals are flat colours with a mirror finish.
    "ore_iron": ((0.48, 0.25, 0.19), "concrete", _MATTE, "scoria"),
    "ore_copper": ((0.30, 0.44, 0.30), "concrete", _MATTE, "tuff"),
    "bauxite": ((0.72, 0.36, 0.18), "concrete", _MATTE, "sandstone"),
    "bauxite_light": ((0.86, 0.60, 0.40), "concrete", _MATTE, "sandstone"),
    "ore_titanium": ((0.27, 0.28, 0.32), "concrete", _MATTE, "basalt"),
    "ore_pale": ((0.56, 0.53, 0.48), "concrete", _MATTE, "granite"),
    "ore_rare": ((0.50, 0.36, 0.44), "concrete", _MATTE, "granite"),
    "ore_uranium": ((0.24, 0.25, 0.18), "concrete", _MATTE, "scoria"),
    "yellowcake": ((0.86, 0.74, 0.22), "concrete", _MATTE, "sulfur"),
    "coal": ((0.14, 0.14, 0.15), "concrete", (0.30, 0.0), "scoria"),
    "sulfur_bright": ((0.96, 0.86, 0.26), "plain", (0.35, 0.0)),
    "quartz": ((0.86, 0.90, 0.93), "plain", (0.08, 0.0)),
    "quartz_smoky": ((0.62, 0.66, 0.74), "plain", (0.10, 0.0)),
    "rare_crystal": ((0.90, 0.36, 0.62), "plain", (0.12, 0.0)),
    "rare_teal": ((0.20, 0.74, 0.70), "plain", (0.12, 0.0)),
    "hematite": ((0.56, 0.56, 0.60), "plain", (0.25, 0.85)),
    "copper": ((0.86, 0.48, 0.26), "plain", (0.28, 0.90)),
    "platinum": ((0.84, 0.84, 0.82), "plain", (0.22, 0.95)),
    "titanium_glint": ((0.72, 0.76, 0.86), "plain", (0.22, 0.90)),
    "gold": ((0.92, 0.70, 0.28), "plain", (0.25, 0.90)),
    "brass": ((0.82, 0.64, 0.30), "plain", (0.30, 0.85)),
    "iron_plate": ((0.36, 0.38, 0.40), "metal", (0.45, 0.60)),
    "aluminum": ((0.82, 0.84, 0.86), "metal", (0.30, 0.85)),
    "titanium": ((0.48, 0.50, 0.64), "metal", (0.30, 0.80)),
    "gunmetal": ((0.24, 0.26, 0.29), "metal", (0.40, 0.55)),
    "orange_paint": ((0.88, 0.42, 0.12), "metal", _PAINT),
    "water_blue": ((0.14, 0.44, 0.84), "plain", (0.30, 0.0)),
    "frost": ((0.88, 0.94, 0.98), "plain", (0.60, 0.0)),
    "carbon_weave": ((0.11, 0.11, 0.12), "plain", (0.22, 0.20)),
    "plastic_white": ((0.88, 0.88, 0.86), "plain", (0.55, 0.0)),
    "pellet": ((0.18, 0.66, 0.90), "plain", (0.25, 0.0)),
    "pcb_green": ((0.10, 0.46, 0.24), "plain", (0.40, 0.0)),
    "pcb_blue": ((0.12, 0.20, 0.46), "plain", (0.40, 0.0)),
    "wafer": ((0.62, 0.62, 0.74), "plain", (0.12, 0.60)),
    "wafer_die": ((0.44, 0.54, 0.86), "plain", (0.12, 0.80)),
    "armor": ((0.46, 0.46, 0.38), "metal", (0.70, 0.20)),
    "armor_dark": ((0.30, 0.31, 0.26), "metal", (0.70, 0.20)),
    "aramid": ((0.86, 0.72, 0.30), "plain", (0.85, 0.0)),
    "ceramic": ((0.86, 0.84, 0.80), "plain", (0.70, 0.0)),
    "algae": ((0.22, 0.62, 0.24), "plain", (0.12, 0.0)),
    "food_red": ((0.80, 0.16, 0.12), "plain", (0.35, 0.0)),
    "food_orange": ((0.94, 0.52, 0.12), "plain", (0.40, 0.0)),
    "protein": ((0.88, 0.62, 0.56), "plain", (0.55, 0.0)),
    "null_crystal": ((0.46, 0.24, 0.72), "plain", (0.10, 0.0)),
    "glow_blue": ((0.36, 0.60, 1.0), "plain", (0.20, 0.0)),
    "glow_yellow": ((1.0, 0.82, 0.22), "plain", (0.30, 0.0)),
}
# Colours that give off light, and the sRGB colour of their light. Baked into a third texture
# (the glow mask); the game turns it up at night and on airless worlds (ColonyView).
GLOWS = {
    "glow_orange": (1.0, 0.55, 0.12),
    "glow_purple": (0.78, 0.35, 1.0),
    "glow_cyan": (0.35, 0.90, 0.90),
    "window": (1.0, 0.76, 0.45),
    "glow_green": (0.35, 0.95, 0.45),
    "glow_lamp": (1.0, 0.88, 0.66),
    "glow_red": (1.0, 0.14, 0.08),
    "glow_blue": (0.36, 0.60, 1.0),
    "glow_yellow": (1.0, 0.82, 0.22),
}
PANE = "pane"
# The see-through glass: tint (sRGB), opacity, roughness.
GLASS_COLOR = (0.62, 0.78, 0.84)
GLASS_ALPHA = 0.28
GLASS_ROUGHNESS = 0.05
# How a surface kind is stored in the fourth channel of the face colour.
_KINDS = {"concrete": 0.0, "plain": 0.5, "metal": 1.0}

# --- Detail level ----------------------------------------------------------------------------
# TE_DETAIL=hd builds the high-detail variant of modules and hulls for strong phones
# (tools/build-models.ps1 -Detail hd -> game/world/models_hd, shown on the top detail tier):
# rounder cylinders and revolves, real rounded edges on boxes and beams, textures twice the edge
# length. Shapes, colours and the recipe stay the same; without TE_DETAIL nothing changes.
DETAIL = os.environ.get("TE_DETAIL", "").strip().lower()
HD = DETAIL == "hd"
# Round shapes: segments of at least HD_ROUND_FROM are multiplied, up to HD_MAX_SEGMENTS; six-sided
# rods and pipes of at least HD_ROD_RADIUS get HD_ROD_SEGMENTS. Fewer segments are meant to show
# (plants, pins, square and pyramid shapes) and stay.
HD_SEGMENT_FACTOR = 2
HD_ROUND_FROM = 8
HD_MAX_SEGMENTS = 40
HD_ROD_RADIUS = 0.012
HD_ROD_SEGMENTS = 10
# Rounded edges of boxes and beams: width (cells, at most HD_BEVEL_SHARE of the thinnest side),
# segments, and the thinnest side below which a box keeps sharp edges (thin plates, wires).
HD_BEVEL_WIDTH = 0.012
HD_BEVEL_SHARE = 0.2
HD_BEVEL_SEGMENTS = 2
HD_BEVEL_MIN_SIDE = 0.03


def segments_for(segments: int, radius: float = 1.0) -> int:
    """The segments of a round shape at the detail level of this build."""
    if not HD:
        return segments
    if segments >= HD_ROUND_FROM:
        return min(HD_MAX_SEGMENTS, segments * HD_SEGMENT_FACTOR)
    if segments == 6 and radius >= HD_ROD_RADIUS:
        return HD_ROD_SEGMENTS
    return segments


# --- The recipe of the baked look -----------------------------------------------------------
# Edge length of the texture of one model, in pixels.
TEXTURE_PIXELS = 1024 if HD else 512
# How often a surface texture repeats across one grid cell.
SURFACE_REPEATS = 2.0
# How strongly the surface texture breaks up the flat colour (0 = flat).
SURFACE_STRENGTH = 1.2
RUST_COLOR = (0.50, 0.25, 0.12)
RUST_AMOUNT = 0.9
# Brightness left in fully enclosed corners (1 = no dirt).
CORNER_DARKNESS = 0.35
# Grime at the foot of walls: how high it climbs (cells), its brightness at the very bottom.
GROUND_GRIME_HEIGHT = 0.18
GROUND_GRIME_DARKNESS = 0.55
# Large blotches of grime on textured surfaces: their size (higher = smaller), how much of
# the surface they cover (0..1) and the brightness left where they are thickest.
GRIME_SCALE = 3.0
GRIME_COVER = 0.62
GRIME_DARKNESS = 0.45
# Everything a little older and dirtier: the whole colour is multiplied with this.
AGE_TINT = (0.80, 0.78, 0.74)
# Worn edges: width in cells, how much of the edge colour shows, the colour itself.
EDGE_WIDTH = 0.008
EDGE_AMOUNT = 0.5
EDGE_COLOR = (0.80, 0.80, 0.77)
# Share of the worn edges left on surfaces with a texture of their own (stone, ice: nature has
# no paint to wear off; bright edges made stones look like cut gems).
NATURAL_EDGES = 0.15
# Finish of rust, of bare metal at worn edges, and how much dirt in corners roughens.
RUST_ROUGHNESS = 0.95
BARE_ROUGHNESS = 0.30
DIRT_ROUGHNESS = 0.25
# Uneven gloss: size of the dull and shiny patches (higher = smaller patches), how far they
# move the roughness, and how much the scratches of the surface texture add.
GLOSS_PATCH_SCALE = 5.0
GLOSS_PATCHES = 0.7
GLOSS_SCRATCHES = 0.6
BAKE_SAMPLES = 24

_TINT = "tint"
_FINISH = "finish"
_GLOW = "glow"
_PART = "part"
# Name prefix of a moving part's object (Builder.moving).
MOVING_PREFIX = "move_"
_SURFACE_PIXELS = 512
# How a face's surface texture is stored in the blue channel of its finish (see Builder).
_SURFACE_STEP = 1.0 / 16.0
_FACINGS = {
    "+x": (Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))),
    "-x": (Vector((-1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))),
    "+y": (Vector((0, 1, 0)), Vector((1, 0, 0)), Vector((0, 0, 1))),
    "-y": (Vector((0, -1, 0)), Vector((1, 0, 0)), Vector((0, 0, 1))),
    "+z": (Vector((0, 0, 1)), Vector((1, 0, 0)), Vector((0, 1, 0))),
    "-z": (Vector((0, 0, -1)), Vector((1, 0, 0)), Vector((0, 1, 0))),
}


def _linear(srgb) -> tuple:
    """sRGB -> the linear values Blender computes with."""
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


class Builder:
    """Collects boxes, beams, cylinders and plates into one mesh. *wear* (0..1) is how old and
    dirty the recipe makes it: 1 for industry and supply (rust, grime, dark corners), low for
    hulls and housing (clean paint, a little dirt in the corners). Faces painted PANE become
    see-through glass."""

    def __init__(self, name: str, wear: float = 1.0) -> None:
        self.name = name
        self.wear = wear
        self._solid = bmesh.new()
        self._tint = self._solid.loops.layers.color.new(_TINT)
        self._finish = self._solid.loops.layers.float_color.new(_FINISH)
        self._glow = self._solid.loops.layers.color.new(_GLOW)
        self._glass = bmesh.new()
        self._mesh = self._solid
        self._glowing = False
        # Surface textures named by the palette, in the order they were first painted; a face
        # stores its texture's place in this list (1, 2 ...) or 0 for the texture of its kind.
        self._surfaces = []
        self._frame = Matrix.Identity(4)
        # Moving parts (see moving): each face stores the number of its part, 0 for none.
        self._part_layer = self._solid.faces.layers.int.new(_PART)
        self._part = 0
        self._parts = []

    @contextmanager
    def _into(self, color: str):
        """Builds into the glass mesh while painting PANE."""
        self._mesh = self._glass if color == PANE else self._solid
        try:
            yield
        finally:
            self._mesh = self._solid

    @contextmanager
    def placed(self, location=(0.0, 0.0, 0.0), turn: float = 0.0, tilt: float = 0.0):
        """Everything added inside the with-block is moved to *location*, turned around Z
        and then tilted around its own X axis (radians; a positive tilt leans the top
        towards -Y). Blocks can be nested."""
        previous = self._frame
        self._frame = (previous @ Matrix.Translation(Vector(location))
                       @ Matrix.Rotation(turn, 4, "Z") @ Matrix.Rotation(tilt, 4, "X"))
        try:
            yield
        finally:
            self._frame = previous

    @contextmanager
    def moving(self, name: str, pivot=(0.0, 0.0, 0.0), turn: float = 0.0, tilt: float = 0.0):
        """Everything added inside the with-block becomes a moving part: a child object
        "move_<name>" of the model whose origin is *pivot* (in the current coordinates, which
        stay as they are) and whose axes are turned by *turn* around Z and tilted by *tilt*
        around X like `placed`. The game moves it after its name (core/module_motion.gd: what
        comes after "move_" up to the first digit or underscore is the role, "fan_2" -> fan);
        a turning part turns around its own Z axis (up in the game). The part is baked with the
        rest of the model. Parts cannot be nested; glass (PANE) inside a part stays put."""
        if self._part:
            raise RuntimeError("moving parts cannot be nested")
        frame = (self._frame @ Matrix.Translation(Vector(pivot))
                 @ Matrix.Rotation(turn, 4, "Z") @ Matrix.Rotation(tilt, 4, "X"))
        self._parts.append((name, frame))
        self._part = len(self._parts)
        try:
            yield
        finally:
            self._part = 0

    def box(self, center, size, color: str, turn: float = 0.0) -> None:
        """A box with its centre at *center*; *turn* rotates it around Z (radians)."""
        matrix = (self._frame @ Matrix.Translation(Vector(center)) @ Matrix.Rotation(turn, 4, "Z")
                  @ Matrix.Diagonal((size[0], size[1], size[2], 1.0)))
        with self._into(color):
            created = bmesh.ops.create_cube(self._mesh, size=1.0, matrix=matrix)
            self._paint(self._rounded(created, color, min(size)), color)

    def beam(self, start, end, thickness: float, color: str) -> None:
        """A square bar from *start* to *end*."""
        matrix = _along(self._frame @ Vector(start), self._frame @ Vector(end), thickness, thickness)
        with self._into(color):
            created = bmesh.ops.create_cube(self._mesh, size=1.0, matrix=matrix)
            length = (Vector(end) - Vector(start)).length
            self._paint(self._rounded(created, color, min(thickness, length)), color)

    def cylinder(self, start, end, radius: float, color: str, segments: int = 10,
                 end_radius: float | None = None) -> None:
        """A round bar from *start* to *end*; *end_radius* makes it a cone or taper."""
        start, end = self._frame @ Vector(start), self._frame @ Vector(end)
        with self._into(color):
            created = bmesh.ops.create_cone(
                self._mesh, cap_ends=True, cap_tris=False,
                segments=segments_for(segments, max(radius, end_radius or 0.0)), radius1=radius,
                radius2=radius if end_radius is None else end_radius, depth=1.0,
                matrix=_along(start, end, 1.0, 1.0))
            faces = self._faces(created)
            self._paint(faces, color)
        axis = (end - start).normalized()
        for face in faces:
            face.normal_update()
            # Round sides are shaded smooth, the two end caps stay flat.
            face.smooth = abs(face.normal.dot(axis)) < 0.99

    def lump(self, center, size, color: str, seed: int = 0, rough: float = 0.2,
             detail: int = 1, smooth: float = 0.0) -> None:
        """A faceted lump (stone, crown, ice): an icosphere with diameters *size* (x, y, z) whose
        corners are pushed in and out by up to *rough* (share of the radius), the same way for
        the same *seed*. Corners that end up below the ground (z < 0) are pulled onto it, so a
        lump sunk into the ground stands on a flat base; faces lying flat on the ground are
        dropped (nobody sees them). *detail* 1 has 20 triangles, 2 has 80. *smooth* (degrees)
        shades the lump round, keeping edges sharper than that angle crisp: a weathered stone
        instead of a cut gem."""
        generator = random.Random(seed)
        matrix = (self._frame @ Matrix.Translation(Vector(center))
                  @ Matrix.Diagonal((size[0] / 2.0, size[1] / 2.0, size[2] / 2.0, 1.0)))
        with self._into(color):
            created = bmesh.ops.create_icosphere(self._mesh, subdivisions=detail, radius=1.0,
                                                 matrix=Matrix.Identity(4))
            for vert in created["verts"]:
                vert.co = matrix @ (vert.co * (1.0 + generator.uniform(-rough, rough)))
                if vert.co.z < 0.0:
                    vert.co.z = 0.0
            faces = self._faces(created)
            hidden = [face for face in faces if all(abs(vert.co.z) < 1e-9 for vert in face.verts)]
            if hidden:
                bmesh.ops.delete(self._mesh, geom=hidden, context="FACES_ONLY")
                faces = {face for face in faces if face.is_valid}
            self._paint(faces, color)
            if smooth > 0.0:
                limit = math.radians(smooth)
                for face in faces:
                    face.smooth = True
                    for edge in face.edges:
                        if edge.is_manifold and edge.calc_face_angle(0.0) > limit:
                            edge.smooth = False

    def revolve(self, center, profile, color: str, segments: int = 12, closed: bool = False,
                scale=(1.0, 1.0), sharp: float = 40.0) -> None:
        """A surface of revolution around the Z axis through *center*: domes, bowls, tanks,
        cooling towers, a torus. *profile* lists (radius, height) points, heights relative to
        *center*; a third value (radius, height, colour) paints the band from that point to the
        next in another colour. A point with radius 0 closes the surface there. The faces look
        to the right of the walk along the profile: walking up the outside, they look outwards;
        walking down an inside (a bowl from its rim to its bottom), they look into the bowl.
        *closed* joins the last point back to the first (a torus). *scale* stretches the radii
        along x and y (an oval). Shaded smooth, except where the profile bends more than
        *sharp* degrees."""
        base = Vector(center)
        segments = segments_for(segments)
        rings = []
        for point in profile:
            radius, height = point[0], point[1]
            if radius <= 1e-9:
                rings.append([self._solid.verts.new(self._frame @ (base + Vector((0.0, 0.0, height))))])
                continue
            ring = []
            for index in range(segments):
                angle = 2.0 * math.pi * index / segments
                local = Vector((math.cos(angle) * radius * scale[0], math.sin(angle) * radius * scale[1], height))
                ring.append(self._solid.verts.new(self._frame @ (base + local)))
            rings.append(ring)
        bands = {}
        for number in range(len(profile) if closed else len(profile) - 1):
            low, high = rings[number], rings[(number + 1) % len(rings)]
            if len(low) == 1 and len(high) == 1:
                continue
            band = profile[number][2] if len(profile[number]) > 2 else color
            created = bands.setdefault(band, set())
            for index in range(segments):
                following = (index + 1) % segments
                if len(low) == 1:
                    corners = [low[0], high[following], high[index]]
                elif len(high) == 1:
                    corners = [low[index], low[following], high[0]]
                else:
                    corners = [low[index], low[following], high[following], high[index]]
                created.add(self._solid.faces.new(corners))
        limit = math.radians(sharp)
        for band, faces in bands.items():
            if band == PANE:
                raise ValueError("revolve cannot make see-through glass")
            self._paint(faces, band)
            for face in faces:
                face.normal_update()
                face.smooth = True
        for faces in bands.values():
            for face in faces:
                for edge in face.edges:
                    if edge.is_manifold and edge.calc_face_angle(0.0) > limit:
                        edge.smooth = False

    def plate(self, center, size, facing: str, color: str) -> None:
        """A flat rectangle (markings, signs) with its centre at *center*, looking along
        *facing* ("+x", "-y", "+z" ...). *size* is (across, up) as seen from the front. Put it
        a hair in front of the surface it sits on."""
        normal, across, up = _FACINGS[facing]
        center = Vector(center)
        corners = [self._frame @ (center + across * (sx * size[0] / 2.0) + up * (sy * size[1] / 2.0))
                   for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        if across.cross(up).dot(normal) < 0.0:
            corners.reverse()
        with self._into(color):
            face = self._mesh.faces.new([self._mesh.verts.new(corner) for corner in corners])
            self._paint({face}, color)

    def finish(self) -> bpy.types.Object:
        """Turns the parts into one object in the stage scene and returns it. An object of
        the same name from an earlier run is replaced. Without a window the look is baked
        into a texture; in a running Blender the model keeps its flat colours."""
        scene = stage_scene()
        previous = scene.collection.objects.get(self.name)
        if previous is not None:
            remove(previous)
        mesh = bpy.data.meshes.new(self.name)
        self._solid.to_mesh(mesh)
        self._solid.free()
        target = bpy.data.objects.new(self.name, mesh)
        scene.collection.objects.link(target)
        if bpy.app.background:
            _bake_look(target, self._glowing, self.wear, self._surfaces)
        else:
            mesh.color_attributes.active_color_name = _TINT
        _split_parts(target, self._parts)
        if len(self._glass.faces) > 0:
            _add_glass(target, self._glass)
        self._glass.free()
        return target

    def _faces(self, created: dict) -> set:
        return {face for vert in created["verts"] for face in vert.link_faces}

    def _rounded(self, created: dict, color: str, thinnest: float) -> set:
        """The faces of a box just made; in the high-detail build its edges are rounded first
        (HD_BEVEL_*), shaded smooth across the rounding and flat on the sides. Glass stays sharp."""
        faces = self._faces(created)
        if not HD or color == PANE or thinnest < HD_BEVEL_MIN_SIDE:
            return faces
        verts = list(created["verts"])
        edges = list({edge for vert in verts for edge in vert.link_edges})
        result = bmesh.ops.bevel(
            self._mesh, geom=verts + edges, offset=min(HD_BEVEL_WIDTH, thinnest * HD_BEVEL_SHARE),
            offset_type="OFFSET", segments=HD_BEVEL_SEGMENTS, profile=0.5, affect="EDGES",
            clamp_overlap=True)
        rounding = set(result["faces"])
        for face in rounding:
            face.smooth = True
        # The bevel replaces faces of the box: take the whole box again (it is an island).
        island, waiting = set(), list(rounding)
        while waiting:
            face = waiting.pop()
            if face in island:
                continue
            island.add(face)
            waiting.extend(other for edge in face.edges for other in edge.link_faces if other not in island)
        return island

    def _paint(self, faces: set, color: str) -> None:
        if color == PANE:
            return
        srgb, kind, finish = PALETTE[color][:3]
        surface = 0
        if len(PALETTE[color]) > 3:
            texture = PALETTE[color][3]
            if texture not in self._surfaces:
                self._surfaces.append(texture)
            surface = self._surfaces.index(texture) + 1
        # This kind of colour layer stores sRGB; Blender converts it for the shader itself.
        # Converting here as well made every colour far too dark (tried 2026-11-17).
        value = (*srgb, _KINDS[kind])
        light = (*GLOWS.get(color, (0.0, 0.0, 0.0)), 1.0)
        self._glowing = self._glowing or color in GLOWS
        for face in faces:
            face[self._part_layer] = self._part
            for loop in face.loops:
                loop[self._tint] = value
                # Blue carries the surface texture (_SURFACE_STEP per place in the list).
                loop[self._finish] = (finish[0], finish[1], surface * _SURFACE_STEP, 1.0)
                loop[self._glow] = light


def _along(start: Vector, end: Vector, width: float, depth: float) -> Matrix:
    """Places a unit shape so that its Z axis runs from *start* to *end*."""
    axis = end - start
    return (Matrix.Translation((start + end) / 2.0)
            @ axis.to_track_quat("Z", "Y").to_matrix().to_4x4()
            @ Matrix.Diagonal((width, depth, axis.length, 1.0)))


def stage_scene() -> bpy.types.Scene:
    """The scene models are built in: the open one without a window, a scene of its own in a
    running Blender."""
    if bpy.app.background:
        return bpy.context.scene
    return bpy.data.scenes.get(STAGE_SCENE) or bpy.data.scenes.new(STAGE_SCENE)


# --- Surface textures ------------------------------------------------------------------------

def _blur(values: numpy.ndarray, radius: int) -> numpy.ndarray:
    """Box blur with mirrored edges, applied along both axes."""
    for axis in (0, 1):
        padded = numpy.pad(values, [(radius, radius) if a == axis else (0, 0) for a in (0, 1)],
                           mode="reflect")
        sums = numpy.cumsum(padded, axis=axis, dtype=numpy.float64)
        zero = numpy.zeros_like(numpy.take(sums, [0], axis=axis))
        sums = numpy.concatenate([zero, sums], axis=axis)
        window = 2 * radius + 1
        length = values.shape[axis]
        upper = numpy.take(sums, range(window, window + length), axis=axis)
        lower = numpy.take(sums, range(0, length), axis=axis)
        values = ((upper - lower) / window).astype(numpy.float32)
    return values


def _seamless(values: numpy.ndarray, keep_contrast: bool) -> numpy.ndarray:
    """Makes a square texture repeat without a visible seam: along each axis the outer part
    is cross-faded into a copy shifted by half the size, whose own seam lies in the middle
    where the original shows. *keep_contrast* undoes the flattening the cross-fade causes."""
    size = values.shape[0]
    ramp = numpy.clip((1.0 - numpy.abs(numpy.linspace(-1.0, 1.0, size))) * 2.5, 0.0, 1.0)
    ramp = (ramp * ramp * (3.0 - 2.0 * ramp)).astype(numpy.float32)
    mean = float(values.mean())
    for axis in (0, 1):
        weight = ramp[:, None] if axis == 0 else ramp[None, :]
        mixed = weight * values + (1.0 - weight) * numpy.roll(values, size // 2, axis=axis)
        if keep_contrast:
            mixed = mean + (mixed - mean) / numpy.sqrt(weight ** 2 + (1.0 - weight) ** 2)
        values = mixed.astype(numpy.float32)
    return values


def _surface_image(texture: str) -> bpy.types.Image:
    """The surface texture *texture* (a kind, metal or concrete, or a name from the palette) as
    the bake needs it: red = brightness relative to the surroundings (0.5 = unchanged; uneven
    lighting removed), green = rust. Seamless. A missing texture file gives a neutral image, so
    models still build with flat colours."""
    name = "te_surface_" + texture
    existing = bpy.data.images.get(name)
    if existing is not None:
        bpy.data.images.remove(existing)
    size = _SURFACE_PIXELS
    pixels = numpy.zeros((size, size, 4), dtype=numpy.float32)
    pixels[:, :, 0] = 0.5
    pixels[:, :, 3] = 1.0
    path = os.path.join(TEXTURE_FOLDER, texture + ".jpg")
    if os.path.exists(path):
        source = bpy.data.images.load(path, check_existing=False)
        width, height = source.size
        raw = numpy.empty(width * height * 4, dtype=numpy.float32)
        source.pixels.foreach_get(raw)
        bpy.data.images.remove(source)
        color = raw.reshape(height, width, 4)[:, :, :3]
        # Only the middle of the image is used: generators put a rim and a vignette at the edges.
        factor = max(1, int(min(width, height) * 0.55) // size)
        span = size * factor
        top, left = (height - span) // 2, (width - span) // 2
        color = color[top:top + span, left:left + span]
        color = color.reshape(size, factor, size, factor, 3).mean(axis=(1, 3))
        brightness = color @ numpy.array((0.299, 0.587, 0.114), dtype=numpy.float32)
        detail = brightness / numpy.maximum(_blur(brightness, size // 6), 0.02)
        # Rust is what is clearly warmer than the paint around it. Measured against the
        # typical warmth of the image, because the paint itself may be a warm grey: with a
        # fixed threshold a warm texture rusted the whole model (tried 2026-11-17).
        warmth = color[:, :, 0] - color[:, :, 2]
        rust = numpy.clip((warmth - float(numpy.median(warmth)) - 0.07) / 0.14, 0.0, 1.0)
        pixels[:, :, 0] = numpy.clip(_seamless(detail, keep_contrast=True) * 0.5, 0.0, 1.0)
        pixels[:, :, 1] = numpy.clip(_seamless(rust, keep_contrast=False), 0.0, 1.0)
    image = bpy.data.images.new(name, size, size, alpha=False, is_data=True)
    image.pixels.foreach_set(pixels.ravel())
    return image


# --- The baked look --------------------------------------------------------------------------

def _look_material(wear: float = 1.0, textures=()) -> tuple:
    """The recipe as a node graph: palette colour x surface texture, rust on metal, dirt in
    corners, worn edges, and the finish (roughness, metalness); *wear* (0..1) scales the age
    and dirt (Builder); *textures* are the surface textures the palette names, in the order of
    the faces' places (Builder._surfaces). Returns the material, the
    input of its glow, and the two results to feed into it one after the other: the colour
    and the finish. A glowing surface is baked without lighting."""
    material = bpy.data.materials.get("te_look") or bpy.data.materials.new("te_look")
    if material.node_tree is None:
        material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()

    def node(kind: str, **settings):
        created = tree.nodes.new(kind)
        for key, value in settings.items():
            setattr(created, key, value)
        return created

    def link(source, target) -> None:
        tree.links.new(source, target)

    def math_node(operation: str, first, second=None, third=None, clamp: bool = False):
        created = node("ShaderNodeMath", operation=operation, use_clamp=clamp)
        for index, value in enumerate((first, second, third)):
            if value is None:
                continue
            if isinstance(value, (int, float)):
                created.inputs[index].default_value = value
            else:
                link(value, created.inputs[index])
        return created.outputs[0]

    def mix(blend: str, factor, first, second):
        """Colour mix; inputs are sockets, colours (tuples) or numbers (factor only)."""
        created = node("ShaderNodeMixRGB", blend_type=blend)
        for index, value in enumerate((factor, first, second)):
            if isinstance(value, (int, float)):
                created.inputs[index].default_value = value
            elif isinstance(value, tuple):
                created.inputs[index].default_value = (*value, 1.0)
            else:
                link(value, created.inputs[index])
        return created.outputs[0]

    coordinates = node("ShaderNodeTexCoord")
    mapping = node("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (SURFACE_REPEATS,) * 3
    link(coordinates.outputs["Object"], mapping.inputs["Vector"])
    surfaces = {}
    for kind in ("metal", "concrete"):
        texture = node("ShaderNodeTexImage", image=_surface_image(kind), projection="BOX",
                       projection_blend=0.2)
        link(mapping.outputs["Vector"], texture.inputs["Vector"])
        surfaces[kind] = texture.outputs["Color"]
    tint = node("ShaderNodeVertexColor", layer_name=_TINT)
    tint_color, kind = tint.outputs[0], tint.outputs[1]
    is_metal = math_node("GREATER_THAN", kind, 0.75)
    textured = math_node("ADD", is_metal, math_node("LESS_THAN", kind, 0.25))

    chosen = mix("MIX", is_metal, surfaces["concrete"], surfaces["metal"])
    if textures:
        # Faces whose colour names a texture of its own take that one instead of their kind's.
        place = node("ShaderNodeSeparateColor")
        link(node("ShaderNodeVertexColor", layer_name=_FINISH).outputs[0], place.inputs[0])
        for index, name in enumerate(textures):
            texture = node("ShaderNodeTexImage", image=_surface_image(name), projection="BOX",
                           projection_blend=0.2)
            link(mapping.outputs["Vector"], texture.inputs["Vector"])
            picked = math_node("COMPARE", place.outputs[2], (index + 1) * _SURFACE_STEP, _SURFACE_STEP / 4.0)
            chosen = mix("MIX", picked, chosen, texture.outputs["Color"])
    surface = node("ShaderNodeSeparateColor")
    link(chosen, surface.inputs[0])
    detail, rust = surface.outputs[0], surface.outputs[1]
    # detail is stored halved: 1 + strength * (2 * detail - 1), kept within sane bounds;
    # plain surfaces keep their flat colour.
    strength = SURFACE_STRENGTH * (0.2 + 0.8 * wear)
    shade = math_node("MULTIPLY_ADD", detail, 2.0 * strength, 1.0 - strength)
    shade = math_node("MINIMUM", math_node("MAXIMUM", shade, 0.35), 1.6)
    shade = math_node("MULTIPLY_ADD", math_node("SUBTRACT", shade, 1.0), textured, 1.0)

    color = mix("MULTIPLY", 1.0, tint_color, shade)
    rusty = mix("MULTIPLY", 1.0, _linear(RUST_COLOR), shade)
    rust_amount = math_node("MULTIPLY", math_node("MULTIPLY", rust, is_metal), RUST_AMOUNT * wear)
    color = mix("MIX", rust_amount, color, rusty)

    occlusion = node("ShaderNodeAmbientOcclusion", samples=16, only_local=True)
    occlusion.inputs["Distance"].default_value = 0.3
    corner = 1.0 - (1.0 - CORNER_DARKNESS) * (0.35 + 0.65 * wear)
    dirt = math_node("MULTIPLY_ADD", occlusion.outputs[1], 1.0 - corner, corner)
    color = mix("MULTIPLY", 1.0, color, dirt)
    # Grime at the foot of walls (not on upward faces): darkest at the ground, fading upwards.
    position = node("ShaderNodeSeparateXYZ")
    link(coordinates.outputs["Object"], position.inputs[0])
    upright = node("ShaderNodeSeparateXYZ")
    link(node("ShaderNodeNewGeometry").outputs["Normal"], upright.inputs[0])
    wall = math_node("SUBTRACT", 1.0, math_node("ABSOLUTE", upright.outputs[2]))
    low = math_node("SUBTRACT", 1.0, math_node("DIVIDE", position.outputs[2], GROUND_GRIME_HEIGHT),
                    clamp=True)
    grime = math_node("MULTIPLY", wall, math_node("MULTIPLY", low, low))
    grime = math_node("MULTIPLY_ADD", grime, (GROUND_GRIME_DARKNESS - 1.0) * wear, 1.0)
    color = mix("MULTIPLY", 1.0, color, grime)
    # Blotches of grime on textured surfaces, soft-edged, from a coarse noise.
    blotches = node("ShaderNodeTexNoise")
    blotches.inputs["Scale"].default_value = GRIME_SCALE
    blotches.inputs["Detail"].default_value = 6.0
    link(coordinates.outputs["Object"], blotches.inputs["Vector"])
    smear = math_node("MULTIPLY", math_node("SUBTRACT", blotches.outputs[0], 1.0 - GRIME_COVER), 5.0,
                      clamp=True)
    smear = math_node("MULTIPLY", smear, textured)
    color = mix("MULTIPLY", 1.0, color, math_node("MULTIPLY_ADD", smear, (GRIME_DARKNESS - 1.0) * wear, 1.0))
    age = tuple(1.0 - (1.0 - tone) * wear for tone in AGE_TINT)
    color = mix("MULTIPLY", 1.0, color, _linear(age))

    edges = EDGE_AMOUNT * (0.4 + 0.6 * wear)
    bevel = node("ShaderNodeBevel", samples=6)
    bevel.inputs[0].default_value = EDGE_WIDTH
    geometry = node("ShaderNodeNewGeometry")
    facing = node("ShaderNodeVectorMath", operation="DOT_PRODUCT")
    link(bevel.outputs[0], facing.inputs[0])
    link(geometry.outputs["Normal"], facing.inputs[1])
    edge = math_node("MULTIPLY", math_node("SUBTRACT", 1.0, facing.outputs["Value"]), 8.0,
                     clamp=True)
    noise = node("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 35.0
    link(coordinates.outputs["Object"], noise.inputs["Vector"])
    breakup = math_node("MULTIPLY_ADD", noise.outputs[0], 0.8, 0.2, clamp=True)
    worn = math_node("MULTIPLY", math_node("MULTIPLY", edge, breakup),
                     math_node("MULTIPLY_ADD", textured, 0.7 * edges, 0.3 * edges))
    if textures:
        natural = math_node("GREATER_THAN", place.outputs[2], _SURFACE_STEP / 2.0)
        worn = math_node("MULTIPLY", worn, math_node("MULTIPLY_ADD", natural, NATURAL_EDGES - 1.0, 1.0))
    color = mix("MIX", worn, color, _linear(EDGE_COLOR))

    # The finish starts from the palette colour. Rust is rough and dull, worn edges of metal
    # are bare and shiny, dirt in corners roughens.
    def blend(first, second, factor):
        return math_node("MULTIPLY_ADD", factor, second,
                         math_node("MULTIPLY", first, math_node("SUBTRACT", 1.0, factor)))

    finish = node("ShaderNodeSeparateColor")
    link(node("ShaderNodeVertexColor", layer_name=_FINISH).outputs[0], finish.inputs[0])
    bare = math_node("MULTIPLY", math_node("MULTIPLY", edge, breakup), is_metal, clamp=True)
    # Uneven gloss on textured surfaces: large dull and shiny patches from a noise texture,
    # fine scratches from the surface texture (its dark spots are rougher).
    patches = node("ShaderNodeTexNoise")
    patches.inputs["Scale"].default_value = GLOSS_PATCH_SCALE
    patches.inputs["Detail"].default_value = 4.0
    link(coordinates.outputs["Object"], patches.inputs["Vector"])
    uneven = math_node("ADD",
                       math_node("MULTIPLY_ADD", patches.outputs[0], GLOSS_PATCHES, -0.5 * GLOSS_PATCHES),
                       math_node("MULTIPLY_ADD", detail, -2.0 * GLOSS_SCRATCHES, GLOSS_SCRATCHES))
    roughness = math_node("MULTIPLY_ADD", uneven, textured, finish.outputs[0], clamp=True)
    roughness = blend(blend(roughness, RUST_ROUGHNESS, rust_amount), BARE_ROUGHNESS, bare)
    roughness = math_node("MULTIPLY_ADD", math_node("SUBTRACT", 1.0, occlusion.outputs[1]),
                          DIRT_ROUGHNESS, roughness, clamp=True)
    metalness = blend(blend(finish.outputs[1], 0.0, rust_amount), 1.0, bare)
    # Packed the way glTF expects it: green = roughness, blue = metalness.
    packed = node("ShaderNodeCombineColor")
    packed.inputs[0].default_value = 1.0
    link(roughness, packed.inputs[1])
    link(metalness, packed.inputs[2])

    glow = node("ShaderNodeEmission")
    output = node("ShaderNodeOutputMaterial")
    link(glow.outputs[0], output.inputs["Surface"])
    return material, glow.inputs["Color"], color, packed.outputs[0]


def _bake_look(target: bpy.types.Object, glowing: bool, wear: float = 1.0, textures=()) -> None:
    """Unwraps the model, bakes the look into two textures (colour and finish), and a third
    one (the glow mask) when something on it glows, and leaves the model with a plain material
    that shows them. *textures*: the surface textures the palette names (Builder._surfaces)."""
    scene = target.users_scene[0]
    mesh = target.data
    look, glow_input, color_result, finish_result = _look_material(wear, textures)
    mesh.materials.append(look)
    if len(mesh.uv_layers) == 0:
        mesh.uv_layers.new(name="UVMap")
    for other in scene.view_layers[0].objects:
        other.select_set(other == target)
    scene.view_layers[0].objects.active = target
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")

    receiver = look.node_tree.nodes.new("ShaderNodeTexImage")
    look.node_tree.nodes.active = receiver
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = BAKE_SAMPLES

    def bake(result, suffix: str, is_data: bool) -> bpy.types.Image:
        for existing in list(glow_input.links):
            look.node_tree.links.remove(existing)
        look.node_tree.links.new(result, glow_input)
        image = bpy.data.images.new(target.name + suffix, TEXTURE_PIXELS, TEXTURE_PIXELS,
                                    alpha=False, is_data=is_data)
        receiver.image = image
        bpy.ops.object.bake(type="EMIT", margin=6, use_clear=True)
        image.pack()
        return image

    color_image = bake(color_result, "_color", False)
    finish_image = bake(finish_result, "_finish", True)
    glow_image = None
    if glowing:
        light = look.node_tree.nodes.new("ShaderNodeVertexColor")
        light.layer_name = _GLOW
        glow_image = bake(light.outputs[0], "_glow", False)

    final = bpy.data.materials.new(target.name)
    if final.node_tree is None:
        final.use_nodes = True
    nodes, links = final.node_tree.nodes, final.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    color_texture = nodes.new("ShaderNodeTexImage")
    color_texture.image = color_image
    finish_texture = nodes.new("ShaderNodeTexImage")
    finish_texture.image = finish_image
    split = nodes.new("ShaderNodeSeparateColor")
    links.new(color_texture.outputs["Color"], shader.inputs["Base Color"])
    links.new(finish_texture.outputs["Color"], split.inputs[0])
    links.new(split.outputs[1], shader.inputs["Roughness"])
    links.new(split.outputs[2], shader.inputs["Metallic"])
    if glow_image is not None:
        glow_texture = nodes.new("ShaderNodeTexImage")
        glow_texture.image = glow_image
        links.new(glow_texture.outputs["Color"], shader.inputs["Emission Color"])
        shader.inputs["Emission Strength"].default_value = 1.0
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    mesh.materials.clear()
    mesh.materials.append(final)
    for name in (_TINT, _FINISH, _GLOW):
        mesh.color_attributes.remove(mesh.color_attributes[name])


def _add_glass(target: bpy.types.Object, glass: bmesh.types.BMesh) -> None:
    """Joins the see-through glass into the model as a second surface with its own transparent
    material (glTF alphaMode BLEND); it is not baked, its tint is GLASS_COLOR."""
    scene = target.users_scene[0]
    mesh = bpy.data.meshes.new(target.name + "_glass")
    glass.to_mesh(mesh)
    for layer in target.data.uv_layers:
        mesh.uv_layers.new(name=layer.name)
    material = bpy.data.materials.new(target.name + "_glass")
    if material.node_tree is None:
        material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    output = nodes.new("ShaderNodeOutputMaterial")
    material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    shader.inputs["Base Color"].default_value = (*_linear(GLASS_COLOR), 1.0)
    shader.inputs["Alpha"].default_value = GLASS_ALPHA
    shader.inputs["Roughness"].default_value = GLASS_ROUGHNESS
    shader.inputs["Metallic"].default_value = 0.0
    material.surface_render_method = "BLENDED"
    mesh.materials.append(material)
    holder = bpy.data.objects.new(target.name + "_glass", mesh)
    scene.collection.objects.link(holder)
    with bpy.context.temp_override(active_object=target, object=target,
                                   selected_objects=[target, holder],
                                   selected_editable_objects=[target, holder]):
        bpy.ops.object.join()


def _split_parts(target: bpy.types.Object, moving: list) -> None:
    """Moves the faces of each moving part (Builder.moving) out of the model into a child
    object "move_<name>" whose origin and axes are the part's frame. The faces keep their
    material and texture coordinates, so the part shares the model's baked textures."""
    mesh = target.data
    if moving:
        whole = bmesh.new()
        whole.from_mesh(mesh)
        for number, (name, frame) in enumerate(moving, start=1):
            piece = whole.copy()
            layer = piece.faces.layers.int.get(_PART)
            bmesh.ops.delete(piece, geom=[face for face in piece.faces if face[layer] != number],
                             context="FACES")
            bmesh.ops.transform(piece, matrix=frame.inverted(), verts=piece.verts)
            part_mesh = bpy.data.meshes.new(MOVING_PREFIX + name)
            piece.to_mesh(part_mesh)
            piece.free()
            for material in mesh.materials:
                part_mesh.materials.append(material)
            part = bpy.data.objects.new(MOVING_PREFIX + name, part_mesh)
            target.users_scene[0].collection.objects.link(part)
            part.parent = target
            part.matrix_parent_inverse = Matrix.Identity(4)
            part.matrix_basis = frame
        layer = whole.faces.layers.int.get(_PART)
        bmesh.ops.delete(whole, geom=[face for face in whole.faces if face[layer] != 0],
                         context="FACES")
        whole.to_mesh(mesh)
        whole.free()
    for owner in [target, *target.children]:
        if _PART in owner.data.attributes:
            owner.data.attributes.remove(owner.data.attributes[_PART])


def remove(target: bpy.types.Object) -> None:
    """Deletes a model with its moving parts and their meshes."""
    for owner in [*target.children_recursive, target]:
        mesh = owner.data
        bpy.data.objects.remove(owner, do_unlink=True)
        if mesh is not None and mesh.users == 0:
            bpy.data.meshes.remove(mesh)


# --- Checking, showing, writing ---------------------------------------------------------------

def describe(target: bpy.types.Object, footprint: float = FOOTPRINT, cells=(1, 1),
             max_height: float = MAX_HEIGHT) -> dict:
    """Size and triangle count, plus what breaks the limits of the model: within `footprint`
    of each of its `cells` (x, y) on the ground and below `max_height` (MAX_HEIGHT for modules;
    the masts around a base, perimeter.py, may be taller)."""
    # Moving parts count where they rest (their pose in the file).
    points = [vertex.co.copy() for vertex in target.data.vertices]
    triangles = sum(len(polygon.vertices) - 2 for polygon in target.data.polygons)
    for part in target.children:
        points += [part.matrix_basis @ vertex.co for vertex in part.data.vertices]
        triangles += sum(len(polygon.vertices) - 2 for polygon in part.data.polygons)
    low = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    high = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    problems = []
    limit_x = cells[0] - 1.0 + footprint
    limit_y = cells[1] - 1.0 + footprint
    if max(abs(low.x), abs(high.x)) > limit_x / 2.0 + 1e-6 or max(abs(low.y), abs(high.y)) > limit_y / 2.0 + 1e-6:
        problems.append("reaches outside the footprint of %.2f x %.2f" % (limit_x, limit_y))
    if high.z > max_height + 1e-6:
        problems.append("taller than %.2f" % max_height)
    if abs(low.z) > 1e-6:
        problems.append("does not stand on the ground")
    return {
        "name": target.name,
        "triangles": triangles,
        "parts": [part.name for part in target.children],
        "size": [round(value, 3) for value in (high - low)],
        "problems": problems,
    }


def show(target: bpy.types.Object) -> None:
    """In a running Blender: switches the windows to the stage scene and looks at the model
    with its flat colours, from the game's slanted, perspective-free angle."""
    scene = target.users_scene[0]
    for window in bpy.context.window_manager.windows:
        window.scene = scene
        for area in window.screen.areas:
            if area.type != "VIEW_3D":
                continue
            space = area.spaces.active
            space.shading.type = "SOLID"
            space.shading.color_type = "VERTEX"
            view = space.region_3d
            view.view_perspective = "ORTHO"
            view.view_rotation = Euler((math.radians(60.0), 0.0, math.radians(45.0))).to_quaternion()
            view.view_location = (0.0, 0.0, 0.45)
            view.view_distance = 3.2


def export_glb(target: bpy.types.Object, path: str) -> None:
    """Writes the model as GLB. Only without a window: called from the MCP add-on in a running
    Blender 5.3, the glTF export crashes Blender (access violation while the exporter asks for
    the evaluated scene; reproduced on 2026-11-17, also one tick after the build)."""
    if not bpy.app.background:
        raise RuntimeError("export_glb only runs without a window (blender --background); "
                           "in a running Blender it crashes Blender 5.3")
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    scene = target.users_scene[0]
    view_layer = scene.view_layers[0]
    wanted = {target, *target.children_recursive}
    for other in view_layer.objects:
        other.select_set(other in wanted, view_layer=view_layer)
    view_layer.objects.active = target
    overrides = {"scene": scene, "view_layer": view_layer}
    windows = bpy.context.window_manager.windows
    if len(windows) > 0:
        overrides["window"] = windows[0]
    with bpy.context.temp_override(**overrides):
        bpy.ops.export_scene.gltf(
            filepath=os.path.abspath(path),
            export_format="GLB",
            use_selection=True,
            # WebP on purpose: Godot 4.7 cannot read the JPEGs Blender 5.3 writes.
            export_image_format="WEBP",
            export_image_quality=90,
            export_apply=True,
            export_yup=True,
            export_animations=False,
            export_cameras=False,
            export_lights=False,
            export_extras=False,
        )


def run_many_from_command_line(builders: dict, footprint: float = FOOTPRINT,
                               max_height: float = MAX_HEIGHT) -> None:
    """Entry point of a script that builds several models: `builders` maps a file name (without
    .glb) to (build function, cells). Writes every model into --output-dir; --only limits it to
    some names (comma separated). Hulls pass footprint 1.0."""
    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--only", default="")
    options = parser.parse_args(arguments)
    wanted = [name for name in options.only.split(",") if name]
    failed = 0
    for name, (build, cells) in builders.items():
        if wanted and name not in wanted:
            continue
        path = os.path.join(options.output_dir, name + ".glb")
        try:
            target = build()
            facts = describe(target, footprint, cells, max_height)
            export_glb(target, path)
            remove(target)
        except Exception as error:
            import traceback
            traceback.print_exc()
            print("FAIL  %s: %s" % (name, error))
            failed += 1
            continue
        print("RESULT %s.glb: %d triangles, size %s, %.1f KB%s%s" % (
            name, facts["triangles"], facts["size"], os.path.getsize(path) / 1024.0,
            "".join(", moving " + part for part in facts["parts"]),
            "".join(", PROBLEM: " + problem for problem in facts["problems"])))
        if facts["problems"]:
            failed += 1
    sys.exit(1 if failed else 0)


def run_from_command_line(build, footprint: float = FOOTPRINT, cells=(1, 1)) -> None:
    """Entry point of a model script started with blender --background --python. Hulls pass
    footprint 1.0 (they fill their cell); modules larger than one cell pass `cells` (x, y)."""
    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    options = parser.parse_args(arguments)
    try:
        target = build()
        facts = describe(target, footprint, cells)
        export_glb(target, options.output)
    except Exception as error:  # Blender would otherwise exit with code 0.
        import traceback
        traceback.print_exc()
        print("FAIL  %s" % error)
        sys.exit(1)
    print("RESULT %s: %d triangles, size %s, %.1f KB%s%s" % (
        os.path.basename(options.output), facts["triangles"], facts["size"],
        os.path.getsize(options.output) / 1024.0,
        "".join(", moving " + part for part in facts["parts"]),
        "".join(", PROBLEM: " + problem for problem in facts["problems"])))
    sys.exit(1 if facts["problems"] else 0)
