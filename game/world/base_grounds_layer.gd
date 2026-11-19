class_name BaseGroundsLayer
extends Node3D
## The land around large bases (BaseGrounds decides what goes where): the fence or the wall and
## the concrete out to it. Lives under PerimeterLayer and is rebuilt with it; the cleared ring
## is PropLayer's business (no props there). Purely cosmetic; the server knows nothing about it.
##
## Fence and wall are low-poly models (game/world/models/grounds, scripts/3d/models/grounds.py):
## a post in every cell of the line (a gate post where it ends at a gap) and a half piece from the
## post towards every neighbour it runs on to. One MultiMesh per model and CHUNK × CHUNK cells, so
## the parts off screen are culled. The chain link is a see-through face drawn by
## fence_mesh.gdshader. The concrete is one MultiMesh of flat slabs, one per cell, a hair above the
## ground (paving.gdshader, paving.webp from the models' concrete texture).

const MODELS := "res://game/world/models/grounds/"
const PAVING_SHADER := preload("res://game/world/grounds/paving.gdshader")
const PAVING_TEXTURE := preload("res://game/world/grounds/paving.webp")
const NOISE := preload("res://game/world/ground/ground_noise.png")
const MESH_SHADER := preload("res://game/world/grounds/fence_mesh.gdshader")
## Model files per barrier: the post, the gate post, the half piece.
const FILES := {
	BaseGrounds.Barrier.FENCE: ["fence_post", "fence_gate", "fence_half"],
	BaseGrounds.Barrier.WALL: ["wall_post", "wall_gate", "wall_half"],
}
## Cells per side of one MultiMesh of fence or wall pieces.
const CHUNK := 32
## The slabs lie this far above the ground (under the decals of props and the light pools).
const PAVING_LIFT := 0.004
## Brightness of a slab: 1 ± this, by cell.
const SHADE_SPREAD := 0.07
const RANK_STEPS := 4096
## Direction (cell x, cell y) of each link bit.
const LINKS := {
	BaseGrounds.NORTH: Vector2(0, 1), BaseGrounds.EAST: Vector2(1, 0),
	BaseGrounds.SOUTH: Vector2(0, -1), BaseGrounds.WEST: Vector2(-1, 0),
}

var _view: ColonyView
## File → Mesh (null when missing).
var _meshes: Dictionary = {}
var _paving_mesh: PlaneMesh
var _mesh_material: ShaderMaterial
var _tier := DetailGovernor.DEFAULT_TIER
var _counts: Dictionary = {}


func setup(view: ColonyView) -> void:
	_view = view
	_mesh_material = ShaderMaterial.new()
	_mesh_material.shader = MESH_SHADER
	var paving := ShaderMaterial.new()
	paving.shader = PAVING_SHADER
	paving.set_shader_parameter("paving", PAVING_TEXTURE)
	paving.set_shader_parameter("noise", NOISE)
	_paving_mesh = PlaneMesh.new()
	_paving_mesh.size = Vector2.ONE
	_paving_mesh.material = paving


## Places fence, wall and concrete of every base again around the view's origin.
func rebuild(plans: Array[BaseGrounds.Plan]) -> void:
	for child: Node in get_children():
		child.queue_free()
	_counts.clear()
	if _view == null or _view.model == null:
		return
	var model := _view.model
	# "file chunk" → transforms.
	var pieces: Dictionary = {}
	var paved: Dictionary = {}
	for plan: BaseGrounds.Plan in plans:
		for index: int in plan.paved.size():
			var cell := plan.paved[index]
			# Where two bases pave the same cell, the concrete runs on unless both stop there.
			var sides: int = paved.get(cell, 0xFF)
			paved[cell] = sides & plan.outward[index]
		if plan.barrier == BaseGrounds.Barrier.NONE:
			continue
		var files: Array = FILES[plan.barrier]
		var post_file: String = files[0]
		var gate_file: String = files[1]
		var half_file: String = files[2]
		for post: BaseGrounds.Post in plan.posts:
			var at := WorldGrid.to_scene(Vector3i(post.cell.x, post.cell.y, 0), _view.origin, model.size_x)
			var chunk := Vector2i(floori(float(post.cell.x) / CHUNK), floori(float(post.cell.y) / CHUNK))
			_add(pieces, gate_file if post.gate else post_file, chunk, Transform3D(Basis.IDENTITY, at))
			for bit: int in LINKS.keys():
				if post.links & bit:
					var towards: Vector2 = LINKS[bit]
					# The piece's front (+Z) looks towards the neighbour (cell y is scene −Z).
					var turn := Basis(Vector3.UP, atan2(towards.x, -towards.y))
					_add(pieces, half_file, chunk, Transform3D(turn, at))
	for key: String in pieces.keys():
		var file := key.get_slice(" ", 0)
		var list: Array = pieces[key]
		var instance := _multimesh(_mesh(file), list)
		if instance == null:
			continue
		instance.name = key.replace(" ", "_")
		add_child(instance)
		var before: int = _counts.get(file, 0)
		_counts[file] = before + list.size()
	if not paved.is_empty():
		add_child(_paving(paved, model.size_x))
		_counts["paving"] = paved.size()
	_apply()


func apply_detail(tier: DetailGovernor.Tier) -> void:
	_tier = tier
	_apply()


## Pieces per model, slabs, and the MultiMeshes drawn now (for measuring).
func stats() -> Dictionary:
	var result := _counts.duplicate()
	var drawn := 0
	for child: Node in get_children():
		if child is MultiMeshInstance3D and (child as MultiMeshInstance3D).visible:
			drawn += 1
	result["multimeshes"] = drawn
	return result


func _add(pieces: Dictionary, file: String, chunk: Vector2i, placed: Transform3D) -> void:
	var key := "%s %d,%d" % [file, chunk.x, chunk.y]
	if not pieces.has(key):
		pieces[key] = []
	var list: Array = pieces[key]
	list.append(placed)


## The concrete: one slab per cell, each showing its own window of the texture, turned by a
## quarter now and then, a little brighter or darker. paved: cell → the sides facing the open land
## (BaseGrounds.Plan.outward), where the slab stops at the fence's line.
func _paving(paved: Dictionary, size_x: int) -> MultiMeshInstance3D:
	var cells: Array = paved.keys()
	var multimesh := MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.use_colors = true
	multimesh.use_custom_data = true
	multimesh.mesh = _paving_mesh
	multimesh.instance_count = cells.size()
	for index: int in cells.size():
		var cell: Vector2i = cells[index]
		var at := WorldGrid.to_scene(Vector3i(cell.x, cell.y, 0), _view.origin, size_x)
		multimesh.set_instance_transform(index, Transform3D(Basis.IDENTITY, at + Vector3(0.0, PAVING_LIFT, 0.0)))
		var u := float(PropRules.key_hash(cell.x * 13 + 1, cell.y * 7 + 3, RANK_STEPS)) / RANK_STEPS
		var v := float(PropRules.key_hash(cell.x * 5 + 11, cell.y * 17 + 2, RANK_STEPS)) / RANK_STEPS
		var shade := 1.0 + SHADE_SPREAD * (2.0 * float(PropRules.key_hash(cell.x * 3 + 9, cell.y * 29 + 4, RANK_STEPS)) / RANK_STEPS - 1.0)
		var turn := float(PropRules.key_hash(cell.x * 19 + 6, cell.y * 23 + 8, 4)) / 3.0
		multimesh.set_instance_custom_data(index, Color(float(posmod(cell.x, 64)), float(posmod(cell.y, 64)), u, v))
		var sides: int = paved[cell]
		multimesh.set_instance_color(index, Color(shade, turn, sides / 255.0, 1.0))
	var instance := MultiMeshInstance3D.new()
	instance.name = "Paving"
	instance.multimesh = multimesh
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	instance.set_meta("flat", true)
	return instance


func _apply() -> void:
	var shadows := _tier != DetailGovernor.Tier.SLOW
	for child: Node in get_children():
		var instance := child as MultiMeshInstance3D
		if instance == null or instance.get_meta("flat", false):
			continue
		instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows \
			else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func _multimesh(mesh: Mesh, transforms: Array) -> MultiMeshInstance3D:
	if mesh == null or transforms.is_empty():
		return null
	var multimesh := MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.mesh = mesh
	multimesh.instance_count = transforms.size()
	for index: int in transforms.size():
		var placed: Transform3D = transforms[index]
		multimesh.set_instance_transform(index, placed)
	var instance := MultiMeshInstance3D.new()
	instance.multimesh = multimesh
	return instance


## The mesh of a model file, cached. Red lights glow with the colony's lamps; the see-through
## face (the chain link) gets the wire pattern.
func _mesh(file: String) -> Mesh:
	if _meshes.has(file):
		return _meshes[file] as Mesh
	var mesh: Mesh = null
	var path := MODELS + file + ".glb"
	if ResourceLoader.exists(path):
		var node := (load(path) as PackedScene).instantiate() as Node3D
		var found := node.find_children("*", "MeshInstance3D", true, false)
		if not found.is_empty():
			mesh = (found[0] as MeshInstance3D).mesh
			for surface: int in mesh.get_surface_count():
				var material := mesh.surface_get_material(surface) as BaseMaterial3D
				if material != null and material.transparency != BaseMaterial3D.TRANSPARENCY_DISABLED:
					mesh.surface_set_material(surface, _mesh_material)
			_view._collect_lamps(node)
		node.free()
	_meshes[file] = mesh
	return mesh
