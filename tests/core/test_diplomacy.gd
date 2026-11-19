extends GdUnitTestSuite
## Diplomacy: reading the relations and which steps the screen offers.


func _diplomacy(own: String = "enterprise-1") -> Diplomacy:
	return Diplomacy.from_wire({
		"faction": own,
		"relations": [
			{"faction": "enterprise-2", "name": "Alpha", "stance": "hostile", "since": 100.0},
			{"faction": "enterprise-3", "name": "Beta", "stance": "neutral", "since": 200.0,
				"proposal": {"kind": "alliance", "by": "enterprise-3", "at": 250.0}},
			{"faction": "enterprise-4", "name": "Gamma", "stance": "allied", "since": 300.0},
			{"faction": "enterprise-5", "name": "Delta", "stance": "hostile", "since": 400.0,
				"proposal": {"kind": "peace", "by": own, "at": 450.0}},
			{"faction": "player-9", "name": "Solo", "stance": "hostile", "since": 500.0},
		],
		"endingPacts": [{"faction": "enterprise-6", "until": 10000.0}],
	})


func test_reads_relations_and_pacts() -> void:
	var diplomacy := _diplomacy()

	assert_str(diplomacy.faction).is_equal("enterprise-1")
	assert_int(diplomacy.relations.size()).is_equal(5)
	assert_str(diplomacy.relation("enterprise-3").proposal_kind).is_equal("alliance")
	assert_int(diplomacy.relation("enterprise-3").proposal_at).is_equal(250)
	assert_int(diplomacy.relation("enterprise-2").since).is_equal(100)
	assert_object(diplomacy.relation("enterprise-99")).is_null()
	assert_str(diplomacy.stance_with("enterprise-4")).is_equal("allied")
	assert_str(diplomacy.stance_with("enterprise-99")).is_equal("neutral")
	assert_int(diplomacy.ending_pacts["enterprise-6"]).is_equal(10000)


func test_who_proposed() -> void:
	var diplomacy := _diplomacy()

	assert_bool(diplomacy.proposed_to_us("enterprise-3")).is_true()
	assert_bool(diplomacy.proposed_by_us("enterprise-3")).is_false()
	assert_bool(diplomacy.proposed_by_us("enterprise-5")).is_true()
	assert_bool(diplomacy.proposed_to_us("enterprise-2")).is_false()


func test_steps_per_relation() -> void:
	var diplomacy := _diplomacy()

	# At war: propose peace.
	assert_array(Array(diplomacy.steps("enterprise-2"))).is_equal(["peace"])
	# Their alliance proposal: accept it, or declare war.
	assert_array(Array(diplomacy.steps("enterprise-3"))).is_equal(["accept", "war"])
	assert_array(Array(diplomacy.steps("enterprise-4"))).is_equal(["break", "war"])
	# Our own peace proposal: only withdraw.
	assert_array(Array(diplomacy.steps("enterprise-5"))).is_equal(["withdraw"])
	# Neutral without a relation: alliance (enterprises only) or war.
	assert_array(Array(diplomacy.steps("enterprise-99"))).is_equal(["alliance", "war"])
	assert_array(Array(diplomacy.steps("player-8"))).is_equal(["war"])
	assert_array(Array(diplomacy.steps("player-9"))).is_equal(["peace"])


func test_nothing_to_do_alone_or_towards_oneself() -> void:
	assert_array(Array(_diplomacy("player-1").steps("enterprise-2"))).is_empty()
	assert_array(Array(_diplomacy().steps("enterprise-1"))).is_empty()
	assert_array(Array(_diplomacy().steps(""))).is_empty()
	assert_bool(Diplomacy.is_enterprise("enterprise-1")).is_true()
	assert_bool(Diplomacy.is_enterprise("player-1")).is_false()


func test_pact_remaining_time() -> void:
	var diplomacy := _diplomacy()

	assert_int(diplomacy.pact_remaining_ms("enterprise-6", 7600)).is_equal(2400)
	assert_int(diplomacy.pact_remaining_ms("enterprise-6", 20000)).is_equal(0)
	assert_int(diplomacy.pact_remaining_ms("enterprise-2", 0)).is_equal(0)


func test_live_answer_of_a_player_alone() -> void:
	var diplomacy := Diplomacy.from_wire(Wire.parse_object(
		'{"rev":2890,"gameTime":62656304,"endingPacts":[],"faction":"player-2890","relations":[]}'))

	assert_str(diplomacy.faction).is_equal("player-2890")
	assert_int(diplomacy.relations.size()).is_equal(0)
	assert_bool(diplomacy.ending_pacts.is_empty()).is_true()
