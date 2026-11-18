extends GdUnitTestSuite
## TravelPlan: requests from whole numbers, the quote read for display, landing sites against own
## structures, the suggested site, a place on the docks and the line of a drive.


static func _layout(header: String, hull_types: String, hulls: String) -> StructureLayout:
	var layout := StructureLayout.new()
	layout.apply(Ndjson.parse(
		header + '\n{"line":"chunk","chunk":[0,0,0],"version":1,"hullTypes":%s,"hulls":%s,"modules":[]}\n' % [
			hull_types, hulls]
		+ '{"line":"end","rev":1}'
	))
	return layout


static func _surface(id: int, offset: Vector3i, hulls: String) -> StructureLayout:
	return _layout('{"line":"header","structureId":%d,"anchor":{"type":"surface","bodyId":"p",' % id
		+ '"offset":{"x":%d,"y":%d,"z":%d}},"rev":1,"chunks":1}' % [offset.x, offset.y, offset.z],
		'["STARTER","DOCK"]', hulls)


static func _guest(id: int, offset: Vector3i, hulls: String) -> StructureLayout:
	return _layout('{"line":"header","structureId":%d,"anchor":{"type":"docked","hostId":1,' % id
		+ '"offset":{"x":%d,"y":%d,"z":%d}},"rev":1,"chunks":1}' % [offset.x, offset.y, offset.z],
		'["STARTER"]', hulls)


func _quote() -> TravelPlan.Quote:
	return TravelPlan.Quote.from_wire({
		"ok": false, "errors": ["INSUFFICIENT_FUEL", "TOO_HEAVY"], "mass": 600000000.0, "maxMass": 500000000.0,
		"warpLevel": 1.0, "interstellar": false, "distanceNly": 3000000.0, "speedCellsPerMinute": 0.0,
		"departAt": 1000.0, "liftoffAt": 271600.0, "cruiseEndAt": 400000.0, "arrivalAt": 671000.0,
		"fuel": [
			{"resource": "HYDROGEN", "amount": 5000000.0, "selfUse": 1000000.0, "inTransport": 9000000.0},
			{"resource": "FUSION_FUEL", "amount": 2000000.0, "selfUse": 0.0, "inTransport": 1000000.0},
			{"resource": "WATER", "amount": 1000000.0, "selfUse": 3000000.0, "inTransport": 0.0},
		],
	})


func test_requests_are_built_from_whole_numbers() -> void:
	var orbit := TravelPlan.request(TravelPlan.MODE_FLIGHT, TravelPlan.orbit_target("p1"))
	assert_dict(orbit).is_equal({"mode": "flight", "target": {"type": "orbit", "bodyId": "p1"}})

	var land := TravelPlan.request(TravelPlan.MODE_FLIGHT, TravelPlan.surface_target("p1", Vector2i(42, -3)))
	assert_str(JSON.stringify(land)).contains('"x":42').contains('"y":-3')
	assert_int(typeof((land["target"] as Dictionary)["x"])).is_equal(TYPE_INT)

	var dock := TravelPlan.dock_target(277, Vector3i(4, 0, 1))
	assert_str(JSON.stringify(dock)).contains('"hostId":277').contains('"z":1')


func test_waypoints_go_only_with_a_drive() -> void:
	var points: Array[Vector2i] = [Vector2i(48, 52)]
	var drive := TravelPlan.request(TravelPlan.MODE_GROUND, TravelPlan.surface_target("p", Vector2i(50, 50)), points)
	assert_str(JSON.stringify(drive.get("waypoints"))).is_equal('[{"x":48,"y":52}]')
	var flight := TravelPlan.request(TravelPlan.MODE_FLIGHT, TravelPlan.orbit_target("p"), points)
	assert_bool(flight.has("waypoints")).is_false()
	var none: Array[Vector2i] = []
	assert_bool(TravelPlan.request(TravelPlan.MODE_GROUND, TravelPlan.orbit_target("p"), none).has("waypoints")).is_false()
	assert_bool(TravelPlan.can_add_waypoint(15)).is_true()
	assert_bool(TravelPlan.can_add_waypoint(16)).is_false()


func test_quote_phases_mass_and_errors() -> void:
	var quote := _quote()
	assert_bool(quote.ok).is_false()
	assert_array(Array(quote.errors)).is_equal(["INSUFFICIENT_FUEL", "TOO_HEAVY"])
	assert_int(quote.launch_ms()).is_equal(270600)
	assert_int(quote.cruise_ms()).is_equal(128400)
	assert_int(quote.landing_ms()).is_equal(271000)
	assert_int(quote.total_ms()).is_equal(670000)
	assert_bool(quote.mass_within_limit()).is_false()
	assert_int(quote.distance_nly).is_equal(3000000)
	assert_object(TravelPlan.Quote.from_wire({"errors": []})).is_null()


func test_quote_without_phases_has_zero_durations() -> void:
	var drive := TravelPlan.Quote.from_wire({"ok": true, "errors": [], "mass": 33.0, "maxMass": 0.0,
		"speedCellsPerMinute": 66.0, "departAt": 10.0, "liftoffAt": 10.0, "cruiseEndAt": 9102.0, "arrivalAt": 9102.0, "fuel": []})
	assert_int(drive.launch_ms()).is_equal(0)
	assert_int(drive.landing_ms()).is_equal(0)
	assert_int(drive.total_ms()).is_equal(9092)
	assert_bool(drive.mass_within_limit()).is_false()


func test_fuel_rows_against_the_own_supply() -> void:
	var quote := _quote()
	var short := quote.short_fuel()
	assert_int(short.size()).is_equal(2)
	assert_int(short[0].missing()).is_equal(4000000)
	var movable := quote.movable_fuel()
	assert_int(movable.size()).is_equal(1)
	assert_str(movable[0].resource).is_equal("HYDROGEN")
	assert_bool(quote.fuel[2].is_short()).is_false()
	assert_int(quote.fuel[2].missing()).is_equal(0)


func test_fuel_move_takes_what_is_missing_from_the_cargo() -> void:
	var quote := _quote()
	var body := TravelPlan.fuel_move_request(quote.short_fuel())
	assert_str(JSON.stringify(body)).is_equal(
		'{"from":"transport","items":[{"amount":4000000,"resource":"HYDROGEN"},{"amount":1000000,"resource":"FUSION_FUEL"}]}')


func test_mover_cells_include_the_guests_in_the_hosts_grid() -> void:
	var ship := _surface(5, Vector3i(10, 10, 0), "[[0,0,0,0],[1,0,0,1]]")
	var guest := _guest(6, Vector3i(1, 0, 1), "[[0,0,0,0]]")
	var cells := TravelPlan.mover_cells(ship, [guest])
	assert_array(cells).contains_exactly_in_any_order([Vector3i(0, 0, 0), Vector3i(1, 0, 0), Vector3i(1, 0, 1)])


func test_site_cells_put_the_lowest_level_on_the_ground() -> void:
	var cells: Array[Vector3i] = [Vector3i(0, 0, 1), Vector3i(1, 0, 1), Vector3i(1, 0, 2)]
	var site := TravelPlan.site_cells(cells, Vector2i(50, 60))
	assert_array(site).contains_exactly([Vector3i(50, 60, 0), Vector3i(51, 60, 0), Vector3i(51, 60, 1)])
	assert_that(TravelPlan.centre_of(cells)).is_equal(Vector2i(0, 0))
	assert_that(TravelPlan.origin_for_centre([Vector3i(0, 0, 0), Vector3i(2, 2, 0)], Vector2i(10, 10))).is_equal(Vector2i(9, 9))


func test_check_site_against_own_structures() -> void:
	var base := _surface(1, Vector3i(40, 44, 0), "[[0,0,0,0],[1,0,0,0]]")
	var taken := TravelPlan.taken_cells([base], 1000)
	var one: Array[Vector3i] = [Vector3i(0, 0, 0)]
	assert_int(TravelPlan.check_site(TravelPlan.site_cells(one, Vector2i(41, 44)), taken, 1000)).is_equal(TravelPlan.Site.OCCUPIED)
	assert_int(TravelPlan.check_site(TravelPlan.site_cells(one, Vector2i(42, 44)), taken, 1000)).is_equal(TravelPlan.Site.TOUCHES_OWN)
	assert_int(TravelPlan.check_site(TravelPlan.site_cells(one, Vector2i(43, 44)), taken, 1000)).is_equal(TravelPlan.Site.OK)
	# Diagonal is no face contact.
	assert_int(TravelPlan.check_site(TravelPlan.site_cells(one, Vector2i(42, 45)), taken, 1000)).is_equal(TravelPlan.Site.OK)
	assert_int(TravelPlan.check_site(TravelPlan.site_cells(one, Vector2i(43, -1)), taken, 1000, 500)).is_equal(TravelPlan.Site.OUT_OF_BOUNDS)


func test_check_site_wraps_around_the_body() -> void:
	var base := _surface(1, Vector3i(0, 5, 0), "[[0,0,0,0]]")
	var taken := TravelPlan.taken_cells([base], 100)
	var one: Array[Vector3i] = [Vector3i(0, 0, 0)]
	assert_int(TravelPlan.check_site(TravelPlan.site_cells(one, Vector2i(99, 5)), taken, 100)).is_equal(TravelPlan.Site.TOUCHES_OWN)
	assert_int(TravelPlan.check_site(TravelPlan.site_cells(one, Vector2i(100, 5)), taken, 100)).is_equal(TravelPlan.Site.OCCUPIED)


func test_suggested_site_keeps_one_field_from_the_base() -> void:
	var base := _surface(1, Vector3i(40, 44, 0), "[[0,0,0,0],[1,0,0,0],[0,1,0,0],[1,1,0,0]]")
	var taken := TravelPlan.taken_cells([base], 1000)
	var ship: Array[Vector3i] = [Vector3i(0, 0, 0), Vector3i(1, 0, 0)]
	var found: Variant = TravelPlan.suggest_site(ship, taken, Vector2i(40, 44), 1000)
	assert_object(found).is_not_null()
	var at: Vector2i = found
	var site := TravelPlan.site_cells(ship, at)
	assert_int(TravelPlan.check_site(site, taken, 1000)).is_equal(TravelPlan.Site.OK)
	# Next to the base: within three fields of it.
	var nearest := 99
	for cell: Vector3i in site:
		nearest = mini(nearest, maxi(absi(cell.x - 40), absi(cell.y - 44)))
	assert_int(nearest).is_less_equal(3)
	assert_object(TravelPlan.suggest_site(ship, taken, Vector2i(40, 44), 1000, 0, 0)).is_null()


func test_ring_cells_go_round_the_middle_nearest_first() -> void:
	assert_array(TravelPlan.ring_cells(0)).is_equal([Vector2i.ZERO])
	var ring := TravelPlan.ring_cells(1)
	assert_int(ring.size()).is_equal(8)
	assert_int(ring[0].length_squared()).is_equal(1)
	assert_int(ring[7].length_squared()).is_equal(2)
	assert_int(TravelPlan.ring_cells(2).size()).is_equal(16)


func test_dock_offset_finds_room_on_the_docks() -> void:
	# Docks on x 2..4, y 0..1; a guest already stands on (2,0)–(2,1).
	var hulls := PackedStringArray(["[0,0,0,0]", "[1,0,0,0]"])
	for y: int in range(0, 2):
		for x: int in range(2, 5):
			hulls.append("[%d,%d,0,1]" % [x, y])
	var host := _surface(1, Vector3i.ZERO, "[%s]" % ",".join(hulls))
	var other := _guest(7, Vector3i(2, 0, 1), "[[0,0,0,0],[0,1,0,0]]")
	var ship: Array[Vector3i] = [Vector3i(0, 0, 0), Vector3i(1, 0, 0), Vector3i(0, 1, 0), Vector3i(1, 1, 0)]
	var found: Variant = TravelPlan.dock_offset(host, [other], ship)
	assert_that(found).is_equal(Vector3i(3, 0, 1))
	var none: Array[StructureLayout] = []
	assert_that(TravelPlan.dock_offset(host, none, ship)).is_equal(Vector3i(2, 0, 1))
	var wide: Array[Vector3i] = [Vector3i(0, 0, 0), Vector3i(3, 0, 0)]
	assert_object(TravelPlan.dock_offset(host, none, wide)).is_null()
	var nothing: Array[Vector3i] = []
	assert_object(TravelPlan.dock_offset(host, none, nothing)).is_null()


func test_drive_points_take_the_shorter_way_round() -> void:
	var stops: Array[Vector2i] = [Vector2i(98, 10)]
	var points := TravelPlan.drive_points(Vector2i(2, 10), stops, Vector2i(5, 12), 100)
	assert_array(points).is_equal([Vector2i(2, 10), Vector2i(-2, 10), Vector2i(5, 12)])
