extends GdUnitTestSuite
## Paths in a structure (PathAccess, Backend-V2 docs/SPEC-wege.md W1–W9). Layouts are drawn as
## text, one picture per level (row = y, column = x):
##   #  free INDOOR hull (a corridor)       o  free OUTDOOR platform
##   M  MINE (staff, INDOOR)                H  HABITAT (inhabitants, INDOOR)
##   S  STORAGE (no staff, INDOOR)          C  COLLECTOR (staff, on an OUTDOOR platform)
##   E  STAIRCASE floor (INDOOR; the cell above must be a hull: its head)
##   .  nothing

const BUNDLE := {
	"dataHash": "x",
	"modules": [
		{"key": "MINE", "size": {"x": 1.0, "y": 1.0, "z": 1.0}, "positioning": ["INDOOR"],
			"workforce": {"requiredWorkers": 5.0}},
		{"key": "STORAGE", "size": {"x": 1.0, "y": 1.0, "z": 1.0}, "positioning": ["INDOOR"], "workforceExempt": true},
		{"key": "HABITAT", "size": {"x": 1.0, "y": 1.0, "z": 1.0}, "positioning": ["INDOOR"], "workforceExempt": true,
			"housing": {"housingTier": 1.0, "maxInhabitants": 50.0}},
		{"key": "COLLECTOR", "size": {"x": 1.0, "y": 1.0, "z": 1.0}, "positioning": ["OUTDOOR"],
			"workforce": {"requiredWorkers": 4.0}},
		{"key": "STAIRCASE", "size": {"x": 1.0, "y": 1.0, "z": 1.0}, "positioning": ["INDOOR", "OUTDOOR"],
			"verticalAccess": true, "workforceExempt": true},
		{"key": "FARM", "size": {"x": 2.0, "y": 2.0, "z": 1.0}, "positioning": ["INDOOR"],
			"workforce": {"requiredWorkers": 5.0}},
	],
	"hulls": [
		{"key": "STARTER", "modulePositioning": "INDOOR", "environments": ["SURFACE"]},
		{"key": "PLATFORM_OUTDOOR", "modulePositioning": "OUTDOOR", "environments": ["SURFACE"]},
	],
}
const TYPES := {"M": "MINE", "H": "HABITAT", "S": "STORAGE", "C": "COLLECTOR", "E": "STAIRCASE"}
const OK := BuildRules.Verdict.OK

var _definitions: GameDefinitions


func before() -> void:
	_definitions = GameDefinitions.from_bundle(BUNDLE)


# --- the state --------------------------------------------------------------------------------

func test_start_block_has_entrances_and_reaches_every_module() -> void:
	# The start block: free cells (0,1), (0,2), (3,1), (3,2) at the edge.
	var layout := _build({0: ["MMMM", "#MM#", "#MM#", "MMMM"]})
	var access := PathAccess.of(layout, _definitions)

	assert_array(access.entrances).contains_exactly(
		[Vector3i(0, 1, 0), Vector3i(0, 2, 0), Vector3i(3, 1, 0), Vector3i(3, 2, 0)])
	assert_array(access.unconnected_modules()).is_empty()
	assert_bool(access.level_connected(0)).is_true()


func test_a_corner_is_enough_to_connect_a_module() -> void:
	# The mine at (1,1) touches the corridor (0,0) only at a corner (W1).
	var layout := _build({0: ["#S", "SM"]})
	var access := PathAccess.of(layout, _definitions)

	assert_bool(access.module_connected(_id(layout, Vector3i(1, 1, 0)))).is_true()


func test_a_module_without_a_corridor_is_unconnected() -> void:
	var layout := _build({0: ["#SM"]})
	var access := PathAccess.of(layout, _definitions)
	var mine := _id(layout, Vector3i(2, 0, 0))

	assert_bool(access.is_required(mine)).is_true()
	assert_bool(access.module_connected(mine)).is_false()
	assert_array(access.unconnected_modules()).contains_exactly([mine])


func test_who_needs_a_corridor() -> void:
	# Staff or inhabitants in an INDOOR hull: yes. Storage, shafts, modules on platforms: no (W2).
	var layout := _build({0: ["SMSHSCSE"], 1: [".......#"]})
	var access := PathAccess.of(layout, _definitions)

	assert_bool(access.is_required(_id(layout, Vector3i(1, 0, 0)))).is_true()
	assert_bool(access.is_required(_id(layout, Vector3i(3, 0, 0)))).is_true()
	assert_bool(access.is_required(_id(layout, Vector3i(0, 0, 0)))).is_false()
	assert_bool(access.is_required(_id(layout, Vector3i(5, 0, 0)))).is_false()
	assert_bool(access.is_required(_id(layout, Vector3i(7, 0, 0)))).is_false()
	assert_bool(PathAccess.requires_access(_definitions, "COLLECTOR", "STARTER")).is_true()
	assert_bool(PathAccess.requires_access(_definitions, "MINE", "PLATFORM_OUTDOOR")).is_false()
	assert_bool(PathAccess.requires_access(_definitions, "HABITAT", "STARTER")).is_true()
	assert_bool(PathAccess.requires_access(_definitions, "STAIRCASE", "STARTER")).is_false()


func test_an_outdoor_platform_is_no_corridor_and_no_entrance() -> void:
	# W3: the free platform (1,0) between the corridor and the mine does not carry staff.
	var layout := _build({0: ["#oM"]})
	var access := PathAccess.of(layout, _definitions)

	assert_bool(access.module_connected(_id(layout, Vector3i(2, 0, 0)))).is_false()
	assert_array(access.entrances).contains_exactly([Vector3i(0, 0, 0)])
	assert_array(access.corridors(0)[0]).contains_exactly([Vector3i(0, 0, 0)])


func test_an_inner_hull_is_no_entrance() -> void:
	# The free hull in the middle has a hull on every side.
	var layout := _build({0: ["SSS", "S#S", "SSS"]})
	var access := PathAccess.of(layout, _definitions)

	assert_array(access.entrances).is_empty()
	assert_bool(access.level_connected(0)).is_false()
	assert_array(access.corridors(0)[1]).contains_exactly([Vector3i(1, 1, 0)])
	assert_vector(access.open_side(Vector3i(1, 1, 0))).is_equal(Vector3i.ZERO)


func test_open_side_of_an_entrance() -> void:
	var layout := _build({0: ["S#S", "SSS"]})
	var access := PathAccess.of(layout, _definitions)

	assert_bool(access.is_entrance(Vector3i(1, 0, 0))).is_true()
	assert_vector(access.open_side(Vector3i(1, 0, 0))).is_equal(Vector3i(0, -1, 0))


func test_a_shaft_connects_the_level_above() -> void:
	var layout := _build({0: ["##E"], 1: ["M##"]})
	var access := PathAccess.of(layout, _definitions)

	assert_bool(access.level_connected(1)).is_true()
	assert_bool(access.module_connected(_id(layout, Vector3i(0, 0, 1)))).is_true()
	assert_bool(access.reached.has(Vector3i(2, 0, 1))).is_true()


func test_a_level_without_a_shaft_is_not_connected() -> void:
	var layout := _build({0: ["###"], 1: ["M##"]})
	var access := PathAccess.of(layout, _definitions)

	assert_bool(access.level_connected(1)).is_false()
	assert_bool(access.module_connected(_id(layout, Vector3i(0, 0, 1)))).is_false()
	assert_array(access.corridors(1)[1]).contains_exactly([Vector3i(1, 0, 1), Vector3i(2, 0, 1)])


func test_levels_connect_only_through_a_connected_level() -> void:
	# A shaft from level 1 to 2, but nothing leads from level 0 to level 1: both stay cut off (W5).
	var cut := PathAccess.of(_build({0: ["###"], 1: ["##E"], 2: ["M.#"]}), _definitions)
	assert_bool(cut.level_connected(1)).is_false()
	assert_bool(cut.level_connected(2)).is_false()

	# The chain 0 → 1 → 2 through two shafts in different columns.
	var chain := _build({0: ["E##"], 1: ["##E"], 2: ["M##"]})
	var access := PathAccess.of(chain, _definitions)
	assert_bool(access.level_connected(1)).is_true()
	assert_bool(access.level_connected(2)).is_true()
	assert_bool(access.module_connected(_id(chain, Vector3i(0, 0, 2)))).is_true()


func test_a_shaft_needs_a_reached_corridor_at_its_foot() -> void:
	# The staircase stands behind a storage wall on level 0: it is not reached, nor is level 1.
	var layout := _build({0: ["#S.", "SSE"], 1: ["...", "#.#"]})
	var access := PathAccess.of(layout, _definitions)

	assert_bool(access.level_connected(1)).is_false()


func test_a_shaft_from_below_the_ground() -> void:
	# Level -1 is reached through a staircase whose head stands on level 0.
	var layout := _build({-1: ["E#M"], 0: ["##."]})
	var access := PathAccess.of(layout, _definitions)

	assert_bool(access.level_connected(-1)).is_true()
	assert_bool(access.module_connected(_id(layout, Vector3i(2, 0, -1)))).is_true()


func test_a_two_floor_shaft_links_three_levels() -> void:
	var layout := _build({0: ["#E"], 1: [".E"], 2: ["M#"]})
	var access := PathAccess.of(layout, _definitions)

	assert_bool(access.level_connected(1)).is_true()
	assert_bool(access.level_connected(2)).is_true()
	assert_bool(access.module_connected(_id(layout, Vector3i(0, 0, 2)))).is_true()


# --- checks -----------------------------------------------------------------------------------

## A closed block with one entrance at (0,1) and a mine at (3,1) behind a corridor.
func _block() -> StructureLayout:
	return _build({0: ["SSSSS", "###MS", "SSSSS"]})


func test_placing_on_the_only_corridor_cuts_a_module_off() -> void:
	var layout := _block()
	var access := PathAccess.of(layout, _definitions)

	var check := access.check_place_module(_definitions, "STORAGE", Vector3i(1, 1, 0))
	assert_int(check.verdict).is_equal(BuildRules.Verdict.CUTS_OFF)
	assert_array(check.modules).contains_exactly([_id(layout, Vector3i(3, 1, 0))])
	# A staffed module next to it would stand fine itself but takes the mine's only corridor.
	assert_int(access.check_place_module(_definitions, "MINE", Vector3i(2, 1, 0)).verdict) \
		.is_equal(BuildRules.Verdict.CUTS_OFF)


func test_placing_on_the_last_entrance_is_refused() -> void:
	var access := PathAccess.of(_block(), _definitions)

	assert_int(access.check_place_module(_definitions, "STORAGE", Vector3i(0, 1, 0)).verdict) \
		.is_equal(BuildRules.Verdict.NO_ENTRANCE)


func test_a_staffed_module_needs_a_reached_corridor_beside_it() -> void:
	# (1,1) has the free corridor (2,1) … but placing at (2,1) itself is the question here: a mine in
	# a dead end of a corridor beside storage only.
	var layout := _build({0: ["SSSSS", "##S#S", "SSSSS"]})
	var access := PathAccess.of(layout, _definitions)

	assert_int(access.check_place_module(_definitions, "MINE", Vector3i(3, 1, 0)).verdict) \
		.is_equal(BuildRules.Verdict.NO_CORRIDOR)
	assert_int(access.check_place_module(_definitions, "MINE", Vector3i(1, 1, 0)).verdict).is_equal(OK)
	# Storage needs no corridor.
	assert_int(access.check_place_module(_definitions, "STORAGE", Vector3i(3, 1, 0)).verdict).is_equal(OK)


func test_on_a_level_that_is_not_connected_only_required_modules_wait() -> void:
	var access := PathAccess.of(_build({0: ["###"], 1: ["###"]}), _definitions)

	assert_int(access.check_place_module(_definitions, "MINE", Vector3i(0, 0, 1)).verdict) \
		.is_equal(BuildRules.Verdict.LEVEL_NOT_CONNECTED)
	assert_int(access.check_place_module(_definitions, "HABITAT", Vector3i(0, 0, 1)).verdict) \
		.is_equal(BuildRules.Verdict.LEVEL_NOT_CONNECTED)
	assert_int(access.check_place_module(_definitions, "STORAGE", Vector3i(0, 0, 1)).verdict).is_equal(OK)
	assert_int(access.check_place_module(_definitions, "STAIRCASE", Vector3i(0, 0, 0)).verdict).is_equal(OK)


func test_without_any_entrance_a_required_module_on_the_ground_is_refused() -> void:
	var access := PathAccess.of(_build({0: ["SSS", "S#S", "SSS"]}), _definitions)

	assert_int(access.check_place_module(_definitions, "MINE", Vector3i(1, 1, 0)).verdict) \
		.is_equal(BuildRules.Verdict.NO_ENTRANCE)


func test_existing_problems_do_not_block_other_builds() -> void:
	# The mine at (4,1) is cut off already; building elsewhere changes nothing for it (W6).
	var layout := _build({0: ["SSSSSS", "##SSMS", "SSSSSS"]})
	var access := PathAccess.of(layout, _definitions)
	assert_bool(access.module_connected(_id(layout, Vector3i(4, 1, 0)))).is_false()

	assert_int(access.check_place_module(_definitions, "STORAGE", Vector3i(1, 1, 0)).verdict).is_equal(OK)
	assert_int(access.check_remove_hull(Vector3i(1, 1, 0)).verdict).is_equal(OK)
	# No entrance at all: nothing can get worse.
	var closed := PathAccess.of(_build({0: ["SSS", "S#S", "SSS"]}), _definitions)
	assert_int(closed.check_place_module(_definitions, "STORAGE", Vector3i(1, 1, 0)).verdict).is_equal(OK)
	assert_int(closed.check_place_hulls([Vector3i(3, 1, 0)], false).verdict).is_equal(OK)


func test_removing_a_hull_may_not_cut_off() -> void:
	# Level 1: shaft head (0,0,1), corridor (1,0,1) and (2,0,1), mine at (3,0,1).
	var layout := _build({0: ["E##"], 1: ["###M"]})
	var access := PathAccess.of(layout, _definitions)

	var check := access.check_remove_hull(Vector3i(2, 0, 1))
	assert_int(check.verdict).is_equal(BuildRules.Verdict.CUTS_OFF)
	assert_array(check.modules).contains_exactly([_id(layout, Vector3i(3, 0, 1))])
	# On the ground a removed hull opens its neighbours to the outside: they become entrances.
	assert_int(PathAccess.of(_block(), _definitions).check_remove_hull(Vector3i(1, 1, 0)).verdict).is_equal(OK)


func test_removing_a_shaft_cuts_its_levels_off() -> void:
	var layout := _build({0: ["E##"], 1: ["##E"], 2: ["M##"]})
	var access := PathAccess.of(layout, _definitions)
	var lower := _id(layout, Vector3i(0, 0, 0))
	var upper := _id(layout, Vector3i(2, 0, 1))

	var check := access.check_remove_modules([lower])
	assert_int(check.verdict).is_equal(BuildRules.Verdict.CUTS_OFF)
	assert_array(check.levels).contains_exactly([1, 2])
	assert_array(check.modules).contains_exactly([_id(layout, Vector3i(0, 0, 2))])
	assert_array(access.check_remove_modules([upper]).levels).contains_exactly([2])
	# Any other module frees its cells: never worse.
	assert_int(access.check_remove_modules([_id(layout, Vector3i(0, 0, 2))]).verdict).is_equal(OK)


func test_a_new_hull_may_not_close_the_last_entrance() -> void:
	var access := PathAccess.of(_block(), _definitions)

	# A platform before the entrance closes it; a free indoor hull there is a new entrance.
	assert_int(access.check_place_hulls([Vector3i(-1, 1, 0)], false).verdict).is_equal(BuildRules.Verdict.NO_ENTRANCE)
	assert_int(access.check_place_hulls([Vector3i(-1, 1, 0)], true).verdict).is_equal(OK)


func test_a_new_hull_may_not_cut_off_through_a_lost_entrance() -> void:
	# Two entrances: (0,1) leads to the mine, (6,1) to nothing; closing (0,1) cuts the mine off.
	var layout := _build({0: ["SSSSSSS", "#M#SS##", "SSSSSSS"]})
	var access := PathAccess.of(layout, _definitions)

	var check := access.check_place_hulls([Vector3i(-1, 1, 0)], false)
	assert_int(check.verdict).is_equal(BuildRules.Verdict.CUTS_OFF)
	assert_array(check.modules).contains_exactly([_id(layout, Vector3i(1, 1, 0))])


func test_a_big_module_blocking_a_wide_corridor() -> void:
	# A corridor two fields wide from the entrance to a mine; a 2×2 farm fills it.
	var layout := _build({0: ["SSSSSS", "####MS", "S###SS", "SSSSSS"]})
	var access := PathAccess.of(layout, _definitions)

	var check := access.check_place_module(_definitions, "FARM", Vector3i(2, 1, 0))
	assert_int(check.verdict).is_equal(BuildRules.Verdict.CUTS_OFF)
	assert_array(check.modules).contains_exactly([_id(layout, Vector3i(4, 1, 0))])


# --- the spots of a level ---------------------------------------------------------------------

func test_spots_colour_every_free_indoor_hull() -> void:
	var spots := PathAccess.of(_block(), _definitions).placement_spots(_definitions, "MINE", 0)

	# (0,1) is the last entrance, (1,1) and (2,1) carry the mine's way.
	assert_array(spots.good).is_empty()
	assert_array(spots.bad).contains_exactly([Vector3i(0, 1, 0), Vector3i(1, 1, 0), Vector3i(2, 1, 0)])
	assert_int((spots.checks[Vector3i(0, 1, 0)] as PathAccess.Check).verdict).is_equal(BuildRules.Verdict.NO_ENTRANCE)


func test_spots_wait_on_a_level_that_is_not_connected() -> void:
	var access := PathAccess.of(_build({0: ["###"], 1: ["###"]}), _definitions)

	var spots := access.placement_spots(_definitions, "MINE", 1)
	assert_array(spots.waiting).has_size(3)
	assert_array(access.placement_spots(_definitions, "STORAGE", 1).good).has_size(3)


func test_spots_of_a_big_module_need_its_whole_footprint() -> void:
	var layout := _build({0: ["SSSSSS", "####MS", "S###SS", "SSSSSS"]})
	var spots := PathAccess.of(layout, _definitions).placement_spots(_definitions, "FARM", 0)

	# (3,1) would cover (4,1), the mine: the footprint does not fit.
	assert_int((spots.checks[Vector3i(3, 1, 0)] as PathAccess.Check).verdict).is_equal(BuildRules.Verdict.HULL_OCCUPIED)
	assert_int((spots.checks[Vector3i(2, 1, 0)] as PathAccess.Check).verdict).is_equal(BuildRules.Verdict.CUTS_OFF)


func test_spots_agree_with_the_full_check_on_random_structures() -> void:
	var random := RandomNumberGenerator.new()
	random.seed = 1911
	var compared := 0
	for pass_index: int in 40:
		var maps := {}
		for z: int in [0, 1]:
			var rows: Array[String] = []
			for y: int in 7:
				var row := ""
				for x: int in 8:
					var roll := random.randf()
					if z == 1 and roll < 0.25:
						row += "."
					elif roll < 0.55:
						row += "#"
					elif roll < 0.72:
						row += "M"
					elif roll < 0.85:
						row += "S"
					elif roll < 0.9:
						row += "o"
					elif z == 0 and roll < 0.95:
						row += "E"
					else:
						row += "H"
				rows.append(row)
			maps[z] = rows
		var layout := _build(_fix_heads(maps))
		for module_type: String in ["MINE", "STORAGE", "FARM"]:
			for z: int in [0, 1]:
				var access := PathAccess.of(layout, _definitions)
				var spots := access.placement_spots(_definitions, module_type, z)
				var fresh := PathAccess.reckon(access.grid)
				for origin: Vector3i in spots.checks.keys():
					var quick := spots.checks[origin] as PathAccess.Check
					if quick.verdict == BuildRules.Verdict.HULL_OCCUPIED:
						continue
					var full := fresh.check_place_module(_definitions, module_type, origin)
					compared += 1
					assert_int(quick.verdict).override_failure_message(
						"round %d %s at %s: quick %s, full %s" % [pass_index, module_type, origin,
							BuildRules.Verdict.keys()[quick.verdict], BuildRules.Verdict.keys()[full.verdict]]).is_equal(full.verdict)
					assert_array(quick.modules).is_equal(full.modules)
					assert_array(quick.levels).is_equal(full.levels)
	assert_int(compared).is_greater(500)


# --- the cache and the server's word -----------------------------------------------------------

func test_the_paths_are_worked_out_once_per_state() -> void:
	var layout := _block()
	var first := PathAccess.of(layout, _definitions)

	assert_object(PathAccess.of(layout, _definitions)).is_same(first)
	layout.apply(Ndjson.parse(
		'{"line":"header","structureId":2,"anchor":{"type":"surface","offset":{"x":0,"y":0,"z":0}},"rev":2,"since":1,"chunks":0}\n'
		+ '{"line":"end","rev":2}'))
	assert_object(PathAccess.of(layout, _definitions)).is_not_same(first)


func test_the_ground_level_of_a_base_is_absolute_level_0() -> void:
	# A base whose local level 0 lies two levels below the surface: the ground is its local level 2.
	var base := _build({0: ["###"], 1: ["###"], 2: ["###"]},
		',"kind":"BASE","anchor":{"type":"surface","offset":{"x":0,"y":0,"z":-2}}')
	var access := PathAccess.of(base, _definitions)
	assert_int(access.ground()).is_equal(2)
	assert_array(access.entrances).contains_exactly([Vector3i(0, 0, 2), Vector3i(1, 0, 2), Vector3i(2, 0, 2)])
	assert_bool(access.level_connected(0)).is_false()
	assert_int(access.check_place_module(_definitions, "MINE", Vector3i(0, 0, 0)).verdict) \
		.is_equal(BuildRules.Verdict.LEVEL_NOT_CONNECTED)

	# A ship, a vehicle, a station or a guest: its own local level 0.
	var ship := _build({0: ["###"], 1: ["###"]}, ',"kind":"SHIP","anchor":{"type":"surface","offset":{"x":0,"y":0,"z":-1}}')
	assert_int(PathAccess.of(ship, _definitions).ground()).is_equal(0)
	var guest := _build({0: ["###"]}, ',"anchor":{"type":"docked","hostId":5,"offset":{"x":0,"y":0,"z":1}}')
	assert_int(PathAccess.of(guest, _definitions).ground()).is_equal(0)


func test_the_server_access_is_what_the_player_sees() -> void:
	# The server says more than this client reckons: its word is shown, the checks keep reckoning.
	var access_line := ',"access":{"ground":0,"entrances":[{"x":0,"y":0,"z":0}],' \
		+ '"levels":[{"z":0,"connected":true},{"z":1,"connected":true}],"unreachableModules":[]}'
	var layout := _build({0: ["#SM"], 1: ["###"]}, access_line)
	var access := PathAccess.of(layout, _definitions)
	var mine := _id(layout, Vector3i(2, 0, 0))

	assert_object(layout.access).is_not_null()
	assert_bool(access.module_connected(mine)).is_true()
	assert_bool(access.level_connected(1)).is_true()
	assert_array(access.unconnected_modules()).is_empty()
	# Its own reckoning differs (the mine has no corridor, level 1 no shaft).
	assert_bool(access.unconnected.has(mine)).is_true()
	assert_bool(access.agrees_with(layout.access)).is_false()


func test_the_own_reckoning_matches_a_sample_access() -> void:
	# Level 0: entrances (0,0), (0,1), (1,1); the staircase (2,1) leads up. Level 1: the head
	# (2,1,1) is reached, the corridor (0,1,1) is not (two fields away), so the mine above it is
	# unreachable.
	var maps := {0: ["#SM", "##E"], 1: ["M..", "#.#"]}
	var sample := ',"access":{"ground":0,"entrances":[{"x":0,"y":0,"z":0},{"x":0,"y":1,"z":0},{"x":1,"y":1,"z":0}],' \
		+ '"levels":[{"z":0,"connected":true},{"z":1,"connected":true}],"unreachableModules":[104]}'
	var layout := _build(maps, sample)
	assert_int(_id(layout, Vector3i(0, 0, 1))).is_equal(104)

	var access := PathAccess.of(layout, _definitions)
	assert_bool(access.agrees_with(layout.access)).is_true()
	assert_bool(access.module_connected(104)).is_false()
	assert_array(layout.access.entrances).contains_exactly(access.entrances)
	assert_bool(access.agrees_with(null)).is_false()


func test_a_large_station_stays_quick() -> void:
	# 60 × 60 cells on two levels: rows of modules with a corridor between every two rows.
	var rows: Array[String] = []
	for y: int in 60:
		var row := ""
		for x: int in 60:
			row += "#" if y % 3 == 0 or x == 0 else ("M" if (x + y) % 4 != 0 else "S")
		rows.append(row)
	var upper := rows.duplicate()
	var first: String = rows[0]
	rows[0] = "E" + first.substr(1)
	var layout := _build({0: rows, 1: upper})
	var started := Time.get_ticks_usec()
	var access := PathAccess.of(layout, _definitions)
	var reckoned := Time.get_ticks_usec() - started
	started = Time.get_ticks_usec()
	var spots := access.placement_spots(_definitions, "MINE", 0)
	var spotted := Time.get_ticks_usec() - started
	started = Time.get_ticks_usec()
	access.check_place_module(_definitions, "MINE", Vector3i(5, 3, 0))
	var single := Time.get_ticks_usec() - started
	print("paths of %d hulls: reckoned in %d ms, %d spots in %d ms, one full check %d ms" % [
		layout.hull_count(), reckoned / 1000, spots.checks.size(), spotted / 1000, single / 1000])
	assert_int(layout.hull_count()).is_equal(7200)
	assert_bool(access.level_connected(1)).is_true()
	assert_int(spots.checks.size()).is_greater(1000)


# --- helpers ----------------------------------------------------------------------------------

## Every staircase gets a hull above it: a "." above an "E" becomes "#".
func _fix_heads(maps: Dictionary) -> Dictionary:
	for z: int in maps.keys():
		if not maps.has(z + 1):
			continue
		var below: Array = maps[z]
		var above: Array = maps[z + 1]
		for y: int in below.size():
			var row_below: String = below[y]
			var row_above: String = above[y]
			for x: int in row_below.length():
				if row_below[x] == "E" and row_above[x] != "#":
					row_above = row_above.substr(0, x) + "#" + row_above.substr(x + 1)
			above[y] = row_above
	for z: int in maps.keys():
		if maps.has(z + 1):
			continue
		# The top level has nothing above: no staircases there.
		var top: Array = maps[z]
		for y: int in top.size():
			top[y] = (top[y] as String).replace("E", "#")
	return maps


## A layout from level pictures (z → rows); `header` adds to the header line (anchor, kind, access).
func _build(maps: Dictionary, header: String = "") -> StructureLayout:
	var hulls: Dictionary = {}
	var modules: Dictionary = {}
	var next_id := 100
	for z: int in maps.keys():
		var rows: Array = maps[z]
		for y: int in rows.size():
			var row: String = rows[y]
			for x: int in row.length():
				var mark := row[x]
				if mark == ".":
					continue
				var cell := Vector3i(x, y, z)
				var chunk := Vector3i(floori(x / 16.0), floori(y / 16.0), floori(z / 16.0))
				if not hulls.has(chunk):
					hulls[chunk] = []
					modules[chunk] = []
				var local := cell - chunk * 16
				(hulls[chunk] as Array).append("[%d,%d,%d,%d]" % [local.x, local.y, local.z, 1 if mark == "o" or mark == "C" else 0])
				if TYPES.has(mark):
					next_id += 1
					(modules[chunk] as Array).append(
						'{"moduleId":%d,"moduleType":"%s","x":%d,"y":%d,"z":%d,"size":{"x":1,"y":1,"z":1},"rotation":0,"status":"active"}' % [
							next_id, TYPES[mark], x, y, z])
	var lines := PackedStringArray()
	var anchor := "" if header.contains('"anchor"') else ',"anchor":{"type":"surface","offset":{"x":0,"y":0,"z":0}}'
	lines.append('{"line":"header","structureId":2,"rev":1,"chunks":%d%s%s}' % [hulls.size(), anchor, header])
	for chunk: Vector3i in hulls.keys():
		lines.append('{"line":"chunk","chunk":[%d,%d,%d],"version":1,"hullTypes":["STARTER","PLATFORM_OUTDOOR"],"hulls":[%s],"modules":[%s]}' % [
			chunk.x, chunk.y, chunk.z, ",".join(PackedStringArray(hulls[chunk] as Array)), ",".join(PackedStringArray(modules[chunk] as Array))])
	lines.append('{"line":"end","rev":1}')
	var layout := StructureLayout.new()
	layout.vertical_types = _definitions.vertical_types()
	assert_bool(layout.apply(Ndjson.parse("\n".join(lines)))).is_true()
	return layout


func _id(layout: StructureLayout, cell: Vector3i) -> int:
	var placed := layout.module_at(cell)
	assert_object(placed).is_not_null()
	return placed.module_id if placed != null else 0
