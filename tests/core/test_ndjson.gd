extends GdUnitTestSuite


func test_parses_one_object_per_line() -> void:
	var stream := Ndjson.parse('{"line":"header"}\n{"line":"chunk"}\n{"line":"end","rev":5}\n')

	assert_int(stream.objects.size()).is_equal(3)
	assert_str(Wire.as_string(stream.first().get("line"))).is_equal("header")
	assert_int(Wire.as_int(stream.last().get("rev"))).is_equal(5)
	assert_int(stream.broken_lines).is_equal(0)


func test_tolerates_crlf_and_blank_lines() -> void:
	var stream := Ndjson.parse('{"a":1}\r\n\r\n{"b":2}')

	assert_int(stream.objects.size()).is_equal(2)


func test_counts_lines_that_are_no_object() -> void:
	var stream := Ndjson.parse('{"a":1}\n[1,2]\n{"cut off')

	assert_int(stream.objects.size()).is_equal(1)
	assert_int(stream.broken_lines).is_equal(2)


func test_empty_text_has_no_first_or_last() -> void:
	var stream := Ndjson.parse("")

	assert_bool(stream.first().is_empty()).is_true()
	assert_bool(stream.last().is_empty()).is_true()
