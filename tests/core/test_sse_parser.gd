extends GdUnitTestSuite


func _feed(parser: SseParser, lines: Array[String]) -> Array[SseEvent]:
	var events: Array[SseEvent] = []
	for line: String in lines:
		var event := parser.push_line(line)
		if event != null:
			events.append(event)
	return events


func test_event_with_type_data_and_id() -> void:
	var parser := SseParser.new()

	var events := _feed(
		parser,
		["event: structure.layoutChanged", "id: 42", 'data: {"structureId":7,"rev":42}', ""]
	)

	assert_int(events.size()).is_equal(1)
	assert_str(events[0].type).is_equal("structure.layoutChanged")
	assert_str(events[0].id).is_equal("42")
	assert_str(events[0].data).is_equal('{"structureId":7,"rev":42}')


func test_nothing_is_returned_before_the_blank_line() -> void:
	var parser := SseParser.new()

	assert_object(parser.push_line("event: ready")).is_null()
	assert_object(parser.push_line('data: {"rev":3}')).is_null()
	assert_object(parser.push_line("")).is_not_null()


func test_heartbeat_comment_is_ignored() -> void:
	var parser := SseParser.new()

	var events := _feed(parser, [": hb", "", ": hb", ""])

	assert_int(events.size()).is_equal(0)


func test_comment_inside_an_event_does_not_break_it() -> void:
	var parser := SseParser.new()

	var events := _feed(parser, ["event: ready", ": hb", 'data: {"rev":9}', ""])

	assert_int(events.size()).is_equal(1)
	assert_str(events[0].type).is_equal("ready")
	assert_str(events[0].data).is_equal('{"rev":9}')


func test_several_events_in_a_row_do_not_leak_fields() -> void:
	var parser := SseParser.new()

	var events := _feed(
		parser,
		["event: a", "id: 1", "data: one", "", "data: two", "", "event: c", "data: three", ""]
	)

	assert_int(events.size()).is_equal(3)
	assert_str(events[0].type).is_equal("a")
	assert_str(events[0].id).is_equal("1")
	assert_str(events[1].type).is_equal("message")
	assert_str(events[1].id).is_equal("")
	assert_str(events[1].data).is_equal("two")
	assert_str(events[2].type).is_equal("c")


func test_multiple_data_lines_are_joined_with_newline() -> void:
	var parser := SseParser.new()

	var events := _feed(parser, ["data: first", "data: second", ""])

	assert_str(events[0].data).is_equal("first\nsecond")


func test_event_without_data_is_dropped() -> void:
	var parser := SseParser.new()

	var events := _feed(parser, ["event: orphan", "", "data: kept", ""])

	assert_int(events.size()).is_equal(1)
	assert_str(events[0].type).is_equal("message")
	assert_str(events[0].data).is_equal("kept")


func test_value_without_space_after_the_colon() -> void:
	var parser := SseParser.new()

	var events := _feed(parser, ["event:ready", "data:{}", ""])

	assert_str(events[0].type).is_equal("ready")
	assert_str(events[0].data).is_equal("{}")


func test_only_one_leading_space_is_removed() -> void:
	var parser := SseParser.new()

	var events := _feed(parser, ["data:  two spaces", ""])

	assert_str(events[0].data).is_equal(" two spaces")


func test_unknown_fields_are_ignored() -> void:
	var parser := SseParser.new()

	var events := _feed(parser, ["retry: 5000", "data: x", ""])

	assert_int(events.size()).is_equal(1)
	assert_str(events[0].data).is_equal("x")


func test_reset_drops_a_half_received_event() -> void:
	var parser := SseParser.new()
	parser.push_line("event: structure.ratesChanged")
	parser.push_line("data: half")

	parser.reset()
	var events := _feed(parser, ["data: fresh", ""])

	assert_int(events.size()).is_equal(1)
	assert_str(events[0].type).is_equal("message")
	assert_str(events[0].data).is_equal("fresh")
