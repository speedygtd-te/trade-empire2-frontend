extends GdUnitTestSuite

## Shape of a real answer of the live server (draft.13), shortened to 2 × 2 cells.
const STREAM := (
	'{"rev":155,"gameTime":4518477,"bodyId":"planet-sys-0_29_0-221-1","bodyClass":"EARTH_LIKE",'
	+ '"x0":-1,"y0":4,"x1":0,"y1":5,"z":0,"includeDeposits":false,"deepThreshold":-6,"rows":2}\n'
	+ '{"y":4,"cells":[{"b":"MOUNTAIN","v":1,"g":2,"e":734,"m":353},{"b":"PLAINS","v":3,"g":0,"e":500,"m":200}]}\n'
	+ '{"y":5,"cells":[{"b":"BEACH","v":0,"g":1,"e":10,"m":900},{"b":"OCEAN","v":2,"g":0,"e":0,"m":1000}]}\n'
	+ '{"end":true,"rows":2}\n'
)


func test_reads_header_and_cells_at_absolute_positions() -> void:
	var patch := SurfacePatch.from_stream(Ndjson.parse(STREAM))

	assert_str(patch.body_id).is_equal("planet-sys-0_29_0-221-1")
	assert_str(patch.body_class).is_equal("EARTH_LIKE")
	assert_int(patch.width()).is_equal(2)
	assert_int(patch.height()).is_equal(2)
	assert_int(patch.cell_count()).is_equal(4)
	assert_str(patch.cell(-1, 4).biome).is_equal("MOUNTAIN")
	assert_int(patch.cell(-1, 4).elevation).is_equal(734)
	assert_str(patch.cell(0, 4).biome).is_equal("PLAINS")
	assert_int(patch.cell(0, 4).variant).is_equal(3)
	assert_str(patch.cell(0, 5).biome).is_equal("OCEAN")
	assert_int(patch.cell(-1, 5).moisture).is_equal(900)
	assert_bool(patch.complete).is_true()


func test_elevations_are_read_by_position_and_minus_one_outside() -> void:
	var patch := SurfacePatch.from_stream(Ndjson.parse(STREAM))

	assert_int(patch.elevation(-1, 4)).is_equal(734)
	assert_int(patch.elevation(0, 5)).is_equal(patch.cell(0, 5).elevation)
	assert_int(patch.elevation(1, 4)).is_equal(-1)
	assert_int(patch.elevation(-1, 3)).is_equal(-1)
	var fog := SurfacePatch.from_stream(Ndjson.parse(
		'{"bodyId":"b","x0":0,"y0":0,"x1":1,"y1":0,"z":0,"rows":1}\n'
		+ '{"y":0,"cells":[null,{"b":"PLAINS","v":0,"g":0,"e":12,"m":0}]}\n'
		+ '{"end":true,"rows":1}'))
	assert_int(fog.elevation(0, 0)).is_equal(-1)
	assert_int(fog.elevation(1, 0)).is_equal(12)


func test_water_cells_are_known_by_position() -> void:
	var patch := SurfacePatch.from_stream(Ndjson.parse(STREAM))

	assert_bool(patch.is_water(0, 5)).is_true()
	assert_bool(patch.is_water(-1, 5)).is_false()
	assert_bool(patch.is_water(-1, 4)).is_false()
	assert_bool(patch.is_water(1, 5)).is_false()


func test_without_deposits_the_cells_have_none() -> void:
	var patch := SurfacePatch.from_stream(Ndjson.parse(STREAM))

	assert_bool(patch.include_deposits).is_false()
	assert_bool(patch.cell(-1, 4).deposits.is_empty()).is_true()


func test_reads_deposits_with_their_richness() -> void:
	# Shape of a real answer of the live server (includeDeposits=true, z=-3), shortened.
	var stream := (
		'{"rev":3383,"gameTime":69573882,"bodyId":"b","bodyClass":"EARTH_LIKE","x0":0,"y0":0,"x1":1,"y1":0,"z":-3,'
		+ '"includeDeposits":true,"deepThreshold":-6,"rows":1}\n'
		+ '{"y":0,"cells":[{"b":"ROCK_LAYER","v":3,"g":0,"e":578,"m":317,"d":[{"r":"IRON","R":100},{"r":"COPPER","R":54}]},'
		+ '{"b":"ROCK_LAYER","v":1,"g":0,"e":577,"m":318}]}\n'
		+ '{"end":true,"rows":1}\n'
	)
	var patch := SurfacePatch.from_stream(Ndjson.parse(stream))

	assert_bool(patch.include_deposits).is_true()
	assert_int(patch.z).is_equal(-3)
	assert_dict(patch.cell(0, 0).deposits).is_equal({"IRON": 100, "COPPER": 54})
	assert_int(patch.cell(0, 0).deposits["IRON"]).is_equal(100)
	# A cell without `d` holds nothing.
	assert_bool(patch.cell(1, 0).deposits.is_empty()).is_true()
	assert_bool(patch.complete).is_true()


func test_cell_outside_the_patch_is_null() -> void:
	var patch := SurfacePatch.from_stream(Ndjson.parse(STREAM))

	assert_object(patch.cell(1, 4)).is_null()
	assert_object(patch.cell(0, 6)).is_null()


func test_stream_without_end_line_is_incomplete() -> void:
	var cut := STREAM.substr(0, STREAM.find('{"end"'))

	assert_bool(SurfacePatch.from_stream(Ndjson.parse(cut)).complete).is_false()


func test_missing_row_is_incomplete() -> void:
	var lines := STREAM.split("\n")
	var without_row := "\n".join([lines[0], lines[1], lines[3]])

	assert_bool(SurfacePatch.from_stream(Ndjson.parse(without_row)).complete).is_false()


func test_null_cells_are_unexplored_and_the_rows_still_count() -> void:
	# Shape of a real draft.31 answer of the live server at the edge of the explored area.
	var stream := (
		'{"rev":519,"gameTime":8765883,"bodyId":"b","bodyClass":"EARTH_LIKE","x0":1007,"y0":-4,"x1":1009,"y1":-3,'
		+ '"z":0,"includeDeposits":false,"deepThreshold":-6,"rows":2}\n'
		+ '{"y":-4,"cells":[{"b":"MOUNTAIN","v":2,"g":0,"e":728,"m":652},{"b":"MOUNTAIN","v":2,"g":0,"e":728,"m":652},null]}\n'
		+ '{"y":-3,"cells":[{"b":"MOUNTAIN","v":0,"g":0,"e":729,"m":652},null,null]}\n'
		+ '{"end":true,"rows":2}\n'
	)
	var patch := SurfacePatch.from_stream(Ndjson.parse(stream))

	assert_bool(patch.complete).is_true()
	assert_int(patch.cell_count()).is_equal(3)
	assert_int(patch.hidden_count()).is_equal(3)
	assert_bool(patch.is_hidden(1009, -4)).is_true()
	assert_object(patch.cell(1009, -4)).is_null()
	assert_bool(patch.is_hidden(1008, -4)).is_false()
	assert_str(patch.cell(1008, -4).biome).is_equal("MOUNTAIN")
	# Outside the patch nothing is hidden.
	assert_bool(patch.is_hidden(1010, -4)).is_false()


func test_impact_sites_are_read_with_their_cell() -> void:
	# draft.32: `p` on a cell lists every probe that landed there, oldest first.
	var stream := (
		'{"rev":1,"gameTime":2,"bodyId":"b","bodyClass":"EARTH_LIKE","x0":10,"y0":0,"x1":11,"y1":0,"z":0,"rows":1}\n'
		+ '{"y":0,"cells":[{"b":"PLAINS","v":0,"g":0,"e":0,"m":0,"p":[{"probeId":801,"ownerId":"4711","at":15419094}]},'
		+ '{"b":"PLAINS","v":0,"g":0,"e":0,"m":0}]}\n'
		+ '{"end":true,"rows":1}\n'
	)
	var patch := SurfacePatch.from_stream(Ndjson.parse(stream))

	var impact := patch.cell(10, 0).impacts[0]
	assert_int(impact.probe_id).is_equal(801)
	assert_str(impact.owner_id).is_equal("4711")
	assert_int(impact.at).is_equal(15419094)
	assert_that(Vector2i(impact.x, impact.y)).is_equal(Vector2i(10, 0))
	assert_bool(patch.cell(11, 0).impacts.is_empty()).is_true()
	assert_int(patch.impact_cells().size()).is_equal(1)


func test_other_answers_are_no_patch() -> void:
	assert_object(SurfacePatch.from_stream(Ndjson.parse('{"error":"NO_SURFACE"}'))).is_null()
