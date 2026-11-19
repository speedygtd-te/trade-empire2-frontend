class_name GalaxyScreen
extends Control
## The galaxy around the player: the whole spiral from the galaxy's parameters, down to the real
## systems near the camera. Home and the systems with own structures are marked; a tap on a system
## shows its details, and from there its system map opens as a layer over the galaxy. A layer
## pushed from a system map; "‹ Back" or Back returns there.
##
## Loading the systems: one `GET /v2/galaxy/systems` sphere around the camera (GalaxyCamera
## decides when and how large), at most one request at a time, sent once the camera has rested
## for DEBOUNCE seconds and only when no loaded sphere already covers the view. The answer is
## parsed away from the main thread; it holds only the systems the player has discovered (SSE
## `sight.discovered` reloads). Sector downloads (`/v2/galaxy/sectors/{id}`, cacheable)
## would take dozens of requests for one view of 200 ly; the sphere takes one.
##
## Sight: `GET /v2/sight` gives the spheres of discovered space and the telescopes; the view veils
## what lies outside and rings the telescope spheres, a line at the bottom names the best range.
## It loads after the galaxy and again on SSE `sight.discovered` and `telescope.upgraded`; when it
## fails the galaxy works as before, unveiled, and the line says so.

## The player left the galaxy.
signal closed
## Pick mode: the player chose a body in a system map opened from here.
signal body_picked(body_id: String)

## Seconds the camera has to rest before the systems around it load.
const DEBOUNCE := 0.35
## Own systems whose position is looked up for the marks (each one `GET /v2/systems/{id}`).
const MAX_OWN_LOOKUPS := 12
## The glow of each galaxy, kept for the session: computing it takes a moment.
static var _glow_cache: Dictionary = {}

## Pick mode of the system maps opened from here (MapScreen.pick); set before adding.
var pick := ""
## The player's fleet (set before adding): flights between systems are drawn.
var fleet: FleetModel = null
var _from_system := ""
var _home_system := ""
var _home_body := ""
var _shape: GalaxyShape = null
var _home: GalaxySystems.Entry = null
## Systems with own structures: id → true.
var _own: Dictionary = {}
var _store := GalaxySystems.new()
## The camera's height above the plane for queries: the home system's z.
var _plane_z := 0.0
var _loading := false
var _again := false
var _load_error: ApiError = null
var _last: GalaxySystems.Answer = null
## Work on worker threads: the glow image and the parsing of a systems answer (-1 = none).
var _glow_task := -1
var _glow_key := ""
var _glow_out: Array[Image] = []
var _parse_task := -1
var _parse_out: Array[GalaxySystems.Answer] = []
## The player's sight; null until loaded. A load asked for while one runs follows it.
var _sight: Sight = null
var _sight_error: ApiError = null
var _sight_loading := false
var _sight_again := false

var _content: Control
var _view: GalaxyView
var _top: PanelContainer
var _bottom: PanelContainer
var _header: LayerHeader
var _hint: Label
var _status: Label
## The best telescope range (cyan like the rings), or why the sight is unknown.
var _sight_line: Label
var _retry: Button
var _details: GalaxyPanel
var _home_button: Button
var _all_button: Button
var _state: CenterContainer
var _debounce: Timer
var _system_map: MapScreen = null


## `from_system` is the system map the galaxy was opened from (its system is shown first);
## `home_body` the player's home body (its system is home).
func setup(from_system: String, home_body: String) -> void:
	_from_system = from_system
	_home_body = home_body
	_home_system = GalaxySystems.system_of_body(home_body)


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
	_view = GalaxyView.new()
	_view.system_tapped.connect(_on_system_tapped)
	_view.moved.connect(_on_moved)
	_content.add_child(_view)
	_debounce = Timer.new()
	_debounce.one_shot = true
	_debounce.wait_time = DEBOUNCE
	_debounce.timeout.connect(_load_systems)
	add_child(_debounce)
	_build_overlay()
	if Services.events != null:
		Services.events.event_received.connect(_on_event)
	_load()


## Only discovered systems come from the server (draft.25): when a telescope or an arrival
## discovers more, the loaded spheres are stale.
func _on_event(event: SseEvent) -> void:
	if event.type == "sight.discovered":
		_store.clear()
		_debounce.start()
		_load_sight()
	elif event.type == "telescope.upgraded":
		_load_sight()


func _exit_tree() -> void:
	for task: int in [_glow_task, _parse_task]:
		if task >= 0:
			WorkerThreadPool.wait_for_task_completion(task)
	_glow_task = -1
	_parse_task = -1


## Back closes the details; false when none were open (the stack takes the galaxy off).
func handle_back() -> bool:
	if _view.selected != null:
		_select("")
		return true
	return false


## The system map opened from here while it is open; null otherwise.
func system_map() -> MapScreen:
	if _system_map == null or not is_instance_valid(_system_map) or _system_map.is_queued_for_deletion():
		return null
	return _system_map


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
	_header.set_title(tr("GALAXY_TITLE"))
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
	_details = GalaxyPanel.new()
	_details.visible = false
	_details.closed.connect(_select.bind(""))
	_details.open_requested.connect(_open_system)
	rows.add_child(_details)
	_hint = Ui.label("GALAXY_HINT")
	_hint.add_theme_font_size_override("font_size", AppTheme.FONT_SIZE_SMALL)
	rows.add_child(_hint)
	_status = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	rows.add_child(_status)
	_sight_line = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_sight_line.add_theme_font_size_override("font_size", AppTheme.FONT_SIZE_SMALL)
	_sight_line.visible = false
	rows.add_child(_sight_line)
	_retry = Ui.secondary_button("COMMON_RETRY")
	_retry.visible = false
	_retry.pressed.connect(_on_retry)
	rows.add_child(_retry)
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 16)
	rows.add_child(actions)
	_home_button = Ui.secondary_button("GALAXY_HOME")
	_home_button.pressed.connect(_on_home)
	actions.add_child(_home_button)
	_all_button = Ui.secondary_button("GALAXY_SHOW_ALL")
	_all_button.pressed.connect(_on_show_all)
	actions.add_child(_all_button)

	_state = CenterContainer.new()
	_state.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_state.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_content.add_child(_state)
	_show_state("GALAXY_LOADING")

	for bar: Control in [_top, _bottom]:
		bar.item_rect_changed.connect(_update_free_area, CONNECT_DEFERRED)
	_bottom.visibility_changed.connect(_update_free_area, CONNECT_DEFERRED)
	resized.connect(_update_free_area, CONNECT_DEFERRED)


## The map uses the room between the top bar and the bottom panel.
func _update_free_area() -> void:
	var top := _top.get_global_rect().end.y - global_position.y
	var bottom := size.y
	if _bottom.visible:
		bottom = _bottom.get_global_rect().position.y - global_position.y
	_view.set_free_area(Rect2(0.0, top, size.x, maxf(bottom - top, 1.0)))


## A loading or error message in the middle; an error adds a button to load again.
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

## The galaxy's shape, the player's systems and where home is; then the view opens on the system
## the galaxy was opened from.
func _load() -> void:
	_show_state("GALAXY_LOADING")
	var galaxy := await Services.api.get_json("/v2/galaxy")
	if not galaxy.is_ok():
		_show_state("GALAXY_LOAD_FAILED", galaxy.error)
		return
	_shape = GalaxyShape.from_galaxy(galaxy.data)
	if _shape == null:
		var malformed := ApiError.new()
		malformed.code = ApiResult.CODE_MALFORMED_RESPONSE
		_show_state("GALAXY_LOAD_FAILED", malformed)
		return
	var structures := await FleetModel.list_structures()
	if not structures.is_ok():
		_show_state("GALAXY_LOAD_FAILED", structures.error)
		return
	var items: Array = structures.data.get("items")
	_own.clear()
	for id: String in GalaxySystems.own_systems(SystemMap.structures_by_body(items).keys()):
		_own[id] = true
	var marks := {}
	# Home first: without it there is no "you are here".
	var lookups := PackedStringArray()
	for id: String in [_home_system, _from_system]:
		if not id.is_empty() and not lookups.has(id):
			lookups.append(id)
	for id: String in _own.keys():
		if lookups.size() >= MAX_OWN_LOOKUPS + 2:
			break
		if not lookups.has(id):
			lookups.append(id)
	var from_entry: GalaxySystems.Entry = null
	for id: String in lookups:
		var system := await Services.api.get_json("/v2/systems/" + id.uri_encode())
		if not system.is_ok():
			if id == _home_system or id == _from_system:
				_show_state("GALAXY_LOAD_FAILED", system.error)
				return
			continue
		var entry := GalaxySystems.entry_from_system(system.data)
		if entry == null:
			continue
		if id == _home_system:
			_home = entry
		if id == _from_system:
			from_entry = entry
		if id == _home_system or _own.has(id):
			marks[id] = entry
	if _home != null:
		_plane_z = _home.position.z
	elif from_entry != null:
		_plane_z = from_entry.position.z

	_state.visible = false
	# The server's name is generated from the seed ("Galaxy 1116014313"); a description of the
	# shape says more to a player.
	var across := AmountFormat.units(roundi(_shape.radius * 2.0))
	_header.set_subtitle(tr("GALAXY_SUBTITLE_SPIRAL").format({"arms": _shape.arm_count, "across": across})
		if _shape.arm_count > 0 else tr("GALAXY_SUBTITLE").format({"across": across}))
	_view.marks = marks
	_view.home_id = _home_system
	_update_trips()
	if fleet != null and not fleet.changed.is_connected(_update_trips):
		fleet.changed.connect(_update_trips)
	_home_button.disabled = _home == null
	_bottom.visible = true
	await get_tree().process_frame
	_update_free_area()
	_view.show_galaxy(_shape)
	_make_glow()
	var start := from_entry if from_entry != null else _home
	if start != null:
		_view.look_at_point(Vector2(start.position.x, start.position.y), GalaxyCamera.HOME_RADIUS)
	_show_status()
	_load_sight()


## The spheres of discovered space and the telescopes (`GET /v2/sight`). A failure keeps the last
## sight (or none: the galaxy stays unveiled) and only says so in the sight line.
func _load_sight() -> void:
	if _shape == null or not is_inside_tree():
		return
	if _sight_loading:
		_sight_again = true
		return
	_sight_loading = true
	var result := await Services.api.get_json("/v2/sight")
	_sight_loading = false
	if not is_inside_tree():
		return
	if result.is_ok():
		_sight = Sight.from_wire(result.data)
		_sight_error = null
		_view.set_sight(_sight)
	else:
		_sight_error = result.error
	_show_sight()
	if _sight_again:
		_sight_again = false
		_load_sight()


## "Your telescopes see 14 ly" (cyan, like their rings), that none sees right now, or that the
## sight could not be loaded; nothing while it is unknown or the player has no telescope.
func _show_sight() -> void:
	if _sight_line == null:
		return
	var text := ""
	var color := AppTheme.COLOR_MUTED
	if _sight_error != null and _sight == null:
		text = tr("SIGHT_FAILED").format({"reason": ErrorText.describe(_sight_error, self)})
	elif _sight != null and not _sight.telescopes.is_empty():
		var best := _sight.best_range_ly()
		if best <= 0.0:
			text = tr("SIGHT_LINE_IDLE")
			color = AppTheme.COLOR_PENDING
		else:
			var key := "SIGHT_LINE_ONE" if _sight.telescopes.size() == 1 else "SIGHT_LINE"
			text = tr(key).format({"ly": Sight.ly_text(best), "count": _sight.telescopes.size()})
			color = AppTheme.COLOR_ACCENT
			if _sight.idle_count() > 0:
				text += " " + tr("SIGHT_LINE_SOME_IDLE").format({"count": _sight.idle_count()})
	_sight_line.text = text
	_sight_line.add_theme_color_override("font_color", color)
	_sight_line.visible = not text.is_empty() and _view.selected == null


## The fleet's flights between systems, for the view.
func _update_trips() -> void:
	var trips: Array[TravelMotion] = []
	if fleet != null:
		var now := Services.clock.now_ms()
		for entry: Fleet.Entry in fleet.fleet.entries():
			if entry.motion != null and entry.is_moving(now) and TravelTrack.is_interstellar(entry.motion):
				trips.append(entry.motion)
	_view.trips = trips
	_view.redraw_marks()


## The glow image, computed on a worker thread once per galaxy and session (`_process` picks
## it up).
func _make_glow() -> void:
	_glow_key = "%s/%.0f/%d/%.3f/%.0f/%.0f" % [_shape.galaxy_name, _shape.radius, _shape.arm_count,
		_shape.arm_tightness, _shape.core_radius, _shape.disk_thickness]
	if _glow_cache.has(_glow_key):
		_view.set_glow(_glow_cache[_glow_key] as Texture2D)
		return
	if _glow_task >= 0:
		return
	var shape := _shape
	var out := _glow_out
	out.clear()
	_glow_task = WorkerThreadPool.add_task(func() -> void: out.append(shape.top_view(GalaxyView.GLOW_PIXELS)))


## Work done on worker threads arrives here; waiting in `_process` instead of an await keeps a
## closed screen from resuming.
func _process(_delta: float) -> void:
	if not _view.trips.is_empty() and is_visible_in_tree():
		_view.redraw_marks()
	if _glow_task >= 0 and WorkerThreadPool.is_task_completed(_glow_task):
		WorkerThreadPool.wait_for_task_completion(_glow_task)
		_glow_task = -1
		if not _glow_out.is_empty():
			var texture := ImageTexture.create_from_image(_glow_out[0])
			_glow_cache[_glow_key] = texture
			_view.set_glow(texture)
	if _parse_task >= 0 and WorkerThreadPool.is_task_completed(_parse_task):
		WorkerThreadPool.wait_for_task_completion(_parse_task)
		_parse_task = -1
		if not _parse_out.is_empty():
			_last = _parse_out[0]
			_store.add(_last)
			_view.set_systems(_store.entries(), GalaxySystems.area_density(_last))
		_finish_loading()


## The systems around the camera, when the view is close enough and nothing loaded covers it.
func _load_systems() -> void:
	if _shape == null or not is_inside_tree():
		return
	if _loading:
		_again = true
		return
	var seen := _view.visible_radius()
	var centre := Vector3(_view.centre().x, _view.centre().y, _plane_z)
	var limit := _shape.query_radius_limit(centre)
	var radius := GalaxyCamera.request_radius(seen, limit)
	if radius <= 0.0 or _store.covers(centre, GalaxyCamera.needed_radius(seen, limit)):
		_show_status()
		return
	_loading = true
	_load_error = null
	_show_status()
	var result := await Services.api.get_text("/v2/galaxy/systems?" + GalaxyCamera.query(centre, radius), "application/x-ndjson")
	if not result.is_ok():
		_load_error = result.error
		_finish_loading()
		return
	var text := result.body
	var sector := _shape.sector_size
	var out := _parse_out
	out.clear()
	_parse_task = WorkerThreadPool.add_task(func() -> void:
		out.append(GalaxySystems.from_stream(Ndjson.parse(text), centre, radius, sector)))


func _finish_loading() -> void:
	_loading = false
	_show_status()
	if _again:
		_again = false
		_debounce.start()

func _on_moved() -> void:
	_debounce.start()
	_show_status()


func _on_retry() -> void:
	_load_error = null
	_store.clear()
	_load_systems()
	if _sight_error != null:
		_load_sight()


# --- selection ------------------------------------------------------------------------------

func _on_system_tapped(system_id: String) -> void:
	_select(system_id)


func _select(system_id: String) -> void:
	var entry: GalaxySystems.Entry = null
	if not system_id.is_empty():
		entry = _store.find(system_id)
		if entry == null:
			entry = _view.marks.get(system_id) as GalaxySystems.Entry
	_view.selected = entry
	_details.visible = entry != null
	_hint.visible = entry == null
	_status.visible = entry == null
	_show_sight()
	if entry != null:
		_details.show_system(entry, _home, _own.has(entry.id), _shape.ly_per_unit)
	_view.queue_redraw()
	_show_status()


## The system map of a tapped system over the galaxy; the system the galaxy came from is already
## open underneath, so for that one the galaxy just closes.
func _open_system(system_id: String) -> void:
	if system_id == _from_system:
		closed.emit()
		return
	if system_map() != null:
		return
	_system_map = MapScreen.new()
	_system_map.setup(system_id, _home_body, true)
	_system_map.pick = pick
	_system_map.fleet = fleet
	_system_map.body_picked.connect(func(body_id: String) -> void: body_picked.emit(body_id))
	ScreenStack.push_onto(self, _system_map)


func _close_system() -> void:
	ScreenStack.close_layer(_system_map)
	_system_map = null


func _on_home() -> void:
	if _home != null:
		_view.look_at_point(Vector2(_home.position.x, _home.position.y), GalaxyCamera.HOME_RADIUS)


func _on_show_all() -> void:
	_view.show_all()


## What the view shows: the far galaxy, stars loading, how many, too many, none, or an error.
func _show_status() -> void:
	if _status == null or _shape == null:
		return
	var color := AppTheme.COLOR_MUTED
	var seen := _view.visible_radius()
	_retry.visible = false
	if not GalaxyCamera.shows_systems(seen):
		_status.text = tr("GALAXY_STATUS_FAR")
	elif _loading:
		_status.text = tr("GALAXY_STATUS_LOADING")
	elif _load_error != null:
		_status.text = tr("GALAXY_STATUS_FAILED").format({"reason": ErrorText.describe(_load_error, self)})
		color = AppTheme.COLOR_DANGER
		_retry.visible = _view.selected == null
	elif _last == null:
		_status.text = tr("GALAXY_STATUS_LOADING")
	elif _last.entries.is_empty():
		_status.text = tr("GALAXY_STATUS_EMPTY")
	elif _last.truncated:
		_status.text = tr("GALAXY_STATUS_TRUNCATED").format({"count": AmountFormat.units(_last.entries.size()),
			"ly": AmountFormat.units(roundi(_last.covered * _shape.ly_per_unit))})
		color = AppTheme.COLOR_PENDING
	else:
		# Only discovered systems come (fog of war, draft.25); the hint above says telescopes
		# discover more.
		var key := "GALAXY_STATUS_STARS_ONE" if _last.entries.size() == 1 else "GALAXY_STATUS_STARS"
		_status.text = tr(key).format({"count": AmountFormat.units(_last.entries.size()),
			"ly": AmountFormat.units(roundi(_last.radius * _shape.ly_per_unit))})
	_status.add_theme_color_override("font_color", color)
