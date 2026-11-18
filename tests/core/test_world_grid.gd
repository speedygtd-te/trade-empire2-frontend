extends GdUnitTestSuite


func test_cell_centres_relative_to_the_origin() -> void:
	var origin := Vector3i(100, 200, 0)

	assert_that(WorldGrid.to_scene(Vector3i(100, 200, 0), origin)).is_equal(Vector3(0.5, 0, -0.5))
	assert_that(WorldGrid.to_scene(Vector3i(103, 201, 2), origin)).is_equal(Vector3(3.5, 2, -1.5))


func test_scene_point_back_to_its_cell() -> void:
	var origin := Vector3i(100, 200, 0)

	assert_that(WorldGrid.to_cell(Vector3(3.9, 0.0, -1.1), origin)).is_equal(Vector3i(103, 201, 0))
	assert_that(WorldGrid.to_cell(Vector3(-0.2, 0.0, 0.3), origin)).is_equal(Vector3i(99, 199, 0))


func test_round_trip_for_many_cells() -> void:
	var origin := Vector3i(279990, 5, 0)
	for x: int in range(279980, 280000):
		var cell := Vector3i(x, 7, 0)
		assert_that(WorldGrid.to_cell(WorldGrid.to_scene(cell, origin, 280000), origin, 280000)).is_equal(cell)


func test_wrapping_takes_the_short_way_across_the_seam() -> void:
	assert_int(WorldGrid.wrapped_delta(279998, 1, 280000)).is_equal(3)
	assert_int(WorldGrid.wrapped_delta(1, 279998, 280000)).is_equal(-3)
	assert_int(WorldGrid.wrapped_delta(5, 9, 0)).is_equal(4)


func test_cells_across_the_seam_sit_next_to_each_other() -> void:
	var origin := Vector3i(279999, 0, 0)

	assert_that(WorldGrid.to_scene(Vector3i(0, 0, 0), origin, 280000)).is_equal(Vector3(1.5, 0, -0.5))
	assert_that(WorldGrid.to_cell(Vector3(1.5, 0, -0.5), origin, 280000)).is_equal(Vector3i(0, 0, 0))


func test_wrap_x() -> void:
	assert_int(WorldGrid.wrap_x(-1, 16)).is_equal(15)
	assert_int(WorldGrid.wrap_x(16, 16)).is_equal(0)
	assert_int(WorldGrid.wrap_x(-1, 0)).is_equal(-1)
