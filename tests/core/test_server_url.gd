extends GdUnitTestSuite


func test_local_http_address_with_port() -> void:
	var url := ServerUrl.parse("http://127.0.0.1:18080")

	assert_bool(url.tls).is_false()
	assert_str(url.host).is_equal("127.0.0.1")
	assert_int(url.port).is_equal(18080)
	assert_str(url.base).is_equal("http://127.0.0.1:18080")


func test_https_uses_port_443_and_omits_it_from_the_base() -> void:
	var url := ServerUrl.parse("https://trade-empire.net")

	assert_bool(url.tls).is_true()
	assert_str(url.host).is_equal("trade-empire.net")
	assert_int(url.port).is_equal(443)
	assert_str(url.base).is_equal("https://trade-empire.net")


func test_http_default_port() -> void:
	var url := ServerUrl.parse("http://localhost")

	assert_int(url.port).is_equal(80)
	assert_str(url.base).is_equal("http://localhost")


func test_trailing_slash_and_whitespace_are_removed() -> void:
	var url := ServerUrl.parse("  https://trade-empire.net/ ")

	assert_str(url.base).is_equal("https://trade-empire.net")


func test_explicit_default_port_is_normalised_away() -> void:
	var url := ServerUrl.parse("https://trade-empire.net:443")

	assert_str(url.base).is_equal("https://trade-empire.net")


func test_rejects_addresses_without_scheme_or_with_path() -> void:
	assert_object(ServerUrl.parse("trade-empire.net")).is_null()
	assert_object(ServerUrl.parse("ftp://trade-empire.net")).is_null()
	assert_object(ServerUrl.parse("https://trade-empire.net/v2")).is_null()
	assert_object(ServerUrl.parse("https://")).is_null()
	assert_object(ServerUrl.parse("")).is_null()


func test_rejects_invalid_ports() -> void:
	assert_object(ServerUrl.parse("http://host:abc")).is_null()
	assert_object(ServerUrl.parse("http://host:0")).is_null()
	assert_object(ServerUrl.parse("http://host:70000")).is_null()
	assert_object(ServerUrl.parse("http://:8080")).is_null()
