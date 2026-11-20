extends GdUnitTestSuite

var _definitions: GameDefinitions


func before_test() -> void:
	_definitions = GameDefinitions.from_bundle({"dataHash": "x", "modules": [
		{"key": "MINE", "displayName": "Mine", "blueprintDriven": true},
		{"key": "SMELTER", "displayName": "Smelter", "blueprintDriven": true},
		{"key": "SOLAR_PANEL", "displayName": "Solar Panel"},
	], "blueprints": [
		{"key": "IRON_EXTRACTION", "displayName": "Iron Extraction", "host": "MINE", "requiredTileResource": "IRON",
			"outputs": [{"resource": "IRON", "ratePerHour": 100000000.0}]},
		{"key": "COPPER_EXTRACTION", "displayName": "Copper Extraction", "host": "MINE", "requiredTileResource": "COPPER",
			"outputs": [{"resource": "COPPER", "ratePerHour": 80000000.0}]},
		{"key": "ALUMINUM_EXTRACTION", "displayName": "Aluminum Extraction", "host": "MINE", "requiredTileResource": "ALUMINUM",
			"outputs": [{"resource": "ALUMINUM", "ratePerHour": 80000000.0}]},
		{"key": "IRON_PLATES", "displayName": "Iron Plates", "host": "SMELTER"},
	]})


func _module(id: int, type: String, blueprint: String, origin: Vector3i, status: String = "active") -> StructureLayout.Module:
	var module := StructureLayout.Module.new()
	module.module_id = id
	module.module_type = type
	module.blueprint = blueprint
	module.origin = origin
	module.status = status
	return module


func _modules() -> Array[StructureLayout.Module]:
	return [
		_module(1, "MINE", "IRON_EXTRACTION", Vector3i(0, 0, 0)),
		_module(2, "MINE", "COPPER_EXTRACTION", Vector3i(1, 0, 0)),
		_module(3, "MINE", "", Vector3i(2, 0, 0)),
		_module(4, "MINE", "IRON_EXTRACTION", Vector3i(3, 0, 0), "building"),
		_module(5, "SOLAR_PANEL", "", Vector3i(0, 1, 0)),
		_module(6, "SMELTER", "IRON_PLATES", Vector3i(1, 1, 0)),
		_module(7, "MINE", "ALUMINUM_EXTRACTION", Vector3i(4, 0, 0)),
		_module(8, "MINE", "COPPER_EXTRACTION", Vector3i(5, 0, 0)),
		_module(9, "MINE", "", Vector3i(6, 0, 0)),
	]


func test_rows_take_only_blueprint_driven_types_sorted_by_name() -> void:
	var rows := BlueprintGroups.rows(_modules(), _definitions, {})

	assert_int(rows.size()).is_equal(2)
	assert_str(rows[0].display_name).is_equal("Mine")
	assert_str(rows[1].display_name).is_equal("Smelter")
	assert_int(rows[0].count()).is_equal(7)
	assert_int(rows[1].count()).is_equal(1)


func test_groups_put_none_first_then_the_largest_then_by_name() -> void:
	var mine := BlueprintGroups.rows(_modules(), _definitions, {})[0]
	var order: Array[String] = []
	for group: BlueprintGroups.Group in mine.groups:
		order.append(group.blueprint)

	assert_array(order).is_equal(["", "COPPER_EXTRACTION", "IRON_EXTRACTION", "ALUMINUM_EXTRACTION"])
	assert_bool(mine.groups[0].is_none()).is_true()
	assert_int(mine.groups[0].count()).is_equal(2)
	assert_int(mine.without_blueprint()).is_equal(2)
	assert_int(mine.group("IRON_EXTRACTION").count()).is_equal(2)
	assert_object(mine.group("URANIUM_EXTRACTION")).is_null()


func test_groups_count_modules_under_construction_and_at_the_wrong_spot() -> void:
	var mine := BlueprintGroups.rows(_modules(), _definitions, {2: "LOCATION", 3: "NO_BLUEPRINT", 4: "LOCATION"})[0]

	var iron := mine.group("IRON_EXTRACTION")
	assert_int(iron.building).is_equal(1)
	# A module under construction counts as building, not as standing at the wrong spot.
	assert_int(iron.location).is_equal(0)
	assert_int(mine.group("COPPER_EXTRACTION").location).is_equal(1)
	assert_int(mine.group("").location).is_equal(0)


func test_any_without_tells_whether_some_module_lacks_a_blueprint() -> void:
	var rows := BlueprintGroups.rows(_modules(), _definitions, {})
	var set_only: Array[StructureLayout.Module] = [_module(1, "MINE", "IRON_EXTRACTION", Vector3i.ZERO)]
	var none: Array[StructureLayout.Module] = []

	assert_bool(BlueprintGroups.any_without(rows)).is_true()
	assert_bool(BlueprintGroups.any_without(BlueprintGroups.rows(set_only, _definitions, {}))).is_false()
	assert_bool(BlueprintGroups.any_without(BlueprintGroups.rows(none, _definitions, {}))).is_false()


func test_ops_set_the_blueprint_on_every_module_at_its_absolute_origin() -> void:
	var layout := StructureLayout.new()
	layout.offset = Vector3i(-60, -68, 0)
	var none := BlueprintGroups.rows(_modules(), _definitions, {})[0].group("")

	var ops := BlueprintGroups.ops(none, "IRON_EXTRACTION", layout)

	assert_int(ops.size()).is_equal(2)
	assert_dict(ops[0]).is_equal({"op": "setBlueprint", "x": -58, "y": -68, "z": 0, "blueprint": "IRON_EXTRACTION"})
	assert_dict(ops[1]).is_equal({"op": "setBlueprint", "x": -54, "y": -68, "z": 0, "blueprint": "IRON_EXTRACTION"})
	assert_int(typeof(ops[0].get("x"))).is_equal(TYPE_INT)


func test_ops_without_a_blueprint_clear_it_and_skip_modules_already_there() -> void:
	var layout := StructureLayout.new()
	var iron := BlueprintGroups.rows(_modules(), _definitions, {})[0].group("IRON_EXTRACTION")

	var cleared := BlueprintGroups.ops(iron, "", layout)
	var unchanged := BlueprintGroups.ops(iron, "IRON_EXTRACTION", layout)

	assert_int(cleared.size()).is_equal(2)
	assert_dict(cleared[0]).is_equal({"op": "setBlueprint", "x": 0, "y": 0, "z": 0})
	assert_bool(unchanged.is_empty()).is_true()


func test_outcome_counts_applied_and_refused_operations_by_code() -> void:
	var outcome := BlueprintGroups.outcome([
		{"index": 0.0, "ok": true, "kind": "blueprintSet", "moduleId": 3.0},
		{"index": 1.0, "ok": false, "error": "BLUEPRINT_LOCKED"},
		{"index": 2.0, "ok": true, "kind": "blueprintSet"},
		{"index": 3.0, "ok": false, "error": "MODULE_NOT_FOUND"},
		{"index": 4.0, "ok": false, "error": "BLUEPRINT_LOCKED"},
	])

	assert_int(outcome.applied).is_equal(2)
	assert_int(outcome.refused).is_equal(3)
	assert_array(Array(outcome.codes())).is_equal(["BLUEPRINT_LOCKED", "MODULE_NOT_FOUND"])


func test_outcome_of_no_results_is_empty() -> void:
	var outcome := BlueprintGroups.outcome(null)

	assert_int(outcome.applied).is_equal(0)
	assert_int(outcome.refused).is_equal(0)
	assert_bool(outcome.codes().is_empty()).is_true()


func _estimate(richness: int, rate: int) -> ExtractionYield.Estimate:
	var estimate := ExtractionYield.Estimate.new()
	estimate.blueprint = "IRON_EXTRACTION"
	estimate.resource = "IRON"
	estimate.richness = richness
	estimate.rate = rate
	return estimate


func test_yield_span_ranges_over_the_spots_where_it_works() -> void:
	var estimates: Array[ExtractionYield.Estimate] = [_estimate(40, 40000000), _estimate(2, 0), _estimate(20, 20000000)]
	var span := BlueprintGroups.yield_span(estimates)

	assert_str(span.resource).is_equal("IRON")
	assert_int(span.spots).is_equal(3)
	assert_int(span.working).is_equal(2)
	assert_int(span.low_richness).is_equal(20)
	assert_int(span.high_richness).is_equal(40)
	assert_int(span.low_rate).is_equal(20000000)
	assert_int(span.high_rate).is_equal(40000000)


func test_yield_span_where_it_works_nowhere_is_zero() -> void:
	var nowhere: Array[ExtractionYield.Estimate] = [_estimate(2, 0), _estimate(0, 0)]
	var span := BlueprintGroups.yield_span(nowhere)
	var empty: Array[ExtractionYield.Estimate] = []

	assert_int(span.working).is_equal(0)
	assert_int(span.high_rate).is_equal(0)
	assert_object(BlueprintGroups.yield_span(empty)).is_null()


func test_groups_count_modules_without_their_enterprise_recipe() -> void:
	# draft.39: production with a member blueprint stands still after leaving the enterprise.
	var mine := BlueprintGroups.rows(_modules(), _definitions, {1: "NO_ENTERPRISE", 2: "LOCATION"})[0]

	assert_int(mine.group("IRON_EXTRACTION").no_enterprise).is_equal(1)
	assert_int(mine.group("IRON_EXTRACTION").location).is_equal(0)
	assert_int(mine.group("COPPER_EXTRACTION").no_enterprise).is_equal(0)
