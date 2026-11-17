"""Makes a generated model (GLB or OBJ) fit for the game. Runs inside Blender without a window.

One mesh, at most --max-triangles triangles, textures no larger than --texture-size, a
non-metallic material, the footprint scaled to one grid cell, centred, standing on the ground.

  blender --background --factory-startup --python scripts/3d/postprocess.py -- \
      --input assets/3d-test/mine_0__trellis.glb --output assets/3d-test/processed/mine_0.glb \
      [--max-triangles 3000] [--texture-size 512] [--cell 1.0] [--fill 0.9] \
      [--image-format WEBP|JPEG|AUTO] [--shading keep|flat|smooth] [--recalc-normals] \
      [--keep-metallic]

Whole folders: tools\\postprocess-models.ps1. Prints one RESULT line per model; exit code 1 on
failure. Written against Blender 5.3.
"""

import argparse
import os
import sys

import bpy
from mathutils import Matrix, Vector


def parse_arguments() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(prog="postprocess.py")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-triangles", type=int, default=3000)
    parser.add_argument("--texture-size", type=int, default=512)
    parser.add_argument("--cell", type=float, default=1.0)
    parser.add_argument("--fill", type=float, default=0.9)
    # WEBP is the default on purpose: Godot 4.7 fails to read the JPEGs Blender 5.3 writes.
    # AUTO keeps the source format (PNG stays PNG).
    parser.add_argument("--image-format", choices=("WEBP", "JPEG", "AUTO"), default="WEBP")
    parser.add_argument("--shading", choices=("keep", "flat", "smooth"), default="keep")
    parser.add_argument("--recalc-normals", action="store_true")
    parser.add_argument("--keep-metallic", action="store_true")
    return parser.parse_args(arguments)


def triangle_count(mesh: bpy.types.Mesh) -> int:
    return sum(len(polygon.vertices) - 2 for polygon in mesh.polygons)


def single_mesh_object() -> bpy.types.Object:
    """Joins every imported mesh into one object without parents or pending transforms."""
    meshes = [candidate for candidate in bpy.context.scene.objects if candidate.type == "MESH"]
    if not meshes:
        raise RuntimeError("the file contains no mesh")
    bpy.ops.object.select_all(action="DESELECT")
    for mesh_object in meshes:
        mesh_object.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    if len(meshes) > 1:
        bpy.ops.object.join()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    joined = bpy.context.view_layer.objects.active
    for leftover in [candidate for candidate in bpy.context.scene.objects if candidate != joined]:
        bpy.data.objects.remove(leftover, do_unlink=True)
    return joined


def reduce_triangles(target: bpy.types.Object, max_triangles: int) -> None:
    before = triangle_count(target.data)
    if before <= max_triangles:
        return
    modifier = target.modifiers.new(name="Reduce", type="DECIMATE")
    modifier.ratio = max_triangles / before
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def recalculate_normals() -> None:
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def apply_shading(target: bpy.types.Object, shading: str) -> None:
    if shading == "keep":
        return
    if target.data.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    if shading == "flat":
        target.data.shade_flat()
    else:
        bpy.ops.object.shade_auto_smooth(angle=0.523599)


def make_non_metallic() -> None:
    """Generated models carry a base colour only. A material without a metallic value counts as
    fully metallic in glTF and renders almost black (seen with Trellis), so it is set to 0."""
    for material in bpy.data.materials:
        if material.node_tree is None:
            continue
        for node in material.node_tree.nodes:
            if node.type != "BSDF_PRINCIPLED":
                continue
            metallic = node.inputs["Metallic"]
            for link in list(metallic.links):
                material.node_tree.links.remove(link)
            metallic.default_value = 0.0


def fit_to_cell(mesh: bpy.types.Mesh, cell: float, fill: float) -> float:
    """Scales the footprint to the cell, centres it and puts the base on the ground.
    Returns the height in cells. Blender's up axis is Z."""
    low = Vector((min(v.co.x for v in mesh.vertices), min(v.co.y for v in mesh.vertices),
                  min(v.co.z for v in mesh.vertices)))
    high = Vector((max(v.co.x for v in mesh.vertices), max(v.co.y for v in mesh.vertices),
                   max(v.co.z for v in mesh.vertices)))
    size = high - low
    footprint = max(size.x, size.y)
    factor = fill * cell / footprint if footprint > 0.0 else 1.0
    centre = Vector(((low.x + high.x) / 2.0, (low.y + high.y) / 2.0, low.z))
    mesh.transform(Matrix.Scale(factor, 4) @ Matrix.Translation(-centre))
    mesh.update()
    return size.z * factor / cell


def shrink_textures(texture_size: int) -> tuple[str, str]:
    """Returns the largest texture size before and after as text."""
    before = (0, 0)
    after = (0, 0)
    for image in bpy.data.images:
        width, height = image.size[0], image.size[1]
        if width == 0 or height == 0:
            continue
        before = max(before, (width, height))
        largest = max(width, height)
        if largest > texture_size:
            factor = texture_size / largest
            image.scale(max(1, round(width * factor)), max(1, round(height * factor)))
        after = max(after, (image.size[0], image.size[1]))
    return "%dx%d" % before, "%dx%d" % after


def megabytes(path: str) -> float:
    return os.path.getsize(path) / 1048576.0


def main() -> int:
    options = parse_arguments()
    source = os.path.abspath(options.input)
    destination = os.path.abspath(options.output)
    os.makedirs(os.path.dirname(destination), exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    if source.lower().endswith(".obj"):
        # The material file and the texture must lie next to the OBJ under the names it uses.
        bpy.ops.wm.obj_import(filepath=source)
    else:
        bpy.ops.import_scene.gltf(filepath=source, merge_vertices=True)
    target = single_mesh_object()
    triangles_before = triangle_count(target.data)

    reduce_triangles(target, options.max_triangles)
    if options.recalc_normals:
        recalculate_normals()
    apply_shading(target, options.shading)
    if not options.keep_metallic:
        make_non_metallic()
    height = fit_to_cell(target.data, options.cell, options.fill)
    textures_before, textures_after = shrink_textures(options.texture_size)
    target.name = os.path.splitext(os.path.basename(destination))[0]
    target.data.name = target.name

    bpy.ops.export_scene.gltf(
        filepath=destination,
        export_format="GLB",
        export_image_format=options.image_format,
        export_image_quality=85,
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )
    print("RESULT %s: triangles %d -> %d, materials %d, texture %s -> %s, model file %.1f MB -> "
          "%.2f MB, height %.2f cells" % (
              os.path.basename(destination), triangles_before, triangle_count(target.data),
              len(target.data.materials), textures_before, textures_after,
              megabytes(source), megabytes(destination), height))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # Blender would otherwise exit with code 0.
        print("FAIL  %s" % error)
        sys.exit(1)
