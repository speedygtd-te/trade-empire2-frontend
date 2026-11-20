extends GdUnitTestSuite


func test_units_are_grouped_by_thousands() -> void:
	assert_str(AmountFormat.units(0)).is_equal("0")
	assert_str(AmountFormat.units(999)).is_equal("999")
	assert_str(AmountFormat.units(1000)).is_equal("1 000")
	assert_str(AmountFormat.units(1234567)).is_equal("1 234 567")
	assert_str(AmountFormat.units(-4500)).is_equal("-4 500")


func test_rate_per_hour_with_sign() -> void:
	assert_str(AmountFormat.rate(74000000, 1000000)).is_equal("+74/h")
	assert_str(AmountFormat.rate(-10000000, 1000000)).is_equal("−10/h")
	assert_str(AmountFormat.rate(500000, 1000000)).is_equal("+0.5/h")
	assert_str(AmountFormat.rate(12345000000, 1000000)).is_equal("+12 345/h")


func test_no_rate_means_no_text() -> void:
	assert_str(AmountFormat.rate(0, 1000000)).is_empty()


func test_amounts_show_a_decimal_below_ten() -> void:
	assert_str(AmountFormat.amount(1868853, 1000000)).is_equal("1.9")
	assert_str(AmountFormat.amount(131147, 1000000)).is_equal("0.1")
	assert_str(AmountFormat.amount(2000000, 1000000)).is_equal("2")
	assert_str(AmountFormat.amount(20000, 1000000)).is_equal("<0.1")
	assert_str(AmountFormat.amount(0, 1000000)).is_equal("0")
	assert_str(AmountFormat.amount(57000000, 1000000)).is_equal("57")
	assert_str(AmountFormat.amount(12345678901, 1000000)).is_equal(AmountFormat.units(12345))
	assert_str(AmountFormat.amount(-2500000, 1000000)).is_equal("-2.5")
