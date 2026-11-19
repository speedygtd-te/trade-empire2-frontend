extends GdUnitTestSuite
## The route marks on the colony view and the system map: which cells and bodies they show.

const RoutePlanTest := preload("res://tests/core/test_route_plan.gd")


func _route(id: int, kind: String, body_a: String, body_b: String, state: String) -> RoutePlan.Route:
	var wire := RoutePlanTest.route_wire(id)
	wire["kind"] = kind
	wire["state"] = state
	wire["stationA"] = {"structureId": 10.0, "bodyId": body_a, "stop": {"x": 5.0, "y": 6.0}}
	wire["stationB"] = {"structureId": 20.0, "bodyId": body_b, "stop": {"x": 9.0, "y": -2.0}}
	return RoutePlan.Route.from_wire(wire)


func test_stop_cells_of_the_body_on_screen_without_paused_routes() -> void:
	var routes: Array[RoutePlan.Route] = [
		_route(1, "ground", "p1", "p1", "travelling"),
		_route(2, "ship", "p1", "m1", "stalled"),
		_route(3, "ground", "p1", "p1", "paused"),
	]

	assert_array(RouteStopLayer.stop_cells(routes, "p1")).is_equal([Vector2i(5, 6), Vector2i(9, -2)])
	assert_array(RouteStopLayer.stop_cells(routes, "m1")).is_equal([Vector2i(9, -2)])
	assert_array(RouteStopLayer.stop_cells(routes, "x")).is_empty()


func test_map_lines_only_for_ship_routes_between_two_bodies() -> void:
	var routes: Array[RoutePlan.Route] = [
		_route(1, "ground", "p1", "p1", "travelling"),
		_route(2, "ship", "p1", "m1", "paused"),
		_route(3, "ship", "p1", "p1", "travelling"),
	]

	assert_array(RouteLines.body_pairs(routes)).is_equal([["p1", "m1", true]])
