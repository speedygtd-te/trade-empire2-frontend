class_name ProbeList
extends VBoxContainer
## The Probes tab of the Fleet (draft.31): the player's probes, newest first — where each flies
## and when it arrives (amber, counting down), or that it arrived and explored the fields around
## its target (emerald). A tap shows that body's explored areas (`view_requested`). Loading,
## empty and error states.

## The player wants to see what is explored of a body.
signal view_requested(body_id: String)

var _fleet: FleetModel
var _state: Label
var _retry: Button
var _list: VBoxContainer


func setup(fleet: FleetModel) -> void:
	_fleet = fleet


func _ready() -> void:
	add_theme_constant_override("separation", 16)
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	_state = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	add_child(_state)
	_retry = Ui.secondary_button("COMMON_RETRY")
	_retry.visible = false
	_retry.pressed.connect(func() -> void:
		_retry.visible = false
		_fleet.probes.reload())
	add_child(_retry)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(scroll)
	_list = Ui.column(10)
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_list)
	_fleet.probes.changed.connect(_rebuild)
	_fleet.changed.connect(_update_lines)
	visibility_changed.connect(func() -> void:
		if is_visible_in_tree() and not _fleet.probes.loaded:
			_fleet.probes.reload())
	_rebuild()


## The countdowns (the fleet panel calls this every second).
func tick() -> void:
	if is_visible_in_tree():
		_update_lines()


func _rebuild() -> void:
	for child: Node in _list.get_children():
		child.queue_free()
	var model := _fleet.probes
	_retry.visible = not model.loaded and model.error != null
	if not model.loaded:
		_state.visible = true
		_state.text = tr("PROBE_LIST_LOADING") if model.error == null \
			else tr("PROBE_LIST_FAILED") + "\n" + ErrorText.describe(model.error, self)
		return
	_state.visible = model.list.probes.is_empty()
	_state.text = tr("PROBE_LIST_EMPTY")
	for probe: Probes.Probe in model.list.probes:
		var row := ListButton.new()
		row.alignment = HORIZONTAL_ALIGNMENT_LEFT
		row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		row.set_meta("probe", probe.probe_id)
		var body_id := probe.body_id
		row.tapped.connect(func() -> void: view_requested.emit(body_id))
		_list.add_child(row)
	_update_lines()


func _update_lines() -> void:
	var now := Services.clock.now_ms()
	for row: Node in _list.get_children():
		var button := row as ListButton
		if button == null or button.is_queued_for_deletion():
			continue
		var probe_id: int = button.get_meta("probe", 0)
		var probe := _fleet.probes.list.find(probe_id)
		if probe == null:
			continue
		var body := _fleet.body_name(probe.body_id)
		var head := tr("PROBE_ROW").format({"body": body if not body.is_empty() else tr("PROBE_UNKNOWN_BODY"),
			"x": AmountFormat.units(probe.x), "y": AmountFormat.units(probe.y)})
		var line := ""
		if probe.is_flying(now):
			line = tr("PROBE_ROW_FLYING").format({"duration": TimeFormat.duration(probe.remaining_ms(now)),
				"percent": roundi(probe.progress(now) * 100.0)})
			button.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
		else:
			line = tr("PROBE_ROW_ARRIVED").format({"radius": AmountFormat.units(probe.radius)})
			button.add_theme_color_override("font_color", AppTheme.COLOR_OK)
		button.text = "%s\n%s" % [head, line]
		if body.is_empty():
			_name_body(probe.body_id)


## Looks up a body's name once (probes fly to bodies the fleet does not stand on).
func _name_body(body_id: String) -> void:
	if _fleet.body_names.has(body_id):
		return
	_fleet.body_names[body_id] = ""
	var body := await Services.api.get_json("/v2/bodies/" + body_id.uri_encode())
	if body.is_ok():
		_fleet.body_names[body_id] = Wire.as_string(body.data.get("name"))
		_update_lines()
	else:
		_fleet.body_names.erase(body_id)
