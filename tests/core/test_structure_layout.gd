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


func test_storage_modules_carry_their_mode() -> void:
	var layout := StructureLayout.new()
	var lines: Array[String] = [
		'{"line":"chunk","chunk":[0,0,0],"version":2,"hullTypes":["STARTER"],"hulls":[[0,0,0,0],[1,0,0,0]],'
		+ '"modules":[{"moduleId":20,"moduleType":"BASIC_STORAGE","x":0,"y":0,"z":0,"size":{"x":1,"y":1,"z":1},'
		+ '"rotation":0,"status":"active","completesAt":0,"storageMode":"transport"},'
		+ '{"moduleId":21,"moduleType":"PUMP","x":1,"y":0,"z":0,"size":{"x":1,"y":1,"z":1},'
		+ '"rotation":0,"status":"active","completesAt":0}]}',
	]
	layout.apply(_full(2, lines))

	assert_str(layout.module(20).storage_mode).is_equal("transport")
	assert_str(layout.module(21).storage_mode).is_empty()


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


## A guest on its host's docks: anchor `docked`, hulls on two levels.
func _guest() -> StructureLayout:
	var layout := StructureLayout.new()
	layout.apply(Ndjson.parse(
		'{"line":"header","structureId":25,"anchor":{"type":"docked","hostId":9,"offset":{"x":4,"y":0,"z":1}},'
		+ '"kind":"station","rev":7,"chunks":1}\n'
		+ '{"line":"chunk","chunk":[0,0,0],"version":7,"hullTypes":["STARTER"],'
		+ '"hulls":[[0,0,0,0],[0,0,1,0],[0,1,0,0]],"modules":[]}\n'
		+ '{"line":"end","rev":7}'
	))
	return layout


func test_header_lists_the_guests_on_the_docks() -> void:
	var layout := StructureLayout.new()
	layout.apply(Ndjson.parse(
		'{"line":"header","structureId":9,"anchor":{"type":"surface","bodyId":"planet-a","offset":{"x":0,"y":0,"z":0}},'
		+ '"rev":5,"chunks":0,"guests":[{"structureId":25,"offset":{"x":4,"y":0,"z":1},'
		+ '"rect":{"minX":4,"minY":0,"maxX":5,"maxY":1,"z":0}},{"structureId":26,"offset":{"x":8,"y":0,"z":1}}]}\n'
		+ '{"line":"end","rev":5}'
	))

	assert_int(layout.guests.size()).is_equal(2)
	assert_int(layout.guests[0].structure_id).is_equal(25)
	assert_that(layout.guests[0].offset).is_equal(Vector3i(4, 0, 1))
	assert_that(layout.guests[0].rect).is_equal(Rect2i(4, 0, 2, 2))
	assert_int(layout.guests[0].dock_z).is_equal(0)
	# Without hulls a guest has no rectangle.
	assert_bool(layout.guests[1].rect.has_area()).is_false()


func test_a_header_without_guests_clears_them() -> void:
	var layout := StructureLayout.new()
	layout.apply(Ndjson.parse(
		'{"line":"header","structureId":9,"anchor":{"type":"surface"},"rev":5,"chunks":0,'
		+ '"guests":[{"structureId":25,"offset":{"x":4,"y":0,"z":1}}]}\n{"line":"end","rev":5}'
	))

	layout.apply(Ndjson.parse(
		'{"line":"header","structureId":9,"anchor":{"type":"surface"},"rev":6,"since":5,"chunks":0}\n{"line":"end","rev":6}'
	))

	assert_array(layout.guests).is_empty()


func test_docked_layout_knows_its_host_and_adds_the_host_offset() -> void:
	var guest := _guest()
	guest.base = Vector3i(100, 200, 0)

	assert_bool(guest.is_docked()).is_true()
	assert_int(guest.host_id).is_equal(9)
	assert_that(guest.to_absolute(Vector3i(0, 1, 0))).is_equal(Vector3i(104, 201, 1))
	assert_that(guest.to_local(Vector3i(104, 201, 1))).is_equal(Vector3i(0, 1, 0))


func test_surface_layout_is_not_docked() -> void:
	var layout := StructureLayout.new()
	layout.apply(_full(5, _starter()))

	assert_bool(layout.is_docked()).is_false()
	assert_int(layout.host_id).is_equal(0)


func test_levels_lists_every_level_with_a_hull() -> void:
	assert_array(_guest().levels()).contains_exactly([0, 1])


func test_top_in_column_finds_the_highest_hull() -> void:
	var guest := _guest()

	assert_int(guest.top_in_column(0, 0)).is_equal(1)
	assert_int(guest.top_in_column(0, 1)).is_equal(0)
	assert_int(guest.top_in_column(3, 3)).is_equal(StructureLayout.NO_LEVEL)


## A staircase shaft at (2,2): floors at levels 0 and 1, head at 2; hulls up to level 3.
func _shaft() -> StructureLayout:
	var layout := StructureLayout.new()
	layout.vertical_types = {"STAIRCASE": true}
	var floor_line := '{"moduleId":%d,"moduleType":"STAIRCASE","x":2,"y":2,"z":%d,"size":{"x":1,"y":1,"z":1},"rotation":0,"status":"active"}'
	var lines: Array[String] = [
		'{"line":"chunk","chunk":[0,0,0],"version":5,"hullTypes":["STANDARD"],'
		+ '"hulls":[[2,2,0,0],[2,2,1,0],[2,2,2,0],[2,2,3,0],[3,2,0,0]],"modules":[%s,%s]}' % [
			floor_line % [20, 0], floor_line % [21, 1]],
	]
	layout.apply(_full(5, lines))
	return layout


func test_shaft_floors_are_found_from_any_floor() -> void:
	var layout := _shaft()
	var lower := layout.module(20)
	var upper := layout.module(21)

	assert_array(layout.shaft_of(lower)).contains_exactly([lower, upper])
	assert_array(layout.shaft_of(upper)).contains_exactly([lower, upper])
	assert_bool(layout.is_shaft(lower)).is_true()


func test_shaft_head_lies_above_the_top_floor_and_belongs_to_it() -> void:
	var layout := _shaft()

	assert_that(layout.shaft_head(layout.module(20))).is_equal(Vector3i(2, 2, 2))
	assert_array(layout.shaft_heads()).contains_exactly([Vector3i(2, 2, 2)])
	assert_object(layout.module_at(Vector3i(2, 2, 2))).is_same(layout.module(21))
	assert_bool(layout.is_shaft_head(Vector3i(2, 2, 2))).is_true()
	assert_bool(layout.is_shaft_head(Vector3i(2, 2, 1))).is_false()
	assert_object(layout.module_at(Vector3i(2, 2, 3))).is_null()


func test_without_shaft_types_no_head_is_known() -> void:
	var layout := _shaft()
	layout.vertical_types = {}

	assert_object(layout.module_at(Vector3i(2, 2, 2))).is_null()
	assert_array(layout.shaft_heads()).is_empty()
	assert_array(layout.shaft_of(layout.module(20))).contains_exactly([layout.module(20)])


func test_absolute_levels_add_offset_and_base() -> void:
	var guest := _guest()
	guest.base = Vector3i(0, 0, 2)

	# The guest's offset lifts it by 1, its host's offset by 2 more.
	assert_array(guest.absolute_levels()).contains_exactly([3, 4])


func test_hull_key_follows_hulls_and_place_only() -> void:
	var layout := StructureLayout.new()
	layout.apply(_full(5, _starter()))
	var before := layout.hull_key()

	layout.complete_module(10)
	assert_int(layout.hull_key()).is_equal(before)

	layout._hulls[Vector3i(1, 0, 0)] = "STARTER"
	assert_int(layout.hull_key()).is_not_equal(before)
	layout._hulls.erase(Vector3i(1, 0, 0))
	assert_int(layout.hull_key()).is_equal(before)

	layout.offset += Vector3i(1, 0, 0)
	assert_int(layout.hull_key()).is_not_equal(before)


func test_content_key_follows_module_state_and_touch() -> void:
	var layout := StructureLayout.new()
	layout.apply(_full(5, _starter()))
	var before := layout.content_key()

	layout.module(10).status = "building"
	layout.complete_module(10)
	var finished := layout.content_key()
	assert_int(finished).is_not_equal(before)

	layout.touch()
	assert_int(layout.content_key()).is_not_equal(finished)


func test_completed_since_lists_finished_modules_only() -> void:
	var layout := StructureLayout.new()
	layout.apply(_full(5, _starter()))
	var drawn := layout.revision

	assert_array(layout.completed_since(drawn) as Array).is_empty()
	layout.complete_module(10)
	layout.complete_module(10)
	assert_array(layout.completed_since(drawn) as Array).is_equal([10, 10])
	assert_array(layout.completed_since(drawn + 1) as Array).is_equal([10])

	# Anything else that changed (a delta, an edit) needs the whole layout looked at.
	layout.touch()
	assert_that(layout.completed_since(drawn)).is_null()
	layout.complete_module(10)
	assert_that(layout.completed_since(drawn)).is_null()
	assert_array(layout.completed_since(layout.revision - 1) as Array).is_equal([10])


func test_completed_since_forgets_far_back() -> void:
	var layout := StructureLayout.new()
	layout.apply(_full(5, _starter()))
	var drawn := layout.revision
	for _index: int in StructureLayout.COMPLETIONS_KEPT + 1:
		layout.complete_module(10)

	assert_that(layout.completed_since(drawn)).is_null()


func test_every_apply_counts_as_a_change() -> void:
	var layout := StructureLayout.new()
	layout.apply(_full(5, _starter()))
	var first := layout.revision

	layout.apply(_delta(6, 5, []))

	assert_int(layout.revision).is_equal(first + 1)