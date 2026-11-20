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
	governor.restore({"tier": DetailGovernor.Tier.SLOW, "order": DetailGovernor.STATE_ORDER})
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


# --- ULTRA (high-detail models) -------------------------------------------------------------

func _fast_governor(allowed: bool = true) -> DetailGovernor:
	var governor := DetailGovernor.new()
	governor.restore({"tier": DetailGovernor.Tier.FAST, "order": DetailGovernor.STATE_ORDER})
	governor.allow_ultra(allowed)
	_feed(governor, 16.7, DetailGovernor.WARMUP_FRAMES)
	return governor


## Runs evaluations EVAL_INTERVAL_MS apart, feeding frames with a work time before each.
func _evaluate_with_work(governor: DetailGovernor, frame_ms: float, work_ms: float, times: int, start_ms: int = 0) -> int:
	var changes := 0
	for index: int in times:
		for _frame: int in DetailGovernor.SAMPLE_CAPACITY:
			governor.add_frame(frame_ms, work_ms)
		if governor.evaluate(start_ms + index * DetailGovernor.EVAL_INTERVAL_MS):
			changes += 1
	return changes


func test_ultra_is_reached_only_after_more_calm_evaluations() -> void:
	var governor := _fast_governor()

	_evaluate_with_work(governor, 16.7, 5.0, DetailGovernor.GOOD_EVALUATIONS_TO_ULTRA - 1)
	assert_int(governor.tier).is_equal(DetailGovernor.Tier.FAST)

	_evaluate_with_work(governor, 16.7, 5.0, 1, 100000)
	assert_int(governor.tier).is_equal(DetailGovernor.Tier.ULTRA)
	assert_int(governor.fps_cap()).is_equal(0)


func test_ultra_needs_the_permission() -> void:
	var governor := _fast_governor(false)

	_evaluate_with_work(governor, 16.7, 5.0, DetailGovernor.GOOD_EVALUATIONS_TO_ULTRA * 2)

	assert_int(governor.tier).is_equal(DetailGovernor.Tier.FAST)


func test_ultra_needs_headroom_in_the_work_per_frame() -> void:
	var governor := _fast_governor()

	# Vsync shows 16.7 ms, but the device works 14 ms of them: no room for more triangles.
	_evaluate_with_work(governor, 16.7, 14.0, DetailGovernor.GOOD_EVALUATIONS_TO_ULTRA * 2)

	assert_int(governor.tier).is_equal(DetailGovernor.Tier.FAST)
	assert_float(governor.work_ms).is_equal(14.0)


func test_ultra_needs_calm_frames() -> void:
	var governor := _fast_governor()
	for index: int in DetailGovernor.GOOD_EVALUATIONS_TO_ULTRA * 2:
		# A good median, but every fifth frame stutters.
		for frame: int in DetailGovernor.SAMPLE_CAPACITY:
			governor.add_frame(40.0 if frame % 5 == 0 else 16.7)
		governor.evaluate(index * DetailGovernor.EVAL_INTERVAL_MS)

	assert_int(governor.tier).is_equal(DetailGovernor.Tier.FAST)


func test_ultra_without_work_measurement_goes_by_frame_times() -> void:
	var governor := _fast_governor()

	_evaluate_times(governor, 16.7, DetailGovernor.GOOD_EVALUATIONS_TO_ULTRA)

	assert_int(governor.tier).is_equal(DetailGovernor.Tier.ULTRA)
	assert_float(governor.work_ms).is_equal(-1.0)


func _ultra_governor() -> DetailGovernor:
	var governor := _fast_governor()
	_evaluate_with_work(governor, 16.7, 5.0, DetailGovernor.GOOD_EVALUATIONS_TO_ULTRA)
	assert_int(governor.tier).is_equal(DetailGovernor.Tier.ULTRA)
	return governor


func test_ultra_is_left_early_and_not_tried_again() -> void:
	var governor := _ultra_governor()
	var now := 1000000

	# 25 ms is still fine for FAST (dead band), but too slow for ULTRA.
	assert_int(_evaluate_times(governor, 25.0, 1, now)).is_equal(1)
	assert_int(governor.tier).is_equal(DetailGovernor.Tier.FAST)

	now += DetailGovernor.EVAL_INTERVAL_MS
	_evaluate_with_work(governor, 16.7, 5.0, DetailGovernor.GOOD_EVALUATIONS_TO_ULTRA * 2, now)
	assert_int(governor.tier).is_equal(DetailGovernor.Tier.FAST)

	# Also not after a restart.
	var restored := DetailGovernor.new()
	restored.restore(governor.to_dict())
	restored.allow_ultra(true)
	_feed(restored, 16.7, DetailGovernor.WARMUP_FRAMES)
	_evaluate_with_work(restored, 16.7, 5.0, DetailGovernor.GOOD_EVALUATIONS_TO_ULTRA * 2)
	assert_int(restored.tier).is_equal(DetailGovernor.Tier.FAST)


func test_frames_in_the_ultra_band_keep_ultra() -> void:
	var governor := _ultra_governor()

	assert_int(_evaluate_times(governor, 20.0, 5, 1000000)).is_equal(0)
	assert_int(governor.tier).is_equal(DetailGovernor.Tier.ULTRA)


func test_switching_ultra_off_drops_to_fast_at_once() -> void:
	var governor := _ultra_governor()

	assert_bool(governor.allow_ultra(false)).is_true()
	assert_int(governor.tier).is_equal(DetailGovernor.Tier.FAST)
	assert_bool(governor.allow_ultra(false)).is_false()

	# Switching it off was no failure: on again, the way up is open.
	governor.allow_ultra(true)
	_evaluate_with_work(governor, 16.7, 5.0, DetailGovernor.GOOD_EVALUATIONS_TO_ULTRA, 1000000)
	assert_int(governor.tier).is_equal(DetailGovernor.Tier.ULTRA)


func test_a_stored_ultra_starts_as_fast() -> void:
	var governor := DetailGovernor.new()

	governor.restore({"tier": DetailGovernor.Tier.ULTRA, "order": DetailGovernor.STATE_ORDER})

	assert_int(governor.tier).is_equal(DetailGovernor.Tier.FAST)


func test_a_state_from_before_ultra_keeps_its_tier() -> void:
	# Before ULTRA, FAST was 0 and SLOW 2.
	var fast := DetailGovernor.new()
	fast.restore({"tier": 0.0, "metric": 16.0})
	var slow := DetailGovernor.new()
	slow.restore({"tier": 2.0})

	assert_int(fast.tier).is_equal(DetailGovernor.Tier.FAST)
	assert_int(slow.tier).is_equal(DetailGovernor.Tier.SLOW)


func test_ultra_on_a_device() -> void:
	var gib := 1024 * 1024 * 1024
	# Off phones and tablets: always.
	assert_bool(DetailGovernor.device_allows_ultra(false, 2 * gib, 2, "PowerVR Rogue GE8320")).is_true()
	# The low-end test phone (Helio A22, 4 GB).
	assert_bool(DetailGovernor.device_allows_ultra(true, 4 * gib, 4, "PowerVR Rogue GE8320")).is_false()
	assert_bool(DetailGovernor.device_allows_ultra(true, 12 * gib, 8, "Adreno (TM) 740")).is_true()
	assert_bool(DetailGovernor.device_allows_ultra(true, 12 * gib, 8, "Mali-G57 MC2")).is_false()
	assert_bool(DetailGovernor.device_allows_ultra(true, 5 * gib, 8, "Adreno (TM) 740")).is_false()
	assert_bool(DetailGovernor.device_allows_ultra(true, 12 * gib, 6, "Adreno (TM) 740")).is_false()
	# An "8 GB" phone as Android reports it (Pixel 10a: about 6.8 GiB, Mali-G715): allowed.
	assert_bool(DetailGovernor.device_allows_ultra(true, int(6.8 * gib), 8, "Mali-G715")).is_true()


func test_why_a_device_is_not_strong_enough() -> void:
	var gib := 1024 * 1024 * 1024
	assert_str(DetailGovernor.ultra_device_block(true, 4 * gib, 8, "Adreno (TM) 740")).is_equal("memory")
	assert_str(DetailGovernor.ultra_device_block(true, 12 * gib, 4, "Adreno (TM) 740")).is_equal("cores")
	assert_str(DetailGovernor.ultra_device_block(true, 12 * gib, 8, "PowerVR Rogue GE8320")).is_equal("gpu")
	assert_str(DetailGovernor.ultra_device_block(true, 0, 8, "Adreno (TM) 740")).is_empty()
	assert_str(DetailGovernor.ultra_device_block(false, 1, 1, "PowerVR")).is_empty()


func test_percentile() -> void:
	var values := PackedFloat32Array([5.0, 1.0, 9.0, 3.0, 7.0, 2.0, 8.0, 4.0, 6.0, 10.0])
	assert_float(DetailGovernor.percentile(values, 0.9)).is_equal(10.0)
	assert_float(DetailGovernor.percentile(values, 0.0)).is_equal(1.0)
	assert_float(DetailGovernor.percentile(PackedFloat32Array(), 0.9)).is_equal(-1.0)
