extends GdUnitTestSuite
## PerfStats: the last minute of frames, its summary and the shared report.


func test_an_empty_record_has_an_empty_summary() -> void:
	var stats := PerfStats.new()
	var summary := stats.summary()

	assert_int(summary.frames).is_equal(0)
	assert_float(summary.fps).is_equal(0.0)


func test_summary_of_steady_frames() -> void:
	var stats := PerfStats.new()
	for index: int in 100:
		stats.add(index * 20, 20.0, 50, 10000, 300.0)
	var summary := stats.summary()

	assert_int(summary.frames).is_equal(100)
	assert_float(summary.fps).is_equal_approx(50.0, 0.01)
	assert_float(summary.frame_ms_avg).is_equal_approx(20.0, 0.01)
	assert_float(summary.slow_share).is_equal(0.0)
	assert_float(summary.draw_calls_avg).is_equal_approx(50.0, 0.01)
	assert_float(summary.memory_mb_max).is_equal_approx(300.0, 0.01)


func test_slow_frames_count_as_stutters_and_raise_the_p95() -> void:
	var stats := PerfStats.new()
	for index: int in 90:
		stats.add(index * 16, 16.0, 10, 100, 100.0)
	for index: int in 10:
		stats.add(2000 + index * 50, 50.0, 10, 100, 120.0)
	var summary := stats.summary()

	assert_float(summary.slow_share).is_equal_approx(0.1, 0.001)
	assert_float(summary.frame_ms_p95).is_equal(50.0)
	assert_float(summary.frame_ms_max).is_equal(50.0)
	assert_float(summary.memory_mb_max).is_equal(120.0)


func test_only_the_last_minute_is_kept() -> void:
	var stats := PerfStats.new()
	stats.add(0, 100.0, 1, 1, 1.0)
	stats.add(30000, 10.0, 1, 1, 1.0)
	stats.add(70000, 10.0, 1, 1, 1.0)

	assert_int(stats.size()).is_equal(2)
	assert_float(stats.summary().frame_ms_max).is_equal(10.0)
	stats.clear()
	assert_int(stats.size()).is_equal(0)


func test_report_lists_the_device_then_the_numbers() -> void:
	var stats := PerfStats.new()
	stats.add(0, 25.0, 40, 5000, 200.0)
	var device: Array[Array] = [["Device", "Phone X"], ["GPU", "Mali"]]
	var text := PerfStats.report(device, {"fps": "FPS"}, stats.summary())
	var lines := text.split("\n")

	assert_str(lines[0]).is_equal("Device: Phone X")
	assert_str(lines[1]).is_equal("GPU: Mali")
	assert_bool(text.contains("FPS: 40.0")).is_true()
	assert_bool(text.contains("25.0 / 25.0 / 25.0 ms")).is_true()
