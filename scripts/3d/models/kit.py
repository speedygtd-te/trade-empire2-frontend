"""Building kit for hand-made low-poly models. Runs inside Blender (written against 5.3).

A model is one mesh. Every face has a palette colour and a surface kind (metal or concrete).
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

# Colour name -> (sRGB colour, surface kind, finish). Kinds: "metal" (surface texture, rust),
# "concrete" (surface texture), "plain" (flat: glass, openings, rubber). The finish is
# (roughness, metalness), each 0..1: low roughness shines, high metalness mirrors the
# surroundings in the colour of the surface.
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
    # See-through glass: these faces become a separate transparent surface (GLASS_*), not baked.
    "pane": ((0.45, 0.60, 0.65), "plain", (0.05, 0.0)),
    # Cleaner paints of hulls and housing (V1 hull sprites).
    "paint_grey": ((0.60, 0.63, 0.64), "metal", _PAINT),
    "navy": ((0.16, 0.22, 0.33), "metal", (0.45, 0.30)),
    "blue_paint": ((0.22, 0.42, 0.68), "metal", _PAINT),
    "black_metal": ((0.10, 0.10, 0.11), "metal", (0.50, 0.25)),
    "soil": ((0.36, 0.24, 0.16), "concrete", _MATTE),
    "plant": ((0.24, 0.62, 0.22), "plain", (0.85, 0.0)),
}
# Colours that give off light, and the sRGB colour of their light. Baked into a third texture
# (the glow mask); the game turns it up at night and on airless worlds (ColonyView).
GLOWS = {
    "glow_orange": (1.0, 0.55, 0.12),
    "glow_purple": (0.78, 0.35, 1.0),
    "glow_cyan": (0.35, 0.90, 0.90),
    "window": (1.0, 0.76, 0.45),
    "glow_green": (0.35, 0.95, 0.45),
}
PANE = "pane"
# The see-through glass: tint (sRGB), opacity, roughness.
GLASS_COLOR = (0.62, 0.78, 0.84)
GLASS_ALPHA = 0.28
GLASS_ROUGHNESS = 0.05
# How a surface kind is stored in the fourth channel of the face colour.
_KINDS = {"concrete": 0.0, "plain": 0.5, "metal": 1.0}

# --- The recipe of the baked look -----------------------------------------------------------
# Edge length of the texture of one model, in pixels.
TEXTURE_PIXELS = 512
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
_SURFACE_PIXELS = 512
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
        self._frame = Matrix.Identity(4)

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

    def box(self, center, size, color: str, turn: float = 0.0) -> None:
        """A box with its centre at *center*; *turn* rotates it around Z (radians)."""
        matrix = (self._frame @ Matrix.Translation(Vector(center)) @ Matrix.Rotation(turn, 4, "Z")
                  @ Matrix.Diagonal((size[0], size[1], size[2], 1.0)))
        with self._into(color):
            self._paint(self._faces(bmesh.ops.create_cube(self._mesh, size=1.0, matrix=matrix)), color)

    def beam(self, start, end, thickness: float, color: str) -> None:
        """A square bar from *start* to *end*."""
        matrix = _along(self._frame @ Vector(start), self._frame @ Vector(end), thickness, thickness)
        with self._into(color):
            self._paint(self._faces(bmesh.ops.create_cube(self._mesh, size=1.0, matrix=matrix)), color)

    def cylinder(self, start, end, radius: float, color: str, segments: int = 10,
                 end_radius: float | None = None) -> None:
        """A round bar from *start* to *end*; *end_radius* makes it a cone or taper."""
        start, end = self._frame @ Vector(start), self._frame @ Vector(end)
        with self._into(color):
            created = bmesh.ops.create_cone(
                self._mesh, cap_ends=True, cap_tris=False, segments=segments, radius1=radius,
                radius2=radius if end_radius is None else end_radius, depth=1.0,
                matrix=_along(start, end, 1.0, 1.0))
            faces = self._faces(created)
            self._paint(faces, color)
        axis = (end - start).normalized()
        for face in faces:
            face.normal_update()
            # Round sides are shaded smooth, the two end caps stay flat.
            face.smooth = abs(face.normal.dot(axis)) < 0.99

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
            previous_mesh = previous.data
            bpy.data.objects.remove(previous, do_unlink=True)
            if previous_mesh.users == 0:
                bpy.data.meshes.remove(previous_mesh)
        mesh = bpy.data.meshes.new(self.name)
        self._solid.to_mesh(mesh)
        self._solid.free()
        target = bpy.data.objects.new(self.name, mesh)
        scene.collection.objects.link(target)
        if bpy.app.background:
            _bake_look(target, self._glowing, self.wear)
        else:
            mesh.color_attributes.active_color_name = _TINT
        if len(self._glass.faces) > 0:
            _add_glass(target, self._glass)
        self._glass.free()
        return target

    def _faces(self, created: dict) -> set:
        return {face for vert in created["verts"] for face in vert.link_faces}

    def _paint(self, faces: set, color: str) -> None:
        if color == PANE:
            return
        srgb, kind, finish = PALETTE[color]
        # This kind of colour layer stores sRGB; Blender converts it for the shader itself.
        # Converting here as well made every colour far too dark (tried 2026-11-17).
        value = (*srgb, _KINDS[kind])
        light = (*GLOWS.get(color, (0.0, 0.0, 0.0)), 1.0)
        self._glowing = self._glowing or color in GLOWS
        for face in faces:
            for loop in face.loops:
                loop[self._tint] = value
                loop[self._finish] = (finish[0], finish[1], 0.0, 1.0)
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


def _surface_image(kind: str) -> bpy.types.Image:
    """The surface texture of *kind* as the bake needs it: red = brightness relative to the
    surroundings (0.5 = unchanged; uneven lighting removed), green = rust. Seamless. A missing
    texture file gives a neutral image, so models still build with flat colours."""
    name = "te_surface_" + kind
    existing = bpy.data.images.get(name)
    if existing is not None:
        bpy.data.images.remove(existing)
    size = _SURFACE_PIXELS
    pixels = numpy.zeros((size, size, 4), dtype=numpy.float32)
    pixels[:, :, 0] = 0.5
    pixels[:, :, 3] = 1.0
    path = os.path.join(TEXTURE_FOLDER, kind + ".jpg")
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

def _look_material(wear: float = 1.0) -> tuple:
    """The recipe as a node graph: palette colour x surface texture, rust on metal, dirt in
    corners, worn edges, and the finish (roughness, metalness); *wear* (0..1) scales the age
    and dirt (Builder). Returns the material, the
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

    surface = node("ShaderNodeSeparateColor")
    link(mix("MIX", is_metal, surfaces["concrete"], surfaces["metal"]), surface.inputs[0])
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


def _bake_look(target: bpy.types.Object, glowing: bool, wear: float = 1.0) -> None:
    """Unwraps the model, bakes the look into two textures (colour and finish), and a third
    one (the glow mask) when something on it glows, and leaves the model with a plain material
    that shows them."""
    scene = target.users_scene[0]
    mesh = target.data
    look, glow_input, color_result, finish_result = _look_material(wear)
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


# --- Checking, showing, writing ---------------------------------------------------------------

def describe(target: bpy.types.Object, footprint: float = FOOTPRINT, cells=(1, 1)) -> dict:
    """Size and triangle count, plus what breaks the limits of the model: within `footprint`
    of each of its `cells` (x, y) on the ground and below MAX_HEIGHT."""
    mesh = target.data
    low = Vector((min(v.co.x for v in mesh.vertices), min(v.co.y for v in mesh.vertices),
                  min(v.co.z for v in mesh.vertices)))
    high = Vector((max(v.co.x for v in mesh.vertices), max(v.co.y for v in mesh.vertices),
                   max(v.co.z for v in mesh.vertices)))
    problems = []
    limit_x = cells[0] - 1.0 + footprint
    limit_y = cells[1] - 1.0 + footprint
    if max(abs(low.x), abs(high.x)) > limit_x / 2.0 + 1e-6 or max(abs(low.y), abs(high.y)) > limit_y / 2.0 + 1e-6:
        problems.append("reaches outside the footprint of %.2f x %.2f" % (limit_x, limit_y))
    if high.z > MAX_HEIGHT + 1e-6:
        problems.append("taller than %.2f" % MAX_HEIGHT)
    if abs(low.z) > 1e-6:
        problems.append("does not stand on the ground")
    return {
        "name": target.name,
        "triangles": sum(len(polygon.vertices) - 2 for polygon in mesh.polygons),
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
    for other in view_layer.objects:
        other.select_set(other == target, view_layer=view_layer)
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


def run_many_from_command_line(builders: dict, footprint: float = FOOTPRINT) -> None:
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
            facts = describe(target, footprint, cells)
            export_glb(target, path)
            mesh = target.data
            bpy.data.objects.remove(target, do_unlink=True)
            bpy.data.meshes.remove(mesh)
        except Exception as error:
            import traceback
            traceback.print_exc()
            print("FAIL  %s: %s" % (name, error))
            failed += 1
            continue
        print("RESULT %s.glb: %d triangles, size %s, %.1f KB%s" % (
            name, facts["triangles"], facts["size"], os.path.getsize(path) / 1024.0,
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
    print("RESULT %s: %d triangles, size %s, %.1f KB%s" % (
        os.path.basename(options.output), facts["triangles"], facts["size"],
        os.path.getsize(options.output) / 1024.0,
        "".join(", PROBLEM: " + problem for problem in facts["problems"])))
    sys.exit(1 if facts["problems"] else 0)
