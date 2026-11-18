extends GdUnitTestSuite

const AREA := Vector2(720, 960)


func test_visible_radius_is_half_the_diagonal() -> void:
	# Diagonal of 720 × 960 is 1200 px.
	assert_float(GalaxyCamera.visible_radius(AREA, 0.5)).is_equal(300.0)
	assert_float(GalaxyCamera.units_per_px_for(AREA, 300.0)).is_equal(0.5)


func test_fit_shows_the_whole_galaxy_on_the_short_side() -> void:
	var units := GalaxyCamera.fit_units_per_px(AREA, 57500.0)

	assert_float(units).is_equal_approx(2.0 * 57500.0 * GalaxyCamera.FIT_ROOM / 720.0, 0.0001)


func test_zoom_stays_between_closest_and_whole_galaxy() -> void:
	var widest := GalaxyCamera.fit_units_per_px(AREA, 57500.0)

	assert_float(GalaxyCamera.clamp_units_per_px(0.001, AREA, 57500.0)).is_equal(GalaxyCamera.MIN_UNITS_PER_PX)
	assert_float(GalaxyCamera.clamp_units_per_px(1000.0, AREA, 57500.0)).is_equal(widest)
	assert_float(GalaxyCamera.clamp_units_per_px(3.0, AREA, 57500.0)).is_equal(3.0)


func test_systems_show_from_close_zoom_on() -> void:
	assert_bool(GalaxyCamera.shows_systems(GalaxyCamera.SYSTEMS_FROM)).is_true()
	assert_bool(GalaxyCamera.shows_systems(GalaxyCamera.SYSTEMS_FROM + 1.0)).is_false()


func test_far_share_fades_between_the_limits() -> void:
	assert_float(GalaxyCamera.far_share(5000.0)).is_equal(1.0)
	assert_float(GalaxyCamera.far_share(300.0)).is_equal(0.5)
	assert_float(GalaxyCamera.far_share(50.0)).is_equal(0.0)


func test_request_radius_has_a_margin_and_respects_the_limit() -> void:
	assert_float(GalaxyCamera.request_radius(100.0, 200.0)).is_equal(130.0)
	assert_float(GalaxyCamera.request_radius(180.0, 200.0)).is_equal(200.0)
	assert_float(GalaxyCamera.request_radius(100.0, 52.0)).is_equal(52.0)
	assert_float(GalaxyCamera.request_radius(1000.0, 200.0)).is_equal(0.0)
	assert_float(GalaxyCamera.needed_radius(100.0, 52.0)).is_equal(52.0)
	assert_float(GalaxyCamera.needed_radius(40.0, 52.0)).is_equal(40.0)


func test_cell_size_is_a_power_of_two_of_the_base() -> void:
	assert_float(GalaxyCamera.cell_size(10.0)).is_equal(50.0)
	assert_float(GalaxyCamera.cell_size(800.0)).is_equal(100.0)
	assert_float(GalaxyCamera.cell_size(60000.0)).is_equal(6400.0)


func test_query_has_one_decimal() -> void:
	assert_str(GalaxyCamera.query(Vector3(-5485.81, 2481.66, -15.44), 130.0)).is_equal(
		"x=-5485.8&y=2481.7&z=-15.4&radius=130.0")


func test_scale_length_is_one_two_or_five_times_a_power_of_ten() -> void:
	assert_float(GalaxyCamera.scale_length(160.0)).is_equal(100.0)
	assert_float(GalaxyCamera.scale_length(260.0)).is_equal(200.0)
	assert_float(GalaxyCamera.scale_length(9999.0)).is_equal(5000.0)
	assert_float(GalaxyCamera.scale_length(1.0)).is_equal(1.0)
	assert_float(GalaxyCamera.scale_length(0.2)).is_equal(1.0)


func test_star_scale_follows_the_spacing_within_limits() -> void:
	assert_float(GalaxyCamera.star_scale(GalaxyCamera.STAR_SPACING_PX)).is_equal(1.0)
	assert_float(GalaxyCamera.star_scale(1.0)).is_equal(GalaxyCamera.STAR_SCALE_MIN)
	assert_float(GalaxyCamera.star_scale(1000.0)).is_equal(GalaxyCamera.STAR_SCALE_MAX)


func test_spacing_of_stars_on_screen() -> void:
	# 0.25 stars per ly² → 2 ly apart; at 0.1 ly per px that is 20 px.
	assert_float(GalaxyCamera.spacing_px(0.25, 0.1)).is_equal_approx(20.0, 0.0001)
	assert_float(GalaxyCamera.spacing_px(0.0, 0.1)).is_equal(INF)


func test_glow_grows_with_the_visible_radius() -> void:
	assert_float(GalaxyCamera.glow_share(10.0)).is_equal(0.25)
	assert_float(GalaxyCamera.glow_share(GalaxyCamera.SYSTEMS_FULL * 10.0)).is_equal_approx(0.625, 0.0001)
	assert_float(GalaxyCamera.glow_share(1.0e7)).is_equal(1.0)
