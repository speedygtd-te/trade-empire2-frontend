class_name FleetPanel
extends Control
## The player's own structures over the whole screen (FleetModel): each with where it is or
## where it is heading and when it arrives. A tap on one switches the colony screen to it; the
## structure on screen is marked. Close or Back returns.

## The player chose a structure.
signal chosen(structure_id: int)
signal closed

## How often the arrival times are refreshed (seconds).
const REFRESH_SECONDS := 1.0

var _fleet: FleetModel
var _current := 0
var _list: VBoxContainer
var _state: Label
var _retry: Button
var _left := 0.0
var _structures_tab: Button
var _routes_tab: Button
var _structures: VBoxContainer
var _routes: RouteList
var _editor: RouteEditor = null
var _start_with_routes := false


## `current`: the structure the colony screen shows; `routes`: open on the routes tab.
func setup(fleet: FleetModel, current: int, routes: bool = false) -> void:
	_fleet = fleet
	_current = current
	_start_with_routes = routes


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var background := ColorRect.new()
	background.color = AppTheme.COLOR_BACKGROUND
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	var margin := SafeAreaMargin.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(margin)
	var column := Ui.column(16)
	margin.add_child(column)
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 16)
	column.add_child(top)
	var title := Ui.label("FLEET_TITLE", AppTheme.VARIATION_HEADING)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	top.add_child(title)
	var close := Ui.secondary_button("COMMON_CLOSE")
	close.pressed.connect(func() -> void: closed.emit())
	top.add_child(close)
	# Two tabs: the structures, and the routes between them.
	var tabs := HBoxContainer.new()
	column.add_child(tabs)
	var group := ButtonGroup.new()
	_structures_tab = Ui.tab_button("ROUTE_TAB_STRUCTURES", group)
	_structures_tab.pressed.connect(_show_tab.bind(false))
	tabs.add_child(_structures_tab)
	_routes_tab = Ui.tab_button("ROUTE_TAB", group)
	_routes_tab.pressed.connect(_show_tab.bind(true))
	tabs.add_child(_routes_tab)
	_structures = Ui.column(16)
	_structures.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(_structures)
	_state = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_structures.add_child(_state)
	_retry = Ui.secondary_button("COMMON_RETRY")
	_retry.visible = false
	_retry.pressed.connect(_on_retry)
	_structures.add_child(_retry)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_structures.add_child(scroll)
	_list = Ui.column(10)
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_list)
	_routes = RouteList.new()
	_routes.setup(_fleet)
	_routes.edit_requested.connect(func(route_id: int) -> void: open_route_editor(route_id))
	_routes.new_requested.connect(func() -> void: open_route_editor(0))
	column.add_child(_routes)
	_fleet.changed.connect(_rebuild)
	_fleet.load_failed.connect(_on_failed)
	_rebuild()
	_show_tab(_start_with_routes)
	if not _fleet.loaded:
		_fleet.reload()


## Shows the structures or the routes.
func _show_tab(routes: bool) -> void:
	_structures_tab.set_pressed_no_signal(not routes)
	_routes_tab.set_pressed_no_signal(routes)
	_structures.visible = not routes
	_routes.visible = routes


## Opens the route editor over the panel: an existing route (its rules), or a new one (0),
## prefilled with a transporter when `transporter_id` is not 0.
func open_route_editor(route_id: int, transporter_id: int = 0) -> void:
	if _editor != null:
		_editor.queue_free()
	_show_tab(true)
	_editor = RouteEditor.new()
	_editor.setup(_fleet, route_id, transporter_id)
	_editor.closed.connect(_close_editor)
	_editor.saved.connect(func(_route_id: int) -> void: _close_editor())
	add_child(_editor)


func _close_editor() -> void:
	if _editor != null:
		_editor.queue_free()
		_editor = null


## Back closes the route editor (or its picker) first; false when there was nothing to close
## (the owner closes the panel then).
func handle_back() -> bool:
	if _editor != null:
		_editor.handle_back()
		return true
	return false


func _process(delta: float) -> void:
	_left -= delta
	if _left <= 0.0:
		_left = REFRESH_SECONDS
		_update_lines()


func _rebuild() -> void:
	for child: Node in _list.get_children():
		child.queue_free()
	_retry.visible = false
	if not _fleet.loaded:
		_state.text = tr("FLEET_LOADING")
		_state.visible = true
		return
	_state.visible = _fleet.fleet.size() == 0
	_state.text = tr("FLEET_EMPTY")
	for entry: Fleet.Entry in _fleet.fleet.entries():
		var row := ListButton.new()
		row.alignment = HORIZONTAL_ALIGNMENT_LEFT
		row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		row.set_chosen(entry.structure_id == _current)
		row.set_meta("structure", entry.structure_id)
		row.tapped.connect(func() -> void: chosen.emit(entry.structure_id))
		_list.add_child(row)
	_update_lines()


func _update_lines() -> void:
	var now := Services.clock.now_ms()
	for row: Node in _list.get_children():
		var button := row as ListButton
		if button == null or button.is_queued_for_deletion():
			continue
		var id: int = button.get_meta("structure", 0)
		var entry := _fleet.fleet.find(id)
		if entry == null:
			continue
		button.text = "%s\n%s" % [entry.name, status_text(_fleet, entry, now, self)]


func _on_failed(error: ApiError) -> void:
	if _fleet.loaded:
		return
	_state.visible = true
	_state.text = tr("FLEET_LOAD_FAILED") + "\n" + ErrorText.describe(error, self)
	_retry.visible = true


func _on_retry() -> void:
	_retry.visible = false
	_state.text = tr("FLEET_LOADING")
	_fleet.reload()


## One line on where a structure is: its kind and place, or where it is heading and when it
## arrives; a route it drives is mentioned.
static func status_text(fleet_model: FleetModel, entry: Fleet.Entry, now: int, translator: Object) -> String:
	var kind := translator.tr("FLEET_KIND_" + entry.kind.to_upper()) if not entry.kind.is_empty() else ""
	var place := ""
	if entry.motion != null and entry.is_moving(now):
		var key := "FLEET_TAKING_OFF" if entry.motion.phase_at(now) == TravelMotion.Phase.LAUNCHING \
			else "FLEET_UNDER_WAY"
		place = translator.tr(key).format({"target": _target_name(fleet_model, entry.motion, translator),
			"duration": TimeFormat.duration(entry.motion.remaining_ms(now))})
	else:
		match entry.where():
			Fleet.Where.SURFACE:
				place = translator.tr("FLEET_ON_BODY").format({"body": _body(fleet_model, entry.body_id, translator)})
			Fleet.Where.ORBIT:
				place = translator.tr("FLEET_IN_ORBIT").format({"body": _body(fleet_model, entry.body_id, translator)})
			Fleet.Where.DOCKED:
				var host := fleet_model.fleet.find(entry.host_id)
				place = translator.tr("FLEET_DOCKED").format({"host": host.name if host != null else translator.tr("FLEET_UNKNOWN_PLACE")})
			_:
				place = translator.tr("FLEET_IN_TRANSIT")
	var line := "%s · %s" % [kind, place] if not kind.is_empty() else place
	if entry.route_id != 0:
		line += " · " + translator.tr("FLEET_ON_ROUTE")
	return line


static func _target_name(fleet_model: FleetModel, motion: TravelMotion, translator: Object) -> String:
	if motion.target_type() == "dock":
		var host := fleet_model.fleet.find(motion.target_host_id())
		return host.name if host != null else translator.tr("FLEET_UNKNOWN_PLACE")
	var body := _body(fleet_model, motion.target_body_id(), translator)
	if motion.target_type() == "orbit":
		return translator.tr("FLEET_TARGET_ORBIT").format({"body": body})
	return body


static func _body(fleet_model: FleetModel, body_id: String, translator: Object) -> String:
	var known := fleet_model.body_name(body_id)
	return known if not known.is_empty() else translator.tr("FLEET_UNKNOWN_PLACE")
