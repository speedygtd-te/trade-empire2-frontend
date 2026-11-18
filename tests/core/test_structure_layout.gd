extends GdUnitTestSuite

const HEADER := (
	'{"line":"header","structureId":9,"anchor":{"type":"surface","bodyId":"planet-a",'
	+ '"offset":{"x":100,"y":200,"z":0}},"kind":"base","capabilities":[],"rev":%d,'
	+ '"gameTime":1,%s"chunks":%d,"bounds":{}}\n'
)


func _full(rev: int, chunk_lines: Array[String]) -> Ndjson:
	var text := HEADER % [rev, "", chunk_lines.size()]
	for line: String in chunk_lines:
		text += line + "\n"
	return Ndjson.parse(text + '{"line":"end","rev":%d}' % rev)


func _delta(rev: int, since: int, chunk_lines: Array[String]) -> Ndjson:
	var text := HEADER % [rev, '"since":%d,' % since, chunk_lines.size()]
	for line: String in chunk_lines:
		text += line + "\n"
	return Ndjson.parse(text + '{"line":"end","rev":%d}' % rev)


## Two hulls in chunk 0 and a pump on the first one; one hull in chunk (1,0,0).
func _starter() -> Array[String]:
	return [
		'{"line":"chunk","chunk":[0,0,0],"version":5,"hullTypes":["STARTER","PLATFORM_OUTDOOR"],'
		+ '"hulls":[[0,0,0,0],[15,3,0,1]],"modules":[{"moduleId":10,"moduleType":"PUMP","x":0,"y":0,'
		+ '"z":0,"size":{"x":1,"y":1,"z":1},"rotation":0,"status":"active","completesAt":4}]}',
		'{"line":"chunk","chunk":[1,0,0],"version":5,"hullTypes":["STARTER"],"hulls":[[0,3,0,0]],"modules":[]}',
	]


func test_full_load_reads_anchor_hulls_and_modules() -> void:
	var layout := StructureLayout.new()

	assert_bool(layout.apply(_full(5, _starter()))).is_true()

	assert_int(layout.structure_id).is_equal(9)
	assert_str(layout.body_id).is_equal("planet-a")
	assert_that(layout.offset).is_equal(Vector3i(100, 200, 0))
	assert_int(layout.rev).is_equal(5)
	assert_int(layout.hull_count()).is_equal(3)
	assert_str(layout.hull_at(Vector3i(0, 0, 0))).is_equal("STARTER")
	assert_str(layout.hull_at(Vector3i(15, 3, 0))).is_equal("PLATFORM_OUTDOOR")
	assert_str(layout.hull_at(Vector3i(16, 3, 0))).is_equal("STARTER")
	assert_str(layout.module_at(Vector3i(0, 0, 0)).module_type).is_equal("PUMP")
	assert_object(layout.module_at(Vector3i(15, 3, 0))).is_null()


func test_delta_replaces_a_changed_chunk_and_keeps_the_others() -> void:
	var layout := StructureLayout.new()
	layout.apply(_full(5, _starter()))

	var changed: Array[String] = [
		'{"line":"chunk","chunk":[0,0,0],"version":8,"hullTypes":["STARTER"],"hulls":[[0,0,0,0],[1,0,0,0]],'
		+ '"modules":[{"moduleId":12,"moduleType":"MINE","x":1,"y":0,"z":0,"size":{"x":1,"y":1,"z":1},'
		+ '"rotation":0,"status":"building","completesAt":99}]}',
	]
	assert_bool(layout.apply(_delta(8, 5, changed))).is_true()

	assert_int(layout.rev).is_equal(8)
	assert_str(layout.hull_at(Vector3i(15, 3, 0))).is_empty()
	assert_str(layout.hull_at(Vector3i(1, 0, 0))).is_equal("STARTER")
	assert_str(layout.hull_at(Vector3i(16, 3, 0))).is_equal("STARTER")
	assert_object(layout.module_at(Vector3i(0, 0, 0))).is_null()
	assert_bool(layout.module_at(Vector3i(1, 0, 0)).is_building()).is_true()
	assert_int(layout.module_count()).is_equal(1)


func test_empty_chunk_line_removes_everything_in_it() -> void:
	var layout := StructureLayout.new()
	layout.apply(_full(5, _starter()))

	var gone: Array[String] = [
		'{"line":"chunk","chunk":[1,0,0],"version":9,"empty":true,"hullTypes":[],"hulls":[],"modules":[]}',
	]
	layout.apply(_delta(9, 5, gone))

	assert_str(layout.hull_at(Vector3i(16, 3, 0))).is_empty()
	assert_int(layout.hull_count()).is_equal(2)


func test_module_footprint_reaching_into_a_neighbour_chunk_covers_every_cell() -> void:
	var layout := StructureLayout.new()
	var lines: Array[String] = [
		'{"line":"chunk","chunk":[0,0,0],"version":3,"hullTypes":["STARTER"],"hulls":[[15,0,0,0]],'
		+ '"modules":[{"moduleId":7,"moduleType":"GREENHOUSE_FARM","x":15,"y":0,"z":0,'
		+ '"size":{"x":2,"y":1,"z":1},"rotation":90,"status":"active","completesAt":0}]}',
	]
	layout.apply(_full(3, lines))

	var farm := layout.module(7)
	assert_that(farm.extent()).is_equal(Vector3i(1, 2, 1))
	assert_int(layout.module_at(Vector3i(15, 1, 0)).module_id).is_equal(7)
	assert_object(layout.module_at(Vector3i(16, 0, 0))).is_null()


func test_incomplete_stream_changes_nothing() -> void:
	var layout := StructureLayout.new()
	layout.apply(_full(5, _starter()))
	var cut := Ndjson.parse(HEADER % [8, '"since":5,', 1])

	assert_bool(layout.apply(cut)).is_false()
	assert_int(layout.rev).is_equal(5)
	assert_int(layout.hull_count()).is_equal(3)


func test_layout_of_another_structure_is_refused() -> void:
	var layout := StructureLayout.new()
	layout.apply(_full(5, _starter()))
	var other := Ndjson.parse(
		'{"line":"header","structureId":10,"anchor":{"type":"surface"},"rev":6,"chunks":0}\n'
		+ '{"line":"end","rev":6}'
	)

	assert_bool(layout.apply(other)).is_false()


func test_completing_a_module_marks_it_active() -> void:
	var layout := StructureLayout.new()
	var lines: Array[String] = [
		'{"line":"chunk","chunk":[0,0,0],"version":3,"hullTypes":["STARTER"],"hulls":[[0,0,0,0]],'
		+ '"modules":[{"moduleId":4,"moduleType":"MINE","x":0,"y":0,"z":0,"size":{"x":1,"y":1,"z":1},'
		+ '"rotation":0,"status":"building","completesAt":50}]}',
	]
	layout.apply(_full(3, lines))

	layout.complete_module(4)

	assert_bool(layout.module(4).is_building()).is_false()


func test_converts_between_local_and_absolute_cells() -> void:
	var layout := StructureLayout.new()
	layout.apply(_full(5, _starter()))

	assert_that(layout.to_absolute(Vector3i(1, 2, 0))).is_equal(Vector3i(101, 202, 0))
	assert_that(layout.to_local(Vector3i(101, 202, 0))).is_equal(Vector3i(1, 2, 0))
