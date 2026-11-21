extends GdUnitTestSuite


func test_first_press_is_taken() -> void:
	assert_bool(BackGate.new().accept(0)).is_true()


func test_echo_of_the_same_press_is_ignored() -> void:
	var gate := BackGate.new()
	assert_bool(gate.accept(1000)).is_true()
	assert_bool(gate.accept(1000)).is_false()
	assert_bool(gate.accept(1000 + BackGate.REPEAT_MS - 1)).is_false()


func test_a_later_press_is_taken() -> void:
	var gate := BackGate.new()
	gate.accept(1000)
	assert_bool(gate.accept(1000 + BackGate.REPEAT_MS)).is_true()
	assert_bool(gate.accept(1000 + BackGate.REPEAT_MS * 3)).is_true()


func test_an_ignored_echo_does_not_push_the_window_out() -> void:
	var gate := BackGate.new()
	gate.accept(1000)
	gate.accept(1100)
	assert_bool(gate.accept(1000 + BackGate.REPEAT_MS)).is_true()
