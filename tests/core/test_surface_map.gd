extends GdUnitTestSuite


func _map() -> SurfaceMap:
	var map := SurfaceMap.new(100000, 40000)
	map.view_size = Vector2(500, 400)
	map.cells_per_px = 100.0
	return map


func test_cells_and_screen_points_round_trip() -> void:
	var map := _map()
	map.centre = Vector2(1000, 200)

	assert_that(map.to_screen(Vector2(1000, 200))).is_equal(Vector2(250, 200))
	# North is up: a larger y lies higher on screen.
	assert_that(map.to_screen(Vector2(1100, 300))).is_equal(Vector2(251, 199))
	assert_that(map.to_cell(Vector2(251, 199))).is_equal(Vector2i(1100, 300))


func test_the_nearest_copy_across_the_seam_is_drawn() -> void:
	var map := _map()
	map.centre = Vector2(99900, 0)

	# x = 100 lies 200 cells east of the middle, across the seam.
	assert_that(map.to_screen(Vector2(100, 0))).is_equal(Vector2(252, 200))
	assert_that(map.to_cell(Vector2(252, 200))).is_equal(Vector2i(100, 0))


func test_tapping_beyond_the_band_keeps_y_inside() -> void:
	var map := _map()
	map.centre = Vector2(0, 19990)

	assert_int(map.to_cell(Vector2(250, 0)).y).is_equal(20000)


func test_zoom_stays_between_close_and_the_whole_body_and_keeps_the_anchor() -> void:
	var map := _map()
	map.set_zoom(1.0)
	assert_float(map.cells_per_px).is_equal(SurfaceMap.MIN_CELLS_PER_PX)
	map.set_zoom(1e9)
	assert_float(map.cells_per_px).is_equal(200.0)

	map.set_zoom(100.0)
	map.centre = Vector2(5000, 0)
	var anchor := Vector2(400, 100)
	var before := map.to_cell_f(anchor)
	map.zoom_at(0.5, anchor)
	assert_float(map.cells_per_px).is_equal(50.0)
	assert_float(map.to_cell_f(anchor).x).is_equal_approx(before.x, 0.001)
	assert_float(map.to_cell_f(anchor).y).is_equal_approx(before.y, 0.001)


func test_pan_follows_the_finger_and_wraps() -> void:
	var map := _map()
	map.centre = Vector2(50, 0)

	map.pan(Vector2(10, 10))
	# Dragging right shows what lies west; dragging down shows what lies north.
	assert_float(map.centre.x).is_equal(99050.0)
	assert_float(map.centre.y).is_equal(1000.0)


func test_grid_step_is_a_round_number_far_enough_apart() -> void:
	var map := _map()

	assert_int(map.grid_step(60.0)).is_equal(10000)
	map.cells_per_px = 30.0
	assert_int(map.grid_step(60.0)).is_equal(2000)
	assert_float(map.pixels(5000.0)).is_equal_approx(166.67, 0.01)
