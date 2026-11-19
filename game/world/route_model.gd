class_name RouteModel
extends Node
## The player's routes, kept current (RouteBook): loads `GET /v2/routes`, follows the route
## events and sends the route commands. The fleet model owns it; the fleet panel, the route
## editor and the map read it.

## Something about the routes changed (list loaded, a route created, moved, paused, deleted).
signal changed
## Loading the list failed; `error` says why.
signal load_failed(error: ApiError)

var book := RouteBook.new()
## Whether the list has been loaded at least once.
var loaded := false
## Why the last load failed; null when it worked.
var error: ApiError = null

var _loading := false
var _again := false


func _ready() -> void:
	Services.events.event_received.connect(_on_event)
	Services.events.resync_requested.connect(_on_resync)


## Loads the list again.
func reload() -> void:
	if _loading:
		_again = true
		return
	_loading = true
	var answer := await Services.api.get_json("/v2/routes")
	_loading = false
	if answer.is_ok():
		error = null
		var items: Array = answer.data.get("items") if typeof(answer.data.get("items")) == TYPE_ARRAY else []
		book.apply_list(items)
		loaded = true
		changed.emit()
	else:
		error = answer.error
		load_failed.emit(error)
	if _again:
		_again = false
		reload()


## Loads one route again (after an event that left its cargo or statistics stale).
func reload_route(route_id: int) -> void:
	var answer := await Services.api.get_json("/v2/routes/%d" % route_id)
	if answer.is_ok():
		book.put(RoutePlan.Route.from_wire(answer.data))
		changed.emit()
	elif answer.error.code == "ROUTE_NOT_FOUND" and book.remove(route_id):
		changed.emit()


## What a new route would do (`POST /v2/routes/quote`); errors of the body come as an error answer.
func quote(draft: RoutePlan.Draft) -> ApiResult:
	return await Services.api.post_json("/v2/routes/quote", draft.create_body())


## Creates a route; its first trip starts at once. On success the route is in the book.
func create(draft: RoutePlan.Draft) -> ApiResult:
	var result := await Services.api.post_json("/v2/routes", draft.create_body())
	if result.is_ok():
		book.put(RoutePlan.Route.from_wire(result.data))
		changed.emit()
	return result


## New rules for both directions (and a new name when one is given).
func update_rules(route_id: int, a_to_b: Array[RoutePlan.Rule], b_to_a: Array[RoutePlan.Rule],
		new_name: String = "") -> ApiResult:
	return await _patch(route_id, RoutePlan.patch_rules(a_to_b, b_to_a, new_name))


## Pauses (at the next station while it travels) or resumes a route.
func set_paused(route_id: int, paused: bool) -> ApiResult:
	return await _patch(route_id, RoutePlan.patch_paused(paused))


## Ends a route: at once when it stands, otherwise at the next station (`deleted` false).
func delete_route(route_id: int) -> ApiResult:
	var result := await Services.api.delete_json("/v2/routes/%d" % route_id)
	if result.is_ok():
		if result.data.get("deleted") == true:
			book.remove(route_id)
		else:
			var route := book.find(route_id)
			if route != null:
				route.deleting = true
		changed.emit()
	return result


func _patch(route_id: int, body: Dictionary) -> ApiResult:
	var result := await Services.api.patch_json("/v2/routes/%d" % route_id, body)
	if result.is_ok():
		book.put(RoutePlan.Route.from_wire(result.data))
		changed.emit()
	return result


func _on_event(event: SseEvent) -> void:
	if not event.type.begins_with("route.") and event.type != "travel.started":
		return
	var data := Wire.parse_object(event.data)
	var known := book.apply_event(event.type, data)
	if known:
		changed.emit()
	if RouteBook.needs_reload(event.type):
		reload_route(Wire.as_int(data.get("routeId")))
	elif not known and event.type.begins_with("route.") and event.type != "route.deleted":
		# A route the list does not know yet: load it.
		reload()


func _on_resync(_rev: int) -> void:
	reload()
