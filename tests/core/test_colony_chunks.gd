extends GdUnitTestSuite


func test_chunk_of_floors_negative_cells() -> void:
	assert_that(ColonyChunks.chunk_of(0, 0)).is_equal(Vector2i(0, 0))
	assert_that(ColonyChunks.chunk_of(15, 15)).is_equal(Vector2i(0, 0))
	assert_that(ColonyChunks.chunk_of(16, -1)).is_equal(Vector2i(1, -1))
	assert_that(ColonyChunks.chunk_of(-16, -17)).is_equal(Vector2i(-1, -2))


func test_only_changed_and_new_chunks_are_built_again() -> void:
	var before := ColonyChunks.signatures({Vector2i(0, 0): ["a", 1], Vector2i(1, 0): ["b", 2], Vector2i(2, 0): ["c"]})
	var after := ColonyChunks.signatures({Vector2i(0, 0): ["a", 1], Vector2i(1, 0): ["b", 3], Vector2i(3, 0): ["d"]})

	assert_array(ColonyChunks.changed(before, after)).contains_exactly_in_any_order([Vector2i(1, 0), Vector2i(3, 0)])
	assert_array(ColonyChunks.removed(before, after)).contains_exactly([Vector2i(2, 0)])


func test_nothing_changes_for_the_same_content() -> void:
	var before := ColonyChunks.signatures({Vector2i(0, 0): ["hull_standard_closed", Transform3D.IDENTITY]})
	var after := ColonyChunks.signatures({Vector2i(0, 0): ["hull_standard_closed", Transform3D.IDENTITY]})

	assert_array(ColonyChunks.changed(before, after)).is_empty()
	assert_array(ColonyChunks.removed(before, after)).is_empty()
