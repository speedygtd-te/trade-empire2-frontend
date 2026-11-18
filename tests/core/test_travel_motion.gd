extends GdUnitTestSuite
## TravelMotion: the contract's interpolation (floor towards −∞, wrap in x, long galaxy legs),
## phases, progress and burned fuel.


func _flight() -> TravelMotion:
	# Launch rests 0..1000, cruise 1000..11000 over 1 LY in the galaxy frame, landing rests.
	return TravelMotion.from_wire({
		"mode": "flight", "phase": "launching",
		"departAt": 0, "liftoffAt": 1000, "cruiseEndAt": 11000, "arrivalAt": 12000,
		"frame": "galaxy", "target": {"type": "orbit", "bodyId": "p2"},
		"legs": [
			{"from": {"x": 0, "y": 0, "z": 0}, "to": {"x": 0, "y": 0, "z": 0}, "start": 0, "end": 1000},
			{"from": {"x": 0, "y": 0, "z": 0}, "to": {"x": 1000000000, "y": -3, "z": 0}, "start": 1000, "end": 11000},
			{"from": {"x": 1000000000, "y": -3, "z": 0}, "to": {"x": 1000000000, "y": -3, "z": 0}, "start": 11000, "end": 12000},
		],
		"fuel": [{"resource": "HYDROGEN", "total": 10000000, "from": 0, "to": 12000}],
		"warpLevel": 1, "mass": 5,
	})


func test_nothing_is_no_motion() -> void:
	assert_object(TravelMotion.from_wire(null)).is_null()
	assert_object(TravelMotion.from_wire({})).is_null()


func test_position_follows_the_legs() -> void:
	var motion := _flight()

	assert_array(Array(motion.position_at(-5))).is_equal([0, 0, 0])
	assert_array(Array(motion.position_at(500))).is_equal([0, 0, 0])
	assert_array(Array(motion.position_at(6000))).is_equal([500000000, -2, 0])
	assert_array(Array(motion.position_at(99999))).is_equal([1000000000, -3, 0])


func test_negative_steps_round_towards_minus_infinity() -> void:
	# −3 × 1/10 = −0.3 → −1, not 0.
	var motion := _flight()

	assert_int(motion.position_at(2000)[1]).is_equal(-1)
	assert_int(TravelMotion.floor_div(-7, 2)).is_equal(-4)
	assert_int(TravelMotion.floor_div(7, 2)).is_equal(3)
	assert_int(TravelMotion.floor_div(-8, 2)).is_equal(-4)


func test_long_galaxy_legs_do_not_overflow() -> void:
	# 1000 LY in nLY over 44 h: the plain product would pass 2^63.
	var span := 44 * 3600 * 1000
	var far := 1000 * TravelMotion.NLY_PER_LY
	var motion := TravelMotion.from_wire({
		"mode": "flight", "departAt": 0, "liftoffAt": 0, "cruiseEndAt": span, "arrivalAt": span,
		"frame": "galaxy", "target": {"type": "orbit", "bodyId": "x"},
		"legs": [{"from": {"x": -far, "y": 0, "z": 0}, "to": {"x": far, "y": 0, "z": 0}, "start": 0, "end": span}],
	})

	var half := 22 * 3600 * 1000
	var quarter := 11 * 3600 * 1000
	assert_int(motion.position_at(half)[0]).is_equal(0)
	assert_int(motion.position_at(quarter)[0]).is_equal(-500 * TravelMotion.NLY_PER_LY)
	assert_int(motion.position_at(span - 1)[0]).is_less(far)
	assert_int(motion.position_at(span - 1)[0]).is_greater(999 * TravelMotion.NLY_PER_LY)


func test_ground_cells_wrap_around_the_body() -> void:
	var motion := TravelMotion.from_wire({
		"mode": "ground", "departAt": 0, "liftoffAt": 0, "cruiseEndAt": 1000, "arrivalAt": 1000,
		"frame": "body", "bodyId": "p1", "gridSizeX": 100,
		"target": {"type": "surface", "bodyId": "p1", "x": 4, "y": 0},
		"legs": [{"from": {"x": 96, "y": 0, "z": 0}, "to": {"x": 104, "y": 0, "z": 0}, "start": 0, "end": 1000}],
	})

	assert_array(Array(motion.position_at(250))).is_equal([98, 0, 0])
	assert_array(Array(motion.position_at(750))).is_equal([2, 0, 0])
	assert_array(Array(motion.position_at(5000))).is_equal([4, 0, 0])
	assert_int(motion.phase_at(500)).is_equal(TravelMotion.Phase.DRIVING)


func test_phases_progress_and_remaining_time() -> void:
	var motion := _flight()

	assert_int(motion.phase_at(0)).is_equal(TravelMotion.Phase.LAUNCHING)
	assert_int(motion.phase_at(1000)).is_equal(TravelMotion.Phase.CRUISE)
	assert_int(motion.phase_at(11500)).is_equal(TravelMotion.Phase.LANDING)
	assert_int(motion.phase_at(12000)).is_equal(TravelMotion.Phase.ARRIVED)
	assert_float(motion.progress_at(6000)).is_equal_approx(0.5, 0.0001)
	assert_int(motion.remaining_ms(10000)).is_equal(2000)
	assert_int(motion.remaining_ms(20000)).is_equal(0)
	assert_str(motion.target_type()).is_equal("orbit")
	assert_str(motion.target_body_id()).is_equal("p2")


func test_burned_fuel_grows_with_the_trip() -> void:
	var motion := _flight()
	var burn := motion.fuel[0]

	assert_int(motion.fuel_burned_at(burn, 0)).is_equal(0)
	assert_int(motion.fuel_burned_at(burn, 3000)).is_equal(2500000)
	assert_int(motion.fuel_burned_at(burn, 12000)).is_equal(10000000)
