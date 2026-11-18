extends GdUnitTestSuite


func test_amount_buttons_never_move_more_than_there_is() -> void:
	assert_int(TransferPlan.units_for(1, 50)).is_equal(1)
	assert_int(TransferPlan.units_for(10, 7)).is_equal(7)
	assert_int(TransferPlan.units_for(0, 50)).is_equal(50)
	assert_int(TransferPlan.units_for(10, 0)).is_equal(0)


func test_a_transfer_fits_into_the_free_space() -> void:
	assert_bool(TransferPlan.fits(5_000_000, 100_000_000, 95_000_000)).is_true()
	assert_bool(TransferPlan.fits(5_000_001, 100_000_000, 95_000_000)).is_false()
	# Without a known capacity the preview does not stop it; the server decides.
	assert_bool(TransferPlan.fits(5_000_000, 0, 0)).is_true()


func test_request_names_guest_direction_and_micro_units() -> void:
	var body := TransferPlan.request(12, true, "IRON", 3_000_000)

	assert_int(body["guestId"]).is_equal(12)
	assert_str(body["direction"]).is_equal("toGuest")
	assert_array(body["items"]).is_equal([{"resource": "IRON", "amount": 3_000_000}])
	assert_str(TransferPlan.request(12, false, "IRON", 1)["direction"]).is_equal("toHost")
