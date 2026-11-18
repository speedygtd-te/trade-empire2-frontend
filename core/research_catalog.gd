class_name ResearchCatalog
extends RefCounted
## The public research catalog of the game data (`research` in `GET /v2/definitions`): the lab
## types with their slot counts, the categories and every tech.
##
## A lab picks its research itself from the resources in its slots (docs/SPEC-forschung.md 1.2);
## the server never names the running tech. The helpers here only preview that choice for the
## player — the server decides.

const STATUS_ACTIVE := "ACTIVE"
const STATUS_RETIRED := "RETIRED"
const STATUS_PARKED := "PARKED"
const ROLE_PRIMARY := "PRIMARY"
## The simple lab never takes research of this tier or above.
const RESEARCH_LAB := "RESEARCH_LAB"
const RESEARCH_LAB_TIER_LIMIT := 4
const SECONDS_PER_HOUR := 3600


class Tech:
	extends RefCounted
	var key: String = ""
	var display_name: String = ""
	var description: String = ""
	var tier: int = 0
	var category: String = ""
	## ACTIVE, RETIRED (counts as researched for everyone) or PARKED (never researched).
	var status: String = ""
	var base_time_seconds: int = 0
	var min_time_seconds: int = 0
	## Each entry: [resource key, minimum amount in micro-units over the base time].
	var required_inputs: Array[Array] = []
	var primary_lab: String = ""
	## Lab type → GENERALIST or CROSS_SPECIALTY (the primary lab is not in here).
	var allowed_labs: Dictionary = {}
	var min_worker_tier: int = 0
	var unlocks_blueprints: PackedStringArray = []
	## Only weight the choice; they never block it.
	var prerequisites: PackedStringArray = []

	## The resources that must stand in a slot.
	func input_resources() -> PackedStringArray:
		var result := PackedStringArray()
		for entry: Array in required_inputs:
			var resource: String = entry[0]
			result.append(resource)
		return result


## Every category a 50 % hint can name.
var categories: PackedStringArray = []

var _slot_counts: Dictionary = {}
var _techs: Dictionary = {}


## Reads the `research` part of a definitions bundle; an empty catalog when it is missing.
static func from_wire(data: Dictionary) -> ResearchCatalog:
	var catalog := ResearchCatalog.new()
	for entry: Variant in _list(data.get("labs")):
		var lab := Wire.as_dict(entry)
		var module_type := Wire.as_string(lab.get("module"))
		if not module_type.is_empty():
			catalog._slot_counts[module_type] = Wire.as_int(lab.get("slotCount"))
	for entry: Variant in _list(data.get("categories")):
		if typeof(entry) == TYPE_STRING:
			catalog.categories.append(Wire.as_string(entry))
	for entry: Variant in _list(data.get("techs")):
		var tech := _read_tech(Wire.as_dict(entry))
		if not tech.key.is_empty():
			catalog._techs[tech.key] = tech
	return catalog


## The tech `key`, or null when the catalog does not know it.
func tech(key: String) -> Tech:
	return _techs.get(key) as Tech


## Every tech in the order of the game data.
func techs() -> Array[Tech]:
	var result: Array[Tech] = []
	for entry: Tech in _techs.values():
		result.append(entry)
	return result


## Whether a module type is a lab.
func is_lab(module_type: String) -> bool:
	return _slot_counts.has(module_type)


## How many slots a lab type has; 0 when it is no lab.
func slot_count(module_type: String) -> int:
	return Wire.as_int(_slot_counts.get(module_type))


## The lab module types, in the order of the game data.
func lab_types() -> PackedStringArray:
	return PackedStringArray(_slot_counts.keys())


## How many techs can be researched at all (ACTIVE).
func selectable_count() -> int:
	var count := 0
	for entry: Tech in _techs.values():
		if entry.status == STATUS_ACTIVE:
			count += 1
	return count


## Whether a tech counts as researched: in `researched` (tech key → anything) or retired.
func is_researched(key: String, researched: Dictionary) -> bool:
	if researched.has(key):
		return true
	var entry := tech(key)
	return entry != null and entry.status == STATUS_RETIRED


## How many of the selectable techs are researched.
func researched_count(researched: Dictionary) -> int:
	var count := 0
	for entry: Tech in _techs.values():
		if entry.status == STATUS_ACTIVE and researched.has(entry.key):
			count += 1
	return count


## PRIMARY, GENERALIST or CROSS_SPECIALTY when a lab type may research the tech; "" otherwise.
func lab_role(lab_type: String, entry: Tech) -> String:
	if lab_type == RESEARCH_LAB and entry.tier >= RESEARCH_LAB_TIER_LIMIT:
		return ""
	if entry.primary_lab == lab_type:
		return ROLE_PRIMARY
	return Wire.as_string(entry.allowed_labs.get(lab_type))


## The techs a lab type can still research: active, not researched, allowed in this lab and with
## no more inputs than it has slots. Lowest tier first, then shortest base time, then name.
func open_for_lab(lab_type: String, researched: Dictionary) -> Array[Tech]:
	var result: Array[Tech] = []
	var slots := slot_count(lab_type)
	for entry: Tech in _techs.values():
		if entry.status != STATUS_ACTIVE or researched.has(entry.key):
			continue
		if lab_role(lab_type, entry).is_empty() or entry.required_inputs.size() > slots:
			continue
		result.append(entry)
	result.sort_custom(_by_tier_then_time_then_name)
	return result


## Preview of the lab's choice for slots holding `slot_resources`: the techs that tie for first
## place (lowest tier, then base time, then highest weight). The server breaks a tie with a hash
## of galaxy and lab; one entry means the choice is clear. Empty when nothing fits. Worker tier
## and the place of the lab are not part of the preview.
func preview_choice(lab_type: String, slot_resources: PackedStringArray, researched: Dictionary) -> Array[Tech]:
	var best: Array[Tech] = []
	var best_weight := 0.0
	for entry: Tech in open_for_lab(lab_type, researched):
		var fits := true
		for resource: String in entry.input_resources():
			if not slot_resources.has(resource):
				fits = false
				break
		if not fits:
			continue
		var weight := choice_weight(lab_type, entry, researched)
		if best.is_empty():
			best = [entry]
			best_weight = weight
			continue
		var first := best[0]
		if entry.tier != first.tier or entry.base_time_seconds != first.base_time_seconds:
			# The list is sorted: everything after the first group ranks lower.
			break
		if weight > best_weight:
			best = [entry]
			best_weight = weight
		elif is_equal_approx(weight, best_weight):
			best.append(entry)
	return best


## The weight of a tech in the lab's choice: lab (primary 2, otherwise 1) × prerequisites
## (1 + met / all). The place bonus is left out.
func choice_weight(lab_type: String, entry: Tech, researched: Dictionary) -> float:
	var lab_factor := 2.0 if lab_role(lab_type, entry) == ROLE_PRIMARY else 1.0
	var prerequisite_factor := 1.0
	if not entry.prerequisites.is_empty():
		var met := 0
		for key: String in entry.prerequisites:
			if is_researched(key, researched):
				met += 1
		prerequisite_factor = 1.0 + float(met) / entry.prerequisites.size()
	return lab_factor * prerequisite_factor


## The lowest slot rate (micro-units per hour) at which a tech runs at all: the minimum amount
## spread over the base time, rounded up. 0 when the tech does not need the resource.
static func min_rate_per_hour(entry: Tech, resource: String) -> int:
	if entry.base_time_seconds <= 0:
		return 0
	for input: Array in entry.required_inputs:
		if input[0] == resource:
			var amount: int = input[1]
			@warning_ignore("integer_division")
			return (amount * SECONDS_PER_HOUR + entry.base_time_seconds - 1) / entry.base_time_seconds
	return 0


## Slot list for `PUT …/labs/{moduleId}/slots` that aims a lab with `slots` slots at a tech:
## each required input at `factor` times its minimum rate, the remaining slots empty (null).
## Integers only, as the contract wants them. Empty when the tech needs more slots.
static func slots_for(entry: Tech, slots: int, factor: int = 1) -> Array:
	var result: Array = []
	if entry.required_inputs.size() > slots:
		return result
	for input: Array in entry.required_inputs:
		var resource: String = input[0]
		result.append({"resource": resource, "ratePerHour": min_rate_per_hour(entry, resource) * maxi(factor, 1)})
	while result.size() < slots:
		result.append(null)
	return result


## An all-empty slot list for a lab with `slots` slots.
static func empty_slots(slots: int) -> Array:
	var result: Array = []
	for _index: int in maxi(slots, 0):
		result.append(null)
	return result


static func _by_tier_then_time_then_name(a: Tech, b: Tech) -> bool:
	if a.tier != b.tier:
		return a.tier < b.tier
	if a.base_time_seconds != b.base_time_seconds:
		return a.base_time_seconds < b.base_time_seconds
	return a.key < b.key


static func _list(value: Variant) -> Array:
	if typeof(value) == TYPE_ARRAY:
		var list: Array = value
		return list
	return []


static func _strings(value: Variant) -> PackedStringArray:
	var result := PackedStringArray()
	for item: Variant in _list(value):
		if typeof(item) == TYPE_STRING:
			result.append(Wire.as_string(item))
	return result


static func _read_tech(data: Dictionary) -> Tech:
	var entry := Tech.new()
	entry.key = Wire.as_string(data.get("key"))
	entry.display_name = Wire.as_string(data.get("displayName"))
	entry.description = Wire.as_string(data.get("description"))
	entry.tier = Wire.as_int(data.get("tier"))
	entry.category = Wire.as_string(data.get("category"))
	entry.status = Wire.as_string(data.get("status"), STATUS_ACTIVE)
	entry.base_time_seconds = Wire.as_int(data.get("baseTimeSeconds"))
	entry.min_time_seconds = Wire.as_int(data.get("minResearchTimeSeconds"))
	for item: Variant in _list(data.get("requiredInputs")):
		var input := Wire.as_dict(item)
		var resource := Wire.as_string(input.get("resource"))
		if not resource.is_empty():
			entry.required_inputs.append([resource, Wire.as_int(input.get("minAmount"))])
	entry.primary_lab = Wire.as_string(data.get("primaryLab"))
	for item: Variant in _list(data.get("allowedLabs")):
		var allowed := Wire.as_dict(item)
		var lab := Wire.as_string(allowed.get("lab"))
		if not lab.is_empty():
			entry.allowed_labs[lab] = Wire.as_string(allowed.get("role"))
	entry.min_worker_tier = Wire.as_int(data.get("minWorkerTier"))
	entry.unlocks_blueprints = _strings(data.get("unlocksBlueprints"))
	entry.prerequisites = _strings(data.get("prerequisites"))
	return entry
