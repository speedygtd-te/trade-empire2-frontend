extends GdUnitTestSuite
## Cells are host cells unless a test says otherwise.
##
## Host 1: STARTER at (0,0,0) and (1,0,0); DOCK hulls on x 2..4, y 0..2 and at (6,0,0), (8,0,0).
## Guest 25 (offset (2,0,1)): an L on the docks — (2,0)…(4,0), (4,1), (4,2) — plus one hull on
## top of (2,0); a mine on (3,0,1). Guest 26 (offset (6,0,1)): one hull at (6,0,1).

var _host: StructureLayout
var _l_guest: StructureLayout
var _small_guest: StructureLayout
var _guests: Array[StructureLayout] = []


static func _layout(header: String, hull_types: String, hulls: String, modules: String = "") -> StructureLayout:
	var layout := StructureLayout.new()
	layout.apply(Ndjson.parse(
		header + '\n{"line":"chunk","chunk":[0,0,0],"version":1,"hullTypes":%s,"hulls":%s,"modules":[%s]}\n' % [
			hull_types, hulls, modules]
		+ '{"line":"end","rev":1}'
	))
	return layout


static func _guest(id: int, offset: Vector3i, hulls: String, modules: String = "") -> StructureLayout:
	var header := '{"line":"header","structureId":%d,"anchor":{"type":"docked","hostId":1,' % id \
		+ '"offset":{"x":%d,"y":%d,"z":%d}},"rev":1,"chunks":1}' % [offset.x, offset.y, offset.z]
	return _layout(header, '["STARTER"]', hulls, modules)


func before_test() -> void:
	var docks := PackedStringArray()
	for y: int in range(0, 3):
		for x: int in range(2, 5):
			docks.append("[%d,%d,0,1]" % [x, y])
	docks.append("[6,0,0,1]")
	docks.append("[8,0,0,1]")
	_host = _layout(
		'{"line":"header","structureId":1,"anchor":{"type":"surface","bodyId":"p","offset":{"x":0,"y":0,"z":0}},'
		+ '"rev":1,"chunks":1}',
		'["STARTER","DOCK"]', "[[0,0,0,0],[1,0,0,0],%s]" % ",".join(docks))
	_l_guest = _guest(25, Vector3i(2, 0, 1), "[[0,0,0,0],[1,0,0,0],[2,0,0,0],[2,1,0,0],[2,2,0,0],[0,0,1,0]]",
		'{"moduleId":5,"moduleType":"MINE","x":1,"y":0,"z":0,"size":{"x":1,"y":1,"z":1},"rotation":0,'
		+ '"status":"active","completesAt":0}')
	_small_guest = _guest(26, Vector3i(6, 0, 1), "[[0,0,0,0]]")
	_guests = [_l_guest, _small_guest]


func test_guest_cells_and_host_cells_convert_through_the_offset() -> void:
	assert_that(DockRules.guest_cell(_l_guest, Vector3i(4, 1, 1))).is_equal(Vector3i(2, 1, 0))
	assert_that(DockRules.host_cell_of(_l_guest, Vector3i(2, 1, 0))).is_equal(Vector3i(4, 1, 1))


func test_dock_level_lies_under_the_lowest_guest_level() -> void:
	assert_int(DockRules.dock_level(_l_guest)).is_equal(0)


func test_dock_rect_spans_every_hull_in_the_host_grid() -> void:
	assert_that(DockRules.dock_rect(_l_guest)).is_equal(Rect2i(2, 0, 3, 3))
	assert_that(DockRules.dock_rect(_small_guest)).is_equal(Rect2i(6, 0, 1, 1))
	assert_bool(DockRules.dock_rect(StructureLayout.new()).has_area()).is_false()


func test_guest_at_finds_the_guest_with_a_hull_there() -> void:
	assert_object(DockRules.guest_at(_guests, Vector3i(4, 2, 1))).is_same(_l_guest)
	assert_object(DockRules.guest_at(_guests, Vector3i(6, 0, 1))).is_same(_small_guest)
	assert_object(DockRules.guest_at(_guests, Vector3i(3, 1, 1))).is_null()


func test_owner_at_tells_host_guest_or_free() -> void:
	assert_int(DockRules.owner_at(_host, _guests, Vector3i(0, 0, 0))).is_equal(1)
	assert_int(DockRules.owner_at(_host, _guests, Vector3i(2, 0, 0))).is_equal(1)
	assert_int(DockRules.owner_at(_host, _guests, Vector3i(2, 0, 2))).is_equal(25)
	assert_int(DockRules.owner_at(_host, _guests, Vector3i(3, 1, 1))).is_equal(0)


func test_guest_on_dock_covers_the_whole_rectangle() -> void:
	# (3,1) carries no guest hull but lies inside the L's rectangle.
	assert_object(DockRules.guest_on_dock(_guests, Vector3i(3, 1, 0))).is_same(_l_guest)
	assert_object(DockRules.guest_on_dock(_guests, Vector3i(8, 0, 0))).is_null()
	# Another level is another dock.
	assert_object(DockRules.guest_on_dock(_guests, Vector3i(3, 1, 1))).is_null()


func test_touching_guests_needs_face_contact() -> void:
	assert_array(DockRules.touching_guests(_guests, Vector3i(3, 1, 1))).contains_exactly([_l_guest])
	assert_array(DockRules.touching_guests(_guests, Vector3i(5, 0, 1))).contains_exactly_in_any_order([_l_guest, _small_guest])
	assert_array(DockRules.touching_guests(_guests, Vector3i(8, 0, 1))).is_empty()
	# Diagonal is not touching.
	assert_array(DockRules.touching_guests(_guests, Vector3i(5, 3, 1))).is_empty()


func test_placement_founds_extends_or_joins_the_host() -> void:
	assert_int(DockRules.placement(_host, _guests, Vector3i(8, 0, 1))).is_equal(DockRules.Placement.FOUND)
	assert_int(DockRules.placement(_host, _guests, Vector3i(3, 1, 1))).is_equal(DockRules.Placement.EXTEND)
	assert_int(DockRules.placement(_host, _guests, Vector3i(-1, 0, 0))).is_equal(DockRules.Placement.HOST)


func test_hull_above_a_free_dock_founds_a_guest() -> void:
	assert_int(DockRules.check_place_hull(_host, _guests, Vector3i(8, 0, 1))).is_equal(BuildRules.Verdict.OK)


func test_hull_next_to_or_above_a_guest_extends_it() -> void:
	assert_int(DockRules.check_place_hull(_host, _guests, Vector3i(3, 1, 1))).is_equal(BuildRules.Verdict.OK)
	assert_int(DockRules.check_place_hull(_host, _guests, Vector3i(3, 0, 2))).is_equal(BuildRules.Verdict.OK)


func test_taken_cell_is_occupied() -> void:
	assert_int(DockRules.check_place_hull(_host, _guests, Vector3i(2, 0, 1))).is_equal(BuildRules.Verdict.OCCUPIED)
	assert_int(DockRules.check_place_hull(_host, _guests, Vector3i(2, 0, 0))).is_equal(BuildRules.Verdict.OCCUPIED)


func test_guest_rectangle_must_stay_on_docks() -> void:
	# Out over the edge of the dock field.
	assert_int(DockRules.check_place_hull(_host, _guests, Vector3i(5, 1, 1))).is_equal(BuildRules.Verdict.DOCK_AREA_TOO_SMALL)
	assert_int(DockRules.check_place_hull(_host, _guests, Vector3i(2, -1, 1))).is_equal(BuildRules.Verdict.DOCK_AREA_TOO_SMALL)
	# Above the host's own hulls next to the guest: still the guest, and no dock under it.
	assert_int(DockRules.check_place_hull(_host, _guests, Vector3i(1, 0, 1))).is_equal(BuildRules.Verdict.DOCK_AREA_TOO_SMALL)


func test_guests_do_not_share_space() -> void:
	# Touching two guests.
	assert_int(DockRules.check_place_hull(_host, _guests, Vector3i(5, 0, 1))).is_equal(BuildRules.Verdict.DOCK_SPACE_BLOCKED)
	# A new guest inside the L's rectangle.
	assert_int(DockRules.check_place_hull(_host, _guests, Vector3i(2, 2, 1))).is_equal(BuildRules.Verdict.DOCK_SPACE_BLOCKED)


func test_away_from_docks_the_host_rules_apply() -> void:
	assert_int(DockRules.check_place_hull(_host, _guests, Vector3i(-1, 0, 0))).is_equal(BuildRules.Verdict.OK)
	assert_int(DockRules.check_place_hull(_host, _guests, Vector3i(9, 9, 0))).is_equal(BuildRules.Verdict.NOT_CONNECTED)
	assert_int(DockRules.check_place_hull(_host, _guests, Vector3i(0, 0, 1))).is_equal(BuildRules.Verdict.WRONG_LEVEL)
	# Up in the air touching nothing: no new structure off the docks.
	assert_int(DockRules.check_place_hull(_host, _guests, Vector3i(9, 9, 1))).is_equal(BuildRules.Verdict.NOT_CONNECTED)


func test_dock_under_a_guest_cannot_go() -> void:
	assert_int(DockRules.check_remove_hull(_host, _guests, _host, Vector3i(2, 0, 0))).is_equal(BuildRules.Verdict.HULL_HAS_GUEST)
	assert_int(DockRules.check_remove_hull(_host, _guests, _host, Vector3i(3, 1, 0))).is_equal(BuildRules.Verdict.HULL_HAS_GUEST)
	assert_int(DockRules.check_remove_hull(_host, _guests, _host, Vector3i(8, 0, 0))).is_equal(BuildRules.Verdict.OK)
	assert_int(DockRules.check_remove_hull(_host, _guests, _host, Vector3i(1, 0, 0))).is_equal(BuildRules.Verdict.OK)


func test_guest_hulls_follow_the_guest_rules() -> void:
	assert_int(DockRules.check_remove_hull(_host, _guests, _l_guest, Vector3i(2, 0, 1))).is_equal(BuildRules.Verdict.OK)
	assert_int(DockRules.check_remove_hull(_host, _guests, _l_guest, Vector3i(3, 0, 1))).is_equal(BuildRules.Verdict.HULL_HAS_MODULE)
	assert_int(DockRules.check_remove_hull(_host, _guests, _l_guest, Vector3i(3, 1, 1))).is_equal(BuildRules.Verdict.NO_HULL)
	assert_int(DockRules.check_remove_hull(_host, _guests, _small_guest, Vector3i(6, 0, 1))).is_equal(BuildRules.Verdict.OK)


func test_guest_keeps_a_hull_on_the_dock() -> void:
	var tower := _guest(27, Vector3i(8, 0, 1), "[[0,0,0,0],[0,0,1,0]]")

	assert_int(DockRules.check_remove_hull(_host, _guests, tower, Vector3i(8, 0, 1))).is_equal(BuildRules.Verdict.NOT_ON_DOCK)
	assert_int(DockRules.check_remove_hull(_host, _guests, tower, Vector3i(8, 0, 2))).is_equal(BuildRules.Verdict.OK)


func test_removing_the_last_hull_removes_the_guest() -> void:
	assert_bool(DockRules.removes_guest(_small_guest, Vector3i(6, 0, 1))).is_true()
	assert_bool(DockRules.removes_guest(_l_guest, Vector3i(2, 0, 1))).is_false()
	assert_bool(DockRules.removes_guest(_host, Vector3i(0, 0, 0))).is_false()


func test_target_on_the_host_goes_on_top_of_a_dock() -> void:
	assert_that(DockRules.target_cell(_host, _host, Vector2i(8, 0), true)).is_equal(Vector3i(8, 0, 1))
	assert_that(DockRules.target_cell(_host, _host, Vector2i(8, 0), false)).is_equal(Vector3i(8, 0, 0))
	assert_that(DockRules.target_cell(_host, _host, Vector2i(0, 0), true)).is_equal(Vector3i(0, 0, 0))
	assert_that(DockRules.target_cell(_host, _host, Vector2i(9, 9), true)).is_equal(Vector3i(9, 9, 0))


func test_target_on_a_guest_stacks_or_starts_at_its_lowest_level() -> void:
	assert_that(DockRules.target_cell(_host, _l_guest, Vector2i(2, 0), true)).is_equal(Vector3i(2, 0, 3))
	assert_that(DockRules.target_cell(_host, _l_guest, Vector2i(2, 0), false)).is_equal(Vector3i(2, 0, 2))
	assert_that(DockRules.target_cell(_host, _l_guest, Vector2i(3, 1), true)).is_equal(Vector3i(3, 1, 1))
	assert_that(DockRules.target_cell(_host, _l_guest, Vector2i(3, 1), false)).is_equal(Vector3i(3, 1, 1))
