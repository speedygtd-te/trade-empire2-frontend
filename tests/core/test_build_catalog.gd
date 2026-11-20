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


func test_without_owners_in_the_data_they_are_derived() -> void:
	# The draft.37/38 server keeps `owners` out of /v2/definitions: prefix, maker and the shared list decide.
	var definitions := GameDefinitions.from_bundle({
		"dataHash": "x",
		"modules": [
			{"key": "PUMP", "displayName": "Pump", "category": "PRODUCTION", "item": "PUMP_MODULE",
				"manufacturedBy": "FACTORY"},
			{"key": "LIFE_SUPPORT", "displayName": "Life Support", "category": "COLONY", "item": "LIFE_SUPPORT_MODULE",
				"manufacturedBy": "FACTORY"},
			{"key": "PROTEIN_SYNTHESIZER", "displayName": "Protein", "category": "PRODUCTION",
				"item": "PROTEIN_SYNTHESIZER_MODULE", "manufacturedBy": "ENTERPRISE_FACTORY"},
			{"key": "ENTERPRISE_LAB", "displayName": "Lab", "category": "PRODUCTION", "item": "ENTERPRISE_LAB_MODULE"},
		],
		"hulls": [
			{"key": "STARTER", "displayName": "Starter", "item": "HULL_STARTER"},
			{"key": "ENTERPRISE_DOCK", "displayName": "Enterprise Dock", "item": "HULL_ENTERPRISE_DOCK"},
		],
	})
	var units := {"PUMP_MODULE": 1, "LIFE_SUPPORT_MODULE": 1, "PROTEIN_SYNTHESIZER_MODULE": 1,
		"ENTERPRISE_LAB_MODULE": 1, "HULL_STARTER": 1, "HULL_ENTERPRISE_DOCK": 1}

	assert_bool(definitions.owners_known).is_true()
	assert_bool(definitions.owners_derived).is_true()
	assert_bool(definitions.module("PROTEIN_SYNTHESIZER").enterprise_buildable).is_true()
	assert_bool(definitions.module("ENTERPRISE_LAB").enterprise_buildable).is_false()
	var player: Array[String] = []
	for entry: BuildCatalog.Entry in BuildCatalog.entries(definitions, units):
		player.append(entry.tool)
	var enterprise: Array[String] = []
	for entry: BuildCatalog.Entry in BuildCatalog.entries(definitions, units, "enterprise"):
		enterprise.append(entry.tool)
	assert_array(player).contains_exactly_in_any_order(["hull:STARTER", "module:PUMP", "module:LIFE_SUPPORT"])
	assert_array(enterprise).contains_exactly_in_any_order(["hull:ENTERPRISE_DOCK", "module:LIFE_SUPPORT",
		"module:PROTEIN_SYNTHESIZER", "module:ENTERPRISE_LAB"])


func test_owners_from_the_data_are_not_derived() -> void:
	var definitions := GameDefinitions.from_bundle({
		"dataHash": "x",
		"modules": [{"key": "ENTERPRISE_X", "displayName": "X", "item": "ENTERPRISE_X_MODULE", "owners": ["PLAYER"]}],
	})

	assert_bool(definitions.owners_derived).is_false()
	assert_bool(definitions.module("ENTERPRISE_X").allows("player")).is_true()
