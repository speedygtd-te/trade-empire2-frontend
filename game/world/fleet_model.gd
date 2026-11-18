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

var _loading := false
var _again := false


func _ready() -> void:
	Services.events.event_received.connect(_on_event)
	Services.events.resync_requested.connect(_on_resync)


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
	for entry: Fleet.Entry in fleet.entries():
		if entry.can_fly() or entry.can_drive() or entry.where() == Fleet.Where.TRANSIT:
			var details := await Services.api.get_json("/v2/structures/%d" % entry.structure_id)
			if details.is_ok():
				fleet.apply_details(details.data)
	await _name_bodies()
	loaded = true
	_loading = false
	changed.emit()
	_finish()


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


## The name of a body of the fleet; "" while unknown.
func body_name(body_id: String) -> String:
	return Wire.as_string(body_names.get(body_id))


## Looks up the names of the bodies the fleet is at or heading to that are not known yet.
func _name_bodies() -> void:
	var wanted: Dictionary = {}
	for entry: Fleet.Entry in fleet.entries():
		if not entry.body_id.is_empty():
			wanted[entry.body_id] = true
		if entry.motion != null and not entry.motion.target_body_id().is_empty():
			wanted[entry.motion.target_body_id()] = true
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
	if not event.type.begins_with("travel.") and not event.type.begins_with("route.") \
			and event.type != "structure.anchorChanged":
		return
	var data := Wire.parse_object(event.data)
	if fleet.apply_event(event.type, data):
		await _name_bodies()
		changed.emit()
	elif event.type == "travel.started" or event.type == "route.created":
		# A structure the list does not know yet (founded since): load it.
		reload()


func _on_resync(_rev: int) -> void:
	reload()
