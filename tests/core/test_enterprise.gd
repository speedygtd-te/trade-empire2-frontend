extends GdUnitTestSuite
## Enterprise: the view, list, suggestions and the rules that pick the offered actions.


## An EnterpriseView as the founder "10" sees it (numbers as floats, as Godot parses them).
func _view(me_roles: Array, me_flags: Array) -> Dictionary:
	return {
		"enterpriseId": "7", "name": "Zenith Zardyne", "ticker": "ZZAR", "description": "Ore and more",
		"joinMode": "closed", "memberCount": 3.0, "foundedAt": 1000.0, "founderId": "10",
		"faction": "enterprise-7",
		"logo": {"status": "pending", "key": "ab", "url": "/assets/enterprise/_default.webp",
			"urls": {"64": "/assets/enterprise/_default-64.webp", "128": "/assets/enterprise/_default-128.webp",
				"256": "/assets/enterprise/_default.webp"}},
		"members": [
			{"playerId": "10", "playerName": "Ada", "joinedAt": 1000.0, "roleIds": ["1"]},
			{"playerId": "11", "playerName": "Bo", "joinedAt": 2000.0, "roleIds": ["2"]},
			{"playerId": "12", "playerName": "Cy", "joinedAt": 3000.0, "roleIds": []},
		],
		"roles": [
			{"roleId": "1", "name": "Founder", "flags": Array(Enterprise.FLAGS), "system": true, "memberCount": 1.0},
			{"roleId": "2", "name": "Officer", "flags": ["MANAGE_MEMBERS"], "system": false, "memberCount": 1.0},
			{"roleId": "3", "name": "Diplomat", "flags": ["SET_DIPLOMACY", "MANAGE_ROLES"], "system": false, "memberCount": 0.0},
		],
		"invites": [{"playerId": "20", "playerName": "Dee"}],
		"applications": [{"playerId": "21", "playerName": "Eve"}],
		"me": {"roleIds": me_roles, "flags": me_flags},
		"invited": false, "applied": false,
	}


func _founder() -> Enterprise:
	return Enterprise.from_wire(_view(["1"], Array(Enterprise.FLAGS)))


func _officer() -> Enterprise:
	return Enterprise.from_wire(_view(["2"], ["MANAGE_MEMBERS", "MANAGE_ROLES"]))


func test_reads_the_view() -> void:
	var view := _founder()

	assert_str(view.enterprise_id).is_equal("7")
	assert_str(view.ticker).is_equal("ZZAR")
	assert_int(view.member_count).is_equal(3)
	assert_int(view.founded_at).is_equal(1000)
	assert_str(view.founder_id).is_equal("10")
	assert_str(view.faction).is_equal("enterprise-7")
	assert_int(view.members.size()).is_equal(3)
	assert_array(Array(view.members[1].role_ids)).is_equal(["2"])
	assert_int(view.roles.size()).is_equal(3)
	assert_bool(view.roles[0].system).is_true()
	assert_bool(view.roles[1].has_flag("MANAGE_MEMBERS")).is_true()
	assert_bool(view.roles[1].has_flag("DISSOLVE")).is_false()
	assert_str(view.invites[0].player_name).is_equal("Dee")
	assert_str(view.applications[0].player_id).is_equal("21")
	assert_bool(view.is_member).is_true()
	assert_bool(view.is_open()).is_false()
	assert_bool(view.has_flag("SET_TAX")).is_true()


func test_a_view_without_me_is_no_membership() -> void:
	var data := _view([], [])
	data.erase("me")
	data.erase("roles")
	data["invited"] = true
	data["joinMode"] = "open"

	var view := Enterprise.from_wire(data)

	assert_bool(view.is_member).is_false()
	assert_bool(view.invited).is_true()
	assert_bool(view.is_open()).is_true()
	assert_bool(view.is_founder()).is_false()
	assert_int(view.roles.size()).is_equal(0)


func test_logo_sizes_and_status() -> void:
	var logo := Enterprise.Logo.from_wire({"status": "ready", "url": "/assets/e/a.webp",
		"urls": {"64": "/assets/e/a-64.webp", "128": "/assets/e/a-128.webp", "256": "/assets/e/a.webp"}})

	assert_str(logo.url_for(48)).is_equal("/assets/e/a-64.webp")
	assert_str(logo.url_for(100)).is_equal("/assets/e/a-128.webp")
	assert_str(logo.url_for(512)).is_equal("/assets/e/a.webp")
	assert_bool(logo.is_pending()).is_false()
	assert_bool(_founder().logo.is_pending()).is_true()
	assert_str(Enterprise.Logo.from_wire({}).url_for(64)).is_empty()


func test_reads_a_list_page() -> void:
	var page := Enterprise.page_from_wire({"items": [
		{"enterpriseId": "7", "name": "Zenith", "ticker": "ZZAR", "joinMode": "open", "memberCount": 2.0,
			"foundedAt": 5.0, "logo": {"status": "ready", "url": "/x.webp", "urls": {}}},
		{"name": "no id"},
	], "nextCursor": "c2"})

	assert_int(page.items.size()).is_equal(1)
	assert_str(page.items[0].enterprise_id).is_equal("7")
	assert_bool(page.items[0].is_open()).is_true()
	assert_int(page.items[0].member_count).is_equal(2)
	assert_str(page.items[0].logo.url).is_equal("/x.webp")
	assert_str(page.next_cursor).is_equal("c2")
	var summary := Enterprise.Summary.from_wire({"enterpriseId": "8", "joinMode": "closed"})
	assert_bool(summary.is_open()).is_false()


func test_suggestions_keep_their_components_as_integers() -> void:
	var data := Wire.parse_object('{"suggestions":[{"components":{"adj":-1,"csuffix":0,"noun":-1,"root":14,'
		+ '"shape":0,"suffix":-1,"variation":0},"name":"Zylarix","ticker":"ZYLA"}]}')

	var suggestions := Enterprise.suggestions_from_wire(data)
	var body := Enterprise.found_body(suggestions[0], "  Ore  ", false)

	assert_int(suggestions.size()).is_equal(1)
	assert_str(suggestions[0].ticker).is_equal("ZYLA")
	assert_int(typeof(suggestions[0].components["root"])).is_equal(TYPE_INT)
	# Real integers, so JSON writes 14 and not 14.0.
	assert_str(JSON.stringify(body["components"])).contains('"root":14')
	assert_str(JSON.stringify(body["components"])).not_contains(".0")
	assert_str(body["joinMode"]).is_equal("closed")
	assert_str(body["description"]).is_equal("  Ore  ")


func test_role_body_orders_flags_and_leaves_them_out_for_the_founder_role() -> void:
	var body := Enterprise.role_body("  Officer ", PackedStringArray(["SET_TAX", "MANAGE_MEMBERS", "BOGUS"]))
	var founder := Enterprise.role_body("Boss", PackedStringArray(["SET_TAX"]), true)

	assert_str(body["name"]).is_equal("Officer")
	assert_array(body["flags"]).is_equal(["MANAGE_MEMBERS", "SET_TAX"])
	assert_bool(founder.has("flags")).is_false()


func test_factions() -> void:
	assert_str(Enterprise.faction_of("7")).is_equal("enterprise-7")
	assert_str(Enterprise.id_of_faction("enterprise-7")).is_equal("7")
	assert_str(Enterprise.id_of_faction("player-7")).is_empty()


func test_lookups() -> void:
	var view := _founder()

	assert_bool(view.is_founder()).is_true()
	assert_str(view.role("2").name).is_equal("Officer")
	assert_object(view.role("99")).is_null()
	assert_str(view.member("11").player_name).is_equal("Bo")
	assert_object(view.member("20")).is_null()
	assert_str(view.player_name("12")).is_equal("Cy")
	assert_str(view.player_name("20")).is_equal("Dee")
	assert_str(view.player_name("21")).is_equal("Eve")
	assert_str(view.player_name("99")).is_empty()
	assert_int(view.roles_of("11").size()).is_equal(1)
	assert_int(view.roles_of("12").size()).is_equal(0)
	assert_int(view.founder_count()).is_equal(1)


func test_granting_needs_manage_roles_and_every_right_of_the_role() -> void:
	var founder := _founder()
	var officer := _officer()

	assert_bool(founder.can_grant(founder.role("1"))).is_true()
	assert_bool(founder.can_grant(founder.role("3"))).is_true()
	assert_bool(officer.can_grant(officer.role("2"))).is_true()
	# The diplomat role carries SET_DIPLOMACY, which the officer lacks.
	assert_bool(officer.can_grant(officer.role("3"))).is_false()
	# Only founders hand out the founder role.
	assert_bool(officer.can_grant(officer.role("1"))).is_false()
	assert_bool(officer.can_grant(null)).is_false()
	var plain := Enterprise.from_wire(_view(["2"], ["MANAGE_MEMBERS"]))
	assert_bool(plain.can_grant(plain.role("2"))).is_false()


func test_the_founder_role_keeps_a_holder() -> void:
	var founder := _founder()

	assert_bool(founder.can_revoke(founder.role("1"), "10")).is_false()
	assert_bool(founder.can_revoke(founder.role("2"), "11")).is_true()
	assert_bool(founder.can_revoke(founder.role("2"), "12")).is_false()
	var data := _view(["1"], Array(Enterprise.FLAGS))
	(data["members"] as Array)[1]["roleIds"] = ["1", "2"]
	var two := Enterprise.from_wire(data)
	assert_bool(two.can_revoke(two.role("1"), "10")).is_true()


func test_kicking() -> void:
	var founder := _founder()
	var officer := Enterprise.from_wire(_view(["2"], ["MANAGE_MEMBERS"]))

	assert_bool(founder.can_kick("11", "10")).is_true()
	assert_bool(founder.can_kick("10", "10")).is_false()
	assert_bool(founder.can_kick("99", "10")).is_false()
	assert_bool(officer.can_kick("12", "11")).is_true()
	# A founder only by a founder.
	assert_bool(officer.can_kick("10", "11")).is_false()
	var nobody := Enterprise.from_wire(_view([], []))
	assert_bool(nobody.can_kick("12", "11")).is_false()


func test_the_last_founder_cannot_leave_while_others_stay() -> void:
	assert_bool(_founder().leave_blocked()).is_true()
	assert_bool(_officer().leave_blocked()).is_false()
	var data := _view(["1"], Array(Enterprise.FLAGS))
	data["members"] = [(data["members"] as Array)[0]]
	assert_bool(Enterprise.from_wire(data).leave_blocked()).is_false()


func test_grantable_rights_and_editable_roles() -> void:
	var officer := _officer()

	assert_array(Array(officer.grantable_flags())).is_equal(["MANAGE_MEMBERS", "MANAGE_ROLES"])
	assert_bool(officer.can_edit_role(officer.role("2"))).is_true()
	assert_bool(officer.can_edit_role(officer.role("3"))).is_false()
	# The founder role can be renamed by anyone with MANAGE_ROLES; its rights stay fixed.
	assert_bool(officer.can_edit_role(officer.role("1"))).is_true()
	assert_bool(Enterprise.from_wire(_view([], [])).can_edit_role(officer.role("2"))).is_false()


func test_strings_and_players_of_json_arrays() -> void:
	assert_array(Array(Enterprise.strings(["a", 3.0, "", "b"]))).is_equal(["a", "b"])
	assert_array(Array(Enterprise.strings("x"))).is_empty()
	var refs := Enterprise.players([{"playerId": "4", "playerName": "Ann"}, {"playerName": "no id"}])
	assert_int(refs.size()).is_equal(1)
	assert_str(refs[0].player_name).is_equal("Ann")
