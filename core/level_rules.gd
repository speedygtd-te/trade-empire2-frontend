class_name LevelRules
extends RefCounted
## Building on several levels (z, absolute): the environment of a cell, which hull may stand
## there, the overhang rule above the ground, the levels the player can switch between and the
## production factor a module gets from its level.
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

## Biomes of the ground level that put a cell under water (z = 0 only).
const WATER_BIOMES: PackedStringArray = [
	"OCEAN", "DEEP_OCEAN", "SHALLOW_WATER", "REEF", "KELP_FOREST", "ACID_LAKE", "FROZEN_LAKE", "VOLCANIC_VENT",
]
## Body types whose cells are ASTEROID instead of SURFACE.
const ASTEROID_BODIES: PackedStringArray = ["ASTEROID_M", "ASTEROID_C", "ASTEROID_S"]
## Hull types the server takes on a body's surface (any other: INVALID_HULL_TYPE). A guest on a
## dock takes every known hull type.
const SURFACE_HULLS: PackedStringArray = [
	"STARTER", "STANDARD", "AIRTIGHT", "PRESSURIZED", "REINFORCED", "GLASS_CARBON", "PLATFORM_OUTDOOR",
	"PLATFORM_UNDERWATER", "DOCK",
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
	## (x, y) of an absolute cell → biome key of the ground level there; "" while unknown. An
	## invalid callable counts as unknown everywhere.
	var biome_at := Callable()

	## The biome of the ground level at an absolute column; "" when unknown.
	func biome(x: int, y: int) -> String:
		if not biome_at.is_valid():
			return ""
		return Wire.as_string(biome_at.call(x, y))


## Environment of a cell at level `z`: under the ground by depth, under water on a water biome of
## the ground level, otherwise the body's default (SURFACE, or ASTEROID on asteroids).
static func environment_at(z: int, ground_biome: String, deep_threshold: int, body_type: String) -> String:
	if z < 0 and z <= deep_threshold:
		return DEEP_UNDERGROUND
	if z < 0:
		return UNDERGROUND
	if z == 0 and WATER_BIOMES.has(ground_biome):
		return UNDERWATER
	return ASTEROID if ASTEROID_BODIES.has(body_type) else SURFACE


## Environment of an absolute cell on a site.
static func environment_of(site: Site, cell: Vector3i) -> String:
	var biome := site.biome(cell.x, cell.y) if cell.z == 0 else ""
	return environment_at(cell.z, biome, site.deep_threshold, site.body_type)


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
## above and below, and always the ground level, within the grid. `levels` are absolute.
static func level_range(levels: Array[int], site: Site) -> Vector2i:
	var low := 0
	var high := 0
	for z: int in levels:
		low = mini(low, z)
		high = maxi(high, z)
	low -= 1
	high += 1
	if site != null and site.has_grid:
		low = maxi(low, site.min_z)
		high = mini(high, site.max_z)
	return Vector2i(low, maxi(low, high))


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
