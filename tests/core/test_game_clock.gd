extends GdUnitTestSuite

var _ticks := 0


func _fake_ticks() -> int:
	return _ticks


func _new_clock() -> GameClock:
	_ticks = 1000
	return GameClock.new(_fake_ticks)


func test_unsynced_clock_reads_zero() -> void:
	var clock := _new_clock()

	assert_bool(clock.is_synced()).is_false()
	assert_int(clock.now_ms()).is_equal(0)


func test_running_clock_advances_one_to_one() -> void:
	var clock := _new_clock()
	clock.set_running(true)
	clock.sync(500000)

	_ticks += 2500

	assert_int(clock.now_ms()).is_equal(502500)


func test_frozen_clock_stands_still() -> void:
	var clock := _new_clock()
	clock.sync(500000)

	_ticks += 60000

	assert_bool(clock.is_running()).is_false()
	assert_int(clock.now_ms()).is_equal(500000)


func test_freezing_keeps_the_current_estimate() -> void:
	var clock := _new_clock()
	clock.set_running(true)
	clock.sync(500000)
	_ticks += 3000

	clock.set_running(false)
	_ticks += 10000

	assert_int(clock.now_ms()).is_equal(503000)


func test_restarting_continues_from_the_frozen_value() -> void:
	var clock := _new_clock()
	clock.set_running(true)
	clock.sync(500000)
	_ticks += 3000
	clock.set_running(false)
	_ticks += 10000

	clock.set_running(true)
	_ticks += 1000

	assert_int(clock.now_ms()).is_equal(504000)


func test_sync_moves_forward() -> void:
	var clock := _new_clock()
	clock.set_running(true)
	clock.sync(500000)
	_ticks += 1000

	clock.sync(501400)

	assert_int(clock.now_ms()).is_equal(501400)


func test_delayed_response_does_not_pull_the_clock_back() -> void:
	var clock := _new_clock()
	clock.set_running(true)
	clock.sync(500000)
	_ticks += 2000

	clock.sync(500300)

	assert_int(clock.now_ms()).is_equal(502000)


func test_resync_may_move_backwards() -> void:
	var clock := _new_clock()
	clock.set_running(true)
	clock.sync(500000)
	_ticks += 30000

	clock.resync(505000)

	assert_int(clock.now_ms()).is_equal(505000)


func test_setting_the_same_running_state_twice_changes_nothing() -> void:
	var clock := _new_clock()
	clock.set_running(true)
	clock.sync(500000)
	_ticks += 1000

	clock.set_running(true)
	_ticks += 1000

	assert_int(clock.now_ms()).is_equal(502000)
