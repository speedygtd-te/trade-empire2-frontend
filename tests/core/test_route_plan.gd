extends GdUnitTestSuite
## RoutePlan: routes, quotes and request bodies of /v2/routes.


static func route_wire(id: int = 7) -> Dictionary:
	# Numbers as Godot's JSON parser hands them over: floats.
	return {
		"routeId": float(id), "name": "Ore run", "kind": "ground", "transporterId": 30.0,
		"stationA": {"structureId": 10.0, "bodyId": "p1", "stop": {"x": 150.0, "y": -4.0}},
		"stationB": {"structureId": 20.0, "bodyId": "p1"},
		"rules": {
			"aToB": [{"resource": "IRON", "amount": 50.0, "into": "transport"},
				{"resource": "HYDROGEN", "amount": "max", "into": "selfUse"}],
			"bToA": [{"resource": "WATER", "amount": "max", "into": "transport"}],
		},
		"waypoints": {"aToB": [{"x": 3.0, "y": 4.0}], "bToA": []},
		"state": "travelling", "station": "B", "stopping": false, "deleting": false,
		"nextArrivalAt": 90000.0,
		"cargo": {"forA": [], "forB": [{"resource": "IRON", "amount": 50000000.0}]},
		"stats": {"cycles": 2.0, "trips": 5.0, "delivered": [{"resource": "IRON", "amount": 150000000.0}]},
		"createdAt": 1000.0,
	}


func test_a_route_is_read_from_the_wire() -> void:
	var route := RoutePlan.Route.from_wire(route_wire())

	assert_int(route.route_id).is_equal(7)
	assert_str(route.name).is_equal("Ore run")
	assert_str(route.kind).is_equal(RoutePlan.KIND_GROUND)
	assert_int(route.transporter_id).is_equal(30)
	assert_int(route.station_a.structure_id).is_equal(10)
	assert_bool(route.station_a.has_stop).is_true()
	assert_vector(route.station_a.stop).is_equal(Vector2i(150, -4))
	assert_bool(route.station_b.has_stop).is_false()
	assert_int(route.rules_ab.size()).is_equal(2)
	assert_int(route.rules_ab[0].amount).is_equal(50)
	assert_bool(route.rules_ab[1].is_max()).is_true()
	assert_bool(route.rules_ab[1].is_supply()).is_true()
	assert_int(route.rules_ba.size()).is_equal(1)
	assert_array(route.waypoints_ab).is_equal([Vector2i(3, 4)])
	assert_int(route.next_arrival_at).is_equal(90000)
	assert_array(route.cargo_for("B")).is_equal([["IRON", 50000000]])
	assert_array(route.cargo_for("A")).is_empty()
	assert_int(route.cycles).is_equal(2)
	assert_int(route.trips).is_equal(5)
	assert_array(route.delivered).is_equal([["IRON", 150000000]])
	assert_int(route.created_at).is_equal(1000)


func test_stations_by_letter_and_by_structure() -> void:
	var route := RoutePlan.Route.from_wire(route_wire())

	assert_int(route.station_id("A")).is_equal(10)
	assert_int(route.station_id("B")).is_equal(20)
	assert_int(route.current_station_id()).is_equal(20)
	assert_str(route.letter_of(10)).is_equal("A")
	assert_str(route.letter_of(20)).is_equal("B")
	assert_str(route.letter_of(30)).is_empty()
	assert_str(route.letter_of(0)).is_empty()
	assert_bool(route.involves(30)).is_true()
	assert_bool(route.involves(10)).is_true()
	assert_bool(route.involves(99)).is_false()
	assert_int(route.rules_from("A").size()).is_equal(2)
	assert_int(route.rules_from("B").size()).is_equal(1)


func test_status_follows_state_and_requests() -> void:
	var route := RoutePlan.Route.from_wire(route_wire())
	assert_int(route.status()).is_equal(RoutePlan.Status.HEADING)
	assert_bool(route.is_paused()).is_false()

	route.state = "stalled"
	assert_int(route.status()).is_equal(RoutePlan.Status.WAITING)
	route.state = "paused"
	assert_int(route.status()).is_equal(RoutePlan.Status.PAUSED)
	assert_bool(route.is_paused()).is_true()
	route.state = "travelling"
	route.stopping = true
	assert_int(route.status()).is_equal(RoutePlan.Status.STOPPING)
	route.deleting = true
	assert_int(route.status()).is_equal(RoutePlan.Status.DELETING)


func test_time_left_counts_to_arrival_or_next_try() -> void:
	var route := RoutePlan.Route.from_wire(route_wire())

	assert_int(route.time_left(30000)).is_equal(60000)
	assert_int(route.time_left(100000)).is_equal(0)
	route.state = "stalled"
	route.retry_at = 50000
	assert_int(route.time_left(20000)).is_equal(30000)
	route.state = "paused"
	assert_int(route.time_left(20000)).is_equal(0)


func test_rules_go_out_as_whole_units_or_max() -> void:
	var rules: Array[RoutePlan.Rule] = [RoutePlan.Rule.make("IRON", RoutePlan.INTO_CARGO, 50),
		RoutePlan.Rule.make("HYDROGEN", RoutePlan.INTO_SUPPLY)]

	var wire := rules[0].to_wire()
	assert_int(typeof(wire["amount"])).is_equal(TYPE_INT)
	assert_dict(wire).is_equal({"resource": "IRON", "amount": 50, "into": "transport"})
	assert_dict(rules[1].to_wire()).is_equal({"resource": "HYDROGEN", "amount": "max", "into": "selfUse"})
	assert_str(JSON.stringify(rules[0].to_wire())).contains("\"amount\":50")
	assert_str(JSON.stringify(rules[0].to_wire())).not_contains("50.0")


func test_a_rule_reads_back_what_it_wrote() -> void:
	var rule := RoutePlan.Rule.from_wire({"resource": "IRON", "amount": 12.0, "into": "selfUse"})
	var copy := rule.copy()

	assert_str(copy.resource).is_equal("IRON")
	assert_int(copy.amount).is_equal(12)
	assert_bool(copy.is_supply()).is_true()
	copy.amount = 3
	assert_int(rule.amount).is_equal(12)
	assert_bool(RoutePlan.Rule.make("IRON", RoutePlan.INTO_CARGO, -5).is_max()).is_true()


func test_patch_always_sends_both_directions() -> void:
	var a_to_b: Array[RoutePlan.Rule] = [RoutePlan.Rule.make("IRON", RoutePlan.INTO_CARGO, 5)]
	var none: Array[RoutePlan.Rule] = []

	var body := RoutePlan.patch_rules(a_to_b, none)
	var rules: Dictionary = body["rules"]
	assert_bool(rules.has("aToB")).is_true()
	assert_bool(rules.has("bToA")).is_true()
	assert_array(rules["bToA"]).is_empty()
	assert_bool(body.has("name")).is_false()
	assert_str(RoutePlan.patch_rules(a_to_b, none, "  New  ")["name"]).is_equal("New")
	assert_dict(RoutePlan.rules_body(none, a_to_b)).is_equal({"aToB": [], "bToA": [a_to_b[0].to_wire()]})
	assert_dict(RoutePlan.patch_paused(true)).is_equal({"paused": true})


func test_names_are_trimmed_and_cut() -> void:
	assert_str(RoutePlan.clean_name("  Ore run ")).is_equal("Ore run")
	assert_int(RoutePlan.clean_name("x".repeat(80)).length()).is_equal(RoutePlan.MAX_NAME)
	assert_str(RoutePlan.clean_name("   ")).is_empty()


func test_draft_builds_the_create_body() -> void:
	var draft := RoutePlan.Draft.new()
	assert_bool(draft.is_complete()).is_false()
	draft.transporter_id = 30
	draft.station_a = 10
	draft.station_b = 20
	draft.rules_ab.append(RoutePlan.Rule.make("IRON", RoutePlan.INTO_CARGO, 50))

	assert_bool(draft.is_complete()).is_true()
	var body := draft.create_body()
	assert_int(typeof(body["transporterId"])).is_equal(TYPE_INT)
	assert_dict(body["stationA"]).is_equal({"structureId": 10})
	assert_dict(body["stationB"]).is_equal({"structureId": 20})
	assert_bool(body.has("name")).is_false()
	assert_bool(body.has("startAt")).is_false()
	assert_bool(body.has("kind")).is_false()
	var rules: Dictionary = body["rules"]
	assert_int((rules["aToB"] as Array).size()).is_equal(1)
	assert_array(rules["bToA"]).is_empty()

	draft.name = "Ore"
	draft.start_at = "B"
	body = draft.create_body()
	assert_str(body["name"]).is_equal("Ore")
	assert_str(body["startAt"]).is_equal("B")
	assert_int(draft.station_id("B")).is_equal(20)
	assert_int(draft.rules_from("A").size()).is_equal(1)
	assert_int(draft.rules_from("B").size()).is_equal(0)


func test_a_draft_with_a_station_twice_or_the_transporter_as_station_is_incomplete() -> void:
	var draft := RoutePlan.Draft.new()
	draft.transporter_id = 30
	draft.station_a = 10
	draft.station_b = 10
	assert_bool(draft.is_complete()).is_false()
	draft.station_b = 30
	assert_bool(draft.is_complete()).is_false()


func test_rule_limits() -> void:
	var rules: Array[RoutePlan.Rule] = [RoutePlan.Rule.make("IRON", RoutePlan.INTO_CARGO, 5)]
	assert_int(RoutePlan.problem(rules)).is_equal(RoutePlan.Problem.NONE)
	assert_bool(RoutePlan.can_add(rules, "IRON", RoutePlan.INTO_CARGO)).is_false()
	assert_bool(RoutePlan.can_add(rules, "IRON", RoutePlan.INTO_SUPPLY)).is_true()
	assert_bool(RoutePlan.can_add(rules, "", RoutePlan.INTO_SUPPLY)).is_false()
	assert_int(RoutePlan.find_rule(rules, "IRON", RoutePlan.INTO_CARGO)).is_equal(0)
	assert_int(RoutePlan.find_rule(rules, "IRON", RoutePlan.INTO_SUPPLY)).is_equal(-1)

	rules.append(RoutePlan.Rule.make("IRON", RoutePlan.INTO_CARGO, 9))
	assert_int(RoutePlan.problem(rules)).is_equal(RoutePlan.Problem.TWICE)
	rules[1].resource = ""
	assert_int(RoutePlan.problem(rules)).is_equal(RoutePlan.Problem.NO_RESOURCE)
	rules[1].resource = "WATER"
	rules[1].amount = -1
	assert_int(RoutePlan.problem(rules)).is_equal(RoutePlan.Problem.NO_AMOUNT)

	var many: Array[RoutePlan.Rule] = []
	for index: int in RoutePlan.MAX_RULES:
		many.append(RoutePlan.Rule.make("ITEM_%d" % index, RoutePlan.INTO_CARGO, 1))
	assert_int(RoutePlan.problem(many)).is_equal(RoutePlan.Problem.NONE)
	assert_bool(RoutePlan.can_add(many, "OTHER", RoutePlan.INTO_CARGO)).is_false()
	many.append(RoutePlan.Rule.make("OTHER", RoutePlan.INTO_CARGO, 1))
	assert_int(RoutePlan.problem(many)).is_equal(RoutePlan.Problem.TOO_MANY)


func test_keep_fuel_topped_up_adds_or_raises_a_supply_rule() -> void:
	var rules: Array[RoutePlan.Rule] = [RoutePlan.Rule.make("HYDROGEN", RoutePlan.INTO_CARGO, 5),
		RoutePlan.Rule.make("METHANE", RoutePlan.INTO_SUPPLY, 20)]

	assert_bool(RoutePlan.top_up_fuel(rules, PackedStringArray(["HYDROGEN", "METHANE"]))).is_true()
	assert_int(rules.size()).is_equal(3)
	assert_bool(rules[1].is_max()).is_true()
	assert_str(rules[2].resource).is_equal("HYDROGEN")
	assert_bool(rules[2].is_supply()).is_true()
	assert_bool(rules[2].is_max()).is_true()
	assert_bool(RoutePlan.top_up_fuel(rules, PackedStringArray(["HYDROGEN"]))).is_false()


func test_copies_and_comparison_of_rule_lists() -> void:
	var rules: Array[RoutePlan.Rule] = [RoutePlan.Rule.make("IRON", RoutePlan.INTO_CARGO, 5)]
	var copy := RoutePlan.copy_rules(rules)

	assert_bool(RoutePlan.same_rules(rules, copy)).is_true()
	copy[0].amount = 6
	assert_bool(RoutePlan.same_rules(rules, copy)).is_false()
	assert_int(rules[0].amount).is_equal(5)
	var none: Array[RoutePlan.Rule] = []
	assert_bool(RoutePlan.same_rules(rules, none)).is_false()


func test_wire_lists() -> void:
	assert_int(RoutePlan.rules_from_wire([{"amount": 3.0}, {"resource": "IRON", "amount": 3.0}]).size()).is_equal(1)
	assert_array(RoutePlan.rules_from_wire(null)).is_empty()
	assert_array(RoutePlan.amounts_from_wire([{"resource": "IRON", "amount": 2.0}, {"resource": "", "amount": 1.0}])) \
		.is_equal([["IRON", 2]])
	assert_array(RoutePlan.amounts_from_wire("no")).is_empty()
	assert_array(RoutePlan.points_from_wire([{"x": -1.0, "y": 2.0}])).is_equal([Vector2i(-1, 2)])
	assert_array(RoutePlan.points_from_wire(null)).is_empty()
	assert_vector(RoutePlan.grid_xy({"x": 5.0, "y": 6.0})).is_equal(Vector2i(5, 6))


func test_a_station_without_stop_rests_in_orbit() -> void:
	var station := RoutePlan.Station.from_wire({"structureId": 4.0, "bodyId": "m1"})

	assert_int(station.structure_id).is_equal(4)
	assert_str(station.body_id).is_equal("m1")
	assert_bool(station.has_stop).is_false()


func test_a_quote_with_errors_and_stops() -> void:
	var quote := RoutePlan.Quote.from_wire({
		"ok": false, "errors": ["NO_STOP_SITE", "INSUFFICIENT_FUEL"], "kind": "ship",
		"stops": {"a": {"x": 12.0, "y": -3.0}}, "startAt": "A",
		"firstTrip": {"departAt": 1000.0, "arrivalAt": 61000.0, "fuel": [
			{"resource": "HYDROGEN", "amount": 4000000.0, "selfUse": 1000000.0, "inTransport": 9000000.0},
			{"resource": "HYDROGEN", "amount": 1000000.0, "selfUse": 1000000.0, "inTransport": 0.0}]},
	})

	assert_bool(quote.ok).is_false()
	assert_array(Array(quote.errors)).is_equal(["NO_STOP_SITE", "INSUFFICIENT_FUEL"])
	assert_str(quote.kind).is_equal("ship")
	assert_bool(quote.has_stop_a).is_true()
	assert_vector(quote.stop_a).is_equal(Vector2i(12, -3))
	assert_bool(quote.has_stop_b).is_false()
	assert_str(quote.start_at).is_equal("A")
	assert_bool(quote.has_trip).is_true()
	assert_int(quote.trip_ms).is_equal(60000)
	assert_array(quote.fuel[0]).is_equal(["HYDROGEN", 4000000, 1000000, 9000000])
	assert_array(Array(quote.fuel_types())).is_equal(["HYDROGEN"])


func test_a_quote_without_trip() -> void:
	var quote := RoutePlan.Quote.from_wire({"ok": true, "errors": [], "stops": {}, "startAt": "B"})

	assert_bool(quote.ok).is_true()
	assert_bool(quote.has_trip).is_false()
	assert_array(Array(quote.fuel_types())).is_empty()
