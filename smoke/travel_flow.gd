class_name TravelFlow
extends Node
## End-to-end check of trips against the server, with its own account (tools/dev-account.cjs
## --account travel → .local/travel-account.json; a new account gets 1000 of every item). Builds
## what is missing next to the home base: a vehicle (STARTER + WHEEL, PLATFORM_OUTDOOR + solar)
## and a ship (thruster, solar, INTERSTELLAR_NAVIGATION with two tier-1 robots, storage with
## hydrogen) on docks. Then:
## - the ship flies into the orbit of its body (if it is not there yet) and docks on the base again;
## - the vehicle drives to a free site with a waypoint and back onto the base's docks;
## quotes are compared with the client's check (a free site, one on the base).
## Each arrival is awaited through the event channel and checked in the fleet. Trips take real
## minutes (launch and landing about 4.5 min each for the ship): run with a long timeout.
##
## Root script of smoke/travel_flow.tscn; run through tools\colony-smoke.ps1 -Scene travel_flow.

const ACCOUNT := "res://.local/travel-account.json"
const UP := Vector3i(0, 0, 1)
## How long one trip may take beyond its arrival time before the check fails (ms).
const ARRIVAL_GRACE := 60000

var _failures := 0
var _fleet: FleetModel
var _base: ColonyModel


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
		await get_tree().create_timer(0.25).timeout
	return condition.call()


func _run() -> void:
	await get_tree().process_frame
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(ACCOUNT)))
	if account.is_empty():
		print("FAIL  no travel account (node tools/dev-account.cjs --account travel /v2/me)")
		get_tree().quit(2)
		return
	print("server: ", Services.server.base)
	var signed_in := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	_check(signed_in == null, "sign in with the travel account")
	if signed_in != null:
		get_tree().quit(1)
		return
	await _wait_until(func() -> bool: return Services.definitions != null, 15000)
	_fleet = FleetModel.new()
	add_child(_fleet)
	await _reload_fleet()
	_check(_fleet.loaded, "fleet loaded: %d structures" % _fleet.fleet.size())

	_base = ColonyModel.new()
	add_child(_base)
	var failed: Array[ApiError] = []
	_base.load_failed.connect(func(error: ApiError) -> void: failed.append(error))
	_base.load_home()
	await _wait_until(func() -> bool: return _base.inventory != null or not failed.is_empty(), 20000)
	_check(failed.is_empty() and _base.layout.hull_count() > 0, "home base loaded: %d hulls at %s" % [
		_base.layout.hull_count(), _base.layout.offset])
	if not failed.is_empty():
		_finish()
		return

	var vehicle := _find(Fleet.GROUND_DRIVE)
	var ship := _find(Fleet.SPACE_DRIVE)
	if vehicle == null or ship == null:
		await _build_fleet(vehicle == null, ship == null)
		await _reload_fleet()
		vehicle = _find(Fleet.GROUND_DRIVE)
		ship = _find(Fleet.SPACE_DRIVE)
	_check(vehicle != null and ship != null, "a vehicle and a ship exist")
	# The ship first: it needs the 2×2 docks, the vehicle fits on the row beside them.
	if ship != null:
		await _fly(ship.structure_id)
	if vehicle != null:
		await _drive(vehicle.structure_id)
	_finish()


func _find(capability: String) -> Fleet.Entry:
	for entry: Fleet.Entry in _fleet.fleet.entries():
		if entry.capabilities.has(capability):
			return entry
	return null


func _reload_fleet() -> void:
	var done: Array[bool] = []
	var on_changed := func() -> void: done.append(true)
	_fleet.changed.connect(on_changed, CONNECT_ONE_SHOT)
	_fleet.reload()
	await _wait_until(func() -> bool: return not done.is_empty(), 20000)


## A layout of one structure, freshly loaded.
func _layout(structure_id: int) -> StructureLayout:
	var answer := await Services.api.get_ndjson("/v2/structures/%d/layout" % structure_id)
	var layout := StructureLayout.new()
	if not answer.is_ok() or not layout.apply(answer.stream):
		return null
	return layout


## Cells (absolute, x wrapped) of every own structure on the base's body except `except`, with
## guests at their place (base + guest offset).
func _taken(except: int) -> Dictionary:
	var layouts: Array[StructureLayout] = []
	for entry: Fleet.Entry in _fleet.fleet.entries():
		if entry.structure_id == except or _fleet.fleet.body_of(entry.structure_id) != _base.body_id:
			continue
		if entry.where() != Fleet.Where.SURFACE and entry.where() != Fleet.Where.DOCKED:
			continue
		var layout := await _layout(entry.structure_id)
		if layout == null:
			continue
		if entry.where() == Fleet.Where.DOCKED:
			var host := _fleet.fleet.find(entry.host_id)
			if host != null:
				layout.base = host.offset
		layouts.append(layout)
	return TravelPlan.taken_cells(layouts, _base.size_x)


# --- building -------------------------------------------------------------------------------

## Builds the vehicle and/or the ship on fresh docks next to the base.
func _build_fleet(vehicle: bool, ship: bool) -> void:
	var host := _base.layout
	if vehicle:
		var row := DockBuild.free_pair(host)
		var first: Vector3i = row[0]
		var second: Vector3i = row[1]
		var built := await _send([_op("placeHull", first, "DOCK"), _op("placeHull", second, "DOCK")])
		_check(built.is_ok(), "vehicle: two docks (error: %s)" % _code(built))
		built = await _send([_op("placeHull", first + UP, "STARTER"), _op("placeHull", second + UP, "PLATFORM_OUTDOOR")])
		_check(built.is_ok(), "vehicle: founded on the docks (error: %s)" % _code(built))
		built = await _send([_op("placeModule", first + UP, "WHEEL"), _op("placeModule", second + UP, "SOLAR_PANEL")])
		_check(built.is_ok(), "vehicle: wheel and solar panel (error: %s)" % _code(built))
		await _base.reload_layout()
	if ship:
		host = await _layout(_base.structure_id)
		_base.layout = host
		var corner := _free_square(host)
		var cells: Array[Vector3i] = [corner, corner + Vector3i(1, 0, 0), corner + Vector3i(0, 1, 0), corner + Vector3i(1, 1, 0)]
		var docks: Array[Dictionary] = []
		for cell: Vector3i in cells:
			docks.append(_op("placeHull", cell, "DOCK"))
		var built := await _send(docks)
		_check(built.is_ok(), "ship: four docks (error: %s)" % _code(built))
		built = await _send([_op("placeHull", cells[0] + UP, "PLATFORM_OUTDOOR"), _op("placeHull", cells[1] + UP, "PLATFORM_OUTDOOR"),
			_op("placeHull", cells[2] + UP, "STARTER"), _op("placeHull", cells[3] + UP, "STARTER")])
		_check(built.is_ok(), "ship: founded on the docks (error: %s)" % _code(built))
		var results: Array = built.data.get("results") if built.is_ok() else []
		var ship_id := Wire.as_int(Wire.as_dict(results[0]).get("structureId")) if not results.is_empty() else 0
		built = await _send([_op("placeModule", cells[0] + UP, "CHEMICAL_THRUSTER"), _op("placeModule", cells[1] + UP, "SOLAR_PANEL"),
			_op("placeModule", cells[2] + UP, "INTERSTELLAR_NAVIGATION"), _op("placeModule", cells[3] + UP, "BASIC_STORAGE")])
		_check(built.is_ok(), "ship: thruster, solar, navigation, storage (error: %s)" % _code(built))
		# Modules are placed in a few seconds (placement time).
		await get_tree().create_timer(8.0).timeout
		var scale := Services.definitions.fixed_point_scale
		var moved := await Services.api.post_json("/v2/structures/%d/transfers" % _base.structure_id, {"guestId": ship_id,
			"direction": "toGuest", "items": [{"resource": "HYDROGEN", "amount": 50 * scale}, {"resource": "ROBOT_T1", "amount": 2 * scale}]})
		_check(moved.is_ok(), "ship: hydrogen and two robots on board (error: %s)" % _code(moved))
		var staffed := await Services.api.put_json("/v2/structures/%d/workforce" % ship_id, {"assignments": [{
			"moduleType": "INTERSTELLAR_NAVIGATION", "humans": [0, 0, 0, 0, 0], "robots": [2, 0, 0, 0, 0],
			"auto": [false, false, false, false, false]}]})
		_check(staffed.is_ok(), "ship: navigation staffed by two robots (error: %s)" % _code(staffed))


func _send(ops: Array[Dictionary]) -> ApiResult:
	return await Services.api.post_json("/v2/bodies/%s/ops" % _base.body_id.uri_encode(), {"mode": "atomic", "ops": ops})


func _op(kind: String, host_cell: Vector3i, type: String) -> Dictionary:
	var at := _base.layout.to_absolute(host_cell)
	var op := {"op": kind, "x": at.x, "y": at.y, "z": at.z}
	if kind == "placeHull":
		op["hullType"] = type
	else:
		op["moduleType"] = type
		op["rotation"] = 0
	return op


## The corner of a free 2×2 square of ground cells touching the base at its side.
static func _free_square(layout: StructureLayout) -> Vector3i:
	for cell: Vector3i in layout.hull_cells():
		if cell.z != 0:
			continue
		for step: Vector3i in [Vector3i(1, 0, 0), Vector3i(0, -2, 0), Vector3i(-2, 0, 0), Vector3i(0, 1, 0)]:
			var corner: Vector3i = cell + step
			var free := true
			for offset: Vector3i in [Vector3i.ZERO, Vector3i(1, 0, 0), Vector3i(0, 1, 0), Vector3i(1, 1, 0)]:
				free = free and layout.hull_at(corner + offset).is_empty()
			if free:
				return corner
	return Vector3i(-3, 0, 0)


# --- trips ----------------------------------------------------------------------------------

func _quote(structure_id: int, request: Dictionary) -> TravelPlan.Quote:
	var answer := await Services.api.post_json("/v2/structures/%d/travel/quote" % structure_id, request)
	_check(answer.is_ok(), "quote answered (error: %s)" % _code(answer))
	return TravelPlan.Quote.from_wire(answer.data) if answer.is_ok() else null


## Starts a trip and waits until the fleet has it arrived where `arrived` says.
func _travel(structure_id: int, request: Dictionary, label: String, arrived: Callable) -> bool:
	var started := await Services.api.post_json("/v2/structures/%d/travel" % structure_id, request)
	_check(started.is_ok(), "%s: started (error: %s)" % [label, _code(started)])
	if not started.is_ok():
		return false
	var motion := TravelMotion.from_wire(started.data.get("motion"))
	_check(motion != null, "%s: the answer carries the motion" % label)
	if motion == null:
		return false
	var now := Services.clock.now_ms()
	print("TRAVEL %s: launch %s, cruise %s, landing %s, arrives in %s, %d legs" % [label,
		TimeFormat.duration(motion.liftoff_at - motion.depart_at), TimeFormat.duration(motion.cruise_end_at - motion.liftoff_at),
		TimeFormat.duration(motion.arrival_at - motion.cruise_end_at), TimeFormat.duration(motion.arrival_at - now), motion.legs.size()])
	await _wait_until(func() -> bool:
		var entry := _fleet.fleet.find(structure_id)
		return entry != null and entry.motion != null, 10000)
	var entry := _fleet.fleet.find(structure_id)
	_check(entry != null and entry.motion != null and entry.is_moving(Services.clock.now_ms()),
		"%s: the fleet knows the trip (travel.started)" % label)
	var budget := maxi(0, motion.arrival_at - Services.clock.now_ms()) + ARRIVAL_GRACE
	var landed := await _wait_until(func() -> bool:
		var current := _fleet.fleet.find(structure_id)
		return current != null and current.motion == null and arrived.call(current), budget)
	if not landed:
		# The event may have been missed: ask the server once.
		await _reload_fleet()
		landed = arrived.call(_fleet.fleet.find(structure_id))
	_check(landed, "%s: arrived (travel.arrived reached the fleet)" % label)
	return landed


func _drive(vehicle_id: int) -> void:
	var layout := await _layout(vehicle_id)
	var entry := _fleet.fleet.find(vehicle_id)
	if layout == null or entry == null:
		_check(false, "drive: vehicle layout")
		return
	var cells := TravelPlan.mover_cells(layout)
	var taken := await _taken(vehicle_id)
	var start := _base.layout.to_absolute(Vector3i.ZERO)
	if entry.where() == Fleet.Where.SURFACE:
		start = entry.offset
	# Onto the base: the client and the server both refuse.
	var base_cell := _base.centre_cell()
	var onto := TravelPlan.origin_for_centre(cells, Vector2i(base_cell.x, base_cell.y))
	var client := TravelPlan.check_site(TravelPlan.site_cells(cells, onto), taken, _base.size_x, _base.size_y)
	var refused := await _quote(vehicle_id, TravelPlan.request(TravelPlan.MODE_GROUND, TravelPlan.surface_target(_base.body_id, onto)))
	_check(client == TravelPlan.Site.OCCUPIED and refused != null and refused.errors.has("CELL_OCCUPIED"),
		"drive onto the base: client %s, server %s" % [TravelPlan.Site.keys()[client], str(refused.errors) if refused != null else "?"])
	# A free site a few fields away, with a waypoint.
	var around := Vector2i(base_cell.x + 12, base_cell.y + 8)
	var found: Variant = TravelPlan.suggest_site(cells, taken, around, _base.size_x, _base.size_y)
	_check(found != null, "drive: a free site near %s" % around)
	if found == null:
		return
	var target: Vector2i = found
	var waypoints: Array[Vector2i] = [Vector2i(target.x - 3, target.y + 3)]
	var request := TravelPlan.request(TravelPlan.MODE_GROUND, TravelPlan.surface_target(_base.body_id, target), waypoints)
	var quote := await _quote(vehicle_id, request)
	_check(quote != null and quote.ok and quote.speed_cells_per_minute > 0,
		"drive quote: ok %s, %d fields/min, %s, errors %s" % [quote.ok if quote != null else false,
			quote.speed_cells_per_minute if quote != null else 0, TimeFormat.duration(quote.total_ms()) if quote != null else "?",
			str(quote.errors) if quote != null else "?"])
	print("TRAVEL drive from %s to %s through %s" % [start, target, waypoints])
	var arrived := await _travel(vehicle_id, request, "drive", func(current: Fleet.Entry) -> bool:
		return current != null and current.where() == Fleet.Where.SURFACE and current.offset == Vector3i(target.x, target.y, 0))
	if not arrived:
		return
	# And back onto the base's docks.
	var host := await _layout(_base.structure_id)
	var offset: Variant = TravelPlan.dock_offset(host, cells, vehicle_id) if host != null else null
	_check(offset != null, "dock: room on the base's docks (%s)" % offset)
	if offset == null:
		return
	var dock_request := TravelPlan.request(TravelPlan.MODE_GROUND, TravelPlan.dock_target(_base.structure_id, offset as Vector3i))
	var dock_quote := await _quote(vehicle_id, dock_request)
	_check(dock_quote != null and dock_quote.ok, "dock quote ok (errors %s)" % (str(dock_quote.errors) if dock_quote != null else "?"))
	await _travel(vehicle_id, dock_request, "dock the vehicle", func(current: Fleet.Entry) -> bool:
		return current != null and current.where() == Fleet.Where.DOCKED and current.host_id == _base.structure_id)


func _fly(ship_id: int) -> void:
	var entry := _fleet.fleet.find(ship_id)
	var layout := await _layout(ship_id)
	if entry == null or layout == null:
		_check(false, "fly: ship layout")
		return
	var cells := TravelPlan.mover_cells(layout)
	# Landing on the base is refused by both.
	var taken := await _taken(ship_id)
	var base_cell := _base.centre_cell()
	var onto := TravelPlan.origin_for_centre(cells, Vector2i(base_cell.x, base_cell.y))
	var client := TravelPlan.check_site(TravelPlan.site_cells(cells, onto), taken, _base.size_x, _base.size_y)
	var refused := await _quote(ship_id, TravelPlan.request(TravelPlan.MODE_FLIGHT, TravelPlan.surface_target(_base.body_id, onto)))
	_check(client == TravelPlan.Site.OCCUPIED and refused != null and refused.errors.has("CELL_OCCUPIED"),
		"land on the base: client %s, server %s" % [TravelPlan.Site.keys()[client], str(refused.errors) if refused != null else "?"])
	if entry.where() != Fleet.Where.ORBIT:
		var orbit := TravelPlan.request(TravelPlan.MODE_FLIGHT, TravelPlan.orbit_target(_base.body_id))
		var quote := await _quote(ship_id, orbit)
		var fuel: TravelPlan.FuelRow = null
		if quote != null and not quote.fuel.is_empty():
			fuel = quote.fuel[0]
		_check(quote != null and quote.ok and quote.launch_ms() > 0 and quote.cruise_ms() == 0 and quote.mass_within_limit()
			and fuel != null and not fuel.is_short(),
			"orbit quote: launch %s, mass %d of %d, fuel %s" % [TimeFormat.duration(quote.launch_ms()) if quote != null else "?",
				quote.mass if quote != null else 0, quote.max_mass if quote != null else 0,
				("%s %d of %d" % [fuel.resource, fuel.amount, fuel.self_use]) if fuel != null else "none"])
		var up := await _travel(ship_id, orbit, "into orbit", func(current: Fleet.Entry) -> bool:
			return current != null and current.where() == Fleet.Where.ORBIT and current.body_id == _base.body_id)
		if not up:
			return
	var host := await _layout(_base.structure_id)
	var offset: Variant = TravelPlan.dock_offset(host, cells, ship_id) if host != null else null
	_check(offset != null, "ship: room on the base's docks (%s)" % offset)
	if offset == null:
		return
	var dock := TravelPlan.request(TravelPlan.MODE_FLIGHT, TravelPlan.dock_target(_base.structure_id, offset as Vector3i))
	var dock_quote := await _quote(ship_id, dock)
	_check(dock_quote != null and dock_quote.ok and dock_quote.landing_ms() > 0,
		"dock quote: landing %s, errors %s" % [TimeFormat.duration(dock_quote.landing_ms()) if dock_quote != null else "?",
			str(dock_quote.errors) if dock_quote != null else "?"])
	await _travel(ship_id, dock, "dock the ship", func(current: Fleet.Entry) -> bool:
		return current != null and current.where() == Fleet.Where.DOCKED and current.host_id == _base.structure_id)


func _finish() -> void:
	print("TRAVEL SMOKE %s  (%d failed)" % ["GREEN" if _failures == 0 else "RED", _failures])
	get_tree().quit(0 if _failures == 0 else 1)
