extends GdUnitTestSuite

const LOCAL := "http://127.0.0.1:18080"
const LIVE := "https://trade-empire.net"
const ETAG := '"cc18d757b6ce2517ead6745f734e740a73e15ca8b2dc90d621bf5f3c8214a643"'
const TEXT := '{"dataHash":"cc18","modules":[]}'

var _path := ""


func before_test() -> void:
	# Own file per test, never the real cache of the game.
	_path = create_temp_dir("definitions_cache") + "/definitions.json"


func test_no_file_means_no_entry() -> void:
	assert_object(DefinitionsCache.new(_path).load_entry(LIVE)).is_null()


func test_saved_bundle_and_etag_come_back_unchanged() -> void:
	assert_bool(DefinitionsCache.new(_path).save_entry(LIVE, ETAG, TEXT)).is_true()

	var entry := DefinitionsCache.new(_path).load_entry(LIVE)

	assert_str(entry.etag).is_equal(ETAG)
	assert_str(entry.text).is_equal(TEXT)


func test_bundle_of_another_server_is_not_returned() -> void:
	var cache := DefinitionsCache.new(_path)
	cache.save_entry(LOCAL, ETAG, TEXT)

	assert_object(cache.load_entry(LIVE)).is_null()


func test_entry_without_etag_or_bundle_is_ignored() -> void:
	var cache := DefinitionsCache.new(_path)
	cache.save_entry(LIVE, "", TEXT)
	assert_object(cache.load_entry(LIVE)).is_null()

	cache.save_entry(LIVE, ETAG, "")
	assert_object(cache.load_entry(LIVE)).is_null()


func test_damaged_file_means_no_entry() -> void:
	var file := FileAccess.open(_path, FileAccess.WRITE)
	file.store_string('{"server": "https://trade-empire.net", "etag": "x", "bund')
	file.close()

	assert_object(DefinitionsCache.new(_path).load_entry(LIVE)).is_null()


func test_clear_removes_the_file() -> void:
	var cache := DefinitionsCache.new(_path)
	cache.save_entry(LIVE, ETAG, TEXT)

	cache.clear()

	assert_object(cache.load_entry(LIVE)).is_null()
	assert_bool(FileAccess.file_exists(_path)).is_false()
