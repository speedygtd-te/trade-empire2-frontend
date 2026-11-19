extends GdUnitTestSuite


func test_blocks_are_aligned_to_sixteen_cells() -> void:
	var blocks := SurfaceBlocks.new()

	assert_that(blocks.block_of(0, 0)).is_equal(Vector2i(0, 0))
	assert_that(blocks.block_of(15, 31)).is_equal(Vector2i(0, 1))
	assert_that(blocks.block_of(-1, -16)).is_equal(Vector2i(-1, -1))


func test_a_row_of_missing_blocks_is_one_request() -> void:
	var blocks := SurfaceBlocks.new()

	var requests := blocks.missing_around(0, 0, 1)

	assert_int(requests.size()).is_equal(3)
	var first := requests[0]
	assert_int(first.x0).is_equal(-16)
	assert_int(first.x1).is_equal(31)
	assert_int(first.y0).is_equal(-16)
	assert_int(first.y1).is_equal(-1)
	assert_int(first.blocks.size()).is_equal(3)


func test_requested_blocks_are_not_asked_for_twice() -> void:
	var blocks := SurfaceBlocks.new()
	blocks.missing_around(0, 0, 1)

	assert_int(blocks.missing_around(0, 0, 1).size()).is_equal(0)
	# Moving one block to the right only asks for the new column, one block per row.
	var more := blocks.missing_around(16, 0, 1)
	assert_int(more.size()).is_equal(3)
	assert_int(more[0].x0).is_equal(32)
	assert_int(more[0].x1).is_equal(47)


func test_a_forgotten_request_is_asked_for_again() -> void:
	var blocks := SurfaceBlocks.new()
	var first := blocks.missing_around(0, 0, 0)

	blocks.forget(first[0])

	assert_int(blocks.missing_around(0, 0, 0).size()).is_equal(1)


func test_requests_never_cross_the_seam() -> void:
	var blocks := SurfaceBlocks.new(64)

	var requests := blocks.missing_around(0, 0, 1)

	# Row of blocks 3 (x 48..63), 0 and 1: block 3 sits before the seam, so two requests.
	assert_int(requests.size()).is_equal(6)
	assert_int(requests[0].x0).is_equal(48)
	assert_int(requests[0].x1).is_equal(63)
	assert_int(requests[1].x0).is_equal(0)
	assert_int(requests[1].x1).is_equal(31)


func test_smaller_blocks_ask_for_less() -> void:
	var blocks := SurfaceBlocks.new(64, 4)

	assert_int(blocks.block_size).is_equal(4)
	assert_that(blocks.block_of(5, -1)).is_equal(Vector2i(1, -1))
	var requests := blocks.missing_around(5, 2, 0)
	assert_int(requests.size()).is_equal(1)
	assert_int(requests[0].x0).is_equal(4)
	assert_int(requests[0].x1).is_equal(7)
	assert_int(requests[0].y0).is_equal(0)
	assert_int(requests[0].y1).is_equal(3)
	# Wrapped: x = -1 is the last block before the seam (x 60..63).
	assert_that(blocks.block_of(-1, 0)).is_equal(Vector2i(15, 0))


func test_stored_patch_answers_cells_including_wrapped_ones() -> void:
	var blocks := SurfaceBlocks.new(64)
	var requests := blocks.missing_around(60, 0, 0)
	var patch := SurfacePatch.from_stream(Ndjson.parse(
		'{"bodyId":"b","x0":48,"y0":0,"x1":63,"y1":0,"z":0,"rows":1}\n'
		+ '{"y":0,"cells":[' + ",".join(PackedStringArray(range(16).map(
			func(_i: int) -> String: return '{"b":"PLAINS","v":0,"g":0,"e":0,"m":0}'))) + ']}\n'
		+ '{"end":true,"rows":1}'
	))

	blocks.store(requests[0], patch)

	assert_bool(blocks.is_loaded(Vector2i(3, 0))).is_true()
	assert_str(blocks.cell(63, 0).biome).is_equal("PLAINS")
	assert_str(blocks.cell(-1, 0).biome).is_equal("PLAINS")
	assert_object(blocks.cell(0, 0)).is_null()
