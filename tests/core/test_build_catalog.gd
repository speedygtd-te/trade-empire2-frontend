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


func test_an_entry_names_the_store_item_it_is_built_from() -> void:
	var items := {}
	for entry: BuildCatalog.Entry in BuildCatalog.entries(_definitions, _units()):
		items[entry.tool] = entry.item

	assert_str(items["hull:STARTER"]).is_equal("HULL_STARTER")
	assert_str(items["module:PUMP"]).is_equal("PUMP_MODULE")


func test_owners_decide_who_may_build_when_the_data_says() -> void:
	var definitions := GameDefinitions.from_bundle({
		"dataHash": "x",
		"modules": [
			{"key": "PUMP", "displayName": "Pump", "category": "PRODUCTION", "item": "PUMP_MODULE"},
			{"key": "LIFE_SUPPORT", "displayName": "Life Support", "category": "COLONY", "item": "LIFE_SUPPORT_MODULE",
				"owners": ["PLAYER", "ENTERPRISE"]},
			{"key": "ENTERPRISE_GENERATOR", "displayName": "Generator", "category": "COLONY",
				"item": "ENTERPRISE_GENERATOR_MODULE", "owners": ["ENTERPRISE"], "enterpriseBuildable": true},
		],
		"hulls": [{"key": "ENTERPRISE_DOCK", "displayName": "Enterprise Dock", "item": "HULL_ENTERPRISE_DOCK",
			"owners": ["ENTERPRISE"]}],
	})
	var units := {"PUMP_MODULE": 1, "LIFE_SUPPORT_MODULE": 1, "ENTERPRISE_GENERATOR_MODULE": 1, "HULL_ENTERPRISE_DOCK": 1}

	assert_bool(definitions.owners_known).is_true()
	assert_bool(definitions.module("ENTERPRISE_GENERATOR").enterprise_buildable).is_true()
	var player: Array[String] = []
	for entry: BuildCatalog.Entry in BuildCatalog.entries(definitions, units):
		player.append(entry.tool)
	var enterprise: Array[String] = []
	for entry: BuildCatalog.Entry in BuildCatalog.entries(definitions, units, "enterprise"):
		enterprise.append(entry.tool)
	assert_array(player).contains_exactly_in_any_order(["module:PUMP", "module:LIFE_SUPPORT"])
	assert_array(enterprise).contains_exactly_in_any_order(["hull:ENTERPRISE_DOCK", "module:LIFE_SUPPORT",
		"module:ENTERPRISE_GENERATOR"])


func test_without_owners_in_the_data_nothing_is_filtered() -> void:
	# The draft.37 server keeps `owners` out of /v2/definitions.
	assert_bool(_definitions.owners_known).is_false()
	assert_int(BuildCatalog.entries(_definitions, _units(), "enterprise").size()).is_equal(
		BuildCatalog.entries(_definitions, _units()).size())
