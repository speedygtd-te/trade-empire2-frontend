class_name RouteLines
extends Control
## The player's ship routes on the system map: a dashed line between the bodies of their two
## stations (cyan; muted while paused). Ground routes stay on one body and draw nothing. Lies over
## the SystemMapView it belongs to and loads the routes itself (`GET /v2/routes`, again on every
## route event).

const WIDTH := 3.0
const DASH := 14.0

var _view: SystemMapView
## [body A, body B, paused] per ship route between two bodies.
var _pairs: Array[Array] = []
var _loading := false


func _ready() -> void:
	_view = get_parent() as SystemMapView
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Services.events.event_received.connect(_on_event)
	_load()


func _process(_delta: float) -> void:
	if not _pairs.is_empty():
		queue_redraw()


## The body pairs of the ship routes between two different bodies.
static func body_pairs(routes: Array[RoutePlan.Route]) -> Array[Array]:
	var result: Array[Array] = []
	for route: RoutePlan.Route in routes:
		var a := route.station_a.body_id
		var b := route.station_b.body_id
		if route.kind == RoutePlan.KIND_SHIP and not a.is_empty() and not b.is_empty() and a != b:
			result.append([a, b, route.is_paused()])
	return result


func _load() -> void:
	if _loading:
		return
	_loading = true
	var answer := await Services.api.get_json("/v2/routes")
	_loading = false
	if not answer.is_ok() or not is_inside_tree():
		return
	var items: Array = answer.data.get("items") if typeof(answer.data.get("items")) == TYPE_ARRAY else []
	var book := RouteBook.new()
	book.apply_list(items)
	_pairs = body_pairs(book.routes())
	queue_redraw()


func _on_event(event: SseEvent) -> void:
	if event.type == "route.created" or event.type == "route.deleted" or event.type == "route.paused" \
			or event.type == "route.departed":
		_load()


func _draw() -> void:
	if _view == null or _view.map == null:
		return
	for pair: Array in _pairs:
		var a: String = pair[0]
		var b: String = pair[1]
		var paused: bool = pair[2]
		if _view.map.body(a) == null or _view.map.body(b) == null:
			continue
		var from := _view.to_view(_view.map.position(a, _view.time_s))
		var to := _view.to_view(_view.map.position(b, _view.time_s))
		var color := Color(AppTheme.COLOR_MUTED if paused else AppTheme.COLOR_ACCENT, 0.7)
		draw_dashed_line(from, to, color, WIDTH, DASH)
