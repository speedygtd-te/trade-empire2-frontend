extends GdUnitTestSuite

## A `ResearchResponse` (draft.17) as Godot parses it: numbers are floats.
const ANSWER := {
	"rev": 93.0, "gameTime": 2580669.0,
	"techs": [{"tech": "BASIC_SCHOOL", "unlockedAt": 1000.0}],
	"blueprints": [
		{"blueprint": "IRON_SMELTING", "source": "BASIS"},
		{"blueprint": "BASIC_SCHOOL_MANUFACTURING", "source": "RESEARCH", "via": "BASIC_SCHOOL", "unlockedAt": 1000.0},
	],
	"labs": [
		{
			"structureId": 9.0, "moduleId": 31.0, "moduleType": "RESEARCH_LAB", "slotCount": 3.0,
			"slots": [{"resource": "GLASS", "ratePerHour": 200000000.0}, null, null],
			"status": "RESEARCHING",
			"progress": {
				"value": 0.0, "ratePerHour": 3600000000.0, "at": 10000.0, "nextChange": 910000.0,
				"goal": 900000000.0, "startedAt": 10000.0, "endsAt": 910000.0, "supplyPpb": 1000000000.0,
			},
		},
		{
			"structureId": 9.0, "moduleId": 12.0, "moduleType": "RESEARCH_LAB", "slotCount": 3.0,
			"slots": [{"resource": "IRON_PLATE", "ratePerHour": 100.0}, null, null],
			"status": "PAUSED_LOW_INPUT",
			"progress": {
				"value": 450000000.0, "ratePerHour": 0.0, "at": 5000.0,
				"goal": 900000000.0, "startedAt": 1000.0, "supplyPpb": 0.0,
			},
			"hint": {"category": "PRODUCTION", "at": 4000.0},
			"shortfall": {"resource": "IRON_PLATE", "ratePerHour": 100.0, "requiredPerHour": 200000000.0},
		},
		{
			"structureId": 20.0, "moduleId": 40.0, "moduleType": "BIOLOGY_LAB", "slotCount": 4.0,
			"slots": [null, null, null, null], "status": "NO_SLOTS",
		},
	],
}

var _state: ResearchState


func before_test() -> void:
	_state = ResearchState.from_wire(ANSWER)


func test_reads_techs_and_blueprints() -> void:
	assert_int(Wire.as_int(_state.researched.get("BASIC_SCHOOL"))).is_equal(1000)
	assert_str(Wire.as_string(_state.blueprints.get("IRON_SMELTING"))).is_equal("BASIS")
	assert_str(Wire.as_string(_state.blueprints.get("BASIC_SCHOOL_MANUFACTURING"))).is_equal("RESEARCH")
	assert_int(_state.labs.size()).is_equal(3)


func test_reads_a_running_lab() -> void:
	var lab := _state.lab(31)

	assert_int(lab.structure_id).is_equal(9)
	assert_str(lab.module_type).is_equal("RESEARCH_LAB")
	assert_int(lab.slot_count).is_equal(3)
	assert_array(lab.slots[0]).contains_exactly(["GLASS", 200000000])
	assert_bool(lab.slots[1].is_empty()).is_true()
	assert_str(lab.status).is_equal("RESEARCHING")
	assert_int(lab.goal).is_equal(900000000)
	assert_int(lab.started_at).is_equal(10000)
	assert_int(lab.ends_at).is_equal(910000)
	assert_float(lab.supply()).is_equal_approx(1.0, 0.0001)
	assert_str(lab.hint_category).is_equal("")
	assert_array(Array(lab.slot_resources())).contains_exactly(["GLASS"])
	assert_bool(lab.slots_empty()).is_false()


func test_reads_hint_shortfall_and_missing_projection() -> void:
	var lab := _state.lab(12)

	assert_str(lab.hint_category).is_equal("PRODUCTION")
	assert_int(lab.hint_at).is_equal(4000)
	assert_str(lab.shortfall_resource).is_equal("IRON_PLATE")
	assert_int(lab.shortfall_rate).is_equal(100)
	assert_int(lab.shortfall_required).is_equal(200000000)
	assert_int(lab.ends_at).is_equal(-1)
	assert_int(lab.remaining_ms(99999)).is_equal(-1)


func test_lab_without_progress_has_none() -> void:
	var lab := _state.lab(40)

	assert_object(lab.progress).is_null()
	assert_int(lab.progress_at(5000)).is_equal(0)
	assert_float(lab.fraction_at(5000)).is_equal(0.0)
	assert_bool(lab.has_progress(5000)).is_false()
	assert_bool(lab.slots_empty()).is_true()
	assert_int(lab.slots.size()).is_equal(4)


func test_progress_ticks_with_the_game_clock_and_stops_at_the_goal() -> void:
	var lab := _state.lab(31)

	# One effective second per second: half the goal after 450 s.
	assert_int(lab.progress_at(460000)).is_equal(450000000)
	assert_float(lab.fraction_at(460000)).is_equal_approx(0.5, 0.0001)
	assert_bool(lab.has_progress(460000)).is_true()
	assert_bool(lab.has_progress(10000)).is_false()
	assert_int(lab.remaining_ms(460000)).is_equal(450000)
	# Past the projection it stays full, never more.
	assert_int(lab.progress_at(2000000)).is_equal(900000000)
	assert_float(lab.fraction_at(2000000)).is_equal(1.0)
	assert_int(lab.remaining_ms(2000000)).is_equal(0)


func test_paused_progress_stands_still() -> void:
	var lab := _state.lab(12)

	assert_int(lab.progress_at(100000)).is_equal(450000000)
	assert_bool(lab.has_progress(100000)).is_true()


func test_labs_of_a_structure_are_in_module_order() -> void:
	var labs := _state.labs_of(9)

	assert_int(labs.size()).is_equal(2)
	assert_int(labs[0].module_id).is_equal(12)
	assert_int(labs[1].module_id).is_equal(31)
	assert_int(_state.labs_of(77).size()).is_equal(0)
	assert_object(_state.lab(999)).is_null()


func test_apply_lab_replaces_or_adds() -> void:
	var changed := ResearchState.Lab.from_wire({
		"structureId": 9.0, "moduleId": 31.0, "moduleType": "RESEARCH_LAB", "slotCount": 3.0,
		"slots": [null, null, null], "status": "NO_SLOTS"})
	var added := ResearchState.Lab.from_wire({
		"structureId": 9.0, "moduleId": 50.0, "moduleType": "RESEARCH_LAB", "slotCount": 3.0,
		"slots": [null, null, null], "status": "INACTIVE"})

	_state.apply_lab(changed)
	_state.apply_lab(added)

	assert_int(_state.labs.size()).is_equal(4)
	assert_str(_state.lab(31).status).is_equal("NO_SLOTS")
	assert_str(_state.lab(50).status).is_equal("INACTIVE")


func test_replace_labs_swaps_only_that_structure() -> void:
	var fresh := ResearchState.labs_from_wire([
		{"moduleId": 60.0, "moduleType": "RESEARCH_LAB", "slotCount": 3.0, "slots": [], "status": "INACTIVE"},
	])

	_state.replace_labs(9, fresh)

	assert_int(_state.labs_of(9).size()).is_equal(1)
	assert_int(_state.labs_of(9)[0].module_id).is_equal(60)
	# Short slot lists are padded to the slot count.
	assert_int(_state.labs_of(9)[0].slots.size()).is_equal(3)
	assert_int(_state.labs_of(20).size()).is_equal(1)


func test_labs_without_module_id_are_dropped() -> void:
	assert_int(ResearchState.labs_from_wire([{"moduleType": "RESEARCH_LAB"}, "junk"]).size()).is_equal(0)
	assert_int(ResearchState.labs_from_wire(null).size()).is_equal(0)


func test_completion_marks_the_tech_and_its_recipes() -> void:
	_state.apply_completed({"tech": "GARDEN", "blueprints": ["GARDEN_MANUFACTURING", "IRON_SMELTING"], "gameTime": 7000.0})
	_state.apply_completed({"blueprints": ["NOPE"]})

	assert_int(Wire.as_int(_state.researched.get("GARDEN"))).is_equal(7000)
	assert_str(Wire.as_string(_state.blueprints.get("GARDEN_MANUFACTURING"))).is_equal("RESEARCH")
	# What was usable before keeps its source.
	assert_str(Wire.as_string(_state.blueprints.get("IRON_SMELTING"))).is_equal("BASIS")
	assert_bool(_state.blueprints.has("NOPE")).is_false()


func test_empty_answer_gives_an_empty_state() -> void:
	var empty := ResearchState.from_wire({})

	assert_int(empty.researched.size()).is_equal(0)
	assert_int(empty.blueprints.size()).is_equal(0)
	assert_int(empty.labs.size()).is_equal(0)
