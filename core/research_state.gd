class_name ResearchState
extends RefCounted
## The player's research as the server reports it (`GET /v2/research`): researched techs, usable
## recipes and every lab with its slots, status and progress. Labs of one structure can be
## replaced from `GET /v2/structures/{id}/labs`, single labs from the event `lab.changed`.

const SOURCE_BASIS := "BASIS"
const SOURCE_RESEARCH := "RESEARCH"
## Supply in billionths: 10^9 is full.
const SUPPLY_FULL := 1000000000


## One lab (`LabView`). The running tech is never named; from 50 % only its category.
class Lab:
	extends RefCounted
	var structure_id: int = 0
	var module_id: int = 0
	var module_type: String = ""
	var slot_count: int = 0
	## One entry per slot: [resource, micro-units per hour], or [] for an empty slot.
	var slots: Array[Array] = []
	## INACTIVE, NO_SLOTS, NO_TECH, RESEARCHING, PAUSED_LOW_INPUT or STARVED.
	var status: String = ""
	## Progress in micro-seconds of effective research; null while nothing runs.
	var progress: FlowValue = null
	var goal: int = 0
	var started_at: int = -1
	## Projected completion at the current rate; -1 while it stands still.
	var ends_at: int = -1
	var supply_ppb: int = 0
	## Category of the running research once it is half done; "" before.
	var hint_category: String = ""
	var hint_at: int = -1
	## PAUSED_LOW_INPUT: the slot below the minimum rate; "" otherwise.
	var shortfall_resource: String = ""
	var shortfall_rate: int = 0
	var shortfall_required: int = 0

	static func from_wire(data: Dictionary) -> Lab:
		var lab := Lab.new()
		lab.structure_id = Wire.as_int(data.get("structureId"))
		lab.module_id = Wire.as_int(data.get("moduleId"))
		lab.module_type = Wire.as_string(data.get("moduleType"))
		lab.slot_count = Wire.as_int(data.get("slotCount"))
		var slots: Array = data.get("slots") if typeof(data.get("slots")) == TYPE_ARRAY else []
		for entry: Variant in slots:
			var slot := Wire.as_dict(entry)
			var resource := Wire.as_string(slot.get("resource"))
			if resource.is_empty():
				lab.slots.append([])
			else:
				lab.slots.append([resource, Wire.as_int(slot.get("ratePerHour"))])
		while lab.slots.size() < lab.slot_count:
			lab.slots.append([])
		lab.status = Wire.as_string(data.get("status"))
		var progress := Wire.as_dict(data.get("progress"))
		if not progress.is_empty():
			lab.progress = FlowValue.from_wire(progress)
			lab.goal = Wire.as_int(progress.get("goal"))
			lab.started_at = Wire.as_int(progress.get("startedAt"), -1)
			lab.ends_at = Wire.as_int(progress.get("endsAt"), -1)
			lab.supply_ppb = Wire.as_int(progress.get("supplyPpb"))
		var hint := Wire.as_dict(data.get("hint"))
		lab.hint_category = Wire.as_string(hint.get("category"))
		lab.hint_at = Wire.as_int(hint.get("at"), -1)
		var shortfall := Wire.as_dict(data.get("shortfall"))
		lab.shortfall_resource = Wire.as_string(shortfall.get("resource"))
		lab.shortfall_rate = Wire.as_int(shortfall.get("ratePerHour"))
		lab.shortfall_required = Wire.as_int(shortfall.get("requiredPerHour"))
		return lab

	## Effective research done by game time `now_ms` (micro-seconds), never above the goal.
	func progress_at(now_ms: int) -> int:
		if progress == null:
			return 0
		var done := progress.amount_at(now_ms)
		return mini(done, goal) if goal > 0 else done

	## Share of the goal done by `now_ms`, 0..1; 0 while nothing runs.
	func fraction_at(now_ms: int) -> float:
		if progress == null or goal <= 0:
			return 0.0
		return clampf(float(progress_at(now_ms)) / goal, 0.0, 1.0)

	## Game time left until the projected completion; -1 while it stands still or nothing runs.
	func remaining_ms(now_ms: int) -> int:
		if ends_at < 0:
			return -1
		return maxi(ends_at - now_ms, 0)

	## Whether changing the slots now would throw progress away.
	func has_progress(now_ms: int) -> bool:
		return progress_at(now_ms) > 0

	## The resources standing in the slots, in slot order, without empty slots.
	func slot_resources() -> PackedStringArray:
		var result := PackedStringArray()
		for slot: Array in slots:
			if not slot.is_empty():
				var resource: String = slot[0]
				result.append(resource)
		return result

	## Whether every slot is empty.
	func slots_empty() -> bool:
		return slot_resources().is_empty()

	## Supply as a share, 0..1.
	func supply() -> float:
		return clampf(float(supply_ppb) / SUPPLY_FULL, 0.0, 1.0)


## Researched tech → game time it was unlocked.
var researched: Dictionary = {}
## Usable recipe → BASIS or RESEARCH.
var blueprints: Dictionary = {}
## Every lab of the player, in the order the server sent them.
var labs: Array[Lab] = []


## Reads a `ResearchResponse`.
static func from_wire(data: Dictionary) -> ResearchState:
	var state := ResearchState.new()
	for entry: Variant in _list(data.get("techs")):
		var tech := Wire.as_dict(entry)
		var key := Wire.as_string(tech.get("tech"))
		if not key.is_empty():
			state.researched[key] = Wire.as_int(tech.get("unlockedAt"))
	for entry: Variant in _list(data.get("blueprints")):
		var blueprint := Wire.as_dict(entry)
		var key := Wire.as_string(blueprint.get("blueprint"))
		if not key.is_empty():
			state.blueprints[key] = Wire.as_string(blueprint.get("source"), SOURCE_BASIS)
	state.labs = labs_from_wire(data.get("labs"))
	return state


## Reads a list of `LabView`s (the `labs` of `/v2/research` or `/v2/structures/{id}/labs`).
static func labs_from_wire(value: Variant) -> Array[Lab]:
	var result: Array[Lab] = []
	for entry: Variant in _list(value):
		var lab := Lab.from_wire(Wire.as_dict(entry))
		if lab.module_id != 0:
			result.append(lab)
	return result


## The labs of one structure, in module order.
func labs_of(structure_id: int) -> Array[Lab]:
	var result: Array[Lab] = []
	for lab: Lab in labs:
		if lab.structure_id == structure_id:
			result.append(lab)
	result.sort_custom(func(a: Lab, b: Lab) -> bool: return a.module_id < b.module_id)
	return result


## The lab on module `module_id`, or null.
func lab(module_id: int) -> Lab:
	for entry: Lab in labs:
		if entry.module_id == module_id:
			return entry
	return null


## Takes a newer view of one lab (event `lab.changed`, answer of setting slots).
func apply_lab(changed: Lab) -> void:
	for index: int in labs.size():
		if labs[index].module_id == changed.module_id:
			labs[index] = changed
			return
	labs.append(changed)


## Replaces every lab of a structure (answer of `GET /v2/structures/{id}/labs`).
func replace_labs(structure_id: int, fresh: Array[Lab]) -> void:
	var kept: Array[Lab] = []
	for entry: Lab in labs:
		if entry.structure_id != structure_id:
			kept.append(entry)
	for entry: Lab in fresh:
		entry.structure_id = structure_id
		kept.append(entry)
	labs = kept


## Applies the event `research.completed` until the next full load: the tech is researched and
## its recipes are usable.
func apply_completed(data: Dictionary) -> void:
	var key := Wire.as_string(data.get("tech"))
	if key.is_empty():
		return
	researched[key] = Wire.as_int(data.get("gameTime"))
	for entry: Variant in _list(data.get("blueprints")):
		if typeof(entry) == TYPE_STRING:
			var blueprint := Wire.as_string(entry)
			if not blueprints.has(blueprint):
				blueprints[blueprint] = SOURCE_RESEARCH


static func _list(value: Variant) -> Array:
	if typeof(value) == TYPE_ARRAY:
		var list: Array = value
		return list
	return []
