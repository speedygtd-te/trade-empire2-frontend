class_name Workforce
extends RefCounted
## Who works where in a structure: its inhabitants per tier, and per module type the people and
## robots assigned to it (`WorkforceGroup`, in GET production and in the answer of PUT
## workforce), plus whether the housing tiers 2–5 are unlocked (`TierUnlock`, only in the
## answer of PUT workforce). Tiers run 1–5; the arrays hold tier 1 at index 0.
##
## The server decides; `fill_plan` and `check` only prepare and preview an assignment.

const TIERS := 5


class Group:
	extends RefCounted
	var module_type := ""
	## Active modules of this type.
	var modules := 0
	## Workers per module for full staffing, and the lowest tier that can staff it.
	var required_workers := 0
	var base_tier := 1
	var humans: Array[int] = [0, 0, 0, 0, 0]
	var robots: Array[int] = [0, 0, 0, 0, 0]
	## Tiers that fill up by themselves when a module of this type is finished.
	var auto: Array[bool] = [false, false, false, false, false]
	## Staffing factor of the last rate solution, micro (1 000 000 = fully staffed at base tier).
	var modifier := 0

	## Workers all modules of this type need together.
	func needed() -> int:
		return modules * required_workers

	## People and robots assigned, all tiers.
	func assigned() -> int:
		var total := 0
		for index: int in TIERS:
			total += humans[index] + robots[index]
		return total

	## Mean tier of everyone assigned (labs choose research by it); 0 without anyone.
	func average_tier() -> float:
		var count := 0
		var sum := 0
		for index: int in TIERS:
			var here := humans[index] + robots[index]
			count += here
			sum += here * (index + 1)
		return float(sum) / count if count > 0 else 0.0

	static func from_wire(data: Dictionary) -> Group:
		var group := Group.new()
		group.module_type = Wire.as_string(data.get("moduleType"))
		group.modules = Wire.as_int(data.get("modules"))
		group.required_workers = Wire.as_int(data.get("requiredWorkers"))
		group.base_tier = clampi(Wire.as_int(data.get("baseTier"), 1), 1, TIERS)
		group.humans = Workforce._counts(data.get("humans"))
		group.robots = Workforce._counts(data.get("robots"))
		var flags: Array = data.get("auto") if typeof(data.get("auto")) == TYPE_ARRAY else []
		for index: int in mini(flags.size(), TIERS):
			group.auto[index] = flags[index] == true
		group.modifier = Wire.as_int(data.get("modifier"))
		return group


## Whether a housing tier is unlocked, with the current shares (only after PUT workforce).
class TierUnlock:
	extends RefCounted
	var tier := 0
	var unlocked := false
	var required_tier := 0
	var min_population := 0
	## Inhabitants of `required_tier` now.
	var population := 0
	## Each entry: [emission key, minimum share, share now], shares in micro (1 000 000 = 100 %).
	var requirements: Array[Array] = []

	static func from_wire(data: Dictionary) -> TierUnlock:
		var unlock := TierUnlock.new()
		unlock.tier = Wire.as_int(data.get("tier"))
		unlock.unlocked = data.get("unlocked") == true
		unlock.required_tier = Wire.as_int(data.get("requiredTier"))
		unlock.min_population = Wire.as_int(data.get("minPopulation"))
		unlock.population = Wire.as_int(data.get("population"))
		var list: Array = data.get("requirements") if typeof(data.get("requirements")) == TYPE_ARRAY else []
		for entry: Variant in list:
			var row := Wire.as_dict(entry)
			unlock.requirements.append([Wire.as_string(row.get("emission")),
				Wire.as_int(row.get("minShare")), Wire.as_int(row.get("share"))])
		return unlock


## Inhabitants per tier.
var population: Array[int] = [0, 0, 0, 0, 0]
## Module type → Group.
var groups: Dictionary = {}
## Tier → TierUnlock; empty until an assignment was answered.
var tiers: Dictionary = {}


## Replaces the groups (`workforce` of GET production, `groups` of PUT workforce).
func apply_groups(list: Variant) -> void:
	groups.clear()
	if typeof(list) != TYPE_ARRAY:
		return
	var entries: Array = list
	for entry: Variant in entries:
		var group := Group.from_wire(Wire.as_dict(entry))
		if not group.module_type.is_empty():
			groups[group.module_type] = group


## Takes the answer of PUT workforce: population, groups and the tier unlocks.
func apply_response(data: Dictionary) -> void:
	population = _counts(data.get("population"))
	apply_groups(data.get("groups"))
	tiers.clear()
	var list: Array = data.get("tiers") if typeof(data.get("tiers")) == TYPE_ARRAY else []
	for entry: Variant in list:
		var unlock := TierUnlock.from_wire(Wire.as_dict(entry))
		tiers[unlock.tier] = unlock


## Takes `Aggregates.populationByTier` of GET structure (index = tier, index 0 unused).
func apply_population_by_tier(list: Variant) -> void:
	if typeof(list) != TYPE_ARRAY:
		return
	var entries: Array = list
	for tier: int in range(1, TIERS + 1):
		population[tier - 1] = Wire.as_int(entries[tier]) if tier < entries.size() else 0


func total_population() -> int:
	var total := 0
	for count: int in population:
		total += count
	return total


## Workers needed and assigned over all module types.
func needed_total() -> int:
	var total := 0
	for group: Group in groups.values():
		total += group.needed()
	return total


func assigned_total() -> int:
	var total := 0
	for group: Group in groups.values():
		total += group.assigned()
	return total


## Inhabitants of a tier not working for any module type (other than `except_type`).
func free_humans(tier: int, except_type: String = "") -> int:
	var busy := 0
	for group: Group in groups.values():
		if group.module_type != except_type:
			busy += group.humans[tier - 1]
	return maxi(0, population[tier - 1] - busy)


## An assignment that staffs a module type fully: people first (lowest usable tier upwards, as
## many as are free), then robots (from the store, plus those the type already has). Returns
## [humans, robots], five counts each.
func fill_plan(group: Group, robots_in_store: Array[int], use_people: bool = true,
		use_robots: bool = true) -> Array[Array]:
	var humans: Array[int] = [0, 0, 0, 0, 0]
	var robots: Array[int] = [0, 0, 0, 0, 0]
	var need := group.needed()
	for tier: int in range(group.base_tier, TIERS + 1):
		if not use_people or need <= 0:
			break
		var take := mini(need, free_humans(tier, group.module_type))
		humans[tier - 1] = take
		need -= take
	for tier: int in range(group.base_tier, TIERS + 1):
		if not use_robots or need <= 0:
			break
		var take := mini(need, robots_in_store[tier - 1] + group.robots[tier - 1])
		robots[tier - 1] = take
		need -= take
	return [humans, robots]


## Preview of the server's checks for an assignment of a module type: "" when it looks fine,
## otherwise the code the server would answer (TIER_TOO_LOW, INSUFFICIENT_WORKERS,
## INSUFFICIENT_ROBOTS).
func check(group: Group, humans: Array[int], robots: Array[int], robots_in_store: Array[int]) -> String:
	for tier: int in range(1, group.base_tier):
		if humans[tier - 1] > 0 or robots[tier - 1] > 0:
			return "TIER_TOO_LOW"
	for tier: int in range(1, TIERS + 1):
		if humans[tier - 1] > free_humans(tier, group.module_type):
			return "INSUFFICIENT_WORKERS"
	for tier: int in range(1, TIERS + 1):
		if robots[tier - 1] > robots_in_store[tier - 1] + group.robots[tier - 1]:
			return "INSUFFICIENT_ROBOTS"
	return ""


static func _counts(value: Variant) -> Array[int]:
	var counts: Array[int] = [0, 0, 0, 0, 0]
	if typeof(value) != TYPE_ARRAY:
		return counts
	var list: Array = value
	for index: int in mini(list.size(), TIERS):
		counts[index] = maxi(0, Wire.as_int(list[index]))
	return counts
