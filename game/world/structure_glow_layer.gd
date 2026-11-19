class_name StructureGlowLayer
extends Node3D
## The light of a structure's lamps on the ground around it at night: a warm glow that follows the
## footprint's shape and fades out a few cells from its edge (Rudi 2026-11-19: structures were
## too dark at night). No real lights (too dear on phones in the Compatibility renderer): one flat
## quad per structure, added to the ground (structure_glow.gdshader), shaded by a small texture of
## how close every spot lies to the footprint (GlowField). Hidden behind the hulls by the depth
## test; invisible by day, fainter on airless bodies (no air to scatter the light).
##
## Lives under PerimeterLayer and follows it: rebuilt with it, hidden with it in the cutaway view,
## dark with it. Only structures resting on their cells glow (not one under way); guests stand on
## the docks of their host, whose glow they share.

const SHADER := preload("res://game/world/structure_glow.gdshader")
## How far the glow reaches beyond the footprint (cells), and samples per cell of its texture.
const MARGIN := 3
const PER_CELL := 2
## Strength at full darkness, and the share of it left on an airless body.
const STRENGTH := 0.5
const AIRLESS_SHARE := 0.55
const DARK_ENOUGH := 0.03
## Height of the quad above the ground: over the base's concrete, under the floodlight pools.
const LIFT := 0.008
## Fields and textures of footprints seen lately, by a hash of the footprint.
const KEPT := 16

var _view: ColonyView
var _materials: Array[ShaderMaterial] = []
var _darkness := 0.0
var _textures: Dictionary = {}
var _fields: Dictionary = {}


func setup(view: ColonyView) -> void:
	_view = view


## The ground cells (x, y) of every structure on screen that glows now: hull cells from the ground
## up, one list per structure.
static func footprints_for(view: ColonyView) -> Array:
	var result: Array = []
	if view == null or view.model == null:
		return result
	var now := Services.clock.now_ms()
	for structure: ColonyModel in view.model.drawn_structures():
		if structure.is_guest() or view.trip_of(structure, now) != ColonyView.Trip.RESTING:
			continue
		var layout := structure.layout
		var cells: Array[Vector2i] = []
		var seen: Dictionary = {}
		for local: Vector3i in layout.hull_cells():
			var cell := layout.to_absolute(local)
			var flat := Vector2i(cell.x, cell.y)
			if cell.z < 0 or seen.has(flat):
				continue
			seen[flat] = true
			cells.append(flat)
		if not cells.is_empty():
			result.append(cells)
	return result


## Lays a glow under every structure on screen again, around the view's origin.
func rebuild() -> void:
	for child: Node in get_children():
		child.queue_free()
	_materials.clear()
	if _view == null or _view.model == null:
		return
	var size_x := _view.model.size_x
	for cells: Array[Vector2i] in footprints_for(_view):
		var key := hash([cells, size_x])
		var field := _field(key, cells, size_x)
		if field.is_empty():
			continue
		var material := ShaderMaterial.new()
		material.shader = SHADER
		material.set_shader_parameter("field", _texture(key, field))
		_materials.append(material)
		var instance := MeshInstance3D.new()
		instance.name = "Glow"
		instance.mesh = _quad(field, material)
		instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(instance)
	_apply()


## How dark it is (SkyLight.darkness): the glow follows it.
func set_darkness(level: float) -> void:
	_darkness = clampf(level, 0.0, 1.0)
	_apply()


## Structures glowing and how many are drawn now (for measuring).
func stats() -> Dictionary:
	return {"glows": _materials.size(), "glows_drawn": _materials.size() if visible and _shown() else 0}


func _shown() -> bool:
	return _darkness > DARK_ENOUGH


func _apply() -> void:
	var airless := SkyLight.airless(_view.model.atmosphere_density) if _view != null and _view.model != null else 0.0
	var strength := STRENGTH * _darkness * lerpf(1.0, AIRLESS_SHARE, airless)
	for material: ShaderMaterial in _materials:
		material.set_shader_parameter("strength", strength)
	for child: Node in get_children():
		(child as Node3D).visible = _shown()


func _field(key: int, cells: Array[Vector2i], size_x: int) -> GlowField.Field:
	if not _fields.has(key):
		if _fields.size() >= KEPT:
			_fields.clear()
			_textures.clear()
		_fields[key] = GlowField.build(cells, MARGIN, PER_CELL, size_x)
	return _fields[key] as GlowField.Field


func _texture(key: int, field: GlowField.Field) -> ImageTexture:
	if not _textures.has(key):
		var size := field.samples()
		var image := Image.create_from_data(size.x, size.y, false, Image.FORMAT_L8, field.values)
		_textures[key] = ImageTexture.create_from_image(image)
	return _textures[key] as ImageTexture


## The quad over the field's cells, in the scene around the view's origin. UV (0, 0) is the field's
## low corner (smallest cell x and y), so texture rows run along cell y.
func _quad(field: GlowField.Field, material: Material) -> ArrayMesh:
	var corner := WorldGrid.to_scene(Vector3i(field.low.x, field.low.y, 0), _view.origin, _view.model.size_x)
	# to_scene gives the cell's centre; cell y runs along scene ???Z.
	var x0 := corner.x - 0.5
	var z0 := corner.z + 0.5
	var y := LIFT - float(_view.origin.z)
	var width := float(field.cells.x)
	var depth := float(field.cells.y)
	var vertices := PackedVector3Array([Vector3(x0, y, z0), Vector3(x0 + width, y, z0),
		Vector3(x0 + width, y, z0 - depth), Vector3(x0, y, z0 - depth)])
	var normals := PackedVector3Array([Vector3.UP, Vector3.UP, Vector3.UP, Vector3.UP])
	var uvs := PackedVector2Array([Vector2(0, 0), Vector2(1, 0), Vector2(1, 1), Vector2(0, 1)])
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = PackedInt32Array([0, 1, 2, 0, 2, 3])
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	mesh.surface_set_material(0, material)
	return mesh
