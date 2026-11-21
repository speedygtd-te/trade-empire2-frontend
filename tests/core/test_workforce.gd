extends GdUnitTestSuite

## A PUT workforce answer in the shape of the contract (numbers as Godot's JSON parser
## delivers them): 30 tier-1 and 5 tier-2 inhabitants; labs and a mine are staffed in part.
const RESPONSE := {
	"structureId": 9.0,
	"population": [30.0, 5.0, 0.0, 0.0, 0.0],
	"groups": [
		{"moduleType": "RESEARCH_LAB", "modules": 2.0, "requiredWorkers": 4.0, "baseTier": 1.0,
			"humans": [2.0, 1.0, 0.0, 0.0, 0.0], "robots": [1.0, 0.0, 0.0, 0.0, 0.0],
			"auto": [true, false, false, false, false], "modifier": 400000.0},
		{"moduleType": "MINE", "modules": 1.0, "requiredWorkers": 10.0, "baseTier": 1.0,
			"humans": [20.0, 0.0, 0.0, 0.0, 0.0], "robots": [0.0, 0.0, 0.0, 0.0, 0.0],
			"auto": [false, false, false, false, false], "modifier": 1000000.0},
		{"moduleType": "FACTORY", "modules": 1.0, "requiredWorkers": 6.0, "baseTier": 2.0,
			"humans": [0.0, 0.0, 0.0, 0.0, 0.0], "robots": [0.0, 0.0, 0.0, 0.0, 0.0],
			"auto": [false, false, false, false, false], "modifier": 0.0},
	],
	"tiers": [
		{"tier": 2.0, "unlocked": false, "requiredTier": 1.0, "minPopulation": 500.0, "population": 30.0,
			"requirements": [{"emission": "ENTERTAINMENT", "minShare": 700000.0, "share": 0.0}]},
	],
}

var _workforce: Workforce


func before_test() -> void:
	_workforce = Workforce.new()
	_workforce.apply_response(RESPONSE)


func test_reads_population_groups_and_tiers() -> void:
	assert_array(_workforce.population).is_equal([30, 5, 0, 0, 0])
	assert_int(_workforce.total_population()).is_equal(35)
	var lab: Workforce.Group = _workforce.groups["RESEARCH_LAB"]
	assert_int(lab.needed()).is_equal(8)
	assert_int(lab.assigned()).is_equal(4)
	assert_array(lab.auto).is_equal([true, false, false, false, false])
	assert_int(lab.modifier).is_equal(400000)
	var unlock: Workforce.TierUnlock = _workforce.tiers[2]
	assert_bool(unlock.unlocked).is_false()
	assert_int(unlock.min_population).is_equal(500)
	assert_array(unlock.requirements).is_equal([["ENTERTAINMENT", 700000, 0]])


func test_totals_over_all_module_types() -> void:
	assert_int(_workforce.needed_total()).is_equal(8 + 10 + 6)
	assert_int(_workforce.assigned_total()).is_equal(4 + 20)


func test_average_tier_counts_people_and_robots() -> void:
	var lab: Workforce.Group = _workforce.groups["RESEARCH_LAB"]
	# 2 + 1 at tier 1, 1 at tier 2: (3·1 + 1·2) / 4.
	assert_float(lab.average_tier()).is_equal_approx(1.25, 0.0001)
	var factory: Workforce.Group = _workforce.groups["FACTORY"]
	assert_float(factory.average_tier()).is_equal(0.0)


func test_free_people_are_those_no_other_type_employs() -> void:
	assert_int(_workforce.free_humans(1)).is_equal(30 - 22)
	assert_int(_workforce.free_humans(1, "MINE")).is_equal(30 - 2)
	assert_int(_workforce.free_humans(2)).is_equal(4)


func test_fill_takes_free_people_first_then_robots() -> void:
	var lab: Workforce.Group = _workforce.groups["RESEARCH_LAB"]
	var store: Array[int] = [10, 0, 0, 0, 0]
	var plan := _workforce.fill_plan(lab, store)

	# 8 needed: tier 1 has 30 − 20 (mine) = 10 free for the lab, so people suffice.
	assert_array(plan[0]).is_equal([8, 0, 0, 0, 0])
	assert_array(plan[1]).is_equal([0, 0, 0, 0, 0])

	var robots_only := _workforce.fill_plan(lab, store, false, true)
	# The lab's own robot comes back into the pool: 10 + 1 available at tier 1.
	assert_array(robots_only[1]).is_equal([8, 0, 0, 0, 0])


func test_fill_starts_at_the_base_tier_and_stops_when_nothing_is_left() -> void:
	var factory: Workforce.Group = _workforce.groups["FACTORY"]
	var store: Array[int] = [100, 2, 0, 0, 0]
	var plan := _workforce.fill_plan(factory, store)

	# Base tier 2: 4 free tier-2 people (one works in the lab), then 2 tier-2 robots — 6 of 6.
	assert_array(plan[0]).is_equal([0, 4, 0, 0, 0])
	assert_array(plan[1]).is_equal([0, 2, 0, 0, 0])


func test_max_for_a_tier_is_what_is_at_hand_up_to_the_need() -> void:
	var lab: Workforce.Group = _workforce.groups["RESEARCH_LAB"]
	var factory: Workforce.Group = _workforce.groups["FACTORY"]
	var store: Array[int] = [10, 2, 0, 0, 0]
	var none: Array[int] = [0, 0, 0, 0, 0]
	# The lab needs 8; tier 1 has 10 free people for it: capped at the need.
	assert_int(_workforce.max_for(lab, 1, true, none, none, store)).is_equal(8)
	# Others already give 5 of 8: only 3 more.
	assert_int(_workforce.max_for(lab, 1, true, none, [5, 0, 0, 0, 0], store)).is_equal(3)
	# The factory (base tier 2, needs 6) has only 4 free tier-2 people: all of them.
	assert_int(_workforce.max_for(factory, 2, true, none, none, store)).is_equal(4)
	# Robots: store plus the type's own.
	assert_int(_workforce.max_for(factory, 2, false, none, none, store)).is_equal(2)
	# Below the base tier nothing.
	assert_int(_workforce.max_for(factory, 1, true, none, none, store)).is_equal(0)


func test_lowering_is_allowed_even_when_the_population_fell() -> void:
	var mine: Workforce.Group = _workforce.groups["MINE"]
	var none: Array[int] = [0, 0, 0, 0, 0]
	var store: Array[int] = [0, 0, 0, 0, 0]
	# Tier 1 shrank to 10 people: the mine's 20 are more than are free (8) now.
	_workforce.population[0] = 10
	assert_str(_workforce.check(mine, [15, 0, 0, 0, 0], none, store)).is_empty()
	assert_str(_workforce.check(mine, [20, 0, 0, 0, 0], none, store)).is_empty()
	assert_str(_workforce.check(mine, [21, 0, 0, 0, 0], none, store)).is_equal("INSUFFICIENT_WORKERS")


func test_check_previews_the_servers_refusals() -> void:
	var factory: Workforce.Group = _workforce.groups["FACTORY"]
	var store: Array[int] = [5, 1, 0, 0, 0]
	var none: Array[int] = [0, 0, 0, 0, 0]

	assert_str(_workforce.check(factory, [0, 4, 0, 0, 0], none, store)).is_empty()
	assert_str(_workforce.check(factory, [1, 0, 0, 0, 0], none, store)).is_equal("TIER_TOO_LOW")
	assert_str(_workforce.check(factory, [0, 5, 0, 0, 0], none, store)).is_equal("INSUFFICIENT_WORKERS")
	assert_str(_workforce.check(factory, none, [0, 2, 0, 0, 0], store)).is_equal("INSUFFICIENT_ROBOTS")


func test_population_by_tier_skips_index_zero() -> void:
	var workforce := Workforce.new()
	workforce.apply_population_by_tier([0.0, 12.0, 3.0])

	assert_array(workforce.population).is_equal([12, 3, 0, 0, 0])


func test_broken_data_gives_empty_groups() -> void:
	var workforce := Workforce.new()
	workforce.apply_groups("nonsense")
	workforce.apply_response({})

	assert_int(workforce.groups.size()).is_equal(0)
	assert_int(workforce.total_population()).is_equal(0)
