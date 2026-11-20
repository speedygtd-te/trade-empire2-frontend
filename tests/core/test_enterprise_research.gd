extends GdUnitTestSuite
## EnterpriseResearch: the tree, states, locked reasons, the running research and its pause.


func _tree(running: Dictionary = {}) -> EnterpriseResearch:
	var data := {
		"enterpriseId": "7", "at": 1000.0,
		"techs": [
			{"key": "ET_LIFE_SCIENCES", "name": "Life Sciences", "tier": 1.0, "prerequisites": [],
				"cost": [{"resource": "GLASS", "amount": 200000000000.0}], "durationMs": 43200000.0,
				"unlocks": ["ENTERPRISE_HABITAT_T1_MANUFACTURING"], "available": false, "researchedAt": 500.0},
			{"key": "ET_ADVANCED_HABITATION", "name": "Advanced Habitation", "tier": 2.0,
				"prerequisites": ["ET_LIFE_SCIENCES"], "cost": [], "durationMs": 10000.0, "unlocks": [], "available": true},
			{"key": "ET_ELITE_HABITATION", "name": "Elite Habitation", "tier": 3.0,
				"prerequisites": ["ET_ADVANCED_HABITATION"], "cost": [], "durationMs": 20000.0, "unlocks": [], "available": false},
		],
	}
	if not running.is_empty():
		data["running"] = running
	return EnterpriseResearch.from_wire(data)


func test_reads_the_tree() -> void:
	var tree := _tree()

	assert_int(tree.techs.size()).is_equal(3)
	assert_int(tree.in_tier(2).size()).is_equal(1)
	assert_object(tree.running).is_null()
	var first := tree.tech("ET_LIFE_SCIENCES")
	assert_int(first.cost[0][1]).is_equal(200000000000)
	assert_str(first.unlocks[0]).is_equal("ENTERPRISE_HABITAT_T1_MANUFACTURING")


func test_states_and_missing_prerequisites() -> void:
	var tree := _tree()

	assert_int(tree.state_of("ET_LIFE_SCIENCES")).is_equal(EnterpriseResearch.State.RESEARCHED)
	assert_int(tree.state_of("ET_ADVANCED_HABITATION")).is_equal(EnterpriseResearch.State.AVAILABLE)
	assert_int(tree.state_of("ET_ELITE_HABITATION")).is_equal(EnterpriseResearch.State.LOCKED)
	assert_array(Array(tree.missing_prerequisites("ET_ELITE_HABITATION"))).contains_exactly(["ET_ADVANCED_HABITATION"])
	assert_array(Array(tree.missing_prerequisites("ET_ADVANCED_HABITATION"))).is_empty()


func test_start_blockers() -> void:
	var tree := _tree()

	assert_str(tree.start_blocker("ET_ADVANCED_HABITATION", true, true)).is_equal("")
	assert_str(tree.start_blocker("ET_ADVANCED_HABITATION", false, true)).is_equal("right")
	assert_str(tree.start_blocker("ET_ADVANCED_HABITATION", true, false)).is_equal("flagship")
	assert_str(tree.start_blocker("ET_LIFE_SCIENCES", true, true)).is_equal("done")
	assert_str(tree.start_blocker("ET_ELITE_HABITATION", true, true)).is_equal("locked")
	assert_dict(EnterpriseResearch.start_body("ET_X")).is_equal({"tech": "ET_X"})


func test_running_counts_down_only_while_the_lab_works() -> void:
	var running := _tree({"tech": "ET_ADVANCED_HABITATION", "startedAt": 0.0, "remainingMs": 6000.0, "running": true})
	var paused := _tree({"tech": "ET_ADVANCED_HABITATION", "startedAt": 0.0, "remainingMs": 6000.0, "running": false})

	assert_int(running.state_of("ET_ADVANCED_HABITATION")).is_equal(EnterpriseResearch.State.RUNNING)
	assert_int(running.remaining_at(3000)).is_equal(4000)
	assert_float(running.progress_at(3000)).is_equal_approx(0.6, 0.001)
	assert_int(paused.remaining_at(3000)).is_equal(6000)
	assert_str(running.start_blocker("ET_ELITE_HABITATION", true, true)).is_equal("locked")
	assert_str(running.start_blocker("ET_ADVANCED_HABITATION", true, true)).is_equal("busy")


func test_shortfall_against_the_inventory() -> void:
	var stock := EnterpriseTaxes.Stock.from_wire({"at": 0.0, "items": [
		{"resource": "GLASS", "value": 100.0, "ratePerHour": 0.0}]})
	var cost: Array[Array] = [["GLASS", 150], ["PLASTIC", 10]]

	assert_dict(EnterpriseResearch.shortfall(cost, stock, 0)).is_equal({"GLASS": 50, "PLASTIC": 10})
