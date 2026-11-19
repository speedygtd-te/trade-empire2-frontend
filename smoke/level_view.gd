extends Control
## Review tool for building on levels: builds a two-storey part with a basement and a staircase
## over the colony of the levels account (.local/levels-account.json, tools/dev-account.cjs
## --account levels), takes pictures — the level selector, the second storey being built, the
## cutaway basement with its rock, the shaft with its head, the closed structure from outside —
## and takes everything down again. Root script of smoke/level_view.tscn:
##   godot --path . --resolution 720x1280 res://smoke/level_view.tscn -- --out=build/levels

const ACCOUNT := "res://.local/levels-account.json"
const UP := Vector3i(0, 0, 1)

var _out_dir := "user://levels"
var _colony: ColonyScreen
var _model: ColonyModel


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = AppTheme.build()
	_run()


func _run() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--out="):
			_out_dir = argument.trim_prefix("--out=")
	DirAccess.make_dir_recursive_absolute(_out_dir)
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(ACCOUNT)))
	var error := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	if error != null:
		print("FAIL  sign-in (run node tools/dev-account.cjs --account levels /v2/me)")
		get_tree().quit(1)
		return
	_colony = ColonyScreen.new()
	add_child(_colony)
	var deadline := Time.get_ticks_msec() + 30000
	while _colony._model.structure_id == 0 and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	await get_tree().create_timer(4.0).timeout
	_model = _colony._model
	var layout := _model.layout

	var built := await _build_part(layout)
	if built.is_empty():
		get_tree().quit(1)
		return
	var stair: Vector3i = built[0]
	var level_two: Array[Vector3i] = []
	for cell: Vector3i in built.slice(1):
		level_two.append(cell)

	# Open on level 1: the selector, the first storey's floor plates and modules.
	_colony._select_structure(true)
	_colony._open_structure(ColonyScreen.Mode.VIEW)
	_colony._set_level(1)
	await _capture("level_selector")
	# Bearings: on the ground level the outline of the storey above; on level 2 the outline of
	# level 1 and dashed lines where its hull type changes.
	_colony._set_level(0)
	await _capture("level_ground_bearings")
	_colony._set_level(2)
	_look_at(layout.to_absolute(level_two[0]))
	await _capture("level_two_bearings")

	# Level 2 in the build tab: a hull next to the second storey, previewed.
	_colony._set_mode(ColonyScreen.Mode.BUILD)
	_colony._set_level(2)
	_colony._choose_tool("hull:STANDARD")
	var next := layout.to_absolute(level_two[level_two.size() - 1] + Vector3i(0, 1, 0))
	_colony._select(next)
	_look_at(next)
	await _capture("level_build_second")
	_colony._choose_tool("hull:STARTER")
	await _capture("level_build_starter_hidden")

	# The staircase: inspected from its base, then from its head on level 2.
	_colony._set_mode(ColonyScreen.Mode.VIEW)
	_colony._set_level(1)
	_colony._select(layout.to_absolute(stair + UP))
	await _capture("level_shaft")
	_colony._set_level(2)
	await _capture("level_shaft_head")

	# Below the ground: the cutaway.
	_colony._set_level(-1)
	_colony._select(null)
	await get_tree().create_timer(4.0).timeout
	await _capture("level_cutaway")
	_colony._set_mode(ColonyScreen.Mode.BUILD)
	_colony._choose_tool("module:MINE")
	_colony._select(layout.to_absolute(Vector3i(stair.x, stair.y, -1)))
	await _capture("level_cutaway_build")

	# Closed: every storey from outside.
	_colony._close_structure()
	_colony._select_structure(false)
	_colony._view.look_at_cell(_model.centre_cell())
	await _capture("level_closed")
	_colony._view.zoom = 6.0
	_colony._view.zoom_by(1.0)
	await _capture("level_closed_near")

	await _take_down(layout)
	get_tree().quit()


## Builds over a free ground hull C: level 1 over the colony's middle, level 2 over C and two
## more, a basement under C and its neighbours, habitats upstairs, a mine below, a staircase from
## C up to level 2. Returns [C, the level-2 cells …]; empty when it failed.
func _build_part(layout: StructureLayout) -> Array:
	var column := Vector3i(-1, -1, -1)
	for cell: Vector3i in layout.hull_cells():
		if cell.z == 0 and layout.module_at(cell) == null and layout.hull_at(cell) != DockRules.DOCK \
				and layout.hull_at(cell + UP).is_empty():
			column = cell
			break
	if column.x < 0:
		print("FAIL  no free ground hull")
		return []
	var ops: Array[Dictionary] = []
	var first: Array[Vector3i] = []
	for cell: Vector3i in layout.hull_cells():
		if cell.z == 0 and absi(cell.x - column.x) <= 1 and absi(cell.y - column.y) <= 2:
			first.append(cell + UP)
	for cell: Vector3i in first:
		ops.append(_op("placeHull", cell, "STARTER"))
	var second: Array[Vector3i] = [column + UP * 2]
	for step: Vector3i in [Vector3i(1, 0, 0), Vector3i(0, 1, 0)]:
		if first.has(column + UP + step):
			second.append(column + UP * 2 + step)
	for cell: Vector3i in second:
		ops.append(_op("placeHull", cell, "STANDARD"))
	for step: Vector3i in [Vector3i.ZERO, Vector3i(1, 0, 0), Vector3i(0, 1, 0), Vector3i(1, 1, 0)]:
		if not layout.hull_at(column + step).is_empty():
			ops.append(_op("placeHull", column + step - UP, "REINFORCED"))
	var hulls := await _model.send_ops(ops)
	print("LEVELS  hulls: ", "ok" if hulls.is_ok() else hulls.error.code)
	if not hulls.is_ok():
		return []
	await _until(func() -> bool: return not layout.hull_at(column + UP * 2).is_empty())
	var modules: Array[Dictionary] = [_op("placeModule", column, "STAIRCASE")]
	for cell: Vector3i in first:
		if cell != column + UP and modules.size() < 4:
			modules.append(_op("placeModule", cell, "HABITAT"))
	for step: Vector3i in [Vector3i(1, 0, 0), Vector3i(0, 1, 0)]:
		if not layout.hull_at(column + step - UP).is_empty():
			modules.append(_op("placeModule", column + step - UP, "MINE"))
			break
	var placed := await _model.send_ops(modules)
	print("LEVELS  modules: ", "ok" if placed.is_ok() else placed.error.code)
	# The staircase's base has to be finished before it grows.
	await get_tree().create_timer(7.0).timeout
	_model.reload_layout()
	await get_tree().create_timer(1.5).timeout
	var at := layout.to_absolute(column)
	var extended := await _model.send_ops([{"op": "extendShaft", "x": at.x, "y": at.y, "z": at.z}])
	print("LEVELS  shaft extended: ", "ok" if extended.is_ok() else extended.error.code)
	await get_tree().create_timer(1.5).timeout
	var result: Array = [column]
	result.append_array(second)
	return result


## Removes every module above and below the ground, then the hulls from the top down.
func _take_down(layout: StructureLayout) -> void:
	var ops: Array[Dictionary] = []
	for placed: StructureLayout.Module in layout.modules():
		var z := layout.to_absolute(placed.origin).z
		if z != 0 or placed.module_type == "STAIRCASE":
			if layout.is_shaft(placed) and layout.shaft_of(placed)[0] != placed:
				continue
			ops.append(_op("removeModule", placed.origin, ""))
	var cells := layout.hull_cells()
	cells.sort_custom(func(a: Vector3i, b: Vector3i) -> bool: return a.z > b.z)
	for cell: Vector3i in cells:
		if layout.to_absolute(cell).z != 0:
			ops.append(_op("removeHull", cell, ""))
	var removed := await _model.send_ops(ops)
	print("LEVELS  taken down: ", "ok" if removed.is_ok() else removed.error.code)


func _op(kind: String, cell: Vector3i, type: String) -> Dictionary:
	var at := _model.layout.to_absolute(cell)
	var op := {"op": kind, "x": at.x, "y": at.y, "z": at.z}
	if kind == "placeHull":
		op["hullType"] = type
	elif kind == "placeModule":
		op["moduleType"] = type
		op["rotation"] = 0
	return op


## Centres the view on an absolute cell, in the part above the bottom panel.
func _look_at(cell: Vector3i) -> void:
	_colony._view.look_at_cell(cell)
	_colony._view.pan(Vector2(0.0, -_colony._bottom.size.y * 0.5 * _colony._scale()), Vector2(_colony._viewport.size))


func _until(condition: Callable, timeout_ms: int = 8000) -> void:
	var deadline := Time.get_ticks_msec() + timeout_ms
	while Time.get_ticks_msec() < deadline and not condition.call():
		await get_tree().process_frame


func _capture(file_name: String) -> void:
	await get_tree().create_timer(1.2).timeout
	await RenderingServer.frame_post_draw
	var path := "%s/%s.png" % [_out_dir, file_name]
	get_viewport().get_texture().get_image().save_png(path)
	print("SAVED  %s" % path)
