extends FleetFlow
## End-to-end check of a trade route run by a fleet (draft.35) against the server, with the
## fleets account of smoke/fleet_flow.gd (run that once first: it builds the two ships docked at
## the base). Station A is the home base, station B another own structure that is not one of
## the two ships (the ship fleet_flow once left in orbit, or any other). Then:
## - forms a fleet of the two docked ships, quotes the fleet route (a landing site per ship at A,
##   the first trip as a fleet quote, member errors) and creates it (hydrogen as the fleet's
##   supply target at A);
## - the fleet now has a route command: joining, leaving, disbanding and a fleet flight are
##   refused (FLEET_HAS_COMMAND), the stance can still be set; members name the route;
## - waits for the stop at A (`route.arrived` with a share per ship) and the departure to B,
##   deletes the route (it ends at B), disbands the fleet and docks both ships at the base again.
## Takes about 40 minutes (launches and landings of about 6 minutes each).
##
## Root script of smoke/fleet_route_flow.tscn; run through
## tools\colony-smoke.ps1 -Scene fleet_route_flow.

## Hydrogen the fleet keeps as its supply (Σ over the ships), loaded at A.
const SUPPLY_TARGET := 70

var _route_events: Array[String] = []
var _routes: RouteModel


func _main() -> void:
	Services.events.event_received.connect(func(event: SseEvent) -> void:
		if event.type.begins_with("route."):
			_route_events.append(event.type))
	_routes = _fleet.routes
	await _wait_until(func() -> bool: return _routes.loaded, 15000)
	# A fleet route of an earlier run goes on being checked; other fleets are disbanded.
	var route: RoutePlan.Route = null
	for found: RoutePlan.Route in _routes.book.routes():
		if found.is_fleet() and _fleet.groups.find(found.fleet_id) != null and not found.deleting:
			route = found
			break
	for leftover: FleetGroups.Group in _fleet.groups.groups():
		if route != null and leftover.fleet_id == route.fleet_id:
			continue
		await _wait_until(func() -> bool: return not _fleet.groups.find(leftover.fleet_id).has_command(),
			leftover.remaining_ms(Services.clock.now_ms()) + ARRIVAL_GRACE)
		var gone := await _fleet.dissolve_group(leftover.fleet_id)
		_check(gone.is_ok(), "leftover fleet %d disbanded (error: %s)" % [leftover.fleet_id, _code(gone)])

	var group: FleetGroups.Group = null
	var first := 0
	var second := 0
	if route != null:
		group = _fleet.groups.find(route.fleet_id)
		first = group.member_ids()[0]
		second = group.member_ids()[1] if group.member_ids().size() > 1 else 0
		print("FLEET continuing route %d of fleet %d" % [route.route_id, group.fleet_id])
	else:
		var ships := _ships()
		_check(ships.size() >= 2, "two ships docked at the base (%d; run fleet_flow first)" % ships.size())
		if ships.size() < 2:
			_finish()
			return
		first = ships[0].structure_id
		second = ships[1].structure_id
		group = await _form(first, second)
		if group == null:
			_finish()
			return
		route = await _create_route(group, first, second)
		if route == null:
			await _cleanup(group.fleet_id, first, second)
			return
	var on_route: bool = await _wait_until(func() -> bool:
		var current := _fleet.groups.find(group.fleet_id)
		return current != null and current.is_on_route() and current.route_id == route.route_id, 15000)
	_check(on_route, "the client's fleet has the route as its command")
	_check(_routes.book.of_fleet(group.fleet_id) != null, "the client finds the route by its fleet")
	var details := await Services.api.get_json("/v2/structures/%d" % first)
	_check(details.is_ok() and Wire.as_int(details.data.get("routeId")) == route.route_id,
		"a member's StructureResponse.routeId names the fleet's route")

	# The lock: nothing changes the fleet while the route exists; the stance still can.
	var leave := await _fleet.leave_group(group.fleet_id, second)
	_check(_code(leave) == "FLEET_HAS_COMMAND", "leaving refused: %s" % _code(leave))
	var disband := await _fleet.dissolve_group(group.fleet_id)
	_check(_code(disband) == "FLEET_HAS_COMMAND", "disbanding refused: %s" % _code(disband))
	var fly := await _fleet.start_group_travel(group.fleet_id, _base.body_id)
	_check(_code(fly) == "FLEET_HAS_COMMAND", "a fleet flight refused: %s" % _code(fly))
	var draft := RoutePlan.Draft.new()
	draft.use_fleet(group.fleet_id, group.member_ids())
	draft.station_a = route.station_id(RoutePlan.A)
	draft.station_b = route.station_id(RoutePlan.B)
	var again := await _routes.quote(draft)
	var second_route := RoutePlan.Quote.from_wire(again.data) if again.is_ok() else null
	_check((second_route != null and second_route.errors.has("FLEET_HAS_COMMAND")) or _code(again) == "FLEET_HAS_COMMAND",
		"a second route refused: %s" % (str(second_route.errors) if second_route != null else _code(again)))
	var stance := await _fleet.set_group_combat(group.fleet_id, FleetGroups.STANCE_PEACEFUL, FleetGroups.INTENT_CAPTURE)
	var intent_ok := stance.is_ok() or _code(stance) == "NO_CARGO_SPACE"
	_check(intent_ok, "the stance can still be set (%s)" % _code(stance))
	if stance.is_ok():
		await _fleet.set_group_combat(group.fleet_id, "", FleetGroups.INTENT_DESTROY)

	# The stop at A: one share per ship.
	var stopped: bool = await _wait_until(func() -> bool:
		var current := _routes.book.find(route.route_id)
		return current != null and current.last_shares_station == _base.structure_id, 25 * 60000)
	var at_a := _routes.book.find(route.route_id)
	_check(stopped and at_a.last_shares.size() == 2, "route.arrived at A with a share per ship (%d)" % (
		at_a.last_shares.size() if at_a != null else 0))
	if at_a != null:
		print("FLEET " + RouteList.details_text(_fleet, at_a, self).replace("\n", " | "))
	var supply := _fleet.groups.find(group.fleet_id).supply_of("HYDROGEN") if _fleet.groups.find(group.fleet_id) != null else 0
	print("FLEET supply after the stop: %s hydrogen" % AmountFormat.amount(supply, Services.definitions.fixed_point_scale))
	var departed: bool = await _wait_until(func() -> bool: return _route_events.has("route.departed"), 10 * 60000)
	_check(departed, "route.departed towards B")

	# Rebuilding means deleting: the route ends at B, the fleet is free again.
	var deleted := await _routes.delete_route(route.route_id)
	_check(deleted.is_ok(), "route deleted (ends at the next station: %s)" % (
		str(deleted.data.get("deleted") != true) if deleted.is_ok() else _code(deleted)))
	var ended: bool = await _wait_until(func() -> bool:
		var current := _fleet.groups.find(group.fleet_id)
		return _routes.book.find(route.route_id) == null and current != null and not current.has_command(), 20 * 60000)
	_check(ended, "the route ended at B and the fleet is free (fleet.updated)")
	await _cleanup(group.fleet_id, first, second)


## Disbands the fleet and docks both ships at the base again.
func _cleanup(fleet_id: int, first: int, second: int) -> void:
	await _wait_until(func() -> bool:
		var current := _fleet.groups.find(fleet_id)
		return current == null or current.is_together(), 10 * 60000)
	var gone := await _fleet.dissolve_group(fleet_id)
	_check(gone.is_ok(), "fleet disbanded (error: %s)" % _code(gone))
	for ship: int in [first, second]:
		var entry := _fleet.fleet.find(ship)
		if entry != null and not (entry.where() == Fleet.Where.DOCKED and entry.host_id == _base.structure_id):
			await _dock_home(ship)
	_finish()


## The second station (not the base, not a member), a quote and the route; null when it failed.
func _create_route(group: FleetGroups.Group, first: int, second: int) -> RoutePlan.Route:
	var station_b := 0
	for entry: Fleet.Entry in _fleet.fleet.entries():
		if entry.structure_id != _base.structure_id and entry.structure_id != first and entry.structure_id != second \
				and not entry.is_moving(Services.clock.now_ms()):
			station_b = entry.structure_id
			break
	_check(station_b != 0, "a second station: %s" % RouteList.structure_name(_fleet, station_b, self))
	if station_b == 0:
		return null
	var draft := RoutePlan.Draft.new()
	draft.name = "Fleet run"
	draft.use_fleet(group.fleet_id, group.member_ids())
	draft.station_a = _base.structure_id
	draft.station_b = station_b
	draft.start_at = RoutePlan.A
	draft.rules_ab.append(RoutePlan.Rule.make("HYDROGEN", RoutePlan.INTO_SUPPLY, SUPPLY_TARGET))
	_check(draft.is_complete() and draft.create_body().has("fleetId"), "the draft sends the fleet")
	var quoted := await _routes.quote(draft)
	_check(quoted.is_ok(), "fleet route quote answered (error: %s)" % _code(quoted))
	if not quoted.is_ok():
		return null
	var quote := RoutePlan.Quote.from_wire(quoted.data)
	print("FLEET route quote: ok %s, errors %s, kind %s, start %s, trip %s, sites A %d, B %d, member errors %s" % [
		quote.ok, quote.errors, quote.kind, quote.start_at, TimeFormat.duration(quote.trip_ms),
		quote.crew_stops_a.size(), quote.crew_stops_b.size(), quote.member_errors])
	_check(quote.ok and quote.kind == RoutePlan.KIND_SHIP and quote.crew_stops_a.size() == 2 and quote.fleet_trip != null,
		"quote: ship route, a site per ship at A, the first trip as a fleet quote")
	if not quote.ok:
		return null
	var made := await _routes.create(draft)
	_check(made.is_ok(), "fleet route created (error: %s)" % _code(made))
	if not made.is_ok():
		var blocked := FleetGroups.not_ready_members(made.error)
		if not blocked.is_empty():
			print("FLEET not ready: ", blocked)
		return null
	var route := RoutePlan.Route.from_wire(made.data)
	print("FLEET route %d: transporter %d, sites at A %s" % [route.route_id, route.transporter_id,
		RouteList.sites_text(_fleet, route.station_a.stops, self)])
	_check(route.fleet_id == group.fleet_id and route.is_fleet() and route.station_a.stops.size() == 2,
		"the route names the fleet and a site per ship")
	return route
