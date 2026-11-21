extends GdUnitTestSuite
## HttpReply: headers, gzip bodies, keep-alive and when a lost call may go again.


func test_header_ignores_case_and_spaces() -> void:
	var headers: PackedStringArray = ["content-type: application/json", "Content-Encoding:  gzip "]
	assert_str(HttpReply.header(headers, "Content-Encoding")).is_equal("gzip")
	assert_str(HttpReply.header(headers, "CONTENT-TYPE")).is_equal("application/json")
	assert_str(HttpReply.header(headers, "ETag")).is_equal("")


func test_unpack_keeps_a_plain_body() -> void:
	var payload := "{\"a\":1}".to_utf8_buffer()
	var body := HttpReply.unpack(["Content-Type: application/json"], payload)
	assert_bool(body.ok).is_true()
	assert_str(body.bytes.get_string_from_utf8()).is_equal("{\"a\":1}")


func test_unpack_gzip() -> void:
	var text := "{\"rev\":3,\"gameTime\":10}\n".repeat(200)
	var packed := text.to_utf8_buffer().compress(FileAccess.COMPRESSION_GZIP)
	var body := HttpReply.unpack(["Content-Encoding: gzip"], packed)
	assert_bool(body.ok).is_true()
	assert_str(body.bytes.get_string_from_utf8()).is_equal(text)


func test_unpack_refuses_broken_gzip_and_unknown_encodings() -> void:
	var broken := PackedByteArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23])
	assert_bool(HttpReply.unpack(["Content-Encoding: gzip"], broken).ok).is_false()
	assert_bool(HttpReply.unpack(["Content-Encoding: br"], "x".to_utf8_buffer()).ok).is_false()
	assert_bool(HttpReply.unpack(["Content-Encoding: gzip"], PackedByteArray()).ok).is_true()


func test_keeps_alive_unless_the_server_closes() -> void:
	assert_bool(HttpReply.keeps_alive([])).is_true()
	assert_bool(HttpReply.keeps_alive(["Connection: keep-alive"])).is_true()
	assert_bool(HttpReply.keeps_alive(["connection: Close"])).is_false()
	assert_bool(HttpReply.keeps_alive(["Connection: upgrade, close"])).is_false()


func test_idempotent_methods() -> void:
	assert_bool(HttpReply.idempotent(HTTPClient.METHOD_GET)).is_true()
	assert_bool(HttpReply.idempotent(HTTPClient.METHOD_PUT)).is_true()
	assert_bool(HttpReply.idempotent(HTTPClient.METHOD_DELETE)).is_true()
	assert_bool(HttpReply.idempotent(HTTPClient.METHOD_POST)).is_false()
	assert_bool(HttpReply.idempotent(HTTPClient.METHOD_PATCH)).is_false()


func test_may_reuse_a_fresh_connection_for_anything_an_older_one_only_for_safe_calls() -> void:
	assert_bool(HttpReply.may_reuse(HTTPClient.METHOD_POST, 1000, 60000)).is_true()
	assert_bool(HttpReply.may_reuse(HTTPClient.METHOD_POST, HttpReply.FRESH_MS, 60000)).is_false()
	assert_bool(HttpReply.may_reuse(HTTPClient.METHOD_GET, 30000, 60000)).is_true()
	assert_bool(HttpReply.may_reuse(HTTPClient.METHOD_GET, 60000, 60000)).is_false()


func test_may_retry_only_safe_calls_lost_on_a_kept_connection_once() -> void:
	assert_bool(HttpReply.may_retry(HTTPClient.METHOD_GET, true, false, 1)).is_true()
	assert_bool(HttpReply.may_retry(HTTPClient.METHOD_GET, false, false, 1)).is_false()
	assert_bool(HttpReply.may_retry(HTTPClient.METHOD_GET, true, true, 1)).is_false()
	assert_bool(HttpReply.may_retry(HTTPClient.METHOD_GET, true, false, 2)).is_false()
	assert_bool(HttpReply.may_retry(HTTPClient.METHOD_POST, true, false, 1)).is_false()
