class_name RouteFlow
extends Node
## End-to-end check of routes and storage modes against the server, with its own account
## (`node tools/dev-account.cjs --account routes /v2/me` writes .local/routes-account.json;
## new accounts start with 1000 of every item).
##
## Setup (once per account, kept for the next runs): two guests on docks next to the base, a
## transporter (WHEEL, BASIC_STORAGE, RTG) and a station (WHEEL, RTG), both with some uranium;
## once their modules are finished the station drives off its dock to a spot on the surface.
## Then: switch the transporter's storage to cargo, move goods between supply and cargo, quote
## (a broken and a good route), create a ground route base → station carrying iron, follow the
## events until the iron is delivered, pause, resume, delete. The vehicles stay for the next run.
##
## Root script of smoke/route_flow.tscn (needs the Services autoload); run through
## tools\colony-smoke.ps1 -Scene route_flow -TimeoutSeconds 1800.

const ACCOUNT := "res://.local/routes-account.json"
const HULL := "STARTER"
const UP := Vector3i(0, 0, 1)
const TRANSPORTER_MODULES: Array[String] = ["WHEEL", "BASIC_STORAGE", "RTG"]
const STATION_MODULES: Array[String] = ["WHEEL", "RTG"]
const FUEL_ITEM := "URANIUM"
const FUEL_UNITS := 30
const FUEL_LOW := 15
const CARGO_ITEM := "IRON"
const CARGO_UNITS := 5
## Longest waits (ms): modules (RTG: 10 min), one drive, the route's first deliveries.
const BUILD_WAIT := 15 * 60 * 1000
const DRIVE_WAIT := 4 * 60 * 1000
const ROUTE_WAIT := 8 * 60 * 1000

var _failures := 0
var _model: ColonyModel
var _routes: RouteModel
## Route events seen: [type, data].
var _events: Array[Array] = []


func _ready() -> void:
	_run()


func _check(ok: bool, label: String) -> void:
	if not ok:
		_failures += 1
	print("%s  %s" % ["PASS" if ok else "FAIL", label])


func _note(text: String) -> void:
	print("ROUTE  " + text)


func _code(result: ApiResult) -> String:
	if result.is_ok():
		return "(none)"
	return "transport: " + result.error.message if result.error.is_transport() else result.error.code


func _wait_until(condition: Callable, timeout_ms: int, poll_ms: int = 0) -> bool:
	var deadline := Time.get_ticks_msec() + timeout_ms
	while Time.get_ticks_msec() < deadline:
		if condition.call():
			return true
		if poll_ms > 0:
			await get_tree().create_timer(poll_ms / 1000.0).timeout
		else:
			await get_tree().process_frame
	return condition.call()


func _seconds(ms: int) -> void:
	await get_tree().create_timer(ms / 1000.0).timeout


func _run() -> void:
	await get_tree().process_frame
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(ACCOUNT)))
	if account.is_empty():
		print("FAIL  no routes account (run node tools/dev-account.cjs --account routes /v2/me)")
		get_tree().quit(2)
		return
	print("server: ", Services.server.base)
	var signed_in := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	_check(signed_in == null, "sign in with the routes account")
	if signed_in != null:
		get_tree().quit(1)
		return
	await _wait_until(func() -> bool: return Services.definitions != null, 10000)
	Services.events.event_received.connect(_on_event)

	_model = ColonyModel.new()
	add_child(_model)
	var failed: Array[ApiError] = []
	_model.load_failed.connect(func(error: ApiError) -> void: failed.append(error))
	_model.load_home()
	await _wait_until(func() -> bool: return _model.inventory != null or not failed.is_empty(), 20000)
	_check(failed.is_empty(), "base loaded: %s, %d hulls" % [_model.structure_name, _model.layout.hull_count()])
	if not failed.is_empty():
		_finish()
		return
	_routes = RouteModel.new()
	add_child(_routes)
	_routes.reload()
	await _wait_until(func() -> bool: return _routes.loaded or _routes.error != null, 10000)
	_check(_routes.loaded, "routes listed (%d)" % _routes.book.size())
	# A route left over from an aborted run would keep the transporter busy.
	for old: RoutePlan.Route in _routes.book.routes():
		var gone := await _routes.delete_route(old.route_id)
		_note("left-over route %d deleted: %s" % [old.route_id, _code(gone)])

	var vehicles := await _vehicles()
	var transporter: int = vehicles[0]
	var station: int = vehicles[1]
	if transporter == 0 or station == 0:
		await _build_vehicles()
		vehicles = await _vehicles()
		transporter = vehicles[0]
		station = vehicles[1]
	_check(transporter != 0 and station != 0, "transporter %d and station %d exist" % [transporter, station])
	if transporter == 0 or station == 0:
		_finish()
		return
	var finished := await _wait_finished([transporter, station], BUILD_WAIT)
	_check(finished, "the vehicles' modules are finished")
	if not finished:
		_finish()
		return
	await _supply(transporter)
	await _supply(station)
	if await _anchor_type(station) == "docked":
		await _drive_off(station)
	_check(await _anchor_type(station) == "surface", "the station stands on the surface")

	var cargo_ok := await _check_storage(transporter)
	if cargo_ok:
		await _check_route(transporter, station)
	_finish()


# --- setup ------------------------------------------------------------------------------------

## The transporter (a vehicle with a storage module) and the station (another vehicle); 0 when
## missing.
func _vehicles() -> Array[int]:
	var found: Array[int] = [0, 0]
	var list := await FleetModel.list_structures()
	if not list.is_ok():
		return found
	var items: Array = list.data.get("items")
	for value: Variant in items:
		var summary := Wire.as_dict(value)
		var capabilities: Array = summary.get("capabilities") if typeof(summary.get("capabilities")) == TYPE_ARRAY else []
		if not capabilities.has("GROUND_DRIVE"):
			continue
		var id := Wire.as_int(summary.get("structureId"))
		var layout := await _layout(id)
		var has_storage := false
		for module: StructureLayout.Module in layout.modules():
			has_storage = has_storage or module.module_type == "BASIC_STORAGE"
		if has_storage and found[0] == 0:
			found[0] = id
		elif not has_storage and found[1] == 0:
			found[1] = id
	_note("vehicles: transporter %d, station %d" % [found[0], found[1]])
	return found


func _layout(id: int) -> StructureLayout:
	var layout := StructureLayout.new()
	var answer := await Services.api.get_ndjson("/v2/structures/%d/layout" % id)
	if answer.is_ok():
		layout.apply(answer.stream)
	return layout


## Waits until every module of the structures is finished (layouts loaded every 15 s).
func _wait_finished(ids: Array[int], timeout_ms: int) -> bool:
	var deadline := Time.get_ticks_msec() + timeout_ms
	while true:
		var done := true
		var left := 0
		for id: int in ids:
			var layout := await _layout(id)
			done = done and layout.module_count() > 0
			for module: StructureLayout.Module in layout.modules():
				if module.is_building():
					done = false
					left = maxi(left, module.completes_at - Services.clock.now_ms())
		if done:
			return true
		if Time.get_ticks_msec() > deadline:
			return false
		_note("modules still building, about %d s left" % ceili(left / 1000.0))
		await _seconds(15000)
	return false


## Two guests on six docks in a row next to the base: the transporter on three, the station on
## two, a free dock between them.
func _build_vehicles() -> void:
	var host := _model.layout
	for found: Array in _free_rows(host, 6):
		var row: Array[Vector3i] = []
		row.assign(found)
		var docks: Array[Dictionary] = []
		for cell: Vector3i in row:
			docks.append(_op("placeHull", cell, "DOCK"))
		var placed := await _model.send_ops(docks)
		if not placed.is_ok():
			_note("docks at %s refused: %s" % [row[0], _code(placed)])
			continue
		_check(true, "six docks placed from host cell %s" % row[0])
		await _wait_until(func() -> bool: return host.hull_at(row[5]) == "DOCK", 8000)
		var transporter := await _found_guest([row[0], row[1], row[2]], TRANSPORTER_MODULES)
		var station := await _found_guest([row[4], row[5]], STATION_MODULES)
		_check(transporter and station, "both guests founded with their modules")
		return
	_check(false, "found free cells for the docks")


## Founds a guest on the docks under `cells` (host cells), extends it over all of them and
## places one module on each — the last one on a hull on top of the last cell: the hull below it
## stays free as the guest's entrance (paths, draft.29: the ground level keeps a free hull at its
## edge).
func _found_guest(cells: Array[Vector3i], modules: Array[String]) -> bool:
	var hulls: Array[Dictionary] = []
	for cell: Vector3i in cells:
		hulls.append(_op("placeHull", cell + UP, HULL))
	var founded := await _model.send_ops(hulls)
	if not founded.is_ok():
		_note("guest hulls refused: %s" % _code(founded))
		return false
	var last := cells.size() - 1
	var ops: Array[Dictionary] = [_op("placeHull", cells[last] + UP * 2, HULL)]
	for index: int in cells.size():
		var at := cells[index] + (UP * 2 if index == last else UP)
		ops.append(_op("placeModule", at, modules[index]))
	var placed := await _model.send_ops(ops)
	if not placed.is_ok():
		_note("guest modules refused: %s" % _code(placed))
		return false
	return true


func _op(kind: String, host_cell: Vector3i, type: String = "") -> Dictionary:
	var at := _model.layout.to_absolute(host_cell)
	var op := {"op": kind, "x": at.x, "y": at.y, "z": at.z}
	if kind == "placeHull":
		op["hullType"] = type
	elif kind == "placeModule":
		op["moduleType"] = type
		op["rotation"] = 0
	return op


## Rows of `length` free ground cells leading away from the base.
static func _free_rows(layout: StructureLayout, length: int) -> Array[Array]:
	var rows: Array[Array] = []
	for cell: Vector3i in layout.hull_cells():
		if cell.z != 0:
			continue
		for step: Vector3i in [Vector3i(1, 0, 0), Vector3i(0, -1, 0), Vector3i(-1, 0, 0), Vector3i(0, 1, 0)]:
			var row: Array[Vector3i] = []
			var free := true
			for index: int in range(1, length + 1):
				var at: Vector3i = cell + step * index
				free = free and layout.hull_at(at).is_empty()
				row.append(at)
			if free:
				rows.append(row)
	return rows


## Uranium for the RTG, from the base's store (only while it is docked there).
func _supply(id: int) -> void:
	var inventory := await _inventory(id)
	if inventory == null or inventory.units(FUEL_ITEM, Services.clock.now_ms()) >= FUEL_LOW:
		return
	var guest := _model.guests.get(id) as ColonyModel
	if guest == null:
		_note("structure %d has little uranium and is not docked at the base" % id)
		return
	guest.activate()
	await _wait_until(func() -> bool: return guest.inventory != null, 8000)
	var sent := await _model.transfer_to(guest, FUEL_ITEM, FUEL_UNITS * _model.inventory.scale)
	_check(sent.is_ok(), "uranium to structure %d -> ok (error: %s)" % [id, _code(sent)])


func _inventory(id: int) -> Inventory:
	var answer := await Services.api.get_json("/v2/structures/%d/inventory" % id)
	if not answer.is_ok():
		return null
	return Inventory.from_wire(answer.data, Services.definitions.fixed_point_scale)


func _details(id: int) -> Dictionary:
	var answer := await Services.api.get_json("/v2/structures/%d" % id)
	return answer.data if answer.is_ok() else {}


func _anchor_type(id: int) -> String:
	var details := await _details(id)
	return Wire.as_string(Wire.as_dict(details.get("anchor")).get("type"))


## Drives the station off its dock to a free spot a few cells further out.
func _drive_off(id: int) -> void:
	var guest := _model.guests.get(id) as ColonyModel
	var start := _model.centre_cell()
	if guest != null and guest.layout.hull_count() > 0:
		start = guest.layout.to_absolute(guest.layout.hull_cells()[0])
	var body := _model.body_id
	var away := (start - _model.centre_cell())
	var direction := Vector3i(signi(away.x), signi(away.y), 0)
	if direction == Vector3i.ZERO:
		direction = Vector3i(1, 0, 0)
	for distance: int in [10, 14, 18, 24]:
		for side: int in [0, 4, -4]:
			var target := start + direction * distance + Vector3i(direction.y, direction.x, 0) * side
			var request := {"mode": "ground", "target": {"type": "surface", "bodyId": body, "x": target.x, "y": target.y}}
			var quote := await Services.api.post_json("/v2/structures/%d/travel/quote" % id, request)
			if not quote.is_ok():
				_note("travel quote to %s: %s" % [target, _code(quote)])
				continue
			if quote.data.get("ok") != true:
				_note("travel quote to %s refused: %s" % [target, str(quote.data.get("errors"))])
				continue
			var started := await Services.api.post_json("/v2/structures/%d/travel" % id, request)
			_check(started.is_ok(), "the station drives off to %d, %d (error: %s)" % [target.x, target.y, _code(started)])
			if not started.is_ok():
				return
			var arrived := await _wait_until(func() -> bool: return _seen("travel.arrived", "structureId", id), DRIVE_WAIT, 1000)
			_check(arrived, "travel.arrived for the station")
			await _seconds(2000)
			return
	_check(false, "a free spot for the station")


# --- storage modes ----------------------------------------------------------------------------

## Switches the transporter's storage to cargo and moves goods into the cargo hold and back.
func _check_storage(id: int) -> bool:
	var vehicle := ColonyModel.new()
	vehicle.structure_id = id
	add_child(vehicle)
	vehicle.reload_layout()
	await _wait_until(func() -> bool: return vehicle.layout.module_count() > 0, 8000)
	await vehicle.reload_inventory()
	var storage := vehicle.storage_modules()
	_check(storage.size() == 1, "the transporter has one storage module")
	if storage.is_empty() or vehicle.inventory == null:
		return false
	var module := storage[0]
	_note("storage module %d is %s; cargo %d of %d" % [module.module_id, module.storage_mode,
		vehicle.inventory.transport_used, vehicle.inventory.transport_capacity])
	if module.storage_mode != StorePanel.AREA_CARGO:
		var switched := await vehicle.set_storage_mode(module.module_id, StorePanel.AREA_CARGO)
		_check(switched.is_ok(), "storage switched to cargo -> ok (error: %s)" % _code(switched))
	@warning_ignore("integer_division")
	_check(vehicle.inventory.transport_capacity > 0, "the transporter has a cargo hold (%d units)" % (
		vehicle.inventory.transport_capacity / vehicle.inventory.scale))
	var refused := await vehicle.set_storage_mode(999999999, StorePanel.AREA_CARGO)
	_check(_code(refused) == "MODULE_NOT_FOUND" or _code(refused) == "NOT_A_STORAGE_MODULE",
		"switching a module that is not there is refused (%s)" % _code(refused))
	var scale := vehicle.inventory.scale
	var before := vehicle.inventory.units(FUEL_ITEM, Services.clock.now_ms())
	var into_cargo := await vehicle.move_storage(StorePanel.AREA_SUPPLY, FUEL_ITEM, 2 * scale)
	_check(into_cargo.is_ok() and vehicle.inventory.cargo_units(FUEL_ITEM) == 2,
		"2 uranium moved into the cargo hold (error: %s, cargo %d)" % [_code(into_cargo), vehicle.inventory.cargo_units(FUEL_ITEM)])
	var too_much := await vehicle.move_storage(StorePanel.AREA_CARGO, FUEL_ITEM, 50 * scale)
	_check(_code(too_much) == "INSUFFICIENT_STOCK", "moving more than the hold has -> INSUFFICIENT_STOCK (%s)" % _code(too_much))
	var back := await vehicle.move_storage(StorePanel.AREA_CARGO, FUEL_ITEM, 2 * scale)
	_check(back.is_ok() and vehicle.inventory.cargo_units(FUEL_ITEM) == 0
		and vehicle.inventory.units(FUEL_ITEM, Services.clock.now_ms()) >= before - 1,
		"and back into the own supply (error: %s)" % _code(back))
	vehicle.queue_free()
	return vehicle.inventory.transport_capacity > 0


# --- the route --------------------------------------------------------------------------------

func _check_route(transporter: int, station: int) -> void:
	var base := _model.structure_id
	var station_before := await _inventory(station)
	var iron_before := station_before.units(CARGO_ITEM, Services.clock.now_ms()) if station_before != null else -1

	# A broken route: the transporter as its own station.
	var broken := RoutePlan.Draft.new()
	broken.transporter_id = transporter
	broken.station_a = base
	broken.station_b = transporter
	var refused := await _routes.quote(broken)
	var refused_codes := _code(refused)
	if refused.is_ok():
		refused_codes = str(refused.data.get("errors"))
	var said_ok: bool = refused.is_ok() and refused.data.get("ok") == true
	_check(not said_ok, "quote with the transporter as station is refused: %s" % refused_codes)

	var draft := RoutePlan.Draft.new()
	draft.name = "Smoke ore run"
	draft.transporter_id = transporter
	draft.station_a = base
	draft.station_b = station
	draft.start_at = RoutePlan.A
	draft.rules_ab.append(RoutePlan.Rule.make(CARGO_ITEM, RoutePlan.INTO_CARGO, CARGO_UNITS))
	draft.rules_ab.append(RoutePlan.Rule.make(FUEL_ITEM, RoutePlan.INTO_SUPPLY, FUEL_UNITS))
	var answer := await _routes.quote(draft)
	_check(answer.is_ok(), "route quote answers (error: %s)" % _code(answer))
	if not answer.is_ok():
		return
	var quote := RoutePlan.Quote.from_wire(answer.data)
	_note("quote: ok %s, errors %s, kind %s, stop A %s (%s), stop B %s (%s), start %s, first trip %d ms" % [
		quote.ok, quote.errors, quote.kind, quote.stop_a, quote.has_stop_a, quote.stop_b, quote.has_stop_b,
		quote.start_at, quote.trip_ms])
	_check(quote.ok, "the route can start (errors %s)" % quote.errors)
	_check(quote.kind == RoutePlan.KIND_GROUND, "it is a ground route (%s)" % quote.kind)
	_check(quote.has_stop_a and quote.has_stop_b, "the server suggests stop sites at both stations")
	if not quote.ok:
		return

	var created := await _routes.create(draft)
	_check(created.is_ok(), "route created -> ok (error: %s)" % _code(created))
	if not created.is_ok():
		return
	var route_id := Wire.as_int(created.data.get("routeId"))
	var route := _routes.book.find(route_id)
	_check(route != null and route.state == "travelling" and route.transporter_id == transporter,
		"the new route travels (state %s)" % (route.state if route != null else "?"))
	await _wait_until(func() -> bool: return _seen("route.created", "", 0), 10000)
	_check(_seen("route.created", "", 0), "route.created arrived")

	# First trip to A, load the iron, drive to B and unload it there.
	var delivered := await _wait_until(func() -> bool: return _seen_at("route.arrived", station), ROUTE_WAIT, 2000)
	_check(_seen("route.departed", "", 0), "route.departed arrived")
	_check(_seen_at("route.arrived", base), "route.arrived at the base")
	_check(delivered, "route.arrived at the station")
	for event: Array in _events:
		_note("event %s %s" % [event[0], JSON.stringify(event[1]).left(300)])
	await _seconds(3000)
	route = _routes.book.find(route_id)
	if route != null:
		_note("route now: state %s, station %s, trips %d, cycles %d, delivered %s, cargo A %s, B %s" % [
			route.state, route.station, route.trips, route.cycles, route.delivered, route.cargo_for_a, route.cargo_for_b])
		_check(route.trips >= 2, "at least two trips counted (%d)" % route.trips)
		var shipped := 0
		for pair: Array in route.delivered:
			if pair[0] == CARGO_ITEM:
				shipped += Wire.as_int(pair[1])
		_check(shipped >= CARGO_UNITS * _model.inventory.scale, "the route counts the delivered iron (%d µ)" % shipped)
	var station_after := await _inventory(station)
	var iron_after := station_after.units(CARGO_ITEM, Services.clock.now_ms()) if station_after != null else -1
	_check(iron_after >= iron_before + CARGO_UNITS, "the station's store holds %d more iron (%d -> %d)" % [
		CARGO_UNITS, iron_before, iron_after])

	# Pause (at the next station while travelling), resume, delete.
	var paused := await _routes.set_paused(route_id, true)
	route = _routes.book.find(route_id)
	_check(paused.is_ok() and route != null and (route.stopping or route.is_paused()),
		"pause -> ok, stopping %s / paused %s (error: %s)" % [route.stopping if route != null else false,
			route.is_paused() if route != null else false, _code(paused)])
	var stood := await _wait_until(func() -> bool: return _seen("route.paused", "routeId", route_id), ROUTE_WAIT / 2, 2000)
	_check(stood, "route.paused arrived")
	route = _routes.book.find(route_id)
	_check(route != null and route.status() == RoutePlan.Status.PAUSED, "the route is paused")
	var renamed := await _routes.update_rules(route_id, draft.rules_ba, draft.rules_ab, "Smoke reverse run")
	route = _routes.book.find(route_id)
	_check(renamed.is_ok() and route != null and route.rules_ab.size() == 0 and route.rules_ba.size() == 2
		and route.name == "Smoke reverse run", "rules of both directions replaced, renamed (error: %s)" % _code(renamed))
	var resumed := await _routes.set_paused(route_id, false)
	_check(resumed.is_ok(), "resume -> ok (error: %s)" % _code(resumed))
	if resumed.is_ok():
		await _seconds(3000)
		var stop_again := await _routes.set_paused(route_id, true)
		_check(stop_again.is_ok(), "pause again -> ok (error: %s)" % _code(stop_again))
		await _wait_until(func() -> bool: return _routes.book.find(route_id) != null \
			and _routes.book.find(route_id).is_paused(), ROUTE_WAIT / 2, 2000)
	var deleted := await _routes.delete_route(route_id)
	_check(deleted.is_ok(), "delete -> ok, at once: %s (error: %s)" % [str(deleted.data.get("deleted")), _code(deleted)])
	if deleted.is_ok() and deleted.data.get("deleted") != true:
		await _wait_until(func() -> bool: return _seen("route.deleted", "routeId", route_id), ROUTE_WAIT / 2, 2000)
	await _wait_until(func() -> bool: return _routes.book.find(route_id) == null, 10000)
	_check(_routes.book.find(route_id) == null, "the route is gone")
	var transporter_inventory := await _inventory(transporter)
	if transporter_inventory != null:
		_note("left in the transporter's cargo hold: %s" % transporter_inventory.cargo_keys())


func _on_event(event: SseEvent) -> void:
	if event.type.begins_with("route.") or event.type.begins_with("travel."):
		_events.append([event.type, Wire.parse_object(event.data)])


## Whether an event of `type` was seen (with `field` == `value` when a field is given).
func _seen(type: String, field: String, value: int) -> bool:
	for event: Array in _events:
		if event[0] != type:
			continue
		var data: Dictionary = event[1]
		if field.is_empty() or Wire.as_int(data.get(field)) == value:
			return true
	return false


func _seen_at(type: String, station: int) -> bool:
	return _seen(type, "stationId", station)


func _finish() -> void:
	print("ROUTE SMOKE %s  (%d failed)" % ["GREEN" if _failures == 0 else "RED", _failures])
	get_tree().quit(0 if _failures == 0 else 1)
