extends Node
## End-to-end check of building against the server, with the development account of
## tools/dev-account.cjs: place a hull next to the colony, a module on it, remove both again,
## place a 3×2 hull rectangle half over the colony's edge (HullShapes) and remove it, and check
## that layout and store follow. Leaves the colony as it was.
##
## Root script of smoke/colony_build.tscn (needs the Services autoload); run through
## tools\colony-smoke.ps1.

const DEV_ACCOUNT := "res://.local/dev-account.json"
const HULL := "STARTER"
const MODULE := "SMELTER"
## A module whose slot type does not fit the hull above (OUTDOOR on an INDOOR hull).
const WRONG_MODULE := "COLLECTOR"

var _failures := 0
var _model: ColonyModel


func _ready() -> void:
	_run()


func _check(ok: bool, label: String) -> void:
	if not ok:
		_failures += 1
	print("%s  %s" % ["PASS" if ok else "FAIL", label])


func _code(result: ApiResult) -> String:
	if result.is_ok():
		return "(none)"
	return "transport: " + result.error.message if result.error.is_transport() else result.error.code


func _wait_until(condition: Callable, timeout_ms: int) -> bool:
	var deadline := Time.get_ticks_msec() + timeout_ms
	while Time.get_ticks_msec() < deadline:
		if condition.call():
			return true
		await get_tree().process_frame
	return condition.call()


func _units(item: String) -> int:
	return _model.inventory.units(item, Services.clock.now_ms()) if _model.inventory != null else -1


func _run() -> void:
	await get_tree().process_frame
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(DEV_ACCOUNT)))
	if account.is_empty():
		print("FAIL  no development account (run node tools/dev-account.cjs)")
		get_tree().quit(2)
		return
	print("server: ", Services.server.base)
	var signed_in := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	_check(signed_in == null, "sign in with the development account")
	if signed_in != null:
		get_tree().quit(1)
		return
	await _wait_until(func() -> bool: return Services.definitions != null, 10000)
	_check(Services.definitions != null, "game data loaded")

	_model = ColonyModel.new()
	add_child(_model)
	var failed: Array[ApiError] = []
	_model.load_failed.connect(func(error: ApiError) -> void: failed.append(error))
	_model.load_home()
	await _wait_until(func() -> bool: return _model.inventory != null or not failed.is_empty(), 20000)
	_check(failed.is_empty() and _model.layout.hull_count() > 0,
		"colony loaded: %d hulls, %d modules" % [_model.layout.hull_count(), _model.layout.module_count()])
	if not failed.is_empty():
		get_tree().quit(1)
		return

	var layout := _model.layout
	_check_access(layout)
	var hull_item := Services.definitions.hull(HULL).item
	var module_item := Services.definitions.module(MODULE).item
	var hulls_at_start := _units(hull_item)
	# Modules with staff need a corridor (draft.29): a free hull next to the colony first, the
	# test hull further out next to it.
	var spot := _corridor_spot(layout)
	_check(spot.size() == 4, "a free spot for a corridor and a hull next to the colony")
	if spot.size() < 4:
		get_tree().quit(1)
		return
	var corridor := layout.to_absolute(spot[0])
	var laid := await _model.send_ops([{"op": "placeHull", "hullType": HULL, "x": corridor.x, "y": corridor.y, "z": corridor.z}])
	_check(laid.is_ok(), "corridor hull -> ok (error: %s)" % _code(laid))
	await _wait_until(func() -> bool: return not layout.hull_at(spot[0]).is_empty() and _units(hull_item) == hulls_at_start - 1, 8000)
	var hulls_before := _units(hull_item)
	var modules_before := _units(module_item)
	var local := spot[1]
	var cell := layout.to_absolute(local)
	_check(BuildRules.check_place_hull(layout, local) == BuildRules.Verdict.OK, "preview: hull fits at %s" % cell)

	var placed := await _model.send_ops([{"op": "placeHull", "hullType": HULL, "x": cell.x, "y": cell.y, "z": cell.z}])
	_check(placed.is_ok(), "place hull -> ok (error: %s)" % _code(placed))
	await _wait_until(func() -> bool: return not layout.hull_at(local).is_empty(), 8000)
	_check(layout.hull_at(local) == HULL, "layout shows the new hull")
	await _wait_until(func() -> bool: return _units(hull_item) == hulls_before - 1, 8000)
	_check(_units(hull_item) == hulls_before - 1, "store: one hull less (%d -> %d)" % [hulls_before, _units(hull_item)])

	var preview_wrong := BuildRules.check_place_module(layout, Services.definitions, WRONG_MODULE, local)
	var wrong := await _model.send_ops([{"op": "placeModule", "moduleType": WRONG_MODULE, "x": cell.x, "y": cell.y, "z": cell.z}])
	_check(
		preview_wrong == BuildRules.Verdict.POSITIONING and _code(wrong) == "POSITIONING_MISMATCH",
		"wrong slot: preview and server agree (preview %s, server %s)" % [BuildRules.Verdict.keys()[preview_wrong], _code(wrong)]
	)

	var preview_module := PathAccess.of(layout, Services.definitions).check_place_module(Services.definitions, MODULE, local)
	_check(preview_module.ok(), "preview: the module reaches a corridor (%s)" % BuildRules.Verdict.keys()[preview_module.verdict])
	var module := await _model.send_ops([{"op": "placeModule", "moduleType": MODULE, "x": cell.x, "y": cell.y, "z": cell.z, "rotation": 0}])
	_check(module.is_ok(), "place module -> ok (error: %s)" % _code(module))
	await _wait_until(func() -> bool: return layout.module_at(local) != null, 8000)
	var built := layout.module_at(local)
	_check(built != null and built.module_type == MODULE, "layout shows the module")
	_check(built != null and built.is_building(), "module is under construction")
	_check(BuildRules.check_remove_hull(layout, local) == BuildRules.Verdict.HULL_HAS_MODULE, "preview: hull with module cannot go")

	var removed_module := await _model.send_ops([{"op": "removeModule", "x": cell.x, "y": cell.y, "z": cell.z}])
	_check(removed_module.is_ok(), "remove module -> ok (error: %s)" % _code(removed_module))
	await _wait_until(func() -> bool: return layout.module_at(local) == null, 8000)
	_check(layout.module_at(local) == null, "layout: module gone")
	await _wait_until(func() -> bool: return _units(module_item) == modules_before, 8000)
	_check(_units(module_item) == modules_before, "store: module item back (%d)" % _units(module_item))

	var removed_hull := await _model.send_ops([{"op": "removeHull", "x": cell.x, "y": cell.y, "z": cell.z}])
	_check(removed_hull.is_ok(), "remove hull -> ok (error: %s)" % _code(removed_hull))
	await _wait_until(func() -> bool: return layout.hull_at(local).is_empty(), 8000)
	_check(layout.hull_at(local).is_empty(), "layout: hull gone")
	await _wait_until(func() -> bool: return _units(hull_item) == hulls_before, 8000)
	_check(_units(hull_item) == hulls_before, "store: hull back (%d)" % _units(hull_item))
	var unlaid := await _model.send_ops([{"op": "removeHull", "x": corridor.x, "y": corridor.y, "z": corridor.z}])
	_check(unlaid.is_ok(), "remove the corridor hull -> ok (error: %s)" % _code(unlaid))
	await _wait_until(func() -> bool: return _units(hull_item) == hulls_at_start, 8000)
	_check(_units(hull_item) == hulls_at_start, "store: corridor hull back (%d)" % _units(hull_item))

	await _check_not_connected(layout)
	await _check_shape(layout)
	await _check_recipes(layout)
	await _check_blueprint_batch(layout)
	await _check_discard_and_log()
	await _check_workforce()
	_check_balance()

	print("COLONY SMOKE %s  (%d failed)" % ["GREEN" if _failures == 0 else "RED", _failures])
	get_tree().quit(0 if _failures == 0 else 1)


## Staffs the colony's mine with one more tier-1 robot from the store and puts the old
## assignment back; on the way the preview must agree with the server about too many robots.
func _check_workforce() -> void:
	_model.reload_production()
	await _wait_until(func() -> bool: return not _model.workforce.groups.is_empty(), 8000)
	var group: Variant = _model.workforce.groups.get("MINE")
	_check(group != null, "workforce: the mine has a staff group (%d groups)" % _model.workforce.groups.size())
	if group == null:
		return
	var mine := group as Workforce.Group
	var humans: Array[int] = mine.humans.duplicate()
	var robots: Array[int] = mine.robots.duplicate()
	var auto: Array[bool] = mine.auto.duplicate()
	var store := _model.robots_in_store()
	_check(store[0] > 0, "store has tier-1 robots (%d)" % store[0])
	var more: Array[int] = robots.duplicate()
	more[0] += 1
	_check(_model.workforce.check(mine, humans, more, store).is_empty(), "preview: one more robot is fine")
	var assigned := await _model.set_workforce("MINE", humans, more, auto)
	_check(assigned.is_ok(), "assign one more robot -> ok (error: %s)" % _code(assigned))
	var after: Variant = _model.workforce.groups.get("MINE")
	_check(after != null and (after as Workforce.Group).robots[0] == robots[0] + 1, "workforce shows the robot")
	_check(not _model.workforce.tiers.is_empty(), "answer has the tier unlocks (%d)" % _model.workforce.tiers.size())
	var too_many: Array[int] = robots.duplicate()
	too_many[0] = store[0] + robots[0] + 1000000
	_check(_model.workforce.check(mine, humans, too_many, store) == "INSUFFICIENT_ROBOTS", "preview: far too many robots")
	var refused := await _model.set_workforce("MINE", humans, too_many, auto)
	_check(_code(refused) == "INSUFFICIENT_ROBOTS", "far too many robots -> INSUFFICIENT_ROBOTS (got %s)" % _code(refused))
	var back := await _model.set_workforce("MINE", humans, robots, auto)
	_check(back.is_ok(), "old assignment back -> ok (error: %s)" % _code(back))


## The production balance (draft.28): totals per resource that add up, the mine's iron among
## them, and the inhabitants per tier.
func _check_balance() -> void:
	var totals := _model.totals
	_check(not totals.is_empty(), "balance: totals loaded (%d resources)" % totals.size())
	var adds_up := true
	var iron := 0
	for row: ProductionBalance.Row in totals:
		if row.produced - row.consumed != row.net:
			adds_up = false
		if row.resource == "IRON":
			iron = row.net
	_check(adds_up, "balance: made - used = net for every resource")
	_check(iron > 0, "balance: the mine adds iron (%d micro/h)" % iron)
	_check(_model.population.size() == 5 and _model.life_support_coverage > 0,
		"balance: inhabitants per tier %s, life support coverage %d" % [_model.population, _model.life_support_coverage])
	var flows := ProductionBalance.uses(_model.production_flows, "IRON", false)
	_check(not flows.is_empty() and flows[0].module_type == "MINE", "balance: the mine makes the iron")


## Switches the recipe of the colony's mine to another usable one and back.
func _check_recipes(layout: StructureLayout) -> void:
	await _wait_until(func() -> bool: return not _model.usable_blueprints.is_empty(), 8000)
	_check(not _model.usable_blueprints.is_empty(), "usable recipes loaded (%d)" % _model.usable_blueprints.size())
	var mine: StructureLayout.Module = null
	for placed: StructureLayout.Module in layout.modules():
		if placed.module_type == "MINE" and not placed.is_building():
			mine = placed
	if mine == null:
		print("SKIP  recipes (no finished mine)")
		return
	var before := mine.blueprint
	var other := ""
	for recipe: GameDefinitions.BlueprintDef in Services.definitions.blueprints_for("MINE"):
		if recipe.key != before and _model.usable_blueprints.has(recipe.key):
			other = recipe.key
			break
	_check(not other.is_empty(), "another usable mine recipe exists (%s)" % other)
	var cell := layout.to_absolute(mine.origin)
	var switched := await _model.set_blueprint(cell, other)
	_check(switched.is_ok(), "set recipe -> ok (error: %s)" % _code(switched))
	await _wait_until(func() -> bool: return layout.module(mine.module_id).blueprint == other, 8000)
	_check(layout.module(mine.module_id).blueprint == other, "layout shows the new recipe")
	var back := await _model.set_blueprint(cell, before)
	_check(back.is_ok(), "set the old recipe again -> ok (error: %s)" % _code(back))
	await _wait_until(func() -> bool: return layout.module(mine.module_id).blueprint == before, 8000)
	_check(layout.module(mine.module_id).blueprint == before, "layout shows the old recipe again (%s)" % before)


## The Blueprints tab's batch: two new mines (under construction, without a blueprint) join the
## "None" group of the mines; one bestEffort batch (BlueprintGroups.ops) sets a blueprint on the
## whole group, plus one op on a cell without a hull that must be refused on its own. The layout
## must show the blueprint on both; then everything goes back (mines and hulls removed, any older
## mine of the group without a blueprint again), so the account is as before.
func _check_blueprint_batch(layout: StructureLayout) -> void:
	# A corridor next to the colony and the two mines on its sides (staff needs a corridor).
	var spot := _corridor_spot(layout)
	if spot.size() < 4:
		print("SKIP  blueprint batch (no free spot next to the colony)")
		return
	var corridor: Vector3i = spot[0]
	var spots: Array[Vector3i] = [spot[2], spot[3]]
	var hull_item := Services.definitions.hull(HULL).item
	var mine_item := Services.definitions.module("MINE").item
	var hulls_before := _units(hull_item)
	var mines_before := _units(mine_item)
	var corridor_cell := layout.to_absolute(corridor)
	var build: Array[Dictionary] = [{"op": "placeHull", "hullType": HULL, "x": corridor_cell.x, "y": corridor_cell.y,
		"z": corridor_cell.z}]
	for local: Vector3i in spots:
		var cell := layout.to_absolute(local)
		build.append({"op": "placeHull", "hullType": HULL, "x": cell.x, "y": cell.y, "z": cell.z})
	for local: Vector3i in spots:
		var cell := layout.to_absolute(local)
		build.append({"op": "placeModule", "moduleType": "MINE", "x": cell.x, "y": cell.y, "z": cell.z, "rotation": 0})
	var built := await _model.send_ops(build)
	_check(built.is_ok(), "blueprints: a corridor and two hulls with a mine each -> ok (error: %s)" % _code(built))
	if not built.is_ok():
		return
	var both_there := func() -> bool:
		return layout.module_at(spots[0]) != null and layout.module_at(spots[1]) != null
	await _wait_until(both_there, 8000)
	var new_ids: Array[int] = []
	for local: Vector3i in spots:
		var placed := layout.module_at(local)
		if placed != null:
			new_ids.append(placed.module_id)
	_check(new_ids.size() == 2, "blueprints: layout shows both new mines")

	var rows := BlueprintGroups.rows(layout.modules(), Services.definitions, _model.idle_reasons)
	var mines: BlueprintGroups.TypeRow = null
	for row: BlueprintGroups.TypeRow in rows:
		if row.module_type == "MINE":
			mines = row
	var none := mines.group("") if mines != null else null
	var in_group: Array[int] = []
	if none != null:
		for placed: StructureLayout.Module in none.modules:
			in_group.append(placed.module_id)
	_check(none != null and new_ids.size() == 2 and in_group.has(new_ids[0]) and in_group.has(new_ids[1]) and none.building >= 2,
		"blueprints: the new mines are in the None group, under construction (%d in it, %d building)" % [
			in_group.size(), none.building if none != null else 0])
	if none != null and new_ids.size() == 2:
		var target := "IRON_EXTRACTION" if _model.usable_blueprints.has("IRON_EXTRACTION") else ""
		for recipe: GameDefinitions.BlueprintDef in Services.definitions.blueprints_for("MINE"):
			if target.is_empty() and _model.usable_blueprints.has(recipe.key):
				target = recipe.key
		var ops := BlueprintGroups.ops(none, target, layout)
		# One op on a cell outside the colony: bestEffort refuses it alone.
		var outside := layout.to_absolute(Vector3i(-40, -40, 0))
		ops.append({"op": "setBlueprint", "x": outside.x, "y": outside.y, "z": outside.z, "blueprint": target})
		var sent := await _model.set_blueprints(ops)
		_check(sent.is_ok(), "blueprints: bestEffort batch of %d -> ok (error: %s)" % [ops.size(), _code(sent)])
		var outcome := BlueprintGroups.outcome(sent.data.get("results") if sent.is_ok() else null)
		_check(outcome.applied == ops.size() - 1 and outcome.refused == 1,
			"blueprints: %d set, %d refused (%s)" % [outcome.applied, outcome.refused, ", ".join(outcome.codes())])
		var both_set := func() -> bool:
			for id: int in new_ids:
				var placed := layout.module(id)
				if placed == null or placed.blueprint != target:
					return false
			return true
		await _wait_until(both_set, 8000)
		var set_ok: bool = both_set.call()
		_check(set_ok, "blueprints: layout shows %s on both new mines" % target)
		# Older mines of the group lose the blueprint again.
		var older := BlueprintGroups.Group.new()
		for id: int in in_group:
			if not new_ids.has(id) and layout.module(id) != null:
				older.modules.append(layout.module(id))
		if not older.modules.is_empty():
			var back := await _model.set_blueprints(BlueprintGroups.ops(older, "", layout))
			_check(back.is_ok() and BlueprintGroups.outcome(back.data.get("results")).refused == 0,
				"blueprints: %d older mine(s) without a blueprint again" % older.modules.size())
	var removal: Array[Dictionary] = []
	for local: Vector3i in spots:
		var cell := layout.to_absolute(local)
		removal.append({"op": "removeModule", "x": cell.x, "y": cell.y, "z": cell.z})
	for local: Vector3i in spots:
		var cell := layout.to_absolute(local)
		removal.append({"op": "removeHull", "x": cell.x, "y": cell.y, "z": cell.z})
	removal.append({"op": "removeHull", "x": corridor_cell.x, "y": corridor_cell.y, "z": corridor_cell.z})
	var removed := await _model.send_ops(removal)
	_check(removed.is_ok(), "blueprints: mines and hulls removed -> ok (error: %s)" % _code(removed))
	await _wait_until(func() -> bool: return layout.hull_at(spots[0]).is_empty() and layout.hull_at(spots[1]).is_empty(), 8000)
	await _wait_until(func() -> bool: return _units(hull_item) == hulls_before and _units(mine_item) == mines_before, 8000)
	_check(_units(hull_item) == hulls_before and _units(mine_item) == mines_before,
		"blueprints: store as before (hulls %d, mines %d)" % [_units(hull_item), _units(mine_item)])


## Free cells next to the colony at ground level (local): [corridor next to the colony, the cell
## further out, the two cells on the corridor's sides]; empty when there is no such spot.
func _corridor_spot(layout: StructureLayout) -> Array[Vector3i]:
	var none: Array[Vector3i] = []
	for cell: Vector3i in layout.hull_cells():
		if cell.z != 0:
			continue
		for step: Vector3i in [Vector3i(1, 0, 0), Vector3i(0, -1, 0), Vector3i(-1, 0, 0), Vector3i(0, 1, 0)]:
			var corridor: Vector3i = cell + step
			var side := Vector3i(step.y, step.x, 0)
			var result: Array[Vector3i] = [corridor, corridor + step, corridor + side, corridor - side]
			var free := true
			for spot: Vector3i in result:
				if not layout.hull_at(spot).is_empty():
					free = false
			if free:
				return result
	return none


## Discards one unit of iron (the starter colony mines it) and reads the log afterwards.
func _check_discard_and_log() -> void:
	var before := _units("IRON")
	var discarded := await _model.discard("IRON", Services.definitions.fixed_point_scale)
	_check(discarded.is_ok(), "discard 1 iron -> ok (error: %s)" % _code(discarded))
	_check(_units("IRON") <= before, "store: iron did not grow by the discard (%d -> %d)" % [before, _units("IRON")])
	var too_much := await _model.discard("ALUMINUM_PLATE", 1000000 * Services.definitions.fixed_point_scale)
	_check(_code(too_much) == "INSUFFICIENT_STOCK", "discarding more than there is -> INSUFFICIENT_STOCK (got %s)" % _code(too_much))

	var answer := await Services.api.get_ndjson("/v2/structures/%d/logs?limit=20" % _model.structure_id)
	var page := StructureLog.from_stream(answer.stream) if answer.is_ok() else null
	_check(page != null and page.complete, "log loaded (%d entries)" % (page.entries.size() if page != null else -1))
	if page == null or page.entries.is_empty():
		return
	var newest := page.entries[0]
	var items := StructureLog.items_of(newest)
	var first_item: String = items[0][0] if not items.is_empty() else ""
	_check(newest.type == "discarded" and first_item == "IRON",
		"newest log entry is the discard (%s)" % newest.type)
	var types := PackedStringArray()
	for entry: StructureLog.Entry in page.entries:
		types.append(entry.type)
	_check(types.has("hullsPlaced") and types.has("blueprintSet"), "log also shows this run's building: %s" % ", ".join(types))
	var panel := LogPanel.new()
	var unknown := 0
	for entry: StructureLog.Entry in page.entries:
		if panel.describe(entry).is_empty():
			unknown += 1
	panel.free()
	_check(unknown == 0, "every log entry has a sentence (%d without)" % unknown)


## Hull shapes: a 3×2 rectangle from the colony's edge outwards — its first column lies on the
## colony and is ignored — goes to the server as one atomic batch in the plan's order. Every new
## hull must join the colony, the store must lose exactly that many hulls, and the layout must show
## them; then they are removed again (the account is as before).
func _check_shape(layout: StructureLayout) -> void:
	var local := _shape_corner(layout)
	if local == Vector3i(-9999, 0, 0):
		print("SKIP  shape (no free 2×2 next to the colony)")
		return
	var start := layout.to_absolute(local)
	# The biome decides the environment of the ground level: wait for the ground there.
	_model.ensure_surface(start)
	await _wait_until(func() -> bool: return not _model.site().biome(start.x + 2, start.y + 1).is_empty(), 10000)
	var cells := HullShapes.cells(HullShapes.Shape.RECTANGLE, start, start + Vector3i(2, 1, 0), _model.size_x)
	var guests := _model.guest_layouts()
	var neighbours: Array[StructureLayout] = []
	for structure: ColonyModel in _model.drawn_structures():
		if structure != _model and not guests.has(structure.layout):
			neighbours.append(structure.layout)
	var plan := HullShapes.plan(cells, layout, guests, neighbours, {}, HULL, Services.definitions, _model.site())
	print("shape: %s from %s: %d new, %d own, %d skipped" % [plan.extent, start, plan.place.size(), plan.own.size(),
		plan.skipped.size()])
	_check(plan.extent == Vector2i(3, 2) and plan.own.size() == 2, "shape plan: 3 × 2, the colony's two cells ignored")
	_check(not plan.place.is_empty(), "shape plan: new hulls to place (%d)" % plan.place.size())
	var hull_item := Services.definitions.hull(HULL).item
	var before := _units(hull_item)
	_check(plan.buildable(before), "shape plan fits the store (%d new, %d in store)" % [plan.place.size(), before])
	if not plan.buildable(before):
		return
	var placed := await _model.send_ops(HullShapes.place_ops(HULL, plan.place))
	_check(placed.is_ok(), "shape -> ok in one atomic batch (error: %s)" % _code(placed))
	if not placed.is_ok():
		return
	var results: Array = placed.data.get("results") if typeof(placed.data.get("results")) == TYPE_ARRAY else []
	var joined := 0
	for entry: Variant in results:
		var result := Wire.as_dict(entry)
		if result.get("ok") == true and Wire.as_string(result.get("kind")) == "hullPlaced" \
				and Wire.as_int(result.get("structureId")) == _model.structure_id:
			joined += 1
	_check(joined == plan.place.size(), "server: every new hull joined the colony (%d of %d)" % [joined, plan.place.size()])
	var all_there := func() -> bool:
		for cell: Vector3i in plan.place:
			if layout.hull_at(layout.to_local(cell)) != HULL:
				return false
		return true
	await _wait_until(all_there, 8000)
	var there: bool = all_there.call()
	_check(there, "layout shows the shape's hulls")
	await _wait_until(func() -> bool: return _units(hull_item) == before - plan.place.size(), 8000)
	_check(_units(hull_item) == before - plan.place.size(),
		"store: %d hulls less (%d -> %d)" % [plan.place.size(), before, _units(hull_item)])
	# The same shape again: every cell is own now, nothing to place.
	var again := HullShapes.plan(cells, layout, guests, neighbours, {}, HULL, Services.definitions, _model.site())
	_check(again.place.is_empty() and again.own.size() == 2 + plan.place.size(),
		"the same shape again: nothing new (%d own)" % again.own.size())
	# Take them down again, last placed first.
	var removal: Array[Dictionary] = []
	for index: int in range(plan.place.size() - 1, -1, -1):
		var cell := plan.place[index]
		removal.append({"op": "removeHull", "x": cell.x, "y": cell.y, "z": cell.z})
	var removed := await _model.send_ops(removal)
	_check(removed.is_ok(), "remove the shape's hulls -> ok (error: %s)" % _code(removed))
	var all_gone := func() -> bool:
		for cell: Vector3i in plan.place:
			if not layout.hull_at(layout.to_local(cell)).is_empty():
				return false
		return true
	await _wait_until(all_gone, 8000)
	var gone: bool = all_gone.call()
	_check(gone, "layout: the shape's hulls are gone")
	await _wait_until(func() -> bool: return _units(hull_item) == before, 8000)
	_check(_units(hull_item) == before, "store: hulls back (%d)" % _units(hull_item))


## A ground-level hull whose northern neighbour is a hull too, with the 2×2 east of both free (local).
func _shape_corner(layout: StructureLayout) -> Vector3i:
	for cell: Vector3i in layout.hull_cells():
		if cell.z != 0 or layout.hull_at(cell + Vector3i(0, 1, 0)).is_empty():
			continue
		var free := true
		for step: Vector3i in [Vector3i(1, 0, 0), Vector3i(2, 0, 0), Vector3i(1, 1, 0), Vector3i(2, 1, 0)]:
			if not layout.hull_at(cell + step).is_empty():
				free = false
		if free:
			return cell
	return Vector3i(-9999, 0, 0)


## A free field beside the colony's ground level where MODULE on a new HULL gets `wanted` from the
## paths (OK: it reaches a corridor; NO_CORRIDOR: it would not). (-9999, 0, 0) when none does.
func _free_neighbour(layout: StructureLayout, wanted: BuildRules.Verdict) -> Vector3i:
	var ground := layout.ground_level()
	for cell: Vector3i in layout.hull_cells():
		if cell.z != ground:
			continue
		for step: Vector3i in [Vector3i(1, 0, 0), Vector3i(0, -1, 0), Vector3i(-1, 0, 0), Vector3i(0, 1, 0)]:
			var next := cell + step
			if layout.hull_at(next).is_empty() and _module_on_new_hull(layout, next) == wanted:
				return next
	return Vector3i(-9999, 0, 0)


## What the paths say about MODULE on a new HULL at a local field (hull first, then the module).
func _module_on_new_hull(layout: StructureLayout, cell: Vector3i) -> BuildRules.Verdict:
	var grid := PathAccess.grid_of(layout, Services.definitions)
	grid.hulls[cell] = Services.definitions.hull(HULL).module_positioning == "INDOOR"
	return PathAccess.reckon(grid).check_place_module(Services.definitions, MODULE, cell).verdict


## The layout header's `access` (draft.29) against this client's own reckoning of the paths.
func _check_access(layout: StructureLayout) -> void:
	var access := PathAccess.of(layout, Services.definitions)
	var reported := layout.access
	_check(reported != null, "layout header has access")
	if reported == null:
		return
	print("COLONY access server: ground %d, entrances %s, levels %s, unreachable %s" % [reported.ground, reported.entrances,
		reported.levels, reported.unreachable_modules])
	print("COLONY access client: ground %d, entrances %s, levels %s, unreachable %s" % [access.ground(), access.entrances,
		access.levels, access.unconnected.keys()])
	_check(access.agrees_with(reported), "client paths agree with the server's access")


## A staffed module on a new hull without any corridor beside it: the client preview says
## NO_CORRIDOR and the server NOT_CONNECTED. Takes the hull down again.
func _check_not_connected(layout: StructureLayout) -> void:
	var local := _free_neighbour(layout, BuildRules.Verdict.NO_CORRIDOR)
	if local.x == -9999:
		print("SKIP  not connected (every free field beside the colony touches a corridor)")
		return
	var cell := layout.to_absolute(local)
	var hull := await _model.send_ops([{"op": "placeHull", "hullType": HULL, "x": cell.x, "y": cell.y, "z": cell.z}])
	_check(hull.is_ok(), "hull for the lonely module at %s -> ok (error: %s)" % [cell, _code(hull)])
	if not hull.is_ok():
		return
	await _wait_until(func() -> bool: return not layout.hull_at(local).is_empty(), 8000)
	var preview := PathAccess.of(layout, Services.definitions).check_place_module(Services.definitions, MODULE, local)
	var refused := await _model.send_ops([{"op": "placeModule", "moduleType": MODULE, "x": cell.x, "y": cell.y, "z": cell.z, "rotation": 0}])
	_check(preview.verdict == BuildRules.Verdict.NO_CORRIDOR and _code(refused) == "NOT_CONNECTED",
		"module without corridor: preview and server agree (preview %s, server %s)" % [
			BuildRules.Verdict.keys()[preview.verdict], _code(refused)])
	if refused.is_ok():
		await _model.send_ops([{"op": "removeModule", "x": cell.x, "y": cell.y, "z": cell.z}])
	var removed := await _model.send_ops([{"op": "removeHull", "x": cell.x, "y": cell.y, "z": cell.z}])
	_check(removed.is_ok(), "remove the lonely hull -> ok (error: %s)" % _code(removed))
	await _wait_until(func() -> bool: return layout.hull_at(local).is_empty(), 8000)
