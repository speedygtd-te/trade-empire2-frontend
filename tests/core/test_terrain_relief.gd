extends GdUnitTestSuite

const B := SurfaceBlocks.BLOCK


## Loads one block into `surface`: elevation(x, y) per cell, fog where hidden(x, y) is true.
func _load(surface: SurfaceBlocks, block: Vector2i, elevation: Callable, hidden: Callable = Callable(),
		biome: Callable = Callable()) -> void:
	var x0 := block.x * B
	var y0 := block.y * B
	var request := SurfaceBlocks.Request.new()
	request.x0 = x0
	request.y0 = y0
	request.x1 = x0 + B - 1
	request.y1 = y0 + B - 1
	request.blocks.append(block)
	var lines := PackedStringArray()
	lines.append('{"bodyId":"b","x0":%d,"y0":%d,"x1":%d,"y1":%d,"z":0,"rows":%d}' % [x0, y0, x0 + B - 1, y0 + B - 1, B])
	for y: int in range(y0, y0 + B):
		var cells := PackedStringArray()
		for x: int in range(x0, x0 + B):
			var fog: bool = hidden.is_valid() and hidden.call(x, y) == true
			if fog:
				cells.append("null")
			else:
				var e: int = elevation.call(x, y)
				var key: String = biome.call(x, y) if biome.is_valid() else "PLAINS"
				cells.append('{"b":"%s","v":0,"g":0,"e":%d,"m":0}' % [key, e])
		lines.append('{"y":%d,"cells":[%s]}' % [y, ",".join(cells)])
	lines.append('{"end":true,"rows":%d}' % B)
	surface.store(request, SurfacePatch.from_stream(Ndjson.parse("\n".join(lines))))


func _surface(blocks: Array[Vector2i], elevation: Callable, hidden: Callable = Callable(), wrap: int = 0) -> SurfaceBlocks:
	var surface := SurfaceBlocks.new(wrap)
	for block: Vector2i in blocks:
		_load(surface, block, elevation, hidden)
	return surface


func _slope_x(x: int, _y: int) -> int:
	return 100 + 10 * x


func test_water_lies_flat_at_the_sea_level_and_the_shore_blends() -> void:
	var surface := SurfaceBlocks.new()
	# Ocean west of x = 8 over a sea floor that falls to the west; land rising east of it.
	_load(surface, Vector2i(0, 0), func(x: int, _y: int) -> int: return 200 + 10 * x if x < 8 else 310 + 10 * (x - 8),
		Callable(), func(x: int, _y: int) -> String: return "OCEAN" if x < 8 else "PLAINS")
	var relief := TerrainRelief.new(surface)
	# Without a sea level the water follows its floor.
	assert_float(relief.corner(3, 5)).is_equal_approx(225.0, 0.001)
	relief.water_level = WaterColumn.sea_level("EARTH_LIKE")
	relief.clear()
	assert_float(relief.corner(3, 5)).is_equal_approx(300.0, 0.001)
	assert_float(relief.corner(6, 5)).is_equal_approx(300.0, 0.001)
	# The shore corner (two water cells, two land cells at 310) lies at the sea level: the water
	# stays flat up to the bank.
	assert_float(relief.corner(8, 5)).is_equal_approx(300.0, 0.001)
	assert_float(relief.corner(12, 5)).is_equal_approx(345.0, 0.001)
	# A structure on the water stands DECK above the sea level (on a pier); half on land at 310,
	# half on water: the mean of 310 and the deck.
	assert_float(relief.base_of([Vector2i(2, 2), Vector2i(3, 2)])).is_equal_approx(300.0 + TerrainRelief.DECK, 0.001)
	assert_float(relief.base_of([Vector2i(7, 2), Vector2i(8, 2)])).is_equal_approx((310.0 + 300.0 + TerrainRelief.DECK) * 0.5, 0.001)


func test_water_cells_and_the_corners_touching_them_are_wet() -> void:
	var surface := SurfaceBlocks.new()
	_load(surface, Vector2i(0, 0), func(_x: int, _y: int) -> int: return 250,
		Callable(), func(x: int, _y: int) -> String: return "SHALLOW_WATER" if x < 8 else "BEACH")
	var relief := TerrainRelief.new(surface)
	# Without a sea level nothing is drawn as water.
	assert_bool(relief.is_water(3, 3)).is_false()
	relief.water_level = WaterColumn.sea_level("EARTH_LIKE")
	assert_bool(relief.is_water(3, 3)).is_true()
	assert_bool(relief.is_water(8, 3)).is_false()
	# Unloaded cells are no water.
	assert_bool(relief.is_water(3, 40)).is_false()
	# Corner (8, y) lies between the last water cell (7) and the first land cell (8).
	assert_bool(relief.corner_wet(8, 3)).is_true()
	assert_bool(relief.corner_wet(9, 3)).is_false()
	assert_bool(relief.corner_wet(2, 3)).is_true()
	# Without a sea level water keeps its elevation: no deck.
	relief.water_level = NAN
	assert_float(relief.base_of([Vector2i(2, 2)])).is_equal_approx(250.0, 0.001)


func test_a_pad_reaching_into_the_sea_leaves_the_water_flat() -> void:
	var surface := SurfaceBlocks.new()
	# Ocean west of x = 8 (sea level 300), land at 340 east of it; a structure on the shore.
	_load(surface, Vector2i(0, 0), func(x: int, _y: int) -> int: return 200 if x < 8 else 340,
		Callable(), func(x: int, _y: int) -> String: return "OCEAN" if x < 8 else "PLAINS")
	var relief := TerrainRelief.new(surface)
	relief.water_level = WaterColumn.sea_level("EARTH_LIKE")
	var cells: Array[Vector2i] = [Vector2i(6, 4), Vector2i(7, 4), Vector2i(8, 4), Vector2i(9, 4)]
	relief.set_pads([TerrainRelief.Pad.new(cells, 330.0)])
	# Open water beside and under the pad stays at the sea level (no hill of water).
	assert_float(relief.corner(5, 5)).is_equal_approx(300.0, 0.001)
	assert_float(relief.corner(6, 4)).is_equal_approx(300.0, 0.001)
	# The land side is still shaped by the pad.
	assert_float(relief.corner(10, 4)).is_equal_approx(330.0, 0.001)


func test_a_corner_is_the_mean_of_the_known_cells_around_it() -> void:
	var surface := _surface([Vector2i(0, 0)], func(x: int, y: int) -> int: return x * 10 + y)
	var relief := TerrainRelief.new(surface)

	# Cells (4, 4), (5, 4), (4, 5), (5, 5).
	assert_float(relief.corner(5, 5)).is_equal_approx(49.5, 0.001)
	# At the edge of the loaded ground only the known cell counts.
	assert_float(relief.corner(0, 0)).is_equal_approx(0.0, 0.001)
	assert_float(relief.corner(16, 3)).is_equal_approx((152.0 + 153.0) / 2.0, 0.001)


func test_blocks_side_by_side_agree_on_their_shared_edge() -> void:
	var surface := _surface([Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1)],
		func(x: int, y: int) -> int: return 300 + (x * 7 + y * 13) % 23)
	var relief := TerrainRelief.new(surface)

	var left := relief.block_heights(Vector2i(0, 0))
	var right := relief.block_heights(Vector2i(1, 0))
	var up := relief.block_heights(Vector2i(0, 1))
	var side := TerrainRelief.SIDE
	for k: int in range(-1, B + 2):
		# Corner x = 16 is local 16 of the left block and local 0 of the right one.
		assert_float(left[(k + 1) * side + B + 1]).is_equal(right[(k + 1) * side + 1])
		assert_float(left[(B + 1) * side + k + 1]).is_equal(up[side + k + 1])


func test_a_block_arriving_renews_the_edge_of_the_one_beside() -> void:
	var surface := _surface([Vector2i(0, 0)], _slope_x)
	var relief := TerrainRelief.new(surface)
	# Only cells x = 15 are known at corner x = 16.
	assert_float(relief.corner(16, 5)).is_equal_approx(250.0, 0.001)

	_load(surface, Vector2i(1, 0), _slope_x)
	var touched := relief.surface_loaded([Vector2i(1, 0)])

	assert_bool(touched.has(Vector2i(0, 0))).is_true()
	assert_bool(touched.has(Vector2i(2, 1))).is_true()
	assert_float(relief.corner(16, 5)).is_equal_approx(255.0, 0.001)


func test_fog_takes_the_block_means_and_the_reference_where_nothing_is_known() -> void:
	var surface := _surface([Vector2i(0, 0), Vector2i(1, 0)], func(_x: int, _y: int) -> int: return 100,
		func(x: int, _y: int) -> bool: return x >= B)
	var relief := TerrainRelief.new(surface)
	relief.set_reference(40.0)

	# Next to a known cell: that cell.
	assert_float(relief.corner(16, 8)).is_equal_approx(100.0, 0.001)
	# No known cell around: between the block means (100, and 40 for the fogged block).
	assert_float(relief.corner(17, 8)).is_equal_approx(lerpf(100.0, 40.0, 9.0 / 16.0), 0.001)
	assert_float(relief.corner(20, 8)).is_equal_approx(55.0, 0.001)
	# Deep in the fog: the reference.
	assert_float(relief.corner(24, 8)).is_equal_approx(40.0, 0.001)


func test_a_pad_cuts_higher_ground_fills_lower_ground_a_little_and_eases_back() -> void:
	# 3 units per cell: below the height of retaining walls.
	var relief := TerrainRelief.new(_surface([Vector2i(0, 0)], func(x: int, _y: int) -> int: return 100 + 3 * x))
	var cells: Array[Vector2i] = [Vector2i(4, 4), Vector2i(5, 4), Vector2i(4, 5), Vector2i(5, 5)]

	var touched := relief.set_pads([TerrainRelief.Pad.new(cells, 113.5)])

	assert_bool(touched.has(Vector2i(0, 0))).is_true()
	# Uphill edge (corner x = 6, natural 116.5): cut to the base.
	assert_float(relief.corner(6, 5)).is_equal_approx(113.5, 0.001)
	# Downhill edge (corner x = 4, natural 110.5): filled up by FILL of the difference.
	assert_float(relief.corner(4, 5)).is_equal_approx(110.5 + TerrainRelief.FILL * 3.0, 0.001)
	# One corner out: half way back.
	assert_float(relief.corner(7, 5)).is_equal_approx(119.5 + (113.5 - 119.5) * 0.5, 0.001)
	assert_float(relief.corner(3, 5)).is_equal_approx(107.5 + TerrainRelief.FILL * 6.0 * 0.5, 0.001)
	# Two corners out: natural.
	assert_float(relief.corner(8, 5)).is_equal_approx(122.5, 0.001)
	assert_float(relief.corner(2, 5)).is_equal_approx(104.5, 0.001)
	# No terrace, no retaining wall.
	assert_bool(is_nan(relief.levelled_base(6, 5))).is_true()


func test_the_foundation_runs_where_the_ground_lies_lower_than_the_floor() -> void:
	var relief := TerrainRelief.new(_surface([Vector2i(0, 0)], _slope_x))
	var cells: Array[Vector2i] = [Vector2i(4, 4), Vector2i(5, 4), Vector2i(4, 5), Vector2i(5, 5)]
	relief.set_pads([TerrainRelief.Pad.new(cells, 150.0)])

	var walls := relief.foundation(cells, 150.0)

	# West, south and north sides; the east side is cut into the slope.
	assert_int(walls.size()).is_equal(6)
	for wall: TerrainRelief.Wall in walls:
		assert_that(wall.outward).is_not_equal(Vector2i(1, 0))
		assert_float(wall.top).is_equal(150.0)
		assert_float(wall.bottom_a).is_equal(relief.corner(wall.a.x, wall.a.y))
		assert_float(wall.bottom_b).is_equal(relief.corner(wall.b.x, wall.b.y))
		assert_float(minf(wall.bottom_a, wall.bottom_b)).is_less(150.0)
	# A footprint on level ground needs none.
	var flat := TerrainRelief.new(_surface([Vector2i(0, 0)], func(_x: int, _y: int) -> int: return 300))
	flat.set_pads([TerrainRelief.Pad.new(cells, 300.0)])
	assert_int(flat.foundation(cells, 300.0).size()).is_equal(0)


func test_pads_report_the_blocks_they_change_and_nothing_when_unchanged() -> void:
	var relief := TerrainRelief.new(_surface([Vector2i(0, 0), Vector2i(1, 1)], _slope_x))
	var cells: Array[Vector2i] = [Vector2i(15, 15)]

	var first := relief.set_pads([TerrainRelief.Pad.new(cells, 200.0)])

	# The pad's ring reaches over the corner of four blocks.
	for block: Vector2i in [Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1)]:
		assert_bool(first.has(block)).is_true()
	assert_int(relief.set_pads([TerrainRelief.Pad.new(cells, 200.0)]).size()).is_equal(0)
	var none: Array[TerrainRelief.Pad] = []
	assert_bool(relief.set_pads(none).has(Vector2i(0, 0))).is_true()
	assert_float(relief.corner(15, 15)).is_equal_approx((240.0 + 240.0 + 250.0 + 250.0) / 4.0, 0.001)


func test_a_pad_in_one_block_shapes_the_ring_of_the_block_beside() -> void:
	var relief := TerrainRelief.new(_surface([Vector2i(0, 0), Vector2i(1, 0)], _slope_x))
	var cells: Array[Vector2i] = [Vector2i(17, 5)]
	relief.set_pads([TerrainRelief.Pad.new(cells, 100.0)])

	var left := relief.block_heights(Vector2i(0, 0))
	var side := TerrainRelief.SIDE
	# Corner (17, 5) lies in the left block's ring: cut down there as well.
	assert_float(left[(5 + 1) * side + 17 + 1]).is_equal(relief.corner(17, 5))
	assert_float(relief.corner(17, 5)).is_less(265.0)


func test_the_nearer_and_then_the_lower_pad_wins_where_pads_meet() -> void:
	var relief := TerrainRelief.new(_surface([Vector2i(0, 0)], func(_x: int, _y: int) -> int: return 100))
	var left: Array[Vector2i] = [Vector2i(4, 4)]
	var right: Array[Vector2i] = [Vector2i(5, 4)]

	relief.set_pads([TerrainRelief.Pad.new(left, 120.0), TerrainRelief.Pad.new(right, 110.0)])

	# Corner (5, 4) belongs to both footprints: the lower base fills it.
	assert_float(relief.corner(5, 4)).is_equal_approx(100.0 + TerrainRelief.FILL * 10.0, 0.001)
	# Corner (4, 4) is only the left one's.
	assert_float(relief.corner(4, 4)).is_equal_approx(100.0 + TerrainRelief.FILL * 20.0, 0.001)


func test_heights_follow_the_two_triangles_of_a_cell() -> void:
	# A plane is the same on either diagonal.
	assert_float(TerrainRelief.surface_height(0.0, 1.0, 1.0, 2.0, 0.3, 0.6)).is_equal_approx(0.9, 0.0001)
	# A raised north-east corner: split across the other diagonal, so the south-west half is flat.
	assert_bool(TerrainRelief.split(0.0, 0.0, 0.0, 4.0)).is_false()
	assert_float(TerrainRelief.surface_height(0.0, 0.0, 0.0, 4.0, 0.25, 0.25)).is_equal_approx(0.0, 0.0001)
	assert_float(TerrainRelief.surface_height(0.0, 0.0, 0.0, 4.0, 0.75, 0.75)).is_equal_approx(2.0, 0.0001)
	assert_float(TerrainRelief.surface_height(0.0, 0.0, 0.0, 4.0, 1.0, 1.0)).is_equal_approx(4.0, 0.0001)
	assert_bool(TerrainRelief.split(4.0, 0.0, 0.0, 4.0)).is_true()
	# On the ground: at a corner the height is that corner's, in between on the triangles.
	var relief := TerrainRelief.new(_surface([Vector2i(0, 0)], func(x: int, y: int) -> int: return (x * 5 + y * 3) % 11))
	assert_float(relief.height(7.0, 9.0)).is_equal_approx(relief.corner(7, 9), 0.0001)
	var expected := TerrainRelief.surface_height(relief.corner(7, 9), relief.corner(8, 9), relief.corner(7, 10),
		relief.corner(8, 10), 0.2, 0.7)
	assert_float(relief.height(7.2, 9.7)).is_equal_approx(expected, 0.0001)


func test_normals_lean_away_from_the_slope() -> void:
	var relief := TerrainRelief.new(_surface([Vector2i(0, 0)], _slope_x))

	var normal := relief.normal(8.0, 8.0)
	# Rising to the east (+X): the normal leans west; no slope along y (scene Z).
	assert_float(normal.x).is_less(0.0)
	assert_float(normal.z).is_equal_approx(0.0, 0.0001)
	assert_float(normal.x / normal.y).is_equal_approx(-10.0 * TerrainRelief.SCALE, 0.0001)
	var heights := relief.block_heights(Vector2i(0, 0))
	assert_float(TerrainRelief.corner_normal(heights, 5, 5).dot(normal)).is_equal_approx(1.0, 0.0001)
	var flat := TerrainRelief.new(_surface([Vector2i(0, 0)], func(_x: int, _y: int) -> int: return 300))
	assert_that(flat.normal(3.5, 3.5)).is_equal(Vector3.UP)


func test_the_base_is_the_mean_of_the_known_footprint_cells() -> void:
	var relief := TerrainRelief.new(_surface([Vector2i(0, 0)], _slope_x))
	var cells: Array[Vector2i] = [Vector2i(1, 1), Vector2i(3, 1), Vector2i(40, 1)]

	assert_float(relief.base_of(cells)).is_equal_approx(120.0, 0.001)
	var unknown: Array[Vector2i] = [Vector2i(40, 40)]
	assert_bool(is_nan(relief.base_of(unknown))).is_true()


func test_corners_wrap_around_the_seam() -> void:
	var blocks: Array[Vector2i] = [Vector2i(0, 0), Vector2i(1, 0), Vector2i(2, 0), Vector2i(3, 0)]
	var relief := TerrainRelief.new(_surface(blocks, func(x: int, y: int) -> int: return 200 + x + y, Callable(), 64), 64)

	assert_float(relief.corner(64, 5)).is_equal(relief.corner(0, 5))
	assert_float(relief.corner(-1, 5)).is_equal(relief.corner(63, 5))
	# The seam corner sees cells x = 63 and x = 0.
	assert_float(relief.corner(0, 5)).is_equal_approx((267.0 + 268.0 + 204.0 + 205.0) / 4.0, 0.001)


func test_scene_heights_count_from_the_reference() -> void:
	var relief := TerrainRelief.new(SurfaceBlocks.new())
	assert_bool(relief.has_reference()).is_false()

	relief.set_reference(600.0)

	assert_bool(relief.has_reference()).is_true()
	assert_float(relief.scene_height(610.0)).is_equal_approx(10.0 * TerrainRelief.SCALE, 0.0001)
	assert_float(relief.scene_height(600.0)).is_equal(0.0)


func test_a_foundation_three_quarters_of_a_cell_tall_becomes_a_retaining_wall() -> void:
	# The ground rises a whole cell per cell to the east (10 units).
	var relief := TerrainRelief.new(_surface([Vector2i(0, 0)], _slope_x))
	var cells: Array[Vector2i] = [Vector2i(4, 4), Vector2i(5, 4), Vector2i(4, 5), Vector2i(5, 5)]
	relief.set_pads([TerrainRelief.Pad.new(cells, 150.0)])

	var walls := relief.foundation(cells, 150.0)

	var retaining := 0
	for wall: TerrainRelief.Wall in walls:
		assert_bool(wall.cut).is_false()
		if wall.outward == Vector2i(-1, 0):
			# West: filled up to 139.5 below a floor at 150.
			assert_bool(wall.retaining).is_true()
		if wall.a.x == 6 or wall.b.x == 6:
			# The east halves of the north and south sides fall only to 146.5, and the cut side
			# beside them has no foundation to join: plain.
			assert_float(150.0 - minf(wall.bottom_a, wall.bottom_b)).is_less(TerrainRelief.WALL)
			assert_bool(wall.retaining).is_false()
		if wall.retaining:
			retaining += 1
	# West (2), and the west halves of the north and south sides.
	assert_int(retaining).is_equal(4)
	# Gentle ground (3 units per cell) keeps the plain foundation everywhere.
	var gentle := TerrainRelief.new(_surface([Vector2i(0, 0)], func(x: int, _y: int) -> int: return 100 + 3 * x))
	gentle.set_pads([TerrainRelief.Pad.new(cells, 115.0)])
	assert_int(gentle.foundation(cells, 115.0).size()).is_greater(0)
	for wall: TerrainRelief.Wall in gentle.foundation(cells, 115.0):
		assert_bool(wall.retaining).is_false()


func test_a_lower_side_between_two_retaining_ones_joins_them() -> void:
	# South of a row of five cells the ground drops 24 units, but not beside the middle one: the
	# corners there lie 4.2 below the floor (8.4 elsewhere).
	var drop := func(x: int, y: int) -> int:
		if y >= 4:
			return 200
		return 200 - (0 if x == 5 else 24)
	var relief := TerrainRelief.new(_surface([Vector2i(0, 0)], drop))
	var cells: Array[Vector2i] = [Vector2i(3, 4), Vector2i(4, 4), Vector2i(5, 4), Vector2i(6, 4), Vector2i(7, 4)]
	relief.set_pads([TerrainRelief.Pad.new(cells, 200.0)])

	var south := 0
	for wall: TerrainRelief.Wall in relief.foundation(cells, 200.0):
		if wall.outward == Vector2i(0, -1):
			south += 1
			assert_bool(wall.retaining).is_true()
	assert_int(south).is_equal(5)


func test_ground_rising_steeply_beside_a_pad_is_levelled_into_a_terrace() -> void:
	var relief := TerrainRelief.new(_surface([Vector2i(0, 0)], _slope_x))
	var cells: Array[Vector2i] = [Vector2i(4, 4), Vector2i(5, 4), Vector2i(4, 5), Vector2i(5, 5)]

	relief.set_pads([TerrainRelief.Pad.new(cells, 150.0)])

	# East of the footprint the ground rises to 165 at the ring's outer corners: a terrace, around
	# the footprint's corners too (they join the terrace beside them).
	for y: int in range(3, 7):
		assert_float(relief.levelled_base(6, y)).is_equal(150.0)
	# Beside the footprint to the north it rises only to 150 on average; west it falls.
	assert_bool(is_nan(relief.levelled_base(5, 6))).is_true()
	assert_bool(is_nan(relief.levelled_base(7, 4))).is_true()
	assert_bool(is_nan(relief.levelled_base(3, 4))).is_true()
	# The terrace is flat at the base; the ground beyond keeps its natural height at the wall.
	assert_float(relief.height(6.5, 4.5)).is_equal(150.0)
	assert_float(relief.height(6.99, 5.5)).is_equal(150.0)
	assert_float(relief.corner(7, 5)).is_equal_approx(165.0, 0.001)
	assert_float(relief.height(7.01, 5.5)).is_greater(164.0)
	assert_int(relief.levelled_in_block(Vector2i(0, 0)).size()).is_equal(4)

	var walls := relief.cut_walls(cells, 150.0)

	var east := 0
	for wall: TerrainRelief.Wall in walls:
		assert_bool(wall.cut).is_true()
		assert_bool(wall.retaining).is_true()
		assert_float(wall.top_a).is_equal(maxf(relief.corner(wall.a.x, wall.a.y), 150.0))
		assert_float(wall.top_b).is_equal(maxf(relief.corner(wall.b.x, wall.b.y), 150.0))
		assert_float(wall.bottom_a).is_equal(150.0)
		assert_float(wall.bottom_b).is_equal(150.0)
		if wall.a.x == 7 and wall.b.x == 7:
			east += 1
			# It looks back west at the terrace; seen from there, the north end is on the left.
			assert_that(wall.outward).is_equal(Vector2i(-1, 0))
			assert_int(wall.a.y).is_equal(wall.b.y + 1)
			assert_float(wall.top_a).is_equal_approx(165.0, 0.001)
	assert_int(east).is_equal(4)
	# Besides: the ends of the terrace (south of (6, 3), north of (6, 6)) and the steps back to the
	# footprint beside (5, 3) and (5, 6).
	assert_int(walls.size()).is_equal(8)
	# Gentle ground keeps the soft cut.
	var gentle := TerrainRelief.new(_surface([Vector2i(0, 0)], func(x: int, _y: int) -> int: return 100 + 3 * x))
	gentle.set_pads([TerrainRelief.Pad.new(cells, 115.0)])
	assert_int(gentle.cut_walls(cells, 115.0).size()).is_equal(0)
	assert_bool(is_nan(gentle.levelled_base(6, 4))).is_true()


func test_no_terrace_beside_another_footprint() -> void:
	var relief := TerrainRelief.new(_surface([Vector2i(0, 0)], _slope_x))
	var low: Array[Vector2i] = [Vector2i(4, 4)]
	var high: Array[Vector2i] = [Vector2i(7, 4)]

	relief.set_pads([TerrainRelief.Pad.new(low, 140.0), TerrainRelief.Pad.new(high, 170.0)])

	# (5, 4) is the low pad's terrace; (6, 4) lies beside the high pad.
	assert_float(relief.levelled_base(5, 4)).is_equal(140.0)
	assert_bool(is_nan(relief.levelled_base(6, 4))).is_true()
	assert_bool(is_nan(relief.levelled_base(7, 4))).is_true()


func test_terraces_follow_ground_arriving_beside_a_pad() -> void:
	var surface := _surface([Vector2i(0, 0)], _slope_x)
	var relief := TerrainRelief.new(surface)
	relief.set_reference(245.0)
	var cells: Array[Vector2i] = [Vector2i(14, 4), Vector2i(15, 4)]
	relief.set_pads([TerrainRelief.Pad.new(cells, 245.0)])
	# East of the footprint the ground is not loaded yet: no terrace.
	assert_bool(is_nan(relief.levelled_base(16, 4))).is_true()

	_load(surface, Vector2i(1, 0), _slope_x)
	relief.surface_loaded([Vector2i(1, 0)])
	var touched := relief.refresh_pads([Vector2i(1, 0)])

	assert_float(relief.levelled_base(16, 4)).is_equal(245.0)
	assert_bool(touched.has(Vector2i(1, 0))).is_true()
	# Ground arriving far away leaves the pads alone.
	assert_int(relief.refresh_pads([Vector2i(5, 5)]).size()).is_equal(0)
