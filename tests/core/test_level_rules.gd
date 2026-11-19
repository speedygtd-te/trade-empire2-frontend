extends GdUnitTestSuite

const HULLS := [
	{"key": "STARTER", "modulePositioning": "INDOOR", "environments": ["SURFACE"]},
	{"key": "GLASS_CARBON", "modulePositioning": "INDOOR", "environments": ["SURFACE"]},
	{"key": "PRESSURIZED", "modulePositioning": "INDOOR", "environments": ["UNDERGROUND", "UNDERWATER"]},
	{"key": "REINFORCED", "modulePositioning": "INDOOR",
		"environments": ["SURFACE", "UNDERGROUND", "DEEP_UNDERGROUND", "UNDERWATER", "ASTEROID"]},
	{"key": "PLATFORM_UNDERWATER", "modulePositioning": "UNDER_WATER", "environments": ["UNDERWATER"]},
	{"key": "COMPOSITE", "modulePositioning": "INDOOR", "environments": ["SURFACE", "SPACE"]},
]

var _definitions: GameDefinitions
var _site: LevelRules.Site


func before_test() -> void:
	_definitions = GameDefinitions.from_bundle({"dataHash": "x", "modules": [
		{"key": "MINE", "zLevel": {"bonusPerLevelPercent": 2000000.0, "preferHigh": false}},
		{"key": "SOLAR_PANEL", "zLevel": {"bonusPerLevelPercent": 2000000.0, "preferHigh": true}},
		{"key": "SMELTER"},
	], "hulls": HULLS})
	_site = LevelRules.Site.new()
	_site.has_grid = true
	_site.min_z = -10
	_site.max_z = 100
	_site.deep_threshold = -6
	_site.body_type = "EARTH_LIKE"
	# Water east of x = 10.
	_site.biome_at = func(x: int, _y: int) -> String: return "OCEAN" if x >= 10 else "PLAINS"


func test_environment_by_depth_and_biome() -> void:
	assert_str(LevelRules.environment_at(0, "PLAINS", -6, "EARTH_LIKE")).is_equal(LevelRules.SURFACE)
	assert_str(LevelRules.environment_at(5, "OCEAN", -6, "EARTH_LIKE")).is_equal(LevelRules.SURFACE)
	assert_str(LevelRules.environment_at(0, "OCEAN", -6, "EARTH_LIKE")).is_equal(LevelRules.UNDERWATER)
	assert_str(LevelRules.environment_at(-1, "OCEAN", -6, "EARTH_LIKE")).is_equal(LevelRules.UNDERGROUND)
	assert_str(LevelRules.environment_at(-5, "", -6, "EARTH_LIKE")).is_equal(LevelRules.UNDERGROUND)
	assert_str(LevelRules.environment_at(-6, "", -6, "EARTH_LIKE")).is_equal(LevelRules.DEEP_UNDERGROUND)
	assert_str(LevelRules.environment_at(2, "", -6, "ASTEROID_C")).is_equal(LevelRules.ASTEROID)
	# A threshold of 0: every level below the ground is deep.
	assert_str(LevelRules.environment_at(-1, "", 0, "VOLCANIC")).is_equal(LevelRules.DEEP_UNDERGROUND)


func test_environment_of_a_cell_reads_the_ground_biome_only_at_level_zero() -> void:
	assert_str(LevelRules.environment_of(_site, Vector3i(12, 0, 0))).is_equal(LevelRules.UNDERWATER)
	assert_str(LevelRules.environment_of(_site, Vector3i(12, 0, 1))).is_equal(LevelRules.SURFACE)
	assert_str(LevelRules.environment_of(_site, Vector3i(2, 0, 0))).is_equal(LevelRules.SURFACE)
	# Without a biome source the ground level counts as dry.
	assert_str(LevelRules.environment_of(LevelRules.Site.new(), Vector3i(12, 0, 0))).is_equal(LevelRules.SURFACE)


func test_site_biome_is_empty_without_a_source() -> void:
	assert_str(LevelRules.Site.new().biome(1, 2)).is_empty()
	assert_str(_site.biome(11, 0)).is_equal("OCEAN")


func test_height_limits_of_single_hull_types() -> void:
	assert_bool(LevelRules.hull_z_allowed("STARTER", 0)).is_true()
	assert_bool(LevelRules.hull_z_allowed("STARTER", 1)).is_true()
	assert_bool(LevelRules.hull_z_allowed("STARTER", 2)).is_false()
	assert_bool(LevelRules.hull_z_allowed("STARTER", -1)).is_false()
	assert_bool(LevelRules.hull_z_allowed("GLASS_CARBON", 60)).is_true()
	assert_bool(LevelRules.hull_z_allowed("GLASS_CARBON", -1)).is_false()
	assert_bool(LevelRules.hull_z_allowed("REINFORCED", -10)).is_true()


func test_bounds_follow_the_grid() -> void:
	assert_bool(LevelRules.in_bounds(_site, -10)).is_true()
	assert_bool(LevelRules.in_bounds(_site, -11)).is_false()
	assert_bool(LevelRules.in_bounds(_site, 100)).is_true()
	assert_bool(LevelRules.in_bounds(_site, 101)).is_false()
	# Unknown grid: nothing to check.
	assert_bool(LevelRules.in_bounds(LevelRules.Site.new(), 500)).is_true()


func test_hull_cell_in_the_order_of_the_server() -> void:
	var ok := BuildRules.Verdict.OK
	assert_int(LevelRules.check_hull_cell(_definitions, "REINFORCED", Vector3i(0, 0, -1), _site)).is_equal(ok)
	assert_int(LevelRules.check_hull_cell(_definitions, "PRESSURIZED", Vector3i(0, 0, -5), _site)).is_equal(ok)
	assert_int(LevelRules.check_hull_cell(_definitions, "PRESSURIZED", Vector3i(0, 0, -6), _site)) \
		.is_equal(BuildRules.Verdict.INCOMPATIBLE_HULL)
	assert_int(LevelRules.check_hull_cell(_definitions, "STARTER", Vector3i(0, 0, 1), _site)).is_equal(ok)
	assert_int(LevelRules.check_hull_cell(_definitions, "STARTER", Vector3i(0, 0, 2), _site)) \
		.is_equal(BuildRules.Verdict.HULL_Z_RESTRICTED)
	# The height limit comes before the environment.
	assert_int(LevelRules.check_hull_cell(_definitions, "STARTER", Vector3i(0, 0, -1), _site)) \
		.is_equal(BuildRules.Verdict.HULL_Z_RESTRICTED)
	assert_int(LevelRules.check_hull_cell(_definitions, "REINFORCED", Vector3i(0, 0, -11), _site)) \
		.is_equal(BuildRules.Verdict.OUT_OF_BOUNDS)
	# Not a surface type at all, known or not.
	assert_int(LevelRules.check_hull_cell(_definitions, "COMPOSITE", Vector3i(0, 0, 0), _site)) \
		.is_equal(BuildRules.Verdict.INVALID_HULL_TYPE)
	assert_int(LevelRules.check_hull_cell(_definitions, "NOPE", Vector3i(0, 0, 0), _site)) \
		.is_equal(BuildRules.Verdict.INVALID_HULL_TYPE)


func test_water_takes_underwater_hulls_on_the_ground_level() -> void:
	assert_int(LevelRules.check_hull_cell(_definitions, "PLATFORM_UNDERWATER", Vector3i(12, 0, 0), _site)) \
		.is_equal(BuildRules.Verdict.OK)
	assert_int(LevelRules.check_hull_cell(_definitions, "STARTER", Vector3i(12, 0, 0), _site)) \
		.is_equal(BuildRules.Verdict.INCOMPATIBLE_HULL)
	assert_int(LevelRules.check_hull_cell(_definitions, "PLATFORM_UNDERWATER", Vector3i(2, 0, 0), _site)) \
		.is_equal(BuildRules.Verdict.INCOMPATIBLE_HULL)


func test_overhang_needs_one_of_nine_cells_below() -> void:
	var base := StructureLayout.new()
	base.apply(Ndjson.parse(
		'{"line":"header","structureId":1,"anchor":{"type":"surface","offset":{"x":10,"y":20,"z":0}},"rev":1,"chunks":1}\n'
		+ '{"line":"chunk","chunk":[0,0,0],"version":1,"hullTypes":["STARTER"],"hulls":[[0,0,0,0]],"modules":[]}\n'
		+ '{"line":"end","rev":1}'))
	var layouts: Array[StructureLayout] = [base]

	# Cells are absolute: the hull stands at (10, 20, 0).
	assert_bool(LevelRules.overhang_ok(layouts, Vector3i(10, 20, 1))).is_true()
	assert_bool(LevelRules.overhang_ok(layouts, Vector3i(11, 21, 1))).is_true()
	assert_bool(LevelRules.overhang_ok(layouts, Vector3i(12, 20, 1))).is_false()
	assert_bool(LevelRules.overhang_ok(layouts, Vector3i(10, 20, 2))).is_false()
	# On and below the ground there is no overhang.
	assert_bool(LevelRules.overhang_ok(layouts, Vector3i(50, 50, 0))).is_true()
	assert_bool(LevelRules.overhang_ok(layouts, Vector3i(50, 50, -3))).is_true()


func test_level_range_reaches_one_beyond_the_structure_within_the_grid() -> void:
	var flat: Array[int] = [0]
	var tall: Array[int] = [-2, -1, 0, 1, 2]
	var none: Array[int] = []
	assert_that(LevelRules.level_range(flat, _site)).is_equal(Vector2i(-1, 1))
	assert_that(LevelRules.level_range(tall, _site)).is_equal(Vector2i(-3, 3))
	assert_that(LevelRules.level_range(none, _site)).is_equal(Vector2i(-1, 1))
	_site.min_z = 0
	_site.max_z = 2
	assert_that(LevelRules.level_range(tall, _site)).is_equal(Vector2i(0, 2))
	# Without a site there is no grid to clamp to.
	assert_that(LevelRules.level_range(flat, null)).is_equal(Vector2i(-1, 1))


func test_z_factor_rewards_the_preferred_direction() -> void:
	var mine := _definitions.module("MINE")
	var solar := _definitions.module("SOLAR_PANEL")
	assert_float(LevelRules.z_factor(mine, 0)).is_equal_approx(1.0, 0.0001)
	assert_float(LevelRules.z_factor(mine, -3)).is_equal_approx(1.06, 0.0001)
	assert_float(LevelRules.z_factor(mine, 2)).is_equal_approx(0.96, 0.0001)
	assert_float(LevelRules.z_factor(solar, 5)).is_equal_approx(1.10, 0.0001)
	# Never below the floor.
	assert_float(LevelRules.z_factor(solar, -90)).is_equal_approx(LevelRules.MIN_Z_FACTOR, 0.0001)
	assert_float(LevelRules.z_factor(_definitions.module("SMELTER"), 7)).is_equal_approx(1.0, 0.0001)
	assert_float(LevelRules.z_factor(null, 7)).is_equal_approx(1.0, 0.0001)


func test_z_percent_rounds_the_change() -> void:
	assert_int(LevelRules.z_percent(_definitions.module("MINE"), -3)).is_equal(6)
	assert_int(LevelRules.z_percent(_definitions.module("MINE"), 2)).is_equal(-4)
	assert_int(LevelRules.z_percent(_definitions.module("SMELTER"), 2)).is_equal(0)
