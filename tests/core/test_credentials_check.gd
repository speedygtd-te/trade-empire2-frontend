extends GdUnitTestSuite


func test_plausible_email_is_accepted() -> void:
	assert_str(CredentialsCheck.email_problem("dev1@example.test")).is_empty()


func test_implausible_emails_are_rejected() -> void:
	for email: String in ["", "no-at-sign", "@example.test", "name@", "na me@example.test"]:
		assert_str(CredentialsCheck.email_problem(email)).is_equal(CredentialsCheck.KEY_EMAIL)


func test_overlong_email_is_rejected() -> void:
	var email := "a".repeat(250) + "@x.io"

	assert_str(CredentialsCheck.email_problem(email)).is_equal(CredentialsCheck.KEY_EMAIL)


func test_registration_needs_8_to_128_password_characters() -> void:
	assert_str(CredentialsCheck.password_problem("1234567", true)).is_equal(CredentialsCheck.KEY_PASSWORD)
	assert_str(CredentialsCheck.password_problem("12345678", true)).is_empty()
	assert_str(CredentialsCheck.password_problem("x".repeat(128), true)).is_empty()
	assert_str(CredentialsCheck.password_problem("x".repeat(129), true)).is_equal(CredentialsCheck.KEY_PASSWORD)


func test_sign_in_only_needs_a_non_empty_password() -> void:
	assert_str(CredentialsCheck.password_problem("short", false)).is_empty()
	assert_str(CredentialsCheck.password_problem("", false)).is_equal(CredentialsCheck.KEY_PASSWORD)


func test_valid_player_names() -> void:
	for player_name: String in ["DevOne", "abc", "Dev One", "Dev_One-2", "A" + "b".repeat(23)]:
		assert_str(CredentialsCheck.player_name_problem(player_name)).is_empty()


func test_invalid_player_names() -> void:
	var names: Array[String] = [
		"ab",
		"A" + "b".repeat(24),
		"1abc",
		"_abc",
		"Dev  One",
		"Dev One ",
		"Dévone",
		"Dev.One",
	]
	for player_name: String in names:
		assert_str(CredentialsCheck.player_name_problem(player_name)).is_equal(
			CredentialsCheck.KEY_PLAYER_NAME
		)
