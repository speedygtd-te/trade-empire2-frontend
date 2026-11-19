class_name RouteList
extends VBoxContainer
## The player's routes (RouteModel) as cards: name, transporter, A ↔ B, what it does now, cargo
## on board and what it delivered; with Pause/Resume, Edit and Delete (two taps, the second
## names when it ends). "New route" opens the editor.

## The player wants to edit a route, or create one.
signal edit_requested(route_id: int)
signal new_requested

## How often the time lines are refreshed (seconds).
const REFRESH_SECONDS := 1.0

var _fleet: FleetModel
var _state: Label
var _retry: Button
var _list: VBoxContainer
## Route id → [status label, delete button, note label].
var _cards: Dictionary = {}
## The route whose delete waits for its second tap; 0 when none.
var _armed := 0
## Route id → result line after an action (error or confirmation), until the next rebuild.
var _notes: Dictionary = {}
var _busy := false
var _left := 0.0


func setup(fleet: FleetModel) -> void:
	_fleet = fleet


func _ready() -> void:
	add_theme_constant_override("separation", 12)
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	var create := Ui.primary_button("ROUTE_NEW")
	create.pressed.connect(func() -> void: new_requested.emit())
	add_child(create)
	_state = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	add_child(_state)
	_retry = Ui.secondary_button("COMMON_RETRY")
	_retry.visible = false
	_retry.pressed.connect(_on_retry)
	add_child(_retry)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(scroll)
	_list = Ui.column(12)
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_list)
	_fleet.routes.changed.connect(_rebuild)
	_fleet.routes.load_failed.connect(_on_failed)
	_fleet.changed.connect(_update_lines)
	_rebuild()
	if not _fleet.routes.loaded:
		_fleet.routes.reload()


func _process(delta: float) -> void:
	if not is_visible_in_tree():
		return
	_left -= delta
	if _left <= 0.0:
		_left = REFRESH_SECONDS
		_update_lines()


func _rebuild() -> void:
	for child: Node in _list.get_children():
		child.queue_free()
	_cards.clear()
	_retry.visible = false
	var routes := _fleet.routes
	if not routes.loaded:
		_state.text = tr("ROUTE_LOADING") if routes.error == null else \
			tr("ROUTE_LOAD_FAILED") + "\n" + ErrorText.describe(routes.error, self)
		_retry.visible = routes.error != null
		_state.visible = true
		return
	_state.visible = routes.book.size() == 0
	_state.text = tr("ROUTE_EMPTY")
	if routes.book.find(_armed) == null:
		_armed = 0
	for route: RoutePlan.Route in routes.book.routes():
		_list.add_child(_card(route))
	_update_lines()


func _card(route: RoutePlan.Route) -> PanelContainer:
	var card := PanelContainer.new()
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var rows := Ui.column(8)
	card.add_child(rows)
	var title := Ui.dynamic_label(AppTheme.VARIATION_HEADING)
	title.text = route.name
	rows.add_child(title)
	var ends := Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	ends.text = tr("ROUTE_ENDS").format({
		"transporter": structure_name(_fleet, route.transporter_id, self),
		"a": structure_name(_fleet, route.station_id(RoutePlan.A), self),
		"b": structure_name(_fleet, route.station_id(RoutePlan.B), self),
		"kind": tr("ROUTE_KIND_SHIP") if route.kind == RoutePlan.KIND_SHIP else tr("ROUTE_KIND_GROUND")})
	rows.add_child(ends)
	var status := Ui.dynamic_label()
	rows.add_child(status)
	var details := Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	details.text = details_text(_fleet, route, self)
	rows.add_child(details)
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 12)
	rows.add_child(actions)
	var pause := Ui.secondary_button("ROUTE_RESUME" if route.is_paused() else "ROUTE_PAUSE")
	pause.disabled = _busy or route.deleting or route.stopping
	pause.pressed.connect(_on_pause.bind(route.route_id))
	actions.add_child(pause)
	var edit := Ui.secondary_button("ROUTE_EDIT")
	edit.disabled = _busy or route.deleting
	edit.pressed.connect(func() -> void: edit_requested.emit(route.route_id))
	actions.add_child(edit)
	var delete := Ui.secondary_button("")
	delete.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	delete.text = tr("ROUTE_DELETE")
	delete.theme_type_variation = AppTheme.VARIATION_DANGER_BUTTON
	delete.disabled = _busy or route.deleting
	delete.pressed.connect(_on_delete.bind(route.route_id))
	actions.add_child(delete)
	var note := Ui.dynamic_label()
	rows.add_child(note)
	_cards[route.route_id] = [status, delete, note]
	return card


## Refreshes the time-dependent lines, the armed delete and the result notes.
func _update_lines() -> void:
	if _fleet == null or not _fleet.routes.loaded:
		return
	var now := Services.clock.now_ms()
	for id: int in _cards.keys():
		var route := _fleet.routes.book.find(id)
		if route == null:
			continue
		var parts: Array = _cards[id]
		var status := parts[0] as Label
		status.text = status_text(_fleet, route, now, self)
		status.add_theme_color_override("font_color", status_color(route))
		var delete := parts[1] as Button
		delete.text = tr("ROUTE_DELETE_CONFIRM") if _armed == id else tr("ROUTE_DELETE")
		var note := parts[2] as Label
		if _armed == id:
			note.text = tr("ROUTE_DELETE_WARNING_NOW") if _stands(route) else \
				tr("ROUTE_DELETE_WARNING_LATER").format({"station": structure_name(_fleet, route.current_station_id(), self)})
			note.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
		elif _notes.has(id):
			var shown: Array = _notes[id]
			var color: Color = shown[1]
			note.text = shown[0]
			note.add_theme_color_override("font_color", color)
		else:
			note.text = ""
		note.visible = not note.text.is_empty()


## A waiting or paused route ends at once when deleted; a travelling one at the next station.
static func _stands(route: RoutePlan.Route) -> bool:
	return route.state == "paused" or route.state == "stalled"


func _on_pause(route_id: int) -> void:
	var route := _fleet.routes.book.find(route_id)
	if _busy or route == null:
		return
	_armed = 0
	_busy = true
	var resume := route.is_paused()
	var result := await _fleet.routes.set_paused(route_id, not resume)
	_busy = false
	if result.is_ok():
		_notes[route_id] = [tr("ROUTE_RESUMED") if resume else tr("ROUTE_PAUSE_REQUESTED"), AppTheme.COLOR_OK]
	else:
		_notes[route_id] = [ErrorText.describe(result.error, self), AppTheme.COLOR_DANGER]
	_rebuild()


func _on_delete(route_id: int) -> void:
	if _busy:
		return
	if _armed != route_id:
		_armed = route_id
		_notes.erase(route_id)
		_update_lines()
		return
	_armed = 0
	_busy = true
	var result := await _fleet.routes.delete_route(route_id)
	_busy = false
	if result.is_ok():
		_notes[route_id] = [tr("ROUTE_DELETE_LATER") if result.data.get("deleted") != true else "", AppTheme.COLOR_PENDING]
	else:
		_notes[route_id] = [ErrorText.describe(result.error, self), AppTheme.COLOR_DANGER]
	_rebuild()


func _on_failed(_error: ApiError) -> void:
	if not _fleet.routes.loaded:
		_rebuild()


func _on_retry() -> void:
	_retry.visible = false
	_state.text = tr("ROUTE_LOADING")
	_fleet.routes.reload()


## The name of an own structure; a placeholder while unknown.
static func structure_name(fleet: FleetModel, structure_id: int, translator: Object) -> String:
	var entry := fleet.fleet.find(structure_id) if fleet != null else null
	return entry.name if entry != null and not entry.name.is_empty() else translator.tr("ROUTE_UNKNOWN_STRUCTURE")


## What a route does now: heading to a station and when it arrives, waiting there and why, paused,
## or stopping/ending at the next station.
static func status_text(fleet: FleetModel, route: RoutePlan.Route, now: int, translator: Object) -> String:
	var station := structure_name(fleet, route.current_station_id(), translator)
	var left := route.time_left(now)
	match route.status():
		RoutePlan.Status.DELETING:
			return translator.tr("ROUTE_STATUS_DELETING").format({"station": station})
		RoutePlan.Status.STOPPING:
			return translator.tr("ROUTE_STATUS_STOPPING").format({"station": station})
		RoutePlan.Status.PAUSED:
			if route.pause_reason == "STATION_MOVED":
				return translator.tr("ROUTE_STATUS_PAUSED_MOVED")
			if route.pause_reason == "STATION_MOVING":
				return translator.tr("ROUTE_STATUS_PAUSED_MOVING")
			return translator.tr("ROUTE_STATUS_PAUSED").format({"station": station})
		RoutePlan.Status.WAITING:
			var reason := code_text(route.stall_reason, translator)
			if left > 0:
				return translator.tr("ROUTE_STATUS_WAITING_RETRY").format({"station": station, "reason": reason,
					"duration": TimeFormat.duration(left)})
			return translator.tr("ROUTE_STATUS_WAITING").format({"station": station, "reason": reason})
	if left > 0:
		return translator.tr("ROUTE_STATUS_HEADING_ETA").format({"station": station, "duration": TimeFormat.duration(left)})
	return translator.tr("ROUTE_STATUS_HEADING").format({"station": station})


## Colour of the status line: cyan on the way, amber while waiting or about to stop, muted when
## paused.
static func status_color(route: RoutePlan.Route) -> Color:
	match route.status():
		RoutePlan.Status.HEADING:
			return AppTheme.COLOR_ACCENT
		RoutePlan.Status.PAUSED:
			return AppTheme.COLOR_MUTED
	return AppTheme.COLOR_PENDING


## Cargo on board per destination and what the route has done so far.
static func details_text(fleet: FleetModel, route: RoutePlan.Route, translator: Object) -> String:
	var lines := PackedStringArray()
	for letter: String in [RoutePlan.A, RoutePlan.B]:
		var cargo := route.cargo_for(letter)
		if not cargo.is_empty():
			lines.append(translator.tr("ROUTE_CARGO_FOR").format({
				"station": structure_name(fleet, route.station_id(letter), translator),
				"items": amounts_text(cargo, translator)}))
	lines.append(translator.tr("ROUTE_STATS").format({"trips": route.trips, "cycles": route.cycles}))
	if not route.delivered.is_empty():
		lines.append(translator.tr("ROUTE_DELIVERED").format({"items": amounts_text(route.delivered, translator)}))
	return "\n".join(lines)


## "50 Iron, 3 Water" from [resource, micro-units] pairs.
static func amounts_text(pairs: Array[Array], translator: Object) -> String:
	var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
	var parts := PackedStringArray()
	for pair: Array in pairs:
		var key: String = pair[0]
		var amount: int = pair[1]
		@warning_ignore("integer_division")
		parts.append("%s %s" % [AmountFormat.units(amount / maxi(scale, 1)), item_name(key, translator)])
	return ", ".join(parts) if not parts.is_empty() else translator.tr("ROUTE_NOTHING")


static func item_name(key: String, translator: Object) -> String:
	var shown := Services.definitions.resource_name(key) if Services.definitions != null else ""
	return shown if not shown.is_empty() else translator.tr("STORE_UNKNOWN_ITEM")


## The player-facing sentence for an error code the server reported inside an answer.
static func code_text(code: String, translator: Object) -> String:
	var error := ApiError.new()
	error.code = code
	return ErrorText.describe(error, translator)
