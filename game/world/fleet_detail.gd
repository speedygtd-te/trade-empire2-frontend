class_name FleetDetail
extends Control
## One own structure in the Fleet tab: where it is and its trip (phase, progress, arrival), its
## route, and what can be done with it: travel, show it in Base, its routes.
##
## Travel loads the structure with its guests (the trip moves them along) and opens the choice
## of the trip (TravelPanel): Orbit and Land pick a body on the system map, Land and Drive go on
## on the target's surface (TravelSiteScreen) — both are layers over this one; Dock and the quote
## stay here. "‹ Back" or Back closes it (Back first steps back inside the trip choice).

signal closed
## The player wants to see the structure in Base.
signal show_requested(structure_id: int)
## The player wants the routes: the list (0) or one route's editor.
signal route_requested(route_id: int)
## The player wants the fleet this structure is a member of (draft.33).
signal group_requested(fleet_id: int)

## How long the loaded structure may take to bring its layout (seconds).
const LOAD_SECONDS := 15.0

var _fleet: FleetModel
var _id := 0
var _travel_on_open := false

## The loaded structure (with its host and guests) for a trip; null until Travel was tapped.
var _loader: ColonyModel = null
var _mover: ColonyModel = null
var _pick_map: MapScreen = null
var _site: TravelSiteScreen = null
var _picking_land := false

var _header: LayerHeader
var _info: TravelInfoPanel
var _route_line: Label
var _actions: VBoxContainer
var _travel_button: Button
var _travel_note: Label
var _route_button: Button
var _group_button: Button
var _status: Label
var _travel_panel: TravelPanel


## `travel`: open the trip choice right away.
func setup(fleet: FleetModel, structure_id: int, travel: bool = false) -> void:
	_fleet = fleet
	_id = structure_id
	_travel_on_open = travel


func structure_id() -> int:
	return _id


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
	column.add_child(_header)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(scroll)
	var content := Ui.column(20)
	scroll.add_child(content)
	var panel := PanelContainer.new()
	content.add_child(panel)
	var rows := Ui.column(12)
	panel.add_child(rows)
	_info = TravelInfoPanel.new()
	_info.offer_travel = false
	rows.add_child(_info)
	_route_line = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	rows.add_child(_route_line)

	_status = Ui.dynamic_label()
	_status.visible = false
	content.add_child(_status)
	_actions = Ui.column(16)
	content.add_child(_actions)
	_travel_button = Ui.primary_button("TRAVEL_OPEN")
	_travel_button.pressed.connect(open_travel)
	_actions.add_child(_travel_button)
	_travel_note = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_actions.add_child(_travel_note)
	_group_button = Ui.secondary_button("FLEETS_OPEN_FLEET")
	_group_button.visible = false
	_group_button.pressed.connect(_on_group)
	_actions.add_child(_group_button)
	var show := Ui.secondary_button("FLEET_SHOW_IN_BASE")
	show.pressed.connect(func() -> void: show_requested.emit(_id))
	_actions.add_child(show)
	_route_button = Ui.secondary_button("FLEET_ROUTES")
	_route_button.pressed.connect(_on_route)
	_actions.add_child(_route_button)

	_travel_panel = TravelPanel.new()
	_travel_panel.visible = false
	_travel_panel.closed.connect(_close_travel)
	_travel_panel.pick_body_requested.connect(_open_map_pick)
	_travel_panel.drive_requested.connect(_on_drive_requested)
	_travel_panel.started.connect(_on_travel_started)
	content.add_child(_travel_panel)

	_fleet.changed.connect(_update)
	_info.setup(_fleet, _id)
	_update()
	if _travel_on_open:
		open_travel()


func _process(_delta: float) -> void:
	if is_visible_in_tree() and Engine.get_process_frames() % 30 == 0:
		_info.tick()


## Back steps back inside the trip choice first; false when there is nothing (the stack closes it).
func handle_back() -> bool:
	if _travel_panel.visible:
		_travel_panel.handle_back()
		return true
	return false


## The trip choice (for review scenes).
func travel_panel() -> TravelPanel:
	return _travel_panel


func site() -> TravelSiteScreen:
	return _site if _layer_open(_site) else null


func pick_map() -> MapScreen:
	return _pick_map if _layer_open(_pick_map) else null


func _update() -> void:
	var entry := _fleet.fleet.find(_id)
	if entry == null:
		_header.set_title(tr("FLEET_UNKNOWN_PLACE"))
		_travel_button.disabled = true
		return
	_header.set_title(entry.name)
	var subtitle := tr("FLEET_KIND_" + entry.kind.to_upper()) if not entry.kind.is_empty() else ""
	if entry.is_enterprise():
		subtitle = "%s · %s" % [tr("FLEET_FLAGSHIP_MARK") if entry.flagship else tr("FLEET_ENTERPRISE_MARK"), subtitle]
	_header.set_subtitle(subtitle)
	var route := _fleet.routes.book.find(entry.route_id) if entry.route_id != 0 and _fleet.routes != null else null
	if route != null:
		_route_line.text = tr("FLEET_DRIVES_ROUTE").format({"name": route.name})
	elif not entry.routes.is_empty():
		_route_line.text = tr("FLEET_STATION_OF").format({"count": entry.routes.size()})
	else:
		_route_line.text = tr("FLEET_NO_ROUTE")
	_route_button.text = tr("FLEET_EDIT_ROUTE") if route != null else tr("FLEET_ROUTES")
	# Enterprise structures have no routes (they draw from the enterprise inventory).
	_route_button.visible = not entry.is_enterprise()
	var group := _fleet.group_of(_id)
	_group_button.visible = group != null
	if group != null:
		_group_button.text = tr("FLEETS_OPEN_NAMED").format({"name": group.name})
	var reason := _travel_reason(entry)
	_travel_button.disabled = not reason.is_empty()
	_travel_note.text = reason
	_travel_note.visible = not reason.is_empty()
	_info.tick()


## Why the structure cannot set off now; "" when it can.
func _travel_reason(entry: Fleet.Entry) -> String:
	if not entry.can_fly() and not entry.can_drive():
		return tr("FLEET_NO_DRIVE")
	if entry.is_enterprise():
		var account := Services.session.account
		if account == null or not account.enterprise_flags.has(Enterprise.FLAG_FLEET):
			return tr("FLEET_ENTERPRISE_NEEDS_RIGHT").format({"right": tr("ENTERPRISE_FLAG_COMMAND_ENTERPRISE_FLEET")})
	var group := _fleet.group_of(entry.structure_id)
	if group != null:
		return tr("FLEETS_MEMBER_LOCKED").format({"name": group.name})
	if entry.is_moving(Services.clock.now_ms()):
		return tr("FLEET_UNDER_WAY_NOW")
	var can := TravelPanel.allowed(_fleet.fleet, entry)
	if can.get("fly") != true and can.get("drive") != true:
		return tr("FLEET_CANNOT_TRAVEL_HERE")
	return ""


func _on_group() -> void:
	var group := _fleet.group_of(_id)
	if group != null:
		group_requested.emit(group.fleet_id)


func _on_route() -> void:
	var entry := _fleet.fleet.find(_id)
	route_requested.emit(entry.route_id if entry != null else 0)


# --- travel ---------------------------------------------------------------------------------

## Loads the structure (once) and opens the choice of the trip.
func open_travel() -> void:
	var entry := _fleet.fleet.find(_id)
	if entry == null or not _travel_reason(entry).is_empty():
		return
	if _mover != null:
		_show_travel()
		return
	if _loader != null:
		return
	_show_status(tr("FLEET_TRAVEL_LOADING"), AppTheme.COLOR_MUTED)
	_travel_button.disabled = true
	_loader = ColonyModel.new()
	_loader.name = "Mover"
	add_child(_loader)
	_loader.load_failed.connect(_on_load_failed)
	_loader.ready_to_show.connect(_on_loaded, CONNECT_ONE_SHOT)
	_loader.load_structure(_id)


func _on_loaded() -> void:
	var mover := _loader.structure(_id)
	var deadline := Time.get_ticks_msec() + roundi(LOAD_SECONDS * 1000.0)
	while mover != null and mover.layout.hull_count() == 0 and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	if mover == null or mover.layout.hull_count() == 0:
		var missing := ApiError.new()
		missing.code = "STRUCTURE_NOT_FOUND"
		_on_load_failed(missing)
		return
	_mover = mover
	_status.visible = false
	_show_travel()


func _on_load_failed(error: ApiError) -> void:
	if _loader != null:
		_loader.queue_free()
		_loader = null
	_show_status(tr("FLEET_TRAVEL_LOAD_FAILED") + "\n" + ErrorText.describe(error, self), AppTheme.COLOR_DANGER)
	_update()


func _show_travel() -> void:
	_actions.visible = false
	_travel_panel.visible = true
	_travel_panel.open(_fleet, _mover)


func _close_travel() -> void:
	_travel_panel.visible = false
	_actions.visible = true
	_update()


func _open_map_pick(land: bool) -> void:
	if _layer_open(_pick_map):
		return
	_picking_land = land
	_pick_map = MapScreen.new()
	var account := Services.session.account
	_pick_map.setup(_loader.system_id, account.home_body_id if account != null else "")
	_pick_map.pick = MapScreen.PICK_LAND if land else MapScreen.PICK_ORBIT
	_pick_map.fleet = _fleet
	_pick_map.body_picked.connect(_on_body_picked)
	ScreenStack.push_onto(self, _pick_map)


func _on_body_picked(body_id: String) -> void:
	ScreenStack.close_layer(_pick_map)
	_pick_map = null
	if _picking_land:
		_open_site(TravelSiteScreen.MODE_LAND, body_id)
		return
	var body_name := _fleet.body_name(body_id)
	if body_name.is_empty():
		var body := await Services.api.get_json("/v2/bodies/" + body_id.uri_encode())
		body_name = Wire.as_string(body.data.get("name")) if body.is_ok() else tr("FLEET_UNKNOWN_PLACE")
	_travel_panel.show_orbit(body_id, body_name)


func _on_drive_requested() -> void:
	_open_site(TravelSiteScreen.MODE_DRIVE, _fleet.fleet.body_of(_id))


## The surface of a body, to choose where the structure lands or stops.
func _open_site(mode: String, body_id: String) -> void:
	if _layer_open(_site):
		return
	_site = TravelSiteScreen.new()
	_site.setup(_mover, mode, body_id, _fleet)
	_site.started.connect(_on_travel_started)
	ScreenStack.push_onto(self, _site)


## A trip started: the fleet learns its motion at once (the event follows), the choice closes.
func _on_travel_started(details: Dictionary) -> void:
	ScreenStack.close_layer(_site)
	_site = null
	_close_travel()
	# The structure is somewhere else now: the next trip loads it again.
	_mover = null
	if _loader != null:
		_loader.queue_free()
		_loader = null
	_fleet.fleet.apply_details(details)
	var entry := _fleet.fleet.find(Wire.as_int(details.get("structureId")))
	if entry != null and entry.motion != null:
		_show_status(tr("TRAVEL_NOTICE_STARTED").format({"name": entry.name,
			"duration": TimeFormat.duration(entry.motion.remaining_ms(Services.clock.now_ms()))}), AppTheme.COLOR_OK)
	_fleet.changed.emit()


func _show_status(text: String, color: Color) -> void:
	_status.text = text
	_status.add_theme_color_override("font_color", color)
	_status.visible = true


func _layer_open(layer: Variant) -> bool:
	return ScreenStack.is_open(layer)
