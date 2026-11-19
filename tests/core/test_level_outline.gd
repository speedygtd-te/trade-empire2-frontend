extends GdUnitTestSuite


func test_a_single_cell_has_four_outline_edges() -> void:
	var edges := LevelOutline.outline({Vector2i(3, 4): "STARTER"})
	assert_int(edges.size()).is_equal(4)
	assert_bool(edges.has(Vector3i(3, 4, LevelOutline.SIDE_NORTH))).is_true()
	assert_bool(edges.has(Vector3i(3, 4, LevelOutline.SIDE_WEST))).is_true()


func test_shared_sides_are_not_outline() -> void:
	var edges := LevelOutline.outline({Vector2i(0, 0): "STARTER", Vector2i(1, 0): "PLATFORM_OUTDOOR"})
	assert_int(edges.size()).is_equal(6)
	assert_bool(edges.has(Vector3i(0, 0, LevelOutline.SIDE_EAST))).is_false()
	assert_bool(edges.has(Vector3i(1, 0, LevelOutline.SIDE_WEST))).is_false()


func test_no_cells_no_edges() -> void:
	assert_int(LevelOutline.outline({}).size()).is_equal(0)
	assert_int(LevelOutline.type_borders({}).size()).is_equal(0)


func test_type_border_lies_between_different_hulls_once() -> void:
	var cells := {
		Vector2i(0, 0): "STARTER", Vector2i(1, 0): "PLATFORM_OUTDOOR",
		Vector2i(0, 1): "STARTER", Vector2i(1, 1): "PLATFORM_OUTDOOR",
	}
	var borders := LevelOutline.type_borders(cells)
	assert_int(borders.size()).is_equal(2)
	assert_bool(borders.has(Vector3i(0, 0, LevelOutline.SIDE_EAST))).is_true()
	assert_bool(borders.has(Vector3i(0, 1, LevelOutline.SIDE_EAST))).is_true()


func test_same_type_has_no_border() -> void:
	assert_int(LevelOutline.type_borders({Vector2i(0, 0): "STARTER", Vector2i(0, 1): "STARTER"}).size()).is_equal(0)
