extends GdUnitTestSuite


static func _rect(x0: int, y0: int, width: int, height: int) -> Array[Vector2i]:
	var cells: Array[Vector2i] = []
	for y: int in range(y0, y0 + height):
		for x: int in range(x0, x0 + width):
			cells.append(Vector2i(x, y))
	return cells


## Closeness at a point given in cells (absolute), read from the sample it falls in.
static func _at(field: GlowField.Field, x: float, y: float) -> float:
	var i := floori((x - field.low.x) * field.per_cell)
	var j := floori((y - field.low.y) * field.per_cell)
	return field.at(i, j)


func test_an_empty_footprint_gives_an_empty_field() -> void:
	var empty: Array[Vector2i] = []
	var field := GlowField.build(empty, 3, 2)

	assert_bool(field.is_empty()).is_true()
	assert_that(field.cells).is_equal(Vector2i.ZERO)


func test_the_grid_covers_the_footprint_and_the_margin() -> void:
	var field := GlowField.build(_rect(10, -4, 5, 3), 3, 2)

	assert_that(field.low).is_equal(Vector2i(7, -7))
	assert_that(field.cells).is_equal(Vector2i(11, 9))
	assert_that(field.samples()).is_equal(Vector2i(22, 18))
	assert_int(field.values.size()).is_equal(22 * 18)


func test_full_on_the_footprint_and_nothing_at_the_margin() -> void:
	var field := GlowField.build(_rect(0, 0, 4, 4), 3, 2)

	assert_float(_at(field, 0.25, 0.25)).is_equal(1.0)
	assert_float(_at(field, 2.25, 1.75)).is_equal(1.0)
	# The outermost samples lie 2.75 cells off; the corners further still.
	assert_float(_at(field, -2.75, 2.0)).is_less(0.1)
	assert_float(_at(field, -2.75, -2.75)).is_equal(0.0)
	assert_float(_at(field, 6.75, 6.75)).is_equal(0.0)


func test_it_falls_off_with_the_distance_from_the_edge() -> void:
	var field := GlowField.build(_rect(0, 0, 3, 3), 3, 2)

	# Samples straight out from the right edge, half a cell apart.
	var previous := 1.0
	for step: int in 6:
		var value := _at(field, 3.25 + step * 0.5, 1.25)
		assert_float(value).is_less(previous)
		assert_float(value).is_equal_approx(1.0 - (0.25 + step * 0.5) / 3.0, 0.01)
		previous = value


func test_corners_round_off() -> void:
	var field := GlowField.build(_rect(0, 0, 2, 2), 3, 2)

	# 1.25 cells out beyond a corner (both ways) is further off than 1.25 cells beside a side.
	var side := _at(field, 3.25, 1.25)
	var corner := _at(field, 3.25, 3.25)
	assert_float(corner).is_less(side)
	assert_float(side).is_equal_approx(1.0 - 1.25 / 3.0, 0.01)
	assert_float(corner).is_equal_approx(1.0 - sqrt(2.0 * 1.25 * 1.25) / 3.0, 0.01)


func test_an_l_keeps_its_inner_corner() -> void:
	# An L: a row of four and a column going up from its left end.
	var footprint := _rect(0, 0, 4, 1)
	footprint.append_array(_rect(0, 1, 1, 3))
	var field := GlowField.build(footprint, 3, 2)

	# One cell into the notch, next to both arms: as bright as one cell beside a straight side.
	var notch := _at(field, 1.25, 1.25)
	assert_float(notch).is_equal_approx(_at(field, 4.25, 0.5), 0.01)
	# Deep in the notch near its far corner it is darker than next to an arm.
	assert_float(_at(field, 3.75, 3.75)).is_less(notch)


func test_the_same_footprint_in_any_order_gives_the_same_field() -> void:
	var footprint := _rect(-3, 5, 4, 2)
	footprint.append(Vector2i(2, 4))
	var shuffled := footprint.duplicate()
	shuffled.reverse()

	assert_array(Array(GlowField.build(shuffled, 3, 2).values)).is_equal(Array(GlowField.build(footprint, 3, 2).values))


func test_a_footprint_across_the_seam_stays_in_one_piece() -> void:
	var footprint: Array[Vector2i] = [Vector2i(999, 0), Vector2i(0, 0), Vector2i(1, 0)]
	var field := GlowField.build(footprint, 2, 1, 1000)

	assert_that(field.low).is_equal(Vector2i(997, -2))
	assert_that(field.cells).is_equal(Vector2i(7, 5))
	assert_float(field.at(4, 2)).is_equal(1.0)


func test_inner_cells_are_full_without_being_stamped() -> void:
	var field := GlowField.build(_rect(0, 0, 5, 5), 2, 3)

	for j: int in range(6, 21):
		for i: int in range(6, 21):
			assert_float(field.at(i, j)).is_equal(1.0)
