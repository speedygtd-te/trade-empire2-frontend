extends GdUnitTestSuite


func test_returns_complete_lines_of_one_chunk() -> void:
	var buffer := LineBuffer.new()

	var lines := buffer.push("first\nsecond\n".to_utf8_buffer())

	assert_array(Array(lines)).contains_exactly(["first", "second"])
	assert_bool(buffer.has_pending()).is_false()


func test_keeps_an_unterminated_tail_until_its_terminator_arrives() -> void:
	var buffer := LineBuffer.new()

	var first := buffer.push('{"line":"hea'.to_utf8_buffer())
	var second := buffer.push('der"}\n{"li'.to_utf8_buffer())

	assert_array(Array(first)).is_empty()
	assert_array(Array(second)).contains_exactly(['{"line":"header"}'])
	assert_bool(buffer.has_pending()).is_true()
	assert_str(buffer.pending_text()).is_equal('{"li')


func test_strips_crlf_terminators() -> void:
	var buffer := LineBuffer.new()

	var lines := buffer.push("event: ready\r\n\r\n".to_utf8_buffer())

	assert_array(Array(lines)).contains_exactly(["event: ready", ""])


func test_crlf_split_across_chunks() -> void:
	var buffer := LineBuffer.new()

	var first := buffer.push("abc\r".to_utf8_buffer())
	var second := buffer.push("\ndef\n".to_utf8_buffer())

	assert_array(Array(first)).is_empty()
	assert_array(Array(second)).contains_exactly(["abc", "def"])


func test_multibyte_character_split_across_chunks() -> void:
	var buffer := LineBuffer.new()
	var bytes := "Größe ✓\n".to_utf8_buffer()
	# Cut inside the two-byte "ö" (bytes 2..3 of the text).
	var cut := 3

	var first := buffer.push(bytes.slice(0, cut))
	var second := buffer.push(bytes.slice(cut))

	assert_array(Array(first)).is_empty()
	assert_array(Array(second)).contains_exactly(["Größe ✓"])


func test_empty_lines_are_returned() -> void:
	var buffer := LineBuffer.new()

	var lines := buffer.push("\n\nx\n".to_utf8_buffer())

	assert_array(Array(lines)).contains_exactly(["", "", "x"])


func test_clear_drops_the_tail() -> void:
	var buffer := LineBuffer.new()
	buffer.push("partial".to_utf8_buffer())

	buffer.clear()

	assert_bool(buffer.has_pending()).is_false()
	assert_array(Array(buffer.push("next\n".to_utf8_buffer()))).contains_exactly(["next"])
