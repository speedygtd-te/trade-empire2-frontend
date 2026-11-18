extends GdUnitTestSuite

## A trimmed bundle in the shape of GET /v2/definitions (draft.13). Numbers are floats, as
## Godot's JSON parser delivers them.
const BUNDLE := {
	"dataFormatVersion": 3.0,
	"dataHash": "cc18d757b6ce2517ead6745f734e740a73e15ca8b2dc90d621bf5f3c8214a643",
	"fixedPointScale": 1000000.0,
	"resources": [
		{"key": "IRON_PLATE", "displayName": "Iron Plate", "kind": "PRODUCED", "utility": false},
		{"key": "ENERGY", "displayName": "Energy", "kind": "PRODUCED", "utility": true},
	],
	"modules": [
		{
			"key": "PUMP", "displayName": "Pump", "category": "PRODUCTION",
			"size": {"x": 1.0, "y": 1.0, "z": 1.0}, "positioning": ["OUTDOOR", "UNDER_WATER"],
		},
		{
			"key": "BIG_PUMP", "displayName": "Big Pump", "category": "PRODUCTION",
			"size": {"x": 2.0, "y": 2.0, "z": 1.0}, "positioning": ["OUTDOOR"],
		},
	],
	"hulls": [
		{
			"key": "STARTER", "displayName": "Starter Hull", "modulePositioning": "INDOOR",
			"environments": ["SURFACE"],
		},
		{"key": "DOCK", "displayName": "Dock", "environments": ["SURFACE", "ORBIT"]},
	],
	"blueprints": [
		{
			"key": "SMELT_IRON", "displayName": "Smelt Iron", "host": "SMELTER", "category": "PROCESSING",
			"inputs": [{"resource": "IRON", "ratePerHour": 2000000.0}],
			"outputs": [{"resource": "IRON_PLATE", "ratePerHour": 1000000.0}], "basis": true,
		},
		{
			"key": "MINE_IRON", "displayName": "Mine Iron", "host": "MINE", "category": "EXTRACTION",
			"inputs": [], "outputs": [{"resource": "IRON", "ratePerHour": 5000000.0}],
			"requiredTileResource": "IRON", "basis": false,
		},
		{
			"key": "OXYGEN_COLLECTION", "displayName": "Collect Oxygen", "host": "COLLECTOR",
			"category": "EXTRACTION", "inputs": [], "outputs": [{"resource": "OXYGEN", "ratePerHour": 1000000.0}],
			"requiredAtmosphereGas": "OXYGEN", "basis": true,
		},
		{
			"key": "ORBITAL_HYDROGEN", "displayName": "Orbital Hydrogen", "host": "ORBITAL_COLLECTOR",
			"category": "EXTRACTION", "inputs": [], "outputs": [{"resource": "HYDROGEN", "ratePerHour": 1000000.0}],
			"requiredAtmosphereGas": "HYDROGEN", "orbitOnly": true, "basis": true,
		},
	],
}


func test_reads_blueprints_with_flows() -> void:
	var definitions := GameDefinitions.from_bundle(BUNDLE)

	var smelt := definitions.blueprint("SMELT_IRON")
	assert_str(smelt.display_name).is_equal("Smelt Iron")
	assert_str(smelt.host).is_equal("SMELTER")
	assert_bool(smelt.basis).is_true()
	assert_array(smelt.inputs).is_equal([["IRON", 2000000]])
	assert_array(smelt.outputs).is_equal([["IRON_PLATE", 1000000]])
	assert_str(definitions.blueprint("MINE_IRON").required_tile_resource).is_equal("IRON")


func test_reads_gas_collectors_and_orbit_only_recipes() -> void:
	var definitions := GameDefinitions.from_bundle(BUNDLE)

	var oxygen := definitions.blueprint("OXYGEN_COLLECTION")
	assert_str(oxygen.required_atmosphere_gas).is_equal("OXYGEN")
	assert_str(oxygen.required_tile_resource).is_empty()
	assert_bool(oxygen.orbit_only).is_false()
	assert_bool(definitions.blueprint("ORBITAL_HYDROGEN").orbit_only).is_true()
	assert_str(definitions.blueprint("SMELT_IRON").required_atmosphere_gas).is_empty()


func test_blueprints_of_a_module_type() -> void:
	var definitions := GameDefinitions.from_bundle(BUNDLE)

	var for_mine := definitions.blueprints_for("MINE")
	assert_int(for_mine.size()).is_equal(1)
	assert_str(for_mine[0].key).is_equal("MINE_IRON")
	assert_int(definitions.blueprints_for("PUMP").size()).is_equal(0)


func test_reads_whether_a_module_runs_blueprints() -> void:
	var definitions := GameDefinitions.from_bundle({
		"dataHash": "x", "modules": [{"key": "SMELTER", "blueprintDriven": true}, {"key": "HABITAT"}],
	})

	assert_bool(definitions.module("SMELTER").blueprint_driven).is_true()
	assert_bool(definitions.module("HABITAT").blueprint_driven).is_false()


func test_reads_modules_with_size_and_positioning() -> void:
	var definitions := GameDefinitions.from_bundle(BUNDLE)

	var pump := definitions.module("BIG_PUMP")
	assert_str(pump.display_name).is_equal("Big Pump")
	assert_str(pump.category).is_equal("PRODUCTION")
	assert_that(pump.size).is_equal(Vector3i(2, 2, 1))
	assert_array(Array(pump.positioning)).contains_exactly(["OUTDOOR"])
	assert_int(definitions.module_count()).is_equal(2)


func test_reads_hulls_and_a_hull_without_module_slot() -> void:
	var definitions := GameDefinitions.from_bundle(BUNDLE)

	assert_str(definitions.hull("STARTER").module_positioning).is_equal("INDOOR")
	assert_str(definitions.hull("DOCK").module_positioning).is_empty()
	assert_array(Array(definitions.hull("DOCK").environments)).contains_exactly(["SURFACE", "ORBIT"])


func test_reads_resource_display_names() -> void:
	var definitions := GameDefinitions.from_bundle(BUNDLE)

	assert_str(definitions.resource_name("IRON_PLATE")).is_equal("Iron Plate")
	assert_int(definitions.resource_count()).is_equal(2)


func test_unknown_keys_give_null_or_empty() -> void:
	var definitions := GameDefinitions.from_bundle(BUNDLE)

	assert_object(definitions.module("NOPE")).is_null()
	assert_object(definitions.hull("NOPE")).is_null()
	assert_str(definitions.resource_name("NOPE")).is_empty()


func test_reads_hash_and_scale_as_integers() -> void:
	var definitions := GameDefinitions.from_bundle(BUNDLE)

	assert_str(definitions.data_hash).starts_with("cc18d7")
	assert_int(definitions.fixed_point_scale).is_equal(1000000)


func test_missing_or_broken_size_falls_back_to_one_cell() -> void:
	var definitions := GameDefinitions.from_bundle({
		"dataHash": "x",
		"modules": [{"key": "ODD", "size": {"x": 0.0}}],
	})

	assert_that(definitions.module("ODD").size).is_equal(Vector3i.ONE)


func test_something_else_is_not_a_bundle() -> void:
	assert_object(GameDefinitions.from_bundle({"rev": 1.0, "gameTime": 2.0})).is_null()
	assert_object(GameDefinitions.from_bundle({"dataHash": "x", "modules": "no"})).is_null()
	assert_object(GameDefinitions.from_text("<html>proxy error</html>")).is_null()


func test_parses_from_text() -> void:
	var definitions := GameDefinitions.from_text(JSON.stringify(BUNDLE))

	assert_str(definitions.module("PUMP").display_name).is_equal("Pump")
	assert_that(definitions.module("PUMP").size).is_equal(Vector3i.ONE)
