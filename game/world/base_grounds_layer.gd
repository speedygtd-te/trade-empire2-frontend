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
## fence_mesh.gdshader. The concrete is one mesh of slabs, one per cell, a hair above the ground
## and following its relief (paving.gdshader, paving.webp from the models' concrete texture).
## Posts stand upright on the ground as drawn; the pieces between them are sheared along its slope.
## A post on water, lava or swamp stands on a small caisson (Piers; drawn by PerimeterLayer,
## `caissons`), and no concrete is laid there.

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
var _paving_material: ShaderMaterial
var _mesh_material: ShaderMaterial
var _tier := DetailGovernor.DEFAULT_TIER
var _counts: Dictionary = {}
## The caissons under the posts standing in the water, from the last rebuild.
var caissons: Array[RetainingWalls.Piece] = []


func setup(view: ColonyView) -> void:
	_view = view
	_mesh_material = ShaderMaterial.new()
	_mesh_material.shader = MESH_SHADER
	_paving_material = ShaderMaterial.new()
	_paving_material.shader = PAVING_SHADER
	_paving_material.set_shader_parameter("paving", PAVING_TEXTURE)
	_paving_material.set_shader_parameter("noise", NOISE)


## Places fence, wall and concrete of every base again around the view's origin.
func rebuild(plans: Array[BaseGrounds.Plan]) -> void:
	for child: Node in get_children():
		child.queue_free()
	_counts.clear()
	caissons = []
	if _view == null or _view.model == null:
		return
	var model := _view.model
	# "file chunk" → transforms.
	var pieces: Dictionary = {}
	var paved: Dictionary = {}
	for plan: BaseGrounds.Plan in plans:
		for index: int in plan.paved.size():
			var cell := plan.paved[index]
			if _view.cell_pier(cell.x, cell.y) != LevelRules.PierGround.NONE:
				continue
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
			# Posts stand upright on the ground as drawn (TerrainRelief).
			var at := _view.on_ground(WorldGrid.to_scene(Vector3i(post.cell.x, post.cell.y, 0), _view.origin, model.size_x))
			var pier := _view.cell_pier(post.cell.x, post.cell.y)
			if pier != LevelRules.PierGround.NONE:
				# In water, lava or swamp on a caisson.
				var surface := _view.pier_surface(pier, at.y)
				caissons.append(Piers.caisson(at, surface,
					Piers.CAISSON_WALL if plan.barrier == BaseGrounds.Barrier.WALL else Piers.CAISSON_POST, pier))
				at.y = Piers.standing_height(at.y, surface, true)
			var chunk := Vector2i(floori(float(post.cell.x) / CHUNK), floori(float(post.cell.y) / CHUNK))
			_add(pieces, gate_file if post.gate else post_file, chunk, Transform3D(Basis.IDENTITY, at))
			for bit: int in LINKS.keys():
				if post.links & bit:
					var towards: Vector2 = LINKS[bit]
					# The piece's front (+Z) looks towards the neighbour (cell y is scene −Z).
					var turn := Basis(Vector3.UP, atan2(towards.x, -towards.y))
					# Sheared along the slope (posts stay upright): it ends half way up or down to
					# the neighbour's post, where the neighbour's half piece meets it.
					var next := post.cell + Vector2i(int(towards.x), int(towards.y))
					var next_ground := _view.cell_ground(next.x, next.y)
					var next_pier := _view.cell_pier(next.x, next.y)
					var beside := Piers.standing_height(next_ground, _view.pier_surface(next_pier, next_ground),
						next_pier != LevelRules.PierGround.NONE)
					# Half the difference over half a cell.
					var rise := beside - at.y
					var shear := Basis(Vector3.RIGHT, Vector3.UP, Vector3(0.0, rise, 1.0))
					_add(pieces, half_file, chunk, Transform3D(turn * shear, at))
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
## (BaseGrounds.Plan.outward), where the slab stops at the fence's line. One mesh lying on the
## ground as drawn: each slab's corners on the relief's corners, split into triangles as the ground
## is (TerrainRelief.split), a hair above it. Per vertex CUSTOM0 = (cell x mod 64, cell y mod 64,
## window u, v), CUSTOM1 = (shade, quarter turn, sides / 255).
func _paving(paved: Dictionary, _size_x: int) -> MeshInstance3D:
	var cells: Array = paved.keys()
	var vertices := PackedVector3Array()
	var normals := PackedVector3Array()
	var uvs := PackedVector2Array()
	var slabs := PackedFloat32Array()
	var looks := PackedFloat32Array()
	var indices := PackedInt32Array()
	# Corners as ground_quad gives them (south-west, south-east, north-east, north-west) and their
	# place on the slab (UV.x east, UV.y south).
	var corner_uvs: Array[Vector2] = [Vector2(0, 1), Vector2(1, 1), Vector2(1, 0), Vector2(0, 0)]
	for cell: Vector2i in cells:
		var quad := _view.ground_quad(cell.x, cell.y, 0.0, PAVING_LIFT)
		var u := float(PropRules.key_hash(cell.x * 13 + 1, cell.y * 7 + 3, RANK_STEPS)) / RANK_STEPS
		var v := float(PropRules.key_hash(cell.x * 5 + 11, cell.y * 17 + 2, RANK_STEPS)) / RANK_STEPS
		var shade := 1.0 + SHADE_SPREAD * (2.0 * float(PropRules.key_hash(cell.x * 3 + 9, cell.y * 29 + 4, RANK_STEPS)) / RANK_STEPS - 1.0)
		var turn := float(PropRules.key_hash(cell.x * 19 + 6, cell.y * 23 + 8, 4)) / 3.0
		var sides: int = paved[cell]
		var normal := (quad[2] - quad[0]).cross(quad[1] - quad[3]).normalized()
		if normal.y < 0.0:
			normal = -normal
		var first := vertices.size()
		for index: int in 4:
			vertices.append(quad[index])
			normals.append(normal)
			uvs.append(corner_uvs[index])
			slabs.append_array(PackedFloat32Array([float(posmod(cell.x, 64)), float(posmod(cell.y, 64)), u, v]))
			looks.append_array(PackedFloat32Array([shade, turn, sides / 255.0, 0.0]))
		# The diagonal the ground takes here (corners 0 = south-west … 3 = north-west).
		if TerrainRelief.split(quad[0].y, quad[1].y, quad[3].y, quad[2].y):
			indices.append_array(PackedInt32Array([first, first + 3, first + 2, first, first + 2, first + 1]))
		else:
			indices.append_array(PackedInt32Array([first, first + 3, first + 1, first + 1, first + 3, first + 2]))
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_CUSTOM0] = slabs
	arrays[Mesh.ARRAY_CUSTOM1] = looks
	arrays[Mesh.ARRAY_INDEX] = indices
	var format := (Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT) \
		| (Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM1_SHIFT)
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], {}, format)
	mesh.surface_set_material(0, _paving_material)
	var instance := MeshInstance3D.new()
	instance.name = "Paving"
	instance.mesh = mesh
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
