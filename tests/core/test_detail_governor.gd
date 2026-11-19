extends GdUnitTestSuite


func _feed(governor: DetailGovernor, frame_ms: float, count: int) -> void:
	for _index: int in count:
		governor.add_frame(frame_ms)


## Runs evaluations EVAL_INTERVAL_MS apart, feeding enough frames before each.
func _evaluate_times(governor: DetailGovernor, frame_ms: float, times: int, start_ms: int = 0) -> int:
	var changes := 0
	for index: int in times:
		_feed(governor, frame_ms, DetailGovernor.SAMPLE_CAPACITY)
		if governor.evaluate(start_ms + index * DetailGovernor.EVAL_INTERVAL_MS):
			changes += 1
	return changes


func test_starts_in_the_middle() -> void:
	assert_int(DetailGovernor.new().tier).is_equal(DetailGovernor.Tier.MEDIUM)


func test_warmup_frames_do_not_count() -> void:
	var governor := DetailGovernor.new()
	_feed(governor, 100.0, DetailGovernor.WARMUP_FRAMES)
	_feed(governor, 16.0, DetailGovernor.MIN_SAMPLES)

	governor.evaluate(0)

	assert_float(governor.metric_ms).is_equal(16.0)


func test_too_few_samples_are_not_evaluated() -> void:
	var governor := DetailGovernor.new()
	_feed(governor, 50.0, DetailGovernor.WARMUP_FRAMES + DetailGovernor.MIN_SAMPLES - 1)

	assert_bool(governor.evaluate(0)).is_false()
	assert_int(governor.tier).is_equal(DetailGovernor.Tier.MEDIUM)


func test_slow_frames_drop_a_tier_at_once() -> void:
	var governor := DetailGovernor.new()
	_feed(governor, 45.0, DetailGovernor.WARMUP_FRAMES)

	assert_int(_evaluate_times(governor, 45.0, 1)).is_equal(1)
	assert_int(governor.tier).is_equal(DetailGovernor.Tier.SLOW)


func test_going_up_needs_several_good_evaluations() -> void:
	var governor := DetailGovernor.new()
	_feed(governor, 16.0, DetailGovernor.WARMUP_FRAMES)

	_evaluate_times(governor, 16.0, DetailGovernor.GOOD_EVALUATIONS_TO_RISE - 1)
	assert_int(governor.tier).is_equal(DetailGovernor.Tier.MEDIUM)

	_evaluate_times(governor, 16.0, 1, 100000)
	assert_int(governor.tier).is_equal(DetailGovernor.Tier.FAST)


func test_frames_in_the_dead_band_change_nothing() -> void:
	var governor := DetailGovernor.new()
	_feed(governor, 24.0, DetailGovernor.WARMUP_FRAMES)

	assert_int(_evaluate_times(governor, 24.0, 10)).is_equal(0)
	assert_int(governor.tier).is_equal(DetailGovernor.Tier.MEDIUM)


func test_evaluations_are_spaced_in_time() -> void:
	var governor := DetailGovernor.new()
	_feed(governor, 45.0, DetailGovernor.WARMUP_FRAMES + DetailGovernor.SAMPLE_CAPACITY)
	governor.evaluate(0)
	_feed(governor, 45.0, DetailGovernor.SAMPLE_CAPACITY)

	assert_bool(governor.evaluate(DetailGovernor.EVAL_INTERVAL_MS - 1)).is_false()


func test_a_tier_left_twice_is_not_entered_again() -> void:
	var governor := DetailGovernor.new()
	_feed(governor, 16.0, DetailGovernor.WARMUP_FRAMES)
	var now := 0
	for _round: int in DetailGovernor.MAX_FAILS_PER_TIER:
		_evaluate_times(governor, 45.0, 1, now)
		now += DetailGovernor.EVAL_INTERVAL_MS
		assert_int(governor.tier).is_equal(DetailGovernor.Tier.SLOW)
		_evaluate_times(governor, 16.0, DetailGovernor.GOOD_EVALUATIONS_TO_RISE, now)
		now += DetailGovernor.EVAL_INTERVAL_MS * DetailGovernor.GOOD_EVALUATIONS_TO_RISE

	# MEDIUM was left twice: good frames keep the device on SLOW now.
	assert_int(governor.tier).is_equal(DetailGovernor.Tier.SLOW)


func test_state_survives_a_restart() -> void:
	var governor := DetailGovernor.new()
	_feed(governor, 45.0, DetailGovernor.WARMUP_FRAMES)
	_evaluate_times(governor, 45.0, 1)

	var restored := DetailGovernor.new()
	restored.restore(governor.to_dict())

	assert_int(restored.tier).is_equal(DetailGovernor.Tier.SLOW)
	assert_float(restored.metric_ms).is_equal(45.0)


func test_invalid_stored_state_keeps_the_default() -> void:
	var governor := DetailGovernor.new()

	governor.restore({"tier": 7.0, "metric": "x"})

	assert_int(governor.tier).is_equal(DetailGovernor.Tier.MEDIUM)
	assert_float(governor.metric_ms).is_equal(-1.0)


func test_median() -> void:
	assert_float(DetailGovernor.median(PackedFloat32Array([5.0, 1.0, 9.0]))).is_equal(5.0)
	assert_float(DetailGovernor.median(PackedFloat32Array())).is_equal(-1.0)


func _slow_governor() -> DetailGovernor:
	var governor := DetailGovernor.new()
	governor.restore({"tier": DetailGovernor.Tier.SLOW})
	return governor


func test_the_slowest_tier_holds_thirty_frames_per_second() -> void:
	var governor := _slow_governor()

	assert_int(governor.fps_cap()).is_equal(DetailGovernor.SLOW_FPS_CAP)
	assert_int(DetailGovernor.new().fps_cap()).is_equal(0)


func test_capped_frames_do_not_count() -> void:
	var governor := _slow_governor()
	governor.tick(0)
	_feed(governor, 10.0, DetailGovernor.SAMPLE_CAPACITY)

	assert_bool(governor.evaluate(0)).is_false()


func test_a_measuring_window_lifts_the_cap_for_a_while() -> void:
	var governor := _slow_governor()
	assert_bool(governor.tick(0)).is_false()
	assert_bool(governor.tick(DetailGovernor.PROBE_EVERY_MS)).is_true()
	assert_bool(governor.is_probing()).is_true()
	assert_int(governor.fps_cap()).is_equal(0)

	assert_bool(governor.tick(DetailGovernor.PROBE_EVERY_MS + DetailGovernor.PROBE_MS)).is_true()
	assert_bool(governor.is_probing()).is_false()
	assert_int(governor.fps_cap()).is_equal(DetailGovernor.SLOW_FPS_CAP)


func test_a_fast_device_climbs_back_after_several_good_windows() -> void:
	var governor := _slow_governor()
	var now := 0
	governor.tick(now)
	for window: int in DetailGovernor.GOOD_EVALUATIONS_TO_RISE:
		now += DetailGovernor.PROBE_EVERY_MS
		governor.tick(now)
		_feed(governor, 12.0, DetailGovernor.SAMPLE_CAPACITY)
		now += DetailGovernor.PROBE_MS
		governor.tick(now)
		governor.evaluate(now)
		# One window counts once, however often it is evaluated.
		governor.evaluate(now + DetailGovernor.EVAL_INTERVAL_MS)

	assert_int(governor.tier).is_equal(DetailGovernor.Tier.MEDIUM)
	assert_int(governor.fps_cap()).is_equal(0)
