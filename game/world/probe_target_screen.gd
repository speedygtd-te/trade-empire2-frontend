class_name ProbeTargetScreen
extends Control
## Where a probe should land, or what has been explored of a body: the whole surface as a flat
## map (SurfaceMapView) with the explored areas, the player's structures, foreign structures seen
## by probes and probes under way here.
##
## Launching (`setup_launch`): a tap chooses the target; the cyan circle shows the 5 000 fields
## the probe would explore. The bottom says what it costs (one probe from the launcher's own
## supply), what is in store, and why it cannot be launched now; Launch sends it. Looking
## (`setup_view`): the same map with the explored share and the sightings, without a target.
## A layer: "‹ Back" or Back closes it.

## The probe was launched; the server's answer (ProbeView).
signal launched(probe: Probes.Probe)
signal closed

## How many cells the map shows across at first.
const START_ACROSS := 60000.0
## Above this explored share the bottom names the percentage; below, the number of areas.
const SHARE_SHOWN := 0.001

var _fleet: FleetModel
var _body_id := ""
## Launching: the structure with the launcher and the launcher; null when only looking.
var _structure: ColonyModel = null
var _launcher: StructureLayout.Module = null

var _body_name := ""
## The preview of a launch at the target (draft.32): the answer, or why it failed; whether one is
## on its way and whether the server has the preview at all.
var _quote: Probes.Quote = null
var _quote_error: ApiError = null
var _quote_cell := Vector2i.ZERO
var _asking := false
var _preview_supported := true
var _size_x := 0
var _size_y := 0
var _busy := false

var _header: LayerHeader
var _map: SurfaceMapView
var _bottom: PanelContainer
var _lines: Label
var _reason: Label
var _status: Label
var _launch: Button
var _state: CenterContainer


## Choosing the target of a probe from `launcher` of `structure` on `body_id`.
func setup_launch(fleet: FleetModel, structure: ColonyModel, launcher: StructureLayout.Module, body_id: String) -> void:
	_fleet = fleet
	_structure = structure
	_launcher = launcher
	_body_id = body_id


## Looking at what has been explored of a body.
func setup_view(fleet: FleetModel, body_id: String) -> void:
	_fleet = fleet
	_body_id = body_id


func launching() -> bool:
	return _launcher != null


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
	var column := Ui.column(0)
	margin.add_child(column)
	var top := PanelContainer.new()
	column.add_child(top)
	_header = LayerHeader.new()
	_header.set_title(tr("PROBE_TARGET_TITLE") if launching() else tr("PROBE_VIEW_TITLE"))
	_header.back_pressed.connect(func() -> void: closed.emit())
	top.add_child(_header)
	_map = SurfaceMapView.new()
	_map.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_map.cell_tapped.connect(_on_cell_tapped)
	column.add_child(_map)
	_bottom = PanelContainer.new()
	column.add_child(_bottom)
	var rows := Ui.column(12)
	_bottom.add_child(rows)
	_lines = Ui.dynamic_label()
	rows.add_child(_lines)
	rows.add_child(Ui.label("PROBE_MAP_LEGEND", AppTheme.VARIATION_MUTED))
	_reason = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_reason.visible = false
	rows.add_child(_reason)
	_status = Ui.dynamic_label()
	_status.visible = false
	rows.add_child(_status)
	_launch = Ui.primary_button("PROBE_LAUNCH")
	_launch.visible = launching()
	_launch.pressed.connect(_on_launch)
	rows.add_child(_launch)
	_state = CenterContainer.new()
	_state.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_state.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_state)
	if _fleet != null:
		_fleet.probes.reveal_changed.connect(_on_reveal_changed)
		_fleet.probes.changed.connect(_refresh)
	_load()


## Nothing to close inside: the stack takes the screen off.
func handle_back() -> bool:
	return false


func _process(_delta: float) -> void:
	if is_visible_in_tree() and Engine.get_process_frames() % 30 == 0 and _size_x > 0:
		_refresh()


# --- data -----------------------------------------------------------------------------------

func _load() -> void:
	_show_state("PROBE_LOADING")
	var body := await Services.api.get_json("/v2/bodies/" + _body_id.uri_encode())
	if not is_inside_tree():
		return
	if not body.is_ok():
		_show_state("PROBE_LOAD_FAILED", body.error)
		return
	_body_name = Wire.as_string(body.data.get("name"))
	_header.set_subtitle(_body_name)
	var grid := Wire.as_dict(body.data.get("grid"))
	_size_x = Wire.as_int(grid.get("sizeX"))
	_size_y = Wire.as_int(grid.get("sizeY"))
	if _size_x <= 0:
		_show_state("PROBE_NO_SURFACE")
		return
	var reveal: RevealMap = null
	if _fleet != null:
		reveal = await _fleet.probes.ensure_reveal(_body_id)
	if not is_inside_tree():
		return
	_state.visible = false
	_map.reveal = reveal
	_map.own = _own_cells()
	await get_tree().process_frame
	_map.show_body(_size_x, _size_y, _start_cell(reveal), START_ACROSS)
	_refresh()


## The origins of the player's structures standing on this body.
func _own_cells() -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	if _fleet == null:
		return result
	for entry: Fleet.Entry in _fleet.fleet.entries():
		if entry.where() == Fleet.Where.SURFACE and entry.body_id == _body_id:
			result.append(Vector2i(entry.offset.x, entry.offset.y))
	return result


## Where the map opens: the newest probe area, else an own structure here, else the equator.
func _start_cell(reveal: RevealMap) -> Vector2i:
	var newest := reveal.newest_probe_area() if reveal != null else null
	if newest != null:
		return newest.centre()
	var own := _own_cells()
	if not own.is_empty():
		return own[0]
	return Vector2i.ZERO


func _on_reveal_changed(body_id: String) -> void:
	if body_id != _body_id or _size_x <= 0:
		return
	_map.reveal = _fleet.probes.reveal(body_id)
	_map.queue_redraw()
	_refresh()


func _on_cell_tapped(cell: Vector2i) -> void:
	if not launching() or _busy:
		return
	_map.target = cell
	_status.visible = false
	_map.queue_redraw()
	_refresh()
	_ask_preview(cell)


## Asks the server what a launch at the target would do (draft.32 preview): flight time and every
## violated condition. A server without the preview keeps the general line.
func _ask_preview(cell: Vector2i) -> void:
	if not _preview_supported or _fleet == null:
		return
	_quote = null
	_quote_error = null
	_quote_cell = cell
	_asking = true
	_refresh()
	var answer := await _fleet.probes.preview(_structure.structure_id, _launcher.module_id, _body_id, cell, _size_x, _size_y)
	if not is_inside_tree() or _map.target == null or (_map.target as Vector2i) != cell:
		return
	_asking = false
	if answer.is_ok():
		_quote = Probes.Quote.from_wire(answer.data)
	elif answer.error.http_status == 404 and answer.error.code != "STRUCTURE_NOT_FOUND" \
			and answer.error.code != "PLANET_NOT_FOUND":
		# No preview on this server (before draft.32).
		_preview_supported = false
	elif answer.error.http_status == 405:
		_preview_supported = false
	else:
		_quote_error = answer.error
	_refresh()


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


# --- the bottom -----------------------------------------------------------------------------

func _refresh() -> void:
	if _map == null or _size_x <= 0:
		return
	var now := Services.clock.now_ms()
	var here: Array[Probes.Probe] = []
	if _fleet != null:
		for probe: Probes.Probe in _fleet.probes.list.flying(now):
			if probe.body_id == _body_id:
				here.append(probe)
	_map.probes = here
	var lines := PackedStringArray()
	if launching():
		_launch_lines(lines)
	else:
		_view_lines(lines, now)
	_lines.text = "\n".join(lines)
	_map.queue_redraw()


func _launch_lines(lines: PackedStringArray) -> void:
	if _map.target == null:
		lines.append(tr("PROBE_TARGET_HINT"))
	else:
		var cell: Vector2i = _map.target
		lines.append(tr("PROBE_TARGET_CELL").format({"x": AmountFormat.units(cell.x), "y": AmountFormat.units(cell.y),
			"radius": AmountFormat.units(Probes.RADIUS), "km": AmountFormat.units(Probes.RADIUS_KM)}))
		var reveal := _map.reveal
		if reveal != null and reveal.is_revealed(cell.x, cell.y, _size_x):
			lines.append(tr("PROBE_TARGET_EXPLORED"))
	lines.append(tr("PROBE_COST").format({"stock": stock_text(_structure, self)}))
	var has_quote := _map.target != null and _quote != null and _quote_cell == (_map.target as Vector2i)
	if has_quote:
		lines.append(tr("PROBE_FLIGHT_TIME_KNOWN").format({"duration": TimeFormat.duration(_quote.flight_ms)}))
	elif _asking and _preview_supported:
		lines.append(tr("PROBE_FLIGHT_TIME_ASKING"))
	else:
		lines.append(tr("PROBE_FLIGHT_TIME"))
	var reason := launch_reason(_structure, _launcher, _fleet, self)
	# The server's own verdict on this target, once there (the first violated condition).
	if reason.is_empty() and has_quote and not _quote.ok:
		var first := ApiError.new()
		first.code = _quote.errors[0] if not _quote.errors.is_empty() else ""
		reason = ErrorText.describe(first, self)
	elif reason.is_empty() and _quote_error != null and _map.target != null:
		reason = ErrorText.describe(_quote_error, self)
	_reason.text = reason
	_reason.visible = not reason.is_empty()
	_reason.add_theme_color_override("font_color", AppTheme.COLOR_DANGER if not reason.is_empty() else AppTheme.COLOR_MUTED)
	_launch.disabled = _busy or _map.target == null or not reason.is_empty()


func _view_lines(lines: PackedStringArray, now: int) -> void:
	lines.append(exploration_text(_map.reveal, _size_x, _size_y, self))
	var flying := _map.probes.size()
	if flying > 0:
		lines.append(tr("PROBE_VIEW_FLYING").format({"count": flying}))
	if _map.reveal != null:
		for sighting: RevealMap.Sighting in _map.reveal.sightings:
			lines.append(sighting_text(sighting, now, self))


func _on_launch() -> void:
	if _busy or _map.target == null or not launching():
		return
	_busy = true
	_status.visible = true
	_status.text = tr("COLONY_SENDING")
	_status.add_theme_color_override("font_color", AppTheme.COLOR_MUTED)
	_refresh()
	var result := await _fleet.probes.launch(_structure.structure_id, _launcher.module_id, _body_id,
		_map.target as Vector2i, _size_x, _size_y)
	_busy = false
	if not is_inside_tree():
		return
	if result.is_ok():
		_structure.reload_inventory()
		var probe := Probes.probe_from_wire(result.data)
		if probe != null:
			launched.emit(probe)
			return
	_status.text = ErrorText.describe(result.error, self) if result.error != null else tr("ERROR_UNKNOWN")
	_status.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
	_refresh()


# --- texts shared with the launcher's card and the probe list -------------------------------

## "3 in store" / "none in store" for the probes in a structure's own supply; "" while unknown.
static func stock_text(structure: ColonyModel, translator: Object) -> String:
	var count := probe_stock(structure)
	if count < 0:
		return ""
	return translator.tr("PROBE_STOCK_NONE") if count == 0 else translator.tr("PROBE_STOCK").format({"count": AmountFormat.units(count)})


## Whole probes in a structure's own supply; -1 while its store is not loaded.
static func probe_stock(structure: ColonyModel) -> int:
	if structure == null or structure.inventory == null:
		return -1
	var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
	var flow := structure.inventory.flow(Probes.ITEM)
	var amount := flow.amount_at(Services.clock.now_ms()) if flow != null else 0
	@warning_ignore("integer_division")
	return amount / maxi(scale, 1)


## Why a launcher cannot fire now (translated); "" when it can. The server checks again.
static func launch_reason(structure: ColonyModel, launcher: StructureLayout.Module, fleet: FleetModel, translator: Object) -> String:
	if structure == null or launcher == null:
		return ""
	var now := Services.clock.now_ms()
	var entry := fleet.fleet.find(structure.structure_id) if fleet != null else null
	var moving := entry != null and entry.is_moving(now)
	var power_short := structure.production_known() and structure.power[0] < structure.power[1]
	var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
	var stock := probe_stock(structure)
	var block := Probes.launch_block(launcher.is_building(), launcher.is_disabled(), moving, power_short,
		maxi(stock, 0) * scale, scale, stock >= 0)
	match block:
		Probes.Block.BUILDING:
			return translator.tr("PROBE_BLOCK_BUILDING")
		Probes.Block.DISABLED:
			return translator.tr("PROBE_BLOCK_DISABLED")
		Probes.Block.MOVING:
			return translator.tr("PROBE_BLOCK_MOVING")
		Probes.Block.NO_POWER:
			return translator.tr("PROBE_BLOCK_NO_POWER")
		Probes.Block.NO_PROBE:
			return translator.tr("PROBE_BLOCK_NO_PROBE")
	return ""


## "Explored: 3 areas · about 0.4 %" or "Not explored yet — send a probe".
static func exploration_text(reveal: RevealMap, size_x: int, size_y: int, translator: Object) -> String:
	if reveal == null or not reveal.fog:
		return translator.tr("PROBE_EXPLORED_ALL")
	if reveal.areas.is_empty():
		return translator.tr("PROBE_EXPLORED_NONE")
	var share := reveal.explored_share(size_x, size_y)
	if share >= SHARE_SHOWN:
		return translator.tr("PROBE_EXPLORED_SHARE").format({"count": reveal.areas.size(),
			"percent": String.num(share * 100.0, 1 if share < 0.1 else 0)})
	return translator.tr("PROBE_EXPLORED_AREAS").format({"count": reveal.areas.size()})


## "Mira's structure · 30 hulls · seen 2h 5m ago".
static func sighting_text(sighting: RevealMap.Sighting, now: int, translator: Object) -> String:
	var owner := sighting.owner_name if not sighting.owner_name.is_empty() else translator.tr("PROBE_UNKNOWN_OWNER")
	return translator.tr("PROBE_SIGHTING").format({"owner": owner, "hulls": AmountFormat.units(sighting.hulls),
		"ago": TimeFormat.duration(maxi(now - sighting.seen_at, 0))})
