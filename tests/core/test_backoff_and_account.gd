extends GdUnitTestSuite


func test_backoff_doubles_up_to_the_maximum() -> void:
	var backoff := Backoff.new(1000, 30000)
	var delays: Array[int] = []

	for attempt: int in 7:
		delays.append(backoff.next_delay_ms())

	assert_array(delays).contains_exactly([1000, 2000, 4000, 8000, 16000, 30000, 30000])


func test_backoff_reset_starts_over() -> void:
	var backoff := Backoff.new(1000, 30000)
	backoff.next_delay_ms()
	backoff.next_delay_ms()

	backoff.reset()

	assert_int(backoff.next_delay_ms()).is_equal(1000)


func test_account_from_me_response() -> void:
	var data := Wire.parse_object(
		(
			'{"rev":2,"gameTime":9993,"playerId":"2","playerName":"DevOne",'
			+ '"email":"dev1@example.test","createdAt":9821,"sessionExpiresAt":604809821,'
			+ '"homeBodyId":"planet-sys--22_19_0-89-1"}'
		)
	)

	var account := Account.from_me(data)

	assert_str(account.player_id).is_equal("2")
	assert_str(account.player_name).is_equal("DevOne")
	assert_str(account.email).is_equal("dev1@example.test")
	assert_int(account.session_expires_at_ms).is_equal(604809821)
	assert_str(account.home_body_id).is_equal("planet-sys--22_19_0-89-1")


func test_account_without_colony_has_empty_home_body() -> void:
	var data := Wire.parse_object('{"playerId":"9","playerName":"NoHome","email":"n@example.test"}')

	var account := Account.from_me(data)

	assert_str(account.home_body_id).is_equal("")
