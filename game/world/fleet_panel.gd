class_name FleetPanel
extends Control
## The Fleet tab: the player's own structures (FleetModel) and the routes between them. Ships and
## vehicles come first, each with where it is or where it is heading and when it arrives (and its
## route); bases and stations follow in a section of their own. The structure Base shows is
## marked. A tap opens the structure's details (FleetDetail, a layer): travel, show it in Base,
## its routes. The route editor is a layer as well. Fleets (draft.33) come first: each with its
## ships, where it is or its flight, and its shared supply; a tap opens it (FleetGroupDetail),
## "Form a fleet" picks ships for a new one (FleetGroupCreate). The structures of the player's
## enterprise (draft.37, the flagship first) follow in a section of their own, marked as such.

## The player wants to see a structure in Base.
signal chosen(structure_id: int)

## How often the arrival times are refreshed (seconds).
const REFRESH_SECONDS := 1.0
## The tabs: structures, routes, probes (draft.31).
const TAB_STRUCTURES := 0
const TAB_ROUTES := 1
const TAB_PROBES := 2
const TAB_TRADE := 3

var _fleet: FleetModel
var _current := 0
var _list: VBoxContainer
var _state: Label
var _retry: Button
var _left := 0.0
var _tabs: TabStrip
var _structures: VBoxContainer
var _routes: RouteList
var _editor: RouteEditor = null
var _detail: FleetDetail = null
var _start_with_routes := false
var _probes_tab: Button
var _probes: ProbeList
var _exploration: ProbeTargetScreen = null
var _group: FleetGroupDetail = null
var _create: FleetGroupCreate = null
var _trade_tab: Button
var _trade: TradeList
var _platform: TradeDockScreen = null


## `current`: the structure Base shows; `routes`: open on the routes tab.
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
	var header := LayerHeader.new()
	header.show_back(false)
	header.set_title(tr("FLEET_TITLE"))
	column.add_child(header)
	# Two tabs: the structures, and the routes between them.
	_tabs = TabStrip.new()
	_tabs.add_tab("ROUTE_TAB_STRUCTURES")
	_tabs.add_tab("ROUTE_TAB")
	# Probes only on a server that has them (draft.31 game data).
	_probes_tab = _tabs.add_tab("PROBE_TAB")
	# Trade only on a server that has it (draft.44 game data).
	_trade_tab = _tabs.add_tab("TRADE_TAB")
	_tabs.tab_selected.connect(_show_tab)
	column.add_child(_tabs)
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
	_probes = ProbeList.new()
	_probes.setup(_fleet)
	_probes.view_requested.connect(open_exploration)
	column.add_child(_probes)
	_trade = TradeList.new()
	_trade.setup(_fleet)
	_trade.platform_requested.connect(func(host_id: int, ship_id: int) -> void: open_platform(host_id, ship_id))
	column.add_child(_trade)
	_fleet.changed.connect(_rebuild)
	_fleet.load_failed.connect(_on_failed)
	Services.definitions_loaded.connect(_offer_probes)
	_offer_probes()
	_rebuild()
	_show_tab(TAB_ROUTES if _start_with_routes else TAB_STRUCTURES)
	if not _fleet.loaded:
		_fleet.reload()


## Shows the structures, the routes or the probes.
func _show_tab(index: int) -> void:
	_tabs.select(index)
	_structures.visible = index == TAB_STRUCTURES
	_routes.visible = index == TAB_ROUTES
	_probes.visible = index == TAB_PROBES
	_trade.visible = index == TAB_TRADE


## The Probes and Trade tabs show only on a server with probes or trade.
func _offer_probes() -> void:
	_probes_tab.visible = _fleet.probes.supported()
	_trade_tab.visible = _fleet.trade.supported()
	if (not _probes_tab.visible and _tabs.selected() == TAB_PROBES) 			or (not _trade_tab.visible and _tabs.selected() == TAB_TRADE):
		_show_tab(TAB_STRUCTURES)


## Opens the Trade tab (for review scenes).
func show_trade() -> void:
	_show_tab(TAB_TRADE)


## Opens a trade platform as a layer, with an own ship docked there (0: only look).
func open_platform(host_id: int, ship_id: int = 0) -> TradeDockScreen:
	ScreenStack.close_layer(_platform)
	_platform = TradeDockScreen.new()
	_platform.setup(_fleet, host_id, ship_id)
	ScreenStack.push_onto(self, _platform)
	return _platform


## The platform layer while it is open; null otherwise.
func platform() -> TradeDockScreen:
	return _platform if ScreenStack.is_open(_platform) else null


## Opens the Probes tab (for review scenes and the launcher).
func show_probes() -> void:
	_show_tab(TAB_PROBES)


## What is explored of a body, as a layer (from the probe list).
func open_exploration(body_id: String) -> ProbeTargetScreen:
	ScreenStack.close_layer(_exploration)
	_exploration = ProbeTargetScreen.new()
	_exploration.setup_view(_fleet, body_id)
	ScreenStack.push_onto(self, _exploration)
	return _exploration


## Marks the structure Base shows.
func set_current(structure_id: int) -> void:
	if structure_id == _current:
		return
	_current = structure_id
	for row: Node in _list.get_children():
		var button := row as ListButton
		if button != null:
			var id: int = button.get_meta("structure", 0)
			button.set_chosen(id == structure_id)


## Opens a structure's details as a layer; `travel` opens its trip choice right away.
func open_detail(structure_id: int, travel: bool = false) -> FleetDetail:
	ScreenStack.close_layer(_detail)
	_detail = FleetDetail.new()
	_detail.setup(_fleet, structure_id, travel)
	_detail.show_requested.connect(func(id: int) -> void: chosen.emit(id))
	_detail.route_requested.connect(_on_route_requested)
	_detail.group_requested.connect(func(fleet_id: int) -> void: open_group(fleet_id))
	_detail.trade_requested.connect(func(host_id: int, ship_id: int) -> void: open_platform(host_id, ship_id))
	ScreenStack.push_onto(self, _detail)
	return _detail


## Opens a fleet as a layer.
func open_group(fleet_id: int) -> FleetGroupDetail:
	ScreenStack.close_layer(_group)
	_group = FleetGroupDetail.new()
	_group.setup(_fleet, fleet_id)
	_group.member_requested.connect(func(id: int) -> void: open_detail(id))
	_group.route_requested.connect(func(route_id: int) -> void:
		if route_id != 0:
			# The routes tab holds pause and delete (deleting is the way to rebuild the fleet).
			ScreenStack.close_layer(_group)
			_show_tab(TAB_ROUTES)
		else:
			open_route_editor(0, 0, fleet_id))
	ScreenStack.push_onto(self, _group)
	return _group


## The fleet layer while it is open; null otherwise.
func group_detail() -> FleetGroupDetail:
	return _group if ScreenStack.is_open(_group) else null


## Opens the choice of ships for a new fleet as a layer.
func open_group_create() -> FleetGroupCreate:
	ScreenStack.close_layer(_create)
	_create = FleetGroupCreate.new()
	_create.setup(_fleet)
	_create.created.connect(func(fleet_id: int) -> void:
		ScreenStack.close_layer(_create)
		_create = null
		open_group(fleet_id))
	ScreenStack.push_onto(self, _create)
	return _create


## The details layer while it is open; null otherwise.
func detail() -> FleetDetail:
	return _detail if _detail != null and is_instance_valid(_detail) and not _detail.is_queued_for_deletion() else null


func _on_route_requested(route_id: int) -> void:
	if route_id != 0:
		open_route_editor(route_id)
		return
	ScreenStack.close_layer(_detail)
	_show_tab(TAB_ROUTES)


## Opens the route editor as a layer: an existing route (its rules), or a new one (0),
## prefilled with a transporter when `transporter_id` is not 0.
func open_route_editor(route_id: int, transporter_id: int = 0, fleet_id: int = 0) -> void:
	_close_editor()
	_editor = RouteEditor.new()
	_editor.setup(_fleet, route_id, transporter_id, fleet_id)
	_editor.saved.connect(func(_route_id: int) -> void: _close_editor())
	ScreenStack.push_onto(self, _editor)


func _close_editor() -> void:
	if _editor != null:
		ScreenStack.close_layer(_editor)
		_editor = null


## The route editor while it is open; null otherwise.
func editor() -> RouteEditor:
	return _editor if _editor != null and is_instance_valid(_editor) and not _editor.is_queued_for_deletion() else null


## The root has nothing of its own to close (layers are the stack's).
func handle_back() -> bool:
	return false


func _process(delta: float) -> void:
	_left -= delta
	# Under a layer or in another tab nothing is seen: the rows wait (shown again at once).
	if _left <= 0.0 and is_visible_in_tree():
		_left = REFRESH_SECONDS
		_update_lines()
		_probes.tick()


func _rebuild() -> void:
	for child: Node in _list.get_children():
		child.queue_free()
	_retry.visible = false
	if not _fleet.loaded:
		_state.text = tr("FLEET_LOADING")
		_state.visible = true
		return
	# Only what can travel, ships and vehicles apart (Rudi 2026-11-20); bases and stations are
	# reached through Base and the places list.
	var ships := _fleet.fleet.ships()
	var vehicles := _fleet.fleet.vehicles()
	_state.visible = ships.is_empty() and vehicles.is_empty() and _fleet.fleet.enterprise_entries().is_empty()
	_state.text = tr("FLEET_EMPTY")
	_add_groups()
	if not ships.is_empty():
		_list.add_child(Ui.label("FLEET_SECTION_SHIPS", AppTheme.VARIATION_MUTED))
		for entry: Fleet.Entry in ships:
			_add_row(entry)
	if not vehicles.is_empty():
		_list.add_child(Ui.spacer(8))
		_list.add_child(Ui.label("FLEET_SECTION_VEHICLES", AppTheme.VARIATION_MUTED))
		for entry: Fleet.Entry in vehicles:
			_add_row(entry)
	# The enterprise's structures (draft.37): every member sees them; travel needs a right.
	var enterprise := _fleet.fleet.enterprise_entries()
	if not enterprise.is_empty():
		_list.add_child(Ui.spacer(8))
		_list.add_child(Ui.label("FLEET_SECTION_ENTERPRISE", AppTheme.VARIATION_MUTED))
		for entry: Fleet.Entry in enterprise:
			_add_row(entry)
	_update_lines()


## The fleets and "Form a fleet", when the server has fleets and the player has a ship.
func _add_groups() -> void:
	if not _fleet.groups_supported:
		return
	var ships := false
	for entry: Fleet.Entry in _fleet.fleet.entries():
		ships = ships or entry.can_fly()
	if not ships and _fleet.groups.size() == 0:
		return
	_list.add_child(Ui.label("FLEETS_SECTION", AppTheme.VARIATION_MUTED))
	for group: FleetGroups.Group in _fleet.groups.groups():
		var row := ListButton.new()
		row.alignment = HORIZONTAL_ALIGNMENT_LEFT
		row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		row.set_meta("group", group.fleet_id)
		var id := group.fleet_id
		row.tapped.connect(func() -> void: open_group(id))
		_list.add_child(row)
	var create := Ui.secondary_button("FLEETS_CREATE_OPEN")
	create.disabled = _fleet.groups.candidates(_fleet.fleet, "", Services.clock.now_ms(),
		FleetGroupCreate.commands_enterprise()).is_empty()
	create.pressed.connect(func() -> void: open_group_create())
	_list.add_child(create)
	_list.add_child(Ui.spacer(8))


func _add_row(entry: Fleet.Entry) -> void:
	var row := ListButton.new()
	row.alignment = HORIZONTAL_ALIGNMENT_LEFT
	row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	row.set_chosen(entry.structure_id == _current)
	row.set_meta("structure", entry.structure_id)
	var id := entry.structure_id
	row.tapped.connect(func() -> void: open_detail(id))
	_list.add_child(row)


func _update_lines() -> void:
	var now := Services.clock.now_ms()
	for row: Node in _list.get_children():
		var button := row as ListButton
		if button == null or button.is_queued_for_deletion():
			continue
		if button.has_meta("group"):
			var group_id: int = button.get_meta("group", 0)
			var group := _fleet.groups.find(group_id)
			if group != null:
				button.text = "%s
%s · %s" % [(tr("FLEETS_ENTERPRISE_MARK") + " · " if FleetGroupDetail.is_enterprise(group) else "") + group.name, tr("FLEETS_SUBTITLE").format({"count": group.members.size()}),
					FleetGroupDetail.status_text(_fleet, group, now, self)]
			continue
		var id: int = button.get_meta("structure", 0)
		var entry := _fleet.fleet.find(id)
		if entry == null:
			continue
		var line := status_text(_fleet, entry, now, self)
		if entry.motion != null and entry.is_moving(now):
			line += " · " + tr("FLEET_PROGRESS").format({"percent": roundi(entry.motion.progress_at(now) * 100.0)})
		if entry.is_enterprise():
			line = "%s · %s" % [tr("FLEET_FLAGSHIP_MARK") if entry.flagship else tr("FLEET_ENTERPRISE_MARK"), line]
		button.text = "%s\n%s" % [entry.name, line]


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
## `with_fleet`: name the fleet it flies with (off inside that fleet's own view).
static func status_text(fleet_model: FleetModel, entry: Fleet.Entry, now: int, translator: Object,
		with_fleet: bool = true) -> String:
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
				var host_name := host.name if host != null else translator.tr("FLEET_UNKNOWN_PLACE")
				# A foreign trade platform (draft.44) is not in the fleet.
				var platform := fleet_model.trade.book.host(entry.host_id) if host == null and fleet_model.trade != null else null
				if platform != null:
					host_name = platform.name
				place = translator.tr("FLEET_DOCKED").format({"host": host_name})
			_:
				place = translator.tr("FLEET_IN_TRANSIT")
	var line := "%s · %s" % [kind, place] if not kind.is_empty() else place
	if entry.route_id != 0:
		line += " · " + translator.tr("FLEET_ON_ROUTE")
	var group := fleet_model.group_of(entry.structure_id) if with_fleet else null
	if group != null:
		line += " · " + translator.tr("FLEET_IN_FLEET").format({"name": group.name})
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
