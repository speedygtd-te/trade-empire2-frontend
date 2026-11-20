class_name LevelRules
extends RefCounted
## Building on several levels (z, absolute): the environment of a cell, which hull may stand
## there, the overhang rule above the ground, the levels the player can switch between and the
## production factor a module gets from its level.
##
## Deep water (draft.39): a water tile has a water column over several levels; every level of it
## carries the surface's water biome (`GET /v2/bodies/{id}/surface?z=…`) and is UNDERWATER, the sea
## floor below is UNDERGROUND / DEEP_UNDERGROUND (threshold still counted from level 0). Up to
## draft.38 a level below the ground never carries a water biome, so the same rules give the old
## answer there.
##
## Sources: contract `Grid.minZ/maxZ`, `Body.deepThreshold`, `DefHull.environments`,
## `DefModule.zLevel`; fixed in the server and not in the contract: the hull types allowed on a
## surface, the height limits of STARTER and GLASS_CARBON, the overhang rule and the shaft height.
## Only a preview: the server decides.

const SURFACE := "SURFACE"
const UNDERGROUND := "UNDERGROUND"
const DEEP_UNDERGROUND := "DEEP_UNDERGROUND"
const UNDERWATER := "UNDERWATER"
const ASTEROID := "ASTEROID"

## Water biomes (te-gen `is_underwater_biome`): a cell carrying one at level 0 or below is under
## water.
const WATER_BIOMES: PackedStringArray = [
	"OCEAN", "DEEP_OCEAN", "SHALLOW_WATER", "REEF", "KELP_FOREST", "ACID_LAKE", "FROZEN_LAKE", "VOLCANIC_VENT",
]
## Display only, not in the contract: ground a structure stands on concrete piers over instead of a
## solid foundation (Piers; Rudi 2026-11-20): water, molten or unstable volcanic ground and swamp.
## Solid volcanic ground (BASALT_PLAIN, ASH_FIELD, OBSIDIAN_RIDGE) keeps normal foundations.
enum PierGround { NONE, WATER, LAVA, SWAMP }
const LAVA_BIOMES: PackedStringArray = ["LAVA_FLOW", "CALDERA", "FUMAROLE"]
const SWAMP_BIOMES: PackedStringArray = ["SWAMP", "TOXIC_MARSH"]
const PIER_BIOMES: PackedStringArray = [
	"OCEAN", "DEEP_OCEAN", "SHALLOW_WATER", "REEF", "KELP_FOREST", "ACID_LAKE", "FROZEN_LAKE", "VOLCANIC_VENT",
	"LAVA_FLOW", "CALDERA", "FUMAROLE", "SWAMP", "TOXIC_MARSH",
]
## Body types whose cells are ASTEROID instead of SURFACE.
const ASTEROID_BODIES: PackedStringArray = ["ASTEROID_M", "ASTEROID_C", "ASTEROID_S"]
## Hull types the server takes on a body's surface (any other: INVALID_HULL_TYPE). A guest on a
## dock takes every known hull type. The six enterprise hulls stand on the ground too (draft.38).
const SURFACE_HULLS: PackedStringArray = [
	"STARTER", "STANDARD", "AIRTIGHT", "PRESSURIZED", "REINFORCED", "GLASS_CARBON", "PLATFORM_OUTDOOR",
	"PLATFORM_UNDERWATER", "DOCK", "ENTERPRISE_HULL_STANDARD", "ENTERPRISE_HULL_GLASS",
	"ENTERPRISE_HULL_ARMORED", "ENTERPRISE_PLATFORM", "ENTERPRISE_PLATFORM_ARMORED", "ENTERPRISE_DOCK",
]
## Height limits of single hull types (inclusive; NO_LIMIT: open upwards). On a guest they apply
## to its local level.
const NO_LIMIT := 1 << 30
const HULL_Z_RANGE := {
	"STARTER": Vector2i(0, 1),
	"GLASS_CARBON": Vector2i(0, NO_LIMIT),
}
## A shaft (staircase, elevator) has at most this many floors.
const MAX_SHAFT_FLOORS := 20
## The production factor of a level never drops below this.
const MIN_Z_FACTOR := 0.1
## `DefModule.zLevel.bonusPerLevelPercent` is micro-percent: 1 000 000 = 1 %.
const MICRO_PERCENT := 1000000.0


## What the level rules need to know about the body.
class Site:
	extends RefCounted
	## Whether the body has a grid (gas and ice giants do not); without one nothing is checked.
	var has_grid := false
	## Inclusive level range of the grid.
	var min_z := 0
	var max_z := 0
	## From this (negative) level down the cells are DEEP_UNDERGROUND.
	var deep_threshold := 0
	## `Body.type` (EARTH_LIKE, ASTEROID_M …).
	var body_type := ""
	## (x, y, z) of an absolute cell → biome key at that level (the surface query of level z);
	## "" while unknown. An invalid callable counts as unknown everywhere.
	var biome_at := Callable()

	## The biome at an absolute cell (level 0: the ground level); "" when unknown.
	func biome(x: int, y: int, z: int = 0) -> String:
		if not biome_at.is_valid():
			return ""
		return Wire.as_string(biome_at.call(x, y, z))


## Whether a biome is water (ocean, lake, reef …).
static func is_water_biome(biome: String) -> bool:
	return WATER_BIOMES.has(biome)


## Whether a structure stands on piers over a biome (PIER_BIOMES).
static func is_pier_biome(biome: String) -> bool:
	return PIER_BIOMES.has(biome)


## Which pier ground a biome is: water, lava, swamp, or NONE (solid ground).
static func pier_ground(biome: String) -> PierGround:
	if WATER_BIOMES.has(biome):
		return PierGround.WATER
	if LAVA_BIOMES.has(biome):
		return PierGround.LAVA
	if SWAMP_BIOMES.has(biome):
		return PierGround.SWAMP
	return PierGround.NONE


## Environment of a cell at level `z` from the biome at that level (`biome`, "" when unknown):
## under water on a water biome at or below the ground level (the water column, before the depth
## rule), under the ground by depth, otherwise the body's default (SURFACE, or ASTEROID).
static func environment_at(z: int, biome: String, deep_threshold: int, body_type: String) -> String:
	if z <= 0 and is_water_biome(biome):
		return UNDERWATER
	if z < 0 and z <= deep_threshold:
		return DEEP_UNDERGROUND
	if z < 0:
		return UNDERGROUND
	return ASTEROID if ASTEROID_BODIES.has(body_type) else SURFACE


## Environment of an absolute cell on a site, from the biome at its level.
static func environment_of(site: Site, cell: Vector3i) -> String:
	var biome := site.biome(cell.x, cell.y, cell.z) if cell.z <= 0 else ""
	return environment_at(cell.z, biome, site.deep_threshold, site.body_type)


## The environment most cells of level `z` have in the square of `radius` cells around `centre`
## (absolute column): what the level is about where the player looks. Ties go to the centre's.
static func level_environment(site: Site, centre: Vector2i, z: int, radius: int) -> String:
	var own := environment_of(site, Vector3i(centre.x, centre.y, z))
	var counts := {}
	for dy: int in range(-radius, radius + 1):
		for dx: int in range(-radius, radius + 1):
			var found := environment_of(site, Vector3i(centre.x + dx, centre.y + dy, z))
			counts[found] = Wire.as_int(counts.get(found)) + 1
	var best := own
	for key: String in counts.keys():
		if Wire.as_int(counts[key]) > Wire.as_int(counts[best]):
			best = key
	return best


## Whether a hull type's own height limit allows level `z`.
static func hull_z_allowed(hull_type: String, z: int) -> bool:
	if not HULL_Z_RANGE.has(hull_type):
		return true
	var limits: Vector2i = HULL_Z_RANGE[hull_type]
	return z >= limits.x and z <= limits.y


## Whether a level lies within the body's grid.
static func in_bounds(site: Site, z: int) -> bool:
	return not site.has_grid or (z >= site.min_z and z <= site.max_z)


## The cell rules of a hull of the host (not a guest) at an absolute cell, in the server's order:
## a surface hull type, the grid, the type's height limit, the environment. OK when they pass.
static func check_hull_cell(definitions: GameDefinitions, hull_type: String, cell: Vector3i, site: Site) -> BuildRules.Verdict:
	var hull_def := definitions.hull(hull_type)
	if hull_def == null or not SURFACE_HULLS.has(hull_type):
		return BuildRules.Verdict.INVALID_HULL_TYPE
	if not in_bounds(site, cell.z):
		return BuildRules.Verdict.OUT_OF_BOUNDS
	if not hull_z_allowed(hull_type, cell.z):
		return BuildRules.Verdict.HULL_Z_RESTRICTED
	if site.has_grid and not hull_def.environments.has(environment_of(site, cell)):
		return BuildRules.Verdict.INCOMPATIBLE_HULL
	return BuildRules.Verdict.OK


## Overhang: a hull at level 1 or higher needs a hull in at least one of the nine cells below it
## (x ± 1, y ± 1, z − 1), of any of `layouts`. `cell` is absolute.
static func overhang_ok(layouts: Array[StructureLayout], cell: Vector3i) -> bool:
	if cell.z < 1:
		return true
	for dy: int in [-1, 0, 1]:
		for dx: int in [-1, 0, 1]:
			var below := cell + Vector3i(dx, dy, -1)
			for layout: StructureLayout in layouts:
				if not layout.hull_at(layout.to_local(below)).is_empty():
					return true
	return false


## The levels the player can switch between: every level with a hull of the structure, one more
## above and below, and always the ground level, within the grid. `levels` are absolute. Where one
## of `columns` (absolute x, y; where the player looks) is known to be water at the lowest level,
## the range reaches one further down, so the player can follow a water column level by level to
## its sea floor (up to 60 levels deep) without building every level first.
static func level_range(levels: Array[int], site: Site, columns: Array[Vector2i] = []) -> Vector2i:
	var low := 0
	var high := 0
	for z: int in levels:
		low = mini(low, z)
		high = maxi(high, z)
	low -= 1
	high += 1
	if site != null:
		while site.has_grid and low > site.min_z and _water_in(site, columns, low):
			low -= 1
	if site != null and site.has_grid:
		low = maxi(low, site.min_z)
		high = mini(high, site.max_z)
	return Vector2i(low, maxi(low, high))


## Whether any of `columns` is known to carry a water biome at level `z` (z ≤ 0).
static func _water_in(site: Site, columns: Array[Vector2i], z: int) -> bool:
	if z > 0:
		return false
	for column: Vector2i in columns:
		if is_water_biome(site.biome(column.x, column.y, z)):
			return true
	return false


## Production factor of a module at level `z` (1 = neutral): it grows per level up (preferHigh)
## or down, and never drops below MIN_Z_FACTOR. 1 for modules without a level modifier.
static func z_factor(module_def: GameDefinitions.ModuleDef, z: int) -> float:
	if module_def == null or module_def.z_bonus_percent == 0:
		return 1.0
	var steps := z if module_def.z_prefer_high else -z
	return maxf(MIN_Z_FACTOR, 1.0 + steps * module_def.z_bonus_percent / MICRO_PERCENT / 100.0)


## The change of production at level `z` in whole percent (+6, −4, 0), for the hint.
static func z_percent(module_def: GameDefinitions.ModuleDef, z: int) -> int:
	return roundi((z_factor(module_def, z) - 1.0) * 100.0)
