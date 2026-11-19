extends GdUnitTestSuite
## EnterpriseTaxes: the table, the PUT body and the inventory counted up.


func _taxes() -> EnterpriseTaxes:
	return EnterpriseTaxes.from_wire({
		"enterpriseId": "7", "maxPercent": 50.0, "increaseDelayMs": 86400000.0,
		"rates": [
			{"resource": "IRON", "percent": 10.0},
			{"resource": "WATER", "percent": 0.0, "pending": {"percent": 15.0, "effectiveAt": 90000000.0}},
			{"resource": "COPPER", "percent": 5.0, "pending": {"percent": 20.0, "effectiveAt": 91000000.0}},
		],
	})


func test_reads_the_table() -> void:
	var taxes := _taxes()

	assert_str(taxes.enterprise_id).is_equal("7")
	assert_int(taxes.max_percent).is_equal(50)
	assert_int(taxes.increase_delay_ms).is_equal(86400000)
	assert_int(taxes.percent("IRON")).is_equal(10)
	assert_int(taxes.percent("WATER")).is_equal(0)
	assert_int(taxes.percent("GOLD")).is_equal(0)
	assert_object(taxes.pending("IRON")).is_null()
	assert_int(taxes.pending("WATER").pending_percent).is_equal(15)
	assert_int(taxes.pending("WATER").effective_at).is_equal(90000000)
	assert_bool((taxes.rates["COPPER"] as EnterpriseTaxes.Rate).has_pending()).is_true()


func test_targets_are_the_announced_rates() -> void:
	assert_dict(_taxes().targets()).is_equal({"IRON": 10, "WATER": 15, "COPPER": 20})


func test_increase_or_not() -> void:
	var taxes := _taxes()

	assert_bool(taxes.is_increase("IRON", 11)).is_true()
	assert_bool(taxes.is_increase("IRON", 10)).is_false()
	assert_bool(taxes.is_increase("IRON", 3)).is_false()
	assert_bool(taxes.is_increase("GOLD", 1)).is_true()


func test_body_is_the_whole_table_sorted_without_zeros_and_clamped() -> void:
	var body := _taxes().body({"WATER": 0, "IRON": 12, "COPPER": 99, "GOLD": -3})

	assert_str(JSON.stringify(body)).is_equal(
		'{"rates":[{"percent":50,"resource":"COPPER"},{"percent":12,"resource":"IRON"}]}')


func test_differs_from_the_targets() -> void:
	var taxes := _taxes()

	assert_bool(taxes.differs({"IRON": 10, "WATER": 15, "COPPER": 20})).is_false()
	assert_bool(taxes.differs({"IRON": 10, "WATER": 15, "COPPER": 20, "GOLD": 0})).is_false()
	assert_bool(taxes.differs({"IRON": 10, "WATER": 15})).is_true()
	assert_bool(taxes.differs({"IRON": 9, "WATER": 15, "COPPER": 20})).is_true()


func test_inventory_counts_up_with_its_rate() -> void:
	var stock := EnterpriseTaxes.Stock.from_wire({"enterpriseId": "7", "at": 1000.0, "items": [
		{"resource": "IRON", "value": 5000000.0, "ratePerHour": 3600000.0},
		{"resource": "WATER", "value": 0.0, "ratePerHour": 0.0},
	]})

	assert_int(stock.at).is_equal(1000)
	assert_int(stock.value_at("IRON", 1000)).is_equal(5000000)
	assert_int(stock.value_at("IRON", 1000 + 1800000)).is_equal(6800000)
	# Before `at` nothing is taken back.
	assert_int(stock.value_at("IRON", 0)).is_equal(5000000)
	assert_int(stock.value_at("GOLD", 5000)).is_equal(0)
	assert_int(stock.rate_of("IRON")).is_equal(3600000)
	assert_int(stock.rate_of("GOLD")).is_equal(0)
	assert_bool(stock.holds_anything(1000)).is_true()
	var empty := EnterpriseTaxes.Stock.from_wire({"at": 5.0, "items": [{"resource": "WATER", "value": 0.0, "ratePerHour": 0.0}]})
	assert_bool(empty.holds_anything(10)).is_false()
