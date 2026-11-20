class_name ExtractionYield
extends RefCounted
## What an extracting recipe (a blueprint with `requiredTileResource` or `requiredAtmosphereGas`:
## mine, pump, deep drill, collector …) yields at a place — a preview for the inspect card, the
## build preview and the recipe list. The server decides; its rate solution (`BucketRate`) is the
## truth for a module that stands.
##
## The server's nominal output (Backend-V2 `crates/sim/src/statics.rs` `nominal_output`, factors
## from `crates/game/src/production/model.rs` `statics`/`add_module`):
##   recipe rate × emission × planet × z-level × richness / 100, rounded down once.
## The planet factor is 1 there for now (`planet: Ratio::ONE`); the emission factor depends on the
## neighbours and is left out here (1). So this preview is
##   recipe rate × z-level × richness / 100
## "at full staff and power"; workforce, power and the run factor come on top in `effective`.
##
## Richness (0..100, `crates/game/src/body.rs` `deposit_richness`, `tile_richness`):
## - a tile resource: the cell's deposit at the module's level — the surface stream sends it per
##   level without the depth bonus, which the server adds below the ground (DEPTH_BONUS_PER_LEVEL
##   per level, at most 100; te-gen `tile_richness`, not in the contract) — averaged (rounded
##   down) over the module's footprint;
## - a gas: the body's air, `clamp(share × density / 0.2, 0.1, 2.0) × 50`, 0 below 1 % share;
##   orbit-only recipes get 0 on a surface.
## Below MINIMUM_RICHNESS the module stands still (`idle` LOCATION).

## Below this richness an extracting module does not work (te-gen `MINIMUM_RICHNESS`).
const MINIMUM_RICHNESS := 5
## Richness each level below the ground adds to a tile deposit (te-gen `DEPTH_BONUS_PER_LEVEL`).
const DEPTH_BONUS_PER_LEVEL := 2
## Gas collectors: least share of the gas in the air, the reference `share × density` (factor 1)
## and the limits of the factor; factor 1 is richness 50.
const MIN_GAS_SHARE_MICRO := 10000
const GAS_REFERENCE_MICRO := 200000
const GAS_FACTOR_MIN_MICRO := 100000
const GAS_FACTOR_MAX_MICRO := 2000000
const MICRO_PER_RICHNESS := 20000
## `DefModule.zLevel.bonusPerLevelPercent` is micro-percent: 100 % = 100 000 000.
const HUNDRED_PERCENT_MICRO := 100000000
## The level factor never drops below a tenth.
const MIN_Z_NUMERATOR := 10000000


## The yield of one recipe at one place.
class Estimate:
	extends RefCounted
	var blueprint: String = ""
	## The resource that comes out (the recipe's first output).
	var resource: String = ""
	## Richness 0..100 the recipe sees here.
	var richness: int = 0
	## Gas recipes: the gas's share of the air (0..1); -1 for a tile deposit.
	var gas_share: float = -1.0
	## Micro-units per hour at full staff and power, without neighbour effects; 0 when it
	## would stand still.
	var rate: int = 0

	## Whether the module would work here at all.
	func works() -> bool:
		return richness >= MINIMUM_RICHNESS


## One recipe bucket of a rate solution (`ProductionBucket`): the modules of a type that run the
## same recipe, and what comes out of them together.
class Bucket:
	extends RefCounted
	var module_type: String = ""
	var blueprint: String = ""
	var modules: int = 0
	## Each entry: [resource, nominal, effective] in micro-units per hour.
	var outputs: Array[Array] = []

	## Effective micro-units per hour of `resource`; 0 when it does not come out here.
	func effective(resource: String) -> int:
		for entry: Array in outputs:
			if entry[0] == resource:
				var per_hour: int = entry[2]
				return per_hour
		return 0


## Whether a recipe extracts something from its place (deposit or air).
static func is_extraction(recipe: GameDefinitions.BlueprintDef) -> bool:
	return recipe != null and (not recipe.required_tile_resource.is_empty() or not recipe.required_atmosphere_gas.is_empty())


## Whether some recipe of a module type extracts.
static func extracts(definitions: GameDefinitions, module_type: String) -> bool:
	for recipe: GameDefinitions.BlueprintDef in definitions.blueprints_for(module_type):
		if is_extraction(recipe):
			return true
	return false


## The level whose ground a cell at level `z` sits on: above the ground the surface itself.
static func ground_level(z: int) -> int:
	return mini(z, 0)


## Richness of `resource` in a cell's deposits (as the stream sends them) at level `z`: below the
## ground each level adds DEPTH_BONUS_PER_LEVEL, at most 100; 0 when the cell has none. Under deep
## water (draft.39) the bonus counts from the sea floor: `water_depth` is the column's depth in
## levels as far as known (WaterColumn.known_depth; < 0 unknown, 0 land), none inside the column.
static func tile_richness(deposits: Dictionary, resource: String, z: int, water_depth: int = -1) -> int:
	var value := Wire.as_int(deposits.get(resource))
	if value <= 0:
		return 0
	var levels := WaterColumn.bonus_levels(z, water_depth)
	if levels > 0:
		return mini(100, value + levels * DEPTH_BONUS_PER_LEVEL)
	return value


## Integer mean (rounded down) of the richness under a footprint; 0 for none.
static func average(values: Array[int]) -> int:
	if values.is_empty():
		return 0
	var total := 0
	for value: int in values:
		total += maxi(value, 0)
	@warning_ignore("integer_division")
	return total / values.size()


## Richness a gas collector sees in this air: `clamp(share × density / 0.2, 0.1, 2.0) × 50`,
## rounded down; 0 below a 1 % share.
static func gas_richness(share: float, density: float) -> int:
	var share_micro := roundi(share * 1000000.0)
	if share_micro < MIN_GAS_SHARE_MICRO:
		return 0
	@warning_ignore("integer_division")
	var available := share_micro * roundi(density * 1000000.0) / 1000000
	@warning_ignore("integer_division")
	var factor := clampi(available * 1000000 / GAS_REFERENCE_MICRO, GAS_FACTOR_MIN_MICRO, GAS_FACTOR_MAX_MICRO)
	@warning_ignore("integer_division")
	return factor / MICRO_PER_RICHNESS


## The level factor of a module type at level `z` as a numerator over HUNDRED_PERCENT_MICRO
## (exactly like the server); HUNDRED_PERCENT_MICRO for modules without a level modifier.
static func z_numerator(module_def: GameDefinitions.ModuleDef, z: int) -> int:
	if module_def == null or module_def.z_bonus_percent == 0:
		return HUNDRED_PERCENT_MICRO
	var steps := z if module_def.z_prefer_high else -z
	return maxi(MIN_Z_NUMERATOR, HUNDRED_PERCENT_MICRO + steps * module_def.z_bonus_percent)


## `base` micro-units per hour × richness / 100 × level factor, rounded down once (no overflow
## for any rate of the game data).
static func rate(base: int, richness: int, module_def: GameDefinitions.ModuleDef, z: int) -> int:
	if base <= 0 or richness <= 0:
		return 0
	var numerator := z_numerator(module_def, z)
	var product := base * richness
	var divisor := 100 * HUNDRED_PERCENT_MICRO
	@warning_ignore("integer_division")
	return (product / divisor) * numerator + (product % divisor) * numerator / divisor


## The yield of an extracting recipe at a place: `deposits` holds one deposit dictionary per cell
## of the footprint (SurfacePatch.Cell.deposits), `z` is the module's level, `atmosphere` the
## body's gases (share 0..1) and `density` its air density; `water_depths` (optional, one per cell
## of `deposits`) the known water depth of each cell's column (tile_richness). Null for a recipe
## that extracts nothing.
static func estimate(recipe: GameDefinitions.BlueprintDef, module_def: GameDefinitions.ModuleDef, z: int,
		deposits: Array[Dictionary], atmosphere: Dictionary, density: float, water_depths: Array[int] = []) -> Estimate:
	if not is_extraction(recipe):
		return null
	var result := Estimate.new()
	result.blueprint = recipe.key
	var base := 0
	if not recipe.outputs.is_empty():
		var first: Array = recipe.outputs[0]
		var resource: String = first[0]
		var per_hour: int = first[1]
		result.resource = resource
		base = per_hour
	if not recipe.required_atmosphere_gas.is_empty():
		var share: Variant = atmosphere.get(recipe.required_atmosphere_gas)
		var fraction := 0.0
		if typeof(share) == TYPE_FLOAT:
			fraction = share
		result.gas_share = fraction
		result.richness = 0 if recipe.orbit_only else gas_richness(result.gas_share, density)
	else:
		var values: Array[int] = []
		for index: int in deposits.size():
			var depth := water_depths[index] if index < water_depths.size() else -1
			values.append(tile_richness(deposits[index], recipe.required_tile_resource, z, depth))
		result.richness = average(values)
	result.rate = rate(base, result.richness, module_def, z) if result.works() else 0
	return result


## The yields of every extracting recipe of a module type at a place, best first; with `usable`
## (recipe key → true) only those the player may run. See estimate().
static func estimates(definitions: GameDefinitions, module_type: String, z: int, deposits: Array[Dictionary],
		atmosphere: Dictionary, density: float, usable: Dictionary = {}, water_depths: Array[int] = []) -> Array[Estimate]:
	var result: Array[Estimate] = []
	var module_def := definitions.module(module_type)
	for recipe: GameDefinitions.BlueprintDef in definitions.blueprints_for(module_type):
		if not usable.is_empty() and not usable.has(recipe.key):
			continue
		var found := estimate(recipe, module_def, z, deposits, atmosphere, density, water_depths)
		if found != null:
			result.append(found)
	result.sort_custom(func(a: Estimate, b: Estimate) -> bool:
		return a.rate > b.rate if a.rate != b.rate else a.richness > b.richness)
	return result


## The recipe buckets of a rate solution (`ProductionResponse.buckets`).
static func buckets_from_wire(value: Variant) -> Array[Bucket]:
	var result: Array[Bucket] = []
	if typeof(value) != TYPE_ARRAY:
		return result
	var list: Array = value
	for entry: Variant in list:
		var data := Wire.as_dict(entry)
		var bucket := Bucket.new()
		bucket.module_type = Wire.as_string(data.get("moduleType"))
		bucket.blueprint = Wire.as_string(data.get("blueprint"))
		bucket.modules = Wire.as_int(data.get("modules"))
		var outputs: Variant = data.get("outputs")
		if typeof(outputs) == TYPE_ARRAY:
			var rows: Array = outputs
			for row: Variant in rows:
				var rate_data := Wire.as_dict(row)
				bucket.outputs.append([Wire.as_string(rate_data.get("resource")),
					Wire.as_int(rate_data.get("nominal")), Wire.as_int(rate_data.get("effective"))])
		result.append(bucket)
	return result


## The bucket of a module type running a recipe; null when the rate solution has none (idle,
## or not solved yet).
static func find_bucket(buckets: Array[Bucket], module_type: String, blueprint: String) -> Bucket:
	for bucket: Bucket in buckets:
		if bucket.module_type == module_type and bucket.blueprint == blueprint:
			return bucket
	return null
