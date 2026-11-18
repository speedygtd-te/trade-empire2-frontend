class_name PropLayer
extends Node3D
## The props on the surface around a colony: trees, stones, ice, columns, reeds, puddles …
## (PropRules decides which cell carries what). Stones, columns, ice and vents are low-poly models
## (game/world/models/props, scripts/3d/models/props.py); trees, plants and flat props are V1
## sprites (game/world/props): trees stand as cards on their foot and cast shadows, small plants
## are cutouts facing the fixed camera, flat props decals lying on the ground.
##
## Per loaded surface block one MultiMesh per prop variant; cells under a hull stay bare, and a
## cell above an underground hull may get a vent cover. Blocks are built a few cells per frame
## (a forest block holds thousands of trees) and dropped when the camera has moved far away.
## How many props are drawn follows the detail tier and the zoom (PropRules.visible_share): the
## instances of a MultiMesh are sorted by their rank, so drawing fewer drops a scattered share.

enum Kind { MODEL, TREE, SPRITE, DECAL }

const MODELS := "res://game/world/models/props/"
const SPRITES := "res://game/world/props/"
const SPRITE_SHADER := preload("res://game/world/prop_sprite.gdshader")
const DECAL_SHADER := preload("res://game/world/prop_decal.gdshader")
const TREE_SHADER := preload("res://game/world/prop_tree.gdshader")
## On-screen height of a sprite with the V1 height factor 1, in cells: as tall as a 3D tree of
## 0.45 cells seen under the camera's pitch (0.45 · cos 35°).
const SPRITE_SCALE := 0.3686
## Largest step of a sprite card towards the camera that keeps cards in one plane apart (cells).
const CARD_STAGGER := 0.005
## Decals lie a hair above the ground.
const DECAL_LIFT := 0.008
## Where a tree sprite's trunk meets the ground, per sprite file (share of its width from the left,
## share of its height from the top), set by eye on the V1 sprites: above it the card stands
## upright, below it (roots, ash) it lies on the ground.
const FEET := {
	"tree_0": Vector2(0.488, 0.94), "tree_1": Vector2(0.531, 0.84), "tree_2": Vector2(0.496, 0.84),
	"tree_3": Vector2(0.467, 0.83), "tree_4": Vector2(0.507, 0.88), "tree_5": Vector2(0.5, 0.77),
	"tree_6": Vector2(0.506, 0.9), "tree_7": Vector2(0.494, 0.86),
	"palm_0": Vector2(0.496, 0.98), "palm_1": Vector2(0.524, 0.905), "palm_2": Vector2(0.536, 0.985),
	"palm_3": Vector2(0.477, 0.985), "palm_4": Vector2(0.549, 0.985), "palm_5": Vector2(0.497, 0.985),
	"charred_tree_0": Vector2(0.482, 0.94), "charred_tree_1": Vector2(0.486, 0.95),
	"charred_tree_2": Vector2(0.512, 0.94), "charred_tree_3": Vector2(0.453, 0.9),
	"charred_tree_4": Vector2(0.3, 0.93),
}
## Burnt trees: three trunks at half a tree's height, two stumps at a tenth (V1
## CHARRED_TREE_VARIANT_FACTORS, Rudi's sizes).
const CHARRED_FACTORS := [0.5, 0.5, 0.5, 0.1, 0.1]
## Time per frame spent building blocks.
const BUILD_BUDGET_MS := 3

## How each family is drawn. `big`: carries the look and is thinned out last (PropRules).
## Trees and sprites: `factor` is the V1 height factor (propThemes.ts PROP_HEIGHT_FACTORS), or
## `factors` per variant; decals: `factors` per variant. `files` names other sprites to use
## (tree_leafy is five of the trees, as in V1), `feet` the family whose FEET a tree's sprites
## share. `glow`: lava and ember pixels glow.
const LOOKS := {
	"tree": {"kind": Kind.TREE, "big": true, "factor": 1.0},
	"tree_leafy": {"kind": Kind.TREE, "big": true, "factor": 1.0, "files": ["tree_1", "tree_2", "tree_3", "tree_5", "tree_7"]},
	"palm": {"kind": Kind.TREE, "big": true, "factor": 1.0},
	"charred_tree": {"kind": Kind.TREE, "big": true, "factors": CHARRED_FACTORS},
	"charred_tree_ember": {"kind": Kind.TREE, "big": true, "factors": CHARRED_FACTORS, "feet": "charred_tree", "glow": true},
	"basalt_column": {"kind": Kind.MODEL, "big": true},
	"ice_block": {"kind": Kind.MODEL, "big": true},
	"sulfur_vent": {"kind": Kind.MODEL, "big": true},
	"vent_grate": {"kind": Kind.MODEL, "big": true},
	"vent_pipe": {"kind": Kind.MODEL, "big": true},
	"vent_stack": {"kind": Kind.MODEL, "big": true},
	"vent_fan": {"kind": Kind.MODEL, "big": true},
	"rock": {"kind": Kind.MODEL, "big": false},
	"rock_arid": {"kind": Kind.MODEL, "big": false},
	"rock_sand": {"kind": Kind.MODEL, "big": false},
	"rock_snow": {"kind": Kind.MODEL, "big": false},
	"rock_ash": {"kind": Kind.MODEL, "big": false},
	"sulfur_chunk": {"kind": Kind.MODEL, "big": false},
	"lava_rock": {"kind": Kind.MODEL, "big": false},
	"swamp": {"kind": Kind.SPRITE, "big": true, "factor": 1.0},
	"grass": {"kind": Kind.SPRITE, "big": false, "factor": 0.45},
	"bush": {"kind": Kind.SPRITE, "big": false, "factor": 0.75},
	"driftwood": {"kind": Kind.SPRITE, "big": false, "factor": 0.25},
	"ice_rubble": {"kind": Kind.SPRITE, "big": false, "factor": 0.2},
	"lava_crust": {"kind": Kind.SPRITE, "big": false, "factor": 0.35, "glow": true},
	"crater_decal": {"kind": Kind.DECAL, "big": true, "factors": [0.386, 0.471, 0.557, 0.617]},
	"lava_puddle": {"kind": Kind.DECAL, "big": true, "factors": [0.46, 0.46, 0.46], "glow": true},
	"ice_floe": {"kind": Kind.DECAL, "big": true, "factors": [0.48, 0.48, 0.44, 0.55, 0.3]},
}


## The props of one variant collected for a block.
class Group:
	extends RefCounted
	var family: String = ""
	var variant: int = 0
	var ranks: PackedFloat32Array = []
	var transforms: Array[Transform3D] = []
	var shades: PackedFloat32Array = []


## A block being built, a few cells per frame.
class Job:
	extends RefCounted
	var block := Vector2i.ZERO
	var next := 0
	var groups: Dictionary = {}


var _view: ColonyView
## Built blocks: block → Node3D holding its MultiMeshInstance3Ds.
var _blocks: Dictionary = {}
var _queue: Array[Vector2i] = []
var _job: Job = null
## Cells (x wrapped, y) under a hull on the surface, and those above an underground hull only.
var _covered: Dictionary = {}
var _vented: Dictionary = {}
## "family_variant" → Mesh, or null when the model or sprite is missing.
var _meshes: Dictionary = {}
var _tier := DetailGovernor.DEFAULT_TIER
var _zoom := -1.0
var _centre := Vector2i(0x7FFFFFFF, 0)
var _billboard := Basis.IDENTITY
var _upright := Basis.IDENTITY
var _decal_turn := Basis.IDENTITY
## Time spent building blocks so far (for measuring).
var _build_usec := 0


func setup(view: ColonyView) -> void:
	_view = view
	var pitch := deg_to_rad(ColonyView.CAMERA_PITCH_DEGREES)
	var yaw := deg_to_rad(ColonyView.CAMERA_YAW_DEGREES)
	var to_camera := Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch))
	# +Z of an upright sprite faces the camera; a decal's top edge points away from it.
	_billboard = Basis.looking_at(-to_camera, Vector3.UP)
	# A tree card stands upright, +Z towards the camera's side.
	_upright = Basis(Vector3.UP, yaw)
	_decal_turn = Basis(Vector3.UP, yaw)
	var model := view.model
	model.surface_loaded.connect(_on_surface_loaded)
	model.layout_changed.connect(_on_structures_changed)
	model.guests_changed.connect(_on_structures_changed)
	_read_structures()


## Drops every block and builds the ones around the camera again (the origin moved).
func rebuild() -> void:
	if _view == null:
		return
	for node: Node3D in _blocks.values():
		node.queue_free()
	_blocks.clear()
	_queue.clear()
	_job = null
	_centre = Vector2i(0x7FFFFFFF, 0)
	_refresh()


## Applies a detail tier: how many props, how far (PropRules).
func apply_detail(tier: DetailGovernor.Tier) -> void:
	_tier = tier
	_apply_share()
	_apply_reach()


## Instances built, instances drawn now, MultiMeshes drawn now, blocks, blocks waiting and the
## time spent building so far in ms (for measuring).
func stats() -> Dictionary:
	var built := 0
	var drawn := 0
	var meshes := 0
	for node: Node3D in _blocks.values():
		for child: Node in node.get_children():
			var instance := child as MultiMeshInstance3D
			built += instance.multimesh.instance_count
			if node.visible and instance.visible:
				drawn += instance.multimesh.visible_instance_count
				meshes += 1
	return {"built": built, "drawn": drawn, "multimeshes": meshes, "blocks": _blocks.size(),
		"pending": _queue.size() + (1 if _job != null else 0), "build_ms": roundi(_build_usec / 1000.0)}


## True while blocks wait to be built.
func busy() -> bool:
	return _job != null or not _queue.is_empty()


func _process(_delta: float) -> void:
	if _view == null or _view.model == null:
		return
	if not is_equal_approx(_zoom, _view.zoom):
		_zoom = _view.zoom
		_apply_share()
	_refresh()
	if _job == null and _queue.is_empty():
		return
	var start := Time.get_ticks_usec()
	var deadline := Time.get_ticks_msec() + BUILD_BUDGET_MS
	while Time.get_ticks_msec() < deadline and (_job != null or not _queue.is_empty()):
		if _job == null:
			_job = Job.new()
			_job.block = _queue.pop_front()
		if _work(_job, deadline):
			_finish(_job)
			_job = null
	_build_usec += Time.get_ticks_usec() - start


## Follows the camera: drops blocks that are far away, queues loaded blocks nearby.
func _refresh() -> void:
	var model := _view.model
	var cell := _view.focus_cell()
	var centre := model.surface.block_of(cell.x, cell.y)
	if centre == _centre:
		return
	_centre = centre
	var keep := ColonyModel.SURFACE_RADIUS + 1
	for block: Vector2i in _blocks.keys():
		if _block_distance(block) > keep:
			(_blocks[block] as Node3D).queue_free()
			_blocks.erase(block)
	_queue.assign(_queue.filter(func(block: Vector2i) -> bool: return _block_distance(block) <= keep))
	_queue_loaded()
	_apply_reach()


func _on_surface_loaded(_request: SurfaceBlocks.Request, _patch: SurfacePatch) -> void:
	if _view != null:
		_queue_loaded()


## Queues the loaded blocks near the camera that have no props yet, nearest first.
func _queue_loaded() -> void:
	var model := _view.model
	var keep := ColonyModel.SURFACE_RADIUS + 1
	var wanted: Array[Vector2i] = []
	for dy: int in range(-keep, keep + 1):
		for dx: int in range(-keep, keep + 1):
			var block := model.surface.block_of((_centre.x + dx) * SurfaceBlocks.BLOCK, (_centre.y + dy) * SurfaceBlocks.BLOCK)
			if model.surface.is_loaded(block) and not _blocks.has(block) and block not in _queue \
					and (_job == null or _job.block != block):
				wanted.append(block)
	wanted.sort_custom(func(a: Vector2i, b: Vector2i) -> bool: return _block_distance(a) < _block_distance(b))
	_queue.append_array(wanted)


## Lays out the cells of a job's block until the deadline; true when the block is done.
func _work(job: Job, deadline: int) -> bool:
	var model := _view.model
	var x0 := job.block.x * SurfaceBlocks.BLOCK
	var y0 := job.block.y * SurfaceBlocks.BLOCK
	var cells := SurfaceBlocks.BLOCK * SurfaceBlocks.BLOCK
	while job.next < cells:
		var x := x0 + job.next % SurfaceBlocks.BLOCK
		@warning_ignore("integer_division")
		var y := y0 + job.next / SurfaceBlocks.BLOCK
		job.next += 1
		var key := Vector2i(x, y)
		if _covered.has(key):
			continue
		var centre := WorldGrid.to_scene(Vector3i(x, y, 0), _view.origin, model.size_x)
		if _vented.has(key):
			var vent := PropRules.vent(x, y)
			if vent != null:
				_place(job, vent, centre)
		var cell := model.surface.cell(x, y)
		if cell != null:
			for prop: PropRules.Prop in PropRules.layout(x, y, cell.biome, cell.vegetation):
				_place(job, prop, centre)
		if job.next % 16 == 0 and Time.get_ticks_msec() >= deadline:
			break
	return job.next >= cells


func _place(job: Job, prop: PropRules.Prop, centre: Vector3) -> void:
	var look: Dictionary = LOOKS.get(prop.family, {})
	if look.is_empty():
		return
	var at := centre + Vector3(prop.offset.x, 0.0, -prop.offset.y)
	var basis: Basis
	match look["kind"]:
		Kind.MODEL:
			basis = Basis(Vector3.UP, prop.turn).scaled(Vector3.ONE * prop.scale)
		Kind.TREE, Kind.SPRITE:
			# Half of the sprites are mirrored, for variety.
			var flip := -1.0 if prop.turn >= PI else 1.0
			var facing := _upright if look["kind"] == Kind.TREE else _billboard
			basis = facing * Basis.from_scale(Vector3(flip * prop.scale, prop.scale, prop.scale))
			# Cards of props side by side (as seen from the camera) lie in one plane and would
			# flicker where they overlap: each moves a hair towards the camera, by its rank.
			at += facing.z * CARD_STAGGER * prop.rank
		_:
			basis = _decal_turn * Basis.from_scale(Vector3(prop.scale, 1.0, prop.scale))
			at.y = DECAL_LIFT
	var key := "%s_%d" % [prop.family, prop.variant]
	var group: Group = job.groups.get(key)
	if group == null:
		group = Group.new()
		group.family = prop.family
		group.variant = prop.variant
		job.groups[key] = group
	group.ranks.append(prop.rank)
	group.transforms.append(Transform3D(basis, at))
	# A little brightness spread, so sprites of one variant do not look stamped.
	group.shades.append(0.88 + 0.14 * fposmod(prop.turn * 2.3, 1.0))


## Turns a finished job into MultiMeshes under a node of its own.
func _finish(job: Job) -> void:
	var holder := Node3D.new()
	holder.name = "Block_%d_%d" % [job.block.x, job.block.y]
	for key: String in job.groups.keys():
		var group: Group = job.groups[key]
		var mesh := _mesh(group.family, group.variant)
		if mesh == null:
			continue
		var look: Dictionary = LOOKS[group.family]
		var kind: Kind = look["kind"]
		var order: Array[int] = []
		order.assign(range(group.ranks.size()))
		var ranks := group.ranks
		order.sort_custom(func(a: int, b: int) -> bool: return ranks[a] < ranks[b])
		var multimesh := MultiMesh.new()
		multimesh.transform_format = MultiMesh.TRANSFORM_3D
		multimesh.use_colors = kind != Kind.MODEL
		multimesh.mesh = mesh
		multimesh.instance_count = order.size()
		for index: int in order.size():
			var source := order[index]
			multimesh.set_instance_transform(index, group.transforms[source])
			if multimesh.use_colors:
				var shade := group.shades[source]
				multimesh.set_instance_color(index, Color(shade, shade, shade, 1.0))
		var instance := MultiMeshInstance3D.new()
		instance.multimesh = multimesh
		instance.set_meta("big", look["big"])
		# Only big models and trees cast shadows; small sprites are flat, stones too small.
		instance.set_meta("casts", (kind == Kind.MODEL or kind == Kind.TREE) and look["big"])
		_share(instance)
		holder.add_child(instance)
	add_child(holder)
	_blocks[job.block] = holder
	holder.visible = _block_distance(job.block) <= PropRules.reach(_tier)


func _apply_share() -> void:
	for node: Node3D in _blocks.values():
		for child: Node in node.get_children():
			_share(child as MultiMeshInstance3D)


func _share(instance: MultiMeshInstance3D) -> void:
	var big: bool = instance.get_meta("big", false)
	var share := PropRules.visible_share(_tier, _view.zoom, big)
	var count := instance.multimesh.instance_count
	instance.multimesh.visible_instance_count = mini(count, ceili(count * share))
	instance.visible = instance.multimesh.visible_instance_count > 0
	var casts: bool = instance.get_meta("casts", false) and PropRules.casts_shadows(_tier, _view.zoom)
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if casts \
		else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func _apply_reach() -> void:
	var reach := PropRules.reach(_tier)
	for block: Vector2i in _blocks.keys():
		(_blocks[block] as Node3D).visible = _block_distance(block) <= reach


## Blocks between a block and the one under the camera (the larger of the two axes; x wraps).
func _block_distance(block: Vector2i) -> int:
	@warning_ignore("integer_division")
	var across := WorldGrid.wrapped_delta(_centre.x, block.x, _view.model.size_x / SurfaceBlocks.BLOCK)
	return maxi(absi(across), absi(block.y - _centre.y))


## Which cells hulls or the decoration around a base cover (no props there) and which lie above an
## underground hull only (a vent cover may stand there): the home structure and its guests.
func _read_structures() -> void:
	var model := _view.model
	_covered.clear()
	_vented.clear()
	var below: Array[Vector2i] = []
	var structures: Array[ColonyModel] = [model]
	structures.append_array(model.guest_list())
	for structure: ColonyModel in structures:
		for local: Vector3i in structure.layout.hull_cells():
			var cell := structure.layout.to_absolute(local)
			var key := Vector2i(WorldGrid.wrap_x(cell.x, model.size_x), cell.y)
			if cell.z >= 0:
				_covered[key] = true
			elif cell.z == -1:
				below.append(key)
	# Cells carrying a mast, radar or beacon around a base stay bare too (PerimeterLayer).
	for spot: Perimeter.Spot in PerimeterLayer.spots_for(model):
		_covered[spot.cell] = true
	for key: Vector2i in below:
		if not _covered.has(key):
			_vented[key] = true


## Hulls changed: rebuild the blocks whose bare or vented cells changed.
func _on_structures_changed() -> void:
	if _view == null:
		return
	var covered_before := _covered.duplicate()
	var vented_before := _vented.duplicate()
	_read_structures()
	var touched: Dictionary = {}
	for key: Vector2i in covered_before.keys() + vented_before.keys() + _covered.keys() + _vented.keys():
		if covered_before.has(key) != _covered.has(key) or vented_before.has(key) != _vented.has(key):
			touched[_view.model.surface.block_of(key.x, key.y)] = true
	for block: Vector2i in touched.keys():
		if _blocks.has(block):
			(_blocks[block] as Node3D).queue_free()
			_blocks.erase(block)
		if _job != null and _job.block == block:
			_job = null
	if not touched.is_empty():
		_queue_loaded()


## The mesh of a prop variant: a model's mesh, or a quad carrying a sprite; cached.
func _mesh(family: String, variant: int) -> Mesh:
	var key := "%s_%d" % [family, variant]
	if _meshes.has(key):
		return _meshes[key] as Mesh
	var look: Dictionary = LOOKS[family]
	var glow: bool = look.get("glow", false)
	var mesh: Mesh = null
	match look["kind"]:
		Kind.MODEL:
			mesh = _model_mesh(key)
		Kind.TREE:
			var files: Array = look.get("files", [])
			var file: String = files[variant] if variant < files.size() else key
			var feet: String = file if not look.has("feet") else "%s_%d" % [look["feet"], variant]
			var foot: Vector2 = FEET.get(feet, Vector2(0.5, 1.0))
			mesh = _tree_mesh(file, _factor(look, variant) * SPRITE_SCALE, foot, glow)
		Kind.SPRITE:
			mesh = _sprite_mesh(key, _factor(look, variant) * SPRITE_SCALE, glow, false)
		Kind.DECAL:
			mesh = _sprite_mesh(key, _factor(look, variant) * SPRITE_SCALE, glow, true)
	_meshes[key] = mesh
	return mesh


## The V1 height factor of a sprite variant: per variant (`factors`) or per family (`factor`).
func _factor(look: Dictionary, variant: int) -> float:
	if look.has("factors"):
		var factors: Array = look["factors"]
		return factors[mini(variant, factors.size() - 1)]
	return look["factor"]


func _model_mesh(file: String) -> Mesh:
	var path := MODELS + file + ".glb"
	if not ResourceLoader.exists(path):
		return null
	var node := (load(path) as PackedScene).instantiate() as Node3D
	var mesh: Mesh = null
	var found := node.find_children("*", "MeshInstance3D", true, false)
	if not found.is_empty():
		mesh = (found[0] as MeshInstance3D).mesh
		# Glowing parts (embers, vent mouths) follow the colony's lamps: bright at night.
		_view._collect_lamps(node)
	node.free()
	return mesh


## A quad carrying a sprite. Upright: `height` is its height, standing on its lower edge, facing
## +Z. Flat (a decal): it lies on the ground, `height` sizes it like V1 did (width = height ·
## aspect), and its depth undoes V1's 2:1 projection of the ground, so a round crater stays round.
func _sprite_mesh(key: String, height: float, glow: bool, flat: bool) -> Mesh:
	var path := SPRITES + key + ".webp"
	if not ResourceLoader.exists(path):
		return null
	var texture := load(path) as Texture2D
	var aspect := float(texture.get_width()) / maxf(texture.get_height(), 1.0)
	var width := height * aspect
	var corners: PackedVector3Array
	if flat:
		var depth := height * 2.0
		corners = [Vector3(-width / 2.0, 0.0, -depth / 2.0), Vector3(width / 2.0, 0.0, -depth / 2.0),
			Vector3(width / 2.0, 0.0, depth / 2.0), Vector3(-width / 2.0, 0.0, depth / 2.0)]
	else:
		corners = [Vector3(-width / 2.0, height, 0.0), Vector3(width / 2.0, height, 0.0),
			Vector3(width / 2.0, 0.0, 0.0), Vector3(-width / 2.0, 0.0, 0.0)]
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = corners
	arrays[Mesh.ARRAY_NORMAL] = PackedVector3Array([Vector3.UP, Vector3.UP, Vector3.UP, Vector3.UP])
	arrays[Mesh.ARRAY_TEX_UV] = PackedVector2Array([Vector2(0, 0), Vector2(1, 0), Vector2(1, 1), Vector2(0, 1)])
	arrays[Mesh.ARRAY_COLOR] = PackedColorArray([Color.WHITE, Color.WHITE, Color.WHITE, Color.WHITE])
	arrays[Mesh.ARRAY_INDEX] = PackedInt32Array([0, 1, 2, 0, 2, 3])
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var material := ShaderMaterial.new()
	material.shader = DECAL_SHADER if flat else SPRITE_SHADER
	material.set_shader_parameter("sprite", texture)
	material.set_shader_parameter("glow", 1.0 if glow else 0.0)
	mesh.surface_set_material(0, material)
	return mesh


## A tree card carrying a sprite (prop_tree.gdshader). `height` is the sprite's height on screen;
## `foot` is where its trunk meets the ground (FEET). Above the foot the card stands upright, made
## taller by the camera's pitch so the sprite keeps its drawn proportions; below it the card lies
## on the ground towards the camera, made deeper by the same rule. Facing +Z.
func _tree_mesh(file: String, height: float, foot: Vector2, glow: bool) -> Mesh:
	var path := SPRITES + file + ".webp"
	if not ResourceLoader.exists(path):
		return null
	var texture := load(path) as Texture2D
	var width := height * float(texture.get_width()) / maxf(texture.get_height(), 1.0)
	var pitch := deg_to_rad(ColonyView.CAMERA_PITCH_DEGREES)
	var top := foot.y * height / cos(pitch)
	var front := (1.0 - foot.y) * height / sin(pitch)
	var left := -foot.x * width
	var right := (1.0 - foot.x) * width
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = PackedVector3Array([Vector3(left, top, 0.0), Vector3(right, top, 0.0),
		Vector3(left, 0.0, 0.0), Vector3(right, 0.0, 0.0), Vector3(left, 0.0, front), Vector3(right, 0.0, front)])
	arrays[Mesh.ARRAY_NORMAL] = PackedVector3Array([Vector3.BACK, Vector3.BACK, Vector3.BACK, Vector3.BACK,
		Vector3.UP, Vector3.UP])
	arrays[Mesh.ARRAY_TEX_UV] = PackedVector2Array([Vector2(0, 0), Vector2(1, 0), Vector2(0, foot.y),
		Vector2(1, foot.y), Vector2(0, 1), Vector2(1, 1)])
	var white := Color.WHITE
	arrays[Mesh.ARRAY_COLOR] = PackedColorArray([white, white, white, white, white, white])
	arrays[Mesh.ARRAY_INDEX] = PackedInt32Array([0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4])
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var material := ShaderMaterial.new()
	material.shader = TREE_SHADER
	material.set_shader_parameter("sprite", texture)
	material.set_shader_parameter("glow", 1.0 if glow else 0.0)
	material.set_shader_parameter("height", top)
	material.set_shader_parameter("half_width", maxf(-left, right))
	mesh.surface_set_material(0, material)
	return mesh
