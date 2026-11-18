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


func test_not_modified_is_a_success_without_data() -> void:
	var result := ApiResult.from_http(304, "")

	assert_bool(result.is_ok()).is_true()
	assert_bool(result.not_modified).is_true()
	assert_bool(result.data.is_empty()).is_true()


func test_ordinary_success_is_not_marked_as_not_modified() -> void:
	assert_bool(ApiResult.from_http(200, '{"rev":1,"gameTime":2}').not_modified).is_false()


func test_etag_is_found_case_insensitively_with_quotes_kept() -> void:
	var headers: PackedStringArray = ["Content-Type: application/json", 'etag: "abc123"']

	assert_str(ApiResult.etag_from_headers(headers)).is_equal('"abc123"')


func test_etag_is_empty_when_the_header_is_missing() -> void:
	var headers: PackedStringArray = ["Content-Type: application/json", "X-Etag-Info: no"]

	assert_str(ApiResult.etag_from_headers(headers)).is_empty()


func test_ndjson_answer_keeps_its_lines_and_meta() -> void:
	var result := ApiResult.from_ndjson(200, '{"line":"header","rev":7,"gameTime":99}\n{"line":"end","rev":7}\n')

	assert_bool(result.is_ok()).is_true()
	assert_int(result.stream.objects.size()).is_equal(2)
	assert_int(result.rev).is_equal(7)
	assert_int(result.game_time_ms).is_equal(99)


func test_ndjson_error_status_is_the_server_error() -> void:
	var result := ApiResult.from_ndjson(404, '{"error":"STRUCTURE_NOT_FOUND","message":"x"}')

	assert_str(result.error.code).is_equal("STRUCTURE_NOT_FOUND")
	assert_object(result.stream).is_null()


func test_empty_ndjson_answer_is_malformed() -> void:
	assert_str(ApiResult.from_ndjson(200, "").error.code).is_equal(ApiResult.CODE_MALFORMED_RESPONSE)


func test_raw_answer_keeps_the_text_and_reads_meta_from_the_first_line() -> void:
	var text := '{"rev":7,"gameTime":99,"radius":50.0}\n{"systemId":"sys-0_0_0-0"}\n{"end":true,"rows":1,"truncated":false}\n'
	var result := ApiResult.from_raw(200, text)

	assert_bool(result.is_ok()).is_true()
	assert_str(result.body).is_equal(text)
	assert_int(result.rev).is_equal(7)
	assert_int(result.game_time_ms).is_equal(99)
	assert_object(result.stream).is_null()


func test_raw_answer_without_meta_reports_minus_one() -> void:
	var result := ApiResult.from_raw(200, "plain")

	assert_bool(result.is_ok()).is_true()
	assert_int(result.rev).is_equal(-1)


func test_raw_error_status_is_the_server_error() -> void:
	var result := ApiResult.from_raw(404, '{"error":"NOT_FOUND","message":"x"}')

	assert_str(result.error.code).is_equal("NOT_FOUND")
	assert_str(result.body).is_empty()


func test_failed_wraps_a_transport_error() -> void:
	var result := ApiResult.failed(ApiError.transport("timeout"))

	assert_bool(result.is_ok()).is_false()
	assert_bool(result.error.is_transport()).is_true()
