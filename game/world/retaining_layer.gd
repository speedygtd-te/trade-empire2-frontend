class_name RetainingLayer
extends Node3D
## The retaining walls beside structures on a slope (RetainingWalls places the pieces, TerrainRelief
## decides where), the piers under their edges over water and the caissons of props standing in it
## (Piers): low-poly models from game/world/models/retaining (scripts/3d/models/retaining.py),
## one MultiMesh per model and CHUNK × CHUNK cells so the parts off screen are culled. Each piece is
## a little brighter or darker (instance colour), so the long runs of the same panel do not repeat.

const MODELS := "res://game/world/models/retaining/"
## Cells per side of one MultiMesh.
const CHUNK := 32
## Models that cast shadows.
const CASTING: Array[String] = [RetainingWalls.PANEL, RetainingWalls.COLUMN, Piers.PILLAR, Piers.BEAM]

var _view: ColonyView
## File → Mesh (null when missing).
var _meshes: Dictionary = {}
var _tier := DetailGovernor.DEFAULT_TIER
var _counts: Dictionary = {}


func setup(view: ColonyView) -> void:
	_view = view


## Whether every model of the walls is there (without them the walls are drawn plain).
func ready_to_draw() -> bool:
	return has_models(RetainingWalls.FILES)


## Whether every model among `files` is there (Piers.FILES: without them no piers).
func has_models(files: Array[String]) -> bool:
	for file: String in files:
		if _mesh(file) == null:
			return false
	return true


## Draws these pieces instead of the ones before.
func rebuild(pieces: Array[RetainingWalls.Piece]) -> void:
	for child: Node in get_children():
		remove_child(child)
		child.queue_free()
	_counts.clear()
	# "file chunk" → pieces.
	var groups: Dictionary = {}
	for piece: RetainingWalls.Piece in pieces:
		var origin := piece.placed.origin
		var key := "%s %d,%d" % [piece.file, floori(origin.x / CHUNK), floori(origin.z / CHUNK)]
		if not groups.has(key):
			groups[key] = []
		var list: Array = groups[key]
		list.append(piece)
	for key: String in groups.keys():
		var file := key.get_slice(" ", 0)
		var list: Array = groups[key]
		var mesh := _mesh(file)
		if mesh == null:
			continue
		var multimesh := MultiMesh.new()
		multimesh.transform_format = MultiMesh.TRANSFORM_3D
		multimesh.use_colors = true
		multimesh.mesh = mesh
		multimesh.instance_count = list.size()
		for index: int in list.size():
			var piece: RetainingWalls.Piece = list[index]
			multimesh.set_instance_transform(index, piece.placed)
			multimesh.set_instance_color(index, Color(piece.shade, piece.shade, piece.shade))
		var instance := MultiMeshInstance3D.new()
		instance.name = key.replace(" ", "_").replace(",", "_")
		instance.multimesh = multimesh
		instance.set_meta("file", file)
		add_child(instance)
		var before: int = _counts.get(file, 0)
		_counts[file] = before + list.size()
	_apply()


func apply_detail(tier: DetailGovernor.Tier) -> void:
	_tier = tier
	_apply()


## Pieces per model and the MultiMeshes drawn now (for measuring).
func stats() -> Dictionary:
	var result := _counts.duplicate()
	var drawn := 0
	for child: Node in get_children():
		if child is MultiMeshInstance3D and not child.is_queued_for_deletion():
			drawn += 1
	result["multimeshes"] = drawn
	return result


## Panels, pilasters, pier pillars and beams cast shadows unless the device is slow; the small
## pieces never do (a shadow pass costs a draw call per MultiMesh).
func _apply() -> void:
	for child: Node in get_children():
		var instance := child as MultiMeshInstance3D
		if instance != null:
			var file: String = instance.get_meta("file", "")
			var shadows := _tier != DetailGovernor.Tier.SLOW and file in CASTING
			instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows \
				else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


## The mesh of a model file, cached; its material takes the instance colour.
func _mesh(file: String) -> Mesh:
	if _meshes.has(file):
		return _meshes[file] as Mesh
	var mesh: Mesh = null
	var path := MODELS + file + ".glb"
	if ResourceLoader.exists(path):
		var node := (load(path) as PackedScene).instantiate() as Node3D
		var found := node.find_children("*", "MeshInstance3D", true, false)
		if not found.is_empty():
			mesh = ((found[0] as MeshInstance3D).mesh as Mesh).duplicate() as Mesh
			for surface: int in mesh.get_surface_count():
				var material := mesh.surface_get_material(surface) as BaseMaterial3D
				if material != null:
					var tinted := material.duplicate() as BaseMaterial3D
					tinted.vertex_color_use_as_albedo = true
					mesh.surface_set_material(surface, tinted)
			if _view != null:
				_view._collect_lamps(node)
		node.free()
	_meshes[file] = mesh
	return mesh
