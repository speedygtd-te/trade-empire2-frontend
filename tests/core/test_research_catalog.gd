extends GdUnitTestSuite

## The `research` part of GET /v2/definitions (draft.17), trimmed. Numbers are floats, as Godot's
## JSON parser delivers them.
const RESEARCH := {
	"labs": [
		{"module": "RESEARCH_LAB", "slotCount": 3.0},
		{"module": "BIOLOGY_LAB", "slotCount": 4.0},
	],
	"categories": ["HABITATION", "PRODUCTION"],
	"techs": [
		{
			"key": "BASIC_SCHOOL", "displayName": "Basic School", "description": "Schools.", "tier": 1.0,
			"category": "HABITATION", "status": "ACTIVE", "baseTimeSeconds": 900.0,
			"minResearchTimeSeconds": 270.0,
			"requiredInputs": [
				{"resource": "COPPER_WIRE", "minAmount": 50000000.0},
				{"resource": "GLASS", "minAmount": 50000000.0},
				{"resource": "IRON_PLATE", "minAmount": 50000000.0},
			],
			"primaryLab": "RESEARCH_LAB", "allowedLabs": [{"lab": "BIOLOGY_LAB", "role": "CROSS_SPECIALTY"}],
			"minWorkerTier": 1.0, "unlocksBlueprints": ["BASIC_SCHOOL_MANUFACTURING"],
			"prerequisites": [], "preferredResources": [], "capabilityOnly": false,
		},
		{
			"key": "GARDEN", "displayName": "Garden", "description": "", "tier": 1.0,
			"category": "HABITATION", "status": "ACTIVE", "baseTimeSeconds": 900.0,
			"minResearchTimeSeconds": 270.0,
			"requiredInputs": [
				{"resource": "COPPER_WIRE", "minAmount": 50000000.0},
				{"resource": "GLASS", "minAmount": 50000000.0},
				{"resource": "IRON_PLATE", "minAmount": 50000000.0},
			],
			"primaryLab": "BIOLOGY_LAB", "allowedLabs": [{"lab": "RESEARCH_LAB", "role": "GENERALIST"}],
			"minWorkerTier": 1.0, "unlocksBlueprints": ["GARDEN_MANUFACTURING"],
			"prerequisites": ["BASIC_SCHOOL"], "preferredResources": [], "capabilityOnly": false,
		},
		{
			"key": "SMELTING", "displayName": "Smelting", "description": "", "tier": 2.0,
			"category": "PRODUCTION", "status": "ACTIVE", "baseTimeSeconds": 7200.0,
			"minResearchTimeSeconds": 2160.0,
			"requiredInputs": [{"resource": "IRON_PLATE", "minAmount": 1000000.0}],
			"primaryLab": "RESEARCH_LAB", "allowedLabs": [],
			"minWorkerTier": 2.0, "unlocksBlueprints": ["SMELTING"],
			"prerequisites": [], "preferredResources": [], "capabilityOnly": false,
		},
		{
			"key": "ELITE", "displayName": "Elite", "description": "", "tier": 4.0,
			"category": "HABITATION", "status": "ACTIVE", "baseTimeSeconds": 259200.0,
			"minResearchTimeSeconds": 77760.0,
			"requiredInputs": [{"resource": "GLASS", "minAmount": 1.0}],
			"primaryLab": "BIOLOGY_LAB", "allowedLabs": [{"lab": "RESEARCH_LAB", "role": "GENERALIST"}],
			"minWorkerTier": 3.0, "unlocksBlueprints": [], "prerequisites": [],
			"preferredResources": [], "capabilityOnly": false,
		},
		{
			"key": "OLD", "displayName": "Old", "description": "", "tier": 1.0, "category": "PRODUCTION",
			"status": "RETIRED", "baseTimeSeconds": 900.0, "minResearchTimeSeconds": 270.0,
			"requiredInputs": [], "primaryLab": "RESEARCH_LAB", "allowedLabs": [], "minWorkerTier": 1.0,
			"unlocksBlueprints": [], "prerequisites": [], "preferredResources": [], "capabilityOnly": false,
		},
		{
			"key": "WORMHOLE", "displayName": "Wormhole", "description": "", "tier": 5.0,
			"category": "TRANSPORTATION", "status": "PARKED", "baseTimeSeconds": 1209600.0,
			"minResearchTimeSeconds": 362880.0, "requiredInputs": [], "primaryLab": "BIOLOGY_LAB",
			"allowedLabs": [], "minWorkerTier": 5.0, "unlocksBlueprints": [], "prerequisites": [],
			"preferredResources": [], "capabilityOnly": true,
		},
	],
}

var _catalog: ResearchCatalog


func before_test() -> void:
	_catalog = ResearchCatalog.from_wire(RESEARCH)


func test_reads_labs_categories_and_techs() -> void:
	assert_bool(_catalog.is_lab("RESEARCH_LAB")).is_true()
	assert_bool(_catalog.is_lab("MINE")).is_false()
	assert_int(_catalog.slot_count("BIOLOGY_LAB")).is_equal(4)
	assert_int(_catalog.slot_count("MINE")).is_equal(0)
	assert_array(Array(_catalog.lab_types())).contains_exactly(["RESEARCH_LAB", "BIOLOGY_LAB"])
	assert_array(Array(_catalog.categories)).contains_exactly(["HABITATION", "PRODUCTION"])
	assert_int(_catalog.techs().size()).is_equal(6)
	assert_object(_catalog.tech("NOPE")).is_null()


func test_reads_a_tech_with_integers() -> void:
	var school := _catalog.tech("BASIC_SCHOOL")

	assert_str(school.display_name).is_equal("Basic School")
	assert_int(school.tier).is_equal(1)
	assert_int(school.base_time_seconds).is_equal(900)
	assert_int(school.min_time_seconds).is_equal(270)
	assert_array(school.required_inputs[0]).contains_exactly(["COPPER_WIRE", 50000000])
	assert_int(typeof(school.required_inputs[0][1])).is_equal(TYPE_INT)
	assert_array(Array(school.input_resources())).contains_exactly(["COPPER_WIRE", "GLASS", "IRON_PLATE"])
	assert_str(school.primary_lab).is_equal("RESEARCH_LAB")
	assert_str(Wire.as_string(school.allowed_labs.get("BIOLOGY_LAB"))).is_equal("CROSS_SPECIALTY")
	assert_array(Array(school.unlocks_blueprints)).contains_exactly(["BASIC_SCHOOL_MANUFACTURING"])
	assert_array(Array(_catalog.tech("GARDEN").prerequisites)).contains_exactly(["BASIC_SCHOOL"])


func test_missing_research_part_gives_an_empty_catalog() -> void:
	var empty := ResearchCatalog.from_wire({})

	assert_int(empty.techs().size()).is_equal(0)
	assert_int(empty.selectable_count()).is_equal(0)
	assert_bool(empty.is_lab("RESEARCH_LAB")).is_false()


func test_definitions_carry_the_catalog() -> void:
	var definitions := GameDefinitions.from_bundle({"dataHash": "x", "modules": [], "research": RESEARCH})

	assert_int(definitions.research.slot_count("RESEARCH_LAB")).is_equal(3)
	assert_int(GameDefinitions.from_bundle({"dataHash": "x", "modules": []}).research.techs().size()).is_equal(0)


func test_counts_selectable_and_researched_techs() -> void:
	assert_int(_catalog.selectable_count()).is_equal(4)
	assert_int(_catalog.researched_count({"BASIC_SCHOOL": 5})).is_equal(1)
	# Retired techs count as researched for everyone, but not towards the selectable total.
	assert_bool(_catalog.is_researched("OLD", {})).is_true()
	assert_bool(_catalog.is_researched("WORMHOLE", {})).is_false()
	assert_bool(_catalog.is_researched("BASIC_SCHOOL", {"BASIC_SCHOOL": 5})).is_true()
	assert_int(_catalog.researched_count({"OLD": 1})).is_equal(0)


func test_lab_role_follows_primary_allowed_and_the_tier_limit() -> void:
	assert_str(_catalog.lab_role("RESEARCH_LAB", _catalog.tech("BASIC_SCHOOL"))).is_equal("PRIMARY")
	assert_str(_catalog.lab_role("RESEARCH_LAB", _catalog.tech("GARDEN"))).is_equal("GENERALIST")
	assert_str(_catalog.lab_role("BIOLOGY_LAB", _catalog.tech("SMELTING"))).is_equal("")
	# The simple lab never takes tier 4 or above, even where it is allowed.
	assert_str(_catalog.lab_role("RESEARCH_LAB", _catalog.tech("ELITE"))).is_equal("")
	assert_str(_catalog.lab_role("BIOLOGY_LAB", _catalog.tech("ELITE"))).is_equal("PRIMARY")


func test_open_techs_of_a_lab_are_sorted_and_filtered() -> void:
	var open := _catalog.open_for_lab("RESEARCH_LAB", {})
	var keys: Array[String] = []
	for entry: ResearchCatalog.Tech in open:
		keys.append(entry.key)

	# Lowest tier first, then by name; retired, parked, tier 4 and researched ones are left out.
	assert_array(keys).contains_exactly(["BASIC_SCHOOL", "GARDEN", "SMELTING"])
	assert_int(_catalog.open_for_lab("RESEARCH_LAB", {"BASIC_SCHOOL": 1}).size()).is_equal(2)
	assert_int(_catalog.open_for_lab("MINE", {}).size()).is_equal(0)


func test_preview_picks_the_lowest_tier_that_the_slots_allow() -> void:
	var smelting_only := _catalog.preview_choice("RESEARCH_LAB", PackedStringArray(["IRON_PLATE"]), {})
	var nothing := _catalog.preview_choice("RESEARCH_LAB", PackedStringArray(["WATER"]), {})

	assert_int(smelting_only.size()).is_equal(1)
	assert_str(smelting_only[0].key).is_equal("SMELTING")
	assert_int(nothing.size()).is_equal(0)


func test_preview_prefers_the_heavier_tech_within_a_tier() -> void:
	var slots := PackedStringArray(["COPPER_WIRE", "GLASS", "IRON_PLATE"])

	# In the research lab the school is primary (weight 2), the garden only allowed (weight 1).
	var in_research_lab := _catalog.preview_choice("RESEARCH_LAB", slots, {})
	assert_int(in_research_lab.size()).is_equal(1)
	assert_str(in_research_lab[0].key).is_equal("BASIC_SCHOOL")
	# Once the school is done, the garden is next.
	var after_school := _catalog.preview_choice("RESEARCH_LAB", slots, {"BASIC_SCHOOL": 1})
	assert_str(after_school[0].key).is_equal("GARDEN")


func test_preview_reports_a_tie_it_cannot_break() -> void:
	# The garden made primary in the research lab and without prerequisites: both weigh 2, same
	# tier and base time — only the server's hash decides.
	var tie_data := RESEARCH.duplicate(true)
	var techs: Array = tie_data["techs"]
	(techs[1] as Dictionary)["primaryLab"] = "RESEARCH_LAB"
	(techs[1] as Dictionary)["prerequisites"] = []
	var tie := ResearchCatalog.from_wire(tie_data)

	var choice := tie.preview_choice("RESEARCH_LAB", PackedStringArray(["COPPER_WIRE", "GLASS", "IRON_PLATE"]), {})

	assert_int(choice.size()).is_equal(2)


func test_choice_weight_counts_lab_and_prerequisites() -> void:
	var garden := _catalog.tech("GARDEN")

	assert_float(_catalog.choice_weight("BIOLOGY_LAB", garden, {})).is_equal_approx(2.0, 0.0001)
	assert_float(_catalog.choice_weight("BIOLOGY_LAB", garden, {"BASIC_SCHOOL": 1})).is_equal_approx(4.0, 0.0001)
	assert_float(_catalog.choice_weight("RESEARCH_LAB", garden, {})).is_equal_approx(1.0, 0.0001)


func test_min_rate_spreads_the_amount_over_the_base_time() -> void:
	# 50 units over 900 s = 200 units per hour.
	assert_int(ResearchCatalog.min_rate_per_hour(_catalog.tech("BASIC_SCHOOL"), "GLASS")).is_equal(200000000)
	# 1 unit over 2 h = 0.5 units per hour.
	assert_int(ResearchCatalog.min_rate_per_hour(_catalog.tech("SMELTING"), "IRON_PLATE")).is_equal(500000)
	# Rounded up, so the slot never falls below the minimum.
	assert_int(ResearchCatalog.min_rate_per_hour(_catalog.tech("ELITE"), "GLASS")).is_equal(1)
	assert_int(ResearchCatalog.min_rate_per_hour(_catalog.tech("SMELTING"), "GLASS")).is_equal(0)


func test_slots_for_a_tech_fill_its_inputs_and_pad_with_null() -> void:
	var slots := ResearchCatalog.slots_for(_catalog.tech("SMELTING"), 3, 2)

	assert_int(slots.size()).is_equal(3)
	var first: Dictionary = slots[0]
	assert_str(Wire.as_string(first.get("resource"))).is_equal("IRON_PLATE")
	assert_int(typeof(first.get("ratePerHour"))).is_equal(TYPE_INT)
	assert_int(Wire.as_int(first.get("ratePerHour"))).is_equal(1000000)
	assert_that(slots[1]).is_null()
	assert_that(slots[2]).is_null()
	# Written as JSON, rates stay integers.
	assert_str(JSON.stringify({"slots": slots})).is_equal('{"slots":[{"ratePerHour":1000000,"resource":"IRON_PLATE"},null,null]}')


func test_slots_for_a_tech_with_too_many_inputs_are_empty() -> void:
	assert_int(ResearchCatalog.slots_for(_catalog.tech("BASIC_SCHOOL"), 2).size()).is_equal(0)


func test_empty_slots_are_all_null() -> void:
	assert_array(ResearchCatalog.empty_slots(3)).contains_exactly([null, null, null])
	assert_int(ResearchCatalog.empty_slots(-1).size()).is_equal(0)
