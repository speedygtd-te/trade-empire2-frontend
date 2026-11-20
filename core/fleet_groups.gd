class_name FleetGroups
extends RefCounted
## The player's fleets (draft.33, Backend-V2 docs/SPEC-flotten.md): named groups of own ships
## that act as one ship. Members rest at the same body, travel together into an orbit (the
## slowest warp, the longest launch, one arrival), pay the fuel from the sum of their own supplies
## (the "virtual inventory") and share one stance. While a structure is a member it takes no
## trip, route or stance of its own (`FLEET_MEMBER_LOCKED`).
##
## Kept current from `GET /v2/fleets` and the events `fleet.updated`, `fleet.departed`,
## `fleet.arrived` (a whole `FleetView`) and `fleet.dissolved`. (`Fleet` is the list of the
## player's structures; this is the groups among them.)

const STANCE_PEACEFUL := "peaceful"
const STANCE_AGGRESSIVE := "aggressive"
const INTENT_DESTROY := "destroy"
const INTENT_CAPTURE := "capture"
## The longest name the server takes.
const NAME_MAX := 40


## One member of a fleet (`FleetMember`).
class Member:
	extends RefCounted
	var structure_id := 0
	var name := ""
	## Under way with the fleet.
	var moving := false
	## Mass with guests, without cargo (micro-units).
	var mass := 0


## One item of the virtual inventory (`FleetItem`): sums over the members, micro-units. Only the
## own supply (`self_use`) pays for trips.
class Item:
	extends RefCounted
	var resource := ""
	var self_use := 0
	var in_transport := 0


## One fleet (`FleetView`).
class Group:
	extends RefCounted
	var fleet_id := 0
	var name := ""
	var owner_id := ""
	var created_at := 0
	var stance := STANCE_PEACEFUL
	var intent := INTENT_DESTROY
	var members: Array[Member] = []
	## The body all members rest at; "" when they are not together (or under way).
	var location_body_id := ""
	## The running command: a joint flight ("travel") or a route ("route", draft.35, with its id);
	## the target (TravelTarget) and times only while a flight runs.
	var command_type := ""
	var route_id := 0
	var command_target: Dictionary = {}
	var depart_at := 0
	var arrival_at := 0
	var inventory: Array[Item] = []

	## Whether this is a fleet of the player's enterprise (draft.38): its `ownerId` is the
	## enterprise's internal account, not the asking player; members with
	## COMMAND_ENTERPRISE_FLEET see and command it, its fuel comes from the enterprise inventory.
	func is_enterprise(player_id: String) -> bool:
		return not owner_id.is_empty() and not player_id.is_empty() and owner_id != player_id

	## Reads a `FleetView`; null when it is none.
	static func from_wire(value: Variant) -> Group:
		var data := Wire.as_dict(value)
		var id := Wire.as_int(data.get("fleetId"))
		if id == 0:
			return null
		var group := Group.new()
		group.fleet_id = id
		group.name = Wire.as_string(data.get("name"))
		group.owner_id = Wire.as_string(data.get("ownerId"))
		group.created_at = Wire.as_int(data.get("createdAt"))
		group.stance = Wire.as_string(data.get("stance"), STANCE_PEACEFUL)
		group.intent = Wire.as_string(data.get("intent"), INTENT_DESTROY)
		if typeof(data.get("members")) == TYPE_ARRAY:
			var rows: Array = data.get("members")
			for row: Variant in rows:
				var member_data := Wire.as_dict(row)
				var member := Member.new()
				member.structure_id = Wire.as_int(member_data.get("structureId"))
				member.name = Wire.as_string(member_data.get("name"))
				member.moving = member_data.get("moving") == true
				member.mass = Wire.as_int(member_data.get("mass"))
				if member.structure_id != 0:
					group.members.append(member)
		group.location_body_id = Wire.as_string(Wire.as_dict(data.get("location")).get("bodyId"))
		var command := Wire.as_dict(data.get("command"))
		if not command.is_empty():
			group.command_type = Wire.as_string(command.get("type"))
			group.route_id = Wire.as_int(command.get("routeId"))
			group.command_target = Wire.as_dict(command.get("target"))
			group.depart_at = Wire.as_int(command.get("departAt"))
			group.arrival_at = Wire.as_int(command.get("arrivalAt"))
		if typeof(data.get("inventory")) == TYPE_ARRAY:
			var items: Array = data.get("inventory")
			for row: Variant in items:
				var item_data := Wire.as_dict(row)
				var item := Item.new()
				item.resource = Wire.as_string(item_data.get("resource"))
				item.self_use = Wire.as_int(item_data.get("selfUse"))
				item.in_transport = Wire.as_int(item_data.get("inTransport"))
				if not item.resource.is_empty():
					group.inventory.append(item)
		return group

	func has_member(structure_id: int) -> bool:
		return member(structure_id) != null

	func member(structure_id: int) -> Member:
		for value: Member in members:
			if value.structure_id == structure_id:
				return value
		return null

	func member_ids() -> PackedInt64Array:
		var result := PackedInt64Array()
		for value: Member in members:
			result.append(value.structure_id)
		return result

	## Whether a command runs (a joint flight; members cannot leave, the fleet cannot disband).
	func has_command() -> bool:
		return not command_type.is_empty()

	## Whether all members rest at one body (needed to fly and to disband).
	func is_together() -> bool:
		return not location_body_id.is_empty()

	## The body the running flight heads for; "" without one.
	func target_body_id() -> String:
		return Wire.as_string(command_target.get("bodyId"))

	## Whether it runs a route (draft.35): it then has a command until the route is gone.
	func is_on_route() -> bool:
		return command_type == "route"

	## Whether the fleet is under way at game time `now` (a flight, also one leg of a route).
	func is_travelling(now: int) -> bool:
		return has_command() and arrival_at > 0 and now < arrival_at

	func remaining_ms(now: int) -> int:
		return maxi(0, arrival_at - now) if has_command() and arrival_at > 0 else 0

	## 0..1 of the flight at `now` (by time).
	func progress_at(now: int) -> float:
		if not has_command() or arrival_at <= 0:
			return 0.0
		if arrival_at <= depart_at:
			return 1.0
		return clampf(float(now - depart_at) / float(arrival_at - depart_at), 0.0, 1.0)

	func is_aggressive() -> bool:
		return stance == STANCE_AGGRESSIVE

	## Σ own supply of an item over the members (micro-units); 0 when none has it.
	func supply_of(resource: String) -> int:
		for item: Item in inventory:
			if item.resource == resource:
				return item.self_use
		return 0


## One member in a quote of a joint flight.
class MemberQuote:
	extends RefCounted
	var structure_id := 0
	## Its own broken rules (never its own fuel: that comes from the pool).
	var errors := PackedStringArray()
	var mass := 0
	var max_mass := 0
	var warp_level := 0
	var launch_ms := 0
	## Its own need and what is drawn from its own supply: resource → micro-units.
	var need: Dictionary = {}
	var draw: Dictionary = {}


## A quote of a joint flight (`FleetQuoteResponse`): the shared times and the pooled fuel as a
## TravelPlan.Quote (fuel rows: Σ need against Σ own supply), who sets the pace and the launch,
## and each member's rules, need and draw.
class Quote:
	extends RefCounted
	var trip: TravelPlan.Quote = null
	## The member with the lowest warp level and the one with the longest launch (0: none).
	var slowest := 0
	var longest_launch := 0
	var members: Array[MemberQuote] = []

	## Reads a fleet quote; null when the answer is not one.
	static func from_wire(value: Variant) -> Quote:
		var data := Wire.as_dict(value)
		var trip := TravelPlan.Quote.from_wire(data)
		if trip == null:
			return null
		var quote := Quote.new()
		quote.trip = trip
		quote.slowest = Wire.as_int(data.get("slowest"))
		quote.longest_launch = Wire.as_int(data.get("longestLaunch"))
		if typeof(data.get("members")) == TYPE_ARRAY:
			var rows: Array = data.get("members")
			for row: Variant in rows:
				var member_data := Wire.as_dict(row)
				var member := MemberQuote.new()
				member.structure_id = Wire.as_int(member_data.get("structureId"))
				member.errors = FleetGroups._codes(member_data.get("errors"))
				member.mass = Wire.as_int(member_data.get("mass"))
				member.max_mass = Wire.as_int(member_data.get("maxMass"))
				member.warp_level = Wire.as_int(member_data.get("warpLevel"))
				member.launch_ms = Wire.as_int(member_data.get("launchMs"))
				member.need = FleetGroups._amounts(member_data.get("need"))
				member.draw = FleetGroups._amounts(member_data.get("fuel"))
				quote.members.append(member)
		return quote

	func member(structure_id: int) -> MemberQuote:
		for value: MemberQuote in members:
			if value.structure_id == structure_id:
				return value
		return null

	## The members that keep the fleet on the ground (own broken rules).
	func blocked_members() -> Array[MemberQuote]:
		var result: Array[MemberQuote] = []
		for value: MemberQuote in members:
			if not value.errors.is_empty():
				result.append(value)
		return result


var _groups: Dictionary = {}


## Takes the fleet list: the book is exactly these from now on.
func apply_list(items: Array) -> void:
	_groups.clear()
	for value: Variant in items:
		put(Group.from_wire(value))


## Adds or replaces one fleet (an answer or an event).
func put(group: Group) -> void:
	if group != null and group.fleet_id != 0:
		_groups[group.fleet_id] = group


func remove(fleet_id: int) -> bool:
	return _groups.erase(fleet_id)


func find(fleet_id: int) -> Group:
	return _groups.get(fleet_id) as Group


func size() -> int:
	return _groups.size()


## Every fleet, by id (the order the server lists them in).
func groups() -> Array[Group]:
	var ids: Array = _groups.keys()
	ids.sort()
	var result: Array[Group] = []
	for id: int in ids:
		result.append(_groups[id] as Group)
	return result


## The fleet a structure is a member of; null when none.
func of_structure(structure_id: int) -> Group:
	for group: Group in _groups.values():
		if group.has_member(structure_id):
			return group
	return null


## Applies an event of the stream; returns whether it changed the book.
func apply_event(type: String, data: Dictionary) -> bool:
	match type:
		"fleet.updated", "fleet.departed", "fleet.arrived":
			var group := Group.from_wire(data.get("fleet"))
			if group == null:
				return false
			put(group)
			return true
		"fleet.dissolved":
			return remove(Wire.as_int(data.get("fleetId")))
	return false


## Applies an answer of `DELETE /v2/fleets/{id}/members/{sid}` or `DELETE /v2/fleets/{id}`:
## a `FleetView`, or `{fleetId, dissolved: true}`.
func apply_answer(data: Dictionary) -> void:
	if data.get("dissolved") == true:
		remove(Wire.as_int(data.get("fleetId")))
		return
	put(Group.from_wire(data))


## The structures that could form a fleet or join one now: own ships with a space drive, resting,
## not driving a route, in no fleet; at `body_id` when given ("" for any body). With `enterprise`
## the enterprise's structures follow (draft.38: a member with COMMAND_ENTERPRISE_FLEET forms
## enterprise fleets from them; a fleet never mixes them with own ships).
func candidates(structures: Fleet, body_id: String, now: int, enterprise: bool = false) -> Array[Fleet.Entry]:
	var result: Array[Fleet.Entry] = []
	var pool := structures.entries()
	if enterprise:
		pool.append_array(structures.enterprise_entries())
	for entry: Fleet.Entry in pool:
		if not entry.can_fly() or entry.is_moving(now) or entry.route_id != 0:
			continue
		if of_structure(entry.structure_id) != null:
			continue
		var body := structures.body_of(entry.structure_id)
		if body.is_empty() or (not body_id.is_empty() and body != body_id):
			continue
		result.append(entry)
	return result


## The members that keep a fleet from flying, from a `FLEET_NOT_READY` error
## (`details.members = [{structureId, errors[]}]`): structure id → codes.
static func not_ready_members(error: ApiError) -> Dictionary:
	var result: Dictionary = {}
	if error == null or typeof(error.details.get("members")) != TYPE_ARRAY:
		return result
	var rows: Array = error.details.get("members")
	for row: Variant in rows:
		var data := Wire.as_dict(row)
		var id := Wire.as_int(data.get("structureId"))
		if id != 0:
			result[id] = _codes(data.get("errors"))
	return result


# --- requests -------------------------------------------------------------------------------

## `POST /v2/fleets`: the members, and the name unless it is blank (the server names it then).
static func create_body(fleet_name: String, members: PackedInt64Array) -> Dictionary:
	var ids: Array[int] = []
	for id: int in members:
		ids.append(id)
	var body := {"members": ids}
	var trimmed := fleet_name.strip_edges()
	if not trimmed.is_empty():
		body["name"] = trimmed
	return body


## `POST /v2/fleets/{id}/members`.
static func join_body(structure_id: int) -> Dictionary:
	return {"structureId": structure_id}


## `PATCH /v2/fleets/{id}`.
static func rename_body(fleet_name: String) -> Dictionary:
	return {"name": fleet_name.strip_edges()}


## `PATCH /v2/fleets/{id}/combat`: only the fields given ("" leaves one as it is).
static func combat_body(stance: String, intent: String) -> Dictionary:
	var body := {}
	if not stance.is_empty():
		body["stance"] = stance
	if not intent.is_empty():
		body["intent"] = intent
	return body


## `POST /v2/fleets/{id}/travel` and its quote: a joint flight is only into an orbit.
static func travel_body(body_id: String) -> Dictionary:
	return {"target": TravelPlan.orbit_target(body_id)}


## Whether a name is one the server takes: 1–40 letters, digits, spaces, `-`, `_` (blank is
## allowed when creating: the server picks one).
static func is_valid_name(fleet_name: String) -> bool:
	var trimmed := fleet_name.strip_edges()
	if trimmed.is_empty() or trimmed.length() > NAME_MAX:
		return false
	for index: int in trimmed.length():
		var code := trimmed.unicode_at(index)
		if not (_is_letter(code) or (code >= 48 and code <= 57) or code == 32 or code == 45 or code == 95):
			return false
	return true


static func _is_letter(code: int) -> bool:
	var character := String.chr(code)
	return character.to_upper() != character.to_lower()


static func _codes(value: Variant) -> PackedStringArray:
	var result := PackedStringArray()
	if typeof(value) == TYPE_ARRAY:
		var codes: Array = value
		for code: Variant in codes:
			result.append(Wire.as_string(code))
	return result


static func _amounts(value: Variant) -> Dictionary:
	var result: Dictionary = {}
	if typeof(value) == TYPE_ARRAY:
		var rows: Array = value
		for row: Variant in rows:
			var data := Wire.as_dict(row)
			var resource := Wire.as_string(data.get("resource"))
			if not resource.is_empty():
				result[resource] = Wire.as_int(data.get("amount"))
	return result
