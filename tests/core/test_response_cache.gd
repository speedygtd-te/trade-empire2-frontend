extends GdUnitTestSuite
## ResponseCache: bodies and systems are kept per session, nothing else is.


func test_only_single_bodies_and_systems_are_cacheable() -> void:
	assert_bool(ResponseCache.is_cacheable("/v2/bodies/planet-sys-1-2")).is_true()
	assert_bool(ResponseCache.is_cacheable("/v2/systems/sys-1_2_3-4")).is_true()
	assert_bool(ResponseCache.is_cacheable("/v2/bodies/planet-sys-1-2/surface")).is_false()
	assert_bool(ResponseCache.is_cacheable("/v2/bodies/x?z=1")).is_false()
	assert_bool(ResponseCache.is_cacheable("/v2/bodies/")).is_false()
	assert_bool(ResponseCache.is_cacheable("/v2/structures")).is_false()
	assert_bool(ResponseCache.is_cacheable("/v2/me")).is_false()


func test_store_and_lookup_per_session() -> void:
	var cache := ResponseCache.new()
	cache.store("/v2/bodies/a", "token-1", "{\"name\":\"A\"}")
	assert_str(cache.lookup("/v2/bodies/a", "token-1")).is_equal("{\"name\":\"A\"}")
	assert_str(cache.lookup("/v2/bodies/b", "token-1")).is_equal("")
	assert_str(cache.lookup("/v2/bodies/a", "token-2")).is_equal("")
	# Another session starts empty.
	cache.store("/v2/bodies/b", "token-2", "{}")
	assert_str(cache.lookup("/v2/bodies/a", "token-2")).is_equal("")
	assert_int(cache.size()).is_equal(1)


func test_store_ignores_other_paths_and_empty_answers() -> void:
	var cache := ResponseCache.new()
	cache.store("/v2/structures", "t", "{}")
	cache.store("/v2/bodies/a", "t", "")
	assert_int(cache.size()).is_equal(0)


func test_oldest_entries_go_first() -> void:
	var cache := ResponseCache.new()
	for index: int in ResponseCache.MAX_ENTRIES + 3:
		cache.store("/v2/bodies/b%d" % index, "t", "{}")
	assert_int(cache.size()).is_equal(ResponseCache.MAX_ENTRIES)
	assert_str(cache.lookup("/v2/bodies/b0", "t")).is_equal("")
	assert_str(cache.lookup("/v2/bodies/b%d" % (ResponseCache.MAX_ENTRIES + 2), "t")).is_equal("{}")
	cache.clear()
	assert_int(cache.size()).is_equal(0)
