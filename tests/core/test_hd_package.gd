extends GdUnitTestSuite


func _eligible() -> HdPackage:
	var package := HdPackage.new()
	package.set_eligibility(true, true)
	return package


func test_nothing_is_fetched_on_a_weak_device_or_when_turned_off() -> void:
	var package := HdPackage.new()
	package.set_eligibility(false, true)
	assert_bool(package.wants_check(0)).is_false()
	assert_str(package.status_key()).is_equal("PROFILE_HD_PACKAGE_UNSUPPORTED")
	package.set_eligibility(true, false)
	assert_bool(package.wants_check(0)).is_false()
	assert_str(package.status_key()).is_equal("PROFILE_HD_PACKAGE_OFF")
	package.set_eligibility(true, true)
	assert_bool(package.wants_check(0)).is_true()
	assert_str(package.status_key()).is_equal("PROFILE_HD_PACKAGE_WAITING")


func test_download_path_to_ready() -> void:
	var package := _eligible()

	package.check_started()
	assert_int(package.state).is_equal(HdPackage.State.CHECKING)
	assert_bool(package.wants_check(0)).is_false()
	package.download_started(1000)
	package.progress(420)
	assert_int(package.state).is_equal(HdPackage.State.DOWNLOADING)
	assert_int(package.percent()).is_equal(42)
	assert_str(package.status_key()).is_equal("PROFILE_HD_PACKAGE_DOWNLOADING")
	package.verifying()
	assert_int(package.state).is_equal(HdPackage.State.VERIFYING)
	assert_bool(package.downloaded("v1")).is_true()

	assert_bool(package.is_ready()).is_true()
	assert_str(package.version).is_equal("v1")
	assert_str(package.status_key()).is_equal("PROFILE_HD_PACKAGE_READY")
	assert_bool(package.wants_check(10 ** 9)).is_false()


func test_a_failure_waits_and_the_pause_grows() -> void:
	var package := _eligible()
	package.check_started()

	package.failed(1000)

	assert_int(package.state).is_equal(HdPackage.State.FAILED)
	assert_str(package.status_key()).is_equal("PROFILE_HD_PACKAGE_FAILED")
	assert_bool(package.wants_check(1000 + HdPackage.RETRY_FIRST_MS - 1)).is_false()
	assert_int(package.retry_in_ms(1000)).is_equal(HdPackage.RETRY_FIRST_MS)
	var second := 1000 + HdPackage.RETRY_FIRST_MS
	assert_bool(package.wants_check(second)).is_true()
	package.check_started()
	package.failed(second)
	assert_int(package.retry_in_ms(second)).is_equal(2 * HdPackage.RETRY_FIRST_MS)


func test_retry_now_ends_the_pause() -> void:
	var package := _eligible()
	package.check_started()
	package.failed(1000)

	package.retry_now()

	assert_bool(package.wants_check(1000)).is_true()


func test_a_cached_pack_stays_in_use_and_an_update_waits_for_the_next_start() -> void:
	var package := _eligible()
	package.mounted("v1")
	assert_bool(package.wants_check(0)).is_true()

	package.check_started()
	package.download_started(100)
	assert_int(package.state).is_equal(HdPackage.State.READY)

	assert_bool(package.downloaded("v2")).is_false()
	assert_str(package.version).is_equal("v1")
	assert_bool(package.wants_check(0)).is_false()


func test_offline_with_a_cached_pack_stays_ready() -> void:
	var package := _eligible()
	package.mounted("v1")
	package.check_started()

	package.failed(0)

	assert_bool(package.is_ready()).is_true()
	assert_str(package.status_key()).is_equal("PROFILE_HD_PACKAGE_READY")


func test_up_to_date_asks_no_more_this_session() -> void:
	var package := _eligible()
	package.mounted("v1")
	package.check_started()

	package.up_to_date()

	assert_bool(package.wants_check(10 ** 9)).is_false()


func test_built_in_models_need_no_check() -> void:
	var package := _eligible()

	package.mounted(HdPackage.BUILT_IN)

	assert_bool(package.is_ready()).is_true()
	assert_bool(package.wants_check(0)).is_false()


func test_turning_it_off_stops_a_running_attempt() -> void:
	var package := _eligible()
	package.check_started()
	package.download_started(100)

	assert_bool(package.set_eligibility(true, false)).is_true()
	package.stopped()

	assert_int(package.state).is_equal(HdPackage.State.WAITING)
	assert_bool(package.wants_check(0)).is_false()
	package.set_eligibility(true, true)
	assert_bool(package.wants_check(0)).is_true()


func test_not_offered() -> void:
	var package := _eligible()
	package.check_started()

	package.not_offered()

	assert_str(package.status_key()).is_equal("PROFILE_HD_PACKAGE_NOT_OFFERED")
	assert_bool(package.wants_check(0)).is_false()
	package.retry_now()
	assert_bool(package.wants_check(0)).is_true()


func test_percent_without_size_is_zero() -> void:
	var package := _eligible()
	package.download_started(0)
	package.progress(500)

	assert_int(package.percent()).is_equal(0)
