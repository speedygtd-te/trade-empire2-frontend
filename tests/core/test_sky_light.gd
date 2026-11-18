extends GdUnitTestSuite

const SUN_LIKE := 5800.0
const EARTH_AIR := 1.0


func test_air_mass_is_one_straight_up_and_large_at_the_horizon() -> void:
	assert_float(SkyLight.air_mass(PI / 2.0)).is_equal_approx(1.0, 0.01)
	assert_float(SkyLight.air_mass(0.0)).is_between(30.0, 45.0)
	assert_float(SkyLight.air_mass(deg_to_rad(30.0))).is_equal_approx(2.0, 0.05)


func test_star_colours_follow_temperature() -> void:
	var red_dwarf := SkyLight.star_color(3300.0)
	var sun := SkyLight.star_color(SUN_LIKE)
	var blue_giant := SkyLight.star_color(20000.0)

	# A 3300 K red dwarf shines orange: about (1.0, 0.71, 0.51).
	assert_float(red_dwarf.r).is_greater(red_dwarf.b * 1.8)
	assert_float(red_dwarf.g).is_less(0.8)
	assert_float(sun.b).is_greater(0.8)
	assert_float(blue_giant.b).is_greater_equal(blue_giant.r)


func test_high_sun_is_nearly_white_low_sun_is_red() -> void:
	var noon := SkyLight.at(deg_to_rad(70.0), SUN_LIKE, EARTH_AIR).sun
	var dusk := SkyLight.at(deg_to_rad(3.0), SUN_LIKE, EARTH_AIR).sun

	assert_float(noon.b / noon.r).is_greater(0.6)
	assert_float(dusk.b / dusk.r).is_less(0.15)
	assert_float(dusk.r).is_less(noon.r)


func test_thicker_air_reddens_and_dims_more() -> void:
	var thin := SkyLight.at(deg_to_rad(10.0), SUN_LIKE, 0.5).sun
	var thick := SkyLight.at(deg_to_rad(10.0), SUN_LIKE, 2.0).sun

	assert_float(thick.b / thick.r).is_less(thin.b / thin.r)
	assert_float(thick.get_luminance()).is_less(thin.get_luminance())


func test_without_air_the_light_stays_white_and_the_sky_black() -> void:
	var low := SkyLight.at(deg_to_rad(3.0), SUN_LIKE, 0.0)

	assert_float(low.sun.b / low.sun.r).is_greater(0.8)
	assert_float(low.sky.get_luminance()).is_equal(0.0)


func test_night_has_no_sun_and_twilight_fades() -> void:
	var dusk := SkyLight.at(deg_to_rad(-3.0), SUN_LIKE, EARTH_AIR)
	var night := SkyLight.at(deg_to_rad(-30.0), SUN_LIKE, EARTH_AIR)

	assert_float(dusk.sun.get_luminance()).is_equal(0.0)
	assert_float(dusk.sky.get_luminance()).is_greater(0.0)
	assert_float(night.sky.get_luminance()).is_equal(0.0)


func test_thin_air_sky_is_blue_at_noon() -> void:
	var sky := SkyLight.at(deg_to_rad(60.0), SUN_LIKE, EARTH_AIR).sky

	assert_float(sky.b).is_greater(sky.r)
