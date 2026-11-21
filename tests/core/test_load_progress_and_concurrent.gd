extends GdUnitTestSuite
## LoadProgress (the loading bar) and Concurrent (tasks side by side).

signal _go


func test_fill_starts_each_step_at_its_part() -> void:
	assert_float(LoadProgress.fill(1, 4, 0.0)).is_equal_approx(0.0, 0.0001)
	assert_float(LoadProgress.fill(3, 4, 0.0)).is_equal_approx(0.5, 0.0001)
	assert_float(LoadProgress.fill(5, 4, 0.0)).is_equal(1.0)
	assert_float(LoadProgress.fill(1, 0, 3.0)).is_equal(0.0)


func test_fill_creeps_but_stays_inside_the_step() -> void:
	var early := LoadProgress.fill(2, 4, 0.5)
	var later := LoadProgress.fill(2, 4, 3.0)
	var much_later := LoadProgress.fill(2, 4, 600.0)
	assert_float(early).is_greater(0.25)
	assert_float(later).is_greater(early)
	assert_float(much_later).is_less(0.5)
	assert_float(much_later).is_equal_approx(0.25 + 0.25 * LoadProgress.CREEP_SHARE, 0.001)


func test_concurrent_returns_results_in_order() -> void:
	var results := await Concurrent.all([
		func() -> int: return 1,
		func() -> String: return "two",
	])
	assert_array(results).contains_exactly([1, "two"])


func test_concurrent_runs_tasks_side_by_side() -> void:
	var order: Array[String] = []
	var tasks := Concurrent.new()
	tasks.add(func() -> String:
		order.append("a starts")
		await _go
		order.append("a ends")
		return "a")
	tasks.add(func() -> String:
		order.append("b starts")
		await _go
		order.append("b ends")
		return "b")
	# Both started before either finished.
	assert_array(order).contains_exactly(["a starts", "b starts"])
	assert_int(tasks.pending()).is_equal(2)
	_release.call_deferred()
	var results := await tasks.wait()
	assert_array(results).contains_exactly(["a", "b"])
	assert_int(tasks.pending()).is_equal(0)


func test_concurrent_wait_without_tasks() -> void:
	var results := await Concurrent.new().wait()
	assert_array(results).is_empty()


func _release() -> void:
	_go.emit()
