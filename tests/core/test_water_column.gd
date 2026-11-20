extends GdUnitTestSuite


func test_sea_level_by_body_type() -> void:
	assert_float(WaterColumn.sea_level("EARTH_LIKE")).is_equal(300.0)
	assert_float(WaterColumn.sea_level("OCEAN")).is_equal(650.0)
	assert_float(WaterColumn.sea_level("MOON_ICY")).is_equal(200.0)
	assert_bool(is_nan(WaterColumn.sea_level("DESERT"))).is_true()


func test_water_is_drawn_flat_at_the_sea_level() -> void:
	assert_float(WaterColumn.drawn_elevation(120.0, true, 300.0)).is_equal(300.0)
	# Land, water above the sea level (a vent pool) and bodies without one keep their own.
	assert_float(WaterColumn.drawn_elevation(120.0, false, 300.0)).is_equal(120.0)
	assert_float(WaterColumn.drawn_elevation(700.0, true, 650.0)).is_equal(700.0)
	assert_float(WaterColumn.drawn_elevation(120.0, true, NAN)).is_equal(120.0)


func test_known_depth_from_the_loaded_levels() -> void:
	assert_int(WaterColumn.known_depth({})).is_equal(-1)
	assert_int(WaterColumn.known_depth({0: "PLAINS", -1: "ROCK_LAYER"})).is_equal(0)
	# Only the ground level known: one level (as up to draft.38).
	assert_int(WaterColumn.known_depth({0: "OCEAN"})).is_equal(1)
	assert_int(WaterColumn.known_depth({0: "OCEAN", -1: "ROCK_LAYER"})).is_equal(1)
	# Water at −11 (levels between not loaded): the column reaches at least that far.
	assert_int(WaterColumn.known_depth({0: "DEEP_OCEAN", -11: "DEEP_OCEAN", -12: "ROCK_LAYER"})).is_equal(12)
	assert_int(WaterColumn.known_depth({-3: "OCEAN"})).is_equal(4)
	assert_int(WaterColumn.known_depth({-3: "ROCK_LAYER"})).is_equal(-1)
	assert_int(WaterColumn.known_depth({0: "OCEAN", -80: "OCEAN"})).is_equal(WaterColumn.MAX_DEPTH)


func test_bonus_levels_count_from_the_sea_floor() -> void:
	assert_int(WaterColumn.bonus_levels(2, 0)).is_equal(0)
	assert_int(WaterColumn.bonus_levels(0, 5)).is_equal(0)
	assert_int(WaterColumn.bonus_levels(-3, 0)).is_equal(3)
	assert_int(WaterColumn.bonus_levels(-3, -1)).is_equal(3)
	assert_int(WaterColumn.bonus_levels(-3, 1)).is_equal(3)
	assert_int(WaterColumn.bonus_levels(-4, 5)).is_equal(0)
	assert_int(WaterColumn.bonus_levels(-5, 5)).is_equal(1)


func test_in_column() -> void:
	assert_bool(WaterColumn.in_column(0, 1)).is_true()
	assert_bool(WaterColumn.in_column(-1, 1)).is_false()
	assert_bool(WaterColumn.in_column(-11, 12)).is_true()
	assert_bool(WaterColumn.in_column(-12, 12)).is_false()
	assert_bool(WaterColumn.in_column(1, 12)).is_false()
	assert_bool(WaterColumn.in_column(0, 0)).is_false()
