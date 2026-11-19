extends GdUnitTestSuite
## EnterpriseLog: one page, unknown kinds skipped, the query for older pages.


func test_reads_entries_and_skips_unknown_kinds() -> void:
	var page := EnterpriseLog.from_wire({"more": true, "entries": [
		{"seq": 9.0, "gameTime": 900.0, "rev": 50.0, "kind": "taxRate", "actorId": "10", "resource": "IRON",
			"percent": 10.0, "effectiveAt": 87000.0},
		{"seq": 8.0, "gameTime": 800.0, "rev": 49.0, "kind": "somethingNew"},
		{"seq": 7.0, "gameTime": 700.0, "rev": 48.0, "kind": "diplomacy", "actorId": "10",
			"faction": "enterprise-3", "value": "allianceProposed"},
		{"seq": 6.0, "gameTime": 600.0, "rev": 47.0, "kind": "roleAssigned", "actorId": "10", "playerId": "11",
			"roleId": "2"},
	]})

	assert_int(page.entries.size()).is_equal(3)
	assert_str(page.entries[0].kind).is_equal("taxRate")
	assert_str(page.entries[0].resource).is_equal("IRON")
	assert_int(page.entries[0].percent).is_equal(10)
	assert_int(page.entries[0].effective_at).is_equal(87000)
	assert_int(page.entries[0].game_time_ms).is_equal(900)
	assert_str(page.entries[1].faction).is_equal("enterprise-3")
	assert_str(page.entries[1].value).is_equal("allianceProposed")
	assert_str(page.entries[2].player_id).is_equal("11")
	assert_str(page.entries[2].role_id).is_equal("2")
	assert_str(page.entries[2].actor_id).is_equal("10")
	# The oldest seq counts unknown entries too, so paging does not repeat them.
	assert_int(page.oldest).is_equal(6)
	assert_bool(page.more).is_true()


func test_empty_page() -> void:
	var page := EnterpriseLog.from_wire({"entries": [], "more": false})

	assert_int(page.entries.size()).is_equal(0)
	assert_int(page.oldest).is_equal(0)
	assert_bool(page.more).is_false()


func test_query() -> void:
	assert_str(EnterpriseLog.query(0, 50)).is_equal("?limit=50")
	assert_str(EnterpriseLog.query(42, 500)).is_equal("?limit=200&before=42")
