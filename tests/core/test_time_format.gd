extends GdUnitTestSuite

const SECOND := 1000
const MINUTE := 60 * SECOND
const HOUR := 60 * MINUTE
const DAY := 24 * HOUR


func test_clock_without_days() -> void:
	assert_str(TimeFormat.clock(0)).is_equal("00:00:00")
	assert_str(TimeFormat.clock(59999)).is_equal("00:00:59")
	assert_str(TimeFormat.clock(2 * HOUR + 7 * MINUTE + 45 * SECOND)).is_equal("02:07:45")


func test_clock_with_days() -> void:
	assert_str(TimeFormat.clock(3 * DAY + 2 * HOUR + 7 * MINUTE + 45 * SECOND)).is_equal("3d 02:07:45")


func test_clock_never_shows_negative_time() -> void:
	assert_str(TimeFormat.clock(-5000)).is_equal("00:00:00")


func test_duration_uses_the_two_largest_units() -> void:
	assert_str(TimeFormat.duration(6 * DAY + 23 * HOUR + 59 * MINUTE)).is_equal("6d 23h")
	assert_str(TimeFormat.duration(4 * HOUR + 12 * MINUTE + 30 * SECOND)).is_equal("4h 12m")
	assert_str(TimeFormat.duration(9 * MINUTE + 30 * SECOND)).is_equal("9m 30s")
	assert_str(TimeFormat.duration(45 * SECOND)).is_equal("45s")


func test_duration_of_nothing() -> void:
	assert_str(TimeFormat.duration(0)).is_equal("0s")
	assert_str(TimeFormat.duration(-1)).is_equal("0s")
