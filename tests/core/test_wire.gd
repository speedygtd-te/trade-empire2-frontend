extends GdUnitTestSuite


func test_json_numbers_arrive_as_float_and_convert_to_int() -> void:
	var parsed := Wire.parse_object('{"rev": 42, "gameTime": 3600000}')

	assert_int(typeof(parsed.get("rev"))).is_equal(TYPE_FLOAT)
	assert_int(Wire.as_int(parsed.get("rev"))).is_equal(42)
	assert_int(Wire.as_int(parsed.get("gameTime"))).is_equal(3600000)


func test_as_int_is_exact_up_to_2_pow_53() -> void:
	var parsed := Wire.parse_object('{"value": 9007199254740992}')

	assert_int(Wire.as_int(parsed.get("value"))).is_equal(9007199254740992)


func test_as_int_fallback_for_missing_and_wrong_type() -> void:
	var parsed := Wire.parse_object('{"text": "7"}')

	assert_int(Wire.as_int(parsed.get("missing"), -1)).is_equal(-1)
	assert_int(Wire.as_int(parsed.get("text"), -1)).is_equal(-1)


func test_as_int_keeps_negative_values() -> void:
	var parsed := Wire.parse_object('{"z": -3}')

	assert_int(Wire.as_int(parsed.get("z"))).is_equal(-3)


func test_as_string_and_as_dict_fallbacks() -> void:
	var parsed := Wire.parse_object('{"id": "p-17", "n": 5, "details": {"field": "email"}}')

	assert_str(Wire.as_string(parsed.get("id"))).is_equal("p-17")
	assert_str(Wire.as_string(parsed.get("n"), "none")).is_equal("none")
	assert_str(Wire.as_string(Wire.as_dict(parsed.get("details")).get("field"))).is_equal("email")
	assert_bool(Wire.as_dict(parsed.get("n")).is_empty()).is_true()


func test_parse_object_returns_empty_for_non_objects() -> void:
	assert_bool(Wire.parse_object("").is_empty()).is_true()
	assert_bool(Wire.parse_object("not json").is_empty()).is_true()
	assert_bool(Wire.parse_object("[1, 2]").is_empty()).is_true()


func test_stringify_writes_int_without_fraction() -> void:
	var body := JSON.stringify({"x": 5, "z": -2})

	assert_str(body).is_equal('{"x":5,"z":-2}')
