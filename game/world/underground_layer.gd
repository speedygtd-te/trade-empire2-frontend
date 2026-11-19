class_name UndergroundLayer
extends Node3D
## The cutaway view of an underground level: while the player works below the ground, the
## surface, its plants and every level above are gone (ColonyView), and this layer shows what
## lies at the active level instead — the underground biome map of that level (rock layers,
## mineral veins, caves …; surface query with `z`) as the floor, drawn like the ground
## (GroundLayer and its atlas), and a thin cyan outline of the open structure's footprint on the
## surface, so the player keeps their bearings. Lives under the ColonyView and follows its origin.

## Outline: colour, width of its bars, and its height above the floor.
const OUTLINE_COLOR := Color(0.133, 0.827, 0.933, 0.9)
const OUTLINE_WIDTH := 0.05
const OUTLINE_LIFT := 0.08
## The rock floor lies this much below the level, under the floor plates of the hulls on it.
const FLOOR_DROP := 0.004

var _view: ColonyView
var _ground: GroundLayer
var _outline: MultiMeshInstance3D
## The level shown (absolute z < 0); 0 while hidden.
var _level := 0


func setup(view: ColonyView) -> void:
	_view = view
	_view.model.level_surface_loaded.connect(_on_level_loaded)
	_view.model.layout_changed.connect(_draw_outline)


func _ready() -> void:
	_ground = GroundLayer.new()
	_ground.name = "Rock"
	add_child(_ground)
	_outline = MultiMeshInstance3D.new()
	_outline.name = "Outline"
	_outline.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_outline)
	visible = false


## Shows the underground level `z` (< 0) or hides the layer (z ≥ 0).
func show_level(z: int) -> void:
	var was := _level
	_level = z if z < 0 else 0
	visible = _level < 0
	if not visible:
		return
	if was != _level:
		redraw()
	else:
		_draw_outline()


## The level shown; 0 while hidden.
func level() -> int:
	return _level


## Draws every loaded block of the level near the camera again (the origin or the level changed)
## and asks for the missing ones.
func redraw() -> void:
	if _view == null or _view.model == null or _ground == null:
		return
	_ground.clear()
	if _level >= 0:
		return
	position = Vector3(0.0, float(_level - _view.origin.z) - FLOOR_DROP, 0.0)
	var model := _view.model
	var blocks := model.level_surface(_level)
	var cell := _view.focus_cell()
	var centre := blocks.block_of(cell.x, cell.y)
	var reach := ColonyModel.SURFACE_RADIUS + 1
	for by: int in range(centre.y - reach, centre.y + reach + 1):
		for bx: int in range(centre.x - reach, centre.x + reach + 1):
			if blocks.is_loaded(blocks.block_of(bx * SurfaceBlocks.BLOCK, by * SurfaceBlocks.BLOCK)):
				_ground.add_block(blocks, bx * SurfaceBlocks.BLOCK, by * SurfaceBlocks.BLOCK, _view.origin, model.size_x)
	model.ensure_level_surface(cell, _level)
	_draw_outline()


## Tint over the rock floor (lamp light is warm and dim; GroundLayer.set_tint).
func set_tint(color: Color) -> void:
	_ground.set_tint(color)


func set_soft(on: bool) -> void:
	_ground.set_soft(on)


func block_count() -> int:
	return _ground.block_count()


## Number of bars of the footprint outline.
func outline_bars() -> int:
	return _outline.multimesh.instance_count if _outline.multimesh != null else 0


func _on_level_loaded(z: int, request: SurfaceBlocks.Request) -> void:
	if z != _level or _level >= 0:
		return
	var blocks := _view.model.level_surface(z)
	for block: Vector2i in request.blocks:
		_ground.add_block(blocks, block.x * SurfaceBlocks.BLOCK, block.y * SurfaceBlocks.BLOCK, _view.origin, _view.model.size_x)


## The edges of the open structure's footprint on the surface (its columns with a hull at level 0
## or above, its guests included), as thin bars on the floor of this level.
func _draw_outline() -> void:
	if _outline == null or _view == null or _view.model == null or _level >= 0:
		return
	var footprint: Dictionary = {}
	var structures: Array[ColonyModel] = [_view.model]
	structures.append_array(_view.model.guest_list())
	for structure: ColonyModel in structures:
		for local: Vector3i in structure.layout.hull_cells():
			var cell := structure.layout.to_absolute(local)
			if cell.z >= 0:
				footprint[Vector2i(cell.x, cell.y)] = true
	var transforms: Array[Transform3D] = []
	var across := Basis(Vector3.UP, PI / 2.0)
	for key: Vector2i in footprint.keys():
		var centre := WorldGrid.to_scene(Vector3i(key.x, key.y, _view.origin.z), _view.origin, _view.model.size_x)
		centre.y = OUTLINE_LIFT + FLOOR_DROP
		# Cell y grows towards scene −Z.
		if not footprint.has(key + Vector2i(0, 1)):
			transforms.append(Transform3D(Basis.IDENTITY, centre + Vector3(0.0, 0.0, -0.5)))
		if not footprint.has(key + Vector2i(0, -1)):
			transforms.append(Transform3D(Basis.IDENTITY, centre + Vector3(0.0, 0.0, 0.5)))
		if not footprint.has(key + Vector2i(1, 0)):
			transforms.append(Transform3D(across, centre + Vector3(0.5, 0.0, 0.0)))
		if not footprint.has(key + Vector2i(-1, 0)):
			transforms.append(Transform3D(across, centre + Vector3(-0.5, 0.0, 0.0)))
	var multimesh := MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.mesh = _bar()
	multimesh.instance_count = transforms.size()
	for index: int in transforms.size():
		multimesh.set_instance_transform(index, transforms[index])
	_outline.multimesh = multimesh


## One edge of a cell: a thin bar along scene X, unlit, over everything on the floor.
static func _bar() -> Mesh:
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.albedo_color = OUTLINE_COLOR
	var box := BoxMesh.new()
	box.size = Vector3(1.0 + OUTLINE_WIDTH, 0.01, OUTLINE_WIDTH)
	box.material = material
	return box
