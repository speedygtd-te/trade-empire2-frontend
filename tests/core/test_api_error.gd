extends GdUnitTestSuite


func test_server_error_with_code_message_and_details() -> void:
	var body := (
		'{"error":"VALIDATION_FAILED","message":"email invalid",'
		+ '"details":{"field":"email","reason":"format"}}'
	)

	var error := ApiError.from_response(400, body)

	assert_int(error.kind).is_equal(ApiError.Kind.SERVER)
	assert_str(error.code).is_equal("VALIDATION_FAILED")
	assert_str(error.message).is_equal("email invalid")
	assert_int(error.http_status).is_equal(400)
	assert_str(Wire.as_string(error.details.get("field"))).is_equal("email")
	assert_bool(error.is_unauthenticated()).is_false()


func test_unauthenticated_is_recognised() -> void:
	var error := ApiError.from_response(401, '{"error":"UNAUTHENTICATED","message":"no session"}')

	assert_bool(error.is_unauthenticated()).is_true()


func test_invalid_credentials_is_not_a_lost_session() -> void:
	var error := ApiError.from_response(401, '{"error":"INVALID_CREDENTIALS","message":"x"}')

	assert_bool(error.is_unauthenticated()).is_false()


func test_rate_limit_carries_the_wait_time() -> void:
	var body := '{"error":"RATE_LIMITED","message":"slow down","details":{"retryAfterMs":12500}}'

	var error := ApiError.from_response(429, body)

	assert_str(error.code).is_equal(ApiError.CODE_RATE_LIMITED)
	assert_int(error.retry_after_ms).is_equal(12500)


func test_bare_431_without_body_gets_a_status_code() -> void:
	var error := ApiError.from_response(431, "")

	assert_str(error.code).is_equal("HTTP_431")
	assert_int(error.kind).is_equal(ApiError.Kind.SERVER)
	assert_bool(error.is_unauthenticated()).is_false()


func test_html_answer_from_a_proxy_gets_a_status_code() -> void:
	var error := ApiError.from_response(502, "<html><body>Bad Gateway</body></html>")

	assert_str(error.code).is_equal("HTTP_502")
	assert_str(error.message).is_equal("")


func test_json_without_error_field_gets_a_status_code() -> void:
	var error := ApiError.from_response(500, '{"unexpected":true}')

	assert_str(error.code).is_equal("HTTP_500")


func test_transport_failure_is_never_a_lost_session() -> void:
	var error := ApiError.transport("connection refused")

	assert_bool(error.is_transport()).is_true()
	assert_bool(error.is_unauthenticated()).is_false()
	assert_str(error.code).is_equal("")
	assert_str(error.message).is_equal("connection refused")
