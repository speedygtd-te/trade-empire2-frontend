extends GdUnitTestSuite
## EnterpriseFlagship: status, price with missing amounts, the order and the structure list
## (shapes as the draft.37 server answered them live).


func _none() -> EnterpriseFlagship:
	return EnterpriseFlagship.from_wire({
		"enterpriseId": "3264", "status": "none", "deliveryMs": 259200000.0, "labRunning": false,
		"administrations": 0.0, "memberCap": 5.0, "memberCount": 1.0,
		"price": [
			{"resource": "STRUCTURAL_FRAME", "amount": 400000000000.0, "available": 0.0, "missing": 400000000000.0},
			{"resource": "FUSION_FUEL", "amount": 50000000000.0, "available": 50000000000.0, "missing": 0.0},
		],
	})


func test_reads_an_offer() -> void:
	var view := _none()

	assert_str(view.enterprise_id).is_equal("3264")
	assert_str(view.status).is_equal(EnterpriseFlagship.NONE)
	assert_int(view.delivery_ms).is_equal(259200000)
	assert_int(view.member_cap).is_equal(5)
	assert_int(view.price.size()).is_equal(2)
	assert_int(view.price[0].missing).is_equal(400000000000)
	assert_int(view.total_price()).is_equal(450000000000)
	assert_bool(view.can_order()).is_true()
	assert_bool(view.affordable()).is_false()
	assert_int(view.missing_items().size()).is_equal(1)


func test_order_blockers_in_order() -> void:
	var view := _none()

	assert_str(view.order_blocker(false, "b")).is_equal("right")
	assert_str(view.order_blocker(true, "b")).is_equal("stock")
	view.price[0].missing = 0
	assert_str(view.order_blocker(true, "")).is_equal("body")
	assert_str(view.order_blocker(true, "b")).is_equal("")
	view.status = EnterpriseFlagship.ACTIVE
	assert_str(view.order_blocker(true, "b")).is_equal("exists")


func test_destroyed_can_be_ordered_again() -> void:
	var view := EnterpriseFlagship.from_wire({"status": "destroyed", "destroyedAt": 5.0})

	assert_bool(view.can_order()).is_true()
	assert_int(view.destroyed_at).is_equal(5)


func test_countdown_of_an_order() -> void:
	var view := EnterpriseFlagship.from_wire({"status": "ordered", "orderedAt": 1000.0, "deliversAt": 3000.0,
		"bodyId": "planet-1"})

	assert_str(view.body_id).is_equal("planet-1")
	assert_int(view.remaining_ms(1500)).is_equal(1500)
	assert_int(view.remaining_ms(9000)).is_equal(0)
	assert_float(view.delivery_progress(2000)).is_equal_approx(0.5, 0.001)
	assert_bool(view.can_order()).is_false()


func test_order_body_and_refused_missing() -> void:
	assert_dict(EnterpriseFlagship.order_body("planet-1")).is_equal({"bodyId": "planet-1"})
	var missing := EnterpriseFlagship.missing_from_details({"missing": [
		{"missing": 1000000.0, "resource": "FUSION_FUEL"}]})
	assert_dict(missing).is_equal({"FUSION_FUEL": 1000000})

	var view := _none()
	view.apply_missing(missing)

	assert_int(view.price[0].missing).is_equal(0)
	assert_int(view.price[1].missing).is_equal(1000000)
	assert_int(view.price[1].available).is_equal(49999000000)


func test_structures_flagship_first() -> void:
	var refs := EnterpriseFlagship.structures_from_wire({"structures": [
		{"structureId": 9.0, "name": "Tender", "flagship": false},
		{"structureId": 12.0, "name": "Flagship", "flagship": true},
		{"structureId": 0.0, "name": "broken"},
	]})

	assert_int(refs.size()).is_equal(2)
	assert_int(refs[0].structure_id).is_equal(12)
	assert_bool(refs[0].flagship).is_true()
	assert_str(refs[1].name).is_equal("Tender")
