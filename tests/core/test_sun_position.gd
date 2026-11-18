extends GdUnitTestSuite

const EPSILON := 0.01


func _equator_world(rotation_s: float = 600.0, orbit_s: float = 1.0e12) -> SunPosition:
	var sun := SunPosition.new()
	sun.rotation_period_s = rotation_s
	# A nearly endless orbit: the star stands still while the body turns.
	sun.orbit_period_s = orbit_s
	return sun


func test_at_start_the_star_is_at_the_zenith_of_the_far_meridian() -> void:
	var sun := _equator_world()

	# Body at angle 0 → star in direction -x; longitude 180° faces -x.
	assert_float(sun.sky_at(0.0, PI, 0.0).elevation).is_equal_approx(PI / 2.0, EPSILON)
	assert_float(sun.sky_at(0.0, 0.0, 0.0).elevation).is_equal_approx(-PI / 2.0, EPSILON)


func test_a_quarter_turn_brings_sunrise_or_sunset() -> void:
	var sun := _equator_world()

	assert_float(sun.sky_at(0.0, PI, 150.0).elevation).is_equal_approx(0.0, EPSILON)


func test_the_sun_rises_in_the_east_on_a_prograde_body() -> void:
	var sun := _equator_world()
	# A quarter turn before noon at longitude 180°: the sun just above the eastern horizon.
	var morning := sun.sky_at(0.0, PI, -140.0)

	assert_float(morning.elevation).is_greater(0.0)
	assert_float(morning.azimuth).is_equal_approx(PI / 2.0, 0.05)


func test_a_retrograde_body_turns_the_other_way() -> void:
	var sun := _equator_world()
	sun.rotation_direction = -1.0
	var morning := sun.sky_at(0.0, PI, 140.0)

	assert_float(morning.elevation).is_greater(0.0)
	assert_float(morning.azimuth).is_equal_approx(PI / 2.0, 0.05)


func test_axial_tilt_makes_seasons() -> void:
	var sun := SunPosition.new()
	sun.rotation_period_s = 600.0
	sun.orbit_period_s = 1.0e12
	sun.axial_tilt = deg_to_rad(23.4)
	# Axis leaning towards -x, where the star is at game time 0: northern summer.
	sun.tilt_azimuth = PI
	var lat := deg_to_rad(45.0)

	assert_float(rad_to_deg(_highest(sun, lat))).is_equal_approx(90.0 - 45.0 + 23.4, 0.3)

	sun.orbit_phase0 = PI
	assert_float(rad_to_deg(_highest(sun, lat))).is_equal_approx(90.0 - 45.0 - 23.4, 0.3)


## Highest sun of one rotation at a latitude (noon).
func _highest(sun: SunPosition, lat: float) -> float:
	var best := -PI
	for step: int in 720:
		var elevation: float = sun.sky_at(lat, 0.0, sun.rotation_period_s * step / 720.0).elevation
		best = maxf(best, elevation)
	return best


func test_solar_day_of_a_prograde_body_is_longer_than_its_rotation() -> void:
	var sun := SunPosition.new()
	sun.rotation_period_s = 8640.0
	sun.orbit_period_s = 3153600.0

	# Like the Earth (both divided by 10): a solar day ~0.27 % longer than the rotation.
	assert_float(sun.solar_day_s()).is_equal_approx(8640.0 / (1.0 - 8640.0 / 3153600.0), 0.5)


func test_cell_angles_follow_the_draft() -> void:
	var angles := SunPosition.cell_angles(70000, 35000, 280000, 70000)

	assert_float(angles.y).is_equal_approx(PI / 2.0, 0.0001)
	assert_float(angles.x).is_equal_approx(0.0, 0.0001)
	# The band edge (y = 0) is at -45°.
	assert_float(SunPosition.cell_angles(0, 0, 280000, 70000).x).is_equal_approx(-PI / 4.0, 0.0001)
