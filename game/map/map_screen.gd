class_name MapScreen
extends Control
## The star system of the player's colony: the star, the orbits, and planets, moons and belts
## where they stand now, moving with the game clock. A tap on a body shows its details. The root
## of the Map tab (`root`: no "‹ Back"), or a layer (a trip's target to pick, a system opened from
## the galaxy) that "‹ Back" or Back closes. "Galaxy" puts the galaxy map over it as a layer; a
## system tapped there opens its own system map (`from_galaxy`), whose "Galaxy" button and Back
## return to the galaxy.
##
## Time-lapse runs the map a game day per second for looking; it is never sent anywhere and
## switching it off returns to the present.

## The player left the map.
signal closed
## Pick mode: the player chose a body (here or in another system's map).
signal body_picked(body_id: String)

## Game seconds per real second while time-lapse is on.
const TIME_LAPSE := 86400.0
## What the body details offer to pick: nothing, the orbit of a body, or a body to land on.
const PICK_NONE := ""
const PICK_ORBIT := "orbit"
const PICK_LAND := "land"
## The target body of an exploration probe (draft.31): it needs a surface.
const PICK_PROBE := "probe"

## Pick mode (set before adding): the details offer to choose the body as the target of a trip.
var pick := PICK_NONE
## The player's fleet (set before adding): structures in orbit and under way are drawn.
var fleet: FleetModel = null
## The root of a tab (set before adding): no "‹ Back".
var root := false
## Light years per coordinate unit of the galaxy (for placing trips), kept for the session.
static var _ly_per_unit := 0.0

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
var _header: LayerHeader
var _hint: Label
var _status: Label
var _details: BodyPanel
var _lapse_button: Button
var _fit_button: Button
var _state: CenterContainer
var _galaxy_button: Button
var _content: Control
## The galaxy opened from here while it is open; null otherwise.
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
	_view.add_child(RouteLines.new())
	_build_overlay()
	if fleet != null:
		fleet.changed.connect(_update_fleet_marks)
	_load()


func _process(delta: float) -> void:
	if _map == null or not is_visible_in_tree():
		return
	if _lapse:
		_lapse_s += delta * TIME_LAPSE
	var before := _shown_s
	_shown_s = Services.clock.now_ms() / 1000.0 + _lapse_s
	_view.time_s = _shown_s
	if not _view.selected.is_empty():
		_view.follow(_view.selected, before)
	_view.queue_redraw()


## Structures of the fleet in orbit of this system's bodies and trips through it, for the view.
func _update_fleet_marks() -> void:
	if fleet == null or _map == null:
		return
	var orbiting: Dictionary = {}
	var trips: Array[TravelMotion] = []
	var now := Services.clock.now_ms()
	for entry: Fleet.Entry in fleet.fleet.entries():
		if entry.motion != null and entry.is_moving(now) and entry.motion.frame == TravelMotion.FRAME_GALAXY:
			trips.append(entry.motion)
		elif entry.where() == Fleet.Where.ORBIT and _map.body(entry.body_id) != null:
			orbiting[entry.body_id] = Wire.as_int(orbiting.get(entry.body_id)) + 1
	_view.orbiting = orbiting
	_view.trips = trips
	_view.queue_redraw()


## Back closes the details; false when none were open (the stack takes the layer off, or the
## shell goes back to Base from the root).
func handle_back() -> bool:
	if not _view.selected.is_empty():
		_select("")
		return true
	return false


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
	_header = LayerHeader.new()
	_header.show_back(not root)
	_header.set_title(tr("MAP_TITLE"))
	_header.back_pressed.connect(func() -> void: closed.emit())
	_top.add_child(_header)

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
	_details.chosen.connect(func(body_id: String) -> void: body_picked.emit(body_id))
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
	var structures := await FleetModel.list_structures()
	if not structures.is_ok():
		_show_state("MAP_LOAD_FAILED", structures.error)
		return
	var items: Array = structures.data.get("items")
	_structures = SystemMap.structures_by_body(items)
	_map = SystemMap.from_system(system.data)
	if _ly_per_unit <= 0.0:
		var galaxy := await Services.api.get_json("/v2/galaxy")
		var shape := GalaxyShape.from_galaxy(galaxy.data) if galaxy.is_ok() else null
		_ly_per_unit = shape.ly_per_unit if shape != null else 1.0
	_view.ly_per_unit = _ly_per_unit
	_view.system_position = GalaxySystems.vector(system.data.get("position"))
	_header.set_title(_map.star_name)
	_header.set_subtitle(tr("MAP_STAR_LINE").format({
		"type": BodyPanel.star_class_text(_map.star.spectral_class, _map.star_type, self),
		"kelvin": AmountFormat.units(roundi(_map.star_kelvin)), "count": _map.bodies.size()}))
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
	_update_fleet_marks()
	match pick:
		PICK_LAND:
			_hint.text = tr("MAP_PICK_HINT_LAND")
		PICK_ORBIT:
			_hint.text = tr("MAP_PICK_HINT_ORBIT")
		PICK_PROBE:
			_hint.text = tr("MAP_PICK_HINT_PROBE")


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
		_details.show_pick(_pick_key(), _pick_reason(body_id))
		# The panel grows over the lower map: keep the body in the middle of what stays free.
		_view.focus_body(body_id, false)
		_show_exploration(body_id)
	_view.queue_redraw()


## How much of a body with a surface the player has explored (draft.31), once its reveal is
## there; landing on a body nobody explored is refused up front.
func _show_exploration(body_id: String) -> void:
	if fleet == null or not fleet.probes.supported():
		return
	var body := _map.body(body_id)
	var grid := Wire.as_dict(body.data.get("grid")) if body != null else {}
	if grid.is_empty() or body.data.get("surfaceBuildable") == false:
		return
	var reveal := await fleet.probes.ensure_reveal(body_id)
	if _view.selected != body_id or not fleet.probes.has_reveal(body_id):
		return
	_details.show_exploration(ProbeTargetScreen.exploration_text(reveal, Wire.as_int(grid.get("sizeX")),
		Wire.as_int(grid.get("sizeY")), self), reveal != null and reveal.fog and reveal.areas.is_empty())
	if pick == PICK_LAND and reveal != null and reveal.fog and reveal.areas.is_empty():
		_details.show_pick(_pick_key(), tr("MAP_PICK_UNEXPLORED"))


## The button text of pick mode; "" outside it.
func _pick_key() -> String:
	match pick:
		PICK_ORBIT:
			return "MAP_PICK_ORBIT"
		PICK_LAND:
			return "MAP_PICK_LAND"
		PICK_PROBE:
			return "MAP_PICK_PROBE"
	return ""


## Why a body cannot be picked (translated); "" when it can: landing and probes need a surface.
func _pick_reason(body_id: String) -> String:
	var body := _map.body(body_id)
	if (pick != PICK_LAND and pick != PICK_PROBE) or body == null:
		return ""
	if Wire.as_dict(body.data.get("grid")).is_empty() or body.data.get("surfaceBuildable") == false:
		return tr("MAP_PICK_NO_SURFACE") if pick == PICK_LAND else tr("MAP_PICK_PROBE_NO_SURFACE")
	return ""


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

## The galaxy as a layer over this map; from a map that the galaxy opened, back to that galaxy.
func _on_galaxy() -> void:
	if _from_galaxy:
		closed.emit()
		return
	if galaxy() != null:
		return
	_galaxy = GalaxyScreen.new()
	_galaxy.setup(_system_id, _home_body)
	_galaxy.pick = pick
	_galaxy.fleet = fleet
	_galaxy.body_picked.connect(func(body_id: String) -> void: body_picked.emit(body_id))
	ScreenStack.push_onto(self, _galaxy)


## The galaxy opened from here while it is open; null otherwise.
func galaxy() -> GalaxyScreen:
	if _galaxy == null or not is_instance_valid(_galaxy) or _galaxy.is_queued_for_deletion():
		return null
	return _galaxy


func _close_galaxy() -> void:
	ScreenStack.close_layer(_galaxy)
	_galaxy = null
