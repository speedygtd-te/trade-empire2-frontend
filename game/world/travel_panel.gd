class_name TravelPanel
extends VBoxContainer
## Where an own structure should go, in the colony screen's bottom panel: the kind of trip
## (Orbit, Land, Dock, Drive — only what its drives allow), then the target and the quote.
##
## Orbit and Land choose a body on the system map (the screen opens it in pick mode); Land and
## Drive continue on the surface (TravelSiteScreen). Dock lists the player's resting structures
## with docks and finds room for the structure on them (TravelPlan.dock_offset); the quote and
## the start happen here. Back steps back to the choice, then closes.

signal closed
## The player wants to pick a body on the map: to orbit it (`land` false) or to land on it.
signal pick_body_requested(land: bool)
## The player wants to drive on the current body (the screen opens the surface).
signal drive_requested
## The trip started; `details` is the structure as the server sent it back.
signal started(details: Dictionary)

## Hosts looked at for docking (each one layout request).
const MAX_HOSTS := 12
## Height of the list of hosts.
const LIST_HEIGHT := 360

enum Step { CHOOSE, HOSTS, QUOTE }

var _fleet: FleetModel
var _mover: ColonyModel
var _entry: Fleet.Entry = null
var _step := Step.CHOOSE

var _title: Label
var _subtitle: Label
var _choices: GridContainer
var _orbit: Button
var _land: Button
var _dock: Button
var _drive: Button
var _hosts_scroll: ScrollContainer
var _hosts: VBoxContainer
var _hosts_state: Label
var _quote: TravelQuotePanel
var _back: Button


func _ready() -> void:
	add_theme_constant_override("separation", 12)
	_title = Ui.dynamic_label(AppTheme.VARIATION_HEADING)
	add_child(_title)
	_subtitle = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	add_child(_subtitle)
	_choices = GridContainer.new()
	_choices.columns = 2
	_choices.add_theme_constant_override("h_separation", 16)
	_choices.add_theme_constant_override("v_separation", 12)
	add_child(_choices)
	_orbit = Ui.secondary_button("TRAVEL_KIND_ORBIT")
	_orbit.pressed.connect(func() -> void: pick_body_requested.emit(false))
	_choices.add_child(_orbit)
	_land = Ui.secondary_button("TRAVEL_KIND_LAND")
	_land.pressed.connect(func() -> void: pick_body_requested.emit(true))
	_choices.add_child(_land)
	_dock = Ui.secondary_button("TRAVEL_KIND_DOCK")
	_dock.pressed.connect(_show_hosts)
	_choices.add_child(_dock)
	_drive = Ui.secondary_button("TRAVEL_KIND_DRIVE")
	_drive.pressed.connect(func() -> void: drive_requested.emit())
	_choices.add_child(_drive)
	_hosts_state = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	add_child(_hosts_state)
	_hosts_scroll = ScrollContainer.new()
	_hosts_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_hosts_scroll.custom_minimum_size = Vector2(0, LIST_HEIGHT)
	add_child(_hosts_scroll)
	_hosts = Ui.column(10)
	_hosts.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_hosts_scroll.add_child(_hosts)
	_quote = TravelQuotePanel.new()
	_quote.started.connect(func(details: Dictionary) -> void: started.emit(details))
	add_child(_quote)
	_back = Ui.secondary_button("COMMON_CLOSE")
	_back.pressed.connect(handle_back)
	add_child(_back)
	_show_step(Step.CHOOSE)


## Opens the choice for a structure. `mover` is its model (layout and guests loaded).
func open(fleet: FleetModel, mover: ColonyModel) -> void:
	_fleet = fleet
	_mover = mover
	_entry = fleet.fleet.find(mover.structure_id)
	_quote.setup(mover.structure_id, _entry != null and _entry.is_enterprise())
	_title.text = tr("TRAVEL_TITLE").format({"name": mover.structure_name})
	_show_step(Step.CHOOSE)


## Back: from a target to the choice, from the choice out.
func handle_back() -> void:
	if _step == Step.CHOOSE:
		closed.emit()
	else:
		_show_step(Step.CHOOSE)


## The quote of a flight into the orbit of a body (picked on the map).
func show_orbit(body_id: String, body_name: String) -> void:
	_show_step(Step.QUOTE)
	_subtitle.text = tr("TRAVEL_TARGET_ORBIT").format({"body": body_name})
	_quote.ask(TravelPlan.request(TravelPlan.MODE_FLIGHT, TravelPlan.orbit_target(body_id)))


## Whether the structure can take off (a space drive) and drive (a ground drive standing on a
## surface, also on a host's dock there).
static func allowed(fleet: Fleet, entry: Fleet.Entry) -> Dictionary:
	var standing := entry.where() == Fleet.Where.SURFACE
	if entry.where() == Fleet.Where.DOCKED:
		var host := fleet.find(entry.host_id)
		standing = host != null and host.where() == Fleet.Where.SURFACE
	return {"fly": entry.can_fly(), "drive": entry.can_drive() and standing}


func _show_step(step: Step) -> void:
	_step = step
	var choose := step == Step.CHOOSE
	_choices.visible = choose
	_hosts_scroll.visible = step == Step.HOSTS
	_hosts_state.visible = step == Step.HOSTS
	_quote.visible = step == Step.QUOTE
	_back.text = tr("COMMON_CLOSE") if choose else tr("TRAVEL_BACK")
	if choose:
		_subtitle.text = tr("TRAVEL_CHOOSE")
		_quote.show_hint("")
		var can := {"fly": false, "drive": false}
		if _entry != null and _fleet != null:
			can = allowed(_fleet.fleet, _entry)
		_orbit.visible = can.get("fly") == true
		_land.visible = can.get("fly") == true
		_dock.visible = can.get("fly") == true or can.get("drive") == true
		_drive.visible = can.get("drive") == true


# --- docking --------------------------------------------------------------------------------

## The player's resting structures with room on their docks, and (draft.38) those of the
## player's enterprise: members dock their own ships there; an enterprise structure docks only at
## the enterprise's (EnterpriseStructures.may_dock).
func _show_hosts() -> void:
	_show_step(Step.HOSTS)
	_subtitle.text = tr("TRAVEL_DOCK_CHOOSE")
	for child: Node in _hosts.get_children():
		child.queue_free()
	_hosts_state.text = tr("TRAVEL_DOCK_LOADING")
	var cells := TravelPlan.mover_cells(_mover.layout, _mover.guest_layouts())
	var now := Services.clock.now_ms()
	var candidates: Array[Fleet.Entry] = []
	var account := Services.session.account
	var member := account != null and not account.enterprise_id.is_empty()
	var mover_kind := _entry.owner_kind if _entry != null else "player"
	for entry: Fleet.Entry in _fleet.fleet.entries() + _fleet.fleet.enterprise_entries():
		if not EnterpriseStructures.may_dock(mover_kind, entry.owner_kind, member):
			continue
		if entry.structure_id == _mover.structure_id or entry.is_moving(now) or entry.total_hulls == 0:
			continue
		if entry.where() != Fleet.Where.SURFACE and entry.where() != Fleet.Where.ORBIT:
			continue
		candidates.append(entry)
		if candidates.size() >= MAX_HOSTS:
			break
	var shown := 0
	for entry: Fleet.Entry in candidates:
		var answer := await Services.api.get_ndjson("/v2/structures/%d/layout" % entry.structure_id)
		if _step != Step.HOSTS or not is_inside_tree():
			return
		if not answer.is_ok():
			continue
		var layout := StructureLayout.new()
		if not layout.apply(answer.stream):
			continue
		var has_docks := false
		for cell: Vector3i in layout.hull_cells():
			if DockRules.is_dock(layout.hull_at(cell)):
				has_docks = true
				break
		if not has_docks:
			continue
		var offset: Variant = TravelPlan.dock_offset(layout, cells, _mover.structure_id)
		var row := ListButton.new()
		row.alignment = HORIZONTAL_ALIGNMENT_LEFT
		row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		var place := FleetPanel.status_text(_fleet, entry, now, self)
		if entry.is_enterprise():
			place = "%s · %s" % [tr("FLEET_FLAGSHIP_MARK") if entry.flagship else tr("FLEET_ENTERPRISE_MARK"), place]
		if offset == null:
			row.text = "%s\n%s · %s" % [entry.name, place, tr("TRAVEL_DOCK_NO_ROOM")]
			row.disabled = true
		else:
			row.text = "%s\n%s" % [entry.name, place]
			var at: Vector3i = offset
			var host_id := entry.structure_id
			var host_name := entry.name
			row.tapped.connect(func() -> void: _choose_dock(host_id, host_name, at))
		_hosts.add_child(row)
		shown += 1
	_hosts_state.text = tr("TRAVEL_DOCK_NONE") if shown == 0 else tr("TRAVEL_DOCK_HINT")


func _choose_dock(host_id: int, host_name: String, offset: Vector3i) -> void:
	_show_step(Step.QUOTE)
	_subtitle.text = tr("TRAVEL_TARGET_DOCK").format({"host": host_name})
	var mode := TravelPlan.MODE_FLIGHT
	var can := allowed(_fleet.fleet, _entry)
	var host := _fleet.fleet.find(host_id)
	# A vehicle reaches a host on its own body by driving.
	if can.get("drive") == true and host != null and host.where() == Fleet.Where.SURFACE \
			and host.body_id == _fleet.fleet.body_of(_mover.structure_id):
		mode = TravelPlan.MODE_GROUND
	_quote.ask(TravelPlan.request(mode, TravelPlan.dock_target(host_id, offset)))
