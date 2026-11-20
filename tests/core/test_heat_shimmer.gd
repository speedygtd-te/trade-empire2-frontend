extends GdUnitTestSuite


func test_none_on_temperate_and_cold_bodies() -> void:
	assert_float(HeatShimmer.strength(20.0, 1.0)).is_equal(0.0)
	assert_float(HeatShimmer.strength(-180.0, 1.0)).is_equal(0.0)
	assert_float(HeatShimmer.strength(HeatShimmer.START_C, 1.0)).is_equal(0.0)


func test_faint_at_100_and_full_from_400() -> void:
	assert_float(HeatShimmer.strength(100.0, 1.0)).is_equal_approx(HeatShimmer.FAINT, 0.001)
	assert_float(HeatShimmer.strength(80.0, 1.0)).is_between(0.0, HeatShimmer.FAINT)
	assert_float(HeatShimmer.strength(250.0, 1.0)).is_between(HeatShimmer.FAINT, 1.0)
	assert_float(HeatShimmer.strength(400.0, 1.0)).is_equal_approx(1.0, 0.001)
	assert_float(HeatShimmer.strength(900.0, 1.0)).is_equal_approx(1.0, 0.001)


func test_grows_with_temperature() -> void:
	var last := 0.0
	for celsius: float in [70.0, 100.0, 150.0, 300.0, 400.0]:
		var value := HeatShimmer.strength(celsius, 1.0)
		assert_float(value).is_greater(last)
		last = value


func test_weaker_at_night_but_not_gone() -> void:
	var day := HeatShimmer.strength(450.0, 1.0)
	var night := HeatShimmer.strength(450.0, 0.0)
	assert_float(night).is_equal_approx(day * HeatShimmer.NIGHT_SHARE, 0.001)
	assert_float(night).is_greater(0.0)
	assert_float(HeatShimmer.strength(450.0, 0.5)).is_between(night, day)
	# Daylight outside 0..1 (bright stars) is clamped.
	assert_float(HeatShimmer.strength(450.0, 1.4)).is_equal_approx(day, 0.001)


func test_air_carries_the_shimmer() -> void:
	var earth := HeatShimmer.strength(450.0, 1.0, 1.0)
	# No air: no heat haze.
	assert_float(HeatShimmer.strength(450.0, 1.0, 0.0)).is_equal(0.0)
	assert_float(HeatShimmer.strength(450.0, 1.0, 0.01)).is_equal(0.0)
	# Thin air weaker, thick air stronger, capped.
	assert_float(HeatShimmer.strength(450.0, 1.0, 0.25)).is_equal_approx(earth * 0.5, 0.001)
	assert_float(HeatShimmer.strength(450.0, 1.0, 1.44)).is_equal_approx(earth * 1.2, 0.001)
	assert_float(HeatShimmer.strength(450.0, 1.0, 90.0)).is_equal_approx(earth * HeatShimmer.AIR_MAX, 0.001)


func test_shown_by_tier_and_cutaway() -> void:
	assert_float(HeatShimmer.shown(0.8, DetailGovernor.Tier.ULTRA, false)).is_equal_approx(0.8, 0.001)
	assert_float(HeatShimmer.shown(0.8, DetailGovernor.Tier.FAST, false)).is_equal_approx(0.8, 0.001)
	assert_float(HeatShimmer.shown(0.8, DetailGovernor.Tier.MEDIUM, false)).is_equal_approx(
		0.8 * HeatShimmer.MEDIUM_SHARE, 0.001)
	assert_float(HeatShimmer.shown(0.8, DetailGovernor.Tier.SLOW, false)).is_equal(0.0)
	assert_float(HeatShimmer.shown(0.8, DetailGovernor.Tier.FAST, true)).is_equal(0.0)


func test_too_faint_is_off() -> void:
	assert_float(HeatShimmer.shown(0.005, DetailGovernor.Tier.FAST, false)).is_equal(0.0)
	assert_float(HeatShimmer.shown(0.0, DetailGovernor.Tier.FAST, false)).is_equal(0.0)
