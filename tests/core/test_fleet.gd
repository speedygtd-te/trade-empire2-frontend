extends GdUnitTestSuite
## Fleet: the own structures from the list, details and movement events.


func _list() -> Array:
	return [
		{"structureId": 1, "name": "Home", "favorite": true, "kind": "base", "capabilities": [],
			"anchor": {"type": "surface", "bodyId": "p1", "offset": {"x": 10, "y": 4, "z": 0}}},
		{"structureId": 2, "name": "Hauler", "favorite": false, "kind": "ship", "capabilities": ["SPACE_DRIVE"],
			"anchor": {"type": "docked", "hostId": 1, "offset": {"x": 2, "y": 0, "z": 1}}},
		{"structureId": 3, "name": "Rover", "favorite": false, "kind": "vehicle", "capabilities": ["GROUND_DRIVE"],
			"anchor": {"type": "surface", "bodyId": "p1", "offset": {"x": 30, "y": 0, "z": 0}}},
		{"structureId": 4, "name": "Station", "favorite": false, "kind": "station", "capabilities": [],
			"anchor": {"type": "free", "kind": "orbit", "bodyId": "m1", "location": "orbit:m1"}},
		{"structureId": 5, "name": "Courier", "favorite": false, "kind": "ship", "capabilities": ["SPACE_DRIVE"],
			"anchor": {"type": "free", "kind": "transit", "location": "transit"}},
	]


func _motion(arrival: int) -> Dictionary:
	return {"mode": "flight", "departAt": 0, "liftoffAt": 100, "cruiseEndAt": arrival, "arrivalAt": arrival,
		"frame": "galaxy", "target": {"type": "orbit", "bodyId": "m1"},
		"legs": [{"from": {"x": 0, "y": 0, "z": 0}, "to": {"x": 5, "y": 0, "z": 0}, "start": 100, "end": arrival}]}


func test_where_each_structure_is() -> void:
	var fleet := Fleet.new()
	fleet.apply_list(_list())

	assert_int(fleet.size()).is_equal(5)
	assert_int(fleet.find(1).where()).is_equal(Fleet.Where.SURFACE)
	assert_int(fleet.find(2).where()).is_equal(Fleet.Where.DOCKED)
	assert_int(fleet.find(4).where()).is_equal(Fleet.Where.ORBIT)
	assert_int(fleet.find(5).where()).is_equal(Fleet.Where.TRANSIT)
	assert_bool(fleet.find(2).can_fly()).is_true()
	assert_bool(fleet.find(3).can_drive()).is_true()
	assert_bool(fleet.find(1).can_fly()).is_false()
	assert_vector(fleet.find(1).offset).is_equal(Vector3i(10, 4, 0))


func test_structures_per_body_follow_hosts_and_skip_the_ones_under_way() -> void:
	var fleet := Fleet.new()
	fleet.apply_list(_list())
	var by_body := fleet.by_body()

	var on_p1: PackedInt64Array = by_body["p1"]
	var on_m1: PackedInt64Array = by_body["m1"]
	assert_array(Array(on_p1)).is_equal([1, 2, 3])
	assert_array(Array(on_m1)).is_equal([4])
	assert_str(fleet.body_of(2)).is_equal("p1")
	assert_str(fleet.body_of(5)).is_empty()
	assert_int(fleet.on_surface("p1").size()).is_equal(2)


func test_places_are_bodies_stood_on_with_the_base_as_main_structure() -> void:
	var fleet := Fleet.new()
	fleet.apply_list(_list())

	var places := fleet.places()

	# The station in orbit and the courier under way stand nowhere.
	assert_int(places.size()).is_equal(1)
	assert_str(places[0].body_id).is_equal("p1")
	assert_array(Array(places[0].structure_ids)).is_equal([1, 2, 3])
	assert_int(places[0].main_id).is_equal(1)


func test_without_a_base_the_largest_standing_structure_is_the_main_one() -> void:
	var fleet := Fleet.new()
	fleet.apply_list([
		{"structureId": 7, "name": "Small", "kind": "vehicle", "totalModules": 2,
			"anchor": {"type": "surface", "bodyId": "m2"}},
		{"structureId": 8, "name": "Big", "kind": "vehicle", "totalModules": 9,
			"anchor": {"type": "surface", "bodyId": "m2"}},
		{"structureId": 9, "name": "Bigger docked", "kind": "ship", "totalModules": 20,
			"anchor": {"type": "docked", "hostId": 7}},
	])

	var places := fleet.places()

	assert_int(places.size()).is_equal(1)
	assert_int(places[0].main_id).is_equal(8)
	assert_int(places[0].structure_ids.size()).is_equal(3)


func test_movables_are_the_structures_with_a_drive() -> void:
	var fleet := Fleet.new()
	fleet.apply_list(_list())

	var ids: Array[int] = []
	for entry: Fleet.Entry in fleet.movables():
		ids.append(entry.structure_id)

	assert_array(ids).contains_exactly_in_any_order([2, 3, 5])


func test_favourites_come_first_then_by_name() -> void:
	var fleet := Fleet.new()
	fleet.apply_list(_list())
	var names: Array[String] = []
	for entry: Fleet.Entry in fleet.entries():
		names.append(entry.name)

	assert_array(names).is_equal(["Home", "Courier", "Hauler", "Rover", "Station"])


func test_a_new_list_drops_structures_that_are_gone() -> void:
	var fleet := Fleet.new()
	fleet.apply_list(_list())
	fleet.apply_list(_list().slice(0, 2))

	assert_int(fleet.size()).is_equal(2)
	assert_object(fleet.find(5)).is_null()


func test_a_trip_from_start_to_arrival() -> void:
	var fleet := Fleet.new()
	fleet.apply_list(_list())

	# Started: still docked while launching, but moving.
	assert_bool(fleet.apply_event("travel.started", {"structureId": 2, "motion": _motion(5000)})).is_true()
	assert_int(fleet.find(2).where()).is_equal(Fleet.Where.DOCKED)
	assert_bool(fleet.find(2).is_moving(50)).is_true()
	# Lifted off.
	fleet.apply_event("structure.anchorChanged", {"structureId": 2, "anchor": {"type": "free", "kind": "transit", "location": "transit"}})
	assert_int(fleet.find(2).where()).is_equal(Fleet.Where.TRANSIT)
	assert_str(fleet.body_of(2)).is_empty()
	# Arrived in orbit.
	fleet.apply_event("travel.arrived", {"structureId": 2, "anchor": {"type": "free", "kind": "orbit", "bodyId": "m1"}})
	assert_int(fleet.find(2).where()).is_equal(Fleet.Where.ORBIT)
	assert_object(fleet.find(2).motion).is_null()
	assert_bool(fleet.find(2).is_moving(6000)).is_false()


func test_events_of_unknown_structures_change_nothing() -> void:
	var fleet := Fleet.new()
	fleet.apply_list(_list())

	assert_bool(fleet.apply_event("travel.started", {"structureId": 99, "motion": _motion(10)})).is_false()
	assert_bool(fleet.apply_event("module.completed", {"structureId": 1})).is_false()


func test_details_bring_the_motion_and_routes() -> void:
	var fleet := Fleet.new()
	fleet.apply_list(_list())
	fleet.apply_details({"structureId": 5, "name": "Courier", "kind": "ship", "capabilities": ["SPACE_DRIVE"],
		"anchor": {"type": "free", "kind": "transit", "location": "transit"}, "motion": _motion(9000),
		"routeId": 7, "routes": []})

	assert_object(fleet.find(5).motion).is_not_null()
	assert_int(fleet.find(5).motion.arrival_at).is_equal(9000)
	assert_int(fleet.find(5).route_id).is_equal(7)


func test_route_events_mark_the_transporter() -> void:
	var fleet := Fleet.new()
	fleet.apply_list(_list())
	fleet.apply_event("route.created", {"route": {"routeId": 3, "transporterId": 2}})
	assert_int(fleet.find(2).route_id).is_equal(3)

	fleet.apply_event("route.deleted", {"routeId": 3})
	assert_int(fleet.find(2).route_id).is_equal(0)
