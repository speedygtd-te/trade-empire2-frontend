class_name GroundLayer
extends Node3D
## The ground under a colony: one mesh per loaded surface block (SurfaceBlocks.BLOCK cells square,
## one draw call), textured per cell from the biome atlas by ground.gdshader. Each block has a
## small cell texture (GroundTiles.cell_image) with the ring of its neighbours, so borders blend
## across blocks too; when a block arrives, the blocks beside it renew their ring.
## Unexplored cells (draft.31) are drawn as fog, with a soft, noisy edge toward the explored ground.
##
## With a `relief` (TerrainRelief) a block is a grid of two triangles per cell through the corner
## heights of the relief, lit by their normals; neighbouring blocks share their edge corners, so no
## crack opens between them. Without one (the rock floor of the cutaway) a block is a flat quad.

const SHADER := preload("res://game/world/ground/ground.gdshader")
const ATLAS := preload("res://game/world/ground/ground_atlas.webp")
const NOISE := preload("res://game/world/ground/ground_noise.png")
## The V1 tile colours are graded dark for 2D; lit in 3D they need lifting.
const BRIGHTNESS := 1.9

## The heights of the ground; null draws flat blocks.
var relief: TerrainRelief = null
var _tiles := GroundTiles.new(GroundAtlas.FIRST_LAYER, GroundAtlas.VARIANTS, GroundAtlas.FALLBACK_LAYER, GroundAtlas.MIRROR)
var _mesh: PlaneMesh
var _tint := Color.WHITE
var _soft := true
## Block (wrapped block x, block y) → its MeshInstance3D; meta "x0", "y0" are its first cell.
var _blocks: Dictionary = {}
var _surface: SurfaceBlocks
var _size_x := 0


func _init() -> void:
	_mesh = PlaneMesh.new()
	_mesh.size = Vector2(SurfaceBlocks.BLOCK, SurfaceBlocks.BLOCK)


## Removes every block (and whatever else hangs below the ground).
func clear() -> void:
	for child: Node in get_children():
		remove_child(child)
		child.queue_free()
	_blocks.clear()


## Draws the block whose first cell is (x0, y0), placed relative to `origin`. The blocks beside it
## renew their cell texture; with a relief their meshes change too: those blocks are returned
## (block → true) for the caller to build again (refresh_heights), a few per frame.
func add_block(surface: SurfaceBlocks, x0: int, y0: int, origin: Vector3i, size_x: int) -> Dictionary:
	_surface = surface
	_size_x = size_x
	var key := _key(x0, y0)
	if _blocks.has(key):
		var old := _blocks[key] as Node
		remove_child(old)
		old.queue_free()
	var material := ShaderMaterial.new()
	material.shader = SHADER
	material.set_shader_parameter("atlas", ATLAS)
	material.set_shader_parameter("noise", NOISE)
	material.set_shader_parameter("block_size", SurfaceBlocks.BLOCK)
	material.set_shader_parameter("brightness", BRIGHTNESS)
	material.set_shader_parameter("tint", Vector3(_tint.r, _tint.g, _tint.b))
	material.set_shader_parameter("soft", _soft)
	var instance := MeshInstance3D.new()
	instance.material_override = material
	# The gentle hills throw no shadow worth a shadow pass over the whole ground.
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	instance.set_meta("x0", x0)
	instance.set_meta("y0", y0)
	var corner := WorldGrid.to_scene(Vector3i(x0, y0, 0), origin, size_x)
	var half := SurfaceBlocks.BLOCK * 0.5
	instance.position = corner + Vector3(half - 0.5, 0.0, 0.5 - half)
	add_child(instance)
	_blocks[key] = instance
	_update_cells(instance)
	_update_mesh(instance)
	var renewed := {}
	for dy: int in [-1, 0, 1]:
		for dx: int in [-1, 0, 1]:
			var beside := _key(x0 + dx * SurfaceBlocks.BLOCK, y0 + dy * SurfaceBlocks.BLOCK)
			if beside != key and _blocks.has(beside):
				_update_cells(_blocks[beside] as MeshInstance3D)
				if relief != null:
					renewed[beside] = true
	return renewed


## Builds the meshes of the drawn blocks among `blocks` (block → true, wrapped as SurfaceBlocks
## counts them) again from the relief; returns how many were drawn.
func refresh_heights(blocks: Dictionary) -> int:
	var count := 0
	for block: Vector2i in blocks.keys():
		var instance := _blocks.get(block) as MeshInstance3D
		if instance != null:
			_update_mesh(instance)
			count += 1
	return count


## Whether a block (first cell) is drawn.
func has_block(x0: int, y0: int) -> bool:
	return _blocks.has(_key(x0, y0))


## Tint over the whole ground (1 = as lit; darker on airless bodies).
func set_tint(color: Color) -> void:
	_tint = color
	for instance: MeshInstance3D in _instances():
		(instance.material_override as ShaderMaterial).set_shader_parameter("tint", Vector3(color.r, color.g, color.b))


## Soft borders between cells (several texture reads near borders) or hard ones (one read).
func set_soft(on: bool) -> void:
	_soft = on
	for instance: MeshInstance3D in _instances():
		(instance.material_override as ShaderMaterial).set_shader_parameter("soft", on)


func block_count() -> int:
	return _blocks.size()


func _instances() -> Array[MeshInstance3D]:
	var result: Array[MeshInstance3D] = []
	for instance: MeshInstance3D in _blocks.values():
		result.append(instance)
	return result


func _update_cells(instance: MeshInstance3D) -> void:
	var x0: int = instance.get_meta("x0")
	var y0: int = instance.get_meta("y0")
	var image := _tiles.cell_image(x0, y0, SurfaceBlocks.BLOCK, _size_x, _surface.cell, _surface.is_hidden)
	var material := instance.material_override as ShaderMaterial
	var texture := material.get_shader_parameter("cells") as ImageTexture
	if texture == null:
		material.set_shader_parameter("cells", ImageTexture.create_from_image(image))
	else:
		texture.update(image)


## The block's mesh: flat, or through the relief's corner heights (local to the block's middle,
## the cells' corners at whole numbers; two triangles per cell, split as TerrainRelief.split).
func _update_mesh(instance: MeshInstance3D) -> void:
	if relief == null:
		instance.mesh = _mesh
		return
	var x0: int = instance.get_meta("x0")
	var y0: int = instance.get_meta("y0")
	var block := _key(x0, y0)
	var heights := relief.block_heights(block)
	var cells := SurfaceBlocks.BLOCK
	var side := cells + 1
	var stride := TerrainRelief.SIDE
	var half := cells * 0.5
	var vertices := PackedVector3Array()
	var normals := PackedVector3Array()
	vertices.resize(side * side)
	normals.resize(side * side)
	var reference := relief.reference
	# Lit as a hillshade: the slopes read steeper than drawn (TerrainRelief.HILLSHADE).
	var slope := TerrainRelief.SCALE * 0.5 * TerrainRelief.HILLSHADE
	for j: int in side:
		var row := (j + 1) * stride + 1
		for i: int in side:
			var h := row + i
			# Cell y runs along scene −Z.
			vertices[j * side + i] = Vector3(i - half, (heights[h] - reference) * TerrainRelief.SCALE, half - j)
			normals[j * side + i] = Vector3((heights[h - 1] - heights[h + 1]) * slope, 1.0,
				(heights[h + stride] - heights[h - stride]) * slope).normalized()
	var indices := PackedInt32Array()
	indices.resize(cells * cells * 6)
	var at := 0
	for j: int in cells:
		for i: int in cells:
			var a := j * side + i
			var c := a + side
			var h := (j + 1) * stride + i + 1
			# Clockwise seen from above (Godot's front faces); the diagonal as TerrainRelief.split.
			indices[at] = a
			indices[at + 1] = c
			if absf(heights[h] - heights[h + stride + 1]) <= absf(heights[h + 1] - heights[h + stride]):
				indices[at + 2] = c + 1
				indices[at + 3] = a
				indices[at + 4] = c + 1
				indices[at + 5] = a + 1
			else:
				indices[at + 2] = a + 1
				indices[at + 3] = a + 1
				indices[at + 4] = c
				indices[at + 5] = c + 1
			at += 6
	# Terraces beside structures on a slope lie flat at their base, apart from the corners the
	# ground beyond them shares (a retaining wall closes the step between).
	var levelled := relief.levelled_in_block(block)
	if not levelled.is_empty():
		var first_x := block.x * cells
		for key: Vector2i in levelled.keys():
			var i := key.x - first_x
			var j := key.y - y0
			if i < 0 or i >= cells or j < 0 or j >= cells:
				continue
			var base: float = levelled[key]
			var y := (base - reference) * TerrainRelief.SCALE
			var first := vertices.size()
			for corner: Vector2i in [Vector2i(0, 0), Vector2i(0, 1), Vector2i(1, 1), Vector2i(1, 0)]:
				vertices.append(Vector3(i + corner.x - half, y, half - j - corner.y))
				normals.append(Vector3.UP)
			at = (j * cells + i) * 6
			indices[at] = first
			indices[at + 1] = first + 1
			indices[at + 2] = first + 2
			indices[at + 3] = first
			indices[at + 4] = first + 2
			indices[at + 5] = first + 3
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	instance.mesh = mesh


func _key(x0: int, y0: int) -> Vector2i:
	return Vector2i(floori(float(WorldGrid.wrap_x(x0, _size_x)) / SurfaceBlocks.BLOCK), floori(float(y0) / SurfaceBlocks.BLOCK))
