class_name TravelSiteScreen
extends Control
## Choosing where a structure lands or stops, over the whole screen: the target body's surface
## in 3D with the player's structures standing there, and the travelling structure as a ghost on
## the chosen site (all its hulls and those of its guests).
##
## Landing (`MODE_LAND`): a free site next to an own structure is suggested (one field apart, so
## it touches none), otherwise the middle of the grid; a tap moves the ghost there. Driving
## (`MODE_DRIVE`, same body): every tap adds a point of the drive, the last one is where it stops,
## the ones before are waypoints (up to 16); the line shows the way.
##
## The ghost's colour comes from the client's check (own structures known) until the quote
## arrives, then from the quote. Close or Back leaves without starting.

## The trip started; `details` is the structure as the server sent it back.
signal started(details: Dictionary)
signal closed

const MODE_LAND := "land"
const MODE_DRIVE := "drive"
const TAP_SLOP := 18.0

var _mover: ColonyModel
var _mode := MODE_LAND
var _body_id := ""
var _fleet: FleetModel
## Local cells of the travelling structure (with its guests).
var _cells: Array[Vector3i] = []
## Cells of the own structures here (for the client's check), without the travelling one.
var _taken: Dictionary = {}
## Landing: the local origin's cell; null while none is chosen.
var _site: Variant = null
## Driving: the tapped cells (the middle of the structure goes there); the last is the stop.
var _points: Array[Vector2i] = []
var _client_ok := false
## Landing: the site is still the suggested one (the player has not tapped); it follows the own
## structures' layouts as they arrive.
var _suggested := true

var _model: ColonyModel
var _view: ColonyView
var _container: SubViewportContainer
var _viewport: SubViewport
var _title: Label
var _subtitle: Label
var _hint: Label
var _quote: TravelQuotePanel
var _undo: Button
var _clear: Button
var _suggest: Button
var _loading: CenterContainer
var _bottom: PanelContainer

var _touches: Dictionary = {}
var _press_travel := 0.0
var _mouse_down := false


## `mover`: the travelling structure's model (layout and guests loaded); `mode` MODE_LAND or
## MODE_DRIVE; `body_id` the body to land or drive on.
func setup(mover: ColonyModel, mode: String, body_id: String, fleet: FleetModel) -> void:
	_mover = mover
	_mode = mode
	_body_id = body_id
	_fleet = fleet


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var background := ColorRect.new()
	background.color = AppTheme.COLOR_BACKGROUND
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)
	_cells = TravelPlan.mover_cells(_mover.layout, _mover.guest_layouts())
	_model = ColonyModel.new()
	_model.name = "SiteModel"
	add_child(_model)
	_container = SubViewportContainer.new()
	_container.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_container.stretch = true
	_container.mouse_filter = Control.MOUSE_FILTER_STOP
	_container.gui_input.connect(_on_world_input)
	add_child(_container)
	_viewport = SubViewport.new()
	_viewport.handle_input_locally = false
	# A world of its own: otherwise it would share the colony screen's 3D world underneath.
	_viewport.own_world_3d = true
	_container.add_child(_viewport)
	_view = ColonyView.new()
	_view.setup(_model)
	_viewport.add_child(_view)
	_build_overlay()
	_model.ready_to_show.connect(_on_ready_to_show)
	_model.load_failed.connect(_on_load_failed)
	_model.layout_changed.connect(_on_layouts_changed)
	_model.guests_changed.connect(_on_layouts_changed)
	_model.load_body_view(_body_id)


func handle_back() -> void:
	closed.emit()


func _build_overlay() -> void:
	var margin := SafeAreaMargin.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(margin)
	var column := Ui.column(0)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(column)
	var top := PanelContainer.new()
	column.add_child(top)
	var top_row := HBoxContainer.new()
	top_row.add_theme_constant_override("separation", 16)
	top.add_child(top_row)
	var names := Ui.column(4)
	top_row.add_child(names)
	_title = Ui.label("TRAVEL_SITE_LAND_TITLE" if _mode == MODE_LAND else "TRAVEL_SITE_DRIVE_TITLE",
		AppTheme.VARIATION_HEADING)
	_title.autowrap_mode = TextServer.AUTOWRAP_OFF
	_title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
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
	column.add_child(_bottom)
	var rows := Ui.column(12)
	_bottom.add_child(rows)
	_hint = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	rows.add_child(_hint)
	var tools := HBoxContainer.new()
	tools.add_theme_constant_override("separation", 16)
	rows.add_child(tools)
	_suggest = Ui.secondary_button("TRAVEL_SITE_SUGGEST")
	_suggest.visible = _mode == MODE_LAND
	_suggest.pressed.connect(_on_suggest)
	tools.add_child(_suggest)
	_undo = Ui.secondary_button("TRAVEL_SITE_UNDO")
	_undo.visible = _mode == MODE_DRIVE
	_undo.pressed.connect(_on_undo)
	tools.add_child(_undo)
	_clear = Ui.secondary_button("TRAVEL_SITE_CLEAR")
	_clear.visible = _mode == MODE_DRIVE
	_clear.pressed.connect(_on_clear)
	tools.add_child(_clear)
	_quote = TravelQuotePanel.new()
	_quote.setup(_mover.structure_id)
	_quote.started.connect(func(details: Dictionary) -> void: started.emit(details))
	_quote.quoted.connect(_on_quoted)
	rows.add_child(_quote)

	_loading = CenterContainer.new()
	_loading.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_loading.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var text := Ui.label("COLONY_LOADING", AppTheme.VARIATION_MUTED)
	text.autowrap_mode = TextServer.AUTOWRAP_OFF
	_loading.add_child(text)
	add_child(_loading)


# --- data -----------------------------------------------------------------------------------

func _on_ready_to_show() -> void:
	_loading.visible = false
	_subtitle.text = _model.body_name
	if _fleet != null:
		_model.sync_with_fleet(_fleet.fleet, Services.clock.now_ms())
		_view.set_fleet(_fleet.fleet)
	_update_taken()
	var start := _start_cell()
	if _mode == MODE_LAND:
		_on_suggest()
	else:
		_view.look_at_cell(Vector3i(start.x, start.y, 0))
		_show_drive()
	await get_tree().process_frame
	_view.pan(Vector2(0.0, -_bottom.size.y * 0.5 * _scale()), Vector2(_viewport.size))


func _on_load_failed(error: ApiError) -> void:
	for child: Node in _loading.get_children():
		child.queue_free()
	var column := Ui.column(24)
	column.custom_minimum_size = Vector2(560, 0)
	column.add_child(Ui.label("COLONY_LOAD_FAILED", AppTheme.VARIATION_HEADING))
	var detail := Ui.dynamic_label(AppTheme.VARIATION_ERROR)
	detail.text = ErrorText.describe(error, self)
	column.add_child(detail)
	var back := Ui.primary_button("COMMON_CLOSE")
	back.pressed.connect(func() -> void: closed.emit())
	column.add_child(back)
	_loading.mouse_filter = Control.MOUSE_FILTER_STOP
	_loading.add_child(column)
	_loading.visible = true


## The own structures here changed (a layout arrived): check the site again.
func _on_layouts_changed() -> void:
	_update_taken()
	if _mode == MODE_LAND and _suggested and _site != null:
		_on_suggest()
	elif _mode == MODE_LAND and _site != null:
		_show_site()
	elif _mode == MODE_DRIVE:
		_show_drive()


## Cells of the own structures standing here, without the travelling one and its guests.
func _update_taken() -> void:
	var layouts: Array[StructureLayout] = []
	for structure: ColonyModel in _model.drawn_structures():
		if structure.structure_id == 0 or structure.structure_id == _mover.structure_id:
			continue
		if structure.host != null and structure.host.structure_id == _mover.structure_id:
			continue
		layouts.append(structure.layout)
	_taken = TravelPlan.taken_cells(layouts, _model.size_x)


## Where the travelling structure's middle stands now (absolute), when it is on this body;
## otherwise the middle of the first own structure here.
func _start_cell() -> Vector2i:
	if _mover.body_id == _body_id or (_mover.host != null and _mover.host.body_id == _body_id):
		var origin := _mover.layout.to_absolute(Vector3i.ZERO)
		var centre := TravelPlan.centre_of(_cells)
		return Vector2i(origin.x + centre.x, origin.y + centre.y)
	return _around()


## The cell a landing site is sought around: the middle of the largest own structure on this body;
## without one the middle of the grid.
func _around() -> Vector2i:
	var best: ColonyModel = null
	for structure: ColonyModel in _model.neighbours.values():
		if structure.structure_id == _mover.structure_id:
			continue
		if best == null or structure.layout.hull_count() > best.layout.hull_count():
			best = structure
	if best != null and best.layout.hull_count() > 0:
		var cell := best.centre_cell()
		return Vector2i(cell.x, cell.y)
	# The equator (y runs from −sizeY/2 to sizeY/2, SunPosition.cell_angles).
	return Vector2i.ZERO


# --- landing --------------------------------------------------------------------------------

## Puts the ghost on the suggested site: next to an own structure, one field apart.
func _on_suggest() -> void:
	var around := _around()
	var found: Variant = TravelPlan.suggest_site(_cells, _taken, around, _model.size_x, _model.size_y)
	_site = found if found != null else TravelPlan.origin_for_centre(_cells, around)
	var at: Vector2i = _site
	var centre := TravelPlan.centre_of(_cells)
	_view.look_at_cell(Vector3i(at.x + centre.x, at.y + centre.y, 0))
	_show_site()


func _show_site() -> void:
	if _site == null:
		_hint.text = tr("TRAVEL_SITE_LAND_HINT")
		_quote.show_hint(tr("TRAVEL_SITE_LAND_HINT"))
		return
	var at: Vector2i = _site
	var cells := TravelPlan.site_cells(_cells, at)
	var verdict := TravelPlan.check_site(cells, _taken, _model.size_x, _model.size_y)
	_client_ok = verdict == TravelPlan.Site.OK
	_hint.text = tr("TRAVEL_SITE_LAND_HINT") if _client_ok else _site_text(verdict)
	_hint.add_theme_color_override("font_color", AppTheme.COLOR_MUTED if _client_ok else AppTheme.COLOR_DANGER)
	_view.travel_layer().show_ghost(cells, TravelLayer.COLOR_GHOST_UNSURE if _client_ok else TravelLayer.COLOR_GHOST_BAD)
	_quote.ask(TravelPlan.request(TravelPlan.MODE_FLIGHT, TravelPlan.surface_target(_body_id, at)))


func _site_text(verdict: TravelPlan.Site) -> String:
	match verdict:
		TravelPlan.Site.OCCUPIED:
			return tr("TRAVEL_SITE_OCCUPIED")
		TravelPlan.Site.TOUCHES_OWN:
			return tr("TRAVEL_SITE_TOUCHES")
		TravelPlan.Site.OUT_OF_BOUNDS:
			return tr("TRAVEL_SITE_OUT_OF_BOUNDS")
	return ""


# --- driving --------------------------------------------------------------------------------

func _show_drive() -> void:
	var start := _start_cell()
	_undo.disabled = _points.is_empty()
	_clear.disabled = _points.is_empty()
	if _points.is_empty():
		_hint.text = tr("TRAVEL_SITE_DRIVE_HINT")
		_hint.add_theme_color_override("font_color", AppTheme.COLOR_MUTED)
		_view.travel_layer().show_route([], 0)
		_view.travel_layer().show_ghost([], TravelLayer.COLOR_GHOST_OK)
		_quote.show_hint(tr("TRAVEL_SITE_DRIVE_HINT"))
		return
	var stops: Array[Vector2i] = []
	for index: int in _points.size() - 1:
		stops.append(_points[index])
	var target := _points[_points.size() - 1]
	_view.travel_layer().show_route(TravelPlan.drive_points(start, stops, target, _model.size_x), 0)
	var at := TravelPlan.origin_for_centre(_cells, target)
	var cells := TravelPlan.site_cells(_cells, at)
	var verdict := TravelPlan.check_site(cells, _taken, _model.size_x, _model.size_y)
	_client_ok = verdict == TravelPlan.Site.OK
	_view.travel_layer().show_ghost(cells, TravelLayer.COLOR_GHOST_UNSURE if _client_ok else TravelLayer.COLOR_GHOST_BAD)
	var waypoints: Array[Vector2i] = []
	for stop: Vector2i in stops:
		waypoints.append(TravelPlan.origin_for_centre(_cells, stop))
	if _client_ok:
		_hint.text = tr("TRAVEL_SITE_DRIVE_POINTS").format({"count": stops.size(), "max": TravelPlan.MAX_WAYPOINTS})
		_hint.add_theme_color_override("font_color", AppTheme.COLOR_MUTED)
	else:
		_hint.text = _site_text(verdict)
		_hint.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
	_quote.ask(TravelPlan.request(TravelPlan.MODE_GROUND, TravelPlan.surface_target(_body_id, at), waypoints))


func _on_undo() -> void:
	if not _points.is_empty():
		_points.remove_at(_points.size() - 1)
	_show_drive()


func _on_clear() -> void:
	_points.clear()
	_show_drive()


## The quote decides the ghost's colour once it is there.
func _on_quoted(quote: TravelPlan.Quote) -> void:
	var cells: Array[Vector3i] = []
	if _mode == MODE_LAND and _site != null:
		cells = TravelPlan.site_cells(_cells, _site as Vector2i)
	elif _mode == MODE_DRIVE and not _points.is_empty():
		cells = TravelPlan.site_cells(_cells, TravelPlan.origin_for_centre(_cells, _points[_points.size() - 1]))
	if cells.is_empty():
		return
	var color := TravelLayer.COLOR_GHOST_BAD
	if quote != null and quote.ok:
		color = TravelLayer.COLOR_GHOST_OK
	elif quote == null and _client_ok:
		color = TravelLayer.COLOR_GHOST_UNSURE
	_view.travel_layer().show_ghost(cells, color)


# --- input ----------------------------------------------------------------------------------

func _on_tap(position_in_container: Vector2) -> void:
	if _model.size_x == 0:
		return
	var hit: Variant = _view.cell_at(position_in_container * _scale())
	if hit == null:
		return
	var cell: Vector3i = hit
	if _mode == MODE_LAND:
		_suggested = false
		_site = TravelPlan.origin_for_centre(_cells, Vector2i(cell.x, cell.y))
		_show_site()
		return
	if _points.size() > TravelPlan.MAX_WAYPOINTS:
		# Full: the new point replaces the stop.
		_points[_points.size() - 1] = Vector2i(cell.x, cell.y)
	else:
		_points.append(Vector2i(cell.x, cell.y))
	_show_drive()


func _on_world_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if touch.pressed:
			_touches[touch.index] = touch.position
			if _touches.size() == 1:
				_press_travel = 0.0
		else:
			var was_single := _touches.size() == 1
			_touches.erase(touch.index)
			if was_single and _press_travel < TAP_SLOP:
				_on_tap(touch.position)
	elif event is InputEventScreenDrag:
		var drag := event as InputEventScreenDrag
		if _touches.size() >= 2 and _touches.has(drag.index):
			var other := Vector2.ZERO
			for index: int in _touches.keys():
				if index != drag.index:
					other = _touches[index]
					break
			var before: Vector2 = _touches[drag.index]
			var old_distance := before.distance_to(other)
			var new_distance := drag.position.distance_to(other)
			if old_distance > 1.0 and new_distance > 1.0:
				_view.zoom_by(old_distance / new_distance)
			_touches[drag.index] = drag.position
			_press_travel = TAP_SLOP
		else:
			_touches[drag.index] = drag.position
			_press_travel += drag.relative.length()
			_view.pan(drag.relative * _scale(), Vector2(_viewport.size))
	elif event is InputEventMouseButton:
		var button := event as InputEventMouseButton
		if button.device == InputEvent.DEVICE_ID_EMULATION:
			return
		match button.button_index:
			MOUSE_BUTTON_WHEEL_UP:
				_view.zoom_by(0.9)
			MOUSE_BUTTON_WHEEL_DOWN:
				_view.zoom_by(1.1)
			MOUSE_BUTTON_LEFT:
				if button.pressed:
					_mouse_down = true
					_press_travel = 0.0
				else:
					_mouse_down = false
					if _press_travel < TAP_SLOP:
						_on_tap(button.position)
	elif event is InputEventMouseMotion:
		var motion := event as InputEventMouseMotion
		if motion.device == InputEvent.DEVICE_ID_EMULATION or not _mouse_down:
			return
		_press_travel += motion.relative.length()
		_view.pan(motion.relative * _scale(), Vector2(_viewport.size))
	elif event is InputEventMagnifyGesture:
		_view.zoom_by(1.0 / (event as InputEventMagnifyGesture).factor)


func _scale() -> float:
	return float(_viewport.size.y) / maxf(_container.size.y, 1.0)
