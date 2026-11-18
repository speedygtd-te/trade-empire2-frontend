extends GdUnitTestSuite
## TravelTrack: legs snapped to the visible bodies of the system map, the galaxy position and the
## smooth position of a drive.

const LY := TravelMotion.NLY_PER_LY


## Launch at body A (1, 0, 0 LY), cruise to body B (1.003, 0, 0 LY), landing at B.
func _flight() -> TravelMotion:
	return TravelMotion.from_wire({
		"mode": "flight", "departAt": 0, "liftoffAt": 1000, "cruiseEndAt": 3000, "arrivalAt": 4000,
		"frame": "galaxy", "target": {"type": "surface", "bodyId": "b", "x": 1, "y": 1},
		"legs": [
			{"from": {"x": LY, "y": 0, "z": 0}, "to": {"x": LY, "y": 0, "z": 0}, "start": 0, "end": 1000},
			{"from": {"x": LY, "y": 0, "z": 0}, "to": {"x": LY + 3000000, "y": 0, "z": 0}, "start": 1000, "end": 3000},
			{"from": {"x": LY + 3000000, "y": 0, "z": 0}, "to": {"x": LY + 3000000, "y": 0, "z": 0}, "start": 3000, "end": 4000},
		],
	})


func _anchors() -> Array[TravelTrack.Anchor]:
	return [
		TravelTrack.Anchor.make(Vector3(1.0, 0.0, 0.0), Vector2(100, 0)),
		TravelTrack.Anchor.make(Vector3(1.003, 0.0, 0.0), Vector2(0, 200)),
	]


func test_snap_finds_the_nearest_point_within_reach() -> void:
	assert_that(TravelTrack.snap(Vector3(1.0001, 0, 0), _anchors())).is_equal(Vector2(100, 0))
	assert_object(TravelTrack.snap(Vector3(1.0015, 0, 0), _anchors())).is_null()


func test_map_point_runs_between_the_visible_bodies() -> void:
	var motion := _flight()
	assert_that(TravelTrack.map_point(motion, 500, _anchors())).is_equal(Vector2(100, 0))
	assert_that(TravelTrack.map_point(motion, 2000, _anchors())).is_equal(Vector2(50, 100))
	assert_that(TravelTrack.map_point(motion, 3500, _anchors())).is_equal(Vector2(0, 200))
	assert_that(TravelTrack.map_point(motion, 9999, _anchors())).is_equal(Vector2(0, 200))


func test_legs_outside_the_system_are_not_on_its_map() -> void:
	var motion := _flight()
	var only_a: Array[TravelTrack.Anchor] = [TravelTrack.Anchor.make(Vector3(1.0, 0.0, 0.0), Vector2(100, 0))]
	assert_object(TravelTrack.map_point(motion, 2000, only_a)).is_null()
	assert_int(TravelTrack.map_path(motion, only_a).size()).is_equal(0)
	var path := TravelTrack.map_path(motion, _anchors())
	assert_int(path.size()).is_equal(1)
	assert_that(path[0][1]).is_equal(Vector2(0, 200))


func test_leg_index_and_share() -> void:
	var motion := _flight()
	assert_int(TravelTrack.leg_index(motion, -10)).is_equal(0)
	assert_int(TravelTrack.leg_index(motion, 1500)).is_equal(1)
	assert_int(TravelTrack.leg_index(motion, 99999)).is_equal(2)
	assert_float(TravelTrack.leg_share(motion.legs[1], 1500)).is_equal_approx(0.25, 0.0001)


func test_galaxy_point_in_coordinate_units() -> void:
	var motion := _flight()
	assert_that(TravelTrack.galaxy_point(motion, 2000, 1.0)).is_equal_approx(Vector2(1.0015, 0.0), Vector2(0.000001, 0.000001))
	assert_that(TravelTrack.galaxy_point(motion, 2000, 0.5)).is_equal_approx(Vector2(2.003, 0.0), Vector2(0.000001, 0.000001))
	var ends := TravelTrack.galaxy_ends(motion, 1.0)
	assert_that(ends[1]).is_equal_approx(Vector2(1.003, 0.0), Vector2(0.000001, 0.000001))
	assert_bool(TravelTrack.is_interstellar(motion)).is_false()


func test_a_flight_to_another_system_is_interstellar() -> void:
	var motion := TravelMotion.from_wire({"mode": "flight", "frame": "galaxy", "departAt": 0, "arrivalAt": 10,
		"legs": [{"from": {"x": 0, "y": 0, "z": 0}, "to": {"x": 2 * LY, "y": 0, "z": 0}, "start": 0, "end": 10}]})
	assert_bool(TravelTrack.is_interstellar(motion)).is_true()


func test_ground_point_is_smooth_between_cells() -> void:
	var drive := TravelMotion.from_wire({"mode": "ground", "frame": "body", "bodyId": "p", "gridSizeX": 100,
		"departAt": 0, "arrivalAt": 2000,
		"legs": [
			{"from": {"x": 44, "y": 47, "z": 1}, "to": {"x": 48, "y": 52, "z": 1}, "start": 0, "end": 1000},
			{"from": {"x": 48, "y": 52, "z": 1}, "to": {"x": 50, "y": 50, "z": 1}, "start": 1000, "end": 2000},
		]})
	assert_that(TravelTrack.ground_point(drive, 500)).is_equal(Vector3(46, 49.5, 1))
	assert_that(TravelTrack.ground_point(drive, 1500)).is_equal(Vector3(49, 51, 1))
	assert_that(TravelTrack.ground_point(drive, 5000)).is_equal(Vector3(50, 50, 1))
	assert_object(TravelTrack.map_point(drive, 500, _anchors())).is_null()
