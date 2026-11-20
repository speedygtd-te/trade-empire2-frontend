extends Control
## Pictures of the fleet screens (draft.33) for review, live with the fleets account of
## smoke/fleet_flow.gd (.local/fleets-account.json; run that smoke once first, it builds the two
## ships): the Fleet tab with its fleets, forming a fleet (ships picked), the fleet (ships,
## shared supply, stance, disband armed), the quote of a joint flight into orbit, a member's
## details (locked), and — while a fleet flies (run it during fleet_flow's flight) — the flight
## with its countdown. Starts nothing; a fleet formed for the pictures is disbanded at the end.
##
##   godot --path . --resolution 720x1280 res://smoke/fleet_view.tscn -- --out=build/fleets

const ACCOUNT := "res://.local/fleets-account.json"

var _out_dir := "user://fleets"


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
		print("SKIP  no %s (run tools\\colony-smoke.ps1 -Scene fleet_flow once)" % ACCOUNT)
		get_tree().quit(2)
		return
	var error := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	if error != null:
		print("SKIP  sign-in failed: %s" % (error.message if error.is_transport() else error.code))
		get_tree().quit(1)
		return
	await _until(func() -> bool: return Services.definitions != null, 10000)
	var shell := MainShell.new()
	add_child(shell)
	await _until(func() -> bool: return shell.colony()._model.inventory != null, 20000)
	await get_tree().create_timer(3.0).timeout
	var fleet := shell.colony()._fleet
	await _until(func() -> bool: return fleet.loaded, 20000)
	shell.show_tab(MainShell.Tab.FLEET)
	var stack := shell.stack(MainShell.Tab.FLEET)
	var panel := stack.root() as FleetPanel

	var made := 0
	var candidates := fleet.groups.candidates(fleet.fleet, "", Services.clock.now_ms())
	if fleet.groups.size() == 0 and candidates.size() >= 2:
		var create := panel.open_group_create()
		await get_tree().create_timer(1.0).timeout
		await _capture("fleets_create_empty")
		create.toggle(candidates[0].structure_id)
		create.toggle(candidates[1].structure_id)
		await _capture("fleets_create_picked")
		stack.pop_to_root()
		var formed := await fleet.create_group("Picture fleet", PackedInt64Array([candidates[0].structure_id, candidates[1].structure_id]))
		made = Wire.as_int(formed.data.get("fleetId")) if formed.is_ok() else 0
		print("VIEW  picture fleet %d formed (%s)" % [made, "ok" if formed.is_ok() else formed.error.code])
		await get_tree().create_timer(1.0).timeout
	await _capture("fleets_tab")

	var groups := fleet.groups.groups()
	if not groups.is_empty():
		var group := groups[0]
		var detail := panel.open_group(group.fleet_id)
		await get_tree().create_timer(1.0).timeout
		await _capture("fleets_detail_route" if group.is_on_route() else ("fleets_detail_flying" if group.has_command() else "fleets_detail"))
		if not group.has_command():
			detail._scroll_to_end()
			detail._on_disband()
			await _capture("fleets_detail_disband_armed")
			detail._disband_armed = false
			detail._on_aggressive()
			await _capture("fleets_detail_aggressive_armed")
			detail._aggressive_armed = false
			detail._update()
			if group.is_together():
				detail.show_flight(group.location_body_id)
				await _until(func() -> bool: return detail.quote_panel().quote() != null, 10000)
				await _capture("fleets_flight_quote")
				var quote := detail.quote_panel().quote()
				if quote != null:
					print("VIEW  quote ok %s, errors %s, launch %s" % [quote.trip.ok, quote.trip.errors, TimeFormat.duration(quote.trip.launch_ms())])
				detail.quote_panel()._on_start()
				await _capture("fleets_flight_armed")
				detail.quote_panel()._armed = false
				detail._close_flight()
		stack.pop_to_root()
		panel.open_detail(group.members[0].structure_id)
		await get_tree().create_timer(1.0).timeout
		await _capture("fleets_member_locked")
		stack.pop_to_root()
		# Routes (draft.35): the list with a fleet route, and a new route run by a resting fleet.
		await _until(func() -> bool: return fleet.routes.loaded, 10000)
		panel._show_tab(FleetPanel.TAB_ROUTES)
		await _capture("fleets_routes")
		panel._show_tab(FleetPanel.TAB_STRUCTURES)
		if not group.has_command():
			var base := shell.colony()._model.structure_id
			var station_b := 0
			for entry: Fleet.Entry in fleet.fleet.entries():
				if entry.structure_id != base and not group.has_member(entry.structure_id) \
						and not entry.is_moving(Services.clock.now_ms()):
					station_b = entry.structure_id
					break
			panel.open_route_editor(0, 0, group.fleet_id)
			var editor := panel.editor()
			editor._open_picker("transporter")
			await _capture("fleets_route_editor_picker")
			editor._close_picker()
			editor._draft.station_a = base
			editor._draft.station_b = station_b
			editor._load_stock(base)
			editor._add_goods(RoutePlan.A, "HYDROGEN")
			editor._on_into()
			editor._rebuild_ends()
			editor._changed()
			await _until(func() -> bool: return editor._quote != null or editor._quote_error != null, 10000)
			await _capture("fleets_route_editor_quote")
			print("VIEW  route quote: ", editor._quote_label.text.replace("\n", " | "))
			stack.pop_to_root()
	if made != 0:
		var gone := await fleet.dissolve_group(made)
		print("VIEW  picture fleet disbanded: %s" % ("ok" if gone.is_ok() else gone.error.code))
	get_tree().quit()


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
