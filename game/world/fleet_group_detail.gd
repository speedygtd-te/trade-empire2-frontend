class_name FleetGroupDetail
extends Control
## One fleet (draft.33) in the Fleet tab, a layer: where it is or its joint flight (phase,
## countdown, progress), the supply its ships share for trips, its ships (tap one for its
## details; a ship can leave while the fleet rests), ships that could join, the stance and the
## intent of all its ships, and the joint flight into an orbit (the system map picks the body,
## the quote and the two-step start follow here). Tapping the title renames it; disbanding is
## two-step. "‹ Back" or Back closes it (Back first steps out of the flight choice).

signal closed
## The player wants a member's details.
signal member_requested(structure_id: int)

## How often the countdown is refreshed (seconds).
const REFRESH_SECONDS := 1.0

var _model: FleetModel
var _fleet_id := 0
var _left := 0.0
var _busy := false
var _disband_armed := false
var _aggressive_armed := false
var _travelling := false
var _pick_map: MapScreen = null
var _scroll: ScrollContainer

var _header: LayerHeader
var _place: Label
var _phase: Label
var _bar: ProgressBar
var _times: Label
var _supply: Label
var _members: VBoxContainer
var _add: Button
var _candidates: VBoxContainer
var _stance_note: Label
var _peaceful: Button
var _aggressive: Button
var _destroy: Button
var _capture: Button
var _actions: VBoxContainer
var _fly: Button
var _fly_note: Label
var _rename_row: HBoxContainer
var _rename_field: LineEdit
var _disband: Button
var _disband_note: Label
var _status: Label
var _flight: VBoxContainer
var _flight_target: Label
var _quote: FleetQuotePanel


func setup(model: FleetModel, fleet_id: int) -> void:
	_model = model
	_fleet_id = fleet_id


func fleet_id() -> int:
	return _fleet_id


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
	_header = LayerHeader.new()
	_header.back_pressed.connect(func() -> void: closed.emit())
	_header.set_title_tappable(true)
	_header.title_pressed.connect(_toggle_rename)
	column.add_child(_header)
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(_scroll)
	var content := Ui.column(20)
	_scroll.add_child(content)

	_rename_row = HBoxContainer.new()
	_rename_row.add_theme_constant_override("separation", 12)
	_rename_row.visible = false
	content.add_child(_rename_row)
	_rename_field = Ui.line_edit("FLEETS_NAME_HINT")
	_rename_field.max_length = FleetGroups.NAME_MAX
	_rename_field.text_submitted.connect(func(_text: String) -> void: _rename())
	_rename_row.add_child(_rename_field)
	var save := Ui.secondary_button("FLEETS_RENAME_SAVE")
	save.size_flags_horizontal = Control.SIZE_SHRINK_END
	save.pressed.connect(_rename)
	_rename_row.add_child(save)

	var panel := PanelContainer.new()
	content.add_child(panel)
	var rows := Ui.column(12)
	panel.add_child(rows)
	_place = Ui.dynamic_label()
	rows.add_child(_place)
	_phase = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	rows.add_child(_phase)
	_bar = Ui.progress_bar()
	rows.add_child(_bar)
	_times = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	rows.add_child(_times)
	_supply = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	rows.add_child(_supply)

	_status = Ui.dynamic_label()
	_status.visible = false
	content.add_child(_status)

	_flight = Ui.column(12)
	_flight.visible = false
	content.add_child(_flight)
	_flight_target = Ui.dynamic_label(AppTheme.VARIATION_HEADING)
	_flight.add_child(_flight_target)
	_quote = FleetQuotePanel.new()
	_quote.setup(_model, _fleet_id)
	_quote.started.connect(_on_started)
	_flight.add_child(_quote)
	var other := Ui.secondary_button("FLEETS_OTHER_TARGET")
	other.pressed.connect(_open_map_pick)
	_flight.add_child(other)
	var back := Ui.secondary_button("TRAVEL_BACK")
	back.pressed.connect(_close_flight)
	_flight.add_child(back)

	_actions = Ui.column(16)
	content.add_child(_actions)
	_fly = Ui.primary_button("FLEETS_FLY")
	_fly.pressed.connect(_open_map_pick)
	_actions.add_child(_fly)
	_fly_note = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_actions.add_child(_fly_note)

	_actions.add_child(Ui.label("FLEETS_SHIPS", AppTheme.VARIATION_MUTED))
	_members = Ui.column(10)
	_actions.add_child(_members)
	_add = Ui.secondary_button("FLEETS_ADD_SHIP")
	_add.pressed.connect(_toggle_candidates)
	_actions.add_child(_add)
	_candidates = Ui.column(10)
	_candidates.visible = false
	_actions.add_child(_candidates)

	_actions.add_child(Ui.label("FLEETS_STANCE", AppTheme.VARIATION_MUTED))
	var stance_row := HBoxContainer.new()
	stance_row.add_theme_constant_override("separation", 12)
	_actions.add_child(stance_row)
	_peaceful = _choice("FLEETS_STANCE_PEACEFUL", stance_row)
	_peaceful.pressed.connect(func() -> void: _set_combat(FleetGroups.STANCE_PEACEFUL, ""))
	_aggressive = _choice("FLEETS_STANCE_AGGRESSIVE", stance_row)
	_aggressive.pressed.connect(_on_aggressive)
	var intent_row := HBoxContainer.new()
	intent_row.add_theme_constant_override("separation", 12)
	_actions.add_child(intent_row)
	_destroy = _choice("FLEETS_INTENT_DESTROY", intent_row)
	_destroy.pressed.connect(func() -> void: _set_combat("", FleetGroups.INTENT_DESTROY))
	_capture = _choice("FLEETS_INTENT_CAPTURE", intent_row)
	_capture.pressed.connect(func() -> void: _set_combat("", FleetGroups.INTENT_CAPTURE))
	_stance_note = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_actions.add_child(_stance_note)

	_actions.add_child(Ui.spacer(8))
	_disband = Ui.secondary_button("FLEETS_DISBAND")
	_disband.theme_type_variation = AppTheme.VARIATION_DANGER_BUTTON
	_disband.pressed.connect(_on_disband)
	_actions.add_child(_disband)
	_disband_note = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_actions.add_child(_disband_note)
	_actions.add_child(Ui.spacer(32))

	_model.changed.connect(_update)
	_update()


func _process(delta: float) -> void:
	_left -= delta
	if _left <= 0.0:
		_left = REFRESH_SECONDS
		_tick()


## Back steps out of the flight choice first; false when there is nothing (the stack closes it).
func handle_back() -> bool:
	if _rename_row.visible:
		_rename_row.visible = false
		return true
	if _travelling:
		_close_flight()
		return true
	return false


## Scrolls to the stance and Disband (for review scenes).
func _scroll_to_end() -> void:
	_scroll.scroll_vertical = 100000


## The quote panel of the flight choice (for review scenes).
func quote_panel() -> FleetQuotePanel:
	return _quote


func pick_map() -> MapScreen:
	return _pick_map if ScreenStack.is_open(_pick_map) else null


## A toggle-looking button of a pair (the chosen one is underlined in cyan).
func _choice(key: String, row: HBoxContainer) -> Button:
	var button := Ui.secondary_button(key)
	button.toggle_mode = true
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(button)
	return button


func _group() -> FleetGroups.Group:
	return _model.groups.find(_fleet_id)


func _update() -> void:
	var group := _group()
	if group == null:
		# Disbanded (here or elsewhere): nothing left to show.
		_header.set_title(tr("FLEETS_GONE"))
		_header.set_subtitle("")
		_actions.visible = false
		_flight.visible = false
		_place.text = tr("FLEETS_GONE_TEXT")
		for node: Control in [_phase, _bar, _times, _supply]:
			node.visible = false
		return
	_header.set_title(group.name)
	_header.set_subtitle(tr("FLEETS_SUBTITLE").format({"count": group.members.size()}))
	_actions.visible = not _travelling
	_fill_members(group)
	if _candidates.visible:
		_fill_candidates(group)
	_add.visible = not group.has_command() and group.is_together()
	_peaceful.set_pressed_no_signal(not group.is_aggressive())
	_aggressive.set_pressed_no_signal(group.is_aggressive())
	_destroy.set_pressed_no_signal(group.intent == FleetGroups.INTENT_DESTROY)
	_capture.set_pressed_no_signal(group.intent == FleetGroups.INTENT_CAPTURE)
	for button: Button in [_peaceful, _aggressive, _destroy, _capture]:
		button.disabled = _busy
	if _aggressive_armed:
		_stance_note.text = tr("FLEETS_AGGRESSIVE_CONFIRM")
		_stance_note.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	else:
		_stance_note.text = tr("FLEETS_STANCE_NOTE_AGGRESSIVE") if group.is_aggressive() else tr("FLEETS_STANCE_NOTE")
		_stance_note.remove_theme_color_override("font_color")
	var fly_reason := _fly_reason(group)
	_fly.disabled = _busy or not fly_reason.is_empty()
	_fly_note.text = fly_reason if not fly_reason.is_empty() else tr("FLEETS_FLY_NOTE")
	var disband_reason := ""
	if group.has_command():
		disband_reason = tr("FLEETS_DISBAND_FLYING")
	elif not group.is_together():
		disband_reason = tr("FLEETS_NOT_TOGETHER")
	_disband.disabled = _busy or not disband_reason.is_empty()
	_disband.text = tr("FLEETS_DISBAND_CONFIRM") if _disband_armed else tr("FLEETS_DISBAND")
	_disband_note.text = disband_reason if not disband_reason.is_empty() \
		else (tr("FLEETS_DISBAND_WARNING") if _disband_armed else tr("FLEETS_DISBAND_HINT"))
	_tick()


## Why the fleet cannot fly now; "" when it can.
func _fly_reason(group: FleetGroups.Group) -> String:
	if group.has_command():
		return tr("FLEETS_FLYING_NOW")
	if not group.is_together():
		return tr("FLEETS_NOT_TOGETHER")
	return ""


## The place or the flight with its countdown, and the shared supply.
func _tick() -> void:
	var group := _group()
	if group == null or _place == null:
		return
	var now := Services.clock.now_ms()
	var flying := group.is_travelling(now)
	_phase.visible = flying
	_bar.visible = flying
	_times.visible = flying
	_place.text = status_text(_model, group, now, self)
	if flying:
		var lead := _lead_motion(group)
		_phase.text = TravelInfoPanel.phase_text(lead, now, self) if lead != null else tr("TRAVEL_PHASE_NOW_CRUISE")
		_bar.value = group.progress_at(now)
		_times.text = tr("TRAVEL_INFO_ARRIVAL").format({"duration": TimeFormat.duration(group.remaining_ms(now)),
			"percent": roundi(group.progress_at(now) * 100.0)})
	_supply.visible = true
	_supply.text = supply_text(group, self)
	for row: Node in _members.get_children():
		var line := row.get_node_or_null("Row") as ListButton
		if line == null:
			continue
		var id: int = line.get_meta("structure", 0)
		var entry := _model.fleet.find(id)
		var member := group.member(id)
		var shown := member.name if member != null else (entry.name if entry != null else "")
		line.text = "%s\n%s" % [shown, FleetPanel.status_text(_model, entry, now, self, false) if entry != null else tr("FLEET_LOADING")]


## A member's trip (all share the times): the first one known.
func _lead_motion(group: FleetGroups.Group) -> TravelMotion:
	for id: int in group.member_ids():
		var entry := _model.fleet.find(id)
		if entry != null and entry.motion != null:
			return entry.motion
	return null


func _fill_members(group: FleetGroups.Group) -> void:
	for child: Node in _members.get_children():
		child.queue_free()
	var can_leave := not group.has_command() and group.members.size() > 1 and not _busy
	for member: FleetGroups.Member in group.members:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		_members.add_child(row)
		var line := ListButton.new()
		line.name = "Row"
		line.alignment = HORIZONTAL_ALIGNMENT_LEFT
		line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		line.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		line.set_meta("structure", member.structure_id)
		var id := member.structure_id
		line.tapped.connect(func() -> void: member_requested.emit(id))
		row.add_child(line)
		if can_leave:
			var leave := Ui.secondary_button("FLEETS_LEAVE")
			leave.size_flags_horizontal = Control.SIZE_SHRINK_END
			leave.custom_minimum_size = Vector2(168, AppTheme.TOUCH_MIN)
			leave.pressed.connect(func() -> void: _leave(id))
			row.add_child(leave)


func _toggle_candidates() -> void:
	_candidates.visible = not _candidates.visible
	_add.text = tr("FLEETS_ADD_CLOSE") if _candidates.visible else tr("FLEETS_ADD_SHIP")
	var group := _group()
	if _candidates.visible and group != null:
		_fill_candidates(group)


func _fill_candidates(group: FleetGroups.Group) -> void:
	for child: Node in _candidates.get_children():
		child.queue_free()
	var now := Services.clock.now_ms()
	var found := _model.groups.candidates(_model.fleet, group.location_body_id, now)
	if found.is_empty():
		var empty := Ui.dynamic_label(AppTheme.VARIATION_MUTED)
		empty.text = tr("FLEETS_ADD_NONE")
		_candidates.add_child(empty)
		return
	for entry: Fleet.Entry in found:
		var row := ListButton.new()
		row.alignment = HORIZONTAL_ALIGNMENT_LEFT
		row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		row.text = "%s\n%s" % [entry.name, FleetPanel.status_text(_model, entry, now, self)]
		var id := entry.structure_id
		row.tapped.connect(func() -> void: _join(id))
		_candidates.add_child(row)


# --- commands -------------------------------------------------------------------------------

func _join(structure_id: int) -> void:
	await _command(func() -> ApiResult: return await _model.join_group(_fleet_id, structure_id), "FLEETS_JOINED")
	_candidates.visible = false
	_add.text = tr("FLEETS_ADD_SHIP")


func _leave(structure_id: int) -> void:
	await _command(func() -> ApiResult: return await _model.leave_group(_fleet_id, structure_id), "FLEETS_LEFT")


func _on_aggressive() -> void:
	var group := _group()
	if group == null or group.is_aggressive():
		_update()
		return
	if not _aggressive_armed:
		_aggressive_armed = true
		_update()
		return
	_aggressive_armed = false
	_set_combat(FleetGroups.STANCE_AGGRESSIVE, "")


func _set_combat(stance: String, intent: String) -> void:
	if stance != FleetGroups.STANCE_AGGRESSIVE:
		_aggressive_armed = false
	var group := _group()
	if group == null or (stance == group.stance and intent.is_empty()) or (intent == group.intent and stance.is_empty()):
		_update()
		return
	await _command(func() -> ApiResult: return await _model.set_group_combat(_fleet_id, stance, intent), "FLEETS_STANCE_SET")


func _toggle_rename() -> void:
	var group := _group()
	if group == null:
		return
	_rename_row.visible = not _rename_row.visible
	if _rename_row.visible:
		_rename_field.text = group.name
		_rename_field.grab_focus()


func _rename() -> void:
	var wanted := _rename_field.text.strip_edges()
	if not FleetGroups.is_valid_name(wanted):
		_show_status(tr("FLEETS_NAME_INVALID"), AppTheme.COLOR_DANGER)
		return
	_rename_row.visible = false
	await _command(func() -> ApiResult: return await _model.rename_group(_fleet_id, wanted), "FLEETS_RENAMED")


func _on_disband() -> void:
	if not _disband_armed:
		_disband_armed = true
		_update()
		return
	_disband_armed = false
	var done := await _command(func() -> ApiResult: return await _model.dissolve_group(_fleet_id), "")
	if done:
		closed.emit()


## Runs one fleet command; says what happened (`done_key`, "" for nothing) or why it failed.
func _command(action: Callable, done_key: String) -> bool:
	if _busy:
		return false
	_busy = true
	_status.visible = false
	_update()
	var result: ApiResult = await action.call()
	_busy = false
	if not is_inside_tree():
		return result.is_ok()
	if result.is_ok():
		if not done_key.is_empty():
			_show_status(tr(done_key), AppTheme.COLOR_OK)
	else:
		_show_status(ErrorText.describe(result.error, self), AppTheme.COLOR_DANGER)
	_update()
	return result.is_ok()


func _show_status(text: String, color: Color) -> void:
	_status.text = text
	_status.add_theme_color_override("font_color", color)
	_status.visible = true


# --- the joint flight -----------------------------------------------------------------------

func _open_map_pick() -> void:
	var group := _group()
	if group == null or not _fly_reason(group).is_empty() or ScreenStack.is_open(_pick_map):
		return
	var system := GalaxySystems.system_of_body(group.location_body_id)
	if system.is_empty():
		var body := await Services.api.get_json("/v2/bodies/" + group.location_body_id.uri_encode())
		system = Wire.as_string(body.data.get("systemId")) if body.is_ok() else ""
	_pick_map = MapScreen.new()
	var account := Services.session.account
	_pick_map.setup(system, account.home_body_id if account != null else "")
	_pick_map.pick = MapScreen.PICK_ORBIT
	_pick_map.fleet = _model
	_pick_map.body_picked.connect(_on_body_picked)
	ScreenStack.push_onto(self, _pick_map)


func _on_body_picked(body_id: String) -> void:
	ScreenStack.close_layer(_pick_map)
	_pick_map = null
	show_flight(body_id)


## The quote of a flight into the orbit of `body_id` (also for review scenes).
func show_flight(body_id: String) -> void:
	var body_name := _model.body_name(body_id)
	if body_name.is_empty():
		var body := await Services.api.get_json("/v2/bodies/" + body_id.uri_encode())
		body_name = Wire.as_string(body.data.get("name")) if body.is_ok() else tr("FLEET_UNKNOWN_PLACE")
	_travelling = true
	_status.visible = false
	_flight.visible = true
	_actions.visible = false
	_flight_target.text = tr("TRAVEL_TARGET_ORBIT").format({"body": body_name})
	_quote.ask(body_id)


func _close_flight() -> void:
	_travelling = false
	_flight.visible = false
	_update()


func _on_started() -> void:
	_close_flight()
	var group := _group()
	if group != null:
		_show_status(tr("FLEETS_STARTED").format({"name": group.name,
			"duration": TimeFormat.duration(group.remaining_ms(Services.clock.now_ms()))}), AppTheme.COLOR_OK)


# --- texts ----------------------------------------------------------------------------------

## Where a fleet is, or where it flies and when it arrives.
static func status_text(model: FleetModel, group: FleetGroups.Group, now: int, translator: Object) -> String:
	if group.is_travelling(now):
		var body := model.body_name(group.target_body_id())
		return translator.tr("FLEETS_FLYING").format({
			"target": translator.tr("FLEET_TARGET_ORBIT").format({"body": body if not body.is_empty() else translator.tr("FLEET_UNKNOWN_PLACE")}),
			"duration": TimeFormat.duration(group.remaining_ms(now))})
	if group.has_command():
		return translator.tr("FLEETS_ARRIVING")
	if not group.is_together():
		return translator.tr("FLEETS_APART")
	var place := model.body_name(group.location_body_id)
	return translator.tr("FLEETS_AT").format({"body": place if not place.is_empty() else translator.tr("FLEET_UNKNOWN_PLACE")})


## The supply the ships share for trips (their own supplies summed), as one line.
static func supply_text(group: FleetGroups.Group, translator: Object) -> String:
	var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
	var parts := PackedStringArray()
	for item: FleetGroups.Item in group.inventory:
		if item.self_use <= 0:
			continue
		var shown := Services.definitions.resource_name(item.resource) if Services.definitions != null else ""
		parts.append("%s %s" % [shown if not shown.is_empty() else translator.tr("STORE_UNKNOWN_ITEM"),
			AmountFormat.amount(item.self_use, scale)])
	if parts.is_empty():
		return translator.tr("FLEETS_SUPPLY_EMPTY")
	return translator.tr("FLEETS_SUPPLY").format({"rows": " · ".join(parts)})
