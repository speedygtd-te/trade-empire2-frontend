extends GdUnitTestSuite


func test_press_and_release_in_place_is_a_tap() -> void:
	var tap := MapTap.new()
	tap.press(0, Vector2(100, 100))

	assert_bool(tap.release(0, Vector2(100, 100))).is_true()
	assert_int(tap.count()).is_equal(0)


func test_a_release_without_any_drag_before_it_is_a_tap() -> void:
	var tap := MapTap.new()
	tap.press(0, Vector2(100, 100))

	# No move at all: the release alone decides, within the slop.
	assert_bool(tap.release(0, Vector2(110, 105))).is_true()


func test_a_release_far_from_the_press_is_no_tap_even_without_drags() -> void:
	var tap := MapTap.new()
	tap.press(0, Vector2(100, 100))

	assert_bool(tap.release(0, Vector2(100 + MapTap.SLOP, 100))).is_false()


func test_a_drag_away_and_back_is_no_tap() -> void:
	var tap := MapTap.new()
	tap.press(0, Vector2(100, 100))
	tap.move(0, Vector2(160, 100))
	tap.move(0, Vector2(101, 100))

	assert_bool(tap.release(0, Vector2(100, 100))).is_false()


func test_small_jitter_stays_a_tap() -> void:
	var tap := MapTap.new()
	tap.press(0, Vector2(100, 100))
	tap.move(0, Vector2(104, 98))
	tap.move(0, Vector2(97, 103))

	assert_bool(tap.release(0, Vector2(102, 101))).is_true()


func test_a_pinch_is_no_tap_until_all_fingers_are_up() -> void:
	var tap := MapTap.new()
	tap.press(0, Vector2(100, 100))
	tap.press(1, Vector2(300, 300))

	assert_int(tap.count()).is_equal(2)
	assert_vector(tap.other_than(1)).is_equal(Vector2(100, 100))
	assert_bool(tap.release(1, Vector2(300, 300))).is_false()
	assert_bool(tap.release(0, Vector2(100, 100))).is_false()
	# The next gesture starts afresh.
	tap.press(0, Vector2(50, 50))
	assert_bool(tap.release(0, Vector2(50, 50))).is_true()


func test_a_cancelled_touch_is_no_tap() -> void:
	var tap := MapTap.new()
	tap.press(0, Vector2(100, 100))
	tap.cancel(0)

	assert_int(tap.count()).is_equal(0)
	assert_bool(tap.release(0, Vector2(100, 100))).is_false()


func test_a_lost_release_does_not_swallow_later_taps() -> void:
	var tap := MapTap.new()
	tap.press(0, Vector2(100, 100))
	# The release of that touch never came; the same finger index goes down again.
	tap.press(0, Vector2(400, 400))

	assert_int(tap.count()).is_equal(1)
	assert_bool(tap.release(0, Vector2(400, 400))).is_true()


func test_a_release_of_an_unknown_pointer_is_no_tap() -> void:
	var tap := MapTap.new()

	assert_bool(tap.release(3, Vector2(10, 10))).is_false()


func test_the_mouse_taps_and_tracks_like_a_finger() -> void:
	var tap := MapTap.new()
	tap.press(MapTap.MOUSE, Vector2(10, 10))

	assert_bool(tap.is_down(MapTap.MOUSE)).is_true()
	tap.move(MapTap.MOUSE, Vector2(12, 10))
	assert_vector(tap.position_of(MapTap.MOUSE)).is_equal(Vector2(12, 10))
	assert_bool(tap.release(MapTap.MOUSE, Vector2(12, 10))).is_true()
	assert_vector(tap.position_of(MapTap.MOUSE)).is_equal(Vector2.ZERO)


func test_meant_is_empty_when_nothing_is_within_reach() -> void:
	assert_array(Array(MapTap.meant(PackedStringArray(["a", "b"]), PackedFloat64Array([50.0, 60.0]), 44.0))).is_empty()


func test_meant_takes_the_only_body_within_reach() -> void:
	var found := MapTap.meant(PackedStringArray(["a", "b"]), PackedFloat64Array([30.0, 60.0]), 44.0)

	assert_array(Array(found)).contains_exactly(["a"])


func test_meant_takes_the_clearly_nearest_body() -> void:
	# The finger on a's disc, b's edge a gap of half the reach further.
	var found := MapTap.meant(PackedStringArray(["b", "a"]), PackedFloat64Array([18.0, -4.0]), 44.0)

	assert_array(Array(found)).contains_exactly(["a"])


func test_meant_offers_bodies_close_together_nearest_first() -> void:
	var found := MapTap.meant(PackedStringArray(["c", "a", "b", "far"]), PackedFloat64Array([12.0, 2.0, 8.0, 80.0]), 44.0)

	assert_array(Array(found)).contains_exactly(["a", "b", "c"])


func test_meant_offers_at_most_the_limit() -> void:
	var ids := PackedStringArray(["a", "b", "c", "d"])
	var found := MapTap.meant(ids, PackedFloat64Array([1.0, 2.0, 3.0, 4.0]), 44.0, 2)

	assert_array(Array(found)).contains_exactly(["a", "b"])
