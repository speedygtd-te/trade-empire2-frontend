extends GdUnitTestSuite


func _relief() -> TerrainRelief:
	var relief := TerrainRelief.new(SurfaceBlocks.new())
	relief.set_reference(100.0)
	return relief


func _wall(a: Vector2i, b: Vector2i, outward: Vector2i, tops: Vector2, feet: Vector2, cut: bool) -> TerrainRelief.Wall:
	var wall := TerrainRelief.Wall.new()
	wall.a = a
	wall.b = b
	wall.outward = outward
	wall.top_a = tops.x
	wall.top_b = tops.y
	wall.top = maxf(tops.x, tops.y)
	wall.bottom_a = feet.x
	wall.bottom_b = feet.y
	wall.retaining = true
	wall.cut = cut
	return wall


func _of(pieces: Array[RetainingWalls.Piece], file: String) -> Array[RetainingWalls.Piece]:
	var result: Array[RetainingWalls.Piece] = []
	for piece: RetainingWalls.Piece in pieces:
		if piece.file == file:
			result.append(piece)
	return result


func test_a_foundation_wall_reaches_from_the_floor_into_the_ground() -> void:
	# Along the south side of cell (0, 0): floor at 120 (scene 2.0), ground at 100 and 105.
	var walls: Array[TerrainRelief.Wall] = [_wall(Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, -1),
		Vector2(120.0, 120.0), Vector2(100.0, 105.0), false)]

	var pieces := RetainingWalls.pieces(walls, _relief(), Vector3i.ZERO, 0)

	var panels := _of(pieces, RetainingWalls.PANEL)
	assert_int(panels.size()).is_equal(1)
	var panel := panels[0].placed
	# It looks south (scene +Z) and runs east from a to b.
	assert_that(panel.basis.z).is_equal(Vector3(0.0, 0.0, 1.0))
	assert_float(panel.basis.x.x).is_equal_approx(1.0, 0.0001)
	# The top at the floor along all of it, the foot below the lower ground.
	var half := RetainingWalls.LENGTH * 0.5
	assert_float((panel * Vector3(-half, 1.0, 0.0)).y).is_equal_approx(2.0, 0.0001)
	assert_float((panel * Vector3(half, 1.0, 0.0)).y).is_equal_approx(2.0, 0.0001)
	assert_float((panel * Vector3(half, 0.0, 0.0)).y).is_less_equal(-RetainingWalls.SINK + 0.0001)
	# The wall stands on the cell's south edge: corner (0, 0) is scene (0, 0).
	assert_float(panel.origin.x).is_equal_approx(0.5, 0.0001)
	assert_float(panel.origin.z).is_equal_approx(0.0, 0.0001)
	assert_int(_of(pieces, RetainingWalls.CAP).size()).is_equal(1)
	assert_int(_of(pieces, RetainingWalls.FOOTING).size()).is_equal(1)
	assert_int(_of(pieces, RetainingWalls.GUTTER).size()).is_equal(0)
	assert_int(_of(pieces, RetainingWalls.RAIL).size()).is_equal(0)
	# Tall enough at both ends (1.5 cells and more) for weep pipes.
	assert_int(_of(pieces, RetainingWalls.DRAIN).size()).is_equal(1)
	# A pilaster on either end, from the floor into the ground there.
	var columns := _of(pieces, RetainingWalls.COLUMN)
	assert_int(columns.size()).is_equal(2)
	assert_int(_of(pieces, RetainingWalls.COLUMN_CAP).size()).is_equal(2)
	for column: RetainingWalls.Piece in columns:
		assert_float((column.placed * Vector3(0.0, 1.0, 0.0)).y).is_equal_approx(2.0, 0.0001)


func test_a_cut_wall_follows_the_slope_with_its_top() -> void:
	# The terrace lies south of the edge at 100 (scene 0); the ground beyond is at 130 and 125.
	var walls: Array[TerrainRelief.Wall] = [_wall(Vector2i(0, 1), Vector2i(1, 1), Vector2i(0, -1),
		Vector2(130.0, 125.0), Vector2(100.0, 100.0), true)]

	var pieces := RetainingWalls.pieces(walls, _relief(), Vector3i.ZERO, 0)

	var panel := _of(pieces, RetainingWalls.PANEL)[0].placed
	# Extended to the corners, its top meets the ground there.
	assert_float((panel * Vector3(-0.5, 1.0, 0.0)).y).is_equal_approx(3.0, 0.0001)
	assert_float((panel * Vector3(0.5, 1.0, 0.0)).y).is_equal_approx(2.5, 0.0001)
	# Its foot stays below the terrace all along.
	var half := RetainingWalls.LENGTH * 0.5
	assert_float((panel * Vector3(-half, 0.0, 0.0)).y).is_less_equal(-RetainingWalls.SINK + 0.0001)
	assert_float((panel * Vector3(half, 0.0, 0.0)).y).is_less_equal(-RetainingWalls.SINK + 0.0001)
	# Upright: the shear moves points up and down only.
	assert_float((panel * Vector3(0.3, 0.0, 0.0)).x - (panel * Vector3(0.3, 1.0, 0.0)).x).is_equal_approx(0.0, 0.0001)
	# The coping follows the same slope.
	var cap := _of(pieces, RetainingWalls.CAP)[0].placed
	assert_float((cap * Vector3(0.5, 0.0, 0.0)).y).is_equal_approx(2.5, 0.0001)
	assert_int(_of(pieces, RetainingWalls.GUTTER).size()).is_equal(1)
	assert_int(_of(pieces, RetainingWalls.FOOTING).size()).is_equal(0)
	# 2.5 cells and more: a railing on top.
	assert_int(_of(pieces, RetainingWalls.RAIL).size()).is_equal(1)
	var low: Array[TerrainRelief.Wall] = [_wall(Vector2i(0, 1), Vector2i(1, 1), Vector2i(0, -1),
		Vector2(108.0, 109.0), Vector2(100.0, 100.0), true)]
	assert_int(_of(RetainingWalls.pieces(low, _relief(), Vector3i.ZERO, 0), RetainingWalls.RAIL).size()).is_equal(0)


func test_walls_meeting_at_a_corner_share_one_pilaster_and_plain_walls_have_no_pieces() -> void:
	var south := _wall(Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, -1), Vector2(120.0, 120.0), Vector2(100.0, 100.0), false)
	var east := _wall(Vector2i(1, 0), Vector2i(1, 1), Vector2i(1, 0), Vector2(120.0, 120.0), Vector2(100.0, 100.0), false)
	var plain := _wall(Vector2i(1, 1), Vector2i(0, 1), Vector2i(0, 1), Vector2(120.0, 120.0), Vector2(115.0, 115.0), false)
	plain.retaining = false
	var walls: Array[TerrainRelief.Wall] = [south, east, plain]

	var pieces := RetainingWalls.pieces(walls, _relief(), Vector3i.ZERO, 0)

	# Corners (0, 0), (1, 0) and (1, 1); the plain wall adds nothing.
	assert_int(_of(pieces, RetainingWalls.COLUMN).size()).is_equal(3)
	assert_int(_of(pieces, RetainingWalls.PANEL).size()).is_equal(2)
	# A wall falling to the base at its end leaves out the pilaster there.
	var wing := _wall(Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, -1), Vector2(100.0, 115.0), Vector2(100.0, 100.0), true)
	var wing_walls: Array[TerrainRelief.Wall] = [wing]
	assert_int(_of(RetainingWalls.pieces(wing_walls, _relief(), Vector3i.ZERO, 0), RetainingWalls.COLUMN).size()).is_equal(1)


func test_a_panel_is_stretched_from_its_top_to_below_its_lower_foot() -> void:
	assert_float(RetainingWalls.panel_stretch(2.0, 2.0, 0.0, 0.5)).is_equal_approx(2.0 + RetainingWalls.SINK, 0.0001)
	assert_float(RetainingWalls.panel_stretch(3.0, 2.0, 0.0, 0.0)).is_equal_approx(
		2.5 + RetainingWalls.SINK + RetainingWalls.LENGTH * 0.5, 0.0001)


func test_a_corner_point_is_the_south_west_corner_of_its_cell() -> void:
	var point := RetainingWalls.corner_point(Vector2i(3, 2), Vector3i(1, 1, 0), 0)
	assert_that(point).is_equal(Vector3(2.0, 0.0, -1.0))
