extends GdUnitTestSuite

const LOCAL := "http://127.0.0.1:18080"
const LIVE := "https://trade-empire.net"
const TOKEN := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

var _path := ""


func before_test() -> void:
	# Own file per test, never the real session file of the game.
	_path = create_temp_dir("session_store") + "/session.json"


func test_no_file_means_no_token() -> void:
	var store := SessionStore.new(_path)

	assert_str(store.load_token(LOCAL)).is_equal("")


func test_saved_token_is_loaded_for_the_same_server() -> void:
	var store := SessionStore.new(_path)

	assert_bool(store.save_token(LOCAL, TOKEN)).is_true()

	assert_str(SessionStore.new(_path).load_token(LOCAL)).is_equal(TOKEN)


func test_token_of_another_server_is_not_returned() -> void:
	var store := SessionStore.new(_path)
	store.save_token(LOCAL, TOKEN)

	assert_str(store.load_token(LIVE)).is_equal("")


func test_clear_removes_the_token() -> void:
	var store := SessionStore.new(_path)
	store.save_token(LOCAL, TOKEN)

	store.clear()

	assert_str(store.load_token(LOCAL)).is_equal("")
	assert_bool(FileAccess.file_exists(_path)).is_false()


func test_clear_without_a_file_does_nothing() -> void:
	SessionStore.new(_path).clear()

	assert_bool(FileAccess.file_exists(_path)).is_false()


func test_damaged_file_means_no_token() -> void:
	var file := FileAccess.open(_path, FileAccess.WRITE)
	file.store_string('{"server": "http://127.0.0.1:18080", "tok')
	file.close()

	assert_str(SessionStore.new(_path).load_token(LOCAL)).is_equal("")


func test_stored_value_that_is_not_a_token_is_ignored() -> void:
	var file := FileAccess.open(_path, FileAccess.WRITE)
	file.store_string(JSON.stringify({"server": LOCAL, "token": "not-a-token"}))
	file.close()

	assert_str(SessionStore.new(_path).load_token(LOCAL)).is_equal("")


func test_is_token_accepts_only_64_lowercase_hex_characters() -> void:
	assert_bool(SessionStore.is_token(TOKEN)).is_true()
	assert_bool(SessionStore.is_token(TOKEN.to_upper())).is_false()
	assert_bool(SessionStore.is_token(TOKEN.substr(1))).is_false()
	assert_bool(SessionStore.is_token(TOKEN + "0")).is_false()
	assert_bool(SessionStore.is_token(TOKEN.substr(0, 63) + "g")).is_false()
	assert_bool(SessionStore.is_token("")).is_false()
