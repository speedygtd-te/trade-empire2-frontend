extends GdUnitTestSuite

const B := SurfaceBlocks.BLOCK


## A relief over one block: ocean (sea floor at 200) west of x = 8, land at `land` east of it; sea
## level 300, which is scene height 0.
func _coast(land: int) -> TerrainRelief:
	var x0 := 0
	var y0 := 0
	var request := SurfaceBlocks.Request.new()
	request.x0 = x0
	request.y0 = y0
	request.x1 = B - 1
	request.y1 = B - 1
	request.blocks.append(Vector2i(0, 0))
	var lines := PackedStringArray()
	lines.append('{"bodyId":"b","x0":0,"y0":0,"x1":%d,"y1":%d,"z":0,"rows":%d}' % [B - 1, B - 1, B])
	for y: int in range(y0, y0 + B):
		var cells := PackedStringArray()
		for x: int in range(x0, x0 + B):
			var water := x < 8
			cells.append('{"b":"%s","v":0,"g":0,"e":%d,"m":0}' % ["OCEAN" if water else "PLAINS", 200 if water else land])
		lines.append('{"y":%d,"cells":[%s]}' % [y, ",".join(cells)])
	lines.append('{"end":true,"rows":%d}' % B)
	var surface := SurfaceBlocks.new()
	surface.store(request, SurfacePatch.from_stream(Ndjson.parse("\n".join(lines))))
	var relief := TerrainRelief.new(surface)
	relief.water_level = WaterColumn.sea_level("EARTH_LIKE")
	relief.set_reference(300.0)
	return relief


func _of(pieces: Array[RetainingWalls.Piece], file: String) -> Array[RetainingWalls.Piece]:
	var result: Array[RetainingWalls.Piece] = []
	for piece: RetainingWalls.Piece in pieces:
		if piece.file == file:
			result.append(piece)
	return result


func _walls(relief: TerrainRelief, cells: Array[Vector2i]) -> Array[TerrainRelief.Wall]:
	var base := relief.base_of(cells)
	relief.set_pads([TerrainRelief.Pad.new(cells, base)])
	return relief.foundation(cells, base)


func test_edges_over_water_stand_on_pillars_and_the_shore_keeps_its_wall() -> void:
	var relief := _coast(310)
	# Cells 6, 7 over the water, 8, 9 on land: the base is the mean of the deck and the land.
	var cells: Array[Vector2i] = [Vector2i(6, 4), Vector2i(7, 4), Vector2i(8, 4), Vector2i(9, 4)]
	var walls := _walls(relief, cells)
	var wet: Array[TerrainRelief.Wall] = []
	var dry: Array[TerrainRelief.Wall] = []
	for wall: TerrainRelief.Wall in walls:
		(wet if Piers.is_wet(wall, relief) else dry).append(wall)
	# South and north of cells 6 and 7, and the west end of cell 6.
	assert_int(wet.size()).is_equal(5)
	# South and north of cell 8 run from the shore corner (8, y) onto the land: walls.
	for wall: TerrainRelief.Wall in dry:
		assert_bool(wall.a.x >= 8 and wall.b.x >= 8).is_true()

	var pieces := Piers.pieces(walls, relief, Vector3i.ZERO, 0)
	assert_int(_of(pieces, Piers.BEAM).size()).is_equal(5)
	# A pillar with head and collar on each of the six corners of the wet edges, (6..8, 4..5).
	var pillars := _of(pieces, Piers.PILLAR)
	assert_int(pillars.size()).is_equal(6)
	assert_int(_of(pieces, Piers.HEAD).size()).is_equal(6)
	assert_int(_of(pieces, Piers.COLLAR).size()).is_equal(6)
	assert_int(_of(pieces, RetainingWalls.PANEL).size()).is_equal(0)
	var top := relief.scene_height(relief.base_of(cells))
	for pillar: RetainingWalls.Piece in pillars:
		# From below the water (scene 0) up under the head below the floor.
		assert_float((pillar.placed * Vector3.ZERO).y).is_equal_approx(-Piers.PILLAR_SINK, 0.0001)
		assert_float((pillar.placed * Vector3.UP).y).is_equal_approx(top - Piers.HEAD_HEIGHT, 0.0001)
	for head: RetainingWalls.Piece in _of(pieces, Piers.HEAD):
		assert_float(head.placed.origin.y + Piers.HEAD_HEIGHT).is_equal_approx(top, 0.0001)
	for collar: RetainingWalls.Piece in _of(pieces, Piers.COLLAR):
		assert_float(collar.placed.origin.y + Piers.COLLAR_WATERLINE).is_equal_approx(0.0, 0.0001)
	# The beams lie under the floor's edge, along it, looking out.
	for beam: RetainingWalls.Piece in _of(pieces, Piers.BEAM):
		assert_float(beam.placed.origin.y + Piers.BEAM_HEIGHT).is_equal_approx(top, 0.0001)
		assert_float(beam.placed.basis.x.length()).is_equal_approx(1.0, 0.0001)


func test_tall_pillars_get_braces() -> void:
	# Land at 360: the floor stands (303 + 360) / 2 − 300 = 31.5 units, 3.15 cells over the water.
	var relief := _coast(360)
	var cells: Array[Vector2i] = [Vector2i(7, 4), Vector2i(8, 4)]
	var pieces := Piers.pieces(_walls(relief, cells), relief, Vector3i.ZERO, 0)
	# Wet: south, north and west of cell 7; each with its beam and three braces.
	assert_int(_of(pieces, Piers.BEAM).size()).is_equal(3 + 3 * 3)
	# 3.07 cells under the heads: three braces, a quarter apart.
	var under := 3.15 - Piers.HEAD_HEIGHT
	var heights := Piers.brace_heights(under, 0.0)
	assert_int(heights.size()).is_equal(3)
	for index: int in 3:
		assert_float(heights[index] + Piers.BEAM_HEIGHT * 0.5).is_equal_approx(under * (index + 1) / 4.0, 0.0001)
	assert_int(Piers.brace_heights(0.7, 0.0).size()).is_equal(0)
	assert_int(Piers.brace_heights(9.0, 0.0).size()).is_equal(Piers.MAX_BRACES)
	# A pier hardly above the water stands without braces.
	assert_float(Piers.pillar_stretch(0.4, 0.0)).is_equal_approx(0.4 - Piers.HEAD_HEIGHT + Piers.PILLAR_SINK, 0.0001)


func test_a_structure_all_on_water_stands_on_the_deck() -> void:
	var relief := _coast(310)
	var cells: Array[Vector2i] = [Vector2i(2, 2), Vector2i(3, 2), Vector2i(2, 3), Vector2i(3, 3)]
	var walls := _walls(relief, cells)
	# Eight edges, all over water, each a pier edge; no brace at 0.3 cells.
	assert_int(walls.size()).is_equal(8)
	var pieces := Piers.pieces(walls, relief, Vector3i.ZERO, 0)
	assert_int(_of(pieces, Piers.BEAM).size()).is_equal(8)
	assert_int(_of(pieces, Piers.PILLAR).size()).is_equal(8)
	assert_float(relief.scene_height(relief.base_of(cells))).is_equal_approx(TerrainRelief.DECK * TerrainRelief.SCALE, 0.0001)


func test_walls_holding_back_a_slope_are_never_piers() -> void:
	var relief := _coast(310)
	var wall := TerrainRelief.Wall.new()
	wall.a = Vector2i(2, 2)
	wall.b = Vector2i(3, 2)
	wall.cut = true
	assert_bool(Piers.is_wet(wall, relief)).is_false()
	wall.cut = false
	assert_bool(Piers.is_wet(wall, relief)).is_true()
	# Without a sea level nothing is wet.
	relief.water_level = NAN
	assert_bool(Piers.is_wet(wall, relief)).is_false()


func test_a_prop_in_the_water_stands_on_a_caisson() -> void:
	var piece := Piers.caisson(Vector3(2.0, 0.0, -3.0), 0.5, Piers.caisson_size(Perimeter.Kind.LAMP))
	assert_str(piece.file).is_equal(Piers.CAISSON)
	# Its foot CAISSON_SINK below the water, its top CAISSON_SHOWS above.
	assert_float(piece.placed.origin.y).is_equal_approx(0.5 - Piers.CAISSON_SINK, 0.0001)
	assert_float(piece.placed.origin.x).is_equal_approx(2.0, 0.0001)
	assert_float(piece.placed.basis.x.length()).is_equal_approx(1.1, 0.0001)
	# The radar's square pad (0.5 across) and the antenna's guy anchors (0.4 out) stand on it too.
	assert_float(Piers.caisson_size(Perimeter.Kind.RADAR) * 0.15).is_greater_equal(0.25 * sqrt(2.0))
	assert_float(Piers.caisson_size(Perimeter.Kind.ANTENNA) * 0.15).is_greater_equal(0.425)
	assert_float(piece.placed.basis.y.length()).is_equal_approx(1.0, 0.0001)
	assert_float(Piers.standing_height(0.2, 0.5, true)).is_equal_approx(0.5 + Piers.CAISSON_SHOWS, 0.0001)
	assert_float(Piers.standing_height(0.2, 0.5, false)).is_equal_approx(0.2, 0.0001)
