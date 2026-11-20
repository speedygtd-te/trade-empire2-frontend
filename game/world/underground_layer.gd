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
##
## Deep water (draft.39): cells of the active level that still lie in a water column (their biome at
## that level is water) are covered with see-through water (water_column.gdshader), darker the
## deeper the level; the sea floor right under the water gets a faint blue wash, so the player sees
## where the column goes on and where the floor begins. Up to draft.38 no level below the ground
## carries water and nothing of this is drawn.

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
## The water lies this much above the level (under the hull floor plates, over the floor).
const WATER_LIFT := 0.03
## Cover of the blue wash on the sea floor right under a water column (water: 1).
const SEA_FLOOR_WASH := 0.32
const WATER_SHADER := preload("res://game/world/water_column.gdshader")
const NOISE := preload("res://game/world/ground/ground_noise.png")

var _view: ColonyView
var _ground: GroundLayer
var _outline: MultiMeshInstance3D
var _dashes: MultiMeshInstance3D
var _water: Node3D
var _water_material: ShaderMaterial
var _water_mesh: PlaneMesh
## Block (as SurfaceBlocks counts it) → its MultiMeshInstance3D of water and sea floor cells.
var _water_blocks: Dictionary = {}
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
	_water = Node3D.new()
	_water.name = "Water"
	add_child(_water)
	_water_material = ShaderMaterial.new()
	_water_material.shader = WATER_SHADER
	_water_material.set_shader_parameter("noise", NOISE)
	_water_mesh = PlaneMesh.new()
	_water_mesh.size = Vector2(1.0, 1.0)
	_water_mesh.material = _water_material
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
		_water.visible = shown and z < 0
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
	_clear_water()
	if not _shown:
		return
	_draw_outline()
	if _level >= 0:
		return
	var model := _view.model
	var blocks := model.level_surface(_level)
	var cell := _view.focus_cell()
	var centre := blocks.block_of(cell.x, cell.y)
	var reach := ColonyModel.SURFACE_RADIUS + 1
	_water_material.set_shader_parameter("depth", float(-_level))
	for by: int in range(centre.y - reach, centre.y + reach + 1):
		for bx: int in range(centre.x - reach, centre.x + reach + 1):
			if blocks.is_loaded(blocks.block_of(bx * SurfaceBlocks.BLOCK, by * SurfaceBlocks.BLOCK)):
				_ground.add_block(blocks, bx * SurfaceBlocks.BLOCK, by * SurfaceBlocks.BLOCK, _view.origin, model.size_x)
				_add_water(bx * SurfaceBlocks.BLOCK, by * SurfaceBlocks.BLOCK)
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
		_add_water(block.x * SurfaceBlocks.BLOCK, block.y * SurfaceBlocks.BLOCK)


## Number of water cells (in the column) and sea floor cells (washed) drawn on the active level.
func water_cells() -> Vector2i:
	var result := Vector2i.ZERO
	for instance: MultiMeshInstance3D in _water_blocks.values():
		result += instance.get_meta("cells") as Vector2i
	return result


func _clear_water() -> void:
	if _water == null:
		return
	for child: Node in _water.get_children():
		_water.remove_child(child)
		child.queue_free()
	_water_blocks.clear()


## Covers the water cells of the block whose first cell is (x0, y0) on the active level, and washes
## the sea floor cells whose level above is water.
func _add_water(x0: int, y0: int) -> void:
	var model := _view.model
	var blocks := model.level_surface(_level)
	var above := model.level_surface(_level + 1)
	var key := blocks.block_of(x0, y0)
	if _water_blocks.has(key):
		var old := _water_blocks[key] as Node
		_water.remove_child(old)
		old.queue_free()
		_water_blocks.erase(key)
	var transforms: Array[Transform3D] = []
	var colors: Array[Color] = []
	var counts := Vector2i.ZERO
	for j: int in SurfaceBlocks.BLOCK:
		for i: int in SurfaceBlocks.BLOCK:
			var found := blocks.cell(x0 + i, y0 + j)
			if found == null:
				continue
			var cover := 0.0
			if LevelRules.is_water_biome(found.biome):
				cover = 1.0
				counts.x += 1
			else:
				var over := above.cell(x0 + i, y0 + j)
				if over == null or not LevelRules.is_water_biome(over.biome):
					continue
				cover = SEA_FLOOR_WASH
				counts.y += 1
			var centre := WorldGrid.to_scene(Vector3i(x0 + i, y0 + j, _view.origin.z), _view.origin, model.size_x)
			centre.y = WATER_LIFT
			transforms.append(Transform3D(Basis.IDENTITY, centre))
			colors.append(Color(1.0, 1.0, 1.0, cover))
	if transforms.is_empty():
		return
	var multimesh := MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.use_colors = true
	multimesh.mesh = _water_mesh
	multimesh.instance_count = transforms.size()
	for index: int in transforms.size():
		multimesh.set_instance_transform(index, transforms[index])
		multimesh.set_instance_color(index, colors[index])
	var instance := MultiMeshInstance3D.new()
	instance.multimesh = multimesh
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	instance.set_meta("cells", counts)
	_water.add_child(instance)
	_water_blocks[key] = instance


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
	_place()
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


## The layer lies at the active level, counted from the home structure's floor: the structure
## stands at the base elevation of its footprint (ColonyView.lift_of, TerrainRelief), and the rock
## floor and the outlines belong to it like its levels — flat, whatever the relief around.
func _place() -> void:
	position = Vector3(0.0, float(_level - _view.origin.z) - FLOOR_DROP + _view.lift_of(_view.model), 0.0)


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
