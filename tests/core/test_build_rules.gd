extends GdUnitTestSuite

const BUNDLE := {
	"dataHash": "x",
	"modules": [
		{"key": "MINE", "size": {"x": 1.0, "y": 1.0, "z": 1.0}, "positioning": ["INDOOR"]},
		{"key": "SOLAR_PANEL", "size": {"x": 1.0, "y": 1.0, "z": 1.0}, "positioning": ["OUTDOOR"]},
		{"key": "FARM", "size": {"x": 2.0, "y": 1.0, "z": 1.0}, "positioning": ["INDOOR"]},
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


func test_hull_above_ground_is_not_offered_yet() -> void:
	assert_int(BuildRules.check_place_hull(_layout, Vector3i(0, 0, 1))).is_equal(BuildRules.Verdict.WRONG_LEVEL)


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
