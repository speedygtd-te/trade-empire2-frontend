extends GdUnitTestSuite

const HERE := Vector3i(3, 4, 0)
const NEXT := Vector3i(4, 4, 0)


func test_first_tap_only_arms() -> void:
	var arm := RemoveArm.new()
	assert_bool(arm.press("module", HERE, 1000)).is_false()
	assert_bool(arm.is_armed("module", HERE)).is_true()
	assert_bool(arm.is_set()).is_true()


func test_second_tap_on_the_same_field_removes() -> void:
	var arm := RemoveArm.new()
	arm.press("module", HERE, 1000)
	assert_bool(arm.press("module", HERE, 1000 + RemoveArm.GRACE_MS)).is_true()
	assert_bool(arm.is_set()).is_false()


func test_too_quick_second_tap_does_not_remove() -> void:
	var arm := RemoveArm.new()
	arm.press("hull", HERE, 1000)
	assert_bool(arm.press("hull", HERE, 1000 + RemoveArm.GRACE_MS - 1)).is_false()
	# Still armed: a deliberate tap afterwards removes.
	assert_bool(arm.is_armed("hull", HERE)).is_true()
	assert_bool(arm.press("hull", HERE, 1000 + RemoveArm.GRACE_MS + 50)).is_true()


func test_another_field_arms_anew_and_never_removes() -> void:
	var arm := RemoveArm.new()
	arm.press("module", HERE, 1000)
	assert_bool(arm.press("module", NEXT, 5000)).is_false()
	assert_bool(arm.is_armed("module", HERE)).is_false()
	assert_bool(arm.is_armed("module", NEXT)).is_true()


func test_another_kind_arms_anew() -> void:
	var arm := RemoveArm.new()
	arm.press("module", HERE, 1000)
	assert_bool(arm.press("hull", HERE, 5000)).is_false()
	assert_bool(arm.is_armed("hull", HERE)).is_true()


func test_follow_drops_an_arming_for_another_field() -> void:
	var arm := RemoveArm.new()
	arm.press("module", HERE, 1000)
	arm.follow(HERE)
	assert_bool(arm.is_armed("module", HERE)).is_true()
	arm.follow(NEXT)
	assert_bool(arm.is_set()).is_false()
	assert_bool(arm.press("module", HERE, 9000)).is_false()


func test_clear_disarms() -> void:
	var arm := RemoveArm.new()
	arm.press("module", HERE, 1000)
	arm.clear()
	assert_bool(arm.is_armed("module", HERE)).is_false()
	assert_bool(arm.press("module", HERE, 9000)).is_false()


func test_nothing_armed_for_no_field() -> void:
	var arm := RemoveArm.new()
	assert_bool(arm.is_armed("module", null)).is_false()
	assert_bool(arm.is_armed("", HERE)).is_false()
