class_name RouteBook
extends RefCounted
## The player's routes (`GET /v2/routes`), kept current from the route events. Events that carry
## only part of a route (arrived, departed, stalled, paused) update what they say; the exact
## cargo and statistics come with the next full route (`needs_reload`).

var _routes: Dictionary = {}


## Takes the route list: the book is exactly these from now on.
func apply_list(items: Array) -> void:
	_routes.clear()
	for value: Variant in items:
		put(RoutePlan.Route.from_wire(Wire.as_dict(value)))


## Adds or replaces one route (an answer of create, PATCH or GET).
func put(route: RoutePlan.Route) -> void:
	if route != null and route.route_id != 0:
		_routes[route.route_id] = route


func remove(route_id: int) -> bool:
	return _routes.erase(route_id)


func find(route_id: int) -> RoutePlan.Route:
	return _routes.get(route_id) as RoutePlan.Route


func size() -> int:
	return _routes.size()


## Every route, by id (the order the server lists them in).
func routes() -> Array[RoutePlan.Route]:
	var ids: Array = _routes.keys()
	ids.sort()
	var result: Array[RoutePlan.Route] = []
	for id: int in ids:
		result.append(_routes[id] as RoutePlan.Route)
	return result


## The route a structure drives as transporter; null when none.
func of_transporter(structure_id: int) -> RoutePlan.Route:
	for route: RoutePlan.Route in _routes.values():
		if route.transporter_id == structure_id:
			return route
	return null


## Every route a structure drives or is a station of.
func involving(structure_id: int) -> Array[RoutePlan.Route]:
	var result: Array[RoutePlan.Route] = []
	for route: RoutePlan.Route in routes():
		if route.involves(structure_id):
			result.append(route)
	return result


## Applies an event; returns whether it changed a route. `travel.started` of a transporter gives
## its route the arrival time of the trip.
func apply_event(type: String, data: Dictionary) -> bool:
	if type == "route.created" or type == "route.updated":
		var route := RoutePlan.Route.from_wire(Wire.as_dict(data.get("route")))
		if route.route_id == 0:
			return false
		put(route)
		return true
	if type == "travel.started":
		var driven := of_transporter(Wire.as_int(data.get("structureId")))
		if driven == null:
			return false
		driven.next_arrival_at = Wire.as_int(Wire.as_dict(data.get("motion")).get("arrivalAt"))
		return true
	var found := find(Wire.as_int(data.get("routeId")))
	if found == null:
		return false
	match type:
		"route.deleted":
			return remove(found.route_id)
		"route.paused":
			found.state = "paused"
			found.stopping = false
			found.pause_reason = Wire.as_string(data.get("reason"))
			found.stall_reason = ""
			found.retry_at = 0
			found.next_arrival_at = 0
			return true
		"route.stalled":
			found.state = "stalled"
			found.stall_reason = Wire.as_string(data.get("reason"))
			found.retry_at = Wire.as_int(data.get("retryAt"))
			found.next_arrival_at = 0
			_stand_at(found, Wire.as_int(data.get("stationId")))
			return true
		"route.departed":
			found.state = "travelling"
			found.stall_reason = ""
			found.retry_at = 0
			_stand_at(found, Wire.as_int(data.get("toStationId")))
			return true
		"route.arrived":
			_stand_at(found, Wire.as_int(data.get("stationId")))
			return true
	return false


## Whether an event leaves a route with stale cargo or statistics (load it again).
static func needs_reload(type: String) -> bool:
	return type == "route.arrived" or type == "route.departed" or type == "route.stalled" \
		or type == "route.paused"


func _stand_at(route: RoutePlan.Route, structure_id: int) -> void:
	var letter := route.letter_of(structure_id)
	if not letter.is_empty():
		route.station = letter
