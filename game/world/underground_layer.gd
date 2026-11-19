class_name UndergroundLayer
extends Node3D
## Bearings while working on one level of the open structure. Below the ground it is the cutaway
## view: the surface, its plants and every level above are gone (ColonyView), and this layer
## shows the underground biome map of the active level (rock layers, mineral veins, caves …;
## surface query with `z`) as the floor, drawn like the ground (GroundLayer and its atlas). On
## every level, the ground level included, it draws thin cyan outlines of the neighbouring levels'
## hulls (the level below and the level above) on the active level's floor, and fine dashed lines
## where the hull type of the level below changes — so the player sees what they build on top of
## (LevelOutline). Lives under the ColonyView and follows its origin.

## Outlines: colour (fine, partly see-through), width of their bars, height above the floor.
const OUTLINE_COLOR := Color(0.133, 0.827, 0.933, 0.6)
const OUTLINE_WIDTH := 0.03
const OUTLINE_LIFT := 0.08
## Hull type borders of the level below: shorter, thinner dashes.
const DASH_WIDTH := 0.02
const DASH_LENGTH := 0.16
const DASH_OFFSETS: Array[float] = [-0.33, 0.0, 0.33]
## The rock floor lies this much below the level, under the floor plates of the hulls on it.
const FLOOR_DROP := 0.004

var _view: ColonyView
var _ground: GroundLayer
var _outline: MultiMeshInstance3D
var _dashes: MultiMeshInstance3D
## The active level (absolute z) and whether the layer is shown at all.
var _level := 0
var _shown := false


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
	_dashes = MultiMeshInstance3D.new()
	_dashes.name = "HullTypeBorders"
	_dashes.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_dashes)
	visible = false


## Shows the bearings of level `z` (`shown`: the open structure's levels are cut): the outlines on
## any level, and below the ground (z < 0) also its rock floor. `shown` false hides the layer.
func show_level(z: int, shown: bool) -> void:
	var was := _level
	var was_shown := _shown
	_level = z
	_shown = shown
	visible = shown
	if _ground != null:
		_ground.visible = shown and z < 0
	if not shown:
		return
	if was != _level or not was_shown:
		redraw()
	else:
		_draw_outline()


## The active level while shown.
func level() -> int:
	return _level


## Draws every loaded block of the level near the camera again (the origin or the level changed)
## and asks for the missing ones; draws the outlines.
func redraw() -> void:
	if _view == null or _view.model == null or _ground == null:
		return
	_ground.clear()
	if not _shown:
		return
	position = Vector3(0.0, float(_level - _view.origin.z) - FLOOR_DROP, 0.0)
	_draw_outline()
	if _level >= 0:
		return
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


## Tint over the rock floor (lamp light is warm and dim; GroundLayer.set_tint).
func set_tint(color: Color) -> void:
	_ground.set_tint(color)


func set_soft(on: bool) -> void:
	_ground.set_soft(on)


func block_count() -> int:
	return _ground.block_count()


## Number of bars of the neighbouring levels' outlines.
func outline_bars() -> int:
	return _outline.multimesh.instance_count if _outline.multimesh != null else 0


## Number of dashes of the hull type borders of the level below.
func border_dashes() -> int:
	return _dashes.multimesh.instance_count if _dashes.multimesh != null else 0


func _on_level_loaded(z: int, request: SurfaceBlocks.Request) -> void:
	if not _shown or z != _level or _level >= 0:
		return
	var blocks := _view.model.level_surface(z)
	for block: Vector2i in request.blocks:
		_ground.add_block(blocks, block.x * SurfaceBlocks.BLOCK, block.y * SurfaceBlocks.BLOCK, _view.origin, _view.model.size_x)


## The hull cells (x, y → hull type) of the open structure and its guests on one level.
func _level_cells(z: int) -> Dictionary:
	var cells: Dictionary = {}
	var structures: Array[ColonyModel] = [_view.model]
	structures.append_array(_view.model.guest_list())
	for structure: ColonyModel in structures:
		for local: Vector3i in structure.layout.hull_cells():
			var cell := structure.layout.to_absolute(local)
			if cell.z == z:
				cells[Vector2i(cell.x, cell.y)] = structure.layout.hull_at(local)
	return cells


## The outlines of the level below and the level above as thin bars on the active level's floor,
## and the hull type borders of the level below as dashes.
func _draw_outline() -> void:
	if _outline == null or _view == null or _view.model == null or not _shown:
		return
	var below := _level_cells(_level - 1)
	var bars: Array[Transform3D] = []
	for edge: Vector3i in LevelOutline.outline(below) + LevelOutline.outline(_level_cells(_level + 1)):
		bars.append(_edge_transform(edge, 0.0))
	_outline.multimesh = _multimesh(_bar(1.0 + OUTLINE_WIDTH, OUTLINE_WIDTH), bars)
	var dashes: Array[Transform3D] = []
	for edge: Vector3i in LevelOutline.type_borders(below):
		for offset: float in DASH_OFFSETS:
			dashes.append(_edge_transform(edge, offset))
	_dashes.multimesh = _multimesh(_bar(DASH_LENGTH, DASH_WIDTH), dashes)


## Where a bar along one side of a cell lies (shifted `along` the side, in cells).
func _edge_transform(edge: Vector3i, along: float) -> Transform3D:
	var centre := WorldGrid.to_scene(Vector3i(edge.x, edge.y, _view.origin.z), _view.origin, _view.model.size_x)
	centre.y = OUTLINE_LIFT + FLOOR_DROP
	# Cell y grows towards scene −Z; bars lie along scene X, turned a quarter for east and west.
	match edge.z:
		LevelOutline.SIDE_NORTH:
			return Transform3D(Basis.IDENTITY, centre + Vector3(along, 0.0, -0.5))
		LevelOutline.SIDE_SOUTH:
			return Transform3D(Basis.IDENTITY, centre + Vector3(along, 0.0, 0.5))
		LevelOutline.SIDE_EAST:
			return Transform3D(Basis(Vector3.UP, PI / 2.0), centre + Vector3(0.5, 0.0, along))
		_:
			return Transform3D(Basis(Vector3.UP, PI / 2.0), centre + Vector3(-0.5, 0.0, along))


static func _multimesh(mesh: Mesh, transforms: Array[Transform3D]) -> MultiMesh:
	var multimesh := MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.mesh = mesh
	multimesh.instance_count = transforms.size()
	for index: int in transforms.size():
		multimesh.set_instance_transform(index, transforms[index])
	return multimesh


## A thin bar along scene X, unlit, over everything on the floor.
static func _bar(length: float, width: float) -> Mesh:
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.albedo_color = OUTLINE_COLOR
	var box := BoxMesh.new()
	box.size = Vector3(length, 0.01, width)
	box.material = material
	return box
