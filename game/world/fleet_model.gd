class_name FleetModel
extends Node
## The player's own structures, kept current (Fleet): loads the structure list, the details of
## ships and vehicles (their trip), and follows the movement and route events. The colony screen
## owns it and hands it to the fleet panel and the maps.

## Something about the fleet changed (list loaded, a trip started or ended, a route changed).
signal changed
## Loading the list failed; `error` says why.
signal load_failed(error: ApiError)

## Page size when listing the player's structures.
const LIST_PAGE := 200

var fleet := Fleet.new()
## Whether the list has been loaded at least once.
var loaded := false
## Why the last load failed; null when it worked.
var error: ApiError = null
## Names of the bodies the fleet is at or heading to: body id → name.
var body_names: Dictionary = {}
## The player's routes; loaded with the fleet.
var routes: RouteModel
## The player's exploration probes and the explored areas of bodies (draft.31); loaded with the fleet.
var probes: ProbeModel
## Trade on platforms (draft.44): platforms and offers in sight, own offers; loaded when the Trade
## tab or a platform is shown.
var trade: TradeModel
## The player's fleets (draft.33): groups of ships that act as one; loaded with the structures.
var groups := FleetGroups.new()
## Whether the server has fleets (false on one older than draft.33, after its 404).
var groups_supported := true
## Whether the server lists enterprise structures (false on one older than draft.37, after its
## 404). They are in `fleet` as well (`Fleet.enterprise_entries`), the flagship first.
var enterprise_supported := true

var _loading := false
var _enterprise_loading := false
var _again := false


func _ready() -> void:
	Services.events.event_received.connect(_on_event)
	Services.events.resync_requested.connect(_on_resync)
	routes = RouteModel.new()
	routes.name = "Routes"
	add_child(routes)
	probes = ProbeModel.new()
	probes.name = "Probes"
	add_child(probes)
	trade = TradeModel.new()
	trade.name = "Trade"
	trade.body_names = body_names
	add_child(trade)


## Loads the list again, and the details of everything that can move.
func reload() -> void:
	if _loading:
		_again = true
		return
	_loading = true
	var list := await list_structures()
	if not list.is_ok():
		_loading = false
		error = list.error
		load_failed.emit(error)
		_finish()
		return
	error = null
	var items: Array = list.data.get("items")
	fleet.apply_list(items)
	await _load_groups()
	routes.reload()
	probes.reload()
	for entry: Fleet.Entry in fleet.entries():
		if entry.can_fly() or entry.can_drive() or entry.where() == Fleet.Where.TRANSIT:
			var details := await Services.api.get_json("/v2/structures/%d" % entry.structure_id)
			if details.is_ok():
				fleet.apply_details(details.data)
	await _load_enterprise()
	_sync_members()
	await _name_bodies()
	loaded = true
	_loading = false
	changed.emit()
	_finish()


## Loads the structures of the player's enterprise again (it changed, or its flagship came).
func reload_enterprise() -> void:
	if _loading or not loaded or _enterprise_loading:
		return
	_enterprise_loading = true
	await _load_enterprise()
	await _name_bodies()
	_enterprise_loading = false
	changed.emit()


## The enterprise's structures (draft.37) with their details; none outside an enterprise. A
## failed answer keeps what is known; a server without them hides them.
func _load_enterprise() -> void:
	var account := Services.session.account
	var id := account.enterprise_id if account != null else ""
	var refs: Array[EnterpriseFlagship.StructureRef] = []
	if not id.is_empty() and enterprise_supported:
		var answer := await Services.api.get_json("/v2/enterprises/%s/structures" % id.uri_encode())
		if answer.is_ok():
			refs = EnterpriseFlagship.structures_from_wire(answer.data)
		elif answer.error.code == "NOT_FOUND" or answer.error.code == "METHOD_NOT_ALLOWED":
			enterprise_supported = false
		else:
			return
	fleet.apply_enterprise(refs, id)
	for entry: Fleet.Entry in fleet.enterprise_entries():
		var details := await Services.api.get_json("/v2/structures/%d" % entry.structure_id)
		if details.is_ok():
			fleet.apply_details(details.data)
			# The list does not say it; the structure itself does.
			entry.owner_kind = "enterprise"
			entry.enterprise_id = id


## Every structure of the player, all pages in one answer (`data.items`).
static func list_structures() -> ApiResult:
	var items: Array = []
	var cursor := ""
	while true:
		var path := "/v2/structures?limit=%d" % LIST_PAGE
		if not cursor.is_empty():
			path += "&cursor=" + cursor.uri_encode()
		var page := await Services.api.get_json(path)
		if not page.is_ok():
			return page
		if typeof(page.data.get("items")) == TYPE_ARRAY:
			var some: Array = page.data.get("items")
			items.append_array(some)
		cursor = Wire.as_string(page.data.get("nextCursor"))
		if cursor.is_empty():
			break
	var all := ApiResult.new()
	all.data = {"items": items}
	return all


## Loads the fleets (`GET /v2/fleets`); a server without them hides them.
func _load_groups() -> void:
	var answer := await Services.api.get_json("/v2/fleets")
	if answer.is_ok():
		groups_supported = true
		var items: Array = answer.data.get("fleets") if typeof(answer.data.get("fleets")) == TYPE_ARRAY else []
		groups.apply_list(items)
	elif answer.error.code == "NOT_FOUND" or answer.error.code == "METHOD_NOT_ALLOWED":
		groups_supported = false
		groups.apply_list([])


## Gives every structure the fleet the book says it is in.
func _sync_members() -> void:
	for entry: Fleet.Entry in fleet.entries():
		var group := groups.of_structure(entry.structure_id)
		entry.fleet_id = group.fleet_id if group != null else 0


## The fleet a structure is a member of; null when none.
func group_of(structure_id: int) -> FleetGroups.Group:
	return groups.of_structure(structure_id)


# --- fleet commands (draft.33) --------------------------------------------------------------
# Each answer of the server goes into the book at once (the event follows and changes nothing).

## Forms a fleet of resting ships at one body; `data` is the new fleet.
func create_group(group_name: String, members: PackedInt64Array) -> ApiResult:
	return await _group_answer(await Services.api.post_json("/v2/fleets", FleetGroups.create_body(group_name, members)))


func rename_group(fleet_id: int, group_name: String) -> ApiResult:
	return await _group_answer(await Services.api.patch_json("/v2/fleets/%d" % fleet_id, FleetGroups.rename_body(group_name)))


func join_group(fleet_id: int, structure_id: int) -> ApiResult:
	return await _group_answer(await Services.api.post_json("/v2/fleets/%d/members" % fleet_id, FleetGroups.join_body(structure_id)))


## A member leaves; the last one leaving dissolves the fleet.
func leave_group(fleet_id: int, structure_id: int) -> ApiResult:
	return await _group_answer(await Services.api.delete_json("/v2/fleets/%d/members/%d" % [fleet_id, structure_id]))


## Disbands a fleet; its ships are free again and keep their stance.
func dissolve_group(fleet_id: int) -> ApiResult:
	return await _group_answer(await Services.api.delete_json("/v2/fleets/%d" % fleet_id))


## The stance and intent of the fleet and every member ("" leaves one as it is).
func set_group_combat(fleet_id: int, stance: String, intent: String) -> ApiResult:
	return await _group_answer(await Services.api.patch_json("/v2/fleets/%d/combat" % fleet_id,
		FleetGroups.combat_body(stance, intent)))


## What a joint flight into the orbit of `body_id` would take (`data`: FleetQuoteResponse).
func quote_group_travel(fleet_id: int, body_id: String) -> ApiResult:
	return await Services.api.post_json("/v2/fleets/%d/travel/quote" % fleet_id, FleetGroups.travel_body(body_id))


## Starts the joint flight; the members' trips come with `travel.started` (loaded here at once).
func start_group_travel(fleet_id: int, body_id: String) -> ApiResult:
	var result := await Services.api.post_json("/v2/fleets/%d/travel" % fleet_id, FleetGroups.travel_body(body_id))
	if not result.is_ok():
		return result
	var group := FleetGroups.Group.from_wire(result.data)
	groups.put(group)
	_sync_members()
	if group != null:
		for id: int in group.member_ids():
			var details := await Services.api.get_json("/v2/structures/%d" % id)
			if details.is_ok():
				fleet.apply_details(details.data)
	await _name_bodies()
	changed.emit()
	return result


func _group_answer(result: ApiResult) -> ApiResult:
	if result.is_ok():
		groups.apply_answer(result.data)
		_sync_members()
		await _name_bodies()
		changed.emit()
	return result


## The name of a body of the fleet; "" while unknown.
func body_name(body_id: String) -> String:
	return Wire.as_string(body_names.get(body_id))


## Looks up the names of the bodies the fleet is at or heading to that are not known yet.
func _name_bodies() -> void:
	var wanted: Dictionary = {}
	for entry: Fleet.Entry in fleet.entries() + fleet.enterprise_entries():
		if not entry.body_id.is_empty():
			wanted[entry.body_id] = true
		if entry.motion != null and not entry.motion.target_body_id().is_empty():
			wanted[entry.motion.target_body_id()] = true
	for group: FleetGroups.Group in groups.groups():
		for body_id: String in [group.location_body_id, group.target_body_id()]:
			if not body_id.is_empty():
				wanted[body_id] = true
	for body_id: String in wanted.keys():
		if body_names.has(body_id):
			continue
		var body := await Services.api.get_json("/v2/bodies/" + body_id.uri_encode())
		if body.is_ok():
			body_names[body_id] = Wire.as_string(body.data.get("name"))


func _finish() -> void:
	if _again:
		_again = false
		reload()


func _on_event(event: SseEvent) -> void:
	if event.type == "enterprise.flagship":
		# Delivered or destroyed: the enterprise's structures changed.
		reload_enterprise()
		return
	if event.type.begins_with("fleet."):
		_on_group_event(event)
		return
	if event.type == "structure.layoutChanged":
		# A structure this list does not know changed: with an enterprise, a daughter another member
		# founded on an enterprise dock (draft.38; structure events reach every member).
		var changed_id := Wire.as_int(Wire.parse_object(event.data).get("structureId"))
		var account := Services.session.account
		if changed_id != 0 and fleet.find(changed_id) == null and account != null \
				and not account.enterprise_id.is_empty() and enterprise_supported:
			reload_enterprise()
		return
	if not event.type.begins_with("travel.") and not event.type.begins_with("route.") \
			and event.type != "structure.anchorChanged":
		return
	var data := Wire.parse_object(event.data)
	# A fleet's route (draft.35) starts, moves on or ends: its command changed with it.
	var group_id := _group_behind(event.type, data)
	if group_id != 0:
		reload_group(group_id)
	if fleet.apply_event(event.type, data):
		await _name_bodies()
		changed.emit()
	elif event.type == "travel.started" or event.type == "route.created":
		# A structure the list does not know yet (founded since): load it.
		reload()


## The fleet whose command an event changes: a fleet route created, moving on or deleted, or
## a member setting off on a leg; 0 for anything else.
func _group_behind(type: String, data: Dictionary) -> int:
	match type:
		"route.created", "route.updated":
			return Wire.as_int(Wire.as_dict(data.get("route")).get("fleetId"))
		"route.arrived", "route.departed":
			return Wire.as_int(data.get("fleetId"))
		"route.deleted", "route.paused", "route.stalled":
			var route_id := Wire.as_int(data.get("routeId"))
			for group: FleetGroups.Group in groups.groups():
				if group.is_on_route() and group.route_id == route_id:
					return group.fleet_id
		"travel.started", "travel.arrived":
			var group := groups.of_structure(Wire.as_int(data.get("structureId")))
			if group != null and group.is_on_route():
				return group.fleet_id
	return 0


## Loads one fleet again (`GET /v2/fleets/{id}`); a fleet that is gone leaves the book.
func reload_group(fleet_id: int) -> void:
	var answer := await Services.api.get_json("/v2/fleets/%d" % fleet_id)
	if answer.is_ok():
		groups.put(FleetGroups.Group.from_wire(answer.data))
	elif answer.error.code == "FLEET_NOT_FOUND":
		groups.remove(fleet_id)
	else:
		return
	_sync_members()
	await _name_bodies()
	changed.emit()


func _on_group_event(event: SseEvent) -> void:
	var data := Wire.parse_object(event.data)
	var changed_book := groups.apply_event(event.type, data)
	var changed_members := fleet.apply_event(event.type, data)
	if not changed_book and not changed_members:
		return
	await _name_bodies()
	changed.emit()


func _on_resync(_rev: int) -> void:
	reload()
