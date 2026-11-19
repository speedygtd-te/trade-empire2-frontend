extends GdUnitTestSuite
## Values are checked against the server's formula (Backend-V2 statics.rs / body.rs), by hand.

var _definitions: GameDefinitions


func before_test() -> void:
	# Numbers as JSON delivers them: floats.
	_definitions = GameDefinitions.from_bundle({"dataHash": "x", "modules": [
		{"key": "MINE", "zLevel": {"bonusPerLevelPercent": 2000000.0, "preferHigh": false}},
		{"key": "COLLECTOR", "zLevel": {"bonusPerLevelPercent": 1000000.0, "preferHigh": true}},
		{"key": "SMELTER"},
	], "blueprints": [
		{"key": "IRON_EXTRACTION", "host": "MINE", "category": "EXTRACTION", "requiredTileResource": "IRON",
			"outputs": [{"resource": "IRON", "ratePerHour": 100000000.0}], "basis": true},
		{"key": "COPPER_EXTRACTION", "host": "MINE", "category": "EXTRACTION", "requiredTileResource": "COPPER",
			"outputs": [{"resource": "COPPER", "ratePerHour": 80000000.0}], "basis": true},
		{"key": "URANIUM_EXTRACTION", "host": "MINE", "category": "EXTRACTION", "requiredTileResource": "URANIUM",
			"outputs": [{"resource": "URANIUM", "ratePerHour": 20000000.0}]},
		{"key": "OXYGEN_COLLECTION", "host": "COLLECTOR", "category": "EXTRACTION", "requiredAtmosphereGas": "OXYGEN",
			"outputs": [{"resource": "OXYGEN", "ratePerHour": 50000000.0}]},
		{"key": "ORBITAL_OXYGEN", "host": "COLLECTOR", "category": "EXTRACTION", "requiredAtmosphereGas": "OXYGEN",
			"orbitOnly": true, "outputs": [{"resource": "OXYGEN", "ratePerHour": 50000000.0}]},
		{"key": "IRON_PLATES", "host": "SMELTER", "category": "PROCESSING",
			"inputs": [{"resource": "IRON", "ratePerHour": 2000000.0}],
			"outputs": [{"resource": "IRON_PLATE", "ratePerHour": 1000000.0}]},
	]})


func test_extraction_recipes_are_told_apart() -> void:
	assert_bool(ExtractionYield.is_extraction(_definitions.blueprint("IRON_EXTRACTION"))).is_true()
	assert_bool(ExtractionYield.is_extraction(_definitions.blueprint("OXYGEN_COLLECTION"))).is_true()
	assert_bool(ExtractionYield.is_extraction(_definitions.blueprint("IRON_PLATES"))).is_false()
	assert_bool(ExtractionYield.is_extraction(null)).is_false()
	assert_bool(ExtractionYield.extracts(_definitions, "MINE")).is_true()
	assert_bool(ExtractionYield.extracts(_definitions, "SMELTER")).is_false()


func test_ground_level_above_the_ground_is_the_surface() -> void:
	assert_int(ExtractionYield.ground_level(3)).is_equal(0)
	assert_int(ExtractionYield.ground_level(0)).is_equal(0)
	assert_int(ExtractionYield.ground_level(-4)).is_equal(-4)


func test_tile_richness_adds_the_depth_bonus_below_the_ground() -> void:
	var cell := {"IRON": 89, "COPPER": 98}
	assert_int(ExtractionYield.tile_richness(cell, "IRON", 0)).is_equal(89)
	assert_int(ExtractionYield.tile_richness(cell, "IRON", 2)).is_equal(89)
	assert_int(ExtractionYield.tile_richness(cell, "IRON", -3)).is_equal(95)
	# Never above 100.
	assert_int(ExtractionYield.tile_richness(cell, "COPPER", -3)).is_equal(100)
	# No deposit: nothing, also deep down.
	assert_int(ExtractionYield.tile_richness(cell, "WATER", -5)).is_equal(0)


func test_average_rounds_down() -> void:
	assert_int(ExtractionYield.average([40, 41, 42, 44])).is_equal(41)
	assert_int(ExtractionYield.average([7])).is_equal(7)
	assert_int(ExtractionYield.average([])).is_equal(0)


func test_gas_richness_follows_share_and_density() -> void:
	# 0.214 × 1.1 / 0.2 = 1.177 → 58.
	assert_int(ExtractionYield.gas_richness(0.214, 1.1)).is_equal(58)
	# 0.72 × 1.1 / 0.2 = 3.96 → capped at 2.0 → 100.
	assert_int(ExtractionYield.gas_richness(0.72, 1.1)).is_equal(100)
	# Thin air: at least 0.1 → 5.
	assert_int(ExtractionYield.gas_richness(0.01, 0.01)).is_equal(5)
	# Below a 1 % share: nothing.
	assert_int(ExtractionYield.gas_richness(0.005, 1.0)).is_equal(0)


func test_z_numerator_matches_the_server() -> void:
	var mine := _definitions.module("MINE")
	var collector := _definitions.module("COLLECTOR")
	assert_int(ExtractionYield.z_numerator(mine, 0)).is_equal(100000000)
	assert_int(ExtractionYield.z_numerator(mine, -3)).is_equal(106000000)
	assert_int(ExtractionYield.z_numerator(mine, 2)).is_equal(96000000)
	assert_int(ExtractionYield.z_numerator(collector, 5)).is_equal(105000000)
	# Never below a tenth.
	assert_int(ExtractionYield.z_numerator(collector, -100)).is_equal(10000000)
	assert_int(ExtractionYield.z_numerator(_definitions.module("SMELTER"), 7)).is_equal(100000000)
	assert_int(ExtractionYield.z_numerator(null, 7)).is_equal(100000000)


func test_rate_is_base_times_richness_times_level() -> void:
	var mine := _definitions.module("MINE")
	assert_int(ExtractionYield.rate(100000000, 89, mine, 0)).is_equal(89000000)
	assert_int(ExtractionYield.rate(100000000, 40, mine, -3)).is_equal(42400000)
	# The largest rate of the game data (big pump) deep down does not overflow.
	assert_int(ExtractionYield.rate(2000000000, 100, mine, -10)).is_equal(2400000000)
	# Rounded down once.
	assert_int(ExtractionYield.rate(1, 1, null, 0)).is_equal(0)
	assert_int(ExtractionYield.rate(333, 33, mine, -1)).is_equal(112)
	assert_int(ExtractionYield.rate(100000000, 0, mine, 0)).is_equal(0)


func test_estimate_of_a_mine_averages_its_footprint() -> void:
	var cells: Array[Dictionary] = [{"IRON": 40}, {"IRON": 45}]
	var found := ExtractionYield.estimate(_definitions.blueprint("IRON_EXTRACTION"), _definitions.module("MINE"),
		0, cells, {}, 1.0)

	assert_str(found.blueprint).is_equal("IRON_EXTRACTION")
	assert_str(found.resource).is_equal("IRON")
	assert_int(found.richness).is_equal(42)
	assert_int(found.rate).is_equal(42000000)
	assert_float(found.gas_share).is_equal(-1.0)
	assert_bool(found.works()).is_true()


func test_estimate_without_deposit_stands_still() -> void:
	var cells: Array[Dictionary] = [{"IRON": 40}]
	var found := ExtractionYield.estimate(_definitions.blueprint("COPPER_EXTRACTION"), _definitions.module("MINE"),
		0, cells, {}, 1.0)

	assert_int(found.richness).is_equal(0)
	assert_int(found.rate).is_equal(0)
	assert_bool(found.works()).is_false()


func test_estimate_of_a_collector_reads_the_air() -> void:
	var none: Array[Dictionary] = []
	var found := ExtractionYield.estimate(_definitions.blueprint("OXYGEN_COLLECTION"), _definitions.module("COLLECTOR"),
		0, none, {"NITROGEN": 0.72, "OXYGEN": 0.214}, 1.1)

	assert_float(found.gas_share).is_equal_approx(0.214, 0.000001)
	assert_int(found.richness).is_equal(58)
	assert_int(found.rate).is_equal(29000000)
	# Orbit-only recipes do nothing on a surface.
	var orbital := ExtractionYield.estimate(_definitions.blueprint("ORBITAL_OXYGEN"), _definitions.module("COLLECTOR"),
		0, none, {"OXYGEN": 0.214}, 1.1)
	assert_int(orbital.rate).is_equal(0)
	assert_bool(orbital.works()).is_false()
	# No such gas in the air.
	var airless := ExtractionYield.estimate(_definitions.blueprint("OXYGEN_COLLECTION"), _definitions.module("COLLECTOR"),
		0, none, {}, 0.0)
	assert_float(airless.gas_share).is_equal(0.0)
	assert_int(airless.rate).is_equal(0)


func test_estimate_of_other_recipes_is_null() -> void:
	var none: Array[Dictionary] = []
	assert_object(ExtractionYield.estimate(_definitions.blueprint("IRON_PLATES"), _definitions.module("SMELTER"),
		0, none, {}, 1.0)).is_null()


func test_estimates_come_best_first_and_respect_usable_recipes() -> void:
	var cells: Array[Dictionary] = [{"IRON": 20, "COPPER": 50, "URANIUM": 90}]

	var all := ExtractionYield.estimates(_definitions, "MINE", 0, cells, {}, 1.0)
	assert_int(all.size()).is_equal(3)
	# Copper 80 × 0.5 = 40/h, Iron 100 × 0.2 = 20/h, Uranium 20 × 0.9 = 18/h.
	assert_str(all[0].resource).is_equal("COPPER")
	assert_str(all[1].resource).is_equal("IRON")
	assert_str(all[2].resource).is_equal("URANIUM")

	var usable := ExtractionYield.estimates(_definitions, "MINE", 0, cells, {}, 1.0, {"IRON_EXTRACTION": true})
	assert_int(usable.size()).is_equal(1)
	assert_str(usable[0].resource).is_equal("IRON")
	assert_int(ExtractionYield.estimates(_definitions, "SMELTER", 0, cells, {}, 1.0).size()).is_equal(0)


func test_buckets_are_read_and_found() -> void:
	var buckets := ExtractionYield.buckets_from_wire([
		{"moduleType": "MINE", "blueprint": "IRON_EXTRACTION", "modules": 2.0,
			"outputs": [{"resource": "IRON", "nominal": 178000000.0, "effective": 120000000.0}]},
		{"moduleType": "POWER_PLANT", "modules": 1.0, "outputs": []},
	])

	assert_int(buckets.size()).is_equal(2)
	var mine := ExtractionYield.find_bucket(buckets, "MINE", "IRON_EXTRACTION")
	assert_int(mine.modules).is_equal(2)
	assert_int(mine.effective("IRON")).is_equal(120000000)
	assert_int(mine.effective("COPPER")).is_equal(0)
	assert_object(ExtractionYield.find_bucket(buckets, "MINE", "COPPER_EXTRACTION")).is_null()
	assert_int(ExtractionYield.buckets_from_wire(null).size()).is_equal(0)
