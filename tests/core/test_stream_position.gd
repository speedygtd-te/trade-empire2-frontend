extends GdUnitTestSuite


func test_plain_rev_and_event_id_are_valid() -> void:
	assert_bool(StreamPosition.is_valid("314")).is_true()
	assert_bool(StreamPosition.is_valid("314-0")).is_true()
	assert_bool(StreamPosition.is_valid("0")).is_true()
	assert_bool(StreamPosition.is_valid("9007199254740991-12")).is_true()


func test_anything_else_is_invalid() -> void:
	for text: String in ["", "abc", "314-", "-1", "3-1-2", "3 1", "3.5", "3-x", "--"]:
		assert_bool(StreamPosition.is_valid(text)).override_failure_message(
			"'%s' must not be a valid position" % text
		).is_false()


func test_from_rev() -> void:
	assert_str(StreamPosition.from_rev(42)).is_equal("42")
	assert_str(StreamPosition.from_rev(0)).is_equal("0")
	assert_str(StreamPosition.from_rev(-1)).is_equal("")
