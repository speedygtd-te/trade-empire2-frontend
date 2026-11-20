class_name FleetFlow
extends Node
## End-to-end check of fleets (draft.33) against the server, with its own account
## (tools/dev-account.cjs --account fleets → .local/fleets-account.json; a new account gets 1000
## of every item). Builds what is missing next to the home base: two ships on docks (thruster,
## solar, INTERSTELLAR_NAVIGATION with two tier-1 robots, storage) — plenty of hydrogen on the
## first, a little on the second (enough to dock again alone), so the second flies mostly on the
## first one's fuel. Only ships docked at the base take part (a ship left in orbit without fuel
## cannot come back alone). Then:
## - forms a fleet of both (resting docked at the base), checks the member lock (own trip, its
##   quote, own stance), the fleet stance and a rename;
## - quotes the joint flight into the orbit of the home body (pooled fuel: each ship gives in
##   proportion to its stock, so the second gives less than it needs) and starts it; leaving and disbanding are refused while it flies;
## - waits for the arrival (`fleet.arrived` in the client's book), one ship leaves, the fleet is
##   disbanded, and both dock at the base again one after the other (for the next run).
## Trips take real minutes (launch and landing about 4.5 min each): run with a long timeout.
##
## Root script of smoke/fleet_flow.tscn; run through tools\colony-smoke.ps1 -Scene fleet_flow.

const ACCOUNT := "res://.local/fleets-account.json"
const UP := Vector3i(0, 0, 1)
## How long a trip may take beyond its arrival time before the check fails (ms).
const ARRIVAL_GRACE := 60000
## Hydrogen loaded onto the first ship (whole units; more if the pooled quote asks for it).
const FUEL := 60
## Hydrogen on the second ship: less than its share, enough to dock alone afterwards.
const LITTLE := 4

var _failures := 0
var _fleet: FleetModel
var _base: ColonyModel
var _events: Array[String] = []


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
	if not await _start():
		return
	await _main()


## Signs in, loads the fleet model and the home base; false when that failed (the run ended).
func _start() -> bool:
	await get_tree().process_frame
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(ACCOUNT)))
	if account.is_empty():
		print("FAIL  no fleets account (node tools/dev-account.cjs --account fleets /v2/me)")
		get_tree().quit(2)
		return false
	print("server: ", Services.server.base)
	var signed_in := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	_check(signed_in == null, "sign in with the fleets account")
	if signed_in != null:
		get_tree().quit(1)
		return false
	Services.events.event_received.connect(func(event: SseEvent) -> void:
		if event.type.begins_with("fleet."):
			_events.append(event.type))
	await _wait_until(func() -> bool: return Services.definitions != null, 15000)
	_fleet = FleetModel.new()
	add_child(_fleet)
	await _reload_fleet()
	_check(_fleet.loaded and _fleet.groups_supported, "structures and fleets loaded: %d structures, %d fleets" % [
		_fleet.fleet.size(), _fleet.groups.size()])

	_base = ColonyModel.new()
	add_child(_base)
	var failed: Array[ApiError] = []
	_base.load_failed.connect(func(error: ApiError) -> void: failed.append(error))
	_base.load_home()
	await _wait_until(func() -> bool: return _base.inventory != null or not failed.is_empty(), 20000)
	_check(failed.is_empty() and _base.layout.hull_count() > 0, "home base loaded: %d hulls" % _base.layout.hull_count())
	if not failed.is_empty():
		_finish()
		return false
	return true


func _main() -> void:
	# Leftovers of an earlier run: wait for a running flight, then disband.
	for group: FleetGroups.Group in _fleet.groups.groups():
		if group.has_command():
			await _wait_until(func() -> bool: return not _fleet.groups.find(group.fleet_id).has_command(),
				group.remaining_ms(Services.clock.now_ms()) + ARRIVAL_GRACE)
		var gone := await _fleet.dissolve_group(group.fleet_id)
		_check(gone.is_ok(), "leftover fleet %d disbanded (error: %s)" % [group.fleet_id, _code(gone)])

	var ships := _ships()
	if ships.size() < 2:
		for _index: int in 2 - ships.size():
			await _build_ship(ships.is_empty() and _index == 0)
		await _reload_fleet()
		ships = _ships()
	_check(ships.size() >= 2, "two ships exist (%d)" % ships.size())
	if ships.size() < 2:
		_finish()
		return
	var first := ships[0].structure_id
	var second := ships[1].structure_id
	# Both must rest at one body; the joint flight then goes into its orbit.
	var body := _fleet.fleet.body_of(first)
	_check(not body.is_empty() and body == _fleet.fleet.body_of(second), "both ships rest at %s" % body)
	var candidates := _fleet.groups.candidates(_fleet.fleet, body, Services.clock.now_ms())
	_check(candidates.size() >= 2, "the client offers both as members (%d candidates)" % candidates.size())

	var group := await _form(first, second)
	if group == null:
		_finish()
		return
	await _locks(group, first)
	await _stance(group)
	await _fly(group, first, second, body)
	await _part(group.fleet_id, first, second)
	await _dock_home(first)
	await _dock_home(second)
	_finish()


## The player's ships docked at the base and resting (a space drive, not the base), by id.
func _ships() -> Array[Fleet.Entry]:
	var result: Array[Fleet.Entry] = []
	var now := Services.clock.now_ms()
	for entry: Fleet.Entry in _fleet.fleet.entries():
		if entry.can_fly() and entry.kind != "base" and entry.where() == Fleet.Where.DOCKED 				and entry.host_id == _base.structure_id and not entry.is_moving(now):
			result.append(entry)
	result.sort_custom(func(a: Fleet.Entry, b: Fleet.Entry) -> bool: return a.structure_id < b.structure_id)
	return result


func _reload_fleet() -> void:
	var done: Array[bool] = []
	var on_changed := func() -> void: done.append(true)
	_fleet.changed.connect(on_changed, CONNECT_ONE_SHOT)
	_fleet.reload()
	await _wait_until(func() -> bool: return not done.is_empty(), 30000)


func _layout(structure_id: int) -> StructureLayout:
	var answer := await Services.api.get_ndjson("/v2/structures/%d/layout" % structure_id)
	var layout := StructureLayout.new()
	if not answer.is_ok() or not layout.apply(answer.stream):
		return null
	return layout


# --- the fleet ------------------------------------------------------------------------------

func _form(first: int, second: int) -> FleetGroups.Group:
	var made := await _fleet.create_group("Smoke fleet", PackedInt64Array([first, second]))
	_check(made.is_ok(), "fleet formed (error: %s)" % _code(made))
	if not made.is_ok():
		return null
	var group := FleetGroups.Group.from_wire(made.data)
	_check(group != null and group.member_ids().size() == 2 and group.is_together() and not group.has_command()
		and group.stance == FleetGroups.STANCE_PEACEFUL,
		"new fleet: %d members at %s, %s, no command" % [group.member_ids().size() if group != null else 0,
			group.location_body_id if group != null else "?", group.stance if group != null else "?"])
	print("FLEET %d \"%s\": inventory %s" % [group.fleet_id, group.name,
		", ".join(group.inventory.map(func(item: FleetGroups.Item) -> String: return "%s %d" % [item.resource, item.self_use]))])
	_check(_fleet.fleet.find(first).fleet_id == group.fleet_id and _fleet.group_of(second) != null,
		"the client knows both members")
	var details := await Services.api.get_json("/v2/structures/%d" % first)
	_check(details.is_ok() and Wire.as_int(details.data.get("fleetId")) == group.fleet_id,
		"StructureResponse.fleetId names the fleet")
	var updated: bool = await _wait_until(func() -> bool: return _events.has("fleet.updated"), 10000)
	_check(updated, "SSE fleet.updated arrived")
	var renamed := await _fleet.rename_group(group.fleet_id, "Smoke Vanguard")
	_check(renamed.is_ok() and _fleet.groups.find(group.fleet_id).name == "Smoke Vanguard",
		"renamed (error: %s)" % _code(renamed))
	return group


## A member takes no trip, route or stance of its own.
func _locks(group: FleetGroups.Group, member: int) -> void:
	var orbit := TravelPlan.request(TravelPlan.MODE_FLIGHT, TravelPlan.orbit_target(group.location_body_id))
	var quote := await Services.api.post_json("/v2/structures/%d/travel/quote" % member, orbit)
	var parsed := TravelPlan.Quote.from_wire(quote.data) if quote.is_ok() else null
	_check(parsed != null and not parsed.ok and parsed.errors.has("FLEET_MEMBER_LOCKED"),
		"member quote names FLEET_MEMBER_LOCKED (%s)" % (str(parsed.errors) if parsed != null else _code(quote)))
	var alone := await Services.api.post_json("/v2/structures/%d/travel" % member, orbit)
	_check(_code(alone) == "FLEET_MEMBER_LOCKED", "member trip refused: %s" % _code(alone))
	var stance := await Services.api.patch_json("/v2/structures/%d/combat" % member, {"stance": "aggressive"})
	_check(_code(stance) == "FLEET_MEMBER_LOCKED", "member stance refused: %s" % _code(stance))


func _stance(group: FleetGroups.Group) -> void:
	var hostile := await _fleet.set_group_combat(group.fleet_id, FleetGroups.STANCE_AGGRESSIVE, "")
	_check(hostile.is_ok() and _fleet.groups.find(group.fleet_id).is_aggressive(),
		"fleet stance aggressive (error: %s)" % _code(hostile))
	var calm := await _fleet.set_group_combat(group.fleet_id, FleetGroups.STANCE_PEACEFUL, "")
	_check(calm.is_ok() and not _fleet.groups.find(group.fleet_id).is_aggressive(),
		"fleet stance peaceful again (error: %s)" % _code(calm))


func _fleet_quote(fleet_id: int, body: String) -> FleetGroups.Quote:
	var answer := await _fleet.quote_group_travel(fleet_id, body)
	_check(answer.is_ok(), "fleet quote answered (error: %s)" % _code(answer))
	return FleetGroups.Quote.from_wire(answer.data) if answer.is_ok() else null


func _fly(group: FleetGroups.Group, first: int, second: int, body: String) -> void:
	var quote := await _fleet_quote(group.fleet_id, body)
	if quote != null and quote.trip.errors.has("INSUFFICIENT_FUEL"):
		# Top the first ship up from the base (it is docked there) and ask again.
		var scale := Services.definitions.fixed_point_scale
		var moved := await Services.api.post_json("/v2/structures/%d/transfers" % _base.structure_id, {"guestId": first,
			"direction": "toGuest", "items": [{"resource": "HYDROGEN", "amount": FUEL * scale}]})
		_check(moved.is_ok(), "more hydrogen on the first ship (error: %s)" % _code(moved))
		quote = await _fleet_quote(group.fleet_id, body)
	if quote == null:
		return
	var rows := PackedStringArray()
	for member: FleetGroups.MemberQuote in quote.members:
		rows.append("%d: warp %d, launch %s, need %s, draws %s, errors %s" % [member.structure_id, member.warp_level,
			TimeFormat.duration(member.launch_ms), str(member.need), str(member.draw), str(member.errors)])
	print("FLEET quote: ok %s, errors %s, warp %d, launch %s, slowest %d, longest launch %d, fuel %s" % [
		quote.trip.ok, str(quote.trip.errors), quote.trip.warp_level, TimeFormat.duration(quote.trip.launch_ms()),
		quote.slowest, quote.longest_launch,
		", ".join(quote.trip.fuel.map(func(row: TravelPlan.FuelRow) -> String: return "%s %d of %d" % [row.resource, row.amount, row.self_use]))])
	for row: String in rows:
		print("FLEET member " + row)
	_check(quote.trip.ok and quote.members.size() == 2 and quote.longest_launch != 0 and quote.trip.launch_ms() > 0,
		"joint quote ok, two members, one launch")
	var low := quote.member(second)
	var high := quote.member(first)
	var supplied := _fleet.groups.find(group.fleet_id).supply_of("HYDROGEN")
	_check(low != null and high != null and low.errors.is_empty()
		and Wire.as_int(low.draw.get("HYDROGEN")) < Wire.as_int(low.need.get("HYDROGEN"))
		and Wire.as_int(high.draw.get("HYDROGEN")) > Wire.as_int(high.need.get("HYDROGEN")),
		"pooled: the low ship gives less than it needs, the full one more")
	var total_draw := 0
	for member: FleetGroups.MemberQuote in quote.members:
		total_draw += Wire.as_int(member.draw.get("HYDROGEN"))
	var total_need := quote.trip.fuel[0].amount if not quote.trip.fuel.is_empty() else -1
	_check(total_draw == total_need and total_need <= supplied,
		"draws add up to the pooled need (%d of %d on board)" % [total_draw, supplied])
	if not quote.trip.ok:
		return

	var started := await _fleet.start_group_travel(group.fleet_id, body)
	_check(started.is_ok(), "joint flight started (error: %s)" % _code(started))
	if not started.is_ok():
		var blocked := FleetGroups.not_ready_members(started.error)
		if not blocked.is_empty():
			print("FLEET not ready: ", blocked)
		return
	var flying := _fleet.groups.find(group.fleet_id)
	_check(flying != null and flying.has_command() and flying.target_body_id() == body,
		"the fleet has its command: arrives in %s" % TimeFormat.duration(flying.remaining_ms(Services.clock.now_ms())))
	var a := _fleet.fleet.find(first)
	var b := _fleet.fleet.find(second)
	_check(a.motion != null and b.motion != null and a.motion.arrival_at == b.motion.arrival_at
		and a.motion.liftoff_at == b.motion.liftoff_at and a.motion.arrival_at == flying.arrival_at,
		"both members share the times (arrival %d)" % flying.arrival_at)
	var burned := 0
	for member: Fleet.Entry in [a, b]:
		for fuel: TravelMotion.Fuel in member.motion.fuel:
			burned += fuel.total
	_check(burned == total_need, "the members' motion.fuel adds up to the need (%d)" % burned)
	print("TRAVEL fleet: launch %s, arrives in %s" % [TimeFormat.duration(a.motion.liftoff_at - a.motion.depart_at),
		TimeFormat.duration(flying.remaining_ms(Services.clock.now_ms()))])
	var departed: bool = await _wait_until(func() -> bool: return _events.has("fleet.departed"), 10000)
	_check(departed, "SSE fleet.departed arrived")
	var leave := await _fleet.leave_group(group.fleet_id, second)
	_check(_code(leave) == "FLEET_HAS_COMMAND", "leaving during the flight refused: %s" % _code(leave))
	var disband := await _fleet.dissolve_group(group.fleet_id)
	_check(_code(disband) == "FLEET_HAS_COMMAND", "disbanding during the flight refused: %s" % _code(disband))

	var budget := flying.remaining_ms(Services.clock.now_ms()) + ARRIVAL_GRACE
	var arrived := await _wait_until(func() -> bool:
		var current := _fleet.groups.find(group.fleet_id)
		return current != null and not current.has_command() and current.location_body_id == body, budget)
	if not arrived:
		await _reload_fleet()
		var current := _fleet.groups.find(group.fleet_id)
		arrived = current != null and not current.has_command()
	_check(arrived and _events.has("fleet.arrived"), "the fleet arrived (fleet.arrived: %s)" % _events.has("fleet.arrived"))
	var in_orbit := func(id: int) -> bool:
		var entry := _fleet.fleet.find(id)
		return entry != null and entry.motion == null and entry.where() == Fleet.Where.ORBIT and entry.body_id == body
	var resting: bool = await _wait_until(func() -> bool:
		var one: bool = in_orbit.call(first)
		var two: bool = in_orbit.call(second)
		return one and two, 20000)
	_check(resting,
		"both members rest in orbit of %s" % body)


func _part(fleet_id: int, first: int, second: int) -> void:
	var leave := await _fleet.leave_group(fleet_id, second)
	_check(leave.is_ok() and not _fleet.groups.find(fleet_id).has_member(second) and _fleet.fleet.find(second).fleet_id == 0,
		"the second ship left (error: %s)" % _code(leave))
	var disband := await _fleet.dissolve_group(fleet_id)
	var said_dissolved: bool = disband.is_ok() and disband.data.get("dissolved") is bool and disband.data.get("dissolved")
	_check(said_dissolved and _fleet.groups.find(fleet_id) == null
		and _fleet.fleet.find(first).fleet_id == 0, "fleet disbanded (error: %s)" % _code(disband))
	var dissolved: bool = await _wait_until(func() -> bool: return _events.has("fleet.dissolved"), 10000)
	_check(dissolved, "SSE fleet.dissolved arrived")


## Docks a ship at the base again (free once more: its own trip works).
func _dock_home(ship_id: int) -> void:
	var layout := await _layout(ship_id)
	var host := await _layout(_base.structure_id)
	if layout == null or host == null:
		_check(false, "dock: layouts")
		return
	var offset: Variant = TravelPlan.dock_offset(host, TravelPlan.mover_cells(layout), ship_id)
	_check(offset != null, "dock %d: room on the base's docks (%s)" % [ship_id, offset])
	if offset == null:
		return
	var request := TravelPlan.request(TravelPlan.MODE_FLIGHT, TravelPlan.dock_target(_base.structure_id, offset as Vector3i))
	var started := await Services.api.post_json("/v2/structures/%d/travel" % ship_id, request)
	_check(started.is_ok(), "dock %d: started alone again (error: %s)" % [ship_id, _code(started)])
	if not started.is_ok():
		return
	var motion := TravelMotion.from_wire(started.data.get("motion"))
	var budget := maxi(0, motion.arrival_at - Services.clock.now_ms()) + ARRIVAL_GRACE if motion != null else ARRIVAL_GRACE
	print("TRAVEL dock %d: arrives in %s" % [ship_id, TimeFormat.duration(budget - ARRIVAL_GRACE)])
	var docked := await _wait_until(func() -> bool:
		var entry := _fleet.fleet.find(ship_id)
		return entry != null and entry.motion == null and entry.where() == Fleet.Where.DOCKED, budget)
	_check(docked, "dock %d: docked at the base" % ship_id)


# --- building -------------------------------------------------------------------------------

## A ship on four fresh docks next to the base (the travel smoke's ship); hydrogen only when
## `fuel`.
func _build_ship(fuel: bool) -> void:
	var host := await _layout(_base.structure_id)
	# A layout read on its own has no place on the body yet: keep the base's.
	host.offset = _base.layout.offset
	host.base = _base.layout.base
	_base.layout = host
	var corner := _free_square(host)
	var cells: Array[Vector3i] = [corner, corner + Vector3i(1, 0, 0), corner + Vector3i(0, 1, 0), corner + Vector3i(1, 1, 0)]
	# The ops run in order: docks touching the base first, or the first one would found a new
	# structure (FOUND_ONLY_ON_DOCK).
	var touching: Array[Vector3i] = []
	var rest: Array[Vector3i] = []
	for cell: Vector3i in cells:
		var near := false
		for step: Vector3i in [Vector3i(1, 0, 0), Vector3i(-1, 0, 0), Vector3i(0, 1, 0), Vector3i(0, -1, 0)]:
			near = near or not host.hull_at(cell + step).is_empty()
		if near:
			touching.append(cell)
		else:
			rest.append(cell)
	var docks: Array[Dictionary] = []
	for cell: Vector3i in touching + rest:
		docks.append(_op("placeHull", cell, "DOCK"))
	var built := await _send(docks)
	_check(built.is_ok(), "ship: four docks at %s, absolute %s (error: %s)" % [corner, _base.layout.to_absolute(corner), _code(built)])
	built = await _send([_op("placeHull", cells[0] + UP, "PLATFORM_OUTDOOR"), _op("placeHull", cells[1] + UP, "PLATFORM_OUTDOOR"),
		_op("placeHull", cells[2] + UP, "STARTER"), _op("placeHull", cells[3] + UP, "STARTER")])
	_check(built.is_ok(), "ship: founded on the docks (error: %s)" % _code(built))
	var results: Array = built.data.get("results") if built.is_ok() else []
	var ship_id := Wire.as_int(Wire.as_dict(results[0]).get("structureId")) if not results.is_empty() else 0
	built = await _send([_op("placeHull", cells[3] + UP * 2, "STARTER"),
		_op("placeModule", cells[0] + UP, "CHEMICAL_THRUSTER"), _op("placeModule", cells[1] + UP, "SOLAR_PANEL"),
		_op("placeModule", cells[2] + UP, "INTERSTELLAR_NAVIGATION"), _op("placeModule", cells[3] + UP * 2, "BASIC_STORAGE")])
	_check(built.is_ok(), "ship: thruster, solar, navigation, storage (error: %s)" % _code(built))
	await get_tree().create_timer(8.0).timeout
	var scale := Services.definitions.fixed_point_scale
	var items: Array = [{"resource": "ROBOT_T1", "amount": 2 * scale}]
	items.append({"resource": "HYDROGEN", "amount": (FUEL if fuel else LITTLE) * scale})
	var moved := await Services.api.post_json("/v2/structures/%d/transfers" % _base.structure_id, {"guestId": ship_id,
		"direction": "toGuest", "items": items})
	_check(moved.is_ok(), "ship %d: robots and %d hydrogen on board (error: %s)" % [ship_id, FUEL if fuel else LITTLE, _code(moved)])
	var staffed := await Services.api.put_json("/v2/structures/%d/workforce" % ship_id, {"assignments": [{
		"moduleType": "INTERSTELLAR_NAVIGATION", "humans": [0, 0, 0, 0, 0], "robots": [2, 0, 0, 0, 0],
		"auto": [false, false, false, false, false]}]})
	_check(staffed.is_ok(), "ship %d: navigation staffed (error: %s)" % [ship_id, _code(staffed)])


## The corner of a free 2×2 square of ground cells touching the base but no dock (another
## ship's docks next to it would block its space).
static func _free_square(layout: StructureLayout) -> Vector3i:
	for cell: Vector3i in layout.hull_cells():
		if cell.z != 0 or layout.hull_at(cell) == TravelPlan.DOCK:
			continue
		for step: Vector3i in [Vector3i(1, 0, 0), Vector3i(0, -2, 0), Vector3i(-2, 0, 0), Vector3i(0, 1, 0)]:
			var corner: Vector3i = cell + step
			var free := true
			for dx: int in range(-1, 3):
				for dy: int in range(-1, 3):
					var at := corner + Vector3i(dx, dy, 0)
					var inside := dx >= 0 and dx <= 1 and dy >= 0 and dy <= 1
					var hull := layout.hull_at(at)
					free = free and (hull.is_empty() if inside else hull != TravelPlan.DOCK)
			if free:
				return corner
	return Vector3i(-3, 0, 0)


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


func _finish() -> void:
	print("FLEET SMOKE %s  (%d failed)" % ["GREEN" if _failures == 0 else "RED", _failures])
	get_tree().quit(0 if _failures == 0 else 1)
