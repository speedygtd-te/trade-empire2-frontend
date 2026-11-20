extends GdUnitTestSuite

const TREASURY: PackedStringArray = ["MANAGE_TREASURY"]
const FLEET: PackedStringArray = ["COMMAND_ENTERPRISE_FLEET"]
const NONE: PackedStringArray = []


func test_own_structures_need_no_right() -> void:
	assert_str(EnterpriseStructures.build_reason("player", NONE, false)).is_empty()
	assert_str(EnterpriseStructures.manage_reason("player", NONE)).is_empty()
	assert_str(EnterpriseStructures.command_reason("player", NONE)).is_empty()


func test_building_at_the_enterprise_needs_the_treasury_and_a_flagship() -> void:
	assert_str(EnterpriseStructures.build_reason("enterprise", NONE, true)).is_equal(EnterpriseStructures.NEEDS_TREASURY)
	assert_str(EnterpriseStructures.build_reason("enterprise", FLEET, true)).is_equal(EnterpriseStructures.NEEDS_TREASURY)
	assert_str(EnterpriseStructures.build_reason("enterprise", TREASURY, false)).is_equal(EnterpriseStructures.NO_FLAGSHIP)
	assert_str(EnterpriseStructures.build_reason("enterprise", TREASURY, true)).is_empty()


func test_managing_needs_the_treasury_and_travel_the_fleet_right() -> void:
	assert_str(EnterpriseStructures.manage_reason("enterprise", FLEET)).is_equal(EnterpriseStructures.NEEDS_TREASURY)
	assert_str(EnterpriseStructures.manage_reason("enterprise", TREASURY)).is_empty()
	assert_str(EnterpriseStructures.command_reason("enterprise", TREASURY)).is_equal(EnterpriseStructures.NEEDS_FLEET)
	assert_str(EnterpriseStructures.command_reason("enterprise", FLEET)).is_empty()


func test_structure_ops_for_the_enterprise_and_away_from_a_surface() -> void:
	assert_bool(EnterpriseStructures.uses_structure_ops("player", "surface")).is_false()
	assert_bool(EnterpriseStructures.uses_structure_ops("player", "free")).is_true()
	assert_bool(EnterpriseStructures.uses_structure_ops("enterprise", "surface")).is_true()


func test_local_ops_subtract_the_offset_and_keep_the_rest() -> void:
	var ops: Array[Dictionary] = [{"op": "placeHull", "hullType": "ENTERPRISE_DOCK", "x": 12, "y": -3, "z": 1}]
	var local := EnterpriseStructures.local_ops(ops, Vector3i(10, -5, 0))

	assert_dict(local[0]).is_equal({"op": "placeHull", "hullType": "ENTERPRISE_DOCK", "x": 2, "y": 2, "z": 1})
	assert_int(ops[0]["x"]).is_equal(12)
	assert_int(typeof(local[0]["x"])).is_equal(TYPE_INT)


func test_created_structures_come_from_the_results() -> void:
	var data := Wire.parse_object('{"results":[{"index":0,"ok":true,"kind":"hullPlaced","structureId":77,"created":true},'
		+ '{"index":1,"ok":true,"kind":"hullPlaced","structureId":77,"created":false},'
		+ '{"index":2,"ok":true,"kind":"hullPlaced","structureId":5}]}')

	assert_array(EnterpriseStructures.created_structures(data)).contains_exactly([77])
	assert_array(EnterpriseStructures.created_structures({})).is_empty()


func test_members_dock_at_enterprise_docks_the_enterprise_only_at_its_own() -> void:
	assert_bool(EnterpriseStructures.may_dock("player", "player", false)).is_true()
	assert_bool(EnterpriseStructures.may_dock("player", "enterprise", true)).is_true()
	assert_bool(EnterpriseStructures.may_dock("player", "enterprise", false)).is_false()
	assert_bool(EnterpriseStructures.may_dock("enterprise", "enterprise", true)).is_true()
	assert_bool(EnterpriseStructures.may_dock("enterprise", "player", true)).is_false()


func test_store_note_tells_flagship_and_daughter_apart() -> void:
	assert_str(EnterpriseStructures.store_note("player", false)).is_empty()
	assert_str(EnterpriseStructures.store_note("enterprise", true)).is_equal("STORE_ENTERPRISE_INVENTORY")
	assert_str(EnterpriseStructures.store_note("enterprise", false)).is_equal("STORE_ENTERPRISE_TOPPED_UP")


func test_a_fleet_may_not_mix_owners() -> void:
	assert_bool(EnterpriseStructures.is_mixed(["player", "player"])).is_false()
	assert_bool(EnterpriseStructures.is_mixed(["enterprise", "enterprise"])).is_false()
	assert_bool(EnterpriseStructures.is_mixed(["enterprise", "player"])).is_true()
	assert_bool(EnterpriseStructures.is_mixed([])).is_false()


func test_reasons_map_to_server_codes_and_texts() -> void:
	assert_str(EnterpriseStructures.error_code(EnterpriseStructures.NEEDS_TREASURY)).is_equal("MISSING_FLAG")
	assert_str(EnterpriseStructures.error_code(EnterpriseStructures.NEEDS_FLEET)).is_equal("MISSING_FLAG")
	assert_str(EnterpriseStructures.error_code(EnterpriseStructures.NO_FLAGSHIP)).is_equal("FLAGSHIP_NOT_FOUND")
	assert_str(EnterpriseStructures.error_code(EnterpriseStructures.OK)).is_empty()
	assert_str(EnterpriseStructures.reason_key(EnterpriseStructures.NO_FLAGSHIP)).is_equal("ENTERPRISE_NEEDS_FLAGSHIP")
	assert_str(EnterpriseStructures.reason_key(EnterpriseStructures.OK)).is_empty()
