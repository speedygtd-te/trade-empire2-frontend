extends GdUnitTestSuite

const BUNDLE := {
	"dataHash": "x",
	"modules": [
		{"key": "MINE", "size": {"x": 1.0, "y": 1.0, "z": 1.0}, "positioning": ["INDOOR"]},
		{"key": "SOLAR_PANEL", "size": {"x": 1.0, "y": 1.0, "z": 1.0}, "positioning": ["OUTDOOR"]},
		{"key": "FARM", "size": {"x": 2.0, "y": 1.0, "z": 1.0}, "positioning": ["INDOOR"]},
		{"key": "STAIRCASE", "size": {"x": 1.0, "y": 1.0, "z": 1.0}, "positioning": ["INDOOR", "OUTDOOR"],
			"verticalAccess": true},
	],
	"hulls": [
		{"key": "STARTER", "modulePositioning": "INDOOR", "environments": ["SURFACE"]},
		{"key": "PLATFORM_OUTDOOR", "modulePositioning": "OUTDOOR", "environments": ["SURFACE"]},
		{"key": "DOCK", "environments": ["SURFACE"]},
	],
}

var _definitions: GameDefinitions
var _layout: StructureLayout


func before_test() -> void:
	_definitions = GameDefinitions.from_bundle(BUNDLE)
	# Hulls: STARTER at (0,0) and (1,0), PLATFORM_OUTDOOR at (0,1), DOCK at (1,1); MINE on (0,0).
	_layout = StructureLayout.new()
	_layout.apply(Ndjson.parse(
		'{"line":"header","structureId":1,"anchor":{"type":"surface","offset":{"x":0,"y":0,"z":0}},'
		+ '"rev":1,"chunks":1}\n'
		+ '{"line":"chunk","chunk":[0,0,0],"version":1,"hullTypes":["STARTER","PLATFORM_OUTDOOR","DOCK"],'
		+ '"hulls":[[0,0,0,0],[1,0,0,0],[0,1,0,1],[1,1,0,2]],"modules":[{"moduleId":3,"moduleType":"MINE",'
		+ '"x":0,"y":0,"z":0,"size":{"x":1,"y":1,"z":1},"rotation":0,"status":"active","completesAt":0}]}\n'
		+ '{"line":"end","rev":1}'
	))


func test_hull_next_to_the_structure_is_fine() -> void:
	assert_int(BuildRules.check_place_hull(_layout, Vector3i(2, 0, 0))).is_equal(BuildRules.Verdict.OK)


func test_hull_on_a_hull_is_occupied() -> void:
	assert_int(BuildRules.check_place_hull(_layout, Vector3i(1, 0, 0))).is_equal(BuildRules.Verdict.OCCUPIED)


func test_hull_without_a_neighbour_is_not_connected() -> void:
	assert_int(BuildRules.check_place_hull(_layout, Vector3i(5, 5, 0))).is_equal(BuildRules.Verdict.NOT_CONNECTED)
	# A diagonal neighbour is not enough: hulls need face contact.
	assert_int(BuildRules.check_place_hull(_layout, Vector3i(2, 2, 0))).is_equal(BuildRules.Verdict.NOT_CONNECTED)


func test_hull_on_top_of_a_hull_is_fine() -> void:
	assert_int(BuildRules.check_place_hull(_layout, Vector3i(0, 0, 1))).is_equal(BuildRules.Verdict.OK)


func test_hull_under_the_ground_is_fine() -> void:
	# Underground there is no overhang: the face contact is enough.
	assert_int(BuildRules.check_place_hull(_layout, Vector3i(1, 0, -1))).is_equal(BuildRules.Verdict.OK)


func test_hull_above_the_ground_needs_a_hull_among_the_nine_below() -> void:
	# A bridge out at level 1: (0,0,1) … (2,0,1) rest on (0,0,0) and (1,0,0) below.
	var bridge := _stack('[[0,0,0,0],[1,0,0,0],[0,0,1,0],[1,0,1,0],[2,0,1,0]]')

	# (3,0,1) touches (2,0,1), but x 2..4 at level 0 is empty.
	assert_int(BuildRules.check_place_hull(bridge, Vector3i(3, 0, 1))).is_equal(BuildRules.Verdict.OVERHANG_EXCEEDED)
	# Diagonally above a hull is enough.
	assert_int(BuildRules.check_place_hull(bridge, Vector3i(2, 1, 1))).is_equal(BuildRules.Verdict.OK)
	# Level 2 over level 1 rests on it.
	assert_int(BuildRules.check_place_hull(bridge, Vector3i(2, 0, 2))).is_equal(BuildRules.Verdict.OK)


func test_overhang_counts_the_hulls_of_other_structures() -> void:
	var bridge := _stack('[[0,0,0,0],[0,0,1,0],[1,0,1,0],[2,0,1,0]]')
	var neighbour := _stack('[[4,0,0,0]]')
	var supports: Array[StructureLayout] = [neighbour]

	assert_int(BuildRules.check_place_hull(bridge, Vector3i(3, 0, 1))).is_equal(BuildRules.Verdict.OVERHANG_EXCEEDED)
	assert_int(BuildRules.check_place_hull(bridge, Vector3i(3, 0, 1), supports)).is_equal(BuildRules.Verdict.OK)


func test_staircase_needs_a_free_hull_above() -> void:
	var tower := _stack('[[0,0,0,0],[1,0,0,0],[0,0,1,0],[1,0,1,0]]',
		'{"moduleId":7,"moduleType":"MINE","x":1,"y":0,"z":1,"size":{"x":1,"y":1,"z":1},"rotation":0,"status":"active"}')

	assert_int(BuildRules.check_place_module(tower, _definitions, "STAIRCASE", Vector3i(0, 0, 0))) \
		.is_equal(BuildRules.Verdict.OK)
	assert_int(BuildRules.check_place_module(tower, _definitions, "STAIRCASE", Vector3i(1, 0, 0))) \
		.is_equal(BuildRules.Verdict.HULL_ABOVE_OCCUPIED)
	assert_int(BuildRules.check_place_module(tower, _definitions, "STAIRCASE", Vector3i(0, 0, 1))) \
		.is_equal(BuildRules.Verdict.NO_HULL_ABOVE)


func test_shaft_head_is_taken() -> void:
	var tower := _stack('[[0,0,0,0],[0,0,1,0],[0,0,2,0],[1,0,0,0]]', _floor(8, 0, "active"))

	# The head (0,0,1) carries no module of its own, but neither another module nor removal.
	assert_int(BuildRules.check_place_module(tower, _definitions, "MINE", Vector3i(0, 0, 1))) \
		.is_equal(BuildRules.Verdict.HULL_OCCUPIED)
	assert_int(BuildRules.check_remove_hull(tower, Vector3i(0, 0, 1))).is_equal(BuildRules.Verdict.HULL_HAS_MODULE)
	assert_int(BuildRules.check_place_module(tower, _definitions, "STAIRCASE", Vector3i(0, 0, 1))) \
		.is_equal(BuildRules.Verdict.HULL_OCCUPIED)
	assert_bool(tower.is_shaft_head(Vector3i(0, 0, 1))).is_true()
	assert_bool(tower.is_shaft_head(Vector3i(0, 0, 0))).is_false()


func test_shaft_extends_from_any_floor_or_its_head() -> void:
	var tower := _stack('[[0,0,0,0],[0,0,1,0],[0,0,2,0],[0,0,3,0]]', _floor(8, 0, "active") + "," + _floor(9, 1, "active"))

	for cell: Vector3i in [Vector3i(0, 0, 0), Vector3i(0, 0, 1), Vector3i(0, 0, 2)]:
		assert_int(BuildRules.check_extend_shaft(tower, _definitions, cell)).is_equal(BuildRules.Verdict.OK)
	# Two floors: the head is (0,0,2) and the free hull (0,0,3) above it takes the new floor's head.
	# One floor without a hull above its head (0,0,1) has nothing to extend into.
	var short := _stack('[[0,0,0,0],[0,0,1,0]]', _floor(8, 0, "active"))
	assert_int(BuildRules.check_extend_shaft(short, _definitions, Vector3i(0, 0, 0))).is_equal(BuildRules.Verdict.NO_HULL_ABOVE)


func test_shaft_extends_only_when_its_base_is_finished_and_it_is_short_enough() -> void:
	var building := _stack('[[0,0,0,0],[0,0,1,0],[0,0,2,0]]', _floor(8, 0, "building"))
	assert_int(BuildRules.check_extend_shaft(building, _definitions, Vector3i(0, 0, 1))).is_equal(BuildRules.Verdict.BASE_BUILDING)

	var hulls := PackedStringArray()
	var floors := PackedStringArray()
	for z: int in LevelRules.MAX_SHAFT_FLOORS + 2:
		hulls.append("[0,0,%d,0]" % z)
		if z < LevelRules.MAX_SHAFT_FLOORS:
			floors.append(_floor(100 + z, z, "active"))
	var tall := _stack("[%s]" % ",".join(hulls), ",".join(floors))
	assert_int(BuildRules.check_extend_shaft(tall, _definitions, Vector3i(0, 0, 3))).is_equal(BuildRules.Verdict.SHAFT_TOO_TALL)


func test_only_a_staircase_or_elevator_extends() -> void:
	assert_int(BuildRules.check_extend_shaft(_layout, _definitions, Vector3i(0, 0, 0))).is_equal(BuildRules.Verdict.NOT_VERTICAL_ACCESS)
	assert_int(BuildRules.check_extend_shaft(_layout, _definitions, Vector3i(1, 0, 0))).is_equal(BuildRules.Verdict.NOT_VERTICAL_ACCESS)


## A STARTER layout of the given hulls (chunk 0) and modules, knowing the shaft types.
func _stack(hulls: String, modules: String = "") -> StructureLayout:
	var layout := StructureLayout.new()
	layout.vertical_types = _definitions.vertical_types()
	layout.apply(Ndjson.parse(
		'{"line":"header","structureId":2,"anchor":{"type":"surface","offset":{"x":0,"y":0,"z":0}},"rev":1,"chunks":1}\n'
		+ '{"line":"chunk","chunk":[0,0,0],"version":1,"hullTypes":["STARTER"],"hulls":%s,"modules":[%s]}\n' % [hulls, modules]
		+ '{"line":"end","rev":1}'
	))
	return layout


## One staircase floor at (0, 0, z).
static func _floor(module_id: int, z: int, status: String) -> String:
	return '{"moduleId":%d,"moduleType":"STAIRCASE","x":0,"y":0,"z":%d,"size":{"x":1,"y":1,"z":1},"rotation":0,"status":"%s"}' % [
		module_id, z, status]


func test_module_on_a_free_matching_hull_is_fine() -> void:
	var verdict := BuildRules.check_place_module(_layout, _definitions, "MINE", Vector3i(1, 0, 0))

	assert_int(verdict).is_equal(BuildRules.Verdict.OK)


func test_module_checks_hull_module_and_positioning() -> void:
	assert_int(BuildRules.check_place_module(_layout, _definitions, "MINE", Vector3i(0, 0, 0))) \
		.is_equal(BuildRules.Verdict.HULL_OCCUPIED)
	assert_int(BuildRules.check_place_module(_layout, _definitions, "MINE", Vector3i(4, 4, 0))) \
		.is_equal(BuildRules.Verdict.NO_HULL)
	assert_int(BuildRules.check_place_module(_layout, _definitions, "MINE", Vector3i(0, 1, 0))) \
		.is_equal(BuildRules.Verdict.POSITIONING)
	assert_int(BuildRules.check_place_module(_layout, _definitions, "SOLAR_PANEL", Vector3i(0, 1, 0))) \
		.is_equal(BuildRules.Verdict.OK)
	assert_int(BuildRules.check_place_module(_layout, _definitions, "MINE", Vector3i(1, 1, 0))) \
		.is_equal(BuildRules.Verdict.POSITIONING)
	assert_int(BuildRules.check_place_module(_layout, _definitions, "NOPE", Vector3i(1, 0, 0))) \
		.is_equal(BuildRules.Verdict.UNKNOWN_TYPE)


func test_multi_cell_module_needs_every_footprint_cell() -> void:
	# Unrotated the farm covers (1,0) and (2,0); (2,0) has no hull.
	assert_int(BuildRules.check_place_module(_layout, _definitions, "FARM", Vector3i(1, 0, 0))) \
		.is_equal(BuildRules.Verdict.NO_HULL)
	# Turned by 90 degrees it covers (1,0) and (1,1); (1,1) is a dock without module slot.
	assert_int(BuildRules.check_place_module(_layout, _definitions, "FARM", Vector3i(1, 0, 0), 90)) \
		.is_equal(BuildRules.Verdict.POSITIONING)


func test_footprint_swaps_x_and_y_when_turned() -> void:
	var cells := BuildRules.footprint(Vector3i(2, 1, 1), Vector3i(5, 5, 0), 270)

	assert_array(cells).contains_exactly([Vector3i(5, 5, 0), Vector3i(5, 6, 0)])


func test_remove_hull_only_without_module() -> void:
	assert_int(BuildRules.check_remove_hull(_layout, Vector3i(0, 0, 0))).is_equal(BuildRules.Verdict.HULL_HAS_MODULE)
	assert_int(BuildRules.check_remove_hull(_layout, Vector3i(1, 0, 0))).is_equal(BuildRules.Verdict.OK)
	assert_int(BuildRules.check_remove_hull(_layout, Vector3i(9, 9, 0))).is_equal(BuildRules.Verdict.NO_HULL)
