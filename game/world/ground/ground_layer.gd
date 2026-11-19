class_name GroundLayer
extends Node3D
## The ground under a colony: one flat quad per loaded surface block (SurfaceBlocks.BLOCK cells
## square, one draw call), textured per cell from the biome atlas by ground.gdshader. Each block
## has a small cell texture (GroundTiles.cell_image) with the ring of its neighbours, so borders
## blend across blocks too; when a block arrives, the blocks beside it renew their ring.
## Unexplored cells (draft.31) are drawn as fog, with a soft, noisy edge toward the explored ground.

const SHADER := preload("res://game/world/ground/ground.gdshader")
const ATLAS := preload("res://game/world/ground/ground_atlas.webp")
const NOISE := preload("res://game/world/ground/ground_noise.png")
## The V1 tile colours are graded dark for 2D; lit in 3D they need lifting.
const BRIGHTNESS := 1.9

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


## Draws the block whose first cell is (x0, y0), placed relative to `origin`.
func add_block(surface: SurfaceBlocks, x0: int, y0: int, origin: Vector3i, size_x: int) -> void:
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
	instance.mesh = _mesh
	instance.material_override = material
	# Flat ground throws no shadow worth a shadow pass.
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	instance.set_meta("x0", x0)
	instance.set_meta("y0", y0)
	var corner := WorldGrid.to_scene(Vector3i(x0, y0, 0), origin, size_x)
	var half := SurfaceBlocks.BLOCK * 0.5
	instance.position = corner + Vector3(half - 0.5, 0.0, 0.5 - half)
	add_child(instance)
	_blocks[key] = instance
	_update_cells(instance)
	for dy: int in [-1, 0, 1]:
		for dx: int in [-1, 0, 1]:
			var beside := _key(x0 + dx * SurfaceBlocks.BLOCK, y0 + dy * SurfaceBlocks.BLOCK)
			if beside != key and _blocks.has(beside):
				_update_cells(_blocks[beside] as MeshInstance3D)


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


func _key(x0: int, y0: int) -> Vector2i:
	return Vector2i(floori(float(WorldGrid.wrap_x(x0, _size_x)) / SurfaceBlocks.BLOCK), floori(float(y0) / SurfaceBlocks.BLOCK))
