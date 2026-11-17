extends GdUnitTestSuite


func test_success_carries_data_rev_and_game_time() -> void:
	var body := '{"rev":2,"gameTime":9993,"playerId":"2","playerName":"DevOne"}'

	var result := ApiResult.from_http(200, body)

	assert_bool(result.is_ok()).is_true()
	assert_int(result.rev).is_equal(2)
	assert_int(result.game_time_ms).is_equal(9993)
	assert_str(Wire.as_string(result.data.get("playerId"))).is_equal("2")


func test_created_status_counts_as_success() -> void:
	var result := ApiResult.from_http(201, '{"rev":2,"gameTime":9821,"token":"abc"}')

	assert_bool(result.is_ok()).is_true()


func test_error_status_yields_the_server_error() -> void:
	var result := ApiResult.from_http(409, '{"error":"EMAIL_TAKEN","message":"taken"}')

	assert_bool(result.is_ok()).is_false()
	assert_str(result.error.code).is_equal("EMAIL_TAKEN")
	assert_bool(result.data.is_empty()).is_true()
	assert_int(result.rev).is_equal(-1)


func test_success_status_with_non_json_body_is_a_failure() -> void:
	var result := ApiResult.from_http(200, "<html>captive portal</html>")

	assert_bool(result.is_ok()).is_false()
	assert_str(result.error.code).is_equal(ApiResult.CODE_MALFORMED_RESPONSE)
	assert_int(result.error.http_status).is_equal(200)


func test_success_status_with_json_array_is_a_failure() -> void:
	var result := ApiResult.from_http(200, "[1,2,3]")

	assert_bool(result.is_ok()).is_false()
	assert_str(result.error.code).is_equal(ApiResult.CODE_MALFORMED_RESPONSE)


func test_success_without_meta_reports_minus_one() -> void:
	var result := ApiResult.from_http(200, '{"status":"ok"}')

	assert_bool(result.is_ok()).is_true()
	assert_int(result.rev).is_equal(-1)
	assert_int(result.game_time_ms).is_equal(-1)


func test_failed_wraps_a_transport_error() -> void:
	var result := ApiResult.failed(ApiError.transport("timeout"))

	assert_bool(result.is_ok()).is_false()
	assert_bool(result.error.is_transport()).is_true()
