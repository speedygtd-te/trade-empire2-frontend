extends GdUnitTestSuite
## MemberLinks (draft.39, SPEC-enterprise-flaggschiff 6a): member blueprints, member modules and
## the extraction focus of the Mining Optimizer. Values as the live server sends them:
## MINING_OPTIMIZER sends EXTRACTION_FOCUS 24 (decay 4 per hull), extractors react with 50.
## Layouts are drawn as text per level (row = y, column = x):
##   #  hull    O  MINING_OPTIMIZER    M  MINE    S  SOLAR_PANEL (does not react)    .  nothing

const BUNDLE := {
	"dataHash": "x",
	"modules": [
		{"key": "MINING_OPTIMIZER", "displayName": "Mining Optimizer", "owners": ["player"], "enterpriseBuildable": false,
			"emissions": [{"emission": "EXTRACTION_FOCUS", "baseStrength": 24000000.0, "scalesWithUtilization": false}]},
		{"key": "MINE", "displayName": "Mine", "blueprintDriven": true, "owners": ["player"],
			"sensitivities": [{"emission": "EXTRACTION_FOCUS", "effectPercent": 50000000.0}]},
		{"key": "SOLAR_PANEL", "displayName": "Solar Panel", "owners": ["enterprise", "player"], "enterpriseBuildable": true},
	],
	"hulls": [{"key": "STARTER", "modulePositioning": "INDOOR", "owners": ["player"], "enterpriseBuildable": false}],
	"emissions": [{"key": "EXTRACTION_FOCUS", "displayName": "Extraction Focus", "isPositive": false, "decayPerSegment": 4000000.0}],
	"blueprints": [
		{"key": "MINING_OPTIMIZER_MANUFACTURING", "displayName": "Mining Optimizer Manufacturing", "host": "FACTORY",
			"outputs": [{"resource": "MINING_OPTIMIZER_MODULE", "ratePerHour": 12000000.0}]},
		{"key": "IRON_PLATES", "displayName": "Iron Plates", "host": "SMELTER"},
	],
	"research": {"techs": [
		{"key": "ET_MINING_EFFICIENCY", "displayName": "Mining Efficiency", "category": "ENTERPRISE",
			"unlocksBlueprints": ["MINING_EFFICIENCY_DISTRIBUTOR_MANUFACTURING"],
			"memberUnlocksBlueprints": ["MINING_OPTIMIZER_MANUFACTURING"]},
	]},
}
const TYPES := {"O": "MINING_OPTIMIZER", "M": "MINE", "S": "SOLAR_PANEL"}

var _definitions: GameDefinitions


func before() -> void:
	_definitions = GameDefinitions.from_bundle(BUNDLE)


func test_definitions_read_owners_emissions_and_sensitivities() -> void:
	assert_bool(_definitions.owners_known).is_true()
	assert_bool(_definitions.owners_derived).is_false()
	assert_bool(_definitions.module("SOLAR_PANEL").allows("enterprise")).is_true()
	assert_bool(_definitions.module("SOLAR_PANEL").enterprise_buildable).is_true()
	assert_bool(_definitions.module("MINING_OPTIMIZER").allows("enterprise")).is_false()
	assert_int(_definitions.module("MINING_OPTIMIZER").emission_strength("EXTRACTION_FOCUS")).is_equal(24000000)
	assert_int(_definitions.module("MINE").sensitivity("EXTRACTION_FOCUS")).is_equal(50000000)
	assert_int(_definitions.module("MINE").sensitivity("NOISE")).is_equal(0)
	assert_int(_definitions.emission_decay("EXTRACTION_FOCUS")).is_equal(4000000)
	assert_object(_definitions.research.member_tech_of("MINING_OPTIMIZER_MANUFACTURING")).is_not_null()
	assert_object(_definitions.research.member_tech_of("IRON_PLATES")).is_null()


func test_member_modules() -> void:
	assert_bool(MemberLinks.is_member_module("MINING_OPTIMIZER")).is_true()
	assert_bool(MemberLinks.is_member_module("OBSERVATION_UPLINK")).is_true()
	assert_bool(MemberLinks.is_member_module("RESEARCH_NETWORK_NODE")).is_true()
	assert_bool(MemberLinks.is_member_module("OBSERVATION_PLATFORM")).is_false()


func test_lock_of_a_blueprint() -> void:
	var catalog := _definitions.research
	var member := "MINING_OPTIMIZER_MANUFACTURING"
	assert_int(MemberLinks.lock_of(member, {member: true}, catalog, true)).is_equal(MemberLinks.Lock.NONE)
	assert_int(MemberLinks.lock_of(member, {}, catalog, false)).is_equal(MemberLinks.Lock.JOIN)
	assert_int(MemberLinks.lock_of(member, {}, catalog, true)).is_equal(MemberLinks.Lock.ENTERPRISE)
	assert_int(MemberLinks.lock_of("IRON_PLATES", {}, catalog, true)).is_equal(MemberLinks.Lock.RESEARCH)


func test_focus_is_ten_percent_beside_and_two_less_per_hull() -> void:
	var layout := _build({0: ["OMMMMMM"]})
	var focus := MemberLinks.focus(layout, _definitions, {})
	var bonuses: Array[int] = []
	for x: int in range(1, 7):
		var entry := focus.get(layout.module_at(Vector3i(x, 0, 0)).module_id) as MemberLinks.Focus
		bonuses.append(entry.bonus_ppm if entry != null else 0)

	assert_array(bonuses).is_equal([100000, 80000, 60000, 40000, 20000, 0])
	assert_str(MemberLinks.percent_text(100000)).is_equal("10")
	assert_str(MemberLinks.percent_text(5000)).is_equal("0.5")


func test_focus_runs_over_hulls_only_and_keeps_to_its_level() -> void:
	# The gap at x = 2 cuts the row; the mine above (z = 1) gets nothing.
	var layout := _build({0: ["OM.M", "#..."], 1: ["M..."]})
	var focus := MemberLinks.focus(layout, _definitions, {})

	assert_bool(focus.has(layout.module_at(Vector3i(1, 0, 0)).module_id)).is_true()
	assert_bool(focus.has(layout.module_at(Vector3i(3, 0, 0)).module_id)).is_false()
	assert_bool(focus.has(layout.module_at(Vector3i(0, 0, 1)).module_id)).is_false()


func test_only_the_strongest_optimizer_counts() -> void:
	var layout := _build({0: ["O#MO"]})
	var mine := layout.module_at(Vector3i(2, 0, 0)).module_id
	var near := layout.module_at(Vector3i(3, 0, 0)).module_id
	var entry := MemberLinks.focus(layout, _definitions, {}).get(mine) as MemberLinks.Focus

	assert_int(entry.bonus_ppm).is_equal(100000)
	assert_int(entry.source_id).is_equal(near)
	assert_int(entry.distance).is_equal(1)


func test_an_idle_optimizer_sends_nothing_and_others_do_not_react() -> void:
	var layout := _build({0: ["OSM"]})
	var optimizer := layout.module_at(Vector3i(0, 0, 0)).module_id
	var solar := layout.module_at(Vector3i(1, 0, 0)).module_id
	var mine := layout.module_at(Vector3i(2, 0, 0)).module_id

	var working := MemberLinks.focus(layout, _definitions, {})
	assert_bool(working.has(solar)).is_false()
	assert_int((working.get(mine) as MemberLinks.Focus).bonus_ppm).is_equal(80000)
	assert_array(MemberLinks.reached_by(working, optimizer)).has_size(1)
	assert_bool(MemberLinks.focus(layout, _definitions, {optimizer: "NO_ENTERPRISE"}).is_empty()).is_true()


func test_enterprise_research_names_the_member_blueprints_of_researched_techs() -> void:
	var research := EnterpriseResearch.from_wire({"enterpriseId": "7", "at": 1.0, "techs": [
		{"key": "ET_MINING_EFFICIENCY", "name": "Mining Efficiency", "tier": 2.0,
			"memberUnlocks": ["MINING_OPTIMIZER_MANUFACTURING"], "researchedAt": 5.0},
		{"key": "ET_OBSERVATION_PLATFORM", "name": "Observation Platform", "tier": 3.0,
			"memberUnlocks": ["OBSERVATION_UPLINK_MANUFACTURING"]},
		{"key": "ET_LIFE_SCIENCES", "name": "Life Sciences", "tier": 1.0, "researchedAt": 2.0},
	]})

	assert_array(research.tech("ET_OBSERVATION_PLATFORM").member_unlocks).contains_exactly(["OBSERVATION_UPLINK_MANUFACTURING"])
	assert_array(research.tech("ET_LIFE_SCIENCES").member_unlocks).is_empty()
	assert_array(research.member_blueprints().keys()).contains_exactly(["MINING_OPTIMIZER_MANUFACTURING"])


func _build(maps: Dictionary) -> StructureLayout:
	var hulls := PackedStringArray()
	var modules := PackedStringArray()
	var next_id := 100
	for z: int in maps.keys():
		var rows: Array = maps[z]
		for y: int in rows.size():
			var row: String = rows[y]
			for x: int in row.length():
				var mark := row[x]
				if mark == ".":
					continue
				hulls.append("[%d,%d,%d,0]" % [x, y, z])
				if TYPES.has(mark):
					next_id += 1
					modules.append('{"moduleId":%d,"moduleType":"%s","x":%d,"y":%d,"z":%d,"size":{"x":1,"y":1,"z":1},"rotation":0,"status":"active"}' % [
						next_id, TYPES[mark], x, y, z])
	var lines := PackedStringArray()
	lines.append('{"line":"header","structureId":2,"rev":1,"chunks":1,"anchor":{"type":"surface","offset":{"x":0,"y":0,"z":0}}}')
	lines.append('{"line":"chunk","chunk":[0,0,0],"version":1,"hullTypes":["STARTER"],"hulls":[%s],"modules":[%s]}' % [
		",".join(hulls), ",".join(modules)])
	lines.append('{"line":"end","rev":1}')
	var layout := StructureLayout.new()
	assert_bool(layout.apply(Ndjson.parse("\n".join(lines)))).is_true()
	return layout
