extends GdUnitTestSuite
## EnterpriseFactory: lines, recipes, the draft and the PUT body.


func _factory() -> EnterpriseFactory:
	return EnterpriseFactory.from_wire({
		"enterpriseId": "7", "at": 0.0, "maxLines": 4.0,
		"lines": [{"blueprint": "DOCK_MFG", "item": "HULL_ENTERPRISE_DOCK", "quantity": 4.0, "produced": 1500000.0,
			"startedAt": 0.0}],
		"recipes": [
			{"blueprint": "DOCK_MFG", "item": "HULL_ENTERPRISE_DOCK", "unitsPerHour": 30000000.0, "unlocked": true,
				"inputs": [{"resource": "MOTOR", "amount": 15000000.0}]},
			{"blueprint": "ADMIN_MFG", "item": "ENTERPRISE_ADMINISTRATION_MODULE", "unitsPerHour": 2000000.0, "unlocked": true},
			{"blueprint": "ARMOR_MFG", "item": "ENTERPRISE_ARMOR_MODULE", "unitsPerHour": 8000000.0, "unlocked": false,
				"tech": "ET_ARMORED_CONSTRUCTION"},
		],
	})


func test_reads_lines_and_recipes() -> void:
	var factory := _factory()

	assert_int(factory.max_lines).is_equal(4)
	assert_int(factory.lines[0].quantity).is_equal(4)
	assert_int(EnterpriseFactory.pieces_done(factory.lines[0], 1000000)).is_equal(1)
	assert_float(EnterpriseFactory.progress(factory.lines[0], 1000000)).is_equal_approx(0.375, 0.001)
	assert_str(factory.recipe("ARMOR_MFG").tech).is_equal("ET_ARMORED_CONSTRUCTION")
	assert_int(factory.recipe("DOCK_MFG").inputs[0][1]).is_equal(15000000)


func test_offers_only_unlocked_recipes_by_name() -> void:
	var offered := _factory().offered(func(key: String) -> String: return key)

	assert_int(offered.size()).is_equal(2)
	assert_str(offered[0].blueprint).is_equal("ADMIN_MFG")


func test_draft_problems() -> void:
	var factory := _factory()
	var ok: Array[Array] = [["DOCK_MFG", 4], ["ADMIN_MFG", 2]]
	var twice: Array[Array] = [["DOCK_MFG", 4], ["DOCK_MFG", 2]]
	var zero: Array[Array] = [["DOCK_MFG", 0]]
	var locked: Array[Array] = [["ARMOR_MFG", 1]]
	var many: Array[Array] = [["A", 1], ["B", 1], ["C", 1], ["D", 1], ["E", 1]]

	assert_str(factory.draft_problem(ok)).is_equal("")
	assert_str(factory.draft_problem(twice)).is_equal("twice")
	assert_str(factory.draft_problem(zero)).is_equal("quantity")
	assert_str(factory.draft_problem(locked)).is_equal("locked")
	assert_str(factory.draft_problem(many)).is_equal("lines")


func test_draft_differs_and_body_has_integers() -> void:
	var factory := _factory()
	var same := factory.draft()
	var more: Array[Array] = [["DOCK_MFG", 5]]

	assert_bool(factory.differs(same)).is_false()
	assert_bool(factory.differs(more)).is_true()
	var body := EnterpriseFactory.body(more)
	var row: Dictionary = (body["lines"] as Array)[0]
	assert_str(row["blueprint"]).is_equal("DOCK_MFG")
	assert_int(typeof(row["quantity"])).is_equal(TYPE_INT)
	assert_str(JSON.stringify(body)).is_equal('{"lines":[{"blueprint":"DOCK_MFG","quantity":5}]}')
