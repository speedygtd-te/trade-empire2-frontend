extends GdUnitTestSuite
## ListButton: a tap counts, a swipe that scrolled the list does not, and the look follows the
## chosen state only.

var _taps := 0


func _on_tapped() -> void:
	_taps += 1


func test_a_tap_emits_tapped_and_keeps_the_chosen_look() -> void:
	var button: ListButton = auto_free(ListButton.new())
	button.tapped.connect(_on_tapped)
	_taps = 0

	button.button_down.emit()
	button.toggled.emit(true)

	assert_int(_taps).is_equal(1)
	# Not chosen: the click must not leave it looking pressed.
	assert_bool(button.button_pressed).is_false()


func test_a_swipe_that_scrolled_is_not_a_tap() -> void:
	var button: ListButton = auto_free(ListButton.new())
	button.tapped.connect(_on_tapped)
	_taps = 0

	button.button_down.emit()
	# The list moved by more than the slop between press and release.
	button._offset_at_press = Vector2(0.0, -ListButton.TAP_SLOP * 3.0)
	button.toggled.emit(true)

	assert_int(_taps).is_equal(0)


func test_chosen_entries_look_pressed_and_stay_so() -> void:
	var button: ListButton = auto_free(ListButton.new())
	button.set_chosen(true)
	assert_bool(button.button_pressed).is_true()

	button.button_down.emit()
	button.toggled.emit(false)

	assert_bool(button.button_pressed).is_true()
	assert_bool(button.is_chosen()).is_true()
	assert_int(button.mouse_filter).is_equal(Control.MOUSE_FILTER_PASS)
