extends GdUnitTestSuite
## RouteBook: the player's routes from the list and the route events.

const RoutePlanTest := preload("res://tests/core/test_route_plan.gd")


func _book() -> RouteBook:
	var book := RouteBook.new()
	var other := RoutePlanTest.route_wire(3)
	other["transporterId"] = 31.0
	other["stationA"] = {"structureId": 20.0, "bodyId": "p1"}
	other["stationB"] = {"structureId": 40.0, "bodyId": "m1"}
	book.apply_list([RoutePlanTest.route_wire(7), other])
	return book


func test_the_list_replaces_the_book() -> void:
	var book := _book()

	assert_int(book.size()).is_equal(2)
	assert_array(book.routes().map(func(route: RoutePlan.Route) -> int: return route.route_id)).is_equal([3, 7])
	book.apply_list([RoutePlanTest.route_wire(9)])
	assert_int(book.size()).is_equal(1)
	assert_object(book.find(7)).is_null()
	assert_object(book.find(9)).is_not_null()


func test_put_and_remove() -> void:
	var book := RouteBook.new()
	book.put(RoutePlan.Route.from_wire(RoutePlanTest.route_wire(5)))
	book.put(RoutePlan.Route.new())

	assert_int(book.size()).is_equal(1)
	assert_bool(book.remove(5)).is_true()
	assert_bool(book.remove(5)).is_false()


func test_routes_of_a_structure() -> void:
	var book := _book()

	assert_int(book.of_transporter(30).route_id).is_equal(7)
	assert_object(book.of_transporter(10)).is_null()
	assert_int(book.involving(20).size()).is_equal(2)
	assert_int(book.involving(10).size()).is_equal(1)
	assert_int(book.involving(99).size()).is_equal(0)


func test_created_and_updated_bring_the_whole_route() -> void:
	var book := _book()
	var changed := RoutePlanTest.route_wire(7)
	changed["name"] = "Renamed"

	assert_bool(book.apply_event("route.updated", {"route": changed})).is_true()
	assert_str(book.find(7).name).is_equal("Renamed")
	assert_bool(book.apply_event("route.created", {"route": RoutePlanTest.route_wire(12)})).is_true()
	assert_int(book.size()).is_equal(3)
	assert_bool(book.apply_event("route.created", {"route": {}})).is_false()


func test_stalled_departed_and_arrived_move_the_route() -> void:
	var book := _book()

	assert_bool(book.apply_event("route.stalled", {"routeId": 7.0, "stationId": 10.0,
		"reason": "INSUFFICIENT_FUEL", "retryAt": 5000.0})).is_true()
	var route := book.find(7)
	assert_int(route.status()).is_equal(RoutePlan.Status.WAITING)
	assert_str(route.station).is_equal("A")
	assert_str(route.stall_reason).is_equal("INSUFFICIENT_FUEL")
	assert_int(route.retry_at).is_equal(5000)
	assert_int(route.next_arrival_at).is_equal(0)

	assert_bool(book.apply_event("route.departed", {"routeId": 7.0, "toStationId": 20.0})).is_true()
	assert_int(route.status()).is_equal(RoutePlan.Status.HEADING)
	assert_str(route.station).is_equal("B")
	assert_str(route.stall_reason).is_empty()

	assert_bool(book.apply_event("travel.started", {"structureId": 30.0, "motion": {"arrivalAt": 77000.0}})).is_true()
	assert_int(route.next_arrival_at).is_equal(77000)
	assert_bool(book.apply_event("travel.started", {"structureId": 99.0, "motion": {}})).is_false()

	assert_bool(book.apply_event("route.arrived", {"routeId": 7.0, "stationId": 10.0})).is_true()
	assert_str(route.station).is_equal("A")


func test_paused_and_deleted() -> void:
	var book := _book()
	book.find(7).stopping = true

	assert_bool(book.apply_event("route.paused", {"routeId": 7.0, "reason": "STATION_MOVED"})).is_true()
	var route := book.find(7)
	assert_int(route.status()).is_equal(RoutePlan.Status.PAUSED)
	assert_str(route.pause_reason).is_equal("STATION_MOVED")

	assert_bool(book.apply_event("route.deleted", {"routeId": 7.0})).is_true()
	assert_object(book.find(7)).is_null()
	assert_bool(book.apply_event("route.deleted", {"routeId": 7.0})).is_false()
	assert_bool(book.apply_event("route.unknown", {"routeId": 3.0})).is_false()


func test_which_events_need_the_whole_route_again() -> void:
	assert_bool(RouteBook.needs_reload("route.arrived")).is_true()
	assert_bool(RouteBook.needs_reload("route.departed")).is_true()
	assert_bool(RouteBook.needs_reload("route.stalled")).is_true()
	assert_bool(RouteBook.needs_reload("route.paused")).is_true()
	assert_bool(RouteBook.needs_reload("route.updated")).is_false()
	assert_bool(RouteBook.needs_reload("route.deleted")).is_false()
