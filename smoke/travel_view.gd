extends Control
## Pictures of the travel screens for review, with the travel account of tools/dev-account.cjs
## (`node tools/dev-account.cjs --account travel /v2/me`, .local/travel-account.json). Looks only:
## it asks for quotes but starts no journey. Needs a vehicle (GROUND_DRIVE) and a ship
## (SPACE_DRIVE) on the account (smoke/travel_flow.gd builds them).
##
##   godot --path . --resolution 720x1280 res://smoke/travel_view.tscn -- --out=build/travel
##
## Root script of smoke/travel_view.tscn (the screens need the Services autoload).

const ACCOUNT := "res://.local/travel-account.json"

var _out_dir := "user://travel"


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = AppTheme.build()
	_run()


func _run() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--out="):
			_out_dir = argument.trim_prefix("--out=")
	DirAccess.make_dir_recursive_absolute(_out_dir)
	var background := ColorRect.new()
	background.color = AppTheme.COLOR_BACKGROUND
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(ACCOUNT)))
	if account.is_empty():
		print("FAIL  no travel account (node tools/dev-account.cjs --account travel /v2/me)")
		get_tree().quit(2)
		return
	var error := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	if error != null:
		print("FAIL  sign-in: ", error.code)
		get_tree().quit(1)
		return
	await _until(func() -> bool: return Services.definitions != null, 15000)
	var list := await FleetModel.list_structures()
	var vehicle := 0
	var ship := 0
	var items: Array = list.data.get("items") if list.is_ok() else []
	for value: Variant in items:
		var summary := Wire.as_dict(value)
		var capabilities: Array = summary.get("capabilities") if typeof(summary.get("capabilities")) == TYPE_ARRAY else []
		if capabilities.has(Fleet.GROUND_DRIVE) and vehicle == 0:
			vehicle = Wire.as_int(summary.get("structureId"))
		elif capabilities.has(Fleet.SPACE_DRIVE) and ship == 0:
			ship = Wire.as_int(summary.get("structureId"))
	print("vehicle %d, ship %d" % [vehicle, ship])
	if OS.get_cmdline_user_args().has("--fly"):
		if ship != 0:
			await _flight_screens(ship)
		get_tree().quit()
		return
	if OS.get_cmdline_user_args().has("--drive"):
		if vehicle != 0:
			await _drive_screens(vehicle)
		get_tree().quit()
		return
	if vehicle != 0:
		await _vehicle_screens(vehicle)
	if ship != 0:
		await _ship_screens(ship)
	get_tree().quit()


## `--drive`: really drives the vehicle off the base's docks to a free site and back, and shows
## the base meanwhile: the vehicle moving, standing beside the base, back on its dock.
func _drive_screens(vehicle: int) -> void:
	var colony := await _open(0)
	var model := colony._model
	var fleet := colony._fleet
	var layout := model.structure(vehicle).layout if model.structure(vehicle) != null else null
	if layout == null:
		print("FAIL  the vehicle is not at the base")
		return
	var cells := TravelPlan.mover_cells(layout)
	var others: Array[StructureLayout] = []
	for structure: ColonyModel in model.drawn_structures():
		if structure.structure_id != vehicle:
			others.append(structure.layout)
	var centre := model.centre_cell()
	var found: Variant = TravelPlan.suggest_site(cells, TravelPlan.taken_cells(others, model.size_x),
		Vector2i(centre.x + 4, centre.y - 6), model.size_x, model.size_y)
	var target: Vector2i = found
	var drive := await Services.api.post_json("/v2/structures/%d/travel" % vehicle,
		TravelPlan.request(TravelPlan.MODE_GROUND, TravelPlan.surface_target(model.body_id, target)))
	print("DRIVE  started: %s" % ("ok" if drive.is_ok() else drive.error.code))
	var motion := TravelMotion.from_wire(drive.data.get("motion")) if drive.is_ok() else null
	if motion == null:
		return
	await _until(func() -> bool: return Services.clock.now_ms() >= motion.depart_at + roundi((motion.arrival_at - motion.depart_at) * 0.5), 60000)
	await _capture("travel_drive_moving")
	await _until(func() -> bool: return fleet.fleet.find(vehicle).where() == Fleet.Where.SURFACE, 90000)
	await get_tree().create_timer(3.0).timeout
	print("DRIVE  guests %s, neighbours %s, travellers %s" % [model.guests.keys(), model.neighbours.keys(), model.travellers.keys()])
	colony._view.look_at_cell(Vector3i(target.x, target.y, 0))
	await _capture("travel_drive_arrived")
	var host := await Services.api.get_ndjson("/v2/structures/%d/layout" % model.structure_id)
	var host_layout := StructureLayout.new()
	host_layout.apply(host.stream)
	var offset: Variant = TravelPlan.dock_offset(host_layout, cells, vehicle)
	if offset == null:
		print("FAIL  no room on the docks")
		return
	var back := await Services.api.post_json("/v2/structures/%d/travel" % vehicle,
		TravelPlan.request(TravelPlan.MODE_GROUND, TravelPlan.dock_target(model.structure_id, offset as Vector3i)))
	print("DRIVE  back: %s" % ("ok" if back.is_ok() else back.error.code))
	await _until(func() -> bool: return fleet.fleet.find(vehicle).where() == Fleet.Where.DOCKED, 90000)
	await get_tree().create_timer(3.0).timeout
	print("DRIVE  guests %s, neighbours %s, travellers %s" % [model.guests.keys(), model.neighbours.keys(), model.travellers.keys()])
	colony._view.look_at_cell(model.layout.to_absolute(offset as Vector3i))
	await _capture("travel_drive_docked")
	colony.queue_free()


## `--fly`: really starts a trip of the ship (into orbit when it rests on the docks, onto the
## base's docks when it is in orbit) and shows it under way: the trip tab, the base with the
## reserved cells and the descent, the system map.
func _flight_screens(ship: int) -> void:
	var colony := await _open(ship)
	var fleet := colony._fleet
	var entry := fleet.fleet.find(ship)
	var home := 0
	for other: Fleet.Entry in fleet.fleet.entries():
		if other.kind == "base" and home == 0:
			home = other.structure_id
	var request: Dictionary
	if entry.where() == Fleet.Where.ORBIT:
		var host_answer := await Services.api.get_ndjson("/v2/structures/%d/layout" % home)
		var host := StructureLayout.new()
		host.apply(host_answer.stream)
		var offset: Variant = TravelPlan.dock_offset(host, TravelPlan.mover_cells(colony._model.layout), ship)
		if offset == null:
			print("FAIL  no room on the docks")
			return
		request = TravelPlan.request(TravelPlan.MODE_FLIGHT, TravelPlan.dock_target(home, offset as Vector3i))
	else:
		request = TravelPlan.request(TravelPlan.MODE_FLIGHT, TravelPlan.orbit_target(fleet.fleet.body_of(ship)))
	colony._open_travel()
	var quote := colony._travel_panel._quote
	quote.ask(request)
	colony._travel_panel._show_step(TravelPanel.Step.QUOTE)
	await _until(func() -> bool: return quote.quote() != null, 10000)
	quote._on_start()
	await _capture("travel_confirm")
	quote._on_start()
	await _until(func() -> bool: return fleet.fleet.find(ship).motion != null, 10000)
	await get_tree().create_timer(2.0).timeout
	await _capture("travel_started_notice")
	colony.queue_free()
	colony = await _open(ship)
	if colony._model.detached:
		colony._set_mode(ColonyScreen.Mode.TRIP)
	await _capture("travel_trip_under_way")
	colony.queue_free()
	colony = await _open(home)
	var base_fleet := colony._fleet
	await get_tree().create_timer(2.0).timeout
	await _capture("travel_base_during_trip")
	colony._open_map()
	var map := colony._map
	await _until(func() -> bool: return map._map != null, 15000)
	await get_tree().create_timer(1.0).timeout
	map._view.focus_body(base_fleet.fleet.body_of(home))
	await _capture("travel_map_under_way")
	colony._close_map()
	var motion := base_fleet.fleet.find(ship).motion
	if motion != null:
		# Half of the landing: the ship comes down onto its docks.
		var halfway := motion.cruise_end_at + roundi((motion.arrival_at - motion.cruise_end_at) * 0.5)
		await _until(func() -> bool: return Services.clock.now_ms() >= halfway, 400000)
		await _capture("travel_base_landing")
		await _until(func() -> bool: return base_fleet.fleet.find(ship).motion == null, 400000)
		await get_tree().create_timer(3.0).timeout
		await _capture("travel_base_arrived")
	colony.queue_free()


func _open(structure_id: int) -> ColonyScreen:
	var colony := ColonyScreen.new()
	colony.start_structure = structure_id
	add_child(colony)
	await _until(func() -> bool: return colony._model.structure_id != 0 and colony._fleet.loaded, 20000)
	await get_tree().create_timer(3.0).timeout
	return colony


func _vehicle_screens(vehicle: int) -> void:
	var colony := await _open(vehicle)
	# Standing alone the vehicle is the structure on screen; docked, it is a guest of the base.
	var vehicle_model := colony._model.structure(vehicle)
	colony._focus = vehicle_model if vehicle_model != null else colony._model
	colony._select_structure(true)
	await _capture("travel_vehicle_details")
	colony._open_travel()
	await _capture("travel_choose_vehicle")
	var panel := colony._travel_panel
	panel._show_hosts()
	await _until(func() -> bool: return panel._hosts_state.text != tr("TRAVEL_DOCK_LOADING"), 15000)
	await _capture("travel_dock_list")
	for row: Node in panel._hosts.get_children():
		var button := row as ListButton
		if button != null and not button.disabled:
			button.tapped.emit()
			break
	await _until(func() -> bool: return panel._quote.quote() != null, 10000)
	await _capture("travel_dock_quote")
	panel.handle_back()
	colony._on_drive_requested()
	var site := colony._site
	await _until(func() -> bool: return site._model.size_x != 0 and not site._loading.visible, 15000)
	await get_tree().create_timer(2.0).timeout
	await _capture("travel_drive_empty")
	var start := site._start_cell()
	site._view.zoom_by(1.8)
	site._points.append(start + Vector2i(4, 4))
	site._points.append(start + Vector2i(7, -2))
	site._show_drive()
	await _until(func() -> bool: return site._quote.quote() != null, 10000)
	await get_tree().create_timer(1.0).timeout
	await _capture("travel_drive_route")
	# Onto the base: the client sees the clash, the quote confirms it.
	site._points.append(site._around())
	site._show_drive()
	site._view.look_at_cell(Vector3i(site._around().x, site._around().y, 0))
	await _until(func() -> bool: return site._quote.quote() != null, 10000)
	await _capture("travel_drive_error")
	colony._close_site()
	colony._close_travel()
	colony.queue_free()
	await get_tree().process_frame


func _ship_screens(ship: int) -> void:
	var colony := await _open(ship)
	await _capture("travel_ship_start")
	if not colony._model.detached:
		colony._focus = colony._model.structure(ship)
		colony._select_structure(true)
		await _capture("travel_ship_details")
	colony._open_travel()
	await _capture("travel_choose_ship")
	colony._open_map_pick(true)
	var map := colony._map
	await _until(func() -> bool: return map._map != null, 15000)
	await get_tree().create_timer(1.0).timeout
	var body := colony._model.body_id
	map._select(body)
	await get_tree().create_timer(1.0).timeout
	await _capture("travel_map_pick_land")
	colony._on_body_picked(body)
	var site := colony._site
	await _until(func() -> bool: return site != null and site._model.size_x != 0 and not site._loading.visible, 15000)
	await get_tree().create_timer(2.0).timeout
	await _capture("travel_land_suggested")
	await _until(func() -> bool: return site._quote.quote() != null, 10000)
	await get_tree().create_timer(1.0).timeout
	await _capture("travel_land_quote")
	# Onto the base: the client sees the clash at once, the quote confirms it.
	var around := site._around()
	site._site = TravelPlan.origin_for_centre(site._cells, around)
	site._show_site()
	await _until(func() -> bool: return site._quote.quote() != null, 10000)
	await get_tree().create_timer(1.0).timeout
	await _capture("travel_land_error")
	colony._close_site()
	colony._close_travel()
	colony._open_map()
	var overview := colony._map
	await _until(func() -> bool: return overview._map != null, 15000)
	await get_tree().create_timer(1.0).timeout
	overview._view.focus_body(body)
	await _capture("travel_map_fleet")
	colony._close_map()
	colony.queue_free()
	await get_tree().process_frame


func _until(condition: Callable, timeout_ms: int) -> bool:
	var deadline := Time.get_ticks_msec() + timeout_ms
	while Time.get_ticks_msec() < deadline:
		if condition.call():
			return true
		await get_tree().process_frame
	return condition.call()


func _capture(file_name: String) -> void:
	await get_tree().create_timer(0.6).timeout
	await RenderingServer.frame_post_draw
	var path := "%s/%s.png" % [_out_dir, file_name]
	var saved := get_viewport().get_texture().get_image().save_png(path)
	print("%s  %s" % ["SAVED" if saved == OK else "FAIL ", path])
