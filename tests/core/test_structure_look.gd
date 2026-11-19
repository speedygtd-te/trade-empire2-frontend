extends GdUnitTestSuite

const BUNDLE := {
	"dataHash": "x",
	"modules": [
		{"key": "MINE", "size": {"x": 1.0, "y": 1.0, "z": 1.0}, "positioning": ["INDOOR"]},
		{"key": "SOLAR_PANEL", "size": {"x": 1.0, "y": 1.0, "z": 1.0}, "positioning": ["OUTDOOR"]},
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
	# STARTER at (0,0) with a finished MINE, PLATFORM_OUTDOOR at (1,0) with a SOLAR_PANEL under
	# construction, DOCK at (2,0), STARTER at (3,0) with a SOLAR_PANEL (as on the starter colony),
	# an empty STARTER at (4,0).
	_layout = StructureLayout.new()
	_layout.apply(Ndjson.parse(
		'{"line":"header","structureId":1,"anchor":{"type":"surface","offset":{"x":0,"y":0,"z":0}},'
		+ '"rev":1,"chunks":1}\n'
		+ '{"line":"chunk","chunk":[0,0,0],"version":1,"hullTypes":["STARTER","PLATFORM_OUTDOOR","DOCK"],'
		+ '"hulls":[[0,0,0,0],[1,0,0,1],[2,0,0,2],[3,0,0,0],[4,0,0,0]],"modules":['
		+ '{"moduleId":3,"moduleType":"MINE","x":0,"y":0,"z":0,"size":{"x":1,"y":1,"z":1},"rotation":0,"status":"active","completesAt":0},'
		+ '{"moduleId":4,"moduleType":"SOLAR_PANEL","x":1,"y":0,"z":0,"size":{"x":1,"y":1,"z":1},"rotation":0,"status":"building","completesAt":99},'
		+ '{"moduleId":5,"moduleType":"SOLAR_PANEL","x":3,"y":0,"z":0,"size":{"x":1,"y":1,"z":1},"rotation":0,"status":"active","completesAt":0}'
		+ ']}\n'
		+ '{"line":"end","rev":1}'
	))


func test_indoor_hulls_are_shut_platforms_and_docks_are_open() -> void:
	assert_bool(StructureLook.hull_closed(_definitions, "STARTER")).is_true()
	assert_bool(StructureLook.hull_closed(_definitions, "PLATFORM_OUTDOOR")).is_false()
	assert_bool(StructureLook.hull_closed(_definitions, "DOCK")).is_false()


func test_unknown_hulls_and_missing_data_stay_open() -> void:
	assert_bool(StructureLook.hull_closed(_definitions, "NO_SUCH_HULL")).is_false()
	assert_bool(StructureLook.hull_closed(null, "STARTER")).is_false()


func test_only_modules_outside_shut_hulls_show_on_a_closed_structure() -> void:
	var mine := _layout.module(3)
	var panel := _layout.module(4)

	assert_bool(StructureLook.module_visible_closed(_layout, _definitions, mine)).is_false()
	assert_bool(StructureLook.module_visible_closed(_layout, _definitions, panel)).is_true()


func test_counts_modules_under_construction() -> void:
	assert_int(StructureLook.modules_building(_layout)).is_equal(1)


func test_an_outdoor_module_keeps_its_cell_open_even_on_an_indoor_hull() -> void:
	assert_bool(StructureLook.cell_closed(_layout, _definitions, Vector3i(0, 0, 0))).is_true()
	assert_bool(StructureLook.cell_closed(_layout, _definitions, Vector3i(1, 0, 0))).is_false()
	assert_bool(StructureLook.cell_closed(_layout, _definitions, Vector3i(3, 0, 0))).is_false()
	assert_bool(StructureLook.cell_closed(_layout, _definitions, Vector3i(4, 0, 0))).is_true()
	assert_bool(StructureLook.module_visible_closed(_layout, _definitions, _layout.module(5))).is_true()


func test_outdoor_modules_are_those_with_an_outdoor_slot() -> void:
	assert_bool(StructureLook.module_outdoor(_definitions, "SOLAR_PANEL")).is_true()
	assert_bool(StructureLook.module_outdoor(_definitions, "MINE")).is_false()
	assert_bool(StructureLook.module_outdoor(null, "SOLAR_PANEL")).is_false()


func test_a_hull_model_is_its_floor_plate_or_shut_its_container() -> void:
	assert_str(StructureLook.hull_model("STARTER", false)).is_equal("hull_starter")
	assert_str(StructureLook.hull_model("GLASS_CARBON", true)).is_equal("hull_glass_carbon_closed")


func test_a_hull_without_model_borrows_the_standard_container_or_the_starter_floor() -> void:
	assert_str(StructureLook.hull_fallback(true)).is_equal("hull_standard_closed")
	assert_str(StructureLook.hull_fallback(false)).is_equal("hull_starter")
