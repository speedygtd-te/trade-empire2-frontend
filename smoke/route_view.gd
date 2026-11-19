extends Control
## Pictures of the route and cargo screens for review, with the routes account of
## smoke/route_flow.gd (.local/routes-account.json; run that smoke once first, it builds the
## transporter and the station): the fleet panel with its routes tab (live routes, then made-up
## samples of every state — never sent), the route editor (live quote, a rule, the pickers, a
## refused quote, editing a route), the transporter's store with cargo hold and storage modes, its
## log, and the stop sites in the colony view.
##
##   godot --path . --resolution 720x1280 res://smoke/route_view.tscn -- --out=build/routes
##
## A live route is created for the pictures when there is none (and deleted again at the end).

const ACCOUNT := "res://.local/routes-account.json"

var _out_dir := "user://routes"


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
		print("SKIP  no %s (run node tools/dev-account.cjs --account routes /v2/me)" % ACCOUNT)
		get_tree().quit(2)
		return
	var had_session := not SessionStore.new().load_token(Services.server.base).is_empty()
	var error := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	if error != null:
		print("SKIP  sign-in failed: %s" % (error.message if error.is_transport() else error.code))
		get_tree().quit(1)
		return
	await _until(func() -> bool: return Services.definitions != null, 10000)

	# The base by kind: with vehicles standing on the home body, the screen's own start choice
	# can land on one of them.
	var list := await FleetModel.list_structures()
	var base := 0
	if list.is_ok():
		var items: Array = list.data.get("items")
		for value: Variant in items:
			var summary := Wire.as_dict(value)
			if Wire.as_string(summary.get("kind")) == "base" and base == 0:
				base = Wire.as_int(summary.get("structureId"))
	var shell := await _open_shell(base)
	var colony := shell.colony()
	var fleet := colony._fleet
	await _until(func() -> bool: return fleet.loaded and fleet.routes.loaded, 15000)
	var vehicles := _vehicles(fleet)
	var transporter: int = vehicles[0]
	var station: int = vehicles[1]
	print("ROUTES  base %d, transporter %d, station %d, %d route(s)" % [base, transporter, station, fleet.routes.book.size()])
	shell.show_tab(MainShell.Tab.FLEET)
	var panel := shell.stack(MainShell.Tab.FLEET).root() as FleetPanel
	await _capture("routes_fleet_structures")
	if transporter != 0:
		panel.open_detail(transporter)
		await _capture("routes_fleet_detail")
		shell.stack(MainShell.Tab.FLEET).pop_to_root()

	# The editor for a new route (before the picture route takes the transporter): prefilled, a
	# live quote, a rule, the pickers, a refused quote.
	panel.open_route_editor(0, transporter)
	var editor := panel.editor()
	editor._draft.station_a = base
	editor._draft.station_b = station
	editor._draft.start_at = RoutePlan.A
	editor._load_stock(base)
	editor._load_stock(station)
	editor._rebuild_ends()
	editor._changed()
	await _until(func() -> bool: return editor._quote != null or editor._quote_error != null, 8000)
	await _capture("routes_editor_quote")
	editor._add_goods(RoutePlan.A, "IRON")
	await _until(func() -> bool: return editor._quote != null or editor._quote_error != null, 8000)
	await _capture("routes_editor_rule")
	editor._open_picker("goods_A")
	await _capture("routes_editor_goods")
	editor._close_picker()
	editor._open_picker("transporter")
	await _capture("routes_editor_transporter")
	editor._close_picker()
	# A refused quote: the base cannot drive.
	editor._draft.transporter_id = base
	editor._draft.station_a = transporter
	editor._draft.station_b = station
	editor._rebuild_ends()
	editor._rebuild_rules()
	editor._changed()
	await _until(func() -> bool: return editor._quote != null or editor._quote_error != null, 8000)
	await _capture("routes_editor_refused")
	print("ROUTES  refused quote says: ", editor._quote_label.text.replace("\n", " | "))
	panel._close_editor()

	shell.show_tab(MainShell.Tab.BASE)
	var made := 0
	if fleet.routes.book.size() == 0 and transporter != 0 and station != 0:
		made = await _make_route(fleet, transporter, base, station)
		await get_tree().create_timer(3.0).timeout
	var routes_now := fleet.routes.book.routes()
	if not routes_now.is_empty() and routes_now[0].station_a.has_stop:
		var stop := routes_now[0].station_a.stop
		colony._view.look_at_cell(Vector3i(stop.x, stop.y, 0))
		colony._view.zoom = 16.0
		colony._view._update_camera()
		await get_tree().create_timer(3.0).timeout
	await _capture("routes_colony_stops")
	shell.show_tab(MainShell.Tab.FLEET)
	panel._show_tab(true)
	await _capture("routes_list")
	await _samples(panel, fleet, transporter, base, station)
	var live := fleet.routes.book.routes()
	if not live.is_empty():
		panel.open_route_editor(live[0].route_id)
		await get_tree().create_timer(1.0).timeout
		await _capture("routes_editor_edit")
		panel._close_editor()
	shell.queue_free()
	await get_tree().process_frame

	# The transporter's store: cargo hold and storage modes; then its log.
	if transporter != 0:
		var vehicle := await _open_colony(transporter)
		vehicle._open_structure(ColonyScreen.Mode.STORE)
		await get_tree().create_timer(2.0).timeout
		await _capture("routes_store_cargo")
		var store := vehicle._store
		var inventory := vehicle._focus.inventory
		if inventory != null and not inventory.cargo_keys().is_empty():
			store._select(inventory.cargo_keys()[0], StorePanel.AREA_CARGO)
		else:
			store._select("URANIUM")
		store._scroll.scroll_vertical = 100000
		await _capture("routes_store_move")
		vehicle.open_details(StructureDetails.Tab.LOG)
		await get_tree().create_timer(4.0).timeout
		await _capture("routes_log")
		vehicle.queue_free()
	if made != 0:
		# The colony (and its fleet model) is gone by now: straight to the server.
		var gone := await Services.api.delete_json("/v2/routes/%d" % made)
		print("ROUTES  picture route %d deleted: %s" % [made, str(gone.data.get("deleted")) if gone.is_ok() else gone.error.code])
	if not had_session:
		await Services.session.logout()
	get_tree().quit()


## The app's shell with Base on a structure, once its store has loaded.
func _open_shell(structure_id: int) -> MainShell:
	var shell := MainShell.new()
	shell.start_structure = structure_id
	add_child(shell)
	var colony := shell.colony()
	await _until(func() -> bool: return colony._model.structure_id != 0 and colony._model.inventory != null, 20000)
	await get_tree().create_timer(4.0).timeout
	return shell


func _open_colony(structure_id: int) -> ColonyScreen:
	var colony := ColonyScreen.new()
	colony.start_structure = structure_id
	add_child(colony)
	await _until(func() -> bool: return colony._model.structure_id != 0 and colony._model.inventory != null, 20000)
	await get_tree().create_timer(4.0).timeout
	return colony


## The transporter (a vehicle with a cargo hold or storage) and another vehicle as station.
func _vehicles(fleet: FleetModel) -> Array[int]:
	var found: Array[int] = [0, 0]
	for entry: Fleet.Entry in fleet.fleet.entries():
		if not entry.can_drive():
			continue
		if entry.total_modules >= 3 and found[0] == 0:
			found[0] = entry.structure_id
		elif found[1] == 0:
			found[1] = entry.structure_id
	return found


func _make_route(fleet: FleetModel, transporter: int, base: int, station: int) -> int:
	var draft := RoutePlan.Draft.new()
	draft.name = "Iron to the outpost"
	draft.transporter_id = transporter
	draft.station_a = base
	draft.station_b = station
	draft.start_at = RoutePlan.A
	draft.rules_ab.append(RoutePlan.Rule.make("IRON", RoutePlan.INTO_CARGO, 20))
	draft.rules_ba.append(RoutePlan.Rule.make("URANIUM", RoutePlan.INTO_SUPPLY, 0))
	var created := await fleet.routes.create(draft)
	print("ROUTES  picture route: %s" % ("ok" if created.is_ok() else created.error.code))
	return Wire.as_int(created.data.get("routeId")) if created.is_ok() else 0


## Made-up routes in every state, over the live list (never sent), then the list again.
func _samples(panel: FleetPanel, fleet: FleetModel, transporter: int, base: int, station: int) -> void:
	var now := Services.clock.now_ms()
	var samples: Array[Dictionary] = []
	for index: int in 5:
		samples.append({
			"routeId": 900001 + index, "name": ["Ore shuttle", "Fuel run", "Water to the mine", "Old line", "Closing line"][index],
			"kind": "ship" if index == 1 else "ground", "transporterId": transporter,
			"stationA": {"structureId": base, "bodyId": "", "stop": {"x": 1, "y": 2}},
			"stationB": {"structureId": station, "bodyId": ""},
			"rules": {"aToB": [{"resource": "IRON", "amount": 40, "into": "transport"}], "bToA": []},
			"waypoints": {"aToB": [], "bToA": []},
			"state": ["travelling", "stalled", "paused", "travelling", "travelling"][index],
			"station": "B" if index % 2 == 0 else "A",
			"stopping": index == 3, "deleting": index == 4,
			"stallReason": "INSUFFICIENT_FUEL" if index == 1 else "",
			"retryAt": now + 240000 if index == 1 else 0,
			"nextArrivalAt": now + 95000 if index == 0 else 0,
			"cargo": {"forA": [], "forB": [{"resource": "IRON", "amount": 40000000}] if index == 0 else []},
			"stats": {"cycles": 3 * index, "trips": 6 * index + 1,
				"delivered": [{"resource": "IRON", "amount": 120000000 * index}] if index > 0 else []},
			"createdAt": now - 3600000,
		})
	for sample: Dictionary in samples:
		fleet.routes.book.put(RoutePlan.Route.from_wire(sample))
	fleet.routes.changed.emit()
	print("SAMPLE  route list with made-up routes (not from the server)")
	await _capture("routes_list_sample")
	var scroll: ScrollContainer = null
	for child: Node in panel._routes.get_children():
		if child is ScrollContainer:
			scroll = child as ScrollContainer
	if scroll != null:
		scroll.scroll_vertical = 820
		await _capture("routes_list_sample_waiting")
		scroll.scroll_vertical = 100000
		await _capture("routes_list_sample_end")
		scroll.scroll_vertical = 0
	panel._routes._on_delete(900001)
	await _capture("routes_list_delete_armed")
	panel._routes._armed = 0
	for sample: Dictionary in samples:
		fleet.routes.book.remove(Wire.as_int(sample.get("routeId")))
	fleet.routes.changed.emit()


func _until(condition: Callable, timeout_ms: int = 8000) -> void:
	var deadline := Time.get_ticks_msec() + timeout_ms
	while Time.get_ticks_msec() < deadline and not condition.call():
		await get_tree().process_frame


func _capture(file_name: String) -> void:
	await get_tree().create_timer(0.8).timeout
	await RenderingServer.frame_post_draw
	var path := "%s/%s.png" % [_out_dir, file_name]
	var saved := get_viewport().get_texture().get_image().save_png(path)
	print("%s  %s" % ["SAVED" if saved == OK else "FAIL ", path])
