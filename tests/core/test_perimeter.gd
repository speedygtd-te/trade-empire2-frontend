extends GdUnitTestSuite

const WIDTH := 1000


static func _rect(x0: int, y0: int, width: int, height: int) -> Array[Vector2i]:
	var cells: Array[Vector2i] = []
	for y: int in range(y0, y0 + height):
		for x: int in range(x0, x0 + width):
			cells.append(Vector2i(x, y))
	return cells


static func _describe(spots: Array[Perimeter.Spot]) -> Array[String]:
	var lines: Array[String] = []
	for spot: Perimeter.Spot in spots:
		lines.append("%d %d,%d %.3f,%.3f %.4f" % [spot.kind, spot.cell.x, spot.cell.y, spot.direction.x, spot.direction.y, spot.phase])
	return lines


static func _distance(a: Vector2i, b: Vector2i, size_x: int) -> int:
	return maxi(absi(WorldGrid.wrapped_delta(a.x, b.x, size_x)), absi(a.y - b.y))


static func _nearest(cell: Vector2i, footprint: Array[Vector2i], size_x: int) -> int:
	var best := 1 << 30
	for own: Vector2i in footprint:
		best = mini(best, _distance(cell, own, size_x))
	return best


func test_the_same_base_gives_the_same_spots_in_any_order() -> void:
	var footprint := _rect(100, -80, 6, 5)
	var shuffled := footprint.duplicate()
	shuffled.reverse()
	var first := Perimeter.spots(footprint, [], WIDTH)
	var again := Perimeter.spots(shuffled, [], WIDTH)

	assert_bool(first.is_empty()).is_false()
	assert_array(_describe(again)).is_equal(_describe(first))


func test_spots_lie_one_or_two_cells_out_and_never_on_taken_cells() -> void:
	var footprint := _rect(10, 10, 5, 4)
	footprint.append(Vector2i(15, 12))
	var occupied: Array[Vector2i] = [Vector2i(12, 8), Vector2i(17, 12), Vector2i(9, 9)]
	var spots := Perimeter.spots(footprint, occupied, WIDTH)
	var seen: Dictionary = {}

	for spot: Perimeter.Spot in spots:
		var distance := _nearest(spot.cell, footprint, WIDTH)
		assert_int(distance).is_between(1, 2)
		assert_int(spot.distance).is_equal(distance)
		assert_bool(spot.cell in occupied).is_false()
		assert_bool(seen.has(spot.cell)).override_failure_message("twice: %s" % spot.cell).is_false()
		seen[spot.cell] = true


func test_a_small_base_gets_lamps_at_its_outer_corners_and_one_radar() -> void:
	var footprint := _rect(10, 10, 4, 4)
	var spots := Perimeter.spots(footprint, [], WIDTH)
	var lamps: Array[Vector2i] = []
	var radars := 0
	for spot: Perimeter.Spot in spots:
		if spot.kind == Perimeter.Kind.LAMP:
			lamps.append(spot.cell)
		elif spot.kind == Perimeter.Kind.RADAR:
			radars += 1

	assert_array(lamps).contains_exactly_in_any_order([Vector2i(8, 8), Vector2i(15, 8), Vector2i(8, 15), Vector2i(15, 15)])
	assert_int(radars).is_equal(1)


func test_a_large_base_gets_two_radars_far_apart_and_lamps_along_its_sides() -> void:
	var footprint := _rect(0, 0, 12, 6)
	var spots := Perimeter.spots(footprint, [], WIDTH)
	var lamps: Array[Vector2i] = []
	var radars: Array[Vector2i] = []
	for spot: Perimeter.Spot in spots:
		if spot.kind == Perimeter.Kind.LAMP:
			lamps.append(spot.cell)
		elif spot.kind == Perimeter.Kind.RADAR:
			radars.append(spot.cell)

	assert_int(radars.size()).is_equal(2)
	assert_int(_distance(radars[0], radars[1], WIDTH)).is_greater_equal(Perimeter.RADAR_SPACING)
	# The ring is 2 * (16 + 10) - 4 = 48 cells long: more than the four corners carry lamps.
	assert_int(lamps.size()).is_greater(4)
	for a: int in lamps.size():
		for b: int in range(a + 1, lamps.size()):
			assert_int(_distance(lamps[a], lamps[b], WIDTH)).is_greater_equal(Perimeter.LAMP_SPACING)


func test_items_of_different_kinds_never_stand_side_by_side() -> void:
	var footprint := _rect(0, 0, 14, 9)
	var spots := Perimeter.spots(footprint, [], WIDTH)
	for a: int in spots.size():
		for b: int in range(a + 1, spots.size()):
			assert_int(_distance(spots[a].cell, spots[b].cell, WIDTH)).is_greater_equal(Perimeter.ITEM_SPACING)


func test_lamps_point_away_from_the_structure() -> void:
	var footprint := _rect(20, 0, 10, 6)
	for spot: Perimeter.Spot in Perimeter.spots(footprint, [], WIDTH):
		assert_float(spot.direction.length()).is_equal_approx(1.0, 0.0001)
		# Away from every nearest footprint cell.
		for own: Vector2i in footprint:
			if _distance(spot.cell, own, WIDTH) == spot.distance:
				assert_float(spot.direction.dot(Vector2(spot.cell - own))).is_greater(0.0)
		if spot.cell == Vector2i(18, -2):
			assert_vector(spot.direction).is_equal_approx(Vector2(-1, -1).normalized(), Vector2(0.001, 0.001))
		if spot.cell.y == -2 and spot.cell.x >= 21 and spot.cell.x <= 28:
			assert_vector(spot.direction).is_equal_approx(Vector2(0, -1), Vector2(0.001, 0.001))


func test_the_seam_of_the_body_changes_nothing() -> void:
	var size_x := 200
	var across: Array[Vector2i] = _rect(197, 40, 6, 4)
	var wrapped: Array[Vector2i] = []
	for cell: Vector2i in across:
		wrapped.append(Vector2i(WorldGrid.wrap_x(cell.x, size_x), cell.y))
	var from_absolute := Perimeter.spots(across, [Vector2i(-3, 41)], size_x)
	var from_wrapped := Perimeter.spots(wrapped, [Vector2i(197, 41)], size_x)

	assert_array(_describe(from_wrapped)).is_equal(_describe(from_absolute))
	for spot: Perimeter.Spot in from_absolute:
		assert_int(spot.cell.x).is_between(0, size_x - 1)
		assert_int(_nearest(spot.cell, across, size_x)).is_between(1, 2)
		assert_bool(spot.cell == Vector2i(197, 41)).is_false()


func test_the_way_into_a_dock_stays_clear() -> void:
	var footprint := _rect(0, 0, 8, 6)
	var docks: Array[Vector2i] = [Vector2i(7, 2), Vector2i(7, 3)]
	for spot: Perimeter.Spot in Perimeter.spots(footprint, [], WIDTH, docks):
		for dock: Vector2i in docks:
			assert_int(_distance(spot.cell, dock, WIDTH)).is_greater(Perimeter.DOCK_CLEARANCE)


func test_a_dock_field_gets_masts_on_its_outer_ring() -> void:
	# A closed 4×4 base with a 4×3 dock field beside it (as players extend their bases).
	var footprint := _rect(0, 0, 4, 4)
	var docks := _rect(4, 1, 4, 3)
	footprint.append_array(docks)
	var lamps_by_the_docks := 0
	for spot: Perimeter.Spot in Perimeter.spots(footprint, [], WIDTH, docks):
		if spot.kind == Perimeter.Kind.LAMP and _nearest(spot.cell, docks, WIDTH) == 2:
			lamps_by_the_docks += 1
	assert_int(lamps_by_the_docks).is_greater_equal(2)


func test_growing_the_base_changes_only_the_spots_nearby() -> void:
	var before := _rect(0, 0, 24, 4)
	var after := before.duplicate()
	after.append_array(_rect(24, 0, 2, 2))
	var near := Rect2i(Vector2i(14, -12), Vector2i(30, 30))

	assert_array(_far_from(after, near)).is_equal(_far_from(before, near))


func test_an_empty_footprint_has_no_spots() -> void:
	assert_array(Perimeter.spots([], [], WIDTH)).is_empty()


## The spots outside `near` (radars aside: there is one per base, it may move), sorted.
static func _far_from(footprint: Array[Vector2i], near: Rect2i) -> Array[String]:
	var lines: Array[String] = []
	for spot: Perimeter.Spot in Perimeter.spots(footprint, [], WIDTH):
		if spot.kind != Perimeter.Kind.RADAR and not near.has_point(spot.cell):
			lines.append("%d %s" % [spot.kind, spot.cell])
	lines.sort()
	return lines
