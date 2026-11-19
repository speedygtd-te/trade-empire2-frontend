class_name BlueprintGroups
extends RefCounted
## The modules of a structure that run on blueprints (ModuleDef.blueprint_driven), grouped by
## module type and by the blueprint set on them — the "Blueprints" tab of the structure details.
## A group's blueprint can be changed for all its modules at once: one `setBlueprint` batch
## (`bestEffort`, so one refused module does not hold back the others), whose per-operation
## results are counted here. The server decides; these are only the lists and the counting.


## The modules of one type that run the same blueprint ("" = none set).
class Group:
	extends RefCounted
	var module_type: String = ""
	var blueprint: String = ""
	var modules: Array[StructureLayout.Module] = []
	## Of them: under construction (they keep a blueprint set now), and standing still because
	## the spot does not fit the blueprint (idle LOCATION).
	var building: int = 0
	var location: int = 0

	func count() -> int:
		return modules.size()

	func is_none() -> bool:
		return blueprint.is_empty()


## One module type with its groups: the group without a blueprint first, then the largest.
class TypeRow:
	extends RefCounted
	var module_type: String = ""
	var display_name: String = ""
	var groups: Array[Group] = []

	func count() -> int:
		var total := 0
		for group: Group in groups:
			total += group.count()
		return total

	## Modules of the type without a blueprint.
	func without_blueprint() -> int:
		for group: Group in groups:
			if group.is_none():
				return group.count()
		return 0

	## The group running `blueprint` ("" = none); null when no module of the type runs it.
	func group(blueprint: String) -> Group:
		for entry: Group in groups:
			if entry.blueprint == blueprint:
				return entry
		return null


## What a bestEffort batch did: operations that went through, refused ones by error code.
class Outcome:
	extends RefCounted
	var applied: int = 0
	var refused: int = 0
	## Error code → number of operations refused with it.
	var errors: Dictionary = {}

	## The error codes, most frequent first (equal counts by code).
	func codes() -> PackedStringArray:
		var keys: Array = errors.keys()
		var counts := errors
		keys.sort_custom(func(a: Variant, b: Variant) -> bool:
			var count_a := Wire.as_int(counts.get(a))
			var count_b := Wire.as_int(counts.get(b))
			return count_a > count_b if count_a != count_b else str(a) < str(b))
		var result := PackedStringArray()
		for key: Variant in keys:
			result.append(str(key))
		return result


## How one extracting blueprint would do over the spots of a group: at how many it works, and
## the lowest and highest richness and rate among them (all spots, standing still ones count 0).
class YieldSpan:
	extends RefCounted
	var resource: String = ""
	## Gas recipes: the gas's share of the air (0..1); -1 for a tile deposit.
	var gas_share: float = -1.0
	var spots: int = 0
	var working: int = 0
	var low_richness: int = 0
	var high_richness: int = 0
	## Micro-units per hour per module at full staff and power.
	var low_rate: int = 0
	var high_rate: int = 0


## The type rows of a structure's modules: only blueprint-driven types, sorted by display name;
## `idle_reasons` is module id → reason of the last rate solution (ColonyModel.idle_reasons).
static func rows(modules: Array[StructureLayout.Module], definitions: GameDefinitions,
		idle_reasons: Dictionary) -> Array[TypeRow]:
	var by_type: Dictionary = {}
	for placed: StructureLayout.Module in modules:
		var module_def := definitions.module(placed.module_type)
		if module_def == null or not module_def.blueprint_driven:
			continue
		var row := by_type.get(placed.module_type) as TypeRow
		if row == null:
			row = TypeRow.new()
			row.module_type = placed.module_type
			row.display_name = module_def.display_name if not module_def.display_name.is_empty() else placed.module_type
			by_type[placed.module_type] = row
		var group := row.group(placed.blueprint)
		if group == null:
			group = Group.new()
			group.module_type = placed.module_type
			group.blueprint = placed.blueprint
			row.groups.append(group)
		group.modules.append(placed)
		if placed.is_building():
			group.building += 1
		elif Wire.as_string(idle_reasons.get(placed.module_id)) == "LOCATION":
			group.location += 1
	var result: Array[TypeRow] = []
	for row: TypeRow in by_type.values():
		row.groups.sort_custom(func(a: Group, b: Group) -> bool: return _before(a, b, definitions))
		for group: Group in row.groups:
			group.modules.sort_custom(func(a: StructureLayout.Module, b: StructureLayout.Module) -> bool:
				return a.module_id < b.module_id)
		result.append(row)
	result.sort_custom(func(a: TypeRow, b: TypeRow) -> bool:
		var order := a.display_name.naturalnocasecmp_to(b.display_name)
		return order < 0 if order != 0 else a.module_type < b.module_type)
	return result


## Group order: none first, then the larger, then by the blueprint's name.
static func _before(a: Group, b: Group, definitions: GameDefinitions) -> bool:
	if a.is_none() != b.is_none():
		return a.is_none()
	if a.count() != b.count():
		return a.count() > b.count()
	return _name(a.blueprint, definitions).naturalnocasecmp_to(_name(b.blueprint, definitions)) < 0


static func _name(blueprint: String, definitions: GameDefinitions) -> String:
	var recipe := definitions.blueprint(blueprint)
	return recipe.display_name if recipe != null else blueprint


## Whether some module of the structure runs on blueprints but has none set.
static func any_without(type_rows: Array[TypeRow]) -> bool:
	for row: TypeRow in type_rows:
		if row.without_blueprint() > 0:
			return true
	return false


## The batch that sets `blueprint` ("" clears it) on every module of a group: one `setBlueprint`
## per module, addressed by its origin as an absolute cell (any cell of the footprint would do).
## Modules that already run `blueprint` are left out. Real ints, as the contract wants them.
static func ops(group: Group, blueprint: String, layout: StructureLayout) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for placed: StructureLayout.Module in group.modules:
		if placed.blueprint == blueprint:
			continue
		var cell := layout.to_absolute(placed.origin)
		var op := {"op": "setBlueprint", "x": cell.x, "y": cell.y, "z": cell.z}
		if not blueprint.is_empty():
			op["blueprint"] = blueprint
		result.append(op)
	return result


## Counts the per-operation results of a batch answer (`BuildResponse.results`).
static func outcome(results: Variant) -> Outcome:
	var result := Outcome.new()
	if typeof(results) != TYPE_ARRAY:
		return result
	var list: Array = results
	for entry: Variant in list:
		var row := Wire.as_dict(entry)
		if row.get("ok") == true:
			result.applied += 1
			continue
		result.refused += 1
		var code := Wire.as_string(row.get("error"))
		result.errors[code] = Wire.as_int(result.errors.get(code)) + 1
	return result


## Low and high of a recipe's estimates over the spots of a group (one ExtractionYield.Estimate
## per module), taken over the spots where it works (all 0 when it works nowhere); null for no
## estimates.
static func yield_span(estimates: Array[ExtractionYield.Estimate]) -> YieldSpan:
	if estimates.is_empty():
		return null
	var span := YieldSpan.new()
	span.resource = estimates[0].resource
	span.gas_share = estimates[0].gas_share
	span.spots = estimates.size()
	for found: ExtractionYield.Estimate in estimates:
		if not found.works():
			continue
		if span.working == 0:
			span.low_richness = found.richness
			span.high_richness = found.richness
			span.low_rate = found.rate
			span.high_rate = found.rate
		span.working += 1
		span.low_richness = mini(span.low_richness, found.richness)
		span.high_richness = maxi(span.high_richness, found.richness)
		span.low_rate = mini(span.low_rate, found.rate)
		span.high_rate = maxi(span.high_rate, found.rate)
	return span
