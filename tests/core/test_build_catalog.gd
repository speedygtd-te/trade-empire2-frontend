extends GdUnitTestSuite

const BUNDLE := {
	"dataHash": "x",
	"modules": [
		{"key": "PUMP", "displayName": "Pump", "category": "PRODUCTION", "item": "PUMP_MODULE"},
		{"key": "MINE", "displayName": "mine", "category": "PRODUCTION", "item": "MINE_MODULE"},
		{"key": "HABITAT", "displayName": "Habitat", "category": "COLONY", "item": "HABITAT_MODULE"},
		{"key": "ODDITY", "displayName": "Oddity", "category": "SOMETHING_NEW", "item": "ODDITY_MODULE"},
		{"key": "LASER", "displayName": "Laser", "category": "MILITARY", "item": "LASER_MODULE"},
	],
	"hulls": [
		{"key": "STARTER", "displayName": "Starter Hull", "item": "HULL_STARTER"},
		{"key": "DOCK", "displayName": "Dock", "item": "HULL_DOCK"},
	],
}

var _definitions: GameDefinitions


func before_test() -> void:
	_definitions = GameDefinitions.from_bundle(BUNDLE)


func _units() -> Dictionary:
	return {"HULL_STARTER": 15, "HULL_DOCK": 0, "PUMP_MODULE": 2, "MINE_MODULE": 1, "HABITAT_MODULE": 3,
		"ODDITY_MODULE": 1}


func test_only_what_the_store_holds_is_offered() -> void:
	var tools: Array[String] = []
	for entry: BuildCatalog.Entry in BuildCatalog.entries(_definitions, _units()):
		tools.append(entry.tool)

	assert_array(tools).contains_exactly_in_any_order(
		["hull:STARTER", "module:PUMP", "module:MINE", "module:HABITAT", "module:ODDITY"])


func test_categories_come_in_palette_order_unknown_last() -> void:
	var list := BuildCatalog.entries(_definitions, _units())

	assert_array(Array(BuildCatalog.categories(list))).is_equal(["HULLS", "PRODUCTION", "COLONY", "OTHER"])


func test_a_category_lists_its_entries_by_name() -> void:
	var list := BuildCatalog.entries(_definitions, _units())
	var production := BuildCatalog.in_category(list, "PRODUCTION")

	assert_str(production[0].display_name).is_equal("mine")
	assert_str(production[1].display_name).is_equal("Pump")
	assert_int(production[1].count).is_equal(2)
	assert_str(BuildCatalog.category_of(list, "hull:STARTER")).is_equal("HULLS")
	assert_str(BuildCatalog.category_of(list, "module:LASER")).is_empty()
