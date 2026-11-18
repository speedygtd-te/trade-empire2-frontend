extends GdUnitTestSuite

const DATA := {
	"structureId": 9.0,
	"capacity": 10320000000.0,
	"items": [
		{"item": "HULL_STARTER", "value": 15000000.0, "ratePerHour": 0.0, "at": 1000.0},
		{"item": "IRON", "value": 200000000.0, "ratePerHour": 74000000.0, "at": 1000.0},
		{"item": "WATER", "value": 5000000.0, "ratePerHour": -10000000.0, "at": 1000.0, "nextChange": 9.0},
	],
}


func test_whole_units_of_a_still_stock() -> void:
	var inventory := Inventory.from_wire(DATA)

	assert_int(inventory.units("HULL_STARTER", 999999)).is_equal(15)
	assert_int(inventory.units("NOTHING", 1000)).is_equal(0)


func test_a_growing_stock_grows_with_game_time() -> void:
	var inventory := Inventory.from_wire(DATA)

	assert_int(inventory.units("IRON", 1000)).is_equal(200)
	assert_int(inventory.units("IRON", 1000 + 3600000)).is_equal(274)


func test_a_shrinking_stock_stops_at_zero() -> void:
	var inventory := Inventory.from_wire(DATA)

	assert_int(inventory.units("WATER", 1000 + 1800000)).is_equal(0)


func test_rates_changed_replaces_only_named_items() -> void:
	var inventory := Inventory.from_wire(DATA)

	inventory.apply_rates([{"resource": "HULL_STARTER", "value": 14000000.0, "ratePerHour": 0.0, "at": 2000.0}])

	assert_int(inventory.units("HULL_STARTER", 3000)).is_equal(14)
	assert_int(inventory.units("IRON", 1000)).is_equal(200)


func test_flow_of_an_item() -> void:
	var inventory := Inventory.from_wire(DATA)

	assert_int(inventory.flow("IRON").rate_per_hour).is_equal(74000000)
	assert_object(inventory.flow("NOTHING")).is_null()


func test_item_keys_are_sorted() -> void:
	assert_array(Array(Inventory.from_wire(DATA).item_keys())).contains_exactly(["HULL_STARTER", "IRON", "WATER"])


func test_flow_value_does_not_overflow_over_long_times() -> void:
	var flow := FlowValue.new()
	flow.value = 0
	flow.rate_per_hour = 2000000000000
	flow.at = 0
	var ten_years := 10 * 365 * 24 * FlowValue.MS_PER_HOUR

	assert_int(flow.amount_at(ten_years)).is_equal(2000000000000 * 10 * 365 * 24)


func test_flow_value_before_its_time_is_its_value() -> void:
	var flow := FlowValue.from_wire({"value": 7.0, "ratePerHour": 3600000.0, "at": 5000.0})

	assert_int(flow.amount_at(1000)).is_equal(7)
	assert_int(flow.amount_at(6000)).is_equal(1007)
