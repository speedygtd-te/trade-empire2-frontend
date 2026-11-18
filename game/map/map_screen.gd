class_name MapScreen
extends Control
## The star system of the player's colony: the star, the orbits, and planets, moons and belts
## where they stand now, moving with the game clock. A tap on a body shows its details. Opened
## from the colony screen over it; Close or Back returns there. "Galaxy" opens the galaxy map over it;
## a system tapped there opens its own system map (`from_galaxy`), whose "Galaxy" button and Back
## return to the galaxy.
##
## Time-lapse runs the map a game day per second for looking; it is never sent anywhere and
## switching it off returns to the present.

## The player left the map.
signal closed

## Game seconds per real second while time-lapse is on.
const TIME_LAPSE := 86400.0
## Page size when listing the player's structures.
const LIST_PAGE := 200

var _system_id := ""
var _home_body := ""
## Opened from the galaxy map: "Galaxy" goes back there instead of opening another one.
var _from_galaxy := false
var _map: SystemMap = null
## Body id → names of the player's structures there.
var _structures: Dictionary = {}
## Offset of the shown time from the game clock (time-lapse), seconds.
var _lapse_s := 0.0
var _lapse := false
var _shown_s := 0.0

var _view: SystemMapView
var _top: PanelContainer
var _bottom: PanelContainer
var _title: Label
var _subtitle: Label
var _hint: Label
var _status: Label
var _details: BodyPanel
var _lapse_button: Button
var _fit_button: Button
var _state: CenterContainer
var _galaxy_button: Button
## Everything of the system map; hidden while the galaxy covers it.
var _content: Control
var _galaxy: GalaxyScreen = null


## The system to show and the player's home body (marked on the map); `from_galaxy` when the
## galaxy map opened it.
func setup(system_id: String, home_body_id: String, from_galaxy: bool = false) -> void:
	_system_id = system_id
	_home_body = home_body_id
	_from_galaxy = from_galaxy


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_content = Control.new()
	_content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_content)
	var background := ColorRect.new()
	background.color = AppTheme.COLOR_BACKGROUND
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_content.add_child(background)
	_view = SystemMapView.new()
	_view.home_body = _home_body
	_view.body_tapped.connect(_on_body_tapped)
	_content.add_child(_view)
	_build_overlay()
	_load()


func _process(delta: float) -> void:
	if _map == null or _galaxy != null:
		return
	if _lapse:
		_lapse_s += delta * TIME_LAPSE
	var before := _shown_s
	_shown_s = Services.clock.now_ms() / 1000.0 + _lapse_s
	_view.time_s = _shown_s
	if not _view.selected.is_empty():
		_view.follow(_view.selected, before)
	_view.queue_redraw()


## Back: the galaxy opened from here handles it first; then close the details, otherwise leave
## the map.
func handle_back() -> void:
	if _galaxy != null:
		_galaxy.handle_back()
	elif not _view.selected.is_empty():
		_select("")
	else:
		closed.emit()


# --- building the screen --------------------------------------------------------------------

func _build_overlay() -> void:
	var margin := SafeAreaMargin.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_content.add_child(margin)
	var column := Ui.column(0)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(column)

	_top = PanelContainer.new()
	column.add_child(_top)
	var top_row := HBoxContainer.new()
	top_row.add_theme_constant_override("separation", 16)
	_top.add_child(top_row)
	var names := Ui.column(4)
	top_row.add_child(names)
	_title = Ui.dynamic_label(AppTheme.VARIATION_HEADING)
	_title.autowrap_mode = TextServer.AUTOWRAP_OFF
	_title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_title.text = tr("MAP_TITLE")
	names.add_child(_title)
	_subtitle = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_subtitle.autowrap_mode = TextServer.AUTOWRAP_OFF
	_subtitle.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	names.add_child(_subtitle)
	var close := Ui.secondary_button("COMMON_CLOSE")
	close.size_flags_horizontal = Control.SIZE_SHRINK_END
	close.pressed.connect(func() -> void: closed.emit())
	top_row.add_child(close)

	var filler := Control.new()
	filler.size_flags_vertical = Control.SIZE_EXPAND_FILL
	filler.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(filler)

	_bottom = PanelContainer.new()
	_bottom.visible = false
	column.add_child(_bottom)
	var rows := Ui.column(16)
	_bottom.add_child(rows)
	_details = BodyPanel.new()
	_details.visible = false
	_details.closed.connect(_select.bind(""))
	rows.add_child(_details)
	_hint = Ui.label("MAP_HINT")
	_hint.add_theme_font_size_override("font_size", AppTheme.FONT_SIZE_SMALL)
	rows.add_child(_hint)
	_status = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	rows.add_child(_status)
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 16)
	rows.add_child(actions)
	_lapse_button = Ui.secondary_button("MAP_TIME_LAPSE")
	_lapse_button.toggle_mode = true
	_lapse_button.toggled.connect(_on_lapse_toggled)
	actions.add_child(_lapse_button)
	_fit_button = Ui.secondary_button("MAP_SHOW_ALL")
	_fit_button.pressed.connect(_on_fit)
	actions.add_child(_fit_button)
	_galaxy_button = Ui.secondary_button("MAP_GALAXY")
	_galaxy_button.pressed.connect(_on_galaxy)
	actions.add_child(_galaxy_button)

	_state = CenterContainer.new()
	_state.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_state.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_content.add_child(_state)
	_show_state("MAP_LOADING")

	# Deferred: while a container lays out, a moved child's global rect is not current yet.
	for bar: Control in [_top, _bottom]:
		bar.item_rect_changed.connect(_update_free_area, CONNECT_DEFERRED)
	_bottom.visibility_changed.connect(_update_free_area, CONNECT_DEFERRED)
	resized.connect(_update_free_area, CONNECT_DEFERRED)
	_show_status()


## The map uses the room between the top bar and the bottom panel.
func _update_free_area() -> void:
	var top := _top.get_global_rect().end.y - global_position.y
	var bottom := size.y
	if _bottom.visible:
		bottom = _bottom.get_global_rect().position.y - global_position.y
	_view.set_free_area(Rect2(0.0, top, size.x, maxf(bottom - top, 1.0)))


## A loading, empty or error message in the middle; `retry` adds a button to load again.
func _show_state(text_key: String, error: ApiError = null) -> void:
	for child: Node in _state.get_children():
		child.queue_free()
	_state.visible = true
	var column := Ui.column(24)
	column.custom_minimum_size = Vector2(560, 0)
	var text := Ui.label(text_key, AppTheme.VARIATION_HEADING if error != null else AppTheme.VARIATION_MUTED)
	text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(text)
	if error != null:
		_state.mouse_filter = Control.MOUSE_FILTER_STOP
		var detail := Ui.dynamic_label(AppTheme.VARIATION_ERROR)
		detail.text = ErrorText.describe(error, self)
		detail.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		column.add_child(detail)
		var retry := Ui.primary_button("COMMON_RETRY")
		retry.pressed.connect(_load)
		column.add_child(retry)
	else:
		_state.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_state.add_child(column)


# --- data -----------------------------------------------------------------------------------

func _load() -> void:
	_show_state("MAP_LOADING")
	if _system_id.is_empty():
		_show_state("MAP_NO_SYSTEM")
		return
	var system := await Services.api.get_json("/v2/systems/" + _system_id.uri_encode())
	if not system.is_ok():
		_show_state("MAP_LOAD_FAILED", system.error)
		return
	var structures := await list_structures()
	if not structures.is_ok():
		_show_state("MAP_LOAD_FAILED", structures.error)
		return
	var items: Array = structures.data.get("items")
	_structures = SystemMap.structures_by_body(items)
	_map = SystemMap.from_system(system.data)
	_title.text = _map.star_name
	_subtitle.text = tr("MAP_STAR_LINE").format({"type": BodyPanel.star_text(_map.star_type, self),
		"kelvin": AmountFormat.units(roundi(_map.star_kelvin)), "count": _map.bodies.size()})
	if _map.bodies.is_empty():
		_show_state("MAP_EMPTY")
		return
	_state.visible = false
	var marked := {}
	for body_id: String in _structures.keys():
		marked[body_id] = true
	_view.marked = marked
	_shown_s = Services.clock.now_ms() / 1000.0
	_view.time_s = _shown_s
	_bottom.visible = true
	await get_tree().process_frame
	_update_free_area()
	_view.show_map(_map)


## All of the player's structures, page by page, as one result with `items`.
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


# --- selection and time ---------------------------------------------------------------------

func _on_body_tapped(body_id: String) -> void:
	_select(body_id)


func _select(body_id: String) -> void:
	_view.selected = body_id
	_details.visible = not body_id.is_empty()
	_hint.visible = body_id.is_empty()
	_status.visible = body_id.is_empty()
	if not body_id.is_empty():
		var names: PackedStringArray = _structures.get(body_id, PackedStringArray())
		_details.show_body(_map, body_id, names, body_id == _home_body)
		# The panel grows over the lower map: keep the body in the middle of what stays free.
		_view.focus_body(body_id, false)
	_view.queue_redraw()


func _on_lapse_toggled(on: bool) -> void:
	_lapse = on
	if not on:
		_lapse_s = 0.0
	_show_status()


func _on_fit() -> void:
	_view.fit()


func _show_status() -> void:
	if _lapse:
		_status.text = tr("MAP_TIME_LAPSE_ON")
		_status.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	else:
		_status.text = tr("MAP_LIVE")
		_status.remove_theme_color_override("font_color")


# --- galaxy ---------------------------------------------------------------------------------

## The galaxy over this map; from a map that the galaxy opened, back to that galaxy.
func _on_galaxy() -> void:
	if _from_galaxy:
		closed.emit()
		return
	if _galaxy != null:
		return
	_galaxy = GalaxyScreen.new()
	_galaxy.setup(_system_id, _home_body)
	_galaxy.closed.connect(_close_galaxy)
	add_child(_galaxy)
	_content.visible = false


func _close_galaxy() -> void:
	if _galaxy == null:
		return
	_galaxy.queue_free()
	_galaxy = null
	_content.visible = true
