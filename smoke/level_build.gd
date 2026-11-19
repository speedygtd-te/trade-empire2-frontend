extends Node
## End-to-end check of building on several levels against the server, with its own account
## (.local/levels-account.json, tools/dev-account.cjs --account levels): a hull on level 1 and 2
## over the colony, an overhang too far, a basement hull, hulls the level does not take, a
## staircase from the ground to level 1 extended to level 2, the shaft head, the removal of the
## whole shaft, and the rock biomes of the basement level. Every client preview is compared with
## the server's answer. Takes everything down again.
##
## Root script of smoke/level_build.tscn (needs the Services autoload); run through
## tools\colony-smoke.ps1 -Scene level_build.

const ACCOUNT := "res://.local/levels-account.json"
const UP := Vector3i(0, 0, 1)
const DOWN := Vector3i(0, 0, -1)
const SHAFT := "STAIRCASE"
## Biomes the surface query answers for a level below the ground.
const ROCK_BIOMES: PackedStringArray = ["ROCK_LAYER", "MINERAL_VEIN", "CAVE_FLOOR", "MAGMA_POCKET", "DEEP_STONE", "ICE_CAVERN"]

var _failures := 0
var _model: ColonyModel
## Host cells this run placed, in the order of placing (taken down in reverse).
var _placed: Array[Vector3i] = []


func _ready() -> void:
	_run()


func _check(ok: bool, label: String) -> void:
	if not ok:
		_failures += 1
	print("%s  %s" % ["PASS" if ok else "FAIL", label])


func _code(result: ApiResult) -> String:
	if result.is_ok():
		return "OK"
	return "transport: " + result.error.message if result.error.is_transport() else result.error.code


func _name(verdict: BuildRules.Verdict) -> String:
	return BuildRules.Verdict.keys()[verdict]


func _wait_until(condition: Callable, timeout_ms: int) -> bool:
	var deadline := Time.get_ticks_msec() + timeout_ms
	while Time.get_ticks_msec() < deadline:
		if condition.call():
			return true
		await get_tree().process_frame
	return condition.call()


func _units(item: String) -> int:
	return _model.inventory.units(item, Services.clock.now_ms()) if _model.inventory != null else -1


func _op(kind: String, cell: Vector3i, type: String = "") -> Dictionary:
	var at := _model.layout.to_absolute(cell)
	var op := {"op": kind, "x": at.x, "y": at.y, "z": at.z}
	if kind == "placeHull":
		op["hullType"] = type
	elif kind == "placeModule":
		op["moduleType"] = type
		op["rotation"] = 0
	return op


## The client preview of a hull (type, level, place) — as the build screen asks for it.
func _hull_preview(cell: Vector3i, hull_type: String) -> BuildRules.Verdict:
	return DockRules.check_place_hull(_model.layout, _model.guest_layouts(), cell, hull_type, Services.definitions, _model.site())


## Places a hull after comparing preview and server: `expected` is the server code ("OK" or an
## error). Returns whether it was placed.
func _try_hull(cell: Vector3i, hull_type: String, expected: String, what: String) -> bool:
	var preview := _name(_hull_preview(cell, hull_type))
	var answer := await _model.send_ops([_op("placeHull", cell, hull_type)])
	var server := _code(answer)
	var same := preview == server or (preview == "NOT_CONNECTED" and server == "FOUND_ONLY_ON_DOCK") \
		or (preview == "OCCUPIED" and server == "CELL_OCCUPIED")
	_check(same and server == expected, "%s: %s at z=%d -> preview %s, server %s (expected %s)" % [
		what, hull_type, _model.layout.to_absolute(cell).z, preview, server, expected])
	if answer.is_ok():
		_placed.append(cell)
		await _wait_until(func() -> bool: return not _model.layout.hull_at(cell).is_empty(), 8000)
	return answer.is_ok()


func _run() -> void:
	await get_tree().process_frame
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(ACCOUNT)))
	if account.is_empty():
		print("FAIL  no account (run node tools/dev-account.cjs --account levels /v2/me)")
		get_tree().quit(2)
		return
	print("server: ", Services.server.base)
	var signed_in := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	_check(signed_in == null, "sign in with the levels account")
	if signed_in != null:
		get_tree().quit(1)
		return
	await _wait_until(func() -> bool: return Services.definitions != null, 10000)
	_check(Services.definitions != null and Services.definitions.module(SHAFT) != null \
		and Services.definitions.module(SHAFT).vertical_access, "game data knows the staircase as a shaft")

	_model = ColonyModel.new()
	add_child(_model)
	var failed: Array[ApiError] = []
	_model.load_failed.connect(func(error: ApiError) -> void: failed.append(error))
	_model.load_home()
	await _wait_until(func() -> bool: return _model.inventory != null or not failed.is_empty(), 20000)
	_check(failed.is_empty() and _model.layout.hull_count() > 0, "colony loaded: %d hulls" % _model.layout.hull_count())
	if not failed.is_empty():
		get_tree().quit(1)
		return
	_check(_model.has_grid and _model.min_z < 0 and _model.max_z > 2,
		"grid has levels %d..%d, deep from %d" % [_model.min_z, _model.max_z, _model.deep_threshold])

	await _run_levels()
	await _take_down()
	print("LEVEL SMOKE %s  (%d failed)" % ["GREEN" if _failures == 0 else "RED", _failures])
	get_tree().quit(0 if _failures == 0 else 1)


func _run_levels() -> void:
	var layout := _model.layout
	var column := _free_column(layout)
	if column == Vector3i(-1, -1, -1):
		_check(false, "a free ground hull with free columns above and beside it")
		return
	var a1 := column + UP
	var a2 := column + UP * 2
	var range_now := LevelRules.level_range(layout.absolute_levels(), _model.site())
	_check(range_now.x == -1 and range_now.y == 1, "level selector offers -1..1 on a flat colony (%s)" % range_now)

	# Above the ground.
	if not await _try_hull(a1, "STARTER", "OK", "first floor over the colony"):
		return
	if not await _try_hull(a2, "STANDARD", "OK", "second floor on the first"):
		return
	var beside := a2 + Vector3i(1, 0, 0)
	if not await _try_hull(beside, "STANDARD", "OK", "second floor diagonally over the first"):
		return
	await _try_hull(beside + Vector3i(1, 0, 0), "STANDARD", "OVERHANG_EXCEEDED", "two cells off its support")
	await _try_hull(a2 + Vector3i(0, 1, 0), "STARTER", "HULL_Z_RESTRICTED", "starter hull too high")
	await _try_hull(a2 + Vector3i(0, 1, 0), "COMPOSITE", "INVALID_HULL_TYPE", "no surface hull type")
	range_now = LevelRules.level_range(layout.absolute_levels(), _model.site())
	_check(range_now.y == 3, "level selector now reaches level 3 (%s)" % range_now)

	# Below the ground.
	var basement := _free_below(layout, column)
	await _try_hull(basement, "STANDARD", "INCOMPATIBLE_HULL", "surface hull under the ground")
	await _try_hull(basement, "STARTER", "HULL_Z_RESTRICTED", "starter hull under the ground")
	var bottom := Vector3i(basement.x, basement.y, _model.min_z - 1 - _model.layout.offset.z)
	await _try_hull(bottom, "REINFORCED", "OUT_OF_BOUNDS", "below the grid")
	await _try_hull(basement, "REINFORCED", "OK", "reinforced basement under the colony")
	await _check_rock(basement)

	await _check_shaft(column, a1, a2)


## A staircase from the ground to level 1, extended to level 2, its head, and its removal.
func _check_shaft(base: Vector3i, a1: Vector3i, a2: Vector3i) -> void:
	var layout := _model.layout
	var definitions := Services.definitions
	var item := definitions.module(SHAFT).item
	var before := _units(item)

	# Without a hull above it a staircase cannot stand.
	var bare := _bare_ground(layout)
	var no_above := BuildRules.check_place_module(layout, definitions, SHAFT, bare)
	var refused := await _model.send_ops([_op("placeModule", bare, SHAFT)])
	_check(_name(no_above) == "NO_HULL_ABOVE" and _code(refused) == "NO_HULL_ABOVE",
		"staircase without a hull above: preview %s, server %s" % [_name(no_above), _code(refused)])

	var preview := BuildRules.check_place_module(layout, definitions, SHAFT, base)
	var placed := await _model.send_ops([_op("placeModule", base, SHAFT)])
	_check(preview == BuildRules.Verdict.OK and placed.is_ok(),
		"staircase from the ground to level 1: preview %s, server %s" % [_name(preview), _code(placed)])
	if not placed.is_ok():
		return
	await _wait_until(func() -> bool: return layout.module_at(base) != null, 8000)
	var floor_0 := layout.module_at(base)
	_check(floor_0 != null and layout.is_shaft_head(a1), "layout: staircase with its head on level 1")
	_check(BuildRules.check_place_module(layout, definitions, "SMELTER", a1) == BuildRules.Verdict.HULL_OCCUPIED \
		and BuildRules.check_remove_hull(layout, a1) == BuildRules.Verdict.HULL_HAS_MODULE, "preview: the head is taken")
	var on_head := await _model.send_ops([_op("placeModule", a1, "SMELTER")])
	_check(_code(on_head) == "HULL_OCCUPIED", "module on the head -> HULL_OCCUPIED (got %s)" % _code(on_head))
	var head_hull := await _model.send_ops([_op("removeHull", a1)])
	_check(_code(head_hull) == "HULL_HAS_MODULE", "removing the head's hull -> HULL_HAS_MODULE (got %s)" % _code(head_hull))

	# While the base is built the shaft does not grow.
	if floor_0 != null and floor_0.is_building():
		var early := BuildRules.check_extend_shaft(layout, definitions, a1)
		var answer := await _model.send_ops([_op("extendShaft", a1)])
		_check(_name(early) == "BASE_BUILDING" and _code(answer) == "BASE_BUILDING",
			"extend while the base is built: preview %s, server %s" % [_name(early), _code(answer)])
	var is_finished := func() -> bool:
		var floor_now := layout.module_at(base)
		if floor_now != null and floor_now.is_building() and Engine.get_process_frames() % 120 == 0:
			_model.reload_layout()
		return floor_now != null and not floor_now.is_building()
	var finished := await _wait_until(is_finished, 30000)
	_check(finished, "staircase finished")

	var grow := BuildRules.check_extend_shaft(layout, definitions, a1)
	var extended := await _model.send_ops([_op("extendShaft", a1)])
	var results: Array = extended.data.get("results") if extended.is_ok() and typeof(extended.data.get("results")) == TYPE_ARRAY else []
	var reported := Wire.as_int(Wire.as_dict(results[0]).get("floors")) if not results.is_empty() else -1
	_check(grow == BuildRules.Verdict.OK and extended.is_ok() and reported == 2,
		"extend the shaft to level 2: preview %s, server %s, %d floors" % [_name(grow), _code(extended), reported])
	await _wait_until(func() -> bool: return layout.is_shaft_head(a2), 8000)
	var floors: Array[StructureLayout.Module] = []
	if layout.module_at(base) != null:
		floors = layout.shaft_of(layout.module_at(base))
	_check(floors.size() == 2 and layout.is_shaft_head(a2), "layout: two floors, head on level 2 (%d floors)" % floors.size())
	var full := BuildRules.check_extend_shaft(layout, definitions, a2)
	var no_room := await _model.send_ops([_op("extendShaft", a2)])
	_check(_name(full) == "NO_HULL_ABOVE" and _code(no_room) == "NO_HULL_ABOVE",
		"extend without a hull above the head: preview %s, server %s" % [_name(full), _code(no_room)])

	var removed := await _model.send_ops([_op("removeModule", a1)])
	_check(removed.is_ok(), "remove the shaft from its upper floor -> %s" % _code(removed))
	results = removed.data.get("results") if removed.is_ok() and typeof(removed.data.get("results")) == TYPE_ARRAY else []
	var count := Wire.as_int(Wire.as_dict(results[0]).get("count")) if not results.is_empty() else -1
	_check(count == 2, "the whole shaft went: %d floors returned" % count)
	await _wait_until(func() -> bool: return layout.module_at(base) == null and layout.module_at(a1) == null, 8000)
	_check(layout.module_at(base) == null and layout.module_at(a1) == null and not layout.is_shaft_head(a2), "layout: shaft gone")
	await _wait_until(func() -> bool: return _units(item) == before, 8000)
	_check(_units(item) == before, "store: staircases back (%d)" % _units(item))


## The basement level's ground comes as rock biomes.
func _check_rock(basement: Vector3i) -> void:
	var z := _model.layout.to_absolute(basement).z
	var at := _model.layout.to_absolute(basement)
	var blocks := _model.level_surface(z)
	_model.ensure_level_surface(at, z)
	await _wait_until(func() -> bool: return blocks.is_loaded(blocks.block_of(at.x, at.y)), 15000)
	var cell := blocks.cell(at.x, at.y)
	_check(cell != null and ROCK_BIOMES.has(cell.biome), "level %d ground is rock: %s" % [z, cell.biome if cell != null else "(none)"])
	# The ground level stays apart: its own blocks, surface biomes.
	_check(_model.level_surface(0) == _model.surface and blocks != _model.surface, "underground levels keep their own blocks")


## Takes down every hull this run placed, the highest first.
func _take_down() -> void:
	var order: Array[Vector3i] = []
	order.append_array(_placed)
	order.sort_custom(func(a: Vector3i, b: Vector3i) -> bool: return a.z > b.z if a.z != b.z else a.x > b.x)
	for cell: Vector3i in order:
		var answer := await _model.send_ops([_op("removeHull", cell)])
		_check(answer.is_ok(), "take down the hull at z=%d -> %s" % [_model.layout.to_absolute(cell).z, _code(answer)])
	var all_gone := func() -> bool:
		for cell: Vector3i in order:
			if not _model.layout.hull_at(cell).is_empty():
				return false
		return true
	_check(await _wait_until(all_gone, 8000), "layout: every hull of this run gone")


## A ground hull without module whose columns above it and two cells to its +x stay free (local).
func _free_column(layout: StructureLayout) -> Vector3i:
	var cells := layout.hull_cells()
	cells.sort()
	for cell: Vector3i in cells:
		if cell.z != 0 or layout.module_at(cell) != null or layout.hull_at(cell) == DockRules.DOCK:
			continue
		var clear := true
		for step: Vector3i in [UP, UP * 2, UP * 2 + Vector3i(1, 0, 0), UP * 2 + Vector3i(2, 0, 0), UP * 2 + Vector3i(0, 1, 0)]:
			if not layout.hull_at(cell + step).is_empty():
				clear = false
		# Two cells off the support: nothing on level 1 under x + 1 … x + 3.
		for dx: int in range(1, 4):
			for dy: int in [-1, 0, 1]:
				if not layout.hull_at(cell + Vector3i(dx, dy, 1)).is_empty():
					clear = false
		if clear:
			return cell
	return Vector3i(-1, -1, -1)


## A cell under the colony on level -1 (below a ground hull) that is free.
func _free_below(layout: StructureLayout, near: Vector3i) -> Vector3i:
	for cell: Vector3i in [near + DOWN, near + Vector3i(1, 0, -1), near + Vector3i(0, 1, -1)]:
		if layout.hull_at(cell).is_empty() and not layout.hull_at(cell + UP).is_empty():
			return cell
	for cell: Vector3i in layout.hull_cells():
		if cell.z == 0 and layout.hull_at(cell + DOWN).is_empty():
			return cell + DOWN
	return near + DOWN


## A ground hull without module and without a hull above it.
func _bare_ground(layout: StructureLayout) -> Vector3i:
	for cell: Vector3i in layout.hull_cells():
		if cell.z == 0 and layout.module_at(cell) == null and layout.hull_at(cell + UP).is_empty() \
				and layout.hull_at(cell) != DockRules.DOCK:
			var hull_def := Services.definitions.hull(layout.hull_at(cell))
			if hull_def != null and hull_def.module_positioning == "INDOOR":
				return cell
	return Vector3i.ZERO
