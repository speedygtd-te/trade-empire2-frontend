extends GdUnitTestSuite
## Host 1 (offset (100, 50, 0)): STARTER hulls at local (0,0,0), (1,0,0), (0,1,0), (1,1,0) — a
## 2×2 block at absolute x 100..101, y 50..51 — and a DOCK at local (6,0,0) (absolute (106,50,0)).
## Water east of absolute x = 110.

const HULLS := [
	{"key": "STARTER", "modulePositioning": "INDOOR", "environments": ["SURFACE"]},
	{"key": "DOCK", "modulePositioning": "OUTDOOR", "environments": ["SURFACE", "UNDERWATER"]},
]

var _host: StructureLayout
var _definitions: GameDefinitions
var _site: LevelRules.Site
var _none: Array[StructureLayout] = []


static func _layout(header: String, hull_types: String, hulls: String) -> StructureLayout:
	var layout := StructureLayout.new()
	layout.apply(Ndjson.parse(
		header + '\n{"line":"chunk","chunk":[0,0,0],"version":1,"hullTypes":%s,"hulls":%s,"modules":[]}\n' % [
			hull_types, hulls]
		+ '{"line":"end","rev":1}'
	))
	return layout


static func _surface(id: int, offset: Vector3i, hulls: String) -> StructureLayout:
	return _layout('{"line":"header","structureId":%d,"anchor":{"type":"surface","bodyId":"p",' % id
		+ '"offset":{"x":%d,"y":%d,"z":%d}},"rev":1,"chunks":1}' % [offset.x, offset.y, offset.z],
		'["STARTER","DOCK"]', hulls)


func before_test() -> void:
	_host = _surface(1, Vector3i(100, 50, 0), "[[0,0,0,0],[1,0,0,0],[0,1,0,0],[1,1,0,0],[6,0,0,1]]")
	_definitions = GameDefinitions.from_bundle({"dataHash": "x", "modules": [], "hulls": HULLS})
	_site = LevelRules.Site.new()
	_site.has_grid = true
	_site.min_z = -10
	_site.max_z = 100
	_site.deep_threshold = -6
	_site.body_type = "EARTH_LIKE"
	_site.biome_at = func(x: int, _y: int, z: int) -> String: return "OCEAN" if x >= 110 and z == 0 else "PLAINS"


func _plan(start: Vector3i, end: Vector3i, shape: HullShapes.Shape = HullShapes.Shape.RECTANGLE,
		foreign: Dictionary = {}, neighbours: Array[StructureLayout] = []) -> HullShapes.Plan:
	return HullShapes.plan(HullShapes.cells(shape, start, end), _host, _none, neighbours, foreign, "STARTER",
		_definitions, _site)


# --- shapes -----------------------------------------------------------------------------------

func test_single_is_the_start_cell_only() -> void:
	var cells := HullShapes.cells(HullShapes.Shape.SINGLE, Vector3i(3, 4, 1), Vector3i(9, 9, 1))
	assert_array(cells).is_equal([Vector3i(3, 4, 1)])
	assert_that(HullShapes.extent(HullShapes.Shape.SINGLE, Vector3i(3, 4, 1), Vector3i(9, 9, 1))).is_equal(Vector2i.ONE)


func test_rectangle_spans_both_corners_in_any_direction() -> void:
	assert_that(HullShapes.extent(HullShapes.Shape.RECTANGLE, Vector3i(0, 0, 0), Vector3i(2, 1, 0))).is_equal(Vector2i(3, 2))
	var cells := HullShapes.cells(HullShapes.Shape.RECTANGLE, Vector3i(5, 5, 2), Vector3i(4, 3, 2))
	assert_array(cells).contains_exactly_in_any_order([
		Vector3i(5, 5, 2), Vector3i(4, 5, 2), Vector3i(5, 4, 2), Vector3i(4, 4, 2), Vector3i(5, 3, 2), Vector3i(4, 3, 2)])
	# Row by row from the start cell.
	assert_that(cells[0]).is_equal(Vector3i(5, 5, 2))
	assert_that(cells[1]).is_equal(Vector3i(4, 5, 2))


func test_square_takes_the_longer_side_in_the_drag_direction() -> void:
	assert_that(HullShapes.extent(HullShapes.Shape.SQUARE, Vector3i(0, 0, 0), Vector3i(3, 1, 0))).is_equal(Vector2i(4, 4))
	var cells := HullShapes.cells(HullShapes.Shape.SQUARE, Vector3i(0, 0, 0), Vector3i(-2, -1, 0))
	assert_int(cells.size()).is_equal(9)
	assert_array(cells).contains([Vector3i(-2, -2, 0), Vector3i(0, -2, 0), Vector3i(-2, 0, 0)])
	assert_array(cells).not_contains([Vector3i(1, 0, 0), Vector3i(0, 1, 0)])


func test_shapes_stop_at_the_longest_side() -> void:
	var span := HullShapes.extent(HullShapes.Shape.RECTANGLE, Vector3i(0, 0, 0), Vector3i(100, 2, 0))
	assert_that(span).is_equal(Vector2i(HullShapes.MAX_SIDE, 3))
	assert_int(HullShapes.cells(HullShapes.Shape.SQUARE, Vector3i.ZERO, Vector3i(0, 500, 0)).size()).is_equal(
		HullShapes.MAX_SIDE * HullShapes.MAX_SIDE)
	assert_bool(HullShapes.MAX_SIDE * HullShapes.MAX_SIDE <= 1000).is_true()


func test_shapes_go_the_short_way_round_a_wrapping_surface() -> void:
	# From x = 998 to x = 1 on a surface 1000 cells wide: four columns, unwrapped next to the start.
	var cells := HullShapes.cells(HullShapes.Shape.RECTANGLE, Vector3i(998, 0, 0), Vector3i(1, 0, 0), 1000)
	assert_array(cells).is_equal([Vector3i(998, 0, 0), Vector3i(999, 0, 0), Vector3i(1000, 0, 0), Vector3i(1001, 0, 0)])
	assert_that(HullShapes.extent(HullShapes.Shape.RECTANGLE, Vector3i(1, 0, 0), Vector3i(998, 0, 0), 1000)).is_equal(Vector2i(4, 1))
	# A tiny body: never wider than the body.
	assert_that(HullShapes.extent(HullShapes.Shape.SQUARE, Vector3i(0, 0, 0), Vector3i(0, 40, 0), 8).x).is_equal(8)


# --- plans ------------------------------------------------------------------------------------

func test_cells_of_the_own_structure_are_ignored() -> void:
	# 3×2 from the block's right column outwards: two cells taken, four new.
	var plan := _plan(Vector3i(101, 50, 0), Vector3i(103, 51, 0))
	assert_array(plan.own).contains_exactly_in_any_order([Vector3i(101, 50, 0), Vector3i(101, 51, 0)])
	assert_int(plan.place.size()).is_equal(4)
	assert_bool(plan.skipped.is_empty()).is_true()
	assert_that(plan.extent).is_equal(Vector2i(3, 2))
	assert_bool(plan.buildable(4)).is_true()


func test_new_hulls_go_outward_so_each_touches_an_earlier_one() -> void:
	var plan := _plan(Vector3i(105, 51, 0), Vector3i(102, 51, 0))
	assert_array(plan.place).is_equal([Vector3i(102, 51, 0), Vector3i(103, 51, 0), Vector3i(104, 51, 0), Vector3i(105, 51, 0)])
	var built := {}
	for cell: Vector3i in plan.place:
		var touching := not _host.hull_at(_host.to_local(cell + Vector3i(-1, 0, 0))).is_empty() \
			or not _host.hull_at(_host.to_local(cell + Vector3i(1, 0, 0))).is_empty()
		for step: Vector3i in [Vector3i(1, 0, 0), Vector3i(-1, 0, 0), Vector3i(0, 1, 0), Vector3i(0, -1, 0)]:
			touching = touching or built.has(cell + step)
		assert_bool(touching).override_failure_message("%s touches nothing placed before" % cell).is_true()
		built[cell] = true


func test_cells_without_a_way_to_the_structure_are_islands() -> void:
	var plan := _plan(Vector3i(103, 53, 0), Vector3i(104, 53, 0))
	assert_bool(plan.place.is_empty()).is_true()
	assert_int(plan.count_of(BuildRules.Verdict.NOT_CONNECTED)).is_equal(2)
	assert_bool(plan.buildable(99)).is_false()


func test_cells_that_cannot_take_the_hull_are_skipped_and_cut_the_way() -> void:
	# From the block east into the water (x >= 110): the water cells are skipped.
	var plan := _plan(Vector3i(102, 51, 0), Vector3i(111, 51, 0))
	assert_int(plan.place.size()).is_equal(8)
	assert_int(plan.count_of(BuildRules.Verdict.INCOMPATIBLE_HULL)).is_equal(2)
	assert_array(plan.bad_cells()).contains_exactly_in_any_order([Vector3i(110, 51, 0), Vector3i(111, 51, 0)])
	# Level 2 is above the STARTER limit; level 1 beyond the block has no hull below it.
	var high := _plan(Vector3i(100, 50, 2), Vector3i(101, 50, 2))
	assert_int(high.count_of(BuildRules.Verdict.HULL_Z_RESTRICTED)).is_equal(2)
	var first := _plan(Vector3i(100, 50, 1), Vector3i(103, 50, 1))
	assert_array(first.place).contains_exactly_in_any_order([Vector3i(100, 50, 1), Vector3i(101, 50, 1), Vector3i(102, 50, 1)])
	assert_that(first.skipped.get(Vector3i(103, 50, 1))).is_equal(BuildRules.Verdict.OVERHANG_EXCEEDED)


func test_reasons_come_most_frequent_first() -> void:
	# Level 1 from the block east: x 101..102 rest on the block, x 103..104 hang out too far, x 105
	# rests on the dock but is cut off, the cell above the dock (x 106) would found a guest.
	var plan := _plan(Vector3i(101, 50, 1), Vector3i(106, 50, 1))
	assert_array(plan.place).is_equal([Vector3i(101, 50, 1), Vector3i(102, 50, 1)])
	assert_that(plan.skipped.get(Vector3i(106, 50, 1))).is_equal(BuildRules.Verdict.GUEST_PLACEMENT)
	assert_that(plan.skipped.get(Vector3i(105, 50, 1))).is_equal(BuildRules.Verdict.NOT_CONNECTED)
	assert_array(plan.reasons()).is_equal([BuildRules.Verdict.OVERHANG_EXCEEDED, BuildRules.Verdict.GUEST_PLACEMENT,
		BuildRules.Verdict.NOT_CONNECTED])
	assert_int(plan.count_of(BuildRules.Verdict.OVERHANG_EXCEEDED)).is_equal(2)


func test_foreign_cells_block_the_whole_shape() -> void:
	var plan := _plan(Vector3i(102, 50, 0), Vector3i(104, 51, 0), HullShapes.Shape.RECTANGLE, {Vector3i(104, 51, 0): true})
	assert_bool(plan.blocked()).is_true()
	assert_array(plan.foreign).is_equal([Vector3i(104, 51, 0)])
	assert_array(plan.bad_cells()).contains([Vector3i(104, 51, 0)])
	assert_bool(plan.buildable(99)).is_false()


func test_too_few_hulls_in_the_store_make_it_unbuildable() -> void:
	var plan := _plan(Vector3i(102, 50, 0), Vector3i(103, 51, 0))
	assert_int(plan.place.size()).is_equal(4)
	assert_bool(plan.buildable(3)).is_false()
	assert_bool(plan.buildable(4)).is_true()


func test_other_own_structures_count_as_taken() -> void:
	var neighbour := _surface(2, Vector3i(103, 50, 0), "[[0,0,0,0]]")
	var neighbours: Array[StructureLayout] = [neighbour]
	var plan := _plan(Vector3i(102, 50, 0), Vector3i(103, 50, 0), HullShapes.Shape.RECTANGLE, {}, neighbours)
	assert_array(plan.own).is_equal([Vector3i(103, 50, 0)])
	assert_array(plan.place).is_equal([Vector3i(102, 50, 0)])


func test_without_game_data_only_places_overhang_and_the_way_count() -> void:
	var cells := HullShapes.cells(HullShapes.Shape.RECTANGLE, Vector3i(102, 51, 0), Vector3i(111, 51, 0))
	var plan := HullShapes.plan(cells, _host, _none, _none, {}, "STARTER")
	assert_int(plan.place.size()).is_equal(10)


func test_place_ops_carry_whole_numbers_in_order() -> void:
	var cells: Array[Vector3i] = [Vector3i(1, 2, 3), Vector3i(-4, 5, 0)]
	var ops := HullShapes.place_ops("STARTER", cells)
	assert_int(ops.size()).is_equal(2)
	assert_that(ops[0]).is_equal({"op": "placeHull", "hullType": "STARTER", "x": 1, "y": 2, "z": 3})
	assert_int(typeof(ops[1]["x"])).is_equal(TYPE_INT)
	var x: int = ops[1]["x"]
	assert_int(x).is_equal(-4)
