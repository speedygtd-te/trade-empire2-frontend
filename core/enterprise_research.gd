class_name EnterpriseResearch
extends RefCounted
## The enterprise tech tree (`GET/POST/DELETE /v2/enterprises/{id}/research`, draft.37; member
## unlocks draft.39).
##
## 21 techs in four tiers (E1–E4). One research at a time, chosen on purpose: its cost is taken
## at the start, then a fixed time runs — but only while the Enterprise Lab works (power, full
## crew); otherwise it pauses. Cancelling refunds nothing. Amounts are micro-units.

const MS_PER_HOUR := 3600000
## Research speed ×1 in millionths (`running.speed`, draft.41).
const SPEED_NORMAL := 1000000
const TIERS: Array[int] = [1, 2, 3, 4]

## What a tech is for the enterprise now.
enum State { RESEARCHED, RUNNING, AVAILABLE, LOCKED }


class Tech:
	extends RefCounted
	var key := ""
	var name := ""
	## 1–4 (E1–E4).
	var tier := 1
	var prerequisites := PackedStringArray()
	## [resource, micro-units]
	var cost: Array[Array] = []
	var duration_ms := 0
	## Item keys it unlocks for the factory.
	var unlocks := PackedStringArray()
	## Player blueprints it unlocks for every current member (draft.39 `memberUnlocks`).
	var member_unlocks := PackedStringArray()
	## 0 while not researched.
	var researched_at := 0
	## The server would start it now (prerequisites met, not researched).
	var available := false


class Running:
	extends RefCounted
	var tech := ""
	var started_at := 0
	## Left at the answer's `at`.
	var remaining_ms := 0
	## The lab works (time runs); false: paused.
	var running := false
	var completes_at := 0
	## Research speed in millionths (draft.41: member labs help, up to ×1.8); SPEED_NORMAL = ×1.
	var speed := SPEED_NORMAL
	## Member labs helping right now (draft.41).
	var assisting_labs := 0


var enterprise_id := ""
## Game time of the answer.
var at := 0
## null when nothing runs.
var running: Running = null
var techs: Array[Tech] = []


static func from_wire(data: Dictionary) -> EnterpriseResearch:
	var view := EnterpriseResearch.new()
	view.enterprise_id = Wire.as_string(data.get("enterpriseId"))
	view.at = Wire.as_int(data.get("at"))
	var run := Wire.as_dict(data.get("running"))
	if not Wire.as_string(run.get("tech")).is_empty():
		view.running = Running.new()
		view.running.tech = Wire.as_string(run.get("tech"))
		view.running.started_at = Wire.as_int(run.get("startedAt"))
		view.running.remaining_ms = Wire.as_int(run.get("remainingMs"))
		view.running.running = run.get("running") == true
		view.running.completes_at = Wire.as_int(run.get("completesAt"))
		view.running.speed = maxi(Wire.as_int(run.get("speed"), SPEED_NORMAL), 1)
		view.running.assisting_labs = Wire.as_int(run.get("assistingLabs"))
	for value: Variant in _list(data.get("techs")):
		var row := Wire.as_dict(value)
		var tech := Tech.new()
		tech.key = Wire.as_string(row.get("key"))
		tech.name = Wire.as_string(row.get("name"))
		tech.tier = clampi(Wire.as_int(row.get("tier"), 1), 1, 4)
		tech.prerequisites = _strings(row.get("prerequisites"))
		tech.cost = costs_from_wire(row.get("cost"))
		tech.duration_ms = Wire.as_int(row.get("durationMs"))
		tech.unlocks = _strings(row.get("unlocks"))
		tech.member_unlocks = _strings(row.get("memberUnlocks"))
		tech.researched_at = Wire.as_int(row.get("researchedAt"))
		tech.available = row.get("available") == true
		if not tech.key.is_empty():
			view.techs.append(tech)
	return view


## `CostItem` rows: [resource, micro-units].
static func costs_from_wire(value: Variant) -> Array[Array]:
	var result: Array[Array] = []
	for entry: Variant in _list(value):
		var row := Wire.as_dict(entry)
		var key := Wire.as_string(row.get("resource"))
		if not key.is_empty():
			result.append([key, Wire.as_int(row.get("amount"))])
	return result


## Body of `POST …/research`.
static func start_body(key: String) -> Dictionary:
	return {"tech": key}


func tech(key: String) -> Tech:
	for entry: Tech in techs:
		if entry.key == key:
			return entry
	return null


func is_researched(key: String) -> bool:
	var found := tech(key)
	return found != null and found.researched_at > 0


func state_of(key: String) -> State:
	if running != null and running.tech == key:
		return State.RUNNING
	var found := tech(key)
	if found == null:
		return State.LOCKED
	if found.researched_at > 0:
		return State.RESEARCHED
	return State.AVAILABLE if found.available else State.LOCKED


## The techs of one tier, in the server's order.
func in_tier(tier: int) -> Array[Tech]:
	var result: Array[Tech] = []
	for entry: Tech in techs:
		if entry.tier == tier:
			result.append(entry)
	return result


## The prerequisites of `key` that are not researched yet.
func missing_prerequisites(key: String) -> PackedStringArray:
	var result := PackedStringArray()
	var found := tech(key)
	if found == null:
		return result
	for need: String in found.prerequisites:
		if not is_researched(need):
			result.append(need)
	return result


## The player blueprints the members may use now (draft.39, SPEC-enterprise-flaggschiff 6a.1):
## the `memberUnlocks` of every researched tech → true. `/v2/research` of a member does not list
## them; the server allows them (`blueprint_allowed`) while the player is a current member.
func member_blueprints() -> Dictionary:
	var result: Dictionary = {}
	for entry: Tech in techs:
		if entry.researched_at > 0:
			for key: String in entry.member_unlocks:
				result[key] = true
	return result


## The display name of a tech; the key's tech is unknown: "".
func name_of(key: String) -> String:
	var found := tech(key)
	return found.name if found != null else ""


## Research time left of the running research at game time `now` (it only shrinks while the lab
## works, faster while member labs help: `speed`).
func remaining_at(now: int) -> int:
	if running == null:
		return 0
	if not running.running:
		return maxi(running.remaining_ms, 0)
	@warning_ignore("integer_division")
	var done := maxi(now - at, 0) * running.speed / SPEED_NORMAL
	return maxi(running.remaining_ms - done, 0)


## Game time until the running research completes at the current speed; 0 when nothing runs.
func time_left_at(now: int) -> int:
	if running == null:
		return 0
	@warning_ignore("integer_division")
	return remaining_at(now) * SPEED_NORMAL / maxi(running.speed, 1)


## How far the running research is (0..1) at `now`.
func progress_at(now: int) -> float:
	if running == null:
		return 0.0
	var found := tech(running.tech)
	if found == null or found.duration_ms <= 0:
		return 0.0
	return clampf(1.0 - float(remaining_at(now)) / float(found.duration_ms), 0.0, 1.0)


## Why `key` cannot be started now: "" when it can, else "right", "done", "busy" (another runs),
## "locked" (prerequisites) or "flagship" (no flagship to run the lab).
func start_blocker(key: String, has_right: bool, has_flagship: bool) -> String:
	match state_of(key):
		State.RESEARCHED:
			return "done"
		State.RUNNING:
			return "busy"
		State.LOCKED:
			return "locked"
	if running != null:
		return "busy"
	if not has_flagship:
		return "flagship"
	if not has_right:
		return "right"
	return ""


## What of `cost` the inventory lacks at `now`: resource → micro-units (empty when it is all
## there). Only a preview: the server counts collected taxes as well.
static func shortfall(cost: Array[Array], stock: EnterpriseTaxes.Stock, now: int) -> Dictionary:
	var result: Dictionary = {}
	for item: Array in cost:
		var key: String = item[0]
		var need: int = item[1]
		var have := stock.value_at(key, now) if stock != null else 0
		if have < need:
			result[key] = need - have
	return result


static func _strings(value: Variant) -> PackedStringArray:
	var result := PackedStringArray()
	for entry: Variant in _list(value):
		var text := Wire.as_string(entry)
		if not text.is_empty():
			result.append(text)
	return result


static func _list(value: Variant) -> Array:
	if typeof(value) == TYPE_ARRAY:
		var list: Array = value
		return list
	return []
