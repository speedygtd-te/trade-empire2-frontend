class_name FleetGroupCreate
extends Control
## Forming a fleet (draft.33), a layer of the Fleet tab: the ships that could join (a space drive,
## resting, not on a route, in no fleet), grouped by the body they rest at. Tapping ships picks
## them — all from one body (picking one elsewhere starts the choice anew). A name is optional
## (the server names it otherwise). "‹ Back" or Back closes it.

signal closed
## The fleet was formed; the tab opens it.
signal created(fleet_id: int)

var _model: FleetModel
var _picked: Array[int] = []
var _body := ""
var _busy := false

var _list: VBoxContainer
var _state: Label
var _name: LineEdit
var _form: Button
var _status: Label


func setup(model: FleetModel) -> void:
	_model = model


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
	var header := LayerHeader.new()
	header.set_title(tr("FLEETS_CREATE_TITLE"))
	header.back_pressed.connect(func() -> void: closed.emit())
	column.add_child(header)
	column.add_child(Ui.label("FLEETS_CREATE_HINT", AppTheme.VARIATION_MUTED))
	_state = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	column.add_child(_state)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(scroll)
	_list = Ui.column(10)
	scroll.add_child(_list)
	_name = Ui.line_edit("FLEETS_NAME_OPTIONAL")
	_name.max_length = FleetGroups.NAME_MAX
	column.add_child(_name)
	_status = Ui.dynamic_label()
	_status.visible = false
	column.add_child(_status)
	_form = Ui.primary_button("FLEETS_CREATE")
	_form.pressed.connect(_on_form)
	column.add_child(_form)
	_model.changed.connect(_rebuild)
	_rebuild()


func handle_back() -> bool:
	return false


## Picks a ship (for review scenes and taps).
func toggle(structure_id: int) -> void:
	var body := _model.fleet.body_of(structure_id)
	if _picked.has(structure_id):
		_picked.erase(structure_id)
	else:
		if body != _body:
			_picked.clear()
		_picked.append(structure_id)
	_body = body if not _picked.is_empty() else ""
	_rebuild()


func _rebuild() -> void:
	for child: Node in _list.get_children():
		child.queue_free()
	if not _model.loaded:
		_state.text = tr("FLEET_LOADING")
		_form.disabled = true
		return
	var now := Services.clock.now_ms()
	var found := _model.groups.candidates(_model.fleet, "", now)
	# Only ships still free stay picked.
	var free: Dictionary = {}
	for entry: Fleet.Entry in found:
		free[entry.structure_id] = true
	var kept: Array[int] = []
	for id: int in _picked:
		if free.has(id):
			kept.append(id)
	_picked = kept
	if _picked.is_empty():
		_body = ""
	_state.visible = found.is_empty()
	_state.text = tr("FLEETS_CREATE_NONE")
	var by_body: Dictionary = {}
	var order: Array[String] = []
	for entry: Fleet.Entry in found:
		var body := _model.fleet.body_of(entry.structure_id)
		if not by_body.has(body):
			by_body[body] = []
			order.append(body)
		var rows: Array = by_body[body]
		rows.append(entry)
	for body: String in order:
		var place := _model.body_name(body)
		var heading := Ui.dynamic_label(AppTheme.VARIATION_MUTED)
		heading.text = tr("FLEETS_CREATE_AT").format({"body": place if not place.is_empty() else tr("FLEET_UNKNOWN_PLACE")})
		_list.add_child(heading)
		var rows: Array = by_body[body]
		for value: Variant in rows:
			var entry := value as Fleet.Entry
			var row := ListButton.new()
			row.alignment = HORIZONTAL_ALIGNMENT_LEFT
			row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			var picked := _picked.has(entry.structure_id)
			row.set_chosen(picked)
			row.text = "%s\n%s" % [tr("FLEETS_PICKED").format({"name": entry.name}) if picked else entry.name,
				FleetPanel.status_text(_model, entry, now, self)]
			var id := entry.structure_id
			row.tapped.connect(func() -> void: toggle(id))
			_list.add_child(row)
	_form.disabled = _busy or _picked.is_empty()
	_form.text = tr("FLEETS_CREATE_COUNT").format({"count": _picked.size()}) if not _picked.is_empty() else tr("FLEETS_CREATE")


func _on_form() -> void:
	if _busy or _picked.is_empty():
		return
	var wanted := _name.text.strip_edges()
	if not wanted.is_empty() and not FleetGroups.is_valid_name(wanted):
		_show_status(tr("FLEETS_NAME_INVALID"))
		return
	_busy = true
	_status.visible = false
	_form.disabled = true
	_form.text = tr("FLEETS_CREATING")
	var ids := PackedInt64Array()
	for id: int in _picked:
		ids.append(id)
	var result := await _model.create_group(wanted, ids)
	_busy = false
	if not is_inside_tree():
		return
	if result.is_ok():
		created.emit(Wire.as_int(result.data.get("fleetId")))
		return
	_show_status(ErrorText.describe(result.error, self))
	_rebuild()


func _show_status(text: String) -> void:
	_status.text = text
	_status.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
	_status.visible = true
