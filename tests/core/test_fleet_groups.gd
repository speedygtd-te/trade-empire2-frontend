extends GdUnitTestSuite
## FleetGroups: the player's fleets (draft.33) from the list, answers and events, the quote of a
## joint flight and the request bodies.


static func view(id: int, members: Array = [2, 5], command: Variant = null) -> Dictionary:
	var rows: Array = []
	for member: int in members:
		rows.append({"structureId": float(member), "name": "Ship %d" % member, "moving": command != null,
			"mass": 4000000.0})
	return {"fleetId": float(id), "name": "Fleet %d" % id, "ownerId": "9007199254740993", "createdAt": 1000.0,
		"stance": "peaceful", "intent": "destroy", "members": rows,
		"location": null if command != null else {"bodyId": "p1"}, "command": command,
		"inventory": [{"resource": "HYDROGEN", "selfUse": 50000000.0, "inTransport": 2000000.0}]}


static func flight(arrival: int) -> Dictionary:
	return {"type": "travel", "target": {"type": "orbit", "bodyId": "m1"}, "departAt": 1000.0, "arrivalAt": float(arrival)}


func _structures() -> Fleet:
	var structures := Fleet.new()
	structures.apply_list([
		{"structureId": 1, "name": "Home", "kind": "base", "capabilities": [],
			"anchor": {"type": "surface", "bodyId": "p1", "offset": {"x": 0, "y": 0, "z": 0}}},
		{"structureId": 2, "name": "Ship 2", "kind": "ship", "capabilities": ["SPACE_DRIVE"],
			"anchor": {"type": "docked", "hostId": 1, "offset": {"x": 2, "y": 0, "z": 1}}},
		{"structureId": 3, "name": "Ship 3", "kind": "ship", "capabilities": ["SPACE_DRIVE"],
			"anchor": {"type": "free", "kind": "orbit", "bodyId": "p1"}},
		{"structureId": 4, "name": "Rover", "kind": "vehicle", "capabilities": ["GROUND_DRIVE"],
			"anchor": {"type": "surface", "bodyId": "p1", "offset": {"x": 9, "y": 0, "z": 0}}},
		{"structureId": 5, "name": "Ship 5", "kind": "ship", "capabilities": ["SPACE_DRIVE"],
			"anchor": {"type": "free", "kind": "orbit", "bodyId": "p1"}},
		{"structureId": 6, "name": "Ship 6", "kind": "ship", "capabilities": ["SPACE_DRIVE"],
			"anchor": {"type": "free", "kind": "orbit", "bodyId": "m1"}},
		{"structureId": 7, "name": "Ship 7", "kind": "ship", "capabilities": ["SPACE_DRIVE"],
			"anchor": {"type": "free", "kind": "orbit", "bodyId": "p1"}},
	])
	return structures


func test_a_fleet_view_is_read_whole() -> void:
	var group := FleetGroups.Group.from_wire(view(11))

	assert_int(group.fleet_id).is_equal(11)
	assert_str(group.name).is_equal("Fleet 11")
	assert_str(group.owner_id).is_equal("9007199254740993")
	assert_int(group.created_at).is_equal(1000)
	assert_array(Array(group.member_ids())).is_equal([2, 5])
	assert_bool(group.has_member(5)).is_true()
	assert_bool(group.has_member(3)).is_false()
	assert_str(group.member(2).name).is_equal("Ship 2")
	assert_int(group.member(2).mass).is_equal(4000000)
	assert_bool(group.is_together()).is_true()
	assert_str(group.location_body_id).is_equal("p1")
	assert_bool(group.has_command()).is_false()
	assert_bool(group.is_aggressive()).is_false()
	assert_str(group.intent).is_equal(FleetGroups.INTENT_DESTROY)
	assert_int(group.supply_of("HYDROGEN")).is_equal(50000000)
	assert_int(group.supply_of("METHANE")).is_equal(0)
	assert_int(group.inventory[0].in_transport).is_equal(2000000)
	assert_object(FleetGroups.Group.from_wire({"name": "no id"})).is_null()
	assert_object(FleetGroups.Group.from_wire("nonsense")).is_null()


func test_a_flight_has_times_progress_and_a_target() -> void:
	var group := FleetGroups.Group.from_wire(view(11, [2, 5], flight(5000)))

	assert_bool(group.has_command()).is_true()
	assert_bool(group.is_together()).is_false()
	assert_str(group.target_body_id()).is_equal("m1")
	assert_bool(group.is_travelling(3000)).is_true()
	assert_bool(group.is_travelling(5000)).is_false()
	assert_int(group.remaining_ms(3000)).is_equal(2000)
	assert_int(group.remaining_ms(9000)).is_equal(0)
	assert_float(group.progress_at(3000)).is_equal_approx(0.5, 0.0001)
	assert_float(group.progress_at(0)).is_equal(0.0)
	assert_float(group.progress_at(6000)).is_equal(1.0)
	assert_bool(group.member(2).moving).is_true()
	var resting := FleetGroups.Group.from_wire(view(12))
	assert_int(resting.remaining_ms(3000)).is_equal(0)
	assert_float(resting.progress_at(3000)).is_equal(0.0)


func test_the_book_follows_list_answers_and_events() -> void:
	var book := FleetGroups.new()
	book.apply_list([view(12), view(11, [3]), {"bad": true}])

	assert_int(book.size()).is_equal(2)
	assert_array(book.groups().map(func(group: FleetGroups.Group) -> int: return group.fleet_id)).is_equal([11, 12])
	assert_int(book.of_structure(3).fleet_id).is_equal(11)
	assert_int(book.of_structure(5).fleet_id).is_equal(12)
	assert_object(book.of_structure(4)).is_null()

	assert_bool(book.apply_event("fleet.departed", {"fleet": view(12, [2, 5], flight(9000)), "gameTime": 1000.0})).is_true()
	assert_bool(book.find(12).has_command()).is_true()
	assert_bool(book.apply_event("fleet.arrived", {"fleet": view(12, [2, 5, 7]), "gameTime": 9000.0})).is_true()
	assert_bool(book.find(12).has_command()).is_false()
	assert_int(book.of_structure(7).fleet_id).is_equal(12)
	assert_bool(book.apply_event("fleet.updated", {"fleet": {}})).is_false()
	assert_bool(book.apply_event("fleet.dissolved", {"fleetId": 11.0, "gameTime": 1.0})).is_true()
	assert_bool(book.apply_event("fleet.dissolved", {"fleetId": 11.0})).is_false()
	assert_bool(book.apply_event("travel.started", {"structureId": 2.0})).is_false()
	assert_int(book.size()).is_equal(1)

	book.put(FleetGroups.Group.from_wire(view(13, [3])))
	book.put(null)
	assert_int(book.size()).is_equal(2)
	book.apply_answer({"fleetId": 13.0, "dissolved": true})
	assert_object(book.find(13)).is_null()
	book.apply_answer(view(12, [2]))
	assert_array(Array(book.find(12).member_ids())).is_equal([2])
	assert_bool(book.remove(12)).is_true()
	assert_bool(book.remove(12)).is_false()


func test_candidates_rest_with_a_space_drive_outside_fleets_and_routes() -> void:
	var structures := _structures()
	var book := FleetGroups.new()
	book.apply_list([view(11, [5])])
	structures.find(7).route_id = 4

	var ids := func(entries: Array[Fleet.Entry]) -> Array:
		return entries.map(func(entry: Fleet.Entry) -> int: return entry.structure_id)
	# Ship 2 docked at the home base (p1), 3 in orbit of p1; 5 is a member, 7 drives a route,
	# 6 rests at m1, 4 has no space drive.
	assert_array(ids.call(book.candidates(structures, "p1", 0))).is_equal([2, 3])
	assert_array(ids.call(book.candidates(structures, "", 0))).is_equal([2, 3, 6])
	assert_array(ids.call(book.candidates(structures, "m1", 0))).is_equal([6])
	structures.find(3).motion = TravelMotion.from_wire({"mode": "flight", "departAt": 0, "liftoffAt": 100,
		"cruiseEndAt": 100, "arrivalAt": 100, "frame": "galaxy", "target": {"type": "orbit", "bodyId": "m1"},
		"legs": [{"from": {"x": 0, "y": 0, "z": 0}, "to": {"x": 0, "y": 0, "z": 0}, "start": 0, "end": 100}]})
	assert_array(ids.call(book.candidates(structures, "p1", 50))).is_equal([2])


func test_a_joint_quote_has_pooled_fuel_and_each_members_draw() -> void:
	var quote := FleetGroups.Quote.from_wire({"ok": false, "errors": [], "warpLevel": 1.0, "interstellar": false,
		"distanceNly": 0.0, "departAt": 1000.0, "liftoffAt": 271000.0, "cruiseEndAt": 271000.0, "arrivalAt": 271000.0,
		"slowest": 2.0, "longestLaunch": 5.0,
		"fuel": [{"resource": "HYDROGEN", "amount": 8000000.0, "selfUse": 50000000.0}],
		"members": [
			{"structureId": 2.0, "errors": [], "mass": 4000000.0, "maxMass": 9000000.0, "warpLevel": 1.0,
				"launchMs": 200000.0, "need": [{"resource": "HYDROGEN", "amount": 4000000.0}],
				"fuel": [{"resource": "HYDROGEN", "amount": 8000000.0}]},
			{"structureId": 5.0, "errors": ["INSUFFICIENT_CREW", "DRIVE_UNPOWERED"], "mass": 5000000.0,
				"maxMass": 4000000.0, "warpLevel": 2.0, "launchMs": 270000.0,
				"need": [{"resource": "HYDROGEN", "amount": 4000000.0}], "fuel": []},
		]})

	assert_bool(quote.trip.ok).is_false()
	assert_int(quote.trip.launch_ms()).is_equal(270000)
	assert_int(quote.trip.cruise_ms()).is_equal(0)
	assert_int(quote.trip.fuel[0].amount).is_equal(8000000)
	assert_int(quote.trip.fuel[0].self_use).is_equal(50000000)
	assert_bool(quote.trip.fuel[0].is_short()).is_false()
	assert_int(quote.slowest).is_equal(2)
	assert_int(quote.longest_launch).is_equal(5)
	assert_int(quote.members.size()).is_equal(2)
	assert_int(quote.member(2).draw["HYDROGEN"]).is_equal(8000000)
	assert_bool(quote.member(5).draw.is_empty()).is_true()
	assert_int(quote.member(5).need["HYDROGEN"]).is_equal(4000000)
	assert_int(quote.member(5).warp_level).is_equal(2)
	assert_int(quote.member(5).launch_ms).is_equal(270000)
	assert_int(quote.member(5).max_mass).is_equal(4000000)
	assert_object(quote.member(9)).is_null()
	assert_array(quote.blocked_members().map(func(member: FleetGroups.MemberQuote) -> int: return member.structure_id)).is_equal([5])
	assert_array(Array(quote.member(5).errors)).is_equal(["INSUFFICIENT_CREW", "DRIVE_UNPOWERED"])
	assert_object(FleetGroups.Quote.from_wire({"errors": []})).is_null()


func test_not_ready_names_the_members_and_their_codes() -> void:
	var error := ApiError.from_response(409, JSON.stringify({"error": "FLEET_NOT_READY", "message": "",
		"details": {"members": [{"structureId": 5, "errors": ["NO_SPACE_DRIVE"]}, {"structureId": 0, "errors": []}]}}))

	var blocked := FleetGroups.not_ready_members(error)
	assert_array(blocked.keys()).is_equal([5])
	var codes: PackedStringArray = blocked[5]
	assert_array(Array(codes)).is_equal(["NO_SPACE_DRIVE"])
	assert_bool(FleetGroups.not_ready_members(ApiError.new()).is_empty()).is_true()
	assert_bool(FleetGroups.not_ready_members(null).is_empty()).is_true()


func test_request_bodies_carry_whole_numbers() -> void:
	var create := FleetGroups.create_body("  Vanguard ", PackedInt64Array([2, 5]))
	assert_str(JSON.stringify(create)).contains("[2,5]")
	assert_str(create["name"]).is_equal("Vanguard")
	assert_bool(FleetGroups.create_body("   ", PackedInt64Array([2])).has("name")).is_false()
	assert_str(JSON.stringify(FleetGroups.join_body(7))).is_equal("{\"structureId\":7}")
	assert_dict(FleetGroups.rename_body(" Home guard ")).is_equal({"name": "Home guard"})
	assert_dict(FleetGroups.combat_body("aggressive", "")).is_equal({"stance": "aggressive"})
	assert_dict(FleetGroups.combat_body("", "capture")).is_equal({"intent": "capture"})
	assert_dict(FleetGroups.travel_body("m1")).is_equal({"target": {"type": "orbit", "bodyId": "m1"}})


func test_names_the_server_takes() -> void:
	assert_bool(FleetGroups.is_valid_name("Home Guard-2_b")).is_true()
	assert_bool(FleetGroups.is_valid_name("Flotte Ärger")).is_true()
	assert_bool(FleetGroups.is_valid_name("")).is_false()
	assert_bool(FleetGroups.is_valid_name("   ")).is_false()
	assert_bool(FleetGroups.is_valid_name("a".repeat(41))).is_false()
	assert_bool(FleetGroups.is_valid_name("a".repeat(40))).is_true()
	assert_bool(FleetGroups.is_valid_name("Fleet #1")).is_false()


func test_structures_learn_their_fleet_from_details_and_events() -> void:
	var structures := _structures()
	structures.apply_details({"structureId": 3, "name": "Ship 3", "kind": "ship", "capabilities": ["SPACE_DRIVE"],
		"anchor": {"type": "free", "kind": "orbit", "bodyId": "p1"}, "fleetId": 11.0})
	assert_int(structures.find(3).fleet_id).is_equal(11)

	assert_bool(structures.apply_event("fleet.updated", {"fleet": view(11, [2, 5])})).is_true()
	assert_int(structures.find(2).fleet_id).is_equal(11)
	assert_int(structures.find(5).fleet_id).is_equal(11)
	assert_int(structures.find(3).fleet_id).is_equal(0)
	assert_bool(structures.apply_event("fleet.arrived", {"fleet": view(11, [2, 5])})).is_false()
	assert_bool(structures.set_fleet_members(12, {7: true})).is_true()
	assert_bool(structures.apply_event("fleet.dissolved", {"fleetId": 11.0})).is_true()
	assert_int(structures.find(2).fleet_id).is_equal(0)
	assert_int(structures.find(7).fleet_id).is_equal(12)
	assert_bool(structures.apply_event("fleet.updated", {"fleet": {"name": "x"}})).is_false()


func test_a_fleet_of_the_enterprise_has_another_owner() -> void:
	var own := FleetGroups.Group.from_wire({"fleetId": 1, "ownerId": "42"})
	var enterprise := FleetGroups.Group.from_wire({"fleetId": 2, "ownerId": "9001"})

	assert_bool(own.is_enterprise("42")).is_false()
	assert_bool(enterprise.is_enterprise("42")).is_true()
	assert_bool(enterprise.is_enterprise("")).is_false()


func test_candidates_take_the_enterprise_structures_when_asked() -> void:
	var structures := _structures()
	var flagship := EnterpriseFlagship.StructureRef.new()
	flagship.structure_id = 90
	flagship.flagship = true
	var refs: Array[EnterpriseFlagship.StructureRef] = [flagship]
	structures.apply_enterprise(refs, "e1")
	structures.apply_details({"structureId": 90, "name": "Flagship", "kind": "ship", "capabilities": ["SPACE_DRIVE"],
		"anchor": {"type": "free", "kind": "orbit", "bodyId": "p1"}, "ownerKind": "enterprise", "enterpriseId": "e1"})
	var book := FleetGroups.new()

	var ids := func(entries: Array[Fleet.Entry]) -> Array:
		return entries.map(func(entry: Fleet.Entry) -> int: return entry.structure_id)
	assert_array(ids.call(book.candidates(structures, "p1", 0))).is_equal([2, 3, 5, 7])
	assert_array(ids.call(book.candidates(structures, "p1", 0, true))).is_equal([2, 3, 5, 7, 90])
