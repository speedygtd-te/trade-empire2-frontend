extends GdUnitTestSuite
## Trade routes of fleets (draft.35): the route, its per-ship sites and shares, the draft, the
## quote, the book and the fleet's route command.

const RoutePlanTest := preload("res://tests/core/test_route_plan.gd")
const FleetGroupsTest := preload("res://tests/core/test_fleet_groups.gd")


static func fleet_route_wire(id: int = 8) -> Dictionary:
	var wire := RoutePlanTest.route_wire(id)
	wire["kind"] = "ship"
	wire["transporterId"] = 31.0
	wire["fleetId"] = 900.0
	wire["stationA"] = {"structureId": 10.0, "bodyId": "p1", "stop": {"x": 150.0, "y": -4.0},
		"stops": [{"structureId": 31.0, "x": 150.0, "y": -4.0}, {"structureId": 32.0, "x": 154.0, "y": -4.0}]}
	wire["stationB"] = {"structureId": 20.0, "bodyId": "m1", "stops": []}
	return wire


func test_a_fleet_route_has_a_site_per_ship() -> void:
	var route := RoutePlan.Route.from_wire(fleet_route_wire())

	assert_bool(route.is_fleet()).is_true()
	assert_int(route.fleet_id).is_equal(900)
	assert_int(route.transporter_id).is_equal(31)
	assert_int(route.station_a.stops.size()).is_equal(2)
	assert_vector(route.station_a.stop_of(32).cell).is_equal(Vector2i(154, -4))
	assert_object(route.station_a.stop_of(99)).is_null()
	assert_bool(route.station_b.has_stop).is_false()
	assert_bool(RoutePlan.Route.from_wire(RoutePlanTest.route_wire()).is_fleet()).is_false()
	# A single route since draft.35: `stops` filled, `stop` the first; an older answer only `stop`.
	var only_stops := RoutePlanTest.route_wire()
	only_stops["stationA"] = {"structureId": 10.0, "bodyId": "p1", "stops": [{"structureId": 30.0, "x": 5.0, "y": 6.0}]}
	var single := RoutePlan.Route.from_wire(only_stops)
	assert_bool(single.station_a.has_stop).is_true()
	assert_vector(single.station_a.stop).is_equal(Vector2i(5, 6))
	assert_int(RoutePlan.member_stops_from_wire([{"x": 1.0}]).size()).is_equal(0)


func test_shares_of_a_fleet_stop() -> void:
	var route := RoutePlan.Route.from_wire(fleet_route_wire())
	route.take_shares(10, [{"structureId": 31.0, "unloaded": [], "loaded": [{"resource": "IRON", "amount": 30000000.0}]},
		{"structureId": 32.0, "unloaded": [{"resource": "WATER", "amount": 1000000.0}], "loaded": []}, {"loaded": []}])

	assert_int(route.last_shares_station).is_equal(10)
	assert_int(route.last_shares.size()).is_equal(2)
	assert_int(route.last_shares[0].loaded[0][1]).is_equal(30000000)
	assert_str(route.last_shares[1].unloaded[0][0]).is_equal("WATER")
	route.take_shares(20, null)
	assert_bool(route.last_shares.is_empty()).is_true()


func test_a_fleet_draft_sends_the_fleet_and_keeps_members_off_the_stations() -> void:
	var draft := RoutePlan.Draft.new()
	draft.use_fleet(900, PackedInt64Array([31, 32]))
	draft.station_a = 10
	draft.station_b = 20

	assert_bool(draft.is_fleet()).is_true()
	assert_bool(draft.is_complete()).is_true()
	assert_bool(draft.runs(32)).is_true()
	assert_bool(draft.runs(10)).is_false()
	assert_bool(draft.runs(0)).is_false()
	var body := draft.create_body()
	assert_int(body["fleetId"]).is_equal(900)
	assert_bool(body.has("transporterId")).is_false()
	draft.station_b = 32
	assert_bool(draft.is_complete()).is_false()
	draft.station_b = 20
	draft.use_transporter(31)
	assert_bool(draft.is_fleet()).is_false()
	assert_bool(draft.runs(32)).is_false()
	assert_bool(draft.create_body().has("fleetId")).is_false()
	assert_int(draft.create_body()["transporterId"]).is_equal(31)
	draft.fleet_id = 900
	assert_bool(draft.is_complete()).is_false()


func test_a_fleet_quote_has_sites_member_errors_and_a_fleet_trip() -> void:
	var quote := RoutePlan.Quote.from_wire({"ok": false, "errors": ["FLEET_NOT_READY"], "kind": "ship",
		"stops": {"a": {"x": 150.0, "y": -4.0}}, "startAt": "A",
		"crewStops": {"a": [{"structureId": 31.0, "x": 150.0, "y": -4.0}, {"structureId": 32.0, "x": 154.0, "y": -4.0}], "b": []},
		"members": [{"structureId": 31.0, "errors": []}, {"structureId": 32.0, "errors": ["INSUFFICIENT_CREW"]}],
		"fleetTrip": {"ok": true, "errors": [], "warpLevel": 1.0, "interstellar": false, "distanceNly": 0.0,
			"departAt": 0.0, "liftoffAt": 60000.0, "cruiseEndAt": 60000.0, "arrivalAt": 120000.0,
			"slowest": 31.0, "longestLaunch": 32.0, "members": [],
			"fuel": [{"resource": "HYDROGEN", "amount": 2000000.0, "selfUse": 9000000.0}]}})

	assert_int(quote.crew_stops(RoutePlan.A).size()).is_equal(2)
	assert_bool(quote.crew_stops(RoutePlan.B).is_empty()).is_true()
	assert_array(quote.member_errors.keys()).is_equal([32])
	assert_object(quote.fleet_trip).is_not_null()
	assert_bool(quote.has_trip).is_true()
	assert_int(quote.trip_ms).is_equal(120000)
	assert_array(quote.fuel[0]).is_equal(["HYDROGEN", 2000000, 9000000, 0])
	assert_array(Array(quote.fuel_types())).is_equal(["HYDROGEN"])


func test_the_book_finds_a_fleet_route_and_keeps_the_shares() -> void:
	var book := RouteBook.new()
	book.apply_list([RoutePlanTest.route_wire(7), fleet_route_wire(8)])

	assert_int(book.of_fleet(900).route_id).is_equal(8)
	assert_object(book.of_fleet(0)).is_null()
	assert_object(book.of_fleet(5)).is_null()
	assert_bool(book.apply_event("route.arrived", {"routeId": 8.0, "transporterId": 31.0, "fleetId": 900.0,
		"stationId": 10.0, "unloaded": [], "loaded": [], "skipped": [],
		"shares": [{"structureId": 31.0, "unloaded": [], "loaded": [{"resource": "IRON", "amount": 1000000.0}]}]})).is_true()
	var route := book.find(8)
	assert_str(route.station).is_equal("A")
	assert_int(route.last_shares.size()).is_equal(1)
	assert_int(route.last_shares_station).is_equal(10)
	# A single route has no shares.
	assert_bool(book.apply_event("route.arrived", {"routeId": 7.0, "stationId": 10.0})).is_true()
	assert_bool(book.find(7).last_shares.is_empty()).is_true()


func test_a_fleet_on_a_route_has_a_command_and_flies_only_between_stations() -> void:
	var group := FleetGroups.Group.from_wire(FleetGroupsTest.view(11, [2, 5], {"type": "route", "routeId": 44.0}))

	assert_bool(group.has_command()).is_true()
	assert_bool(group.is_on_route()).is_true()
	assert_int(group.route_id).is_equal(44)
	assert_bool(group.is_travelling(3000)).is_false()
	assert_int(group.remaining_ms(3000)).is_equal(0)
	assert_float(group.progress_at(3000)).is_equal(0.0)
	var leg := {"type": "route", "routeId": 44.0, "target": {"type": "surface", "bodyId": "m1"},
		"departAt": 1000.0, "arrivalAt": 5000.0}
	var flying := FleetGroups.Group.from_wire(FleetGroupsTest.view(11, [2, 5], leg))
	assert_bool(flying.is_travelling(3000)).is_true()
	assert_str(flying.target_body_id()).is_equal("m1")
	assert_bool(FleetGroups.Group.from_wire(FleetGroupsTest.view(12, [2], FleetGroupsTest.flight(5000))).is_on_route()).is_false()
