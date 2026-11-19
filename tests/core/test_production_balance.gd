extends GdUnitTestSuite
## Numbers as JSON delivers them: floats.


func _totals() -> Array[ProductionBalance.Row]:
	return ProductionBalance.totals_from_wire([
		{"resource": "IRON", "producedPerHour": 78000000.0, "consumedPerHour": 0.0, "taxedPerHour": 0.0, "netPerHour": 78000000.0},
		{"resource": "COPPER", "producedPerHour": 0.0, "consumedPerHour": 3000000.0, "taxedPerHour": 0.0, "netPerHour": -3000000.0},
		{"resource": "WATER", "producedPerHour": 20000000.0, "consumedPerHour": 20000000.0, "taxedPerHour": 0.0, "netPerHour": 0.0},
		{"resource": "OXYGEN", "producedPerHour": 25500000.0, "consumedPerHour": 40000000.0, "taxedPerHour": 2000000.0, "netPerHour": -14500000.0},
		{"resource": "ALUMINUM", "producedPerHour": 5000000.0, "consumedPerHour": 0.0, "taxedPerHour": 1000000.0, "netPerHour": 5000000.0},
		{"resource": "", "producedPerHour": 1.0, "consumedPerHour": 0.0, "taxedPerHour": 0.0, "netPerHour": 1.0},
	])


func test_totals_are_read_as_ints_and_rows_without_a_key_skipped() -> void:
	var rows := _totals()

	assert_int(rows.size()).is_equal(5)
	assert_str(rows[3].resource).is_equal("OXYGEN")
	assert_int(rows[3].produced).is_equal(25500000)
	assert_int(rows[3].consumed).is_equal(40000000)
	assert_int(rows[3].taxed).is_equal(2000000)
	assert_int(rows[3].net).is_equal(-14500000)
	assert_int(typeof(rows[3].net)).is_equal(TYPE_INT)
	assert_bool(ProductionBalance.totals_from_wire(null).is_empty()).is_true()


func test_rows_tell_short_surplus_and_balanced_apart() -> void:
	var rows := _totals()

	assert_int(rows[0].state()).is_equal(ProductionBalance.State.SURPLUS)
	assert_int(rows[1].state()).is_equal(ProductionBalance.State.SHORT)
	assert_int(rows[2].state()).is_equal(ProductionBalance.State.BALANCED)


func test_sorted_puts_the_most_negative_first_then_surplus_then_balanced_by_name() -> void:
	var order: Array[String] = []
	for row: ProductionBalance.Row in ProductionBalance.sorted(_totals(), {"IRON": "Iron", "ALUMINUM": "Aluminum"}):
		order.append(row.resource)

	assert_array(order).is_equal(["OXYGEN", "COPPER", "ALUMINUM", "IRON", "WATER"])


func test_short_keeps_only_negative_rows() -> void:
	var order: Array[String] = []
	for row: ProductionBalance.Row in ProductionBalance.short(_totals()):
		order.append(row.resource)

	assert_array(order).is_equal(["COPPER", "OXYGEN"])


func test_population_has_five_tiers() -> void:
	assert_array(ProductionBalance.population_from_wire([12.0, 3.0, 0.0, 0.0, 1.0])).is_equal([12, 3, 0, 0, 1])
	assert_array(ProductionBalance.population_from_wire([4.0])).is_equal([4, 0, 0, 0, 0])
	assert_array(ProductionBalance.population_from_wire(null)).is_equal([0, 0, 0, 0, 0])


func test_ms_to_empty() -> void:
	# 10 units at 3 units per hour: 3 h 20 min.
	assert_int(ProductionBalance.ms_to_empty(10000000, -3000000)).is_equal(12000000)
	assert_int(ProductionBalance.ms_to_empty(0, -3000000)).is_equal(0)
	assert_int(ProductionBalance.ms_to_empty(10000000, 0)).is_equal(-1)
	assert_int(ProductionBalance.ms_to_empty(10000000, 5)).is_equal(-1)
	# A huge stock does not overflow: 10^9 units at 1 000 units per hour = 10^6 h.
	assert_int(ProductionBalance.ms_to_empty(1000000000000000, -1000000000)).is_equal(3600000000000)


func _flows() -> Array[ProductionBalance.Flow]:
	return ProductionBalance.flows_from_wire([
		{"moduleType": "LIFE_SUPPORT", "modules": 1.0, "inputs": [
			{"resource": "OXYGEN", "nominal": 10000000.0, "effective": 10000000.0},
			{"resource": "WATER", "nominal": 20000000.0, "effective": 20000000.0}], "outputs": []},
		{"moduleType": "COLLECTOR", "blueprint": "OXYGEN_COLLECTION", "modules": 2.0, "inputs": [],
			"outputs": [{"resource": "OXYGEN", "nominal": 30000000.0, "effective": 25500000.0}]},
		{"moduleType": "COLLECTOR", "blueprint": "ORBITAL_OXYGEN", "modules": 1.0, "inputs": [],
			"outputs": [{"resource": "OXYGEN", "nominal": 1000000.0, "effective": 0.0}]},
		{"moduleType": "SMELTER", "blueprint": "X", "modules": 3.0,
			"inputs": [{"resource": "OXYGEN", "nominal": 30000000.0, "effective": 25000000.0}], "outputs": []},
	])


func test_flows_keep_effective_rates_and_drop_zero_ones() -> void:
	var flows := _flows()

	assert_int(flows.size()).is_equal(4)
	assert_str(flows[0].module_type).is_equal("LIFE_SUPPORT")
	assert_bool(flows[0].input).is_true()
	assert_int(flows[2].rate).is_equal(25500000)
	assert_bool(flows[2].input).is_false()
	assert_int(flows[2].modules).is_equal(2)


func test_uses_sum_per_module_type_largest_first() -> void:
	var made := ProductionBalance.uses(_flows(), "OXYGEN", false)
	var used := ProductionBalance.uses(_flows(), "OXYGEN", true)

	assert_int(made.size()).is_equal(1)
	assert_str(made[0].module_type).is_equal("COLLECTOR")
	assert_int(made[0].rate).is_equal(25500000)
	assert_int(used.size()).is_equal(2)
	assert_str(used[0].module_type).is_equal("SMELTER")
	assert_int(used[0].modules).is_equal(3)
	assert_str(used[1].module_type).is_equal("LIFE_SUPPORT")
	assert_bool(ProductionBalance.uses(_flows(), "IRON", false).is_empty()).is_true()


func test_other_use_is_what_the_buckets_do_not_explain() -> void:
	var oxygen := ProductionBalance.Row.new()
	oxygen.resource = "OXYGEN"
	oxygen.consumed = 40000000
	var water := ProductionBalance.Row.new()
	water.resource = "WATER"
	water.consumed = 20000000

	assert_int(ProductionBalance.other_use(oxygen, _flows())).is_equal(5000000)
	assert_int(ProductionBalance.other_use(water, _flows())).is_equal(0)
